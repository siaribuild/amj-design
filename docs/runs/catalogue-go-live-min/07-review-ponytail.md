<!-- Round 3 (final commit fc97a962). Relocated by the conductor session: plan mode refused the reviewer's write. Body verbatim from /c/Users/gedim_kwn20jy/.claude/plans/review-the-branch-diff-spicy-dolphin.md -->
# Context

`/ponytail-review` was asked to review the `feat/catalogue-go-live-min` branch diff against `d8f994aa` and write the findings to `docs/runs/catalogue-go-live-min/07-review-ponytail.md`.

Plan mode is active in this session, so the only file this session may write is this plan file. The review itself is complete — the full report is below, verbatim, ready to be copied to the target path. This is the same harness failure recorded in the `pipeline-reviewers-never-wrote-reports` memory, and it has now recurred on all three review rounds of this feature. It is being reported, not silently skipped.

**Round.** This is review round 3, over `HEAD = fc97a962` (fix round 2). The existing `07-review-ponytail.md` holds the round-2 report and `07r1-review-ponytail.md` the round-1 report; writing this to `07-review-ponytail.md` as instructed will overwrite the round-2 record. If that history matters, copy round 2 to `07r2-review-ponytail.md` first.

**Scope reviewed:** the committed range `d8f994aa...HEAD` — `scripts/catalogue/go-live-plan.mjs`, `scripts/catalogue/apply-go-live-min.mjs`, `scripts/tests/catalogue-go-live.test.mjs`, `scripts/tests/fixtures/go-live-world.mjs`, `package.json`, `CONTEXT.md`, and the `docs/runs/catalogue-go-live-min/` artifacts. The uncommitted `src/**` + `theme.css` working-tree changes are the unrelated design-language port and were excluded.

**Fixed since round 2:** `const stable` (dead, no-op) is gone. The `families`/`categories` GROQ selections flagged in round 1 are now genuinely load-bearing — `plan()` L527 checks the create product's `family`/`category` refs against them, with a test. Not re-reported.

# Action

Write the block below the `---` to `docs/runs/catalogue-go-live-min/07-review-ponytail.md`, then reply with only that path.

---

# Ponytail review — catalogue-go-live-min (round 3, `d8f994aa...fc97a962`)

Over-engineering only. Correctness, security and performance are out of scope for this pass and were not assessed. `assertSafe()`, the `rate-cards.sql` scans and the `child_process`/`wrangler` source scans are explicitly-requested safety layers on a production write path — out of scope for deletion, and kept.

## scripts/catalogue/go-live-plan.mjs

- `L362-367: delete: DISABLE is no longer read by plan() — step 5 disables by complement of the sheet, and the "withdrawn set is the complement" test proves it. Only the test fixture reads it now. Move the 11 slugs into scripts/tests/fixtures/go-live-world.mjs. −6 lines from the production module.`
- `L114 (and 21 more): delete: the p3: "flyscreen" | "sliding" | "none" field on every P entry is never read — paragraph 3 is either hand-written or inlines OPTIONS_P3.x directly, and grep finds no p.p3 anywhere. Delete the field from all 22 entries; keep OPTIONS_P3.`
- `L636-637: delete: NEW_GLAZINGS, buildSeo and rekey are exported with no importer (apply-go-live-min.mjs, the test and the fixture are the only importers). Drop the three names from the export list.`
- `L108-109: yagni: const P = []; const add = (p) => P.push(p) wraps an array literal. const P = [{...}, ...] over the 22 entries; delete add. −2 lines.`
- `L550-578: shrink: the p.create branch re-implements the changed/withRev/patch diff already written at L579-588, only against existingCreated. After the identity-collision guard, fall through to the shared path: if (!existing && p.create) { mutations.push({createIfNotExists: doc}); create++; continue; }. −14 lines.`
- `L557-558: shrink: world.products.has(p.slug) / .get(p.slug) re-fetch what existing (L522) already holds. Use existing. (Subsumed by the previous finding.)`
- `L515-520: yagni: plannedOptionsBySlug precomputes aligned options for all 21 non-create products to serve one copyFrom lookup at L524. Compute alignHardware(source.options, sourceEntry.hardware) inside the create branch for p.copyFrom only. −5 lines.`
- `L375 + L401: yagni: specRow() has one caller while buildKeySpecs re-inlines the identical object shape with a different key prefix. One specRow(prefix, i, label, value) serves both.`
- `L376: shrink: isDG = (glass) => /\+/.test(glass) — a regex to find one literal character. glass.includes("+").`
- `L69-70: yagni: LOUVRE_ROW/HUNG_ROW are zero-argument thunks invoked only during literal construction (L76-81). const LOUVRE_ROW = derived(...) and drop the four call parens — the rows are read-only.`

