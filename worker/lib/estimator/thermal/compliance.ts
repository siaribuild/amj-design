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

// Weight of the in-band SHGC-target refinement (M4/D2). Small, so it only orders
// cells that are OTHERWISE equal on the band — the report's preferred SHGC (or the
// band midpoint) becomes the tie-break among ~14 near-band glasses without letting
// a preference override the band itself.
const TARGET_WEIGHT = 0.15;

/** The SHGC value a cell should aim at: the report's target if given, else the
 *  midpoint of a two-sided band. Single-bound bands have no midpoint — the band
 *  penalty already encodes the direction, so no in-band refinement is applied. */
function shgcTargetOf(band: ThermalBand): number | null {
  if (band.shgcTarget != null) return band.shgcTarget;
  if (band.minShgc != null && band.maxShgc != null) return (band.minShgc + band.maxShgc) / 2;
  return null;
}

/** 0..1: how well a (frame×glass) cell meets the band. 1.0 = fully in band and on
 *  target; degrades smoothly with distance; floored above 0. An absent band axis is
 *  neutral. M4: axes are BLENDED (probabilistic-OR) so a cell worse on ANY axis
 *  scores strictly lower — no more worst-axis ties among many near-band glasses. */
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

  // In-band SHGC-target refinement (small): among cells the band treats equally,
  // prefer the one nearest the report's target / the band midpoint.
  const target = shgcTargetOf(band);
  const tdist = target != null && cell.shgc != null ? clamp01(Math.abs(cell.shgc - target) / SHGC_SPAN) : 0;

  const raw = (1 - bandPenalty) * (1 - TARGET_WEIGHT * tdist);
  return Math.max(FLOOR, raw);
}
