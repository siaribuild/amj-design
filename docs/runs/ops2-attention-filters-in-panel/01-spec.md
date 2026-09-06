# Spec — ops2 Attention filters in the Projects filter panel

Stage 0 grill: run, conclusions in `00-ask.md` (P1–P6). Those are decided and carried
here verbatim in substance; this spec does not re-open them.

Owner decisions: none open. D1 (chip interaction) answered 2026-09-07 — **leave the chip
alone**; the count on the control is what makes that safe, and it is pinned by a test
(criteria 11–12) rather than assumed.

## 1. Problem, and the actor it serves

**Actor: the owner and the estimators, already inside the Projects queue** — narrowing
and re-narrowing while they work, not arriving fresh.

In their terms: *"Those filters that lead from Attention into Projects pre-filtered need
to be selectable from the filter icon/panel in Projects. If I clear the pre-filter, I
can't go back into the same view without leaving Projects for Attention and clicking on
the card there."*

The four Attention prefilters turned out to be views worth returning to — "the two
invoiced orders", "the one that can be issued". Today each is a one-way door: enterable
only from another destination, and pressing **Clear** destroys it. The only way back is
to leave the surface being filtered. A filter that punishes you for using Clear is a
filter you learn not to use.

This also makes true a rule the previous run broke: the URL may only name a filter the
queue *already has as a control* (`ops2-attention` G7). `?attn=` named a control the
funnel did not have.

## 2. Acceptance criteria

Terminology: **filter** = a checkbox in the funnel panel (what the code calls a
refinement); **chip** = one of the three wait chips on the queue surface; **strip** =
the `queue-active-filters` row above the list; **bubble** = the funnel icon's count.

### The panel

1. **Given** Projects with no filters applied, **when** staff open the funnel panel,
   **then** exactly six filters render, in this order, all as ordinary checkboxes in one
   list — New submissions, Being priced, Ready to issue, Awaiting payment, Unresolved
   lines, In production — with no second group, no heading separating them, and no radio
   control anywhere in the panel.
2. **Given** the panel is open, **when** staff read it, **then** "Ready to issue" appears
   exactly once (the existing `ready` refinement, `test: (r) => r.issuable`, not a copy).
3. **Given** any set of rows and any current query, **when** the panel renders, **then**
   each filter's count equals `selectProjects(rows, <current query> + that filter).length`
   — the count the control would leave — computed by the one selector, for all six alike.
4. **Given** a filter whose count under the current query is 0, **when** staff read the
   panel, **then** that 0 is visible on the control before it is pressed.

### Selecting and clearing

5. **Given** the panel is open with nothing on, **when** staff tick "Awaiting payment",
   **then** the list shows exactly the rows whose `orderStage` is one of the two invoiced
   stages, the strip shows that filter's name, and the bubble reads 1.
6. **Given** "Awaiting payment" is ticked, **when** staff untick it in the panel,
   **then** the list returns to the pre-tick view and the bubble decrements by 1.
7. **Given** a chip, a search term and one filter are all on, **when** staff tick a
   second filter, **then** the result is the intersection — the new filter narrows what
   is already on and moves neither the chip nor the search.
8. **Given** any combination of filters is on, **when** staff press Clear on the strip,
   **then** the query returns to `EMPTY_QUERY`, the bubble reads 0, and every filter in
   the panel is unticked.
9. **The point of the feature.** **Given** staff arrived from an Attention card, then
   pressed Clear, **when** they open the panel and tick that same filter, **then** they
   see the same rows the card opened (with nothing else on) without leaving Projects.

### Honest empties, and the labelled zero that makes them safe

10. **Given** the panel is open, **when** staff tick both "New submissions" and "Being
    priced", **then** the list is empty and the empty state names both active filters and
    offers the way out.
11. **Given** the `Needs us` chip is on and rows exist whose `orderStage` is invoiced,
    **when** the panel renders, **then** "Awaiting payment" reads exactly `0` on the
    control — and **given** the `All` chip is on with the same rows, **then** the same
    control reads its true non-zero count. *(Owner ruling D1: this labelled zero is the
    whole safety of "leave the chip alone", so it is pinned by test, never assumed.)*
