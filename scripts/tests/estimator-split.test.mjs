// WS8: tests for composite split PROPOSAL — parsing schedule comments, the
// comment-authoritative → 50/50-default precedence, and area-weighted composite
// Uw. Includes the owner's W4 worked example.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot } from "./helpers.mjs";

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
