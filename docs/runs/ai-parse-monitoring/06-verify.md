# 06 — Independent verification: AI parse monitoring (round 2)

Tester stage over the `feat/ai-parse-monitoring` work described in `04-build.md`,
checked against the 28 acceptance criteria in `01-spec.md`. Nothing reported by
the developer was taken on trust; every row below carries evidence produced
first-hand in this session. Where a criterion could only be checked by reading
code, the row says so explicitly rather than implying execution.

---

## Verdict: **FAIL**

One HIGH finding — the monitoring endpoint authenticates through a path that does
not exist in production, which breaches criterion 28 directly and makes criteria
1–22 unreachable for real staff once deployed. Two MEDIUM correctness findings in
`src/data/monitoring.ts`. Two LOW findings and one COSMETIC set of build-report
discrepancies.

The feature is well built and well tested *for the environment the tests run in*.
That is precisely the problem: the local harness disables Cloudflare Access, so
the entire local suite passes against a code path production never takes.

### Gates run in this session

| Command | Result |
| --- | --- |
| `npm run typecheck:gate` | exit 0 — 62 non-fatal diagnostics, 0 fatal |
| `npm run test:ops2` | tests 107 / pass 107 / fail 0 |
| `npm run test:api` | tests 77 / pass 77 / fail 0 |
| `npm run test:ai-jobs` | tests 14 / pass 14 / fail 0 |
| `node --test scripts/tests/ai-monitoring.test.mjs` | tests 23 / pass 19 / **fail 4** — the four `V-F*` tests added to pin the findings below. Before those additions this file was 19/19. |
| `npx playwright test scripts/tests/web/ops2-attention.spec.ts` | 21 passed (1.1m) — the UI coverage requirement is satisfied, including the bubble and stale-state gaps raised in round 1 |

Live abuse-case execution used `node scripts/tests/web-server.mjs` on
`127.0.0.1:8788` (migrated and seeded local D1), with `curl` transcripts recorded
per criterion below.

---

## Findings

### V-F1 — HIGH — the monitoring route introduces a new auth path that production does not serve

