# Face-Mapped Plan Parsing Engine — Implementation Handover

> **For agentic workers:** implement this plan test-first, one task at a time. Use `superpowers:test-driven-development` for each task and `superpowers:verification-before-completion` before any commit, merge, or deployment.

**Goal:** Add a separately selectable drawing-enrichment engine that maps the schedule roster to floor-plan faces, reconciles those placements with complete elevation-frame inventories, creates scale-aware 300-DPI crops, and reads compositions in parallel without changing the existing parsers.

**Architecture:** Phases A and B remain the existing document inventory and schedule extraction. The new `face_mapped` engine owns Phases C–E in a focused module bundle: plan placement, elevation-frame inventory, deterministic matching and cropping, then bounded parallel AI composition reads. Existing inspection, rendering, normalization, storage, reporting, replay, and pool primitives are reused; the current full-document agent loop is not copied.

**Tech stack:** TypeScript, Cloudflare Workers, Workers AI through the existing stage runner, the plan-parse container, D1/R2, and the repository's Node test harness.

**Baseline:** `apertly/main` at `4374270e` when this handover was written.

## 1. Owner intent

The target process is:

1. **Phase A — document facts:** inspect the PDF and extract page geometry, headings, sheet references, page roles, storeys, elevation names, drawing regions, north evidence, and view-specific scales.
2. **Phase B — schedule facts:** produce the complete opening roster with ID, width, height, schedule type, and schedule comment.
3. **Phase C — plan placement:** render/read floor plans and establish each opening's storey, elevation face, order on that face, and relative position along the wall.
4. **Phase D — elevation location and crop:** inventory complete outer frames on each elevation/storey, reconcile them with Phase C, and create one scale-aware 300-DPI crop per opening. The crop spans the relevant storey vertically and the complete matched opening horizontally, with a bounded margin.
5. **Phase E — composition:** use vision to read the drawing's unit operations, outside-view order, split axis, and approximate ratios. Phase E must run independent batches concurrently.

Deterministic processing is preferred where it is reliable. AI is used where interpretation is genuinely visual or ambiguous. A parser may fail to read an obscured opening, but it must not silently accept a crop that does not contain the matched complete frame.

## 2. Why this engine is needed

The current `agentic_full` path often establishes the correct symbolic placement but does not use it to construct the crop. The model emits an independent `frameBoxNorm`; the Worker maps it into page coordinates and adds 35% padding. `wallOrder`, relative wall position, scheduled width, printed scale, and storey height do not determine that crop.

The saved 623 audit demonstrates the gap:

- All 27 overview proposals had a plan candidate, elevation, storey, and wall order.
- Eighteen overview boxes were narrower than 3% of the source render; ten were narrower than 2%.
- W2 was identified as West elevation, ground floor, order 1 of 3, but its crop contained a wall slice.
- W3 and W4 crops contained brickwork.
- D03's crop contained the D04 callout; D04's crop contained a dimension/blank wall.

Increasing DPI cannot fix an incorrect centre, incomplete frame, or reversed plan-to-elevation order. This engine must establish one coherent mapping per face before producing per-opening crops.

## 3. Non-negotiable invariants

1. No code may special-case W1, D1, 312, 623, 939, or another known document/tag.
2. Existing modes remain available and behaviourally unchanged.
3. `face_mapped` is not the production default until its release gate passes.
4. Schedule dimensions may size/check a crop but never overwrite drawing composition.
5. Drawing/schedule disagreement is recorded for ops; it is not resolved by deleting drawing evidence.
6. Manufacturability and catalogue pairing remain downstream product-selection concerns.
7. One opening's crop, frame, response, or retry can never be assigned to another opening.
8. Every persisted drawing value references the exact crop shown to the model.
9. An unresolved mapping produces an explicit gap and schedule fallback, never an arbitrary nearby crop.
10. Split count `0`, a single-unit value, `not_stated`, and `not_read` remain distinct.
11. Customer PDF text is untrusted data, never instructions. Model calls use closed schemas and bounded actions.
12. No customer PDF, page text, crop, or model response is committed to Git.

