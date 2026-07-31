// Selection orchestration (spec §8.1 decision sequence, §18 pseudocode). Pure
// core: given an opening, a CatalogueRepository and a pricing function, it queries
// published candidates, applies the deterministic hard rules, prices the passing
// ones, ranks them and picks with a confidence gate — producing the full
// candidate set (persisted for reviewers) plus the draft line. D1 persistence is
// a separate concern (persistSelection) so this is testable with a fixture.
import type { CatalogueRepository } from "./catalogue";
import type { CatalogueCandidate, OpeningInput, PerformanceVariant } from "./types";
import { checkHardRules, RULE_VERSION, type RuleOutcome, type OutcomeStatus } from "./rules";
import { rankCandidates, selectWithConfidence, RANKER_VERSION, type RankedCandidate, type ScoreComponents } from "./rank";
import type { PriceSnapshot } from "./pricing";
import type { HistoricalModel } from "./learning";
import { eligiblePerformanceVariants } from "./configuration";

export type PriceFn = (
  candidate: CatalogueCandidate,
  opening: OpeningInput,
  variant: PerformanceVariant | null,
) => Promise<PriceSnapshot | null>;

export interface EvaluatedCandidate {
  candidate: CatalogueCandidate;
  outcome: RuleOutcome;
  selectedVariant: PerformanceVariant | null;
  price: PriceSnapshot | null;
  score: number | null;
  /** Transparent per-component breakdown (incl. the learned historical nudge). */
  components: ScoreComponents | null;
  rank: number | null;
  selected: boolean;
}

export interface SelectionResult {
  openingRef: string | null;
  ruleVersion: string;
  rankerVersion: string;
  catalogueVersion: string;
  evaluated: EvaluatedCandidate[];
  /** Chosen candidate (null when none passed). */
  selected: EvaluatedCandidate | null;
  /** Line status: the selected candidate's status, else the "best failure". */
  status: OutcomeStatus | "no_candidate";
  dominant: boolean;
  alternatives: RankedCandidate[];
}

// Rank the failure states so an all-failed opening reports the most-actionable one.
const FAILURE_ORDER: OutcomeStatus[] = ["needs_manual_review", "catalogue_data_incomplete", "unavailable"];

export async function selectForOpening(
  opening: OpeningInput & { externalRef?: string | null },
  repo: CatalogueRepository,
  priceFn: PriceFn,
  historical?: HistoricalModel,
): Promise<SelectionResult> {
  const candidates = await repo.queryCandidates(opening.family ?? null, opening.operationType ?? null);
  const catalogueVersion = repo.catalogueVersion(candidates);

  // Hard rules on every product, then evaluate every eligible exact performance
  // configuration. Learning and pricing therefore influence the final variant,
  // rather than being applied after a variant has already been collapsed.
  const evaluated: EvaluatedCandidate[] = [];
  for (const candidate of candidates) {
    const outcome = checkHardRules(opening, candidate, RULE_VERSION);
    if (outcome.passed && opening.thermalContext?.thermalPrecedentApplied === true) {
      outcome.status = "commercial_only_estimate";
      outcome.energyCertified = false;
    }
    if (!outcome.passed) {
      evaluated.push({ candidate, outcome, selectedVariant: null, price: null, score: null, components: null, rank: null, selected: false });
      continue;
    }
    // SCAFFOLD WS3 (thermal rework): a thermal miss must NOT drop to a null-variant
    // unselected row. The frame stays (operation+dimensions); glass is picked to
    // meet the resolved band else closest via thermal/glassSelection.selectGlassForBand,
    // carrying a reviewRequired warning. Never selected=null on thermal grounds. Plan §4/WS3.
    const variants = eligiblePerformanceVariants(candidate, outcome);
    if (!variants.length) {
      evaluated.push({ candidate, outcome, selectedVariant: null, price: null, score: null, components: null, rank: null, selected: false });
      continue;
    }
    for (const variant of variants) {
      const hasEnergyRequirement =
        opening.requirements?.maxUValue != null ||
        opening.requirements?.minShgc != null ||
        opening.requirements?.maxShgc != null;
      const exactOutcome: RuleOutcome = {
        ...outcome,
        energyCertified: !!(variant.certified && variant.dataSource === "certified"),
        status: hasEnergyRequirement && !(variant.certified && variant.dataSource === "certified")
          ? "commercial_only_estimate"
          : outcome.status,
      };
      const price = await priceFn(candidate, opening, variant);
      evaluated.push({ candidate, outcome: exactOutcome, selectedVariant: variant, price, score: null, components: null, rank: null, selected: false });
    }
  }

  const passing = evaluated.filter((e) => e.outcome.passed);
  const priceable = passing.filter((e) => e.price?.ok);
  const ranked = rankCandidates(opening, priceable.map((e) => ({
    candidate: e.candidate, outcome: e.outcome, selectedVariant: e.selectedVariant, price: e.price,
    // Learned preference (Phase 6); omitted ⇒ ranker treats it as neutral.
    historicalAcceptance: historical ? historical.scoreFor(e.candidate, opening, e.selectedVariant) : undefined,
  })));
  // Attach scores/ranks/components back onto the passing candidates.
  const byId = new Map(ranked.map((r) => [r.configurationId, r]));
  for (const e of priceable) {
    const r = byId.get(`${e.candidate.sanityProductId}::${e.selectedVariant?.variantId ?? "none"}`);
    if (r) { e.score = r.score; e.rank = r.rank; e.components = r.components; }
  }

  const { selected: topRanked, dominant, alternatives } = selectWithConfidence(ranked);
  const selected = topRanked ? priceable.find((e) =>
    e.candidate.sanityProductId === topRanked.candidateId &&
    (e.selectedVariant?.variantId ?? null) === topRanked.performanceVariantId
  ) ?? null : null;
  if (selected) selected.selected = true;

  let status: SelectionResult["status"];
  if (selected) status = selected.outcome.status;
  else if (!candidates.length) status = "no_candidate";
  else if (passing.length && !priceable.length) status = "catalogue_data_incomplete";
  else {
    const statuses = evaluated.map((e) => e.outcome.status);
    status = FAILURE_ORDER.find((s) => statuses.includes(s)) ?? "unavailable";
  }

  return {
    openingRef: opening.externalRef ?? null,
    ruleVersion: RULE_VERSION,
    rankerVersion: RANKER_VERSION,
    catalogueVersion,
    evaluated,
    selected,
    status,
    dominant,
    alternatives,
  };
}
