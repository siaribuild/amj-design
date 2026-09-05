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

## T4 - Route GET /api/ops/monitoring, ops trigger tag, cron append
Files: worker/routes/ops.ts, worker/index.ts, scripts/tests/api-edge.test.mjs.
Route gates on resolveUser (401 no session) then isStaffUser (403 wrong role),
matching the manufacturer/customer split every other ops route needs.
retryCurrentAiExtraction ops call now tags triggeredBy "ops" so T3's
triggered_by='upload' SQL doesn't count ops retries. scheduled() appends
writeMonitoringSnapshot(env).catch(...), independently caught like siblings.
crons list unchanged. api-edge subtest covers anon 401, customer 403,
manufacturer 403, staff 200, all with leakage checks; pre-cron snapshot is
null, notificationCount 0. Full test:api: 77 pass, 0 fail. typecheck:gate
clean (59 pre-existing non-fatal, unchanged).

## T5 - Attention page monitoring cards + 7-day CSS-bar chart
Files: src/ops2/attention/useMonitoring.ts (new), AttentionPage.tsx,
styles/attention.css. useMonitoring fetches /api/ops/monitoring only
(loading/empty/ready/error/unauthorised), formatAsAt via Melbourne
Intl.DateTimeFormat. Page renders monitoring below attention groups: credit
balance + cap-headroom cards (capOutstanding from src/data/monitoring.ts),
success/error 7-day count cards, CSS-bar chart. money.available false ->
"unavailable" state, not zero; counts/chart unaffected. All-zero week ->
att-chart__empty text. null snapshot -> pq-empty monitoring-empty testid.
node:test source-regex suite: 10/10 pass. Playwright: 5 new specs (ready,
unavailable money, all-zero chart, no-snapshot, 500-retry), full spec file
16/16 pass. typecheck:gate clean (59 pre-existing non-fatal, unchanged).
Committed 98d2bc98.

## T6 - Notification bubble: shared count hook, desk bell badge, phone tab badge
Files: src/ops2/chrome/useNotificationCount.ts (new), OpsPage.tsx, Ops2App.tsx,
styles/nav.css, scripts/tests/ops2-frame.test.mjs. useNotificationCount:
module-level {value,fetchedAt} cache (60s TTL) + shared inflight promise, so
bell + tab coalesce to one /api/ops/monitoring fetch; fetch error/non-ok falls
back to last cache or 0. Desk bell (OpsPage.tsx) and phone attention
IonTabButton (Ops2App.tsx, d.id==="attention") each render a badge span only
when notificationCount > 0; both already land on HOME_PATH ("/attention").
nav.css: .ops2-bell position:relative + .ops2-bell__badge / .ops2-tab-badge
dots, --ds-color-error, mirroring the existing .tab-selected::before pattern.
Tests: source-regex assertions on both call sites (import/call/conditional/
class) plus an executed esbuild-bundled check on __testing.fetchNotificationCount
(inflight coalescing == 1 fetch, TTL cache hit, error fallback to 0) — this
one was run red first against a deliberately-broken implementation, then
implementation restored, per Probity's retrofit block. test:ops2 106/106,
typecheck:gate clean. Committed a38e94d.

## F3/F11 fix - one snapshot read, server-evaluated red flag

Finding (06-verify.md F3): the red card was unreachable — nothing in the
payload carried a server-evaluated red decision, so the client had no source
to render red from without re-deriving it from raw numbers (banned, UX §4/
§6.2). F11 named the same route's second half: the bell and the page each
triggered their own KV read.

Red tests first: `ai-monitoring.test.mjs` — `monitoringPayload` ships
`snapshot.red`/`floorUsd`/`ceilingPct` off ONE KV `get` (asserted via a call
counter), and returns `{snapshot:null, notificationCount:0}` on no snapshot.
`ops2-attention.test.mjs` — source-regex on `AttentionPage.tsx`: every
`data-state={...}` driving a red card must contain `snapshot.red` and no
`<`/`>` (proves no raw-number comparison), plus `snapshot.floorUsd`/
`ceilingPct` and the "Below the"/"cap used" copy must be present. Both
watched fail for the right reason (no `monitoringPayload` export; no
`snapshot.red` in the source) before any implementation.

