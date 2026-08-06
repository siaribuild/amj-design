// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT SPLIT PAIRING — what goes next to a window too wide for one frame
//
// The builder's correction, verbatim: "if the window is too small for an opening,
// the default approach is to have a fixed window next to it… there's no point to
// offer 3 awning windows next to each other when we know with great certainty
// that it shall be Awning + Fixed."
//
// Confirmed from the live catalogue: the widest awning AMJ makes is 1300mm, so a
// 3600mm awning opening is divided by the current default into THREE 1200mm
// awnings — three chain winders and 8.6m² of operable sash where the
// manufacturer would build one sash and a sheet of glass.
//
// ─── Where this sits in the precedence chain ──────────────────────────────────
//
//   energy report components   authoritative — an engineer stated the make-up
//   drawing-derived split      read from submitted plans + elevations
//   schedule comment           the architect's own words
//   FAMILY DEFAULT ← here      the fallback, when nothing above is available
//   even split                 N equal units — today's answer, still the floor
//
// It is deliberately the weakest claim. It applies when nothing states the
// layout — which includes the common case of a photographed schedule page, a
// document that carries no geometry and never will. For those openings the
// alternative is not "no split", it is an evenly-divided guess.
//
// ─── Why this file is pure ────────────────────────────────────────────────────
// No D1, no Sanity client, no model. It takes the family's authored rule and the
// numbers, and returns a layout or null. That makes every case below testable
// against the real catalogue's dimensions rather than against a mock.
// ═══════════════════════════════════════════════════════════════════════════════
import type { FamilyDefaultSplit } from "../../../src/data/catalogue";

/** One unit of a proposed layout, left to right. */
export interface PairedUnit {
  /** "operable" carries the parent opening's own family; "infill" carries the
   *  family named by the rule. Kept as a role rather than a resolved product
   *  because product selection is the estimator's job and happens per segment. */
  role: "operable" | "infill";
  widthMm: number;
}

export interface PairedLayout {
  units: PairedUnit[];
  /** Stated so the note can explain itself. A reviewer who sees a layout they
   *  did not expect should be able to read WHY without opening the code. */
  note: string;
}

export interface PairingInput {
  openingWidthMm: number;
  /** The widest single frame in the OPENING's own family. */
  operableMaxWidthMm: number;
  /** The widest single frame in the infill family. */
  infillMaxWidthMm: number;
  /** The composite policy cap — a composite may not exceed this many units. */
  maxSegments: number;
  rule: FamilyDefaultSplit | null | undefined;
}

const DEFAULTS = { placement: "outer" as const, maxOperable: 2, minInfillMm: 400 };

/**
 * Propose the layout, or null to leave today's even split alone.
 *
 * Returns null — meaning "no opinion", never "refuse to split" — when:
 *   • the family names no infill family (the default for every family)
 *   • the opening fits in one frame, so there is nothing to pair
 *   • either family's max width is unknown, so the arithmetic has no floor
 *   • the infill would be a sliver below minInfillMm
 *   • no arrangement fits inside maxSegments
 *
 * In every one of those the caller falls through to the even split, which is
 * exactly the behaviour that shipped before this file existed.
 */
export function proposePairedLayout(input: PairingInput): PairedLayout | null {
  const { openingWidthMm: width, operableMaxWidthMm, infillMaxWidthMm, maxSegments, rule } = input;
  const infillFamily = rule?.infillFamilySlug?.trim();
  if (!infillFamily) return null;
  if (!(width > 0) || !(operableMaxWidthMm > 0) || !(infillMaxWidthMm > 0)) return null;
  if (width <= operableMaxWidthMm) return null;          // one frame covers it

  const placement = rule?.placement ?? DEFAULTS.placement;
  const maxOperable = clampInt(rule?.maxOperable ?? DEFAULTS.maxOperable, 1, 6);
  const minInfill = Math.max(0, rule?.minInfillMm ?? DEFAULTS.minInfillMm);
  const everyMm = rule?.operableEveryMm && rule.operableEveryMm > 0 ? rule.operableEveryMm : null;

  // How many opening sashes this opening earns: ONE PER FULL MULTIPLE of the
  // authored width. At 3000, an opening gets one sash up to 5999 and two from
  // 6000 — which is what makes the builder's own case (3600 ⇒ one sash and a
  // lite) come out right, and is what the field's description now says. It
  // previously described a second sash "past 3000", which the arithmetic never
  // did; the description was corrected rather than this, because the 3600 case
  // is the one he actually stated.
  //
  // "No point offering 3 awnings" is a statement about a CAP, not a constant —
  // a 6m opening with a single 1.3m sash is under-ventilated and a reviewer
  // would correct it every time. With no width authored, it is exactly one sash
  // however wide the hole.
  const earned = everyMm ? Math.floor(width / everyMm) : 1;
  let k = clampInt(earned, 1, maxOperable);

  // Fit inside the composite cap, giving up sashes before giving up the pairing:
  // one sash and a wall of glass is still the right shape, and it is what the
  // manufacturer would build.
  for (; k >= 1; k--) {
    const plan = layout(width, k, operableMaxWidthMm, infillMaxWidthMm, minInfill, placement);
    if (!plan) continue;
    if (plan.length <= maxSegments) {
      return {
        units: plan,
        note: noteFor(plan, k, everyMm, width, maxSegments),
      };
    }
  }
  return null;
}

