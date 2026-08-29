# Plan-parse enrichment — specification (v2)

**Stage 1 of the feature pipeline, v1 (a person orchestrates; there is no conductor script for this
feature).**

**Stage 0 was run.** `docs/runs/plan-parse-method/00-ask.md` (re-grilled with the owner 2026-08-29)
is the binding input, together with `DECISIONS.md` (D-1…D-4). Everything in this document is
downstream of those two. Where this document says something they do not, it is marked either
**decided here** (§10) or **`ASSUMED:`** (§11) — never buried.

**Inputs treated as settled and not reopened**

| Document | Standing |
|---|---|
| `docs/runs/plan-parse-method/00-ask.md` | **Binding.** Primary input. |
| `docs/runs/plan-parse-method/DECISIONS.md` | **Binding.** D-1…D-4, the owner's. |
| `docs/estimator/plan-parse-output-spec.md` | The output contract — five fields, three states. |
| `docs/estimator/drawing-parse-design.md` §1 | Route decision: the model reads the drawings; geometry corroborates. |
| `docs/adr/0015-pass-a-names-nothing-the-floor-plan-places.md` | Accepted. |
| `CONTEXT.md` — *Drawing reading*, *Drawing enrichment*, *Architectural priority*, *Thermal priority*, *Crop evidence* | The vocabulary this spec uses. |

**Read for reasoning only, never as instruction:** `docs/runs/plan-parse-method/01-spec.md` and
`02-design.md` (archived), and `docs/runs/plan-parse/01-spec.md` (the pre-revert Phase-1 spec — its
abuse cases and edge cases are re-derived here in owner-checkable form; its Pass A/B machinery is
not).

**How to read the acceptance criteria.** The owner judges this feature the way he said he would:
*"My input is plans file, and I compare that to outputs of the system — schedule must match,
dimensions, splits, types, orientations must match."* Every criterion below is therefore written as
something observable from a plan set going in and an output coming out — a screen, a stored value, a
run report line, a denial. None of them names a coordinate space, a pass, a container call or a
prompt version. **How** those outcomes are achieved is the architect's document, not this one, with
one exception: §5.2, where the method's own steps must be *visible in the run report*, because the
single cause of the previous failure was silent divergence from the method and no other check
catches it.

**Sizing.** One feature, one concern, one reference set, one gate. It does not need `wayfinder`.

---

## 1. Problem statement

The schedule parser works and is authoritative. It returns every opening with its tag, its size, its
product type and a default split where one is needed — 19 rows, zero warnings, on the reference set.

What it cannot return is what is only in the drawings: how each opening actually **divides**, which
way it **faces**, which **elevation** it is drawn on, and which **room** it serves. Absent those, an
opening with no stated composition is built as N equal units of one family — W1 (2050 × 2100,
`OFFSET AWNING`) ships as `awning 1025 | awning 1025`, two windows where the builder's drawing shows
one awning and a sheet of glass beside it. Wrong make-up, wrong price, and a handedness that was not
unknown but *invented*, because the default always puts the operating unit first. On the reference
set the drawings state a composition in words for exactly one opening of 19; the other 18 are
guessed.

Orientation has the same shape of loss on the thermal side: with no orientation, an opening gets a
Uw cap only and no solar-gain cap, so the glazing filter is weaker than the drawings would allow it
to be.

**The business value is one sentence, the owner's:** *"better accuracy" simply stands for "higher
estimate accuracy"*. The customer never sees the enrichment. They see openings, dimensions and the
product selected — chosen better.

**The failure this specification exists to prevent is not a bug.** The previous attempt was reverted
because it substituted its own architecture for a method that had already been proven to 100% by
hand, one defensible step at a time, and nothing in the process could see it happening. §3 and §5.2
exist for that and nothing else.

---

## 2. Scope

### 2.1 In scope

- **The enrichment pass**: for each opening the schedule already found, read from the plans —
  1. **Split** — the ordered units the opening is built from, each *operating* or *fixed*, each with
     its share of the opening, plus a printed unit dimension where the sheet prints one, plus
     whether the division is side-by-side or stacked.
  2. **Orientation** — the compass value the wall faces (`N NE E SE S SW W NW`).
  3. **Elevation** — which elevation of the set the opening is drawn on.
  4. **Room** — the room label the plan gives it.
