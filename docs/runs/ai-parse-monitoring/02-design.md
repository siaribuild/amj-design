# ai-parse-monitoring — design

Stage 2. Sources: `docs/runs/ai-parse-monitoring/01-spec.md` (28 criteria, binding),
`docs/runs/ai-parse-monitoring/00-ask.md` (grill decisions 1–10 + addendum, binding).
Branch: `feat/ai-parse-monitoring` off `feat/ops2-attention` (591a912d) per the
grill addendum — the cards land below the attention groups that branch built.

---

## 1. Shape in one paragraph

The `*/10` cron (already firing in `worker/index.ts` `scheduled()`) gains one job:
fetch the three Cloudflare money numbers, run one D1 count query over
`ai_job_claim`, assemble a `MonitoringSnapshot`, write it to KV under
`monitoring:snapshot`. One new staff-only endpoint, `GET /api/ops/monitoring`,
returns `{ snapshot, notificationCount }` from that KV read — no Cloudflare call
ever happens on a page load (criteria 1, 22). The ops2 Attention page appends a
monitoring section (two money cards, two count cards, one 7-day CSS-bar chart)
below its existing groups; the header bell and the phone attention tab draw the
notification count. All arithmetic and validation is pure code in
`src/data/monitoring.ts`; `worker/lib/monitoring.ts` is the IO shell around it.

## 2. Hand-off file index

Every path repo-relative. Line numbers are against the base branch
`feat/ops2-attention` @ 591a912d.

### New files

| Path | What it is |
|---|---|
| `migrations/0064_ai_job_claim_triggered_by.sql` | `ALTER TABLE ai_job_claim ADD COLUMN triggered_by TEXT NOT NULL DEFAULT 'upload';` — see §4. |
| `src/data/monitoring.ts` | Pure core: snapshot types, `parseMonitoringSnapshot`, `melbourneDayKey`, `assembleParseCounts`, `capOutstanding`, `evaluateRed`. No IO, no Worker types. |
| `worker/lib/monitoring.ts` | IO shell: `fetchMoneyNumbers`, `writeMonitoringSnapshot` (cron job), `readMonitoringSnapshot`, `NotificationSource` list + `notificationCount`. |
| `src/ops2/attention/useMonitoring.ts` | Fetch hook for `/api/ops/monitoring` — copy the mechanics of `src/ops2/attention/useSummary.ts` (loading / error / data triple, abort on unmount). |
| `src/ops2/chrome/useNotificationCount.ts` | Module-cached hook (≈60s TTL, module-level promise cache — no context provider) reading the same endpoint's `.notificationCount`; shared by desk bell and phone tab. |
| `scripts/tests/ai-monitoring.test.mjs` | New node:test suite: esbuild-bundles `src/data/monitoring.ts` (pure tests) and `worker/lib/monitoring.ts` with a fake env (lib tests). Patterns: pure-bundle from `scripts/tests/ops2-attention.test.mjs:1-60`, fake `{ DB, KV }` env from `scripts/tests/ai-jobs.test.mjs:1-80`. |

### Changed files

