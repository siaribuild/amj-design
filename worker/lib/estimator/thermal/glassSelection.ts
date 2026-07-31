// WS3: glass selection (the U-value lever).
// For an ALREADY-CHOSEN frame (picked by operation + dimensions), select the glass
// whose (frame×glass) cell meets the resolved band; if none meets it, select the
// CLOSEST and flag a non-blocking warning. Glass is mandatory, so this ALWAYS
// returns a pick — a thermal miss is never an empty line (plan §3/§4).
//
// Closest-glass tie-break (owner decision): nearest SHGC to the report target,
// then lowest (best) Uw. Certified-vs-estimated affects the line's certification
// status, not eligibility.
import type { GlassCell, GlassPick, ThermalBand } from "./types";

const meetsUValue = (cell: GlassCell, band: ThermalBand): boolean =>
  band.maxUValue == null || (cell.uValue != null && cell.uValue <= band.maxUValue + 1e-9);

const meetsShgc = (cell: GlassCell, band: ThermalBand): boolean => {
  if (band.minShgc == null && band.maxShgc == null) return true;
  if (cell.shgc == null) return false;
  if (band.minShgc != null && cell.shgc < band.minShgc - 1e-9) return false;
  if (band.maxShgc != null && cell.shgc > band.maxShgc + 1e-9) return false;
  return true;
};

const meetsBand = (cell: GlassCell, band: ThermalBand): boolean =>
  meetsUValue(cell, band) && meetsShgc(cell, band);

/** The target the tie-break aims at: the report's shgcTarget, else the band midpoint,
 *  else (SHGC unconstrained) the max/min bound, else null. */
function shgcAim(band: ThermalBand): number | null {
  if (band.shgcTarget != null) return band.shgcTarget;
  if (band.minShgc != null && band.maxShgc != null) return (band.minShgc + band.maxShgc) / 2;
  return band.maxShgc ?? band.minShgc ?? null;
}

/** Owner tie-break: nearest SHGC to aim, then lowest (best) Uw. A missing value
 *  sorts last on its axis so a fully-specified cell always wins. */
function compareForBand(a: GlassCell, b: GlassCell, band: ThermalBand): number {
  const aim = shgcAim(band);
  if (aim != null) {
    const da = a.shgc == null ? Infinity : Math.abs(a.shgc - aim);
    const db = b.shgc == null ? Infinity : Math.abs(b.shgc - aim);
    if (da !== db) return da - db;
  }
  const ua = a.uValue ?? Infinity;
  const ub = b.uValue ?? Infinity;
  if (ua !== ub) return ua - ub;
  return a.glassOptionSlug.localeCompare(b.glassOptionSlug); // deterministic final tie-break
}

/** Pick the glass for one opening/lite against a resolved band. `cells` is the
 *  frame's available (frame×glass) cells — never empty (glass is mandatory). */
export function selectGlassForBand(cells: GlassCell[], band: ThermalBand): GlassPick {
  if (!cells.length) {
    // Defensive: the caller guarantees glass exists. If it truly doesn't, this is
    // a genuine catalogue gap, not a thermal miss — surface it honestly.
    throw new Error("selectGlassForBand: no glass cells (catalogue gap)");
  }
  const sorted = [...cells].sort((a, b) => compareForBand(a, b, band));
  const meeting = sorted.filter((c) => meetsBand(c, band));

  if (meeting.length) {
    return { cell: meeting[0], meetsBand: true, reviewRequired: false, reason: null };
  }
  // Nothing meets the band → closest + non-blocking warning.
  return {
    cell: sorted[0],
    meetsBand: false,
    reviewRequired: true,
    reason: "thermal_band_not_met",
  };
}

export const __test = { meetsBand, shgcAim, compareForBand };
