# Thermal model — backend remediation

**Stage:** pipeline stage 1 (product-manager spec) · **Date:** 2026-08-20
**Stage-0 input:** `docs/specs/thermal-model-assessment.md` — a **paused** grill. Its §3 decisions
**T1–T6 are binding**; its §2 production measurements are treated as facts. That document has no
"actors and needs" section (the grill stopped before one), so §3 below carries the actors from the
most recent grill that produced one — `docs/specs/recommendation-model-grill-conclusions.md` §2,
**verbatim** — and extends them only with what T1/T2 state in the owner's own words.
**Must not contradict:** `docs/specs/recommendation-model.md` and its grill decisions **D1–D18**,
shipped 2026-08-20. Where this spec touches the same ground it says so explicitly.

**Decision gate:** the owner has stated he does not want thermal decisions put to him — *"I don't
know much about thermal modelling — do not expect decision making here, I'd rather be guided
instead."* Every point that would have been a question is decided here and tagged `ASSUMED:` so it
can be vetoed at acceptance. The **"Decisions needed" list returned with this spec is empty.**

**Fence (owner, this session):** **backend and calculations only. No UI design, no UI
implementation, no Playwright.**

---

## 1. Problem statement

The thermal architecture is sound; what sits underneath it is thin, and biased in the direction
that costs money.

**1. The number that governs 64% of openings was chosen by nobody.** 444 of 699 production
openings run on a default `Uw ≤ 4.0` that appears in code with no source, no ADR and no owner
decision. Every real energy report the platform has parsed demanded between **1.69 and 3.04**
(mean 1.90) — less than half as loose. Per **T1** the purpose of thermal modelling is choosing the
right product so the *price* is right: a loose cap recommends cheaper glass than the job needs, the
estimate lands **low**, and human review revises it **up** — the −5% side of the platform's
"accurate at 105%" target, the side the owner has said is outside the success margin. The evidence
against it is thin (255 rows, but only **2 distinct projects**) and that thinness is recorded here
rather than hidden.

**2. Tier 3 has never existed.** `plan_derived` is declared in four type definitions and assigned
nowhere. A band informed by the customer's own plans records identically to a blind one, so the
tier cannot be measured, cannot be improved, and cannot be told apart from a guess by anybody —
staff included.

**3. The orientation→SHGC path has never executed on a real job.** Verified in production: of 38
building models, the count carrying wall orientation **without** an energy report is **zero**.
Orientation only ever arrives alongside a report, and a reported requirement correctly suppresses
the computed band, so `shgcForOrientation` is unreachable on the path it was written for. 0 of 444
default rows carry an SHGC target.

**4. A computed room model is discarded, and the discard has a cause nobody had traced.**
`pipeline.ts:223-243` derives room area, glazing-to-floor ratio and shading and rolls them into a
`riskBand`. In production those inputs are **always null** — 0 of 38 models carry a rooms array,
while 12 of 38 carry an opening "linked to a room". §5.5 diagnoses why, and reaches a different
conclusion from the assessment's recommendation.

The through-line: **every one of these is a measurement problem before it is a physics problem.**
The platform cannot answer "is the default right?", "did the plans contribute?", or "did the
orientation logic fire?" — so this spec ships the mechanisms that make those questions answerable
with data, and moves the default by a defensible rule rather than by a better guess.

---

## 2. Scope

### In scope

1. **A default thermal band with recorded provenance** — what it was derived from, when, from how
   many observations, by whom — resolved from an ops-settable record with a code-resident seed,
   and snapshotted immutably into every requirement it produces.
2. **Continuous calibration**: the platform measures parsed-report requirements against the active
   default and exposes the gap as data (staff-only read). It never changes the default by itself.
3. **`plan_derived` becomes a real basis**, assigned only when project-document evidence actually
   contributed to the band, with the contributing inputs recorded.
4. **Reaching the orientation→SHGC path** by fixing the supply of orientation — parsing/pipeline
   work, backend, in scope.
5. **The room-identity defect** that makes the room model unreachable (§5.5).
6. **Run-level counters** that make all of the above verifiable in production without a UI.

### Out of scope — the tester must not fail this work for their absence

- **Any UI of any kind**, including an ops screen for the default band, and including Playwright
  coverage. This spec stops at the data and the API contract.
- **Climate-zone resolution** and **any postcode capture** (T4, T5). The eight-zone table is
  **kept** (owner decision) and stays inert; the venture starts in Melbourne and the VIC CZ6
  archetype is correct for the actual business.
- **Wall/ceiling/floor construction parsing** and the **full plan-derived model** (rooms, glazing
  ratios and shading feeding the band itself). This spec makes those facts *true and recorded*; it
  does not make the band depend on them.
