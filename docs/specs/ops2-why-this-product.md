# ops2 "Why this product" — SPEC

**Date:** 2026-08-24 · **Stage:** pipeline stage 1 (product-manager) · **Revision 4**
**Grill:** COMPLETE — `docs/specs/ops2-why-this-product-grill-conclusions.md` (R1–R21 **binding**).
Where a ruling contradicts the mock, the ruling wins.
**Grill input / code facts:** `docs/specs/ops2-why-this-product-grill-input.md`
**Prior art this extends:** `docs/specs/ops2-record-correction.md` + `docs/specs/ops2-record-design.md`
(the line page, `Plate`, `SidePanel`, `Elevation` all exist and are reused, never rebuilt).

**Revision 4** folds in the owner's third decision round: the capture **extends to the
customer save path** (D7), and three further rulings — **R22** the capture rule is
universal, **R23** an override changes the selection but never the target, **R24** an
overridden selection must no longer read as platform-made.

**Decisions needed: none** (§14). The spec is ready for the architect.

---

## 1. Problem statement

The platform recommends a product per opening. Nothing anywhere shows why.

`selection_run` and `candidate_result` have carried the full rationale since migration 0055
— the requirement and where it came from, every candidate's tier, rank, thermal figures,
fit and price — and **no route in `worker/routes/` reads either table**. The reasoning is
written to a database and never spoken.

The consequence lands at the **human review gate**, the stage between submission and
issue where a recommendation is confirmed or overridden. The person standing there
today either takes the machine's word or re-does the thermal comparison by hand. Neither
is a review. In the owner's words: *"I want to be able to audit recommendations and
accuracy of thermal modelling"* and *"the bigger vision is to surface most likely
alternatives hopefully making human's work easier."*

Underneath it sits a defect that makes the audit read wrong before it starts. A dead
`certified` flag — never asked for, wired to opposite default values in two places of the
Sanity schema — downgrades **13 of 32 products to "indicative estimate only" on every
thermally-constrained line**, while the other 19 pass untouched. A reviewer auditing
recommendations would spend their first week reporting that.

And a third gap, now the widest of the three: **a product's thermal performance is not
recorded on the line that uses it.** Not when a reviewer changes the frame or glazing, not
when a customer configures a line themselves, and not when a customer overrides what the
estimator proposed. The save paths store the product, the options and the price; the Uw
and SHGC that make the choice reviewable are looked up at selection time and dropped.
Under R3/D3 nothing may look them up at display time to recover them — so if a save does
not record them, they are gone.

## 2. Scope

### In scope

1. **The read surface.** A three-line "Why this product" panel on the line detail view,
   and the detail slide-out it leads to: the requirement and its origin, the chosen
   product against it, why it won, and the 3–5 next-best alternatives by ladder rank.
   Composites included (R14–R17), including the per-lite thermal bands that have been
   written on every split since migration 0036 and read by nothing. A **thinner panel**
   for lines nobody's estimator ever evaluated: no target, but the product's own figures
   (D6).
2. **The `certified` removal, depth (c)** — code, Studio schema, and the values in the
   live documents (R5, §5 of the conclusions). **Phase 1, and nothing else rides with it**
   (D5).
3. **The universal performance-figure capture (R22, D3, D6, D7).** *Every* save that sets
   or changes a line's product or variant records that product's Uw and SHGC on the line —
   ops console and customer site alike. **A server write-path change, inside Phase 3.**
4. **A shared full-screen drawing viewer** for ops2 (R21), replacing the line plate's
   current side-panel enlargement.
5. **A "Change the product" control with a stated placeholder destination** (D4).

### Out of scope — and why

| Not built | Because |
|---|---|
| An actual line editor in ops2 | D4: *"still to be built. you may open a placeholder."* Phase 3 ships the control and the stub, not the editor. |
| Any deep-link into the legacy ops console | D4, explicit. |
| Switching the line's product from the "Why" surface | R1: the surface is read-only; the control is a link out. |
| Recording a verdict on the recommendation (`PATCH /api/ops/recommendation-outcomes/:id`) | R2. The endpoint exists and stays unwired. |
| Reading the catalogue or the estimator **at display time**, for anything | R3 + D3: *"snapshot at the time of recalculation/save. Not extracted in real time."* |
| Re-deriving, re-resolving or recomputing a thermal **requirement** anywhere | R23: *"if AI calculates a target and selects a product, which is then overriden by a client -> that does not change the target."* |
| Any change to `quote_line.origin`, `ai_proposal_line_id`, or `aiManaged` routing | The R24 constraint: those are correct for routing and must stay. Provenance for display is **derived**, never re-stamped. |
| Any new validation, eligibility check or refusal on any save path | D6's hard constraint — §7.2. A display feature may not make a save fail that succeeds today. |
| Any change to the learning corpus or the issue-time capture path | §7.6 — verified non-impact, deliberately untouched. |
| Live re-pricing, price deltas, or any money on the surface | R10, R3. |
| Excluded candidates, in any form — list, count, or reason | R9, verbatim owner ruling. |
| Backfilling anything — statuses, or figures onto lines saved before Phase 3 | R18 *"leave history"*; a backfill would be a display-time catalogue read wearing a snapshot's clothes. The owner accepted this cost explicitly (D5). |
| Carrying the rationale past issue (`order_line` gains no candidate reference) | D2. Its own ticket if ever wanted. |
| The staff role vocabulary (`estimator \| technical_reviewer \| manager \| admin`) | Conclusions §8: same defect class, own ticket, touches authorization. **Must not ride along.** |
| A new RBAC role for the Estimator persona | Conclusions §1: persona ≠ role. R20 stands unchanged. |
| Any customer-facing **display** change | Staff surface only. The customer-side change is a write, never something a customer sees. |

## 3. Actors and needs

*Carried verbatim from the grill conclusions §1 — the owner is the only primary source
on these, and nothing below is inferred.*

**Two axes, and they are never to be merged** — owner ruling, 2026-08-24: *"let's not
confuse actor as in persona that has it's needs, and rbac enabled limitation what a
persona can do on the platform!"*

