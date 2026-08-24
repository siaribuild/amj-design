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
      export { toCandidate, fixtureCatalogueRepository, createCatalogueRepository, catalogueCandidateReadiness, catalogueCandidateOfferability } from ${p("worker/lib/estimator/catalogue.ts")};
      export { checkHardRules, RULE_VERSION, effectiveThermalRequirements, fitFacts, resolvedRequirement } from ${p("worker/lib/estimator/rules.ts")};
      export { computePrice, loadOptionSurcharges, createCachedPriceResolver } from ${p("worker/lib/estimator/pricing.ts")};
      export { selectForOpening } from ${p("worker/lib/estimator/select.ts")};
      export { r2Keys } from ${p("worker/lib/estimator/storage.ts")};
      export { energyReportExtractor } from ${p("worker/lib/estimator/skills/energy.ts")};
      export { SUPPORTED_SCHEMA_VERSION } from ${p("worker/lib/estimator/types.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { toCandidate, fixtureCatalogueRepository, catalogueCandidateReadiness, catalogueCandidateOfferability, checkHardRules, RULE_VERSION, computePrice, loadOptionSurcharges, createCachedPriceResolver, selectForOpening, r2Keys, energyReportExtractor, SUPPORTED_SCHEMA_VERSION, effectiveThermalRequirements, fitFacts, resolvedRequirement } = await import(pathToFileURL(outfile).href);

const RATE = { id: "awning-window", perimRate: 55, areaRate: 340, minCharge: 0, version: "v1" };
// depositPercent is gone from PricingPolicy (0043) — deposit is always
// DEPOSIT_PERCENT (50), a constant computePrice imports itself, not a field
// on this fixture.
const POLICY = { gstMode: "inc", version: "v1" };

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
  const dim = tooWide.filters.find((f) => f.filter === "dimensions");
  assert.equal(dim.severity, "warning");
  assert.match(dim.reason, /composite\/custom/i);
});

test("fitFacts is the ONE home for whether a candidate serves the opening", () => {
  const rule = cand().dimensionRule;
  const ok = fitFacts({ widthMm: 800, heightMm: 1200 }, rule);
  assert.equal(ok.fits, true);
  assert.deepEqual(ok.breached, []);
  assert.equal(ok.limit.maxWidthMm, 1000);

  // Every breached axis is named, not just the first one found.
  const wide = fitFacts({ widthMm: 1400, heightMm: 1200 }, rule);
  assert.equal(wide.fits, false);
  assert.deepEqual(wide.breached, ["width"]);

  // Area is its own limit, independent of the width and height ranges.
  const area = fitFacts({ widthMm: 1000, heightMm: 2400 }, { ...rule, maxAreaM2: 1.5 });
  assert.equal(area.fits, false);
  assert.deepEqual(area.breached, ["area"]);
  // …and at exactly the cap it still fits.
  assert.equal(fitFacts({ widthMm: 1000, heightMm: 2400 }, rule).fits, true);

  const aspect = fitFacts({ widthMm: 400, heightMm: 2400 }, rule);
  assert.deepEqual(aspect.breached, ["aspect"]);

  // No rule and unknown size are both "cannot be asserted to fit", with the
  // limits reported as far as they are known.
  assert.equal(fitFacts({ widthMm: 800, heightMm: 1200 }, null).fits, false);
  assert.equal(fitFacts({ widthMm: 800, heightMm: 1200 }, null).limit, null);
  assert.equal(fitFacts({ widthMm: null, heightMm: null }, rule).fits, false);

  // AD5: checkDimensions keeps its `warning` severity so the ops line-revalidation
  // surface still lists configurations for an existing oversize line. Fit HARDNESS
  // is applied by the ladder, not by re-severing this filter — two questions, one
  // fit-fact home.
  const dim = checkHardRules({ family: "window", operationType: "awning", widthMm: 1400, heightMm: 1200 }, cand())
    .filters.find((f) => f.filter === "dimensions");
  assert.equal(dim.severity, "warning");
});

