// Default split pairing — the family-level fallback, tested against the REAL
// catalogue's dimensions rather than invented ones.
//
// The numbers below are live: the widest awning AMJ makes is 1300mm and every
// fixed window runs 400–3000mm. So "two awnings side by side" is not a
// hypothetical failure, it is what a 2050mm awning opening produced in
// production before this existed.
//
// The rule is deliberately one sentence: if the opening is wider than the widest
// frame the family makes, take the alternative family named in Sanity and fill
// the remainder with it. Placement, an opening-unit cap and a width that earns
// another unit were all authored knobs once; the owner removed them, because a
// unit is a whole window — frame included — so coupling two already produces the
// mullion between them, and which side the opening window sits on is in the
// drawings, not in a family default.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("pairing");
const outfile = join(runDir, "pairing-bundle.mjs");
await build({
  stdin: {
    contents: `export { proposePairedLayout } from ${p("worker/lib/estimator/pairing.ts")};`,
    resolveDir: projectRoot, sourcefile: "pairing-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const M = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
test.after(async () => { if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir); });

// Exactly what the owner authored on Awning Window: an infill family, and
// nothing else. Every case below therefore also proves the defaults hold.
const AWNING_RULE = { infillFamilySlug: "fixed-window" };

const call = (width, rule = AWNING_RULE, over = {}) => M.proposePairedLayout({
  openingWidthMm: width,
  operableMaxWidthMm: 1300,   // live: the widest awning AMJ makes
  infillMaxWidthMm: 3000,     // live: every fixed window
  maxSegments: 4,             // composite_policy default
  rule,
  ...over,
});

const shape = (layout) => layout.units.map((u) => `${u.role}:${u.widthMm}`).join(" | ");
const sums = (layout) => layout.units.reduce((n, u) => n + u.widthMm, 0);

test("W1, the opening that started this: 2050 is one awning and a lite", () => {
  // Production delivered awning 1025 | awning 1025.
  const out = call(2050);
  assert.ok(out, "the family names an infill, so there is an opinion to give");
  assert.equal(shape(out), "operable:1300 | infill:750");
  assert.equal(sums(out), 2050, "the units partition the opening exactly");
});

test("a modest overflow pairs rather than halving", () => {
  // 1950 is barely over one frame. Halving gives two 975mm awnings — two windows
  // where one and a lite is what gets built.
  const out = call(1950);
  assert.equal(shape(out), "operable:1300 | infill:650");
  assert.equal(sums(out), 1950);
});

test("the opening window is always exactly one, however wide the hole", () => {
  // The cap and the width-trigger that used to add more are gone. A 6m opening
  // is one opening window and a wall of glass; a reviewer widens it if the
  // ventilation is wrong, which is a judgement a default should not make.
  for (const width of [2050, 3600, 6000, 9000]) {
    const out = call(width);
    assert.ok(out, String(width));
    assert.equal(out.units.filter((u) => u.role === "operable").length, 1, String(width));
    assert.equal(sums(out), width, String(width));
  }
});

test("the opening window comes first, and takes its full width", () => {
  // An ORDER, not a claim about handedness — which jamb it sits against is in
  // the drawings. It takes its full width because it is the size-constrained
  // unit: leaving it narrower would only ask for more glass.
  const out = call(3600);
  assert.equal(out.units[0].role, "operable");
  assert.equal(out.units[0].widthMm, 1300);
  assert.ok(out.units.slice(1).every((u) => u.role === "infill"));
});

test("glass wider than one fixed frame becomes several panels", () => {
  // 9000 leaves 7700mm of glass against a 3000mm maximum: three panels, none
  // oversize, four units in total — exactly the composite cap.
  const out = call(9000);
  assert.equal(shape(out), "operable:1300 | infill:2566 | infill:2566 | infill:2568");
  assert.equal(sums(out), 9000);
  assert.ok(out.units.every((u) => u.role === "operable" || u.widthMm <= 3000));
});

test("past the composite cap it declines rather than proposing a refused plan", () => {
  // 12000 needs 1 + 4 panels = 5 units against a 4-unit maximum. Returning null
  // hands the opening back to the even split; proposing it would build a plan
  // validateSplit then refuses, which reads to the customer as no split at all.
  assert.equal(call(12000), null);
  assert.ok(call(12000, AWNING_RULE, { maxSegments: 5 }), "a higher cap accepts it");
});

test("no infill family means no opinion — today's behaviour, untouched", () => {
  // This is EVERY family's default. The field is inert until an editor fills it,
  // so shipping the schema changes nothing on its own.
  assert.equal(call(3600, null), null);
  assert.equal(call(3600, {}), null);
  assert.equal(call(3600, { infillFamilySlug: "" }), null);
  assert.equal(call(3600, { infillFamilySlug: "   " }), null, "whitespace is not a family");
});

test("an opening that fits one frame is not a composite at all", () => {
  assert.equal(call(1300), null, "exactly at the maximum");
  assert.equal(call(900), null);
});

test("a sliver of glass is refused, and the opening falls back to even units", () => {
  // 1350 leaves 50mm beside a 1300 frame. Nobody builds a 50mm lite; returning
  // null hands the opening back to the even split rather than proposing a joke.
  assert.equal(call(1350), null);
  // …and the threshold is the authored one, not a constant.
  assert.ok(call(1350, { ...AWNING_RULE, minInfillMm: 40 }), "a practice may set it lower");
  // The default is 400, so this is the boundary either side of it.
  assert.equal(call(1699), null, "399mm of glass");
  assert.ok(call(1700), "400mm exactly");
});

test("unknown dimensions produce no opinion rather than a guess", () => {
  // A family with no dimension rule has no floor for the arithmetic. Guessing a
  // maximum would invent a manufacturing constraint.
  assert.equal(call(3600, AWNING_RULE, { operableMaxWidthMm: 0 }), null);
  assert.equal(call(3600, AWNING_RULE, { infillMaxWidthMm: 0 }), null);
  assert.equal(call(0), null);
});

test("the note explains itself, because a reviewer should not need the code", () => {
  assert.match(call(2050).note, /1 opening unit with 1 fixed panel/);
  assert.match(call(9000).note, /1 opening unit with 3 fixed panels/);
  // "sash" is not the platform's word for a unit: a unit is a whole window,
  // frame included, and the owner corrected this vocabulary deliberately.
  assert.doesNotMatch(call(2050).note, /sash/i);
});
