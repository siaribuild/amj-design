# ai-parse-monitoring — independent verification (round 5)

**Verdict: FAIL** — two medium findings. All twenty-eight acceptance criteria are
met and were reproduced; the three medium findings round 4 raised (F1 UTC bucket
parsing, F2 the criterion-27 log sanitiser, F3 the fail-open gateway scope check)
are all genuinely fixed and were re-proved from scratch rather than taken from the
fix commit's message. What fails this round is a defect round 4 did not look for
(an unreadable threshold var silently disables the only alarm the feature has, and
takes the whole panel down with it) and one round 4 rated low, deferred, and then
lost — the phone tab's count is invisible to a screen reader, and it never reached
`DEBT.md`.

Nothing in `04-build.md` or the fix log was taken on trust. Every verdict below
names the command that produced it. Two failing tests are attached — `TESTER-F5`
in `scripts/tests/ai-monitoring.test.mjs` and `bubble: the phone attention tab
announces its count…` in `scripts/tests/web/ops2-attention.spec.ts` — and they are
the only reason those two suites are currently red. No implementation code was
changed by this stage; the two mutations used to prove the guards were reverted and
the tree is clean apart from those two test files.

Verified at `30fe609a` on `merge/ai-parse-monitoring`; feature diff taken against
merge-base `a76b8119`.

---

## Gates

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck:gate` | **PASS** — `✓ no fatal type errors (61 non-fatal remain)` |
| Pure core + IO shell | `npm run test:ai-monitoring` | **50/50 pass** as shipped; **50 pass / 1 fail** with `TESTER-F5` attached |
| Same suite off UTC | `TZ=Australia/Melbourne npm run test:ai-monitoring` | **50/50 pass** — round-4 F1 is genuinely fixed, not fixed-on-this-machine |
| Claim enqueue and retry | `npm run test:ai-jobs` | **15/15 pass** |
| Worker API | `npm run test:api` | **80/80 pass** |
| Ops2 console | `npm run test:ops2` | **126/126 pass** |
| Browser, the shipped spec | `npx playwright test scripts/tests/web/ops2-attention.spec.ts` | **24/24 pass**; **24 pass / 1 fail** with the attached a11y test |
| Abuse + cron, real Worker | `node .codex-tmp/tester/api-probe.mjs` | **25/25 pass** |
| Cloudflare adapter + red rules, real module | `node .codex-tmp/tester/module-probe.mjs` | **21/21 pass** |
| Log-leak paths, real module | `node .codex-tmp/tester/c27-probe.mjs` | **5/5 pass** (the sixth case is the probe's own non-aborting stub, not a product path) |
| Browser, criteria the shipped spec does not assert | `node .codex-tmp/tester/browser-probe.mjs`, `browser-probe2.mjs` | **21/23 pass** — one probe assertion was mine and wrong (restated correctly in probe 2); the remaining failure is finding F2 |

The four probe harnesses live in `.codex-tmp/tester/` (untracked, throwaway).
`server.mjs` builds the SPA twice, applies every migration to a fresh local D1,
seeds it, adds eight `ai_job_claim` rows covering every counting case plus a
manufacturer-partner user, and runs the real Worker on `127.0.0.1:8790` with a
real-shaped `CF_MONITORING_TOKEN` and the production `CF_ACCOUNT_ID` — so a
credential leak into a payload or a log line would be visible. Start it with
`node .codex-tmp/tester/server.mjs`, then run the probes.

Port note: an orphaned `web-server.mjs` child from a killed Playwright run holds
8788/8789 on Windows and the next run dies with *"http://127.0.0.1:8788/api/health
is already used"* before a single test executes. `taskkill //F //PID <pid>` from
`netstat -ano | grep ":8788.*LISTENING"` clears it. This is environment, not
product — but it means a green Playwright claim should always arrive with the
run's own output attached.

---

## Acceptance criteria