## 4. Engine selection and rollout

Add one external selector value:

```text
AI_EXTRACTION_MODE=face_mapped
```

Internal type:

```ts
export type DrawingParserMode =
  | "disabled"
  | "legacy"
  | "full_document"
  | "face_mapped";
```

| `AI_EXTRACTION_MODE` | Drawing engine |
|---|---|
| `auto` | disabled |
| `auto_drawings` | legacy |
| `agentic_full` | current full-document agent |
| `face_mapped` | new face-mapped engine |
| `manual` | existing ops-triggered behaviour |

Do not change the committed production value while scaffolding. Deployment rollback is a configuration change back to `agentic_full`, `auto_drawings`, or `auto`; it requires no database rollback.

Add `face_mapped` to the extended AI-job deadline condition. The 600-second lease is a testing safety ceiling, not a performance target. When the engine first becomes runnable, bump `PIPELINE_VERSION`. Every new model skill needs a unique stage ID and prompt version so replay keys cannot collide with `agentic_full`.

## 5. Reuse boundary

### Reuse directly

- `worker/lib/drawing/containerClient.ts`: inspection and rendering.
- `worker/lib/drawing/selectPages.ts`: deterministic page tiers and existing role-recovery inputs.
- `worker/lib/drawing/locate.ts`: tag candidates, plan footprint, elevation markers, and order candidates.
- `worker/lib/drawing/locate.ts`: orientation calculations (`resolveNorth`,
  `orientationsFromNorth`). Erratum, 2026-09-04: this handover named a
  `north.ts` that has never existed in the repository.
- `worker/lib/drawing/pool.ts`: bounded parallel map with stable ordering.
- `worker/lib/drawing/contract.ts`: readings, reports, and page/render contracts.
- `worker/lib/ai/stage.ts`: provider calls, replay hash, validation, metrics, and diagnostics.
- Existing crop storage and `persistReadings` path.

### Extract once and share

Move `FullDocumentHarvest`, `buildFullDocumentHarvest`, and visual-north application from `fullDocumentAgent.ts` into `worker/lib/drawing/harvest.ts`. Preserve exports and byte-compatible output so `agentic_full` only changes its import.

The shared harvest module exposes view-scale extraction. The model-facing
`FullDocumentHarvest` contract remains byte-compatible; `face_mapped` obtains
scale candidates separately, by calling `viewScaleCandidates(inspected)` from
`harvest.ts`. Adding a field to `FullDocumentHarvest` itself would change
agentic_full's prompt payload and its stage input hash, so any future addition
to that contract requires an explicit prompt and pipeline version change.
(Owner ruling, 2026-09-04: a conformant clarification, not a divergence.)

The extraction returns:

```ts
export interface DrawingScaleCandidate {
  pageNo: number;
  ratio: number;
  text: string;
  evidenceBoxPt: CropBoxPt;
  source: "printed" | "inferred";
}
```

**Scale is a property of the page, not of a view** (owner ruling, 2026-09-04,
on the evidence of a real 15-page set). Every sheet this product cares about —
floor plans and elevations — prints one scale, in its title block, and the
views on it share it. Ratios belonging to driveways, ramps, stairs and other
details are not drawing scales and are ignored; detail sheets are not pages of
interest, so nothing asks them for a scale. This supersedes §7.4's per-view
association: a page's scale is the ratio its surviving candidates agree on, and
disagreement is a conflict recorded for ops, never a guess. Per-view binding
and its title-region machinery are removed rather than carried unused; git
holds them if a future set proves they are needed.

### Do not reuse or copy

- `runFullDocumentAgent` orchestration or working-memory loop.
- Its per-opening overview `frameBoxNorm` crop source.
- Inline verification and readings assembly.
- A single prompt that mixes page recovery, identity, frame location, composition, and correction.

## 6. New module bundle

```text
worker/lib/drawing/faceMapped/
├── contract.ts
├── planFaces.ts
├── elevationFrames.ts
├── matchFrames.ts
├── crops.ts
├── compositions.ts
├── report.ts
└── run.ts
```

