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
import type { Skill, SkillRun } from "../estimator/skills/types";
import { evaluateEscalation, type EscalationDecision, type StageSignals } from "./escalation";
import { PIPELINE_VERSION, primaryModel, escalationModel, escalationEnabled } from "./versions";

const enc = new TextEncoder();
const safeSeg = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);

/** §7.1 R2 key for a stage's archived raw result. Traversal-safe. */
export const stageRawKey = (projectId: string, runId: string, stage: string): string =>
  `projects/${safeSeg(projectId)}/runs/${safeSeg(runId)}/raw/${safeSeg(stage)}.json`;

/** The §6.1-corrected idempotency key. Pure + exported so tests can prove that a
 *  prompt, model or pipeline change produces a DIFFERENT hash (i.e. a re-run). */
export async function stageInputHash(parts: {
  pipelineVersion: string; stage: string; promptVersion: string; model: string; payload: unknown;
}): Promise<string> {
  const payloadHash = await sha256hex(enc.encode(JSON.stringify(parts.payload) ?? "null"));
  return sha256hex(enc.encode(
    `${parts.pipelineVersion}|${parts.stage}|${parts.promptVersion}|${parts.model}|${payloadHash}`,
  ));
}

export interface StageArgs<I, O> {
  aiRunId: string;
  projectId: string;
  skill: Skill<I, O>;
  input: I;
  /** Derive §13.2 escalation signals from the validated output (optional —
   *  schema failure is always signalled automatically). */
  signals?: (data: O | null, run: SkillRun<O>) => StageSignals;
}

export interface StageResult<O> {
  ok: boolean;
  data: O | null;
  /** True when replayed from the R2 archive without a model call. */
  cached: boolean;
  escalation: EscalationDecision & { taken: boolean };
  stageRunId: string | null;
  warnings: string[];
}

interface CachedRow { id: string; result_r2_key: string | null }

export async function runStage<I, O>(env: Env, args: StageArgs<I, O>): Promise<StageResult<O>> {
  const { aiRunId, projectId, skill, input } = args;
  const model = primaryModel(env);
  const inputHash = await stageInputHash({
    pipelineVersion: PIPELINE_VERSION, stage: skill.id, promptVersion: skill.promptVersion, model, payload: input,
  });

  // ── Idempotent replay: any completed run of this project with the same hash ──
  const hit = await env.DB.prepare(
    `SELECT s.id, s.result_r2_key FROM ai_stage_runs s
       JOIN ai_runs r ON r.id = s.ai_run_id
      WHERE r.project_id = ? AND s.stage = ? AND s.input_hash = ? AND s.status = 'completed'
      ORDER BY s.created_at DESC LIMIT 1`,
  ).bind(projectId, skill.id, inputHash).first<CachedRow>().catch(() => null);
  if (hit?.result_r2_key) {
    const obj = await env.FILES.get(hit.result_r2_key).catch(() => null);
    if (obj) {
      const raw = await obj.text().catch(() => "");
      // Storage is not a trust boundary: replayed content goes back through the clamp.
      const data = skill.validate(raw);
      if (data != null) {
        return { ok: true, data, cached: true, escalation: { triggered: false, reasons: [], taken: false }, stageRunId: hit.id, warnings: ["stage_replayed"] };
      }
    }
    // Archive missing/corrupt ⇒ fall through to a fresh run.
  }

  // ── Fresh primary-model run (with the runner's single §22.3 repair pass) ─────
  let run = await runSkill(env, skill, input);

  // ── Escalation decision — always EVALUATED, only conditionally TAKEN ─────────
  const signals: StageSignals = { ...(args.signals?.(run.data, run) ?? {}) };
  if (!run.ok) signals.schemaFailedAfterRepair = true;
  const decision = evaluateEscalation(signals);
  let taken = false;
  if (decision.triggered && escalationEnabled(env)) {
    const escalated = await runSkill(env, skill, input, { model: escalationModel(env) });
    if (escalated.ok) { run = escalated; taken = true; }
  }

  // ── Archive the accepted raw output to R2 (§7.1) — only when usable ──────────
  let r2Key: string | null = null;
  if (run.ok && run.data != null) {
    r2Key = stageRawKey(projectId, aiRunId, skill.id);
    // Archive exactly what the validator accepted, re-serialized (canonical form).
    await env.FILES.put(r2Key, JSON.stringify(run.data)).catch(() => { r2Key = null; });
  }

  // ── Persist the stage record (OR REPLACE keeps within-run retries clean) ─────
  const stageRunId = uuid();
  const status = run.ok ? "completed" : (run.warnings.includes("skill_call_failed") ? "failed" : "invalid");
  await env.DB.prepare(
    `INSERT OR REPLACE INTO ai_stage_runs
       (id, ai_run_id, stage, model, prompt_version, input_hash, status, result_r2_key, output_hash,
        escalation_triggered, escalation_reasons, escalation_taken, input_tokens, output_tokens)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    stageRunId, aiRunId, skill.id, run.modelId, skill.promptVersion, inputHash, status, r2Key, run.outputHash,
    decision.triggered ? 1 : 0, decision.reasons.length ? JSON.stringify(decision.reasons) : null, taken ? 1 : 0,
    run.inputTokens || null, run.outputTokens || null,
  ).run().catch(() => { /* the stage record is observability, never a blocker */ });

  return { ok: run.ok, data: run.data, cached: false, escalation: { ...decision, taken }, stageRunId, warnings: run.warnings };
}
