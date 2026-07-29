// Learning examples (LLM strategy §17, Phase 4). One finalized quote = one
// labelled project example: the AI proposal beside the outcome a human actually
// issued. Retrieval-eligible IMMEDIATELY (§17.1/§17.4 —
// precedent retrieval works from the first example); training-eligible OFF by
// default — weights and the surrogate are never trained per-quote (§2.3), only
// through governed dataset releases (§17.5).
import type { Env } from "../../types";
import { uuid } from "../util";
import { PIPELINE_VERSION } from "./versions";

export interface LearningExampleRecord {
  learningExampleId: string;
  projectId: string;
  quoteRevisionId: string;
  inputMode: string | null;
  pipelineVersion: string;
  sourceChecksums: string[];
  ai: { buildingModel: unknown; draftLines: unknown[] };
  human: { revisionLines: unknown[] };
  finalizedAt: string;
  eligibleForRetrieval: boolean;
  eligibleForTraining: boolean;
}

// Pure assembly — testable without I/O.
export function buildExampleRecord(args: {
  projectId: string;
  quoteRevisionId: string;
  inputMode: string | null;
  sourceChecksums: string[];
  buildingModel: unknown;
  draftLines: unknown[];
  revisionLines: unknown[];
}): LearningExampleRecord {
  return {
    learningExampleId: uuid(),
    projectId: args.projectId,
    quoteRevisionId: args.quoteRevisionId,
    inputMode: args.inputMode,
    pipelineVersion: PIPELINE_VERSION,
    sourceChecksums: args.sourceChecksums,
    // The pair IS the lesson: what the AI drafted, beside what a human actually
    // issued. `deltas` and `overrideReasons` used to be lifted from review_feedback
    // — typed by a reviewer in a pre-submission screen that no longer exists — and
    // are now derivable from these two fields by whatever consumes the example.
    // Better to carry the primary evidence than a hand-typed summary of it.
    ai: { buildingModel: args.buildingModel, draftLines: args.draftLines },
    human: { revisionLines: args.revisionLines },
    finalizedAt: new Date().toISOString(),
    eligibleForRetrieval: false,
    eligibleForTraining: false, // §17.5 gate: only a governed dataset release flips this
  };
}

/** Create the learning example for an issued revision. BEST-EFFORT: issuing the
 *  quote must never fail because learning capture did (§6a discipline). Returns
 *  the example id, or null when the project has no AI run to learn from. */
export async function createLearningExample(env: Env, projectId: string, quoteRevisionId: string): Promise<string | null> {
    const existing = await env.DB.prepare(
      "SELECT id FROM learning_examples WHERE quote_revision_id = ?",
    ).bind(quoteRevisionId).first<{ id: string }>();
    if (existing) return existing.id;

    const bm = await env.DB.prepare(
      `SELECT b.model_json, r.input_mode FROM building_models b JOIN ai_runs r ON r.id = b.ai_run_id
        WHERE b.project_id = ? ORDER BY b.created_at DESC LIMIT 1`,
    ).bind(projectId).first<{ model_json: string; input_mode: string | null }>();
    if (!bm) return null; // never AI-processed ⇒ nothing to learn from

    const [{ results: drafts }, { results: revLines }, { results: files }] = await Promise.all([
      env.DB.prepare("SELECT opening_id, status, catalogue_snapshot_json, price_snapshot_json FROM draft_order_line WHERE project_id = ?").bind(projectId).all<any>(),
      env.DB.prepare("SELECT external_ref, product_snapshot_json, dims_json, qty, line_total FROM revision_line WHERE revision_id = ?").bind(quoteRevisionId).all<any>(),
      env.DB.prepare("SELECT checksum FROM file_asset WHERE project_id = ? AND checksum IS NOT NULL").bind(projectId).all<{ checksum: string }>(),
    ]);

    const record = {
      ...buildExampleRecord({
      projectId, quoteRevisionId,
      inputMode: bm.input_mode,
      sourceChecksums: (files ?? []).map((f) => f.checksum),
      buildingModel: safeParse(bm.model_json),
      draftLines: (drafts ?? []).map((d) => ({ openingId: d.opening_id, status: d.status, catalogue: safeParse(d.catalogue_snapshot_json), price: safeParse(d.price_snapshot_json) })),
      revisionLines: (revLines ?? []).map((l) => ({ externalRef: l.external_ref, product: safeParse(l.product_snapshot_json), dims: safeParse(l.dims_json), qty: l.qty, lineTotal: l.line_total })),
      }),
      // Stable across outbox retries, including an R2-success/D1-failure split.
      learningExampleId: `learning-${quoteRevisionId}`,
    };

    const r2Key = `projects/${projectId.replace(/[^A-Za-z0-9_-]/g, "_")}/learning/${record.learningExampleId}.json`;
    await env.FILES.put(r2Key, JSON.stringify(record));
    await env.DB.prepare(
      `INSERT INTO learning_examples (id, project_id, quote_revision_id, input_mode, pipeline_version, example_r2_key,
         source_checksums_json, eligible_for_retrieval, eligible_for_training, quality_state)
       VALUES (?,?,?,?,?,?,?, 0, 0, 'pending')`,
    ).bind(record.learningExampleId, projectId, quoteRevisionId, record.inputMode, record.pipelineVersion,
      r2Key, JSON.stringify(record.sourceChecksums)).run();
    return record.learningExampleId;
}

/**
 * Promote an immutable example only after every outcome in the issued revision
 * has been governed. A rejected/noise adjustment keeps the whole project example
 * out of retrieval so commercial preference or customer-specific choices cannot
 * be replayed as technical truth. Training remains a separate release process.
 */
export async function refreshLearningExampleEligibility(
  env: Env,
  quoteRevisionId: string,
): Promise<boolean> {
  const counts = await env.DB.prepare(
    `SELECT count(*) AS total,
            sum(CASE WHEN quality_state='approved' THEN 1 ELSE 0 END) AS approved,
            sum(CASE WHEN quality_state='pending' THEN 1 ELSE 0 END) AS pending,
            sum(CASE WHEN quality_state='rejected' THEN 1 ELSE 0 END) AS rejected,
            sum(CASE WHEN recommendation_eligible=1 OR thermal_eligible=1 THEN 1 ELSE 0 END) AS learnable
       FROM recommendation_outcome
      WHERE quote_revision_id=?`,
  ).bind(quoteRevisionId).first<{
    total: number; approved: number | null; pending: number | null; rejected: number | null;
    learnable: number | null;
  }>();
  const eligible = Number(counts?.total ?? 0) > 0 &&
    Number(counts?.pending ?? 0) === 0 &&
    Number(counts?.rejected ?? 0) === 0 &&
    Number(counts?.approved ?? 0) === Number(counts?.total ?? 0) &&
    Number(counts?.learnable ?? 0) === Number(counts?.total ?? 0);
  const allFinal = Number(counts?.pending ?? 0) === 0;
  const qualityState = eligible
    ? "approved"
    : Number(counts?.rejected ?? 0) > 0 || allFinal
      ? "rejected"
      : "pending";
  await env.DB.prepare(
    `UPDATE learning_examples
        SET eligible_for_retrieval=?, quality_state=?
      WHERE quote_revision_id=?`,
  ).bind(eligible ? 1 : 0, qualityState, quoteRevisionId).run();
  return eligible;
}

function safeParse(s: string | null | undefined): unknown {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}
