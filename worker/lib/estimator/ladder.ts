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
import type { RequirementBasis, Tier } from "../../../src/data/recommendation";
import { tierRank } from "../../../src/data/recommendation";

/** The ONE tuned constant in selection (D10). Owner: the owner; reasoning:
 *  NCC compliance is a whole-of-home NatHERS star rating that absorbs
 *  per-window variance, and AFRC Total System figures are product ratings,
 *  not site measurements. Stamped on every persisted run (AC-4). */
export const REQUIREMENT_TOLERANCE = 0.05;

/** Names the model that produced a run, written to the ranker_version columns. */
export const SELECTION_VERSION = "ladder-v2";

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

export interface LadderCandidate {
  /** The caller's stable identity, echoed back untouched. */
  key: string;
  productSlug: string;          // tiebreak 1
  variantId: string | null;     // tiebreak 2
  splitKey: string | null;      // tiebreak 3, splits only (system|glass|unit refs)
  /** Failed a hard constraint. The caller decides what is hard; the ladder only
   *  guarantees such a candidate is never machine-selected. */
  excluded: boolean;
  fits: boolean;
  /** Eligible for tier E promotion when it does not fit (spec §4.6, design §4.4).
   *  The caller stamps this — the ladder never picks which product deserves it. */
  lastResort: boolean;
  /** Scalar from deviationOf; null = unknown. */
  deviation: number | null;
  thermalRequired: boolean;
  /** Math.round(total × 100). null, 0 or negative = unpriceable (spec A6). */
  priceCents: number | null;
}

export interface TieredCandidate extends LadderCandidate {
  tier: Tier;
  competing: boolean;
  rank: number | null;          // null iff tier 'excluded'
  selected: boolean;
}

export interface LadderResult {
  /** Total, deterministic order (AC-5). */
  ranked: TieredCandidate[];
  /** Smallest measurable deviation among fitting candidates — the band anchor. */
  best: number | null;
  competingTier: Tier | null;
  selectedKey: string | null;
}

// The tiers a candidate can compete from, best first. 'excluded' is absent by
// construction: it is the one tier that is never machine-selectable.
const COMPETABLE_TIERS: Tier[] = [
  "meets", "within_tolerance", "misses", "thermal_unknown", "does_not_fit",
];

/** A price is only a price when it is a positive number (spec A6, AC-52): a
 *  rate-card gap that computes $0 must never become "the cheapest product". */
const isPriceable = (c: { priceCents: number | null }): boolean =>
  c.priceCents != null && Number.isFinite(c.priceCents) && c.priceCents > 0;

/** Tier assignment — the ONE set-relative step (band anchoring; AC-48). Every
 *  other comparison in this module is pairwise over stamped facts. */
export function assignTiers(
  candidates: LadderCandidate[],
  tolerance: number = REQUIREMENT_TOLERANCE,
): TieredCandidate[] {
  const best = bestDeviation(candidates);
  const tiered: TieredCandidate[] = candidates.map((c) => ({
    ...c,
    tier: tierOf(c, best, tolerance),
    competing: false,
    rank: null,
    selected: false,
  }));

  // The competing set is every PRICEABLE member of the highest tier (A→E order)
  // holding at least one priceable candidate (AD2). Unpriceable candidates are
  // tiered and ranked but never compete, so a tier made entirely of rate-card
  // gaps cannot black-hole a selection.
  let competingTier: Tier | null = null;
  for (const tier of COMPETABLE_TIERS) {
    if (tiered.some((c) => c.tier === tier && isPriceable(c))) { competingTier = tier; break; }
  }
  if (competingTier) {
    for (const c of tiered) if (c.tier === competingTier && isPriceable(c)) c.competing = true;
  }
  return tiered;
}

/** The smallest deviation any FITTING candidate achieved — the band's anchor.
 *  A candidate that was eliminated, or that does not serve the opening at all,
 *  says nothing about how nearly the requirement can be achieved. */
function bestDeviation(candidates: LadderCandidate[]): number | null {
  let best: number | null = null;
  for (const c of candidates) {
    if (c.excluded || !c.fits) continue;
    const dev = c.thermalRequired ? c.deviation : 0;
    if (dev == null) continue;
    if (best == null || dev < best) best = dev;
  }
  return best;
}