**Criterion violated:** 28 ("refused by the same ops2 staff guard every other ops2
surface uses — no new auth path is introduced for this page"). Consequentially
criteria 1–22 as well: in production no staff request reaches the payload at all.

`worker/routes/ops.ts:355` resolves identity with `resolveUser`:

```ts
ops.get("/monitoring", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);          // worker/routes/ops.ts:355
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const staff = user.type === "internal" ? { role: user.role } : null;
  if (!isStaffUser(staff)) return c.json({ error: "forbidden" }, 403);
  return c.json(await monitoringPayload(c.env));
});
```

`resolveUser` (`worker/lib/auth.ts:379`) reads the `sess:<token>` session cookie
out of KV and nothing else. It has no Cloudflare Access support. Every other ops
route — 41 of them — uses `resolveStaff`, which chooses between the Access JWT
(`Cf-Access-Jwt-Assertion`) and the session cookie depending on configuration
(`worker/lib/staff.ts`). This route is the only exception:

```
$ grep -rn "resolveUser" worker/routes/ops.ts
355:  const user = await resolveUser(c.env, c.req.raw);
```

Production has Access configured — `wrangler.jsonc:171` sets
`"ACCESS_TEAM_DOMAIN": "drg-group"` and `"ACCESS_AUD": "89cb7205…"`. When those
are set, staff identity arrives as an Access JWT header, the ops OTP routes that
mint session cookies return 404, and there is no `sess:` cookie for `resolveUser`
to find. The route therefore answers **401 to every genuine staff request in
production**, and the Attention page renders its "sign in" denial screen to an
owner who is already signed in.

The reason no existing test catches this is in the harness itself
(`scripts/tests/web-server.mjs:56-68`):

```js
// Local/E2E env: dev OTP codes on, Cloudflare Access off (staff session fallback),
"--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:",
```

With Access blanked, the cookie path is live, so the local staff session works and
all 21 Playwright tests plus the `test:api` abuse cases pass. They exercise a
branch production does not take.

The route comment defends the choice — it wants 401 and 403 to be distinguishable
so the panel can tell "sign in" from "not for you". That is a legitimate UX need
and it is not the reason to reject the finding; the fix is to obtain that
distinction from `resolveStaff` (or a small shared helper over it), not to
reintroduce a cookie-only reader that Access bypasses.

Reproduce:

```
node --test scripts/tests/ai-monitoring.test.mjs
```

Fails at `V-F1 GET /api/ops/monitoring uses the shared ops staff guard
(criterion 28: no new auth path)`, `AssertionError [ERR_ASSERTION] … operator: '=='`
— "the monitoring route must resolve identity through resolveStaff like every
other ops route".

A behavioural reproduction is to run the harness with Access left configured
(`--var ACCESS_TEAM_DOMAIN:drg-group`) and request `/api/ops/monitoring` with a
staff session; it answers 401 where `/api/ops/summary` answers 200.

---

### V-F2 — MEDIUM — up to 24 hours of parses inside the SQL window are silently discarded

**Criteria affected:** 7 (card totals) and 13 (bucket sums equal the cards).

`worker/lib/monitoring.ts:10` selects a **rolling 7×24h** window:

```sql
AND updated_at >= datetime(?, '-7 days')
```

`assembleParseCounts` (`src/data/monitoring.ts:33-47`) then builds buckets for the
seven Melbourne **calendar days** `now-6d … now`, and drops anything that misses:

```ts
for (let i = 6; i >= 0; i--) { …days.push({ day: melbourneDayKey(d), … }); }
const byDay = new Map(days.map((d) => [d.day, d]));
for (const row of rows) {
  const bucket = byDay.get(melbourneDayKey(new Date(row.updatedAt)));
  if (!bucket) continue;          // src/data/monitoring.ts:47
  …
}
```

The rolling window reaches back to `now − 168h`; the earliest bucket starts at
00:00 Melbourne on `now − 6d`. Everything between those two boundaries — up to
23h59m of real parses, in the worst case a whole day of traffic — is returned by
D1 and then thrown away by the `continue`. It is missing from the chart *and*
from the success/error cards, because the totals are accumulated inside the same
loop. Staff see under-reported error counts with no indication anything was
dropped.

Spec §4's assumption (rolling 7×24h SQL window, Melbourne calendar-day buckets)
and the implementation are individually defensible; they simply do not line up,
and the mismatch is currently resolved by discarding data. Either the SQL window
should start at the earliest bucket's Melbourne midnight, or the out-of-bucket
rows should still be counted in the card totals.

Reproduce:

```
node --test scripts/tests/ai-monitoring.test.mjs
```

Fails at `V-F2 assembleParseCounts: rows inside the rolling 7x24h SQL window are
never dropped by calendar bucketing` — `actual: 1, expected: 2`, "every success
the SQL window returned must be counted". The fixture puts `now` at 2026-09-05
14:00 Melbourne and two rows at 2026-08-29 16:00 and 20:00 Melbourne, both inside
`now − 7d`, both dropped.

---

### V-F3 — MEDIUM — a zero spend cap produces `NaN` and reads as "not red"

**Criterion affected:** 17 (cap-used percentage above the ceiling shows 1).

`src/data/monitoring.ts:71`:

```ts
if ((money.billedSpendUsd / money.capUsd) * 100 > ceilingPct) return true;
```

With `capUsd === 0` — an account with no headroom at all, which is exactly the
state this feature exists to warn about — the expression is `0/0 = NaN` when
spend is also zero, and `NaN > 80` is `false`. The bubble stays at 0 and the page
is not red. With any non-zero spend it becomes `Infinity > 80`, so the same
account flips between "fine" and "red" on the presence of a single cent of spend.
Both behaviours come from one unguarded division, so this is a single defect.

`money.available === false` is handled above this line, so this is not the
"unavailable never reds" case of criterion 19 — the numbers are present and
claimed valid.

Reproduce:

```
node --test scripts/tests/ai-monitoring.test.mjs
```

Fails at `V-F3 evaluateRed: a zero spend cap is red whenever there is spend, and
never NaN-quiet` — `actual: false, expected: true`, "cap of 0 means no headroom
at all — that is a red, not a quiet false".

---

### V-F4 — LOW — `parseMonitoringSnapshot` validates but does not whitelist

**Criterion affected:** 26, as defence in depth. No live leak today.

`parseMonitoringSnapshot` (`src/data/monitoring.ts:4-24`) checks the fields it
cares about and then returns the caller's object unchanged (`return record;`,
line 24). Anything else present in the stored KV value flows through it, through
`monitoringPayload`'s spread (`worker/lib/monitoring.ts:118`) and out to the
client. A planted `internalDebug: "leak-me"`, `money.cfToken`, and
`money.accountId` all survive the round trip.

Second half of the same weakness: `available` is compared with `=== true` and
`=== false` only, so `money: { available: "yes" }` matches neither branch, skips
every field check, and is returned as a valid snapshot.

