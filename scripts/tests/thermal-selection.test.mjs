// WS8: automated tests for the thermal model (precedence, coherence, glass
// selection, graded compliance, computed band). The regression that motivated the
// rework — a composite's non-overlapping lite bands collapsing to an impossible
// band — is asserted directly against the resolver + coherence guard.
//
// Estimator-integration cases (selectForOpening end-to-end, incl. historical/LLM
// learning) live in estimator-recommendation.test.mjs.
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
      export { resolveThermalBand, coerceCoherent, bandFromRequirements, bandHasConstraint, EMPTY_BAND } from ${p("worker/lib/estimator/thermal/precedence.ts")};
      export { selectGlassForBand, __test as glassTest } from ${p("worker/lib/estimator/thermal/glassSelection.ts")};
      export { gradedComplianceScore } from ${p("worker/lib/estimator/thermal/compliance.ts")};
      export { computeDefaultBand } from ${p("worker/lib/estimator/thermal/computedBand.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const {
  resolveThermalBand, coerceCoherent, bandFromRequirements, bandHasConstraint, EMPTY_BAND,
  selectGlassForBand, glassTest, gradedComplianceScore, computeDefaultBand,
} = await import(pathToFileURL(outfile).href);

const band = (maxUValue, minShgc, maxShgc, shgcTarget = null) => ({ maxUValue, minShgc, maxShgc, shgcTarget });
const opening = (over = {}) => ({ family: "windows", operationType: "awning", widthMm: 1000, heightMm: 1200, ...over });
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

// ── precedence (WS2) ─────────────────────────────────────────────────────────
test("precedence: explicit ref band wins over shared-type and computed", () => {
  const r = resolveThermalBand({
    opening: opening({ requirements: { maxUValue: 1.5, minShgc: 0.4, maxShgc: 0.5 } }),
    sharedByType: { awning: band(2.27, 0.37, 0.41) },
    computed: band(4.0, null, null),
  });
  assert.equal(r.basis, "explicit_ref");
  assert.equal(r.band.maxUValue, 1.5);
});

test("precedence: falls to per-element-type when no explicit ref", () => {
  const r = resolveThermalBand({
    opening: opening({ operationType: "awning" }),
    sharedByType: { awning: band(2.27, 0.37, 0.41), fixed: band(1.69, 0.5, 0.56) },
    computed: band(4.0, null, null),
  });
  assert.equal(r.basis, "shared_type");
  assert.deepEqual([r.band.minShgc, r.band.maxShgc], [0.37, 0.41], "awning band, not fixed");
});

test("precedence: falls to computed when neither explicit nor shared", () => {
  const r = resolveThermalBand({ opening: opening(), computed: band(4.0, null, 0.43, 0.35) });
  assert.equal(r.basis, "computed");
  assert.equal(r.band.maxShgc, 0.43);
});

test("precedence: no source at all ⇒ basis 'none', empty band, product still selectable", () => {
  const r = resolveThermalBand({ opening: opening() });
  assert.equal(r.basis, "none");
  assert.equal(bandHasConstraint(r.band), false);
});

test("precedence: an impossible explicit band is dropped and resolution falls through (the W01 case)", () => {
  // The exact failure: composite parent handed min 0.50 / max 0.41.
  const r = resolveThermalBand({
    opening: opening({ requirements: { maxUValue: 1.69, minShgc: 0.5, maxShgc: 0.41 } }),
    sharedByType: { awning: band(2.27, 0.37, 0.41) },
  });
  // The impossible SHGC pair is gone; the surviving U cap keeps it at explicit tier,
  // and it is NEVER an empty interval that zeroes every product.
  assert.equal(r.incoherent, true);
  assert.equal(r.band.minShgc, null);
  assert.equal(r.band.maxShgc, null);
  assert.equal(r.band.maxUValue, 1.69);
});

test("precedence per-lite: awning lite and fixed lite resolve to their OWN bands", () => {
  const shared = { awning: band(2.27, 0.37, 0.41), fixed: band(1.69, 0.5, 0.56) };
  const awning = resolveThermalBand({ opening: opening(), component: { componentRef: "W1A", elementType: "awning", band: shared.awning } });
  const fixed = resolveThermalBand({ opening: opening(), component: { componentRef: "W1B", elementType: "fixed", band: shared.fixed } });
  assert.deepEqual([awning.band.minShgc, awning.band.maxShgc], [0.37, 0.41]);
  assert.deepEqual([fixed.band.minShgc, fixed.band.maxShgc], [0.5, 0.56]);
  // Neither is ever the intersection 0.50–0.41.
});

// ── glass selection (WS3) ────────────────────────────────────────────────────
test("glass: picks the cell that MEETS the band when one exists", () => {
  const cells = [cell("single", 5.4, 0.6), cell("dbl-lowE", 1.6, 0.4), cell("dbl-clear", 2.8, 0.55)];
  const pick = selectGlassForBand(cells, band(1.69, 0.37, 0.45, 0.4));
  assert.equal(pick.cell.glassOptionSlug, "dbl-lowE");
  assert.equal(pick.meetsBand, true);
  assert.equal(pick.reviewRequired, false);
});

test("glass: no cell meets the band ⇒ closest (nearest SHGC-to-target, then lowest Uw) + warning, never empty", () => {
  // Band wants SHGC ~0.39 and Uw ≤ 1.69; no cell qualifies on Uw.
  const cells = [cell("A", 2.8, 0.40), cell("B", 2.6, 0.55), cell("C", 3.2, 0.38)];
  const pick = selectGlassForBand(cells, band(1.69, 0.37, 0.41, 0.39));
  assert.equal(pick.meetsBand, false);
  assert.equal(pick.reviewRequired, true);
  assert.equal(pick.reason, "thermal_band_not_met");
  // Nearest SHGC to 0.39 is C (0.38) and A (0.40) — both 0.01 away; tie broken by lowest Uw → A (2.8 < 3.2).
  assert.equal(pick.cell.glassOptionSlug, "A");
});

test("glass: an absent band selects the best-Uw default without a warning", () => {
  const cells = [cell("A", 3.0, 0.5), cell("B", 1.8, 0.4)];
  const pick = selectGlassForBand(cells, EMPTY_BAND);
  assert.equal(pick.meetsBand, true);
  assert.equal(pick.reviewRequired, false);
  assert.equal(pick.cell.glassOptionSlug, "B", "lowest Uw when nothing to aim at");
});

// ── graded compliance (WS4) ──────────────────────────────────────────────────
test("compliance: in-band cell scores 1.0; a miss is graded and floored above 0", () => {
  const inBand = gradedComplianceScore(cell("x", 1.6, 0.4), band(1.69, 0.37, 0.45));
  assert.equal(inBand, 1);
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
