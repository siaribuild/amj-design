// Steps 4 and 5 of the method: rasterise the page, cut out the openings.
//
// This file is the container's whole job. It makes no judgements — which pages,
// which rectangles, and what to do about an opening that has no rectangle are
// all decided in the Worker (worker/lib/drawing/container.ts), because that is
// where they can be tested and where the retry and escalation machinery lives.
//
// NO POPPLER, NO PYTHON. The scaffold this replaces was built around pdftoppm
// and PIL because that is the toolchain the method was proven with. Both steps
// run on the unpdf already in the Worker's bundle plus a canvas, which is what
// keeps ONE pdf.js across the codebase — so the crop box here and the geometric
// second opinion in the Worker share a coordinate space, and verification is a
// subtraction rather than a reconciliation.
import { renderPageAsImage } from "unpdf";
import sharp from "sharp";

/** Upscale small crops so the model reads glyphs rather than artefacts. Must
 *  match MIN_CROP_WIDTH_PX in worker/lib/drawing/crop.ts, which carries the
 *  reasoning: a 3500 x 700 opening renders to roughly 300 x 60 pixels. */
const MIN_CROP_WIDTH_PX = 900;

/** Driving pdf.js's canvas directly was tried and does not work here: its own
 *  internal canvas factory resolves @napi-rs/canvas from unpdf's location and
 *  fails with "not available in this environment", after separately needing
 *  Path2D and DOMMatrix installed as globals. `renderPageAsImage` takes the
 *  import as a hook and is the supported seam. Found by running it, not by
 *  reading it. */
const canvasImport = () => import("@napi-rs/canvas");

/**
 * @param {Uint8Array} pdfBytes
 * @param {{scale: number, pages: {pageNo: number, crops: {id: string, box: {left:number,top:number,width:number,height:number}}[]}[]}} request
 * @returns {Promise<{crops: {id: string, png: Buffer, width: number, height: number}[], failures: {id: string, reason: string}[]}>}
 */
export async function renderCrops(pdfBytes, request) {
  const crops = [];
  const failures = [];

  for (const page of request.pages) {
    let pageImage;
    try {
      // A fresh copy per page: pdf.js transfers the buffer to its worker and
      // detaches it, so reusing one silently fails from the second page on.
      pageImage = Buffer.from(
        await renderPageAsImage(Uint8Array.from(pdfBytes), page.pageNo, { scale: request.scale, canvasImport }),
      );
    } catch (err) {
      // One unrenderable page costs its own openings, never the document.
      for (const c of page.crops) failures.push({ id: c.id, reason: `page_render_failed: ${err.message}` });
      continue;
    }

    for (const { id, box } of page.crops) {
      try {
        // Flattened onto white before cropping: a PDF renders on transparent,
        // and a transparent crop becomes black-on-black wherever it is shown.
        const png = await sharp(pageImage)
          .flatten({ background: "#ffffff" })
          .extract(box)
          .resize({ width: Math.max(box.width, MIN_CROP_WIDTH_PX) })
          .png()
          .toBuffer();
        const { width, height } = await sharp(png).metadata();
        crops.push({ id, png, width, height });
      } catch (err) {
        // sharp throws when a rectangle runs outside the image. The Worker
        // clamps before sending, so this is a contract breach worth naming
        // rather than a condition to paper over.
        failures.push({ id, reason: `crop_failed: ${err.message}` });
      }
    }
  }
  return { crops, failures };
}
