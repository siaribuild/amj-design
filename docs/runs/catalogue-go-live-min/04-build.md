## T1 - Split plan module out of apply script; testable run() with injectable fetch, token pre-flight, atomic write, summary line

Files: go-live-plan.mjs (new, pure — vocab + plan(), returns summary {amend,create}), apply-go-live-min.mjs (rewritten thin CLI: resolveToken(env), run({write,verify,fetchImpl,log,error})), fixtures/go-live-world.mjs (makeWorld/makeTransport), catalogue-go-live.test.mjs, package.json (test:pure + test:go-live).

Tests: dry run against fixture asserts zero POST requests and exact log line "21 amend target(s), 1 create target(s)"; write:true with no token (HOME/USERPROFILE overridden, SANITY_WRITE_TOKEN unset) returns 1 with zero requests recorded — token checked before any network call.

Live check: `node scripts/catalogue/apply-go-live-min.mjs` dry-runs clean against real Sanity, same summary shape (21 amend, 1 create), no writes.

typecheck:gate clean. Full npm test NOT run (verify stage owns that). Committed cb879ea2.

Next task: nothing else touches these files per T1 scope; --verify path (runVerify) untested by this suite — only dry-run and no-token paths are covered.
