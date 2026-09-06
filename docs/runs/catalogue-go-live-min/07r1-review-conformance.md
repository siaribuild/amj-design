<!-- Relocated by the conductor session: plan mode refused the reviewer's write to this path (regression of the 2026-09-02 fix). Body verbatim from /c/Users/gedim_kwn20jy/.claude/plans/design-conformance-review-read-docs-runs-unified-melody.md -->
# Design-conformance review — catalogue-go-live-min

Reviewed: `git diff --name-status d8f994aa...HEAD` against `02-design.md` and `02-tasks.json`.
Structural review; content opened only where the path list could not answer.

## Path reconciliation

Every file the design's §2 hand-off index names exists in the diff:

| Design §2 path | Diff | Note |
|---|---|---|
| `scripts/catalogue/apply-go-live-min.mjs` | A | Design said "rewritten"; A because the draft was never committed — expected. |
| `scripts/catalogue/go-live-plan.mjs` | A | ✓ |
| `scripts/tests/catalogue-go-live.test.mjs` | A | ✓ — the named test file was actually created (the pipeline's historical failure mode, avoided). |
| `scripts/tests/fixtures/go-live-world.mjs` | A | ✓ — exports `makeWorld`, `makeTransport`, `altered` per T4. |
| `package.json` | M | ✓ — file added to `test:pure` (line 17) and `test:go-live` script present (line 20). |
| `CONTEXT.md` | M | ✓ — "Derived thermal row" glossary entry present (line 94). |
| `docs/runs/catalogue-go-live-min/rate-cards.sql` | A | Design predicted "byte-identical in this feature's diff"; A = first commit of the pre-existing input. Conforms. |

Nothing built that the design never named: remaining A-paths are pipeline artifacts
(`00-ask.md`, `01-spec.md`, `02-design.md`, `02-tasks.json`, `04-build.md`, `PLAN.md`).
Nothing under `worker/**`, `src/**`, `migrations/**` — criterion 37 scope held.

## Seam checks (spot-opened)

- `go-live-plan.mjs` is pure as designed (§1): zero matches for `node:fs`, `child_process`,
  `wrangler`, `process.env`, `fetch`. Export surface at L596–600 matches design §3 exactly,
  including `normProfile` and `assertSafe`; `plan` returns `summary: { amend, create }` (L573).
- `apply-go-live-min.mjs` exports `resolveToken(env)` (L29) and `run({write, verify, fetchImpl,
  log, error})` (L99) with the `import.meta.url === pathToFileURL(...)` main guard (L141) — §3.
- Convergence + verify (§5): `loadWorld` fetches `fullProfiles` (L68), plan consumes it
  (go-live-plan.mjs L469), `DRIFT <id>: <keys>` / `missing` output (L110–111), fixture `altered()`
  helper and the criterion-28 both-directions test present.

## Findings

1. **`assertSafe` skips create targets for the `drafts.` rule — design §4.**
   `scripts/catalogue/go-live-plan.mjs:580-593` checks `drafts.` only on `m.patch.id`; the design
   rule is "no target `_id`/`id` starting `drafts.`", which covers `createIfNotExists` /
   `createOrReplace` `_id` too. Defence-in-depth is the stated point of this function, so the
   allow-list should match the design as written. Small fix: extend the check to
   `(m.createIfNotExists ?? m.createOrReplace)?._id`.

## Accepted deviations (design doc considered updated by this note)

- `run()` takes an undocumented `planImpl = plan` parameter (`apply-go-live-min.mjs:99`). Not in
  §3, but it is what lets the tests drive the problems-exit-1 and write-abort paths without
  contorting the fixture — a live test seam, not dead flexibility. Keep.
- `fullProfiles` GROQ projection is `{_id, name, slug, frameTechnology, rows}` rather than §5's
  fully-enumerated row projection. Bare `rows` is a superset of the named fields and
  `normProfile` owns comparability; simpler and conformant in effect. Keep.

## Verdict

**Finding 1 to the developer; otherwise CONFORMS.** Sequencing (T1–T5), one-place-per-fact for
verify, atomic single-transaction write, and the §9 security posture (token never in fixtures,
fake transport, no remote-D1 code path) are all where the design put them.
