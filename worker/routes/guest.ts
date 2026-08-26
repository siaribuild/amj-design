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

// Not length-clipped, deliberately. An earlier revision clipped it because the
// reference was part of a KV key and Workers KV throws above 512 bytes, turning
// this neutral endpoint's 200 into a 500. The challenge is now keyed on the
// resolved project (see guestTrackChallenge), so the reference reaches only a D1
// bind parameter, and the outbound email only ever quotes a reference that
// matched a row exactly — which is a database value, not an attacker's string.
// A clip here would now guard nothing and no test could tell if it were removed.
const normRef = (r: unknown) => String(r ?? "").trim().toUpperCase();

// Per-SOURCE ceiling on code guessing, the same division of labour the sign-in
// path already draws (lib/auth.ts): this bounds one client grinding across MANY
// targets, while the attempt cap inside consumeChallenge bounds guesses against
// any ONE target. Neither substitutes for the other. Generous, because CGNAT
// puts many real people behind one address and a locked-out customer is worse
// than a slowed bot.
//
// This cap is NOT a backstop for the attempt cap's concurrency weakness. It is
// the same read-modify-write over KV (see withinCap, whose own comment calls it
// "a ceiling on sustained abuse, not a mutex"), so overlapping requests can slip
// it in exactly the same way. Both numbers here — 60/hour per source, 25 per
// window per record — bound a SERIAL attacker only. Nothing on this path is
// concurrency-safe; see MAX_OTP_ATTEMPTS for the shape that would be.
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

  // Resolve the record BEFORE the issuance gate, so the budget belongs to the
  // record rather than to the string that was typed at it (see
  // guestTrackChallenge). A miss stops here: it writes nothing, which also means
  // an unauthenticated probe can no longer make this endpoint store KV state.
  //
  // ACCEPTED COST, and it grew: this widens the timing difference between a hit
  // and a miss, because a miss now returns before any KV work where the issuance
  // gate used to run on both paths. Measured locally 2026-08-26 at 1.29× (15.9ms
  // vs 20.5ms), against 1.15× before the reorder — and that is with a no-op mail
  // transport, so production is larger still, since only the hit path awaits an
  // actual send. The endpoint's neutrality was always a response-content
  // property rather than a constant-time one; this makes the existing gap wider,
  // not new. Closing it means not awaiting the send, which is a different change.
  const match = await matchRecord(c.env, ref, email);
  if (!match) return c.json(neutral);

  // Issuance limits, shared with the sign-in path rather than hand-rolled here.
  // This replaces a bespoke `grl:` key that enforced only a 60s cooldown, and it
  // tightens the flow in two ways that matter: the per-window cap bounds how fast
  // a burned challenge can be replaced (re-issuing was the reason the guess
  // budget was unbounded — see the attempt cap in consumeChallenge), and the
  // cooldown now refuses to overwrite a code that is still live, so an attacker
  // requesting a code can no longer invalidate the real customer's.
  const ch = guestTrackChallenge(email, match.projectId);
  if (!(await challengeAllowed(c.env, ch))) return c.json(neutral);

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
  return c.json(isDevEnv(c.env) ? { ok: true, devCode: code } : neutral);
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

  // Resolve first, for the same reason as issuance: the challenge belongs to the
  // record, so both of its references have to reach the one challenge and the
  // one attempt counter. A miss and a wrong code are the same neutral 400.
  const match = await matchRecord(c.env, ref, email);
  if (!match) return c.json({ error: "invalid" }, 400);

  // Counts the attempt and burns the challenge at the cap. Every failure — wrong
  // code, no code stored, already capped — comes back as one indistinguishable
  // 400, which is what keeps this from telling an attacker where they are.
  if (!(await consumeChallenge(c.env, guestTrackChallenge(email, match.projectId), code))) {
    return c.json({ error: "invalid" }, 400);
  }

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
