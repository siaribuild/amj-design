# ops2-attention-filters-in-panel

The four Attention prefilters must be **selectable from the Projects filter
panel**, not only reachable by pressing a card on Attention.

The owner, on the shipped feature:

> "Now those filters that lead from Attention into Projects pre-filtered, need to
> be selectable from the filter icon/panel in the Projects. Now if I clear the
> pre-filter, I can't go back into the same view without leaving Projects for
> Attention and clicking on the card there."

## Actors and needs

**The owner and the estimators**, working *inside* the Projects queue. Not
arriving at it — already there, narrowing and re-narrowing while they work.

The prefilter turned out to be a view worth returning to: "the two invoiced
orders", "the one that can be issued". Today that view is a **one-way door**. It
can be entered only from another destination, and clearing it destroys it — the
only way back is to leave Projects entirely, go to Attention, and press the card
again. A filter you cannot re-apply from the surface it filters is a filter that
punishes you for using Clear.

## This closes a rule the previous run broke

`ops2-attention`'s G7 settled the URL grammar in one sentence:

> **The URL names a filter the queue ALREADY HAS AS A CONTROL** — one of the
> three wait chips, or one of the funnel's refinements — and nothing else. It is
> not a query language.

with the reason stated at the time: *"the moment it can express a state no
control can show, it can express one no control can UNDO: a filtered list with no
chip lit, no funnel bubble, and no way back to everything except retyping the
address."*

`?attn=` is exactly that. It names a control the funnel does **not** have. The
strip does render the active filter's name, so the state is visible and clearable
— the "no way to undo" half was avoided — but the "no way to RE-DO" half was not
foreseen and is what the owner hit. This run makes the rule true rather than
aspirational.

## Settled — conclusions, not options

- **P1 — ONE LIST OF FILTERS. NO SECOND GROUP, NO RADIOS.** The four join the
  panel's existing refinements as ordinary, independently tickable filters. There
  is no separate "attention" section, no single-select axis, and nothing in the
  panel behaves differently from anything else in it.

  This replaces a first attempt that added them as their own radio group beside
  the checkboxes. The owner:

  > "I think having both groups of filters, then filters and then some a
  > checkbox, some as radios — is over complication"

  He is right, and the proof was already in the code. `REFINEMENTS` has
  `{ key: "ready", label: "Ready to issue", test: (r) => r.issuable }`
  (`queue.ts:145`) and `ATTENTION_FILTERS` has
  `{ key: "readyToIssue", label: "Ready to issue", test: (r) => r.issuable }`
  (`queue.ts:169`) — **the same predicate under the same label**. That mock would
  have drawn "Ready to issue" twice in one panel, once as a radio and once as a
  checkbox. Two lists whose members overlap is not a design, it is a merge that
  was never done.

  So the panel's filters become, in one list:

  | filter | predicate |
  |---|---|
  | New submissions | `statusCustomer === "submitted"` |
  | Being priced | `statusCustomer === "under_review"` |
  | Ready to issue | `issuable` — the existing `ready`, not a copy |
  | Awaiting payment | `orderStage` in the two invoiced stages |
  | Unresolved lines | `unresolved > 0` |
  | In production | `phase === "Production"` |

- **P2 — THE `attention` AXIS IS DELETED, NOT RENAMED.** `QueueQuery.attention`,
  `ATTENTION_FILTERS`, `attentionQuery` and `attentionStates` all go. There is one
  filter axis: `refinements`. Keeping a second field that means "a refinement, but
  special" is the over-complication in the model rather than in the panel.

- **P3 — TICKING TWO THAT CANNOT BOTH BE TRUE IS FINE, AND VISIBLE BEFORE YOU
  TICK.** `New submissions` + `Being priced` is empty, because a project is one
  or the other. This is not a new hazard: `queue.ts` already calls `Needs us` +
  `In production` "an honest empty", and every control carries the count it would
  LEAVE — so the reader sees `0` on the control before pressing it, and
  `emptyStateFor` already names the active filters and offers the way out.

- **P4 — ONE SELECTOR, STILL.** Counts come from `selectProjects` over the rows in
  hand. Attention's card counts use the same function with a single refinement, so
  a card and its filter agree by construction.

- **P5 — ARRIVAL IS UNCHANGED IN BEHAVIOUR.** `?attn=<key>` still applies on
  arrival, still strips itself, still resets on leaving and returning, and a card
  of N still opens exactly N. Internally it now sets `refinements: [key]` with
  `chip: "all"` rather than a bespoke field. `ops2-attention-prefilter`'s criteria
  1-5, 10, 11 and 16 — including the mutation-proved one — stay green, and the
  four browser tests that assert exact fixture refs are the proof.

- **P6 — THE FUNNEL'S BUBBLE COUNTS THEM, because they are refinements.** No
  special case; the existing count is already "how many refinements are on".

## Facts the pipeline should not rediscover

- `src/ops2/projects/queue.ts` already owns `ATTENTION_FILTERS` (the four, with
  their predicates and labels), `attentionQuery`, `attentionFromSearch`, and
  `selectProjects` honouring `query.attention`. `QueueQuery.attention` is at
  line ~95. What does **not** exist is an `attentionStates()` beside
  `chipStates()`/`refinementStates()`.
- `src/ops2/projects/FilterSheet.tsx` renders `controls` (the refinements) only —
  it has no knowledge of the attention axis today.
- `ProjectsPage` already renders the active attention filter in the
  `queue-active-filters` strip as `.pq-flag[data-tone="brand"]`, and Clear
  already returns to `EMPTY_QUERY`.
- The `?attn=` apply/reset lives in two location-keyed effects in `ProjectsPage`.
  **Do not move the reset back onto `ionViewWillEnter`** — it was measured not to
  fire on rail-back, which cost three failed fixes; the comments there record it.
- Fixtures: `PA_PF` in both `scripts/tests/ops2-attention.test.mjs` and
  `scripts/tests/web/ops2-attention.spec.ts` gives counts 1/2/1/2 with `PF`
  matching no predicate — non-empty, pairwise non-identical, so a broken filter
  cannot pass by coincidence.
