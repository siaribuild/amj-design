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
      export { toCandidate, fixtureCatalogueRepository, createCatalogueRepository, catalogueCandidateReadiness } from ${p("worker/lib/estimator/catalogue.ts")};
      export { checkHardRules, RULE_VERSION, effectiveThermalRequirements } from ${p("worker/lib/estimator/rules.ts")};
      export { gradedComplianceScore } from ${p("worker/lib/estimator/thermal/compliance.ts")};
      export { computePrice, loadOptionSurcharges, createCachedPriceResolver } from ${p("worker/lib/estimator/pricing.ts")};
      export { rankCandidates, selectWithConfidence } from ${p("worker/lib/estimator/rank.ts")};
      export { selectForOpening } from ${p("worker/lib/estimator/select.ts")};
      export { r2Keys } from ${p("worker/lib/estimator/storage.ts")};
      export { energyReportExtractor } from ${p("worker/lib/estimator/skills/energy.ts")};
      export { SUPPORTED_SCHEMA_VERSION } from ${p("worker/lib/estimator/types.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { toCandidate, fixtureCatalogueRepository, catalogueCandidateReadiness, checkHardRules, computePrice, loadOptionSurcharges, createCachedPriceResolver, rankCandidates, selectForOpening, r2Keys, energyReportExtractor, SUPPORTED_SCHEMA_VERSION, effectiveThermalRequirements, gradedComplianceScore } = await import(pathToFileURL(outfile).href);

const RATE = { id: "awning-window", perimRate: 55, areaRate: 340, minCharge: 0, version: "v1" };
const POLICY = { depositPercent: 40, gstMode: "inc", version: "v1" };

// A realistic candidate mirroring the enriched Sanity shape (estimated perf).
const awning = {
  sanityProductId: "product-amj80-series-awning-window", catalogueRevision: "rev-1", schemaVersion: 1,
  name: "AMJ80 Series Awning Window", slug: "amj80-series-awning-window",
  family: "windows", series: "awning-window",
  // Operation is a family property; toCandidate bakes it in from seriesOperation.
  seriesOperation: "awning",
  dimensionRule: { minWidthMm: 400, maxWidthMm: 1000, minHeightMm: 400, maxHeightMm: 2400, maxAreaM2: 2.4, maxAspectRatio: 4, ruleVersion: "v1" },
  performanceVariants: [{ variantId: "std", glazingOptionSlug: "double-clear", glazingClass: "double_clear", uValue: 3.9, shgc: 0.62, frameType: "aluminium", dataSource: "estimated", certified: false, published: true }],
  optionGroups: ["colour", "flyscreen"], pricingRef: "amj80",
};
const cand = () => toCandidate({ ...awning, performanceVariants: awning.performanceVariants.map((v) => ({ ...v })) });

test("toCandidate rejects an unsupported (future) schema version", () => {
  assert.ok(toCandidate(awning), "supported version maps");
  assert.equal(toCandidate({ ...awning, schemaVersion: SUPPORTED_SCHEMA_VERSION + 1 }), null);
  assert.equal(toCandidate({ ...awning, schemaVersion: undefined }), null);
});

test("operation + dimensions: in-range awning is READY, out-of-range is WARNED (indicative, never ready)", () => {
  const ok = checkHardRules({ family: "window", operationType: "awning", widthMm: 800, heightMm: 1200 }, cand());
  assert.equal(ok.status, "ready");
  assert.equal(ok.passed, true);

  // Same contract as the deterministic matcher: an oversized opening is a
  // composite/custom job — the candidate stays selectable and priceable, but the
  // line can only ever be an indicative commercial estimate.
  const tooWide = checkHardRules({ family: "window", operationType: "awning", widthMm: 1400, heightMm: 1200 }, cand());
  assert.equal(tooWide.passed, true, "out-of-range stays selectable so it can be priced");
  assert.equal(tooWide.status, "commercial_only_estimate", "…but never 'ready'");
  assert.equal(tooWide.energyCertified, false);
  const dim = tooWide.filters.find((f) => f.filter === "dimensions");
  assert.equal(dim.severity, "warning");
  assert.match(dim.reason, /composite\/custom/i);
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

test("energy requirement the product cannot meet WARNS but still assigns a product (non-blocking)", () => {
  // WS3: thermal is non-blocking. Glass is mandatory, so a band no glass meets
  // must not eliminate the product — it warns and assigns the closest glass.
  const r = checkHardRules({ family: "window", operationType: "awning", widthMm: 800, heightMm: 1200, requirements: { maxUValue: 2.0 } }, cand());
  assert.equal(r.passed, true, "thermal never eliminates a product");
  assert.equal(r.status, "commercial_only_estimate");
  assert.ok(r.filters.find((f) => f.filter === "energy" && f.severity === "warning"));
  assert.equal(r.energyCertified, false);
  assert.ok(r.eligibleVariantIds.length > 0, "a glass is still eligible (closest)");
});

test("energy requirement with NO performance data ⇒ catalogue_data_incomplete (never a guess)", () => {
  const noPerf = toCandidate({ ...awning, performanceVariants: [] });
  const r = checkHardRules({ family: "window", operationType: "awning", widthMm: 800, heightMm: 1200, requirements: { maxUValue: 4.5 } }, noPerf);
  assert.equal(r.passed, false);
  assert.equal(r.status, "catalogue_data_incomplete");
});

test("energy met by CERTIFIED data ⇒ ready + energyCertified", () => {
  const certified = toCandidate({ ...awning, performanceVariants: [{
    ...awning.performanceVariants[0],
    certified: true,
    dataSource: "certified",
    certificationRef: "WERS-TEST-1",
  }] });
  const r = checkHardRules({ family: "window", operationType: "awning", widthMm: 800, heightMm: 1200, requirements: { maxUValue: 4.5 } }, certified);
  assert.equal(r.status, "ready");
  assert.equal(r.energyCertified, true);
});

test("explicit report limits are exact: a miss is a warned commercial estimate, never a silent 'ready' match", () => {
  // The intent survives the non-blocking move: a near-miss is NOT quietly treated
  // as a certified match. It never reads 'ready'/certified — it warns and stays
  // commercial_only_estimate. No hidden tolerance promotes a miss to a pass.
  const r = checkHardRules({
    family: "window", operationType: "awning", widthMm: 800, heightMm: 1200,
    requirements: { maxUValue: 3.85 },
  }, cand());
  assert.equal(r.passed, true, "non-blocking: product assigned");
  assert.notEqual(r.status, "ready", "a miss is never a certified/ready match");
  assert.equal(r.status, "commercial_only_estimate");
  assert.equal(r.energyCertified, false);
});

test("Uw and SHGC not jointly met by one variant ⇒ warns + assigns closest (never eliminated)", () => {
  // Neither variant meets Uw AND SHGC together. Old behaviour rejected with an
  // empty eligible set; the non-blocking contract keeps a glass eligible so the
  // ranker picks the closest, and flags the line for review.
  const split = toCandidate({
    ...awning,
    performanceVariants: [
      { ...awning.performanceVariants[0], variantId: "u-only", uValue: 2.5, shgc: 0.7 },
      { ...awning.performanceVariants[0], variantId: "shgc-only", uValue: 4.5, shgc: 0.4 },
    ],
  });
  const r = checkHardRules({
    family: "window", operationType: "awning", widthMm: 800, heightMm: 1200,
    requirements: { maxUValue: 3, maxShgc: 0.5 },
  }, split);
  assert.equal(r.passed, true);
  assert.equal(r.status, "commercial_only_estimate");
  assert.ok(r.eligibleVariantIds.length > 0, "closest glass stays eligible, not empty");
});

test("material schedule glazing instructions constrain the exact eligible variant", () => {
  const configurations = toCandidate({
    ...awning,
    performanceVariants: [
      { ...awning.performanceVariants[0], variantId: "single", glazingOptionSlug: "single-clear", glazingClass: "single_clear", uValue: 5.6 },
      { ...awning.performanceVariants[0], variantId: "double", glazingOptionSlug: "double-clear", glazingClass: "double_clear", uValue: 3.2 },
      { ...awning.performanceVariants[0], variantId: "double-low-e", glazingOptionSlug: "double-low-e", glazingClass: "double_lowe", uValue: 2.7 },
      { ...awning.performanceVariants[0], variantId: "catalogue-low-e", glazingOptionSlug: "double-low-e", glazingClass: "double_lowe", uValue: 2.7 },
    ],
  });
  const double = checkHardRules({
    family: "window", operationType: "awning", widthMm: 800, heightMm: 1200,
    scheduleRequirements: { doubleGlazed: true },
  }, configurations);
  assert.deepEqual(double.eligibleVariantIds, ["double", "double-low-e", "catalogue-low-e"]);

  const lowEArgon = checkHardRules({
    family: "window", operationType: "awning", widthMm: 800, heightMm: 1200,
    scheduleRequirements: { doubleGlazed: true, glassDescription: "Low-E argon" },
  }, configurations);
  assert.deepEqual(lowEArgon.eligibleVariantIds, ["double-low-e", "catalogue-low-e"]);
});

test("human-approved thermal precedent is a conservative eligibility floor, not a certification claim", () => {
  const configurations = toCandidate({
    ...awning,
    performanceVariants: [
      { ...awning.performanceVariants[0], variantId: "standard", uValue: 3.9 },
      { ...awning.performanceVariants[0], variantId: "improved", uValue: 2.6 },
    ],
  });
  const learned = checkHardRules({
    family: "window", operationType: "awning", widthMm: 800, heightMm: 1200,
    advisoryRequirements: { maxUValue: 2.8 },
    thermalContext: { requirementBasis: "human_override" },
  }, configurations);
  assert.deepEqual(learned.eligibleVariantIds, ["improved"]);
  assert.equal(learned.energyCertified, false);

  const explicitWins = checkHardRules({
    family: "window", operationType: "awning", widthMm: 800, heightMm: 1200,
    requirements: { maxUValue: 4.0 },
    advisoryRequirements: { maxUValue: 2.0 },
    thermalContext: { requirementBasis: "explicit_energy_report" },
  }, configurations);
  assert.deepEqual(explicitWins.eligibleVariantIds, ["standard", "improved"]);
});

test("catalogue readiness rejects placeholder thermal rows", () => {
  const placeholder = cand();
  assert.equal(catalogueCandidateReadiness(placeholder).ready, false);
  assert.ok(catalogueCandidateReadiness(placeholder).gaps.includes("thermally_described_variant"));

  const ready = {
    ...placeholder,
    performanceVariants: placeholder.performanceVariants.map((variant) => ({
      ...variant,
      frameTechnology: "conventional",
    })),
  };
  assert.equal(catalogueCandidateReadiness(ready).ready, true);
});

test("M2: toCandidate reads the shared thermal profile, preferring it over legacy variants", () => {
  const c = toCandidate({
    ...awning,
    performanceVariants: [{ variantId: "legacy", glazingOptionSlug: "old", glazingClass: "double_clear", uValue: 9, shgc: 0.9, frameType: "aluminium", frameTechnology: "conventional", dataSource: "estimated", certified: false, published: true }],
    thermalProfile: {
      frameTechnology: "thermally_broken",
      rows: [
        { glazingOptionSlug: "dg-lowe", glazingClass: "double_lowe", uValue: 3.9, shgc: 0.24, certified: true, certificationRef: "WERS-1", published: true },
        { glazingOptionSlug: "dg-clear", glazingClass: "double_clear", uValue: 4.6, shgc: 0.47, certified: true, certificationRef: "WERS-2", published: true },
        { glazingOptionSlug: "junk", glazingClass: "not_a_real_class", uValue: 4, shgc: 0.3, certified: true, certificationRef: "W", published: true },
      ],
    },
  });
  // Profile wins over the legacy array; frame tech comes from the profile; the
  // unknown-class row is dropped (no invisible variant).
  assert.deepEqual(c.performanceVariants.map((v) => v.variantId).sort(), ["dg-clear", "dg-lowe"]);
  assert.ok(c.performanceVariants.every((v) => v.frameTechnology === "thermally_broken"));
  assert.ok(c.performanceVariants.every((v) => v.certified && v.dataSource === "certified"));
  assert.equal(catalogueCandidateReadiness(c).ready, true, "a certified multi-glazing profile is ready");
});

test("M4: compliance blends axes — a cell adverse on two axes scores strictly lower than one", () => {
  const band = { maxUValue: 3.0, minShgc: null, maxShgc: 0.4, shgcTarget: null };
  const overU = { glassOptionSlug: "a", variantId: "a", uValue: 3.6, shgc: 0.4, certified: true, pricingOptionSlugs: [] };
  const overBoth = { glassOptionSlug: "b", variantId: "b", uValue: 3.6, shgc: 0.6, certified: true, pricingOptionSlugs: [] };
  assert.ok(gradedComplianceScore(overBoth, band) < gradedComplianceScore(overU, band),
    "second adverse axis lowers the score — no worst-axis tie");
});

test("in-band cells all score a flat 1.0 — compliance does NOT rank by band position (owner rule)", () => {
  // Reversal of the earlier midpoint tie-break: once a cell MEETS the band it is
  // fully compliant. The recommendation among compliant cells is decided by PRICE
  // (the ranker's commercial term), never by which glass is thermally "best" —
  // that biased toward the most expensive option.
  const band = { maxUValue: null, minShgc: 0.3, maxShgc: 0.5, shgcTarget: null };
  const mid = { glassOptionSlug: "n", variantId: "n", uValue: 3, shgc: 0.4, certified: true, pricingOptionSlugs: [] };
  const edge = { glassOptionSlug: "f", variantId: "f", uValue: 3, shgc: 0.5, certified: true, pricingOptionSlugs: [] };
  assert.equal(gradedComplianceScore(mid, band), 1, "in-band ⇒ 1.0");
  assert.equal(gradedComplianceScore(edge, band), 1, "an edge-of-band cell is equally compliant — 1.0");
});

test("M4: the enforced band is the explicit ∩ advisory intersection (ranker shares it with rules)", () => {
  const eff = effectiveThermalRequirements({
    family: "windows", operationType: "awning", widthMm: 1000, heightMm: 1000,
    requirements: { maxUValue: 3.0, minShgc: null, maxShgc: 0.5 },
    advisoryRequirements: { maxUValue: 2.5, minShgc: null, maxShgc: null },
  });
  assert.equal(eff.maxUValue, 2.5, "tighter Uw cap from the advisory wins");
  assert.equal(eff.maxShgc, 0.5, "SHGC cap from the explicit report");
});

test("a product's operation comes from its family (single intrinsic property)", () => {
  const c = toCandidate({ ...awning, seriesOperation: "awning" });
  assert.deepEqual(c.configuration.operationTypes, ["awning"], "family operation is baked in");
  const readiness = catalogueCandidateReadiness({
    ...c,
    performanceVariants: c.performanceVariants.map((v) => ({ ...v, frameTechnology: "conventional" })),
  });
  assert.ok(!readiness.gaps.includes("operation_types"), "the family operation satisfies readiness");
});

test("the catalogue query matches on the family operation only", async () => {
  const repo = fixtureCatalogueRepository([{
    ...awning, category: { slug: { current: "windows" } }, seriesOperation: "awning",
  }]);
  const hit = await repo.queryCandidates("windows", "awning");
  assert.equal(hit.length, 1, "matches its family's operation");
  assert.deepEqual(hit[0].configuration.operationTypes, ["awning"]);
  const miss = await repo.queryCandidates("windows", "sliding");
  assert.equal(miss.length, 0, "does not match an operation its family does not perform");
});

test("selection prices the exact variant that met the report, with extracted quantity", async () => {
  const repo = fixtureCatalogueRepository([{
    ...awning,
    category: { slug: { current: "windows" } },
    performanceVariants: [
      { ...awning.performanceVariants[0], variantId: "standard", uValue: 3.9, shgc: 0.62 },
      { ...awning.performanceVariants[0], variantId: "low-e", uValue: 2.7, shgc: 0.42, pricingOptionSlugs: ["glass-low-e"] },
    ],
  }]);
  let pricedVariant = null;
  let pricedQty = null;
  const result = await selectForOpening({
    family: "windows", operationType: "awning", widthMm: 800, heightMm: 1200,
    qty: 3, requirements: { maxUValue: 3, maxShgc: 0.5 },
    thermalContext: { requirementBasis: "explicit_energy_report" },
  }, repo, async (_candidate, opening, selectedVariant) => {
    pricedVariant = selectedVariant?.variantId;
    pricedQty = opening.qty;
    return { ok: true, total: 3000, unit: 1000 };
  });
  assert.equal(result.selected.selectedVariant.variantId, "low-e");
  assert.equal(pricedVariant, "low-e");
  assert.equal(pricedQty, 3);
});

test("selection ranks every eligible exact variant so finalized precedent can change the choice", async () => {
  const repo = fixtureCatalogueRepository([{
    ...awning,
    category: { slug: { current: "windows" } },
    performanceVariants: [
      { ...awning.performanceVariants[0], variantId: "standard", uValue: 3.9, shgc: 0.62 },
      { ...awning.performanceVariants[0], variantId: "thermally-broken", uValue: 2.7, shgc: 0.42, frameTechnology: "thermally_broken" },
    ],
  }]);
  const result = await selectForOpening(
    { family: "windows", operationType: "awning", widthMm: 800, heightMm: 1200 },
    repo,
    async () => ({ ok: true, total: 1000, unit: 1000 }),
    {
      observations: 20,
      version: "test",
      scoreFor: (_candidate, _opening, exactVariant) =>
        exactVariant?.variantId === "thermally-broken" ? 1 : 0,
    },
  );
  assert.equal(result.evaluated.length, 2);
  assert.equal(result.selected.selectedVariant.variantId, "thermally-broken");
});

test("fixture CatalogueRepository filters by family + operation and stamps a version", async () => {
  const repo = fixtureCatalogueRepository([
    { ...awning, category: { slug: { current: "windows" } } },
    { ...awning, sanityProductId: "product-door", slug: "d", category: { slug: { current: "doors" } }, seriesOperation: "sliding" },
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

test("AI batch pricing loads private tables once, not once per candidate variant", async () => {
  let reads = 0;
  const env = {
    DB: {
      prepare(sql) {
        return {
          async all() {
            reads++;
            if (sql.includes("pricing_rate_card")) {
              return { results: [{ id: "amj80", perim_rate: 55, area_rate: 340, min_charge: 0, version: "v1" }] };
            }
            if (sql.includes("pricing_option_surcharge")) {
              return { results: [{ id: "glazing:low-e", surcharge: 120 }] };
            }
            if (sql.includes("pricing_modifier")) return { results: [] };
            throw new Error(`unexpected all: ${sql}`);
          },
          async first() {
            reads++;
            if (sql.includes("pricing_policy")) {
              return { deposit_percent: 40, gst_mode: "inc", version: "v1" };
            }
            if (sql.includes("discount_percent")) return { discount_percent: 5 };
            throw new Error(`unexpected first: ${sql}`);
          },
          bind() { return this; },
        };
      },
    },
  };
  const price = await createCachedPriceResolver(env, "user-1");
  assert.equal(reads, 5, "one bounded pricing snapshot");
  for (let i = 0; i < 100; i++) {
    const result = price({
      family: "amj80", widthMm: 1200, heightMm: 900, qty: 1,
      optionSlugs: ["glazing:low-e"], requireExactRate: true, requireAllOptions: true,
    });
    assert.equal(result.ok, true);
  }
  assert.equal(reads, 5, "candidate pricing is pure after the initial snapshot");
});

test("pricing: option surcharges add to the unit; missing dims ⇒ not ok", () => {
  const withOpt = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1000, heightMm: 1200, qty: 1, optionSurcharges: [{ value: 130, basis: "per_unit" }, { value: 40, basis: "per_unit" }] });
  const base = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1000, heightMm: 1200, qty: 1 });
  assert.ok(withOpt.unit > base.unit);
  const bad = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 0, heightMm: 1200, qty: 1 });
  assert.equal(bad.ok, false);
  assert.equal(bad.total, 0);
});

test("pricing: a per-m² surcharge (glass) scales with glazed area, unlike a flat one", () => {
  // Same $/m² glass on two sizes must contribute in proportion to area, and a
  // per_unit surcharge of the same number must NOT scale.
  const small = { family: "awning-window", widthMm: 1000, heightMm: 1000, qty: 1 }; // 1.0 m²
  const big = { family: "awning-window", widthMm: 2000, heightMm: 1000, qty: 1 };   // 2.0 m²
  const perSqm = { value: 90, basis: "per_sqm" };
  const glassSmall = computePrice(RATE, POLICY, { ...small, optionSurcharges: [perSqm] });
  const glassBig = computePrice(RATE, POLICY, { ...big, optionSurcharges: [perSqm] });
  const bareSmall = computePrice(RATE, POLICY, small);
  const bareBig = computePrice(RATE, POLICY, big);
  // The glass contribution is 90×area: 90 on 1 m², 180 on 2 m² (before rounding).
  const smallGlass = glassSmall.unit - bareSmall.unit;
  const bigGlass = glassBig.unit - bareBig.unit;
  assert.ok(bigGlass > smallGlass, "more glazed area costs more glass");
  // Roughly double (both land on the $10 grid): 2 m² glass ≈ 2× the 1 m² glass.
  assert.ok(Math.abs(bigGlass - 2 * smallGlass) <= 10, "per-m² glass scales ~linearly with area");
  // A per_unit surcharge of the same magnitude is flat across sizes.
  const flat = { value: 90, basis: "per_unit" };
  const flatSmall = computePrice(RATE, POLICY, { ...small, optionSurcharges: [flat] }).unit - bareSmall.unit;
  const flatBig = computePrice(RATE, POLICY, { ...big, optionSurcharges: [flat] }).unit - bareBig.unit;
  assert.equal(flatSmall, flatBig, "a per-unit surcharge does not scale with area");
});

// ── Per-product conditional pricing modifiers (private D1, migration 0026) ────
const WIDE = {
  id: "wide-frame-awning-window", seq: 10, label: "Wide frame surcharge (width > 1200mm)",
  whenField: "width", whenOp: ">", whenValue: 1200, thenType: "percent", thenValue: 10,
};

test("modifier: width > 1200mm adds exactly 10%; at or below is untouched", () => {
  // 1400×1200: perimeter 5.2m×55 = 286; area 1.68m²×340 = 571.2; base = 857.2
  const base = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1400, heightMm: 1200, qty: 1 });
  const wide = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1400, heightMm: 1200, qty: 1, modifiers: [WIDE] });
  assert.equal(base.unit, 860, "base rounds to the $10 grid");
  assert.equal(wide.unit, 940, "857.2 × 1.10 = 942.9 → 940 on the $10 grid");
  assert.deepEqual(wide.appliedModifiers, [WIDE.id], "applied rule recorded for audit");

  // Exactly 1200 must NOT trigger a strictly-greater-than rule.
  const at = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1200, heightMm: 1200, qty: 1, modifiers: [WIDE] });
  const atNoMod = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1200, heightMm: 1200, qty: 1 });
  assert.equal(at.unit, atNoMod.unit);
  assert.deepEqual(at.appliedModifiers, []);
});

