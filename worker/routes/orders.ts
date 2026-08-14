// /api/orders — customer order tracking + the two customer sign-off gates, plus
// staff seams (payment received, fulfilment advance) the ops console will drive.
import { Hono } from "hono";
import type { Env } from "../types";
import { resolveUser } from "../lib/auth";
import { isStaff } from "../lib/staff";
import { guestGrantProjectId } from "../lib/access";
import { orderDto, orderLines, applyTransition, markPaid, TRANSITIONS, type OrderRow } from "../lib/orders";

export const orders = new Hono<{ Bindings: Env }>();

// An order is the customer's if its project is owned by the signed-in user.
// An order belongs to a signed-in owner, OR to a guest who verified an emailed
// code against the record. Registered-only was a dead end: an anonymous customer
// whose quote became an order could not sign off drawings or confirm delivery —
// steps the process REQUIRES of them — so their order simply stalled. The claim
// cookie is deliberately not accepted here; an order is a committed record.
async function ownedOrder(env: Env, req: Request, orderId: string): Promise<OrderRow | null> {
  const user = await resolveUser(env, req);
  if (user) {
    const owned = await env.DB
      .prepare('SELECT o.* FROM "order" o JOIN project p ON p.id = o.project_id WHERE o.id = ? AND p.owner_user_id = ?')
      .bind(orderId, user.id)
      .first<OrderRow>();
    if (owned) return owned;
  }
  const grantProjectId = await guestGrantProjectId(env, req);
  if (!grantProjectId) return null;
  return env.DB
    .prepare('SELECT o.* FROM "order" o WHERE o.id = ? AND o.project_id = ?')
    .bind(orderId, grantProjectId)
    .first<OrderRow>();
}

// Project context the account area shows alongside every order: title, quote
// ref, line count and the destination. The postcode rides along because the
// shared totals panel names it at every stage — an order reading "Delivery to
// your site" beside the quote that said "Delivery to 3070" is that one panel
// drifting apart again.
type OrderCtxRow = OrderRow & {
  project_title: string | null; project_ref: string | null;
  delivery_postcode: string | null;
  line_count: number;
};
const ORDER_CTX_SELECT = `
  SELECT o.*, p.title AS project_title, p.public_ref AS project_ref,
         p.delivery_postcode,
         (SELECT count(*) FROM order_line ol WHERE ol.order_id = o.id AND ol.parent_line_id IS NULL) AS line_count
    FROM "order" o JOIN project p ON p.id = o.project_id`;

async function orderCtxDto(c: { env: Env }, o: OrderCtxRow) {
  return {
    ...(await orderDto(c.env, o)),
    projectId: o.project_id,
    projectTitle: o.project_title,
    projectRef: o.project_ref,
    deliveryPostcode: o.delivery_postcode,
    lineCount: o.line_count,
  };
}

// GET /api/orders — the signed-in customer's orders (summary).
orders.get("/", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  if (!user) return c.json({ orders: [] });
  const { results } = await c.env.DB
    .prepare(`${ORDER_CTX_SELECT} WHERE p.owner_user_id = ? ORDER BY o.created_at DESC`)
    .bind(user.id).all<OrderCtxRow>();
  return c.json({ orders: await Promise.all(results.map((o) => orderCtxDto(c, o))) });
});

// GET /api/orders/:id — full order detail (stage, payments, lines).
orders.get("/:id", async (c) => {
  // Same two credentials as the actions below — a guest who can sign off
  // drawings must also be able to READ the order those drawings belong to.
  const user = await resolveUser(c.env, c.req.raw);
  const grantProjectId = await guestGrantProjectId(c.env, c.req.raw);
  if (!user && !grantProjectId) return c.json({ error: "not_found" }, 404);
  const order = user
    ? await c.env.DB.prepare(`${ORDER_CTX_SELECT} WHERE o.id = ? AND p.owner_user_id = ?`)
        .bind(c.req.param("id"), user.id).first<OrderCtxRow>()
    : await c.env.DB.prepare(`${ORDER_CTX_SELECT} WHERE o.id = ? AND o.project_id = ?`)
        .bind(c.req.param("id"), grantProjectId).first<OrderCtxRow>();
  if (!order) return c.json({ error: "not_found" }, 404);
  // The same nested shape the quote serves, so the account renders both through
  // one list component (worker/lib/orders.ts's orderLines).
  return c.json({ order: { ...(await orderCtxDto(c, order)), lines: await orderLines(c.env, order.id) } });
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
  const err = await markPaid(c.env, order, kind, typeof body?.reference === "string" ? body.reference : null);
  if (err) return c.json({ error: err, stage: order.stage }, 409);
  const fresh = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(order.id).first<OrderRow>();
  return c.json({ order: await orderDto(c.env, fresh!) });
});