Every row was reproduced by this stage. "cron probe" = `api-probe.mjs` against the
real Worker; "module probe" = `module-probe.mjs` against the real bundled module;
"browser probe" = `browser-probe.mjs`/`browser-probe2.mjs` driving real Chrome.

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Credit balance renders `$12.34`; no Cloudflare call during page load | PASS | Playwright "ready snapshot renders cards…" asserts `$12.34`. No-call half: the route is `monitoringPayload → readMonitoringSnapshot → env.KV.get`, a path with no `fetch` in it; cron probe served two consecutive loads with byte-identical payloads and the same `takenAt` |
| 2 | Cap card shows headroom `$12.00` **and** the cap `$20.00`, neither hardcoded | PASS | Browser probe with `billedSpendUsd:8, capUsd:20` read the card as `Cap remaining$12.00$8.00 of the $20.00 gateway cap used (40%)`. The shipped spec still asserts only the headroom — see F3 |
| 3 | Gateway cap failure falls back to the account endpoint; the snapshot records the source | PASS | Module probe drove a 500 on `/gateways/openframe-estimator`: `{"available":true,"billedSpendUsd":8,"capUsd":20,"capSource":"account","windowDays":30}`, with both URLs observed in order, and `2000` cents converted to `$20.00` |
| 4 | No API token → money unavailable (not zero, not red); counts and chart still render | PASS | Module probe: no token ⇒ `token_missing` on both halves with **zero** fetch calls; placeholder account id ⇒ `account_id_missing`. Playwright "money unavailable shows an unavailable state, not zero…" asserts the card is not `$0.00` while the count card still reads `20` |
| 5 | Non-2xx or timeout → D1 counts still refreshed, money unavailable, failure logged, page still loads | PASS | Cron probe with an unreachable Cloudflare: snapshot money `{"available":false,"reason":"fetch_failed"}` on both halves while `success7d:2, error7d:2` came from D1. c27 probe shows one bounded log line per failed call. Playwright "a 500 shows the error panel with a retry button" passes |
| 6 | A stale snapshot states its age on every card | PASS | Playwright "stale snapshot renders the stale sentence and per-card as-at stamps": `.att-asat` contains "The 10-minute job may have stopped." and all four `.att-card__stamp` elements are visible |
| 7 | N successes and M errors in 7 days render on the two cards | PASS | Cron probe seeded 2 completed + 1 failed + 1 stuck + 1 in-flight + 1 ops + 1 superseded + 1 scheduled and read `success7d: 2, error7d: 2` back through the route; browser probe rendered `20` and `3` from a snapshot carrying those totals |
| 8 | A document retried three times before succeeding is one success, zero errors | PASS | `ai-monitoring.test.mjs` "a parse retried until it succeeds is ONE success (criterion 8)" executes the module's own SQL over `node:sqlite`. `ai-jobs.test.mjs` asserts the in-place reclaim `UPDATE` carries no `triggered_by`, so a staff retry of a customer document stays a customer parse |
| 9 | A `processing` claim 31 minutes old counts as one error | PASS | Cron probe, real Worker: a 45-minute `processing` row is inside `error7d: 2`. **No executed repo test — F3** |
| 10 | A `processing` claim 5 minutes old counts as neither | PASS | Same probe: the 5-minute row appears in neither total. **No executed repo test — F3** |
| 11 | An ops-triggered run is excluded from both counts and the chart | PASS | Cron probe: a `triggered_by='ops'` completed claim beside two `upload` ones gives `success7d: 2`, not 3. Mutation-checked — deleting the `triggered_by = 'upload'` filter moves it to 3 (see below). `worker/routes/ops.ts:2154` passes `"ops"`; `worker/routes/parse.ts:47` and both `INSERT INTO ai_job_claim` statements in `worker/routes/files.ts` take the `'upload'` default |
| 12 | No parses at all → cards show `0`, chart shows an empty state | PASS | End-to-end: `DELETE FROM ai_job_claim`, re-fire the cron ⇒ `success7d=0 error7d=0 buckets=7 allZero=true`. Playwright "an all-zero window renders an explicit empty chart state" renders the sentence, seven `.att-col`, zero `.att-bar` |
| 13 | Seven day-buckets whose sums equal the two count cards | PASS | Cron probe: `buckets {s:2,e:2} vs cards 2/2`. Browser probe 2 summed the numbers the chart actually paints: `bars 20/3 vs cards 20/3`. Round-4 F1's off-UTC breakage is fixed and re-proved by `TZ=Australia/Melbourne npm run test:ai-monitoring` |
| 14 | A zero day is a zero bucket, not a missing day | PASS | Cron probe: seven distinct consecutive dates with five all-zero. Playwright counts seven `.att-col` on both the ready and the all-zero snapshots |
| 15 | Not red → bubble count 0, nothing drawn | PASS | Cron probe: money unavailable ⇒ `notificationCount: 0`. Playwright "bell: no badge when notificationCount is 0" |
| 16 | Balance below the floor → bubble shows `1` | PASS | Browser probe: `redBalance` ⇒ balance card `data-state="red"` with "⚠ Below the $5.00 floor", cap card **not** reddened, `.ops2-bell__badge` reads `1`. Module probe pins the boundary: exactly `$5.00` is not red, `$4.99` is |
| 17 | Cap over the ceiling → `1`; both conditions → still `1` | PASS | Browser probe: cap-only red reddens only the cap card, badge `1`; both conditions red gives two red cards and the badge still reads `1`. Module probe: `16.00/20` at an 80% ceiling is not red, `16.01/20` is |
| 18 | Tapping the bubble navigates to Attention | PASS | Playwright "bell: clicking it lands on /attention" navigates from `/projects` and asserts the URL and the `Attention` heading |
| 19 | Unavailable money never produces a red | PASS | Cron probe: unavailable money ⇒ `notificationCount: 0`. Browser probe: two `data-state="unavailable"` cards, zero red cards, no badge element at all, counts still rendering. Module probe: `evaluateRed` false on unavailable money |
| 20 | A second notification source appends without changing the bubble or the aggregator | PASS | `NOTIFICATION_SOURCES` holds one entry; `countFrom` is `Promise.allSettled` + a sum with no source-specific branching. "one failing source cannot hide every other notification" injects two arbitrary sources and asserts the surviving one still contributes |
| 21 | The existing `*/10` cron writes one snapshot; no new trigger | PASS | Cron probe: before `/cdn-cgi/handler/scheduled` the route answered `{"snapshot":null,"notificationCount":0}`; after it, the full snapshot. `git diff a76b8119 HEAD -- wrangler.jsonc` touches no `crons` entry (`"crons": ["*/10 * * * *"]` unchanged) |
| 22 | Two ops2 pages → no Cloudflare call, both read the same KV snapshot | PASS | Cron probe: two consecutive route calls returned byte-identical payloads carrying the same `takenAt` |
| 23 | Signed-out visitor → 401/403, no values | PASS | Abuse probe, real Worker: `403 {"error":"forbidden"}`; body scanned for nine monitoring words and six credential markers — none present |
| 24 | Signed-in Customer → 403, no monitoring data | PASS | Abuse probe: customer OTP session ⇒ `403 {"error":"forbidden"}`, scan clean; the sibling `/api/ops/summary` answers 403 to the same cookie |
| 25 | Manufacturer partner → 403, no monitoring data | PASS | Abuse probe: `partner@amjtradedirect.test` (internal, role `manufacturer`) signed in through `/api/ops/auth` ⇒ `403 {"error":"forbidden"}`, scan clean |
| 26 | The payload carries no token, account id or gateway credential | PASS | Abuse probe ran the Worker with `CF_MONITORING_TOKEN=tester-secret-token-ABC123` and the production `CF_ACCOUNT_ID`, then scanned the staff 200 body for both plus `Bearer`, `authorization`, `CF_MONITORING_TOKEN`, `AI_GATEWAY_ID` — none present, before and after the cron. `ceilingPct` is deliberately not shipped either |
| 27 | A logged Cloudflare failure carries no token and no Authorization value | PASS | Round-4 F2 is fixed. c27 probe drove five hostile transports — one that echoes the request headers into its error, one that puts the `Authorization` value in the message, a non-2xx, an unparseable 200, and a `json()` that throws with the token in it — and every log line was `ai-parse monitoring: CF fetch failed for /ai-gateway/…` or `… for ?`. No token, no header, no URL |
| 28 | The ops2 `/attention` route is refused by the same staff guard, no new auth path | PASS | The route calls `resolveStaff`, the guard 41 siblings use. Abuse probe: a request forging `cf-access-authenticated-user-email`, a bogus `Cf-Access-Jwt-Assertion`, `x-forwarded-user` and invented session cookies answers 403. Playwright test 13 shows a real customer's page load landing on the unauthorised panel, not zero counts |