test("modifier: applies per unit so qty multiplies the surcharged price", () => {
  const one = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1400, heightMm: 1200, qty: 1, modifiers: [WIDE] });
  const three = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1400, heightMm: 1200, qty: 3, modifiers: [WIDE] });
  assert.equal(three.total, one.unit * 3);
});

test("modifier: seq order is deterministic and percent compounds on the running subtotal", () => {
  const pct = { ...WIDE, id: "pct", seq: 1, thenType: "percent", thenValue: 10 };
  const flat = { ...WIDE, id: "flat", seq: 2, thenType: "fixed", thenValue: 100 };
  // seq 1 then 2: (base × 1.1) + 100 — different from the reverse order.
  const a = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1400, heightMm: 1200, qty: 1, modifiers: [flat, pct] });
  const b = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1400, heightMm: 1200, qty: 1, modifiers: [{ ...pct, seq: 2 }, { ...flat, seq: 1 }] });
  assert.deepEqual(a.appliedModifiers, ["pct", "flat"], "input array order is irrelevant — seq decides");
  assert.equal(a.unit, 1040, "857.2 ×1.1 = 942.9 + 100 = 1042.9 → 1040");
  assert.equal(b.unit, 1050, "(857.2 + 100) ×1.1 = 1052.9 → 1050");
});

