// Default-envelope archetypes (LLM strategy §10.3, Phase 4). A default envelope
// is a VERSIONED set of conservative assumptions applied ONLY when the evidence
// mode requires it (Path 3 — schedule-only, no report). Every application is
// recorded as an envelope_default assumption and drives the §10.5 default-basis
// language ("indicative estimate using documented default building assumptions").
//
// The registry is still keyed by jurisdiction, but resolution no longer FAILS on
// a jurisdiction it does not list — the delivery location is unknown at estimate
// time, so one interim national default is applied instead of no band at all.
// See resolveDefaultEnvelope for the full reasoning.
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
      note: "interim assumption-based band applied nationally pending the delivery postcode; confirm with plans or an energy report",
    },
  },
];

/** The archetype used when no published one covers the model's jurisdiction —
 *  see resolveDefaultEnvelope for why that is every job today. */
const INTERIM_DEFAULT_ARCHETYPE = ARCHETYPES[0];

/** Resolve the archetype for a building model's jurisdiction, falling back to the
 *  interim national default rather than null.
 *
 *  WHY A FALLBACK AND NOT null (owner, 2026-08-14). The delivery location is not
 *  known when an estimate is produced — a manual quote has no address until the
 *  customer enters a delivery postcode at submit (0044), and a parsed file only
 *  sometimes carries one. Returning null for "no archetype covers this state"
 *  therefore did not mean "an unrelated region's band would be a guess"; it meant
 *  that in practice EVERY job outside Victoria — and every job whose state had
 *  not been determined, which is most of them — got no tier-3 band at all, so
 *  `thermalRequirement` stayed absent and nothing downstream could reason about
 *  thermal. That is a bigger fabrication than applying a stated assumption.
 *
 *  The band is deliberately conservative rather than climate-correct: VIC CZ6
 *  caps Uw at 4.0 where CZ1/CZ2 (Darwin, Brisbane) would allow 5.8, so a hot-
 *  climate job is held to a TIGHTER bar than its climate requires. That errs
 *  toward review and never toward under-speccing, and every application is
 *  recorded as an `envelope_default` assumption carrying the note above.
 *
 *  Replace this with climate-zone resolution once the delivery postcode is known
 *  early enough to key on (docs/estimator/thermal-selection-rework-plan.md, WS6). */
export function resolveDefaultEnvelope(model: Pick<BuildingModelV1, "jurisdiction">): EnvelopeArchetype | null {
  const state = model.jurisdiction.state;
  if (!state) return INTERIM_DEFAULT_ARCHETYPE;
  return ARCHETYPES.find((a) => a.jurisdiction === state) ?? INTERIM_DEFAULT_ARCHETYPE;
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
