import type { CropBoxPt, DrawingFileReport, DrawingReading, GapCode } from "../contract";
import type { CompositionOutcome } from "./compositions";

/**
 * §7.7 and Task 10. One row per scheduled opening, whatever happened to it.
 *
 * The schedule is the roster: an opening the drawing never mentioned is still
 * a row, because a quote is priced from the schedule and a row missing from a
 * report is a row nobody knows to ask about. What each row carries is whatever
 * the run got as far as — the wall the plan settled survives a crop that could
 * not be read, and the gap names the phase that stopped rather than the last
 * one to run.
 */
export interface PlacedForReport {
  tag: string;
  elevation: string;
  storey: string;
  planPageNo: number;
  wallOrder: number;
  confidence: "verified" | "ambiguous";
}

export interface CropForReport {
  cropRenderId: string;
  cropKey: string | null;
  pageNo: number;
  bboxPt: CropBoxPt;
}

export function faceMappedReadings(args: {
  fileId: string;
  sourceFileId: string;
  roster: string[];
  placements: Map<string, PlacedForReport>;
  unplaced: Map<string, string>;
  crops: Map<string, CropForReport>;
  compositions: CompositionOutcome[];
  /** What the schedule calls each opening, compared only after it was read
   * (§7.6). A reader told the answer confirms the answer. */
  scheduleTypeByTag?: Map<string, string | null>;
  /** What matching could not settle about a pairing. A crop read confidently
   * is still a crop of a frame the measurements disagreed about. */
  matchWarnings?: Map<string, string[]>;
}): DrawingReading[] {
  const readByTag = new Map<string, CompositionOutcome>();
  for (const outcome of args.compositions) {
    readByTag.set(outcome.state === "value" ? outcome.value.tag : outcome.tag, outcome);
  }

  return args.roster.map((tag): DrawingReading => {
    const placed = args.placements.get(tag);
    const crop = args.crops.get(tag);
    const read = readByTag.get(tag);
    // The first phase that could not finish owns the gap. A row that was never
    // placed did not fail to be read; it failed to be found.
    const gapCode: GapCode | null = !placed ? "unplaced"
      : !crop ? "frame_ambiguous"
      : read?.state === "not_stated" ? "division_unreadable"
      : read?.state === "value" ? null
      : "division_unreadable";
    const gapNote = !placed ? args.unplaced.get(tag) ?? "not placed on any plan page"
      // A placed opening with no crop stopped somewhere, and the phase that
      // stopped said why. "No crop was made" is the symptom, not the reason.
      : !crop ? args.unplaced.get(tag) ?? "no crop was made for this opening"
      : read && read.state !== "value" ? read.reason
      : args.matchWarnings?.get(tag)?.join("; ") ?? null;

    return {
      sourceFileId: args.sourceFileId,
      externalRef: tag,
      splitState: read?.state === "value" ? "value" : read?.state === "not_stated" ? "not_stated" : "not_read",
      split: read?.state === "value"
        ? {
          axis: read.value.divisionAxis,
          units: read.value.unitRatios.map((ratio, at) => ({
            role: (read.value.operations[at] ?? read.value.operations[0]) === "fixed" ? "passive" as const : "operable" as const,
            ratio,
            ...(read.value.operations[at] ?? read.value.operations[0]
              ? { operation: read.value.operations[at] ?? read.value.operations[0] }
              : {}),
          })),
        }
        : null,
      // The face-mapped engine reads walls the document names, not a compass.
      orientationState: "not_read",
      orientation: null,
      elevationState: placed ? "value" : "not_read",
      elevation: placed?.elevation ?? null,
      roomState: "not_read",
      roomLabel: null,
      gapCode,
      gapNote,
      cropKey: crop?.cropKey ?? null,
      pageNo: crop?.pageNo ?? placed?.planPageNo ?? null,
      sheetRef: null,
      regionJson: crop ? [crop.bboxPt[0], crop.bboxPt[1], crop.bboxPt[2], crop.bboxPt[3]] : null,
      confidence: read?.state === "value"
        ? (args.matchWarnings?.has(tag) ? "low" : read.value.confidence)
        : null,
      flags: [
        ...(placed?.confidence === "ambiguous" ? ["agentEvidenceWeak" as const] : []),
        // Both are reported and neither is corrected: which of the two is right
        // is the estimator's call, and hiding the disagreement makes it nobody's.
        ...(read?.state === "value" && disagreesWithSchedule(read.value.operations, args.scheduleTypeByTag?.get(tag))
          ? ["scheduleDrawingMismatch" as const]
          : []),
        ...(args.matchWarnings?.has(tag) ? ["drawingInconsistency" as const] : []),
      ],
    };
  });
}

