import { MAX_CROP_BASE64, type CropBoxPt } from "../contract";
import {
  compositionBatches, runCompositions,
  type CompositionOutcome, type CompositionRead, type CompositionTask,
} from "./compositions";
import { openingCropTasks, type OpeningCropTask } from "./crops";
import type { MatchedOpeningFrame } from "./matchFrames";
import type { CropForReport, faceMappedProgress } from "./report";

/** How many of a run's composition batches may be asked twice. */
const COMPOSITION_RETRY_BUDGET = 4;

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
  /** The scheduled roster, which every progress event counts against (§9):
   * seven crops of twenty-seven openings is 7/27, not 7/7. */
  total: number;
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
  // A frame whose crop could not be sized - off the sheet, or holding a
  // neighbour's centre - is refused with a reason, not passed over.
  for (const match of args.matched) {
    if (!cropById.has(`${match.tag}_${match.frame.frameId}`)) args.unplaced.set(match.tag, "no crop could be sized for this frame: it runs off the sheet or would hold a neighbour");
  }
  if (!cropTasks.length) return { crops, cropBasis, compositions: [], cropCount: 0 };

  let cropped = 0;
  // Four waves run at once, so a fast wave's reads can finish while a slow
  // wave's crops are still rendering, and two writes in flight can land in
  // either order. Every progress write goes down one chain, each with the
  // count it was made at, and reads are held - every settled batch its own
  // milestone (§9) - until every crop has been reported, or the persisted
  // phase goes from crops to reads and back to crops. A batch asked again is a
  // milestone too (§9): rechecking is work the user can see, not a pause.
  let writes: Promise<void> = Promise.resolve();
  const report = (phase: "opening_crops" | "composition_reads", message: string, count: number) =>
    (writes = writes.then(() => args.progress.step(phase, message, count, args.total)));
  const settled: { count: number; message: string }[] = [];
  let lastSettled = 0;
  const reportReads = () => {
    if (cropped !== cropTasks.length) return Promise.resolve();
    for (const { count, message } of settled.splice(0)) report("composition_reads", message, count);
    return writes;
  };
  await report("opening_crops", "Creating opening crops", 0);
  const compositions = await runCompositions({
    tasks: cropTasks.map((task) => ({
      tag: task.tag, frameId: task.frameId, cropRenderId: `${task.tag}_${task.frameId}`, imageDataUrl: null,
    })),
    // Retries included: a document cannot spend the run's whole budget on one
    // batch that will not answer.
    callCeiling: compositionBatches(cropTasks).length + COMPOSITION_RETRY_BUDGET,
    prepare: async (batch) => {
      try {
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
        const cropKey = await args.storeCrop(task.cropRenderId, image.pngB64).catch(() => null);
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
      } finally {
        // Counted whatever happened inside: a wave that failed is still a wave
        // that is over, and the reads must not wait on it forever.
        cropped += batch.length;
        await report("opening_crops", "Creating opening crops", cropped);
        await reportReads();
      }
    },
    onBatch: (done) => { lastSettled = done; settled.push({ count: done, message: "Reading opening compositions" }); return reportReads(); },
    onRetry: (unread) => { settled.push({ count: lastSettled, message: `Rechecking ${unread} unclear opening${unread === 1 ? "" : "s"}` }); return reportReads(); },
    ask: (batch, attempt, skill) => args.ask({
      batch, attempt, skill,
      prompt: skill.buildPrompt({ imageDataUrls: [] }),
      imageDataUrls: batch.map((task) => task.imageDataUrl!),
    }),
  });
  return { crops, cropBasis, compositions, cropCount: cropTasks.length };
}
