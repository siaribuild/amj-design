import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { makeRunDir, projectRoot } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("estimator-learning");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export { aggregateApprovedThermal, contextKey, retrievalKey, RETRIEVAL_KEY_VERSION, aggregateShadow, SHADOW_MIN_OBSERVATIONS, buildShadowModel } from ${p("worker/lib/estimator/learning.ts")};
      export { decide } from ${p("worker/lib/estimator/select.ts")};
      export { captureRecommendationOutcomes, captureBackfilledOutcomes } from ${p("worker/lib/ai/outcomes.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { aggregateApprovedThermal, contextKey, retrievalKey, RETRIEVAL_KEY_VERSION, aggregateShadow, SHADOW_MIN_OBSERVATIONS, buildShadowModel, captureRecommendationOutcomes, captureBackfilledOutcomes, decide } = await import(pathToFileURL(outfile).href);

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

// ── The shadow model (D11, D18) ─────────────────────────────────────────────

const shadowRow = (retrieval_key, final_product_slug, provenance = "in_platform") =>
  ({ retrieval_key, final_product_slug, provenance });
const BUCKET = "awning|plan_derived|s|1";
const shadowOpening = (over = {}) => ({
  operationType: "awning", widthMm: 1200,
  thermalContext: { requirementBasis: "plan_derived" },
  requirements: { maxUValue: 4.0 },
  ...over,
});

test("AC-31 the density floor: a bucket speaks at five observations, not at four", () => {
  // Raised from the legacy 2. Laplace smoothing on n=2 swings between 0.25 and
  // 0.5 on a single row — the model would announce a preference on evidence
  // that one more quote could reverse. At n≥5 the estimate is stable enough to
  // put in front of a reviewer as "this is what humans did".
  assert.equal(SHADOW_MIN_OBSERVATIONS, 5);

  const four = aggregateShadow([1, 2, 3, 4].map(() => shadowRow(BUCKET, "amj100")));
  const atFour = four.lookup(shadowOpening());
  assert.equal(atFour.observations, 4);
  assert.equal(atFour.preferredSlug, null, "below the floor it says nothing at all");
  assert.equal(atFour.supportFor("amj100"), 4, "…while still reporting what it saw");

  const five = aggregateShadow([1, 2, 3, 4, 5].map(() => shadowRow(BUCKET, "amj100")));
  const atFive = five.lookup(shadowOpening());
  assert.equal(atFive.observations, 5);
  assert.equal(atFive.preferredSlug, "amj100");
  assert.equal(atFive.supportFor("amj100"), 5);
  assert.equal(atFive.supportFor("never-seen"), 0);
});

test("the preference is the UNIQUE modal product — a tie is not a preference", () => {
  // A bare argmax on a tie is an alphabetical coin flip dressed up as "the layer
  // would have preferred X". The reviewer is shown the counts either way, so
  // suppressing the claim costs them nothing and asserting it would cost them
  // their trust the first time they checked.
  const tied = aggregateShadow([
    shadowRow(BUCKET, "amj80"), shadowRow(BUCKET, "amj80"),
    shadowRow(BUCKET, "amj100"), shadowRow(BUCKET, "amj100"),
    shadowRow(BUCKET, "amj150"),
  ]);
  const split = tied.lookup(shadowOpening());
  assert.equal(split.observations, 5);
  assert.equal(split.preferredSlug, null, "two products at two each is not a lead");
  assert.equal(split.supportFor("amj80"), 2);
  assert.equal(split.supportFor("amj100"), 2);

  // A thin but genuine lead IS reported, with the counts beside it so a reviewer
  // can discount it. Withholding a 3-of-5 majority would be a second judgement
  // call with a second unsourced threshold behind it.
  const led = aggregateShadow([
    shadowRow(BUCKET, "amj80"), shadowRow(BUCKET, "amj80"), shadowRow(BUCKET, "amj80"),
    shadowRow(BUCKET, "amj100"), shadowRow(BUCKET, "amj100"),
  ]);
  assert.equal(led.lookup(shadowOpening()).preferredSlug, "amj80");
  assert.equal(led.lookup(shadowOpening()).supportFor("amj80"), 3);
});

test("a bucket is looked up by the SAME key the capture wrote", () => {
  const model = aggregateShadow([1, 2, 3, 4, 5].map(() => shadowRow(BUCKET, "amj100")));
  assert.equal(model.version, RETRIEVAL_KEY_VERSION);
  assert.equal(model.lookup(shadowOpening()).retrievalKey, BUCKET);

  // A different bucket is a different question, and an empty one is silent
  // rather than neutral-sounding.
  const elsewhere = model.lookup(shadowOpening({ widthMm: 4200 }));
  assert.equal(elsewhere.retrievalKey, "awning|plan_derived|l|1");
  assert.equal(elsewhere.observations, 0);
  assert.equal(elsewhere.preferredSlug, null);
  assert.equal(elsewhere.supportFor("amj100"), 0);

  // An opening with no thermal requirement lands in its own bucket, because
  // "what did humans pick when a band was in play" is a different question.
  assert.equal(model.lookup(shadowOpening({ requirements: null })).retrievalKey, "awning|plan_derived|s|0");
});

test("AC-35 provenance is counted and reported, and it does not weight the evidence", () => {
  // D18: the backfilled rows are REAL — actual plans, with the products that
  // were actually manufactured. The flag exists because those decisions were
  // made outside the platform's review flow and may lack the thermal context
  // the key reads, not because they are less true. So they count equally, and
  // the split is reported: a reviewer told "3 of 4 similar openings went this
  // way" can see which of the four were in-platform reviews.
  //
  // Down-weighting them would need a weight, and an unsourced weight nobody can
  // defend is the exact disease this redesign exists to cure.
  const model = aggregateShadow([
    shadowRow(BUCKET, "amj100"), shadowRow(BUCKET, "amj100"), shadowRow(BUCKET, "amj100"),
    shadowRow(BUCKET, "amj100", "backfilled"),
    shadowRow(BUCKET, "amj80", "backfilled"),
  ]);
  const found = model.lookup(shadowOpening());
  assert.equal(found.observations, 5);
  assert.deepEqual(found.provenance, { inPlatform: 3, backfilled: 2 });
  assert.equal(found.supportFor("amj100"), 4, "a backfilled row counts as evidence");
  assert.equal(found.preferredSlug, "amj100");

  // An unrecognised provenance is counted as an observation but claimed for
  // neither side — the split must add up to something a surface can render.
  const odd = aggregateShadow([...Array(5)].map(() => shadowRow(BUCKET, "amj100", "who-knows")));
  const oddFound = odd.lookup(shadowOpening());
  assert.equal(oddFound.observations, 5);
  assert.deepEqual(oddFound.provenance, { inPlatform: 0, backfilled: 0 });
});

test("rows with no retrieval key are not evidence about anything", () => {
  // A row captured before the key existed, or one whose key could not be
  // computed, belongs to no bucket. Counting it in the nearest one would put
  // pre-platform history behind a claim about a specific kind of opening.
  const model = aggregateShadow([
    ...[1, 2, 3, 4, 5].map(() => shadowRow(BUCKET, "amj100")),
    shadowRow(null, "amj80"), shadowRow("", "amj80"),
    { retrieval_key: BUCKET, final_product_slug: null, provenance: "in_platform" },
  ]);
  const found = model.lookup(shadowOpening());
  assert.equal(found.observations, 5, "only the five real rows count");
  assert.equal(found.supportFor("amj80"), 0);
});

// ── Capture (D13) — recording widened, the point unchanged ──────────────────

/** A D1 stub that answers the proposal lookup and records the INSERT batch. */
function captureDb(proposalRow) {
  const batched = [];
  const prepare = (sql) => ({
    sql,
    bind(...args) { this.args = args; return this; },
    async first() { return /FROM ai_proposal_line/.test(sql) ? proposalRow : null; },
  });
  return { batched, DB: { prepare, async batch(stmts) { batched.push(...stmts); return []; } } };
}

/** Map a column name to its position in the BIND list. Not the same as its
 *  position in the column list: this INSERT writes two columns as SQL literals
 *  (`thermal_eligible`, `provenance`), which consume no placeholder — and an
 *  off-by-one here would read the neighbouring value and call it a pass. */
const bindIndexOf = (sql, column) => {
  const columns = (sql.match(/\(([^)]*?)\)\s*VALUES/is)?.[1] ?? "")
    .split(",").map((c) => c.trim()).filter(Boolean);
  const values = (sql.match(/VALUES\s*\(([\s\S]*?)\)\s*$/i)?.[1] ?? "")
    .split(",").map((v) => v.trim());
  let bind = -1;
  for (let i = 0; i < columns.length; i++) {
    if (values[i] === "?") bind++;
    if (columns[i] === column) return values[i] === "?" ? bind : null;
  }
  throw new Error(`no such column: ${column}`);
};

const ISSUED_LINE = {
  id: "ql_1", external_ref: "W01", product_slug: "amj100t-awning",
  options_json: '{"colour":"Dover White"}',
  dims_json: '{"width":"2100","height":"1500"}',
  qty: 1, line_total: 1400, ai_proposal_line_id: "apl_1",
  selected_variant_id: "dg-lowe",
};
const PROPOSAL_ROW = {
  configuration_json: '{"options":{"colour":"Dover White"}}',
  ranking_context_json: JSON.stringify({
    family: "windows", operationType: "awning",
    requirements: { maxUValue: 2.27 },
    dimensions: { widthMm: 2100, heightMm: 1500 },
    quantity: 1,
    thermalContext: {
      requirementBasis: "plan_derived", orientation: "W", riskBand: "high",
      climateZone: "6", jurisdiction: "VIC", buildingClass: "1a",
      envelopeClass: "high", glazingToRoomFloorRatio: 0.4,
    },
  }),
  opening_id: "op_1", performance_variant_id: "dg-lowe",
  product_slug: "amj100t-awning", price_snapshot_json: '{"total":1400}',
};


test("AC-27/AC-30/AC-34 capture records twelve, retrieves four, and stamps provenance", async () => {
  const env = captureDb(PROPOSAL_ROW);
  await captureRecommendationOutcomes(env, "p_1", [ISSUED_LINE]);
  assert.equal(env.batched.length, 1);
  const row = env.batched[0];
  const at = (column) => { const i = bindIndexOf(row.sql, column); return i == null ? null : row.args[i]; };

  // AC-27: recording is UNTOUCHED. All twelve context fields still go in, which
  // is what makes a later redefinition of the coarsening a recompute rather than
  // lost history — the legacy key stays too.
  const context = JSON.parse(at("context_json"));
  for (const field of [
    "family", "operationType", "requirementBasis", "orientation", "riskBand",
    "climateZone", "jurisdiction", "buildingClass", "envelopeClass", "glazingToRoomFloorRatio",
  ]) {
    assert.ok(field in context, `${field} is still recorded`);
  }
  assert.ok(at("context_key").startsWith("windows|awning|plan_derived|W|high|"), "the legacy key is still written");

  // AD9: three ADDITIONS, and they are the reason AC-30 can hold. The width the
  // retrieval key bands on existed only inside the legacy key's own bucketing,
  // so without recording it the key would not be recomputable from context_json.
  assert.equal(context.widthMm, 2100);
  assert.equal(context.heightMm, 1500);
  assert.equal(context.thermalRequired, 1);

  // AC-30: the key and its version are stored, and the key recomputes EXACTLY
  // from the recorded context alone.
  assert.equal(at("retrieval_key"), "awning|plan_derived|m|1");
  assert.equal(at("retrieval_key_version"), RETRIEVAL_KEY_VERSION);
  assert.equal(retrievalKey(context), at("retrieval_key"), "recomputable from context_json");

  // AC-34: a row captured through the platform's own review flow. Written as a
  // SQL literal rather than a bound parameter — a row this function writes came
  // through the review flow by definition, and no caller could say otherwise.
  // The backfill ingest is a separate function for exactly that reason.
  assert.equal(at("provenance"), null, "not a parameter any caller can set");
  assert.match(row.sql, /,'in_platform'\)/);
});