### Abuse-case execution, verbatim

`node .codex-tmp/tester/api-probe.mjs`, real Worker, real D1/KV:

```
PASS  C23 anon -> 401/403 (got 403)   body={"error":"forbidden"}
PASS  C23 anon body carries no monitoring values
PASS  C23 anon body carries no credential
PASS  C24 customer -> 403 (got 403)   body={"error":"forbidden"}
PASS  C24 customer body carries no monitoring data
PASS  C28 sibling /api/ops/summary for a customer -> 403 (got 403)
PASS  C25 manufacturer -> 403 (got 403)   body={"error":"forbidden"}
PASS  C25 manufacturer body carries no monitoring data
PASS  TAMPER forged Access header + session cookie -> 403 (got 403)
PASS  staff -> 200 (got 200)
...
0 FAILING of 25
```

The denials are not vacuous. Mutating the route's guard back to the round-2
regression (`resolveStaff` → `resolveUser`, `worker/routes/ops.ts:365`) and
re-running the same probe:

```
FAIL  C24 customer -> 403 (got 200)   body={"snapshot":{"takenAt":…,"money":…
FAIL  C24 customer body carries no monitoring data   balance,success7d,error7d,snapshot,notificationCount,days
FAIL  C25 manufacturer -> 403 (got 200)
FAIL  C25 manufacturer body carries no monitoring data
5 FAILING of 25
```

