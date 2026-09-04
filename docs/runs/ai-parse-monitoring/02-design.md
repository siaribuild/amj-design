# ai-parse-monitoring — design

Stage 2. Spec: `docs/runs/ai-parse-monitoring/01-spec.md` (28 criteria). Grill decisions in
`00-ask.md` are binding. Branch `feat/ai-parse-monitoring` off `apertly/main` (284f89ff).

**Counting unit — RESOLVED** (owner, 2026-09-03): count claims — one parse event = one
claim lifecycle. Grill decision 4's "one document == one parse" is superseded by this
ruling; the error card stays claim-based per decision 9. No per-document estimating. The
design below is written to exactly this answer.

---

## 1. Shape of the solution

No new cron, no new auth path, **no D1 migration** (see §3). One new deep module on the
worker (`worker/lib/monitoring.ts`) does everything expensive — Cloudflare money fetch, D1
counts, day buckets, red evaluation — once per cron tick, and writes a single JSON snapshot
to the existing `KV` namespace. Everything else is a reader:

```
*/10 cron ──> writeMonitoringSnapshot(env) ──> KV["monitoring:snapshot:v1"]
                                                     │
GET /api/ops/monitoring/snapshot  (resolveStaff) ────┤
                                                     ▼
        ops2 AttentionPage (5 cards + chart)   ops2 bubble (bell badge + tab badge)
```

Red is computed **once, at write time**, and stored on the snapshot (`red: boolean`). The
client never re-derives it — one place per fact. Thresholds come from wrangler `vars`
(`AI_BALANCE_FLOOR_USD`, `AI_CAP_USED_CEILING_PCT`), read only by the cron writer.

## 2. Affected files — hand-off index

### New files

| Path | What lands there |
|---|---|
| `src/data/monitoring.ts` | Shared types + pure helpers (§2.1). Client and worker both import; no I/O. |
| `worker/lib/monitoring.ts` | Snapshot writer/reader: CF money client, D1 counts, buckets, `isRed` application, KV put/get (§2.2–2.4). |
| `src/ops2/pages/AttentionPage.tsx` | The card container: 5 cards + chart + empty/unavailable/stale states (§2.6). |
| `src/ops2/notifications/sources.ts` | `NotificationSource` interface, source list (one entry), aggregator, `useNotificationCount()` hook (§2.7). |
| `scripts/tests/ai-monitoring.test.mjs` | Pure suite (esbuild-bundle pattern from `scripts/tests/ai-jobs.test.mjs`). |
| `scripts/tests/monitoring-api.test.mjs` | Heavy suite (harness pattern from `scripts/tests/api.test.mjs`, plus `--test-scheduled`). |
| `scripts/tests/ops2-attention.test.mjs` | ops2 suite (bundle + source-assertion pattern from `scripts/tests/ops2-frame.test.mjs`). |

### Edited files

| Path | Where | Change |
|---|---|---|
| `worker/types.ts` | end of `Env` (after `ABR_BASE_URL`, line ~104) | add `CF_ACCOUNT_ID?`, `CF_MONITORING_API_TOKEN?`, `AI_BALANCE_FLOOR_USD?`, `AI_CAP_USED_CEILING_PCT?` (all `string?`, doc comments per house style) |
| `wrangler.jsonc` | `vars` block (near `AI_GATEWAY_ID: "openframe-estimator"`) | add `CF_ACCOUNT_ID`, `AI_BALANCE_FLOOR_USD: "5"`, `AI_CAP_USED_CEILING_PCT: "80"`. Token is a secret, NOT a var. |
| `worker/index.ts` | `scheduled` handler, lines ~340–354 | append `await writeMonitoringSnapshot(env).catch((e) => console.log("monitoring snapshot failed", e?.message));` in the existing per-job `.catch()` style — no new trigger (criterion 21) |
| `worker/routes/ops.ts` | near `/summary` (line ~311), same guard idiom | add `ops.get("/monitoring/snapshot", …)` — guard + KV read + JSON, ≤10 lines (§2.5) |
| `src/ops2/Ops2App.tsx` | route swap ~line 200–202; phone tab bar lines 272–289 | add `d.id === "attention" ? <AttentionPage /> :` branch; add `IonBadge` inside the Attention `IonTabButton` when count > 0 |
| `src/ops2/chrome/OpsPage.tsx` | desk bell button, lines 173–180 | render count badge inside the existing `ops2-bell` button when count > 0 (button already navigates to `HOME_PATH` — criterion 18 is free) |
| `package.json` | `test:pure` (line 17), `test:heavy` (line 18), scripts block | add the three new suites + `test:monitoring` convenience script (§5) |
| `CONTEXT.md` | vocabulary section | add **Snapshot**, **Red**, **Errored parse**; amend Attention-page description (§7) |

