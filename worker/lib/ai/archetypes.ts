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
import type { BuildingModelV1 } from "./schema";

// v2: the archetype no longer carries a Uw cap of its own. The default Uw is the
// owner's dial (estimator/thermal/defaultBand.ts) — one place per fact, and a
// live-looking 4.0 sitting in code beside it is exactly how the constant this
// feature replaced became invisible in the first place.
export const ARCHETYPE_REGISTRY_VERSION = "v2";

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
  /** Conservative per-opening band for Path 3. It carries NO Uw cap: the cap is
   *  the active default record's, resolved per run and snapshotted into every
   *  requirement it produces. SHGC stays null here — orientation is a contract
   *  input, and §11.3 forbids "lower SHGC is always better". */
  defaultOpeningBand: { shgcMin: null; shgcMax: null; note: string };
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
      shgcMin: null, shgcMax: null,
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
 *  The archetype resolves the CLIMATE ZONE and the assumption note; the Uw cap
 *  it once carried is now the active default record's, so a hot-climate job is
 *  still held to the Melbourne bar until climate-zone resolution lands. That
 *  errs toward review and never toward under-speccing, and every application is
 *  recorded as an `envelope_default` assumption carrying the note above.
 *
 *  Replace this with climate-zone resolution once the delivery postcode is known
 *  early enough to key on (docs/estimator/thermal-selection-rework-plan.md, WS6). */
export function resolveDefaultEnvelope(model: Pick<BuildingModelV1, "jurisdiction">): EnvelopeArchetype | null {
  const state = model.jurisdiction.state;
  if (!state) return INTERIM_DEFAULT_ARCHETYPE;
  return ARCHETYPES.find((a) => a.jurisdiction === state) ?? INTERIM_DEFAULT_ARCHETYPE;
}

// The flat per-opening requirement this file used to imply is GONE. It was a
// jurisdiction constant with SHGC null — the "444 of 444 identical" defect in
// its purest form — and `computeThermalBand` is total, so the fallback branch
// that called it is unreachable by construction rather than merely unused.
