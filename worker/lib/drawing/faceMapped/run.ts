import type { CropBoxPt, DrawingFileReport, DrawingReading, RenderRequest, RenderResponse } from "../contract";
import { documentFaceSheets } from "../sheetFaces";
import { runCompositions, type CompositionOutcome, type CompositionTask } from "./compositions";
import { openingCropTasks } from "./crops";
import { elevationFaceTasks, validateElevationFrames, type ElevationFaceTask, type ElevationFrame } from "./elevationFrames";
import { faceMappedProgress, faceMappedReadings, type CropForReport, type PlacedForReport } from "./report";
import {
  faceReconciliationTasks, makeFaceReconcileSkill, matchFacePlacements,
  type FaceReconcileTask, type MatchedOpeningFrame,
} from "./matchFrames";
import { makePlanFaceSkill, planFaceRecoveryRequest, type RecoveredFace } from "./planFacesSkill";
import { placeOpeningsOnPlan, rosterVocabulary, type PlanPage } from "./planFaces";
import { openingTagWords } from "../locate";

/**
 * §8. The phases in order, the concurrency they are allowed, the points a run
 * gives up at, and the report at the end. Nothing is decided here: every phase
 * decides its own thing, and this says when each one runs and what it is given.
 */
export interface FaceMappedDeps {
  render(request: RenderRequest): Promise<RenderResponse>;
  storeCrop(id: string, pngB64: string): Promise<string | null>;
  readPlanPage(input: { pageNo: number; prompt: string; imageDataUrl: string }): Promise<unknown>;
  inventoryElevation(input: { task: ElevationFaceTask; imageDataUrl: string }): Promise<unknown>;
  reconcileFace(input: { faceKey: string; prompt: string; imageDataUrl: string; frameIds: string[] }): Promise<unknown>;
  readComposition(input: { batch: CompositionTask[]; attempt: number }): Promise<unknown>;
  onProgress?(event: { phase: string; message: string; done: number; total: number; ms: number }): Promise<void>;
}

const RENDER_DPI = 100;
const CROP_DPI = 300;

