import { normalizeOpeningRef } from "../../ai/energyMap";
import type { PageInventory, PageText, PageWord } from "../contract";
import { alongWall, openingTagWords, orientationsFromNorth, planPageFacts, type Edge } from "../locate";
import type { PlanOpeningPlacement, PlanPlacementOutcome } from "./contract";

/**
 * Phase C, §7.0 step one: for each scheduled opening, which wall of the
 * building it sits in, on which storey, where along that wall, and which
 * number it is counting from that wall's own start.
 *
 * Plan order only. Which end an elevation calls first is settled when an
 * elevation is read, so nothing here mirrors.
 */
export interface PlanPage {
  page: PageText;
  geometry: Pick<PageInventory, "pageNo" | "widthPt" | "heightPt">;
}

const EDGES: Edge[] = ["top", "right", "bottom", "left"];

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
): Partial<Record<Edge, string>> {
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

  if (!best || tied) return {};
  return Object.fromEntries((best as { pairs: [Edge, string][] }).pairs);
}

interface Candidate {
  tag: string;
  planCandidateId: string;
  word: PageWord;
  pageNo: number;
  storey: string | null;
  face: string | null;
  faceEvidence: "marker" | "orientation";
  alongPt: number;
  wallLengthPt: number;
  refusal: string | null;
  basis: string[];
}

/**
 * Every row of the roster gets exactly one outcome, in the order it was given,
 * duplicates included: a schedule naming an opening twice is told so rather
 * than quietly counted once.
 *
 * An opening the plan draws but the schedule never listed is not our business —
 * the schedule is the roster, and this is finding what was ordered (owner
 * ruling, 2026-09-04).
 */
export function placeOpeningsOnPlan(args: {
  pages: PlanPage[];
  roster: string[];
  north: number | null;
}): PlanPlacementOutcome[] {
  const rows = args.roster.map((tag) => normalizeOpeningRef(tag) ?? tag);
  const named = new Map<string, number>();
  for (const tag of rows) named.set(tag, (named.get(tag) ?? 0) + 1);
  const vocabulary = new Set(rows);

  // Every printed occurrence is collected first and judged after. Resolving
  // them as they arrive lets a third occurrence overwrite the refusal the
  // second one earned.
  const candidates = new Map<string, Candidate[]>();
  for (const { page, geometry } of args.pages) {
    const facts = planPageFacts(page, geometry, [...vocabulary]);
    const edgeFacing = args.north === null ? {} : orientationsFromNorth(
      { top: "top", right: "right", bottom: "bottom", left: "left" }, args.north);
    const wallNames = nameWalls(facts.markerCandidates);
    const seen = new Map<string, number>();

    for (const { tag, word } of openingTagWords(page.words, vocabulary, geometry)) {
      const occurrence = (seen.get(tag) ?? 0) + 1;
      seen.set(tag, occurrence);
      const planCandidateId = `${tag}_p${geometry.pageNo}_${occurrence}`;
      const found = candidates.get(tag) ?? [];
      if (!facts.footprint) {
        found.push({
          tag, planCandidateId, word, pageNo: geometry.pageNo, storey: facts.storey, face: null,
          faceEvidence: "orientation", alongPt: 0, wallLengthPt: 0,
          refusal: "no building footprint on the plan page", basis: [],
        });
        candidates.set(tag, found);
        continue;
      }
      const { edge, alongPt, wallLengthPt, corner } = alongWall(word, facts.footprint);
      const marker = wallNames[edge];
      const direction = edgeFacing[edge]?.facing;
      const face = marker ?? direction ?? null;
      const refusal = corner ? "the tag sits at a corner, against two walls at once"
        : !face ? "the plan names no wall here and no north to face it by"
        : !facts.storey ? "the plan sheet does not say which storey it is"
        : null;
      found.push({
        tag, planCandidateId, word, pageNo: geometry.pageNo, storey: facts.storey, face,
        faceEvidence: marker ? "marker" : "orientation",
        alongPt, wallLengthPt, refusal,
        basis: [
          `plan page ${geometry.pageNo}`,
          marker ? `wall marked ${marker}` : `wall faces ${direction}`,
          `${Math.round(alongPt)}pt along a ${Math.round(wallLengthPt)}pt wall`,
        ],
      });
      candidates.set(tag, found);
    }
  }

  // One admissible occurrence, or none. Two is an ambiguity for Task 4's
  // visual recovery to settle, never a coin toss.
  const refused = new Map<string, string>();
  const accepted = new Map<string, Candidate>();
  for (const [tag, found] of candidates) {
    const admissible = found.filter((candidate) => !candidate.refusal);
    if (admissible.length === 1) accepted.set(tag, admissible[0]);
    else if (admissible.length > 1) {
      refused.set(tag, `tagged in more than one place on the plans (${admissible.length} occurrences)`);
    } else {
      refused.set(tag, found[0]?.refusal ?? "not tagged on any plan page");
    }
  }

  // A wall belongs to a storey, not to a sheet. Two sheets claiming the same
  // wall of the same storey would each publish an "opening 1 of n", so the
  // group is refused rather than numbered twice.
  const walls = new Map<string, Candidate[]>();
  for (const candidate of accepted.values()) {
    const key = `${candidate.storey}|${candidate.face}`;
    walls.set(key, [...(walls.get(key) ?? []), candidate]);
  }

  const placements = new Map<string, PlanOpeningPlacement>();
  for (const wall of walls.values()) {
    if (new Set(wall.map((candidate) => candidate.pageNo)).size > 1) {
      for (const candidate of wall) {
        refused.set(candidate.tag, "two plan sheets draw the same wall of the same storey");
      }
      continue;
    }
    const ordered = [...wall].sort((a, b) =>
      a.alongPt - b.alongPt || a.tag.localeCompare(b.tag, undefined, { numeric: true }));
    ordered.forEach((candidate, index) => {
      placements.set(candidate.tag, {
        tag: candidate.tag,
        planPageNo: candidate.pageNo,
        planCandidateId: candidate.planCandidateId,
        storey: candidate.storey!,
        face: candidate.face!,
        faceEvidence: candidate.faceEvidence,
        planEvidenceBoxPt: [candidate.word.x0, candidate.word.top, candidate.word.x1, candidate.word.bottom],
        wallOrder: index + 1,
        faceOpeningCount: ordered.length,
        alongWallFraction: candidate.wallLengthPt > 0
          ? Math.min(1, Math.max(0, candidate.alongPt / candidate.wallLengthPt))
          : null,
        distanceFromStartPt: candidate.alongPt,
        confidence: "verified",
        basis: candidate.basis,
      });
    });
  }

  return rows.map((tag) => {
    if ((named.get(tag) ?? 0) > 1) {
      return { state: "unresolved" as const, tag, reason: "the roster names this opening more than once" };
    }
    const placement = placements.get(tag);
    return placement
      ? { state: "resolved" as const, tag, placement }
      : { state: "unresolved" as const, tag, reason: refused.get(tag) ?? "not tagged on any plan page" };
  });
}
