# 06 — Independent verification: `ai-parse-monitoring`

**Verdict: FAIL** — 26 of 28 acceptance criteria verified; criteria **8** and **11**
are not met, and each is currently defended by a passing test in the repo that
asserts the wrong behaviour. Two HIGH findings, one MEDIUM, two LOW, three COSMETIC.

Verified independently of `04-build.md`: every criterion below was re-established
from the spec, exercised against the code or a live worker, and its actual output
recorded. Nothing in the build report was taken on trust.

- Date: 2026-09-05
- Spec: `docs/runs/ai-parse-monitoring/01-spec.md` §2, criteria 1–28
- Diff under test: `migrations/0064_ai_job_claim_triggered_by.sql`, `src/data/monitoring.ts`,
  `worker/index.ts`, `worker/lib/ai/jobs.ts`, `worker/lib/monitoring.ts`,
  `worker/routes/ops.ts`, the ops2 attention surface, `scripts/tests/**`
- No implementation file was modified by this verification. Three new **failing**
  regression tests were added (test files only) and are listed under the findings
  they reproduce.

---

## 1. Gates

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck:gate` | PASS — `✓ no fatal type errors (58 non-fatal remain)` |
| ops2 console suite | `npm run test:ops2` | PASS — 107/107 |
| worker API suite | `npm run test:api` | PASS — 77/77 |
| AI jobs suite | `npm run test:ai-jobs` | **FAIL** — 14 pass / 1 fail (the failure is this document's F2 regression test) |
| AI monitoring suite | `npm run test:ai-monitoring` | **FAIL** — 43 pass / 2 fail (both failures are this document's F1 regression tests) |
| Playwright (UI gate) | `npx playwright test scripts/tests/web/ops2-attention.spec.ts` | PASS — 21/21 against the dev server |

Before my three tests were added, `test:ai-jobs` was 14/14 and `test:ai-monitoring`
was 43/43. Every red line in this run is a defect this verification exposed, not a
pre-existing break.

The UI gate is satisfied: `scripts/tests/web/ops2-attention.spec.ts` carries 21
Playwright tests, of which 7 cover the monitoring section, 3 the notification bell,
and 2 the unauthorised paths. Client-side decisions (which card reddens, which
empty state renders, what the stale sentence says) are covered in the browser, not
only in node.

---

## 2. Criteria

### Cards — money

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Balance `12.34` renders `$12.34`, no CF call on page load | PASS | Playwright `monitoring: ready snapshot renders cards, as-at, and 7 chart columns` renders from the KV snapshot only; the page calls `GET /api/ops/monitoring`, which `worker/routes/ops.ts` serves from `readMonitoringSnapshot` with no outbound fetch. Live: two consecutive loads produced zero outbound Cloudflare requests in the worker log. |
| 2 | Headroom `$12.00` shown against cap `$20.00`, neither hardcoded | PASS | `capOutstanding` (`src/data/monitoring.ts:237`) computes `capUsd - billedSpendUsd`; node test `capOutstanding: cap minus billedSpend` (`scripts/tests/ai-monitoring.test.mjs:256`), and the Playwright ready-snapshot test renders both figures from payload fields. |
| 3 | Per-gateway cap fails → account-level fallback, source recorded | PASS | node `fetchMoneyNumbers: gateway cap failure falls back to spending-limit with capSource 'account'` (`:372`) and `fetchMoneyNumbers: the account fallback converts cents to dollars` (`:738`). `capSource` is part of the stored snapshot type (`src/data/monitoring.ts:12`). |
| 4 | No token → money unavailable (not zero, not red); counts still render | PASS | node `fetchMoneyNumbers: CF_MONITORING_TOKEN unset yields token_missing with zero fetch calls` (`:294`); Playwright `monitoring: money unavailable shows an unavailable state, not zero…` and `monitoring: money unavailable with a missing/placeholder CF_ACCOUNT_ID says so distinctly from a missing token`. |
| 5 | CF non-2xx/timeout → D1 counts still refreshed, money unavailable, logged, page loads | PASS | node `writeMonitoringSnapshot: CF failure still writes fresh D1 counts with money unavailable` (`:322`) and `fetchMoneyNumbers: a stalled Cloudflare endpoint is bounded` (`:603`). Live: with the CF host unreachable, the cron still wrote a snapshot with fresh counts and `available:false`, and the page rendered. |
| 6 | Snapshot older than 30 min → each card states its age | PASS | Playwright `monitoring: stale snapshot renders the stale sentence and per-card as-at stamps`. |

### Cards — parse counts

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 7 | 40 success / 3 failed → cards show `40` and `3` | PASS | Live against a real worker and real D1 (`.codex-tmp/tester2/state`): seeded 40 completed and 3 failed upload claims, ran the cron, `GET /api/ops/monitoring` returned `success7d: 40, error7d: 3`. |
| 8 | One document retried three times before succeeding counts as **one** success and zero errors | **FAIL** | **F1.** `PARSE_OUTCOME_SQL` (`worker/lib/monitoring.ts:9-27`) returns one row per job-claim generation and never selects `project_id`, so no per-document collapse is possible; `assembleParseCounts` then counts every row handed in (`src/data/monitoring.ts:173-186`). Reproduced by `npm run test:ai-monitoring` → `writeMonitoringSnapshot: three retried generations of ONE document count as one parse` fails `2 !== 0`. |
| 9 | `processing` row 31 minutes old with attempts exhausted → one error | PASS | The `-30 minutes` clause in `PARSE_OUTCOME_SQL`. Live: a `processing` row stamped 31 minutes back produced `error7d: 1`. |
| 10 | `processing` row 5 minutes old → neither success nor error | PASS | Same live run: the 5-minute row appeared in neither total and in no bucket. |
| 11 | Ops-triggered run excluded from both counts and from the chart | **FAIL** | **F2.** The SQL filter `triggered_by = 'upload'` is right, but the ops retry never writes the column. `retryCurrentAiExtraction` (`worker/lib/ai/jobs.ts`) reclaims an existing claim in place with an UPDATE that does not mention `triggered_by`, so the row stays `'upload'` and is counted. Live: `POST /api/ops/projects/<id>/retry-extraction` → `HTTP 202 {"accepted":true,"alreadyQueued":false,"generation":0,"status":"queued"}`, then the row reads back `triggered_by: "upload"`. Reproduced by `npm run test:ai-jobs`. |
| 12 | No parses at all → cards show `0`, chart shows an empty state | PASS | Playwright `monitoring: an all-zero window renders an explicit empty chart state` and `monitoring: no snapshot yet renders the empty state`; node `assembleParseCounts: zero rows produce exactly 7 Melbourne-day buckets` (`:184`). |

### Chart

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 13 | 7 day-buckets; bucket sums equal the two count cards | PASS (see F3) | node `assembleParseCounts: bucket sums equal the two totals for sample rows` (`:199`) and its DST-day variant (`:578`); `parseWindowStart` anchors the SQL window to the oldest bucket's Melbourne midnight, so no returned row falls outside the buckets. Live: seeded spread rows summed to the cards exactly. The sums are consistent — but F3 records that *which* day a parse lands in is not stable. |
| 14 | A day with zero parses is a zero bucket, not a missing day | PASS | Playwright `monitoring: ready snapshot renders cards, as-at, and 7 chart columns` asserts 7 columns; node `assembleParseCounts: the seven buckets are consecutive Melbourne calendar dates across the DST switch` (`:565`). |

### Notification bubble

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 15 | Not red → count 0, no bubble drawn | PASS | node `evaluateRed: false when neither the floor nor the ceiling trips` (`:248`); the Playwright bell test for the zero case. |
| 16 | Balance below the floor → `1` | PASS | node `evaluateRed: true when creditBalanceUsd is below the dollar floor` (`:222`). |
| 17 | Cap above the ceiling → `1`; both tripped → still `1` | PASS | node `evaluateRed: a single boolean true when both the floor and ceiling trip` (`:238`) and `notificationCount: one source` (`:424`). |
| 18 | Tapping a non-zero bubble navigates to the Attention page | PASS | The bell navigation test in `scripts/tests/web/ops2-attention.spec.ts`. |
| 19 | Money unavailable → count 0 (no false alarms) | PASS | node `evaluateRed: false when money unavailable` (`:217`); the `available === true` guards in `evaluateRedFlags` (`src/data/monitoring.ts:223-224`). |
| 20 | A second source appends without changing bubble, aggregation, or container | PASS | Exactly one v1 source implementation and no source-specific branching in the aggregator; node `notificationCount: one failing source cannot hide every other notification` (`:1002`). |

### Freshness / cron

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 21 | The existing `*/10` cron writes one KV snapshot; no new trigger | PASS | `wrangler.jsonc` still declares exactly the one `*/10 * * * *` trigger; `writeMonitoringSnapshot` writes the single key `monitoring:snapshot`. Live: after a cron run, that one key was present. |
| 22 | Two open pages → neither triggers a CF call; both read the same snapshot | PASS | Live: two sequential loads of `/api/ops/monitoring` produced zero outbound Cloudflare requests in the worker log and identical `takenAt`. |

### Abuse cases — each forbidden action attempted for real

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 23 | Signed-out visitor → 401/403, no data | PASS | `curl` with an empty cookie jar → `HTTP 403 {"error":"forbidden"}`. The body carries no balance, spend, cap or count. |
| 24 | Signed-in Customer → 403, no monitoring data | PASS | Signed in a customer via the dev OTP flow, replayed that session cookie against `ops.localhost` → `HTTP 403 {"error":"forbidden"}`. |
| 25 | Manufacturer partner account → 403, no monitoring data | PASS | Signed in a manufacturer account, confirmed via `GET /api/ops/me` → `"role":"manufacturer"`, then `GET /api/ops/monitoring` → `HTTP 403`. `resolveStaff` excludes `role === "manufacturer"`. |
| 26 | Payload contains no CF token, no account id, no gateway credentials | PASS | The staff `HTTP 200` body was inspected in full: only `takenAt`, `money` (numbers plus `capSource`/`reason`), `days`, `success7d`, `error7d`, the red flags and the two thresholds. `parseMonitoringSnapshot` (`src/data/monitoring.ts:82`) rebuilds the object field by field rather than passing the stored value through. |
| 27 | A CF failure log line contains no token, no Authorization value | PASS | Forced a CF failure, then grepped the worker log: 0 hits for the token value, 0 for `authorization` (case-insensitive). |
| 28 | A Customer guessing `/attention` is refused by the same ops2 staff guard | PASS | Playwright `a signed-in customer (non-staff) loading /attention gets the unauthorised treatment, not zero counts`; node `V-F1 GET /api/ops/monitoring uses the shared ops staff guard (criterion 28: no new auth path)` (`:545`). |

---

## 3. Findings

### F1 — Criterion 8 is not met: a retried parse counts once per attempt (HIGH)

A document retried three times before succeeding is counted as three parses — one
success and two errors — so both cards over-report, and the inflated one is the
error card this feature exists to make people act on.

`PARSE_OUTCOME_SQL` (`worker/lib/monitoring.ts:9-27`) selects one row per
`ai_job_claim` row, which is one row per `(project_id, source_generation)`. It
never selects `project_id`, so nothing downstream could collapse generations even
if it tried; `assembleParseCounts` (`src/data/monitoring.ts:173-186`) counts every
row it is handed. The fix belongs in the query: the latest generation per
`project_id` is the parse, and earlier generations are attempts at the same parse.

For the developer: `scripts/tests/ai-monitoring.test.mjs:261`
(`writeMonitoringSnapshot: D1 count query matches design §3.2 verbatim`) asserts
the query string character for character and will need updating with the fix. It
is a change-detector rather than a behavioural test — it currently locks in the
wrong counting rule.

Reproduce:

```
npm run test:ai-monitoring
```

Actual:

```
✖ writeMonitoringSnapshot: three retried generations of ONE document count as one parse
  AssertionError: its earlier generations are the same parse, not two failures
  2 !== 0   (scripts/tests/ai-monitoring.test.mjs:1064)
