// Stage C, rebuilt: find the frame for a KNOWN opening size, then read how it divides.
//
// A LOOKUP, not a search. The schedule already states 2050 x 2100; this asks the
// sheet where that rectangle is. That is what makes rejection cheap and what
// keeps a failure costed at one opening instead of the document.
const MM_PER_PT = (25.4 / 72) * 100;   // 1:100
const EPS = 0.1;                        // pt: what counts as axis-aligned

export const isV = (s) => Math.abs(s.ax - s.bx) <= EPS && Math.abs(s.ay - s.by) > 0.4;
export const isH = (s) => Math.abs(s.ay - s.by) <= EPS && Math.abs(s.ax - s.bx) > 0.4;
const vSpan = (s) => [Math.min(s.ay, s.by), Math.max(s.ay, s.by)];
const hSpan = (s) => [Math.min(s.ax, s.bx), Math.max(s.ax, s.bx)];

/** Merge collinear segments that TOUCH. A stile drawn in three pieces is one
 *  stile; a stile and an unrelated building line at the same x are not, so a
 *  gap is never bridged and containment never merges. */
function runs(list, axisOf, spanOf) {
  const byAxis = new Map();
  for (const s of list) {
    const key = Math.round(axisOf(s) / 0.15);
    (byAxis.get(key) ?? byAxis.set(key, []).get(key)).push(s);
  }
  const out = [];
  for (const group of byAxis.values()) {
    const spans = group.map(spanOf).sort((a, b) => a[0] - b[0]);
    let [lo, hi] = spans[0];
    for (let i = 1; i < spans.length; i++) {
      if (spans[i][0] <= hi + 0.4) { hi = Math.max(hi, spans[i][1]); continue; }
      out.push({ at: axisOf(group[0]), lo, hi });
      [lo, hi] = spans[i];
    }
    out.push({ at: axisOf(group[0]), lo, hi });
  }
  return out;
}

/** Every axis-aligned member on the page, as maximal runs. */
export function members(segs) {
  return {
    v: runs(segs.filter(isV), (s) => s.ax, vSpan),
    h: runs(segs.filter(isH), (s) => s.ay, hSpan),
  };
}

/** Raw axis-aligned members, de-duplicated. NOT merged into runs.
 *
 *  Merging was tried and is wrong here: a frame stile is routinely collinear
 *  with — and contained inside — a longer building line at the same x, and any
 *  merge that joins overlapping spans swallows the stile into the wall. The
 *  drawn segment IS the member; that is what the sheet actually states. */
function rawMembers(segs) {
  const seen = new Set();
  const keep = [];
  for (const s of segs) {
    const k = `${Math.round(s.ax * 20)},${Math.round(s.ay * 20)},${Math.round(s.bx * 20)},${Math.round(s.by * 20)}`;
    const k2 = `${Math.round(s.bx * 20)},${Math.round(s.by * 20)},${Math.round(s.ax * 20)},${Math.round(s.ay * 20)}`;
    if (seen.has(k) || seen.has(k2)) continue;
    seen.add(k);
    keep.push(s);
  }
  return {
    v: keep.filter(isV).map((s) => ({ at: s.ax, lo: Math.min(s.ay, s.by), hi: Math.max(s.ay, s.by) })),
    h: keep.filter(isH).map((s) => ({ at: s.ay, lo: Math.min(s.ax, s.bx), hi: Math.max(s.ax, s.bx) })),
  };
}

