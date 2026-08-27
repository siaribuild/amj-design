# Reading the drawings — design and plan

**Status:** design for owner review. Container built and verified; Worker-side crop
arithmetic built and tested; everything else unimplemented.
**Output contract:** [plan-parse-output-spec.md](plan-parse-output-spec.md). Settled; conformed
to, not redesigned.
**Build slices:** `docs/runs/plan-parse/02-tasks.json`.

**How to read this document.** Part I is the design as it stands — read it cold, top to
bottom, and you have the current plan. Part II is the record: the retracted claims, the
demoted geometric route, and the evidence that calibrated everything. The retractions are
load-bearing — three confident wrong answers in one document is the fact the ROUTE DECISION
rests on — but they are history, and history is not the plan. Nothing in Part II overrides
anything in Part I.

---

# PART I — THE DESIGN

## 1. ROUTE DECISION — the model reads the drawings. Owner, 2026-08-27.

**Binding.** The primary path is the method that was proven manually with Fable and written
down as `containers/plan-parse/`: render the sheet, crop to one opening, and ask a vision
model, with the schedule row as context. The vector-geometry route (Part II §5) is **demoted
to a corroborating check** — useful because it is free and exact where it works, never the
thing the answer depends on.

**The owner's reasoning, which the session's own evidence supports.** Plans differ. A window tag
is sometimes beside its diagram and sometimes far from it on a leader line; a stile is sometimes
its own segment and sometimes part of a wall line; a frame band is sometimes at 100% of the
opening and sometimes at 99.1%. Each is an edge case, each needs a new geometric rule, and this
session found **three of them in a single document** — every one of which produced a confident
wrong answer until it was caught. Re-deriving that ruleset for every drafter is the work the
owner declined, and the bar he set makes the trade explicit: *the fallback already works
ok-ish, so anything short of 100% is not worth the complexity.*

**Two things the geometry could not do at all**, both verified by looking at the rendered sheets:

- **The tag→wall→elevation chain.** The floor plan carries octagon tags (`W14/S08`) whose
  legend reads *"denotes the window & door number, and sheet number"*, with elevation markers
  A/B/C/D on the four walls. Reading a tag, associating it with a wall through a leader line,
  and mapping that wall to an elevation letter is the join this whole pass needs, and it is
  text-and-symbol work, not line-work.
- **Disambiguation.** W9 and W11 are both 1810 × 1027 and the geometry reports "2 candidates,
  not stated" for each. On Elevation C both are visible and the plan states their order along
  the wall. The model resolves what the matcher can only decline.

**The one thing the geometry has that the model does not, and it is not nothing.** Geometry
fails *loudly* — no frame resolves, so the row says `not read` and the fallback takes over
visibly. A vision model fails *silently*: it returns a plausible composition for an opening it
could not actually see, indistinguishable from a real one. So the model route needs the output
spec's three-state rule enforced at the boundary: every reading carries its crop as evidence,
disagreements with the schedule's type are surfaced rather than resolved, and "could not read
this" must be an answer the prompt makes easy to give. **The geometric decoder becomes the
cheap second opinion** — where both agree, confidence is high; where they disagree, a human
looks.

## 2. What this pass is, and what it is not

**The openings list already works and is authoritative.** Extraction returns every opening with
its tag, dimensions, product type and comment, and the shipped parser does it at 19 rows and
zero warnings on the reference document. None of that is in question and none of it is
re-derived here.

This pass takes that list and asks the drawings **one further question per opening**: the thing
a human would look at an elevation to find.

| Already known, authoritative | What this pass adds |
|---|---|
| tag, width, height | how the opening **divides** |
| product type / family | which units make it up, and what each one **is** |
| comments, glazing, head height | their **order**, left to right |
| | the **ratio** each unit takes of the width |
| | whether the division is side-by-side or stacked |

So it is **not a discovery problem**. We are never asking "what windows exist" — we are looking
up a window we already know the size of, and reading how it is made up. Three consequences:

- **Locating is the work, reading is the easy half.** The schedule states a size, not a
  position; the join from a row to a pixel box is the hard part (§4.1–4.2).
- **Failure is per-opening and harmless.** An opening whose composition is not read keeps
  everything the schedule gave it and reports composition as *not stated* or *not read*
  (output spec §4 — the two never collapse). The list never degrades.
- **The schedule route is closed** (Part II §3): all eight schedule columns are already
  parsed, `comments` is genuinely null for W1/W14/W16, and the sheet's own legend says the
  schedule nominates *sizes*, not make-up. It is the drawings or nothing.

## 3. Who runs where — the Worker/container seam

The model route needs an image of each opening, so something must rasterise on every job. The
isolate cannot: `wrangler.jsonc` has no Browser Rendering binding and workerd has no canvas.
Cloudflare Containers are GA and cost roughly $0.00016 per job beyond an allowance of ~4,500.

**The container renders and crops; the Worker reads, verifies and reports.** The division is
absolute and both halves are already written down as code comments
(`worker/lib/drawing/container.ts`, `containers/plan-parse/server.mjs`):

- The container receives PDF bytes and integer rectangles, returns PNGs and stable failure
  codes. It holds **no credentials** — no R2 keys, no D1, no model key — keeps nothing between
  requests, runs as a non-root user, and makes no outbound call. A crop it cannot make is
  reported, never substituted.
- The Worker owns every judgement: which pages, which rectangles (`cropBoxFor`), what a
  failure means, the model calls, retries/escalation (`jobs.ts`, `stage.ts`, `escalation.ts`,
  `runs.ts` — all reused, none rewritten), and every D1/R2 write.

### 3.1 The transport — a container/DO binding, never a route

*This did not exist when the container was built, and `/security-review` has twice required
that it be named. It is now a design constraint, not an implementation detail:*

> **The container is reachable ONLY through the Cloudflare container binding — a Durable
> Object namespace — and never through a public route, a service route, or a hostname.**

Mechanism, concretely:

- `wrangler.jsonc` gains a `containers` entry (`class_name: "PlanParseContainer"`, `image:
  "./containers/plan-parse/Dockerfile"`, `max_instances`), a `durable_objects` binding
  (`PLAN_PARSE` → `PlanParseContainer`) and a `new_sqlite_classes` migration for the class.
- `worker/lib/drawing/planParseContainer.ts` defines `class PlanParseContainer extends
  Container` (`@cloudflare/containers`; `defaultPort = 8080`, `sleepAfter` a few minutes),
  exported from `worker/index.ts`.
- The Worker calls it via the namespace and nothing else. Cloudflare does not expose the
  container's port publicly; the Worker is the only ingress. The container therefore carries
  no auth of its own — a shared secret would make it a secret-holder, which is the design
  reversal the Dockerfile's closing comment warns against.
- **Instance affinity:** the namespace id is derived from `projectId:sourceGeneration`, so a
  job's calls (Pass A, then the per-opening batch) land on the same warm instance and pay one
  cold start, not two. Affinity is an optimisation only — correctness never depends on which
  instance answers, because the container is stateless.

### 3.2 The seam ruling — stateless, whole PDF per call. Kept, with its costs stated.

The container receives the **whole PDF on every call** and re-renders any page a later call
needs again. Challenged (2026-08-27) and kept:

- **The floor is two calls per job by construction, not one.** Pass B needs Pass A's model
  output back in the Worker before per-opening boxes exist, so "one call that does everything"
  is not available to any design. The real cost is therefore the *delta* over two calls:
  ⌈openings / 24⌉ − 1 extra calls. At 19 openings: zero. At 50: one extra call, ~2 MB of extra
  transfer, and one page rendered a third time — single-digit seconds against a 40–95 s job in
  which cold start (1–3 s) and the model calls dominate.
- **What statelessness buys is worth more than those seconds.** No cache invalidation, retry =
  resend, and — the security property — **no customer document survives in the container after
  its response is written**. A render cache keyed on checksum would hold customer drawings
  across requests inside a component that is deliberately credential-free and audit-thin.
- Rejected alternatives, for the record: *container-side R2 read* (needs S3 keys — the `boto3`
  objection, §3.3); *container-side page cache* (state, invalidation, data residue — above);
  *Worker sends single extracted pages* (page extraction is itself PDF surgery the Worker
  would then be doing twice). Revisit only if a measured job shows transfer or re-render as a
  material fraction of wall time — the per-run report (§8) will show it.

### 3.3 Both host questions settled — owner, 2026-08-27

**Node, not Python.** The scaffold was Python because that is what the method was proven with.
Against it, item by item from the old `requirements.txt`: `pdfplumber`'s per-word coordinates
are `getTextContent()` items' `transform`; `pillow` is `sharp`, already a dependency; `poppler`
is `unpdf` plus a canvas, proven in `render.mjs`; the `anthropic` call moves to the Worker.
What decides it:

- **One PDF library, therefore one coordinate space.** The geometric second opinion is pdf.js.
  If the container crops with poppler and the decoder measures with pdf.js, the verification
  cross-check needs a coordinate reconciliation before it can compare anything. Same library
  makes it a subtraction.
- **`boto3` is a credential.** A container doing its own R2 I/O needs S3-compatible keys — a new
  secret with a new blast radius, in a product holding payout details and ABNs. A Worker holding
  the binding needs none. This one outweighs the rest.
