# Security Review — `feat/ops2-attention-filters-in-panel`

**Scope reviewed:** `main...HEAD` (9 commits, merge-base `9567992e4`). The 21 MB diff handed to this stage is the full history against that merge-base; the actual branch change is 23 files, of which 4 are source: `src/ops2/projects/queue.ts`, `src/ops2/projects/ProjectsPage.tsx`, `src/ops2/attention/attention.ts`, `src/ops2/styles/projects.css`. The rest are docs (`CONTEXT.md`, ADRs 0019/0020, run artifacts) and tests (`scripts/tests/ops2-*.test.mjs`, `scripts/tests/web/ops2-projects.spec.ts`).

**Method note:** this stage runs under a pipeline rule that forbids dispatching subagents, so the identify/filter/verify passes were performed in-session rather than as parallel sub-tasks. Every source hunk in the branch diff was read in full; the false-positive criteria were applied to each candidate.

## Findings

**No HIGH or MEDIUM security findings. Nothing cleared the 0.8 confidence bar.**

## What was examined and why it is clear

**No server-side surface changed.** The branch touches no file under `worker/`, no `migrations/`, no route, no auth or session code. There is no new endpoint, no new query, no new data reaching the backend — so no SQL injection, authorization, or trust-boundary surface is introduced.

**The only untrusted input is `?attn=<key>`, and it is validated against a closed set.** `attentionFromSearch` (`src/ops2/projects/queue.ts:190`) reads the query parameter and returns it only if it matches one of the four literal keys in `ATTENTION_ARRIVALS`; anything else returns `null`, and `ProjectsPage.tsx:104` maps that to `EMPTY_QUERY`. The value is never interpolated into markup, a URL, a network call, or a storage key — it selects a predicate from a hardcoded table. `arrivalQuery` (`queue.ts:179`) uses a non-null assertion on the `find`, but it is only ever called with an already-validated key (both call sites — `ProjectsPage.tsx:104` and `attention.ts:100`, the latter iterating `ATTENTION_ARRIVALS` itself), so no attacker-reachable crash path exists there. This is the same validation shape the deleted code used; the refactor preserved it.

**Filtering here is presentation, not an access control.** `selectProjects` narrows rows the server already returned for the authenticated staff session. The change adds four refinement predicates (`statusCustomer === "submitted"`, `=== "under_review"`, `r.issuable`, `orderStage === "deposit_invoiced" || "balance_invoiced"`) and deletes the parallel `attention` axis. Removing a client-side filter cannot widen what the client is authorized to hold — the row set delivered to the browser is identical before and after. Per the standing rule that client-side permission logic is not a security boundary, the deletion of `QueueQuery.attention` and its `selectProjects` filter is not a security regression.

**No unsafe rendering.** The active-filter strip now renders `activeRefinements.join(" + ")` inside a React text node (`ProjectsPage.tsx:412`), and those labels come from the hardcoded `REFINEMENTS` table, not from user or server data. No `dangerouslySetInnerHTML`, no `innerHTML`, no template evaluation anywhere in the diff.

**No data-exposure change.** No new logging, no new fields read off the API body, no PII newly rendered. `parseProjectQueue` is unchanged apart from two comments. The CSS change is layout only (`:has(ion-list)` footer pinning, removal of the `.pq-flag[data-tone="brand"]` rule).

**Untracked, not part of the branch:** `.playwright-mcp/` and `docs/mocks/ops2-attention-filters-in-panel.html` are uncommitted working-tree artifacts. The mock is a static design document with no credentials or live endpoints; neither is in the reviewed diff.