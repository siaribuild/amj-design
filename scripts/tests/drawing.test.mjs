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
import { readFileSync } from "node:fs";
import { makeRunDir, projectRoot, removeRunDir , workerdBuiltins } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("drawing");
const outfile = join(runDir, "drawing-bundle.mjs");
await build({
  stdin: {
    contents: `export * from ${p("worker/lib/drawing/index.ts")};`,
    resolveDir: projectRoot, sourcefile: "drawing-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  plugins: [workerdBuiltins],
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

test("a region outside 0..1 is refused, because clamping it would silently mean 'the whole sheet'", () => {
  // Region is FRACTIONS of the page. Out of range means the producer misread the
  // convention — and Pass A's regions come from a vision model, so this is
  // untrusted input, not an internal invariant.
  //
  // Clamping is not a defence here, it is the bug: [0.2, 0.2, 1.4, 0.6] clamps to
  // the full page width, so the model is handed the entire elevation sheet as if
  // it were one window, and describes it. Refusing costs one `not read`, which
  // the fallback already covers.
  for (const bad of [
    [-0.1, 0.2, 0.5, 0.6],
    [0.2, -0.1, 0.5, 0.6],
    [0.2, 0.2, 1.4, 0.6],
    [0.2, 0.2, 0.5, 1.2],
  ]) {
    assert.equal(M.cropBoxFor(bad, 600, 400, 3), null, `out of range: ${JSON.stringify(bad)}`);
  }
  // The full page is in range and legitimate — a sheet holding one drawing.
  assert.ok(M.cropBoxFor([0, 0, 1, 1], 600, 400, 3), "0..1 inclusive is valid");
});

// ─── Stage 2: what the Worker asks the container for ──────────────────────────
// The container is a dumb pair of hands: it renders pages and cuts rectangles.
// Every judgement — which openings, which pages, what to do about one that has
// no box — is made here, where it can be tested without Docker.

test("crops are grouped by page, so a page is rendered once however many openings sit on it", () => {
  const req = M.buildCropRequest([
    { id: "W1", pageNo: 6, box: { left: 10, top: 10, width: 50, height: 50 } },
    { id: "W4", pageNo: 7, box: { left: 20, top: 20, width: 50, height: 50 } },
    { id: "W14", pageNo: 6, box: { left: 30, top: 30, width: 50, height: 50 } },
  ], 3);
  assert.equal(req.pages.length, 2, "two pages, three crops");
  assert.deepEqual(req.pages.map((p) => p.pageNo), [6, 7], "ascending, so a retry is byte-identical");
  assert.deepEqual(req.pages[0].crops.map((c) => c.id), ["W1", "W14"]);
  assert.equal(req.scale, 3);
});

test("an opening with no box is a gap, and never reaches the container", () => {
  // cropBoxFor returns null when it will not vouch for a region. Sending that on
  // as a default rectangle is exactly the substitution it refused to make.
  const req = M.buildCropRequest([
    { id: "W1", pageNo: 6, box: { left: 10, top: 10, width: 50, height: 50 } },
    { id: "D1", pageNo: 6, box: null },
  ], 3);
  assert.deepEqual(req.pages[0].crops.map((c) => c.id), ["W1"]);
  assert.deepEqual(req.gaps, ["D1"], "reported, not dropped silently");
});

test("a request with nothing to crop is not a request", () => {
  const req = M.buildCropRequest([{ id: "D1", pageNo: 6, box: null }], 3);
  assert.equal(req.pages.length, 0);
  assert.deepEqual(req.gaps, ["D1"]);
  assert.equal(req.pages.length, 0, "nothing to ask for: no round trip, no cold start, no bill");
});

test("the number of crops in one call is bounded", () => {
  // The response carries PNG bytes for every crop. A document with hundreds of
  // openings would build a response the Worker cannot hold in 128 MB, so the
  // caller batches rather than discovering the limit in production.
  const many = Array.from({ length: M.MAX_CROPS_PER_CALL + 5 }, (_, i) => ({
    id: `W${i}`, pageNo: 6, box: { left: 0, top: 0, width: 10, height: 10 },
  }));
  const req = M.buildCropRequest(many, 3);
  const total = req.pages.reduce((n, p) => n + p.crops.length, 0);
  assert.equal(total, M.MAX_CROPS_PER_CALL);
  assert.equal(req.deferred.length, 5, "the rest is named, for the next call");
});


// ─── The container manifest ───────────────────────────────────────────────────

/** npm's caret, including the rule it is always got wrong: with a ZERO major,
 *  `^0.1.69` pins the MINOR and means `>=0.1.69 <0.2.0`, so 0.2.0 is NOT
 *  compatible. The general rule is that the caret pins everything up to and
 *  including the leftmost non-zero component.
 *
 *  Written out rather than assumed because the first version of this guard
 *  checked only the major, and would therefore have waved through exactly the
 *  0.2.0 case that npm refuses — a guard that approves the thing it exists to
 *  catch. */
const satisfiesCaret = (version, range) => {
  const parts = (v) => v.replace(/^\D*/, "").split(".").map(Number);
  const v = parts(version), r = parts(range);
  if (v.length < 3 || r.length < 3 || [...v, ...r].some(Number.isNaN)) return false;
  const firstNonZero = r.findIndex((n) => n > 0);
  const pinnedThrough = firstNonZero === -1 ? r.length - 1 : firstNonZero;
  for (let i = 0; i <= pinnedThrough; i++) if (v[i] !== r[i]) return false;
  for (let i = 0; i < 3; i++) {
    if (v[i] > r[i]) return true;
    if (v[i] < r[i]) return false;
  }
  return true;
};

test("the caret guard itself is right about npm's zero-major rule", () => {
  // The table is the point. Without it the guard is a claim about semver rather
  // than a check on one.
  const cases = [
    ["0.1.100", "^0.1.69", true, "the pin in use"],
    ["0.1.69", "^0.1.69", true, "the floor itself"],
    ["0.1.65", "^0.1.69", false, "below the floor — the break this guard was written for"],
    ["0.2.0", "^0.1.69", false, "a zero major pins the MINOR; npm refuses this and the first guard did not"],
    ["1.0.0", "^0.1.69", false, "a different major"],
    ["1.9.0", "^1.2.3", true, "a non-zero major pins only the major"],
    ["2.0.0", "^1.2.3", false, "…and stops at the next one"],
    ["1.2.2", "^1.2.3", false, "below the floor"],
  ];
  for (const [version, range, want, why] of cases) {
    assert.equal(satisfiesCaret(version, range), want, `${version} vs ${range}: ${why}`);
  }
});

test("the container pins a canvas inside the range unpdf demands", async () => {
  // The image is not buildable here — there is no Docker on every machine that
  // touches this — so a dependency conflict inside the Dockerfile is invisible
  // until a deploy. It happened: @napi-rs/canvas was pinned at 0.1.65 while
  // unpdf declares peerOptional ^0.1.69, and `npm ci` refuses that outright.
  //
  // unpdf's own package.json blocks the ./package.json subpath, so it is read
  // rather than required.
  const container = JSON.parse(
    await readFile(join(projectRoot, "containers/plan-parse/package.json"), "utf8"),
  );
  const unpdf = JSON.parse(
    await readFile(join(projectRoot, "node_modules/unpdf/package.json"), "utf8"),
  );

  // The container and the Worker must read PDFs with the same library at the
  // same version, or the crop box and the second opinion stop sharing a
  // coordinate space, which is the whole reason this is Node.
  const repo = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
  assert.equal(container.dependencies.unpdf, repo.dependencies.unpdf, "one pdf.js, one version");

  const want = unpdf.peerDependencies?.["@napi-rs/canvas"];
  assert.ok(want, "unpdf still declares a canvas peer; if it stopped, this test is the stale thing");
  // satisfiesCaret understands one range shape. If unpdf moves to `>=x`, a
  // compound `a || b`, or a hyphen range, judging it as a caret would be a
  // confident wrong answer — so refuse to judge instead, and say why.
  assert.match(
    want, /^\^\d+\.\d+\.\d+$/,
    `unpdf's canvas peer is now "${want}", which is not a plain caret. Teach satisfiesCaret `
    + `that shape before trusting this guard again.`,
  );
  const pinned = container.dependencies["@napi-rs/canvas"];
  assert.ok(
    satisfiesCaret(pinned, want),
    `pinned ${pinned} is outside unpdf's ${want} — npm ci will refuse it`,
  );
});

test("the container image installs from a lockfile, not from ranges", async () => {
  // A build that resolves ranges on the day it runs is not the build that was
  // tested, and this one cannot be tested locally at all.
  const dockerfile = await readFile(join(projectRoot, "containers/plan-parse/Dockerfile"), "utf8");
  // Instructions only. The comments explain why it is `npm ci` and say the words
  // "npm install" while doing so, which a naive scan reads as the thing itself.
  const instructions = dockerfile
    .split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).join("\n");
  assert.match(instructions, /npm ci\b/, "npm ci");
  assert.doesNotMatch(instructions, /npm install\b/, "never npm install");
  assert.match(instructions, /COPY package\.json package-lock\.json/, "the lockfile has to be in the image");
  const lock = JSON.parse(await readFile(join(projectRoot, "containers/plan-parse/package-lock.json"), "utf8"));
  for (const needed of ["@img/sharp-linux-x64", "@napi-rs/canvas-linux-x64-gnu"]) {
    assert.ok(
      lock.packages[`node_modules/${needed}`],
      `${needed} is missing from the lockfile — the image would install no binary for its own platform`,
    );
  }
});

test("the container refuses a request it should not attempt", async () => {
  // Pure, so it lives in its own module and is tested here rather than only
  // inside an image nobody on this machine can build. The container re-validates
  // what the Worker sends on purpose: "trusted" and "unchecked" are different
  // things, and the container is the only thing standing between a malformed
  // box and a native renderer.
  const { badRequest } = await import(
    pathToFileURL(join(projectRoot, "containers/plan-parse/validate.mjs")).href
  );
  const ok = { scale: 3, pages: [{ pageNo: 6, crops: [{ id: "W1", box: { left: 0, top: 0, width: 10, height: 10 } }] }] };
  assert.equal(badRequest(ok), null);

  const box = { left: 0, top: 0, width: 10, height: 10 };
  const cases = [
    [null, "not an object"],
    [{ ...ok, scale: 0 }, "scale"],
    [{ ...ok, scale: 500 }, "scale"],                         // a huge canvas is an OOM, not a render
    [{ ...ok, pages: [] }, "pages"],
    [{ ...ok, pages: [{ pageNo: 0, crops: ok.pages[0].crops }] }, "pageNo"],
    [{ ...ok, pages: [{ pageNo: 1, crops: [] }] }, "crops"],
    [{ ...ok, pages: [{ pageNo: 1, crops: [{ id: "", box }] }] }, "id"],
    [{ ...ok, pages: [{ pageNo: 1, crops: [{ id: "W1", box: { ...box, width: 0 } }] }] }, "box"],
    [{ ...ok, pages: [{ pageNo: 1, crops: [{ id: "W1", box: { ...box, left: -1 } }] }] }, "box"],
    [{ ...ok, pages: [{ pageNo: 1, crops: [{ id: "W1", box: { ...box, width: 1.5 } }] }] }, "box"],
    // Bounded, because the Worker's own cap is not a thing the container can see.
    [{ ...ok, pages: Array.from({ length: 100 }, () => ({ pageNo: 1, crops: [{ id: "W1", box }] })) }, "pages"],
    [{ ...ok, pages: [{ pageNo: 1, crops: Array.from({ length: 200 }, (_, i) => ({ id: `W${i}`, box })) }] }, "crops"],
  ];
  for (const [job, expect] of cases) {
    const why = badRequest(job);
    assert.ok(why, `should have been refused: ${JSON.stringify(job).slice(0, 60)}`);
    assert.match(why, new RegExp(expect, "i"), `refused for the right reason: got "${why}"`);
  }
});

test("every file the container imports is actually copied into the image", async () => {
  // The class, not the instance. server.mjs gained an import of ./validate.mjs
  // and the Dockerfile still copied two files, so the image would have started
  // and immediately died on a missing module — invisible here, because there is
  // no Docker to run it. COPY is explicit per-file on purpose (never COPY . .,
  // which would sweep rendered customer crops into the image), and explicit
  // lists go stale.
  const dir = join(projectRoot, "containers/plan-parse");
  const dockerfile = await readFile(join(dir, "Dockerfile"), "utf8");
  const copied = new Set(
    [...dockerfile.matchAll(/^COPY\s+(.+?)\s+\.\/\s*$/gm)]
      .flatMap((m) => m[1].split(/\s+/)),
  );

  const seen = new Set();
  const walk = async (entry) => {
    if (seen.has(entry)) return;
    seen.add(entry);
    const src = await readFile(join(dir, entry), "utf8");
    for (const m of src.matchAll(/from\s+"\.\/([^"]+)"/g)) {
      assert.ok(copied.has(m[1]), `${entry} imports ./${m[1]}, which the Dockerfile does not COPY`);
      await walk(m[1]);
    }
  };
  // The CMD's entry point, and everything it reaches.
  assert.match(dockerfile, /CMD \["node", "server\.mjs"\]/);
  assert.ok(copied.has("server.mjs"), "the entry point itself");
  await walk("server.mjs");
});

test("the plan-parse container is reachable only through its binding, never a route", () => {
  // Named twice by /security-review as the constraint that makes the container a
  // blast-radius boundary rather than a second public surface. It holds no
  // credentials and re-validates everything it is sent, but an internet-reachable
  // renderer is still a renderer strangers can run.
  //
  // Asserted against the config rather than trusted to a comment, because this is
  // the kind of invariant that is true until someone adds a convenience route.
  const raw = readFileSync(join(projectRoot, "wrangler.jsonc"), "utf8");
  const config = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""));

  const container = config.containers?.find((c) => c.class_name === "PlanParseContainer");
  assert.ok(container, "the container entry exists");
  assert.equal(container.image, "./containers/plan-parse/Dockerfile");
  // basic (1/4 vCPU, 1 GiB), not lite: an A3 sheet at working DPI does not sit
  // comfortably in 256 MiB.
  assert.equal(container.instance_type, "basic");

  const binding = config.durable_objects?.bindings
    ?.find((b) => b.class_name === "PlanParseContainer");
  assert.ok(binding, "reachable through a Durable Object binding");
  // A container-backed DO requires the SQLite storage backend, and a migration
  // tag is a one-way door — the class cannot be renamed without a fresh tag.
  assert.ok(
    config.migrations?.some((m) => m.new_sqlite_classes?.includes("PlanParseContainer")),
    "declared as a new_sqlite_classes migration",
  );

  // THE POINT: no route, no service binding, no hostname reaches it.
  const exposed = JSON.stringify({
    routes: config.routes, route: config.route,
    services: config.services, workers_dev: config.workers_dev,
  });
  assert.doesNotMatch(
    exposed, /PlanParseContainer|PLAN_PARSE|plan-parse/,
    "nothing in routes/services/hostnames names the container",
  );
});

