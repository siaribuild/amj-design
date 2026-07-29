// Unit tests for the estimator field derivation (Phase 0 catalogue enrichment).
// Pure logic; guards the safety invariant that estimated values are never marked
// certified.
import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyGlass, deriveUwShgc, deriveConfiguration, deriveDimensionRule,
  deriveFrameTechnology, derivePerformanceVariant, deriveEstimatorFields,
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

test("SAFETY: derived performance is never marked certified", () => {
  const pv = derivePerformanceVariant({ standardGlass: "6mm Low-e+25Ar+6mm", slug: "amj150t-lift-sliding-door" });
  assert.equal(pv.certified, false);
  assert.equal(pv.dataSource, "estimated");
  assert.equal(pv.frameTechnology, "thermally_broken");
  const all = deriveEstimatorFields({ family: "awning-window", category: "windows", slug: "amj80", standardGlass: "5+8A+5mm Double Tempered", minWidth: 400, maxWidth: 1000, minHeight: 400, maxHeight: 2400 });
  assert.equal(all.performanceVariants[0].certified, false);
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
