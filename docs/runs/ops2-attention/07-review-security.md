# Context

The `security-review` stage of the ops2-attention feature run was asked to review the branch
diff against `284f89ff` and write its findings to `docs/runs/ops2-attention/07-review-security.md`.

The review is complete. The write is not possible: this session is running under plan mode
(`--permission-mode plan`, as CLAUDE.md specifies for this stage), which permits editing only
this plan file. This is the same failure mode recorded in the `pipeline-reviewers-never-wrote-reports`
memory — surfacing it rather than letting the stage pass silently unreported.

The finished report is reproduced verbatim below so nothing is lost. The single action needed is
to copy it to `docs/runs/ops2-attention/07-review-security.md`.

# Scope reviewed

The `284f89ff..HEAD` range is dominated by history unrelated to this feature (the diff is 18.8 MB
because the base predates most of the repo). The changes actually attributable to the
ops2-attention run, and the surface reviewed for security implications:

- `src/ops2/attention/attention.ts` — pure model: `parseSummary()`, `attentionGroups()`
- `src/ops2/attention/useSummary.ts` — `fetch("/api/ops/summary")` hook
- `src/ops2/attention/AttentionPage.tsx` — the page
- `src/ops2/nav/destinations.ts`, `nav/icons.ts` — new `enquiries` destination
- `src/ops2/projects/queue.ts` — `chipFromSearch()`, new `?wait=` parser
- `src/ops2/projects/ProjectsPage.tsx` — consumes `?wait=` once, then strips it
- `src/ops2/styles/attention.css`, `styles/index.css`
- `scripts/db/seed.sql` — one extra local-seed staff row (`u_staff7`)
- `scripts/pipeline/conduct.mjs` — pipeline tooling (`CONTEXT_CAP`, `readTasks()`)
- test files (excluded from findings per the review's own exclusions)

No `worker/**` changes and no `migrations/**` changes are in this feature's diff.

---

# Security review — ops2-attention

**Result: no HIGH or MEDIUM findings above the confidence bar.**

## What was checked, and why each cleared

**The new server surface: there isn't one.** The feature consumes `GET /api/ops/summary`,
which already existed. `worker/routes/ops.ts:311` gates it with `resolveStaff()` and returns
`403 {"error":"forbidden"}` — the denial body carries no counts, so a non-staff caller learns
nothing about queue depth. The run added assertions pinning exactly that
(`api.test.mjs`, `api-edge.test.mjs`: anonymous, customer, manufacturer, and
Access-fallback-off cases all assert `body.submissions === undefined`). Abuse-case criteria
executed for real, per the spec-time layer.

**Authorization is not re-decided client-side.** `useSummary` treats 401/403 as a distinct
`unauthorised` state with no retry control, but that is presentation only — the server refuses
independently. No client-side permission logic was introduced that the backend does not also
enforce.

**`?wait=` (the one new untrusted input path).** `chipFromSearch()`
(`src/ops2/projects/queue.ts:165`) reads the param via `URLSearchParams` and accepts it only if
it matches a key already present in `WAIT_CHIPS`; anything else returns `null`. The validated
key is used as in-memory filter state, never interpolated into a URL, a query, or markup.
`history.replace(PROJECTS.path)` redirects to a module constant, so there is no open-redirect
path through the stripping step.

**Navigation targets are constants.** Every `row.href` comes from `destination(id).path` plus a
validated chip key inside `GROUP_SPECS` — no API-supplied or URL-supplied value reaches
`history.push()`.

**No XSS surface.** No `dangerouslySetInnerHTML`, no `innerHTML`, no `href`/`src` built from
response data. All rendered strings (`group.label`, `row.noun`) are module constants; the only
response-derived value is `row.count`, which `parseSummary()` has already required to be a
finite `number`, and which React escapes regardless.

**Parsing is fail-closed, which is the safer direction.** `parseSummary()` returns `"degraded"`
on a non-object body, on `degraded: true`, or on any of the six keys missing or non-finite.
It never coerces an unparseable body into zeros — the console shows an error panel rather than a
falsely-empty queue. No prototype-pollution path: keys are read from a fixed `SUMMARY_KEYS`
allowlist into a fresh object literal, never assigned from attacker-chosen key names.

**Credentials.** `fetch(..., { credentials: "same-origin" })` on a same-origin relative path —
the session cookie is not exposed cross-origin.

**Seed data.** `scripts/db/seed.sql` adds `u_staff7` (`liis@openframe.com.au`, role `estimator`)
for the new browser suite. It is local/test seed data only, carries no credential material, and
sign-in still requires the OTP flow.

**Pipeline tooling.** `conduct.mjs` changes are `CONTEXT_CAP = null` (drops the `--autocompact`
flag), a `readTasks()` shape-tolerant JSON reader, and a `compact:` bump. No new shell
interpolation, no new network or filesystem reach, no untrusted input.

## Not reported (excluded by the review's own rules)

- Test-only files (`scripts/tests/**`) and documentation/mocks (`docs/**`).
- Client-side code that trusts the backend to enforce authorization — that is the correct
  division of responsibility here, and the backend does enforce it.

# Action

Copy the report above (from `# Security review — ops2-attention` down) into
`docs/runs/ops2-attention/07-review-security.md`, then let the conductor proceed to `accept`.
