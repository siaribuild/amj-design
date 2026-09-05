# Spec — catalogue go-live minimum

Stage 0 grill: run, conclusions in `00-ask.md` (owner, 2026-09-06) and treated as decided.
Owner answers on the spec's two open questions folded in 2026-09-06 (Q1 GST basis, Q2
assumptions + two criterion corrections); no open questions remain.
Inputs, not outputs: `PLAN.md`, `scripts/catalogue/apply-go-live-min.mjs`, `rate-cards.sql`.

---

## 1. Problem and the actor it serves

The live Sanity catalogue is half-authored. Some products can be configured but not priced,
some carry a window's dimension rule on a door, several thermal profiles publish multiple
glazing rows so the estimator can pick a glass AMJ does not supply as standard, and product
copy reads like a catalogue entry rather than something a builder can act on. The owner has
settled the go-live set: 22 products in `AMJ_min.xlsx`.

In each actor's own terms (carried from the grill's actors-and-needs section, verbatim):

- **Customer / Visitor** — a product page and a quote only ever show a product that can be
  made and priced today; the copy talks to a builder about the job, not to a catalogue
  reader; sizes, glass and ratings on the page are true.
- **Staff** — the estimator proposes sheet products only; every withdrawn product stays
  reachable in ops for legacy orders; prices are the sheet's figures with the same audit
  trail the Pricing screen writes; a derived thermal figure is labelled so nobody mistakes
  it for a WERS rating.
- **Estimator (subsystem)** — one published glazing row per go-live profile; every sheet
  product offerable: family operation, dimension rule, a published row with Uw + SHGC, and
  a pricing ref that names a real rate card.
- **Manufacturer partner** — not served by this change.

What this feature delivers is **tooling plus verification**, not a production write: a plan
that is provably correct against live data, a test that fails if the plan logic breaks, a
`--verify` read-back, and a D1 SQL file rehearsed locally. The production `--write` and the
remote D1 apply happen after review, on the owner's go.

---

## 2. Acceptance criteria

Given–When–Then. "the plan" = the mutation set the script produces from the sheet + live
Sanity; "the tests" = the node:test check(s) this feature adds under `scripts/tests/`.

### Set membership and non-destruction

1. **Given** the 22 sheet rows and the live catalogue, **When** the script runs a dry run,
   **Then** it prints exactly 21 amend targets and 1 create target
   (`amj150st-awning-window`), and exits 0 with zero problems.
2. **Given** the plan, **When** the tests inspect every mutation, **Then** no mutation is a
   document delete and no document is removed from Sanity by any code path in the script.
3. **Given** a catalogue product not on the sheet, **When** the plan is built, **Then** that
   product is set `disabled: true` and no other field on it changes.
4. **Given** a disabled product with existing order lines, **When** Staff open that line in
   ops, **Then** the line still resolves and prices as before (disabling withdraws it from
   selection, never from history).
5. **Given** a disabled product, **When** a Visitor requests its public product page,
   **Then** it is not served (the existing `disabled` behaviour), and it does not appear in
   any public product listing.
6. **Given** a disabled product, **When** the estimator / schedule parse builds candidates,
   **Then** that product is not among them; **and** the 22 sheet products are.

### Offerability

7. **Given** each of the 22 products after the plan is applied, **When** the offerability
   gate evaluates it, **Then** both bars pass — configuration completeness (family
   operation, dimension rule, options) and pricing completeness (a pricing ref naming an
   existing rate card) — with the two bars still evaluated separately, never merged.
8. **Given** a product whose glazing list is `NULL` (not-yet-authored), **When** the plan
   touches that product, **Then** it does not write `[]` in place of `NULL` unless the sheet
   authors an actual empty decision; the two facts stay distinct.

### Thermal profiles and derived data

9. **Given** a go-live thermal profile, **When** the plan is applied, **Then** exactly one
   glazing row is published — the sheet's column-G standard glass — and every other row on
   that profile is unpublished, not deleted.
10. **Given** the published row of a go-live profile, **When** the tests read it, **Then** it
    carries both a Uw and a SHGC value.
