// src/data/recommendation.ts — the estimator's emitted-facts contract.
//
// ZERO imports. Read by the worker (which writes it into
// candidate_result.outcome_json / selection_run.selection_json) and by the ops
// skin (which renders it). Facts only, never sentences (spec AC-21): every
// field is an identifier, an enum, a number or a boolean.
//
// STABILITY RULES (docs/specs/recommendation-model-design.md §3):
//   1. Additive-only evolution. A field is added, never renamed or re-typed;
//      `SelectionOutcome.version` names the model that emitted it.
//      ONE SANCTIONED REMOVAL, ADR 0011: `thermal.dataSource` left this contract
//      when certification was deleted from the product, paid for by the
//      `ladder-v1` -> `ladder-v2` version bump. Rows emitted under `ladder-v1`
//      keep the key in storage and parse unchanged; `ladder-v2` never had it.
//   2. No sentences. No `message`, no `reason`, no assembled copy anywhere in
//      outcome_json — the builder maps rules-engine prose to structured detail.
//   3. `exclusions[].detail` carries facts about THIS opening only — catalogue
//      identifiers, numbers, enums; never schedule comment text, never another
//      account's anything.

/** A candidate's verdict class on the selection ladder. */
export type Tier =
  | "meets"             // A — fits, deviation 0, or no thermal requirement at all
  | "within_tolerance"  // B — fits, 0 < deviation ≤ best + tolerance
  | "misses"            // C — fits, deviation > best + tolerance
  | "thermal_unknown"   // D — fits, requirement stated, no figure on a constrained axis
  | "does_not_fit"      // E — the last-resort best-fit unit (spec §4.6)
  | "excluded";         // X — failed a hard constraint; never machine-selected

export const TIER_ORDER: readonly Tier[] = [
  "meets", "within_tolerance", "misses", "thermal_unknown", "does_not_fit", "excluded",
];

export const tierRank = (t: Tier): number => TIER_ORDER.indexOf(t);

/** Where an opening's thermal requirement came from. A computed requirement
 *  binds selection exactly as a reported one does; only the basis differs. */
export type RequirementBasis =
  | "explicit_energy_report" | "plan_derived" | "default_envelope" | "human_override";

/** The hard constraint a candidate failed.
 *
 *  `split_combinability` is DECLARED AND NEVER EMITTED, deliberately. D3 makes
 *  combinability hard, and the make-up enumerator honours it by construction —
 *  it can only produce make-ups whose units come from one frame system, so a
 *  cross-system make-up is not a candidate that was excluded, it is a candidate
 *  that never existed. An ops surface rendering this constraint will therefore
 *  never see it, and that is the correct behaviour rather than a gap.
 *
 *  It stays in the vocabulary because the run still has something to say when
 *  no system could supply a make-up — `SelectionOutcome` carries it as a
 *  run-level note — and because a future generator that DOES enumerate
 *  cross-system candidates in order to show a reviewer why they were refused
 *  would need this exact value rather than a new one. */
export type ExclusionConstraint =
  | "operation" | "dimensions" | "split_combinability" | "glazing_instruction"
  | "offerability" | "disabled" | "publication";

export interface CandidateOutcome {
  // identity — for a split, the largest-area unit's identity (units[] is
  // authoritative; design AD6)
  productSlug: string;
  sanityProductId: string;
  variantId: string | null;
  catalogueRevision: string;
  form: "single" | "split";
  units?: {
    productSlug: string; variantId: string | null;
    widthMm: number; heightMm: number; operationType: string | null;
  }[];

  // verdict
  tier: Tier;
  rank: number | null;            // null iff tier === 'excluded'
  selected: boolean;
  competing: boolean;             // was in the set that competed on price

  // why it is not a candidate (tier 'excluded' only; [] otherwise)
  exclusions: {
    constraint: ExclusionConstraint;
    detail: Record<string, unknown>;   // structured facts only, never prose
  }[];

  // the requirement this candidate was judged against
  requirement: {
    maxUValue: number | null; minShgc: number | null; maxShgc: number | null;
    basis: RequirementBasis | null;
    absent: boolean;              // true when there is no thermal requirement at all
  };

  // how it did
  thermal: {
    uValue: number | null; shgc: number | null;
    deviation: { uValue: number | null; minShgc: number | null; maxShgc: number | null };
    worstAxis: "uValue" | "minShgc" | "maxShgc" | null;
    normalisedDeviation: number | null;   // the scalar the ladder compares; null = unknown
    absoluteMiss: number | null;          // the miss in the requirement's own unit
  };

  // dimensional fit
  fit: {
    fits: boolean;
    widthMm: number | null; heightMm: number | null;
    limit: {
      minWidthMm: number | null; maxWidthMm: number | null;
      minHeightMm: number | null; maxHeightMm: number | null;
      maxAreaM2: number | null; maxAspectRatio: number | null;
    } | null;
    breached: ("width" | "height" | "area" | "aspect")[];
  };

  // commercial — the engine's single price basis: the same tax-inclusive
  // rate-card figure `quote_line.line_total` carries. `computePrice` performs
  // no GST arithmetic; ex/inc display is the skin's job, per the GST-mode
  // house rule.
  price: {
    total: number | null;         // null when unpriceable
    currency: "AUD";
    ok: boolean;
    /** SIGN CONVENTION (spec A17): candidate total MINUS selected total.
     *  Negative ⇒ cheaper than the pick. 0 on the pick. null when either
     *  side is unpriced. */
    deltaToSelected: number | null;
  };

  // the learned layer, dark (D11) — null until Phase 3 ships
  learned: {
    retrievalKey: string;
    retrievalKeyVersion: string;
    observations: number;
    support: number;
    wouldPrefer: boolean;
    applied: false;               // literal false in this release
    provenance: { inPlatform: number; backfilled: number };
  } | null;
}

export interface SelectionOutcome {
  version: string;                        // SELECTION_VERSION, 'ladder-v2'
  openingRef: string | null;
  requirement: CandidateOutcome["requirement"];
  tolerance: number;                      // 0.05, stamped per run (AC-4)
  competingTier: Tier | null;
  selectedProductSlug: string | null;
  status: "ready" | "needs_manual_review" | "commercial_only_estimate"
        | "catalogue_data_incomplete" | "unavailable" | "no_candidate";
  withheldIncomplete: { slug: string; gaps: string[] }[];
}
