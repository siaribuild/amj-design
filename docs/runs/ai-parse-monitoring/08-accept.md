# ai-parse-monitoring — acceptance (stage 8)

Judged against `01-spec.md` (28 criteria). Evidence inputs: `06-verify.md` (tester),
`07-review-codex.md`, `07-review-architecture.md`, `run.json`, and the review stage logs.
No tests were re-run and no source was read for this verdict.

**Verdict: REJECT.** The build is close — the page, the cards, the chart and the
staff-only guard all demonstrably work in the harness — but it cannot be accepted as
"AI parsing is being watched" because (a) the tester's own verdict is FAIL, (b) five
criteria have no evidence on the surface they describe, (c) the money numbers are read
from Cloudflare field names that two reviewers say do not exist in the real API, so the
three money criteria pass only against fixtures the build invented, (d) the account id
is still a placeholder so the feature would be inert the moment it deployed, and (e) two
of the four mandatory reviewers never completed.

---

## 1. Per-criterion result

Legend: **MET** = tester evidence on the criterion's own surface, unchallenged by a
reviewer. **MET (at risk)** = tester evidence exists but a reviewer finding attacks the
same behaviour in production. **NOT MET** = no evidence on that surface, or evidence
contradicts the criterion.

### Money cards

| # | Criterion (short) | Result | Evidence |
|---|---|---|---|
| 1 | Balance card shows `$12.34`, no Cloudflare call on page load | MET (at risk) | `06-verify.md` — ai-monitoring 16/16, Playwright ops2-attention 16/16, probe `.codex-tmp/verify/probe.mjs`. Risk: architecture High 2 — snapshot reads invented Cloudflare fields (`usage.totalUsd`), so the passing fixture is fictional. |
| 2 | Cap outstanding shows headroom `$12.00` against cap `$20.00`, nothing hardcoded | MET (at risk) | As above; same High 2 risk on `rules[0].amount` vs documented `rules[].limit`. |
| 3 | Per-gateway cap, falls back to account-level, source recorded | MET (at risk) | ai-monitoring suite covers both paths; High 2 says the fallback reads `account.limit` where the API returns `config.amount`. |
| 4 | No token → money cards "unavailable", counts still render | MET | ai-monitoring suite + Playwright unavailable-state stub, `06-verify.md`. |
| 5 | Cloudflare non-2xx/timeout → counts refresh, money unavailable, failure logged, page loads | MET | ai-monitoring suite, `06-verify.md`. Codex P2 (validate result shapes before `available: true`) is a hardening gap on the same path. |
| 6 | Snapshot older than 30 min → each card states "as at HH:MM" | **NOT MET** | Tester recorded PASS\* — logic tested, **stale state never rendered in a browser** (finding F4). No evidence on the card surface the criterion describes. |

### Parse counts

| # | Criterion (short) | Result | Evidence |
|---|---|---|---|
| 7 | 40 successes / 3 errors in last 7 days | MET (at risk) | ai-jobs 14/14 + `PARSE_OUTCOME_SQL` probe, `06-verify.md`. Risk: Codex P2 — window starts at `now − 6 days`, so a rolling 7×24h window silently drops up to a day of rows. |
| 8 | Retried document counts once | MET | ai-jobs suite, `06-verify.md`. |
| 9 | 31-minute `processing` with attempts exhausted counts as one error | MET (at risk) | ai-jobs suite. Tester low F8: the SQL omits the "attempts exhausted" clause, so a row still eligible for retry is counted as an error. |
| 10 | 5-minute `processing` counts as neither | MET | ai-jobs suite. |
| 11 | Ops-triggered building-model run excluded | MET | ai-jobs suite; `triggered_by = 'upload'` filter, migration 0064. Tester low F10 flags the backfill defaulting historic rows to `'upload'`. |
| 12 | No parses → cards `0`, chart empty state | MET | Playwright ops2-attention empty-state case, `06-verify.md`. |

### Chart

