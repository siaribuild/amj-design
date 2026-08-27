# Plan parse — reading how an opening divides

**Status:** spec for owner review. Written retrospectively, after the design (`docs/estimator/drawing-parse-design.md`, Part I) and the build slice (`02-tasks.json`) already existed. It closes one gap: **there were no acceptance criteria anywhere for this effort**, so the tester had nothing to execute.

**Stage-0 grill: NOT RUN as a recorded artifact.** There is no `docs/runs/plan-parse/00-ask.md`. Per `CLAUDE.md` this must be said out loud rather than papered over. The actors-and-needs section below is therefore assembled from *evidence that exists* — the canonical actors in `CONTEXT.md`, the owner rulings recorded verbatim in the design (§1, §5, §6, §7.2, §7.3, §14) and in ADR 0013, and the behaviour of the shipped code — **not** from an interactive grill. Where a need could not be evidenced it appears as a question in "Decisions needed", never as a persona.

**Inputs, treated as settled:**
- `docs/estimator/plan-parse-output-spec.md` — the output contract.
- `docs/estimator/drawing-parse-design.md` **Part I only**. Part II is the record and overrides nothing.
- `docs/adr/0013-drawing-read-vision-primary-container-renders.md`.
- `docs/runs/plan-parse/02-tasks.json` — 8 slices, t1…t8.

---

## 1. Problem statement

An opening whose composition nothing states is built as **N equal units**. `proposeSplit` (`worker/lib/estimator/split.ts:511-531`) divides the width into the fewest equal parts that each fit the product's maximum width, and every unit takes the same family. W1 — 2050 × 2100, `OFFSET AWNING` — becomes `awning 1025 | awning 1025`: two windows where the manufacturer builds one awning and a sheet of glass beside it. Wrong product, wrong price, and the handedness (which side opens) is not merely unknown — it is *invented*, because the default always puts the opening unit first.

The composition is in the customer's drawings. Nobody reads them. This effort makes the platform read them, per opening, and feed what it reads into the split it already knows how to build.

**The scale of the loss, from the reference set:** 19 openings on one two-storey house. The reference document states a composition in words for exactly one of them (W4). The other 18 are guessed today.

## 2. In scope / out of scope

### In scope (this effort — the Phase 1 increment, §9)

- Locating each scheduled opening on an elevation, and reading how it divides: ordered units, each `operable`-or-not, its share of the opening, and the division axis. Output spec §1.2 and §1.3.
- Dimension agreement between the drawing and the schedule as a surfaced disagreement. Output spec §2.2.
- Crop evidence per reading, persisted. Output spec §5.
- The three states — a value, `not stated`, `not read` — kept distinct end to end. Output spec §4.
- The drawing-derived split as a new `SplitHint` **source** and a new `ProposedSplit` **basis**, ranking above the schedule comment and the energy report for shape only.
- A customer-visible progress counter, "reading opening N of M".
- **Provenance a reviewer can read**, on the two staff surfaces that already exist: the composite review warning (`worker/lib/estimator/estimate.ts:407-417` → the submission reconciliation note, `worker/routes/quote.ts:51-74`) and the "Why this product?" unit basis label (`src/ops2/projects/whyCopy.ts:55-68`). See §9 for why this, and not the new panel, is the shipping bar.
- The Worker→container transport as a Durable Object binding with no public reachability.

### Out of scope (named, so absence is a decision and not an oversight)

| Out | Why |
|---|---|
| `wallOrientation` (output spec §1.4) | Design §4.6 — a separate workstream, one determination per building, different consumer (`computeDefaultBand`). Nothing here builds it or blocks on it. |
| `roomLabel` (output spec §2.1) | No task produces it; it is "useful, never worth blocking on". It stays as the schedule supplies it today. |
| The geometric second opinion (verification check 2, t7) | Design §4.4 already rules it ships after the primary path; checks 1 and 3 plus the review gate hold the line. |
| The ops readings panel + crop-streaming route (t8) | Phase 2. See the scope ruling, §9. |
| OCR for scanned/raster sets | Design §7.3 — explicitly not in this plan's scope. `GeometryGap = "raster_page"` stays a recorded gap. |
| Removing the human review gate | Design §14 open item 1 and ADR 0013 §4 — a separate decision with its own evidence bar, never implied by shipping. |
| Retuning `refineOperable` / `apexMeans` / the symbol-profile machinery | Design §5 — unreferenced in v1, deliberately left uncorrected. |
| Changing what a `not read` opening produces | It keeps today's fallback exactly. Any change to the even split's own behaviour is a different effort. |

## 3. Actors and needs

Canonical actors per `CONTEXT.md`. Each need is stated in the actor's terms, with the evidence it rests on.

