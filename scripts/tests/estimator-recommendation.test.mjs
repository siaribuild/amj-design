// WS8: end-to-end tests of the PRODUCT RECOMMENDATION model (selectForOpening) —
// the non-blocking thermal contract, the W01 impossible-band regression, glass
// chosen to meet the band, operation/dimension authority, and the historical/LLM
// learning nudge. Drives the real selection engine over a fixture catalogue.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("estimator-recommendation");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export { selectForOpening } from ${p("worker/lib/estimator/select.ts")};
      export { aggregateHistorical, contextKey } from ${p("worker/lib/estimator/learning.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { selectForOpening, aggregateHistorical, contextKey } = await import(pathToFileURL(outfile).href);

// ── Fixture catalogue ────────────────────────────────────────────────────────
const glass = (variantId, uValue, shgc, over = {}) => ({
  variantId, glassBuildUp: variantId, uValue, shgc,
  frameType: "aluminium", frameTechnology: "conventional", coating: null,
  certificationRef: null, pricingOptionSlugs: [], dataSource: "estimated",
  certified: false, published: true, ...over,
});

// Three glasses spanning the thermal range — the (frame×glass) cells.
const GLASSES = [
  glass("dg-lowe", 1.6, 0.40, { certified: true, dataSource: "certified", certificationRef: "WERS-1" }),
  glass("dg-clear", 2.8, 0.55),
  glass("single", 5.4, 0.62),
];

const product = (slug, operationTypes, over = {}) => ({
  sanityProductId: `id-${slug}`, catalogueRevision: "rev1", schemaVersion: 1,
  name: slug, slug, family: "windows", series: `${operationTypes[0]}-window`,
  configuration: { operationTypes },
  dimensionRule: { minWidthMm: 400, maxWidthMm: 1300, minHeightMm: 400, maxHeightMm: 2400, maxAreaM2: null, maxAspectRatio: null, ruleVersion: "v1" },
  performanceVariants: GLASSES.map((g) => ({ ...g })),
  optionGroups: [], pricingRef: `price.${slug}`,
  ...over,
});

const CATALOGUE = {
  awning: [product("amj-awn", ["awning"]), product("amj-awn2", ["awning"])],
  sliding: [product("amj-slide", ["sliding"])],
};

// Fake repository + priceFn. Same unit price for every (product,glass) so that
// COMPLIANCE — not price — decides the glass, making glass-to-band deterministic.
const repo = {
  async queryCandidates(_family, operation) { return CATALOGUE[operation] ?? []; },
  catalogueVersion() { return "cat-v1"; },
};
const priceFn = async () => ({ ok: true, unit: 500, total: 500, depositAmount: 250, currency: "AUD", rateCardId: "r", rateCardVersion: "v1", pricingPolicyVersion: "v1", depositPercent: 50, discountPercent: 0 });

const opening = (over = {}) => ({ family: "windows", operationType: "awning", widthMm: 1000, heightMm: 1200, ...over });

// ── Non-blocking thermal ─────────────────────────────────────────────────────
test("a band no glass can meet still ASSIGNS a product (non-blocking), never empty", async () => {
  const r = await selectForOpening(opening({ requirements: { maxUValue: 1.0 } }), repo, priceFn);
  assert.ok(r.selected, "a product is assigned even when no glass meets the band");
  assert.equal(r.status, "commercial_only_estimate");
  // Closest glass by our tie-break (lowest Uw) is dg-lowe (1.6).
  assert.equal(r.selected.selectedVariant.variantId, "dg-lowe");
});

test("THE W01 REGRESSION: an impossible band (minShgc>maxShgc) still yields a product", async () => {
  // The exact failure: energy report intersection produced 0.50–0.41. Coherence
  // guard drops the SHGC pair (keeps Uw 1.69); dg-lowe (1.6) meets it.
  const r = await selectForOpening(
    opening({ widthMm: 2050, heightMm: 2100, requirements: { maxUValue: 1.69, minShgc: 0.5, maxShgc: 0.41 } }),
    repo, priceFn,
  );
  assert.ok(r.selected, "W01 gets a product instead of an empty 'unavailable' line");
  assert.notEqual(r.status, "unavailable");
});

// ── The emitted contract (D14, D16) ─────────────────────────────────────────
test("AC-22 every candidate carries a structured verdict, and the run carries one too", async () => {
  const r = await selectForOpening(opening({ requirements: { maxUValue: 2.0 } }), repo, priceFn);

  // Run level: the tolerance is stamped so a past run is reproducible (AC-4).
  assert.equal(r.selection.version, "ladder-v1");
  assert.equal(r.selection.tolerance, 0.05);
  assert.equal(r.selection.competingTier, "meets");
  assert.equal(r.selection.requirement.maxUValue, 2.0);
  assert.equal(r.selection.requirement.absent, false);
  assert.equal(r.selection.selectedProductSlug, r.selected.candidate.slug);
  assert.equal(r.selectionVersion, "ladder-v1");

  // Candidate level: a verdict on every row, ranked, with the pick at rank 1 and
  // a zero delta against itself (A17's sign convention).
  const outcomes = r.evaluated.map((e) => e.candidateOutcome);
  assert.ok(outcomes.length >= 3, "every evaluated configuration is emitted");
  const pick = outcomes.find((o) => o.selected);
  assert.equal(pick.rank, 1);
  assert.equal(pick.tier, "meets");
  assert.equal(pick.competing, true);
  assert.equal(pick.price.deltaToSelected, 0);
  assert.equal(pick.price.currency, "AUD");
  assert.equal(pick.form, "single");
  assert.deepEqual(pick.exclusions, []);
  assert.equal(pick.learned, null, "the learned layer is not wired in this phase");
  assert.equal(pick.thermal.normalisedDeviation, 0);
  assert.equal(pick.fit.fits, true);

  // Ranks are dense and start at 1 over everything that was in the running.
  const ranked = outcomes.filter((o) => o.rank != null).map((o) => o.rank).sort((a, b) => a - b);
  assert.deepEqual(ranked, ranked.map((_, i) => i + 1));
});

// ── Glass is the U-value lever ───────────────────────────────────────────────
test("glass is chosen to MEET the band when a meeting glass exists", async () => {
  const r = await selectForOpening(opening({ requirements: { maxUValue: 2.0, maxShgc: 0.45 } }), repo, priceFn);
  assert.ok(r.selected);
  assert.equal(r.selected.selectedVariant.variantId, "dg-lowe", "the in-band glass wins on compliance");
});

test("no band ⇒ product assigned, line is ready (no thermal warning)", async () => {
  const r = await selectForOpening(opening(), repo, priceFn);
  assert.ok(r.selected);
  // Certified glass + no requirement ⇒ can reach 'ready'.
  assert.ok(["ready", "commercial_only_estimate"].includes(r.status));
});

// ── Operation + dimension authority ──────────────────────────────────────────
test("operation stays authoritative: an operation no product supports is a genuine no_candidate", async () => {
  const r = await selectForOpening(opening({ operationType: "louvre" }), repo, priceFn);
  assert.equal(r.selected, null);
  assert.equal(r.status, "no_candidate");
});

test("oversize opening still assigns a product (dimension warning, not elimination)", async () => {
  const r = await selectForOpening(opening({ widthMm: 3000, heightMm: 2500 }), repo, priceFn);
  assert.ok(r.selected, "oversize is a composite/custom warning, not empty");
  assert.equal(r.status, "commercial_only_estimate");
});

// ── The learned layer ────────────────────────────────────────────────────────
//
// Two tests lived here that pinned the 0.10 historical weight: a reviewer-learned
// preference broke a tie between two products, and a "bounded nudge" test proved
// compliance outweighed it. Both asserted the weighted ranker's behaviour, which
// D10 deletes — there is no weight for a preference to be, and `selectForOpening`
// has no parameter to receive one. AC-32 ("removing the learned model changes no
// selection") therefore holds by construction in this phase; the dark shadow
// layer and its own tests arrive with Phase 3.
test("AC-32 the ladder has no channel for a learned preference to arrive through", async () => {
  const op = opening({ requirements: { maxUValue: 2.0 } });
  const r = await selectForOpening(op, repo, priceFn);
  // Selection depends on the opening, the catalogue and the price — nothing else.
  assert.equal(r.selected.candidate.slug, "amj-awn", "the slug tiebreak, not a history");
  assert.equal(r.evaluated.every((e) => e.candidateOutcome.learned === null), true);
});