test("AC-30 an opening with no band records thermalRequired 0 and buckets apart", async () => {
  const noBand = JSON.parse(PROPOSAL_ROW.ranking_context_json);
  noBand.requirements = {};
  const env = captureDb({ ...PROPOSAL_ROW, ranking_context_json: JSON.stringify(noBand) });
  await captureRecommendationOutcomes(env, "p_1", [ISSUED_LINE]);
  const row = env.batched[0];
  const at = (column) => { const i = bindIndexOf(row.sql, column); return i == null ? null : row.args[i]; };
  const context = JSON.parse(at("context_json"));
  assert.equal(context.thermalRequired, 0);
  assert.equal(at("retrieval_key"), "awning|plan_derived|m|0");
  assert.equal(retrievalKey(context), at("retrieval_key"));
});

// ── AC-32: dark means dark ──────────────────────────────────────────────────

/** A hand-built Evaluation, so the seam under test is `decide` itself rather
 *  than a catalogue. Two products, both fitting, both meeting — so PRICE is the
 *  only thing that can separate them, and the learned layer is the only thing
 *  that could be caught trying. */
const darkEvaluation = (prices) => ({
  rows: Object.entries(prices).map(([slug, total]) => ({
    candidate: {
      sanityProductId: `id-${slug}`, slug, catalogueRevision: "rev1", schemaVersion: 1,
      configuration: { operationTypes: ["awning"] },
      dimensionRule: { minWidthMm: 300, maxWidthMm: 3000, minHeightMm: 300, maxHeightMm: 3000, maxAreaM2: null, maxAspectRatio: null, ruleVersion: "v1" },
      performanceVariants: [], family: "windows",
    },
    outcome: { passed: true, status: "ready", filters: [], eligibleVariantIds: ["dg"], energyCertified: true, candidateId: `id-${slug}`, ruleVersion: "v3-energy-objective" },
    selectedVariant: { variantId: "dg", uValue: 2.0, shgc: 0.45, dataSource: "certified", certified: true },
    price: { ok: true, total },
    fit: { fits: true, widthMm: 1200, heightMm: 1500, limit: null, breached: [] },
  })),
  hadCandidates: true, catalogueVersion: "cat-v1", withheldIncomplete: [],
});

