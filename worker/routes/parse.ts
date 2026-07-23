// /api — schedule parsing: turn an uploaded schedule (file_asset) into estimator
// draft lines. Synchronous pipeline (see worker/lib/parse.ts). Owner/claim scoped,
// quota-limited (10 anon / 100 registered per month, reset on purchase), per-IP
// rate limited, and 1-file-per-quote enforced.
import { Hono } from "hono";
import type { Env } from "../types";
import { resolveOrCreateCurrentProject, resolveCurrentProject } from "../lib/access";
import { resolveUser } from "../lib/auth";
import {
  runScheduleParse, parseQuota, draftScheduleState, getJob, sha256hex, deriveSubject,
  type ParseMode, type ParseFile,
} from "../lib/parse";

export const parse = new Hono<{ Bindings: Env }>();

const RATE_WINDOW = 60;              // seconds
const RATE_MAX = 6;                  // parse attempts per source per window
const MAX_SCHEDULE_BYTES = 12 * 1024 * 1024; // schedule-specific cap (< the 15MB upload cap)
const LOCK_TTL = 60;                // seconds — bounds a single parse

// POST /api/projects/current/parse  { fileId, mode?: 'replace'|'append' }
parse.post("/projects/current/parse", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
  const rlKey = `prl:${ip}`;
  const used = parseInt((await c.env.KV.get(rlKey)) ?? "0", 10) || 0;
  if (used >= RATE_MAX) return c.json({ error: "rate_limited" }, 429);

  const body = await c.req.json().catch(() => ({} as any));
  const fileId = String(body?.fileId ?? "");
  const modeRaw = String(body?.mode ?? "");
  const mode: ParseMode | "" = modeRaw === "replace" || modeRaw === "append" ? modeRaw : "";
  if (!fileId) return c.json({ error: "no_file" }, 400);

  const user = await resolveUser(c.env, c.req.raw);
  const { project, cookie } = await resolveOrCreateCurrentProject(c.env, c.req.raw);
  const { token } = await resolveCurrentProject(c.env, c.req.raw);
  // Quota subject is a keyed hash of the identity — never the raw claim cookie.
  const subject = await deriveSubject(c.env, { userId: user?.id ?? null, claimToken: project.claim_token ?? token ?? null, ip });

  // File must belong to this project.
  const file = await c.env.DB
    .prepare("SELECT id, r2_key, filename, size FROM file_asset WHERE id = ? AND project_id = ?")
    .bind(fileId, project.id).first<ParseFile>();
  if (!file) return c.json({ error: "file_not_found" }, 404);
  if ((file.size ?? 0) > MAX_SCHEDULE_BYTES) {
    if (cookie) c.header("Set-Cookie", cookie);
    return c.json({ error: "too_large" }, 413);
  }

  // Quota (the anti-price-checking control).
  const quota = await parseQuota(c.env, subject, user?.id ?? null);
  if (quota.remaining <= 0) {
    if (cookie) c.header("Set-Cookie", cookie);
    return c.json({ error: "quota_exceeded", quota }, 429);
  }

  // Existing draft → require an explicit replace/append choice.
  const state = await draftScheduleState(c.env, project.id);
  if (state.lineCount > 0 && !mode) {
    if (cookie) c.header("Set-Cookie", cookie);
    return c.json({
      error: "needs_choice",
      existingItems: state.lineCount,
      existingFile: state.scheduleFiles.find((f) => f.id !== fileId)?.filename ?? null,
    }, 409);
  }
  const effectiveMode: ParseMode = mode || "replace";

  // 1-file-per-quote: drop any other schedule files (swap to the newest upload).
  for (const f of state.scheduleFiles) {
    if (f.id === fileId) continue;
    await c.env.FILES.delete(f.r2_key).catch(() => {});
    await c.env.DB.prepare("DELETE FROM file_asset WHERE id = ?").bind(f.id).run();
  }
  // Make sure the active file is tagged as the schedule.
  await c.env.DB.prepare("UPDATE file_asset SET kind = 'schedule' WHERE id = ?").bind(fileId).run();

  await c.env.KV.put(rlKey, String(used + 1), { expirationTtl: RATE_WINDOW });

  // Content hash for dedupe/observability.
  let contentHash: string | undefined;
  try {
    const obj = await c.env.FILES.get(file.r2_key);
    if (obj) contentHash = await sha256hex(new Uint8Array(await obj.arrayBuffer()));
  } catch { /* non-fatal */ }

  // Per-project lock: a second concurrent parse for the same project would double-
  // import (each request is its own atomic batch). Serialise them.
  const lockKey = `parselock:${project.id}`;
  if (await c.env.KV.get(lockKey)) {
    if (cookie) c.header("Set-Cookie", cookie);
    return c.json({ error: "busy" }, 409);
  }
  await c.env.KV.put(lockKey, "1", { expirationTtl: LOCK_TTL });

  let outcome;
  try {
    outcome = await runScheduleParse(c.env, {
      project, file, subject, userId: user?.id ?? null, mode: effectiveMode, contentHash,
    });
  } finally {
    await c.env.KV.delete(lockKey).catch(() => {});
  }

  const quotaAfter = await parseQuota(c.env, subject, user?.id ?? null);
  if (cookie) c.header("Set-Cookie", cookie);
  if (outcome.status === "failed") {
    return c.json({ error: parseFailCode(outcome.error), job: { id: outcome.jobId, status: "failed" } }, 422);
  }
  return c.json({ job: outcome, quota: quotaAfter });
});

