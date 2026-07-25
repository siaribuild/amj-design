import type { CatalogueCandidate, OpeningInput, PerformanceVariant } from "./types";
import type { RuleOutcome } from "./rules";

const text = (v: string | null | undefined) => (v || "").toLowerCase();
const isDouble = (v: PerformanceVariant) =>
  /\b(double|dg|igu|insulated)\b/.test(text(v.glassBuildUp));
const isLowE = (v: PerformanceVariant) =>
  /\b(low[- ]?e|solar control|spectrally selective)\b/.test(`${text(v.glassBuildUp)} ${text(v.coating)}`);

function scheduleAffinity(opening: OpeningInput, variant: PerformanceVariant): number {
  const req = opening.scheduleRequirements;
  if (!req) return 0;
  let score = 0;
  if (req.doubleGlazed === true) score += isDouble(variant) ? 4 : -8;
  if (req.doubleGlazed === false) score += isDouble(variant) ? -3 : 2;
  const glass = text(req.glassDescription);
  if (glass.includes("low-e") || glass.includes("low e")) score += isLowE(variant) ? 4 : -5;
  if (glass.includes("argon")) score += text(variant.glassBuildUp).includes("argon") ? 3 : -3;
  if (glass && text(variant.glassBuildUp).includes(glass)) score += 3;
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

export function eligiblePerformanceVariants(
  candidate: CatalogueCandidate,
  outcome: RuleOutcome,
): PerformanceVariant[] {
  return candidate.performanceVariants.filter(
    (variant) => variant.published && outcome.eligibleVariantIds.includes(variant.variantId),
  );
}

/** Select the exact performance configuration that rules, ranking and pricing use.
 * Explicit report limits win. Without a report, schedule text and the transparent
 * building-context risk band provide a price-protective prior. */
export function choosePerformanceVariant(
  opening: OpeningInput,
  candidate: CatalogueCandidate,
  outcome: RuleOutcome,
): PerformanceVariant | null {
  const eligible = eligiblePerformanceVariants(candidate, outcome);
  if (!eligible.length) return null;

  const hasExplicit = opening.thermalContext?.requirementBasis === "explicit_energy_report" ||
    opening.requirements?.maxUValue != null ||
    opening.requirements?.minShgc != null ||
    opening.requirements?.maxShgc != null;

  return [...eligible].sort((a, b) => {
    const certified = Number(b.certified && b.dataSource === "certified") -
      Number(a.certified && a.dataSource === "certified");
    if (hasExplicit && certified) return certified;
    const affinity = (scheduleAffinity(opening, b) + contextAffinity(opening, b)) -
      (scheduleAffinity(opening, a) + contextAffinity(opening, a));
    if (affinity) return affinity;
    // Avoid unexplained over-specification: choose the closest passing Uw to the
    // explicit cap, otherwise prefer the more complete lower-U configuration.
    const cap = opening.requirements?.maxUValue;
    if (cap != null && a.uValue != null && b.uValue != null) {
      return Math.abs(cap - a.uValue) - Math.abs(cap - b.uValue);
    }
    if (a.uValue == null) return 1;
    if (b.uValue == null) return -1;
    return a.uValue - b.uValue;
  })[0];
}
