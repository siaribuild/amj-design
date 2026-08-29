# Plan-parse remediation — epics, stories, acceptance criteria

**Status:** plan v2, approved for build. Supersedes v1 of this file (git history has it).
Incorporates the 2026-08-29 Codex review verdict and findings, cross-verified against the
code — every claim below was checked against the named file before it was written down.
**For:** a developer session (Sonnet), working story by story under Probity TDD.
**Root cause on record (owner):** the original instructions were the source of truth and
got lost along the way. The two method documents committed beside this file are binding:

- [`window-door-parsing-agent-instructions.md`](window-door-parsing-agent-instructions.md) — "Method §…" below
- [`window-door-parsing-agent-cloudflare-workers.md`](window-door-parsing-agent-cloudflare-workers.md) — "Workers §…" below

Where this plan and those documents disagree, the documents win.

## Standing rulings that still bind

- The platform's schedule extraction is authoritative (00-ask.md §1). Enrichment consumes
  its rows; never re-derives, never contradicts.
- The container stays (owner, 00-ask.md §4). The Workers doc's mupdf-in-Worker route is a
  known conflict, deferred — delivery is not what failed.
- Three-state honesty (`value` / `not_stated` / `not_read`, never guess) — already
  implemented, keep.
- Stateless container seam, whole PDF per call (drawing-parse-design §3.2) — keep; E6
  batches *within* it, it does not add state.
- Orchestration migration to Cloudflare Workflows (Workers §Orchestration) is **deferred**:
  raise as a DECISIONS.md entry after E7; do not build it in this pass.
- D-1: **19 of 19 on the reference set, zero wrong readings, zero wrong placements, or it
  has not worked.** The feature does not run in production for customers until E8 passes.

## Ground rules for the developer session

1. **Probity is on.** One observed-failing test before each production write; one new test
   per write. Red → green → refactor. Do not batch stories into one giant diff.
2. **AB-9:** no real drawings, no image/PDF bytes in fixtures. Worker tests use synthetic
   word lists / canned container responses (`scripts/tests/drawing-enrichment.test.mjs`
   pattern); container tests use the synthetic PDF in `containers/plan-parse/tests`.
3. **Container changes** ship via CI (`.github/workflows/container-build.yml`) on merge;
   the deployed image tag in `wrangler.jsonc` is bumped **by hand** afterwards. Batch the
   container stories (E3, E6) into as few image bumps as practical — each story still
   lands with its own pytest coverage.
4. **Any `migrations/` change:** load `.claude/skills/d1-migration-safety/` first.
   Additive only.
5. Scope: `worker/lib/drawing/`, `worker/lib/ai/pipeline.ts` (stage call site + catch),
   `worker/lib/ai/jobs.ts` (progress/deadline), `containers/plan-parse/`,
   `src/data/useProjectDocuments.ts` (progress display only), their tests, and one
   migration. Nothing else without a named story.
6. The pipeline's mandatory four-reviewer `review` stage applies to this work.

## What production did (recognise the bug when you see it)

Two runs, 2026-08-29 ([`03-deploy-findings.md`](03-deploy-findings.md), amended by the
Codex review): run 1 killed by the then-240s lease; run 2 ran 6m17s, ticked 19/19 — **19
marked processed, all unread** — then the whole extraction failed `PIPELINE_INTERNAL_ERROR`
with the real exception discarded and the drawing report never persisted. Zero
`elevation_inventory` calls, zero `opening_read` calls, three `floorplan_read` calls. The
~4-minute silence was `/inspect` itself: per-page `pdftotext` subprocesses plus a full
`pdfplumber.open` per page for words, on ¼ vCPU — words that the Worker then never read.

---

# E0 — Stabilise production (do first, same day)

## S0.1 — Enrichment off until the gate passes

**Why:** Codex P0. Both post-flip uploads failed the entire extraction. D-1 forbids this
being live.

**Files:** `wrangler.jsonc` (line ~133, `vars.AI_EXTRACTION_MODE`).

**Do:** set `"AI_EXTRACTION_MODE": "auto"`. Confirm with the owner that the dashboard var
matches (the dashboard copy wins at runtime; the two must not drift). Deploy per protocol.

**AC:**
- [ ] `wrangler.jsonc` says `auto`; the deployed Worker's binding list shows `auto`.
- [ ] A test upload completes extraction end-to-end (the pre-feature behaviour).
- [ ] The comment block above the var still documents `auto_drawings` and points at this
      plan's E8 as the condition for flipping back.

## S0.2 — Per-endpoint container budgets that can actually fire

**Why:** Codex finding 12: a 600 s call timeout under a 600 s job lease loses the race —
the lease kills the job before the timeout ever reports. A timeout that cannot fire is
documentation, not a boundary.

**Files:** `worker/lib/drawing/containerClient.ts` (replace the single
`CONTAINER_CALL_TIMEOUT_MS = 600_000`), `worker/lib/ai/jobs.ts` (`aiJobDeadlineMs`),
`scripts/tests/drawing-enrichment.test.mjs`, `scripts/tests/ai-jobs.test.mjs`.