const darkOpening = {
  family: "windows", operationType: "awning", widthMm: 1200, heightMm: 1500,
  externalRef: "W20", thermalContext: { requirementBasis: "plan_derived" },
};


test("AC-32 the learned layer records what it would have said, and moves nothing", () => {
  // The bucket overwhelmingly names amj-b. The ladder's competing set selects
  // amj-a, because amj-a is cheaper and cheapest-wins is the whole rule.
  const shadow = aggregateShadow([1, 2, 3, 4, 5, 6, 7].map(() => shadowRow("awning|plan_derived|s|0", "amj-b")));
  const evaluation = darkEvaluation({ "amj-a": 900, "amj-b": 1400 });

  const withModel = decide(darkOpening, evaluation, { shadow });
  const withoutModel = decide(darkOpening, darkEvaluation({ "amj-a": 900, "amj-b": 1400 }));

  // A IS SELECTED. Not nudged, not tie-broken — the layer had no channel.
  assert.equal(withModel.selected.candidate.slug, "amj-a");
  assert.equal(withoutModel.selected.candidate.slug, "amj-a");

  // And removing the model entirely changes NO selection anywhere: the complete
  // tier and rank order is identical, not merely the winner.
  const order = (r) => r.evaluated.map((e) => [e.candidate.slug, e.candidateOutcome.tier, e.candidateOutcome.rank, e.candidateOutcome.competing]);
  assert.deepEqual(order(withModel), order(withoutModel));

  // What the layer DID do is record its opinion, per candidate, for staff.
  const a = withModel.evaluated.find((e) => e.candidate.slug === "amj-a").candidateOutcome.learned;
  const b = withModel.evaluated.find((e) => e.candidate.slug === "amj-b").candidateOutcome.learned;
  assert.equal(b.wouldPrefer, true, "it would have promoted B");
  assert.equal(a.wouldPrefer, false);
  assert.equal(b.applied, false, "and it applied nothing");
  assert.equal(a.applied, false);
  assert.equal(b.observations, 7);
  assert.equal(b.support, 7);
  assert.equal(a.support, 0, "nobody ever issued A in this bucket");
  assert.equal(b.retrievalKey, "awning|plan_derived|s|0");
  assert.equal(b.retrievalKeyVersion, RETRIEVAL_KEY_VERSION);

  // With no model at all the block is null, not a neutral-looking zero — an
  // absent layer must not read as a layer with nothing to say.
  assert.equal(withoutModel.evaluated[0].candidateOutcome.learned, null);
});

