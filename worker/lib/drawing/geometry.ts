// ═══════════════════════════════════════════════════════════════════════════════
// GEOMETRY PRIMITIVES — pure, testable, no PDF and no I/O
//
// Everything the recognisers need to reason about shapes, in one place so it can
// be unit-tested without a document. The detectors above this layer should read
// as statements about drawings, not about arithmetic.
// ═══════════════════════════════════════════════════════════════════════════════
import type { Box, Pt, Region, Seg } from "./types";

export const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

export const segLength = (s: Seg): number => dist(s.a, s.b);

/** Degrees 0..180, unsigned — a segment has no direction for our purposes. */
export function segAngleDeg(s: Seg): number {
  const d = (Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x) * 180) / Math.PI;
  const a = ((d % 180) + 180) % 180;
  return a;
}

/** Within `tol` degrees of vertical. CAD output is rarely exactly axis-aligned:
 *  a mullion drawn at 89.7° is a mullion. */
export const isVertical = (s: Seg, tol = 2): boolean => Math.abs(segAngleDeg(s) - 90) <= tol;
export const isHorizontal = (s: Seg, tol = 2): boolean => {
  const a = segAngleDeg(s);
  return a <= tol || a >= 180 - tol;
};

export const boxWidth = (b: Box): number => b.x1 - b.x0;
export const boxHeight = (b: Box): number => b.y1 - b.y0;
export const boxArea = (b: Box): number => Math.max(0, boxWidth(b)) * Math.max(0, boxHeight(b));

export function boxOf(points: Pt[]): Box {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export const boxOfSegs = (segs: Seg[]): Box => boxOf(segs.flatMap((s) => [s.a, s.b]));

export function contains(outer: Box, inner: Box, pad = 0): boolean {
  return inner.x0 >= outer.x0 - pad && inner.x1 <= outer.x1 + pad
    && inner.y0 >= outer.y0 - pad && inner.y1 <= outer.y1 + pad;
}

export function containsPt(b: Box, p: Pt, pad = 0): boolean {
  return p.x >= b.x0 - pad && p.x <= b.x1 + pad && p.y >= b.y0 - pad && p.y <= b.y1 + pad;
}

export function intersects(a: Box, b: Box): boolean {
  return !(a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0);
}

/** Page space (origin bottom-left) → a browser-shaped region (origin top-left,
 *  fractions). Flipped exactly once, here, because every consumer is a browser
 *  and doing it at the call site is how it gets flipped twice. */
export function toRegion(b: Box, pageWidth: number, pageHeight: number): Region {
  const w = pageWidth || 1, h = pageHeight || 1;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return [clamp(b.x0 / w), clamp(1 - b.y1 / h), clamp(b.x1 / w), clamp(1 - b.y0 / h)];
}

/** Merge segments that are the same line drawn twice.
 *
 *  CAD draws a mullion as a PAIR of parallel lines — the section thickness of the
 *  frame member. Left unmerged, every mullion becomes two, and a three-panel
 *  window reads as five. This is the single most consequential piece of cleanup
 *  in the whole reader.
 *
 *  `tol` is an absolute page-space distance; callers pass a fraction of the frame
 *  width so the tolerance scales with the drawing. */
export function collapseParallel(segs: Seg[], tol: number): Seg[] {
  const out: Seg[] = [];
  const used = new Set<number>();
  for (let i = 0; i < segs.length; i++) {
    if (used.has(i)) continue;
    const group = [segs[i]];
    used.add(i);
    for (let j = i + 1; j < segs.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(segAngleDeg(segs[i]) - segAngleDeg(segs[j])) > 2) continue;
      // Distance between the two lines, measured at their midpoints.
      const mi = midpoint(segs[i]), mj = midpoint(segs[j]);
      if (dist(mi, mj) > tol) continue;
      // …and they must actually overlap along their shared axis, or a mullion
      // would swallow an unrelated segment that happens to be near it.
      if (!overlapsAlongAxis(segs[i], segs[j])) continue;
      group.push(segs[j]);
      used.add(j);
    }
    out.push(mergeCollinear(group));
  }
  return out;
}

export const midpoint = (s: Seg): Pt => ({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 });

function overlapsAlongAxis(p: Seg, q: Seg): boolean {
  const vertical = isVertical(p, 10);
  const [p0, p1] = vertical ? [Math.min(p.a.y, p.b.y), Math.max(p.a.y, p.b.y)] : [Math.min(p.a.x, p.b.x), Math.max(p.a.x, p.b.x)];
  const [q0, q1] = vertical ? [Math.min(q.a.y, q.b.y), Math.max(q.a.y, q.b.y)] : [Math.min(q.a.x, q.b.x), Math.max(q.a.x, q.b.x)];
  const overlap = Math.min(p1, q1) - Math.max(p0, q0);
  return overlap > 0.4 * Math.min(p1 - p0, q1 - q0);
}

/** One segment spanning the whole group, on the group's mean line. */
function mergeCollinear(group: Seg[]): Seg {
  if (group.length === 1) return group[0];
  const pts = group.flatMap((s) => [s.a, s.b]);
  const b = boxOf(pts);
  const vertical = isVertical(group[0], 10);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  return {
    a: vertical ? { x: cx, y: b.y0 } : { x: b.x0, y: cy },
    b: vertical ? { x: cx, y: b.y1 } : { x: b.x1, y: cy },
    // A pair drawn dashed is dashed; a pair where either is dashed is treated as
    // dashed, because a symbol's meaning turns on it and the safer read is the
    // one that keeps the observation rather than discarding it.
    dashed: group.some((s) => s.dashed),
    width: Math.max(...group.map((s) => s.width)),
    groupId: group[0].groupId,
  };
}

/** Does this run of points describe a circle?
 *
 *  Accepts a closed subpath of Béziers OR a many-sided polygon, which is how
 *  different CAD exporters emit the same tag circle. The test is that sampled
 *  radius stays within `maxVariance` of the mean over enough of the sweep — a
 *  rounded rectangle fails it, an octagon annotation passes and is harmless. */
export function circleFit(points: Pt[], maxVariance = 0.03): { centre: Pt; r: number; variance: number } | null {
  if (points.length < 6) return null;
  const centre = {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
  const radii = points.map((p) => dist(p, centre));
  const r = radii.reduce((s, v) => s + v, 0) / radii.length;
  if (r <= 0) return null;
  const variance = Math.max(...radii.map((v) => Math.abs(v - r))) / r;
  return variance <= maxVariance ? { centre, r, variance } : null;
}

/** Which edge of `box` this point sits on, if any — the primitive the symbol
 *  reader uses to name an apex. `tol` is a fraction of the smaller box side. */
export function edgeOf(box: Box, p: Pt, tol = 0.08): "top" | "bottom" | "left" | "right" | null {
  const w = boxWidth(box), h = boxHeight(box);
  const t = tol * Math.min(w, h);
  const onX = p.x >= box.x0 - t && p.x <= box.x1 + t;
  const onY = p.y >= box.y0 - t && p.y <= box.y1 + t;
  if (!onX || !onY) return null;
  // Page space has y increasing upward, so the visual TOP is the high y.
  if (Math.abs(p.y - box.y1) <= t) return "top";
  if (Math.abs(p.y - box.y0) <= t) return "bottom";
  if (Math.abs(p.x - box.x0) <= t) return "left";
  if (Math.abs(p.x - box.x1) <= t) return "right";
  return null;
}
