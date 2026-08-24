// Unit tests for the estimator field derivation (Phase 0 catalogue enrichment).
// Pure logic. The safety invariant it used to guard — "an estimated value is
// never marked certified" — is now guarded by ABSENCE: ADR 0011 deleted the
// flag, so the derived variant carries no `certified` and no `dataSource` for a
// later import to get wrong. CERT-AC-12 in certified-removal.test.mjs owns the
// durability half (the strip cannot be undone by re-running this builder).
import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyGlass, deriveUwShgc, deriveConfiguration, deriveDimensionRule,
  deriveFrameTechnology, derivePerformanceVariant, deriveEstimatorFields,
  performanceVariantsAreAuthored,
} from "../catalogue/derive-estimator-fields.mjs";

test("classifyGlass detects double glazing, Low-E and gas fill", () => {
  assert.deepEqual(classifyGlass("6mm Tempered Clear Glass"), { doubleGlazed: false, lowE: false, gasFilled: false });
  assert.deepEqual(classifyGlass("5+12A+5mm Double Tempered Clear Glass"), { doubleGlazed: true, lowE: false, gasFilled: false });
  assert.deepEqual(classifyGlass("6mm Low-e+25Ar+6mm Tempered Clear Glass"), { doubleGlazed: true, lowE: true, gasFilled: true });
});

test("deriveUwShgc gives plausible, ordered values by build-up", () => {
  const single = deriveUwShgc("6mm Tempered Clear Glass");
  const dgClear = deriveUwShgc("5+8A+5mm Double Tempered Clear Glass");
  const dgLowEArgon = deriveUwShgc("6mm Low-e+25Ar+6mm Tempered Clear Glass");
  // Better glazing ⇒ lower U-value.
  assert.ok(single.uValue > dgClear.uValue, "single glazed is worse than DG clear");
  assert.ok(dgClear.uValue > dgLowEArgon.uValue, "DG clear is worse than DG Low-E argon");
  // Low-E cuts solar heat gain.
  assert.ok(dgLowEArgon.shgc < dgClear.shgc);
  // All within a sane residential envelope.
  for (const v of [single, dgClear, dgLowEArgon]) {
    assert.ok(v.uValue > 1 && v.uValue < 8);
    assert.ok(v.shgc > 0.2 && v.shgc <= 0.85);
  }
});

test("provisional T-series frame assumption lowers whole-window Uw without changing glass SHGC", () => {
  assert.equal(deriveFrameTechnology({ slug: "amj100t-series-awning-window" }), "thermally_broken");
  assert.equal(deriveFrameTechnology({ slug: "amj65t-casement-door" }), "thermally_broken");
  assert.equal(deriveFrameTechnology({ slug: "amj100l-series-awning-window" }), "conventional");
  const conventional = deriveUwShgc("5+12A+5mm Double Tempered Clear Glass", "conventional");
  const broken = deriveUwShgc("5+12A+5mm Double Tempered Clear Glass", "thermally_broken");
  assert.ok(broken.uValue < conventional.uValue);
  assert.equal(broken.shgc, conventional.shgc, "the same glass build-up retains the same provisional SHGC");
});

test("configuration maps family to structured operation", () => {
  const c = deriveConfiguration({ family: "sliding-door", category: "doors" });
  assert.deepEqual(c.operationTypes, ["sliding"]);
  assert.equal(c.openingDirection, "sliding");
  assert.equal(c.dataSource, "estimated");
  const awn = deriveConfiguration({ family: "awning-window", category: "windows" });
  assert.equal(awn.isCompositeMember, true, "awning windows can be composite members");
});

test("dimensionRule carries bounds, derived area, and a rule version", () => {
  const r = deriveDimensionRule({ minWidth: 500, maxWidth: 1300, minHeight: 500, maxHeight: 2400 });
  assert.equal(r.maxWidthMm, 1300);
  assert.equal(r.maxAreaM2, Math.round((1300 * 2400 / 1e6) * 100) / 100);
  assert.equal(r.ruleVersion, "v1");
  assert.equal(r.dataSource, "estimated");
});

test("SAFETY: derived performance carries no certification flag to get wrong", () => {
  const pv = derivePerformanceVariant({ standardGlass: "6mm Low-e+25Ar+6mm", slug: "amj150t-lift-sliding-door" });
  assert.ok(!("certified" in pv), "the flag is absent, not false (ADR 0011)");
  assert.ok(!("dataSource" in pv), "and so is the variant data source");
  assert.equal(pv.frameTechnology, "thermally_broken");
  const all = deriveEstimatorFields({ family: "awning-window", category: "windows", slug: "amj80", standardGlass: "5+8A+5mm Double Tempered", minWidth: 400, maxWidth: 1000, minHeight: 400, maxHeight: 2400 });
  assert.ok(!("certified" in all.performanceVariants[0]));
  assert.equal(all.pricingRef, "amj80", "pricingRef IS the pricing_rate_card id — see 0031");
  assert.equal(all.schemaVersion, 1);
});

