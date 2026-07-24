// Energy-requirement mapping (LLM strategy §9, §10.1 Path 1, Phase 3): resolve
// extracted report constraints onto the opening graph. PURE — fully testable.
//
// Match precedence per opening (most specific wins):
//   1. exact ref match           (report W04A → opening W04A)
//   2. parent/child              (report W04A/B/C → opening W04, and vice versa)
//   3. type rule                 (elementHint 'awning' → awning openings)
// An explicit report value is AUTHORITATIVE (§3.3): it takes precedence over any
// plan-derived estimate unless a human overrides it. Nothing is resolved
// silently — report-vs-schedule dimension mismatches become review-required
// conflicts (§9.2), and constraints matching no opening are surfaced, not dropped.
import type { EnergyConstraint, EnergyExtraction } from "../estimator/skills/energy";
import type { BuildingModelV1, EnergyRequirementV1, OpeningV1 } from "./schema";
import { parentTagOf } from "./pipeline";

// §9.1 default document-precedence policy — versioned RULES, not prompt text. A
// report's own precedence statement (extracted verbatim) may override per project.
export const PRECEDENCE_POLICY_VERSION = "v1";
export const PRECEDENCE_POLICY_V1 = [
  { source: "energy_report", precedence: 100 },
  { source: "architectural_schedule", precedence: 80 },
  { source: "dimensioned_plans", precedence: 60 },
  { source: "general_notes", precedence: 40 },
  { source: "customer_annotation", precedence: 20 },
  { source: "inferred_default", precedence: 10 },
] as const;

// How closely a schedule dim must agree with a report dim before it's a conflict
// (reports often round to the nearest 10mm).
export const DIM_TOLERANCE_MM = 25;

export interface EnergyMapResult {
  /** externalRef → resolved requirement (basis always explicit_energy_report). */
  requirements: Map<string, EnergyRequirementV1 & { sourceRef: string | null; matchKind: "exact" | "parent_child" | "type" }>;
  /** Report-vs-schedule dimension mismatches (review required, §9.2). */
  conflicts: BuildingModelV1["conflicts"];
  /** Constraints that matched nothing — surfaced for review, never dropped. */
  unmatched: EnergyConstraint[];
}

const toRequirement = (c: EnergyConstraint): EnergyRequirementV1 => ({
  basis: "explicit_energy_report",
  maxUValue: c.maxUValue,
  shgcTarget: c.shgcTarget,
  shgcMin: c.minShgc,
  shgcMax: c.maxShgc,
  zoneType: c.room,
  operablePercent: c.openablePercent,
  notes: c.glazingNote,
});

// Does a type-level constraint apply to this opening?
function typeMatches(c: EnergyConstraint, o: OpeningV1): boolean {
  if (!c.elementHint) return false;
  if (c.elementHint === "door" || c.elementHint === "window") return o.elementType === c.elementHint;
  const op = (o.configuration.familyRequested ?? "").toLowerCase();
  return op.includes(c.elementHint);
}

export function mapEnergyToOpenings(extraction: EnergyExtraction, openings: OpeningV1[]): EnergyMapResult {
  const requirements: EnergyMapResult["requirements"] = new Map();
  const conflicts: BuildingModelV1["conflicts"] = [];
  const matchedConstraints = new Set<EnergyConstraint>();

  const byRef = new Map(openings.map((o) => [o.externalRef, o]));

  for (const o of openings) {
    // 1. Exact ref.
    let match = extraction.constraints.find((c) => c.ref && c.ref === o.externalRef);
    let kind: "exact" | "parent_child" | "type" = "exact";
    // 2. Parent/child: a child constraint (W04A) applies to parent opening W04;
    //    a parent constraint (W04) applies to child opening W04A. Children carry
    //    the STRICTEST value when several apply (§9.3 components).
    if (!match) {
      const childConstraints = extraction.constraints.filter((c) => c.ref && parentTagOf(c.ref) === o.externalRef);
      if (childConstraints.length) {
        match = strictest(childConstraints);
        kind = "parent_child";
      } else if (o.parentRef) {
        match = extraction.constraints.find((c) => c.ref === o.parentRef) ?? undefined;
        if (match) kind = "parent_child";
      }
    }
    // 3. Type rule.
    if (!match) {
      match = extraction.constraints.find((c) => !c.ref && typeMatches(c, o));
      if (match) kind = "type";
    }
    if (!match) continue;
    matchedConstraints.add(match);
    requirements.set(o.externalRef, { ...toRequirement(match), sourceRef: match.ref, matchKind: kind });

    // Discrepancy check: report dims vs schedule dims (§Phase-3 exit criterion).
    if (match.ref && match.widthMm != null && o.widthMm != null && Math.abs(match.widthMm - o.widthMm) > DIM_TOLERANCE_MM) {
      conflicts.push({
        conflictId: `conf_energy_${conflicts.length + 1}`,
        entity: o.externalRef,
        field: "widthMm",
        values: [
          { value: match.widthMm, source: "energy_report", precedence: 100 },
          { value: o.widthMm, source: "architectural_schedule", precedence: 80 },
        ],
        resolution: "use_higher_precedence_and_flag",
        selectedValue: o.widthMm, // dims stay schedule-sourced; the mismatch is FLAGGED
        reviewRequired: true,
      });
    }
  }

  // Track child-refs that matched a parent opening so they don't read as unmatched.
  for (const c of extraction.constraints) {
    if (matchedConstraints.has(c)) continue;
    if (c.ref && (byRef.has(c.ref) || (parentTagOf(c.ref) && byRef.has(parentTagOf(c.ref) as string)))) matchedConstraints.add(c);
  }

  return { requirements, conflicts, unmatched: extraction.constraints.filter((c) => !matchedConstraints.has(c)) };
}

// Among several child constraints, the strictest requirement governs the parent
// frame: lowest U cap, tightest SHGC band.
function strictest(cs: EnergyConstraint[]): EnergyConstraint {
  return cs.reduce((a, b) => ({
    ...a,
    maxUValue: minOf(a.maxUValue, b.maxUValue),
    minShgc: maxOf(a.minShgc, b.minShgc),
    maxShgc: minOf(a.maxShgc, b.maxShgc),
    shgcTarget: a.shgcTarget ?? b.shgcTarget,
    openablePercent: a.openablePercent ?? b.openablePercent,
    glazingNote: a.glazingNote ?? b.glazingNote,
  }));
}
const minOf = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.min(a, b));
const maxOf = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.max(a, b));
