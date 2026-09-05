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
