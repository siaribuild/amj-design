# Security Review — `feat/ops2-attention` vs `c796e0a`

**No findings above the reporting bar.**

## Scope of the change

The 27-commit branch is frontend, tests, tooling and docs only. `git diff --stat c796e0a..HEAD` shows **zero changes** under `worker/`, `migrations/`, `src/data/`, or `containers/` — no route, no query, no auth check, no schema, no crypto, no dependency added. The security-relevant surface is therefore small and was reviewed in full:

| File | Verdict |
|---|---|
| `src/ops2/attention/useSummary.ts` | Same-origin `fetch("/api/ops/summary", { credentials: "same-origin" })`. Static path, no user-controlled URL segment, no token in the URL. 401/403 render a static message; error/degraded branches render fixed strings, never server text. |
| `src/ops2/attention/attention.ts` | `parseSummary` is strict — non-object, `degraded: true`, or any of six keys non-finite → `"degraded"`. Every `href` is built from `destination()` constants plus a `?wait=` value taken from the `WAIT_CHIPS` table, not from a response. No response field reaches a URL or the DOM as markup. |
| `src/ops2/attention/AttentionPage.tsx` | Plain React rendering; `{row.count}` / `{row.noun}` are escaped by JSX. No `dangerouslySetInnerHTML`, no `href` from remote data. `history.push(row.href)` receives a compile-time constant string. |
| `src/ops2/projects/queue.ts` — `chipFromSearch` | New consumer of an attacker-supplyable query param (`?wait=`). Correctly allowlisted: `WAIT_CHIPS.some(c => c.key === key)` before the cast, `null` otherwise. No path/redirect built from it — `history.replace(PROJECTS.path)` uses a constant. |
| `src/ops2/nav/destinations.ts`, `icons.ts` | New `enquiries` destination is a nav entry rendering `DestinationRoot` (placeholder). No data fetch, no new endpoint. |
| `src/ops2/styles/attention.css` | Presentation only. |
| `scripts/db/seed.sql` | Adds `u_staff7` following the existing six-row pattern. Applied `--local` by every test harness; the only remote path (`scripts/reset-db.mjs`) is pre-existing and gated behind a typed confirmation. No new secret, no credential — auth here is OTP, not a stored password. |
| `scripts/pipeline/conduct.mjs` | `CONTEXT_CAP = null`, `FIX_CAP` 3→6, `autocompactArgs()` extracted. Local developer tooling; no untrusted input, no new process spawn shape. |

## Authorization check on the endpoint the new page consumes

`worker/routes/ops.ts:312` — `GET /api/ops/summary` calls `resolveStaff()` and returns `403 {"error":"forbidden"}` when it resolves empty, before any query runs. Unchanged by this branch, and the new client honours it with a no-retry `unauthorised` state. The counts are aggregate integers with no PII, no pricing, and no per-account rows, so the response body carries nothing sensitive even to a staff reader.

Client-side authz absence in `Ops2App.tsx` route wiring is not a finding — the gate is server-side and is present.

## Categories explicitly checked and clear

SQL injection (no new queries), command injection (no new `exec`/`spawn` with external input), path traversal (no filesystem paths from input), XSS (React-only, no unsafe sink), authentication/authorization bypass (no auth code touched), secrets (none introduced), deserialization (`res.json()` into a strict validator), data exposure (no PII in the new payload or in any new log statement).