export function findFrames(segs, widthMm, heightMm, tolPct = 2) {
  const wPt = widthMm / MM_PER_PT, hPt = heightMm / MM_PER_PT;
  const tol = tolPct / 100;
  const { v, h } = rawMembers(segs);
  const stiles = v.filter((r) => Math.abs(r.hi - r.lo - hPt) <= hPt * tol);

  const cands = [];
  for (let i = 0; i < stiles.length; i++) {
    for (let j = i + 1; j < stiles.length; j++) {
      const [a, b] = stiles[i].at < stiles[j].at ? [stiles[i], stiles[j]] : [stiles[j], stiles[i]];
      if (Math.abs(b.at - a.at - wPt) > wPt * tol) continue;
      if (Math.abs(a.lo - b.lo) > hPt * tol || Math.abs(a.hi - b.hi) > hPt * tol) continue;
      const y0 = (a.lo + b.lo) / 2, y1 = (a.hi + b.hi) / 2;
      const rail = (y) => h.some((r) => Math.abs(r.at - y) <= 1.2 && r.lo <= a.at + 1.0 && r.hi >= b.at - 1.0);
      if (!rail(y0) || !rail(y1)) continue;
      cands.push({ x0: a.at, x1: b.at, y0, y1,
        wMm: (b.at - a.at) * MM_PER_PT, hMm: (y1 - y0) * MM_PER_PT });
    }
  }
  const kept = [];
  for (const c of cands.sort((p, q) => (q.x1 - q.x0) * (q.y1 - q.y0) - (p.x1 - p.x0) * (p.y1 - p.y0))) {
    if (kept.some((k) => Math.abs(k.x0 - c.x0) < 3 && Math.abs(k.y0 - c.y0) < 3)) continue;
    kept.push(c);
  }
  return kept;
}

/** Every vertical inside the frame that runs essentially its full height,
 *  in mm from the left edge, with its length as a fraction of the frame.
 *
 *  This is the raw reading — the design's "eight verticals" for W1 — and it is
 *  deliberately unfiltered, because which of these bound a LEAF is a separate
 *  judgement made below and worth being able to check separately. */
export function frameVerticals(segs, f) {
  const { v } = rawMembers(segs);
  const h = f.y1 - f.y0;
  const out = v
    .filter((r) => r.at >= f.x0 - 0.4 && r.at <= f.x1 + 0.4
      && r.lo >= f.y0 - 1.5 && r.hi <= f.y1 + 1.5 && (r.hi - r.lo) / h >= 0.9)
    .map((r) => ({ mm: (r.at - f.x0) * MM_PER_PT, frac: (r.hi - r.lo) / h }))
    .sort((a, b) => a.mm - b.mm);
  // The same line drawn twice is one line.
  return out.filter((r, i) => i === 0 || r.mm - out[i - 1].mm > 1);
}

/** Of those, the ones that bound a leaf.
 *
 *  A frame elevation draws three concentric bands and only one of them is the
 *  sash: the OUTER frame at ~100% of the opening, the SASH at ~97%, and the
 *  GLASS line at ~95%. For W1 those are {0, 2048.9}, {25.4, 723.9, 740.8,
 *  2027.8} and {50.8, 698.5} — and it is the sash band, and only the sash band,
 *  that yields the 698.5/1287.0 leaves the design records and the 596.9/601.1
 *  that land within 3.1mm of a figure W4's drafter wrote by hand.
 *
 *  Picked as the MODAL length rather than a fixed percentage: the bands are a
 *  property of how thick this practice draws its sections, not a constant, and
 *  the sash band is the one that recurs once per leaf edge. A tolerance dressed
 *  up as a rule is how the glass line got silently dropped the first time. */
export function leafBounds(segs, f) {
  const all = frameVerticals(segs, f).filter((r) => r.frac < 0.995);
  if (!all.length) return [];
  const bucket = (r) => Math.round(r.frac * 200);          // 0.5% bands
  const tally = new Map();
  for (const r of all) tally.set(bucket(r), (tally.get(bucket(r)) ?? 0) + 1);
  const modal = [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  return all.filter((r) => bucket(r) === modal).map((r) => r.mm);
}

/** Diagonals whose whole extent sits inside the box — the operation symbol. */
export function diagonals(segs, box) {
  return segs.filter((s) => {
    if (isV(s) || isH(s)) return false;
    if (Math.abs(s.ax - s.bx) < 0.8 || Math.abs(s.ay - s.by) < 0.8) return false;
    const inX = (x) => x >= box.x0 - 0.4 && x <= box.x1 + 0.4;
    const inY = (y) => y >= box.y0 - 0.4 && y <= box.y1 + 0.4;
    return inX(s.ax) && inX(s.bx) && inY(s.ay) && inY(s.by);
  });
}

export { MM_PER_PT };
