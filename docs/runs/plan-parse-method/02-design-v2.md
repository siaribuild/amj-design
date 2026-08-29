# Plan-parse enrichment — design (v2)

**Stage 2 of the feature pipeline, v1 (a person orchestrates).** Implements
`01-spec-v2.md` (45 criteria) under `00-ask.md`, `DECISIONS.md` D-1…D-4, the
output contract (`docs/estimator/plan-parse-output-spec.md`), ADR 0013 (points
1, 3, 4), ADR 0015, and the owner's crop-retention ruling relayed 2026-08-29
(§7). `01-spec.md`/`02-design.md` in this directory are archived and were not
built on. The reverted scaffold (`a1162db1`) and the reverted implementation
(`0f63fe6a^`) were read as evidence only; nothing here inherits them.

**Owner descope, relayed 2026-08-29, folded in below:** nothing new in ops
(the drawing-readings endpoint and record panel are cut -- see §6), and the
customer progress counter is a state addition to the shipped
`DocumentProgress` concept, not a UI change. **No mock gate applies to this
feature** (§6.4). Consequently this design has **7 build slices**, and one
schema column and one shared-types file that existed only for the cut surface
are removed (§6.1, §8).

**Companion records written with this design:**
- `docs/adr/0016-plan-parse-runs-the-proven-poppler-python-method.md` — the
  execution-vehicle ruling (supersedes ADR 0013's point-2 "Node" detail).
- `CONTEXT.md` — *Crop evidence* retention sharpened; *Drawing enrichment*
  switch value named.

---

## 1. Ruling — the execution vehicle

**A Python + poppler container, image pre-built in CI and named in
`wrangler.jsonc` by Cloudflare-registry URI. No Docker on any development
machine, ever.**

The reasoning, written down because it will be re-litigated:

1. **R1 binds the tools, not just the outcomes.** The method that reached 100%
   is `pdfinfo`/`pdffonts`/`pdfimages -list`/`pdfdetach -list`,
   `pdftotext -layout`, `pdfplumber`, `pdftoppm`, PIL — poppler and Python.
   00-ask §3 is explicit: *"the same commands, the same libraries, the same
   order"*, and *"nothing in the rework may replace a documented step with an
   equivalent."* A Node renderer (unpdf/pdf.js + a canvas) is by definition an
   equivalent, not a reproduction — and it is precisely what the reverted
   implementation substituted (`0f63fe6a^:containers/plan-parse/render.mjs`
   opens with "NO POPPLER, NO PYTHON").
2. **The evidence is one-sided.** The Python path's evidence is the manual run
   that reached 100%. The Node path's "proven" claims live in reverted code
   (00-ask §5, correction 2). The owner's tie-break — *"reuse the stack, but
   not at the expense of results"* — resolves against reuse here, because
   results are the only thing the two paths differ on that this feature is
   gated on.
3. **The one thing Node bought is worthless in this scope.** "One pdf.js across
   the codebase so the crop box and the geometric second opinion share a
   coordinate space" mattered when geometric corroboration was in the build.
   It is not: no criterion among the 45 exercises the geometric check, and the
   route decision keeps geometry only as a *future* corroborator. Buying
   coordinate-space unification for a check that is not being built is dead
   flexibility.
4. **No V8 path exists anyway.** workerd has no canvas and no native modules;
   any in-Worker rasteriser would be a WASM port of a *different* PDF engine —
   a second substitution stacked on the first.
5. **The delivery failure is fixed at delivery, not by abandoning the method.**
   What broke deploys was `"image": "./containers/plan-parse/Dockerfile"`
   making a Docker daemon a prerequisite for every deploy. Wrangler 4.111.0's
   `ContainerApp.image` accepts a registry URI (verified in 00-ask §4). CI
   builds and pushes; `wrangler deploy` on a Docker-less machine names the URI
   and pushes nothing.

**Division of labour (deepens ADR 0013's seam):** the container performs the
method's *mechanical* steps — the poppler/pdfplumber/PIL invocations. The
Worker performs every *judgement* — strategy, page selection, box→tag
assignment, the model calls, validation, persistence, the run report. The
order of the six steps is the Worker orchestrator's, and it is the spec's §5.2
run report that proves the order held on every run. Step 4 (select pages)
names no tool in the method; it is a judgement over the step-3 text and lives
in the Worker where it is unit-testable without Docker. This is a *process
boundary* choice, not a step substitution: selection still happens before
rendering, from `pdftotext -layout`/`pdfplumber` output, and AC-12 pins it.

**Image contents:** `python:3.12-slim` + `poppler-utils` + `pdfplumber` +
`pillow`. `boto3` and `anthropic` are **not** in the image (00-ask §5,
correction 1: neither is used; the container holds no credentials). The image
changes only when the *toolchain* changes — every prompt, threshold and
judgement lives in the Worker — so the registry tag is bumped rarely and by
hand.

---

## 2. Module map and data flow

The six steps, named, with where each executes:

```
Customer upload → queue → jobs.ts consumer → pipeline.ts runAiExtraction
                                                    │
    (existing) ingest → schedule/plan/energy skills │  openings table (authoritative)
                                                    ▼
              ┌──────────── enrichOpenings (worker/lib/drawing/enrich.ts) ────────────┐
              │  per usable PDF file, serially:                                       │
              │                                                                       │
              │  1 INVENTORY   container POST /inspect   pdfinfo, pdffonts,           │
              │                                          pdfimages -list,             │
              │                                          pdfdetach -list              │
              │  2 STRATEGY    Worker (pure)             text_vector | text_raster    │
              │                                          | scanned → stop, name gap   │
              │  3 TEXT        container (same /inspect) pdftotext -layout per page   │
              │                                          + pdfplumber word coords     │
              │  4 SELECT      Worker (pure)             selectPages.ts: tiers        │
              │                selectPages BEFORE render elevation/floorplan/siteplan │
              │                                          /schedule/report + closed    │
              │                                          tag vocabulary from words    │
              │  5 RENDER+CROP container POST /render    pdftoppm -r <dpi> -f N -l N  │
              │                                          + PIL crop                   │
              │       between render and crop, the locate judgement (ADR 0015):      │
              │       · elevation_inventory skill (Pass A, v3) — boxes, names nothing │
              │       · floorplan_read skill — tag→elevation, order on wall (D-4),    │
              │         room label, elevation facing (orientation)                    │
              │       · assign.ts (pure) — row→box within ONE elevation, or refusal   │
              │  6 READ        Worker model call         opening_read skill: one call │
              │                (runStage, per opening)   per opening, its own crop,   │
              │                                          schedule row as context      │
              │                                                                       │
              │  → readings + gaps + method report; crops → R2; progress per opening  │
              └───────────────────────────────────────────────────────────────────────┘
                                                    │
        readings.ts: drawing_reading rows, conflicts, review flags, model fields,
        splitHints (source 'plans') ──► existing proposeSplit → materialiseSplits
        orientation ──► existing thermal contract (wallOrientationSource 'plan')
                                                    ▼
                      existing estimate → lines → human review gate
```

### 2.1 Affected files — the hand-off index

**New files**

| Path | What it is |
|---|---|
| `containers/plan-parse/Dockerfile` | python:3.12-slim + poppler-utils; pattern in `git show a1162db1:containers/plan-parse/Dockerfile` (drop the scaffold prose; keep linux/amd64, lean-image note) |
| `containers/plan-parse/requirements.txt` | `pdfplumber`, `pillow` pinned — **no boto3, no anthropic** |
| `containers/plan-parse/server.py` | stdlib `http.server`; `GET /` readiness (poppler on PATH), `POST /inspect`, `POST /render`; request framing `{json}\n<pdf bytes>` (the framing the old CI smoke already exercised); silent access log |
| `containers/plan-parse/steps.py` | steps 1, 3, 5 as functions — `inventory()`, `page_text()`, `page_words()`, `render_page()`, `crop()`; signatures per `git show a1162db1:containers/plan-parse/pipeline/steps.py` (its docstrings are right; its `NotImplementedError`s are what gets written) |
| `containers/plan-parse/tests/test_steps.py` | pytest over a synthetic generated PDF (§12) |
| `containers/plan-parse/README.md` | the six steps verbatim (recover from `a1162db1`), updated status |
| `.github/workflows/container-build.yml` | build + start-smoke + pytest + **push to Cloudflare registry** on `containers/plan-parse/**` change (old workflow at `git show 0f63fe6a^:.github/workflows/container-build.yml` built but never pushed — add the push step, `CLOUDFLARE_API_TOKEN` secret) |
| `worker/lib/drawing/contract.ts` | container wire types + caps (`MAX_PDF_BYTES`, `MAX_PAGES`, `MAX_CROPS_PER_PAGE`, `MAX_DPI`), render DPI constants, and the reading/report types (four facts x three states, gap codes) -- worker-internal; no `src/` code reads them after the ops descope (§6.1) |
| `worker/lib/drawing/containerClient.ts` | `inspectPdf`, `renderPage` over the `PLAN_PARSE` DO binding (`idFromName(projectId)`); enforces caps BEFORE any container call (AB-6); stable failure codes; accepts the namespace as an argument so tests inject a fake |
| `worker/lib/drawing/selectPages.ts` | step 4, pure: inventory + page text/words → `{selected: {pageNo, tier, reason}[], tagVocabulary}` |
| `worker/lib/drawing/skills.ts` | the three vision skills (§3.2), same `Skill` shape as `worker/lib/estimator/skills/schedule.ts` (vision input via `imageDataUrl`, runner already supports it — `runner.ts:85-93`) |
| `worker/lib/drawing/assign.ts` | pure: schedule rows + Pass A boxes + floor-plan placement → per-tag crop box in PDF points, or a named refusal; fraction→point mapping lives here with its own tests (ADR 0015 consequence 2) |
| `worker/lib/drawing/enrich.ts` | the orchestrator: the six steps in order, per file; produces `{readings, gaps, report}`; progress callback per opening |
| `worker/lib/drawing/readings.ts` | persistence + application: `drawing_reading` rows, `ai_runs.drawing_report_json`, model mutation (orientation/room), conflicts + review flags, splitHint derivation input |
| `worker/lib/drawing/crops.ts` | `cropKey(projectId, runId, tag)` and `purgeProjectCrops(env, projectId)` — the ONE place the crop prefix and its lifecycle live (§7) |
| `migrations/0060_drawing_reading.sql` | §8 |
| `scripts/tests/drawing-enrichment.test.mjs` | §12 |
| `scripts/drawing-gate.mjs` | §12 — the re-runnable gate comparator (AC-G4) |
| `docs/adr/0016-plan-parse-runs-the-proven-poppler-python-method.md` | written with this design |

**Changed files**

| Path | Where | Change |
|---|---|---|
| `worker/lib/drawing/PlanParseContainer.ts` | whole file | stub → real `class PlanParseContainer extends Container` (`@cloudflare/containers`, new dependency; `defaultPort = 8080`, `sleepAfter ≈ "2m"`). Same class name, same binding, same `v1` tag — no new DO migration. The stub's held-open rationale comment is replaced by the real class's own contract comment |
| `wrangler.jsonc` | after the `durable_objects` block (~line 55) | add `"containers": [{ "class_name": "PlanParseContainer", "image": "registry.cloudflare.com/<account-id>/plan-parse:v2", "instance_type": "basic", "max_instances": 5 }]`; replace the "NO containers BLOCK YET" comment; document `AI_EXTRACTION_MODE`'s new value at the var (~line 106) |
| `worker/types.ts` | `Env.PLAN_PARSE` (~line 15), `AI_EXTRACTION_MODE` (~line 72) | comment updates: construction rule now true; the three recognised mode values |
| `worker/lib/ai/pipeline.ts` | after the `Promise.all` of document skills (~line 672), before the splitHints loop (~line 720) | the enrichment stage: gate on mode, call `enrichOpenings` per usable PDF doc, apply readings (`readings.ts`), then the reworked hint derivation (§3.4). Orientation/room application goes BEFORE `applyPlanContext` (~line 705) so the existing `??=` semantics make the reading win and the text-derived plan context fill gaps |
| `worker/lib/estimator/split.ts` | `SplitHint` (~line 141), `layoutFromHint` (~line 240) | `source` union gains `"plans"`; units gain optional `ratio`; `layoutFromHint` gains the plans branch — ratio→mm by round-all-but-last on the `composite_policy` step (output spec §1.2), printed width verbatim + remainder scaled by ratio, and horizontal-axis division of the **height** (AC-7; today's code divides width only — its own comment at ~line 122 says so) |
| `worker/lib/ai/jobs.ts` | `AI_JOB_DEADLINE_MS` (~line 44) | becomes `aiJobDeadlineMs(env)`: 120 000, or 240 000 when mode is `auto_drawings` (§10); plus `setDrawingProgress` helper writing `drawings_done`/`drawings_total` guarded by `processing_token` (same shape as `setProgress`, pipeline.ts ~line 543) |
| `worker/routes/parse.ts` | pending-claim SELECT (~line 370) and its response (~line 400) | add `j.drawings_done, j.drawings_total` → `drawingsDone`/`drawingsTotal` (the `src/data/api.ts:601` fields already exist and are documented); `POST /projects/current/clear` (~line 159) calls `purgeProjectCrops` beside the existing R2 cleanup (~line 254) |
| `worker/routes/files.ts` | `DELETE /api/files/:id` cleanup (~line 526-529) | add `purgeProjectCrops` beside the existing `runs/` prefix purge |
| `worker/lib/issue.ts` | `issueQuote` success path | call `purgeProjectCrops` after the issue commits (trigger #2, §7) |
| `src/data/useProjectDocuments.ts` | poll mapping (~line 349) | pass `drawingsDone`/`drawingsTotal` through into `AiPhase` |
| `src/components/DocumentProgress.tsx` | step detail (~line 100) | **a state addition within the shipped concept, not a UI change** (owner: *"there's no UI here, utilise the same concept, just add additional states"*) -- the per-opening counter detail; recover placement from `git show f0714fec -- src/components/DocumentProgress.tsx` and the correction in `827a8a32` (counter on the right step); reference only, re-typed against today's file |
| `scripts/tests/helpers.mjs` | end | esbuild alias plugin stubbing `cloudflare:workers` (and `@cloudflare/containers` if needed) so `unit.test.mjs`'s `worker/index.ts` bundle (~line 1434) still builds — the constraint the stub's own comment documents |
| `package.json` | `test:pure` (~line 17), new `test:drawing-enrichment` script, `devDependencies`/`dependencies` | wire `scripts/tests/drawing-enrichment.test.mjs`; add `@cloudflare/containers` |
| `.gitignore` (root) | end | `containers/plan-parse/out/` — at the ROOT, never nested (the #26/#27 lesson); asserted by test, not only by the rule (AB-9) |
| `CONTEXT.md` | *Crop evidence*, *Drawing enrichment* | updated with this design |
| existing test files | §12 | `estimator-split.test.mjs`, `ai-pipeline.test.mjs`, `ai-jobs.test.mjs`, `api.test.mjs`, `unit.test.mjs`, `web/customer.spec.ts` |

**Explicitly untouched:** `worker/lib/drawing/{geometry,profile,types,index,ref}.ts`
and their `drawing.test.mjs` coverage. They are the geometric second opinion the
route decision demoted-but-kept; nothing in this scope may call them, and they
are not deleted because the standing route decision names them the future
corroborating check. `worker/lib/estimator/skills/plan.ts`
(`planContextExtractor`) also stays: it supplies jurisdiction/storeys/rooms; for
orientation and room the reading is applied first, so the extractor only ever
fills what the drawings did not.

---

## 3. Contracts

### 3.1 Container wire (worker/lib/drawing/contract.ts)

One job = one file. Request framing: one JSON line, `\n`, raw PDF bytes.

```
POST /inspect     {"maxPages": 60}
  → 200 {"inventory": {pageCount, producer, fonts: string[], hasAttachments,
          pages: [{pageNo, widthPt, heightPt, rotation, textChars, imageCount,
                   imageAreaFraction}]},
         "pages": [{pageNo, text, words: [{text, x0, top, x1, bottom}]}]}
  → 400 {"error":"bad_request"} | 413 {"error":"too_large"} | 422 {"error":"not_a_pdf"}

POST /render      {"pageNo": 7, "dpi": 150, "crops": [[x0,y0,x1,y1], …]?}   (points; crops optional)
  → 200 {"images": [{pngB64, widthPx, heightPx}], "dpi": 150}
  → 400 | 413 | 422 | 500 {"error":"render_failed"}
```

Full page when `crops` is absent (Pass A / floor plan); cropped PNGs when
present (step 6 input). One page per request keeps responses small and failures
attributable. The container enforces the same caps the Worker enforces first
(AB-6 — Worker refuses before any container call; the container's copy is
defence in depth, not the gate). Crop rectangles are **PDF points**
(resolution-independent); `steps.py` converts to pixels at the render DPI. The
container never sees a tag, a filename, an R2 key or a model prompt.

Sending the PDF bytes on each request is deliberate: statelessness over a
byte-cache. `// ponytail: PDF re-sent per request (~3× per file); add a
checksum-keyed /tmp cache behind the same endpoints if wall time says so.`

### 3.2 The three vision skills (worker/lib/drawing/skills.ts)

All run through the existing `runStage` (idempotency, escalation shadow,
`ai_stage_runs` rows, R2 raw archive — for free). Validators **refuse, never
repair** (ADR 0013 point 3): anything outside the contract is a `not_read` with
`gap_code 'refused_contract'`.

| Skill id | promptVersion | Input | Output (validated) |
|---|---|---|---|
| `elevation_inventory` | **`v3`** (ADR 0015: no cached v2 tag-reading answer may replay) | full elevation-page render + nothing else | `{boxes: [{box: [fx0,fy0,fx1,fy1] page fractions, unitProportions: number[], panelMarks}]}` — **names nothing** (D-3) |
| `floorplan_read` | `v1` | floor-plan page render + the closed tag vocabulary (from step-3 words) + the elevation letters found on the set | per tag: `{elevation: letter\|null, orderOnWall: int\|null, roomLabel: string\|null}`; per elevation letter: `{facing: N\|NE\|…\|null}`; `issues[]`. A tag outside the vocabulary is discarded and counted (D-4 / ADR 0015 point 2) |
| `opening_read` | `v1` | one crop + `{tag, widthMm, heightMm, typeText}` from the schedule | `{units: [{role: operable\|passive, ratio, printedWidthMm?}], axis: vertical\|horizontal, confidence}` **or** `{decline: {reason}}` — the decline is a first-class schema branch, not a failure (AC-G6, R4). Never a family name, never a price, never a dimension the sheet did not print (AB-7, spec §10.2) |

Validator clamps (tested in `drawing-enrichment.test.mjs`): ratios in (0,1],
sum within 0.02 of 1 then renormalised — outside that, refused; roles from the
two-value enum only; `printedWidthMm` accepted only when the model also returns
the printed text it read it from (cheap self-consistency); orientation values
from the eight-point vocabulary; box fractions in [0,1] with x0<x1, y0<y1 —
an inverted or out-of-range box is dropped, never clamped to "the whole sheet".

### 3.3 Assignment (worker/lib/drawing/assign.ts) — pure

Inputs: schedule rows (tag, W×H), Pass A boxes per elevation page, floor-plan
placement (tag → elevation letter + order), page geometry (widthPt/heightPt).
Rules, each a test:

- A row is matched **only** against boxes on the elevation its tag was placed
  on (ADR 0015 point 4). An unplaced tag → `not_read`, `gap_code 'unplaced'` —
  never matched set-wide (spec §10.4).
- Within the elevation, order along the wall (model's answer, D-4) pairs rows
  to boxes; aspect-ratio proportion separates same-order ambiguity; a tie or a
  leftover is `frame_ambiguous` for **both** candidates — in no case does one
  take the other's (spec §13, twin-openings row).
- Box fractions → PDF points: `xPt = fx × widthPt`, `yPt = fy × heightPt`
  (full-page renders make the mapping trivial — no region indirection). This
  mapping has dedicated tests: an unmapped box crops a different window and is
  described confidently, the exact failure class the gate holds at zero.

### 3.4 Make-up precedence — one place (worker/lib/estimator/split.ts)

New pure function `resolveMakeUp(tag, {reading, comment, energy})` replacing
the two inline seeding loops in `pipeline.ts` (~lines 720-733 and ~784-795) as
the single owner of the shape ladder (house rule: one place per fact; ADR 0013
consequence 1):

1. **Shape** (units, order, operate-or-not, axis): drawing reading → schedule
   comment → energy report → none (default split). AC-15/AC-16.
2. **Stated width overlay**: a comment- or sheet-printed width beats a measured
   ratio for the units it names; the rest scale to the remainder (output spec
   §6, the W4 rule — AC-6).
3. **Count conflict** (comment says 2, drawing shows 3): the drawing's shape
   stands, a conflict is recorded and the line is review-flagged — represented,
   never resolved (R5).
4. The energy report's thermal components ride along in `components` exactly as
   today, whatever won the shape (existing behaviour at ~line 784, preserved).

Every drawing-derived proposal is flagged through the existing
`flagOpening(tag, "proposed split (confirm at review): …")` channel → line
status `technical_review` → blocks issue via `ISSUE_BLOCKING_LINE_STATUSES`
(`worker/lib/issue.ts:111`). That is AC-10 with zero new machinery.

### 3.5 Model application (worker/lib/drawing/readings.ts)

- `opening.wallOrientation` = elevation facing of the opening's elevation
  (from `floorplan_read`), `wallOrientationSource = "plan"` (existing union,
  `worker/lib/ai/schema.ts:177`) — applied before `applyPlanContext`, so the
  existing `??=` there cannot override it. Orientation then flows through the
  untouched thermal contract (`thermalInputsFor` → `computeThermalBand`) —
  AC-8, and AC-17/18/19 stay satisfied by machinery that already exists.
- Room label → `quote_line.room_label` only where empty
  (`AND (room_label IS NULL OR room_label='')`) — a human's label is never
  overwritten.
- Schedule-type disagreement (schedule `FIXED`, drawing shows an operating
  unit) → `model.conflicts` entry naming both sides + `flagOpening` with a
  reason string that itself **names both sides** (e.g. `drawing shows
  operating unit | schedule types FIXED`). After the ops descope (§6) that
  string, rendered by the existing line review display
  (`src/ops/ProjectRecord.tsx:67` `reviewReasons`), IS how AC-9's "naming both
  sides" reaches the reviewer -- so a test pins its content, not just its
  presence.
- Sizes are **never** written from readings; a drawn overall dimension that
  disagrees with the schedule is a conflict entry only (spec §10.1,
  `ASSUMED:` §11-B). AC-4.

### 3.6 The run report (AC-11…AC-14, AC-24)

Assembled by `enrich.ts`, persisted by `readings.ts` into
`ai_runs.drawing_report_json` (new additive column, §8) — an operator-read
extension of the per-run diagnostics: read by the tester and owner at
verification and at the gate walk, via D1 and `scripts/drawing-gate.mjs`
tooling (no product surface reads it after the ops descope -- §6.1). The
customer status endpoint never selects it (AC-25/AB-8 depend on this
separation; `summary_json`, which the customer poll DOES receive, gains
nothing drawing-related). Per file:

```json
{ "files": [{ "fileId": "…",
  "steps": {
    "inventory":  {"pages": 14, "fonts": 12, "images": 3, "attachments": 0},
    "strategy":   "text_vector",
    "text":       {"pagesRead": 14},
    "selectPages":{"selected": [{"pageNo":7,"tier":"elevation","reason":"ELEVATION A title"}], "of": 14},
    "renderCrop": {"pagesRendered": 4, "cropsMade": 19},
    "read":       {"attempted": 19, "returned": 17, "declined": 2}
  },
  "perOpening": [{"tag":"W1","outcome":"read","cropKey":"…","pageNo":7}],
  "wallMs": 78000, "modelCalls": 23, "containerCalls": 6 }]}
```

Six steps named in order (AC-11); render count consistent with selection only
(AC-12); `strategy: "scanned"` stops the file with a stated gap (AC-13); reads
attempted = openings located, each naming its opening and crop (AC-14); wall
time, model calls, container calls recorded (AC-24). No filenames, no drawing
text, no model output — identifiers and counts only (AB-8).

---

## 4. The switch — `AI_EXTRACTION_MODE`

The var gains one recognised value. Semantics of existing values are unchanged:

| Value | Meaning |
|---|---|
| `auto` (prod today) | extraction fires on upload, **no enrichment** — exactly today. This is AC-27's "off value", and deploying this feature changes nothing until the owner flips the var |
| `auto_drawings` | extraction fires on upload **and** the enrichment stage runs |
| `manual` | unchanged emergency kill-switch (ops-triggered only) |

The gate is one check at the top of the enrichment stage in `pipeline.ts`; off
means no `PLAN_PARSE` fetch and no drawing skill invocation on any path (AC-27
tests both by spy). Turning the feature off after a failed gate = set the var
to `auto` — a minute, not a revert (spec §7.2). Switched off mid-flight: a
running job finishes under the mode it started with; the next generation runs
without enrichment; no line is rewritten later (spec §13 edge — covered by the
existing generation/`assertCurrentGeneration` machinery, nothing new).

**Failure containment (R6, AC-28, AC-G5):** `enrichOpenings` is wrapped so that
*any* failure — container unreachable, model down, malformed file — degrades to
"zero readings, gaps recorded, report notes the failure" and the pipeline
continues to estimate exactly as today. The unit of failure below that is the
opening (spec §10.5): per-opening errors become `not_read` rows, and the loop
proceeds. Customer-visible failure semantics are exactly today's (AC-26): the
enrichment can add nothing to the failure surface because it cannot fail the
job.

---

## 5. Progress the customer watches

`migrations/0059` columns (`ai_job_claim.drawings_done/drawings_total`,
applied to production, currently unread) are re-wired, restoring what
`f0714fec`/`827a8a32` shipped:

- `enrich.ts` calls a progress callback per opening — completed **or**
  `not_read`; the denominator is set once from the located-openings count and
  never shortened (AC-22, AC-23). `jobs.ts:setDrawingProgress` writes both
  columns guarded by `processing_token`.
- `routes/parse.ts` pending SELECT adds the two columns; response gains
  `drawingsDone`/`drawingsTotal` (types already at `src/data/api.ts:601-602`).
- `useProjectDocuments.ts` passes them into `AiPhase`; `DocumentProgress.tsx`
  renders "reading openings · n of N" as the active-step detail. The customer
  sees the counter and nothing else: no unread counts, no lists, no error state
  for partials (AC-25) — and never a request to fix anything. Unread openings
surface to nobody at runtime after the ops descope; the shortfall is named in
§6.2 and ticketed.

`progress_stage` vocabulary is untouched (0059's own rationale: extending the
CHECK is a table rebuild; the counts carry the information).

---

## 6. Ops — nothing new (owner descope, relayed 2026-08-29)

**Owner ruling, verbatim:** *"there should be nothing new in ops. Ops2 has Why
this product panel, the parsing will feed into it by building more accurate
thermal modelling but that does not change UI. No display of crops at this
point."*

The `GET /api/ops/projects/:id/drawing-readings` endpoint and the
`ProjectRecord.tsx` "Drawing readings" panel this design carried in draft are
**cut**, with everything that existed only to serve them.

### 6.1 The consumer map — every enrichment output and its post-cut reader

Stated fully because a field written and never read is a defect this repo has
recorded five times by name, and cutting the viewer must not create a sixth.

| Output | Post-cut consumer |
|---|---|
| Split reading | `resolveMakeUp` → `proposeSplit` → the priced composite + the "confirm at review" flag on the line (AC-1, AC-5…7, AC-10) |
| Orientation | `wallOrientation` + source `plan` → `thermalInputsFor` → `computeThermalBand` → product selection; its basis reaches ops through the **existing** thermal audit / Why-this-product surfaces (AC-8, AC-17…19) |
| Room label | `quote_line.room_label` where empty — already shown on every line view |
| Schedule disagreement | `model.conflicts` in `building_models.model_json` (the existing structured home) + the both-sides review-reason string on the line (§3.5) → `technical_review` blocks issue (AC-9, AC-10) |
| `drawing_reading` rows — four facts × three states, evidence pointers (output spec §5), `crop_key` | the **release gate**: `scripts/drawing-gate.mjs` + the walked REF comparison (AC-G1…G4), read via D1; and the future ops view the shortfall ticket buys — the table is shaped so that view is a SELECT away |
| `ai_runs.drawing_report_json` | §5.2's anti-divergence visibility: the tester/owner at verification and the gate walk (AC-11…AC-14, AC-24), via D1/gate tooling |
| Crops in R2 | review-window evidence: the gate walk checks a reading against its pixels via `crop_key` (AC-14); purged per §7 |
| Elevation | input to `assign` (the locate join) and a gate-scored fact on the reading row |

**Two things had the cut panel as their only reader — removed with it:**

- `drawing_reading.disagreement_json` — **cut from §8's schema.** Structured
  conflicts already live in `model.conflicts`; the reason string carries them
  to the reviewer. A duplicate column with no reader would have been the sixth
  entry on the write-only list.
- `src/data/drawingReading.ts` — **not created.** The reading types move to
  `worker/lib/drawing/contract.ts`; no `src/` code reads them any more.

Nothing else in the enrichment's output had the ops surface as its only
consumer.

### 6.2 The named gap

After this cut, ops sees a **flagged line** through the existing review
mechanism but has **no view of what a reading said, which openings were read
or not read, or where readings disagreed as a list**. `CONTEXT.md`'s *Drawing
reading* entry — "ops sees gaps and disagreements" — states the intent and is
deliberately **not** softened to match; the shortfall is ticketed by the
orchestrator.

### 6.3 Criteria orphaned by the cut — for the PM to mark descoped, not unmet

- **AC-2** — the data exists (rows carry the four facts with explicit states)
  but "inspected in the ops console" has no surface.
- **AC-3** — the two absences stay distinct in the schema (CHECK'd states),
  but no screen tells them apart.
- **AB-4** — the readings half is vacuous: no HTTP surface serves readings to
  anyone, staff included; the crop half remains covered by AB-2/AB-3's route
  enumeration.
- Spec **§2.1's "ops-visible output"** scope bullet.

Not orphaned, stated so nobody re-litigates: AC-8/AC-17/AC-18/AC-19 (existing
thermal surfaces), AC-9 (existing review-reason display, with the both-sides
string pinned by test — §3.5), AC-11…AC-14/AC-24 (the spec says "when the run
report is read", deliberately naming no ops screen).

### 6.4 No mock gate applies to this feature

Stated so a later reader does not conclude the gate was skipped: the ops
surface is cut, and §5's counter is a state addition within the shipped
`DocumentProgress` concept — there is no new visual for the owner to approve.

---

## 7. Crop evidence — storage and the owner's retention ruling

Crops are written by the Worker to R2 at
**`projects/{projectId}/crops/{runId}/{TAG}.png`** — a dedicated prefix, NOT
under `runs/` (the `runs/` purge on file-delete covers only one of the three
triggers and also holds stage archives with a different lifecycle).

**Owner ruling (2026-08-29, supersedes the spec §12 D-1 recommendation): crops
die at whichever comes first —**

1. **the draft is cleared** — `POST /api/projects/current/clear`
   (`worker/routes/parse.ts:159`), plus the per-file
   `DELETE /api/files/:id` (`worker/routes/files.ts:376`), since deleting any
   source document invalidates crops derived from it (the auto re-parse
   regenerates them);
2. **the quote is issued to the client** — `issueQuote`
   (`worker/lib/issue.ts`), on the success path;
3. **the quote is voided / cancelled / deleted** — **UNHOOKED. This trigger has
   no mechanism today and this feature builds none.** `FLOW`
   (`worker/routes/ops.ts:69-75`) and `lifecycleOf`
   (`worker/lib/lifecycle.ts`) define no void/cancel/delete transition, and
   there is no delete-project route. The owner has confirmed voiding *will*
   exist — manual or automatic expiry of unaccepted quotes — and is out of
   scope here (tracked as its own ticket by the orchestrator). Not a status,
   not a route, not a sweep is built for it: a control wired to nothing is a
   recorded defect class in this repo. What IS built is the seam it will
   attach to, below.

**The rule lives in one place**: `purgeProjectCrops(env, projectId)` in
`worker/lib/drawing/crops.ts` (R2 prefix list-and-delete, the
`purgeR2Prefix` pattern from `files.ts:49`). Every wired trigger calls it; a
test per trigger proves the call is present (§12).

**The seam for the future void (designed, not built):** the function's
interface is `(env, projectId)` and nothing else — no request, no session, no
Hono context, no closure over anything a caller must manufacture. That is a
hard interface constraint, not a style preference: the Worker already has a
live scheduled handler (`worker/index.ts` `scheduled()`, cron `*/10 * * * *`
in `wrangler.jsonc`), and an automatic expiry sweep is the likely shape of
void — a caller with an `Env` and a project id and nothing more. When void
lands, it attaches in one line. The function's contract comment names the
three-triggers-now / fourth-later obligation so the next writer finds it
there rather than in R2. Consequences, stated:

- Crops exist only during the internal review window — parse → issue. AC-14's
  "retrievable afterwards" holds within that window, which is when the gate is
  walked and when review happens.
- A labelling corpus can never be production crops by default; it is a
  deliberate copy made before issue (owner's ruling as relayed).
- After purge, `drawing_reading.crop_key` dangles by design; the gate walk
  happens inside the review window, before purge, and any future reader treats
  a missing object as evidence-expired. No tombstone column — the project's
  status already says whether crops are expected. `// ponytail: dangling key with
  documented meaning; add a purged_at column only if a viewer ever needs to
  distinguish expired from failed-write.`
- Crops are never written for a project in a terminal state (spec §13): the
  enrichment only runs inside a draft-generation job, which the existing
  `status_customer='draft'` claims already enforce — noted, not built.

---

## 8. Migration `0060_drawing_reading.sql`

`d1-migration-safety` loaded and applied. Re-measured live cascade count: 52.
**Additive only — CREATE TABLE + ADD COLUMN + CREATE INDEX. No DROP, no
rebuild, no RENAME: none of the rebuild recipe, so no cascade can fire.**
No `PRAGMA defer_foreign_keys` needed.

```sql
-- children affected: none existing. This migration CREATES a child:
-- drawing_reading references project (CASCADE) and ai_runs (CASCADE), the
-- same parentage as evidence_items (0016). Any FUTURE rebuild of project or
-- ai_runs now cascades this table too — intended: readings are per-run
-- evidence and die with their run.
CREATE TABLE drawing_reading (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  ai_run_id          TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  source_file_id     TEXT REFERENCES file_asset(id) ON DELETE SET NULL,
  external_ref       TEXT NOT NULL,           -- normalizeOpeningRef form
  split_state        TEXT NOT NULL CHECK (split_state       IN ('value','not_stated','not_read')),
  split_json         TEXT,                    -- {units:[{role,ratio,printedWidthMm?}], axis}
  orientation_state  TEXT NOT NULL CHECK (orientation_state IN ('value','not_stated','not_read')),
  orientation        TEXT CHECK (orientation IN ('N','NE','E','SE','S','SW','W','NW')),
  elevation_state    TEXT NOT NULL CHECK (elevation_state   IN ('value','not_stated','not_read')),
  elevation          TEXT,
  room_state         TEXT NOT NULL CHECK (room_state        IN ('value','not_stated','not_read')),
  room_label         TEXT,
  gap_code           TEXT,                    -- unplaced|frame_ambiguous|division_unreadable|scanned|refused_contract|model_declined|render_failed
  gap_note           TEXT,
  crop_key           TEXT,                    -- R2 identifier; §7 lifecycle; dangles after purge by design
  page_no            INTEGER,
  sheet_ref          TEXT,
  region_json        TEXT,                    -- [fx0,fy0,fx1,fy1] page fractions
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_drawing_reading_run ON drawing_reading(project_id, ai_run_id);

ALTER TABLE ai_runs ADD COLUMN drawing_report_json TEXT;  -- ops-only method report (§3.6); nullable, every existing row predates it
```

Four `*_state` columns rather than one, because the spec's AC-2/AC-3 make the
three states a per-field fact and the schema should make collapsing them
impossible, not merely discouraged. Remote apply follows the skill's rules
verbatim (export first; before/after counts on `project`/`ai_runs` children —
expected delta zero, the migration is additive).

---

## 9. Security

**Data classification.** Plan sets, page renders and crops are customer data;
crops are fragments of a customer's drawings (personal/commercial PII — title
blocks carry a third party's name, site address and project number).
`drawing_reading` rows and `drawing_report_json` are commercial data derived
from customer documents: staff-only. Nothing new is customer-facing except the
progress counter (two integers) and a better-chosen product. Minimal columns;
no drawing text stored outside `split_json`'s structured fields; no filenames
in the report (file ids only).

**Trust boundaries** (spec §8, each with its control here):

1. *Upload → parse.* The document is untrusted. Text printed in it reaches the
   model as content, never as instructions; every skill output goes through a
   refusing validator (§3.2), so printed instructions cannot choose a product,
   a price or an out-of-contract field (AB-7). Residual risk, accepted per
   spec: a poisoned in-range proportion survives to review — the human gate is
   the control, and AC-10 guarantees the gate.
2. *Worker → container.* Reachable ONLY via the `PLAN_PARSE` DO binding — no
   route, no service binding, no hostname; the container holds no R2/D1/model
   credentials and makes no outbound call (AB-5, asserted by test over
   `wrangler.jsonc` + route enumeration + `requirements.txt`). The Worker
   validates size/page/crop/DPI caps BEFORE any container call and the
   container re-enforces them (AB-6, both layers tested).
3. *Model → platform.* Output is refused, never repaired; a decline is a
   first-class answer (AC-G6); a refusal is a `not_read` with
   `refused_contract` (R4).

**Authorization model per endpoint:**

| Route | Caller | Exact scoping |
|---|---|---|
| `GET /api/projects/current/extraction-status` (changed) | the customer | project resolved from the **session** (`resolveCurrentProject`) — the two new columns ride the existing claim row lookup, which never takes a client-supplied project id (AB-1). Adds two integers; adds no unread counts, no lists (AC-25) |
| `POST /api/projects/current/clear` (changed) | the customer | unchanged session-resolved project + draft-only guard; the added purge uses that same resolved id |
| `DELETE /api/files/:id` (changed) | the file's owner | unchanged `ownedProject` check; purge keyed on `fa.project_id` from the verified row |
| Container endpoints | the Worker only, via DO binding | no public surface exists (AB-5) |
| Crop bytes | **nobody** | no route serves them in this scope; AB-2 is verified by enumerating routes, and the guest grant reaches only `file_asset`-backed downloads, which crops are not (AB-3) |
| Readings (`drawing_reading`, `drawing_report_json`) | **nobody over HTTP** | the ops endpoint was descoped (§6); no route serves readings to any caller, which makes AB-4's readings half vacuous rather than unenforced. Access is D1 tooling under Cloudflare credentials |

**Abuse cases → controls:** AB-1 session-resolution (above, tested); AB-2/AB-3
no-crop-route property test (which now also proves no readings route — AB-4's
readings half is vacuous, §6.3); AB-5
config+dependency assertions; AB-6 dual-layer caps with stable failure codes,
refused before rendering; AB-7 refusing validators + mandatory review flag;
AB-8 report/log contract (identifiers and counts only; container access log
silenced; `phase()` fields already ban filenames per §21.1) — tested by
asserting the report builder's output shape; AB-9 the repo-hygiene test (§12)
+ root-level `.gitignore`; AB-10 existing parse quota + AI Gateway spend cap
and rate limit — no new spend path bypasses `runStage`, which is inside the
quota'd job; the tester walks the refusal.

**Known exposure, unchanged:** the REF filename (site address) already sits in
committed docs (`DECISIONS.md`, archived spec). This design refers to REF only;
purging history is the owner's call and is not re-proposed.

---

## 10. Budget, deadline, and one operational prerequisite

- **Model-call count on REF:** ~19 `opening_read` + ~2 `elevation_inventory` +
  1–2 `floorplan_read` ≈ 22–24 calls/run. `opening_read` runs in a pool of 5.
- **Job deadline:** `aiJobDeadlineMs(env)` = 240 s under `auto_drawings`
  (base 120 s + the enrichment's own 120 s gate), 120 s otherwise. The 135 s
  lease and 15 s heartbeat already renew (`jobs.ts:482-494`), and the
  `parse.ts` reaper keys on `updated_at` staleness, so neither needs changing.
  This is deliberately not the reverted attempt's blanket 300 s: the base
  budget stays owner-approved, and only the switched-on mode pays more.
- **AI Gateway rate limit is the binding constraint.** The gateway is capped at
  20 provider requests/min (`wrangler.jsonc` comment); 22–24 calls cannot fit
  the 90 s target and threaten the 120 s gate through 429 queuing. Raising it
  is a dashboard change only the owner can make — named in **Decisions
  needed**. AC-24's recorded wall time is what verifies the outcome either way.
- AC-24's numbers (`wallMs`, `modelCalls`, `containerCalls`) are recorded in
  the report (§3.6) on every run, so the 90 s target is measured, not asserted.

**Local dev without Docker:** `wrangler dev` must not require the container.
The build task (slice 3) verifies against wrangler 4.111.0 the flag that
disables containers in dev (`wrangler dev` container enablement — e.g.
`--enable-containers=false` / `dev.enable_containers`); acceptance is
"`npm run dev:api` runs on a Docker-less Windows machine". If no such switch
exists in 4.111.0, the fallback is a deploy-only config layer
(`wrangler deploy -c wrangler.deploy.jsonc` extending the base) — the
containers block moves there and nothing else does. Enrichment stays off
locally anyway (`AI_EXTRACTION_MODE=auto` in dev vars), so a dev container
fetch is not a supported path either way.

---

## 11. Build slices — one developer session each

Ordered; each independently verifiable; every named test file appears in the
slice that creates or extends it. Probity: each slice starts red with its
named tests.

**S1 — Contracts, migration, crop lifecycle core.**
Files: `migrations/0060_drawing_reading.sql`,
`worker/lib/drawing/crops.ts`, `worker/lib/drawing/contract.ts` (including
the reading/report types — §6.1),
`scripts/tests/drawing-enrichment.test.mjs` (created), `package.json`
(`test:pure` + `test:drawing-enrichment`).
Verify: migration applies locally (`npm run db:migrate:local`); state enums,
`cropKey`, purge behaviour (fake R2), caps constants under test.

**S2 — The container, its CI, and repo hygiene.**
Files: `containers/plan-parse/{Dockerfile,server.py,steps.py,requirements.txt,README.md}`,
`containers/plan-parse/tests/test_steps.py`,
`.github/workflows/container-build.yml`, root `.gitignore`,
`scripts/tests/drawing-enrichment.test.mjs` (AB-9 hygiene tests).
Verify: CI green on the branch (build, starts-and-answers, refuses malformed,
pytest over a synthetic PDF); hygiene test red-then-green.

**S3 — The binding comes alive.**
Files: `worker/lib/drawing/PlanParseContainer.ts`,
`worker/lib/drawing/containerClient.ts`, `wrangler.jsonc`, `worker/types.ts`,
`scripts/tests/helpers.mjs` (esbuild shim), `package.json`
(`@cloudflare/containers`), dev-mode flag per §10.
Verify: `npm run test:unit` still bundles `worker/index.ts`; containerClient
cap-refusal tests (AB-6 Worker-first) in `drawing-enrichment.test.mjs`;
`npm run dev:api` on this machine; `wrangler deploy --dry-run` accepts the
registry URI.

**S4 — The judgements (pure).**
Files: `worker/lib/drawing/selectPages.ts`, `worker/lib/drawing/skills.ts`,
`worker/lib/drawing/assign.ts`, `scripts/tests/drawing-enrichment.test.mjs`
(the bulk: selection tiers/reasons/strategy, validator refusals incl. AB-7 and
the decline branch, assignment rules incl. fraction→point mapping and the
twin-opening refusal).
Verify: `npm run test:drawing-enrichment` green; fixtures are synthetic (§12).

**S5 — Orchestration into the pipeline.**
Files: `worker/lib/drawing/enrich.ts`, `worker/lib/drawing/readings.ts`,
`worker/lib/ai/pipeline.ts`, `worker/lib/ai/jobs.ts` (deadline),
`worker/lib/estimator/split.ts` (`resolveMakeUp`, plans branch, horizontal
axis), extends `scripts/tests/estimator-split.test.mjs`,
`scripts/tests/ai-pipeline.test.mjs`, `scripts/tests/ai-jobs.test.mjs`.
Verify: AC-27 spy test (mode `auto` touches nothing); fake-container +
fake-model pipeline run produces readings, report, conflicts, flags, unchanged
sizes; split arithmetic per AC-5/6/7.

**S6 — Progress to the customer (a state addition to shipped UI, not a UI
change — §6.4).**
Files: `worker/routes/parse.ts` (status SELECT/response),
`worker/lib/ai/jobs.ts` (`setDrawingProgress`),
`src/data/useProjectDocuments.ts`, `src/components/DocumentProgress.tsx`,
extends `scripts/tests/api.test.mjs`, `scripts/tests/web/customer.spec.ts`.
Reference diffs: `git show f0714fec`, `git show 827a8a32` (placement of the
counter; re-typed, not cherry-picked).
Verify: counter fields in the poll; denominator never shortens; AC-25 response
shape (no unread detail).

*(The former S7 — the ops surface — is cut by the owner's descope, §6.)*

**S7 — Retention triggers, the gate runner, and the records.**
Files: `worker/lib/issue.ts`, `worker/routes/parse.ts` (clear),
`worker/routes/files.ts` (delete), extends `scripts/tests/unit.test.mjs`
(each wired trigger provably calls `purgeProjectCrops`, and a signature test
pins the `(env, projectId)`-only interface the future void depends on — §7),
`scripts/drawing-gate.mjs` + its comparator tests in
`scripts/tests/drawing-enrichment.test.mjs`. Trigger #3 stays unhooked (§7;
ticketed outside this feature by the orchestrator).
Verify: trigger tests; `node scripts/drawing-gate.mjs readings.json
labels.json` produces the per-opening comparison deterministically (AC-G4).

After S7: the REF walk (tester + owner): label sheet assembled → owner
confirms once (D-2, spec §9 gap 2) → labels fixture committed under AB-9's
content rule → gate scored 19-of-19 (AC-G1…G4) → owner flips the var.

---

## 12. Test plan — file → proves → criterion

**New: `scripts/tests/drawing-enrichment.test.mjs`** (wired into `test:pure`
and `test:drawing-enrichment`; created in S1, grown through S7):

| Proves | Criteria |
|---|---|
| `selectPages`: tiers with reasons, selection before render, schedule page inside a plan set still a schedule page, plan pages inside an energy report read as plans, unknown-elevation-label set reports "none recognised" | AC-12, AC-20, AC-21, §13 edges |
| strategy: no-text-layer → `scanned`, stop with named gap, zero reads | AC-13 |
| validators: family name refused, price refused, printed-instruction payload stays inside contract, decline accepted and recorded with reason, ratio/box clamps refuse not repair | AB-7, AC-G6, R4 |
| `assign`: within-one-elevation only, unplaced → `not_read('unplaced')`, twin openings both refused on tie, fraction→point mapping exact | AC-14's precondition, AC-G2's failure class, spec §10.4, §13 |
| `resolveMakeUp` ladder: plans > comment > energy for shape; stated-width overlay; count conflict → flag; single-unit reading valid not split | AC-15, AC-16, AC-6, §13 |
| report builder: six steps in order, counts consistent, wallMs/modelCalls/containerCalls present, **no filename/text/output fields representable** | AC-11, AC-12, AC-14, AC-24, AB-8 |
| `cropKey`/`purgeProjectCrops` behaviour on fake R2 | §7, AB-2's storage rule |
| gate comparator (`scripts/drawing-gate.mjs` logic): deterministic per-opening verdicts against a labels fixture; "not drawn on any elevation" reported in those words | AC-G1…G4, AC-G3 |
| **AB-9 hygiene**: no `.png/.jpg/.pdf` under `scripts/tests/fixtures/drawing/` or `containers/`, no title-block patterns (generic street-suffix / `NNNNN_Lot` regexes — never the literal address) in any drawing fixture, root `.gitignore` carries the crops rule | AB-9 |
| containerClient: caps refused Worker-side with stable codes before any fetch; `wrangler.jsonc` has no route/service binding to the container; `requirements.txt` contains no credential-bearing client | AB-5, AB-6 |

All fixtures are **synthetic** (hand-built page text and geometry modelled on
REF's shape) — raw REF text would itself violate AB-9.

**Extended existing files:**

| File | Proves | Criteria |
|---|---|---|
| `scripts/tests/estimator-split.test.mjs` | plans-source hint: ratio→mm round-all-but-last on the policy step, last unit absorbs remainder; printed width verbatim + never invented; horizontal axis divides height not width | AC-5, AC-6, AC-7 |
| `scripts/tests/ai-pipeline.test.mjs` | mode `auto`: byte-identical path, spy container/skills untouched; mode `auto_drawings` with fakes: readings persisted + applied, sizes identical to schedule, disagreement → conflict + a review-reason string naming both sides (§3.5), no reading → line identical to no-enrichment run, whole-file failure → estimate proceeds on schedule, orientation reaches thermal inputs with source `plan`, report lands in `drawing_report_json` and NOT in `summary_json` | AC-1's mechanism, AC-2, AC-4, AC-8, AC-9, AC-10, AC-27, AC-28, AC-29, AC-25's server half |
| `scripts/tests/ai-jobs.test.mjs` | deadline 240 s only under `auto_drawings`; mid-flight switch-off leaves no half-enriched quote (generation supersede path) | AC-24's envelope, §13 edge |
| `scripts/tests/api.test.mjs` | status poll carries `drawingsDone/Total` via session-resolved project (never a client-supplied id); no route serves crop bytes **or readings** (route enumeration — also makes AB-4's readings half vacuous, §6.3); guest grant enumeration reaches no crop/reading | AB-1, AB-2, AB-3, AB-4 (vacuous half), AC-22's transport |
| `scripts/tests/unit.test.mjs` | `issueQuote`, `/projects/current/clear`, `DELETE /files/:id` each reach `purgeProjectCrops`; the function's interface stays `(env, projectId)`-only so a scheduled void can call it (one-function rule, future-caller seam) | §7 owner ruling |
| `scripts/tests/web/customer.spec.ts` | counter renders and advances "n of N"; partial failure shows nothing to fix, no error state | AC-22, AC-23, AC-25 |
| `containers/plan-parse/tests/test_steps.py` (CI) | inventory/text/words/render/crop against a generated synthetic PDF; crop pixels match requested points at DPI | R1's mechanical half |

**Walked, not automated** (spec §9 gap 1 — REF is not in the repo): AC-1,
AC-3's on-screen check, AC-17/18/19 on real documents, AC-24's real wall time,
AC-26, AB-10's live quota refusal, and the whole §7.1 gate (AC-G1…G4) against
the owner-confirmed label sheet. The tester records evidence per criterion.

---

## 13. Deleted / withdrawn machinery, by symbol

Nothing survives commented out.

- `PlanParseContainer`'s stub body — the 503 `plan_parse_unavailable` fetch and
  the entire held-open rationale comment (`worker/lib/drawing/PlanParseContainer.ts`)
  — replaced by the real `Container` subclass. Class name, binding and `v1`
  migration tag are retained unchanged.
- `wrangler.jsonc`'s "NO `containers` BLOCK YET" comment block (~lines 46-56) —
  replaced by the containers entry and a registry-image note.
- `worker/types.ts` `PLAN_PARSE` doc-comment's forward reference to a
  then-nonexistent `containerClient.ts` — becomes true rather than deleted;
  the `AI_EXTRACTION_MODE` comment is rewritten for three values.
- The two inline splitHint seeding loops in `pipeline.ts` (~720-733, ~784-795)
  — subsumed by `resolveMakeUp` (§3.4); the owner-rule comments they carry
  (2026-08-06 "the plan wins the geometry") move with the logic, not deleted.
- From the *scaffold being consciously not restored*: `boto3` and `anthropic`
  in `requirements.txt`, and the container-side vision call (`read_opening` in
  `pipeline/steps.py`) — the read is the Worker's (§1); recorded here so their
  absence is a decision, not an omission.
- ADR 0013's point-2 "Node — same pdf.js as the Worker" — superseded by ADR
  0016 (noted in 0016; 0013 points 1, 3, 4 stand).

---

## 14. Rejected alternatives

| Alternative | Rejected because |
|---|---|
| Node container (reuse pdf.js/unpdf; the reverted implementation's path) | R1 binds the commands and libraries; the Node path's evidence lives in reverted code; its one benefit (shared coordinate space with the geometric check) buys nothing in a scope with no geometric check (§1) |
| In-Worker rasterisation (pdfium/pdf.js WASM) | a different PDF engine is a substitution twice over; workerd has no canvas/native path; memory/CPU limits make A3 rendering hostile |
| Vision call inside the container (the scaffold's `main.py` sketch) | the container would need the model key (violates AB-5's no-credentials stance) and would bill GiB-seconds waiting on the model; the method's own README already assigns the read to the Worker |
| Page selection in the container (scaffold's `select_pages`) | a judgement in Python is untestable without Docker on this repo's machines; moving it to the Worker preserves the step, its order and its inputs, and AC-12 pins the order (§1) |
| A new env var for the switch (`AI_DRAWING_ENRICHMENT`) | the spec names `AI_EXTRACTION_MODE` as the switch; a second var is a second place for one fact |
| Enrichment on under the existing `auto` value | flipping on at deploy, before the gate is scored, is exactly the "release decision" the switch exists to avoid; `auto_drawings` makes turning-on a deliberate act (§4) |
| Readings stored only in `building_models.model_json` + `evidence_items` | the gate comparator (AC-G1…G4) and the ticketed future ops view need per-field three-state queries; burying states in a JSON blob invites the collapse the output spec §4 forbids; a dedicated child table keeps the schema honest. Re-checked after the §6 descope: the table's readers are the gate and the ticket, named in §6.1 |
| Crops under the existing `runs/` prefix (inherit the file-delete purge) | covers one retention trigger of three and couples crop lifetime to stage-archive lifetime; the owner's ruling needs one function called from three places, which needs a dedicated prefix (§7) |
| Whole-set proportion matching as a fallback for unplaced openings | explicitly forbidden — ADR 0015, spec §10.4 |
| Extending `progress_stage`'s CHECK for a "reading openings" stage | table rebuild in a 52-cascade schema; 0059's counters already carry the information |

---

## 14a. OPEN LOOP FOR THE BUILD — AC-15's disagreement channel

Raised by the product-manager during the descope pass and **not yet answered by this design.**

The ops readings view is gone, so AC-9's schedule-vs-drawing disagreement now reaches the reviewer
through the review-flag string itself, which §3.5 requires to name both sides
(`drawing shows operating unit | schedule types FIXED`).

**AC-15 has the same dependency and a different pair.** Its disagreement is
**plans vs energy report** — the architectural ladder against the thermal one — and it was routed
down the same channel by the PM on the assumption that the channel is general.

**The build must confirm that before it relies on it**, and the slice that touches §3.5 owns the
question:

- does the flag string's shape carry *any* two sides, or only schedule-vs-drawing?
- if only the latter, either generalise it or give AC-15 its own named channel — do not leave a
  criterion whose only route to a human is a string that cannot express it.

Whichever way it resolves, the test that pins the string's content (§12) must cover both pairs.
A criterion that cannot be tested is not met, and this one currently reads as met.

---

## 15. `ASSUMED:` and open items

- Spec §11-A (no crop viewer), §11-B (schedule keeps overall sizes), §11-C
  (120 s gate / 90 s target) — carried unchanged.
- `ASSUMED:` **orientation is read as elevation-facing by the floor-plan
  call** (§3.2): the model reads the north indication on the plan/site page and
  answers a compass point per elevation letter; an opening's orientation is its
  elevation's facing. Orientation is new scope (00-ask §11.3) with no
  documented step, so this is the architect's construction — D-4-consistent
  (ask the model rather than re-derive geometry). Vetoable if the owner wants a
  different orientation source.
- **Trigger #3 is unhooked** (§7): voiding will exist (owner, 2026-08-29) and
  is out of scope here; it attaches to `purgeProjectCrops(env, projectId)` —
  an interface deliberately callable from `scheduled()` — when it is built.
  Tracked as its own ticket by the orchestrator.
- **No mock gate applies** (§6.4): the ops surface is cut and the counter is
  a state addition to shipped UI — there is no new visual to approve.
