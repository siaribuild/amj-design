import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("estimator-learning");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export { aggregateHistorical, aggregateApprovedThermal, contextKey } from ${p("worker/lib/estimator/learning.ts")};
      export { rankCandidates } from ${p("worker/lib/estimator/rank.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { aggregateHistorical, aggregateApprovedThermal, contextKey, rankCandidates } = await import(pathToFileURL(outfile).href);

const opening = {
  family: "windows",
  operationType: "awning",
  widthMm: 1200,
  heightMm: 1500,
  thermalContext: {
    requirementBasis: "plan_derived",
    orientation: "W",
    riskBand: "high",
    glazingToRoomFloorRatio: 0.35,
  },
};
const key = contextKey(opening);
const row = (product, variant = "dg-low-e", context = key, decision = "accepted") => ({
  context_key: context,
  final_product_slug: product,
  final_variant_id: variant,
  decision,
  reason_code: decision === "accepted" ? "HUMAN_ACCEPTED" : "PRICE_OPTIMIZATION",
});
const candidate = (slug) => ({ sanityProductId: `id-${slug}`, slug });
const variant = (variantId) => ({ variantId });

test("context key includes thermal and geometry buckets", () => {
  assert.match(key, /^windows\|awning\|plan_derived\|W\|high\|/);
  assert.notEqual(contextKey({ ...opening, thermalContext: { ...opening.thermalContext, orientation: "S" } }), key);
});

test("empty finalized corpus is neutral", () => {
  const model = aggregateHistorical([]);
  assert.equal(model.observations, 0);
  assert.equal(model.scoreFor(candidate("amj100"), opening, variant("dg-low-e")), 0.5);
});

test("issued final configurations create a positive contextual signal", () => {
  const model = aggregateHistorical([row("amj100"), row("amj100")]);
  assert.equal(model.observations, 2);
  assert.ok(model.scoreFor(candidate("amj100"), opening, variant("dg-low-e")) > 0.5);
  assert.ok(model.scoreFor(candidate("other"), opening, variant("dg-low-e")) < 0.5);
});

test("an adjusted outcome learns the final configuration, not an unsafe negative label for the proposal", () => {
  const model = aggregateHistorical([
    row("amj200", "tb-low-e", key, "adjusted"),
    row("amj200", "tb-low-e", key, "adjusted"),
  ]);
  assert.ok(model.scoreFor(candidate("amj200"), opening, variant("tb-low-e")) > 0.5);
  assert.ok(model.scoreFor(candidate("unrecorded-proposal"), opening, variant("std")) < 0.5);
});

test("matching context and exact variant outweigh global back-off", () => {
  const other = contextKey({ ...opening, thermalContext: { ...opening.thermalContext, orientation: "N", riskBand: "low" } });
  const model = aggregateHistorical([
    row("amj100"), row("amj100"), row("amj100"),
    row("amj100", "std", other),
    row("other", "std", other), row("other", "std", other), row("other", "std", other),
  ]);
  const exact = model.scoreFor(candidate("amj100"), opening, variant("dg-low-e"));
  const unseenContext = model.scoreFor(
    candidate("amj100"),
    { ...opening, thermalContext: { ...opening.thermalContext, orientation: "E" } },
    variant("dg-low-e"),
  );
  assert.ok(exact > unseenContext);
});

test("historical nudge remains capped by its 0.10 rank weight", () => {
  const perf = {
    variantId: "v", glassBuildUp: null, uValue: 3, shgc: 0.5, frameType: null,
    frameTechnology: "unknown", coating: null, pricingOptionSlugs: [],
    dataSource: "estimated", certified: false, published: true,
  };
  const base = {
    catalogueRevision: "rev1", schemaVersion: 1, family: "windows", series: "awning-window",
    configuration: { operationTypes: ["awning"] },
    dimensionRule: { minWidthMm: 600, maxWidthMm: 1800, minHeightMm: 600, maxHeightMm: 1800, maxAreaM2: null, maxAspectRatio: null, ruleVersion: "v1" },
    performanceVariants: [perf], optionGroups: [], pricingRef: null,
  };
  const make = (id) => ({ ...base, sanityProductId: id, name: id, slug: id });
  const outcome = { passed: true, status: "commercial_only_estimate", filters: [], eligibleVariantIds: ["v"] };
  const ranked = rankCandidates(opening, [
    { candidate: make("liked"), outcome, selectedVariant: perf, price: { total: 500 }, historicalAcceptance: 0.95 },
    { candidate: make("disliked"), outcome, selectedVariant: perf, price: { total: 500 }, historicalAcceptance: 0.05 },
  ]);
  assert.equal(ranked[0].candidateId, "liked");
  assert.ok(ranked[0].score - ranked[1].score <= 0.1);
});

test("thermal correction needs three approved examples in the exact context", () => {
  const rows = [2.8, 2.6].map((maxUValue) => ({
    context_key: key,
    reviewed_thermal_json: JSON.stringify({ maxUValue, minShgc: 0.3, maxShgc: 0.55 }),
  }));
  const learned = aggregateApprovedThermal(rows).apply(opening);
  assert.deepEqual(learned, opening);
});

test("approved thermal learning uses robust medians and stays separate from ranking", () => {
  const rows = [
    { maxUValue: 2.8, minShgc: 0.3, maxShgc: 0.55 },
    { maxUValue: 2.4, minShgc: 0.35, maxShgc: 0.5 },
    { maxUValue: 2.6, minShgc: 0.32, maxShgc: 0.52 },
  ].map((target) => ({
    context_key: key,
    reviewed_thermal_json: JSON.stringify(target),
  }));
  const model = aggregateApprovedThermal(rows);
  const learned = model.apply(opening);
  assert.equal(model.observations, 3);
  assert.equal(learned.requirements, undefined, "precedent never becomes a hard compliance rule");
  assert.equal(learned.advisoryRequirements.maxUValue, 2.6);
  assert.equal(learned.advisoryRequirements.minShgc, 0.32);
  assert.equal(learned.advisoryRequirements.maxShgc, 0.52);
  assert.equal(learned.thermalContext.requirementBasis, "plan_derived",
    "precedent does not overwrite the source basis or fracture future case retrieval");
  assert.equal(learned.thermalContext.thermalPrecedentApplied, true);
});

test("an explicit energy report always overrides learned thermal precedent", () => {
  const reportOpening = {
    ...opening,
    requirements: { maxUValue: 2.1 },
    thermalContext: { ...opening.thermalContext, requirementBasis: "explicit_energy_report" },
  };
  const rows = [1, 2, 3].map(() => ({
    context_key: contextKey(reportOpening),
    reviewed_thermal_json: JSON.stringify({ maxUValue: 3.5 }),
  }));
  assert.deepEqual(aggregateApprovedThermal(rows).apply(reportOpening), reportOpening);
});