function tierOf(c: LadderCandidate, best: number | null, tolerance: number): Tier {
  if (c.excluded) return "excluded";
  // Fit is hard (D3): a non-fitting candidate is excluded unless the caller
  // promoted it to the last-resort slot, which keeps today's indicative-price
  // promise on an oversize opening (spec §4.6, A4, E12).
  if (!c.fits) return c.lastResort ? "does_not_fit" : "excluded";
  // No requirement to meet ⇒ every fitting candidate meets, whatever thermal
  // figures it does or does not carry (AC-6, E5). Unknown is a gap in the DATA
  // against a real requirement, and there is no requirement here.
  if (!c.thermalRequired) return "meets";
  if (c.deviation == null) return "thermal_unknown";
  if (c.deviation <= 0) return "meets";
  if (best == null) return "within_tolerance";
  return c.deviation <= round6(best + tolerance) ? "within_tolerance" : "misses";
}

/** Pairwise, pure and set-independent over stamped facts (AC-46). The sequence,
 *  which is design §4.2's, in its order:
 *
 *    1. tier ascending
 *    2. within tier C, deviation ascending
 *    3. priced before unpriceable
 *    4. price ascending
 *    5. productSlug → variantId → splitKey
 *
 *  DEVIATION BEFORE PRICEABILITY (spec A18, owner ruling at acceptance). The
 *  losing-candidate list a reviewer reads should lead with "this is the closest
 *  thermal answer and we cannot price it at this size", which is more useful
 *  first than last. This changes what is SHOWN and not what is CHOSEN: selection
 *  reads `competing`, which `assignTiers` sets only on priceable members of the
 *  competing tier, so an unpriceable candidate cannot be selected from any
 *  position. And between two PRICEABLE candidates step 3 is a no-op, so the
 *  order of the candidates that can actually win is untouched.
 *
 *  `certified` / `estimated` appears nowhere in this list, and no longer exists
 *  anywhere in the product (ADR 0011) — AC-49 held by construction even before
 *  the field was deleted, because the comparator could never see it. */
export function compareCandidates(a: TieredCandidate, b: TieredCandidate): number {
  const byTier = tierRank(a.tier) - tierRank(b.tier);
  if (byTier !== 0) return byTier;
  // Tier C is the one tier whose members are NOT interchangeable on the
  // requirement: they all miss it, by measurably different amounts, so the
  // smaller miss leads. Every other tier has already agreed on the requirement
  // — A is met, B is within tolerance of the best achievable, D is unknown and
  // E does not fit — so there is nothing there for deviation to separate.
  if (a.tier === "misses") {
    const da = a.deviation ?? Infinity, db = b.deviation ?? Infinity;
    if (da !== db) return da - db;
  }
  // Among candidates the requirement cannot separate, a rate-card gap sorts
  // last: it is not a cheap product, and it must not lead on price it does not
  // have (spec A6, AC-52).
  const pa = isPriceable(a), pb = isPriceable(b);
  if (pa !== pb) return pa ? -1 : 1;
  if (pa && pb && a.priceCents !== b.priceCents) return a.priceCents! - b.priceCents!;
  // The final tiebreak makes the order TOTAL, so two candidates alike on every
  // fact that matters still rank in the same sequence on every run (AC-5, E10).
  if (a.productSlug !== b.productSlug) return a.productSlug < b.productSlug ? -1 : 1;
  const va = nullFirst(a.variantId), vb = nullFirst(b.variantId);
  if (va !== vb) return va < vb ? -1 : 1;
  const sa = nullFirst(a.splitKey), sb = nullFirst(b.splitKey);
  if (sa !== sb) return sa < sb ? -1 : 1;
  return 0;
}

// Sorts null before any string without special-casing the comparison itself.
const nullFirst = (s: string | null) => s ?? "";

export function runLadder(
  candidates: LadderCandidate[],
  tolerance: number = REQUIREMENT_TOLERANCE,
): LadderResult {
  const tiered = assignTiers(candidates, tolerance);
  const ranked = [...tiered].sort(compareCandidates);

  // An excluded candidate is not in the running, so it carries no rank — but it
  // stays in `ranked`, because staff review has to be able to see it and why.
  let rank = 0;
  for (const c of ranked) c.rank = c.tier === "excluded" ? null : ++rank;

  const winner = ranked.find((c) => c.competing) ?? null;
  if (winner) winner.selected = true;

  return {
    ranked,
    best: bestDeviation(candidates),
    competingTier: winner ? winner.tier : null,
    selectedKey: winner ? winner.key : null,
  };
}
