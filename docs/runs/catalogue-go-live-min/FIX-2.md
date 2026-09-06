# Fix round 2 — round-2 review findings routed to the developer (2026-09-06)

READ BUDGET — this session runs under a 120k autocompact window; an earlier session
thrashed on reading. Read ONLY: this file; `scripts/catalogue/apply-go-live-min.mjs` (whole,
~150 lines); `scripts/tests/fixtures/go-live-world.mjs` (whole); and
`scripts/catalogue/go-live-plan.mjs` and `scripts/tests/catalogue-go-live.test.mjs` IN SLICES
— Grep for the function or test name, then Read with offset/limit around it; never the whole
file. Do NOT open any `07-review-*.md`, `01-spec.md`, `02-design.md`, `06-verify.md` or
`08-accept.md` — everything needed is below.

Test-first. Files allowed: `scripts/catalogue/**`, `scripts/tests/catalogue-go-live.test.mjs`,
`scripts/tests/fixtures/go-live-world.mjs`, `docs/runs/catalogue-go-live-min/04-build.md`. The
~38 uncommitted files from the other effort (`src/**`, `.impeccable/config.json`, …) stay
untouched and uncommitted. Commit the finished work (feature files only) as ONE commit before
the session ends — do not wait on background suites; run `npm run test:go-live` and
`npm run typecheck:gate` and commit. Append a short "Fix round 2" section to 04-build.md.

## 1. Every sheet product is re-enabled (Codex P1)

The product patch never writes `disabled`. A sheet product that is already disabled would
stay hidden from the site and the estimator after `--write`. Fix: every sheet product's `set`
carries `disabled: false` (the created product already does). Test: a fixture sheet product
with `disabled: true` → its patch set has `disabled: false`.

## 2. The withdrawn set is the complement of the sheet, not a hard-coded list (Codex P2)

`loadWorld` fetches only `P` slugs plus the hard-coded `DISABLE` list, so an off-sheet product
the list does not name is never disabled. Fix: `loadWorld` fetches every product (still
excluding `drafts.`), and the planner disables every product whose slug is not in `P`. Keep
`DISABLE` only as an expectation to assert against in a test (the 11 known slugs must all be
in the computed complement), or delete it. Test: a fixture product with a slug on neither list
→ it is disabled by the plan.

## 3. Comparison must ignore key order (Codex P2, architecture Medium)

`same()` is `JSON.stringify` equality, so `{_type, _ref}` versus `{_ref, _type}` from Sanity
reads as a difference: spurious patches on replan, and `--verify` fails after a correct write.
Fix: use `node:util`'s `isDeepStrictEqual` (or a recursive key-sorted canonicalisation) for
`same()` and anywhere else authored values are compared; delete the dead `stable` constant
while the line is open. Test: an existing document whose nested object has reversed key order
produces no patch.

## 4. Patches carry a revision precondition (architecture High)

`loadWorld` reads mutable documents, then `mutate` submits patches with no `_rev` check, so a
Studio edit between read and write is silently overwritten. Fix: project `_rev` in every
product/profile/option read and send each patch as `{ patch: { id, ifRevisionID: rev, set } }`
(Sanity's field is `ifRevisionID`). A stale revision then fails the whole transaction (409)
and nothing is written. `assertSafe`'s patch-shape allow-list must admit the new key. Test: a
patch for a fetched document carries its `_rev`; a document with no `_rev` in the world is a
named problem, not a patch without the precondition.

## 5. A create target that exists under a different `_id` is a problem (architecture Medium)

When the created product's slug already exists, the planner patches the assumed
`product-<slug>` id rather than the fetched document's `_id`. Fix: if a document with that slug
exists and its `_id` is not the assumed one, emit a named problem (identity collision) and no
mutation; otherwise patch `existing._id`. Test: fixture product with slug
`amj150st-awning-window` and `_id` `xyz` → problem, no mutation.

## Not routed here (recorded in DEBT.md / the runbook)

- Architecture High "verification can self-certify a wrong planner" (tests inspecting `P`
  rather than plan outcomes): the tester's round-2 evidence is mutation-based for the
  criteria that matter (frame system, hardware, profiles); the broader test restructuring is
  DEBT. Do not spend this session on it.
- Architecture High "run the existing pricing reconciler after both writes": an operator
  step (ops → Pricing → Reconcile after the Sanity write and the D1 apply), added to the
  runbook, not to this script.
- Ponytail round 2 (~70 lines): DEBT, as before.
- Codex P2 on `src/styles/theme.css`: the other effort's uncommitted work.
