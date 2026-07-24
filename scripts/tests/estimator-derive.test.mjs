// Unit tests for the estimator field derivation (Phase 0 catalogue enrichment).
// Pure logic; guards the safety invariant that estimated values are never marked
// certified.
import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyGlass, deriveUwShgc, deriveConfiguration, deriveDimensionRule,
  derivePerformanceVariant, deriveEstimatorFields,
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
  const pv = derivePerformanceVariant({ standardGlass: "6mm Low-e+25Ar+6mm", slug: "x" });
  assert.equal(pv.certified, false);
  assert.equal(pv.dataSource, "estimated");
  const all = deriveEstimatorFields({ family: "awning-window", category: "windows", slug: "amj80", standardGlass: "5+8A+5mm Double Tempered", minWidth: 400, maxWidth: 1000, minHeight: 400, maxHeight: 2400 });
  assert.equal(all.performanceVariants[0].certified, false);
  assert.equal(all.pricingRef, "price.amj80.v1");
  assert.equal(all.schemaVersion, 1);
});
