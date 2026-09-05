# Security Review — `feat/ops2-attention-prefilter` (diff vs `4a1acc69`)

**No HIGH or MEDIUM severity findings.**

## Scope reviewed

Feature diff is 11 files; the security-relevant surface is four source files, all client-side ops2 React/TypeScript:

- `src/ops2/projects/queue.ts` — new `AttentionKey`, `ATTENTION_FILTERS`, `attentionQuery`, `attentionFromSearch`, `selectProjects` predicate, `parseProjectQueue` fields
- `src/ops2/projects/ProjectsPage.tsx` — `?attn=` effect, `useIonViewWillEnter` reset, active-filter strip
- `src/ops2/attention/attention.ts` — `combineLoads`, `attentionGroups`, narrowed `parseSummary`
- `src/ops2/attention/AttentionPage.tsx` — two-source load
- `src/ops2/styles/projects.css`, `scripts/tests/api.test.mjs` (test-only)

No `worker/**`, no `migrations/**`, no auth or session code changed on this branch.

## What was checked and cleared

**Untrusted URL parameter (`?attn=`) — the only new external input.** `attentionFromSearch` (`src/ops2/projects/queue.ts:186`) reads the param through `URLSearchParams` and returns it only if it matches one of the four literal keys in `ATTENTION_FILTERS`; anything else becomes `null`. `ProjectsPage.tsx:88` sets `attentionQuery(key)` or `EMPTY_QUERY` — the raw string is never stored in state, never rendered, never echoed into an error message, and never reaches a DOM sink. The chip label drawn at `ProjectsPage.tsx:394` comes from the `ATTENTION_FILTERS` constant, not from the URL. No reflected or DOM XSS.

**Open redirect / `javascript:` href.** Attention row hrefs are built as `destination("projects").path + "?attn=" + filter.key` (`attention.ts:110`) from closed constants; no user-controlled component reaches a navigation target.

**Data exposure.** The Attention page's project counts now derive from `/api/ops/projects` (`AttentionPage.tsx:29`) instead of `/api/ops/summary`. That endpoint is already staff-gated — `ops.get("/projects")` returns 403 unless `resolveStaff` succeeds (`worker/routes/ops.ts:383`) — and the Attention page is itself behind the ops2 shell. No new endpoint, no widened response, no client-side-only authorization introduced. `combineLoads` (`attention.ts:64`) propagates `unauthorised` ahead of everything else, so a 401/403 renders the unauthorised state rather than a partially-populated page.

**New DTO fields.** `parseProjectQueue` now reads `statusCustomer` and `orderStage` (`queue.ts:505`). These are lifecycle state strings, not PII or financial detail, and the working-tree test in `api.test.mjs` that expects them on the DTO is currently red — the worker's `/projects` DTO does not yet emit them (`worker/routes/ops.ts:421-446` spreads only `lifecycleOf`'s output). When that field is added it stays inside the same staff-only response; no classification change.

**No injection surface.** No SQL, no shell, no template rendering, no deserialization, no `dangerouslySetInnerHTML`, no crypto, no secrets added by this diff.

## Non-security note (not a finding)

`selectProjects` (`queue.ts:650`) and `emptyStateFor` (`queue.ts:377`) use a non-null assertion on `ATTENTION_FILTERS.find(...)`. Sound today because `query.attention` can only be set from the validated key set, but it is a runtime throw rather than a degrade if a future caller widens that type. Robustness, not exploitability.