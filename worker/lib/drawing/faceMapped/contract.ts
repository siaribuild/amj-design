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
   * one, otherwise the direction it faces. Never a vocabulary of ours. */
  face: string;
  faceEvidence: "marker" | "orientation";
  planEvidenceBoxPt: CropBoxPt;
  wallOrder: number;
  faceOpeningCount: number;
  alongWallFraction: number | null;
  distanceFromStartPt: number;
  confidence: "verified" | "ambiguous";
  basis: string[];
}

export type PlanPlacementOutcome =
  | { state: "resolved"; tag: string; placement: PlanOpeningPlacement }
  | { state: "unresolved"; tag: string; reason: string };
