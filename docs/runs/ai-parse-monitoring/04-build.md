## T1 - Pure monitoring core: snapshot types, bucketing, red evaluation

Files: `src/data/monitoring.ts` (new), `scripts/tests/ai-monitoring.test.mjs` (new), `package.json` (added `test:ai-monitoring` script, appended suite to `test:pure`).

Asserts: `parseMonitoringSnapshot` accepts a well-formed snapshot and returns `null` (never partial) for 15+ malformed shapes (missing/wrong-typed money fields for both `available` branches, wrong day-bucket count/types, non-number totals). `assembleParseCounts` builds exactly 7 oldest-first Melbourne-calendar-day buckets (zero rows → all-zero buckets with correct day keys) and bucket sums equal `success7d`/`error7d` for real rows. `evaluateRed` returns `false` when money unavailable, `true` below the $ floor, `true` above the % ceiling, one boolean when both trip, `false` when neither trips. `capOutstanding` = `capUsd - billedSpendUsd`.

For T2: KV storage, the snapshot-fetch/refresh path, and the counting-predicate SQL belong in `worker/lib/monitoring.ts` — out of scope here, this module is pure (no IO, no Worker types) per design §3.1-3.3.
