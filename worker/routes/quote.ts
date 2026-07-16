// /api — quote lifecycle: submit (customer), issue revision (staff seam),
// list revisions (customer), accept (customer -> creates order + deposit invoice).
import { Hono } from "hono";
import type { Env } from "../types";
import { resolveUser } from "../lib/auth";
import { ownedProject } from "../lib/access";
import { createOrderFromRevision, orderDto, type OrderRow } from "../lib/orders";
import { uuid } from "../lib/util";
import { getProductBySlug } from "../../src/data/catalogue";

export const quote = new Hono<{ Bindings: Env }>();

// Staff-only seam. The internal ops console (Cloudflare Access) will own these;
// until it exists, allow internal users, or any caller in non-prod for testing.
async function isStaff(env: Env, req: Request): Promise<boolean> {
  if (env.APP_ENV !== "production") return true;
  const user = await resolveUser(env, req);
  return user?.type === "internal";
}

// POST /api/projects/:id/submit — customer submits the draft for review.
quote.post("/projects/:id/submit", async (c) => {
  const p = await ownedProject(c.env, c.req.raw, c.req.param("id"));
  if (!p) return c.json({ error: "not_found" }, 404);
  await c.env.DB.prepare(
    "UPDATE project SET status_customer = 'submitted', status_internal = 'submitted', updated_at = datetime('now') WHERE id = ?",
  ).bind(p.id).run();
  return c.json({ id: p.id, status: "submitted" });
});

// POST /api/projects/:id/issue-revision — STAFF: snapshot draft lines into an
// immutable revision and mark the project "quote issued".
quote.post("/projects/:id/issue-revision", async (c) => {
  if (!(await isStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const projectId = c.req.param("id");
  const project = await c.env.DB.prepare("SELECT * FROM project WHERE id = ?").bind(projectId).first<ProjectRow>();
  if (!project) return c.json({ error: "not_found" }, 404);

  const { results: lines } = await c.env.DB
    .prepare("SELECT external_ref, room_label, product_slug, options_json, dims_json, qty, line_total FROM quote_line WHERE project_id = ? AND revision_id IS NULL ORDER BY position")
    .bind(projectId)
    .all<{ external_ref: string | null; room_label: string | null; product_slug: string; options_json: string; dims_json: string; qty: number; line_total: number | null }>();

  const maxRow = await c.env.DB.prepare("SELECT COALESCE(MAX(revision_no), 0) AS n FROM quote_revision WHERE project_id = ?").bind(projectId).first<{ n: number }>();
  const revisionNo = (maxRow?.n ?? 0) + 1;
  const revisionId = uuid();
  const total = lines.reduce((s, l) => s + (l.line_total || 0), 0);

  const stmts = [
    c.env.DB.prepare(
      "INSERT INTO quote_revision (id, project_id, revision_no, snapshot_status, totals_json) VALUES (?, ?, ?, 'issued', ?)",
    ).bind(revisionId, projectId, revisionNo, JSON.stringify({ total })),
    ...lines.map((l) => {
      const p = getProductBySlug(l.product_slug);
      const snapshot = JSON.stringify({
        productSlug: l.product_slug,
        productName: p?.name ?? l.product_slug,
        options: safeParse(l.options_json),
        dims: safeParse(l.dims_json),
      });
      return c.env.DB.prepare(
        "INSERT INTO revision_line (id, revision_id, external_ref, room_label, product_snapshot_json, dims_json, options_json, qty, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(uuid(), revisionId, l.external_ref, l.room_label, snapshot, l.dims_json, l.options_json, l.qty, l.line_total ?? 0);
    }),
    c.env.DB.prepare("UPDATE project SET status_customer = 'quote_issued', status_internal = 'issued', updated_at = datetime('now') WHERE id = ?").bind(projectId),
  ];
  await c.env.DB.batch(stmts);
  return c.json({ id: revisionId, revisionNo, total });
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