test("resolvedRequirement carries the band, its basis and whether there is one", () => {
  const none = resolvedRequirement({ family: "window", operationType: "awning" });
  assert.equal(none.absent, true);
  assert.equal(none.maxUValue, null);
  assert.equal(none.basis, null);

  const explicit = resolvedRequirement({
    requirements: { maxUValue: 4.0, minShgc: 0.3 },
    thermalContext: { requirementBasis: "explicit_energy_report" },
  });
  assert.equal(explicit.absent, false);
  assert.equal(explicit.maxUValue, 4.0);
  assert.equal(explicit.minShgc, 0.3);
  assert.equal(explicit.basis, "explicit_energy_report");

  // AC-10: a COMPUTED requirement is as real as a reported one. Only the basis
  // differs; the band the ladder judges against is identical.
  const computed = resolvedRequirement({
    requirements: { maxUValue: 4.0, minShgc: 0.3 },
    thermalContext: { requirementBasis: "plan_derived" },
  });
  assert.equal(computed.basis, "plan_derived");
  assert.equal(computed.maxUValue, explicit.maxUValue);
  assert.equal(computed.minShgc, explicit.minShgc);
  assert.equal(computed.absent, explicit.absent);

  // AC-16/E6: an impossible band is coerced, and where coercion leaves nothing
  // the opening has NO requirement — it must never zero every product.
  const impossible = resolvedRequirement({ requirements: { minShgc: 0.5, maxShgc: 0.41 } });
  assert.equal(impossible.absent, true);
  assert.equal(impossible.minShgc, null);
});

test("AD16 RULE_VERSION names the model that produced a run", () => {
  // Behaviour changed, so runs must be attributable: a persisted outcome from
  // before energy became an objective must not read as one from after.
  assert.equal(RULE_VERSION, "v3-energy-objective");
  assert.equal(checkHardRules({ family: "window", operationType: "awning", widthMm: 800, heightMm: 1200 }, cand()).ruleVersion, "v3-energy-objective");
});

test("wrong operation is rejected", () => {
  const r = checkHardRules({ family: "window", operationType: "sliding", widthMm: 800, heightMm: 1200 }, cand());
  assert.equal(r.passed, false);
  assert.ok(r.filters.find((f) => f.filter === "operation" && f.severity === "reject"));
});

test("ADR 0011: a requirement met by the product's own figures is READY, with no second opinion", () => {
  // WAS: "an energy requirement met only by ESTIMATED data ⇒ commercial_only_estimate".
  // The `certified` flag that produced that downgrade is deleted (ADR 0011). A
  // product's thermal figures are its single source: Uw 3.9 against a 4.5 cap
  // MEETS, and the line says so. The variant carries no certification reference
  // at all here, which is precisely the case that used to be punished.
  const r = checkHardRules({ family: "window", operationType: "awning", widthMm: 800, heightMm: 1200, requirements: { maxUValue: 4.5 } }, cand());
  assert.equal(r.passed, true);
  assert.equal(r.status, "ready");
  assert.equal(cand().performanceVariants[0].certificationRef, null, "and it is ready WITHOUT a reference");
});

test("D4 energy is an OBJECTIVE: the rules engine emits no energy filter and no energy status", () => {
  // The band a product cannot meet is no longer a rules verdict of any severity
  // — not reject, not warning. Every published variant that satisfies the
  // schedule's glazing instruction is a candidate configuration, and the LADDER
  // tiers the ones that miss. Two sources of truth about thermal is exactly the
  // problem the ladder exists to kill.
  const r = checkHardRules({ family: "window", operationType: "awning", widthMm: 800, heightMm: 1200, requirements: { maxUValue: 2.0 } }, cand());
  assert.equal(r.passed, true, "thermal never eliminates a product");
  assert.equal(r.filters.find((f) => f.filter === "energy"), undefined, "no energy filter is emitted");
  assert.deepEqual(r.eligibleVariantIds, ["std"], "every published variant stays eligible");
  // Nor an energy STATUS. The rules engine now has no opinion about thermal at
  // any severity: this variant misses the 2.0 cap badly and the verdict is still
  // 'ready', because the downgrade for missing a band belongs to the LADDER
  // (tier != meets ⇒ commercial_only_estimate) and to it alone. Proven
  // end-to-end below and in certified-removal.test.mjs (CERT-AC-5).
  assert.equal(r.status, "ready");
});

