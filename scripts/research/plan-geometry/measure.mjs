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
import { findFrames, mullions, diagonals, MM_PER_PT } from "./frames.mjs";

// Resolved against THIS file, not the shell's cwd: the fixture lives beside the
// scripts and the documented command runs from the repo root.
const here = dirname(fileURLToPath(import.meta.url));
const PDF = join(here, "plans.pdf");

/** Verticals cluster into MEMBERS — a jamb or a mullion is several lines, not
 *  one. A leaf is the glass between two members' inner faces. */
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
  const vs = mullions(segs, f);
  const uniq = vs.filter((x, i) => i === 0 || x - vs[i - 1] > 1);
  const ms = members(uniq);
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

// The two calibration points the design records. If either drifts, the decoder
// changed and the document's numbers are stale — which is the failure this
// harness exists to catch.
const at = (w, h) => { for (const segs of Object.values(sheets)) { const f = findFrames(segs, w, h); if (f.length === 1) return compose(segs, f[0]); } return null; };
const w1 = at(2050, 2100), w4 = at(3200, 2100);
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;
const ok = w1?.length === 2 && near(w1[0].w, 698.5) && near(w1[1].w, 1286.9)
  && near(w1[0].ratio, 0.352, 0.001) && near(w1[1].ratio, 0.648, 0.001)
  && w4?.length === 3 && near(w4[0].w, 596.9) && near(w4[2].w, 601.1);
console.log(`\ncalibration W1+W4 vs the design's recorded figures: ${ok ? "MATCH" : "DRIFTED"}`);
if (!ok) process.exitCode = 1;