// ─── t1: the Worker's side of the wire ────────────────────────────────────────
// The container parses a JSON header line, a newline, then PDF bytes. Both ends
// of that framing are load-bearing and neither can be checked by types.

test("a crop request frames as one JSON line, a newline, then the PDF unaltered", () => {
  const req = M.buildCropRequest(
    [{ id: "W1", pageNo: 6, box: { left: 1, top: 2, width: 3, height: 4 } }], 3,
  );
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x0a, 0xff, 0x00, 0x0a, 0x42]);
  const body = M.encodeCropRequest(req, pdf);

  const nl = body.indexOf(0x0a);
  const header = JSON.parse(new TextDecoder().decode(body.subarray(0, nl)));
  assert.equal(header.scale, 3);
  assert.deepEqual(header.pages[0].crops.map((c) => c.id), ["W1"]);
  // A PDF contains newlines and 0xFF bytes. The split is on the FIRST newline
  // only, so the payload must survive byte for byte — including its own.
  assert.deepEqual([...body.subarray(nl + 1)], [...pdf], "the PDF is not re-encoded");
  assert.ok(!JSON.stringify(header).includes("gaps") || Array.isArray(header.gaps));
});

test("a response may only speak about openings that were asked for", () => {
  const sent = ["W1", "W4"];
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");

  const ok = M.decodeCropResponse({
    crops: [{ id: "W1", width: 900, height: 918, png }],
    failures: [{ id: "W4", reason: "crop_failed" }],
  }, sent);
  assert.deepEqual(ok.crops.map((c) => c.id), ["W1"]);
  assert.deepEqual([...ok.crops[0].bytes], [0x89, 0x50, 0x4e, 0x47], "base64 decoded, not passed through");
  assert.deepEqual(ok.failures, [{ id: "W4", reason: "crop_failed" }]);

  // An id nobody asked for is the container answering a question it was not
  // asked — a bug or a mixed-up response, and either way it must not be attached
  // to an opening. W99 is not in `sent`.
  assert.throws(
    () => M.decodeCropResponse({ crops: [{ id: "W99", width: 1, height: 1, png }], failures: [] }, sent),
    /W99/,
  );
  // And a reason outside the enum becomes the unknown one, never free text on a
  // staff surface.
  const odd = M.decodeCropResponse(
    { crops: [], failures: [{ id: "W1", reason: "Error: ENOENT /home/node/secret" }] }, sent,
  );
  assert.equal(odd.failures[0].reason, "unknown");
});

