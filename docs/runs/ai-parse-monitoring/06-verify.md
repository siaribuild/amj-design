# ai-parse-monitoring — independent verification (round 6)

**Verdict: PASS** — all twenty-eight acceptance criteria met and reproduced from
scratch; ten findings, none above **low**.

Round 5's two medium findings (an unreadable threshold var silently disabling the
only alarm; the phone Attention tab's count invisible to a screen reader) are
genuinely fixed and were re-proved against the real Worker and real Chrome rather
than taken from `4593e994`'s commit message. What remains is the tail of low
findings rounds 4 and 5 raised: they were neither fixed nor written to `DEBT.md`,
which is the one process failure this round records. Three of the ten are new.

Nothing in `04-build.md` was taken on trust. Every row below names the command
that produced it. No implementation code was changed by this stage — eight source
mutations were used to prove guards and all eight were reverted; `git status` at
the end of the run shows only `docs/runs/ai-parse-monitoring/run.json`, which the
conductor writes.

Verified at `4593e994` on `merge/ai-parse-monitoring`; feature diff taken against
merge-base `a76b8119`. Round 5's report is in git history at `4593e994^`.

---

## Gates

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck:gate` | **PASS** — `✓ no fatal type errors (61 non-fatal remain)` |
| Pure core + IO shell | `npm run test:ai-monitoring` | **51/51 pass** |
| Same suite, Melbourne clock | `TZ=Australia/Melbourne npm run test:ai-monitoring` | **51/51 pass** |
| Same suite, US Pacific clock | `TZ=America/Los_Angeles npm run test:ai-monitoring` | **51/51 pass** |
| Claim enqueue and retry | `npm run test:ai-jobs` | **15/15 pass** |
| Worker API | `npm run test:api` | **80/80 pass** |
| Ops2 console | `npm run test:ops2` | **126/126 pass** |
| Browser | `npx playwright test scripts/tests/web/ops2-attention.spec.ts` | **25/25 pass** (1.3m) |
| Everything | `npm test` | **1203 pure + 350 heavy, 0 fail, `EXIT=0`** |

Live probes written for this round (throwaway, `.codex-tmp/tester/`, untracked):

| Probe | What it drives |
|---|---|
| `probe.mjs` | a fresh local D1 + 13 seeded `ai_job_claim` rows covering every counting case, fires the real `*/10` cron through `/__scheduled`, reads the route as staff |
| `probe2.mjs` | the four abuse cases against the real Worker, plus a forged Access header and a forged session cookie |
| `probe3.mjs` | the Worker with a sentinel `CF_MONITORING_TOKEN` against the real Cloudflare API (which rejects it) — payload and `wrangler.log` scanned for the token and the account id |
| `probe4.mjs` | eleven crafted KV snapshots (red, boundary, unavailable, malformed, secret-smuggling) read back through the route |
| `probe5.mjs` | absent / empty / typo'd / explicit threshold vars, each in its own `wrangler dev` |
| `red.mjs` | real Chrome: balance-red, cap-red, both-red and healthy snapshots rendered by the shipped page |
| `dst.mjs` | the bundled pure module across both Melbourne DST switches and the window edge |

---

## Acceptance criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Credit balance renders `$12.34`; no Cloudflare call during page load | PASS | Playwright "ready snapshot renders cards, as-at, and 7 chart columns" asserts `$12.34`. No-call half proved live: `probe3.mjs` ran the Worker with a real token against the real Cloudflare API — `wrangler.log` carries exactly **two** `ai-parse monitoring: CF fetch failed for …` lines, both from the cron, none from the staff page loads that followed |
| 2 | Cap card shows headroom **and** the cap, neither hardcoded | PASS | `red.mjs`, real Chrome, `billedSpendUsd:1, capUsd:20` → `CAP REMAINING \| $19.00 \| $1.00 of the $20.00 gateway cap used (5%)`; at `19/20` → `$1.00` and `⚠ 95% of the $20.00 gateway cap used`. Both figures move with the snapshot |
| 3 | Gateway-cap failure falls back to the account endpoint; the snapshot records the source | PASS | `ai-monitoring.test.mjs` "the account fallback converts cents to dollars" + "decodes the documented Cloudflare response shapes". Independently corroborated this round against the official Cloudflare SDK types: `spend_limits.rules[].{limit, limitType:'cost', window, enabled, model, provider, metadata}`, and `spending_limit.config.amount` in **cents (min 100)**, documented on the deprecated create sibling. The adapter matches Cloudflare field for field |
| 4 | No API token → money unavailable (not zero, not red); counts and chart still render | PASS | `probe.mjs`, real cron, no token: both halves `{"available":false,"reason":"token_missing"}` with `success7d:4, error7d:3` from D1 and `notificationCount:0`. Playwright "money unavailable shows an unavailable state, not zero…" asserts the card is not `$0.00` while the count card still reads `20` |
| 5 | Non-2xx or timeout → counts still refreshed, money unavailable, failure logged, page still loads | PASS | `probe3.mjs`, real Cloudflare rejecting a sentinel token: `{"available":false,"reason":"fetch_failed"}` on both halves, `success7d:4, error7d:3` unchanged, two bounded log lines. Playwright "a 500 shows the error panel with a retry button" |
| 6 | A stale snapshot states its age on every card | PASS | Playwright "stale snapshot renders the stale sentence and per-card as-at stamps" — `.att-asat` contains "The 10-minute job may have stopped." and all four `.att-card__stamp` are visible at `takenAt` −45m |
| 7 | N successes and M errors render on the two cards | PASS | `probe.mjs` seeded 4 countable successes and 3 countable errors among 13 rows; the route returned `success7d: 4, error7d: 3` |
| 8 | A parse retried three times before succeeding is one success, zero errors | PASS | `probe.mjs` row `attempts=3, status='completed'` counts once. `ai-jobs.test.mjs` "an ops retry reclaims in place and leaves the claim's origin alone" asserts the reclaim `UPDATE` carries no `triggered_by`, so a staff retry of a customer document stays one customer parse |
| 9 | A `processing` claim 31 minutes old counts as one error | PASS | `probe.mjs` row at `updated_at = now-31 minutes` is inside `error7d: 3`. Cross-checked against the real lease: 135 s per lease, 600 s job deadline at most (`worker/lib/ai/jobs.ts:49`), so no healthy in-flight parse can reach 30 minutes. **No executing repo test — F1** |
| 10 | A `processing` claim 5 minutes old counts as neither | PASS | Same probe: the 5-minute row appears in neither total (4/3, not 5/3 or 4/4). **No executing repo test — F1** |
| 11 | An ops-triggered run is excluded from both counts and the chart | PASS | `probe.mjs` seeded one `triggered_by='ops'` completed and one `'ops'` failed row; totals stayed 4/3. `worker/routes/ops.ts:2154` is the only `"ops"` caller; `worker/routes/parse.ts:47` takes the default and **both** `INSERT INTO ai_job_claim` statements in `worker/routes/files.ts` (the production upload path) rely on the column DEFAULT `'upload'` — verified by reading them, not by the migration comment |
| 12 | No parses at all → cards `0`, chart an empty state | PASS | Playwright "an all-zero window renders an explicit empty chart state": the sentence, seven `.att-col`, zero `.att-bar`. `dst.mjs` with zero rows returns seven all-zero buckets |
| 13 | Seven day-buckets whose sums equal the two cards | PASS | `probe.mjs`: buckets `1+3 = 4` successes and `1+2 = 3` errors against cards `4/3`. `dst.mjs` confirms the SQL window boundary and the earliest bucket are the same instant — a row 1 minute after `parseWindowStart` is bucketed, one before it falls outside the query's `updated_at >= datetime(?)` |
| 14 | A zero day is a zero bucket, not a missing day | PASS | `probe.mjs` returned seven distinct consecutive Melbourne dates, four of them all-zero. `dst.mjs` across both 2026 DST switches (`2026-10-04`, `2026-04-05`): seven unique consecutive dates every time, window start `00:00` Melbourne on the oldest |
| 15 | Not red → bubble 0, nothing drawn | PASS | `probe4.mjs` healthy snapshot → `notificationCount:0`; `red.mjs` healthy → `.ops2-bell__badge` absent. Playwright "bell: no badge when notificationCount is 0" |
| 16 | Balance below the floor → bubble `1` | PASS | `probe4.mjs` `$4.99` → `redBalance=true redCap=false count=1`; `$5.00` → `count=0`. `red.mjs`: balance card `data-state="red"`, note `⚠ Below the $5.00 floor`, cap card **not** reddened, badge `1` |
| 17 | Cap over the ceiling → `1`; both conditions → still `1` | PASS | `probe4.mjs` `17/20` (85%) → `redCap=true count=1`; `16/20` (exactly 80%) → `count=0`; both breached → `redBalance=true redCap=true count=`**1**. `red.mjs` renders two red cards with one badge |
| 18 | Tapping the bubble navigates to Attention | PASS | Playwright "bell: clicking it lands on /attention" navigates from `/projects` and asserts the URL and the `Attention` heading |
| 19 | Unavailable money never produces a red | PASS | `probe.mjs` (`token_missing`) and `probe3.mjs` (`fetch_failed`) both → `redBalance:false redCap:false notificationCount:0`. `probe4.mjs` unavailable snapshot → `count=0` |
| 20 | A second source appends without changing the bubble or the aggregator | PASS | `NOTIFICATION_SOURCES` holds one entry; `countFrom` is `Promise.allSettled` + a sum with no source-specific branch (`worker/lib/monitoring.ts:255-268`). "one failing source cannot hide every other notification" injects two arbitrary sources and asserts the surviving one still contributes |
| 21 | The existing `*/10` cron writes one snapshot; no new trigger | PASS | `probe.mjs`: before `/__scheduled` the route answered `{"snapshot":null,"notificationCount":0}`; after it, the full snapshot. `git diff a76b8119...HEAD -- wrangler.jsonc` leaves `"crons": ["*/10 * * * *"]` untouched |
| 22 | Two ops2 pages → no Cloudflare call, both read the same KV snapshot | PASS | `probe3.mjs`: two staff loads after the cron, and the log gained no third CF line. The route's whole path is `monitoringPayload → readMonitoringSnapshot → KV.get` — one read per call, no `fetch` anywhere in it |
| 23 | Signed-out visitor → 401/403, no values | PASS | `probe2.mjs`, real Worker: `403 {"error":"forbidden"}` — that is the entire body |
| 24 | Signed-in Customer → 403, no monitoring data | PASS | `probe2.mjs`, customer OTP session via `/api/auth`: `403 {"error":"forbidden"}` |
| 25 | Manufacturer partner → 403, no monitoring data | PASS | `probe2.mjs`, `partner@amjtradedirect.test` signed in through `/api/ops/auth` (internal user, role `manufacturer`): `403 {"error":"forbidden"}` |
| 26 | The payload carries no token, account id or gateway credential | PASS | `probe3.mjs` ran with `CF_MONITORING_TOKEN=TESTER-SENTINEL-TOKEN-abc123` and the production `CF_ACCOUNT_ID`: `TOKEN IN PAYLOAD? false`, `ACCOUNT IN PAYLOAD? false`. `probe4.mjs` stored a KV snapshot carrying `cfToken:"SUPER-SECRET"` and `accountId:"c3834…"`; the served payload's keys were exactly `takenAt,money,days,success7d,error7d,redBalance,redCap,floorUsd` — both smuggled fields gone |
| 27 | A logged Cloudflare failure carries no token, no Authorization value | PASS | `probe3.mjs` → `wrangler.log:11041` `ai-parse monitoring: CF fetch failed for /ai-gateway/billing/credit-balance`, `:11058` the same for `/spending-limit`. `grep -c "TESTER-SENTINEL-TOKEN-abc123" wrangler.log` → **0**; the account id likewise absent |
| 28 | `/attention` is refused by the same staff guard, no new auth path | PASS | The route calls `resolveStaff`, the guard 41 siblings use (`worker/routes/ops.ts:365`). `probe2.mjs`: a request forging `Cf-Access-Jwt-Assertion: x.y.z` + `Cf-Access-Authenticated-User-Email: ged@openframe.com.au` → **403**; a forged `apertly_session` cookie → **403**. Playwright test 13: a real customer's page load lands on the unauthorised panel, not zero counts |

### Abuse cases, verbatim

`node .codex-tmp/tester/probe2.mjs` — real Worker, real D1/KV, no stubs:

```
ANON            403 {"error":"forbidden"}
CUSTOMER        403 {"error":"forbidden"}
MANUFACTURER    403 {"error":"forbidden"}
FORGED-ACCESS   403 {"error":"forbidden"}
TAMPERED-COOKIE 403 {"error":"forbidden"}
```

Each denial body is the whole response: no `snapshot`, no `notificationCount`, no
balance, spend, cap or count value in any of them.

### Cron end-to-end, verbatim

Thirteen claims seeded (3 completed uploads today, 1 completed 3 days back, 1
failed today, 1 failed 2 days back, 1 `processing` at 31 minutes, 1 `processing`
at 5 minutes, 1 completed `'ops'`, 1 failed `'ops'`, 1 completed 9 days back, 1
`superseded`, 1 `scheduled`), then `GET /__scheduled?cron=*/10+*+*+*+*`:

```
PRE-CRON  {"snapshot":null,"notificationCount":0}
SCHEDULED 200 Ran scheduled event
PAYLOAD   days: 08-31 0/0 · 09-01 0/0 · 09-02 0/0 · 09-03 1/0 · 09-04 0/1 ·
                09-05 0/0 · 09-06 3/2
          success7d: 4   error7d: 3   redBalance/redCap: false   floorUsd: 5
