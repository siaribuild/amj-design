// ═══════════════════════════════════════════════════════════════════════════════
// WHICH BOX IS WHICH OPENING
//
// Pass A reports window-shaped things and is deliberately never told what they
// are. This decides, in the Worker, in arithmetic — because the alternative is
// asking a model which window it is looking at, and a model asked that will
// answer, which is how a real reading gets attached to the wrong window.
//
// Nothing here reads a drawing. It compares Pass A's boxes against the schedule
// the platform already holds, and its whole job is to REFUSE the ambiguous ones.
//
// TWO OUTCOMES, which is why this returns a result rather than a Map:
//
//   assigned   this row owns that box, and may be cropped and read.
//   not_read   we cannot say which box is this row's, if any.
//
// THERE IS NO `not_stated` HERE, and that is the correction this file exists
// around. Locating cannot conclude that a drawing is silent: this sees ONE
// elevation, a row missing from it may be on another sheet, and Pass A may
// simply have missed the box. Reporting "no box fits" as "the drawings do not
// show it" is inferring a fact about the WORLD from a failure of our own — the
// mistake this project already made once, when W14 and W16 were declared undrawn
// on exactly that reasoning and were on the sheet all along.
//
// So a row nothing fits is `not_read` with sub-reason `unlocated`, which the
// design states in those words: "not a claim that it is undrawn". `not_stated`
// is a POSITIVE finding and belongs to Pass B — the box was found, the crop was
// read, and the drawing does not divide the opening.
// ═══════════════════════════════════════════════════════════════════════════════
import type { Region } from "./types";

export interface ScheduleRow {
  tag: string;
  widthMm: number;
  heightMm: number;
  typeText: string | null;
  /** This opening's position along its wall, from the floor plan's tag order.
   *  The ONLY signal that separates a same-size pair, and absent until the plan
   *  pass supplies it — in which case such a pair is correctly refused. */
  wallOrder?: number;
}

export interface ElevationBox {
  region: Region;
  proportion: number | null;
  panelCount: number;
  panelsWithSymbol: boolean[];
}

export interface Assignment {
  boxIndex: number;
  /** How far the drawn proportion sat from the stated one. Carried so a reviewer
   *  can see the match was tight rather than merely the best available. */
  proportionDelta: number;
}

/** Why a row was not located. `subReason` is ops-visible detail beneath a single
 *  output state — spec AC-10: never a fourth state on the contract, and never on
 *  a customer surface. */
export interface Unassigned {
  tag: string;
  state: "not_read";
  subReason: "unlocated" | "ambiguous_box" | "ambiguous_row";
  reason: string;
}

export interface AssignResult {
  assigned: Map<string, Assignment>;
  notRead: Unassigned[];
}

/** How far a drawn proportion may sit from the stated one and still be that
 *  window.
 *
 *  A proportion is width÷height off a rendered page, so it carries the page's
 *  scale error and the frame's own line weight. 4% is roughly the ±2% per
 *  dimension the geometric decoder needed against this drafter. It is a
 *  CALIBRATION KNOB, not a rule — the evidence that would move it is the
 *  match rate against a labelled fixture, not an argument. */
const PROPORTION_TOLERANCE = 0.04;

const proportionOf = (r: ScheduleRow) => r.widthMm / r.heightMm;

/**
 * Assign schedule rows to elevation boxes.
 *
 * Deliberately not a best-match loop. A greedy nearest-neighbour pass always
 * produces an answer, and the answers it invents on ambiguous input are exactly
 * the ones that are wrong and confident. Every step here can decline.
 */
export function assign(input: {
  rows: ScheduleRow[];
  boxes: ElevationBox[];
  elevation: string;
}): AssignResult {
  const assigned = new Map<string, Assignment>();
  const notRead: Unassigned[] = [];

  // Which boxes could each row be? Proportion is the discriminator because it
  // survives an uncertain page scale, where an absolute measurement does not.
  const candidates = new Map<string, number[]>();
  for (const r of input.rows) {
    const want = proportionOf(r);
    const fits = input.boxes
      .map((b, i) => ({ i, p: b.proportion }))
      .filter(({ p }) => p !== null && Math.abs(p - want) <= want * PROPORTION_TOLERANCE)
      .map(({ i }) => i);
    candidates.set(r.tag, fits);
  }

  // A box wanted by more than one row cannot be given to either. W14 and W16 are
  // both 2050 x 2000 and the elevations yield ONE frame of that size, so either
  // the second is drawn where this pass does not look or one row is not drawn.
  // Handing that frame to both is the confident wrong answer this reader fails
  // by, and the research harness did exactly that, silently, until a check
  // existed for it.
  const claimants = new Map<number, string[]>();
  for (const [tag, fits] of candidates) {
    for (const i of fits) claimants.set(i, [...(claimants.get(i) ?? []), tag]);
  }

  for (const r of input.rows) {
    const fits = candidates.get(r.tag) ?? [];

    if (fits.length === 0) {
      // NOT proof the opening is undrawn — see the header. It may be on another
      // elevation, or Pass A may have missed it, and neither is knowable here.
      notRead.push({
        tag: r.tag,
        state: "not_read",
        subReason: "unlocated",
        reason: `no box on elevation ${input.elevation} is proportioned like ${r.widthMm}x${r.heightMm}`,
      });
      continue;
    }

    if (fits.length === 1) {
      const only = fits[0];
      const rivals = claimants.get(only) ?? [];
      if (rivals.length > 1) {
        notRead.push({
          tag: r.tag,
          state: "not_read",
          subReason: "ambiguous_box",
          reason: `one box on elevation ${input.elevation} fits ${rivals.length} rows (${rivals.join(", ")}); two openings cannot be one window`,
        });
        continue;
      }
      const p = input.boxes[only].proportion as number;
      assigned.set(r.tag, { boxIndex: only, proportionDelta: Math.abs(p - proportionOf(r)) });
      continue;
    }

    // Several boxes fit, which means they are the same shape, which means
    // proportion has nothing left to say. Order along the wall is the only
    // signal that separates a same-size pair — and where the plan pass has not
    // supplied it, the pair is refused rather than guessed. Guessing is a coin
    // toss over which real reading lands on which window.
    const pair = input.rows
      .filter((o) => (candidates.get(o.tag) ?? []).length > 1 && sameShape(o, r))
      .sort((a, b) => (a.wallOrder ?? 0) - (b.wallOrder ?? 0));
    const ordered = pair.every((o) => typeof o.wallOrder === "number");

    if (!ordered || pair.length !== fits.length) {
      notRead.push({
        tag: r.tag,
        state: "not_read",
        subReason: "ambiguous_row",
        reason: ordered
          ? `${pair.length} rows of this size against ${fits.length} boxes on elevation ${input.elevation}`
          : `${fits.length} boxes fit ${r.tag} and the floor plan's wall order is unknown`,
      });
      continue;
    }

    // Ordered both ways: the plan's order along the wall, against left-to-right
    // on the elevation.
    const leftToRight = [...fits].sort((a, b) => input.boxes[a].region[0] - input.boxes[b].region[0]);
    const slot = pair.findIndex((o) => o.tag === r.tag);
    const chosen = leftToRight[slot];
    const p = input.boxes[chosen].proportion as number;
    assigned.set(r.tag, { boxIndex: chosen, proportionDelta: Math.abs(p - proportionOf(r)) });
  }

  return { assigned, notRead };
}

/** Same stated size, to the millimetre — which is what makes a pair a pair. */
const sameShape = (a: ScheduleRow, b: ScheduleRow) =>
  a.widthMm === b.widthMm && a.heightMm === b.heightMm;
