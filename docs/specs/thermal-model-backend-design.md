# Thermal model backend remediation — design

**Stage:** pipeline stage 2 (architect) · **Date:** 2026-08-20 · **Branch:** `feat/recommendation-model`
**Inputs:** `docs/specs/thermal-model-backend.md` (spec, TB-1..TB-29, AB-1..AB-5, A1–A10),
`docs/specs/thermal-model-assessment.md` (T1–T6 binding), `docs/specs/recommendation-model-design.md`
(shipped; D1–D18 and AC-27 must not be contradicted).
**Fence:** backend and calculations only. No UI, no Playwright, no climate-zone resolution, no
postcode capture, no rasterisation, no NatHERS→band derivation (T3).
**Skills loaded:** `d1-migration-safety` (§7 names the cascade audit), codebase-design,
domain-modeling.
**Decisions needed: EMPTY.** Every judgement call is in the §12 `ASSUMED:` register (AD-T1..AD-T14)
for veto at acceptance.

---

## 0. Shape of the design, in one paragraph

One new fact-of-record (the **active default band**, a provenance ledger in D1 with a code-resident
seed), one new deep module that owns resolving it (`thermal/defaultBand.ts`), one pure aggregate
over data that already exists (`thermal/calibration.ts`, read-only by construction), one new seam
that owns everything about wall orientation (`ai/orientation.ts`: the eight-point whitelist, the
normaliser, and the single source-aware setter), and three surgical corrections in the existing
pipeline: `applyDefaultEnvelope` learns to say *where its number came from* and *whether evidence
contributed* (`plan_derived` + `basisInputs`), `applyEnergyAuthority` stops clobbering `roomId`
with a room name, and the run summary learns to count what it did. No table is rebuilt, no basis
value is added, no selection-ladder file is touched.

---

## 1. Module boundaries and seams

| Module | Seam | Interface (everything a caller must know) | Why here |
|---|---|---|---|
| **Default band** | `worker/lib/estimator/thermal/defaultBand.ts` (new) | `SEED_DEFAULT_BAND`, `resolveActiveDefaultBand(db)`, the `ActiveDefaultBand` / `DefaultBandProvenance` types. Invariants: never throws (falls back to seed), most-recent row wins, seed used only when the table is empty. | Deep module: the whole "where does the cap come from, and how do I prove it" question behind one async read. The only impure element in the thermal directory. |
| **Calibration** | `worker/lib/estimator/thermal/calibration.ts` (new) | `computeCalibration(input)` (pure), `readCalibration(db)` (SELECT-only), `CALIBRATION_PROJECT_FLOOR = 5`, `CalibrationReport`. Invariant: the module contains no INSERT/UPDATE/DELETE and exports nothing that writes. | The read path and the guard live in one place, so "calibration never moves the default" is a property of the module, not a discipline of its callers. |
| **Orientation** | `worker/lib/ai/orientation.ts` (new) | `COMPASS_POINTS`, `CompassPoint`, `OrientationSource`, `ORIENTATION_PRECEDENCE` (energy_report 100 > plan 80 > schedule 60), `normalizeOrientation(raw)`, `applyOrientation(opening, {value, source})` → `{ conflict | null }`. Invariants: output is one of eight points or null, never free text; a lower-precedence source never overwrites a higher one; a disagreement is returned, never swallowed. | Today the whitelist exists in three places (energy.ts, plan.ts schema, learning.ts) and the setter logic in two, about to be three. One seam makes TB-19/AB-4 a single test surface and makes "who set this orientation" answerable. |
| **Band computation** | `worker/lib/estimator/thermal/computedBand.ts` (modified) | `computeDefaultBand(ctx, activeBand)` → `{ band, provenance }`. Stays pure and total (never null — a cap always exists). | Same seam as today, deepened: the returned band now carries its provenance instead of an anonymous constant. |
| **Envelope application** | `worker/lib/ai/pipeline.ts` `applyDefaultEnvelope(model, activeBand)` (modified) | Pure. Decides `plan_derived` vs `default_envelope` **at the moment the band is built**, stamps `basisInputs`, returns the application summary for the run counters. | This is the one place a computed requirement is born; the basis decision must live where the band does or the two drift. |
| **Calibration route** | `worker/routes/ops-thermal.ts` (new), mounted `ops.route("/thermal", opsThermal)` in `worker/routes/ops.ts` | Exactly one route: `GET /api/ops/thermal/calibration`. Gate: `resolveStaff` (the `ops-pricing.ts` pattern). | Thin route over `readCalibration`. A dedicated file makes AB-3 pinnable: the absence of a write verb is a property of a 30-line file, checkable by test. |

**What stays where (one place per fact):**
- The cap value: the active default band record (D1 row, else seed). The archetype's literal `4.0`
  is **removed** (AD-T7) — after this change it would be a second copy of the fact.
- The basis vocabulary: unchanged, four values, `migrations/0016` CHECK untouched (TB-16).
- Selection: `ladder.ts`, `select.ts`, `compositeSelect.ts`, `rules.ts` comparator — **zero edits**.
  `REQUIREMENT_TOLERANCE` remains the only tuned constant in selection (TB-27).
- `riskBand` and the twelve-field `contextKey` (`learning.ts:17-33`): **untouched, and newly
  pinned** (TB-26). The assessment's deletion recommendation is rejected; AC-27 (accepted
  yesterday) requires the twelve recorded fields unchanged.
- The authority chain: `applyDefaultEnvelope` still skips any opening carrying a requirement
  (`pipeline.ts:268`); `effectiveThermalRequirements` (`rules.ts:168`) unchanged. TB-15/TB-21.

---

## 2. The load-bearing types

### 2.1 The default band and its provenance (`worker/lib/estimator/thermal/defaultBand.ts`)

```ts
export type DefaultBandMethod =
  | "observed_report_maximum"   // derived from the platform's own parsed reports (the seed's rule)
  | "abcb_glazing_calculator"   // externally cited — supersedes the interim value on arrival
  | "manual"                    // a person set it, with a stated source
  | "unsourced_legacy";         // pre-provenance literal (the seven non-CZ6 zone entries)

export interface DefaultBandProvenance {
  version: string;              // "seed:1" | "row:<id>" | "zone-table:v1" — stamped into every requirement
  method: DefaultBandMethod;
  source: string;               // the citation: query, document, calculator run, or person
  derivedAt: string;            // ISO date
  observations: { openings: number; projects: number } | null;  // null for externally cited sources
  setBy: string;                // "system_seed" | staff identity (free text — see AD-T12)
  interim: boolean;             // true while the value rests on the platform's own thin sample
}

export interface ActiveDefaultBand extends DefaultBandProvenance {
  maxUValue: number;
}

/** Code-resident seed. The developer RE-DERIVES the figures at implementation time by running the
 *  documented query (§2.2) against production and records them here as measured then. Tests pin
 *  the invariants (TB-2): maxUValue < 4.0, maxUValue === the value its own source states,
 *  method 'observed_report_maximum', observations non-null, interim true — NEVER the literal. */
export const SEED_DEFAULT_BAND: ActiveDefaultBand;

/** Most recent thermal_default_band row, else the seed. Never throws; a malformed row
 *  (max_u_value <= 0) is skipped with the same fallback. One read per extraction run. */
export async function resolveActiveDefaultBand(db: D1Database): Promise<ActiveDefaultBand>;
```