function layout(
  width: number, k: number, operableMax: number, infillMax: number,
  minInfill: number, placement: NonNullable<FamilyDefaultSplit["placement"]>,
): PairedUnit[] | null {
  // Sashes take their full width: the operable panel is the expensive, size-
  // constrained one, so making it as large as the family allows minimises how
  // many of them the opening needs.
  const operableTotal = k * operableMax;
  const remaining = width - operableTotal;
  if (remaining < minInfill) return null;                 // a sliver, not a panel

  // Enough infill panels that none exceeds the infill family's own maximum —
  // and never fewer than the placement itself requires. `centre` puts glass at
  // BOTH jambs, so a single panel cannot express it: with one panel the result
  // was indistinguishable from `right`, which is a different instruction.
  const minPanels = placement === "centre" ? 2 : 1;
  const infillCount = Math.max(minPanels, Math.ceil(remaining / infillMax));
  const infillWidths = evenly(remaining, infillCount);
  // The last panel takes the remainder so it is the widest; checking every one
  // therefore checks the narrowest. A placement that cannot be built at this
  // width returns null and the caller drops a sash and tries again.
  if (infillWidths.some((w) => w < minInfill)) return null;

  const sash = (): PairedUnit => ({ role: "operable", widthMm: operableMax });
  const glass = (w: number): PairedUnit => ({ role: "infill", widthMm: w });

  if (placement === "left") return [...times(k, sash), ...infillWidths.map(glass)];
  if (placement === "right") return [...infillWidths.map(glass), ...times(k, sash)];
  if (placement === "centre") {
    // Glass to the jambs, sashes together in the middle.
    const half = Math.ceil(infillWidths.length / 2);
    return [
      ...infillWidths.slice(0, half).map(glass),
      ...times(k, sash),
      ...infillWidths.slice(half).map(glass),
    ];
  }

  // "outer" — a sash at EACH jamb and the glass distributed between them. This
  // is the shape an explicit "AWNING + FIXED + AWNING" comment produces, so a
  // stated layout and the family default agree rather than contradict.
  //
  // The panels are spread across the k-1 interior gaps rather than all dumped
  // into the first one: the earlier version appended the surplus sashes after
  // the glass, so three sashes came out as sash | glass | sash | sash — two
  // sashes adjacent at one jamb and none of the promised symmetry.
  if (k === 1) return [sash(), ...infillWidths.map(glass)];
  const gaps = k - 1;
  const out: PairedUnit[] = [];
  let taken = 0;
  for (let i = 0; i < k; i++) {
    out.push(sash());
    if (i >= gaps) continue;
    // Largest-remainder spread, so n panels over m gaps never loses or repeats
    // one. Fewer panels than gaps simply leaves some sashes adjacent, which is
    // still sashes-at-the-jambs and is the honest answer at that width.
    const upto = Math.round(((i + 1) * infillWidths.length) / gaps);
    while (taken < upto) out.push(glass(infillWidths[taken++]));
  }
  return out;
}

/** Split `total` into `n` whole millimetres that sum EXACTLY to it. The remainder
 *  goes to the last panel rather than being rounded away — the units partition
 *  the opening, and a composite that does not add up is the fault the estimator
 *  already flags. */
function evenly(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const out = Array.from({ length: n }, () => base);
  out[n - 1] = total - base * (n - 1);
  return out;
}

const times = <T,>(n: number, make: () => T): T[] => Array.from({ length: Math.max(0, n) }, make);

function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.floor(Number(v) || lo);
  return Math.max(lo, Math.min(hi, n));
}

function noteFor(
  plan: PairedUnit[], k: number, everyMm: number | null, width: number, maxSegments: number,
): string {
  const sashes = plan.filter((u) => u.role === "operable").length;
  const panels = plan.length - sashes;
  const capped = everyMm != null && Math.floor(width / everyMm) > k;
  const base = `Proposed as ${sashes} opening ${sashes === 1 ? "sash" : "sashes"} with `
    + `${panels} fixed ${panels === 1 ? "panel" : "panels"} — the standard make-up for this `
    + `range when an opening is wider than one frame.`;
  return capped
    ? `${base} Limited to ${sashes} by the ${maxSegments}-unit maximum for a composite.`
    : `${base} Confirm the configuration at review.`;
}
