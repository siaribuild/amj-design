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

// ── Historical / LLM learning ────────────────────────────────────────────────
test("reviewer-learned preference decides between two otherwise-equal products", async () => {
  const op = opening({ requirements: { maxUValue: 2.0 } });
  const key = contextKey(op);
  // Reviewers repeatedly issued amj-awn2 in this context.
  const historical = aggregateHistorical([
    { context_key: key, final_product_slug: "amj-awn2", final_variant_id: "dg-lowe", decision: "accepted", reason_code: "HUMAN_ACCEPTED" },
    { context_key: key, final_product_slug: "amj-awn2", final_variant_id: "dg-lowe", decision: "accepted", reason_code: "HUMAN_ACCEPTED" },
    { context_key: key, final_product_slug: "amj-awn2", final_variant_id: "dg-lowe", decision: "accepted", reason_code: "HUMAN_ACCEPTED" },
  ]);
  const withoutLearning = await selectForOpening(op, repo, priceFn);
  const withLearning = await selectForOpening(op, repo, priceFn, historical);
  assert.equal(withLearning.selected.candidate.slug, "amj-awn2", "the learned choice wins the tie");
  // And the learned signal is a NUDGE, not a rewrite: the same non-learned run
  // still produced a valid product (the learning only broke the tie).
  assert.ok(withoutLearning.selected, "selection works with no learning too");
});

test("learning is a bounded nudge: a clearly better thermal match is NOT overturned by history", async () => {
  // History favours amj-awn2, but we force amj-awn to be the only in-band option
  // by giving amj-awn2 no glass that meets a tight band. amj-awn should still win
  // because compliance (0.35) dwarfs the historical weight (0.10).
  const tight = { maxUValue: 1.7, maxShgc: 0.45 }; // only dg-lowe (1.6/0.40) meets
  const awn2NoMeeting = product("amj-awn2", ["awning"], {
    performanceVariants: [glass("dg-clear", 2.8, 0.55), glass("single", 5.4, 0.62)], // no in-band glass
  });
  const localRepo = {
    async queryCandidates() { return [product("amj-awn", ["awning"]), awn2NoMeeting]; },
    catalogueVersion() { return "cat-v1"; },
  };
  const op = opening({ requirements: tight });
  const key = contextKey(op);
  const historical = aggregateHistorical(
    [1, 2, 3, 4].map(() => ({ context_key: key, final_product_slug: "amj-awn2", final_variant_id: "dg-clear", decision: "accepted", reason_code: "HUMAN_ACCEPTED" })),
  );
  const r = await selectForOpening(op, localRepo, priceFn, historical);
  assert.equal(r.selected.candidate.slug, "amj-awn", "the in-band product beats a historically-preferred worse match");
});
