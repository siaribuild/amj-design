# ai-parse-monitoring — independent verification (round 4)

**Verdict: FAIL** — three medium findings, one of which is an unmet security
acceptance criterion (27). Twenty-seven of the twenty-eight criteria are met and
were reproduced; the feature's core — the cron, the snapshot, the counts, the
chart, the bubble and the staff guard — is sound and was proved end to end
against a real Worker, a real D1 and real KV, not against fixtures.

Nothing in `04-build.md` or the round-2/round-3 fix log was taken on trust. Every
verdict below names the command that produced it. Findings are handed back for a
developer to fix; no implementation code was changed by this stage. Four failing
tests are attached in `scripts/tests/ai-monitoring.test.mjs` (`TESTER-F1`
through `TESTER-F4`), and they are the only reason `npm run test:ai-monitoring`
is currently red.

Verified at `9bc0a398` on `merge/ai-parse-monitoring`; feature diff taken against
merge-base `a76b8119`.

---

## Gates

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck:gate` | **PASS** — no fatal errors; 61 non-fatal, none in any file this feature touches (checked file by file against `node scripts/typecheck.mjs`) |
| Pure monitoring core + IO shell | `npm run test:ai-monitoring` | **46/46 pass** before the four tester tests were added; **46 pass / 4 fail** with them |
| Claim enqueue and retry | `npm run test:ai-jobs` | **15/15 pass** |
| Ops2 console | `npm run test:ops2` | **126/126 pass** |
| Worker API, including the route's negative paths | `npm run test:api` | **80/80 pass** |
| Browser, the shipped spec | `ABR_PORT=8799 npx playwright test scripts/tests/web/ops2-attention.spec.ts` | **24/24 pass** |
| Browser, tester-authored probes for uncovered criteria | ad-hoc spec, 6 assertions (C2, C13, C16, C17a, C17b, C19) | **6/6 pass** |

`ABR_PORT` had to be moved off 8789: a killed Playwright run leaves the
`web-server.mjs` child holding that port on Windows, and the next run then fails
with `EADDRINUSE` before a single test executes. This is the "fifth attempt"
flakiness `04-build.md` describes; it is an environment problem, not a product
one, but it means a green Playwright claim should always be read with the run's
own output attached.

---

## Acceptance criteria

Every row was reproduced by this stage. "cron probe" and "abuse probe" refer to
two throwaway harnesses written for this pass: both build the SPA, apply all
migrations, seed D1, and run `wrangler dev` with the real Worker, then drive it
over HTTP. Their assertions are reproduced verbatim below the table.

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Credit balance renders `$12.34`; no Cloudflare call during page load | PASS | Playwright "ready snapshot renders cards…" asserts `$12.34`. No-call half: the `/monitoring` route calls `monitoringPayload` → `readMonitoringSnapshot` → `env.KV.get` only; that path contains no `fetch`. Cron probe answered two consecutive page loads from the stored snapshot with zero outbound traffic |
| 2 | Cap card shows headroom `$12.00` **and** the cap `$20.00`, neither hardcoded | PASS | Tester browser probe with `billedSpendUsd: 8, capUsd: 20`: the card contains both `$12.00` and `$20.00`. The shipped spec asserts only the headroom, so the second half of this criterion had no coverage until now |
| 3 | Gateway cap failure falls back to the account endpoint; the snapshot records the source | PASS | `ai-monitoring.test.mjs` "gateway cap failure falls back to spending-limit with capSource 'account'" and "the account fallback converts cents to dollars" — both execute the real module against a scripted fetch |
| 4 | No API token → money unavailable (not zero, not red); counts and chart still render | PASS | Cron probe with `CF_MONITORING_TOKEN` empty: snapshot money is `{balance:{available:false,reason:"token_missing"},budget:{…}}` while `success7d`/`error7d` are the real D1 numbers. Playwright "money unavailable shows an unavailable state, not zero…" asserts the card is not `$0.00` and the count card still reads `20` |
| 5 | Non-2xx or timeout → D1 counts still refreshed, money unavailable, failure logged, page still loads | PASS on behaviour | "CF failure still writes fresh D1 counts with money unavailable" and "a stalled Cloudflare endpoint is bounded" pass; Playwright "a 500 shows the error panel with a retry button" passes. **The content of that log line fails criterion 27 — see F2** |
| 6 | A stale snapshot states its age on every card | PASS | Playwright "stale snapshot renders the stale sentence and per-card as-at stamps": `.att-asat` contains "The 10-minute job may have stopped." and all four `.att-card__stamp` elements are visible |
| 7 | N successes and M errors in 7 days render on the two cards | PASS | Cron probe seeded 2 completed + 1 failed + 1 stuck uploads and read `success7d: 2, error7d: 2` back through the route. Browser side, the probe rendered `20` and `3` on the two cards from a snapshot carrying those totals |
| 8 | A document retried three times before succeeding is one success, zero errors | PASS | "a parse retried until it succeeds is ONE success (criterion 8)" runs the module's own SQL over `node:sqlite`. The amended reading of this criterion (one parse event = one claim lifecycle) is still recorded as needing the owner's word in `07-review-resolution.md`; the code matches the amended text |
| 9 | A `processing` claim 31 minutes old counts as one error | PASS | Tester probe over the module's real SQL: a single 31-minute `processing` row yields `error7d: 1, success7d: 0`. Cron probe, through the real Worker: a 45-minute `processing` row is counted. **No repo test covers this behaviourally — see F4** |
| 10 | A `processing` claim 5 minutes old counts as neither | PASS | Same probes: the 5-minute row is excluded from both totals. **No repo test — see F4** |
| 11 | An ops-triggered run is excluded from both counts and the chart | PASS | Cron probe seeded a `triggered_by='ops'` completed claim alongside two `upload` ones and read `success7d: 2`, not 3. `worker/routes/ops.ts:2154` passes `"ops"`; `worker/routes/parse.ts:47` keeps the `'upload'` default; the two `INSERT INTO ai_job_claim` statements in `worker/routes/files.ts` are customer upload paths and take the column default. **No repo test — see F4** |
| 12 | No parses at all → cards show `0`, chart shows an empty state | PASS | Tester probe: zero rows produce seven all-zero buckets. Playwright "an all-zero window renders an explicit empty chart state": the sentence renders, seven `.att-col` remain, zero `.att-bar` |
| 13 | Seven day-buckets whose sums equal the two count cards | PASS in production, **breaks off UTC** | Tester browser probe summed the rendered bar numbers: 20 successes and 3 errors, matching both cards exactly. But the sum-equals-cards invariant depends on the host clock — **F1** |
| 14 | A zero day is a zero bucket, not a missing day | PASS | The ready snapshot carries `2026-09-01: 0/0` and Playwright counts seven `.att-col`; the all-zero test counts seven with no bars |
| 15 | Not red → bubble count 0, nothing drawn | PASS | Cron probe returned `notificationCount: 0` with money unavailable. Playwright "bell: no badge when notificationCount is 0" asserts `.ops2-bell__badge` has count 0 |
| 16 | Balance below the floor → bubble shows `1` | PASS | "notificationCount: one source, sums to 1 when the stored snapshot is red". Tester browser probe: the balance card carries `data-state="red"` and the copy "Below the $5.00 floor", while the cap card does not redden |
| 17 | Cap over the ceiling → `1`; both conditions → still `1` | PASS | "evaluateRed: a single boolean true when both the floor and ceiling trip". Tester browser probe with both flags true: two red cards, `.ops2-bell__badge` reads `1` |
| 18 | Tapping the bubble navigates to Attention | PASS | Playwright "bell: clicking it lands on /attention" navigates from `/projects` and asserts the URL and the `Attention` heading |
| 19 | Unavailable money never produces a red | PASS | Cron probe: money unavailable, `notificationCount: 0`. Tester browser probe: both cards `data-state="unavailable"`, no badge. Mutation-checked: rewriting the guard so an unavailable balance can redden fails "evaluateRed: false when money unavailable" |
| 20 | A second notification source appends without changing the bubble or the aggregator | PASS | `NOTIFICATION_SOURCES` has one entry; `countFrom` is `Promise.allSettled` plus a sum with no source-specific branching. "one failing source cannot hide every other notification" injects two arbitrary sources and asserts the surviving one still contributes |
| 21 | The existing `*/10` cron writes one snapshot; no new trigger | PASS | Cron probe fired `/cdn-cgi/handler/scheduled` on the real Worker: before it the route answered `{"snapshot":null,…}`, after it the full snapshot. `git diff a76b8119 HEAD -- wrangler.jsonc` touches no `crons` entry |
| 22 | Two ops2 pages → no Cloudflare call, both read the same KV snapshot | PASS | Cron probe: two consecutive route calls returned byte-identical payloads with the same `takenAt` |
| 23 | Signed-out visitor → 401/403, no values | PASS | Abuse probe, real Worker: `403 {"error":"forbidden"}`; body scanned for `balance`, `spend`, `cap`, `count`, `snapshot`, `notificationCount`, `Bearer`, the token and the account id — none present |
| 24 | Signed-in Customer → 403, no monitoring data | PASS | Abuse probe: customer OTP session → `403 {"error":"forbidden"}`, same leakage scan clean |
| 25 | Manufacturer partner → 403, no monitoring data | PASS | Abuse probe: `partner@amjtradedirect.test` ops session → `403 {"error":"forbidden"}`, scan clean |
| 26 | The payload carries no token, account id or gateway credential | PASS | Abuse probe ran the Worker with a real-shaped `CF_MONITORING_TOKEN` and the production `CF_ACCOUNT_ID`, then scanned the staff 200 body for both plus `Bearer`, `authorization`, `CF_MONITORING_TOKEN` and `AI_GATEWAY_ID` — none present. Cron probe repeated the scan on a populated snapshot |
| 27 | A logged Cloudflare failure carries no token and no Authorization value | **FAIL** | **F2** — `logFailure` prints an arbitrary upstream `err.message` verbatim; the `pathSuffix` sanitiser never runs on the transport-failure path |
| 28 | The ops2 `/attention` route is refused by the same staff guard, no new auth path | PASS | Abuse probe: a customer's `/api/ops/monitoring` and the sibling `/api/ops/summary` both answer 403 through `resolveStaff`. A forged request carrying `cf-access-authenticated-user-email: <staff>`, a bogus `Cf-Access-Jwt-Assertion` and invented session cookies also answered 403 |

### Abuse-case execution, verbatim

Run against `wrangler dev` with `CF_MONITORING_TOKEN=tester-secret-token-ABC123`
and the production `CF_ACCOUNT_ID`:

```
PASS  C23 anon -> 401/403 (got 403)                        body={"error":"forbidden"}
PASS  C23 anon body carries no monitoring or credential values
PASS  C24 customer -> 403 (got 403)                        body={"error":"forbidden"}
PASS  C24 customer body carries no monitoring data
PASS  C25 manufacturer -> 403 (got 403)                    body={"error":"forbidden"}
PASS  C25 manufacturer body carries no monitoring data
PASS  TAMPER forged Access header + session cookie -> 403 (got 403)
PASS  staff -> 200 (got 200)                               body={"snapshot":null,"notificationCount":0}
PASS  C26 staff payload carries no token, account id or gateway credential
PASS  C28 the page's own data call for a customer -> 403 (got 403)
PASS  C28 sibling ops guard on /api/ops/summary -> 403
0 FAILING of 12
```

These denials are not vacuous. Mutating the route's guard from `resolveStaff` to
`resolveUser` — the exact regression round 2 fixed — reruns the same probe as:

```
FAIL  C24 customer -> 403 (got 200)
FAIL  C24 customer body carries no monitoring data
FAIL  C25 manufacturer -> 403 (got 200)
FAIL  C25 manufacturer body carries no monitoring data
FAIL  C28 the page's own data call for a customer -> 403 (got 200)
5 FAILING of 12
```

### Cron end-to-end, verbatim

Six claims seeded into a migrated local D1 (2 completed uploads, 1 failed upload,
1 `processing` at 45 minutes, 1 `processing` at 5 minutes, 1 completed
`triggered_by='ops'`), then `GET /cdn-cgi/handler/scheduled`:

```
PASS  before the cron: staff 200 with snapshot null
PASS  scheduled handler fired (200)
PASS  C21 the cron wrote a snapshot the route now serves
PASS  C11/C21 success7d == 2 (ops row excluded) - got 2
PASS  C9/C11 error7d == 2 (1 failed + 1 stuck 45m; 5m one excluded) - got 2
PASS  C13 bucket sums == cards - buckets {"s":2,"e":2} vs cards 2/2
PASS  C13 seven buckets - got 7
PASS  C4 money unavailable without a token - reason token_missing
PASS  C19 unavailable money -> bubble 0 - got 0
PASS  C26 no credential in the payload
PASS  C22 two loads read the same snapshot
PASS  C22 neither load re-derived the figures
0 FAILING of 13
```

### Guards that were mutation-tested

| Guard | Mutation | Caught by |
|---|---|---|
| `worker/routes/ops.ts:365` `resolveStaff` | changed to `resolveUser` | the `V-F1` test **and** the live abuse probe (customer and manufacturer both reach 200) |
| `worker/lib/monitoring.ts:12` `triggered_by = 'upload'` | filter deleted | "D1 count query matches design §3.2 verbatim" — but only as a string match, not as behaviour (**F4**) |
| `src/data/monitoring.ts` `capBreached` zero-cap guard | `if (money.capUsd <= 0) return true;` deleted | `V-F3` |
| `src/data/monitoring.ts` `evaluateRedFlags` availability guard | inverted so an unavailable balance can redden | "evaluateRed: false when money unavailable" |

Melbourne DST was checked separately across both 2026 switches: `parseWindowStart`
lands on exactly 00:00 Melbourne and the seven bucket keys stay consecutive
calendar dates on every date tested, including 2027-04-04's 25-hour day.

---

## Findings

### F1 — a D1 timestamp is read as local time, so the chart draws parses on the wrong day (medium)

`src/data/monitoring.ts:178`

D1 writes `ai_job_claim.updated_at` with `datetime('now')`, which is UTC in the
format `YYYY-MM-DD HH:MM:SS` — a space separator and **no timezone designator**.
`assembleParseCounts` reads it back with `new Date(row.updatedAt)`. For that
shape V8 falls through to its implementation-defined parser, which interprets
the string as **local** time. Every bucket decision is therefore offset by the
host's UTC offset.

Two consequences, and the second is the one that matters:

1. The chart draws a parse on the wrong calendar day.
2. Near the oldest bucket's edge the row lands in **no** bucket at all while
   still counting toward the card total, so criterion 13's "the sum of the
   buckets equals the two count cards" breaks outright — the error card says 1
   and the chart beside it shows nothing.

Reproduced through the real cron in `wrangler dev` on a UTC+10 host:

```
host TZ                        : Australia/Sydney
D1 stored updated_at (UTC)     : 2026-09-05 17:07:35
correct Melbourne calendar day : 2026-09-06
bucket the WORKER chose        : 2026-09-05
MISMATCH - the row belongs on 2026-09-06 but was drawn on 2026-09-05
```

Failing tests attached:

```
npm run test:ai-monitoring
X TESTER-F1 assembleParseCounts: a D1 stamp is UTC, whatever the host clock says
  AssertionError: the row belongs on the Melbourne day of its UTC stamp
  + actual   '2026-09-05'
  - expected '2026-09-06'