✖ writeMonitoringSnapshot: a document whose last generation failed counts as one error
  2 !== 1   (scripts/tests/ai-monitoring.test.mjs:1081)
ℹ tests 45  ℹ pass 43  ℹ fail 2
```

The two failing tests are at `scripts/tests/ai-monitoring.test.mjs:1050` and
`:1070`. They drive the module's own SQL through an in-memory `node:sqlite` D1
shim, so they fail on the real query rather than on hand-fed rows.

### F2 — Criterion 11 is not met: an ops retry is still counted as an upload parse (HIGH)

The migration adds `triggered_by` and the query filters on `= 'upload'`, so the
mechanism is in place — but the ops "Try again" path never writes the column.
`retryCurrentAiExtraction` (`worker/lib/ai/jobs.ts`) has two branches; the branch
that reclaims an existing claim in place issues an UPDATE that does not mention
`triggered_by`, leaving the row at its original `'upload'`. Every ops retry is
therefore counted in the cards and drawn in the chart — precisely what criterion 11
forbids.

Live evidence, the forbidden state produced end to end:

```
POST /api/ops/projects/<id>/retry-extraction
HTTP 202 {"accepted":true,"alreadyQueued":false,"generation":0,"status":"queued"}
```

then reading the row back from D1:

```
triggered_by: "upload"
```

Reproduce:

```
npm run test:ai-jobs
```

Actual:

```
✖ an ops retry tags the reclaimed claim so the parse counts still exclude it
  AssertionError: the reclaim must record who triggered it, or an ops run is counted as an upload parse
  expected: /triggered_by=/   (scripts/tests/ai-jobs.test.mjs:385)
