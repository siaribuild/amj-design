# Glazing & Thermal Performance — Implementation Plan

Working plan for putting the manufacturer's glazing/thermal (WERS) data into the
OpenFrame catalogue. Full architecture + adversarial review: see the design
artifact (Glazing & Thermal Performance — Architecture & Plan). This doc is the
build backbone: locked decisions, the adjusted data model, milestones, and the
implementation status. Branch: `feat/glazing-thermal`.

## Status (verified against production, 2026-08-14)

| M | State | Evidence |
|---|-------|----------|
| M1 | **done** | `thermalProfile` type + product Glazing group/ref live in the deployed Studio schema |
| M2 | **done** | `worker/lib/estimator/catalogue.ts` — `CANDIDATE_QUERY` projects the frame profile; `toCandidate`/`profileRowsToVariants` prefer it and fall back to legacy `performanceVariants` per product. (Implemented directly there, NOT in the `thermalProfile.ts` loader stub this doc originally scaffolded — that file stayed an untouched no-op stub while the real work happened elsewhere, and has been deleted.) |
| M3 | **done** | product-page Glazing tab reads `product.thermal` (`src/pages/ProductDetailPage.tsx`; no separate `ThermalPerformance.tsx` was ever created — the stub was never written and the tab landed inline) |
| M4 | **done** | delivered as WS4 of `docs/estimator/thermal-selection-rework-plan.md` (graded `complianceScore`, `historical` weight 0.10); the `TODO(glazing-thermal-D2)` markers are gone |
| M5 | **done** | migration `0039` applied locally + remote; the D9 write-guard is live (`worker/routes/ops-pricing.ts` — `area_rate_still_includes_glass` blocks a per-m² glass price while any card is untrimmed) |
| M6 | **partial** | importer implemented (`scripts/catalogue/import-wers.mjs`, real writes); production carries 21 `thermalProfile` docs and 19/34 products reference one. **15 products still resolve thermal via legacy `performanceVariants`** — the remaining content work. |
| M7 | **not started** | 7/34 active rate cards still have `glass_excluded_from_area_rate=0`; the M5 guard is actively blocking per-m² glass pricing until they are trimmed |
| M8 | **in progress** | the never-wired `thermalProfile.ts` and `pricing-defaults.ts` scaffold stubs are deleted (2026-08-14; the importer carries the only copy of the D6 tier map); remaining: retire `performanceVariants` itself once M6 covers all 34 products, then the dual-read fallback in `toCandidate` |

## Locked decisions

| ID | Decision |
|----|----------|
| D1 | Glazing stays an **option** (enrich the existing `option` doc — glassSpecification, glassType, class enum) so it flows through the normal selection UX. Thermal data gets its **own "Glazing" group in Sanity**. Option = the choice; Glazing group = the performance matrix. |
| D2 | **Tune the ranker** (fold SHGC target into compliance, resolve one shared band for rules+ranker, blend the worst-axis compliance score); retire the dead `selectGlassForBand`/`choosePerformanceVariant` path. |
| D3 | **Add a Fixed Window family + products** (rescues the 5 Fixed frames / 105 rated rows — the best Uw in the export). |
| D4 | **Confirm all three tentative WERS mappings** (AMJ155T→amj150t-lift-sliding-door, AMJ150T-TB awning→amj150-series-awning-window, AMJ83→amj100t-series-sashless-double-hung). |
| D5 | **Shared `thermalProfile` document per frame.** Products reference their frame's profile; hardware-twin products (one WERS frame → two products) share one profile instead of duplicating the matrix. |
| D6 | Until real prices arrive, seed **non-zero default glass $/m² by tier** (ascending SG < DG-clear < DG-toned < DG-lowE < TG; e.g. a 3-option product → $100 / $120 / $140). |
| D7 | Document the two requirement-basis vocabularies; optionally rename `default_allowance`→`default_envelope`. |
| D8 | Route computed/ambiguous thermal bands to `advisoryRequirements` (soft), keep only explicit energy reports as hard `requirements`. |
| D9 | Couple the area-rate trim to glazing going live in **code** (a write-guard), not operator memory. |

## Adjusted data model (D1 + D5)

```
option (glazing optionType)            ← the CHOICE (selectable, in the options UX)
  name / slug / technicalValue(class)  ← D1: enrich with glassSpecification, glassType
      ▲ referenced by
thermalProfile  (NEW shared doc, one per WERS frame = series × operation)  ← D5
  name (e.g. "AMJ80 Awning") / frameTechnology
  rows[]: { glazing→option, uValue, shgc, tvw,
            heatingStars, coolingStars, heatingPct, coolingPct,
            airInfiltration, wersWindowId, certified, certificationRef, published }
      ▲ referenced by
product.thermalProfile  (in the new "Glazing" group)  ← two hardware-twin products share one profile
```

- **Public → Sanity:** glazing identity (option) + Uw/SHGC/Tvw/stars (thermalProfile rows). Shown to customers.
- **Secret → D1:** glass **$/m²** in `pricing_option_surcharge`, keyed by glazing slug, `basis='per_sqm'`.
- The estimator resolves a product's glazings + thermal through `product.thermalProfile` (M2), prices via the selected glazing slug (existing per-m² path), and selects with the **tuned ranker** (M4).

## Milestones

| M | Scope | Surface | Gate |
|---|-------|---------|------|
| M1 | glazing option enrichment + `thermalProfile` type + product Glazing group/ref | Sanity | — |
| M2 | estimator reads thermal via profile; class-enum expansion + reject-unknown | Worker | M1 |
| M3 | thermal display on product page; glazing in the options UX | Frontend | M1 |
| M4 | tune ranker (SHGC target, shared band, blended score); retire dead selector | Worker | M2 |
| M5 | area-rate write-guard + default price tiers + fail-closed hardening | D1 + Worker | — |
| M6 | WERS import (profiles, glazing docs, Fixed Window family, confirmed mappings) | Sanity | **M1 + M4 + M5** |
| M7 | price go-live: trim area rates, author real $/m² | D1 / ops | M5 + M6 |
| M8 | legacy cleanup (stub docs, [0]-reprice, dead selector, glassBuildUp remnants) | all | M6 |

**Critical ordering (review §9.4):** the single-variant-per-product stub masks the
area-rate double-count and the `performanceVariants[0]` re-price bug. Both detonate
the moment a product gains a second variant — so **M4 (wiring) and M5 (fail-closed)
must land before M6 (import)**.

## Scaffold inventory — HISTORICAL (superseded by the Status table above)

What this section originally listed was the undeployed scaffold as of the
branch's first commit. Everything in it has since either shipped or been
deliberately deleted; it is kept only so the Status table's "implemented
elsewhere / never wired" notes have something to be read against:

- `sanity/schemaTypes.ts` scaffold → shipped (M1).
- `migrations/0039` → applied (M5).
- `worker/lib/estimator/thermalProfile.ts` loader stub → **deleted 2026-08-14
  without ever being wired**; M2 was implemented directly in
  `worker/lib/estimator/catalogue.ts` instead and the stub's stale "M2 not
  done" comment was actively misleading.
- `worker/lib/estimator/pricing-defaults.ts` D6 tier stub → **deleted
  2026-08-14, never imported by anything**; `scripts/catalogue/import-wers.mjs`
  carries the only copy of the tier map.
- `src/components/ThermalPerformance.tsx` → never created; M3 landed inline in
  `src/pages/ProductDetailPage.tsx`.
- `scripts/catalogue/import-wers.mjs` skeleton → grew into the real importer (M6).
- `TODO(glazing-thermal-D2)` markers → resolved by the ranker tune (M4).