**Customer** (a trade builder uploading a plan set — "Customer" per `CONTEXT.md`; the builder/tradie split is an account attribute, not a different actor).
> *"I uploaded my architect's plans. I want the quote to match what's drawn, not a machine's guess at it. While it's working I want to know it's still working and roughly how far through it is. Don't ask me for things I can't give — I don't have a different set of drawings, and I can't tell you how window 7 divides; that's why I sent you the plans."*

Evidence: owner rulings, design §7.1 (the customer waits on screen and must be told what is happening), §7.2 (successes accrue against the real count; **nothing** about openings that could not be read; **no invitation** to supply more, because they cannot supply it). The last sentence is the owner's own reasoning, recorded verbatim in §7.2: *"it asks for something they cannot give."*

**Staff** (an OpenFrame operator at the human review gate — the *Estimator persona* performed by an owner today).
> *"Before I issue this quote I need to know which lines the drawings actually told us about and which the platform made up, because those are different levels of trust and I review them differently. If the reading disagrees with the schedule I want to be told, not to have it silently resolved for me. And I want to be able to check a reading against what's on the sheet."*

Evidence: owner ruling, design §7.3 (*"The provenance a reviewer needs — this composition came from the drawing versus this is the default split — belongs on the ops line, and so does every unread and every disagreement"*) and §7.2 (*"Do not assume the reads are right… ops sees gaps AND disagreements"*). The existing product already serves the last clause partially — staff can download the plan set (`worker/routes/ops.ts:2274`) — which is why the crop viewer is a convenience over an existing capability and the provenance label is not (§9).

**Manufacturer partner.**
> No need. This feature must be invisible to them.

Evidence: `CONTEXT.md` — manufacturer partners are "excluded from customer data" categorically. Crops and readings are fragments of a customer's drawings. This actor appears in this spec only as an abuse case (AC-N4).

**Visitor.**
> No need. The AI estimator serves signed-in Customers only (`CONTEXT.md`); a Visitor never reaches this path.

## 4. Decisions carried in — settled, not reopened here

From the owner, recorded in the design and ADR 0013:

1. A vision model reads the drawings; the geometric decoder is a corroborating second opinion (§1, ADR 0013 §1).
2. The container renders and crops; the Worker reads, verifies, decides, and holds every credential (§3, ADR 0013 §2).
3. Untrusted model output is **refused, never repaired** (§9.2.5, ADR 0013 §3).
4. The drawing claims `operable` or `not operable`, **never a family**. The schedule names the family (§5).
5. A **stated** width beats a **measured** ratio; the drawing wins shape, order, count and axis (§6).
6. Progress shows successes accruing against the **real** opening count; the customer is shown **nothing** about unreads and is **never invited** to supply more detail (§7.1, §7.2).
7. `not read` is ordinary, not an error. Partial plan uploads are normal; the schedule is authoritative and the drawings contribute detail (§7.2).
8. Gaps **and** verification disagreements surface to **ops**, never to the customer (§7.2, §7.3).
9. Release bar, split in two: a **WRONG** reading is a release blocker at zero; an **ABSENT** reading is measured and reported, not gated (§8, ADR 0013 §4).

---

## 5. Acceptance criteria

Every criterion is Given–When–Then and maps onto a test in the design's §13 test plan. The slice column names the `02-tasks.json` task that must make it true; a criterion with no slice is a defect in the slice, not in the spec, and is called out in §12.

### 5.1 Reading a composition (t2, t3)

**AC-1 — the target case, end to end.**
Given the reference plan set (job 20016) and its schedule row `W1 · OFFSET AWNING · 2050 × 2100 · no comment`,
When the drawing read runs over that project,
Then W1's reading is `divisionAxis: "vertical"` with two ordered units — the first `operable`, the second not — with ratios summing to 1.000 ± 0.001 and the operable unit's ratio between 0.30 and 0.40,
And no unit in the reading carries a family name.

**AC-2 — the model may decline, and declining is a first-class answer.**
Given an opening crop the model reports it cannot read,
When the `openingComposition` skill's output is validated,
Then the result is accepted as a decline carrying a reason, no composition is produced, and no exception is thrown.

**AC-3 — `not stated` and `not read` never collapse.**
Given a decline whose reason is *"the drawing is legible and does not show this opening's make-up"*,
When the reading is recorded,
Then its state is `not_stated`;
And given a decline whose reason is *illegible / occluded / wrong view*, the state is `not_read`;
And a consumer reading the two states can distinguish them without inspecting free text.

> `ASSUMED:` the decline schema carries a reason enum that separates these two, because t2 as written offers only `{unreadable: true, reason}` — a single shape from which t3's "not_stated and not_read remain distinct end to end" cannot be satisfied. See §12, defect 2.