ℹ tests 15  ℹ pass 14  ℹ fail 1
```

The failing test is at `scripts/tests/ai-jobs.test.mjs:376`. The existing test at
`scripts/tests/ai-jobs.test.mjs:203` asserts the opposite —
`assert.doesNotMatch(writes[0].sql, /triggered_by/, "the in-place reset never touches triggered_by")`
— so it enshrines the defect and must be updated as part of the fix, not worked
around.

### F3 — An ops retry rewrites the chart's history (MEDIUM)

Both the buckets and the SQL window key on `updated_at`, which the retry path
overwrites. Observed live: retrying a document whose parse had failed on
2026-09-03 moved that error out of the `2026-09-03` bucket and into `2026-09-05`.
The chart is presented as a 7-day record of what happened; a past day quietly
changing its numbers undermines that.

Reproduce (local worker, with an old failed claim seeded):

```
POST /api/ops/projects/<id>/retry-extraction
# then run the cron and compare the day buckets before and after
```

Fixing F2 removes the visible symptom for ops retries, because an `'ops'`-tagged
row leaves the counts entirely. The underlying property — buckets keyed on a
mutable timestamp — remains, and the developer should decide whether the bucket
date should come from a stable column instead.

### F4 — The credit-floor comparison is not pinned by any test (LOW)

Mutating `<` to `<=` at `src/data/monitoring.ts:223`
(`balance.creditBalanceUsd < floorUsd`) leaves both `test:ai-monitoring` and
`test:ops2` fully green. The boundary case — a balance exactly equal to the floor —
is unspecified and untested, so behaviour at the threshold can drift unnoticed.

Reproduce: change `<` to `<=` on that line, run `npm run test:ai-monitoring` and
`npm run test:ops2` (both stay green), then restore.

### F5 — The cap-ceiling comparison is not pinned by any test (LOW)

Same result at `src/data/monitoring.ts:206`: mutating `>` to `>=` inside
`capBreached` leaves every suite green. The existing test `capBreached: the page's
warning and the server's red flag agree at the rounding edge` (`:763`) pins
agreement between two callers, not the threshold itself.

