# Thermal modelling — assessment, and a paused grill

**Date:** 2026-08-20 · **Status: ASSESSMENT ONLY. No work started, no code changed.**
Owner paused the session: *"let's not get into product recommender changes today. Maybe next week."*

This records what was measured, what the owner settled, and where the grill stopped, so the
effort resumes from evidence rather than from recollection.

---

## 1. The verdict

**The architecture is sound. The content is thin, and biased in the direction that costs money.**

The `requirementBasis` tiering the owner described already exists in code
(`explicit_energy_report | plan_derived | default_envelope | human_override`) and the authority
chain works correctly — `applyDefaultEnvelope` skips any opening that already carries a
requirement, and `effectiveThermalRequirements` treats an explicit report as overriding. That
needs no remediation.

What sits underneath it is much weaker than it looks.

## 2. Measured in production, 2026-08-20

`opening_requirements`, 699 rows across 38 building models:

| Fact | Value |
|---|---|
| Openings on `default_envelope` | **444 (64%)** — all at Uw 4.0, none with an SHGC target |
| Openings on `explicit_energy_report` | **255 (36%)** — Uw 1.69–3.04, mean **1.90**, all with SHGC targets |
| Openings on `plan_derived` | **0** — tier 3 has never existed |
| Distinct projects behind the 255 report rows | **2** (thin sample; caveat every conclusion drawn from it) |
| Models carrying wall orientation | 11 of 38 (29%) |
| Models carrying a rooms array | **0 of 38** |
| Models with an opening linked to a room | 12 of 38 (32%) |
| Models with eave/shading projection | **0 of 38** |

### 2.1 The finding that matters

**The default envelope assumes a thermal bar less than half as strict as every real report the
platform has ever parsed** — 4.0 against a measured 1.69–3.04 — and it governs 64% of openings.

Corroborated independently of the two-project sample: NCC 2022 requires 7-star NatHERS for new
homes, Melbourne is climate zone 6, single-glazed aluminium sits at 5.8+ and double-glazed units
run 1.1–1.8. A 4.0 cap admits basic double glazing and excludes little.

**Why it matters commercially.** The owner's stated purpose for thermal modelling is choosing the
right product so the *price* is right. A loose Uw cap recommends cheaper glass than the job needs,
so the estimate lands **low** and human review revises it **up** — the −5% side of the platform's
"accurate at 105%" target, which the owner has said is outside the success margin. The default is
not merely imprecise; it is biased the expensive way.

### 2.2 Defects confirmed by inspection

- **`plan_derived` is declared in four type definitions and assigned nowhere.** A plan-informed
  band records as `default_envelope`, so tier 3 is invisible in the data and cannot be measured.
- **The orientation→SHGC logic has never fired in production** — 0 of 444 default rows carry an
  SHGC target. The cause is structural: orientation only arrives from an energy report, and when a
  report exists the computed band is skipped entirely (`applyDefaultEnvelope` skips openings that
  already have a requirement). `shgcForOrientation` is unreachable on the path it was written for.
- **The eight-zone NCC climate table in `computeDefaultBand` is inert.** One archetype exists
  (`VIC_CZ6_DETACHED_NCC2022_DEFAULT`) and `resolveDefaultEnvelope` falls back to it for every
  jurisdiction, so `nccClimateZone` is always 6. *Not a defect for a Melbourne-only venture — see
  the owner's decision below.*
- **A computed room model is discarded.** `pipeline.ts:223-243` derives room area, total floor
  area, glazing-to-floor ratio and shading projection, then rolls them into a `riskBand`.
  `computeDefaultBand` takes only climate zone and orientation, so none of it reaches the band —
  and `riskBand`'s only consumer (`contextAffinity`) was deleted in the recommendation-model
  redesign. It is now computed on every run and used by nothing.
- **Tier 1 (manual entries) is correct by omission** — no opening record, no band, nothing claimed.

## 3. Settled in the grill

| # | Decision |
|---|---|
| **T1** | Calculated thermal values are **not authoritative**. Their purpose is to help choose the correct product so the price is estimated correctly. The platform is working toward an accurate modelling suite; it is not making compliance claims. |
| **T2** | **Uw and SHGC targets are all the estimator needs.** Everything else in a thermal model exists only to arrive at those two numbers. |
| **T3** | Two different "star ratings" were being conflated and are now separated: **WERS** ratings are manufacturer product data (already imported, `wersWindowId`); the **NatHERS** star rating on an energy report is a whole-of-home simulation outcome. A NatHERS rating **must never be turned into a per-window band** — the relationship does not exist in that direction. It stays as displayed evidence and a cross-check. |
| **T4** | **Climate zone resolution is deprioritised — backlog.** The venture starts in Melbourne, so the existing VIC CZ6 archetype is correct for the actual business. Delivery postcode cannot serve as the source in any case: it is captured at order time, after the estimate runs. |
| **T5** | **IP geolocation is rejected** as a location source. It gives the browser's location, not the site's — a Melbourne builder quoting a Cairns job gets Melbourne with full confidence and no flag, which is wrong in exactly the cases where climate zone matters most. If location is ever needed: the certificate states the zone, the plan title block carries the site address, or ask once at upload. |
| **T6** | **Chart before building** — wayfinder map plus decision tickets, each region then running the normal pipeline. Confirmed by the owner. |

## 4. Where the grill paused

The frontier was **not** empty. Open when the session stopped:

- **Q10 — how the default Uw cap gets set.** Proposal on the table: set it from the ABCB Glazing
  Calculator for a typical Melbourne detached dwelling (authoritative, free, citable), and
  continuously check it against parsed reports so drift shows up as data. The point is that the
  number must be defensible **by citation**, not by assumption — the same disease the
  recommendation-model redesign just finished removing.
- **Q11 — whether to tighten the default immediately**, ahead of the map. One constant, reversible,
  and every day at 4.0 is a day of estimates biased low. Recommended yes, with the ABCB figure
  sourced first.
- **Q12 — what happens to the 444 openings on the old band.** Recommended: leave them. A quote
  issued under stated assumptions should not be silently re-based; new estimates get the new
  number, existing lines get it when re-estimated, which is a visible act.
- **AMBIGUITY to settle first next time.** The owner said *"i dont mind having that table, don't
  [think] it is a major effort"*. "That table" is either the eight-zone climate table (keep it, it
  is cheap) or the orientation→SHGC table. Both readings are plausible in context; do not guess.

## 5. Recommended sequence when this resumes

1. Settle the table ambiguity and Q10–Q12.
2. **Recalibrate the default Uw cap** with a cited source. Highest value per unit of effort by a
   wide margin: one number, governing 64% of openings, currently biased the costly way.
3. **Make `plan_derived` a real basis** so tier 3 is measurable — you cannot improve what you
   cannot distinguish, and today a plan-informed band is indistinguishable from a blind one.
4. **Delete `riskBand`.** Dead computation that reads as live.
5. **Reach the orientation→SHGC path**, which today is unreachable because orientation and the
   computed band never co-occur.
6. Backlog: climate-zone resolution, wall/ceiling parsing, the full plan-derived model.

## 6. Related work raised separately

- Glass identity falls back to the frame-specific `variantId` when a variant has no
  `glazingOptionSlug` — the M6 legacy gap.
- The `certified` field: owner states it has no value and the Uw figure is authoritative. Removed
  from all ordering by the recommendation redesign, but still drives a validation that can drop a
  product from sale and the `commercial_only_estimate` downgrade.
- The plan parser should return split ratios that supersede the family defaults.
