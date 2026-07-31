// Phase 0 foundation (LLM strategy §23): the normalized V1 schemas + controlled
// vocabularies for the building-modelling pipeline. Dependency-free so the rules
// engine, workers and tests import them without pulling in the Worker runtime.
//
// Design intent (§8.3): the normalized model is independent of any provider
// response format. The LLM's job is to fill THIS structure with evidence-linked
// facts; it is never the source of truth for regulation, catalogue or price.

// ── §8.2 Observation classes ─────────────────────────────────────────────────
// Every extracted fact carries one origin. model_inferred facts must NEVER be
// silently promoted to hard technical constraints.
export const OBSERVATION_ORIGINS = [
  "explicit",            // directly stated in the source document
  "cross_derived",       // derived by matching two or more explicit facts
  "geometry_derived",    // derived from plan geometry or orientation
  "regulatory_default",  // applied from a versioned regulatory profile
  "envelope_default",    // applied from a selected default building archetype
  "precedent_inferred",  // inferred from approved historical cases
  "model_inferred",      // LLM inference not independently established
  "human_override",      // confirmed or replaced by a reviewer
  "unknown",             // not available and not safe to infer
] as const;
export type ObservationOrigin = (typeof OBSERVATION_ORIGINS)[number];
export const isObservationOrigin = (v: unknown): v is ObservationOrigin =>
  typeof v === "string" && (OBSERVATION_ORIGINS as readonly string[]).includes(v);

// ── §3 Input modes ───────────────────────────────────────────────────────────
// The three operating modes have different evidence quality and must not share
// the same confidence treatment.
export const INPUT_MODES = ["schedule_only", "plans_no_report", "plans_plus_energy_report"] as const;
export type InputMode = (typeof INPUT_MODES)[number];

// ── §10.1 Requirement basis ──────────────────────────────────────────────────
// Which decision pathway produced a requirement — drives the §10.5 compliance
// language ("selected to match the report" vs "indicative estimate").
export const REQUIREMENT_BASES = [
  "explicit_energy_report",
  "plan_derived",
  "default_envelope",
  "human_override",
] as const;
export type RequirementBasis = (typeof REQUIREMENT_BASES)[number];

// ── §17.3 Override reason taxonomy ───────────────────────────────────────────
// The governed correction vocabulary. Each code maps to the LAYER that must learn
// from it (mirrors the 0014 feedback categories so the delivered learning loop
// keeps working), and declares whether it may train:
//  - ranker: product-preference retrieval learning (worker/lib/estimator/learning.ts)
//  - thermal: the future thermal surrogate (§17.5 excludes commercial preference)
export const OVERRIDE_REASONS = {
  SOURCE_OCR_ERROR:              { layer: "extraction_correction",         ranker: false, thermal: false },
  WRONG_TAG_MAPPING:             { layer: "reconciliation_correction",     ranker: false, thermal: false },
  WRONG_DIMENSION:               { layer: "extraction_correction",         ranker: false, thermal: false },
  WRONG_CONFIGURATION:           { layer: "extraction_correction",         ranker: false, thermal: false },
  WRONG_ROOM_OR_ORIENTATION:     { layer: "extraction_correction",         ranker: false, thermal: false },
  DOCUMENT_REVISION_CONFLICT:    { layer: "reconciliation_correction",     ranker: false, thermal: false },
  ENERGY_REPORT_PRECEDENCE:      { layer: "reconciliation_correction",     ranker: false, thermal: false },
  THERMAL_TARGET_TOO_WEAK:       { layer: "deterministic_rule_correction", ranker: false, thermal: true },
  THERMAL_TARGET_TOO_STRONG:     { layer: "deterministic_rule_correction", ranker: false, thermal: true },
  SHGC_RANGE_INCORRECT:          { layer: "deterministic_rule_correction", ranker: false, thermal: true },
  CATALOGUE_CONSTRAINT:          { layer: "catalogue_data_correction",     ranker: false, thermal: false },
  PRODUCT_UNAVAILABLE:           { layer: "catalogue_data_correction",     ranker: false, thermal: false },
  CUSTOMER_PREFERENCE:           { layer: "preference_correction",         ranker: true,  thermal: false },
  COLOUR_OR_HARDWARE_PREFERENCE: { layer: "preference_correction",         ranker: true,  thermal: false },
  PRICE_OPTIMIZATION:            { layer: "commercial_correction",         ranker: true,  thermal: false },
  BAL_OR_SAFETY_REQUIREMENT:     { layer: "deterministic_rule_correction", ranker: false, thermal: false },
  MANUFACTURING_REVIEW:          { layer: "commercial_correction",         ranker: false, thermal: false },
  OTHER_WITH_COMMENT:            { layer: "commercial_correction",         ranker: false, thermal: false },
} as const;
export type OverrideReasonCode = keyof typeof OVERRIDE_REASONS;
export const OVERRIDE_REASON_CODES = Object.keys(OVERRIDE_REASONS) as OverrideReasonCode[];
export const isOverrideReason = (v: unknown): v is OverrideReasonCode =>
  typeof v === "string" && v in OVERRIDE_REASONS;