**AC-4 — a family name is never accepted from the model.**
Given a model response whose unit names a family (`"awning"`, `"hopper"`, `"casement"`),
When the response is validated,
Then validation refuses it and the opening is `not_read` — it is not silently downgraded to `operable`.

**AC-5 — ratios are bounded.**
Given a model response whose unit ratios are outside 0..1, or do not sum to 1 within tolerance,
When the response is validated,
Then validation refuses it and the opening is `not_read`.

**AC-6 — a printed width is reported only when the sheet prints it.**
Given an opening whose sheet prints a dimension against one unit,
When the reading is produced,
Then that unit carries `widthMm` **and** its `ratio`;
And given a unit with no printed dimension, `widthMm` is absent — never back-calculated from the ratio.

### 5.2 Locating an opening (t3)

**AC-7 — two signals must agree.**
Given a schedule row for which the elevation signal and the drawn-size signal point at different boxes,
When Pass B assigns rows to boxes,
Then that row is `not_read` and no crop is requested for it.

**AC-8 — one box, two rows: both lose.**
Given W14 and W16, both 2050 × 2000, and exactly one frame of that size found across the elevation sheets,
When Pass B assigns rows to boxes,
Then **both** rows are `not_read` — neither is assigned the frame.

**AC-9 — same-size pairs resolve only by order.**
Given W9 and W11, both 1810 × 1027, both visible on Elevation C, and the floor plan stating their order along the wall,
When Pass B assigns rows to boxes,
Then each row takes the box matching its tag order, and neither is `not_read`.

**AC-10 — nothing unlocated is ever read.**
Given a schedule row that Pass B did not assign to a box,
When the per-opening read stage runs,
Then no crop is requested and no vision call is made for that row, and its state is recorded as `unlocated`.

> `unlocated` is an ops-visible sub-reason of `not read`. It is never a fourth state on the output contract and never reaches a customer surface.

### 5.3 Verification (t3; check 2 is t7, Phase 2)

**AC-11 — a schedule disagreement is surfaced, never resolved.**
Given a schedule row typed `FIXED` and a reading whose only unit is `operable`,
When verification check 1 runs,
Then a disagreement record is produced naming both sides,
And the reading is neither discarded nor rewritten to agree with the schedule.

**AC-12 — a dimension disagreement is surfaced, never resolved.**
Given a drawn frame measuring 3200 × 2100 against a schedule row stating different figures,
When verification check 3 runs,
Then a disagreement record carries both figures and the schedule's dimensions remain authoritative for the line.

### 5.4 From reading to priced split (t4)

**AC-13 — a ratio partitions the opening exactly.**
Given an opening 2050 mm wide with ratios 0.634 / 0.366 and a 5 mm step,
When `proposeSplit` consumes the drawing hint,
Then the units are 1300 | 750;
And given the same ratios on a 2047 mm opening, the units are 1300 | 747;
And in both cases the units sum to the opening exactly.

**AC-14 — a stated width beats a measured ratio.**
Given W4, whose schedule comment states `600 | 2000 | 600` and whose drawing measures `615 | 1970 | 615`,
When the drawing hint and the comment are merged,
Then the unit widths are 600 | 2000 | 600 and the unit *order and count* come from the drawing.

**AC-15 — a partially stated width scales the rest.**
Given a comment stating a width for the first unit only, and a drawing showing three units,
When the hint is built,
Then the stated unit keeps its stated width and the remaining two are scaled to the remainder, partitioning exactly.

**AC-16 — a count conflict is a review flag, not arithmetic.**
Given a comment describing two units and a drawing showing three,
When the hint is built,
Then a review flag is raised naming both counts, and the comment's widths are **not** applied to the drawing's make-up.

**AC-17 — operable units take the schedule's family; passive units are fixed.**
Given a reading of `[operable, not operable]` and a schedule type of `OFFSET AWNING`,
When the hint becomes a proposal,
Then the units are `awning | fixed`, in that order.

**AC-18 — the drawings win shape over the energy report, which keeps its thermal targets.**
Given an opening with both a drawing reading and energy-report components,
When the split is proposed,
Then the layout — count, order, axis, ratios — comes from the drawing,
And the report's components still attach to those units for their thermal targets.

**AC-19 — provenance is not a lie.**
Given a split proposed from a drawing reading,
When the proposal's basis is recorded,
Then it is `drawing` — **not** `schedule_comment`;
And the composite review warning written to `quote_line.review_json` names the drawings as the source;
And the "Why this product?" unit basis renders a label for `drawing` rather than falling through to no label.

> This is the criterion the current slice cannot satisfy. See §12, defect 1.

