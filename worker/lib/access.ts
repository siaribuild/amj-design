// Shared project-resolution + ownership helpers used across routes.
import type { Env } from "../types";
import { resolveUser } from "./auth";
import { CLAIM_COOKIE, GUEST_COOKIE, claimCookie, newToken, parseCookies, uuid } from "./util";

export interface ProjectRow {
  id: string;
  owner_user_id: string | null;
  claim_token: string | null;
  title: string | null;
  status_customer: string;
  created_at: string;
  public_ref: string | null;
}

// Customer-facing project reference (OF-Q-NNNNN) — the durable, phone-quotable
// anchor for a quote before an order number exists. Still derived from the max
// existing suffix, so it stays gap-tolerant; the difference is WHERE.
//
// It used to be a SELECT, then a separate INSERT. Two simultaneous first-saves
// read the same maximum, both built the same reference, and the loser hit the
// UNIQUE index — and the comment here promised "the caller's retry re-derives
// it", which was not true of any of the three callers. None of them catch:
// projects.ts, files.ts and parse.ts all go through resolveOrCreateCurrentProject
// with no try/catch, there is no api.onError anywhere in the Worker, and the
// visitor got a bare 500 on their first save or upload.
//
// Computing it INSIDE the insert closes the window rather than reacting to it.
// SQLite executes one statement atomically and D1 serialises writes on a single
// primary, so there is no interval for a second request to occupy. No migration,
// no counter table, and the human-readable sequence the business reads down the
// phone is unchanged. The aggregate has no GROUP BY, so it yields exactly one row
// even when the table is empty, and RETURNING hands back the value the database
// actually assigned — the DB is the authority now, not a number computed here.
const PROJECT_REF_SQL =
  "'OF-Q-' || (SELECT COALESCE(MAX(CAST(substr(public_ref, 6) AS INTEGER)), 10000) + 1 FROM project WHERE public_ref LIKE 'OF-Q-%')";

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

// Resolve the current DRAFT project for editing, creating a fresh one if none
// exists. Returns a Set-Cookie header string when a new anonymous claim cookie
// was minted.
//
// A project is only reused while it is still a 'draft'. Once it has progressed
// (submitted / quote_issued / closed / …) it is immutable from the customer's
// side, so a new draft is started instead — this is the create-a-new-quote path,
// and it prevents a save (autosave or upload) from overwriting the live lines of
// a submitted or closed project (e.g. starting another quote after an order).
export async function resolveOrCreateCurrentProject(env: Env, req: Request, title = "My Project"): Promise<{
  project: ProjectRow; cookie?: string;
}> {
  const { project, userId } = await resolveCurrentProject(env, req);
  if (project && project.status_customer === "draft") return { project };

  // One draft per customer (the cart model): reuse any existing draft, even when
  // it isn't the most-recent project — a submitted/ordered project can sort ahead
  // of an unfinished draft. This makes the single-draft invariant robust.
  if (userId) {
    const existingDraft = await env.DB
      .prepare("SELECT * FROM project WHERE owner_user_id = ? AND status_customer = 'draft' ORDER BY updated_at DESC LIMIT 1")
      .bind(userId).first<ProjectRow>();
    if (existingDraft) return { project: existingDraft };
  }

  const id = uuid();
  if (userId) {
    const row = await env.DB.prepare(
      `INSERT INTO project (id, owner_user_id, title, public_ref) VALUES (?, ?, ?, ${PROJECT_REF_SQL}) RETURNING public_ref`,
    ).bind(id, userId, title).first<{ public_ref: string }>();
    return { project: { id, owner_user_id: userId, claim_token: null, title, status_customer: "draft", created_at: "", public_ref: row?.public_ref ?? null } };
  }
  const token = newToken();
  const row = await env.DB.prepare(
    `INSERT INTO project (id, claim_token, title, public_ref) VALUES (?, ?, ?, ${PROJECT_REF_SQL}) RETURNING public_ref`,
  ).bind(id, token, title).first<{ public_ref: string }>();
  return { project: { id, owner_user_id: null, claim_token: token, title, status_customer: "draft", created_at: "", public_ref: row?.public_ref ?? null }, cookie: claimCookie(token, env) };
}

