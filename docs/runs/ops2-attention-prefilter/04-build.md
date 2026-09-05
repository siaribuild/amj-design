# Build notes

## t2 - Grow queue.ts an attention prefilter axis: row fields, ATTENTION_FILTERS, attentionQuery, attentionFromSearch, selector pass, empty state

Files: `src/ops2/projects/queue.ts`, `scripts/tests/ops2-projects.test.mjs`. Commit `55cdb95f`.

`ProjectQueueRow` gains `statusCustomer`/`orderStage` (parsed with under-claiming defaults `""`/`null`).
New: `AttentionKey`, `ATTENTION_FILTERS` (P2's four predicates verbatim), `attentionQuery(key)`,
`attentionFromSearch(search)` (closed-key-set, `chipFromSearch` pattern, untouched — t4 owns its removal).
`QueueQuery`/`EMPTY_QUERY` gain `attention`. `selectProjects` filters on it (falsy check, not `=== null`,
so callers that omit the field don't crash). `emptyStateFor` gains an attention branch — checked before
the no-rows-caused-by-search branch — with `clear` back to `EMPTY_QUERY`; the search branch's
`narrowed`/`elsewhere` now include the attention axis too.

Tests assert: parseProjectQueue defaults, all four predicates over design §5's PA-PF fixture incl.
`readyToIssue === rows.filter(issuable)`, the emptied-attention-set empty state, and
`attentionFromSearch` against bogus/SQL/script/10kB input — all null. Old `?wait=` grammar test removed
per design (t1's worker DTO change was already committed/merged before this task started).

Next task (t3, attention.ts + AttentionPage) can import `ATTENTION_FILTERS`/`attentionQuery` directly —
`selectProjects(rows, attentionQuery(key)).length` is the count contract.

## t3 - Derive the Attention gate's four project counts from queue rows through the one selector

Files: `src/ops2/attention/attention.ts`, `src/ops2/attention/AttentionPage.tsx`,
`scripts/tests/ops2-attention.test.mjs`. Commit `7df23973`.

`SummaryCounts` narrowed to `newEnquiries`/`tradeApplications` (parseSummary strict on those two
only, old project-count fields go unread). New `combineLoads(summary, queue): AttentionLoad`,
precedence unauthorised > error > loading > ready (only `summary` can be unauthorised — queue
folds 401/403 into error). `attentionGroups(counts, rows)` computes each project row's count via
`selectProjects(rows, attentionQuery(key)).length`, href = projects path + `?attn=<key>`;
enquiries/customers rows unchanged (summary counts, no query string). Zero-suppression/testid keys
unchanged. `AttentionPage` now calls `useSummary()` + `useProjectQueue()`, merges via
`combineLoads`, ready branch calls `attentionGroups(load.counts, load.rows)`; skeleton/error/
unauthorised JSX untouched.

Tests: PA-PF fixture counts == filtered-list lengths per key, state-move membership swap
(criterion 6), PF-proves-narrowing (5), combineLoads precedence (all 4 branches), href shape
(`?attn=<key>` on project rows, no query on enquiries/customers), zero-suppression, parseSummary
strict + ignores old project fields. 17 tests, all green; `test:ops2` (134) and
`typecheck:gate` both green.

Next task (t4, ProjectsPage `?attn=` consumption per design §3.3) can use `attentionFromSearch`/
`attentionQuery` from queue.ts directly — nothing in this task's files needs revisiting.

## t4 - Make ProjectsPage consume ?attn=: apply, show in the active strip, clear to Needs us, reset on plain re-entry

Files: `src/ops2/projects/ProjectsPage.tsx`, `src/ops2/projects/queue.ts`,
`scripts/tests/web/ops2-projects.spec.ts`. Commit `e17e0d2d`.

The `?wait=` effect became the `?attn=` effect: valid key → `attentionQuery(key)`, unrecognised →
`EMPTY_QUERY`, either way `history.replace(PROJECTS.path)` strips the param (unchanged pathname
guard). New `useIonViewWillEnter` resets `query.attention` to `EMPTY_QUERY` on any re-entry whose
search carries no `attn` (rail nav, back-from-record) — reads location via a ref so the
arrival-that-carries-the-param isn't raced. `pq-active` strip now renders on
`attentionLabel || activeRefinements.length`, prefilter label leading; its Clear applies
`EMPTY_QUERY` when a prefilter is on, else the old refinements-only clear. `chipFromSearch`
deleted from queue.ts (superseded by t2's `attentionFromSearch`) along with its ProjectsPage import.

Tests (5 new, `ops2-projects.spec.ts`, all against the QUEUE_URL stub except the rewritten sibling
test): apply+narrow+Clear-to-Needs-us, rail-nav/back-from-record reset, bogus+3 injection payloads
→ default set with nothing echoed, signed-out → `queue-error` + zero rows. All 22 web tests green,
`test:ops2` node suites green, `typecheck:gate` green.

Nothing outstanding for t5 (attention web spec rewrite) — it only touches
`scripts/tests/web/ops2-attention.spec.ts`.

## t5 - Rewrite the Attention browser suite: press a row, get exactly that set

Files: `scripts/tests/web/ops2-attention.spec.ts` only. Not committed as green — see below.

Every ready-state test now stubs `/api/ops/projects` with a shared PA-PF fixture (same refs/
predicates as `ops2-attention.test.mjs`'s node fixture: counts 1/2/1/2, PF matches nothing)
beside the summary stub. `?wait=` href assertion is now `?attn=awaitingPayment`. The two summary
race tests (`leaving and returning...`, `re-entering...`) now race `newEnquiries`, not
`submissions` — project counts no longer come off the summary body at all (t3). Added: counts
provably come from PA-PF not stale summary fields; missing-predicate fixture draws no row;
summary-ok+queue-500 → `attention-error`, zero rows; fixture change between visits moves both
count and list on re-entry. 17/21 tests green, `typecheck:gate` green.

**4 RED, confirmed reproducible, real bug — not a test defect, out of t5's file scope to fix.**
The four "press row X, list exactly its refs" tests (criterion 16, DONE_WHEN item 2) fail:
`queue-row` count is always the full PA-PF set (6), never narrowed, when Projects is reached by
*clicking* an Attention row (one SPA hop, first-ever visit to Projects in that browser session).
`ProjectsPage.tsx`'s `?attn=`-consuming effect races `useIonViewWillEnter`'s reset-on-plain-
re-entry effect: on this one-hop arrival the consuming effect's `history.replace` (stripping
`?attn=`) commits and re-renders `locationRef.current` to the now-bare search *before* Ionic's
`ionViewWillEnter` transition callback actually fires, so the ref check "does the current search
lack `attn`?" comes back true and the reset fires, discarding the just-applied prefilter back to
`EMPTY_QUERY`. Design §3.3 point 3's own comment ("the arrival-that-carried-the-param is safe
regardless") assumes the strip always happens after the ref is read; on a real transition it can
happen before. Confirmed deterministic across 3 runs for the 1-hop case; a 3-hop test
(Attention→Products→Attention→Projects, "fixture change between visits") passes, so this is a
genuine timing race, not a permanent break — it just always loses on the direct path. Needs a fix
in `src/ops2/projects/ProjectsPage.tsx` (unify the two effects, or gate the reset on something
other than a ref racing an async Ionic lifecycle event), which is outside the files this task may
touch. Left red rather than weakened or worked around.
