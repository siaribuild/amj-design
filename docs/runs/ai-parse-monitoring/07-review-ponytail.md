`worker/lib/monitoring.ts:L255-322: yagni:` a notification-source plugin registry — `NotificationContext`, `NotificationSource`, `countFrom`, `NOTIFICATION_SOURCES`, `allSettled` failure isolation — with exactly ONE source, and that source is a pure sync evaluation that cannot reject. Dead flexibility, ~35 lines protecting nothing. Replace with the body: `export async function notificationCount(env, snapshot) { const {floorUsd, ceilingPct} = redThresholds(env); return snapshot && evaluateRed(snapshot, floorUsd, ceilingPct) ? 1 : 0 }`. Add the registry back the day a second source exists.

`.claude/launch.json:L4-49: delete:` 22 lines of pure JSON re-wrapping (`["run","dev"]` → four lines), unrelated to monitoring. Revert the file; the diff carries no behaviour here.

`worker/lib/monitoring.ts:L125-133: shrink:` `logFailure` re-parses the path back out of an error message this same module composed (`lastIndexOf(" for ")`, `startsWith`), and `requireNumber` fabricates `" for /ai-gateway/"` suffixes solely to satisfy that parse. Log at the throw site in `cfGet` where `pathSuffix(url)` is already in hand, then throw bare. Same sanitisation guarantee, no string protocol between two functions in one file. −10.

`worker/lib/monitoring.ts:L312-318: yagni:` `snapshot?` optional with a KV-read fallback — both production callers pass it explicitly (L329, L337); only a test uses the one-argument form. Make the parameter required and let the test pass `null`. −3.

`worker/lib/monitoring.ts:L320-322: delete:` `__testingSources = { countFrom }` re-exports `countFrom`, which is already `export async function` on L295. The test can import it directly. −3.

`src/data/monitoring.ts:L245-252: yagni:` `evaluateRed` is a two-line wrapper over `evaluateRedFlags` with one production caller (`aiBudgetRed`). Inline as `flags.balance || flags.cap` at the call site. −8.

`src/ops2/attention/AttentionPage.tsx:L12,L272 + src/data/monitoring.ts:L254-256: yagni:` `capOutstanding` is a named cross-layer import for one subtraction, one caller. `budget.capUsd - budget.billedSpendUsd` inline. −4.

`src/ops2/attention/useMonitoring.ts:L500 + src/ops2/chrome/useNotificationCount.ts:L699: yagni:` two independent caches over the SAME endpoint — on the Attention page at desk width `/api/ops/monitoring` is fetched twice for one payload, and `notificationCount` is already in the body `useMonitoring` throws away. Have `useMonitoring` seed the module cache (or read the count from its own response). Removes one request and one cache's reason to exist.

`src/data/monitoring.ts:L116-129: stdlib:` `MELBOURNE_WALL` + `formatToParts` + `Object.fromEntries` + re-`Date.parse` reconstructs an offset Intl reports directly. `new Intl.DateTimeFormat("en", {timeZone:"Australia/Melbourne", timeZoneName:"longOffset"})` → `"GMT+11:00"`, parse the ±HH:MM. −6.

`src/ops2/attention/useMonitoring.ts:L5: delete:` `export type { MoneySnapshot }` — nothing imports it from this module (only `src/data/monitoring.ts` exports are used). −2.

`src/ops2/chrome/useNotificationCount.ts:L691-755: stdlib:` hand-rolled subscriber `Set` + `useState` + manual `notify` loop is `useSyncExternalStore`'s exact job — React ships it, the module already has `subscribe`/`getSnapshot` in all but name. −5.

net: -95 lines possible.