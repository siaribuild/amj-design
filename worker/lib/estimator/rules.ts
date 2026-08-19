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

// v3: energy is an OBJECTIVE, not a filter (D4, ADR 0007). The rules engine
// eliminates on publication, operation and the schedule's glazing instruction
// only; how nearly a candidate meets a thermal requirement is the ladder's
// question, and it is asked in exactly one place. Requirement resolution stays
// coherence-guarded — an impossible min>max band can never zero a product.
export const RULE_VERSION = "v3-energy-objective";

// SCAFFOLD (product compatibility, C8): `composite` has been declared and never
// pushed since this engine was written. It is the name for "no single frame
// system could supply every unit of this opening, so the units were chosen
// independently and may not couple" — raised at severity `warning`, never
// `reject`, because an eliminated candidate is an empty line and thermal,
// dimensions and pricing all already refuse to produce one. Design §6.
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

export type DimensionRule = NonNullable<CatalogueCandidate["dimensionRule"]>;

export interface FitFacts {
  /** Can this product be asserted to serve the opening as a single unit? */
  fits: boolean;
  widthMm: number | null;
  heightMm: number | null;
  limit: {
    minWidthMm: number | null; maxWidthMm: number | null;
    minHeightMm: number | null; maxHeightMm: number | null;
    maxAreaM2: number | null; maxAspectRatio: number | null;
  } | null;
  breached: ("width" | "height" | "area" | "aspect")[];
}

/** The ONE home for fit (design §2.2). checkDimensions renders these facts as a
 *  filter outcome for the rules engine; the outcome builder renders the same
 *  facts as structured detail for the ops surface. Nobody re-derives fit — that
 *  is how the two could ever come to disagree about whether a unit is oversize.
 *
 *  A missing rule and an unknown opening size both read `fits: false`: neither
 *  can be ASSERTED to fit, and the ladder never machine-selects what it cannot
 *  assert. The rules engine still severs those two cases differently. */
