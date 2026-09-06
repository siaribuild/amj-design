# 0018 — The Attention prefilter is a fourth query axis, not a funnel refinement

**Status:** superseded by 0020 — the axis is deleted; the four filters are ordinary refinements.
**Full design:** `docs/runs/ops2-attention-prefilter/02-design.md` §8.1

## Context

An Attention destination link (`?attn=awaitingPayment` etc.) needs the Projects
queue to land already narrowed to that link's set. `src/ops2/projects/queue.ts`
already has three query axes — chip, refinements, search — feeding
`selectProjects`. The spec's assumed reading (product-manager, criteria 4 and
10) was to add the four attention keys as funnel refinements alongside the
existing ones.

## Decision

The prefilter is its own axis on `QueueQuery`, consumed once from `?attn=` and
cleared on any plain re-entry — not a refinement, and not added to the
permanently-visible chip/refinement controls.

Refinements were rejected because they fail criteria 4 and 10 structurally,
not stylistically: a refinement rides the current chip, so "awaiting payment"
(rows waiting on Customer) under the default `us` chip is an empty
intersection. Fixing that by having the link also set the chip means
untoggling the refinement strands the reader on `All`/`Customer`, not the
`Needs us` default criterion 10 names — and special-casing the untoggle to
restore `EMPTY_QUERY` would hijack the pre-existing `ready` refinement's
semantics for manual users. There is no reading of "refinement" that satisfies
both criteria at once.

Refinements were also rejected on a second, independent ground: they add three
permanently-visible ops controls nobody asked to toggle manually, against the
owner's 2026-09-01 default-NO ruling on unrequested ops controls
(`ops-accumulates-unrequested-features`). Even if the criterion-4/10 conflict
had a fix, standing controls for a link-only entry point would still be the
wrong shape.

## Consequences

- `selectProjects` stays the one selector; the prefilter is one more filter
  pass ahead of chip/refinements/search, never a parallel code path.
- The four Attention destination project counts derive from the same queue
  rows through `selectProjects(rows, attentionQuery(key)).length` — count and
  list can't disagree, because both read the one function.
- No new ops control is added to the Projects funnel UI. The prefilter is
  reachable only by arriving with `?attn=`; there is nothing to toggle by hand.
- One-shot consumption + reset-on-re-entry (not address-as-state) was chosen
  alongside this for a related reason — criterion 11's back-from-a-record
  route — recorded in the design, not repeated here.
