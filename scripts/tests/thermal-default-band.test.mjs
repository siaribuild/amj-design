// The owner's dial and the calibration that shows its consequences.
//
// TB-18 BINDS EVERY TEST IN THIS FILE: no assertion here fixes what the default
// Uw *ought* to be. Tests read the active record and assert FLOW. The single
// permitted business literal in the whole feature is TB-16's seed-equals-today's
// -value check immediately below, and it exists for exactly one reason —
// deploying this feature must move no existing estimate.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("thermal-default-band");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export { SEED_DEFAULT_BAND, resolveActiveDefaultBand } from ${p("worker/lib/estimator/thermal/defaultBand.ts")};
      export { computeCalibration, readCalibration, CALIBRATION_PROJECT_FLOOR } from ${p("worker/lib/estimator/thermal/calibration.ts")};
      export { zoneCapValues } from ${p("worker/lib/estimator/thermal/computedBand.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const {
  SEED_DEFAULT_BAND, resolveActiveDefaultBand,
  computeCalibration, readCalibration, CALIBRATION_PROJECT_FLOOR, zoneCapValues,
} = await import(pathToFileURL(outfile).href);

// A dial fixture that is deliberately NOT today's value (TB-18): every
// calibration assertion below reads this record, so a test that had quietly
// pinned the business default instead would fail here rather than pass by
// coincidence. 4.4 sits in the same interval of the catalogue fixture as today's
// value, so it changes no arithmetic — only what the arithmetic is read from.
const activeDefault = (over = {}) => ({
  version: "row:3", maxUValue: 4.4, method: "manual", source: "fixture record",
  derivedAt: "2026-08-20", observations: null, setBy: "test", interim: false, ...over,
});
const calibrationInput = (over = {}) => ({
  computedAt: "2026-08-20T00:00:00.000Z",
  catalogueRevision: "cat:test",
  activeDefault: activeDefault(),
  basisRows: [],
  reportStats: { openings: 0, projects: 0, minU: null, maxU: null, meanU: null },
  profileRows: [],
  products: [],
  disabledProducts: 0,
  ...over,
});

// ── TB-16: the seed changes no estimate, and tells the truth ─────────────────
test("TB-16: the seed carries today's value, and admits nothing citable stands behind it", () => {
  // THE ONE PERMITTED LITERAL. 4.0 is not a claim that 4.0 is correct — it is
  // the constant the platform has carried since the default envelope was
  // written, pinned here so that shipping the dial moves no existing estimate.
  // Choosing the number is the owner's business decision, not engineering's.
  assert.equal(SEED_DEFAULT_BAND.maxUValue, 4.0);
  assert.equal(SEED_DEFAULT_BAND.method, "unsourced_legacy");
  assert.match(SEED_DEFAULT_BAND.source, /no citable source/i,
    "the instrument's first act is to admit the number in force was chosen by nobody");
  assert.equal(SEED_DEFAULT_BAND.observations, null, "it is not derived from observations");
  assert.equal(SEED_DEFAULT_BAND.interim, true);
  assert.equal(SEED_DEFAULT_BAND.setBy, "system_seed");
  assert.equal(SEED_DEFAULT_BAND.version, "seed:1");
});

// ── TB-17, unit leg: resolution ──────────────────────────────────────────────
// A fake D1 whose `first()` returns whatever row the test hands it.
const fakeDb = (row, opts = {}) => ({
  prepare(sql) {
    opts.sql?.push(sql);
    return { first: async () => (opts.throws ? Promise.reject(new Error("d1 down")) : row) };
  },
});

test("TB-17: the newest ledger row supersedes the seed; an empty or unreadable table falls back to it", async () => {
  const sql = [];
  const active = await resolveActiveDefaultBand(fakeDb({
    id: 7, max_u_value: 2.8, method: "abcb_glazing_calculator",
    source: "ABCB Glazing Calculator, Melbourne detached, 2026-08-20",
    derived_at: "2026-08-20", observations_json: null, set_by: "owner", interim: 0,
  }, { sql }));
  assert.equal(active.version, "row:7", "the requirement will snapshot WHICH row said so");
  assert.equal(active.maxUValue, 2.8);
  assert.equal(active.method, "abcb_glazing_calculator");
  assert.equal(active.interim, false);
  assert.equal(active.setBy, "owner");
  assert.match(sql.join(" "), /ORDER BY id DESC/i, "newest row wins");

  // The empty table is the normal state on the day this ships.
  assert.deepEqual(await resolveActiveDefaultBand(fakeDb(null)), SEED_DEFAULT_BAND);
  // A row that cannot be a cap is not a cap. Never throw: an unreadable dial
  // must not take an extraction run down with it.
  assert.deepEqual(await resolveActiveDefaultBand(fakeDb({ id: 9, max_u_value: 0, method: "manual", source: "x", derived_at: "y", set_by: "z", interim: 1 })), SEED_DEFAULT_BAND);
  assert.deepEqual(await resolveActiveDefaultBand(fakeDb(null, { throws: true })), SEED_DEFAULT_BAND);
});

// ── Axis 1 and axis 2: what reports have DEMANDED vs what the default ASSERTS ─
test("TB-22: calibration reports demand beside assertion", () => {
  const report = computeCalibration(calibrationInput({
    basisRows: [
      { requirement_basis: "explicit_energy_report", n: 255 },
      { requirement_basis: "default_envelope", n: 444 },
    ],
    reportStats: { openings: 255, projects: 2, minU: 1.69, maxU: 3.04, meanU: 1.9021 },
  }));
  // Axis 1 — every basis is present, including the ones with no rows, because a
  // zero is the finding in this feature's case, not an absence.
  assert.deepEqual(report.basisCounts, {
    explicit_energy_report: 255, plan_derived: 0, default_envelope: 444, human_override: 0,
  });
  assert.deepEqual(report.reportRows, {
    openings: 255, distinctProjects: 2, minUValue: 1.69, maxUValue: 3.04, meanUValue: 1.9,
  });
  // Axis 2 — the assertion, with its provenance, so the two can be read together.
  const active = activeDefault();
  assert.deepEqual(report.activeDefault, {
    maxUValue: active.maxUValue, version: active.version, method: active.method,
    source: active.source, derivedAt: active.derivedAt, interim: active.interim,
  });
  assert.equal(report.computedAt, "2026-08-20T00:00:00.000Z");
  assert.equal(report.catalogueRevision, "cat:test", "so two readings can be compared");
});

// ── TB-25: the candidate caps are DERIVED, not hand-picked ───────────────────
// The expected union is built here independently of the implementation: a
// hand-picked list would be a fresh set of magic numbers, which is the thing
// this whole feature is removing.
test("TB-25: candidate caps are exactly active ∪ zone values ∪ report min/mean/max, deduped and sorted", () => {
  const active = activeDefault({ maxUValue: 4.4 });
  const stats = { openings: 255, projects: 2, minU: 1.69, maxU: 3.04, meanU: 1.9021 };
  const report = computeCalibration(calibrationInput({ activeDefault: active, reportStats: stats }));
  const expected = [...new Set([
    active.maxUValue, ...zoneCapValues(), 1.69, 1.9, 3.04,
  ])].sort((a, b) => a - b);
  assert.deepEqual(report.candidateCaps.map((c) => c.cap), expected);
  // Each cap says WHY it is on the list, so no number is unexplained.
  const byCap = new Map(report.candidateCaps.map((c) => [c.cap, c.origins]));
  assert.deepEqual(byCap.get(4.4), ["active_default"]);
  assert.deepEqual(byCap.get(1.69), ["report_min"]);
  assert.deepEqual(byCap.get(1.9), ["report_mean"]);
  assert.deepEqual(byCap.get(3.04), ["report_max"]);
  assert.deepEqual(byCap.get(3.6), ["zone_table"]);
  // With no report rows at all, only the derived-from-nothing terms remain.
  const bare = computeCalibration(calibrationInput({ activeDefault: active }));
  assert.deepEqual(bare.candidateCaps.map((c) => c.cap),
    [...new Set([active.maxUValue, ...zoneCapValues()])].sort((a, b) => a - b));
});

// ── Axis 3: what the PUBLISHED catalogue can deliver ─────────────────────────
// The fixture mirrors the shape measured in the live catalogue on 2026-08-20:
// 306 authored thermalProfile rows, 58 of them published, 49 of those meeting
// the cap in force. These literals assert calibration ARITHMETIC over a fixture;
// none of them says what the default ought to be (TB-18), and the fixture dial
// deliberately does not carry today's value.
const catalogueFixture = () => {
  const profileRows = [];
  // 49 published rows at 3.5 (meet the active cap, miss 3.04), 9 published at
  // 4.5 (meet neither), and 248 authored-but-unpublished rows at 2.0.
  for (let i = 0; i < 49; i++) profileRows.push({ uValue: 3.5, published: true });
  for (let i = 0; i < 9; i++) profileRows.push({ uValue: 4.5, published: true });
  for (let i = 0; i < 248; i++) profileRows.push({ uValue: 2.0, published: false });
  return profileRows;
};

test("TB-23: axis 3 counts published rows and deliverable products at each candidate cap", () => {
  const report = computeCalibration(calibrationInput({
    profileRows: catalogueFixture(),
    products: [
      { disabled: false, rows: [{ uValue: 3.5, published: true }] },              // delivers at the active cap
      { disabled: false, rows: [{ uValue: 4.5, published: true }] },              // delivers at neither
      { disabled: false, rows: [{ uValue: 2.0, published: false }] },             // authored, not published
      { disabled: true, rows: [{ uValue: 1.5, published: true }] },               // withdrawn: delivers nothing
    ],
  }));
  const at = (cap) => report.candidateCaps.find((c) => c.cap === cap);
  // Read by the record's own value, never by a literal (TB-18).
  const active = at(activeDefault().maxUValue);
  assert.equal(active.publishedRowsTotal, 58, "58 of 306 authored rows are published");
  assert.equal(active.publishedRowsMeeting, 49, "and 49 of those meet the active default");
  assert.equal(at(3.04), undefined, "3.04 is not a candidate without report rows to derive it from");
  assert.equal(active.unpublishedRowsMeeting, 248,
    "authored-but-unpublished counted SEPARATELY — the publishing state is a deliberate position, not a gap");
  // A product with no published row counts once in the denominator and never in
  // a numerator; a disabled product is in neither, and is surfaced instead.
  assert.equal(active.productsTotal, 3);
  assert.equal(active.productsWithPublishedRowMeeting, 1);
  assert.equal(report.disabledProductsExcluded, 1);
});

// ── TB-24: the dial states its cost BEFORE it is turned ──────────────────────
// This is the sentence that has to exist before anyone moves the default. The
// withdrawn proposal to tighten it to 3.04 was withdrawn precisely because this
// number had never been put beside it.
test("TB-24: every candidate other than the active one carries its cost against today", () => {
  const report = computeCalibration(calibrationInput({
    reportStats: { openings: 255, projects: 2, minU: 1.69, maxU: 3.04, meanU: 1.9021 },
    profileRows: catalogueFixture().concat(
      // 28 more published rows at 3.0, which meet 3.04 as well as the active cap.
      Array.from({ length: 28 }, () => ({ uValue: 3.0, published: true })),
    ),
    products: [
      { disabled: false, rows: [{ uValue: 3.5, published: true }] },   // loses everything at 3.04
      { disabled: false, rows: [{ uValue: 3.0, published: true }] },   // survives
    ],
  }));
  const at = (cap) => report.candidateCaps.find((c) => c.cap === cap);
  const active = at(activeDefault().maxUValue);
  assert.equal(active.deltaVsActive, null, "the active cap has no cost against itself");
  assert.equal(active.publishedRowsMeeting, 77);
  assert.equal(at(3.04).publishedRowsMeeting, 28);
  assert.deepEqual(at(3.04).deltaVsActive, { publishedRows: -49, productsLosingAllPublishedRows: 1 },
    "tightening to 3.04 takes deliverable published rows from 77 to 28, and one product to none at all");
  // Loosening is a cost statement too, and it points the other way.
  assert.ok(at(4.6).deltaVsActive.publishedRows > 0);
  assert.equal(at(4.6).deltaVsActive.productsLosingAllPublishedRows, 0);
});

// ── TB-26: thin evidence is reported as thin, and nothing is ever recommended ─
test("TB-26: sampleAdequate turns on the evidence floor, and no cap is ever recommended", () => {
  const below = computeCalibration(calibrationInput({
    reportStats: { openings: 255, projects: CALIBRATION_PROJECT_FLOOR - 1, minU: 1.69, maxU: 3.04, meanU: 1.9 },
  }));
  const at = computeCalibration(calibrationInput({
    reportStats: { openings: 255, projects: CALIBRATION_PROJECT_FLOOR, minU: 1.69, maxU: 3.04, meanU: 1.9 },
  }));
  assert.equal(below.sampleAdequate, false, "two projects is a coincidence, not a corpus");
  assert.equal(at.sampleAdequate, true);
  // TB-19/A4/AD-T8: no recommendation at ANY sample size. The report presents
  // the axes and the change-cost; the human concludes. A withdrawn derivation
  // rule must not return dressed as advice.
  for (const report of [below, at]) {
    const json = JSON.stringify(report);
    assert.equal(/recommend/i.test(json), false, "nothing in the payload recommends a value");
    assert.equal("recommendedValue" in report, false);
  }
});

// ── TB-27 / TB-19: calibration measures; it never writes ─────────────────────
test("TB-19/TB-27: the calibration module contains no write verb and cannot move the dial", async () => {
  const source = await readFile(join(projectRoot, "worker/lib/estimator/thermal/calibration.ts"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  for (const verb of ["INSERT", "UPDATE", "DELETE", "REPLACE INTO", "CREATE TABLE", "DROP"]) {
    assert.equal(new RegExp(`\\b${verb}\\b`, "i").test(code), false, `calibration must not contain ${verb}`);
  }
  // Computing it any number of times leaves the record it read exactly as it was.
  const active = activeDefault();
  const before = JSON.stringify(active);
  for (let i = 0; i < 3; i++) computeCalibration(calibrationInput({ activeDefault: active }));
  assert.equal(JSON.stringify(active), before);
});

test("edges: zero report rows and zero published rows produce zeros and nulls, never NaN", () => {
  const empty = computeCalibration(calibrationInput({
    products: [{ disabled: false, rows: [] }],   // a product with no published row at all
  }));
  assert.deepEqual(empty.reportRows,
    { openings: 0, distinctProjects: 0, minUValue: null, maxUValue: null, meanUValue: null },
    "no observations is not the same fact as zero");
  assert.equal(empty.sampleAdequate, false);
  const json = JSON.stringify(empty);
  assert.equal(/NaN|null,null/.test(json.replace(/"[^"]*":null/g, "")), false);
  for (const candidate of empty.candidateCaps) {
    assert.deepEqual(
      [candidate.publishedRowsMeeting, candidate.publishedRowsTotal, candidate.productsWithPublishedRowMeeting],
      [0, 0, 0]);
    assert.equal(candidate.productsTotal, 1, "the denominator survives — the product did not vanish from it");
  }
});

// ── AB-6: the aggregate carries counts, and nothing that could identify anyone ─
test("AB-6: no identifier of any kind can appear in a calibration payload", () => {
  const report = computeCalibration(calibrationInput({
    basisRows: [{ requirement_basis: "explicit_energy_report", n: 255 }],
    reportStats: { openings: 255, projects: 2, minU: 1.69, maxU: 3.04, meanU: 1.9 },
    profileRows: catalogueFixture(),
    products: [{ disabled: false, rows: [{ uValue: 3.5, published: true }] }],
  }));
  const keys = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) return node.forEach((v) => walk(v, `${path}[]`));
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) { keys.push(`${path}.${k}`); walk(v, `${path}.${k}`); }
  };
  walk(JSON.parse(JSON.stringify(report)), "");
  const identifying = keys.filter((k) =>
    /project|account|customer|user|owner|email|filename|externalRef|productId|sanity|_id|slug|name\b/i.test(k));
  // `distinctProjects` is a COUNT of projects, which is the opposite of naming one.
  assert.deepEqual(identifying, [".reportRows.distinctProjects"]);
  // Unpublished evidence — the owner's forward product intentions — appears as a
  // count and nothing else. No row or product identity leaves this function.
  assert.ok(report.candidateCaps.every((c) => typeof c.unpublishedRowsMeeting === "number"));
  assert.equal(/W0\d|prj_|amj\d/i.test(JSON.stringify(report)), false);
});

// ── TB-19, the stronger leg: every statement the read path prepares ──────────
test("TB-19: readCalibration prepares SELECTs only, and never asks for a project id back", async () => {
  const prepared = [];
  const groq = [];
  const env = {
    DB: {
      prepare(sql) {
        prepared.push(sql);
        return {
          bind: () => ({ all: async () => ({ results: [] }) }),
          all: async () => ({ results: [{ requirement_basis: "explicit_energy_report", n: 3 }] }),
          first: async () => ({ openings: 3, projects: 1, minU: 1.7, maxU: 2.4, meanU: 2.0 }),
        };
      },
    },
    SANITY_PROJECT_ID: "",   // catalogue off: axis 3 reports an empty catalogue, not an error
  };
  const report = await readCalibration(env, async (q) => { groq.push(q); return []; });
  assert.ok(prepared.length >= 2, "axis 1 and axis 2 are read");
  for (const sql of prepared) {
    assert.match(sql.trim(), /^SELECT\b/i, `every statement is a SELECT: ${sql.trim().slice(0, 40)}`);
  }
  // The aggregate is deliberately unscoped ACROSS accounts — that is its purpose
  // — so the guard moves to the output: project_id never leaves SQL.
  const selectsProjectId = prepared.some((sql) => /project_id/i.test(sql) && !/COUNT\(DISTINCT project_id\)/i.test(sql));
  assert.equal(selectsProjectId, false, "project_id appears only inside a COUNT(DISTINCT …)");
  assert.equal(groq.every((q) => /^\s*\*\[/.test(q)), true, "the catalogue is queried, never mutated");
  assert.equal(report.basisCounts.explicit_energy_report, 3);
  assert.equal(report.candidateCaps.length > 0, true);
});

// ── AB-3, static leg: the dial has no HTTP write surface at all ──────────────
// The absence is pinned so it cannot be added later without a decision. A write
// endpoint with no screen behind it is an authorization surface bought for
// nobody; setting the dial is a privileged DB act until the ops screen exists.
test("AB-3: the thermal ops route file declares exactly one GET and no write verb", async () => {
  const source = await readFile(join(projectRoot, "worker/routes/ops-thermal.ts"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  for (const verb of ["post", "put", "patch", "delete"]) {
    assert.equal(new RegExp(`\\.${verb}\\s*\\(`, "i").test(code), false, `no .${verb}( in the thermal route file`);
  }
  assert.equal((code.match(/\.get\s*\(/g) ?? []).length, 1, "exactly one route, and it reads");
  assert.match(code, /resolveStaff/, "and it is staff-gated in the route, not only at the perimeter");
  assert.equal(/thermal_default_band/.test(code), false, "the route does not touch the ledger table at all");
});