- **Persona** — who someone is and what they need.
- **RBAC** — what the platform permits them to do (R20; conclusions §8's role cleanup).
  Neither answers a persona question.

### Estimator (persona — new to the domain; the architect adds it to `CONTEXT.md`)

**`Estimator` is a persona and it has needs of its own** — owner: *"yes, estimator, as a
persona, has the needs. But that does not need to translate into a separate rbac role
with limited feature set, not at this point of time."* An Estimator's needs are served by
**showing them the right things**, not by fencing anyone else out. Today the persona is
performed by one of the two owners, because there is no separate estimator — a staffing
fact, not a model fact.

The need, in the owner's own terms:

> *"I want to be able to audit recommendations and accuracy of thermal modelling."*
> *"the bigger vision is to surface most likely alternatives hopefully making human's work easier."*
> *"this is for human review gate."*

Read together: **confidence in the platform's reasoning, and speed through the review** —
not correction of the machine. R2 is the direct consequence and the copy must honour it.

### Customer (existing — newly relevant, via D6/D7)

A customer who configures a line themselves, or overrides what the estimator proposed,
picks a product with real thermal performance and no target to meet. The owner, on what
the reviewer should then see: *"human, as in client, manual picks do not have targets, but
showing panel with performance data is fine, I think. It simply means that this panel will
be far less rich in details."* And on what such an override means: *"a selection shall not
be perceived as AI-made anymore"* — while *"that does not change the target."*

The Customer is not a reader of this surface and gains nothing visible from it. What
changes for them is invisible: what their save *records*. The constraint that goes with
that is absolute — **their save must never start failing** (§7.2).

### Staff (existing — and `CONTEXT.md:14` is wrong)

Owner: *"staff is our own people, 2 owners at this point of time, only. **OpenFrame
people. AMJ is manufacturer.**"* Staff work for **OpenFrame**, not AMJ. The glossary says
AMJ, and every later stage reads its vocabulary from that file.

### Manufacturer partner (an RBAC exclusion, recorded to close it)

Not a persona this feature serves. `hasAssignedRole` already refuses them
(`worker/lib/staff.ts:150`). Recorded because the consequence is sharper here than
anywhere else in the console: **this surface exposes which competing products were
considered and how they compared**, so a manufacturer partner reading it would be a
genuine competitive leak. The existing gate closes it. Nothing may loosen it — §10
executes it as an abuse case rather than trusting it.

### The stage: the human review gate

Between submission and issue, where the platform's recommendation is confirmed or
overridden. A stage in a quote's life, not a persona and not a role. Not named in
`CONTEXT.md` today; the architect should consider adding it.

## 4. Phasing — **owner-confirmed (D1, amended by D5)**

Three independently deployable phases, in this order. Pipeline stages 1–8 run **per
phase**, not once across all three. Phases 2 and 3 may share one UX mock-gate session
while still deploying separately.

### Phase 1 — Remove `certified` (no UI) · **strictly this, nothing else** (D5)

**Delivers on its own:** thermally-constrained lines stop being downgraded to "indicative
estimate only" because of a flag nobody asked for. 13 of 32 products rejoin the ladder on
the same footing as the other 19, and legacy variants that the catalogue loader silently
*dropped* (`catalogue.ts:187`) become candidates again.

**Why first:** it is a live correctness defect, it is the only phase that touches the
estimator and the production Sanity dataset, and it has no UI — so no mock gate, no
Playwright dependency, and its blast radius is contained while it is the only thing in
flight.

**Risk owned here:** an irreversible write against the live Sanity dataset. Dataset
export first, gated in code (CERT-AC-8), per the conclusions' §5 constraint 1 and the D1
migration lesson.

### Phase 2 — The shared full-screen drawing viewer (R21)

**Delivers on its own:** the element the owner rates highest in the product is readable at
full size from every ops2 surface that draws an opening as its subject; on a composite,
a unit can be examined alone. Replaces the line plate's current side-panel enlargement.

**Why second:** small, client-only, zero server surface, and Phase 3's drawings inherit it
rather than growing a second enlarge behaviour. It was a separate ask (*"clicking on a
drawing opens full screen view"*), so it does not need Phase 3 to be worth deploying.

### Phase 3 — the capture, the panel, the slide-out, the placeholder

**It is two kinds of change in one deployment, named separately here so neither is
discovered late:**

- **Phase 3a — a server write-path change (§7).** Every save that sets a line's product
  records what that product performs at, on both the ops console and the customer site.
  `worker/**`, so **Probity applies: the failing test comes first**. It carries the
  feature's only regression risk, and §7.2 is where that risk is pinned.
- **Phase 3b — a read-only display surface (§9).** The panel and the detail. R1: it
  changes nothing; WHY-AC-20 requires the whole interaction to be GETs.

**The cost the owner accepted (D5):** the capture does not ship until Phase 3, and there
is no backfill, so **every line saved before Phase 3 has no figures** and shows the honest
absence (WHY-AC-9, WHY-AC-27). Lines saved after it do. Phase 1 stays clean in exchange.

**Sequencing inside the phase:** 3a lands first and alone — red test, then the write, then
its negative criteria green — before any read endpoint or UI work starts. Shipping the
capture even a few days ahead of the surface is worth more than tidiness: every save in
between is a line that will have something to show, and a save that is missed cannot be
recovered.

**Dependency check:** Phase 3 does not technically depend on Phase 1 — R5 keeps
certification off the screen either way. It does not depend on Phase 2 either; without it,
Phase 3's drawings simply are not enlargeable. 3b depends on 3a for anything a human
selected to have figures at all.

### Wayfinder check

**Not needed.** The route is visible and the decisions are made — 21 rulings, seven owner
decisions, a verified join path, a verified writer index. Three normally-sized features,
not a foggy region.

## 5. Ruling and decision index (traceability)

R1 read-only · R2 not a verdict surface · R3 snapshot · R4 requirement + origin label ·
R5 no certification on screen · R6 three panel lines · R7 name the 5% band · R8 chosen +
3–5 next best · R9 no excluded · R10 no price deltas · R11 human change shows both ·
R12 frame or glazing = changed · R13 no-run lines still show the panel · R14 panel on
machine-proposed composites · R15 split reason then per-lite bands · R16 per-lite bands
are real · R17 ops split = R13 · R18 leave history · R19 right-hand slide-out · R20 same
gate as the record · R21 full-screen drawing viewer.

**R22 — the capture rule is universal.** *"every save should record thermal properties of
selected at a time product."* One rule, every writer (§7.1).

**R23 — a target is not a selection.** *"if AI calculates a target and selects a product,
which is then overriden by a client -> that does not change the target."* An override
moves the selection side of the comparison and nothing else (WHY-AC-25).

**R24 — an overridden selection must no longer read as platform-made.** *"a selection
shall not be perceived as AI-made anymore."* Attribution is **derived by comparison**,
never read from `origin` (WHY-AC-28, WHY-AC-29).

Owner decisions: **D1** three phases, confirmed order · **D2** panel absent post-issue ·
**D3** figures snapshotted at save, never read live · **D4** "Change the product" ships
with a placeholder, no legacy deep-link · **D5** the capture waits for Phase 3; Phase 1
stays strictly the `certified` removal, and the loss of figures for everything saved
before Phase 3 is accepted · **D6** a client/manual-picked line shows a thinner panel
**with** its product's figures · **D7** the capture extends to the customer save path.

---

## 6. Acceptance criteria — Phase 1: remove `certified`

**CERT-AC-1 (R5, conclusions §5)** — *Given* a product whose thermal figures come only
from legacy `performanceVariants` with `certified` absent or false, *When* a project
estimate runs against an opening that has a thermal requirement, *Then* the resulting
line's status is not `commercial_only_estimate` on account of certification, and the
variant is ranked on its Uw/SHGC figures alone.

**CERT-AC-2 (the drop-guard)** — *Given* a legacy variant that would previously have been
removed from the catalogue outright by the guard at `catalogue.ts:187`, *When* the
catalogue is loaded, *Then* the variant is present in the candidate set, provided it still
passes the non-certification checks (variant id present, not a duplicate, figures in
range).

**CERT-AC-3 (call sites)** — *Given* the repository after this phase, *When*
`worker/lib/estimator/**`, `sanity/schemaTypes.ts` and `src/data/recommendation.ts` are
searched, *Then* no `certified` field, no `isCertified`, no `energyCertified` and no
variant `dataSource` remain, **and** `certificationRef` / `wersWindowId` are still read
and still carried through to the candidate.

**CERT-AC-4 (R18)** — *Given* a line whose stored status is `commercial_only_estimate`
from a run before this change, *When* the change is deployed, *Then* that line's stored
status is unchanged, and the diff contains no migration and no script that rewrites a
stored status.

**CERT-AC-5 (status coherence)** — *Given* an opening with a thermal requirement whose
winning candidate is outside the `meets` tier, or whose rules run raised a warning, *When*
the estimate runs after this phase, *Then* the line is still downgraded for **that**
reason — only certification-caused downgrades are gone.

**CERT-AC-6 (Studio schema)** — *Given* the Sanity Studio after this phase, *When* an
author opens a product or a frame thermal profile, *Then* no "Certified" boolean and no
"Data source" dropdown is offered, the validation rule that tied them is gone, and the
WERS reference field is still editable.

**CERT-AC-7 (document values, depth (c))** — *Given* a dated export of the production
dataset has been taken and verified restorable, *When* the value-stripping run completes,
*Then* no document in the dataset carries a `certified` field or a variant `dataSource`
field, every `certificationRef` / `wersWindowId` value is byte-identical to the export,
and no other field differs from the export.

**CERT-AC-8 (export gate — abuse case)** — *Given* no verified export of the production
dataset exists, *When* the value-stripping run is attempted, *Then* it refuses and writes
nothing to the dataset.

**CERT-AC-9 (contract stability)** — *Given* the architect's explicit ruling on
`CandidateOutcome.thermal.dataSource` (remove the field, or retain it permanently null),
*When* an `outcome_json` written before this change is parsed, *Then* it parses without
error, and no surface renders the field either way.

**CERT-AC-10 (no ride-along — conclusions §8 + D5)** — *Given* the diff for this phase,
*When* it is reviewed, *Then* it changes no file under `worker/lib/staff.ts`, no role CHECK
constraint, no migration, **and no save path** — the staff role vocabulary and the capture
are both outside this phase.

**CERT-AC-11 (blast radius)** — *Given* a signed-out visitor and a signed-in customer,
*When* every customer-facing route is exercised after this phase, *Then* no response body
gains or loses a field, and no price changes for an already-priced line.

---

## 7. Acceptance criteria — Phase 3a: the universal capture (R22, D3, D6, D7)

### 7.1 One rule

Owner, verbatim: *"every save should record thermal properties of selected at a time
product."* This is **one rule with many sites**, not a set of per-route features — the
criteria below are the rule and its structural guard; §7.4 is an index of where it lands,
not nine separate decisions.

**SNAP-AC-1 (R22 — the rule)** — *Given* any save that sets or changes a line's product or
its variant, *When* it completes, *Then* the line's own stored record carries that
product+variant's `uValue` and `shgc` as they stood at that moment — regardless of which
route performed the save, and regardless of whether a person or the platform chose the
product.

**SNAP-AC-2 (R22 — structural, so a future writer cannot forget)** — *Given* the
repository after this phase, *When* every statement that writes `quote_line.product_slug`
or `quote_line.selected_variant_id` is enumerated, *Then* each one also writes the figures
field. A writer added later that sets a product without figures fails this test.

**SNAP-AC-3 (R22 — one place per fact)** — *Given* the figures are captured, *When* the
display surface states what the line's current product performs at, *Then* it reads the
line's own record — not `candidate_result`, not the catalogue. `candidate_result` remains
the source for the *recommendation* and the alternatives only.

### 7.2 The hard constraint — capture is never a gate

This comes first among the constraints because it is the one way this feature could damage
the product.

**SNAP-AC-4 (negative — no new refusal, ops)** — *Given* an ops line edit that succeeds
today on a line where **no** performance variant can be resolved, *When* the same edit is
made after the capture ships, *Then* it still succeeds with the same status, the same
stored values and the same price; the figures are stored as null and **no**
`configuration_not_eligible`, no 409 and no other refusal is introduced.

**SNAP-AC-5 (negative — no new refusal, customer)** — *Given* a customer save that
succeeds today, *When* the same save is made after the capture ships, *Then* it still
succeeds, the line's `line_total` and `status` are identical to what they are today, and
no new validation, eligibility check or error path exists on that route.

**SNAP-AC-6 (best-effort resolution)** — *Given* a product+options combination for which
the catalogue offers no matching published variant, or for which the catalogue is
unreachable, *When* the line is saved, *Then* the save completes, the figures are stored
as null, and the failure is not surfaced to the person saving.

**SNAP-AC-7 (no latency regression on the customer path)** — *Given* a customer saving a
project of many lines, *When* the capture resolves figures, *Then* the catalogue is
consulted at most once per save request — not once per line — and a catalogue timeout ends
the same way as SNAP-AC-6: stored null, save unaffected.

### 7.3 What is stored

**SNAP-AC-8 (absence is recorded as absence)** — *Given* a save where a figure is
genuinely unknown, *When* it is stored, *Then* the key is present with a null value —
present-and-null, so a later reader can tell "no figure exists for this product" apart
from "this line was saved before the capture shipped".

**SNAP-AC-9 (it is a snapshot)** — *Given* a line saved with figures captured, *When* the
catalogue's figures for that product later change, *Then* the figures stored on the line
do not change, and nothing recomputes them.

**SNAP-AC-10 (no backfill — D5)** — *Given* lines saved before this phase, *When* it is
deployed, *Then* no script and no migration writes figures onto them.

**SNAP-AC-11 (the platform's record is never overwritten)** — *Given* any capture on any
path, *When* it writes, *Then* it writes only to the line's own configuration record; no
`selection_run` row, no `candidate_result` row and no `outcome_json` is modified, so what
the platform decided is never edited by what a human later chose (R3, R11, R23).

**SNAP-AC-12 (surface area)** — *Given* the diff for the capture, *When* it is reviewed,
*Then* it adds no endpoint and no HTTP method. Whether it adds a column is the architect's
call — `configuration_snapshot_json` already exists on `quote_line` and is the natural
home (`ASSUMED:` §13.8) — and any migration follows the `d1-migration-safety` procedure.

### 7.4 Where the rule lands — the writer index

Verified 2026-08-24. **The architect confirms completeness**; SNAP-AC-2 is what makes an
omission fail rather than pass silently.

| Writer | Today | Under the rule |
|---|---|---|
| ops PATCH, AI-managed branch (`ops.ts:1091`) | builds a configuration snapshot; no figures | adds the resolved variant's figures |
| ops PATCH, manual branch (`ops.ts:1109-1113`) | resolves no variant, writes no snapshot | resolves best-effort, writes figures (D6) |
| ops PATCH, composite parent (`ops.ts:1098`) | no product of its own | rule is vacuous — no figures on a parent; each unit carries its own |
| customer insert (`projects.ts:548-557`) | names no snapshot column at all | writes figures |
| customer edit, ordinary line (`projects.ts:539-546`) | leaves the snapshot untouched | refreshes figures to the product now saved |
| customer edit of an AI-priced line (`projects.ts:506-536`) | sets `configuration_snapshot_json=NULL` — **erasing** any figures captured earlier | still clears the *recommendation's* snapshot (correct — it no longer describes the line) but records **the customer's own** figures in its place |
| customer restores the AI proposal (`projects.ts:635-650`) | rewrites the snapshot from the proposal's configuration | carries the restored product's figures; the line then reads as platform-made again (WHY-AC-30) |
| estimator proposal writers (`ai/proposal.ts:260`, `:445`) | write the configuration; no figures | carry figures, so the panel's "This one" always reads from one place (SNAP-AC-3) |
| composite segment writer (`composite.ts:298`) | writes the per-segment snapshot | carries each unit's own figures |

`ASSUMED:` §13.9 — the last two rows extend R22 to the estimator's own line-creating
writers. The figures for a machine-selected product already exist in `candidate_result`,
so this is redundancy rather than new information; it is specced because R22 says every
save, and because it lets the display read one place instead of two.

### 7.5 The customer path, specifically

**SNAP-AC-13 (D7)** — *Given* a customer configuring a new line, *When* the project is
saved, *Then* the inserted `quote_line` carries the product's figures. A client-configured
line has never carried them before.

**SNAP-AC-14 (D7, the erasure)** — *Given* a customer changing the configuration of a line
the estimator priced, *When* it is saved, *Then* the line records the figures of **what the
customer chose**, and the reviewer's comparison (WHY-AC-25) is available on precisely the
lines stamped `customerConfigurationChanged` for a human to confirm.

**SNAP-AC-15 (D7, nothing customer-visible)** — *Given* the customer site after this
change, *When* a customer configures, saves, re-opens and submits a project, *Then* every
screen, every price and every response they see is identical to before; the only
difference is what the row stores.

### 7.6 Verified non-impact — the learning corpus

Confirmed 2026-08-24 at the owner's request, and recorded here so a later reviewer does
not re-open it: `captureRecommendationOutcomes` runs at issue (`issue.ts:46`); an override
fails `sameCoreConfiguration` (`ai/outcomes.ts:97-102`), so the outcome's `decision` is
`"adjusted"`, `recommendationEligible` is false, and it is parked `pending` for human
adjudication rather than trained on. **This feature must not alter that path, and nothing
in it does** — the capture writes to the line's own configuration record only
(SNAP-AC-11), and the display surface is GET-only (WHY-AC-20). No criteria are written
against the learning path; it is out of scope by intent, not by omission.

---

## 8. Acceptance criteria — Phase 2: the full-screen drawing viewer (R21)

**VIEW-AC-1 (R21)** — *Given* the line page for a simple opening, *When* the reviewer
activates the drawing, *Then* a full-screen viewer opens showing that opening's elevation
at the largest size the viewport allows, with the symbol legend.

**VIEW-AC-2 (R21)** — *Given* the viewer is open, *When* the reviewer activates its close
control or presses Escape, *Then* the viewer closes, no navigation occurs, and
`history.length` is unchanged.

**VIEW-AC-3 (R21, composite parent)** — *Given* a composite line page, *When* the reviewer
activates the parent drawing, *Then* the viewer shows the whole assembly with its units
drawn in proportion to their real sizes.

**VIEW-AC-4 (R21, composite unit)** — *Given* a composite line page, *When* the reviewer
activates a single unit's drawing in the units list, *Then* the viewer shows that unit
alone, labelled with the unit's code and its own size.

**VIEW-AC-5 (R21, "one shared viewer")** — *Given* the ops2 source after this phase,
*When* it is searched for full-screen drawing surfaces, *Then* exactly one viewer
component exists and every enlargeable drawing in ops2 opens it.

**VIEW-AC-6 (R21 supersedes)** — *Given* the line page after this phase, *When* the plate
is activated, *Then* the previous `SidePanel` enlargement (`Plate.tsx:60-106`) no longer
appears anywhere.

**VIEW-AC-7 (keyboard)** — *Given* a keyboard-only reviewer, *When* they focus a drawing
and press Enter or Space, *Then* the viewer opens, focus moves into it, its accessible
name carries the opening's code, and on close focus returns to the drawing that opened it.

**VIEW-AC-8 (no size read)** — *Given* a line for which no size could be read, *When* its
drawing is opened full screen, *Then* the stand-in square is shown with the existing
sentence and no dimension leaders are drawn.

**VIEW-AC-9 (negative — the row stays one target)** — *Given* the project record's line
list, *When* a row's `xs` glyph is activated, *Then* the row navigates to the line page as
it does today and **no** viewer opens. `ASSUMED:` §13.1.

---

## 9. Acceptance criteria — Phase 3b: "Why this product"

### 9.1 The panel on the line detail (R6)

**WHY-AC-1 (R6)** — *Given* a line whose opening resolves to a selection run with recorded
candidate outcomes, and whose product is still the one the platform selected, *When* the
reviewer opens the line page, *Then* a "Why this product" panel appears between the
specification (or the units block) and the price, carrying exactly three lines: **Had to
meet**, **This one**, **Chosen**.

**WHY-AC-2 (R4)** — *Given* a run whose `requirement.basis` is `default_envelope`, *When*
the panel renders "Had to meet", *Then* the caps are stated as figures **and** an origin
label names them as a platform default; and equivalently `explicit_energy_report` → an
energy report, `plan_derived` → the platform's modelling from the plan, `human_override` →
a human override.

**WHY-AC-3 (R4, absent)** — *Given* a run whose `requirement.absent` is true, *When* the
panel renders, *Then* "Had to meet" states that this opening had no thermal requirement,
and no cap figure is shown.

**WHY-AC-4 (R6, SNAP-AC-3)** — *Given* the line's stored figures, *When* "This one"
renders, *Then* it shows the line's current product's Uw and SHGC from the line's own
record; a figure recorded as null is stated as not recorded and is never rendered as a
number, a zero or a dash.

**WHY-AC-5 (R6, R7)** — *Given* the run's `competingTier`, *When* "Chosen" renders on a
line the platform's product still occupies, *Then* it states the winning rule in one
sentence per tier: `meets` → the cheapest of those that met the caps; `within_tolerance` →
nothing met the caps, so the cheapest within 5% of the closest; `misses` → nothing came
within the band, so the closest was taken; `thermal_unknown` → no figure existed on the
constrained axis; `does_not_fit` → nothing fitted, so the best fit was taken.

**WHY-AC-6 (R7)** — *Given* a run stored with `tolerance` 0.08, *When* the tolerance
sentence renders, *Then* it says 8% — the figure is read from the run, never hardcoded,
and the band is named rather than paraphrased as "closest available".

**WHY-AC-7 (R19)** — *Given* the panel is shown and the line has recorded candidates,
*When* the reviewer activates the panel's action, *Then* the detail opens as the
established `SidePanel`: a right-hand slide-out at desk width, a bottom sheet on the
phone.

**WHY-AC-8 (R13, D6 — the thinner panel)** — *Given* a line with no selection run (a
customer-configured or manually entered line) whose stored figures exist, *When* the line
page opens, *Then* the panel is present and shows **two** lines: that a person chose this
product, and that product's own Uw and SHGC. There is **no** "Had to meet" line, **no**
"Chosen" line, and no alternatives action — the owner's *"far less rich in details"*, said
by having fewer lines rather than by filling them with absences.

**WHY-AC-9 (D5, the honest gap)** — *Given* such a line whose stored figures are absent —
saved before Phase 3, or resolved to null (SNAP-AC-6) — *When* the panel renders, *Then*
it states that a person chose this product and that its figures were not recorded, and
**no** catalogue lookup is made to fill the gap. `ASSUMED:` §13.5.

**WHY-AC-10 (R3, pre-0055 rows)** — *Given* a line whose selection run predates
`outcome_json` (migration 0055), *When* the line page opens, *Then* the panel states that
this recommendation was made by an earlier model whose reasoning was not recorded, no
figures from the deleted scoring model are shown, and no alternatives action is offered.
`ASSUMED:` §13.2.

**WHY-AC-11 (D2, post-issue)** — *Given* a project that has been issued and accepted, so
the record shows order lines, *When* a line page is opened, *Then* **no "Why this product"
panel appears at all** — not the panel, not an explanatory sentence in its place — and
nothing on the page references a recommendation.

### 9.2 The detail slide-out (R8, R9, R10, R19)

**WHY-AC-12 (R8)** — *Given* a run with at least five non-excluded candidates, *When* the
detail opens, *Then* it lists the chosen product first, marked as chosen, followed by the
next four candidates by ascending ladder rank — five rows, no more.

**WHY-AC-13 (R8)** — *Given* a run with fewer than five non-excluded candidates, *When*
the detail opens, *Then* it lists the ones that exist, with no placeholder rows and **no
count of anything beyond the list**.

**WHY-AC-14 (R9 — negative)** — *Given* a run whose candidate set contains excluded
candidates, *When* the detail opens, *Then* no excluded candidate appears, no count of
excluded candidates appears, and no exclusion reason text appears anywhere on the surface.

**WHY-AC-15 (R9 + conclusions §7 — negative)** — *Given* a run whose `withheldIncomplete[]`
is non-empty, *When* the detail opens, *Then* nothing about withheld products appears.
`ASSUMED:` carried from conclusions §7.

**WHY-AC-16 (R10 — negative)** — *Given* any alternative row, *When* it renders, *Then* it
carries no price, no price delta, no currency symbol, and no control that prices it.

**WHY-AC-17 (R6, R7)** — *Given* an alternative row, *When* it renders, *Then* it states
the product's name, its recorded Uw and SHGC, and its verdict in words derived from its
tier (met the caps / within the 5% band / missed the cap / no figure on the constrained
axis / would not fit).

**WHY-AC-18 (R3, D3)** — *Given* the catalogue has changed since the run was recorded,
*When* the panel and the detail render, *Then* every figure shown is a stored one, and the
surface issues no request to the catalogue or to the estimator to recompute anything.

**WHY-AC-19 (R3)** — *Given* a recorded candidate whose product no longer exists in the
catalogue, *When* the detail renders, *Then* the row is still shown from the recorded
facts and is never blank or dropped.

**WHY-AC-20 (R1 — negative)** — *Given* the panel and the detail, *When* every control on
them is enumerated, *Then* none changes the line, the quote or any stored value, and a
network trace of opening the panel and the detail contains only GET requests.

**WHY-AC-21 (R2 — negative)** — *Given* any state of this surface, *When* its text is
read, *Then* no wording describes a human's product change as wrong, incorrect, a
mistake, an error or a correction of the platform.

### 9.3 When a human changed the make-up (R11, R12, R23, R24)

**WHY-AC-22 (R11, R12)** — *Given* a line whose current product differs from the one the
platform recommended, *When* the panel and the detail render, *Then* the platform's
original recommendation is shown **unchanged**, and a comparison of the line's current
product against the **same** requirement is shown beside it.

**WHY-AC-23 (R12)** — *Given* a line whose product is unchanged but whose variant/glazing
differs from the recommended one, *When* the surface renders, *Then* the same both-shown
treatment applies — frame *or* glazing counts as a change.

**WHY-AC-24 (R11 — negative)** — *Given* a line where neither frame nor glazing has
changed, *When* the surface renders, *Then* no human-selection block appears at all.

**WHY-AC-25 (R23 — the target does not move)** — *Given* a line whose product a human
changed, *When* the panel and the detail render, *Then* the requirement shown is exactly
the one the platform recorded at selection time — same caps, same basis label — and **no
code path re-resolves, recomputes or re-derives a requirement from the line's current
product.** Only the selection side of the comparison moves.

**WHY-AC-26 (R23 — negative, structural)** — *Given* the read surface's code, *When* it is
reviewed, *Then* it contains no call to any requirement-resolving function and no
recomputation of caps; the requirement is read from the stored run and nowhere else.

**WHY-AC-27 (D3, D5 — the mechanism and its gap)** — *Given* a line whose make-up was
changed after the capture shipped, *When* the comparison renders, *Then* it compares the
**stored** figures against the run's recorded caps, stating whether they meet, sit within
the stored tolerance band, or miss — in the vocabulary of WHY-AC-17, with no wording that
frames the change as an error (R2). *Given* the figures are absent — changed before the
capture shipped, or resolved to null — *Then* it states that they were not recorded, still
shows the requirement and the platform's recommendation unchanged, and makes no live
lookup.

**WHY-AC-28 (R24 — attribution)** — *Given* a line whose current product+variant differ
from the configuration the platform recommended, *When* the panel renders, *Then* the
current selection is attributed to a person and never to the platform: the "Chosen" line
says a person chose this product and names what the platform had recommended instead, and
no wording anywhere presents the line's current product as the platform's pick.
`ASSUMED:` §13.10 — R6's three labels are kept and only the third line's sentence changes.

**WHY-AC-29 (R24 — the trap, and the test that catches it)** — *Given* a line the
estimator created (`origin = 'ai'`, `ai_proposal_line_id` set, so `aiManaged` at
`ops.ts:1039` is still true) whose configuration a customer has since overridden, *When*
the panel renders, *Then* it says a person chose this product. The attribution is derived
by **comparing the recorded recommendation's product+variant against the line's current
product+variant** — never from `origin`, never from `ai_proposal_line_id`. The test
fixture is exactly this line: an implementation reading `origin` passes a fixture that
lacks it and fails this one.

**WHY-AC-30 (R24 — restoring the proposal)** — *Given* a customer restores the AI proposal
(`projects.ts:635-650`) so the line's product+variant match the recommendation again,
*When* the panel renders, *Then* it reads as platform-made once more and no
human-selection block appears — the same comparison, run again, with no state to unwind.

**WHY-AC-31 (R24 — negative, the data is not re-stamped)** — *Given* the diff for this
feature, *When* it is reviewed, *Then* no code path writes `quote_line.origin` or
`ai_proposal_line_id`, and `aiManaged`'s behaviour at `ops.ts:1039` is unchanged —
provenance for display is derived, and routing provenance is left exactly as it is.

### 9.4 Composites (R14–R17)

**WHY-AC-32 (R14)** — *Given* a composite parent line whose `composite_origin` is `'ai'`
and whose opening resolves to a selection run, *When* the line page opens, *Then* the "Why
this product" panel **appears**. (The mock's rule — *"THE WHY PANEL DISAPPEARS ENTIRELY"*
— is void, and `LineReview.tsx:38-45` states the superseded rule in its header comment.)

**WHY-AC-33 (R15)** — *Given* such a composite, *When* the detail opens, *Then* it shows,
in this order: the split reason — the make-up that won and the single unit it beat
(`parentRepresentative()`) — and then each lite's own band.

**WHY-AC-34 (R16)** — *Given* a split whose `segment_requirements_json` and
`segment_requirement_basis` are populated, *When* the per-lite section renders, *Then*
each unit states its own caps and its own origin label — an awning lite at 0.37–0.41
beside a fixed lite at 0.50–0.56 reads as two different bands, not one.

**WHY-AC-35 (R16)** — *Given* a unit with no recorded band, *When* the per-lite section
renders, *Then* that unit says its band was not recorded, and no band is computed for it.

**WHY-AC-36 (R16)** — *Given* a split whose `segment_thermal_review` records a review flag
on a unit, *When* the per-lite section renders, *Then* that flag is shown against that
unit.

**WHY-AC-37 (R17, D6)** — *Given* a composite whose `composite_origin` is `'ops'`, *When*
the line page opens, *Then* the WHY-AC-8 treatment applies — a person decided this split,
with each unit's own figures where they are recorded — and no machine rationale, split
reason or alternatives list is shown.

**WHY-AC-38 (R14, `splitNote`)** — *Given* a run that recorded a make-up was attempted and
no frame system could supply it, *When* the detail opens, *Then* that fact is stated.

### 9.5 "Change the product" and its placeholder (R1, D4)

Owner, verbatim: *"still to be built. you may open a placeholder."*

**WHY-AC-39 (D4)** — *Given* the detail slide-out is open for a line with a recorded
rationale, *When* the reviewer reads its footer, *Then* exactly one control labelled
"Change the product" is present and **enabled**.

**WHY-AC-40 (D4)** — *Given* the reviewer activates it, *When* the destination renders,
*Then* ops2 has navigated to the line editor's own addressable route
(`/projects/:id/line/:lineId/edit` — the architect confirms the shape), and that route
renders a stub stating in one sentence that the ops2 line editor is not built yet, with a
control back to the line.

**WHY-AC-41 (D4 — negative)** — *Given* the stub, *When* it renders, *Then* it contains no
input, no disabled form control, no Save, no Cancel, and no control that submits anything
— it is a stated absence, not a broken form.

**WHY-AC-42 (D4)** — *Given* the reviewer returns from the stub, *When* the line page
renders again, *Then* the line is unchanged: no `edit_version` bump, no stored value
altered, and no request other than the record read.

**WHY-AC-43 (D4 — negative)** — *Given* every control this feature adds, *When* their
destinations are enumerated, *Then* none navigates to the legacy ops console.

**WHY-AC-44 (D4, reach)** — *Given* a line with no detail slide-out (WHY-AC-8, WHY-AC-9,
WHY-AC-10, WHY-AC-37) or an order-line record (WHY-AC-11), *When* the line page renders,
*Then* no "Change the product" control appears — the control lives in the detail's footer
only, and attaches to the line page when the real editor ships. `ASSUMED:` §13.7.

---

## 10. Abuse-case criteria (negative)

The read surface is staff-gated and read-only, but it exposes **which competing products
were considered and how they compared** — the sharpest competitive leak in the console.
The capture adds a write on paths that include the customer's own save route. These are
executed by the tester as real attempts, with the denial recorded; none is satisfied by
reading the gate's source.

**X-AC-1** — *Given* an anonymous caller, *When* they request the rationale for a known
line id, *Then* the response is 401 and its raw body contains no product slug, no tier, no
thermal figure and no candidate of any kind.

**X-AC-2** — *Given* a signed-in customer who is not staff — including the customer who
owns the project — *When* they request the rationale, *Then* the response is 403 and the
body carries no candidate data.

**X-AC-3 (the control that matters most — conclusions §1, R20)** — *Given* a signed-in
user whose staff role is `manufacturer`, *When* they request the rationale, *Then*
`hasAssignedRole` refuses them with 403, and the raw body contains no competing product
slug, tier, figure or count.

**X-AC-4** — *Given* a staff user, *When* they request the rationale for a line belonging
to a different project than the one in the URL, *Then* the refusal is byte-identical to
the refusal for a line id that does not exist, and no candidate data is returned — a probe
cannot learn from the difference whether the line exists.

**X-AC-5 (R9, enforced server-side)** — *Given* any rationale response, *When* its raw
body is inspected, *Then* it contains **only** the candidates the surface may show (the
chosen one and at most four runners-up): no excluded candidate, no `exclusions[]` detail,
no `withheldIncomplete` entry. The ruling is enforced by what is sent, not by what is
rendered.

**X-AC-6 (R1, R2, R3)** — *Given* the route table after Phase 3, *When* it is enumerated,
*Then* this feature has added **no** POST, PATCH, PUT or DELETE endpoint, and
`PATCH /api/ops/recommendation-outcomes/:id` is referenced by no client code. (The capture
changes what existing save routes store; it adds no route and widens no method.)

**X-AC-7 (no free prose escapes)** — *Given* a rationale response for an opening whose
schedule row carried a free-text comment, *When* the raw body is inspected, *Then* it
contains no schedule comment text and no data belonging to any other opening, project or
account.

**X-AC-8 (the editor stub)** — *Given* the placeholder route, *When* it is opened by an
anonymous caller, a non-staff customer or a manufacturer partner, *Then* it refuses
exactly as every other ops2 route does, renders no project, customer, line or pricing
data, and accepts no request of any method other than the read it inherits.

**X-AC-9 (the capture never trusts the client — ops)** — *Given* an ops line-edit request
whose body contains `uValue`, `shgc`, or any thermal field, *When* it is saved, *Then*
those body values are ignored entirely and the stored figures are the ones the server
resolved from the catalogue for the saved product+options.

**X-AC-10 (the capture never trusts the client — customer)** — *Given* a customer save
request whose body contains `uValue`, `shgc` or any thermal field, *When* it is saved,
*Then* those body values are ignored entirely. A customer can never write a thermal figure
onto a line, so a staff reviewer reading the panel is never reading a number the customer
supplied — which is the whole point of the panel.

**X-AC-11 (the capture never crosses a project)** — *Given* a save request naming a line
id that belongs to another project or another account, *When* it is processed, *Then* the
existing ownership guards refuse it unchanged, and no figure is written to any line
outside the caller's own project.

**X-AC-12 (Phase 1, irreversible write)** — CERT-AC-8: the value-stripping run refuses
without a verified dataset export and writes nothing.

**X-AC-13 (Phase 1, blast radius)** — CERT-AC-11: no customer-facing response changes.

---

## 11. Edge cases

| Case | Required behaviour | Ruling |
|---|---|---|
| **GST inc/ex** | No money appears anywhere on this surface — R10 removes deltas and R3 makes stored prices stale. The line's existing Price panel keeps the account-preference rule unchanged. `ASSUMED:` §13.3 | R3, R10 |
| **Quote lifecycle — post-issue** | Panel absent entirely on order-line records; no plumbing added to `order_line`. | D2 |
| **Everything saved before Phase 3** | No figures, and no backfill: the honest absence (WHY-AC-9, WHY-AC-27). Accepted cost. | D5 |
| **A customer-configured line saved after Phase 3** | Thinner panel: who chose it, and its figures. | D6, D7 |
| **A customer overrides an AI-priced line** | The recommendation's snapshot is still cleared (it no longer describes the line); the customer's own figures replace it; the requirement does not move; the panel says a person chose it though `origin` still reads `'ai'`. | SNAP-AC-14, R23, R24 |
| **A customer restores the AI proposal** | The line reads as platform-made again, by comparison rather than by a flag. | WHY-AC-30 |
| **The catalogue is unreachable at save time** | Save completes, figures null, nobody is told. Never a refusal. | D6 hard constraint |
| **A product+options combination with no published variant** | Same: save completes, figures null. | SNAP-AC-6 |
| **Offerability gating** | Products withheld as incomplete and candidates excluded for `offerability` never reach the client at all — enforced server-side (X-AC-5), not by client filtering. | R9 |
| **Delivery zones** | Not applicable; this surface reads no delivery fact. | — |
| **More than one selection run for an opening** | The most recent run by `created_at` is shown; older runs are not listed or merged. `ASSUMED:` §13.4 | R3 |
| **Null thermal figures** | Stated as not recorded. Never 0, never "—", never omitted silently — and distinguishable from "never captured" (SNAP-AC-8). | R6 |
| **`requirement.absent`** | "Had to meet" says there was no requirement; every candidate is then in `meets` by definition, and the "Chosen" sentence must not claim a thermal victory. | R4 |
| **A line whose opening cannot be resolved at all** | Same path as WHY-AC-8 — a person chose this product — never an error state. | R13 |
| **Catalogue moved since the run or since the save** | Stored facts only; no live lookup anywhere, at any time. | R3, D3 |
| **Certification** | Never appears on this screen in any phase, including before Phase 1 ships. | R5 |

---

## 12. Test-surface notes for the architect

Not a test plan — three places where the obvious test would pass a wrong implementation:

1. **WHY-AC-29's fixture** must be an AI-originated line the customer has since
   overridden, with `origin` still `'ai'`. A fixture built from a manual line proves
   nothing about R24, because reading `origin` would pass it.
2. **SNAP-AC-2 is a source-level scan**, not a behavioural test — its whole value is
   catching the writer nobody remembered, and a behavioural test can only cover writers
   someone thought of.
3. **SNAP-AC-5 and SNAP-AC-15 need a customer-path test**, not an ops one. The customer
   save is where a regression would be worst and where this feature has no other business.

---

## 13. `ASSUMED:` register — vetoable at acceptance

Carried from the grill conclusions §7 (settled; do not re-open):

- **(§7.1)** `withheldIncomplete[]` is **not** shown, following R9.
- **(§7.2)** the `CandidateOutcome.dataSource` removal is resolved by the architect per
  conclusions §5 constraint 2.
- **(§7.3)** "3–5 next best" is implemented as **4** runners-up beside the chosen product
  — five rows total (WHY-AC-12).
- **(§7.4)** the `CONTEXT.md` corrections are the architect's to apply: correction 1
  (Staff works for OpenFrame) is a direct owner ruling; correction 2 (define
  "Manufacturer") is an inference and may be vetoed; correction 3 was resolved as
  no-change. Adding the **Estimator** persona and considering the **human review gate** as
  a named stage go with them.

Registered by this spec:

1. **VIEW-AC-9** — the record list's row glyph does not open the viewer. The row is
   already one navigation target (record spec P1-AC-24/35); a second target inside it
   would undo an approved criterion.
2. **WHY-AC-10** — a pre-0055 run states that the reasoning was not recorded, rather than
   reconstructing anything from the deleted scoring model's columns.
3. **§11, GST** — no money at all on this surface.
4. **§11, multiple runs** — the most recent selection run for the opening is the one
   shown; earlier runs are not listed.
5. **WHY-AC-9** — where figures were never captured, the panel says so rather than falling
   back to a display-time catalogue read. The only reading compatible with D3.
6. *(retired — D7 answered it: the capture extends to the customer save path.)*
7. **WHY-AC-44** — "Change the product" lives in the detail's footer only, so lines with
   no detail have no such control until the real editor ships.
8. **SNAP-AC-12** — figures live in the line's existing `configuration_snapshot_json`
   rather than in new columns; the architect may rule otherwise, and any migration follows
   `d1-migration-safety`.
9. **§7.4, last two rows** — R22 is applied to the estimator's own line-creating writers
   (`ai/proposal.ts`, `composite.ts`) as well. Redundant with `candidate_result` for
   machine picks, but it is what "every save" says, and it lets the display read one place
   (SNAP-AC-3) instead of two.
10. **WHY-AC-28** — on an overridden line, R6's three labels are kept and only the
    "Chosen" line's sentence changes (a person chose this; the platform had recommended X).
    The full comparison lives in the detail, so the panel's line budget is not breached.

---

## 14. Decisions needed

**None.** All seven owner decisions and rulings R22–R24 are folded in; every remaining
judgement is registered in §13 as an `ASSUMED:` that can be vetoed at acceptance. Ready
for the architect.
