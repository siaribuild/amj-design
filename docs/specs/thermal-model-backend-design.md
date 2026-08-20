# Thermal model — design (revision 2, against spec revision 3)

**Stage:** pipeline stage 2 (architect) · **Date:** 2026-08-20 · **Branch:** `feat/thermal-model`
**Inputs:** `docs/specs/thermal-model-backend.md` **revision 3** (TB-1..TB-37, AB-1..AB-6, A2–A16;
A1/A6/A10 withdrawn or moved), `docs/specs/thermal-model-assessment.md` (T1–T6 binding),
`docs/specs/recommendation-model-design.md` (shipped, live in production — D1–D18/AC-27 must not be
contradicted), `docs/drawing-split-recognition-design.md` (the adjacent thread; spec §12 is the
agreed boundary).
**Fence:** backend and calculations only. No UI, no Playwright, **no AI-skill schema, prompt or
`promptVersion` change (TB-33)**, no document extraction, no climate-zone resolution, no
NatHERS→band derivation (T3).
**Skills loaded:** `d1-migration-safety` (§7 is its output), codebase-design, domain-modeling.
**Decisions needed: EMPTY.** Every judgement call is in §12 (`ASSUMED:` AD-T1..AD-T16).

### What changed from design revision 1

- **Cut (moved to the drawing/scanning thread, correction 1):** `worker/lib/ai/orientation.ts` as a
  producer/precedence seam and its `normalizeOrientation`; schedule orientation extraction
  (`ScheduleLineV1.orientation`, promptVersion v4); the `energyMap.ts:98` room-identity fix,
  `roomLabel`, and room-name matching; the energy-skill normaliser swap; `PRECEDENCE_POLICY_V3`;
  the per-source orientation counter; the A/B slice split (slice B was extraction).
- **Cut (withdrawn by the owner, correction 2):** the derived 3.04 interim cap, the
  `observed_report_maximum` method (absent from the enum so it cannot quietly return), and any
  calibration "recommended value".
- **New (the task itself, correction 3):** the input contract (`ThermalModelInputs`, `Sourced<T>`),
  the rule-composed calculation emitting `ComputedBandResult` (inputsUsed / inputsMissing /
  rulesApplied / defaultBandVersion), declared-but-unbuilt attachment points, calibration's third
  axis (what the published catalogue delivers per candidate cap) and the change-cost statement.
- **Kept:** the provenance ledger + seed resolution, SELECT-only calibration with the five-project
  floor as a module property, the single staff-gated GET making AB-3's absent write path testable,
  migration `0057` CREATE-TABLE-only with its cascade audit, the `riskBand` descope and pin, the
  four-basis CHECK reasoning, and the CONTEXT.md/ADR ownership — all updated for the new shape.

---

## 0. Shape of the design, in one paragraph

One **published input contract** (`thermal/contract.ts`: every document-derived input is
`{ value, source }` or null — an unsourced value is structurally unrepresentable), one **deep
calculation module** (`thermal/computedBand.ts` reshaped: a band composed from named, versioned
rule contributions — `zone_u_cap` reading the owner's dial, `orientation_shgc` firing only when an
orientation exists — emitting the band *plus its derivation*), one **dial** (the
`thermal_default_band` ledger with a code-resident seed equal to today's 4.0, so deploying moves no
estimate), one **three-axis calibration** (demand vs assertion vs what the published catalogue can
deliver at each derived candidate cap, with the change-cost stated before the dial is turned), and
one staff-gated read route. The pipeline's `applyDefaultEnvelope` becomes the assembly point:
skip openings a report has effectively answered, assemble contract inputs from what the model
already holds, compute, persist the derivation. Document extraction is consumed through the
contract and never produced here; no skill, prompt, or selection-ladder file is touched.

---

## 1. Module boundaries and seams

| Module | Seam | Interface (everything a caller must know) | Why here |
|---|---|---|---|
| **Input contract** | `worker/lib/estimator/thermal/contract.ts` (new) | `THERMAL_INPUT_CONTRACT_VERSION`, `InputSource`, `Sourced<T>`, `ThermalModelInputs`, `ComputedBandResult`, `COMPASS_POINTS`, `DOCUMENT_SOURCES`, `readSourced()` (the runtime clamp). Imports nothing — both layers and the drawing thread can depend on it without a cycle. Invariants: a value without a source is not representable in TS and is treated as absent at runtime; an orientation outside the eight points is rejected at the boundary, never laundered into a band. | This is the agreed boundary with the drawing thread (spec §12). Publishing it as one dependency-free file is what lets that thread land producers with no rework here. |
| **The calculation** | `worker/lib/estimator/thermal/computedBand.ts` (reshaped) | One export: `computeThermalBand(inputs: ThermalModelInputs, dial: ActiveDefaultBand): ComputedBandResult`. Pure, total (a Uw cap always exists), synchronous. Internal: the rule table (`zone_u_cap`, `orientation_shgc`), the retained SHGC mapping (versioned, `unsourced_legacy`-labelled, code-resident — A14), the restructured zone table. | Same home as today — the file both layers can already reach without a cross-layer type dependency (its stated design property, kept). Deep module: composition, degradation, and derivation recording all behind one function. |
| **The dial** | `worker/lib/estimator/thermal/defaultBand.ts` (new) | `SEED_DEFAULT_BAND`, `resolveActiveDefaultBand(db)`, `ActiveDefaultBand`, `DefaultBandMethod`. Invariants: never throws (seed fallback), newest row wins, seed only when the table is empty, seed `maxUValue === 4.0` (TB-16 — the one permitted literal). | The whole "what is the default and who says so" question behind one async read; the only impure element in the thermal directory besides calibration's reads. |
| **Calibration** | `worker/lib/estimator/thermal/calibration.ts` (new) | `computeCalibration(input)` (pure), `readCalibration(env)` (SELECT + Sanity reads only), `CALIBRATION_PROJECT_FLOOR = 5`, `CalibrationReport`, `candidateCaps(...)`. Invariant: the module contains no INSERT/UPDATE/DELETE and exports nothing that writes (TB-19/TB-27 as a module property). | Three axes, one place. The guard against auto-tuning is architectural, not procedural. |
| **Calibration route** | `worker/routes/ops-thermal.ts` (new), mounted `ops.route("/thermal", opsThermal)` in `worker/routes/ops.ts` (the `opsPricing` pattern at :45/:52) | Exactly one route: `GET /api/ops/thermal/calibration`, gated by `resolveStaff`. | Thin route; a 30-line file makes AB-3's absent write verb a testable property of one file. |
| **Assembly + application** | `worker/lib/ai/pipeline.ts` — `applyDefaultEnvelope(model, dial)` and a new exported `thermalInputsFor(model, opening)` | Pure. Skips effectively-answered openings; assembles `ThermalModelInputs` from what the model already holds; writes band + derivation onto `thermalRequirement`; returns `{ archetype, dial, counts }` for the snapshot and the run counters. | The one place a computed requirement is born. Assembly lives with the model shape it reads, not in the contract (which must stay dependency-free). |

**One place per fact:**
- The default Uw: the active dial record (D1 row, else seed). The archetype's literal `4.0`
  (`archetypes.ts:60`) is **removed** — after this change it would be a second copy (AD-T7).
- The SHGC mapping: `computedBand.ts` only, retained exactly, versioned, labelled
  `unsourced_legacy`, deliberately **not** DB-settable (A14).
- The basis vocabulary: unchanged, four values, `migrations/0016:117` CHECK untouched (TB-14).
- Selection: `ladder.ts`, `select.ts`, `compositeSelect.ts`, the `rules.ts` comparator path —
  **zero edits**; `REQUIREMENT_TOLERANCE` stays the only tuned selection constant (TB-35).
- `riskBand` + the twelve-field `contextKey` (`learning.ts:17-33`): untouched, newly pinned (TB-34).
- **`worker/lib/estimator/skills/` — the whole directory is out of bounds (TB-33).** No prompt, no
  schema, no `promptVersion`, no validate change. The energy skill's existing eight-point clamp
  (`energy.ts:98-111`) stays exactly as it is, longhand-mangling wart included; fixing it belongs
  to the thread that owns extraction.

---

## 2. The load-bearing types

