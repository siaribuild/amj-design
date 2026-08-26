// Reproduces §2a of docs/estimator/drawing-parse-design.md, in full.
//
// EVERY opening is accounted for, in one of three outcomes. An earlier version
// of this harness printed only the openings it could read, which made the
// interesting half — the ambiguous and the absent — invisible, and made the
// document's headline numbers unreproducible from the committed code. Silence
// is not a result.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decodePage, elevationPages } from "./decode.mjs";
import { findFrames, frameVerticals, leafBounds, diagonals, MM_PER_PT } from "./frames.mjs";

// Resolved against THIS file, not the shell's cwd: the fixture lives beside the
// scripts and the documented command runs from the repo root.
const here = dirname(fileURLToPath(import.meta.url));
const PDF = join(here, "plans.pdf");
const DESIGN = join(here, "..", "..", "..", "docs", "estimator", "drawing-parse-design.md");

/** The claims the design document MAKES, read out of the document itself.
 *
 *  The gates below assert against THESE rather than against constants copied
 *  from the prose. A constant copied from prose is not a check on the prose: it
 *  passes happily while the document says something else, which is exactly the
 *  state the first version of this gate shipped in.
 *
 *  A missing anchor THROWS rather than skipping. A gate that quietly stops
 *  finding its claim is worse than no gate, because it reports MATCH forever. */
