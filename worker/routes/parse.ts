// /api — schedule parsing: turn an uploaded schedule (file_asset) into estimator
// draft lines. Synchronous pipeline (see worker/lib/parse.ts). Owner/claim scoped,
// quota-limited (10 anon / 100 registered per month, reset on purchase), per-IP
// rate limited, and 1-file-per-quote enforced.
import { Hono } from "hono";
import type { Env } from "../types";
import { resolveOrCreateCurrentProject, resolveCurrentProject } from "../lib/access";
import { resolveUser } from "../lib/auth";
import {
  runScheduleParse, parseQuota, draftScheduleState, getJob, deriveSubject,
  type ParseMode, type ParseFile,
} from "../lib/parse";
import { uuid } from "../lib/util";
import { customerSafeJobDiagnostic, retryCurrentAiExtraction } from "../lib/ai/jobs";
import { derivedKeys } from "../lib/ai/ingest";

export const parse = new Hono<{ Bindings: Env }>();

const RATE_WINDOW = 60;              // seconds
const RATE_MAX = 6;                  // parse attempts per source per window
const MAX_SCHEDULE_BYTES = 12 * 1024 * 1024; // schedule-specific cap (< the 15MB upload cap)
const LOCK_TTL = 60;                // seconds — bounds a single parse

// POST /api/projects/current/extraction-retry — customer-controlled retry of a
// terminal AI attempt. It reuses the same immutable generation and completed
// stage cache; it never requires deleting/re-uploading the source document.
parse.post("/projects/current/extraction-retry", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "authentication_required" }, 401);
  const { project } = await resolveCurrentProject(c.env, c.req.raw);
  if (!project) return c.json({ error: "not_found" }, 404);
  if (!c.env.AI) return c.json({ error: "ai_unavailable" }, 409);
  const retryable = await c.env.DB.prepare(
    `SELECT 1 AS retryable FROM ai_job_claim j
      JOIN project p ON p.id=j.project_id AND p.ai_generation=j.source_generation
      WHERE j.project_id=? AND (
        j.status='failed'
        OR (j.status='processing' AND j.lease_expires_at IS NOT NULL
            AND j.lease_expires_at < datetime('now'))
        OR (j.status='scheduled' AND j.retry_after IS NULL
            AND j.updated_at < datetime('now','-45 seconds'))
      )`,
  ).bind(project.id).first<{ retryable: number }>();
  if (!retryable) return c.json({ error: "not_retryable" }, 409);
  try {
    const queued = await retryCurrentAiExtraction(c.env, c.executionCtx, project.id);
    return c.json({ ok: true, alreadyQueued: queued.alreadyQueued });
  } catch {
    return c.json({ error: "retry_failed" }, 409);
  }
});

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
  if (user) {
    // Registered projects are handled by the durable AI proposal workflow.
    // Keeping this endpoint anonymous-only prevents the two estimators from
    // racing to write different configurations into the same cart.
    return c.json({ error: "ai_managed" }, 409);
  }
  const { project, cookie } = await resolveOrCreateCurrentProject(c.env, c.req.raw);
  const { token } = await resolveCurrentProject(c.env, c.req.raw);
  // Quota subject is a keyed hash of the identity — never the raw claim cookie.
  const subject = await deriveSubject(c.env, { userId: user?.id ?? null, claimToken: project.claim_token ?? token ?? null, ip });

  // File must belong to this project.
  const file = await c.env.DB
    .prepare("SELECT id, r2_key, filename, size, virus_status FROM file_asset WHERE id = ? AND project_id = ?")
    .bind(fileId, project.id).first<ParseFile>();
  if (!file) return c.json({ error: "file_not_found" }, 404);
  if (file.virus_status && file.virus_status !== "clean") {
    if (cookie) c.header("Set-Cookie", cookie);
    return c.json({ error: "scan_pending" }, 409);
  }
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
  // The Replace/Add prompt is DEAD (multi-file UX spec §1): the default mode is
  // tag-upsert — known tags refresh (respecting human edits), new tags add,
  // vanished tags reconcile. Explicit replace/append remain accepted for legacy
  // callers, but the route never asks the customer to choose.
  const effectiveMode: ParseMode = mode || "upsert";

  // Per-project lock acquired BEFORE any mutation, so a concurrent parse cannot
  // delete this request's files or double-import. The lease carries a unique owner
  // token and is released only if we still hold it — so an expiring older request
  // can't wipe a newer lease. NOTE: KV is eventually consistent and offers no
  // atomic compare-and-set, so this narrows but does not fully eliminate the race;
  // a Durable Object / D1 reservation is the durable fix (tracked as a follow-up).
  const lockKey = `parselock:${project.id}`;
  const lease = crypto.randomUUID();
  if (await c.env.KV.get(lockKey)) {
    if (cookie) c.header("Set-Cookie", cookie);
    return c.json({ error: "busy" }, 409);
  }
  await c.env.KV.put(lockKey, lease, { expirationTtl: LOCK_TTL });

  let outcome;
  try {
    await c.env.KV.put(rlKey, String(used + 1), { expirationTtl: RATE_WINDOW });

    // The pipeline reads the bytes once and hashes them there — no extra R2 GET.
    outcome = await runScheduleParse(c.env, {
      project, file, subject, userId: user?.id ?? null, mode: effectiveMode,
      previousScheduleFiles: state.scheduleFiles,
    });

    // 1-schedule-per-quote swap — ONLY after a SUCCESSFUL parse (still inside the
    // lock). Running it before the parse was a data-loss bug in multi-file
    // uploads: a non-schedule file (energy report) reaching this route deleted
    // the just-parsed schedule from R2/D1 (starving the AI pipeline too) and
    // mislabeled itself 'schedule' — then failed no_schedule_found anyway. A file
    // that doesn't parse as a schedule must never displace one that did.
    if (outcome.status !== "failed") {
      for (const r2Key of outcome.deletedScheduleKeys ?? []) {
        await c.env.FILES.delete(r2Key).catch(() => {});
      }
    }
  } finally {
    // Token-checked release: only delete the lease if it is still ours.
    if ((await c.env.KV.get(lockKey)) === lease) await c.env.KV.delete(lockKey).catch(() => {});
  }

  const quotaAfter = await parseQuota(c.env, subject, user?.id ?? null);
  if (cookie) c.header("Set-Cookie", cookie);
  if (outcome.status === "failed") {
    const status = outcome.error === "project_changed" ? 409 : 422;
    return c.json({ error: parseFailCode(outcome.error), job: { id: outcome.jobId, status: "failed" } }, status);
  }
  const { deletedScheduleKeys: _internalCleanup, ...job } = outcome;
  return c.json({ job, quota: quotaAfter });
});