11. **Given** a derived row (louvre single-glazed 6 mm clear Uw 6.2 / SHGC 0.70; AMJ150
    stacker 5/12/5 from AMJ-003-011; the two AMJ100T hung windows' 5/9/5 Uw 3.8 / SHGC 0.47
    from AMJ-054-008), **When** the tests read it, **Then** `certificationRef` states it is
    derived and names its source, **and** the row carries no WERS certificate id, **and**
    the product's ops-only `notes` repeats the derivation.
12. **Given** a product whose published row is derived, **When** the tests read its
    description, **Then** no Uw figure appears in the prose (a Uw is quoted only where the
    row is WERS-rated).
13. **Given** `amj80st-awning-window` (Q3), **When** the plan is applied, **Then** its
    profile is the imported WERS "AMJ80T Thermally Broken Awning Window" frame, its name is
    "AMJ80ST Awning Window", and the pre-existing `amj80-awning` profile is untouched.
14. **Given** `amj80t-casement-door` (Q4), **When** the plan is applied, **Then** it remains
    AMJ80T / thermally broken and its `standardGlass` is the sheet's 5/12/5 clear.

### Product fields

15. **Given** a sheet row's column E, **When** the plan is applied, **Then** the product
    carries a key spec named "Grade" with that row's value (Residential / Semi-commercial /
    Commercial) and no new schema field is introduced.
16. **Given** a sheet row's column H, **When** the plan is applied, **Then** that hardware is
    the product's standard option **and** the previously standard hardware is still offered
    as an option (nothing is removed from the option list).
17. **Given** the colour options, **When** the plan is applied, **Then** Night Sky is the
    single default colour and every other colour remains offered.
18. **Given** Q1/Q6, **When** the plan is applied, **Then** AMJ72T products and the AMJ68
    bi-fold carry `frameSystem: sys-80`, and the `sys-72` document still exists untouched.
19. **Given** Q9, **When** the plan is applied, **Then** the door products named in the grill
    (AMJ80, AMJ100L, AMJ100T, AMJ150 sliding doors; AMJ68 bi-fold) have minimum height
    1900 mm, the AMJ80 sliding door has maximum height 2400 mm, and every other dimension
    bound on those products is carried through unchanged (merge, not replace).
20. **Given** row 4's `amj80-awning-window` (Q2), **When** the plan resolves it, **Then** it
    targets `amj80-series-awning-window`; **and** no mutation anywhere in the plan changes an
    existing document's slug.

### Prices and versioning (money surface)

Owner ruling 2026-09-06: column J is the **public-facing, GST-inclusive** sale price
(manufacturer ex-GST figure × 1.3 uplift × 1.1 GST). Catalogue rates are stored
GST-inclusive — `src/data/gst.ts` divides by 1.1 only to *display* ex-GST. Nothing in this
feature divides by 1.1.

21. **Given** a sheet row's column J, **When** the rate-card SQL is generated, **Then**
    `area_rate` is that figure exactly as typed (e.g. 354.64, never 322.40), `perim_rate`
    is 0, `min_charge` is 0, and the card is keyed by the product's pricing ref.
22. **Given** the four missing rate cards (AMJ72T awning, AMJ72T fixed, AMJ80 fixed, AMJ100L
    fixed) plus AMJ150ST, **When** the SQL is applied to a local D1, **Then** those cards
    exist afterwards, the old differently keyed cards still exist, and no rate-card row is
    deleted.
23. **Given** an existing rate card being updated, **When** the SQL is applied, **Then** its
    `version` is bumped the way `nextVersion` does (`v1` → `v2`, `v1-provisional` → `v2`,
    `v3` → `v4`) and `updated_at` is set; **and given** a new rate card, **When** it is
    inserted, **Then** its `version` starts at `v1`. There is no audit table and no audit row
    — `pricing_change` was dropped by migration `0042_drop_pricing_change.sql`.
24. **Given** the applied local D1 and an account with GST mode `ex`, and the same account
    switched to `inc`, **When** a price for a go-live product is displayed, **Then** the inc
    figure is the stored inclusive rate's total and the ex figure is that ÷ 1.1, both
    produced by the existing `src/data/gst.ts` — a regression check on display arithmetic
    this feature does not touch.
25. **Given** a go-live product after the local rehearsal, **When** it is priced, **Then** a
    price is produced (no "no rate card" state for any of the 22).

