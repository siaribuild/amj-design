# Thermal model — the per-opening calculation

**Stage:** pipeline stage 1 (product-manager spec) · **Date:** 2026-08-20 · **Revision 3**
**Stage-0 input:** `docs/specs/thermal-model-assessment.md` — a **paused** grill. Its §3 decisions
**T1–T6 are binding**; its §2 production measurements are treated as facts. It has no
"actors and needs" section (the grill stopped before one), so §3 carries the actors from the most
recent grill that produced one — `docs/specs/recommendation-model-grill-conclusions.md` §2,
**verbatim** — extended only with what the owner has stated himself.
**Must not contradict:** `docs/specs/recommendation-model.md` and its decisions **D1–D18**, shipped
2026-08-20. **Adjacent thread:** `docs/drawing-split-recognition-design.md` owns document
extraction; §12 is the agreed boundary.

**Owner corrections, 2026-08-20.** Three, in the order they arrived:

1. *"Do not implement pdf parsing with this feature — it is part of smarter scanning that was
   started a week or so ago. At minimum, the approaches need to be aligned."* → **document
   extraction is out**; §12 hands it over with an agreed interface.
2. *"I do not suggest using Uw values from those 2 documents… I'm not suggesting that 4.0 is correct
   number, but filtering out most of the catalogue by default is not a smart idea."* → **no derived
   cap. Revision 1's `ASSUMED: A1` is WITHDRAWN.**
3. *"Feature does not shrink, functionality does not change! I can make business decision to enable
   more products, or to adjust default Uw value — I can't implement the whole modelling algorithm,
   which is what this task is about."* → **the calculation is the task.**

**The separation correction 3 forces, and the spine of this spec:**

| | owned by | this spec's job |
|---|---|---|
| **Business knobs** — which glazing options are published, what the default Uw value is | **the owner**, changeable at will | make the Uw default a **settable value with recorded provenance** instead of a constant buried in code, and show him the consequences of turning it *before* he turns it. **No criterion here asserts a particular value.** |
| **The modelling algorithm** — how a per-opening requirement is derived from the inputs that exist | **engineering** | build it. It barely exists today: 444 of 444 openings get one identical constant. |

**Decision gate:** the owner has stated he does not want thermal decisions put to him — *"I don't
know much about thermal modelling — do not expect decision making here, I'd rather be guided
instead."* Every point that would have been a question is decided here and tagged `ASSUMED:` for
veto at acceptance. The **"Decisions needed" list returned with this spec is empty.**

**Fence:** **backend and calculations only. No UI, no Playwright, no AI-skill schema or
`promptVersion` change.**

---

## 1. Problem statement

**There is no model. There is a constant.**

`applyDefaultEnvelope` gives every opening without an energy report the same band: `Uw ≤ 4.0`,
SHGC null. Measured in production: **444 of 444** such openings, identical, across 38 building
models and every room, orientation, size and aspect in them. `computeDefaultBand` accepts an
element type and ignores it. `shgcForOrientation` — the one function that would make two openings
differ — **has never executed on a real job**, because orientation only ever arrives alongside a
report and a report suppresses the computed band. `plan_derived`, the tier that would record a band
informed by the customer's own documents, is declared in four type definitions and **assigned
nowhere**.

So the platform cannot answer the three questions that matter: *did anything about this opening
inform its requirement?*, *how would we know if it did?*, and *what happens when better inputs
arrive?* Nothing in the data distinguishes a requirement derived from evidence from one derived
from nothing, because today they are the same requirement.

**Why it matters commercially (T1).** The owner's stated purpose for thermal modelling is choosing
the right product so the *price* is right. A requirement that is the same for a west-facing 4 m²
sliding door and a south-facing 0.6 m² awning cannot select between products for either of them.
Where it is too loose the estimate lands low and review revises it up — the −5% side of the
"accurate at 105%" target, the side the owner says is outside the success margin.

**What the catalogue means for expectations, not for scope.** Measured in live Sanity, 2026-08-20:
**58 of 306** authored `thermalProfile` rows are published; **49 of 58 (84%)** meet `Uw ≤ 4.0`; 28
meet ≤ 3.04; 16 meet ≤ 2.5; 9 meet ≤ 1.9. AMJ83 carries twelve rows from 3.2 to 4.1 and publishes
only the 4.1. **This is deliberate** — the owner has disabled many records while awaiting a
definitive product list from AMJ, judges many glazing options poor, and intends a few glazing
options per product in the short term.

Two things follow, and neither of them is "build less":

- At roughly **2.8 published glazing options per product**, a sharper requirement will not change
  which product is chosen very often *yet*. It will change **which openings are flagged as needing
  better than we currently sell** — which is exactly what a reviewer needs, and it is what the
  shipped ladder already does with the closest candidate (D4 / AC-9). The algorithm's precision
  becomes visible in product choice when the catalogue widens; it is useful before then.
- The default value is **the owner's dial, not a number to derive**. Which is precisely why the
  calibration view must show what the published catalogue can deliver at each candidate cap: so the
  dial has consequences he can see before he turns it.

---

## 2. Scope

### In scope

1. **The calculation.** One per-opening band derived from a **declared input contract**, producing
   Uw and SHGC (T2), varying with the inputs that exist, and honest where they do not.
2. **Input provenance and graceful degradation.** Every band records which inputs it actually had,
   with their sources, which rules fired, and what was missing.
3. **Genuine tiering.** Report overrides document-derived overrides default envelope, with
   `plan_derived` assigned when — and only when — a document-derived input contributed.