function designClaims(md) {
  const grab = (re, what) => {
    const m = md.match(re);
    if (!m) {
      throw new Error(`design doc: cannot find ${what}. The wording changed — update `
        + `the anchor in measure.mjs so the claim stays checked, rather than leaving `
        + `a gate that can only ever pass.`);
    }
    return m[1];
  };
  const nums = (t) => t.split(/[|,]/).map((x) => parseFloat(x)).filter(Number.isFinite);
  const tags = (t) => t.split(/[^A-Z0-9]+/).filter((x) => /^[WD]\d+$/.test(x));
  // A §2a row: | label | count | tags |. Regex LITERALS, one per row, rather
  // than a pattern built from a string: the escaping in a built pattern turned
  // the leading \| into an alternation and \d into a literal "d", which matched
  // the empty string at position 0 and reported every claim as absent.
  const row = (re, label) => {
    const m = md.match(re);
    if (!m) {
      throw new Error(`design doc: cannot find the "${label}" row of §2a. The table `
        + `changed shape — update the anchor in measure.mjs rather than leaving a `
        + `gate that can only ever pass.`);
    }
    return { count: Number(m[1]), tags: tags(m[2]) };
  };
  return {
    verticals: nums(grab(/verticals, mm from left:([^\n]+)/, "§2's verticals line")),
    heights2050: nums(grab(/across both elevation sheets is `([^`]+)`/, "§2's quoted heights")),
    read: row(/\|[^|\n]*Read, with composition[^|\n]*\|[^|\n]*?(\d+)[^|\n]*\|([^|\n]+)\|/, "Read"),
    ambiguous: row(/\|[^|\n]*Ambiguous[^|\n]*\|[^|\n]*?(\d+)[^|\n]*\|([^|\n]+)\|/, "Ambiguous"),
    notRead: row(/\|[^|\n]*Not read[^|\n]*\|[^|\n]*?(\d+)[^|\n]*\|([^|\n]+)\|/, "Not read"),
  };
}
const DOC = designClaims(await readFile(DESIGN, "utf8"));

/** Verticals cluster into MEMBERS — a jamb or a mullion is several lines, not
 *  one — for W1 the left jamb is three sash-band lines at 0/25.4/50.8. A leaf
 *  spans from one member's inner edge to the next member's outer edge. */
function members(vs, gapMm = 60) {
  const groups = [];
  for (const x of vs) {
    const g = groups[groups.length - 1];
    if (g && x - g[g.length - 1] <= gapMm) g.push(x);
    else groups.push([x]);
  }
  return groups.map((g) => ({ lo: g[0], hi: g[g.length - 1] }));
}

export function compose(segs, f) {
  const ms = members(leafBounds(segs, f));
  if (ms.length < 2) return null;
  const leaves = ms.slice(0, -1).map((m, i) => ({ x0: m.hi, x1: ms[i + 1].lo, w: ms[i + 1].lo - m.hi }));
  const total = leaves.reduce((n, l) => n + l.w, 0);
  for (const l of leaves) {
    l.ratio = l.w / total;
    // Leaf-span normalised: the joiner and frame material are distributed pro
    // rata rather than dumped on the outer units. Calibrated on W4, where the
    // drafter stated the answer.
    l.operable = diagonals(segs, {
      x0: f.x0 + l.x0 / MM_PER_PT, x1: f.x0 + l.x1 / MM_PER_PT, y0: f.y0, y1: f.y1,
    }).length > 0;
  }
  return leaves;
}

/** An opening the elevations do not show at its stated size: is anything of that
 *  WIDTH drawn on an elevation at all, at any height?
 *
 *  ELEVATION SHEETS ONLY, and the scope is the whole point. Searching the floor
 *  plans too was tried and is worthless: a window in plan view is a wall opening
 *  of the right width and an unrelated depth, so every absent opening "matched"
 *  a floor plan and the check concluded the opposite of the truth. A width means
 *  something only on the sheet that draws the window face-on. */
async function heightsAtWidth(sheets, widthMm) {
  const found = [];
  for (const [p, segs] of Object.entries(sheets)) {
    for (let h = 300; h <= 3400; h += 25) {
      for (const f of findFrames(segs, widthMm, h)) {
        if (!found.some((k) => Math.abs(k.h - f.hMm) < 25 && k.p === p)) found.push({ p, h: f.hMm });
      }
    }
  }
  return found.sort((a, b) => a.h - b.h);
}

const openings = JSON.parse(await readFile(join(here, "openings.json"), "utf8"));
const t0 = Date.now();
const ELEVATIONS = await elevationPages(PDF);
const sheets = {};
for (const p of ELEVATIONS) sheets[p] = (await decodePage(PDF, p)).segs;
const decodeMs = Date.now() - t0;
console.log(`elevations p${ELEVATIONS.join(",p")} decoded in ${decodeMs}ms, `
  + `heap ${Math.round(process.memoryUsage().heapUsed / 1e6)}MB\n`);

const read = [], ambiguous = [], absent = [];
for (const o of openings) {
  const hits = ELEVATIONS.flatMap((p) => findFrames(sheets[p], o.w, o.h).map((f) => ({ p, f })));
  const label = `${o.tag.padEnd(4)} ${String(o.w).padStart(4)}x${String(o.h).padStart(4)}`;
  if (hits.length > 1) {
    ambiguous.push(o.tag);
    console.log(`${label}  ?  ${hits.length} candidates on p${[...new Set(hits.map((h) => h.p))].join("/")} — not stated`);
    continue;
  }
  if (hits.length === 0) { absent.push(o); console.log(`${label}  —  no frame on the elevations`); continue; }
  const { p, f } = hits[0];
  const leaves = compose(sheets[p], f);
  if (!leaves) { absent.push(o); console.log(`${label}  —  frame found, no readable division`); continue; }
  read.push(o.tag);
  const parts = leaves.map((l) => `${l.operable ? "OP" : "fx"} ${l.w.toFixed(1)}mm r=${l.ratio.toFixed(3)}`);
  console.log(`${label}  ✓  p${p} ${f.wMm.toFixed(0)}x${f.hMm.toFixed(0)}  ${parts.join("  |  ")}`);
}
const sweepMs = Date.now() - t0;

// Why each unmatched opening is unmatched. NOT a verdict that it is undrawn:
// "nothing of that width at that height resolves to a frame" and "this opening
// is not on the sheet" are different claims, and only the first is measured
// here. The output spec's third state exists for exactly this — `not read` is
// distinct from `not stated`, and collapsing them is the mistake that once
// recorded an unreadable symbol as "no marks" and priced fixed glass.
console.log(`\nwhy the ${absent.length} unmatched are unmatched — heights drawn at that width, on the elevations:`);
let nearMiss = 0;
for (const o of absent) {
  const hs = await heightsAtWidth(sheets, o.w);
  const near = hs.filter((k) => Math.abs(k.h - o.h) <= o.h * 0.02);
  console.log(`  ${o.tag.padEnd(4)} ${o.w}mm wide → ${hs.map((k) => `${k.h.toFixed(0)}(p${k.p})`).join(", ") || "nothing"}`);
  console.log(`       ${near.length
    ? `${near.length} within 2% of ${o.h}, but no single frame resolves → NOT READ`
    : `nothing within 2% of ${o.h} → no frame of this size on either elevation`}`);
  if (near.length) nearMiss++;
}

console.log(`\n  read ${read.length}   ambiguous ${ambiguous.length}   not read ${absent.length}`
  + `   (of which ${nearMiss} ${nearMiss === 1 ? "has" : "have"} a near-size candidate that did not resolve)`);
console.log(`  every one of the ${openings.length} openings is accounted for; none was read wrongly`);
console.log(`  sweep ${sweepMs}ms`);

// ─── What §2a claims, asserted ───────────────────────────────────────────────
//
// The calibration points alone were not enough: they pin W1 and W4 and say
// nothing about the other seventeen, so a regression that halved the read count
// would still have exited 0 and the document's headline table would have gone
// stale silently. A result a document states is a result the harness enforces.
const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const claims = [
  ["read", read, DOC.read],
  ["ambiguous", ambiguous, DOC.ambiguous],
  ["not read", absent.map((o) => o.tag), DOC.notRead],
];
let tableOk = true;
for (const [name, got, claim] of claims) {
  // The n column is a claim in its own right and was previously parsed, printed
  // and never checked — so the table could have said 12 above a list of eleven
  // tags and passed. A reader takes the number at face value; so does this.
  if (claim.count !== claim.tags.length) {
    tableOk = false;
    console.log(`\n  §2a INCONSISTENT — ${name}: the table says ${claim.count} `
      + `but lists ${claim.tags.length} [${claim.tags.join(" ")}]`);
  }
  if (sameSet(got, claim.tags)) continue;
  tableOk = false;
  console.log(`\n  §2a MISMATCH — ${name}: document says ${claim.tags.length} [${claim.tags.join(" ")}]`);
  console.log(`                    measured ${got.length} [${got.join(" ")}]`);
}
// The three outcomes must also account for every opening, exactly once.
const claimedTotal = claims.reduce((n, [, , c]) => n + c.count, 0);
if (claimedTotal !== openings.length) {
  tableOk = false;
  console.log(`\n  §2a INCOMPLETE — the table's counts sum to ${claimedTotal}, `
    + `but the schedule has ${openings.length} openings`);
}
console.log(`
§2a table (${DOC.read.count} read / ${DOC.ambiguous.count} ambiguous / ${DOC.notRead.count} not read, as the document states them): ${tableOk ? "MATCH" : "DRIFTED"}`);

