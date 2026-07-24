// Schedule-parse job orchestration, persistence and quota accounting.
//
// Synchronous by design (Phase 1): the deterministic extractor reads a digital
// PDF in well under a request budget, so the /parse route runs the whole pipeline
// inline and returns the created lines. The pipeline is factored behind the
// extractor interface + this module so it can move to a Cloudflare Workflow later
// with no change to routes, matcher or schema.
import type { Env } from "../types";
import { uuid } from "./util";
import { logEvent } from "./activity";
import { extractSchedule } from "./extract";
import { matchSchedule, type ParsedLine } from "../../src/data/scheduleMatch";
import { priceConfigured } from "../../src/data/configurator";
import type { ProjectRow } from "./access";

export interface ParseFile { id: string; r2_key: string; filename: string; size: number | null; content_type?: string; virus_status?: string }

export type ParseMode = "replace" | "append";

export interface ParseOutcome {
  jobId: string;
  status: "completed" | "needs_review" | "failed";
  engine: string;
  itemCount: number;
  needsReviewCount: number;
  error?: string;
}

// ── Quota ──────────────────────────────────────────────────────────────────
// 10/month anonymous, 100/month registered — counted since the LATER of the
// month start and the subject's most recent order ("reset on purchase"). Derived
// from job rows; no counter to drift. Anonymous subjects have no orders.
export const ANON_PARSE_LIMIT = 10;
export const REGISTERED_PARSE_LIMIT = 100;

export interface QuotaInfo { used: number; limit: number; remaining: number; resetsOn: string }

function startOfMonthUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01 00:00:00`;
}
function startOfNextMonthISO(): string {
  const d = new Date();
  const y = d.getUTCMonth() === 11 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  const m = d.getUTCMonth() === 11 ? 1 : d.getUTCMonth() + 2;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export async function parseQuota(env: Env, subject: string, userId: string | null): Promise<QuotaInfo> {
  const limit = userId ? REGISTERED_PARSE_LIMIT : ANON_PARSE_LIMIT;
  let since = startOfMonthUTC();
  if (userId) {
    const last = await env.DB
      .prepare(`SELECT MAX(o.created_at) AS t FROM "order" o JOIN project p ON p.id = o.project_id WHERE p.owner_user_id = ?`)
      .bind(userId).first<{ t: string | null }>();
    if (last?.t && last.t > since) since = last.t; // purchase resets the window
  }
  const row = await env.DB
    .prepare("SELECT count(*) AS n FROM schedule_parse_job WHERE subject = ? AND created_at >= ? AND status != 'failed'")
    .bind(subject, since).first<{ n: number }>();
  const used = row?.n ?? 0;
  return { used, limit, remaining: Math.max(0, limit - used), resetsOn: startOfNextMonthISO() };
}

// ── Content hash (dedupe / cache key) ────────────────────────────────────────
export async function sha256hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Quota subject (NEVER the raw claim cookie) ───────────────────────────────
// The anonymous claim_token is a bearer credential; storing it in plaintext would
// turn a DB read into session takeover. So the quota subject is an HMAC (or salted
// hash) of the identity, never the token itself. Registered users key on their
// (non-bearer) user id.
async function keyedHash(env: Env, value: string): Promise<string> {
  const enc = new TextEncoder();
  const secret = env.PARSE_SUBJECT_SECRET;
  if (secret) {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  }
  return (await sha256hex(enc.encode(`amj-parse-subject:${value}`))).slice(0, 32);
}

export async function deriveSubject(env: Env, id: { userId: string | null; claimToken: string | null; ip: string }): Promise<string> {
  if (id.userId) return `u:${id.userId}`;               // DB id, not a bearer credential
  if (id.claimToken) return `a:${await keyedHash(env, id.claimToken)}`;
  return `ip:${await keyedHash(env, id.ip)}`;
}

// ── Existing draft state (for replace/append + 1-file enforcement) ───────────
export async function draftScheduleState(env: Env, projectId: string): Promise<{ lineCount: number; scheduleFiles: ParseFile[] }> {
  const lc = await env.DB
    .prepare("SELECT count(*) AS n FROM quote_line WHERE project_id = ? AND revision_id IS NULL")
    .bind(projectId).first<{ n: number }>();
  const { results } = await env.DB
    .prepare("SELECT id, r2_key, filename, size FROM file_asset WHERE project_id = ? AND kind = 'schedule' ORDER BY created_at DESC")
    .bind(projectId).all<ParseFile>();
  return { lineCount: lc?.n ?? 0, scheduleFiles: results ?? [] };
}

// ── The pipeline ─────────────────────────────────────────────────────────────
export async function runScheduleParse(
  env: Env,
  opts: { project: ProjectRow; file: ParseFile; subject: string; userId: string | null; mode: ParseMode; contentHash?: string },
): Promise<ParseOutcome> {
  const { project, file, subject, mode } = opts;
  const jobId = uuid();
  await env.DB.prepare(
    "INSERT INTO schedule_parse_job (id, project_id, file_asset_id, subject, status, content_hash) VALUES (?,?,?,?,'extracting',?)",
  ).bind(jobId, project.id, file.id, subject, opts.contentHash ?? null).run();

  const fail = async (code: string): Promise<ParseOutcome> => {
    await env.DB.prepare("UPDATE schedule_parse_job SET status='failed', error=?, completed_at=datetime('now') WHERE id=?").bind(code, jobId).run();
    return { jobId, status: "failed", engine: "cf-deterministic", itemCount: 0, needsReviewCount: 0, error: code };
  };

  // Only a scanner-cleared file is ever fed to the extractor. Uploads are scanned
  // inline before they persist, so this guards the legacy/rescan paths.
  if (file.virus_status && file.virus_status !== "clean") return fail("file_not_scanned");

  // Load bytes from R2.
  const obj = await env.FILES.get(file.r2_key);
  if (!obj) return fail("file_missing");
  const bytes = new Uint8Array(await obj.arrayBuffer());

  // Extract.
  let extract;
  try {
    extract = await extractSchedule({ bytes, contentType: file.content_type || obj.httpMetadata?.contentType || "application/pdf", filename: file.filename }, env);
  } catch (e) {
    return fail(`extract_error:${String(e)}`.slice(0, 200));
  }
  if (!extract.rows.length) {
    const w = extract.warnings;
    const code = w.includes("not_a_pdf") ? "not_a_pdf"
      : w.includes("encrypted_pdf") ? "encrypted_pdf"
      : w.includes("too_many_pages") ? "too_many_pages"
      : w.includes("no_text_layer") ? "no_text_layer"
      : "no_rows_found";
    return fail(code);
  }

  await env.DB.prepare(
    "UPDATE schedule_parse_job SET status='matching', engine=?, engine_version=?, page_count=?, input_tokens=?, output_tokens=?, estimated_cost_microusd=? WHERE id=?",
  ).bind(extract.engine, extract.engineVersion ?? null, extract.pageCount || null, extract.inputTokens ?? null, extract.outputTokens ?? null, extract.costMicroUsd ?? null, jobId).run();

  // Match → estimator lines (faithful + flagged).
  const lines: ParsedLine[] = matchSchedule(extract.rows);

  // Apply mode: replace clears prior draft lines; append keeps them.
  const stmts: D1PreparedStatement[] = [];
  if (mode === "replace") {
    stmts.push(env.DB.prepare("DELETE FROM quote_line WHERE project_id = ? AND revision_id IS NULL").bind(project.id));
  }
  const posRow = mode === "append"
    ? await env.DB.prepare("SELECT COALESCE(MAX(position),-1)+1 AS n FROM quote_line WHERE project_id = ? AND revision_id IS NULL").bind(project.id).first<{ n: number }>()
    : { n: 0 };
  let position = posRow?.n ?? 0;

  let needsReview = 0;
  const created: { line: ParsedLine; qlId: string; plId: string; idx: number }[] = [];
  lines.forEach((l, idx) => {
    const priced = priceConfigured({ productSlug: l.productSlug, width: l.width, height: l.height, options: l.options, qty: l.qty });
    const hasReview = !!l.review && Object.keys(l.review).length > 0;
    if (hasReview) needsReview++;
    // Unpriceable ⇒ 'incomplete' (customer-blocking); priced+flagged ⇒
    // 'technical_review' (AMJ resolves, submittable); priced+clean ⇒ 'ready'.
    const status = !priced.ok ? "incomplete" : hasReview ? "technical_review" : "ready";
    const lineTotal = priced.ok ? priced.total : null;
    const qlId = uuid();
    const plId = uuid();
    stmts.push(env.DB.prepare(
      `INSERT INTO quote_line (id, project_id, revision_id, external_ref, room_label, product_slug, options_json, dims_json, measured_by, qty, line_total, status, position, origin, review_json)
       VALUES (?,?,NULL,?,?,?,?,?,?,?,?,?,?, 'schedule', ?)`,
    ).bind(
      qlId, project.id, l.code || null, l.location || null, l.productSlug,
      JSON.stringify(l.options), JSON.stringify({ width: l.width, height: l.height }), l.measuredBy || "",
      l.qty, lineTotal, status, position++, l.review ? JSON.stringify(l.review) : null,
    ));
    stmts.push(env.DB.prepare(
      `INSERT INTO parse_line (id, job_id, page, source_index, raw_json, mapped_product_slug, mapped_dims_json, mapped_options_json, mapped_qty, external_ref, issues_json, quote_line_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      plId, jobId, null, idx, JSON.stringify(extract.rows[idx] ?? {}), l.productSlug || null,
      JSON.stringify({ width: l.width, height: l.height }), JSON.stringify(l.options), l.qty, l.code || null,
      l.review ? JSON.stringify(l.review) : null, qlId,
    ));
    created.push({ line: l, qlId, plId, idx });
  });

  stmts.push(env.DB.prepare("UPDATE project SET updated_at = datetime('now') WHERE id = ?").bind(project.id));
  stmts.push(env.DB.prepare(
    "UPDATE schedule_parse_job SET status=?, item_count=?, confidence=?, completed_at=datetime('now') WHERE id=?",
  ).bind(needsReview ? "needs_review" : "completed", lines.length, extract.overallConfidence, jobId));

  await env.DB.batch(stmts);
  await logEvent(env, { actor: opts.userId ?? "customer", entityType: "project", entityId: project.id, action: `schedule parsed (${lines.length} items, ${needsReview} to review) via ${extract.engine}` });

  return {
    jobId,
    status: needsReview ? "needs_review" : "completed",
    engine: extract.engine,
    itemCount: lines.length,
    needsReviewCount: needsReview,
  };
}

export interface JobDto { id: string; status: string; engine: string | null; itemCount: number | null; confidence: number | null; error: string | null; createdAt: string; completedAt: string | null }

export async function getJob(env: Env, projectId: string, jobId: string): Promise<JobDto | null> {
  const r = await env.DB.prepare(
    "SELECT id, status, engine, item_count, confidence, error, created_at, completed_at FROM schedule_parse_job WHERE id = ? AND project_id = ?",
  ).bind(jobId, projectId).first<any>();
  if (!r) return null;
  return { id: r.id, status: r.status, engine: r.engine, itemCount: r.item_count, confidence: r.confidence, error: r.error, createdAt: r.created_at, completedAt: r.completed_at };
}
