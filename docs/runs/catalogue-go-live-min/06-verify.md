# Verify — catalogue-go-live-min (round 3, 2026-09-06)

Independent verification after fix round 2. Nothing in `04-build.md` was taken on trust: every
criterion below was re-established from the spec text and re-executed in this session. Live
Sanity was read only (dry runs and GROQ probes, never written); D1 was rehearsed on a **copy** of
the local miniflare database; remote D1 was never touched.

**Verdict: PASS** — 37 / 37 acceptance criteria met. No new findings. One pre-existing failure
pair outside this feature's diff remains deferred to the run's debt file (low).

Depth: light, as instructed — gates plus a walk of the acceptance criteria. Guards were not
mutation-tested and no cosmetics are raised.

**UI coverage:** none required. The diff changes no file under `src/` (see criterion 37), so the
"UI change cannot pass without Playwright coverage in `scripts/tests/web/`" rule does not engage.
Stated explicitly rather than omitted silently.

Diff boundary used throughout: `git diff --name-only d8f994aa..HEAD` — 13 files:
`CONTEXT.md`; `docs/runs/catalogue-go-live-min/` `00-ask.md`, `01-spec.md`, `02-design.md`,
`04-build.md`, `PLAN.md`, `02-tasks.json`, `rate-cards.sql`; `package.json`;
`scripts/catalogue/apply-go-live-min.mjs`; `scripts/catalogue/go-live-plan.mjs`;
`scripts/tests/catalogue-go-live.test.mjs`; `scripts/tests/fixtures/go-live-world.mjs`.

---

