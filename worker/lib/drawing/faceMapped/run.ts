import type { Skill } from "../../estimator/skills/types";
import type { CropBoxPt, DrawingFileReport, DrawingReading, RenderRequest, RenderResponse } from "../contract";
import { documentFaceRegions, documentFaceSheets } from "../sheetFaces";
import {
  compositionBatches, makeCompositionSkill, runCompositions,
  type CompositionOutcome, type CompositionTask,
} from "./compositions";
import { openingCropTasks, type OpeningCropTask } from "./crops";
import {
  elevationFaceTasks, makeElevationInventorySkill, validateElevationFrames,
  type ElevationFaceTask,
} from "./elevationFrames";
import {
  faceMappedFileReport, faceMappedProgress, faceMappedReadings,
  type CropForReport, type PlacedForReport,
} from "./report";
import { matchFacePlacements, type MatchedOpeningFrame } from "./matchFrames";
import { faceReconciliationTasks, makeFaceReconcileSkill, reconcileMatches, type FaceReconcileTask } from "./reconcileFace";
import { makePlanFaceSkill, planFaceRecoveryRequest, type RecoveredFace } from "./planFacesSkill";
import type { ElevationInventoryRead } from "./elevationFrames";
import type { CompositionRead } from "./compositions";
import { calibrateWidths } from "./widths";
import { placeOpeningsOnPlan, type PlanPage } from "./planFaces";
import { rosterVocabulary } from "./tags";
import { openingTagWords } from "../locate";
import { normalizeOpeningRef } from "../../ai/energyMap";

/**
 * §8. The phases in order, the concurrency they are allowed, the points a run
 * gives up at, and the report at the end. Nothing is decided here: every phase
 * decides its own thing, and this says when each one runs and what it is given.
 */
export interface FaceMappedDeps {
  render(request: RenderRequest): Promise<RenderResponse>;
  storeCrop(id: string, pngB64: string): Promise<string | null>;
  readPlanPage(input: FaceMappedCall & { pageNo: number }): Promise<{ placements: (RecoveredFace & { planCandidateId: string })[] } | null>;
  inventoryElevation(input: FaceMappedCall & { task: ElevationFaceTask }): Promise<ElevationInventoryRead | null>;
  reconcileFace(input: FaceMappedCall & { faceKey: string; frameIds: string[] }): Promise<{ pairs: { tag: string; frameId: string }[] } | null>;
  readComposition(input: FaceMappedCall & { batch: CompositionTask[]; attempt: number }): Promise<CompositionRead | null>;
  onProgress?(event: { phase: string; message: string; done: number; total: number; ms: number }): Promise<void>;
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
export interface FaceMappedCall extends FaceMappedCallInput {
  prompt: string;
  skill: Skill<FaceMappedCallInput, unknown>;
}

const RENDER_DPI = 100;
/** A face is a fraction of its sheet, so it is rendered closer than a page. */
const FACE_DPI = 150;
const CROP_DPI = 300;
/** How many of a run's composition batches may be asked twice. */
const COMPOSITION_RETRY_BUDGET = 4;

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
  const faceSheets = documentFaceSheets(args.elevationPages);
  let modelCalls = 0;
  let containerCalls = 0;

