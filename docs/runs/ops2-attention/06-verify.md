# ops2 Attention — verification (stage 6, round 2)

**Verdict: FAIL** — one medium finding. All 27 acceptance criteria in
`01-spec.md` are met by the product code, and round 1's HIGH finding (the
browser navigation suite still asserting eight destinations) is resolved and
re-verified green. The remaining defect is in the test wiring, not the feature:
the Attention model suite is the only one of the repository's 55 node suites
that `npm test` never runs, so it is not a gate.

Verified independently at `9545da5a` (branch `feat/ops2-attention`); the only
working-tree modification before this pass was
`docs/runs/ops2-attention/run.json`, which is not feature code. Every command
below was run in this session; nothing is carried over from the build log or
from round 1.

## Gates

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck:gate` | green — "✓ no fatal type errors (58 non-fatal remain)" |
| ops2 node suites | `npm run test:ops2` | **102 pass, 0 fail** |
| API suites (abuse cases 23–25) | `npm run test:api` | **76 pass, 0 fail** |
| Trade suite (trade-application counts) | `npm run test:trade` | **35 pass, 0 fail** |
| Pipeline suite (conductor changes on this branch) | `npm run test:pipeline` | **98 pass, 0 fail** |
| Browser: attention + navigation + projects | `npx playwright test scripts/tests/web/ops2-attention.spec.ts scripts/tests/web/ops2-navigation.spec.ts scripts/tests/web/ops2-projects.spec.ts` | **38 passed (1.5m)**, 0 failed |
| Full-battery reachability | `node -e "…"` (Finding 1) | **red** — one suite unreachable |

Two things round 1 and the build log flagged, checked here:

- `scripts/tests/web/ops2-navigation.spec.ts` — 9/9 pass this run. Round 1's
  HIGH finding is fixed and stays fixed.
- `scripts/tests/web/ops2-projects.spec.ts:337` ("the skeleton is the shape that
  actually arrives, at both widths") — passed this run (2.8s). The 390px
  tolerance failure the spec's §5 note warned about did not reproduce; it is not
  attributable to this feature.

## Acceptance criteria

| # | Criterion | Verdict | Evidence (this session) |
|---|---|---|---|
| 1 | Three groups, four Projects counts, one each for Enquiries/Customers, numbers equal the endpoint's | PASS | `ops2-attention.spec.ts:61` green: stubbed summary renders "4 new submissions" / "2 being priced" / "1 ready to issue" / "3 awaiting payment" / "2 waiting for a reply" / "1 trade application waiting on a decision". Field names in `src/ops2/attention/attention.ts:10-16` match the response built at `worker/routes/ops.ts:330-343`. Node: `ops2-attention.test.mjs` "full non-zero summary — group order, Projects lifecycle row order, counts pass through" green. |
| 2 | Shared `RowList` + `OpsPage` frame, with an `<h1>` | PASS | `ops2-attention.spec.ts:65` asserts `getByRole("heading", {name:"Attention", level:1})` visible — green in the browser. `AttentionPage.tsx:25` wraps in `OpsPage`; `:5` imports `RowList, Row` from `../chrome/RowList`, pinned by `ops2-attention.test.mjs`. |
| 3 | A zero count draws no row | PASS | `ops2-attention.test.mjs` "a zero count inside a non-zero group emits no row for it" green; `attention.ts:110` `if (count === 0) continue`. |
| 4 | An all-zero group is absent, remaining groups keep order | PASS | `ops2-attention.test.mjs` "a group whose rows are all zero is absent entirely…" green — `newEnquiries: 0` yields `["projects","customers"]`. `attention.ts:116`. |
| 5 | All six zero → shared `.pq-empty` | PASS | `attentionGroups(zeros)` returns `[]` (node test green); `AttentionPage.tsx:63-70` renders `.pq-empty` in exactly that branch, pinned by the structural assertion. Model + structural only — there is no browser case for the all-zero screen; accepted at this depth, and `screens/desk-empty.png` shows the panel. |
| 6 | No row exposes a mutating control | PASS | `ops2-attention.spec.ts:80-84` green: each group's `getByRole("button")` count equals its row count (4 / 1 / 1) — the press target is the only control. `edge={null}` pinned in node. |
| 7 | Every row links to a route registered in `nav/destinations.ts` | PASS | `ops2-attention.test.mjs` "every row href names a registered destination path…" green — every href's pathname is checked against `new Set(DESTINATIONS.map(d => d.path))`, and hrefs are built from `destination(id).path` (`attention.ts:65,86,92`), not literals. |
| 8 | No `Active orders`, no Customers-total figure anywhere | PASS | `ops2-attention.test.mjs` asserts `AttentionPage.tsx` never names `activeOrders` and never reads the raw `customers` field — green. `parseSummary`'s `SUMMARY_KEYS` (`attention.ts:19-26`) excludes both, so neither value can reach the model. |
| 9 | Projects row → `/projects` pre-filtered, queue's `Needs us` default untouched | PASS | `ops2-attention.spec.ts:87` green: press submissions row → URL `/ops2/projects`, `<h1>Projects</h1>`, chip 1 (`Needs us`) `aria-pressed=true`. `EMPTY_QUERY` unchanged in the diff (`queue.ts:155`); `ProjectsPage`'s initial `useState(EMPTY_QUERY)` unchanged. |
| 10 | The named control reads as active, and clearing returns the unfiltered queue | PASS | Same test, `:97-101` green: pressing `All` sets it pressed and `Needs us` to `aria-pressed=false`. |
| 11 | An unexpressible filter value is a red node test | PASS | `ops2-attention.test.mjs`'s `assertRowHref` asserts each query string's params are exactly `["wait"]` with the value in `new Set(WAIT_CHIPS.map(c=>c.key))` — closed against the queue's own list, bundled from `queue.ts`, so a chip that stops existing is red in node. Reader side: `ops2-projects.test.mjs` "?wait= from a notification link…" (us/customer/all/bogus/empty) green. |
| 12 | Rows carry the wait axis alone | PASS | `ops2-attention.test.mjs` "the wait mapping…" green: submissions/inReview/readyToIssue → `?wait=us`, awaitingPayment → `?wait=customer`; no second param anywhere (criterion 11's helper asserts that). |
| 13 | Enquiries row → `/enquiries` placeholder root | PASS | `ops2-attention.spec.ts:103` green: URL `/ops2/enquiries`, `<h1>Enquiries</h1>`, "Nothing is built here yet." visible. |
| 14 | Trade applications row → Customers | PASS | `ops2-attention.spec.ts:113` green: URL `/ops2/customers`, `<h1>Customers</h1>`. |
| 15 | `enquiries` registered, with a `DESTINATION_ICON` entry | PASS | `destinations.ts:88-91` (workspace, after Customers) and `icons.ts:29` (`chatbubblesOutline`); `Record<DestinationId, string>` compiles clean under `npm run typecheck:gate` this session. |
| 16 | Tab bar still three plus `More`; `enquiries` in drawer and rail | PASS | Round 1's failure is fixed: `npx playwright test scripts/tests/web/ops2-navigation.spec.ts` **9/9 pass**, including "every destination is reachable from the rail…", "`More` opens the drawer, and the drawer carries every destination…" and "every tab reaches its root and lights the bar". `TAB_DESTINATION_IDS` still `["attention","projects","products"]` (`ops2-navigation.test.mjs:73`, green). |
| 17 | `ops2-navigation.test.mjs` asserts the list including `enquiries` and the unchanged tab set | PASS | `ops2-navigation.test.mjs:55` adds `["workspace","Enquiries","/enquiries"]` **inside** the existing assertion (diff confirms one added line, no parallel test bolted on); the tab assertion at `:73` is untouched. `npm run test:ops2` green. |
| 18 | `degraded: true` → shared `.pq-error` with retry, **no count at all** | PASS | `ops2-attention.spec.ts:122` green: panel visible with `role=alert`, mock copy, `Try again` present, `[data-testid^="attention-row-"]` count 0 **and** `attention-empty` count 0 — a degraded read cannot be read as a quiet day. Model: `parseSummary` returns `"degraded"` for `degraded:true`, a missing key, and a string-typed count (node test green). |
| 19 | Outright failure → the same panel | PASS | `ops2-attention.spec.ts:140` green: a 500 renders identical headline/detail, asserts `not.toContainText("500")`, zero rows. `useSummary.ts`'s three failure branches carry byte-identical copy. |
| 20 | Retry after recovery renders the groups | PASS | `ops2-attention.spec.ts:156` green: 500 → unroute → press `Try again` → `attention-error` count 0 and "4 new submissions" rendered. |
| 21 | Loading uses the shared treatment; the shape matches what arrives | PASS | `ops2-attention.spec.ts:171` green: `attention-skeleton` visible while the response is held, rows count 0, and both invert on release. The skeleton is a fixed four-row-plus-one-row `.pq-skeleton` (`AttentionPage.tsx:28-41`) — an approximation of the common case, since zero-suppression makes the arriving row count unknowable before the answer. That is the design's stated resolution (`02-design.md:176-178`, mock §3) and is not raised as a finding. |
| 22 | Return re-fetches; a stale reply never overwrites a newer one | PASS | `ops2-attention.spec.ts:189` green: mount request held open, leave to `/products`, return → call 2 renders "7 new submissions"; releasing the superseded call 1 (`submissions: 999`) plus a 200ms settle leaves "7" on screen. `useSummary.ts:19,73-79` — `live` guard plus `useIonViewWillEnter` with a first-fire skip. Also `:224` green: re-entry with an answer in hand shows no skeleton. |
| 23 | Customer account → 403, no counts | PASS | `npm run test:api` green: `api.test.mjs:1440` asserts 403 **and** `custSummary.body.submissions === undefined`. |
| 24 | Signed-out visitor → 401/403, no counts | PASS | `api.test.mjs:70` green: anonymous `GET /api/ops/summary` → 403, `body.submissions === undefined`. |
| 25 | Manufacturer partner → 403, no counts | PASS | `api-edge.test.mjs:1506` green: the manufacturer denial loop now asserts `denied.body.submissions === undefined` for `/api/ops/summary` among the other ops paths. `npm run test:api` and `npm run test:trade` both green. |
| 26 | Non-staff session on the Attention route sees the unauthorised treatment, not zeros | PASS | `ops2-attention.spec.ts:257` green **against the real endpoint, no stub**: a customer session signed in same-origin on `ops.localhost` loads `/attention`, the awaited `/api/ops/summary` response status is asserted `403` (not 401), the panel reads "This account can't see what's waiting." / "staff-only", and `[data-testid^="attention-row-"]` count is 0. `:294` green: that panel carries no `Try again`. |
| 27 | No record-level detail in worker logs for this path | PASS | Read `worker/routes/ops.ts:309-346` — the only endpoint Attention calls. It selects eight `count(*)` integers, returns them plus `degraded`, and contains no `logEvent`/`console` call; no name, email or id is in scope. The feature diff adds no endpoint (`git diff --stat` shows no `worker/**` change beyond test files). |

## Findings

### Finding 1 — MEDIUM — the Attention model suite is the only node suite `npm test` never runs

`package.json:55` added `scripts/tests/ops2-attention.test.mjs` to `test:ops2`
only. It is absent from both `test:pure` and `test:heavy`, which are the two
lists `npm test` actually executes — and it is the **only** one of the 55 node
suites in `scripts/tests/` in that position. Every other ops2 suite is in both
places (`ops2-navigation`, `ops2-projects`, `ops2-record`, `ops2-panel`,
`ops2-why`, `ops2-deps`, `ops2-frame` in `test:pure`; `ops2-dev-server` in
`test:heavy`).

Consequence: the nine model assertions that are the *only* coverage of criteria
3, 4, 5, 7, 11, 12 and the `parseSummary` half of 18 do not run in `npm test`,
so they gate neither a commit nor a deploy — the deploy protocol's step 1 is
`npm test`. The suite passes today; it simply is not a gate, which is the same
class of silent non-coverage this repo has been bitten by before.

Reproduce:

```
$ node -e "const p=require('./package.json');const fs=require('fs');const all=fs.readdirSync('scripts/tests').filter(f=>f.endsWith('.test.mjs'));const battery=p.scripts['test:pure']+' '+p.scripts['test:heavy'];console.log('total suites:',all.length);console.log('NOT in test:pure or test:heavy:',all.filter(f=>!battery.includes(f)));"
total suites: 55
NOT in test:pure or test:heavy: [ 'ops2-attention.test.mjs' ]
```

Failing test attached (written this session, implementation deliberately not
fixed): `scripts/tests/docs.test.mjs:55` — "every node suite in scripts/tests is
reachable from `npm test`".

```
$ node --test --test-name-pattern="reachable from" scripts/tests/docs.test.mjs
X every node suite in scripts/tests is reachable from `npm test` (1.9696ms)
  AssertionError [ERR_ASSERTION]: test suites exist that `npm test` never runs
  + actual - expected
  + [ 'ops2-attention.test.mjs' ]
  - []
      at TestContext.<anonymous> (.../scripts/tests/docs.test.mjs:70:10)
```

Fix, for the developer: add `scripts/tests/ops2-attention.test.mjs` to
`test:pure` beside the other pure ops2 suites (it is esbuild-bundled and
sub-second, so it belongs in `pure`, not `heavy`), then run
`node --test --test-name-pattern="reachable from" scripts/tests/docs.test.mjs`
green and `npm run test:ops2` to confirm nothing else moved. The guard test above
is the regression check; keep it.

## Deliberately not raised

- The constant skeleton shape (criterion 21) — the design's stated resolution,
  and the arriving row count is unknowable before the answer lands.
- No browser case for the all-zero empty screen (criterion 5) — model assertion
  plus structural assertion plus `screens/desk-empty.png` at this depth.
- The abuse assertions checking one count key rather than all six — the denial
  body is `{error:"forbidden"}`, so no count key can be present.
