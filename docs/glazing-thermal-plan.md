# Glazing & Thermal Performance — Implementation Plan

Working plan for putting the manufacturer's glazing/thermal (WERS) data into the
OpenFrame catalogue. Full architecture + adversarial review: see the design
artifact (Glazing & Thermal Performance — Architecture & Plan). This doc is the
build backbone: locked decisions, the adjusted data model, milestones, and the
scaffold inventory. Branch: `feat/glazing-thermal`.

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

## Scaffold inventory (this branch, non-breaking, undeployed)

- `sanity/schemaTypes.ts` — `thermalProfile` type; glazing fields on `option`; product Glazing group + `thermalProfile` ref. Additive; existing estimator path untouched.
- `migrations/0039_glazing_thermal_scaffold.sql` — `glass_excluded_from_area_rate` column + default-tier note. Not applied.
- `worker/lib/estimator/thermalProfile.ts` — loader stub (GROQ + row mapping) with TODOs for M2.
- `worker/lib/estimator/pricing-defaults.ts` — glazing default-tier price map (D6) stub.
- `src/components/ThermalPerformance.tsx` — product-page thermal table stub (M3).
- `scripts/catalogue/import-wers.mjs` — importer skeleton with the confirmed frame→product mapping (D3/D4/D5) and TODO for the writes (M6).
- TODO(glazing-thermal-D2) markers in `rank.ts` / `compliance.ts` for the ranker tune (M4).

Nothing here changes running behaviour: new Sanity types/fields are additive and
undeployed; new worker modules have no callers; the migration is unapplied.