test("the upscale floor is the same number on both sides of the wire", async () => {
  // crop.ts sizes the box; render.mjs resizes the crop. They are in different
  // languages, different processes and different images, and nothing but this
  // test makes them agree — a drift means the Worker reasons about a crop the
  // container did not produce.
  const render = await readFile(join(projectRoot, "containers/plan-parse/render.mjs"), "utf8");
  const inContainer = Number(/MIN_CROP_WIDTH_PX\s*=\s*(\d+)/.exec(render)[1]);
  assert.equal(inContainer, M.MIN_CROP_WIDTH_PX, "one floor, two files");
});

test("every opening sent comes back accounted for, or the decoder says which did not", () => {
  // The output spec's §7 rule, at the wire: an opening that could not be read is
  // REPORTED unread, never omitted, "because a silently missing opening is
  // indistinguishable from a house with fewer windows".
  //
  // `crops ?? []` made a 200 carrying `{}` decode as a successful batch of zero,
  // and a partial response drop whatever it did not mention — neither read nor
  // failed, just gone.
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
  const sent = ["W1", "W2", "W3"];

  const partial = M.decodeCropResponse(
    { crops: [{ id: "W1", width: 900, height: 918, png }], failures: [] }, sent,
  );
  assert.deepEqual(partial.crops.map((c) => c.id), ["W1"]);
  assert.deepEqual(
    partial.failures.map((f) => [f.id, f.reason]),
    [["W2", "not_returned"], ["W3", "not_returned"]],
    "the two it said nothing about are named, and distinguishable from a render that failed",
  );

  // A 200 that says nothing at all accounts for nothing at all.
  const empty = M.decodeCropResponse({}, sent);
  assert.equal(empty.crops.length, 0);
  assert.deepEqual(empty.failures.map((f) => f.id), sent, "all three, not zero of three");

  // Wrong TYPE is malformed rather than unaccounted — that is a broken container
  // or something else answering, and it is not a per-opening condition.
  assert.throws(() => M.decodeCropResponse({ crops: "nope", failures: [] }, sent), /crops/);
  assert.throws(() => M.decodeCropResponse({ crops: [], failures: {} }, sent), /failures/);
});