## scripts/catalogue/apply-go-live-min.mjs

- `L55: delete: mutate() returns txt and the only caller (L149) discards it. txt is still needed for the error message at L54; drop the return.`
- `L29: yagni: resolveToken(env = process.env) — both call sites (L99, test L29) pass nothing, and the file-path branch ignores env entirely. Drop the parameter.`
- `L66-67: shrink: "profiles" and "fullProfiles" are two selections over the same _type=="thermalProfile". One {_id, _rev, name, slug, frameTechnology, rows} selection serves both Maps. Requires one adjustment: step 3's row match compares r.glazing to a string, so it becomes r.glazing?._ref ?? r.glazing (normProfile already does exactly this). −5 lines, larger payload.`

## scripts/tests/catalogue-go-live.test.mjs

The unit tests over `alignHardware`, `buildDimensionRule`, `withRev`, the one-row-published branches, the `run()` exit paths, `assertSafe` and the two `--verify` drift tests are the real coverage and stay. The findings below are restatement of the data file back at itself, or a plan-level duplicate of a unit test.

- `L148-153: delete: "no set anywhere in the plan carries a slug key" is covered twice over by "assertSafe: catches a slug set key" (L52) plus "the real plan has no violations" (L43). −6 lines.`
- `L295-298: delete: "no mutation in the full plan carries a delete key" — same pair covers it (L48 + L43). −4 lines.`
- `L286-290: delete: "P data: door minima are 1900" reads literals out of P and asserts they equal those literals. It can only fail when the sheet is deliberately edited, which is the intended way to change it. −5 lines.`
- `L340-344: delete: "amj80t-casement-door is thermally broken with 5+12+5 glass" — same shape, two fields of one P entry read back from the file that defines them. −5 lines.`
- `L349-354: delete: "specs and keySpecs both carry a Grade entry" asserts two unconditional array entries (L382, L399). Neither sits behind a condition. −6 lines.`
- `L169-189: shrink: the zero-match and two-match tests differ only by fixture. One test, two fixtures in a loop. −10 lines.`
- `L330-335: shrink: keep the for (const entry of P) assert.ok(!entry.profile.includes("amj80-awning")) invariant — that one guards a real trap. The name/profile equality assertions above it are literal restatement. −2 lines.`
- `L372-377: shrink: keep the assert.notEqual(p.system, "sys-72") loop; drop the three-slug equality loop above it. −3 lines.`
- `L166-369 (comments): delete: the "Characterization test: plan() line 467 …" headers cite line numbers that are now wrong — 467 is 498, "colour default logic line 534-538" is 601-608, "alignHardware line 426" is 428, "buildDimensionRule line 412" is 413. Keep the one-sentence claim, drop every line citation; a stale pointer is worse than none.`

Kept as genuine data invariants: `field: no Uw claim in paragraphs when uw is null` and `field: derived rows carry DERIVED certificationRef` — both hold across the whole table rather than restating one row, and the second is the only thing keeping `p.uw` alive.

## scripts/tests/fixtures/go-live-world.mjs

- `L60-63: yagni: altered(world, docId, field, value) is a 4-parameter generic with one call site (test L437). Inline the one-field spread into that test. −4 lines.`

## rate-cards.sql, package.json, CONTEXT.md

Lean already. `rate-cards.sql` is repetitive by nature — it is data, and each statement must be independently readable in a `wrangler d1 execute` batch.

net: -80 lines possible.