| # | Criterion (short) | Result | Evidence |
|---|---|---|---|
| 13 | 7 buckets, sums equal the cards | MET (at risk) | ai-monitoring + Playwright. Risk: architecture Medium — Melbourne DST bucketing drops a day (worked example: `2026-10-05 00:30` omits October 4); Codex P2 window gap compounds it. |
| 14 | Zero-parse day appears as a zero bucket | MET (at risk) | Same evidence and same DST/window risk. |

### Notification bubble

| # | Criterion (short) | Result | Evidence |
|---|---|---|---|
| 15 | Not red → count 0, no bubble drawn | **NOT MET** | PASS\*. Finding F1: the bubble has **zero browser coverage** — every Playwright stub passes `notificationCount: 0`, so "no bubble drawn" is asserted by absence in a state that was never varied. |
| 16 | Balance below floor → bubble shows `1` | **NOT MET** | PASS\*. F1 (no browser coverage) plus F3: the red state is unreachable on the page while the bell can read 1 — self-declared in `05-polish.md`, confirmed by Codex P2 ("surface server-computed red state on money cards"). |
| 17 | Cap % above ceiling → `1`; both conditions → still `1` | **NOT MET** | PASS\*. Same F1/F3. Tester low F9: `evaluateRed` has no `capUsd === 0` guard. |
| 18 | Tapping the bubble navigates to Attention | **NOT MET** | PASS\*. F1 — the bubble is never rendered non-zero in a browser, so the tap-through was never walked. |
| 19 | Money unavailable → count 0, no false alarm | MET | ai-monitoring suite, `06-verify.md`. |
| 20 | Second source appends without changing bubble/aggregation/container | MET | Tester confirmed one v1 implementation, no source-specific branching. Architecture Medium: one rejected source fails the whole endpoint via `Promise.all` — a robustness gap, not a violation of this criterion. |

### Freshness / cron

| # | Criterion (short) | Result | Evidence |
|---|---|---|---|
| 21 | Existing `*/10` cron writes one snapshot, no new trigger | MET | ai-monitoring suite + api 77/77, `06-verify.md`; conformance verdict CONFORMS. |
| 22 | Two pages open → no Cloudflare call, same KV snapshot | MET | `06-verify.md` probe. Codex P3 / architecture Medium: two KV reads per request, not atomic — a correctness smell on freshness, not on this criterion. |

### Abuse cases

| # | Criterion (short) | Result | Evidence |
|---|---|---|---|
| 23 | Signed-out visitor → 401/403, no figures | MET | Live-server abuse test, `06-verify.md`. |
| 24 | Customer → 403, no data | MET | Live-server abuse test. |
| 25 | Manufacturer partner → 403, no data | MET | Live-server abuse test including a real role-flip on `verify-partner@openframe.com.au`. |
| 26 | Payload carries no token, account id or gateway credential | MET | Payload inspected in the abuse run. |
| 27 | Failure log contains no token or Authorization value | MET (at risk) | Log line inspected — no token. Tester low F6: the **account id** appears in a transport log line, which criterion 26 forbids in the payload and is the same class of leak in logs. |
| 28 | Customer guessing `/attention` refused by the same ops2 staff guard — no new auth path | **NOT MET** | Tester's negative test passes against the session path, but architecture **High 1** is precisely this criterion's failure: `worker/routes/ops.ts:354` uses session-only `resolveUser` instead of `resolveOpsUser`, bypassing the production Cloudflare Access seam. That *is* a new auth path — Access-authenticated staff can be refused, and an internal session can bypass the fail-closed path. |

**Tally: 6 NOT MET (6, 15, 16, 17, 18, 28), 9 MET (at risk), 13 MET.**

---

## 2. Descoping check

Nothing in the spec was quietly dropped: all five cards, the chart, the bubble, the cron
write and all six abuse cases were built and exercised. The gap is not missing scope, it
is **missing evidence on the notification surface** (criteria 15–18) and **missing
evidence on the stale surface** (criterion 6). The tester was straight about this —
PASS\* is marked and explained, not disguised as PASS. That honesty is why the run is
rejectable rather than falsely acceptable.

One near-descope to name: F3 (red state unreachable on the page while the bell can read
1) was self-declared during polish and left as a decision rather than fixed. As shipped,
an owner could see a `1` on the bell, click through, and find nothing on the page marked
red. That defeats the business intent of criteria 16 and 17 even though the count itself
is correct.

