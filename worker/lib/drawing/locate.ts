import type { Orientation, PageInventory, PageLine, PageText, PageWord } from "./contract";
import { normalizeOpeningRef } from "../ai/energyMap";

export type Storey = "ground" | "first";
export type Edge = "top" | "bottom" | "left" | "right";
export type NorthResolution = { northArrowDegrees: 0 | 90 | 180 | 270; source: string };

export interface TextPlacement {
  elevation: string;
  orderOnWall: number;
  roomLabel: string | null;
  storey: Storey | null;
}

type Footprint = { x0: number; top: number; x1: number; bottom: number };
type Candidate = { tag: string; edge: Edge; along: number; roomLabel: string | null };

const STOP = new Set(["DP", "SS", "WIP", "RL", "FFL", "N", "S", "E", "W"]);

function centre(word: PageWord): [number, number] {
  return [(word.x0 + word.x1) / 2, (word.top + word.bottom) / 2];
}

function lineLength(line: PageLine): number {
  return Math.hypot(line.x1 - line.x0, line.bottom - line.top);
}

function footprint(lines: PageLine[], geo: Pick<PageInventory, "widthPt" | "heightPt">): Footprint | null {
  const minLength = Math.min(geo.widthPt, geo.heightPt) * 0.08;
  const usable = lines.filter((line) => {
    const cx = (line.x0 + line.x1) / 2;
    const cy = (line.top + line.bottom) / 2;
    return lineLength(line) >= minLength && cx < geo.widthPt * 0.88 && cy < geo.heightPt * 0.92;
  });
  if (usable.length < 4) return null;
  const xs = usable.flatMap((line) => [line.x0, line.x1]);
  const ys = usable.flatMap((line) => [line.top, line.bottom]);
  const result = { x0: Math.min(...xs), top: Math.min(...ys), x1: Math.max(...xs), bottom: Math.max(...ys) };
  if (result.x1 - result.x0 < geo.widthPt * 0.15 || result.bottom - result.top < geo.heightPt * 0.15) return null;
  return result;
}

function nearestEdge(word: PageWord, box: Footprint): Edge {
  const [x, y] = centre(word);
  const distances: [Edge, number][] = [
    ["left", Math.abs(x - box.x0)], ["right", Math.abs(x - box.x1)],
    ["top", Math.abs(y - box.top)], ["bottom", Math.abs(y - box.bottom)],
  ];
  return distances.sort((a, b) => a[1] - b[1])[0][0];
}

function inside(word: PageWord, box: Footprint): boolean {
  const [x, y] = centre(word);
  return x > box.x0 && x < box.x1 && y > box.top && y < box.bottom;
}

function roomFor(tagWord: PageWord, words: PageWord[], box: Footprint, vocabulary: Set<string>): string | null {
  const [tx, ty] = centre(tagWord);
  const candidates = words.filter((word) => {
    const text = word.text.trim();
    const upper = text.toUpperCase();
    if (!inside(word, box) || STOP.has(upper) || vocabulary.has(normalizeOpeningRef(text) ?? "")) return false;
    if (/^\d{3,}(?:\.\d+)?$/.test(text)) return false;
    return /^(?:[A-Z][A-Z-]{1,}|\d{1,2})$/.test(upper);
  }).sort((a, b) => a.top - b.top || a.x0 - b.x0);
  const groups: PageWord[][] = [];
  for (const word of candidates) {
    const prior = groups.at(-1);
    const previous = prior?.at(-1);
    const height = Math.max(word.bottom - word.top, previous ? previous.bottom - previous.top : 0, 1);
    if (previous && sameLineWord(previous, word) && word.x0 - previous.x1 <= height * 2) prior.push(word);
    else groups.push([word]);
  }
  // Ponytail calibration knob: nominally 15%; 18% tolerates a label's text
  // width while remaining far inside the footprint rather than page-wide.
  const cap = Math.hypot(box.x1 - box.x0, box.bottom - box.top) * 0.18;
  const ranked = groups.map((group) => {
    const x = (Math.min(...group.map((word) => word.x0)) + Math.max(...group.map((word) => word.x1))) / 2;
    const y = (Math.min(...group.map((word) => word.top)) + Math.max(...group.map((word) => word.bottom))) / 2;
    return { text: group.map((word) => word.text.trim()).join(" ").toUpperCase(), distance: Math.hypot(x - tx, y - ty) };
  }).filter((group) => group.distance <= cap && !/^\d+$/.test(group.text))
    .sort((a, b) => a.distance - b.distance);
  return ranked[0]?.text ?? null;
}

function sameLineWord(a: PageWord, b: PageWord): boolean {
  const height = Math.max(a.bottom - a.top, b.bottom - b.top, 1);
  return Math.abs((a.top + a.bottom - b.top - b.bottom) / 2) <= height;
}

function storeyOf(text: string): Storey | null {
  if (/\b(?:FIRST|UPPER)\s+FLOOR\b/i.test(text)) return "first";
  if (/\bGROUND\s+FLOOR\b/i.test(text)) return "ground";
  return null;
}

