# Plan-parse remediation — bring the implementation back to the method

**Status:** plan, approved for build. No code has been changed under this plan yet.
**For:** a developer session (Sonnet), working slice by slice under Probity TDD.
**Owner framing, 2026-08-29:** *the original instructions were the source of truth and got
lost along the way.* This plan is the walk back.

## The two binding documents (committed beside this file)

1. [`window-door-parsing-agent-instructions.md`](window-door-parsing-agent-instructions.md)
   — **the method**. Phases 0–5, the symbology rules, the cost model, the reconciliation
   policy. When this plan and that document disagree, that document wins.
2. [`window-door-parsing-agent-cloudflare-workers.md`](window-door-parsing-agent-cloudflare-workers.md)
   — the Workers adaptation. Runtime constraints, region rendering, deterministic
   pre-measurement, orchestration shape.

These are the instructions the 100%-accuracy run followed. The current implementation
(`worker/lib/drawing/`) kept the *mechanical* half (inventory → strategy → text →
select-before-render → render/crop) but replaced the *judgement* half — tag location,
elevation mapping, measurement — with vision-model calls the method never used. The method
is text-coordinates-first; vision answers exactly one narrow question per opening, at the
end. That inversion is the root cause of the 2026-08-29 production runs producing zero
readings.

**Precedence rules that still stand from the repo's own rulings:**

- The platform's schedule extraction is authoritative and out of scope (00-ask.md §1).
  The method's Phase 1 is *already done* by the platform; enrichment consumes its rows.
  Never re-derive or contradict the schedule.
- The container stays (owner ruling, 00-ask.md §4). The Workers doc's mupdf-in-Worker
  route is noted as a conflict but is **not** part of this plan — the container is the
  delivery vehicle for poppler, and delivery is not what failed. Raise with the owner
  separately if ever revisited.
- The three-state honesty rule (value / not_stated / not_read, never guess) is already
  implemented and correct. Keep it.
- Crops as evidence in R2, regions in PDF points — already implemented, matches the
  Workers doc's evidence contract. Keep.

## Ground rules for the developer session

- **Probity is on.** One failing test observed before each production write. Red → green
  → refactor, one new test per write. Do not fight it; it will reject batched work.
- **AB-9:** no real drawings, no image/PDF bytes in fixtures — synthetic PDFs and canned
  container responses only. The release gate against the real reference set runs at the
  end, outside the test suite, with the owner.
- **Container changes** (`containers/plan-parse/`) are built and pushed by CI
  (`.github/workflows/container-build.yml`) on merge to main; the deployed tag in
  `wrangler.jsonc` is bumped **by hand, deliberately**, after CI confirms the image. Local
  Docker is not available and not needed.
- **Any `migrations/` change:** load `.claude/skills/d1-migration-safety/` first.
  Additive only, numbered after the highest existing file.
- Do not touch the schedule extractor, the estimator's split ladder, or anything outside
  `worker/lib/drawing/`, `worker/lib/ai/pipeline.ts` (the stage call site),
  `containers/plan-parse/`, and their tests — except where a slice below names the file.
- The pipeline's four-reviewer `review` stage applies to this work like any other.

## What production actually did (so you recognise the bug when you see it)

Two runs, 2026-08-29 (details: [`03-deploy-findings.md`](03-deploy-findings.md)):

- `selectPages` classified **zero pages as elevation-tier** on the test set, so
  `boxesByElevation` stayed empty and `assignOpenings` returned all 19 openings
  `not_read` — the observable symptom was the per-opening counter flying 1→19 instantly.
- Three `floorplan_read` model calls ran; **zero** elevation renders or reads.
- The run then failed with a generic `PIPELINE_INTERNAL_ERROR` whose cause is still
  unknown, and `drawing_report_json` was lost because the report is only persisted on
  success.

---

## The slices, in build order

Each slice is independently shippable and lands with its own tests. Do them in order:
R1 makes the next test run diagnosable; R2 provably un-zeroes the pipeline; everything
after raises accuracy toward the method.