X TESTER-F2 assembleParseCounts: every row inside the window lands in a bucket (criterion 13)
```

Both pass under `TZ=UTC npm run test:ai-monitoring` and fail under
`TZ=Australia/Melbourne npm run test:ai-monitoring`. They assert against the
same instant the row records rather than against the machine, so they stay true
in any timezone and fail only if the parse is wrong.

`DEBT.md` already carries this as `[low] F7 … correct in prod (UTC runtime),
latent portability debt`. Raising it to medium on new evidence: this is not a
fixture problem, it is the criterion-13 invariant failing, it is visible in every
local dev and E2E environment on a non-UTC machine, and the module's own comment
("in production there is nothing outside") is true only by an unstated property
of the runtime. The fix is one line —
`new Date(row.updatedAt.replace(" ", "T") + "Z")` — and it makes the module
correct rather than lucky.

### F2 — criterion 27 is not met: a transport failure logs whatever the fetch layer wrote (medium)

`worker/lib/monitoring.ts:114-118`, reached from `:125` and `:174`

`pathSuffix` is the sanitiser written for this criterion, but it only ever runs
on the `status N for <suffix>` Error that `cfGet` constructs itself. A transport
failure — connection refused, DNS, TLS, the abort from `AbortSignal.timeout` —
arrives as an Error whose message the fetch implementation wrote, and
`logFailure` prints that message verbatim. Nothing in this module bounds what a
log line can contain on the exact path the criterion names.

Reproduced with the module's real code and a fetch that echoes its own request,
which is what a proxying or instrumented transport does:

```
LOG: ai-parse monitoring: CF fetch failed for connect ECONNREFUSED for
     https://api.cloudflare.com/client/v4/accounts/c3834ff3509fa7cb4c9769a6dee6c2d8/ai-gateway/billing/credit-balance
     headers={"Authorization":"Bearer cf-tok-SUPERSECRET-9f3a"}

