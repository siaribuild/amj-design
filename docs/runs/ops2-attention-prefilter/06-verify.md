# 06 — Verify (independent, adversarial)

**Verdict: PASS**, with 3 findings — none blocking, all recommended for the run's
debt file rather than a developer session. See "Findings" for the severity call
on each.

Verified from scratch against `01-spec.md`. Nothing in `04-build.md`,
`07-review-*.md` or the previous `06-verify.md` was taken as true; every claim
below was re-run in this session and the actual output is recorded.

Diff under test: `git diff 4a1acc69..8bc0e74e` (branch `feat/ops2-attention-prefilter`,
merge-base `4a1acc69`).

---

## 1. Gates

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck:gate` | `✓ no fatal type errors (62 non-fatal remain)` |
| ops2 node suites | `npm run test:ops2` | `tests 135 / pass 135 / fail 0` |
| Worker + D1 journeys (owns `worker/routes/ops.ts`) | `node --test --test-concurrency=1 scripts/tests/api.test.mjs` | `tests 31 / pass 31 / fail 0` |
| Browser (UI-facing, mandatory) | `npx playwright test scripts/tests/web/ops2-attention.spec.ts scripts/tests/web/ops2-projects.spec.ts` | `46 passed (1.6m)` |
| Tester's own probes | `npx playwright test -c playwright.verify.config.ts` | `6 passed (49.1s)` |
| Tester's live end-to-end probe (no stubs) | `node scripts/tests-verify/live-attention-probe.mjs` | `LIVE PROBE PASS` |

Playwright coverage exists and is load-bearing — see criterion 16 below, where
the mechanism was disabled and the browser suite went red.

---

## 2. Acceptance criteria

Evidence marked **LIVE** was produced against a real local Worker + D1
(`scripts/tests/web-server.mjs`), not a route stub.

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | submissions row → exactly N rows, all `statusCustomer === 'submitted'` | PASS | **LIVE**: `live-attention-probe.mjs` — endpoint predicate `submissions: ['OF-Q-10003']`, gate row read `1 …`, press listed exactly `OF-Q-10003`, every other real ref absent. Also stubbed: `ops2-attention.spec.ts:148` case `submissions` (PA). |
| 2 | being priced → exactly N, all `under_review` | PASS | **LIVE**: predicate `inReview: ['OF-Q-C7PROBE']`, count 1, list exactly `OF-Q-C7PROBE`. Stubbed: same spec, case `inReview` (PB, PC). |
| 3 | ready to issue → exactly N, all `issuable` | PASS | **LIVE**: after seeding a genuinely issuable project, predicate `readyToIssue: ['OF-Q-10003']`, count 1, list exactly that ref. Stubbed: same spec, case `readyToIssue` (PC only, PB excluded). |
| 4 | awaiting payment → exactly N, `deposit_invoiced`/`balance_invoiced` | PASS | **LIVE**: predicate `awaitingPayment: ['OF-Q-10002']`, count 1, list exactly that ref. Stubbed: same spec, case `awaitingPayment` (PD, PE; PF `manufacturing` excluded). |
| 5 | the other three predicates' projects are absent (proves narrowing) | PASS | `ops2-attention.spec.ts:162-164` asserts `toHaveCount(0)` for every non-matching ref, per key. Node: `ops2-attention.test.mjs:128` (PF matches nothing). **LIVE** probe asserts the same exclusion over real refs. |
| 6 | a state move drops one count and raises the other, no other reload | PASS | `ops2-attention.test.mjs:141` (membership swap). Browser: `ops2-attention.spec.ts:203` "a fixture change between visits moves both the count and the list it opens". |
| 7 | the old summary SQL's verdict must not be used | PASS | **LIVE, decisive.** Inserted `p_probe_c7` — `status_internal='estimator_assigned'`, zero lines, so the summary's `NOT EXISTS` subselect is vacuously true. `GET /api/ops/summary` → `readyToIssue = 1`. Same DB, same moment, `GET /api/ops/projects` → `issuable count = 0`, and the Attention gate drew **no** ready-to-issue row. Backed by `ops2-attention.test.mjs:201` proving `parseSummary` no longer accepts the field at all. |
| 8 | an `issuable` project is counted and listed | PASS | **LIVE**: `p_submitted` made issuable (delivery settled, lines ready) → gate drew the row, press listed exactly it. Node: `ops2-attention.test.mjs:155`. |
| 9 | the control reads as active and is nameable | PASS | `queue-active-filters` renders `pq-flag` with the `ATTENTION_FILTERS` label; asserted in `ops2-projects.spec.ts:198` ("Ready to issue") and `:163` ("New submissions"), and by tester probe `PROBE C10`. `All` chip is lit alongside (`attentionQuery` sets `chip: "all"`). |
| 10 | turning it off returns to `Needs us`, address carries no filter | PASS | Tester probe `PROBE C10: Clear leaves Needs us and a bare address` — after Clear, `new URL(page.url()).search === ""`, `Needs us` chip `aria-pressed=true`, all 6 rows back. |
| 11 | any other route opens on `Needs us`, no filter | PASS | Four independent paths, all green: rail-away/rail-back (`ops2-projects.spec.ts:147`, `ops2-attention.spec.ts:177`), back-from-record (`ops2-projects.spec.ts:178`), **Back-then-Forward across the stripped entry** (tester probe `PROBE C11`, previously uncovered), and **full reload of the stripped address** (tester probe `PROBE C11: reloading…`). |
| 12 | unknown filter value → default set, no error, no claimed filter | PASS | `ops2-projects.spec.ts:216` (bogus + 3 payloads). Tester probe `PROBE C12` extends it to a **repeated** parameter (`?attn=submissions&attn=readyToIssue` → first wins, 1 row) and a **case variant** (`?attn=Submissions` → default set, no strip, no error). |
| 13 | Enquiries and Trade rows unchanged | PASS | `ops2-attention.spec.ts:251` (`/enquiries`) and `:302` (`/customers`); href shape asserted in `ops2-attention.test.mjs:209` — project rows carry `?attn=<key>`, these two carry no query at all. |
| 14 | a zero predicate draws no row | PASS | `ops2-attention.spec.ts:238` (three keys suppressed). **LIVE**: with the real seed, `readyToIssue` and `awaitingPayment` matched nothing and the probe asserted `attention-row-*` count 0 for both. |
| 15 | a failed `/api/ops/projects` draws failure, never zero, never pressable | PASS | `ops2-attention.spec.ts:287` "summary ok but the queue 500s draws attention-error, not a half-ready page", zero rows. `combineLoads` precedence covered by `ops2-attention.test.mjs:226`. A malformed-but-parseable body throws inside `useProjectQueue`'s `.then` and lands in `.catch` → error, not zero. |
| 16 | **disabling the mechanism must turn the tests red** | PASS | Mutation-tested, twice. **M1** — `selectProjects` ignores `query.attention` (`queue.ts:650`): `node --test scripts/tests/ops2-projects.test.mjs scripts/tests/ops2-attention.test.mjs` fails with `actual: ['PA','PB','PC','PD','PE','PF'], expected: ['PA']`. **M2** — `ProjectsPage` applies `EMPTY_QUERY` instead of `attentionQuery(key)` (the queue ignores the filter the row sets): browser suite **8 failed / 22 passed**, and the four failures named are exactly `the {submissions,inReview,readyToIssue,awaitingPayment} row lands on /projects listing exactly its predicate's fixture refs`, all on `expect(rows).toHaveCount(expected.length)`. Both mutations reverted; `git status src/` clean. |
| 17 | only the two approved `worker/` fields | PASS | `git diff 4a1acc69..HEAD -- worker/ migrations/` → `worker/routes/ops.ts \| 5 +++++`, one file, and the five lines are `statusCustomer: r.status_customer`, `orderStage: r.order_stage ?? null` plus a three-line D1 citation comment. No other `worker/` file, no migration. |
| 18 | signed-out browser: sent to sign-in, no project data | **PARTIAL** | Data half **PASS, executed live**: `GET /api/ops/projects` → `403 {"error":"forbidden"}` with and without `?attn=`; the browser renders `queue-error`, **0** `queue-row`, and no `OF-Q-*` ref anywhere in the document. Sign-in half **FAIL** — see finding **V1**. |
| 19 | signed-in Customer → 401/403, no rows | PASS, executed live | Real session: `POST /api/auth/verify` → 200, `GET /api/auth/me` → `{"authenticated":true,"user":{"id":"u_demo",…}}`. Then `GET /api/ops/projects` → `403 {"error":"forbidden"}`; with `?attn=readyToIssue&wait=us` → `403`; `GET /api/ops/summary` → `403`. Regression-locked by `api.test.mjs:270`. |
| 20 | Manufacturer partner → 401/403, no rows | PASS, executed live | Inserted `u_mfg_probe` (`type='internal'`, `role='manufacturer'`), signed in through `POST /api/ops/auth/verify` → 200, `GET /api/auth/me` confirms the session is real. `GET /api/ops/projects` → `403`; `?attn=submissions` → `403`; `GET /api/ops/summary` → `403`. Guard is `resolveStaff` (`worker/lib/staff.ts:155`), which refuses `role === "manufacturer"`. |
| 21 | any non-Staff → summary refused, no counts | PASS, executed live | Anonymous `403`, customer `403`, manufacturer `403` — all `{"error":"forbidden"}`, no count keys in any body. |
| 22 | injected filter value → default set, executes nothing, echoes nothing | PASS, executed live | Shipped test asserts no echo. Tester probe `PROBE C22` additionally asserts the payload never **ran**: for `<script>window.__pwned=1</script>`, `"><img src=x onerror=window.__pwned=1>`, `javascript:window.__pwned=1` and `'; DROP TABLE project; --`, `window.__pwned` is `undefined`, the default 6-row set renders, no strip, no error. The value never reaches the server — `attentionFromSearch` (`queue.ts:188`) validates against the closed key set before anything consumes it. |

