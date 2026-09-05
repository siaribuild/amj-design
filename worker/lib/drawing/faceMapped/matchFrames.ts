import type { CropBoxPt } from "../contract";
import type { ElevationFrame } from "./elevationFrames";
import { expectedWidthPt, type PlanOpeningPlacement } from "./contract";
import { judgeWidth } from "./widths";

export interface MatchedOpeningFrame {
  tag: string;
  placement: PlanOpeningPlacement;
  frame: ElevationFrame;
  direction: "with_plan" | "against_plan";
  expectedWidthPt: number | null;
  widthAgreement: "within_tolerance" | "conflict" | "unknown";
  /** Where the expected width came from: the page's printed scale, or a scale
   * the matched frames themselves supplied (§14). Null where there is neither. */
  widthBasis: "scaled" | "calibrated" | null;
  confidence: "verified" | "ambiguous";
  warnings: string[];
}

export type FaceMatch =
  | { direction: "with_plan" | "against_plan"; matches: MatchedOpeningFrame[]; reason: null }
  | { direction: "unresolved"; matches: never[]; reason: string };

/**
 * How much better the winning reading has to fit before the difference is
 * called a reading rather than noise: clearly better in proportion, and better
 * by something rather than by a rounding error.
 *
 * A margin per opening does not work, because the scores already grow with the
 * count: seven openings whose spacing plainly favours one direction lose to a
 * threshold that grew seven times while their advantage grew once.
 */
const DIRECTION_RATIO = 1.5;
const DIRECTION_FLOOR = 0.02;

/** Positions restated as where each one sits between the first and the last,
 * so a plan's fraction of a wall and an elevation's points across a sheet can
 * be compared without either being converted into the other. */
function spread(values: number[]): number[] | null {
  const low = Math.min(...values);
  const high = Math.max(...values);
  return high > low ? values.map((value) => (value - low) / (high - low)) : null;
}

/**
 * How badly a mapping fits, in two named parts (§7.3: score components are
 * diagnostics, not an opaque weighted model).
 *
 * `position` is how far the plan's places are from the elevation's, both as
 * fractions of their own extent. `width` is how far each frame is drawn from
 * the width its opening is scheduled at, at this page's scale.
 *
 * Position alone cannot settle a face of two openings: two frames sit at the
 * two ends of their own extent whichever way round the elevation runs. Their
 * widths can, and a wall of two openings is the commonest wall there is.
 */
function disagreement(
  fractions: number[],
  framePositions: number[],
  drawnWidths: number[],
  expectedWidths: (number | null)[],
): { position: number; width: number; total: number } {
  const position = fractions.reduce((sum, fraction, at) => sum + Math.abs(fraction - framePositions[at]), 0);
  const width = expectedWidths.reduce((sum: number, expected, at) => {
    if (expected == null || expected <= 0) return sum;
    return sum + Math.abs(drawnWidths[at] - expected) / expected;
  }, 0);
  return { position, width, total: position + width };
}

/**
 * §7.3, and the step §7.0 calls "the target opening is the first one on the
 * ground floor": the Nth opening along the plan wall is the Nth across the
 * elevation, once it is settled which end the elevation counts from.
 *
 * An elevation looks at its face from outside, so one wall of a building reads
 * with the plan and the opposite wall reads against it. The two orders never
 * disagree — `wallOrder` ascends with position along the wall, and
 * `orderLeftToRight` ascends across the drawing — so the order alone settles
 * nothing and the spacing has to. Openings crowded at one end of the plan wall
 * are crowded at the far end of an elevation drawn from the other side.
 *
 * A mirrored match is the failure that hides: every opening is paired with
 * something, and every pairing is wrong. So a face that reads as well one way
 * as the other is left unmatched rather than guessed.
 */
export interface FaceMatchInput {
  placements: PlanOpeningPlacement[];
  frames: ElevationFrame[];
  /** Scheduled width in millimetres, by tag, from the Phase B roster. */
  widthByTag?: Map<string, number>;
  /** The elevation page's printed scale, or null where it states none. */
  pageScaleRatio?: number | null;
  /** Opening tags printed on the elevation itself, where a set labels them. A
   * tag inside a frame says which opening that frame is outright. */
  tagWordsPt?: { tag: string; boxPt: CropBoxPt }[];
}

/** One opening against one frame, with everything the pair can be checked
 * against. `settled` is false when the direction was supplied rather than read
 * off the page, which no width agreement can make verified. */
export function pairOpening(
  args: FaceMatchInput,
  placement: PlanOpeningPlacement,
  frame: ElevationFrame,
  direction: "with_plan" | "against_plan",
  settled = true,
): MatchedOpeningFrame {
  const width = judgeWidth(frame, args.widthByTag?.get(placement.tag), args.pageScaleRatio);
  return {
    tag: placement.tag,
    placement,
    frame,
    direction,
    expectedWidthPt: width.expected,
    widthAgreement: width.agreement,
    widthBasis: width.expected == null ? null : "scaled",
    // Nothing contradicted this pairing, which is all "verified" ever claims.
    confidence: settled && width.agreement !== "conflict" ? "verified" : "ambiguous",
    warnings: width.warnings,
  };
}

