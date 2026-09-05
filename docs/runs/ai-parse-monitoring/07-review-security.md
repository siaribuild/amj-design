# Security review — `feat/ai-parse-monitoring` vs `591a912d`

**Intended destination:** `docs/runs/ai-parse-monitoring/07-review-security.md`
(plan mode is active and blocks writes outside this plan file — copy this
content there before the pipeline's `review` stage records the result).

## Scope

Review surface, from `git diff --stat 591a912d...HEAD -- worker/ src/ migrations/ scripts/ containers/`
— 21 files, 2040 insertions, 20 deletions. Non-test source examined line by line:

- `migrations/0064_ai_job_claim_triggered_by.sql`
- `src/data/monitoring.ts`
- `src/ops2/attention/AttentionPage.tsx`, `src/ops2/attention/useMonitoring.ts`
- `src/ops2/chrome/OpsPage.tsx`, `src/ops2/chrome/useNotificationCount.ts`, `src/ops2/Ops2App.tsx`
- `worker/index.ts`, `worker/lib/ai/jobs.ts`, `worker/lib/monitoring.ts`,
  `worker/lib/staff.ts`, `worker/routes/ops.ts`, `worker/types.ts`

Test files and CSS excluded per the review's own rules. The large unrelated
working-tree churn in `git status` (43 modified `src/` files, `theme.css`,
untracked `docs/mocks/`) is a separate design-system effort and is not part of
this branch's delta.

## Result

**No HIGH or MEDIUM severity findings reached the ≥8 confidence bar. Nothing to report.**

## What was checked, and why each cleared

**Authorization — the new endpoint.** `GET /api/ops/monitoring`
(`worker/routes/ops.ts`) gates on `resolveStaff(c.env, c.req.raw)`, the same
gate used by the 41 sibling ops routes: Cloudflare Access assertion in
production, session cookie where Access is not configured. Data is served only
on that path. The new `hasOpsCredential` (`worker/lib/staff.ts`) does not verify
a JWT, but it is reached only *after* `resolveStaff` has already denied, and its
sole effect is choosing 403 over 401. A forged `Cf-Access-Jwt-Assertion` header
changes the denial status code and returns no data. Not an authorization bypass.

**SQL injection.** `PARSE_OUTCOME_SQL` in `worker/lib/monitoring.ts` is a static
string; both time arguments are `?` binds (`datetime(?)`,
`datetime(?, '-30 minutes')`) fed ISO strings produced by `Date`. The
`triggered_by` value added to the `INSERT` in `worker/lib/ai/jobs.ts` is a bound
parameter of union type `"upload" | "ops"`, never caller-supplied free text.

**Secret handling.** `CF_MONITORING_TOKEN` travels only in an `Authorization`
header (`cfGet`), is declared in `worker/types.ts` as a `wrangler secret` and
explicitly not a `VITE_*` var, so it cannot reach the client bundle. Error paths
were traced: `cfGet` throws `status ${res.status} for ${pathSuffix(url)}`, and
`pathSuffix` slices from `/ai-gateway/` onward, so neither the token nor the
account id appears in the logged message. The `catch` in `fetchMoneyNumbers`
logs only that stripped path.

**Data exposure to the client.** `parseMonitoringSnapshot` (`src/data/monitoring.ts`)
rebuilds a whitelisted object field by field — `takenAt`, a discriminated
`money` shape, exactly 7 typed day buckets, `success7d`, `error7d` — and returns
`null` on any type mismatch. No field from KV passes through untouched, so the
spread in `monitoringPayload` cannot leak an unexpected key. Object literals
only, no computed-key assignment, so no prototype-pollution sink. Payload is
Cloudflare account billing figures behind the staff gate; no customer PII.

**Migration.** `0064` is a single `ALTER TABLE ai_job_claim ADD COLUMN
triggered_by TEXT NOT NULL DEFAULT 'upload'` — additive, no table rebuild, and
nothing `REFERENCES ai_job_claim`, so the `ON DELETE CASCADE` hazard that cost
production rows previously does not apply.

**Client-side.** No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or
`new Function` anywhere in the ops2 delta; both fetches are same-origin relative
paths with `credentials: "same-origin"`. Per the review's precedents, React is
otherwise XSS-safe and absent client-side permission checks are not
vulnerabilities — the server gate above is what matters.

**Scheduled handler.** `worker/index.ts` adds
`writeMonitoringSnapshot(env).catch(...)` inside `scheduled` — no
request-facing surface, and the catch logs the error string only.

## Considered and deliberately not reported

- `env.CF_ACCOUNT_ID` / `env.AI_GATEWAY_ID` interpolated into the Cloudflare API
  URL path. Env vars are trusted by precedent, and SSRF where only the path is
  controlled (host and protocol fixed) is a hard exclusion.
- `hasOpsCredential` trusting an unverified header — 401/403 disclosure only,
  well below the MEDIUM bar and not a data exposure.
- KV snapshot durability, cron failure behaviour, unbounded fetch retries —
  availability/resource concerns, all hard-excluded.