| Path | Landing point |
|---|---|
| `worker/lib/ai/jobs.ts` | `enqueueAiExtraction` (line 245, INSERT at 265–273): optional `triggeredBy: "upload" \| "ops" = "upload"` param, written into the INSERT column list. `retryCurrentAiExtraction` (line 288): accept and thread the same param to its `enqueueAiExtraction` fall-through only — the in-place reset UPDATE (lines 337–354) must NOT touch `triggered_by` (§4.1). |
| `worker/routes/ops.ts` | (a) The ops re-parse route's call `retryCurrentAiExtraction(c.env, c.executionCtx, projectId)` at line 2074 passes `"ops"`. (b) New thin route `GET /api/ops/monitoring` guarded by `isStaffUser` (line 110) — NOT the bare `resolveStaff` pattern `/summary` uses at 311–312, because a manufacturer partner must be refused (criterion 25). Body: one call into `worker/lib/monitoring.ts`, JSON out. |
| `worker/routes/parse.ts` | Line 47 (customer retry call site): unchanged — listed so the developer verifies the default keeps it `'upload'`. |
| `worker/index.ts` | `scheduled()` at line 340: append `writeMonitoringSnapshot(env).catch((e) => console.log("[monitoring] snapshot failed", e?.message))`, matching the `.catch`-isolated siblings at 344–353. No new trigger (criterion 21). |
| `worker/types.ts` | After `AI_GATEWAY_ID` (line 54): `CF_MONITORING_TOKEN?` (secret — comment per the `ABR_GUID` precedent at lines 96–100), `CF_ACCOUNT_ID?`, `AI_CREDIT_FLOOR_USD?`, `AI_CAP_CEILING_PCT?`. |
| `wrangler.jsonc` | `vars` block (lines 113–165): add `CF_ACCOUNT_ID`, `AI_CREDIT_FLOOR_USD: "5"`, `AI_CAP_CEILING_PCT: "80"`. `CF_MONITORING_TOKEN` is set via `wrangler secret put`, never committed. |
| `src/ops2/attention/AttentionPage.tsx` | Monitoring section appended below the existing groups ("the page is theirs, the AI-parsing section is ours" — grill addendum). |
| `src/ops2/styles/attention.css` | Card + chart styles. Chart is plain CSS bars (7 buckets × 2 divs); no chart library. |
| `src/ops2/chrome/OpsPage.tsx` | Bell button lines 173–180 (`ops2-bell`, already navigates to `HOME_PATH`): draw badge when `useNotificationCount() > 0`. |
| `src/ops2/Ops2App.tsx` | Phone tab bar, attention `IonTabButton` inside `TAB_DESTINATIONS.map` at 276–281: badge for `d.id === "attention"` when count > 0. |
| `src/ops2/styles/nav.css` | Badge styles beside the existing `ops2-bell` rules. |
| `package.json` | Add `"test:ai-monitoring"` script (per-suite convention, e.g. `test:ai-jobs` line 39) and append `scripts/tests/ai-monitoring.test.mjs` to the `test:pure` file list (line 17) so `npm test` runs it. |
| `scripts/tests/ai-jobs.test.mjs` | New asserts: INSERT carries `triggered_by`; default is `'upload'`; `"ops"` reaches the INSERT via `retryCurrentAiExtraction`'s fall-through; the in-place reset UPDATE's SQL does not mention `triggered_by`. |
| `scripts/tests/api-edge.test.mjs` | New subtests against the already-booted worker: criteria 23–26 (see test plan). |
| `CONTEXT.md` | Ops-console section: new terms added by the architect in this stage (done — see §9). |

## 3. Data model

### 3.1 Snapshot types (`src/data/monitoring.ts`)

```ts
export type MoneySnapshot =
  | { available: true; creditBalanceUsd: number; billedSpendUsd: number;
      capUsd: number; capSource: "gateway" | "account" }
  | { available: false; reason: string };   // "token_missing" | "fetch_failed" | …

export interface DayBucket { day: string /* YYYY-MM-DD, Australia/Melbourne */;
  success: number; error: number }

export interface MonitoringSnapshot {
  takenAt: string;          // ISO — criterion 6 renders "as at HH:MM" from this
  money: MoneySnapshot;
  success7d: number;
  error7d: number;
  days: DayBucket[];        // exactly 7, oldest first, zero buckets present (criterion 14)
}
```

`parseMonitoringSnapshot(raw: unknown): MonitoringSnapshot | null` — strict
shape validation, same posture as `parseSummary` in
`src/ops2/attention/attention.ts`: a malformed snapshot is `null`, and the page
renders that as "no snapshot yet", never as zeros (the Attention rule: degraded
draws as failure, not as zero).

KV: key `monitoring:snapshot`, `JSON.stringify(snapshot)`, **no TTL** — staleness
is displayed via `takenAt` (criterion 6, spec §4 ASSUMED), never enforced by
expiry, because an expired key would turn "cron broken" into an empty page.

