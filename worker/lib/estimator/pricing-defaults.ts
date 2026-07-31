// SCAFFOLD (glazing/thermal, M5 / D6) — non-zero DEFAULT glass $/m² by tier.
//
// Until ops authors real numbers, seed a sensible ASCENDING default so interim
// quotes are not silently under-priced (the $0 seed today looks priced but isn't).
// Ordered by insulating value; the owner's worked example — a 3-option product —
// lands on $100 / $120 / $140 (DG clear / toned / low-E).
//
// Consumed by the M6 importer (to seed `pricing_option_surcharge` rows per glazing
// slug) and referenced by the M5 default-tier logic. Overridden per glazing slug
// in D1 once real prices land (M7). These are DEFAULTS, never the source of truth.
export type GlassSpecification = "SG" | "DG" | "TG";
export type GlassType = "clear" | "toned" | "low_e";

/** $/m² of glazed area, keyed `${spec}:${type}`. */
export const DEFAULT_GLASS_SQM: Record<string, number> = {
  "SG:clear": 60,
  "SG:low_e": 90,
  "DG:clear": 100,
  "DG:toned": 120,
  "DG:low_e": 140,
  "TG:low_e": 180,
  "TG:clear": 160,
};

/** Default $/m² for a glazing, or null when spec/type are unknown (→ fail-closed,
 *  never a silent $0). Falls back to the spec's clear tier for an unlisted type. */
export function defaultGlassSqm(spec: GlassSpecification | null, type: GlassType | null): number | null {
  if (!spec) return null;
  if (type && DEFAULT_GLASS_SQM[`${spec}:${type}`] != null) return DEFAULT_GLASS_SQM[`${spec}:${type}`];
  return DEFAULT_GLASS_SQM[`${spec}:clear`] ?? null;
}