export function fitFacts(
  opening: Pick<OpeningInput, "widthMm" | "heightMm">,
  rule: DimensionRule | null,
): FitFacts {
  const w = opening.widthMm ?? null, h = opening.heightMm ?? null;
  const limit = rule
    ? {
        minWidthMm: rule.minWidthMm ?? null, maxWidthMm: rule.maxWidthMm ?? null,
        minHeightMm: rule.minHeightMm ?? null, maxHeightMm: rule.maxHeightMm ?? null,
        maxAreaM2: rule.maxAreaM2 ?? null, maxAspectRatio: rule.maxAspectRatio ?? null,
      }
    : null;
  if (!rule || !w || !h) return { fits: false, widthMm: w, heightMm: h, limit, breached: [] };

  const breached: FitFacts["breached"] = [];
  const within = (v: number, min: number | null, max: number | null) =>
    (min == null || v >= min) && (max == null || v <= max);
  if (!within(w, rule.minWidthMm, rule.maxWidthMm)) breached.push("width");
  if (!within(h, rule.minHeightMm, rule.maxHeightMm)) breached.push("height");
  // The tolerances mirror the ones checkDimensions has always applied, so a
  // borderline opening does not change verdict depending on which caller asked.
  if (rule.maxAreaM2 != null && (w * h) / 1_000_000 > rule.maxAreaM2 + 0.001) breached.push("area");
  if (rule.maxAspectRatio != null) {
    const ar = Math.max(w, h) / Math.max(1, Math.min(w, h));
    if (ar > rule.maxAspectRatio + 0.01) breached.push("aspect");
  }
  return { fits: breached.length === 0, widthMm: w, heightMm: h, limit, breached };
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
    return { filter: "dimensions", passed: false, severity: "warning", reason: `size ${h}×${w} outside ${rule.minHeightMm ?? "?"}–${rule.maxHeightMm ?? "?"} × ${rule.minWidthMm ?? "?"}–${rule.maxWidthMm ?? "?"} mm — composite/custom unit, indicative price` };
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

// checkEnergy() lived here and is GONE (D4, ADR 0007). Energy is an OBJECTIVE,
// not a hard constraint and not a filter of any severity: the estimator meets it
// where it can and recommends the closest where it cannot, and deciding which
// candidate is closest belongs to exactly one module — the ladder. Its two real
// jobs went two different ways:
//
//   • variant eligibility by band — ABOLISHED. Every published variant that
//     satisfies the schedule's glazing instruction is a candidate configuration.
//     A near-miss must stay selectable, priceable and saveable by a human
//     (ops2 AC-3), which a filter of any severity makes impossible.
//   • the certified determination — it moved to the exact variant, in select.ts,
//     where it feeds LINE STATUS and nothing else. `certified` vs `estimated`
//     never enters an ordering at any position (AC-49).
//
// The `energy` literal stays in FilterName so persisted history from before this
// change still reads.

// Glass is mandatory: a product with no published performance variant has no
// configuration to sell, whatever else its record says. Reported as a catalogue
// data gap so a reviewer is sent to the record rather than to the opening.
function checkPerformanceData(c: CatalogueCandidate): FilterOutcome {
  return c.performanceVariants.some((v) => v.published)
    ? { filter: "data_completeness", passed: true }
    : { filter: "data_completeness", passed: false, severity: "incomplete", reason: "no published performance variant" };
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

/** The resolved band the LADDER judges against, plus where it came from and
 *  whether it exists at all. A thin wrapper over effectiveThermalRequirements
 *  (which keeps owning resolution, E14/AC-16) so the ladder never has to know
 *  how explicit and advisory requirements intersect.
 *
 *  A computed requirement binds selection exactly as a reported one does — only
 *  `basis` differs (AC-10). */
export function resolvedRequirement(opening: OpeningInput): {
  maxUValue: number | null; minShgc: number | null; maxShgc: number | null;
  basis: NonNullable<OpeningInput["thermalContext"]>["requirementBasis"] | null;
  absent: boolean;
} {
  const req = effectiveThermalRequirements(opening);
  const maxUValue = req?.maxUValue ?? null;
  const minShgc = req?.minShgc ?? null;
  const maxShgc = req?.maxShgc ?? null;
  // Absent means "nothing to fail", which is what makes every fitting candidate
  // tier `meets` rather than every candidate thermally unknown (AC-6, E5, E6).
  const absent = maxUValue == null && minShgc == null && maxShgc == null;
  return {
    maxUValue, minShgc, maxShgc,
    basis: absent ? null : (opening.thermalContext?.requirementBasis ?? null),
    absent,
  };
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

  // Glass exists at all.
  filters.push(checkPerformanceData(c));

  // Material schedule instructions (double/single glazing, Low-E) are the SOLE
  // source of eligible variants now. A stated "double glazed" is a customer
  // instruction, not a performance objective — satisfying it with the opposite
  // glass is the substitution D3 forbids, so it stays a hard reject (A3, AC-11).
  // The old thermal ∩ glazing reconciliation died with checkEnergy: there is no
  // longer a second opinion about glass for it to reconcile with.
  const schedule = checkScheduleConfiguration(opening, c);
  filters.push(schedule.outcome);
  const eligibleVariants = schedule.matching;
  // Line status only, never ordering (AC-49): an energy requirement backed by no
  // certified variant can produce an estimate but never a compliance claim.
  const energyCertified = eligibleVariants.some((v) => v.certified && v.dataSource === "certified");


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
  else if (energyHadRequirement(opening) && !energyCertified) { status = "commercial_only_estimate"; passed = true; }
  else { status = "ready"; passed = true; }

  return {
    candidateId: c.sanityProductId,
    ruleVersion,
    passed,
    status,
    energyCertified,
    eligibleVariantIds: eligibleVariants.map((v) => v.variantId),
    filters,
  };
}

function energyHadRequirement(opening: OpeningInput): boolean {
  const r = effectiveThermalRequirements(opening);
  return !!r && (r.maxUValue != null || r.minShgc != null || r.maxShgc != null);
}
