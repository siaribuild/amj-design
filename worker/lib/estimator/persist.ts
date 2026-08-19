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

/** What is unresolved about the chosen line, as tokens a skin composes copy
 *  from. A pick that met the requirement has nothing to warn about. */
function warningTokens(tier: SelectionResult["evaluated"][number]["candidateOutcome"]["tier"]): string[] {
  switch (tier) {
    case "within_tolerance": return ["requirement_not_met"];
    case "misses": return ["requirement_missed_beyond_tolerance"];
    case "thermal_unknown": return ["no_thermal_data"];
    case "does_not_fit": return ["does_not_fit"];
    default: return [];
  }
}

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
    `INSERT INTO selection_run (id, opening_id, project_id, catalogue_revision, rule_version, ranker_version, selection_json, status)
     VALUES (?,?,?,?,?,?,?, 'completed')`,
  ).bind(
    selectionRunId, openingId, projectId, result.catalogueVersion, result.ruleVersion,
    // The column keeps its name and now carries SELECTION_VERSION — a rename
    // would ripple through four tables to say the same thing (AD16).
    result.selectionVersion, JSON.stringify(result.selection),
  ));

  let selectedCandidateRowId: string | null = null;
  for (const e of result.evaluated) {
    const candRowId = uuid();
    if (e.candidateOutcome.selected) selectedCandidateRowId = candRowId;
    stmts.push(env.DB.prepare(
      `INSERT INTO candidate_result
         (id, selection_run_id, sanity_product_id, catalogue_rev, hard_rule_passed,
          hard_rule_outcome_json, score, score_components_json, reason_codes, rank,
          selected, sanity_config_id, selected_variant_id, performance_snapshot_json, price_snapshot_json,
          outcome_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      candRowId, selectionRunId, e.candidate.sanityProductId, e.candidate.catalogueRevision,
      e.outcome.passed ? 1 : 0, JSON.stringify(e.outcome.filters),
      // AC-25: the deleted score is STOPPED, not shimmed. Both columns stay in
      // the schema (nothing is rebuilt) and are written NULL from here on.
      null, null,
      JSON.stringify(e.outcome.filters.filter((f) => !f.passed).map((f) => f.reason).filter(Boolean)),
      e.candidateOutcome.rank, e.candidateOutcome.selected ? 1 : 0,
      e.selectedVariant?.variantId ?? null, e.selectedVariant?.variantId ?? null,
      e.selectedVariant ? JSON.stringify(e.selectedVariant) : null,
      e.price ? JSON.stringify(e.price) : null,
      JSON.stringify(e.candidateOutcome),
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
      // Tier-derived tokens replace `close_alternatives`, which meant "two
      // scores were within 0.05" — a fact about the ranker, not about the line.
      // These say what is actually unresolved about the pick (spec §4.11).
      JSON.stringify(warningTokens(s.candidateOutcome.tier)),
      // A12: there is no score, so there is nothing to put in `confidence`.
      null, s.outcome.status,
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