4. **The owner's dial:** the default Uw value as a settable record with recorded provenance,
   changeable without a deploy, snapshotted immutably into every requirement it produces.
5. **Calibration across three axes** (staff-readable, backend): what parsed reports have demanded,
   what the default asserts, and **what the published catalogue can deliver at each candidate cap**.
6. **Run-level counters** that make the model's reach — and the extraction thread's arrival —
   measurable.

### Out of scope — the tester must not fail this work for their absence

- **Any UI**, including an ops screen for the dial, and including Playwright.
- **Document extraction — deferred to the drawing/scanning thread** (§12): schedule/plan orientation
  extraction, north-point detection, the `energyMap.ts:98` room-identity defect,
  `normalizeOpeningRef` as the single join primitive, and anything touching an AI skill's schema or
  `promptVersion`. This spec **consumes** those inputs through an agreed contract; it does not
  produce them.
- **Choosing the default Uw value.** Engineering ships the dial and the consequences view; the
  number is the owner's.
- **Climate-zone resolution** and **any postcode capture** (T4, T5). The eight-zone table is kept
  (owner decision) and stays inert.
- **Turning a NatHERS star rating into a per-window band — forbidden categorically (T3).**
- **Re-basing existing rows.** The 444 openings are test data the owner will purge (Q12).
- **Any change to the selection ladder** — tiers, tolerance, comparator, learned layer, candidate
  outcome contract.
- **`riskBand` deletion** — descoped with reasoning, §5.5.
- **Changing what is published in Sanity.** The narrow catalogue is the owner's position; this
  feature measures it and never edits it.
- **Unimplemented rules.** §6.3 declares where shading and glazing-ratio inputs will attach; no
  rule ships as code until its input does (`ASSUMED: A15`).

---

## 3. Actors and needs

Carried **verbatim** from `recommendation-model-grill-conclusions.md` §2.

> **Customer** (existing actor — *anyone with an account, private or business*).
> Uploads plans and window schedules, optionally an energy report. Needs the platform to
> **pre-select products that accurately meet their requirements** — this is a core value
> proposition, not a convenience. Does not and cannot evaluate aluminium platforms, frame
> depths or glass make-ups; will not audit the machine's reasoning. Receives the
> recommendation as *their quote*, and needs the price to still be right after human review.
>
> **Staff** (existing actor — *an ops-console operator working for AMJ*).
> Reviews every quote before it is issued; the estimator exists to **spare them work, not to
> decide**. Needs: the requirement and where it came from, whether it was met and by how much
> if not, why this product rather than the runner-up, and the losing candidates ranked with
> reasons — so they can consult the customer and change the pick without friction. Per the
> ops2 spec these needs are binding, not aspirational (AC-1 to AC-5).

**Extension, evidenced only by T1, T2 and the owner's own corrections:**

> **Owner / the business.** States the purpose of thermal modelling plainly: *"help choose the
> correct product so the price is estimated correctly"* (T1) and *"Uw and SHGC targets are all the
> estimator needs"* (T2). Draws the line between his decisions and engineering's himself: *"I can
> make business decision to enable more products, or to adjust default Uw value — I can't implement
> the whole modelling algorithm."* Is actively managing what the catalogue offers while awaiting
> AMJ's definitive product list. Needs to be **guided** on thermal questions rather than asked to
> decide them, and explicitly does **not** need compliance claims.

No demographics, no backstory, no invented needs.

---

## 4. What must not change

- **The authority chain.** `applyDefaultEnvelope` skips any opening that already carries an
  effective requirement; `effectiveThermalRequirements` treats an explicit report as overriding.
- **A computed band never sets `minShgc`** — so it can never form an impossible interval and can
  never demand "at least this much" solar gain.
- **The four requirement bases are the whole set.** The `CHECK` on
  `opening_requirements.requirement_basis` (`migrations/0016_ai_building_model.sql:117`) sits on a
  self-referencing `ON DELETE CASCADE` table — a fifth value means a **table rebuild**, forbidden.
- **The selection ladder is untouched.** `REQUIREMENT_TOLERANCE = 0.05` remains the only tuned
  constant *in selection* (D10, AC-4).
- **The learned layer's recorded context is untouched** (D12, AC-27).
- **No AI skill schema, prompt or `promptVersion` is modified.**
- **The human-edit guard.** A requirement a human edited is never overwritten by a re-run.

---

## 5. The mechanisms

### 5.1 The calculation

One pure function, one home. It already has the right shape and the wrong body: `computeDefaultBand`
(`worker/lib/estimator/thermal/computedBand.ts`) is deliberately primitive so that **both** the
estimator and the AI pipeline can call it without a cross-layer type dependency. That property is
kept; what changes is that it takes a **declared input record** rather than two loose fields, and
emits a band **plus the derivation** — which inputs it had, which rules fired, what was missing.

Composition, not a formula: the band is assembled from independently-recorded **rule
contributions**, each of which fires only when its input is present.

| rule | fires when | contributes | value provenance |
|---|---|---|---|
| `zone_u_cap` | always | `maxUValue` | the **settable default record** (§5.2) — the owner's dial |
| `orientation_shgc` | a resolved orientation is present | `shgcTarget`, `maxShgc` | the existing southern-hemisphere mapping, now **versioned and labelled `unsourced_legacy`** (`ASSUMED: A14`) |

The existing mapping is retained exactly: N ⇒ target 0.5, no cap; E/W ⇒ target 0.35, cap 0.43;
NE/NW/SE/SW ⇒ target 0.4, cap 0.5; S ⇒ target 0.4, no cap. It is not re-derived here — inventing new
solar constants is the disease this repo has just finished curing — but it stops being anonymous:
it carries a version and an honest `unsourced_legacy` label, so a sourced replacement is a recorded
supersession rather than an argument.