Today the only writer is `writeMonitoringSnapshot`, which constructs the object
field by field (`worker/lib/monitoring.ts:21`) and never puts a token or an
account id in it, so criterion 26 is met in practice. This is the guard failing
to be a guard: the function's whole job is to be the boundary between untrusted
stored JSON and a staff-visible payload, and it passes unknown fields straight
through. Severity is LOW because exploiting it requires KV write access, which is
a larger compromise already.

Reproduce:

```
node --test scripts/tests/ai-monitoring.test.mjs
```

Fails at `V-F4 parseMonitoringSnapshot: returns only whitelisted fields and
rejects a non-boolean money.available` — `actual: 'leak-me', expected: undefined`,
"unknown top-level fields must not pass through".

---

### V-F5 — LOW — `CF_ACCOUNT_ID` is still the literal placeholder

`wrangler.jsonc:133` reads
`"CF_ACCOUNT_ID": "paste-real-cf-account-id-before-deploying"`, which is the exact
string `worker/lib/monitoring.ts:46` matches to return
`{ available: false, reason: "account_id_missing" }`. Deployed as-is, the two
money cards are permanently "unavailable" and the red bubble can never fire, so
half the feature ships inert.

The graceful degradation is correct and tested — this is a deploy-checklist item,
not a code defect. It belongs on the run's deploy notes so it is not discovered
by an owner wondering why the balance card never populates.

```
$ grep -n "CF_ACCOUNT_ID" wrangler.jsonc
133:    "CF_ACCOUNT_ID": "paste-real-cf-account-id-before-deploying",
```

---

### V-F6 — COSMETIC — `04-build.md` does not match the tree

Three claims in the build report are wrong. None affect behaviour; recorded so
the next reader does not treat the document as verified fact.

- It reports the typecheck gate at 59 non-fatal diagnostics. `npm run typecheck:gate`
  reports 62.
- It reports `test:ai-monitoring` at 16 tests. The file contained 19 before this
  pass added four.
- It describes the `account_id_missing` handling as "already shipped and tested".
  That change is uncommitted in the working tree.

---

## Criterion-by-criterion evidence