test("AC-31/AC-35 below the floor it prefers nothing, and the evidence names its provenance", () => {
  const shadow = aggregateShadow([
    shadowRow("awning|plan_derived|s|0", "amj-b"),
    shadowRow("awning|plan_derived|s|0", "amj-b"),
    shadowRow("awning|plan_derived|s|0", "amj-b"),
    shadowRow("awning|plan_derived|s|0", "amj-b", "backfilled"),
  ]);
  const r = decide(darkOpening, darkEvaluation({ "amj-a": 900, "amj-b": 1400 }), { shadow });
  const b = r.evaluated.find((e) => e.candidate.slug === "amj-b").candidateOutcome.learned;

  // AC-31: four observations is below the floor, so no preference is claimed —
  // but the counts are still shown, because "we have four of these" is exactly
  // what a reviewer needs to judge how much the silence is worth.
  assert.equal(b.observations, 4);
  assert.equal(b.wouldPrefer, false);
  assert.equal(b.support, 4);
  // AC-35: three in-platform reviews and one backfilled row. A reviewer told
  // "3 of 4 similar openings went this way" can see which of the four were real
  // in-platform reviews without inventing the number.
  assert.deepEqual(b.provenance, { inPlatform: 3, backfilled: 1 });
});

test("buildShadowModel reads only quality-gated, keyed rows", async () => {
  let seen = null;
  const env = { DB: { prepare(sql) { seen = sql; return { async all() { return { results: [
    { retrieval_key: BUCKET, final_product_slug: "amj-b", provenance: "in_platform" },
  ] }; } }; } } };
  const model = await buildShadowModel(env);

  // The corpus is the REVIEWED one: rows a human endorsed at quote issue, and
  // only those. A pending row is an unsettled question and a rejected one is a
  // recorded mistake — neither is evidence about what humans choose.
  assert.match(seen, /FROM recommendation_outcome/i);
  assert.match(seen, /recommendation_eligible\s*=\s*1/i);
  assert.match(seen, /quality_state\s*=\s*'approved'/i);
  // And a row with no key belongs to no bucket, so it is not even fetched.
  assert.match(seen, /retrieval_key IS NOT NULL/i);
  // No project, account or price is read: the aggregate that leaves this model
  // is a product slug and some counts, which is what makes a cross-tenant read
  // defensible at all.
  assert.ok(!/project_id|account|price|final_line_total|context_json/i.test(seen), seen);

  assert.equal(model.version, RETRIEVAL_KEY_VERSION);
  assert.equal(model.lookup(shadowOpening()).supportFor("amj-b"), 1);
});