// Claim an anonymous project into a user's account on sign-in ("save & continue").
//
// One draft per customer: if the anon project is a draft AND the user already has
// a draft, MERGE the anon draft's lines into the existing draft (nothing composed
// is lost) and discard the anon project — rather than leaving the user with two
// drafts, one of which the estimator can never reach. Any other case (the anon
// project is non-draft, or the user has no draft yet) just transfers ownership;
// multiple non-draft projects are allowed.
export async function claimAnonProjectForUser(env: Env, userId: string, claimToken: string): Promise<void> {
  const anon = await env.DB
    .prepare("SELECT * FROM project WHERE claim_token = ? AND owner_user_id IS NULL")
    .bind(claimToken).first<ProjectRow>();
  if (!anon) return;

  if (anon.status_customer === "draft") {
    const existing = await env.DB
      .prepare("SELECT * FROM project WHERE owner_user_id = ? AND status_customer = 'draft' ORDER BY updated_at DESC LIMIT 1")
      .bind(userId).first<ProjectRow>();
    if (existing && existing.id !== anon.id) {
      // Append the anon draft's lines after the existing ones (positions offset),
      // then delete the anon project (its file_asset/line rows cascade; a draft
      // never has an order, the only non-cascading reference).
      const off = await env.DB
        .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM quote_line WHERE project_id = ? AND revision_id IS NULL AND parent_line_id IS NULL")
        .bind(existing.id).first<{ n: number }>();
      const offset = off?.n ?? 0;
      await env.DB.batch([
        env.DB.prepare("UPDATE quote_line SET project_id = ?, position = position + ? WHERE project_id = ? AND revision_id IS NULL").bind(existing.id, offset, anon.id),
        env.DB.prepare("UPDATE project SET updated_at = datetime('now') WHERE id = ?").bind(existing.id),
        env.DB.prepare("DELETE FROM project WHERE id = ?").bind(anon.id),
      ]);
      return;
    }
  }

  await env.DB
    .prepare("UPDATE project SET owner_user_id = ?, claim_token = NULL WHERE id = ? AND owner_user_id IS NULL")
    .bind(userId, anon.id).run();
}

/** A project is a "cart" only while it is still a draft. Everything from
 *  submission onwards is a committed record — a quote under review, a quote to
 *  accept, an order in manufacture. */
const isCart = (p: ProjectRow) => p.status_customer === "draft";

/** Resolve an emailed-code guest session to the project it covers, if any.
 *  Grants are issued per record; an order grant still resolves to its project so
 *  one verification covers the whole journey. */
export async function guestGrantProjectId(env: Env, req: Request): Promise<string | null> {
  const token = parseCookies(req.headers.get("Cookie"))[GUEST_COOKIE];
  if (!token) return null;
  const g = await env.DB
    .prepare("SELECT record_type, record_id FROM guest_grant WHERE token = ? AND expires_at > datetime('now')")
    .bind(token).first<{ record_type: string; record_id: string }>();
  if (!g) return null;
  if (g.record_type === "project") return g.record_id;
  const o = await env.DB.prepare('SELECT project_id FROM "order" WHERE id = ?')
    .bind(g.record_id).first<{ project_id: string }>();
  return o?.project_id ?? null;
}

// Who may act on a project, by how far it has progressed.
//
//   draft ("the cart")  — signed-in owner, OR the anonymous claim cookie. A
//                         cookie is the right weight for an unsubmitted basket.
//   submitted onwards   — signed-in owner, OR a guest session created by
//                         verifying a code emailed to the address on the record.
//                         The claim cookie ALONE is deliberately not enough: it
//                         is a durable year-long cookie on one device, and
//                         accepting a quote or signing off drawings commits the
//                         customer to something. Proving control of the address
//                         is the bar for that, and it is the same bar a
//                         registered customer clears (this platform is
//                         passwordless — they sign in with an emailed code too).
export async function ownedProject(env: Env, req: Request, projectId: string): Promise<ProjectRow | null> {
  const p = await env.DB.prepare("SELECT * FROM project WHERE id = ?").bind(projectId).first<ProjectRow>();
  if (!p) return null;
  const user = await resolveUser(env, req);
  if (user && p.owner_user_id === user.id) return p;

  const claim = parseCookies(req.headers.get("Cookie"))[CLAIM_COOKIE];
  if (claim && p.claim_token === claim && isCart(p)) return p;

  const grantProjectId = await guestGrantProjectId(env, req);
  if (grantProjectId === p.id) return p;
  return null;
}
