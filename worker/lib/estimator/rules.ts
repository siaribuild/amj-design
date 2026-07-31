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
import { coerceCoherent } from "./thermal/precedence";

// v2: thermal is NON-BLOCKING (a miss warns, never rejects) and requirement
// resolution is coherence-guarded (an impossible min>max band can never zero a
// product). See docs/estimator/thermal-selection-rework-plan.md.
export const RULE_VERSION = "v2-thermal-nonblocking";

export type FilterName =
  | "publication" | "operation" | "dimensions" | "energy" | "schedule_configuration"
  | "composite" | "option_compatibility" | "data_completeness";

// "warning" keeps a candidate selectable and priceable (indicative), the other
// three eliminate it. Mirrors the customer-facing error|warning model.
export type Severity = "reject" | "manual_review" | "incomplete" | "warning";

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
  // An opening outside the published range is a WARNING, not a rejection: we
  // build a composite/custom unit, so the candidate stays selectable and is
  // priced at the REAL opening size (indicative). The aggregate below downgrades
  // any such line to commercial_only_estimate — it can never read as "ready".
  // Same contract as the deterministic matcher, so both paths agree.
  const within = (v, min, max) => (min == null || v >= min) && (max == null || v <= max);
  if (!within(w, rule.minWidthMm, rule.maxWidthMm) || !within(h, rule.minHeightMm, rule.maxHeightMm)) {
    return { filter: "dimensions", passed: false, severity: "warning", reason: `size ${w}×${h} outside ${rule.minWidthMm ?? "?"}–${rule.maxWidthMm ?? "?"} × ${rule.minHeightMm ?? "?"}–${rule.maxHeightMm ?? "?"} mm — composite/custom unit, indicative price` };
  }
  if (rule.maxAreaM2 != null && (w * h) / 1_000_000 > rule.maxAreaM2 + 0.001) {
    return { filter: "dimensions", passed: false, severity: "warning", reason: `area ${((w * h) / 1e6).toFixed(2)} m² exceeds ${rule.maxAreaM2} m² — composite/custom unit, indicative price` };
  }
  if (rule.maxAspectRatio != null) {
    const ar = Math.max(w, h) / Math.max(1, Math.min(w, h));
    if (ar > rule.maxAspectRatio + 0.01) return { filter: "dimensions", passed: false, severity: "warning", reason: `aspect ${ar.toFixed(1)} exceeds ${rule.maxAspectRatio} — composite/custom unit, indicative price` };
  }
  return { filter: "dimensions", passed: true };
}

// Energy: returns pass + whether the satisfying variant was CERTIFIED. Absent
// requirement ⇒ pass (no energy constraint to meet). Requirement but no perf
// data ⇒ incomplete. Requirement met only by an estimated variant ⇒ passes but
// NOT certified (caller downgrades the line to commercial_only_estimate).
// SCAFFOLD WS3 (thermal rework): the no-match branch returns severity:'reject',
// which eliminates the product and yields the empty line. Make thermal NON-BLOCKING
// like checkDimensions: downgrade to 'warning', return the closest-band glass set
// (never []), keep energyCertified=false, and let the line become
// commercial_only_estimate + reviewRequired. Plan §1/§4/WS3.
function checkEnergy(opening: OpeningInput, c: CatalogueCandidate): {
  outcome: FilterOutcome; certified: boolean; matching: PerformanceVariant[];
} {
  // Human-approved precedent is a conservative eligibility floor. It is not a
  // regulatory assertion and never overrides an explicit energy report, but it
  // must be more than a ranking hint: otherwise a cheaper, known-incompatible
  // configuration can still win and repeat the correction that created the
  // precedent.
  const req = effectiveThermalRequirements(opening);
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
    // WS3: thermal is NON-BLOCKING. Glass is mandatory, so a band no glass meets
    // must not eliminate the product — keep ALL published variants eligible so the
    // ranker (graded compliance) picks the CLOSEST, and warn. Mirrors the
    // dimensions contract: the line becomes commercial_only_estimate, never empty.
    return {
      outcome: { filter: "energy", passed: false, severity: "warning", reason: "no glass meets the thermal band — closest selected, confirm at review" },
      certified: false,
      matching: variants,
    };
  }
  const certified = match.some((v) => v.certified && v.dataSource === "certified");
  return {
    outcome: { filter: "energy", passed: true, reason: certified ? undefined : "met by estimated (uncertified) performance data" },
    certified,
    matching: match,
  };
}

