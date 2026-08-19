// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSITE MAKE-UP FACTS — no scores, no weights, no second comparator
//
// The per-opening question is "which (frame × glass) is best for this hole in
// the wall". For a composite that is the wrong question asked N times: the units
// are coupled, so the thing being chosen is the SET, and a set is not the sum of
// N independently best answers.
//
// This module used to answer that by re-weighing rank.ts's six components across
// the units. It now computes FACTS instead — one deviation for the make-up, one
// total — and hands them to the same `runLadder` every other path uses. That is
// AC-50: one opening and the same opening split in two cannot disagree about
// which product is better, because there is only one comparator and this module
// declares no weight set of its own.
//
// Everything is AREA-WEIGHTED. A 2000mm lite and a 600mm awning are not two
// equal votes about the opening; the lite is most of what gets built and most of
// what anyone sees.
//
// Design: docs/specs/recommendation-model-design.md §6.1.
// ═══════════════════════════════════════════════════════════════════════════════
import type { CatalogueCandidate, OpeningInput, PerformanceVariant } from "./types";
import { resolvedRequirement } from "./rules";
import { deviationOf, type Deviation, type ResolvedRequirement } from "./ladder";
import { compositeAveragedUw, compositeAveragedShgc } from "./split";

/** One chosen unit, as the composite needs to see it. */
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
 *  unknown is still judged, just without the weighting that needed them. */
export function areaWeightedMean(units: ScoredUnit[], f: (u: ScoredUnit) => number): number {
  if (!units.length) return 0;
  const total = units.reduce((sum, u) => sum + area(u), 0);
  if (total <= 0) return units.reduce((sum, u) => sum + f(u), 0) / units.length;
  return units.reduce((sum, u) => sum + f(u) * area(u), 0) / total;
}

/**
 * The make-up's thermal deviation — the one number the ladder tiers it by
 * (spec §4.7, design §6.1).
 *
 * Two readings, and which applies is decided by the documents rather than by
 * preference:
 *
 *  • An energy report stated per-unit bands ⇒ each unit is measured against its
 *    OWN band and the deviations are area-weighted. Averaging a per-lite
 *    requirement into one number would judge an awning against a fixed lite's
 *    target — the misjudgement this branch exists to avoid.
 *  • Otherwise ⇒ the units are averaged into ONE cell and that cell is measured
 *    against the opening's band. This is the owner's stated goal: average the
 *    U-value across the split and fit the average to the requirement, rather
 *    than pretending to a per-lite precision model nobody asked for.
 *
 * Unknown is contagious: a unit whose deviation cannot be measured makes the
 * whole make-up unknown, because a mean over an absent number is a fiction
 * (spec A2).
 */
export function makeUpDeviation(
  opening: OpeningInput,
  units: ScoredUnit[],
  requirement: ResolvedRequirement,
): Deviation {
  const unknown: Deviation = {
    perAxis: { uValue: null, minShgc: null, maxShgc: null },
    worstAxis: null, scalar: null, absoluteMiss: null,
  };
  const none: Deviation = { ...unknown, scalar: 0 };
  if (!units.length) return unknown;
  if (requirement.absent && !units.some((u) => u.ownBand)) return none;

  if (units.some((u) => u.ownBand)) {
    const perUnit = units.map((u) => deviationOf(
      u.ownBand ? resolvedRequirement(u.opening) : requirement,
      { uValue: u.variant?.uValue ?? null, shgc: u.variant?.shgc ?? null },
    ));
    if (perUnit.some((d) => d.scalar == null)) return unknown;
    // A mean across DIFFERENT bands has no single worst axis and no absolute
    // miss in any one unit — the scalar is the only honest output here.
    return { ...unknown, scalar: round6(areaWeightedMean(units, (u) => perUnit[units.indexOf(u)].scalar ?? 0)) };
  }

  const cells = units.map((u) => ({
    widthMm: u.widthMm, heightMm: u.heightMm,
    uValue: u.variant?.uValue ?? null, shgc: u.variant?.shgc ?? null,
  }));
  // compositeAveragedUw/Shgc skip the units they have no figure for, which is
  // the right answer for a DISPLAY average and the wrong one for a judgement: an
  // average over two of three lites is not this composite's Uw. Withhold the
  // axis entirely instead, so the make-up reads unknown rather than flattering.
  const complete = (f: (c: (typeof cells)[number]) => number | null) => cells.every((c) => f(c) != null);
  return deviationOf(requirement, {
    uValue: complete((c) => c.uValue) ? compositeAveragedUw(cells) : null,
    shgc: complete((c) => c.shgc) ? compositeAveragedShgc(cells) : null,
  });
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** The glass identity a unit ended up with, for the one-glass check. The shared
 *  glazing option is the glass IDENTITY; the variantId is the bridge until the
 *  catalogue is fully migrated. */
export const glassOf = (variant: PerformanceVariant | null): string | null =>
  variant ? (variant.glazingOptionSlug ?? variant.variantId) : null;

// compositeCompliance(), technologyAgreement(), scoreComposite(), CompositeScore
// and commercialScores() lived here and are GONE (ADR 0007, AD4).
//
// The first three re-weighed rank.ts's six deleted components; the last was a
// SECOND min–max normalisation, with the same independence-of-irrelevant-
// alternatives defect as the first. `technologyAgreement` was a same-frame-
// technology preference folded in at a fifth of the configuration weight, and a
// cheapest-wins ladder has no channel for a preference to arrive through — the
// owner's ruling was prefer, never require, and D9 names the learned layer as
// the home for contextual preferences like it. A mixed-technology make-up is now
// simply compared on price like any other.
