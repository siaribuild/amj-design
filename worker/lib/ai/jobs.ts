import type { Env } from "../../types";
import { runAiExtraction, type AiExtractionSummary } from "./pipeline";
import { uuid } from "../util";
import { hasAnyExactPricingCoverage } from "../estimator/catalogue";

export interface AiExtractionJob {
  projectId: string;
  generation: number;
  debounceToken: string;
}

export type AiJobFailureClass = "permanent" | "transient" | "quota";

export interface AiJobProcessingResult {
  state: "processed" | "stale" | "leased" | "deferred" | "failed";
  retryAfterSeconds?: number;
}

export interface AiJobDiagnostic {
  code:
    | "RATE_LIMITED"
    | "CATALOGUE_UNAVAILABLE"
    | "DOCUMENTS_NOT_UNDERSTOOD"
    | "SERVICE_CONFIGURATION_ERROR"
    | "TEMPORARY_FAILURE"
    | "RETRY_REQUIRED";
  retryable: boolean;
  retryAt: string | null;
}

const MAX_AUTOMATIC_ATTEMPTS = 3;

class AiJobFault extends Error {
  constructor(
    message: string,
    readonly failureClass: AiJobFailureClass,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AiJobFault";
  }
}

const errorText = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error ?? "unknown")).slice(0, 200);

const looksRateLimited = (value: string): boolean =>
  /(?:^|\b)(?:429|rate[ _-]?limit(?:ed)?|too many requests|quota exceeded)(?:\b|$)/i.test(value);

const looksTransient = (value: string): boolean =>
  /(?:^|\b)(?:408|425|500|502|503|504|timeout|timed out|network|fetch failed|connection|service unavailable|temporar(?:y|ily)|overloaded)(?:\b|$)/i.test(value);

const looksPermanentProviderFailure = (value: string): boolean =>
  /(?:^|\b)(?:400|401|403|404|409|413|415|422|7003|invalid (?:argument|request|input)|unsupported)(?:\b|$)/i.test(value);

/**
 * Classify only the retry policy; never return raw provider text to callers.
 * The structured warning names are the current runner contract. The pattern
 * fallback keeps jobs deployed during a rolling upgrade safe.
 */
export function classifyPipelineFailure(summary: AiExtractionSummary): {
  failureClass: AiJobFailureClass;
  code: string;
  retryAfterSeconds?: number;
} {
  if (summary.failureKind === "transient_rate_limit") {
    return {
      failureClass: "quota",
      code: "ai_provider_rate_limited",
    };
  }
  if (summary.failureKind === "transient_provider" ||
      summary.failureKind === "provider_unavailable" ||
      summary.failureKind === "stale_generation") {
    return { failureClass: "transient", code: "ai_provider_temporarily_unavailable" };
  }
  if (summary.failureKind === "permanent_request") {
    return { failureClass: "permanent", code: "ai_provider_request_rejected" };
  }
  if (summary.failureKind === "invalid_output" ||
      summary.failureKind === "business_incomplete") {
    return { failureClass: "permanent", code: "ai_documents_not_understood" };
  }

  // Rolling-deployment compatibility for a worker processing an older summary.
  const warnings = summary.stageWarnings ?? [];
  const joined = warnings.join(" ");
  if (warnings.includes("skill_call_rate_limited") || looksRateLimited(joined)) {
    return {
      failureClass: "quota",
      code: "ai_provider_rate_limited",
    };
  }
  if (warnings.includes("skill_call_permanent") || looksPermanentProviderFailure(joined)) {
    return { failureClass: "permanent", code: "ai_provider_request_rejected" };
  }
  if (warnings.includes("skill_call_transient") || looksTransient(joined)) {
    return { failureClass: "transient", code: "ai_provider_temporarily_unavailable" };
  }
  if (warnings.includes("skill_call_failed")) {
    // A transport failure with no usable provider status is safer to retry a
    // bounded number of times than to strand the current generation.
    return { failureClass: "transient", code: "ai_provider_call_failed" };
  }
  return { failureClass: "permanent", code: "ai_documents_not_understood" };
}

