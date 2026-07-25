// Deterministic hard-rule engine (spec §8.2, §8.4). The LLM/ranker can NEVER
// override a failure here. Pure + versioned so outcomes are reproducible and
// testable against a fixture catalogue.
//
// Filters we have data for run fully: publication, operation, dimensions, and
// energy (against the estimated performance data). Filters we do NOT have data
// for (composite geometry, option compatibility) degrade to a manual-review flag
// rather than a false pass. An energy match made against ESTIMATED (uncertified)
// performance data passes only as an assumption-based commercial estimate —
// never as a certified compliance pass (spec §13, safety invariant).
import type { CatalogueCandidate, OpeningInput, PerformanceVariant } from "./types";

export const RULE_VERSION = "v1";

export type FilterName =
  | "publication" | "operation" | "dimensions" | "energy"
  | "composite" | "option_compatibility" | "data_completeness";

export type Severity = "reject" | "manual_review" | "incomplete";

export interface FilterOutcome {
  filter: FilterName;
  passed: boolean;
  severity?: Severity;   // set when !passed
  reason?: string;
}

// Line-level status a candidate outcome maps onto (subset of spec §16.3 states).
export type OutcomeStatus =
  | "ready" | "needs_manual_review" | "commercial_only_estimate"
  | "catalogue_data_incomplete" | "unavailable";

export interface RuleOutcome {
  candidateId: string;
  ruleVersion: string;
  passed: boolean;            // survived every REJECT filter (auto-selectable)
  status: OutcomeStatus;
  /** True only when an energy requirement was satisfied by a CERTIFIED variant. */
  energyCertified: boolean;
  /** Variants that jointly satisfy every explicit Uw/SHGC constraint. */
  eligibleVariantIds: string[];
  filters: FilterOutcome[];
}

function checkDimensions(opening: OpeningInput, c: CatalogueCandidate): FilterOutcome {
  const rule = c.dimensionRule;
  const w = opening.widthMm ?? 0, h = opening.heightMm ?? 0;
  if (!rule) return { filter: "dimensions", passed: false, severity: "incomplete", reason: "no dimension rule" };
  if (!w || !h) return { filter: "dimensions", passed: false, severity: "manual_review", reason: "opening size unknown" };
  const within = (v, min, max) => (min == null || v >= min) && (max == null || v <= max);
  if (!within(w, rule.minWidthMm, rule.maxWidthMm) || !within(h, rule.minHeightMm, rule.maxHeightMm)) {
    return { filter: "dimensions", passed: false, severity: "reject", reason: `size ${w}×${h} outside ${rule.minWidthMm ?? "?"}–${rule.maxWidthMm ?? "?"} × ${rule.minHeightMm ?? "?"}–${rule.maxHeightMm ?? "?"} mm` };
  }
  if (rule.maxAreaM2 != null && (w * h) / 1_000_000 > rule.maxAreaM2 + 0.001) {
    return { filter: "dimensions", passed: false, severity: "reject", reason: `area ${((w * h) / 1e6).toFixed(2)} m² exceeds ${rule.maxAreaM2} m²` };
  }
  if (rule.maxAspectRatio != null) {
    const ar = Math.max(w, h) / Math.max(1, Math.min(w, h));
    if (ar > rule.maxAspectRatio + 0.01) return { filter: "dimensions", passed: false, severity: "reject", reason: `aspect ${ar.toFixed(1)} exceeds ${rule.maxAspectRatio}` };
  }
  return { filter: "dimensions", passed: true };
}

// Energy: returns pass + whether the satisfying variant was CERTIFIED. Absent
// requirement ⇒ pass (no energy constraint to meet). Requirement but no perf
// data ⇒ incomplete. Requirement met only by an estimated variant ⇒ passes but
// NOT certified (caller downgrades the line to commercial_only_estimate).
function checkEnergy(opening: OpeningInput, c: CatalogueCandidate): {
  outcome: FilterOutcome; certified: boolean; matching: PerformanceVariant[];
} {
  const req = opening.requirements;
  const maxU = req?.maxUValue ?? null, minShgc = req?.minShgc ?? null, maxShgc = req?.maxShgc ?? null;
  if (maxU == null && minShgc == null && maxShgc == null) {
    return {
      outcome: { filter: "energy", passed: true },
      certified: false,
      matching: c.performanceVariants.filter((v) => v.published),
    };
  }
  const variants = c.performanceVariants.filter((v) => v.published);
  if (!variants.length) {
    return { outcome: { filter: "energy", passed: false, severity: "incomplete", reason: "no published performance variant" }, certified: false, matching: [] };
  }
  const satisfies = (v) =>
    (maxU == null || (v.uValue != null && v.uValue <= maxU)) &&
    (minShgc == null || (v.shgc != null && v.shgc >= minShgc)) &&
    (maxShgc == null || (v.shgc != null && v.shgc <= maxShgc));
  const match = variants.filter(satisfies);
  if (!match.length) {
    return { outcome: { filter: "energy", passed: false, severity: "reject", reason: "no single variant jointly meets the energy requirement" }, certified: false, matching: [] };
  }
  const certified = match.some((v) => v.certified && v.dataSource === "certified");
  return {
    outcome: { filter: "energy", passed: true, reason: certified ? undefined : "met by estimated (uncertified) performance data" },
    certified,
    matching: match,
  };
}

export function checkHardRules(opening: OpeningInput, c: CatalogueCandidate, ruleVersion = RULE_VERSION): RuleOutcome {
  const filters: FilterOutcome[] = [];

  // Publication — repository already filters to published+versioned; assert it.
  filters.push(c.schemaVersion != null
    ? { filter: "publication", passed: true }
    : { filter: "publication", passed: false, severity: "reject", reason: "unpublished/unversioned" });

  // Operation type.
  const ops = c.configuration?.operationTypes ?? [];
  const wantsOp = opening.operationType ?? null;
  filters.push(!wantsOp || ops.includes(wantsOp)
    ? { filter: "operation", passed: true }
    : { filter: "operation", passed: false, severity: "reject", reason: `does not support operation '${wantsOp}'` });

  // Dimensions.
  filters.push(checkDimensions(opening, c));

  // Energy (against estimated/certified performance data).
  const energy = checkEnergy(opening, c);
  filters.push(energy.outcome);

  // Composite + option compatibility — no rule data yet ⇒ manual review, not a pass.
  // (Only flagged when the opening is actually a composite member; otherwise skipped.)
  if (opening.family && c.configuration?.isCompositeMember && opening.requirements) {
    // present but unmodelled — leave for a human until Phase-0 composite data lands.
  }

  const rejected = filters.some((f) => !f.passed && f.severity === "reject");
  const incomplete = filters.some((f) => !f.passed && f.severity === "incomplete");
  const review = filters.some((f) => !f.passed && f.severity === "manual_review");

  let status: OutcomeStatus;
  let passed: boolean;
  if (rejected) { status = "unavailable"; passed = false; }
  else if (incomplete) { status = "catalogue_data_incomplete"; passed = false; }
  else if (review) { status = "needs_manual_review"; passed = false; }
  else if (energyHadRequirement(opening) && !energy.certified) { status = "commercial_only_estimate"; passed = true; }
  else { status = "ready"; passed = true; }

  return {
    candidateId: c.sanityProductId,
    ruleVersion,
    passed,
    status,
    energyCertified: energy.certified,
    eligibleVariantIds: energy.matching.map((v) => v.variantId),
    filters,
  };
}

function energyHadRequirement(opening: OpeningInput): boolean {
  const r = opening.requirements;
  return !!r && (r.maxUValue != null || r.minShgc != null || r.maxShgc != null);
}