// ── The backfill ingest (D18, AC-34) ────────────────────────────────────────

/** A D1 stub whose project lookup can be made to fail. */
function backfillDb({ projectExists = true } = {}) {
  const batched = [];
  const prepare = (sql) => ({
    sql,
    bind(...args) { this.args = args; return this; },
    async first() { return /FROM project/.test(sql) && projectExists ? { id: "p_real" } : null; },
  });
  return { batched, DB: { prepare, async batch(stmts) { batched.push(...stmts); return []; } } };
}

const BACKFILL_LINE = {
  externalRef: "W03",
  context: {
    operationType: "awning", requirementBasis: "explicit_energy_report",
    widthMm: 2400, heightMm: 1500, thermalRequired: 1,
    family: "windows", climateZone: "6",
  },
  finalProductSlug: "amj80-series-awning-window",
  finalVariantId: "dg-lowe",
  finalConfig: { productSlug: "amj80-series-awning-window", quantity: 1 },
  finalLineTotal: 1250,
};


test("AC-34 a backfilled row is marked as such and lands in the same bucket", async () => {
  const env = backfillDb();
  const result = await captureBackfilledOutcomes(env, { projectId: "p_real", lines: [BACKFILL_LINE] });
  assert.equal(result.written, 1);
  assert.deepEqual(result.refused, []);

  const row = env.batched[0];
  const at = (column) => { const i = bindIndexOf(row.sql, column); return i == null ? null : row.args[i]; };

  // D18: these are REAL decisions — actual plans with the products actually
  // manufactured — made before the platform's review flow existed. So they are
  // eligible, approved evidence, flagged for WHERE they came from rather than
  // for whether they are true.
  // These five are SQL LITERALS rather than bound parameters, and that is the
  // security-relevant fact: no request body can make a backfilled row look like
  // an in-platform review, mark itself eligible, or claim a reason code.
  for (const column of ["recommendation_eligible", "quality_state", "decision", "reason_code", "provenance"]) {
    assert.equal(at(column), null, `${column} is not caller-settable`);
  }
  assert.match(row.sql, /'adjusted','BACKFILLED_HISTORY',1,0,'approved'/);
  assert.match(row.sql, /'backfilled'\)/);

  // It buckets by the SAME key the live capture writes, or it is not comparable
  // evidence at all.
  assert.equal(at("retrieval_key"), "awning|explicit_energy_report|m|1");
  assert.equal(at("retrieval_key_version"), RETRIEVAL_KEY_VERSION);
  assert.equal(retrievalKey(JSON.parse(at("context_json"))), at("retrieval_key"));
  assert.equal(at("final_product_slug"), "amj80-series-awning-window");
  assert.equal(at("final_line_total"), 1250);

  // The project id written is the one that was VERIFIED, never the body's.
  assert.equal(at("project_id"), "p_real");
});

