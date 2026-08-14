# Removing quote revisions — "a quote is a quote"

**Status:** APPROVED, not started. Survey complete; no code written.
**Owner decision:** 2026-08-14.

## The decision

> *"I'm not interested in having revisions. A quote is a quote. Once updated it
> is still the quote — no one is going to look into the old version of it."*

There is one quote per project. It is updated in place. There is no version
history, no R-numbers, and nothing to switch between.

Two readings were considered and the second was chosen:

- **A — one revision row, overwritten.** Keep `quote_revision`, never create a
  second row. Small and safe, but keeps the snapshot copy, so composite units
  stay flattened and issued/order drawings stay wrong.
- **B — no snapshot at all (CHOSEN).** The quote IS the project's lines.
  "Issued" is a state that locks editing. The one freeze that legally matters
  happens at **acceptance**, into the order.

## Why B is coherent, not just smaller

**The lock on an issued quote is already state-based, not copy-based.**
`EDITABLE` in `src/ops/ProjectRecord.tsx` excludes `issued`, so ops cannot edit
lines once issued whether or not a snapshot exists. The `revision_line` copy is
not what makes the quote stable — the status is.

**It dissolves the composite problem rather than fixing it.** Today a split
opening survives estimation and pricing intact and then collapses at issue:
`issueRevision` selects `WHERE parent_line_id IS NULL` (worker/lib/revisions.ts)
and `revision_line` has nowhere to put a unit. So the issued quote and the order
show the parent's pre-split frame — not what gets made. With everything reading
`quote_line`, which already carries units, drawings and unit rows work with no
adapter, and one list component fits every stage.

## What the survey found (verify before trusting; these are the load-bearing facts)

| Fact | Where | Consequence |
|---|---|---|
| `recommendation_outcome.quote_revision_id` is **NOT NULL REFERENCES quote_revision(id)** with **UNIQUE(quote_revision_id, quote_line_id)** | `migrations/0022` | Revisions are the PRIMARY KEY of the AI learning loop. The table must be rebuilt and re-keyed on `(project_id, quote_line_id)`. |
| `"order".accepted_revision_id` is **NOT NULL REFERENCES quote_revision(id)**, with a **UNIQUE index** | `migrations/0001`, `0005` | That index is the acceptance race guard — it is what makes two simultaneous accepts produce exactly one order. Its replacement is a UNIQUE index on `project_id`, which also decides that a project has at most one order. |
| `revision_line` columns: `id, revision_id, external_ref, room_label, product_snapshot_json, dims_json, options_json, qty, line_total` | pragma | No parent/segment columns — units cannot be stored. |
| `order_line` columns: `id, order_id, external_ref, product_snapshot_json, qty, line_total` | `migrations/0001` | Thinner still: loses `room_label` too. |
| `issueRevision` selects `parent_line_id IS NULL` | `worker/lib/revisions.ts:132` | Units are dropped at issue, not at order creation. |
| ~43 references to `quote_revision`/`revision_line` across `worker/` and `src/` | grep | Plus 6 migrations, `scripts/db/seed.sql`, `clear.sql`, and several test files. |

Concentration: `worker/lib/revisions.ts` (16), `worker/routes/ops.ts` (11),
`worker/routes/quote.ts` (8), `worker/lib/orders.ts` (6),
`worker/lib/ai/examples.ts` (5), `worker/routes/projects.ts` (3).

## Sequence

Steps 1–3 **must land as one commit** — acceptance is broken in between.

1. **`issueQuote(projectId)`** replaces `issueRevision`. Same guards (lines
   priced, delivery settled, valid state); sets `status_internal='issued'`,
   `status_customer='quote_issued'` and an issued-at stamp. No copy. Issued
   totals are computed from `quote_line` + `delivery_amount` at read time rather
   than duplicated, because lines cannot change while issued.
2. **`createOrderFromProject(projectId)`** replaces `createOrderFromRevision`.
   Reads `quote_line` parents **and their segments**; claims the PROJECT (state
   transition) instead of the revision; writes the full order snapshot. Keep the
   C8 invariant: the order total must include delivery, never re-derive it from
   lines alone (see T-B23 in `scripts/tests/delivery.test.mjs`).
3. **Repoint every read** off `revision_line`: customer quote view acts on the
   project, `acceptRevision` becomes `acceptQuote`, ops workspace loses the
   version tabs entirely (nothing to switch between), order reads carry units.
4. **Re-key learning.** Rebuild `recommendation_outcome` on
   `(project_id, quote_line_id)`; same for `learning_outbox` and
   `learning_example`. Must not silently drop outcome capture — that is the AI
   feedback loop, and `decision IN ('accepted','adjusted','no_ai_proposal')`
   still has to mean something.
5. **Drop** `quote_revision` and `revision_line`; delete
   `worker/lib/revisions.ts`; clean `seed.sql` / `clear.sql`; remove the
   R-number vocabulary from remaining comments.
6. **The UI asks then fall out almost free** (these were the original request):
   - ops version tabs gone — there is nothing to switch between
   - R-numbers gone from all customer copy (dashboard pill, quote page, order)
   - delete `LineList`; `OpeningList` renders quote and order as it already
     renders the builder and the pending view
   - one shared totals panel at every stage, carrying the taxable-supply GST
     rule (`src/data/gst.ts`), deposit row only before acceptance
   - drop the 50/50 payment panel from the order summary band — the order
     journey already carries that information

## Migration 0047, drafted and then withdrawn

An additive migration extending `order_line` with `room_label`, `dims_json`,
`options_json`, `parent_line_id`, `segment_seq`, `qty_per_parent`, `line_kind`,
`composite_axis`, `selected_variant_id` and an index on
`(parent_line_id, segment_seq)` was written and applied locally, then **deleted
unapplied to the repo** — it has no consumer until step 2, and this codebase
deleted two never-wired scaffolds on 2026-08-14 for exactly that reason. Recreate
it as part of step 2 with whatever number is then free.

⚠️ The local dev database was reset afterwards so no orphan migration record
remains. If a `0047_order_line_full_snapshot.sql` record survives anywhere,
`ALTER TABLE … ADD COLUMN` will fail as a duplicate.

## Owner decisions recorded along the way

- **Order snapshot carries everything needed to build it** — units, room,
  options, dims. Production must be able to see a split opening's units.
- **Segments only** for price overrides on a composite; a parent's total stays
  Σ(segments) (already implemented, 0046).
- **Re-issue after a customer requests changes** is an accepted edge case, not
  designed for now: human review precedes issue, so post-issue change is
  unlikely, and it carries dependencies (deposit recalculation, an order already
  in production). Additions may be better handled as a separate order — which
  the one-order-per-project index in step 2 would need revisiting to allow.
- **Nothing is live yet** ("to be fully cleared prior to going to market"), so
  no production data has to survive this.

## Risk to keep stated

With no frozen copy, a customer accepting from an older email after ops
re-opened and re-priced would accept the current figures rather than the ones
they were sent. Judged acceptable: human review precedes issue, and the state
machine prevents edits while a quote is issued, so the window only opens if a
quote is deliberately re-opened.
