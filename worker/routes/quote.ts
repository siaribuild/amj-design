// /api — quote lifecycle: submit (customer), issue revision (staff seam),
// list revisions (customer), accept (customer -> creates order + deposit invoice).
import { Hono } from "hono";
import type { Env } from "../types";
import { ownedProject } from "../lib/access";
import { isStaff } from "../lib/staff";
import { resolveUser } from "../lib/auth";
import { createOrderFromRevision, orderDto, type OrderRow } from "../lib/orders";
import { issueRevision } from "../lib/revisions";
import { logEvent } from "../lib/activity";
import { notify } from "../lib/email";
import { uuid } from "../lib/util";

export const quote = new Hono<{ Bindings: Env }>();

// GET /api/projects/:id/clarifications — clarification thread for the customer.
quote.get("/projects/:id/clarifications", async (c) => {
  const p = await ownedProject(c.env, c.req.raw, c.req.param("id"));
  if (!p) return c.json({ error: "not_found" }, 404);
  const { results } = await c.env.DB
    .prepare("SELECT cm.body, cm.created_at, u.name AS author, u.type AS author_type FROM comment cm LEFT JOIN user u ON u.id = cm.author_id WHERE cm.project_id = ? AND cm.kind = 'clarification' ORDER BY cm.created_at ASC")
    .bind(p.id).all();
  return c.json({ status: p.status_customer, clarifications: results });
});

// POST /api/projects/:id/clarification-reply { message } — customer responds; back to review.
quote.post("/projects/:id/clarification-reply", async (c) => {
  const p = await ownedProject(c.env, c.req.raw, c.req.param("id"));
  if (!p) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const message = String(body?.message ?? "").trim();
  if (!message) return c.json({ error: "empty" }, 400);
  const user = await resolveUser(c.env, c.req.raw);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO comment (id, project_id, author_id, kind, body) VALUES (?, ?, ?, 'clarification', ?)").bind(uuid(), p.id, user?.id ?? p.owner_user_id, message),
    c.env.DB.prepare("UPDATE project SET status_customer = 'under_review', status_internal = 'estimator_assigned', updated_at = datetime('now') WHERE id = ?").bind(p.id),
  ]);
  await logEvent(c.env, { actor: user?.id ?? "customer", entityType: "project", entityId: p.id, action: "customer answered clarification" });
  await notify(c.env, { recipient: "ops", eventType: "clarification.answered", channel: "inbox", templateKey: "clarification_answered" });
  return c.json({ ok: true, status: "under_review" });
});

// POST /api/projects/:id/submit — customer submits the draft for review.
quote.post("/projects/:id/submit", async (c) => {
  const p = await ownedProject(c.env, c.req.raw, c.req.param("id"));
  if (!p) return c.json({ error: "not_found" }, 404);
  await c.env.DB.prepare(
    "UPDATE project SET status_customer = 'submitted', status_internal = 'submitted', updated_at = datetime('now') WHERE id = ?",
  ).bind(p.id).run();
  return c.json({ id: p.id, status: "submitted" });
});

// POST /api/projects/:id/issue-revision — STAFF seam (shared with the ops console).
quote.post("/projects/:id/issue-revision", async (c) => {
  if (!(await isStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const rev = await issueRevision(c.env, c.req.param("id"));
  if (!rev.ok) return c.json({ error: rev.error }, rev.error === "not_found" ? 404 : 409);
  return c.json({ id: rev.id, revisionNo: rev.revisionNo, total: rev.total });
});

// GET /api/projects/:id/revisions — customer view of issued revisions.
quote.get("/projects/:id/revisions", async (c) => {
  const p = await ownedProject(c.env, c.req.raw, c.req.param("id"));
  if (!p) return c.json({ error: "not_found" }, 404);
  const { results } = await c.env.DB
    .prepare("SELECT id, revision_no, snapshot_status, totals_json, issued_at, accepted_at FROM quote_revision WHERE project_id = ? ORDER BY revision_no DESC")
    .bind(p.id).all<{ id: string; revision_no: number; snapshot_status: string; totals_json: string; issued_at: string; accepted_at: string | null }>();
  const revisions = await Promise.all(results.map(async (r) => {
    const { results: rl } = await c.env.DB
      .prepare("SELECT external_ref, room_label, product_snapshot_json, dims_json, qty, line_total FROM revision_line WHERE revision_id = ?")
      .bind(r.id).all();
    return {
      id: r.id, revisionNo: r.revision_no, status: r.snapshot_status,
      total: safeParse(r.totals_json).total ?? 0, issuedAt: r.issued_at, acceptedAt: r.accepted_at,
      lines: rl,
    };
  }));
  return c.json({ revisions });
});

// POST /api/revisions/:id/accept — customer accepts an issued revision.
quote.post("/revisions/:id/accept", async (c) => {
  const revisionId = c.req.param("id");
  const rev = await c.env.DB.prepare("SELECT id, project_id, snapshot_status FROM quote_revision WHERE id = ?").bind(revisionId).first<{ id: string; project_id: string; snapshot_status: string }>();
  if (!rev) return c.json({ error: "not_found" }, 404);
  if (!(await ownedProject(c.env, c.req.raw, rev.project_id))) return c.json({ error: "not_found" }, 404);

  // Atomically claim the revision: only the request that flips issued->accepted
  // proceeds; concurrent duplicates see 0 rows changed and get 409. Combined with
  // the UNIQUE index on order.accepted_revision_id, this prevents duplicate orders.
  const claim = await c.env.DB
    .prepare("UPDATE quote_revision SET snapshot_status = 'accepted', accepted_at = datetime('now') WHERE id = ? AND snapshot_status = 'issued'")
    .bind(revisionId).run();
  if (!claim.meta.changes) return c.json({ error: "not_acceptable" }, 409);

  const orderId = await createOrderFromRevision(c.env, revisionId, rev.project_id);
  const order = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(orderId).first<OrderRow>();
  return c.json({ order: await orderDto(c.env, order!) });
});

function safeParse(s: string): Record<string, any> {
  try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
