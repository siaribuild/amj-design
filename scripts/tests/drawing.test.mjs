// Drawing recognition — the pure layers, tested without a document.
//
// Stages B, C and D take geometry and return findings with no I/O and no model
// call, which is exactly what makes them testable here. The fixtures below are
// hand-built from the owner's own supplied sheets, so a failure means the reader
// disagrees with a real drawing rather than with an invented one.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("drawing");
const outfile = join(runDir, "drawing-bundle.mjs");
await build({
  stdin: {
    contents: `export * from ${p("worker/lib/drawing/index.ts")};`,
    resolveDir: projectRoot, sourcefile: "drawing-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const M = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
test.after(async () => { if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir); });

const seg = (ax, ay, bx, by, extra = {}) =>
  ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, dashed: false, width: 1, groupId: null, ...extra });

// ─── The join key ─────────────────────────────────────────────────────────────
// The live defect was that applyPlanContext joined a plan's opening ref to a
// schedule row by exact string equality, so "W-04" against "W04" silently
// dropped that opening's room and orientation. It is fixed at the call site,
// with the normaliser the rest of the pipeline already uses.

test("THE join primitive is normalizeOpeningRef, and this module defines no rival", () => {
  // A second normaliser is not half a fix, it is a new bug: this module used to
  // export normalizeTag, which mapped "W04" to "W4" while normalizeOpeningRef
  // maps it to "W04". They agree on unpadded refs and diverge on exactly the
  // padded sets that motivated the work. One key, or none.
  assert.equal(M.normalizeTag, undefined, "normalizeTag must not come back");
  assert.equal(M.looksLikeSheetRef, undefined, "nor the guard that only existed to serve it");
});

test("the call site actually normalises — the defect, pinned", async () => {
  // Reads the source rather than the behaviour because applyPlanContext needs a
  // whole extraction model to invoke. The assertion that matters is that the
  // Map is not keyed on the raw string, which is what the bug WAS.
  const src = await readFile(join(projectRoot, "worker/lib/ai/pipeline.ts"), "utf8");
  const join_ = src.slice(src.indexOf("const byRef = new Map("), src.indexOf("const byRef = new Map(") + 400);
  assert.match(join_, /normalizeOpeningRef\(opening\.ref\)/, "the context side is normalised");
  assert.match(join_, /normalizeOpeningRef\(opening\.externalRef\)/, "and so is the model side");
});

test("normalizeSheetId collapses the tag's second line to the title block's", () => {
  for (const raw of ["S08", "S-08", "S 8", "s08"]) assert.equal(M.normalizeSheetId(raw), "S8", raw);
  assert.equal(M.normalizeSheetId("S09"), "S9");
  assert.equal(M.normalizeSheetId("A-101"), "A101");
  assert.equal(M.normalizeSheetId("BED 3"), null);
});

test("normalizeSheetId is shape-only, and a caller must already know it is a sheet", () => {
  // Stated as a test because it is a REAL limitation and the next person to
  // reach for this will otherwise assume it validates. A room label and an
  // Australian Standard both normalise perfectly happily.
  assert.equal(M.normalizeSheetId("WC 1"), "WC1");
  assert.equal(M.normalizeSheetId("AS 2047"), "AS2047");
  assert.equal(M.normalizeSheetId("W04"), "W4", "even a window tag — position is the discriminator");
});

test("azimuthToOrientation lands in the vocabulary the platform already uses", () => {
  assert.equal(M.azimuthToOrientation(0), "N");
  assert.equal(M.azimuthToOrientation(90), "E");
  assert.equal(M.azimuthToOrientation(181), "S");
  assert.equal(M.azimuthToOrientation(359), "N", "wraps");
  assert.equal(M.azimuthToOrientation(null), null);
});

// ─── Geometry ─────────────────────────────────────────────────────────────────

test("a mullion drawn as two lines collapses to one", () => {
  // THE most consequential cleanup in the reader. CAD draws a mullion as a pair
  // of parallel lines — the section thickness of the frame member. Left
  // unmerged, every mullion becomes two and a three-panel window reads as five.
  const frameWidth = 300;
  const pair = [seg(100, 0, 100, 200), seg(103, 0, 103, 200)];
  const merged = M.collapseParallel(pair, 0.015 * frameWidth);
  assert.equal(merged.length, 1, "one mullion, not two");
  assert.equal(Math.round(merged[0].a.x), 102, "on the mean line of the pair");

  // …but two genuinely separate mullions must survive as two.
  const separate = [seg(100, 0, 100, 200), seg(200, 0, 200, 200)];
  assert.equal(M.collapseParallel(separate, 0.015 * frameWidth).length, 2);
});

