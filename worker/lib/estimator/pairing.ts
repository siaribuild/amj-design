// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT SPLIT PAIRING — what goes next to a window too wide for one frame
//
// The owner's rule, in full: if the opening is wider than the widest frame the
// family makes, take the alternative family named in Sanity and fill the
// remainder with it. One opening window, then infill.
//
// Confirmed from the live catalogue: the widest awning AMJ makes is 1300mm, so a
// 2050mm awning opening was divided into TWO 1025mm awnings — two windows where
// the manufacturer builds one and a sheet of glass beside it.
//
// ─── Where this sits in the precedence chain ──────────────────────────────────
//
//   drawing-derived split      THE ARCHITECTURAL CONTRACT. Wins every time.
//   energy report components   enumerates components where a schedule is silent
//   schedule comment           the architect's own words, when there are any
//   FAMILY DEFAULT ← here      the fallback, when nothing above is available
//   even split                 N equal units — the floor, when no rule is authored
//
// The report sat at the TOP of this list, described as authoritative because "an
// engineer stated the make-up". That is the wrong reason for a real ranking, and
// the wrong reason made it look deliberate when the drawings arrived below it.
// The report is not an architectural authority — it earned its place over a
// SCHEDULE because a schedule typically says "AWNING" and nothing about how the
// opening divides, while the report enumerates components. Given only a schedule
// it remains a good fallback. Given drawings, the drawings win (owner,
// 2026-08-27; output spec §6).
//
// It is deliberately the weakest claim: it applies only when nothing states the
// layout.
//
// ─── What this deliberately does NOT model ───────────────────────────────────
// Placement, a cap on operable units, and a width that earns another one were all
// authored knobs once. They are gone. A unit here is a whole WINDOW — frame
// included, which is what its dimensions describe — so coupling two of them
// already produces the mullion between them; there is no separate sash to place
// or count. Which SIDE the opening window sits on is not a property of the
// family at all: only the drawing knows, and a default cannot invent it.
//
// ─── Why this file is pure ────────────────────────────────────────────────────
// No D1, no Sanity client, no model. It takes the family's authored rule and the
// numbers, and returns a layout or null. That makes every case testable against
// the real catalogue's dimensions rather than against a mock.
// ═══════════════════════════════════════════════════════════════════════════════
import type { FamilyDefaultSplit } from "../../../src/data/catalogue";

/** One unit of a proposed layout, left to right. */
export interface PairedUnit {
  /** "operable" carries the opening's own family; "infill" carries the family
   *  named by the rule. Kept as a role rather than a resolved product because
   *  product selection is the estimator's job and happens per segment. */
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
  /** The schedule called this an OFFSET unit, so the opening pane is the
   *  smaller part. Read from the schedule's own wording rather than the family:
   *  "AWNING" and "OFFSET AWNING" resolve to the same family and only the
   *  schedule tells them apart. */
  offset?: boolean;
}

/** Below this an infill panel is a sliver nobody would build. Overridable per
 *  family; it is the one remaining knob because it is a manufacturing fact
 *  about the panel, not a preference about layout. */
const DEFAULT_MIN_INFILL_MM = 400;

/** A straight half is the typical make-up; an OFFSET unit's opening pane is the
 *  smaller part, nearer a third. Both are overridable per family. */
const DEFAULT_OPERABLE_RATIO = 0.5;
const DEFAULT_OFFSET_RATIO = 0.3;

/** No window is made ending in anything but 0 or 5 — nobody builds a 1027mm
 *  unit. Every unit but the closing one lands on this step. */
const STEP_MM = 5;
const snap = (mm: number) => Math.round(mm / STEP_MM) * STEP_MM;
/** Down to the step — a cap must never be rounded UP past the maximum it caps. */
const floorStep = (mm: number) => Math.floor(mm / STEP_MM) * STEP_MM;
const clampRatio = (r: number) => (Number.isFinite(r) && r > 0 && r < 1 ? r : DEFAULT_OPERABLE_RATIO);

/**
 * Propose the layout, or null to leave the even split alone.
 *
 * Returns null — meaning "no opinion", never "refuse to split" — when:
 *   • the family names no infill family (the default for every family)
 *   • the opening fits in one frame, so there is nothing to pair
 *   • either family's max width is unknown, so the arithmetic has no floor
 *   • the infill would be a sliver below minInfillMm
 *   • the result would exceed maxSegments
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

  const minInfill = Math.max(0, rule?.minInfillMm ?? DEFAULT_MIN_INFILL_MM);

  // A RATIO, not "the widest frame the family makes".
  //
  // Maxing the opening pane put a 1300mm sash beside a 750mm panel on a 2050mm
  // opening — 63/37, on a range whose typical make-up is a straight half and
  // whose OFFSET units sit nearer 30/70. It optimised for the panel being small,
  // which is not a thing anybody asked for. The ratio is also the shape the
  // drawings state and the plan parse will return, so when that lands it
  // replaces this number in place and the arithmetic below is unchanged.
  const ratio = clampRatio(input.offset
    ? rule?.offsetOperableRatio ?? rule?.operableRatio ?? DEFAULT_OFFSET_RATIO
    : rule?.operableRatio ?? DEFAULT_OPERABLE_RATIO);

  // Every unit but the last snaps to the step; the last takes what is left, so
  // the units always partition the opening EXACTLY. Snapping all of them would
  // break that invariant whenever the opening itself is not a multiple of the
  // step — and validateSplit flags a coverage delta, so an inexact partition is
  // a defect, not a rounding detail. Only the closing piece carries an unround
  // figure, which is correct: it is the one cut to fit.
  // The ratio is a preference; the frame's maximum is a fact. Half of a 3600mm
  // opening is an 1800mm awning nobody makes — and DECLINING there would hand it
  // back to the even split, which is three awnings, the exact outcome this rule
  // exists to prevent. So the opening unit takes its share or the widest frame
  // the family builds, whichever is smaller, and the glass absorbs the rest.
  const operableWidth = Math.min(snap(width * ratio), floorStep(operableMaxWidthMm));
  if (operableWidth <= 0) return null;

  const remaining = width - operableWidth;
  if (remaining < minInfill) return null;                // a sliver, not a panel

  // Enough infill panels that none exceeds the infill family's own maximum.
  const infillCount = Math.ceil(remaining / infillMaxWidthMm);
  const infillWidths = evenly(remaining, infillCount);
  // The last panel takes the remainder so it is the widest; checking every one
  // therefore checks the narrowest.
  if (infillWidths.some((w) => w < minInfill)) return null;

  // Opening window first, then the infill. This is an ORDER, not a claim about
  // handedness — which jamb the opening window sits against is in the drawings
  // and nowhere else, and the reviewer confirms it.
  const units: PairedUnit[] = [
    { role: "operable", widthMm: operableWidth },
    ...infillWidths.map((widthMm) => ({ role: "infill" as const, widthMm })),
  ];
  if (units.length > maxSegments) return null;

  const panels = infillWidths.length;
  return {
    units,
    note: `Proposed as 1 opening unit with ${panels} fixed ${panels === 1 ? "panel" : "panels"} — `
      + "the standard make-up for this range when an opening is wider than one frame. "
      + "Confirm the configuration at review.",
  };
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
