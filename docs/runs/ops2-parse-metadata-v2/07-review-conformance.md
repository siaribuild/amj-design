# Design-conformance review — ops2-parse-metadata-v2

**Verdict: CONFORMS**, with one trivial cleanup and four documented deviations (all for good reason — design doc notes below, no rework demanded).

## Structural check

Every file design + 02-tasks.json named exists in diff:

- New: `src/data/lineMeta.ts`, `worker/lib/drawing/meta.ts`, `src/ops2/projects/useLineMeta.ts`, `src/ops2/projects/MetaTab.tsx`, `scripts/tests/meta-api.test.mjs`, `scripts/tests/ops2-meta.test.mjs` — all present.
- Changed: `worker/routes/ops.ts`, `src/ops2/projects/lineRoute.ts`, `src/ops2/projects/LinePage.tsx`, `scripts/tests/ops2-navigation.test.mjs`, `package.json`, `CONTEXT.md` (Metadata tab term landed after Crop evidence, as designed) — all present.
- **Nothing named was left uncreated.** Both new test files exist AND are wired: `test:pure` += ops2-meta, `test:heavy` += meta-api, `test:ops2` += ops2-meta, `test:meta` created. This run does not repeat the named-but-never-created failure.
- No migration ✓. No `OpsPage` change ✓. Routes verified thin: both meta routes are ladder + one lib call + response shaping; entry SELECT, latest-run query, allow-list all in `worker/lib/drawing/meta.ts`. Crop key never in response; audit row carries externalRef not key. Placement directly after rationale route as specified.
- Mid-run redesign (richer run report) properly governed by `02-design-addendum.md` — seams unchanged, grill decisions + approved mock cited. Correct process, no undocumented drift.

## Finding (trivial)

1. **`package.json`: `test:meta` key defined twice** (scripts block ~line 17 and ~line 42, identical value). Design/T1 said one new script. Duplicate JSON key — last wins, harmless today, but delete one. File: `package.json:42`.

## Deviations accepted — design doc updated by these notes, not forced back

2. **`scripts/tests/web/ops2-line-meta.spec.ts`** — E2E suite design never named. Documented in 04-build.md (8/8 green), auto-discovered by `test:web`. Extra coverage on an auth-gated surface; keep.
3. **`src/ops2/styles/line.css` +13** — design said "no CSS change" (that clause was about the chips CSS in `projects.css`). One `.lp-crop` class is the minimum for AC-9's phone overflow; well-commented. Good reason.
4. **`lineCropKey` returns `{cropKey, externalRef}` not `string | null`** — design's own crop route spec needs `externalRef` for the audit action string; §3.2's narrower signature was self-inconsistent. Implementation is right; treat §3.2 as amended.
5. **`scripts/tests/helpers.mjs` +9** — `wranglerLocalAuthEnv` shim for wrangler 4.111 account validation, documented in 04-build.md. Test infrastructure, not feature surface.

Out of scope: `docs/runs/ai-parse-monitoring/*` + its mock in the diff range are a separate run's docs-only commit (d894fb25) sharing the branch — not this feature's work, not reviewed here.