- **Three states for every one of those fields**, never collapsed: a value, *not stated* (the drawing
  is readable and does not say), *not read* (we could not tell). Output spec §4.
- **Page-kind establishment inside each uploaded file** (00-ask §7) — an energy report may carry
  plans, so which pages are plans, elevations, schedule or report is established per file before
  either priority ladder is applied.
- **The two priority ladders** (00-ask §6) applied where this feature touches them: architectural
  facts and thermal facts have different sources of truth.
- **Progress the customer watches** — per opening, advancing on unread openings too, inside a
  ~2-minute budget, with a partial-failure message that asks nothing of them.
- **`AI_EXTRACTION_MODE` as the switch**: off, the schedule table and the default split carry the
  quote exactly as today.
- **The ops-visible output**: per opening, what was read, what was not, and where a reading disagrees
  with the schedule.
- **Crop evidence persisted from the first job** (`CONTEXT.md` — *Crop evidence*), retained under the
  rule §12 D-1 settles.
- **The release gate**: 19 of 19 on the reference set, judged against a label sheet the owner has
  confirmed once.

### 2.2 Out of scope — named, so absence is a decision

| Out | Why |
|---|---|
| **The deploy-unblock slice** (00-ask §4.1) | **Already shipped on `main`.** `PlanParseContainer` is a held-open stub (`worker/lib/drawing/PlanParseContainer.ts`), the `PLAN_PARSE` binding and the `v1` migration are in `wrangler.jsonc:55-62`, and no `containers` block is declared. Nothing here re-does it. |
| Re-deriving the openings list | The schedule parser is authoritative for what openings exist and what they measure. This pass enriches that list; it never rebuilds it. |
| A crop viewer in the ops console | The owner checks readings against his own plan set, which he has. A viewer is a convenience over an existing capability. Crops are still stored from job one so the viewer, and the labelling campaign it enables, can be built later against real evidence. `ASSUMED:` §11-A. |
| Generalising to other drafters' label conventions | DECISIONS.md, taken on the PM's recommendation: a set with no recognised elevation labels reports that it has none. The second real plan set is what says what the second convention is. |
| OCR of scanned/raster-only sets | The method's own step 2 stops on a scanned set and names the gap. Making it read one is a different effort. |
| Removing or weakening the human review gate | Every drawing-derived composite still lands in technical review. Changing that has its own evidence bar. |
| Thermal certification | The platform uses target Uw and solar gain for **product selection**. It is not becoming certification software (00-ask §6). |
| New customer-facing surfaces | The enrichment is invisible to the customer except as a progress counter and a better-chosen product. |

---

## 3. Binding requirements

These are not acceptance criteria; they are the constraints every criterion is written under. They
come from `00-ask.md` and are restated so a reader who has only this document cannot get them wrong.

**R1 — the method is the six documented steps, unmodified** (00-ask §3). Inventory → strategy → text
→ select pages → render and crop → read, in that order, reproducing the same commands and libraries
rather than approximating them. *A requirement, a design or a build that substitutes an equivalent
for a documented step is wrong, however well it performs.* Steps 5 and 6 — render and crop, then one
vision call per opening against its own crop with the schedule row as context — are part of the
method, not machinery grown around it.

**R2 — the architectural priority ladder** (00-ask §6). For size, splits and types: **plans**, then
the **energy report** where no plans exist, then the **schedule table**. Plans are a binding build
contract.

**R3 — the thermal priority ladder** (00-ask §6). For target Uw and solar gain: the **energy
report**, then values **calculated** by the platform's thermal modelling — *advisory, not
authoritative* — then **system defaults from the project's location** (Melbourne only for the MVP).
Ops sees **one** value and how the offered product matches it, never a set of competing ones.

**R4 — a confident wrong answer is the only unacceptable outcome.** At both bars. *"Could not read
this"* is a first-class answer and must stay easy for the model to give; a vision model fails
silently where geometry fails loudly, and that asymmetry is the whole risk of the chosen route.

**R5 — a conflict is represented, never silently resolved.** Existing house rule. Where two sources
disagree, the reviewer is told; nothing is quietly rewritten to agree.

**R6 — the customer's journey is never blocked by this.** A parse failure of any kind still lets the
customer submit; a human reviews; the fallback carries the estimate as it does today.

---

## 4. Actors and needs

