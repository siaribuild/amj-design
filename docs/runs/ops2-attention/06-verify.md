# ops2 Attention — verification (stage 6)

**Verdict: FAIL** — one high finding. Every acceptance criterion in
`01-spec.md` is met by the product code, but adding the ninth destination left
the console's own browser navigation suite red: `npx playwright test
scripts/tests/web/ops2-navigation.spec.ts` fails three tests that this branch
broke. The feature's own suites are green.

Verified from a frozen tree at `8b9b2006` (branch `feat/ops2-attention`); the
only working-tree modifications are `docs/runs/ops2-attention/run.json` and
`scripts/pipeline/conduct.mjs`, neither of which is feature code.

## Gates

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck:gate` | green — "no fatal type errors (58 non-fatal remain)" |
| ops2 node suites | `npm run test:ops2` | 103/103 pass, 0 fail |
| Attention model suite | `node --test scripts/tests/ops2-attention.test.mjs` | 9/9 pass |
| API suites (abuse cases) | `npm run test:api` | 76/76 pass |
| Attention browser suite | `npx playwright test scripts/tests/web/ops2-attention.spec.ts` | 11/11 pass |
| ops2 shell / projects browser suites | `npx playwright test scripts/tests/web/ops2.spec.ts scripts/tests/web/ops2-projects.spec.ts` | pass (part of a 25-passed run) |
| Legacy ops browser suite (new seed row `u_staff7`) | `npx playwright test scripts/tests/web/ops.spec.ts` | 15/15 pass |
| **ops2 navigation browser suite** | `npx playwright test scripts/tests/web/ops2-navigation.spec.ts` | **4 failed, 5 passed** — three are Finding 1, one is pre-existing (Note A) |