C27 token in a log line     : LEAKED
C27 Authorization in a line : LEAKED
```

Failing test attached: `TESTER-F3 fetchMoneyNumbers: a transport failure logs a
bounded path, never the error's own text (criterion 27)` in
`scripts/tests/ai-monitoring.test.mjs`, reproduced with
`npm run test:ai-monitoring`.

To be exact about the live risk: neither `undici` nor `workerd` puts request
headers into that message today, so no token is being written to Workers logs
right now. What is being written is the full request URL, which `DEBT.md` F6
already noted. The finding is that a stated security acceptance criterion is
enforced by a sanitiser that the failure path bypasses, and the module has no
control over the string it publishes. Log the suffix of the URL that was
*attempted* instead of the error's message, and the criterion becomes
structurally true rather than true-by-inspection-of-someone-else's-code.

### F3 — the gateway scope check fails open, and it fails toward a false red (medium)

`worker/lib/monitoring.ts:144`

Round 3 fixed "the cap percentage compared incompatible scope" by refusing to
publish a percentage when more than one gateway shares the account, on the
stated principle that "unknown beats confidently wrong on a number that raises
alarms". The check is:

```ts
if (Array.isArray(gateways) && gateways.length > 1) {
  return { available: false, reason: "spend_not_attributable" };
}
```

