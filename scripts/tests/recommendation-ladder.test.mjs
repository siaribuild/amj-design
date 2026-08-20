// The selection LADDER (docs/specs/recommendation-model-design.md §4) — pure,
// fixture-only, no repository and no pricing engine. This suite owns the
// acceptance criteria that can be proven without wiring: AC-2/3/5, AC-13/14/15,
// AC-43/44/45/46/47/48, AC-51/52, and edge cases E8/E9/E10/E11.
//
// TS bundled with esbuild, same header pattern as estimator-rules.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("recommendation-ladder");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export { REQUIREMENT_TOLERANCE, SELECTION_VERSION, deviationOf, assignTiers, compareCandidates, runLadder } from ${p("worker/lib/estimator/ladder.ts")};
      export { TIER_ORDER, tierRank } from ${p("src/data/recommendation.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const {
  REQUIREMENT_TOLERANCE, SELECTION_VERSION, deviationOf, assignTiers, compareCandidates, runLadder,
  TIER_ORDER, tierRank,
} = await import(pathToFileURL(outfile).href);

// ── Fixtures ────────────────────────────────────────────────────────────────

/** A resolved requirement. Every axis is opt-in. */
const req = (over = {}) => ({
  maxUValue: null, minShgc: null, maxShgc: null,
  basis: "explicit_energy_report", absent: false, ...over,
});
const NO_REQ = req({ absent: true, basis: null });

/** A ladder candidate. Deviation and price are the only things that matter. */
let seq = 0;
const cand = (over = {}) => ({
  key: over.key ?? `k${++seq}`,
  productSlug: over.productSlug ?? "p-aaa",
  variantId: null,
  splitKey: null,
  excluded: false,
  fits: true,
  lastResort: false,
  deviation: 0,
  thermalRequired: true,
  priceCents: 100_000,
  ...over,
});

const byKey = (result, key) => result.ranked.find((c) => c.key === key);
const keysInOrder = (result) => result.ranked.map((c) => c.key);

// ── Deviation math (AC-13, D8) ──────────────────────────────────────────────

test("AC-13 deviationOf is miss divided by the requirement value", () => {
  const d = deviationOf(req({ maxUValue: 4.0 }), { uValue: 4.4, shgc: null });
  assert.equal(d.scalar, 0.1);
  assert.equal(d.absoluteMiss, 0.4);
  assert.equal(d.worstAxis, "uValue");
  assert.equal(d.perAxis.uValue, 0.1);
  assert.equal(d.perAxis.minShgc, null);
  assert.equal(d.perAxis.maxShgc, null);
});

test("AC-14/AC-15 every axis is commensurable and the WORST one decides", () => {
  // A 10% miss is 0.10 whichever axis carries it — the whole point of D8.
  const r = req({ maxUValue: 4.0, minShgc: 0.30 });
  assert.equal(deviationOf(r, { uValue: 4.4, shgc: 0.30 }).scalar, 0.1);
  assert.equal(deviationOf(r, { uValue: 4.0, shgc: 0.27 }).scalar, 0.1);
  // An SHGC CAP deviates upward.
  const cap = deviationOf(req({ maxShgc: 0.40 }), { uValue: null, shgc: 0.44 });
  assert.equal(cap.scalar, 0.1);
  assert.equal(cap.worstAxis, "maxShgc");
  assert.equal(cap.absoluteMiss, 0.04);
  // AC-15: missing Uw by 4% and the SHGC floor by 12% is a deviation of 0.12 on
  // minShgc, with both per-axis figures preserved for display.
  const worst = deviationOf(req({ maxUValue: 4.0, minShgc: 0.50 }), { uValue: 4.16, shgc: 0.44 });
  assert.equal(worst.scalar, 0.12);
  assert.equal(worst.worstAxis, "minShgc");
  assert.equal(worst.perAxis.uValue, 0.04);
  assert.equal(worst.perAxis.minShgc, 0.12);
});

test("A2/E8 an unmeasurable axis is UNKNOWN; an ABSENT requirement is zero", () => {
  // No figure on a constrained axis ⇒ the whole candidate is unknown, never 0.
  assert.equal(deviationOf(req({ maxUValue: 4.0 }), { uValue: null, shgc: 0.5 }).scalar, null);
  // Even when another axis IS measurably missed: the worst axis cannot be asserted.
  const partial = deviationOf(req({ maxUValue: 4.0, minShgc: 0.5 }), { uValue: null, shgc: 0.4 });
  assert.equal(partial.scalar, null);
  assert.equal(partial.worstAxis, null);
  assert.equal(partial.absoluteMiss, null);
  // Meeting every constrained axis is a real, measured zero with no worst axis.
  const met = deviationOf(req({ maxUValue: 4.0, minShgc: 0.30 }), { uValue: 3.2, shgc: 0.55 });
  assert.equal(met.scalar, 0);
  assert.equal(met.worstAxis, null);
  assert.equal(met.absoluteMiss, null);
  // AC-6/E5: no requirement at all is zero deviation, not unknown.
  assert.equal(deviationOf(NO_REQ, { uValue: null, shgc: null }).scalar, 0);
  // A requirement object that constrains no axis is the same thing.
  assert.equal(deviationOf(req(), { uValue: null, shgc: null }).scalar, 0);
});

// ── Tier A: the cheapest among those that meet (AC-1, D2, D10) ──────────────

test("AC-1 the cheapest candidate that MEETS the requirement is selected", () => {
  const r = runLadder([
    cand({ key: "meets-1100", deviation: 0, priceCents: 110_000, productSlug: "p-b" }),
    cand({ key: "meets-900", deviation: 0, priceCents: 90_000, productSlug: "p-a" }),
    cand({ key: "misses", deviation: 0.2, priceCents: 50_000, productSlug: "p-c" }),
  ]);
  assert.equal(r.selectedKey, "meets-900");
  assert.equal(r.competingTier, "meets");
  assert.equal(byKey(r, "meets-900").tier, "meets");
  assert.equal(byKey(r, "meets-900").selected, true);
  assert.equal(byKey(r, "meets-900").rank, 1);
  assert.equal(byKey(r, "meets-1100").competing, true);
  assert.equal(byKey(r, "meets-1100").selected, false);
  // AC-44's shape: a cheaper candidate that misses the band still loses.
  assert.equal(byKey(r, "misses").competing, false);
  assert.equal(byKey(r, "misses").rank, 3);
});

// ── Tier B: the tolerance band when nothing meets (AC-2, AC-3, D10) ─────────

test("AC-2 none meets: best 0.05, band 0.10, the $900 / Uw 4.4 candidate wins", () => {
  const R = req({ maxUValue: 4.0 });
  const dev = (u) => deviationOf(R, { uValue: u, shgc: null }).scalar;
  const r = runLadder([
    cand({ key: "u42", deviation: dev(4.2), priceCents: 140_000, productSlug: "p-a" }),
    cand({ key: "u44", deviation: dev(4.4), priceCents: 90_000, productSlug: "p-b" }),
    cand({ key: "u46", deviation: dev(4.6), priceCents: 60_000, productSlug: "p-c" }),
  ]);
  assert.equal(r.best, 0.05);
  assert.equal(r.competingTier, "within_tolerance");
  assert.equal(byKey(r, "u42").tier, "within_tolerance");
  assert.equal(byKey(r, "u44").tier, "within_tolerance");
  assert.equal(byKey(r, "u46").tier, "misses");
  assert.equal(byKey(r, "u46").competing, false);
  assert.equal(r.selectedKey, "u44");
});

test("AC-3 the competing set is never empty while any candidate survives", () => {
  // Every candidate misses badly. The best still sits inside a band measured
  // from itself, so something always competes.
  const r = runLadder([
    cand({ key: "a", deviation: 0.80, priceCents: 200_000, productSlug: "p-a" }),
    cand({ key: "b", deviation: 1.40, priceCents: 50_000, productSlug: "p-b" }),
  ]);
  assert.equal(r.selectedKey, "a");
  assert.equal(r.competingTier, "within_tolerance");
  assert.equal(byKey(r, "b").tier, "misses");
  // …and a single candidate, however bad, competes with itself.
  const alone = runLadder([cand({ key: "only", deviation: 9, priceCents: 1_000 })]);
  assert.equal(alone.selectedKey, "only");
});

test("AC-6/E5 with no thermal requirement every fitting candidate MEETS", () => {
  // The opening has no band at all, so a null reading is not a gap in the data —
  // there is simply nothing to measure against, and cheapest wins.
  const r = runLadder([
    cand({ key: "a", thermalRequired: false, deviation: null, priceCents: 90_000, productSlug: "p-a" }),
    cand({ key: "b", thermalRequired: false, deviation: null, priceCents: 70_000, productSlug: "p-b" }),
    cand({ key: "c", thermalRequired: false, deviation: null, priceCents: 120_000, productSlug: "p-c" }),
  ]);
  assert.deepEqual(r.ranked.map((c) => c.tier), ["meets", "meets", "meets"]);
  assert.equal(r.selectedKey, "b");
});

// ── Tier X and tier E: hard constraints and the last resort ─────────────────

test("D3 an excluded candidate is never machine-selected and carries rank null", () => {
  const r = runLadder([
    cand({ key: "x", excluded: true, deviation: 0, priceCents: 1_000, productSlug: "p-a" }),
    cand({ key: "ok", deviation: 0.4, priceCents: 200_000, productSlug: "p-b" }),
  ]);
  assert.equal(r.selectedKey, "ok");
  assert.equal(byKey(r, "x").tier, "excluded");
  assert.equal(byKey(r, "x").rank, null);
  assert.equal(byKey(r, "x").competing, false);
  assert.equal(byKey(r, "x").selected, false);
  // Excluded rows sort last, and ranking skips them so the survivors number 1..n.
  assert.deepEqual(keysInOrder(r), ["ok", "x"]);
  assert.equal(byKey(r, "ok").rank, 1);
  // An excluded candidate does not anchor the tolerance band either.
  assert.equal(r.best, 0.4);
});

test("A4/E12 a last-resort non-fitting candidate is tier E, below every fitting tier", () => {
  const r = runLadder([
    cand({ key: "resort-cheap", fits: false, lastResort: true, deviation: null, priceCents: 10_000, productSlug: "p-a" }),
    cand({ key: "resort-dear", fits: false, lastResort: true, deviation: null, priceCents: 40_000, productSlug: "p-b" }),
    cand({ key: "nofit", fits: false, lastResort: false, deviation: 0, priceCents: 5_000, productSlug: "p-c" }),
  ]);
  // Fit is hard: a non-fitting candidate the caller did not promote is excluded.
  assert.equal(byKey(r, "nofit").tier, "excluded");
  assert.equal(byKey(r, "nofit").rank, null);
  assert.equal(byKey(r, "resort-cheap").tier, "does_not_fit");
  assert.equal(r.competingTier, "does_not_fit");
  assert.equal(r.selectedKey, "resort-cheap");
  // A candidate that fits beats the last resort however dear it is.
  const withFit = runLadder([
    cand({ key: "resort", fits: false, lastResort: true, deviation: 0, priceCents: 10_000, productSlug: "p-a" }),
    cand({ key: "fits", deviation: 3.0, priceCents: 500_000, productSlug: "p-b" }),
  ]);
  assert.equal(withFit.selectedKey, "fits");
  // …and a non-fitting candidate never anchors the band for those that do fit.
  assert.equal(withFit.best, 3.0);
});

// ── Unpriceable candidates (A6, AC-52, E9, AD2, AD3) ────────────────────────

test("AC-52 a $0 / negative / unpriced candidate never wins, and sorts last among equals", () => {
  // TWO HALVES, and only the second moved (spec A18).
  //
  // NEVER SELECTED — unconditional, whatever the ordering does. A rate-card gap
  // computing $0 must never become "the cheapest product".
  //
  // SORTS LAST — now qualified: among candidates the REQUIREMENT cannot
  // separate. Where deviation does separate them, deviation leads and the
  // unpriceable candidate can sort above a priced one (see A18 above). Here the
  // deviations are equal, so priceability is the first thing left to decide, and
  // the gap goes to the back exactly as it always did.
  for (const bad of [0, -100, null]) {
    const r = runLadder([
      cand({ key: "gap", deviation: 0, priceCents: bad, productSlug: "p-a" }),
      cand({ key: "real", deviation: 0, priceCents: 150_000, productSlug: "p-b" }),
    ]);
    assert.equal(r.selectedKey, "real", `priceCents ${bad} must not win`);
    assert.equal(byKey(r, "gap").competing, false);
    assert.equal(byKey(r, "gap").tier, "meets");
    assert.deepEqual(keysInOrder(r), ["real", "gap"], "equal deviation ⇒ the gap sorts last");
  }

  // And equal deviation INSIDE tier C behaves the same way — the qualification
  // is about what deviation can separate, not about which tier you are in.
  const tierC = runLadder([
    cand({ key: "anchor", deviation: 0.10, priceCents: 10_000, productSlug: "p-a" }),
    cand({ key: "gap", deviation: 0.60, priceCents: null, productSlug: "p-b" }),
    cand({ key: "real", deviation: 0.60, priceCents: 200_000, productSlug: "p-c" }),
  ]);
  assert.equal(byKey(tierC, "gap").tier, "misses");
  assert.deepEqual(keysInOrder(tierC), ["anchor", "real", "gap"]);
  assert.equal(tierC.selectedKey, "anchor");
});

test("E9 when nothing anywhere is priceable, nothing is selected", () => {
  const r = runLadder([
    cand({ key: "a", deviation: 0, priceCents: null, productSlug: "p-a" }),
    cand({ key: "b", deviation: 0.3, priceCents: 0, productSlug: "p-b" }),
  ]);
  assert.equal(r.selectedKey, null);
  assert.equal(r.competingTier, null);
  // Still tiered and ranked, so the reviewer sees what the catalogue offered.
  assert.equal(byKey(r, "a").tier, "meets");
  assert.equal(byKey(r, "a").rank, 1);
});

test("AD2 the competing tier skips a tier holding only unpriceable candidates", () => {
  const r = runLadder([
    cand({ key: "meets-unpriced", deviation: 0, priceCents: null, productSlug: "p-a" }),
    cand({ key: "misses-priced", deviation: 0.90, priceCents: 80_000, productSlug: "p-b" }),
    cand({ key: "band-priced", deviation: 0.85, priceCents: 95_000, productSlug: "p-c" }),
  ]);
  assert.equal(byKey(r, "meets-unpriced").tier, "meets");
  assert.equal(byKey(r, "meets-unpriced").competing, false);
  // Tier `meets` is skipped entirely: it holds nothing anyone could buy. The
  // unpriced candidate still anchors the band at 0, so both priced candidates
  // land in `misses`, where the smaller deviation leads.
  assert.equal(r.competingTier, "misses");
  assert.equal(r.selectedKey, "band-priced");
  assert.equal(byKey(r, "misses-priced").competing, true);
});

test("AD3 an unpriceable candidate still anchors the tolerance band", () => {
  // A rate-card gap must not move a THERMAL judgement.
  const r = runLadder([
    cand({ key: "anchor", deviation: 0.10, priceCents: null, productSlug: "p-a" }),
    cand({ key: "inband", deviation: 0.14, priceCents: 90_000, productSlug: "p-b" }),
    cand({ key: "outband", deviation: 0.30, priceCents: 10_000, productSlug: "p-c" }),
  ]);
  assert.equal(r.best, 0.10);
  assert.equal(byKey(r, "inband").tier, "within_tolerance");
  assert.equal(byKey(r, "outband").tier, "misses");
  assert.equal(r.selectedKey, "inband");
});

// ── Determinism and the total order (AC-5, E10, E11) ────────────────────────

test("AC-5/E10 the order is total, deterministic and input-order independent", () => {
  const make = () => [
    cand({ key: "a", deviation: 0, priceCents: 90_000, productSlug: "p-b", variantId: "v2" }),
    cand({ key: "b", deviation: 0, priceCents: 90_000, productSlug: "p-a", variantId: "v1" }),
    cand({ key: "c", deviation: 0, priceCents: 90_000, productSlug: "p-a", variantId: "v2" }),
    cand({ key: "d", deviation: 0, priceCents: 90_000, productSlug: "p-b", variantId: null }),
  ];
  const forward = runLadder(make());
  const reversed = runLadder(make().reverse());
  assert.deepEqual(keysInOrder(forward), keysInOrder(reversed));
  // Identical on tier, price and deviation ⇒ slug asc, then variantId asc with
  // null sorting first.
  assert.deepEqual(keysInOrder(forward), ["b", "c", "d", "a"]);
  assert.equal(forward.selectedKey, "b");
  // A splitKey breaks a tie two identical single-unit facts cannot.
  const splits = runLadder([
    cand({ key: "s2", deviation: 0, priceCents: 1_000, productSlug: "p-a", variantId: "v", splitKey: "sys-b|g" }),
    cand({ key: "s1", deviation: 0, priceCents: 1_000, productSlug: "p-a", variantId: "v", splitKey: "sys-a|g" }),
  ]);
  assert.deepEqual(keysInOrder(splits), ["s1", "s2"]);
});

test("E11 quantity scales every candidate equally and cannot reorder", () => {
  const base = () => [
    cand({ key: "a", deviation: 0, priceCents: 90_000, productSlug: "p-a" }),
    cand({ key: "b", deviation: 0, priceCents: 110_000, productSlug: "p-b" }),
    cand({ key: "c", deviation: 0.2, priceCents: 40_000, productSlug: "p-c" }),
  ];
  const one = runLadder(base());
  const seven = runLadder(base().map((c) => ({ ...c, priceCents: c.priceCents * 7 })));
  assert.deepEqual(keysInOrder(one), keysInOrder(seven));
  assert.equal(seven.selectedKey, "a");
});

// ── The negative criteria this redesign exists to kill (§5.8) ───────────────

test("AC-43/AC-51 geometry cannot be expressed, so a dearer 'better fit' cannot win", () => {
  // A rated 400–1000 mm at an opening of 900 mm (its edge) against B rated
  // 800–1200 mm (its centre): the old geometryScore preferred B. Fit is a
  // boolean here, so the cheaper candidate simply wins.
  const r = runLadder([
    cand({ key: "cheap-edge", deviation: 0, priceCents: 90_000, productSlug: "p-a" }),
    cand({ key: "dear-centred", deviation: 0, priceCents: 110_000, productSlug: "p-b" }),
  ]);
  assert.equal(r.selectedKey, "cheap-edge");
  assert.equal(byKey(r, "cheap-edge").rank, 1);
  // The comparator's whole vocabulary: no geometry, no certification, no data
  // completeness — there is no field to set, so no curve to tune.
  assert.deepEqual(
    Object.keys(cand()).filter((k) => /geometr|centre|center|certif|dataSource|complete|score|weight|affinity|technolog/i.test(k)),
    [],
  );
});

test("AC-44 a product missing the band never beats one meeting it on price alone", () => {
  const r = runLadder([
    cand({ key: "A", deviation: 0, priceCents: 120_000, productSlug: "p-a" }),
    cand({ key: "B", deviation: 0.15, priceCents: 70_000, productSlug: "p-b" }),
  ]);
  assert.equal(r.selectedKey, "A");
  assert.equal(byKey(r, "B").tier, "misses");
  assert.equal(byKey(r, "B").competing, false);
  // B is $500 cheaper than the pick and still loses. That is the whole point.
  assert.equal(byKey(r, "B").rank, 2);
});

test("AC-45/AC-47 an IRRELEVANT third candidate moves neither the band nor the pick", () => {
  // AC-45: a dearer candidate that also meets.
  const two = () => [
    cand({ key: "A", deviation: 0, priceCents: 90_000, productSlug: "p-a" }),
    cand({ key: "B", deviation: 0, priceCents: 110_000, productSlug: "p-b" }),
  ];
  const pair = runLadder(two());
  const trio = runLadder([...two(), cand({ key: "C", deviation: 0, priceCents: 400_000, productSlug: "p-c" })]);
  assert.equal(pair.selectedKey, "A");
  assert.equal(trio.selectedKey, "A");
  assert.deepEqual(keysInOrder(trio).slice(0, 2), keysInOrder(pair));

  // AC-47: none meets, and the newcomer's deviation is WORSE than the anchor.
  const band = () => [
    cand({ key: "A", deviation: 0.20, priceCents: 150_000, productSlug: "p-a" }),
    cand({ key: "B", deviation: 0.24, priceCents: 90_000, productSlug: "p-b" }),
  ];
  const before = runLadder(band());
  const after = runLadder([...band(), cand({ key: "C", deviation: 0.90, priceCents: 10_000, productSlug: "p-c" })]);
  assert.equal(before.best, after.best);
  assert.equal(before.selectedKey, "B");
  assert.equal(after.selectedKey, "B");
  assert.equal(byKey(after, "A").competing, true);
  assert.equal(byKey(after, "C").competing, false);
});

test("AC-48 a BETTER new candidate tightens the band, and that is intended", () => {
  const after = runLadder([
    cand({ key: "A", deviation: 0.20, priceCents: 150_000, productSlug: "p-a" }),
    cand({ key: "B", deviation: 0.24, priceCents: 90_000, productSlug: "p-b" }),
    cand({ key: "C", deviation: 0.10, priceCents: 300_000, productSlug: "p-c" }),
  ]);
  // C proves the requirement is more nearly achievable, so the band is now
  // ≤ 0.15 and both larger misses become demonstrably worse than necessary.
  assert.equal(after.best, 0.10);
  assert.equal(byKey(after, "C").tier, "within_tolerance");
  assert.equal(byKey(after, "A").competing, false);
  assert.equal(byKey(after, "B").competing, false);
  assert.equal(after.selectedKey, "C");
});

test("AC-46 compareCandidates is PAIRWISE — a third candidate is not a parameter", () => {
  assert.equal(compareCandidates.length, 2);
  const facts = () => [
    cand({ key: "A", deviation: 0.20, priceCents: 90_000, productSlug: "p-a" }),
    cand({ key: "B", deviation: 0.90, priceCents: 40_000, productSlug: "p-b" }),
  ];
  const [a, b] = assignTiers(facts());
  const sign = Math.sign(compareCandidates(a, b));
  // Add a third candidate, and reprice it as extremely as you like: A and B's
  // stamped facts are all the comparator can see, and it returns the same answer.
  const bigger = assignTiers([...facts(), cand({ key: "C", deviation: 0.95, priceCents: 1, productSlug: "p-c" })]);
  const a2 = bigger.find((c) => c.key === "A"), b2 = bigger.find((c) => c.key === "B");
  assert.equal(Math.sign(compareCandidates(a2, b2)), sign);
  assert.equal(Math.sign(compareCandidates(a, b)), sign);
  // …and it is antisymmetric, which a normalised score is not obliged to be.
  assert.equal(Math.sign(compareCandidates(b, a)), -sign);
});

test("AC-49 the comparator cannot see certified vs estimated at any position", () => {
  const c = cand();
  assert.ok(!("dataSource" in c));
  assert.ok(!("certified" in c));
});

// ── The stamped constants and the tier vocabulary ───────────────────────────

test("AC-4 REQUIREMENT_TOLERANCE is 0.05 and the model names itself", () => {
  assert.equal(REQUIREMENT_TOLERANCE, 0.05);
  assert.equal(SELECTION_VERSION, "ladder-v1");
  // It is a parameter, not a hard-coded edge: a run can be replayed at the
  // tolerance it was decided under.
  const strict = runLadder([
    cand({ key: "anchor", deviation: 0.10, priceCents: 200_000, productSlug: "p-a" }),
    cand({ key: "edge", deviation: 0.14, priceCents: 50_000, productSlug: "p-b" }),
  ], 0);
  assert.equal(byKey(strict, "edge").tier, "misses");
  assert.equal(strict.selectedKey, "anchor");
});

test("TIER_ORDER runs meets → excluded and tierRank agrees with it", () => {
  assert.deepEqual([...TIER_ORDER], [
    "meets", "within_tolerance", "misses", "thermal_unknown", "does_not_fit", "excluded",
  ]);
  for (let i = 1; i < TIER_ORDER.length; i++) {
    assert.ok(tierRank(TIER_ORDER[i - 1]) < tierRank(TIER_ORDER[i]));
  }
});

test("A18 within a tier, DEVIATION is compared before priceability", () => {
  // Owner ruling at acceptance, reversing AD18 and restoring design §4.2's
  // numbered sequence. The reviewer's losing-candidate list should lead with
  // "this is the closest thermal answer, and we cannot price it at this size" —
  // which is a more useful thing to see first than last.
  //
  // The anchor is unpriceable too, so tier B holds nothing anyone could buy and
  // the competing tier falls through to C (AD2). That puts the sharpest version
  // of the question on the table: an unpriceable candidate now sorts ABOVE the
  // one that gets selected, in the very tier the selection comes from.
  const r = runLadder([
    cand({ key: "anchor", deviation: 0.10, priceCents: null, productSlug: "p-a" }),
    cand({ key: "closest-unpriced", deviation: 0.30, priceCents: null, productSlug: "p-b" }),
    cand({ key: "worse-priced", deviation: 0.50, priceCents: 90_000, productSlug: "p-c" }),
  ]);

  assert.equal(r.best, 0.10, "an unpriceable candidate still anchors the band (AD3)");
  assert.equal(byKey(r, "anchor").tier, "within_tolerance");
  assert.equal(byKey(r, "closest-unpriced").tier, "misses");
  assert.equal(byKey(r, "worse-priced").tier, "misses");

  // THE ORDER CHANGES: the closest thermal match leads its tier even though
  // nobody can price it. Under the old sequence the priced 0.50 came first.
  assert.deepEqual(keysInOrder(r), ["anchor", "closest-unpriced", "worse-priced"]);
  assert.equal(byKey(r, "closest-unpriced").rank, 2);
  assert.equal(byKey(r, "worse-priced").rank, 3);

  // THE WINNER DOES NOT. Selection is guarded by `competing`, which is only ever
  // set on a PRICEABLE member of the competing tier — so sort position cannot
  // promote a candidate nobody can buy, however high it now appears.
  assert.equal(r.competingTier, "misses");
  assert.equal(r.selectedKey, "worse-priced");
  assert.equal(byKey(r, "closest-unpriced").competing, false);
  assert.equal(byKey(r, "closest-unpriced").selected, false);
  assert.equal(byKey(r, "anchor").competing, false, "a whole tier of rate-card gaps is skipped");
});
