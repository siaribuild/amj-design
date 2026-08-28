# plan-parse-method — implementation design

**Status:** design for build. Implements `docs/estimator/drawing-parse-design.md` §4.1–4.3
(unchanged, the design of record) to the criteria of `docs/runs/plan-parse-method/01-spec.md`,
under the four owner decisions in `docs/runs/plan-parse-method/DECISIONS.md` (binding).

**Supersedes:** `docs/estimator/plan-parse-method-architecture.md` in full. Its module split and
its flow diagram survive here in corrected form; its three errors do not — the ~1568 px model cap
(unverified, F-1), the 2.6× resolution arithmetic (wrong for vertically stacked elevations, F-2),
and the missing coordinate-space mapping (F-4) are each replaced by a section below. The superseded
banner is already on that file (added with this design).

**Decisions applied:**

- **D-1** — the gate harness scores *every opening the confirmed label sheet says is drawn* and
  passes only at 100% of those with zero wrong; if the label sheet shows fewer than 19 drawn, the
  harness prints that fact in the owner's words rather than lowering the bar (§9).
- **D-2** — the reference PDF (already committed at `scripts/research/plan-geometry/plans.pdf`) is
  the fixture; the label sheet is a new file the tester assembles and the **owner confirms once**
  before the gate is judged (§9.1).
- **D-3** — Pass A names nothing. The tag question, the tag-first join, `duplicate_tag`,
  `preferLocation`/`locationVerdict` and the whole multi-sheet claim merge are **deleted**, not
  commented out (§10 is the exact list). `elevation_inventory` moves to `promptVersion: "v3"` (§5.3).
- **D-4** — the floor-plan pass asks the model for BOTH the elevation letter and the order along
  that wall, one call per floor-plan page, over a closed vocabulary the text layer supplies. The
  marker-side arithmetic remains as a *check* on the model's answer, never the source (§5.2, §8.3).

**No migration.** Nothing here touches `migrations/` — placements are transient, the run report
rides the existing `ai_runs` summary JSON and `ai_stage_runs.metrics_json`, and the progress
columns already exist (0059). The `d1-migration-safety` skill therefore was not engaged; if any
slice discovers it needs schema after all, it stops and this design is revised first.

---

## 1. The shape of the change

One deep module — `readDrawings` — keeps its interface almost unchanged (one entry point, one
result type; the only interface change is the page argument renamed `elevationPages` →
`planPages`, because the caller hands over the router's plan pages and classification now happens
inside). Everything below that seam is restructured:

```
positioned text (sheetText)            schedule rows (authoritative, pipeline)
        │                                        │
        ▼                                        │
page classification ── elevation sheets ──► elevation regions (elevations)
(planTags/elevations)└─ floor plans              │
        │                                        │
        ▼                                        │
plan_placement skill (model, 1/plan page)        │
  closed vocab = text-layer tags                 │
        │                                        ▼
        ▼                              Pass A per REGION (elevation_inventory v3)
placements: tag → {elevation, order}     boxes normalised to the REGION image
  + projection check (place)                     │
        │                                        ▼
        └────────────► assign, per elevation only (assign)
                       proportion + wallOrder, refusals unchanged in spirit
                                │
                                ▼  located rows only
                       composeRegions: region box → page Region (crop)
                                ▼
                       cropBoxFor → container crop → Pass B (unchanged)
                                ▼
                       verifyReading → outcomes → split hints (pipeline, unchanged)
```

The design-of-record properties this restores, each with the criterion that pins it: Pass A sees a
region, never a page (M-1, L-S3); only elevation sheets are inventoried (M-3, L-S2); the floor
plan supplies elevation and order (M-4/M-5, L-C4/L-O1); matching happens inside one elevation
(M-6, L-A1); a region box is mapped to page space before any crop is cut (M-9, L-A7).

## 2. Module map

Deep-module framing: the external seam is `readDrawings` and it does not widen. Every new module
below is an *internal* seam — pure, exported for tests through `worker/lib/drawing/index.ts`, and
none of them touches `env`.

### New

| module | responsibility (one line) |
|---|---|
| `worker/lib/drawing/sheetText.ts` | Positioned text runs for one page from the doc proxy `read.ts` already opens — the only new code that touches a PDF page, and it takes the page as an argument. |
| `worker/lib/drawing/elevations.ts` | Text runs → `ElevationRegion[]` per page (label regex, stacked-and-side-by-side split rules, title-block exclusion) plus set-level `dedupeElevations`. Pure. |
| `worker/lib/drawing/planTags.ts` | Text runs → plan tag list (normalised, title block excluded) and A–D marker positions → `markerSides` via the centroid rule. Pure. |
| `worker/lib/drawing/place.ts` | Model answers × text-layer vocabulary × schedule roster × marker sides → `Placement[]`, unplaced list, discard count, and the projection order-check. Pure. |
| `scripts/research/plan-read/extract-runs.mjs` | One-off: extracts pages 4–7 positioned runs from the reference PDF into the committed test fixture. |
| `scripts/research/plan-read/calibrate.mjs` | Manual, fixture-gated: the L-G6 resolution measurement (§6). |
| `scripts/research/plan-read/gate.mjs` | Manual, fixture-gated: the release-gate scorer against the confirmed label sheet (§9). |
| `scripts/research/plan-read/labels.json` | The label sheet — 19 rows, tester-assembled, **owner-confirmed before the gate is judged** (D-2). |
| `scripts/tests/fixtures/ref-text-runs.json` | Committed positioned-run fixture for pages 4, 5, 6, 7 of the reference document, so the pure modules are tested against real coordinates without opening a PDF. |

### Changed