| File | Responsibility | Review target |
|---|---|---:|
| `contract.ts` | Internal phase types and states | ≤250 lines |
| `planFaces.ts` | Phase C placement and bounded visual recovery | ≤300 lines |
| `elevationFrames.ts` | Face/storey render tasks and complete-frame inventory | ≤300 lines |
| `matchFrames.ts` | Plan-to-elevation reconciliation | ≤300 lines |
| `crops.ts` | Scale resolution and crop construction | ≤220 lines |
| `compositions.ts` | Bounded parallel Phase E | ≤300 lines |
| `report.ts` | Existing reading/report/progress conversion | ≤250 lines |
| `run.ts` | Orchestration only | ≤200 lines |

These are review limits, not reasons to create pass-through wrappers. If a file exceeds its target, first delete duplication or move an existing cohesive concern.

## 7. Phase contracts

### 7.1 Phase C — plan placement

```ts
export interface PlanOpeningPlacement {
  tag: string;
  planPageNo: number;
  storey: "ground" | "first" | string;
  elevation: string;
  planCandidateId: string;
  planEvidenceBoxPt: CropBoxPt;
  wallOrder: number;
  faceOpeningCount: number;
  alongWallFraction: number | null;
  distanceFromStartPt: number | null;
  confidence: "verified" | "ambiguous";
  basis: string[];
}

export type PlanPlacementOutcome =
  | { state: "resolved"; placement: PlanOpeningPlacement }
  | { state: "unresolved"; tag: string; reason: string };
```

`alongWallFraction` is normalized from 0 to 1 in plan-side order. `wallOrder` is before elevation mirroring. Face/storey grouping is derived from each document, never a fixed elevation vocabulary.

Accept deterministic placement when there is one retained plan candidate, an unambiguous face marker, a known storey, and unique order. Send only missing or ambiguous records to one closed-schema visual recovery call per plan page. AI corrections must identify exact plan evidence.

### 7.2 Phase D — elevation inventory

```ts
export interface ElevationFaceTask {
  faceKey: string;
  pageNo: number;
  elevation: string;
  storey: string;
  expectedOpeningCount: number;
  scheduledWidthsMm: number[];
  overviewRenderId: string;
  overviewBoxPt: CropBoxPt;
  scaleCandidates: DrawingScaleCandidate[];
}

export interface ElevationFrame {
  frameId: string;
  faceKey: string;
  pageNo: number;
  elevation: string;
  storey: string;
  orderLeftToRight: number;
  outerFrameBoxPt: CropBoxPt;
  storeyBandPt: CropBoxPt;
  confidence: "verified" | "ambiguous";
  basis: string[];
}

export type ElevationInventoryOutcome =
  | { state: "resolved"; task: ElevationFaceTask; frames: ElevationFrame[] }
  | { state: "unresolved"; task: ElevationFaceTask; reason: string };
```

The model returns every complete outer frame in left-to-right image order. It does not assign schedule tags or choose products. Validation rejects boxes outside the render/storey band, zero-area boxes, duplicates, repeated order values, and a `resolved` inventory containing ambiguous frames. A count disagreement remains a conflict; no frame is invented or discarded.

### 7.3 Phase D — matching

```ts
export interface MatchedOpeningFrame {
  tag: string;
  placement: PlanOpeningPlacement;
  frame: ElevationFrame;
  direction: "with_plan" | "against_plan";
  expectedWidthPt: number | null;
  widthAgreement: "within_tolerance" | "conflict" | "unknown";
  confidence: "verified" | "ambiguous";
  warnings: string[];
}

export type FrameMatchOutcome =
  | { state: "resolved"; match: MatchedOpeningFrame }
  | { state: "unresolved"; tag: string; reason: string };
```

For each face/storey:

1. Sort placements by `wallOrder` and frames by `orderLeftToRight`.
2. Score both `with_plan` and `against_plan` mappings.
3. Compare count, relative wall position, visible tag evidence, relative scheduled widths, and scale-derived widths.
4. Accept only one uniquely best mapping within declared tolerances.
5. If neither is defensible, run one face-level reconciliation with the plan region and elevation overview together.
6. If still ambiguous, leave the face unresolved.