### 3.2 The counting predicate (one home)

Grill decision 9: one SQL predicate. It lives once, in
`worker/lib/monitoring.ts`, as the count query:

```sql
SELECT updated_at,
       CASE WHEN status = 'completed' THEN 'success' ELSE 'error' END AS outcome
FROM ai_job_claim
WHERE triggered_by = 'upload'
  AND updated_at >= datetime(?, '-7 days')
  AND (status = 'completed'
       OR status = 'failed'
       OR (status = 'processing' AND updated_at < datetime(?, '-30 minutes')))
```

(both `?` = the same `now` ISO string, so the window and the staleness test share
one clock). `scheduled` and fresh `processing` rows match nothing — neither
success nor error (criterion 10). The heartbeat bumps `updated_at` every 15s, so
`processing` + 30-minutes-stale means genuinely stuck (criterion 9). One claim
row per document generation and superseded generations go terminal, so one
document counts once (criterion 8). Uses the existing
`idx_ai_job_claim_status (status, updated_at)` index; no new index.

Bucketing is pure: `assembleParseCounts(rows: {updatedAt: string; outcome:
"success" | "error"}[], now: Date)` in `src/data/monitoring.ts` returns
`{ success7d, error7d, days }` with the Melbourne day key from
`Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" })` (en-CA
yields `YYYY-MM-DD` directly).

**The window is seven Melbourne calendar dates** — today and the six before it,
so between 144 and 168 hours depending on the time of day. It is NOT the
rolling 7×24h this section originally specified, and the two cannot both be
true: a rolling window spans parts of eight calendar dates, which seven buckets
cannot represent. The original wording had the query reaching back further than
any bucket, so D1 returned rows that were then dropped on the floor — missing
from the chart *and* from the card totals beside it, with nothing saying so.

Chosen deliberately (2026-09-05, after the architect's own review raised the
incoherence): the cards must describe exactly what the chart shows
(criterion 13), and "last 7 days" on a seven-column chart reads as seven days,
not as seven-days-and-a-bit. `parseWindowStart(now)` is the single boundary —
00:00 Melbourne on the oldest bucket's date — and the SQL binds it, so no row
can exist outside the buckets.

### 3.3 Red (`evaluateRed`)

```ts
evaluateRed(snapshot: MonitoringSnapshot, floorUsd: number, ceilingPct: number): boolean
```

`money.available === false` ⇒ `false` (criterion 19 — unavailable never alarms).
Otherwise: `creditBalanceUsd < floorUsd || (billedSpendUsd / capUsd) * 100 >
ceilingPct`. One boolean out — criterion 17's "still 1" is automatic because
red is one source, not two.

`capOutstanding(money)` = `capUsd - billedSpendUsd` (criterion 2, spec §4
"remaining headroom").

## 4. Migration 0064 — `triggered_by`

File: `migrations/0064_ai_job_claim_triggered_by.sql`

```sql
-- Marks who caused a claim generation: 'upload' (customer document flow — the
-- default, and everything historical) or 'ops' (staff re-evaluation of an
-- already-completed parse). Monitoring counts uploads only (spec criterion 11).
-- children affected: none — nothing REFERENCES ai_job_claim (verified by grep,
-- matching migration 0059's own statement). Pure ADD COLUMN: additive class,
-- no rebuild, no PRAGMA defer_foreign_keys needed.
ALTER TABLE ai_job_claim ADD COLUMN triggered_by TEXT NOT NULL DEFAULT 'upload';
```

d1-migration-safety compliance: additive change (rule 1 — no ceremony), but the
cascade check was still run: `grep -rh 'REFERENCES ai_job_claim' migrations/`
(excluding comments) finds **zero live constraints** — the only mention is
0059's comment stating the same fact. No child tables, no cascade exposure, no
rebuild strategy required. Historical rows default to `'upload'`, which is
correct: before this feature only the upload path created claims (the ops
re-parse existed, but tagging its history is impossible and the 7-day window
ages it out inside a week — accepted, noted as residual in §8).

