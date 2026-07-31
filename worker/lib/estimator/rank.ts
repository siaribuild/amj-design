import type { CatalogueCandidate, OpeningInput, PerformanceVariant } from "./types";
import type { RuleOutcome } from "./rules";
import type { PriceSnapshot } from "./pricing";
import { variantAffinityScore } from "./configuration";
import { gradedComplianceScore } from "./thermal/compliance";
import { coerceCoherent, bandFromRequirements, bandHasConstraint } from "./thermal/precedence";
import type { GlassCell } from "./thermal/types";

// v3: compliance is GRADED (distance-to-band, floored above 0) instead of a
// hard-0 veto, so a thermal miss depresses rank without eliminating the line.
export const RANKER_VERSION = "v3-graded-thermal";

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
  performanceVariantId: string | null;
  configurationId: string;
  score: number;
  components: ScoreComponents;
  rank: number;
}

export interface RankInput {
  candidate: CatalogueCandidate;
  outcome: RuleOutcome;
  selectedVariant: PerformanceVariant | null;
  price: PriceSnapshot | null;
  historicalAcceptance?: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function geometryScore(opening: OpeningInput, c: CatalogueCandidate): number {
  const r = c.dimensionRule;
  const w = opening.widthMm ?? 0, h = opening.heightMm ?? 0;
  if (!r || !w || !h) return 0.5;
  const frac = (v: number, min: number | null, max: number | null) => {
    if (min == null || max == null || max <= min) return 0.5;
    return clamp01((v - min) / (max - min));
  };
  // Out of range (a composite/custom opening): every candidate scores 0 on the
  // snug-fit curve, so rank by COVERAGE instead — how much of the opening the
  // product's envelope spans. Without this the commercial component would pick
  // the cheapest small unit and systematically under-quote a large opening.
  const over = (r.maxWidthMm != null && w > r.maxWidthMm) || (r.maxHeightMm != null && h > r.maxHeightMm);
  if (over) {
    const cover = (v: number, max: number | null) => (max == null ? 1 : clamp01(max / Math.max(1, v)));
    return clamp01(((cover(w, r.maxWidthMm) + cover(h, r.maxHeightMm)) / 2) * 0.5); // capped: never beats a true fit
  }
  const wf = 1 - Math.abs(frac(w, r.minWidthMm, r.maxWidthMm) - 0.5) * 2;
  const hf = 1 - Math.abs(frac(h, r.minHeightMm, r.maxHeightMm) - 0.5) * 2;
  return clamp01((wf + hf) / 2);
}

function configurationScore(opening: OpeningInput, c: CatalogueCandidate, variant: PerformanceVariant | null): number {
  const ops = c.configuration?.operationTypes ?? [];
  if (!opening.operationType) return 0.5 * 0.6 + 0.5 * variantAffinityScore(opening, variant);
  if (!ops.includes(opening.operationType)) return 0;
  const operation = ops.length === 1 ? 1 : 0.8;
  return 0.5 * operation + 0.5 * variantAffinityScore(opening, variant);
}

/** A performance variant is the (frame×glass) cell the graded scorer consumes. */
function variantCell(v: PerformanceVariant | null): GlassCell | null {
  if (!v) return null;
  // WS1: prefer the shared glazing option as the glass identity; fall back to the
  // variantId until the catalogue is migrated.
  return { glassOptionSlug: v.glazingOptionSlug ?? v.variantId, variantId: v.variantId, uValue: v.uValue, shgc: v.shgc, certified: v.certified, pricingOptionSlugs: v.pricingOptionSlugs };
}

// WS4: GRADED, never a veto. A thermal miss depresses this component (floored
// above 0 in gradedComplianceScore) but the line survives to be ranked + warned,
// so among always-eligible glasses the one closest to the band ranks highest.
// The band is coherence-guarded so an impossible requirement cannot mis-score.
function complianceScore(opening: OpeningInput, variant: PerformanceVariant | null): number {
  // TODO(glazing-thermal-M4 / D2): this band diverges from what rules.ts enforces
  // (explicit-else-advisory here vs the explicit∩advisory intersection in
  // effectiveThermalRequirements). Resolve ONE shared band via resolveThermalBand
  // so rank order reflects the enforced band, and fold shgcTarget into the score
  // (gradedComplianceScore ignores it today) so the report's preferred SHGC is
  // consulted when ~14 glazings compete. Matters only once products have >1 variant.
  const { band } = coerceCoherent(bandFromRequirements(opening.requirements ?? opening.advisoryRequirements));
  const cell = variantCell(variant);
  if (!band || !bandHasConstraint(band)) {
    // No thermal band to meet — mildly prefer known/certified data, as before.
    return cell ? (cell.certified ? 0.8 : 0.6) : 0.4;
  }
  if (!cell) return 0.4;
  return gradedComplianceScore(cell, band);
}

function commercialScores(inputs: RankInput[]): Map<string, number> {
  const totals = inputs.map((i) => i.price?.total ?? Infinity).filter((t) => Number.isFinite(t));
  const min = Math.min(...totals, Infinity), max = Math.max(...totals, -Infinity);
  const out = new Map<string, number>();
  for (const i of inputs) {
    const t = i.price?.total;
    if (t == null || !Number.isFinite(t) || max <= min) {
      out.set(configurationId(i), 0.5);
      continue;
    }
    out.set(configurationId(i), clamp01(1 - (t - min) / (max - min)));
  }
  return out;
}

const configurationId = (input: RankInput) =>
  `${input.candidate.sanityProductId}::${input.selectedVariant?.variantId ?? "none"}`;

function dataCompletenessScore(c: CatalogueCandidate, variant: PerformanceVariant | null): number {
  let score = 0;
  if (c.dimensionRule) score += 0.4;
  if (variant) score += 0.3;
  if (variant?.certified) score += 0.3;
  return clamp01(score);
}

export function rankCandidates(opening: OpeningInput, inputs: RankInput[]): RankedCandidate[] {
  const commercial = commercialScores(inputs);
  const scored = inputs.map((i) => {
    const components: ScoreComponents = {
      compliance: complianceScore(opening, i.selectedVariant),
      geometry: geometryScore(opening, i.candidate),
      configuration: configurationScore(opening, i.candidate, i.selectedVariant),
      commercial: commercial.get(configurationId(i)) ?? 0.5,
      // Neutral 0.5 when there is no learned signal yet — an ABSENT learning
      // feed must not read as a penalty (preserves the learning contract as the
      // dataset fills). A real reviewer-acceptance score still nudges up/down.
      historical: clamp01(i.historicalAcceptance ?? 0.5),
      dataCompleteness: dataCompletenessScore(i.candidate, i.selectedVariant),
    };
    const score =
      W.compliance * components.compliance +
      W.geometry * components.geometry +
      W.configuration * components.configuration +
      W.commercial * components.commercial +
      W.historical * components.historical +
      W.dataCompleteness * components.dataCompleteness;
    return {
      candidateId: i.candidate.sanityProductId,
      performanceVariantId: i.selectedVariant?.variantId ?? null,
      configurationId: configurationId(i),
      score: Math.round(score * 1000) / 1000,
      components,
      rank: 0,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  scored.forEach((s, idx) => { s.rank = idx + 1; });
  return scored;
}

export function selectWithConfidence(ranked: RankedCandidate[]): {
  selected: RankedCandidate | null; dominant: boolean; alternatives: RankedCandidate[];
} {
  if (!ranked.length) return { selected: null, dominant: false, alternatives: [] };
  const [top, second] = ranked;
  const dominant = !second || top.score - second.score >= 0.05;
  return { selected: top, dominant, alternatives: ranked.slice(1, 3) };
}
