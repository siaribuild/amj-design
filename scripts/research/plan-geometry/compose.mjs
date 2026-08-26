import { readFile } from "node:fs/promises";
import { decodePage } from "./decode.mjs";
import { findFrames, mullions, diagonals } from "./frames.mjs";

/** Verticals cluster into MEMBERS (a jamb or a mullion is several lines).
 *  A leaf is the glass between two members. */
function members(vs, gapMm = 60) {
  const groups = [];
  for (const x of vs) {
    const g = groups[groups.length - 1];
    if (g && x - g[g.length - 1] <= gapMm) g.push(x);
    else groups.push([x]);
  }
  return groups.map((g) => ({ lo: g[0], hi: g[g.length - 1], lines: g.length }));
}

export function compose(segs, f) {
  const vs = mullions(segs, f);
  const uniq = vs.filter((x, i) => i === 0 || x - vs[i - 1] > 1);
  const ms = members(uniq);
  if (ms.length < 2) return null;
  const leaves = [];
  for (let i = 0; i < ms.length - 1; i++) {
    // Inner faces: right edge of the left member to the left edge of the right one.
    leaves.push({ x0: ms[i].hi, x1: ms[i + 1].lo, w: ms[i + 1].lo - ms[i].hi });
  }
  const total = leaves.reduce((n, l) => n + l.w, 0);
  for (const l of leaves) {
    l.ratio = l.w / total;
    const box = { x0: f.x0 + l.x0 / 35.2778, x1: f.x0 + l.x1 / 35.2778, y0: f.y0, y1: f.y1 };
    l.symbol = diagonals(segs, box).length > 0;
  }
  return { members: ms, leaves };
}

const openings = JSON.parse(await readFile("openings.json", "utf8"));
const sheets = {};
for (const p of [6, 7]) sheets[p] = (await decodePage("plans.pdf", p)).segs;

for (const o of openings) {
  let found = null;
  for (const p of [6, 7]) { const c = findFrames(sheets[p], o.w, o.h); if (c.length === 1) { found = { p, f: c[0] }; break; } }
  if (!found) continue;
  const c = compose(sheets[found.p], found.f);
  if (!c) { console.log(`${o.tag.padEnd(4)} members<2 — single unit`); continue; }
  const parts = c.leaves.map((l) => `${l.symbol ? "OP" : "fx"} ${l.w.toFixed(1)}mm r=${l.ratio.toFixed(3)}`);
  console.log(`${o.tag.padEnd(4)} ${String(o.w).padStart(4)}x${String(o.h).padStart(4)} p${found.p}  ${parts.join("  |  ")}`);
}
