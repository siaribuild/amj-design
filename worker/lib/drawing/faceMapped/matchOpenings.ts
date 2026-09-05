import type { CropBoxPt } from "../contract";
import { openingTagWords } from "../locate";
import { documentFaceRegions, documentSheetStoreys } from "../sheetFaces";
import {
  elevationFaceTasks, makeElevationInventorySkill, validateElevationFrames,
  type ElevationFaceTask, type ElevationInventoryRead,
} from "./elevationFrames";
import { matchFacePlacements, type MatchedOpeningFrame } from "./matchFrames";
import type { PlanPage } from "./planFaces";
import { faceReconciliationTasks, makeFaceReconcileSkill, reconcileMatches, type FaceReconcileTask } from "./reconcileFace";
import type { faceMappedProgress } from "./report";
import type { FaceMappedCall, FaceMappedDeps } from "./run";
import { rosterVocabulary } from "./tags";
import { placeOpeningsOnPlan } from "./planFaces";

/** A face is a fraction of its sheet, so it is rendered closer than a page. */
const FACE_DPI = 150;

type Outcomes = ReturnType<typeof placeOpeningsOnPlan>;

/**
 * Phase D, §7.2 and §7.3: for each face and storey the plan populated, the
 * frames the elevation draws there, which opening each one is, and one look at
 * any face neither reading settled. What it cannot settle it records against
 * the openings, and nothing here decides anything a phase did not.
 */
export async function matchOpenings(ctx: {
  outcomes: Outcomes;
  faceSheets: Map<string, number[]>;
  faceNames: Set<string>;
  /** The storeys the plan sheets name: what tells a sheet's title from a face's. */
  planStoreys: Set<string>;
  roster: string[];
  widthByTag: Map<string, number>;
  elevationPages: PlanPage[];
  sheetTitles: Map<number, string>;
  pageScales: Map<number, number | null>;
  render(pageNo: number, box?: CropBoxPt, dpi?: number): Promise<{ pngB64: string; url: string } | null>;
  renderReason(pageNo: number, what: string): string;
  counted<T>(call: (usage: FaceMappedCall["usage"]) => Promise<T>): Promise<T>;
  unplaced: Map<string, string>;
  progress: ReturnType<typeof faceMappedProgress>;
  inventoryElevation: FaceMappedDeps["inventoryElevation"];
  reconcileFace: FaceMappedDeps["reconcileFace"];
}): Promise<MatchedOpeningFrame[]> {
  const faceRegions = documentFaceRegions(ctx.elevationPages, ctx.planStoreys);
  const built = elevationFaceTasks({
    placements: ctx.outcomes.flatMap((o) => o.state === "resolved" ? [o.placement] : []),
    faceSheets: ctx.faceSheets,
    widthByTag: ctx.widthByTag,
    sheets: new Map([...ctx.faceSheets.values()].flat().map((pageNo) => [pageNo, {
      overviewRenderId: `p${pageNo}`,
      overviewBoxPt: pageBox(ctx.elevationPages, pageNo),
      scaleCandidates: [],
    }])),
    // A sheet drawing four elevations shows a reader all four; the face's own
    // part of it shows the one the question is about.
    regionByFace: faceRegions,
    sheetStoreys: documentSheetStoreys(ctx.elevationPages, ctx.sheetTitles, ctx.faceNames, ctx.planStoreys),
  });
  for (const skipped of built.skipped) {
    for (const tag of skipped.tags) ctx.unplaced.set(tag, skipped.reason);
  }

  const matched: MatchedOpeningFrame[] = [];
  const unsettled: FaceReconcileTask[] = [];
  let done = 0;
  for (const task of built.tasks) {
    await ctx.progress.step("elevation_frames", `Locating elevation frames · ${task.elevation}, ${task.storey}`, done, built.tasks.length);
    done += 1;
    // The face's own region, at a resolution that holds up when it is a
    // quarter of a sheet.
    const image = await ctx.render(task.pageNo, task.overviewBoxPt, FACE_DPI);
    if (!image) {
      for (const placement of placementsOn(ctx.outcomes, task)) ctx.unplaced.set(placement.tag, ctx.renderReason(task.pageNo, `sheet ${task.pageNo}`));
      continue;
    }
    const inventorySkill = makeElevationInventorySkill(task);
    const read = await ctx.counted((usage) => ctx.inventoryElevation({
      task, prompt: inventorySkill.buildPrompt({ imageDataUrls: [] }), imageDataUrls: [image.url], skill: inventorySkill, usage,
    })).catch(() => null);
    const inventory = read ? validateElevationFrames(read, task) : null;
    if (!inventory || inventory.state === "unresolved") {
      const reason = inventory?.reason ?? "the look at this face did not come back";
      for (const placement of placementsOn(ctx.outcomes, task)) ctx.unplaced.set(placement.tag, reason);
      continue;
    }
    const match = matchFacePlacements({
      placements: placementsOn(ctx.outcomes, task),
      frames: inventory.frames,
      widthByTag: ctx.widthByTag,
      pageScaleRatio: ctx.pageScales.get(task.pageNo) ?? null,
      // Some sets label their elevations too, and a tag printed inside a frame
      // says which opening it is outright.
      tagWordsPt: elevationTagWords(ctx.elevationPages, task.pageNo, ctx.roster),
    });
    if (match.direction === "unresolved") {
      unsettled.push({
        faceKey: task.faceKey,
        regionPt: task.overviewBoxPt,
        reason: match.reason,
        placements: placementsOn(ctx.outcomes, task),
        frames: inventory.frames,
        widthByTag: ctx.widthByTag,
        pageScaleRatio: ctx.pageScales.get(task.pageNo) ?? null,
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
    const image = await ctx.render(face.frames[0].pageNo, face.regionPt, FACE_DPI);
    const planImage = await ctx.render(face.placements[0].planPageNo);
    // The second look is at the plan and the elevation together (§7.3 step 5).
    // Without the plan it is the first look again, and is not taken.
    if (!image || !planImage) {
      const failed = [
        !planImage ? ctx.renderReason(face.placements[0].planPageNo, "the plan page") : null,
        !image ? ctx.renderReason(face.frames[0].pageNo, "the face") : null,
      ].filter(Boolean).join("; ");
      const reason = `${face.reason}; ${failed} for a second look`;
      for (const placement of face.placements) ctx.unplaced.set(placement.tag, reason);
      continue;
    }
    const settled = reconcileMatches(await ctx.counted((usage) => ctx.reconcileFace({
      faceKey: face.faceKey,
      prompt: skill.buildPrompt({ imageDataUrls: [] }),
      // The plan region and the elevation together (§7.3 step 5).
      imageDataUrls: [planImage.url, image.url],
      frameIds: face.frames.map((frame) => frame.frameId),
      skill,
      usage,
    })).catch(() => null), face);
    if (settled) matched.push(...settled.matches);
    else for (const placement of face.placements) ctx.unplaced.set(placement.tag, face.reason);
  }
  for (const face of unsettled.slice(faceReconciliationTasks(unsettled).length)) {
    for (const placement of face.placements) ctx.unplaced.set(placement.tag, face.reason);
  }

  return matched;
}

/** The openings the plan put on one face and storey, in wall order. */
function placementsOn(
  outcomes: Outcomes,
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
export function pageBox(pages: PlanPage[], pageNo: number): CropBoxPt {
  const geometry = pages.find((page) => page.geometry.pageNo === pageNo)?.geometry;
  return [0, 0, geometry?.widthPt ?? 0, geometry?.heightPt ?? 0];
}
