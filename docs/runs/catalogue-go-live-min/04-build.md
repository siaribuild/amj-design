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
