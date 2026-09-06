<!-- Round 2 (after fix round 1, commit f87458af). Relocated by the conductor session: plan mode refused the reviewer's write to this path. Body verbatim from /c/Users/gedim_kwn20jy/.claude/plans/review-the-branch-diff-floating-pine.md -->
# Context

`/ponytail-review` was asked to review the `feat/catalogue-go-live-min` branch diff against `d8f994aa` and write the findings to `docs/runs/catalogue-go-live-min/07-review-ponytail.md`.

Plan mode is active for this session, so the only file I am permitted to write is this plan file. The review itself is finished — the full report is below, verbatim, ready to be copied to the target path. This is the same failure mode recorded in the `pipeline-reviewers-never-wrote-reports` memory: the reviewer's report must not be silently skipped because the harness forbade the write.

**Scope reviewed:** the committed range `d8f994aa...HEAD` — `scripts/catalogue/go-live-plan.mjs`, `scripts/catalogue/apply-go-live-min.mjs`, `scripts/tests/catalogue-go-live.test.mjs`, `scripts/tests/fixtures/go-live-world.mjs`, `package.json`, `CONTEXT.md`, and the `docs/runs/catalogue-go-live-min/` artifacts. The uncommitted `src/**` + `theme.css` changes in the working tree are the unrelated design-language port and were excluded.

# Action

Write the block below to `docs/runs/catalogue-go-live-min/07-review-ponytail.md`, then reply with only that path.

---

# Ponytail review — catalogue-go-live-min

Diff reviewed: `d8f994aa...HEAD`. Over-engineering only; correctness, security and performance are out of scope for this pass and were not assessed.

## scripts/catalogue/go-live-plan.mjs

- `L433: delete: const stable — dead, zero references, and the expression is a no-op (JSON.stringify(v, cond ? undefined : undefined)). Nothing replaces it.`
- `L612-616: delete: NEW_GLAZINGS, buildSeo and rekey are exported with no importer anywhere. Drop the three names from the export list (0 lines, smaller surface).`
- `L107-108: yagni: const P = []; const add = (p) => P.push(p) wraps an array literal. const P = [{...}, ...] over the 22 entries; delete add.`
- `L374 + L400: yagni: specRow() has one caller while buildKeySpecs re-inlines the identical object shape with a different key prefix. specRow(prefix, i, label, value) used by both.`
- `L376: shrink: isDG = (glass) => /\+/.test(glass) — a regex to look for one literal character. glass.includes("+").`
- `L505-510: yagni: plannedOptionsBySlug precomputes aligned options for all 21 non-create products to serve one copyFrom lookup at L514. Compute it inside the create branch for p.copyFrom only.`
- `L546-548: shrink: world.products.has(p.slug) / world.products.get(p.slug) re-fetch what existing (L512) already holds. if (existing) { ... existing ... }.`

`assertSafe()` (L593-610) is redundant with `plan()` in the sense that a correct `plan()` can never trip it — but it guards a production write path and CLAUDE.md rules security measures out of the lazy pass. Keep. `planImpl` injection in `run()` (apply-go-live-min.mjs L99) likewise earns its keep: the "unsafe plan aborts before any POST" test exercises a mutation shape no fixture world can produce.

## scripts/catalogue/apply-go-live-min.mjs

Lean already.

## scripts/tests/catalogue-go-live.test.mjs

- `L100-105: delete: "no set anywhere in the plan carries a slug key" is covered twice over by "assertSafe: catches a slug set key" (L52) plus "the real plan has no violations" (L43).`
- `L244-250: delete: "no mutation in the full plan carries a delete key" — same pair covers it (L48 + L43).`
- `L238-242: delete: "P data: door minima are 1900" restates the P literals it reads. It fails only when someone deliberately edits the table, which is the intended way to change it.`
- `L292-296: delete: "amj80t-casement-door is thermally broken with 5+12+5 glass" — same, restates two fields of one P entry.`
- `L301-306: delete: "specs and keySpecs both carry a Grade entry" asserts an unconditional line of buildSpecs/buildKeySpecs.`
- `L282-287: shrink: keep only the for (const entry of P) assert.ok(!entry.profile.includes("amj80-awning")) invariant; drop the two field equals above it.`
- `L324-329: shrink: same shape — keep the assert.notEqual(p.system, "sys-72") loop, drop the three-slug equality loop.`
- `L121-141: shrink: the zero-match and two-match tests differ only by fixture. One test, two fixtures in a loop.`
- `L118-320 (comments): delete: the "Characterization test: plan() line 467 …" headers cite line numbers that are already wrong (467 is now 490, "colour default logic line 534-538" is 580-585). Keep the one-sentence claim, drop the line citations — a stale pointer is worse than none.`

The genuine data invariants stay: `field: no Uw claim in paragraphs when uw is null` (L273) and `field: derived rows carry DERIVED certificationRef` (L256) hold across the whole table rather than restating one row, and the `rate-cards.sql` + `child_process`/`wrangler` source scans (L426-471) are the T5 safety net.

## scripts/tests/fixtures/go-live-world.mjs, rate-cards.sql, package.json, CONTEXT.md

Lean already. `rate-cards.sql` is repetitive by nature — it is data, and each row must be independently readable in a `wrangler d1 execute` batch.

net: -70 lines possible.
