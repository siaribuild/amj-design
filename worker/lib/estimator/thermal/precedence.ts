// WS2: thermal requirement precedence resolver.
// Given an opening (or a composite lite), resolve ONE coherent thermal band by the
// owner's precedence — tier-1 own-explicit → tier-2 per-element-type (shared) →
// tier-3 computed — and NEVER return an impossible (min>max) band.
//
// This centralises resolution that was scattered and buggy:
//   - energyMap.strictest() intersected composite child bands into min>max
//   - rules.effectiveThermalRequirements() intersected explicit ∩ advisory the same way
// Both delegate here so there is exactly one guarded resolution path.
import type { OpeningInput } from "../types";
import type { ThermalBand, ResolvedThermalBand, ComponentBand } from "./types";

export interface PrecedenceInput {
  opening: OpeningInput;
  /** For a composite lite: its component band (tier-1) and element type (tier-2 key). */
  component?: ComponentBand | null;
  /** Tier-2 source: per-element-type bands promoted from the energy report
   *  (e.g. { awning: {…}, fixed: {…} }). Empty when the report had no type rows. */
  sharedByType?: Record<string, ThermalBand>;
  /** Tier-3: the computed band for this opening/lite (from computeDefaultBand). */
  computed?: ThermalBand | null;
}

export const EMPTY_BAND: ThermalBand = { maxUValue: null, minShgc: null, maxShgc: null, shgcTarget: null };

/** Does a band carry any constraint at all? */
export function bandHasConstraint(b: ThermalBand): boolean {
  return b.maxUValue != null || b.minShgc != null || b.maxShgc != null;
}

/** Normalise an opening's flat requirement shape into a ThermalBand. */
export function bandFromRequirements(
  req: OpeningInput["requirements"] | OpeningInput["advisoryRequirements"] | null | undefined,
  shgcTarget: number | null = null,
): ThermalBand {
  return {
    maxUValue: req?.maxUValue ?? null,
    minShgc: req?.minShgc ?? null,
    maxShgc: req?.maxShgc ?? null,
    shgcTarget,
  };
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

/** Resolve the effective band by precedence, guarding coherence at every merge. */
export function resolveThermalBand(input: PrecedenceInput): ResolvedThermalBand {
  const elementType = (input.component?.elementType ?? input.opening.operationType ?? null)?.toLowerCase() ?? null;
  let noted: string | null = null;
  let sawIncoherent = false;

  // Ordered (band, basis) candidates.
  const explicit = input.component?.band ?? bandFromRequirements(input.opening.requirements);
  const shared = elementType ? input.sharedByType?.[elementType] : undefined;
  const candidates: { band: ThermalBand | undefined; basis: ResolvedThermalBand["basis"] }[] = [
    { band: bandHasConstraint(explicit) || explicit.shgcTarget != null ? explicit : undefined, basis: "explicit_ref" },
    { band: shared, basis: "shared_type" },
    { band: input.computed ?? undefined, basis: "computed" },
  ];

  for (const c of candidates) {
    if (!c.band) continue;
    const { band, altered } = coerceCoherent(c.band);
    if (altered) {
      sawIncoherent = true;
      noted = noted ?? `${c.basis}_band_incoherent_dropped`;
    }
    if (band && (bandHasConstraint(band) || band.shgcTarget != null)) {
      return { band, basis: c.basis, incoherent: altered, note: altered ? noted : null };
    }
    // else: this tier collapsed to nothing usable — fall through to the next.
  }

  return { band: EMPTY_BAND, basis: "none", incoherent: sawIncoherent, note: noted };
}
