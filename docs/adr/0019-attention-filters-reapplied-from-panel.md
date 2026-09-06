# 0019 — The attention prefilter is re-appliable from the funnel panel

**Status:** superseded by 0020 — no single-select group, no `attentionStates()`; the four are ordinary refinements in one list (grill P1/P2).
**Amended 2026-09-06:** panel selection **composes** — the owner overruled this ADR's
original force-reset decision (grill P6, `docs/runs/ops2-attention-filters-in-panel/00-ask.md`).
**Full design:** `docs/runs/ops2-attention-filters-in-panel/02-design.md`

## Context

ADR 0018 made the attention prefilter its own query axis and, under the
owner's default-NO ruling on unrequested ops controls, gave it no manual
control: reachable only by arriving with `?attn=`. In use, the four filters
turned out to name views worth returning to, and Clear became a one-way door —
the only way back was leaving Projects for Attention. It also broke the
`ops2-attention` G7 contract: the URL could express a state no control on the
queue could produce. The owner asked for the way back (grill P1, this run) —
so this is a requested control, not an accumulation.

The first draft of this ADR chose force-reset in the panel (identical to
arrival) with a criterion making the discard visible. The owner rejected it:
*"if UX needs explanations on it to understand — that's bad UX!!"* The tell was
already in the panel: every control in it counts what it would **leave**, given
everything else that is on. A control that instead discards the reader's other
controls is a second rule, and a second rule in one panel is the thing that
needs a paragraph. A filter filters.

## Decision

The four attention filters appear in the Projects funnel panel (`FilterSheet`)
as a single-select group, each a `QueueControl` from `attentionStates()` in
`src/ops2/projects/queue.ts`. Selecting an inactive one sets
`QueueQuery.attention` to its key and **touches nothing else** — chip,
refinements and search stay as they were. Pressing the active one clears it to
`null`; pressing another replaces it (`AttentionKey | null`, single-select,
unchanged). Each control's count is `selectProjects` over the query it would
produce — the same one-selector contract the chips and refinements already
obey.

Arrival is unchanged and is not the same act: `?attn=` from an Attention card
still applies `attentionQuery(key)` — chip `all`, refinements and search
cleared — because the reader has not set anything in this view yet, so a card
of N opens exactly N rows.

Force-reset-in-panel is rejected (it was this ADR's first decision): it is a
second counting rule in a panel that has taught the reader one. The "same
label, two numbers" objection inverts once compose is understood — the panel
count answers "what would this leave, here, now"; Attention's card answers
"what exists" — the same relationship the `Needs us` chip already has to `All`.

## Consequences

- ADR 0018's axis model, `selectProjects` as the one selector, and the
  refinement rejection all stand unchanged. Only its consequence "there is
  nothing to toggle by hand" is superseded.
- `?attn=` handling is untouched: still one-shot, still stripped, still reset
  on any re-entry — a panel-applied filter resets on re-entry identically, and
  panel selection never writes the URL.
- The funnel bubble counts an active attention filter as one active filter,
  so a filtered-empty list stays distinguishable from an empty queue.
- The panel's count beside a filter can differ from Attention's card whenever
  a chip, refinement or search is on; with nothing else on the two agree by
  construction (same function, same inputs).
- `CONTEXT.md` §Attention prefilter records the arrival/panel split.
