// Energy-requirement mapping (LLM strategy §9, §10.1 Path 1, Phase 3): resolve
// extracted report constraints onto the opening graph. PURE — fully testable.
//
// Match precedence per opening (most specific wins):
//   1. exact ref match           (report W04A → opening W04A)
//   2. parent/child              (report W04A/B/C → opening W04, and vice versa)
//   3. type rule                 (elementHint 'awning' → awning openings)
// An explicit report value is authoritative for configuration and performance.
// Architectural documents are authoritative for opening DIMENSIONS. Nothing is
// resolved silently: disagreements remain review-visible conflicts, while the
// selected value follows the field-specific policy below.
import type { EnergyConstraint, EnergyExtraction } from "../estimator/skills/energy";
import type { BuildingModelV1, EnergyRequirementV1, OpeningV1 } from "./schema";

// §9.1 default document-precedence policy — versioned RULES, not prompt text. A
// report's own precedence statement (extracted verbatim) may override per project.
export const PRECEDENCE_POLICY_VERSION = "v2";
export const PRECEDENCE_POLICY_V1 = [
  { source: "energy_report", precedence: 100 },
  { source: "architectural_schedule", precedence: 80 },
  { source: "dimensioned_plans", precedence: 60 },
  { source: "general_notes", precedence: 40 },
  { source: "customer_annotation", precedence: 20 },
  { source: "inferred_default", precedence: 10 },
] as const;

/** Field-specific precedence introduced after real energy-report reconciliation:
 * architectural dimensions describe the constructed opening; the energy report
 * remains authoritative for operation, glazing and thermal performance. */
export const PRECEDENCE_POLICY_V2 = {
  dimensions: [
    { source: "architectural_schedule", precedence: 100 },
    { source: "dimensioned_plans", precedence: 90 },
    { source: "energy_report", precedence: 80 },
    { source: "customer_annotation", precedence: 20 },
    { source: "inferred_default", precedence: 10 },
  ],
  configurationAndPerformance: PRECEDENCE_POLICY_V1,
} as const;

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
  /** Report facts keyed by architectural tag. Geometry fills missing plan data
   * but does not overwrite conflicting architectural dimensions. */
  authoritativeOpenings: Map<string, EnergyOpeningAuthority>;
  /** Exact report component rows, kept separate so each selects its own product/glass. */
  components: Map<string, EnergyComponent[]>;
  /** Customer-safe, human-readable review warnings for the estimator and submission. */
  reviewWarnings: string[];
  /** Genuine contradictions between authoritative document sources. Unlike
   * reviewWarnings, this deliberately excludes ordinary composite/build notes. */
  conflictWarnings: string[];
}

export interface EnergyComponent {
  ref: string;
  operationType: string | null;
  widthMm: number;
  heightMm: number;
  requirement: EnergyRequirementV1;
  performanceTypeId: string | null;
  performanceDescription: string | null;
  glazingNote: string | null;
}

export interface EnergyOpeningAuthority {
  widthMm: number | null;
  heightMm: number | null;
  operationType: string | null;
  sourceRefs: string[];
  axis: "vertical" | "horizontal" | null;
  performanceTypeId: string | null;
  performanceDescription: string | null;
  glazingNote: string | null;
  room: string | null;
  orientation: string | null;
}

/** Apply report authority without confusing configuration authority with
 * geometry authority. Architectural dimensions win when present; report
 * geometry is still useful when the plans omitted a dimension. */
