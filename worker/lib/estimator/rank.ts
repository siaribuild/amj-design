// Deterministic, inspectable ranker (spec §8.3). Ranks ONLY candidates that
// already passed the hard rules — it can never resurrect a rejected candidate or
// override a hard fact. Every score component is transparent and persisted.
//
// score = 0.35·compliance_margin + 0.20·geometry_similarity
//       + 0.15·configuration_similarity + 0.15·commercial
//       + 0.10·historical_acceptance + 0.05·data_completeness
//
// historical_acceptance is a learned preference signal (Phase 6) and is CAPPED by
// its 0.10 weight so it can never dominate current hard facts. Until the learning
// corpus is consumed it is 0 (neutral).
import type { CatalogueCandidate, OpeningInput } from "./types";
import type { RuleOutcome } from "./rules";
import type { PriceSnapshot } from "./pricing";

export const RANKER_VERSION = "v1";

const W = {
  compliance: 0.35, geometry: 0.20, configuration: 0.15,
  commercial: 0.15, historical: 0.10, dataCompleteness: 0.05,
};

export interface ScoreComponents {
  compliance: number; geometry: number; configuration: number;
  commercial: number; historical: number; dataCompleteness: number;
}

export interface RankedCandidate {
  candidateId: string;
  score: number;
  components: ScoreComponents;
  rank: number;
}

export interface RankInput {
  candidate: CatalogueCandidate;
  outcome: RuleOutcome;
  price: PriceSnapshot | null;
  historicalAcceptance?: number; // 0..1, learned; default 0 (neutral)
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// Reward a snug fit within the published envelope (not the biggest unit).
function geometryScore(opening: OpeningInput, c: CatalogueCandidate): number {
  const r = c.dimensionRule;
  const w = opening.widthMm ?? 0, h = opening.heightMm ?? 0;
  if (!r || !w || !h) return 0.5;
  const frac = (v: number, min: number | null, max: number | null) => {
    if (min == null || max == null || max <= min) return 0.5;
    return clamp01((v - min) / (max - min));
  };
  // Mid-envelope (≈0.5 of the range) scores best; extremes score lower.
  const wf = 1 - Math.abs(frac(w, r.minWidthMm, r.maxWidthMm) - 0.5) * 2;
  const hf = 1 - Math.abs(frac(h, r.minHeightMm, r.maxHeightMm) - 0.5) * 2;
  return clamp01((wf + hf) / 2);
}

// Exact operation match scores full; multi-operation products slightly less.
function configurationScore(opening: OpeningInput, c: CatalogueCandidate): number {
  const ops = c.configuration?.operationTypes ?? [];
  if (!opening.operationType) return 0.6;
  if (!ops.includes(opening.operationType)) return 0; // shouldn't reach here (hard-filtered)
  return ops.length === 1 ? 1 : 0.8;
}

// Compliance margin: safe closeness to the required envelope, rewarding a small
// margin over an over-specified unit. Neutral when there is no energy requirement.
function complianceScore(opening: OpeningInput, c: CatalogueCandidate, outcome: RuleOutcome): number {
  const maxU = opening.requirements?.maxUValue ?? null;
  if (maxU == null) return 0.7;
  const best = c.performanceVariants.filter((v) => v.published && v.uValue != null)
    .reduce<number | null>((acc, v) => (acc == null || (v.uValue as number) < acc ? (v.uValue as number) : acc), null);
  if (best == null) return 0;
  // Uw just under the cap ⇒ ~1; far under ⇒ lower (avoid over-spec).
  const margin = (maxU - best) / Math.max(0.5, maxU);
  return clamp01(1 - Math.abs(margin - 0.1) * 2);
}

// Lower total ⇒ higher commercial score, normalised within the passing set.
function commercialScores(inputs: RankInput[]): Map<string, number> {
  const totals = inputs.map((i) => i.price?.total ?? Infinity).filter((t) => Number.isFinite(t));
  const min = Math.min(...totals, Infinity), max = Math.max(...totals, -Infinity);
  const out = new Map<string, number>();
  for (const i of inputs) {
    const t = i.price?.total;
    if (t == null || !Number.isFinite(t) || max <= min) { out.set(i.candidate.sanityProductId, 0.5); continue; }
    out.set(i.candidate.sanityProductId, clamp01(1 - (t - min) / (max - min)));
  }
  return out;
}

// Fully structured, certified data scores best; estimated data is discounted.
function dataCompletenessScore(c: CatalogueCandidate): number {
  const hasDim = !!c.dimensionRule;
  const perf = c.performanceVariants[0];
  const hasPerf = !!perf;
  const certified = !!perf?.certified;
  let s = 0;
  if (hasDim) s += 0.4;
  if (hasPerf) s += 0.3;
  if (certified) s += 0.3;
  return clamp01(s);
}

export function rankCandidates(opening: OpeningInput, inputs: RankInput[]): RankedCandidate[] {
  const commercial = commercialScores(inputs);
  const scored = inputs.map((i) => {
    const components: ScoreComponents = {
      compliance: complianceScore(opening, i.candidate, i.outcome),
      geometry: geometryScore(opening, i.candidate),
      configuration: configurationScore(opening, i.candidate),
      commercial: commercial.get(i.candidate.sanityProductId) ?? 0.5,
      historical: clamp01(i.historicalAcceptance ?? 0),
      dataCompleteness: dataCompletenessScore(i.candidate),
    };
    const score =
      W.compliance * components.compliance +
      W.geometry * components.geometry +
      W.configuration * components.configuration +
      W.commercial * components.commercial +
      W.historical * components.historical +
      W.dataCompleteness * components.dataCompleteness;
    return { candidateId: i.candidate.sanityProductId, score: Math.round(score * 1000) / 1000, components, rank: 0 };
  });
  scored.sort((a, b) => b.score - a.score);
  scored.forEach((s, idx) => { s.rank = idx + 1; });
  return scored;
}

// Confidence gate (spec §8.4): a dominant top candidate auto-selects; a close
// second means provisional-select + show alternatives to the reviewer.
export function selectWithConfidence(ranked: RankedCandidate[]): { selected: RankedCandidate | null; dominant: boolean; alternatives: RankedCandidate[] } {
  if (!ranked.length) return { selected: null, dominant: false, alternatives: [] };
  const [top, second] = ranked;
  const dominant = !second || top.score - second.score >= 0.05;
  return { selected: top, dominant, alternatives: ranked.slice(1, 3) };
}
