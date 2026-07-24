// Escalation policy (LLM strategy §13.2) — SHADOW-ONLY by owner decision
// (2026-07-25): we cannot justify paying for the Pro model without knowing how
// often escalation would fire or whether it would help. So this module only
// DECIDES; the stage runner records the decision on ai_stage_runs
// (escalation_triggered + escalation_reasons) and calls the escalation model only
// when AI_ESCALATION_MODE='on'. The frequency query the owner asked for:
//
//   SELECT stage, count(*) AS fired
//     FROM ai_stage_runs WHERE escalation_triggered = 1
//    GROUP BY stage ORDER BY fired DESC;
//
// Pure: signals in, triggers out. No I/O, no env.
import type { EscalationTrigger } from "./schema";

// The measurable per-stage signals available at evaluation time. Later phases
// (reconciliation, surrogate) add fields; absent/undefined means "no signal",
// never "trigger".
export interface StageSignals {
  /** Runtime validation failed even after the one §22.3 repair attempt. */
  schemaFailedAfterRepair?: boolean;
  /** Two independent extraction passes disagreed on a critical field. */
  passesDisagree?: boolean;
  /** Confidence per §15.1 dimension, 0..1 — only CRITICAL dimensions belong here
   *  (tag, dimensions, orientation, energy values), not cosmetic ones. */
  criticalConfidence?: Record<string, number>;
  /** Structural conflict counts surfaced by the model output. */
  revisionConflicts?: number;
  unresolvedTagMappings?: number;
  dimensionMismatches?: number;
  uncertainFrameDecompositions?: number;
  orientationUnknown?: boolean;
  envelopeGaps?: boolean;
  /** A critical conclusion arrived without any supporting evidence item. */
  missingEvidenceForCriticalFact?: boolean;
  /** Surrogate result within the review margin of the threshold (Phase 5). */
  surrogateNearThreshold?: boolean;
  /** A human reviewer explicitly asked for a second model opinion. */
  reviewerRequested?: boolean;
}

/** Critical-field confidence below this would send the stage to Pro. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

export interface EscalationDecision {
  triggered: boolean;
  reasons: EscalationTrigger[];
}

export function evaluateEscalation(s: StageSignals): EscalationDecision {
  const reasons: EscalationTrigger[] = [];
  if (s.schemaFailedAfterRepair) reasons.push("schema_validation_failed_after_repair");
  if (s.passesDisagree) reasons.push("extraction_passes_disagree");
  if ((s.revisionConflicts ?? 0) > 0) reasons.push("conflicting_document_revisions");
  if ((s.unresolvedTagMappings ?? 0) > 0) reasons.push("unresolved_tag_mapping");
  if ((s.dimensionMismatches ?? 0) > 0) reasons.push("dimension_mismatch");
  if ((s.uncertainFrameDecompositions ?? 0) > 0) reasons.push("frame_decomposition_uncertain");
  if (s.orientationUnknown) reasons.push("orientation_unknown");
  if (s.envelopeGaps) reasons.push("envelope_gaps");
  if (s.missingEvidenceForCriticalFact) reasons.push("missing_evidence_for_critical_fact");
  if (s.surrogateNearThreshold) reasons.push("surrogate_near_threshold");
  if (s.reviewerRequested) reasons.push("reviewer_requested");
  if (s.criticalConfidence) {
    const low = Object.values(s.criticalConfidence).some(
      (c) => typeof c === "number" && Number.isFinite(c) && c < LOW_CONFIDENCE_THRESHOLD,
    );
    if (low) reasons.push("low_confidence_critical_field");
  }
  return { triggered: reasons.length > 0, reasons };
}