No other file changes. `src/ops2/nav/destinations.ts` already has the attention destination
and `HOME_PATH = "/attention"` — untouched. `src/ops2/pages/DestinationRoot.tsx` untouched
(the swap happens in `Ops2App.tsx`, which is where the projects swap already lives).

### 2.1 `src/data/monitoring.ts` — shared types + pure rules

```ts
export type MoneySnapshot =
  | { available: true; balanceUsd: number; billedSpendUsd: number;
      capUsd: number | null; capSource: "gateway" | "account" | null }
  | { available: false; reason: string };   // machine code, never an error body or token

export interface ParseDayBucket { day: string; /* YYYY-MM-DD, Australia/Melbourne */
  success: number; error: number }

export interface MonitoringSnapshot {
  takenAt: string;                          // ISO, UTC
  money: MoneySnapshot;
  counts: { success: number; error: number };
  days: ParseDayBucket[];                   // exactly 7, oldest first, zero-filled
  red: boolean;                             // evaluated at write time — single source
}

export function capOutstandingUsd(m: MoneySnapshot): number | null;
  // available && capUsd != null ? capUsd - billedSpendUsd : null  (criterion 2)

export function isRed(m: MoneySnapshot, floorUsd: number, ceilingPct: number): boolean;
  // !m.available → false (criterion 19 — unavailable never red)
  // balanceUsd < floorUsd → true (criterion 16)
  // capUsd != null && capUsd > 0 && (billedSpendUsd / capUsd) * 100 > ceilingPct → true (criterion 17)
  // capUsd null → cap clause can never fire; balance clause still can

export function isStale(takenAt: string, now: Date, maxAgeMinutes = 30): boolean; // criterion 6
```

Pure functions, no I/O, testable in the esbuild bundle. Client renders `red`? No — client
renders the badge from `snapshot.red`; `isRed` runs only in the cron writer. The helper
lives here (not in `worker/lib/`) purely so the pure test suite and the worker share it and
so nothing ever re-implements the rule client-side.

### 2.2 Counting — the D1 read (claim-level, owner ruling 2026-09-03)

One query against `ai_job_claim` only (uses the existing
`idx_ai_job_claim_status (status, updated_at)` index — no new index):

```sql
SELECT status, updated_at FROM ai_job_claim
WHERE (status IN ('completed','failed') AND updated_at >= datetime('now','-7 days'))
   OR (status = 'processing'
       AND updated_at >= datetime('now','-7 days')
       AND updated_at <= datetime('now','-30 minutes'))
```

Classification in TS: `completed` → success; `failed` → error; stale `processing` → error
(criterion 9); `processing` younger than 30 min excluded by the SQL (criterion 10);
`scheduled`/`superseded` never selected. This is the spec's "one SQL predicate" (grill
decision 9), with the classification kept in TS so the same rows feed both the totals and
the buckets — the cards and the chart cannot disagree (criterion 13 holds by construction,
not by two queries agreeing).

