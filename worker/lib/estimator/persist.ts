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
import { leadUnitOf } from "./splitCandidates";

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
  const candidateRow = (args: {
    sanityProductId: string; catalogueRevision: string; hardRulePassed: boolean;
    hardRuleOutcome: unknown; reasonCodes: unknown; variantId: string | null;
    performanceSnapshot: unknown | null; priceSnapshot: unknown | null;
    outcome: SelectionResult["evaluated"][number]["candidateOutcome"];
  }) => {
    const candRowId = uuid();
    if (args.outcome.selected) selectedCandidateRowId = candRowId;
    stmts.push(env.DB.prepare(
      `INSERT INTO candidate_result
         (id, selection_run_id, sanity_product_id, catalogue_rev, hard_rule_passed,
          hard_rule_outcome_json, score, score_components_json, reason_codes, rank,
          selected, sanity_config_id, selected_variant_id, performance_snapshot_json, price_snapshot_json,
          outcome_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      candRowId, selectionRunId, args.sanityProductId, args.catalogueRevision,
      args.hardRulePassed ? 1 : 0, JSON.stringify(args.hardRuleOutcome),
      // AC-25: the deleted score is STOPPED, not shimmed. Both columns stay in
      // the schema (nothing is rebuilt) and are written NULL from here on.
      null, null,
      JSON.stringify(args.reasonCodes),
      args.outcome.rank, args.outcome.selected ? 1 : 0,
      args.variantId, args.variantId,
      args.performanceSnapshot ? JSON.stringify(args.performanceSnapshot) : null,
      args.priceSnapshot ? JSON.stringify(args.priceSnapshot) : null,
      JSON.stringify(args.outcome),
    ));
  };

  for (const e of result.evaluated) {
    candidateRow({
      sanityProductId: e.candidate.sanityProductId,
      catalogueRevision: e.candidate.catalogueRevision,
      hardRulePassed: e.outcome.passed,
      hardRuleOutcome: e.outcome.filters,
      reasonCodes: e.outcome.filters.filter((f) => !f.passed).map((f) => f.reason).filter(Boolean),
      variantId: e.selectedVariant?.variantId ?? null,
      performanceSnapshot: e.selectedVariant ?? null,
      priceSnapshot: e.price ?? null,
      outcome: e.candidateOutcome,
    });
  }

  // A SPLIT IS A CANDIDATE ROW LIKE ANY OTHER (design §7.5, E15).
  //
  // It has no catalogue record of its own and these identity columns are NOT
  // NULL, so the row is anchored to the largest-area unit's product and variant
  // (AD6) and `outcome_json` carries the authoritative description — which is
  // what ops2 reads. The legacy columns only have to not lie about which record
  // the row hangs off. `hard_rule_passed` is 1 by construction: a make-up exists
  // only because every one of its units passed within its system.
  for (const split of result.splits) {
    const lead = leadUnitOf(split)?.result.selected ?? null;
    candidateRow({
      sanityProductId: split.candidateOutcome.sanityProductId,
      catalogueRevision: split.candidateOutcome.catalogueRevision,
      hardRulePassed: true,
      hardRuleOutcome: [],
      reasonCodes: [],
      variantId: split.candidateOutcome.variantId,
      performanceSnapshot: lead?.selectedVariant ?? null,
      priceSnapshot: split.totalCents == null ? null : {
        ok: true,
        total: split.totalCents / 100,
        currency: "AUD",
        // Says plainly that this is a SUM, and of what — a reviewer reading the
        // row back sees the make-up's money without re-deriving it per unit.
        composed: true,
        unitTotals: split.units.map((u) => u.result.selected?.price?.total ?? null),
      },
      outcome: split.candidateOutcome,
    });
  }

  // The draft line follows the WINNER, whichever form it took. A split wins by
  // the same ladder a single unit does, so it earns the same line — the
  // difference is only what the catalogue snapshot has to describe.
  const winner = result.selected ?? result.selectedSplit ?? null;
  let draftLineId: string | null = null;
  if (winner) {
    draftLineId = uuid();
    const catalogueSnapshot = result.selected
      ? {
          sanityProductId: result.selected.candidate.sanityProductId,
          catalogueRevision: result.selected.candidate.catalogueRevision,
          name: result.selected.candidate.name,
          configuration: result.selected.candidate.configuration,
          performanceVariant: result.selected.selectedVariant,
          energyCertified: result.selected.outcome.energyCertified,
        }
      : {
          // A make-up has no single catalogue record, so the snapshot describes
          // the SET: the frame system it came from and every unit in it, which
          // is what a reviewer needs to see and what materialisation rebuilt.
          sanityProductId: winner.candidateOutcome.sanityProductId,
          catalogueRevision: winner.candidateOutcome.catalogueRevision,
          name: `${result.selectedSplit!.units.length}-unit composite`,
          configuration: null,
          composite: {
            system: result.selectedSplit!.system,
            axis: result.selectedSplit!.axis,
            units: winner.candidateOutcome.units ?? [],
          },
          performanceVariant: null,
          energyCertified: false,
        };
    const priceSnapshot = result.selected
      ? result.selected.price
      : result.selectedSplit!.totalCents == null
        ? null
        : { ok: true, total: result.selectedSplit!.totalCents / 100, currency: "AUD", composed: true };
    stmts.push(env.DB.prepare(
      `INSERT INTO draft_order_line
         (id, project_id, opening_id, selected_candidate_id, catalogue_snapshot_json, price_snapshot_json, warnings_json, confidence, status)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(
      draftLineId, projectId, openingId, selectedCandidateRowId,
      JSON.stringify(catalogueSnapshot), priceSnapshot ? JSON.stringify(priceSnapshot) : null,
      // Tier-derived tokens replace `close_alternatives`, which meant "two
      // scores were within 0.05" — a fact about the ranker, not about the line.
      // These say what is actually unresolved about the pick (spec §4.11).
      JSON.stringify(warningTokens(winner.candidateOutcome.tier)),
      // A12: there is no score, so there is nothing to put in `confidence`.
      null, result.selected ? result.selected.outcome.status : result.status,
    ));
  }

  // Reflect the outcome on the opening.
  stmts.push(env.DB.prepare("UPDATE opening_instance SET status = ? WHERE id = ?").bind(
    // The opening follows the winner in either form; only a run that selected
    // nothing at all reports the failure state.
    result.selected ? result.selected.outcome.status
      : result.selectedSplit ? result.status
        : (result.status === "no_candidate" ? "unavailable" : result.status),
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
