// Schedule parsing + matching unit tests. Pure logic — no PDF, no server: a
// fixture of the extracted schedule text (as unpdf produces it) is fed through
// the same parser + matcher the Worker uses. TS bundled once with esbuild
// (same approach as unit.test.mjs / catalogue.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("schedule");
const outfile = join(runDir, "schedule-bundle.mjs");
await build({
  stdin: {
    contents: `
      export { parseScheduleText } from ${p("src/data/scheduleParse.ts")};
      export { matchSchedule, resolveScheduleType } from ${p("src/data/scheduleMatch.ts")};
      export { getProductBySlug, families } from ${p("src/data/catalogue.ts")};
      export { lineBlocksSubmission, reviewClass } from ${p("src/data/configurator.ts")};
    `,
    resolveDir: projectRoot,
    sourcefile: "schedule-entry.ts",
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { parseScheduleText, matchSchedule, resolveScheduleType, getProductBySlug, families, lineBlocksSubmission, reviewClass } = await import(pathToFileURL(outfile).href);

// Extracted text of the Lot 312 Banjo Boulevard plan (sheet A6), as produced by a
// text-layer extractor. HEIGHT is printed BEFORE WIDTH; item 13 is skipped.
const FIXTURE = `WINDOW SCHEDULE
W N° HEIGHT WIDTH HEAD HT. GLAZING D.GLAZE REQ. WINDOW TYPE COMMENTS
1 2100 2050 2400 CLEAR YES OFFSET AWNING
2 700 3500 1605 CLEAR YES FIXED
3 2100 2100 2300 CLEAR YES AWNING
4 2100 3200 2300 CLEAR YES AWNING 2x 600mm WIDE AWNINGS
5 2057 850 2300 CLEAR YES AWNING
6 2057 850 2300 CLEAR YES AWNING
7 854 1810 2100 CLEAR YES AWNING
8 1543 1450 2100 CLEAR YES FIXED
9 1027 1810 2100 CLEAR YES AWNING
10 1027 1450 2250 CLEAR YES AWNING
11 1027 1810 2100 CLEAR YES AWNING
12 1027 610 2100 CLEAR YES AWNING
14 2000 2050 2300 CLEAR YES OFFSET AWNING
15 2000 1380 2300 CLEAR YES FIXED
16 2000 2050 2300 CLEAR YES OFFSET AWNING
EXTERNAL DOOR SCHEDULE
D N° HEIGHT WIDTH GLAZING D. GLAZE REQ. MATERIAL DOOR TYPE COMMENTS
1 2405 1380 TRANSLUCENT NO TIMBER ENTRY 920 DOOR & 1N°
SIDELIGHT
2 2405 965 N/A N/A TIMBER ENTRY 920 DOO
3 2300 3000 CLEAR YES ALUMINIUM STACKER SLIDING RIGHT TO LEFT
4 2405 865 N/A N/A TIMBER ENTRY 820 DOOR
NOTE: ALL EXHAUST FANS TO BE DUCTED EXTERNALLY AS PER CLAUSE 10.8.2 OF NCC`;

const parsed = parseScheduleText([FIXTURE]);
const lines = matchSchedule(parsed.rows);
const byCode = Object.fromEntries(lines.map((l) => [l.code, l]));

test("parses all schedule rows, ignoring drawing noise", () => {
  assert.equal(parsed.windowCount, 15);
  assert.equal(parsed.doorCount, 4);
  assert.equal(parsed.rows.length, 19);
  assert.deepEqual(parsed.warnings, []);
});

test("maps HEIGHT-before-WIDTH columns to the right axes", () => {
  // W2: schedule HEIGHT=700 WIDTH=3500 → width 3500, height 700 (not transposed)
  assert.equal(byCode.W02.width, "3500");
  assert.equal(byCode.W02.height, "700");
});

test("preserves schedule item codes including the W13 gap", () => {
  assert.ok(byCode.W12 && byCode.W14 && !byCode.W13);
  assert.ok(byCode.D01 && byCode.D03);
});

test("produces 19 line items in schedule order", () => {
  assert.equal(lines.length, 19);
  assert.equal(lines[0].code, "W01");
  assert.equal(lines[18].code, "D04");
});

test("an unmappable family is an ERROR — never a best-guess substitution", () => {
  // FIXED has no catalogue family (and no alias pointing at one), so we must NOT
  // price it as a near-miss family: the price difference between families is
  // material, so a wrong guess is worse than asking. The customer picks the
  // product; the durable fix is adding the wording to a family's Sanity aliases.
  for (const code of ["W02", "W08", "W15"]) {
    const l = byCode[code];
    assert.equal(l.productSlug, "", `${code}: no product may be guessed`);
    assert.ok(l.review?.product, `${code}: flagged for the customer to choose`);
    assert.ok(!l.review?.substitute, `${code}: never silently substituted`);
    assert.equal(lineBlocksSubmission(l), true, `${code}: an unmappable type BLOCKS`);
    assert.equal(reviewClass(l.review), "customer");
    assert.equal(l.status, "Needs review");
  }
});

test("catalogue aliases resolve architect vocabulary to the RIGHT family, both paths", () => {
  // Aliases are catalogue content: adding trade wording must not need a code
  // change, and must resolve to the exact family — never a near-miss.
  const original = families.slice();
  try {
    const awning = families.find((f) => f.slug === "awning-window");
    awning.aliases = ["PICTURE", "Top Hung"];
    // Deterministic path: a type the built-in table has NEVER seen now maps to the
    // real family purely from catalogue content — and prices normally.
    const rows = matchSchedule(parseScheduleText([`WINDOW SCHEDULE
W N° HEIGHT WIDTH HEAD HT. GLAZING D.GLAZE REQ. WINDOW TYPE COMMENTS
1 1027 610 2100 CLEAR YES PICTURE`]).rows);
    assert.equal(getProductBySlug(rows[0].productSlug).familySlug, "awning-window");
    assert.ok(!rows[0].review?.product, "an aliased type is not an error");
    // Case/punctuation differences must not defeat the match (AI path supplies
    // free-form type text, so this normalisation matters most there).
    assert.equal(resolveScheduleType("window", "top hung").familySlug, "awning-window");
    assert.equal(resolveScheduleType("window", "  PICTURE  ").familySlug, "awning-window");
    // AI path resolves the SAME alias to the estimator's operation vocabulary.
    assert.equal(resolveScheduleType("window", "PICTURE").operationType, "awning");
    // An unknown term still resolves to nothing on both paths — no guessing.
    assert.deepEqual(resolveScheduleType("window", "PORTHOLE"), { familySlug: null, operationType: null });
  } finally {
    families.length = 0; families.push(...original);
  }
});

test("multi-word type tags are read as ONE phrase, exactly as printed", () => {
  const original = families.slice();
  try {
    families.find((f) => f.slug === "awning-window").aliases = ["Top Hung"];
    const parsedRows = parseScheduleText([`WINDOW SCHEDULE
W N° HEIGHT WIDTH HEAD HT. GLAZING D.GLAZE REQ. WINDOW TYPE COMMENTS
1 1027 610 2100 CLEAR YES Top hung
2 1027 610 2100 CLEAR YES Top hung OBSCURE GLASS`]).rows;
    // "Top hung" is ONE tag — never split into type "Top" + comment "hung" — and
    // is preserved exactly as displayed on the schedule.
    assert.equal(parsedRows[0].typeText, "Top hung");
    assert.equal(parsedRows[0].comments, null);
    // A genuine trailing comment still separates correctly after the full phrase.
    assert.equal(parsedRows[1].typeText, "Top hung");
    assert.equal(parsedRows[1].comments, "OBSCURE GLASS");
    // …and it resolves to the right family, priced, no error.
    const rows = matchSchedule(parsedRows);
    assert.equal(getProductBySlug(rows[0].productSlug).familySlug, "awning-window");
    assert.ok(!rows[0].review?.product);
  } finally {
    families.length = 0; families.push(...original);
  }
});

test("a longer tag always beats its own prefix (greedy longest-first)", () => {
  // Built-in multi-word phrases must not regress: OFFSET AWNING is not AWNING,
  // and STACKER SLIDING is not STACKER.
  assert.equal(byCode.W01.rawType, "OFFSET AWNING");
  assert.equal(byCode.D03.rawType, "STACKER SLIDING");
  assert.match(byCode.D03.location, /RIGHT TO LEFT/);
});

test("schedule defaults are stated, not guessed: qty 1 per row, sizes are OPENING sizes", () => {
  // One schedule row = one opening, and schedules state opening sizes by
  // convention. These defaults matter for MANUAL entry, where the customer is
  // asked directly.
  for (const l of lines) {
    assert.equal(l.qty, 1);
  }
});

test("oversized opening: best-fit is PRICED but always WARNED, never presented as Ready", () => {
  // W01 = 2050mm wide; no awning's range reaches that width. We still offer the
  // best fit so the customer gets an indicative number — but it must carry a
  // warning, must not claim to be Ready, and must not block submission (AMJ
  // designs the composite; the customer can't resize their building).
  assert.ok(byCode.W01.productSlug, "best-fit product is offered so the line can be priced");
  assert.ok(byCode.W01.review?.fit, "…but the size mismatch is always warned");
  assert.match(byCode.W01.review.fit, /Indicative price only/i);
  assert.notEqual(byCode.W01.status, "Ready", "an out-of-range line is never presented as Ready");
  assert.ok(!byCode.W01.review?.dims, "'fit' is an AMJ warning, not a customer 'dims' error");
  assert.equal(reviewClass(byCode.W01.review), "technical");
  assert.equal(lineBlocksSubmission(byCode.W01), false, "warnings never block submission");
  assert.ok(byCode.W04.review?.fit || byCode.W04.review?.note);

  // A FITTING opening still gets a real, in-range product with no fit warning.
  assert.ok(byCode.W05.productSlug, "an in-range opening gets a real product");
  assert.ok(!byCode.W05.review?.fit);
  assert.equal(byCode.W05.status, "Ready");

  // THE INVARIANT: a product may be offered outside its range ONLY as a warned,
  // indicative line — never silently, and never as a confirmed/Ready one.
  for (const l of lines) {
    if (!l.productSlug) continue;
    const p = getProductBySlug(l.productSlug);
    const w = parseInt(l.width, 10) || 0, h = parseInt(l.height, 10) || 0;
    if (!(w > 0 && h > 0)) continue;
    const fits = (p.minWidth == null || w >= p.minWidth) && (p.maxWidth == null || w <= p.maxWidth)
      && (p.minHeight == null || h >= p.minHeight) && (p.maxHeight == null || h <= p.maxHeight);
    if (fits) continue;
    assert.ok(l.review?.fit, `${l.code}: ${w}×${h}mm offered ${p.name} (range ${p.minWidth}–${p.maxWidth} W, ${p.minHeight}–${p.maxHeight} H) with NO fit warning`);
    assert.notEqual(l.status, "Ready", `${l.code}: out-of-range line must not read as Ready`);
  }
});

test("submission lifecycle: technical-only lines are submittable; customer gaps block", () => {
  // These fixtures are RAW parser output, produced before anything is priced.
  // Priceability is now the server's answer alone — the browser holds no rate
  // data — so a line the server priced carries a lineTotal, and `priced` here
  // stands in for that round-trip. Without it every line would read "unpriced",
  // which is true of parser output and says nothing about submittability.
  const priced = (l) => ({ ...l, lineTotal: 500 });
  // Timber door: mapped to an aluminium product, priced, technical flag only →
  // must NOT block submission (submission is how it reaches an AMJ technician).
  assert.equal(lineBlocksSubmission(priced(byCode.D01)), false);
  assert.equal(reviewClass(byCode.D01.review), "technical");
  // Oversized awning: best-fit priced + 'fit' warning → AMJ designs a composite →
  // still submittable (the customer can't resize a building).
  assert.equal(lineBlocksSubmission(priced(byCode.W01)), false);
  assert.equal(reviewClass(byCode.W01.review), "technical");
  // FIXED window: no family maps to it, and guessing a near-miss family would
  // mis-price it → an ERROR the customer resolves by choosing the product.
  assert.equal(lineBlocksSubmission(priced(byCode.W02)), true);
  assert.equal(reviewClass(byCode.W02.review), "customer");
  // A clean, fitting awning blocks nothing.
  assert.equal(lineBlocksSubmission(priced(byCode.W05)), false);
  // Only a genuine customer gap blocks: an unreadable size is an ERROR.
  assert.equal(lineBlocksSubmission({ ...priced(byCode.W05), review: { dims: "Size could not be read" } }), true);
  // And a line the server could NOT price blocks, with no warning to explain it.
  assert.equal(lineBlocksSubmission({ ...byCode.W05, lineTotal: null }), true);
});

test("fitting awnings map cleanly and are ready", () => {
  for (const code of ["W05", "W06", "W12"]) {
    assert.ok(byCode[code].productSlug);
    assert.equal(getProductBySlug(byCode[code].productSlug).familySlug, "awning-window");
    assert.equal(byCode[code].status, "Ready");
  }
});

test("surfaces multi-line/wrapped comments as the item note", () => {
  assert.match(byCode.D01.location, /SIDELIGHT/);
  assert.match(byCode.W04.location, /600/);
});

test("flags timber doors (aluminium catalogue) for substitution review", () => {
  for (const code of ["D01", "D02", "D04"]) assert.ok(byCode[code].review?.material);
});

test("maps a stacker slider to a fitting sliding door", () => {
  assert.equal(getProductBySlug(byCode.D03.productSlug).familySlug, "sliding-door");
  assert.equal(byCode.D03.status, "Ready");
  assert.match(byCode.D03.location, /RIGHT TO LEFT/);
});

test("glazing: a double-glazed product satisfies D.GLAZE YES but conflicts with NO", () => {
  // Same fitting awning twice — YES matches the product's IGU glass (no flag); NO
  // conflicts with it and must raise a technical glazing issue, never silently pass.
  const fixture = `WINDOW SCHEDULE
W N° HEIGHT WIDTH HEAD HT. GLAZING D.GLAZE REQ. WINDOW TYPE COMMENTS
1 1027 610 2100 CLEAR YES AWNING
2 1027 610 2100 CLEAR NO AWNING`;
  const rows = matchSchedule(parseScheduleText([fixture]).rows);
  const yes = rows.find((r) => r.code === "W01");
  const no = rows.find((r) => r.code === "W02");
  assert.ok(yes.productSlug, "YES row still maps to a product");
  assert.ok(!yes.review?.glazing, "YES matches the double-glazed product — no glazing flag");
  assert.ok(no.review?.glazing, "NO conflicts with the double-glazed product — must flag");
  assert.match(no.review.glazing, /single glazing/i);
  // Glazing is a TECHNICAL issue — it must not block the customer's submission.
  assert.equal(reviewClass(no.review), "technical");
  assert.equal(lineBlocksSubmission(no), false);
});

test.after(() => removeRunDir(runDir));

// ── The anonymous matcher picks the cheapest that fits (D6) ─────────────────
//
// `WINDOW_SERIES_BIAS` / `DOOR_SERIES_BIAS` were slug-prefix inference deciding
// which product a visitor is quoted — the exact rule
// docs/product-compatibility-design.md §1.1 refuses, on the grounds that a rule
// right nine times and silently wrong twice is worse than no rule. They survive
// as the deterministic FALLBACK and the final tiebreak; they stop being the
// decision.

/** Price by slug, and count the calls so memoisation can be asserted. */
const pricerOver = (bySlug, fallback = 1000) => {
  const calls = [];
  const priceOf = (product, widthMm, heightMm) => {
    calls.push(`${product.slug}@${widthMm}x${heightMm}`);
    return bySlug[product.slug] ?? fallback;
  };
  return { priceOf, calls };
};

const rowFor = (typeText, widthMm, heightMm) =>
  ({ tag: "W1", section: "window", typeText, widthMm, heightMm, qty: 1 });


test("AC-37 the cheapest fitting product wins, whatever the bias order says", () => {
  // Five awning frames all fit 850 × 2057. The bias order puts amj80 first and
  // amj150 last; the rate card says amj150 is the cheapest thing that fits.
  const { priceOf } = pricerOver({ "amj150-series-awning-window": 400 });
  const [line] = matchSchedule([rowFor("AWNING", 850, 2057)], { priceOf });
  assert.equal(line.productSlug, "amj150-series-awning-window");

  // Move the money and the pick moves with it — the ordering is the rate card's,
  // not a slug's position in a list.
  const cheapMid = pricerOver({ "amj100l-series-awning-window": 400 });
  assert.equal(matchSchedule([rowFor("AWNING", 850, 2057)], { priceOf: cheapMid.priceOf })[0].productSlug,
    "amj100l-series-awning-window");
});

test("AC-38 fit is still the filter — a cheaper product that does not fit is not picked", () => {
  // 1,250 mm wide: only the amj100t frames are made that wide. amj80 is the
  // cheapest product in the family and is not a candidate, because being cheap
  // has never been a reason to quote something that is not manufactured.
  const { priceOf } = pricerOver({ "amj80-series-awning-window": 1, "amj150-series-awning-window": 2 }, 5000);
  const [line] = matchSchedule([rowFor("AWNING", 1250, 2000)], { priceOf });
  assert.match(line.productSlug, /^amj100t/);
  assert.ok(!line.review?.fit, "it genuinely fits, so there is no indicative-price warning");
});

test("AC-39 with no pricer the bias order stands, exactly as before", () => {
  // The live client path: App.tsx renders the sample schedule with no pricing
  // engine in the browser. This is a real branch, not a defensive one.
  const [line] = matchSchedule([rowFor("AWNING", 850, 2057)]);
  assert.equal(line.productSlug, "amj80-series-awning-window");
  // …and an injected pricer that can price NOTHING falls back to the same order
  // rather than picking arbitrarily.
  const blind = matchSchedule([rowFor("AWNING", 850, 2057)], { priceOf: () => null })[0];
  assert.equal(blind.productSlug, "amj80-series-awning-window");
  // A6's posture, carried onto this path: a rate-card gap that computes zero is
  // not a cheap product.
  const zero = matchSchedule([rowFor("AWNING", 850, 2057)], { priceOf: () => 0 })[0];
  assert.equal(zero.productSlug, "amj80-series-awning-window");
});

test("A6 a $0 or negative rate-card gap is not the cheapest product", () => {
  // The uniform-zero case above is not the dangerous one: it degrades to the
  // bias order by accident. THIS is the dangerous one — a single product whose
  // rate card computes nothing, sitting beside four that price properly. It
  // would win every comparison on price and quote a visitor $0 for a window.
  const { priceOf } = pricerOver({ "amj150-series-awning-window": 0, "amj100t-awning-window": -50 }, 900);
  const [line] = matchSchedule([rowFor("AWNING", 850, 2057)], { priceOf });
  assert.ok(!["amj150-series-awning-window", "amj100t-awning-window"].includes(line.productSlug),
    `an unpriceable product was picked: ${line.productSlug}`);
  // The cheapest REAL price wins instead.
  const withReal = pricerOver({ "amj150-series-awning-window": 0, "amj100l-series-awning-window": 400 }, 900);
  assert.equal(matchSchedule([rowFor("AWNING", 850, 2057)], { priceOf: withReal.priceOf })[0].productSlug,
    "amj100l-series-awning-window");
  // A NaN is not a price either — it compares false against everything and would
  // silently leave the pick wherever it started.
  const nan = pricerOver({ "amj150-series-awning-window": Number.NaN }, 900);
  assert.equal(matchSchedule([rowFor("AWNING", 850, 2057)], { priceOf: nan.priceOf })[0].productSlug,
    "amj80-series-awning-window", "the bias order holds when nothing is genuinely cheaper");
});

test("AC-40 the nothing-fits branch is untouched", () => {
  // 5,000 mm wide: no awning frame is made at that size. The largest-capacity
  // unit still comes back, priced at the REAL opening dimensions, with the
  // indicative-price warning — that promise predates this change and survives it.
  const { priceOf } = pricerOver({ "amj80-series-awning-window": 1 });
  const [line] = matchSchedule([rowFor("AWNING", 5000, 2000)], { priceOf });
  assert.match(line.productSlug, /^amj100t/, "the largest capacity, not the cheapest");
  assert.match(line.review.fit, /Indicative price only/);

  // And with no dimensions at all it is the bias order, pricer or not: there is
  // nothing to price against.
  const [noDims] = matchSchedule([rowFor("AWNING", 0, 0)], { priceOf });
  assert.equal(noDims.productSlug, "amj80-series-awning-window");
});

test("AC-41 pricing is memoised per (family, section, size), not per row × product", () => {
  // A 50-row schedule across a handful of families must not turn into hundreds
  // of price computations. The bound is distinct (family, size) combinations.
  const { priceOf, calls } = pricerOver({});
  const rows = [];
  for (let i = 0; i < 25; i++) {
    rows.push(rowFor("AWNING", 850, 2057));
    rows.push(rowFor("AWNING", 900, 1200));
  }
  const lines = matchSchedule(rows, { priceOf });
  assert.equal(lines.length, 50);

  // Two distinct sizes in one family, five products in it: ten lookups, not 250.
  assert.equal(calls.length, 10, calls.join(" "));
  assert.equal(new Set(calls).size, 10, "and every lookup asked a different question");
});

test("the Worker parse path injects a pricer; the client path deliberately does not", async () => {
  // Two callers, two correct answers. The Worker has D1 and injects the real
  // engine, so a visitor's parsed schedule is priced against the rate card. The
  // browser has no pricing engine and must not grow one — a second engine is
  // exactly the drift this codebase keeps one home to prevent — so the sample
  // schedule renders in bias order, which is a live path and not a fallback.
  const source = (rel) => readFile(join(projectRoot, rel), "utf8");

  const parse = await source("worker/lib/parse.ts");
  assert.match(parse, /matchSchedule\([\s\S]{0,200}priceOf/,
    "the Worker supplies the lookup to matchSchedule");
  assert.match(parse, /createCachedPriceResolver\(\s*env\s*,\s*null\s*\)/,
    "built with a NULL user: there is no account on the anonymous path (AD11)");

  const app = await source("src/app/App.tsx");
  const call = app.match(/matchSchedule\([^)]*\)/);
  assert.ok(call, "the client still matches the sample schedule");
  assert.ok(!/priceOf/.test(call[0]), "and passes no pricer");
});