Why `updated_at`, not `created_at`, for "older than 30 minutes": `updated_at` is bumped on
every transition into `processing` (claim/reclaim in `worker/lib/ai/jobs.ts`), so it is the
last sign of life; a claim *created* 40 minutes ago but legitimately re-leased 2 minutes ago
is healthy. Leases max out at 10 minutes and the reaper runs on the same cron, so no healthy
row ever shows a 30-minute-old `processing` `updated_at`. Progress writes
(`drawings_done` etc.) do not bump `updated_at`, and don't need to — no healthy run holds
`processing` that long.

Retries never create claim rows — `retryCurrentAiExtraction` (worker/lib/ai/jobs.ts,
~line 320) **resets the same row** (`UPDATE … SET status='scheduled', attempts=0 …`). So a
doc retried three times before succeeding is one `completed` row = one success
(criterion 8), with zero code written for it.

Criterion 11 (exclude ops building-model runs) is satisfied structurally: counts read
**only** `ai_job_claim`; ops-triggered building-model runs write `ai_runs` /
`ai_stage_runs` without a claim, so they never appear. The test proves it by inserting an
`ai_runs` row with no claim and asserting counts unchanged.

**Ruling record:** the owner accepted claim-level counting (2026-09-03), superseding
grill decision 4's per-document wording. This section is final; no per-document join or
document estimate exists anywhere in the feature.

### 2.3 Day buckets

D1/SQLite has no timezone support, so bucketing is TS: for each classified row, bucket
`updated_at` into a `YYYY-MM-DD` day key via `Intl.DateTimeFormat("en-CA", { timeZone:
"Australia/Melbourne" })` (spec §4 assumption). Build the 7 day keys first (today back to
today−6, Melbourne), zero-fill, then add rows in — so a zero day is a zero bucket, never a
missing one (criteria 12, 14). Totals = sums over the same classified rows (criterion 13).

Edge accepted: the window is rolling 7×24h while buckets are Melbourne calendar days, so
the oldest bucket is partial. That is what the spec's own assumption pairs, and an owner
reading "last 7 days" gets exactly that.

### 2.4 `worker/lib/monitoring.ts` — the writer

```ts
export const SNAPSHOT_KEY = "monitoring:snapshot:v1";

export async function writeMonitoringSnapshot(env: Env, fetchImpl = fetch): Promise<void>;
export async function readMonitoringSnapshot(env: Env): Promise<MonitoringSnapshot | null>;
```

`fetchImpl` is the test seam (same idiom as `ABR_BASE_URL`'s purpose: drive the suite, not
the live API).

**Money fetch** (grill decision 5, criterion 3), base
`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}`, header
`Authorization: Bearer ${env.CF_MONITORING_API_TOKEN}`, each call wrapped in
`AbortSignal.timeout(10_000)`:

1. Balance: `GET …/ai-gateway/billing/credit-balance`.
2. Billed spend: `GET …/ai-gateway/billing/usage-history` — take the current (latest)
   billing period's spend.
3. Cap: `GET …/ai-gateway/gateways/${env.AI_GATEWAY_ID}` → `result.spend_limits.rules`
   (if multiple rules, take the minimum limit — the binding one). On any failure of that
   call: `GET …/ai-gateway/billing/spending-limit` and record `capSource: "account"`;
   success on the first records `capSource: "gateway"` (criterion 3). Both fail → `capUsd:
   null, capSource: null` — balance and spend can still render.

No token or no account id configured → skip all calls, `money = { available: false,
reason: "not-configured" }` (criterion 4). Any required call (balance or spend) non-2xx,
timeout, or unparseable → `money = { available: false, reason: "cf-error" }`; the D1
counts are still computed and the snapshot still written (criterion 5).

