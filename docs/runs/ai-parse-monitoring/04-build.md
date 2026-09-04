## T1 - Pure monitoring core: snapshot types, bucketing, red evaluation

Files: `src/data/monitoring.ts` (new), `scripts/tests/ai-monitoring.test.mjs` (new), `package.json` (added `test:ai-monitoring` script, appended suite to `test:pure`).

Asserts: `parseMonitoringSnapshot` accepts a well-formed snapshot and returns `null` (never partial) for 15+ malformed shapes (missing/wrong-typed money fields for both `available` branches, wrong day-bucket count/types, non-number totals). `assembleParseCounts` builds exactly 7 oldest-first Melbourne-calendar-day buckets (zero rows → all-zero buckets with correct day keys) and bucket sums equal `success7d`/`error7d` for real rows. `evaluateRed` returns `false` when money unavailable, `true` below the $ floor, `true` above the % ceiling, one boolean when both trip, `false` when neither trips. `capOutstanding` = `capUsd - billedSpendUsd`.

For T2: KV storage, the snapshot-fetch/refresh path, and the counting-predicate SQL belong in `worker/lib/monitoring.ts` — out of scope here, this module is pure (no IO, no Worker types) per design §3.1-3.3.

## T2 - Migration 0064 triggered_by + threading through enqueue/retry

Files: `migrations/0064_ai_job_claim_triggered_by.sql` (new, additive ADD COLUMN, no cascade — nothing REFERENCES `ai_job_claim`), `worker/lib/ai/jobs.ts`, `scripts/tests/ai-jobs.test.mjs`.

`enqueueAiExtraction` gained a trailing `triggeredBy: "upload" | "ops" = "upload"` param, now bound into the `ai_job_claim` INSERT's new `triggered_by` column. `retryCurrentAiExtraction` gained the same trailing param, threaded ONLY into its completed-generation fall-through `enqueueAiExtraction` call — never into the in-place reclaim UPDATE, which still has no `triggered_by` reference (asserted directly).

Tests (2 new + 1 extended assert, all in `ai-jobs.test.mjs`): INSERT carries `triggered_by` defaulting `'upload'`; `retryCurrentAiExtraction(..., "ops")` on a completed-generation claim threads `'ops'` into the fall-through INSERT; existing "staff retry resets..." test now also asserts the reclaim UPDATE's SQL does NOT match `/triggered_by/`.

`npm run test:ai-jobs` (14/14), `npm run typecheck:gate`, `npm run db:migrate:local` all green. `worker/routes/parse.ts` untouched.

Next task: wire `worker/routes/ops.ts` (staff retry → pass `"ops"`) and confirm `worker/routes/parse.ts` keeps the `'upload'` default — both out of scope here, not in T2's allowed files.

## T3 - IO shell: money fetch, count query, snapshot write/read, notification sources

Files: `worker/lib/monitoring.ts` (new), `worker/types.ts`, `wrangler.jsonc`, `scripts/tests/ai-monitoring.test.mjs`.

`writeMonitoringSnapshot` runs the §3.2 count SQL verbatim (`triggered_by='upload'`, 30-min processing clause), calls `fetchMoneyNumbers`, writes to KV (no TTL). `fetchMoneyNumbers`: token missing → `{available:false,reason:'token_missing'}`, zero fetches; on any failure still resolves with `available:false` and logs only the path suffix + status (no token/Authorization, asserted). Gateway-cap fetch failing falls back to `/ai-gateway/billing/spending-limit`, `capSource:'account'`. `readMonitoringSnapshot` round-trips via `parseMonitoringSnapshot`. `NOTIFICATION_SOURCES` = one entry (`aiBudgetRed`); `notificationCount` sums via `Promise.all` + reduce, no branching.

`worker/types.ts`: `CF_MONITORING_TOKEN?/CF_ACCOUNT_ID?/AI_CREDIT_FLOOR_USD?/AI_CAP_CEILING_PCT?` after `AI_GATEWAY_ID`. `wrangler.jsonc` vars: `CF_ACCOUNT_ID`, `AI_CREDIT_FLOOR_USD:"5"`, `AI_CAP_CEILING_PCT:"80"` — token is secret-only, absent here.

`npm run test:ai-monitoring` 16/16, `npm run typecheck:gate` green.

Next task: wire a route/cron to call `writeMonitoringSnapshot` on the `*/10 * * * *` trigger and expose `readMonitoringSnapshot`/`notificationCount` to ops — not in T3's allowed files.
