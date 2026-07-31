import type { CatalogueCandidate, OpeningInput, PerformanceVariant } from "./types";
import type { RuleOutcome } from "./rules";

const text = (v: string | null | undefined) => (v || "").toLowerCase();
// Classification from the glazing option's technicalValue (the one source of
// truth, not a parsed build-up). Enum-aware (M2): "double glazed or better" and
// "low-E" are prefix/suffix on the {single|double|triple}_{clear|toned|low_e} class.
const isDouble = (v: PerformanceVariant) => /^(double|triple)_/.test(v.glazingClass ?? "");
const isLowE = (v: PerformanceVariant) => /_lowe$/.test(v.glazingClass ?? "");

function scheduleAffinity(opening: OpeningInput, variant: PerformanceVariant): number {
  const req = opening.scheduleRequirements;
  if (!req) return 0;
  let score = 0;
  if (req.doubleGlazed === true) score += isDouble(variant) ? 4 : -8;
  if (req.doubleGlazed === false) score += isDouble(variant) ? -3 : 2;
  const glass = text(req.glassDescription);
  if (glass.includes("low-e") || glass.includes("low e")) score += isLowE(variant) ? 4 : -5;
  return score;
}

function contextAffinity(opening: OpeningInput, variant: PerformanceVariant): number {
  const risk = opening.thermalContext?.riskBand;
  const u = variant.uValue;
  if (risk === "high") {
    return (variant.frameTechnology === "thermally_broken" ? 2 : 0) +
      (isLowE(variant) ? 1 : 0) + (u == null ? -2 : Math.max(0, 4 - u));
  }
  if (risk === "medium") {
    return (isDouble(variant) ? 1.5 : 0) + (u == null ? -1 : Math.max(0, 3.5 - u) * 0.35);
  }
  return isDouble(variant) ? 0.5 : 0;
}

/** Relative fit of one already-hard-rule-eligible exact variant to schedule and
 * building context. This is advisory ranking only; it never bypasses rules. */
export function variantAffinityScore(opening: OpeningInput, variant: PerformanceVariant | null): number {
  if (!variant) return 0;
  const raw = scheduleAffinity(opening, variant) + contextAffinity(opening, variant);
  return Math.max(0, Math.min(1, 0.5 + raw / 12));
}

// Glass is the U-value lever and is MANDATORY, so hard-rule eligibility must
// never collapse to [] on thermal grounds. Final glass selection is the weighted
// ranker (rank.ts), not a standalone selector.
export function eligiblePerformanceVariants(
  candidate: CatalogueCandidate,
  outcome: RuleOutcome,
): PerformanceVariant[] {
  return candidate.performanceVariants.filter(
    (variant) => variant.published && outcome.eligibleVariantIds.includes(variant.variantId),
  );
}

