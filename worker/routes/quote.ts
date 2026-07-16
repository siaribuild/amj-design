// /api — quote lifecycle: submit (customer), issue revision (staff seam),
// list revisions (customer), accept (customer -> creates order + deposit invoice).
import { Hono } from "hono";
import type { Env } from "../types";
import { ownedProject } from "../lib/access";
import { isStaff } from "../lib/staff";
import { createOrderFromRevision, orderDto, type OrderRow } from "../lib/orders";
import { issueRevision } from "../lib/revisions";

export const quote = new Hono<{ Bindings: Env }>();

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
  if (!rev) return c.json({ error: "not_found" }, 404);
  return c.json(rev);
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
  if (rev.snapshot_status !== "issued") return c.json({ error: "not_acceptable" }, 409);

  const orderId = await createOrderFromRevision(c.env, revisionId, rev.project_id);
  const order = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(orderId).first<OrderRow>();
  return c.json({ order: await orderDto(c.env, order!) });
});

function safeParse(s: string): Record<string, any> {
  try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
