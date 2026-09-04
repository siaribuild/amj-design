import type { ElevationFrame } from "./elevationFrames";
import { expectedWidthPt, type PlanOpeningPlacement } from "./contract";

export interface MatchedOpeningFrame {
  tag: string;
  placement: PlanOpeningPlacement;
  frame: ElevationFrame;
  direction: "with_plan" | "against_plan";
  expectedWidthPt: number | null;
  widthAgreement: "within_tolerance" | "conflict" | "unknown";
  confidence: "verified" | "ambiguous";
  warnings: string[];
}

export type FaceMatch =
  | { direction: "with_plan" | "against_plan"; matches: MatchedOpeningFrame[]; reason: null }
  | { direction: "unresolved"; matches: never[]; reason: string };

/** How much better one reading has to fit than the other, per opening, before
 * the difference is called a reading rather than noise. */
const DIRECTION_MARGIN = 0.05;

/** How far a drawn frame may sit from the width its schedule and the page's
 * scale predict before the pair is called a disagreement. Generous, because the
 * box is read off a drawing and includes however much of the frame is drawn. */
const WIDTH_TOLERANCE = 0.2;

/**
 * §7.3 step 3, the part of the score the scale pays for: 1800mm is a known
 * number of points on a page printed at 1:100, so a frame drawn a third of that
 * is either the wrong frame or a badly read box, and the crop it would produce
 * is not one to hand over silently.
 */
function judgeWidth(frame: ElevationFrame, widthMm: number | undefined, scaleRatio: number | null | undefined) {
  if (widthMm == null || scaleRatio == null) {
    return { expected: null, agreement: "unknown" as const, warnings: [] as string[] };
  }
  const expected = expectedWidthPt(widthMm, scaleRatio);
  const drawn = frame.outerFrameBoxPt[2] - frame.outerFrameBoxPt[0];
  const off = expected > 0 ? Math.abs(drawn - expected) / expected : 1;
  return off <= WIDTH_TOLERANCE
    ? { expected, agreement: "within_tolerance" as const, warnings: [] }
    : {
      expected,
      agreement: "conflict" as const,
      warnings: [`the frame's drawn width is ${drawn.toFixed(1)}pt where a scheduled ${widthMm}mm at 1:${scaleRatio} measures ${expected.toFixed(1)}pt`],
    };
}

/** Total distance between where the plan puts the openings along the wall and
 * where the elevation puts the frames it pairs them with, both as fractions of
 * their own extent. Lower is a better fit. */
function disagreement(fractions: number[], framePositions: number[]): number {
  return fractions.reduce((total, fraction, at) => total + Math.abs(fraction - framePositions[at]), 0);
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
export function matchFacePlacements(args: {
  placements: PlanOpeningPlacement[];
  frames: ElevationFrame[];
  /** Scheduled width in millimetres, by tag, from the Phase B roster. */
  widthByTag?: Map<string, number>;
  /** The elevation page's printed scale, or null where it states none. */
  pageScaleRatio?: number | null;
}): FaceMatch {
  const placements = [...args.placements].sort((a, b) => a.wallOrder - b.wallOrder);
  const frames = [...args.frames].sort((a, b) => a.orderLeftToRight - b.orderLeftToRight);
  const pair = (
    placement: PlanOpeningPlacement,
    frame: ElevationFrame,
    direction: "with_plan" | "against_plan",
  ): MatchedOpeningFrame => {
    const width = judgeWidth(frame, args.widthByTag?.get(placement.tag), args.pageScaleRatio);
    return {
      tag: placement.tag,
      placement,
      frame,
      direction,
      expectedWidthPt: width.expected,
      widthAgreement: width.agreement,
      // Nothing contradicted this pairing, which is all "verified" ever claims.
      confidence: width.agreement === "conflict" ? "ambiguous" : "verified",
      warnings: width.warnings,
    };
  };

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

  // Frame centres as fractions of the drawn face, so the two views are compared
  // in the same terms rather than in each other's coordinates.
  const left = Math.min(...frames.map((item) => item.outerFrameBoxPt[0]));
  const right = Math.max(...frames.map((item) => item.outerFrameBoxPt[2]));
  const span = right - left;
  if (span <= 0) {
    return { direction: "unresolved", matches: [], reason: "the frames have no extent to read positions from" };
  }
  const centres = frames.map((item) =>
    ((item.outerFrameBoxPt[0] + item.outerFrameBoxPt[2]) / 2 - left) / span);
  const fractions = placements.map((placement) => placement.alongWallFraction!);

  // Read against the plan, the wall is seen from its other end: the opening the
  // plan puts at fraction f is drawn at 1 - f, and pairs with the frame counted
  // from the far side.
  const reversed = [...frames].reverse();
  // One opening pairs with one frame the same way round either way, and the
  // scores are equal only because there is nothing for them to disagree about.
  if (placements.length === 1) {
    return {
      direction: "with_plan",
      reason: null,
      matches: [pair(placements[0], frames[0], "with_plan")],
    };
  }
  const withPlan = disagreement(fractions, centres);
  const againstPlan = disagreement(fractions, [...centres].reverse().map((centre) => 1 - centre));

  if (Math.abs(withPlan - againstPlan) < DIRECTION_MARGIN * placements.length) {
    return {
      direction: "unresolved",
      matches: [],
      reason: "the openings sit as well one way round as the other, so which end the elevation counts from is a guess",
    };
  }

  const direction = withPlan < againstPlan ? "with_plan" : "against_plan";
  const ordered = direction === "with_plan" ? frames : reversed;
  return {
    direction,
    reason: null,
    matches: placements.map((placement, at) => pair(placement, ordered[at], direction)),
  };
}