### 2.2 The seed's derivation rule, documented beside it

A comment block in `defaultBand.ts` carries the re-runnable derivation (spec A1,
`observed_report_maximum`: the loosest cap any parsed report ever demanded, rounded to 2 dp,
capped at the outgoing 4.0):

```sql
-- Re-run against production (read-only) and record the figures as measured:
--   npx wrangler d1 execute apertly-db --remote --json --command "
--     SELECT MAX(max_u_value) AS loosest, MIN(max_u_value) AS tightest,
--            ROUND(AVG(max_u_value),2) AS mean, COUNT(*) AS openings,
--            COUNT(DISTINCT project_id) AS projects
--       FROM opening_requirements
--      WHERE requirement_basis='explicit_energy_report' AND max_u_value IS NOT NULL"
-- seed.maxUValue = min(round(loosest, 2), 4.0); observations = { openings, projects }.
```

At the 2026-08-20 measurement this yields 3.04 (255 openings, 2 projects) — the developer records
whatever the query returns at implementation time, and `source` states the rule and the query.

### 2.3 Basis inputs (`worker/lib/ai/schema.ts`)

```ts
/** One recorded document fact that contributed to a computed band. Extensible: later members of
 *  the union are room geometry, shading, climate zone. */
export interface BasisInput {
  field: "orientation";
  value: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
  source: "schedule" | "plan" | "energy_report";
}

export interface EnergyRequirementV1 {
  // ...existing fields unchanged...
  /** Present on COMPUTED bands only (basis default_envelope | plan_derived).
   *  plan_derived  ⇒ length >= 1;  default_envelope ⇒ [] (TB-13/TB-14).
   *  Never set on the report path. */
  basisInputs?: BasisInput[];
}
```

The decision rule, applied inside `applyDefaultEnvelope` at the moment the band is built:

> `basisInputs` = `[{ field: 'orientation', value, source }]` iff the opening carries **both** a
> `wallOrientation` and a recorded `wallOrientationSource`; else `[]`.
> `basis` = `'plan_derived'` iff `basisInputs.length > 0`, else `'default_envelope'`.
> Evidence you cannot cite is not evidence: orientation without a recorded source (impossible via
> `applyOrientation`, but the rule is stated) yields `default_envelope`.

### 2.4 Opening additions (`worker/lib/ai/schema.ts`, additive — `validateBuildingModelShape` passes unchanged)

```ts
export interface OpeningV1 {
  // ...existing fields unchanged...
  /** Which document class supplied wallOrientation. Set exclusively by applyOrientation;
   *  null iff wallOrientation is null. (Slice A) */
  wallOrientationSource: "schedule" | "plan" | "energy_report" | null;
  /** The energy report's room NAME, verbatim. roomId keeps meaning "an id present in
   *  model.rooms, or null" — the two facts never share a field again. (Slice B) */
  roomLabel: string | null;
}
```

`BUILDING_MODEL_SCHEMA_VERSION`: `building-model/1.1` → `1.2` in slice A (wallOrientationSource),
→ `1.3` in slice B (roomLabel). `PIPELINE_VERSION` bumps in both slices — each changes what a
stage produces for the same input (versions.ts contract).

### 2.5 The persisted requirement snapshot (`pipeline.ts` persist block, ~line 703)

`requirement_json` for computed bases gains two keys (report-basis rows unchanged):

```jsonc
{
  "opening": "W04",
  "thermal": { /* EnergyRequirementV1 incl. basisInputs */ },
  "archetype": { /* existing immutable archetype snapshot */ },
  "defaultBand": {          // TB-1: the ACTIVE record, snapshotted immutably
    "version": "row:3", "maxUValue": 3.04, "method": "abcb_glazing_calculator",
    "source": "…", "derivedAt": "…", "observations": null, "setBy": "…", "interim": false
  }
}
```

No reader of `requirement_json` exists outside tests (verified: grep hits are
`archetypes.ts`/`pipeline.ts` writers and `ai-pipeline.test.mjs`), so the addition is safe. TB-7's
negative is testable here: the persisted payload's keys carry no certification/compliance claim.

### 2.6 The calibration aggregate (`worker/lib/estimator/thermal/calibration.ts`)

```ts
export const CALIBRATION_PROJECT_FLOOR = 5;   // A3: two projects is a coincidence, five is a pattern

export interface CalibrationReport {
  computedAt: string;
  activeDefault: { maxUValue: number; version: string; method: DefaultBandMethod; interim: boolean };
  basisCounts: Record<"explicit_energy_report" | "plan_derived" | "default_envelope" | "human_override", number>;
  reportRows: {
    openings: number;
    distinctProjects: number;
    minUValue: number | null;   // null when openings === 0 — never NaN (spec §7 zero-report edge)
    maxUValue: number | null;
    meanUValue: number | null;  // 2 dp
  };
  gap: {                        // signed: positive ⇒ the default is LOOSER than observation
    defaultMinusObservedMax: number | null;
    defaultMinusObservedMean: number | null;
  };
  sampleAdequate: boolean;      // distinctProjects >= CALIBRATION_PROJECT_FLOOR
  /** Present ONLY when sampleAdequate: min(round2(observed max), 4.0) — the same
   *  observed_report_maximum rule the seed states (AD-T8). Below the floor: null, and no
   *  substitute figure anywhere in the payload (TB-10). */
  recommendedValue: number | null;
}
```

`computeCalibration` is pure (fed the two aggregate rows + the active band); `readCalibration(db)`
runs exactly two SELECTs (§9 Security names them) and delegates. **AB-5 is a property of this
type**: no field can carry a project id, account id, name, filename or document text — the SQL
never selects an identifier column, and the shape has nowhere to put one.

---

## 3. How the default band is stored and read (spec A2 — additive when the screen arrives)

- **Storage:** new table `thermal_default_band` (§7). It is a **ledger**: rows are only ever
  inserted, never updated or deleted; the newest row is the active record. Superseding = inserting.
- **Read path:** `resolveActiveDefaultBand(env.DB)` once per extraction run in `runAiExtraction`
  (before `applyDefaultEnvelope`, ~pipeline.ts:688), passed down to the pure functions.
- **Write path, this release:** none over HTTP (AB-3). "Ops-settable without a deploy" =
  `wrangler d1 execute --remote` inserting one row; the next run picks it up (TB-3).
- **Later, additively:** the ops screen POSTs → a new route inserts a row with `setBy` = the staff
  identity. Nothing about resolution, snapshotting or calibration changes — the screen is a new
  writer to an existing ledger, not a rewrite. That is the additive property spec A2 asks for.
- **No silent re-basing (TB-4):** structural. `opening_requirements` rows are only INSERTed by the
  pipeline (verified: no UPDATE statement targets the table anywhere in `worker/`); a new active
  record affects runs that start after it exists. Pinned by test, not by discipline.

## 4. Orientation: supply, precedence, and conflicts