| module | change |
|---|---|
| `worker/lib/drawing/crop.ts` | Gains three pure functions: `composeRegions` (region-space box → page Region, §4), `regionRenderBox` (region + pixel budget → CropBox + scale, §6), `regionOfCropBox` (CropBox → page Region, the evidence inverse, §4). `cropBoxFor`, `isRegion`, `clampToImage` unchanged. |
| `worker/lib/estimator/skills/drawingRead.ts` | `elevationInventory`: tag question removed, `promptVersion: "v3"` (§5.3). New third skill `planPlacement` (§5.2). `openingComposition` untouched (L-R3). |
| `worker/lib/drawing/assign.ts` | Rewritten to the within-one-elevation contract: proportion + `wallOrder`, refusals kept, order-consistency check added, tag machinery deleted (§8, §10). |
| `worker/lib/drawing/verifyReading.ts` | `Disagreement.check` union: `"tag_shape"` removed, `"order_conflict"` and `"order_projection"` added. Checks 1 and 3 untouched. |
| `worker/lib/drawing/read.ts` | Orchestrator rewritten to the §3 flow. Keeps: `planBytes` scoping, terminal-project rule, crop store/replay/evidence machinery, `recordDrawingProgress`, index-placed outcomes, `READ_CONCURRENCY` pool. Deletes: `PASS_A_SCALE`, whole-sheet render, `measureSheets` (folded into the single doc-open loop), the multi-sheet claim merge (§10). |
| `worker/lib/drawing/index.ts` | Exports for the new pure modules; `preferLocation`/`locationVerdict` exports removed. |
| `worker/lib/ai/pipeline.ts` | Call-site (~line 715): `elevationPages` → `planPages` (same value, `planDoc.rolePages.plans`); persists `read.report` into the run summary. Hint merge untouched. |
| `scripts/tests/drawing.test.mjs` | Tag-join battery deleted; region/placement/mapping batteries added (§14). |
| `scripts/tests/ai-pipeline.test.mjs` | Structural pins updated to the new method and extended with the conformance pins (§12). |
| `docs/estimator/plan-parse-method-architecture.md` | Superseded banner pointing here — already applied with this design. |
| `CONTEXT.md` | Already updated by the architect this round: *Placement*, *Elevation region* added; *Drawing reading* sharpened. |
| `docs/adr/0015-pass-a-names-nothing-the-floor-plan-places.md` | Already written by the architect this round; records D-3/D-4 as an ADR. |

### Deleted (D-3) — see §10 for the symbol-level list

No new files are deleted whole; the deletions are surgical, inside `assign.ts`, `read.ts`,
`drawingRead.ts`, `verifyReading.ts`, `index.ts` and the two test suites.

## 3. Data flow, end to end

Numbered; each step names its module and the criteria it satisfies.

