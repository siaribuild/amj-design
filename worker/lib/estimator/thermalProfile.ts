// SCAFFOLD (glazing/thermal, M2 / D5) — resolve a product's glazing × thermal
// matrix from its shared FRAME thermal profile (Sanity `thermalProfile`).
//
// This is the M2 replacement for reading Uw/SHGC off `product.performanceVariants`:
// the estimator will resolve each product's offered glazings + whole-window
// Uw/SHGC/stars through `product.thermalProfile -> rows[]`. Hardware-twin products
// share one profile (D5), so the matrix is authored once per frame.
//
// NOT yet wired into CANDIDATE_QUERY / toCandidate (that is M2) — no callers today.
import type { PerformanceVariant } from "./types";

/** A raw glazing row as projected from a `thermalProfile` document. */
export interface ThermalProfileRow {
  glazingOptionSlug: string | null; // glazing option slug — the D1 price key + identity
  glazingClass: string | null;      // glazing option technicalValue (single_clear … triple_lowe)
  uValue: number | null;
  shgc: number | null;
  tvw: number | null;               // display-only (WERS Tvw)
  heatingStars: number | null;      // display-only
  coolingStars: number | null;      // display-only
  airInfiltration: number | null;   // display-only
  frameTechnology: "conventional" | "thermally_broken" | "unknown";
  wersWindowId: string | null;
  certified: boolean;
  certificationRef: string | null;
  published: boolean;
}

// GROQ fragment (M2): splice into CANDIDATE_QUERY to dereference the frame profile.
// The estimator ranks on Uw/SHGC/class/frameTechnology; Tvw/stars ride along for
// the public display path only.
export const THERMAL_PROFILE_PROJECTION = `"thermalProfile": thermalProfile->{
  "frameTechnology": frameTechnology,
  "rows": rows[]{
    "glazingOptionSlug": glazing->slug.current,
    "glazingClass": glazing->technicalValue,
    uValue, shgc, tvw, heatingStars, coolingStars, airInfiltration,
    wersWindowId, certified, certificationRef, published
  }
}`;

/**
 * Map a raw profile row to the PerformanceVariant shape the ranker consumes.
 * TODO(glazing-thermal-M2): implement — mirror the variant guards in
 * catalogue.ts `toCandidate` (uValue∈[0.5,10], shgc∈[0,1], reject falsely
 * certified, require a glazing slug), and have `toCandidate` prefer the frame
 * profile, falling back to the legacy `performanceVariants` until every product
 * carries a profile. `variantId` should be stable per (product × glazing).
 */
export function profileRowToVariant(row: ThermalProfileRow): PerformanceVariant | null {
  // TODO(glazing-thermal-M2): real mapping + validation. Stub returns nothing so
  // no live path can accidentally depend on the profile before M2 wires it.
  void row;
  return null;
}