An answer that is **not** an array skips the guard entirely — a paginated object,
a shape change, or `result: null` on the soft-failure 200 Cloudflare returns
with `success: false`. The percentage is then published from account-wide spend
it could not attribute. Account spend is always at least one gateway's spend, so
the error is always toward a **false red**: the alarm this feature exists to make
trustworthy.

Reproduced against the real module:

```
gateways as a paginated object -> {"available":true,"billedSpendUsd":19,"capUsd":20,"capSource":"gateway","windowDays":30}
  PUBLISHED a 95% cap figure from account-wide spend it could not attribute
gateways result:null           -> {"available":true,"billedSpendUsd":19,"capUsd":20,...}
```

Failing test attached: `TESTER-F4 fetchMoneyNumbers: a gateway list that is not
an array is unknown scope, not one gateway`, reproduced with
`npm run test:ai-monitoring`. The fix is to invert the condition —
`if (!Array.isArray(gateways) || gateways.length > 1)`.

### F4 — criteria 9, 10 and 11 are guarded only by a string match on the SQL (low)

`scripts/tests/ai-monitoring.test.mjs:261-291`

The three counting rules that define what a parse *is* — a 30-minute
`processing` row is an error, a 5-minute one is neither, an `ops`-triggered row
is neither — have no test that executes them. Their only protection is
`assert.match(calls[0].sql, /triggered_by = 'upload'/)` and a sibling regex on
the `-30 minutes` clause, inside a test that feeds a fake DB returning
`results: []`.

