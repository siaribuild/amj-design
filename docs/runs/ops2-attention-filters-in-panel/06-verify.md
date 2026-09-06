# 06 — Verify: ops2 Attention filters in the Projects filter panel

Verdict date: 2026-09-07. Branch `feat/ops2-attention-filters-in-panel` @ `3ee977aec`
(plus the polish stage's uncommitted `src/ops2/styles/projects.css`, `CONTEXT.md` and
ADR edits, which were present in the tree under test).
Baseline for comparison: `9567992e4` (the merge-base this branch was cut from).

## Verdict: **FAIL**

Every one of the 21 acceptance criteria is met, and all four gates the developer claimed
are green really are green when run from a clean tree. The failure is a **regression in a
pre-existing Playwright test that this feature did not touch**: `the skeleton is the shape
that actually arrives, at both widths` fails deterministically (2 of 2 clean full-file
runs) on this branch and passes (2 of 2) on the baseline commit. `npx playwright test
scripts/tests/web/ops2-projects.spec.ts` therefore exits 1 on this branch and 0 on the
baseline. A red owning suite is a fail regardless of which criterion it belongs to.

Findings: 1 medium, 1 low. Neither blocks any acceptance criterion; the medium one blocks
the suite going green.

## Gates

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck:gate` | **Pass** — `✓ no fatal type errors (64 non-fatal remain)`; the 64 match the count the build log recorded, so nothing new was introduced. |
| Owning node suites | `npm run test:ops2` | **Pass** — `tests 143 / pass 143 / fail 0`. |
| Full node battery | `npm run test:pure` | **Pass** — `tests 1358 / pass 1358 / fail 0` (exit 0). This also clears `docs.test.mjs` against the uncommitted `CONTEXT.md` and ADR 0018/0019/0020 edits. |
| Playwright — Projects | `npx playwright test scripts/tests/web/ops2-projects.spec.ts` | **Fail** — 24 passed, 1 failed. All four feature-relevant tests pass; the failure is Finding 1. |
| Playwright — Attention | `npx playwright test scripts/tests/web/ops2-attention.spec.ts` | **Pass** — 25 passed, exit 0. |

A note on running these: `scripts/tests/web-server.mjs` warns in its own comments that
piping the run through `head` sends SIGPIPE and orphans the harness. My first two attempts
did exactly that and produced two junk results — a `net::ERR_CONNECTION_REFUSED` run and a
run that served a stale bundle reporting 3 refinements instead of 6. Both are artefacts of
the truncation, not of the code; every result recorded above comes from a run redirected to
a file. Orphaned listeners on port 8789 also caused two `webServer was not able to start`
failures, cleared with `taskkill`.

## Acceptance criteria

| # | Criterion | Evidence | Verdict |
| --- | --- | --- | --- |
| 1 | Six filters, panel order, all plain checkboxes, no second group, no heading, no radio | node `REFINEMENTS holds six entries, one 'Ready to issue', in the panel's order (criterion 1, 2)`; web `the funnel opens the mock's panel…` asserts `toHaveCount(6)`. Radio absence confirmed by source search: `grep -rn "IonRadio\|type=\"radio\"" src/ops2/` returns nothing, and `FilterSheet.tsx:53-67` renders one flat `IonList` of `IonCheckbox` with no headings. | Pass |
| 2 | "Ready to issue" appears exactly once, the existing `ready` refinement | Same node test; `queue.ts:148` keeps `{ key: "ready", …, test: (r) => r.issuable }` and the old `readyToIssue` entry is gone — `ATTENTION_ARRIVALS` maps `readyToIssue → ready` (`queue.ts:170`) rather than duplicating the predicate. | Pass |
| 3 | Every count equals `selectProjects(rows, current query + that filter).length`, for all six alike | node `every number on screen IS the length of the list its own control produces`; `refinementStates` (`queue.ts`) builds each control through the same `controlFor` → `selectProjects` path as the chips, with no special case for the four merged keys. | Pass |
| 4 | A zero count is visible on the control before it is pressed | web `the labelled zero, and an honest empty…` asserts `awaitingPayment.getByTestId("queue-refinement-count")` `toHaveText("0")` while the panel is open and nothing is ticked. | Pass |
| 5 | Tick "Awaiting payment" → exactly the invoiced rows, strip names it, bubble reads 1 | web `ticking, composing and unticking refinements never asks the network again` — 2 rows (Delta, Echo), `queue-active-filters` contains "Awaiting payment", `queue-funnel-count` is `1`. | Pass |
| 6 | Untick returns to the pre-tick view, bubble decrements | Same test: after unticking `unresolved`, bubble `2 → 1` and rows `1 → 2`, with the search value asserted unchanged. | Pass |
| 7 | A second filter intersects; the chip and the search do not move | Same test: chip `All` + search `bright` + `awaitingPayment` + `unresolved` → Echo alone; `queue-search` input still `"bright"` and the `All` chip still `aria-pressed=true`. | Pass |
| 8 | Clear on the strip → `EMPTY_QUERY`, bubble 0, every filter unticked | web `the funnel opens the mock's panel…` — after Clear, `queue-funnel-count` has count 0, the `Needs us` chip is pressed, one row renders. `ProjectsPage.tsx` Clear is now unconditionally `setQuery(EMPTY_QUERY)`; the bubble and the checkboxes both read off `query.refinements`, so bubble 0 is the same fact as all six unticked. | Pass |
| 9 | The point of the feature: arrive, Clear, re-tick from the panel, same rows, without leaving Projects | web `Clear ends an arrival, but re-ticking its own filter from the panel gets back to it (criterion 9)` — `?attn=submissions` → 1 row; Clear → 2 rows; tick `submissions` in the panel → 1 row (Alpha); URL stays `/ops2/projects` throughout. | Pass |
| 10 | Two mutually exclusive filters → empty state naming both, with the way out | web `the labelled zero…` — under `All`, ticking `submissions` + `inReview` gives 0 rows and `queue-empty` contains both "New submissions" and "Being priced". | Pass |
| 11 | The labelled zero: `0` under `Needs us`, true non-zero under `All`, same control | web `the labelled zero…` asserts `"0"` under `Needs us` and `"2"` under `All` on the same `[data-refinement="awaitingPayment"]` locator; node `a chip's true zero still reads zero on the refinement, even where the chip hides the rows (criterion 11)` pins the model side. Owner ruling D1 is therefore pinned by test at both layers, as the spec demanded. | Pass |
| 12 | Ticking a `0` filter gives an honest empty; the chip is not moved, widened or reset | Same web test: 0 rows, `queue-empty` names "Awaiting payment", and `queue-chip` `Needs us` is still `aria-pressed=true` afterwards. | Pass |
| 13 | An Attention card showing N opens Projects on exactly N rows | `ops2-attention.spec.ts` tests 3–6 — `the submissions / inReview / readyToIssue / awaitingPayment row lands on /projects listing exactly its predicate's fixture refs`, all green. | Pass |
| 14 | Arrival state: chip `all`, `refinements: [the mapped filter]`, search cleared, `?attn` stripped | web `a valid ?attn= narrows to its set…` — URL is bare `/ops2/projects`, strip reads "Ready to issue", 1 of 2 rows. Chip `all` is proved model-side: `arrivalQuery` (`queue.ts:179`) returns `chip: "all", search: ""`, and node `attentionGroups: each project row's count is selectProjects(rows, arrivalQuery(key)).length over PA-PF` returns 2 for `awaitingPayment`, which is only reachable with chip `all` (those fixture rows wait on the Customer). | Pass |
| 15 | Rail away and back → `EMPTY_QUERY`, bubble 0 | web `rail navigation and back from a record both reset the attention prefilter` — after the rail round trip and after the record round trip, `queue-active-filters` has count 0 and `Needs us` is pressed. | Pass |
| 16 | An unknown `?attn=` key applies nothing, is stripped, renders the unfiltered queue | web `?attn=bogus and injection payloads render the default set, nothing echoed` — four payloads including SQL and script injection and a 10 000-char string; each gives bare URL, no strip, no error, both rows, nothing echoed into the document. | Pass |
| 17 | The `PA_PF` fixture set, the four browser tests and the mutation-proved node test stay green | `ops2-attention.test.mjs` counts 1/2/1/2 and `PF` narrowing green inside the 143-test `test:ops2` run; `ops2-attention.spec.ts` 25/25 green. | Pass |
| 18 | `QueueQuery.attention`, `ATTENTION_FILTERS`, `attentionQuery`, `attentionStates` do not exist in `src/ops2/projects/` | node `the attention axis is gone from the model's own source, not just its exports (criterion 18)`; my own `grep -rn "ATTENTION_FILTERS\|attentionQuery\|attentionStates\|query.attention" src/ops2/projects/ src/ops2/attention/` returns only two comment lines (`queue.ts:76`, `queue.ts:493`) — no code. See Finding 2. | Pass, with Finding 2 |
| 19 | A card's count and the panel's count for the same key are equal, both from `selectProjects` | node `every arrival's card count equals the panel's own count for the mapped refinement (criterion 19)` over PA–PF. | Pass |
| 20 | No new API request; no filter value reaches the Worker | web `ticking, composing and unticking refinements never asks the network again` ends with `expect(requests).toBe(1)` across an arrival, three panel ticks, a search and an untick. Corroborated structurally: `git diff --name-only 9567992e4..HEAD` touches no file under `worker/`, `src/data/` or `migrations/`. | Pass |
| 21 | A non-Staff session is refused exactly as before; no endpoint, parameter or authorization widened | Abuse case executed, not inspected: `ops2-attention.spec.ts` test 21 `a signed-in customer (non-staff) loading /attention gets the unauthorised treatment, not zero counts` — green. `ops2-projects.spec.ts` test 6 `signed out, ?attn=readyToIssue hits the same wall as every other visit and shows no rows` — green, `queue-error` visible, `queue-row` count 0. Injection payloads on `?attn=` (criterion 16) never leave the client. And the diff adds no Worker surface at all. | Pass |

