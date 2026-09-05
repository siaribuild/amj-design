import type { CropBoxPt } from "../contract";
import type { ElevationFrame } from "./elevationFrames";
import { WIDTH_TOLERANCE } from "./widths";

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
  /** The frame this crop was cut around, carried through so the report can say
   * which frame on the elevation a reading came from. */
  frameBoxPt: CropBoxPt;
  /** How the width was arrived at, so a crop sized by fallback is never taken
   * for one sized by measurement. */
  basis: "scaled" | "calibrated" | "wider_frame" | "wide_unscaled";
  warnings: string[];
}

/** Margin so the frame edges are visible against the wall — a fixed pane is
 * told from its surround by its edges. It is not there to make an imprecise
 * centre survivable. */
const MARGIN_FRACTION = 0.15;
const MARGIN_MIN_PT = 8;
const MARGIN_MAX_FRACTION = 0.25;
const STOREY_MARGIN = 0.05;

export function openingCropTasks(args: {
  matches: { tag: string; frame: ElevationFrame; expectedWidthPt: number | null; widthBasis?: "scaled" | "calibrated" | null }[];
  /** Each sheet's own size: elevation sheets in one set need not be alike. */
  pageSizeOf(pageNo: number): [number, number];
  sourceFileId: string;
}): OpeningCropTask[] {
  const centres = args.matches.map((match) =>
    (match.frame.outerFrameBoxPt[0] + match.frame.outerFrameBoxPt[2]) / 2);

  return args.matches.flatMap((match, at) => {
    const [pageWidth, pageHeight] = args.pageSizeOf(match.frame.pageNo);
    const box = match.frame.outerFrameBoxPt;
    const drawn = box[2] - box[0];
    const centre = centres[at];
    const warnings: string[] = [];

    let width: number;
    let basis: OpeningCropTask["basis"];
    if (match.expectedWidthPt == null) {
      width = drawn;
      basis = "wide_unscaled";
      warnings.push("the page states no scale, so this crop is sized from the drawn frame");
    } else if (drawn > match.expectedWidthPt * (1 + WIDTH_TOLERANCE)) {
      // Never crop inside a complete frame: the frame that was drawn is the
      // thing being read, and a measurement that says it is narrower than it
      // looks is a disagreement to record, not a reason to cut it in half.
      // Within tolerance the scale width stands (§7.5 rule 3); the margin
      // below keeps a frame that much wider inside the crop.
      width = drawn;
      basis = "wider_frame";
      warnings.push(`the drawn frame is wider than the scheduled width at this scale (${drawn.toFixed(1)}pt against ${match.expectedWidthPt.toFixed(1)}pt)`);
    } else {
      width = match.expectedWidthPt;
      // A width from a scale the frames themselves supplied (§14) is a
      // measurement of a kind, and a crop sized by it says which kind.
      basis = match.widthBasis === "calibrated" ? "calibrated" : "scaled";
    }

    const margin = Math.max(MARGIN_MIN_PT, Math.min(width * MARGIN_FRACTION, width * MARGIN_MAX_FRACTION));
    const band = match.frame.storeyBandPt;
    const bandMargin = (band[3] - band[1]) * STOREY_MARGIN;
    const bbox: CropBoxPt = [
      centre - width / 2 - margin,
      // The storey band is the whole opening's height and is kept whole, but a
      // band that runs off the sheet is trimmed to it rather than abandoned.
      Math.max(0, band[1] - bandMargin),
      centre + width / 2 + margin,
      Math.min(pageHeight, band[3] + bandMargin),
    ];

    // A crop off the page cannot be rendered, and one holding a neighbour's
    // centre gets that neighbour read and filed under this tag — worse than
    // reading nothing.
    if (bbox[0] < 0 || bbox[2] > pageWidth) return [];
    // A neighbour is an opening on the same sheet and the same storey: a frame
    // on another page, or on the storey above, at the same x is not in this
    // crop, whatever its coordinates say.
    if (centres.some((other, index) => {
      const near = args.matches[index].frame;
      return index !== at
        && near.pageNo === match.frame.pageNo
        && near.outerFrameBoxPt[3] > bbox[1] && near.outerFrameBoxPt[1] < bbox[3]
        && other > bbox[0] && other < bbox[2];
    })) return [];

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
      frameBoxPt: match.frame.outerFrameBoxPt,
      basis,
      warnings,
    }];
  });
}