### R1 — The report survives failure, and the stage logs its counts

**Why:** today's failed runs were undiagnosable — the drawing report is only written on a
successful pipeline completion, and the enrichment stage logs nothing. The method doc's
own output contract (Phase 5 `meta`) expects budget/step accounting regardless of outcome.

**Change:**
- Persist `drawing_report_json` on the *failure* path of `runAiExtraction` too
  (`worker/lib/ai/pipeline.ts` — the `catch` block that writes the failed summary). The
  report object already exists by then; it must not be discarded.
- Emit one structured `console.log` from the enrichment stage (same shape as the existing
  `ai_pipeline_phase` events): `{ event: "drawing_enrichment", filesTried, containerCalls,
  modelCalls, readingsProduced, notReadCount, wallMs }` — numbers straight off the report.
  No filenames, no document text, no model output (§21.1 discipline).

**Tests:** a pipeline-level test that fails the run after enrichment and asserts the
report row landed; a unit test on the log emission (shape only).

**Done when:** a failed production run leaves a queryable `drawing_report_json`.

### R2 — A page can hold more than one tier

**Why:** method doc Phase 0: *"schedules frequently share a page with elevations — a page
can have multiple types."* `worker/lib/drawing/selectPages.ts` assigns exactly one tier
per page, first match wins, `schedule` checked first — so a sheet carrying both the
window schedule and the elevations is consumed as schedule-only and the elevations are
never rendered. This is the most likely direct cause of the zeroed production runs.

**Change:** `classify` returns **every** matching tier; `selectPages` emits one
`SelectedPage` per (page, tier) pair. Tag vocabulary still harvested from every
schedule-tier match. Downstream (`enrich.ts` filters by tier) works unchanged.

**Tests (each its own red):**
1. A page whose text contains both `WINDOW SCHEDULE` and `ELEVATION A` is selected as
   both `schedule` and `elevation`.
2. A page with `FLOOR PLAN` and an elevation-marker legend containing the word
   "elevation" — decide and pin the rule: title-block occurrence classifies, legend
   mentions should not flip a floor plan to elevation-tier. (Suggested rule: elevation
   requires `ELEVATION` followed by an identifier — letter, or NORTH/SOUTH/EAST/WEST —
   or at line start; write the test that encodes whichever rule you pick and note it in
   the code comment.)
3. Existing single-tier tests keep passing.

**Done when:** the reference-set-shaped fixture (schedule sharing a sheet with
elevations) yields elevation-tier selections.

### R3 — The mirroring rule, encoded as a function

**Why:** method doc Phase 3.2, verbatim: *"Mirroring rule (critical, easy to get wrong):
elevations are viewed from outside… Encode this as a function; never eyeball it per
window."* No such function exists anywhere in `worker/lib/drawing/`. `assignOpenings`
pairs schedule rows to boxes by `orderOnWall` left-to-right with no notion of which way
the viewer faces — wrong roughly half the time once elevations are actually found.

**Change:** a pure function in a new or existing drawing module:

```
elevationOrder(face: "N"|"E"|"S"|"W"|…, planAlongWall: number, wallLength: number): number
```

encoding exactly the doc's rules: east face → plan-north on the viewer's **right**; west
face → plan-north on the viewer's **left**; south face → plan-east on the **left**; north
face → plan-east on the **right**. Intercardinals: nearest cardinal's rule. Wire it into
the ordering used by `assignOpenings` (the caller supplies the face — see R5 for where
the face comes from).

**Tests:** one per face, plus one intercardinal, each asserting a known plan position
lands on the correct side of the elevation. These are the doc's own worked examples —
transcribe them.

### R4 — Word coordinates out of the container

**Why:** the method's whole Phase 2/3 engine is *text with coordinates* ("the single
biggest cost saver… You do not need vision to find them"). The container runs pdfplumber
already, but `/inspect` returns page text only — no word boxes — so the Worker literally
cannot run Phase 2 as written. This slice is pure plumbing; R5 consumes it.

