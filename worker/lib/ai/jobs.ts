import type { Env } from "../../types";
import { runAiExtraction } from "./pipeline";
import { uuid } from "../util";
import { hasAnyExactPricingCoverage } from "../estimator/catalogue";

export interface AiExtractionJob {
  projectId: string;
  generation: number;
  debounceToken: string;
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
    await env.DB.prepare(
      `UPDATE ai_job_claim SET status='failed', last_error=?, updated_at=datetime('now')
        WHERE project_id=? AND source_generation=?`,
    ).bind("queue_send_failed", job.projectId, job.generation).run().catch(() => {});
    // The source manifest and job claim are already durable. Run the same
    // idempotent processor in this request lifetime rather than orphaning it.
    ctx.waitUntil(processAiExtractionJob(env, job).catch(() => {}));
  }
}

export async function reserveAiRunBudget(env: Env, projectId: string): Promise<boolean> {
  const owner = await env.DB.prepare("SELECT owner_user_id FROM project WHERE id=?")
    .bind(projectId).first<{ owner_user_id: string | null }>();
  if (!owner?.owner_user_id) return false;
  const configured = Number.parseInt(env.AI_DAILY_RUN_LIMIT ?? "20", 10);
  const limit = Number.isFinite(configured) ? Math.max(1, Math.min(configured, 200)) : 20;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO ai_daily_usage (user_id, usage_day, runs)
     VALUES (?, date('now'), 0)`,
  ).bind(owner.owner_user_id).run();
  const reserved = await env.DB.prepare(
    `UPDATE ai_daily_usage SET runs=runs+1, updated_at=datetime('now')
      WHERE user_id=? AND usage_day=date('now') AND runs < ?
      RETURNING runs`,
  ).bind(owner.owner_user_id, limit).first<{ runs: number }>();
  return !!reserved;
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

export async function processAiExtractionJob(env: Env, job: AiExtractionJob): Promise<"processed" | "stale" | "leased"> {
  const debounceKey = `aidebounce:${job.projectId}`;
  const project = await env.DB.prepare("SELECT ai_generation, status_customer FROM project WHERE id = ?")
    .bind(job.projectId).first<{ ai_generation: number; status_customer: string }>();
  if (!project || project.status_customer !== "draft" || project.ai_generation !== job.generation) {
    await env.DB.prepare(
      `UPDATE ai_job_claim SET status='superseded', updated_at=datetime('now')
        WHERE project_id=? AND source_generation=? AND status='scheduled'`,
    ).bind(job.projectId, job.generation).run().catch(() => {});
    return "stale";
  }

  const processingToken = uuid();
  const claim = await env.DB.prepare(
    `UPDATE ai_job_claim
        SET status='processing', attempts=attempts+1, debounce_token=?,
            processing_token=?,
            last_error=NULL, lease_expires_at=datetime('now','+10 minutes'),
            updated_at=datetime('now')
      WHERE project_id=? AND source_generation=?
        AND (
          status IN ('scheduled','failed')
          OR (status='processing' AND lease_expires_at < datetime('now'))
        )
        AND attempts < 3
      RETURNING project_id`,
  ).bind(job.debounceToken, processingToken, job.projectId, job.generation).first<{ project_id: string }>();
  const claimed = !!claim;
  if (!claimed) {
    const existing = await env.DB.prepare(
      "SELECT status, attempts FROM ai_job_claim WHERE project_id=? AND source_generation=?",
    ).bind(job.projectId, job.generation).first<{ status: string; attempts: number }>();
    if (existing?.status === "failed" && existing.attempts >= 3) {
      throw new Error("ai_job_attempts_exhausted");
    }
    if (existing?.status === "processing") return "leased";
    return "stale";
  }

  // Keep ownership for long multi-document runs. Without renewal, a healthy job
  // that exceeds the initial lease can be reclaimed and duplicate provider spend.
  // Every state transition remains token-guarded in case ownership is genuinely
  // lost despite the heartbeat.
  const heartbeat = setInterval(() => {
    void env.DB.prepare(
      `UPDATE ai_job_claim SET lease_expires_at=datetime('now','+10 minutes'),
          updated_at=datetime('now')
        WHERE project_id=? AND source_generation=? AND status='processing'
          AND processing_token=?`,
    ).bind(job.projectId, job.generation, processingToken).run().catch(() => {});
  }, 120_000);

  try {
    if (!(await hasAnyExactPricingCoverage(env))) {
      throw new Error("pricing_catalogue_not_ready");
    }
    if (!(await reserveAiRunBudget(env, job.projectId))) throw new Error("ai_daily_budget_exhausted");
    const summary = await runAiExtraction(env, job.projectId, { sourceGeneration: job.generation });
    if (summary.status === "failed") throw new Error("ai_pipeline_failed");
    const completed = await env.DB.prepare(
      `UPDATE ai_job_claim SET status='completed', lease_expires_at=NULL,
          processing_token=NULL, updated_at=datetime('now')
        WHERE project_id=? AND source_generation=? AND processing_token=?`,
    ).bind(job.projectId, job.generation, processingToken).run();
    if (Number(completed.meta?.changes ?? 0) !== 1) throw new Error("ai_job_lease_lost");
    const latestToken = await env.KV.get(debounceKey);
    if (latestToken === job.debounceToken) await env.KV.delete(debounceKey).catch(() => {});
    return "processed";
  } catch (error) {
    await env.DB.prepare(
      `UPDATE ai_job_claim SET status='failed', lease_expires_at=NULL, processing_token=NULL,
          last_error=?, updated_at=datetime('now')
        WHERE project_id=? AND source_generation=? AND processing_token=?`,
    ).bind(
      error instanceof Error ? error.message.slice(0, 200) : "unknown",
      job.projectId, job.generation, processingToken,
    ).run().catch(() => {});
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

export async function consumeAiJobs(batch: MessageBatch<AiExtractionJob>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      const result = await processAiExtractionJob(env, message.body);
      if (result === "leased") message.retry({ delaySeconds: 310 });
      else message.ack();
    } catch {
      message.retry();
    }
  }
}

/** Release claims whose lease expired with nobody coming back for them, and
 *  close the runs they abandoned.
 *
 *  A claim is only ever reclaimed by the NEXT dispatch for the same generation
 *  (see the `lease_expires_at < now` arm of the claim UPDATE above). When the
 *  isolate handling a job dies — a deploy mid-run, an eviction, a hung provider
 *  call — no such dispatch ever comes, so the row sits in 'processing' forever
 *  and ai_runs sits in 'running'. The customer's screen polls that run and says
 *  "reading your documents" indefinitely, which is what happened after a deploy
 *  landed on top of an in-flight run.
 *
 *  Runs are marked 'cancelled', not 'failed': the pipeline never reached a
 *  verdict, and recording a failure it did not actually produce would poison
 *  both the failure statistics and the learning record. */
export async function reapAbandonedAiJobs(env: Env): Promise<{ claims: number; runs: number }> {
  const claims = await env.DB.prepare(
    `UPDATE ai_job_claim
        SET status='failed', last_error='lease_expired_abandoned',
            lease_expires_at=NULL, processing_token=NULL, updated_at=datetime('now')
      WHERE status='processing' AND lease_expires_at IS NOT NULL
        AND lease_expires_at < datetime('now')`,
  ).run();
  // Generous grace beyond the 10-minute lease: a live run renews its lease every
  // two minutes, so anything this old is not merely slow.
  const runs = await env.DB.prepare(
    `UPDATE ai_runs
        SET status='cancelled', completed_at=datetime('now')
      WHERE status='running' AND started_at < datetime('now','-20 minutes')`,
  ).run();
  return {
    claims: Number(claims.meta?.changes ?? 0),
    runs: Number(runs.meta?.changes ?? 0),
  };
}