### 4.1 Threading semantics (the criterion-11 call)

- `enqueueAiExtraction(env, ctx, projectId, opts, triggeredBy = "upload")` —
  the INSERT (jobs.ts:265–273) gains the column.
- `retryCurrentAiExtraction` threads `triggeredBy` **only to its
  completed-generation → new-generation fall-through** (a staff re-evaluation of
  an already-parsed document = a building-model run, excluded from counts). Its
  in-place reset of a failed/abandoned claim (UPDATE at 337–354) does **not**
  touch `triggered_by`: staff repairing a failed *customer upload* is still that
  upload's parse, and it should count (as a success once it completes).
  **ASSUMED:** this reading of criterion 11 — ops-retry-of-a-failed-upload
  counts as an upload parse; only ops re-evaluation of a completed parse is
  excluded. Grounded in the spec's own vocabulary ("one document == one parse")
  but it is a judgement call the owner can flip with a one-line change at the
  call site.
- `worker/routes/ops.ts:2074` passes `"ops"`. `worker/routes/parse.ts:47` is
  untouched (default applies).

## 5. Money fetch (`fetchMoneyNumbers`)

`fetchMoneyNumbers(env: Env, fetchImpl = fetch): Promise<MoneySnapshot>` — the
injectable `fetchImpl` is the test seam (same style as the ABR client's URL
seam).

Endpoints, verbatim from grill decision 5, all under
`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}`:

1. Credit balance: `GET …/ai-gateway/billing/credit-balance`
2. Billed spend: `GET …/ai-gateway/billing/usage-history`
3. Cap: `GET …/ai-gateway/gateways/openframe-estimator` →
   `spend_limits.rules`; on any failure, fall back to
   `GET …/ai-gateway/billing/spending-limit` (account-level, write-deprecated
   but readable). `capSource: "gateway" | "account"` records which answered
   (criterion 3). The gateway slug is `env.AI_GATEWAY_ID` (already
   `"openframe-estimator"` in vars) — not a second hardcoding.

Auth: `Authorization: Bearer ${env.CF_MONITORING_TOKEN}`. Token unset ⇒ return
`{ available: false, reason: "token_missing" }` without any fetch (criterion 4).
Any non-2xx / thrown fetch / unparseable body ⇒ `{ available: false, reason:
"fetch_failed" }` and one `console.log("[monitoring] cf fetch failed", …)` line
that contains the endpoint path suffix and status only — never the token, never
the Authorization header, never the full URL with account id (criterion 27).

`writeMonitoringSnapshot(env)` sequencing: run the D1 count query first, then
the money fetch; assemble and write the snapshot regardless of money outcome —
a Cloudflare outage still refreshes the counts (criterion 5). Its own throw is
caught at the `scheduled()` call site like the sibling jobs.

## 6. Endpoint and notification seed

**One** route: `GET /api/ops/monitoring` (worker/routes/ops.ts, thin):

```ts
// guard: isStaffUser(staff) — refuses visitor (401), customer (403),
// manufacturer partner (403). Same helper every ops2 data route uses.
{ snapshot: MonitoringSnapshot | null, notificationCount: number }
```

`snapshot` is the KV read through `parseMonitoringSnapshot` (`null` before the
first cron run — the page renders "no snapshot yet"; `notificationCount` is `0`
then, because there is nothing to be red about).

Notification seed (criterion 20 mandates the interface — ponytail's
one-implementation rule is explicitly overridden by the spec here), in
`worker/lib/monitoring.ts`:

```ts
export type NotificationSource = (env: Env) => Promise<number>;
const aiBudgetRed: NotificationSource = async (env) => { /* read snapshot,
  evaluateRed with thresholds parsed from env (defaults 5 / 80) */ };
export const NOTIFICATION_SOURCES: readonly NotificationSource[] = [aiBudgetRed];
export const notificationCount = async (env) =>
  (await Promise.all(NOTIFICATION_SOURCES.map((s) => s(env)))).reduce(sum, 0);
```

