## T1 - Enquiries destination: union, registry entry, icon, navigation test

Files: src/ops2/nav/destinations.ts, src/ops2/nav/icons.ts,
scripts/tests/ops2-navigation.test.mjs.

Test asserts (in "the destination list is the owner's, in his order and
his two sections", scripts/tests/ops2-navigation.test.mjs:41):
DESTINATIONS now includes ["workspace","Enquiries","/enquiries"] right
after Customers; TAB_DESTINATION_IDS stays ["attention","projects","products"].

Implementation: "enquiries" added to DestinationId union; Destination
entry (path /enquiries, blurb "Incoming enquiries that are not yet
projects.") inserted after customers; DESTINATION_ICON gains
enquiries: chatbubblesOutline. TAB_DESTINATION_IDS, HOME_PATH,
NESTS_BELOW untouched.

npm run test:ops2: 92/92 pass. npm run typecheck:gate: green
(Record<DestinationId,string> compiles clean — criterion 15 proof).

Next task: Enquiries is registered as a destination but has no route/
placeholder page wired yet (Ops2App.tsx untouched by this task).

## T2 - Attention model (pure) + new node suite + script wiring

Files: src/ops2/attention/attention.ts (new), scripts/tests/ops2-attention.test.mjs
(new, esbuild-bundles attention.ts + projects/queue.ts + nav/destinations.ts),
package.json (test:ops2 gains the new file).

Exports parseSummary (strict-degrades on degraded:true/missing key/non-number)
and attentionGroups (3 fixed groups, zero-row and all-zero-group suppression,
[] on all-six-zero). Hrefs built from destination(id).path; Projects rows
carry ?wait=us|customer per design §3 table. 8 tests cover design §10 criteria
1,3,4,5,18(model),7,11,12 + number-leading labels.

npm run test:ops2: 100/100 pass. npm run typecheck:gate: green.

Next task: attentionGroups/parseSummary have no caller yet — no route, no
component, no fetch of the summary body wired in.

## T3 - useSummary hook, AttentionPage, route branch, group CSS

Files: src/ops2/attention/useSummary.ts (new), AttentionPage.tsx (new),
styles/attention.css (new, wired into styles/index.css), Ops2App.tsx
(route ternary gains attention branch), ops2-attention.test.mjs,
ops2-navigation.test.mjs.

New test: AttentionPage structural source-regex (section.att-group,
RowList/Row edge=null + onActivate->history.push, pq-skeleton/-empty/-error,
attention-error testid, no load.counts in error block, no activeOrders/
customers). Driven red against a stub AttentionPage before the real page
was restored — the full page had to exist first to satisfy the nav
suite's already-red test, so Probity blocked adding this test until I
stubbed the page back down to get genuine red.

npm run test:ops2 (both suites): 9/9 + 13/13 pass. typecheck:gate: green.

Next task: useSummary.ts has no dedicated structural test of its own
(only exercised indirectly) — same red-first constraint applies if one
is added later.

## T4 - Project queue consumes ?wait= as a one-shot instruction

Files: src/ops2/projects/queue.ts, src/ops2/projects/ProjectsPage.tsx,
scripts/tests/ops2-projects.test.mjs.

New: chipFromSearch(search) parses ?wait=, validates against WAIT_CHIPS'
own keys, returns ChipKey|null (invalid/absent -> null). Test covers
us/customer/all/bogus/empty (5 cases, "?wait= from a notification link...").

ProjectsPage: useLocation/useHistory (react-router-dom v5, already the
ops2 router per package.json overrides) added; effect keyed on
location.search applies a non-null chip via setQuery({...EMPTY_QUERY,
chip}) then history.replace(PROJECTS.path) to strip the param. Initial
useState still EMPTY_QUERY, unchanged — effect exists because
IonRouterOutlet keeps the page mounted.

npm run test:ops2: 103/103 pass. typecheck:gate: green (0 fatal).

Next task: no follow-up known from this task.

## T5 - Attention browser suite: seed mailbox + the navigation cases

Files: scripts/db/seed.sql, scripts/tests/web/ops2-attention.spec.ts.

seed.sql: u_staff7 (estimator, liis@openframe.com.au) + register comment
line, following u_staff3-6's pattern exactly.

New spec (sign-in block copied verbatim from ops2-projects.spec.ts, keyed
to u_staff7). Stubs /api/ops/summary via page.route with all 8 real
response keys (numbers, no degraded). 4 tests, design §10 navigation only:
- groups render endpoint numbers; each row is exactly one button (no
  mutating control) — cases 1, 6.
- submissions row -> /projects, Needs-us chip aria-pressed=true, All
  clears it — cases 9, 10.
- enquiries row -> /enquiries placeholder root ("Nothing is built here
  yet.") — case 13.
- trade applications row -> /customers — case 14.

No app-code changes needed (AttentionPage/attention.ts/RowList already
built by T2/T3) — all 4 tests green on first run.

npx playwright test ops2-attention: 4/4 pass. typecheck:gate: green.

Next task (T7): failure/skeleton/staleness/unauthorised cases, same file.

## T6 - Abuse assertions pin bodies carry no counts, not just 403

Files: scripts/tests/api.test.mjs, scripts/tests/api-edge.test.mjs.
4 existing /api/ops/summary 403 denial assertions (anonymous, customer,
manufacturer loop, Access-mode assertion-less session) now also assert
body.submissions === undefined. No worker change — route already returns
{error:"forbidden"}. npm run test:api and npm run test:trade both green.

## T7 - Attention browser suite: failure, skeleton, staleness, unauthorised

Files: scripts/tests/web/ops2-attention.spec.ts (append only).

6 new tests: degraded summary (18), 500 (19), retry-after-unroute recovery
(20), skeleton visible pre-resolve (21), leave/return re-fetch + stale-reply
guard (22), signed-in customer (non-staff) gets unauthorised copy not zero
counts (26).

Case 26 needed its own fixture, not staffCookies: customer login via
page.evaluate/fetch inside a fresh context navigated to OPS2 first — the
session cookie is host-only (no Domain attr, worker/lib/auth.ts), so a
page.request-based login (resolves against baseURL 127.0.0.1) never reaches
ops.localhost and silently tests anonymous access instead. Test pins the raw
response status (403, not 401) to keep this from regressing unnoticed, since
useSummary.ts's UI copy is identical for both.

10/10 pass. typecheck:gate green. No other files touched.

## Fix - Review finding: two copy divergences from the mock (Attention)

Files: src/ops2/attention/attention.ts, src/ops2/attention/useSummary.ts,
scripts/tests/web/ops2-attention.spec.ts.

Finding: enquiries row noun read "nobody has replied to" (mock/UX §3.2 say
"waiting for a reply" — the only row whose number didn't lead a grammatical
phrase); useSummary's error copy surfaced the raw HTTP status ("The server
answered 500...") instead of the mock's §3.4 estimator-safe wording.

Red first: updated line-75 assertion in ops2-attention.spec.ts to the mock's
"2 waiting for a reply" (fails against old noun), and added toContainText
assertions for "Can't tell you what's waiting." / "The counts didn't load,
so none are shown..." to both the degraded-summary and 500 tests, plus a
not.toContainText("500") assertion on the 500 case. Ran — 3 failures, all
for the expected reason (old copy still in place).

Green: attention.ts's newEnquiries noun -> "waiting for a reply". useSummary.ts's
three error branches (non-ok, degraded, network catch) unified onto the
mock's headline/detail — no more status-specific text, matching mock §3.4's
"indistinguishable to the reader by design" (criteria 18, 19). Unauthorised
branch untouched.

npx playwright test scripts/tests/web/ops2-attention.spec.ts: 11/11 pass.
typecheck:gate: green. npm test: 1066/1069 pass, 3 pre-existing failures in
scripts/tests/pipeline.test.mjs (conductor session-resume arg-indexing),
unrelated to this change and untouched by it.

## Fix - Review finding: navigation spec still hardcoded eight destinations

Files: scripts/tests/web/ops2-navigation.spec.ts.

Finding: the enquiries destination (T1) was added to
scripts/tests/ops2-navigation.test.mjs but never to this file's three
hardcoded lists, so 3 of 9 tests failed (rail labels line 183, drawer
labels line 244, resolved rail hrefs line 354). Confirmed red first:
`ABR_PORT=8799 npx playwright test scripts/tests/web/ops2-navigation.spec.ts`
-> 3 failed for the expected reason (locator resolved 9 elements vs the
8-item expectation; missing "Enquiries"/"/enquiries" in each diff), 6
passed.

Fix: added ["Enquiries","/enquiries"] / "Enquiries" / "/enquiries" to
the three lists, in each case directly after Customers, matching
ops2-navigation.test.mjs's order and adding nothing else. No production
code touched, no assertion loosened, no destination order or tab set
changed.

Green: same command, 9/9 pass (Note A's order-dependent back-button
flake did not reproduce this run either). typecheck:gate: green.

## Fix - Review finding: two pipeline-tooling defects from the context-cap removal

Files: scripts/pipeline/conduct.mjs, scripts/tests/pipeline.test.mjs.

Finding (Codex, via reviewer): (1) P1 - the three tests noted above as
"pre-existing failures" were stale, not pre-existing-and-fine:
CONTEXT_CAP was set null 2026-09-05 (lever 1 off), so sessionArgs
omits --autocompact, but the pane-boot, answered-stage, and
durable-restore tests still asserted the flag is always passed - 3
fail, breaking `npm test` for every normal run. (2) P2 - cmds.tree
still raw-`JSON.parse`d 02-tasks.json and iterated the result as an
array, so it throws on the `{ feature, design, tasks: [...] }` wrapped
shape `readTasks` was added to accept; `plan` and `build` already
route through `readTasks`, `tree` didn't.

Confirmed red first, one assertion at a time:
- `node --test --test-name-pattern="tree reads the wrapped" scripts/tests/pipeline.test.mjs`
  (new test, wrapped 02-tasks.json) -> `TypeError: tasks is not iterable` at
  conduct.mjs's tree, before any production fix.
- `--test-name-pattern="answered stage is resumed"` -> `'-p' !== '120000'`
  (assertion expected --autocompact present; sessionArgs already omits it).
- `--test-name-pattern="relaunched with --resume"` -> `'--resume' !== '120000'`
  (same stale expectation on the resume path).
(The pane-boot test's own red run was implicit in the reviewer's report,
93 pass/3 fail confirmed before this session started.)

Fix: (1) extracted the omit/pass switch into a pure, exported
`autocompactArgs(cap, compact)` - `cap === null ? [] : ['--autocompact',
String(compact || cap)]` - used by `sessionArgs` in place of the inline
conditional, and exported `CONTEXT_CAP` alongside it so tests pin the
live value directly rather than assuming it. Added one direct test of
both branches (null -> omitted, set -> passed, per-stage compact wins
over the general cap), then fixed the three boot-test assertions to
expect the flag omitted, matching the owner's 2026-09-05 ruling instead
of contradicting it. (2) changed cmds.tree's `JSON.parse(readFileSync(tp,
'utf8'))` to `readTasks(tp)` - one seam, every reader, no behaviour
change for the bare-array shape it already handled.

Green: `node --test scripts/tests/pipeline.test.mjs` -> 98/98 (96 owed +
2 new: the autocompactArgs direct-branch test and the tree wrapped-shape
test). `node scripts/pipeline/conduct.mjs tree` runs clean against the
real ops2-attention run, no throw. `npm run typecheck:gate`: green.

## Review-finding fixes (07-review-codex, 07-review-ponytail)

**(1) CODEX P2 — skeleton flash on re-entry.** `useSummary`'s effect set
`{status:"loading"}` unconditionally on every `attempt` change, including the
`ionViewWillEnter` refetch on an already-loaded page — violating design
§4.2 ("re-entering the screen does not flash the skeleton"). Red first:
added `"re-entering an already-loaded page never shows the skeleton (design
§4.2)"` to `scripts/tests/web/ops2-attention.spec.ts` — holds the second
`/api/ops/summary` call open after a leave-and-return, asserts the skeleton
has count 0 and the prior row text is still showing while it's in flight,
then releases and checks the new count lands. Ran red first (row vanished,
never came back — confirmed the flash). Fix: `setLoad({status:"loading"})`
-> `setLoad((prev) => prev.status === "ready" ? prev : {status:"loading"})`
— only "ready" counts as a prior answer worth keeping; a retry from
"error"/"unauthorised" still shows the skeleton, since there was nothing to
show. The existing stale-response-guard test
("leaving and returning re-fetches...never overwrites a newer one") stays
green — untouched invariant. `npx playwright test ops2-attention`: 12/12.

