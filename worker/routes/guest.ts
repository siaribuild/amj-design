// /api/guest — anonymous, read-only order tracking (blueprint's two-step flow).
//
//   request { email, ref } -> always-neutral response; a code is emailed only on
//   a match (OWASP anti-enumeration). verify { email, ref, code } -> a scoped,
//   short-lived guest_grant token, delivered as an httpOnly SESSION cookie.
//   record -> which record that session covers; the record itself is read through
//   the ordinary customer endpoints, which accept the same session.
import { Hono } from "hono";
import type { Env } from "../types";
import { GUEST_COOKIE, guestCookie, clearGuestCookie, newToken, parseCookies, uuid } from "../lib/util";
import {
  challengeAllowed, consumeChallenge, guestTrackChallenge, isDevEnv, isEmail, normEmail,
  sixDigit, storeChallenge, withinCap,
} from "../lib/auth";
import { sourceIp } from "../lib/captcha";
import { notify } from "../lib/email";
import { orderDto, type OrderRow } from "../lib/orders";
import { loadLines, loadProjectFiles } from "./projects";

export const guest = new Hono<{ Bindings: Env }>();

// Clipped for the same reason normEmail is (see lib/auth.ts): both halves become
// a KV key. Workers KV rejects a key over 512 bytes by THROWING, which would turn
// this deliberately neutral endpoint's 200 into a 500 — itself an oracle. No real
// reference comes close to 64 characters.
const normRef = (r: unknown) => String(r ?? "").trim().toUpperCase().slice(0, 64);

// Per-SOURCE ceiling on code guessing, the same division of labour the sign-in
// path already draws (lib/auth.ts): this bounds one client grinding across MANY
// targets, while the attempt cap inside consumeChallenge bounds guesses against
// any ONE target and is the control that actually protects the secret. Neither
// substitutes for the other. Generous, because CGNAT puts many real people
// behind one address and a locked-out customer is worse than a slowed bot.
const MAX_GUEST_VERIFY_PER_IP = 60;
const GUEST_VERIFY_IP_WINDOW = 60 * 60; // seconds

// Resolve a customer-quotable reference to the record behind it, gated on the
// email that owns it. Two things this must get right, both previously wrong:
//
//  • BOTH reference formats. The submission email hands the customer their QUOTE
//    reference (project.public_ref, "OF-Q-NNNNN") and tells them to track with
//    it — but an "order" row only exists once an issued quote is accepted, so a
//    quote in review could never be found. Order numbers ("OF-NNNNN") still work.
//  • The ANONYMOUS email. Matching only user.email meant anonymous submitters —
//    who have no user row at all, so the LEFT JOIN yields NULL — could never
//    match any reference. Their address lives on project.contact_email.
//
// When a project has progressed to an order, the order wins: it is the richer
// view and the one the customer is more likely to be asking about.
type GuestMatch = { kind: "project" | "order"; id: string; projectId: string };

async function matchRecord(env: Env, ref: string, email: string): Promise<GuestMatch | null> {
  const row = await env.DB.prepare(
    `SELECT p.id AS project_id, o.id AS order_id
       FROM project p
       LEFT JOIN user u ON u.id = p.owner_user_id
       LEFT JOIN "order" o ON o.project_id = p.id
      WHERE (p.public_ref = ? OR o.order_no = ?)
        AND (lower(p.contact_email) = ? OR lower(u.email) = ?)
      ORDER BY o.created_at DESC
      LIMIT 1`,
  ).bind(ref, ref, email, email).first<{ project_id: string; order_id: string | null }>();
  if (!row) return null;
  return row.order_id
    ? { kind: "order", id: row.order_id, projectId: row.project_id }
    : { kind: "project", id: row.project_id, projectId: row.project_id };
}