// ── The Sanity ↔ D1 key contract ─────────────────────────────────────────────
// This is the test that was missing. `pricingRef` was derived as
// `price.<slug>.v1` while pricing_rate_card is keyed on the bare product slug
// (migration 0031), so hasAnyExactPricingCoverage() matched nothing and EVERY
// AI parse failed with `pricing_catalogue_not_ready` before reaching a model.
// Both sides looked individually correct; only their meeting point was wrong,
// and nothing compared them.
//
// Offline on purpose: it reads the migration that owns the ids rather than the
// live database, so it fails in CI rather than in a customer's upload.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "./helpers.mjs";

const rateCardIds = (() => {
  const sql = readFileSync(join(projectRoot, "migrations/0031_product_rate_cards.sql"), "utf8");
  const block = sql.slice(sql.indexOf("INSERT INTO pricing_rate_card"));
  return new Set([...block.matchAll(/^\s*\('([^']+)'/gm)].map((m) => m[1]));
})();

test("CONTRACT: pricingRef IS the pricing_rate_card id, not a token that resembles one", () => {
  assert.ok(rateCardIds.size > 20, "sanity: the migration should carry a card per product");
  for (const slug of ["amj80-series-awning-window", "amj150-series-sliding-door", "amj100-series-pivot-door"]) {
    const { pricingRef } = deriveEstimatorFields({
      slug, family: "awning-window", category: "windows",
      standardGlass: "6mm Tempered Clear Glass",
      minWidth: 400, maxWidth: 1000, minHeight: 400, maxHeight: 2400,
    });
    assert.equal(pricingRef, slug, "the ref must equal the slug");
    assert.ok(
      rateCardIds.has(pricingRef),
      `pricingRef "${pricingRef}" matches no active rate card — the estimator resolves rate cards BY this value, so a mismatch fails every AI run`,
    );
  }
});

test("CONTRACT: every catalogue product has an exact active rate-card id", () => {
  const products = readFileSync(join(projectRoot, "sanity/catalogue.ndjson"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((doc) => doc._type === "product" && doc.slug?.current);
  assert.equal(products.length, 27, "the current catalogue product set is reconciled in full");
  for (const product of products) {
    const pricingRef = deriveEstimatorFields({ ...product, slug: product.slug.current }).pricingRef;
    assert.ok(rateCardIds.has(pricingRef), `${product.name}: missing exact rate card "${pricingRef}"`);
  }
});

test("CONTRACT: a decorative ref shape would be caught", () => {
  // Guards the guard: if someone reintroduces a prefixed/versioned token, the
  // assertion above must actually fail rather than pass vacuously.
  assert.equal(rateCardIds.has("price.amj80-series-awning-window.v1"), false);
});

// ── What `populate-estimator-fields --apply` must never overwrite ──────────
//
// CODEX P1-B. The old guard OR-ed four clauses; ADR 0011 deleted three of them
// (`certified === true`, `dataSource === "certified"`, `dataSource ===
// "manufacturer"`) and left `_key !== "std"`. That covers a variant a person
// ADDS — new key — but not one they EDIT IN PLACE: correcting the derived row in
// Studio keeps `_key: "std"`, and the deleted flags were how such a row was
// marked authoritative. So --apply would treat a corrected row as derived and
// replace the whole array, losing authored Uw/SHGC.
//
// Live dataset today: zero std rows marked authored, zero carrying a
// certificationRef. Latent, not active — which is exactly why it must be fixed
// now: after the strip there is no flag left to mark a row authored with, so a
// future editor correcting a manufacturer figure would be silently overwritten
// with no mechanism available to stop it.
//
// THE REPLACEMENT SIGNAL IS THE DERIVED SHAPE ITSELF, not new vocabulary. This
// script only ever writes what `derivePerformanceVariant` produces, so a stored
// row that DIFFERS from it is, by construction, somebody edit. It needs no
// field, cannot be forgotten by an editor, and fails in the safe direction: if
// the deriver is ever retuned, every row reads as authored and the script
// declines to overwrite rather than destroying data.
test("P1-B a std row corrected in place is authored, and is not overwritten", async () => {
  const { performanceVariantsAreAuthored, derivePerformanceVariant } =
    await import("../catalogue/derive-estimator-fields.mjs");
  const product = {
    name: "AMJ80 Awning", slug: "amj80", family: "awning-window", category: "windows",
    standardGlass: "5+8A+5mm Double Tempered",
    minWidth: 400, maxWidth: 1000, minHeight: 400, maxHeight: 2400,
  };
  const derived = derivePerformanceVariant(product);

  // The row this script itself wrote: not authored, safe to refresh.
  assert.equal(performanceVariantsAreAuthored({ ...product, performanceVariants: [{ ...derived }] }), false);

  // THE FINDING: same key, a person corrected the figures to the manufacturer values.
  assert.equal(
    performanceVariantsAreAuthored({ ...product, performanceVariants: [{ ...derived, uValue: 2.1, shgc: 0.36 }] }),
    true, "a corrected Uw is somebody work, not this script output",
  );

  // A WERS reference is person-or-importer supplied and survives this phase.
  assert.equal(
    performanceVariantsAreAuthored({ ...product, performanceVariants: [{ ...derived, certificationRef: "WERS-1" }] }),
    true,
  );

  // The clause that already worked keeps working: a row somebody ADDED.
  assert.equal(
    performanceVariantsAreAuthored({ ...product, performanceVariants: [{ ...derived }, { ...derived, _key: "lowe", variantId: "lowe" }] }),
    true,
  );

  // A product with no variants at all has nothing to protect.
  assert.equal(performanceVariantsAreAuthored({ ...product, performanceVariants: [] }), false);
  assert.equal(performanceVariantsAreAuthored(product), false);
});

test("P1-B an absent optional field is not mistaken for an edit", async () => {
  const { performanceVariantsAreAuthored, derivePerformanceVariant } =
    await import("../catalogue/derive-estimator-fields.mjs");
  // Sanity omits unset fields rather than storing null, so a round-tripped
  // derived row comes back with its nulls missing. Reading that as an edit
  // would freeze the script on every product — safe, but uselessly so.
  const product = { name: "P", slug: "p", family: "awning-window", category: "windows", standardGlass: "6mm clear" };
  const derived = derivePerformanceVariant(product);
  const roundTripped = Object.fromEntries(Object.entries(derived).filter(([, v]) => v !== null));
  assert.equal(performanceVariantsAreAuthored({ ...product, performanceVariants: [roundTripped] }), false);
});

test("P1-B the populate script asks that question before it replaces anything", () => {
  const src = readFileSync(join(projectRoot, "scripts/catalogue/populate-estimator-fields.mjs"), "utf8");
  assert.match(src, /performanceVariantsAreAuthored/, "the script uses the shared predicate");
  assert.match(src, /certificationRef/, "and projects the field that predicate reads");
});

test("P1-B an omitted EMPTY ARRAY is not an edit either", () => {
  // TESTER RESIDUAL. `derivePerformanceVariant` writes `pricingOptionSlugs: []`.
  // If Sanity omits an empty array on round-trip the way it omits an unset
  // field, then every stored row differs from the derived one, every product
  // reads as authored, and --apply preserves everything.
  //
  // That fails SAFE, but "safe and inert" is not a resting place: a guard that
  // protects everything protects nothing anybody can reason about, and the next
  // person to find the script doing nothing removes the guard rather than the
  // cause. An empty array carries no information, so absent and empty are the
  // same fact, exactly as absent and null already are.
  const product = { name: "P", slug: "p", family: "awning-window", category: "windows", standardGlass: "6mm clear" };
  const derived = derivePerformanceVariant(product);
  assert.deepEqual(derived.pricingOptionSlugs, [], "precondition: the deriver writes an empty array");

  const { pricingOptionSlugs, ...omitted } = derived;
  assert.equal(performanceVariantsAreAuthored({ ...product, performanceVariants: [omitted] }), false,
    "a row that came back without its empty array is still this script own output");

  // And a row that actually HAS a surcharge is somebody work, as before.
  assert.equal(
    performanceVariantsAreAuthored({ ...product, performanceVariants: [{ ...derived, pricingOptionSlugs: ["glz-lowe"] }] }),
    true,
  );
});

test("P1-B every field the guard compares is a field the script actually reads", () => {
  // The tester checked this by hand and named the failure mode: a field in
  // DERIVED_FIELDS but not in the GROQ projection arrives as undefined on every
  // stored row, so every row differs from the derived one, every product reads
  // as authored, and the script goes silently inert. Pinned so it cannot drift
  // back the next time either list is edited.
  const derived = derivePerformanceVariant({ name: "P", slug: "p", family: "awning-window", category: "windows", standardGlass: "6mm clear" });
  const compared = Object.keys(derived).filter((k) => !k.startsWith("_"));
  const src = readFileSync(join(projectRoot, "scripts/catalogue/populate-estimator-fields.mjs"), "utf8");
  const projection = src.slice(src.indexOf("performanceVariants[]{"), src.indexOf("} | order(family"));
  assert.ok(projection.includes("variantId"), "found the projection");
  const missing = compared.filter((f) => !new RegExp(`\\b${f}\\b`).test(projection));
  assert.deepEqual(missing, [], "every derived field is projected, or the comparison sees undefined");
});