Fix: `worker/lib/monitoring.ts` gained `monitoringPayload(env)` — the ONE
`readMonitoringSnapshot` call the route now makes, enriching the stored
shape with `red`/`floorUsd`/`ceilingPct` computed fresh (never persisted to
KV) and passing that same snapshot into `notificationCount(env, snapshot)`
(now takes an optional pre-read snapshot instead of always reading KV
itself). `aiBudgetRed` takes a `NotificationContext {env, snapshot}` instead
of doing its own read. `worker/routes/ops.ts` thinned to
`c.json(await monitoringPayload(c.env))`. `useMonitoring.ts`'s
`MonitoringSnapshot` type and ready-state validation extended to require and
carry `red`/`floorUsd`/`ceilingPct`. `AttentionPage.tsx`'s two AI-budget
cards key `data-state` off `snapshot.red` and their red copy off
`snapshot.floorUsd`/`ceilingPct`; `attention.css` adds the
`.att-card[data-state="red"]` rule.

This lands alongside the 05-polish.md rework of the same files (freshness
line, skeleton/empty/chart redesign, `att-group` sections) that was sitting
uncommitted from the pipeline's own polish stage — fused at the line level
in `AttentionPage.tsx`/`attention.css`, not separable by hunk. The bell/tab
badge switch from a dot to a visible count (`OpsPage.tsx`, `Ops2App.tsx`,
`nav.css`) is the same "reads the one snapshot-derived count" story as F11
and is included with it.

`npm run test:ops2` 107/107, `npm run test:api` 77/77, `npm run
typecheck:gate` clean, full `npm test` 321/321.

## Review fixes — F1, F2, F4, F5 (06-verify.md)

Files: `scripts/tests/web/ops2-attention.spec.ts` only. `wrangler.jsonc` and
`worker/lib/monitoring.ts` needed no change — F5's server-side
`account_id_missing` reason and the UI's distinct "No Cloudflare account
configured" copy were already shipped and tested (see F3 entry above); the
finding's own text confirmed this, asking only for a browser-level test.
`CF_ACCOUNT_ID` in `wrangler.jsonc` stays the placeholder string — never
invented a real one.

**F2** (`takenAt` hard-pinned to a wall-clock date, breaks once real time
passes it): `FRESH_TAKEN_AT`/`READY_SNAPSHOT` fixture now computes
`takenAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()` — relative to
test run time, not a fixed date.

**F4** (stale state never rendered in a browser): one new test, "monitoring:
stale snapshot renders the stale sentence and per-card as-at stamps" —
`takenAt` 45 minutes back, asserts the `.att-asat` freshness line contains
"The 10-minute job may have stopped." and all four `.att-card__stamp`
elements are visible.