Score components are named diagnostics, not an opaque weighted model. Equal candidates are ambiguity, not permission to choose the first.

### 7.4 Page scale

**The page's scale is the ratio printed in the sheet footer** (owner ruling,
2026-09-04: every set to hand states it there once, whether as a line or as a
cell in a title column). Recognize `SCALE 1:100`, `Scale 1 : 100`, `1:100` and
`1 / 100`, in one word or split across several. A ratio printed anywhere else
on the sheet belongs to something the drawing measures — a ramp, a fall, a
stair, a detail's own label — and is not read.

That is the whole rule, and it is deliberately not a list of note subjects: a
blacklist of words a drafter might use can never be finished, and three review
rounds spent proving it. Where footer ratios agree the page carries that scale;
where they disagree the page carries none and the conflict is recorded for ops;
where the footer prints none the page carries none, and §14's frame-width
calibration is the fallback.

```ts
export function expectedWidthPt(widthMm: number, scaleRatio: number): number {
  return widthMm / (scaleRatio * 25.4 / 72);
}
```

- 3000 mm at 1:100 ≈ 85.04 pt.
- 900 mm at 1:100 ≈ 25.51 pt.

If several matched frames disagree consistently with the printed scale by the same factor, record the conflict and derive one effective scale from their median ratio. One opening cannot recalibrate a view. Conflicting candidates leave `expectedWidthPt` null and trigger a wider evidence crop.

### 7.5 Phase D — crop

```ts
export interface OpeningCropTask {
  tag: string;
  frameId: string;
  pageNo: number;
  bboxPt: CropBoxPt;
  dpi: 300;
  threshold: null;
  faceKey: string;
  sourceFileId: string;
}
```

Crop rules:

1. Start with the complete `outerFrameBoxPt` horizontally.
2. If trustworthy scale width is wider by more than tolerance, expand symmetrically around the frame centre and warn; never shrink a complete frame.
3. Add 15% horizontal margin, at least 8 PDF points and at most 25% of opening width.
4. Use the full `storeyBandPt` vertically plus 5% margin, clamped to page bounds.
5. Reject a crop excluding a frame edge, leaving the page, or containing a neighbouring frame centre.
6. Render at 300 DPI without thresholding first. Thresholding is retry-only because faint operation marks can disappear.

### 7.6 Phase E — composition

```ts
export interface CompositionTask {
  tag: string;
  frameId: string;
  cropRenderId: string;
  imageDataUrl: string;
}

export interface CompositionValue {
  tag: string;
  frameId: string;
  cropRenderId: string;
  operations: OpeningOperation[];
  unitRatios: number[];
  divisionAxis: SplitAxis;
  confidence: "high" | "low";
  flags: DrawingFlag[];
  basis: string[];
}

export type CompositionOutcome =
  | { state: "value"; value: CompositionValue }
  | { state: "not_stated"; tag: string; cropRenderId: string; reason: string }
  | { state: "not_read"; tag: string; cropRenderId: string | null; reason: string };
```

Phase E receives tag and crop identity but not schedule type as a visual answer. Compare schedule only after reading to produce `scheduleDrawingMismatch`. Return what is drawn, even when Sanity cannot offer it.

Parallel contract:

- batch size 4;
- maximum 4 concurrent batches;
- stable result order;
- one response schema per batch;
- one corrective retry per invalid batch, bounded by the run call ceiling;
- failed batches do not discard successful siblings;
- each record must match the exact `(tag, frameId, cropRenderId)` tuple;
- no sibling composition inference;
- release base64 after each batch settles.

Nineteen openings normally form five batches in two waves; 27 form seven batches in two waves.

## 8. Orchestrator

