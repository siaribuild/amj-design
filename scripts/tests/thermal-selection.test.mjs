// Automated tests for the live thermal model: the coherence guard, requirement-
// relative deviation (D8), and the computed band. The regression that motivated
// the rework — a composite's non-overlapping lite bands collapsing to an
// impossible (min>max) band — is asserted directly against the coherence guard.
//
// Two things these tests once covered are gone. The precedence *resolver* and
// the standalone glass *selector* were retired as dead code. `gradedComplianceScore`
// and its FLOOR / SHGC_SPAN / UVALUE_SPAN constants were deleted with the
// weighted ranker (ADR 0007) — how nearly a candidate meets a band is now a
// DISTANCE, not a score between 0 and 1, and the cases that pinned the score
// are re-asked below in the deviation vocabulary that replaced it.
//
// End-to-end selection lives in estimator-recommendation.test.mjs; the ladder's
// own arithmetic in recommendation-ladder.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("thermal-selection");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export { coerceCoherent } from ${p("worker/lib/estimator/thermal/precedence.ts")};
      export { deviationOf } from ${p("worker/lib/estimator/ladder.ts")};
      export { computeThermalBand, zoneCapValues, ZONE_U_CAP } from ${p("worker/lib/estimator/thermal/computedBand.ts")};
      export { COMPASS_POINTS, DOCUMENT_SOURCES, readSourced, THERMAL_INPUT_CONTRACT_VERSION } from ${p("worker/lib/estimator/thermal/contract.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const {
  coerceCoherent, deviationOf, computeThermalBand, zoneCapValues, ZONE_U_CAP,
  COMPASS_POINTS, DOCUMENT_SOURCES, readSourced, THERMAL_INPUT_CONTRACT_VERSION,
} = await import(pathToFileURL(outfile).href);

const band = (maxUValue, minShgc, maxShgc, shgcTarget = null) => ({ maxUValue, minShgc, maxShgc, shgcTarget });
const cell = (slug, uValue, shgc, over = {}) => ({ glassOptionSlug: slug, variantId: slug, uValue, shgc, certified: false, pricingOptionSlugs: [], ...over });

// ── coherence guard (WS2) — the anti-regression ──────────────────────────────
test("coerceCoherent: an impossible SHGC band (min>max) drops the SHGC pair, keeps Uw + target", () => {
  const { band: out, altered } = coerceCoherent(band(1.69, 0.5, 0.41, 0.45));
  assert.equal(altered, true);
  assert.equal(out.minShgc, null);
  assert.equal(out.maxShgc, null);
  assert.equal(out.maxUValue, 1.69, "the U cap survives");
  assert.equal(out.shgcTarget, 0.45, "the advisory target survives to guide selection");
});

test("coerceCoherent: a coherent band is returned unchanged", () => {
  const { band: out, altered } = coerceCoherent(band(2.27, 0.37, 0.41));
  assert.equal(altered, false);
  assert.deepEqual({ u: out.maxUValue, min: out.minShgc, max: out.maxShgc }, { u: 2.27, min: 0.37, max: 0.41 });
});

test("coerceCoherent: nonsensical bounds (U<=0, SHGC out of [0,1]) are dropped", () => {
  const { band: out } = coerceCoherent(band(0, 1.4, -0.2));
  assert.equal(out, null, "nothing usable survives ⇒ null");
});

// ── requirement-relative deviation (D8), replacing graded compliance ─────────
//
// gradedComplianceScore is deleted with FLOOR, SHGC_SPAN and UVALUE_SPAN
// (ADR 0007). Its two spans punished an SHGC miss ~7.5× harder per unit than a
// Uw one, and its 0.1 floor existed to stop a score becoming a veto — both
// problems of scoring, and neither exists once the answer is a distance rather
// than a number between 0 and 1. These are the cases it used to own, re-asked
// in the vocabulary that replaced it.
const req = (b) => ({ maxUValue: b.maxUValue, minShgc: b.minShgc, maxShgc: b.maxShgc, basis: "explicit_energy_report", absent: false });
const devOf = (c, b) => deviationOf(req(b), { uValue: c.uValue, shgc: c.shgc }).scalar;

test("deviation: any in-band cell deviates by ZERO; SHGC position inside the band is not shaded", () => {
  // Owner rule: once a cell MEETS the band it is fully compliant. Two in-band
  // cells at different SHGC are equally compliant and price decides between them
  // — the old midpoint tie-break biased toward the pricier glass.
  assert.equal(devOf(cell("x", 1.6, 0.38), band(1.69, 0.37, 0.45)), 0);
  assert.equal(devOf(cell("y", 1.6, 0.44), band(1.69, 0.37, 0.45)), 0);
  // A miss is a MEASURED distance, not a shrinking score with a floor under it.
  const nearMiss = devOf(cell("x", 1.75, 0.4), band(1.69, 0.37, 0.45));
  assert.ok(nearMiss > 0 && nearMiss < 0.05, `near miss measured, got ${nearMiss}`);
  const grossMiss = devOf(cell("x", 9, 0.9), band(1.69, 0.37, 0.45));
  assert.ok(grossMiss > nearMiss, "a gross miss is further out, and has no floor to hide behind");
});

test("deviation: closer-to-band glass sorts ahead (the ordering that replaces the veto)", () => {
  const closer = devOf(cell("x", 1.8, 0.42), band(1.69, 0.37, 0.41));
  const farther = devOf(cell("y", 3.5, 0.7), band(1.69, 0.37, 0.41));
  assert.ok(closer < farther, `${closer} should sort ahead of ${farther}`);
});

test("D8: Uw and SHGC carry no hidden multiplier relative to each other", () => {
  // The defect this replaces: SHGC_SPAN 0.2 against UVALUE_SPAN 1.5 punished an
  // SHGC miss about 7.5× harder per unit. A 10% miss is now 0.10 on either axis.
  assert.equal(devOf(cell("u", 2.2, 0.4), band(2.0, 0.37, 0.45)), 0.1);
  assert.equal(devOf(cell("s", 1.6, 0.495), band(2.0, 0.37, 0.45)), 0.1);
});

// ── the computed band: composition over a declared input contract ────────────
//
// TB-18 binds every test in this section: NOTHING here asserts what the default
// Uw ought to be. Every expectation reads the dial record it was handed, and the
// fixture dial deliberately carries a value that is not today's default so that
// a test passing by coincidence would be visible. The single permitted literal
// (seed === today's value) lives in thermal-default-band.test.mjs (TB-16).
const dial = (over = {}) => ({
  version: "row:test", maxUValue: 2.5, method: "manual",
  source: "fixture record", derivedAt: "2026-08-20T00:00:00Z",
  observations: null, setBy: "test", interim: false, ...over,
});
const inputs = (over = {}) => ({
  climateZone: 6,
  elementType: "window", isCompositeChild: false,
  widthMm: 1810, heightMm: 1200, areaM2: 2.17,
  orientation: null, roomAreaM2: null, glazingToRoomFloorRatio: null,
  shadingProjectionMm: null, zoneType: null, glazingInstruction: null,
  ...over,
});
const sourced = (value, source = "plan") => ({ value, source });
const ruleIds = (r) => r.rulesApplied.map((x) => x.ruleId);
const usedFields = (r) => r.inputsUsed.map((x) => x.field);

// TB-1 (unit math). The retained mapping (spec A14), asserted point by point.
test("TB-1: the band varies with orientation — the retained southern-hemisphere mapping", () => {
  const d = dial();
  const at = (o) => computeThermalBand(inputs({ orientation: sourced(o) }), d).band;
  assert.deepEqual([at("N").shgcTarget, at("N").maxShgc], [0.5, null], "north keeps winter solar access");
  assert.deepEqual([at("S").shgcTarget, at("S").maxShgc], [0.4, null], "south is low-exposure");
  for (const o of ["E", "W"]) {
    assert.deepEqual([at(o).shgcTarget, at(o).maxShgc], [0.35, 0.43], `${o}: harsh low-angle sun, cooling capped`);
  }
  for (const o of ["NE", "NW", "SE", "SW"]) {
    assert.deepEqual([at(o).shgcTarget, at(o).maxShgc], [0.4, 0.5], `${o}: mixed aspect`);
  }
  // …and two openings differing ONLY in orientation get different bands — the
  // defect this whole feature exists for (444 of 444 identical).
  assert.notDeepEqual(at("W"), at("N"));
});

test("TB-3: no orientation ⇒ no SHGC, no rule fired, and the record says the input was missing", () => {
  const r = computeThermalBand(inputs(), dial());
  assert.equal(r.band.shgcTarget, null);
  assert.equal(r.band.maxShgc, null);
  assert.ok(!ruleIds(r).includes("orientation_shgc"), "a rule with no input does not fire");
  assert.ok(r.inputsMissing.includes("orientation"), "and its absence is recorded, never imputed");
  assert.ok(!usedFields(r).includes("orientation"));
});

test("TB-29: minShgc is null for every compass point and for none — an impossible interval is unreachable", () => {
  const d = dial();
  for (const o of [...COMPASS_POINTS, null]) {
    const r = computeThermalBand(inputs({ orientation: o ? sourced(o) : null }), d);
    assert.equal(r.band.minShgc, null, `minShgc must stay null (orientation ${o})`);
    const { band: coerced, altered } = coerceCoherent(r.band);
    assert.equal(altered, false, `a computed band never needs coercing (orientation ${o})`);
    assert.ok(coerced, "and it always carries a usable constraint");
  }
});

// TB-21 unit leg + the dial. The cap is the RECORD's value, never a literal.
test("TB-21: CZ6 and any unresolved zone read the dial; two records give two caps", () => {
  const a = dial({ version: "row:7", maxUValue: 3.3 });
  const b = dial({ version: "row:8", maxUValue: 1.9 });
  for (const zone of [6, null, 99]) {
    assert.equal(computeThermalBand(inputs({ climateZone: zone }), a).band.maxUValue, a.maxUValue);
    assert.equal(computeThermalBand(inputs({ climateZone: zone }), b).band.maxUValue, b.maxUValue);
  }
  const r = computeThermalBand(inputs(), a);
  assert.equal(r.defaultBandVersion, a.version, "the requirement snapshots which record produced it");
  const zoneRule = r.rulesApplied.find((x) => x.ruleId === "zone_u_cap");
  assert.match(zoneRule.provenance, /thermal_default_band row:7/);
  assert.match(zoneRule.provenance, /manual/);
});

test("TB-21: the other seven zone entries are kept, unchanged, and labelled unsourced_legacy", () => {
  assert.deepEqual({ ...ZONE_U_CAP }, { 1: 5.8, 2: 5.8, 3: 5.4, 4: 4.6, 5: 4.6, 7: 3.6, 8: 3.0 },
    "seven entries at their current values — zone 6 is the dial's, not a literal");
  const d = dial();
  for (const [zone, cap] of Object.entries(ZONE_U_CAP)) {
    const r = computeThermalBand(inputs({ climateZone: Number(zone) }), d);
    assert.equal(r.band.maxUValue, cap, `zone ${zone} keeps its value`);
    assert.match(r.rulesApplied.find((x) => x.ruleId === "zone_u_cap").provenance, /unsourced_legacy/,
      `zone ${zone} is honestly labelled`);
    assert.notEqual(r.band.maxUValue, d.maxUValue, "a listed zone does not silently read the dial");
  }
  // The zone term of TB-25's derived candidate-cap union: distinct, ascending.
  assert.deepEqual(zoneCapValues(), [3.0, 3.6, 4.6, 5.4, 5.8]);
});

// A14 pin — the label travels with every band that cites the rule, never sits
// only in a comment.
test("A14: the SHGC rule carries its version and its unsourced_legacy provenance in every result that used it", () => {
  for (const o of COMPASS_POINTS) {
    const r = computeThermalBand(inputs({ orientation: sourced(o, "energy_report") }), dial());
    const rule = r.rulesApplied.find((x) => x.ruleId === "orientation_shgc");
    assert.ok(rule, `orientation_shgc fired for ${o}`);
    assert.equal(rule.version, "v1");
    assert.match(rule.provenance, /unsourced_legacy/);
    assert.match(rule.provenance, /recorded version change|supersed/i,
      "the label says how it gets replaced, so a sourced mapping is a supersession, not an edit");
  }
});

// TB-11 / TB-12 — the basis is a CONSEQUENCE of the sources actually consumed,
// never an assertion made beside them.
test("TB-11/TB-12: a document-sourced input makes the band plan_derived; nothing else can", () => {
  for (const source of DOCUMENT_SOURCES) {
    const r = computeThermalBand(inputs({ orientation: sourced("W", source) }), dial());
    assert.equal(r.basis, "plan_derived", `${source} is this project's own documents`);
    const used = r.inputsUsed.find((x) => x.field === "orientation");
    assert.deepEqual({ value: used.value, source: used.source }, { value: "W", source });
  }
  const blind = computeThermalBand(inputs(), dial());
  assert.equal(blind.basis, "default_envelope");
  assert.deepEqual(blind.inputsUsed.filter((x) => DOCUMENT_SOURCES.has(x.source)), [],
    "the dial and the archetype are envelope_default and can never make a band plan-derived");
  // …and an envelope-sourced orientation cannot launder itself into plan_derived.
  assert.equal(computeThermalBand(inputs({ orientation: sourced("W", "envelope_default") }), dial()).basis,
    "default_envelope");
});

test("TB-8: inputsMissing lists every unsupplied contract field, including the ones no rule reads yet", () => {
  const r = computeThermalBand(inputs(), dial());
  assert.deepEqual([...r.inputsMissing].sort(), [
    "glazingInstruction", "glazingToRoomFloorRatio", "orientation",
    "roomAreaM2", "shadingProjectionMm", "zoneType",
  ], "the number that starts falling the day the extraction thread ships");
  assert.equal(r.contractVersion, THERMAL_INPUT_CONTRACT_VERSION);
  const full = computeThermalBand(inputs({
    orientation: sourced("N"), roomAreaM2: sourced(14.2), glazingToRoomFloorRatio: sourced(0.15),
    shadingProjectionMm: sourced(600), zoneType: sourced("living"),
    glazingInstruction: sourced({ doubleGlazed: true, note: null }, "schedule"),
  }), dial());
  assert.deepEqual(full.inputsMissing, []);
  // Supplied-but-unread fields are not "used" either: only rules that fired put
  // an entry in inputsUsed, so no unbuilt rule can be inferred to have run.
  assert.deepEqual(usedFields(full).sort(), ["climateZone", "orientation"]);
});

// TB-6 runtime leg — junk is rejected at the boundary, never laundered into a
// band. The compile leg is the type itself: there is no unsourced variant.
test("TB-6: an unsourced, mis-sourced or off-compass value is treated as absent", () => {
  assert.equal(readSourced("W"), null, "a bare value has no source and is not representable");
  assert.equal(readSourced({ value: "W" }), null);
  assert.equal(readSourced({ value: "W", source: "vibes" }), null);
  assert.equal(readSourced({ value: null, source: "plan" }), null);
  assert.equal(readSourced({ value: "West elevation", source: "plan" }, { compass: true }), null,
    "longhand is the extraction thread's problem; it never becomes a band here");
  assert.deepEqual(readSourced({ value: "W", source: "plan" }, { compass: true }), { value: "W", source: "plan" });
  const r = computeThermalBand(inputs({ orientation: { value: "NORTH-WEST", source: "plan" } }), dial());
  assert.equal(r.band.shgcTarget, null, "junk did not become an SHGC target");
  assert.ok(r.inputsMissing.includes("orientation"));
  assert.equal(r.basis, "default_envelope", "and it cannot claim to be evidence-derived");
});

test("elementType is accepted and consulted by no rule — variation comes from inputs, never invented modifiers", () => {
  const d = dial();
  const window = computeThermalBand(inputs({ elementType: "window", orientation: sourced("E") }), d);
  const door = computeThermalBand(inputs({ elementType: "door", orientation: sourced("E") }), d);
  assert.deepEqual(window.band, door.band);
  assert.deepEqual(window.rulesApplied, door.rulesApplied);
});

// TB-5 (one home). A second copy of the mapping or the zone table would satisfy
// every behavioural test above, so the source is scanned for exactly one.
async function sourceFiles(dir) {
  const out = [];
  for (const entry of await readdir(join(projectRoot, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...await sourceFiles(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

test("TB-5: exactly one module computes a thermal band, and the mapping and zone table live there only", async () => {
  const files = [...await sourceFiles("worker"), ...await sourceFiles("src")];
  const producers = [];
  const mappings = [];
  const zoneTables = [];
  const stragglers = [];
  for (const rel of files) {
    // Comments are where a supersession gets EXPLAINED; only live code counts.
    const code = (await readFile(join(projectRoot, rel), "utf8"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    if (/\bexport function computeThermalBand\b/.test(code)) producers.push(rel);
    if (/(const|let|var)\s+SHGC_BY_ORIENTATION\b/.test(code)) mappings.push(rel);
    if (/(const|let|var)\s+ZONE_U_CAP\b/.test(code)) zoneTables.push(rel);
    // The superseded flat-constant shape must leave no second band producer.
    if (/\b(computeDefaultBand|UCAP_FALLBACK|shgcForOrientation|defaultRequirement)\b/.test(code)) stragglers.push(rel);
  }
  const home = "worker/lib/estimator/thermal/computedBand.ts";
  assert.deepEqual(producers, [home]);
  assert.deepEqual(mappings, [home]);
  assert.deepEqual(zoneTables, [home]);
  assert.deepEqual(stragglers, [], "the superseded flat-constant band left no second home behind");
});