test("energy requirement with NO performance data ⇒ catalogue_data_incomplete (never a guess)", () => {
  const noPerf = toCandidate({ ...awning, performanceVariants: [] });
  const r = checkHardRules({ family: "window", operationType: "awning", widthMm: 800, heightMm: 1200, requirements: { maxUValue: 4.5 } }, noPerf);
  assert.equal(r.passed, false);
  assert.equal(r.status, "catalogue_data_incomplete");
});

test("ADR 0011: a WERS reference changes nothing — it is provenance, not a gate", () => {
  const referenced = toCandidate({ ...awning, performanceVariants: [{
    ...awning.performanceVariants[0],
    certificationRef: "WERS-TEST-1",
  }] });
  const r = checkHardRules({ family: "window", operationType: "awning", widthMm: 800, heightMm: 1200, requirements: { maxUValue: 4.5 } }, referenced);
  assert.equal(r.status, "ready");
  // Same verdict as the unreferenced variant above: the reference is carried
  // through to the candidate, and reads on nothing.
  assert.equal(referenced.performanceVariants[0].certificationRef, "WERS-TEST-1");
});

test("explicit report limits are exact: a miss is an indicative estimate, never a silent 'ready' match", async () => {
  // The intent survives both the non-blocking move AND the certification removal
  // — but it now lives one layer up. checkHardRules has no thermal opinion, so
  // the miss has to be caught by the ladder, and the LINE is what must never
  // read 'ready'. No hidden tolerance promotes a miss to a pass.
  const miss = { family: "windows", operationType: "awning", widthMm: 800, heightMm: 1200, requirements: { maxUValue: 3.85 } };
  const r = await selectForOpening(miss, fixtureCatalogueRepository([awning]), async () => ({ ok: true, total: 500, unit: 500 }));
  assert.ok(r.selected, "non-blocking: product assigned");
  assert.equal(r.selected.candidateOutcome.tier, "within_tolerance", "3.9 against a 3.85 cap is inside the 5% tolerance");
  assert.notEqual(r.status, "ready", "a miss is never a silent ready match");
  assert.equal(r.status, "commercial_only_estimate");
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
  assert.equal(r.status, "ready", "the rules engine no longer downgrades for thermal at all (ADR 0011)");
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
  // E14/D4: the precedent is still RESOLVED into the effective requirement — it
  // is a real requirement, and the ladder judges every candidate against it. It
  // no longer culls the eligible set, because a near-miss must stay selectable.
  assert.deepEqual(learned.eligibleVariantIds, ["standard", "improved"]);
  assert.equal(effectiveThermalRequirements({
    advisoryRequirements: { maxUValue: 2.8 },
    thermalContext: { requirementBasis: "human_override" },
  }).maxUValue, 2.8, "the precedent binds selection through the resolved band");

  // An explicit energy report still wins outright over the advisory band.
  assert.equal(effectiveThermalRequirements({
    requirements: { maxUValue: 4.0 },
    advisoryRequirements: { maxUValue: 2.0 },
    thermalContext: { requirementBasis: "explicit_energy_report" },
  }).maxUValue, 4.0);
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

// ── Offerability: the customer-facing completeness gate ─────────────────────
// A DIFFERENT bar from readiness, and the difference is the point. Readiness
// decides whether the published catalogue is authored well enough to spend
// model budget against; offerability decides whether one product can be quoted
// to a customer at all. Conflating them would withhold sellable products.
test("offerability is a LOWER bar than readiness — frame technology never blocks a sale", () => {
  // The realistic fixture: Uw, SHGC and a glazing slug all present, frame
  // technology never filled in (toCandidate maps absent -> "unknown").
  const c = cand();
  assert.equal(catalogueCandidateReadiness(c).ready, false, "readiness wants frame technology");
  assert.ok(catalogueCandidateReadiness(c).gaps.includes("thermally_described_variant"));
  assert.equal(catalogueCandidateOfferability(c).offerable, true,
    "but the product is perfectly quotable — one unfilled descriptive field must not cost a sale");
  assert.deepEqual(catalogueCandidateOfferability(c).gaps, []);
});

test("offerability withholds a product with NO usable glazing/thermal row, and names the gap", () => {
  // This is the state the 15 unmigrated products land in the moment the legacy
  // performanceVariants array is removed from them.
  const stripped = toCandidate({ ...awning, performanceVariants: [] });
  const verdict = catalogueCandidateOfferability(stripped);
  assert.equal(verdict.offerable, false);
  assert.deepEqual(verdict.gaps, ["thermally_described_variant"]);

  // An unpublished row is not a usable one either.
  const unpublished = toCandidate({
    ...awning,
    performanceVariants: [{ ...awning.performanceVariants[0], published: false }],
  });
  assert.equal(catalogueCandidateOfferability(unpublished).offerable, false);

  // Nor is one missing the numbers thermal reasoning needs.
  const noNumbers = toCandidate({
    ...awning,
    performanceVariants: [{ ...awning.performanceVariants[0], uValue: null, shgc: null }],
  });
  assert.equal(catalogueCandidateOfferability(noNumbers).offerable, false);
});

test("glazing is OPTIONAL: no glass choice still sells, at frame + area", () => {
  // Owner rule: "use it when it exists, do not when it does not". A row with
  // Uw and SHGC but no glazing option can be priced (lib/lines.ts only adds the
  // glass surcharge `if (glazingSlug)`) and can be checked against a band, so
  // withholding it would refuse to sell a window we can both price and rate.
  // Contrast with the case above: no Uw/SHGC is what genuinely disqualifies,
  // because a band always exists now and nothing could be claimed against it.
  const noGlassChoice = toCandidate({
    ...awning,
    performanceVariants: [{ ...awning.performanceVariants[0], glazingOptionSlug: null, glazingClass: null }],
  });
  assert.equal(catalogueCandidateOfferability(noGlassChoice).offerable, true);
  assert.deepEqual(catalogueCandidateOfferability(noGlassChoice).gaps, []);
  // Readiness still wants it — the two bars differ here on purpose.
  assert.equal(catalogueCandidateReadiness(noGlassChoice).ready, false);
});

test("offerability reports EVERY gap at once, not the first", () => {
  const broken = toCandidate({ ...awning, seriesOperation: null, dimensionRule: null, performanceVariants: [] });
  const gaps = catalogueCandidateOfferability(broken).gaps.sort();
  assert.deepEqual(gaps, ["dimension_rule", "operation_types", "thermally_described_variant"],
    "fixing one record only to discover the next is missing is two trips through a screen someone has to go find");
});

test("a glazing priced at $0 is a PRICED option — the product stays offerable", () => {
  // $0 and no-price are different states by design: $0 is an explicit ops
  // decision ("Included"), a missing row is an unknown option that fails
  // closed. A product whose every glazing is $0 must therefore price at
  // frame + area and be offered normally — it is not a broken product.
  const c = cand();
  assert.equal(catalogueCandidateOfferability(c).offerable, true);
  const priced = computePrice(
    { id: "awning-window", perimRate: 55, areaRate: 340, minCharge: 0, version: "v1" },
    POLICY,
    { family: "awning-window", widthMm: 1200, heightMm: 1200, qty: 1, options: [{ value: 0, basis: "per_sqm" }] },
  );
  assert.ok(priced.total > 0, "a $0 glazing does not zero the line — the frame and area still cost money");
  const withoutGlass = computePrice(
    { id: "awning-window", perimRate: 55, areaRate: 340, minCharge: 0, version: "v1" },
    POLICY,
    { family: "awning-window", widthMm: 1200, heightMm: 1200, qty: 1, options: [] },
  );
  assert.equal(priced.total, withoutGlass.total, "and it adds exactly nothing, which is what $0 means");
});

test("selection withholds an incomplete product and says WHY, instead of reporting no candidate", () => {
  const complete = { ...awning, category: { slug: { current: "windows" } } };
  const incomplete = {
    ...awning, sanityProductId: "product-halfauthored", slug: "halfauthored",
    category: { slug: { current: "windows" } }, performanceVariants: [],
  };
  return (async () => {
    // Both products exist for this operation; only one is authored.
    const mixed = fixtureCatalogueRepository([complete, incomplete]);
    const res = await selectForOpening(
      { family: "windows", operationType: "awning", widthMm: 800, heightMm: 1200, externalRef: "W01" }, mixed, priceFn);
    assert.equal(res.selected.candidate.slug, "amj80-series-awning-window", "the authored one is still quoted");
    assert.deepEqual(res.withheldIncomplete, [{ slug: "halfauthored", gaps: ["thermally_described_variant"] }]);
    assert.ok(res.evaluated.every((e) => e.candidate.slug !== "halfauthored"),
      "the incomplete product is never evaluated, so it can never be recommended");

    // And when the ONLY product of that shape is incomplete, the line must not
    // claim the catalogue sells nothing of this shape — it does, it is broken.
    const onlyBroken = fixtureCatalogueRepository([incomplete]);
    const empty = await selectForOpening(
      { family: "windows", operationType: "awning", widthMm: 800, heightMm: 1200, externalRef: "W02" }, onlyBroken, priceFn);
    assert.equal(empty.selected, null);
    assert.equal(empty.status, "catalogue_data_incomplete",
      "not 'no_candidate' — that would send someone to re-measure an opening that was never the problem");
    assert.deepEqual(empty.withheldIncomplete.map((w) => w.slug), ["halfauthored"]);
  })();
});

test("M2: toCandidate reads the shared thermal profile, preferring it over legacy variants", () => {
  const c = toCandidate({
    ...awning,
    performanceVariants: [{ variantId: "legacy", glazingOptionSlug: "old", glazingClass: "double_clear", uValue: 9, shgc: 0.9, frameType: "aluminium", frameTechnology: "conventional", dataSource: "estimated", certified: false, published: true }],
    thermalProfile: {
      frameTechnology: "thermally_broken",
      rows: [
        { glazingOptionSlug: "dg-lowe", glazingClass: "double_lowe", uValue: 3.9, shgc: 0.24, certificationRef: "WERS-1", published: true },
        { glazingOptionSlug: "dg-clear", glazingClass: "double_clear", uValue: 4.6, shgc: 0.47, certificationRef: "WERS-2", published: true },
        { glazingOptionSlug: "junk", glazingClass: "not_a_real_class", uValue: 4, shgc: 0.3, certificationRef: "W", published: true },
      ],
    },
  });
  // Profile wins over the legacy array; frame tech comes from the profile; the
  // unknown-class row is dropped (no invisible variant).
  assert.deepEqual(c.performanceVariants.map((v) => v.variantId).sort(), ["dg-clear", "dg-lowe"]);
  assert.ok(c.performanceVariants.every((v) => v.frameTechnology === "thermally_broken"));
  assert.deepEqual(c.performanceVariants.map((v) => v.certificationRef).sort(), ["WERS-1", "WERS-2"], "the WERS reference is carried through as provenance");
  assert.equal(catalogueCandidateReadiness(c).ready, true, "a multi-glazing profile is ready");
});

test("low-E survives EITHER spelling — `double_low_e` (WERS import) and `double_lowe` (seed) are one class", () => {
  // Regression: the WERS importer writes `double_low_e`, the allow-list held only
  // `double_lowe`, so every imported low-E cell was dropped at map time — deleting
  // exactly the glass that can meet a thermal band, and leaving clear/toned glass
  // to be recommended against a Uw cap it cannot reach.
  const c = toCandidate({
    ...awning,
    performanceVariants: [],
    thermalProfile: {
      frameTechnology: "thermally_broken",
      rows: [
        { glazingOptionSlug: "wers-lowe", glazingClass: "double_low_e", uValue: 3.1, shgc: 0.37, certified: true, certificationRef: "WERS-1", published: true },
        { glazingOptionSlug: "seed-lowe", glazingClass: "double_lowe", uValue: 2.9, shgc: 0.21, certified: true, certificationRef: "WERS-2", published: true },
        { glazingOptionSlug: "clear", glazingClass: "double_clear", uValue: 4.6, shgc: 0.47, certified: true, certificationRef: "WERS-3", published: true },
        { glazingOptionSlug: "junk", glazingClass: "not_a_real_class", uValue: 4, shgc: 0.3, certified: true, certificationRef: "W", published: true },
      ],
    },
  });
  assert.deepEqual(c.performanceVariants.map((v) => v.variantId).sort(), ["clear", "seed-lowe", "wers-lowe"],
    "both low-E spellings map through; only the genuinely unknown class is dropped");
  // Canonical form downstream, so the `_lowe$` low-E tests in rules/configuration hit.
  assert.deepEqual(c.performanceVariants.filter((v) => /_lowe$/.test(v.glazingClass)).map((v) => v.variantId).sort(),
    ["seed-lowe", "wers-lowe"], "an imported low-E cell reads as low-E, not as an unclassified variant");
});

// Two gradedComplianceScore tests lived here — a blend-across-axes pin and an
// in-band-scores-1.0 pin — and went with the function (ADR 0007). The blend was
// the wrong shape by spec A1: a requirement is a CONJUNCTION, so the degree to
// which a candidate fails it is the worst of its failures, not a product of
// them, and summing punished one failure twice while making the tolerance band
// uninterpretable. Their replacements live in thermal-selection.test.mjs, in the
// deviation vocabulary.

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

// A withdrawn product must be unreachable by the MACHINE and fully reachable by
// OPS — the two halves of the same rule, so they are asserted together.
test("a disabled product is never selected automatically, and still reaches ops", async () => {
  const rows = [
    { ...awning, category: { slug: { current: "windows" } }, disabled: true },
    {
      ...awning, category: { slug: { current: "windows" } },
      sanityProductId: "product-live", slug: "amj100l-series-awning-window", name: "AMJ100L Series Awning Window",
    },
  ];
  const repo = fixtureCatalogueRepository(rows);

  // OPS: the repository still carries it. This is the path /lines/:id/configurations
  // and the ops PATCH revalidation both use, so a line quoted before the product
  // was withdrawn can still be opened, reconfigured and repriced.
  const candidates = await repo.queryCandidates("windows", "awning");
  assert.equal(candidates.length, 2, "the repository keeps withdrawn products for ops");
  assert.equal(candidates.find((c) => c.slug === "amj80-series-awning-window").disabled, true);
  assert.equal(candidates.find((c) => c.slug === "amj100l-series-awning-window").disabled, false,
    "absent in the document means available, not disabled");

  // THE MACHINE: it is not a candidate, even though it is otherwise a perfect fit.
  const priceFn = async () => ({ ok: true, unit: 500, total: 500, depositAmount: 250, currency: "AUD", rateCardId: "r", rateCardVersion: "v1", pricingPolicyVersion: "v1", depositPercent: 50, discountPercent: 0 });
  const result = await selectForOpening(
    { family: "windows", operationType: "awning", widthMm: 800, heightMm: 1200, qty: 1 },
    repo, priceFn,
  );
  assert.equal(result.selected.candidate.slug, "amj100l-series-awning-window");
  assert.ok(!result.evaluated.some((e) => e.candidate.disabled),
    "a withdrawn product is not even evaluated, so it cannot surface as an alternative");
});

test("disabling every product for an operation leaves the line unavailable, not wrong", async () => {
  const repo = fixtureCatalogueRepository([
    { ...awning, category: { slug: { current: "windows" } }, disabled: true },
  ]);
  const result = await selectForOpening(
    { family: "windows", operationType: "awning", widthMm: 800, heightMm: 1200, qty: 1 },
    repo, async () => null,
  );
  // There is genuinely nothing left to sell. Saying so is the honest answer, and
  // is what the empty-catalogue case has always done.
  assert.equal(result.selected, null);
  assert.equal(result.status, "no_candidate");
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
  const priceOf = { standard: 1000, "thermally-broken": 1400 };
  const price = async (_c, _o, variant) => ({ ok: true, total: priceOf[variant.variantId], unit: priceOf[variant.variantId] });
  const opening = { family: "windows", operationType: "awning", widthMm: 800, heightMm: 1200 };

  // Every eligible EXACT variant is a candidate in its own right, so a band can
  // change which glass wins without changing the product.
  const noBand = await selectForOpening(opening, repo, price);
  assert.equal(noBand.evaluated.length, 2);
  assert.equal(noBand.selected.selectedVariant.variantId, "standard", "no band ⇒ cheapest glass");

  // Tighten the requirement past the cheap glass and the dearer one is the only
  // candidate that meets it — the ladder pays $400 to meet the brief (D2).
  const banded = await selectForOpening({ ...opening, requirements: { maxUValue: 3.0 } }, repo, price);
  assert.equal(banded.selected.selectedVariant.variantId, "thermally-broken");
  assert.equal(banded.selected.candidateOutcome.tier, "meets");
  const cheapMiss = banded.evaluated.find((e) => e.selectedVariant.variantId === "standard");
  assert.equal(cheapMiss.candidateOutcome.tier, "misses");
  assert.equal(cheapMiss.candidateOutcome.competing, false);
  // AC-44's sign convention: the loser is $400 cheaper than the pick and loses.
  assert.equal(cheapMiss.candidateOutcome.price.deltaToSelected, -400);
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

test("pricing: perimeter+area model, ×qty, 50% deposit, snapshot versions", () => {
  const s = computePrice(RATE, POLICY, { family: "awning-window", widthMm: 1000, heightMm: 1200, qty: 2 });
  // perimeter = 2*(1+1.2)=4.4m ×55 = 242; area = 1.2m² ×340 = 408; unit ≈ 650 (round10)
  assert.equal(s.ok, true);
  assert.equal(s.unit, 650);
  assert.equal(s.total, 1300);
  assert.equal(s.depositAmount, 650);        // 50% of 1300 — 0043: one deposit percentage
  assert.equal(s.depositPercent, 50);
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
              return { gst_mode: "inc", version: "v1" };
            }
            // Ordered before the discount_percent branch: the referral lookup
            // selects r.discount_percent, so a substring match on that alone
            // would swallow it and quietly answer the wrong question. null =
            // this user was never referred, which is every existing account.
            if (sql.includes("FROM referral")) return null;
            if (sql.includes("discount_percent")) return { discount_percent: 5 };
            throw new Error(`unexpected first: ${sql}`);
          },
          bind() { return this; },
        };
      },
    },
  };
  const price = await createCachedPriceResolver(env, "user-1");
  // Six, not five, since 0051: loadAccountDiscount also asks whether this user
  // has a live referral discount. The number is incidental — what this test
  // actually protects is that the count is a CONSTANT of setup and does not grow
  // with the candidate set, which is asserted again after the 100 calls below.
  assert.equal(reads, 6, "one bounded pricing snapshot");
  for (let i = 0; i < 100; i++) {
    const result = price({
      family: "amj80", widthMm: 1200, heightMm: 900, qty: 1,
      optionSlugs: ["glazing:low-e"], requireExactRate: true, requireAllOptions: true,
    });
    assert.equal(result.ok, true);
  }
  assert.equal(reads, 6, "candidate pricing is pure after the initial snapshot");
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
  { gstMode: "inc", version: "v1" },
  { family: "awning-window", widthMm: 800, heightMm: 1200, qty: 1 },
);

