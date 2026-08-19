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
      export { aggregateApprovedThermal, contextKey, retrievalKey, RETRIEVAL_KEY_VERSION } from ${p("worker/lib/estimator/learning.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { aggregateApprovedThermal, contextKey, retrievalKey, RETRIEVAL_KEY_VERSION } = await import(pathToFileURL(outfile).href);

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

test("AC-28/AC-29 the retrieval key separates the four that matter and nothing else", () => {
  const base = {
    operationType: "awning", requirementBasis: "explicit_energy_report",
    widthMm: 1200, thermalRequired: true,
  };
  const key = retrievalKey(base);
  assert.equal(key, "awning|explicit_energy_report|s|1");

  // AC-28: two openings differing ONLY in a field retrieval does not read land
  // in the same bucket. Each of these is a real column on the recorded context;
  // none of them is dropped from the record, only from the lookup.
  for (const noise of [
    { climateZone: "6" }, { orientation: "W" }, { jurisdiction: "VIC" },
    { buildingClass: "1a" }, { envelopeClass: "high" }, { glazingToRoomFloorRatio: 0.4 },
    { family: "windows" }, { heightMm: 2400 }, { riskBand: "high" },
  ]) {
    assert.equal(retrievalKey({ ...base, ...noise }), key, `${Object.keys(noise)[0]} must not split the bucket`);
  }
  // `family` specifically: it is a FUNCTION of the operation, so keeping both
  // would spend cardinality on no extra information (AD8).
  assert.equal(retrievalKey({ ...base, family: "doors" }), key);

  // AC-29: the four that DO matter each separate.
  assert.notEqual(retrievalKey({ ...base, operationType: "sliding" }), key);
  assert.notEqual(retrievalKey({ ...base, requirementBasis: "plan_derived" }), key);
  assert.notEqual(retrievalKey({ ...base, widthMm: 2400 }), key);
  assert.notEqual(retrievalKey({ ...base, thermalRequired: false }), key);
});

test("AD8 the size band is by WIDTH, at 1800 and 3000 mm", () => {
  const band = (widthMm) => retrievalKey({ operationType: "awning", requirementBasis: "none", widthMm, thermalRequired: false }).split("|")[2];
  // Width, not area: width is what the frame series' max-width limits actually
  // turn on, and it is the axis that decides whether a split is in play at all.
  assert.equal(band(600), "s");
  assert.equal(band(1799), "s");
  assert.equal(band(1800), "m");
  assert.equal(band(3000), "m");
  assert.equal(band(3001), "l");
  assert.equal(band(null), "unknown");
  assert.equal(band(NaN), "unknown");
  assert.equal(band(-5), "unknown", "a nonsense width is not a small window");
});

test("AC-56 no free text can traverse into the key — the values are whitelisted", () => {
  // A schedule comment carrying a client's name and site address must never
  // become a queryable index key ACROSS ACCOUNTS. The key is built from four
  // enumerated values and nothing that fails the enumeration is passed through:
  // it is replaced, not escaped, not truncated.
  const hostile = "Mrs J. Whitmore, 14 Ellerslie Road Hawthorn VIC 3122 — match existing";
  const key = retrievalKey({
    operationType: hostile, requirementBasis: hostile,
    widthMm: 1200, thermalRequired: hostile,
  });
  // The thermal flag fails CLOSED: a requirement is something the platform
  // positively recorded, so anything that is not a recognisable positive is an
  // absence rather than a claim.
  assert.equal(key, "other|none|s|0");
  for (const word of ["Whitmore", "Ellerslie", "Hawthorn", "3122", " "]) {
    assert.ok(!key.includes(word), `"${word}" reached the key`);
  }
  // A pipe would forge a bucket boundary; an operation that is nearly plausible
  // is still refused rather than trimmed into something that looks real.
  assert.equal(retrievalKey({ operationType: "awning|sliding", requirementBasis: null, widthMm: 1, thermalRequired: 0 }).split("|")[0], "other");
  assert.equal(retrievalKey({ operationType: "AWNING", requirementBasis: null, widthMm: 1, thermalRequired: 0 }).split("|")[0], "awning", "case alone is normalised, not refused");
  assert.equal(retrievalKey({ operationType: "a".repeat(40), requirementBasis: null, widthMm: 1, thermalRequired: 0 }).split("|")[0], "other");
  // Only the five enumerated bases survive; anything else is 'none'.
  for (const basis of ["explicit_energy_report", "plan_derived", "default_envelope", "human_override", "none"]) {
    assert.equal(retrievalKey({ operationType: "awning", requirementBasis: basis, widthMm: 1, thermalRequired: 0 }).split("|")[1], basis);
  }
  assert.equal(retrievalKey({ operationType: "awning", requirementBasis: "made_up", widthMm: 1, thermalRequired: 0 }).split("|")[1], "none");
});

test("AC-30 the key is versioned, and recomputable from context_json alone", () => {
  assert.equal(RETRIEVAL_KEY_VERSION, "rk-v1");
  // The recompute story is the whole reason the key is stored AND versioned: a
  // later redefinition of the coarsening is a pass over the stored context, not
  // lost history. So everything the key reads has to BE in context_json — which
  // is why capture writes widthMm and thermalRequired alongside the twelve.
  const contextJson = {
    family: "windows", operationType: "awning", requirementBasis: "plan_derived",
    orientation: "W", riskBand: "high", climateZone: "6", jurisdiction: "VIC",
    buildingClass: "1a", envelopeClass: "high", glazingToRoomFloorRatio: 0.4,
    widthMm: 2100, heightMm: 1500, thermalRequired: 1,
  };
  assert.equal(retrievalKey(contextJson), "awning|plan_derived|m|1");
  // …and the same object read back off a row round-trips to the same bucket.
  assert.equal(retrievalKey(JSON.parse(JSON.stringify(contextJson))), retrievalKey(contextJson));
});
