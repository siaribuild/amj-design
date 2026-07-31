// Default-envelope archetypes (LLM strategy §10.3, Phase 4). A default envelope
// is not a universal house: it is a VERSIONED, jurisdiction-scoped set of
// conservative assumptions applied ONLY when the evidence mode requires it
// (Path 3 — schedule-only, no report). Every application is recorded as an
// envelope_default assumption and drives the §10.5 default-basis language
// ("indicative estimate using documented default building assumptions").
//
// Registry home: §10.3 wants technical admins to publish archetypes in Sanity.
// Until that studio type is provisioned, this code-resident registry IS the
// published set — version-locked, snapshotted immutably into each run's
// requirement_json, so a later registry change can never mutate a past estimate.
import type { BuildingModelV1, EnergyRequirementV1 } from "./schema";

export const ARCHETYPE_REGISTRY_VERSION = "v1";

export interface EnvelopeArchetype {
  id: string;
  effectiveFrom: string;
  jurisdiction: string;            // AU state
  nccClimateZone: number;
  storeys: number | null;
  wall: { system: string; totalR: number };
  ceiling: { totalR: number };
  floor: { system: string };
  shadingProfile: string;
  /** Widened prediction interval when this archetype substitutes for evidence. */
  uncertaintyPenalty: number;
  /** Conservative per-opening band for Path 3. SHGC stays null in Mode A —
   *  orientation is unknown, and §11.3 forbids "lower SHGC is always better". */
  defaultOpeningBand: { maxUValue: number; shgcMin: null; shgcMax: null; note: string };
}

// §3.1 minimum context: Melbourne, new build, current energy requirements. The
// Uw cap is an ASSUMPTION-GRADE commercial band (owner-approved estimated data
// regime), not a certified NCC DtS value — everything it gates already degrades
// to commercial_only_estimate because the catalogue performance is estimated.
export const ARCHETYPES: EnvelopeArchetype[] = [
  {
    id: "VIC_CZ6_DETACHED_NCC2022_DEFAULT",
    effectiveFrom: "2026-07-25",
    jurisdiction: "VIC",
    nccClimateZone: 6,
    storeys: null,
    wall: { system: "brick_veneer", totalR: 2.5 },
    ceiling: { totalR: 5.0 },
    floor: { system: "slab_on_ground" },
    shadingProfile: "typical_suburban",
    uncertaintyPenalty: 0.25,
    defaultOpeningBand: {
      maxUValue: 4.0, shgcMin: null, shgcMax: null,
      note: "assumption-based band for VIC CZ6 new build; confirm with plans or an energy report",
    },
  },
];

/** Resolve the archetype for a building model's jurisdiction, or null when no
 *  published archetype covers it (⇒ no default band is applied — never a guess
 *  from an unrelated region). */
// SCAFFOLD WS6 (thermal rework): broaden beyond the single VIC archetype (climate
// -zone keyed) so tier-3 covers a project's jurisdiction. Feeds thermal/computedBand.
// Plan §5/WS6.
export function resolveDefaultEnvelope(model: Pick<BuildingModelV1, "jurisdiction">): EnvelopeArchetype | null {
  const state = model.jurisdiction.state;
  if (!state) return null;
  return ARCHETYPES.find((a) => a.jurisdiction === state) ?? null;
}

/** The Path 3 requirement an archetype implies for one opening. */
// SCAFFOLD WS6 (thermal rework): make this per-opening — accept the opening +
// thermalContext (orientation/room/glazing-ratio) and derive an orientation-aware
// band incl. SHGC when known, instead of a flat archetype constant with SHGC null.
// Superseded by thermal/computedBand.computeDefaultBand. Plan §5/WS6.
export function defaultRequirement(archetype: EnvelopeArchetype): EnergyRequirementV1 {
  return {
    basis: "default_envelope",
    maxUValue: archetype.defaultOpeningBand.maxUValue,
    shgcTarget: null,
    shgcMin: archetype.defaultOpeningBand.shgcMin,
    shgcMax: archetype.defaultOpeningBand.shgcMax,
    zoneType: null,
    operablePercent: null,
    notes: archetype.defaultOpeningBand.note,
  };
}
