# Fix round 1 — findings routed to the developer (2026-09-06)

READ BUDGET — this session runs under a 120k autocompact window and the previous attempt
thrashed on reading. Read ONLY: this file; `scripts/catalogue/apply-go-live-min.mjs` (127
lines, whole); `scripts/tests/fixtures/go-live-world.mjs` (whole); and
`scripts/catalogue/go-live-plan.mjs` and `scripts/tests/catalogue-go-live.test.mjs` IN SLICES
— Grep for the function or test name first, then Read with offset/limit around it; never the
whole file (the plan module is 45 KB of sheet data, the test file is 30 KB). Do NOT open any
`07-review-*.md`, `01-spec.md`, `02-design.md` or `08-accept.md` — everything needed is below.

Work test-first; every item names the check that must go red before the change and green
after. Do not touch any file outside `scripts/catalogue/**`,
`scripts/tests/catalogue-go-live.test.mjs`, `scripts/tests/fixtures/go-live-world.mjs` and
`docs/runs/catalogue-go-live-min/04-build.md`. The ~38 uncommitted files from the other effort
(`src/**`, `.impeccable/config.json`, …) stay untouched and uncommitted. Commit the finished
work (feature files only) as one commit; append a short "Fix round 1" section to 04-build.md.

## P1 — one write must converge (Codex P1, architecture P1)

`go-live-plan.mjs` builds the created product (`amj150st-awning-window`) from the copy
source's CURRENT `options`, while the same plan patches that source's options (column-H
hardware alignment). After one `--write`, a replan still emits an `options` patch for the new
product, so `--write` immediately followed by `--verify` fails — criterion 28 broken.

Fix: derive the created product from the source's PLANNED state (the `set` the plan is about
to write for the source), not its live state. Then tighten the convergence test: applying the
plan to the fixture ONCE and replanning must yield zero mutations (the current test tolerates
up to five rounds — reduce it to one; the build note's "two rounds" is the defect, not the
contract).

## P1 — `--verify` must fail on planner problems (Codex P1, architecture P1)

`apply-go-live-min.mjs` verify path reads only `mutations` from the plan result. A missing
sheet product or withdrawal target yields a `problem` and possibly no mutation, and
`runVerify` only inspects documents that exist — so verify can exit 0 with a product missing.

Fix: route dry-run, write and verify through ONE validation of the plan result (problems +
`assertSafe`); any problem is a verify failure that names the document. Test: a fixture with
one sheet product removed → `run({verify:true})` exits 1 and names it.

## P1 — replacements must not change an existing document's slug (Codex P1) + `drafts.` on create targets (conformance Finding 1)

`assertSafe` rejects a slug key only inside patches and rejects `createOrReplace` only for
products. When an existing `NEW_PROFILES` document has an unexpected slug, the plan's
`createOrReplace` carries the desired slug and would rename it — criteria 20 and 32.

Fix: in `assertSafe` (or the planner, wherever the existing document is in hand), a
`createOrReplace` whose target exists must keep that document's current slug and `_type`, or
the plan is unsafe; and the `drafts.` rule must cover `(m.createIfNotExists ??
m.createOrReplace)?._id`, not only `m.patch.id`. Tests: an existing profile with a different
slug → unsafe/problem; a create target with a `drafts.` id → unsafe.

## P2 — drift output names the changed fields for a replacement (Codex P2)

For an existing new-profile document whose authored field differs, verify prints
`DRIFT <id>: missing`. Criterion 28 requires the document AND the field. Compare
`normProfile(existing)` with the desired profile and print the differing keys. The altered
fixture currently asserts the misleading `missing` — change the assertion to the field name.

## P2 — the fake transport must implement the verification query (architecture P2)

`makeTransport` treats every GET other than the reference query as the slug-filtered product
query; `runVerify` sends no `$slugs`, so the fake returns `[]` and the "successful
verification" test passes on `0 products, 0 on the sheet`. Implement the estimator-view query
in the fixture (all products, on-sheet and off-sheet) and assert the expected counts (22 on
the sheet, 11 off) plus one deliberately bad row failing.

## P2 — the planner validates family and category references (architecture P2)

The created document carries `family` and `category` references that are never checked
(`ids` is built from families/categories but only glazing, profile, system and hardware ids
are looked up). Check them the same way; the fixture's empty family/category lists must then
produce a named problem unless the fixture supplies them.

## Ponytail findings — NOT in this round

Deferred to `DEBT.md` (low) on the acceptance's recommendation: the deletions touch the same
functions the fixes above rewrite, and this is one-shot go-live tooling. Delete dead code only
where a fix above already has the line open; do not go looking for it.

## Not routed

- Codex P2 on `src/styles/theme.css` (cyclic `--shadow-*` declarations): that file is the
  OTHER effort's uncommitted work, outside this feature's diff — reported to the owner
  separately.
- Verify Finding 1 (two pre-existing `scripts/tests/pipeline.test.mjs` failures at base):
  routed to `DEBT.md` as low.
