# Catalogue go-live minimum — working plan

Source: `D:\OneDrive\Documents\Business\Open Frame\Products\AMJ_min.xlsx` (22 rows).
Status: research done; the open questions below were answered by the owner on 2026-09-06 — the rulings are in `00-ask.md`, which is the pipeline's input. Nothing has been written to production Sanity or D1; the run `catalogue-go-live-min` builds and reviews the tooling first.

## What "selectable by automated parsing" means in this codebase

The estimator (`worker/lib/estimator/select.ts`) only ever chooses a product that is
(a) not `disabled`, and (b) offerable: family operation known, a dimension rule, and at
least one *published* thermal-profile row with Uw + SHGC. There is no separate
"machine-selectable" flag, so the only switch that withdraws a product from parsing
is `disabled: true` — which also hides it from the website. Ops keeps full access.

## Row-by-row

| # | Sheet | Product slug (L) | State | Thermal profile (O) | Work |
|---|-------|------------------|-------|---------------------|------|
| 2 | AMJ72T awning, TB, sys-80 | `amj72t-awning-window` | exists; no frame system, no description/specs/hero | `amj72t-awning-window` — 1 published row 5/12/5 clear, manufacturer figures, uncertified | set frame system (Q1), copy, specs, normalise standard glass. **No D1 rate card** (prices off `default`). |
| 3 | AMJ72T fixed | `amj72t-fixed-window` | exists, bare | `amj72t-fixed-window` OK | as row 2. **No D1 rate card.** |
| 4 | AMJ80ST awning, **TB = Yes** | `amj80-awning-window` — **does not exist**; the product is `amj80-series-awning-window` | exists | `amj80-awning` — conventional, 1 row 5/12/5 OK | Q2 (slug) and Q3 (thermally broken or not). |
| 5 | AMJ80 fixed | `amj80-series-fixed-window` | exists, bare | `amj80-fixed-window` — **2 published rows** (low-E + clear) | unpublish the low-E row, keep `glz-5clr-xyg-12ar-5clr-xyg-we`. **D1 card is keyed `amj80st-fixed-window`, pricingRef is `amj80-series-fixed-window`, so it prices off `default` today.** |
| 6 | AMJ80 hinged door, **TB = No**, 5/12/5 clear | `amj80t-casement-door` | exists as "AMJ80T Casement Door", standard glass 6mm Low-E/22Ar, name says thermally broken | `amj80t-hinged-door` — frameTechnology thermally_broken, 1 row 5/12Ar/5 OK | Q4. |
| 7 | AMJ80 sliding window, 5/8/5 | `amj80-series-sliding-window` | exists | `amj80-sliding-window` — published row is **low-E**; no plain 5/8/5 air row exists | publish `glz-5clr-xyg-8ar-5clr-xyg-we` (AMJ-060-002, Uw 4.2 / SHGC 0.52) instead, unpublish the low-E. |
| 8 | AMJ80 sliding door 2-track, 5/8/5 | `amj80-series-sliding-door` | exists | `amj80-sliding-door` OK 5/8/5 | copy only. Dimension rule looks like a window's (max height 1500 mm) — Q9. |
| 9 | AMJ80 louvre, 6mm single | `amj80-series-glass-louver4-inch` | exists | **new** — the sheet's guess `amj100l-sliding-door` is double glazed, unusable | new profile "AMJ80 Glass Louvre": one row on a new glazing option `glz-6clr` (6mm Clear, SG), Uw 6.2 / SHGC 0.70, **derived** (matches the product's legacy variant and typical single-glazed louvre ratings; AMJ has no WERS louvre data). |
| 10 | AMJ100LST awning | `amj100l-series-awning-window` | exists | `amj100l-awning` OK | copy. |
| 11 | AMJ100L fixed | `amj100l-series-fixed-window` | exists, bare | `amj100l-series-fixed-window` (the sheet says `amj100l-fixed-window`; same document) OK, argon row | copy, specs. **D1 card keyed `amj100l-fixed-window`, not the pricingRef, so it prices off `default`.** |
| 12 | AMJ100L sliding door | `amj100l-series-sliding-door` | exists | `amj100l-sliding-door` OK 5/8/5 | copy. |
| 13 | AMJ100L louvre 6", single | `amj100l-series-glass-louver6-inch` | exists | **new** | as row 9, "AMJ100L Glass Louvre". |
| 14 | AMJ150 3-track stacker door, 5/12/5 | `amj150-series-sliding-door` | exists (family sliding-door; no stacker family exists) | **new** — the sheet's guess `amj100l-sliding-door` has only 8mm-gap rows | new profile "AMJ150 Sliding Door": one row `glz-5clr-12-5clr-we`, Uw 3.9 / SHGC 0.58 **derived** from WERS AMJ100 Sliding Door AMJ-003-011 (conventional sliding door, exact glass). |
| 15 | **NEW** AMJ150ST awning, TB | (blank) | **create** from `amj100t-awning-window` (N) | `amj150t-tb-awning-window` OK, 1 row 5/12Ar/5, currently unused | Q5 (slug). Copy dimension rule 500–1300 × 500–2400, options, spec rows; family awning-window, sys-150, schemaVersion 1. No hero image available. |
| 16 | AMJ150 fixed | `amj150-fixed-window` | exists, bare | `amj150-fixed-window` OK | copy, specs. D1 card OK. |
| 17 | AMJ100T awning, TB | `amj100t-awning-window` | exists | OK 5/12/5 | copy. |
| 18 | AMJ100T fixed | `amj100t-fixed-window` | exists, bare | OK | copy, specs. |
| 19 | AMJ100T hinged door | `amj100t-series-casement-door` | exists | `amj100t-casement-door` OK, argon row | copy. |
| 20 | AMJ100T sliding door 2-track | `amj100t-series-sliding-door` | exists | `amj100t-sliding-door` — **all 12 rows published** | keep only `glz-5clr-12-5clr-we`. Dimension rule min height 2800 = max height 2800 — Q9. |
| 21 | AMJ100T hung window, 5/9/5 clear | `amj100t-single-hung-window` | exists; standard glass currently Low-E 5/9Ar | **new** | new glazing option `glz-5clr-9-5clr-we` (5mm Clear / 9mm Air / 5mm Clear, DG clear); profile "AMJ100T Single Hung Window", one row Uw 3.8 / SHGC 0.47 **derived** from WERS AMJ100T Sliding Window AMJ-054-008 (5/12Air/5: 3.7 / 0.48; +0.1 Uw for the narrower gap). The sheet's guess `amj100t-awning-window` gives 3.7 / 0.44 — same neighbourhood; a sliding sash is the closer frame. |
| 22 | AMJ100T sashless double hung, 5/9/5 | `amj100t-series-sashless-double-hung` | exists; currently points at `amj83-double-hung` (all 12 rows published) | **new** | profile "AMJ100T Sashless Double Hung", same derived row as 21. `amj83-double-hung` kept, unused. |
| 23 | AMJ68 bi-fold, sys-80 | `amj68-series-bi-fold-door` | exists, frame system **sys-65** | `amj68-bifold-door` OK | Q6 (frame system). |

