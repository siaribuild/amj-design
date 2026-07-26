// Schedule parsing + matching unit tests. Pure logic — no PDF, no server: a
// fixture of the extracted schedule text (as unpdf produces it) is fed through
// the same parser + matcher the Worker uses. TS bundled once with esbuild
// (same approach as unit.test.mjs / catalogue.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("schedule");
const outfile = join(runDir, "schedule-bundle.mjs");
await build({
  stdin: {
    contents: `
      export { parseScheduleText } from ${p("src/data/scheduleParse.ts")};
      export { matchSchedule } from ${p("src/data/scheduleMatch.ts")};
      export { getProductBySlug } from ${p("src/data/catalogue.ts")};
      export { lineBlocksSubmission, reviewClass } from ${p("src/data/configurator.ts")};
    `,
    resolveDir: projectRoot,
    sourcefile: "schedule-entry.ts",
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { parseScheduleText, matchSchedule, getProductBySlug, lineBlocksSubmission, reviewClass } = await import(pathToFileURL(outfile).href);

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

test("FIXED windows are never silently invented — substitution is always disclosed", () => {
  // Superseded intent: these used to be left product-less and blocking. They are
  // now priced via the nearest family, but the substitution must NEVER be silent.
  for (const code of ["W02", "W08", "W15"]) {
    assert.ok(byCode[code].review?.substitute, `${code} must disclose the substitution`);
    assert.equal(byCode[code].status, "Needs review");
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

test("recognised type with no catalogue family is substituted + warned, not left unpriced", () => {
  // FIXED windows have no family of their own; they are priced as the nearest
  // family (awning) with an explicit substitution warning, so the customer still
  // gets an indicative number instead of a blocking "choose a product".
  for (const code of ["W02", "W08", "W15"]) {
    const l = byCode[code];
    assert.ok(l.productSlug, `${code}: substituted product offered`);
    assert.ok(l.review?.substitute, `${code}: substitution warned`);
    assert.match(l.review.substitute, /Indicative price only/i);
    assert.ok(!l.review?.product, `${code}: not a customer 'choose a product' error`);
    assert.equal(lineBlocksSubmission(l), false, `${code}: substitution never blocks`);
    assert.notEqual(l.status, "Ready");
  }
});

test("submission lifecycle: technical-only lines are submittable; customer gaps block", () => {
  // Timber door: mapped to an aluminium product, priced, technical flag only →
  // must NOT block submission (submission is how it reaches an AMJ technician).
  assert.equal(lineBlocksSubmission(byCode.D01), false);
  assert.equal(reviewClass(byCode.D01.review), "technical");
  // Oversized awning: best-fit priced + 'fit' warning → AMJ designs a composite →
  // still submittable (the customer can't resize a building).
  assert.equal(lineBlocksSubmission(byCode.W01), false);
  assert.equal(reviewClass(byCode.W01.review), "technical");
  // FIXED window: substituted + warned → indicative price → also submittable.
  assert.equal(lineBlocksSubmission(byCode.W02), false);
  assert.equal(reviewClass(byCode.W02.review), "technical");
  // A clean, fitting awning blocks nothing.
  assert.equal(lineBlocksSubmission(byCode.W05), false);
  // Only a genuine customer gap blocks: an unreadable size is an ERROR.
  assert.equal(lineBlocksSubmission({ ...byCode.W05, review: { dims: "Size could not be read" } }), true);
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
