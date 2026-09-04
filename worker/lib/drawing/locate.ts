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
function footprint(
  words: PageWord[],
  geo: Pick<PageInventory, "widthPt" | "heightPt">,
  vocabulary: Set<string>,
  faceNames?: Set<string>,
): Footprint | null {
  const usable = words.filter((word) => {
    const text = word.text.trim();
    const upper = text.toUpperCase();
    const [x, y] = centre(word);
    if (!text || x >= geo.widthPt * 0.85 || y >= geo.heightPt * 0.85) return false;
    if (vocabulary.has(normalizeOpeningRef(text) ?? "")) return false;
    // A wall's name marks the building, it is not part of it — the same
    // reason A-D are excluded, applied to whatever this document calls them.
    if (/^(?:S\d{1,3}|[A-D])$/i.test(upper) || STOP.has(upper) || faceNames?.has(upper)) return false;
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

function tagFootprint(words: PageWord[], geo: Pick<PageInventory, "widthPt" | "heightPt">, vocabulary: Set<string>): Footprint | null {
  const scored = words.map((word) => ({ word, tag: normalizeOpeningRef(word.text), score: sheetRefScore(word, words) }))
    .filter((item): item is { word: PageWord; tag: string; score: number } => !!item.tag && vocabulary.has(item.tag) && item.score > 0);
  const best = Math.max(0, ...scored.map(({ score }) => score));
  const tags = scored.filter(({ score }) => score === best);
  if (new Set(tags.map(({ tag }) => tag)).size < 4) return null;
  const centres = tags.map(({ word }) => centre(word));
  const result = {
    x0: Math.min(...centres.map(([x]) => x)), top: Math.min(...centres.map(([, y]) => y)),
    x1: Math.max(...centres.map(([x]) => x)), bottom: Math.max(...centres.map(([, y]) => y)),
  };
  return result.x1 - result.x0 >= geo.widthPt * 0.1 && result.bottom - result.top >= geo.heightPt * 0.1 ? result : null;
}

export const hasPlanFootprint = (
  words: PageWord[],
  geo: Pick<PageInventory, "widthPt" | "heightPt">,
  vocabulary: Set<string>,
): boolean => !!footprint(words, geo, vocabulary);

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

export function openingTagWords(
  words: PageWord[],
  vocabulary: Set<string>,
  geo?: Pick<PageInventory, "widthPt" | "heightPt">,
): { tag: string; word: PageWord; ambiguous: boolean; identityEvidence: "sheet_reference" | "visual_required" }[] {
  const byTag = new Map<string, PageWord[]>();
  for (const word of words) {
    const tag = normalizeOpeningRef(word.text);
    if (!tag || !vocabulary.has(tag) || (inDimensionChain(word, words) && sheetRefScore(word, words) === 0)) continue;
    const matches = byTag.get(tag) ?? [];
    matches.push(word);
    byTag.set(tag, matches);
  }
  const planBox = geo ? tagFootprint(words, geo, vocabulary) ?? footprint(words, geo, vocabulary) : null;
  return [...byTag].flatMap(([tag, matches]) => {
    const scored = matches.map((word) => ({ word, score: sheetRefScore(word, words) }));
    const best = Math.max(...scored.map(({ score }) => score));
    let selected = scored.filter(({ score }) => best === 0 || score === best);
    if (planBox) {
      const cap = Math.hypot(planBox.x1 - planBox.x0, planBox.bottom - planBox.top) * 0.2;
      const nearPlan = selected.filter(({ word }) => distanceToFootprint(word, planBox) <= cap);
      selected = nearPlan;
    }
    const ambiguous = selected.length > 1;
    return selected.map(({ word }) => ({
      tag, word, ambiguous,
      identityEvidence: best > 0 ? "sheet_reference" : "visual_required",
    }));
  });
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

/** The plan facts a placement needs: where the building sits on the sheet, what
 * names its walls, and which storey the sheet is. Extracted so the face-mapped
 * engine reads the same footprint the legacy placement path does rather than
 * measuring its own. */
export interface PlanPageFacts {
  footprint: { x0: number; top: number; x1: number; bottom: number } | null;
  /** Wall to label. The lossless direction: one label can sit beside two walls,
   * and keying by label would drop one of them. */
  labelByEdge: [Edge, string][];
  ambiguousEdges: Edge[];
  /** What the sheet calls its storey, in its own words — "GROUND FLOOR",
   * "LEVEL 2", "BASEMENT". Null where the sheet titles itself something this
   * cannot read as a storey at all. */
  storeyLabel: string | null;
  /** Every label near a wall, with how near, before anything is accepted or
   * refused. A plan that prints section marks beside its elevation markers
   * leaves no edge decidable on its own, and a caller that can weigh the whole
   * sheet at once resolves what per-edge judgement has to give up on. */
  markerCandidates: { label: string; edge: Edge; distancePt: number }[];
  storey: Storey | null;
}

/** The name a plan sheet gives its own storey: whatever it puts before the
 * word PLAN in its title. Keyed on the word the sheet must print rather than
 * on a list of storeys we happen to know. */
function printedStorey(titleText: string): string | null {
  const match = /\b([A-Z][A-Z0-9]*(?:\s+[A-Z0-9]+){0,2})\s+PLAN\b/.exec(titleText.toUpperCase());
  if (!match) return null;
  const label = match[1].replace(/\s+/g, " ").trim();
  return label && label !== "PLAN" ? label : null;
}

export function planPageFacts(
  page: PageText,
  geo: Pick<PageInventory, "widthPt" | "heightPt">,
  vocabulary: string[],
  /** What this document calls its faces, read from its own elevation sheets.
   * Absent, the legacy A-D convention stands and the existing engine is
   * unaffected. */
  faceNames?: Set<string>,
): PlanPageFacts {
  const normalizedVocabulary = new Set(vocabulary.map((tag) => normalizeOpeningRef(tag)).filter((tag): tag is string => !!tag));
  const box = tagFootprint(page.words, geo, normalizedVocabulary)
    ?? footprint(page.words, geo, normalizedVocabulary, faceNames);
  const titleWords = page.words.filter((word) => word.top >= geo.heightPt * 0.85);
  const titleText = titleWords.length ? titleWords.map((word) => word.text).join(" ") : page.text;
  const storey = storeyOf(titleText);
  const storeyLabel = printedStorey(titleText) ?? (storey ? storey.toUpperCase() + " FLOOR" : null);
  if (!box) return { footprint: null, labelByEdge: [], ambiguousEdges: [], markerCandidates: [], storey, storeyLabel };
  const footprintDiagonal = Math.hypot(box.x1 - box.x0, box.bottom - box.top);
  const markerByEdge = new Map<Edge, string>();
  const ambiguous = new Set<Edge>();
  const markerCandidates: { label: string; edge: Edge; distancePt: number }[] = [];
  for (const word of page.words) {
    const label = word.text.trim().toUpperCase();
    const isMarker = faceNames ? faceNames.has(label) : /^[A-D]$/.test(label);
    if (!isMarker || inside(word, box)) continue;
    const distancePt = distanceToFootprint(word, box);
    if (distancePt > footprintDiagonal * 0.25) continue;
    const edge = nearestEdge(word, box);
    markerCandidates.push({ label, edge, distancePt });
    if (markerByEdge.has(edge) && markerByEdge.get(edge) !== label) ambiguous.add(edge);
    markerByEdge.set(edge, label);
  }
  return {
    footprint: box,
    labelByEdge: [...markerByEdge],
    markerCandidates,
    ambiguousEdges: [...ambiguous],
    storey,
    storeyLabel,
  };
}

/** Which wall a word sits against, and how far along it, in plan order from
 * that wall's own start. No mirroring: which end an elevation calls first is
 * settled when an elevation is read, not here.
 *
 * The wall is the side the word lies *outside of*, not the edge line it
 * happens to be nearest. A tag printed above the top wall but close to the
 * left end is nearer the left edge line than the top one, and calling that a
 * west opening is how an opening ends up on the wrong elevation. A word
 * outside two sides at once is a corner: it is reported as such rather than
 * guessed, and a word inside the footprint falls back to its nearest edge. */
export function alongWall(word: PageWord, box: { x0: number; top: number; x1: number; bottom: number }): {
  edge: Edge; alongPt: number; wallLengthPt: number; corner: boolean;
} {
  const [x, y] = centre(word);
  const overshoot: [Edge, number][] = [
    ["left", box.x0 - x], ["right", x - box.x1],
    ["top", box.top - y], ["bottom", y - box.bottom],
  ];
  const outside = overshoot.filter(([, distance]) => distance > 0).sort((a, b) => b[1] - a[1]);
  const edge = outside.length ? outside[0][0] : nearestEdge(word, box);
  const horizontal = edge === "top" || edge === "bottom";
  return {
    edge,
    alongPt: horizontal ? x - box.x0 : y - box.top,
    wallLengthPt: horizontal ? box.x1 - box.x0 : box.bottom - box.top,
    // Two sides at once, and neither clearly further out, is a corner.
    corner: outside.length > 1 && outside[1][1] > outside[0][1] * 0.5,
  };
}

export function locateFloorplanPage(
  page: PageText,
  geo: Pick<PageInventory, "widthPt" | "heightPt">,
  vocabulary: string[],
): { placements: Record<string, TextPlacement>; markerEdges: Record<string, Edge>; unplaced: string[] } {
  const normalizedVocabulary = new Set(vocabulary.map((tag) => normalizeOpeningRef(tag)).filter((tag): tag is string => !!tag));
  const facts = planPageFacts(page, geo, vocabulary);
  const box = facts.footprint;
  if (!box) return { placements: {}, markerEdges: {}, unplaced: [...normalizedVocabulary] };
  const footprintDiagonal = Math.hypot(box.x1 - box.x0, box.bottom - box.top);
  const storey = facts.storey;
  const markerByEdge = new Map<Edge, string>(facts.labelByEdge);
  const ambiguousEdges = new Set<Edge>(facts.ambiguousEdges);

  const wordsByTag = new Map<string, PageWord[]>();
  for (const { tag, word } of openingTagWords(page.words, normalizedVocabulary, geo)) {
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
        roomLabel: candidate.roomLabel, storey,
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
