import type { Skill } from "../../estimator/skills/types";
import type { CropBoxPt, DrawingFileReport, DrawingReading, RenderRequest, RenderResponse } from "../contract";
import type { CompositionRead, CompositionTask } from "./compositions";
import { StageCallError } from "../../ai/stage";
import { readOpenings } from "./readOpenings";
import {
  faceMappedFileReport, faceMappedProgress, faceMappedReadings,
  type FaceMappedPhase, type PlacedForReport,
} from "./report";
import { makePlanFaceSkill, planFaceRecoveryRequest, type RecoveredFace } from "./planFacesSkill";
import { documentFaceSheets, documentPlanStoreys } from "../sheetFaces";
import type { ElevationFaceTask, ElevationInventoryRead } from "./elevationFrames";
import { matchOpenings, pageBox } from "./matchOpenings";
import { calibrateWidths } from "./widths";
import { placeOpeningsOnPlan, type PlanPage } from "./planFaces";
import { normalizeOpeningRef } from "../../ai/energyMap";

/**
 * §8. The phases in order, the concurrency they are allowed, the points a run
 * gives up at, and the report at the end. Nothing is decided here: every phase
 * decides its own thing, and this says when each one runs and what it is given.
 */
export interface FaceMappedDeps {
  render(request: RenderRequest): Promise<RenderResponse>;
  storeCrop(id: string, pngB64: string): Promise<string | null>;
  readPlanPage(input: FaceMappedCall<PlanFaceRead> & { pageNo: number }): Promise<PlanFaceRead | null>;
  inventoryElevation(input: FaceMappedCall<ElevationInventoryRead> & { task: ElevationFaceTask }): Promise<ElevationInventoryRead | null>;
  reconcileFace(input: FaceMappedCall<FaceReconcileRead> & { faceKey: string; frameIds: string[] }): Promise<FaceReconcileRead | null>;
  readComposition(input: FaceMappedCall<CompositionRead> & { batch: CompositionTask[]; attempt: number }): Promise<CompositionRead | null>;
  onProgress?(event: { phase: FaceMappedPhase; message: string; done: number; total: number; ms: number }): Promise<void>;
}

/** The request a look at a page is, as it is made: the skill the call runs
 * under, its prompt, and every image it is asked about. The caller runs the
 * skill and answers with what the skill's own validator made of the reply - a
 * stage is replayed by the hash of exactly this, so a request that hashed one
 * image and no question would serve one face another face's answer. */
export interface FaceMappedCallInput {
  prompt?: string;
  imageDataUrls: string[];
}
export interface FaceMappedCall<O = unknown> extends FaceMappedCallInput {
  prompt: string;
  skill: Skill<FaceMappedCallInput, O>;
  /** What the call cost, from the layer that knows: a replayed stage is not a
   *  model call, and tokens are counted where they are spent. A dep that does
   *  not report is counted as one call. */
  usage?(spent: StageUsage): void | Promise<void>;
}

export interface StageUsage {
  modelCalls: number;
  cached: boolean;
  inputTokens: number;
  outputTokens: number;
  warnings: string[];
}

/** What a run spent, as its stage calls reported it. */
export interface RunSpend {
  modelCalls: number;
  cachedTurns: number;
  inputTokens: number;
  outputTokens: number;
  warnings: string[];
  failureKind: string | null;
}

type PlanFaceRead = { placements: (RecoveredFace & { planCandidateId: string })[] };
type FaceReconcileRead = { pairs: { tag: string; frameId: string }[] };

const RENDER_DPI = 100;
const CROP_DPI = 300;

