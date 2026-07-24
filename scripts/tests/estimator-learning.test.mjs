// Learning-loop tests (spec §12, Phase 6). The reviewer-correction corpus is
// aggregated into a per-(context, product) acceptance signal; the ranker consumes
// it through its capped 0.10 'historical' weight. Verifies: neutral with no data,
// accept/reject shifts, hierarchical context back-off, and that the learned nudge
// moves ranking but is bounded (never overrides a hard fact). Pure — no CMS/D1.
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
      export { aggregateHistorical, contextKey, LEARNING_VERSION } from ${p("worker/lib/estimator/learning.ts")};
      export { rankCandidates } from ${p("worker/lib/estimator/rank.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { aggregateHistorical, contextKey, rankCandidates } = await import(pathToFileURL(outfile).href);

// A feedback row: reviewer chose `final` over the system's `initial` proposal.
const row = (family, op, initial, final) => ({
  opening_family: family, opening_operation: op,
  initial_value_json: initial == null ? null : JSON.stringify({ productId: initial }),
  final_value_json: final == null ? null : JSON.stringify({ productId: final }),
});
const cand = (id) => ({ sanityProductId: id });
const awning = { family: "windows", operationType: "awning" };

test("contextKey normalises family + operation and defaults nulls", () => {
  assert.equal(contextKey("Windows", "Awning"), "windows|awning");
  assert.equal(contextKey(null, undefined), "any|any");
});

test("empty corpus is fully neutral (0.5) with zero observations", () => {
  const m = aggregateHistorical([]);
  assert.equal(m.observations, 0);
  assert.equal(m.scoreFor(cand("product-amj100l"), awning), 0.5);
});

test("an accepted product scores above neutral in its context", () => {
  const m = aggregateHistorical([row("windows", "awning", null, "product-amj100l")]);
  assert.equal(m.observations, 1);
  assert.ok(m.scoreFor(cand("product-amj100l"), awning) > 0.5, "accepted product lifted");
  assert.equal(m.scoreFor(cand("product-other"), awning), 0.5, "unseen product stays neutral");
});

test("an overridden system pick scores below neutral (reject signal)", () => {
  // System proposed amj200, reviewer chose amj100l.
  const m = aggregateHistorical([row("windows", "awning", "product-amj200", "product-amj100l")]);
  assert.ok(m.scoreFor(cand("product-amj200"), awning) < 0.5, "overridden product penalised");
  assert.ok(m.scoreFor(cand("product-amj100l"), awning) > 0.5, "chosen product rewarded");
});

test("repeated acceptances strengthen the signal (monotone)", () => {
  const one = aggregateHistorical([row("windows", "awning", null, "product-amj100l")]);
  const five = aggregateHistorical(Array.from({ length: 5 }, () => row("windows", "awning", null, "product-amj100l")));
  assert.ok(five.scoreFor(cand("product-amj100l"), awning) > one.scoreFor(cand("product-amj100l"), awning));
});

test("context back-off: global evidence bleeds into an unseen context, but weaker", () => {
  // amj100l is loved in awning (3 accepts) but overridden in sliding (2 rejects),
  // so the GLOBAL rate is mixed while the awning-context rate is strongly positive.
  // Querying an unseen context (casement) falls back to the diluted global.
  const m = aggregateHistorical([
    row("windows", "awning", null, "product-amj100l"),
    row("windows", "awning", null, "product-amj100l"),
    row("windows", "awning", null, "product-amj100l"),
    row("windows", "sliding", "product-amj100l", "product-other"),
    row("windows", "sliding", "product-amj100l", "product-other"),
  ]);
  const sameCtx = m.scoreFor(cand("product-amj100l"), awning);
  const otherCtx = m.scoreFor(cand("product-amj100l"), { family: "windows", operationType: "casement" });
  assert.ok(sameCtx > otherCtx, "same-context signal stronger than cross-context back-off");
  assert.ok(otherCtx > 0.5, "global preference still nudges a new context");
});

test("the learned nudge changes ranking but is bounded by the 0.10 weight", () => {
  // Two identical candidates (same dims/perf/price) differing ONLY in learned
  // acceptance. The preferred one must rank first, by no more than 0.10.
  const base = {
    catalogueRevision: "rev1", schemaVersion: 1, family: "windows", series: "awning-window",
    configuration: { operationTypes: ["awning"] },
    dimensionRule: { minWidthMm: 600, maxWidthMm: 1800, minHeightMm: 600, maxHeightMm: 1800, maxAreaM2: null, maxAspectRatio: null, ruleVersion: "v1" },
    performanceVariants: [{ variantId: "v", glassBuildUp: null, uValue: 5, shgc: 0.5, frameType: null, dataSource: "estimated", certified: false, published: true }],
    optionGroups: [], pricingRef: null,
  };
  const mk = (id) => ({ ...base, sanityProductId: id, name: id, slug: id });
  const outcome = { passed: true, status: "commercial_only_estimate", filters: [] };
  const price = { total: 500 };
  const opening = { family: "windows", operationType: "awning", widthMm: 1200, heightMm: 1200, requirements: null };

  const ranked = rankCandidates(opening, [
    { candidate: mk("product-liked"), outcome, price, historicalAcceptance: 0.95 },
    { candidate: mk("product-disliked"), outcome, price, historicalAcceptance: 0.05 },
  ]);
  const liked = ranked.find((r) => r.candidateId === "product-liked");
  const disliked = ranked.find((r) => r.candidateId === "product-disliked");
  assert.equal(liked.rank, 1, "learned-preferred candidate ranks first");
  assert.ok(liked.score - disliked.score <= 0.10 + 1e-9, "nudge is bounded by the 0.10 weight");
  assert.ok(liked.score - disliked.score > 0, "nudge is real");
});

test("with no learned signal the ranker is unchanged (order stable)", () => {
  const base = {
    catalogueRevision: "rev1", schemaVersion: 1, family: "windows", series: "awning-window",
    configuration: { operationTypes: ["awning"] },
    dimensionRule: { minWidthMm: 600, maxWidthMm: 1800, minHeightMm: 600, maxHeightMm: 1800, maxAreaM2: null, maxAspectRatio: null, ruleVersion: "v1" },
    performanceVariants: [{ variantId: "v", glassBuildUp: null, uValue: 5, shgc: 0.5, frameType: null, dataSource: "estimated", certified: false, published: true }],
    optionGroups: [], pricingRef: null,
  };
  const mk = (id) => ({ ...base, sanityProductId: id, name: id, slug: id });
  const outcome = { passed: true, status: "commercial_only_estimate", filters: [] };
  const price = { total: 500 };
  const opening = { family: "windows", operationType: "awning", widthMm: 1200, heightMm: 1200, requirements: null };
  const ranked = rankCandidates(opening, [
    { candidate: mk("product-a"), outcome, price },
    { candidate: mk("product-b"), outcome, price },
  ]);
  assert.equal(ranked[0].score, ranked[1].score, "identical candidates score identically without learning");
  assert.equal(ranked[0].components.historical, 0, "historical neutral (0) when not provided");
});