### Tooling behaviour

26. **Given** the script with no `--write`, **When** it runs against live Sanity, **Then** it
    issues read requests only and the tests assert zero mutation requests were sent.
27. **Given** a validation problem in the plan (missing sibling source, unresolvable slug,
    a profile that would end with zero or two published rows), **When** the dry run finishes,
    **Then** it exits non-zero and names the offending document.
28. **Given** a completed `--write`, **When** `--verify` runs, **Then** it re-reads every
    touched document and reports pass; **and** given one value deliberately altered in a
    fixture, `--verify` fails and names the document and field.
29. **Given** the plan logic is broken in any of four ways — hardware alignment, one-row-
    published, dimension-rule merge, nothing-deleted — **When** the test suite runs, **Then**
    at least one check fails for each of the four.

### Abuse / safety criteria (executed for real by the tester)

30. **Given** the script run without `--write`, **When** a mutation would be required,
    **Then** it is printed and not sent; no Sanity write occurs under any dry-run flag
    combination.
31. **Given** `--write` and no usable Sanity write token from whichever source the script
    reads (the local Sanity CLI config `~/.config/sanity/config.json`, as
    `scripts/catalogue/import-wers.mjs` does, or an env var if the developer keeps one),
    **When** the script runs, **Then** it exits non-zero with a clear message before the
    first mutation and leaves the dataset unchanged (no partial application).
32. **Given** a plan that contains any document delete, unpublish-of-a-product, or slug
    change, **When** `--write` starts, **Then** the script aborts before sending anything.
33. **Given** `rate-cards.sql`, **When** the tests scan it, **Then** it contains no `DELETE`,
    `DROP`, `ALTER`, or table-rebuild statement — inserts and updates on rate cards only.
34. **Given** the remote D1 is unreachable from an agent session, **When** the feature
    completes, **Then** no code path in this feature attempts a remote D1 write; the SQL
    stays a file the owner runs.
35. **Given** a Manufacturer partner or a Customer session, **When** they request a disabled
    product's page or its catalogue record, **Then** they receive the same not-available
    response as for an unknown product — no field of a withdrawn product leaks.
36. **Given** the ~38 uncommitted files from another effort in the working tree, **When**
    this feature's commit is made, **Then** none of them is modified, staged or committed;
    `git status` shows them still untracked/modified exactly as before.
37. **Given** the house guardrails, **When** this feature's diff is reviewed, **Then** it
    contains no change under `worker/**`, `src/data/**`, `migrations/**`, and no Sanity
    schema change.

---

## 3. Out of scope

- Writing to production Sanity or remote D1. The pipeline builds and verifies; the owner
  runs the write.
- Deleting anything: unpublished glazing rows, orphan profiles, orphan rate cards, the 11
  off-sheet products, the unused `sys-72`, the conventional `amj80-awning` profile.
- Renaming or merging slugs, and merging the two pricing-ref fields into one.
- Any Sanity schema change, and any change to the offerability gate, pricing engine, GST
  arithmetic, estimator selection or parse code.
- Re-introducing a pricing audit table.
- Products beyond the 22 sheet rows — no copy rewrite, no field derivation, no rate card for
  them.
- Manufacturer-partner surfaces.
- Pricing the delivery zones (a separate, known gap).

---

## 4. Assumptions

Owner-approved 2026-09-06 (Q2, "accept as written"):

- Disabling an off-sheet product does not touch quotes or orders that already use it:
  existing lines keep their product, price and edit behaviour in ops; only *new* selection
  (public site, parse, estimator) is closed.
- Descriptions are rewritten for the 22 sheet products only; off-sheet products' copy is left
  as-is (they are unreachable publicly anyway).
- "Nothing is deleted" includes unpublishing being reversible — unpublished glazing rows keep
  their content, so a later owner decision can republish one without re-authoring it.
- The tester's Sanity access is read-only for this feature; every write-path criterion
  (28, 31, 32) is executed against a fixture/mock transport, not the live dataset.
- Criterion 24's GST check is a regression check on existing behaviour, not new work.

No `ASSUMED:` items remain open: the GST basis (Q1) is now an owner ruling, recorded in
§2 "Prices and versioning".