```ts
export interface FaceMappedDeps {
  render(request: RenderRequest): Promise<RenderResponse>;
  storeCrop(id: string, pngB64: string): Promise<string | null>;
  readPlanPage(input: PlanPageRecoveryInput): Promise<PlanPageRecoveryResult>;
  inventoryElevation(input: ElevationFaceInput): Promise<ElevationFaceResult>;
  reconcileFace(input: FaceReconciliationInput): Promise<FaceReconciliationResult>;
  readComposition(input: CompositionBatchInput): Promise<CompositionBatchResult>;
  onProgress?(event: FaceMappedProgress): Promise<void>;
}

export async function runFaceMappedParser(args: {
  fileId: string;
  sourceFileId: string;
  scheduleRows: EnrichScheduleRow[];
  inspected: InspectResponse;
  harvest: FullDocumentHarvest;
  deps: FaceMappedDeps;
}): Promise<{ readings: DrawingReading[]; report: DrawingFileReport }>;
```

`run.ts` contains phase calls, bounded concurrency, early exits, and report assembly only.

## 9. Progress

Progress is append-only at meaningful milestones:

```ts
export type FaceMappedProgress =
  | { phase: "plan_faces"; message: string; done: number; total: number }
  | { phase: "elevation_frames"; message: string; done: number; total: number }
  | { phase: "opening_crops"; message: string; done: number; total: number }
  | { phase: "composition_reads"; message: string; done: number; total: number }
  | { phase: "drawing_complete"; message: string; done: number; total: number };
```

Expected sequence:

1. `Extracting the schedule · 27 openings found`
2. `Mapping floor plans · ground floor found`
3. `Mapping floor plans · 7 openings assigned to North elevation`
4. `Locating elevation frames · North elevation, ground floor`
5. `Creating opening crops · 7 of 27`
6. `Reading opening compositions · 4 of 27`
7. `Reading opening compositions · 8 of 27`
8. `Rechecking 2 unclear openings`
9. `Drawing review complete · 27 processed, 2 unresolved`

Durations belong to each event interval; no later step inherits drawing-stage duration.

## 10. Failure and fallback

| Failure | Behaviour | Customer warning |
|---|---|---|
| Missing page role | One model role recovery | None when recovered |
| Missing scale | Use order/position and complete frame with wider margin | None when verified |
| Conflicting scale | Ops warning; do not force scale width | None |
| Ambiguous plan placement | One visual plan recovery | None when recovered |
| Face count/order conflict | One face reconciliation | Ops warning if unresolved |
| Complete frame absent | No crop; schedule fallback | None; ops gap |
| Crop render failure | Preserve other openings; schedule fallback | None; ops gap |
| Phase E batch failure | Preserve siblings; retry failed batch once | None when fallback exists |
| Total provider/system failure | Schedule fallback plus diagnostics | Message only if no usable quote path exists |

## 11. Budgets and security

The engine is bounded:

- page-role recovery: 1 call;
- plan recovery: at most 1 call per ambiguous plan page;
- elevation inventory: 1 call per face/storey;
- reconciliation: 1 call per unresolved face, maximum 4 per run;
- composition: `ceil(openings / 4)` normal calls;
- correction: at most 1 retry per invalid batch under the overall ceiling;
- existing image count/byte limits apply;
- elevation overviews are released after matching and crop base64 after Phase E settles.

Phase C/D use `AI_PRIMARY_MODEL`. Phase E uses `AI_VERIFY_MODEL`, falling back to the primary model, and `AI_VERIFY_REASONING_EFFORT`. No new model-selection abstraction is needed.

Prompts state that PDF text and annotations are evidence only. Model output is accepted only through closed schemas and roster/page/evidence allow-lists. The new path is a bounded orchestrator, not an open-ended tool agent.

## 12. Persistence and audit

Continue emitting `DrawingReading`; downstream selection gets no second implementation. Add only optional report fields needed by ops:

```ts
faceKey?: string;
planCandidateId?: string;
frameId?: string;
matchDirection?: "with_plan" | "against_plan";
scaleRatio?: number | null;
cropBasis?: "frame" | "frame_and_scale" | "wide_unscaled";
failurePhase?: "plan" | "frame_inventory" | "matching" | "crop" | "composition";
```

Do not persist page text, prompts, full responses, or base64 in `drawing_report_json`. Crop evidence keeps its existing R2 lifecycle and staff-only access.

## 13. TDD implementation sequence