The behaviour is correct: this stage proved all three against the module's real
SQL over `node:sqlite`, and criteria 9 and 11 again through the real cron in
`wrangler dev`. But a regex on a query string cannot tell a working predicate
from a broken one, and this suite already demonstrates the pattern of executing
SQL properly (the `sqliteD1` helper at line 1021). Three rows added to that
harness would close it. Deferred to `DEBT.md` rather than costing a session,
since nothing is currently wrong.

### F5 — the phone Attention tab's count is invisible to a screen reader (low)

`src/ops2/Ops2App.tsx:281-283`

The desk bell earns its accessible name properly —
`aria-label={"Attention — 1 item"}`. The phone tab does not: the badge span is
`aria-hidden="true"`, the icon is `aria-hidden`, and `<IonLabel>` carries only
`"Attention"`. A screen-reader user on the phone — the surface where Attention is
a permanent tab and the bell does not exist — gets no signal that anything is
waiting. `04-build.md` argues the two badges share a data source, which is true
and is why one browser test covers both; it does not make the two accessible
names equivalent. Mirror the bell's pattern onto the tab button.

### F6 — an unrelated cron job's failure behaviour changed inside this feature, untested (low)

`worker/index.ts:346`

`drainLearningOutbox` was `await`ed bare and now carries a `.catch`. The change
is defensible on its own terms — it is the rule the two lines below it already
state — but it is a behaviour change to the learning outbox, in a feature whose
spec §3 scopes out everything but monitoring, and no test asserts either the old
or the new behaviour (`grep -rn "drainLearningOutbox" scripts/tests/` returns
nothing). Either give it a test or lift it out into its own change.