// ─── t2: the two vision skills, validated ─────────────────────────────────────
// Everything below tests the VALIDATOR, not the model. The model is untrusted by
// construction here — JSON mode does not guarantee schema conformance, and the
// interesting failures are the ones that would validate cleanly and be wrong.

const S = await import(`${pathToFileURL(join(runDir, "skills-bundle.mjs")).href}?run=${Date.now()}`)
  .catch(() => null) ?? await (async () => {
    const outfile = join(runDir, "skills-bundle.mjs");
    await build({
      stdin: {
        contents: `export * from ${p("worker/lib/estimator/skills/drawingRead.ts")};`,
        resolveDir: projectRoot, sourcefile: "skills-entry.ts", loader: "ts",
      },
      bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
      plugins: [workerdBuiltins],
    });
    return import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
  })();

test("a composition reading distinguishes NOT STATED from NOT READ", () => {
  // Output spec §4: the two must never collapse. It has already cost this
  // product once — an unreadable symbol was recorded as "no marks", which
  // downstream read as "no operable panel", which is fixed glass, the cheapest
  // thing in the catalogue.
  const stated = S.openingComposition.validate({
    outcome: "not_stated", reason: "the elevation draws the opening but shows no division",
  });
  const unread = S.openingComposition.validate({
    outcome: "not_read", reason: "the crop is a hatch pattern, no frame is discernible",
  });
  assert.equal(stated.outcome, "not_stated");
  assert.equal(unread.outcome, "not_read");
  assert.notEqual(stated.outcome, unread.outcome);

  // And a decline may not smuggle units through beside itself.
  const sneaky = S.openingComposition.validate({
    outcome: "not_read", reason: "unclear", units: [{ operable: true, ratio: 1 }],
  });
  assert.equal(sneaky.outcome, "not_read");
  assert.ok(!("units" in sneaky), "a decline carries no reading");
});

