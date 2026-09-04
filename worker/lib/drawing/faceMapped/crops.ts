import type { CropBoxPt } from "../contract";
import type { ElevationFrame } from "./elevationFrames";

/**
 * §7.5. What to cut out of the elevation for one opening, and on what grounds.
 *
 * The drawing supplies the centre; the schedule and the page scale supply how
 * wide. That is what a scale is for, and it is a materially lower bar for the
 * step that reads the elevation: it has to say which frame is which and roughly
 * where its middle is, not trace a box accurately against brick hatch.
 */
export interface OpeningCropTask {
  tag: string;
  frameId: string;
  pageNo: number;
  bboxPt: CropBoxPt;
  dpi: 300;
  threshold: null;
  faceKey: string;
  sourceFileId: string;
  /** How the width was arrived at, so a crop sized by fallback is never taken
   * for one sized by measurement. */
  basis: "scaled" | "wider_frame" | "wide_unscaled";
  warnings: string[];
}

/** Margin so the frame edges are visible against the wall — a fixed pane is
 * told from its surround by its edges. It is not there to make an imprecise
 * centre survivable. */
const MARGIN_FRACTION = 0.15;
const MARGIN_MIN_PT = 8;
const MARGIN_MAX_FRACTION = 0.25;
/** With no scale there is no measured width, so the drawn frame is all there
 * is and it is given room rather than trusted to the point. */
const UNSCALED_WIDENING = 1.6;
const STOREY_MARGIN = 0.05;

export function openingCropTasks(args: {
  matches: { tag: string; frame: ElevationFrame; expectedWidthPt: number | null }[];
  pageSizePt: [number, number];
  sourceFileId: string;
}): OpeningCropTask[] {
  const [pageWidth, pageHeight] = args.pageSizePt;
  const centres = args.matches.map((match) =>
    (match.frame.outerFrameBoxPt[0] + match.frame.outerFrameBoxPt[2]) / 2);

  return args.matches.flatMap((match, at) => {
    const box = match.frame.outerFrameBoxPt;
    const drawn = box[2] - box[0];
    const centre = centres[at];
    const warnings: string[] = [];

    let width: number;
    let basis: OpeningCropTask["basis"];
    if (match.expectedWidthPt == null) {
      width = drawn * UNSCALED_WIDENING;
      basis = "wide_unscaled";
      warnings.push("the page states no scale, so this crop is sized from the drawn frame");
    } else if (drawn > match.expectedWidthPt) {
      // Never crop inside a complete frame: the frame that was drawn is the
      // thing being read, and a measurement that says it is narrower than it
      // looks is a disagreement to record, not a reason to cut it in half.
      width = drawn;
      basis = "wider_frame";
      warnings.push(`the drawn frame is wider than the scheduled width at this scale (${drawn.toFixed(1)}pt against ${match.expectedWidthPt.toFixed(1)}pt)`);
    } else {
      width = match.expectedWidthPt;
      basis = "scaled";
    }

    const margin = Math.max(MARGIN_MIN_PT, Math.min(width * MARGIN_FRACTION, width * MARGIN_MAX_FRACTION));
    const band = match.frame.storeyBandPt;
    const bandMargin = (band[3] - band[1]) * STOREY_MARGIN;
    const bbox: CropBoxPt = [
      centre - width / 2 - margin,
      band[1] - bandMargin,
      centre + width / 2 + margin,
      band[3] + bandMargin,
    ];

    // A crop off the page cannot be rendered, and one holding a neighbour's
    // centre gets that neighbour read and filed under this tag — worse than
    // reading nothing.
    if (bbox[0] < 0 || bbox[1] < 0 || bbox[2] > pageWidth || bbox[3] > pageHeight) return [];
    if (centres.some((other, index) => index !== at && other > bbox[0] && other < bbox[2])) return [];

    return [{
      tag: match.tag,
      frameId: match.frame.frameId,
      pageNo: match.frame.pageNo,
      bboxPt: bbox,
      dpi: 300 as const,
      // Thresholding is retry-only: faint operation marks disappear under it,
      // and an opening whose swing arcs vanished reads as a fixed pane.
      threshold: null,
      faceKey: match.frame.faceKey,
      sourceFileId: args.sourceFileId,
      basis,
      warnings,
    }];
  });
}