**Per-opening variation comes from inputs, never from invented modifiers.** Where two openings have
identical inputs their bands are identical *and the record says why*. That is not the defect; the
defect is that today they are identical because nothing is consulted at all.

**Declared but not built** (`ASSUMED: A15`): `shading_relief` (needs `shadingProjectionMm`) and
`glazing_ratio_tightening` (needs `glazingToRoomFloorRatio`). §6.3 states where they attach so the
extraction thread knows what its inputs feed; **no code ships for a rule whose input does not
exist.**

### 5.2 The owner's dial — a settable default with provenance

The default Uw is a versioned record, not a constant:

| field | meaning |
|---|---|
| `version` | monotonic id, stamped onto every requirement produced from it |
| `maxUValue` | **the owner's value.** Seeded at today's 4.0 so behaviour does not change on deploy |
| `method` | `unsourced_legacy` \| `abcb_glazing_calculator` \| `manual` |
| `source` | the citation. For the seed: an explicit statement that no citable source exists |
| `derivedAt`, `setBy`, `interim` | when, by whom, and whether anything citable stands behind it |

`observed_report_maximum` — revision 1's derivation rule — is **not** an available method. The owner
withdrew it; leaving it in the enum would invite its quiet return.

**Resolution:** the most recent active row in a new `thermal_default_band` D1 table, else the
code-resident seed. A **new** table is safe under the migration rules (no rebuild, no cascade
parent); highest existing migration is `0056`, and the `d1-migration-safety` skill loads before
anything in `migrations/` is authored.

**"Settable without a UI"** means a row can be inserted without a code deploy (a privileged DB
write) and the next run reads it. **No HTTP write endpoint ships this release** — a write surface
with no screen behind it is an authorization surface bought for nobody (`ASSUMED: A2`).

**No test and no criterion asserts what the value should be.** Tests read the active record. The
only value any criterion pins is the seed's equality with today's 4.0, which exists so that
deploying this feature changes no estimate.

The **eight-zone table stays** (owner). Zone 6 / the fallback is served by the active record; the
other seven keep their values and are labelled `unsourced_legacy`. Behaviour change: none.

**No silent re-basing.** Every requirement snapshots the provenance version; changing the record
affects future runs only.

### 5.3 Tiering, and `plan_derived` becoming real

The authority order the owner described, made true in the data:

1. `explicit_energy_report` — a report stated a band for this opening. The calculation does not run.
2. `plan_derived` — the band was computed **and at least one document-derived input contributed**.
3. `default_envelope` — the band was computed from the envelope default alone; nothing about this
   opening informed it.
4. `human_override` — untouched; a human-edited requirement is never recomputed.

`plan_derived` means *"derived from this project's documents"*, not *"from a floor plan
specifically"* (`ASSUMED: A5`). A fifth basis value would need a CHECK change on a cascade parent —
forbidden. The architect should carry this sharpened definition into `CONTEXT.md`'s **Requirement
basis** entry.

**It is assignable today**, without waiting for the extraction thread: an energy report can supply
an orientation for an opening it states *no band* for, and that orientation is a document-derived
input (`ASSUMED: A16`). The mechanism is therefore complete and correct on delivery; its **volume**
is bounded by what extraction supplies, and TB-11/TB-8 make that volume a number instead of an
assumption. When the drawing thread starts delivering plan orientation, the count rises with no code
change here — which is the point of building it against a contract rather than against a document
format.

**Degrading honestly.** Where a rule's input is absent the rule does not fire, the band records the
input as missing, and the basis falls to `default_envelope`. Nothing is imputed, defaulted to a
plausible-looking value, or inferred from an adjacent opening.

### 5.4 Calibration — three axes, one view

A pure computation, staff-readable, putting the three things that bear on the dial in one place.
`opening_requirements` stores `requirement_basis` and `max_u_value` as real columns, so axes 1–2 are
a plain aggregate; axis 3 reads the published catalogue the platform already loads.

- **Axis 1 — what reports have demanded.** Counts by basis; for report rows the min / max / mean
  `max_u_value` and the number of **distinct projects** behind them; `sampleAdequate`, true only at
  **≥ 5 distinct projects** (`ASSUMED: A3`).
- **Axis 2 — what the default asserts.** The active record's value, version, method and provenance.
- **Axis 3 — what the published catalogue can deliver.** Per candidate cap: **published** rows
  meeting it out of published total; **products with at least one published row** meeting it out of
  products total; and **authored-but-unpublished** rows that would meet it, reported separately
  because the publishing state is a deliberate owner position, not a gap (`ASSUMED: A13`).
- **The change-cost statement.** For any candidate cap other than the active one, the delta against
  today in rows and, more importantly, **products that would stop being able to meet the default**.
  That is the sentence that must exist before anyone turns the dial: *"4.0 → 3.04 takes deliverable
  published rows from 49 to 28."*

**Candidate caps** = the active default ∪ the distinct zone-table values ∪ the observed report min /
mean / max, deduplicated and sorted — derived, not a hand-picked list of new magic numbers
(`ASSUMED: A12`).

Exposed on the existing staff-authenticated ops router (`resolveStaff`, Cloudflare Access perimeter,
the pattern `worker/routes/ops-pricing.ts` uses) as a **read-only** endpoint. **It never writes the
default** — auto-tuning would re-create the disease this spec cures, and the owner's correction 2 is
the proof that an automatic tightening would have been wrong.