### 2.1 The input contract — `worker/lib/estimator/thermal/contract.ts` (spec §6.1, carried exactly)

```ts
export const THERMAL_INPUT_CONTRACT_VERSION = "tic-v1";

export type InputSource = "energy_report" | "plan" | "schedule" | "envelope_default" | "human";
/** The sources that count as "this project's documents" for the plan_derived decision. */
export const DOCUMENT_SOURCES: ReadonlySet<InputSource>; // energy_report | plan | schedule

export type Sourced<T> = { value: T; source: InputSource } | null;

export type CompassPoint = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export const COMPASS_POINTS: ReadonlySet<CompassPoint>;

export interface ThermalModelInputs {
  // Envelope — always present (from the resolved archetype)
  climateZone: number;
  // Opening identity and geometry — present today, from the schedule
  elementType: "window" | "door" | null;
  isCompositeChild: boolean;
  widthMm: number | null;
  heightMm: number | null;
  areaM2: number | null;
  // Document-derived — partially available today; the extraction thread's deliverables
  orientation: Sourced<CompassPoint>;
  roomAreaM2: Sourced<number>;
  glazingToRoomFloorRatio: Sourced<number>;
  shadingProjectionMm: Sourced<number>;
  zoneType: Sourced<string>;
  // The customer's own instruction — present today, from the schedule
  glazingInstruction: Sourced<{ doubleGlazed: boolean | null; note: string | null }>;
}

/** Runtime leg of TB-6, for callers outside the type system (assembled JSON, tests, the drawing
 *  thread's producers): returns the Sourced value only when `value` is present, `source` is one
 *  of the five, and — for orientation — the value is one of the eight points. Anything else is
 *  null, and the calculation records the field missing. Junk is rejected at the boundary, never
 *  laundered into a band (spec §8 edge case). */
export function readSourced<T>(raw: unknown, opts?: { compass?: boolean }): Sourced<T>;
```

TB-6 has two legs by construction: the **compile leg** (no constructor accepts a bare value — the
type has no unsourced variant) and the **runtime leg** (`readSourced` inside `computeThermalBand`'s
input walk treats a malformed entry as absent).

### 2.2 The output and the rules — `ComputedBandResult` (spec §6.2, carried exactly)

```ts
export interface ComputedBandResult {
  band: { maxUValue: number | null; minShgc: null; maxShgc: number | null; shgcTarget: number | null };
  basis: "plan_derived" | "default_envelope";
  inputsUsed: { field: string; value: unknown; source: InputSource }[];
  inputsMissing: string[];
  rulesApplied: { ruleId: string; version: string; provenance: string }[];
  defaultBandVersion: string;
}
```

**The rule table (composition, not a formula):**

| ruleId | version | fires when | contributes | provenance string |
|---|---|---|---|---|
| `zone_u_cap` | `v1` | always | `maxUValue` | the dial's version + method for CZ6/fallback (e.g. `thermal_default_band seed:1 (unsourced_legacy)`); `zone-table:v1 (unsourced_legacy)` for the seven non-CZ6 zones no production path reaches (TB-21) |
| `orientation_shgc` | `v1` | `inputs.orientation` non-null | `shgcTarget`, `maxShgc` | `unsourced_legacy — southern-hemisphere heuristic retained from pre-provenance code (spec A14); superseding it is a recorded version change, not an edit` |

The mapping is retained **exactly** — N ⇒ target 0.5 no cap; E/W ⇒ 0.35 cap 0.43; NE/NW/SE/SW ⇒
0.4 cap 0.5; S ⇒ 0.4 no cap — wrapped with the version and label, code-resident, not DB-settable.
Nothing is re-derived (A14). `shading_relief` and `glazing_ratio_tightening` are **named in a
comment block beside the rule table as the two declared attachment points, and no code ships for
either** (A15): when the drawing thread delivers `shadingProjectionMm` /
`glazingToRoomFloorRatio`, each lands as a new row in this table — a new `rulesApplied` entry, no
reopening of the composition, no contract change.

**Semantics, decided here:**
- `inputsUsed` = the inputs consumed by rules that fired, each with its source: `zone_u_cap`
  contributes `{ field: 'climateZone', value, source: 'envelope_default' }`; `orientation_shgc`
  contributes `{ field: 'orientation', value, source: <its document source> }`.
- `basis = 'plan_derived'` **iff** `inputsUsed` contains at least one entry whose source is in
  `DOCUMENT_SOURCES` — the dial and the archetype are `envelope_default` and can never make a band
  plan-derived (TB-11/TB-12). Today the only possible document entry is orientation (A16).
- `inputsMissing` = every `Sourced`-typed contract field that is null — uniformly, including the
  fields only unbuilt rules would consume (AD-T5). That is what makes a band resting on nothing
  legible (TB-8), and it is the number that starts moving the day the drawing thread ships.
- `minShgc` is the literal type `null` — TB-29 is enforced by the type, not by a check.
- `elementType` is **accepted and consumed by no rule** — per-opening variation comes from inputs,
  never invented modifiers (spec §5.1); it sits in the contract so the drawing thread and future
  rules address one shape.

### 2.3 The dial — `worker/lib/estimator/thermal/defaultBand.ts`

```ts
export type DefaultBandMethod = "unsourced_legacy" | "abcb_glazing_calculator" | "manual";
// observed_report_maximum is deliberately NOT in this enum — the owner withdrew it (correction 2);
// leaving it representable would invite its quiet return.

export interface ActiveDefaultBand {
  version: string;              // "seed:1" | "row:<id>" — stamped into every requirement
  maxUValue: number;
  method: DefaultBandMethod;
  source: string;
  derivedAt: string;
  observations: { openings: number; projects: number } | null;
  setBy: string;
  interim: boolean;
}

export const SEED_DEFAULT_BAND: ActiveDefaultBand = {
  version: "seed:1",
  maxUValue: 4.0,               // TB-16: today's value — deploying this feature moves no estimate.
                                // The ONLY business literal any test may assert (TB-18).
  method: "unsourced_legacy",
  source: "No citable source exists for this value. It is the constant the platform has carried " +
          "since the default envelope was written; it awaits an owner decision (ABCB Glazing " +
          "Calculator run or manual choice) entered as a superseding row.",
  derivedAt: "<implementation date>",
  observations: null,
  setBy: "system_seed",
  interim: true,
};

export async function resolveActiveDefaultBand(db: D1Database): Promise<ActiveDefaultBand>;
// Newest thermal_default_band row, else the seed. Never throws; a malformed row (max_u_value <= 0)
// is skipped with the same fallback. One read per extraction run, one per calibration read.
```

### 2.4 Model additions — `worker/lib/ai/schema.ts` (additive; `validateBuildingModelShape` passes unchanged)

```ts
export interface OpeningV1 {
  // ...existing fields unchanged...
  /** Which document class supplied wallOrientation. CONSUMPTION-SIDE BOOKKEEPING ONLY (spec §12):
   *  set where the two existing producers already write wallOrientation — applyPlanContext
   *  (:187, "plan") and applyEnergyAuthority (energyMap.ts:99, "energy_report") — one line each,
   *  no precedence logic, no new producer, no behaviour change to who wins. Resolution between
   *  competing producers is the drawing thread's job; this field records what it resolved. */
  wallOrientationSource: "energy_report" | "plan" | "schedule" | null;
}

export interface EnergyRequirementV1 {
  // ...existing fields unchanged...
  /** Present on COMPUTED requirements only (basis plan_derived | default_envelope); never set on
   *  the report path. The persisted derivation TB-7 reads back. */
  derivation?: {
    inputsUsed: { field: string; value: unknown; source: InputSource }[];
    inputsMissing: string[];
    rulesApplied: { ruleId: string; version: string; provenance: string }[];
    defaultBandVersion: string;
    contractVersion: string;    // THERMAL_INPUT_CONTRACT_VERSION
  };
}
```

