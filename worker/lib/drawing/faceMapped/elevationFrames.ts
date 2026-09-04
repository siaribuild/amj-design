import type { CropBoxPt } from "../contract";
import type { DrawingScaleCandidate } from "../harvest";
import { drawingFaceKey } from "../consistency";
import type { PlanOpeningPlacement } from "./contract";

/**
 * One question for one elevation: this face, this storey, this many openings,
 * these widths. The plan has already decided all of it — the elevation is only
 * asked to point at the frames.
 */
export interface ElevationFaceTask {
  faceKey: string;
  pageNo: number;
  elevation: string;
  storey: string;
  expectedOpeningCount: number;
  scheduledWidthsMm: number[];
  overviewRenderId: string;
  overviewBoxPt: CropBoxPt;
  scaleCandidates: DrawingScaleCandidate[];
}

/** One complete opening as an elevation draws it, in printed order across the
 * face. What it is called is not its business: the plan says that. */
export interface ElevationFrame {
  frameId: string;
  faceKey: string;
  pageNo: number;
  elevation: string;
  storey: string;
  orderLeftToRight: number;
  outerFrameBoxPt: CropBoxPt;
  storeyBandPt: CropBoxPt;
  confidence: "verified" | "ambiguous";
  basis: string[];
}

export type ElevationInventoryOutcome =
  | { state: "resolved"; task: ElevationFaceTask; frames: ElevationFrame[] }
  | { state: "unresolved"; task: ElevationFaceTask; reason: string };

/** A face the plan populated that no elevation can be asked about. Openings
 * lost here are lost silently unless something says so. */
export interface SkippedFace {
  elevation: string;
  storey: string;
  tags: string[];
  reason: string;
}

/**
 * §7.2. Group the placed openings by the wall they sit in and the storey they
 * sit on, and turn each group into one task against the sheet that draws that
 * wall.
 */
export function elevationFaceTasks(args: {
  placements: PlanOpeningPlacement[];
  /** Which sheets draw each named face, from the document's own sheet titles. */
  faceSheets: Map<string, number[]>;
  /** Scheduled width in millimetres, by tag, from the Phase B roster. */
  widthByTag: Map<string, number>;
  /** What is known about each elevation sheet, once it has been rendered. */
  sheets: Map<number, { overviewRenderId: string; overviewBoxPt: CropBoxPt; scaleCandidates: DrawingScaleCandidate[] }>;
}): { tasks: ElevationFaceTask[]; skipped: SkippedFace[] } {
  const groups = new Map<string, PlanOpeningPlacement[]>();
  for (const placement of args.placements) {
    const key = `${placement.elevation} ${placement.storey}`;
    groups.set(key, [...(groups.get(key) ?? []), placement]);
  }

  const tasks: ElevationFaceTask[] = [];
  const skipped: SkippedFace[] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => a.wallOrder - b.wallOrder);
    const { elevation, storey } = ordered[0];
    const pages = args.faceSheets.get(elevation) ?? [];
    const refuse = (reason: string) =>
      skipped.push({ elevation, storey, tags: ordered.map((p) => p.tag), reason });

    if (pages.length === 0) {
      refuse(`no elevation sheet in this document is titled for face ${elevation}`);
      continue;
    }
    if (pages.length > 1) {
      refuse(`face ${elevation} is drawn on sheets ${pages.join(", ")}, and which one to read is not settled`);
      continue;
    }
    const sheet = args.sheets.get(pages[0]);
    if (!sheet) {
      refuse(`sheet ${pages[0]} draws face ${elevation} but was not rendered`);
      continue;
    }
    tasks.push({
      faceKey: drawingFaceKey({ facePageNo: pages[0], elevation, storey })!,
      pageNo: pages[0],
      elevation,
      storey,
      expectedOpeningCount: ordered.length,
      // In the plan's own wall order, so a frame list can be compared against
      // them position by position rather than as a bag of numbers.
      scheduledWidthsMm: ordered.flatMap((p) => args.widthByTag.get(p.tag) ?? []),
      overviewRenderId: sheet.overviewRenderId,
      overviewBoxPt: sheet.overviewBoxPt,
      scaleCandidates: sheet.scaleCandidates,
    });
  }
  return { tasks, skipped };
}