  // A page that will not render costs the openings on it and nothing else:
  // one container timeout on one elevation sheet is not a reason to report a
  // whole schedule as unread.
  const pageImage = async (pageNo: number, box?: CropBoxPt, dpi = RENDER_DPI) => {
    containerCalls += 1;
    try {
      const rendered = await args.deps.render({ pageNo, dpi, ...(box ? { crops: [box] } : {}) });
      const image = rendered.images[0];
      return image ? { pngB64: image.pngB64, url: `data:image/png;base64,${image.pngB64}` } : null;
    } catch {
      return null;
    }
  };
  // Provenance is a fact the caller knows and this engine does not: a number
  // alone cannot say whether a sheet printed it or a model read it.
  const scaleSourceOf = (pageNo: number) => args.scaleSources?.get(pageNo) ?? null;

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
    const answer = await args.deps.readPlanPage({
      pageNo: request.pageNo, prompt: skill.buildPrompt({ imageDataUrls: [] }), imageDataUrls: [image.url], skill,
    }).catch(() => null);
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
    else unplaced.set(outcome.tag, outcome.reason);
  }
  await progress.step("plan_faces", "Mapping floor plans", placements.size, roster.length);

  // ── Phase D: the frames each face draws, and which opening each one is. ──
  const faceRegions = documentFaceRegions(args.elevationPages);
  const built = elevationFaceTasks({
    placements: outcomes.flatMap((o) => o.state === "resolved" ? [o.placement] : []),
    faceSheets,
    widthByTag,
    sheets: new Map([...faceSheets.values()].flat().map((pageNo) => [pageNo, {
      overviewRenderId: `p${pageNo}`,
      overviewBoxPt: pageBox(args.elevationPages, pageNo),
      scaleCandidates: [],
    }])),
    // A sheet drawing four elevations shows a reader all four; the face's own
    // part of it shows the one the question is about.
    regionByFace: faceRegions,
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
    // The face's own region, at a resolution that holds up when it is a
    // quarter of a sheet.
    const image = await pageImage(task.pageNo, task.overviewBoxPt, FACE_DPI);
    if (!image) {
      for (const placement of placementsOn(outcomes, task)) unplaced.set(placement.tag, `sheet ${task.pageNo} could not be rendered`);
      continue;
    }
    modelCalls += 1;
    const inventorySkill = makeElevationInventorySkill(task);
    const read = await args.deps.inventoryElevation({
      task, prompt: inventorySkill.buildPrompt({ imageDataUrls: [] }), imageDataUrls: [image.url], skill: inventorySkill,
    }).catch(() => null);
    const inventory = read ? validateElevationFrames(read, task) : null;
    if (!inventory || inventory.state === "unresolved") {
      const reason = inventory?.reason ?? "the look at this face did not come back";
      for (const placement of placementsOn(outcomes, task)) unplaced.set(placement.tag, reason);
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
    const planImage = await pageImage(face.placements[0].planPageNo);
    // The second look is at the plan and the elevation together (§7.3 step 5).
    // Without the plan it is the first look again, and is not taken.
    if (!image || !planImage) {
      const reason = !planImage
        ? `${face.reason}; the plan page could not be rendered for a second look`
        : face.reason;
      for (const placement of face.placements) unplaced.set(placement.tag, reason);
      continue;
    }
    modelCalls += 1;
    const settled = reconcileMatches(await args.deps.reconcileFace({
      faceKey: face.faceKey,
      prompt: skill.buildPrompt({ imageDataUrls: [] }),
      // The plan region and the elevation together (§7.3 step 5).
      imageDataUrls: [planImage?.url, image.url].flatMap((url) => url ? [url] : []),
      frameIds: face.frames.map((frame) => frame.frameId),
      skill,
    }).catch(() => null), face);
    if (settled) matched.push(...settled.matches);
    else for (const placement of face.placements) unplaced.set(placement.tag, face.reason);
  }
  for (const face of unsettled.slice(faceReconciliationTasks(unsettled).length)) {
    for (const placement of face.placements) unplaced.set(placement.tag, face.reason);
  }

  // §14: a page that states no scale borrows one from every frame matched on
  // it - the median across the page, not each face's own, so a face drawn at
  // half the width of the rest is a disagreement rather than a private scale.
  for (const pageNo of new Set(matched.map((match) => match.frame.pageNo))) {
    if (args.pageScales.get(pageNo) != null) continue;
    const onPage = calibrateWidths(matched.filter((match) => match.frame.pageNo === pageNo), widthByTag);
    for (const calibrated of onPage) matched[matched.findIndex((match) => match.tag === calibrated.tag)] = calibrated;
  }

  // ── Phase D and E together: crops are made in batches of four, read, and let
  // go - at most four batches in flight (§7.6), so at most sixteen crops. The
  // base64 of a 300 DPI crop is the largest thing this run holds, and holding
  // every crop of a 27-opening set at once is how a Worker runs out of memory
  // on a big house.
  const crops = new Map<string, CropForReport>();
  const cropBasis = new Map<string, OpeningCropTask["basis"]>();
  const cropTasks = openingCropTasks({
    matches: matched.map((match) => ({
      tag: match.tag, frame: match.frame, expectedWidthPt: match.expectedWidthPt, widthBasis: match.widthBasis,
    })),
    pageSizeOf: (pageNo) => {
      const box = pageBox(args.elevationPages, pageNo);
      return [box[2], box[3]];
    },
    sourceFileId: args.sourceFileId,
  });
  const cropById = new Map(cropTasks.map((task) => [`${task.tag}_${task.frameId}`, task]));
  let compositions: CompositionOutcome[] = [];
  if (cropTasks.length) {
    let cropped = 0;
    await progress.step("composition_reads", "Reading opening compositions", 0, cropTasks.length);
    compositions = await runCompositions({
      tasks: cropTasks.map((task) => ({
        tag: task.tag, frameId: task.frameId, cropRenderId: `${task.tag}_${task.frameId}`, imageDataUrl: null,
      })),
      // Retries included: a document cannot spend the run's whole budget on one
      // batch that will not answer.
      callCeiling: compositionBatches(cropTasks).length + COMPOSITION_RETRY_BUDGET,
      prepare: async (batch) => {
        for (const task of batch) {
          const crop = cropById.get(task.cropRenderId)!;
          const image = await pageImage(crop.pageNo, crop.bboxPt, CROP_DPI);
          if (!image) {
            unplaced.set(task.tag, "the crop for this opening could not be rendered");
            continue;
          }
          const cropKey = await args.deps.storeCrop(task.cropRenderId, image.pngB64);
          // A crop that is nowhere is not evidence. Reading it anyway produces
          // an answer whose lineage cannot be followed back to anything, which
          // is the one thing a reading has to be able to do.
          if (!cropKey) {
            unplaced.set(task.tag, "the crop for this opening could not be stored");
            continue;
          }
          crops.set(task.tag, { cropRenderId: task.cropRenderId, cropKey, pageNo: crop.pageNo, bboxPt: crop.bboxPt, frameBoxPt: crop.frameBoxPt });
          cropBasis.set(task.tag, crop.basis);
          task.imageDataUrl = image.url;
        }
        cropped += batch.length;
        await progress.step("opening_crops", "Creating opening crops", cropped, cropTasks.length);
      },
      onBatch: (done, total) => progress.step("composition_reads", "Reading opening compositions", done, total),
      ask: async (batch, attempt, skill) => {
        modelCalls += 1;
        return args.deps.readComposition({
          batch, attempt, skill,
          prompt: skill.buildPrompt({ imageDataUrls: [] }),
          imageDataUrls: batch.map((task) => task.imageDataUrl!),
        });
      },
    });
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
      attempted: cropTasks.length,
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
      modelCalls,
      containerCalls,
      startedAt: started,
    }),
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

/** A page's own size in points. Every box the engine hands out is in these,
 * and assuming a size instead puts every crop in the top-left corner of a
 * sheet that is nothing like that size. */
function pageBox(pages: PlanPage[], pageNo: number): CropBoxPt {
  const geometry = pages.find((page) => page.geometry.pageNo === pageNo)?.geometry;
  return [0, 0, geometry?.widthPt ?? 0, geometry?.heightPt ?? 0];
}
