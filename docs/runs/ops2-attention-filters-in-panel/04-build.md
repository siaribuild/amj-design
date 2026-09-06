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

## Fix — 06-verify Finding 1 (medium): "the skeleton is the shape that actually
## arrives, at both widths" regressed on a full-file run, passed on baseline
Investigated before touching anything, per the finding's own instruction not
to widen the 4px bound blind. Audited every line the failing assertion's two
sides depend on against `git diff 9567992e4..HEAD`: `QueueSkeleton`'s fixed
560px/305px height (`ProjectsPage.tsx`), `Row`/`RowList`/`ProjectCards`
(`rows.tsx`), `rowFlags` and the card CSS (`projects.css` `.pq-card*`) are all
byte-identical to baseline — the diff touches none of them. `Row` is a plain
`<li>`/`<button>`/`<a>` by ADR 0014, specifically NOT `IonItem`, so the real
row list carries no Ionic custom elements to hydrate; only the skeleton's own
`ion-skeleton-text` does, and that side already gets the `settled()` treatment
this file's own history (`21d84863e`, "two geometry reads taken before the
layout stopped moving") added for exactly this race class, "under a parallel
battery."

Could not reproduce the reported failure: 3 clean full-file reruns (75
test-executions, redirected to a file per the finding's instruction, never
piped), one full-file rerun under 24 competing CPU-bound busy-loops, and a
standalone script reproducing the same route-hold/measure sequence via raw
Playwright + CDP with `Emulation.setCPUThrottlingRate` up to 20x — all stayed
within the 4px bound (390px: promised 560, settled real height 558.125,
diff 1.875px, stable across every throttle level tried).

Given a real, unreproduced-by-me discrepancy was reported with a clean 4-run
A/B/C/D attribution matrix, and given the one asymmetry the code actually has
— `during` (the skeleton reading) is read with `settled()`, `rowSettled`/`list`
(the real, post-load reading) are read once, immediately after
`toHaveCount(4)` resolves, with no wait for layout to stop moving — I closed
that asymmetry rather than guess further: both post-load reads now go through
the same `settled()` helper already defined in this file, unifying the two
sides of the comparison under the identical discipline. Bounds (2px, 4px)
untouched; no production code changed — none of it was implicated by the
diff. Folded in Finding 2 (low) alongside: `queue.ts:76,493`'s two comments
naming the deleted `ATTENTION_FILTERS` now name `REFINEMENTS` instead.

Verified: `npx playwright test scripts/tests/web/ops2-projects.spec.ts >
file 2>&1; echo $?` → exit 0, 25/25, three separate clean runs. `npm run
test:ops2` 143/143. `npm run typecheck:gate` clean (64 pre-existing non-fatal,
unchanged). `npm test` (typecheck + test:pure + test:heavy) 353/353. Committed
separately from the polish stage's still-uncommitted CSS/CONTEXT/ADR changes,
which this fix did not touch.

## Review findings 1 (P0) and 2 (P1) from `07-review-architecture.md`

The finding was correct, and its diagnosis of the previous session was correct
too: both red tests had been written into `scripts/tests/web/ops2-projects.spec.ts`
and neither implementation had been made — `git diff` showed no change under
`src/` at all. Both are now implemented.

### P0 — six filters exceeded the phone sheet

**Option taken: let the sheet scroll its own content**, via Ionic's own
`expandToScroll={false}` on the sheet form in `src/ops2/chrome/SidePanel.tsx`.

Why that one of the three the finding offered:

- Ionic renders a sheet as a **full-height `.ion-page` translated down** to its
  breakpoint, so at `0.5` the content box is twice the visible band: nothing
  overflows, and content that cannot overflow cannot scroll. That is the actual
  cause, and it is why `05-polish.md` measured `scrollHeight === clientHeight`
  with `In production` clipped and `Clear all filters` parked at y≈704.
- `expandToScroll={false}` is the platform's switch for exactly this
  (`@ionic/core` 8.5+; `animations/sheet.js` caps `.ion-page` at
  `currentBreakpoint * 100%`, and `gestures/sheet.js` stops forcing
  `scrollY: false` below the max breakpoint). No CSS reaching into Ionic
  internals, no new breakpoint arithmetic of our own.
- **A third breakpoint `[0, 0.5, 1]` was rejected**: it still requires a *drag*
  before the sixth control exists at all, so a reader who does not think to drag
  a sheet that shows no sign of being draggable is in the same position, and the
  red test — which clicks rather than asserting visibility — would still fail.