### 5.5 The pipeline seam, progress and data (t5)

**AC-20 — a `not read` opening changes nothing.**
Given an opening whose composition was not read,
When the pipeline completes,
Then the line's product, dimensions, price and split are byte-identical to a run in which the drawing read did not happen at all.

**AC-21 — the counter is honest.**
Given a project with 20 openings of which 5 come back `not read`,
When parsing completes,
Then `drawings_total` is 20, `drawings_done` reaches 20, and the denominator was never shortened.

**AC-22 — a superseded job cannot move a live job's counter.**
Given a processing job with `processing_token` T and a superseded run holding token T′,
When the superseded run attempts to write progress counts,
Then the update matches no row and the live job's counts are unchanged.

**AC-23 — the migration is additive and rebuilds nothing.**
Given `migrations/0059_drawing_read_progress.sql`,
When it is inspected,
Then it contains exactly two `ALTER TABLE ai_job_claim ADD COLUMN` statements for nullable INTEGERs,
And it contains no `CREATE TABLE`, no `DROP`, and no change to the `progress_stage` CHECK constraint.

**AC-24 — crop evidence is stored where a reviewer can find it later.**
Given a completed reading,
When the stage run is inspected,
Then `result_r2_key` holds the validated JSON payload (the replay archive),
And the crop's own R2 key is carried in `metrics_json`,
And `evidence_items.page_no`, `sheet_ref` and `region_json` are populated for that opening.

**AC-25 — no vision call and no container call is made for an empty batch.**
Given a project where Pass B located no openings,
When the read stage runs,
Then zero container calls and zero per-opening vision calls are made, and the run completes.

**AC-26 — the per-run report exists from day one.**
Given a completed drawing read,
When the run summary is inspected,
Then it reports, per opening, `read` / `not_stated` / `not_read` / `unlocated`, which verification checks fired, the crop key, and the container/model call counts and wall times.

### 5.6 The customer surface (t6)

**AC-27 — the counter renders.**
Given a processing extraction run whose `drawingsTotal` is 20 and `drawingsDone` is 7,
When the customer views the project documents panel,
Then it reads "reading opening 7 of 20".

**AC-28 — absent counts change nothing.**
Given a processing run with null `drawingsTotal`,
When the customer views the panel,
Then today's phase label renders unchanged.

**AC-29 — the customer is told nothing about unreads.**
Given a run in which 5 of 20 openings came back `not read`,
When the customer-facing parse response, its `diagnostic` field and the rendered UI are inspected,
Then none contains a gap count, an unread list, an error state, or any invitation to supply more detail.

**AC-30 — a real failure is still a real failure.**
Given a plan file that is unreadable or a service that is down,
When parsing fails,
Then `diagnostic` reports it exactly as it does today — the "successes only" rule applies to `not read`, never to errors.

### 5.7 Transport and container (t1)

**AC-31 — the container is unreachable except through the binding.**
Given `wrangler.jsonc`,
When it is inspected,
Then `PlanParseContainer` is declared as a container with a `durable_objects` binding and a `new_sqlite_classes` migration,
And **no** `routes`, `services` or hostname entry references it.

**AC-32 — the container holds no credentials.**
Given the container's configuration and image,
When they are inspected,
Then it has no R2 binding, no D1 binding, no model key and no shared secret.

**AC-33 — the crop floor is one number in two places.**
Given `MIN_CROP_WIDTH_PX` in `worker/lib/drawing/crop.ts` and in `containers/plan-parse/render.mjs`,
When the repo test runs,
Then it fails if the two values differ.

### 5.8 The release gate (§8) — what "correct" is measured against

**AC-34 — zero wrong readings on the reference set.**
Given the reference plan set (job 20016, 19 openings) and the owner's opening-by-opening confirmation of each reading against its crop,
When every reading is classified as correct / wrong / absent,
Then the count of **wrong** readings is zero.
*A wrong reading is a release blocker. This criterion gates the release, not the merge.*

**AC-35 — absent readings are reported, not gated.**
Given the same run,
When the per-run report is read,
Then it states how many openings were `read`, `not_stated`, `not_read` and `unlocated`,
And no threshold on those numbers blocks the release.

**AC-36 — nothing drawing-derived escapes human review.**
Given a composite proposed from a drawing reading,
When the line is written,
Then its status is `technical_review` with a review warning,
And it appears in the submission reconciliation note that staff read before the quote is issued.

---

## 6. Abuse-case criteria (negative — the tester executes these for real)

This feature sends fragments of a customer's drawings to a third-party model, stores those fragments at rest, and stands up a new compute surface. Each of the following is an attempt that must fail, with the denial recorded as evidence.

