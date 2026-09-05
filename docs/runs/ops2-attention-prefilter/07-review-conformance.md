## Conformance review — ops2-attention-prefilter

Verdict: **DOES NOT CONFORM — one blocking absence.** Premise correction first: I was called "once implementation passes testing", but `06-verify.md` records **FAIL** (F1, criteria 3/17 and the count criteria against a live worker). Not presenting this as post-green review.

### Finding 1 — HIGH, blocking: task t1 never built. Worker DTO fields absent, D1 approved and then not executed.

- Design clause violated: §0 ("Required: a two-field additive change to the row DTO"), §2 row 1, `02-tasks.json` t1, criterion 17 as amended by D1 (**answered A: YES** in DECISIONS.md — the block was lifted).
- Evidence, structural: `git diff 4a1acc69...HEAD` contains **no `worker/` path and no `scripts/tests/api.test.mjs`**. Git log in range starts at t2 (`55cdb95f`); no t1 commit exists anywhere. `worker/routes/ops.ts:421–447` DTO map still returns no `statusCustomer` / `orderStage`; the only grep hit is line 409 — the `lifecycleOf()` argument object, the exact expression DECISIONS.md D1 warned reviewers about.
- Consequence: design §0's own words — feature "does not meet criteria 1/2/4 end-to-end". `parseProjectQueue` defaults under-claim, so in production submissions / inReview / awaitingPayment count 0 forever; only readyToIssue (rides `issuable`) works. Test suites went green because every suite stubs the endpoint — the fixture supplies fields the real API never sends.
- Aggravator: `04-build.md:18` claims "t1's worker DTO change was already committed/merged before this task started". False — undocumented shortcut, worse, misdocumented one.
- Current tree: the t1 red test sits **uncommitted** in `scripts/tests/api.test.mjs` — red with no green, unattributable if anything else moves.
- Fix (already specified by verify F1, matches design exactly): add `statusCustomer: r.status_customer, orderStage: r.order_stage ?? null` to the returned object in `worker/routes/ops.ts` `/projects` map; commit with the api.test.mjs test; `git diff -- worker/` must show nothing else (criterion 17). `?? null` on `orderStage` is load-bearing (D1 grounds) — must survive.

### Finding 2 — LOW: unattributed working-tree changes

`src/ops2/styles/projects.css` and `src/ops2/projects/ProjectsPage.tsx` modified, uncommitted, not in the design's affected-files index. Presumably polish (§7 permits wording/styling refinement, not structure) — acceptable if that's their origin, but they must be committed and attributed before sign-off; right now the tree mixes polish, the orphan red test, and nothing that closes F1.

### Everything else conforms

- t2–t6 all landed at the designed seams: `queue.ts` carries `ATTENTION_FILTERS` / `attentionQuery` / `attentionFromSearch` / the selector pass; `chipFromSearch` deleted (zero references, per t4); `attention.ts` has `combineLoads` + `attentionGroups`; `AttentionPage` consumes both hooks through `combineLoads`; ProjectsPage consumes `?attn=`.
- Nothing built the design didn't name (`04-build.md` is a pipeline artifact, fine).
- Untouched-on-purpose list respected: `FilterSheet.tsx`, `rows.tsx`, `useProjectQueue.ts`, `useSummary.ts`, `worker/lib/*`, `/api/ops/summary`, `seed.sql` — all absent from the diff.
- Vocabulary recorded: `CONTEXT.md` updated, `docs/adr/0018-queue-attention-prefilter-own-axis.md` created.
- Logic placement: model logic in `queue.ts`/`attention.ts`, not smeared into components — conforms.

**Route to developer:** commit t1 (worker two-liner + api.test.mjs green), commit/attribute the polish files, re-run verify. No design change needed — the design already said all of this; it was skipped, not superseded.