test("a reading that names a family is REFUSED, not quietly stripped", () => {
  // Design §5, the owner's ruling: AMJ makes no hopper, so awning-vs-hopper is a
  // distinction this catalogue cannot express and a chevron cannot settle. The
  // family comes from the schedule, which is text.
  //
  // Stripping the extra key and keeping the rest was the first version, and it is
  // wrong. A model that answers a question it was explicitly told not to answer
  // has not followed the prompt, and the rest of its reading is then of unknown
  // provenance — in particular it may be deriving `operable` from the schedule's
  // "OFFSET AWNING" rather than from a chevron it can see, which destroys the
  // independence that makes agreement with the geometric decoder mean anything.
  // Discarding the word keeps the symptom out of the data and the fault out of
  // sight.
  for (const unit of [
    { operable: true, ratio: 0.5, operation: "awning" },
    { operable: true, ratio: 0.5, type: "fixed glass" },
    { operable: true, ratio: 0.5, family: "casement" },
  ]) {
    const out = S.openingComposition.validate({
      outcome: "read", divisionAxis: "vertical",
      units: [unit, { operable: false, ratio: 0.5 }],
    });
    assert.equal(out, null, `${JSON.stringify(unit)} must be refused outright`);
  }

  // A family volunteered at the top level is the same violation.
  assert.equal(S.openingComposition.validate({
    outcome: "read", divisionAxis: "vertical", family: "awning",
    units: [{ operable: true, ratio: 0.5 }, { operable: false, ratio: 0.5 }],
  }), null);

  // The clean shape still reads.
  const ok = S.openingComposition.validate({
    outcome: "read", divisionAxis: "vertical",
    units: [{ operable: true, ratio: 0.352 }, { operable: false, ratio: 0.648, widthMm: null }],
  });
  assert.equal(ok.outcome, "read");
  assert.deepEqual(ok.units.map((u) => u.operable), [true, false]);
});

test("ratios must be a partition, or the reading is refused", () => {
  const bad = [
    [{ operable: true, ratio: 0.3 }, { operable: false, ratio: 0.3 }],   // sums to 0.6
    [{ operable: true, ratio: 1.4 }, { operable: false, ratio: -0.4 }],  // out of 0..1
    [{ operable: true, ratio: 0.5 }],                                     // a lone 0.5 partitions nothing
  ];
  for (const units of bad) {
    const out = S.openingComposition.validate({ outcome: "read", divisionAxis: "vertical", units });
    assert.notEqual(out?.outcome, "read", `${JSON.stringify(units)} must not validate as read`);
  }
  // …and a real one does, within tolerance for three-decimal rounding.
  const ok = S.openingComposition.validate({
    outcome: "read", divisionAxis: "vertical",
    units: [{ operable: true, ratio: 0.192 }, { operable: false, ratio: 0.615 }, { operable: true, ratio: 0.193 }],
  });
  assert.equal(ok.outcome, "read", "W4's three units sum to 1.000");

  // A single undivided unit at 1.0 IS a reading, and a useful one: it is
  // positive evidence the opening is not split, which can contradict a schedule
  // comment claiming two leaves. Distinct from not_stated, which says the
  // drawing is silent.
  const whole = S.openingComposition.validate({
    outcome: "read", divisionAxis: "vertical", units: [{ operable: false, ratio: 1 }],
  });
  assert.equal(whole.outcome, "read");
  assert.equal(whole.units.length, 1);
});

