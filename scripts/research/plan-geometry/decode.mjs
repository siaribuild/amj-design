// Stage A, rebuilt: PDF page -> line segments in page space.
import { readFile } from "node:fs/promises";
import { getDocumentProxy, getResolvedPDFJS } from "unpdf";

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const DRAW = { MOVE: 0, LINE: 1, CURVE: 2, QUAD: 3, CLOSE: 4 };
const ARITY = { 0: 2, 1: 2, 2: 6, 3: 4, 4: 0 };

export async function decodePage(pdfPath, pageNo) {
  const doc = await getDocumentProxy(new Uint8Array(await readFile(pdfPath)));
  const { OPS } = await getResolvedPDFJS();
  const page = await doc.getPage(pageNo);
  const ol = await page.getOperatorList();

  const segs = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let lineWidth = 1;
  const lwStack = [];
  let dashed = false;
  const dashStack = [];

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i];
    const a = ol.argsArray[i];
    if (fn === OPS.save) { stack.push(ctm); lwStack.push(lineWidth); dashStack.push(dashed); continue; }
    if (fn === OPS.restore) { ctm = stack.pop() ?? ctm; lineWidth = lwStack.pop() ?? lineWidth; dashed = dashStack.pop() ?? dashed; continue; }
    if (fn === OPS.transform) { ctm = mul(ctm, a); continue; }
    if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); lwStack.push(lineWidth); dashStack.push(dashed); if (a?.[0]) ctm = mul(ctm, a[0]); continue; }
    if (fn === OPS.paintFormXObjectEnd) { ctm = stack.pop() ?? ctm; lineWidth = lwStack.pop() ?? lineWidth; dashed = dashStack.pop() ?? dashed; continue; }
    if (fn === OPS.setLineWidth) { lineWidth = a[0]; continue; }
    if (fn === OPS.setDash) { dashed = Array.isArray(a[0]) && a[0].length > 0; continue; }
    if (fn !== OPS.constructPath && fn !== OPS.rawFillPath) continue;

    const paintOp = fn === OPS.rawFillPath ? OPS.fill : a[0];
    // A clip path is not drawn line-work. Excluding it is the difference between
    // reading a drawing and reading the window the drawing is cropped to.
    if (paintOp === OPS.clip || paintOp === OPS.eoClip || paintOp === OPS.endPath) continue;

    const raw = a[fn === OPS.rawFillPath ? 0 : 1];
    const subpaths = Array.isArray(raw?.[0]) || ArrayBuffer.isView(raw?.[0]) ? raw : [raw];
    for (const path of subpaths) {
      let cx = 0, cy = 0, sx = 0, sy = 0;
      for (let k = 0; k < path.length;) {
        const cmd = path[k++];
        const n = ARITY[cmd];
        if (n === undefined) break;
        const args = [];
        for (let j = 0; j < n; j++) args.push(path[k++]);
        if (cmd === DRAW.MOVE) { [cx, cy] = args; sx = cx; sy = cy; continue; }
        if (cmd === DRAW.CLOSE) {
          if (cx !== sx || cy !== sy) segs.push(seg(ctm, cx, cy, sx, sy, lineWidth, dashed, paintOp));
          cx = sx; cy = sy; continue;
        }
        // A curve contributes its chord. This pass wants mullions and rails,
        // which are straight; a chord is enough to keep the path connected and
        // is filtered out downstream by the straightness test anyway.
        const ex = args[n - 2], ey = args[n - 1];
        segs.push(seg(ctm, cx, cy, ex, ey, lineWidth, dashed, paintOp));
        cx = ex; cy = ey;
      }
    }
  }
  const vp = page.getViewport({ scale: 1 });
  page.cleanup();
  return { segs, width: vp.width, height: vp.height };
}

function seg(ctm, x0, y0, x1, y1, lw, dashed, paintOp) {
  const [ax, ay] = apply(ctm, x0, y0);
  const [bx, by] = apply(ctm, x1, y1);
  return { ax, ay, bx, by, lw, dashed, paintOp };
}

/** Which pages are ELEVATIONS.
 *
 *  Read from the text layer, not hardcoded, because the sheet a window is drawn
 *  face-on is the only sheet where its width means anything: a floor plan holds
 *  a rectangle of the same width at an unrelated depth for every opening in the
 *  house, and treating those as candidates inverts the answer.
 *
 *  Note this is deliberately NOT the shipped classifyPageRoles heuristic, which
 *  requires two plan signals and scores these sheets at one — see §4 of the
 *  design. An elevation callout on its own is sufficient and specific. */
export async function elevationPages(pdfPath) {
  const doc = await getDocumentProxy(new Uint8Array(await readFile(pdfPath)));
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const text = (await page.getTextContent()).items.map((i) => i.str).join(" ");
    if (/\bELEVATION\s+[A-D]\b/i.test(text)) pages.push(p);
    page.cleanup();
  }
  return pages;
}
