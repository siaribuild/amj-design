// WS2 thermal coherence guard.
// coerceCoherent() is the single guarded normalisation that both the energy-map
// intersection and rules.effectiveThermalRequirements() route through, so an
// impossible (min>max) band never becomes a hard filter — the anti-regression
// for the original empty-band bug. (The precedence *resolver* that once lived
// here was dead code; live selection is the weighted ranker.)
import type { ThermalBand } from "./types";

/** Does a band carry any constraint at all? */
export function bandHasConstraint(b: ThermalBand): boolean {
  return b.maxUValue != null || b.minShgc != null || b.maxShgc != null;
}

/** Guard: an incoherent band (minShgc > maxShgc, or a nonsensical U cap) must
 *  never become a hard filter. Returns a coherent band (or null when nothing
 *  usable survives) plus whether it had to be altered — the anti-regression for
 *  the original empty-band bug. We DROP an impossible SHGC pair (keeping Uw and
 *  the advisory target); we never swap-and-guess. */
export function coerceCoherent(band: ThermalBand): { band: ThermalBand | null; altered: boolean } {
  let altered = false;
  let { maxUValue, minShgc, maxShgc } = band;
  const shgcTarget = band.shgcTarget;

  // A non-positive / absurd U cap is not a real constraint.
  if (maxUValue != null && !(maxUValue > 0)) { maxUValue = null; altered = true; }

  // The motivating failure: an empty SHGC interval. Drop the pair, keep the
  // target as advisory (it still guides the glass tie-break).
  if (minShgc != null && maxShgc != null && minShgc > maxShgc) {
    minShgc = null;
    maxShgc = null;
    altered = true;
  }
  // A lone bound outside [0,1] is meaningless.
  if (minShgc != null && (minShgc < 0 || minShgc > 1)) { minShgc = null; altered = true; }
  if (maxShgc != null && (maxShgc < 0 || maxShgc > 1)) { maxShgc = null; altered = true; }

  const coerced: ThermalBand = { maxUValue, minShgc, maxShgc, shgcTarget };
  if (!bandHasConstraint(coerced) && shgcTarget == null) return { band: null, altered };
  return { band: coerced, altered };
}
