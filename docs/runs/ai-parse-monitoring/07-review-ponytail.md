# 07 — ponytail review (over-engineering)

**Context:** the conductor asked for a ponytail review of `591a912d...HEAD` written
to `docs/runs/ai-parse-monitoring/07-review-ponytail.md`. Plan mode blocked the
write to the run directory (again — the same block the existing file's footer
records). The finished report is below verbatim; copy it to that path.

---

Diff reviewed: `591a912d...HEAD`, the ai-parse-monitoring feature branch.
Scope is over-engineering only — correctness, security and performance belong to
the other three reviewers.

Second pass. Most of the first pass was applied: `parseMonitoringSnapshot` now
declares its return type, `MoneySnapshot` is declared once in
`src/data/monitoring.ts`, the 401/403 split and `hasOpsCredential` are gone, and
`formatDayLabel` uses the Date constructor. What follows is what is still there,
plus what the fixes added.

## Findings

`worker/lib/monitoring.ts:L168-190`: yagni: the notification-source registry
still has exactly one source. `NotificationContext`, `NotificationSource`,
`aiBudgetRed`, `NOTIFICATION_SOURCES` and the two-argument `notificationCount`
exist so that a `Promise.all`/`reduce` can run over an array of length one.
`monitoringPayload` already has the answer at L199 — return
`notificationCount: red.balance || red.cap ? 1 : 0`. That also removes the
duplicated floor/ceiling parse (L173-174 against L197-198), the optional-second-
argument dance at L184-186, and the `as any` at L175. CONTEXT.md's "assembled
from a source list so a later source appends without touching the aggregation"
is the speculative structure itself, not a defence of it: appending a second
source to a `?1:0` is a five-line change on the day it exists.

`src/data/monitoring.ts:L189-196`: delete: `evaluateRed` is an OR over
`evaluateRedFlags` whose only production caller is `aiBudgetRed`, which the
finding above deletes. The page reads `redBalance`/`redCap` separately.
`ai-monitoring.test.mjs` asserts it in six places — those assertions read the
same truth off `evaluateRedFlags`.

`worker/lib/monitoring.ts:L66,L94`: delete: `PLACEHOLDER_ACCOUNT_ID` and its
comparison. `wrangler.jsonc:L130` commits the real account id, so no deployment
can carry the placeholder string. The `!env.CF_ACCOUNT_ID` half of the guard
stays. (Raised in the first pass, not applied.)

`src/ops2/attention/useMonitoring.ts:L63-81`: shrink: the payload is parsed
(L63) and then the same object is read raw again as `enriched` (L64) for the
three fields the parser drops. Both sides already share
`src/data/monitoring.ts`; put a `parseMonitoringPayload` there that validates
`redBalance`, `redCap` and `floorUsd` alongside the rest, and the cast, the
three `typeof` checks and the spread-merge at L76-81 collapse to its result.

`src/ops2/styles/nav.css:L320-338` + `L370-387`: shrink: `.ops2-bell__badge` and
`.ops2-tab-badge` share fourteen identical declarations and differ in three
(anchor edges, and the bell's ring). One shared selector plus two short
overrides.

`src/ops2/chrome/useNotificationCount.ts:L62-73`: native: a module-level cache
plus a subscriber Set feeding `useState`/`useEffect` is the shape React ships
`useSyncExternalStore` for — `subscribe` is the add/remove pair (with the poll
start/stop), `getSnapshot` is `cache?.value ?? 0`. The Set stays; the state
mirror, the effect that syncs it and the `for (const notify of subscribers)`
fan-out at L26 go.

`src/ops2/chrome/useNotificationCount.ts:L81-91`: shrink (soft): `__testing`
exports `subscribers` and `isPolling` so a test can read the module's internals.
Two mounted hooks and one fetch prove the same thing from outside. Carries a
`ponytail:` comment already, so this is a note on a known shortcut, not a new
find.

`worker/lib/monitoring.ts:L46` + `worker/types.ts` (`CF_TIMEOUT_MS`): yagni
(soft): the knob is now declared, which was half the first pass's point, but it
is still config no deployment sets, existing so one test can pass 50. The
injected `fetchImpl` already receives `init.signal`, so the abort is assertable
without an env override.

`src/data/monitoring.ts:L198-200`: yagni (marginal): `capOutstanding` is a
one-line subtraction with one caller (`AttentionPage.tsx:L254`). Survived the
first pass on the "one place per fact" house rule; recorded, not re-litigated.

`worker/types.ts` + `wrangler.jsonc:L131-132`: yagni (soft, design-specified):
`AI_CREDIT_FLOOR_USD` and `AI_CAP_CEILING_PCT` are committed at exactly their
in-code defaults, and changing either needs a deploy the same as editing a
constant would. Design §3.3 asked for them, so this is a note rather than a cut.

## Not flagged, deliberately

- The monitoring skeleton (`AttentionPage.tsx`, ~30 lines mirroring the real
  layout) is explicitly requested by UX §6.5 — "the skeleton is the layout".
  Requested work is off-limits to laziness.
- `requireNumber` and `pathSuffix` are validation and log redaction at a trust
  boundary. Never the shortest diff.
- The DST handling in `parseWindowStart` / `melbourneDayKeys` is the minimum
  correct version without a timezone dependency.
- The bar chart as plain divs and CSS heights is the right rung for fourteen
  numbers.
- The per-sweep `.catch` added to `drainLearningOutbox` in `worker/index.ts` is
  one line that stops one failure sinking four jobs.

net: ~90 lines possible.


---

Recovered from the reviewer's plan file: plan mode blocked its write to the
run directory. Review round 3, over the final diff.
