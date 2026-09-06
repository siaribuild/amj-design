# 06 — Verify: ops2 Attention filters in the Projects filter panel

Round 2 (re-verification after the fix for round 1's Finding 1 and Finding 2).
Verdict date: 2026-09-07. Branch `feat/ops2-attention-filters-in-panel` @ `c8d504a07`
(working tree clean apart from `run.json` and two untracked conductor artifacts —
`docs/mocks/ops2-attention-filters-in-panel.html`, `.playwright-mcp/`).
Baseline for comparison: `9567992e4`.

## Verdict: **PASS**

All 21 acceptance criteria are met with reproduced evidence. Every gate is green from a
clean tree. Round 1's two findings are both resolved and re-verified independently:

- **Finding 1 (medium) — resolved.** `the skeleton is the shape that actually arrives, at
  both widths` now passes. Two independent clean full-file runs of
  `npx playwright test scripts/tests/web/ops2-projects.spec.ts` both exit 0 with 25/25,
  and that test passed in both (`ok 11 … (2.8s)` and `ok 11 … (2.5s)`). The fix
  (`5ed693ee5`) touched only the spec file — it routes the post-load geometry reads
  through the same `settled()` helper the skeleton reading already used. No production
  code was changed to make it pass (`git show 5ed693ee5 --stat`).
- **Finding 2 (low) — resolved.** `grep -rn "ATTENTION_FILTERS\|attentionQuery\|attentionStates" src/ops2/projects/`
  returns nothing at all now; `queue.ts:76` and `queue.ts:493` name `REFINEMENTS`.

No new findings. Nothing regressed.

## Gates

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck:gate` | **Pass** — exit 0, `✓ no fatal type errors (64 non-fatal remain)`; the same 64 the build log recorded, so nothing new. |
| Owning node suites | `npm run test:ops2` | **Pass** — exit 0, `tests 143 / pass 143 / fail 0`. |
| Full pure battery | `npm run test:pure` | **Pass** — exit 0, `tests 1358 / pass 1358 / fail 0`. Includes `docs.test.mjs` against the now-committed `CONTEXT.md` and ADR 0018/0019/0020 edits. |
| API (abuse case, criterion 21) | `node --test --test-concurrency=1 scripts/tests/api.test.mjs` | **Pass** — exit 0, `tests 32 / pass 32 / fail 0`, including `GET /api/ops/projects row DTO carries statusCustomer/orderStage; role abuse on projects and summary`. |
| Playwright — Projects | `npx playwright test scripts/tests/web/ops2-projects.spec.ts` | **Pass** — exit 0, `25 passed`. Run twice, clean both times. |
| Playwright — Attention | `npx playwright test scripts/tests/web/ops2-attention.spec.ts` | **Pass** — exit 0, `35 passed`. |

Note on running the browser suites in this environment (harness, not the feature): a
Playwright run that dies leaves `scripts/tests/web-server.mjs` orphaned holding the ABR
stub's fixed port 8789 (and sometimes `workerd` on 8788), and the next run then fails with
the bare `Process from config.webServer was not able to start. Exit code: 1`. Clear every
orphaned `web-server.mjs` process and confirm `netstat -ano | grep -E ":878[89] " | grep
LISTEN` prints nothing before rerunning. Also do not pipe a Playwright run through `head` —
SIGPIPE orphans the harness and produces junk results. Every result above comes from a run
redirected to a file. Ports were verified free after my final run.

## Acceptance criteria

| # | Criterion | Evidence | Verdict |
| --- | --- | --- | --- |
| 1 | Six filters, in panel order, all plain checkboxes, one list, no heading, no radio | node `REFINEMENTS holds six entries, one 'Ready to issue', in the panel's order (criterion 1, 2)` asserts the exact key and label order; web `the funnel opens the mock's panel…` asserts six controls. Markup checked directly: `FilterSheet.tsx:52-70` is one flat `IonList` of `IonCheckbox`, no headings, and `grep -rn "IonRadio\|role=\"radio\"\|type=\"radio\"\|IonListHeader" src/ops2/` returns nothing. | Pass |
| 2 | "Ready to issue" appears exactly once, as the existing `ready` refinement | Same node test asserts `labels.filter(l => l === "Ready to issue").length === 1`. `queue.ts:147` keeps `{ key: "ready", …, test: (r) => r.issuable }`; `ATTENTION_ARRIVALS` (`queue.ts:167-172`) maps `readyToIssue → ready` rather than duplicating the predicate. | Pass |
| 3 | Every count equals `selectProjects(rows, current query + that filter).length`, all six alike | node `every number on screen IS the length of the list its own control produces` (floor raised to `3 + 6`). `refinementStates` (`queue.ts:283-293`) builds every control through the same `controlFor` → `selectProjects` path the chips use, with no special case for the four merged keys. | Pass |
| 4 | A zero count is visible on the control before it is pressed | web `the labelled zero, and an honest empty naming whichever filters put it there (criteria 4, 10, 11, 12)` asserts `[data-refinement="awaitingPayment"] queue-refinement-count` reads `"0"` with the panel open and nothing ticked. | Pass |
| 5 | Tick "Awaiting payment" → the invoiced rows, strip names it, bubble reads 1 | web `ticking, composing and unticking refinements never asks the network again (criteria 5, 6, 7, 20)` — 2 rows (Delta `deposit_invoiced`, Echo `balance_invoiced`), `queue-active-filters` contains "Awaiting payment", `queue-funnel-count` is `1`. | Pass |
| 6 | Untick returns to the pre-tick view, bubble decrements | Same test: after unticking `unresolved`, bubble `2 → 1`, rows `1 → 2`, and the search box still holds `"bright"`. | Pass |
| 7 | A second filter intersects; the chip and the search do not move | Same test: chip `All` + search `bright` + `awaitingPayment` + `unresolved` → Echo alone, with `queue-search` still `"bright"` and the `All` chip still `aria-pressed="true"`. | Pass |
| 8 | Clear on the strip → `EMPTY_QUERY`, bubble 0, all filters unticked | web `the funnel opens the mock's panel…` (bubble count 0, `Needs us` pressed after Clear) and `Clear ends an arrival…` (strip disappears, both rows return). `ProjectsPage.tsx:419` is now an unconditional `setQuery(EMPTY_QUERY)`; the bubble and the checkboxes both read `query.refinements`, so bubble 0 and all six unticked are the same fact. | Pass |
| 9 | The point of the feature: arrive, Clear, re-tick from the panel, same rows, without leaving Projects | web `Clear ends an arrival, but re-ticking its own filter from the panel gets back to it (criterion 9)` — `?attn=submissions` → 1 row (Alpha); Clear → 2 rows; tick `submissions` in the panel → Alpha alone again; `toHaveURL(PROJECTS)` asserted throughout. | Pass |
| 10 | Two mutually exclusive filters → empty state naming both, with the way out | web `the labelled zero…` — under `All`, `submissions` + `inReview` → 0 rows and `queue-empty` contains both "New submissions" and "Being priced"; node `emptyStateFor explains an arrival whose set moved on…` pins the `clear` affordance (`label: "Clear filters"`). | Pass |
| 11 | The labelled zero: `0` under `Needs us`, true non-zero under `All`, same control (owner ruling D1) | web `the labelled zero…` asserts `"0"` then `"2"` on the same `[data-refinement="awaitingPayment"]` locator; node `a chip's true zero still reads zero on the refinement, even where the chip hides the rows (criterion 11)` pins the model side. Both layers green. | Pass |
| 12 | Ticking a `0` filter gives an honest empty; the chip is not moved, widened or reset | Same web test: 0 rows, `queue-empty` names "Awaiting payment", and `queue-chip` `Needs us` is still `aria-pressed="true"` afterwards. Node side asserts `state.clear.query.chip === "us"` — clearing the filter does not flip the chip. | Pass |
| 13 | An Attention card showing N opens Projects on exactly N rows | `ops2-attention.spec.ts`, 35/35 green, including the four per-key row tests that land on `/projects` and assert the predicate's exact fixture refs. | Pass |
| 14 | Arrival state: chip `all`, `refinements: [mapped filter]`, search cleared, `?attn` stripped | web `a valid ?attn= narrows to its set, and the strip's Clear returns to Needs us` — bare `/ops2/projects`, strip names the refinement, narrowed row set. Model side: `arrivalQuery` (`queue.ts:179-182`) returns `{ chip: "all", refinements: [refinement], search: "" }`, and node `attentionGroups: each project row's count is selectProjects(rows, arrivalQuery(key)).length over PA-PF` gets 2 for `awaitingPayment`, only reachable with chip `all` (those rows wait on the Customer). | Pass |
| 15 | Rail away and back → `EMPTY_QUERY`, bubble 0 | web `rail navigation and back from a record both reset the attention prefilter`, green. The three-valued `arrivalRef` in `ProjectsPage.tsx:104-146` consumes exactly the `true → false → reset` transition. | Pass |
| 16 | An unknown `?attn=` key applies nothing, is stripped, renders the unfiltered queue | web `?attn=bogus and injection payloads render the default set, nothing echoed` (four payloads including SQL, script and a 10 000-char string) and node `attentionFromSearch validates against the closed key set — bogus, injected or oversized input is null`. Both green. | Pass |
| 17 | The `PA_PF` fixture set and the prior run's tests stay green | `ops2-attention.test.mjs` counts 1/2/1/2, `PF` narrowing, row order and href grammar all green inside the 143-test `test:ops2` run; `ops2-attention.spec.ts` 35/35. | Pass |
| 18 | `QueueQuery.attention`, `ATTENTION_FILTERS`, `attentionQuery`, `attentionStates` do not exist in `src/ops2/projects/` | node `the attention axis is gone from the model's own source, not just its exports (criterion 18)`, plus my own whole-directory grep: `grep -rn "ATTENTION_FILTERS\|attentionQuery\|attentionStates\|\.attention\b\|attention:" src/ops2/projects/` → **no output**, code or comment. Round 1's Finding 2 is gone. | Pass |
| 19 | Card count and panel count are equal, both from `selectProjects` | node `every arrival's card count equals the panel's own count for the mapped refinement (criterion 19)` compares `selectProjects(rows, arrivalQuery(key)).length` against `refinementStates`' own count for all four arrivals over PA–PF. | Pass |
| 20 | No new API request, no filter value sent to the Worker | web `ticking, composing and unticking refinements never asks the network again` counts route hits and asserts exactly **1** `GET /api/ops/projects` across tick, search, compose and untick. Selection happens entirely in `queue.ts` over rows already in hand; `useProjectQueue` takes no filter argument. | Pass |
| 21 | A non-Staff session is refused exactly as before; no new endpoint, parameter or widening | Executed for real, not inspected: `scripts/tests/api.test.mjs` → `role abuse on projects and summary` asserts 403 for anonymous, customer and manufacturer-partner sessions on `GET /api/ops/projects`; 32/32 pass. `git diff 9567992e4..HEAD --stat` shows no file under `worker/`, `migrations/` or `src/data/` was touched at all. Browser side: `signed out, ?attn=readyToIssue hits the same wall as every other visit and shows no rows` is green. | Pass |

## Findings

None. Round 1's Finding 1 (medium) and Finding 2 (low) are both fixed and independently
re-verified above; nothing new was found and nothing regressed.

## Notes (not findings, no developer action)

- `docs/mocks/ops2-attention-filters-in-panel.html` and the modified `run.json` are still
  uncommitted in the working tree. They are conductor / mock-gate artifacts, not code.
- The orphaned-port failure mode described under **Gates** is a pre-existing property of
  `scripts/tests/web-server.mjs`, unchanged by this feature; it cost several restarts here
  and is worth knowing before the next browser run.
