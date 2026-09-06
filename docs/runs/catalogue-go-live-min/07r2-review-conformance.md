<!-- Round 2 (after fix round 1, commit f87458af). Relocated by the conductor session: plan mode refused the reviewer's write to this path. Body verbatim from /c/Users/gedim_kwn20jy/.claude/plans/design-conformance-review-read-docs-runs-crystalline-pebble.md -->
# Design-conformance review — catalogue-go-live-min

Reviewed: `git diff --name-status d8f994aa...HEAD` against `02-design.md` + `02-tasks.json`.
Structure-only pass (bug hunting owned by tester/Codex).

## Verdict: CONFORMS

## Path reconciliation

Every path the design/tasks named exists in the diff:

| Design §2 path | Diff status |
|---|---|
| `scripts/catalogue/go-live-plan.mjs` | A ✓ |
| `scripts/catalogue/apply-go-live-min.mjs` | A ✓ (design said "rewritten" — the 656-line draft was never committed, so Added is the correct git status) |
| `scripts/tests/catalogue-go-live.test.mjs` | A ✓ (the design-named test file exists — the pipeline's most-repeated failure did not repeat) |
| `scripts/tests/fixtures/go-live-world.mjs` | A ✓ |
| `package.json` | M ✓ — new test in `test:pure` list (L17) and `test:go-live` script (L20), both as design §2 specified |
| `CONTEXT.md` | M ✓ — "Derived thermal row" glossary entry present (L94) |
| `docs/runs/catalogue-go-live-min/rate-cards.sql` | A — design said "no change / byte-identical"; A not M because the baseline commit predates the file being tracked. Content conformance is enforced structurally by the criterion-33 scan test the design mandated. Not a divergence. |

**Nothing named was left uncreated. Nothing was built the design never named** — the only
paths outside the design's list are pipeline artifacts (`docs/runs/.../00-ask.md`, `01-spec.md`,
`02-design.md`, `02-tasks.json`, `04-build.md`, `PLAN.md`), which are conductor output, not
application code.

Scope claim (design L7-9) holds: nothing under `worker/**`, `src/data/**`, `migrations/**`
(criterion 37 ✓).

## Interface conformance

`go-live-plan.mjs` export list (L612-616) matches design §3 exactly: constants
(`NEW_GLAZINGS, NEW_PROFILES, KEEP_PUBLISHED, P, DISABLE, DEFAULT_COLOUR, HW`), builders
(`buildSpecs, buildKeySpecs, buildSeo, buildDimensionRule, alignHardware, rekey, same,
normProfile`), `plan`, `assertSafe`. `apply-go-live-min.mjs` exports `resolveToken(env)` (L29)
and `run({write, verify, fetchImpl, log, error})` (L99) per §3.

## Deviation — accepted, no fix required

- **`run()` gained a `planImpl = plan` parameter** (apply-go-live-min.mjs:99), not in the design
  §3 signature. Used only by tests (catalogue-go-live.test.mjs:160, 479) to inject a broken plan
  and prove the problems-exit-1 and assertSafe-abort paths — behaviours the design's own test
  plan requires but which the fixture cannot produce (the fixture must plan clean by design).
  Good reason; smaller than an extra fixture variant. Design §3 should note it; recorded here
  in lieu (review ran read-only against the design doc).

## Findings requiring developer action

None.