**Change:**
- Container (`containers/plan-parse/`): a new `POST /words` endpoint — request framing
  identical to the others (one JSON line `{"pageNos":[…]}` + PDF bytes), response
  `{ pages: [{ pageNo, words: [{ text, x0, y0, x1, y1 }] }] }`, coordinates in PDF
  points. Cap: refuse more than `MAX_PAGES` pageNos. Reuse the existing framing parser
  and cap enforcement in `server.py`; the extraction is pdfplumber's `extract_words()`.
- Worker (`containerClient.ts`): a `wordsForPages` client with the same Worker-side cap
  checks and the same call timeout as the existing two.
- Contract types in `contract.ts`; container tests in `containers/plan-parse/tests`
  against a synthetic PDF (pytest, runs in CI).

**Done when:** CI green on the container job, image pushed, tag bumped by hand,
`wordsForPages` unit-tested against a fake namespace.

### R5 — Phase 2/3 as written: tags, rooms, faces, ordering from text geometry

**Why:** the shipped pipeline asks a vision model (`floorplan_read`) to place tags, name
rooms, and give facings. The method does all of it deterministically from word
coordinates, and its accuracy claim rests on that. This is the largest slice and the
heart of the walk-back.

**Change** — a new pure module (suggested `worker/lib/drawing/locate.ts`) implementing,
from `/words` output:

1. **Tag location** (doc Phase 2.1): find each schedule tag's word on floor-plan pages —
   the tag text typically adjacent to its sheet reference (`W9` beside `S08`); use that
   adjacency to disambiguate from dimension text. Record page + point coordinates.
2. **Wall snap** (2.3): footprint bounding box from the drawing extents, snap each tag to
   the nearest edge → plan-relative wall + along-wall coordinate.
3. **Room label** (2.5): nearest uppercase word-group *inside* the footprint, with the
   doc's stoplist (dimension numbers, `DP`, `SS`, `WIP`, `RL`, …).
4. **Marker → face mapping** (3.1): elevation-marker letters (A–D) located around the
   plan; a marker left of the footprint denotes the west face, below → south, etc. If
   the set names elevations `NORTH/SOUTH/…`, the mapping is direct from the elevation
   sheets' own title text.
5. **North resolution** (2.4), in the doc's preference order: a compass/`N`-label word on
   the site plan or title block → lot bearings → **one** low-dpi crop of the title-block
   region as the only permitted vision call in this phase → otherwise plan-relative
   letters plus a `northAssumed` flag.
6. **Ordering** (3.3): project each tag's along-wall coordinate through R3's mirroring
   function → predicted left-to-right order per elevation. **This replaces
   `floorplan_read`'s `orderOnWall` as the primary source.**

`floorplan_read` is **demoted, not deleted**: it becomes the fallback for exactly the
tags text location could not find (and the facings fallback when markers can't be
mapped), and its answers are flagged as such in the report. The method used no vision
here at all; keeping a flagged fallback preserves coverage on drafters whose tags are
graphics rather than text, without letting the fallback silently become the path.

**Tests:** all pure-function tests on synthetic word lists — tag-beside-sheet-ref
disambiguation, footprint snap on each edge, room stoplist, marker→face on each side,
north-preference order, the unfound-tag → fallback flag. Then an `enrichOpenings`-level
test proving the vision fallback is only consulted for tags the locator missed.

**Done when:** on a synthetic fixture with pure-text tags, a full enrichment run makes
**zero** `floorplan_read` calls and still places every opening.

### R6 — The per-opening read at the method's fidelity

**Why:** three departures from Phase 4.2, each of which degrades reads silently:
crops render at 150 dpi (`enrich.ts` passes `dpi: 150`; the doc says overview 150,
**per-opening crops 300**); no upscaling of small crops (doc: ≥800 px short edge); no
faint-line threshold fallback (doc 4.4: threshold before ever concluding "no symbol" —
symbols drawn in light blue/grey vanish otherwise). And the model is asked to *measure*,
which the Workers doc explicitly names a hallucination risk.

