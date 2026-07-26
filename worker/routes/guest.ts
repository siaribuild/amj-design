// /api/guest — anonymous, read-only order tracking (blueprint's two-step flow).
//
//   request { email, ref } -> always-neutral response; a code is emailed only on
//   a match (OWASP anti-enumeration). verify { email, ref, code } -> a scoped,
//   short-lived guest_grant token. records/{token} -> a read-only order view.
import { Hono } from "hono";
import type { Env } from "../types";
import { newToken, uuid } from "../lib/util";
import { isDevEnv, isEmail, normEmail, sha256hex, sixDigit } from "../lib/auth";
import { notify } from "../lib/email";
import { orderDto, type OrderRow } from "../lib/orders";

export const guest = new Hono<{ Bindings: Env }>();

const normRef = (r: unknown) => String(r ?? "").trim().toUpperCase();
const codeHash = (email: string, ref: string, code: string) => sha256hex(`${email}:${ref}:${code}`);

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

  // Light rate limit: one code per email+ref per 60s (KV min TTL).
  const rl = `grl:${email}:${ref}`;
  if (await c.env.KV.get(rl)) return c.json(neutral);
  await c.env.KV.put(rl, "1", { expirationTtl: 60 });

  const match = await matchRecord(c.env, ref, email);
  let devCode: string | undefined;
  if (match) {
    const code = sixDigit();
    await c.env.KV.put(`gcode:${email}:${ref}`, await codeHash(email, ref, code), { expirationTtl: 600 });
    // "quote" or "order" — the customer entered one of two reference formats and
    // the copy should match what they typed.
    const noun = match.kind === "order" ? "order" : "quote";
    await notify(c.env, {
      recipient: email,
      eventType: "guest.track.requested",
      templateKey: "guest_track_code",
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

  const stored = await c.env.KV.get(`gcode:${email}:${ref}`);
  if (!stored || stored !== (await codeHash(email, ref, code))) return c.json({ error: "invalid" }, 400);
  await c.env.KV.delete(`gcode:${email}:${ref}`);

  const match = await matchRecord(c.env, ref, email);
  if (!match) return c.json({ error: "invalid" }, 400);

  const token = newToken();
  await c.env.DB.prepare(
    "INSERT INTO guest_grant (id, record_type, record_id, email, token, expires_at) VALUES (?, ?, ?, ?, ?, datetime('now','+30 minutes'))",
  ).bind(uuid(), match.kind, match.id, email, token).run();
  return c.json({ token });
});

// GET /api/guest/records/:token — read-only view for a valid grant. An accepted
// project resolves to its order; one still in review returns the quote instead,
// which is all that exists at that point.
guest.get("/records/:token", async (c) => {
  const grant = await c.env.DB
    .prepare("SELECT * FROM guest_grant WHERE token = ? AND expires_at > datetime('now')")
    .bind(c.req.param("token")).first<{ record_id: string; record_type: string }>();
  if (!grant) return c.json({ error: "not_found" }, 404);

  if (grant.record_type === "order") {
    const order = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(grant.record_id).first<OrderRow>();
    if (!order) return c.json({ error: "not_found" }, 404);
    return c.json({ order: await orderDto(c.env, order) });
  }

  // Pre-order: status only. NO prices — an estimate that has not been through
  // technical review must not be presented to the customer as a figure to rely
  // on, and this view has no way to caveat it.
  // NOTE: project has no submitted_at column — updated_at is the closest thing,
  // and it is what moved when the status became "submitted".
  const p = await c.env.DB.prepare(
    `SELECT id, public_ref, title, status_customer, contact_name, updated_at, created_at
       FROM project WHERE id = ?`,
  ).bind(grant.record_id).first<{
    id: string; public_ref: string | null; title: string | null; status_customer: string;
    contact_name: string | null; updated_at: string | null; created_at: string;
  }>();
  if (!p) return c.json({ error: "not_found" }, 404);

  const counts = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM quote_line WHERE project_id = ?) AS lines,
            (SELECT COUNT(*) FROM file_asset WHERE project_id = ?) AS files`,
  ).bind(p.id, p.id).first<{ lines: number; files: number }>();

  return c.json({
    quote: {
      ref: p.public_ref ?? p.id,
      title: p.title,
      status: p.status_customer,
      contactName: p.contact_name,
      submittedAt: p.updated_at ?? p.created_at,
      lineCount: counts?.lines ?? 0,
      fileCount: counts?.files ?? 0,
    },
  });
});
