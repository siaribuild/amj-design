// ═══════════════════════════════════════════════════════════════════════════════
// THE CROP THE MODEL IS SHOWN
//
// Step 5 of the method: having rendered the sheet, cut out one opening. The
// container does the rendering and the cutting; this decides WHERE, and it lives
// here rather than there on purpose — the arithmetic is the whole risk, and the
// container is a dumb pair of hands that should not be making judgements.
//
// A box that is wrong here shows the model a different window, and it will
// describe that window confidently. That is the failure mode this reader has:
// not crashing, answering.
// ═══════════════════════════════════════════════════════════════════════════════
import type { Region } from "./types";

/** Is this a Region at all?
 *
 *  THE definition, because it is now asked in two places — here, and by the
 *  vision skill that produces one (`skills/drawingRead.ts`). Both receive
 *  regions from a model, and two copies of "what counts as valid" drift into two
 *  different ideas of it.
 *
 *  Refused, never repaired. Clamping [0.2,0.2,1.4,0.6] yields the full page
 *  width, so the model would be handed the whole elevation sheet as though it
 *  were one window and would describe it; sorting inverted corners hides that
 *  something misunderstood the convention. Inclusive of 0 and 1, because a
 *  drawing filling its sheet is legitimate. */
export function isRegion(raw: unknown): raw is Region {
  if (!Array.isArray(raw) || raw.length !== 4) return false;
  const [x0, y0, x1, y1] = raw;
  if (![x0, y0, x1, y1].every((v) => typeof v === "number" && Number.isFinite(v))) return false;
  if ([x0, y0, x1, y1].some((v) => v < 0 || v > 1)) return false;
  return x1 > x0 && y1 > y0;
}

/** Pixels, ready for a crop. Named for what sharp.extract wants, so nobody has
 *  to translate between two rectangle conventions on the way out. */
export interface CropBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** How much sheet to keep around the opening, as a fraction of the box.
 *
 *  Not decoration. What a reviewer and a model both need is OUTSIDE the frame:
 *  the printed dimension strings, the tag, and the sill/head lines that say
 *  which storey it sits on. A crop tight to the frame throws all of it away and
 *  leaves a rectangle with no context to be wrong about.
 *
 *  ponytail: one number for every opening. If a practice's dimension strings sit
 *  further out than this, the fix is per-producer padding, not a bigger constant
 *  for everyone. */
const PAD_FRACTION = 0.18;

/** …and a floor, because 18% of a small opening is nearly nothing. A 610mm
 *  window at 1:100 is ~17pt wide, whose 18% is 3pt — narrower than the dimension
 *  text it is meant to keep. */
const MIN_PAD_PT = 12;

/**
 * The pixel rectangle for one opening, at the scale the page was rendered.
 *
 * `region` is the normalised 0..1 TOP-LEFT form the platform already stores in
 * `evidence_items.region_json`, so a crop and the evidence a reviewer is shown
 * are the same rectangle and cannot drift apart.
 *
 * Returns null rather than a guess when the region is unusable. sharp.extract
 * throws on a zero or negative rectangle, and a caller that substitutes a
 * default shows the model an arbitrary part of the sheet — which reads as an
 * answer, not as an error.
 */
export function cropBoxFor(
  region: Region,
  pageWidthPt: number,
  pageHeightPt: number,
  scale: number,
): CropBox | null {
  if (!isRegion(region)) return null;
  const [x0, y0, x1, y1] = region;
  if (![pageWidthPt, pageHeightPt, scale].every(Number.isFinite)) return null;
  if (pageWidthPt <= 0 || pageHeightPt <= 0 || scale <= 0) return null;
  const wPt = (x1 - x0) * pageWidthPt;
  const hPt = (y1 - y0) * pageHeightPt;
  const padX = Math.max(wPt * PAD_FRACTION, MIN_PAD_PT);
  const padY = Math.max(hPt * PAD_FRACTION, MIN_PAD_PT);

  // Pad first, then clamp to the sheet. Clamping moves an edge without moving
  // the opposite one, so a window against the page edge keeps its full width and
  // simply loses the margin it could not have.
  const left = Math.max(0, x0 * pageWidthPt - padX);
  const top = Math.max(0, y0 * pageHeightPt - padY);
  const right = Math.min(pageWidthPt, x1 * pageWidthPt + padX);
  const bottom = Math.min(pageHeightPt, y1 * pageHeightPt + padY);

  const box = {
    left: Math.round(left * scale),
    top: Math.round(top * scale),
    width: Math.round((right - left) * scale),
    height: Math.round((bottom - top) * scale),
  };
  return box.width > 0 && box.height > 0 ? box : null;
}

/** The width a crop is upscaled to before the model sees it — the caller does
 *  `Math.max(box.width, MIN_CROP_WIDTH_PX)`; there is no function because that
 *  is not shorter than the expression.
 *
 *  A wide, short opening is the case that forces this: 3500 x 700 at 1:100 is
 *  about 99 x 20pt, which even at 3x renders to roughly 300 x 60 pixels — a
 *  sliver, and a model reading it is guessing. Upscaling is not new information,
 *  but it is the difference between a legible glyph and an artefact.
 *
 *  Never downscales. A large crop is already legible and resampling it down only
 *  destroys the thing being read. */
export const MIN_CROP_WIDTH_PX = 900;