## Findings

### Finding 1 — medium — `scripts/tests/web/ops2-projects.spec.ts:549` regresses the skeleton height assertion

`the skeleton is the shape that actually arrives, at both widths` fails on this branch when
the spec file is run as a whole, and passes on the baseline commit under the identical
command. The test is untouched by the feature diff.

Reproduce:

```
npx playwright test scripts/tests/web/ops2-projects.spec.ts > /tmp/pw.log 2>&1; echo $?
```

Actual output on `feat/ops2-attention-filters-in-panel`:

```
  x  11 [chromium] › ops2-projects.spec.ts:471:1 › the skeleton is the shape that actually arrives, at both widths (1.8s)
  ...
  1 failed
  24 passed (2.0m)

    Error: the list is not the promised height at 390px
    expect(received).toBeLessThanOrEqual(expected)
    Expected: <= 4
    Received:    21.875
      at scripts/tests/web/ops2-projects.spec.ts:549:8
```

Attribution — four full-file runs, alternated between the two trees on the same machine,
no other suite running:

| Run | Tree | Result for test 11 |
| --- | --- | --- |
| A | branch `3ee977aec` | **fail**, `Received: 21.875` |
| B | baseline `9567992e4` (git worktree) | pass (22/22, exit 0) |
| C | branch `3ee977aec` | **fail**, `Received: 21.875` |
| D | baseline `9567992e4` | pass (22/22, exit 0) |

