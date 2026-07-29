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

/** Case and drawing separators are presentation, not identity. The original
 * source values remain untouched in evidence and review output. */
export function normalizeOpeningRef(value: string | null | undefined): string | null {
  const normalized = (value ?? "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized || null;
}

const normalizeContext = (value: string | null | undefined): string | null => {
  const normalized = (value ?? "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized || null;
};

const parentTag = (value: string | null | undefined): string | null => {
  const normalized = normalizeOpeningRef(value);
  if (!normalized) return null;
  return normalized.match(/^([A-Z]+\d+)[A-Z]$/)?.[1] ?? null;
};

function contextCompatible(c: EnergyConstraint, o: OpeningV1): boolean {
  const constraintRoom = normalizeContext(c.room);
  const openingRoom = normalizeContext(o.roomId);
  if (constraintRoom && openingRoom && constraintRoom !== openingRoom) return false;
  if (c.orientation && o.wallOrientation && c.orientation !== o.wallOrientation) return false;
  return true;
}

function contextSpecificity(c: EnergyConstraint, o: OpeningV1): number {
  let score = 0;
  if (c.room && o.roomId && normalizeContext(c.room) === normalizeContext(o.roomId)) score += 2;
  if (c.orientation && o.wallOrientation === c.orientation) score += 2;
  if (!c.room) score += 0.25;
  if (!c.orientation) score += 0.25;
  return score;
}

function sameThermalRequirement(a: EnergyConstraint, b: EnergyConstraint): boolean {
  return a.maxUValue === b.maxUValue &&
    a.minShgc === b.minShgc &&
    a.maxShgc === b.maxShgc &&
    a.shgcTarget === b.shgcTarget &&
    a.openablePercent === b.openablePercent;
}

function ambiguityConflict(
  opening: OpeningV1,
  candidates: EnergyConstraint[],
  index: number,
): BuildingModelV1["conflicts"][number] {
  return {
    conflictId: `conf_energy_${index}`,
    entity: opening.externalRef,
    field: "thermalRequirement",
    values: candidates.map((constraint) => ({
      value: {
        ref: constraint.ref,
        room: constraint.room,
        orientation: constraint.orientation,
        maxUValue: constraint.maxUValue,
        minShgc: constraint.minShgc,
        maxShgc: constraint.maxShgc,
      },
      source: "energy_report",
      precedence: 100,
    })),
    resolution: "human_resolution_required",
    selectedValue: null,
    reviewRequired: true,
  };
}

export function mapEnergyToOpenings(extraction: EnergyExtraction, openings: OpeningV1[]): EnergyMapResult {
  const requirements: EnergyMapResult["requirements"] = new Map();
  const conflicts: BuildingModelV1["conflicts"] = [];
  const matchedConstraints = new Set<EnergyConstraint>();

  for (const o of openings) {
    const openingRef = normalizeOpeningRef(o.externalRef);
    // 1. Exact ref, normalized for case/separator differences.
    let matches = extraction.constraints.filter((c) =>
      c.ref && normalizeOpeningRef(c.ref) === openingRef && contextCompatible(c, o));
    let kind: "exact" | "parent_child" | "type" = "exact";
    // 2. Parent/child: a child constraint (W04A) applies to parent opening W04;
    //    a parent constraint (W04) applies to child opening W04A. Children carry
    //    the STRICTEST value when several apply (§9.3 components).
    if (!matches.length) {
      const childConstraints = extraction.constraints.filter((c) =>
        c.ref && parentTag(c.ref) === openingRef && contextCompatible(c, o));
      if (childConstraints.length) {
        matches = childConstraints;
        kind = "parent_child";
      } else if (o.parentRef) {
        const parentRef = normalizeOpeningRef(o.parentRef);
        matches = extraction.constraints.filter((c) =>
          c.ref && normalizeOpeningRef(c.ref) === parentRef && contextCompatible(c, o));
        if (matches.length) kind = "parent_child";
      }
    }
    // 3. Type rule.
    if (!matches.length) {
      matches = extraction.constraints.filter((c) =>
        !c.ref && typeMatches(c, o) && contextCompatible(c, o));
      if (matches.length) kind = "type";
    }
    if (!matches.length) continue;

    // A room/orientation-specific row wins over a generic type row. Equally
    // specific rows that disagree are ambiguous and require human resolution;
    // array order is never treated as precedence.
    if (kind !== "parent_child" && matches.length > 1) {
      const highest = Math.max(...matches.map((constraint) => contextSpecificity(constraint, o)));
      matches = matches.filter((constraint) => contextSpecificity(constraint, o) === highest);
    }
    for (const candidate of matches) matchedConstraints.add(candidate);
    if (kind !== "parent_child" && matches.length > 1 &&
        matches.some((candidate) => !sameThermalRequirement(candidate, matches[0]))) {
      conflicts.push(ambiguityConflict(o, matches, conflicts.length + 1));
      continue;
    }
    const match = matches.length === 1 ? matches[0] : strictest(matches);
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
    if (match.ref && match.heightMm != null && o.heightMm != null && Math.abs(match.heightMm - o.heightMm) > DIM_TOLERANCE_MM) {
      conflicts.push({
        conflictId: `conf_energy_${conflicts.length + 1}`,
        entity: o.externalRef,
        field: "heightMm",
        values: [
          { value: match.heightMm, source: "energy_report", precedence: 100 },
          { value: o.heightMm, source: "architectural_schedule", precedence: 80 },
        ],
        resolution: "use_higher_precedence_and_flag",
        selectedValue: o.heightMm,
        reviewRequired: true,
      });
    }
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
