// /api/guest — anonymous, read-only order tracking (blueprint's two-step flow).
//
//   request { email, ref } -> always-neutral response; a code is emailed only on
//   a match (OWASP anti-enumeration). verify { email, ref, code } -> a scoped,
//   short-lived guest_grant token. records/{token} -> a read-only order view.
import { Hono } from "hono";
import type { Env } from "../types";
import { newToken, uuid } from "../lib/util";
import { isEmail, normEmail, sha256hex, sixDigit } from "../lib/auth";
import { notify } from "../lib/email";
import { orderDto, type OrderRow } from "../lib/orders";

export const guest = new Hono<{ Bindings: Env }>();

const normRef = (r: unknown) => String(r ?? "").trim().toUpperCase();
const codeHash = (email: string, ref: string, code: string) => sha256hex(`${email}:${ref}:${code}`);

// Find an order by its number, gated on the owner's email (case-insensitive).
function matchOrder(env: Env, ref: string, email: string) {
  return env.DB.prepare(
    `SELECT o.* FROM "order" o JOIN project p ON p.id = o.project_id
       LEFT JOIN user u ON u.id = p.owner_user_id
      WHERE o.order_no = ? AND lower(u.email) = ?`,
  ).bind(ref, email).first<OrderRow>();
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

  const order = await matchOrder(c.env, ref, email);
  let devCode: string | undefined;
  if (order) {
    const code = sixDigit();
    await c.env.KV.put(`gcode:${email}:${ref}`, await codeHash(email, ref, code), { expirationTtl: 600 });
    await notify(c.env, {
      recipient: email,
      eventType: "guest.track.requested",
      templateKey: "guest_track_code",
      email: { to: email, subject: `Tracking code for ${ref}`, text: `Your tracking code for order ${ref} is ${code}. It expires in 10 minutes.` },
    });
    if (c.env.APP_ENV !== "production") devCode = code;
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

  const order = await matchOrder(c.env, ref, email);
  if (!order) return c.json({ error: "invalid" }, 400);

  const token = newToken();
  await c.env.DB.prepare(
    "INSERT INTO guest_grant (id, record_type, record_id, email, token, expires_at) VALUES (?, 'order', ?, ?, ?, datetime('now','+30 minutes'))",
  ).bind(uuid(), order.id, email, token).run();
  return c.json({ token });
});

// GET /api/guest/records/:token — read-only order view for a valid grant.
guest.get("/records/:token", async (c) => {
  const grant = await c.env.DB
    .prepare("SELECT * FROM guest_grant WHERE token = ? AND expires_at > datetime('now')")
    .bind(c.req.param("token")).first<{ record_id: string }>();
  if (!grant) return c.json({ error: "not_found" }, 404);
  const order = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(grant.record_id).first<OrderRow>();
  if (!order) return c.json({ error: "not_found" }, 404);
  return c.json({ order: await orderDto(c.env, order) });
});
