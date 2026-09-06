<!-- Relocated by the conductor session: plan mode refused the reviewer's write to this path (regression of the 2026-09-02 fix). Body verbatim from /c/Users/gedim_kwn20jy/.claude/plans/review-the-branch-diff-splendid-bentley.md -->
# ponytail-review — catalogue-go-live-min

## Context

The `ponytail-review` stage of the `catalogue-go-live-min` pipeline run asked for
an over-engineering review of `git diff d8f994aa..HEAD`, written to
`docs/runs/catalogue-go-live-min/07-review-ponytail.md`.

The review is complete. The write to that path was **refused by plan mode** — the
harness only permits edits to this plan file. This is the exact failure recorded in
the "Pipeline reviewers never wrote reports" memory: plan mode forbids the write,
the report never lands, and the feature ends up gated by Codex alone. It is not
being skipped silently; the full findings are below, ready to be copied to
`docs/runs/catalogue-go-live-min/07-review-ponytail.md` the moment plan mode is
exited.

Scope note: over-engineering only. Correctness and security belong to the other
reviewers. `assertSafe()` and the rate-cards.sql scans are explicitly-requested
safety layers on a money/production path and are out of scope for deletion.

## Findings

### scripts/catalogue/go-live-plan.mjs

- `L433: delete: stable() is dead — never called, and both arms of its ternary are literally undefined. Nothing replaces it.`
- `L525-547: shrink: the p.create branch re-fetches existing as existingCreated and re-implements the diff/patch already written at L548-556. Replace with "if (p.create && !existing) { mutations.push({createIfNotExists: doc}); create++; continue; }" and fall through to the shared path. −14 lines.`
- `L432: yagni: rekey(arr, prefix) has one caller with one prefix value ("opt", L520). Inline the template as opt${i}.`
- `L596-600: delete: NEW_GLAZINGS, buildSeo, rekey, same, normProfile are exported but no importer uses them (only apply-go-live-min.mjs, the test and the fixture import this module). Keep them module-private.`
- `L68-69: yagni: LOUVRE_ROW/HUNG_ROW are zero-argument thunks invoked only during literal construction (L75-80). const LOUVRE_ROW = derived(...) and drop the four call parens — the rows are read-only.`
- `L452: delete: world.families and world.categories are folded into ids but nothing ever looks up a family or category id — the only ids checks are glazing (L471) and profile/system/hardware (L503). Drop both from the spread.`

### scripts/catalogue/apply-go-live-min.mjs

- `L63-66: delete: the "families" and "categories" GROQ selections feed only the dead ids entries above; the names actually used come from the product query's familyName/categoryName joins (L62, consumed at plan L507). Drop both lines.`
- `L67-68: shrink: "profiles" and "fullProfiles" are two queries over the same _type=="thermalProfile". One selection of {_id, name, slug, frameTechnology, rows} serves both Maps in plan().`
- `L56: delete: mutate() returns txt and the only caller (L136) discards it. txt is still needed for the error message; just drop the return.`

### scripts/tests/catalogue-go-live.test.mjs

The unit tests over `alignHardware`, `buildDimensionRule`, the one-row-published
branches, `run()` exit paths and `assertSafe` are the real coverage and stay. The
rest restate the data file back at itself, or duplicate a unit test at plan level.

- `L75-80: delete: "no set anywhere carries a slug key" — assertSafe already refuses a slug set (L52-54) and L43-45 asserts the real plan has zero violations. That pair covers it.`
- `L222-225: delete: "no mutation carries a delete key" — same pair (L48-50 + L43-45) already covers it.`
- `L213-217: delete: "P data: door minima are 1900" reads literals out of P and asserts they equal those literals. It can only fail when the sheet deliberately changes, and then the test is edited to match.`
- `L267-271: delete: same shape — tb:true and the DG12 constant read back from the file that defines them.`
- `L276-281: delete: asserts two unconditional array entries (L381/L398) exist. Neither is behind a condition.`
- `L299-304: shrink: keep the "never sys-72" invariant loop; the first loop restates three P literals. −4 lines.`
- `L257-262: shrink: keep the "amj80-awning" absence loop (that one guards a real trap); the name/profile equality assertions are literal restatement. −3 lines.`

### scripts/tests/fixtures/go-live-world.mjs

- `L55-58: yagni: altered(world, docId, field, value) is a 4-parameter generic with one call site (test L359). Inline the one-field spread into that test.`

net: -61 lines possible.

## Next step

Exit plan mode, then write the section above (minus this Context/Next-step
framing) to `docs/runs/catalogue-go-live-min/07-review-ponytail.md`.