**Response-shape caveat (deliberate):** the three billing endpoints' exact JSON shapes are
not verifiable until the token exists. The extractors read a small set of candidate numeric
fields and treat anything else as `unavailable` — the failure mode is "unavailable",
never a wrong number rendered as real money. The deploy step (§6) has the developer capture
one real response per endpoint with `curl` once the owner provisions the token, and pin the
test fixtures to those captures. Residual risk until then: fixture shapes are our best
reading of the CF docs, marked in the test file.

**Logging** (criterion 27): on CF failure log **only** `endpoint path + HTTP status /
error name`. The token never enters a log line because the logging call is handed the path
string and status, never the Request object or headers. The pure suite asserts captured
log output contains neither the token value nor the string `Authorization`.

**Red:** `red = isRed(money, parseFloat(env.AI_BALANCE_FLOOR_USD ?? "5"),
parseFloat(env.AI_CAP_USED_CEILING_PCT ?? "80"))` — evaluated here, stored on the
snapshot, nowhere else.

**KV:** `env.KV.put(SNAPSHOT_KEY, JSON.stringify(snapshot))` — **no TTL**. A stale
snapshot is shown with its age (criterion 6), not expired into an empty page (spec §4).

### 2.5 Route — `worker/routes/ops.ts`

Inline near `/summary` (~line 311), the exact existing guard idiom:

```ts
ops.get("/monitoring/snapshot", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const snapshot = await readMonitoringSnapshot(c.env);
  return c.json({ ok: true, snapshot }); // snapshot may be null before first cron tick
});
```

Thin by construction: guard + read + serialize. `resolveStaff` (worker/lib/staff.ts,
lines 137–158) already returns null for signed-out, Customers, **and** manufacturer-role
users — criteria 23–25 need no new code, only tests. Do NOT use `resolveOpsUser` (it
admits manufacturers). No sub-router: one GET does not earn a file.

`snapshot: null` (cron never ran) is a state the page renders ("no snapshot yet"), not an
error.

### 2.6 `src/ops2/pages/AttentionPage.tsx`

Fetches `/api/ops/monitoring/snapshot` once on mount. Renders, in order (spec §4: with no
"needs a person" content in v1, the cards are the page):

- **Credit balance** — `$12.34` from `money.balanceUsd` (criterion 1).
- **Cap outstanding** — `capOutstandingUsd(money)` headroom plus the cap it was measured
  against, both from the snapshot, neither hardcoded (criterion 2). Cap null → card shows
  "no cap set".
- Both money cards render an explicit **"unavailable"** state when `!money.available` —
  not zero, not red styling (criterion 4).
- **Success (7d)** and **Errors (7d)** from `counts` (criterion 7); zero renders `0`
  (criterion 12).
- **Chart** — 7 grouped bars from `days`, plain divs + CSS heights, **no chart library**
  (five numbers a day do not earn a dependency). Zero-parse window → empty-state message
  in the chart card (criterion 12); zero days render as zero-height bars with the day
  label present (criterion 14).
- Every card shows "as at HH:MM" when `isStale(snapshot.takenAt, new Date())`
  (criterion 6); `snapshot === null` → a single "no snapshot yet — cron pending" state.

No Cloudflare call exists anywhere in the client — the page's only fetch is the worker
endpoint (criteria 1, 22 by construction).

### 2.7 `src/ops2/notifications/sources.ts` — the seed subsystem

Criterion 20 explicitly mandates an interface with exactly one v1 implementation — the spec
overrides the no-single-impl-interface reflex here, and says how it will be verified.

```ts
export interface NotificationSource {
  id: string;
  count(): Promise<number>;
}

export const sources: NotificationSource[] = [aiBudgetRed]; // exactly one in v1

export async function notificationCount(): Promise<number> {
  const ns = await Promise.all(sources.map((s) => s.count().catch(() => 0)));
  return ns.reduce((a, b) => a + b, 0);  // no source-specific branching — criterion 20
}

export function useNotificationCount(): number; // hook: fetch on mount, 0 until resolved
```

