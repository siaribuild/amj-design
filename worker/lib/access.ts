// Shared project-resolution + ownership helpers used across routes.
import type { Env } from "../types";
import { resolveUser } from "./auth";
import { CLAIM_COOKIE, claimCookie, newToken, parseCookies, uuid } from "./util";

export interface ProjectRow {
  id: string;
  owner_user_id: string | null;
  claim_token: string | null;
  title: string | null;
  status_customer: string;
  created_at: string;
}

// The "current" project: a signed-in user's latest project wins; otherwise the
// anonymous claim-cookie project. `token`/`userId` inform the create path.
export async function resolveCurrentProject(env: Env, req: Request): Promise<{
  project: ProjectRow | null; token?: string; userId?: string;
}> {
  const user = await resolveUser(env, req);
  const token = parseCookies(req.headers.get("Cookie"))[CLAIM_COOKIE];
  if (user) {
    const project = await env.DB
      .prepare("SELECT * FROM project WHERE owner_user_id = ? ORDER BY updated_at DESC LIMIT 1")
      .bind(user.id).first<ProjectRow>();
    if (project) return { project, userId: user.id };
    if (token) {
      const anon = await env.DB.prepare("SELECT * FROM project WHERE claim_token = ?").bind(token).first<ProjectRow>();
      if (anon) return { project: anon, token, userId: user.id };
    }
    return { project: null, userId: user.id };
  }
  if (!token) return { project: null };
  const project = await env.DB.prepare("SELECT * FROM project WHERE claim_token = ?").bind(token).first<ProjectRow>();
  return { project, token };
}

// Resolve the current project, creating one if none exists. Returns a Set-Cookie
// header string when a fresh anonymous claim cookie was minted.
export async function resolveOrCreateCurrentProject(env: Env, req: Request, title = "My project"): Promise<{
  project: ProjectRow; cookie?: string;
}> {
  const { project, userId } = await resolveCurrentProject(env, req);
  if (project) return { project };

  const id = uuid();
  if (userId) {
    await env.DB.prepare("INSERT INTO project (id, owner_user_id, title) VALUES (?, ?, ?)").bind(id, userId, title).run();
    return { project: { id, owner_user_id: userId, claim_token: null, title, status_customer: "draft", created_at: "" } };
  }
  const token = newToken();
  await env.DB.prepare("INSERT INTO project (id, claim_token, title) VALUES (?, ?, ?)").bind(id, token, title).run();
  return { project: { id, owner_user_id: null, claim_token: token, title, status_customer: "draft", created_at: "" }, cookie: claimCookie(token, env) };
}

// The requester owns a project if signed in as its owner, or holds its claim cookie.
export async function ownedProject(env: Env, req: Request, projectId: string): Promise<ProjectRow | null> {
  const p = await env.DB.prepare("SELECT * FROM project WHERE id = ?").bind(projectId).first<ProjectRow>();
  if (!p) return null;
  const user = await resolveUser(env, req);
  if (user && p.owner_user_id === user.id) return p;
  const claim = parseCookies(req.headers.get("Cookie"))[CLAIM_COOKIE];
  if (claim && p.claim_token === claim) return p;
  return null;
}
