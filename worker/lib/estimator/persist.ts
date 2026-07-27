// Persist a selection to D1 (spec §5.1).
//
// A selection writes one selection_run, the FULL candidate_result set (every
// candidate + why it passed/failed) and a draft_order_line carrying the immutable
// catalogue + price snapshots. The candidate set is written for AUDIT — it is
// what answers "why not the cheaper one?" long after the fact, and it earns its
// storage without any screen rendering it.
import type { Env } from "../../types";
import { uuid } from "../util";
import type { SelectionResult } from "./select";

// The reason-code taxonomy (mirrors the migration 0014 CHECK). Only
// preference_correction may ever train the ranker (enforced downstream).
// Still live: it is the `layer` vocabulary every OVERRIDE_REASON maps onto, used
// by the post-issue adjudication of a recommendation_outcome.
export const FEEDBACK_CATEGORIES = [
  "extraction_correction",
  "reconciliation_correction",
  "catalogue_data_correction",
  "deterministic_rule_correction",
  "preference_correction",
  "commercial_correction",
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

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
         (id, selection_run_id, sanity_product_id, catalogue_rev, hard_rule_passed,
          hard_rule_outcome_json, score, score_components_json, reason_codes, rank,
          selected, sanity_config_id, selected_variant_id, performance_snapshot_json, price_snapshot_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      candRowId, selectionRunId, e.candidate.sanityProductId, e.candidate.catalogueRevision,
      e.outcome.passed ? 1 : 0, JSON.stringify(e.outcome.filters), e.score,
      e.components ? JSON.stringify(e.components) : null,
      JSON.stringify(e.outcome.filters.filter((f) => !f.passed).map((f) => f.reason).filter(Boolean)),
      e.rank, e.selected ? 1 : 0, e.selectedVariant?.variantId ?? null, e.selectedVariant?.variantId ?? null,
      e.selectedVariant ? JSON.stringify(e.selectedVariant) : null,
      e.price ? JSON.stringify(e.price) : null,
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
      performanceVariant: s.selectedVariant,
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

// recordFeedback() lived here and is gone (2026-07-27). It wrote `review_feedback`
// from the ops Estimator tab — a pre-submission review surface that was removed
// because that stage has no staff in it. Learning comes from a REVIEWED QUOTE:
// outcomes are captured at issue and adjudicated via PATCH
// /api/ops/recommendation-outcomes/:id, which uses the same reason-code taxonomy
// below. The table remains, unread and unwritten, until a migration drops it.
