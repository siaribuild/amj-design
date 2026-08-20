// THE THERMAL CALCULATION. One pure, total, synchronous function; one home.
//
// What this replaced: a constant. `computeDefaultBand` accepted an element type
// and ignored it, read one Uw cap out of an inert zone table, and gave 444 of
// 444 production openings the same band. The one branch that would have made two
// openings differ — the orientation→SHGC mapping — had never executed on a real
// job, because orientation only ever arrived alongside an energy report and a
// report suppressed the computed band entirely.
//
// What replaced it: COMPOSITION, not a formula. The band is assembled from
// independently-recorded rule contributions, each firing only when its input
// exists, over the declared input contract (contract.ts). Every result carries
// its own derivation — which inputs it had and from where, which rules fired at
// which version, and what was missing — so a band derived from evidence is
// distinguishable BY FIELD from a band derived from nothing.
//
// Safety properties kept from the original design:
//   - a computed band NEVER sets a minShgc, so it can never form an impossible
//     (min>max) interval and can never demand "at least this much" solar gain.
//     This is now a property of the TYPE (ComputedBandResult.band.minShgc: null),
//     not of a check that could be edited away.
//   - the Uw cap is assumption-grade (commercial), never a certified NCC figure;
//     lines it gates already degrade to commercial_only_estimate.
//   - a rule whose input the platform cannot yet supply is a declared attachment
//     point, not code (spec A15) — see ATTACHMENT POINTS below.
import {
  COMPASS_POINTS, DOCUMENT_SOURCES, SOURCED_FIELDS, THERMAL_INPUT_CONTRACT_VERSION,
  readSourced,
  type CompassPoint, type ComputedBandResult, type InputSource, type ThermalModelInputs,
} from "./contract";
import type { ActiveDefaultBand } from "./defaultBand";

const UNSOURCED_LEGACY = "unsourced_legacy";

// ── The zone table (TB-21) ───────────────────────────────────────────────────
// Assumption-grade whole-window Uw caps by NCC climate zone (colder ⇒ tighter),
// kept at the owner's decision and honestly labelled. SEVEN entries: climate
// zone 6 — the only zone any production path resolves — and every unlisted or
// unresolved zone are served by the owner's dial instead, so there is no second
// copy of the default in code. These seven figures are unsourced legacy values;
// labelling them stops anyone mistaking them for derived ones.
export const ZONE_U_CAP: Readonly<Record<string, number>> = {
  "1": 5.8, "2": 5.8, "3": 5.4, "4": 4.6, "5": 4.6, "7": 3.6, "8": 3.0,
};

/** The distinct zone-table caps, deduped and ascending — the zone term of the
 *  calibration's derived candidate-cap union (TB-25). Exported so calibration
 *  introduces no cap literal of its own. */
export function zoneCapValues(): number[] {
  return [...new Set(Object.values(ZONE_U_CAP))].sort((a, b) => a - b);
}

// ── The orientation→SHGC mapping (spec A14) ──────────────────────────────────
// RETAINED, NOT RE-DERIVED. Southern-hemisphere solar logic: north gets useful
// winter sun and can be shaded in summer ⇒ a moderate target and no cooling cap;
// east/west take harsh low-angle summer sun that eaves cannot shade ⇒ control
// cooling with a maxShgc; south is low-exposure.
//
// Inventing new solar constants is the disease this repo has just finished
// curing, so nothing here is re-derived. What changed is that the mapping stops
// being anonymous: it carries a version and an honest `unsourced_legacy` label
// that travels in every result citing it, so a sourced replacement is a RECORDED
// SUPERSESSION rather than an argument. It is deliberately code-resident and NOT
// DB-settable — eight values behind no screen is a data-entry hazard, and the
// owner's stated dial is the Uw default, not this.
const SHGC_BY_ORIENTATION: Readonly<Record<CompassPoint, { target: number | null; maxShgc: number | null }>> = {
  N: { target: 0.5, maxShgc: null },
  NE: { target: 0.4, maxShgc: 0.5 },
  E: { target: 0.35, maxShgc: 0.43 },
  SE: { target: 0.4, maxShgc: 0.5 },
  S: { target: 0.4, maxShgc: null },
  SW: { target: 0.4, maxShgc: 0.5 },
  W: { target: 0.35, maxShgc: 0.43 },
  NW: { target: 0.4, maxShgc: 0.5 },
};

