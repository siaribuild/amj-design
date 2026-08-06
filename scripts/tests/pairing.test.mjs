// Default split pairing — the family-level fallback, tested against the REAL
// catalogue's dimensions rather than invented ones.
//
// The numbers below are live: the widest awning AMJ makes is 1300mm and every
// fixed window runs 400–3000mm. So "three 1200mm awnings" is not a hypothetical
// failure, it is what a 3600mm awning opening produces today.
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

// The builder's stated rule, as it would be authored on the Awning Window family.
const AWNING_RULE = {
  infillFamilySlug: "fixed-window",
  placement: "outer",
  maxOperable: 2,
  operableEveryMm: 3000,
  minInfillMm: 400,
};

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

test("the builder's case: 3600mm gets ONE sash and glass, not three awnings", () => {
  // Today this opening becomes awning 1200 | awning 1200 | awning 1200, because
  // ceil(3600/1300) = 3 and every unit inherits the parent's operation.
  const out = call(3600);
  assert.ok(out, "the family names an infill, so there is an opinion to give");
  assert.equal(shape(out), "operable:1300 | infill:2300");
  assert.equal(sums(out), 3600, "the units partition the opening exactly");
});

test("a modest overflow still pairs rather than halving", () => {
  // 1950 is barely over one frame. Halving gives two 975mm awnings — two sashes
  // where one and a lite is what gets built.
  const out = call(1950);
  assert.equal(shape(out), "operable:1300 | infill:650");
  assert.equal(sums(out), 1950);
});

test("a wide opening earns a second sash, and the glass sits between them", () => {
  // 6000 / 3000 = 2 sashes earned, cap is 2. Placement "outer" puts the sashes at
  // the jambs — the shape an explicit "AWNING + FIXED + AWNING" comment already
  // produces, so the default and a stated layout agree rather than contradict.
  const out = call(6000);
  assert.equal(out.units[0].role, "operable");
  assert.equal(out.units[out.units.length - 1].role, "operable");
  assert.equal(out.units.filter((u) => u.role === "operable").length, 2);
  assert.equal(sums(out), 6000);
  assert.ok(out.units.length <= 4, "inside the composite cap");
});

test("giving up a sash beats giving up the pairing when the cap bites", () => {
  // 9000 earns 3 sashes but the cap is 2; even 2 needs 2 sashes + 3 lites = 5
  // units, over the 4-unit maximum. One sash and a wall of glass is still the
  // right shape and is what the manufacturer would build.
  const out = call(9000);
  assert.ok(out, "the pairing survives");
  assert.ok(out.units.length <= 4, `got ${out.units.length} units`);
  assert.equal(out.units.filter((u) => u.role === "operable").length, 1);
  assert.equal(sums(out), 9000, "still partitions exactly");
  assert.match(out.note, /Limited to 1 by the 4-unit maximum/);
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
  // 1350 leaves 50mm beside a 1300 sash. Nobody builds a 50mm lite; returning
  // null hands the opening back to the even split rather than proposing a joke.
  assert.equal(call(1350), null);
  // …and the threshold is the authored one, not a constant.
  assert.ok(call(1350, { ...AWNING_RULE, minInfillMm: 40 }), "a practice may set it lower");
});

test("unknown dimensions produce no opinion rather than a guess", () => {
  // A family with no dimension rule has no floor for the arithmetic. Guessing a
  // maximum would invent a manufacturing constraint.
  assert.equal(call(3600, AWNING_RULE, { operableMaxWidthMm: 0 }), null);
  assert.equal(call(3600, AWNING_RULE, { infillMaxWidthMm: 0 }), null);
});

test("with no width trigger it is exactly one sash, however wide the hole", () => {
  const oneSash = { ...AWNING_RULE, operableEveryMm: null };
  const out = call(6000, oneSash);
  assert.equal(out.units.filter((u) => u.role === "operable").length, 1);
  assert.equal(sums(out), 6000);
});

test("placement is the editor's choice, and every option partitions exactly", () => {
  for (const placement of ["outer", "centre", "left", "right"]) {
    const out = call(6000, { ...AWNING_RULE, placement });
    assert.ok(out, placement);
    assert.equal(sums(out), 6000, `${placement} partitions exactly`);
    assert.ok(out.units.length <= 4, `${placement} respects the cap`);
    assert.equal(out.units.filter((u) => u.role === "operable").length, 2, placement);
  }
  // The shapes genuinely differ — this is a real choice, not a cosmetic one.
  assert.equal(call(6000, { ...AWNING_RULE, placement: "left" }).units[0].role, "operable");
  assert.equal(call(6000, { ...AWNING_RULE, placement: "right" }).units[0].role, "infill");
  assert.equal(call(6000, { ...AWNING_RULE, placement: "centre" }).units[0].role, "infill");
});

