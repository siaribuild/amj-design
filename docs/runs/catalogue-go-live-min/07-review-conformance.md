<!-- Round 3 (final commit fc97a962). Relocated by the conductor session: plan mode refused the reviewer's write. Body verbatim from /c/Users/gedim_kwn20jy/.claude/plans/design-conformance-review-read-docs-runs-jaunty-llama.md -->
# 07-review-conformance — catalogue-go-live-min

Reviewed: `02-design.md`, `02-tasks.json`, `git diff --name-status d8f994aa...HEAD`. Structural review only.

## Verdict: CONFORMS

## Path reconciliation

Every file `02-tasks.json` names exists in the diff:

| Design/tasks path | Diff |
|---|---|
| `scripts/catalogue/go-live-plan.mjs` | A ✓ |
| `scripts/catalogue/apply-go-live-min.mjs` | A ✓ (draft was uncommitted at base, so A not M — expected) |
| `scripts/tests/catalogue-go-live.test.mjs` | A ✓ — the design-named test file exists (the pipeline's most-repeated failure did not repeat) |
| `scripts/tests/fixtures/go-live-world.mjs` | A ✓ — exports `makeWorld`, `makeTransport`, `altered` per §6 |
| `package.json` | M ✓ — new test in `test:pure` list (L17) and `test:go-live` script (L20), exactly as §2 |
| `CONTEXT.md` | M ✓ — "Derived thermal row" entry present (L94) per §8 |
| `docs/runs/catalogue-go-live-min/rate-cards.sql` | A — design said "no change / byte-identical"; the file was never committed before this feature, so git shows A. Content is enforced by the scan tests (present: L474–509 of the suite), which is the design's own mechanism. Not a divergence. |

## Absences checked (the thing a diff read misses)

- `assertSafe`, `normProfile`, `plan` with `summary` — all exported from `go-live-plan.mjs` (L635–639), matching the §3 interface list exactly.
- `resolveToken` + `run()` + `import.meta` main guard in `apply-go-live-min.mjs` (L29, L98, L154) — present.
- `chunk` helper — absent from the new CLI, as §4 required (single-transaction write).
- No `child_process`/`wrangler` in either script, and the source-scan test asserting it exists (test L512).
- Verify-as-replan (`DRIFT <docId>: <keys>`) — present (test L424–442).
- Nothing designed is missing.

## Scope check

Diff touches only `scripts/catalogue/**`, `scripts/tests/**`, `package.json`, `CONTEXT.md`, `docs/runs/catalogue-go-live-min/**`. Nothing under `worker/**`, `src/data/**`, `migrations/**` — criterion 37 and design §10 hold structurally. Unnamed additions are pipeline artifacts only (`00-ask.md` … `04-build.md`, `PLAN.md`) — expected, not app code.

## Deviation noted, accepted

`run()` takes an extra `planImpl = plan` injection parameter not in the §3 signature. It is used only by the test suite to inject broken plans for the criterion-27 and criterion-32 abort paths (test L208, L527) — a good-reason deviation serving the design's own test plan, not dead flexibility. Design doc §3 should gain the parameter; no code change required.

## Not re-reviewed here

Bug-level correctness of plan logic, fixture fidelity, and the live/D1 rehearsal outcomes — tester and Codex own those.
