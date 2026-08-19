// The selection ladder — the ONE place a candidate is compared with another
// (docs/specs/recommendation-model-design.md §4, ADR 0007).
//
// Filter-then-ladder, never a weighted score: hard constraints eliminate
// (the CALLER stamps `excluded`), survivors are tiered by requirement-relative
// thermal deviation, and the cheapest priceable candidate of the best non-empty
// tier wins. There are no weights, no blended score and no normalisation across
// the candidate set.
//
// Pure and synchronous: no I/O, no repository, no pricing engine.
import type { RequirementBasis } from "../../../src/data/recommendation";

export interface ResolvedRequirement {
  maxUValue: number | null;
  minShgc: number | null;
  maxShgc: number | null;
  basis: RequirementBasis | null;
  /** True when there is no thermal requirement at all — every fitting candidate
   *  then meets (AC-6, E5), rather than every candidate being unknown. */
  absent: boolean;
}

export interface ThermalReading {
  uValue: number | null;
  shgc: number | null;
}

export type ThermalAxis = "uValue" | "minShgc" | "maxShgc";

export interface Deviation {
  perAxis: { uValue: number | null; minShgc: number | null; maxShgc: number | null };
  worstAxis: ThermalAxis | null;
  /** The scalar the ladder compares. null = UNKNOWN (a constrained axis had no
   *  figure) — not zero, and not comparable with any number (spec A2). */
  scalar: number | null;
  /** The worst axis's miss in the requirement's own unit, for display. */
  absoluteMiss: number | null;
}

// Deviation is a ratio of measured quantities, so it carries float noise that
// would otherwise make 4.4 against a 4.0 cap read as 0.10000000000000009 and
// flap a band edge. Six decimal places is far finer than any real thermal
// difference and makes the arithmetic reproducible.
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** D8's math, the single home. Per constrained axis the miss is divided by the
 *  requirement value on that axis, so Uw and SHGC are commensurable and neither
 *  carries a hidden multiplier. The scalar is the MAX across constrained axes
 *  (spec A1): the requirement is a conjunction, and the degree to which a
 *  candidate fails a conjunction is the worst of its failures. */
export function deviationOf(req: ResolvedRequirement, reading: ThermalReading): Deviation {
  const perAxis: Deviation["perAxis"] = { uValue: null, minShgc: null, maxShgc: null };
  let worstAxis: ThermalAxis | null = null;
  let scalar = 0;
  let absoluteMiss: number | null = null;

  // One entry per CONSTRAINED axis. An axis the requirement is silent about is
  // not a constraint and contributes nothing — never a zero, never a penalty.
  const constrained: { axis: ThermalAxis; limit: number; value: number | null; miss: number }[] = [];
  if (req?.maxUValue != null) {
    constrained.push({ axis: "uValue", limit: req.maxUValue, value: reading?.uValue ?? null, miss: (reading?.uValue ?? 0) - req.maxUValue });
  }
  if (req?.minShgc != null) {
    constrained.push({ axis: "minShgc", limit: req.minShgc, value: reading?.shgc ?? null, miss: req.minShgc - (reading?.shgc ?? 0) });
  }
  if (req?.maxShgc != null) {
    constrained.push({ axis: "maxShgc", limit: req.maxShgc, value: reading?.shgc ?? null, miss: (reading?.shgc ?? 0) - req.maxShgc });
  }

  // No constrained axis at all — including an explicitly absent requirement —
  // is deviation ZERO, not unknown: there is nothing to fail (AC-6, E5).
  if (req?.absent || !constrained.length) {
    return { perAxis, worstAxis: null, scalar: 0, absoluteMiss: null };
  }

  let unknown = false;
  for (const c of constrained) {
    // A2: no figure on a constrained axis makes the WHOLE candidate unknown —
    // its worst axis cannot be asserted, so nothing about it can be compared
    // with a measured deviation, however large that deviation is.
    if (c.value == null || !Number.isFinite(c.value) || !(c.limit > 0)) { unknown = true; continue; }
    const miss = Math.max(0, c.miss);
    const dev = round6(miss / c.limit);
    perAxis[c.axis] = dev;
    // Strictly greater, so the first axis in a tie keeps the worst-axis slot and
    // the answer stays deterministic.
    if (dev > scalar) { scalar = dev; worstAxis = c.axis; absoluteMiss = round6(miss); }
  }

  if (unknown) return { perAxis, worstAxis: null, scalar: null, absoluteMiss: null };
  return { perAxis, worstAxis, scalar, absoluteMiss };
}
