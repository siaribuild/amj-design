// Selection orchestration (spec §8.1 decision sequence, §18 pseudocode). Pure
// core: given an opening, a CatalogueRepository and a pricing function, it queries
// published candidates, applies the deterministic hard rules, prices the passing
// ones, ranks them and picks with a confidence gate — producing the full
// candidate set (persisted for reviewers) plus the draft line. D1 persistence is
// a separate concern (persistSelection) so this is testable with a fixture.
import type { CatalogueRepository } from "./catalogue";
import type { CatalogueCandidate, OpeningInput } from "./types";
import { checkHardRules, RULE_VERSION, type RuleOutcome, type OutcomeStatus } from "./rules";
import { rankCandidates, selectWithConfidence, RANKER_VERSION, type RankedCandidate, type ScoreComponents } from "./rank";
import type { PriceSnapshot } from "./pricing";
import type { HistoricalModel } from "./learning";

export type PriceFn = (candidate: CatalogueCandidate, opening: OpeningInput) => Promise<PriceSnapshot | null>;

export interface EvaluatedCandidate {
  candidate: CatalogueCandidate;
  outcome: RuleOutcome;
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

  // Hard rules on every candidate; price only the ones that pass.
  const evaluated: EvaluatedCandidate[] = [];
  for (const candidate of candidates) {
    const outcome = checkHardRules(opening, candidate, RULE_VERSION);
    const price = outcome.passed ? await priceFn(candidate, opening) : null;
    evaluated.push({ candidate, outcome, price, score: null, components: null, rank: null, selected: false });
  }

  const passing = evaluated.filter((e) => e.outcome.passed);
  const ranked = rankCandidates(opening, passing.map((e) => ({
    candidate: e.candidate, outcome: e.outcome, price: e.price,
    // Learned preference (Phase 6); omitted ⇒ ranker treats it as neutral.
    historicalAcceptance: historical ? historical.scoreFor(e.candidate, opening) : undefined,
  })));
  // Attach scores/ranks/components back onto the passing candidates.
  const byId = new Map(ranked.map((r) => [r.candidateId, r]));
  for (const e of passing) {
    const r = byId.get(e.candidate.sanityProductId);
    if (r) { e.score = r.score; e.rank = r.rank; e.components = r.components; }
  }

  const { selected: topRanked, dominant, alternatives } = selectWithConfidence(ranked);
  const selected = topRanked ? passing.find((e) => e.candidate.sanityProductId === topRanked.candidateId) ?? null : null;
  if (selected) selected.selected = true;

  let status: SelectionResult["status"];
  if (selected) status = selected.outcome.status;
  else if (!candidates.length) status = "no_candidate";
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
