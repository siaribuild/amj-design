// Steps 4 and 5 of the SKILL.md method: rasterise only what matters, then crop
// to one opening. This is the input the vision model actually reads.
//
// NO POPPLER. The container scaffold assumes pdftoppm + PIL because that is what
// the method was proven with, but the same two steps run in Node on the unpdf
// already in this Worker's bundle, plus a canvas. That matters for hosting: the
// job needs a container for pixels, not for Python.
//
//   node scripts/research/plan-geometry/render.mjs 6 7      → p6.png, p7.png
//   node scripts/research/plan-geometry/render.mjs 6 --crop 1000 150 1600 900
//
// @napi-rs/canvas is NOT a dependency of this repo and must not become one for
// this. Install it where unpdf can resolve it, or pass your own canvasImport.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderPageAsImage } from "unpdf";

const here = dirname(fileURLToPath(import.meta.url));
const PDF = join(here, "plans.pdf");
const DPI_SCALE = 3;                    // ~216 DPI at A3: legible, and not huge

const args = process.argv.slice(2);
const cropAt = args.indexOf("--crop");
const pages = (cropAt === -1 ? args : args.slice(0, cropAt)).map(Number);
const box = cropAt === -1 ? null : args.slice(cropAt + 1, cropAt + 5).map(Number);

const src = await readFile(PDF);
for (const pageNo of pages) {
  // A fresh copy per call: pdf.js transfers the buffer to its worker and detaches
  // it, so reusing one silently fails on the second page.
  const png = await renderPageAsImage(Uint8Array.from(src), pageNo, {
    scale: DPI_SCALE,
    // pdf.js reaches for Path2D/DOMMatrix as globals, not as imports.
    canvasImport: () => import("@napi-rs/canvas"),
  });
  let out = Buffer.from(png);
  let name = `p${pageNo}.png`;
  if (box) {
    const sharp = (await import("sharp")).default;
    const [left, top, width, height] = box;
    out = await sharp(out).extract({ left, top, width, height })
      .resize({ width: Math.round(width * 1.6) }).png().toBuffer();
    name = `p${pageNo}-crop.png`;
  }
  await writeFile(join(here, name), out);
  console.log(`${name}  ${(out.length / 1e6).toFixed(2)} MB`);
}
