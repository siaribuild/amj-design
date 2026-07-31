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

/** 0..1: how well a (frame×glass) cell meets the band. 1.0 = fully in band;
 *  degrades smoothly with distance; floored above 0. An absent band axis is
 *  neutral (no penalty on that axis). */
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

  if (!penalties.length) return 1; // fully in band, or no band at all.
  // TODO(glazing-thermal-M4 / D2): worst-axis-only ties a strictly-worse cell with
  // an equal-worst-axis cell — harmless at 1 variant, but it FLATTENS real thermal
  // differences among ~14 near-band glasses. Blend the axes (weighted / RMS) so a
  // cell worse on ANY axis scores strictly lower, and factor shgcTarget distance.
  const worst = Math.max(...penalties);
  return Math.max(FLOOR, 1 - worst);
}