and `npm run test:ai-monitoring` goes red on `V-F1`. Guard and test both hold.

### Cron end-to-end, verbatim

Eight claims seeded (2 completed uploads, 1 failed upload, 1 `processing` at 45
minutes, 1 `processing` at 5 minutes, 1 completed `triggered_by='ops'`, 1
`superseded`, 1 `scheduled`), then `GET /cdn-cgi/handler/scheduled`:

```
SNAPSHOT: {"takenAt":"2026-09-05T19:37:12.023Z","money":{"balance":{"available":false,
"reason":"fetch_failed"},"budget":{"available":false,"reason":"fetch_failed"}},
"days":[…,{"day":"2026-09-06","success":2,"error":2}],"success7d":2,"error7d":2,
"redBalance":false,"redCap":false,"floorUsd":5}

PASS  C21 the cron wrote a snapshot the route now serves
PASS  C7/C8/C11 success7d == 2 (ops row + superseded + scheduled excluded) - got 2
PASS  C9/C10 error7d == 2 (1 failed + 1 stuck 45m; the 5m one excluded) - got 2
PASS  C13 bucket sums == cards - buckets {s:2,e:2} vs cards 2/2
PASS  C22 two loads return the byte-identical snapshot
```

### Guards that were mutation-tested

| Guard | Mutation | Caught by |
|---|---|---|
| `worker/routes/ops.ts:365` `resolveStaff` | → `resolveUser` | the live abuse probe (customer and manufacturer both reach 200 with full monitoring data) **and** `V-F1` |
| `worker/lib/monitoring.ts:12` `triggered_by = 'upload'` | filter deleted (`WHERE 1=1`) | the live cron probe (`success7d` 2 → 3) and, as a string match only, "D1 count query matches design §3.2 verbatim" |
| `src/data/monitoring.ts` `evaluateRedFlags` availability guard | inverted | "evaluateRed: false when money unavailable" |
| `src/data/monitoring.ts` `capBreached` zero-cap guard | removed | `V-F3` |

### Round-4 findings, re-verified from scratch