// POST /api/projects/current/clear — reset the draft to zero: delete all draft
// lines AND the attached schedule file(s) (R2 + rows). The single source file is
// integral to an order, so it is only removable via this whole-project reset.
parse.post("/projects/current/clear", async (c) => {
  const { project } = await resolveCurrentProject(c.env, c.req.raw);
  if (!project) return c.json({ ok: true }); // nothing to clear
  const state = await draftScheduleState(c.env, project.id);
  for (const f of state.scheduleFiles) await c.env.FILES.delete(f.r2_key).catch(() => {});
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM quote_line WHERE project_id = ? AND revision_id IS NULL").bind(project.id),
    c.env.DB.prepare("DELETE FROM file_asset WHERE project_id = ? AND kind = 'schedule'").bind(project.id),
    c.env.DB.prepare("UPDATE project SET updated_at = datetime('now') WHERE id = ?").bind(project.id),
  ]);
  return c.json({ ok: true });
});

// GET /api/projects/current/parse-quota
parse.get("/projects/current/parse-quota", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  const { project, token } = await resolveCurrentProject(c.env, c.req.raw);
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  const subject = await deriveSubject(c.env, { userId: user?.id ?? null, claimToken: project?.claim_token ?? token ?? null, ip });
  return c.json({ quota: await parseQuota(c.env, subject, user?.id ?? null) });
});

// GET /api/projects/current/parse-jobs/:jobId
parse.get("/projects/current/parse-jobs/:jobId", async (c) => {
  const { project } = await resolveCurrentProject(c.env, c.req.raw);
  if (!project) return c.json({ error: "not_found" }, 404);
  const job = await getJob(c.env, project.id, c.req.param("jobId"));
  if (!job) return c.json({ error: "not_found" }, 404);
  return c.json({ job });
});

// Map internal failure codes to friendly client codes (never raw parser errors).
function parseFailCode(err?: string): string {
  if (!err) return "parse_failed";
  if (err.startsWith("no_text_layer")) return "no_text_layer";
  if (err.startsWith("no_rows_found")) return "no_schedule_found";
  if (err.startsWith("not_a_pdf")) return "not_a_pdf";
  if (err.startsWith("encrypted_pdf")) return "encrypted_pdf";
  if (err.startsWith("too_many_pages")) return "too_many_pages";
  if (err.startsWith("file_missing")) return "file_missing";
  return "parse_failed";
}