Reproduce: change `>` to `>=` on that line, run `npm run test:ai-monitoring` and
`npm run test:ops2` (both stay green), then restore.

### F6 — `04-build.md` reports the wrong pre-existing typecheck count (COSMETIC)

`docs/runs/ai-parse-monitoring/04-build.md:43` and `:56` state "59 pre-existing
non-fatal" errors. The gate reports 58.

Reproduce:

```
npm run typecheck:gate
# ✓ no fatal type errors (58 non-fatal remain)
```

### F7 — `04-build.md` overstates a test assertion (COSMETIC)

The F3/F11 notes in `04-build.md` claim `scripts/tests/ops2-attention.test.mjs`
asserts both `snapshot.floorUsd` and `ceilingPct`. Line 264 of that file asserts
`/snapshot\.floorUsd/` only.

Reproduce:

```
grep -n "ceilingPct" scripts/tests/ops2-attention.test.mjs
```

### F8 — Dead `resolveUser` import (COSMETIC)

`worker/routes/ops.ts:10` imports `resolveUser`, which has zero call sites in the
file. This feature introduced it: `git log -S"resolveUser," -- worker/routes/ops.ts`
blames `72bbfe7e` ("T4: ops monitoring route, ops-tagged retry, cron append"), and
`81d9bcd0` later removed the 401/403 split that used it.

Reproduce:

```
grep -c "resolveUser(" worker/routes/ops.ts
# 0
```

---

## 4. Routing

- **F1 and F2** block acceptance. Each needs a developer session, each has a failing
  test attached that the fix must turn green, and each requires updating an existing
  test that currently asserts the defective behaviour
  (`ai-monitoring.test.mjs:261` and `ai-jobs.test.mjs:203` respectively).
- **F3** should be decided by the developer alongside F2 — the symptom goes away
  with the fix, the property does not.
- **F4, F5, F6, F7, F8** belong in `docs/runs/ai-parse-monitoring/DEBT.md` rather
  than costing a developer session of their own.

Per the pipeline rule, no implementation code was changed here. The three new tests
live in `scripts/tests/ai-monitoring.test.mjs` and `scripts/tests/ai-jobs.test.mjs`
and are red on purpose; `git status --porcelain` shows no file modified under
`worker/`, `src/data/`, `src/ops/`, or `migrations/` by this verification.