export function matchFacePlacements(args: FaceMatchInput): FaceMatch {
  const placements = [...args.placements].sort((a, b) => a.wallOrder - b.wallOrder);
  const frames = [...args.frames].sort((a, b) => a.orderLeftToRight - b.orderLeftToRight);
  const pair = (
    placement: PlanOpeningPlacement,
    frame: ElevationFrame,
    direction: "with_plan" | "against_plan",
  ) => pairOpening(args, placement, frame, direction);

  if (!placements.length || !frames.length) {
    return { direction: "unresolved", matches: [], reason: "nothing to match on this face" };
  }
  if (placements.length !== frames.length) {
    return {
      direction: "unresolved",
      matches: [],
      reason: `the plan places ${placements.length} openings on this face and the elevation draws ${frames.length} frames`,
    };
  }
  if (placements.some((placement) => placement.alongWallFraction === null)) {
    return {
      direction: "unresolved",
      matches: [],
      reason: "an opening has no position along the wall, so which end the elevation counts from cannot be told",
    };
  }

  // One opening pairs with one frame the same way round either way. Which
  // direction the wall reads in is not settled by that and is not claimed: a
  // single opening carries no evidence of it, and nothing downstream needs it.
  if (placements.length === 1) {
    const only = pair(placements[0], frames[0], "with_plan");
    return {
      direction: "with_plan",
      reason: null,
      matches: [{
        ...only,
        // Nothing corroborated this pairing. It is the only one available,
        // which is a reason to keep it and not a reason to call it verified.
        confidence: "ambiguous",
        warnings: [...only.warnings, "one opening on this face, so which end the elevation counts from was never tested"],
      }],
    };
  }

  // Both views are reduced to the same thing before they are compared: where
  // each opening sits between the first and the last one, on its own side.
  //
  // Comparing a fraction of a wall against a fraction of the frames' own extent
  // compares two different measurements — four openings between a fifth and
  // half way along a wall look, on the elevation, like four frames spread from
  // end to end — and a face measured that way comes out reversed with every
  // opening on it matched to the wrong frame.
  const centres = spread(frames.map((item) => (item.outerFrameBoxPt[0] + item.outerFrameBoxPt[2]) / 2));
  const fractions = spread(placements.map((placement) => placement.alongWallFraction!));
  if (!centres || !fractions) {
    return { direction: "unresolved", matches: [], reason: "the openings on this face are all at one point" };
  }

  // Read against the plan, the wall is seen from its other end: the opening the
  // plan puts at fraction f is drawn at 1 - f, and pairs with the frame counted
  // from the far side.
  const reversed = [...frames].reverse();
  const widths = frames.map((frame) => frame.outerFrameBoxPt[2] - frame.outerFrameBoxPt[0]);
  const scheduled = placements.map((placement) => args.widthByTag?.get(placement.tag) ?? null);
  // With a scale, a scheduled width is a number of points and the comparison is
  // a measurement. Without one, 1800 beside 900 is still twice as wide, and so
  // is the frame drawn for it: the shapes can be compared even when the sizes
  // cannot, by scaling the schedule's widths onto the frames' own.
  const largestDrawn = Math.max(...widths);
  const largestScheduled = Math.max(...scheduled.map((width) => width ?? 0));
  const expected = placements.map((placement, at) => {
    const widthMm = scheduled[at];
    if (widthMm == null) return null;
    if (args.pageScaleRatio != null) return expectedWidthPt(widthMm, args.pageScaleRatio);
    return largestScheduled > 0 ? widthMm / largestScheduled * largestDrawn : null;
  });
  const withPlan = disagreement(fractions, centres, widths, expected).total;
  const againstPlan = disagreement(
    fractions,
    [...centres].reverse().map((centre) => 1 - centre),
    [...widths].reverse(),
    expected,
  ).total;

  // A tag printed inside a frame says which opening that frame is outright, and
  // outranks any argument from where things sit. A label that agrees with
  // neither reading is a contradiction rather than a casting vote.
  const labelled = labelledDirection(placements, frames, args.tagWordsPt ?? []);
  if (labelled === "contradiction") {
    return {
      direction: "unresolved",
      matches: [],
      reason: "a tag printed on the elevation names a frame the plan puts a different opening in",
    };
  }

  const [better, worse] = withPlan < againstPlan ? [withPlan, againstPlan] : [againstPlan, withPlan];
  if (!labelled && (worse - better < DIRECTION_FLOOR || worse < better * DIRECTION_RATIO)) {
    return {
      direction: "unresolved",
      matches: [],
      reason: "the openings sit as well one way round as the other, so which end the elevation counts from is a guess",
    };
  }

  const direction = labelled ?? (withPlan < againstPlan ? "with_plan" as const : "against_plan" as const);
  const ordered = direction === "with_plan" ? frames : reversed;
  return {
    direction,
    reason: null,
    matches: placements.map((placement, at) => pair(placement, ordered[at], direction)),
  };
}

/** Which reading of the wall the elevation's own labels name, if any: null when
 * nothing is labelled, "contradiction" when a label fits neither reading. */
function labelledDirection(
  placements: PlanOpeningPlacement[],
  frames: ElevationFrame[],
  tagWords: { tag: string; boxPt: CropBoxPt }[],
): "with_plan" | "against_plan" | "contradiction" | null {
  const named = new Map<string, number>();
  for (const word of tagWords) {
    const centre = (word.boxPt[0] + word.boxPt[2]) / 2;
    const at = frames.findIndex((frame) =>
      centre >= frame.outerFrameBoxPt[0] && centre <= frame.outerFrameBoxPt[2]);
    if (at < 0) continue;
    // Two labels inside one frame, or one opening labelled in two frames, is
    // the sheet contradicting itself before the matcher gets a say.
    if (named.has(word.tag) && named.get(word.tag) !== at) return "contradiction";
    named.set(word.tag, at);
  }
  if (!named.size) return null;

  const forward = [...named].every(([tag, at]) => placements[at]?.tag === tag);
  const backward = [...named].every(([tag, at]) => placements[frames.length - 1 - at]?.tag === tag);
  if (forward && !backward) return "with_plan";
  if (backward && !forward) return "against_plan";
  // Neither: the sheet's own label disagrees with the plan either way round.
  return forward ? null : "contradiction";
}