- **`phoneForm="screen"` for the filter was rejected**: it abandons the bottom
  sheet, which is the owner's instruction by name ("Filter panel at the bottom is
  to be taken from the mock"). The sheet stays the mock's sheet; it stops hiding
  its own tail.

**Existing panels: unaffected in form, improved in reach.** The prop is scoped
`sheet ? false : undefined`, so the `side` (desk, 520px) and `screen` forms —
which pass no breakpoints at all — are untouched. The other sheet-form callers
(`DeliveryAddressPanel`, `DeliveryPricePanel`, `MetaTab`, `PricePanel`,
`ProjectRecordPage`, `WhyDetail`) gain a scrollable phone sheet where they
previously had a silently clipped one; none of them can lose anything, because
today none of their content scrolls either. Two adjacent risks checked and clear:
Ionic's `modal-no-expand-scroll` rule repositions `ion-footer`, and ops2 renders
no `IonFooter` anywhere (`grep` clean) — `SidePanel`'s footer is a plain
`div.pq-sheet__foot` inside `ion-content`, so it now scrolls into reach with the
list. And `projects.css`'s sticky-footer pinning is scoped
`.pq-sheet--side:has(ion-list)`, i.e. the desk panel only, so the phone sheet's
behaviour is decided in one place.

### P1 — arrival now ends on departure

`src/ops2/projects/ProjectsPage.tsx`: the off-route branch resets **both** the
query and the ref, and the return-time protocol is gone. `arrivalRef` is a plain
`useRef(false)` again — the third value existed only to carry an unfinished reset
across a navigation, which is the defect itself. The reset effect watches
`location.pathname` alone (`location.search`/`location.key` deps dropped; there
is nothing to do on the way in — `?attn=` is the other effect's job).

Nothing moved onto `ionViewWillEnter`, per the finding and per the measured
facts recorded in that file: it does not fire on a rail-back, and the F2/F4
history is preserved in the comments.

### Tests

Both red tests named by the finding already exist in
`scripts/tests/web/ops2-projects.spec.ts` and were left byte-identical — in
particular "on a short phone…" still *clicks* both controls rather than asserting
`toBeVisible()`, which is the whole point of it.

Because the browser suite cannot run this session (below), each fix also got a
node-level red that *can*, in the suite that already owns source-shape assertions
for that file:

- `scripts/tests/ops2-frame.test.mjs` — "SidePanel: the phone sheet scrolls its
  own content…". Watched fail (`expandToScroll` absent), then pass.
- `scripts/tests/ops2-projects.test.mjs` — "ProjectsPage: leaving the queue ends
  the arrival there and then…". Watched fail (`setQuery(EMPTY_QUERY)` not in the
  departure branch), then pass.

### Verification — BROWSER VERIFICATION IS PENDING, and why

- `npm run typecheck:gate` — clean (64 pre-existing non-fatal, unchanged).
- `npm run test:ops2` — 145/145.
- `npm test` — 353/353, exit 0 (typecheck + `test:pure` + `test:heavy`, 691s).
- `npm run test:web` — **NOT RUN.** Playwright is pinned to port 8788
  (`playwright.config.ts`), and another repository
  (`E:\Projects\amj-ops2-customers`) is holding 8788/8789 with its own harness.
  Confirmed live with `netstat`. Per the instruction for this fix the ports were
  not killed, not reassigned, and no test was weakened or skipped to manufacture
  a green.

**So the two browser tests that define these fixes have not been executed against
the fixes.** They must be run once the ports free:

```
npx playwright test scripts/tests/web/ops2-projects.spec.ts
```

The P0 fix in particular changes runtime layout behaviour inside Ionic's sheet
gesture, and only a real 375×667 viewport proves the last refinement and the
footer are clickable. Treat this fix as implemented-and-unverified until that run
is on record.

## Fix round 2 — three quality findings (ponytail + architecture P2/P3)

No behaviour change was intended or made; the 62 browser tests and the node
battery are the arbiter, and both are green (below).

### 1. One key space, not two (ponytail yagni + architecture P3)

`ATTENTION_ARRIVALS` was a `{ key, refinement }` table in which three of the
four entries mapped a key to itself. The whole table — and the separate
`AttentionKey` union — existed because one card was spelled `readyToIssue`
where its refinement is `ready`. ADR 0020 says one axis; a second key space
with a single alias in it is that axis growing back as a naming convention.

The card emits `?attn=ready` now, and the mapping collapses:

