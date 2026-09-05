# catalogue-go-live-min

Bring the live Sanity catalogue to the go-live minimum in
`D:\OneDrive\Documents\Business\Open Frame\Products\AMJ_min.xlsx` (22 rows, owner,
2026-09-06): amend the 21 listed products that exist, create the one that does not
(AMJ150ST Awning Window), make **only** those 22 selectable by the automated parse
(schedule parse / estimator), derive every missing fact from the nearest sibling
product and say so where it is derived, rewrite each listed product's description
in the approved builder-facing pattern, and load the sheet's prices into the D1
rate cards. Nothing is deleted.

Column meanings (owner): A window system = context; B model; C frame system
(Sanity `frameSystem`); D thermally broken (profile `frameTechnology`); E industry
(no field — becomes a "Grade" key spec); F design = family; G standard glass (the
product's `standardGlass` and the ONE published row of its thermal profile);
J price + GST per m² of frame + glazing (D1, not Sanity); L product slug = pricing
ref (two fields, one value until they are merged); M/N existing-or-new + copy
source; O thermal profile; P/Q existing-or-new + copy source for the profile.

## Actors and needs

- **Customer / Visitor** — a product page and a quote only ever show a product that
  can be made and priced today; the copy talks to a builder about the job, not to a
  catalogue reader; sizes, glass and ratings on the page are true.
- **Staff** — the estimator proposes sheet products only; every withdrawn product
  stays reachable in ops for legacy orders; prices are the sheet's figures with the
  same audit trail the Pricing screen writes; a derived thermal figure is labelled
  so nobody mistakes it for a WERS rating.
- **Estimator (subsystem)** — one published glazing row per go-live profile; every
  sheet product offerable: family operation, dimension rule, a published row with
  Uw + SHGC, and a pricing ref that names a real rate card.
- **Manufacturer partner** — not served by this change.

## Grill conclusions (owner, 2026-09-06)

The research audit and row-by-row plan: `PLAN.md` beside this file. Rulings:

1. "Not selectable by parsing" is the existing `disabled` flag. It also hides the
   product from the public site; ops keeps it. Owner: acceptable ("is it truly the
   case? but yes"). The 11 products off the sheet are disabled, not deleted.
2. The four D1 rate cards missing under the product's pricing ref are created
   (AMJ72T awning, AMJ72T fixed, AMJ80 fixed, AMJ100L fixed); the old differently
   keyed cards stay.
3. Every go-live thermal profile publishes exactly ONE row — the sheet's standard
   glass ("one row indeed"). Other rows stay, unpublished.
4. Q1 AMJ72T frame system: `sys-80` (the unused `sys-72` stays).
5. Q2 Row 4's `amj80-awning-window` is a typo for `amj80-series-awning-window`;
   slugs are never renamed.
6. Q3 The T in a model name means thermally broken, so AMJ80ST is thermally
   broken: its profile is the WERS "AMJ80T Thermally Broken Awning Window" frame
   (imported here; the conventional `amj80-awning` profile stays). Name becomes
   "AMJ80ST Awning Window".
7. Q4 `amj80t-casement-door` stays AMJ80T and thermally broken; its standard glass
   becomes the sheet's 5/12/5 clear (the profile's published row already is).
8. Q5 AMJ150 and AMJ150ST are different things: create `amj150st-awning-window`
   (new slug, new rate card) from `amj100t-awning-window`; the orphan
   `amj150-series-awning-window` rate card stays.
9. Q6 AMJ68 bi-fold frame system: `sys-80`.
10. Q7 Industry → a "Grade" key spec (Residential / Semi-commercial / Commercial).
11. Q8 Standard hardware option follows column H; the previous standard stays
    offered as optional.
12. Q9 Dimension rules that were a window's on a door are fixed: door minimum
    height 1900 mm everywhere it was below (AMJ80, AMJ100L, AMJ100T, AMJ150
    sliding doors; AMJ68 bi-fold), AMJ80 sliding door maximum height 1500 → 2400.
13. Q10 Prices: yes — `area_rate` = column J, `perim_rate` = 0, cards created
    where missing. Remote D1 is not reachable from the agent session, so the SQL
    is a file the owner runs.
14. Q11 Night Sky becomes the single default colour.
15. Description pattern: three short builder-facing paragraphs (what it is and
    where it goes; what arrives — sizes, glass as a benefit, frame, hardware,
    ratings as a sentence; how it goes together on a job and the options chosen
    at quote time). Owner chose the plainer of the two samples ("Pattern 2": the
    AMJ80 sliding door). No catalogue-speak, no internal marketing notes, no
    prices, no data-quality hedging (that goes in ops-only `notes`). A Uw is
    quoted in prose only where the row is WERS-rated.

Derived data (all labelled, none WERS-rated): louvres get a single-glazed 6mm
clear row (Uw 6.2 / SHGC 0.70, typical louvre — AMJ has no WERS louvre rating);
the AMJ150 stacker door a 5/12/5 row from WERS AMJ-003-011 (AMJ100 Sliding Door,
same glass); the two AMJ100T hung windows a new 5/9/5 clear glazing option with
Uw 3.8 / SHGC 0.47 from WERS AMJ-054-008 (AMJ100T Sliding Window, +0.1 Uw for
the narrower gap). Each derived row says so in `certificationRef` and carries no
WERS id; the product's ops-only `notes` repeats it.

## What already exists — inputs, not outputs

- `docs/runs/catalogue-go-live-min/PLAN.md` — the research audit, per row.
- `scripts/catalogue/apply-go-live-min.mjs` — a draft apply script: dry run
  (fetch + validate + print the plan), `--write`, `--verify`. Dry-run validated
  against live Sanity on 2026-09-06: 47 mutations, 0 problems. The pipeline owns it
  from here — keep, restructure or replace — and it must end test-first: one check
  that fails if the plan logic breaks (hardware alignment, one-row-published,
  dimension-rule merge, nothing-deleted).
- `docs/runs/catalogue-go-live-min/rate-cards.sql` — draft D1 statements with
  `pricing_change` audit rows, applied locally as the rehearsal.

## Constraints

- No Sanity document is deleted; unpublished rows and orphan profiles stay.
- The `--write` run against production Sanity and the remote D1 apply happen
  AFTER review and the owner's go. The pipeline builds and verifies the tooling
  (dry run, `--verify` read-back logic, local D1 rehearsal); it does not write
  production content.
- No schema change. No code under `worker/**`, `src/data/**` or `migrations/**`.
- The working tree carries ~38 uncommitted files from another effort (`src/**`,
  `.impeccable/config.json`, `docs/mocks/**`, `docs/ops2/**`, other `docs/runs/**`).
  They are not part of this feature: do not modify, stage or commit them. Only files
  this feature creates or changes are committed.
