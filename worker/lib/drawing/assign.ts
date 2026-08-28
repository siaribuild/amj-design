// ═══════════════════════════════════════════════════════════════════════════════
// WHICH BOX IS WHICH OPENING
//
// THE TAG IS THE JOIN, AND THE SHEET CARRIES IT. Pass A reads the label beside
// each window — including one tied on by a leader line — and this matches by
// that label. Proportion stays, as a CHECK on a tag that was read.
//
// It was built the other way round, and the reversal is an owner ruling
// (2026-08-27) plus a production measurement (2026-08-28). The original doctrine
// was that a model asked "which window is this" will always answer, so the join
// should be arithmetic over the schedule's own dimensions. That risk is real.
// The cost was worse: a house's windows share proportions, so the arithmetic
// refused nearly every row as ambiguous — four sheets inventoried, eighteen
// windows found, and TWO openings of nineteen assigned, with every refused row
// falling back to the platform's even split. A reader that declines 90% of its
// input has not avoided the wrong answer, it has avoided answering.
//
// The ambiguity checks below are unchanged and still do the refusing. What
// changed is what they are given to work with.
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
import { normalizeOpeningRef } from "../ai/energyMap";

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
  /** The opening's label as read off the sheet — "W12", "D1" — or null where
   *  none is legible. Null is an honest answer and keeps the proportion path
   *  below, so a sheet whose labels cannot be read behaves exactly as it did
   *  before this field existed. */
  tag?: string | null;
}

export interface Assignment {
  boxIndex: number;
  /** How far the drawn proportion sat from the stated one. Carried so a reviewer
   *  can see the match was tight rather than merely the best available. */
  proportionDelta: number;
  /** HOW this was decided. The caller runs one sheet at a time, so it needs this
   *  to settle a row two sheets both claim: a label read off the paper outranks
   *  a shape that merely fits. Without it, a row correctly tagged on sheet A and
   *  coincidentally proportioned on sheet B was discarded as ambiguous. */
  by: "tag" | "proportion";
  /** The sheet named this row, and the box it named is the wrong shape for it.
   *  The label still wins — it is the join — but a composition read off a box
   *  that contradicts the schedule must not be accepted in silence. */
  proportionContradicts?: boolean;
}

/** Why a row was not located. `subReason` is ops-visible detail beneath a single
 *  output state — spec AC-10: never a fourth state on the contract, and never on
 *  a customer surface. */
export interface Unassigned {
  tag: string;
  state: "not_read";
  subReason: "unlocated" | "ambiguous_box" | "ambiguous_row" | "duplicate_tag";
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

/** Two sheets both claim one row — which wins.
 *
 *  `assign` sees ONE elevation, so this cannot live inside it, and the caller
 *  that loops the sheets was treating every second claim as a conflict. That
 *  deleted the correct location whenever a row was NAMED on one sheet and merely
 *  the right shape on another, which is common: an opening appears on its own
 *  elevation and something similar appears on the next.
 *
 *  A label read off the paper outranks a shape that happens to fit. Two labels
 *  disagreeing is a real contradiction and still refuses, as do two shapes —
 *  which is exactly the behaviour that existed before tags. */
export function preferLocation(
  held: { by: "tag" | "proportion" },
  incoming: { by: "tag" | "proportion" },
): "keep" | "replace" | "ambiguous" {
  if (held.by === incoming.by) return "ambiguous";
  return incoming.by === "tag" ? "replace" : "keep";
}

/** The whole per-sheet merge decision, including the case preferLocation cannot
 *  see: a row already REFUSED as ambiguous holds nothing, so the next sheet to
 *  claim it would find an empty slot and install itself.
 *
 *  That is how three sheets naming one opening ended with the last one winning a
 *  contest already declared undecidable (Codex). A refusal is a conclusion, not
 *  an absence, and this is the function that knows the difference. */
export function locationVerdict(input: {
  held: { by: "tag" | "proportion" } | undefined;
  incoming: { by: "tag" | "proportion" };
  /** What KIND of claim this row was already refused over, or null.
   *
   *  The source matters, and treating the flag as a plain boolean made the
   *  outcome depend on the order the sheets sit in the PDF: two proportion
   *  guesses conflicting early made the row final, so a later sheet that
   *  actually READ its tag was ignored and the strongest evidence lost to the
   *  weakest for arriving late. (Codex.)
   *
   *  A tag disagreeing with a tag is the drawing contradicting itself, and that
   *  is final. Two shapes that both fit is a failure of arithmetic, and
   *  arithmetic yields to a label. */
  conflicted: "tag" | "proportion" | null;
}): "take" | "keep" | "conflict" | "ignore" {
  if (input.conflicted === "tag") return "ignore";
  if (input.conflicted === "proportion") return input.incoming.by === "tag" ? "take" : "ignore";
  if (!input.held) return "take";
  const verdict = preferLocation(input.held, input.incoming);
  return verdict === "ambiguous" ? "conflict" : verdict === "replace" ? "take" : "keep";
}

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