## Products not in the sheet → `disabled: true` (11)

amj100-series-pivot-door, amj100l-series-casement-door, amj125t-slim-frame-sliding-door,
amj150t-lift-sliding-door, amj65t-casement-door, amj65t-casement-windowoutward-opening,
amj65t-tilt-and-turn-window, amj67t-fixed-window, amj80-series-casement-window,
amj80t-bi-fold-door, amj80t-tilt-and-turn-window. All eleven are also listed under
"MISSING IN PRICE LIST" in the full price list, so none can be priced honestly anyway.

Nothing is deleted. The profiles that become unused (`amj83-double-hung`, and the already
unused `amj67t-fixed-window`, `amj155t-lift-and-slide-door`) and every unpublished glazing
row stay.

## Field mapping

| Sheet | Sanity |
|-------|--------|
| B Model | product `name` prefix ("AMJ100T …") |
| C Frame system | `frameSystem` → `frameSystem-<slug>` |
| D Thermally broken | thermal profile `frameTechnology` (must agree with the product's name and copy) |
| E Industry | no field. Proposal: a `keySpecs` row "Grade: Residential / Semi-commercial / Commercial" plus the description's tone (Q7) |
| F Design | `family` |
| G Standard glass | `standardGlass` (normalised, e.g. "5+12A+5mm clear double tempered glass") and a `specs` row; it is also what the single published profile row must be |
| H Hardware | the standard `hardware` option (Q8 — several products currently name a different standard) |
| J Price+GST | **not Sanity** — D1 `pricing_rate_card`: `area_rate = J`, `perim_rate = 0`. The engine's figures are GST-inclusive (`src/data/gst.ts` divides by 1.1 for ex-GST display). See Q10. |
| L | product `slug` = `pricingRef` = D1 card id |
| O | `thermalProfile` reference |

## D1 rate cards

Read from the local copy (the remote read was blocked; assume production matches the
migration seeds). A card exists for 21 of the 22 rows under *some* key; the gaps:
`amj72t-awning-window` and `amj72t-fixed-window` (no card at all),
`amj80-series-fixed-window` (card is `amj80st-fixed-window`),
`amj100l-series-fixed-window` (card is `amj100l-fixed-window`).
Every card still has `glass_excluded_from_area_rate = 0`, i.e. glass is priced inside the
area rate — exactly the sheet's "per m² of frame + glazing" model, so no glass surcharge
work is needed for go-live.

## Description pattern (proposal)

Voice: OpenFrame talking to a builder who is about to put this window on a quote. Plain,
specific, no catalogue-speak ("it is specified in the catalogue with…") and no internal
marketing notes ("position this as…", "market it to…" — the second paragraphs in the
earlier `product_catalogue_marketing_descriptions_revised.xlsx` are those, and are
equally unusable on a product page).

1. **What it is and where it belongs** (2–3 sentences): the series and grade in one
   phrase, the operation, the rooms or elevations it normally goes in, and the one reason
   to pick it over its siblings (thermal break, span, price, airflow).
2. **What you get, as it arrives** (2–3 sentences): made to your sizes, with the envelope
   in plain words; the standard glass told as a benefit ("double glazed as standard, 5mm
   toughened both sides"); frame wall thickness; hardware by brand; the weather ratings
   as a sentence rather than a table.
3. **How it goes together on a job** (1 sentence): the fixed lite it pairs with in a run,
   and the options (colour, flyscreen, installation detail) chosen at quote time.

No prices, no "the catalogue", no hedging about data quality (that belongs in `notes`,
which is ops-only). Short description (card line, at most 14 words): who it is for plus
the standout fact. SEO meta description: the short description plus the size envelope.

## Open questions — ANSWERED, see 00-ask.md (kept for the record)

- **Q1 AMJ72T frame system.** The sheet says `sys-80`; a dedicated `sys-72` system already exists (unused). Follow the sheet?
- **Q2 Row 4 slug.** `amj80-awning-window` does not exist; the product, its rate card and existing quote lines all use `amj80-series-awning-window`. Renaming breaks quote lines (`product_slug`) and the D1 card key. Keep the existing slug and treat L as a typo? Rename the display name to "AMJ80ST Awning Window"?
- **Q3 AMJ80ST thermally broken?** The sheet says Yes; the WERS profile it points at (`amj80-awning`) is conventional, and the 2026-08-08 frame-system notes call AMJ80ST conventional (AMJ80T is the thermally broken one). WERS has an unimported "AMJ80T Thermally Broken Awning Window" frame (5/12Ar/5 clear: Uw 3.6 / SHGC 0.43). Which is it?
- **Q4 Row 6.** Sheet: AMJ80 hinged door, NOT thermally broken, 5/12/5 clear, $330. Sanity: "AMJ80T Casement Door", Low-E argon standard glass, profile thermally broken. If the sheet wins: rename to "AMJ80 Hinged Door", set standard glass 5/12/5 clear, profile frameTechnology → conventional, keep the slug. Confirm?
- **Q5 New AMJ150ST awning slug.** Propose `amj150-series-awning-window` — a D1 rate card already exists under that key (55/340) and the WERS importer already maps the AMJ150T TB awning frame to it. Name "AMJ150ST Awning Window". OK?
- **Q6 AMJ68 bi-fold frame system.** The sheet says `sys-80`; it is tagged `sys-65` per your 2026-08-08 grouping (65T/67T/68 one system). Follow the sheet?
- **Q7 Industry.** Add as a `keySpecs` "Grade" row (shows on the product hero) or keep it out of the UI?
- **Q8 Hardware (H).** Align each product's standard hardware option to column H (e.g. AMJ100T awning: American Chain Winder → AU Doric Brand Chain Winder)? Or leave hardware alone?
- **Q9 Dimension rules that look wrong** (not from the sheet, noticed in passing): `amj80-series-sliding-door` max height 1500 mm (a window's), `amj100t-series-sliding-door` min height = max height = 2800 mm, `amj80-series-sliding-window` min 750×550. Fix now, or leave?
- **Q10 Prices.** Column J is not in Sanity. Update the D1 rate cards (`area_rate = J`, `perim_rate = 0`, add the four missing or misnamed cards)? Remote D1 writes are blocked from this session; I can write the SQL for you to run, or you enter them in ops → Pricing.
- **Q11 Colour.** The sheet prices Night Sky; Sanity has two default colours (Dover White and Monument). Make Night Sky the single default?
- **Q12 Disabled products** (the 11 above) also vanish from the public site. Acceptable?