## Acceptance criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Three groups, four Projects counts, one each for Enquiries/Customers, numbers equal the endpoint's | PASS | `ops2-attention.spec.ts:61` renders a stubbed summary and asserts each row's text ("4 new submissions" … "1 trade application waiting on a decision"). Field names in `src/ops2/attention/attention.ts:9-16` match the response built at `worker/routes/ops.ts:330-343` (`submissions`, `inReview`, `readyToIssue`, `awaitingPayment`, `newEnquiries`, `tradeApplications`). |
| 2 | Shared `RowList` + `OpsPage` frame with an `<h1>` | PASS | `ops2-attention.spec.ts:65` asserts heading level 1 "Attention" in the browser; `ops2-attention.test.mjs` pins the `RowList, Row` import from `../chrome/RowList`; `AttentionPage.tsx:25` wraps in `OpsPage`. |
| 3 | A zero count draws no row | PASS | `ops2-attention.test.mjs` "a zero count inside a non-zero group emits no row for it" — green. `attention.ts:110` (`if (count === 0) continue`). |
| 4 | An all-zero group is absent, order of the rest unchanged | PASS | `ops2-attention.test.mjs` "a group whose rows are all zero is absent entirely…" — green. `attention.ts:116`. |
| 5 | All six zero → shared `.pq-empty` | PASS | `attentionGroups()` returns `[]` (node test, green); `AttentionPage.tsx:63` renders `className="pq-empty"`, pinned by the structural assertion in `ops2-attention.test.mjs`. Model plus structural only — there is no browser case for the all-zero screen; accepted at this depth. |
| 6 | No row exposes a mutating control | PASS | `ops2-attention.spec.ts:80-84` asserts each group's row count equals its button count (4 / 1 / 1) — the press button is the only control. `edge={null}` pinned in `ops2-attention.test.mjs`. |
| 7 | Every row links to a route registered in `nav/destinations.ts` | PASS | `ops2-attention.test.mjs` "every row href names a registered destination path…" — green; hrefs are built from `destination(id).path` (`attention.ts:65,86,92`). |
| 8 | No `Active orders`, no Customers-total figure | PASS | `ops2-attention.test.mjs` asserts `AttentionPage.tsx` never names `activeOrders` or the raw `customers` field; `parseSummary` (`attention.ts:19-26`) does not read either key. |
| 9 | Projects row → `/projects` pre-filtered, queue default untouched | PASS | `ops2-attention.spec.ts:87` presses the submissions row, lands on `/projects` with the second chip (`Needs us`) `aria-pressed=true`. `EMPTY_QUERY` is unchanged in the diff (`queue.ts:155`). |
| 10 | The named control reads as active, and clearing returns the unfiltered queue | PASS | Same test, `ops2-attention.spec.ts:97-101`: pressing `All` sets it pressed and clears `Needs us`. |
| 11 | An unexpressible filter value is a red node test | PASS | `ops2-attention.test.mjs` asserts every emitted query string is exactly `wait=<ChipKey>` against `WAIT_CHIPS`; `chipFromSearch` validates against the same list (`queue.ts:164`), covered by `ops2-projects.test.mjs` "?wait= from a notification link…" (5 cases). |
| 12 | Rows carry the wait axis alone | PASS | `ops2-attention.test.mjs` "the wait mapping…" — submissions/inReview/readyToIssue → `?wait=us`, awaitingPayment → `?wait=customer`. |
| 13 | Enquiries row → `/enquiries` placeholder root | PASS | `ops2-attention.spec.ts:103` — URL `/ops2/enquiries`, `<h1>Enquiries</h1>`, "Nothing is built here yet." visible. |
| 14 | Trade applications row → Customers | PASS | `ops2-attention.spec.ts:113` — URL `/ops2/customers`, `<h1>Customers</h1>`. |
| 15 | `enquiries` registered, with an icon entry | PASS | `destinations.ts:88-91` and `icons.ts:29`; the `Record<DestinationId, string>` guard compiles clean under `npm run typecheck:gate`. |
| 16 | Tab bar still three plus `More`; `enquiries` in drawer and rail | PARTIAL — see Finding 1 | The behaviour holds: `TAB_DESTINATION_IDS` is unchanged (`ops2-navigation.test.mjs:73`, green) and the rendered rail and drawer do carry Enquiries — the browser failure output shows "9 elements" including "Enquiries". But the browser suite asserting this was not updated, so the console's navigation spec is red on this branch. |
| 17 | `ops2-navigation.test.mjs` asserts the list including `enquiries` and the unchanged tab set | PASS | `ops2-navigation.test.mjs:55` adds `["workspace","Enquiries","/enquiries"]` inside the existing assertion; `npm run test:ops2` green. |
| 18 | `degraded: true` → shared `.pq-error` with retry, no counts | PASS | `ops2-attention.spec.ts:122` — error panel visible, zero rows, mock copy asserted. Model side: `parseSummary` returns `"degraded"` for `degraded:true`, a missing key, and a non-number (node test, green). |
| 19 | Outright failure → the same panel | PASS | `ops2-attention.spec.ts:140` — a 500 renders the identical panel and copy, and the test asserts the raw status "500" does not appear. |
| 20 | Retry after recovery renders the groups | PASS | `ops2-attention.spec.ts:156` — unroute, press Try again, groups render, panel gone. |
| 21 | Loading uses the shared treatment, and the shape matches what arrives | PASS | `ops2-attention.spec.ts:171` asserts `attention-skeleton` is visible before the response resolves; `AttentionPage.tsx:28-41` uses `.pq-skeleton` with a constant four-row plus one-row shape. |
| 22 | Return to the page re-fetches; a stale reply never overwrites a newer one | PASS | `ops2-attention.spec.ts:189` leaves and returns, then races a slow superseded reply. `useSummary.ts` uses `useIonViewWillEnter` with a first-fire skip and a `live` guard. |
| 23 | Customer account → 403, no counts | PASS | `npm run test:api` green, including `scripts/tests/api.test.mjs:1440` — `assert.equal(custSummary.body.submissions, undefined)`. |
| 24 | Signed-out visitor → 401/403, no counts | PASS | `scripts/tests/api.test.mjs:70` — anonymous `GET /api/ops/summary` returns 403 and the body carries no counts. |
| 25 | Manufacturer partner → 403, no counts | PASS | `scripts/tests/api-edge.test.mjs:1506` — the manufacturer denial loop now asserts `body.submissions === undefined`. |
| 26 | Non-staff session loading the Attention route sees the unauthorised treatment, not zeros | PASS | `ops2-attention.spec.ts:224` signs a customer in against `ops.localhost`, loads `/attention`, and asserts the unauthorised copy plus a raw 403; `:261` asserts that panel carries no retry. |
| 27 | No record-level detail in worker logs for this path | PASS | `worker/routes/ops.ts:311-346` is the only endpoint Attention calls; it selects and returns eight integers and contains no logging statement. No new endpoint was added (confirmed against the feature diff). |