| Round-4 finding | Status |
|---|---|
| F1 — D1 stamp read as local time, breaking criterion 13 off UTC | **FIXED.** `d1Instant` appends `Z` to the zoneless `datetime('now')` shape. `TZ=Australia/Melbourne npm run test:ai-monitoring` 50/50; `TESTER-F1`/`TESTER-F2` green with their assertions unchanged |
| F2 — criterion 27 bypassed on the transport-failure path | **FIXED.** `cfGet` discards the transport's own message and rethrows a message it composed; `logFailure` publishes a suffix only if it recognises it. Five hostile transports, zero leaks |
| F3 — gateway scope check failed open toward a false red | **FIXED.** `!Array.isArray(gateways) \|\| gateways.length !== 1`. `TESTER-F4` green |
| F4 — criteria 9/10/11 guarded only by a regex | **OPEN** — re-raised as F3 below |
| F5 — phone tab count invisible to a screen reader | **OPEN, and never recorded in `DEBT.md`** — re-raised as F2 below, at medium |
| F6 — `drainLearningOutbox` behaviour change, untested | **OPEN** — re-raised as F5 below |
| F7 — zero/negative cap renders a self-contradicting note | **OPEN** — re-raised as F7 below |
| F8 — an account-source cap is suppressed although attributable | **OPEN** — re-raised as F6 below |

---

## Findings

### F1 — an unreadable threshold var silently disables the only alarm, and blanks the page (medium)

`worker/lib/monitoring.ts:246-247` (`aiBudgetRed`) and `:283-284` (`monitoringPayload`)

Both thresholds are read as `Number(env.AI_CREDIT_FLOOR_USD ?? 5)`. `??` catches
an **absent** var only. Two reachable states get past it:

- **Empty string.** `Number("")` is `0`, so the floor becomes `$0.00` — a floor no
  credit balance can fall below. This is not hypothetical: setting a var to empty
  is this repo's own idiom (`--var ACCESS_TEAM_DOMAIN:` in
  `scripts/tests/web-server.mjs`, and the same shape in every local harness).
- **A typo** — `"5 USD"`, `"80%"`, a stray space. `Number(...)` is `NaN`, every
  comparison against `NaN` is false, and the red evaluation is off with no signal
  anywhere. Worse, `floorUsd: NaN` serialises to `null`, `useMonitoring.ts:69`
  requires `typeof enriched.floorUsd === "number"`, and the **entire monitoring
  panel** is replaced by "The snapshot could not be trusted, so none is shown" —
  pointing the reader at the snapshot rather than at the var that broke.

Reproduced against the real module (`node .codex-tmp/tester/threshold-probe.mjs`),
with a snapshot that is red under any correctly-read threshold ($0.50 balance,
99.5% of cap):

```
defaults (vars absent)                               redBalance=true  redCap=true  bubble=1 floorShown=5
wrangler.jsonc values                                redBalance=true  redCap=true  bubble=1 floorShown=5
vars set EMPTY (the --var NAME: idiom this repo uses) redBalance=false redCap=true  bubble=1 floorShown=0
a typo'd var                                         redBalance=false redCap=false bubble=0 floorShown=NaN
```

and in a real browser (`node .codex-tmp/tester/nan-probe.mjs`), serving what the
Worker actually writes for a typo'd var (`floorUsd: null`):

```
monitoring-error panel: "Couldn't load the monitoring figuresThe snapshot could not be
trusted, so none is shown. Nothing is wrong with parsing itself.Try again"
monitoring cards rendered: 0
```

Failing test attached — reproduce with `npm run test:ai-monitoring`:

```
✖ TESTER-F5 monitoringPayload: an unreadable threshold var falls back to the default,
  never to a silent no-alarm
  AssertionError: empty string: the balance card should still redden
    actual: false, expected: true
```

The fix is one helper used by both call sites: parse, and fall back to the
documented default when the result is not finite. `Number.isFinite` is the whole
of it. This is the alarm the feature exists for; it must not be able to fail
silently on a config edit that `typecheck` and every suite still pass.

### F2 — the phone Attention tab's count is invisible to a screen reader (medium)

`src/ops2/Ops2App.tsx:281-283`

The desk bell earns its accessible name properly —
`aria-label="Attention — 1 item"`. The phone tab does not: the badge span is
`aria-hidden="true"`, the icon is `aria-hidden`, and `<IonLabel>` carries only
`"Attention"`. On the phone the bell does not exist at all (deliberately —
`OpsPage.tsx:165`, "DESK ONLY"), so the surface where Attention is a permanent tab
is the surface where a screen-reader user gets no signal that anything is waiting.

