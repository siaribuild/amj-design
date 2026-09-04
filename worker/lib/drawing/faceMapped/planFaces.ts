import { normalizeOpeningRef } from "../../ai/energyMap";
import type { CropBoxPt, PageInventory, PageText, PageWord } from "../contract";
import { alongWall, openingTagWords, orientationsFromNorth, planPageFacts } from "../locate";

/**
 * Phase C, §7.0 step one: for each scheduled opening, which wall of the
 * building it sits in, on which storey, where along that wall, and which
 * number it is counting from that wall's own start.
 *
 * Plan order only. Which end an elevation calls first is settled when an
 * elevation is read, so nothing here mirrors.
 */
export interface PlanOpeningPlacement {
  tag: string;
  planPageNo: number;
  storey: string;
  /** The document's own name for the wall — a printed marker where there is
   * one, otherwise the direction it faces. Never a vocabulary of ours. */
  face: string;
  faceEvidence: "marker" | "orientation";
  planEvidenceBoxPt: CropBoxPt;
  wallOrder: number;
  faceOpeningCount: number;
  alongWallFraction: number | null;
  basis: string[];
}

export type PlanPlacementOutcome =
  | { state: "resolved"; placement: PlanOpeningPlacement }
  | { state: "unresolved"; tag: string; reason: string };

export interface PlanPage {
  page: PageText;
  geometry: Pick<PageInventory, "pageNo" | "widthPt" | "heightPt">;
}

const boxOf = (word: PageWord): CropBoxPt => [word.x0, word.top, word.x1, word.bottom];

type Edge = "top" | "right" | "bottom" | "left";
const EDGES: Edge[] = ["top", "right", "bottom", "left"];

/**
 * Which label names which wall, decided across the whole sheet at once.
 *
 * A name belongs to one wall and a wall answers to one name, so the question
 * is not "which label is nearest this edge" but "which pairing of labels to
 * walls is nearest overall". That distinction is what a plan printing section
 * marks beside its elevation markers turns on: no edge is decidable alone —
 * the same letter can be nearest two of them — while the sheet as a whole
 * still has exactly one best answer.
 *
 * Naming more walls beats naming them closer, because an unnamed wall loses
 * every opening on it. Two assignments equally good is an ambiguity, and
 * ambiguity is not resolved by taking the first.
 */
export function nameWalls(
  candidates: { label: string; edge: Edge; distancePt: number }[],
): Record<string, string> {
  const nearest = new Map<string, number>();
  for (const { label, edge, distancePt } of candidates) {
    const key = `${edge}|${label}`;
    if (!nearest.has(key) || distancePt < nearest.get(key)!) nearest.set(key, distancePt);
  }
  const labels = [...new Set(candidates.map((candidate) => candidate.label))];
  let best: { named: number; distance: number; pairs: [Edge, string][] } | null = null;
  let tied = false;

  const walk = (at: number, used: Set<string>, pairs: [Edge, string][], distance: number): void => {
    if (at === EDGES.length) {
      const scored = { named: pairs.length, distance, pairs: [...pairs] };
      if (!best || scored.named > best.named || (scored.named === best.named && scored.distance < best.distance - 0.001)) {
        best = scored;
        tied = false;
      } else if (best && scored.named === best.named && Math.abs(scored.distance - best.distance) <= 0.001
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

  if (!best || tied) return {};
  return Object.fromEntries((best as { pairs: [Edge, string][] }).pairs.map(([edge, label]) => [edge, label]));
}

interface Located {
  tag: string;
  word: PageWord;
  pageNo: number;
  storey: string;
  face: string;
  faceEvidence: "marker" | "orientation";
  alongPt: number;
  wallLengthPt: number;
  basis: string[];
}

/**
 * Every scheduled opening gets exactly one outcome. An opening the plan draws
 * but the schedule never listed is not our business — the schedule is the
 * roster, and this is finding what was ordered (owner ruling, 2026-09-04).
 */
export function placeOpeningsOnPlan(args: {
  pages: PlanPage[];
  roster: string[];
  north: number | null;
}): PlanPlacementOutcome[] {
  const roster = args.roster
    .map((tag) => normalizeOpeningRef(tag) ?? tag)
    .filter((tag, at, all) => all.indexOf(tag) === at);
  const vocabulary = new Set(roster);
  const located = new Map<string, Located>();
  const refused = new Map<string, string>();

  for (const { page, geometry } of args.pages) {
    const facts = planPageFacts(page, geometry, roster);
    if (!facts.footprint) {
      for (const tag of roster) refused.set(tag, "no building footprint on the plan page");
      continue;
    }
    // Which way each wall faces, keyed by the wall itself. A document that
    // never named its walls still has four of them, and north says which is
    // which — that is how a set naming its faces WEST and NORTH is placed
    // without knowing that vocabulary in advance.
    const edgeFacing = args.north === null ? {} : orientationsFromNorth(
      { top: "top", right: "right", bottom: "bottom", left: "left" }, args.north);
    const wallNames = nameWalls(facts.markerCandidates);

    for (const { tag, word } of openingTagWords(page.words, vocabulary, geometry)) {
      if (located.has(tag)) {
        // Two plans showing the same tag is a placement nobody can trust.
        located.delete(tag);
        refused.set(tag, "the same opening is tagged on more than one plan page");
        continue;
      }
      const { edge, alongPt, wallLengthPt, corner } = alongWall(word, facts.footprint);
      if (corner) {
        refused.set(tag, "the tag sits at a corner, against two walls at once");
        continue;
      }
      const marker = wallNames[edge];
      const direction = edgeFacing[edge]?.facing;
      const face = marker ?? direction;
      if (!face) {
        refused.set(tag, "the plan names no wall here and no north to face it by");
        continue;
      }
      if (!facts.storey) {
        refused.set(tag, "the plan sheet does not say which storey it is");
        continue;
      }
      located.set(tag, {
        tag, word, pageNo: geometry.pageNo, storey: facts.storey, face,
        faceEvidence: marker ? "marker" : "orientation",
        alongPt, wallLengthPt,
        basis: [
          `plan page ${geometry.pageNo}`,
          marker ? `wall marked ${marker}` : `wall faces ${direction}`,
          `${Math.round(alongPt)}pt along a ${Math.round(wallLengthPt)}pt wall`,
        ],
      });
      refused.delete(tag);
    }
  }

  const byFace = new Map<string, Located[]>();
  for (const item of located.values()) {
    const key = `${item.pageNo}|${item.storey}|${item.face}`;
    byFace.set(key, [...(byFace.get(key) ?? []), item]);
  }

  const placements = new Map<string, PlanOpeningPlacement>();
  for (const wall of byFace.values()) {
    const ordered = [...wall].sort((a, b) => a.alongPt - b.alongPt || a.tag.localeCompare(b.tag, undefined, { numeric: true }));
    ordered.forEach((item, index) => {
      placements.set(item.tag, {
        tag: item.tag,
        planPageNo: item.pageNo,
        storey: item.storey,
        face: item.face,
        faceEvidence: item.faceEvidence,
        planEvidenceBoxPt: boxOf(item.word),
        wallOrder: index + 1,
        faceOpeningCount: ordered.length,
        alongWallFraction: item.wallLengthPt > 0
          ? Math.min(1, Math.max(0, item.alongPt / item.wallLengthPt))
          : null,
        basis: item.basis,
      });
    });
  }

  return roster.map((tag) => {
    const placement = placements.get(tag);
    return placement
      ? { state: "resolved" as const, placement }
      : { state: "unresolved" as const, tag, reason: refused.get(tag) ?? "not tagged on any plan page" };
  });
}