---

## 3. Findings

### V1 — LOW/MEDIUM — a signed-out visitor is told it is "Signed in" and to ask an admin for a role
**Criterion:** 18 ("**it is sent to sign-in** and no project data is rendered") — the
second half holds, the first does not.

**File:** `src/ops2/projects/useProjectQueue.ts:68-74` (copy), `src/ops2/nav/AccountButton.tsx:43`
(the identity chip).

**Reproduce:**
```
WEB_PORT=8799 node scripts/tests/web-server.mjs      # in another pane
node scripts/tests-verify/signed-out-probe.mjs
```
**Actual output:**
```
final URL      : http://ops.localhost:8799/ops2/projects
ops API calls  : [ '200 /api/ops/brand', '401 /api/ops/me', '403 /api/ops/projects' ]
queue-error    : 1
queue rows     : 0
error text     : This account cannot see the queue. Projects are staff-only. Ask an administrator to add the role. Try again
sign-in words? : false
any project ref on page?: false
```
`scripts/tests-verify/so2.mjs` shows the same on `/ops2` and `/ops2/attention`, and
the shell's account chip reads **"Signed in"** to a browser holding no session.

**Assessment.** The security property is intact — nothing leaks, and the API
refuses at `resolveStaff`. What fails is the criterion's stated destination: a
signed-out staff member is told to ask an administrator for a role they already
hold, while the chrome claims they are signed in. Both behaviours are
**pre-existing** (`AccountButton` from `38b77dda`, deliberate for the
behind-Cloudflare-Access case where the person genuinely is signed in) and
neither is touched by this diff. Recommend DEBT plus an owner decision on
whether ops2 gets a sign-in route at all, rather than a developer session inside
this run.