**Do:** two named constants — `INSPECT_TIMEOUT_MS = 120_000`, `RENDER_TIMEOUT_MS =
60_000` — used as the defaults of `inspectPdf` / `renderPage` respectively (the
`timeoutMs` parameter stays for tests). Keep the lease at 600 s for now; E3 shrinks
inspect reality to fit the budget, and a follow-up story right-sizes the lease from E1's
timing data. These budgets are safe to land immediately because S0.1 turned the stage off.

**AC:**
- [ ] Both constants exported and asserted by name in a test (so a silent change is red).
- [ ] `renderPage` with a hanging namespace rejects with `ContainerClientError("timeout")`
      within its budget (existing hanging-namespace test extended).
- [ ] `aiJobDeadlineMs` test updated to state the invariant: every per-call budget
      < the `auto_drawings` lease. Express it as an assertion importing both numbers, not
      as a comment.

---

# E1 — Diagnosability before behaviour (nothing else lands until this does)

## S1.1 — The report and readings persist the moment enrichment ends

**Why:** Codex finding 11. Today `drawing_report_json` is written at
`pipeline.ts:1083-1085` and `persistReadings` runs at `:1077` — both *after* estimation.
Run 2 reached 19/19 and a later failure destroyed the only diagnostic artefact.

**Files:** `worker/lib/ai/pipeline.ts` (the enrichment block at ~761-781 and the
persistence block at ~1075-1086), `scripts/tests/ai-pipeline.test.mjs` (or the suite that
exercises `runAiExtraction` — follow the existing test ownership in package.json).

**Do:** move the `UPDATE ai_runs SET drawing_report_json=?` and `persistReadings(...)`
calls to immediately after `runDrawingEnrichmentStage` returns, inside the same try
block. `applyDrawingRoom` **stays post-estimate** (it guards `quote_line` rows that do
not exist yet — the comment in `readings.ts` explains why).

**AC:**
- [ ] Given enrichment returns readings and a report, When estimation later throws, Then
      `ai_runs.drawing_report_json` is populated and `drawing_reading` rows exist for
      that run.
- [ ] `applyDrawingRoom` still runs after `runProjectEstimate` (existing tests keep
      passing).

## S1.2 — The real exception survives to a log line

**Why:** Codex: "final error detail discarded; only pipeline_failed remains." The catch
at `pipeline.ts:1110` maps everything unrecognised to `PIPELINE_INTERNAL_ERROR` and
drops the error object.

**Files:** `worker/lib/ai/pipeline.ts` (the catch), test in the same suite as S1.1.

**Do:** in the catch, emit one structured line before the summary is built:
`console.log({ event: "ai_pipeline_error", aiRunId, projectId, name, message, phase })`
where `name`/`message` come from the caught error (message truncated to ~300 chars),
and `phase` is the last label passed to the existing `phase()` helper (track it in the
closure). No document text, no filenames (§21.1). The customer-facing summary is
unchanged.

**AC:**
- [ ] Given estimation throws `new Error("boom")`, When the run fails, Then the log
      event carries `name: "Error", message: "boom"` and the last phase label.
- [ ] Customer-safe diagnostic surface unchanged (existing `customerSafeJobDiagnostic`
      tests untouched and green).

## S1.3 — The enrichment stage logs its own counts

**Files:** `worker/lib/ai/pipeline.ts` (after the stage call), same test suite.

**Do:** one structured line, numbers straight off the report:
`{ event: "drawing_enrichment", aiRunId, projectId, filesTried, containerCalls,
modelCalls, readingsProduced, notReadCount, wallMs }`.

**AC:**
- [ ] Emitted exactly once per run when the stage runs; not emitted when the mode gate
      returns empty (mode `auto`).
- [ ] Counts match the report fixture in the test.

## S1.4 — Progress is honest from the first second

**Why:** Codex: "initialize progress as 0/19 before inspection… so five minutes cannot
look like no work." Today the first `setDrawingProgress` call happens on the first
per-opening tick (`enrich.ts` `tick()`), which is *after* inspect + all elevation and
floorplan work.

**Files:** `worker/lib/drawing/enrich.ts` (`enrichOpenings` /
`runDrawingEnrichmentStage`), `scripts/tests/drawing-enrichment.test.mjs`.

**Do:** call `onProgress(0, scheduleRows.length)` once, before the first container call.
(The client already renders "· N openings found" for `done === 0` — verified in
`documentChecklist`, `useProjectDocuments.ts:75-77` — so no UI change is needed.)

**AC:**
- [ ] Given a run with 19 schedule rows, When enrichment starts, Then the first
      `onProgress` observation is `(0, 19)` and it precedes any `inspect` dependency
      call (assert call order via the fake deps).
- [ ] Denominator never changes across the run (existing invariant test extended to
      cover the new initial call).

## S1.5 — Inspection reports its own phase timings