test("collapseParallel will not swallow a near line that does not overlap", () => {
  // A short symbol stroke that happens to sit near a mullion's x but nowhere
  // near it in y is a different thing entirely.
  const segs = [seg(100, 0, 100, 200), seg(102, 400, 102, 460)];
  assert.equal(M.collapseParallel(segs, 5).length, 2);
});

test("a dashed member survives the merge", () => {
  // Dashed means "opens away from the viewer" under the default convention, so
  // discarding it during cleanup would silently invert a symbol's meaning.
  const merged = M.collapseParallel([seg(10, 0, 10, 100), seg(12, 0, 12, 100, { dashed: true })], 5);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].dashed, true, "the observation is kept, not averaged away");
});

test("circleFit accepts a tag circle and rejects a rounded rectangle", () => {
  const circle = Array.from({ length: 16 }, (_, i) => {
    const t = (i / 16) * Math.PI * 2;
    return { x: 50 + 10 * Math.cos(t), y: 50 + 10 * Math.sin(t) };
  });
  const fit = M.circleFit(circle);
  assert.ok(fit, "a circle is a circle");
  assert.equal(Math.round(fit.r), 10);
  assert.ok(fit.variance < 0.03);

  const rect = [
    { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 0, y: 10 },
    { x: 0, y: 5 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 40, y: 5 },
  ];
  assert.equal(M.circleFit(rect), null, "an oblong is not a tag");
});

test("edgeOf names the apex edge, with page-space y increasing upward", () => {
  const box = { x0: 0, y0: 0, x1: 100, y1: 50 };
  // The VISUAL top of a panel is the HIGH y in page space. Getting this backwards
  // turns every awning into a hopper.
  assert.equal(M.edgeOf(box, { x: 50, y: 50 }), "top");
  assert.equal(M.edgeOf(box, { x: 50, y: 0 }), "bottom");
  assert.equal(M.edgeOf(box, { x: 0, y: 25 }), "left");
  assert.equal(M.edgeOf(box, { x: 100, y: 25 }), "right");
  assert.equal(M.edgeOf(box, { x: 50, y: 25 }), null, "the middle is not an edge");
});

test("toRegion flips y exactly once", () => {
  // Page space is origin-bottom-left; every consumer of a region is a browser,
  // which is origin-top-left. Flipping at the call site is how it gets flipped
  // twice and a crop lands on the wrong half of the sheet.
  const r = M.toRegion({ x0: 0, y0: 0, x1: 50, y1: 25 }, 100, 100);
  assert.deepEqual(r, [0, 0.75, 0.5, 1], "a box at the page's BOTTOM is high in region y");
});

test("isVertical tolerates real CAD output", () => {
  assert.equal(M.isVertical(seg(0, 0, 0, 100)), true);
  assert.equal(M.isVertical(seg(0, 0, 2, 100)), true, "89 degrees is still a mullion");
  assert.equal(M.isVertical(seg(0, 0, 100, 100)), false, "a diagonal is a symbol, not a mullion");
});

// ─── Interpretation ───────────────────────────────────────────────────────────

test("v1 claims only the three convention-independent classes", () => {
  const obs = (o) => ({
    marks: "none", apexEdge: null, apexCount: null, dashed: null,
    arrowAxis: null, arrowDir: null, midRail: false, legendText: null, clarity: 1, ...o,
  });
  // Absence of marks needs no convention to read.
  assert.equal(M.classify(obs({ marks: "none" })).klass, "fixed");
  // A horizontal arrow is a distinct glyph — it cannot be confused with a sash.
  assert.equal(M.classify(obs({ marks: "arrows", arrowAxis: "horizontal" })).klass, "sliding");
  // Any chevron is operable; WHICH operable family comes from the schedule's
  // type column, which is text and is not a convention.
  assert.equal(M.classify(obs({ marks: "diagonals", apexEdge: "top" })).klass, "operable");
  assert.equal(M.classify(obs({ marks: "louvre_bars" })).klass, "operable");
});