1. **Pipeline invokes the read** (`pipeline.ts` ~715) after `applyPlanContext`, exactly as today,
   passing `planPages` (the router's `plans` role pages) and the authoritative rows. The schedule
   is never re-derived (M-10, L-R1 — enforced by the rows being built from `model.openings` and
   the read returning outcomes keyed by tag, never rows).
2. **Announce the denominator**, terminal check, `planBytes` under `WHERE project_id = ? AND id = ?
   AND virus_status = 'clean'` — all unchanged (`read.ts`).
3. **One doc open.** For each `planPages` page: viewport (width/height pt) + positioned runs
   (`sheetText.runsForPage`). The PDF is opened once; nothing downstream reopens it.
4. **Classify per page, per role — not exclusively** (L-S1): a page with an `ELEVATION <letter>`
   label is an elevation sheet (`elevations.elevationRegions` returns its regions); a page whose
   runs contain ≥1 tag matching the schedule roster outside the title block is a floor plan
   (`planTags.planTags` ∩ roster). A page can be both.
5. **No labels anywhere** → no Pass A call is ever built; every opening resolves `not_read` /
   `no_elevation_labels`; the run report records `noElevationLabels: true` (L-S4, D-6 carried:
   no generalisation).
6. **Floor-plan pass** — per floor-plan page (cap `MAX_PLAN_PAGES = 6`): render the page's
   drawing area (page minus title-block column, through `regionRenderBox` at the Pass-A budget —
   which also keeps title-block PII out of the model call), then `runStage(planPlacement)` with
   the image, the page's own tag list, and the recognised elevation letters. `place.ts` filters
   the answer (closed vocabulary, §5.2), applies the projection check (§8.3), and yields
   `Placement { tag, elevation, wallOrder }` per placed opening, `unplaced` for the rest, and the
   discard count for the report (M-4, M-5, M-12; L-C1–C6, L-N1, L-O1).
7. **Elevation regions** (`elevations.ts`): one region per label per sheet; vertical stacking
   splits at the *upper* label's baseline (F-3 corrected, L-E2), side-by-side at the x midpoint
   (L-E3), right edge capped at the title-block boundary (L-E4). `dedupeElevations` drops a
   letter appearing on two sheets (both openings placed there → `duplicate_elevation_label`).
8. **Pass A per region** (M-1, M-3; L-S2, L-S3): `regionRenderBox` computes the pixel rectangle
   and scale from *that region's* extent against `PASS_A_PIXEL_BUDGET` (L-E5, §6); container
   calls are batched by quantised scale (§6); `runStage(elevationInventory /* v3 */)` per region
   with `sheetLabel: "ELEVATION A (p6)"`. Boxes come back normalised **to the region image**.
   A region that fails to render costs exactly its own placed openings, with the renderer's own
   failure code (L-E6).
9. **Assign per elevation** (`assign.ts`, §8): rows placed on that letter (with their
   `wallOrder`), against that region's boxes only (M-6, L-A1). Refusals: `unlocated`,
   `ambiguous_box`, `ambiguous_row`, `order_conflict` — each `not_read`, never `not_stated`
   (M-7, M-11). Placed-on-a-letter-with-no-region → `missing_elevation` (L-C7); unplaced →
   `unplaced` (L-C5).
10. **Map, then crop** (M-9): for each assignment, `composeRegions(elevationRegion, box)` produces
    the page-space Region; `cropBoxFor(pageRegion, pageW, pageH, RENDER_SCALE)` produces the
    padded pixel crop; `regionOfCropBox` of that same CropBox is what is persisted as evidence, so
    the stored region and the stored crop describe one rectangle (L-A7, L-A8). Nothing unlocated
    is cropped (M-8, L-A6).
11. **Pass B, verification, outcomes, progress, crop evidence** — unchanged (`openingComposition`
    v1, `verifyReading`, index-placed outcomes, `recordDrawingProgress` with the token guard,
    replay/terminal crop rules). `not_stated` remains reachable only here (L-R2).
12. **Run report** (`DrawingRunReport` on the result): pages classified per role, regions per
    letter, model calls per stage, container calls, quantised-scale buckets, discarded model
    answers, placed/unplaced counts, and wall time per stage. The pipeline stores it on the run
    summary JSON (additive; no schema change). This is what L-S3, L-G6, L-G7, L-N10 and §9.4 of
    the spec read from.

## 4. Coordinate spaces — the load-bearing section

Three spaces exist. Every value is annotated with its space in the type name or the field comment;
the transforms live in exactly two files and nowhere else.

| space | origin / units | who produces values in it |
|---|---|---|
| **Page space** | PDF user units, origin bottom-left | the text layer: labels, tags, markers (`sheetText`, `planTags`, `elevations` internals) |
| **Page Region** | 0..1, origin **top-left** (`Region`, the platform's stored form — `evidence_items.region_json`) | `elevations.ts` output (via the existing `toRegion`, which flips y exactly once), crop evidence |
| **Region-image space** | 0..1, origin top-left, relative to the region image Pass A was shown | `elevation_inventory` boxes |

Transforms — all in `worker/lib/drawing/crop.ts` (page-space→Region uses the existing
`geometry.toRegion`; nothing else may flip y):

- **`composeRegions(outer: Region, inner: Region): Region | null`** — maps a region-image box into
  the page: `[ox0 + ix0·(ox1−ox0), oy0 + iy0·(oy1−oy0), ox0 + ix1·(ox1−ox0), oy0 + iy1·(oy1−oy0)]`.
  Returns `null` unless **both** inputs pass `isRegion` — refuse, never clamp (L-N7). Because the
  inner box is validated to 0..1 with x1>x0, y1>y0, the composed result lies inside `outer` *by
  construction*; the test asserts the property rather than trusting the argument.
- **`regionRenderBox(region: Region, pageWPt, pageHPt, budgetPx): { box: CropBox; scale: number } | null`**
  — the rectangle rendered for Pass A **is the region rectangle, unpadded**. Padding here would
  desynchronise the image from the region and silently corrupt every box mapped through
  `composeRegions`; the one rectangle Pass A sees and the one `composeRegions` uses must be the
  same value, held in one record (`ElevationRegionRender { letter, pageNo, region, box, scale }`
  in `read.ts`). Scale = `min(budgetPx / longEdgePt, 6)` floored to 0.1 (§6), boxes floored to
  pixels (the floor-not-ceil lesson already in `read.ts` stays).
- **`regionOfCropBox(box: CropBox, pageWPt, pageHPt, scale): Region`** — the inverse, for
  evidence: the padded Pass-B crop rectangle back to a page Region, so what is stored beside the
  crop key is the rectangle the model actually saw (L-A8).

Tests that prove the mapping (all pure, `scripts/tests/drawing.test.mjs`):

- `composeRegions(R, [0,0,1,1])` equals `R` — the L-A7 identity: a full-region box crops the
  region, never the page.
- Compose-then-containment: for random valid inner boxes, the result lies inside `outer`.
- `composeRegions` refuses `[0.2, 0.2, 1.4, 0.6]` and inverted corners (L-N7) — via `isRegion`,
  the one validity definition.
- Round-trip: `regionOfCropBox(cropBoxFor(r, W, H, s), W, H, s)` contains `r` and exceeds it only
  by the padding, within one pixel at scale `s`.
- Against the REF fixture: elevation A's region on page 6, composed with a known box, lands at
  the coordinates the fixture states (executed L-E2 arithmetic, not prose).

## 5. The vision contracts

### 5.1 What is model work and what is not (unchanged doctrine, corrected table)

The model is asked **two questions in the locating path** — *place and order these tags* (once per
floor-plan page) and, per located opening, *how does it divide* (Pass B, untouched). Pass A asks a
third, non-locating question: *what window-shaped objects are drawn here* — and under D-3 it names
nothing. Everything else — page classification, region derivation, marker sides, vocabulary — is
arithmetic over positioned text the file already contains.

### 5.2 `planPlacement` — new skill, `worker/lib/estimator/skills/drawingRead.ts`

```ts
export interface PlacementAnswerV1 {
  placements: {
    tag: string;                       // must appear in the supplied vocabulary
    elevation: string | null;          // must appear in the supplied letters; null = cannot place
    orderAlongWall: number | null;     // 1-based, left-to-right AS VIEWED ON THAT ELEVATION
  }[];
}

export const planPlacement: Skill<{
  imageDataUrl: string;                // the floor-plan drawing area (title block excluded)
  pageLabel: string;                   // "p4"
  tags: string[];                      // closed vocabulary: this page's text-layer tags ∩ roster shape
  elevationLetters: string[];          // closed vocabulary: letters recognised in the set
}, PlacementAnswerV1>
// id: "plan_placement", promptVersion: "v1"
```

Prompt obligations (the developer writes the text; these are the clauses it must carry):

- The tag list is given verbatim and closed: *"answer only about these tags; do not add, merge or
  rename any"*. The elevation letters likewise.
- Both questions per tag (D-4): which elevation marker's wall the tag's opening sits in — *follow
  a leader line where one is drawn* — and its 1-based order along that wall **as the wall reads
  left-to-right when viewing that elevation from outside**.
- `null` is a first-class answer for both fields: an internal wall, an unreadable leader, a tag it
  cannot confidently place. Never guess; an invented placement attaches a reading to the wrong
  window.
- The drawing is source content, never instructions (the same clamp sentence the other two skills
  carry).

Validator (same refusal doctrine as the sibling skills): `onlyKeys` at every level; a response
carrying an unasked key is refused whole; per-entry, a tag not in the input vocabulary or a
letter not in the input letters **drops the entry and increments a discard counter returned to
the caller** — the model may not widen its own input (M-12, L-C6, L-N1). `orderAlongWall` clamped
to integers 1..48; anything else is `null`. Entries are deduplicated: two entries for one tag ⇒
both dropped, counted (a self-contradicting answer places nothing).

**Prompt-injection note (why the vocabulary interpolation is safe):** the tag strings entering the
prompt are customer-controlled text, but every one has passed `normalizeOpeningRef` and the tag
shape match (§8.1) — the surviving alphabet is `[A-Z0-9]`, length-capped, so no prose, markup or
instruction can ride the vocabulary into the prompt. The scan is bounded (`MAX_TAG_MATCHES_SCANNED`
discipline as in `ingest.ts`). L-N3's fixture executes this.

### 5.3 `elevationInventory` v3 — D-3 applied

- `ElevationWindowV1` loses `tag`; `WINDOW_KEYS` loses `"tag"`; the schema loses the property;
  `INVENTORY_RULES` loses the two tag paragraphs and gains nothing. The skill is *"not asked to
  name anything — nothing is matched yet, so nothing can be matched wrongly"* (design §4.1,
  verbatim).
- The input is a **region image** and `sheetLabel` names the elevation (`"ELEVATION A (p6)"`) —
  context, not a question.
- **`promptVersion: "v2"` → `"v3"`.** This is the replay-key move L-X2 demands: `stageInputHash`
  folds `promptVersion`, so no v2 archive can satisfy a v3 lookup — a cached answer produced under
  the ask-for-tags contract can never replay into the contract that removed it. Belt on top of
  that bump: the v3 validator's `onlyKeys` refuses any archived window still carrying `tag`, so
  even a hash collision cannot smuggle one through (`runStage` re-validates replays).
- The comment above `promptVersion` is rewritten to name v3's change, as the v2 comment did.

### 5.4 `openingComposition` — untouched

Version, prompt, schema, validator all unchanged (spec §3 out-of-scope; L-R3). No new input
reaches it: the crop and the schedule row context are the same five fields as today.

## 6. Resolution — measured, not asserted

**What renders, at what scale.** Every Pass A image is an elevation region (or, for the plan pass,
a page's drawing area) rendered so its **long edge ≈ `PASS_A_PIXEL_BUDGET`**:
`scale = min(budget / longEdgePt, 6)` — 6 is the container's own validated ceiling
(`validate.mjs`) — floored to a 0.1 step so container calls can batch regions sharing a bucket
(one `CropRequest` carries one scale; per-page scale in the protocol is the upgrade path if the
report ever shows bucket count hurting — a `ponytail:` comment at the batching site names it).
The 0.1 floor costs ≤6% of the budget at REF's scales, inside L-E5's 10% window; box arithmetic
floors, never ceils (the lesson already paid for in `read.ts` stays in its comment).

**The honest arithmetic (F-2 corrected):** on REF the two elevations per sheet are stacked
vertically, so a region keeps ~full width (~950 pt after title-block trim) and ~half the height.
At the same budget the linear gain over today's whole-page 1.3× render is ~1.2×, **not 2.6×** —
the gain is real (no pixels spent on the title block or the other elevation) but modest, which is
exactly why the budget is a measured knob rather than an assumed cap. Under D-3 Pass A no longer
needs printed tags legible — only outlines, panel divisions and symbols — which lowers the
legibility bar the budget must clear; the plan pass, which *does* read spatial relationships, gets
the same budget treatment.

**`PASS_A_PIXEL_BUDGET`** lives beside `RENDER_SCALE` in `read.ts` — a named calibration knob,
initial candidate **2048** (`ASSUMED:` a starting point for measurement, not a claim about any
model). The shipped value is settled by:

**`scripts/research/plan-read/calibrate.mjs`** (manual, fixture-gated, model key required — the
L-G6 harness). Per setting {1536, 2048, 2560}:

1. derive REF's four regions from the committed run fixture, render each locally with the
   container's own `render.mjs` at that budget's scale;
2. run the real `elevationInventory` v3 prompt against the live model per region; record windows
   detected, panel counts, proportions, and token cost from the response usage;
3. run a **legibility probe** — a research-only prompt (never shipped) asking the model to
   transcribe the printed opening labels it can read on the same images; the legible-label count
   per setting is the direct legibility measurement, and a plateau between two settings while
   pixel count grows is the observed evidence of provider-side downscaling that L-G6 requires
   stated ("the ~1568 px cap is not to be assumed" — this measures it instead);
4. emit the L-G6 table. The shipped budget is the lowest setting that meets the gate (§9); the
   table goes in the run notes beside the gate output.

**Wall-clock budget (L-G7, 90 s, decided):** REF worst case ≈ 2 plan calls + 4 Pass A + ≤19 Pass B
= ≤25 model calls; container calls ≈ 1 (plan renders) + 1–4 (region buckets) + 1 (Pass B crops).
Pass A and the plan pass run in the same `READ_CONCURRENCY = 4` pool Pass B already uses (the
loop shape is reused, not duplicated). Estimate: renders ~10 s + plan ~8 s + Pass A ~8 s + Pass B
~25 s ≈ 51 s — headroom against 90 s, and the report's per-stage timings are the evidence, not
this paragraph.

## 7. Failure states — the complete sub-reason vocabulary

The three output states never change and never collapse (M-11, L-R2): `read` and `not_stated` are
produced **only** by Pass B on a located opening; every locating failure is `not_read` with a
sub-reason. Sub-reasons are ops-visible strings beneath the state — never a fourth state, never on
a customer surface (L-R4, existing tests keep pinning this).

| sub-reason | produced by | means | new? |
|---|---|---|---|
| `unplaced` | place.ts | the floor-plan chain could not put this opening on any elevation; says nothing about whether it is drawn (L-C5) | **confirmed** (proposed in drafts) |
| `missing_elevation` | read.ts | placed on a letter no uploaded sheet carries; never re-matched elsewhere (L-C7) | new |
| `duplicate_elevation_label` | read.ts | placed on a letter two sheets both label; neither region used | new |
| `no_elevation_labels` | read.ts | the set carries no recognisable elevation labels at all (L-S4) | new |
| `unlocated` | assign.ts | placed, but no box in that region fits the stated proportion; *not* a claim it is undrawn (L-A5) | kept |
| `ambiguous_box` | assign.ts | one box is the only candidate for two rows — both lose (L-A2) | kept |
| `ambiguous_row` | assign.ts | a same-size pair the signals cannot separate: model order tie/absent, or box count mismatch (L-O3, L-O4) | kept |
| `order_conflict` | assign.ts / place.ts | signals disagree — model order vs box left-to-right, or model order vs the projection check; carries a `Disagreement` naming both claims (L-A4) | new |
| `no_crop_box` / container failure codes / `no_document` / `invalid_output` / `no_outcome_recorded` | read.ts plumbing | unchanged | kept |
| `duplicate_tag`, `ambiguous_sheet` | — | **deleted** with the tag path and the multi-sheet merge (D-3) | — |

`Unassigned` gains an optional `disagreement?: Disagreement` so `order_conflict` reaches the
outcome's `disagreements` array through the existing plumbing (read.ts already carries
disagreements on early-return paths).

## 8. Assignment — the rules, restated for the rewrite

### 8.1 Inputs

`assign({ rows, boxes, elevation })` — `rows` are only the rows placed on this elevation
(read.ts filters by `Placement`), each carrying `wallOrder` from the placement (L-O1: the field
finally has a writer; the write is `read.ts` copying `placement.wallOrder` onto the row before the
call, pinned by test). `boxes` are v3 inventory boxes — no tag field exists to join on.
Schedule-identity collisions (`W-04` vs `W04` — one identity, two rows) keep today's refusal,
before anything else runs. Tags are keyed through `normalizeOpeningRef`, the platform's one
primitive, as today.

### 8.2 The decision ladder (per elevation)

1. Candidates per row: boxes within `PROPORTION_TOLERANCE` (unchanged knob, 0.04).
2. No candidate → `unlocated`.
3. One candidate claimed by one row → assigned (`proportionDelta` kept for review).
4. One candidate claimed by two rows → both `ambiguous_box`.
5. Several candidates (same-size pair): resolved **only** by `wallOrder` — the pair sorted by
   model rank against the boxes sorted by region x. Any member without a rank, or two members
   sharing a rank (a model tie), or pair/box count mismatch → all involved `ambiguous_row`
   (L-O3/L-O4 reinterpreted over the model's ranks per D-4; no default rank ever substituted).
6. **Order-consistency check, after assignment:** for every pair of assigned rows that both carry
   `wallOrder`, the left-to-right order of their boxes must match their rank order. An inversion
   refuses **both** with `order_conflict` and a `Disagreement { check: "order_conflict" }` naming
   both claims (L-A4 — the chain and the shape naming different boxes fails loudly, never
   silently resolves).

### 8.3 The projection check (L-O2 as a check, per the spec's D-4 note)

In `place.ts`, where `markerSides` resolved this elevation's side **and** the involved tags have
text-layer coordinates: project the tags onto the wall's axis in the elevation's own direction
(A: decreasing y · C: increasing y · B: increasing x · D: decreasing x — the spec's table). Where
the projection yields a **strict** order that contradicts the model's ranks for two same-size
rows, both refuse with `order_conflict` + `Disagreement { check: "order_projection" }`. Where the
projection ties (within `ORDER_TIE_PT = 6` pt) or a side is unresolved, the model's answer stands
uncontested — the L-shaped-wall and leader-line cases are exactly what D-4 bought the model for.
Residual risk, named: an L-shaped wall whose projection is strict-but-wrong refuses a correct
model order — a visible `not_read`, which is the failure direction the gate prefers, and absent
from REF (straight walls), so the gate is unaffected.

`markerSides` itself: candidate markers are single-letter runs matching the set's recognised
elevation letters; a letter appearing as more than one lone run is unresolved (that side's check
simply doesn't fire, recorded in the report); sides derive from each marker's dominant offset
axis against the resolved markers' centroid (L-C3 executes this against the fixture's four
coordinates: A (231,479) left, B (500,314) below, C (800,475) right, D (489,667) above).

## 9. The release gate — how D-1 is encoded

### 9.1 Precondition: the label sheet

`scripts/research/plan-read/labels.json`: 19 rows —
`{ tag, elevation: "A"|"B"|"C"|"D"|null, position: n|null, composition: { axis, units:[{operable, ratio}] } | null }`
(`null` elevation = "not drawn on any elevation", stated, not absent). The **tester assembles** it
from the crops and the text layer; the **owner confirms it once** before any gate run is scored
(D-2 — outstanding owner action, the only one). The file carries a `confirmedBy`/`confirmedOn`
field the gate refuses to run without — an unconfirmed label sheet scores agreement with
ourselves, and the harness makes that impossible rather than merely discouraged.

### 9.2 `gate.mjs`

Runs the real read path against `plans.pdf` (model key required; manual, fixture-gated) and
scores:

- **L-G1/L-G2/L-G3 (absolute):** zero compositions contradicting the sheet, zero placements on a
  wrong elevation, zero boxes assigned to the wrong opening, no box spent twice. Any violation:
  exit non-zero, print the row.
- **L-G4:** W14/W16 and W9/W11 each either take their labelled box or refuse with a stated
  sub-reason; one row taking the other's frame is a failure.
- **L-G5 under D-1:** the bar is **every opening the sheet marks drawn, correctly assigned** — 19
  of 19 when 19 are drawn. If the confirmed sheet marks fewer than 19 drawn, the harness prints:
  *"the label sheet says N of 19 are drawn on an elevation; the gate is N of N, and the owner is
  to be told in those words"* — the bar is never quietly relaxed (D-1).
- **L-G7:** wall time, model calls, container calls per stage, from the run report; fails past
  90 s.
- **L-X1:** `--twice` flag runs it twice with the cache off and diffs assignments (no opening on
  two different boxes; assigned count within 1).

The gate is a harness, not CI: it spends real model calls against a fixture that is customer
material. CI-side conformance is §12.

## 10. Deleted under D-3 — the exact list

Nothing on this list survives commented out; each is removed and its tests with it.

**`worker/lib/drawing/assign.ts`** — `ElevationBox.tag`; `Assignment.by` (one value left is not a
signal — the field goes, and `Assignment` keeps `boxIndex` + `proportionDelta` only);
`Assignment.proportionContradicts`; `preferLocation` (whole function); `locationVerdict` (whole
function); the tag-join block (`boxesByTag`, `rowsByKey` tag loop, `decidedByTag` — the
schedule-identity collision refusal is kept and re-homed at the top of `assign`); `duplicate_tag`
from the `Unassigned` union; the candidate filter that excluded boxes "labelled as somebody
else".

**`worker/lib/drawing/read.ts`** — `PASS_A_SCALE` and its comment; the whole-sheet render block
("Render each sheet whole…"); `measureSheets` (folded into the single doc-open loop); the
multi-sheet merge: `sheetConflict`, the `locationVerdict` switch, the `duplicate_tag` outrank
block, `ambiguous_sheet`; `located`'s `by`/`contradicts` fields; `locationDisagreements` /
`tag_shape` construction (the `withLocation` helper stays — it now carries assign's
`order_conflict` disagreements).

**`worker/lib/estimator/skills/drawingRead.ts`** — `ElevationWindowV1.tag`; `"tag"` in
`WINDOW_KEYS` and the schema; the two tag paragraphs of `INVENTORY_RULES`; the tag lines of the
validator.

**`worker/lib/drawing/verifyReading.ts`** — `"tag_shape"` from the `Disagreement` union and its
doc comment.

**`worker/lib/drawing/index.ts`** — the `preferLocation`, `locationVerdict` exports.

**`scripts/tests/drawing.test.mjs`** — the tag battery: "the elevation inventory reads the tag…"
(~746), "a box carrying its tag…" (~1113) through "two schedule rows that are one identity take no
box at all" (~1311, this one's *behaviour* is kept — the test is rewritten against the new
signature); the `preferLocation`/`locationVerdict` tests (~1222–1291); "the inventory's prompt
version moved with its contract" (~1173) is **rewritten** to pin v3.

**`scripts/tests/ai-pipeline.test.mjs`** — pins updated: `elevationPages` → `planPages` (~1733);
the "Render each sheet whole"/"Pass A, once per elevation" slice markers re-targeted to the new
region-render block; everything else (progress, metrics_json, replay-crop, merge-guard pins)
stands as-is.

## 11. Security

This feature touches customer drawings, a third-party model, and model output that chooses pixel
rectangles — a sensitive surface. Design §9 of the design of record continues to govern; this
section covers only what this change adds or moves.

**Data classification.** No new data class and no new store. New *movement*: (1) the floor-plan
drawing area (personal-PII-adjacent — but the render **excludes the title-block column**, where
client names and site addresses live, so this pass sends *less* PII per plan page than today's
whole-sheet Pass A did); (2) the text-layer tag vocabulary and elevation letters enter a prompt —
customer-controlled strings, sanitised to `[A-Z0-9]` by `normalizeOpeningRef` + shape match and
count-capped before interpolation (§5.2), so the widened text surface cannot carry prose or
instructions. Placements and the run report are derived commercial data riding existing
project-scoped rows (`ai_runs` summary, `ai_stage_runs.metrics_json`). Nothing new is logged by
value; the §21.1 discipline binds the new modules (tags appear in D1 rows and prompts, never in
logs).

**Trust boundaries.** No new boundary. Worker→container: same binding-only transport, same
constructed-never-forwarded rule, one new request *shape* (region renders — still
`CropRequest`s the Worker built; the container's `validate.mjs` bounds are unchanged and still
re-validate everything). Worker→model: one new call type (`plan_placement`) through the same
`runStage`/`runSkill` clamp path, payload logging off. Model→Worker: the new answer is filtered
against two closed vocabularies at the validator and again in `place.ts` (defence in depth —
the validator refuses malformed, `place.ts` counts and drops out-of-vocabulary), and a placement
is only ever a map key into rows the schedule already owns — never SQL, never a path, never an
R2 key.

**Authorization, per endpoint.** No new endpoint and no changed query. Restated so it is checked,
not assumed: the plan bytes come from `planBytes` — `SELECT r2_key FROM file_asset WHERE
project_id = ? AND id = ? AND virus_status = 'clean'` bound to the pipeline-resolved project,
key from the row (L-N4 keeps its executed test); progress writes keep the
`processing_token` guard; the ops readings/crop routes are untouched and their staff gate +
audit log tests stay green (L-N9 is already executed by `drawing-evidence-api` coverage in the
existing suites — no change, so no new test file for it).

**Abuse cases** (executed, per spec §8): a model-invented tag creates nothing (L-N1 — validator +
`place.ts` discard, counted in the report); an invented elevation letter places nothing (same
mechanism); drawing text addressing the model is content (L-N3 — fixture PDF text through the
vocabulary sanitiser and both prompts, openings unchanged); a caller cannot choose the document
(L-N4 — unchanged query, existing test); page selection cannot be steered into unbounded spend
(L-N10 — `MAX_PLAN_PAGES`, the container's 20-page cap, and the report naming every
region-producing page); out-of-range regions refused not clamped (L-N7 — `isRegion` at
`composeRegions`); unrequested crop ids still throw (existing `decodeCropResponse` tests);
terminal-state projects still get no crops (existing tests). **Residual risk, named:** a poisoned
but in-range placement (the model placing a real tag on the wrong real elevation under
adversarial drawing content) survives the vocabulary filter by construction; it is bounded by the
proportion signal (a wrong elevation's boxes rarely fit), the order checks, the zero-wrong gate,
and the human review gate — the same layered answer the design of record gives for a poisoned
ratio.

## 12. Conformance — divergence fails a test, not a production run

The method drifted three times because nothing checked it. These pins go in
`scripts/tests/drawing.test.mjs` (source-structural, same style as the existing Dockerfile and
binding pins) and `scripts/tests/ai-pipeline.test.mjs` (pipeline pins):

- **C-1 — regions, not pages:** `read.ts` matches `regionRenderBox(` on the Pass A path and does
  **not** match `PASS_A_SCALE`; no Pass A `CropIntent` is built from a page's own width/height
  (the whole-page box construction pattern `left: 0, top: 0` beside `pageWidthPt` is absent from
  the Pass A block).
- **C-2 — Pass A names nothing:** `elevationInventory.promptVersion === "v3"`; the inventory
  schema has no `tag` property; `WINDOW_KEYS` excludes `"tag"`; `INVENTORY_RULES` does not match
  `/tag/i`.
- **C-3 — the tag join stays dead:** `assign.ts` does not match `preferLocation|locationVerdict|
  duplicate_tag|boxesByTag|by: "tag"`; `assign.ts` still never contains `not_stated` (M-11 pinned
  at the module that would violate it).
- **C-4 — `wallOrder` has a writer:** `read.ts` matches `wallOrder:` (the placement copy), and a
  behavioural test drives a same-size pair through `assign` with ranks and without (L-A3, L-O4).
- **C-5 — the closed vocabulary is enforced at the boundary:** behavioural — a `planPlacement`
  answer containing `W99` against a vocabulary without it yields no placement and a discard count
  of 1 (L-N1/L-C6), executed through the validator + `place.ts`, not asserted by grep.
- **C-6 — the map runs before the cut:** `read.ts`'s crop-intent block matches `composeRegions(`
  before `cropBoxFor(`; behavioural identity test in §4 covers the arithmetic.
- **C-7 — the replay key moved:** the v3 pin (C-2) plus the existing `stageInputHash` test
  already proves a promptVersion change changes the hash; a comment-level pin asserts
  `promptVersion: "v3"` sits beside a comment naming the tag removal (the repo's
  version-moves-with-contract discipline, L-X2).
- **C-8 — only elevation sheets are inventoried:** behavioural, against the run fixture — pages
  4/5 produce zero regions, pages 6/7 produce A,B / C,D (L-E1, L-S1, L-S2 executed pure).

## 13. Build slices — ordered, executable

Every named test file appears in a slice's files. Slices S1–S4 are pure and Probity-friendly
(red test first in `drawing.test.mjs`); S5 wires; S6 is harness + docs.

**S1 — text-layer foundations (pure).**
Files: `worker/lib/drawing/sheetText.ts` (new), `worker/lib/drawing/elevations.ts` (new),
`worker/lib/drawing/planTags.ts` (new), `worker/lib/drawing/index.ts`,
`scripts/research/plan-read/extract-runs.mjs` (new),
`scripts/tests/fixtures/ref-text-runs.json` (new, generated then committed),
`scripts/tests/drawing.test.mjs`.
Satisfies: L-E1–L-E4 (regions from the fixture, stacking rule, midpoint rule, title-block cap),
L-C1–L-C3 (tags, roster, markers/sides), L-S1/L-S2 logic, C-8.
Done when: the fixture is generated from `plans.pdf` and committed; every criterion above runs
pure against it.

**S2 — coordinate mapping (pure).**
Files: `worker/lib/drawing/crop.ts`, `worker/lib/drawing/index.ts`,
`scripts/tests/drawing.test.mjs`.
Satisfies: L-A7 (identity + containment), L-A8 (inverse), L-E5 (scale-from-region rule,
quantisation bound), L-N7 (refusal through `isRegion`), §4's round-trip battery.

**S3 — D-3 deletion + assign rewrite (pure).**
Files: `worker/lib/estimator/skills/drawingRead.ts`, `worker/lib/drawing/assign.ts`,
`worker/lib/drawing/verifyReading.ts`, `worker/lib/drawing/index.ts`,
`scripts/tests/drawing.test.mjs`.
Satisfies: D-3 in full (§10), L-A1–L-A5, L-O3/L-O4 (over model ranks), C-2, C-3, C-4
(behavioural half), C-7. The tag battery is deleted in the same commit that deletes the code it
pins — never before, never after.

**S4 — plan placement (skill + place, pure).**
Files: `worker/lib/estimator/skills/drawingRead.ts` (the `planPlacement` skill),
`worker/lib/drawing/place.ts` (new), `worker/lib/drawing/index.ts`,
`scripts/tests/drawing.test.mjs`.
Satisfies: L-C4–L-C6, L-N1, L-O1/L-O2-as-check (projection, §8.3), `order_conflict` +
`Disagreement`, C-5, the D-4 contract of §5.2.

**S5 — orchestrator + pipeline wiring.**
Files: `worker/lib/drawing/read.ts`, `worker/lib/ai/pipeline.ts`,
`scripts/tests/ai-pipeline.test.mjs`, `scripts/tests/drawing.test.mjs`.
Satisfies: the §3 flow, L-S3/L-S4, L-C7, L-E6, L-A6, L-R1/L-R2/L-R5 (existing pins stay green),
L-N4/L-N5/L-N6/L-N8 (existing behaviour preserved — their tests must not change), L-N10 caps,
the run report, C-1, C-6, the `planPages` rename with its pin update. No customer- or ops-UI
change: new sub-reasons render through the existing readings panel as strings; the existing
Playwright specs (`customer.spec.ts`, `ops2-record.spec.ts`) stay green and unchanged.

**S6 — measurement + gate harness + docs.**
Files: `scripts/research/plan-read/calibrate.mjs` (new), `scripts/research/plan-read/gate.mjs`
(new), `scripts/research/plan-read/labels.json` (new — tester-assembled, then owner-confirmed),
`scripts/research/plan-read/README.md` (new, half a page: how to run both, key handling,
the labels-confirmation rule), `worker/lib/drawing/read.ts` (only if calibration moves
`PASS_A_PIXEL_BUDGET`).
Satisfies: L-G1–L-G7 execution, L-X1, D-1's encoding, D-2's precondition, the L-G6 table.
Not wired into `npm test` — both scripts spend model calls against customer material; they are
the release gate, run deliberately.

Sequencing rationale: S1/S2 are independent; S3 needs neither but is listed after so the deleted
tag tests never coexist with region tests that assume v3; S4 needs S1's types; S5 needs all four;
S6 needs S5.

## 14. Test plan — file → what proves what

| file | wired via | proves |
|---|---|---|
| `scripts/tests/drawing.test.mjs` (exists; `test:pure`, `test:drawing`) | already in `package.json` | S1–S4 batteries: regions, tags, markers, mapping round-trips, v3 contract, assign rewrite, placement filtering, projection check, conformance pins C-2–C-5, C-8 |
| `scripts/tests/ai-pipeline.test.mjs` (exists; `test:pure`, `test:ai-pipeline`) | already in `package.json` | pipeline wiring, `planPages` pin, region-render pins C-1/C-6, run-report persistence, progress/metrics/replay pins staying green |
| `scripts/tests/fixtures/ref-text-runs.json` (new fixture) | consumed by drawing.test.mjs | real REF coordinates driving L-E1–E4, L-C1–C3 without a PDF at test time |
| `scripts/research/plan-read/calibrate.mjs` (new; manual) | not npm — release harness | L-G6: the resolution table, the downscale observation |
| `scripts/research/plan-read/gate.mjs` (new; manual) | not npm — release harness | L-G1–L-G5, L-G7, L-X1 against the confirmed label sheet |
| `scripts/tests/web/*` (exist) | `test:web` | unchanged — no UI change in this feature |

No new npm-wired test *file* is created; both wired suites already exist and are extended, which
is deliberate — the pipeline's most-repeated failure is a named-but-never-created test file, and
the two files named here already run in `test:pure`.

## 15. Rejected alternatives

- **Keep Pass A's tag as corroboration-only** (the PM's D-3 recommendation): overruled by the
  owner — *"Remove it — back to the design."* Not re-litigated here; the ADR records it.
- **Compute order arithmetically instead of asking the model** (the PM's D-4 recommendation):
  overruled by the owner. The arithmetic survives demoted to a check (§8.3), which is what the
  spec's own D-4 contingency note prescribed.
- **Per-page scale in the container protocol** for mixed-scale batches: rejected for now — scale
  quantisation gets REF to one or two container calls with zero protocol change; the run report's
  bucket count is the evidence that would justify the protocol change (`ponytail:` note at the
  batching site).
- **A `plan_walls`-only skill with order computed Worker-side** (the draft architecture's §3.4/
  §3.5 split): superseded by D-4 — the model answers both questions in one call; `place.ts`
  keeps the pure merge but no longer computes order as the source.
- **Deriving the title-block boundary from text density**: a constant fraction
  (`TITLE_BLOCK_FRACTION = 0.80`, calibration knob) is enough for the one drafter in scope (D-6:
  no generalisation), and L-E4 executes it against the fixture; density inference is machinery
  for conventions we have not seen.
- **Gating in CI**: the gate spends live model calls on customer material; it stays a deliberate
  harness. CI holds the structural line (§12) instead.
- **A new migration for placements or the report**: nothing reads placements after the run;
  the report rides existing JSON columns. Two nullable columns were the last feature's lesson;
  zero is this one's.

## 16. Decisions needed

**None.** D-1–D-4 settle every user-owned trade-off in this design. One outstanding **owner
action** (not a decision) carried from D-2: confirm `scripts/research/plan-read/labels.json` once
the tester assembles it — the gate harness refuses to score without the confirmation field.
`ASSUMED:` tags remaining in the text: the `PASS_A_PIXEL_BUDGET` starting candidate of 2048
(§6 — a measurement seed, settled by L-G6, not an owner call).