/** Codes whose corrections may feed the product-preference (ranker) learning. */
export const RANKER_TRAINABLE_REASONS = OVERRIDE_REASON_CODES.filter((c) => OVERRIDE_REASONS[c].ranker);

// ── §13.2 Escalation trigger codes ───────────────────────────────────────────
// SHADOW-ONLY today (owner decision): triggers are recorded on ai_stage_runs for
// frequency analysis; the Pro model is not called unless AI_ESCALATION_MODE='on'.
export const ESCALATION_TRIGGERS = [
  "conflicting_document_revisions",
  "unresolved_tag_mapping",
  "dimension_mismatch",
  "frame_decomposition_uncertain",
  "orientation_unknown",
  "envelope_gaps",
  "surrogate_near_threshold",
  "extraction_passes_disagree",
  "missing_evidence_for_critical_fact",
  "reviewer_requested",
  "schema_validation_failed_after_repair",
  "low_confidence_critical_field",
] as const;
export type EscalationTrigger = (typeof ESCALATION_TRIGGERS)[number];

// ── §22.2 Failure classes ────────────────────────────────────────────────────
export const FAILURE_CLASSES = [
  "FILE_UNSUPPORTED", "FILE_TOO_LARGE", "FILE_CORRUPT", "IMAGE_UNREADABLE",
  "PDF_RENDER_FAILED", "MARKDOWN_CONVERSION_FAILED", "PAGE_CLASSIFICATION_FAILED",
  "SCHEMA_VALIDATION_FAILED", "MODEL_TIMEOUT", "MODEL_SAFETY_BLOCK",
  "MODEL_OUTPUT_INCONSISTENT", "MISSING_PROJECT_LOCATION", "MISSING_BUILDING_CLASS",
  "DOCUMENT_REVISION_CONFLICT", "ENERGY_MAPPING_INCOMPLETE",
  "THERMAL_ESTIMATOR_OUT_OF_DISTRIBUTION", "NO_VALID_CATALOGUE_MATCH", "PRICE_ENGINE_FAILED",
] as const;
export type FailureClass = (typeof FAILURE_CLASSES)[number];

// ── EvidenceItemV1 (§8.5) ────────────────────────────────────────────────────
// Evidence is a first-class record, not a citation embedded in prose. entityPath
// is a JSON pointer into the building model (e.g. /openings/op_W04/width_mm).
export interface EvidenceItemV1 {
  entityPath: string;
  fileId: string | null;
  pageNo: number | null;
  sheetRef: string | null;
  /** Normalized [x0,y0,x1,y1] in 0..1, or null when no region is available. */
  region: [number, number, number, number] | null;
  extractedText: string | null;
  origin: ObservationOrigin;
  confidence: number | null;
}

// ── EnergyRequirementV1 (§4) ─────────────────────────────────────────────────
// U-value is not the only target: SHGC bands, orientation and operability matter.
export interface EnergyRequirementV1 {
  basis: RequirementBasis;
  maxUValue: number | null;
  shgcTarget: number | null;
  shgcMin: number | null;
  shgcMax: number | null;
  /** Room/zone type the requirement applies through (bed, living, …). */
  zoneType: string | null;
  operablePercent: number | null;
  notes: string | null;
}