  // ── What the sheet itself says ────────────────────────────────────────────
  // THE PLATFORM'S OWN TAG NORMALISER, not a local one. The output spec says
  // separators and case are noise — "W-04" and "W04" are one window — and a
  // whitespace-only key made a drafter's hyphen enough to lose the opening
  // twice over: the row went unlocated, and the box was withheld from the
  // proportion fallback for belonging to somebody else.
  //
  // Its one known gap is a leading zero: "W 4" normalises to W4, not W04. Left
  // alone deliberately — a second normaliser beside this one is how the join
  // key ends up meaning two things, and the fix belongs in the shared primitive
  // where energy mapping would get it too.
  const key = (t: string) => normalizeOpeningRef(t) ?? "";
  const boxesByTag = new Map<string, number[]>();
  input.boxes.forEach((b, i) => {
    if (typeof b.tag !== "string" || !b.tag.trim()) return;
    const k = key(b.tag);
    boxesByTag.set(k, [...(boxesByTag.get(k) ?? []), i]);
  });

  // A row whose tag the sheet carries is settled here, and the arithmetic below
  // never sees it. A tag on TWO boxes is the drawing contradicting itself, and
  // is refused for the same reason the arithmetic refuses a shared box.
  // TWO ROWS THAT ARE ONE IDENTITY can be given nothing. The spec says "W-04"
  // and "W04" are the same window, so a schedule carrying both is input this
  // cannot act on — and the tag loop below would otherwise hand the single box
  // to each of them in turn, reading one physical window twice and applying it
  // to two openings. That is the confident wrong answer this file exists to
  // refuse, so it is refused here rather than resolved. (Codex.)
  const rowsByKey = new Map<string, string[]>();
  for (const r of input.rows) {
    const k = key(r.tag);
    if (k) rowsByKey.set(k, [...(rowsByKey.get(k) ?? []), r.tag]);
  }
  const collidingRow = new Set(
    [...rowsByKey.values()].filter((tags) => tags.length > 1).flat(),
  );

  const decidedByTag = new Set<string>();
  for (const r of input.rows) {
    if (collidingRow.has(r.tag)) {
      decidedByTag.add(r.tag);
      notRead.push({
        tag: r.tag,
        state: "not_read",
        subReason: "ambiguous_row",
        reason: `the schedule carries ${r.tag} and another opening that is the same reference`,
      });
      continue;
    }
    const hits = boxesByTag.get(key(r.tag));
    if (!hits) continue;
    decidedByTag.add(r.tag);
    if (hits.length > 1) {
      notRead.push({
        tag: r.tag,
        state: "not_read",
        // ITS OWN SUB-REASON, because it is its own fault. "Two boxes happened
        // to fit" is arithmetic failing to choose; "the sheet printed this label
        // twice" is the drawing contradicting itself, and the caller has to be
        // able to let the second outrank a location another sheet already gave.
        subReason: "duplicate_tag",
        reason: `elevation ${input.elevation} carries the label ${r.tag} on ${hits.length} windows`,
      });
      continue;
    }
    const only = hits[0];
    const drawn = input.boxes[only].proportion;
    const want = proportionOf(r);
    const delta = drawn === null ? Number.NaN : Math.abs(drawn - want);
    assigned.set(r.tag, {
      boxIndex: only,
      // NOT A VETO. The label is the join; a check that could overturn the
      // sheet's own answer would be the matcher again under another name.
      proportionDelta: delta,
      by: "tag",
      // But it is SAID. A delta recorded and read by nobody is the dead field
      // this codebase keeps paying for, and the thing it would have hidden here
      // is a composition read off the wrong window.
      proportionContradicts: Number.isFinite(delta) && delta > want * PROPORTION_TOLERANCE,
    });
  }

  // Which boxes could each row be? Proportion is the discriminator because it
  // survives an uncertain page scale, where an absolute measurement does not.
  const candidates = new Map<string, number[]>();
  for (const r of input.rows) {
    if (decidedByTag.has(r.tag)) continue;
    const want = proportionOf(r);
    const fits = input.boxes
      .map((b, i) => ({ i, p: b.proportion, tag: b.tag }))
      // A box the sheet labelled as SOMEBODY ELSE is not a candidate for this
      // row. Without this, an unlabelled row could take a window whose own tag
      // names an opening the schedule may not even list — the arithmetic
      // overruling the drawing, which is the thing being fixed.
      .filter(({ tag }) => !(typeof tag === "string" && tag.trim()))
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
    if (decidedByTag.has(r.tag)) continue;
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
      assigned.set(r.tag, { boxIndex: only, proportionDelta: Math.abs(p - proportionOf(r)), by: "proportion" });
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
    assigned.set(r.tag, { boxIndex: chosen, proportionDelta: Math.abs(p - proportionOf(r)), by: "proportion" });
  }

  return { assigned, notRead };
}

/** Same stated size, to the millimetre — which is what makes a pair a pair. */
const sameShape = (a: ScheduleRow, b: ScheduleRow) =>
  a.widthMm === b.widthMm && a.heightMm === b.heightMm;
