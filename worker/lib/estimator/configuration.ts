import type { CatalogueCandidate, PerformanceVariant } from "./types";
import type { RuleOutcome } from "./rules";

// scheduleAffinity(), contextAffinity() and variantAffinityScore() lived here
// and are GONE (ADR 0007). They existed only to feed the deleted 0.15
// configuration weight, and every hand-tuned number in them — +4 for double
// glazing, -8 against it, a 4-minus-Uw curve, a divide-by-12 normaliser — was
// as unsourced as the weight that consumed them. What they were reaching for is
// now enforced rather than preferred: the schedule's glazing instruction is a
// hard constraint (AC-11), and thermal fitness is requirement-relative deviation
// the ladder tiers on.

// Glass is the U-value lever and is MANDATORY, so hard-rule eligibility must
// never collapse to [] on thermal grounds. Which glass wins is decided by the
// ladder, over every eligible variant priced as its own candidate — not here,
// and not by a standalone band-matcher.
export function eligiblePerformanceVariants(
  candidate: CatalogueCandidate,
  outcome: RuleOutcome,
): PerformanceVariant[] {
  return candidate.performanceVariants.filter(
    (variant) => variant.published && outcome.eligibleVariantIds.includes(variant.variantId),
  );
}
