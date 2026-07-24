// /api/projects — the customer project workspace.
//
// The anonymous "current" project is resolved via the httpOnly claim cookie (or
// the session for signed-in users). The project row is created lazily on the
// first save, not on every visit, so idle traffic leaves no junk.
import { Hono } from "hono";
import type { Env } from "../types";
import { itemToInsert, itemFields, incomingServerId, rowToApiLine, type LineRow } from "../lib/lines";
import { resolveCurrentProject, resolveOrCreateCurrentProject, type ProjectRow } from "../lib/access";
import { resolveUser } from "../lib/auth";

export const projects = new Hono<{ Bindings: Env }>();

// GET /api/projects — the signed-in customer's projects (for the dashboard).
// Carries everything the account area needs to derive gates + list rows in one
// call: ref, draft estimate, and the latest issued revision's number + total.
projects.get("/", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  if (!user) return c.json({ projects: [] });
  const { results } = await c.env.DB.prepare(`
    SELECT p.id, p.public_ref, p.title, p.status_customer, p.updated_at, p.created_at,
           (SELECT count(*) FROM quote_line WHERE project_id = p.id AND revision_id IS NULL) AS item_count,
           (SELECT COALESCE(SUM(line_total), 0) FROM quote_line WHERE project_id = p.id AND revision_id IS NULL) AS draft_total,
           (SELECT id FROM quote_revision WHERE project_id = p.id AND snapshot_status = 'issued' ORDER BY revision_no DESC LIMIT 1) AS issued_revision_id,
           (SELECT revision_no FROM quote_revision WHERE project_id = p.id AND snapshot_status = 'issued' ORDER BY revision_no DESC LIMIT 1) AS issued_revision_no,
           (SELECT totals_json FROM quote_revision WHERE project_id = p.id AND snapshot_status = 'issued' ORDER BY revision_no DESC LIMIT 1) AS issued_totals_json
      FROM project p
     WHERE p.owner_user_id = ?
     ORDER BY p.updated_at DESC`).bind(user.id).all<Record<string, unknown>>();
  const rows = results.map((r) => {
    let issuedTotal: number | null = null;
    try { const t = JSON.parse(String(r.issued_totals_json ?? "")); if (typeof t?.total === "number") issuedTotal = t.total; } catch { /* unpriced */ }
    const { issued_totals_json: _drop, ...rest } = r;
    return { ...rest, issued_total: issuedTotal };
  });
  return c.json({ projects: rows });
});

const projectDto = (p: ProjectRow) => ({
  id: p.id,
  ref: p.public_ref,
  title: p.title ?? "My Project",
  status: p.status_customer,
  createdAt: p.created_at,
});

async function loadLines(env: Env, projectId: string) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM quote_line WHERE project_id = ? AND revision_id IS NULL ORDER BY position",
  ).bind(projectId).all<LineRow>();
  return results.map(rowToApiLine);
}

// Source files attached to a project (the uploaded schedule). The bytes stay in
// R2; this surfaces the metadata the estimator + account/ops views render.
export async function loadProjectFiles(env: Env, projectId: string) {
  const { results } = await env.DB.prepare(
    "SELECT id, filename, kind, size FROM file_asset WHERE project_id = ? ORDER BY created_at DESC",
  ).bind(projectId).all<{ id: string; filename: string; kind: string; size: number | null }>();
  return results ?? [];
}

// GET /api/projects/current — the current project + its draft lines + files (no writes).
projects.get("/current", async (c) => {
  const { project } = await resolveCurrentProject(c.env, c.req.raw);
  if (!project) return c.json({ project: null, items: [], files: [] });
  return c.json({ project: projectDto(project), items: await loadLines(c.env, project.id), files: await loadProjectFiles(c.env, project.id) });
});