export function classifyJobException(error: unknown): {
  failureClass: AiJobFailureClass;
  code: string;
  retryAfterSeconds?: number;
} {
  if (error instanceof AiJobFault) {
    return {
      failureClass: error.failureClass,
      code: error.message,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }
  const message = errorText(error);
  if (looksRateLimited(message)) {
    return {
      failureClass: "quota",
      code: "ai_provider_rate_limited",
    };
  }
  if (looksPermanentProviderFailure(message)) {
    return { failureClass: "permanent", code: "ai_provider_request_rejected" };
  }
  return { failureClass: "transient", code: "ai_runtime_temporarily_unavailable" };
}

export function customerSafeJobDiagnostic(row: {
  failure_class?: string | null;
  last_error?: string | null;
  retry_after?: string | null;
  attempts?: number | null;
}): AiJobDiagnostic {
  const lastError = row.last_error ?? "";
  if (row.failure_class === "quota" || looksRateLimited(lastError) ||
      lastError === "ai_daily_budget_exhausted") {
    return { code: "RATE_LIMITED", retryable: true, retryAt: row.retry_after ?? null };
  }
  if (lastError === "pricing_catalogue_not_ready") {
    return { code: "CATALOGUE_UNAVAILABLE", retryable: true, retryAt: null };
  }
  if (lastError === "ai_provider_request_rejected") {
    return { code: "SERVICE_CONFIGURATION_ERROR", retryable: false, retryAt: null };
  }
  if (row.failure_class === "permanent") {
    return { code: "DOCUMENTS_NOT_UNDERSTOOD", retryable: false, retryAt: null };
  }
  if ((row.attempts ?? 0) >= MAX_AUTOMATIC_ATTEMPTS) {
    return { code: "RETRY_REQUIRED", retryable: true, retryAt: null };
  }
  return {
    code: "TEMPORARY_FAILURE",
    retryable: true,
    retryAt: row.retry_after ?? null,
  };
}

export async function dispatchAiExtractionJob(
  env: Env,
  ctx: ExecutionContext,
  job: AiExtractionJob,
  delaySeconds = 0,
): Promise<void> {
  await env.KV.put(`aidebounce:${job.projectId}`, job.debounceToken, { expirationTtl: 300 });
  try {
    if (env.AI_JOBS) {
      await env.AI_JOBS.send(job, { delaySeconds });
    } else {
      ctx.waitUntil((async () => {
        if (delaySeconds > 0) await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
        await processAiExtractionJob(env, job);
      })());
    }
  } catch {
    // The source manifest and job claim are already durable. Keep the claim
    // recoverable and run the same idempotent processor in this request lifetime
    // rather than recording a terminal queue failure.
    await env.DB.prepare(
      `UPDATE ai_job_claim
          SET last_error='queue_send_failed', failure_class='transient',
              retry_after=NULL, updated_at=datetime('now')
        WHERE project_id=? AND source_generation=? AND status='scheduled'`,
    ).bind(job.projectId, job.generation).run().catch(() => {});
    ctx.waitUntil(processAiExtractionJob(env, job).catch(() => {}));
  }
}

export async function enqueueAiExtraction(
  env: Env,
  ctx: ExecutionContext,
  projectId: string,
  delaySeconds = 10,
): Promise<AiExtractionJob> {
  const current = await env.DB.prepare(
    "SELECT ai_generation FROM project WHERE id=? AND status_customer='draft'",
  ).bind(projectId).first<{ ai_generation: number }>();
  if (!current) throw new Error("project_not_mutable");
  const job: AiExtractionJob = {
    projectId,
    generation: current.ai_generation + 1,
    debounceToken: uuid(),
  };
  const created = await env.DB.batch([
    env.DB.prepare(
      `UPDATE project SET ai_generation=?
        WHERE id=? AND status_customer='draft' AND ai_generation=?`,
    ).bind(job.generation, projectId, current.ai_generation),
    env.DB.prepare(
      `INSERT INTO ai_job_claim
         (project_id, source_generation, debounce_token, status, attempts)
       SELECT ?, ?, ?, 'scheduled', 0
        WHERE EXISTS (
          SELECT 1 FROM project
           WHERE id=? AND status_customer='draft' AND ai_generation=?
        )`,
    ).bind(projectId, job.generation, job.debounceToken, projectId, job.generation),
  ]);
  if (Number(created[0]?.meta?.changes ?? 0) !== 1 ||
      Number(created[1]?.meta?.changes ?? 0) !== 1) {
    throw new Error("ai_generation_conflict");
  }
  await dispatchAiExtractionJob(env, ctx, job, delaySeconds);
  return job;
}

/**
 * Re-run the current failed generation without requiring a fake upload/delete.
 * A completed generation deliberately becomes a new generation so a staff
 * re-evaluation remains an auditable, immutable run.
 */
export async function retryCurrentAiExtraction(
  env: Env,
  ctx: ExecutionContext,
  projectId: string,
): Promise<{ job: AiExtractionJob; alreadyQueued: boolean }> {
  const current = await env.DB.prepare(
    `SELECT p.ai_generation, p.status_customer, j.status, j.debounce_token
       FROM project p
       LEFT JOIN ai_job_claim j
         ON j.project_id=p.id AND j.source_generation=p.ai_generation
      WHERE p.id=?`,
  ).bind(projectId).first<{
    ai_generation: number;
    status_customer: string;
    status: string | null;
    debounce_token: string | null;
  }>();
  if (!current) throw new Error("project_not_found");
  if (current.status_customer !== "draft") throw new Error("project_not_mutable");

  if ((current.status === "scheduled" || current.status === "processing") &&
      current.debounce_token) {
    return {
      job: {
        projectId,
        generation: current.ai_generation,
        debounceToken: current.debounce_token,
      },
      alreadyQueued: true,
    };
  }

  if (current.status === "failed") {
    const job: AiExtractionJob = {
      projectId,
      generation: current.ai_generation,
      debounceToken: uuid(),
    };
    const reset = await env.DB.prepare(
      `UPDATE ai_job_claim
          SET status='scheduled', attempts=0, debounce_token=?,
              processing_token=NULL, lease_expires_at=NULL,
              last_error=NULL, failure_class=NULL, retry_after=NULL,
              progress_stage='queued', updated_at=datetime('now')
        WHERE project_id=? AND source_generation=? AND status='failed'
          AND EXISTS (
            SELECT 1 FROM project
             WHERE id=? AND status_customer='draft' AND ai_generation=?
          )`,
    ).bind(
      job.debounceToken,
      projectId,
      job.generation,
      projectId,
      job.generation,
    ).run();
    if (Number(reset.meta?.changes ?? 0) !== 1) throw new Error("ai_generation_conflict");
    await dispatchAiExtractionJob(env, ctx, job, 0);
    return { job, alreadyQueued: false };
  }

  return { job: await enqueueAiExtraction(env, ctx, projectId, 0), alreadyQueued: false };
}

async function recordJobFailure(
  env: Env,
  job: AiExtractionJob,
  processingToken: string,
  attempts: number,
  failure: { failureClass: AiJobFailureClass; code: string; retryAfterSeconds?: number },
): Promise<AiJobProcessingResult> {
  if (failure.failureClass === "quota") {
    // Cloudflare AI Gateway is the sole provider-rate authority. Do not create
    // a second application throttle or guess its reset window: record the 429
    // as a customer-safe, retryable error and acknowledge this queue attempt.
    const recorded = await env.DB.prepare(
      `UPDATE ai_job_claim
          SET status='failed', attempts=max(0, attempts-1),
              lease_expires_at=NULL, processing_token=NULL,
              last_error=?, failure_class='quota',
              retry_after=NULL, progress_stage='waiting_capacity',
              updated_at=datetime('now')
        WHERE project_id=? AND source_generation=? AND status='processing'
          AND processing_token=?`,
    ).bind(
      failure.code,
      job.projectId,
      job.generation,
      processingToken,
    ).run();
    if (Number(recorded.meta?.changes ?? 0) !== 1) return { state: "leased" };
    await clearDebounceIfCurrent(env, job);
    return { state: "failed" };
  }

  const canRetry = failure.failureClass === "transient" && attempts < MAX_AUTOMATIC_ATTEMPTS;
  const delaySeconds = attempts <= 1 ? 30 : 120;
  const transitioned = await env.DB.prepare(
    `UPDATE ai_job_claim
        SET status=?, lease_expires_at=NULL, processing_token=NULL,
            last_error=?, failure_class=?,
            retry_after=CASE WHEN ? IS NULL THEN NULL ELSE datetime('now', ?) END,
            progress_stage=CASE WHEN ? IS NULL THEN progress_stage ELSE 'queued' END,
            updated_at=datetime('now')
      WHERE project_id=? AND source_generation=? AND status='processing'
        AND processing_token=?`,
  ).bind(
    canRetry ? "scheduled" : "failed",
    failure.code,
    failure.failureClass,
    canRetry ? 1 : null,
    canRetry ? `+${delaySeconds} seconds` : null,
    canRetry ? 1 : null,
    job.projectId,
    job.generation,
    processingToken,
  ).run();
  if (Number(transitioned.meta?.changes ?? 0) !== 1) return { state: "leased" };
  if (!canRetry) await clearDebounceIfCurrent(env, job);
  return canRetry
    ? { state: "deferred", retryAfterSeconds: delaySeconds }
    : { state: "failed" };
}

async function clearDebounceIfCurrent(env: Env, job: AiExtractionJob): Promise<void> {
  const key = `aidebounce:${job.projectId}`;
  const latestToken = await env.KV.get(key).catch(() => null);
  if (latestToken === job.debounceToken) await env.KV.delete(key).catch(() => {});
}

export async function processAiExtractionJob(
  env: Env,
  job: AiExtractionJob,
): Promise<AiJobProcessingResult> {
  const debounceKey = `aidebounce:${job.projectId}`;
  const project = await env.DB.prepare(
    "SELECT ai_generation, status_customer FROM project WHERE id = ?",
  ).bind(job.projectId).first<{ ai_generation: number; status_customer: string }>();
  if (!project || project.status_customer !== "draft" || project.ai_generation !== job.generation) {
    await env.DB.prepare(
      `UPDATE ai_job_claim SET status='superseded', updated_at=datetime('now')
        WHERE project_id=? AND source_generation=? AND status='scheduled'`,
    ).bind(job.projectId, job.generation).run().catch(() => {});
    return { state: "stale" };
  }

  const processingToken = uuid();
  const claim = await env.DB.prepare(
    `UPDATE ai_job_claim
        SET status='processing', attempts=attempts+1, debounce_token=?,
            processing_token=?, last_error=NULL, failure_class=NULL,
            retry_after=NULL, lease_expires_at=datetime('now','+10 minutes'),
            progress_stage='reading_documents', updated_at=datetime('now')
      WHERE project_id=? AND source_generation=?
        AND (
          (status='scheduled' AND (retry_after IS NULL OR retry_after <= datetime('now')))
          OR (status='processing' AND lease_expires_at < datetime('now'))
        )
        AND attempts < ?
      RETURNING project_id, attempts`,
  ).bind(
    job.debounceToken,
    processingToken,
    job.projectId,
    job.generation,
    MAX_AUTOMATIC_ATTEMPTS,
  ).first<{ project_id: string; attempts: number }>();
  if (!claim) {
    const existing = await env.DB.prepare(
      "SELECT status, attempts, retry_after FROM ai_job_claim WHERE project_id=? AND source_generation=?",
    ).bind(job.projectId, job.generation).first<{
      status: string;
      attempts: number;
      retry_after: string | null;
    }>();
    if (existing?.status === "processing") return { state: "leased" };
    if (existing?.status === "scheduled" && existing.retry_after) {
      // D1 timestamps are intentionally interpreted by D1, not JavaScript:
      // `YYYY-MM-DD HH:MM:SS` parsing is implementation-dependent in JS.
      return { state: "deferred", retryAfterSeconds: 60 };
    }
    return { state: existing?.status === "failed" ? "failed" : "stale" };
  }

  // Keep ownership for long multi-document runs. Every state transition remains
  // token-guarded in case ownership is genuinely lost despite the heartbeat.
  let heartbeatLost = false;
  const heartbeat = setInterval(() => {
    void env.DB.prepare(
      `UPDATE ai_job_claim SET lease_expires_at=datetime('now','+10 minutes'),
          updated_at=datetime('now')
        WHERE project_id=? AND source_generation=? AND status='processing'
          AND processing_token=?`,
    ).bind(job.projectId, job.generation, processingToken).run()
      .then((result) => {
        if (Number(result.meta?.changes ?? 0) !== 1) heartbeatLost = true;
      })
      .catch(() => {
        // A single D1 failure is not proof the lease is lost; the final
        // token-guarded transition remains authoritative.
      });
  }, 120_000);

  try {
    if (!(await hasAnyExactPricingCoverage(env))) {
      throw new AiJobFault("pricing_catalogue_not_ready", "permanent");
    }

    const summary = await runAiExtraction(env, job.projectId, {
      sourceGeneration: job.generation,
      processingToken,
    });
    if (summary.status === "failed") {
      return await recordJobFailure(
        env,
        job,
        processingToken,
        claim.attempts,
        classifyPipelineFailure(summary),
      );
    }
    if (summary.status === "partial") {
      const partialFailure = classifyPipelineFailure(summary);
      // A partial result caused by throttling or transport trouble is not a
      // stable business outcome: retry so the missing document can be filled
      // from the provider while completed stages replay from cache. Permanently
      // unparseable documents remain an honest terminal partial result for human
      // review instead of repeating the same paid call.
      if (partialFailure.failureClass === "quota" ||
          (partialFailure.failureClass === "transient" &&
            claim.attempts < MAX_AUTOMATIC_ATTEMPTS)) {
        return await recordJobFailure(
          env,
          job,
          processingToken,
          claim.attempts,
          partialFailure,
        );
      }
    }
    if (heartbeatLost) {
      return await recordJobFailure(env, job, processingToken, claim.attempts, {
        failureClass: "transient",
        code: "ai_job_lease_lost",
      });
    }
    const completed = await env.DB.prepare(
      `UPDATE ai_job_claim
          SET status='completed', lease_expires_at=NULL,
              processing_token=NULL, last_error=NULL, failure_class=NULL,
              retry_after=NULL, progress_stage='complete',
              updated_at=datetime('now')
        WHERE project_id=? AND source_generation=? AND status='processing'
          AND processing_token=?`,
    ).bind(job.projectId, job.generation, processingToken).run();
    if (Number(completed.meta?.changes ?? 0) !== 1) return { state: "leased" };
    const latestToken = await env.KV.get(debounceKey);
    if (latestToken === job.debounceToken) await env.KV.delete(debounceKey).catch(() => {});
    return { state: "processed" };
  } catch (error) {
    return await recordJobFailure(
      env,
      job,
      processingToken,
      claim.attempts,
      classifyJobException(error),
    );
  } finally {
    clearInterval(heartbeat);
  }
}

export async function consumeAiJobs(
  batch: MessageBatch<AiExtractionJob>,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const result = await processAiExtractionJob(env, message.body);
      if (result.state === "deferred" || result.state === "leased") {
        message.retry({
          delaySeconds: result.retryAfterSeconds ?? (result.state === "leased" ? 310 : 60),
        });
      } else {
        // Permanent and exhausted failures are durable in D1. Retrying the same
        // immutable input would only repeat spend, so acknowledge the queue item.
        message.ack();
      }
    } catch {
      // A failure before the claim could durably record its state (typically D1
      // itself) remains a queue-level transient failure.
      message.retry({ delaySeconds: 30 });
    }
  }
}

