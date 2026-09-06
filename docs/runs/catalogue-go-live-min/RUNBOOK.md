# Runbook — applying the go-live minimum to production

Everything below is reversible except where marked. Order matters: Sanity first, then D1,
then the reconciler, then the read-back.

## 0. Preconditions

- `docs/runs/catalogue-go-live-min/08-accept.md` says ACCEPT for the commit being run.
- `npm run test:go-live` green; `node scripts/catalogue/apply-go-live-min.mjs` (dry run)
  prints `21 amend target(s), 1 create target(s)` and no problems.
- Nobody is editing the catalogue in Sanity Studio right now (patches carry `ifRevisionID`;
  a concurrent edit makes the whole transaction fail with 409 — safe, but you re-run).

## 1. Sanity (the agent session runs this; owner's original ask)

```bash
node scripts/catalogue/apply-go-live-min.mjs --write
node scripts/catalogue/apply-go-live-min.mjs --verify
```

`--verify` must print zero `DRIFT` lines and `… 0 not as intended`. If it prints drift, the
plan is re-run (`--write` is idempotent for a converged plan); if a document is named as a
problem, stop and read it — nothing partial has been written (one transaction).

## 2. D1 rate cards (owner runs this — remote D1 is not reachable from the agent session)

Optional but recommended (accept §Decisions 4): keep the current remote versions first.

```bash
npx wrangler d1 execute apertly-db --remote --json --command "SELECT id, perim_rate, area_rate, min_charge, version FROM pricing_rate_card ORDER BY id" > docs/runs/catalogue-go-live-min/rate-cards-before.json
```

Then apply (one atomic batch of 22 upserts — production already holds cards the local copy
lacks, so every statement is INSERT … ON CONFLICT DO UPDATE; a re-run re-applies the same
figures and bumps versions again):

```bash
npx wrangler d1 execute apertly-db --remote --file docs/runs/catalogue-go-live-min/rate-cards.sql
```

Expected: `22 commands executed successfully`. Read back:

```bash
npx wrangler d1 execute apertly-db --remote --command "SELECT id, area_rate, version FROM pricing_rate_card WHERE perim_rate = 0 ORDER BY id"
```

22 rows, every one with `perim_rate = 0`, `area_rate` = column J and `glass_excluded_from_area_rate = 0`;
versions bumped from whatever production held (the 2026-08-27 backup shows v2–v5 on some cards),
`amj150st-awning-window` new at `v1`.

Then confirm the go-live glazings carry no per-m² glass surcharge (glass is inside J):

```bash
npx wrangler d1 execute apertly-db --remote --command "SELECT id, surcharge, basis FROM pricing_option_surcharge WHERE id LIKE 'glz-%' AND surcharge <> 0"
```

Expected: no rows (the 2026-08-27 backup had every `glz-*` surcharge at 0). Any non-zero row
for a go-live glazing would double-count glass and must be zeroed in ops → Pricing → Options.

## 3. Reconcile (architecture review, round 2)

Ops → Pricing → Reconcile. Expect: no product without a rate card, no missing surcharge, and
none of the 22 in "not offerable". This is the cross-store check the script cannot do.

## 4. Read-back on the site

- A sheet product page (e.g. AMJ100T Awning Window): new copy, "Grade" chip, Glazing tab
  shows ONE row. Standard inclusions list the column-G glass and the column-H hardware.
- An off-sheet product slug (e.g. `/products/amj80t-bi-fold-door`) resolves like an unknown
  product; it is absent from listings and the sitemap.
- Quote builder: Night Sky preselected as the colour.
- Ops: an old order line on a withdrawn product still resolves and re-prices.

## Re-running the script later (caution)

The six NEW profiles are written with `createOrReplace`. On the first production write they do
not exist, so this is a plain create. If the script is ever re-run after someone has edited one
of those six profiles in Studio (dragged its order, added a row), the re-run replaces the whole
document from the plan and that edit is lost — see DEBT.md (architecture round 3, finding 1).
Re-run only after a dry run shows the six profiles are not among the mutations, or accept the
overwrite knowingly.

## Rollback

Sanity keeps document history: every patched document can be restored to its previous
revision in Studio (History → Restore); the six new profiles, two glazing options and the new
product can be unpublished/deleted by hand. D1: the `rate-cards-before.json` export from step 2
holds the previous figures; re-apply them with UPDATEs and delete the five inserted card ids.
