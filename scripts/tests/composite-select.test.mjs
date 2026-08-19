// Selecting a composite — the frame system is chosen for the OPENING, and the
// units come out of it.
//
// The failure this replaces is in the first test and is worth stating plainly:
// asked on its own merits, a segment picks the cheapest lite in the catalogue,
// because every fixed product shares one dimension rule and so geometry cannot
// discriminate between them. That is the right answer to the segment and the
// wrong answer to the opening — the lite has to couple with the sash beside it.
//
// Every test below drives the REAL engine (selectForOpening, the rules, the
// ranker, the composite scorer) over a fixture catalogue. Prices are set per
// product so the commercial term is a real force and not a formality: in most of
// these the compatible answer is the DEARER one, which is the whole point.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("composite-select");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export { selectForComposite } from ${p("worker/lib/estimator/compositeSelect.ts")};
      export { selectForOpening } from ${p("worker/lib/estimator/select.ts")};
      export { makeUpDeviation } from ${p("worker/lib/estimator/compositeRank.ts")};
      export { resolvedRequirement } from ${p("worker/lib/estimator/rules.ts")};
      export { alternateCategoryFor } from ${p("worker/lib/estimator/estimate.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { selectForComposite, selectForOpening, makeUpDeviation, resolvedRequirement, alternateCategoryFor } =
  await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
test.after(async () => { if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir); });

// ── Fixture ──────────────────────────────────────────────────────────────────

const glass = (slug, uValue, shgc, over = {}) => ({
  variantId: slug, glazingOptionSlug: slug, glazingClass: slug.startsWith("dg") ? "double_clear" : "single_clear",
  uValue, shgc, frameType: "aluminium", frameTechnology: "conventional",
  certificationRef: "WERS-1", pricingOptionSlugs: [], dataSource: "certified",
  certified: true, published: true, ...over,
});
const DG = glass("dg", 2.0, 0.45);
const SG = glass("sg", 5.0, 0.60);

const product = (slug, { system, operation, category = "windows", glasses = [DG, SG], tech = "conventional" }) => ({
  sanityProductId: `id-${slug}`, catalogueRevision: "rev1", schemaVersion: 1,
  name: slug, slug, family: category, series: `${operation}-${category}`,
  configuration: { operationTypes: [operation] },
  frameSystem: system ? { slug: system, name: system, compatibleWith: [] } : null,
  dimensionRule: { minWidthMm: 300, maxWidthMm: 3000, minHeightMm: 300, maxHeightMm: 3000, maxAreaM2: null, maxAspectRatio: null, ruleVersion: "v1" },
  performanceVariants: glasses.map((g) => ({ ...g, frameTechnology: tech })),
  optionGroups: [], pricingRef: slug,
});

/** A repository over a flat product list, filtered exactly as the live one is. */
const makeRepo = (products) => ({
  async queryCandidates(category, operation) {
    return products.filter((c) => (!category || c.family === category) && (!operation || c.configuration.operationTypes.includes(operation)));
  },
  catalogueVersion() { return "cat-v1"; },
});

/** Price per (product, glass). The commercial term is 0.15 of the score, so these
 *  gaps are wide enough to decide a tie and never wide enough to beat compliance. */
const makePrice = (table) => async (candidate, _opening, variant) => {
  const key = `${candidate.slug}:${variant?.variantId ?? "none"}`;
  const total = table[key] ?? table[candidate.slug] ?? 1000;
  return { ok: true, unit: total, total, depositAmount: total / 2, currency: "AUD", rateCardId: "r", rateCardVersion: "v1", pricingPolicyVersion: "v1", depositPercent: 50, discountPercent: 0 };
};

const unit = (operation, widthMm, over = {}) => {
  // `opening` is pulled out first: spreading `over` wholesale would overwrite the
  // built opening with the caller's PARTIAL one and silently drop the operation,
  // which is the field every one of these tests turns on.
  const { opening: openingOver, ...rest } = over;
  return {
    opening: { family: "windows", operationType: operation, widthMm, heightMm: 2100, qty: 1, ...(openingOver ?? {}) },
    // Exactly what materialiseSplits supplies for a window opening — null, not
    // "doors". The fixture mirrors the production wiring rather than inventing a
    // looser one, because that is what the regressions below turn on.
    primaryCategory: "windows", alternateCategory: alternateCategoryFor("windows"),
    widthMm, heightMm: 2100, ownBand: false, ...rest,
  };
};

const slugsOf = (r) => r.units.map((u) => u.result.selected?.candidate.slug ?? null);

// ── The case this exists for ─────────────────────────────────────────────────

test("THE FIX: the cheapest lite in the catalogue is refused because it does not couple", async () => {
  const products = [
    product("sys80-awning", { system: "sys-80", operation: "awning" }),
    product("sys80-fixed", { system: "sys-80", operation: "fixed" }),
    product("sys100-awning", { system: "sys-100", operation: "awning" }),
    product("sys100-fixed", { system: "sys-100", operation: "fixed" }),
    // The trap: a fixed-only system whose lite undercuts every other by half.
    product("sys65-fixed", { system: "sys-65", operation: "fixed" }),
  ];
  const repo = makeRepo(products);
  const priceFn = makePrice({ "sys80-awning": 500, "sys80-fixed": 500, "sys100-awning": 700, "sys100-fixed": 700, "sys65-fixed": 250 });

  // BEFORE: asked on its own merits, the segment takes the cheap orphan lite.
  const alone = await selectForOpening({ family: "windows", operationType: "fixed", widthMm: 2000, heightMm: 2100 }, repo, priceFn);
  assert.equal(alone.selected.candidate.slug, "sys65-fixed", "the old behaviour, still reproducible");

  // AFTER: the lite is chosen as part of the opening, so it comes from the
  // opening's system — and sys-65 cannot supply the awnings, so it never wins.
  const composite = await selectForComposite(
    { family: "windows", operationType: "awning", widthMm: 3200, heightMm: 2100 },
    [unit("awning", 600), unit("fixed", 2000), unit("awning", 600)],
    repo, priceFn,
  );
  assert.equal(composite.system, "sys-80");
  assert.deepEqual(slugsOf(composite), ["sys80-awning", "sys80-fixed", "sys80-awning"]);
  assert.ok(!slugsOf(composite).includes("sys65-fixed"), "the orphan lite is gone");
  assert.equal(composite.mixedSystems, false);
  assert.equal(composite.note, null, "a clean same-system make-up needs no warning");
});

test("a DEARER system wins when it is the only one that supplies every unit", async () => {
  const products = [
    product("sys80-awning", { system: "sys-80", operation: "awning" }),   // no sys-80 lite
    product("sys100-awning", { system: "sys-100", operation: "awning" }),
    product("sys100-fixed", { system: "sys-100", operation: "fixed" }),
  ];
  const priceFn = makePrice({ "sys80-awning": 400, "sys100-awning": 900, "sys100-fixed": 900 });
  const r = await selectForComposite(
    { family: "windows", operationType: "awning", widthMm: 3200, heightMm: 2100 },
    [unit("awning", 600), unit("fixed", 2000), unit("awning", 600)],
    makeRepo(products), priceFn,
  );
  assert.equal(r.system, "sys-100");
  assert.deepEqual(slugsOf(r), ["sys100-awning", "sys100-fixed", "sys100-awning"]);
});

test("a DEARER system wins when the composite's averaged thermal meets the band and the cheap one misses", async () => {
  const LOWE = glass("lowe", 1.4, 0.42);
  const products = [
    product("sys80-awning", { system: "sys-80", operation: "awning", glasses: [SG] }),
    product("sys80-fixed", { system: "sys-80", operation: "fixed", glasses: [SG] }),
    product("sys100-awning", { system: "sys-100", operation: "awning", glasses: [LOWE] }),
    product("sys100-fixed", { system: "sys-100", operation: "fixed", glasses: [LOWE] }),
  ];
  const priceFn = makePrice({ "sys80-awning": 300, "sys80-fixed": 300, "sys100-awning": 1200, "sys100-fixed": 1200 });
  const r = await selectForComposite(
    { family: "windows", operationType: "awning", widthMm: 3200, heightMm: 2100, requirements: { maxUValue: 1.6 } },
    [unit("awning", 600, { opening: { requirements: { maxUValue: 1.6 } } }),
      unit("fixed", 2000, { opening: { requirements: { maxUValue: 1.6 } } }),
      unit("awning", 600, { opening: { requirements: { maxUValue: 1.6 } } })],
    makeRepo(products), priceFn,
  );
  assert.equal(r.system, "sys-100", "compliance at 0.35 outweighs a 4× price gap at 0.15");
});

// ── Never eliminate ──────────────────────────────────────────────────────────

test("an UNTAGGED catalogue behaves exactly as it did before, and says so", async () => {
  const products = [
    product("awn-a", { system: null, operation: "awning" }),
    product("fix-a", { system: null, operation: "fixed" }),
  ];
  const r = await selectForComposite(
    { family: "windows", operationType: "awning", widthMm: 3200, heightMm: 2100 },
    [unit("awning", 600), unit("fixed", 2000), unit("awning", 600)],
    makeRepo(products), makePrice({}),
  );
  assert.equal(r.system, null);
  assert.equal(r.mixedSystems, true);
  assert.ok(r.note?.includes("independently"), "the reviewer is told, rather than left to notice");
  assert.deepEqual(slugsOf(r), ["awn-a", "fix-a", "awn-a"], "EVERY unit still gets a product");
});

test("no covering system raises the reserved `composite` warning and downgrades ready to indicative", async () => {
  // sys-80 makes the awning, sys-65 makes the lite, and neither names the other.
  const products = [
    product("sys80-awning", { system: "sys-80", operation: "awning" }),
    product("sys65-fixed", { system: "sys-65", operation: "fixed" }),
  ];
  const r = await selectForComposite(
    { family: "windows", operationType: "awning", widthMm: 3200, heightMm: 2100 },
    [unit("awning", 600), unit("fixed", 2000), unit("awning", 600)],
    makeRepo(products), makePrice({}),
  );
  assert.equal(r.system, null);
  assert.equal(r.mixedSystems, true);
  for (const u of r.units) {
    assert.ok(u.result.selected, "never an empty unit");
    const composite = u.result.selected.outcome.filters.filter((f) => f.filter === "composite");
    assert.equal(composite.length, 1);
    assert.equal(composite[0].severity, "warning", "a warning, never a reject — an eliminated candidate is an empty line");
    assert.notEqual(u.result.selected.outcome.status, "ready");
  }
});

test("an authored edge lets a system reach the unit it cannot make itself", async () => {
  const withEdge = (slug, opts) => {
    const prod = product(slug, opts);
    prod.frameSystem.compatibleWith = [{ slug: "sys-65", severity: "allowed" }];
    return prod;
  };
  const products = [
    withEdge("sys80-awning", { system: "sys-80", operation: "awning" }),
    product("sys65-fixed", { system: "sys-65", operation: "fixed" }),
  ];
  const r = await selectForComposite(
    { family: "windows", operationType: "awning", widthMm: 3200, heightMm: 2100 },
    [unit("awning", 600), unit("fixed", 2000), unit("awning", 600)],
    makeRepo(products), makePrice({}),
  );
  assert.equal(r.system, "sys-80", "the opening's system, reaching its partner for the lite");
  assert.equal(r.mixedSystems, false);
  assert.deepEqual(slugsOf(r), ["sys80-awning", "sys65-fixed", "sys80-awning"]);
});

// ── One glass across the composite ───────────────────────────────────────────

test("the units are unified onto ONE glass even when each would pick its own", async () => {
  const products = [
    product("sys80-awning", { system: "sys-80", operation: "awning" }),
    product("sys80-fixed", { system: "sys-80", operation: "fixed" }),
  ];
  // Left to themselves the awnings take DG (400 each) and the big lite takes SG
  // (400). That mixed make-up is the cheapest thing on offer at 1200 — and it is
  // not offered, because a composite carries one glass.
  const priceFn = makePrice({
    "sys80-awning:dg": 400, "sys80-awning:sg": 900,
    "sys80-fixed:dg": 900, "sys80-fixed:sg": 400,
  });
  const r = await selectForComposite(
    { family: "windows", operationType: "awning", widthMm: 3200, heightMm: 2100 },
    [unit("awning", 600), unit("fixed", 2000), unit("awning", 600)],
    makeRepo(products), priceFn,
  );
  assert.equal(r.glazingSlugs.length, 1, `one glass across the opening, got ${r.glazingSlugs.join(", ")}`);
  // WHICH glass is decided by the WHOLE make-up, not by the largest unit: all-DG
  // costs 400+900+400 = 1700, all-SG costs 900+400+900 = 2200. Area only orders
  // which glasses get a hearing; the composite's own total picks between them.
  assert.equal(r.glazingSlugs[0], "dg");
  assert.deepEqual(r.units.map((u) => u.result.selected.selectedVariant.variantId), ["dg", "dg", "dg"]);
});

test("a report's per-unit band outranks the one-glass preference", async () => {
  const LOWE = glass("lowe", 1.2, 0.40);
  const products = [
    product("sys80-awning", { system: "sys-80", operation: "awning", glasses: [DG, SG, LOWE] }),
    product("sys80-fixed", { system: "sys-80", operation: "fixed", glasses: [DG, SG, LOWE] }),
  ];
  const priceFn = makePrice({ "sys80-awning": 500, "sys80-fixed": 500 });
  const r = await selectForComposite(
    { family: "windows", operationType: "awning", widthMm: 3200, heightMm: 2100 },
    [
      // The engineer stated a tight band for the awnings and a loose one for the lite.
      unit("awning", 600, { ownBand: true, opening: { requirements: { maxUValue: 1.3 } } }),
      unit("fixed", 2000, { ownBand: true, opening: { requirements: { maxUValue: 5.5 } } }),
      unit("awning", 600, { ownBand: true, opening: { requirements: { maxUValue: 1.3 } } }),
    ],
    makeRepo(products), priceFn,
  );
  const glasses = r.units.map((u) => u.result.selected.selectedVariant.variantId);
  assert.equal(glasses[0], "lowe", "the awning meets the band an engineer set for it");
  assert.equal(glasses[2], "lowe");
  // glazingSlugs reports only the units ASKED to share a glass. Every unit here
  // carries a stated band, so none was, and there is nothing to report — the
  // absence is the point, not an omission.
  assert.deepEqual(r.glazingSlugs, [], "unification is not forced over a stated band");
  assert.ok(!r.note?.includes("same glass"));
});

test("a make-up whose frames share no glass is built anyway, and reported", async () => {
  const products = [
    product("sys80-awning", { system: "sys-80", operation: "awning", glasses: [DG] }),
    product("sys80-fixed", { system: "sys-80", operation: "fixed", glasses: [SG] }),
  ];
  const r = await selectForComposite(
    { family: "windows", operationType: "awning", widthMm: 3200, heightMm: 2100 },
    [unit("awning", 600), unit("fixed", 2000), unit("awning", 600)],
    makeRepo(products), makePrice({}),
  );
  assert.equal(r.system, "sys-80", "still one system — the glass could not follow");
  assert.deepEqual([...r.glazingSlugs].sort(), ["dg", "sg"]);
  assert.ok(r.note?.includes("same glass"), "the disagreement is stated, not hidden");
});

// ── Crossing the window/door boundary ────────────────────────────────────────

test("a DOOR composite takes a fixed WINDOW lite from its own system — the bug this repairs", async () => {
  const products = [
    product("sys80-slider", { system: "sys-80", operation: "sliding", category: "doors" }),
    product("sys80-fixed", { system: "sys-80", operation: "fixed", category: "windows" }),
  ];
  const doorUnit = (operation, widthMm) => ({
    opening: { family: "doors", operationType: operation, widthMm, heightMm: 2400, qty: 1 },
    primaryCategory: "doors", alternateCategory: alternateCategoryFor("doors"),
    widthMm, heightMm: 2400, ownBand: false,
  });
  const r = await selectForComposite(
    { family: "doors", operationType: "sliding", widthMm: 4000, heightMm: 2400 },
    [doorUnit("sliding", 2000), doorUnit("fixed", 2000)],
    makeRepo(products), makePrice({}),
  );
  assert.equal(r.system, "sys-80");
  assert.deepEqual(slugsOf(r), ["sys80-slider", "sys80-fixed"]);
  assert.equal(r.units[0].crossedToCategory, null, "the door stays in its own category");
  assert.equal(r.units[1].crossedToCategory, "windows");
  assert.ok(r.note?.includes("window"), "crossing is reported for review, never silent");
});

test("a WINDOW composite never pulls in a door", async () => {
  const products = [
    product("sys80-slide-window", { system: "sys-80", operation: "sliding", category: "windows" }),
    product("sys80-slide-door", { system: "sys-80", operation: "sliding", category: "doors" }),
  ];
  const r = await selectForComposite(
    { family: "windows", operationType: "sliding", widthMm: 4000, heightMm: 2100 },
    [unit("sliding", 2000), unit("sliding", 2000)],
    makeRepo(products), makePrice({ "sys80-slide-window": 900, "sys80-slide-door": 100 }),
  );
  // The door is cheaper by 9×, and it is still not a window.
  assert.deepEqual(slugsOf(r), ["sys80-slide-window", "sys80-slide-window"]);
  assert.ok(r.units.every((u) => u.crossedToCategory === null));
});

// REGRESSION. The crossing shipped SYMMETRIC and this is what it did: exactly
// one product in the live catalogue is a sliding WINDOW, so every door system
// reported exact coverage of a sliding-window opening, out-scored it on thermal
// (a thermally-broken door meets a band a conventional window misses), and the
// line was built as two sliding DOORS on the door rate card. The test above did
// not catch it because ITS sys-80 also makes a sliding window, so "own first"
// kept the unit at home. Here no system makes one.
test("REGRESSION: no window opening is ever built from doors, however much better they score", async () => {
  // The rule lives in the derivation, because the selector honestly crosses in
  // whichever direction it is handed. Guard the derivation first.
  assert.equal(alternateCategoryFor("windows"), null, "a window opening may not reach into doors");
  assert.equal(alternateCategoryFor("doors"), "windows", "a door opening may reach a window lite");
  assert.equal(alternateCategoryFor(null), null);

  const LOWE = glass("lowe", 1.4, 0.42);
  const products = [
    // The only sliding window: conventional, single-glazed, cheap.
    product("sys80-slide-window", { system: "sys-80", operation: "sliding", category: "windows", glasses: [SG] }),
    // Every sliding DOOR: thermally broken, meets the band, and dearer.
    product("sys100-slide-door", { system: "sys-100", operation: "sliding", category: "doors", glasses: [LOWE] }),
    product("sys150-slide-door", { system: "sys-150", operation: "sliding", category: "doors", glasses: [LOWE] }),
  ];
  const priceFn = makePrice({ "sys80-slide-window": 400, "sys100-slide-door": 2500, "sys150-slide-door": 2500 });
  const band = { requirements: { maxUValue: 2.7 } };
  const r = await selectForComposite(
    { family: "windows", operationType: "sliding", widthMm: 3600, heightMm: 2100, ...band },
    [unit("sliding", 1800, { opening: band }), unit("sliding", 1800, { opening: band })],
    makeRepo(products), priceFn,
  );
  assert.deepEqual(slugsOf(r), ["sys80-slide-window", "sys80-slide-window"]);
  assert.ok(r.units.every((u) => u.crossedToCategory === null), "no unit crossed into doors");
});

test("a door composite still crosses to a window lite — the one direction that is allowed", async () => {
  const products = [
    product("sys80-slider", { system: "sys-80", operation: "sliding", category: "doors" }),
    product("sys80-fixed", { system: "sys-80", operation: "fixed", category: "windows" }),
  ];
  const doorUnit = (operation, widthMm) => ({
    opening: { family: "doors", operationType: operation, widthMm, heightMm: 2400, qty: 1 },
    // As estimate.ts supplies it: doors may cross, windows may not.
    primaryCategory: "doors", alternateCategory: alternateCategoryFor("doors"),
    widthMm, heightMm: 2400, ownBand: false,
  });
  const r = await selectForComposite(
    { family: "doors", operationType: "sliding", widthMm: 4000, heightMm: 2400 },
    [doorUnit("sliding", 2000), doorUnit("fixed", 2000)],
    makeRepo(products), makePrice({}),
  );
  assert.deepEqual(slugsOf(r), ["sys80-slider", "sys80-fixed"]);
  assert.equal(r.units[1].crossedToCategory, "windows");
});

// REGRESSION. sourceFor handed the WHOLE partner set to every unit, and
// coveringSystems only ever tested hub-to-supplier. So a hub naming two
// partners let those two partners — which say nothing about each other — land
// in one opening, reported as a clean single-system make-up.
test("REGRESSION: two partners of one hub cannot meet in an opening unless they name each other", async () => {
  const withEdges = (slug, opts, edges) => {
    const prod = product(slug, opts);
    prod.frameSystem.compatibleWith = edges;
    return prod;
  };
  const hubEdges = [{ slug: "sys-100", severity: "allowed" }, { slug: "sys-150", severity: "allowed" }];
  const products = [
    // The hub makes nothing this opening needs; both its partners do.
    withEdges("sys125-slider", { system: "sys-125", operation: "sliding" }, hubEdges),
    product("sys100-awning", { system: "sys-100", operation: "awning" }),
    product("sys150-fixed", { system: "sys-150", operation: "fixed" }),
  ];
  const r = await selectForComposite(
    { family: "windows", operationType: "awning", widthMm: 3200, heightMm: 2100 },
    [unit("awning", 600), unit("fixed", 2000), unit("awning", 600)],
    makeRepo(products), makePrice({}),
  );
  // sys-100 beside sys-150 is an unauthored pair; the make-up must not be built
  // and must not be described as single-system.
  assert.equal(r.system, null);
  assert.equal(r.mixedSystems, true);
  assert.ok(r.units.every((u) => u.result.selected), "still never an empty unit");
});

// REGRESSION. Five fixed-lite systems all cover an all-fixed opening exactly and
// equally, so the sort fell through to its slug tiebreak — which exists only for
// reproducibility — and a cap of four permanently excluded sys-80, the largest
// platform in the catalogue, because "8" sorts after "1", "6" and "7".
test("REGRESSION: a system is never dropped by the search bound for sorting late in the alphabet", async () => {
  const lite = (slug, system) => product(slug, { system, operation: "fixed" });
  const products = [
    lite("sys65-fixed", "sys-65"), lite("sys72-fixed", "sys-72"), lite("sys80-fixed", "sys-80"),
    lite("sys100-fixed", "sys-100"), lite("sys150-fixed", "sys-150"),
  ];
  // sys-80 is the cheapest, and it is the one the old cap discarded.
  const priceFn = makePrice({
    "sys80-fixed": 200, "sys65-fixed": 900, "sys72-fixed": 900, "sys100-fixed": 900, "sys150-fixed": 900,
  });
  const r = await selectForComposite(
    { family: "windows", operationType: "fixed", widthMm: 4000, heightMm: 2100 },
    [unit("fixed", 2000), unit("fixed", 2000)],
    makeRepo(products), priceFn,
  );
  assert.equal(r.system, "sys-80");
  assert.deepEqual(slugsOf(r), ["sys80-fixed", "sys80-fixed"]);
});

// REGRESSION. When no glass could be carried across every unit, the system's own
// valid make-up was thrown away and the opening fell to the mixed-systems
// fallback — telling the reviewer the units may not couple, which was false:
// they came from one platform and only the glass disagreed.
test("REGRESSION: a single-system make-up survives every glass trial failing", async () => {
  const products = [
    product("sys80-awning", { system: "sys-80", operation: "awning", glasses: [DG] }),
    product("sys80-fixed", { system: "sys-80", operation: "fixed", glasses: [SG] }),
  ];
  // Each frame is rated for one glass and they are different, so no unification
  // is possible — but the frames are still one system.
  const r = await selectForComposite(
    { family: "windows", operationType: "awning", widthMm: 3200, heightMm: 2100 },
    [unit("awning", 600), unit("fixed", 2000)],
    makeRepo(products), makePrice({}),
  );
  assert.equal(r.system, "sys-80", "one platform, reported as one platform");
  assert.equal(r.mixedSystems, false);
  assert.ok(!r.note?.includes("independently"), "the units DID couple; only the glass differs");
  assert.ok(r.note?.includes("same glass"), "and the glass is what gets reported");
});

// REGRESSION. glazingSlugs counted units deliberately left out of unification,
// so every opening carrying a per-component energy report was warned that no
// single glazing fits — in the one case where differing glass is the instruction.
test("REGRESSION: report-banded units do not trigger the one-glass warning", async () => {
  const LOWE = glass("lowe", 1.2, 0.40);
  const products = [
    product("sys80-awning", { system: "sys-80", operation: "awning", glasses: [DG, SG, LOWE] }),
    product("sys80-fixed", { system: "sys-80", operation: "fixed", glasses: [DG, SG, LOWE] }),
  ];
  const r = await selectForComposite(
    { family: "windows", operationType: "awning", widthMm: 3200, heightMm: 2100 },
    [
      unit("awning", 600, { ownBand: true, opening: { requirements: { maxUValue: 1.3 } } }),
      unit("fixed", 2000, { ownBand: true, opening: { requirements: { maxUValue: 5.5 } } }),
    ],
    makeRepo(products), makePrice({ "sys80-awning": 500, "sys80-fixed": 500 }),
  );
  const glasses = r.units.map((u) => u.result.selected.selectedVariant.variantId);
  assert.notEqual(glasses[0], glasses[1], "the units genuinely carry different glass, as instructed");
  assert.ok(!r.note?.includes("same glass"), `no false glazing warning, got: ${r.note}`);
});

// ── Frame technology: a preference, never a rule ─────────────────────────────

// AD4: `technologyAgreement` — the same-frame-technology preference, folded into
// the configuration weight at a fifth of it — is deleted with the weights. A
// cheapest-wins ladder has no channel a preference can arrive through, and the
// owner's ruling was prefer, never require; D9 names the learned layer as the
// home for contextual preferences like this one. Its test went with it; the test
// below still proves a mixed-technology make-up is offered, which was the half
// of the old behaviour that was actually load-bearing.

test("a mixed-technology make-up is still selectable — prefer, never require", async () => {
  const products = [
    product("sys80-awning", { system: "sys-80", operation: "awning", tech: "thermally_broken" }),
    product("sys80-fixed", { system: "sys-80", operation: "fixed", tech: "conventional" }),
  ];
  const r = await selectForComposite(
    { family: "windows", operationType: "awning", widthMm: 3200, heightMm: 2100 },
    [unit("awning", 600), unit("fixed", 2000), unit("awning", 600)],
    makeRepo(products), makePrice({}),
  );
  assert.equal(r.system, "sys-80");
  assert.deepEqual(slugsOf(r), ["sys80-awning", "sys80-fixed", "sys80-awning"]);
});

// ── The composite is judged as one thing ─────────────────────────────────────

test("AC-20 a make-up's deviation reads the AREA-WEIGHTED cell against the opening's band", () => {
  const cell = (widthMm, uValue) => ({
    opening: {}, candidate: null, variant: { uValue, shgc: 0.5, certified: true, frameTechnology: "conventional", variantId: "v", glazingOptionSlug: "v" },
    widthMm, heightMm: 2100, ownBand: false, total: 0,
  });
  const opening = { requirements: { maxUValue: 2.6 } };
  const req = resolvedRequirement(opening);
  // Two 3.0 sashes and a 2.4 lite average to 2.625 — just outside a 2.6 band.
  const near = makeUpDeviation(opening, [cell(600, 3.0), cell(2000, 2.4), cell(600, 3.0)], req);
  // Widen the lite and the same three frames now sit inside it.
  const inside = makeUpDeviation(opening, [cell(300, 3.0), cell(2600, 2.4), cell(300, 3.0)], req);
  assert.equal(inside.scalar, 0, "an in-band composite deviates by nothing, as an in-band cell does");
  assert.ok(near.scalar > 0 && near.scalar < 0.02, `a near miss is measured, not vetoed: ${near.scalar}`);
  assert.equal(near.worstAxis, "uValue");
  // The whole point of D8: the number is the miss over the requirement, so it is
  // the SAME scale a single unit is tiered on and the same comparator reads it.
  assert.equal(near.scalar, Math.round(((2.625 - 2.6) / 2.6) * 1e6) / 1e6);
  // A2: a unit whose deviation cannot be measured makes the whole make-up
  // unknown — a mean over an absent number is a fiction.
  assert.equal(makeUpDeviation(opening, [cell(600, null), cell(2000, 2.4)], req).scalar, null);
});

test("AC-20 per-unit bands are measured per unit, never averaged into one target", () => {
  const cell = (widthMm, uValue, maxUValue) => ({
    opening: { requirements: { maxUValue } }, candidate: null,
    variant: { uValue, shgc: 0.5, certified: true, frameTechnology: "conventional", variantId: "v", glazingOptionSlug: "v" },
    widthMm, heightMm: 2100, ownBand: true, total: 0,
  });
  // Each unit meets its OWN band. Averaged into one target (2.625 vs 2.6) it
  // would read as a miss — which is exactly the misjudgement being avoided.
  const opening = { requirements: { maxUValue: 2.6 } };
  const d = makeUpDeviation(opening, [cell(600, 3.0, 3.2), cell(2000, 2.4, 2.5), cell(600, 3.0, 3.2)],
    resolvedRequirement(opening));
  assert.equal(d.scalar, 0);
});