| # | Criterion | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Credit balance `$12.34`, no CF call during page load | PASS | Playwright `monitoring: ready snapshot renders cards, as-at, and 7 chart columns` (`scripts/tests/web/ops2-attention.spec.ts:281`), snapshot fixture `creditBalanceUsd: 12.34`. The page reads `/api/ops/monitoring` only, and the route body (`worker/routes/ops.ts:350-360`) calls `monitoringPayload`, which is a single KV read with no fetch. |
| 2 | Cap outstanding = headroom, with the cap it was measured against | PASS | Same Playwright test (fixture `billedSpendUsd: 40`, `capUsd: 50`); unit test `capOutstanding: cap minus billedSpend` (`scripts/tests/ai-monitoring.test.mjs:246`). Neither figure is hardcoded — both come from the snapshot. |
| 3 | Per-gateway cap, falling back to account-level, source recorded | PASS | `fetchMoneyNumbers: gateway cap failure falls back to spending-limit with capSource 'account'` (line 355). Implementation `worker/lib/monitoring.ts:58-68`. |
| 4 | No token → unavailable, not zero, not red; counts still render | PASS | `fetchMoneyNumbers: CF_MONITORING_TOKEN unset yields token_missing with zero fetch calls` (line 279) plus Playwright `monitoring: money unavailable shows an unavailable state, not zero, while counts/chart still show D1 numbers` (line 294). |
| 5 | CF non-2xx/timeout → counts still refreshed, money unavailable, logged, page loads | PASS | `writeMonitoringSnapshot: CF failure still writes fresh D1 counts with money unavailable, and logs no secret` (line 306); Playwright `monitoring: a 500 shows the error panel with a retry button` (line 345). |
| 6 | Stale snapshot states the age of the figures | PASS | Playwright `monitoring: stale snapshot renders the stale sentence and per-card as-at stamps` (line 355) — the round-1 gap is closed. |
| 7 | 40 successes / 3 errors over 7 days show on the cards | **FAIL** | The happy path passes (`assembleParseCounts: bucket sums equal the two totals for sample rows`, line 189), but V-F2 shows rows inside the SQL window are dropped from these totals. Under-reports. |
| 8 | Three retries of one document = one success, zero errors | PASS | Verified by reading the retry path rather than by a dedicated test: `retryCurrentAiExtraction` (`worker/lib/ai/jobs.ts:339-372`) resets the existing claim row in place (`UPDATE ai_job_claim SET status='scheduled', attempts=0 …`) rather than inserting a second row, so one document keeps exactly one row and terminates once. The fall-through at line 375 creates a new generation only for a re-run of an already-completed parse, which is a deliberate new run. |
| 9 | `processing` 31 min old counts as one error | PASS, with a wording gap | `writeMonitoringSnapshot: D1 count query matches design §3.2 verbatim` (line 251) pins `status = 'processing' AND updated_at < datetime(?, '-30 minutes')`. The predicate does not test `attempts`, matching the spec's "one SQL predicate" (grill decision 9) rather than the prose "with attempts exhausted"; a 31-minute row with attempts remaining also counts as an error. Recorded as a spec/implementation wording gap, not a defect. |
| 10 | `processing` 5 min old counts as neither | PASS | Same SQL predicate — the row matches none of the three status arms. |
| 11 | Ops-triggered building-model run excluded | PASS | `PARSE_OUTCOME_SQL` filters `triggered_by = 'upload'` (`worker/lib/monitoring.ts:9`). Tagging verified at every writer: `worker/routes/ops.ts:2088` passes `"ops"` into `retryCurrentAiExtraction`; the insert at `worker/lib/ai/jobs.ts:267-274` binds the parameter; the two upload-path inserts (`worker/routes/files.ts:299`, `:453`) omit the column and take the migration's `DEFAULT 'upload'`; `worker/routes/parse.ts:47` is the customer retry and correctly defaults to `upload`. |
| 12 | No parses at all → cards `0`, chart empty state | PASS | Unit `assembleParseCounts: zero rows produce exactly 7 Melbourne-day buckets, oldest-first, all zero` (line 174); Playwright `monitoring: an all-zero window renders an explicit empty chart state` (line 320) and `monitoring: no snapshot yet renders the empty state` (line 336). |
| 13 | 7 buckets, sums equal the cards | **FAIL** | The internal sum is consistent (cards and buckets accumulate in the same loop), but both are short by whatever V-F2 discards. The criterion asks the sum to equal the counts *of the window*, and it does not. |
| 14 | A zero-parse day is a zero bucket, not a missing day | PASS | Unit test at line 174 (7 buckets always emitted); Playwright asserts 7 chart columns with a zero day in the fixture. |
| 15 | Not red → count 0, no bubble | PASS | Playwright `bell: no badge when notificationCount is 0` (line 373); unit `evaluateRed: false when neither the floor nor the ceiling trips` (line 238). |
| 16 | Balance below floor → bubble `1` | PASS | `evaluateRed: true when creditBalanceUsd is below the dollar floor` (line 212); Playwright `bell: badge reads 1 when notificationCount is 1` (line 383) — the round-1 bubble gap is closed. |
| 17 | Cap-used above ceiling → `1`; both tripping → still `1` | PARTIAL | `evaluateRed: true when billedSpend/cap exceeds the percent ceiling` (line 220) and `evaluateRed: a single boolean true when both the floor and ceiling trip` (line 228) both pass. V-F3 shows the percentage arm is wrong when `capUsd` is 0. |
| 18 | Tapping the bubble navigates to Attention | PASS | Playwright `bell: clicking it lands on /attention` (line 391). |
| 19 | Money unavailable → count 0, no false alarm | PASS | `evaluateRed: false when money unavailable` (line 207); `worker/lib/monitoring.ts:88-93` returns 0 when there is no snapshot. |
| 20 | Source list appends without touching the bubble or aggregator | PASS | `NOTIFICATION_SOURCES` is a flat array with one v1 member and `notificationCount` sums it with no source-specific branching (`worker/lib/monitoring.ts:95-106`). Read, not executed — the criterion is structural. |
| 21 | Existing `*/10` cron writes one snapshot; no new trigger | PASS | `wrangler.jsonc:110` is still `["*/10 * * * *"]`, a single entry; `worker/index.ts:357` is the only `writeMonitoringSnapshot` call, inside the existing `scheduled` handler, and it writes one KV key. |
| 22 | Two ops2 pages open → no CF call, both read the same KV snapshot | PASS | `monitoringPayload: ships the server-evaluated red flag and floor/ceiling, from ONE KV read (F3/F11)` (line 427) and `monitoringPayload: no snapshot yet — null snapshot, zero notifications, no KV read wasted` (line 454). The read path contains no fetch. |
| 23 | Signed-out visitor → 401/403, no data | PASS (executed live) | `curl -i http://127.0.0.1:8788/api/ops/monitoring` → `HTTP/1.1 401 Unauthorized`, body `{"error":"unauthorized"}`. Also asserted in `scripts/tests/api-edge.test.mjs:1517` ("ops monitoring: staff-only, and leaks nothing to anyone else"), which ran green. |
| 24 | Signed-in Customer → 403, no data | PASS (executed live) | Signed in as `verify-cust-<ts>@example.com` through the dev OTP flow, then `curl -i -b cookie /api/ops/monitoring` → `HTTP/1.1 403 Forbidden`, body `{"error":"forbidden"}`. Also covered by the api-edge suite and by Playwright `a signed-in customer (non-staff) loading /attention gets the unauthorised treatment, not zero counts` (line 215), which hits the real server with a real customer session. |
| 25 | Signed-in Manufacturer partner → 403, no data | PASS (suite-executed, not hand-executed) | Executed inside `npm run test:api` (`scripts/tests/api-edge.test.mjs:1517-1543`, manufacturer-partner arm), which ran green and whose assertions were read verbatim. The hand attempt could not complete: `/api/ops/auth/challenge` for `partner@amjtradedirect.test` returned `{"ok":true}` with no `devCode` because that account is not in this instance's seed, so the follow-up request was unauthenticated and answered 401 rather than 403. |
| 26 | Payload carries no token, account id, or gateway credentials | PASS, with V-F4 | The real writer builds the snapshot field by field (`worker/lib/monitoring.ts:21`) and never includes a credential; the live staff response was `{"snapshot":null,"notificationCount":0}`. But `parseMonitoringSnapshot` does not whitelist, so anything written into KV reaches the client — see V-F4. |
| 27 | CF failure log contains no token, no Authorization value | PASS | `pathSuffix` (`worker/lib/monitoring.ts:31-34`) slices from `/ai-gateway/`, so neither the account id in the URL prefix nor the header is ever formatted into the message; asserted by the "logs no secret" arm of the test at line 306. |
| 28 | Customer guessing `/attention` refused by the same ops2 staff guard; no new auth path | **FAIL** | The refusal itself works (Playwright line 215, live 403 above), but the second half of the criterion is breached: `/api/ops/monitoring` is the only ops route not using `resolveStaff`. See V-F1. |