**Why:** Codex finding 2 was diagnosed from source reading, not measurement. Future
regressions must be measurable from one log line.

**Files:** `containers/plan-parse/server.py` (`_handle_inspect`),
`containers/plan-parse/steps.py`, `worker/lib/drawing/contract.ts` (`InspectResponse`),
`worker/lib/ai/pipeline.ts` or `enrich.ts` (log it), pytest + Worker test.

**Do:** the inspect response gains `timings: { inventoryMs, textMs, wordsMs, totalMs }`
(container-side wall clocks). Worker includes them in the S1.3 log event when present
(optional field — an old image without timings must not break the Worker).

**AC:**
- [ ] pytest: inspect on the synthetic PDF returns all four timing fields, each ≥ 0,
      `totalMs` ≥ the sum's parts within slack.
- [ ] Worker test: response without `timings` still validates (backwards compatible).

---

# E2 — Page classification that matches real documents

## S2.1 — A page holds a *set* of tiers

**Why:** Codex finding 3 / Method §Phase-0: "a page can have multiple types." Today
`selectPages.ts:33-39` returns the first matching tier only, and `schedule` outranks
`elevation` — a shared schedule+elevations sheet is consumed schedule-only and the
elevations are never rendered. Most probable direct cause of production's zero
elevation reads.

**Files:** `worker/lib/drawing/selectPages.ts`, `scripts/tests/drawing-enrichment.test.mjs`.

**Do:** `classify` returns *every* matching tier; `selectPages` emits one `SelectedPage`
per (page, tier) pair. Keep the specificity ordering only as output order, not as
exclusion. Pin the false-positive guard: the elevation pattern must not fire on a floor
plan whose legend merely contains the word "elevation" — require `ELEVATION` followed by
an identifier (`[A-Z]` token, `NORTH|SOUTH|EAST|WEST`, or at start-of-line). Encode the
chosen rule in a comment and a test.

**AC:**
- [ ] A fixture page containing both `WINDOW SCHEDULE` and `ELEVATION A` yields two
      `SelectedPage` rows for that pageNo (`schedule` and `elevation`).
- [ ] A floor-plan fixture whose text contains "denotes elevation marker" is selected as
      `floorplan` only.
- [ ] All existing single-tier tests green unchanged.

## S2.2 — A sheet holds *several* elevations, each with its own region

**Why:** Codex finding 4. `enrich.ts:121-125` takes the **first** `ELEVATION X` match per
page and assigns every box on the page to that letter — two elevations on one A3 sheet
(normal) cross-wires every opening on the second one.

**Files:** `worker/lib/drawing/enrich.ts` (elevation loop), new pure helper (suggested
`worker/lib/drawing/elevationRegions.ts`), `scripts/tests/drawing-enrichment.test.mjs`.

**Do:** a pure function `elevationRegions(words: PageWord[], pageWidthPt, pageHeightPt):
{ letter: string; region: [x0,y0,x1,y1] }[]` — find **all** elevation labels on the page
from its words (same identifier rule as S2.1), then partition the page among them:
midpoint splits along the axis on which the labels differ most (side-by-side → vertical
split lines halfway between label x-centres; stacked → horizontal). One label → whole
page. Zero labels → fall back to the current draw-order lettering (existing behaviour,
already tested). In the elevation loop: one 150 dpi overview render per *page* (as now),
one `elevation_inventory` model call per page, then assign each returned box to the
region containing its centre; `boxesByElevation` and `geometryByElevation` are then
keyed per letter with the region's own geometry (region width/height in points, and box
fractions re-based to the region so `assignOpenings`' left-to-right sort stays correct
within one elevation).

**AC:**
- [ ] Two labels side by side, boxes on each half → boxes land under their own letters.
- [ ] Box fractions re-based: a box at the left edge of the *right* region sorts first
      within that elevation, not after the left region's boxes.
- [ ] One label → identical behaviour to today (regression test).
- [ ] Zero labels → draw-order fallback (existing test still green).

## S2.3 — Tag vocabulary comes from the schedule rows we already trust

**Why:** Codex design list. `selectPages.ts:54-64` re-derives the vocabulary by regex
over schedule-tier page text — redundant (the authoritative rows are already in hand at
the call site) and wrong when the schedule sheet's text mangles.

**Files:** `worker/lib/drawing/selectPages.ts` (drop `TAG_PATTERN` + `tagVocabulary`
from the return), `worker/lib/drawing/enrich.ts` (build vocabulary as
`scheduleRows.map(r => normalizeOpeningRef(r.tag))`, filtered), tests.

**AC:**
- [ ] `selectPages` returns `{ selected }` only; its vocabulary tests move to the
      enrichment level.
- [ ] Vocabulary test: rows `[{tag:"w-04"},{tag:"D2"}]` → vocabulary `["W04","D2"]`.
- [ ] The floorplan fallback skill (see S4.9) receives exactly this vocabulary.

---

# E3 — Single-pass inspection (the five-minute fix)

