// Shared estimator types (spec §4.2 candidate payload, §7 opening model).
// Kept dependency-free so the rules engine + tests import them without the Worker.

export interface PerformanceVariant {
  variantId: string;
  /** The shared glazing option this (frame×glass) cell realises — its slug is the
   *  glass IDENTITY. Falls back to variantId when unlinked. */
  glazingOptionSlug?: string | null;
  /** The glazing option's technicalValue (single_clear | double_clear | double_lowe):
   *  the single source of the single/double/low-e CLASSIFICATION. */
  glazingClass?: string | null;
  uValue: number | null;
  shgc: number | null;
  frameType: string | null;
  frameTechnology: "conventional" | "thermally_broken" | "unknown";
  certificationRef: string | null;
  /** Private D1 surcharge identifiers required to price this exact variant. */
  pricingOptionSlugs: string[];
  /** 'certified' | 'estimated' — an estimated value is NEVER a compliance pass. */
  dataSource: string;
  certified: boolean;
  published: boolean;
}

export interface CatalogueCandidate {
  sanityProductId: string;
  /** Sanity document revision the candidate was read at (snapshot key). */
  catalogueRevision: string;
  schemaVersion: number | null;
  name: string;
  slug: string;
  family: string | null;          // window | door (category)
  series: string | null;          // family slug (e.g. awning-window)
  configuration: {
    operationTypes: string[];
  } | null;
  dimensionRule: {
    minWidthMm: number | null;
    maxWidthMm: number | null;
    minHeightMm: number | null;
    maxHeightMm: number | null;
    maxAreaM2: number | null;
    maxAspectRatio: number | null;
    ruleVersion: string | null;
    dataSource?: string;
  } | null;
  performanceVariants: PerformanceVariant[];
  optionGroups: string[];
  pricingRef: string | null;
}

// The canonical opening the selector matches against (spec §7, subset used now).
export interface OpeningInput {
  family?: string | null;         // window | door
  operationType?: string | null;  // awning | sliding | fixed | …
  widthMm?: number | null;
  heightMm?: number | null;
  qty?: number | null;
  optionSlugs?: string[];
  scheduleRequirements?: {
    doubleGlazed?: boolean | null;
    glassDescription?: string | null;
    colour?: string | null;
    flyscreen?: boolean | null;
  } | null;
  thermalContext?: {
    inputMode?: "schedule_only" | "plans_no_report" | "plans_plus_energy_report";
    requirementBasis?: "explicit_energy_report" | "plan_derived" | "default_envelope" | "human_override" | null;
    roomAreaM2?: number | null;
    totalFloorAreaM2?: number | null;
    openingAreaM2?: number | null;
    glazingToRoomFloorRatio?: number | null;
    orientation?: string | null;
    shadingKnown?: boolean | null;
    riskBand?: "low" | "medium" | "high" | null;
    climateZone?: string | null;
    jurisdiction?: string | null;
    buildingClass?: string | null;
    envelopeClass?: string | null;
    /** Governed human precedent constrained eligibility; never certification. */
    thermalPrecedentApplied?: boolean;
    /** Document reconciliation issues that must survive selection into review. */
    technicalReviewReasons?: string[];
  } | null;
  requirements?: {
    maxUValue?: number | null;
    minShgc?: number | null;
    maxShgc?: number | null;
  } | null;
  /** Governed human precedent used as a conservative eligibility floor. */
  advisoryRequirements?: {
    maxUValue?: number | null;
    minShgc?: number | null;
    maxShgc?: number | null;
  } | null;
}

// The highest supported estimator technical-contract schema version. A candidate
// with a higher schemaVersion is rejected rather than silently misread (spec §4.1).
export const SUPPORTED_SCHEMA_VERSION = 1;