---

## Round-1 findings, re-checked

- Notification bubble browser coverage (criteria 15–18): **closed.** Four `bell:`
  tests now render a zero badge, a `1` badge, and a click that lands on
  `/attention`.
- Stale-snapshot rendering (criterion 6): **closed.** Covered at spec line 355.
- Hard-dated Playwright fixture: **closed.** The healthy-page test no longer
  depends on a fixed calendar date.
- Placeholder `CF_ACCOUNT_ID`: **still open**, carried forward as V-F5.

## Probed and cleared

Suspicions raised and disproved, recorded so the next round does not re-spend the
time:

- **Lexicographic vs datetime comparison in the 30-minute predicate.** Every
  writer sets `updated_at = datetime('now')`, so the stored format matches what
  `datetime(?, '-30 minutes')` produces and the comparison is sound.
- **Double counting on retry.** Covered under criterion 8 — the retry path updates
  the claim row in place.
- **Notification aggregator branching per source.** No branching; the array is
  summed uniformly.
- **Migration safety.** `migrations/0064_ai_job_claim_triggered_by.sql` is a
  single additive `ALTER TABLE … ADD COLUMN triggered_by TEXT NOT NULL DEFAULT 'upload'`.
  No table rebuild, so none of the cascade-delete risk that has bitten this repo
  before.

## Failing tests attached to this report

Appended to `scripts/tests/ai-monitoring.test.mjs` after line 460, under a header
naming this document. They are red on purpose and must not be deleted to go green:

- `V-F1 GET /api/ops/monitoring uses the shared ops staff guard (criterion 28: no new auth path)`
- `V-F2 assembleParseCounts: rows inside the rolling 7x24h SQL window are never dropped by calendar bucketing`
- `V-F3 evaluateRed: a zero spend cap is red whenever there is spend, and never NaN-quiet`
- `V-F4 parseMonitoringSnapshot: returns only whitelisted fields and rejects a non-boolean money.available`

One command runs all four:

```
node --test scripts/tests/ai-monitoring.test.mjs
```

Current output: `tests 23 / pass 19 / fail 4`.

## Routing

V-F1, V-F2 and V-F3 need a developer session. V-F4 and V-F5 are LOW and can go to
the run's debt file if the owner prefers to ship; V-F5 must reach the deploy
checklist either way, because without it the money half of the feature is inert in
production. V-F6 is a documentation correction.

No implementation code was modified by this pass.