// GET /api/projects/:id — a specific owned project + its draft lines (read-only).
// Scoped to the signed-in owner so a customer can review exactly what they
// submitted (e.g. while it's under review, before any revision is issued).
projects.get("/:id", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const project = await c.env.DB.prepare(
    "SELECT * FROM project WHERE id = ? AND owner_user_id = ?",
  ).bind(c.req.param("id"), user.id).first<ProjectRow>();
  if (!project) return c.json({ error: "not_found" }, 404);
  return c.json({ project: projectDto(project), items: await loadLines(c.env, project.id), files: await loadProjectFiles(c.env, project.id) });
});

// PUT /api/projects/current/lines — replace the draft line set (snapshot save).
// Creates the project (and sets the claim cookie) on first save.
projects.put("/current/lines", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const items: unknown[] = Array.isArray(body?.items) ? body.items : [];
  // A title is optional per-save: sent when the user (re)names the project. When
  // omitted (a line-only save), the existing title is left untouched.
  const hasTitle = typeof body?.title === "string";
  const title = hasTitle ? (body.title.trim().slice(0, 120) || "My Project") : "My Project";

  const { project, cookie } = await resolveOrCreateCurrentProject(c.env, c.req.raw, title);

  // Upsert by stable server id rather than delete-all + insert-all. A line the
  // client already knows (serverId) is UPDATEd in place, so its id — and the
  // parse_line.quote_line_id provenance link pointing at it — survives every
  // autosave and the pre-submit save. Only genuinely removed lines are deleted.
  const existing = new Set(
    ((await c.env.DB.prepare("SELECT id FROM quote_line WHERE project_id = ? AND revision_id IS NULL").bind(project.id).all<{ id: string }>()).results ?? [])
      .map((r) => r.id),
  );
  const resolved = items.map((raw, i) => {
    const sid = incomingServerId(raw);
    return { raw, i, id: sid && existing.has(sid) ? sid : null };
  });
  const keptIds = new Set(resolved.filter((r) => r.id).map((r) => r.id as string));

  const stmts: D1PreparedStatement[] = [];
  // Delete only the draft lines the client dropped (origin is never resurrected).
  for (const id of existing) {
    if (!keptIds.has(id)) stmts.push(c.env.DB.prepare("DELETE FROM quote_line WHERE id = ?").bind(id));
  }
  for (const { raw, i, id } of resolved) {
    const f = itemFields(raw);
    if (id) {
      // UPDATE preserves the row's id AND its server-owned origin (not from client).
      stmts.push(c.env.DB.prepare(
        `UPDATE quote_line SET external_ref=?, room_label=?, product_slug=?, options_json=?, dims_json=?, measured_by=?, qty=?, line_total=?, status=?, position=?, review_json=?, updated_at=datetime('now')
         WHERE id=? AND project_id=? AND revision_id IS NULL`,
      ).bind(f.external_ref, f.room_label, f.product_slug, f.options_json, f.dims_json, f.measured_by, f.qty, f.line_total, f.status, i, f.review_json, id, project.id));
    } else {
      const r = itemToInsert(project.id, raw, i);
      stmts.push(c.env.DB.prepare(
        `INSERT INTO quote_line
           (id, project_id, external_ref, room_label, product_slug, options_json, dims_json, measured_by, qty, line_total, status, position, origin, review_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(r.id, r.project_id, r.external_ref, r.room_label, r.product_slug, r.options_json, r.dims_json, r.measured_by, r.qty, r.line_total, r.status, r.position, r.origin, r.review_json));
    }
  }
  stmts.push(hasTitle
    ? c.env.DB.prepare("UPDATE project SET title = ?, updated_at = datetime('now') WHERE id = ?").bind(title, project.id)
    : c.env.DB.prepare("UPDATE project SET updated_at = datetime('now') WHERE id = ?").bind(project.id));
  await c.env.DB.batch(stmts);

  if (cookie) c.header("Set-Cookie", cookie);
  return c.json({ project: projectDto(project), items: await loadLines(c.env, project.id) });
});
