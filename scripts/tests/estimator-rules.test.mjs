// CatalogueRepository + hard-rules engine tests (spec §8.2). TS bundled with
// esbuild (same approach as schedule.test.mjs). Uses a fixture catalogue so the
// rules are tested with no live CMS (spec §16.1).
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("estimator-rules");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export { toCandidate, fixtureCatalogueRepository, createCatalogueRepository } from ${p("worker/lib/estimator/catalogue.ts")};
      export { checkHardRules, RULE_VERSION } from ${p("worker/lib/estimator/rules.ts")};
      export { computePrice } from ${p("worker/lib/estimator/pricing.ts")};
      export { SUPPORTED_SCHEMA_VERSION } from ${p("worker/lib/estimator/types.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { toCandidate, fixtureCatalogueRepository, checkHardRules, computePrice, SUPPORTED_SCHEMA_VERSION } = await import(pathToFileURL(outfile).href);

const RATE = { id: "awning-window", perimRate: 55, areaRate: 340, minCharge: 0, version: "v1" };
const POLICY = { depositPercent: 40, gstMode: "inc", version: "v1" };

// A realistic candidate mirroring the enriched Sanity shape (estimated perf).
const awning = {
  sanityProductId: "product-amj80-series-awning-window", catalogueRevision: "rev-1", schemaVersion: 1,
  name: "AMJ80 Series Awning Window", slug: "amj80-series-awning-window",
  family: "windows", series: "awning-window",
  configuration: { operationTypes: ["awning"], isCompositeMember: true, dataSource: "estimated" },
  dimensionRule: { minWidthMm: 400, maxWidthMm: 1000, minHeightMm: 400, maxHeightMm: 2400, maxAreaM2: 2.4, maxAspectRatio: 4, ruleVersion: "v1" },
  performanceVariants: [{ variantId: "std", glassBuildUp: "5+8A+5", uValue: 3.9, shgc: 0.62, frameType: "aluminium", dataSource: "estimated", certified: false, published: true }],
  optionGroups: ["colour", "flyscreen"], pricingRef: "price.amj80.v1",
};
const cand = () => toCandidate({ ...awning, performanceVariants: awning.performanceVariants.map((v) => ({ ...v })) });

test("toCandidate rejects an unsupported (future) schema version", () => {
  assert.ok(toCandidate(awning), "supported version maps");
  assert.equal(toCandidate({ ...awning, schemaVersion: SUPPORTED_SCHEMA_VERSION + 1 }), null);
  assert.equal(toCandidate({ ...awning, schemaVersion: undefined }), null);
});

test("operation + dimensions: in-range awning is READY, out-of-range is rejected", () => {
  const ok = checkHardRules({ family: "window", operationType: "awning", widthMm: 800, heightMm: 1200 }, cand());
  assert.equal(ok.status, "ready");
  assert.equal(ok.passed, true);

  const tooWide = checkHardRules({ family: "window", operationType: "awning", widthMm: 1400, heightMm: 1200 }, cand());
  assert.equal(tooWide.passed, false);
  assert.equal(tooWide.status, "unavailable");
  assert.ok(tooWide.filters.find((f) => f.filter === "dimensions" && f.severity === "reject"));
});

test("wrong operation is rejected", () => {
  const r = checkHardRules({ family: "window", operationType: "sliding", widthMm: 800, heightMm: 1200 }, cand());
  assert.equal(r.passed, false);
  assert.ok(r.filters.find((f) => f.filter === "operation" && f.severity === "reject"));
});

test("SAFETY: an energy requirement met only by ESTIMATED data ⇒ commercial_only_estimate, not certified", () => {
  const r = checkHardRules({ family: "window", operationType: "awning", widthMm: 800, heightMm: 1200, requirements: { maxUValue: 4.5 } }, cand());
  assert.equal(r.passed, true, "estimated data can still produce an estimate");
  assert.equal(r.status, "commercial_only_estimate", "but never a certified pass");
  assert.equal(r.energyCertified, false);
});

test("energy requirement the product cannot meet is rejected", () => {
  const r = checkHardRules({ family: "window", operationType: "awning", widthMm: 800, heightMm: 1200, requirements: { maxUValue: 2.0 } }, cand());
  assert.equal(r.passed, false);
  assert.ok(r.filters.find((f) => f.filter === "energy" && f.severity === "reject"));
});

test("energy requirement with NO performance data ⇒ catalogue_data_incomplete (never a guess)", () => {
  const noPerf = toCandidate({ ...awning, performanceVariants: [] });
  const r = checkHardRules({ family: "window", operationType: "awning", widthMm: 800, heightMm: 1200, requirements: { maxUValue: 4.5 } }, noPerf);
  assert.equal(r.passed, false);
  assert.equal(r.status, "catalogue_data_incomplete");
});

test("energy met by CERTIFIED data ⇒ ready + energyCertified", () => {
  const certified = toCandidate({ ...awning, performanceVariants: [{ ...awning.performanceVariants[0], certified: true, dataSource: "certified" }] });
  const r = checkHardRules({ family: "window", operationType: "awning", widthMm: 800, heightMm: 1200, requirements: { maxUValue: 4.5 } }, certified);
  assert.equal(r.status, "ready");
  assert.equal(r.energyCertified, true);
});

test("fixture CatalogueRepository filters by family + operation and stamps a version", async () => {
  const repo = fixtureCatalogueRepository([
    { ...awning, category: { slug: { current: "windows" } } },
    { ...awning, sanityProductId: "product-door", slug: "d", category: { slug: { current: "doors" } }, configuration: { operationTypes: ["sliding"] } },
  ]);
  const windows = await repo.queryCandidates("windows", "awning");
  assert.equal(windows.length, 1);
  assert.equal(windows[0].sanityProductId, "product-amj80-series-awning-window");
  assert.match(repo.catalogueVersion(windows), /^cat:1:/);
});

test("pricing: perimeter+area model, ×qty, 40% deposit, snapshot versions", () => {
  const s = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1000, heightMm: 1200, qty: 2 });
  // perimeter = 2*(1+1.2)=4.4m ×55 = 242; area = 1.2m² ×340 = 408; unit ≈ 650 (round10)
  assert.equal(s.ok, true);
  assert.equal(s.unit, 650);
  assert.equal(s.total, 1300);
  assert.equal(s.depositAmount, 520);        // 40% of 1300
  assert.equal(s.depositPercent, 40);        // spec: real deposit is 40%, not 50%
  assert.equal(s.rateCardVersion, "v1");
  assert.equal(s.pricingPolicyVersion, "v1");
});

test("pricing: option surcharges add to the unit; missing dims ⇒ not ok", () => {
  const withOpt = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1000, heightMm: 1200, qty: 1, optionSurcharges: [130, 40] });
  const base = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1000, heightMm: 1200, qty: 1 });
  assert.ok(withOpt.unit > base.unit);
  const bad = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 0, heightMm: 1200, qty: 1 });
  assert.equal(bad.ok, false);
  assert.equal(bad.total, 0);
});

test("pricing: snapshot exposes a TOTAL, never a per-option breakdown", () => {
  const s = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1000, heightMm: 1200, qty: 1, optionSurcharges: [130] });
  assert.ok(!("optionSurcharges" in s) && !("options" in s), "no per-option breakdown leaks into the snapshot");
});

test.after(() => removeRunDir(runDir));
