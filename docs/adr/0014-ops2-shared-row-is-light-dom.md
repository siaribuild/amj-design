# 0014 — ops2's shared list row is light DOM, not IonItem

Date: 2026-08-28 · Status: accepted · Owner ask: *"the component is the same, the
content within it differ … other areas of Ops2 will have the same component."*

## Decision

The one row component and one list container over ops2's three list surfaces —
the queue's phone cards, the record's line list, the line page's unit rows —
are a plain `<li>` + `<button>` (`src/ops2/chrome/RowList.tsx`,
`src/ops2/styles/rows.css`), not `IonItem`/`IonList`. The queue's card leaves
`IonItem`; its ripple is replaced by one `:active` wash.

## Why

1. **The invariant is structural only in light DOM.** The defect this fixes
   (hover erasing the leading edge) is a two-element paint split. On a plain
   button, wash, edge and selection tint are all computed on `.ops2-row__open`
   by construction. `IonItem` satisfies that only by suppressing its own hover
   overlay and repainting through `::part(native)` — the convention the queue
   already carried (`projects.css:376-384` before this change) and the record
   never inherited, which *was* the defect.
2. **`docs/design/ops2-ionic-boundary.md` §1.1** — disqualifier 2 (behavioural
   contradiction: the hover overlay vs the edge) and disqualifier 3 (dense row
   grammar under token control; the openings index is its named example) both
   apply. This ADR extends the citation `rows.tsx` already carried for the
   card's inner grammar to the whole row.
3. IonItem-everywhere would have changed the two owner-accepted surfaces
   (chevron/ripple on record and unit rows, or a `detail` mode flag to suppress
   them); the plain row changes only the queue card, the change the spec
   flagged for veto (`docs/specs/ops2-record-feedback.md` §13) and the owner
   accepted by sign-off.

## Consequences

- The desk `<table>` stays a table (FB-AC-N1); it is not built from this row.
- `Row` carries exactly two props naming grammar differences (`edge`,
  `selected`); the queue's chevron is content the queue passes as children,
  styled once by `.ops2-row__chev` in `rows.css` so a future navigating surface
  reuses the class rather than redrawing the arrow. A third grammar prop is a
  reopened decision, not an addition.
- Selection wins the edge on a selected+flagged row; the flag keeps its words
  (the `needs review` badge, and the canvas's reasons panel). Ruling recorded
  in `docs/design/ops2-record-feedback.md` §3.1.
