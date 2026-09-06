# Security Review — `feat/ops2-attention-prefilter` (diff vs `4a1acc69`)

## Scope reviewed

13 commits, 34 files. The security-relevant surface is small; the bulk of the diff is documentation, mocks, run artefacts and tests.

| Area | Files | Note |
|---|---|---|
| Worker API | `worker/routes/ops.ts` (+5) | Two extra fields serialised on `GET /api/ops/projects` |
| Client logic | `src/ops2/projects/queue.ts`, `src/ops2/attention/attention.ts` | New `?attn=` axis, predicates, selector |
| Client UI | `src/ops2/projects/ProjectsPage.tsx`, `src/ops2/attention/AttentionPage.tsx`, `styles/projects.css` | Param consumption, filter chip, reset effect |
| Test/verify tooling | `scripts/tests/**`, `scripts/tests-verify/{abuse,live-rows}.mjs` | Test-only, excluded per the review's hard exclusions |

Data flows traced: URL `?attn=` → `attentionFromSearch` → `QueueQuery.attention` → `selectProjects` / `emptyStateFor` / active-filter strip; and D1 row → `/api/ops/projects` JSON → `parseProjectQueue` → predicates.

## Findings

**No HIGH or MEDIUM severity vulnerabilities found.**

Nothing in this diff cleared the ~80% exploitability bar. What was checked and why it is clean:

- **Untrusted URL parameter (`?attn=`) — no injection sink.** `attentionFromSearch` (`src/ops2/projects/queue.ts:181`) parses with `URLSearchParams` and allow-lists against the closed `ATTENTION_FILTERS` key set; anything else becomes `null`. The raw value is never rendered, never concatenated into a query, and never persisted. The strip's label (`ProjectsPage.tsx:167`) is looked up from the module constant, not from the URL, so there is no reflected-XSS path. `ProjectsPage.tsx:80` reads only `.has("attn")` from the raw string. No `dangerouslySetInnerHTML` anywhere in the diff.
- **New API fields are authorization-gated and non-sensitive.** `statusCustomer` / `orderStage` (`worker/routes/ops.ts:426-427`) are added inside `ops.get("/projects")`, which still begins with `if (!(await resolveStaff(...))) return c.json({ error: "forbidden" }, 403)` — unchanged. Both are internal lifecycle enums (`submitted`, `under_review`, `deposit_invoiced`, …), not PII or financial detail, and `status_customer` was already exposed to the same staff audience by `/api/ops/queues/submissions`. No new columns were added to the SQL; both were already selected for `lifecycleOf`.
- **No SQL change, no new interpolation.** The only interpolated value in the query, `BLOCKING_STATUS_SQL`, is untouched by this branch and is built from a module constant.
- **Filtering is presentation, not a security boundary.** `selectProjects`' new `.filter` on `query.attention` narrows a list the server already authorised in full; it neither grants nor is relied upon for access control, so the client-side predicate carries no authorization weight.
- **Failure handling under-claims rather than over-shares.** `parseProjectQueue` maps a missing `statusCustomer` to `""` and a missing `orderStage` to `null`, both of which match no predicate; `combineLoads` (`src/ops2/attention/attention.ts:60`) propagates `unauthorised` ahead of everything else, so a 401/403 on the summary renders the unauthorised state rather than a partial page.
- **`scripts/tests-verify/abuse.mjs` and `live-rows.mjs`** target `127.0.0.1:8788` with dev-mode OTP `devCode` and are test tooling only — excluded from findings, and they ship no credentials beyond the local seed identity.

One non-security observation, recorded only because it is adjacent to the code above and not worth a finding: `ATTENTION_FILTERS.find(...)!` in `selectProjects` and `emptyStateFor` uses a non-null assertion. It is safe today because `query.attention` can only be set from validated input, but it is a runtime throw if a future caller constructs a `QueueQuery` by hand. That is a robustness note for the reviewers who own correctness, not a vulnerability.