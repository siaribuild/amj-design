// Shared estimator types (spec §4.2 candidate payload, §7 opening model).
// Kept dependency-free so the rules engine + tests import them without the Worker.

export interface PerformanceVariant {
  variantId: string;
  glassBuildUp: string | null;
  uValue: number | null;
  shgc: number | null;
  frameType: string | null;
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
    panelPattern?: string | null;
    openingDirection?: string | null;
    isCompositeMember?: boolean;
    compositePattern?: string | null;
    dataSource?: string;
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
  requirements?: {
    maxUValue?: number | null;
    minShgc?: number | null;
    maxShgc?: number | null;
  } | null;
}

// The highest supported estimator technical-contract schema version. A candidate
// with a higher schemaVersion is rejected rather than silently misread (spec §4.1).
export const SUPPORTED_SCHEMA_VERSION = 1;