/** True when the schedule names an operation the drawing does not show. Only a
 * schedule that names one at all can disagree: "ALUMINIUM WINDOW" says nothing
 * about how it opens, and silence is not a contradiction. */
function disagreesWithSchedule(operations: string[], typeText: string | null | undefined): boolean {
  if (!typeText) return false;
  const said = typeText.toLowerCase();
  const named = ["fixed", "awning", "casement", "sliding", "louvre", "hinged", "sidelight"]
    .filter((operation) => said.includes(operation));
  return named.length > 0 && !named.some((operation) => operations.includes(operation as never));
}

export type FaceMappedPhase =
  | "plan_faces" | "elevation_frames" | "opening_crops" | "composition_reads" | "drawing_complete";

/**
 * §9. Append-only progress at meaningful milestones, each step charged the
 * interval it actually ran in.
 *
 * Progress that can go down is progress nobody can read, so a step that has not
 * moved forward within its phase is not appended. Durations are intervals
 * rather than totals: a later step inheriting the drawing stage's whole elapsed
 * time is how one slow phase gets blamed on the phase after it.
 */
export function faceMappedProgress(
  emit: (event: { phase: FaceMappedPhase; message: string; done: number; total: number; ms: number }) => Promise<void>,
  now: () => number = () => Date.now(),
) {
  let last = now();
  let started = false;
  const furthest = new Map<FaceMappedPhase, number>();
  return {
    /** Test seam and clock control: the run's own clock, injected once. */
    at(ms: number) {
      now = () => ms;
      if (!started) { last = ms; started = true; }
    },
    async step(phase: FaceMappedPhase, message: string, done: number, total: number) {
      if (done < (furthest.get(phase) ?? -1)) return;
      furthest.set(phase, done);
      const at = now();
      const ms = at - last;
      last = at;
      await emit({ phase, message, done, total, ms });
    },
  };
}

/** What the run did, counted from what it produced. Assembled here rather than
 * in the orchestrator because every number in it is a fact about the readings,
 * and one place per fact applies to counts as much as to anything else. */
export function faceMappedFileReport(args: {
  fileId: string;
  sourceFileId: string;
  readings: DrawingReading[];
  pagesRead: number;
  crops: number;
  attempted: number;
  compositions: CompositionOutcome[];
  placed: number;
  recovered: number;
  modelCalls: number;
  containerCalls: number;
  startedAt: number;
}): DrawingFileReport {
  return {
    fileId: args.fileId,
    sourceFileIds: [args.sourceFileId],
    steps: {
      inventory: { pages: args.pagesRead, fonts: 0, images: 0, attachments: 0 },
      strategy: "text_vector",
      text: { pagesRead: args.pagesRead },
      selectPages: { selected: [], of: args.pagesRead },
      elevationRegions: [],
      renderCrop: { pagesRendered: args.containerCalls, cropsMade: args.crops },
      read: {
        attempted: args.attempted,
        returned: args.compositions.filter((outcome) => outcome.state === "value").length,
        declined: args.compositions.filter((outcome) => outcome.state === "not_stated").length,
        retriedWithThreshold: 0,
        targetedReviews: 0,
      },
      placements: {
        // Placed by the drawing rather than by a look at it. Confidence is a
        // different axis: an unvouched tag is still a text placement.
        fromText: args.placed - args.recovered,
        fromModelFallback: args.recovered,
        unplaced: args.readings.filter((reading) => reading.gapCode === "unplaced").length,
      },
      northAssumed: false,
    },
    perOpening: args.readings.map((reading) => ({
      tag: reading.externalRef,
      outcome: reading.splitState === "value" ? "read" as const : "not_read" as const,
      cropKey: reading.cropKey,
      pageNo: reading.pageNo,
      confidence: reading.confidence,
      flags: reading.flags,
    })),
    wallMs: Date.now() - args.startedAt,
    modelCalls: args.modelCalls,
    containerCalls: args.containerCalls,
  };
}