// POST /api/guest/track/request { email, ref } — neutral; emails a code on match.
guest.post("/track/request", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(body?.email);
  const ref = normRef(body?.ref);
  const neutral = { ok: true } as const;
  if (!isEmail(email) || !ref) return c.json(neutral);

  // Issuance limits, shared with the sign-in path rather than hand-rolled here.
  // This replaces a bespoke `grl:` key that enforced only a 60s cooldown, and it
  // tightens the flow in two ways that matter: the per-window cap bounds how fast
  // a burned challenge can be replaced (re-issuing was the reason the guess
  // budget was unbounded — see the attempt cap in consumeChallenge), and the
  // cooldown now refuses to overwrite a code that is still live, so an attacker
  // requesting a code can no longer invalidate the real customer's.
  const ch = guestTrackChallenge(email, ref);
  if (!(await challengeAllowed(c.env, ch))) return c.json(neutral);

  const match = await matchRecord(c.env, ref, email);
  let devCode: string | undefined;
  if (match) {
    const code = sixDigit();
    await storeChallenge(c.env, ch, code);
    // "quote" or "order" — the customer entered one of two reference formats and
    // the copy should match what they typed.
    const noun = match.kind === "order" ? "order" : "quote";
    await notify(c.env, {
      recipient: email,
      eventType: "guest.track.requested",
      templateKey: "guest_track_code",
      vars: { type: noun, ref, code },
      email: { to: email, subject: `Tracking code for ${ref}`, text: `Your tracking code for ${noun} ${ref} is ${code}. It expires in 10 minutes.` },
    });
    if (isDevEnv(c.env)) devCode = code;
  }
  return c.json(devCode ? { ok: true, devCode } : neutral);
});

// POST /api/guest/track/verify { email, ref, code } — returns a scoped token.
guest.post("/track/verify", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(body?.email);
  const ref = normRef(body?.ref);
  const code = String(body?.code ?? "").trim();
  if (!isEmail(email) || !ref || !/^\d{6}$/.test(code)) return c.json({ error: "invalid" }, 400);

  // 429 before anything is read: like the sign-in challenge's source cap, this
  // says something about the CALLER and nothing about whether the email, the
  // reference or the code was right, so it adds no oracle the neutral 400 was
  // protecting against.
  if (!(await withinCap(c.env, `gvip:${sourceIp(c.req.raw)}`, MAX_GUEST_VERIFY_PER_IP, GUEST_VERIFY_IP_WINDOW))) {
    return c.json({ error: "rate_limited" }, 429);
  }

  // Counts the attempt and burns the challenge at the cap. Every failure — wrong
  // code, no code stored, already capped — comes back as one indistinguishable
  // 400, which is what keeps this from telling an attacker where they are.
  if (!(await consumeChallenge(c.env, guestTrackChallenge(email, ref), code))) {
    return c.json({ error: "invalid" }, 400);
  }

  const match = await matchRecord(c.env, ref, email);
  if (!match) return c.json({ error: "invalid" }, 400);

  const token = newToken();
  await c.env.DB.prepare(
    "INSERT INTO guest_grant (id, record_type, record_id, email, token, expires_at) VALUES (?, ?, ?, ?, ?, datetime('now','+12 hours'))",
  ).bind(uuid(), match.kind, match.id, email, token).run();
  // The grant travels as an httpOnly SESSION cookie, never in a URL. It now
  // authorises actions on the record, and a token in a path leaks through server
  // logs, Referer headers, browser history and any pasted link. No Max-Age, so
  // closing the browser ends it regardless of the server-side window.
  c.header("Set-Cookie", guestCookie(token, c.env));
  return c.json({ ok: true });
});

// POST /api/guest/signout — drop the guest session (shared machines).
guest.post("/signout", (c) => {
  c.header("Set-Cookie", clearGuestCookie(c.env));
  return c.json({ ok: true });
});

// GET /api/guest/record — WHICH record this session covers, nothing more.
// The record itself is fetched through the ordinary customer endpoints, which
// now accept a guest session: one payload, one view, no second copy of either to
// keep in step.
guest.get("/record", async (c) => {
  const cookie = parseCookies(c.req.raw.headers.get("Cookie"))[GUEST_COOKIE];
  const grant = cookie ? await c.env.DB
    .prepare("SELECT record_type, record_id FROM guest_grant WHERE token = ? AND expires_at > datetime('now')")
    .bind(cookie).first<{ record_type: string; record_id: string }>() : null;
  if (!grant) return c.json({ error: "not_found" }, 404);

  if (grant.record_type === "order") return c.json({ kind: "order", id: grant.record_id });

  // A project that has since become an order points at the order — the richer
  // record, and the one the customer is asking about by then.
  const o = await c.env.DB.prepare('SELECT id FROM "order" WHERE project_id = ?')
    .bind(grant.record_id).first<{ id: string }>();
  if (o) return c.json({ kind: "order", id: o.id });

  const p = await c.env.DB.prepare("SELECT status_customer FROM project WHERE id = ?")
    .bind(grant.record_id).first<{ status_customer: string }>();
  if (!p) return c.json({ error: "not_found" }, 404);
  return c.json({ kind: "project", id: grant.record_id, status: p.status_customer });
});
