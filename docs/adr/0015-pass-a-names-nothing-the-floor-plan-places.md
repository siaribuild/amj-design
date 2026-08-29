# 0015 — Pass A names nothing; the floor plan places and orders

**Status:** accepted (owner rulings 2026-08-28, `docs/runs/plan-parse-method/DECISIONS.md` D-3 and D-4)
**Full design:** `docs/runs/plan-parse-method/02-design.md` (implements `docs/estimator/drawing-parse-design.md` §4.1–4.3)

## Context

The prescribed locating method (design §4.1–4.2) was proven manually, written down, and then not
followed by three successive implementations. The third divergence shipped earlier on 2026-08-28:
Pass A was asked to read each window's printed tag off the elevation and `assign` joined on that
tag first, with proportion demoted to a check — a defensible reaction to a production measurement
(2 of 19 assigned by proportion alone), but the opposite of the design's own clause: *"It is not
asked to name anything — nothing is matched yet, so nothing can be matched wrongly."* Meanwhile
the two floor-plan signals the design names — which elevation a tag's wall belongs to, and its
order along that wall — were never built at all; `wallOrder` was a declared field no code
populated.

## Decision

1. **Pass A names nothing.** The elevation inventory reports window-shaped boxes, proportions and
   panel symbols — never a tag. The tag question, the tag-first join, `duplicate_tag`, the
   claim-precedence machinery (`preferLocation`, `locationVerdict`) and the multi-sheet merge are
   deleted, not commented out. `elevation_inventory` moves to `promptVersion: "v3"` so no cached
   v2 answer can replay into the narrowed contract.
2. **The floor plan is the join, and the model answers it.** One vision call per floor-plan page
   answers, for every tag in a closed vocabulary the page's own text layer supplies: which
   elevation (A–D) the tag's wall belongs to, and its order along that wall as viewed on that
   elevation. The model places and orders; it never invents — an answer outside the vocabulary is
   discarded and counted.
3. **Arithmetic is demoted to a check, never the source.** Marker-side derivation and axis
   projection corroborate the model's order where they are computable; a strict contradiction
   refuses both rows visibly. Where projection ties or a side is unresolved (L-shaped walls,
   leader lines), the model's answer stands — that judgement is what the owner chose to buy at
   runtime rather than re-derive per drafter.
4. **Matching happens inside one elevation.** A row is matched only against boxes in the region
   the floor plan placed it on; proportion separates candidates within that region and never
   selects an elevation.

## Consequences

- Coverage now depends on the floor-plan chain: an opening the chain cannot place is a visible
  `not_read` (`unplaced`), never matched set-wide — the whole-set proportion matching the method
  replaced does not return as a fallback.
- Pass A boxes are normalised to a *region* image, so a region→page coordinate mapping is a hard
  requirement with its own tests; an unmapped box would crop a different window and be described
  confidently — the failure class the release gate holds at zero.
- Two model calls are added per parsed set (one per floor-plan page on the reference document),
  paid for by the two Pass A calls no longer wasted on sheets with no elevations.
- The production-measured tag join is gone; if a future set defeats the floor-plan chain, the
  evidence route back is a new owner decision against gate numbers, not a quiet re-add.