**F1** (bell has zero browser coverage): three new tests, desk bell only
(`OpsPage.tsx`'s `.ops2-bell`) — "bell: no badge when notificationCount is
0", "bell: badge reads 1 when notificationCount is 1", "bell: clicking it
lands on /attention" (navigates from `/projects` first, so the click proves
a real route change). Phone tab badge (`Ops2App.tsx`'s `.ops2-tab-badge`) is
deliberately not duplicated — both read the same `useNotificationCount()`
module-level cache from the same `/api/ops/monitoring` fetch (see the
shared-source comment at `OpsPage.tsx:168`), so one surface's coverage
stands for both sources of truth being wired correctly.

**F5**: confirmed already covered by the existing "monitoring: money
unavailable with a missing/placeholder CF_ACCOUNT_ID says so distinctly from
a missing token" test — no server or UI change, no new test needed beyond
F1/F4 above.

`npx playwright test scripts/tests/web/ops2-attention.spec.ts` 21/21 (4 new:
1 stale + 3 bell). `npm run typecheck:gate` clean. Full `npm test` 321/321.

## Fix rounds 2 and 3 — applied by the conducting session, by hand

The conductor refused further `conduct fix` sessions once `verifyRounds` hit its
cap, and handed judgement over ("ship it, or fix it by hand"). Shipping a route
that answers 401 to every production staff request was not an option, so these
were applied directly, each test-first. Recorded here because the acceptance
stage reads this file and not the git log.

### Round 2 — verify round-2 findings (`e9b4f692`, `1c924202`, `5d07807a`)

- **V-F1 (HIGH)** `worker/routes/ops.ts` resolved identity with `resolveUser`,
  which reads the session cookie only. Production fronts ops.* with Cloudflare
  Access, where identity arrives as an assertion header and no cookie exists —
  so the route answered 401 to every real staff request while the local suite,
  which blanks Access, stayed green. Now gated by `resolveStaff` like its 41
  siblings. Test: `V-F1` in `ai-monitoring.test.mjs`.
- **V-F2** the SQL window (rolling 7×24h) reached further back than the seven
  Melbourne calendar buckets, so D1 returned rows no bucket could hold and they
  vanished from the chart *and* the card totals. `parseWindowStart` is now the
  single boundary. Test: `V-F2`.
- **V-F3** a zero cap divided to `NaN` (read as "not red") with no spend and
  `Infinity` with any. Test: `V-F3`.
- **V-F4** `parseMonitoringSnapshot` returned the caller's own object, passing
  unknown stored fields through to the client. It now rebuilds field by field.
  Test: `V-F4`.

### Round 3 — the review stage's findings (`6b961425`, `8607c397`, `4079d489`, `7f17722a`)

- **Codex P1 / architecture Critical — the Cloudflare adapter did not match
  Cloudflare.** Usage was read as `result.totalUsd` (it is
  `result.history[].aggregated_value`, summed), the gateway cap as
  `rules[0].amount` (it is `rules[].limit`), the account cap as `result.limit`
  (it is `result.config.amount`, in CENTS). `value_grouping_window` — a REQUIRED
  query parameter — was missing, so the usage call was a 400 regardless. Tests:
  "decodes the documented Cloudflare response shapes", "the account fallback
  converts cents to dollars".
- **Codex P1 / architecture High — the cap percentage compared incompatible
  scope and period.** Account-lifetime usage was divided by a per-gateway,
  per-window cap whose `window` was discarded, so the ratio described no
  enforced budget and only ever climbed. The usage query is now bounded to the
  cap's own window, and the scope is checked: with more than one gateway on the
  account the budget reports `spend_not_attributable` rather than publish a
  percentage that overstates. Tests: "usage is asked for over the cap's OWN
  window", "a second gateway makes the cap percentage unattributable".
- **Codex/architecture Medium — one failure domain for three numbers.** Balance,
  spend and cap shared one `available` flag and one try/catch, so a cap blip
  discarded a good credit balance and silenced the low-credit alarm. `MoneySnapshot`
  is now `{ balance, budget }`, fetched and failing independently. Test: "a
  failed cap lookup never silences a real low-credit alarm".
- **Codex P2 — both money cards reddened from one flag.** The server now ships
  `redBalance` and `redCap`; the bell still counts the pair as one notification.
  Tests: "one breached condition reddens only its own card", `ops2-attention.test.mjs`.
- **Codex P2 — an empty billing month read as a broken snapshot**, hiding the
  balance and cap too. Only a missing or non-array `history` is malformed now.
- **Codex P2 — a disabled spend limit was still read as a cap.**
- **Codex P2 — `takenAt: "invalid"` passed the parser**, then threw inside
  `Intl.DateTimeFormat.format` and blanked the page. The boundary now requires a
  parseable instant.
- **Architecture Medium — every hook instance ran its own poll interval**, and
  Ionic keeps routed pages mounted, so timers accumulated. One module-owned,
  reference-counted loop now.
- **Architecture Low — `JSON.parse` sat outside the KV seam**, so a corrupted
  stored value threw out of the route as a 500.
- **Ponytail — the 401/403 split was never read** (the panel renders one message
  for both), costing a second identity round-trip per denial. Collapsed to 403,
  matching every sibling route; `hasOpsCredential` deleted.
- **Architecture Medium — `Promise.all` over notification sources** would let one
  future source reject the whole payload. Now `allSettled`.

### Verification run by hand after those fixes

`typecheck:gate` clean · `ai-monitoring` 43/43 · `ops2` 107/107 · `api` 77/77 ·
`ai-jobs` 14/14 · `ai-pipeline` 78/78 · `estimator-learning` 33/33 ·
Playwright `ops2-attention.spec.ts` **21/21** (on the fifth attempt — port 8788
is shared with another worktree that was cycling E2E runs).

This is the conducting session's own verification, NOT an independent tester
pass. That gap is what the verify stage below is for.