`aiBudgetRed.count()` fetches the snapshot endpoint and returns `snapshot?.red ? 1 : 0` —
red was already collapsed to one boolean at write time, so balance-and-cap-both-red is
still `1` (criterion 17) and unavailable money is `red: false` hence `0` (criterion 19). A
failed fetch counts 0 — a broken endpoint must not paint a false alarm.

**Badge surfaces** (both consume `useNotificationCount()`, both render nothing at 0 —
criterion 15):

- Desk: inside the existing bell button (`src/ops2/chrome/OpsPage.tsx:173–180`) — the
  button already `history.push(HOME_PATH)` on click, so tapping the non-zero bubble
  navigates to Attention with zero new code (criterion 18).
- Phone: `IonBadge` inside the Attention `IonTabButton` (`src/ops2/Ops2App.tsx:272–289`)
  — the tab is already the navigation.

## 3. Data model and migrations

**No migration.** The feature is reads over the existing `ai_job_claim` (migration 0023,
whose `(status, updated_at)` index serves the query) plus one KV key. The
d1-migration-safety concerns (53 cascades, the production rebuild incident) are moot
because `migrations/` is untouched — this is a design property, not an omission: the
snapshot is derived, rebuildable every 10 minutes, and belongs in KV precisely so no schema
is spent on it.

## 4. Sequencing

1. **T1 — shared model** (`src/data/monitoring.ts` + pure tests): types, `isRed`,
   `capOutstandingUsd`, `isStale`. Everything else imports this.
2. **T2 — writer** (`worker/lib/monitoring.ts`, Env/vars, cron append + pure tests):
   money client with fallback + redaction, counts query, buckets, KV write.
3. **T3 — route + heavy suite**: the guarded endpoint; `monitoring-api.test.mjs` boots
   the real worker, seeds claims, fires the cron via `--test-scheduled` +
   `GET /__scheduled?cron=*%2F10+*+*+*+*`, and executes the abuse cases for real.
4. **T4 — Attention page** + route swap + page tests.
5. **T5 — notification seed** + both badges + tests.
6. **T6 — vocabulary**: CONTEXT.md terms (§7).

T1→T2→T3 strictly ordered; T4 needs T1 (types) and T3 (endpoint shape); T5 needs T4's test
file. T6 last.

## 5. Test plan

All three files below are named in `02-tasks.json` and wired into `package.json` in the
same task that creates them — a named-but-never-created test file is this pipeline's most
repeated failure.

**`scripts/tests/ai-monitoring.test.mjs`** — pure, added to `test:pure` (line 17) and a new
`"test:monitoring"` script. esbuild-bundle pattern from `ai-jobs.test.mjs` (stdin entry
re-exporting from `worker/lib/monitoring.ts` + `src/data/monitoring.ts`, fake `env`
objects). Proves: `isRed` truth table incl. unavailable-never-red and cap-null (16, 17,
19); `capOutstandingUsd` (2); `isStale` (6); classification and window predicate — SQL
string shape + row classification for completed / failed / 31-min processing / 5-min
processing / superseded (8, 9, 10); Melbourne bucketing, zero-fill, sums == totals (12,
13, 14); money: gateway cap → `capSource:"gateway"`, gateway failure → account fallback →
`capSource:"account"` (3); no token → not-configured (4); CF 500/timeout → money
unavailable, counts still present, snapshot still written via fake KV (5); captured log
lines contain no token and no `Authorization` (27); `JSON.stringify(snapshot)` contains
neither the token value nor the account id (26, unit-level).

