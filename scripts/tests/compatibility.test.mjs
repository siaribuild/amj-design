// Frame compatibility — which frames may be coupled in one opening.
//
// The numbers and slugs below are the LIVE catalogue's, grouped by the owner's
// rule of 2026-08-08: the number is the system, the letters are variants within
// it. So AMJ80 / AMJ80ST / AMJ80T are one system, and the AMJ80ST fixed window is
// the lite that belongs beside an AMJ80 awning. Before this existed the lite was
// chosen on price alone against five fixed products sharing one 400–3000
// dimension rule, so an AMJ67T lite beside an AMJ80 awning was the routine
// outcome — which is the case at the bottom of this file.
//
// The two invariants everything else hangs off:
//   • unknown is NOT incompatible — an untagged product must never be eliminated,
//     because the whole feature is gated on 34 products being tagged by hand and
//     the catalogue has to keep working throughout;
//   • an unauthored pair IS incompatible — an edge nobody drew is a decision the
//     manufacturer has not made, not a gap to be filled in by inference.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("compatibility");
const outfile = join(runDir, "compatibility-bundle.mjs");
await build({
  stdin: {
    contents: `export { systemOf, areCompatible, isBuildableTogether, candidatesInSystem, partnersOf, coveringSystems } from ${p("worker/lib/estimator/compatibility.ts")};`,
    resolveDir: projectRoot, sourcefile: "compatibility-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const M = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
test.after(async () => { if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir); });

/** A candidate stripped to what this module reads. `system` null ⇒ untagged. */
const prod = (slug, system, compatibleWith = []) => ({
  sanityProductId: `id-${slug}`, slug,
  frameSystem: system ? { slug: system, name: system.toUpperCase(), compatibleWith } : null,
});

// The live grouping, as authored: six systems, every one but sys-125 making its
// own fixed lite, and compatibleWith empty everywhere (the owner declined the
// only candidate edge).
const AWNING_80 = prod("amj80-series-awning-window", "sys-80");
const FIXED_80 = prod("amj80st-fixed-window", "sys-80");
const FIXED_67 = prod("amj67t-fixed-window", "sys-65");
const FIXED_100 = prod("amj100t-fixed-window", "sys-100");
const SLIDER_125 = prod("amj125t-slim-frame-sliding-door", "sys-125");
const UNTAGGED = prod("amj150-fixed-window", null);

// ── The verdicts ─────────────────────────────────────────────────────────────

test("same system needs no authored edge — it is the whole rule for five of six systems", () => {
  assert.equal(M.areCompatible(AWNING_80, FIXED_80), "same");
  assert.equal(M.isBuildableTogether(AWNING_80, FIXED_80), true);
});

test("THE CASE THIS EXISTS FOR: an AMJ67T lite beside an AMJ80 awning is refused", () => {
  assert.equal(M.areCompatible(AWNING_80, FIXED_67), "incompatible");
  assert.equal(M.isBuildableTogether(AWNING_80, FIXED_67), false);
});

test("an unauthored pair is incompatible, never 'probably fine'", () => {
  assert.equal(M.areCompatible(FIXED_67, FIXED_100), "incompatible");
});

test("UNKNOWN NEVER BLOCKS — an untagged product is unpairable by nobody", () => {
  assert.equal(M.areCompatible(AWNING_80, UNTAGGED), "unknown");
  assert.equal(M.areCompatible(UNTAGGED, UNTAGGED), "unknown");
  // The invariant the whole authoring period depends on.
  assert.equal(M.isBuildableTogether(AWNING_80, UNTAGGED), true);
  assert.equal(M.systemOf(UNTAGGED), null);
});

test("an authored edge makes two systems compatible, and severity survives", () => {
  const a = prod("a", "sys-125", [{ slug: "sys-150", severity: "preferred" }]);
  const b = prod("b", "sys-150");
  assert.equal(M.areCompatible(a, b), "preferred");
  // Symmetric: the edge is a fact about the joint, so which document carries it
  // cannot change the answer.
  assert.equal(M.areCompatible(b, a), "preferred");
});

test("preferred on one side outranks allowed on the other", () => {
  const a = prod("a", "sys-125", [{ slug: "sys-150", severity: "preferred" }]);
  const b = prod("b", "sys-150", [{ slug: "sys-125", severity: "allowed" }]);
  assert.equal(M.areCompatible(a, b), "preferred");
});

// ── Covering the whole opening ───────────────────────────────────────────────

test("a system that supplies every unit itself is exact, and comes first", () => {
  // An awning opening too wide for one frame: awning | fixed | awning.
  const covering = M.coveringSystems([
    [AWNING_80, prod("amj100t-awning-window", "sys-100")],
    [FIXED_80, FIXED_67, FIXED_100],
    [AWNING_80, prod("amj100t-awning-window", "sys-100")],
  ]);
  assert.deepEqual(covering.map((c) => c.slug), ["sys-100", "sys-80"]);
  assert.ok(covering.every((c) => c.exact));
  // sys-65 supplies the lite and nothing else, so it cannot build the opening.
  assert.ok(!covering.some((c) => c.slug === "sys-65"));
});

test("a system reaches a unit it cannot make through a declared partner, and is not exact", () => {
  const slim = prod("amj125t-slim-frame-sliding-door", "sys-125", [{ slug: "sys-150", severity: "allowed" }]);
  const lite150 = prod("amj150-fixed-window", "sys-150");
  const covering = M.coveringSystems([[slim], [lite150]]);
  const s125 = covering.find((c) => c.slug === "sys-125");
  assert.ok(s125, "sys-125 covers the opening through its partner");
  assert.equal(s125.exact, false);
  assert.equal(s125.ownSegments, 1);
});

test("no covering system is a REAL answer, not a failure — the caller falls back and warns", () => {
  // sys-125 makes no fixed lite and the owner authored no edge for it.
  assert.deepEqual(M.coveringSystems([[SLIDER_125], [FIXED_80, FIXED_67]]), []);
  // An untagged catalogue is the same shape: nothing to restrict to, so the
  // estimator behaves exactly as it does today.
  assert.deepEqual(M.coveringSystems([[UNTAGGED], [UNTAGGED]]), []);
  assert.deepEqual(M.coveringSystems([]), []);
});

test("ordering is deterministic — two identical estimates cannot disagree", () => {
  const segments = [[FIXED_80, FIXED_100], [FIXED_80, FIXED_100]];
  assert.deepEqual(M.coveringSystems(segments).map((c) => c.slug), ["sys-100", "sys-80"]);
  assert.deepEqual(
    M.coveringSystems([[FIXED_100, FIXED_80], [FIXED_100, FIXED_80]]).map((c) => c.slug),
    ["sys-100", "sys-80"],
  );
});

// ── Restricting a candidate list ─────────────────────────────────────────────

test("restricting to a system keeps its own frames and its partners', and drops untagged ones", () => {
  const partners = M.partnersOf([[prod("x", "sys-125", [{ slug: "sys-150", severity: "allowed" }])]], "sys-125");
  const kept = M.candidatesInSystem([SLIDER_125, prod("amj150-fixed-window", "sys-150"), FIXED_80, UNTAGGED], "sys-125", partners);
  assert.deepEqual(kept.map((c) => c.slug), ["amj125t-slim-frame-sliding-door", "amj150-fixed-window"]);
});

test("with no partners, restricting to a system is restricting to that system", () => {
  const kept = M.candidatesInSystem([AWNING_80, FIXED_80, FIXED_67, UNTAGGED], "sys-80");
  assert.deepEqual(kept.map((c) => c.slug), ["amj80-series-awning-window", "amj80st-fixed-window"]);
});

test("partnersOf reads an edge from either side, and never lists the system itself", () => {
  const forward = M.partnersOf([[prod("a", "sys-125", [{ slug: "sys-150", severity: "preferred" }])]], "sys-125");
  assert.deepEqual([...forward], [["sys-150", "preferred"]]);
  // The reciprocal row, authored on the OTHER document.
  const backward = M.partnersOf([[prod("b", "sys-150", [{ slug: "sys-125", severity: "allowed" }])]], "sys-125");
  assert.deepEqual([...backward], [["sys-150", "allowed"]]);
  assert.equal(M.partnersOf([[AWNING_80, FIXED_80]], "sys-80").size, 0);
});