test("the operable family is refined ONLY once a profile is confirmed", () => {
  const diagonals = (apexEdge, extra = {}) => ({
    marks: "diagonals", apexEdge, apexCount: 1, dashed: false,
    arrowAxis: null, arrowDir: null, midRail: false, legendText: null, clarity: 1, ...extra,
  });
  const unconfirmed = { ...M.DEFAULT_PROFILE, confirmed: false };
  assert.equal(M.refineOperable(diagonals("top"), unconfirmed), null,
    "an unconfirmed profile may read, but may not name a family");

  // Confirmed, apex-means-hinge: the V points at the hinge, so apex at the top
  // is a top-hung sash.
  assert.equal(M.refineOperable(diagonals("top"), M.DEFAULT_PROFILE), "awning");
  assert.equal(M.refineOperable(diagonals("bottom"), M.DEFAULT_PROFILE), "hopper");
  assert.equal(M.refineOperable(diagonals("left"), M.DEFAULT_PROFILE), "casement");

  // A practice that points the apex at the OPENING edge inverts the vertical
  // pair — the same drawing, the opposite window.
  const inverted = { ...M.DEFAULT_PROFILE, apexMeans: "opening_edge" };
  assert.equal(M.refineOperable(diagonals("top"), inverted), "hopper");
  assert.equal(M.refineOperable(diagonals("bottom"), inverted), "awning");
});

test("a meeting rail plus two apexes is a double-hung, under either convention", () => {
  const dh = {
    marks: "diagonals", apexEdge: "top", apexCount: 2, dashed: false,
    arrowAxis: null, arrowDir: null, midRail: true, legendText: null, clarity: 1,
  };
  assert.equal(M.refineOperable(dh, M.DEFAULT_PROFILE), "double-hung");
  assert.equal(M.refineOperable(dh, { ...M.DEFAULT_PROFILE, apexMeans: "opening_edge" }), "double-hung");
});

test("the default profile is the one the app already DRAWS with", () => {
  // Elevation.tsx renders composites to this same legend. If the reader and the
  // writer ever disagree, the app would render a window differently from the
  // drawing it was read from — and both would look internally consistent.
  assert.equal(M.DEFAULT_PROFILE.apexMeans, "hinge");
  assert.equal(M.DEFAULT_PROFILE.defaultViewBasis, "outside");
  assert.equal(M.DEFAULT_PROFILE.confirmed, true);
});

test("the mismatch quorum is a set-level judgement, not a per-window one", () => {
  // Three openings disagreeing IN THE SAME DIRECTION is one systematic error,
  // not three independent ones — and the response is to withdraw the whole set
  // and ask once, never to auto-flip.
  assert.equal(M.MISMATCH_QUORUM, 3);
});

// ─── Stage 2: the crop box the vision model is actually shown ─────────────────
// The container renders and crops what it is GIVEN, so this arithmetic is the
// whole risk: a box that is wrong here shows the model the wrong window, and a
// wrong read is a priced window nobody drew. Region is the normalised 0..1
// top-left form already stored in evidence_items.region_json.

test("a region becomes a pixel box at the render scale, padded so the sheet's own labels survive", () => {
  // 600x400pt page, the middle quarter, rendered at 3x.
  const box = M.cropBoxFor([0.25, 0.25, 0.5, 0.5], 600, 400, 3);
  // Unpadded: x 150..300pt and y 100..200pt, so left 450, top 300, 450 x 300 px.
  // Padding is proportional, so the box grows around the same centre and the
  // centre does not move — which is what makes the crop still be of the window.
  assert.ok(box.width > 450 && box.height > 300, "padded outward");
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  assert.ok(Math.abs(cx - (450 + 450 / 2)) < 1, `centre held on x, got ${cx}`);
  assert.ok(Math.abs(cy - (300 + 300 / 2)) < 1, `centre held on y, got ${cy}`);
  assert.ok(Number.isInteger(box.left) && Number.isInteger(box.width), "pixels are integers");
});

test("a region against the page edge is clamped, never negative and never past the page", () => {
  // Top-left corner: padding would take it off the sheet.
  const tl = M.cropBoxFor([0, 0, 0.1, 0.1], 600, 400, 3);
  assert.equal(tl.left, 0);
  assert.equal(tl.top, 0);
  // Bottom-right corner: padding would run past it.
  const br = M.cropBoxFor([0.9, 0.9, 1, 1], 600, 400, 3);
  assert.ok(br.left + br.width <= 600 * 3, "inside the page on x");
  assert.ok(br.top + br.height <= 400 * 3, "inside the page on y");
});

test("a degenerate or inverted region yields no crop rather than a bad one", () => {
  // sharp.extract throws on a zero or negative rectangle, and a caller that
  // guesses one shows the model an arbitrary part of the sheet.
  assert.equal(M.cropBoxFor([0.5, 0.5, 0.5, 0.5], 600, 400, 3), null, "zero area");
  assert.equal(M.cropBoxFor([0.6, 0.2, 0.4, 0.8], 600, 400, 3), null, "x inverted");
  assert.equal(M.cropBoxFor([0.2, 0.9, 0.8, 0.1], 600, 400, 3), null, "y inverted");
  assert.equal(M.cropBoxFor([0.2, 0.2, 0.8, 0.8], 0, 400, 3), null, "no page");
});
