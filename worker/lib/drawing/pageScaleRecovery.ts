import type { InspectResponse, RenderRequest, RenderResponse } from "./contract";
import { mapPool } from "./pool";

/** A sheet's stated scale, read from the drawing rather than from its text. */
export interface StatedScaleInput {
  pageNo: number;
  imageDataUrl: string;
}

export interface StatedScaleResult {
  pageNo: number;
  ratio: number | null;
}

export interface PageScaleRecoveryDeps {
  render(request: RenderRequest): Promise<RenderResponse>;
  readStatedScale(input: StatedScaleInput): Promise<StatedScaleResult | null>;
}

/** Enough to read a title block: the strip in a real A2 sheet is legible at
 * this density, and a whole page stays a modest image. */
const RECOVERY_DPI = 100;

/** A drawing is not printed smaller than this, and a model returning something
 * outside it has read a note, a bearing or its own invention. */
const MIN_RATIO = 1;
const MAX_RATIO = 20_000;

/** A document whose text states no scale anywhere costs one render and one call
 * per page, and the inspection cap is sixty pages. Twenty is past any real set
 * — 623, the worst to hand, needs eleven — so a document that wants more is
 * telling us it needs attention rather than more spending. */
const MAX_RECOVERY_PAGES = 20;

/** Enough concurrency to matter on a set with nothing readable, few enough to
 * leave the container and the provider room for the rest of the run. */
const RECOVERY_CONCURRENCY = 4;

/** What a model may return about a sheet's scale, and nothing else. It must say
 * which sheet it read, and that sheet must be the one this run asked about: a
 * response describing another sheet, or naming none, is not evidence about the
 * page in hand. */
export function validateStatedScale(raw: unknown, askedPageNo: number): number | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.pageNo !== askedPageNo) return null;
  const ratio = typeof value.ratio === "number" ? value.ratio
    : typeof value.ratio === "string" ? Number(value.ratio.replace(/^\s*1\s*[:/]\s*/, "")) : Number.NaN;
  if (!Number.isFinite(ratio) || !Number.isInteger(ratio)) return null;
  return ratio >= MIN_RATIO && ratio <= MAX_RATIO ? ratio : null;
}

/**
 * Reads the scale from sheets whose text never stated one.
 *
 * Text first, and enforced here rather than trusted to the caller: a page the
 * deterministic map already answered — or already called a conflict — is never
 * sent, so no model answer can overwrite what the drawing said in words. A
 * sheet that states no scale at all returns none — absence is an answer.
 *
 * The whole page is rendered rather than a title-block crop. Where a title
 * block sits is a convention, and this path exists precisely because a
 * convention failed; cropping to the place the scale usually is would carry the
 * same assumption into the fallback meant to survive it.
 *
 * One sheet's failure costs that sheet. A render that throws or a provider that
 * rejects loses its own page's scale and nothing else: recovering ten sheets
 * and losing the eleventh must not discard the ten.
 */
export async function recoverPageScales(args: {
  inspected: InspectResponse;
  pageNos: number[];
  /** What the text already settled, by page. Required, not optional: a caller
   * that forgets it would send pages the drawing already answered - or already
   * called a conflict - back to a model. Present pages are never re-read. */
  stated: Map<number, number | null>;
  deps: PageScaleRecoveryDeps;
}): Promise<Map<number, number>> {
  const recovered = new Map<number, number>();
  const known = new Set(args.inspected.inventory.pages.map((page) => page.pageNo));
  // Deduplicated and capped before any work starts: a page asked for twice is
  // one render, and a document with no readable scale anywhere does not get to
  // spend a call on every page it has.
  const wanted = [...new Set(args.pageNos)]
    .filter((pageNo) => known.has(pageNo) && !args.stated.has(pageNo))
    .slice(0, MAX_RECOVERY_PAGES);
  const read = await mapPool(wanted, RECOVERY_CONCURRENCY, async (pageNo) => {
    try {
      const render = await args.deps.render({ pageNo, dpi: RECOVERY_DPI });
      const image = render.images[0];
      if (!image?.pngB64) return null;
      const stated = await args.deps.readStatedScale({
        pageNo,
        imageDataUrl: `data:image/png;base64,${image.pngB64}`,
      });
      return validateStatedScale(stated, pageNo);
    } catch {
      return null;
    }
  });
  wanted.forEach((pageNo, at) => {
    const ratio = read[at];
    if (ratio !== null && ratio !== undefined) recovered.set(pageNo, ratio);
  });
  return recovered;
}