### V2 — LOW — spec §3's seed instruction was not carried out; every shipped browser assertion for criteria 1–4 is stubbed
**Criterion:** §3 Edge cases — *"the local seed is thin (1 submission, 0 ready to
issue). Rows must be added."*

**File:** `scripts/db/seed.sql` (unchanged across the whole feature —
`git diff 4a1acc69..HEAD --stat` lists no seed file).

**Reproduce:**
```
git diff 4a1acc69..HEAD --stat -- scripts/db/
grep -c "page.route" scripts/tests/web/ops2-attention.spec.ts
```
Real endpoint on the untouched seed:
```
 submissions 1 | inReview 0 | readyToIssue 0 | awaitingPayment 0
```
— only one predicate non-empty, so the shipped suite could not have used it and
used a PA-PF route stub instead.

**Assessment.** The *purpose* of the seed precondition (non-empty, pairwise
non-identical sets) is met by the PA-PF fixture, and the real-endpoint link is
held by `api.test.mjs:246`. I closed the remaining gap myself —
`scripts/tests-verify/live-attention-probe.mjs` drives all four criteria against
the real endpoint with no stubs and passes — but that probe is not in any
`test:*` script, so nothing durable stops the real endpoint and the four
predicates drifting apart. Fix is four rows in `scripts/db/seed.sql` plus one
unstubbed browser assertion. LOW: a coverage-durability gap, not a defect.