test("modifier: non-matching field conditions never fire", () => {
  const tallOnly = { ...WIDE, id: "tall", whenField: "height", whenValue: 3000 };
  const s = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1400, heightMm: 1200, qty: 1, modifiers: [tallOnly] });
  assert.deepEqual(s.appliedModifiers, []);
});

test("pricing: snapshot exposes a TOTAL, never a per-option breakdown", () => {
  const s = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1000, heightMm: 1200, qty: 1, optionSurcharges: [{ value: 130, basis: "per_unit" }] });
  assert.ok(!("optionSurcharges" in s) && !("options" in s), "no per-option breakdown leaks into the snapshot");
});

test("pricing: exact configuration fails closed when any option surcharge is missing", async () => {
  const values = new Map([["included-option", 0], ["paid-option", 125]]);
  const env = {
    DB: {
      prepare() {
        let slug;
        return {
          bind(value) { slug = value; return this; },
          async first() {
            return values.has(slug) ? { surcharge: values.get(slug) } : null;
          },
        };
      },
    },
  };
  assert.deepEqual(
    await loadOptionSurcharges(env, ["included-option", "paid-option"], true),
    [{ value: 0, basis: "per_unit" }, { value: 125, basis: "per_unit" }],
    "zero-dollar included options still count as resolved",
  );
  await assert.rejects(
    loadOptionSurcharges(env, ["included-option", "unknown-option"], true),
    /missing_option_surcharge/,
  );
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

test("selection: an opening too big for the small unit selects the one that actually fits", async () => {
  const repo = fixtureCatalogueRepository([smallAwning, bigAwning]);
  // 1200 wide exceeds smallAwning (max 1000) but fits bigAwning (max 1300).
  const res = await selectForOpening({ family: "windows", operationType: "awning", widthMm: 1200, heightMm: 1200, externalRef: "W02" }, repo, priceFn);
  assert.equal(res.selected.candidate.sanityProductId, "product-amj100t-awning-window");
  assert.equal(res.selected.outcome.status, "ready", "the fitting unit is a genuine fit, not an estimate");
  // The small unit is still evaluated (warned, indicative) but must NOT win when
  // a genuinely fitting product exists.
  const small = res.evaluated.find((e) => e.candidate.sanityProductId === "product-amj80-series-awning-window");
  assert.equal(small.selected, false);
  assert.equal(small.outcome.status, "commercial_only_estimate");
});

test("selection: when NOTHING fits, the largest best-fit wins and the line is indicative", async () => {
  const repo = fixtureCatalogueRepository([smallAwning, bigAwning]);
  // 2050 wide exceeds BOTH (max 1000 / 1300) — a composite job. The biggest unit
  // must win: picking the cheaper small one would systematically under-quote.
  const res = await selectForOpening({ family: "windows", operationType: "awning", widthMm: 2050, heightMm: 2000, externalRef: "W01" }, repo, priceFn);
  assert.ok(res.selected, "an oversized opening is still priced (indicative), not dropped");
  assert.equal(res.selected.candidate.sanityProductId, "product-amj100t-awning-window", "largest coverage wins");
  assert.equal(res.selected.outcome.status, "commercial_only_estimate");
  assert.ok(res.selected.price?.ok, "priced at the real opening size");
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

test("owner rule: among compliant glasses the CHEAPEST is recommended, not the thermally-best", () => {
  // Both variants MEET the Uw cap, so both score compliance 1.0. The pricier one has
  // a slightly better Uw/SHGC — under the old midpoint tie-break it would have won.
  // With flat in-band compliance, the commercial term picks the cheaper glass.
  const opening = { operationType: "awning", widthMm: 700, heightMm: 1400, requirements: { maxUValue: 4.0 } };
  const cand = toCandidate({ ...awning, sanityProductId: "amjX" });
  const v = (id, u, shgc) => ({ variantId: id, glazingOptionSlug: id, glazingClass: "double_clear", uValue: u, shgc, certified: true, dataSource: "certified", published: true, pricingOptionSlugs: [] });
  const cheap = { candidate: cand, outcome: { passed: true, status: "ready" }, selectedVariant: v("cheap", 3.4, 0.42), price: { total: 900, ok: true } };
  const pricey = { candidate: cand, outcome: { passed: true, status: "ready" }, selectedVariant: v("pricey", 3.0, 0.36), price: { total: 1500, ok: true } };
  const ranked = rankCandidates(opening, [pricey, cheap]);
  assert.equal(ranked.find((r) => r.rank === 1).performanceVariantId, "cheap");
});

test("r2Keys: layout is consistent and path-traversal-safe", () => {
  assert.equal(r2Keys.source("p1", "d1", "plan.pdf"), "projects/p1/source/d1/plan.pdf");
  assert.equal(r2Keys.page("p1", "d1", 7), "projects/p1/pages/d1/page-0007.png");
  assert.equal(r2Keys.extraction("p1", "r1", "openings"), "projects/p1/extractions/r1/openings.json");
  // Traversal / odd characters are neutralised.
  const evil = r2Keys.source("p1", "../../etc", "a b/../c.pdf");
  assert.ok(!evil.includes(".."));
  assert.ok(!evil.includes("/etc/"));
});

test("energy skill validate: clamps untrusted model output, never guesses", () => {
  const good = energyReportExtractor.validate(JSON.stringify({ constraints: [
    { ref: "W04", maxUValue: 2.27, minShgc: 0.37, maxShgc: 0.41, glazingNote: "obscure", orientation: "w", room: "Media" },
  ], precedenceStatement: "The energy report takes precedence over plans." }));
  assert.equal(good.constraints.length, 1);
  assert.equal(good.constraints[0].maxUValue, 2.27);
  assert.equal(good.constraints[0].ref, "W04");
  assert.equal(good.constraints[0].orientation, "W", "orientation normalized to compass vocabulary");
  assert.match(good.precedenceStatement, /takes precedence/, "report's own precedence statement captured (§9.1)");

  // Out-of-range numbers are dropped to null (not clamped to a fake value).
  const oor = energyReportExtractor.validate({ constraints: [{ ref: "W1", maxUValue: 999, minShgc: 5 }] });
  assert.equal(oor.constraints[0].maxUValue, null);
  assert.equal(oor.constraints[0].minShgc, null);

  // Non-conforming payloads ⇒ null (nothing trusted).
  assert.equal(energyReportExtractor.validate({ nope: true }), null);
  assert.equal(energyReportExtractor.validate("not json"), null);

  // A row with no usable data is filtered out; zero usable rows ⇒ failed extraction.
  assert.equal(energyReportExtractor.validate({ constraints: [{ ref: null, maxUValue: null }] }), null);
});

test.after(() => removeRunDir(runDir));