### 5.5 `riskBand` — a divergence from the assessment, retained

**The assessment recommends deleting `riskBand` because its only consumer was deleted. That fact
expired within a day.** Two live readers remain: `worker/lib/estimator/learning.ts:23`, which folds
it into the legacy twelve-field `contextKey` written to the indexed `NOT NULL context_key` column,
and `worker/routes/debug.ts:127`. **D12 and its shipped criterion AC-27 require all twelve recorded
context fields to keep being written unchanged.** Deleting it would contradict a decision the owner
settled 24 hours ago, for a cleanup benefit.

`ASSUMED: A8` — **not deleted**, and pinned by a regression criterion. Retirement belongs with the
legacy twelve-field key: one coherent change, on the map.

The measured cause of its always-null inputs — `energyMap.ts:98` writing an energy report's room
**name** into `roomId`, a field meant to hold an id from `model.rooms`, overwriting any plan-derived
id — is a real defect, and it is **handed to the drawing thread** (§12), which owns room identity.

---

## 6. The input contract

This is the boundary between this feature and the drawing/scanning thread, and it is the reason
neither has to wait for the other.

### 6.1 The shape

Every document-derived input is a **`{ value, source }` pair or null** — never a bare value. A value
without a source cannot be represented, so provenance cannot be forgotten.

```ts
type InputSource = "energy_report" | "plan" | "schedule" | "envelope_default" | "human";
type Sourced<T> = { value: T; source: InputSource } | null;

interface ThermalModelInputs {
  // Envelope — always present (from the resolved archetype)
  climateZone: number;

  // Opening identity and geometry — present today, from the schedule
  elementType: "window" | "door" | null;
  isCompositeChild: boolean;
  widthMm: number | null;
  heightMm: number | null;
  areaM2: number | null;

  // Document-derived — partially available today, the extraction thread's deliverables
  orientation: Sourced<"N"|"NE"|"E"|"SE"|"S"|"SW"|"W"|"NW">;
  roomAreaM2: Sourced<number>;
  glazingToRoomFloorRatio: Sourced<number>;
  shadingProjectionMm: Sourced<number>;
  zoneType: Sourced<string>;

  // The customer's own instruction — present today, from the schedule
  glazingInstruction: Sourced<{ doubleGlazed: boolean | null; note: string | null }>;
}
```

**Availability today, stated honestly so nobody over-promises:**

| input | today | after the drawing thread |
|---|---|---|
| `climateZone` | always (CZ6) | unchanged until T4 comes off the backlog |
| `elementType`, dimensions, `areaM2` | always, from the schedule | unchanged |
| `orientation` | **only** from an energy report, and only for openings the report gave no band to | from plans, deterministically, at volume |
| `roomAreaM2`, `glazingToRoomFloorRatio` | never (0 of 38 models carry rooms) | from plans |
| `shadingProjectionMm` | never (0 of 38) | from plans |
| `zoneType` | from an energy report constraint | from plans |
| `glazingInstruction` | always, from the schedule | unchanged |

### 6.2 The output

```ts
interface ComputedBandResult {
  band: { maxUValue: number|null; minShgc: null; maxShgc: number|null; shgcTarget: number|null };
  basis: "plan_derived" | "default_envelope";
  inputsUsed: { field: string; value: unknown; source: InputSource }[];
  inputsMissing: string[];
  rulesApplied: { ruleId: string; version: string; provenance: string }[];
  defaultBandVersion: string;
}
```

`inputsUsed` is what makes `plan_derived` verifiable rather than asserted; `inputsMissing` is what
makes a band that rests on nothing legible to a reviewer and countable by the calibration.

### 6.3 Extension points — declared, not built

`shading_relief` attaches to `shadingProjectionMm`; `glazing_ratio_tightening` attaches to
`glazingToRoomFloorRatio`. Both are named here so the extraction thread knows what its inputs feed
and so nobody invents a second attachment point. **Neither ships as code in this release**
(`ASSUMED: A15`) — a rule with no input is speculative generality, and the repo has enough
extracted-but-unread fields already (`northRotationDeg`, `conditionedFloorAreaM2`,
`shading.verticalFeature`, `layoutCode` — all populated and read by nothing).

---

## 7. Acceptance criteria

