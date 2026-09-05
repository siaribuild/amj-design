import { normalizeOpeningRef } from "../../ai/energyMap";
import type { CropBoxPt, PageInventory, PageText, PageWord } from "../contract";
import { alongWall, openingTagWords, planPageFacts, printedStorey, type Edge } from "../locate";
import type { PlanOpeningPlacement, PlanPlacementOutcome } from "./contract";
import { canonicalTag, rosterVocabulary } from "./tags";
import { nameWalls } from "./walls";

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

/** Two openings closer than this along a wall are one position, not two: a
 * fifth of a percent of a wall is under a millimetre at any scale a house is
 * drawn at. */
const TIED_ALONG_WALL = 0.002;

/** Where an opening sits along its wall, from 0 at one end to 1 at the other.
 * The recovered fraction when a look at the plan supplied one, and the tag's
 * own measured position otherwise. */
function alongFraction(candidate: { recoveredFraction: number | null; alongPt: number; wallLengthPt: number }): number {
  return candidate.recoveredFraction
    ?? (candidate.wallLengthPt > 0 ? Math.min(1, Math.max(0, candidate.alongPt / candidate.wallLengthPt)) : 0);
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
  /** Set where a look at the plan said where along the wall this opening is,
   * which is the only trustworthy answer when tags sit on leader lines. */
  recoveredFraction: number | null;
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
  /** What this document calls its faces, read once as a Phase A fact. */
  faceNames?: Set<string>;
  /** Which wall a look at the plan put a candidate against, by candidate id.
   * A wall named this way is placed but never called verified: the drawing did
   * not say it, something reading the drawing did. */
  faceByCandidate?: Map<string, { elevation: string; alongWallFraction: number | null }>;
  /** What each sheet is titled, where something has read it — a document
   * whose title block is drawn rather than written has no other way to say
   * which storey a plan is. */
  sheetTitles?: Map<number, string>;
  roster: string[];
}): PlanPlacementOutcome[] {
  const rows = args.roster.map((tag) => normalizeOpeningRef(tag) ?? tag);
  const named = new Map<string, number>();
  // Counted by what the tag means, not how it is spelled: W1 and W01 on one
  // schedule are the same opening named twice.
  for (const tag of rows) named.set(canonicalTag(tag), (named.get(canonicalTag(tag)) ?? 0) + 1);
  const { vocabulary, tagOf } = rosterVocabulary(args.roster);

  // Every printed occurrence is collected first and judged after. Resolving
  // them as they arrive lets a third occurrence overwrite the refusal the
  // second one earned.
  const faceNames = args.faceNames ?? new Set<string>();
  const candidates = new Map<string, Candidate[]>();
  for (const { page, geometry } of args.pages) {
    const facts = // Always the document's own names, empty set included: falling back to
    // A-D would place openings against faces this document never printed.
    planPageFacts(page, geometry, [...vocabulary], faceNames);
    const { walls: wallNames, tied: markersTied } = nameWalls(facts.markerCandidates);
    const title = args.sheetTitles?.get(geometry.pageNo);
    const storey = (title ? printedStorey(title) : null) ?? facts.storeyLabel;
    const seen = new Map<string, number>();

    for (const { tag: printed, word, ambiguous, identityEvidence } of openingTagWords(page.words, vocabulary, geometry)) {
      const tag = tagOf.get(printed) ?? printed;
      const occurrence = (seen.get(tag) ?? 0) + 1;
      seen.set(tag, occurrence);
      const planCandidateId = `${tag}_p${geometry.pageNo}_${occurrence}`;
      const found = candidates.get(tag) ?? [];
      if (!facts.footprint) {
        found.push({
          tag, planCandidateId, word, pageNo: geometry.pageNo, storey, elevation: null,
          vouched: false, alongPt: 0, wallLengthPt: 0, recoveredFraction: null,
          refusal: "no building footprint on the plan page", basis: [],
        });
        candidates.set(tag, found);
        continue;
      }
      const { edge, alongPt, wallLengthPt, corner } = alongWall(word, facts.footprint);
      const recovered = args.faceByCandidate?.get(planCandidateId);
      const recoveredFace = recovered?.elevation;
      const elevation = wallNames[edge] ?? recoveredFace ?? null;
      const refusal = corner ? "the tag sits at a corner, against two walls at once"
        : markersTied && !recoveredFace ? "the plan's wall markers can be read more than one way"
        : !elevation ? "the plan does not name this wall"
        : !storey ? "the plan sheet does not say which storey it is"
        : null;
      found.push({
        tag, planCandidateId, word, pageNo: geometry.pageNo, storey, elevation,
        vouched: !ambiguous && identityEvidence === "sheet_reference" && !recoveredFace,
        // A recovered opening is placed where it was seen, not where its tag
        // was printed; the tag only identified which opening was being asked
        // about.
        alongPt: recovered?.alongWallFraction != null ? recovered.alongWallFraction * wallLengthPt : alongPt,
        wallLengthPt, recoveredFraction: recovered?.alongWallFraction ?? null, refusal,
        basis: [
          `plan page ${geometry.pageNo}`,
          recoveredFace ? `wall read as ${elevation}` : `wall marked ${elevation}`,
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
    // Ordered by fraction of the wall, which is the one quantity every opening
    // on it expresses in the same terms. A recovered opening's position is a
    // fraction of the wall it was seen on, while its tag may be printed nearest
    // a different and shorter edge — turning that fraction back into points
    // against the wrong wall's length numbers a wall against its own positions.
    const ordered = [...wall].sort((a, b) => alongFraction(a) - alongFraction(b));
    // Two openings at the same point along a wall cannot be numbered: whichever
    // went first would be a guess, and Phase D would match on it.
    const tiedAlong = ordered.some((candidate, at) =>
      at > 0 && Math.abs(alongFraction(candidate) - alongFraction(ordered[at - 1])) < TIED_ALONG_WALL);
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
        alongWallFraction: candidate.wallLengthPt > 0 || candidate.recoveredFraction != null
          ? alongFraction(candidate) : null,
        // Points along the wall, but only where the tag's own edge is the wall
        // being measured. A recovered opening's fraction belongs to a wall this
        // never measured, and multiplying it back out invents a length.
        distanceFromStartPt: candidate.recoveredFraction == null && candidate.wallLengthPt > 0
          ? candidate.alongPt : null,
        // Placed either way — refusing an unvouched tag would lose openings on
        // every set that does not print sheet references — but a placement the
        // drawing never confirmed does not claim the confidence of one it did.
        confidence: candidate.vouched ? "verified" : "ambiguous",
        basis: candidate.basis,
      });
    });
  }

  return rows.map((tag) => {
    if ((named.get(canonicalTag(tag)) ?? 0) > 1) {
      return { state: "unresolved" as const, tag, reason: "the roster names this opening more than once" };
    }
    const placement = placements.get(tag);
    return placement
      ? { state: "resolved" as const, placement }
      : { state: "unresolved" as const, tag, reason: refused.get(tag) ?? "not tagged on any plan page" };
  });
}
