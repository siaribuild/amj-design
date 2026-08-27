// ═══════════════════════════════════════════════════════════════════════════════
// DOES THE READING SURVIVE SCRUTINY
//
// The release gate's bar is ZERO WRONG READINGS, and a wrong reading does not
// announce itself — it is well-formed, plausible, and describes a window nobody
// drew. The only thing that catches one is a second source disagreeing.
//
// So: two independent checks, and NEITHER RESOLVES ANYTHING.
//
//   1. schedule cross-check   the schedule names the family; the drawing says
//                             which leaves operate. FIXED with an operating leaf
//                             is a contradiction, and so is AWNING with none.
//   3. dimension agreement    a unit that states a printed width its own ratio
//                             says is impossible.
//
// (Check 2 is the geometric second opinion, which needs a page it can decode and
// lives elsewhere. These two need nothing but the schedule the platform already
// holds, which is why they hold the line while it is being built.)
//
// A DISAGREEMENT IS AN OUTPUT, NOT A DECISION. House rule: a conflict is
// represented, never silently resolved — the reviewer decides. Picking a winner
// here would be indistinguishable, downstream, from never having noticed: a
// fixed pane priced as an awning, or an awning priced as glass, either way with
// nothing on the line to say a second source objected.
// ═══════════════════════════════════════════════════════════════════════════════
import type { CompositionReading } from "../estimator/skills/drawingRead";
import type { ScheduleRow } from "./assign";

export interface Disagreement {
  check: "schedule_cross_check" | "dimension_agreement";
  /** Both claims, in words a reviewer can act on without reopening the PDF. */
  detail: string;
}

export interface Verification {
  agrees: boolean;
  disagreements: Disagreement[];
}

/** Families that do not open. A FIXED row whose drawing shows an operating leaf
 *  is describing a different window from the one the schedule specified. */
const NON_OPERABLE = /\b(fixed|highlight|feature|lite)\b/i;

/** Families that must have at least one operating leaf, by their own name. */
const OPERABLE = /\b(awning|casement|sliding|slider|stacker|bifold|double[- ]hung|tilt|louvre|hinged)\b/i;

/** How far a stated width may sit from what its ratio implies.
 *
 *  Generous on purpose: the ratio is a measurement off a drawing and the width
 *  is a printed figure, so they disagree by a few percent routinely and that is
 *  not news. This is looking for the impossible — a leaf claiming 600mm where
 *  its own share puts it at 1968 — not for the imprecise. */
const WIDTH_TOLERANCE = 0.15;

export function verifyReading(input: {
  row: ScheduleRow;
  reading: CompositionReading;
}): Verification {
  const { row, reading } = input;
  const disagreements: Disagreement[] = [];

  // A decline is not a claim, so there is nothing to check it against. Verifying
  // one would manufacture disagreements out of openings the drawings never
  // described — which is how `not_stated` starts looking like a fault.
  if (reading.outcome !== "read") return { agrees: true, disagreements: [] };

  // ── Check 1: the schedule and the drawing describing the same window ────────
  const type = row.typeText ?? "";
  const operableCount = reading.units.filter((u) => u.operable).length;

  if (NON_OPERABLE.test(type) && !OPERABLE.test(type) && operableCount > 0) {
    disagreements.push({
      check: "schedule_cross_check",
      detail: `the schedule calls ${row.tag} "${type}" but the drawing shows `
        + `${operableCount} of ${reading.units.length} leaves carrying an operating symbol`,
    });
  }
  if (OPERABLE.test(type) && operableCount === 0) {
    disagreements.push({
      check: "schedule_cross_check",
      detail: `the schedule calls ${row.tag} "${type}" but no leaf in the drawing `
        + "carries an operating symbol",
    });
  }

  // ── Check 3: a printed width against the share it claims ───────────────────
  // Only where the sheet actually printed one. A ratio alone cannot disagree
  // with anything — it IS the reading — so an absent width is silence, not
  // agreement, and is not reported either way.
  const total = reading.divisionAxis === "horizontal" ? row.heightMm : row.widthMm;
  for (const [i, u] of reading.units.entries()) {
    if (u.widthMm === null) continue;
    const implied = u.ratio * total;
    if (Math.abs(implied - u.widthMm) > Math.max(implied, u.widthMm) * WIDTH_TOLERANCE) {
      disagreements.push({
        check: "dimension_agreement",
        detail: `${row.tag} unit ${i + 1}: the sheet prints ${u.widthMm}mm, but its share `
          + `of ${total}mm is ${Math.round(implied)}mm`,
      });
    }
  }

  return { agrees: disagreements.length === 0, disagreements };
}