- **Turning a NatHERS star rating into a per-window band — forbidden categorically (T3).**
- **PDF rasterisation / Browser Rendering** for plan sets (see §5.4 — it is the deeper cause of the
  orientation drought and it is an infrastructure effort, not this one).
- **Re-basing or migrating existing rows.** The 444 default-envelope openings are test data the
  owner will purge (assessment Q12).
- **Any change to the selection ladder** shipped yesterday — tiers, tolerance, comparator, learned
  layer, candidate outcome contract. This spec changes *what the requirement says*, never *how a
  candidate is judged against it*.
- **`riskBand` deletion** — descoped with reasoning, §5.5.

---

## 3. Actors and needs

Carried **verbatim** from `recommendation-model-grill-conclusions.md` §2 (the most recent grill to
produce an actors section; this feature serves the same two actors through the same engine).

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

**Extension, evidenced by T1 and T2 only.** The owner is the third party served here, in his
capacity as the business rather than as a user of a screen:

> **Owner / the business.** States the purpose of thermal modelling plainly: *"help choose the
> correct product so the price is estimated correctly"* (T1) and *"Uw and SHGC targets are all the
> estimator needs"* (T2). Needs the platform's assumptions to be **defensible by citation rather
> than by assumption**, and needs to be **guided** on thermal questions rather than asked to decide
> them. Explicitly does **not** need compliance claims: the platform is working toward an accurate
> modelling suite, it is not certifying anything.

No demographics, no backstory, no invented needs. Anything else this feature might serve is a
question for the owner, not a persona.

---

## 4. What must not change

Stated once, so no criterion below has to restate it, and so the tester can pin regressions.

- **The authority chain is correct and stays as it is.** `applyDefaultEnvelope` skips any opening
  that already carries a requirement; `effectiveThermalRequirements` treats an explicit report as
  overriding. Nothing in this spec loosens either.
- **A computed band never sets `minShgc`** — by design, so it can never form an impossible interval
  and can never demand "at least this much" solar gain.
- **The four requirement bases are the whole set.** `opening_requirements.requirement_basis` carries
  a `CHECK` constraint (`migrations/0016_ai_building_model.sql:117`) and the table is
  self-referencing with `ON DELETE CASCADE` — adding a fifth value would require a **table rebuild**,
  which this repo forbids for exactly the reason that once cost production rows. No new basis value.
- **The selection ladder is untouched.** `REQUIREMENT_TOLERANCE = 0.05` remains the only tuned
  constant *in selection* (D10, AC-4). The values this spec introduces live in requirement
  derivation, carry provenance, and never enter the comparator.
- **The learned layer's recorded context is untouched** (D12, AC-27).

---

## 5. The mechanisms

### 5.1 The default band, and its provenance

**The deliverable is the mechanism, not the number.** A constant chosen by nobody is the disease
the recommendation redesign just finished curing; shipping a second one — even a better one —
would be the same mistake with a nicer value.

**The record.** The active default band is a versioned record carrying:

| field | meaning |
|---|---|
| `version` | monotonic id stamped onto every requirement produced from it |
| `maxUValue` | the cap itself |
| `method` | `observed_report_maximum` \| `abcb_glazing_calculator` \| `manual` \| `unsourced_legacy` |
| `source` | the citation — a document, a calculator run, a person |
| `derivedAt` | when |
| `observations` | `{ openings, projects }` — null for an externally cited source |
| `setBy` | `system_seed` or the staff identity that set it |
| `interim` | true while the value rests on the platform's own thin sample |

**Resolution order:** the most recent active row in a new `thermal_default_band` D1 table, else the
code-resident seed. Creating a **new** table is safe under the migration rules (no rebuild, no
cascade parent); highest existing migration is `0056`, and the `d1-migration-safety` skill is loaded
before anything in `migrations/` is authored.

**"Ops-settable, without a UI"** means precisely this: a new row can be inserted without a code
deploy (a privileged DB write), and the resolution path reads it on the next run. **No HTTP write
endpoint ships in this release** — a write surface with no screen behind it is an authorization
surface bought for nobody. It ships with the ops screen, later. `ASSUMED:`

**The interim value, and how it is derived.** `ASSUMED:` — derived by a stated rule from the only
Melbourne evidence that exists, then recorded with that rule:

> **Rule `observed_report_maximum`:** the interim default equals the **loosest `max_u_value` any
> parsed energy report has ever demanded**, rounded to two decimals, and may never exceed the
> outgoing 4.0.

At the 2026-08-20 measurement that is **3.04** (255 openings, 2 distinct projects). Reasoning, in
full, because the owner asked to be guided rather than asked:

