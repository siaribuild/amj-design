# Recommendation is a filter-then-ladder, never a weighted score

Status: accepted (owner grill D1–D18, 2026-08-20)

## Decision

The estimator selects by elimination and ordering, not by scoring: hard constraints (operation, fit, split combinability, the schedule's glazing instruction) eliminate; survivors are tiered by requirement-relative thermal deviation (meets / within 5% tolerance of the best achieved / misses / unknown / does not fit); the cheapest priceable candidate in the best non-empty tier wins. One tuned constant exists (`REQUIREMENT_TOLERANCE = 0.05`, dimensionless because deviation is normalised against the requirement itself); it is stamped on every persisted run. Comparison between two tiered candidates is pairwise and set-independent; the only set-relative step is the tolerance band, anchored on the best achieved deviation, and that behaviour is intended (spec AC-48).

## Context

The shipped six-weight ranker (`compliance .35 / geometry .20 / configuration .15 / commercial .15 / historical .10 / dataCompleteness .05`) arrived in one commit citing a spec section that does not exist, was never measured, and demonstrably picked dearer products over cheaper compliant ones, punished `estimated` catalogue records harder than real price differences, and flipped winners when an irrelevant third candidate was added (min–max normalisation). The ops console's derivation region requires losing candidates ranked *with reasons*, which a blended score cannot produce and a ladder produces natively.

## Consequences

- `RANK_WEIGHTS`, `geometryScore`, `configurationScore`, `dataCompletenessScore`, `selectWithConfidence` (and its 0.05 dominance threshold), `FLOOR`, `SHGC_SPAN`, `UVALUE_SPAN` are deleted, not tuned.
- The composite path calls the same comparator; a preference has no channel to influence order (the same-technology preference died with the weights — future contextual preferences belong to the learned layer, D9).
- `certified` vs `estimated` affects line *status* only, never order.
- The per-candidate verdict is a persisted structured contract (`CandidateOutcome`), replacing `score_components_json`, which remains in place, unwritten.
- The learned layer ships dark: consulted for display, wired into nothing the ladder reads.

## Rejected

- Re-tuning the weights: no eval harness exists and the failure is structural (irrelevant-alternatives violation), not parametric.
- A price-proximity band for D17's "prefer the dearer": a second tuned constant, which D10 forbids; the direction is honoured by fail-closed pricing instead.