No source-specific branching in the aggregator; a second source is one array
entry. The route calls `readMonitoringSnapshot` once and derives both fields
from that single KV read (not two reads).

## 7. UI

- **Cards** (`AttentionPage.tsx`, below the groups): credit balance (`$12.34`),
  cap outstanding (`$12.00 of $20.00 cap`), 7-day successes, 7-day errors.
  Money cards render an explicit "unavailable" state when
  `money.available === false` — not zero, not red (criterion 4). Every card
  prints "as at HH:MM" from `takenAt` (criterion 6; Melbourne time via the same
  `Intl` formatter family). `snapshot === null` ⇒ the section renders a single
  "no snapshot yet" state.
- **Chart**: 7 columns, two stacked/paired CSS bars each (success/error),
  heights proportional to the max bucket; zero-parse window renders the 7
  zero-height columns with an "no parses in the last 7 days" caption
  (criterion 12), zero days appear as zero columns (criterion 14). Plain divs +
  `attention.css` — a chart library for 14 rectangles fails the ladder.
- **Bubble**: `useNotificationCount` in `src/ops2/chrome/` — module-level cache
  `{ value, fetchedAt, inflight }` with ≈60s TTL so the desk bell
  (OpsPage.tsx:173–180) and the phone attention tab (Ops2App.tsx:276–281) share
  one fetch per minute across all mounted pages. Count 0 ⇒ no badge drawn
  (criterion 15). Bell already navigates to `HOME_PATH` (= `/attention`), so
  criterion 18 is existing behaviour; the phone tab is the attention tab itself.
- `/attention` auth: unchanged — the ops2 shell's existing staff guard covers it
  (criterion 28; no new auth path).

## 8. Security

**Data classification.** The snapshot carries account-level *commercial/financial
data*: AI credit balance, billed spend, spend cap (Cloudflare account figures),
plus operational counts. Not customer PII. Stored in KV (staff-side namespace,
same store as sessions), served only to Staff. The Cloudflare API token is a
Worker **secret** (`wrangler secret put CF_MONITORING_TOKEN`), scoped read-only
(AI Gateway: Read + Account Analytics: Read), never a `VITE_*` var, never in
`wrangler.jsonc`, never in the payload, never logged.

**Trust boundaries.**
- ops ↔ Worker: `GET /api/ops/monitoring` — session-resolved staff, `isStaffUser`
  refuses non-staff and manufacturer partners before any KV read.
- Worker ↔ Cloudflare API: outbound only, bearer token attached in exactly one
  function (`fetchMoneyNumbers`); responses are parsed defensively (a malformed
  CF body becomes `available:false`, never a thrown 500 into the cron).
- customer ↔ Worker: no new surface. `/attention` stays behind the existing ops2
  guard.

**Authorization per endpoint.** One new endpoint. `GET /api/ops/monitoring`:
caller must resolve to a staff session and pass `isStaffUser` (ops.ts:110 —
staff AND not manufacturer). There is no account-scoping WHERE clause because
the data is account-global operational telemetry, not per-customer rows — the
scoping *is* the staff gate. The D1 count query touches `ai_job_claim` only
(status/updated_at/triggered_by), no customer columns, no joins to `user` or
`project`.

**Abuse cases → criteria.**
- Signed-out visitor requests endpoint → 401, no values (criterion 23, tested).
- Customer session requests endpoint → 403, no values (criterion 24, tested).
- Manufacturer partner requests endpoint → 403, no values (criterion 25, tested
  — this is why the guard is `isStaffUser`, not bare `resolveStaff`).
- Payload inspection → contains derived numbers, `capSource`, `takenAt` only; no
  token, no account id, no gateway credentials (criterion 26, tested by shape
  assertion on the success response).
- Log inspection on CF failure → no token/Authorization value (criterion 27,
  tested at lib level by capturing `console.log`).
