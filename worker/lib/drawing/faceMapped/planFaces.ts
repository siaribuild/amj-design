import { normalizeOpeningRef } from "../../ai/energyMap";
import type { PageInventory, PageText, PageWord } from "../contract";
import { alongWall, openingTagWords, planPageFacts, type Edge } from "../locate";
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

const VIEW_TITLE = /^(?:ELEVATIONS?|SECTIONS?)$/;
const FACE_NAME = /^[A-Z][A-Z0-9-]{0,11}$/;

/**
 * What this document calls its faces, read from the sheets that draw them.
 *
 * A set writes `ELEVATION A` or `WEST ELEVATION` or `FRONT ELEVATION`, and
 * whichever it writes is the vocabulary its plan will mark its walls with.
 * Reading it here is what lets placement work on a document nobody anticipated,
 * instead of on the documents whose conventions happen to be in a regex.
 */
export function documentFaceNames(pages: PlanPage[]): Set<string> {
  const names = new Set<string>();
  for (const { page } of pages) {
    const rows = new Map<number, PageWord[]>();
    for (const word of page.words) {
      const line = Math.round((word.top + word.bottom) / 2 / 6);
      rows.set(line, [...(rows.get(line) ?? []), word]);
    }
    for (const row of rows.values()) {
      const ordered = [...row].sort((a, b) => a.x0 - b.x0);
      ordered.forEach((word, at) => {
        if (!VIEW_TITLE.test(word.text.trim().toUpperCase())) return;
        for (const neighbour of [ordered[at - 1], ordered[at + 1]]) {
          if (!neighbour) continue;
          const label = neighbour.text.trim().toUpperCase().replace(/[.,:]$/, "");
          if (!FACE_NAME.test(label) || VIEW_TITLE.test(label)) continue;
          const gap = neighbour.x0 > word.x1 ? neighbour.x0 - word.x1 : word.x0 - neighbour.x1;
          if (gap > Math.max(word.bottom - word.top, 1) * 2) continue;
          names.add(label);
        }
      });
    }
  }
  return names;
}

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

