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
      export { technologyAgreement, compositeCompliance } from ${p("worker/lib/estimator/compositeRank.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { selectForComposite, selectForOpening, technologyAgreement, compositeCompliance } =
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
    primaryCategory: "windows", alternateCategory: "doors",
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
  assert.ok(r.glazingSlugs.length >= 1, "unification is not forced over a stated band");
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
    primaryCategory: "doors", alternateCategory: "windows",
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

// ── Frame technology: a preference, never a rule ─────────────────────────────

test("technologyAgreement is the largest share by AREA, not by unit count", () => {
  const u = (widthMm, frameTechnology) => ({ widthMm, heightMm: 2100, variant: { frameTechnology } });
  assert.equal(technologyAgreement([u(600, "conventional"), u(600, "conventional")]), 1);
  // Two small thermally-broken units beside one large conventional one: the
  // conventional frame is most of the opening, so agreement is its share.
  const mixed = technologyAgreement([u(600, "thermally_broken"), u(2000, "conventional"), u(600, "thermally_broken")]);
  assert.ok(Math.abs(mixed - 2000 / 3200) < 1e-9, `${mixed}`);
  assert.equal(technologyAgreement([u(600, "conventional")]), 1, "one unit always agrees with itself");
});

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

test("compliance reads the AREA-WEIGHTED composite against the opening's band", () => {
  const cell = (widthMm, uValue) => ({
    opening: {}, candidate: null, variant: { uValue, shgc: 0.5, certified: true, frameTechnology: "conventional", variantId: "v", glazingOptionSlug: "v" },
    widthMm, heightMm: 2100, ownBand: false, total: 0,
  });
  const opening = { requirements: { maxUValue: 2.6 } };
  // Two 3.0 sashes and a 2.4 lite average to 2.625 — just outside a 2.6 band.
  const near = compositeCompliance(opening, [cell(600, 3.0), cell(2000, 2.4), cell(600, 3.0)]);
  // Widen the lite and the same three frames now sit inside it.
  const inside = compositeCompliance(opening, [cell(300, 3.0), cell(2600, 2.4), cell(300, 3.0)]);
  assert.equal(inside, 1, "an in-band composite scores a flat 1.0, as an in-band cell does");
  assert.ok(near < 1 && near > 0, `a near miss is graded, not vetoed: ${near}`);
});

test("per-unit bands are graded per unit, never averaged into one target", () => {
  const cell = (widthMm, uValue, maxUValue) => ({
    opening: { requirements: { maxUValue } }, candidate: null,
    variant: { uValue, shgc: 0.5, certified: true, frameTechnology: "conventional", variantId: "v", glazingOptionSlug: "v" },
    widthMm, heightMm: 2100, ownBand: true, total: 0,
  });
  // Each unit meets its OWN band. Averaged into one target (2.625 vs 2.6) it
  // would read as a miss — which is exactly the misjudgement being avoided.
  const score = compositeCompliance({ requirements: { maxUValue: 2.6 } },
    [cell(600, 3.0, 3.2), cell(2000, 2.4, 2.5), cell(600, 3.0, 3.2)]);
  assert.equal(score, 1);
});