// ── THE RULE TABLE ───────────────────────────────────────────────────────────
//   zone_u_cap        v1  always            → maxUValue        (the owner's dial)
//   orientation_shgc  v1  orientation known → shgcTarget/maxShgc (retained mapping)
//
// ATTACHMENT POINTS — DECLARED, NOT BUILT (spec A15, §6.3):
//   shading_relief             attaches to inputs.shadingProjectionMm
//   glazing_ratio_tightening   attaches to inputs.glazingToRoomFloorRatio
// Neither ships as code, because neither input exists yet: 0 of 38 production
// models carry rooms or shading. A rule with no input is speculative generality,
// and this repo already carries four extracted-and-read-by-nothing fields
// (northRotationDeg, conditionedFloorAreaM2, shading.verticalFeature, layoutCode)
// as the warning. When the drawing/scanning thread delivers those inputs, each
// rule lands as one new row in this table — one new `rulesApplied` entry, no
// reopening of the composition and no contract change.
const ZONE_U_CAP_RULE = { ruleId: "zone_u_cap", version: "v1" } as const;
const ORIENTATION_SHGC_RULE = { ruleId: "orientation_shgc", version: "v1" } as const;
const ORIENTATION_SHGC_PROVENANCE =
  `${UNSOURCED_LEGACY} — southern-hemisphere heuristic retained from pre-provenance code ` +
  `(spec A14); superseding it is a recorded version change, not an edit`;

/**
 * Compute one opening's band from the contract inputs and the active default
 * record, emitting the band PLUS its derivation.
 *
 * Total: a Uw cap always exists, so thermal is never simply absent. Pure and
 * synchronous: the dial is resolved once per run by the caller and passed in,
 * which is what keeps this callable from BOTH the estimator and the AI pipeline
 * without a cross-layer type dependency — the property the original primitive
 * shape existed to preserve.
 */
export function computeThermalBand(
  inputs: ThermalModelInputs,
  dial: ActiveDefaultBand,
): ComputedBandResult {
  const inputsUsed: { field: string; value: unknown; source: InputSource }[] = [];
  const rulesApplied: { ruleId: string; version: string; provenance: string }[] = [];

  // ── rule: zone_u_cap (always fires) ────────────────────────────────────────
  const zoneKey = inputs.climateZone == null ? null : String(inputs.climateZone);
  const zoneLiteral = zoneKey != null && Object.prototype.hasOwnProperty.call(ZONE_U_CAP, zoneKey)
    ? ZONE_U_CAP[zoneKey]
    : null;
  const usesDial = zoneLiteral == null;
  rulesApplied.push({
    ...ZONE_U_CAP_RULE,
    provenance: usesDial
      ? `thermal_default_band ${dial.version} (${dial.method})`
      : `zone-table:v1 (${UNSOURCED_LEGACY})`,
  });
  // The climate zone came from the resolved archetype, which is the platform's
  // assumption about this project rather than evidence from its documents — so
  // it is stamped envelope_default and can never make a band plan-derived.
  inputsUsed.push({ field: "climateZone", value: inputs.climateZone, source: "envelope_default" });

  // ── rule: orientation_shgc (fires only when an orientation exists) ─────────
  // The runtime leg of TB-6: re-read the field through the contract's clamp, so
  // an unsourced, mis-sourced or off-compass value from any producer is treated
  // as ABSENT and recorded missing rather than laundered into a band.
  const orientation = readSourced<CompassPoint>(inputs.orientation, { compass: true });
  let shgcTarget: number | null = null;
  let maxShgc: number | null = null;
  if (orientation && COMPASS_POINTS.has(orientation.value)) {
    const contribution = SHGC_BY_ORIENTATION[orientation.value];
    shgcTarget = contribution.target;
    maxShgc = contribution.maxShgc;
    rulesApplied.push({ ...ORIENTATION_SHGC_RULE, provenance: ORIENTATION_SHGC_PROVENANCE });
    inputsUsed.push({ field: "orientation", value: orientation.value, source: orientation.source });
  }

  // ── derivation bookkeeping ────────────────────────────────────────────────
  // inputsMissing is computed uniformly over EVERY Sourced contract field that
  // is null (AD-T5), including the fields only the unbuilt attachment points
  // would consume. That is what makes a band resting on nothing legible (TB-8),
  // and it is the number that starts falling the day extraction ships.
  const inputsMissing = SOURCED_FIELDS.filter((field) => {
    const raw = inputs[field] as unknown;
    return readSourced(raw, field === "orientation" ? { compass: true } : undefined) == null;
  });

  // plan_derived IFF at least one CONSUMED input came from this project's own
  // documents. The dial and the archetype are envelope_default, so neither can
  // make a band plan-derived (TB-11/TB-12). Today orientation is the only
  // possible document entry (spec A16); the extraction thread raises the volume
  // with no code change here.
  const basis = inputsUsed.some((used) => DOCUMENT_SOURCES.has(used.source))
    ? "plan_derived"
    : "default_envelope";

  return {
    band: {
      maxUValue: usesDial ? dial.maxUValue : zoneLiteral,
      minShgc: null,
      maxShgc,
      shgcTarget,
    },
    basis,
    inputsUsed,
    inputsMissing,
    rulesApplied,
    defaultBandVersion: dial.version,
    contractVersion: THERMAL_INPUT_CONTRACT_VERSION,
  };
}