// POST /api/projects/current/clear — reset the draft to zero: delete all draft
// lines AND every attached document (R2 + rows), regardless of its legacy kind.
parse.post("/projects/current/clear", async (c) => {
  const { project } = await resolveCurrentProject(c.env, c.req.raw);
  if (!project) return c.json({ ok: true }); // nothing to clear
  // Only a live draft may be cleared. resolveCurrentProject returns the customer's
  // most-recent project, which — after submission, issuance, or an order — is no
  // longer a draft; clearing it would destroy the source schedule and parse
  // evidence that staff and any order still rely on. Refuse.
  if (project.status_customer !== "draft") return c.json({ error: "not_draft" }, 409);
  const { results: attachedFiles } = await c.env.DB.prepare(
    "SELECT id, r2_key, filename, size FROM file_asset WHERE project_id=?",
  ).bind(project.id).all<ParseFile>();
  const mutationState = await c.env.DB.prepare(
    `SELECT quote_edit_version, ai_generation FROM project
      WHERE id=? AND status_customer='draft' AND quote_mutation_token IS NULL`,
  ).bind(project.id).first<{ quote_edit_version: number; ai_generation: number }>();
  if (!mutationState) return c.json({ error: "project_changed_reload_required" }, 409);
  const nextQuoteVersion = mutationState.quote_edit_version + 1;
  const nextAiGeneration = mutationState.ai_generation + 1;
  const mutationToken = uuid();
  const committed = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE project SET quote_edit_version=?, ai_generation=?, quote_mutation_token=?,
          updated_at=datetime('now')
        WHERE id=? AND status_customer='draft' AND quote_edit_version=? AND ai_generation=?
          AND quote_mutation_token IS NULL`,
    ).bind(nextQuoteVersion, nextAiGeneration, mutationToken, project.id,
      mutationState.quote_edit_version, mutationState.ai_generation),
    c.env.DB.prepare(
      `DELETE FROM quote_line
        WHERE project_id=? AND revision_id IS NULL AND EXISTS (
          SELECT 1 FROM project WHERE id=? AND status_customer='draft'
            AND quote_edit_version=? AND quote_mutation_token=?
        )`,
    ).bind(project.id, project.id, nextQuoteVersion, mutationToken),
    c.env.DB.prepare(
      `DELETE FROM file_asset
        WHERE project_id=? AND EXISTS (
          SELECT 1 FROM project WHERE id=? AND status_customer='draft'
            AND quote_edit_version=? AND ai_generation=? AND quote_mutation_token=?
        )`,
    ).bind(project.id, project.id, nextQuoteVersion, nextAiGeneration, mutationToken),
    c.env.DB.prepare(
      `UPDATE ai_job_claim SET status='superseded', updated_at=datetime('now')
        WHERE project_id=? AND source_generation<?
          AND status IN ('scheduled','processing') AND EXISTS (
            SELECT 1 FROM project WHERE id=? AND status_customer='draft'
              AND quote_edit_version=? AND ai_generation=? AND quote_mutation_token=?
          )`,
    ).bind(project.id, nextAiGeneration, project.id, nextQuoteVersion,
      nextAiGeneration, mutationToken),
    c.env.DB.prepare(
      `UPDATE ai_runs SET status='cancelled', completed_at=datetime('now')
        WHERE project_id=? AND status='running' AND EXISTS (
          SELECT 1 FROM project WHERE id=? AND status_customer='draft'
            AND quote_edit_version=? AND ai_generation=? AND quote_mutation_token=?
        )`,
    ).bind(project.id, project.id, nextQuoteVersion, nextAiGeneration, mutationToken),
    c.env.DB.prepare(
      `UPDATE project SET quote_mutation_token=NULL, updated_at=datetime('now')
        WHERE id=? AND status_customer='draft' AND quote_edit_version=? AND ai_generation=?
          AND quote_mutation_token=?`,
    ).bind(project.id, nextQuoteVersion, nextAiGeneration, mutationToken),
  ]);
  if (Number(committed[0]?.meta?.changes ?? 0) !== 1 ||
      Number(committed[5]?.meta?.changes ?? 0) !== 1) {
    return c.json({ error: "project_changed_reload_required" }, 409);
  }
  await c.env.KV.delete(`aidebounce:${project.id}`).catch(() => {});
  await Promise.all((attachedFiles ?? []).flatMap((f) => [
    c.env.FILES.delete(f.r2_key),
    c.env.FILES.delete(derivedKeys(project.id, f.id).markdown),
  ])).catch(() => { /* D1 is authoritative; unreachable R2 objects are lifecycle cleanup */ });
  return c.json({ ok: true });
});

// GET /api/projects/current/parse-quota
// POST /api/projects/current/lines/:id/collision — resolve a manual-vs-schedule
// tag collision ONCE (multi-file UX spec §1b). 'linked': the manual line becomes
// schedule-origin with ALL field groups marked human-edited — future re-parses
// match it by tag but can never overwrite what the customer built. 'separate':
// the parsed row for that tag is permanently skipped, quietly.
parse.post("/projects/current/lines/:id/collision", async (c) => {
  const { project, cookie } = await resolveCurrentProject(c.env, c.req.raw);
  if (cookie) c.header("Set-Cookie", cookie);
  if (!project) return c.json({ error: "not_found" }, 404);
  if (project.status_customer !== "draft") return c.json({ error: "not_draft" }, 409);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const choice = body?.choice === "linked" || body?.choice === "separate" ? body.choice : null;
  if (!choice) return c.json({ error: "bad_choice" }, 400);
  const line = await c.env.DB.prepare(
    "SELECT id, origin, external_ref FROM quote_line WHERE id = ? AND project_id = ? AND revision_id IS NULL",
  ).bind(c.req.param("id"), project.id).first<{ id: string; origin: string | null; external_ref: string | null }>();
  if (!line || (line.origin ?? "manual") !== "manual" || !line.external_ref) return c.json({ error: "not_found" }, 404);
  const mutationState = await c.env.DB.prepare(
    `SELECT quote_edit_version FROM project
      WHERE id=? AND status_customer='draft' AND quote_mutation_token IS NULL`,
  ).bind(project.id).first<{ quote_edit_version: number }>();
  if (!mutationState) return c.json({ error: "project_changed_reload_required" }, 409);
  const nextQuoteVersion = mutationState.quote_edit_version + 1;
  const mutationToken = uuid();
  const lineUpdate = choice === "linked"
    ? c.env.DB.prepare(
      `UPDATE quote_line SET origin='schedule', collision_choice='linked',
          edited_fields='["product_slug","options_json","dims_json","qty"]'
        WHERE id=? AND project_id=? AND revision_id IS NULL
          AND COALESCE(origin,'manual')='manual' AND external_ref IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM project WHERE id=? AND status_customer='draft'
              AND quote_edit_version=? AND quote_mutation_token=?
          )`,
    ).bind(line.id, project.id, project.id, nextQuoteVersion, mutationToken)
    : c.env.DB.prepare(
      `UPDATE quote_line SET collision_choice='separate'
        WHERE id=? AND project_id=? AND revision_id IS NULL
          AND COALESCE(origin,'manual')='manual' AND external_ref IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM project WHERE id=? AND status_customer='draft'
              AND quote_edit_version=? AND quote_mutation_token=?
          )`,
    ).bind(line.id, project.id, project.id, nextQuoteVersion, mutationToken);
  const committed = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE project SET quote_edit_version=?, quote_mutation_token=?,
          updated_at=datetime('now')
        WHERE id=? AND status_customer='draft' AND quote_edit_version=?
          AND quote_mutation_token IS NULL`,
    ).bind(nextQuoteVersion, mutationToken, project.id, mutationState.quote_edit_version),
    lineUpdate,
    c.env.DB.prepare(
      `UPDATE project SET quote_mutation_token=NULL, updated_at=datetime('now')
        WHERE id=? AND status_customer='draft' AND quote_edit_version=?
          AND quote_mutation_token=?`,
    ).bind(project.id, nextQuoteVersion, mutationToken),
  ]);
  if (Number(committed[0]?.meta?.changes ?? 0) !== 1 ||
      Number(committed[1]?.meta?.changes ?? 0) !== 1 ||
      Number(committed[2]?.meta?.changes ?? 0) !== 1) {
    return c.json({ error: "project_changed_reload_required" }, 409);
  }
  return c.json({ ok: true, choice });
});

