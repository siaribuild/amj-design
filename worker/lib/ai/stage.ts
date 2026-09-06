// Stage runner (LLM strategy §6.1, §18.1) — every AI skill invocation goes
// through here so it is IDEMPOTENT, VERSION-STAMPED and ESCALATION-AWARE.
//
// Idempotency: the input hash folds in pipeline version + skill id + prompt
// version + model + payload hash, closing the §6.1 gap where a prompt or model
// change would have served a stale result. A completed stage with the same hash
// (any run of the same project) is replayed from its R2 archive instead of
// re-spending — and its content is RE-VALIDATED through the skill's clamp before
// being trusted, since R2 is storage, not a trust boundary.
//
// Shadow escalation (owner decision 2026-07-25): when §13.2 triggers fire we
// record escalation_triggered + reasons on ai_stage_runs for frequency analysis,
// but the escalation model is only actually CALLED when AI_ESCALATION_MODE='on'.
// Until then the primary-model result (or its failure state) stands.
import type { Env } from "../../types";
import { sha256hex } from "./hash";
import { uuid } from "../util";
import { runSkill } from "../estimator/skills/runner";
import type { Skill, SkillFailureKind, SkillRun } from "../estimator/skills/types";
import { evaluateEscalation, type EscalationDecision, type StageSignals } from "./escalation";
import { PIPELINE_VERSION, primaryModel, escalationModel, escalationEnabled } from "./versions";

const enc = new TextEncoder();
const safeSeg = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);

/** §7.1 R2 key for a stage's archived raw result. Traversal-safe. */
export const stageRawKey = (projectId: string, runId: string, stage: string, inputHash: string): string =>
  `projects/${safeSeg(projectId)}/runs/${safeSeg(runId)}/raw/${safeSeg(stage)}-${safeSeg(inputHash)}.json`;

/** Replace inline image bodies with content digests before JSON serialisation.
 * Images are processed sequentially so a multimodal turn never duplicates all
 * active base64 strings into one second, isolate-sized JSON value. */
export async function stageHashPayload(value: unknown): Promise<unknown> {
  if (typeof value === "string" && /^data:image\/[^;,]+;base64,/i.test(value)) {
    return { sha256: await sha256hex(enc.encode(value)), chars: value.length };
  }
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) items.push(await stageHashPayload(item));
    return items;
  }
  if (value && typeof value === "object") {
    const row: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) row[key] = await stageHashPayload(item);
    return row;
  }
  return value;
}

/** The §6.1-corrected idempotency key. Pure + exported so tests can prove that a
 *  prompt, model or pipeline change produces a DIFFERENT hash (i.e. a re-run). */
export async function stageInputHash(parts: {
  pipelineVersion: string; stage: string; promptVersion: string; model: string; reasoningEffort?: string; payload: unknown;
}): Promise<string> {
  const payloadHash = await sha256hex(enc.encode(JSON.stringify(await stageHashPayload(parts.payload)) ?? "null"));
  return sha256hex(enc.encode(
    `${parts.pipelineVersion}|${parts.stage}|${parts.promptVersion}|${parts.model}|${parts.reasoningEffort ?? ""}|${payloadHash}`,
  ));
}

export interface StageArgs<I, O> {
  aiRunId: string;
  projectId: string;
  skill: Skill<I, O>;
  input: I;
  model?: string;
  reasoningEffort?: string;
  /** Derive §13.2 escalation signals from the validated output (optional —
   *  schema failure is always signalled automatically). */
  signals?: (data: O | null, run: SkillRun<O>) => StageSignals;
  /** Absolute time after which nothing new is dispatched inside this stage:
   *  each call waits at most what remains, and neither the repair pass nor the
   *  escalation is taken past it (round fourteen). Only the face-mapped drawing
   *  stage passes one. */
  deadlineAt?: number;
}

export interface StageResult<O> {
  ok: boolean;
  data: O | null;
  /** True when replayed from the R2 archive without a model call. */
  cached: boolean;
  escalation: EscalationDecision & { taken: boolean };
  stageRunId: string | null;
  warnings: string[];
  failureKind: SkillFailureKind | null;
  modelCalls: number;
  repaired: boolean;
  inputTokens: number;
  outputTokens: number;
}

