// ═══════════════════════════════════════════════════════════════════════════════
// SCORING A COMPOSITE — the same six things, weighed over the whole opening
//
// The per-opening ranker answers "which (frame × glass) is best for this hole in
// the wall". For a composite that is the wrong question asked N times: the units
// are coupled, so the thing being chosen is the SET, and a set is not the sum of
// N independently best answers. The cheapest lite in the catalogue is the best
// answer to its own segment and the wrong answer to the opening.
//
// So this reuses rank.ts's components and RANK_WEIGHTS unchanged, and aggregates
// them across the units. Nothing here is a second opinion about what matters —
// a separate weight set would let one opening and the same opening split in two
// disagree about which product is better, with nothing to say which was right.
//
// Everything is AREA-WEIGHTED. A 2000mm lite and a 600mm awning are not two
// equal votes about the opening; the lite is most of what gets built and most of
// what anyone sees.
//
// Design: docs/product-compatibility-design.md §5.
// ═══════════════════════════════════════════════════════════════════════════════
import type { CatalogueCandidate, OpeningInput, PerformanceVariant } from "./types";
import {
  RANK_WEIGHTS, geometryScore, configurationScore, dataCompletenessScore, complianceScore, variantCell,
  type ScoreComponents,
} from "./rank";
import { effectiveThermalRequirements } from "./rules";
import { gradedComplianceScore } from "./thermal/compliance";
import type { ThermalBand } from "./thermal/types";
import { compositeAveragedUw, compositeAveragedShgc } from "./split";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** One chosen unit, as the composite scorer needs to see it. */
export interface ScoredUnit {
  /** The unit's own opening — its size, its band, its operation. */
  opening: OpeningInput;
  candidate: CatalogueCandidate;
  variant: PerformanceVariant | null;
  widthMm: number;
  heightMm: number;
  /** True when an ENERGY REPORT stated this unit's own band. Such a unit is
   *  judged against that band and never against the opening's — child bands are
   *  not intersected into a parent one (thermal plan, owner decision 3). */
  ownBand: boolean;
  /** null when the unit could not be priced. */
  total: number | null;
}

export const area = (u: { widthMm: number; heightMm: number }) =>
  Math.max(0, u.widthMm) * Math.max(0, u.heightMm);

/** Mean of `f` over the units, weighted by the area each one occupies. Falls back
 *  to a plain mean when no unit has an area — a composite whose dimensions are
 *  unknown is still scored, just without the weighting that needed them. */
export function areaWeightedMean(units: ScoredUnit[], f: (u: ScoredUnit) => number): number {
  if (!units.length) return 0;
  const total = units.reduce((sum, u) => sum + area(u), 0);
  if (total <= 0) return units.reduce((sum, u) => sum + f(u), 0) / units.length;
  return units.reduce((sum, u) => sum + f(u) * area(u), 0) / total;
}

/**
 * The composite's thermal compliance.
 *
 * Two readings, and which applies is decided by the documents rather than by
 * preference:
 *
 *  • An energy report stated per-unit bands ⇒ each unit is graded against its
 *    own and the results are area-weighted. Averaging a per-lite requirement
 *    into one number would judge an awning against a fixed lite's target.
 *  • Otherwise ⇒ the units are averaged into ONE cell and that cell is graded
 *    against the opening's band. This is the owner's stated goal: average the
 *    U-value across the split and fit the average to the requirement, rather
 *    than pretending to a per-lite precision model nobody asked for.
 */
export function compositeCompliance(opening: OpeningInput, units: ScoredUnit[]): number {
  if (!units.length) return 0;
  if (units.some((u) => u.ownBand)) {
    return clamp01(areaWeightedMean(units, (u) => complianceScore(u.opening, u.variant)));
  }
  const req = effectiveThermalRequirements(opening);
  if (!req) {
    // No band to meet. Mirror the per-opening reading — mildly prefer certified
    // data — rather than inventing a composite-only rule for the same situation.
    const certified = units.every((u) => u.variant?.certified);
    return units.some((u) => u.variant) ? (certified ? 0.8 : 0.6) : 0.4;
  }
  const cells = units.map((u) => ({
    widthMm: u.widthMm, heightMm: u.heightMm,
    uValue: u.variant?.uValue ?? null, shgc: u.variant?.shgc ?? null,
  }));
  const uValue = compositeAveragedUw(cells);
  const shgc = compositeAveragedShgc(cells);
  if (uValue == null && shgc == null) return 0.4;
  const band: ThermalBand = {
    maxUValue: req.maxUValue ?? null, minShgc: req.minShgc ?? null, maxShgc: req.maxShgc ?? null, shgcTarget: null,
  };
  return gradedComplianceScore({
    // The composite is not one catalogue cell, so it carries no glass identity of
    // its own; the scorer reads only the numbers.
    glassOptionSlug: "composite", variantId: "composite",
    uValue, shgc,
    certified: units.every((u) => !!u.variant?.certified),
    pricingOptionSlugs: [],
  }, band);
}