// ── The cases the first suite was blind to ───────────────────────────────────
// Twelve tests passed while two placement defects shipped, because every
// placement was exercised at 6000mm ONLY — where k=2 for all four options and
// both faults are invisible.

test("outer keeps a sash at BOTH jambs and spreads the glass between them", () => {
  // The old arrangement appended surplus sashes AFTER the glass, so three
  // sashes came out as sash | glass | glass | sash | sash — all the glass
  // bunched at one end and two sashes adjacent at the other.
  const out = M.proposePairedLayout({
    openingWidthMm: 6000, operableMaxWidthMm: 1300, infillMaxWidthMm: 1100,
    maxSegments: 6,
    rule: { ...AWNING_RULE, maxOperable: 3, operableEveryMm: 1500 },
  });
  assert.equal(shape(out), "operable:1300 | infill:1050 | operable:1300 | infill:1050 | operable:1300");
  assert.equal(sums(out), 6000);
});

test("outer alternates cleanly at four sashes too", () => {
  const out = M.proposePairedLayout({
    openingWidthMm: 8000, operableMaxWidthMm: 1300, infillMaxWidthMm: 1100,
    maxSegments: 8,
    rule: { ...AWNING_RULE, maxOperable: 4, operableEveryMm: 1500 },
  });
  assert.equal(out.units[0].role, "operable");
  assert.equal(out.units[out.units.length - 1].role, "operable");
  assert.equal(sums(out), 8000);
});

test("outer with fewer panels than gaps still puts sashes at the jambs", () => {
  // Three sashes and one panel: two sashes MUST be adjacent somewhere. The
  // promise "outer" makes is the jambs, and it is still kept.
  const out = call(6000, { ...AWNING_RULE, maxOperable: 3, operableEveryMm: 1500 });
  assert.equal(out.units[0].role, "operable");
  assert.equal(out.units[out.units.length - 1].role, "operable");
  assert.equal(sums(out), 6000);
});

test("centre puts glass at BOTH jambs, even when the maths wants one panel", () => {
  // 3600 leaves 2300mm of glass and a fixed maxes at 3000, so the arithmetic
  // wants ONE panel — which cannot express "centre" and used to come out as
  // infill | operable, indistinguishable from placement "right".
  const out = call(3600, { ...AWNING_RULE, placement: "centre" });
  assert.equal(shape(out), "infill:1150 | operable:1300 | infill:1150");
  assert.equal(sums(out), 3600);
  assert.equal(out.units[0].role, "infill");
  assert.equal(out.units[out.units.length - 1].role, "infill");
});

test("every placement is distinguishable from every other, at k=2 AND k=3", () => {
  const seen = new Map();
  for (const placement of ["outer", "centre", "left", "right"]) {
    for (const rule of [
      { ...AWNING_RULE, placement },
      { ...AWNING_RULE, placement, maxOperable: 3, operableEveryMm: 1500 },
    ]) {
      const out = call(6000, rule);
      assert.ok(out, placement);
      assert.equal(sums(out), 6000, placement);
      assert.ok(out.units.length <= 4, placement);
      const key = `k${rule.maxOperable}`;
      const bucket = seen.get(key) ?? new Set();
      const last = out.units[out.units.length - 1];
      bucket.add(`${out.units[0].role}/${last.role}`);
      seen.set(key, bucket);
    }
  }
  // outer=o/o, centre=i/i, left=o/i, right=i/o — four distinct jamb signatures,
  // which is the whole point of offering the choice.
  for (const [k, bucket] of seen) {
    assert.equal(bucket.size, 4, `${k}: every placement must produce a distinct pair of jambs`);
  }
});
test("the cap is honoured even when a practice authors a high one", () => {
  const greedy = { ...AWNING_RULE, maxOperable: 6, operableEveryMm: 800 };
  const out = call(6000, greedy);
  assert.ok(out.units.length <= 4, `got ${out.units.length}`);
  assert.equal(sums(out), 6000);
});

test("the note explains itself, because a reviewer should not need the code", () => {
  assert.match(call(3600).note, /1 opening sash with 1 fixed panel/);
  assert.match(call(6000).note, /2 opening sashes/);
});
