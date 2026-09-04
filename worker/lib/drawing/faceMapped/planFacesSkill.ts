import { normalizeOpeningRef } from "../../ai/energyMap";
import type { CropBoxPt } from "../contract";
import { openingTagWords } from "../locate";
import type { PlanPlacementOutcome } from "./contract";
import type { PlanPage } from "./planFaces";

/** What a look at the plan settled for one candidate: which named wall, and
 * where along it if it could tell. */
export interface RecoveredFace {
  elevation: string;
  alongWallFraction: number | null;
}

/**
 * Task 4: what a look at the plan is asked, and what it is allowed to answer.
 *
 * Separated from placement because placement must stay something that can be
 * run and judged without a model at all — this is the only part of Phase C that
 * involves one, and it is bounded to naming walls the document already names,
 * for candidates the drawing already found.
 */
/**
 * What is left to ask about after the plan has been read, page by page.
 *
 * Only openings the drawing could not place: an opening already settled by what
 * the plan prints is never sent to a model, so a set that names its walls costs
 * nothing (P2-AC9). Each candidate goes with the identity it was found under,
 * so an answer can point at one rather than describe a place (P2-AC12).
 */
export function planFaceRecoveryRequest(args: {
  outcomes: PlanPlacementOutcome[];
  pages: PlanPage[];
  roster: string[];
}): { pageNo: number; candidates: { planCandidateId: string; tag: string; boxNorm: CropBoxPt }[] }[] {
  const unplaced = new Set(args.outcomes
    .filter((outcome) => outcome.state === "unresolved")
    .map((outcome) => outcome.tag));
  if (!unplaced.size) return [];
  const rows = args.roster.map((tag) => normalizeOpeningRef(tag) ?? tag);
  const vocabulary = new Set(rows);

  return args.pages.flatMap(({ page, geometry }) => {
    const seen = new Map<string, number>();
    const candidates: { planCandidateId: string; tag: string; boxNorm: CropBoxPt }[] = [];
    for (const { tag, word } of openingTagWords(page.words, vocabulary, geometry)) {
      const occurrence = (seen.get(tag) ?? 0) + 1;
      seen.set(tag, occurrence);
      if (!unplaced.has(tag)) continue;
      candidates.push({
        planCandidateId: `${tag}_p${geometry.pageNo}_${occurrence}`,
        tag,
        boxNorm: [
          word.x0 / geometry.widthPt, word.top / geometry.heightPt,
          word.x1 / geometry.widthPt, word.bottom / geometry.heightPt,
        ],
      });
    }
    return candidates.length ? [{ pageNo: geometry.pageNo, candidates }] : [];
  });
}

/**
 * What a reader of the plan may tell us: which of the candidates we asked about
 * sits against which of the walls this document names. Nothing else.
 *
 * A candidate nobody asked about is refused, and so is a wall the document
 * never named — a face invented here would be a join key Phase D could never
 * match, and one asserted for an opening we did not ask about could overwrite
 * what the drawing settled.
 */
export function validatePlanFaceAnswer(
  raw: unknown,
  askedIds: Set<string>,
  faceNames: Set<string>,
): Map<string, RecoveredFace> {
  const answered = new Map<string, RecoveredFace>();
  if (!Array.isArray(raw)) return answered;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.planCandidateId === "string" ? record.planCandidateId : null;
    const elevation = typeof record.elevation === "string" ? record.elevation.trim().toUpperCase() : null;
    if (!id || !elevation || !askedIds.has(id) || !faceNames.has(elevation)) continue;
    // Where a tag is printed is not where its opening is: a set carrying its
    // tags on leader lines stacks them in a column, and ordering by that puts
    // several openings at one point on the wall. Whatever named the wall saw
    // the opening, so it may say where along it — bounded to the wall.
    const raw = (item as Record<string, unknown>).alongWallFraction;
    const fraction = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : null;
    // One answer per candidate: a reader that names two walls for one opening
    // has not answered, it has guessed twice.
    if (answered.has(id) && answered.get(id)!.elevation !== elevation) {
      answered.delete(id);
      continue;
    }
    answered.set(id, { elevation, alongWallFraction: fraction });
  }
  return answered;
}