Reproduced with Chrome's own accessibility tree at 390×844, badge visible and
reading `1`:

```
phone tab bar aria snapshot:
- tablist:
  - tab "Attention" [selected]
  - tab "Projects"
  - tab "Products"
  - tab "More"

FAIL  A11Y the phone attention tab announces the count   tabs matching /1/: 0
PASS  A11Y the desk bell announces the count             aria-label="Attention — 1 item"
```

Failing test attached — reproduce with
`npx playwright test scripts/tests/web/ops2-attention.spec.ts -g "announces its count"`:

```
Error: the attention tab's accessible name carries the count
  Expected: 1  Received: 0
  waiting for getByRole('tab', { name: /1/ })
```

Raised from round 4's *low*. Two reasons: CLAUDE.md names accessibility basics as
a thing that is never the shortest diff, and the finding was deferred to the debt
file last round and then never written there — deferring it again loses it a
second time. `04-build.md`'s argument that one browser test covers both badges is
true about the data source and says nothing about the accessible names. Mirror the
bell's `aria-label` onto the tab button; it is one line.

### F3 — criteria 9, 10 and 11 are still guarded only by a string match on the SQL (low)

`scripts/tests/ai-monitoring.test.mjs:261-291`

Carried unchanged from round 4. The three rules that define what a parse *is* — a
30-minute `processing` row is an error, a 5-minute one is neither, an
`ops`-triggered row is neither — have no test that executes them; their only
protection is `assert.match(calls[0].sql, /triggered_by = 'upload'/)` and a sibling
regex, inside a test whose fake DB returns `results: []`.

The behaviour is correct — this stage proved all three through the real cron in
`wrangler dev`, and proved the `triggered_by` filter is load-bearing by deleting it
(`success7d` 2 → 3). But a regex on a query string cannot tell a working predicate
from a broken one: rewriting the predicate while keeping the literal text passes.
The suite already has the harness — `sqliteD1` at line 1021, used by three
criterion-8 tests. Three more rows in it would close this. Deferred to `DEBT.md`.

Reproduced: adding `OR status = 'scheduled'` to the error branch of
`PARSE_OUTCOME_SQL` — which makes every queued-but-not-yet-started parse count as
an *error* on the card staff are meant to act on — leaves every regex matching and
the suite unchanged at **50 pass / 1 fail**, the one failure being this stage's own
`TESTER-F5`. Reproduce with:

```
sed -i "s/       OR status = 'failed'/       OR status = 'failed'
       OR status = 'scheduled'/"   worker/lib/monitoring.ts && npm run test:ai-monitoring
```

### F4 — a dead import this feature introduced (low)

`worker/routes/ops.ts:10`

`resolveUser` was added to the import list by this feature and, after round 3
collapsed the 401/403 split, is not referenced anywhere in the file:
`grep -n "resolveUser" worker/routes/ops.ts` returns exactly one line — the import
itself. It survives `typecheck:gate` because unused imports are not fatal. Delete
it; a name in an import list is a claim that something uses it.

### F5 — an unrelated cron job's failure behaviour changed inside this feature, untested (low)

`worker/index.ts:346`

Carried from round 4. `drainLearningOutbox` was `await`ed bare and now carries a
`.catch`. The change is defensible on its own terms — it is the rule the two lines
below it already state — but it is a behaviour change to the learning outbox, in a
feature whose spec §3 scopes out everything but monitoring, and nothing asserts
either the old or the new behaviour: `grep -rn "drainLearningOutbox"
scripts/tests/` returns nothing. Either give it a test or lift it into its own
change.

### F6 — an account-level cap with several gateways reports unavailable although it is attributable (low)

`worker/lib/monitoring.ts:160`

Carried from round 4. The `gateways.length !== 1` refusal is applied before the
cap's source is considered. When `fetchCap` fell back to the account endpoint, the
numerator (account-wide usage) and the denominator (the account-wide cap) describe
exactly the same scope and the percentage is sound — yet the budget still reports
`spend_not_attributable`. A correct number is suppressed. The check belongs under
`capSource === "gateway"`. Direction of error is safe (withholding, not inventing),
hence low.