// GET /api/projects/current/extraction-status — the customer's poll while the AI
// pipeline reads their documents (multi-file UX spec §2/§3). Returns the latest
// run's state + customer-safe summary; the client polls only while a run is in
// flight (2s→5s, one final status read at 60s). Anonymous projects never have a run.
parse.get("/projects/current/extraction-status", async (c) => {
  // resolveCurrentProject never mints a cookie (only resolveOrCreate does),
  // so there is nothing to set here.
  const { project } = await resolveCurrentProject(c.env, c.req.raw);
  if (!project) return c.json({ run: null });
  // Customer-facing watchdog for a genuinely DEAD invocation — it must never be
  // shorter than the work we deliberately allow, or it severs healthy runs. It
  // was 55s while the job is allowed 120s (AI_JOB_DEADLINE_MS) and a single model
  // call 90s: this poll, not the model, was killing extraction at ~62s. Raised
  // to 150s so the 120s job deadline is the single authority and this only
  // catches an invocation that has recorded no stage or heartbeat for far longer
  // than any healthy run could. During the long concurrent doc-skill phase only
  // the 15s heartbeat renews updated_at, so the window must clear that gap.
  const stalled = await c.env.DB.prepare(
    `UPDATE ai_job_claim
        SET status='failed', attempts=max(attempts,1),
            last_error='ai_processing_stalled', failure_class='transient',
            retry_after=NULL, lease_expires_at=NULL, processing_token=NULL,
            updated_at=datetime('now')
      WHERE project_id=? AND source_generation=(
        SELECT ai_generation FROM project WHERE id=?
      )
        AND (
          (status='processing' AND updated_at < datetime('now','-150 seconds'))
          OR
          (status='scheduled' AND retry_after IS NULL
            AND updated_at < datetime('now','-45 seconds'))
        )`,
  ).bind(project.id, project.id).run().catch(() => null);
  if (Number(stalled?.meta?.changes ?? 0) > 0) {
    await c.env.DB.prepare(
      `UPDATE ai_runs SET status='cancelled', completed_at=datetime('now')
        WHERE project_id=? AND source_generation=(
          SELECT ai_generation FROM project WHERE id=?
        ) AND status='running'`,
    ).bind(project.id, project.id).run().catch(() => {});
    await c.env.KV.delete(`aidebounce:${project.id}`).catch(() => {});
  }
  const pending = await c.env.DB.prepare(
    `SELECT j.source_generation, j.status, j.attempts, j.last_error,
            j.failure_class, j.retry_after, j.progress_stage, j.created_at, j.updated_at
       FROM ai_job_claim j JOIN project p ON p.id=j.project_id
      WHERE j.project_id=? AND j.source_generation=p.ai_generation
        AND j.status IN ('scheduled','processing','failed')
      LIMIT 1`,
  ).bind(project.id).first<{
    source_generation: number;
    status: "scheduled" | "processing" | "failed";
    attempts: number;
    last_error: string | null;
    failure_class: string | null;
    retry_after: string | null;
    progress_stage: string;
    created_at: string;
    updated_at: string;
  }>().catch(() => null);
  if (pending) {
    const diagnostic = (pending.status === "failed" || pending.failure_class === "quota")
      ? customerSafeJobDiagnostic(pending)
      : null;
    return c.json({
      run: {
        id: `generation-${pending.source_generation}`,
        status: pending.status === "scheduled" ? "queued" : pending.status === "processing" ? "running" : "failed",
        startedAt: pending.created_at,
        updatedAt: pending.updated_at,
        completedAt: pending.status === "failed" ? pending.updated_at : null,
        summary: null,
        diagnostic,
        progressStage: pending.progress_stage,
      },
      basis: {},
    });
  }
  const r = await c.env.DB.prepare(
    `SELECT id, status, started_at, completed_at, summary_json FROM ai_runs
      WHERE project_id = ? ORDER BY started_at DESC LIMIT 1`,
  ).bind(project.id).first<{ id: string; status: string; started_at: string; completed_at: string | null; summary_json: string | null }>();
  if (!r) return c.json({ run: null });
  let summary: unknown = null;
  try { summary = r.summary_json ? JSON.parse(r.summary_json) : null; } catch { /* unreadable summary is absent, not an error */ }
  // Per-line basis for the trust chips (UX spec §5): explicit_energy_report vs
  // default_envelope, keyed by schedule tag. Latest building model wins.
  const { results: reqs } = await c.env.DB.prepare(
    `SELECT q.id, q.recommendation_basis
       FROM quote_line q
      WHERE q.project_id=? AND q.revision_id IS NULL
        AND q.ai_proposal_line_id IS NOT NULL AND q.recommendation_basis IS NOT NULL`,
  ).bind(project.id).all<{ id: string; recommendation_basis: string }>()
    .catch(() => ({ results: [] as { id: string; recommendation_basis: string }[] }));
  const basis: Record<string, string> = {};
  for (const q of reqs ?? []) {
    basis[q.id] = q.recommendation_basis === "energy_report"
      ? "explicit_energy_report"
      : q.recommendation_basis;
  }
  return c.json({
    run: {
      id: r.id,
      status: r.status,
      startedAt: r.started_at,
      updatedAt: r.completed_at ?? r.started_at,
      completedAt: r.completed_at,
      summary,
      progressStage: r.completed_at ? "complete" : "preparing_quote",
    },
    basis,
  });
});

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
  if (err.startsWith("too_many_items")) return "too_many_items";
  if (err.startsWith("file_missing")) return "file_missing";
  if (err.startsWith("project_changed")) return "project_changed_reload_required";
  return "parse_failed";
}