// ── OpeningV1 (§8.4) ─────────────────────────────────────────────────────────
// parentRef models the §9.3 combined-frame decomposition: an architectural parent
// (W04) may decompose into thermal children (W04A/B/C); children carry thermal
// requirements, the parent carries the product configuration.
export interface OpeningV1 {
  openingId: string;
  externalRef: string;           // schedule tag, preserved EXACTLY as printed
  parentRef: string | null;
  level: string | null;
  roomId: string | null;
  wallOrientation: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | null;
  elementType: "window" | "door";
  widthMm: number | null;
  heightMm: number | null;
  quantity: number;
  areaM2: number | null;
  configuration: {
    familyRequested: string | null;
    panelCount: number | null;
    operablePanelCount: number | null;
    layoutCode: string | null;   // e.g. A-F-A
    viewBasis: "inside" | "outside" | null;
  };
  scheduleRequirements: {
    doubleGlazed: boolean | null;
    glassDescription: string | null;
    colour: string | null;
    flyscreen: boolean | null;
  };
  shading: { horizontalProjectionMm: number | null; verticalFeature: boolean | null; source: string | null } | null;
  // SCAFFOLD WS2 (thermal rework): a single band cannot represent a composite's
  // awning-lite vs fixed-lite bands. Add a per-component representation
  // (components[] of {ref, elementType, band}) alongside this scalar. Plan §2/WS2.
  thermalRequirement: EnergyRequirementV1 | null;
  evidence: EvidenceItemV1[];
  confidence: Record<string, number>;   // §15.1 per-dimension (tag, dimensions, …)
}

// ── BuildingModelV1 (§8.3) ───────────────────────────────────────────────────
export interface BuildingModelV1 {
  schemaVersion: string;         // BUILDING_MODEL_SCHEMA_VERSION
  projectId: string;
  inputMode: InputMode;
  jurisdiction: {
    country: string | null;
    state: string | null;
    postcode: string | null;
    nccProfile: string | null;
    /** CANONICAL climate field: the NatHERS climate zone number. The NCC zone is
     *  derivable and must not be stored as a second source of truth (review
     *  finding: §8.3 vs §10.3 mixed the two). */
    nathersClimateZone: number | null;
    buildingClass: string | null;
    confidence: number | null;
  };
  building: {
    storeys: number | null;
    conditionedFloorAreaM2: number | null;
    totalFloorAreaM2: number | null;
    exposure: string | null;
    northRotationDeg: number | null;
    balRating: string | null;
  };
  envelope: {
    walls: unknown[]; floors: unknown[]; ceilings: unknown[]; roofs: unknown[];
    airTightness: number | null;
    defaultArchetypeId: string | null;
  };
  rooms: { roomId: string; name: string | null; level: string | null; areaM2: number | null; zoneType: string | null }[];
  openings: OpeningV1[];
  energyAssessment: {
    certificateRef: string | null;
    starRating: number | null;
    heatingLoad: number | null;
    coolingLoad: number | null;
    precedenceStatement: string | null;   // §9.1: a report's own precedence overrides the default
  } | null;
  assumptions: { fact: string; origin: ObservationOrigin; note: string | null }[];
  conflicts: {
    conflictId: string;
    entity: string;
    field: string;
    values: { value: unknown; source: string; precedence: number }[];
    resolution: string;
    selectedValue: unknown;
    reviewRequired: boolean;
  }[];
}

// ── Structural validation ────────────────────────────────────────────────────
// Not a JSON-Schema engine: a cheap, total check that a payload can be TRUSTED as
// a BuildingModelV1 skeleton before persistence. Deep field clamping stays with
// the per-skill validators (same discipline as skills/*.validate).
export function validateBuildingModelShape(v: unknown): v is BuildingModelV1 {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  if (typeof m.schemaVersion !== "string" || typeof m.projectId !== "string") return false;
  if (!(INPUT_MODES as readonly string[]).includes(m.inputMode as string)) return false;
  if (!m.jurisdiction || typeof m.jurisdiction !== "object") return false;
  if (!Array.isArray(m.rooms) || !Array.isArray(m.openings)) return false;
  if (!Array.isArray(m.assumptions) || !Array.isArray(m.conflicts)) return false;
  for (const o of m.openings as unknown[]) {
    if (!o || typeof o !== "object") return false;
    const op = o as Record<string, unknown>;
    if (typeof op.externalRef !== "string" || !op.externalRef) return false;
    if (op.elementType !== "window" && op.elementType !== "door") return false;
    if (!Array.isArray(op.evidence)) return false;
  }
  return true;
}
