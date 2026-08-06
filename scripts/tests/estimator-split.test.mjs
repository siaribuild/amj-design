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
    contents: `export { parseSplitHint, proposeSplit, shouldPropose, evenWidths, compositeAveragedUw } from ${p("worker/lib/estimator/split.ts")};`,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { parseSplitHint, proposeSplit, shouldPropose, evenWidths, compositeAveragedUw } = await import(pathToFileURL(outfile).href);
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
  assert.deepEqual(p.segments.map((s) => `${s.operation}:${s.widthMm}`), ["awning:1300", "fixed:750"]);
  assert.equal(p.segments.reduce((n, s) => n + s.widthMm, 0), 2050, "partitions the opening exactly");
  assert.equal(p.reviewRequired, true, "a proposal is always a starting point");
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