test("a printed width survives only when the sheet printed it", () => {
  // Output spec §1.2: widthMm ONLY when the drawing dimensions that unit, never
  // back-calculated. A derived figure claims an authority it does not have and
  // the consumer cannot tell it from a real one.
  const out = S.openingComposition.validate({
    outcome: "read", divisionAxis: "vertical",
    units: [{ operable: true, ratio: 0.5, widthMm: 600 }, { operable: false, ratio: 0.5 }],
  });
  assert.equal(out.units[0].widthMm, 600);
  assert.equal(out.units[1].widthMm, null, "absent stays absent, it is not computed");
});

test("the elevation inventory never names or matches anything", () => {
  // Pass A looks at a sheet and reports window-shaped things. Asking it to also
  // say WHICH opening each one is invites it to invent a tag, and a tag is the
  // join key — a wrong one attaches a real reading to the wrong window.
  // REFUSED, not stripped — the same rule as a family name on a composition, for
  // the same reason. A model told "do not identify which window is which" that
  // identifies one anyway has ignored the instruction, and its regions and panel
  // counts may then be shaped by what it thinks each window IS rather than by
  // what is drawn. Discarding the tag keeps that reading and hides the fault.
  assert.equal(S.elevationInventory.validate({
    windows: [
      { region: [0.57, 0.29, 0.62, 0.36], proportion: 1.4, panelCount: 2, panelsWithSymbol: [true, false], tag: "W1" },
    ],
  }), null, "a volunteered tag refuses the sheet");

  const out = S.elevationInventory.validate({
    windows: [
      { region: [0.57, 0.29, 0.62, 0.36], proportion: 1.4, panelCount: 2, panelsWithSymbol: [true, false] },
    ],
  });
  assert.equal(out.windows.length, 1);
  assert.deepEqual(out.windows[0].region, [0.57, 0.29, 0.62, 0.36]);

  // An inverted or out-of-range region is refused, not sorted — the same rule
  // cropBoxFor applies, at the earlier boundary.
  // A bad BOX is different from a prompt violation: it is one window the model
  // could not place, so it drops its own window and the sheet survives.
  const bad = S.elevationInventory.validate({
    windows: [
      { region: [0.6, 0.2, 0.4, 0.8], proportion: 1, panelCount: 2, panelsWithSymbol: [true, false] },
      { region: [0.2, 0.2, 1.4, 0.6], proportion: 1, panelCount: 1, panelsWithSymbol: [false] },
      { region: [0.1, 0.1, 0.2, 0.2], proportion: 1, panelCount: 1, panelsWithSymbol: [false] },
    ],
  });
  assert.equal(bad.windows.length, 1, "only the sane one survives");
});

test("a ratio keeps three decimals, because the shared clamp keeps two", () => {
  // numOrNull rounds to 2dp — right for the areas and millimetres it was built
  // for, wrong for a share of an opening. At 2050mm, 0.01 is 20mm, and the
  // output spec asks for three decimals for exactly that reason: "at 2050mm,
  // 0.001 is 2mm". Passing ratios through the shared clamp threw away the
  // precision the spec asked for, silently, and the reading still looked right.
  const out = S.openingComposition.validate({
    outcome: "read", divisionAxis: "vertical",
    units: [{ operable: true, ratio: 0.352 }, { operable: false, ratio: 0.648 }],
  });
  assert.equal(out.units[0].ratio, 0.352, "not 0.35");
  assert.equal(out.units[1].ratio, 0.648, "not 0.65");

  // Beyond three is false precision and is rounded away, not preserved.
  const noisy = S.openingComposition.validate({
    outcome: "read", divisionAxis: "vertical",
    units: [{ operable: true, ratio: 0.3518273 }, { operable: false, ratio: 0.6481727 }],
  });
  assert.equal(noisy.units[0].ratio, 0.352);
});

test("the refusal policy has no back door — every top-level path enforces it", () => {
  // The policy was applied on the paths I was thinking about and skipped on the
  // two I was not. Both trimmed instead of refusing, which is the behaviour the
  // policy exists to replace: a model that ignored an instruction produced an
  // answer that still looked clean.

  // 1. A DECLINE returned before the top-level key check ran.
  assert.equal(S.openingComposition.validate({
    outcome: "not_read", reason: "unclear", family: "awning",
  }), null, "a decline is not a way past the check");
  assert.equal(S.openingComposition.validate({
    outcome: "not_stated", reason: "undivided", operation: "fixed",
  }), null);

  // …while a well-formed decline, including the schema's required nulls, reads.
  const clean = S.openingComposition.validate({
    outcome: "not_stated", divisionAxis: null, units: [], reason: "the opening is not divided",
  });
  assert.equal(clean.outcome, "not_stated");

  // 2. The INVENTORY checked each window and never its own top level.
  assert.equal(S.elevationInventory.validate({
    windows: [], sheetTag: "A5", family: "awning",
  }), null, "the sheet-level object is checked too");
  assert.deepEqual(S.elevationInventory.validate({ windows: [] }), { windows: [] });
});