- It is a **bound with a stateable meaning** — *"no energy report this platform has parsed has ever
  permitted a window looser than this"* — unlike a mean, which would claim a typicality that two
  projects cannot support.
- It errs toward the **+5% side** of the 105% target (T1's commercial argument) without asserting
  that every job is a 7-star new build. The platform also quotes renovations and replacements where
  NCC 2022 does not bite; a cap set at the 1.90 mean would force high-spec double glazing onto all
  of them.
- It is **deliberately modest in product terms**: 4.0 already excludes single glazing (5.8+), and
  3.04 still admits ordinary double glazing while excluding the loosest units. The first move is
  small on purpose; the *measurement* is what makes the next move evidence-led rather than another
  argument.
- It is **superseded on arrival** by an ABCB Glazing Calculator run for a typical Melbourne
  detached dwelling (owner or energy consultant), entered as a new record with
  `method: abcb_glazing_calculator` and the citation.

The derivation query is documented alongside the seed and is re-runnable, so the developer
re-derives at implementation time and records the figures **as measured then** — the tests pin the
invariants (value equals its own provenance, value < 4.0, method and observations present), never
the magic number.

**The eight-zone table stays** (owner). Zone 6 / the fallback is served by the active record; the
other seven entries keep their current values and are marked `unsourced_legacy` in provenance, so
that nobody later mistakes them for derived figures. Behaviour change: none —
`resolveDefaultEnvelope` yields CZ6 for every job today.

**No silent re-basing.** Each produced requirement snapshots the provenance version. Changing the
active record affects future runs only; no persisted requirement is rewritten. (The 444 existing
rows are test data due for purge — but the principle governs real quotes issued later.)

### 5.2 Calibration — making the number answerable

A pure computation over `opening_requirements` (which stores `requirement_basis` and `max_u_value`
as real columns, so this is a plain aggregate) producing:

- counts by basis;
- for `explicit_energy_report` rows: min / max / mean `max_u_value`, and the number of **distinct
  projects** behind them;
- the active default's value and version;
- the signed gap between the active default and both the observed maximum and the observed mean;
- `sampleAdequate` — true only at **≥ 5 distinct projects** (`ASSUMED:` — two projects is a
  coincidence, five is a pattern; below the floor the report states no recommended value at all
  rather than dressing thin evidence as a recommendation).

Exposed on the existing staff-authenticated ops router (`resolveStaff`, Cloudflare Access
perimeter, the pattern `worker/routes/ops-pricing.ts` already uses) as a **read-only** endpoint.
**It never writes the default.** Auto-tuning a constant from two projects would re-create the exact
disease this spec exists to cure; moving the value stays a human act with a recorded source.

### 5.3 `plan_derived` becomes a real basis

Assigned when — and only when — **project-document evidence contributed to the computed band**.
Today that means the opening's wall orientation; later it will mean room geometry, shading and the
site's climate zone.

- basis `plan_derived` ⇒ at least one entry in a recorded `basisInputs` list, each
  `{ field, value, source }` where source is the document class the value came from.
- basis `default_envelope` ⇒ `basisInputs: []` — the band is the archetype constant alone.
- basis `explicit_energy_report` ⇒ untouched; the opening never reaches this code.

**Naming, decided rather than left ambiguous.** `plan_derived` means *"derived from this project's
documents"*, not *"derived from a floor plan specifically"*. An energy report can supply orientation
for an opening it states no band for; that opening's computed band is evidence-derived and records
`plan_derived` with `source: energy_report` in its inputs. `ASSUMED:` — the alternative (a fifth
basis value) would require a table rebuild on a cascade parent, which is forbidden. The architect
should carry this sharpened definition into `CONTEXT.md`'s **Requirement basis** entry.

### 5.4 Reaching the orientation→SHGC path — the honest diagnosis

The brief asked whether the plan skill fails to deliver orientation or whether orientation is
delivered and discarded. **Measured answer: neither, exactly — orientation has only two possible
producers, and one is structurally starved while the other always suppresses the consumer.**

- `wallOrientation` is written in exactly two places: `pipeline.ts:187` (plan context) and
  `energyMap.ts:99` (energy report). **The schedule extractor has no orientation field at all** —
  `ScheduleLineV1` does not carry one, so the most commonly uploaded document cannot contribute.
- The plan path is starved at ingest: for a PDF, `imageDataUrl` is never populated and
  `ingest.ts:369` records `pdf_visual_rendering_unavailable` — the Worker has neither Browser
  Rendering nor a canvas. The plan-context skill therefore sees a **text layer only**, and a floor
  plan's north point and wall geometry are vector graphics, not text. It can read room labels; it
  essentially cannot read orientation.
- The report path always arrives with a requirement, which correctly suppresses the computed band.

So the fix is **supply**, not the consumer, and rasterisation is out of scope. In scope:

**Extract orientation from the window schedule.** Schedules routinely carry an orientation or
elevation column ("W", "West", "West elevation"). Add an optional orientation to the schedule
extraction, **whitelisted to the eight compass points** exactly as `learning.ts` whitelists them —
anything else becomes null, never a guess and never free text (this is also the abuse-case guard;
see §8). Orientation carries a **recorded source**, and precedence follows the existing ladder:
**energy report (100) > plan (a geometric source) > schedule (a transcription)**. A disagreement
between two sources raises the conflict/review machinery that already exists at
`energyMap.ts:222-231` and has never fired because the schedule never supplied a value. `ASSUMED:`
plan-over-schedule ordering; a plan is where orientation is actually determined, a schedule column
is someone's transcription of it, and disagreements are flagged rather than silently resolved.

**What this unlocks:** a schedule-only job — the 64% cohort on `default_envelope` — can now produce
an orientation-aware band, so `shgcForOrientation` executes for the first time, and those openings
also become `plan_derived` (§5.3) and measurable.

**What it must not do:** a computed SHGC cap is never added on top of an explicit report band, even
when the report states no SHGC bounds. Per T1 a computed value is not authoritative; a computed cap
over an authoritative document could exclude a product the report allows. Negative criterion TB-21.

### 5.5 The room model, `riskBand`, and a divergence from the assessment

**The divergence, stated up front:** the assessment recommends deleting `riskBand`, on the basis
that its only consumer (`contextAffinity`) was deleted. **That fact expired within a day.**
`riskBand` has two live readers today: `worker/lib/estimator/learning.ts:23`, which folds it into
the legacy twelve-field `contextKey` written to the indexed `NOT NULL context_key` column, and
`worker/routes/debug.ts:127`. **D12 and its shipped criterion AC-27 require all twelve recorded
context fields to keep being written unchanged.** Deleting `riskBand` would contradict a decision
the owner settled 24 hours ago, for a cleanup benefit.

`ASSUMED:` — **`riskBand` is not deleted in this release.** It keeps being computed and recorded
exactly as today, pinned by a regression criterion. Its retirement belongs with the retirement of
the legacy twelve-field key, which is a single coherent change on the wayfinder map rather than a
half-move here.

**But the real defect underneath it is in scope, and it is a genuine bug.** The measurement "12 of
38 models have an opening linked to a room, 0 of 38 have a rooms array" has a cause:
`energyMap.ts:98` does `if (authority.room) opening.roomId = authority.room` — it writes an energy
report's room **name** into the field that is supposed to hold a **room id from `model.rooms`**, and
it overwrites a plan-derived id unconditionally. Consequences:

- `thermalContextFor`'s lookup `model.rooms.find(r => r.roomId === opening.roomId)` can never match,
  so `roomAreaM2` and `glazingToRoomFloorRatio` are permanently null;
- a plan-derived room id, on the rare occasion one exists, is destroyed by the report;
- the recorded context contains a field that looks populated and means something else.

Fix: the report's room label is recorded in its own field; `roomId` refers to a room in
`model.rooms` or is null. This makes the recorded facts true, which is what tier 3 will need when
the full plan-derived model is built — and it costs `riskBand` nothing.

---

## 6. Acceptance criteria

Every criterion is a Given–When–Then, independently verifiable, and maps onto a test the developer
writes and the tester walks. **Trace** names the owner decision (T1–T6) or the measured defect from
assessment §2 it exists for. Suite ownership as a hint, not a design:
`scripts/tests/thermal-selection.test.mjs` owns thermal unit behaviour, `ai-pipeline.test.mjs` owns
pipeline behaviour; both bundle TS with esbuild (pattern in the header of `estimator-rules.test.mjs`).

### 6.1 The default band and its provenance

**TB-1 — every computed band carries its provenance.** *(T1, §2.1)*
**Given** a project whose openings carry no energy-report requirement,
**When** the default envelope is applied,
**Then** every resulting requirement's `maxUValue` equals the **active default band record's**
value, and the persisted requirement records that record's `version`, `method`, `source` and
`derivedAt`.

**TB-2 — the seed states what it was derived from.** *(T1, §2.1)*
**Given** no override row exists in `thermal_default_band`,
**When** the default band is resolved,
**Then** the code-resident seed is used; its provenance reports `method: 'observed_report_maximum'`,
a non-null `source` and `derivedAt`, `observations: { openings, projects }` with both counts
non-null, `interim: true`; and its `maxUValue` is **strictly less than 4.0** and equal to the value
recorded inside its own provenance.

**TB-3 — an ops-set value supersedes the seed, without a deploy.** *(T1)*
**Given** a row is inserted into `thermal_default_band` with a value, a `source`, a `setBy` and
`method: 'abcb_glazing_calculator'`,
**When** the next extraction run applies the default envelope,
**Then** requirements are produced at the new value and snapshot the new record's provenance,
and no code change was required to reach that state.

**TB-4 — a past estimate is never re-based.** *(T1, assessment §4 Q12 principle)*
**Given** persisted `opening_requirements` rows produced under default-band version *v1*,
**When** a new record *v2* becomes active and further runs execute,
**Then** the *v1* rows are unchanged, and only requirements written after the change carry *v2*.

**TB-5 — the zone table is kept and honestly labelled.** *(T4, owner decision to keep the table)*
**Given** the eight-zone `UCAP_BY_ZONE` table,
**When** a band is computed for the only zone production ever resolves (CZ6),
**Then** the cap comes from the active default band record, not from the table literal; the other
seven entries still exist with their current values and are marked `unsourced_legacy`; and no
production code path resolves a zone other than 6.

**TB-6 — a computed band never demands solar gain.** *(negative; existing design invariant)*
**Given** any orientation, including every one of the eight compass points and unknown,
**When** a default band is computed,
**Then** `minShgc` is null, and the band is coherent (`minShgc > maxShgc` is unreachable).

**TB-7 — a computed band is never a compliance claim.** *(T1; negative)*
**Given** any persisted requirement produced by the default envelope,
**When** it is read from `opening_requirements`,
**Then** its `requirement_basis` is non-null and is one of the four bases; the payload contains no
field asserting certification, NCC compliance or approval; and lines gated by it continue to
degrade to `commercial_only_estimate` exactly as today.

**TB-8 — a NatHERS star rating never becomes a per-window band.** *(T3; negative)*
**Given** an energy report carrying a NatHERS star rating and **no** per-opening Uw or SHGC
constraints,
**When** the report is applied,
**Then** no opening receives `explicit_energy_report`; the star rating appears only on the building
model's `energyAssessment`; the openings fall through to the computed default band; and no code
path anywhere converts a star rating into `maxUValue`, `minShgc`, `maxShgc` or `shgcTarget`.

### 6.2 Calibration

**TB-9 — the gap is a number.** *(T1, §2.1)*
**Given** `opening_requirements` containing rows on `explicit_energy_report` across two or more
distinct projects,
**When** the calibration is computed,
**Then** it reports counts by basis, the min / max / mean `max_u_value` of the report rows, the
count of **distinct projects** behind them, the active default's value and version, and the signed
gap between the active default and both the observed maximum and the observed mean.

**TB-10 — thin evidence is reported as thin.** *(T1, §2 "2 distinct projects")*
**Given** report rows spanning **fewer than 5** distinct projects,
**When** the calibration is computed,
**Then** `sampleAdequate` is false and the result states **no** recommended value; **Given** five or
more distinct projects, **Then** `sampleAdequate` is true.

**TB-11 — calibration never moves the default.** *(T1; negative)*
**Given** a calibration result whose observed maximum differs from the active default,
**When** any number of extraction runs and calibration reads execute,
**Then** the active default band record is unchanged and no row is written to
`thermal_default_band` by any automatic process.

**TB-12 — staff can read it.** *(Staff need: "the requirement and where it came from")*
**Given** an authenticated staff session,
**When** the calibration endpoint is requested,
**Then** it responds 200 with the TB-9 figures.

### 6.3 `plan_derived` becomes real

**TB-13 — evidence makes it plan-derived.** *(§2.2)*
**Given** an opening with no report requirement whose `wallOrientation` came from this project's
documents,
**When** the default envelope is applied,
**Then** `requirement_basis` is `plan_derived`, and the requirement records `basisInputs` containing
`{ field: 'orientation', value: <compass point>, source: 'schedule' | 'plan' | 'energy_report' }`.

**TB-14 — no evidence, no claim.** *(§2.2; negative)*
**Given** an opening with no report requirement and no orientation from any document,
**When** the default envelope is applied,
**Then** `requirement_basis` is `default_envelope`, `basisInputs` is `[]`, and `plan_derived` is not
recorded anywhere for that opening.

**TB-15 — the authority chain is unchanged.** *(assessment §1)*
**Given** an opening carrying a requirement from an energy report,
**When** the default envelope is applied,
**Then** the opening is skipped, its basis stays `explicit_energy_report`, and its band is identical
to what the report produced.

**TB-16 — no fifth basis, no table rebuild.** *(house rule; `migrations/0016:117`)*
**Given** the migration this feature adds,
**When** it is applied,
**Then** it creates a new table only; `opening_requirements`, `opening_instance`,
`building_models` and `candidate_result` are not dropped, recreated or altered; the
`requirement_basis` CHECK still lists exactly the four existing values; and every pre-existing
foreign-key link is intact after the migration.

**TB-17 — tier 3 becomes countable.** *(§2, "plan_derived: 0")*
**Given** a run over a schedule-only project whose schedule states orientations,
**When** the run completes,
**Then** at least one persisted `opening_requirements` row has `requirement_basis = 'plan_derived'`
— the first in the platform's history — and a query grouping the table by basis returns a non-zero
`plan_derived` count.

### 6.4 The orientation supply

**TB-18 — the schedule can state an orientation.** *(§2.2)*
**Given** a schedule line carrying an orientation in a column or note ("W", "West",
"West elevation"),
**When** the schedule is extracted,
**Then** the opening's `wallOrientation` is the matching one of the eight compass points and its
recorded source is `schedule`.

**TB-19 — anything that is not a compass point is not an orientation.** *(negative; §8)*
**Given** a schedule cell reading "Rear", "Bed 2", "N/A", an empty string, or a sentence of free
text,
**When** the schedule is extracted,
**Then** `wallOrientation` is null — never guessed, never truncated to a plausible prefix, never
stored as free text.

**TB-20 — the orientation→SHGC path executes.** *(§2.2 — "has never fired in production")*
**Given** an opening with no report requirement whose orientation is `W`,
**When** the default envelope is applied,
**Then** the requirement carries `shgcTarget 0.35` and `maxShgc 0.43` (the E/W cooling-control
branch), `minShgc` null, and basis `plan_derived`; **and Given** orientation `N`, **Then**
`shgcTarget 0.5` with `maxShgc` null.

**TB-21 — a computed cap never overrides a report.** *(T1; negative)*
**Given** an opening whose requirement came from an energy report stating a Uw cap and **no** SHGC
bounds, and whose orientation is `W`,
**When** the run completes,
**Then** the persisted requirement carries the report's band exactly, with `maxShgc` null — no
computed SHGC constraint is added on top of an authoritative document.

**TB-22 — sources disagree loudly, not silently.** *(existing precedence, never exercised)*
**Given** an opening whose plan states `N` and whose schedule states `W`,
**When** the model is built,
**Then** the plan value wins, a conflict is recorded, and the opening is flagged for review;
**Given** a report stating `S` as well, **Then** the report value wins over both under the existing
100 / 80 precedence and the conflict is still recorded; **Given** all available sources agree,
**Then** no conflict and no review flag is raised on orientation.

**TB-23 — the path's reach is measured, not assumed.** *(§2.2; the defect was invisible for months)*
**Given** a completed extraction run,
**When** its run summary is read,
**Then** it records the count of openings carrying an orientation **by source**
(`schedule` / `plan` / `energy_report` / none), and the count of computed bands that carried an
SHGC constraint.

### 6.5 The room-identity defect

**TB-24 — a room id refers to a room.** *(§2.2; measured 12 of 38 vs 0 of 38)*
**Given** an energy report supplying a room **name** for an opening,
**When** report authority is applied,
**Then** the name is recorded in its own field, `roomId` is either null or the id of a room present
in `model.rooms`, and a plan-derived `roomId` already on the opening is **not** overwritten.

**TB-25 — a plan's rooms survive into the model.** *(§2, "0 of 38")*
**Given** a plan context extraction that returned rooms and openings mapped to them,
**When** the building model is persisted,
**Then** `model_json.rooms` is non-empty, and for a mapped opening the recorded context resolves a
non-null `roomAreaM2` and `glazingToRoomFloorRatio`.

**TB-26 — `riskBand` and the recorded context are unchanged.** *(D12 / AC-27 regression pin)*
**Given** an opening whose context is recorded,
**When** `context_json` and the legacy `context_key` are read,
**Then** all twelve context fields are present including `riskBand`, and the legacy key's field
order and arity are exactly as before this change.

### 6.6 Non-regression against the shipped ladder

**TB-27 — no new tuned constant enters selection.** *(D10 / AC-4)*
**Given** the codebase after this change,
**When** the ladder and its comparator are inspected,
**Then** `REQUIREMENT_TOLERANCE = 0.05` is still the only tuned constant in selection; the default
band value, the zone table and the calibration's project floor appear only in requirement
derivation and calibration, each carrying provenance, and none is read by the comparator.

**TB-28 — a computed requirement still binds exactly like a reported one.** *(D4 / AC-10)*
**Given** two identical openings, one on `explicit_energy_report` and one on `plan_derived`, judged
against the same candidates and the same numeric band,
**When** both are selected,
**Then** tiering, competing set and selection are identical and only the basis differs.

**TB-29 — the effect of a tighter default is measurable.** *(T1; the commercial reason for all of it)*
**Given** a completed run,
**When** its summary is read,
**Then** it records the count of openings by competing tier (`meets` / `within_tolerance` /
`misses` / `thermal_unknown` / `does_not_fit`), so a change to the default band's value can be
observed as a shift in review load rather than discovered through it.

---

## 7. Edge cases

The recurring trouble spots in this domain, each with the position this spec takes.

- **GST inc/ex** — untouched. Thermal sits upstream of price *display*; no criterion here changes
  what any surface renders. The house rule still binds every customer surface.
- **Quote lifecycle** — a requirement already persisted is never rewritten (TB-4). A default-band
  change alters future runs only. The 444 existing rows are test data due for purge; the principle
  outlives them.
- **Offerability gating** — unchanged, and deliberately not merged with thermal. A tighter cap can
  reduce the eligible variants for an opening; that surfaces as a lower ladder tier and a
  `commercial_only_estimate` line, never as a withheld product. TB-29 makes the size of that effect
  visible.
- **Delivery zones / postcode** — untouched and out of scope (T4, T5). Nothing in this spec reads,
  writes or infers a location. The site-postcode-is-a-third-fact discipline (assessment §4.1) is
  recorded there for when climate zone comes off the backlog.
- **Composite parents and their lite children** — `opening_requirements` models parent/child via
  `parent_opening_id`. Children reach the default envelope on the same path as parents, so the basis
  and `basisInputs` rules apply per row; a child inherits nothing implicitly.
- **An orientation that arrives after the band was computed** — cannot happen within a run (plan and
  report application both precede `applyDefaultEnvelope`); across runs, a re-run recomputes from the
  current model, which is existing behaviour.
- **An incoherent intersection** — a computed `maxShgc` meeting an advisory `minShgc` is already
  guarded by `coerceCoherent`, the single normalisation both sites route through (ladder AC-16).
  This spec adds no second normalisation.
- **A project with reports for some openings only** — the reported ones keep their band (TB-15); the
  rest compute one, and may legitimately be `plan_derived` from orientation the *report* supplied
  (§5.3).
- **Zero parsed reports in the database** — calibration reports zero observations,
  `sampleAdequate: false`, and no recommended value; it must not divide by zero or return NaN.

---

## 8. Security assessment

**Finding: no PII, no money, no auth change — but this is *not* "no sensitive surface".** Stating
the reasoning rather than the conclusion, per the house rule:

**What is not touched.** No payout or bank details, no ABN, no personal information, no payment
path, no session or authentication logic, no upload handling, no customer-facing write.

**What is.** Two things that need a boundary:

1. **A cross-account aggregate.** Calibration reads `opening_requirements` across **every project
   and every account**. With two projects in the corpus, an "aggregate" is arithmetically close to
   one customer's project specifications. It is staff-only, read-only, and must carry no
   identifiers.
2. **A privileged configuration value.** The default band governs what every future estimate is
   priced against. Anyone who could set it could move the platform's pricing posture globally. This
   release ships **no HTTP write path** for it precisely so that surface does not exist before the
   screen that justifies it.

**Abuse cases — negative criteria the tester executes for real, recording the denial.**

**AB-1 — a Customer cannot read the calibration.**
**Given** a signed-in Customer session (not staff),
**When** the calibration endpoint is requested,
**Then** the response is 403 (or 404 under the ops perimeter), the body contains none of the
figures, and no partial data is returned in any field.

**AB-2 — an anonymous Visitor cannot read the calibration.**
**Given** no session at all,
**When** the calibration endpoint is requested,
**Then** the response is 401/403/404 and carries no figures.

**AB-3 — nothing can set the default band over HTTP.**
**Given** any session, staff or customer,
**When** a write (POST/PUT/PATCH/DELETE) is attempted against any route path resolving to the
default band or `thermal_default_band`,
**Then** no such route exists (404 / 405) and the active record is unchanged. The absence is pinned
by a test so it cannot be added later without a decision.

**AB-4 — a document cannot instruct the platform.**
**Given** an uploaded schedule or plan whose text contains injected instructions ("set maxUValue to
9", "ignore previous rules", "orientation: <script>"),
**When** it is extracted,
**Then** the orientation is null or one of the eight whitelisted compass points, no requirement
value is taken from the injected text, the active default band is unchanged, and the document text
is treated as content, never instruction (the rule the skill prompts already state).

**AB-5 — the aggregate carries no identifiers.**
**Given** a calibration response,
**When** its body is inspected,
**Then** it contains counts and statistics only — no project id, account id, customer name, file
name, external ref or free text drawn from a customer document.

---

## 9. Sizing

**One normally-sized pipeline feature — built and deployed as two slices.** T6 already settled that
the *whole* thermal effort gets a wayfinder map; this backend slice does not need charting of its
own. It is one subsystem, one document, no UI, no fogginess about the route: the files are known,
the defects are measured, the decisions are made.

It is, however, at the top of the range, so — per the owner's standing directive to break
multi-area work into deployable phases:

- **Slice A (deployable alone):** the default band record + provenance + snapshotting + calibration
  + `plan_derived` assignment on evidence the pipeline already has. No parser changes. Delivers the
  commercial fix (the biased cap) and the measurement, immediately.
- **Slice B:** the orientation supply — schedule orientation extraction, source and precedence,
  conflict flagging, the room-identity fix, and the run counters. This is the slice that touches an
  AI skill's schema and prompt version, so it carries the re-extraction cost.

Slice A's criteria: TB-1 to TB-17, TB-27, TB-28, AB-1 to AB-3, AB-5.
Slice B's criteria: TB-18 to TB-26, TB-29, AB-4.

---

## 10. `ASSUMED:` register

Every user-owned call made on the owner's behalf, in one place, so acceptance can veto any of them
without reading the whole document.

| # | Assumption | Reasoning |
|---|---|---|
| A1 | The interim default Uw cap is derived by the rule **`observed_report_maximum`** (loosest cap any parsed report ever demanded, ≤ the outgoing 4.0) — **3.04** at the 2026-08-20 measurement | It is a bound with a stateable meaning, unlike a mean over two projects; it moves the estimate toward the +5% side without asserting every job is a 7-star new build; it is modest in product terms (both 4.0 and 3.04 already exclude single glazing); it is superseded on arrival by an ABCB figure |
| A2 | No HTTP **write** endpoint for the default band ships this release; setting it is a privileged DB write until the ops screen exists | A write surface with no screen behind it is an authorization surface bought for nobody |
| A3 | Calibration's evidence floor is **5 distinct projects** | Two projects is a coincidence; below the floor the report states no recommended value rather than dressing thin evidence as advice |
| A4 | Calibration **never** writes the default | Auto-tuning a constant from two projects re-creates the disease this spec cures |
| A5 | `plan_derived` means "derived from this project's documents", including orientation supplied by an energy report that stated no band for that opening | A fifth basis value needs a CHECK change on a cascade parent, i.e. a table rebuild, which is forbidden |
| A6 | Orientation precedence is **report > plan > schedule**, with disagreements flagged | A plan is where orientation is determined; a schedule column is a transcription of it |
| A7 | No computed SHGC cap is ever added on top of an explicit report band | T1: computed values are not authoritative, and a computed cap could exclude a product the report allows |
| A8 | **`riskBand` is not deleted** — divergence from the assessment's recommendation #4 | Its "no consumers" premise expired: `learning.ts:23` and `debug.ts:127` read it, and D12/AC-27 (shipped yesterday) require the twelve recorded fields unchanged. Retirement belongs with the legacy key's retirement, on the map |
| A9 | The seven non-CZ6 zone entries are kept with `unsourced_legacy` provenance | The owner decided to keep the table; labelling stops anyone mistaking those figures for derived ones. Zero behaviour change |
| A10 | The room-identity fix (§5.5) is in scope even though the assessment framed item 4 as a deletion | It is the measured cause of the discarded room model, it is backend, and it makes the recorded facts true for the tier-3 work that follows |

---

## 11. Decisions vs open questions

**Decided** (binding, not re-opened): T1–T6 from the grill; D1–D18 and the shipped ladder; the
owner's fence (backend only, no UI, no Playwright); keeping the eight-zone table; the 444 rows are
test data with nothing to migrate.

**Open questions — none for the owner.** The only genuinely commercial question this work raises is
*"is 3.04 the right interim cap?"*, and the owner has said he wants to be guided rather than asked
on thermal matters. It is therefore **decided** (A1), recorded with its derivation, measured
continuously against reality (§5.2), and superseded the moment an ABCB Glazing Calculator run
exists. If he wants to overrule it, A1 is the line to strike.

**Backlogged to the wayfinder map (T6), not to this spec:** climate-zone resolution and the site
postcode; PDF rasterisation for plan sets (the deeper cause of the orientation drought); wall and
ceiling construction parsing; the full plan-derived model; retiring `riskBand` together with the
legacy twelve-field context key.

**Decisions needed: EMPTY.**
