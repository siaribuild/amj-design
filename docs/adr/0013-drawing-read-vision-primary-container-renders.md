# 0013 — The model reads the drawings; the container renders; the Worker decides

**Status:** accepted (owner rulings 2026-08-27)
**Full design:** `docs/estimator/drawing-parse-design.md` (Part I; Part II is the record)

## Context

`proposeSplit` builds an opening with no stated composition as N equal units — often the wrong
product and the wrong price. The composition is in the drawings. A vector-geometry decoder was
proven exact on the reference set (110 ms, zero tokens) but needed a new geometric rule per
drafter edge case — three found in a single document, each a confident wrong answer until
caught. Meanwhile locating an opening on an elevation (tag → wall → elevation letter →
same-size disambiguation) is text-and-symbol work geometry cannot do at all.

## Decision

1. **A vision model reads the drawings** — render the sheet, crop to one opening, ask with the
   schedule row as context. The geometric decoder is demoted to a corroborating second opinion
   in verification: free, exact, and wrong in different ways than a model.
2. **The container renders and crops; the Worker reads, verifies and reports.** The container
   (`containers/plan-parse/`, Node — same pdf.js as the Worker, therefore one coordinate
   space) holds **no credentials** (no R2, no D1, no model key), keeps no state between
   requests, and is reachable **only via the Cloudflare container/DO binding** — never a
   public route. The vision call, retries, escalation, run records and all D1/R2 writes stay
   in the Worker, which already owns that machinery.
3. **Untrusted model output is refused, not repaired**: an out-of-range or inverted region is
   a `not read`, never clamped into "the whole sheet"; a reading never names a family (the
   schedule does); a stated width beats a measured ratio.
4. **Release bar, split**: a WRONG reading is a release blocker (zero tolerated); an ABSENT
   reading (`not read`) is measured, not gated — it hands over to today's fallback visibly.
   Ships behind the human review gate; removing that gate is a separate future decision with
   its own evidence bar.

## Consequences

- A drawing-derived split is a new `SplitHint` **source**, not a new mechanism; for shape it
  ranks above the schedule comment and the energy report (the `pairing.ts` precedence comment
  was stale and is corrected with the change).
- Two additive columns on `ai_job_claim` carry the customer's progress counter; the
  `progress_stage` CHECK is deliberately not extended (that would be a table rebuild —
  `d1-migration-safety`).
- Crops are stored customer-document fragments: staff-only, audit-logged, retention is an
  owner decision (design §14 D1).
- `refineOperable` / `apexMeans` / the symbol-profile machinery stay unreferenced (AMJ makes
  no hopper; the awning/hopper distinction cannot be expressed by the catalogue).
