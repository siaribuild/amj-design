# Security Review — `merge/ai-parse-monitoring` (diff vs `a76b8119`)

**No HIGH or MEDIUM findings.** Nothing in this branch clears the >80% confidence bar for a real, exploitable vulnerability.

## Scope reviewed

25 non-doc files, 3,299 insertions. Security-relevant surface:

- `worker/lib/monitoring.ts` (new, 339 lines) — D1 count query, Cloudflare billing fetches, KV snapshot, notification aggregation
- `worker/routes/ops.ts` — new `GET /api/ops/monitoring`
- `worker/index.ts` — cron sweep registration
- `worker/lib/ai/jobs.ts` + `migrations/0064_ai_job_claim_triggered_by.sql` — new `triggered_by` column
- `worker/types.ts`, `wrangler.jsonc` — new env declarations and vars
- `src/data/monitoring.ts`, `src/ops2/attention/useMonitoring.ts`, `src/ops2/chrome/useNotificationCount.ts`, `AttentionPage.tsx`, `Ops2App.tsx`, `OpsPage.tsx` — client rendering

## What was checked and cleared

**Authorization.** `GET /api/ops/monitoring` (`worker/routes/ops.ts:494`) gates on `resolveStaff`, the same guard its sibling ops routes use. `resolveStaff` (`worker/lib/staff.ts:155`) refuses manufacturer partners and, once Access is configured, refuses anything without a verified `Cf-Access-Jwt-Assertion` — no session fallback. The route is the correct tier for its payload: AI spend and parse counts are staff-only operational data, and a manufacturer partner cannot reach it. The commit message's reasoning for collapsing 401/403 into one 403 is correct and loses nothing security-relevant.

**SQL injection.** `PARSE_OUTCOME_SQL` (`worker/lib/monitoring.ts:131`) is a static string; both `datetime(?)` and `datetime(?, '-30 minutes')` take bound parameters derived from a server-side `new Date()`, never from request input. The `triggered_by` value threaded through `enqueueAiExtraction`/`retryCurrentAiExtraction` is bound, and its type is a two-member literal union fixed at the two call sites (`"upload"` default, `"ops"` from the staff retry route) — not user input. Migration 0064 is a pure `ADD COLUMN` with a `NOT NULL DEFAULT`, no table rebuild, so the cascade-delete class of failure does not apply.

**Secret and PII exposure in logs.** This is the one place the code was clearly written against the threat, and it holds up. `cfGet` (line 164) discards the transport's own error message rather than logging it — correct, since a fetch implementation's error text may quote the full request including the `Authorization: Bearer` header. `logFailure` (line 247) whitelists rather than sanitizes: it prints the suffix only if the message matches the shape this module composes *and* the suffix starts with `/ai-gateway/`, otherwise `?`. There is no path by which the token, the account id, or a full URL reaches `console.log`. `CF_MONITORING_TOKEN` is declared as a secret-only var (`worker/types.ts:524`) and is correctly absent from `wrangler.jsonc`.

**Untrusted-data boundary.** `parseMonitoringSnapshot` (`src/data/monitoring.ts:88`) rebuilds the snapshot field by field rather than validating in place, so an extra field in the stored KV value cannot ride through to the client. `available` is matched on `=== true` / `=== false` only, so a truthy non-boolean falls through to `null` rather than skipping the field checks. Every number crossing the Cloudflare boundary passes `requireNumber`, and a malformed KV value returns `null` inside the seam instead of throwing a 500.

**XSS.** All new rendering is React with no `dangerouslySetInnerHTML`, no `innerHTML`, no `href`/`src` built from data. `capSource` is the only string from stored JSON that reaches text output, and its only writer is this repo's own cron with two literal values; React escapes it regardless.

**SSRF.** `cfGet` builds its URL from a hardcoded `https://api.cloudflare.com/client/v4/accounts/` prefix plus `env.CF_ACCOUNT_ID` and a module-constant path. Host and protocol are fixed; the only interpolated values are environment variables, which are trusted.

**Client-side gaps.** `useNotificationCount`'s module-level cache, shared in-flight promise and single polling interval hold no sensitive data beyond an integer already gated server-side, and a `!res.ok` falls back to the previous value rather than fabricating one. Lack of client-side permission checks here is not a finding — the server gate is the one that matters.

## Informational, not a finding

`CF_ACCOUNT_ID` is committed as a plaintext var in `wrangler.jsonc:554`. The accompanying comment states it is not a secret and notes it was already committed above as the container registry namespace, which is accurate — a Cloudflare account id is not a credential on its own, and the token that would make it useful is `wrangler secret put`-only. Raised only so the decision is visible in the record; no action recommended.