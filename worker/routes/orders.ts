// /api/orders — customer order tracking + the two customer sign-off gates, plus
// staff seams (payment received, fulfilment advance) the ops console will drive.
import { Hono } from "hono";
import type { Env } from "../types";
import { resolveUser } from "../lib/auth";
import { orderDto, TRANSITIONS, type OrderRow } from "../lib/orders";

export const orders = new Hono<{ Bindings: Env }>();

// An order is the customer's if its project is owned by the signed-in user.
async function ownedOrder(env: Env, req: Request, orderId: string): Promise<OrderRow | null> {
  const user = await resolveUser(env, req);
  if (!user) return null;
  return env.DB
    .prepare('SELECT o.* FROM "order" o JOIN project p ON p.id = o.project_id WHERE o.id = ? AND p.owner_user_id = ?')
    .bind(orderId, user.id)
    .first<OrderRow>();
}

async function isStaff(env: Env, req: Request): Promise<boolean> {
  if (env.APP_ENV !== "production") return true;
  const user = await resolveUser(env, req);
  return user?.type === "internal";
}

async function applyTransition(env: Env, order: OrderRow, action: string): Promise<string | null> {
  const t = TRANSITIONS[action];
  if (!t) return "unknown_action";
  if (order.stage !== t.from) return "stage_conflict";
  const stampSql = t.stamp ? `, ${t.stamp} = datetime('now')` : "";
  await env.DB.prepare(`UPDATE "order" SET stage = ?${stampSql}, updated_at = datetime('now') WHERE id = ?`).bind(t.to, order.id).run();
  if (t.invoiceBalance) {
    await env.DB.prepare("UPDATE payment SET invoiced_at = datetime('now') WHERE order_id = ? AND kind = 'balance'").bind(order.id).run();
  }
  return null;
}

// GET /api/orders — the signed-in customer's orders (summary).
orders.get("/", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  if (!user) return c.json({ orders: [] });
  const { results } = await c.env.DB
    .prepare('SELECT o.* FROM "order" o JOIN project p ON p.id = o.project_id WHERE p.owner_user_id = ? ORDER BY o.created_at DESC')
    .bind(user.id).all<OrderRow>();
  return c.json({ orders: await Promise.all(results.map((o) => orderDto(c.env, o))) });
});

// GET /api/orders/:id — full order detail (stage, payments, lines).
orders.get("/:id", async (c) => {
  const order = await ownedOrder(c.env, c.req.raw, c.req.param("id"));
  if (!order) return c.json({ error: "not_found" }, 404);
  const { results: lines } = await c.env.DB
    .prepare("SELECT external_ref, product_snapshot_json, qty, line_total FROM order_line WHERE order_id = ?")
    .bind(order.id).all();
  return c.json({ order: { ...(await orderDto(c.env, order)), lines } });
});

// POST /api/orders/:id/confirm-drawings — CUSTOMER gate (step 7).
orders.post("/:id/confirm-drawings", async (c) => {
  const order = await ownedOrder(c.env, c.req.raw, c.req.param("id"));
  if (!order) return c.json({ error: "not_found" }, 404);
  const err = await applyTransition(c.env, order, "confirm-drawings");
  if (err) return c.json({ error: err }, 409);
  const fresh = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(order.id).first<OrderRow>();
  return c.json({ order: await orderDto(c.env, fresh!) });
});

// POST /api/orders/:id/confirm-qa — CUSTOMER gate (step 11).
orders.post("/:id/confirm-qa", async (c) => {
  const order = await ownedOrder(c.env, c.req.raw, c.req.param("id"));
  if (!order) return c.json({ error: "not_found" }, 404);
  const err = await applyTransition(c.env, order, "confirm-qa");
  if (err) return c.json({ error: err }, 409);
  const fresh = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(order.id).first<OrderRow>();
  return c.json({ order: await orderDto(c.env, fresh!) });
});

// ── Staff seams (ops-console-owned later) ────────────────────────────────────

// POST /api/orders/:id/advance { action } — a staff fulfilment transition.
orders.post("/:id/advance", async (c) => {
  if (!(await isStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const order = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(c.req.param("id")).first<OrderRow>();
  if (!order) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  if (TRANSITIONS[action]?.side !== "staff") return c.json({ error: "not_staff_action" }, 400);
  const err = await applyTransition(c.env, order, action);
  if (err) return c.json({ error: err }, 409);
  const fresh = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(order.id).first<OrderRow>();
  return c.json({ order: await orderDto(c.env, fresh!) });
});

// POST /api/orders/:id/pay { kind } — staff records a manual payment.
orders.post("/:id/pay", async (c) => {
  if (!(await isStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const order = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(c.req.param("id")).first<OrderRow>();
  if (!order) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const kind = body?.kind === "balance" ? "balance" : "deposit";
  const expectFrom = kind === "deposit" ? "deposit_invoiced" : "balance_invoiced";
  const to = kind === "deposit" ? "deposit_paid" : "balance_paid";
  if (order.stage !== expectFrom) return c.json({ error: "stage_conflict", stage: order.stage }, 409);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE payment SET status = 'paid', paid_at = datetime('now'), reference = ? WHERE order_id = ? AND kind = ?")
      .bind(typeof body?.reference === "string" ? body.reference : null, order.id, kind),
    c.env.DB.prepare('UPDATE "order" SET stage = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(to, order.id),
  ]);
  const fresh = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(order.id).first<OrderRow>();
  return c.json({ order: await orderDto(c.env, fresh!) });
});