### 4.1 The single setter (both slices route through it)

`applyOrientation(opening, { value, source })` in `worker/lib/ai/orientation.ts`:

1. `normalizeOrientation(value)` → one of the eight points or null. Null ⇒ no-op.
2. No existing orientation ⇒ set `wallOrientation` + `wallOrientationSource`.
3. Existing value **equal** ⇒ keep the value; upgrade `wallOrientationSource` to the
   higher-precedence source (the value now rests on the stronger authority). No conflict.
4. Existing value **different** ⇒ the higher-precedence source's value wins (both fields updated,
   or kept, accordingly) and a conflict descriptor is **returned** — the caller records it. Equal
   precedence (two documents of the same class) ⇒ keep first, still return the conflict.

`normalizeOrientation` (TB-18/TB-19, deterministic, no prefix matching): uppercase, split on
non-letters, drop the noise words ELEVATION / FACING / WALL / SIDE, then the remaining tokens must
be exactly one compass term — `N|NORTH`, `NE|NORTHEAST|NORTH EAST`, `E|EAST`, `SE|…`, `S|SOUTH`,
`SW|…`, `W|WEST`, `NW|…` (two-word forms join). Anything else → null. Worked negatives: `"N/A"` →
tokens `N`,`A` → not one term → null; `"Rear"`, `"Bed 2"`, `""`, a sentence → null;
`"West elevation"` → `WEST` → `W`.

### 4.2 Call sites

| Producer | Source | Slice | Change |
|---|---|---|---|
| Schedule lines (`pipeline.ts` `linesToBuildingModel` / merge, ~:86 and ~:48) | `schedule` (60) | **B** | `ScheduleLineV1.orientation` (new, §5) applied via `applyOrientation` when openings are built. Cross-schedule-doc disagreement in `mergeScheduleLines`: keep first + `keep_first_and_flag` conflict, mirroring the dims pattern (AD-T5). |
| Plan context (`pipeline.ts:187` `applyPlanContext`) | `plan` (80) | **A** (setter swap), effective vs schedule in **B** | `opening.wallOrientation ??= …` becomes `applyOrientation(…, "plan")`. A returned conflict is pushed onto `model.conflicts` with `field: "orientation"`. |
| Energy authority (`energyMap.ts:99` `applyEnergyAuthority`) | `energy_report` (100) | **A** | Setter swap only. Its conflict return is **ignored** here — the existing `contextConflict` machinery (`energyMap.ts:222-231`) already records report-vs-rest disagreement at mapping time; recording it twice would double-flag (one place per fact). |

Review flags: after model assembly, the pipeline walks `model.conflicts` and calls
`flagOpening(entity, "orientation_source_conflict")` for `field === "orientation"` rows — same
pass structure as the energy-conflict flags at pipeline.ts:~645. TB-22's three legs land: plan
beats schedule (conflict recorded), report beats both (contextConflict fires — for the first
time), agreement raises nothing (rule 3).

### 4.3 Precedence registration

`ORIENTATION_PRECEDENCE` lives in `orientation.ts`. `energyMap.ts`'s `PRECEDENCE_POLICY_V2` gains
a sibling field entry `orientation: energy_report 100 > dimensioned_plans 80 > architectural_schedule 60`
and `PRECEDENCE_POLICY_VERSION` bumps to `"v3"` — the policy constant is the documented registry
of field precedences (spec A6), and the orientation module's numbers must cite it, not fork it.

### 4.4 What this must not do (TB-21, unchanged by design)

A report-carried requirement means `applyDefaultEnvelope` never reaches the opening — the computed
SHGC path cannot decorate an authoritative band. No code change is needed to keep this true; the
test pins it so no future change makes it false silently.

## 5. The schedule skill change (slice B — the one prompt-contract change)

`worker/lib/estimator/skills/schedule.ts`:

- `ScheduleLineV1` gains `orientation: "N"|"NE"|"E"|"SE"|"S"|"SW"|"W"|"NW" | null`.
- `LINE_PROPS` gains `orientation: { type: ["string","null"], enum: [8 points, null] }` (the enum
  shape plan.ts already uses).
- RULES gains one line: *"If the schedule states a compass orientation or elevation for a line
  (e.g. 'W', 'West', 'West elevation'), record it in `orientation`; otherwise null. A room name or
  location word ('Rear', 'Hall') is never an orientation."*
- `validate` clamps through `normalizeOrientation` — the model's output is untrusted; the
  deterministic whitelist is the guard AB-4 relies on, not the prompt.
- `promptVersion: "v3"` → `"v4"`.

`worker/lib/estimator/skills/energy.ts:98-111`: the inline `ORIENTATIONS` set is replaced by the
shared `normalizeOrientation` (drop the `strCap(…, 3)` pre-truncation, which today mangles "West"
→ "WES" → null; the normaliser widens acceptance to longhand while the output vocabulary is
unchanged). Validation-only change — no energy prompt bump.

**Operational cost, stated:** bumping `promptVersion`/`PIPELINE_VERSION` moves the stage
idempotency key, so the next run per project re-calls the model instead of replaying the cached
stage. There is no forced backfill: runs fire per upload, cost lands per active project on its
next run, and the 38 existing models are test data the owner will purge (assessment Q12). Slice A
bumps `PIPELINE_VERSION` too (output changed) with the same per-run, no-backfill profile.

## 6. The room-identity fix (slice B)

- `energyMap.ts:98` (`applyEnergyAuthority`): `if (authority.room) opening.roomId = authority.room`
  becomes `if (authority.room) opening.roomLabel = authority.room`. `roomId` is never written by
  the report path again — a plan-derived id survives (TB-24).
- **Matching does not regress, and does not start false-flagging:** `mapEnergyToOpenings` gains an
  optional `rooms?: BuildingModelV1["rooms"]` parameter (pipeline passes `model.rooms`).
  `contextCompatible`, `contextSpecificity` and `contextConflict` compare the constraint's room
  label against the opening's `roomId` **or** the name of the room `roomId` resolves to. Today's
  behaviour is preserved exactly when `rooms` is empty (production: 0 of 38), and when plans do
  supply rooms, a report saying "Bed 2" against a plan id `r_bed2`/name "Bed 2" matches by name
  instead of raising a spurious context conflict (AD-T6).
- `thermalContextFor` (`pipeline.ts:223-243`) is untouched — with the clobber gone its
  `model.rooms.find(r => r.roomId === opening.roomId)` lookup can finally succeed, which is TB-25.
- `riskBand` keeps being computed and recorded exactly as today (TB-26; spec A8).

## 7. Migration plan (`d1-migration-safety` loaded — this section is its output)

**One migration. Additive only. No rebuild, no ALTER, no DROP.**

`migrations/0057_thermal_default_band.sql` — numbering verified against the tree: highest existing
file is `0056_learning_retrieval_and_provenance.sql`.