test("a backfill row for a project that does not exist writes nothing", async () => {
  // The project id is verified against the database before any row is built —
  // a body-supplied identifier is a claim, and this table hangs off a real FK.
  const env = backfillDb({ projectExists: false });
  const result = await captureBackfilledOutcomes(env, { projectId: "p_made_up", lines: [BACKFILL_LINE] });
  assert.equal(result.written, 0);
  assert.deepEqual(env.batched, [], "not one statement was even prepared for the batch");
  assert.match(result.error, /project/i);
});

test("AC-56 free text in a backfill row is refused, not normalised into the corpus", async () => {
  // The same posture as the live capture: this is a cross-account queryable
  // index, and a staff typo or a pasted spreadsheet cell must not become a
  // bucket. Refusing beats coercing — a row that arrives wrong should be fixed
  // at the source, not silently filed under 'other'.
  const env = backfillDb();
  const hostile = "Mrs J. Whitmore, 14 Ellerslie Road Hawthorn VIC 3122";
  const result = await captureBackfilledOutcomes(env, {
    projectId: "p_real",
    lines: [
      { ...BACKFILL_LINE, context: { ...BACKFILL_LINE.context, operationType: hostile } },
      { ...BACKFILL_LINE, context: { ...BACKFILL_LINE.context, requirementBasis: "made-up-basis" } },
      { ...BACKFILL_LINE, finalProductSlug: hostile },
      { ...BACKFILL_LINE, finalProductSlug: "" },
      { ...BACKFILL_LINE, finalLineTotal: "not a number" },
      BACKFILL_LINE,
    ],
  });
  assert.equal(result.written, 1, "only the well-formed row is written");
  assert.equal(result.refused.length, 5);
  // The refusals name the field, so whoever is keying the data can fix it —
  // and they carry no echo of the offending value back to the caller.
  for (const refusal of result.refused) {
    assert.ok(refusal.field, "each refusal names its field");
    assert.ok(!JSON.stringify(refusal).includes("Whitmore"), "a refusal never echoes the input");
  }
  assert.deepEqual(result.refused.map((r) => r.field).sort(),
    ["context.operationType", "context.requirementBasis", "finalLineTotal", "finalProductSlug", "finalProductSlug"]);
});

test("AC-33 the learning point is quote ISSUE, and nowhere else", async () => {
  // D13: the capture layer was already correct — only retrieval was broken — so
  // this criterion is about what did NOT move. A source scan rather than a
  // behavioural test, because the failure it guards is a second call site being
  // added somewhere plausible: order acceptance, proposal publication, a cron.
  // Each would train the model on something no human reviewed.
  const callers = [];
  const walk = async (dir) => {
    for (const entry of await readdir(join(projectRoot, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { await walk(rel); continue; }
      if (!/\.ts$/.test(entry.name) || rel.endsWith("lib/ai/outcomes.ts")) continue;
      const code = (await readFile(join(projectRoot, rel), "utf8"))
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
      if (/\bcaptureRecommendationOutcomes\s*\(/.test(code)) callers.push(rel);
    }
  };
  await walk("worker");

  // Exactly one caller, and it is the issue path. A quote submitted to the
  // customer IS the review; anything earlier has no human in it.
  assert.deepEqual(callers, ["worker/lib/issue.ts"]);
});