**(2) PONYTAIL — dead `AttentionRow.label`.** Never read: `AttentionPage`
renders `row.count` and `row.noun` in their own slots, nothing imports
`.label`. Its doc comment's accessible-name claim was false — no accessible
name is built from it. Deleted the field, its doc comment, and the
`label: \`${count} ${noun}\`` assignment in `attention.ts`; deleted the test
that only exercised it (`"attentionGroups: every row label is
number-leading"`, `scripts/tests/ops2-attention.test.mjs`). `npm run
test:ops2`: 102/102.

**(3) PONYTAIL — `.claude/launch.json` reformatting churn.** Reverted the
one-line -> four-line `runtimeArgs` reformat on the four pre-existing
entries (vite-dev, vite-ops2, worker-dev, sanity-studio), unrelated to this
feature. Kept the new `ops2-worker` entry as-is.

Verify: `npm run typecheck:gate` green (58 pre-existing non-fatal, none
new). `npm run test:ops2` 102/102. `npx playwright test ops2-attention`
12/12.

## Review finding fix — `07-review-architecture.md` #3

**Medium — Projects' `?wait=` effect watched the GLOBAL location with no
pathname guard.** `IonRouterOutlet` keeps `ProjectsPage` mounted across
navigation (the whole reason `?wait=` is applied via effect, not initial
state), so the effect fired for a search string belonging to a DIFFERENT
route. Navigating to a sibling such as `/products?wait=customer` ran
`chipFromSearch`, set the Projects chip, and called
`history.replace(PROJECTS.path)` — yanking the reader off the page they
asked for onto Projects.

Red first: added `"a sibling route's own ?wait= is ignored by a Projects
page kept mounted behind it"` to `scripts/tests/web/ops2-projects.spec.ts`.
Repro needed real browser history, not `page.goto` for the second hop —
`goto` reloads the document and never mounts Projects at all. Sequence:
`page.goto(PRODUCTS + "?wait=customer")` (entry A), click the Projects rail
link (client-side push to entry B, mounts `ProjectsPage`), `page.goBack()`
back to entry A. Ran red: URL landed on `/ops2/projects` instead of staying
on `/ops2/products?wait=customer` — confirmed the yank.

Fix: guarded the effect on `location.pathname === PROJECTS.path`, added
`location.pathname` to its dependency array. One-shot semantics unchanged —
a stale/absent param on the Projects route itself still doesn't re-apply,
and the param is still stripped after use.

Verify: `npx playwright test ops2-projects ops2-attention` 30/30. `npm run
typecheck:gate` green (61 pre-existing non-fatal, none new). `npm run
test:ops2` 122/122.
