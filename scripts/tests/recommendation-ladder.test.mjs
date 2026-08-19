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
      export { deviationOf, runLadder } from ${p("worker/lib/estimator/ladder.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { deviationOf, runLadder } = await import(pathToFileURL(outfile).href);

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

test("AC-52 a $0 / negative / unpriced candidate never wins and sorts last in its tier", () => {
  for (const bad of [0, -100, null]) {
    const r = runLadder([
      cand({ key: "gap", deviation: 0, priceCents: bad, productSlug: "p-a" }),
      cand({ key: "real", deviation: 0, priceCents: 150_000, productSlug: "p-b" }),
    ]);
    assert.equal(r.selectedKey, "real", `priceCents ${bad} must not win`);
    assert.equal(byKey(r, "gap").competing, false);
    // Same tier, but a rate-card gap sorts behind every priced candidate in it.
    assert.equal(byKey(r, "gap").tier, "meets");
    assert.deepEqual(keysInOrder(r), ["real", "gap"]);
  }
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