export function applyEnergyAuthority(opening: OpeningV1, authority: EnergyOpeningAuthority): void {
  opening.widthMm = opening.widthMm ?? authority.widthMm;
  opening.heightMm = opening.heightMm ?? authority.heightMm;
  opening.areaM2 = opening.widthMm != null && opening.heightMm != null
    ? Math.round((opening.widthMm * opening.heightMm) / 1e4) / 100
    : null;
  if (authority.operationType) opening.configuration.familyRequested = authority.operationType;
  if (authority.room) opening.roomId = authority.room;
  if (authority.orientation) {
    opening.wallOrientation = authority.orientation as OpeningV1["wallOrientation"];
    // Bookkeeping beside the existing write (no precedence change): the thermal
    // contract refuses an orientation it cannot cite, and this is where a report
    // -supplied one gets its citation.
    opening.wallOrientationSource = "energy_report";
  }
  const description = authority.performanceDescription ?? authority.glazingNote;
  if (description) {
    opening.scheduleRequirements.glassDescription = description;
    if (/\bDG\b|double\s+glaz/i.test(description)) opening.scheduleRequirements.doubleGlazed = true;
  }
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

export const energyParentTag = (value: string | null | undefined): string | null => {
  const normalized = normalizeOpeningRef(value);
  if (!normalized) return null;
  return normalized.match(/^([A-Z]+\d+)[A-Z]$/)?.[1] ?? null;
};

const openingOperation = (o: OpeningV1): string | null => {
  const raw = (o.configuration.familyRequested ?? "").toLowerCase();
  for (const op of ["fixed", "awning", "sliding", "casement", "hinged", "louvre", "stacker", "bifold", "double-hung", "tilt-turn"]) {
    if (raw.includes(op)) return op;
  }
  return raw || null;
};

const operationConflict = (opening: OpeningV1, reportOperation: string): BuildingModelV1["conflicts"][number] => ({
  conflictId: "",
  entity: opening.externalRef,
  field: "configuration",
  values: [
    { value: reportOperation, source: "energy_report", precedence: 100 },
    { value: openingOperation(opening), source: "architectural_schedule", precedence: 80 },
  ],
  resolution: "use_higher_precedence_and_flag",
  selectedValue: reportOperation,
  reviewRequired: true,
});

const dimensionsConflict = (
  opening: OpeningV1,
  widthMm: number | null,
  heightMm: number | null,
): BuildingModelV1["conflicts"][number] | null => {
  const differs =
    (widthMm != null && opening.widthMm != null && Math.abs(widthMm - opening.widthMm) > DIM_TOLERANCE_MM) ||
    (heightMm != null && opening.heightMm != null && Math.abs(heightMm - opening.heightMm) > DIM_TOLERANCE_MM);
  if (!differs) return null;
  return {
    conflictId: "",
    entity: opening.externalRef,
    field: "dimensions",
    values: [
      { value: { widthMm, heightMm }, source: "energy_report", precedence: 80 },
      { value: { widthMm: opening.widthMm, heightMm: opening.heightMm }, source: "architectural_schedule", precedence: 100 },
    ],
    resolution: "use_higher_precedence_and_flag",
    selectedValue: { widthMm: opening.widthMm, heightMm: opening.heightMm },
    reviewRequired: true,
  };
};

/** A lone child row (for example D1A without D1B) is not enough evidence to
 * replace the parent opening. It can still contradict the parent dimensions,
 * and that disagreement must be explicit rather than hidden in a generic
 * "geometry could not be reconciled" message. */
const incompleteComponentDimensionsConflict = (
  opening: OpeningV1,
  component: EnergyConstraint,
): BuildingModelV1["conflicts"][number] | null => {
  const widthMm = component.widthMm;
  const heightMm = component.heightMm;
  const differs =
    (widthMm != null && opening.widthMm != null && Math.abs(widthMm - opening.widthMm) > DIM_TOLERANCE_MM) ||
    (heightMm != null && opening.heightMm != null && Math.abs(heightMm - opening.heightMm) > DIM_TOLERANCE_MM);
  if (!differs) return null;
  return {
    conflictId: "",
    entity: opening.externalRef,
    field: "dimensions",
    values: [
      { value: { ref: component.ref, widthMm, heightMm }, source: "energy_report", precedence: 80 },
      { value: { ref: opening.externalRef, widthMm: opening.widthMm, heightMm: opening.heightMm }, source: "architectural_schedule", precedence: 100 },
    ],
    resolution: "retain_parent_and_flag_incomplete_component",
    selectedValue: { widthMm: opening.widthMm, heightMm: opening.heightMm },
    reviewRequired: true,
  };
};

const contextConflict = (
  opening: OpeningV1,
  constraint: EnergyConstraint,
): BuildingModelV1["conflicts"][number] | null => {
  const roomDiffers = !!constraint.room && !!opening.roomId &&
    normalizeContext(constraint.room) !== normalizeContext(opening.roomId);
  const orientationDiffers = !!constraint.orientation && !!opening.wallOrientation &&
    constraint.orientation !== opening.wallOrientation;
  if (!roomDiffers && !orientationDiffers) return null;
  return {
    conflictId: "",
    entity: opening.externalRef,
    field: "context",
    values: [
      { value: { room: constraint.room, orientation: constraint.orientation }, source: "energy_report", precedence: 100 },
      { value: { room: opening.roomId, orientation: opening.wallOrientation }, source: "architectural_schedule", precedence: 80 },
    ],
    resolution: "use_higher_precedence_and_flag",
    selectedValue: { room: constraint.room, orientation: constraint.orientation },
    reviewRequired: true,
  };
};

const sizeLabel = (widthMm: number | null, heightMm: number | null) =>
  widthMm != null && heightMm != null ? `${heightMm} × ${widthMm} mm` : "the stated size";

function inferCompositeAuthority(rows: EnergyConstraint[]): EnergyOpeningAuthority | null {
  if (rows.length < 2 || rows.some((row) => row.widthMm == null || row.heightMm == null)) return null;
  const heights = rows.map((row) => row.heightMm!);
  const widths = rows.map((row) => row.widthMm!);
  const sameHeight = Math.max(...heights) - Math.min(...heights) <= DIM_TOLERANCE_MM;
  const sameWidth = Math.max(...widths) - Math.min(...widths) <= DIM_TOLERANCE_MM;
  if (sameHeight) {
    return {
      widthMm: widths.reduce((sum, width) => sum + width, 0),
      heightMm: Math.max(...heights),
      operationType: null,
      sourceRefs: rows.flatMap((row) => row.ref ? [row.ref] : []),
      axis: "vertical",
      performanceTypeId: null,
      performanceDescription: null,
      glazingNote: null,
      room: rows[0]?.room ?? null,
      orientation: rows[0]?.orientation ?? null,
    };
  }
  if (sameWidth) {
    return {
      widthMm: Math.max(...widths),
      heightMm: heights.reduce((sum, height) => sum + height, 0),
      operationType: null,
      sourceRefs: rows.flatMap((row) => row.ref ? [row.ref] : []),
      axis: "horizontal",
      performanceTypeId: null,
      performanceDescription: null,
      glazingNote: null,
      room: rows[0]?.room ?? null,
      orientation: rows[0]?.orientation ?? null,
    };
  }
  return null;
}

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
  const authoritativeOpenings = new Map<string, EnergyOpeningAuthority>();
  const components = new Map<string, EnergyComponent[]>();
  const reviewWarnings: string[] = [];
  const conflictWarnings: string[] = [];

  const childGroups = new Map<string, EnergyConstraint[]>();
  for (const constraint of extraction.constraints) {
    const parent = energyParentTag(constraint.ref);
    if (!parent) continue;
    const list = childGroups.get(parent) ?? [];
    list.push(constraint);
    childGroups.set(parent, list);
  }

  for (const o of openings) {
    const openingRef = normalizeOpeningRef(o.externalRef);
    // 1. Exact ref, normalized for case/separator differences.
    let matches = extraction.constraints.filter((c) =>
      c.ref && normalizeOpeningRef(c.ref) === openingRef);
    let kind: "exact" | "parent_child" | "type" = "exact";
    // 2. Parent/child: a child constraint (W04A) applies to parent opening W04;
    //    a parent constraint (W04) applies to child opening W04A. Child rows are
    //    retained separately below; the scalar parent requirement is only a
    //    compatibility summary for the existing parent-line audit contract.
    if (!matches.length) {
      const childConstraints = childGroups.get(openingRef ?? "") ?? [];
      if (childConstraints.length) {
        matches = childConstraints;
        kind = "parent_child";
      } else if (o.parentRef) {
        const parentRef = normalizeOpeningRef(o.parentRef);
        matches = extraction.constraints.filter((c) =>
          c.ref && normalizeOpeningRef(c.ref) === parentRef);
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
    if (kind !== "type") {
      const contextDiscrepancy = contextConflict(o, matches[0]);
      if (contextDiscrepancy) {
        contextDiscrepancy.conflictId = `conf_energy_${conflicts.length + 1}`;
        conflicts.push(contextDiscrepancy);
        reviewWarnings.push(
          `${o.externalRef}: the energy report room/orientation differs from the plan/schedule; the energy report was used and human review is required.`,
        );
        conflictWarnings.push(
          `${o.externalRef}: energy report room/orientation differs from the architectural schedule. Energy report selected; human review required.`,
        );
      }
    }

    if (kind === "parent_child") {
      const authority = inferCompositeAuthority(matches);
      if (authority) {
        authoritativeOpenings.set(o.externalRef, authority);
        const exactComponents: EnergyComponent[] = matches.map((component) => ({
          ref: component.ref!,
          operationType: component.elementHint,
          widthMm: component.widthMm!,
          heightMm: component.heightMm!,
          requirement: toRequirement(component),
          performanceTypeId: component.performanceTypeId ?? null,
          performanceDescription: component.performanceDescription ?? null,
          glazingNote: component.glazingNote,
        }));
        components.set(o.externalRef, exactComponents);
        const componentLabel = exactComponents
          .map((component) => `${component.ref} ${component.operationType ?? "unit"} ${component.heightMm} × ${component.widthMm} mm`)
          .join(" + ");
        reviewWarnings.push(`${o.externalRef}: the energy report defines ${exactComponents.length} components (${componentLabel}); human review is required.`);
        const discrepancy = dimensionsConflict(o, authority.widthMm, authority.heightMm);
        if (discrepancy) {
          discrepancy.conflictId = `conf_energy_${conflicts.length + 1}`;
          conflicts.push(discrepancy);
          reviewWarnings.push(
            `${o.externalRef}: energy report components total ${sizeLabel(authority.widthMm, authority.heightMm)}, while the architectural plan/schedule says ${sizeLabel(o.widthMm, o.heightMm)}. Architectural dimensions retained; energy-report component types and performance retained.`,
          );
          conflictWarnings.push(
            `${o.externalRef}: energy report components total ${sizeLabel(authority.widthMm, authority.heightMm)}, while the architectural plan/schedule says ${sizeLabel(o.widthMm, o.heightMm)}. Architectural dimensions selected: ${sizeLabel(o.widthMm, o.heightMm)}; energy-report component types and performance retained.`,
          );
        }
      } else {
        reviewWarnings.push(`${o.externalRef}: energy-report component geometry could not be reconciled into one opening; human review is required.`);
        if (matches.length === 1) {
          const componentDiscrepancy = incompleteComponentDimensionsConflict(o, matches[0]);
          if (componentDiscrepancy) {
            componentDiscrepancy.conflictId = `conf_energy_${conflicts.length + 1}`;
            conflicts.push(componentDiscrepancy);
            const component = matches[0];
            const warning = `${o.externalRef}: energy report says ${component.ref ?? "the component"} is ${sizeLabel(component.widthMm, component.heightMm)}, while the architectural schedule says ${o.externalRef} is ${sizeLabel(o.widthMm, o.heightMm)}. Architectural schedule selected: ${sizeLabel(o.widthMm, o.heightMm)} because the report component set is incomplete.`;
            reviewWarnings.push(warning);
            conflictWarnings.push(warning);
          }
        }
      }
      continue;
    }

    if (kind === "exact") {
      const authority: EnergyOpeningAuthority = {
        widthMm: match.widthMm,
        heightMm: match.heightMm,
        operationType: match.elementHint,
        sourceRefs: match.ref ? [match.ref] : [],
        axis: null,
        performanceTypeId: match.performanceTypeId ?? null,
        performanceDescription: match.performanceDescription ?? null,
        glazingNote: match.glazingNote,
        room: match.room,
        orientation: match.orientation,
      };
      authoritativeOpenings.set(o.externalRef, authority);
      const discrepancy = dimensionsConflict(o, match.widthMm, match.heightMm);
      if (discrepancy) {
        discrepancy.conflictId = `conf_energy_${conflicts.length + 1}`;
        conflicts.push(discrepancy);
        reviewWarnings.push(
          `${o.externalRef}: energy report dimensions are ${sizeLabel(match.widthMm, match.heightMm)}, while the architectural plan/schedule says ${sizeLabel(o.widthMm, o.heightMm)}. Architectural dimensions retained; energy-report configuration and performance retained.`,
        );
        conflictWarnings.push(
          `${o.externalRef}: energy report says ${sizeLabel(match.widthMm, match.heightMm)}, while the architectural plan/schedule says ${sizeLabel(o.widthMm, o.heightMm)}. Architectural dimensions selected: ${sizeLabel(o.widthMm, o.heightMm)}; energy-report configuration and performance retained.`,
        );
      }
      const planOperation = openingOperation(o);
      if (match.elementHint && planOperation && match.elementHint !== planOperation) {
        const discrepancy = operationConflict(o, match.elementHint);
        discrepancy.conflictId = `conf_energy_${conflicts.length + 1}`;
        conflicts.push(discrepancy);
        reviewWarnings.push(
          `${o.externalRef}: the energy report specifies ${match.elementHint}, while the plan/schedule specifies ${planOperation}; the energy report was used and human review is required.`,
        );
        conflictWarnings.push(
          `${o.externalRef}: energy report specifies ${match.elementHint}, while the architectural schedule specifies ${planOperation}. Energy report selected: ${match.elementHint}.`,
        );
      }
    }
  }

  return {
    requirements,
    conflicts,
    unmatched: extraction.constraints.filter((c) => !matchedConstraints.has(c)),
    authoritativeOpenings,
    components,
    reviewWarnings: [...new Set(reviewWarnings)],
    conflictWarnings: [...new Set(conflictWarnings)],
  };
}

// WS2 (thermal rework): a composite frame's child lites can legitimately need
// DIFFERENT glass (awning 0.37–0.41 vs fixed 0.50–0.56). Intersecting their SHGC
// bands (maxOf-mins, minOf-maxes) then produces an IMPOSSIBLE band (min>max) — the
// exact origin of the empty-line bug. We still take the tightest U cap (a single
// frame band is coherent), but when the SHGC intersection is empty we DROP the
// pair (keeping a shgcTarget as advisory) rather than emit a contradiction. Full
// per-lite glazing (each lite its own glass) is the composite-segment work (WS5);
// this guard makes the collapsed parent band coherent in the meantime.
function strictest(cs: EnergyConstraint[]): EnergyConstraint {
  const merged = cs.reduce((a, b) => ({
    ...a,
    maxUValue: minOf(a.maxUValue, b.maxUValue),
    minShgc: maxOf(a.minShgc, b.minShgc),
    maxShgc: minOf(a.maxShgc, b.maxShgc),
    shgcTarget: a.shgcTarget ?? b.shgcTarget,
    openablePercent: a.openablePercent ?? b.openablePercent,
    glazingNote: a.glazingNote ?? b.glazingNote,
  }));
  if (merged.minShgc != null && merged.maxShgc != null && merged.minShgc > merged.maxShgc) {
    return { ...merged, minShgc: null, maxShgc: null };
  }
  return merged;
}
const minOf = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.min(a, b));
const maxOf = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.max(a, b));
