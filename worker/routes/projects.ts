// /api/projects — the customer project workspace.
//
// The anonymous "current" project is resolved via the httpOnly claim cookie (or
// the session for signed-in users). The project row is created lazily on the
// first save, not on every visit, so idle traffic leaves no junk.
import { Hono } from "hono";
import type { Env } from "../types";
import { itemToInsert, rowToApiLine, type LineRow } from "../lib/lines";
import { resolveCurrentProject, resolveOrCreateCurrentProject, type ProjectRow } from "../lib/access";
import { resolveUser } from "../lib/auth";

export const projects = new Hono<{ Bindings: Env }>();

// GET /api/projects — the signed-in customer's projects (for the dashboard).
projects.get("/", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  if (!user) return c.json({ projects: [] });
  const { results } = await c.env.DB.prepare(`
    SELECT p.id, p.title, p.status_customer, p.updated_at,
           (SELECT count(*) FROM quote_line WHERE project_id = p.id AND revision_id IS NULL) AS item_count,
           (SELECT id FROM quote_revision WHERE project_id = p.id AND snapshot_status = 'issued' ORDER BY revision_no DESC LIMIT 1) AS issued_revision_id
      FROM project p
     WHERE p.owner_user_id = ?
     ORDER BY p.updated_at DESC`).bind(user.id).all();
  return c.json({ projects: results });
});

const projectDto = (p: ProjectRow) => ({
  id: p.id,
  title: p.title ?? "My project",
  status: p.status_customer,
  createdAt: p.created_at,
});

async function loadLines(env: Env, projectId: string) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM quote_line WHERE project_id = ? AND revision_id IS NULL ORDER BY position",
  ).bind(projectId).all<LineRow>();
  return results.map(rowToApiLine);
}

// GET /api/projects/current — the current project + its draft lines (no writes).
projects.get("/current", async (c) => {
  const { project } = await resolveCurrentProject(c.env, c.req.raw);
  if (!project) return c.json({ project: null, items: [] });
  return c.json({ project: projectDto(project), items: await loadLines(c.env, project.id) });
});

// PUT /api/projects/current/lines — replace the draft line set (snapshot save).
// Creates the project (and sets the claim cookie) on first save.
projects.put("/current/lines", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const items: unknown[] = Array.isArray(body?.items) ? body.items : [];
  const title = typeof body?.title === "string" ? body.title : "My project";

  const { project, cookie } = await resolveOrCreateCurrentProject(c.env, c.req.raw, title);

  const rows = items.map((raw, i) => itemToInsert(project.id, raw, i));
  const stmts = [
    c.env.DB.prepare("DELETE FROM quote_line WHERE project_id = ? AND revision_id IS NULL").bind(project.id),
    ...rows.map((r) =>
      c.env.DB.prepare(
        `INSERT INTO quote_line
           (id, project_id, external_ref, room_label, product_slug, options_json, dims_json, measured_by, qty, line_total, status, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        r.id, r.project_id, r.external_ref, r.room_label, r.product_slug,
        r.options_json, r.dims_json, r.measured_by, r.qty, r.line_total, r.status, r.position,
      ),
    ),
    c.env.DB.prepare("UPDATE project SET updated_at = datetime('now') WHERE id = ?").bind(project.id),
  ];
  await c.env.DB.batch(stmts);

  if (cookie) c.header("Set-Cookie", cookie);
  return c.json({ project: projectDto(project), items: await loadLines(c.env, project.id) });
});
