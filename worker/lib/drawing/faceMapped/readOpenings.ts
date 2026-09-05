import type { CropBoxPt } from "../contract";
import {
  compositionBatches, runCompositions,
  type CompositionOutcome, type CompositionRead, type CompositionTask,
} from "./compositions";
import { openingCropTasks, type OpeningCropTask } from "./crops";
import type { MatchedOpeningFrame } from "./matchFrames";
import type { CropForReport, faceMappedProgress } from "./report";

/** How many of a run's composition batches may be asked twice. */
const COMPOSITION_RETRY_BUDGET = 4;
/** The most base64 one crop may weigh. A 300 DPI crop of a frame and its storey
 * band is a few hundred kilobytes; one that is not is a render gone wrong, and
 * sixteen of them at once is how a Worker runs out of memory. */
const MAX_CROP_BASE64 = 2_000_000;

/**
 * Phase D's crops and Phase E's reads, together: crops are made in batches of
 * four just before they are read and let go straight after - at most four
 * batches in flight (§7.6), so at most sixteen crops, each no heavier than
 * MAX_CROP_BASE64. Holding every crop of a 27-opening set at once is how a
 * Worker runs out of memory on a big house.
 */
export async function readOpenings(args: {
  matched: MatchedOpeningFrame[];
  pageSizeOf(pageNo: number): [number, number];
  sourceFileId: string;
  render(pageNo: number, box: CropBoxPt): Promise<{ pngB64: string; url: string } | null>;
  renderReason(pageNo: number, what: string): string;
  storeCrop(id: string, pngB64: string): Promise<string | null>;
  ask(input: { batch: CompositionTask[]; attempt: number; skill: Parameters<Parameters<typeof runCompositions>[0]["ask"]>[2]; prompt: string; imageDataUrls: string[] }): Promise<CompositionRead | null>;
  progress: ReturnType<typeof faceMappedProgress>;
  unplaced: Map<string, string>;
}): Promise<{ crops: Map<string, CropForReport>; cropBasis: Map<string, OpeningCropTask["basis"]>; compositions: CompositionOutcome[]; cropCount: number }> {
  const crops = new Map<string, CropForReport>();
  const cropBasis = new Map<string, OpeningCropTask["basis"]>();
  const cropTasks = openingCropTasks({
    matches: args.matched.map((match) => ({
      tag: match.tag, frame: match.frame, expectedWidthPt: match.expectedWidthPt, widthBasis: match.widthBasis,
    })),
    pageSizeOf: args.pageSizeOf,
    sourceFileId: args.sourceFileId,
  });
  const cropById = new Map(cropTasks.map((task) => [`${task.tag}_${task.frameId}`, task]));
  if (!cropTasks.length) return { crops, cropBasis, compositions: [], cropCount: 0 };

  let cropped = 0;
  await args.progress.step("composition_reads", "Reading opening compositions", 0, cropTasks.length);
  const compositions = await runCompositions({
    tasks: cropTasks.map((task) => ({
      tag: task.tag, frameId: task.frameId, cropRenderId: `${task.tag}_${task.frameId}`, imageDataUrl: null,
    })),
    // Retries included: a document cannot spend the run's whole budget on one
    // batch that will not answer.
    callCeiling: compositionBatches(cropTasks).length + COMPOSITION_RETRY_BUDGET,
    prepare: async (batch) => {
      for (const task of batch) {
        const crop = cropById.get(task.cropRenderId)!;
        const image = await args.render(crop.pageNo, crop.bboxPt);
        if (!image) {
          args.unplaced.set(task.tag, args.renderReason(crop.pageNo, "the crop for this opening"));
          continue;
        }
        if (image.pngB64.length > MAX_CROP_BASE64) {
          args.unplaced.set(task.tag, `the crop for this opening is too large to hold (${Math.round(image.pngB64.length / 1e6)}MB)`);
          continue;
        }
        const cropKey = await args.storeCrop(task.cropRenderId, image.pngB64);
        // A crop that is nowhere is not evidence. Reading it anyway produces an
        // answer whose lineage cannot be followed back to anything, which is
        // the one thing a reading has to be able to do.
        if (!cropKey) {
          args.unplaced.set(task.tag, "the crop for this opening could not be stored");
          continue;
        }
        crops.set(task.tag, { cropRenderId: task.cropRenderId, cropKey, pageNo: crop.pageNo, bboxPt: crop.bboxPt, frameBoxPt: crop.frameBoxPt });
        cropBasis.set(task.tag, crop.basis);
        task.imageDataUrl = image.url;
      }
      cropped += batch.length;
      await args.progress.step("opening_crops", "Creating opening crops", cropped, cropTasks.length);
    },
    onBatch: (done, total) => args.progress.step("composition_reads", "Reading opening compositions", done, total),
    ask: (batch, attempt, skill) => args.ask({
      batch, attempt, skill,
      prompt: skill.buildPrompt({ imageDataUrls: [] }),
      imageDataUrls: batch.map((task) => task.imageDataUrl!),
    }),
  });
  return { crops, cropBasis, compositions, cropCount: cropTasks.length };
}