// The eight verticals §2 records for W1, and which band each belongs to. The
// design's figure is reproduced in full here rather than implied by the leaves.
const W1_VERTICALS = DOC.verticals;
const w1f = findFrames(sheets[ELEVATIONS[0]], 2050, 2100)[0];
const vs = w1f ? frameVerticals(sheets[ELEVATIONS[0]], w1f) : [];
const band = (f) => (f > 0.995 ? "frame" : f > 0.965 ? "SASH" : "glass");
const vsOk = vs.length === W1_VERTICALS.length
  && vs.every((r, i) => Math.abs(r.mm - W1_VERTICALS[i]) <= 0.1);
console.log(`
W1 verticals — §2 records ${W1_VERTICALS.length}, got ${vs.length}: ${vsOk ? "MATCH" : "DRIFTED"}`);
console.log(`  ${vs.map((r) => `${r.mm.toFixed(1)}${band(r.frac) === "SASH" ? "*" : ""}`).join(" | ")}`);
console.log(`  * = sash band, the ${vs.filter((r) => band(r.frac) === "SASH").length} that bound a leaf`);
if (!vsOk) console.log(`  expected ${W1_VERTICALS.join(" | ")}`);

// The two calibration points the design records. If either drifts, the decoder
// changed and the document's numbers are stale — which is the failure this
// harness exists to catch.
const at = (w, h) => { for (const segs of Object.values(sheets)) { const f = findFrames(segs, w, h); if (f.length === 1) return compose(segs, f[0]); } return null; };
const w1 = at(2050, 2100), w4 = at(3200, 2100);
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;
const ok = w1?.length === 2 && near(w1[0].w, 698.5) && near(w1[1].w, 1286.9)
  && near(w1[0].ratio, 0.352, 0.001) && near(w1[1].ratio, 0.648, 0.001)
  && w4?.length === 3 && near(w4[0].w, 596.9) && near(w4[2].w, 601.1);

// A LEAF IS NEVER THE WHOLE FRAME. Choosing the frame's own band as the leaf
// bounds is silent when the opening has one unit — the ratio is 1.000 either
// way and only the width betrays it — so it slipped all three gates above while
// W2 read 3501.0 for a 3450.2 sash and D2 read 965.2 for 918.6. Single-unit
// openings are where this hides, so they are where it is pinned.
const singles = [["W2", 3500, 700, 3450.2], ["D2", 965, 2405, 918.6], ["D4", 865, 2405, 821.3]];
let framesOk = true;
for (const [tag, w, h, sash] of singles) {
  const got = at(w, h);
  const bad = !got || got.length !== 1 || !near(got[0].w, sash);
  if (bad) {
    framesOk = false;
    console.log(`  ${tag}: expected one leaf of ${sash}mm (the sash), got `
      + `${got ? got.map((l) => l.w.toFixed(1)).join("|") : "nothing"}`);
  }
}
console.log(`single-unit leaves are the sash, not the frame: ${framesOk ? "MATCH" : "DRIFTED"}`);

// §2 quotes this list verbatim as its evidence that W14/W16 do not resolve. It
// is pinned because the prose is where every one of this reader's errors has
// actually escaped: three times now a claim outran its measurement, survived
// review, and had to be retracted. Numbers a document quotes are numbers the
// harness owns.
const W14_HEIGHTS = DOC.heights2050;
const got14 = (await heightsAtWidth(sheets, 2050)).map((k) => Math.round(k.h));
const quotedOk = got14.length === W14_HEIGHTS.length
  && got14.every((h, i) => Math.abs(h - W14_HEIGHTS[i]) <= 1);
console.log(`§2's quoted heights at a 2050mm width: ${quotedOk ? "MATCH" : "DRIFTED"}`);
if (!quotedOk) console.log(`  doc says ${W14_HEIGHTS.join(", ")}
  got      ${got14.join(", ")}`);
console.log(`calibration W1+W4 vs the design's recorded figures: ${ok ? "MATCH" : "DRIFTED"}`);

// Both gates, or the run failed. The table without the calibration would pass a
// decoder that found the right eleven windows and measured them all wrongly;
// the calibration without the table would pass one that lost half of them.
if (!ok || !tableOk || !vsOk || !framesOk || !quotedOk) process.exitCode = 1;
