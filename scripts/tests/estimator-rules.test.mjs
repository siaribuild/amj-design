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
      export { rankCandidates, selectWithConfidence } from ${p("worker/lib/estimator/rank.ts")};
      export { selectForOpening } from ${p("worker/lib/estimator/select.ts")};
      export { SUPPORTED_SCHEMA_VERSION } from ${p("worker/lib/estimator/types.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { toCandidate, fixtureCatalogueRepository, checkHardRules, computePrice, rankCandidates, selectForOpening, SUPPORTED_SCHEMA_VERSION } = await import(pathToFileURL(outfile).href);

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

// ─── Ranker + selection orchestration ───────────────────────────────────────
const smallAwning = { ...awning, category: { slug: { current: "windows" } } };
const bigAwning = {
  ...awning, sanityProductId: "product-amj100t-awning-window", slug: "amj100t-awning-window",
  category: { slug: { current: "windows" } },
  dimensionRule: { minWidthMm: 500, maxWidthMm: 1300, minHeightMm: 500, maxHeightMm: 2400, maxAreaM2: 3.12, maxAspectRatio: 4, ruleVersion: "v1" },
};
const priceFn = async (c) => computePrice(
  { id: "awning-window", perimRate: 55, areaRate: 340, minCharge: 0, version: "v1" },
  { depositPercent: 40, gstMode: "inc", version: "v1" },
  { family: "awning-window", widthMm: 800, heightMm: 1200, qty: 1 },
);

test("selection: picks a passing candidate, ranks it, never selects a rejected one", async () => {
  const repo = fixtureCatalogueRepository([smallAwning, bigAwning]);
  const res = await selectForOpening({ family: "windows", operationType: "awning", widthMm: 800, heightMm: 1200, externalRef: "W01" }, repo, priceFn);
  assert.equal(res.evaluated.length, 2);
  assert.ok(res.selected, "a candidate was selected");
  assert.equal(res.selected.outcome.passed, true, "selected candidate passed the hard rules");
  assert.equal(res.status, "ready");
  assert.equal(res.selected.rank, 1);
  assert.match(res.catalogueVersion, /^cat:/);
});

test("selection: an opening too big for the small unit selects the big one only", async () => {
  const repo = fixtureCatalogueRepository([smallAwning, bigAwning]);
  // 1200 wide exceeds smallAwning (max 1000) but fits bigAwning (max 1300).
  const res = await selectForOpening({ family: "windows", operationType: "awning", widthMm: 1200, heightMm: 1200, externalRef: "W02" }, repo, priceFn);
  assert.equal(res.selected.candidate.sanityProductId, "product-amj100t-awning-window");
  // The small unit is present but rejected (never selected).
  const small = res.evaluated.find((e) => e.candidate.sanityProductId === "product-amj80-series-awning-window");
  assert.equal(small.outcome.passed, false);
  assert.equal(small.selected, false);
});

test("selection: no candidate for an unknown operation ⇒ no_candidate", async () => {
  const repo = fixtureCatalogueRepository([smallAwning]);
  const res = await selectForOpening({ family: "windows", operationType: "louvre", widthMm: 800, heightMm: 1200 }, repo, priceFn);
  assert.equal(res.selected, null);
  assert.equal(res.status, "no_candidate");
});

test("ranker: prefers the snugger fit at equal price", () => {
  const mk = (id, r) => ({ candidate: toCandidate({ ...awning, sanityProductId: id, dimensionRule: r }), outcome: { passed: true, status: "ready" }, price: { total: 1000 } });
  const snug = mk("snug", { minWidthMm: 400, maxWidthMm: 1000, minHeightMm: 400, maxHeightMm: 2400, maxAreaM2: 2.4, maxAspectRatio: 4, ruleVersion: "v1" });
  const loose = mk("loose", { minWidthMm: 700, maxWidthMm: 5000, minHeightMm: 700, maxHeightMm: 5000, maxAreaM2: 25, maxAspectRatio: 4, ruleVersion: "v1" });
  const ranked = rankCandidates({ operationType: "awning", widthMm: 700, heightMm: 1400 }, [snug, loose]);
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked.length, 2);
});

test.after(() => removeRunDir(runDir));