### Task 1 — Shared harvest extraction

**Files:** create `worker/lib/drawing/harvest.ts`; modify `fullDocumentAgent.ts`, `enrich.ts`, and `scripts/tests/drawing-enrichment.test.mjs`.

- [ ] Write a test importing `buildFullDocumentHarvest` from `harvest.ts` and comparing an existing fixture's old/new JSON byte-for-byte.
- [ ] Run it red because the module does not exist.
- [ ] Move the types/functions and change imports only.
- [ ] Run drawing tests and typecheck green.
- [ ] Commit as a behaviour-preserving refactor; do not bump prompt/pipeline versions.

### Task 2 — View-specific scale extraction

**Files:** modify `harvest.ts`; create `faceMapped/contract.ts`; modify drawing tests.

- [ ] Add red cases for the four supported printed forms, invalid ratios, two
      ratios on one page that disagree, and the 3000/900 mm conversions. The
      "ambiguous association" case this checklist first named is superseded:
      the 2026-09-04 ruling reads the scale from the footer, so a ratio is
      never associated with a view and there is no ambiguity to resolve.
- [ ] Implement scale candidates and pure `expectedWidthPt`.
- [ ] Verify `FullDocumentHarvest` JSON is byte-for-byte unchanged (golden
      fixture captured from the pre-move implementation), and that
      `viewScaleCandidates()` is tested independently of it.
- [ ] Commit.

### Task 3 — Phase C placements

**Files:** create `faceMapped/planFaces.ts`; modify contract and tests.

- [ ] Add red cases for unique placement, arbitrary elevation names, legend duplicates, plan-order normalization, duplicate tags, and unresolved roster retention.
- [ ] Reuse `openingTagWords` and `locateFloorplanPage`; add normalized relative position only.
- [ ] Run focused tests green and commit.

### Task 4 — Visual plan recovery

**Files:** modify `planFaces.ts` and contract/tests; create `planFacesSkill.ts` only if the module exceeds its review target.

- [ ] Add red cases proving only ambiguous tags are sent, unknown tags are refused, evidence binds to the retained candidate, and invalid output leaves deterministic siblings untouched.
- [ ] Implement one closed-schema call per ambiguous plan page.
- [ ] Verify and commit.

### Task 5 — Complete-frame inventory

**Files:** create `faceMapped/elevationFrames.ts`; modify contract/tests.

- [ ] Add red cases for one task per face/storey, ordered non-overlapping frames, invalid boxes/orders, count conflict, and refusal of schedule tags/product families.
- [ ] Implement one structured vision inventory call per face/storey.
- [ ] Verify and commit.

### Task 6 — Deterministic matching

**Files:** create `faceMapped/matchFrames.ts`; modify contract/tests.

- [ ] Add red cases for forward/reversed order, unequal gaps, relative/absolute widths, equal-score ambiguity, width conflict warning, one-to-one mapping, and a generic seven-opening 623-style shifted-box failure.
- [ ] Implement pure named score components and unique-winner acceptance.
- [ ] Verify and commit.

### Task 7 — Face reconciliation fallback

**Files:** modify `matchFrames.ts` and contract/tests.

- [ ] Add red cases proving plan and elevation evidence travel together, existing frames cannot be invented, evidence IDs survive correction, and the run cap is four faces.
- [ ] Implement one closed-schema reconciliation per selected ambiguous face.
- [ ] Verify and commit.

### Task 8 — Scale-aware crops

**Files:** create `faceMapped/crops.ts`; modify contract/tests.

- [ ] Add red cases for complete-frame containment, full storey height, scale expansion/no shrink, unscaled wider margin, neighbour-centre exclusion, shifted D03/D04-style rejection, and unthresholded 300 DPI.
- [ ] Implement pure crop calculation then call existing render/storage.
- [ ] Verify and commit.

### Task 9 — Parallel Phase E

**Files:** create `faceMapped/compositions.ts`; modify contract/tests.

