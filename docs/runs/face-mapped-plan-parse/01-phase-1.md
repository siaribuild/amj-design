# Phase 1 — shared harvest and page scale (handover Tasks 1–2)

Branch `codex/face-mapped-parser`, commits `e1595609..HEAD`, based on
`apertly/main` at `df3e8f37` (merged as `91ba1701`; the handover's stated
baseline `4374270e` was nine commits stale, and those nine touched
`fullDocumentAgent.ts`, `enrich.ts`, `stage.ts` and `runner.ts` — the files
Task 1 moves code out of).

## What shipped

- `worker/lib/drawing/harvest.ts` — Stage A harvest moved out of the 1600-line
  agent, which now re-exports it, so every caller keeps its import.
- `viewScaleCandidates(inspected)` — every printed ratio that is a drawing
  scale, with its evidence box.
- `pageScales(inspected)` — the scale half of Phase A's document map: what each
  page is drawn at. A page's scale is the ratio everything printed on it agrees
  about; disagreement leaves the page out of the map for ops to see.
- `faceMapped/contract.ts` — `expectedWidthPt()`.

Nothing is wired to a mode: `face_mapped` does not exist as a selector value
until Task 11, so this phase changes no runtime behaviour.

## Owner decisions

**2026-09-04, harvest contract.** `FullDocumentHarvest` stays byte-compatible:
it is agentic_full's prompt payload and its stage input hash, so a new field
would change that engine's model input and invalidate its replay keys, against
invariant 2. The shared module exposing `viewScaleCandidates(inspected)`
satisfies the intended reuse. Any future addition to `FullDocumentHarvest`
itself requires an explicit prompt and pipeline version change. Held to it by
`scripts/tests/fixtures/full-document-harvest.json`, a golden captured by
running the pre-move implementation at `91ba1701` over synthetic geometry.

**2026-09-04, scale is per page.** On the evidence of the reference set: floor
plans and elevations print one scale in the title block and their views share
it; ratios belonging to driveways, ramps and stairs are not scales; detail
sheets are not pages of interest. Per-view binding was removed rather than
carried unused — see below.

## The reference set, through this code

`lot312-536a.pdf`, 14 pages, the set behind the successful 19/19 production run.

| Page | Map | Printed |
|---|---|---|
| 2, 3 | 1:200 | site plan, landscape |
| 4–11 | 1:100 | floor plans and elevations |
| 12 | 1:20 | detail sheet, four `SCALE 1:20` |
| 14 | 1:200 | two `SCALE 1 : 200` plus title strip |
| 1, 13 | none | no ratio printed |

Every page resolves; no conflicts. The set also carries `DRIVEWAY GRADIENT:
1: 11.22` (p2), `SITE BUILT RAMP AT 1:10` on the ground floor plan (p4), roof
falls (p11) and `NO STEEPER THAN 1:8` (p12) — all refused.

## What was removed, and why it existed

Handover §7.4 originally asked for a candidate to be bound to its nearest
drawing title or region. That was implemented literally, and five Codex rounds
then hardened it against `SECTION A-A` name collisions, 2×2 view grids,
staggered title baselines, cross-references and `TYPICAL SECTION`. Every
finding was valid; none of the sheets they described exist in the reference
set. Reading the real document at round seven instead of round two would have
saved the whole excursion.

Deleted: `drawingViewRegions`, grid and stagger tiling, the nearest-title
binding rule with its ambiguity margin, the cross-reference guard,
`DrawingScaleCandidate.viewRegionPt`, and ten tests that only proved binding
worked. `elevationRegions.ts` is 112 lines smaller and back to what the legacy
placement path needs. Git holds it all if a future set proves otherwise.

## Verification

- `test:drawing-enrichment` 191 pass, 0 fail
- `test:pure` 1141 pass, 0 fail
- `typecheck:gate` clean, 59 non-fatal unchanged
- Reviews: Codex (thirteen rounds, the last clean), `/security-review`,
  architect conformance
- The reference set re-parsed after every fix; the map above is the result of
  the final one

**Security — clean.** No new trust boundary and no new sink; all input is
already-parsed word geometry. Prototype pollution through label-keyed objects
checked and dismissed. Noted as correctness, not security: `expectedWidthPt(w,
0)` returns `Infinity`, unreachable while candidates carry `ratio >= 1`.

**Architect — conforms, no blocking findings.** Verified the move line-for-line
against `91ba1701`: five segments byte-identical, non-ASCII bearings regex
intact. Five advisories, four fixed; the fifth (`1:100 @ A3` keeps the ratio
and drops the paper size, `1:1,000` is not read) stands as a recorded ceiling —
both fail towards fewer candidates, which the agreement rule handles.

**Codex — eighteen P2s across thirteen rounds, the thirteenth clean.** Nine
were fixed while per-view binding still existed and died with it. One was
overruled by the owner (add scale candidates to the shared harvest). Eight
survive as behaviour the code still has:

- split ratios read from printed rows, not content-stream order;
- rows grouped by overlap against the taller word, so a rotated label cannot
  bridge two of them and detach a note from its ratio;
- a ratio's subject read from its printed phrase, which ends where the printing
  ends rather than after a fixed number of words;
- each row's ratios found before any is judged, so a ratio bounds its
  neighbour's phrase whether the PDF spelled it in one word or three;
- falls, grades, gradients, pitches, ramps, limits, driveways and stairs
  refused as subjects.

The last two kinds are a blacklist, and rounds 8, 10 and 12 each added to it.
The standing recommendation is to invert it — accept a ratio only when its
phrase names a drawing, or it sits in the sheet's title strip — which ends the
enumeration and reads the reference set identically. Not done: it contradicts
§7.4's line that a bare `1:100` is recognised, so it needs an owner ruling.

## Known ceilings

- `1:100 @ A3` keeps the ratio and drops the paper size; `1:1,000` is not read.
- A page printing only a gradient, with no scale of its own, would report that
  gradient's ratio if its phrase carries none of the refused words.

## Carried into later phases

- Task 10/Phase 5: `pageScales()` must be *consumed* by `run.ts` — the second
  half of the owner's required test for this phase.
- Task 6: the matcher decides scale from frame widths when the printed scale
  disagrees; a page-level ratio is evidence, never the final word.
