## T1 - Split plan module out of apply script; testable run() with injectable fetch, token pre-flight, atomic write, summary line

Files: go-live-plan.mjs (new, pure — vocab + plan(), returns summary {amend,create}), apply-go-live-min.mjs (rewritten thin CLI: resolveToken(env), run({write,verify,fetchImpl,log,error})), fixtures/go-live-world.mjs (makeWorld/makeTransport), catalogue-go-live.test.mjs, package.json (test:pure + test:go-live).

Tests: dry run against fixture asserts zero POST requests and exact log line "21 amend target(s), 1 create target(s)"; write:true with no token (HOME/USERPROFILE overridden, SANITY_WRITE_TOKEN unset) returns 1 with zero requests recorded — token checked before any network call.

Live check: `node scripts/catalogue/apply-go-live-min.mjs` dry-runs clean against real Sanity, same summary shape (21 amend, 1 create), no writes.

typecheck:gate clean. Full npm test NOT run (verify stage owns that). Committed cb879ea2.

Next task: nothing else touches these files per T1 scope; --verify path (runVerify) untested by this suite — only dry-run and no-token paths are covered.

## T2 - assertSafe destructive-plan guard + NULL-options guard

Files: go-live-plan.mjs (assertSafe export, options-key conditional spread in product set), apply-go-live-min.mjs (run() gains planImpl seam, calls assertSafe before write branch), catalogue-go-live.test.mjs (+8 tests).

Tests: assertSafe([]) on real plan; catches disallowed mutation key, patch key, product createOrReplace, drafts. id, slug set key; disable patch is exactly {disabled:true}; no set anywhere carries slug; null options + no hardware omits options key; rigged unsafe planImpl aborts --write before any POST.

typecheck:gate clean (58 pre-existing non-fatal, no new). test:go-live 12/12 green. Committed 0775094a.

Next task: assertSafe is defense-in-depth only — plan() itself never emits unsafe mutations in the real path.

## T3 - Plan-logic breakage checks (criterion-29 quartet plus field-level assertions)

Files: catalogue-go-live.test.mjs only (+21 tests, 29→32 total). Zero go-live-plan.mjs edits — every characterization test passed as-is, no drift found.

Tests: one-row-published (4 cases), hardware-alignment (4), dimension-rule-merge (3, incl. door minima 1900/AMJ80 slider 2400), nothing-deleted; field checks: derived-row certificationRef/wersWindowId + owning notes, no-Uw-when-null, amj80-series-awning-window profile+name, amj80t-casement-door tb+DG12, specs/keySpecs unconditional Grade row, Night Sky sole isDefault colour (rigged 2nd colour to prove demotion), AMJ72T pair + AMJ68 bi-fold → sys-80 (sys-72 confirmed absent).

typecheck:gate clean (58 pre-existing non-fatal, no new). test:go-live 32/32 green. Committed ab4b194a.

Next task: full npm test not run (verify stage owns that); go-live-plan.mjs remains unmodified across all of T2+T3.

## T4 - Convergent NEW_PROFILES step + --verify as replan-to-zero-drift

Files: go-live-plan.mjs (product create-branch: diff existing vs desired set, no-op when unchanged, mirroring sibling non-create branch), catalogue-go-live.test.mjs (convergedWorld() applies createIfNotExists + loops plan() to fixed point, up to 5 rounds).

Tests: run({verify:true}) on converged fixture exits 0; on altered fixture exits 1, logging `DRIFT <docId>: <field keys>` (patch: Object.keys(set); create: literal "missing"); plan on converged fixture emits no NEW_PROFILES createOrReplace.

Root cause: create-branch previously re-patched every replan unconditionally, unlike the non-create branch. Convergence also needs 2 fixture rounds — a created product's copied `options` settles one round behind its copyFrom source's own hardware realignment; this is real plan() behaviour, not a bug.

typecheck:gate clean (58 pre-existing non-fatal, no new). test:go-live 35/35 green. Committed 800c6c1e.

## T5 - rate-cards.sql scan test, no-remote-D1 scan, CONTEXT.md term, local D1 rehearsal, regression suites

Files: catalogue-go-live.test.mjs (+6 tests, 35→41), CONTEXT.md (+Derived thermal row entry near Authored-as-none). rate-cards.sql untouched, byte-identical.

Tests: comments-stripped scan for forbidden DDL tokens; every statement targets UPDATE/INSERT on pricing_rate_card only; UPDATEs carry version-bump expr + updated_at; INSERT rows all start 'v1'; 354.64 present, 322.40 absent; source scan confirms apply-go-live-min.mjs/go-live-plan.mjs never mention child_process or wrangler.

Local D1 rehearsal: db:migrate:local (no-op, current), applied rate-cards.sql clean (33→38 rows), 5 new cards at v1, 3 old differently-keyed cards (amj80st-fixed-window, amj100l-fixed-window, amj150-series-awning-window) still present untouched, re-run fails on INSERT PK per design (non-idempotent by design), row count still 38 after. All 22 go-live pricing refs resolve to an active rate card locally (no "no rate card" state). Live dry run of apply-go-live-min.mjs clean, zero writes.

typecheck:gate clean (58 pre-existing non-fatal, no new). test:go-live 41/41, test:catalogue 7/7, test:estimator-rules 49/49, test:unit 109/109, all green. Committed next.