**Change:**
- `enrich.ts`: per-opening crop renders at `dpi: 300` (contract `MAX_DPI` already allows
  it), crop box widened ~1.5× the predicted extents.
- Container render path (`steps.py`): upscale a crop below 800 px on its short edge
  before PNG-encoding; support an optional `threshold` parameter (`v < 250 → 0`) on
  `/render`.
- **Deterministic pre-measurement** (Workers doc): in the container, alongside each crop,
  return the column-darkness profile peaks (candidate mullion x-positions within the
  frame) and row peaks (transoms). Worker computes `unitWidthMm` and `splitRatio` by
  arithmetic against the schedule width — the model never measures.
- `openingReadSkill` prompt narrows to classification only: per pane, *"fixed,
  awning-chevron, casement-chevron, sliding-arrow, or louvre?"* with the schedule type as
  context (the doc's convention rules — chevron + schedule AWNING → awning; do not rely
  on apex direction alone).
- **Retry rule** (doc hard rule 3): a crop may be re-viewed only with something changed —
  once, with the threshold applied — never identically.
- Thread the schedule row's **comments** into enrichment (doc: "comments are composition
  gold" — `2x 600mm WIDE AWNINGS` seeds the read). `EnrichScheduleRow` gains
  `commentText`; `pipeline.ts`'s row mapping supplies it from the merged line if the
  field exists on merged lines — if it does not, extend the mapping from the extraction
  output, **without touching the extractor**.

**Tests:** dpi and widen-factor pinned at the `enrich.ts` call sites; container pytest
for upscale + threshold; pure tests for peak→mm arithmetic including the rounding rule
(round to 5 mm); a skill test that the prompt carries type + comment context; a test that
the second view only ever happens once and with threshold on.

### R7 — Reconciliation, confidence, flags (Phase 4.3 / 5)

**Why:** the method's final defence against plausible-but-wrong output. Currently a model
answer is accepted as-is. The doc reconciles three sources — schedule type/comments, plan
context, drawn composition — and emits `confidence` + `flags` (`scheduleDrawingMismatch`,
`manufacturability`, `notVisibleOnElevations`, `northAssumed`).

**Change:**
- A pure `reconcile(scheduleRow, drawnComposition, commentSeed)` implementing the doc's
  table: all agree → high; drawing under-divided vs. physics (single sash > ~1200 mm) →
  output what is drawn, low confidence, manufacturability flag, never invent a split;
  comment contradicts drawing → comment wins operation count, drawing wins geometry,
  mismatch flag; not on any elevation → schedule+comments only, low, flag.
- Persist: migration `0061` (additive — `d1-migration-safety` first) adding `confidence`
  and `flags_json` to `drawing_reading`; thread through `persistReadings` and the report.

**Tests:** one per reconciliation row in the doc's policy, each its own red; migration
applied in the existing local-migration test harness.

### R8 — Orchestration (decision gate — do not build without the owner)

The Workers doc prescribes Cloudflare Workflows: one durable step per opening, retryable
in isolation, surviving deploys. Production hit both failure modes this shape prevents
(the lease kill; the deploy-time DO reset). The current queue-job-with-lease now has a
600 s lease and per-call timeouts, which is tolerable. Migrating to Workflows is real
work with its own design questions — **raise it as a DECISIONS.md entry after R1–R7
land; do not fold it into this pass.**

---

## Acceptance

1. All slices green locally: `npm test`, `npm run typecheck:gate`.
2. The pipeline's mandatory `review` stage over the full diff.
3. Deploy per protocol (CI container image confirmed, tag bumped by hand, owner confirms
   the production deploy).
4. **The release gate is the method's own bar:** the reference plan set through
   production, `scripts/drawing-gate.mjs` against the owner-confirmed label sheet,
   **19 of 19, zero wrong readings, zero wrong placements** (DECISIONS.md D-1). Anything
   short is not done; the report's per-opening rows say exactly which phase to look at.