- Leaner image, and image size sets the 1–3 s cold start.

*Reversible, and testable rather than arguable:* if Node's crops read worse, the release gate's
numbers say so.

**The vision call lives in the Worker, not the container.** Three things decide it:

- `jobs.ts`, `stage.ts`, `escalation.ts` and `runs.ts` already carry retries, escalation
  triggers, run records and token accounting. In the container every one is rewritten.
- A container awaiting a vision call bills a GiB-second per second at **zero CPU**.
- **Progress has to reach D1 to reach the customer** — and a container that writes progress needs
  D1 credentials too, which is the `boto3` objection a second time.

## 4. The read, stage by stage

### 4.0 Page selection — FIXED, shipped this session.

The live defect recorded in Part II §4 — `classifyPageRoles` routing a stair detail as "plans"
on every architectural set — is fixed in `worker/lib/ai/ingest.ts` (commits `00669315`,
`0d59a4e7`): only a sheet that **names** a drawing is a drawing sheet; section marks, scales
and north points corroborate but never qualify a page alone. Every route needed this; the
model route needed it most, because rendering the wrong page pays for the render, pays for the
tokens, and returns nothing.

### 4.1 Pass A — inventory each elevation. No schedule involved.

Split each elevation sheet by its `ELEVATION x` labels, whose **positions the text layer gives
for free** — the Worker already opens the document for text (`ingest.ts`), and positioned text
on a selected page costs ~30–50 ms with no operator list. The Worker turns those label
positions into elevation-sized regions; the container renders them as (large) crops; the model
is asked, per elevation, for every window-like object it can see: a normalised bounding box,
the drawn width:height proportion, the panel count, and whether each panel carries a symbol.
It is not asked to name anything — nothing is matched yet, so nothing can be matched wrongly.

**The demoted decoder earns its keep here.** The frame matchers produce candidate rectangles
for free and exactly, and Pass A only needs them as a **superset** — it does not need them to
be right, which is the entire difference between this use and the one the owner declined. On
the reference set they cover every opening that is drawn, including all six the matcher could
only call ambiguous. Where a geometric candidate and a model box coincide, the box is exact and
free; where only one exists, it is still a candidate. (Second-opinion machinery is §4.4; it
ships after the primary path, not before.)

### 4.2 Pass B — assign schedule rows to boxes. Pure, no I/O.

Three independent signals:

| signal | source | settles |
|---|---|---|
| which elevation | the tag's wall on the floor plan → the `A`–`D` marker on that wall | which sheet and which half of it |
| drawn size vs stated size | Pass A's proportion against the schedule's W×H | which box, when sizes differ |
| order along the wall | the tag order on the floor plan vs left-to-right on the elevation | same-size pairs — W5/W6, W9/W11, W14/W16 |

**A row that two signals disagree about is `not read`, and so is a box two rows both fit.** The
second is not hypothetical: W14 and W16 are both 2050 × 2000 and the elevations yield **one**
frame of that size, so either the second is drawn where this pass does not look or one row is
not drawn. Assigning that one frame to both is the confident wrong answer this reader fails by,
and the research harness did it silently until a check was written for it.

Only after a row owns a box is it cropped and read. **Nothing reaches §4.3 unlocated.**

### 4.3 The per-opening read — one vision call per opening, against its own crop.

The schedule's dimensions and type go in as context. The model is asked how the opening
**divides**, never what family it is — §5's ruling binds: geometry or model, the drawing
claims operable-or-not and the schedule names the family. The output schema makes **"could not
read this" a first-class answer** — a model never offered the option invents rather than
declines — and every output is schema-validated through the same clamp every skill already
passes (`runSkill`).

The crop the model saw is stored as evidence (§9 names where), so a reviewer checks the
reading against the exact pixels without reopening the PDF.

### 4.4 Verification — what makes the bar checkable.

The model fails silently, so this stage is not optional. Three checks, defined once in THE
RELEASE GATE (§8) because they are the same checks that decide whether the thing may ship:

1. **Schedule cross-check** — panel count and operable/passive pattern against the schedule's
   type text. Disagreement is surfaced, never resolved. *Pure; ships with the primary path.*
2. **The geometric second opinion** — free, exact, and wrong in *different* ways than a model.
   The segment extraction (operator lists, CTM walk) runs **in the container** — it is
   extraction, not judgement, and workerd's 128 MB was never proven to hold it (the withdrawn
   Stage 1a question; the measured peak was 48 MB in Node *before* the Worker also holds PDF
   bytes and crop responses). The frame *matching* is pure and runs in the Worker. *Ships as
   its own slice, after the primary path — checks 1 and 3 plus the review gate hold the line
   until it lands.*
3. **Dimension agreement** — the drawn frame against the schedule's W×H (output spec §2.2),
   which caught W4's 3200 × 2100 siding with the energy report against the schedule. *Pure;
   ships with the primary path.*

### 4.5 Into the estimator — a new source, not a new mechanism.

`SplitHint.source` (`worker/lib/estimator/split.ts:144`) gains `"drawing"`; `SplitUnitHint`
gains an optional `ratio`, consumed through the output spec's §1.2 rounding rule (round all but
the last unit to the manufacturing step; the last takes the remainder, so units always
partition exactly). Evidence columns (`page_no`, `sheet_ref`, `region_json`) already exist in
migration 0016 and every writer passes `null` today — the crop's page and box fill all three
with no schema work.

**Precedence, and a live comment defect.** The output spec §6 and the owner rule already coded
into `pipeline.ts` (~line 780: "THE PLAN WINS THE GEOMETRY") agree: for composition, axis,
order and count **the drawings win — above the schedule comment, above the energy report**. A
stated unit width still wins over a measured ratio (§6 below). But `pairing.ts:15`'s precedence
comment currently lists "energy report components — authoritative" *above* "drawing-derived
split", which contradicts both. The comment is corrected in the same slice that lands the merge
logic, and the merge guard at `pipeline.ts:784` extends so a `"drawing"` hint keeps its shape
while the report's components still ride along for their thermal targets.

### 4.6 Orientation is a separate workstream. Unchanged.