12. **Given** a filter reading `0` under the current chip, **when** staff tick it anyway,
    **then** the list renders as an honest empty naming the active filters with the way
    out — the chip is not moved, not widened, and not reset.

### Arrival from Attention is unchanged in behaviour

13. **Given** an Attention card showing N for key `k`, **when** staff press it, **then**
    Projects opens showing exactly N rows.
14. **Given** arrival via `?attn=<k>`, **when** the page has loaded, **then** the query is
    chip `all`, `refinements: [<the filter for k>]`, search cleared — and `?attn` is gone
    from the address.
15. **Given** arrival via `?attn=<k>`, **when** staff navigate away by the rail and back
    into Projects, **then** no filter is applied (`EMPTY_QUERY`) and the bubble reads 0.
16. **Given** `?attn=` carries an unknown key, **when** the page loads, **then** no filter
    is applied, the param is stripped, and the unfiltered queue renders.
17. **Given** the fixture set `PA_PF` (counts 1/2/1/2, `PF` matching no predicate), **when**
    each of the four arrival keys is applied, **then** the exact expected refs render —
    the four browser tests and the mutation-proved node test of
    `ops2-attention-prefilter` criteria 1–5, 10, 11, 16 stay green.

### The model

18. **Given** the source after this change, **when** `src/ops2/projects/` is searched,
    **then** `QueueQuery.attention`, `ATTENTION_FILTERS`, `attentionQuery` and
    `attentionStates` do not exist; the only filter axis is `refinements`.
19. **Given** an Attention card for key `k` and the Projects panel with nothing else on,
    **when** both counts are computed, **then** they are equal — both from
    `selectProjects` over the queue's own rows.

### Abuse cases (staff-only surface, no new data)

20. **Given** any panel selection or arrival key, **when** the queue is filtered, **then**
    no new API request is made and no filter value is sent to the Worker — filtering
    happens over rows already in hand.
21. **Given** a session that is not Staff (customer or manufacturer partner), **when** it
    requests the ops2 Projects queue data, **then** it is refused exactly as before this
    change and no project rows are returned — this feature adds no endpoint, no parameter
    and no widening of the existing authorization.

## 3. Out of scope

- Any filter beyond the six listed. No new predicates, no "saved views".
- Persisting filter state across visits or in the URL — non-persistence is unchanged.
- Changing the wait chips: their number, labels, predicates or default. *(If ticking
  "Awaiting payment" under `Needs us` chafes in daily use, the owner's answer is that the
  question becomes the DEFAULT CHIP — a separate product decision, never a special case
  in one control's tick handler.)*
- Any hint, nudge or "show all" affordance on the empty state beyond what `emptyStateFor`
  already renders.
- The Attention destination's layout, cards or counts (behaviour must stay identical).
- Server-side filtering or pagination.
- Renaming the `?attn=` keys or the Attention links that carry them.
- The record's Attention filter (the pill) — a different concept, untouched.

## 4. Assumptions

- `ASSUMED:` The `?attn=` key strings stay exactly as today and map internally to the
  matching refinement key (`readyToIssue` → the existing `ready`). Attention's links are
  not edited.
- `ASSUMED:` The four filters lose their distinct brand-toned pill in the strip and render
  identically to every other active filter — P1's "nothing in the panel behaves
  differently" carried through to the strip.
- `ASSUMED:` `EMPTY_QUERY` is unchanged, including its chip; Clear's behaviour is
  unchanged.
- `ASSUMED:` The architect updates `CONTEXT.md`'s **Attention prefilter** entry, which
  still describes a fourth single-select query axis and cites ADR 0018/0019; after this
  change there is no attention axis. An ADR superseding 0019 is the architect's call.

## 5. Sizing

One area (`src/ops2/projects/`), no schema, no API, no migration. Normal single-run
pipeline feature; wall-clock expectation is one session, not a day.