/** 1 when every unit shares a frame technology, else the largest share by area.
 *
 *  A system spans conventional and thermally-broken frames by the owner's
 *  grouping rule, so "same system" no longer implies "same technology" — and a
 *  conventional lite can still drift in beside a thermally-broken awning on
 *  price alone. This is a PREFERENCE and nothing more: it is folded into the
 *  configuration component at a fifth of its weight, so it breaks a tie and can
 *  never overturn compliance. The owner's ruling was prefer, never require. */
export function technologyAgreement(units: ScoredUnit[]): number {
  if (units.length < 2) return 1;
  const byTech = new Map<string, number>();
  let total = 0;
  for (const u of units) {
    const tech = u.variant?.frameTechnology ?? "unknown";
    const a = Math.max(1, area(u));
    byTech.set(tech, (byTech.get(tech) ?? 0) + a);
    total += a;
  }
  return total > 0 ? clamp01(Math.max(...byTech.values()) / total) : 1;
}

export interface CompositeScore {
  score: number;
  components: ScoreComponents;
}

/**
 * Score one candidate make-up of a composite.
 *
 * `commercial` is supplied rather than computed: it is normalised ACROSS the
 * make-ups being compared (Σ of each one's unit totals), which only the caller
 * holding all of them can do. Passing 0.5 is the neutral reading used when there
 * is nothing to compare against — the same convention rank.ts uses when every
 * price is equal or missing.
 */
export function scoreComposite(opening: OpeningInput, units: ScoredUnit[], commercial: number): CompositeScore {
  const components: ScoreComponents = {
    compliance: compositeCompliance(opening, units),
    geometry: clamp01(areaWeightedMean(units, (u) => geometryScore(u.opening, u.candidate))),
    // 80/20 against the technology preference, so the operation and glass
    // affinity this component exists to measure still dominate it.
    configuration: clamp01(
      0.8 * areaWeightedMean(units, (u) => configurationScore(u.opening, u.candidate, u.variant))
      + 0.2 * technologyAgreement(units),
    ),
    commercial: clamp01(commercial),
    // Flat neutral, and deliberately not wired to the learned model. The
    // recommendation corpus already excludes composites — captureRecommendationOutcomes
    // records one configuration against another and a composite's answer is N
    // units with their own products and geometry — so there is no signal to read.
    // Feeding it a decision the corpus cannot represent would be worse than
    // feeding it nothing.
    historical: 0.5,
    dataCompleteness: clamp01(areaWeightedMean(units, (u) => dataCompletenessScore(u.candidate, u.variant))),
  };
  const W = RANK_WEIGHTS;
  const score =
    W.compliance * components.compliance +
    W.geometry * components.geometry +
    W.configuration * components.configuration +
    W.commercial * components.commercial +
    W.historical * components.historical +
    W.dataCompleteness * components.dataCompleteness;
  return { score: Math.round(score * 1000) / 1000, components };
}

/** Normalise a set of make-up totals to the 0–1 commercial component, cheapest
 *  first. An unpriceable make-up scores neutral rather than worst: it has not
 *  been shown to be expensive, only to be unknown, and scoring absence as a
 *  penalty is how a catalogue gap turns into a product decision. */
export function commercialScores(totals: (number | null)[]): number[] {
  const finite = totals.filter((t): t is number => t != null && Number.isFinite(t));
  const min = Math.min(...finite), max = Math.max(...finite);
  return totals.map((t) =>
    t == null || !Number.isFinite(t) || finite.length < 2 || max <= min ? 0.5 : clamp01(1 - (t - min) / (max - min)));
}

/** The glass identity a unit ended up with, for the one-glass check. */
export const glassOf = (variant: PerformanceVariant | null): string | null =>
  variant ? (variantCell(variant)?.glassOptionSlug ?? null) : null;