export async function runFaceMappedParser(args: {
  fileId: string;
  sourceFileId: string;
  scheduleRows: { tag: string; widthMm: number; typeText?: string | null }[];
  planPages: PlanPage[];
  elevationPages: PlanPage[];
  /** Printed page scales from Phase A, by page number. */
  pageScales: Map<number, number | null>;
  sheetTitles: Map<number, string>;
  deps: FaceMappedDeps;
}): Promise<{ readings: DrawingReading[]; report: DrawingFileReport }> {
  const started = Date.now();
  const progress = faceMappedProgress(async (event) => { await args.deps.onProgress?.(event); });
  const roster = args.scheduleRows.map((row) => row.tag);
  const widthByTag = new Map(args.scheduleRows.map((row) => [row.tag, row.widthMm]));
  const faceSheets = documentFaceSheets(args.elevationPages);
  let modelCalls = 0;
  let containerCalls = 0;

  const pageImage = async (pageNo: number, box?: CropBoxPt, dpi = RENDER_DPI) => {
    containerCalls += 1;
    const rendered = await args.deps.render({ pageNo, dpi, ...(box ? { crops: [box] } : {}) });
    const image = rendered.images[0];
    return image ? { pngB64: image.pngB64, url: `data:image/png;base64,${image.pngB64}` } : null;
  };

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
    if (!image) continue;
    modelCalls += 1;
    const answer = skill.validate(
      await args.deps.readPlanPage({ pageNo: request.pageNo, prompt: skill.buildPrompt({ imageDataUrl: image.url }), imageDataUrl: image.url })
        .catch(() => null));
    for (const [id, face] of answer ?? []) faceByCandidate.set(id, face);
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
    else unplaced.set(outcome.tag, outcome.reason);
  }
  await progress.step("plan_faces", "Mapping floor plans", placements.size, roster.length);

  // ── Phase D: the frames each face draws, and which opening each one is. ──
  const built = elevationFaceTasks({
    placements: outcomes.flatMap((o) => o.state === "resolved" ? [o.placement] : []),
    faceSheets,
    widthByTag,
    sheets: new Map([...faceSheets.values()].flat().map((pageNo) => [pageNo, {
      overviewRenderId: `p${pageNo}`,
      overviewBoxPt: [0, 0, 1_000, 800] as CropBoxPt,
      scaleCandidates: [],
    }])),
  });
  for (const skipped of built.skipped) {
    for (const tag of skipped.tags) unplaced.set(tag, skipped.reason);
  }

  const matched: MatchedOpeningFrame[] = [];
  const unsettled: FaceReconcileTask[] = [];
  let done = 0;
  for (const task of built.tasks) {
    await progress.step("elevation_frames", `Locating elevation frames · ${task.elevation}, ${task.storey}`, done, built.tasks.length);
    done += 1;
    const image = await pageImage(task.pageNo);
    if (!image) continue;
    modelCalls += 1;
    const inventory = validateElevationFrames(
      await args.deps.inventoryElevation({ task, imageDataUrl: image.url }).catch(() => null),
      task);
    if (inventory.state === "unresolved") {
      for (const placement of placementsOn(outcomes, task)) unplaced.set(placement.tag, inventory.reason);
      continue;
    }
    const match = matchFacePlacements({
      placements: placementsOn(outcomes, task),
      frames: inventory.frames,
      widthByTag,
      pageScaleRatio: args.pageScales.get(task.pageNo) ?? null,
      // Some sets label their elevations too, and a tag printed inside a frame
      // says which opening it is outright.
      tagWordsPt: elevationTagWords(args.elevationPages, task.pageNo, roster),
    });
    if (match.direction === "unresolved") {
      unsettled.push({
        faceKey: task.faceKey,
        reason: match.reason,
        placements: placementsOn(outcomes, task),
        frames: inventory.frames,
        widthByTag,
        pageScaleRatio: args.pageScales.get(task.pageNo) ?? null,
      });
      continue;
    }
    matched.push(...match.matches);
  }

  // §7.3 step 5: the faces neither reading settled get one look each, at the
  // plan and the elevation together. A face that look cannot settle either is
  // left unmatched — its openings keep the wall the plan gave them and lose
  // only the frame nobody could name.
  for (const face of faceReconciliationTasks(unsettled)) {
    const skill = makeFaceReconcileSkill(face);
    const image = await pageImage(face.frames[0].pageNo);
    if (!image) continue;
    modelCalls += 1;
    const settled = skill.validate(await args.deps.reconcileFace({
      faceKey: face.faceKey,
      prompt: skill.buildPrompt({ imageDataUrl: image.url }),
      imageDataUrl: image.url,
      frameIds: face.frames.map((frame) => frame.frameId),
    }).catch(() => null));
    if (settled) matched.push(...settled.matches);
    else for (const placement of face.placements) unplaced.set(placement.tag, face.reason);
  }
  for (const face of unsettled.slice(faceReconciliationTasks(unsettled).length)) {
    for (const placement of face.placements) unplaced.set(placement.tag, face.reason);
  }

  // ── Phase D: the crops, sized by the schedule through the page scale. ────
  const crops = new Map<string, CropForReport>();
  const compositionTasks: CompositionTask[] = [];
  const cropTasks = openingCropTasks({
    matches: matched.map((match) => ({
      tag: match.tag, frame: match.frame, expectedWidthPt: match.expectedWidthPt,
    })),
    pageSizePt: [1_000, 800],
    sourceFileId: args.sourceFileId,
  });
  for (const [at, task] of cropTasks.entries()) {
    await progress.step("opening_crops", "Creating opening crops", at, cropTasks.length);
    const image = await pageImage(task.pageNo, task.bboxPt, CROP_DPI);
    if (!image) continue;
    const cropRenderId = `${task.tag}_${task.frameId}`;
    const cropKey = await args.deps.storeCrop(cropRenderId, image.pngB64);
    crops.set(task.tag, { cropRenderId, cropKey, pageNo: task.pageNo, bboxPt: task.bboxPt });
    compositionTasks.push({ tag: task.tag, frameId: task.frameId, cropRenderId, imageDataUrl: image.url });
  }

  // ── Phase E: what is drawn inside each crop. ─────────────────────────────
  let compositions: CompositionOutcome[] = [];
  if (compositionTasks.length) {
    await progress.step("composition_reads", "Reading opening compositions", 0, compositionTasks.length);
    compositions = await runCompositions({
      tasks: compositionTasks,
      ask: async (batch, attempt) => {
        modelCalls += 1;
        return args.deps.readComposition({ batch, attempt });
      },
    });
    await progress.step("composition_reads", "Reading opening compositions", compositionTasks.length, compositionTasks.length);
  }

  for (const tag of crops.keys()) unplaced.delete(tag);
  const readings = faceMappedReadings({
    fileId: args.fileId,
    sourceFileId: args.sourceFileId,
    roster,
    placements,
    unplaced,
    crops,
    compositions,
    scheduleTypeByTag: new Map(args.scheduleRows.map((row) => [row.tag, row.typeText ?? null])),
  });
  const unread = readings.filter((reading) => reading.splitState !== "value").length;
  await progress.step("drawing_complete", `Drawing review complete · ${roster.length} processed, ${unread} unresolved`, roster.length, roster.length);

  return {
    readings,
    report: {
      fileId: args.fileId,
      sourceFileIds: [args.sourceFileId],
      steps: {
        inventory: { pages: args.planPages.length + args.elevationPages.length, fonts: 0, images: 0, attachments: 0 },
        strategy: "text_vector",
        text: { pagesRead: args.planPages.length + args.elevationPages.length },
        selectPages: { selected: [], of: args.planPages.length + args.elevationPages.length },
        elevationRegions: [],
        renderCrop: { pagesRendered: containerCalls, cropsMade: crops.size },
        read: {
          attempted: compositionTasks.length,
          returned: compositions.filter((outcome) => outcome.state === "value").length,
          declined: compositions.filter((outcome) => outcome.state === "not_stated").length,
          retriedWithThreshold: 0,
          targetedReviews: 0,
        },
        placements: {
          // Placed by the drawing rather than by a look at it. Confidence is a
          // different axis: an unvouched tag is still a text placement.
          fromText: placements.size - faceByCandidate.size,
          fromModelFallback: faceByCandidate.size,
          unplaced: readings.filter((reading) => reading.gapCode === "unplaced").length,
        },
        northAssumed: false,
      },
      perOpening: readings.map((reading) => ({
        tag: reading.externalRef,
        outcome: reading.splitState === "value" ? "read" as const : "not_read" as const,
        cropKey: reading.cropKey,
        pageNo: reading.pageNo,
        confidence: reading.confidence,
        flags: reading.flags,
      })),
      wallMs: Date.now() - started,
      modelCalls,
      containerCalls,
    },
  };
}

/** The openings the plan put on one face and storey, in wall order. */
function placementsOn(
  outcomes: ReturnType<typeof placeOpeningsOnPlan>,
  task: { elevation: string; storey: string },
) {
  return outcomes
    .flatMap((outcome) => outcome.state === "resolved" ? [outcome.placement] : [])
    .filter((placement) => placement.elevation === task.elevation && placement.storey === task.storey)
    .sort((a, b) => a.wallOrder - b.wallOrder);
}

/** Opening tags printed on one elevation sheet, in page points. Where a set
 * labels its elevations, this is the only direct statement of which frame is
 * which opening the drawings ever make. */
function elevationTagWords(pages: PlanPage[], pageNo: number, roster: string[]) {
  const sheet = pages.find((page) => page.geometry.pageNo === pageNo);
  if (!sheet) return [];
  const { vocabulary, tagOf } = rosterVocabulary(roster);
  return openingTagWords(sheet.page.words, vocabulary, sheet.geometry).map(({ tag, word }) => ({
    tag: tagOf.get(tag) ?? tag,
    boxPt: [word.x0, word.top, word.x1, word.bottom] as CropBoxPt,
  }));
}