Two further observations for whoever picks this up:

- Run in isolation on the branch it passes:
  `npx playwright test scripts/tests/web/ops2-projects.spec.ts -g "the skeleton is the shape"` → `1 passed`.
  So it is order- or load-dependent, not a flat layout error.
- Running the first ten tests' immediate suspect alongside it is not enough to trigger it:
  `-g "the tab strip never clips|the skeleton is the shape"` → `2 passed`. The trigger is
  the accumulation of the preceding ten tests, not the one test the diff modified.
- The polish stage's uncommitted `projects.css` is not the cause. With it stashed
  (`git stash push src/ops2/styles/projects.css`) the failure still occurred.

The assertion compares the rendered `.pq-cards` height at 390px against the skeleton's
fixed `560px` bar (`ProjectsPage.tsx:497-503`). Nothing in the diff changes card anatomy or
the bar, so the likeliest mechanisms are (a) the timing sensitivity the test's own comment
already documents — reading `ion-skeleton-text` before Ionic finishes hydrating it, which
previously showed as a 17px miss — now tipped over by the heavier ops2 bundle, or (b) a
real 21.875px layout difference on the phone list that only appears under load. Which of
those it is needs the `mattpocock-skills:diagnosing-bugs` loop; I did not guess further.
Do not widen the 4px bound — the test's comment explains that a bound wide enough to
absorb 21px absorbs the defect the test exists to catch.

### Finding 2 — low — two comments in `queue.ts` still name the deleted `ATTENTION_FILTERS`

`src/ops2/projects/queue.ts:76` and `src/ops2/projects/queue.ts:493` both refer the reader
to `ATTENTION_FILTERS`, a symbol this change deleted. Criterion 18's node test strips
comments before searching, so it passes; a reader following the comment finds nothing.

Reproduce:

```
grep -n "ATTENTION_FILTERS" src/ops2/projects/queue.ts
```

Actual output:

```
76:   *  matches none of `ATTENTION_FILTERS`' predicates, same under-claiming rule
493:      // where it stands matches none of `ATTENTION_FILTERS`' predicates.
```

Both should name the four merged `REFINEMENTS` entries (or `ATTENTION_ARRIVALS`) instead.
Low: no behaviour depends on it. Defer to the run's debt file rather than spending a
developer session on it alone — fold it into the fix for Finding 1 if one is opened.

## What was not verified, and why

- **DEPTH: light was honoured.** No mutation testing of guards, no hunt for missing tests
  over code that already works, no cosmetic findings raised.
- **Criterion 1's "no second group, no heading"** is verified by source inspection of
  `FilterSheet.tsx` plus the `toHaveCount(6)` assertion, not by a dedicated DOM assertion
  for the absence of a heading element. At this blast radius that is proportionate.
- **Criterion 21's manufacturer-partner session** was not exercised separately; the
  customer session (`ops2-attention.spec.ts:458`) and the unauthenticated case
  (`ops2-projects.spec.ts:245`) were both executed and both refused, and the diff adds no
  Worker code for a third session type to reach differently.