/** How much two boxes may overlap across the face before they are taken to be
 * one frame read twice rather than two openings drawn close together. */
const SAME_FRAME_OVERLAP = 0.5;

function fractions(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const box = value.map(Number);
  if (box.some((n) => !Number.isFinite(n) || n < 0 || n > 1)) return null;
  return box[2] > box[0] && box[3] > box[1] ? (box as [number, number, number, number]) : null;
}

/** Fractions of the rendered overview back into the page's own points. */
function toPoints(box: [number, number, number, number], overview: CropBoxPt): CropBoxPt {
  const width = overview[2] - overview[0];
  const height = overview[3] - overview[1];
  return [
    overview[0] + box[0] * width,
    overview[1] + box[1] * height,
    overview[0] + box[2] * width,
    overview[1] + box[3] * height,
  ];
}

/**
 * §7.2. The elevation is asked for every complete outer frame on one face and
 * one storey. What comes back is checked against the question, not trusted:
 * a box with no area, a box drawn outside the storey the question was about, or
 * the same frame listed twice is dropped, and a count that then disagrees with
 * the plan is a conflict rather than an answer. Nothing is invented to make the
 * numbers meet, and nothing is discarded to make them meet either.
 *
 * Order is read off the drawing rather than taken from the model's own
 * numbering: where a frame sits is a fact on the page, and a returned order
 * value is one more thing that can be wrong.
 */
export function validateElevationFrames(raw: unknown, task: ElevationFaceTask): ElevationInventoryOutcome {
  const payload = raw as { storeyBand?: unknown; frames?: unknown } | null;
  const band = fractions(payload?.storeyBand);
  if (!band) {
    return { state: "unresolved", task, reason: "the read did not say which band of the sheet is this storey" };
  }
  const rows = Array.isArray(payload?.frames) ? payload!.frames as unknown[] : null;
  if (!rows) return { state: "unresolved", task, reason: "the read returned no frames at all" };

  const inBand: [number, number, number, number][] = [];
  for (const row of rows) {
    const box = fractions((row as { box?: unknown } | null)?.box);
    if (!box) continue;
    if (box[0] < band[0] || box[2] > band[2] || box[1] < band[1] || box[3] > band[3]) continue;
    const width = box[2] - box[0];
    const twice = inBand.some((seen) => {
      const overlap = Math.min(seen[2], box[2]) - Math.max(seen[0], box[0]);
      return overlap > 0 && overlap / Math.min(width, seen[2] - seen[0]) > SAME_FRAME_OVERLAP;
    });
    if (!twice) inBand.push(box);
  }
  inBand.sort((a, b) => a[0] - b[0]);

  if (inBand.length !== task.expectedOpeningCount) {
    return {
      state: "unresolved",
      task,
      reason: `the elevation gives ${inBand.length} usable frames on this face where the plan places ${task.expectedOpeningCount} openings`,
    };
  }
  return {
    state: "resolved",
    task,
    frames: inBand.map((box, at) => ({
      frameId: `${task.pageNo}_${task.elevation}_${task.storey}_${at + 1}`.replace(/\s+/g, "-"),
      faceKey: task.faceKey,
      pageNo: task.pageNo,
      elevation: task.elevation,
      storey: task.storey,
      orderLeftToRight: at + 1,
      outerFrameBoxPt: toPoints(box, task.overviewBoxPt),
      storeyBandPt: toPoints(band, task.overviewBoxPt),
      confidence: "verified",
      basis: [`read from ${task.overviewRenderId}`],
    })),
  };
}