type ThermalLimits = NonNullable<OpeningInput["requirements"]>;

// The explicit ∩ advisory intersection here can produce an impossible (min>max)
// band — the same collapse energyMap.strictest once hit. coerceCoherent (below) is
// the single guarded normalisation both sites route through.
// Exported (M4/D2): the ranker scores against the SAME enforced band this
// resolves, so rank order can no longer diverge from what the rules enforce.
export function effectiveThermalRequirements(opening: OpeningInput): ThermalLimits | null {
  const explicit = opening.requirements ?? null;
  let merged: ThermalLimits | null;
  if (opening.thermalContext?.requirementBasis === "explicit_energy_report") {
    merged = explicit;
  } else {
    const learned = opening.advisoryRequirements ?? null;
    if (!explicit) merged = learned;
    else if (!learned) merged = explicit;
    else merged = {
      maxUValue: minLimit(explicit.maxUValue, learned.maxUValue),
      minShgc: maxLimit(explicit.minShgc, learned.minShgc),
      maxShgc: minLimit(explicit.maxShgc, learned.maxShgc),
    };
  }
  if (!merged) return null;
  // WS2: guard the SECOND min>max collapse site. The explicit ∩ advisory merge
  // above (maxLimit of mins, minLimit of maxes) can produce an impossible SHGC
  // interval exactly like energyMap.strictest did — coerce it so it can never
  // zero every product.
  const { band } = coerceCoherent({ maxUValue: merged.maxUValue ?? null, minShgc: merged.minShgc ?? null, maxShgc: merged.maxShgc ?? null, shgcTarget: null });
  if (!band) return null;
  return { maxUValue: band.maxUValue, minShgc: band.minShgc, maxShgc: band.maxShgc };
}

const minLimit = (a: number | null | undefined, b: number | null | undefined) =>
  a == null ? b ?? null : b == null ? a : Math.min(a, b);
const maxLimit = (a: number | null | undefined, b: number | null | undefined) =>
  a == null ? b ?? null : b == null ? a : Math.max(a, b);

// Glass classification comes from the shared glazing option's technicalValue —
// single_clear | double_clear | double_lowe — the SINGLE source of truth. It is
// no longer parsed from a free-text build-up string (which could disagree with
// the option). Argon vs air is not a modelled distinction: our low-E option is
// argon-filled, so a schedule that merely says "argon" is not rejected here.
// Enum-aware (M2): the class is {single|double|triple}_{clear|toned|low_e}.
// "Double glazed" means double OR better (triple counts); "low-E" is any coating.
const isDoubleGlazed = (variant: PerformanceVariant) => /^(double|triple)_/.test(variant.glazingClass ?? "");
const isSingleGlazed = (variant: PerformanceVariant) => /^single_/.test(variant.glazingClass ?? "");
const isLowE = (variant: PerformanceVariant) => /_lowe$/.test(variant.glazingClass ?? "");

/**
 * Material schedule instructions are source requirements, not preferences.
 * Only requirements we can determine safely from the current catalogue contract
 * are enforced here. Unknown catalogue descriptions fail incomplete rather than
 * being interpreted as evidence of a single- or double-glazed build-up.
 */
