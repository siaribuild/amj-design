# Phase 1 — shared harvest and page scale (handover Tasks 1–2)

**Signed off by the owner, 2026-09-04**, after a first refusal: the phase was
rejected while Lot 623 produced no scale, and approved once recovery answered
it on all three reference sets.

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
  page is drawn at. A page's scale is the ratio its footer agrees about; a
  footer that disagrees with itself maps to `null`, which ops can tell apart
  from a page that printed no scale and is simply absent.
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

## Scale recovery, added after the first sign-off was refused

The owner refused this phase because Lot 623 produced no scale at all. Its title
block is drawn as graphics, so no text rule reaches it, and §7.5 makes the scale
the crop's width rather than a check on it — a sheet without one cannot be
cropped by measurement.

`worker/lib/drawing/pageScaleRecovery.ts` reads the scale from the drawing for
pages text could not answer. Text always wins and is never revisited. The whole
page is rendered rather than a title-block crop: where a title block sits is a
convention, and this path exists because a convention failed.

Run against all three sets, with the real code, poppler rendering and Workers AI
(`google/gemini-3.6-flash`) behind the injected dependencies:

| Set | Stated in text | Sent to the model | Recovered |
|---|---|---|---|
| Lot 312 | 12 of 14 | 2 | 0 — both sheets genuinely state none |
| Lot 939 | 16 of 17 | 1 | 0 — the cover states none |
| Lot 623 | 0 of 11 | 11 | 10; page 1 states none |

Lot 623 costs eleven calls and about 89 seconds, serial. The two sheets that
differ from the rest were checked against the drawings by hand: page 2's title
block reads `SCALE: 1:150 (A2)` and page 11 reads `SCALE: 1:50 (A2)`, and the
model returned both — the two places where echoing the majority 1:100 would have
been the easy wrong answer.

The same call also returns the sheet's drawing title, which is the page role
Lot 623 hides in graphics too. It is deliberately unused until a phase needs it.

## The reference set, through this code

`lot312-536a.pdf`, 14 pages, the set behind the successful 19/19 production run.
**Last run at `fa7daa04`** — the scale path changed after every earlier run, so
any later change to it must re-run this and update the commit named here. The
PDF stays out of Git (§3 invariant 12); Task 12 turns this into a replay
assertion (AC11).

| Page | Map | Printed |
|---|---|---|
| 2, 3 | 1:200 | site plan, landscape |
| 4–11 | 1:100 | floor plans and elevations |
| 12 | 1:20 | detail sheet, four `SCALE 1:20` |
| 14 | 1:200 | two `SCALE 1 : 200` plus title strip |
| 1, 13 | none | no ratio printed |

Every page resolves; no conflicts. The set also carries `DRIVEWAY GRADIENT:
1: 11.22` (p2), `SITE BUILT RAMP AT 1:10` on the ground floor plan (p4), roof
falls (p11) and `NO STEEPER THAN 1:8` (p12) — none of which is in the footer,
so none is read.

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

- `test:drawing-enrichment` 189 pass, 0 fail
- `test:pure` 1139 pass, 0 fail
- `typecheck:gate` clean, 59 non-fatal unchanged
- Reviews: Codex code review (thirteen rounds, the last clean), two Codex
  adherence audits against the criteria, `/security-review`, architect
  conformance, and a ponytail pass — which found nothing to delete or
  simplify in the final implementation
- The reference set re-parsed after every fix; the map above is the result of
  the final one

**Security — clean, on the phase including scale recovery.** No new trust
boundary and no new sink: the new logic is coordinate arithmetic over
already-parsed PDF words, and the one place a model answer enters is
`validateStatedScale`, which admits a whole ratio between 1 and 20000 for the
page that was asked about and nothing else. The rendered page becomes a
`data:` string handed to an injected dependency, so no host or protocol is
attacker-influenced. Prototype pollution through label-keyed objects checked and
dismissed. Noted as correctness rather than security: `expectedWidthPt(w, 0)`
returns `Infinity`, unreachable while candidates carry `ratio >= 1`.

*The review failed twice before it ran, with autocompact thrashing, and
completed once the compaction window was raised. CLAUDE.md line 93 still
prescribes `--autocompact 100000`, which is what thrashed on a diff this size.*

**Architect — conforms, no blocking findings.** Verified the move line-for-line
against `91ba1701`: five segments byte-identical, non-ASCII bearings regex
intact. Five advisories, four fixed; the fifth (`1:100 @ A3` keeps the ratio
and drops the paper size, `1:1,000` is not read) stands as a recorded ceiling —
both fail towards fewer candidates, which the agreement rule handles.

**Codex — eighteen P2s across thirteen rounds, the thirteenth clean**, plus two
adherence audits against the criteria.

Nine findings were fixed while per-view binding still existed and died with it.
One was overruled by the owner (add scale candidates to the shared harvest).
What survives as behaviour the code still has is small:

- split ratios read from printed rows, not content-stream order;
- rows grouped by overlap against the taller word, so a rotated label cannot
  bridge two of them;
- admission by footer position alone.

**A blacklist of note subjects — falls, grades, gradients, pitches, ramps,
driveways, stairs — existed for five rounds and is gone.** Rounds 8, 10 and 12
each added a word to it, which is what a blacklist does. The footer ruling
removed the need for any of it. AC13 forbids reintroducing one: if a note is
being misread as a scale, the answer is a better rule about where and how a
scale is printed, not another word.

## Known ceilings

- `1:100 @ A3` keeps the ratio and drops the paper size; `1:1,000` is not read.
- A gradient printed inside the footer band is read as the page's scale. This
  is not hypothetical: Lot 939 page 2 prints `PROPOSED DRIVEWAY GRADIENT IS
  1 : 47` there, and the page reports a conflict against its real 1:200.

## Carried into later phases

- Task 10/Phase 5: `pageScales()` must be *consumed* by `run.ts` — the second
  half of the owner's required test for this phase.
- Task 6: the matcher decides scale from frame widths when the printed scale
  disagrees; a page-level ratio is evidence, never the final word.