```

4 = the three completed uploads today plus the one three days back; the `'ops'`
completion, the 9-day-old row, the `superseded` and the `scheduled` rows are all
absent. 3 = two `failed` uploads plus the 31-minute `processing` row; the 5-minute
one is absent. Buckets sum to the cards.

### Red evaluation, verbatim

`node .codex-tmp/tester/probe4.mjs` — crafted KV snapshots read back through the
real route:

```
healthy (bal 12.34, spend 8 of 20)     count=0 redBalance=false redCap=false
balance below floor (4.99)             count=1 redBalance=true  redCap=false
cap over ceiling (17 of 20 = 85%)      count=1 redBalance=false redCap=true
BOTH breached                          count=1 redBalance=true  redCap=true
exactly at ceiling (16 of 20 = 80%)    count=0 redBalance=false redCap=false
exactly at floor (5.00)                count=0 redBalance=false redCap=false
zero cap, zero spend                   count=1 redBalance=false redCap=true
money unavailable                      count=0 redBalance=false redCap=false
smuggled secret field                  keys=takenAt,money,days,success7d,error7d,redBalance,redCap,floorUsd
malformed snapshot (truncated json)    status=200 snapshot=null   (no 500)
days array of 5                        status=200 snapshot=null   (no 500)
```

and in real Chrome (`node .codex-tmp/tester/red.mjs`), the same states rendered by
the shipped page:

```
balance red only  balanceState=red  "$2.00 | ⚠ Below the $5.00 floor"                capState=null bell=1
cap red only      balanceState=null capState=red "⚠ 95% of the $20.00 gateway cap used"            bell=1
both red          balanceState=red  capState=red                                                   bell=1
healthy           balanceState=null capState=null                                                  bell=(none)
```

### Round-5 findings, re-verified from scratch

| Round-5 finding | Status |
|---|---|
| F1 (medium) — an unreadable threshold var silently disables the only alarm and blanks the page | **FIXED.** `threshold()` (`worker/lib/monitoring.ts:236`) requires a non-empty, finite value. `probe5.mjs` ran four Workers against one snapshot that is red under any correctly-read threshold: vars absent → `redBalance=true redCap=true bubble=1 floorUsd=5`; vars **empty** (`--var NAME:`) → identical; vars **typo'd** (`5 USD` / `80%`) → identical; explicit `10`/`50` → `floorUsd=10`, still red. No `NaN`, no silent no-alarm, no blanked panel |
| F2 (medium) — the phone Attention tab's count is invisible to a screen reader | **FIXED.** `Ops2App.tsx:285-298` gives the tab a name-from-content span (`"1 item waiting"`) beside the `aria-hidden` badge; the desk bell keeps `aria-label="Attention — 1 item"`. Playwright "bubble: the phone attention tab announces its count to assistive tech" passes at 390×844 with its assertion unchanged |
| F3 (low) — criteria 9/10/11 guarded only by a string match | **OPEN** — re-raised as F1 below |
| F4 (low) — dead `resolveUser` import | **OPEN** — re-raised as F4 |
| F5 (low) — `drainLearningOutbox` behaviour change, untested | **OPEN** — re-raised as F5 |
| F6 (low) — an account-source cap suppressed although attributable | **OPEN** — re-raised as F6 |
| F7 (cosmetic) — zero/exceeded cap renders a self-contradicting note | **OPEN** — re-raised as F7 |
| F8 (low) — the count query is unbounded | **OPEN** — re-raised as F8 |
| — | **None of the six open lows reached `DEBT.md`** — F9 |

### Guards mutation-tested this round

Each mutation was applied to the shipped source, the suite run, then reverted.

| Guard | Mutation | Caught? |
|---|---|---|
| `worker/lib/monitoring.ts:12` `triggered_by = 'upload'` | → `IN ('upload','ops')` | **yes** — `test:ai-monitoring` 50 pass / 1 fail |
| `worker/lib/monitoring.ts:16` `'-30 minutes'` | → `'-300 minutes'` | **yes** — 50 pass / 1 fail |
| `src/data/monitoring.ts` `capBreached` zero-cap guard | `return true` → `return false` | **yes** — 49 pass / 2 fail |
| `src/data/monitoring.ts` `parseMonitoringSnapshot` rebuild | → `return body` (passthrough) | **yes** — 50 pass / 1 fail |
| `worker/routes/ops.ts` `resolveStaff` | → `resolveUser` | **yes** — `V-F1` reads the route body's guard from source |
| `worker/lib/monitoring.ts` `logFailure` | → log `String(err)` | equivalent mutant — `cfGet` already discards the transport's own message, so nothing unbounded exists to leak. Guard is defence in depth, not the only barrier |
| `src/data/monitoring.ts` floor `<` | → `<=` | **NO** — 51/51 still pass (F2) |
| `src/data/monitoring.ts` ceiling `>` | → `>=` | **NO** — 51/51 still pass (F2) |
| `PARSE_OUTCOME_SQL` error branch | `+ OR status = 'scheduled'` | **NO** — 51/51 still pass (F1) |

---

## Findings

### F1 — the counting predicate is still guarded only by a string match on the SQL (low)

`scripts/tests/ai-monitoring.test.mjs:261-291` · carried from rounds 4 and 5

The three rules that define what a parse *is* — a 30-minute `processing` row is an
error, a 5-minute one is neither, an `ops`-triggered row is neither — have no test
that executes them. Their only protection is `assert.match(calls[0].sql, …)` inside
a test whose fake DB returns `results: []`. A predicate change that keeps the
matched text passes the whole suite:

```
python -c "p='worker/lib/monitoring.ts'; s=open(p,encoding='utf-8').read(); a=\"       OR status = 'failed'\"; open(p,'w',encoding='utf-8').write(s.replace(a, a+chr(10)+\"       OR status = 'scheduled'\",1))"
npm run test:ai-monitoring
# ℹ pass 51   ℹ fail 0
```

That mutation makes every queued-but-not-yet-started parse count as an **error** on
the card staff are meant to act on, and nothing goes red. The behaviour as shipped
is correct — proved end-to-end twice now, with different fixtures — but the suite
cannot tell a working predicate from a broken one. The harness already exists
(`sqliteD1`, line 1021, used by three criterion-8 tests); three more rows close it.

### F2 — neither red threshold's boundary is pinned by a test (low, new)

`src/data/monitoring.ts:214` (`capBreached`) and `:236` (`evaluateRedFlags`)

The spec says *below* the floor and *above* the ceiling. Both comparisons are
correct as shipped — `probe4.mjs` confirms exactly `$5.00` and exactly 80% are not
red — but either can be loosened without a single test failing:

```
# floor  <  ->  <=      and, separately,   ceilingPct  >  ->  >=
npm run test:ai-monitoring   # ℹ pass 51   ℹ fail 0
```

Either mutation invents a red at the exact configured threshold — the false alarm
the rest of this module is carefully built to avoid. `capBreached`'s existing
rounding-edge test asserts 79.6% and something above 80, never 80 itself. Two
assertions close it. Same family as F1: the numbers are right, nothing holds them.

### F3 — no browser test ever renders a red card (low, new)

`scripts/tests/web/ops2-attention.spec.ts`

`grep -rn "redBalance: true\|redCap: true" scripts/tests/` returns **nothing**. The
red state is a client decision — which card takes `data-state="red"`, and which of
three notes it prints — and the only repo coverage is a source-regex in
`ops2-attention.test.mjs`, which cannot see what React renders. This is the blind
spot that has shipped major defects here before; the Codex round already caught one
version of it (both cards reddening from a single flag).

The behaviour is correct: `node .codex-tmp/tester/red.mjs` drove all four states
through real Chrome and each reddened exactly the right card, with the right copy
and one bell badge (output above). Only the coverage is missing. `READY_SNAPSHOT`
already exists in the spec file; three fixtures spread from it.

### F4 — a dead import this feature introduced (low)

`worker/routes/ops.ts:10` · carried from round 5

`resolveUser` was added to the import list by this feature and, after round 3
collapsed the 401/403 split, is referenced nowhere:

```
grep -n "resolveUser" worker/routes/ops.ts
# 10:  isDevEnv, isEmail, normEmail, resolveUser, sessionCookie, …
git show a76b8119:worker/routes/ops.ts | grep -c resolveUser   # 0
```

It survives `typecheck:gate` because unused imports are not fatal, and there is no
ESLint config in this repo to catch it. One-word deletion.

### F5 — an unrelated cron job's failure behaviour changed inside this feature, untested (low)

`worker/index.ts:342` · carried from rounds 4 and 5

`drainLearningOutbox` was awaited bare and now carries a `.catch`. Defensible on its
own terms — it is the rule the two lines below it already state — but it is a
behaviour change to the learning outbox inside a feature whose spec §3 scopes out
everything but monitoring, and nothing asserts either behaviour:
`grep -rn "drainLearningOutbox" scripts/tests/` returns nothing. Give it a test, or
lift it into its own change.

### F6 — an account-level cap with several gateways reports unavailable although it is attributable (low)

`worker/lib/monitoring.ts:158-161` · carried from rounds 4 and 5

The `gateways.length !== 1` refusal is applied before the cap's source is
considered. When `fetchCap` fell back to the **account** endpoint, numerator
(account-wide usage) and denominator (account-wide cap) describe the same scope and
the percentage is sound — yet the budget still reports `spend_not_attributable`.
The check belongs under `capSource === "gateway"`. Direction of error is safe
(withholding, never inventing), hence low. Read it beside the deployment note: if
the DRG account carries more than one gateway, the cap card is permanently
unavailable in production and criterion 2 shows nothing real until this is changed
or the account has one gateway.

### F7 — a zero or exceeded cap renders a self-contradicting note (cosmetic)

`src/ops2/attention/AttentionPage.tsx:243-245` · carried from rounds 4 and 5

`capBreached` deliberately treats `capUsd <= 0` as red, but `capPct` guards the same
division with `budget.capUsd > 0 ? … : 0`, so a zero cap renders a red card whose
note reads `⚠ 0% of the $0.00 gateway cap used`. Confirmed live in `probe4.mjs`
("zero cap, zero spend" → `redCap=true`). Spend beyond the cap renders headroom as
`$-5.00`. Neither misleads about the red state itself.

### F8 — the count query returns one row per parse, unbounded (low)

`worker/lib/monitoring.ts:9-16` · carried from rounds 4 and 5

`PARSE_OUTCOME_SQL` selects one row per parse over seven days and buckets them in
JS. Nothing is wrong at today's volume; the shape is the point — no `LIMIT`, and D1
caps a result set's size, so a busy week degrades into a truncated or failing count
rather than a slow one. `GROUP BY date(...)` returns at most fourteen rows. Kept
deferred: the JS bucketing is where the Melbourne-day rule lives.

### F9 — two rounds of low findings have never reached `DEBT.md` (low, process)

`docs/runs/ai-parse-monitoring/DEBT.md`

The debt file still carries only the round-3 entries (`F9`, `F10`) and the ponytail
list. Rounds 4 and 5 each deferred six low findings "to `DEBT.md`" and none were
written there — F4's dead import and F5's cron change have now been reported three
times each and are still exactly as first found. A low finding that is never
recorded is a low finding that is repeatedly re-discovered at a tester's cost.
F1–F8 and F10 should land in `DEBT.md` in this round's fix pass, whether or not any
of them is fixed.

### F10 — the spend rule's `window` unit is assumed to be seconds, and that assumption is not in the ledger (low, new)

`worker/lib/monitoring.ts:214-216`

`windowDays = Math.round(seconds / 86400)` reads `rules[].window` as seconds, and
that window bounds the usage query the cap percentage is built from. Cloudflare
documents no unit for it: the official SDK types say only `window: number`
(`cloudflare/resources/ai-gateway/ai-gateway.d.ts:861`) and the spend-limits page
describes "a configurable time window" without units. If the unit is anything else,
the usage query is bounded over the wrong period and the percentage — the number
that raises the alarm — is wrong with no signal. The assumption ledger
(`09-assumptions.md §1`) names two unverified money units and not this third one.
Add it there so the first real snapshot settles all three at once: a monthly gateway
cap whose `window` reads back as `2592000` confirms seconds.

---

## What was checked and found sound

Recorded so the next round does not re-derive it.

- **The Cloudflare adapter matches Cloudflare**, checked this round against the
  official SDK type definitions rather than against the implementation's own tests:
  `credit-balance` → `result.balance`; `usage-history` → `result.history[].aggregated_value`
  with `value_grouping_window` **required** and `start_time`/`end_time` in
  **milliseconds**; gateway → `spend_limits.enabled` + `rules[].{limit, limitType:'cost', window, enabled, model, provider, metadata}`;
  account fallback → `result.config.amount` in **cents (min 100)** — documented on
  the deprecated create sibling, so the ÷100 is right — and `duration` ∈
  `daily|weekly|monthly`, which is exactly `DURATION_DAYS`.
- **The Melbourne bucketing survives both DST switches.** `dst.mjs` at `2026-10-04`
  (spring forward), `2026-04-05` (fall back) and either side of the 14:00 UTC date
  change: seven unique consecutive dates every time, window start `00:00` Melbourne
  on the oldest. The SQL boundary and the earliest bucket are the same instant.
- **Timezone independence is real, not machine luck.** The suite is green under
  `TZ=UTC`, `TZ=Australia/Melbourne` and `TZ=America/Los_Angeles`.
- **Migration 0064** is numbered after 0063 with no duplicate prefix in the
  directory, is a pure additive `ADD COLUMN … NOT NULL DEFAULT 'upload'`, and
  nothing `REFERENCES ai_job_claim` (checked by grep, not by the comment). No table
  rebuild, so the cascade hazard is not in play; `wrangler d1 migrations apply
  --local` ran clean in this round's probes.
- **The upload path never needed touching.** The two production
  `INSERT INTO ai_job_claim` statements in `worker/routes/files.ts` name no
  `triggered_by` and take the column default, which is why a real upload counts as a
  parse without a code change.
- **A `failed` row really is terminal.** A retryable transient failure is written
  back as `status='scheduled'` (`worker/lib/ai/jobs.ts:389-393`), not `failed`; only
  the quota case rests in `failed`, and that one needs a person. The error card is
  not counting work that is about to retry itself.
- **No healthy parse can be miscounted as stuck.** The lease is 135 s and the job
  deadline 600 s at most, both far under the 30-minute predicate.
- **A corrupt or truncated KV value is no snapshot, not a 500.** Two malformed
  stored values served `200 {"snapshot":null,…}` and the page's empty state.
- **The snapshot parser is a whitelist that holds under attack** — a stored value
  carrying `cfToken` and `accountId` round-trips with neither present.
- **The bell and the page cost one KV read per call** — `monitoringPayload` makes a
  single `KV.get` and passes that snapshot into `notificationCount`.
- **`CF_ACCOUNT_ID` in `wrangler.jsonc` is not a new disclosure**: the same hash is
  already committed 62 lines above as the container image's registry namespace
  (`wrangler.jsonc:77`).

## Re-verification, if any finding is fixed

Every finding is low or cosmetic, so the conductor may ship and record them in
`DEBT.md` instead of spending a developer session. If a fix pass is run, re-verify
with: `npm run typecheck:gate`, `npm run test:ai-monitoring` (plus the two off-UTC
runs), `npm run test:ai-jobs`, `npm run test:api`, `npm run test:ops2`,
`npx playwright test scripts/tests/web/ops2-attention.spec.ts`, and the seven probes
in `.codex-tmp/tester/`. The three surviving mutations in the table above must then
be caught, and the five already-caught ones must stay caught.