function checkScheduleConfiguration(opening: OpeningInput, c: CatalogueCandidate): {
  outcome: FilterOutcome;
  matching: PerformanceVariant[];
} {
  const schedule = opening.scheduleRequirements;
  const glass = (schedule?.glassDescription ?? "").toLowerCase();
  const requiresDouble = schedule?.doubleGlazed === true;
  const requiresSingle = schedule?.doubleGlazed === false;
  const requiresLowE = /\blow[- ]?e\b/.test(glass);
  if (!requiresDouble && !requiresSingle && !requiresLowE) {
    return {
      outcome: { filter: "schedule_configuration", passed: true },
      matching: c.performanceVariants.filter((variant) => variant.published),
    };
  }
  const published = c.performanceVariants.filter((variant) => variant.published);
  if (!published.length) {
    return {
      outcome: {
        filter: "schedule_configuration", passed: false, severity: "incomplete",
        reason: "schedule specifies a material glazing configuration but the product has no published variants",
      },
      matching: [],
    };
  }
  const classified = published.filter((variant) => !!variant.glazingClass);
  if (!classified.length) {
    return {
      outcome: {
        filter: "schedule_configuration", passed: false, severity: "incomplete",
        reason: "schedule specifies a glazing configuration but the product's variants have no glazing option set",
      },
      matching: [],
    };
  }
  const matching = classified.filter((variant) =>
    (!requiresDouble || isDoubleGlazed(variant)) &&
    (!requiresSingle || isSingleGlazed(variant)) &&
    (!requiresLowE || isLowE(variant)));
  if (!matching.length) {
    const requested = [
      requiresDouble ? "double glazing" : null,
      requiresSingle ? "single glazing" : null,
      requiresLowE ? "Low-E coating" : null,
    ].filter(Boolean).join(", ");
    return {
      outcome: {
        filter: "schedule_configuration", passed: false, severity: "reject",
        reason: `no published variant matches the schedule requirement: ${requested}`,
      },
      matching: [],
    };
  }
  return { outcome: { filter: "schedule_configuration", passed: true }, matching };
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

  // Material schedule instructions (double/single glazing, Low-E and argon)
  // constrain the same exact variant as Uw/SHGC. The intersection below prevents
  // one variant satisfying the energy target while another satisfies the glazing
  // instruction.
  const schedule = checkScheduleConfiguration(opening, c);
  filters.push(schedule.outcome);
  const scheduleIds = new Set(schedule.matching.map((variant) => variant.variantId));
  let eligibleVariants = energy.matching.filter((variant) => scheduleIds.has(variant.variantId));
  if (energy.outcome.passed && schedule.outcome.passed &&
      (energy.matching.length || schedule.matching.length) && !eligibleVariants.length) {
    // WS3: non-blocking. When thermal and the glazing instruction cannot both be
    // met by one variant, prefer the schedule-compatible glass and WARN rather
    // than eliminate the product. The ranker picks the closest; review confirms.
    eligibleVariants = schedule.matching.length ? schedule.matching : energy.matching;
    filters.push({
      filter: "schedule_configuration", passed: false, severity: "warning",
      reason: "no single variant meets both the thermal and glazing requirement — closest selected, confirm at review",
    });
  }


  const rejected = filters.some((f) => !f.passed && f.severity === "reject");
  const incomplete = filters.some((f) => !f.passed && f.severity === "incomplete");
  const review = filters.some((f) => !f.passed && f.severity === "manual_review");
  // A warning keeps the candidate selectable + priceable, but the line is only
  // ever an indicative commercial estimate — never "ready", never certified.
  const warned = filters.some((f) => !f.passed && f.severity === "warning");

  let status: OutcomeStatus;
  let passed: boolean;
  if (rejected) { status = "unavailable"; passed = false; }
  else if (incomplete) { status = "catalogue_data_incomplete"; passed = false; }
  else if (review) { status = "needs_manual_review"; passed = false; }
  else if (warned) { status = "commercial_only_estimate"; passed = true; }
  else if (energyHadRequirement(opening) && !energy.certified) { status = "commercial_only_estimate"; passed = true; }
  else { status = "ready"; passed = true; }

  return {
    candidateId: c.sanityProductId,
    ruleVersion,
    passed,
    status,
    energyCertified: energy.certified,
    eligibleVariantIds: eligibleVariants.map((v) => v.variantId),
    filters,
  };
}

function energyHadRequirement(opening: OpeningInput): boolean {
  const r = effectiveThermalRequirements(opening);
  return !!r && (r.maxUValue != null || r.minShgc != null || r.maxShgc != null);
}