`BUILDING_MODEL_SCHEMA_VERSION`: `building-model/1.1` → `building-model/1.2`. `PIPELINE_VERSION`:
one bump with a changelog line (the envelope stage's output changes for the same input). Neither is
a skill `promptVersion` — TB-33 is untouched by these.

### 2.5 The persisted requirement snapshot (`pipeline.ts` persist block :697-723)

`requirement_json` for computed bases gains the derivation and the dial snapshot (report-basis rows
unchanged; no reader exists outside tests — verified, grep hits are the writers and
`ai-pipeline.test.mjs`):

```jsonc
{
  "opening": "W04",
  "thermal": { /* EnergyRequirementV1 incl. derivation */ },
  "archetype": { /* existing immutable archetype snapshot — condition widened to any computed basis */ },
  "defaultBand": { "version": "seed:1", "maxUValue": 4.0, "method": "unsourced_legacy",
                    "source": "…", "derivedAt": "…", "observations": null,
                    "setBy": "system_seed", "interim": true }   // TB-15
}
```

TB-30's negative is testable here: the payload's keys carry no certification/compliance/NCC/
approval claim, and the basis column is one of the four.

### 2.6 The calibration aggregate — `worker/lib/estimator/thermal/calibration.ts`

```ts
export const CALIBRATION_PROJECT_FLOOR = 5;   // A3

export interface CapConsequence {
  cap: number;
  origins: ("active_default" | "zone_table" | "report_min" | "report_mean" | "report_max")[];
  publishedRowsMeeting: number;               // axis 3, rows: thermalProfile rows, published, uValue <= cap
  publishedRowsTotal: number;
  unpublishedRowsMeeting: number;             // authored-but-unpublished, reported separately (A13)
  productsWithPublishedRowMeeting: number;    // axis 3, products (non-disabled; effective row set)
  productsTotal: number;
  /** TB-24 — the change-cost statement. null for the active cap itself. */
  deltaVsActive: { publishedRows: number; productsLosingAllPublishedRows: number } | null;
}

export interface CalibrationReport {
  computedAt: string;
  catalogueRevision: string;                  // §8 edge case: two readings comparable
  activeDefault: { maxUValue: number; version: string; method: DefaultBandMethod;
                   source: string; derivedAt: string; interim: boolean };        // axis 2 (TB-22)
  basisCounts: Record<"explicit_energy_report" | "plan_derived" | "default_envelope" | "human_override", number>;
  reportRows: { openings: number; distinctProjects: number;
                minUValue: number | null; maxUValue: number | null; meanUValue: number | null }; // axis 1
  sampleAdequate: boolean;                    // TB-26; no NaN, no divide-by-zero at zero rows
  disabledProductsExcluded: number;           // AD-T14 transparency
  candidateCaps: CapConsequence[];            // sorted ascending; exactly the TB-25 union
}
```

**There is no `recommendedValue` field at any sample size** (AD-T8): the withdrawn derivation rule
must not return dressed as a recommendation, TB-19 forbids recommend-and-apply, and TB-26's
consequence clause ("in neither case is a cap recommended that axis 3 shows would reduce
deliverable products") is satisfied structurally by recommending nothing — the report presents the
three axes and the change-cost; the human concludes. **AB-6 is a property of this type**: no field
can carry a project id, account id, name, filename, external ref, document text, or the identity
of any product or row — unpublished evidence appears as counts and nothing else.

---

## 3. The dial: stored, read, turned (kept from revision 1, constraints updated)

- **Storage:** `thermal_default_band` (§7) — a **ledger**: rows only ever inserted, newest wins,
  superseding = inserting.
- **Read:** `resolveActiveDefaultBand(env.DB)` once per extraction run in `runAiExtraction`
  (before `applyDefaultEnvelope`, ~pipeline.ts:688) and once per calibration read.
- **Write, this release: none over HTTP** (AB-3). Turning the dial =
  `wrangler d1 execute --remote` inserting one row (auto-mode-gated); the next run reads it (TB-17).
- **Later, additively:** the ops screen becomes a new writer to the existing ledger — resolution,
  snapshotting and calibration unchanged.
- **TB-18 discipline, stated for every test author:** no test asserts what the value ought to be.
  Tests read the active record and assert *flow* (the requirement equals the record, the snapshot
  equals the record). The single permitted literal is TB-16's `SEED_DEFAULT_BAND.maxUValue === 4.0`.
- **No re-basing (TB-20):** structural — the pipeline only ever INSERTs `opening_requirements`
  rows (no UPDATE targets that table anywhere in `worker/`; pinned by statement-capture test).

## 4. The calculation in the pipeline

### 4.1 Assembly — `thermalInputsFor(model, opening): ThermalModelInputs` (exported from pipeline.ts)

| contract field | assembled from (today) | source stamped |
|---|---|---|
| `climateZone` | `archetype.nccClimateZone` (always 6) | n/a (plain field) |
| `elementType`, `isCompositeChild`, dims, `areaM2` | `opening.elementType`, `opening.parentRef != null`, `widthMm/heightMm/areaM2` | n/a |
| `orientation` | `opening.wallOrientation` + `opening.wallOrientationSource` — both present or the field is null (evidence you cannot cite is not evidence) | the recorded source |
| `roomAreaM2` | `model.rooms.find(r => r.roomId === opening.roomId)?.areaM2` | `plan` (rooms only ever come from plan context) |
| `glazingToRoomFloorRatio` | derived `areaM2 / roomAreaM2` when both exist (same rounding as `thermalContextFor`) | `plan` |
| `shadingProjectionMm` | `opening.shading?.horizontalProjectionMm` | `plan` |
| `zoneType` | the matched room's `zoneType` | `plan` |
| `glazingInstruction` | `opening.scheduleRequirements` (`doubleGlazed`, `glassDescription`) | `schedule` |

All of these are facts the model already holds — assembly reads, it never extracts (TB-33). In
production today every `plan`-sourced field is null (0 of 38 models carry rooms/shading) and
orientation arrives only via `energy_report` for openings the report gave no band to (A16) — the
availability table in spec §6.1, restated so nobody over-promises.

### 4.2 Application — `applyDefaultEnvelope(model, dial)`

For each opening:

1. **Skip if effectively answered.** `basis === 'human_override'` ⇒ always skip (TB-13's guard is
   upstream in the opening_instance upsert; this is belt and braces). `explicit_energy_report` ⇒
   skip **iff the band is effective**: `coerceCoherent(band).band !== null` — the existing single
   normalisation (`thermal/precedence.ts`), no second one added. A report band that coerces to
   nothing leaves the opening unanswered, so the calculation runs and the basis is computed —
   the spec §8 edge case, and a deliberate behaviour change from today's
   `if (o.thermalRequirement) continue` (which skips on the row's existence, not its content).
2. **Assemble** via `thermalInputsFor`, **compute** via `computeThermalBand(inputs, dial)`.
3. **Write** `o.thermalRequirement = { basis, maxUValue, shgcTarget, shgcMin: null, shgcMax, zoneType: null, operablePercent: null, notes, derivation }`.
4. **Count**: total computed, withShgc (`shgcTarget != null || maxShgc != null`), per-basis.

Returns `{ archetype, dial, counts }` (the archetype snapshot use at :719 reads the field; its
condition widens from `basis === "default_envelope"` to any computed basis). Composite children are
just openings in this loop — each is banded from its own inputs (TB-4); report-defined
`thermalComponents` keep their own report requirements and never reach here.

TB-32 needs no code: an effective report band skips the opening, so the calculation cannot add an
SHGC cap on top of it — pinned by test so no future change makes it false silently. TB-31
likewise: a star rating never enters any contract field; the fixture test pins the fall-through.

## 5. The boundary with the drawing/scanning thread (spec §12, made concrete)

**This feature consumes; that thread produces.** What lands here when it ships, with **zero code
change in this feature**: it sets `wallOrientation` + `wallOrientationSource` (and later
`model.rooms`, `shading`) through its own resolution machinery → `thermalInputsFor` picks the
values up → `orientation_shgc` fires more often → `plan_derived` volume and TB-9's counters rise.
The contract file (`thermal/contract.ts`) and the two bookkeeping write-sites are the whole
interface.

**Not built here, by design:** orientation extraction or normalisation of longhand ("West
elevation"), precedence between competing orientation producers (A6 moved), north-point detection,
the `energyMap.ts:98` room-name-into-roomId defect, `normalizeOpeningRef` as the single join
primitive, anything under `worker/lib/estimator/skills/`.

**One correction to hand back to that thread:** its §"guard-rail" note claims computed orientation
would feed a *hard filter* at `rules.ts:136` and should be routed into `advisoryRequirements`.
That is stale — it predates the shipped ladder. Under `RULE_VERSION = "v3-energy-objective"`
(`rules.ts:19`, verified :297-362) energy never rejects: thermal nearness is tiered by the ladder,
a `misses` candidate stays selectable, and TB-36/AC-10 *require* a computed band to bind exactly
like a reported one. No advisory routing is built here, and none should be built there.

## 6. Calibration — three axes, one read path

### 6.1 The reads (`readCalibration(env)`) — every statement a SELECT, every Sanity call a query

- **Axis 1+2 (D1):** exactly two statements —
  `SELECT requirement_basis, COUNT(*) AS n FROM opening_requirements GROUP BY requirement_basis`
  and `SELECT COUNT(*) AS openings, COUNT(DISTINCT project_id) AS projects, MIN(max_u_value) AS minU, MAX(max_u_value) AS maxU, AVG(max_u_value) AS meanU FROM opening_requirements WHERE requirement_basis='explicit_energy_report' AND max_u_value IS NOT NULL`
  — plus `resolveActiveDefaultBand`. `project_id` never leaves SQL (AB-6).
- **Axis 3, rows:** one dedicated GROQ over profile documents, executed through the same
  injectable `QueryExecutor` seam (`sanityExecutor(env)` live, fixtures in tests):
  `*[_type == "thermalProfile"]{ "id": _id, "rev": _rev, "rows": rows[]{ uValue, published } }`.
  Counting at the **profile document** level is what reproduces the measured 58-of-306 and avoids
  double-counting profiles shared across products (`thermalProfile->` is a reference). Published =
  `published !== false` (the repo's own reading, `catalogue.ts:166`).
- **Axis 3, products:** through the existing repository —
  `createCatalogueRepository(sanityExecutor(env)).queryCandidates(null, null)` (the GROQ's
  `$family == "" ||` arm returns all products; verified `catalogue.ts:363-371`). A product's
  effective row set mirrors `toCandidate`'s own preference (profile rows if any, else legacy
  `performanceVariants`) so "can deliver" means what the estimator can actually select.
  `disabled === true` products are excluded from numerator and denominator and surfaced as
  `disabledProductsExcluded` (AD-T14). `catalogueRevision` = the repo's `catalogueVersion(...)`
  token combined with a digest of the profile `_rev`s.

### 6.2 The pure computation (`computeCalibration`)

- **Candidate caps (TB-25):** exactly
  `dedupe(sort([dial.maxUValue, ...zoneCapValues(), reportMin, reportMean, reportMax]))` — with
  `zoneCapValues()` exported by `computedBand.ts` from the restructured zone table, and report
  stats rounded to 2 dp before the union. No other literal cap exists in `calibration.ts`; the
  unit test builds the expected union independently and asserts equality.
- **Per cap:** the four counts + `deltaVsActive` (null on the active cap): published-row delta and
  **products that would lose their last published row meeting the default** — the TB-24 sentence
  ("4.0 → 3.04 takes deliverable published rows from 49 to 28") as data.
- **Edges:** zero report rows ⇒ `reportRows` nulls, `sampleAdequate: false`, no NaN; zero published
  rows ⇒ zeros, denominators intact (a product with no published row counts once in
  `productsTotal`, never in a numerator — spec §8).

### 6.3 The route

`GET /api/ops/thermal/calibration` — `resolveStaff` gate (`ops-pricing.ts` pattern), 403 on null,
200 with the `CalibrationReport` JSON. No parameters, no other verb, no other route in the file.

## 7. Migration plan (`d1-migration-safety` loaded — this section is its output)

**One migration. Additive only. No rebuild, no ALTER, no DROP.**
`migrations/0057_thermal_default_band.sql` — numbering verified on `feat/thermal-model`: highest
existing file is `0056_learning_retrieval_and_provenance.sql`.

```sql
-- Additive only: one new table. No existing table is altered, dropped or rebuilt.
-- Cascade audit (d1-migration-safety): thermal_default_band is brand new — nothing REFERENCES it
-- and it REFERENCES nothing, so no ON DELETE CASCADE edge exists on either side and none of the
-- schema's 53 cascade clauses can fire. Children affected: none.
--
-- This is a LEDGER: rows are inserted, never updated or deleted. The newest row is the active
-- default band (the owner's dial); the code-resident seed (thermal/defaultBand.ts, value 4.0 =
-- today's behaviour) serves while the table is empty. Deliberately no seed row here (AD-T1).
-- The method CHECK deliberately omits 'observed_report_maximum': the owner withdrew that
-- derivation rule (spec correction 2) and the enum must not be able to express it.
CREATE TABLE thermal_default_band (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  max_u_value       REAL NOT NULL CHECK (max_u_value > 0),
  method            TEXT NOT NULL CHECK (method IN ('unsourced_legacy','abcb_glazing_calculator','manual')),
  source            TEXT NOT NULL,
  derived_at        TEXT NOT NULL,
  observations_json TEXT,
  set_by            TEXT NOT NULL,       -- staff identity as text; deliberately NOT an FK (AD-T12)
  interim           INTEGER NOT NULL DEFAULT 0 CHECK (interim IN (0,1)),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- **Cascade-affected child tables: none** (zero FK edges either direction; audit =
  `grep -r "REFERENCES thermal_default_band" migrations/` returns nothing and the DDL contains no
  `REFERENCES`). No `PRAGMA defer_foreign_keys` needed.
- **Rebuild strategy: not applicable and forbidden.** TB-14 pins: `opening_requirements`,
  `opening_instance`, `building_models`, `candidate_result` not dropped/recreated/altered; the
  four-value basis CHECK intact; `PRAGMA foreign_key_check` empty (existing heavy harness asserts
  this after applying all migrations).
- **Remote apply protocol:** export first
  (`npx wrangler d1 export apertly-db --remote --output backup-<date>-0057.sql`), apply,
  `SELECT COUNT(*)` spot-checks on `opening_requirements`/`opening_instance` before and after
  (expected delta zero). Remote apply stays behind the auto-mode gate.
- **No other schema change anywhere.** The derivation and dial snapshot ride in the existing
  `requirement_json` TEXT column; `plan_derived` is already in the 0016 CHECK and in
  `opening_instance.requirement_basis` (an unconstrained column).

## 8. Run counters — TB-9, TB-37

`AiExtractionSummary` (pipeline.ts:305, persisted to `ai_runs.summary_json`, customer-safe: counts
only, own project) gains:

```ts
basisCounts: { explicit_energy_report: number; plan_derived: number; default_envelope: number };
computedBands: { total: number; withShgc: number };   // withShgc: shgcTarget or maxShgc set
selectionTiers: Record<"meets"|"within_tolerance"|"misses"|"thermal_unknown"|"does_not_fit", number> | null;
```

- `basisCounts` + `computedBands`: from `applyDefaultEnvelope`'s returned `counts` (plus
  `energyApplied` for the report basis). The drawing thread's arrival shows up as
  `plan_derived` rising, with no query by hand (TB-9).
- `selectionTiers`: `EstimateSummary` (estimate.ts:153) gains `tierCounts`, tallied in the
  selection loop from each opening's winning candidate outcome tier (the same object
  `persist.ts:187` reads). Openings with no selected candidate are in no competing tier and are
  not counted (AD-T9); null when no estimate ran (TB-37).

## 9. Security (mandatory section)

**Not "no sensitive surface":** no PII, no money, no auth change — but a cross-account aggregate,
commercially sensitive catalogue state, and a privileged configuration value (spec §9).

### 9.1 Data classification

| Data | Class | Surface |
|---|---|---|
| `thermal_default_band` rows | **Commercial — privileged configuration.** The dial governs every future estimate's thermal bar. | Written only by a privileged DB act (wrangler, auto-mode-gated). Read by the Worker per run and the staff endpoint. Never customer-facing. |
| Calibration axes 1–2 | **Commercial — cross-account aggregate**; at 2 distinct projects it approximates one customer's specification set. | Staff-only, aggregate-only (AB-6), thinness labelled by `sampleAdequate`. |
| Calibration axis 3 | **Commercial — the owner's forward product intentions** (authored-but-unpublished counts). | Staff-only; counts only, no product or row identity in the payload (AB-6). |
| `derivation`, `wallOrientationSource`, dial snapshot | Commercial — customer project data, existing class, inside records already project-scoped (`model_json`, `requirement_json`). | No new read surface. |
| Run counters in `summary_json` | Commercial — per-project counts, all inputs single-run. | Customer sees own project's counts via the existing status poll. |

No new value is logged: the pipeline's §21.1 telemetry rule covers the new fields; this design adds
no logging of any band, orientation, room or catalogue value.

### 9.2 Trust boundaries and what validates at each

- **Customer → Worker (documents → extraction → estimate):** untrusted text and model output.
  This feature adds no extraction; its boundary defence is the contract — `readSourced` rejects
  unsourced or off-whitelist values at assembly, and no requirement value is ever read from free
  text (AB-4). The skills' own clamps are unchanged (TB-33).
- **Ops → Worker (calibration read):** Cloudflare Access perimeter on ops.*, then `resolveStaff`
  in-route (AB-1/AB-2; the local harness exercises the in-route gate with Access off, as
  `api.test.mjs` does).
- **Privileged operator → D1 (dial insert):** outside HTTP entirely; the wrangler remote-execute
  auto-mode gate is the control. AB-3 pins that no HTTP alternative exists.
- **Worker → Sanity (axis 3):** read-only GROQ against the published CDN dataset via the existing
  executor; no write API is ever constructed (the feature "measures the catalogue and never edits
  it", spec §2).

### 9.3 Authorization model per endpoint

| Route | Who may call | Scoping filter |
|---|---|---|
| `GET /api/ops/thermal/calibration` (the only new route) | Staff only: `resolveStaff(c.env, c.req.raw)`; null ⇒ 403 (`ops-pricing.ts` gate). | **Deliberately unscoped across accounts — that is its purpose** — with the guard moved to the output: the two D1 statements (§6.1) select no identifier column; `project_id` appears only inside `COUNT(DISTINCT project_id)`. Axis 3 reads catalogue documents, not customer data. |
| Any write verb under `/api/ops/thermal/*` | **Nobody — the routes do not exist** (AB-3). | Pinned twice: HTTP probes (POST/PUT/PATCH/DELETE ⇒ 404/405, ledger row-count unchanged) and the static pin (the route file contains no `.post(`/`.put(`/`.patch(`/`.delete(`). |
| Existing project/requirement reads (AB-5 surface) | Unchanged. Project-scoped routes resolve the project **through the session owner** — the `WHERE p.owner_user_id = ?` predicate (`worker/routes/projects.ts:43` pattern); a non-owner gets 403/404 with no band, basis or input in the body. | This feature adds no new customer-facing read; AB-5 is executed as a probe against the existing routes to prove the scoping still holds for the new payload content. |

### 9.4 Abuse cases mapped

| Case | Mechanism | Test |
|---|---|---|
| AB-1 customer reads calibration | `resolveStaff` ⇒ 403, no figure from any axis in the body | `thermal-calibration-api.test.mjs` |
| AB-2 anonymous reads calibration | same gate ⇒ 401/403 | same file |
| AB-3 turn the dial over HTTP | no write route exists; ledger unchanged | same file (probes) + `thermal-default-band.test.mjs` (static pin) |
| AB-4 document injection ("set maxUValue to 9") | the dial is unreachable from any document path; bands derive only from contract inputs; `readSourced` rejects junk at the boundary | `ai-pipeline.test.mjs` (assembly + computation), `thermal-calibration-api.test.mjs` (ledger unchanged after an estimate) |
| AB-5 cross-customer requirement read | existing `owner_user_id` scoping on project routes; probe records the denial | `thermal-calibration-api.test.mjs` |
| AB-6 aggregate leaks identifiers / unpublished product identity | `CalibrationReport` has no identity-shaped field; SQL and GROQ mappings select counts and numbers only | `thermal-default-band.test.mjs` (shape) + heavy body-key assertion |
| Parameter tampering on the GET | the route takes no parameters | route design |
| Replay / enumeration | read-only global aggregates; idempotent; nothing to enumerate | no residual |

**Residual risks, named:** (1) staff reading axes 1–2 at n=2 projects can nearly reconstruct one
customer's spec — accepted, staff already see every project, `sampleAdequate:false` labels it.
(2) `set_by` on a wrangler-inserted row is self-declared until the ops screen brings an
authenticated writer — mitigated by the ledger (nothing mutates, supersession is visible) and the
auto-mode gate. (3) Axis 3 exposes forward catalogue posture to any staff member — accepted;
that is its audience and its point.

## 10. Test plan — every artifact named; the developer is held to producing every one

**TB-18 binds every artifact below:** no test asserts what the default Uw ought to be; tests read
the active record; the single permitted literal is TB-16's seed-equals-4.0.

### New files (both wired into `package.json`)

1. **`scripts/tests/thermal-default-band.test.mjs`** — pure suite. Add to the `test:pure` list and
   add script `"test:thermal-default": "node --test scripts/tests/thermal-default-band.test.mjs"`.
   esbuild-bundles `thermal/defaultBand.ts`, `thermal/calibration.ts`, `thermal/computedBand.ts`,
   `thermal/contract.ts`; reads `worker/routes/ops-thermal.ts` as source text (bundling pattern:
   `thermal-selection.test.mjs` header). Owns: **TB-16** (seed: 4.0, `unsourced_legacy`, source
   states no citable source, observations null, interim true); **TB-17 unit leg** (fake-DB row
   supersedes seed; empty table ⇒ seed; malformed row ⇒ seed); **TB-19/TB-27** (every SQL
   `readCalibration` prepares begins with SELECT; the module exports nothing that writes; no
   code path mutates the resolved record); **TB-22** (axis 1+2 math from fixture aggregates);
   **TB-23** (fixture catalogue mirroring the measured shape: 306 rows / 58 published ⇒ 49
   meeting 4.0; products axis from effective row sets; unpublished counted separately);
   **TB-24** (deltaVsActive at a 3.04 candidate: rows 49→28 on the fixture, and
   products-losing-all-published-rows computed); **TB-25** (candidate caps exactly the derived
   union, deduped, sorted; independent expected-union comparison); **TB-26** (floor boundary 4 vs
   5 projects; no recommendation field exists in the shape); zero-report and zero-published edges
   (no NaN, denominators intact); **AB-3 static pin** (route file has no write verbs);
   **AB-6 shape pin** (report type/JSON carries no identifier-shaped key).
2. **`scripts/tests/thermal-calibration-api.test.mjs`** — heavy suite (boots Worker + local D1,
   pattern `api.test.mjs`; Sanity off ⇒ axis 3 empty-catalogue shape). Add to the `test:heavy`
   list and add script
   `"test:thermal-api": "node --test --test-concurrency=1 scripts/tests/thermal-calibration-api.test.mjs"`.
   Owns: **TB-28** (staff session ⇒ 200 with axes 1, 2 and 3 fields present); **AB-1** (customer
   session ⇒ 403, no axis figure in body); **AB-2** (no session ⇒ 401/403); **AB-3 HTTP probes**
   (POST/PUT/PATCH/DELETE on `/api/ops/thermal/calibration` and `/api/ops/thermal/default-band` ⇒
   404/405, `thermal_default_band` count unchanged); **TB-17 DB leg** (insert a ledger row via
   `wrangler d1 execute`, GET shows the new value/version active — no deploy); **TB-14**
   (migration applied by harness; `sqlite_master` shows the 0016 CHECK with exactly four bases;
   `PRAGMA foreign_key_check` empty; re-apply reports "No migrations to apply"); **AB-5**
   (customer A requests customer B's project/building-model/requirements routes ⇒ 403/404, no
   band/basis/input in body).

### Modified files

3. **`scripts/tests/ai-pipeline.test.mjs`** — **TB-1/TB-2/TB-3** through `applyDefaultEnvelope`
   (W vs N openings differ; rulesApplied and inputsUsed populated; no orientation ⇒ nulls +
   `orientation` in inputsMissing, `orientation_shgc` absent); **TB-4** (two lite children,
   different orientations, own bands); **TB-5 equivalence leg** (hand-built
   `ThermalModelInputs` vs `thermalInputsFor(model, opening)` ⇒ identical `ComputedBandResult`);
   **TB-6 runtime leg** (unsourced/junk-source/off-compass values ⇒ treated absent, recorded
   missing); **TB-7** (persisted `requirement_json` carries derivation + defaultBandVersion —
   fake-DB statement capture); **TB-8** (nothing-band: no document entry in inputsUsed, basis
   `default_envelope`, distinguishable by field); **TB-9** (summary `basisCounts` +
   `computedBands.withShgc`); **TB-10** (+ the coerces-to-nothing edge: all-null report band ⇒
   calculation runs, basis computed); **TB-11/TB-12** (report-sourced orientation without a band
   ⇒ `plan_derived` with inputsUsed entry; no document input ⇒ `default_envelope`, never
   `plan_derived`); **TB-13** (human-edit guard pin: locked `requirements_json` survives the
   upsert); **TB-15/TB-20** (requirement equals the active record and snapshots it; INSERT-only
   statement capture across two synthetic runs under v1 then v2); **TB-21 pipeline leg**
   (`resolveDefaultEnvelope` yields CZ6 for every jurisdiction); **TB-30** (payload keys carry no
   certification/compliance/NCC/approval match); **TB-31** (star-rating-only report fixture);
   **TB-32** (report Uw-only + known orientation ⇒ persisted band exactly the report's, maxShgc
   null); **AB-4 assembly leg** (injected text in schedule fields never reaches a band value; the
   dial is untouched).
4. **`scripts/tests/thermal-selection.test.mjs`** — `computeThermalBand` unit matrix: **TB-1 band
   math** (all eight points + none: exactly the retained mapping values); **TB-29** (`minShgc`
   null on every input combination, coherence unreachable-by-type); **TB-21 unit leg** (CZ6 and
   fallback read the dial; seven other entries present, values unchanged, labelled
   `unsourced_legacy`; two different dial records ⇒ two different caps); **TB-5 one-home scan**
   (the SHGC mapping and zone table appear in exactly one module; `computeThermalBand` is the only
   band producer — source-scan in the AC-4 grep style); **A14 pin** (`orientation_shgc` version
   and `unsourced_legacy` provenance string present in every result that used it).
5. **`scripts/tests/estimator-learning.test.mjs`** — **TB-34** pin: `contextKey` splits into
   exactly twelve `|` fields, `riskBand` at index 4, documented order; recorded context carries
   all twelve fields.
6. **`scripts/tests/estimator-recommendation.test.mjs`** — **TB-36** (identical openings,
   `explicit_energy_report` vs `plan_derived`, same numeric band ⇒ identical tiering/competing
   set/selection); **TB-37** (tier tally over a fixture selection: five keys, sums to selected).
7. **`scripts/tests/recommendation-contract.test.mjs`** — **TB-35** (AC-4-style source pin:
   `ladder.ts`, `select.ts`, `compositeSelect.ts` import none of `thermal/defaultBand`,
   `thermal/calibration`, `thermal/contract`; `REQUIREMENT_TOLERANCE` still the only tuned
   selection constant).

### Criteria with no runnable artifact — named owners, not silence

- **TB-33** (no skills file modified, no promptVersion bump, no schema field change): a property
  of the **diff**, not of runtime — owned by the tester's diff inspection and the architect's
  conformance review (absence check). Stated here so its absence from the suites is a decision,
  not a gap.
- **TB-18** (no test asserts a business value): a property of the **suites** — owned by the tester
  reading the new/changed tests, with §10's opening rule as the standard. TB-23/TB-24's fixture
  literals (306/58/49/28, caps 4.0/3.04) assert calibration *arithmetic on fixtures*, not what the
  default ought to be, and are compliant.
- **TB-11's production leg** (first real `plan_derived` row): operational observation after
  deploy; the unit leg proves the mechanism.

### Criterion → artifact map (tester's index)

| Criteria | Artifact |
|---|---|
| TB-16, TB-17(unit), TB-19, TB-22, TB-23, TB-24, TB-25, TB-26, TB-27, AB-3(static), AB-6(shape) | `thermal-default-band.test.mjs` (new) |
| TB-14, TB-17(DB), TB-28, AB-1, AB-2, AB-3(HTTP), AB-5, AB-6(body) | `thermal-calibration-api.test.mjs` (new) |
| TB-1..TB-13 (pipeline legs), TB-15, TB-20, TB-21(pipeline), TB-30, TB-31, TB-32, TB-9, AB-4 | `ai-pipeline.test.mjs` (modified) |
| TB-1(unit math), TB-5(one home), TB-21(unit), TB-29, A14 pin | `thermal-selection.test.mjs` (modified) |
| TB-34 | `estimator-learning.test.mjs` (modified) |
| TB-36, TB-37 | `estimator-recommendation.test.mjs` (modified) |
| TB-35 | `recommendation-contract.test.mjs` (modified) |
| TB-33, TB-18 | tester diff/suite inspection + architect conformance (stated above) |

## 11. File-by-file hand-off index

Discovery is done; the developer reads the files they edit but does not re-search. Line numbers as
of `feat/thermal-model` head (d1577eb5).

### Created

| Path | What / why |
|---|---|
| `migrations/0057_thermal_default_band.sql` | The ledger, §7 verbatim. Additive only; three-value method CHECK. |
| `worker/lib/estimator/thermal/contract.ts` | The published input contract (§2.1): types + `COMPASS_POINTS` + `DOCUMENT_SOURCES` + `readSourced`. Imports nothing. |
| `worker/lib/estimator/thermal/defaultBand.ts` | Seed (4.0) + `resolveActiveDefaultBand` (§2.3). |
| `worker/lib/estimator/thermal/calibration.ts` | Three-axis pure compute + SELECT/GROQ-only read + candidate caps (§2.6, §6). |
| `worker/routes/ops-thermal.ts` | One staff-gated GET (§6.3). |
| `docs/adr/0008-thermal-band-composed-from-sourced-inputs.md` | §14 text. |
| `scripts/tests/thermal-default-band.test.mjs` | §10 artifact 1. |
| `scripts/tests/thermal-calibration-api.test.mjs` | §10 artifact 2. |

### Modified

| Path | Landing point | Change |
|---|---|---|
| `worker/lib/estimator/thermal/computedBand.ts` | whole file (66 lines) | Reshaped: `computeThermalBand(inputs, dial)` → `ComputedBandResult` replaces `computeDefaultBand(ctx, elementType)`; rule table with versions/provenance; SHGC mapping retained exactly, wrapped with `orientation_shgc@v1` + `unsourced_legacy` label (A14); zone table restructured — CZ6/fallback read the dial, seven literals keep values labelled `unsourced_legacy`; `UCAP_FALLBACK` deleted; `zoneCapValues()` exported for TB-25; comment block naming the two unbuilt attachment points (A15). |
| `worker/lib/ai/archetypes.ts` | `defaultOpeningBand` :47/:60-63, `defaultRequirement` :101, `ARCHETYPE_REGISTRY_VERSION` :20 | Remove `maxUValue` from `defaultOpeningBand` (AD-T7; the note text stays); `defaultRequirement` is dead once `computeThermalBand` is total — delete it and its export (its two callers are the pipeline ternary being removed and the test bundle list). Registry version → "v2". `resolveDefaultEnvelope` unchanged. |
| `worker/lib/ai/pipeline.ts` | `applyDefaultEnvelope` :263-301; persist block :697-723; `applyPlanContext` :187; summary type :305; envelope call site :688; `thermalContextFor` :223-243 **not touched** | Resolve the dial once per run; new `thermalInputsFor(model, opening)` (exported, §4.1); effective-requirement skip via `coerceCoherent` (§4.2); write `derivation` onto the requirement; persist derivation + dial snapshot into `requirement_json` (archetype-snapshot condition at :719 widens to any computed basis); `wallOrientationSource: "plan"` set beside the existing `??=` write at :187 (only when that write landed); summary counters (§8). |
| `worker/lib/ai/energyMap.ts` | `applyEnergyAuthority` :99 **only** | One line beside the existing orientation write: `wallOrientationSource = "energy_report"`. **No other change** — room handling (:98), conflicts (:222-231), matching: all untouched (drawing thread's ground). |
| `worker/lib/ai/schema.ts` | `OpeningV1` :139-183, `EnergyRequirementV1` :124 | `wallOrientationSource` on OpeningV1; optional `derivation` on the requirement (§2.4). `validateBuildingModelShape` needs no change. |
| `worker/lib/ai/versions.ts` | `PIPELINE_VERSION` :26, `BUILDING_MODEL_SCHEMA_VERSION` :27 | One bump each, with a changelog comment line. No skill `promptVersion` anywhere (TB-33). |
| `worker/lib/estimator/estimate.ts` | `EstimateSummary` :153; loop :250-296 | `tierCounts` tally (§8). |
| `worker/routes/ops.ts` | :45/:52 | `import { opsThermal } from "./ops-thermal"; ops.route("/thermal", opsThermal);` |
| `CONTEXT.md` | Estimator section, "Requirement basis" :138-139 | §13 text applied verbatim. |
| `package.json` | `test:pure` :17, `test:heavy` :18, scripts | Two suite registrations + `test:thermal-default`, `test:thermal-api`. |
| `scripts/tests/ai-pipeline.test.mjs`, `thermal-selection.test.mjs`, `estimator-learning.test.mjs`, `estimator-recommendation.test.mjs`, `recommendation-contract.test.mjs` | per §10 | New/updated cases; bundle entry lists swap `computeDefaultBand`/`defaultRequirement` exports for `computeThermalBand`/contract exports. |

### Deleted

Nothing file-level. Within files: `computeDefaultBand`'s old signature, `UCAP_FALLBACK`,
`defaultRequirement`, the archetype's `maxUValue` literal.

### Explicitly untouched (regression fence)

**The whole of `worker/lib/estimator/skills/` (TB-33).** `worker/lib/estimator/ladder.ts`,
`select.ts`, `compositeSelect.ts`, `rules.ts` (`effectiveThermalRequirements` :168,
`resolvedRequirement` :200, `checkHardRules` :297 — energy stays an objective),
`thermal/precedence.ts` (`coerceCoherent` stays the single normalisation, now also the
effective-requirement test), `learning.ts` (`contextKey` :17-33), `worker/routes/debug.ts` (:127
keeps reading `riskBand`), `energyMap.ts` beyond the one-line source stamp,
`migrations/0016_ai_building_model.sql`, all customer-facing routes and `src/` — no UI, no
GST-touching surface.

## 12. `ASSUMED:` register (architect-level, on top of spec A2–A16)

Changes from design revision 1 are marked.

| # | Assumption | Reasoning |
|---|---|---|
| AD-T1 *(revised)* | The seed lives in code with `maxUValue: 4.0`; the migration inserts **no** seed row | TB-16 pins the value and the empty-table fallback path is what makes it testable; an append-only file must not carry a value the owner will supersede. The rev-1 "re-derive at implementation time" clause is gone with the withdrawn derivation rule |
| AD-T2 | Dial versions are strings: `seed:1`, `row:<id>`; zone-table provenance `zone-table:v1` | Monotonic per source, human-legible in snapshots, no second counter |
| AD-T3 *(revised)* | The derivation (`inputsUsed`/`inputsMissing`/`rulesApplied`/`defaultBandVersion`) rides in `EnergyRequirementV1.derivation` and `requirement_json` — no new columns or side table | The requirement is the record of the claim; a side channel could drift from it. `requirement_basis` stays the queryable column (TB-11's group-by) |
| AD-T4 *(revised)* | `wallOrientationSource` is bookkeeping set beside the two **existing** orientation writes — no setter module, no precedence logic, no new producer | Correction 1: resolution between producers is the drawing thread's job (A6 moved there). We consume a resolved value and record which producer resolved it; rev-1's `orientation.ts` seam is cut |
| AD-T5 *(new)* | `inputsMissing` = every `Sourced` contract field that is null, uniformly — including fields only unbuilt rules would consume | One rule, no special cases; makes TB-8 legible and gives the extraction thread's arrival a falling number as well as a rising one |
| AD-T6 *(new)* | No estimator-side call site ships; TB-5 is satisfied by the contract's dependency-freedom, the assembler-equivalence test, and the one-home source scan | The requirement flow is pipeline-computes → estimator-reads; a dead estimator adapter would be speculative generality (the disease A15 names) |
| AD-T7 | The archetype's `defaultOpeningBand.maxUValue` literal is removed; `defaultRequirement` deleted as dead; registry v2 | One place per fact — a live-looking 4.0 in code is how the disease started; `computeThermalBand` is total so the fallback branch is unreachable |
| AD-T8 *(replaced)* | Calibration emits **no recommended value at any sample size**; `sampleAdequate` labels thinness and the change-cost table states consequences | The withdrawn `observed_report_maximum` rule must not return dressed as a recommendation; TB-19 and TB-26's consequence clause are satisfied structurally |
| AD-T9 | `selectionTiers` counts openings whose run selected a candidate; unselected openings show in `openings − selected` | An opening with no pick has no competing tier; inventing a bucket blurs TB-37's review-load signal |
| AD-T10 | Contract and calibration types stay worker-side (`worker/lib/estimator/thermal/`) | Shared types move to `src/data/` when a frontend consumer exists; the ops screen is out of scope. The drawing thread is worker-side and imports the same path |
| AD-T11 *(revised)* | One `PIPELINE_VERSION` bump; `BUILDING_MODEL_SCHEMA_VERSION` → 1.2 | The envelope stage's output changes for the same input (versions.ts contract). Neither is a skill promptVersion; TB-33 intact |
| AD-T12 | `thermal_default_band.set_by` is TEXT with no FK to `user` | Staff identity may be an Access email with no user row; an FK adds a cascade edge to a config ledger for nothing — the Payout frozen-identity pattern |
| AD-T13 *(new)* | "Effectively answered" = `coerceCoherent(band).band !== null`, using the existing single normalisation; `human_override` is never recomputed regardless of content | Spec §8's coerces-to-nothing edge; adding a second coherence test would violate the one-normalisation rule (ladder AC-16) |
| AD-T14 *(new)* | Axis 3 rows are counted on `thermalProfile` **documents** (matches the 306/58 measurement; shared profiles counted once); the products axis uses each product's effective row set (profile rows else legacy variants, mirroring `toCandidate`); `disabled` products excluded from both numerator and denominator and surfaced as `disabledProductsExcluded` | Row counts must reproduce the owner's measured reality; "can deliver" must mean what the estimator can actually select; a withdrawn product can deliver nothing and would distort the ratio the dial-turner reads |
| AD-T15 *(new)* | Rule versions start at `zone_u_cap@v1` and `orientation_shgc@v1`; the SHGC mapping's provenance string names A14 and `unsourced_legacy` in every result that used it | The label must travel with every band that cites the rule, not sit in a comment (the spec: "its status visible wherever a band cites it") |
| AD-T16 *(new)* | The drawing design's guard-rail note ("route computed orientation into advisoryRequirements — it hard-filters at rules.ts:136") is **stale** and is not built | Verified against shipped code: `RULE_VERSION v3-energy-objective` never rejects on energy (rules.ts:297-362); TB-36/AC-10 require computed bands to bind exactly like reported ones. Handed back to that thread as a doc correction (§5) |

## 13. `CONTEXT.md` additions (architect owns; developer applies verbatim)

Replace the existing **Requirement basis** entry (Estimator section) with:

> **Requirement basis**:
> Where an opening's thermal requirement came from: an energy report, this project's documents
> (`plan_derived`), the default band alone (`default_envelope`), or a human override.
> **`plan_derived` means "derived from this project's documents"** — any of them: an energy report
> can supply orientation for an opening it states no band for, and the computed band that uses it
> is plan-derived. A plan-derived requirement always records the inputs that made it so; a
> default-envelope requirement records that nothing did. A computed requirement binds selection
> exactly as a reported one does; only the basis differs, and staff see the basis.

Add, in the Estimator section:

> **Thermal input contract**:
> The declared set of facts the thermal calculation may consult. Every document-derived input
> arrives as a value with its source or not at all — an unsourced value cannot be represented, so
> provenance cannot be forgotten. Document extraction produces these inputs; the calculation only
> consumes them.
>
> **Rule contribution**:
> One named, versioned piece of the computed band, firing only when its input exists — the band is
> composed from contributions, never from a formula that imputes what it was not given. A rule
> whose input the platform cannot yet supply is a declared attachment point, not code.
>
> **Default band (the owner's dial)**:
> The Uw cap asserted when no document evidence constrains an opening. A versioned record with
> provenance, never a bare constant; setting it is the owner's business decision, and every
> requirement it produces snapshots the record's version. Changing it affects future runs only —
> a past estimate is never re-based.
>
> **Band provenance**:
> What a thermal value rests on: the method, its citation, when, by whom, and whether anything
> citable stands behind it. `unsourced_legacy` says honestly that a value predates provenance and
> awaits a sourced supersession — it is a label, never a hidden default.
>
> **Calibration**:
> The staff-read-only measurement that puts three facts beside the dial: what parsed reports have
> demanded, what the default asserts, and what the published catalogue can deliver at each
> candidate cap — with the cost of any change stated before it is made. Calibration informs the
> human who turns the dial; it never turns it, and it never recommends a number.
>
> **Evidence floor**:
> The minimum breadth below which calibration's report-demand axis is labelled inadequate: five
> distinct projects. Below it the report says "thin evidence", never a number dressed as advice.

## 14. ADR — `docs/adr/0008-thermal-band-composed-from-sourced-inputs.md`

> # 0008 — The thermal band is composed from sourced inputs, and the default is the owner's dial
>
> Status: accepted (owner corrections 1–3 and decisions T1–T6, 2026-08-20; spec
> `thermal-model-backend.md` rev 3)
>
> ## Decision
> A per-opening thermal band is composed from named, versioned rule contributions over a declared
> input contract in which every document-derived input carries its source or is absent — an
> unsourced value is unrepresentable. The default Uw cap is resolved from a ledger
> (`thermal_default_band`, newest row active, rows never mutated) seeded at the pre-existing 4.0;
> its value is the owner's business decision, taken with a calibration view that states demand,
> assertion, and deliverable catalogue at each candidate cap. Calibration never writes and never
> recommends a number. `requirement_basis` keeps its four values; `plan_derived` means "at least
> one document-sourced input contributed". The retained orientation→SHGC mapping is versioned and
> labelled `unsourced_legacy` rather than re-derived. Document extraction is consumed through the
> contract; producing it belongs to the drawing/scanning thread.
>
> ## Context
> 444 of 444 openings without a report received one identical constant; the one function that
> would differentiate them had never executed in production; a plan-informed band was recorded
> identically to a blind one. An attempt to *derive* a tighter default from two projects' reports
> was withdrawn by the owner — it would have cut deliverable published catalogue rows from 49 to
> 28. Separately, the basis CHECK sits on a self-referencing cascade parent, so a fifth basis
> value means a forbidden table rebuild; and a parallel thread already owns extraction.
>
> ## Consequences
> Two openings differ when their inputs differ, and the record says why. Every band is auditable:
> inputs used, inputs missing, rules applied, dial version. The extraction thread's arrival is a
> rising `plan_derived` count with zero code change here. Turning the dial is cheap, sourced, and
> consequence-visible; deploying the feature moves no estimate.
>
> ## Rejected
> - Deriving the default from parsed reports (`observed_report_maximum`): withdrawn by the owner;
>   the method is absent from the enum so it cannot quietly return.
> - Auto-tuning or auto-recommending from calibration: correction 2 is the proof an automatic
>   tightening would have been exactly wrong.
> - A fifth basis value: table rebuild on a cascade parent — forbidden.
> - Re-deriving the solar mapping: new unsourced numbers with more confidence; the legacy mapping
>   is labelled instead, so a sourced replacement is a recorded supersession.
> - Building orientation extraction/precedence here: owned by the drawing thread; building it
>   twice guarantees a merge fight and two resolution semantics.

## 15. Sequencing (spec §10's three steps, each independently green)

1. **The contract and the calculation.** `thermal/contract.ts` + reshaped `computedBand.ts`
   red→green in `thermal-selection.test.mjs` (band math, one-home scan, TB-29, A14 pin) with the
   dial passed as a parameter (seed exported first). Nothing wired yet; `npm test` green.
2. **The dial and the pipeline.** `migrations/0057` (+ TB-14 heavy checks), `defaultBand.ts`,
   `applyDefaultEnvelope`/`thermalInputsFor` rewiring, the two source-stamp lines, persist
   snapshot, versions bump — `ai-pipeline.test.mjs` legs TB-1..TB-13, TB-15, TB-20, TB-21, TB-30,
   TB-31, TB-32, AB-4. This step changes production behaviour only where the spec demands it
   (derivation recorded; coerces-to-nothing edge; basis can be `plan_derived`); the band values
   themselves are unchanged at the 4.0 seed.
3. **Calibration, the route, the counters.** `calibration.ts` + `ops-thermal.ts` + mount +
   `AiExtractionSummary`/`EstimateSummary` counters — `thermal-default-band.test.mjs`,
   `thermal-calibration-api.test.mjs`, TB-9/TB-37 legs, TB-35/TB-36/TB-34 pins.

One deployable feature; the three steps are commit-level checkpoints, not deploy slices. Deploy
per protocol: full gates, security sweep green, §7 remote-apply steps, owner confirmation.

## 16. Rejected alternatives (with the reason)

| Alternative | Rejected because |
|---|---|
| Keep revision 1's `orientation.ts` producer seam, schedule orientation field, promptVersion v4 | Correction 1: extraction and producer precedence belong to the drawing thread (`docs/drawing-split-recognition-design.md`); building them twice creates two resolution semantics and a guaranteed merge conflict. TB-33 also forbids the skill change outright |
| Keep revision 1's room-identity fix (`roomLabel`, rooms-param matching) | Same boundary: that thread owns room identity and `normalizeOpeningRef`; the defect is named in spec §12's hand-over table |
| Ship 4.0 as a named constant (no ledger) | TB-17 requires supersession without a deploy; the dial is the owner's stated knob and a constant makes turning it an engineering act |
| Seed row inserted by migration 0057 | Freezes a value the owner will supersede into an append-only file; kills the empty-table fallback path TB-16 tests (AD-T1) |
| Keep `observed_report_maximum` in the method enum "for history" | The owner withdrew the rule; an expressible method is an invitation (spec §5.2 says exactly this) |
| A calibration `recommendedValue` above the evidence floor | Re-dresses the withdrawn derivation rule as advice; TB-19/TB-26 satisfied structurally by recommending nothing (AD-T8) |
| Re-derive or DB-settle the SHGC mapping | A14: inventing solar constants is the disease; eight DB-settable values with no screen is a data-entry hazard. Versioned + labelled instead |
| Implement `shading_relief` / `glazing_ratio_tightening` now with always-null inputs | A15: speculative generality; the repo already carries four extracted-and-unread fields as a warning |
| A fifth `requirement_basis` value | CHECK change on a self-referencing cascade parent = table rebuild = forbidden (TB-14); A5's sharpened definition carries the meaning |
| Put the contract types in `src/data/` | No frontend consumer exists; both consumers are worker-side. Move when the ops screen lands (AD-T10) |
| Route computed bands into `advisoryRequirements` (drawing design's guard-rail) | Stale premise — v3 rules never hard-filter on energy; doing it would violate TB-36/AC-10, which require computed bands to bind exactly like reported ones (AD-T16) |
| Count axis-3 rows via `queryCandidates` output | Shared `thermalProfile` documents would be double-counted per referencing product and the 306/58 measurement would be unreproducible (AD-T14) |
| A `selectionTiers` bucket for unselected openings | Blurs TB-37's signal; `openings − selected` already carries it (AD-T9) |
| Delete `riskBand` (assessment recommendation) | Premise expired: `learning.ts:23` and `debug.ts:127` read it; D12/AC-27 require the twelve recorded fields unchanged. Pinned instead (TB-34) |

## 17. Decisions needed

**EMPTY.** The owner asked to be guided, not asked; his three corrections are carried as written.
Every judgement call made here is tagged in §12 (AD-T1..AD-T16) on top of the spec's A2–A16, all
vetoable at acceptance.