- [ ] Add red cases for 19→4/4/4/4/3 and 27→4/4/4/4/4/4/3 batches, concurrency ≤4, stable order, isolated batch failure/retry, exact evidence tuple, no sibling copying, and all reading states.
- [ ] Reuse `mapPool`; release images in `finally`.
- [ ] Verify and commit.

### Task 10 — Reports, progress, orchestration

**Files:** create `faceMapped/report.ts` and `run.ts`; modify drawing contract/tests only for additive fields.

- [ ] Add red cases for one final reading per schedule row, exact crop lineage, phase-specific gaps, conflict preservation, monotonic append-only progress, independent durations, provider diagnostics, and full schedule fallback.
- [ ] Implement report conversion and orchestration.
- [ ] Verify `run.ts` remains below its review target and commit.

### Task 11 — Switch wiring

**Files:** modify `enrich.ts`, `ai/jobs.ts`, `ai/versions.ts`, `worker/types.ts`, `wrangler.jsonc` comments, drawing tests, and `ai-jobs.test.mjs`.

- [ ] Add red routing, mode-isolation, deadline, and disabled early-exit tests.
- [ ] Add the selector/dependency branch, retain the configured default, bump pipeline version, and give each new skill a unique ID/version.
- [ ] Run focused and regression suites green; commit.

### Task 12 — Replay and release gates

**Files:** modify `scripts/drawing-gate.mjs` and drawing tests; create `01-verification.md` when results exist.

- [ ] Add red cases refusing empty/unknown label assertions and separately scoring identity, complete frame, composition, order, ratio, and unresolved outcomes.
- [ ] Add deterministic Phase A–D replay and token-free Phase E response replay tests.
- [ ] Verify prompt/model/input hash changes cannot reuse incompatible stages.
- [ ] Run full checks and commit.

## 14. Verification and release gate

Automated checks:

1. Drawing-enrichment suite.
2. AI jobs/deadline suite.
3. Typecheck.
4. Worker lint/build checks.
5. Existing mode regression tests.

Use deliberately retained, ignored local artifacts for 312, 623, and 939. Commit only generic synthetic geometry and expected labels, never customer files/crops.

Before production selection:

1. Run each reference document at least three times.
2. Score location separately from composition.
3. Require 100% correct opening identity for every persisted crop.
4. Require zero cross-opening evidence assignments.
5. Require wrong/ambiguous locations to fail closed into schedule fallback.
6. Compare composition accuracy with the best `agentic_full` baseline.
7. Record median/p95 wall time, model calls, tokens, container calls, and estimated cost.
8. Confirm progress advances after every settled Phase E batch.
9. Confirm rollback to `agentic_full` is configuration-only.

Quality is primary. Target total duration is 5–6 minutes or less, with no visible progress interval silent for about two minutes. Target model cost is around or below the previously acceptable approximately USD $0.50 run; exceeding it requires an explicit owner decision backed by measured accuracy.

## 15. Completion criteria

The scaffold is complete when the mode and typed bundle compile, `run.ts` is orchestration-only, shared harvest has one implementation, parallel Phase E is tested, existing modes pass unchanged, and customer artifacts remain outside Git.

The engine is complete when every schedule opening has exactly one outcome; every value has plan, frame, and crop lineage; wrong narrow/shifted/mirrored crops fail before Phase E; unresolved openings fall back without blocking a quote; and replay/live gates pass.

## 16. Non-goals

- Product selection, catalogue fit, Sanity pairing, or manufacturability.
- Room-label extraction.
- Changing schedule dimensions or precedence.
- Multi-PDF plan-set support without separate approval.
- Training a custom object detector.
- Extending crop retention.
- Replacing an existing engine before the gate passes.

## 17. Handover notes

- Do not add new phases to the already oversized `fullDocumentAgent.ts`.
- Experimental commit `27a45d78` on `codex/gemma4-trial` contains a parallel batching pattern. Reuse the `mapPool` approach where useful; do not merge model-trial configuration blindly.
- The 623 audit is evidence, not a Git fixture. Reproduce its structure generically and use real retained artifacts only through an ignored replay corpus.
- Preserve quote fallback: drawing quality may degrade to schedule facts, but recoverable parsing failure must not prevent submission.