Given–When–Then, numbered, each independently verifiable. **Trace** names the owner decision
(T1–T6), the owner correction, or the measured defect it exists for. Suite hint, not design:
`scripts/tests/thermal-selection.test.mjs` owns thermal unit behaviour, `ai-pipeline.test.mjs` owns
pipeline behaviour; both bundle TS with esbuild (pattern in `estimator-rules.test.mjs`'s header).

### 7.1 The calculation

**TB-1 — two openings with different inputs get different bands.** *(correction 3; §2 "444 of 444")*
**Given** two openings in one project with no report requirement, one with a resolved orientation of
`W` and one with `N`,
**When** requirements are computed,
**Then** their bands differ: the `W` opening carries `shgcTarget 0.35` and `maxShgc 0.43`, the `N`
opening `shgcTarget 0.5` and `maxShgc` null.

**TB-2 — the SHGC path is reachable.** *(T2; §2.2 "has never fired in production")*
**Given** an opening carrying **no effective thermal requirement** and a resolved orientation from
any source,
**When** its requirement is computed,
**Then** the band carries a non-null `shgcTarget`, the `orientation_shgc` rule appears in
`rulesApplied` with its version, and `orientation` appears in `inputsUsed` with its source.

**TB-3 — no orientation, no SHGC, and it says so.** *(negative; honest degradation)*
**Given** an opening with no orientation from any source,
**When** its requirement is computed,
**Then** `shgcTarget` and `maxShgc` are null, `orientation_shgc` does not appear in `rulesApplied`,
and `orientation` appears in `inputsMissing`. No SHGC value is imputed, inherited from another
opening, or defaulted.

**TB-4 — a composite child is banded from its own inputs.** *(assessment WS6 scaffold (c))*
**Given** a parent opening with two lite children whose resolved orientations differ,
**When** requirements are computed,
**Then** each child carries its own band computed from its own inputs, and neither is a copy of the
parent's.

**TB-5 — one calculation, one home.** *(house rule: one place per fact)*
**Given** the same `ThermalModelInputs`,
**When** the band is computed from the AI pipeline path and from the estimator path,
**Then** both produce an identical `ComputedBandResult`, and exactly one module in the codebase
computes a thermal band.

**TB-6 — the input contract refuses an unsourced value.** *(§6.1)*
**Given** a document-derived input supplied without a source,
**When** the inputs are assembled,
**Then** it is not representable — the value is rejected or the code does not compile — and no band
records an input whose source is unknown.

### 7.2 Legibility and measurement

**TB-7 — every band records its derivation.** *(correction 3 item 4)*
**Given** any computed requirement,
**When** it is persisted and read back,
**Then** it carries `inputsUsed` (each with a source), `inputsMissing`, `rulesApplied` (each with a
version) and `defaultBandVersion`.

**TB-8 — a band resting on nothing declares it.** *(T1; reviewer need)*
**Given** an opening with no document-derived input of any kind,
**When** its requirement is read,
**Then** `inputsUsed` contains no document-derived entry, `basis` is `default_envelope`, and the
persisted record is distinguishable — by field, not by inference — from a band that used a real
orientation.

**TB-9 — the model's reach is a number.** *(the defect was invisible for months)*
**Given** a completed extraction run,
**When** its summary is read,
**Then** it records the count of openings by basis, and the count of computed bands that carried an
SHGC constraint — so the arrival of the extraction thread's orientation shows up as a rising number
without anyone querying the database by hand.

### 7.3 Tiering and basis

**TB-10 — a report still overrides everything.** *(assessment §1; authority chain)*
**Given** an opening carrying an effective requirement from an energy report,
**When** requirements are computed,
**Then** the calculation does not run for it, its basis stays `explicit_energy_report`, and its band
is identical to what the report produced.

**TB-11 — evidence makes it plan-derived.** *(§2.2 "plan_derived: 0")*
**Given** an opening with no effective report requirement whose orientation came from a project
document (a plan, a schedule, or an energy report that stated no band for it),
**When** its requirement is computed,
**Then** `requirement_basis` is `plan_derived` and `inputsUsed` contains the orientation with that
source — and a query grouping `opening_requirements` by basis returns a non-zero `plan_derived`
count for the first time in the platform's history.

**TB-12 — no evidence, no claim.** *(negative)*
**Given** an opening with no document-derived input,
**When** its requirement is computed,
**Then** `requirement_basis` is `default_envelope`; `plan_derived` is never recorded for it under
any code path.

**TB-13 — a human's edit is never recomputed.** *(existing human-edit guard)*
**Given** an opening whose requirement fields a human has edited,
**When** the extraction re-runs,
**Then** the human's values survive unchanged and the computed band does not overwrite them.

**TB-14 — no fifth basis, no table rebuild.** *(house rule; `migrations/0016:117`)*
**Given** the migration this feature adds,
**When** it is applied,
**Then** it creates a new table only; `opening_requirements`, `opening_instance`, `building_models`
and `candidate_result` are not dropped, recreated or altered; the `requirement_basis` CHECK still
lists exactly the four existing values; and every pre-existing foreign-key link is intact.

### 7.4 The owner's dial

**TB-15 — every band carries the dial's provenance.** *(correction 3; T1)*
**Given** any computed requirement,
**When** it is read,
**Then** `maxUValue` equals the **active default record's** value and the requirement records that
record's `version`, `method`, `source` and `derivedAt`.

**TB-16 — the seed changes no estimate, and tells the truth.** *(correction 2)*
**Given** no override row exists in `thermal_default_band`,
**When** the default is resolved,
**Then** the seed is used; its `maxUValue` equals **today's value, 4.0**, so deploying this feature
moves no estimate; `method` is `unsourced_legacy`; `source` states in words that no citable source
stands behind it; `observations` is null; `interim` is true.

**TB-17 — the owner can turn the dial without a deploy.** *(correction 3: his knob)*
**Given** a row inserted into `thermal_default_band` with a value, a `source`, a `setBy` and
`method: 'abcb_glazing_calculator'` or `'manual'`,
**When** the next extraction run computes requirements,
**Then** they are produced at the new value and snapshot the new record's provenance, with no code
change and no deploy.

**TB-18 — no criterion or test asserts a business value.** *(correction 2; negative)*
**Given** the test suites for this feature,
**When** they are inspected,
**Then** no assertion fixes what the default Uw *ought* to be; every test reads the active record,
and the only literal is the seed-equals-today's-value check in TB-16.

**TB-19 — nothing derives the dial automatically.** *(correction 2; negative)*
**Given** any volume of parsed reports, at any statistics,
**When** runs and calibration reads execute,
**Then** no code path sets, adjusts or recommends-and-applies a default Uw from
`opening_requirements`, from parsed reports, or from any statistic.

**TB-20 — a past estimate is never re-based.** *(T1; Q12 principle)*
**Given** requirements produced under default-band version *v1*,
**When** a record *v2* becomes active and further runs execute,
**Then** the *v1* rows are unchanged and only later requirements carry *v2*.

**TB-21 — the zone table is kept and honestly labelled.** *(T4; owner decision)*
**Given** the eight-zone `UCAP_BY_ZONE` table,
**When** a band is computed for the only zone production resolves (CZ6),
**Then** the cap comes from the active default record, not the table literal; the other seven
entries still exist with their current values, labelled `unsourced_legacy`; and no production path
resolves a zone other than 6.

### 7.5 Calibration

**TB-22 — axes 1 and 2: demand versus assertion.** *(T1)*
**Given** `opening_requirements` containing rows on `explicit_energy_report`,
**When** the calibration is computed,
**Then** it reports counts by basis, the min / max / mean `max_u_value` of report rows, the number of
**distinct projects** behind them, and the active default's value, version, method and provenance.

**TB-23 — axis 3: what the catalogue can deliver.** *(correction 2)*
**Given** a catalogue in which 58 of 306 authored `thermalProfile` rows are published,
**When** the calibration is computed,
**Then** for each candidate cap it reports published rows meeting it out of published total,
**products with at least one published row** meeting it out of products total, and
authored-but-unpublished rows meeting it — and at a cap of 4.0 the published figure is 49 of 58.

**TB-24 — the dial states its cost before it is turned.** *(correction 2; the whole point of axis 3)*
**Given** an active default of 4.0 and a candidate cap of 3.04,
**When** the calibration is computed,
**Then** the result states the delta for that candidate in published rows **and in products that
would no longer have any published row meeting the default**.

**TB-25 — the candidate caps are derived, not hand-picked.** *(no new magic numbers)*
**Given** the active default, the zone table and the parsed report rows,
**When** the candidate list is built,
**Then** it is exactly their union (active ∪ distinct zone values ∪ report min/mean/max),
deduplicated and sorted, and no other literal cap appears in the calibration code.

**TB-26 — thin evidence is reported as thin.** *(§2: 2 distinct projects)*
**Given** report rows spanning fewer than 5 distinct projects,
**When** the calibration is computed,
**Then** `sampleAdequate` is false and no recommended value is stated; **Given** five or more,
**Then** `sampleAdequate` is true. In neither case is a cap recommended that axis 3 shows would
reduce deliverable products.

**TB-27 — calibration never writes.** *(negative)*
**Given** any calibration result,
**When** it is computed any number of times,
**Then** the active record is unchanged and no row is written to `thermal_default_band` by any
automatic process.

**TB-28 — staff can read it.** *(Staff need)*
**Given** an authenticated staff session,
**When** the calibration endpoint is requested,
**Then** it responds 200 with the TB-22, TB-23 and TB-24 figures.

### 7.6 Invariants — the negatives that keep the model honest

**TB-29 — a computed band never demands solar gain.** *(existing design invariant)*
**Given** any input combination, including every compass point and none,
**When** a band is computed,
**Then** `minShgc` is null and the band is coherent — `minShgc > maxShgc` is unreachable.

**TB-30 — a computed band is never a compliance claim.** *(T1)*
**Given** any persisted computed requirement,
**When** it is read,
**Then** `requirement_basis` is non-null and one of the four; no field asserts certification, NCC
compliance or approval; and lines gated by it continue to degrade to `commercial_only_estimate`
exactly as today.

**TB-31 — a NatHERS star rating never becomes a per-window band.** *(T3)*
**Given** an energy report carrying a NatHERS star rating and no per-opening Uw or SHGC constraints,
**When** it is applied,
**Then** no opening receives `explicit_energy_report`; the rating appears only on the building
model's `energyAssessment`; the openings fall through to the calculation; and no code path converts
a star rating into `maxUValue`, `minShgc`, `maxShgc` or `shgcTarget`.

**TB-32 — a computed constraint is never added on top of a report band.** *(T1)*
**Given** an opening whose effective requirement came from a report stating a Uw cap and **no** SHGC
bounds, and whose orientation is known,
**When** the run completes,
**Then** the persisted requirement carries the report's band exactly, `maxShgc` null — the
calculation contributes nothing to an opening a report has already answered.

**TB-33 — no AI skill is touched.** *(correction 1)*
**Given** the diff for this feature,
**When** it is inspected,
**Then** no file under `worker/lib/estimator/skills/` is modified, no `promptVersion` is bumped, and
no extraction schema gains or loses a field.

### 7.7 Non-regression

**TB-34 — the recorded context and `riskBand` are unchanged.** *(D12 / AC-27 pin)*
**Given** an opening whose context is recorded,
**When** `context_json` and the legacy `context_key` are read,
**Then** all twelve context fields are present including `riskBand`, and the legacy key's field
order and arity are exactly as before.

**TB-35 — no new tuned constant enters selection.** *(D10 / AC-4)*
**Given** the codebase after this change,
**When** the ladder and its comparator are inspected,
**Then** `REQUIREMENT_TOLERANCE = 0.05` is still the only tuned constant in selection; the dial, the
zone table, the SHGC mapping and the calibration's project floor appear only in requirement
derivation and calibration, each carrying provenance, and none is read by the comparator.

**TB-36 — a computed requirement binds exactly like a reported one.** *(D4 / AC-10)*
**Given** two identical openings, one `explicit_energy_report` and one `plan_derived`, with the same
numeric band and the same candidates,
**When** both are selected,
**Then** tiering, competing set and selection are identical and only the basis differs.

**TB-37 — the effect of turning the dial is observable.** *(T1)*
**Given** a completed run,
**When** its summary is read,
**Then** it records the count of openings by competing tier (`meets` / `within_tolerance` / `misses`
/ `thermal_unknown` / `does_not_fit`), so a change to the default shows up as a shift in review load
rather than being discovered through it.

---

## 8. Edge cases

- **GST inc/ex** — untouched. Thermal is upstream of price *display*; the house rule still binds
  every customer surface.
- **Quote lifecycle** — a persisted requirement is never rewritten (TB-20); a dial change alters
  future runs only.
- **Offerability gating** — unchanged and deliberately not merged with thermal. Axis 3 **reads**
  published state and never changes what is offerable; a product absent because it is unpublished is
  reported as unpublished, never as unable.
- **A product with no published thermal row** — counted once in the products denominator, never in a
  numerator; it must not vanish from either.
- **An orientation that is not one of the eight points** — cannot enter: the contract's type admits
  only the eight, so a producer's junk value is rejected at the boundary, not laundered into a band.
- **An opening with a report band that coerces to nothing** (an incoherent pair dropped by
  `coerceCoherent`) — has no *effective* requirement, so the calculation runs for it and the basis is
  computed, not `explicit_energy_report`. Stated explicitly because "has a requirement row" and "has
  an effective band" are different questions.
- **Composite parents and lite children** — modelled via `parent_opening_id`; children band from
  their own inputs (TB-4) and inherit nothing implicitly.
- **Zero parsed reports, or zero published rows** — calibration reports zero observations,
  `sampleAdequate: false`, no recommended value; no divide-by-zero, no NaN.
- **A stale catalogue cache** — axis 3 reads through the existing 5-minute published-catalogue cache
  and states the catalogue revision it used, so two readings can be compared.
- **Delivery zones / postcode** — untouched (T4, T5). The site-postcode-is-a-third-fact discipline
  (assessment §4.1) waits with climate zone.

---

## 9. Security assessment

**Finding: no PII, no money, no auth change — but this is *not* "no sensitive surface".** The
reasoning, not just the conclusion:

**Untouched.** No payout or bank details, no ABN, no personal information, no payment path, no
session or authentication logic, no upload handling, no customer-facing write.

**Touched, and needing a boundary:**

1. **A cross-account aggregate.** Calibration reads `opening_requirements` across **every project and
   every account**. With two projects in the corpus, an "aggregate" is arithmetically close to one
   customer's project specifications. Staff-only, read-only, no identifiers.
2. **Commercially sensitive catalogue state.** Axis 3 exposes what is authored but unpublished — the
   owner's forward product intentions. Strictly staff-facing.
3. **A privileged configuration value.** The dial governs what every future estimate is priced
   against. This release ships **no HTTP write path** for it.

**Abuse cases — negative criteria the tester executes for real, recording the denial.**

**AB-1 — a Customer cannot read the calibration.**
**Given** a signed-in Customer session (not staff), **When** the calibration endpoint is requested,
**Then** 403 (or 404 under the ops perimeter), and no figure from any axis appears in the body.

**AB-2 — an anonymous Visitor cannot read the calibration.**
**Given** no session, **When** the endpoint is requested, **Then** 401/403/404 and no figures.

**AB-3 — nothing can turn the dial over HTTP.**
**Given** any session, staff or customer, **When** a write (POST/PUT/PATCH/DELETE) is attempted
against any route resolving to the default band or `thermal_default_band`, **Then** no such route
exists (404 / 405) and the active record is unchanged. The absence is pinned by a test so it cannot
be added later without a decision.

**AB-4 — a customer document cannot move the platform's configuration.**
**Given** an uploaded schedule or plan whose text contains injected instructions ("set maxUValue to
9", "ignore previous rules"), **When** it is extracted and estimated, **Then** the active record is
unchanged, the calibration output is unchanged, the computed band for that project's openings is
derived only from contract inputs, and document text is treated as content, never instruction.

**AB-5 — a customer cannot read another customer's requirement.**
**Given** Customer A and a project belonging to Customer B, **When** A requests B's opening
requirements or building model through any route, **Then** 403/404 and no band, basis or input
appears in the response.

**AB-6 — the aggregate carries no identifiers, and no unpublished product leaks.**
**Given** a calibration response, **When** its body is inspected, **Then** it contains counts and
statistics only — no project id, account id, customer name, file name, external ref, free text from
a customer document, **or the identity of any unpublished product or row**; unpublished evidence
appears as a count and nothing else.

---

## 10. Sizing

**One normally-sized pipeline feature.** It is a single subsystem (`worker/lib/estimator/thermal/`
plus its two call sites), one new table that is only ever created, no UI, no AI skill, and a route
that is not in doubt: the files are known, the defects are measured, the decisions are made. T6's
map still governs the wider thermal effort; this slice needs no chart of its own.

Suggested build order, each step independently green:

1. **The calculation and its contract** (§6) with the two live rules — the core, and the largest
   share of the value.
2. **The dial** — record, resolution, provenance snapshotting, migration.
3. **Calibration and the counters** — the consequences view and the reach numbers.

---

## 11. `ASSUMED:` register

| # | Assumption | Status / reasoning |
|---|---|---|
| ~~A1~~ | ~~Derive an interim cap of 3.04 from parsed reports~~ | **WITHDRAWN by the owner.** It would have taken published deliverable rows from 49/58 to 28/58 — *"filtering out most of the catalogue by default is not a smart idea"*. The rule is absent from the method enum so it cannot return quietly, and TB-18 forbids any test asserting a business value |
| A2 | No HTTP **write** endpoint for the dial this release; setting it is a privileged DB write until the ops screen exists | A write surface with no screen behind it is an authorization surface bought for nobody |
| A3 | Calibration's evidence floor is **5 distinct projects** | Two projects is a coincidence; below the floor it states no recommended value rather than dressing thin evidence as advice |
| A4 | Calibration **never** writes the dial | Correction 2 is the proof: an automatic tightening would have been exactly wrong |
| A5 | `plan_derived` means "derived from this project's documents" | A fifth basis value needs a CHECK change on a cascade parent — a table rebuild, forbidden |
| ~~A6~~ | ~~Orientation precedence report > plan > schedule~~ | **Moved to the extraction thread.** The contract carries **one resolved orientation with its source**; resolving between competing producers is the producer's job (§12) |
| A7 | The calculation contributes nothing to an opening a report has already answered | Now a live criterion (TB-32), not a principle: with the calculation built, it could otherwise add a cap the report never asked for and exclude a product the report allows |
| A8 | **`riskBand` is not deleted** | Its "no consumers" premise expired: `learning.ts:23` and `debug.ts:127` read it, and D12/AC-27 require the twelve recorded fields unchanged |
| A9 | The seven non-CZ6 zone entries are kept, labelled `unsourced_legacy` | Owner keeps the table; labelling stops anyone mistaking those figures for derived ones |
| ~~A10~~ | ~~The room-identity fix is in scope~~ | **Deferred to the extraction thread**, which owns room identity and `normalizeOpeningRef` |
| A11 | The seed records `method: unsourced_legacy`, `observations: null`, and a `source` saying in words that no citable source exists | The instrument's first act is to admit the number in force was chosen by nobody. Anything else launders a guess as a derivation |
| A12 | Candidate caps = active ∪ distinct zone values ∪ report min/mean/max | Derived, so the calibration introduces no new magic numbers of its own |
| A13 | Axis 3 counts **published** rows for deliverability and reports authored-but-unpublished separately | The publishing state is deliberate strategy while awaiting AMJ's list; conflating them would overstate what can be sold or misread strategy as a gap |
| **A14** | The orientation→SHGC mapping is **retained exactly**, versioned, labelled `unsourced_legacy`, code-resident and **not** DB-settable this release | Re-deriving solar constants would invent physics this pipeline has no source for; labelling makes a sourced replacement a recorded supersession. It is eight values, not one number — the owner's stated dial is the Uw default, and a DB-settable eight-value mapping with no screen is a data-entry hazard |
| **A15** | `shading_relief` and `glazing_ratio_tightening` are **declared in the contract and ship as no code** | A rule with no input is speculative generality; this repo already carries `northRotationDeg`, `conditionedFloorAreaM2`, `shading.verticalFeature` and `layoutCode` — all extracted, persisted and read by nothing |
| **A16** | An orientation supplied by an energy report **for an opening that report gave no band to** counts as a document-derived input, so that opening is `plan_derived` | It is evidence from the customer's own documents about that specific opening. This is what makes the tier real on delivery instead of dormant until the extraction thread lands |

---

## 12. The boundary with the drawing/scanning thread

`docs/drawing-split-recognition-design.md` (branches `feat/drawing-extraction`,
`feat/drawing-recognition`) **produces** inputs; this feature **consumes** them. Alignment is the
interface in §6, not a pause.

**That thread owns, and nothing below may be built here:**

| item | what it inherits from this spec |
|---|---|
| Schedule and plan **orientation extraction**, north-point detection | The contract: one resolved orientation as `{ value, source }`, one of the eight compass points or null — never guessed, never truncated to a plausible prefix, never free text (it reaches an indexed cross-account key) |
| **Precedence between orientation sources** | Resolution happens at the producer. The calculation takes the resolved value and records its source; it does not arbitrate. The conflict machinery already exists at `energyMap.ts:222-231` and has never fired because the schedule never supplied a value |
| **Room identity** and `normalizeOpeningRef` as the single join primitive | A defect that thread does not currently name: `energyMap.ts:98` writes an energy report's room **name** into `roomId`, a field meant to hold an id from `model.rooms`, and overwrites a plan-derived id unconditionally. This is why 12 of 38 models show an opening "linked to a room" while 0 of 38 carry a rooms array, and why `roomAreaM2` and `glazingToRoomFloorRatio` are permanently null |
| **Room area, glazing ratio, shading projection** | Their attachment points are declared (§6.3) and unbuilt. When the inputs arrive, the rules are added here — no rework of the contract |
| Any change to an **AI skill schema or `promptVersion`** | Off-limits to this feature entirely (TB-33) |

**What that thread gets for free when it lands:** orientation flows into an existing contract, the
`orientation_shgc` rule fires without modification, `plan_derived` volume rises on its own, and
TB-9's counters make the improvement visible the day it ships.

**Still on the wayfinder map (T6):** climate-zone resolution and the site postcode; wall and ceiling
construction parsing; retiring `riskBand` with the legacy twelve-field context key; revisiting the
default when AMJ's definitive product list arrives.

---

## 13. Decisions vs open questions

**Decided** (binding, not re-opened): T1–T6; D1–D18 and the shipped ladder; the fence (backend only,
no UI, no Playwright, no AI-skill change); the eight-zone table is kept; the 444 rows are test data;
**the default Uw value is the owner's business decision, not engineering's**; document extraction
belongs to the drawing thread.

**Open questions — none for the owner.** The one commercial question this work raises —
*"what should the default be?"* — is explicitly his dial, and this spec's job is to make turning it
cheap, sourced and consequence-visible rather than to answer it. He has said he does not want
thermal decisions put to him, and nothing here requires one.

**Decisions needed: EMPTY.**