/** Promotes a failed stage through a caller that otherwise returns only data. */
export class StageCallError extends Error {
  constructor(
    readonly failureKind: SkillFailureKind | null,
    readonly warnings: string[],
  ) {
    super(`stage_call_failed:${failureKind ?? "unknown"}:${warnings.join("|")}`);
  }
}

interface CachedRow { id: string; result_r2_key: string | null }

export async function runStage<I, O>(env: Env, args: StageArgs<I, O>): Promise<StageResult<O>> {
  const { aiRunId, projectId, skill, input } = args;
  const model = args.model ?? primaryModel(env);
  const inputHash = await stageInputHash({
    pipelineVersion: PIPELINE_VERSION, stage: skill.id, promptVersion: skill.promptVersion,
    model, reasoningEffort: args.reasoningEffort, payload: input,
  });

  // ── Idempotent replay: any completed run of this project with the same hash ──
  //
  // OFF BY DEFAULT (owner, 2026-08-06): accurate testing beats saved spend while
  // extraction is being actively changed. A replay is invisible in the product —
  // the run completes in milliseconds and reports the same numbers — so a test of
  // "did extraction improve?" silently answers with the previous answer. Clearing
  // the project does not help: the archive is keyed on document content, prompt
  // version, model and pipeline version, scoped to the project and nothing else,
  // so deleting and re-uploading the same bytes hits the same entry.
  //
  // The mechanism is kept, not deleted: set AI_STAGE_CACHE='on' to restore it once
  // extraction settles and the saved model spend is worth more than the certainty.
  const replayEnabled = String(env.AI_STAGE_CACHE ?? "").toLowerCase() === "on";
  const hit = replayEnabled ? await env.DB.prepare(
    `SELECT s.id, s.result_r2_key FROM ai_stage_runs s
       JOIN ai_runs r ON r.id = s.ai_run_id
      WHERE r.project_id = ? AND s.stage = ? AND s.input_hash = ? AND s.status = 'completed'
      ORDER BY s.created_at DESC LIMIT 1`,
  ).bind(projectId, skill.id, inputHash).first<CachedRow>().catch(() => null) : null;
  if (hit?.result_r2_key) {
    const obj = await env.FILES.get(hit.result_r2_key).catch(() => null);
    if (obj) {
      const raw = await obj.text().catch(() => "");
      // Storage is not a trust boundary: replayed content goes back through the clamp.
      const data = skill.validate(raw);
      if (data != null) {
        return {
          ok: true, data, cached: true,
          escalation: { triggered: false, reasons: [], taken: false },
          stageRunId: hit.id, warnings: ["stage_replayed"], failureKind: null,
          modelCalls: 0, repaired: false, inputTokens: 0, outputTokens: 0,
        };
      }
    }
    // Archive missing/corrupt ⇒ fall through to a fresh run.
  }

  // Persist the in-flight stage BEFORE calling the provider. Previously the row
  // was written only after the call returned, so a killed invocation left no
  // evidence of which model task had stalled.
  const proposedStageRunId = uuid();
  const stageRow = await env.DB.prepare(
    `INSERT INTO ai_stage_runs
       (id, ai_run_id, stage, model, prompt_version, input_hash, status)
     VALUES (?,?,?,?,?,?,'running')
     ON CONFLICT(ai_run_id, stage, input_hash) DO UPDATE SET
       model=excluded.model, prompt_version=excluded.prompt_version, status='running',
       result_r2_key=NULL, output_hash=NULL, escalation_triggered=0,
       escalation_reasons=NULL, escalation_taken=0, input_tokens=NULL,
       output_tokens=NULL, metrics_json=NULL
     RETURNING id`,
  ).bind(
    proposedStageRunId, aiRunId, skill.id, model, skill.promptVersion, inputHash,
  ).first<{ id: string }>().catch(() => null);
  const stageRunId = stageRow?.id ?? proposedStageRunId;

  // ── Fresh primary-model run (with the runner's single §22.3 repair pass) ─────
  let run = await runSkill(env, skill, input, {
    model,
    reasoningEffort: args.reasoningEffort,
    telemetry: { aiRunId, projectId },
    deadlineAt: args.deadlineAt,
  });
  let modelCalls = run.modelCalls;
  let inputTokens = run.inputTokens;
  let outputTokens = run.outputTokens;
  let repaired = run.repaired;

  // ── Escalation decision — always EVALUATED, only conditionally TAKEN ─────────
  const signals: StageSignals = { ...(args.signals?.(run.data, run) ?? {}) };
  if (run.failureKind === "invalid_output") signals.schemaFailedAfterRepair = true;
  const decision = evaluateEscalation(signals);
  let taken = false;
  const pastDeadline = args.deadlineAt != null && Date.now() >= args.deadlineAt;
  // A skipped escalation says so, or `triggered` without `taken` reads as
  // shadow mode.
  if (decision.triggered && escalationEnabled(env) && pastDeadline) run.warnings.push("skill_escalation_skipped:deadline");
  if (decision.triggered && escalationEnabled(env) && !pastDeadline) {
    const escalated = await runSkill(env, skill, input, {
      model: escalationModel(env),
      reasoningEffort: args.reasoningEffort,
      telemetry: { aiRunId, projectId },
      deadlineAt: args.deadlineAt,
    });
    modelCalls += escalated.modelCalls;
    inputTokens += escalated.inputTokens;
    outputTokens += escalated.outputTokens;
    repaired ||= escalated.repaired;
    if (escalated.ok) { run = escalated; taken = true; }
    // An escalation the deadline cut short keeps that reason on the record.
    else run.warnings.push(...escalated.warnings.filter((warning) => /ai_model_timeout_|skill_repair_timeout|skill_repair_skipped:deadline/.test(warning)).map((warning) => `escalation:${warning}`));
  }

  // ── Archive the raw output to R2 (§7.1) ─────────────────────────────────────
  let r2Key: string | null = null;
  if (run.ok && run.data != null) {
    r2Key = stageRawKey(projectId, aiRunId, skill.id, inputHash);
    // Archive exactly what the validator accepted, re-serialized (canonical form).
    await env.FILES.put(r2Key, JSON.stringify(run.data)).catch(() => { r2Key = null; });
  } else if (run.rejectedRaw) {
    // And archive what it REJECTED. Only the accepted output was ever kept, so
    // `skill_output_invalid` — the model answered, we threw it away — was the
    // one failure with nothing to look at. Lives under the same runs/ prefix,
    // which the file-delete path already purges, so it inherits that lifecycle
    // rather than becoming a second retention question.
    const rejectedKey = `${stageRawKey(projectId, aiRunId, skill.id, inputHash)}.rejected`;
    // Record the key too: archiving it and not saying where cost a manual
    // reconstruction from the input hash the first time it was needed.
    await env.FILES.put(rejectedKey, run.rejectedRaw)
      .then(() => { r2Key = rejectedKey; })
      .catch(() => { /* diagnostics are best-effort */ });
  }

  // ── Persist the stage result onto the unique run/stage/input record ──────────
  const status = run.ok ? "completed" : (run.warnings.includes("skill_call_failed") ? "failed" : "invalid");
  await env.DB.prepare(
    `UPDATE ai_stage_runs
        SET model=?, prompt_version=?, status=?, result_r2_key=?, output_hash=?,
            escalation_triggered=?, escalation_reasons=?, escalation_taken=?,
             input_tokens=?, output_tokens=?, metrics_json=?
       WHERE ai_run_id=? AND stage=? AND input_hash=?`,
  ).bind(
    run.modelId, skill.promptVersion, status, r2Key, run.outputHash,
    decision.triggered ? 1 : 0, decision.reasons.length ? JSON.stringify(decision.reasons) : null, taken ? 1 : 0,
    inputTokens ?? null, outputTokens ?? null,
    JSON.stringify({ failureKind: run.failureKind, warnings: run.warnings }),
    aiRunId, skill.id, inputHash,
  ).run().catch(() => { /* the stage record is observability, never a blocker */ });

  return {
    ok: run.ok, data: run.data, cached: false,
    escalation: { ...decision, taken }, stageRunId, warnings: run.warnings,
    failureKind: run.failureKind, modelCalls, repaired, inputTokens, outputTokens,
  };
}