/**
 * Recover work whose isolate died and re-dispatch due scheduled work that lost
 * its queue message. A run is cancelled only when its exact generation's lease
 * was atomically reclaimed; unrelated long-running work is never age-reaped.
 */
export async function reapAbandonedAiJobs(env: Env): Promise<{ claims: number; runs: number }> {
  const { results: expired } = await env.DB.prepare(
    `SELECT project_id, source_generation, debounce_token, processing_token, attempts
       FROM ai_job_claim
      WHERE status='processing' AND lease_expires_at IS NOT NULL
        AND lease_expires_at < datetime('now')`,
  ).all<{
    project_id: string;
    source_generation: number;
    debounce_token: string;
    processing_token: string | null;
    attempts: number;
  }>();

  let claims = 0;
  let runs = 0;
  const redispatch: AiExtractionJob[] = [];
  for (const row of expired ?? []) {
    if (!row.processing_token) continue;
    const retryable = row.attempts < MAX_AUTOMATIC_ATTEMPTS;
    const changed = await env.DB.prepare(
      `UPDATE ai_job_claim
          SET status=?, last_error='lease_expired_abandoned',
              failure_class='transient',
              retry_after=CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END,
              lease_expires_at=NULL, processing_token=NULL,
              progress_stage=CASE WHEN ? IS NULL THEN progress_stage ELSE 'queued' END,
              updated_at=datetime('now')
        WHERE project_id=? AND source_generation=? AND status='processing'
          AND processing_token=? AND lease_expires_at < datetime('now')`,
    ).bind(
      retryable ? "scheduled" : "failed",
      retryable ? 1 : null,
      retryable ? 1 : null,
      row.project_id,
      row.source_generation,
      row.processing_token,
    ).run();
    if (Number(changed.meta?.changes ?? 0) !== 1) continue;
    claims++;
    const cancelled = await env.DB.prepare(
      `UPDATE ai_runs
          SET status='cancelled', completed_at=datetime('now')
        WHERE project_id=? AND source_generation=? AND status='running'`,
    ).bind(row.project_id, row.source_generation).run();
    runs += Number(cancelled.meta?.changes ?? 0);
    if (retryable) {
      redispatch.push({
        projectId: row.project_id,
        generation: row.source_generation,
        debounceToken: row.debounce_token,
      });
    }
  }

  // Also recover a scheduled claim whose producer send failed or whose deferred
  // queue message disappeared. The five-minute age avoids duplicating an
  // ordinary delayed message; claim ownership makes any duplicate harmless.
  const { results: stranded } = await env.DB.prepare(
    `SELECT j.project_id, j.source_generation, j.debounce_token
       FROM ai_job_claim j
       JOIN project p ON p.id=j.project_id AND p.ai_generation=j.source_generation
      WHERE j.status='scheduled'
        AND (j.retry_after IS NULL OR j.retry_after <= datetime('now'))
        AND j.updated_at < datetime('now','-5 minutes')
        AND p.status_customer='draft'
      LIMIT 100`,
  ).all<{
    project_id: string;
    source_generation: number;
    debounce_token: string;
  }>();
  for (const row of stranded ?? []) {
    redispatch.push({
      projectId: row.project_id,
      generation: row.source_generation,
      debounceToken: row.debounce_token,
    });
  }

  for (const job of redispatch) {
    if (env.AI_JOBS) {
      await env.AI_JOBS.send(job).catch(() => {});
    } else {
      await processAiExtractionJob(env, job).catch(() => {});
    }
  }
  return { claims, runs };
}