```sql
-- Additive only: one new table. No existing table is altered, dropped or rebuilt.
-- Cascade audit (d1-migration-safety): thermal_default_band is brand new — nothing REFERENCES it
-- and it REFERENCES nothing, so no ON DELETE CASCADE edge exists on either side and none of the
-- schema's 53 cascade clauses can fire. Children affected: none.
--
-- This is a LEDGER: rows are inserted, never updated or deleted. The newest row is the active
-- default band; the code-resident seed (worker/lib/estimator/thermal/defaultBand.ts) serves when
-- the table is empty. Deliberately no seed row here: the seed's figures are re-derived at
-- implementation time and an append-only file must not freeze them.
CREATE TABLE thermal_default_band (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  max_u_value       REAL NOT NULL CHECK (max_u_value > 0),
  method            TEXT NOT NULL CHECK (method IN
                      ('observed_report_maximum','abcb_glazing_calculator','manual','unsourced_legacy')),
  source            TEXT NOT NULL,
  derived_at        TEXT NOT NULL,
  observations_json TEXT,                -- {"openings":n,"projects":n} | NULL for cited sources
  set_by            TEXT NOT NULL,       -- staff identity as text; deliberately NOT an FK (AD-T12)
  interim           INTEGER NOT NULL DEFAULT 0 CHECK (interim IN (0,1)),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- **Cascade-affected child tables: none** (new table, zero FK edges — audited by
  `grep -r "REFERENCES thermal_default_band" migrations/` returning nothing, plus the table's own
  DDL containing no `REFERENCES`). No `PRAGMA defer_foreign_keys` needed — nothing structural is
  touched.
- **Rebuild strategy: not applicable and explicitly forbidden here.** TB-16 pins it:
  `opening_requirements`, `opening_instance`, `building_models`, `candidate_result` are not
  dropped, recreated or altered; the four-value `requirement_basis` CHECK (`0016:117`) is intact;
  `PRAGMA foreign_key_check` returns empty (the existing heavy harness already asserts this after
  applying all migrations).
- **Remote apply protocol:** export first
  (`npx wrangler d1 export apertly-db --remote --output backup-<date>-0057.sql`), apply, then
  `SELECT COUNT(*)` spot-checks on `opening_requirements` and `opening_instance` before/after
  (expected delta: zero — nothing touches them). Remote apply remains gated by auto-mode.
- **No other schema change anywhere.** `basisInputs` and the `defaultBand` snapshot ride inside
  the existing `requirement_json` TEXT column; `plan_derived` is already in the 0016 CHECK and in
  `opening_instance.requirement_basis` (an unconstrained column). The zone table stays in code.

## 8. Run counters (slice B) — TB-23, TB-29

`AiExtractionSummary` (pipeline.ts:305, persisted to `ai_runs.summary_json`, customer-safe —
counts only, own project) gains:

```ts
orientationSources: { schedule: number; plan: number; energy_report: number; none: number };
computedBands: { total: number; withShgc: number };            // withShgc: shgcTarget or maxShgc set
basisCounts: { explicit_energy_report: number; plan_derived: number; default_envelope: number };
selectionTiers: Record<"meets"|"within_tolerance"|"misses"|"thermal_unknown"|"does_not_fit", number> | null;
```

- `orientationSources`: pure fold over `model.openings[].wallOrientationSource` after energy
  application (new exported helper `orientationSourceCounts(model)` in pipeline.ts for testability).
- `computedBands` + `basisCounts`: returned by `applyDefaultEnvelope`'s application summary — its
  return type widens from `EnvelopeArchetype | null` to
  `{ archetype, defaultBand, counts } | null` (the existing archetype-snapshot use at :719 keeps
  working through the field).
- `selectionTiers`: `EstimateSummary` (estimate.ts:153) gains `tierCounts`, tallied in the
  selection loop from each opening's winning candidate outcome tier (`result.selected` — the same
  object `persist.ts:187` reads the tier from). Openings with no selected candidate are not in any
  competing tier and are not counted (AD-T9); `selected`/`openings` already expose that gap.
  Null when no estimate ran.

## 9. Security (mandatory section)

**Not "no sensitive surface":** no PII, no money, no auth change — but a cross-account aggregate
and a privileged configuration value, exactly as the spec's §8 assessed.

### 9.1 Data classification

| Data | Class | Surface |
|---|---|---|
| `thermal_default_band` rows | **Commercial — privileged configuration.** Governs the thermal bar of every future estimate; whoever writes it moves the platform's pricing posture globally. | Written only by a privileged DB act (wrangler, gated by auto-mode). Read by the Worker per run and by the staff calibration endpoint. Never on a customer surface. |
| Calibration report | **Commercial — cross-account aggregate.** At 2 distinct projects it approximates one customer's specification set. | Staff-only read; aggregate-only shape (AB-5); `sampleAdequate` labels the thinness honestly. |
| `basisInputs`, `wallOrientationSource`, `roomLabel`, `defaultBand` snapshot | **Commercial — customer project data**, existing class. Stored inside records already scoped to the owning project (`building_models.model_json`, `opening_requirements.requirement_json`). | No new read surface; no cross-project path. |
| Run counters in `summary_json` | **Commercial — per-project counts.** | Customer sees own project's counts via the existing status poll; no values from other accounts can appear (all inputs are single-run). |

Nothing here is logged as a value: the pipeline's existing telemetry rule (§21.1 — never log
filenames, document text or model output) covers the new fields; the design adds no logging of
any band, orientation or room value.

### 9.2 Trust boundaries and what validates at each

- **Customer to Worker (document upload, extraction):** untrusted document text and untrusted
  model output. Validation: the deterministic `validate` clamps — `normalizeOrientation`'s
  eight-point whitelist (never free text, never a guess), `strCap`/`numOrNull` on everything else.
  Document text is content, never instruction (existing skill-prompt rule, with the clamp as the
  actual enforcement). AB-4.
- **Ops to Worker (calibration read):** Cloudflare Access perimeter on ops.*, then `resolveStaff`
  in the route. AB-1/AB-2.
- **Privileged operator to D1 (default-band insert):** outside HTTP entirely this release;
  the wrangler remote-execute gate (auto-mode approval) is the control. AB-3 pins that no HTTP
  alternative exists.
- **Worker to third parties:** none new. Slice B changes the contract of an existing model call;
  no new external call is introduced.

### 9.3 Authorization model per endpoint

| Route | Who may call | Scoping filter |
|---|---|---|
| `GET /api/ops/thermal/calibration` (new, the only new route) | Staff only: `resolveStaff(c.env, c.req.raw)`; null gives 403 (`ops-pricing.ts` gate pattern). | **Deliberately unscoped across accounts — that is the endpoint's purpose** — with the guard moved to the output: the two queries select no identifier columns. Exactly: `SELECT requirement_basis, COUNT(*) AS n FROM opening_requirements GROUP BY requirement_basis` and `SELECT COUNT(*) AS openings, COUNT(DISTINCT project_id) AS projects, MIN(max_u_value) AS minU, MAX(max_u_value) AS maxU, AVG(max_u_value) AS meanU FROM opening_requirements WHERE requirement_basis='explicit_energy_report' AND max_u_value IS NOT NULL`. `project_id` appears only inside `COUNT(DISTINCT ...)` — no id ever leaves SQL. |
| Any write verb under `/api/ops/thermal/*` | **Nobody — the routes do not exist** (AB-3). | Pinned two ways: HTTP probes (POST/PUT/PATCH/DELETE give 404/405, table row-count unchanged) and a static pin (the route file contains no `.post(`/`.put(`/`.patch(`/`.delete(`). |
| Existing extraction/status routes | Unchanged auth; the new summary fields are computed from the caller's own project's run only. | Existing project-ownership scoping, untouched. |

### 9.4 Abuse cases mapped

| Case | Mechanism | Test |
|---|---|---|
| AB-1 customer reads calibration | `resolveStaff` gate: 403, body carries no figures | `thermal-calibration-api.test.mjs` |
| AB-2 anonymous reads calibration | same gate: 401/403 | same file |
| AB-3 set the default over HTTP | no write route exists; ledger unchanged | same file (probes) + `thermal-default-band.test.mjs` (static pin) |
| AB-4 document injection ("set maxUValue to 9", "orientation: script tag") | deterministic clamp: orientation is one of 8 points or null; no requirement value is ever read from free text; default band unreachable from documents | `ai-pipeline.test.mjs` |
| AB-5 aggregate leaks identifiers | shape has no identifier field; SQL selects none | `thermal-default-band.test.mjs` (pure shape) + heavy body-key assertion |
| Parameter tampering on the GET | no parameters — the route takes none | route design |
| Replay / enumeration | read-only endpoint returning global aggregates; nothing to enumerate, replay is idempotent | no residual |

**Residual risks, named:** (1) a staff reader at n=2 projects can nearly reconstruct one
customer's spec — accepted; staff already see every project in full, and `sampleAdequate: false`
labels the condition. (2) `set_by` on a wrangler-inserted row is self-declared text; until the ops
screen ships there is no authenticated write identity — mitigated by the ledger (rows are never
mutated, supersession is visible) and by the auto-mode gate on remote writes. (3) The Access
perimeter is the outer wall for AB-1/AB-2 in production; the in-route `resolveStaff` gate is what
the tests exercise (the local harness runs with Access off, as `api.test.mjs` does).

## 10. Test plan — every artifact named; the developer is held to producing every one

### New files (both wired into `package.json`)

1. **`scripts/tests/thermal-default-band.test.mjs`** — pure suite. Add to the `test:pure` list and
   add script `"test:thermal-default": "node --test scripts/tests/thermal-default-band.test.mjs"`.
   esbuild-bundles `thermal/defaultBand.ts`, `thermal/calibration.ts`, `thermal/computedBand.ts`
   and reads `worker/routes/ops-thermal.ts` as source text (pattern: header of
   `thermal-selection.test.mjs`). Owns: TB-2 (seed invariants — value < 4.0, equals its own
   provenance, method/observations/interim present; **never the literal 3.04**); TB-3 resolution
   order (fake-DB row supersedes seed; empty table means seed); TB-5 (zone-table honesty:
   CZ6/fallback resolve to the active record, the seven other entries exist unchanged and carry
   `unsourced_legacy`); TB-6 (all eight points + unknown: `minShgc` null, coherent); TB-9/TB-10
   (pure calibration math, floor boundary at 4 vs 5 projects, `recommendedValue` null below
   floor); zero-report edge (no NaN, `sampleAdequate` false); TB-11 (fake-DB pin: every SQL
   `readCalibration` prepares begins with SELECT; module exports nothing that writes); AB-3 static
   pin (route file has no write verbs); AB-5 (report shape contains no identifier keys).
2. **`scripts/tests/thermal-calibration-api.test.mjs`** — heavy suite (boots Worker + local D1,
   pattern: `api.test.mjs`). Add to the `test:heavy` list and add script
   `"test:thermal-api": "node --test --test-concurrency=1 scripts/tests/thermal-calibration-api.test.mjs"`.
   Owns: TB-12 (staff session: 200 + TB-9 figures); AB-1 (customer session: 403, no figures in
   body); AB-2 (no session: 401/403); AB-3 (POST/PUT/PATCH/DELETE probes against
   `/api/ops/thermal/calibration` and `/api/ops/thermal/default-band`: 404/405 and
   `thermal_default_band` row count unchanged); TB-3's DB leg (insert a ledger row via
   `wrangler d1 execute`, GET calibration shows the new value/version as active — no deploy, no
   code change); TB-16 (migration 0057 applied by the harness; `sqlite_master` shows the 0016
   CHECK still lists exactly the four bases; `PRAGMA foreign_key_check` empty; re-apply says "No
   migrations to apply").

### Modified files

3. **`scripts/tests/ai-pipeline.test.mjs`** — TB-1 (computed requirement equals the active record;
   persisted `requirement_json` carries version/method/source/derivedAt — via fake-DB statement
   capture on the persist block); TB-4 (statement capture: only INSERTs target
   `opening_requirements`; a band change between two synthetic runs leaves run-1 rows untouched);
   TB-7 (persisted payload keys carry no certification/compliance/NCC/approval claim; basis is one
   of four); TB-8 (star-rating-only report fixture: no `explicit_energy_report`, star rating only
   on `energyAssessment`, openings fall through to the computed band); TB-13/TB-14 (plan-sourced
   orientation gives `plan_derived` + one basisInput; no orientation gives `default_envelope` +
   `[]`); TB-15 (report-carrying opening skipped, band identical); TB-17's unit leg (a
   schedule-only model with orientations yields at least one `plan_derived` requirement row in the
   captured INSERTs); TB-18/TB-19 (schedule `validate` fixtures: "W", "West", "West elevation"
   give W with source schedule; "Rear", "Bed 2", "N/A", "", free text give null);
   `normalizeOrientation` matrix + `applyOrientation` precedence rules; TB-21 (report Uw-only +
   orientation W: persisted band exactly the report's, `maxShgc` null); TB-22 (plan N vs schedule
   W: plan wins + `field:"orientation"` conflict + review flag; + report S: report wins, conflict
   still recorded; all-agree: zero orientation conflicts); TB-23 (`orientationSourceCounts` +
   summary fields incl. `computedBands.withShgc`); TB-24/TB-25 (report room name lands in
   `roomLabel`, plan `roomId` survives, `thermalContextFor` resolves non-null `roomAreaM2` and
   `glazingToRoomFloorRatio`; name-vs-id matching raises no spurious conflict); AB-4
   (injected-instruction schedule and energy fixtures: orientation null/whitelisted, no
   requirement value from injected text).
4. **`scripts/tests/thermal-selection.test.mjs`** — `computeDefaultBand` new signature: cap comes
   from the passed active record (two different records give two different caps, provenance
   echoed); TB-20 band math (W: target 0.35 / maxShgc 0.43; N: target 0.5 / maxShgc null;
   `minShgc` always null).
5. **`scripts/tests/estimator-learning.test.mjs`** — TB-26 pin: `contextKey` splits into exactly
   twelve `|` fields with `riskBand` at index 4 and the documented field order; the recorded
   context object carries all twelve fields including `riskBand`; the pin fails loudly if anyone
   "cleans up" the legacy key outside the mapped retirement.
6. **`scripts/tests/estimator-recommendation.test.mjs`** — TB-28 (two identical openings, basis
   `explicit_energy_report` vs `plan_derived`, same numeric band, same candidates: identical
   tiering, competing set and selection); TB-29 (the tier tally over a fixture selection produces
   the five-key counts and they sum to the selected openings).
7. **`scripts/tests/recommendation-contract.test.mjs`** — TB-27 (source-level pin in the existing
   AC-4 grep style: `ladder.ts`, `select.ts`, `compositeSelect.ts` import neither
   `thermal/defaultBand` nor `thermal/calibration`; `REQUIREMENT_TOLERANCE` remains the only tuned
   selection constant).

### Criterion-to-artifact map (tester's index)

| Criteria | Artifact |
|---|---|
| TB-2, TB-3(unit), TB-5, TB-6, TB-9, TB-10, TB-11, AB-3(static), AB-5(shape) | `thermal-default-band.test.mjs` (new) |
| TB-12, AB-1, AB-2, AB-3(HTTP), TB-3(DB leg), TB-16 | `thermal-calibration-api.test.mjs` (new) |
| TB-1, TB-4, TB-7, TB-8, TB-13, TB-14, TB-15, TB-17, TB-18, TB-19, TB-21, TB-22, TB-23, TB-24, TB-25, AB-4 | `ai-pipeline.test.mjs` (modified) |
| TB-20 (+ the band-math view of TB-5/TB-6) | `thermal-selection.test.mjs` (modified) |
| TB-26 | `estimator-learning.test.mjs` (modified) |
| TB-28, TB-29 | `estimator-recommendation.test.mjs` (modified) |
| TB-27 | `recommendation-contract.test.mjs` (modified) |

TB-17's production leg (a real first `plan_derived` row) is an operational observation after
deploy, not a CI artifact; its unit leg above proves the mechanism. No Playwright anywhere —
owner's fence; the tester must not fail this work for its absence (spec §2).

## 11. File-by-file hand-off index

Discovery is done; the developer reads the files they edit but does not re-search. Line numbers
are as of branch head 243bb08a.

### Created

| Path | What / why |
|---|---|
| `migrations/0057_thermal_default_band.sql` | The ledger table, §7 verbatim. Additive only. |
| `worker/lib/estimator/thermal/defaultBand.ts` | Seed + provenance types + `resolveActiveDefaultBand`; derivation query documented beside the seed (§2.1–2.2). |
| `worker/lib/estimator/thermal/calibration.ts` | `computeCalibration` (pure) + `readCalibration` (SELECT-only) + `CALIBRATION_PROJECT_FLOOR` (§2.6). |
| `worker/lib/ai/orientation.ts` | Compass whitelist, `normalizeOrientation`, `ORIENTATION_PRECEDENCE`, `applyOrientation` (§4.1). |
| `worker/routes/ops-thermal.ts` | One GET, staff-gated, thin over `readCalibration` (§1). |
| `docs/adr/0008-thermal-default-band-provenance-ledger.md` | §14 text. |
| `scripts/tests/thermal-default-band.test.mjs` | §10 artifact 1. |
| `scripts/tests/thermal-calibration-api.test.mjs` | §10 artifact 2. |

### Modified

| Path | Landing point | Change |
|---|---|---|
| `worker/lib/estimator/thermal/computedBand.ts` | `UCAP_BY_ZONE` :29, `uCapForZone` :34, `computeDefaultBand` :57 | Signature `(ctx, activeBand)`; returns `{ band, provenance }`; zone 6 + fallback resolve to `activeBand`; zones 1–5/7/8 restructured to `{ maxUValue, method: "unsourced_legacy" }`; `UCAP_FALLBACK` deleted (the active record IS the fallback). SHGC math (:42-52) untouched. |
| `worker/lib/ai/archetypes.ts` | `defaultOpeningBand` :47/:60, `defaultRequirement` :101, `ARCHETYPE_REGISTRY_VERSION` :20 | Remove `maxUValue` from `defaultOpeningBand` (one place per fact — AD-T7); `defaultRequirement(archetype, activeBand)` for the (dead-in-practice) fallback branch; registry version → "v2". `resolveDefaultEnvelope` logic unchanged. |
| `worker/lib/ai/pipeline.ts` | `applyDefaultEnvelope` :263-301; persist block :697-723; `applyPlanContext` orientation :187; run summary type :305; `runAiExtraction` :688 (call site of applyDefaultEnvelope); conflict-flag pass :645-659 | Slice A: resolve active band once, pass down; basis decision + `basisInputs` + provenance snapshot into `requirement_json`; plan setter → `applyOrientation`. Slice B: schedule orientation into `linesToBuildingModel`/merge (:48-84, :86); orientation-conflict flag pass; counters (§8) incl. `orientationSourceCounts` helper. NOTE: the archetype-snapshot condition at :719 (`tr?.basis === "default_envelope"`) widens to any computed basis (`default_envelope` or `plan_derived`) — the archetype still contributed the climate context and must stay snapshotted. `thermalContextFor` :223-243 NOT touched. |
| `worker/lib/ai/energyMap.ts` | `applyEnergyAuthority` :96-107 (room :98, orientation :99); `contextConflict` :222-231; `contextCompatible` :285, `contextSpecificity` :293; `mapEnergyToOpenings` :340; `PRECEDENCE_POLICY_VERSION` :18 | Slice A: orientation write via `applyOrientation` (conflict return ignored — contextConflict owns report-vs-rest). Slice B: `roomId` write → `roomLabel`; optional `rooms` param; room matching by id OR resolved name; policy v3 with the `orientation` field entry. |
| `worker/lib/ai/schema.ts` | `EnergyRequirementV1` :124; `OpeningV1` :139-183 | `BasisInput` type; `basisInputs?` on the requirement; `wallOrientationSource` (A) and `roomLabel` (B) on OpeningV1. `validateBuildingModelShape` needs no change (additive). |
| `worker/lib/ai/versions.ts` | `PIPELINE_VERSION` :26, `BUILDING_MODEL_SCHEMA_VERSION` :27 | Slice A: pipeline version bump + schema 1.2 (+ changelog comment). Slice B: second bump + schema 1.3. |
| `worker/lib/estimator/skills/schedule.ts` | `ScheduleLineV1` :10-30; `LINE_PROPS` :36; RULES :90; `promptVersion` :~150; `validate` :~160 | Slice B only: `orientation` field, schema enum, one prompt rule, v3→v4, clamp via `normalizeOrientation` (§5). |
| `worker/lib/estimator/skills/energy.ts` | :98-111 | Slice B: inline `ORIENTATIONS`/`strCap(…,3)` → shared `normalizeOrientation`. No prompt change. |
| `worker/lib/estimator/estimate.ts` | `EstimateSummary` :153; selection loop :250-296 | Slice B: `tierCounts` tally from the winning outcome's tier (§8). |
| `worker/routes/ops.ts` | :45/:52 (the `opsPricing` mount pattern) | `import { opsThermal } from "./ops-thermal"; ops.route("/thermal", opsThermal);` |
| `CONTEXT.md` | Estimator section, "Requirement basis" entry :138-139 | §13 text applied verbatim. |
| `package.json` | `test:pure` :17, `test:heavy` :18, scripts block | Two suite registrations + `test:thermal-default`, `test:thermal-api` scripts. |
| `scripts/tests/ai-pipeline.test.mjs`, `thermal-selection.test.mjs`, `estimator-learning.test.mjs`, `estimator-recommendation.test.mjs`, `recommendation-contract.test.mjs` | per §10 | New/updated cases; bundle entry lists gain the new module exports. |

### Deleted

Nothing. (`UCAP_FALLBACK` and the archetype's `maxUValue` literal are removed *within* modified
files; no file is deleted. `riskBand`, `defaultRequirement`, the seven zone entries and the
eight-zone table all stay.)

### Explicitly untouched (regression fence)

`worker/lib/estimator/ladder.ts`, `select.ts`, `compositeSelect.ts`, `rules.ts`
(`effectiveThermalRequirements`/`resolvedRequirement`), `learning.ts` (`contextKey` :17-33,
whitelists :101/:114), `worker/routes/debug.ts` (:127 keeps reading `riskBand`),
`thermal/precedence.ts` (`coerceCoherent` stays the single normalisation),
`migrations/0016_ai_building_model.sql`, all customer-facing routes and `src/` — no UI, no
GST-touching surface anywhere in this feature.

## 12. `ASSUMED:` register (architect-level, on top of spec A1–A10)

| # | Assumption | Reasoning |
|---|---|---|
| AD-T1 | The seed lives in code and the migration inserts **no** seed row | An append-only file would freeze figures the spec requires re-derived at implementation time; empty-table fallback is also what makes TB-2 testable |
| AD-T2 | Band versions are strings: `seed:1`, `row:<id>`, `zone-table:v1` | Monotonic per source, human-legible in snapshots; no second counter to maintain |
| AD-T3 | `basisInputs` and the band snapshot travel inside `EnergyRequirementV1`/`requirement_json`, not new columns or a side table | The requirement is the record of the claim; a side channel would let the two drift, and no query needs to index basis inputs yet — `requirement_basis` remains the queryable column (TB-17) |
| AD-T4 | Orientation source is `OpeningV1.wallOrientationSource`, writable only through `applyOrientation` | Single setter is what makes "plan_derived requires citable evidence" an invariant, not a convention |
| AD-T5 | Schedule-vs-schedule orientation disagreement: keep first + `keep_first_and_flag` conflict | Mirrors the existing dims-merge pattern (pipeline.ts:60-74); never silent, never a guess between equals |
| AD-T6 | Report room matching extended to resolved room *names* (optional `rooms` param) | Without it, fixing the clobber would make plan-id-vs-report-name raise spurious context conflicts the moment plans supply rooms — a regression TB-24 would blame on the fix |
| AD-T7 | The archetype's `defaultOpeningBand.maxUValue` literal is removed; `ARCHETYPE_REGISTRY_VERSION` → v2 | One place per fact; a live-looking 4.0 in code is exactly how this disease started |
| AD-T8 | `recommendedValue` = min(round2(observed max), 4.0), present only when `sampleAdequate` | The same stated rule as the seed (A1) — calibration recommends by the rule it measures against, and it recommends nothing on thin evidence (TB-10) |
| AD-T9 | `selectionTiers` counts openings whose run selected a candidate; unselected openings appear in `openings`−`selected`, not in a tier | An opening with no pick has no competing tier; inventing a bucket would blur TB-29's review-load signal |
| AD-T10 | `CalibrationReport` type stays worker-side (`worker/lib/estimator/thermal/calibration.ts`) | Shared types move to `src/data/` when a second consumer exists; the ops screen that would be one is explicitly out of scope |
| AD-T11 | `PIPELINE_VERSION` bumps in both slices; `BUILDING_MODEL_SCHEMA_VERSION` 1.2 (A) then 1.3 (B) | versions.ts contract: bump whenever a stage's output changes for the same input; both slices change it |
| AD-T12 | `thermal_default_band.set_by` is TEXT with no FK to `user` | Staff identity may be a Cloudflare Access email with no user row; an FK adds a cascade edge to a config ledger for nothing — same frozen-identity pattern as Payout |
| AD-T13 | Report agreeing with a lower source upgrades `wallOrientationSource` to the report | `basisInputs.source` should cite the strongest authority the value rests on; citing the weaker one would understate the evidence |
| AD-T14 | The energy skill's orientation clamp widens to accept longhand ("West") via the shared normaliser | One whitelist, one behaviour; strictly widens accepted *input*, output vocabulary unchanged — and today's `strCap(…,3)` silently destroys "West", which is a bug by any reading |

## 13. `CONTEXT.md` additions (architect owns; developer applies verbatim)

Replace the existing **Requirement basis** entry (Estimator section) with:

> **Requirement basis**:
> Where an opening's thermal requirement came from: an energy report, this project's documents
> (`plan_derived`), the default band alone (`default_envelope`), or a human override.
> **`plan_derived` means "derived from this project's documents"** — any of them: an energy report
> can supply orientation for an opening it states no band for, and the computed band that uses it
> is plan-derived. A plan-derived requirement always names its basis inputs; a default-envelope
> requirement has none, by definition. A computed requirement binds selection exactly as a
> reported one does; only the basis differs, and staff see the basis.

Add, in the Estimator section:

> **Default band**:
> The Uw cap applied when no document evidence constrains an opening. A versioned record with
> provenance, never a bare constant: every requirement it produces snapshots the record's version,
> and changing the record affects future runs only — a past estimate is never re-based.
>
> **Band provenance**:
> What a default band value rests on: the derivation method, its citation, when it was derived,
> and how many observations (openings and distinct projects) support it. A value marked *interim*
> rests on the platform's own thin sample and expects to be superseded by a cited external source.
>
> **Basis input**:
> One recorded document fact that contributed to a computed band — field, value, and the document
> class it came from (schedule, plan, energy report). At least one basis input is what makes a
> band plan-derived; evidence that cannot be cited is not evidence.
>
> **Calibration**:
> The platform's continuous measurement of parsed-report requirements against the active default
> band — counts, spread and gap, staff-read-only. Calibration informs the human who moves the
> default; it never moves the default itself.
>
> **Evidence floor**:
> The minimum breadth below which calibration states no recommendation: five distinct projects.
> Below the floor the report says "thin evidence", never a number dressed as advice.
>
> **Orientation**:
> A wall orientation is one of the eight compass points or unknown — never free text and never a
> guess. When documents disagree, the higher authority wins (energy report over plan over
> schedule) and the disagreement is flagged for review, never resolved silently.

## 14. ADR — `docs/adr/0008-thermal-default-band-provenance-ledger.md`

> # 0008 — The thermal default is a provenance ledger, and evidence makes a band plan-derived
>
> Status: accepted (owner decisions T1–T6 2026-08-20; spec `thermal-model-backend.md` A1–A5)
>
> ## Decision
> The default Uw cap is resolved from a ledger (`thermal_default_band`, newest row active, rows
> never mutated) with a code-resident seed derived by the stated rule `observed_report_maximum`.
> Every requirement it produces snapshots the active record's provenance immutably. Calibration
> measures the corpus against the active record and **never writes it** — moving the value is a
> human act with a recorded source, refused below a five-distinct-project evidence floor.
> `requirement_basis` keeps its four values; `plan_derived` is defined as "derived from this
> project's documents" and is claimed only when at least one recorded basis input contributed.
>
> ## Context
> A `Uw ≤ 4.0` constant chosen by nobody governed 64% of production openings, biased toward
> under-estimation (the −5% side of the 105% target). The unsourced-constant disease is what the
> recommendation redesign had just cured in selection; requirement derivation had the same
> disease. Separately, `opening_requirements.requirement_basis` carries a CHECK on a
> self-referencing cascade parent — adding a fifth basis value means a table rebuild, forbidden
> since a rebuild cascade-deleted production rows.
>
> ## Consequences
> Every computed band is auditable to a citation; changing the default is reversible, versioned,
> and never re-bases a persisted estimate. The ops screen, when it ships, is an additive writer to
> the ledger. Tier-3 (`plan_derived`) becomes countable, so its value can be measured before the
> full plan-derived model is built.
>
> ## Rejected
> - Auto-tuning the default from calibration: recreates the disease from a 2-project sample.
> - A Sanity-published default: the value must join D1 aggregates and be snapshotted per
>   requirement; a CMS hop adds a failure mode and no editor benefit before the screen exists.
> - A fifth basis value (`schedule_derived` or `report_context_derived`): table rebuild on a
>   cascade parent — forbidden; the sharpened `plan_derived` definition carries the meaning.
> - An HTTP write endpoint now: an authorization surface with no screen behind it, bought for
>   nobody (spec A2 / AB-3).

## 15. Sequencing and slice verdict

**The spec's A/B split is validated with one boundary adjustment, already reflected above:**
orientation *source tracking* (the `applyOrientation` seam and `wallOrientationSource` on the plan
and report producers) belongs in **A**, because slice A's `plan_derived` assignment (TB-13) is
impossible without a citable source — spec §5.3 implies this ("evidence the pipeline already
has"); this design states it. Parser/prompt changes remain strictly B.

**Slice A — deployable alone** (TB-1..TB-17, TB-27, TB-28, AB-1..AB-3, AB-5). Build order:
1. `migrations/0057` + red heavy-suite checks (TB-16) — land the migration first so every later
   local run has the table.
2. `thermal/defaultBand.ts` red→green (`thermal-default-band.test.mjs`: TB-2, TB-3 unit).
3. `thermal/computedBand.ts` + `archetypes.ts` rewiring (TB-5, TB-6, TB-20 band math).
4. `ai/orientation.ts` (normaliser + setter) and the A call-site swaps in `applyPlanContext` /
   `applyEnergyAuthority` — behaviour-identical in A, source now recorded.
5. `applyDefaultEnvelope` + persist snapshot + basis decision (TB-1, TB-4, TB-7, TB-13, TB-14,
   TB-15, TB-17 unit) — `PIPELINE_VERSION` bump, schema 1.2.
6. `thermal/calibration.ts` + `ops-thermal.ts` + mount (TB-9..TB-12, AB-1..AB-3, AB-5).
7. Regression pins: TB-26 (may land in A — it pins current behaviour), TB-27, TB-28.
8. `CONTEXT.md` + ADR 0008 + package.json wiring.
Deploy A: full gates, sweep green, remote apply per §7 protocol. Immediately delivers the
defensible cap, the snapshot trail and the measurement loop.

**Slice B — after A** (TB-18..TB-26, TB-29, AB-4). Build order:
1. Red tests: normalisation matrix, AB-4 fixtures, TB-22 precedence, TB-24/TB-25 room fixtures.
2. `schedule.ts` v4 + `energy.ts` normaliser swap.
3. Merge/model wiring (schedule orientation, conflicts, flags).
4. Room identity (`roomLabel`, `rooms` param matching), schema 1.3, `PIPELINE_VERSION` bump.
5. Counters (`orientationSourceCounts`, `applyDefaultEnvelope` counts, `tierCounts`) — TB-23, TB-29.
Deploy B independently. **Operational note:** B's prompt-version bump moves the schedule stage's
idempotency key — each project's next run re-calls the model rather than replaying cache. No bulk
backfill exists or is wanted; cost lands per active project per next upload, and the 38 existing
models are purge-bound test data (assessment Q12).

Both slices are independently deployable in that order; B depends on A's `orientation.ts` and
basis machinery, so the order is fixed, not parallel.

## 16. Rejected alternatives (with the reason)

| Alternative | Rejected because |
|---|---|
| Ship 3.04 as a named constant in `computedBand.ts` (no table, no seed record) | The deliverable is the mechanism, not the number (spec §5.1) — a better-chosen constant is the same disease; and TB-3 requires supersession without a deploy |
| Seed row inserted by migration 0057 | Freezes implementation-day figures into an append-only file; makes TB-2's fallback path untestable in production shape (AD-T1) |
| Store the default in Sanity alongside the catalogue | Wrong side of the trust boundary: it must join D1 aggregates (calibration), snapshot into D1 rows, and be settable by a privileged DB act — a CMS hop adds latency and a failure mode with no editor before the ops screen exists |
| Auto-write the default from calibration when `sampleAdequate` | Spec A4 forbids it; the guard is architectural (calibration module owns no write), not procedural |
| A fifth `requirement_basis` value | CHECK change on a self-referencing cascade parent = table rebuild = forbidden (house rule, TB-16); A5's sharpened `plan_derived` carries the meaning |
| `basisInputs` as a new D1 column or side table | Nothing queries it yet; `requirement_basis` stays the indexed queryable fact; a JSON field inside the requirement it describes cannot drift from it (AD-T3) |
| Delete `riskBand` (assessment recommendation #4) | Its premise expired: `learning.ts:23` and `debug.ts:127` read it, and D12/AC-27 require the twelve recorded context fields unchanged. Pinned instead (TB-26); retirement rides with the legacy-key retirement on the wayfinder map |
| Fix orientation by rasterising plan PDFs | Infrastructure effort (Browser Rendering), out of scope by owner fence; mapped on T6's wayfinder. Schedule extraction unlocks the 64% cohort without it |
| Let the plan path keep `??=` for orientation | Once schedules supply orientation first, `??=` silently inverts A6's plan-over-schedule precedence — the exact class of silent-resolution bug the conflict machinery exists to prevent |
| Compare report room labels only against `roomId` after the clobber fix | Would start raising spurious context conflicts the day plans supply rooms (id ≠ name), discrediting the fix (AD-T6) |
| Put the calibration route on the general `ops.ts` router | A dedicated 30-line file makes AB-3's absence-of-write-path a testable property of one file rather than a search over a 1,000-line router |
| A `thermal_unknown`-style bucket in `selectionTiers` for unselected openings | Blurs TB-29's signal; `openings − selected` already carries that count (AD-T9) |

## 17. Decisions needed

**EMPTY.** The owner asked to be guided, not asked. Every judgement call made here is tagged in
§12 (AD-T1..AD-T14) on top of the spec's A1–A10, all vetoable at acceptance.