## 1. Gates

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck:gate` | exit 0 — `✓ no fatal type errors (58 non-fatal remain)` |
| Owning suite | `npm run test:go-live` | 52 tests, 52 pass, 0 fail |
| Catalogue | `npm run test:catalogue` | 7 tests, 7 pass, 0 fail |
| Estimator rules | `npm run test:estimator-rules` | 49 tests, 49 pass, 0 fail |
| Unit (GST arithmetic) | `npm run test:unit` | 109 tests, 109 pass, 0 fail |
| Pure battery | `npm run test:pure` | 1172 tests, 1170 pass, **2 fail** — both in `scripts/tests/pipeline.test.mjs`, pre-existing at base, not in this diff (Finding 1) |
| Heavy battery | `npm run test:heavy` (run alone) | 321 tests, 321 pass, 0 fail, exit 0 |
| Live dry run | `node scripts/catalogue/apply-go-live-min.mjs` | `21 amend target(s), 1 create target(s)` / `dry run — re-run with --write to apply.` / exit 0, zero problems |
| Live plan probe (fetch refuses non-GET) | `node $TEMP/probe-golive.mjs` | exit 0, **POSTs sent: 0**, 47 mutations planned, 0 problems |
| D1 rehearsal (copy of the local D1) | `node $TEMP/d1check.mjs` | 33 rows before, 38 after; all C21–C23 / C25 assertions pass |

---

## 2. Acceptance criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Dry run prints 21 amend + 1 create (`amj150st-awning-window`), exit 0, zero problems | PASS | `node scripts/catalogue/apply-go-live-min.mjs` printed `21 amend target(s), 1 create target(s)`, exit 0. The one `createIfNotExists` in the captured plan is `product-amj150st-awning-window`. |
| 2 | No mutation is a delete; no code path removes a document | PASS | Captured live plan (47 mutations): kinds are only `patch`, `createIfNotExists`, `createOrReplace`. `assertSafe` rejects deletes and unset-all; no delete mutation is constructed anywhere in either script. |
| 3 | Off-sheet product set `disabled: true`, nothing else changed | PASS | Every off-sheet patch in the captured plan has `set` keys exactly `disabled`, value `true`; count matches the non-sheet published products. |
| 4 | Disabled product still resolves and prices on existing order lines | PASS | Disabling is a Sanity field only; the diff changes no line or pricing code (`git diff --name-only d8f994aa..HEAD -- worker src/data` gives no output). `npm run test:heavy` 321/321 exercises line resolution and pricing. |
| 5 | Disabled product not served publicly, absent from listings | PASS | Pre-existing `disabled` behaviour, unchanged by this diff (0 files under `src/` or `worker/`). `npm run test:catalogue` 7/7 and `npm run test:estimator-rules` 49/49 green. |
| 6 | Estimator / parse candidates exclude disabled, include the 22 | PASS | Post-plan projection of the captured plan onto the live documents: all 22 sheet products clear `catalogueCandidateOfferability`; every off-sheet product carries `disabled: true` (criterion 3). |
| 7 | Both bars pass for the 22, still evaluated separately | PASS | Configuration bar scored against the real gate (`worker/lib/estimator/catalogue.ts:322` — `operation_types`, `dimension_rule`, quotable variant): `node $TEMP/c7b.mjs $TEMP/golive-plan.json` printed `PASS C7a — all 22 sheet products clear catalogueCandidateOfferability`. Pricing bar scored separately against the rehearsed D1: all 22 pricing refs name an `active = 1` card. The bars stay separate in code — `pricingRef` is deliberately absent from `catalogueCandidateOfferability`, and readiness (`variantIsFullyDescribed`) remains the stricter bar over offerability (`variantIsQuotable`). |
| 8 | `NULL` glazing never rewritten as `[]` | PASS | Scan of every `set` in the captured plan for a zero-length array: none. Products with live `options: null` receive no `options` key at all. Suite covers the null-options case. |
| 9 | Exactly one published glazing row per go-live profile; others unpublished, not deleted | PASS | 6 profile documents in the plan; each has exactly one row with `published !== false`, the rest present with `published: false`, row count preserved. |
| 10 | The published row carries Uw and SHGC | PASS | Same scan: every published row has non-null `uValue` and `shgc`. |
| 11 | Derived rows state derivation, carry no WERS id, product `notes` repeats it | PASS | All five derived rows carry a `certificationRef` naming the source (louvre 6 mm clear Uw 6.2 / SHGC 0.70; AMJ150 stacker from AMJ-003-011; the two AMJ100T hung windows 5/9/5 Uw 3.8 / SHGC 0.47 from AMJ-054-008) and no `wersWindowId`. Matching product patches set `notes` repeating the derivation. |
| 12 | No Uw figure in prose where the row is derived | PASS | Regex scan over `descriptionParagraphs` in the derived products' patches: no Uw / U-value figure. Suite asserts the same. |
| 13 | `amj80st-awning-window`: WERS AMJ80T thermally-broken awning frame, name "AMJ80ST Awning Window", `amj80-awning` untouched | PASS | Its patch sets the imported WERS profile ref and the name; no mutation in the plan targets the `amj80-awning` profile document. |
| 14 | `amj80t-casement-door` stays AMJ80T / thermally broken, `standardGlass` the sheet's 5/12/5 clear | PASS | Patch sets the 5/12/5 clear standard glass; `frameSystem` and frame technology are not among its `set` keys, so both carry through unchanged. |
| 15 | Column E becomes a key spec named "Grade"; no new schema field | PASS | Each sheet product's patch carries a `keySpecs` entry named `Grade` with the row's value (Residential / Semi-commercial / Commercial). The diff touches no Sanity schema file. |
| 16 | Column H hardware becomes standard; prior standard hardware still offered | PASS | Executed per product (`node $TEMP/c16.mjs`): for every sheet product with a column-H value, the post-plan option list contains the new standard hardware and every hardware option present beforehand — only the `availability` flag moves. No option is removed anywhere in the plan. |
| 17 | Night Sky the single default colour; every other colour still offered | PASS | Option-document patches set `isDefault: true` on Night Sky and `false` on the other colours; no colour option is removed or unpublished. |
| 18 | AMJ72T products + AMJ68 bi-fold on `sys-80`; `sys-72` untouched | PASS | Executed (`node $TEMP/c18.mjs`): `frameSystem` set to `sys-80` on the AMJ72T pair and the AMJ68 bi-fold; no `frameSystem` document is mutated by the plan, and `sys-72` is still live in Sanity. |
| 19 | Door minimum height 1900 mm, AMJ80 slider maximum 2400 mm, other bounds merged not replaced | PASS | Each named door's `dimensionRule` in the plan carries `minHeightMm: 1900` plus its pre-existing width/height bounds re-emitted unchanged; the AMJ80 sliding door additionally carries `maxHeightMm: 2400`. Suite covers merge-not-replace. |
| 20 | Row 4 resolves to `amj80-series-awning-window`; no slug is ever changed | PASS | The plan patches `product-amj80-series-awning-window` for that row. No `set` in the plan contains a `slug` key; `assertSafe` rejects one, with a dedicated suite test. |
| 21 | `area_rate` = column J exactly (354.64, never 322.40), `perim_rate` 0, `min_charge` 0, keyed by pricing ref | PASS | `rate-cards.sql` scanned and applied to the D1 copy: every touched card carries the sheet's inclusive figure verbatim (354.64 present; 322.40 absent from both the file and the resulting rows), `perim_rate = 0`, `min_charge = 0`, `id` = the product's pricing ref. |
| 22 | The four missing cards + AMJ150ST exist afterwards; old cards survive; nothing deleted | PASS | D1 rehearsal: 33 rows before, 38 after; the 5 new ids present; every pre-existing row still present; no DELETE statement in the file. |
| 23 | Version bumped the way `nextVersion` does; `updated_at` set; new cards start `v1`; no audit row | PASS | Post-rehearsal rows match the expected bump for all 17 updates, including the `v1-provisional` to `v2` case; the SQL's version expression reproduces `nextVersion` in `worker/lib/pricing-admin.ts`. `updated_at` non-null on every updated row; the 5 inserted rows are `v1`. No `pricing_change` table exists (dropped by `0042_drop_pricing_change.sql`) and the SQL writes no audit row. |
| 24 | ex / inc GST display arithmetic unchanged | PASS | Regression only: `npm run test:unit` 109/109 including the `src/data/gst.ts` cases. Catalogue rates stay GST-inclusive; nothing in this diff divides by 1.1. |
| 25 | Every one of the 22 prices after the rehearsal (no "no rate card") | PASS | All 22 pricing refs resolve to an `active = 1` card in the rehearsed D1 — checked by id, not by count. |
| 26 | No `--write` means reads only; tests assert zero mutation requests | PASS | `node $TEMP/probe-golive.mjs` injects a `fetchImpl` that throws on any non-GET: exit 0, 0 POSTs, 47 mutations planned. The suite asserts the same through `run({ fetchImpl })`. |
| 27 | A validation problem exits non-zero and names the document | PASS | The suite drives `plan()` with fixtures for each problem class (missing sibling source, unresolvable slug, a profile that would end with zero or two published rows); `run()` returns 1 and the message names the offending document. |
| 28 | `--verify` after a write reports pass; a deliberately altered fixture fails and names document + field | PASS | Executed against fixtures, not the live dataset (spec §4): four `run({ verify: true })` suite cases cover clean-verify pass, a drifted field (named in the `DRIFT <id>: <field>` line), a missing profile document, and a sheet-membership mismatch. |
| 29 | Breaking the plan in four ways each fails at least one check | PASS | The suite mutates the fixture world for hardware alignment, one-row-published, dimension-rule merge and nothing-deleted; each produces a failing assertion. 52/52 green with the logic intact. |
| 30 | No Sanity write under any dry-run flag combination | PASS | POST-refusing `fetchImpl` across the no-flag and `--verify` paths: 0 POSTs in both. `mutate()` is called from exactly one place, behind the `if (!write) return 0` guard at `apply-go-live-min.mjs:145-149`. |
| 31 | `--write` with no usable token exits non-zero before the first mutation; dataset unchanged | PASS | Executed for real with an isolated `HOME` (no `~/.config/sanity/config.json`) and no `SANITY_WRITE_TOKEN`: exit 1, 0 POSTs, message `no Sanity write token: set SANITY_WRITE_TOKEN or log in with the Sanity CLI (~/.config/sanity/config.json)`. The check precedes `loadWorld` and every mutation, so a partial application is unreachable. |
| 32 | A plan containing a delete, product unpublish, or slug change aborts before sending | PASS | Executed for real against `assertSafe` with a forged plan: document delete, slug `set`, `drafts.` id, product `createOrReplace` and unset-all are each rejected; a legitimate patch is allowed. `run()` returns 1 on any violation before `mutate()` (`apply-go-live-min.mjs:138-143`). |
| 33 | `rate-cards.sql` has no DELETE, DROP, ALTER or table rebuild | PASS | File scan: 17 UPDATE statements plus one five-row INSERT, on `pricing_rate_card` only; none of DELETE / DROP / ALTER / CREATE TABLE / PRAGMA present. Five suite tests enforce this. |
| 34 | No code path attempts a remote D1 write | PASS | Executed: search of both scripts for `child_process`, `wrangler`, `--remote` and `d1 execute` matches only inside comments (the owner's copy-paste command). Suite asserts neither script mentions `child_process` or `wrangler` in executable code. The SQL stays a file the owner runs. |
| 35 | Manufacturer / Customer requesting a disabled product get the unknown-product response | PASS | Pre-existing access behaviour; this diff changes no route or data module (`git diff --name-only d8f994aa..HEAD -- worker src` gives no output). Covered by the green heavy battery, 321/321, which exercises the ops-vs-customer boundary. |
| 36 | The other effort's uncommitted files are untouched | PASS | `comm -12` of the sorted feature-diff file list against the sorted working-tree changed-file list produced an empty result. The working-tree entries are unchanged; nothing from them is staged or committed. |
| 37 | No change under `worker/**`, `src/data/**`, `migrations/**`, no Sanity schema change | PASS | `git diff --name-only d8f994aa..HEAD -- worker src/data migrations sanity` gives no output. |

---

## 3. Findings

**Finding 1 — low — `npm run test:pure` has 2 pre-existing failures in
`scripts/tests/pipeline.test.mjs`.**

Reproduce:

```
npm run test:pure
# 1172 tests, 1170 pass, 2 fail — both in scripts/tests/pipeline.test.mjs

git diff --name-only d8f994aa..HEAD -- scripts/pipeline scripts/tests/pipeline.test.mjs
# (no output — this feature touches neither file)
```

Not caused by this feature and not fixable inside its blast radius: the failures are in the
pipeline conductor's own tests, which this diff does not touch. Recorded here only so the run's
green-suite claim is honest about what is red. Route to the run's debt file rather than to a
developer session.

---

## 4. Not findings, recorded so a later round does not re-derive them

- `assertSafe` does not itself require `ifRevisionID`; `plan()` enforces it, and every mutation
  in the captured live plan carries one. Two suite tests cover both halves. Criterion 32 names
  delete / unpublish / slug only, so this is a note about where the guard lives, not a gap in it.
- A product patch never contains `pricingRef` because all 21 live products already have
  `pricingRef` equal to their slug, and only changed keys enter a patch
  (`go-live-plan.mjs:563`, `:579`). Its absence is correctness, not omission.
- An earlier round's criterion-7 script reported a configuration-bar failure. That was the
  script's invented bar (a non-empty options list plus a resolvable family operation), not the
  product's: the real gate requires neither an options list nor a `pricingRef`, and the one
  product whose family cannot resolve before the write is the create target. Re-scored against
  `catalogueCandidateOfferability`, all 22 pass.
