# Context

The `/security-review` stage of the `ai-parse-monitoring` pipeline run was asked to
review the branch diff against `591a912d` and write its findings to
`docs/runs/ai-parse-monitoring/07-review-security.md`. The review was completed.
**The write was refused by plan mode** ("Cannot write to ... while in plan mode"), so
the report is held here — the plan file is the only writable path in this session.

This is the exact failure recorded in memory as `pipeline-reviewers-never-wrote-reports`:
a reviewer stage launched under plan mode cannot deposit its report, and the run then
looks Codex-gated only. Copying the block below to
`docs/runs/ai-parse-monitoring/07-review-security.md` completes the stage.

---

# Security review — ai-parse-monitoring

Branch: `feat/ai-parse-monitoring`
Base: `591a912d` (`polish(ops2-attention): the mock's form, and a retry that could not work`)
Scope reviewed: the feature diff — 21 files, 2589 insertions / 23 deletions
(`git diff 591a912d..HEAD -- worker/ src/ scripts/ migrations/`).

## Findings

**None above the reporting bar.** No HIGH or MEDIUM finding cleared the >80%
confidence threshold, so nothing is reported. What was checked and why each
candidate was dismissed is recorded below, so the absence of findings is
readable rather than merely asserted.

## What was examined

### Authorization on the new endpoint — `worker/routes/ops.ts:363`

`GET /api/ops/monitoring` is the only new attack surface. It is gated by
`resolveStaff(c.env, c.req.raw)` and returns 403 otherwise.

Traced through `worker/lib/staff.ts`:

- `resolveStaff` → `resolveInternalUser`, then rejects `role === "manufacturer"`.
  It is therefore *equivalent to* the `isStaffUser` predicate the design named
  (`worker/routes/ops.ts:111`), not weaker than it — `isStaffUser` is
  `!!staff && role !== "manufacturer"` applied to `resolveOpsUser`, which is the
  same `resolveInternalUser` without the role filter.
- `resolveInternalUser` fails closed in production: when `ACCESS_TEAM_DOMAIN`
  and `ACCESS_AUD` are both set, a verified Cloudflare Access assertion is the
  only accepted identity and the session-cookie fallback is disabled.
- Anonymous and customer sessions fail the `type === "internal"` check.
- A manufacturer-partner session authenticates but is refused, so the partner
  containment rule holds for this endpoint.

Hono route ordering was checked (`ops.get`/`post`/`patch`/`delete`
registrations, lines 212–2118): `/monitoring` is a literal path with no
preceding wildcard or `/:param` route at the same depth that could shadow it
with a weaker guard.

The refusal body is `{"error":"forbidden"}` — no balance, spend, cap, or count
value is present on the denial path.

### Secret handling — `worker/lib/monitoring.ts`

- `CF_MONITORING_TOKEN` is declared secret-only (`worker/types.ts:55-60`) and is
  deliberately absent from `wrangler.jsonc`; it is read only into an
  `Authorization: Bearer` header at `monitoring.ts:45` and never returned,
  stored, or serialised.
- The failure log at `monitoring.ts:146` prints an endpoint path suffix and
  nothing else. `pathSuffix()` slices from `/ai-gateway/`, so neither the token
  nor the account id can reach the log line, and thrown errors are reduced to
  `err.message` with the `status NNN for ` prefix stripped.
- `CF_ACCOUNT_ID` is committed in `wrangler.jsonc:135` as a plain var. An
  account id is an identifier, not a credential — the Cloudflare API rejects it
  without a token — and it is already committed elsewhere in the same file as
  the container registry namespace. Not a finding.

### Data exposure on the response

`parseMonitoringSnapshot` (`src/data/monitoring.ts:30`) rebuilds the snapshot
field by field rather than validating the stored object in place, so a KV value
carrying extra fields cannot pass them through to the client.
`monitoringPayload` spreads only that rebuilt object plus three server-computed
values (`redBalance`, `redCap`, `floorUsd`). The payload contains no token, no
account id, and no gateway credentials. The financial figures it does contain
(credit balance, billed spend, cap) are staff-only business data behind the
guard above.

### Injection

`PARSE_OUTCOME_SQL` (`monitoring.ts:9-16`) is a static string with two bound
parameters, both derived from a `Date` the Worker constructs. The `jobs.ts`
INSERT change binds `triggeredBy` from a two-value TypeScript union set by
call sites (`"upload"` default, `"ops"` from `ops.ts:2093`), never from a request
body. No string interpolation reaches SQL.

The Cloudflare URL at `monitoring.ts:43` interpolates `env.CF_ACCOUNT_ID` and
`env.AI_GATEWAY_ID` — environment values, trusted by precedent, with a fixed
host and protocol. No user-controlled component, so no SSRF.

### Migration — `migrations/0064_ai_job_claim_triggered_by.sql`

Pure `ALTER TABLE ... ADD COLUMN` with a `NOT NULL DEFAULT 'upload'`. No table
rebuild, so the `ON DELETE CASCADE` hazard that motivated `d1-migration-safety`
does not apply here.

### Client code

`AttentionPage.tsx`, `OpsPage.tsx`, `Ops2App.tsx` and the two hooks render
through JSX only — no `dangerouslySetInnerHTML`, no `innerHTML`, no
`new Function`/`eval`. The one `href` in the diff is an Ionic tab route from a
static destination list. Per the review's own precedent, React rendering
without unsafe methods is not an XSS surface.

Both hooks fetch `/api/ops/monitoring` with `credentials: "same-origin"` and
make no Cloudflare call from the browser, so the token never approaches the
client bundle.

## Candidates considered and dismissed

| Candidate | Why not reported |
| --- | --- |
| `CF_ACCOUNT_ID` committed to `wrangler.jsonc` | Identifier, not a credential; useless without the secret token; already public in the same file. Also within the "secrets on disk" hard exclusion. |
| `console.log` on CF fetch failure | Logs a path suffix and a status; no secret, no PII. Logging URLs is assumed safe by precedent. |
| Unauthenticated read of financial figures | Not reachable — `resolveStaff` refuses anonymous, customer, and manufacturer identities, and Access fronts the ops host in production. |
| `AbortSignal.timeout` / cron failure paths | Availability behaviour, and DoS is a hard exclusion. |
| Module-level notification cache in `useNotificationCount.ts` | Client-side state; the server re-authorizes every request, and client-side trust is not a vulnerability by precedent. |


---

Recovered from the reviewer's plan file: plan mode blocked its write to the
run directory. Review round 3, over the final diff.
