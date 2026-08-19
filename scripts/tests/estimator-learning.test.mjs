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
      export { aggregateApprovedThermal, contextKey } from ${p("worker/lib/estimator/learning.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { aggregateApprovedThermal, contextKey } = await import(pathToFileURL(outfile).href);

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

// Five tests lived here pinning aggregateHistorical: an empty corpus reading
// neutral, a positive contextual signal, the adjusted-outcome label, exact-
// context back-off, and a cap proving the nudge stayed inside its 0.10 weight.
// All five went with the commercial model (ADR 0007). They tested a signal that
// production never once returned: the twelve-field contextKey produced 9 usable
// rows across 11 distinct keys, so every opening sat alone in its bucket and the
// model answered the neutral 0.5 every time it was asked (D12).
//
// contextKey KEEPS being recorded, and the tests above still pin it. The dark
// shadow model that replaces retrieval — coarsened key, density floor,
// provenance — arrives with Phase 3 and brings its own tests (AC-27..AC-36).

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
