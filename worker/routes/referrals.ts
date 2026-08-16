// /api — the referral program's customer and public surfaces. Routes stay thin;
// the rules live in worker/lib/referrals.ts.
import { Hono } from "hono";
import type { Env } from "../types";
import { resolveUser } from "../lib/auth";
import { ensureReferralCode, leaveProgram, payoutComplete, payoutMissing, publicProgram, recordReferral, referralOffer, referrerScreen, savePayoutDetails } from "../lib/referrals";

export const referrals = new Hono<{ Bindings: Env }>();

// PUBLIC — no auth. The landing page is read by strangers, and every figure in
// its copy comes from here rather than from a typed string. That is what makes
// the ops config screen's promise true: change the rate there and the site
// advertises the new one, with no deploy and no copy edit.
referrals.get("/referral/program", async (c) => {
  return c.json({ program: await publicProgram(c.env) });
});

// The REFERRER's screen. Under D18, "details missing" is the primary entry state
// for every new referrer rather than an error, so this answers "where are you in
// joining?" before it answers anything about money.
referrals.get("/account/referrals", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  // Staff are excluded on a DIFFERENT AXIS from payability, and the separation is
  // deliberate: a staff member may hold a perfectly valid ABN and bank account and
  // is still not a referrer. Widening payoutComplete to cover this would blur a
  // predicate that reads four detail fields and nothing else — the shape A18, and
  // through it ACL s 49, depends on. Refused before ensureReferralCode so no code
  // is ever minted into a staff row.
  if (user?.type === "internal") return c.json({ error: "forbidden" }, 403);
  // Authed, per §10.2. It answered an anonymous caller 200 with an empty gate:
  // no leak — there is nothing in that shape — but an account endpoint saying it
  // served someone who has no account, and the branch behind it carried
  // `user ? … : null` arms that only ran when `user` was already null.
  if (!user) return c.json({ error: "unauthorised" }, 401);
  return c.json(await referrerScreen(c.env, user, new URL(c.req.url).origin));
});

// Manual code entry — the referred side. Half of these introductions happen on a
// job site: B reads the code out, A types it in later. A link-only program loses
// every one of those.
referrals.post("/account/referrals/claim", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "unauthorised" }, 401);
  const body = await c.req.json<{ code?: string }>().catch(() => ({ code: "" }));
  const recorded = await recordReferral(c.env, {
    referredUser: user,
    code: String(body.code ?? ""),
    source: "manual",
  });
  if (recorded.ok === false) return c.json({ error: recorded.error }, 400);
  return c.json({ ok: true });
});

// The ENTRY step, under D18 — not a payout-time detail. Completing these is how a
// referrer joins, so this answers with the gate rather than with a bare ok: the
// screen that called it needs to know whether a code now exists.
referrals.put("/account/payout-details", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "unauthorised" }, 401);
  if (user.type === "internal") return c.json({ error: "forbidden" }, 403);
  const saved = await savePayoutDetails(c.env, user, await c.req.json().catch(() => ({})));
  if (saved.ok === false) return c.json({ error: saved.error }, 400);
  // Re-read: savePayoutDetails wrote the columns, and the gate is computed from
  // them. Answering from the stale request-time row would report the gate the
  // caller had BEFORE their own save.
  const fresh = await c.env.DB.prepare("SELECT * FROM user WHERE id = ?").bind(user.id).first<typeof user>();
  return c.json({ referrerGate: { complete: payoutComplete(fresh), missing: payoutMissing(fresh) } });
});

// Leaving the program IS clearing the account we would pay into — membership is
// having payout details, so there is nothing else to end.
referrals.delete("/account/payout-details", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "unauthorised" }, 401);
  const left = await leaveProgram(c.env, user);
  if (left.ok === false) return c.json({ error: left.error, amount: left.amount }, 409);
  const fresh = await c.env.DB.prepare("SELECT * FROM user WHERE id = ?").bind(user.id).first<typeof user>();
  return c.json({ referrerGate: { complete: payoutComplete(fresh), missing: payoutMissing(fresh) } });
});

// The REFERRED tradie's panel. Their own discount, from their side — derived, so
// it cannot go stale, and read from the promise rather than from the switch.
referrals.get("/account/referral-offer", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "unauthorised" }, 401);
  return c.json({ offer: await referralOffer(c.env, user.id) });
});