**`scripts/tests/monitoring-api.test.mjs`** — heavy, added to `test:heavy` (line 18).
Harness copied from `api.test.mjs` (local D1 migrate, seed via `wrangler d1 execute`,
`wrangler dev --local` with the same `--var` set, helpers from `helpers.mjs`), plus
`--test-scheduled`. Seeds: 2 completed claims, 1 failed, 1 processing @ 31 min, 1
processing @ 5 min, 1 superseded, 1 `ai_runs` row with no claim. Fires the cron, then:
staff GET → 200, success=2, error=2, `ai_runs` invisible (7, 9, 10, 11, 21); money
unavailable (no token in test env) and endpoint still 200 (4); signed-out GET → 401/403
with no numeric fields (23); Customer session → 403 (24); manufacturer session (via
`MANUFACTURER_EMAIL_DOMAINS` var + OTP login) → 403 (25); staff payload key-whitelist —
no token, no account id, no `Authorization` anywhere in the body (26); second staff GET
returns the identical snapshot (22 — pages read KV, never CF).

**`scripts/tests/ops2-attention.test.mjs`** — pure, added to `test:pure` and to the
existing `test:ops2` script. Pattern from `ops2-frame.test.mjs`: bundle the pure modules,
source-assert the JSX. Proves: page renders 5 cards from a stubbed snapshot with correct
headroom arithmetic (1, 2, 7); unavailable money state while count cards still render (4);
stale snapshot → "as at HH:MM" (6); zero counts → `0` + chart empty state (12); 7 buckets
incl. zero days (13, 14); aggregator sums the source list with no reference to any source
id, and `sources` has exactly one entry (20); bubble renders nothing at 0, `1` when
`red` (15, 16, 17 via the write-time collapse); badge lives inside the existing bell
button whose `onClick` navigates (18); page introduces no auth code — data flows only
through the staff-guarded endpoint (28, structural half; the endpoint half is in the heavy
suite).

`package.json` changes: append the two pure files to `test:pure`, the heavy file to
`test:heavy`, add `"test:monitoring": "node --test scripts/tests/ai-monitoring.test.mjs scripts/tests/ops2-attention.test.mjs"`,
and append `ops2-attention.test.mjs` to `test:ops2`.

## 6. Deploy / setup (owner-facing, not code)

1. Owner creates ONE Cloudflare API token — scopes **AI Gateway: Read + Account
   Analytics: Read** (grill decision 7) — and runs
   `wrangler secret put CF_MONITORING_API_TOKEN`.
2. `CF_ACCOUNT_ID` set in `wrangler.jsonc` vars (account id is dashboard-visible, not a
   secret; the token is the secret).
3. Developer captures one real response per billing endpoint with `curl`, pins the test
   fixtures, adjusts extractors if the shapes differ from the design's reading.
4. Sensitive-surface deploy protocol applies: preview via `wrangler versions upload`,
   read-only smoke (open Attention, confirm money renders or shows "unavailable"), then
   promote.

## 7. CONTEXT.md vocabulary (architect-owned; T6 applies the wording)

- **Snapshot** — the KV record (`monitoring:snapshot:v1`) of Cloudflare money numbers +
  D1 parse counts, written by the `*/10` cron, read by the Attention page and the
  notification bubble. Derived and rebuildable; never a source of truth.
- **Red** — the single v1 notification condition: credit balance below
  `AI_BALANCE_FLOOR_USD` OR cap-used % above `AI_CAP_USED_CEILING_PCT`, evaluated once at
  snapshot-write time. Unavailable money is never red.
- **Errored parse** — a claim terminally `failed`, or `processing` with `updated_at`
  older than 30 minutes (the silent-death gap). One SQL predicate.
- Attention page — amend: the ops2 `/attention` route is the monitoring card container
  (five cards + 7-day chart); "what needs a person" content leads when it exists.

- **Parse** — one job-claim lifecycle (one `ai_job_claim` row); retries and
  re-generations collapse into it. One parse event = one claim. Supersedes grill
  decision 4's "one document == one parse" (owner ruling, 2026-09-03).

## 8. Security