test("selection: picks a passing candidate, ranks it, never selects a rejected one", async () => {
  const repo = fixtureCatalogueRepository([smallAwning, bigAwning]);
  const res = await selectForOpening({ family: "windows", operationType: "awning", widthMm: 800, heightMm: 1200, externalRef: "W01" }, repo, priceFn);
  assert.equal(res.evaluated.length, 2);
  assert.ok(res.selected, "a candidate was selected");
  assert.equal(res.selected.outcome.passed, true, "selected candidate passed the hard rules");
  assert.equal(res.status, "ready");
  assert.equal(res.selected.candidateOutcome.rank, 1);
  assert.equal(res.selected.candidateOutcome.tier, "meets");
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
  assert.equal(small.candidateOutcome.selected, false);
  // D3: fit is HARD. The small unit does not serve this opening and was not the
  // last resort (a fitting product exists), so it is excluded with the breach
  // named — persisted and visible, never machine-selected.
  assert.equal(small.candidateOutcome.tier, "excluded");
  assert.deepEqual(small.candidateOutcome.exclusions, [
    { constraint: "dimensions", detail: { breached: ["width"], limit: small.candidateOutcome.fit.limit } },
  ]);
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

test("AC-51 the geometry curve is GONE: fit is a boolean, and the cheaper unit wins", () => {
  // The exact case geometryScore got wrong. `snug` is rated 400–1000 mm and
  // `loose` 700–5000 mm; at 700 mm the old centre-of-range curve preferred the
  // one whose midpoint sat nearer, which is a preference dressed as a fit test.
  // Both fit. Cheapest wins, and the dearer product is ranked second, not first.
  const rule = (r) => ({ maxAreaM2: 25, maxAspectRatio: 4, ruleVersion: "v1", ...r });
  const products = [
    { ...awning, sanityProductId: "id-snug", slug: "a-snug", category: { slug: { current: "windows" } },
      dimensionRule: rule({ minWidthMm: 400, maxWidthMm: 1000, minHeightMm: 400, maxHeightMm: 2400 }) },
    { ...awning, sanityProductId: "id-loose", slug: "b-loose", category: { slug: { current: "windows" } },
      dimensionRule: rule({ minWidthMm: 700, maxWidthMm: 5000, minHeightMm: 700, maxHeightMm: 5000 }) },
  ];
  const priceBy = { "a-snug": 1500, "b-loose": 900 };
  return selectForOpening(
    { family: "windows", operationType: "awning", widthMm: 700, heightMm: 1400 },
    fixtureCatalogueRepository(products),
    async (c) => ({ ok: true, total: priceBy[c.slug], unit: priceBy[c.slug] }),
  ).then((res) => {
    assert.equal(res.selected.candidate.slug, "b-loose", "the cheaper unit, not the snugger one");
    assert.equal(res.selected.candidateOutcome.rank, 1);
    const snug = res.evaluated.find((e) => e.candidate.slug === "a-snug");
    assert.equal(snug.candidateOutcome.tier, "meets", "it fits — it is simply dearer");
    assert.equal(snug.candidateOutcome.rank, 2);
    assert.equal(snug.candidateOutcome.price.deltaToSelected, 600);
  });
});

test("owner rule: among compliant glasses the CHEAPEST is recommended, not the thermally-best", async () => {
  // Both variants MEET the Uw cap, so both are tier `meets` and deviate by zero.
  // The pricier one has the better Uw/SHGC — under the old midpoint tie-break it
  // would have won. Cheapest wins among candidates that meet the brief (D2).
  const product = {
    ...awning, sanityProductId: "amjX", slug: "amjx", category: { slug: { current: "windows" } },
    performanceVariants: [
      { ...awning.performanceVariants[0], variantId: "cheap", glazingOptionSlug: "cheap", uValue: 3.4, shgc: 0.42, certified: true, dataSource: "certified", certificationRef: "WERS-C" },
      { ...awning.performanceVariants[0], variantId: "pricey", glazingOptionSlug: "pricey", uValue: 3.0, shgc: 0.36, certified: true, dataSource: "certified", certificationRef: "WERS-P" },
    ],
  };
  const priceBy = { cheap: 900, pricey: 1500 };
  const res = await selectForOpening(
    { family: "windows", operationType: "awning", widthMm: 700, heightMm: 1400, requirements: { maxUValue: 4.0 } },
    fixtureCatalogueRepository([product]),
    async (_c, _o, v) => ({ ok: true, total: priceBy[v.variantId], unit: priceBy[v.variantId] }),
  );
  assert.ok(res.selected, `nothing selected: ${res.status} ${JSON.stringify(res.withheldIncomplete)} ${res.evaluated.length}`);
  assert.equal(res.selected.selectedVariant.variantId, "cheap");
  assert.equal(res.selected.candidateOutcome.tier, "meets");
  assert.equal(res.selected.candidateOutcome.thermal.normalisedDeviation, 0);
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
    { ref: "W04", performanceTypeId: "BRD-097-36 A", performanceDescription: "Signature Awning Window 100TB DG", maxUValue: 2.27, minShgc: 0.37, maxShgc: 0.41, glazingNote: "obscure", orientation: "w", room: "Media" },
  ], precedenceStatement: "The energy report takes precedence over plans." }));
  assert.equal(good.constraints.length, 1);
  assert.equal(good.constraints[0].maxUValue, 2.27);
  assert.equal(good.constraints[0].ref, "W04");
  assert.equal(good.constraints[0].performanceTypeId, "BRD-097-36 A");
  assert.match(good.constraints[0].performanceDescription, /Signature Awning/);
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