- `src/ops2/projects/queue.ts` — `ATTENTION_ARRIVALS` is
  `["submissions", "inReview", "ready", "awaitingPayment"] as const satisfies
  readonly RefinementKey[]`; `AttentionKey` is derived from it
  (`typeof ATTENTION_ARRIVALS[number]`), so a fifth card is a compile error
  rather than a runtime throw. `arrivalQuery` is a one-liner and the
  `.find(...)!` non-null assertion — architecture P3's finding — is gone with
  it. `attentionFromSearch` is an `.includes()`.
- `src/ops2/attention/attention.ts` — `PROJECT_NOUNS.readyToIssue` → `.ready`;
  the `projectRows` loop iterates keys rather than entries; the href is
  `?attn=${key}`. The rendered noun ("ready to issue") is unchanged.

Red first: `scripts/tests/ops2-projects.test.mjs` — "the Attention cards and
the refinements are ONE key space…". Watched fail on the old table shape, then
pass. It also pins `attentionFromSearch("?attn=readyToIssue") === null`: the
alias is deleted, not translated.

Assertions updated to the collapsed key, per the finding:
`ops2-projects.test.mjs`, `ops2-attention.test.mjs`,
`web/ops2-projects.spec.ts` (`?attn=ready`, two places) and
`web/ops2-attention.spec.ts` (`attention-row-ready`, and the narrowing case).
`SUMMARY_STUB.readyToIssue` in the browser fixture stays: that is the SERVER's
stale legacy summary field, and the test's whole point is that the page does
not read it.

### 2. The filter styling stops reaching through SidePanel (architecture P2)

`projects.css` identified `FilterSheet` with `:has(ion-list)` — the caller
named by what it happens to put inside a shared component. Two ways that
breaks with nobody touching the filter: the next list-backed panel inherits
the sticky footer by accident, and a markup change inside `SidePanel` silently
unpins this one.

- `src/ops2/chrome/SidePanel.tsx` — new optional `panelClass`, appended to the
  form classes on the modal. Documented as the seam it is.
- `src/ops2/projects/FilterSheet.tsx` — declares `panelClass="pq-sheet--filters"`.
  Not `testId`: styling a test handle would make the tests load-bearing for the
  look.
- `src/ops2/styles/projects.css` — the three rules target
  `.pq-sheet--side.pq-sheet--filters` / `.pq-sheet--filters`. The rationale
  comment names the rule it replaced, so it cannot come back quietly.

Red first: `scripts/tests/ops2-frame.test.mjs` — "the filter panel's footer
pinning is asked for by NAME…". Watched fail on `:has(ion-list)` still being
in the stylesheet, then pass. It strips CSS comments before searching, for the
reason above.

### 3. Deleted the source-grep test (ponytail delete)

`scripts/tests/ops2-projects.test.mjs`'s "the attention axis is gone from the
model's own source" is gone. It was a source-text grep with a hand-rolled
comment stripper, asserting that symbols no longer exist to be imported and
that a field TypeScript has already removed from `QueueQuery` is absent. Its
own comment scoped it to "until the tasks that touch them land", and they
landed. `typecheck:gate` plus the tests that actually call `arrivalQuery` and
`refinementStates` cover criterion 18. Nothing replaces it.

### Verification — browser suite RUN this time

- `npx playwright test scripts/tests/web/ops2-projects.spec.ts
  scripts/tests/web/ops2-attention.spec.ts` — **62 passed, exit 0** (1.9m).
  The ports were free this round, so the pending browser verification recorded
  at the end of fix round 1 is now on record too.
- `npm run test:ops2` — 146/146, exit 0.
- `npm run typecheck:gate` — clean, exit 0 (pre-existing non-fatal counts
  unchanged).

### The two documents that asserted the old key strings

Both had to move with the code, or the collapse would have shipped contradicted
by its own record:

- `CONTEXT.md` §Attention arrival — the closed key set now reads
  `submissions` / `inReview` / `ready` / `awaitingPayment`, and the
  "`readyToIssue` → the existing `ready`" translation clause is gone with the
  translation.
- `docs/adr/0020` — its decision list said `?attn=<key>` "keeps its key strings
  (Attention's links are untouched)", which is the ONE clause that kept the
  second key space alive. Amended in place, with an `## Amendment, at review`
  section recording that the reviews caught it and why the retained strings
  contradicted the ADR's own one-axis decision rather than supporting it.
  Flagged for the architect, who owns both documents.