## S3.1 — One pdfplumber open, one pdftotext run, per document

**Why:** Codex finding 2, verified: `steps.py:136-138` runs a `pdftotext` subprocess
**per page**; `steps.py:151-159` re-opens the whole PDF with pdfplumber **per page** for
words; `server.py:99-106` drives both in a loop. 14 pages ≈ 15 full-document opens + 14
subprocesses on ¼ vCPU ≈ the observed ~4-minute stall.

**Files:** `containers/plan-parse/steps.py`, `containers/plan-parse/server.py`,
`containers/plan-parse/tests/`.

**Do:**
- `pdftotext -layout` once for the whole document (no `-f/-l`), split the output on
  form-feed (`\f`) into per-page text — same per-page strings as today.
- One `pdfplumber.open` for the whole document; iterate its pages once collecting words
  (and the per-page char counts `inventory` already needs, if that lets `inventory`
  drop its own open — fold if trivial, else leave `inventory` untouched).
- `_handle_inspect` consumes the two single-pass results; response shape unchanged
  (plus S1.5 timings).

**AC:**
- [ ] pytest: exactly one `pdftotext` invocation per inspect (monkeypatch
      `subprocess.run` and count), regardless of page count.
- [ ] pytest: per-page `text` and `words` for the synthetic PDF are byte-identical to
      the previous implementation's output (capture once as fixture).
- [ ] pytest: a page with no text still yields an entry with empty text and `words: []`
      (form-feed splitting must not drop empty pages — off-by-one guard).
- [ ] `timings.textMs + timings.wordsMs` on the synthetic PDF drops by an order of
      magnitude vs. the S1.5 baseline (assert loosely: `< totalMs of previous fixture /
      5` or simply record both in the test log — do not make CI flaky on timing).

---

# E4 — Text-first location (Method Phases 2–3, using the words already on the wire)

**Context for the whole epic:** the container already returns per-word coordinates in
every inspect response (`contract.ts` `PageWord`/`PageText.words`, `server.py:101-105`)
— extracted, paid for, and currently read by nothing. The method's Phase 2/3 does all
locating from exactly this data. New pure module: `worker/lib/drawing/locate.ts`; all
stories test against synthetic word lists (AB-9-safe by construction).

## S4.1 — Types and the module seam

**Do:** define in `locate.ts`:
```ts
interface LocatedTag { tag: string; pageNo: number; xPt: number; yPt: number; storey: Storey | null }
type Storey = "ground" | "first";
interface WallSnap { edge: "top" | "bottom" | "left" | "right"; alongWallPt: number; wallLengthPt: number }
interface MarkerMap { [letter: string]: { edge: WallSnap["edge"] } }
```
No behaviour yet — this story is only compile-level scaffolding plus the first trivial
test (module exports exist). Keep it one small commit so Probity sees the seam grow
test-first from here.

## S4.2 — Find each tag on the floor plans

**Why:** Method §Phase-2.1. Tag text (`W9`) typically sits adjacent to its sheet
reference (`S08`); dimension strings are the false-positive population.

**Files:** `locate.ts`, tests.

**Do:** `locateTags(pages: {pageNo, words}[], vocabulary: string[]): LocatedTag[]`.
Match a word whose normalised text equals a vocabulary tag. Disambiguation rules, each
one a test: (a) prefer a candidate with a sheet-ref-shaped word (`/^S\d{1,3}$/i`) within
~1 tag-height's distance; (b) reject candidates whose word is part of a dimension chain
(neighbouring words within one word-height that are pure numbers ≥ 3 digits); (c) a tag
found on two floor-plan pages → both recorded, resolved by S4.5's storey (a tag on two
pages of the *same* storey → flag, drop to fallback).

**AC:**
- [ ] Tag beside `S08` beats the same text inside a dimension line.
- [ ] `w-04` word matches vocabulary `W04` (normalisation applied on both sides).
- [ ] Unfound tag → simply absent from the result (fallback handles it, S4.9).

## S4.3 — Footprint and wall snap

**Why:** Method §Phase-2.3: tags sit just outside the exterior wall they belong to.

**Do:** `footprint(words): [x0,y0,x1,y1]` — bounding box of interior-content words:
start from all words, drop the title-block strip (the densest word cluster hugging one
page edge — pin the heuristic: exclude words within 15% of the page's right edge and
bottom edge if ≥ 40% of all words live there), drop words matching the S4.4 stoplist's
dimension pattern outside the remaining mass. Then `snapToWall(tag, footprint):
WallSnap` — nearest footprint edge, with `alongWallPt` the tag's coordinate along that
edge and `wallLengthPt` the edge length. **This is a calibration-knob heuristic** (mark
it `ponytail:` with the upgrade path: real geometry extents from the container if the
gate set shows failures here).

**AC:**
- [ ] Four synthetic tags, one per side of a word cluster → four correct edges.
- [ ] `alongWallPt` measured from the edge's low-coordinate end (pin the convention in
      the test name — S4.8 depends on it).