export async function runFaceMappedParser(args: {
  fileId: string;
  sourceFileId: string;
  scheduleRows: { tag: string; widthMm: number; typeText?: string | null }[];
  planPages: PlanPage[];
  elevationPages: PlanPage[];
  /** Page scales from Phase A, by page number. */
  pageScales: Map<number, number | null>;
  /** Where each scale came from: printed in the sheet's text, or read off a
   *  render of it. A matcher cannot tell them apart from the number alone. */
  scaleSources?: Map<number, "printed" | "recovered">;
  sheetTitles: Map<number, string>;
  deps: FaceMappedDeps;
}): Promise<{ readings: DrawingReading[]; report: DrawingFileReport }> {
  const started = Date.now();
  const progress = faceMappedProgress(async (event) => { await args.deps.onProgress?.(event); });
  const roster = args.scheduleRows.map((row) => row.tag);
  // A row whose width the schedule did not state is not a row that says zero.
  // Treating it as a measurement makes every frame drawn for it a conflict.
  // Keyed by the tag as the engine spells it, not as the schedule did: a row
  // written W-1 is the opening the plan prints as W01, and every phase between
  // here and the report calls it W1.
  const widthByTag = new Map(args.scheduleRows
    .filter((row) => row.widthMm > 0)
    .map((row) => [normalizeOpeningRef(row.tag) ?? row.tag, row.widthMm]));
  const planStoreys = documentPlanStoreys(args.planPages, args.sheetTitles);
  const faceSheets = documentFaceSheets(args.elevationPages, planStoreys);
  let containerCalls = 0;
  // Spend, as the stage layer reports it. A dep that reports nothing is one
  // call, which is what it was before anyone counted.
  const spent: RunSpend = { modelCalls: 0, cachedTurns: 0, inputTokens: 0, outputTokens: 0, warnings: [], failureKind: null };
  const counted = <T>(call: (usage: FaceMappedCall["usage"]) => Promise<T>): Promise<T> => {
    let reported = false;
    const usage = (u: StageUsage) => {
      reported = true;
      spent.modelCalls += u.modelCalls;
      if (u.cached) spent.cachedTurns += 1;
      spent.inputTokens += u.inputTokens;
      spent.outputTokens += u.outputTokens;
      for (const warning of u.warnings) if (warning !== "stage_replayed" && !spent.warnings.includes(warning)) spent.warnings.push(warning);
    };
    return call(usage)
      // A provider failure keeps its kind: an outage and a bad read are
      // different problems, and the report is where operations tells them apart.
      .catch((error: unknown) => {
        if (error instanceof StageCallError) {
          spent.failureKind = error.failureKind;
          for (const warning of error.warnings) if (!spent.warnings.includes(warning)) spent.warnings.push(warning);
        }
        throw error;
      })
      .finally(() => { if (!reported) spent.modelCalls += 1; });
  };

  // A page that will not render costs the openings on it and nothing else:
  // one container timeout on one elevation sheet is not a reason to report a
  // whole schedule as unread.
  // The reason is kept: an opening that was lost to a timeout and one lost to
  // a malformed render are two different operational problems.
  const renderFailures = new Map<number, string>();
  const pageImage = async (pageNo: number, box?: CropBoxPt, dpi = RENDER_DPI) => {
    containerCalls += 1;
    try {
      const rendered = await args.deps.render({ pageNo, dpi, ...(box ? { crops: [box] } : {}) });
      const image = rendered.images[0];
      if (!image) renderFailures.set(pageNo, "the render came back without an image");
      return image ? { pngB64: image.pngB64, url: `data:image/png;base64,${image.pngB64}` } : null;
    } catch (error) {
      renderFailures.set(pageNo, error instanceof Error ? error.message : String(error));
      return null;
    }
  };
  const renderReason = (pageNo: number, what: string) =>
    `${what} could not be rendered: ${renderFailures.get(pageNo) ?? "no image came back"}`;
  const renderNotes = new Map<string, string>();
  // Provenance is a fact the caller knows and this engine does not: a number
  // alone cannot say whether a sheet printed it or a model read it.
  const scaleSourceOf = (pageNo: number) =>
    recalibrated.has(pageNo) ? "calibrated" as const : args.scaleSources?.get(pageNo) ?? null;

  // ── Phase C: which wall each opening is in, and where along it. ──────────
  await progress.step("plan_faces", "Mapping floor plans", 0, roster.length);
  const faceNames = new Set(faceSheets.keys());
  let outcomes = placeOpeningsOnPlan({
    pages: args.planPages, roster, faceNames, sheetTitles: args.sheetTitles,
  });

  const asked = planFaceRecoveryRequest({ outcomes, pages: args.planPages, roster });
  const faceByCandidate = new Map<string, RecoveredFace>();
  for (const request of asked) {
    const skill = makePlanFaceSkill(request, faceNames);
    const image = await pageImage(request.pageNo);
    if (!image) {
      for (const candidate of request.candidates) renderNotes.set(candidate.tag, renderReason(request.pageNo, "the plan page"));
      continue;
    }
    const answer = await counted((usage) => args.deps.readPlanPage({
      pageNo: request.pageNo, prompt: skill.buildPrompt({ imageDataUrls: [] }), imageDataUrls: [image.url], skill, usage,
    })).catch(() => null);
    for (const { planCandidateId, ...face } of answer?.placements ?? []) faceByCandidate.set(planCandidateId, face);
  }
  if (faceByCandidate.size) {
    outcomes = placeOpeningsOnPlan({
      pages: args.planPages, roster, faceNames, sheetTitles: args.sheetTitles, faceByCandidate,
    });
  }

  const placements = new Map<string, PlacedForReport>();
  const unplaced = new Map<string, string>();
  for (const outcome of outcomes) {
    if (outcome.state === "resolved") placements.set(outcome.placement.tag, outcome.placement);
    else unplaced.set(outcome.tag, renderNotes.has(outcome.tag) ? `${outcome.reason}; ${renderNotes.get(outcome.tag)} for a look` : outcome.reason);
  }
  await progress.step("plan_faces", "Mapping floor plans", placements.size, roster.length);

  // ── Phase D: which frame on each face is which opening. ─────────────────
  const matched = await matchOpenings({
    outcomes, faceSheets, faceNames, planStoreys, roster, widthByTag,
    elevationPages: args.elevationPages, sheetTitles: args.sheetTitles, pageScales: args.pageScales,
    render: pageImage, renderReason, counted, unplaced, progress,
    inventoryElevation: args.deps.inventoryElevation, reconcileFace: args.deps.reconcileFace,
  });

  // §14: a page that states no scale borrows one from every frame matched on
  // it - the median across the page, not each face's own, so a face drawn at
  // half the width of the rest is a disagreement rather than a private scale.
  //
  // And a page that states a scale most of its frames disagree with by one
  // factor (§7.4) - printed 1:100, drawn at 1:50 - records the conflict and is
  // sized from the frames' own median instead. One opening cannot recalibrate
  // a view; three that agree with each other can.
  const recalibrated = new Set<number>();
  for (const pageNo of new Set(matched.map((match) => match.frame.pageNo))) {
    const onPage = matched.filter((match) => match.frame.pageNo === pageNo);
    const stated = args.pageScales.get(pageNo);
    const conflicts = onPage.filter((match) => match.widthAgreement === "conflict").length;
    if (stated != null && !(conflicts >= 3 && conflicts > onPage.length / 2)) continue;
    const calibrated = calibrateWidths(
      onPage.map((match) => ({ ...match, expectedWidthPt: null, widthBasis: null, widthAgreement: "unknown" as const })),
      widthByTag,
    );
    if (!calibrated.some((match) => match.widthBasis === "calibrated")) continue;
    if (stated != null) recalibrated.add(pageNo);
    for (const match of calibrated) {
      matched[matched.findIndex((was) => was.tag === match.tag)] = stated == null ? match : {
        ...match,
        confidence: "ambiguous",
        warnings: [...match.warnings, `most frames on sheet ${pageNo} disagree with its printed 1:${stated} scale by one factor; widths are sized from their own median`],
      };
    }
  }

  // ── Phase D and E together: the crops are made and read, batch by batch. ─
  const { crops, cropBasis, compositions, cropCount } = await readOpenings({
    matched,
    pageSizeOf: (pageNo) => {
      const box = pageBox(args.elevationPages, pageNo);
      return [box[2], box[3]];
    },
    sourceFileId: args.sourceFileId,
    render: (pageNo, box) => pageImage(pageNo, box, CROP_DPI),
    renderReason,
    storeCrop: args.deps.storeCrop,
    ask: (input) => counted((usage) => args.deps.readComposition({ ...input, usage })),
    progress,
    unplaced,
  });

  for (const tag of crops.keys()) unplaced.delete(tag);
  const readings = faceMappedReadings({
    fileId: args.fileId,
    sourceFileId: args.sourceFileId,
    roster,
    placements,
    unplaced,
    crops,
    compositions,
    scheduleTypeByTag: new Map(args.scheduleRows.map((row) => [normalizeOpeningRef(row.tag) ?? row.tag, row.typeText ?? null])),
    // What matching found wrong with a pairing does not stop being wrong
    // because a later phase read the crop confidently.
    matchWarnings: new Map(matched
      .filter((match) => match.confidence === "ambiguous")
      .map((match) => [match.tag, match.warnings])),
  });
  const unread = readings.filter((reading) => reading.splitState !== "value").length;
  await progress.step("drawing_complete", `Drawing review complete · ${roster.length} processed, ${unread} unresolved`, roster.length, roster.length);

  return {
    readings,
    report: faceMappedFileReport({
      fileId: args.fileId,
      sourceFileId: args.sourceFileId,
      readings,
      pagesRead: args.planPages.length + args.elevationPages.length,
      crops: crops.size,
      attempted: cropCount,
      compositions,
      placed: placements.size,
      recovered: faceByCandidate.size,
      // Where each reading came from, for the report to say.
      lineage: new Map(matched.map((match) => [match.tag, {
        planCandidateId: match.placement.planCandidateId,
        frameId: match.frame.frameId,
        direction: match.direction,
        scaleSource: scaleSourceOf(match.frame.pageNo),
        cropBasis: cropBasis.get(match.tag) ?? null,
      }])),
      spent,
      containerCalls,
      startedAt: started,
    }),
  };
}
