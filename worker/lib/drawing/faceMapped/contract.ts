import type { CropBoxPt } from "../contract";

/** Face-mapped engine phase types and pure geometry shared across its phases. */

/** Points a scheduled width occupies on a page printed at 1:`scaleRatio`. */
export function expectedWidthPt(widthMm: number, scaleRatio: number): number {
  return widthMm / (scaleRatio * 25.4 / 72);
}

/**
 * Phase C's answer for one opening: which wall of the building it sits in, on
 * which storey, where along that wall, and which number it is counting from
 * that wall's own start.
 *
 * `planCandidateId` names the exact printed tag this rests on, so a later
 * visual recovery can say which occurrence it read rather than inventing
 * coordinates (§7.1, P2-AC12).
 */
export interface PlanOpeningPlacement {
  tag: string;
  planPageNo: number;
  planCandidateId: string;
  storey: string;
  /** The document's own name for the wall — a printed marker where there is
   * one, otherwise the direction it faces. Never a vocabulary of ours. The
   * handover calls this the elevation, and Phase D consumes that name. */
  elevation: string;
  planEvidenceBoxPt: CropBoxPt;
  wallOrder: number;
  faceOpeningCount: number;
  alongWallFraction: number | null;
  /** Null where the wall's extent could not be established: an opening can be
   * known as third along a wall nobody could measure. */
  distanceFromStartPt: number | null;
  confidence: "verified" | "ambiguous";
  basis: string[];
}

/** One identity per outcome. A resolved outcome carries its tag inside the
 * placement, where the rest of its evidence lives; two copies of an identity
 * are two things that can disagree. */
export type PlanPlacementOutcome =
  | { state: "resolved"; placement: PlanOpeningPlacement }
  | { state: "unresolved"; tag: string; reason: string };
