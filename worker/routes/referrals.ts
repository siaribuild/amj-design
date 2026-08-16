// /api — the referral program's customer and public surfaces. Routes stay thin;
// the rules live in worker/lib/referrals.ts.
import { Hono } from "hono";
import type { Env } from "../types";
import { resolveUser } from "../lib/auth";
import { ensureReferralCode, payoutComplete, payoutMissing, recordReferral, savePayoutDetails } from "../lib/referrals";

export const referrals = new Hono<{ Bindings: Env }>();

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
  return c.json({
    referrerGate: { complete: payoutComplete(user), missing: payoutMissing(user) },
    // WITHHELD, never issued-inactive: until the details exist there is no code
    // to click, read out, or set a cookie from.
    code: user ? await ensureReferralCode(c.env, user) : null,
  });
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