## Findings

### Finding 1 — HIGH — the browser navigation suite still asserts eight destinations

`scripts/tests/web/ops2-navigation.spec.ts` hardcodes the destination list in
three places and was not updated when `enquiries` was added, so three of its
tests fail on this branch:

- `scripts/tests/web/ops2-navigation.spec.ts:183` — rail labels
- `scripts/tests/web/ops2-navigation.spec.ts:244` — drawer labels
- `scripts/tests/web/ops2-navigation.spec.ts:354` — resolved rail `href`s

Criterion violated: 16 ("`enquiries` appears in the drawer's list and in the
desk rail") and, in spirit, 17 — the node suite was updated with the entry, its
browser twin was not. `npm run test:web` is red on this branch as a result.

Reproduce:

    npx playwright test scripts/tests/web/ops2-navigation.spec.ts

Actual output (abridged):

    1) ops2-navigation.spec.ts:170 › every destination is reachable from the rail, and lights when you arrive
       Locator: locator('.ops2-nav__item')
       +   "Enquiries"
       13 × locator resolved to 9 elements

    2) ops2-navigation.spec.ts:216 › `More` opens the drawer, and the drawer carries every destination and the way out
       +   "Enquiries"

    4) ops2-navigation.spec.ts:332 › every browser-facing link stays inside ops2 while it coexists under /ops2
       +   "http://ops.localhost:8788/ops2/enquiries"

    4 failed, 5 passed

The rendered console is correct — the rail and drawer do carry Enquiries in its
specified position, and the tab bar still shows three destinations plus `More`.
Only the assertions are stale. The fix is to add the Enquiries entry to those
three lists in the spec (after Customers, in the `workspace` section), the same
way `ops2-navigation.test.mjs` was updated — not to work around them.

## Notes

**Note A — pre-existing, not this feature's.**
`scripts/tests/web/ops2-navigation.spec.ts:308` ("the two navigation surfaces
agree about the back button") fails at line 321 with
`getByRole('heading', { name: 'Attention', level: 1 })` not found after
`page.goBack()`. It passes when run alone and fails when run after other tests
in the same file. Confirmed pre-existing against a clean base — a worktree at
the merge-base `284f89ff`, where Attention does not yet exist, shows the same
single failure:

    git worktree add E:/Projects/amj-base-verify 284f89ffe7296669e9a3cb59408d194954fa7a79
    cd E:/Projects/amj-base-verify && npx playwright test scripts/tests/web/ops2-navigation.spec.ts
    → ok 1-7 and ok 9; x 8) ops2-navigation.spec.ts:308 › the two navigation surfaces agree about the back button
      1 failed, 8 passed

Not routed to this feature's developer. Worth its own ticket as an
order-dependent flake in the ops2 shell's back-navigation.

**Note B — the spec's carried warning about `ops2-projects.spec.ts:337` (the
390px list width) did not reproduce.** The whole projects browser suite ran
green on this branch as part of the 25-passed run above.
