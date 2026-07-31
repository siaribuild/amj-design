// Automated tests for the live thermal model: the coherence guard (WS2), graded
// compliance (WS4), and the computed band (WS6). The regression that motivated the
// rework — a composite's non-overlapping lite bands collapsing to an impossible
// (min>max) band — is asserted directly against the coherence guard.
//
// The precedence *resolver* and standalone glass *selector* these tests once also
// covered were retired (dead code; live selection is the weighted ranker). The
// end-to-end selection cases live in estimator-recommendation.test.mjs, and the
// ranker's band handling in estimator-rules.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("thermal-selection");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export { coerceCoherent } from ${p("worker/lib/estimator/thermal/precedence.ts")};
      export { gradedComplianceScore } from ${p("worker/lib/estimator/thermal/compliance.ts")};
      export { computeDefaultBand } from ${p("worker/lib/estimator/thermal/computedBand.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const {
  coerceCoherent, gradedComplianceScore, computeDefaultBand,
} = await import(pathToFileURL(outfile).href);

const band = (maxUValue, minShgc, maxShgc, shgcTarget = null) => ({ maxUValue, minShgc, maxShgc, shgcTarget });
const cell = (slug, uValue, shgc, over = {}) => ({ glassOptionSlug: slug, variantId: slug, uValue, shgc, certified: false, pricingOptionSlugs: [], ...over });

// ── coherence guard (WS2) — the anti-regression ──────────────────────────────
test("coerceCoherent: an impossible SHGC band (min>max) drops the SHGC pair, keeps Uw + target", () => {
  const { band: out, altered } = coerceCoherent(band(1.69, 0.5, 0.41, 0.45));
  assert.equal(altered, true);
  assert.equal(out.minShgc, null);
  assert.equal(out.maxShgc, null);
  assert.equal(out.maxUValue, 1.69, "the U cap survives");
  assert.equal(out.shgcTarget, 0.45, "the advisory target survives to guide selection");
});

test("coerceCoherent: a coherent band is returned unchanged", () => {
  const { band: out, altered } = coerceCoherent(band(2.27, 0.37, 0.41));
  assert.equal(altered, false);
  assert.deepEqual({ u: out.maxUValue, min: out.minShgc, max: out.maxShgc }, { u: 2.27, min: 0.37, max: 0.41 });
});

test("coerceCoherent: nonsensical bounds (U<=0, SHGC out of [0,1]) are dropped", () => {
  const { band: out } = coerceCoherent(band(0, 1.4, -0.2));
  assert.equal(out, null, "nothing usable survives ⇒ null");
});

// ── graded compliance (WS4) ──────────────────────────────────────────────────
test("compliance: an in-band cell scores at the top; a miss is graded and floored above 0", () => {
  // M4 ranker: in-band scores ~1, with the SHGC-target tie-break shading it a hair
  // below 1 unless the cell also sits on the SHGC-target midpoint.
  const onTarget = gradedComplianceScore(cell("x", 1.6, 0.41), band(1.69, 0.37, 0.45));
  assert.equal(onTarget, 1, "in-band AND on the SHGC-target midpoint ⇒ a perfect 1");
  const inBand = gradedComplianceScore(cell("x", 1.6, 0.4), band(1.69, 0.37, 0.45));
  assert.ok(inBand > 0.98 && inBand <= 1, `in-band off-target scores at the top, got ${inBand}`);
  const nearMiss = gradedComplianceScore(cell("x", 1.75, 0.4), band(1.69, 0.37, 0.45));
  assert.ok(nearMiss > 0.1 && nearMiss < 1, `near miss graded, got ${nearMiss}`);
  const grossMiss = gradedComplianceScore(cell("x", 9, 0.9), band(1.69, 0.37, 0.45));
  assert.ok(grossMiss >= 0.1, "never zero — a miss never eliminates the line");
});

test("compliance: closer-to-band glass ranks higher (the ordering that replaces the veto)", () => {
  const closer = gradedComplianceScore(cell("x", 1.8, 0.42), band(1.69, 0.37, 0.41));
  const farther = gradedComplianceScore(cell("y", 3.5, 0.7), band(1.69, 0.37, 0.41));
  assert.ok(closer > farther, `${closer} should beat ${farther}`);
});

// ── computed band (WS6) ──────────────────────────────────────────────────────
test("computed: unknown orientation ⇒ Uw cap only, no SHGC (honours §11.3)", () => {
  const b = computeDefaultBand({ climateZone: "6" });
  assert.equal(b.maxUValue, 4.0);
  assert.equal(b.minShgc, null);
  assert.equal(b.maxShgc, null);
});

test("computed: west orientation adds a cooling-control maxShgc; north does not", () => {
  const west = computeDefaultBand({ climateZone: "6", orientation: "W" });
  const north = computeDefaultBand({ climateZone: "6", orientation: "N" });
  assert.ok(west.maxShgc != null && west.maxShgc <= 0.45, "west controls cooling");
  assert.equal(north.maxShgc, null, "north keeps solar access");
  assert.equal(west.minShgc, null, "computed bands NEVER set a min (can't form an impossible interval)");
});

test("computed: colder climate zone tightens the Uw cap", () => {
  const cold = computeDefaultBand({ climateZone: "8" });
  const mild = computeDefaultBand({ climateZone: "2" });
  assert.ok(cold.maxUValue < mild.maxUValue);
});
