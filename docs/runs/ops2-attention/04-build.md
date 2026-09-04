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