Carried from the grill (`00-ask.md` §2), which is the primary source, and extended only with the
owner's own recorded words. No demographics, no names, no backstory.

**Customer** — the canonical actor in `CONTEXT.md`. Uploads a plan set and expects a quote.

> *"I uploaded my architect's plans and I want the quote to match what's drawn. While it's working I
> want to see it's still working and roughly how far through it is. Don't ask me for something I
> can't give — I don't have a different set of drawings, and I can't tell you how window 7 divides;
> that's why I sent you the plans."*

Evidence: 00-ask §1 (the customer never sees the enrichment — they see openings, dimensions and the
product selected), §9 (the owner's own stage wording, *uploading file → reading schedule (19 found) →
reading openings (n of 19) → matching products*, and his ruling that a partial-failure message *"must
not imply there is something they must fix"*).

**Staff / the Estimator persona** — the reviewer at the human review gate. The actor the
enrichment's *output* serves.

> *"Before I issue this I need to know which openings the drawings actually told us about, which they
> didn't, and where a reading disagrees with the schedule — those are different levels of trust and I
> review them differently. And I want one thermal number per opening, not a set of competing ones."*

Evidence: 00-ask §2 (*"the reviewer who sees which openings were read, which were not, and where a
reading disagrees with the schedule"*) and §6 (*ops2 shows one value — not a set of competing ones —
and how it matches the thermal properties of the product offered*).

**Owner** — as product owner, and as the only person who can score the release gate.

> *"100% accuracy is internal target. If it is not accurate, inconsistent or even worse — misleading,
> we will not use it."* … *"My input is plans file, and I compare that to outputs of the system —
> schedule must match, dimensions, splits, types, orientations must match."*

Evidence: 00-ask §8, and the grill's closing constraint on how this spec is written.

**Manufacturer partner** — **no need. This feature must be invisible to them.** `CONTEXT.md` puts
manufacturer partners categorically outside customer data; readings and crops are fragments of a
customer's drawings. This actor appears here only as an abuse case (AB-4).

**Visitor** — **no need.** The estimator serves signed-in customers; a visitor never reaches this
path.

**No new or sharpened actor.** `CONTEXT.md` gained vocabulary from the grill, not people.

---

## 5. Acceptance criteria

**45 criteria in all:** 29 in this section (AC-1 … AC-29), 10 abuse cases in §6 (AB-1 … AB-10), and 6
bar criteria in §7 (AC-G1 … AC-G6). Each is independently verifiable and maps onto a test the
developer can write and the tester can walk. Criteria naming **REF** mean the reference plan set —
the set already used for every test run, held in R2, deliberately not in the repository (§9, gap 1).

### 5.1 What comes out — the owner's own test

**AC-1 — the target case, end to end.**
*Given* REF uploaded to a project with the enrichment on,
*When* parsing completes,
*Then* opening **W1** is quoted as an operating unit and a fixed unit side by side, in that drawn
order, and no longer as two equal awnings.

**AC-2 — the four enriched facts appear for every opening the drawings show.**
*Given* REF parsed with the enrichment on,
*When* the project's openings are inspected in the ops console,
*Then* each opening shows its split, its orientation, the elevation it was read from and its room
label — or, for any of those four, an explicit *not stated* or *not read*, never a blank that could
mean either.

**AC-3 — the two absences are told apart on the screen, not in a log.**
*Given* one opening whose sheet is readable and simply does not divide it, and one opening whose
sheet could not be read,
*When* both are inspected in the ops console,
*Then* the first reads *not stated* and the second reads *not read*, and the two are distinguishable
without opening a file or a database.

**AC-4 — sizes still come from the schedule.**
*Given* REF parsed with the enrichment on and the same project parsed with it off,
*When* the openings tables from the two runs are compared,
*Then* every opening's tag, overall width and overall height are identical between them.

**AC-5 — the units add up to the opening exactly.**
*Given* any opening the enrichment split into units,
*When* the quoted line is inspected,
*Then* the unit sizes sum to the opening's own dimension exactly, and every unit but the last lands
on the manufacturing step (5 mm by default).

**AC-6 — a printed dimension beats a measured proportion, and is never invented.**
*Given* an opening whose sheet prints a dimension against one of its units,
*When* the line is quoted,
*Then* that unit takes the printed figure;
*And given* a unit with no printed dimension, the quoted line carries no dimension claimed as printed
for it.

**AC-7 — a stacked opening is quoted stacked.**
*Given* an opening drawn as a highlight over a fixed pane,
*When* the line is quoted,
*Then* the **height** is divided between the units and the width is not.

**AC-8 — orientation reaches the product choice.**
*Given* an opening the enrichment read as facing east or west,
*When* the product is selected,
*Then* the opening carries the compass value and the cooling cap that value implies, and the ops
console shows that its thermal requirement was derived from this project's documents.

**AC-9 — a disagreement with the schedule is shown, not resolved.**
*Given* an opening the schedule types `FIXED` and the drawing shows with an operating unit,
*When* parsing completes,
*Then* the ops console shows the disagreement, naming both sides,
*And* the line is in technical review before it can be issued.

**AC-10 — nothing drawing-derived escapes human review.**
*Given* any line whose make-up came from the drawings,
*When* the quote moves toward issue,
*Then* the line has passed the existing "confirm the configuration at review" gate; there is no path
from a drawing reading to an issued quote without a person.

### 5.2 The method actually ran — visible in the run report

*These exist because the previous attempt diverged from the method silently and every other check
passed while it did. The run report already carries per-run diagnostics; it names the method's steps
too, so a person can see which one produced what.*

**AC-11 — the report names the six steps and their outcomes.**
*Given* any completed enrichment run,
*When* the run report is read,
*Then* it states, in order: what the inventory found, which strategy was chosen, that the text layer
was read, **which pages were selected and how many of how many**, how many crops were made, and how
many opening reads were attempted and returned.

**AC-12 — pages are selected before anything is rendered.**
*Given* REF (14 pages),
*When* the run report is read,
*Then* the page-selection line names the small number of pages selected, and the render count is
consistent with those pages only — the whole document was not rasterised.

**AC-13 — a scanned set stops and names the gap.**
*Given* a plan file with no text layer,
*When* it is parsed,
*Then* the run report names the strategy as scanned and stops the enrichment for that file with a
stated gap, no opening is marked read, and the quote proceeds on the schedule table (see AC-28).

**AC-14 — one read per opening, against that opening's own crop.**
*Given* a completed run on REF,
*When* the run report is read,
*Then* the number of opening reads attempted equals the number of openings the pass located, each
read names the opening it was for, and the crop it was shown is retrievable for it afterwards.

### 5.3 The two priority ladders

**AC-15 — plans win on architectural facts.**
*Given* a project with both plans and an energy report describing the same opening's make-up,
*When* the line is quoted,
*Then* the make-up — how many units, in what order, which operate, which axis — is the one the plans
show, and the disagreement with the report is shown to ops.

**AC-16 — no plans, the energy report supplies the make-up.**
*Given* a project with an energy report and no plans,
*When* the lines are quoted,
*Then* the make-up comes from the report where it states one, and from the schedule table where it
does not.

**AC-17 — the energy report always wins on thermal.**
*Given* an opening whose energy report states a target Uw and solar-gain figure, and for which the
enrichment also supplied an orientation,
*When* the opening's thermal requirement is inspected in ops,
*Then* the requirement is the report's, its basis says so, and the calculated value has not replaced
it.

**AC-18 — one thermal value, never a set.**
*Given* any opening in the ops console,
*When* its thermal requirement is inspected,
*Then* exactly one target is shown, with where it came from, and how the offered product matches it —
not a list of competing values from different sources.

**AC-19 — no report, no orientation: the location default carries it.**
*Given* an opening with no energy-report figure and no orientation read from the plans,
*When* its thermal requirement is inspected,
*Then* it shows the system default for the project's location, marked as a default rather than as
something derived from this project.

### 5.4 Bundled files and page kinds

**AC-20 — a file labelled "energy report" that contains plans is read as both.**
*Given* one uploaded file the platform labelled an energy report, whose later pages are floor plans
and elevations,
*When* it is parsed,
*Then* the enrichment reads those pages as plans, the report pages are still read as a report, and
the run report names which pages were treated as which.

**AC-21 — a file's label never decides its pages by itself.**
*Given* a plan set that also contains the window schedule on one page,
*When* it is parsed,
*Then* the schedule page is still read as the schedule and the drawing pages as drawings; no page is
made invisible by the file-level label.

### 5.5 Progress the customer watches

**AC-22 — the counter is per opening and it moves.**
*Given* a customer who has uploaded REF and is watching the progress panel,
*When* the enrichment is running,
*Then* they see the openings counted through — "reading openings, n of 19" — advancing as openings
complete, after the schedule step reported how many were found.

**AC-23 — the counter advances on openings that come back unread.**
*Given* a project of 20 openings of which 5 could not be read,
*When* parsing completes,
*Then* the counter reached 20 of 20; the denominator was never shortened and the counter never
stalled on an opening that failed.

**AC-24 — the whole thing fits inside two minutes on REF, and the wall time is recorded.**
*Given* REF,
*When* the enrichment runs end to end,
*Then* it completes inside **120 seconds** and the run report records the wall time, the number of
model calls and the number of container calls. *Recorded target, from `DECISIONS.md`: 90 s.*

**AC-25 — a partial failure asks nothing of the customer.**
*Given* a run in which some openings could not be read,
*When* the customer's screen and the response behind it are inspected,
*Then* neither contains a count of unread openings, a list of them, an error state, or any suggestion
that the customer should upload, check or fix anything;
*And* the openings that were read are still applied.

**AC-26 — a real failure is still reported as a failure.**
*Given* an unreadable upload or an unavailable service,
*When* parsing fails,
*Then* the customer is told exactly as they are today — the "successes only" rule covers *not read*
openings, never errors.

### 5.6 The switch, and never blocking the customer

**AC-27 — off is exactly today.**
*Given* `AI_EXTRACTION_MODE` set to its off value,
*When* REF is parsed,
*Then* the resulting quote — every line's product, dimensions, split and price — is identical to a
run from before this feature existed, and no plan-reading model call or container call is made.

**AC-28 — a parse failure never stops a submission.**
*Given* a project whose enrichment failed completely — corrupted file, unrecognised drawing format,
model unavailable,
*When* the customer proceeds,
*Then* they can still submit the quote, it reaches human review, and every line carries the schedule
table's own answer with the default split.

**AC-29 — an opening that was not read costs nothing.**
*Given* an opening whose composition was not read,
*When* its line is compared with the same line from a run where the enrichment did not happen at all,
*Then* the product, dimensions, split and price are identical.

---

## 6. Abuse-case criteria — the forbidden actions that must fail

This feature reads customer drawings, sends fragments of them to a model, and stores those fragments
at rest. The tester executes each of these for real and records the denial. **Security posture is
stated in §8.**

**AB-1 — one customer cannot see another's parse.**
*Given* customer A signed in and customer B's project id,
*When* A asks for that project's parse progress or its openings,
*Then* the response contains nothing belonging to B, and the supplied project id is never used as the
lookup key in place of A's own session-resolved project.

**AB-2 — a customer cannot reach a crop.**
*Given* a signed-in customer and any identifier for a crop of their **own** project,
*When* they attempt to fetch it through any route the Worker serves,
*Then* no crop bytes are returned. *In this scope no route serves crop bytes at all; the criterion is
verified by enumerating the Worker's routes and finding none.*

**AB-3 — a guest grant cannot reach a crop or a reading.**
*Given* a guest-grant session on a project that has crops,
*When* the project's files and downloads are enumerated through that grant,
*Then* no crop object and no reading is listed or reachable.
*Rationale: the guest-OTP weakness is ticketed HIGH and already reaches customer files. This feature
must not widen what that grant reaches.*

**AB-4 — a manufacturer partner cannot reach readings or crops.**
*Given* an authenticated manufacturer-partner session,
*When* it requests a project's readings or any crop,
*Then* it is denied by the staff predicate — being an authenticated partner is not sufficient — and
no bytes are returned.

**AB-5 — the container is reachable only through its binding.**
*Given* the deployed Worker configuration,
*When* it is inspected,
*Then* no route, service binding or hostname reaches the plan-parse container, and it holds no R2
binding, no D1 binding, no model key and no shared secret.

**AB-6 — a hostile document cannot make the renderer run unboundedly.**
*Given* a request for an unreasonable number of crops, an unreasonable scale, or an oversized body,
*When* it is made,
*Then* it is refused with a stable failure code before any rendering, and the Worker refuses it
first.

**AB-7 — instructions printed in a drawing cannot choose a product or a price.**
*Given* a plan sheet whose text tells the model to report six sliding units, or names a product, or
names a price,
*When* the reading is validated,
*Then* the output is still limited to what the contract allows — units that operate or do not, their
order, their shares, the axis, an orientation, an elevation, a room — no family name, no price, no
unit dimension the sheet did not print;
*And* the resulting composite still lands in technical review.
*Residual risk, named and accepted: a poisoned proportion inside the plausible range survives to
review. The human review gate is the control.*

**AB-8 — nothing sensitive is logged by value.**
*Given* a complete run, including a failing one,
*When* Worker and container logs are inspected,
*Then* they contain no filename, no drawing text, no model output and no crop bytes — identifiers and
hashes only.

**AB-9 — no committed fixture carries title-block content, and a test says so.**
*Given* the repository,
*When* the test suite runs,
*Then* it fails if any committed file under the drawing test fixtures contains a client name, a site
address or a project number derived from a customer's drawings, and it fails if crop output is
committed;
*And* that protection is asserted by the test, not only by a `.gitignore`.
*Rationale: three window-elevation crops were purged from history on 2026-08-28 (#26, #27) after a
nested `.gitignore` was deleted with its directory. A rule that a deletion can silently remove is not
a control.*

**AB-10 — repeated parses cannot burn the model budget.**
*Given* a customer submitting the same project for parsing repeatedly,
*When* the existing quota and rate limits are exercised,
*Then* further runs are refused before any vision call is made.

---

## 7. The two bars — they are not the same bar

### 7.1 Release bar — internal, judged by the owner

**Precondition, and it does not exist yet (§9, gap 2).** The label sheet: for each of REF's 19
openings, the elevation it is drawn on (or *"not drawn on any elevation"*), its left-to-right
position on that elevation, its true composition, its orientation and its room. The tester assembles
it; **the owner confirms it once, before the gate is scored.** A gate scored against an unconfirmed
truth table measures agreement with ourselves.

**AC-G1 — 19 of 19.**
*Given* the confirmed label sheet,
*When* REF is parsed with the enrichment on,
*Then* every one of the 19 openings has its split, orientation, elevation and room read correctly.
*Below that it does not ship.*

**AC-G2 — zero wrong, absolutely.**
*Given* the same run,
*When* each reading is compared with the label sheet,
*Then* the number of readings that contradict it — different unit count, different order of operating
and fixed units, a different axis, a different elevation, a different orientation — is **zero**.
*A confident wrong answer fails the gate even if the coverage number is met.*

**AC-G3 — if fewer than 19 are drawn, the owner is told in those words.**
*Given* the label sheet establishes that some opening is not drawn on any elevation,
*When* the gate is reported,
*Then* it says so plainly and the bar is not quietly relaxed to fit. D-1's consequence, unchanged.

**AC-G4 — the gate is re-runnable.**
*Given* the confirmed label sheet and REF,
*When* the gate is run again after any change,
*Then* it produces the same per-opening comparison without a person re-deriving the truth.

### 7.2 Runtime bar — the customer

**AC-G5 — a parse failure never stops the journey.** Restated here because it is a bar, not a
feature; executed as AC-28 and AC-26. Corrupted file, unseen format, model failure — the customer
still submits, a human reviews, the fallback carries the estimate as it does today.

**AC-G6 — "could not read this" stays a first-class answer at runtime.**
*Given* an opening the model is unsure of,
*When* the reading is recorded,
*Then* a decline is accepted and recorded as *not read* with its reason, no composition is invented,
and nothing throws.

**It is a switch, not a release decision.** If the gate is not met, `AI_EXTRACTION_MODE` is turned
off and the schedule table carries the quote exactly as today — a minute's work, not a revert.

---

## 8. Security posture — stated, not assumed

**Data classification.** A plan set is customer data. A crop is a fragment of a customer's drawings
and therefore the same classification: **staff-only, manufacturer partners categorically excluded,
audit-logged on access, never on a customer-facing surface** (`CONTEXT.md` — *Crop evidence*). A
title block additionally carries a client name, a site address and a project number: identifying
information about a third party who is not our customer.

**Trust boundaries.** Three, and each has a criterion above:

1. **Upload → parse.** The document is untrusted input. Text printed in it may be adversarial (AB-7).
2. **Worker → container.** The container renders and crops and holds no credentials; it is reachable
   only through its Durable Object binding, never a route or a hostname (AB-5, AB-6).
3. **Model → platform.** Model output is untrusted and is **refused, never repaired**. Anything
   outside the contract is a *not read*, not a best-effort value (AB-7, AC-G6).

**Repository hygiene.** No customer-derived image is committed, ever. Any derived fixture — the label
sheet included — carries opening tags, elevations, compositions, orientations and rooms, and **no**
client name, site address, project number or original filename. Enforced by AB-9 rather than by an
ignore rule.

**Known exposure, flagged not fixed.** The reference set's filename, which contains a site address,
already appears in committed documentation (`DECISIONS.md`, the archived spec). This spec refers to
it as **REF** and no new artifact repeats it. Purging it from history again is the owner's call and
is not proposed here; the recommended action is to stop the spread.

**Retention.** Crops live at rest in R2. §12 D-1 puts the retention rule to the owner.

---

## 9. Known gaps inherited — and what each means for the criteria

From `00-ask.md` §11. Each is stated with its consequence rather than assumed away.

1. **The reference PDF is not in the repository, by design.** Consequence: every criterion naming REF
   is executed by a person with access to the R2 object, not by CI. The gate (§7.1) is *walked*, and
   the tester records the evidence. No criterion here assumes an automated REF run, and no fixture
   derived from REF may be committed except under AB-9's rule.
2. **`labels.json` does not exist.** Consequence: **§7.1 cannot be scored until it does and until the
   owner confirms it.** It is a precondition, listed as such, and the pipeline must not report a
   verdict on the release gate before it exists. Nothing else in §5 depends on it.
3. **Orientation is in scope.** Consequence: it appears in AC-2, AC-8, AC-19 and the gate. The
   archived spec's exclusion of it does not apply.
4. **Two dangling references in the archived spec.** Consequence: none here. The archived documents
   are not inputs to the build.
5. **The container source is reverted** (recoverable from `a1162db1`). Consequence: no criterion
   assumes it is present. Whether it is recovered or rewritten — and whether it is Python or Node —
   is the architect's call under 00-ask §5, with the owner's tie-break recorded: *reuse the stack, but
   not at the expense of results.* R1 binds either way, and §7.1 is what says whether a substitution
   reproduced the step.

---

## 10. Decided here — not the owner's, recorded so nobody re-derives them

1. **The schedule keeps the sizes.** The enrichment divides an opening; it does not restate how big
   the opening is. A drawn overall dimension disagreeing with the schedule is a disagreement shown to
   ops (AC-9's channel), not an overwrite. `ASSUMED:` §11-B, because R2 could be read the other way.
2. **The drawing says *operates* or *does not*; the schedule names the family.** A drawing shows an
   operating symbol, not a product family. The drawing therefore decides which units operate and in
   what order (R2 — plans win on types, at the granularity a drawing can support) and the schedule
   names what an operating unit is. A model that returns a family name is refused, not downgraded.
3. **A locating failure is *not read*, never *not stated*.** *Not stated* means the drawing was read
   and does not say.
4. **An opening the pass cannot place is not matched against the rest of the set as a fallback.**
   That would restore the whole-set proportion matching the method replaced (ADR 0015).
5. **The unit of failure is the opening, never the document.** A set with two unreadable sheets still
   delivers every opening it could read.
6. **The label sheet is a precondition of the gate, not an output of it.**
7. **The run report is the method's visibility** (§5.2). It is an extension of the per-run
   diagnostics that already exist, not a new surface.

---

## 11. `ASSUMED:` tags — all vetoable

**`ASSUMED:` §11-A — no crop viewer in this effort.** Crops are stored from job one; nothing renders
them yet. The owner scores the gate against his own plan set, which he has. If he would rather check
readings against the exact pixels the model saw, this becomes a small ops-console addition and the
abuse criteria AB-2/AB-4 gain a route to be tested against.

**`ASSUMED:` §11-B — the schedule keeps the overall sizes** (§10.1). R2 says plans win on size; this
spec applies that to *how an opening divides* and not to *how big it is*, because 00-ask §1 makes the
schedule's openings table the authoritative input this feature enriches. A measured dimension from a
vision model overwriting a stated schedule size is the highest-consequence version of the confident
wrong answer R4 forbids. Vetoable in one line if the owner wants plans to win on overall size too.

**`ASSUMED:` §11-C — 120 seconds is the gate, 90 seconds is the target.** 00-ask §9 says anything
inside two minutes is acceptable provided the counter moves; `DECISIONS.md` records 90 s for the read
on REF. AC-24 gates the larger number and records the smaller.

---

## 12. Decisions needed

**D-1 — How long do we keep the crops?**
Crops are fragments of a customer's drawings at rest in R2, and this feature starts producing them on
every parsed job. Retention was raised before this effort and has never been answered.
*Recommendation:* **crops live and die with the project's files** — deleted when the customer's
documents are, no separate lifetime. If a crop is ever wanted as a labelling fixture, it is copied
deliberately at that moment: review evidence and a training corpus are different retentions and must
not share a default. The consequence of choosing this is one ticket for the R2 prefix cleanup, which
is already missing for other stage archives.

---

## 13. Edge cases

| Case | Required behaviour | Criterion |
|---|---|---|
| A readable sheet that simply does not divide the opening | *Not stated* — a truthful answer, distinct from *not read* | AC-3 |
| A single-unit opening (e.g. `FIXED`) | A composition of one unit is a valid reading, not a decline; the line is not split | AC-2, AC-29 |
| A stacked opening (highlight over a fixed pane) | The height divides, not the width | AC-7 |
| An opening whose size is not a multiple of the manufacturing step | The last unit absorbs the remainder; the partition is still exact | AC-5 |
| Two openings of identical size on one elevation | Each takes the one the drawings place there, or both are refused — in no case does one take the other's | AC-G2 |
| An opening the schedule lists that no elevation draws | *Not read*, naming that it is not drawn; never matched elsewhere | AC-2, AC-G3 |
| Elevation labels in a form this set does not recognise | The run report says no elevation labels were recognised; every opening is *not read*; the quote proceeds | AC-13's shape, §2.2 |
| A page that is both a floor plan and an elevation sheet | Used in both roles; page kinds are not exclusive | AC-21 |
| An energy report with plans bundled inside it | Both kinds read from the one file | AC-20 |
| A project with plans and no energy report | Thermal falls to the calculated value (advisory) and then the location default | AC-18, AC-19 |
| The enrichment is switched off mid-flight | Runs already started finish or are abandoned harmlessly; no quote is left half-enriched and no line is silently rewritten later | AC-27, AC-29 |
| A customer edits a drawing-derived composite | Their edit stands, as with any AI-proposed line; the reading is not re-applied over it | AC-29's precedent |
| **GST inc/ex display** | **No new customer-facing price surface exists.** The composite prices through the existing line, which already respects the account's ex/inc mode. A drawing-derived split must not introduce a second price display | AC-27, AC-29 |
| **Quote lifecycle** | The enrichment runs at parse time into a **draft**. A drawing-derived composite lands in technical review like every other proposed composite. Nothing here touches an issued, accepted or later quote, and no later phase triggers a re-read | AC-10 |
| **Offerability** | Unchanged. A reading proposes a *make-up*, never a product; the offerability gate still decides what may be sold | — |
| **Delivery zones** | Untouched. Opening area comes from the line's own dimensions, which the drawings never overwrite | AC-4 |
| A project in a terminal state | No crop is written for it | AB-2's storage rule |
| An opening whose leaves are genuinely different operable families (awning beside casement) | Cannot be told apart — the schedule states one type. A review flag, never a silent guess. **A named limitation, not a silent descope**; nothing in REF does it, so no criterion covers it | — |

---

## 14. What "done" means

The platform reads each opening's split, orientation, elevation and room from the customer's plans,
feeds them into the split and the product selection it already builds, and a reviewer can see which
openings the drawings told us about, which they did not, and where a reading disagrees with the
schedule — with the evidence retained. The customer sees a counter that moves and a better-chosen
product, and never a request for something they cannot give.

Concretely: **AC-1 … AC-29 and AB-1 … AB-10 met**, and **AC-G1 … AC-G6 walked once on REF against a
label sheet the owner has confirmed**.

Explicitly not done, and not pretending to be: the crop viewer, the labelling campaign beyond REF,
generalisation to other drafters' conventions, OCR of scanned sets, and any relaxation of the human
review gate.
