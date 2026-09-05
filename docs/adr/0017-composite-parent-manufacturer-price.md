# 0017 — A composite parent's `line_total` is owned by whoever last wrote it

**Status:** accepted
**Full design:** `docs/runs/ops2-composite-manufacturer-price/02-design.md` §§1–2

## Context

`recomputeComposite` derives a composite parent's `line_total` as Σ(segment
totals) on every segment operation. `PUT /api/ops/lines/:id/price` (0046) lets
staff set a manufacturer price or a typed override on any line — except a
composite parent, which it refused with a 409 (`composite_parent`): the
recompute would silently overwrite a human-entered figure on the next segment
edit, so the parent was carved out rather than made to share ownership with
the recompute.

## Decision

1. **One predicate decides ownership, and it already exists.**
   `price_calculated` (migration 0046, NULL = no override) is read at the top
   of `recomputeComposite`. Non-NULL: the parent's `line_total` is a human
   figure and the function stops writing it, while still writing everything
   else it derives (segment qty, coverage, status, review retirement). NULL:
   `line_total` is Σ(segments) as before. No new column, no new endpoint.
2. **The 409 is dropped.** `PUT /lines/:id/price` prices a composite parent
   like any other line. When Σ(segments) is NULL (an unpriced segment) and the
   line is a parent, `calculated` in the response/audit falls back to the sent
   `total` rather than reporting NULL — the "human set this" test (0046) still
   holds; this only fixes what gets reported alongside it.
3. **Clearing restores the CURRENT computed price, not the frozen one.**
   `total: null` on a composite parent now runs `recomputeComposite` before
   re-reading the row, so the restored figure is today's Σ(segments) — NULL if
   a segment is still unpriced. On a simple line clearing is unchanged
   (rate-card figure). A summation-priced legacy parent (`price_calculated`
   already NULL) stays a no-op to clear — no backfill.
4. **Clearing is endpoint-only, by owner ruling (D1, 2026-09-04).** No console
   control reaches a composite parent's clear path, and none is added in this
   feature. A wrong entry is corrected by entering the right price, the same
   as the pre-existing typed-override flow. `src/ops/ProjectRecord.tsx`
   `PriceCell`'s composite branch stays read-only and its revert link stays
   unreachable on this line kind; if reverting through the console ever bites,
   un-gating that one condition is the named upgrade path — not built now.
5. **The parent-PATCH re-arm rule is kept as-is, not touched by this
   feature.** `PATCH /lines/:id` on a composite parent already clears
   `price_calculated` and lets recompute restore Σ whenever the parent's own
   spec (qty/size) is edited — "a price agreed for a 1200mm window must not
   ride onto a 2400mm one." This feature's criteria cover segment operations
   only; the PATCH behaviour is pre-existing and stands unchanged.

## Consequences

- Ownership transfers cleanly between the manufacturer-price/override path and
  the recompute path through one predicate already in storage — no dual
  source of truth for "is this parent human-priced."
- A parent with an unpriced segment reports its just-entered total
  (`price_calculated`) rather than NULL, matching what staff just typed; the
  underlying Σ stays NULL until every segment is priced, so `status` derivation
  is unaffected.
- The only way to un-price a composite parent is the endpoint (`total: null`),
  same call staff already make to price it — no second UI surface to build,
  test, or secure.
- `src/ops/ProjectRecord.tsx`'s read-only composite branch is now a narrower
  gap than the backend it fronts; closing it is a one-condition change, not a
  redesign, whenever the owner asks for it.
