// End-to-end tests of the PRODUCT RECOMMENDATION model (selectForOpening),
// driving the real selection engine over a fixture catalogue.
//
// This suite owns the criteria that only exist once the ladder is WIRED: the
// hard constraints refusing a substitution and saying so in structured detail
// (AC-7, AC-11), energy behaving as an objective (AC-9, AC-10, AC-12), the
// emitted contract (AC-22), a WERS reference moving neither order nor status
// (AC-49, now ADR 0011), and
// the run statuses that have to tell a catalogue gap from a measuring gap
// (E3, E7). The ladder's own arithmetic is proven fixture-only in
// recommendation-ladder.test.mjs.
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
      export { tallyTiers } from ${p("worker/lib/estimator/estimate.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { selectForOpening, tallyTiers } = await import(pathToFileURL(outfile).href);

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
  assert.equal(r.selection.version, "ladder-v2");
  assert.equal(r.selection.tolerance, 0.05);
  assert.equal(r.selection.competingTier, "meets");
  assert.equal(r.selection.requirement.maxUValue, 2.0);
  assert.equal(r.selection.requirement.absent, false);
  assert.equal(r.selection.selectedProductSlug, r.selected.candidate.slug);
  assert.equal(r.selectionVersion, "ladder-v2");

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

// ── Hard constraints (D3) ───────────────────────────────────────────────────

test("AC-7 no operation substitution: the fixed product is EXCLUDED, and named", async () => {
  // A fixed unit is not a candidate for an awning under any pricing. Nothing is
  // selected, and the refused candidate is persisted WITH its reason so review
  // can see the catalogue was asked and answered.
  const wrongOp = {
    async queryCandidates() { return [product("amj-fixed", ["fixed"])]; },
    catalogueVersion() { return "cat-v1"; },
  };
  const r = await selectForOpening(opening({ operationType: "awning" }), wrongOp, priceFn);
  assert.equal(r.selected, null);
  assert.equal(r.status, "no_candidate");
  const outcomes = r.evaluated.map((e) => e.candidateOutcome);
  assert.ok(outcomes.length, "the refused candidate is persisted");
  for (const o of outcomes) {
    assert.equal(o.tier, "excluded");
    assert.equal(o.rank, null);
    assert.equal(o.exclusions[0].constraint, "operation");
    assert.deepEqual(o.exclusions[0].detail, { requiredOperation: "awning", offered: ["fixed"] });
  }
  assert.deepEqual(r.selection.withheldIncomplete, [], "this is not a data gap");
});

test("AC-11 the glazing instruction is HARD, not a performance objective", async () => {
  const singleOnly = {
    async queryCandidates() {
      return [product("amj-single", ["awning"], {
        performanceVariants: [{ ...GLASSES[2], glazingOptionSlug: "single", glazingClass: "single_clear" }],
      })];
    },
    catalogueVersion() { return "cat-v1"; },
  };
  // Satisfying "double glazed" with single glass is a substitution, refused on
  // the same principle as offering a fixed unit for a required awning.
  const r = await selectForOpening(
    opening({ scheduleRequirements: { doubleGlazed: true } }), singleOnly, priceFn,
  );
  const o = r.evaluated[0].candidateOutcome;
  assert.equal(o.tier, "excluded");
  assert.equal(o.exclusions[0].constraint, "glazing_instruction");
  assert.equal(o.exclusions[0].detail.required.doubleGlazed, true);
  assert.deepEqual(o.exclusions[0].detail.offeredClasses, ["single_clear"]);
  assert.equal(r.selected, null);
  assert.equal(r.status, "no_candidate");
});

// ── Energy as an objective (D4) ─────────────────────────────────────────────

test("AC-9 a requirement nothing can meet still yields a pick, flagged for review", async () => {
  const r = await selectForOpening(opening({ requirements: { maxUValue: 1.0 } }), repo, priceFn);
  assert.ok(r.selected, "energy never eliminates");
  assert.ok(["within_tolerance", "misses"].includes(r.selected.candidateOutcome.tier));
  assert.equal(r.status, "commercial_only_estimate");
  assert.equal(r.selection.competingTier, "within_tolerance");
  assert.equal(r.selected.selectedVariant.variantId, "dg-lowe", "the closest glass competes");
});

test("AC-10 a COMPUTED requirement binds exactly as a reported one does", async () => {
  const band = { maxUValue: 2.0 };
  const reported = await selectForOpening(
    opening({ requirements: band, thermalContext: { requirementBasis: "explicit_energy_report" } }), repo, priceFn);
  const derived = await selectForOpening(
    opening({ requirements: band, thermalContext: { requirementBasis: "plan_derived" } }), repo, priceFn);

  const shape = (r) => r.evaluated.map((e) => ({
    slug: e.candidate.slug, variant: e.selectedVariant?.variantId ?? null,
    tier: e.candidateOutcome.tier, rank: e.candidateOutcome.rank,
    competing: e.candidateOutcome.competing,
  }));
  assert.deepEqual(shape(derived), shape(reported), "identical tiering, order and competing set");
  assert.equal(derived.selected.candidate.slug, reported.selected.candidate.slug);
  // Only the basis differs, and staff see it.
  assert.equal(reported.selection.requirement.basis, "explicit_energy_report");
  assert.equal(derived.selection.requirement.basis, "plan_derived");
});

test("AC-12 a near-miss survives into the ranked set, priced and selectable", async () => {
  const r = await selectForOpening(opening({ requirements: { maxUValue: 1.6 } }), repo, priceFn);
  const missed = r.evaluated.filter((e) => e.candidateOutcome.tier === "misses");
  assert.ok(missed.length, "the candidates beyond the band are still here");
  for (const e of missed) {
    assert.notEqual(e.candidateOutcome.rank, null, "ranked");
    assert.equal(e.candidateOutcome.price.ok, true, "priced");
    assert.equal(e.candidateOutcome.competing, false, "and not competing");
    assert.deepEqual(e.candidateOutcome.exclusions, [], "never filtered out of existence");
  }
});

// ── AC-49 / ADR 0011: certification moves nothing, because it is gone ──────

test("AC-49 stripping every WERS reference changes neither the rank order nor the status", async () => {
  // The original AC-49 inverted `certified`/`dataSource` and proved the ORDER
  // held while accepting that the STATUS moved — that moving status was the
  // defect the owner killed (13 of 32 products downgraded on a dead flag).
  // ADR 0011 deleted the flag, so the assertion gets stronger: nothing moves at
  // all, and `certificationRef` is the surviving fact that must read on nothing.
  const stripped = {
    async queryCandidates(_family, operation) {
      return (CATALOGUE[operation] ?? []).map((c) => ({
        ...c,
        performanceVariants: c.performanceVariants.map((v) => ({ ...v, certificationRef: null })),
      }));
    },
    catalogueVersion() { return "cat-v1"; },
  };
  const op = opening({ requirements: { maxUValue: 2.0 } });
  const before = await selectForOpening(op, repo, priceFn);
  const after = await selectForOpening(op, stripped, priceFn);

  const order = (r) => r.evaluated
    .filter((e) => e.candidateOutcome.rank != null)
    .sort((a, b) => a.candidateOutcome.rank - b.candidateOutcome.rank)
    .map((e) => `${e.candidate.slug}::${e.selectedVariant?.variantId}`);
  assert.deepEqual(order(after), order(before), "the complete rank order is identical");
  assert.equal(after.selected.candidate.slug, before.selected.candidate.slug);
  assert.equal(after.selected.selectedVariant.variantId, before.selected.selectedVariant.variantId);
  assert.equal(after.status, before.status, "and the LINE STATUS is identical too — the defect ADR 0011 removed");
  assert.equal(after.selected.candidateOutcome.tier, before.selected.candidateOutcome.tier);
});

// ── Edge cases the run status has to tell apart ─────────────────────────────

test("E3/E7 a catalogue data gap and a measuring gap are different answers", async () => {
  // E3: products of this shape exist but are half-authored. Saying no_candidate
  // would send someone to re-measure an opening that was never the problem.
  const halfAuthored = {
    async queryCandidates() {
      return [product("amj-broken", ["awning"], { performanceVariants: [], pricingRef: null })];
    },
    catalogueVersion() { return "cat-v1"; },
  };
  const withheld = await selectForOpening(opening(), halfAuthored, priceFn);
  assert.equal(withheld.status, "catalogue_data_incomplete");
  assert.equal(withheld.selection.withheldIncomplete[0].slug, "amj-broken");
  assert.ok(withheld.selection.withheldIncomplete[0].gaps.length, "and the gap is named");
  assert.equal(withheld.evaluated.length, 0, "a withheld product never became a candidate");

  // E7: the catalogue is fine and the OPENING's size is unknown. Nothing is
  // machine-selected, and every row carries the truthful verdict (AD13).
  const unknownSize = await selectForOpening(opening({ widthMm: null, heightMm: null }), repo, priceFn);
  assert.equal(unknownSize.status, "needs_manual_review");
  assert.equal(unknownSize.selected, null);
  assert.ok(unknownSize.evaluated.length, "candidates are still persisted");
  assert.deepEqual(unknownSize.evaluated[0].candidateOutcome.exclusions,
    [{ constraint: "dimensions", detail: { sizeUnknown: true } }]);
});

// ── TB-36: a computed requirement binds exactly like a reported one ──────────
// The band is the band. Provenance is not physics — a west-facing awning behaves
// the same whether its Uw cap arrived on an energy report or was derived from
// the plans — so nothing about selection may key on the basis. Only staff see it.
test("TB-36: identical openings on explicit_energy_report and plan_derived select identically", async () => {
  const band = { maxUValue: 2.0, minShgc: null, maxShgc: 0.5 };
  const of = async (basis) => selectForOpening(
    opening({ requirements: { ...band }, thermalContext: { requirementBasis: basis } }),
    repo, priceFn,
  );
  const reported = await of("explicit_energy_report");
  const computed = await of("plan_derived");

  assert.equal(computed.selection.competingTier, reported.selection.competingTier);
  assert.equal(computed.selected.candidate.sanityProductId, reported.selected.candidate.sanityProductId);
  assert.equal(computed.selected.selectedVariant.variantId, reported.selected.selectedVariant.variantId);
  assert.equal(computed.status, reported.status);
  // The whole competing set, ranked, tier for tier.
  const shape = (r) => r.evaluated.map((e) => [
    e.candidateOutcome.sanityProductId, e.candidateOutcome.variantId,
    e.candidateOutcome.tier, e.candidateOutcome.rank,
  ]);
  assert.deepEqual(shape(computed), shape(reported));
  // …and the ONLY difference is the basis the requirement records.
  assert.equal(reported.selection.requirement.basis, "explicit_energy_report");
  assert.equal(computed.selection.requirement.basis, "plan_derived");
});

// ── TB-37: the effect of turning the dial is observable ──────────────────────
// A change to the default shows up as a shift in review load rather than being
// discovered through it.
test("TB-37: the run tallies openings by competing tier, and the tally sums to what was selected", async () => {
  const results = [
    await selectForOpening(opening({ requirements: { maxUValue: 2.0 } }), repo, priceFn),        // meets
    // Nothing meets a 1.0 cap, so the closest glass wins the tier below `meets`
    // — which is the review-load signal this counter exists to surface.
    await selectForOpening(opening({ requirements: { maxUValue: 1.0 } }), repo, priceFn),
    await selectForOpening(opening({}), repo, priceFn),                                          // no band ⇒ meets
  ];
  const counts = tallyTiers(results);
  assert.deepEqual(Object.keys(counts).sort(),
    ["does_not_fit", "meets", "misses", "thermal_unknown", "within_tolerance"],
    "all five tiers are always present — a zero is a finding, not an absence");
  const selected = results.filter((r) => r.selected || r.selectedSplit).length;
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), selected,
    "an opening with no pick is in no competing tier, and no bucket is invented for it");
  assert.equal(counts.meets, 2, "an absent band and a met band both land in meets");
  assert.equal(counts.within_tolerance, 1, "and the unmeetable one lands where a reviewer will see it");
  // A run that selected nothing at all tallies zeros, never NaN or undefined.
  assert.deepEqual(tallyTiers([]),
    { meets: 0, within_tolerance: 0, misses: 0, thermal_unknown: 0, does_not_fit: 0 });
});