## 3. Scope creep check

None found. Conformance verdict: **CONFORMS** — every path named in `02-tasks.json`
(T1–T6) exists in the diff and all three design-named test files exist and are wired
(`ai-monitoring.test.mjs` created; `ai-jobs` and `api-edge` extended). No customer
surface was touched. No alerting, drill-down, dismissal or queue introspection appeared.
Migration 0064 (`ai_job_claim.triggered_by`) is design-sanctioned and necessary for
criterion 11.

## 4. ASSUMED tags

Six assumptions were tagged in the spec; **none was put to the owner and none was
vetoed**. They stand as un-signed-off, and two are now load-bearing on defects:

| ASSUMED | Status |
|---|---|
| Thresholds $5.00 floor / 80% ceiling in wrangler vars | Built as specced. Needs sign-off. |
| Rolling 7×24h window, Melbourne day buckets | Built as specced but **implemented wrong** (Codex P2 window; architecture DST bucket). Needs sign-off *and* a fix. |
| USD only, no AUD conversion | Built as specced. Needs sign-off. |
| "Cap outstanding" = cap minus billed spend | Built as specced. Needs sign-off. |
| Cards sit below "what needs a person" content | Moot in v1 — no such content exists yet. |
| Stale snapshot shown with timestamp, not suppressed | Built, but never verified in a browser (criterion 6 / F4). |

## 5. Pipeline integrity — the review layer is incomplete

`run.json` records `review-security` exit code **1** and `review-ponytail` exit code
**1**. Neither wrote a report; no `07-review-security.md` or `07-review-ponytail.md`
exists. Their logs give the cause: *"Autocompact is thrashing: the context refilled to
the limit within 3 turns of the previous compact, 3 times in a row."* That is a tooling
failure, not a clean review — this feature touches account financial data and a staff
auth boundary, and **it has not had its security review**. Per house rule, that must not
be presented as reviewed. The architect-conformance verdict also exists only inside its
log, not as a `07-review-conformance.md` file.

Both reviewers must be re-run (with a capped window) before any merge or deploy.
Separately, `wrangler.jsonc:133` still reads
`CF_ACCOUNT_ID = "paste-real-cf-account-id-before-deploying"` (tester F5, Codex P1) —
deployed as-is, every money card would show "unavailable" forever and the whole point of
the feature would be silently absent.

---

## 6. What goes back to the developer

Blocking, in order of business impact:

1. **High 1 (architecture)** — route the endpoint through `resolveOpsUser` / the ops2
   staff guard, rejecting manufacturer roles. Criterion 28.
2. **High 2 (architecture)** — use the documented Cloudflare response fields
   (`history[].aggregated_value`, `rules[].limit`, `config.amount`) and re-cut the
   fixtures that currently encode invented shapes. Criteria 1–3.
3. **F5 / Codex P1** — real `CF_ACCOUNT_ID`, and make a missing/placeholder id fail
   loudly rather than degrade to "unavailable".
4. **F1 + F3** — put the red state on the page (server-computed flag) and give the
   bubble real browser coverage at counts 0 and 1 including the tap-through.
   Criteria 15–18.
5. **F4** — render the stale state in a browser test. Criterion 6.
6. **Codex P2 window + architecture DST bucket** — a true rolling 7×24h and correct
   Melbourne day bucketing. Criteria 7, 13, 14.
7. **F2 / Codex P1** — derive the fixture timestamp from test time; the hard-dated
   `2026-09-05T04:30:00.000Z` expires today.
8. **F6** — drop the account id from the transport log line. Criterion 27.
9. Re-run `/security-review` and `ponytail-review` to completion.

Lows F7–F12 (D1 local-time parse, `capUsd === 0` guard, attempts-exhausted clause,
0064 backfill, double KV read, field whitelist) travel with the fix round; none alone
blocks acceptance.

Verification also ran against a **dirty working tree** (HEAD `a38e94d7` plus uncommitted
polish edits). The re-verify must run on a committed tree so the green result names a
commit.
