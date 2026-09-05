# 04 — Build record

Built directly rather than through conducted build stages: the design was
settled by the grill and the approved mock, and the work is four bounded slices
over data already persisted. This file is the record the review stage reads.

Base `4374270e` (`apertly/main`, production). **No parsing code is touched** —
owner's instruction, verbatim: *"DO NOT TOUCH PARSING CODE."* Every field shown
is read from what the parser already writes.

## Slice 1 — the port onto production (`26823c06`)

The tab was built against `feat/plan-parse-conformance`; production runs
`plan-parse-19-of-19`. Moved to the line that actually runs.

- `LinePage.tsx`, `lineRoute.ts`, `LineReview.tsx` were byte-identical across
  the two lines and moved unchanged; the two routes applied to `ops.ts` without
  disturbing main's delivery work.
- `package.json`: the conformance version wires `drawing-gate.test.mjs`, which
  **does not exist on main**. Kept main's lists, added only the two meta test
  files plus `test:meta`.
- `helpers.mjs`: `meta-api.test.mjs` imports `wranglerLocalAuthEnv`, added on
  the conformance line and never merged, so the suite could not load at all.
  Ported — test-only, a fake token plus an account hash already present in
  `wrangler.jsonc`'s image ref.

## Slice 2 — server (`113781a9`)

`src/data/lineMeta.ts`, `worker/lib/drawing/meta.ts`,
`scripts/tests/meta-api.test.mjs`.

- **The spread is gone.** `documentOf` built steps with
  `{ failedPhase, ...steps } as MetaRunSteps` — read as an allow-list, was not
  one. Now field by field. `spuriousField` in the stored steps is the test that
  holds it shut. This was the architecture review's Medium, never fixed, and it
  stopped being hypothetical when the parser added five fields.
- Correction trail (`attempts`, `acceptedTurn`, `corrections[]`), `targetedReviews`,
  telemetry and `providerFailure` reach the DTO.
- **Absent is unknown, never zero** — a pre-19-of-19 report carries none of
  these, and the parser writes a real `0` for an opening it touched.
- Corrections normalised to four keys; `stage`/`outcome` null on a main-path
  rejection **because the parser writes none there**.
- The no-run early return omitted all three new fields — second time that
  return has been the one to forget.

Red observed at 28 pass / 4 fail; green at 32/32.

## Slice 3 — client (`31d33e03`)

`src/ops2/projects/MetaTab.tsx`, `scripts/tests/ops2-meta.test.mjs`.

- Flags **listed, never counted**, on the surface (owner, 2026-09-04).
- Correction trail behind the Reading door, **last**, after the evidence.
  Escalation rows labelled rather than numbered — their turn is always 1.
  Absent entirely when the opening read first time.
- Run door in **six named groups** in run order. An unmeasured figure reads
  "not recorded", never 0.
- Two defects found by looking, not by a failing test: the trail rendered
  before the evidence section (mock has it last), and the evidence heading said
  "Source" where the mock says "Evidence". Both fixed; the order is now pinned
  by an assertion.

## Slice 4 — decoding seam and browser proof (`da23d929`)

`src/ops2/projects/useLineMeta.ts`, `scripts/tests/web/ops2-line-meta.spec.ts`.

- `isLineMetaDto` now decodes `corrections` (and each row's `reasons`),
  `document.telemetry`, and `providerFailure.warnings` — every new path the
  renderer dereferences. Without this a malformed 200 throws instead of
  becoming a retryable error.
- Tightening it **exposed a stale browser fixture**: the spec's mocked DTO was
  the old shape, so the tab would have been withheld and all five existing
  tests would have failed for a reason unrelated to the code.
- Three new browser tests: flags listed on the surface, the trail behind the
  door with the escalation row labelled, the Run door's six group headings.

## Verification

- `npm run typecheck:gate` — clean
- `npm test` — **1124 / 1124** and **345 / 345**, zero failures, after rebasing
  onto current `apertly/main`
- `npx playwright test scripts/tests/web/ops2-line-meta.spec.ts` — **8 / 8**
  chromium

## Known and deliberately not done

- `evidenceView` stays unpersisted — would need a migration, and the parser is
  out of scope.
- The crop-store failure writing `crop_key` NULL with no `gap_code` is a parser
  defect, still open, tracked separately.
- The harvest retention fix is on its own branch (`fix/harvest-retention`),
  deliberately not folded in.