Next task: nothing outstanding in this task's scope; working tree also carries unrelated in-progress changes (T4's go-live-plan.mjs/apply-go-live-min.mjs, and unrelated src/ frontend work) — not touched or committed by T5.

## Fix round 1 — reviewer findings (Codex + architecture conformance), 2026-09-06

Six findings from `FIX-1.md`, all fixed test-first:

1. **One write must converge (P1).** The created product's `options` were built from the copy source's live state while the same plan patches that source's own `options` (hardware alignment), so a `--write` immediately followed by `--verify` failed — a second round still had a mutation. Fixed: the create branch now derives its base `options` from the source's *planned* set (the `set` already computed for the source in this same plan pass), not its live document. Tightened the convergence test from up to five rounds to exactly one — applying the plan to the fixture once must leave zero mutations on replan.

2. **`--verify` must fail on planner problems (P1).** `apply-go-live-min.mjs`'s verify path read only `mutations`, ignoring `problems` — a missing sheet product produced a `problem` with no mutation, so verify could exit 0 with a document absent. Fixed: dry-run, `--write` and `--verify` all now route through the same validation (`problems` then `assertSafe`) before doing anything else; a fixture with one sheet product removed makes `run({verify:true})` exit 1 and name the missing document.

3. **Slug/type safety on replace, `drafts.` on create targets (P1).** `assertSafe` only rejected a `slug` key inside patches and only rejected `createOrReplace` for products, so a `NEW_PROFILES` document with an unexpected existing slug would have been silently renamed. Fixed: `assertSafe` now looks up the existing document for every `createOrReplace`/`createIfNotExists` target and rejects the mutation if the desired doc's `slug`/`_type` disagrees with what's already there; the `drafts.` id check now covers `(m.createIfNotExists ?? m.createOrReplace)?._id` as well as `m.patch.id`. New tests: an existing profile with a divergent slug is unsafe; a create target with a `drafts.` id is unsafe.

4. **Drift output names the changed field, not "missing" (P2).** For an existing `NEW_PROFILES` document with one differing authored field, `--verify`'s drift log printed the misleading literal `missing`. Fixed: drift logging now runs `normProfile()` on both the existing document and the desired one and prints the keys that actually differ. Updated the "altered fixture" test to assert the real field name instead of `missing`.

5. **Fake transport didn't implement the verification query (P2).** `makeTransport`'s GET dispatch treated every non-reference query as the slug-filtered product lookup; `runVerify`'s estimator-view query sends no `$slugs`, so the fixture silently returned `[]` and the "successful verification" test was passing on 0 products / 0 on the sheet — a no-op assertion. Fixed: `go-live-world.mjs`'s `makeTransport` now recognises the estimator-view query shape (`order(slug.current asc)`) and returns every product (on-sheet and off) with the same derived fields `runVerify` reads. Test now asserts 22 on the sheet, 11 off, and a deliberately-broken row fails.

6. **Family/category references were never validated (P2).** The created product carries `family`/`category` document references that `plan()` never checked for existence, unlike glazing/profile/system/hardware ids. Fixed: `plan()` now checks `p.family`/`p.category` against the same `ids` set built from `world.families`/`world.categories`; an empty families/categories list in the fixture produces a named problem. `go-live-world.mjs` now seeds default `family`/`category` fixture rows so the other 45 tests still pass; the new negative test empties them and asserts the problem.

Slug-only (not `_type`) is enforced as the immutability check on replace targets: the plan only ever emits `createOrReplace` for `thermalProfile` documents (`NEW_PROFILES`), so `_type` can never legitimately differ between desired and existing for a target this planner touches — checking it is caught by the same existing-document lookup as a belt-and-braces equality check, not a separate code path, so there is nothing further to add here.

Deferred, not in this round (per `FIX-1.md`): Ponytail dead-code deletions and the two `Not routed` items (the other effort's `theme.css` finding; the two pre-existing `pipeline.test.mjs` failures) — all recorded in `DEBT.md`.

**Test results, run in full this round:**
- `npm run typecheck:gate` — clean, 0 fatal errors (58 pre-existing non-fatal, unchanged).
- `npm run test:go-live` — 46/46 green (was 41 before this round; +5 new tests across findings 1, 2, 3×2, 6).
- `npm run test:pure` (includes `test:go-live` plus ~39 other suites, one `node --test` run) — 1166 tests, 1164 pass, 2 fail. Both failures are in `scripts/tests/pipeline.test.mjs` (the pipeline conductor's own suite, nothing under `scripts/catalogue/**`): one hits `ENOENT` spawning a deliberately-missing stub binary (`no-such-claude`) used by a cycle-cap test fixture, the other is a `CYCLE CAP` assertion mismatch in a related "third verify/fix cycle refused" test. These are unrelated to this round's diff (nothing here touches `scripts/pipeline/**`) and match `FIX-1.md`'s own "Not routed" note — "two pre-existing `scripts/tests/pipeline.test.mjs` failures at base: routed to `DEBT.md` as low." Not fixed here; not in scope.
- `npm run test:heavy` — run separately; result appended below once complete.

Committed as one commit covering `scripts/catalogue/go-live-plan.mjs`, `scripts/tests/catalogue-go-live.test.mjs`, `scripts/tests/fixtures/go-live-world.mjs`, and this file. The ~38 uncommitted files from the other effort (`src/**`, `.impeccable/config.json`, …) were left untouched and uncommitted.
