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
import { resolveUser } from "../lib/auth";

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

// Resolve the "current" project: a signed-in user's latest project wins;
// otherwise fall back to the anonymous claim cookie. `token`/`userId` are
// returned so the save path can create the row with the right ownership.
async function resolveCurrent(env: Env, req: Request): Promise<{
  project: ProjectRow | null; token?: string; userId?: string;
}> {
  const user = await resolveUser(env, req);
  if (user) {
    const project = await env.DB
      .prepare("SELECT * FROM project WHERE owner_user_id = ? ORDER BY updated_at DESC LIMIT 1")
      .bind(user.id)
      .first<ProjectRow>();
    if (project) return { project, userId: user.id };
    // Signed in but no project yet — may still have an unclaimed anon draft.
    const token = parseCookies(req.headers.get("Cookie"))[CLAIM_COOKIE];
    if (token) {
      const anon = await env.DB.prepare("SELECT * FROM project WHERE claim_token = ?").bind(token).first<ProjectRow>();
      if (anon) return { project: anon, token, userId: user.id };
    }
    return { project: null, userId: user.id };
  }
  const token = parseCookies(req.headers.get("Cookie"))[CLAIM_COOKIE];
  if (!token) return { project: null };
  const project = await env.DB.prepare("SELECT * FROM project WHERE claim_token = ?").bind(token).first<ProjectRow>();
  return { project, token };
}

// GET /api/projects/current — the current project + its draft lines (no writes).
projects.get("/current", async (c) => {
  const { project } = await resolveCurrent(c.env, c.req.raw);
  if (!project) return c.json({ project: null, items: [] });
  return c.json({ project: projectDto(project), items: await loadLines(c.env, project.id) });
});

// PUT /api/projects/current/lines — replace the draft line set (snapshot save).
// Creates the project (and sets the claim cookie) on first save.
projects.put("/current/lines", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const items: unknown[] = Array.isArray(body?.items) ? body.items : [];

  let { token, project, userId } = await resolveCurrent(c.env, c.req.raw);
  let mintedCookie = false;

  if (!project) {
    const id = uuid();
    const title = typeof body?.title === "string" ? body.title : "My project";
    if (userId) {
      // Signed-in user's first project — owned outright, no claim cookie.
      await c.env.DB.prepare(
        "INSERT INTO project (id, owner_user_id, title) VALUES (?, ?, ?)",
      ).bind(id, userId, title).run();
      project = { id, title: null, status_customer: "draft", claim_token: null, created_at: "" };
    } else {
      // Anonymous — mint a claim token + cookie.
      token = newToken();
      await c.env.DB.prepare(
        "INSERT INTO project (id, claim_token, title) VALUES (?, ?, ?)",
      ).bind(id, token, title).run();
      project = { id, title: null, status_customer: "draft", claim_token: token, created_at: "" };
      mintedCookie = true;
    }
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
