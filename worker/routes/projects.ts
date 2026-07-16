// /api/projects — the customer project workspace.
//
// M2 scope: the anonymous "current" project, resolved via the httpOnly claim
// cookie, with a snapshot line save (replace-all). The project row is created
// lazily on the first save, not on every visit, so idle traffic leaves no junk.
// Registered-user resolution (via session) layers on in M3.
import { Hono } from "hono";
import type { Env } from "../types";
import { CLAIM_COOKIE, claimCookie, newToken, parseCookies, uuid } from "../lib/util";
import { itemToInsert, rowToApiLine, type LineRow } from "../lib/lines";

export const projects = new Hono<{ Bindings: Env }>();

interface ProjectRow {
  id: string;
  title: string | null;
  status_customer: string;
  claim_token: string | null;
  created_at: string;
}

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

function findByClaim(env: Env, req: Request) {
  const token = parseCookies(req.headers.get("Cookie"))[CLAIM_COOKIE];
  if (!token) return Promise.resolve<{ token?: string; project: ProjectRow | null }>({ project: null });
  return env.DB.prepare("SELECT * FROM project WHERE claim_token = ?")
    .bind(token)
    .first<ProjectRow>()
    .then((project) => ({ token, project }));
}

// GET /api/projects/current — the claim project + its draft lines (no writes).
projects.get("/current", async (c) => {
  const { project } = await findByClaim(c.env, c.req.raw);
  if (!project) return c.json({ project: null, items: [] });
  return c.json({ project: projectDto(project), items: await loadLines(c.env, project.id) });
});

// PUT /api/projects/current/lines — replace the draft line set (snapshot save).
// Creates the project (and sets the claim cookie) on first save.
projects.put("/current/lines", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const items: unknown[] = Array.isArray(body?.items) ? body.items : [];

  let { token, project } = await findByClaim(c.env, c.req.raw);
  let mintedCookie = false;

  if (!project) {
    token = newToken();
    const id = uuid();
    await c.env.DB.prepare(
      "INSERT INTO project (id, claim_token, title) VALUES (?, ?, ?)",
    ).bind(id, token, typeof body?.title === "string" ? body.title : "My project").run();
    project = { id, title: null, status_customer: "draft", claim_token: token, created_at: "" };
    mintedCookie = true;
  }

  const rows = items.map((raw, i) => itemToInsert(project!.id, raw, i));
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

  if (mintedCookie && token) c.header("Set-Cookie", claimCookie(token, c.env));
  return c.json({ project: projectDto(project), items: await loadLines(c.env, project.id) });
});
