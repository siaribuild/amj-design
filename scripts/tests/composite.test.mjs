// Composite openings — the pure geometry and proposal rules.
//
// The DB-touching parts (recomputeComposite, splitLine) are exercised through
// the Worker in api.test.mjs. What is unit-tested here is the arithmetic that
// decides whether a split is buildable, because getting it wrong produces a
// quote for frames that do not fit the hole.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const runDir = await makeRunDir("composite");
const outfile = join(runDir, "composite.mjs");
await build({
  stdin: {
    contents: `export { validateSplit, proposeEvenSplit } from ${JSON.stringify(join(projectRoot, "worker/lib/composite.ts"))};`,
    resolveDir: projectRoot, sourcefile: "composite-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { validateSplit, proposeEvenSplit } = await import(pathToFileURL(outfile).href);

const POLICY = { toleranceMm: 25, defaultJoinerMm: 0, maxSegments: 4 };
const seg = (w, h, extra = {}) => ({ widthMm: w, heightMm: h, productSlug: "amj80-series-sliding-window", ...extra });

test("an even split sums EXACTLY to the opening, remainder and all", () => {
  // 3601 does not divide by 2. The remainder must land somewhere explicit
  // rather than being rounded away, or the frames do not fill the hole.
  const widths = proposeEvenSplit(3601, 2, 0);
  assert.equal(widths.reduce((a, b) => a + b, 0), 3601);
  const three = proposeEvenSplit(3600, 3, 10);   // two 10mm joiners
  assert.equal(three.reduce((a, b) => a + b, 0) + 20, 3600);
});

test("a clean split validates, and reports zero coverage delta", () => {
  const r = validateSplit({ widthMm: 3600, heightMm: 1200 }, [seg(1800, 1200), seg(1800, 1200)], "vertical", POLICY);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
  assert.equal(r.coverageDeltaMm, 0);
});

test("coverage is REPORTED, never vetoed — mullion allowance is real", () => {
  // 20mm short of the opening: a coupled frame legitimately loses width to the
  // mullion, and the reviewer is the engineering authority. It must validate,
  // with the delta recorded so a warning can be raised against it.
  const r = validateSplit({ widthMm: 3600, heightMm: 1200 }, [seg(1790, 1200), seg(1790, 1200)], "vertical", POLICY);
  assert.equal(r.ok, true, "a short-by-mullion split is not an error");
  assert.equal(r.coverageDeltaMm, -20);
});

test("a symmetric split is ONE row with qtyPerParent, and still spans the opening", () => {
  const r = validateSplit({ widthMm: 3600, heightMm: 1200 }, [seg(1800, 1200, { qtyPerParent: 2 })], "vertical", POLICY);
  // Two identical frames expressed as one row: the span must count both.
  assert.equal(r.coverageDeltaMm, 0);
  // …but it is still fewer than 2 UNITS, which is what a composite means.
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /at least 2 units/.test(e)));
});

test("across the split axis every unit must span the full opening", () => {
  // A vertical split partitions WIDTH; heights are not free. A 900mm-tall unit
  // in a 1200mm opening leaves a 300mm gap — that is not a composite, it is a
  // mistake, and it must not price.
  const r = validateSplit({ widthMm: 3600, heightMm: 1200 }, [seg(1800, 1200), seg(1800, 900)], "vertical", POLICY);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /900mm across/.test(e)));
});

test("a horizontal split partitions HEIGHT instead", () => {
  const r = validateSplit({ widthMm: 1200, heightMm: 3000 }, [seg(1200, 1500), seg(1200, 1500)], "horizontal", POLICY);
  assert.equal(r.ok, true);
  assert.equal(r.coverageDeltaMm, 0);
});

test("the segment count is bounded by policy, not by a constant in code", () => {
  const five = Array.from({ length: 5 }, () => seg(720, 1200));
  assert.equal(validateSplit({ widthMm: 3600, heightMm: 1200 }, five, "vertical", POLICY).ok, false);
  // Raising the policy raises the limit — no deploy needed.
  assert.equal(validateSplit({ widthMm: 3600, heightMm: 1200 }, five, "vertical", { ...POLICY, maxSegments: 5 }).ok, true);
});

test("a unit with no product cannot be priced and is named individually", () => {
  const r = validateSplit({ widthMm: 3600, heightMm: 1200 },
    [seg(1800, 1200), { widthMm: 1800, heightMm: 1200, productSlug: "" }], "vertical", POLICY);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /Unit 2 has no product/.test(e)), "errors name the offending unit, not just 'invalid'");
});

await removeRunDir(runDir);