interface Candidate {
  tag: string;
  planCandidateId: string;
  word: PageWord;
  pageNo: number;
  storey: string | null;
  elevation: string | null;
  /** What the locator made of this occurrence: whether a rival could not be
   * told from it, and whether the drawing referenced it at all. */
  vouched: boolean;
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
  /** The document's elevation sheets, which is where it prints the names of
   * its own faces. */
  elevationPages?: PlanPage[];
  roster: string[];
}): PlanPlacementOutcome[] {
  const rows = args.roster.map((tag) => normalizeOpeningRef(tag) ?? tag);
  const named = new Map<string, number>();
  for (const tag of rows) named.set(tag, (named.get(tag) ?? 0) + 1);
  const vocabulary = new Set(rows);

  // Every printed occurrence is collected first and judged after. Resolving
  // them as they arrive lets a third occurrence overwrite the refusal the
  // second one earned.
  const faceNames = documentFaceNames(args.elevationPages ?? []);
  const candidates = new Map<string, Candidate[]>();
  for (const { page, geometry } of args.pages) {
    const facts = planPageFacts(page, geometry, [...vocabulary], faceNames.size ? faceNames : undefined);
    const { walls: wallNames, tied: markersTied } = nameWalls(facts.markerCandidates);
    const seen = new Map<string, number>();

    for (const { tag, word, ambiguous, identityEvidence } of openingTagWords(page.words, vocabulary, geometry)) {
      const occurrence = (seen.get(tag) ?? 0) + 1;
      seen.set(tag, occurrence);
      const planCandidateId = `${tag}_p${geometry.pageNo}_${occurrence}`;
      const found = candidates.get(tag) ?? [];
      if (!facts.footprint) {
        found.push({
          tag, planCandidateId, word, pageNo: geometry.pageNo, storey: facts.storeyLabel, elevation: null,
          vouched: false, alongPt: 0, wallLengthPt: 0,
          refusal: "no building footprint on the plan page", basis: [],
        });
        candidates.set(tag, found);
        continue;
      }
      const { edge, alongPt, wallLengthPt, corner } = alongWall(word, facts.footprint);
      const elevation = wallNames[edge] ?? null;
      const refusal = corner ? "the tag sits at a corner, against two walls at once"
        : markersTied ? "the plan's wall markers can be read more than one way"
        : !elevation ? "the plan does not name this wall"
        : !facts.storeyLabel ? "the plan sheet does not say which storey it is"
        : null;
      found.push({
        tag, planCandidateId, word, pageNo: geometry.pageNo, storey: facts.storeyLabel, elevation,
        vouched: !ambiguous && identityEvidence === "sheet_reference",
        alongPt, wallLengthPt, refusal,
        basis: [
          `plan page ${geometry.pageNo}`,
          `wall marked ${elevation}`,
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
    const key = `${candidate.storey}|${candidate.elevation}`;
    walls.set(key, [...(walls.get(key) ?? []), candidate]);
  }
  // A tag refused for ambiguity may still belong to one of these walls. Which
  // one is exactly what nobody knows, so every wall it could join has an
  // unknown count until recovery settles it.
  const unsettled = new Set<string>();
  for (const [tag, found] of candidates) {
    if (!refused.has(tag)) continue;
    for (const candidate of found) {
      if (candidate.refusal && candidate.refusal !== null && !candidate.elevation) continue;
      if (candidate.elevation) unsettled.add(`${candidate.storey}|${candidate.elevation}`);
    }
  }

  const placements = new Map<string, PlanOpeningPlacement>();
  for (const [key, wall] of walls) {
    if (new Set(wall.map((candidate) => candidate.pageNo)).size > 1) {
      for (const candidate of wall) {
        refused.set(candidate.tag, "two plan sheets draw the same wall of the same storey");
      }
      continue;
    }
    if (unsettled.has(key)) {
      for (const candidate of wall) {
        refused.set(candidate.tag, "another opening on this wall is unplaced, so its count is unknown");
      }
      continue;
    }
    const ordered = [...wall].sort((a, b) => a.alongPt - b.alongPt);
    // Two openings at the same point along a wall cannot be numbered: whichever
    // went first would be a guess, and Phase D would match on it.
    const tiedAlong = ordered.some((candidate, at) =>
      at > 0 && Math.abs(candidate.alongPt - ordered[at - 1].alongPt) < 0.5);
    if (tiedAlong) {
      for (const candidate of wall) {
        refused.set(candidate.tag, "two openings sit at the same point along this wall");
      }
      continue;
    }
    ordered.forEach((candidate, index) => {
      placements.set(candidate.tag, {
        tag: candidate.tag,
        planPageNo: candidate.pageNo,
        planCandidateId: candidate.planCandidateId,
        storey: candidate.storey!,
        elevation: candidate.elevation!,
        planEvidenceBoxPt: [candidate.word.x0, candidate.word.top, candidate.word.x1, candidate.word.bottom],
        wallOrder: index + 1,
        faceOpeningCount: ordered.length,
        alongWallFraction: candidate.wallLengthPt > 0
          ? Math.min(1, Math.max(0, candidate.alongPt / candidate.wallLengthPt))
          : null,
        distanceFromStartPt: candidate.wallLengthPt > 0 ? candidate.alongPt : null,
        // Placed either way — refusing an unvouched tag would lose openings on
        // every set that does not print sheet references — but a placement the
        // drawing never confirmed does not claim the confidence of one it did.
        confidence: candidate.vouched ? "verified" : "ambiguous",
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
      ? { state: "resolved" as const, placement }
      : { state: "unresolved" as const, tag, reason: refused.get(tag) ?? "not tagged on any plan page" };
  });
}