export function elevationOrderKey(face: Orientation, alongWallPt: number, wallLengthPt: number): number {
  if (["E", "NE", "SE", "S"].includes(face)) return wallLengthPt - alongWallPt;
  return alongWallPt;
}

function orderValue(edge: Edge, word: PageWord, box: Footprint): number {
  const [x, y] = centre(word);
  const along = edge === "top" || edge === "bottom" ? x - box.x0 : y - box.top;
  const length = edge === "top" || edge === "bottom" ? box.x1 - box.x0 : box.bottom - box.top;
  const face: Orientation = ({ top: "N", right: "E", bottom: "S", left: "W" } as const)[edge];
  return elevationOrderKey(face, along, length);
}

export function locateFloorplanPage(
  page: PageText,
  geo: Pick<PageInventory, "widthPt" | "heightPt">,
  vocabulary: string[],
): { placements: Record<string, TextPlacement>; markerEdges: Record<string, Edge>; unplaced: string[] } {
  const normalizedVocabulary = new Set(vocabulary.map((tag) => normalizeOpeningRef(tag)).filter((tag): tag is string => !!tag));
  const box = footprint(page.lines ?? [], geo);
  if (!box) return { placements: {}, markerEdges: {}, unplaced: [...normalizedVocabulary] };

  const markerByEdge = new Map<Edge, string>();
  const ambiguousEdges = new Set<Edge>();
  for (const word of page.words) {
    const label = word.text.trim().toUpperCase();
    if (!/^[A-D]$/.test(label) || inside(word, box)) continue;
    const edge = nearestEdge(word, box);
    if (markerByEdge.has(edge) && markerByEdge.get(edge) !== label) ambiguousEdges.add(edge);
    markerByEdge.set(edge, label);
  }

  const candidates: Candidate[] = [];
  for (const word of page.words) {
    const tag = normalizeOpeningRef(word.text);
    if (!tag || !normalizedVocabulary.has(tag)) continue;
    const edge = nearestEdge(word, box);
    const elevation = ambiguousEdges.has(edge) ? null : markerByEdge.get(edge);
    if (!elevation) continue;
    candidates.push({ tag, edge, along: orderValue(edge, word, box), roomLabel: roomFor(word, page.words, box, normalizedVocabulary) });
  }

  const placements: Record<string, TextPlacement> = {};
  for (const edge of ["top", "bottom", "left", "right"] as const) {
    const onEdge = candidates.filter((candidate) => candidate.edge === edge).sort((a, b) => a.along - b.along);
    onEdge.forEach((candidate, index) => {
      placements[candidate.tag] = {
        elevation: markerByEdge.get(edge)!, orderOnWall: index + 1,
        roomLabel: candidate.roomLabel, storey: storeyOf(page.text),
      };
    });
  }
  const markerEdges = Object.fromEntries([...markerByEdge]
    .filter(([edge]) => !ambiguousEdges.has(edge))
    .map(([edge, label]) => [label, edge])) as Record<string, Edge>;
  return { placements, markerEdges, unplaced: [...normalizedVocabulary].filter((tag) => !placements[tag]) };
}

const ORIENTATIONS: Orientation[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const EDGE_DEGREES: Record<Edge, number> = { top: 0, right: 90, bottom: 180, left: 270 };

/** northArrowDegrees is clockwise from page-top. The conversion is pure and
 * applies the same outside-face rule to every opening. */
export function orientationsFromNorth(markerEdges: Record<string, Edge>, northArrowDegrees: number): Record<string, { facing: Orientation }> {
  const result: Record<string, { facing: Orientation }> = {};
  for (const [label, edge] of Object.entries(markerEdges)) {
    const bearing = (EDGE_DEGREES[edge] - northArrowDegrees + 360) % 360;
    result[label] = { facing: ORIENTATIONS[Math.round(bearing / 45) % 8] };
  }
  return result;
}

/** Resolve only explicit text-coordinate evidence before asking vision: the
 * N/NORTH label must sit around a compass/arrow anchor. */
export function resolveNorth(pages: PageText[]): NorthResolution | null {
  for (const page of pages) {
    const labels = page.words.filter((word) => /^(?:N|NORTH)$/.test(word.text.trim().toUpperCase()));
    const anchors = page.words.filter((word) => /^(?:COMPASS|NORTHPOINT|NORTH-POINT|ARROW)$/.test(word.text.trim().toUpperCase()));
    for (const label of labels) {
      const [lx, ly] = centre(label);
      const anchor = [...anchors].sort((a, b) => {
        const [ax, ay] = centre(a); const [bx, by] = centre(b);
        return Math.hypot(ax - lx, ay - ly) - Math.hypot(bx - lx, by - ly);
      })[0];
      if (!anchor) continue;
      const [ax, ay] = centre(anchor);
      const dx = lx - ax; const dy = ly - ay;
      if (Math.hypot(dx, dy) > 100) continue;
      const degrees = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 90 : 270) : (dy > 0 ? 180 : 0);
      return { northArrowDegrees: degrees, source: `page ${page.pageNo} compass label` };
    }
  }
  return null;
}