**Data classification.** The snapshot carries account-level **commercial/financial data**
(AI credit balance, billed spend, spend cap — the company's, not a customer's) and
derived operational counts. The Cloudflare API token is a **credential secret**
(`wrangler secret put`, never a var, never in the repo). No customer PII, no payout/bank
data enters this feature. Smallest surface: the snapshot stores only derived numbers, a
source label, a timestamp, and one boolean — the token and account id are used inside
`writeMonitoringSnapshot` and structurally cannot reach the snapshot, the payload, or a
log line (criteria 26, 27; both tested).

**Trust boundaries.**
- *Worker → Cloudflare API*: outbound only, bearer token, 10s timeout, responses treated
  as untrusted input (tolerant numeric extraction; unparseable → "unavailable", never a
  guessed number).
- *ops ↔ Worker*: the only inbound crossing. Validated by `resolveStaff` — the same
  session/Access verification every ops2 surface uses; no new auth path (criterion 28).
- *Customer ↔ Worker*: this feature adds **nothing** on the customer boundary.

**Authorization model per endpoint.** One new route:
`GET /api/ops/monitoring/snapshot` — callable by Staff only; guard is
`resolveStaff(c.env, c.req.raw)` returning non-null, else `403 {error:"forbidden"}` with
no data fields. **Account-scoping filter: none, deliberately** — the data is
account-global (the business's own spend and parse health), not per-customer rows, so
there is no WHERE clause to scope and nothing to leak between customers; the entire
payload is staff-only or absent. `resolveStaff` already excludes manufacturer-role users
(worker/lib/staff.ts:137–158), covering criterion 25 without new code.

**Abuse cases → criteria.**
- Signed-out / Customer / Manufacturer requesting the endpoint → 403, zero data fields
  (criteria 23–25; executed in `monitoring-api.test.mjs`).
- Payload scraping for credentials → token/account id never serialized (criterion 26;
  asserted at unit and API level).
- Log scraping → no token, no Authorization value in any log line (criterion 27; unit
  test on captured logs).
- `/attention` route guessing → same ops2 staff guard as every ops2 surface; the page
  adds no auth code and its only data path is the guarded endpoint (criterion 28;
  structural test + the endpoint tests).
- Parameter tampering / enumeration: the endpoint takes no parameters; nothing to tamper.
- Replay: read-only endpoint returning staff-only derived data; replaying a staff
  request yields the same snapshot — no state change possible. Residual risk: none
  beyond an already-compromised staff session, which is out of this feature's scope.
- False-alarm injection: an attacker cannot write the snapshot (KV key written only by
  the cron; no write endpoint exists).

## 9. Rejected alternatives

- **D1 table for snapshots** — rejected: derived, rebuildable-every-10-min data doesn't
  earn schema in a database whose rebuilds have cascade-deleted production rows. KV is
  the platform-native fit.
- **Computing counts on page load (no snapshot for D1 numbers)** — rejected: criterion 22
  requires snapshot reads for money anyway; two data paths for one page means the cards
  and bubble can disagree. One writer, many readers.
- **Client-side red evaluation** — rejected: thresholds live in worker vars; shipping
  them to the client duplicates the fact and lets page and bubble drift (one place per
  fact).
- **Chart library** — rejected: 14 numbers as divs + CSS. A dependency is not earned.
- **Per-document counting via `file_asset` join** — escalated as Q1, then rejected by
  owner ruling (2026-09-03): the schema has no document↔claim link, decision 9's error
  predicate is already claim-based, and a per-document number would be an estimate that
  looks precise and isn't. Claim-level counting is binding.
- **`resolveOpsUser` for the guard** — rejected: it admits manufacturer partners;
  criterion 25 forbids exactly that. `resolveStaff` is the correct existing seam.
- **KV TTL on the snapshot** — rejected: expiry turns "cron broken" into an empty page;
  the spec chose "old number labelled old" (criterion 6, §4 assumption).
- **New cron trigger / separate schedule** — forbidden by criterion 21; the existing
  `*/10` handler's per-job `.catch()` style already isolates failures.
