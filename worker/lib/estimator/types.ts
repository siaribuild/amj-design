// Shared estimator types (spec §4.2 candidate payload, §7 opening model).
// Kept dependency-free so the rules engine + tests import them without the Worker.
//
// The one import is a TYPE, from the catalogue module that already owns the
// shape an editor authors in Sanity. Re-declaring it here would be a second
// definition of the same contract, free to drift from the projection that fills
// it — the exact failure this whole feature is recovering from.
import type { FamilyDefaultSplit } from "../../../src/data/catalogue";
import type { FrameSystem } from "../../../src/data/frameSystem";

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
  /** The WERS/AFRC window id backing these figures, when the editor recorded
   *  one. A REFERENCE, never a gate: a product's thermal figures are its single
   *  source, and a variant without a reference is ranked on the same footing
   *  (ADR 0011, ops2 "Why this product" Phase 1). */
  certificationRef: string | null;
  /** Private D1 surcharge identifiers required to price this exact variant. */
  pricingOptionSlugs: string[];
  published: boolean;
}

// Re-exported, not re-declared, for the same reason FamilyDefaultSplit is
// imported above: the estimator, the segment routes and the customer's product
// picker all read this shape, and a second definition here would be free to
// drift from the one they share.
export type { FrameSystem, FrameSystemEdge, FrameSystemAffinity } from "../../../src/data/frameSystem";

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
  /** The family's answer to "what goes next to this when the opening is too wide
   *  for one frame". Null on every family an editor has not authored, which is
   *  the do-not-pair default and the reason this is nullable rather than filled
   *  in with assumptions here. */
  defaultSplit: FamilyDefaultSplit | null;
  /** SCAFFOLD (product compatibility, C3): the extrusion PLATFORM this frame is
   *  built on — AMJ80, AMJ100 — plus any other platform its editor has declared
   *  couplable with it. The units of one composite opening are chosen from a
   *  single system, because differing frame depths clash at the mullion.
   *
   *  Null on every product an editor has not tagged. That is UNKNOWN, never
   *  "incompatible": an untagged product must not be eliminated, so the absence
   *  of this data can only ever cost the constraint, not the line. */
  frameSystem: FrameSystem | null;
  /** Withdrawn from sale. The machine must never choose it — see selectForOpening —
   *  but it stays in the repository so ops can still configure and revalidate a
   *  line whose product was disabled after it was quoted. Absent ⇒ available. */
  disabled: boolean;
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
