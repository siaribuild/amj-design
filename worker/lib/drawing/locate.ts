import type { Orientation, PageInventory, PageText, PageWord } from "./contract";
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

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)))];
}

/** A text footprint is deliberately robust rather than exact: its purpose is
 * to identify the nearest exterior wall for printed tags. Opening tags,
 * dimensions, marker letters and the title-block strips cannot define it. */
function footprint(words: PageWord[], geo: Pick<PageInventory, "widthPt" | "heightPt">, vocabulary: Set<string>): Footprint | null {
  const usable = words.filter((word) => {
    const text = word.text.trim();
    const upper = text.toUpperCase();
    const [x, y] = centre(word);
    if (!text || x >= geo.widthPt * 0.85 || y >= geo.heightPt * 0.85) return false;
    if (vocabulary.has(normalizeOpeningRef(text) ?? "")) return false;
    if (/^(?:S\d{1,3}|[A-D])$/i.test(upper) || STOP.has(upper)) return false;
    if (/^(?:\d{3,}(?:\.\d+)?|\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?)$/i.test(text)) return false;
    return true;
  });
  if (usable.length < 4) return null;
  // Percentiles stop one remote annotation from stretching every wall snap.
  const result = {
    x0: percentile(usable.map((word) => word.x0), 0.05),
    top: percentile(usable.map((word) => word.top), 0.05),
    x1: percentile(usable.map((word) => word.x1), 0.95),
    bottom: percentile(usable.map((word) => word.bottom), 0.95),
  };
  if (result.x1 - result.x0 < geo.widthPt * 0.15 || result.bottom - result.top < geo.heightPt * 0.15) return null;
  return result;
}

function distanceToFootprint(word: PageWord, box: Footprint): number {
  const [x, y] = centre(word);
  const dx = x < box.x0 ? box.x0 - x : x > box.x1 ? x - box.x1 : 0;
  const dy = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
  return Math.hypot(dx, dy);
}

function sheetRefScore(tagWord: PageWord, words: PageWord[]): number {
  const [tx, ty] = centre(tagWord);
  const height = Math.max(tagWord.bottom - tagWord.top, 1);
  let score = 0;
  for (const word of words) {
    const text = word.text.trim().toUpperCase();
    if (!/^S\d{1,3}$/.test(text)) continue;
    const [x, y] = centre(word);
    if (Math.abs(x - tx) > height * 3 || Math.abs(y - ty) > height * 4) continue;
    score = Math.max(score, /^S\d{2,3}$/.test(text) ? 2 : 1);
  }
  return score;
}

function inDimensionChain(tagWord: PageWord, words: PageWord[]): boolean {
  const height = Math.max(tagWord.bottom - tagWord.top, 1);
  return words.some((word) => word !== tagWord
    && /^\d{3,}(?:\.\d+)?$/.test(word.text.trim())
    && sameLineWord(tagWord, word)
    && Math.min(Math.abs(word.x0 - tagWord.x1), Math.abs(tagWord.x0 - word.x1)) <= height * 2);
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
  const box = footprint(page.words, geo, normalizedVocabulary);
  if (!box) return { placements: {}, markerEdges: {}, unplaced: [...normalizedVocabulary] };
  const footprintDiagonal = Math.hypot(box.x1 - box.x0, box.bottom - box.top);

  const markerByEdge = new Map<Edge, string>();
  const ambiguousEdges = new Set<Edge>();
  for (const word of page.words) {
    const label = word.text.trim().toUpperCase();
    if (!/^[A-D]$/.test(label) || inside(word, box)) continue;
    if (distanceToFootprint(word, box) > footprintDiagonal * 0.2) continue;
    const edge = nearestEdge(word, box);
    if (markerByEdge.has(edge) && markerByEdge.get(edge) !== label) ambiguousEdges.add(edge);
    markerByEdge.set(edge, label);
  }

  const wordsByTag = new Map<string, PageWord[]>();
  for (const word of page.words) {
    const tag = normalizeOpeningRef(word.text);
    if (!tag || !normalizedVocabulary.has(tag)) continue;
    if (inDimensionChain(word, page.words)) continue;
    const current = wordsByTag.get(tag) ?? [];
    current.push(word);
    wordsByTag.set(tag, current);
  }

  const candidates: Candidate[] = [];
  for (const [tag, tagWords] of wordsByTag) {
    const word = [...tagWords].sort((a, b) =>
      sheetRefScore(b, page.words) - sheetRefScore(a, page.words)
      || distanceToFootprint(a, box) - distanceToFootprint(b, box))[0];
    if (!word || distanceToFootprint(word, box) > footprintDiagonal * 0.2) continue;
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