- [ ] Title-block words on the right strip do not stretch the footprint.

## S4.4 — Room label, nearest inside, stoplisted

**Why:** Method §Phase-2.5.

**Do:** `roomLabelFor(tag, wallSnap, words): string | null` — nearest word-group
*inside* the footprint on the tag's interior side; group = uppercase words within one
word-height of each other; stoplist exactly per the method: dimension numbers, `DP`,
`SS`, `WIP`, `RL`, plus pure-number tokens. Distance cap (~15% of footprint diagonal) —
beyond it, `null` (not_stated), never the nearest random word.

**AC:**
- [ ] `BED 3` (two words) returned as one label.
- [ ] A closer `DP` loses to a farther `STUDY`.
- [ ] Nothing within the cap → `null`.

## S4.5 — Storey rides through placement

**Why:** Codex finding 6: `assign.ts` keys order per elevation only — ground-1 and
first-1 on one elevation collide into `frame_ambiguous` for both. Method §Phase-2.2 and
§Phase-3.4.

**Files:** `locate.ts` (storey from the page: title words `GROUND FLOOR` / `FIRST
FLOOR` / `UPPER FLOOR` per `selectPages`' own floorplan patterns), `assign.ts`
(`Placement` gains `storey: Storey | null`; the tie-detection map and the box pairing
key become `(elevation, storey)`), `enrich.ts` (thread it), tests.

**Do (assignment side):** boxes get a storey from the elevation sheet's RL datum words
where present: find words matching `/\bFFL\b|FIRST FLOOR|GROUND (FLOOR|CEILING)/` with a
`RL`-style number on the elevation page's words; the datum's y splits boxes into
ground (below) / first (above) in page coordinates. No datum words → single-storey
assumption: storey never disambiguates (today's behaviour), and a duplicate order still
goes ambiguous — honest, and the report says why.

**AC:**
- [ ] Ground-1 and first-1 on elevation A with a datum word between them → both matched,
      neither ambiguous.
- [ ] Same fixture without the datum → both `frame_ambiguous` (unchanged behaviour,
      now asserted deliberately).
- [ ] Tag found on the FIRST FLOOR page carries `storey: "first"`.

## S4.6 — Elevation letters map to compass faces from marker positions

**Why:** Method §Phase-3.1.

**Do:** `markerFaces(words, footprint): MarkerMap` — single-letter words `A`–`D` outside
the footprint; left of it → the face on the building's left edge, etc. Sets naming
elevations directly (`NORTH ELEVATION` in the sheet title) bypass this: the letter *is*
the face. Output feeds S4.8 (mirroring) and orientation (face + north → compass).

**AC:**
- [ ] Marker `B` left of footprint → `B: { edge: "left" }`.
- [ ] A stray capital `A` *inside* the footprint (room text) is ignored.

## S4.7 — North, resolved in the method's order, or honestly assumed

**Why:** Method §Phase-2.4. Currently orientation comes from the vision model's
`facings` — a substitution.

**Do:** `resolveNorth(pages): { bearing: 0|90|180|270 ...; source: string } | null` from
words, in order: (a) a `N` word adjacent to compass-ish words on the site plan /
title block; (b) `NORTH` label; (c) nothing → `null`. The doc's one-permitted-vision
fallback (a 100 dpi title-block crop) is **deferred** — a story stub only; until then
`null` north means plan-relative letters and a `northAssumed` flag on every orientation
reading (E7 stores flags). Wire: face (S4.6) + north → `Orientation`; readings get
`orientationState: "value"` only when north is resolved, else `not_stated` +
`northAssumed` once flags exist.

**AC:**
- [ ] `N` beside the site-plan compass words → bearing found, source string says where.
- [ ] No north → orientations `not_stated`, and the report counts
      `northAssumed: true` (report field, S4.10).

## S4.8 — The mirroring rule, one function, never eyeballed

**Why:** Method §Phase-3.2, verbatim: "critical, easy to get wrong… Encode this as a
function." Absent from the codebase entirely.

**Files:** `locate.ts` (or `assign.ts`), tests transcribing the doc's own rules.

**Do:** `elevationOrderKey(face, alongWallPt, wallLengthPt): number` — a sort key for
viewed-from-outside left-to-right: east face → plan-north on the viewer's right; west →
plan-north left; south → plan-east left; north → plan-east right. Intercardinal faces
use the nearest cardinal (pin: NE/SE → E-rule, NW/SW → W-rule; comment why). `orderOnWall`
is then *derived* by ranking located tags per (elevation, storey) with this key —
replacing the model-supplied number as the primary source.

**AC (one test per face, from the doc's examples):**
- [ ] East face: the tag nearest plan-north sorts **last** (viewer's right).
- [ ] West face: nearest plan-north sorts **first**.
- [ ] South face: nearest plan-east sorts **first**. North face: **last**.
- [ ] Ranking is dense 1..n per (elevation, storey).

## S4.9 — The vision floorplan read becomes a flagged fallback

**Why:** Codex finding 5 / Method §Phase-2: text first; vision was never the locator.
Keep coverage for drafters whose tags are graphics, but never let the fallback silently
be the path.

**Files:** `enrich.ts` (placement assembly), `skills.ts` (unchanged — the skill stays),
report fields, tests.

**Do:** build placements from E4 results first. Only tags **absent** from
`locateTags`'s output go to `floorplan_read` (one call per floor-plan page, existing
mechanics), and only those tags may be taken from its answer (validator already enforces
the vocabulary; intersect further with the missing set). Same for facings: marker/north
path first, model facings only for letters the markers could not map. Every
fallback-sourced placement is counted in the report.

**AC:**
- [ ] All tags locatable from text → **zero** `floorplan_read` calls (assert on fake
      deps).
- [ ] One unlocatable tag → exactly the missing tag may enter placements from the model;
      a model answer for an already-located tag is ignored.
- [ ] Report gains `placements: { fromText: n, fromModelFallback: n }` (S4.10).

## S4.10 — The report knows how placement happened

**Files:** `contract.ts` (`DrawingRunStepCounts` gains
`placements: { fromText: number; fromModelFallback: number; unplaced: number }` and
`northAssumed: boolean`), `enrich.ts`, tests.

**AC:**
- [ ] JSON report from a mixed fixture shows the right three counts and the flag.
- [ ] Old reports without the field still parse wherever reports are read (additive).

---

# E5 — Assignment uses everything it is given

## S5.1 — The proportion fingerprint is consumed, not discarded

**Why:** Codex finding 7, verified: `elevation_inventory` returns `unitProportions`
(`skills.ts:20,68-70`); nothing reads them. Method §Phase-3.5: the schedule's
width-vs-neighbour ratios are the cross-check that resolves same-size confusions
(the doc's W9/W10 worked example).

**Files:** `assign.ts`, `enrich.ts` (pass box widths through), tests.

**Do:** after order-based pairing proposes row→box, verify: the box's width fraction
relative to its elevation-mates must match the schedule row's width relative to *its*
elevation-mates within tolerance `PROPORTION_TOLERANCE = 0.25` (named constant — a
calibration knob for the gate set). Verdict per row: pass → matched; fail →
`not_read("frame_ambiguous")` with a gap note naming both ratios. When a *tie*
(S4.5-surviving duplicate order) exists, try fingerprint disambiguation before declaring
ambiguity: if exactly one assignment of the tied pair passes the tolerance both ways,
take it.

**AC:**
- [ ] Doc-shaped fixture: two same-height windows, schedule widths 1810/1450, box width
      fractions ~0.80 ratio → both match under order; swapped boxes → both refused with
      the ratio note.
- [ ] A tie resolved uniquely by fingerprint → matched; a tie where both assignments
      pass → still ambiguous (never guess between valid options).

---

# E6 — The per-opening read at method fidelity

## S6.1 — Crops render at 300 dpi, batched per page

**Why:** Codex finding 8 / Method §Phase-4.2 / hard rule 2. Today `enrich.ts:181` sends
one render call **per opening** at `dpi: 150` — each call re-uploads the PDF and
re-rasterises the whole page. The contract already allows 12 crops per call
(`MAX_CROPS_PER_PAGE`); the Worker just never batches.

**Files:** `enrich.ts` (the per-opening loop restructures into: group matched outcomes
by pageNo → for each page, render once at `dpi: 300` with up to 12 crop boxes (chunk if
more) → distribute images to openings by index), tests.

**Do:** widen each crop box ~1.5× around the assigned box (clamped to the page). The
overview elevation render stays 150 dpi (Method §Phase-4.1).

**AC:**
- [ ] 5 matched openings on one page → exactly **one** render call, `dpi: 300`,
      5 crop boxes; image i pairs with opening i (assert via distinct fake images).
- [ ] 13 openings on one page → two calls (12 + 1).
- [ ] Crop boxes are the assigned boxes scaled 1.5× about their centre, clamped ≥ 0 and
      ≤ page dimensions.

## S6.2 — The container upscales small crops and can threshold

**Why:** Method §Phase-4.2 step 2 (≥ 800 px short edge) and §Phase-4.4 (faint-line
threshold before ever concluding "no symbol").

**Files:** `containers/plan-parse/server.py` / `steps.py` (`/render` gains optional
header field `threshold: int|null`; crop post-processing: if short edge < 800 px,
integer-upscale via PIL nearest/lanczos to ≥ 800; if `threshold` set, map pixels
`< threshold → 0` first), pytest; `contract.ts` `RenderRequest.threshold?`,
`containerClient.ts` pass-through, Worker test.

**AC:**
- [ ] pytest: a 300 px crop comes back ≥ 800 px short edge, aspect preserved.
- [ ] pytest: with `threshold: 250`, a mid-grey pixel becomes black; without, unchanged.
- [ ] Worker `renderPage` forwards `threshold` verbatim; absent by default.

## S6.3 — Deterministic measurement; the model only classifies

**Why:** Workers §Deterministic-Pre-Measurement: darkness-profile peaks give mullion and
transom positions; `splitRatio`/`unitWidthMm` become arithmetic — "no model in the loop,
and no pixel-measurement hallucination risk."

**Files:** container (`steps.py`: per-crop `profile: { mullionXs: number[], transomYs:
number[] }` computed from the grayscale buffer — column/row mean darkness, peak pick
with a min-prominence knob), `contract.ts` (`RenderedImage.profile?`), `enrich.ts` +
new pure `measure.ts` (peaks + schedule width → unit widths mm, round to 5 mm, ratios),
`skills.ts` (`openingReadSkill` v2: prompt asks only per-pane classification —
fixed / awning-chevron / casement-chevron / sliding-arrow / louvre — given the unit
count and the schedule type; it no longer reports ratios), reconciliation of both in
`enrich.ts`, tests everywhere.

**Do — retry rule (Method hard rule 3):** if the model declines or the classification
contradicts an operable schedule type with zero marks found, re-render **once** with
`threshold: 250` (S6.2) — never an identical second look. Track
`report.steps.read.retriedWithThreshold`.

**AC:**
- [ ] Pure test: profile peaks at fractions [0.33] on a 900 px crop of a 2050 mm
      opening → units 675/1375 → rounded 675/1375 (5 mm rule asserted with a
      non-multiple input).
- [ ] Skill v2 validator refuses a response containing a ratio field (the model must
      not measure).
- [ ] Zero-marks + schedule says AWNING → exactly one thresholded retry, then honest
      outcome (`fixed` stands only if the retry also shows no marks — flagged in E7).
- [ ] `promptVersion` bumped so `runStage` idempotency cannot replay v1 answers
      (ADR 0015 precedent).

## S6.4 — Opening reads run in a bounded pool of five

**Why:** Codex finding 9; the design promised it (02-design-v2.md §… "opening_read runs
in a pool of 5", line ~632) and the code is a serial `for` loop. Workers platform caps
concurrent outbound connections at 6.

**Files:** `enrich.ts` (model-call stage of the loop becomes a worker-pool of 5 over the
cropped openings; container render batching from S6.1 stays sequential per page),
tests.

**AC:**
- [ ] With 12 openings and deps whose `runOpening` resolves on manual triggers, at most
      5 are ever in flight (assert high-water mark).
- [ ] Progress ticks remain monotonic 1..N; the denominator constant.
- [ ] Readings order in the result is stable (by schedule row order, not completion
      order).

## S6.5 — Every opening is its own failure domain

**Why:** Codex finding 10: any exception in the loop today jumps to the file-level catch
(`enrich.ts:220-227`) and discards **all** readings. My own S0.2 timeouts made this
sharper: one timed-out render currently destroys 18 good readings.

**Files:** `enrich.ts`, `contract.ts` (`GapCode` gains `"timeout"` — TS union only; the
DB column has no CHECK, verified in migration 0060), tests.

**Do:** wrap each opening's render+read+persist work in its own try/catch → on error,
push `notReadRow(row, code, note)` where code maps from `ContainerClientError.code`
(`timeout` → `"timeout"`, others → `"render_failed"`) and note carries the error name
(no free text from documents). A batched render failure (S6.1) fails only that batch's
openings, each as its own not_read row. The file-level catch remains only for
pre-loop failures (inspect, selection, elevation/floorplan phases) — and now records
the error name in the report (`report.steps` gains `failedPhase?: string`).

**AC:**
- [ ] `runOpening` throws on opening 7 of 19 → 18 readings survive, one
      `not_read` row for #7, no throw escapes `enrichFile`.
- [ ] A render timeout on a 3-crop batch → exactly those 3 become `not_read("timeout")`.
- [ ] Inspect throws → zero readings, `report.steps.failedPhase === "inventory"`
      (per-phase name), file report still returned (existing AC-28 test extended).

## S6.6 — Schedule comments reach the read

**Why:** Method §Phase-1: "Comments are composition gold" — `2x 600mm WIDE AWNINGS`
seeds and constrains the read. Today `EnrichScheduleRow` (`enrich.ts:25-30`) has no
comment field and `pipeline.ts:771-773` doesn't map one.

**Files:** `enrich.ts` (`EnrichScheduleRow.commentText: string | null`),
`worker/lib/ai/pipeline.ts` (map it from the merged line — the merged-line type already
carries the schedule's comment text; find the exact field name on
`mergeScheduleLines`' output and thread it; if truly absent, extend the mapping from
the extractor's output **without touching the extractor**), `skills.ts` (opening-read
context string gains `comment: "<text>"` when present), tests.

**AC:**
- [ ] Prompt fixture with a comment shows it in the context line; `null` shows nothing.
- [ ] Comment text is treated as source content (the existing prompt's injection guard
      sentence covers it — assert the guard sentence survives in v2).

---

# E7 — Reconciliation, confidence, flags (Method §Phase-4.3 / §Phase-5)

## S7.1 — The comment parser

**Files:** new pure `worker/lib/drawing/comments.ts`, tests.

**Do:** `parseCompositionComment(text): { count?: number; unitWidthMm?: number;
operation?: string; direction?: "rtl" | "ltr"; sidelight?: boolean } | null` for the
method's cited patterns: `2x 600mm WIDE AWNINGS`, `920 DOOR & 1N° SIDELIGHT`,
`RIGHT TO LEFT`. Unparseable → `null`, never a guess.

**AC:** one test per cited pattern + one garbage-in → null.

## S7.2 — `reconcile()` — the doc's table as one pure function

**Files:** new `worker/lib/drawing/reconcile.ts`, `enrich.ts` (apply to each read
opening), tests — one per policy row.

**Do:** inputs: schedule row (type + parsed comment), measured composition (S6.3),
model classification, visibility (was it found on an elevation). Output:
`{ composition, confidence: "high" | "low", flags: Flag[] }` with
`Flag = "scheduleDrawingMismatch" | "manufacturability" | "notVisibleOnElevations" |
"northAssumed"`. Policy, verbatim from the method:
- all three sources agree → high, no flags;
- drawn single pane wider than `MAX_SASH_MM = 1200` while schedule says operable →
  output **what is drawn**, low, `manufacturability` (never invent a split);
- comment count contradicts drawing → comment wins the operation count, drawing wins
  geometry, `scheduleDrawingMismatch`;
- not visible on any elevation → composition from schedule+comment only, low,
  `notVisibleOnElevations`;
- unresolved north (S4.7) → `northAssumed` appended on orientation-bearing readings.

**AC:** five tests, one per row above, asserting composition, confidence, and flags
exactly.

## S7.3 — Persist confidence and flags

**Files:** `migrations/0061_drawing_reading_confidence.sql` (**load
`d1-migration-safety` first**; additive: `ALTER TABLE drawing_reading ADD COLUMN
confidence TEXT; ADD COLUMN flags_json TEXT;`), `contract.ts` (`DrawingReading` gains
`confidence`, `flags`), `readings.ts` (`persistReadings` binds them), report perOpening
rows gain `confidence`, tests including the local-migration harness.

**AC:**
- [ ] Migration applies clean locally on a DB already carrying 0060 data.
- [ ] A persisted reading round-trips confidence + flags.
- [ ] Gate script (`scripts/drawing-gate.mjs`) is untouched and green — flags do not
      change gate semantics.

---

# E8 — The gate, then and only then the flag

## S8.1 — Supervised gate protocol (owner in the loop)

**Do (protocol, not code):** with all epics deployed and the flag still `auto`: the
owner flips the dashboard var to `auto_drawings` for a supervised window; upload the
reference plan set; capture `ai_runs.drawing_report_json` + `drawing_reading` rows;
flip back to `auto`. Run `node scripts/drawing-gate.mjs readings.json labels.json`
against the owner-confirmed label sheet.

**AC:**
- [ ] The run completes without pipeline failure and under the lease with headroom
      (S1.5 timings in the log prove where time went).
- [ ] Gate output archived into `docs/runs/plan-parse-method/gate-results/` with date.

## S8.2 — 19/19 or it stays off

**AC (D-1, verbatim):**
- [ ] 19 of 19 openings read; zero wrong readings; zero wrong placements.
- [ ] Only then: `wrangler.jsonc` flips to `auto_drawings` in a commit whose message
      cites the gate artefact, and the dashboard is aligned in the same action.
- [ ] Anything short: the per-opening report rows name the failing phase; file the
      finding against the responsible story and iterate. The flag does not move.

---

## Sequencing and sizing

| Order | Epic | Depends on | Independent PR? |
|---|---|---|---|
| 1 | E0 | — | yes (same day) |
| 2 | E1 | — | yes |
| 3 | E2 | — | yes |
| 4 | E3 | S1.5 baseline useful first | yes (one image bump) |
| 5 | E4 | E2 (multi-tier fixtures), E3 optional | yes — largest epic, one story at a time |
| 6 | E5 | E4 (storey, ordering) | yes |
| 7 | E6 | E4/E5 (matched outcomes to read) | yes (second image bump with S6.2/S6.3) |
| 8 | E7 | E6 (measured compositions) | yes (carries migration 0061) |
| 9 | E8 | everything | protocol, not PR |

Every epic leaves `npm test` + `npm run typecheck:gate` green and ships through the
mandatory review stage. Container-image bumps: two (after E3, after E6), each by hand
per the deploy protocol.

## Explicit non-goals of this pass

- No Workflows migration (deferred to a DECISIONS.md entry after E7).
- No mupdf/container re-architecture.
- No schedule-extractor changes.
- No ops-console surface for readings (the §6 descope stands).
- The north-arrow vision fallback crop (Method §Phase-2.4's one permitted vision use)
  is stubbed, not built, until the gate shows it is needed.
