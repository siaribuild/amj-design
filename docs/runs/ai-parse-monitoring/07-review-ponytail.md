# 07 — ponytail review (over-engineering)

Diff reviewed: `591a912d...HEAD`, the ai-parse-monitoring feature branch.
Scope is over-engineering only — correctness, security and performance are the
other three reviewers' axes.

## Findings

`worker/lib/monitoring.ts:L158-181`: yagni: a notification-source registry with
one source, plus two types and a `Promise.all`/`reduce` over an array of length
one. `monitoringPayload` already computes `red` at L191; the count is
`red ? 1 : 0`. Delete `NotificationContext`, `NotificationSource`,
`aiBudgetRed`, `NOTIFICATION_SOURCES` and `notificationCount`, and return
`notificationCount: red ? 1 : 0` — which also removes the duplicated
floor/ceiling parse at L165-166 vs L189-190 and the optional-second-argument
dance at L176-178.

`worker/routes/ops.ts:L358-364` + `worker/lib/staff.ts:L160-172`: delete: the
401/403 split is unused. `src/ops2/attention/useMonitoring.ts:L23` collapses
both statuses into one `unauthorised` state with one headline and one detail,
so the second auth round-trip and the whole `hasOpsCredential` helper buy a
distinction nothing reads. Replace with the one line every other ops route
uses: `if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error:
"forbidden" }, 403);`.

`worker/lib/monitoring.ts:L67,L95`: delete: `PLACEHOLDER_ACCOUNT_ID` and its
comparison. `wrangler.jsonc:L137` now commits the real account id, so no
deployment can carry the placeholder string. The `!env.CF_ACCOUNT_ID` half of
the guard stays.

`src/ops2/chrome/useNotificationCount.ts:L10-13,L26,L56,L69-70`: shrink: the
`subscribers` Set, its notify loop and its `__testing` export exist only
because the poll throws away the promise's result.
`fetchNotificationCount()` already resolves to the value — call
`fetchNotificationCount().then(setCount)` in the effect, in the interval and in
the visibility handler, and the pub/sub layer disappears along with the test
plumbing that reaches into it.

`src/ops2/attention/useMonitoring.ts:L5-7`: delete: `MoneySnapshot` is
re-declared verbatim from `worker/lib/monitoring.ts:L23-25`. Both files already
import from `src/data/monitoring.ts`; declare it there once and import it in
both.

`src/ops2/attention/useMonitoring.ts:L66-78`: shrink: the snapshot is parsed
(L66) and then the same object is read raw again as `enriched` (L67) for the
three fields the parser drops. Carry `red`, `floorUsd` and `ceilingPct` in
`parseMonitoringSnapshot` — they are part of the route's payload contract — and
the shadow read, the three extra `typeof` checks and the spread-merge at L78
collapse to the parser's own result.

`src/data/monitoring.ts:L49`: shrink: `parseMonitoringSnapshot` returns
`unknown`, which forces `as any` at `worker/lib/monitoring.ts:L167,L191` and a
`as Record<string, unknown>` / `as MonitoringSnapshot` pair at
`useMonitoring.ts:L70,L78`. Declare the return type it already builds; four
casts go.

`src/ops2/styles/nav.css:L320-341` + `L370-388`: shrink: `.ops2-bell__badge` and
`.ops2-tab-badge` share eleven identical declarations and differ in three
(anchor edges and the ring). One shared selector plus two short overrides.

`src/ops2/attention/useMonitoring.ts:L92-93`: stdlib: `dayKey.split("-").map
(Number)` fed to `Date.UTC(...)` reproduces what the Date constructor already
does — an ISO date-only string parses as UTC midnight by spec. `const at = new
Date(dayKey);`.

`worker/lib/monitoring.ts:L41,L47`: yagni: `env.CF_TIMEOUT_MS` is a knob no
config sets — absent from `wrangler.jsonc` and undeclared in `Env`
(`worker/types.ts`) — that exists so `ai-monitoring.test.mjs:L594` can pass 50.
The injected `fetchImpl` already receives `init.signal`, so the test can assert
the abort signal without a second override. If the knob is kept for the faster
test, declare it in `Env` rather than leaving an undeclared env read.

`src/data/monitoring.ts:L163-165`: yagni (marginal): `capOutstanding` is a
one-line subtraction with one caller (`AttentionPage.tsx:L247`). Inlining it
removes the function, an import and a test; keeping it is defensible under the
"one place per fact" house rule. Developer's call.

`worker/types.ts:L62-68` + `wrangler.jsonc:L137-138`: yagni (soft, design-
specified): `AI_CREDIT_FLOOR_USD` and `AI_CAP_CEILING_PCT` are committed at
exactly their in-code defaults, and changing either needs a deploy the same as
editing a constant would. Two constants in `src/data/monitoring.ts` would do.
Flagged because design §3.3 asked for them, so this is a note rather than a cut.

## Not flagged, deliberately

- The monitoring skeleton (`AttentionPage.tsx:L123-152`, ~30 lines mirroring the
  real layout) is explicitly requested by UX §6.5 — "the skeleton is the
  layout". Requested work is off-limits to laziness.
- The DST handling in `parseWindowStart` / `melbourneDayKeys`
  (`src/data/monitoring.ts:L95-142`) is the minimum correct version without a
  timezone dependency, and its comments explain a real bug it fixes.
- The bar chart as plain divs and CSS heights, rather than a charting
  dependency, is the right rung for fourteen numbers.

net: ~120 lines possible.

---

Recovered from the reviewer's plan file: plan mode blocked its write to the run
directory (the third attempt at this axis; the first two thrashed at a 100k
context window, since raised to 220k in scripts/pipeline/conduct.mjs).