### F7 — a zero or exceeded cap renders a self-contradicting note (cosmetic)

`src/ops2/attention/AttentionPage.tsx:225-227`

Carried from round 4, confirmed live. `capBreached` deliberately treats
`capUsd <= 0` as red, but `capPct` guards the same division with
`budget.capUsd > 0 ? … : 0`, so a zero cap renders a red card whose note reads
`⚠ 0% of the $0.00 gateway cap used`. Separately, the module probe confirms a
negative cap is published as-is (`capUsd: -5`) and spend beyond the cap renders
headroom as `$-5.00` — a minus sign after the dollar sign. Neither misleads about
the red state itself.

### F8 — the count query returns one row per parse, unbounded (low)

`worker/lib/monitoring.ts:9-16`

`PARSE_OUTCOME_SQL` selects one row per parse over seven days and buckets them in
JS. At today's volume this is nothing; the shape is what makes it worth a line —
the query has no `LIMIT` and D1 caps a result set's size, so a busy week degrades
into a truncated or failing count rather than a slow one. `GROUP BY date(...)`
would return at most fourteen rows and move nothing else. Deferred: nothing is
wrong now, and the JS bucketing is where the Melbourne-day rule lives.

---

## What was checked and found sound

Recorded so the next round does not re-derive it:

- **Migration 0064** is correctly numbered after 0063, is a pure additive
  `ADD COLUMN ... NOT NULL DEFAULT 'upload'`, and nothing `REFERENCES
  ai_job_claim` — verified by grep, not by the comment. No table rebuild, so the
  cascade hazard that once cost production rows is not in play.
- **The `triggered_by` threading is complete and correctly scoped.** Only
  `worker/routes/ops.ts:2154` passes `"ops"`; `worker/routes/parse.ts:47` and both
  `INSERT INTO ai_job_claim` statements in `worker/routes/files.ts` (the
  highest-volume production path) take the column default. The in-place reclaim
  `UPDATE` carries no `triggered_by` reference, so a staff retry of a customer's
  document stays a customer parse.
- **The reaper runs before the snapshot** inside `scheduled()`, and a claim it
  reschedules or fails is already in its new state when the counts are taken, so
  no row is counted twice within one snapshot.
- **The snapshot parser is a whitelist that holds under attack.** A stored value
  poisoned with `CF_MONITORING_TOKEN`, an `accountId`, an extra `secret` inside
  `money.balance` and a `note` on every day-bucket round-trips with none of them
  present in the output.
- **The Cloudflare adapter refuses coerced numbers.** A string spend, a `NaN`
  spend and a string cap all end as `available: false` rather than a plausible
  figure; multiple `history` windows are summed; the account cap is converted
  from cents.
- **The red boundaries match the spec's words.** Exactly `$5.00` is not "below the
  floor"; `$4.99` is. Exactly 80% is not "above the ceiling"; 80.05% is. A negative
  balance is red. A zero cap is red rather than NaN-quiet.
- **`CF_ACCOUNT_ID` in `wrangler.jsonc` is not a new disclosure** — the same
  account hash was already committed as the container image's registry namespace.
- **The client never re-derives a threshold.** `redBalance`/`redCap` are
  server-evaluated and the page's `data-state` expressions contain no numeric
  comparison; `ceilingPct` is deliberately not shipped to the client at all.
- **No route reads an arbitrary KV key** — `grep -rn "KV.get(" worker/routes/`
  returns only fixed keys, so the snapshot is reachable through the staff-gated
  route and nowhere else.

## Re-verification, when the fixes land

`TESTER-F5` and the phone-tab a11y spec must go green **with no change to their
assertions** — they pin behaviour, not implementation. Then, from scratch:
`npm run typecheck:gate`, `npm run test:ai-monitoring`,
`TZ=Australia/Melbourne npm run test:ai-monitoring`, `npm run test:ai-jobs`,
`npm run test:ops2`, `npm run test:api`, and
`npx playwright test scripts/tests/web/ops2-attention.spec.ts`. The abuse, cron,
module and log-leak probes will be re-run against the fixed tree, including the
`resolveStaff` and `triggered_by` mutation checks, so a fix that quietly loosens a
guard is caught in the same pass.
