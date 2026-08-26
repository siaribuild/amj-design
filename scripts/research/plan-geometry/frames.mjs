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
 *  A frame elevation draws concentric bands and only one is the SASH. For W1
 *  they are the outer frame at 100% of the opening, the sash at 97.4% and the
 *  glass line at 95.0%. Calibrated on W4, the one opening whose make-up its
 *  drafter also wrote in words — `2x 600mm WIDE AWNINGS`:
 *
 *      sash  band 97.6%   596.9 | 1913.5 | 601.1     3.1mm and 1.1mm out
 *      glass band 95.0%   546.1 | 2006.6 |  546.1     54mm out
 *
 *  So: the sash, and it is the OUTERMOST band that is not the frame itself.
 *  Outermost rather than most-populous — the sash sits outside the glass by
 *  construction, whereas which band has more lines depends on the drawing (D3's
 *  glass band carries four lines to its sash band's three, and picking by count
 *  reads that slider through its glazing).
 *
 *  IDENTIFYING THE FRAME, without a magic number. A band whose every line sits
 *  on the frame's own edges IS the rectangle findFrames matched, so it is
 *  discarded. This replaces a `frac < 0.995` threshold that worked only because
 *  W1's outer band happens to be drawn at exactly 100%: W2's is at 99.4% and
 *  D2's at 99.1%, both of which slipped through and were then chosen, making the
 *  whole frame a single "leaf". A band that merely REACHES an edge is kept —
 *  D3's sash band starts at the jamb, and discarding it by position would lose a
 *  real panel boundary. */
export function leafBounds(segs, f) {
  const all = frameVerticals(segs, f);
  if (!all.length) return [];
  const atEdge = (r) => r.mm < 2 || r.mm > f.wMm - 2;
  const bucket = (r) => Math.round(r.frac * 200);          // 0.5% bands
  const bands = new Map();
  for (const r of all) {
    const k = bucket(r);
    if (!bands.has(k)) bands.set(k, []);
    bands.get(k).push(r);
  }
  // A band needs at least TWO lines: one line bounds nothing, and a leaf has two
  // sides. W15 was lost to this — the rail-driven match puts its frame origin
  // 2.8mm left of the drawn frame line, so that line read as a non-edge band of
  // one, outranked the real sash band, and yielded no division at all. Requiring
  // a partition is the rule; widening the edge tolerance until 2.8 counted as
  // zero would have been another magic number.
  const usable = [...bands.entries()]
    .filter(([, rs]) => rs.length >= 2 && rs.some((r) => !atEdge(r)))
    .sort((a, b) => b[0] - a[0]);
  return usable.length ? usable[0][1].map((r) => r.mm) : [];
}

/** THE FALLBACK, when findFrames returns nothing: drive the match from the RAILS.
 *
 *  findFrames requires each stile to be its own segment of the opening's height,
 *  which is true of a window drawn in clear space and false of one whose jamb is
 *  shared with a wall line. That cost three real windows: W14, W15 and W16 sit on
 *  the upper storey of Elevation A, W14 directly above W1 at the same x, and at
 *  least one of their stiles is embedded in a longer building line. They were
 *  reported "not read", and on that basis a correct statement in the design — that
 *  W14 and W16 reproduce W1's structure — was wrongly retracted.
 *
 *  So: a stile may be PART of a longer line, provided head and sill rails bound
 *  it and span the width. That is the weaker, truer requirement.
 *
 *  It is a FALLBACK and not the primary because it is looser and it shows: run
 *  alone it returns nineteen candidates for W12 and loses D3 entirely. Precision
 *  first, recall second, and the caller keeps them apart.
 */
function dedupeSegs(segs) {
  const seen = new Set(), keep = [];
  for (const s of segs) {
    const k = `${Math.round(s.ax * 20)},${Math.round(s.ay * 20)},${Math.round(s.bx * 20)},${Math.round(s.by * 20)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    keep.push(s);
  }
  return keep;
}

export function findFramesV2(segs, widthMm, heightMm, tolPct = 2) {
  const wPt = widthMm / MM_PER_PT, hPt = heightMm / MM_PER_PT;
  const wTol = wPt * tolPct / 100, hTol = hPt * tolPct / 100;
  const d = dedupeSegs(segs);
  const V = d.filter(isV).map((s) => ({ at: s.ax, lo: Math.min(s.ay,s.by), hi: Math.max(s.ay,s.by) }));
  const H = d.filter(isH).map((s) => ({ at: s.ay, lo: Math.min(s.ax,s.bx), hi: Math.max(s.ax,s.bx) }));
  // A vertical COVERS the band if any segment at that x spans it — the segment
  // may be longer, which is the whole point.
  const covers = (x, y0, y1) => V.some((r) => Math.abs(r.at - x) <= 0.25 && r.lo <= y0 + 0.5 && r.hi >= y1 - 0.5);
  const xsIn = (y0, y1, lo, hi) => [...new Set(V
    .filter((r) => r.lo <= y0 + 0.5 && r.hi >= y1 - 0.5 && r.at >= lo - 0.5 && r.at <= hi + 0.5)
    .map((r) => Math.round(r.at * 4) / 4))];

  const out = [];
  for (let i = 0; i < H.length; i++) {
    for (let j = 0; j < H.length; j++) {
      const a = H[i], b = H[j];
      const gap = b.at - a.at;
      if (Math.abs(gap - hPt) > hTol) continue;              // b is above a
      const lo = Math.max(a.lo, b.lo), hi = Math.min(a.hi, b.hi);
      if (hi - lo < wPt - wTol) continue;                    // rails must span the width
      const xs = xsIn(a.at, b.at, lo, hi);
      for (const x0 of xs) for (const x1 of xs) {
        if (Math.abs(x1 - x0 - wPt) > wTol) continue;
        if (!covers(x0, a.at, b.at) || !covers(x1, a.at, b.at)) continue;
        out.push({ x0, x1, y0: a.at, y1: b.at, wMm: (x1-x0)*MM_PER_PT, hMm: gap*MM_PER_PT });
      }
    }
  }
  const kept = [];
  for (const c of out) if (!kept.some((k) => Math.abs(k.x0-c.x0)<1 && Math.abs(k.y0-c.y0)<1 && Math.abs(k.x1-c.x1)<1)) kept.push(c);
  return kept;
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