test("EVERY skill in this module refuses an unknown top-level key, including ones not yet written", () => {
  // Enumerated rather than listed, so a third skill added later inherits the
  // rule instead of quietly not having it. The policy has now been applied
  // inconsistently twice — once on the decline path, once on the inventory's own
  // top level — and both times it looked fine because the output was trimmed and
  // still well-formed. A rule that depends on remembering it is not a rule.
  const skills = Object.entries(S).filter(([, v]) =>
    v && typeof v === "object" && typeof v.validate === "function" && typeof v.id === "string");
  assert.ok(skills.length >= 2, `expected the module's skills, found ${skills.length}`);

  for (const [name, skill] of skills) {
    // A shape each skill would otherwise accept, plus one key nobody asked for.
    const base = skill.id === "elevation_inventory"
      ? { windows: [] }
      : { outcome: "not_stated", divisionAxis: null, units: [], reason: "" };
    assert.notEqual(skill.validate(base), null, `${name} should accept its own clean shape`);
    assert.equal(
      skill.validate({ ...base, somethingNobodyAskedFor: "awning" }), null,
      `${name} must refuse an unknown top-level key`,
    );
  }
});

// ─── t3: which box is which opening, and does the reading survive scrutiny ────
// Pure arithmetic over Pass A's boxes and the schedule the platform already has.
// No model, no I/O — which is what lets the interesting cases be pinned exactly.

const box = (region, panelCount, panelsWithSymbol, proportion) =>
  ({ region, panelCount, panelsWithSymbol, proportion });
const row = (tag, w, h, extra = {}) => ({ tag, widthMm: w, heightMm: h, typeText: null, ...extra });

test("a uniquely-sized row takes the box whose proportion matches", () => {
  // W1 is 2050x2100 — proportion 0.976 — and nothing else on the sheet is close.
  const out = M.assign({
    rows: [row("W1", 2050, 2100), row("W2", 3500, 700)],
    boxes: [
      box([0.10, 0.10, 0.20, 0.20], 1, [false], 5.0),    // 5:1, that is W2
      box([0.57, 0.29, 0.62, 0.36], 2, [true, false], 0.976),
    ],
    elevation: "A",
  });
  assert.equal(out.assigned.get("W1")?.boxIndex, 1);
  assert.equal(out.assigned.get("W2")?.boxIndex, 0);
  assert.equal(out.notRead.length, 0);
});

test("ONE box that two rows both fit makes BOTH rows not read", () => {
  // The W14/W16 case, and the one the research harness got wrong silently: both
  // are 2050x2000, the elevations yield ONE frame of that size, and it resolved
  // to both. Assigning one box twice is the confident wrong answer this reader
  // fails by — two openings cannot be one window.
  const out = M.assign({
    rows: [row("W14", 2050, 2000), row("W16", 2050, 2000)],
    boxes: [box([0.57, 0.19, 0.63, 0.26], 2, [true, false], 1.025)],
    elevation: "A",
  });
  assert.equal(out.assigned.size, 0, "neither row takes it");
  assert.deepEqual(out.notRead.map((n) => n.tag).sort(), ["W14", "W16"]);
  for (const n of out.notRead) {
    assert.match(n.reason, /one box/i);
    assert.equal(n.state, "not_read", "not `not_stated` — the drawing shows something, we cannot say whose");
    assert.equal(n.subReason, "ambiguous_box");
  }
});

test("a same-size PAIR with two boxes resolves by order along the wall, and only by order", () => {
  // W9 and W11 are both 1810x1027 on Elevation C, and two boxes exist. Proportion
  // cannot separate them — it is identical by construction — so the floor plan's
  // tag order along that wall is the only signal left.
  const boxes = [
    box([0.10, 0.50, 0.20, 0.56], 2, [true, false], 1.762),   // left on the sheet
    box([0.30, 0.50, 0.40, 0.56], 2, [true, false], 1.762),   // right
  ];
  const ordered = M.assign({
    rows: [row("W9", 1810, 1027, { wallOrder: 1 }), row("W11", 1810, 1027, { wallOrder: 2 })],
    boxes, elevation: "C",
  });
  assert.equal(ordered.assigned.get("W9")?.boxIndex, 0);
  assert.equal(ordered.assigned.get("W11")?.boxIndex, 1);

  // Without the order signal there is nothing to choose with, and guessing is
  // a 50/50 chance of putting a real reading on the wrong window.
  const blind = M.assign({
    rows: [row("W9", 1810, 1027), row("W11", 1810, 1027)],
    boxes, elevation: "C",
  });
  assert.equal(blind.assigned.size, 0);
  assert.deepEqual(blind.notRead.map((n) => n.tag).sort(), ["W11", "W9"]);
});