**AC-N1 — customer A cannot read customer B's progress.**
Given customer A's session and customer B's project id,
When A requests the extraction run for B's project,
Then the response resolves A's own project from the session and returns no data belonging to B — the request's project id is never used as the query key.

**AC-N2 — a customer cannot pull a crop.** *(Phase 2 route, t8)*
Given a signed-in customer's session and a valid `stageRunId` for their own project,
When they call `GET /api/ops/ai/crops/:stageRunId`,
Then the response is 401/403 and no R2 object is read.

**AC-N3 — a customer cannot read the readings summary.** *(Phase 2, t8)*
Given a signed-in customer's session,
When they call `GET /api/ops/projects/:id` for their own project,
Then the response is 401/403.

**AC-N4 — a manufacturer partner cannot reach readings or crops.** *(Phase 2, t8)*
Given an authenticated manufacturer-partner session,
When it calls the readings summary and the crop route,
Then both are denied by the `isStaffUser` predicate (`worker/routes/ops.ts:109`) — `resolveStaff` alone is not sufficient — and no crop bytes are returned.

**AC-N5 — the crop route cannot be steered at an arbitrary R2 object.** *(Phase 2, t8)*
Given a staff session and a request carrying an attacker-chosen R2 key in the path, query or body,
When the crop route runs,
Then the key is read from the stage-run row only, the supplied key is ignored, and an unknown `stageRunId` returns 404 without any R2 read.

**AC-N6 — a crop access leaves an audit line.** *(Phase 2, t8)*
Given a staff member fetching a crop,
When the request completes,
Then an audit event is written naming the actor and the stage run, in the same pattern as the staff file download.

**AC-N7 — crops never appear on a customer-facing surface.**
Given a customer's file listing and the guest-grant download surface,
When they are enumerated for a project that has crops,
Then no crop object is listed or reachable through either.
*Rationale: the guest OTP weakness is ticketed HIGH and already reaches customer files; this feature must not widen what that grant reaches.*

**AC-N8 — an out-of-range region is refused, not clamped.**
Given a model-returned region `[0.2, 0.2, 1.4, 0.6]`,
When `cropBoxFor` runs,
Then it returns `null`, the opening is `not_read`, and **no** crop of the whole sheet is produced or sent to the model.

**AC-N9 — an inverted region is refused.**
Given a region whose corners are swapped (`x1 <= x0`),
When `cropBoxFor` runs,
Then it returns `null` — the corners are not silently sorted.

**AC-N10 — a hostile PDF cannot make the container render unboundedly.**
Given a request for 400 crops, scale 12, across 60 pages, or a body above 32 MB,
When it reaches the container,
Then `validate.mjs` refuses it with a stable failure code;
And the Worker refuses the same request first, at `MAX_CROPS_PER_CALL`.

**AC-N11 — a forged container response cannot smuggle a crop in.**
Given a container response echoing a crop id the Worker never sent,
When the response is decoded,
Then the unknown id is rejected and never used as a key.

**AC-N12 — prompt injection in the drawing cannot name a product or a price.**
Given a plan sheet whose text instructs the model to report six sliding units,
When the reading is validated and merged,
Then the output is still schema-clamped, still cannot name a family (AC-4), still cannot set a unit width the sheet did not print (AC-6), and the resulting composite still lands `technical_review`;
And a count disagreeing with the schedule's type produces a surfaced disagreement (AC-11).
*Residual risk, named and accepted: a poisoned ratio inside the plausible range survives to review. The human review gate is the control — which is one reason removing it needs its own evidence bar.*

**AC-N13 — nothing sensitive is logged by value.**
Given a complete run, including a failing one,
When Worker and container logs are inspected,
Then they contain no filename, no document text, no model output and no crop bytes — ids and hashes only.

**AC-N14 — repeated parses cannot burn the model budget.**
Given a customer submitting the same project for parse repeatedly,
When the quota, per-IP rate limit and `ai_daily_usage` reservation are exercised,
Then further runs are refused before any vision call is made.

---

## 7. Edge cases

