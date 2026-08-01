// WS4: graded thermal compliance score.
// Replaces rank.ts complianceScore()'s HARD-0 (which made thermal a veto) with a
// graded distance-to-band penalty, so among always-eligible glasses the one closest
// to the resolved band ranks highest — a nudge, not an elimination.
//
// The learned historical component (rank weight ~0.10) is unaffected; this changes
// only how thermal contributes.
import type { GlassCell, ThermalBand } from "./types";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// A miss depresses but never zeroes the component, so a line always survives to be
// ranked and warned rather than eliminated.
const FLOOR = 0.1;
// Distances beyond these span map to the floor. SHGC is a 0..1 quantity; Uw a
// small positive. Chosen so a near-miss barely dents and a gross miss hits floor.
const SHGC_SPAN = 0.2;
const UVALUE_SPAN = 1.5;

/** 0..1: how well a (frame×glass) cell meets the band. A cell fully within the band
 *  scores a flat 1.0 — we do NOT further rank compliant cells by how "thermally best"
 *  they are, because that biases the recommendation toward the most expensive glass.
 *  Once the band is MET, the ranker's commercial term picks the cheapest (owner rule).
 *  A miss degrades smoothly with distance and is floored above 0 (never eliminated).
 *  Axes are BLENDED (probabilistic-OR) so a cell worse on ANY axis scores strictly
 *  lower — no worst-axis ties among many near-band glasses. */
export function gradedComplianceScore(cell: GlassCell, band: ThermalBand): number {
  const penalties: number[] = [];

  if (band.maxUValue != null) {
    if (cell.uValue == null) {
      penalties.push(0.4); // unknown Uw against a real cap: a mild penalty, not 0.
    } else if (cell.uValue > band.maxUValue) {
      penalties.push(clamp01((cell.uValue - band.maxUValue) / UVALUE_SPAN));
    }
  }

  const hasShgcBand = band.minShgc != null || band.maxShgc != null;
  if (hasShgcBand) {
    if (cell.shgc == null) {
      penalties.push(0.4);
    } else {
      let d = 0;
      if (band.minShgc != null && cell.shgc < band.minShgc) d = band.minShgc - cell.shgc;
      else if (band.maxShgc != null && cell.shgc > band.maxShgc) d = cell.shgc - band.maxShgc;
      if (d > 0) penalties.push(clamp01(d / SHGC_SPAN));
    }
  }

  // Blend across axes: 1 − Π(1 − pᵢ). Worst axis still dominates, but a second
  // adverse axis lowers the score further — strictly monotonic, unlike max().
  const bandPenalty = penalties.length ? 1 - penalties.reduce((acc, p) => acc * (1 - p), 1) : 0;

  // Fully in band ⇒ 1.0 (no thermal refinement among compliant cells — price decides
  // downstream). Out of band ⇒ graded by distance, floored above 0.
  return Math.max(FLOOR, 1 - bandPenalty);
}
