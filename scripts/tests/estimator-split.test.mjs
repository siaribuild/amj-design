// WS8: tests for composite split PROPOSAL — parsing schedule comments, the
// comment-authoritative → 50/50-default precedence, and area-weighted composite
// Uw. Includes the owner's W4 worked example.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("estimator-split");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export { parseSplitHint, proposeSplit, shouldPropose, evenWidths, compositeAveragedUw, resolveMakeUp } from ${p("worker/lib/estimator/split.ts")};
      export { splitsAreEligible, selectWithSplits, resolvePairing, splitSegmentSpecs } from ${p("worker/lib/estimator/splitCandidates.ts")};
      export { materialiseSelectedSplit } from ${p("worker/lib/estimator/estimate.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { parseSplitHint, proposeSplit, shouldPropose, evenWidths, compositeAveragedUw, resolveMakeUp, splitsAreEligible, selectWithSplits, resolvePairing, splitSegmentSpecs, materialiseSelectedSplit } = await import(pathToFileURL(outfile).href);
// This suite never cleaned up, and left 70 stale run directories behind — the
// only one of the three that omitted it, invisible because .codex-tmp is ignored.
test.after(async () => { if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir); });

// ── Comment parsing ──────────────────────────────────────────────────────────
test("parse: '2x 600mm WIDE AWNINGS' → two 600mm awnings", () => {
  const h = parseSplitHint("2x 600mm WIDE AWNINGS");
  assert.deepEqual(h.units, [{ operation: "awning", count: 2, widthMm: 600 }]);
});

test("parse: an operation sequence 'AWNING + FIXED + AWNING'", () => {
  const h = parseSplitHint("AWNING + FIXED + AWNING");
  assert.deepEqual(h.units.map((u) => u.operation), ["awning", "fixed", "awning"]);
});

test("parse: no split described ⇒ null", () => {
  assert.equal(parseSplitHint("clear glass, restrictor stays"), null);
  assert.equal(parseSplitHint(""), null);
  assert.equal(parseSplitHint(null), null);
});

// ── THE owner's worked example (W4) ──────────────────────────────────────────
test("W4 example: width 3200, '2x 600mm WIDE AWNINGS' ⇒ awning 600 | fixed 2000 | awning 600", () => {
  const opening = { operationType: "awning", widthMm: 3200, heightMm: 2100 };
  const proposal = proposeSplit(opening, parseSplitHint("2x 600mm WIDE AWNINGS"));
  assert.equal(proposal.basis, "schedule_comment");
  assert.equal(proposal.reviewRequired, true);
  assert.deepEqual(proposal.segments, [
    { operation: "awning", widthMm: 600, heightMm: 2100 },
    { operation: "fixed", widthMm: 2000, heightMm: 2100 },
    { operation: "awning", widthMm: 600, heightMm: 2100 },
  ]);
  // Widths partition the opening exactly (no jamb allowance, per owner).
  assert.equal(proposal.segments.reduce((s, seg) => s + seg.widthMm, 0), 3200);
});

// ── Precedence: the PLAN wins the geometry (owner rule, 2026-08-06) ──────────
test("report components never move a plan-derived split's geometry", () => {
  // The energy report is produced after the drawings, can carry human error, and
  // can be biased toward one product's size limits. So when the plan says how an
  // opening divides, the report's component schedule rides along ONLY to supply
  // per-unit thermal targets (plans do not carry them) — it must never re-lay the
  // units out. Previously the report won by writing second to the same map key.
  const opening = { operationType: "awning", widthMm: 3200, heightMm: 2100 };
  const planHint = parseSplitHint("2x 600mm WIDE AWNINGS");
  const withReport = {
    ...planHint,
    components: [
      { operation: "awning", count: 1, widthMm: 805, heightMm: 2100, ref: "W4A" },
      { operation: "fixed", count: 1, widthMm: 1590, heightMm: 2100, ref: "W4B" },
      { operation: "awning", count: 1, widthMm: 805, heightMm: 2100, ref: "W4C" },
    ],
  };
  const bare = proposeSplit(opening, planHint);
  const enriched = proposeSplit(opening, withReport);
  assert.equal(enriched.basis, "schedule_comment", "the plan's basis survives");
  assert.deepEqual(enriched.segments, bare.segments,
    "600 | 2000 | 600 from the drawing, not 805 | 1590 | 805 from the report");
});

// ── Precedence: comment authoritative over the default ───────────────────────
test("comment overrides the 50/50 default", () => {
  const p1 = proposeSplit({ operationType: "awning", widthMm: 2400, heightMm: 1200 }, parseSplitHint("2x 500mm awnings"));
  assert.equal(p1.basis, "schedule_comment");
  assert.equal(p1.segments.length, 3); // awning|fixed|awning (500,1400,500)
  assert.deepEqual(p1.segments.map((s) => s.widthMm), [500, 1400, 500]);
});

test("energy-report component rows are preserved exactly, including fixed lites and per-lite bands", () => {
  const awningBand = { basis: "explicit_energy_report", maxUValue: 2.27, shgcTarget: 0.39, shgcMin: 0.37, shgcMax: 0.41, zoneType: "Media", operablePercent: 90, notes: null };
  const fixedBand = { basis: "explicit_energy_report", maxUValue: 1.69, shgcTarget: 0.53, shgcMin: 0.50, shgcMax: 0.56, zoneType: "Media", operablePercent: 0, notes: null };
  const hint = {
    source: "energy_report", axis: "vertical", raw: "W4A + W4B + W4C",
    units: [
      { ref: "W4A", operation: "awning", count: 1, widthMm: 805, heightMm: 2100, requirement: awningBand },
      { ref: "W4B", operation: "fixed", count: 1, widthMm: 1590, heightMm: 2100, requirement: fixedBand },
      { ref: "W4C", operation: "awning", count: 1, widthMm: 805, heightMm: 2100, requirement: awningBand },
    ],
  };
  const proposal = proposeSplit({ operationType: "awning", widthMm: 3200, heightMm: 2100 }, hint);
  assert.equal(proposal.basis, "energy_report");
  assert.deepEqual(proposal.segments.map((segment) => [segment.ref, segment.operation, segment.widthMm, segment.requirement.shgcMin, segment.requirement.shgcMax]), [
    ["W4A", "awning", 805, 0.37, 0.41],
    ["W4B", "fixed", 1590, 0.50, 0.56],
    ["W4C", "awning", 805, 0.37, 0.41],
  ]);
});

test("W4 mismatch: architectural size wins while the supplementary fixed lite absorbs the delta", () => {
  const awningBand = { basis: "explicit_energy_report", maxUValue: 2.27, shgcTarget: 0.39, shgcMin: 0.37, shgcMax: 0.41, zoneType: "Media", operablePercent: 90, notes: null };
  const fixedBand = { basis: "explicit_energy_report", maxUValue: 1.69, shgcTarget: 0.53, shgcMin: 0.50, shgcMax: 0.56, zoneType: "Media", operablePercent: 0, notes: null };
  const hint = {
    source: "energy_report", axis: "vertical", raw: "W4A + W4B + W4C",
    units: [
      { ref: "W4A", operation: "awning", count: 1, widthMm: 805, heightMm: 2100, requirement: awningBand },
      { ref: "W4B", operation: "fixed", count: 1, widthMm: 1590, heightMm: 2100, requirement: fixedBand },
      { ref: "W4C", operation: "awning", count: 1, widthMm: 805, heightMm: 2100, requirement: awningBand },
    ],
  };
  const proposal = proposeSplit({ operationType: "awning", widthMm: 2410, heightMm: 1800 }, hint);
  assert.deepEqual(proposal.segments.map((segment) => [segment.ref, segment.operation, segment.widthMm, segment.heightMm]), [
    ["W4A", "awning", 805, 1800],
    ["W4B", "fixed", 800, 1800],
    ["W4C", "awning", 805, 1800],
  ]);
  assert.deepEqual(proposal.segments.map((segment) => [segment.requirement.shgcMin, segment.requirement.shgcMax]), [
    [0.37, 0.41], [0.50, 0.56], [0.37, 0.41],
  ], "per-component energy requirements remain authoritative");
  assert.equal(proposal.segments.reduce((sum, segment) => sum + segment.widthMm, 0), 2410);
});

test("no comment, ≤2× oversize ⇒ even 50/50 of the requested operation", () => {
  const proposal = proposeSplit({ operationType: "sliding", widthMm: 3000, heightMm: 1500 }, null, { maxWidthMm: 2000 });
  assert.equal(proposal.basis, "default_even");
  assert.deepEqual(proposal.segments, [
    { operation: "sliding", widthMm: 1500, heightMm: 1500 },
    { operation: "sliding", widthMm: 1500, heightMm: 1500 },
  ]);
});

test("W2: 3500mm fixed opening against a 3000mm maximum becomes two fixed units", () => {
  const proposal = proposeSplit({ operationType: "fixed", widthMm: 3500, heightMm: 700 }, null, { maxWidthMm: 3000 });
  assert.deepEqual(proposal.segments, [
    { operation: "fixed", widthMm: 1750, heightMm: 700 },
    { operation: "fixed", widthMm: 1750, heightMm: 700 },
  ]);
});

test("an opening wider than twice the fixed-product maximum becomes three or more units", () => {
  const proposal = proposeSplit({ operationType: "fixed", widthMm: 7000, heightMm: 700 }, null, { maxWidthMm: 3000 });
  assert.equal(proposal.segments.length, 3);
  assert.ok(proposal.segments.every((segment) => segment.widthMm <= 3000));
  assert.equal(proposal.segments.reduce((sum, segment) => sum + segment.widthMm, 0), 7000);
});

test("no comment, >2× oversize ⇒ 3 equal units so each fits (just maths)", () => {
  // 3500 wide, max product width 1300 → ceil(3500/1300)=3.
  const proposal = proposeSplit({ operationType: "awning", widthMm: 3500, heightMm: 700 }, null, { maxWidthMm: 1300 });
  assert.equal(proposal.segments.length, 3);
  assert.deepEqual(proposal.segments.map((s) => s.widthMm), [1166, 1166, 1168]);
  assert.ok(proposal.segments.every((s) => s.widthMm <= 1300), "every unit now fits the product width");
  assert.equal(proposal.segments.reduce((s, seg) => s + seg.widthMm, 0), 3500);
});

test("odd total splits exactly (remainder to the last unit)", () => {
  assert.deepEqual(evenWidths(3001, 2), [1500, 1501]);
  assert.deepEqual(evenWidths(3200, 3), [1066, 1066, 1068]);
});

// ── shouldPropose gate ───────────────────────────────────────────────────────
test("shouldPropose: a comment always triggers; else only when oversize", () => {
  const hint = parseSplitHint("2x 600mm awnings");
  assert.equal(shouldPropose({ widthMm: 900 }, hint, 1300), true, "comment forces a proposal");
  assert.equal(shouldPropose({ widthMm: 900 }, null, 1300), false, "in-range, no comment ⇒ no split");
  assert.equal(shouldPropose({ widthMm: 2050 }, null, 1300), true, "oversize ⇒ propose");
});

// ── Area-weighted composite Uw ───────────────────────────────────────────────
test("composite Uw is area-weighted across the segments (same glass by default)", () => {
  // awning 600×2100 (Uw 3.0) + fixed 2000×2100 (Uw 2.4) + awning 600×2100 (Uw 3.0).
  const uw = compositeAveragedUw([
    { widthMm: 600, heightMm: 2100, uValue: 3.0 },
    { widthMm: 2000, heightMm: 2100, uValue: 2.4 },
    { widthMm: 600, heightMm: 2100, uValue: 3.0 },
  ]);
  // areas: 1.26M, 4.2M, 1.26M (share the height) → weighted mean.
  const expected = (600 * 3.0 + 2000 * 2.4 + 600 * 3.0) / 3200; // height cancels
  assert.ok(Math.abs(uw - expected) < 1e-6, `${uw} vs ${expected}`);
  assert.ok(uw > 2.4 && uw < 3.0, "between the fixed and awning Uws, weighted to the larger fixed");
});

test("composite Uw is null when no segment carries a Uw", () => {
  assert.equal(compositeAveragedUw([{ widthMm: 600, heightMm: 2100, uValue: null }]), null);
});

// ── An architect who spells out the make-up must not be punished for it ──────
// layoutFromHint dropped every `fixed` unit on the reasoning that the lite is
// "derived, not placed". True when the comment names only the operable units;
// wrong when it names the whole sequence. The result was that saying the answer
// out loud produced a WORSE plan than saying nothing.

test("a stated fixed lite survives into the layout, in the stated order", () => {
  const h = parseSplitHint("AWNING + FIXED + AWNING");
  const p = proposeSplit({ widthMm: 3200, heightMm: 1200, operationType: "awning" }, h, { maxWidthMm: 1300 });
  assert.equal(p.basis, "schedule_comment");
  assert.deepEqual(p.segments.map((s) => s.operation), ["awning", "fixed", "awning"],
    "three units, in the order written — it used to yield two awnings and no lite");
  assert.equal(p.segments.reduce((n, s) => n + s.widthMm, 0), 3200, "partitions the opening exactly");
});

test("naming only the operable units still derives the lite, as before", () => {
  // The behaviour that already worked must not regress: this comment says
  // nothing about a fixed panel, so the remainder becomes one.
  const p = proposeSplit({ widthMm: 3200, heightMm: 1200, operationType: "awning" },
    parseSplitHint("2x 600mm WIDE AWNINGS"), { maxWidthMm: 1300 });
  assert.deepEqual(p.segments.map((s) => `${s.operation}:${s.widthMm}`),
    ["awning:600", "fixed:2000", "awning:600"]);
});

test("a bare width no longer erases the unit it belongs to", () => {
  // `\d+\s*mm?` required at least one letter, so "AWNING 900" kept its number,
  // failed the whole-token operation match and was discarded — leaving a
  // one-unit hint that fell through to an even split of the wrong thing.
  const h = parseSplitHint("AWNING 900 + FIXED + AWNING 900");
  assert.deepEqual(h.units.map((u) => u.operation), ["awning", "fixed", "awning"]);
  assert.deepEqual(parseSplitHint("AWNING 900mm + FIXED + AWNING 900mm").units.map((u) => u.operation),
    ["awning", "fixed", "awning"], "and the mm form still works");
});

test("a fixed-only comment still declines, leaving the caller's default", () => {
  const p = proposeSplit({ widthMm: 3200, heightMm: 1200, operationType: "awning" },
    parseSplitHint("FIXED"), { maxWidthMm: 1300 });
  assert.equal(p.basis, "default_even", "one unit is not a split");
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE PARSER READS FRAGMENTS, NOT WHOLE TOKENS
//
// Every case below was a LIVE silent unit loss: the comment parsed, the opening
// was split, and the customer got a make-up the architect never asked for. The
// cause was one rule — the cleaned fragment had to BE the operation, exactly —
// so a full stop, a label, a product code or a bare width erased the unit that
// carried it.
// ═══════════════════════════════════════════════════════════════════════════════

const shapeOf = (comment, width = 3200, maxWidthMm = 1300, operationType = "awning") =>
  proposeSplit({ operationType, widthMm: width, heightMm: 2100 }, parseSplitHint(comment), { maxWidthMm })
    .segments.map((s) => `${s.operation}:${s.widthMm}`).join(" | ");

const THREE_EVEN = "awning:1066 | fixed:1066 | awning:1068";

test("punctuation around a stated make-up does not delete a unit", () => {
  // "AWNING + FIXED + AWNING." parsed as TWO units — the full stop killed the
  // last one — and the customer got fixed glass at a jamb the architect had put
  // an awning on.
  for (const comment of [
    "AWNING + FIXED + AWNING.",
    "AWNING + FIXED + AWNING;",
    "AWNING + FIXED + AWNING - OBSCURE GLASS",
    "(AWNING + FIXED + AWNING)",
  ]) {
    assert.equal(shapeOf(comment), THREE_EVEN, comment);
  }
});

test("a leading tag or label does not delete the FIRST unit", () => {
  // "W04: AWNING + FIXED + AWNING" came out as fixed:2000 | awning:1200 —
  // wrong count AND inverted shape.
  for (const comment of [
    "W04: AWNING + FIXED + AWNING",
    "TYPE A - AWNING + FIXED + AWNING",
    "NOTE AWNING + FIXED + AWNING",
  ]) {
    assert.equal(shapeOf(comment), THREE_EVEN, comment);
  }
});

test("a product code or a bare width beside the operation keeps the operation", () => {
  // The docstring's own example, "2 x 600 AWNING + FIXED", produced `fixed`
  // alone and fell through to three awnings — no lite at all.
  assert.equal(shapeOf("2 x 600 AWNING + FIXED"), "awning:600 | awning:600 | fixed:2000");
  assert.equal(shapeOf("AMJ100T AWNING + FIXED"), "awning:1600 | fixed:1600");
  assert.equal(shapeOf("AMJ80 AWNING 900 + AMJ80 FIXED"), "awning:900 | fixed:2300");
  // "sliding door" is not in the vocabulary; "sliding" is, and it is in there.
  assert.equal(shapeOf("SLIDING DOOR + FIXED", 3200, 1300, "sliding"), "sliding:1600 | fixed:1600");
  // The wording our OWN extraction prompt shows the model as an example.
  assert.equal(shapeOf("600 awn / fix / 600 awn"), "awning:600 | fixed:2000 | awning:600");
});

test("a stated width is HONOURED, not merely survived", () => {
  // The previous fix kept the units and threw the numbers away: every stated
  // width produced the same 1066|1066|1068, because Pattern B hardcoded a null
  // width. The architect's 900s are the whole point of writing them down.
  assert.equal(shapeOf("AWNING 900 + FIXED + AWNING 900"), "awning:900 | fixed:1400 | awning:900");
  assert.equal(shapeOf("AWNING 500 + FIXED + AWNING 500"), "awning:500 | fixed:2200 | awning:500");
  assert.equal(shapeOf("AWNING 900mm + FIXED + AWNING 900mm"), "awning:900 | fixed:1400 | awning:900");
});

test("a stated MAKE-UP outlives the product maximum; a stated COUNT does not", () => {
  // The distinction is the point. "AWNING + FIXED" names which units exist, so
  // an unbuildable 1600mm awning is shown and flagged at review rather than
  // silently replaced — declining here would have returned three awnings and no
  // lite for a comment that parsed perfectly.
  assert.equal(shapeOf("AMJ100T AWNING + FIXED"), "awning:1600 | fixed:1600");
  // "2 x AWNING" names only a count, and nothing is lost by declining: the even
  // split gives the SAME operation in units that can actually be made.
  for (const comment of ["2 x AWNING", "AWNING x2", "2x AWNING", "2 No. AWNING"]) {
    assert.equal(shapeOf(comment), "awning:1066 | awning:1066 | awning:1068", comment);
  }
});

test("both spaced aliases parse — they were unreachable", () => {
  // "tilt&turn" was the only authored spelling, and normOp collapses whitespace
  // without removing it, so "TILT & TURN" matched nothing. "DOUBLE HUNG" had no
  // spaced form at all. Both silently dropped the operable unit.
  for (const [comment, ops] of [
    ["DOUBLE HUNG + FIXED", ["double-hung", "fixed"]],
    ["TILT & TURN + FIXED", ["tilt-turn", "fixed"]],
    ["TILT AND TURN + FIXED", ["tilt-turn", "fixed"]],
    ["BI-FOLD + FIXED", ["bifold", "fixed"]],
  ]) {
    assert.deepEqual(parseSplitHint(comment).units.map((u) => u.operation), ops, comment);
  }
});

test("a glazing note is not a split, and one unit is not a split", () => {
  // Reading the operation INSIDE a fragment is what makes the cases above work,
  // and it is exactly what could start finding windows in prose. The generic
  // noun is held back for that reason, and a single unit is refused outright —
  // otherwise a line noted "FIXED" would force a proposal on an in-range opening
  // and saw a perfectly normal 900mm window in half.
  for (const comment of [
    "clear glass, restrictor stays",
    "obscure glass to windows",
    "obscure glass to windows, restrictor to frame",
    "FIXED",
    "clear glass",
  ]) {
    assert.equal(parseSplitHint(comment), null, comment);
  }
  assert.equal(shouldPropose({ widthMm: 900 }, parseSplitHint("FIXED"), 1300), false,
    "an in-range window with a one-word note stays whole");
});

test("a stacked comment yields no hint rather than a confident sideways one", () => {
  // Everything here partitions the WIDTH. A highlight over a fixed pane
  // partitions the HEIGHT, which this parser cannot express — so it declines
  // instead of stating a wrong make-up with full confidence.
  for (const comment of ["AWNING ABOVE FIXED", "FIXED + AWNING HIGHLIGHT ABOVE", "FIXED WITH HIGHLIGHT OVER"]) {
    assert.equal(parseSplitHint(comment), null, comment);
  }
});

// ── The count is untrusted document text ─────────────────────────────────────

test("an absurd count is refused outright, not allocated", () => {
  // parseSplitHint is fed raw `l.notes`. This measured 1.1 GB of heap and then
  // an uncaught RangeError on a 128 MB Worker — and the case just below the
  // throw was worse, because it SUCCEEDED: 20,000 segments in 4ms, each of which
  // the estimator then ran a product selection for.
  for (const comment of ["9999999 x 600mm AWNINGS", "20000 x 600mm AWNINGS", "99 x 400mm AWNINGS"]) {
    assert.equal(parseSplitHint(comment), null, comment);
  }
  // A credible count still parses.
  assert.equal(parseSplitHint("6 x 400mm AWNINGS").units[0].count, 6);
});

test("a misread opening width cannot ask for thousands of units either", () => {
  // A metre value read as millimetres, or an OCR slip, reaches the even split as
  // a real number. 1e9 / 1300 is 769,231 segments.
  const p = proposeSplit({ operationType: "awning", widthMm: 1e9, heightMm: 2100 }, null, { maxWidthMm: 1300 });
  assert.ok(p.segments.length <= 12, `${p.segments.length} segments`);
  assert.equal(p.segments.reduce((n, s) => n + s.widthMm, 0), 1e9, "still partitions exactly");
});

test("evenWidths refuses a degenerate count instead of building a hole", () => {
  assert.deepEqual(evenWidths(3200, 0), []);
  assert.deepEqual(evenWidths(3200, -1), []);
  assert.deepEqual(evenWidths(3200, Infinity), []);
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE FAMILY'S DEFAULT PAIRING, REACHABLE AT LAST
//
// W1 of a real plan set — 2050 × 2100, an awning against a 1300mm maximum — was
// delivered as TWO 1025mm awnings. The rule that says otherwise had been
// authored in Sanity (awning-window → fixed-window) and was correct; the
// estimator simply never received it. Three links were missing: the candidate
// query did not project it, proposeSplit had no parameter for it, and nothing
// called the pairing module. These pin the wiring, not the arithmetic —
// pairing.test.mjs owns the arithmetic.
// ═══════════════════════════════════════════════════════════════════════════════

// Exactly what the owner authored: an infill family and nothing else. Every
// other knob is absent on purpose, so these also prove the defaults hold.
const AUTHORED = { infillFamilySlug: "fixed-window", infillOperation: "fixed" };
const LIVE = { infillMaxWidthMm: 3000, maxSegments: 4 };
const paired = (widthMm, opts = {}) => proposeSplit(
  { operationType: "awning", widthMm, heightMm: 2100 }, null,
  { maxWidthMm: 1300, pairing: { rule: AUTHORED, ...LIVE, ...opts } },
);

test("W1: 2050 becomes an awning and a lite, not two awnings", () => {
  const p = paired(2050);
  assert.equal(p.basis, "default_pairing");
  // A half, which is the range's measured typical make-up — not the widest
  // frame the family makes, which put 1300 beside 750 and asked nobody.
  assert.deepEqual(p.segments.map((s) => `${s.operation}:${s.widthMm}`), ["awning:1025", "fixed:1025"]);
  assert.equal(p.segments.reduce((n, s) => n + s.widthMm, 0), 2050, "partitions the opening exactly");
  assert.equal(p.reviewRequired, true, "a proposal is always a starting point");
});

test("OFFSET reaches the pairing module — the fourth missing link", () => {
  // The same failure as the three above, one layer further in. estimate.ts read
  // "OFFSET AWNING" off the schedule and passed `offset` into proposeSplit; the
  // options type did not declare it and the literal handed to the pairing module
  // did not carry it, so the word `offset` appeared nowhere in split.ts. tsc said
  // so (TS2353) and the reduced gate let it through.
  //
  // Nothing looked broken: an offset unit simply came out as a straight half.
  // The whole authored chain below it was dead — offsetOperableRatio is defined
  // in the Sanity schema, projected by the GROQ query, typed on the client and
  // read by pairing.ts, and no value an editor typed could reach a proposal.
  const plain = paired(2000).segments.map((s) => s.widthMm);
  assert.deepEqual(plain, [1000, 1000], "no offset: the range's typical straight half");

  const offset = paired(2000, { offset: true }).segments.map((s) => s.widthMm);
  assert.notDeepEqual(offset, plain, "OFFSET must not resolve to the same geometry as plain");
  assert.ok(offset[0] < offset[1], "the opening pane is the SMALLER share on an offset unit");
  assert.equal(offset[0] + offset[1], 2000, "still partitions the opening exactly");

  // And the authored ratio wins over the default when a family states one.
  const authored = proposeSplit(
    { operationType: "awning", widthMm: 2000, heightMm: 2100 }, null,
    { maxWidthMm: 1300, pairing: { rule: { ...AUTHORED, offsetOperableRatio: 0.4 }, ...LIVE, offset: true } },
  ).segments.map((s) => s.widthMm);
  assert.deepEqual(authored, [800, 1200], "offsetOperableRatio is honoured, not merely declared");
});

test("the role becomes the INFILL family's operation, never the opening's", () => {
  // The pairing module names roles and knows nothing about the catalogue; this
  // is the one place a role becomes an operation. Getting it wrong would price a
  // fixed lite as another awning — invisible, because the geometry looks right.
  const seg = paired(2050).segments;
  assert.equal(seg[0].operation, "awning", "the opening's own operation");
  assert.equal(seg[1].operation, "fixed", "the operation of the family the rule names");
});

test("a document still outranks the family", () => {
  // The pairing is the WEAKEST claim. W4 of the same set carried a comment, and
  // that comment must survive the arrival of a family default beneath it.
  const p = proposeSplit({ operationType: "awning", widthMm: 3200, heightMm: 2100 },
    parseSplitHint("2x 600mm WIDE AWNINGS"),
    { maxWidthMm: 1300, pairing: { rule: AUTHORED, ...LIVE } });
  assert.equal(p.basis, "schedule_comment");
  assert.deepEqual(p.segments.map((s) => s.widthMm), [600, 2000, 600]);
});

test("an unauthored family is left exactly as it was", () => {
  // Every family but one. This is the no-op that lets the feature ship without
  // changing anything an editor has not asked for.
  for (const rule of [null, undefined, {}, { infillFamilySlug: "fixed-window" }]) {
    const p = proposeSplit({ operationType: "awning", widthMm: 2050, heightMm: 2100 }, null,
      { maxWidthMm: 1300, pairing: { rule, ...LIVE } });
    assert.equal(p.basis, "default_even", JSON.stringify(rule));
  }
  // `infillOperation` missing is the one that would look authored but cannot be
  // acted on — a role could not be turned into an operation.
  assert.equal(paired(2050, {}).basis, "default_pairing");
});

test("no pairing information at all is the old behaviour, untouched", () => {
  const p = proposeSplit({ operationType: "awning", widthMm: 2050, heightMm: 2100 }, null, { maxWidthMm: 1300 });
  assert.equal(p.basis, "default_even");
  assert.deepEqual(p.segments.map((s) => s.widthMm), [1025, 1025]);
});

test("the pairing needs the infill family's width, and declines without it", () => {
  // The rule names a family; it cannot size that family's panel. Without the
  // width the arithmetic has no floor, so it must not guess.
  assert.equal(paired(2050, { infillMaxWidthMm: null }).basis, "default_even");
  assert.equal(paired(2050, { infillMaxWidthMm: 0 }).basis, "default_even");
});

test("the composite cap is the policy's, not the proposer's safety bound", () => {
  // A pairing that exceeds the real cap would be built here and then refused by
  // validateSplit, which reads to the customer as no split at all.
  const p = paired(2050, { maxSegments: 1 });
  assert.equal(p.basis, "default_even", "one unit cannot hold a pairing");
});

test("an opening that fits one frame is still not split", () => {
  const p = proposeSplit({ operationType: "awning", widthMm: 1200, heightMm: 2100 }, null,
    { maxWidthMm: 1300, pairing: { rule: AUTHORED, ...LIVE } });
  // proposeSplit always returns a proposal; the caller drops it below 2 segments.
  // What matters is that the family default did not manufacture a reason to split.
  assert.equal(p.basis, "default_even");
});

// ── Splits as candidates (D7) ───────────────────────────────────────────────
//
// AC-18 is the criterion this whole phase turns on: a split may never be
// conjured to meet a thermal band. "Awning + fixed" meets an awning's band more
// easily than an awning does, because a fixed lite is thermally better — so if
// thermal could open the gate, the estimator would learn to split its way out of
// every requirement it could not otherwise meet.
//
// The guarantee is structural, not a check: the eligibility function has no
// parameter through which a requirement, a deviation or a tier could arrive.
// There is nothing to get wrong later, because there is nothing to read.
test("AC-17/18/19 splits are eligible on a hint or a dimensional failure, and on nothing else", () => {
  const row = (fits, passed = true) => ({ outcome: { passed }, fit: { fits } });
  const hint = { units: [{ operation: "awning", count: 2, widthMm: 600 }], raw: "2x 600mm AWNINGS" };

  // (a) nothing fits ⇒ eligible. This is the only reason the machine may invent
  // a split on its own initiative.
  assert.equal(splitsAreEligible(null, { rows: [row(false), row(false)] }), true);
  // (b) the drawings implied one ⇒ eligible even though a single unit fits.
  assert.equal(splitsAreEligible(hint, { rows: [row(true)] }), true);
  // AC-18: a single unit fits and no document asked for a split ⇒ NOT eligible,
  // whatever the thermal picture is. The function cannot see a requirement.
  assert.equal(splitsAreEligible(null, { rows: [row(true), row(false)] }), false);
  assert.equal(splitsAreEligible.length, 2, "hint and evaluation — no requirement parameter exists");

  // A candidate that FITS but failed a hard constraint has not shown the opening
  // can be served by one unit, so it does not close the gate.
  assert.equal(splitsAreEligible(null, { rows: [row(true, false)] }), true);
  // No candidates at all is a catalogue problem, not a dimensional one — but it
  // is also not evidence a single unit fits, so a split may still be tried.
  assert.equal(splitsAreEligible(null, { rows: [] }), true);
});

// ── The candidate set a split enters (AC-17, AC-20, E15) ────────────────────
//
// A fixture catalogue and a real `selectWithSplits` run. What is being proven
// here is not that a split gets built — the old post-pass did that — but that it
// is a CANDIDATE: tiered, ranked and priced by the same ladder as every single
// unit, in one pass, with no pick made before it arrived.

const glass = (slug, uValue, shgc) => ({
  variantId: slug, glazingOptionSlug: slug,
  glazingClass: slug.startsWith("dg") ? "double_clear" : "single_clear",
  uValue, shgc, frameType: "aluminium", frameTechnology: "conventional",
  certificationRef: "WERS-1", pricingOptionSlugs: [], dataSource: "certified",
  certified: true, published: true,
});
const DG = glass("dg", 3.6, 0.45);
const SG = glass("sg", 5.4, 0.60);

const splitProduct = (slug, { operation, maxWidthMm, glasses = [DG, SG], system = "sys-80" }) => ({
  sanityProductId: `id-${slug}`, catalogueRevision: "rev1", schemaVersion: 1,
  name: slug, slug, family: "windows", series: `${operation}-window`,
  configuration: { operationTypes: [operation] },
  frameSystem: { slug: system, name: system, compatibleWith: [] },
  dimensionRule: { minWidthMm: 300, maxWidthMm, minHeightMm: 300, maxHeightMm: 3000, maxAreaM2: null, maxAspectRatio: null, ruleVersion: "v1" },
  performanceVariants: glasses.map((g) => ({ ...g })),
  optionGroups: [], pricingRef: slug,
});

const splitRepo = (products) => ({
  async queryCandidates(category, operation) {
    return products.filter((c) => (!category || c.family === category)
      && (!operation || c.configuration.operationTypes.includes(operation)));
  },
  catalogueVersion() { return "cat-v1"; },
});

/** Price by m², so a split of the same opening is not automatically cheaper or
 *  dearer than one unit covering it — the comparison stays about the products. */
const splitPrice = (perM2 = {}) => async (candidate, opening) => {
  const rate = perM2[candidate.slug] ?? 400;
  const area = ((opening.widthMm ?? 0) * (opening.heightMm ?? 0)) / 1_000_000;
  const total = Math.round(rate * area * 100) / 100;
  return { ok: true, unit: total, total, currency: "AUD", rateCardId: "r", rateCardVersion: "v1", pricingPolicyVersion: "v1" };
};

const splitCtx = (products, over = {}) => ({
  repo: splitRepo(products),
  priceFn: splitPrice(over.perM2 ?? {}),
  pairing: null,
  section: "window",
  primaryCategory: "windows",
  alternateCategory: null,
  maxSegments: 4,
  ...over,
});

test("AC-17 a split ENTERS the ranked set — it is not a rework of a pick already made", async () => {
  // 3,600 mm wide: no awning frame is made that size, so the machine may propose
  // a split on its own initiative (AC-17's opener is dimensional).
  const products = [splitProduct("amj-awn", { operation: "awning", maxWidthMm: 1300 })];
  const r = await selectWithSplits(
    { family: "windows", operationType: "awning", widthMm: 3600, heightMm: 2100, externalRef: "W07" },
    null, splitCtx(products),
  );

  assert.ok(r.splits.length, "split candidates were generated");
  assert.ok(r.selectedSplit, "and one of them won");
  assert.equal(r.selected, null, "a split won, so no single unit did — never both");

  // It was tiered and ranked by the SAME ladder, in the same numbering as the
  // single units it beat. Its verdict is a CandidateOutcome like any other.
  const o = r.selectedSplit.candidateOutcome;
  assert.equal(o.form, "split");
  assert.equal(o.rank, 1);
  assert.equal(o.selected, true);
  assert.equal(o.competing, true);
  assert.equal(o.fit.fits, true, "the split is what makes this opening fit");
  assert.equal(o.price.deltaToSelected, 0, "the pick is its own baseline");
  assert.ok(o.units.length >= 2, "and it says what it is made of");
  assert.equal(o.units.reduce((sum, u) => sum + u.widthMm, 0), 3600, "the units partition the opening");

  // E15: the single unit that lost is still a persisted candidate in the same
  // run — two forms of the same product, no deduplication that would hide one.
  const singles = r.evaluated.map((e) => e.candidateOutcome);
  assert.ok(singles.length, "the single-unit candidates are still here");
  assert.ok(singles.every((s) => s.form === "single"));
  // Every single unit is oversize, so fit — which is hard — excludes them all;
  // the split is the only thing that actually serves the opening.
  assert.ok(singles.every((s) => s.fit.fits === false));
  assert.ok(singles.every((s) => !s.selected));
  // Ranks are dense and shared across BOTH forms: one competition, one ordering.
  const ranks = [o.rank, ...singles.map((s) => s.rank)].filter((x) => x != null).sort((a, b) => a - b);
  assert.deepEqual(ranks, ranks.map((_, i) => i + 1));
});

test("AC-18 a split is NEVER conjured to meet a thermal band", async () => {
  // The exploit this criterion exists to close. A single awning fits the opening
  // dimensionally but misses the band (Uw 3.6 against a 3.0 cap). A fixed lite is
  // thermally better, so an "awning + fixed" split would average to 3.0 and meet
  // it exactly — and if thermal could open the gate, the machine would quote a
  // mullion nobody asked for, every time it could not otherwise comply.
  const products = [
    splitProduct("amj-awn", { operation: "awning", maxWidthMm: 2400, glasses: [glass("dg", 3.6, 0.45)] }),
    splitProduct("amj-fixed", { operation: "fixed", maxWidthMm: 2400, glasses: [glass("dg", 2.4, 0.45)] }),
  ];
  const opening = {
    family: "windows", operationType: "awning", widthMm: 2000, heightMm: 1000,
    requirements: { maxUValue: 3.0 }, externalRef: "W08",
  };
  const r = await selectWithSplits(opening, null, splitCtx(products));

  assert.deepEqual(r.splits, [], "no split candidate exists at all");
  assert.equal(r.selectedSplit, null);
  assert.ok(r.selected, "the single unit is the answer");
  assert.equal(r.selected.candidate.slug, "amj-awn");
  // And it is honestly reported as missing the band, not quietly rescued.
  assert.ok(["within_tolerance", "misses"].includes(r.selected.candidateOutcome.tier));
  assert.ok(r.selected.candidateOutcome.thermal.normalisedDeviation > 0);
});

test("AC-19 a drawing instruction lets a split compete on an opening one unit fits", async () => {
  const products = [
    splitProduct("amj-awn", { operation: "awning", maxWidthMm: 2400 }),
    splitProduct("amj-fixed", { operation: "fixed", maxWidthMm: 2400 }),
  ];
  const opening = { family: "windows", operationType: "awning", widthMm: 2000, heightMm: 1000, externalRef: "W09" };
  const hint = parseSplitHint("AWNING + FIXED");

  const without = await selectWithSplits(opening, null, splitCtx(products));
  assert.deepEqual(without.splits, [], "no instruction, one unit fits ⇒ no split");

  const withHint = await selectWithSplits(opening, hint, splitCtx(products));
  assert.ok(withHint.splits.length, "the comment put a split in the running");
  // It COMPETES — it is not automatically the answer. Both forms are ranked, and
  // the single unit is still a live, priced, selectable candidate.
  const single = withHint.evaluated.find((e) => e.candidate.slug === "amj-awn");
  assert.notEqual(single.candidateOutcome.rank, null);
  assert.equal(single.candidateOutcome.fit.fits, true);
  const ranks = [
    ...withHint.evaluated.map((e) => e.candidateOutcome.rank),
    ...withHint.splits.map((s) => s.candidateOutcome.rank),
  ].filter((x) => x != null).sort((a, b) => a - b);
  assert.deepEqual(ranks, ranks.map((_, i) => i + 1), "one dense ranking over both forms");
});

test("D1 drawing evidence becomes a 925 mm hinged door plus 455 mm sidelight composite", async () => {
  const door = {
    ...splitProduct("amj80t-casement-door", { operation: "hinged", maxWidthMm: 1_300 }),
    family: "doors", series: "hinged-door",
  };
  const fixed = splitProduct("amj80st-fixed-window", { operation: "fixed", maxWidthMm: 3_000 });
  const { hint } = resolveMakeUp("D1", {
    reading: {
      splitState: "value", axis: "vertical",
      units: [{ role: "operable", ratio: 0.67 }, { role: "passive", ratio: 0.33 }],
    },
    commentHint: null, typeText: "HINGED", fallbackOp: "hinged",
    energyComponents: null, energyAxis: "vertical",
  });
  const result = await selectWithSplits(
    { family: "doors", operationType: "hinged", widthMm: 1_380, heightMm: 2_405, externalRef: "D1" },
    hint,
    splitCtx([door, fixed], { section: "door", primaryCategory: "doors", alternateCategory: "windows" }),
  );

  assert.ok(result.selectedSplit);
  assert.deepEqual(result.selectedSplit.plan.map((unit) => unit.segment.widthMm), [925, 455]);
  assert.deepEqual(result.selectedSplit.units.map((unit) => unit.result.selected.candidate.slug), [
    "amj80t-casement-door", "amj80st-fixed-window",
  ]);
});

test("AC-20 a split is priced as the SUM of its units and measured as their averaged cell", async () => {
  // The spec's worked example: two 1 m² units at $700 and $500, Uw 3.6 and 4.4,
  // against a 4.0 cap. The averaged cell is exactly 4.0, so the make-up MEETS a
  // band neither of its units meets alone — which is correct, and is why the
  // gate that decides whether a split may exist is nowhere near this arithmetic.
  const products = [
    splitProduct("awn-36", { operation: "awning", maxWidthMm: 1200, glasses: [glass("dg", 3.6, 0.45)] }),
    splitProduct("fix-44", { operation: "fixed", maxWidthMm: 1200, glasses: [glass("dg", 4.4, 0.45)] }),
  ];
  const r = await selectWithSplits(
    { family: "windows", operationType: "awning", widthMm: 2000, heightMm: 1000, requirements: { maxUValue: 4.0 }, externalRef: "W10" },
    parseSplitHint("AWNING + FIXED"),
    splitCtx(products, { perM2: { "awn-36": 700, "fix-44": 500 } }),
  );

  assert.ok(r.selectedSplit, "the split is the answer here");
  const o = r.selectedSplit.candidateOutcome;
  assert.equal(o.price.total, 1200, "the sum of its units, not one of them");
  assert.equal(o.thermal.normalisedDeviation, 0, "the averaged cell meets the band");
  assert.equal(o.tier, "meets");
  assert.deepEqual(o.units.map((u) => u.productSlug), ["awn-36", "fix-44"]);
  assert.deepEqual(o.units.map((u) => u.widthMm), [1000, 1000]);
  // Neither unit alone meets 4.0 in the way the make-up does — the fixed lite
  // misses it outright, and the make-up is still the honest answer.
  assert.equal(r.selectedSplit.units.length, 2);
});

test("A2 a lite with no figure makes the whole split unknown, never thermally better", async () => {
  // The failure this guards. `compositeAveragedUw`/`Shgc` average only the units
  // they HAVE a figure for, so a make-up with one blank lite would report the
  // other lite's number as the composite's — a data gap reading as a thermal
  // advantage, and enough to beat a single unit that was honestly measured and
  // honestly missed.
  //
  // Reachable exactly as production reaches it: the schedule says "double
  // glazed", which is a HARD instruction, so the awning unit can only be built
  // from the one double-glazed variant its product publishes — and that variant
  // has no SHGC. The product is still offerable, because a different variant of
  // it is fully described.
  const products = [
    splitProduct("awn-mix", { operation: "awning", maxWidthMm: 1200, glasses: [
      glass("sg-good", 5.0, 0.50),          // quotable, but single-glazed
      { ...glass("dg-blank", 3.0, 0.50), shgc: null },  // the only double glazing
    ] }),
    splitProduct("fix-good", { operation: "fixed", maxWidthMm: 1200, glasses: [glass("dg-good", 3.0, 0.50)] }),
    // The honest single unit: it fits, it is measured, and it MISSES the floor.
    // Its own frame system, so it can never join the make-up and rescue it.
    splitProduct("awn-whole", { operation: "awning", maxWidthMm: 2400, system: "sys-99",
      glasses: [glass("dg-whole", 3.0, 0.35)] }),
  ];
  const r = await selectWithSplits(
    {
      family: "windows", operationType: "awning", widthMm: 2000, heightMm: 1000,
      requirements: { minShgc: 0.40 },
      scheduleRequirements: { doubleGlazed: true },
      externalRef: "W11",
    },
    parseSplitHint("AWNING + FIXED"),
    splitCtx(products),
  );

  assert.ok(r.splits.length, "the split candidates exist");
  for (const split of r.splits) {
    assert.equal(split.deviation.scalar, null, "unknown is contagious across the make-up");
    assert.equal(split.candidateOutcome.tier, "thermal_unknown");
    assert.equal(split.candidateOutcome.thermal.normalisedDeviation, null);
    assert.equal(split.candidateOutcome.competing, false);
  }
  // Tier D sits below every measurable deviation, so the honestly-measured
  // single unit wins even though it MISSES the requirement. A gap is not a
  // result, and it must never out-rank one.
  assert.ok(r.selected, "the measured single unit is the answer");
  assert.equal(r.selected.candidate.slug, "awn-whole");
  assert.ok(r.selected.candidateOutcome.thermal.normalisedDeviation > 0, "…and it is honestly a miss");
  assert.equal(r.selectedSplit, null);
});

test("E15 a product appearing in both forms is two candidates, and neither is hidden", async () => {
  const products = [
    splitProduct("amj-awn", { operation: "awning", maxWidthMm: 2400 }),
    splitProduct("amj-fixed", { operation: "fixed", maxWidthMm: 2400 }),
  ];
  const r = await selectWithSplits(
    { family: "windows", operationType: "awning", widthMm: 2000, heightMm: 1000, externalRef: "W12" },
    parseSplitHint("AWNING + FIXED"),
    splitCtx(products),
  );

  const singleAwnings = r.evaluated.filter((e) => e.candidate.slug === "amj-awn");
  assert.ok(singleAwnings.length, "amj-awn stands alone as a candidate");
  assert.ok(r.splits.some((s) => s.candidateOutcome.units.some((u) => u.productSlug === "amj-awn")),
    "…and appears again inside a make-up");
  // Two distinct rows with distinct forms. No deduplication hides either from
  // the reviewer, because "why not the cheaper one?" has to stay answerable.
  const forms = [
    ...r.evaluated.map((e) => e.candidateOutcome.form),
    ...r.splits.map((s) => s.candidateOutcome.form),
  ];
  assert.ok(forms.includes("single") && forms.includes("split"));
});

test("the family's authored pairing decides the geometry, resolved from the representative", async () => {
  // The pairing rule and the infill family's widest frame are BOTH needed to
  // size a panel, and neither is on the opening — they hang off the product this
  // opening would otherwise have been built from, and the infill width is a
  // catalogue lookup. So the geometry seed is resolved from the representative,
  // once, and handed in. A default even split would have produced three equal
  // 1200 mm units here; the authored pairing produces an operable pane and one
  // panel, which is what the family actually makes.
  const products = [
    splitProduct("amj-awn", { operation: "awning", maxWidthMm: 1300 }),
    splitProduct("amj-fixed", { operation: "fixed", maxWidthMm: 2600 }),
  ];
  products[0].defaultSplit = { infillFamilySlug: "fixed-window", infillOperation: "fixed", operableRatio: 0.25 };

  let sawRepresentative = null;
  const r = await selectWithSplits(
    { family: "windows", operationType: "awning", widthMm: 3600, heightMm: 2100, externalRef: "W13" },
    null,
    splitCtx(products, {
      async resolvePairing(representative) {
        sawRepresentative = representative?.candidate.slug ?? null;
        return { rule: products[0].defaultSplit, infillMaxWidthMm: 2600, maxSegments: 4 };
      },
    }),
  );

  assert.equal(sawRepresentative, "amj-awn", "the pairing was resolved from the product this opening would have used");
  assert.ok(r.selectedSplit, "the pairing produced a buildable make-up");
  const widths = r.selectedSplit.candidateOutcome.units.map((u) => u.widthMm);
  assert.equal(widths.reduce((a, b) => a + b, 0), 3600, "the units still partition the opening exactly");
  assert.notDeepEqual(widths, [1200, 1200, 1200], "…and NOT by the even-split fallback");
});

test("resolvePairing reads the rule off the representative and the width off the infill family", async () => {
  // Two things are needed to size a panel and NEITHER is on the opening: the
  // rule (which family supplies the infill) hangs off the product this opening
  // would otherwise have been built from, and the widest frame THAT family makes
  // is a catalogue lookup. Getting the width wrong invents a mullion the
  // manufacturer would not build.
  const rule = { infillFamilySlug: "fixed-window", infillOperation: "fixed", operableRatio: 0.25 };
  const infill = [
    { ...splitProduct("fix-narrow", { operation: "fixed", maxWidthMm: 1400 }), series: "fixed-window" },
    { ...splitProduct("fix-wide", { operation: "fixed", maxWidthMm: 2600 }), series: "fixed-window" },
    { ...splitProduct("fix-other", { operation: "fixed", maxWidthMm: 9000 }), series: "some-other-family" },
  ];
  const repo = { async queryCandidates() { return infill; }, catalogueVersion() { return "cat-v1"; } };
  const representative = {
    candidate: { family: "windows", defaultSplit: rule, dimensionRule: { maxWidthMm: 1300 } },
  };

  const pairing = await resolvePairing(repo, { representative, maxSegments: 4, offset: true });
  assert.equal(pairing.rule, rule);
  assert.equal(pairing.infillMaxWidthMm, 2600, "the WIDEST frame the infill family makes, not the first");
  assert.equal(pairing.maxSegments, 4, "the real policy cap, not the proposer's safety bound");
  assert.equal(pairing.offset, true);

  // A product whose family authored no pairing has no opinion, and asking the
  // catalogue about a rule that does not exist would be a wasted round trip.
  const none = await resolvePairing(repo, {
    representative: { candidate: { family: "windows", defaultSplit: null } },
    maxSegments: 4, offset: false,
  });
  assert.equal(none.rule, null);
  assert.equal(none.infillMaxWidthMm, null);
  // And no representative at all — nothing fit, nothing to read a rule from.
  const bare = await resolvePairing(repo, { representative: null, maxSegments: 4, offset: false });
  assert.equal(bare.rule, null);
});

test("splitSegmentSpecs rebuilds the WINNING make-up, unit by unit", async () => {
  // Materialisation is now the tail of a decision, not a decision of its own:
  // the make-up already won the ladder, and this only turns it into the segments
  // splitLine writes. Everything the old post-pass derived here — the product,
  // the glass, the inherited spec, the frozen configuration snapshot — comes off
  // the candidate that won.
  const products = [
    splitProduct("awn-36", { operation: "awning", maxWidthMm: 1200, glasses: [glass("dg", 3.6, 0.45)] }),
    splitProduct("fix-44", { operation: "fixed", maxWidthMm: 1200, glasses: [glass("dg", 4.4, 0.45)] }),
  ];
  const r = await selectWithSplits(
    { family: "windows", operationType: "awning", widthMm: 2000, heightMm: 1000, requirements: { maxUValue: 4.0 }, externalRef: "W14" },
    parseSplitHint("AWNING + FIXED"),
    splitCtx(products, { perM2: { "awn-36": 700, "fix-44": 500 } }),
  );
  assert.ok(r.selectedSplit, "a split won, so there is something to materialise");

  const specs = splitSegmentSpecs(r.selectedSplit, {
    inheritedOptions: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle" },
  });
  assert.equal(specs.length, 2);
  assert.deepEqual(specs.map((s) => s.productSlug), ["awn-36", "fix-44"]);
  assert.deepEqual(specs.map((s) => s.widthMm), [1000, 1000]);
  assert.deepEqual(specs.map((s) => s.selectedVariantId), ["dg", "dg"]);

  // Every unit INHERITS the opening's spec. Building them with no options
  // discarded the customer's colour and hardware and, because most option rows
  // carry a surcharge, re-priced the units as bare product.
  for (const s of specs) {
    assert.equal(s.options.colour, "Dover White");
    assert.equal(s.options.hardware, "AMJ Standard D Shape Handle");
    assert.equal(s.options.performanceVariantId, "dg");
  }

  // THE MACHINE'S OWN RECORD OF THIS UNIT, frozen at the moment it chose. A unit
  // never gets an ai_proposal_line — that table requires an opening_instance and
  // a unit has none — so without this there is no account of what was proposed
  // for it, and the thermal audit could only report a blank beside a unit whose
  // product it can plainly see on the line.
  assert.equal(specs[0].configurationSnapshot.productSlug, "awn-36");
  assert.equal(specs[0].configurationSnapshot.uw, 3.6);
  // WHY THIS FRAME AND NOT THE CHEAPER ONE: the unit was not chosen on its own
  // merits, it came out of the system picked for the whole opening — so the
  // frozen record names the system, or a reviewer has no account of the decision.
  assert.equal(specs[0].configurationSnapshot.frameSystem, "sys-80");
  assert.equal(specs[0].resolvedBand.maxUValue, 4.0);
  assert.equal(specs[0].requirementBasis, "schedule_comment");

  // The unit that MISSES its band is flagged for thermal review; the one that
  // meets it is not. Read from the unit's own verdict, not from a filter.
  assert.equal(specs[0].thermalReview, false, "3.6 meets a 4.0 cap");
  assert.equal(specs[1].thermalReview, true, "4.4 does not");
});

// ── Materialising the make-up that WON (design §7.3) ────────────────────────

/** A D1 stub that answers reads from a table and records every write. */
function scriptedDb(reads = {}) {
  const writes = [];
  const prepare = (sql) => ({
    sql,
    bind(...args) {
      this.args = args;
      return this;
    },
    async first() {
      for (const [pattern, value] of Object.entries(reads)) {
        if (sql.includes(pattern)) return value;
      }
      return null;
    },
    async run() { writes.push({ sql, args: this.args }); return { success: true }; },
    async all() { return { results: [] }; },
  });
  return { writes, DB: { prepare, async batch(stmts) { writes.push(...stmts.map((s) => ({ sql: s.sql, args: s.args }))); return []; } } };
}

test("a unit inherits the opening's options AS THEY ARE, on the estimator's split path too", async () => {
  // The mirror of the ops-path assertion in why-capture-api.test.mjs. Both
  // split routes build a unit's options from the PARENT'S STORED options_json,
  // and that column is written uncoerced — a customer's save puts whatever it
  // sent in there. Re-encoding a stored value on the way into a child row is
  // the fabrication this phase has now been bitten by three times.
  //
  // SCOPE, measured rather than assumed: `glazing` is NOT the probe here.
  // splitCandidates.ts:344-347 deliberately overwrites glassDescription,
  // performanceVariantId, frameTechnology and glazing with the unit's OWN
  // chosen variant — a split picks glass per unit. So this site cannot produce
  // a glass divergence, and cannot reach the figures at all (`glazingOf` reads
  // only `glazing`). What it corrupts is every OTHER inherited option: the
  // unit's colour, hardware, flyscreen and installation stop matching the
  // opening they were split out of.
  //
  // What hid it: `splitSegmentSpecs`' parameter said Record<string,string>
  // while the value it receives comes straight off a row. The type said
  // strings, so nobody looked.
  const products = [
    splitProduct("awn-36", { operation: "awning", maxWidthMm: 1200, glasses: [glass("dg", 3.6, 0.45)] }),
    splitProduct("fix-44", { operation: "fixed", maxWidthMm: 1200, glasses: [glass("dg", 4.4, 0.45)] }),
  ];
  const r = await selectWithSplits(
    { family: "windows", operationType: "awning", widthMm: 2000, heightMm: 1000, requirements: { maxUValue: 4.0 }, externalRef: "W21" },
    parseSplitHint("AWNING + FIXED"),
    splitCtx(products, { perM2: { "awn-36": 700, "fix-44": 500 } }),
  );
  assert.ok(r.selectedSplit, "a split won, so there is something to materialise");

  const env = scriptedDb({
    // The parent's own spec, with a non-string glass exactly as a client save
    // stores it. Two reads answer from here: materialiseSelectedSplit's own,
    // and applySplit's parent lookup.
    "SELECT options_json FROM quote_line": { options_json: '{"colour":5,"flyscreen":false}' },
    "parent_line_id IS NULL": {
      id: "ql1", project_id: "p1", qty: 1, line_kind: "simple", composite_axis: null,
      dims_json: '{"width":"2000","height":"1000"}',
      options_json: '{"colour":5,"flyscreen":false}',
    },
    "FROM composite_policy": { tolerance_mm: 5, default_joiner_mm: 0, max_segments: 6 },
  });
  await materialiseSelectedSplit(env, {
    openingId: "o1", quoteLineId: "ql1", externalRef: "W21",
    opening: { widthMm: 2000 }, result: r,
  });

  const inserts = env.writes.filter((w) => /INSERT INTO quote_line/.test(w.sql));
  assert.equal(inserts.length, 2, "both units were written");
  for (const unit of inserts) {
    const stored = unit.args.find((a) => typeof a === "string" && a.includes("colour"));
    assert.ok(stored, "the unit carries the opening's options");
    assert.match(stored, /"colour":5/,
      "inherited as stored, not re-encoded as the string \"5\" — a unit must be a faithful copy of the opening it came from");
    assert.match(stored, /"flyscreen":false/, "and a boolean stays a boolean");
    // The four keys the split OWNS are still the unit's own, not the opening's.
    assert.match(stored, /"glazing":"dg"/, "the unit's glass is its own chosen variant, as it should be");
  }
});

test("only a WINNING split is materialised — a losing one writes nothing", async () => {
  // The whole of D7 in one assertion. The old post-pass ran after publication
  // and reworked a pick already made; this runs only when the split beat every
  // single unit in the same ladder. An opening whose split candidates LOST
  // materialises nothing at all — and the losing make-ups stay persisted
  // candidates, so a reviewer can still see what was considered.
  const env = scriptedDb();
  const nothing = await materialiseSelectedSplit(env, {
    openingId: "o1", quoteLineId: "ql1", externalRef: "W07",
    opening: { widthMm: 3600 },
    result: { selectedSplit: null, splits: [{ key: "split::0" }], selected: { candidate: { slug: "amj-awn" } } },
  });
  assert.deepEqual(nothing, [], "no warning, because nothing was reworked");
  assert.deepEqual(env.writes, [], "and not one write escaped");
});

test("a REFUSED split leaves the line as its parent, and says why", async () => {
  // A refused split used to be dropped on the floor. The opening stays a single
  // line — a defensible outcome, and now an honestly ranked one, because the
  // losing single-unit candidates were persisted beside the split rather than
  // discarded when it won. What was missing is the telling: the one person who
  // could correct the make-up never learned there was anything to correct.
  const products = [
    splitProduct("awn-36", { operation: "awning", maxWidthMm: 1200, glasses: [glass("dg", 3.6, 0.45)] }),
    splitProduct("fix-44", { operation: "fixed", maxWidthMm: 1200, glasses: [glass("dg", 4.4, 0.45)] }),
  ];
  const r = await selectWithSplits(
    { family: "windows", operationType: "awning", widthMm: 2000, heightMm: 1000, externalRef: "W15" },
    parseSplitHint("AWNING + FIXED"),
    splitCtx(products),
  );
  assert.ok(r.selectedSplit, "a split won the ladder");

  // The parent line carries the customer's own spec — and splitLine refuses,
  // because by the time materialisation runs the line is gone.
  const env = scriptedDb({
    "SELECT options_json FROM quote_line": { options_json: '{"colour":"Dover White"}' },
    "FROM composite_policy": { tolerance_mm: 5, default_joiner_mm: 0, max_segments: 6 },
  });
  const warnings = await materialiseSelectedSplit(env, {
    openingId: "o1", quoteLineId: "ql1", externalRef: "W15",
    opening: { widthMm: 2000 }, result: r,
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^W15: the 2-unit make-up/, "the warning names the opening and the make-up");
  assert.match(warnings[0], /Left as a single unit for human review/);
  // …and the line itself carries the reason, so it surfaces without the run log.
  const flagged = env.writes.find((w) => /status='technical_review'/.test(w.sql));
  assert.ok(flagged, "the line is flagged");
  assert.equal(flagged.args[1], "ql1");
  assert.equal(JSON.parse(flagged.args[0]).composite, warnings[0]);
});

test("AC-8/E12 when no frame system can supply every unit, the reviewer is TOLD", async () => {
  // Combinability is hard (D3), so a make-up spanning two systems is never a
  // candidate — `enumerateMakeUps` cannot even produce one. The opening keeps
  // its honest single-unit answer, which for a 3,600 mm opening is the
  // last-resort tier-E unit at an indicative price.
  //
  // But somebody has to be told. The old post-pass built the uncouplable
  // composite anyway and warned; refusing it silently would leave a reviewer
  // looking at one oversize line with no hint that a split was considered and
  // why nothing could supply it.
  const products = [
    splitProduct("awn-a", { operation: "awning", maxWidthMm: 1300, system: "sys-10" }),
    splitProduct("fix-b", { operation: "fixed", maxWidthMm: 1300, system: "sys-20" }),
  ];
  const r = await selectWithSplits(
    { family: "windows", operationType: "awning", widthMm: 3600, heightMm: 2100, externalRef: "W16" },
    parseSplitHint("AWNING + FIXED + AWNING"),
    splitCtx(products),
  );

  assert.deepEqual(r.splits, [], "no uncouplable make-up is ever offered as a candidate");
  assert.equal(r.selectedSplit, null);
  assert.ok(r.splitNote, "…and the refusal is reported, not swallowed");
  assert.match(r.splitNote, /single frame system/i);
  // The opening still gets an answer: the last-resort unit, priced at the real
  // opening size, so an oversize opening never reads as "we sell nothing".
  assert.ok(r.selected, "a last-resort single unit still answers the opening");
  assert.equal(r.selected.candidateOutcome.tier, "does_not_fit");
});

test("a split that WAS supplied carries no refusal note", async () => {
  const products = [
    splitProduct("awn-a", { operation: "awning", maxWidthMm: 1300 }),
    splitProduct("fix-b", { operation: "fixed", maxWidthMm: 1300 }),
  ];
  const r = await selectWithSplits(
    { family: "windows", operationType: "awning", widthMm: 3600, heightMm: 2100, externalRef: "W17" },
    parseSplitHint("AWNING + FIXED + AWNING"),
    splitCtx(products),
  );
  assert.ok(r.splits.length);
  assert.equal(r.splitNote, null, "nothing to report when the make-up exists");
});

test("an unsuppliable split puts its reason ON THE LINE, not only in a run summary", async () => {
  // The reviewer's only notice that a make-up was tried and nothing could
  // supply it. It used to travel as prose on `reviewWarnings`, which the AI
  // upload pipeline drops on the floor — so on the path a customer actually
  // uses, the sentence explaining WHY there is one oversize line instead of a
  // composite reached nobody. The facts survived (`fits:false`, review_required)
  // but a reviewer reading the line could not tell a split had been considered.
  const env = scriptedDb({
    "SELECT options_json FROM quote_line": { options_json: "{}" },
    "FROM composite_policy": { tolerance_mm: 5, default_joiner_mm: 0, max_segments: 6 },
  });
  const warnings = await materialiseSelectedSplit(env, {
    openingId: "o1", quoteLineId: "ql1", externalRef: "W16",
    opening: { widthMm: 3600 },
    result: {
      selectedSplit: null, splits: [],
      splitNote: "No single frame system supplies every unit of this opening, so the units "
        + "were chosen independently and may not couple — confirm the make-up at technical review.",
    },
  });

  const flagged = env.writes.find((w) => /status='technical_review'/.test(w.sql));
  assert.ok(flagged, "the line carries the refusal");
  assert.equal(flagged.args[1], "ql1");
  assert.match(JSON.parse(flagged.args[0]).composite, /single frame system/);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^W16: /);

  // A run with nothing to say still writes nothing — the note is the trigger.
  const quiet = scriptedDb({});
  assert.deepEqual(
    await materialiseSelectedSplit(quiet, {
      openingId: "o1", quoteLineId: "ql1", externalRef: "W17",
      opening: {}, result: { selectedSplit: null, splits: [], splitNote: null },
    }),
    [],
  );
  assert.deepEqual(quiet.writes, []);
});

test("A20 SAFETY: a line can never come back empty because every split misses on fit", () => {
  // THE CONFIGURATION THAT MAKES THIS DANGEROUS, and it is not exotic.
  //
  // `proposeSplit` partitions WIDTH. An opening too TALL for every product in
  // the catalogue cannot be rescued by splitting it: every unit keeps the full
  // height, so every unit's chosen product still misses, and the make-up as a
  // whole has fits:false.
  //
  // So on this opening nothing fits — not as one unit, not as a split. Excluding
  // non-fitting splits is only safe if the last-resort single unit is still
  // there to answer, and it is only there if its promotion is retired by a split
  // that FITS rather than by a split merely existing.
  const tall = (slug, operation) => ({
    ...splitProduct(slug, { operation, maxWidthMm: 1300 }),
    dimensionRule: { minWidthMm: 300, maxWidthMm: 1300, minHeightMm: 300, maxHeightMm: 3000, maxAreaM2: null, maxAspectRatio: null, ruleVersion: "v1" },
  });
  const products = [tall("amj-awn", "awning"), tall("amj-fixed", "fixed")];

  return selectWithSplits(
    { family: "windows", operationType: "awning", widthMm: 3600, heightMm: 4000, externalRef: "W30" },
    null, splitCtx(products),
  ).then((r) => {
    // Splits WERE generated — the opening is oversize, so the gate opened.
    assert.ok(r.splits.length, "the machine did try to split it");
    // And not one of them can actually be built at this height.
    assert.ok(r.splits.every((s) => s.fits === false), "every make-up misses on fit");

    // THE LINE STILL HAS AN ANSWER. This is the whole non-blocking contract:
    // an oversize opening gets an indicative price and a warning, never
    // "we sell nothing that shape".
    assert.ok(r.selected || r.selectedSplit, "a candidate answers the opening");
    assert.notEqual(r.status, "no_candidate");
    // Specifically, the last-resort SINGLE unit in tier E (A4/AD15) — the
    // largest-capacity product of the required operation, priced at the real
    // opening size.
    assert.ok(r.selected, "the answer is a single unit, not an unbuildable split");
    assert.equal(r.selected.candidateOutcome.tier, "does_not_fit");
  });
});

test("A20 a split that cannot be built is EXCLUDED, and says why it was rejected", () => {
  // Owner ruling, reversing AD24. Ops can build their own splits, so a make-up
  // that cannot physically be built is not help — it is noise sitting on the
  // reviewer's list among candidates they might actually pick.
  //
  // The drawing-hint path (AC-19), where a single unit DOES fit: the comment
  // asks for an awning beside a fixed lite, but the fixed product is not made
  // narrow enough for its half of the opening, so the make-up misses on fit.
  const narrowFixed = {
    ...splitProduct("fix-wide-only", { operation: "fixed", maxWidthMm: 2400 }),
    dimensionRule: { minWidthMm: 1400, maxWidthMm: 2400, minHeightMm: 300, maxHeightMm: 3000, maxAreaM2: null, maxAspectRatio: null, ruleVersion: "v1" },
  };
  const products = [splitProduct("amj-awn", { operation: "awning", maxWidthMm: 2400 }), narrowFixed];

  return selectWithSplits(
    { family: "windows", operationType: "awning", widthMm: 2000, heightMm: 1000, externalRef: "W31" },
    parseSplitHint("AWNING + FIXED"),
    splitCtx(products),
  ).then((r) => {
    assert.ok(r.splits.length, "the comment put a split in the running");
    assert.ok(r.splits.every((s) => s.fits === false), "and it cannot be built at these widths");

    for (const split of r.splits) {
      const o = split.candidateOutcome;
      // EXCLUDED, not demoted. It carries no rank, so it is not a position on
      // the list of things a reviewer might choose.
      assert.equal(o.tier, "excluded");
      assert.equal(o.rank, null);
      assert.equal(o.selected, false);
      assert.equal(o.competing, false);

      // But it is still PERSISTED, with the reason. "A split was considered and
      // rejected on fit" is a different message from "no split was tried", and
      // the reviewer needs to be able to tell them apart.
      assert.deepEqual(o.exclusions.map((e) => e.constraint), ["dimensions"]);
      assert.deepEqual(o.exclusions[0].detail.breached, ["width"]);
      assert.equal(o.form, "split");
      assert.ok(o.units.length >= 2, "and what it would have been made of");
    }

    // The single unit that DOES fit answers the opening, and it is a genuine
    // fit rather than a last resort — no tier-E promotion was needed.
    assert.ok(r.selected);
    assert.equal(r.selected.candidate.slug, "amj-awn");
    assert.equal(r.selected.candidateOutcome.tier, "meets");
    assert.equal(r.selectedSplit, null);
  });
});

// ── resolveMakeUp (§3.4) — the shape ladder: reading > comment > energy > none ──
test("resolveMakeUp: a drawing reading wins the shape over a schedule comment (AC-15/AC-16)", () => {
  const commentHint = parseSplitHint("AWNING + FIXED + AWNING"); // schedule_comment: 3 units
  const result = resolveMakeUp("W1", {
    reading: {
      splitState: "value",
      units: [{ role: "operable", ratio: 0.5 }, { role: "passive", ratio: 0.5 }], // drawing: 2 units
      axis: "vertical",
    },
    commentHint,
    typeText: "AWNING",
    fallbackOp: "awning",
    energyComponents: null,
    energyAxis: "vertical",
  });
  assert.equal(result.hint.source, "plans");
  assert.equal(result.hint.units.length, 2);
});

test("resolveMakeUp: a single-unit drawing reading is NOT a split hint — a correctly-read single window must never be fabricated into a composite (Codex P1)", () => {
  const result = resolveMakeUp("W1", {
    reading: { splitState: "value", units: [{ role: "operable", ratio: 1 }], axis: "vertical" },
    commentHint: null, typeText: "AWNING", fallbackOp: "awning", energyComponents: null, energyAxis: "vertical",
  });
  assert.equal(result.hint, null, "one unit is not a split, exactly as a one-unit comment is not (existing rule, now applied to readings too)");
});

test("proposeSplit: a plans hint lays out by RATIO, not an even split (output spec §1.2)", () => {
  const hint = {
    units: [{ operation: "awning", count: 1, widthMm: null, ratio: 0.634 }, { operation: "fixed", count: 1, widthMm: null, ratio: 0.366 }],
    raw: "drawing: 2 unit(s)", source: "plans", axis: "vertical",
  };
  const proposal = proposeSplit({ operationType: "awning", widthMm: 2050, heightMm: 2100 }, hint);
  assert.equal(proposal.basis, "plans");
  // Worked example from the output spec: round(1299.7/5)*5 = 1300, remainder 750.
  assert.deepEqual(proposal.segments.map((s) => s.widthMm), [1300, 750]);
  assert.ok(proposal.segments.every((s) => s.heightMm === 2100));
});

test("proposeSplit: a plans hint with axis 'horizontal' divides the HEIGHT — a highlight-over-fixed opening (AC-7)", () => {
  const hint = {
    units: [{ operation: "awning", count: 1, widthMm: null, ratio: 0.3 }, { operation: "fixed", count: 1, widthMm: null, ratio: 0.7 }],
    raw: "drawing: 2 unit(s)", source: "plans", axis: "horizontal",
  };
  const proposal = proposeSplit({ operationType: "awning", widthMm: 1800, heightMm: 2000 }, hint);
  assert.equal(proposal.axis, "horizontal");
  assert.deepEqual(proposal.segments.map((s) => s.heightMm), [600, 1400]); // divides height, not width
  assert.ok(proposal.segments.every((s) => s.widthMm === 1800)); // full width, each
});

test("resolveMakeUp: a count mismatch is a conflict, and the drawing's shape still stands (R5, spec §13)", () => {
  const commentHint = parseSplitHint("AWNING + FIXED + AWNING"); // comment: 3 units
  const result = resolveMakeUp("W1", {
    reading: { splitState: "value", units: [{ role: "operable", ratio: 0.5 }, { role: "passive", ratio: 0.5 }], axis: "vertical" }, // drawing: 2
    commentHint, typeText: "AWNING", fallbackOp: "awning", energyComponents: null, energyAxis: "vertical",
  });
  assert.match(result.conflict, /comment describes 3.*drawing shows 2/);
  assert.equal(result.hint.source, "plans"); // the drawing's shape stands
  assert.equal(result.hint.units.length, 2);
});
