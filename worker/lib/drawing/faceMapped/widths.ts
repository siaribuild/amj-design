import type { ElevationFrame } from "./elevationFrames";
import { expectedWidthPt } from "./contract";
import type { MatchedOpeningFrame } from "./matchFrames";

/** The width half of §7.3 step 3 and the whole of §14: what a frame should
 * measure, whether it does, and where the measurement came from. */
/** How far a drawn frame may sit from the width its schedule and the page's
 * scale predict before the pair is called a disagreement. Generous, because the
 * box is read off a drawing and includes however much of the frame is drawn. */
export const WIDTH_TOLERANCE = 0.2;

/**
 * §7.3 step 3, the part of the score the scale pays for: 1800mm is a known
 * number of points on a page printed at 1:100, so a frame drawn a third of that
 * is either the wrong frame or a badly read box, and the crop it would produce
 * is not one to hand over silently.
 */
export function judgeWidth(frame: ElevationFrame, widthMm: number | undefined, scaleRatio: number | null | undefined) {
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


/**
 * §14, the fallback for a page that states no scale: the frames matched on it
 * say what it is drawn at. Every matched frame with a scheduled width gives a
 * ratio of drawn points to scheduled millimetres, and the median of those is
 * the page's effective scale - the median, so one badly read box does not
 * stretch every other crop on the face. Widths sized this way say so.
 */
/** A median of one is the sample and a median of two is their mean, and two
 * frames that disagree by a third both sit within tolerance of it. Three is the
 * fewest from which one bad box can be told from the rest. */
const MIN_CALIBRATION_FRAMES = 3;

export function calibrateWidths(matches: MatchedOpeningFrame[], widthByTag?: Map<string, number>): MatchedOpeningFrame[] {
  const ratios = matches.flatMap((match) => {
    const widthMm = widthByTag?.get(match.tag);
    return widthMm && widthMm > 0 ? [(match.frame.outerFrameBoxPt[2] - match.frame.outerFrameBoxPt[0]) / widthMm] : [];
  }).sort((a, b) => a - b);
  if (ratios.length < MIN_CALIBRATION_FRAMES) return matches;
  const median = ratios.length % 2 ? ratios[(ratios.length - 1) / 2] : (ratios[ratios.length / 2 - 1] + ratios[ratios.length / 2]) / 2;
  // A median nothing agrees with is not a scale. Three frames drawn at three
  // different scales have a middle one, and calling it the page's scale would
  // call one of the three right for no reason but its position in the list.
  const agreeing = ratios.filter((ratio) => Math.abs(ratio - median) / median <= WIDTH_TOLERANCE).length;
  // A majority of the frames has to sit within tolerance of it.
  if (agreeing <= ratios.length / 2) return matches;
  return matches.map((match) => {
    const widthMm = widthByTag?.get(match.tag);
    if (!widthMm || widthMm <= 0) return match;
    const expected = widthMm * median;
    const drawn = match.frame.outerFrameBoxPt[2] - match.frame.outerFrameBoxPt[0];
    const conflict = Math.abs(drawn - expected) / expected > WIDTH_TOLERANCE;
    return {
      ...match,
      expectedWidthPt: expected,
      widthBasis: "calibrated",
      widthAgreement: conflict ? "conflict" : "within_tolerance",
      confidence: conflict ? "ambiguous" : match.confidence,
      warnings: conflict
        ? [...match.warnings, `the frame's drawn width is ${drawn.toFixed(1)}pt where the face's own scale puts ${widthMm}mm at ${expected.toFixed(1)}pt`]
        : match.warnings,
    };
  });
}