### F7 — a zero or exceeded cap renders a self-contradicting note (cosmetic)

`src/ops2/attention/AttentionPage.tsx:225-227`

`capBreached` deliberately treats `capUsd <= 0` as red, but `capPct` guards the
same division with `budget.capUsd > 0 ? … : 0`. A zero cap therefore renders a
red card whose note reads `⚠ 0% of the $0.00 gateway cap used`. Separately,
spend beyond the cap renders headroom as `$-5.00` — a minus sign after the
dollar sign. Both are rare and neither misleads about the red state itself.

### F8 — an account-level cap with several gateways reports unavailable although it is attributable (low)

`worker/lib/monitoring.ts:144`

The `length > 1` refusal is applied before the cap's source is considered. When
`fetchCap` fell back to the account endpoint, the numerator (account-wide usage)
and the denominator (the account-wide cap) describe exactly the same scope, and
the percentage is sound — yet the budget still reports `spend_not_attributable`.
A correct number is suppressed. The check belongs under `capSource === "gateway"`.

---

## What was checked and found sound

Recorded so the next round does not re-derive it:

- **Migration 0064** is correctly numbered after 0063, is a pure additive
  `ADD COLUMN` with a default, and nothing `REFERENCES ai_job_claim` — verified
  by grep, not taken from the comment. No table rebuild, so the cascade hazard
  that once cost production rows is not in play.
- **The `triggered_by` threading is complete.** `retryCurrentAiExtraction`'s
  in-place reclaim carries no `triggered_by` reference (asserted by
  `ai-jobs.test.mjs`), so an ops retry of a customer's document stays a customer
  parse; only the fall-through enqueue is tagged `'ops'`. The two
  `INSERT INTO ai_job_claim` statements in `worker/routes/files.ts` — the
  highest-volume path in production — take the column default `'upload'`, which
  is correct.
- **The SQL executes as intended against real SQLite.** `datetime(?)` parses the
  ISO-with-`Z` bound argument to `YYYY-MM-DD HH:MM:SS`, matching the stored
  column format, so the window comparison is a valid string comparison and not a
  silent `NULL` that would zero every count. `superseded` and `scheduled` claims
  are counted as neither.
- **`parseWindowStart` and the bucket keys are DST-correct** at both 2026
  Melbourne switches, including 2027-04-04's 25-hour day.
- **The snapshot parser is a whitelist.** It rebuilds field by field, so a stored
  value carrying extra fields cannot push them to the client, and a `takenAt`
  that is not a parseable instant is rejected at the boundary rather than
  throwing inside `Intl.DateTimeFormat` on the page.
- **`CF_ACCOUNT_ID` in `wrangler.jsonc` is not a new disclosure** — the same
  account hash was already committed at line 77 as the container image's registry
  namespace.
- **The client never re-derives a threshold.** `redBalance` and `redCap` are
  server-evaluated; the page's `data-state` expressions contain no numeric
  comparison, and `capBreached` is the single place the ceiling question is
  answered.
- **The reaper runs before the snapshot** inside `scheduled()`, so a claim it
  reschedules or fails is already in its new state when the counts are taken;
  there is no double count within one snapshot.

## Re-verification, when the fixes land

`TESTER-F1` through `TESTER-F4` must go green with no change to their
assertions — they pin behaviour, not implementation. Then, from scratch:
`npm run typecheck:gate`, `npm run test:ai-monitoring`, `npm run test:ai-jobs`,
`npm run test:ops2`, `npm run test:api`, and
`ABR_PORT=8799 npx playwright test scripts/tests/web/ops2-attention.spec.ts`.
The cron and abuse probes will be re-run against the fixed tree, including the
`resolveStaff` mutation check, so a fix that quietly loosens the guard is caught
in the same pass.
