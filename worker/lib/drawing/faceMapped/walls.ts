import type { Edge } from "../locate";

const EDGES: Edge[] = ["top", "right", "bottom", "left"];
/** More distinct labels near a footprint than any set names faces. */
const MAX_MARKER_LABELS = 8;

/**
 * Which label names which wall, decided across the whole sheet at once.
 *
 * A name belongs to one wall and a wall answers to one name, so the question is
 * not "which label is nearest this edge" but "which pairing of labels to walls
 * is nearest overall". That distinction is what a plan printing section marks
 * beside its elevation markers turns on: no edge is decidable alone — the same
 * letter can be nearest two of them — while the sheet as a whole still has
 * exactly one best answer.
 *
 * Naming more walls beats naming them closer, because an unnamed wall loses
 * every opening on it. Two assignments equally good is an ambiguity, and
 * ambiguity is not resolved by taking the first.
 */
export function nameWalls(
  candidates: { label: string; edge: Edge; distancePt: number }[],
): { walls: Partial<Record<Edge, string>>; tied: boolean } {
  const nearest = new Map<string, number>();
  for (const { label, edge, distancePt } of candidates) {
    const key = `${edge}|${label}`;
    if (!nearest.has(key) || distancePt < nearest.get(key)!) nearest.set(key, distancePt);
  }
  const labels = [...new Set(candidates.map((candidate) => candidate.label))];
  // Labels come from customer PDF text. Naming four walls from L labels walks
  // L^4 pairings, so a sheet strewn with one-letter words beside its footprint
  // is not a hard puzzle: it is a page nobody should try to solve.
  if (labels.length > MAX_MARKER_LABELS) return { walls: {}, tied: true };
  let best: { named: number; distance: number; pairs: [Edge, string][] } | null = null;
  let tied = false;

  const walk = (at: number, used: Set<string>, pairs: [Edge, string][], distance: number): void => {
    if (at === EDGES.length) {
      const scored = { named: pairs.length, distance, pairs: [...pairs] };
      if (!best || scored.named > best.named
        || (scored.named === best.named && scored.distance < best.distance - 0.001)) {
        best = scored;
        tied = false;
      } else if (best && scored.named === best.named
        && Math.abs(scored.distance - best.distance) <= 0.001
        && JSON.stringify(scored.pairs) !== JSON.stringify(best.pairs)) {
        tied = true;
      }
      return;
    }
    const edge = EDGES[at];
    walk(at + 1, used, pairs, distance);
    for (const label of labels) {
      if (used.has(label)) continue;
      const reach = nearest.get(`${edge}|${label}`);
      if (reach === undefined) continue;
      used.add(label);
      pairs.push([edge, label]);
      walk(at + 1, used, pairs, distance + reach);
      pairs.pop();
      used.delete(label);
    }
  };
  walk(0, new Set(), [], 0);

  if (tied) return { walls: {}, tied: true };
  if (!best) return { walls: {}, tied: false };
  return { walls: Object.fromEntries((best as { pairs: [Edge, string][] }).pairs), tied: false };
}