### V3 — LOW — the payload guard covers a lost field but not a lost envelope
**Standard:** the developer's own rule in `8bc0e74e` / `attention.ts:124-143` —
*"a payload that lost the field is a failure to tell, not a clear day"*.

**File:** `src/ops2/attention/attention.ts:138` (`rows.length > 0 && …` short-circuits),
`src/ops2/projects/queue.ts:476` (`if (!Array.isArray(projects)) return []`).

**Failing test attached:** `scripts/tests-verify/web/shape-probe.spec.ts`
```
npx playwright test -c playwright.verify.config.ts scripts/tests-verify/web/shape-probe.spec.ts
```
**Actual output:**
```
Error: Timed out 10000ms waiting for expect(locator).toBeVisible()
Expected: visible
Received: <element(s) not found>
> 51 |   await expect(page.getByTestId("attention-error")).toBeVisible();
1 failed
```
A `200` whose body renames `projects` (the shape an endpoint contract break
produces) parses to zero rows, the `rows.length > 0` guard never fires, and the
gate draws a clear day — the exact silence the guard was added to prevent, one
level up. Note the guard is correctly scoped where it is: `orderStage` all-null
and `issuable` all-false are legitimate states and must **not** be refused;
`statusCustomer` and the envelope shape are the only two that cannot legitimately
be absent.

**Assessment.** Not reachable against today's Worker; requires a contract break.
LOW → debt.

---

## 4. What was deliberately probed and found sound

- **One selector.** Counts are `selectProjects(rows, attentionQuery(key)).length`
  (`attention.ts:100`) and the list is `selectProjects(rows, query)`
  (`ProjectsPage.tsx:155`) — the same function, and M1 proves a change to it
  moves both together.
- **`chip: "all"` in `attentionQuery`.** Verified this is load-bearing:
  `awaitingPayment` rows are `waitingOn: Customer`, so the default `us` chip
  would have emptied that set.
- **Two effects, not one** (`ProjectsPage.tsx:106` and `:139`). The debt file
  explicitly refuses ponytail's merge suggestion. I probed the race it guards —
  Back/Forward, reload, rail round-trip, back-from-record, and two different rows
  pressed in one session — all green (`PROBE C11` ×2, `PROBE C1-4`).
- **P6, is the flag a real control?** It is a static `pq-flag` chip, not a
  toggle; `Clear` is the off-switch. Visible, named with the filter's own label,
  and reversible in one press — reads as meeting P6. ADR 0018 records why the
  funnel refinements were rejected for it. No finding.
- **`?? null` on `orderStage`** (DECISIONS D1's load-bearing detail). Confirmed on
  the real endpoint: an order-less project serialises `"orderStage": null`, key
  present. Regression-locked by `Object.hasOwn` in `api.test.mjs:264`.

## 5. Housekeeping

Both mutations were reverted; `git status` shows no modification under `src/`,
`worker/` or `scripts/tests/`. The tester's artefacts are untracked and live
outside the shipped suites:

```
playwright.verify.config.ts
scripts/tests-verify/web/attn-probe.spec.ts        6 probes, all green
scripts/tests-verify/web/shape-probe.spec.ts       V3's failing test
scripts/tests-verify/live-attention-probe.mjs      criteria 1-4/7/14 with no stubs
scripts/tests-verify/signed-out-probe.mjs          V1's evidence
scripts/tests-verify/so2.mjs                       V1's evidence
```
Delete them, or promote `live-attention-probe.mjs` into `scripts/tests/web/`
alongside the seed rows if V2 is taken up.
