# Build log

## t1 - Merge the four attention predicates into REFINEMENTS and delete the attention axis from the queue model
Files: `src/ops2/projects/queue.ts`, `scripts/tests/ops2-projects.test.mjs`.
REFINEMENTS now six entries (submissions, inReview, ready, awaitingPayment,
unresolved, production) in panel order; QueueQuery.attention, ATTENTION_FILTERS,
attentionQuery gone. Added ATTENTION_ARRIVALS (key→refinement map,
readyToIssue→ready) + arrivalQuery; attentionFromSearch validates against
ATTENTION_ARRIVALS. emptyStateFor's attention branch removed — an arrival's
empty state is now the ordinary refinements-named one (no more "Back to Needs
us"). selectProjects drops the attention filter pass.
Tests (18, all green): control-count floor 3+6; labelled zero under a hiding
chip (criterion 11); six-entry order + single "Ready to issue" (criteria 1,2);
source-text purge scoped to queue.ts only (criterion 18 — attention.ts and
ProjectsPage.tsx still reference old names, that's t2/t3); card≡panel counts
over PA–PF (criterion 19).
Next: t2 (attention.ts) and t3 (ProjectsPage.tsx) still import
ATTENTION_FILTERS/attentionQuery — typecheck:gate fails until t3, exactly as
design's sequencing states (gate at t3, not t1/t2). Don't re-run it before then.

## t2 - Point the Attention destination's card counts at ATTENTION_ARRIVALS/arrivalQuery
Files: src/ops2/attention/attention.ts, scripts/tests/ops2-attention.test.mjs.
Renamed ATTENTION_FILTERS→ATTENTION_ARRIVALS, attentionQuery→arrivalQuery
throughout both (import, bundle exports, projectRows loop, comments). No
other logic touched — 4-key AttentionKey shape and PROJECT_NOUNS untouched.
Tests (20, all green) assert same substance as before: counts 1/2/1/2, row
order, PF narrowing, href grammar, statusCustomer payload guard.
Confirmed red first: esbuild bundle failed with "No matching export ...
ATTENTION_FILTERS/attentionQuery" until attention.ts's import was fixed.
Next: t3 (ProjectsPage.tsx) still on old names — typecheck:gate fails until
then, as designed. Not run here per DONE_WHEN.

## t3 - Rework ProjectsPage arrival/reset, strip and Clear onto the refinements-only model
Files: src/ops2/projects/ProjectsPage.tsx, src/ops2/styles/projects.css,
scripts/tests/web/ops2-projects.spec.ts. Replaced the entry-key ref
(attnEntryRef: string|null, compared history.location.key) with arrivalRef
(boolean|null): true = arrival applied and route not yet left, false = left
since, null = nothing to protect — leave-reset effect consumes false→reset.
Deleted attentionLabel/brand pill (arrival's refinement now shows through the
ordinary activeRefinements text, no special styling); strip Clear always
`setQuery(EMPTY_QUERY)`, no more attention-conditional branch. Removed the
dead `.pq-flag[data-tone="brand"]` CSS rule.
Spec (22/22 green): refinement count 3→6 and two `nth(2)` refinement clicks
now addressed by `[data-refinement="production"]` (six entries can reorder,
an index can't be trusted); mobile funnel test's Clear now asserts "Needs us"
chip pressed + 1 row. Lines 128-257 (?attn= arrival/reset/bogus/signed-out)
untouched, still green — confirmed byte-identical against git diff.
typecheck:gate clean. Next task: none queued after t3 in this task set.

## t4 - Add the three panel-behaviour web tests: tick/untick/compose, the way back after Clear, the labelled zero
Files: scripts/tests/web/ops2-projects.spec.ts only, appended after the
funnel/filter-panel test (line 620), no src touched, 25/25 green.
Test 1: 6-row fixture (PA-PF), ticks Awaiting payment (Delta+Echo), composes
with a search term + Unresolved lines (intersection → Echo alone, chip/search
provably unmoved), unticks back. Route-call counter asserts exactly 1
request for the whole sequence. NOTE: search term chosen to match BOTH rows
throughout (`customerName: "Bright Living"`, not a per-row substring) —
`.fill("")` to clear IonSearchbar's underlying input did NOT clear Ionic's
own state (verified: `inputValue()` still read the old term after fill("")),
so the untick step never touches the search box at all, only the checkbox.
Test 2: goto ?attn=submissions → PA alone, strip Clear → both rows (fixture
waitingOn:"Us"), re-tick "New submissions" from panel → PA alone again, URL
stays bare /ops2/projects throughout.
Test 3: invoiced pair waitingOn:"Customer"; Awaiting payment reads "0" under
Needs us, "2" under All; ticking it anyway under Needs us → queue-empty names
"Awaiting payment" with chip still pressed; ticking submissions+inReview
under All (mutually exclusive rows) → empty names both labels.
typecheck:gate clean (64 pre-existing non-fatal, unchanged). Committed 7b964a6d.
Next: none queued after t4 in this task set.
