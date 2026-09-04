# Phase 1 — shared harvest and view scale (handover Tasks 1–2)

Branch `codex/face-mapped-parser`, commits `e1595609..aae3ac99`, based on
`apertly/main` at `df3e8f37` (merged in as `91ba1701`; the handover's stated
baseline `4374270e` was nine commits stale and those nine touched
`fullDocumentAgent.ts`, `enrich.ts`, `stage.ts` and `runner.ts` — the very
files Task 1 moves code out of).

## What shipped

| Commit | Change |
|---|---|
| `e1595609` | `worker/lib/drawing/harvest.ts` — Stage A harvest moved out of `fullDocumentAgent.ts`; the agent re-exports, so every caller keeps its import |
| `48bf4304` | `viewScaleCandidates()` reads printed view scales; `faceMapped/contract.ts` holds `expectedWidthPt()` |
| `cac90bd2` | scales bind to views the document names, not only `ELEVATION A`–`D` |
| `7c3db121` | scales bind to the nearest title; falls and grades refused; BOM stripped |
| `aae3ac99` | duplicate titles, 2×2 sheets, bottom-of-page titles; §5 amendment; golden fixture |

Nothing is wired to a mode yet: `face_mapped` does not exist as a selector
value until Task 11, so this phase changes no runtime behaviour at all.

## Owner decision, 2026-09-04

`FullDocumentHarvest` stays byte-compatible. It is agentic_full's prompt
payload and its stage input hash, so a `scaleCandidates` field would change
that engine's model input and invalidate its replay keys, against invariant 2.
The shared module exposing `viewScaleCandidates(inspected)` satisfies the
intended reuse; `face_mapped` calls it directly. §5 and Task 2 amended to say
so. **Any future addition to `FullDocumentHarvest` itself requires an explicit
prompt and pipeline version change.**

Held to it by `scripts/tests/fixtures/full-document-harvest.json` — a golden
captured by bundling the pre-move `fullDocumentAgent.ts` at `91ba1701` and
running its own `buildFullDocumentHarvest` over synthetic geometry. The test
compares today's output byte-for-byte and names the version bump in its
failure message.

## Verification

- `test:drawing-enrichment` 186 pass, 0 fail
- `test:pure` (whole node battery) 1136 pass, 0 fail
- `typecheck:gate` clean, 59 non-fatal unchanged
- Reviews: Codex (three rounds), `/security-review`, architect conformance

## Review outcomes

**Security — clean.** No new trust boundary and no new sink: no SQL, no URL or
R2 key construction, no auth, no deserialisation of attacker bytes. Prototype
pollution through label-keyed objects checked and dismissed. Noted as
correctness rather than security: `expectedWidthPt(w, 0)` returns `Infinity`,
unreachable while candidates carry `ratio >= 1`.

**Architect — conforms, no blocking findings.** Verified the move line-for-line
against `91ba1701`: five segments, byte-identical, including the non-ASCII
bearings regex. Five advisories, four fixed (A1 BOM, A3 tautological
assertion, A4 association, A5 gradient false positives); two A5 ceilings
recorded in a `ponytail:` comment rather than fixed — `1:100 @ A3` keeps the
ratio and drops the paper size, `1:1,000` is not read — both failing towards
fewer candidates, which the scale-conflict rule handles.

**Codex — ten P2s across five rounds, nine fixed:**

1. Named views (`NORTH ELEVATION`) produced no regions at all, so every scale
   came back unbound.
2. Two views printing the same title (`SECTION A-A` / `SECTION B-B`) collapsed
   to one whole-page region that claimed every ratio on the sheet.
3. Four elevations on one sheet became four full-height strips that cannot
   tell the top row from the bottom.
4. `SEE SECTION A-A` was accepted as a drawing title, inventing a view and
   mis-tiling the sheet around it.
5. The scan ran over page words in content-stream order, so another column's
   word falling between `1` and `100` silently dropped the split ratio forms
   the contract requires. Windows are built from printed lines now.
6. Two side-by-side views with staggered title baselines were read as a grid,
   handing the lower view a thin band that excludes its own drawing. A grid
   now needs titles sharing both a column and a row.
7. Line reconstruction used `sameLine`'s 1.5-height tolerance, which merges two
   rows at ordinary title-block spacing — and a merged row sorts a word from
   above between `1` and `100`. Rows are grouped by glyph-box overlap now.
8. `TYPICAL SECTION` and `TYP ELEVATION` are titles, and finding 4's fix was
   discarding them. Only words that point away from a drawing — see, refer,
   reference, per — reject an anchor.
9. `FALL: 1:100`, `FALL TO 1:100` and `RAMP @ 1:20` slipped past a check that
   read one adjacent token and matched it exactly. The phrase around the ratio
   is read now, punctuation stripped.
10. *Overruled by the owner:* "add scale candidates to the shared harvest",
    citing the handover text that the 2026-09-04 ruling amended.

## Known ceilings

- `1:100 @ A3` and `1:1,000` are not fully read (see the `ponytail:` comment in
  `harvest.ts`).
- A scale printed in a sheet's title block binds to the nearest view title if
  one is clearly nearest. The alternative — excluding the bottom of the page —
  discarded the commonest layout there is.

## Carried into later phases

- Task 10/Phase 5: `viewScaleCandidates()` must be *consumed* by `run.ts`, the
  second half of the owner's required test 2.
- Task 6: the matcher decides when a view's candidates agree; nothing in this
  phase collapses a sheet to one scale.
