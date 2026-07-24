// ai_runs lifecycle (LLM strategy §18.1, §19). A run is the parent record for a
// project's processing pass: it pins the pipeline version and the model routing
// that every stage inherits, so the whole draft is reproducible (§21.3). Partial
// success is a valid terminal state (§22.1) — a run with some failed stages
// completes as 'partial', never discarding the useful lines.
import type { Env } from "../../types";
import { uuid } from "../util";
import type { FailureClass, InputMode } from "./schema";
import { PIPELINE_VERSION, primaryModel, escalationModel } from "./versions";

export interface AiRunHandle {
  id: string;
  correlationId: string;
  pipelineVersion: string;
  primaryModel: string;
}

export async function createAiRun(env: Env, args: { projectId: string; inputMode?: InputMode | null }): Promise<AiRunHandle> {
  const id = uuid();
  const correlationId = uuid();
  await env.DB.prepare(
    `INSERT INTO ai_runs (id, project_id, pipeline_version, status, input_mode, primary_model, escalation_model, correlation_id)
     VALUES (?,?,?, 'running', ?,?,?,?)`,
  ).bind(id, args.projectId, PIPELINE_VERSION, args.inputMode ?? null, primaryModel(env), escalationModel(env), correlationId).run();
  return { id, correlationId, pipelineVersion: PIPELINE_VERSION, primaryModel: primaryModel(env) };
}

export async function completeAiRun(
  env: Env,
  runId: string,
  outcome: {
    status: "completed" | "partial" | "failed" | "cancelled";
    errorCode?: FailureClass | null;
    inputMode?: InputMode | null;
    tokenUsage?: { inputTokens: number; outputTokens: number } | null;
  },
): Promise<void> {
  await env.DB.prepare(
    `UPDATE ai_runs SET status = ?, error_code = ?, input_mode = COALESCE(?, input_mode),
            token_usage_json = ?, completed_at = datetime('now') WHERE id = ?`,
  ).bind(
    outcome.status, outcome.errorCode ?? null, outcome.inputMode ?? null,
    outcome.tokenUsage ? JSON.stringify(outcome.tokenUsage) : null, runId,
  ).run();
}