| Case | Required behaviour | Criterion |
|---|---|---|
| Partial plan set (elevations for one storey only) | Ordinary. Located openings are read; the rest are `not read`; the customer sees the counter reach M of M and nothing else. | AC-21, AC-29 |
| A readable sheet that simply does not divide the opening | `not stated` — a correct, truthful answer, distinct from `not read`. | AC-3 |
| Single-unit opening (W15, `FIXED`) | A composition of one unit is a valid reading, not a decline. The line is not split. | AC-1 (shape), AC-20 |
| Stacked opening (highlight over a fixed pane) | `divisionAxis: "horizontal"`; the height is partitioned, not the width. A stacked opening read as side-by-side is a window that cannot be built. | AC-1, AC-13 (the rounding rule applies to the height too) |
| Opening not multiple of the step | Last unit absorbs the remainder; the partition is still exact. | AC-13 |
| Opening whose leaves are genuinely different operable families (awning beside casement) | Cannot be told apart — the schedule states one type. Review flag, never a silent guess. | Design §5 residual limitation; no criterion, because nothing in the reference set does it. **Named as a known limitation, not descoped silently.** |
| Drawing disagrees with the schedule's dimensions | Disagreement surfaced; the schedule stays authoritative for the line. | AC-12 |
| Comment and drawing disagree on unit count | Review flag, not arithmetic. | AC-16 |
| GST display | **No new customer-facing price surface.** The composite's price renders through the existing line, which already respects the account's `ex`/`inc` mode. A drawing-derived split introduces no new price display and must not. | — (asserted by AC-20's byte-identical fallback and by no new price component existing) |
| Quote lifecycle | The read runs at parse time, into a **draft**. A drawing-derived composite lands `technical_review` like every other proposed composite. Nothing here touches an Issued, Accepted or later quote, and no re-read is triggered by a later phase. | AC-36 |
| Offerability | Unchanged. A drawing reading proposes a *make-up*, never a product; the offerability gate still decides what may be sold. | — |
| Delivery zones | Untouched. Opening area is derived from the line's own dimensions, which the drawings never overwrite. | — |
| Customer edits a drawing-derived composite | Their edit stands, as with any AI-proposed line (`edited_fields` / `edit_version`). The reading is not re-applied over it. | AC-20's precedent; no new mechanism |

---

## 8. The cost question — recommendation to the owner

**What was measured this session** (n=1 document, one model):

| | image tokens |
|---|---|
| One opening crop at `MIN_CROP_WIDTH_PX = 900` — W1, 900×918 | ~1,102 |
| The same crop at natural size — W1, 246×251 | 82 |
| The "sliver" case that motivated the floor — W2 at natural 405×132 | 71 |
| 19 openings at the 900 floor | ~18,200 |
| Pass A elevation images (~2,300 each) | ~4,600 |
| **Per job, at the floor** | **~22,800** |
| Per job, natural size | **~2,500–4,000** |

So the floor costs **5–13× per opening, roughly 10× the image cost of a job**. Both W1 and W2 were read correctly at natural size.

**Recommendation: accept the per-job cost, and do NOT change `MIN_CROP_WIDTH_PX` now.** Three reasons, in order of weight:

1. **The money is not the problem.** ~23,000 input tokens per job on `google/gemini-3.6-flash` is fractions of a cent. Against the AI Gateway's $20/month cap, a job at the floor costs on the order of 0.01–0.05% of the cap. Cutting it to ~4,000 saves a rounding error. **Cost is not a reason to touch a constant that sits on the correctness path.**
2. **The bar is zero wrong readings, and the evidence to move the constant does not clear it.** n=1 document, one model, and — the PM's own caveat — *"count the panels"* is a coarser task than reading a printed dimension string, which output spec §1.2 explicitly wants captured when the sheet prints it. A constant whose failure mode is "the model confidently describes a sliver it could not actually resolve" is exactly the one not to tune on one document.
3. **The design already declares this a knob with a named settler** (§11): decline-rate and wrong-rate on wide-short openings in the release-gate fixture. That settler is right; it just has not been run.

**What is worth doing now, at near-zero cost:** record image dimensions and image tokens per crop in `metrics_json` alongside the per-run report (AC-26 already requires call counts and wall times). That turns the experiment below into a query rather than a re-instrumentation.

**The experiment that settles it** — name it now so it is not re-argued later:

> Over the labelled fixture from the ground-truth campaign (≥ N sets, design §14 D2), run the identical pipeline three times varying only the floor: **no floor (natural), 600, 900**. Same model, same prompt version, same crops otherwise. Measure per arm: (a) wrong-rate, (b) decline-rate, (c) the rate at which a *printed* unit dimension is correctly captured — the case the sliver argument is really about — and (d) image tokens per job.
> **Decision rule, fixed before the run:** adopt the smallest floor whose wrong-rate is zero *and* whose printed-dimension capture rate is within 2 percentage points of 900's. If two arms tie, take the cheaper.

That is one config value and three runs of a harness the effort already builds. Until it runs, 900 stands.

---

## 9. Scope ruling — is the ops surface in this effort?

**Ruling: split it. The provenance half is in; the evidence-viewing half is Phase 2.**

**Phase 1 (this effort, shippable):** t1, t2, t3, t4, t5, t6, plus the provenance work AC-19 requires — `ProposedSplit.basis` gains `"drawing"`, the composite review warning names the drawings, and `UnitRequirementBasis` + `unitBasisLabel` gain the matching label. Crops are **written to R2 from day one** even though nothing renders them yet, so the evidence for the later labelling campaign accumulates from the first job rather than being unreconstructable.

**Phase 2 (follow-on, its own pipeline run):** t7 (the geometric second opinion) and t8 (the readings summary on `GET /api/ops/projects/:id`, the crop-streaming route, `DrawingReadings.tsx`, `drawing-evidence-api.test.mjs`, the ops2 Playwright coverage).

**Why this line and not another.** The owner's constraint (§7.3) is that a wrong composition must be *findable* before anything ships. It is not that a specific React panel must exist — it is that the reviewer at the human review gate can tell a drawing-derived split from a default one, can see the disagreements, and can check the reading. Phase 1 satisfies all three through channels that already ship:

- **Findable.** Every proposed composite already lands `status='technical_review'` with a warning in `quote_line.review_json` (`estimate.ts:425-431`), and those warnings are gathered into the submission reconciliation note staff read before issue (`quote.ts:51-74`). Today that warning says *"from the schedule comment"* or nothing. One branch makes it say the drawings. That is the entire distance between "invisible" and "findable".
- **Provenance per line.** The ops console already renders a per-unit basis label in "Why this product?" (`src/ops2/projects/whyCopy.ts`, `WhyDetail.tsx`). Adding `drawing` to that vocabulary is a label, not a surface.
- **Disagreements.** A verification disagreement is exactly the "conflict for review" the review warning channel was built for, and rides it with no new endpoint.
- **Checkable.** Staff can already download the full plan set (`ops.ts:2274`, audit-logged). The crop viewer saves them reopening the PDF — the design says so in those words. **That is a convenience over an existing capability, not the capability itself.**

**Why the crop route and panel are still genuinely needed, and soon.** Two things Phase 1 cannot do:

1. **The ground-truth campaign cannot start.** Design §8's fixture is produced by the owner confirming each opening once *in the ops surface, against the crop*. No crop viewer, no fixture. No fixture, no measurable wrong-rate — and AC-34 is a release blocker measured against exactly that. **Phase 2 is therefore a precondition for scaling beyond the first sets, not an optional polish.**
2. **Unreads are not visible anywhere a person looks.** Phase 1 reports them in the per-run report (AC-26) — data, not a screen. That is enough to *measure* the coverage target; it is not enough to *act* on a gap, which the owner said is what ops is for.

**So Phase 1 may ship — and only ship — under these conditions:**

- Every drawing-derived composite lands `technical_review` and appears in the reconciliation note (AC-36). No drawing-derived split flows to an issued quote unreviewed.
- The review warning and the unit basis label both say the drawings (AC-19).
- Crops are persisted from the first job (AC-24).
- AC-34 holds on the reference set — the owner walks 19 openings once.
- **Phase 2 is ticketed before Phase 1 merges**, so "later" does not mean "never".

`ASSUMED:` this split. It is the one call in this spec most likely to be vetoed, and D-A in §11 puts it to the owner directly.

---

## 10. What "done" means

**The smallest increment worth having:** the platform reads how each opening divides, feeds it into the split it already builds, and a reviewer at the human review gate can see which lines came from the drawings and which the platform guessed — with the readings' evidence retained for later audit.

Concretely, done for Phase 1 is: AC-1 … AC-36 met except AC-N2/N3/N4/N5/N6 (Phase 2 routes), with the release gate AC-34 walked once on the reference set by the owner.

**Explicitly not done, and not pretending to be:** orientation, room labels, the geometric second opinion, the crop viewer, the ground-truth fixture at scale, and any relaxation of the human review gate.

---

## 11. Decisions needed

**D-A — Scope. Ship Phase 1 (readings + provenance on the existing review channels) before the ops readings panel and crop viewer exist?**
*Recommendation: yes*, on the conditions in §9 — the review warning and the "Why this product?" basis label both name the drawings, crops are persisted from job one, AC-34 walked on the reference set, and Phase 2 ticketed before merge. The alternative is one very large release in which the transport, two vision skills, a migration, a new API surface and two Playwright suites all land together.

**D-B — May a drawing-derived composite appear in the customer's draft, with a price, before any human confirms it?**
Today every proposed composite does exactly this: the AI proposal is built into the *customer's* draft, and the human review gate is after submission and before issue. So this is the status quo, not a change — but a *wrong* drawing-derived reading is customer-visible as a priced line in a way a "default 50/50 split" note is not, because it carries false authority.
*Recommendation: yes, unchanged* — the honest handling is in the wording of the note the customer already sees on such a line, not in withholding the reading. Flagging it because it is the one place a wrong reading reaches a customer before a person sees it, and it deserves an explicit yes rather than an inherited one.

**D-C — Crop retention** (design §14 D1). Crops are fragments of customer drawings at rest in R2.
*Recommendation: (a) live with the project* — deleted when the project's files are, which requires ticketing the R2 prefix cleanup that is already missing for stage archives. Fixture crops survive only as an explicit copy made at labelling time: review evidence and a training corpus are different retentions and must not share a default.

**D-D — N, the ground-truth set count** (design §14 D2). How many real sets you will confirm opening-by-opening before the wrong-rate means anything.
*Recommendation: 10, revisited after the first 3.*

**D-E — `MIN_CROP_WIDTH_PX`.** Keep 900 now and settle it by the A/B in §8, or cut it immediately on this session's n=1 measurement?
*Recommendation: keep 900; run the experiment on the fixture.* The 10× is real and it is worth roughly a rounding error against the $20/month cap; the constant sits on the correctness path and the bar is zero wrong readings.

**D-F — Spend headroom** (design §14 D3). ~21–26 vision calls and ~23,000 image tokens per parsed set against the AI Gateway's $20/month cap, shared with every other skill.
*Recommendation: confirm the $20 cap stands.* At this per-job cost the cap is not the binding constraint on this feature; if it ever becomes one, the per-run report (AC-26) is what will say so.

---

## 12. Defects found in the design or the task slice

Reported, not fixed — these go to the architect and the developer.

**Defect 1 — AC-19 is unbuildable as sliced, and the failure is silent.** `ProposedSplit.basis` (`worker/lib/estimator/split.ts:223`) has no `"drawing"` member, and line 461 maps every non-report hint to `"schedule_comment"`. t4 widens `SplitHint.source` only. A drawing-derived split would therefore be **described to the reviewer as coming from the schedule comment** (`estimate.ts:408`) and would render the schedule-comment label in "Why this product?" — a false provenance claim on a staff surface, which is precisely what the ops surface exists to prevent. Worse, it is invisible: nothing fails, the wrong words just appear.

**Defect 1b — and fixing it crosses a vocabulary boundary t4 does not name.** `splitCandidates.ts:374` feeds `split.proposalBasis` straight into `requirementBasis`, which is typed `UnitRequirementBasis` (`src/data/rationale.ts:70`) — a six-member union guarded by `scripts/tests/ops2-why.test.mjs:385-393`, which asserts every member has a label in `src/ops2/projects/whyCopy.ts`. Adding `"drawing"` to the split basis therefore adds a seventh spelling to the *thermal requirement basis* vocabulary and fails that test unless a label is added with it. t4's `files` list contains neither `src/data/rationale.ts`, nor `src/ops2/projects/whyCopy.ts`, nor `splitCandidates.ts`, nor `estimate.ts`. **t4 must be widened, or a Phase-1 blocker ships as a green build.**

**Defect 2 — t2's decline shape collapses the two states t3 promises to keep apart.** t2 specifies `{unreadable: true, reason}` — one decline. t3's `done_when` requires "`not_stated` and `not_read` remain distinct states end to end", and t5 requires reporting `not_stated` as an outcome. Nothing in the slice can *produce* a `not_stated`. The decline needs a reason enum that separates "legible and does not say" from "could not read", and the mapping must be in the skill's schema, not in prose. Output spec §4 is explicit that this collapse has already cost the product once — an unreadable symbol recorded as "no marks", read downstream as fixed glass.

**Defect 3 — `unlocated` is a fourth state with no contract.** t5 and t8 emit `read / not_stated / not_read / unlocated`; the output spec has three states. This spec rules it an ops-visible sub-reason of `not read` (AC-10). The architect should record that in the design or the output spec so a later reader does not treat it as a fourth customer-visible state.

**Defect 4 — the Pass A cost figure in design §14 D3 counts sheets where §4.1 counts elevations.** §4.1 splits each elevation *sheet* by its `ELEVATION x` labels and renders one region per elevation (A/B/C/D). The measurement in hand is ~2 full-sheet images; the design's own call estimate says "Pass A per elevation". Not load-bearing at this scale, but the per-run report should count what it actually renders so D-F is answered from data.

**Defect 5 — no task carries the "no drawing-derived split escapes review" assertion (AC-36).** It is true today by inheritance from `estimate.ts`'s `flagForReview`, which is exactly why it will be nobody's job to keep true. It belongs in `scripts/tests/ai-pipeline.test.mjs` under t5.

**Not a defect, but worth the architect's eye:** design §7.3 asserts "nothing ships unreviewed until [the ops surface] exists". §9 of this spec reads that as a requirement on *findability*, satisfied by the two channels that already ship, and puts the reading to the owner as D-A rather than deciding it silently.