- Parameter tampering / enumeration: endpoint takes no parameters; nothing to
  tamper. Replay: read-only endpoint, no state change.
- **Residual risk:** pre-0064 ops re-parses of completed documents in the
  current 7-day window count as upload parses until the window rolls past them
  (≤7 days after deploy). Cosmetic, self-healing, accepted.

## 9. Domain vocabulary

`CONTEXT.md` (Ops console section) gains: **Monitoring snapshot**, **Errored
parse**, **Red (notification source)** — written by the architect in this stage.
"Parse" itself already reads naturally from "Schedule parse"; the errored-parse
entry carries the counting rule.

## 10. Sequencing and test plan

Build order (= `02-tasks.json`):

1. **T1 — pure core.** `src/data/monitoring.ts` + `scripts/tests/ai-monitoring.test.mjs`
   (parse strictness, bucketing incl. zero days and Melbourne day edges,
   `evaluateRed` incl. unavailable⇒false and both-thresholds⇒still-one-red,
   `capOutstanding`) + `package.json` wiring (`test:pure` list + `test:ai-monitoring`).
2. **T2 — migration + threading.** `migrations/0064…` + `worker/lib/ai/jobs.ts`
   param + `scripts/tests/ai-jobs.test.mjs` asserts (default `'upload'`; `"ops"`
   through the fall-through; reset UPDATE untouched).
3. **T3 — IO shell.** `worker/lib/monitoring.ts` + `worker/types.ts` +
   `wrangler.jsonc` vars + lib tests in `ai-monitoring.test.mjs` (fake env: count
   SQL captured and asserted verbatim incl. `triggered_by='upload'`; token
   missing ⇒ unavailable without fetch; CF failure ⇒ counts still written +
   log line free of token; cap fallback ⇒ `capSource:"account"`).
4. **T4 — route + cron.** `worker/routes/ops.ts` (route + line-2074 `"ops"`) +
   `worker/index.ts` append + `scripts/tests/api-edge.test.mjs` subtests
   (criteria 23–26 against the booted worker: anon 401, customer 403,
   manufacturer 403 — each asserting no monitoring values in the body; staff 200
   payload shape contains no token/account id).
5. **T5 — cards + chart.** `useMonitoring.ts`, `AttentionPage.tsx`,
   `attention.css`.
6. **T6 — bubble.** `useNotificationCount.ts`, `OpsPage.tsx`, `Ops2App.tsx`,
   `nav.css`.

Test-file ownership: `ai-monitoring.test.mjs` is created in T1 and extended in
T3; `ai-jobs.test.mjs` (already in `test:pure`) extended in T2;
`api-edge.test.mjs` (already in `test:heavy`) extended in T4. All three run
under `npm test`.

## 11. Rejected alternatives

- **Two endpoints (snapshot vs count):** one payload (~1KB) serves both readers;
  a second route is a second guard to keep correct. Rejected.
- **Compute counts at request time (no cron snapshot):** would put a D1 scan and
  a CF fetch on page load — criterion 1/22 forbid the CF half, and splitting the
  halves gives the money and counts different clocks. Rejected.
- **KV TTL for staleness:** expiry turns "cron broken" into "no data", the
  failure mode criterion 6 exists to avoid. Rejected.
- **Chart library (recharts):** 14 rectangles; CSS bars are smaller than the
  import line. Rejected.
- **React context for the bubble count:** module-level cache in the hook gives
  the same single-fetch property without threading a provider through two
  shells. Rejected.
- **Deriving criterion 11 from `origin`/existing columns:** no existing
  `ai_job_claim` column distinguishes ops re-evaluation; provenance must be
  written at the enqueue moment or it is unrecoverable. Hence 0064. Rejected
  alternatives to the column (a KV side-list of ops-triggered claim ids) fail
  the one-place-per-fact rule.
- **Reusing `/summary`'s bare `resolveStaff` guard:** criterion 25 requires
  refusing manufacturer partners; `isStaffUser` already encodes that predicate.
  Rejected.
