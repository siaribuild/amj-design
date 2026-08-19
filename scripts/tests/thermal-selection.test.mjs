// Automated tests for the live thermal model: the coherence guard, requirement-
// relative deviation (D8), and the computed band. The regression that motivated
// the rework — a composite's non-overlapping lite bands collapsing to an
// impossible (min>max) band — is asserted directly against the coherence guard.
//
// Two things these tests once covered are gone. The precedence *resolver* and
// the standalone glass *selector* were retired as dead code. `gradedComplianceScore`
// and its FLOOR / SHGC_SPAN / UVALUE_SPAN constants were deleted with the
// weighted ranker (ADR 0007) — how nearly a candidate meets a band is now a
// DISTANCE, not a score between 0 and 1, and the cases that pinned the score
// are re-asked below in the deviation vocabulary that replaced it.
//
// End-to-end selection lives in estimator-recommendation.test.mjs; the ladder's
// own arithmetic in recommendation-ladder.test.mjs.
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
      export { deviationOf } from ${p("worker/lib/estimator/ladder.ts")};
      export { computeDefaultBand } from ${p("worker/lib/estimator/thermal/computedBand.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const {
  coerceCoherent, deviationOf, computeDefaultBand,
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

// ── requirement-relative deviation (D8), replacing graded compliance ─────────
//
// gradedComplianceScore is deleted with FLOOR, SHGC_SPAN and UVALUE_SPAN
// (ADR 0007). Its two spans punished an SHGC miss ~7.5× harder per unit than a
// Uw one, and its 0.1 floor existed to stop a score becoming a veto — both
// problems of scoring, and neither exists once the answer is a distance rather
// than a number between 0 and 1. These are the cases it used to own, re-asked
// in the vocabulary that replaced it.
const req = (b) => ({ maxUValue: b.maxUValue, minShgc: b.minShgc, maxShgc: b.maxShgc, basis: "explicit_energy_report", absent: false });
const devOf = (c, b) => deviationOf(req(b), { uValue: c.uValue, shgc: c.shgc }).scalar;

test("deviation: any in-band cell deviates by ZERO; SHGC position inside the band is not shaded", () => {
  // Owner rule: once a cell MEETS the band it is fully compliant. Two in-band
  // cells at different SHGC are equally compliant and price decides between them
  // — the old midpoint tie-break biased toward the pricier glass.
  assert.equal(devOf(cell("x", 1.6, 0.38), band(1.69, 0.37, 0.45)), 0);
  assert.equal(devOf(cell("y", 1.6, 0.44), band(1.69, 0.37, 0.45)), 0);
  // A miss is a MEASURED distance, not a shrinking score with a floor under it.
  const nearMiss = devOf(cell("x", 1.75, 0.4), band(1.69, 0.37, 0.45));
  assert.ok(nearMiss > 0 && nearMiss < 0.05, `near miss measured, got ${nearMiss}`);
  const grossMiss = devOf(cell("x", 9, 0.9), band(1.69, 0.37, 0.45));
  assert.ok(grossMiss > nearMiss, "a gross miss is further out, and has no floor to hide behind");
});

test("deviation: closer-to-band glass sorts ahead (the ordering that replaces the veto)", () => {
  const closer = devOf(cell("x", 1.8, 0.42), band(1.69, 0.37, 0.41));
  const farther = devOf(cell("y", 3.5, 0.7), band(1.69, 0.37, 0.41));
  assert.ok(closer < farther, `${closer} should sort ahead of ${farther}`);
});

test("D8: Uw and SHGC carry no hidden multiplier relative to each other", () => {
  // The defect this replaces: SHGC_SPAN 0.2 against UVALUE_SPAN 1.5 punished an
  // SHGC miss about 7.5× harder per unit. A 10% miss is now 0.10 on either axis.
  assert.equal(devOf(cell("u", 2.2, 0.4), band(2.0, 0.37, 0.45)), 0.1);
  assert.equal(devOf(cell("s", 1.6, 0.495), band(2.0, 0.37, 0.45)), 0.1);
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
