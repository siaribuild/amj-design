// The THERMAL INPUT CONTRACT — the declared set of facts the thermal
// calculation may consult, and the agreed boundary with the drawing/scanning
// thread (spec §12). That thread PRODUCES these inputs; this feature CONSUMES
// them and never extracts anything itself.
//
// This file imports nothing, deliberately. Both layers (the estimator and the AI
// pipeline) and the extraction thread can depend on it without a cycle and
// without a cross-layer type dependency.
//
// The load-bearing invariant: every document-derived input is a `{ value, source }`
// pair or null — never a bare value. A value without a source is not
// representable in the type system (the compile leg of TB-6) and is treated as
// absent at runtime (`readSourced`, the runtime leg). Provenance therefore
// cannot be forgotten, and a producer's junk value is rejected at the boundary
// rather than laundered into a band.

export const THERMAL_INPUT_CONTRACT_VERSION = "tic-v1";

export type InputSource = "energy_report" | "plan" | "schedule" | "envelope_default" | "human";

const INPUT_SOURCES: ReadonlySet<string> = new Set<InputSource>([
  "energy_report", "plan", "schedule", "envelope_default", "human",
]);

/** The sources that count as "this project's own documents" for the
 *  `plan_derived` decision (spec A5/A16). The envelope default and a human entry
 *  are deliberately NOT here: the dial and the archetype describe the platform's
 *  assumptions, not evidence about this opening. */
export const DOCUMENT_SOURCES: ReadonlySet<InputSource> = new Set<InputSource>([
  "energy_report", "plan", "schedule",
]);

export type Sourced<T> = { value: T; source: InputSource } | null;

export type CompassPoint = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export const COMPASS_POINTS: ReadonlySet<CompassPoint> = new Set<CompassPoint>([
  "N", "NE", "E", "SE", "S", "SW", "W", "NW",
]);

export interface ThermalModelInputs {
  // Envelope — always present (from the resolved archetype).
  climateZone: number | null;
  // Opening identity and geometry — present today, from the schedule.
  elementType: "window" | "door" | null;
  isCompositeChild: boolean;
  widthMm: number | null;
  heightMm: number | null;
  areaM2: number | null;
  // Document-derived — partially available today; the extraction thread's
  // deliverables (spec §6.1's availability table).
  orientation: Sourced<CompassPoint>;
  roomAreaM2: Sourced<number>;
  glazingToRoomFloorRatio: Sourced<number>;
  shadingProjectionMm: Sourced<number>;
  zoneType: Sourced<string>;
  // The customer's own instruction — present today, from the schedule.
  glazingInstruction: Sourced<{ doubleGlazed: boolean | null; note: string | null }>;
}

/** Every `Sourced`-typed field on the contract, in one place. `inputsMissing` is
 *  computed uniformly over this list (AD-T5) — including the fields only the two
 *  declared-but-unbuilt rules would consume, so the day extraction lands the
 *  missing count falls as the plan_derived count rises. */
export const SOURCED_FIELDS = [
  "orientation", "roomAreaM2", "glazingToRoomFloorRatio",
  "shadingProjectionMm", "zoneType", "glazingInstruction",
] as const;

export type SourcedField = typeof SOURCED_FIELDS[number];

/** The runtime leg of TB-6, for callers outside the type system (assembled JSON,
 *  tests, and the drawing thread's producers): returns the Sourced value only
 *  when `value` is present, `source` is one of the five, and — when `compass` is
 *  asked for — the value is one of the eight points. Anything else is null and
 *  the calculation records the field missing. Junk is rejected here, never
 *  laundered into a band (spec §8 edge case). */
export function readSourced<T>(raw: unknown, opts?: { compass?: boolean }): Sourced<T> {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { value?: unknown; source?: unknown };
  if (candidate.value === undefined || candidate.value === null) return null;
  if (typeof candidate.source !== "string" || !INPUT_SOURCES.has(candidate.source)) return null;
  if (opts?.compass) {
    if (typeof candidate.value !== "string" || !COMPASS_POINTS.has(candidate.value as CompassPoint)) return null;
  }
  return { value: candidate.value as T, source: candidate.source as InputSource };
}

/** What a computed band records about itself (spec §6.2). `minShgc` is the
 *  literal type `null`: TB-29 is enforced by the type, not by a check. */
export interface ComputedBandResult {
  band: { maxUValue: number | null; minShgc: null; maxShgc: number | null; shgcTarget: number | null };
  basis: "plan_derived" | "default_envelope";
  inputsUsed: { field: string; value: unknown; source: InputSource }[];
  inputsMissing: string[];
  rulesApplied: { ruleId: string; version: string; provenance: string }[];
  defaultBandVersion: string;
  contractVersion: string;
}