test("no box fits is UNLOCATED — a fact about us, never proof the opening is undrawn", () => {
  // The error this test used to encode, and it is the one this session already
  // made once with the geometric matcher: concluding "not drawn" from "I did not
  // find it". W14 and W16 were declared undrawn on exactly that reasoning and
  // were on the sheet all along — the matcher was the limitation, not the
  // drawing.
  //
  // assign() sees ONE elevation. A row missing from it may be on another sheet,
  // or Pass A may simply have missed the box. Neither is knowable here, so the
  // design records D1 as `not read` — "not a claim that it is undrawn" — and the
  // spec makes `unlocated` an ops-visible SUB-reason of it, never a fourth state.
  //
  // `not_stated` is a POSITIVE finding and belongs to Pass B: the box was found,
  // the crop was read, and the drawing does not divide the opening. Locating
  // cannot produce it.
  const out = M.assign({
    rows: [row("D1", 1380, 2405)],
    boxes: [box([0.1, 0.1, 0.2, 0.2], 1, [false], 0.976)],
    elevation: "A",
  });
  assert.equal(out.assigned.size, 0);
  assert.equal(out.notRead.length, 1);
  assert.equal(out.notRead[0].state, "not_read");
  assert.equal(out.notRead[0].subReason, "unlocated");
  assert.match(out.notRead[0].reason, /elevation A/, "names the sheet it looked at, not all of them");
  assert.equal(out.notStated, undefined, "locating never concludes the drawing is silent");
});

test("a FIXED row whose drawing carries an operating symbol is a disagreement, not a decision", () => {
  // Release-gate check 1. The schedule says the family; the drawing says whether
  // a leaf operates. When those contradict, something is wrong and a human has
  // to look — resolving it here would pick a winner silently, and the wrong pick
  // is either a fixed pane priced as an awning or an awning priced as glass.
  const d = M.verifyReading({
    row: { tag: "W8", widthMm: 1450, heightMm: 1543, typeText: "FIXED" },
    reading: { outcome: "read", divisionAxis: "vertical", units: [{ operable: true, ratio: 1, widthMm: null }] },
  });
  assert.equal(d.agrees, false);
  assert.equal(d.disagreements.length, 1);
  assert.match(d.disagreements[0].detail, /FIXED/);
  assert.equal(d.disagreements[0].check, "schedule_cross_check");
  // The record carries BOTH claims and picks neither.
  assert.ok(!("resolved" in d) && !("winner" in d), "nothing here resolves anything");
});

test("OFFSET AWNING with two panels and one symbol agrees", () => {
  // W1: the schedule names an offset awning, the drawing shows two leaves of
  // which one operates. That is the same window described twice.
  const d = M.verifyReading({
    row: { tag: "W1", widthMm: 2050, heightMm: 2100, typeText: "OFFSET AWNING" },
    reading: {
      outcome: "read", divisionAxis: "vertical",
      units: [{ operable: true, ratio: 0.352, widthMm: null }, { operable: false, ratio: 0.648, widthMm: null }],
    },
  });
  assert.equal(d.agrees, true);
  assert.deepEqual(d.disagreements, []);
});

test("an AWNING row with no operating leaf anywhere is a disagreement", () => {
  const d = M.verifyReading({
    row: { tag: "W3", widthMm: 2100, heightMm: 2100, typeText: "AWNING" },
    reading: { outcome: "read", divisionAxis: "vertical", units: [{ operable: false, ratio: 1, widthMm: null }] },
  });
  assert.equal(d.agrees, false);
  assert.match(d.disagreements[0].detail, /AWNING/);
});

test("a stated unit width that contradicts its own ratio is surfaced", () => {
  // Release-gate check 3, and output spec §2.2: a conflict is REPRESENTED, never
  // silently resolved. W4's comment says 600mm units; if a reading claimed a
  // printed 600 on a leaf its own ratio puts at 1900mm, both cannot be true.
  const d = M.verifyReading({
    row: { tag: "W4", widthMm: 3200, heightMm: 2100, typeText: "AWNING" },
    reading: {
      outcome: "read", divisionAxis: "vertical",
      units: [
        { operable: true, ratio: 0.192, widthMm: 600 },
        { operable: false, ratio: 0.615, widthMm: 600 },   // 0.615 x 3200 = 1968, not 600
        { operable: true, ratio: 0.193, widthMm: null },
      ],
    },
  });
  assert.equal(d.agrees, false);
  const dim = d.disagreements.find((x) => x.check === "dimension_agreement");
  assert.ok(dim, "the impossible one is named");
  assert.match(dim.detail, /1968|616/);
});

test("a decline is not verified — there is nothing to disagree with", () => {
  for (const outcome of ["not_stated", "not_read"]) {
    const d = M.verifyReading({
      row: { tag: "D1", widthMm: 1380, heightMm: 2405, typeText: "HINGED" },
      reading: { outcome, reason: "…" },
    });
    assert.equal(d.agrees, true, `${outcome} is not a claim`);
    assert.deepEqual(d.disagreements, []);
  }
});
