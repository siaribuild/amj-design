# 0020 — The attention filters are ordinary refinements; the attention axis is deleted

**Status:** accepted. Supersedes 0018 (the separate query axis) and 0019 (the
single-select panel group and `attentionStates()`).
**Design:** `docs/runs/ops2-attention-filters-in-panel/02-design.md`
**Grill:** `docs/runs/ops2-attention-filters-in-panel/00-ask.md` (P1–P6, owner-settled).

## Context

0018 gave the Attention prefilter its own single-select query axis
(`QueueQuery.attention`) because a refinement rides the current chip, and the
default `Needs us` chip cannot represent "awaiting payment" (those rows wait on
the customer). 0019 then made the axis re-appliable from the panel as a
single-select group. Building that revealed the merge that was never done:
`REFINEMENTS.ready` and `ATTENTION_FILTERS.readyToIssue` are the same predicate
under the same label, and the panel would have drawn "Ready to issue" twice —
once as a radio, once as a checkbox. The owner: "having both groups of filters,
then filters and then some a checkbox, some as radios — is over complication."

0018's chip objection is answered differently now, by the owner's own ruling
(D1, 2026-09-07): **leave the chip alone**. Every panel control counts what it
would leave, so "Awaiting payment" under `Needs us` reads a visible `0` before
it is pressed — a labelled zero, not a trap. Ticking it anyway is an honest
empty that names the active filters. If that chafes in daily use, the product
question is the default chip, never a special case in one tick handler.

## Decision

- The four attention predicates join `REFINEMENTS` as ordinary, independently
  tickable filters — six in one list, one counting rule, no second group, no
  radios: New submissions, Being priced, Ready to issue (the existing `ready`,
  not a copy), Awaiting payment, Unresolved lines, In production.
- `QueueQuery.attention`, `ATTENTION_FILTERS` and `attentionQuery` are deleted.
  The only filter axis is `refinements`. `selectProjects` loses its fourth pass.
- **Arrival stays a distinct act, not a distinct axis.** `?attn=<key>` names a
  REFINEMENT and maps to `arrivalQuery(key)` = `{ chip: "all", refinements:
  [key], search: "" }` — chip `all` so a card of N opens exactly N rows. Still
  one-shot: validated against the closed key set, stripped from the address,
  and ended by leaving the route (any navigation off `/ops2/projects` resets to
  `EMPTY_QUERY`). Attention's card counts use the same `arrivalQuery` through
  the same `selectProjects`, so a card and its filter agree by construction.
- The strip's Clear returns the whole query to `EMPTY_QUERY` (spec criterion 8)
  — the one exit, whether the filters arrived by card or by hand.
- The strip renders every active filter identically; the brand-toned prefilter
  pill goes with the axis.

## Amendment, at review (fix round 2)

This ADR first said `?attn=` "keeps its key strings (Attention's links are
untouched)", which left one card spelled `readyToIssue` where its refinement is
`ready`. Keeping it needed a `{ key, refinement }` mapping table whose other
three entries mapped a key to itself, a second `AttentionKey` union beside
`RefinementKey`, and a non-null assertion at the lookup. Both the ponytail and
architecture reviews named that as the deleted axis growing back as a naming
convention. So the card emits `?attn=ready`, `ATTENTION_ARRIVALS` is a list of
`RefinementKey`, and `AttentionKey` is derived from it. ONE axis, one key space,
one spelling — which is what this ADR decided; the retained key strings were the
last thing contradicting it.

## Consequences

- G7 (`ops2-attention`) becomes true: the URL names only filters the queue has
  as controls, and Clear is no longer a one-way door.
- The panel count beside a filter and Attention's card can differ whenever a
  chip, refinement or search is on; with nothing else on they agree (same
  function, same inputs). Pinned by test, per D1.
- `CONTEXT.md` §Attention arrival replaces §Attention prefilter.