The chain — boundary bearings as text → the lot's compass axes → the tag's wall on the floor
plan → outward normal — is feasibility-proven (Part II §5, "Orientation is readable after
all") and is **one determination per building, not one per opening**. It serves a different
consumer (the thermal band's SHGC cap via `computeDefaultBand`) and ships on its own schedule.
Nothing in this pass blocks on it and nothing here builds it.

## 5. The symbol never names a family — DECIDED, owner 2026-08-07

`worker/lib/drawing/profile.ts` ships `DEFAULT_PROFILE = { apexMeans: "hinge", confirmed: true }`
and `refineOperable` maps a bottom apex to **hopper**. Every operable sash measured in the
reference set has its apex at the bottom while the schedule calls all of them **AWNING**, so on
this practice's convention `refineOperable` would name every operable panel a hopper, at full
confidence, because `confirmed: true` makes the "don't name a family until confirmed" guard
vacuous.

**The whole machinery is unnecessary, because AMJ does not make a hopper.** An awning is hinged
at the top and opens outward; a hopper is hinged at the bottom and opens inward — different
windows, drawn with the same chevron, distinguished only by which end the apex points at. The
catalogue has fourteen families and none is a hopper; `OPERATIONS` in `split.ts` does not list
one either. Distinguishing awning from hopper is a distinction this product range cannot
express.

So the rule, and it removes an entire class of risk:

> **The drawing claims `operable` or `not operable`. It never claims a family.**
> The operable leaves take the family the SCHEDULE states — which is authoritative and already
> extracted. The passive leaves are fixed.

For W1: the schedule says `OFFSET AWNING`, the drawing says the left leaf carries a symbol and
the right does not ⇒ `awning | fixed`. No convention is consulted, so no convention can be
wrong.

`refineOperable`, `apexMeans` and the practice-profile model are **not used in v1** and should
stay unreferenced rather than be corrected. They become relevant only if the catalogue ever
carries two families that share a symbol and differ by hinge edge.

*Residual limitation, stated:* an opening whose leaves are genuinely different operable families
— an awning beside a casement — cannot be told apart this way, because the schedule states one
type. Nothing in the reference document does that, and if it appears it is a review flag, not a
silent guess.

## 6. Precedence — a stated width beats a measured one. DECIDED, owner 2026-08-07.

### Crop retention is EVENT-driven, not a clock. Owner, 2026-08-27.

**Decision: crops die when the quote reaches a terminal state, not at an age.** The owner's
reasoning: the images are not needed once a quote is either voided/deleted or issued in its
final version, and they are almost certainly not needed before that — so binding to the event
already carries the safety margin a TTL would have to guess at.

This removes the failure a fixed TTL introduces and which both review passes flagged: a crop
expiring *underneath a live, unreviewed quote*, leaving a reviewer holding a provenance claim
with nothing to check it against.

**The triggers, against the real state machine** (`migrations/0001_customer_core.sql:59`):
`quote_issued` and `accepted` (issued in final form — and since quote revisions were removed,
issue IS final), `expired` and `closed` (voided). Delete the run's crop prefix on transition
into any of them.

**R2 lifecycle rules are time-based only** and cannot fire on an application event, so the
primary mechanism is an application delete on transition. Three constraints follow:

1. **The delete must never block the transition.** A failed R2 delete cannot fail an issue or a
   void. Log and sweep; the quote is the business record, the crop is evidence for it.
2. **A backstop is still required.** A missed transition — a crash, or a project that simply
   never reaches a terminal state — leaks crops forever, and R2 objects already outlive their
   D1 rows here (the same orphan gap that exists today for stage archives). A generous R2
   lifecycle rule (proposed: 365 days) catches those. It is a safety net, not the policy: by a
   year any live quote has reached `expired` anyway.
3. **The ground-truth fixture is exempt, and this is not optional.** The fixture is built by the
   owner confirming openings against crops. If fixture crops die with their quote, ground truth
   evaporates and the release gate's wrong-rate becomes unmeasurable — which is the one thing
   the zero-wrong-readings bar rests on. Labelling copies the crop to a separate prefix outside
   both the event delete and the backstop rule.

*Stated once and not re-argued:* after issue there is no crop behind a line's "from your
drawing" claim, so a post-issue question about why an opening was priced as it was is answered
from the line and the plan set, not the evidence. The owner has weighed that and set the point
at issue.

### The split ladder, and why the report ever outranked the schedule. Owner, 2026-08-27.

**The drawings are the contract. The energy report is not. That has never changed.**

The confusion was entirely split-related, and the reason is worth stating because it is not
obvious from the code: **a schedule typically says `AWNING`, not `awning + fixed`.** It names the
family of an opening and is silent on how that opening divides. The energy report is not more
authoritative — it enumerates components, so it carries make-up information the schedule simply
does not contain. That is why it was given an edge, and given only a schedule it remains a good
fallback.

The ladder for composition and split:

| | source | why it sits there |
|---|---|---|
| 1 | **Advanced parsing — the drawings** | the architectural contract. **Wins every time.** |
| 2 | Energy report | enumerates components; the schedule is silent, so this beats nothing |
| 3 | Schedule alone (legacy parsing) | states the family, not the make-up |

Unchanged elsewhere: thermal targets (Uw, SHGC) are the report's; specification — glass, colour
and hardware — is the schedule table's; and a **stated** unit width still beats a measured ratio.

**Two corrections of my own, recorded so nobody re-derives them from the code.** I read the
report's rank over the schedule as a shipped defect and cited opening W3 — report `fixed` at
precedence 100 against the schedule's `awning` at 80 — as the evidence. The drawing reads W3 as a
single fixed unit with no operable symbol, so **the report was right and the schedule was
wrong**: that conflict is evidence *for* the ladder, not against it. I then corrected myself to
"drawings and schedule above the report", which was also wrong — it demoted the report beneath a
document that does not describe splits at all.

So the change this effort needs is small: **insert the drawing source above the energy report**
for composition and configuration, and leave the report's existing rank over the schedule alone.
`PRECEDENCE_POLICY_V2.dimensions` is already correct and is not touched.


### 7.1 The customer: extend the channel that exists — and no schema rebuild.

The whole channel is already built and shipping: `progress_stage` on the job row → exposed by
`worker/routes/parse.ts` → typed in `src/data/api.ts` → polled in
`src/data/useProjectDocuments.ts`, which already renders a named phase.

**Exactly one thing is missing: a count.**

| what the customer sees | comes from |
|---|---|
| uploading file | the upload surface, before any run |
| parsing file | `reading_documents` — exists |
| **20 openings discovered** | `extracting_schedule` completing — the count is the schedule's own row count |
| **reading opening 7 of 20** | **`drawings_done` / `drawings_total`, two new nullable INTEGER columns on `ai_job_claim`** |

*Amended 2026-08-27 (architect pass).* An earlier version of this section also wanted a new
`reading_drawings` value in the `progress_stage` vocabulary. **Withdrawn:** migration 0035
gave `progress_stage` a `CHECK (progress_stage IN (...))` constraint, and SQLite cannot alter
a CHECK — adding the value means rebuilding `ai_job_claim`, which is the exact class of change
`d1-migration-safety` exists to keep rare (§10). The two count columns carry the same
information: the UI renders "reading opening N of M" whenever `drawingsTotal` is non-null on a
processing run, whatever the stage label says. One additive migration, no rebuild, no new enum.

The counter's writes reuse `setProgress`'s guard verbatim — `WHERE project_id=? AND
source_generation=? AND status='processing' AND processing_token=?` — so a superseded or
stolen job cannot move a live job's bar.

**The counter must be honest.** Its denominator is the real opening count, and an opening that
comes back `not read` still advances it. A bar that stalls, or quietly shortens its denominator
to reach 100%, is dishonest about work it did not do.

### 7.2 What the customer sees — successes, never unreads. Owner, 2026-08-27.

**`not read` is not an error, and must not be presented as one.** The schedule is authoritative
and gives every opening its size, type and glazing; the drawings contribute *how it divides*.
Partial plans, an elevation that does not show a face, a set that stops at the ground floor —
all ordinary, and §2's rule already covers them: the list never degrades.

| surface | shows | never shows |
|---|---|---|
| progress | `reading opening 7 of 20` — successes accruing against the real count | anything about openings it could not read |
| the result | which lines the drawings detailed | an error state, a gap count, or a request to supply more |
| `diagnostic` (`src/data/api.ts`) | real failures — file unreadable, service down | `not read`, ever |

*This reverses an earlier position in this document and the reversal is the point.* The counter
was going to expose unreads so they could not be hidden. Right instinct, wrong surface. A
**missing** composition falls back to the even split, which is exactly today's behaviour and is
not news to anyone; a **wrong** one is a priced window nobody drew.

**Which is why the surface is OPS, not the customer** *(owner, 2026-08-27)*. Ops can act on a
gap: re-run it, correct it, ask the customer for a sheet, or decide the drawing simply does not
show it. A customer cannot. The provenance a reviewer needs — *this composition came from the
drawing* versus *this is the default split* — belongs on the ops line, and so does every
unread and every disagreement the verification stage records.

**Do not assume the reads are right** *(owner, same)*. Everything above about `not read` being
ordinary is about **gaps**. Parsing **errors** remain possible and always will, and the
"successes only" rule must never harden into "successes are correct" — that is the assumption
this whole reader fails by. Ops sees gaps AND disagreements; the customer sees neither, because
neither is a customer's to resolve.

**No invitation to the customer, either.** An earlier draft proposed telling them "adding the
remaining elevations will detail the rest". **Withdrawn — it asks for something they cannot
give.** A customer cannot add a split, an orientation or a head height to an opening that did
not parse; the product offers them no way to, and inviting an action the interface does not
support is worse than saying nothing.

### 7.3 The ops surface — provenance, gaps, disagreements, and the crop.

It does not exist yet, and **nothing ships unreviewed until it does** (owner, §14). Concretely:

- The staff project read (`GET /api/ops/projects/:id`, `worker/routes/ops.ts`) gains a
  per-opening readings summary: state (`read` / `not_read` / `not_stated` / `unlocated`),
  which verification checks fired, the disagreement details, and the crop reference.
- A new staff route streams the crop PNG (§9 authorization). The reviewer sees the exact
  pixels the model saw, beside the schedule row and the resulting composition, in
  `src/ops2/projects/` (a readings panel on `ProjectRecordPage`, provenance on the line).
- Per-opening evidence rows use the structures that already exist: one `ai_stage_runs` row per
  opening read (via `runStage`, which is also the retry/idempotency machinery), with the
  model's JSON in `result_r2_key` as every stage already archives it, and the crop's own R2
  key carried in `metrics_json`. *(Amended: an earlier draft said the crop goes in
  `result_r2_key` itself — wrong; that key is the replay archive and must stay the validated
  JSON payload.)*

**OCR for genuinely scanned sets** remains the container's other job someday, and
`GeometryGap = "raster_page"` remains its trigger — but it is no longer the thing that decides
whether a container exists, and it is not in this plan's scope.

## 8. THE RELEASE GATE — what "100%" has to mean before anything ships

**The bar has to be split in two, because one half is achievable and the other is not.**

| | bar | why |
|---|---|---|
| **A reading that is WRONG** | **zero. A release blocker.** | A wrong composition is a priced window nobody drew. It reaches a customer as a quote and a factory as a cut list. |
| A reading that is ABSENT | measured and reported, not gated | `not read` hands the opening to the fallback **visibly**. The fallback already works ok-ish; a visible handover is the status quo, not a regression. |

So *100% correct* is the gate and *100% covered* is the target. Conflating them is what would
make this project unshippable forever: a set whose drawings genuinely do not state a
composition cannot be read by any method, and the output spec's §4 already says `not stated` is
a correct answer.

**Ground truth, which does not exist yet and is the long pole.** No gate is measurable without a
labelled set, and nobody has labelled one. Cheapest honest route: run the pipeline over N real
sets and have the owner confirm or correct each opening **once**, in the ops surface, against
the crop the reading carries. That is review work he would do anyway on the first jobs, and it
produces the fixture as a by-product. **N is a decision for him** (§14): the second plan set
stopped being a route gate and became the first row of this.

**The three checks that have to run before a reading counts as correct** are §4.4's — schedule
cross-check, geometric second opinion, dimension agreement — all of which exist independently
of any label.

**Staged release, so the gate can be met before the fixture is large.** Drawing-derived splits
already land behind "confirm the configuration at review". Ship there first: every reading is
seen by a human before it prices anything, wrong readings are caught as review corrections
rather than as customer-visible errors, and each correction is a labelled row. **Removing the
review gate is a separate decision with its own evidence bar** — see §14 — and must not be
taken as implied by shipping.

**What gets reported per run**, so the numbers exist from day one rather than being
reconstructed later: read / located-but-unread / unlocated, per opening; which of the three
checks fired; the crop key for every reading; and the container/model call counts and wall
times (which is also what would justify revisiting §3.2's seam). The per-opening
`ai_stage_runs.metrics_json` plus the run summary carry all of it;
`scripts/research/plan-geometry/measure.mjs` is the shape to copy.

## 9. Security

This feature processes customer-uploaded plan sets, stores derived fragments of them, sends
them to a third-party model, and stands up a new compute surface. Every one of those is a
sensitive surface; none of this section is optional.

### 9.1 Data classification

| data | class | where it lives / moves | new? |
|---|---|---|---|
| Plan set PDF | **personal PII** (client names, site addresses in title blocks and the text layer) + commercial (project scope, quantities) | R2 `FILES` via `file_asset`, project-scoped; already virus-scanned and size-capped at upload | existing |
| Crops (per-opening PNG; Pass A elevation PNGs) | same class as the source — a fragment of the customer's drawing; elevation-sized crops can include title-block text (names, addresses) | **NEW at rest**: R2 under `projects/<projectId>/runs/<runId>/crops/<stageRunId>.png` — the same project-scoped prefix the stage archives already use. `ASSUMED:` this prefix and lifecycle pending the retention decision (§14 D1) | new |
| Model input | crop bytes + schedule row context (tag, dims, type text) | Worker → Google via the AI Gateway, `collectLog: false` (payloads never stored gateway-side); document text already crosses this boundary today — pixels are a new modality, not a new boundary | new modality |
| Model output (regions, compositions, declines) | untrusted input, commercial once accepted | validated in Worker, stored via `runStage` archives + hints | new |
| Container I/O | PDF bytes + rectangles in; PNGs + failure codes out | in-memory only; the container persists nothing, logs no document content (`server.mjs` logs error stacks only), and its dev `out/` directory is gitignored with the Dockerfile COPYing files explicitly (both already asserted by tests) | new |
| Progress counts | non-sensitive integers | two columns on `ai_job_claim` | new |

Nothing new is logged by value: the existing §21.1 discipline (never log filenames, document
text or model output; hashes and ids only) binds every new code path, container included.

**Retention is undecided and escalated** (§14 D1). The release gate *requires* every reading
to carry its crop, so crops cannot simply be discarded — but "kept for review" and "kept
forever" are different policies, and a customer's drawings sitting in R2 indefinitely is a
liability the owner must size, not a default the code should pick. Two facts for that
decision: R2 objects do **not** die with D1 rows (project deletion cascades D1 but leaves the
R2 prefix — an orphan-cleanup gap that already exists for stage archives today and which crops
would widen), and the ground-truth fixture (§8) *wants* labelled crops retained — so the
recommendation separates the two: operational crops live with the project, fixture crops are
an explicit, deliberate copy made at labelling time.

### 9.2 Trust boundaries

1. **Customer → Worker (upload).** Unchanged; this feature adds no upload surface. Existing
   controls: virus scan gate, size caps, project scoping in `file_asset`.
2. **Worker → container (the DO binding — §3.1).** The only path in; no public ingress by
   construction. Validation at the crossing runs on **both** sides, deliberately: the Worker
   clamps and refuses first (`cropBoxFor`), and the container re-validates everything anyway
   (`validate.mjs`: scale ≤ 6, pages ≤ 20, crops ≤ 64, positive-integer boxes, 32 MB body) —
   "trusted" and "unchecked" are different things, and validate.ts is the only thing standing
   between a malformed rectangle and a native renderer. The container is also the **blast
   radius** for parsing hostile PDFs in native code (pdf.js, canvas, sharp — image parsers are
   CVE country): non-root, credential-free, nothing to read but the one document it was
   handed, nothing to write to. A fully compromised container can lie about pixels of that one
   document — an outcome the verification checks and the review gate already bound.
3. **Container → Worker (response).** PNGs and stable failure codes. The Worker matches echoed
   crop ids against the set it sent (never trusts an id as a key), enforces
   `MAX_CROPS_PER_CALL = 24` on what it requested (bounding response size against the 128 MB
   isolate), and treats failure reasons as an enum — container internals never reach any
   surface.
4. **Worker → model (AI Gateway).** Existing boundary, existing spend/rate controls, payload
   logging off per-request. New: image parts, already supported by the skill runner.
5. **Model → Worker.** **The heart of this design's threat model.** Model output is untrusted
   input that becomes a pixel rectangle and a priced composition:
   - Regions are **refused, not clamped** (`cropBoxFor`): out-of-range or inverted corners
     return `null` → the opening is `not read`. Clamping IS the bug — `[0.2, 0.2, 1.4, 0.6]`
     clamps to "the whole sheet", which the model then confidently describes. Refusing costs
     one `not read`, which the even-split fallback already covers. This is the right boundary
     and it is **not the only one**: every model output also passes the skill's JSON-schema
     clamp (`runSkill` — the same validator path re-applied even to R2 replays, because
     storage is not a trust boundary), the composition may never set a family (§5), a stated
     width always beats a model ratio (§6), verification (§4.4) cross-checks what survives,
     and the review gate has a human confirm before anything prices.
   - Nothing model-produced is interpolated into SQL, R2 keys, file paths or logs: crop keys
     derive from `stageRunId`, joins go through bound parameters, tags are matched against the
     schedule's own roster.
6. **Ops → Worker.** New read surfaces, below.

### 9.3 Authorization, per endpoint

- **No new customer-facing endpoint.** The progress counts ride the existing extraction-run
  read in `worker/routes/parse.ts` (~line 371), whose scoping is unchanged and stated here so
  it is checked, not assumed: the project is resolved from the session/claim cookie
  (`resolveCurrentProject` / `resolveUser`), and the job row is read with
  `WHERE j.project_id = ?` bound to that resolved project — never to an id from the request.
  The two new columns join that SELECT; they add no new query and no new filter.
- **Progress writes** (Worker-internal): `UPDATE ai_job_claim ... WHERE project_id=? AND
  source_generation=? AND status='processing' AND processing_token=?` — the token guard means
  a superseded run cannot write a live run's counter.
- **`GET /api/ops/projects/:id` (extended, `worker/routes/ops.ts`).** Staff-gated as today:
  `resolveStaff` plus the **`isStaffUser` predicate — manufacturer partners are excluded**,
  because readings, gaps and crops are customer data and CONTEXT.md excludes manufacturer
  partners from customer data categorically. Readings query:
  `... FROM ai_stage_runs s JOIN ai_runs r ON r.id = s.ai_run_id WHERE r.project_id = ?` with
  the path's project id bound.
- **`GET /api/ops/ai/crops/:stageRunId` (new, `worker/routes/ops.ts`).** Same staff gate
  (`isStaffUser` — not merely `resolveStaff`), and audit-logged exactly like the existing
  staff file download (`ops.ts:2274` pattern). The R2 key is read from the row —
  `SELECT s.metrics_json, r.project_id FROM ai_stage_runs s JOIN ai_runs r ON r.id =
  s.ai_run_id WHERE s.id = ?` — **never from the request**, so the route cannot be steered to
  an arbitrary R2 object. Ids are UUIDs; enumeration yields nothing to a non-staff caller and
  an audit line per hit for a staff one.
- **Crops appear on no customer-facing surface, scoped or otherwise.** Specifically they are
  never attached to the customer files listing or the guest-grant download surface — the guest
  OTP weakness (ticketed HIGH, 2026-08-25) can already reach customer files, and this feature
  must not widen what that grant reaches.
- **The container endpoint has no authorization because it has no reachability** (§3.1). Its
  authorization *is* the binding. Adding a shared secret would be a regression, not hardening.

### 9.4 Abuse cases

| abuse | held by | proven by |
|---|---|---|
| Customer A reads customer B's progress/readings | session-resolved project scoping on the parse read (above) | existing api suite; new columns covered in `scripts/tests/ai-pipeline.test.mjs` |
| Non-staff or manufacturer-partner pulls a crop or readings | `isStaffUser` gate on both ops surfaces | **negative tests** in `scripts/tests/drawing-evidence-api.test.mjs` (customer token → 401/403; manufacturer session → denied; both executed, not asserted-by-reading) |
| Hostile PDF: render bomb / decompression bomb | container caps (scale ≤ 6, pages ≤ 20, crops ≤ 64, 32 MB body), per-page failure isolation, container as blast radius; Worker-side text scanning already bounded (`MAX_TAG_MATCHES_SCANNED`) | `validate.mjs` bounds covered in `scripts/tests/drawing.test.mjs` (exists) |
| Prompt injection via the drawing itself (text or drawn glyphs steering the model) | schema-clamped output; family never model-claimed (§5); stated widths win (§6); verification (§4.4); human review gate before pricing | **residual risk, named:** a poisoned ratio inside the plausible range survives to review — the review gate is the control, which is one reason removing it needs its own evidence bar (§14) |
| Model self-reference: Pass A's wrong box → crop → confident wrong read | refuse-not-clamp at `cropBoxFor`; Pass B's two-signal agreement requirement; crop carried as evidence so review sees what the model saw | `cropBoxFor` refusal tests (exist); assignment tests in `scripts/tests/drawing.test.mjs` |
| Crop-id / stage-run enumeration | UUID ids; staff-only route; audit log per access | `drawing-evidence-api.test.mjs` |
| Spend abuse: repeated parses to burn model budget | existing parse quota + per-IP rate limit + `ai_daily_usage` reservation; AI Gateway monthly cap as backstop | existing suites; call-count in the per-run report (§8) |
| Replay / tamper of container traffic | not reachable off-platform; requests deterministic and idempotent (byte-identical for the same batch, by design in `buildCropRequest`) | `drawing.test.mjs` (exists) |
| Customer data residue in the container between jobs | statelessness (§3.2) — no cache, no disk writes, `out/` is dev-only and gitignored | Dockerfile COPY test + gitignore (exist) |
| Customer PII committed to the repo | the README's identifiers-are-looked-up-not-written-down rule (a site address *did* land in a committed README this effort and was purged); fixtures fetched by key, never stored | reviewer attention; the rule is written where the fetch instructions are |

## 10. Data and migrations

`d1-migration-safety` loaded; live cascade count re-measured at **52** (comment mentions
excluded).

**One migration, additive only — `migrations/0059_drawing_read_progress.sql`:**

```sql
ALTER TABLE ai_job_claim ADD COLUMN drawings_done  INTEGER;  -- null until a drawing read starts
ALTER TABLE ai_job_claim ADD COLUMN drawings_total INTEGER;  -- the honest denominator (§7.1)
```

- **Cascade analysis:** nothing in the schema `REFERENCES ai_job_claim` (verified by grep over
  `migrations/`), and an `ADD COLUMN` rebuilds nothing regardless. Children affected: none.
- **The rebuild that was avoided, named so nobody reintroduces it:** extending
  `progress_stage`'s CHECK (migration 0035) with a `reading_drawings` value would require the
  CREATE/INSERT/DROP/RENAME recipe on `ai_job_claim`. That table has no cascade children, so
  it would not repeat the incident — but it is the incident's *class*, and two nullable
  columns carry the same information for free. §7.1 records the withdrawal.
- **No other schema work.** Evidence lands in the existing `evidence_items` columns
  (`page_no`, `sheet_ref`, `region_json` — migration 0016, currently always null) and
  `ai_stage_runs` rows via `runStage`; the crop's R2 key rides `metrics_json`.

## 11. Constants — calibration knobs, and what settles each

Chosen unilaterally during the container build; **flagged here rather than silently owned.**
None is an owner decision *in itself* — each is a technical calibration whose right value is an
empirical question the release-gate fixture (§8) answers — but their *product* is cost per job,
and cost is the owner's (§14 D3). Refuse-vs-clamp is different in kind: it is not a knob, it is
the owner's own zero-wrong-readings bar applied at a boundary (a clamped region risks a wrong
read; a refused one costs a visible `not read`), and changing it would need the bar changed
first.

| constant | value | trades | settled by |
|---|---|---|---|
| `scale` | 3 (~216 DPI) | render cost + payload size vs glyph legibility | read-rate on the labelled set at 2/3/4 — the per-run report already carries the numbers |
| `MIN_CROP_WIDTH_PX` | 900 | model tokens per image vs legibility of sliver crops (3500×700 renders ~300×60 px unscaled) | decline-rate + wrong-rate on wide-short openings in the fixture |
| `PAD_FRACTION` / `MIN_PAD_PT` | 0.18 / 12 | context (dimension strings, tags, storey lines) vs pulling a neighbouring opening into frame | verification disagreement rate; the `ponytail:` note in `crop.ts` already names per-producer padding as the upgrade path |
| `MAX_CROPS_PER_CALL` | 24 | Worker memory headroom vs extra container calls on large sets (§3.2: cost is ⌈n/24⌉−1 calls) | measured response sizes in the per-run report; the container's own cap (64) is the not-from-the-Worker tripwire, not the operating limit |
| refuse-not-clamp | — | coverage vs correctness | **not a knob** — derived from the release gate's wrong=0 bar; revisit only if the owner revisits the bar |

`MIN_CROP_WIDTH_PX` exists on both sides of the network boundary (`crop.ts` and `render.mjs` —
the container cannot import Worker TS). A repo test asserts the two stay equal.

## 12. Affected files — the hand-off index

Discovery is done; the developer starts from these, not from a search. (Slices and ordering:
`docs/runs/plan-parse/02-tasks.json`.)

**Exists, unchanged by this plan (context):**
- `containers/plan-parse/` — `server.mjs`, `render.mjs`, `validate.mjs`, `verify.mjs`,
  `Dockerfile` — the container, built and verified this session (t7 extends it).
- `worker/lib/drawing/crop.ts` — `cropBoxFor`, refusal semantics, `MIN_CROP_WIDTH_PX`.
- `worker/lib/drawing/container.ts` — `CropIntent/CropRequest`, `buildCropRequest`,
  `MAX_CROPS_PER_CALL`.
- `worker/lib/ai/ingest.ts` — page routing, fixed this session.
- `scripts/research/plan-geometry/` — the calibration harness (`measure.mjs` gates), source
  of the frame matchers t7 ports.

**To create:**
- `worker/lib/drawing/planParseContainer.ts` — `PlanParseContainer extends Container`
  (`@cloudflare/containers`), `defaultPort = 8080`, `sleepAfter`.
- `worker/lib/drawing/containerClient.ts` — request framing (JSON header line + PDF bytes, the
  framing `server.mjs:49` already parses), response decode, failure mapping; pure parts
  exported for tests; instance key `projectId:sourceGeneration` (§3.1).
- `worker/lib/estimator/skills/drawingRead.ts` — two skills beside the existing three
  (`plan.ts`, `schedule.ts`, `energy.ts` show the shape, incl. `imageDataUrl` parts):
  `elevationInventory` (Pass A) and `openingComposition` (§4.3), schemas with a first-class
  decline.
- `worker/lib/drawing/assign.ts` — Pass B, pure (§4.2 rules).
- `worker/lib/drawing/verifyReading.ts` — checks 1 and 3 pure; check 2 wiring in t7.
- `worker/lib/drawing/frames.ts` — t7 port of the matchers from
  `scripts/research/plan-geometry/frames.mjs` (pure; segments arrive from the container).
- `worker/lib/drawing/toHint.ts` — reading → `SplitHint{source:"drawing"}` with §6 width
  precedence and the count-conflict review flag.
- `worker/lib/drawing/read.ts` — the orchestrator: R2 read (once), elevation regions from
  positioned text, container calls, `runStage` per elevation and per opening, verification,
  evidence + crop persistence, progress callback. The only new file that touches `env`.
- `migrations/0059_drawing_read_progress.sql` — §10.
- `src/ops2/projects/DrawingReadings.tsx` — the ops readings panel.
- `scripts/tests/drawing-evidence-api.test.mjs` — NEW suite (§13).

**To modify (line/symbol):**
- `wrangler.jsonc` — `containers` + `durable_objects` + `new_sqlite_classes` migration
  (bindings block, after `r2_buckets` ~line 45).
- `worker/types.ts` — `Env.PLAN_PARSE: DurableObjectNamespace` (near `AI_GATEWAY_ID`, ~48).
- `worker/index.ts` — export `PlanParseContainer`.
- `package.json` — `@cloudflare/containers` dependency; new test script + suite wiring (§13).
- `worker/lib/estimator/split.ts:144` — `source` union gains `"drawing"`; `SplitUnitHint`
  gains `ratio?: number`; ratio → widths via the §1.2 rounding rule.
- `worker/lib/estimator/pairing.ts:15` — correct the precedence comment (§4.5).
- `worker/lib/ai/pipeline.ts` — invoke `read.ts` after `mergeScheduleLines`/`applyPlanContext`
  (~700–740); extend the plan-wins guard at ~784 to cover `source === "drawing"`; evidence
  into `o.evidence`; progress counts beside `setProgress` (~541).
- `worker/routes/parse.ts` — SELECT + response gain the two count fields (~371–400).
- `src/data/api.ts` — `ExtractionRun` gains `drawingsDone`/`drawingsTotal` (~585).
- `src/data/useProjectDocuments.ts` — render "reading opening N of M" (~347).
- `worker/routes/ops.ts` — readings summary on the project read; crop route beside the staff
  download (~2274), same audit-log pattern.
- `src/ops2/projects/ProjectRecordPage.tsx` — host the readings panel.
- `worker/lib/drawing/index.ts` — export the new pure modules.
- `containers/plan-parse/{server,render,validate,verify}.mjs` — t7 segments operation.

## 13. Test plan

Every named file below is created or extended by a task in `02-tasks.json`; a design-named
test that never materialises is the pipeline's most-repeated failure and is checked at
conformance.

| suite | runs in | covers |
|---|---|---|
| `scripts/tests/drawing.test.mjs` (exists, `test:pure` / `test:drawing`) | node, pure | container client framing/decode + failure mapping; `assign` (two-signal disagreement ⇒ not read; one-box-two-rows ⇒ both not read); `verifyReading` checks 1 & 3; `toHint` (§6 width precedence, count conflict); frames port against fixture segments; `MIN_CROP_WIDTH_PX` equality across the boundary; existing crop/request/Dockerfile assertions stay green |
| `scripts/tests/estimator-split.test.mjs` (exists, `test:composite`) | node, pure | `ratio` → widths through `proposeSplit` (§1.2 rounding: all-but-last, exact partition) |
| `scripts/tests/ai-pipeline.test.mjs` (exists, `test:ai-pipeline`) | node | drawing hints merge ABOVE comment and energy for shape; components still attach; `not read` leaves today's fallback untouched; progress counts written under the token guard; customer summary/diagnostic never carries unreads |
| `scripts/tests/drawing-evidence-api.test.mjs` (**new**; wire into `test:heavy` and add `test:drawing-api`) | node | ops readings + crop routes: staff OK; customer token denied; **manufacturer-partner session denied** (executed abuse cases, §9.4); crop key read from row not request; audit line written |
| `scripts/tests/web/customer.spec.ts` (exists) | Playwright | "reading opening 7 of 20" renders from a stubbed run with counts; absent counts ⇒ today's phase label |
| `scripts/tests/web/ops2-record.spec.ts` (exists) | Playwright | readings panel: provenance per line, an unread listed, a disagreement listed, crop image requested |
| `containers/plan-parse/verify.mjs` (exists; manual, fixture-gated) | node + fixture | end-to-end render/crop against the real set; extended for the segments op in t7 |
| `scripts/research/plan-geometry/measure.mjs` (exists; manual, fixture-gated) | node + fixture | the calibration gate — §2/§2a tables enforced, exits non-zero on drift |

## 14. Decisions

**Settled (owner):** the route (§1); Node + vision-call-in-Worker (§3.3); comment-wins-widths
(§6); no-hopper / schedule-names-the-family (§5); customer sees successes only, ops sees gaps
and disagreements (§7.2–7.3); customer waits on screen, per opening (§7.1).

**Open — carried forward:**

1. **Is a drawing-derived split allowed to flow through unreviewed?** Behind the review gate
   the question is moot, and it sharpens under the model route: the geometric figure was wrong
   by a bounded ±2.5%, whereas a model's wrong reading is a *different window*. The
   verification stage exists for that; whether it suffices to remove the review gate is
   decided later, against §8's fixture, never implied by shipping.

**Decisions needed (new, this pass):**

- **D1 — Crop retention.** Crops are fragments of customer drawings held in R2. Options:
  (a) live with the project — deleted when the project's files are deleted, which requires the
  already-missing R2 prefix cleanup to be ticketed and built; (b) fixed TTL (e.g. 90 days) via
  an R2 lifecycle rule on `projects/*/runs/*/crops/`; (c) indefinite. **Recommended: (a)**,
  with fixture crops (§8) surviving only as an explicit copy made when the owner labels them —
  review evidence and training corpus are different retentions and should not share a default.
- **D2 — N, the ground-truth set count** (§8). How many real sets the owner will confirm
  opening-by-opening in the ops surface before the wrong-rate means anything.
  **Recommended: 10**, revisited after the first 3.
- **D3 — Spend headroom.** Roughly 21–26 vision calls per parsed set (Pass A per elevation +
  one per opening + retries) against the AI Gateway's $20/mo cap, plus the container add-on
  beyond its free allowance. Trivial per job at flash pricing, but the cap is monthly and
  shared with every other skill: confirm the cap, or set the number the gateway should hold.

---

# PART II — THE RECORD

*Everything below is retained as history: the superseded headline, the errors that were mine,
the evidence that calibrated the method, and the demoted geometric route whose output contract,
precedence rules and landing zone still bind the model route. Nothing here overrides Part I.*

## The superseded headline (pre-ROUTE-DECISION)

*The original headline, kept because its measurements are sound and only its conclusion was:*
W1's composition is in the document's **vector line-work**, and it reads out in 110 ms using
`unpdf` — the dependency the Worker already has. No rasteriser, no canvas, no WASM, no
container, no model call. Three independently written decoders returned the same eight
coordinates. *It then concluded "rasterisation is not on the critical path", which was the
wrong lesson from a right measurement: reading the line-work precisely was never the hard part,
and finding out which window the line-work belongs to is.*

## What the previous version of this document got wrong

It is worth recording, because the errors were confident and they were mine.

1. **"The container touches pixels, nothing else."** There is nothing for it to touch. This is a
   vector set with a clean text layer on all 14 pages; the only raster anywhere is a 149×149
   logo in the title block.
2. **"The hard part is finding the elevation via the tag circle."** Elevations carry **zero**
   window tags — exact-token scanning finds `W`-tags on pages 4 and 5 only. `W1/S08` routes
   from the plan, but the elevation itself is unlabelled, so matching a drawing to a schedule
   row is a *geometric* problem (match the frame's measured size to the row's dimensions), not
   a text join. My routing design was solving a problem the document does not have and missing
   the one it does.
3. **"Feasibility is proven, so stage 1 should de-risk routing."** Both halves wrong. What
   needed proving was whether *we* could extract it in *our* runtime — and that has now been
   done, in this session, rather than planned.

## §1 (historical) — the method being reproduced

SKILL.md's six steps, unchanged: inventory cheaply → choose a strategy → text extraction for
data → **rasterise only what matters and look at it** → do both when precision matters → manage
tokens explicitly.

**All six now run as written, step 4 included.** *(Rewritten 2026-08-27 by the ROUTE DECISION.)*

This section previously argued that only step 4 changed, on the grounds that **for a vector
drawing the geometry is more precise than any image of it** — a mullion position to the
millimetre is the entire deliverable, and the path operators state what a raster only estimates.

*That is still true, and it is still not the point.* Precision was never the binding constraint;
**locating the opening was**, and that is a tag on a leader line, an octagon carrying two lines
of text, and an elevation letter on a wall — none of which is line-work, and all of which step 4
handles by looking. A decoder that measures a mullion to 0.1 mm and cannot tell you which window
it belongs to has answered the easy half. The geometry keeps its precision advantage in the role
it now has: the second opinion of the verification stage, where being exact and free is exactly
what a cross-check should be.

The platform had no step 2 at all before this effort. It ran one path for everything, and that
path was text.

## §2 (historical) — the evidence

All measured against the reference plan set — job 20016, a two-storey detached house, 14
pages, producer "Microsoft: Print To PDF". It is a customer document and is identified here
by its job number only; `scripts/research/plan-geometry/README.md` says how to fetch it.

**W1, decoded from page 6 (Elevation A):**

```
FRAME at pt(684.4, 533.8)   measured 2048.9 × 2104.0 mm   (schedule says 2050 × 2100)
verticals, mm from left:  0 | 25.4 | 50.8 | 698.5 | 723.9 | 740.8 | 2027.8 | 2048.9
diagonals: 2 — apex at the bottom of the left leaf only

left leaf   25.4 → 723.9  =  698.5 mm   one V symbol   → awning
mullion    723.9 → 740.8  =   16.9 mm
right leaf 740.8 → 2027.8 = 1287.0 mm   no symbol      → fixed
```

**The method validates against ground truth the drafter wrote himself.** W4 is the only opening
whose make-up appears both in words and in line-work. Its comment says `2x 600mm WIDE AWNINGS`;
the decode measures leaves of **596.9** and **601.1**. The drawing agrees with the human to
within 3 mm, without being told the answer.

**W14 and W16 reproduce W1's internal structure — confirmed, after I wrongly denied it.**
*(2026-08-27.)* W14's frame sits at `pt(684.3, 620.5)`, the same x as W1 and directly above it:
the first-floor window over the ground-floor one on Elevation A. Its composition reads
`awning 698.5 | fixed 1286.9`, ratios `0.352 / 0.648` — W1's, to the millimetre.

*Retraction of a retraction, and the more useful half of this entry.* Earlier today this
paragraph said the claim "was wrong" and that no frame of their size resolved. That was my
matcher's limitation reported as a fact about the drawing. `findFrames` requires each stile to
be its own segment of the opening's height, which holds for a window drawn in clear space and
fails for one whose jamb is shared with a wall line — as W14, W15 and W16's are, being upper
storey. **The original observation was right and the refutation was the error.** `findFramesV2`
takes the weaker, truer requirement — a stile may be *part* of a longer line, provided head and
sill rails bound it — and finds all three.

Two things worth keeping from it. `not read` was the correct thing to write while the harness
could not see them, and writing `not drawn` instead would have put a false statement about the
world into this document. And a measurement is not evidence about a drawing until something
independent agrees with it: five review rounds hardened gates around a table that was wrong,
because the gates asserted what the matcher said rather than what the sheet showed.

**Cost:** page 6 is 31,082 operators → 5,928 segments in 110 ms; page 7 is 36,415 → 8,924 in
70 ms. Peak heap for the whole job, text plus both elevations: **34 MB** in node.

## §2a (historical) — the whole set, measured — 2026-08-27

§2 was calibrated on two openings. This is all nineteen, decoded by
`scripts/research/plan-geometry/` against the same document.

| outcome | n | which |
|---|---|---|
| **Read, with composition** | **12** | W1 W2 W3 W4 W7 W8 W10 W12 W15 D2 D3 D4 |
| Awaiting disambiguation | 6 | W5/W6, W9/W11 — two frames, two rows; W14/W16 — **one** frame, two rows |
| **Not read** | 1 | D1 |

**What is still unread, and the evidence for it.** D1 and W15 are both 1380 mm wide, and every
height drawn at a 1380 mm width across both elevation sheets is `830, 889, 978, 1490, 1975,
2718`. W15's 1975 is inside 2% of its stated 2000 and reads as a single fixed unit of 1329.3 mm,
which agrees with the schedule calling it FIXED. D1's 2405 has nothing within 2%, at that width
or at the 1200 mm the energy report gives it — the trick that settled W4 does not settle this.
It is `not read`, which is not a claim that it is undrawn.

Reproduce with `node scripts/research/plan-geometry/measure.mjs`. It accounts for every one of
the nineteen and **exits non-zero** if this table, the eight verticals of §2, or either
calibration point drifts. Both gates are needed and neither is sufficient: the table alone
would pass a decoder that found every window and measured them all wrongly, and
the calibration alone would pass one that lost half of them.

**Which verticals bound a leaf — the rule, replacing a tolerance.** A frame elevation draws
three concentric bands, and only one is the sash:

| band | fraction of the opening | W1 | W2 | D2 |
|---|---|---|---|---|
| outer frame | 99–100% | 0, 2048.9 | 0, 3501.0 | 0, 965.2 |
| **sash** | **93–98%** | **25.4, 723.9, 740.8, 2027.8** | **25.4, 3475.6** | **25.4, 944.0** |
| glass line | ~95% | 50.8, 698.5 | — | — |

The fractions overlap between openings, which is the point: no single cutoff separates them.

The leaves are bounded by the **sash** band and nothing else. W4 settles it, being the one
opening whose make-up its drafter also wrote in words — `2x 600mm WIDE AWNINGS`:

| band | W4 leaves | error against the stated 600 |
|---|---|---|
| **sash, 97.6%** | **596.9 \| 1913.5 \| 601.1** | **3.1 mm and 1.1 mm** |
| glass, 95.0% | 546.1 \| 2006.6 \| 546.1 | 54 mm |

**The sash is the outermost band that is not the frame itself** — outermost rather than
most-populous, because the sash sits outside the glass by construction whereas line counts
depend on the drawing. D3's glass band carries four lines to its sash band's three, so choosing
by count reads that slider through its glazing.

**And the frame is identified by what it is, not by a threshold.** A band whose every line lies
on the frame's own edges *is* the rectangle the lookup matched, so it is discarded; a band that
merely reaches an edge is kept, because D3's sash band starts at the jamb and discarding it by
position would lose a real panel boundary.

Two rules were tried here and both were tolerances wearing a rule's clothes. An inset tolerance
happened to drop the glass line and, tightened slightly, dropped the sash band instead. A
`frac < 0.995` cutoff for "this band is the frame" held only because W1's outer band is drawn at
exactly 100% — **W2's is at 99.4% and D2's at 99.1%**, so both slipped through and were then
chosen, making the entire frame a single "leaf" (W2 read 3501.0 for a 3450.2 sash). That failure
is invisible in a one-unit opening, where the ratio is 1.000 either way and only the width
betrays it, which is why single-unit openings are now where it is pinned.

Stating the rule properly also fixed a real misreading it had been hiding: **D3**, a 3000 mm
slider, read as one 2942 mm unit and now resolves to three panels at 952.5 | 999.1 | 952.5.

**`not read` is not the same as `not drawn`, and this section is the proof of it.** The
distinction is the output spec's §4 and it is not pedantry. Four openings were recorded here as
`not read`. Three of them — W14, W15, W16 — were then found, once the matcher stopped requiring
a stile to be its own segment. Had they been recorded as `not drawn`, this document would have
carried a false statement about the building, and the correction would have been an
embarrassment rather than an edit.

D1 alone remains, and the weaker claim is all that is being made about it: no frame within 2% of
its stated size resolves on either elevation, at its 1380 mm or at the 1200 the energy report
gives it. Whether it is drawn is not established.

The output is identical either way, and correct either way: the row keeps everything the
schedule gave it. **Nothing was read wrongly**, which is the property that matters — a wrong
composition is a priced window nobody drew, and a missing one is a fallback doing its job
visibly.

**Both calibration points reproduce exactly**, which is what licenses the rest:

```
W1   OP 698.5mm r=0.352  |  fx 1286.9mm r=0.648      §2 says 698.5 / 1287.0 / 0.352 / 0.648
W4   OP 596.9  |  fx 1913.5  |  OP 601.1             the drafter wrote "2x 600mm WIDE AWNINGS"
```

W4 lands 3.1 mm and 1.1 mm from a figure a human typed, without being told it.

**The ambiguity is three times what the family ruling's section assumed.** It named W14/W16 as
the only same-size pair. They are one, and so are **W5/W6** and **W9/W11** — three pairs, six
openings. Disambiguation therefore buys 6 openings, not 2.

**A conflict the drawing settles.** W4's drawn frame is **3200 × 2100** — the energy report's
figure, not the schedule's 2410 × 1800. `conf_energy_2` on this project has been flagged for
review since July with no tiebreaker. The line-work is one, and it sides with the report. This
is the first case of the drawings arbitrating a conflict rather than creating one.

**Cost, re-measured:** both elevation sheets decoded in **~660 ms**, peak heap **48 MB**, whole
19-opening sweep **~930 ms**. Zero tokens, zero model calls, no new dependency. The sweep was
409 ms before the rail-driven fallback; it runs only where the strict pass finds nothing, and
three openings were worth the difference.

## §3 (historical) — the cheap route is dead — proven, not assumed

The printed schedule has eight columns and the shipped parser already reads all eight:

```
W N° | HEIGHT | WIDTH | HEAD HT. | GLAZING | D.GLAZE REQ. | WINDOW TYPE | COMMENTS
```

Run against the real file it returns 19 rows, zero warnings, and for W1:
`{itemNo:"1", heightMm:2100, widthMm:2050, headHtMm:2400, glazing:"CLEAR", doubleGlaze:true,
typeText:"OFFSET AWNING", comments:null}`.

There is no unread column. `comments` is genuinely null for W1, W14 and W16. The sheet's own
legend says the schedule *"nominates window sizes and head heights"* — sizes, not make-up.
`OFFSET AWNING` names a family, not a split.

**So it is the drawings or nothing.**

## §4 (historical) — the page-router defect. FIXED this session.

*Fixed in `worker/lib/ai/ingest.ts` by commits `00669315` and `0d59a4e7`; kept because the
diagnosis explains the fix's shape.* Running the then-shipped `classifyPageRoles` against the
real document:

```
ROLES {"schedule":[4,5,7], "energy_report":[], "plans":[12,14]}

 4  floor plan, tags W1–W6          ← not selected as plans
 5  floor plan, tags W7–W16         ← not selected
 6  ELEVATIONS A & B  (W1 lives here) ← not selected
 7  ELEVATIONS C & D + the schedule   ← not selected
12  1:20 construction details        ← SELECTED
14  NCC compliance sheet             ← SELECTED
```

The rule required two plan signals; the four real drawing sheets scored one, because a CAD
title block emits the label "Scale" about forty characters from the value "1 : 100", so
`/\bscale\s*1\s*:/` never matched. Pages 12 and 14 matched only because they carry inline
prose "SCALE 1:20". Downstream, `pipeline.ts` read `doc.roleText.plans ?? doc.markdown` — and
because `rolePages.plans` was non-empty, the fallback to full text never fired. **The plan
skill was fed a stair detail on every architectural set.** The fix: only a sheet that NAMES a
drawing is a drawing sheet; section marks, scales and north points corroborate, never qualify.

## §5 (historical) — design of the DEMOTED geometric route

*Retained as written. Its output contract, its precedence rules and its Stage 8 landing zone
still bind the model route; its Stages 4–6 describe the second opinion, not the answer. See the
ROUTE DECISION.*

**Stage 1 — Inventory** *(extend existing)*. `ingest.ts` already opens the document and
reads the text layer. On the same proxy add: page count, per-page size and rotation, text-item
count, image-XObject census, attachments, form fields. ~30 ms + 1 ms/page. Persist it — it is
what makes a bad parse diagnosable a month later.

**Stage 2 — Strategy** *(new, small, pure)*. From the inventory: text items ≥ ~50/page and
image area < 50% → `text_vector` (this document); text over a full-page image → `text_raster`;
no text layer → `scanned`, which **stops and emits a named gap rather than guessing.** This is
the cheapest item on the list and it converts a silent wrong answer into a reportable one.

**Stage 3 — Page selection** *(fix the defect above, then extend)*. Tier A: an elevation
callout. Tier B: a floor-plan title plus ≥3 distinct `W\d{1,2}` tags. Tier C: a schedule header
where the text parse found no rows. Validated at 4/14 on this document with zero false
positives.

> **Hard rule: never call `getOperatorList` on an unselected page.** Page 3 (the landscape
> plan) alone is 348,687 operators and 56 MB of heap. Page selection is a correctness
> requirement here, not an optimisation.

**Stage 4 — Geometry** *(the only stage never implemented in the Worker)*. `getOperatorList`
per selected page; decode `constructPath`; compose the CTM through save/restore/transform;
bucket into vertical / horizontal / diagonal; `page.cleanup()` between pages. Scale from the
title block's `1 : 100`.

**Stage 5 — Frame lookup, per known opening.** **Driven by the openings list, one row at a
time.** For a row of 2050 × 2100, search the selected pages for a rectangle of that size; then
read its internal full-height verticals as mullions and count diagonals per leaf, left to
right.

**Rejection is the work, not extraction.** A strict matcher searching for W1's 2050 × 2100 also
returned the title-block logo border as a 2091 × 2091 mm "window". Because the target size is
known, rejection is cheap and rule-based:

- a candidate whose measured size differs from the row by **>2%** is not that window;
- a real frame contains at least one leaf whose head and sill rails span the same x-range —
  two bare verticals with no internal rails is furniture;
- **zero candidates or two-plus surviving candidates ⇒ composition is *not stated* for that
  opening.** Never a guess, and the row keeps everything the schedule gave it.

**Stage 6 — Disambiguation only.** Needed **only** when two rows share dimensions, because
then a matched frame could belong to either. On this document the pairs are **W5/W6**
(850 × 2057), **W9/W11** (1810 × 1027) and **W14/W16** (2050 × 2000) — six openings across
three pairs.

**W14/W16 arrive at this stage from the other direction, and it matters.** W5/W6 and W9/W11 each
produce *two* frames for two rows: the frames are there and the question is which is which.
W14/W16 produce *one* frame for two rows, so either the second is drawn somewhere this pass does
not look, or one of the two rows is not drawn at all. Both are settled by the same evidence — the
tag order on the floor plan — but the second case must never be resolved by assigning the one
frame to both, which is what an earlier version of the harness did silently.

Tags come from `getTextContent` on the floor plans; no operator list, ~30–50 ms. Two verified
traps: each tag is an octagon carrying **two** lines (`W1` over `S08`), so a single-token reader
mis-segments; and a legend decoy `W1` sits at (975, 486) on both plan pages, rejectable because
its second line reads `S7`. Resolution is ordering along the wall from plan-view tag positions
against order along the elevation.

Worth stating plainly: **when two identical rows resolve to identical compositions, the
ambiguity does not matter.** Disambiguation only has to work the day two same-sized openings
are drawn differently, and until then a mismatch between them is itself the signal that this
stage is needed. Whether that day has arrived on W5/W6 and W9/W11 is not yet measured — the
sweep records them as two candidates and stops there, which is the correct conservative
outcome either way.

**Stage 7 — Output.** Conforms to the spec. For W1:

```json
{ "tag": "W1", "divisionAxis": "vertical",
  "composition": [ { "operation": "awning", "ratio": 0.352 },
                   { "operation": "fixed",  "ratio": 0.648 } ],
  "wallOrientation": null, "wallOrientationState": "not_read",
  "dimensionAgreement": { "drawnWidthMm": 2049, "drawnHeightMm": 2104, "agrees": true },
  "evidence": { "pageNo": 6, "sheetRef": "A5", "region": [0.575, 0.295, 0.624, 0.366] } }
```

*The region's y was `0.634, 0.705` here until 2026-08-27, which is page space — y measured up
from the bottom. `Region` is **top-left**, as `types.ts` states and `evidence_items.region_json`
stores, because every consumer of it is a browser. The two are 1−y apart, so implementing from
this example would have produced a crop of whatever sits at the mirror image of the window,
once, silently. Verified the other way round: `toRegion` → `cropBoxFor` → `sharp.extract` on the
real sheet returns W1's own frame, chevron and all.*

No `widthMm` on either unit — this sheet does not dimension them and the spec forbids
back-calculating (§1.2). Orientation is left null **by this pass**, which reads elevations; it
is obtainable by a separate route and is not a reason to hold the composition back.

#### Orientation is readable after all — from the survey, not from a compass rose

An earlier draft of this document said orientation was unreadable, on the grounds that the north
point is a symbol and no compass word appears near any elevation. Both facts are true and the
conclusion was wrong. **The site plan states the lot's boundary bearings as text** *[verified]*:

```
p2:  178°22'10"   268°22'10"   358°22'10"   268°22'10"
```

A rectangular lot with its axes on 88°/268° and 178°/358°. **268°22'10" is west**, which agrees
with the independently-reported "front (west-facing) wall" for W1. No symbol recognition is
needed for the hard part — the bearings are text, and text is free.

The remaining chain is coordinates, not pixels *[inferred, not yet built]*:

1. bearings → the lot's compass axes *(verified: text)*
2. the `FRONT` / `REAR` labels' positions on the site plan → which axis end is the street
3. a window tag's position on the floor plan → which wall of the building it sits in
4. wall → outward normal → one of the eight compass points

Note step 3 makes the elevation letter unnecessary: the floor plan gives the wall directly, and
`ELEVATION A`…`D` carry no face name in the text anyway *(verified — page 6 has "FRONT ELEVATION
MATERIALS TABLE", which is a materials table, not an elevation title)*.

**Corroborated independently, on two openings from different levels.** The agent that read this
set reported W1 as "the front (west-facing) wall of the Study… Elevation A" and W9 as "the
right-hand (east-facing) wall serving Bed 3… Elevation C". So `A = west`, `C = east` — opposite
faces, consistent with the 88°/268° axis the bearings give. Two openings, two levels, two
elevations, one coherent compass frame, arrived at without reading a north arrow.

"Right-hand" is the tell for the route: it is a plan-view relative term, so that agent located
the window on the floor plan and mapped right→east through the site plan. Steps 3 and 4, by a
human-shaped path.

**The consequence for the design: orientation is ONE determination per building, not one per
opening.** Fix the compass frame once from the bearings, and every window inherits it from its
wall position on the floor plan. The elevation letters then become a cross-check — if the frame
says a window is on the east wall and it is drawn on the elevation that other windows place to
the west, something is wrong and both should be flagged.

**The ratio convention, decided by measurement.** Two candidates, tested against W4 where the
drafter wrote the answer down:

| convention | W4 → | stated | error |
|---|---|---|---|
| joiner centreline over outer width | 635 \| 1935 \| 635 | 600 \| 2000 \| 600 | 35 mm |
| **leaf-span normalised** | **615 \| 1970 \| 615** | 600 \| 2000 \| 600 | **15 mm** |

Use leaf-span normalisation: it distributes the joiner and frame material pro rata rather than
dumping it on the outer units. For W1 that gives 0.352 / 0.648, which through the spec's
rounding rule at the schedule's 2050 yields **720 | 1330**, partitioning exactly. Residual
accuracy ±2.5%, which the spec already anticipates.

**Stage 8 — Into the estimator.** A drawing-derived hint is a new **source**, not a new
mechanism: `SplitHint.source` gains `"drawing"`, `SplitUnitHint` gains an optional `ratio`.
`pairing.ts` already lists `drawing-derived split` in its precedence chain and its own comment
anticipates this. Evidence columns (`page_no`, `sheet_ref`, `region_json`) already exist in
migration 0016 and every writer passes `null` today — the frame's bounding box fills all three
with no schema work.

**~~No model call on the primary path.~~ INVERTED by the ROUTE DECISION.** The geometry does
produce exact numbers at no token cost, and that is why it survives as the second opinion — but
the model call *is* the primary path now, and the escalation runs the other way: where the
decoder and the model disagree, or the model declines, a human looks.
`frame_decomposition_uncertain` still exists and is still the right code for it.

## Withdrawn by the ROUTE DECISION

**Stage 1a — "does the geometry run in workerd, in 128 MB?"** No longer on the critical path.
It was the gate on hosting the geometric decoder in the isolate; the decoder is now the second
opinion and the job has a container regardless — which is also why Part I §4.4 runs the segment
extraction in the container rather than re-opening this question.

**Stage 1b — "does it generalise to a second plan set?"** Withdrawn *as a gate*, kept *as a
measurement*. It no longer decides the route — that is settled, and the owner's reasoning was
precisely that it would come back low. It remains the only honest test of any route, including
this one, and the owner has a second set to supply. Everything in §2a is one drafter, one CAD
chain. Its successor is the ground-truth fixture of Part I §8.

## Resolved questions (the trail)

1. ~~When a drawing and a stated dimension disagree, which wins?~~ **DECIDED, owner
   2026-08-07** — Part I §6.
2. ~~`wallOrientation` is unreadable on this set.~~ **WITHDRAWN — it was wrong.** See §5's
   orientation entry above; only scheduling remains, not feasibility.
3. ~~`DEFAULT_PROFILE.confirmed`~~ **RESOLVED, owner 2026-08-07** — Part I §5.
4. ~~Who owns a practice's symbol profile?~~ **MOOT under both routes** — nothing claims a
   family from a symbol, so no profile has to be owned, stored or confirmed.
5. ~~Node or Python in the container, and where does the vision call live?~~ **DECIDED, owner
   2026-08-27** — Part I §3.3.
6. ~~Does the customer wait on screen, and at what granularity?~~ **DECIDED, owner
   2026-08-27** — Part I §7.
