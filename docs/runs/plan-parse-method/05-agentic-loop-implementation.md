# Agentic drawing loop implementation handover

Date: 2026-08-30  
Branch: `codex/plan-parse-agentic-loop`

## Outcome

The production `auto_drawings` path now reads the authoritative schedule as one set and lets a bounded multimodal agent research the plan PDF adaptively. The previous fixed page-classification/elevation-join pipeline remains as an injected regression seam for its existing tests, but it is no longer the default production path.

This implements the v3 direction without introducing a second durable runtime. The existing queue claim remains the durable job boundary; the plan-parse container remains stateless PDF tooling; D1 remains the progress/checkpoint surface; R2 stores every image that is allowed to support a result. An Agents SDK/Workflow migration can follow after the real-set experiment proves that resumable turn-level execution is worth its additional Durable Object, binding, dependency, and migration surface.

## Agent protocol

Each turn returns exactly one validated action:

- request text for at most four pages;
- request positioned text tokens for at most four pages;
- render at most six whole pages or point-space crops;
- emit at most four evidence-backed opening records;
- finish.

The loop permits 12 turns and at most 36 new renders. Identical render requests are cached inside the run. Tool requests are batched to avoid one model call per opening.

The schedule owns tag, width and height. The model cannot name an unknown tag or emit millimetre widths. It emits visible unit ratios and operations; the Worker normalises the ratios and calculates widths from the schedule. Drawing text is explicitly treated as untrusted source material rather than instructions.

## Evidence and trust

A proposed reading is accepted only when:

- its tag belongs to the closed schedule vocabulary;
- its operations, ratios, axis and point-space frame are valid;
- the referenced render was created in this job;
- the frame lies inside that render;
- the render was successfully persisted to R2;
- the proposal includes a concise evidence basis.

Duplicate frame assignments and set-wide width-order contradictions downgrade both affected readings. Any flag forces low confidence.

Low-confidence or flagged split, orientation and room values are persisted for diagnosis and surfaced through the existing review-reason channel, but they cannot change the estimate. A missing opening becomes an explicit low-confidence schedule-backed row; it does not fail or erase successful readings for the other openings.

## Customer progress

The existing drawing phases are reused, avoiding a D1 CHECK-table rebuild:

1. `floorplan_location` while the agent researches the set;
2. `render_crops` while it creates evidence views;
3. `opening_read` after each accepted batch of up to four openings;
4. `opening_read N/N` after explicit per-opening fallbacks are materialised.

The browser polling backstop is now 660 seconds, beyond the existing 600-second drawing job ceiling. A healthy long read therefore remains attached to the server-authoritative status rather than showing a false interruption at 150 seconds.

## Verification

- `npm run test:drawing-enrichment`: passing, including action bounds, evidence persistence, partial fallback, turn cap, progress, and review-only assignment.
- `npm run test:ai-pipeline`: passing, including the new low-confidence trust gate.
- `npm run typecheck`: the agent module has no reported type errors; the command still reports the repository's pre-existing baseline errors elsewhere.
- Real reference-set gate: still required before claiming parsing accuracy. The decisive measure is evidence-backed field accuracy and coverage for every scheduled opening, not job completion or model confidence.

## Operational observations to capture on the first real run

Record total wall time, model calls, container calls, stored render count, accepted openings per turn, low-confidence/flagged count, and the first action where an opening becomes accepted. Confirm that progress leaves research/render phases and advances through opening batches before the 600-second lease.

