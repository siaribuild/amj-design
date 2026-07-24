// Persist a selection to D1 and capture review feedback (spec §5.1, §6a, §12).
//
// A selection writes one selection_run, the FULL candidate_result set (so a
// reviewer sees every candidate + why it passed/failed), and a draft_order_line
// carrying the immutable catalogue + price snapshots. Feedback capture is the
// learning substrate: every human correction records a MANDATORY reason-code
// category so the right layer learns — and it is best-effort (never blocks the
// quote, per §6a).
import type { Env } from "../../types";
import { uuid } from "../util";
import type { SelectionResult } from "./select";

// The reason-code taxonomy (mirrors the migration 0014 CHECK). Only
// preference_correction may ever train the ranker (enforced downstream).
export const FEEDBACK_CATEGORIES = [
  "extraction_correction",
  "reconciliation_correction",
  "catalogue_data_correction",
  "deterministic_rule_correction",
  "preference_correction",
  "commercial_correction",
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export const isFeedbackCategory = (v: unknown): v is FeedbackCategory =>
  typeof v === "string" && (FEEDBACK_CATEGORIES as readonly string[]).includes(v);

export interface PersistedSelection {
  selectionRunId: string;
  draftLineId: string | null;
  status: SelectionResult["status"];
}

// Write selection_run + candidate_result[] + draft_order_line in one D1 batch.
export async function persistSelection(
  env: Env,
  args: { projectId: string; openingId: string; result: SelectionResult },
): Promise<PersistedSelection> {
  const { projectId, openingId, result } = args;
  const selectionRunId = uuid();
  const stmts: D1PreparedStatement[] = [];

  stmts.push(env.DB.prepare(
    `INSERT INTO selection_run (id, opening_id, project_id, catalogue_revision, rule_version, ranker_version, status)
     VALUES (?,?,?,?,?,?, 'completed')`,
  ).bind(selectionRunId, openingId, projectId, result.catalogueVersion, result.ruleVersion, result.rankerVersion));

  let selectedCandidateRowId: string | null = null;
  for (const e of result.evaluated) {
    const candRowId = uuid();
    if (e.selected) selectedCandidateRowId = candRowId;
    stmts.push(env.DB.prepare(
      `INSERT INTO candidate_result
         (id, selection_run_id, sanity_product_id, catalogue_rev, hard_rule_passed, hard_rule_outcome_json, score, score_components_json, reason_codes, rank, selected)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      candRowId, selectionRunId, e.candidate.sanityProductId, e.candidate.catalogueRevision,
      e.outcome.passed ? 1 : 0, JSON.stringify(e.outcome.filters), e.score,
      e.components ? JSON.stringify(e.components) : null,
      JSON.stringify(e.outcome.filters.filter((f) => !f.passed).map((f) => f.reason).filter(Boolean)),
      e.rank, e.selected ? 1 : 0,
    ));
  }

  let draftLineId: string | null = null;
  if (result.selected) {
    draftLineId = uuid();
    const s = result.selected;
    const catalogueSnapshot = {
      sanityProductId: s.candidate.sanityProductId,
      catalogueRevision: s.candidate.catalogueRevision,
      name: s.candidate.name,
      configuration: s.candidate.configuration,
      performanceVariants: s.candidate.performanceVariants,
      energyCertified: s.outcome.energyCertified,
    };
    stmts.push(env.DB.prepare(
      `INSERT INTO draft_order_line
         (id, project_id, opening_id, selected_candidate_id, catalogue_snapshot_json, price_snapshot_json, warnings_json, confidence, status)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(
      draftLineId, projectId, openingId, selectedCandidateRowId,
      JSON.stringify(catalogueSnapshot), s.price ? JSON.stringify(s.price) : null,
      JSON.stringify(result.dominant ? [] : ["close_alternatives"]),
      s.score, s.outcome.status,
    ));
  }

  // Reflect the outcome on the opening.
  stmts.push(env.DB.prepare("UPDATE opening_instance SET status = ? WHERE id = ?").bind(
    result.selected ? result.selected.outcome.status : (result.status === "no_candidate" ? "unavailable" : result.status),
    openingId,
  ));

  await env.DB.batch(stmts);
  return { selectionRunId, draftLineId, status: result.status };
}

export interface FeedbackInput {
  projectId: string;
  openingId?: string | null;
  selectionRunId?: string | null;
  field: string;
  initialValue?: unknown;
  finalValue?: unknown;
  category: string;      // MUST be a FeedbackCategory
  reasonCode: string;    // MUST be non-empty
  reviewerId?: string | null;
  note?: string | null;
  versions?: { catalogueRev?: string; ruleVersion?: string; rankerVersion?: string; pricingVersion?: string };
}

export type FeedbackResult =
  | { ok: true; id: string }
  | { ok: false; error: "invalid_category" | "missing_reason_code" | "write_failed" };

// Record one correction. A category is MANDATORY (free-text-only is rejected) so
// the correction routes to the right layer. Best-effort at the call site: a
// caller issuing a quote must treat a failure as non-blocking (§6a).
export async function recordFeedback(env: Env, input: FeedbackInput): Promise<FeedbackResult> {
  if (!isFeedbackCategory(input.category)) return { ok: false, error: "invalid_category" };
  if (!input.reasonCode || !input.reasonCode.trim()) return { ok: false, error: "missing_reason_code" };
  const id = uuid();
  try {
    await env.DB.prepare(
      `INSERT INTO review_feedback
         (id, project_id, opening_id, selection_run_id, field, initial_value_json, final_value_json,
          category, reason_code, reviewer_id, note, catalogue_rev, rule_version, ranker_version, pricing_version)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id, input.projectId, input.openingId ?? null, input.selectionRunId ?? null, input.field,
      input.initialValue !== undefined ? JSON.stringify(input.initialValue) : null,
      input.finalValue !== undefined ? JSON.stringify(input.finalValue) : null,
      input.category, input.reasonCode.trim(), input.reviewerId ?? null, input.note ?? null,
      input.versions?.catalogueRev ?? null, input.versions?.ruleVersion ?? null,
      input.versions?.rankerVersion ?? null, input.versions?.pricingVersion ?? null,
    ).run();
    return { ok: true, id };
  } catch {
    return { ok: false, error: "write_failed" };
  }
}
