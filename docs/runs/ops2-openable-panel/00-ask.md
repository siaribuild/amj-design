# ops2 — the openable panel

Stage 0, 2026-08-29. Grilled with the owner; the frontier closed empty.
Stages 1 onward run under `conduct.mjs`.

---

## 1. The ask

Reported from testing the item-detail view:

> *"why this product panel has a chevron on the right-hand side indicating that
> it is a clickable component that leads to somewhere. The chevron is positioned
> on the top-right corner. should be middle-right instead."*

And, in the same breath, the reason this is not a CSS fix:

> *"such UX is and would be repeated in multiple places within ops2. For example,
> every panel in the itemDetail view will eventually be clickable and lead to a
> different screen. A standard, reusable component would make sense, no?"*

## 2. Actor and need

**Staff** (`CONTEXT.md`), in the **Estimator persona** — the reviewer working
down a line's detail. Their need is the one the chevron exists to serve: *tell me,
before I press, whether this block goes somewhere.* A block that opens a screen
and a block that merely states facts must not look the same, and they must not
look different in a different way on each surface.

No new actor. No `CONTEXT.md` change unless the component earns a term.

## 3. What is being extracted — the panel, not the arrow

**DECIDED (owner, Q1): the whole openable panel.**

The `WhyPanel` door is not a chevron. It is four things that have to agree:

- a **stretched invisible button** positioned over the panel, because a
  `<button>` wrapping a `<dl>` is invalid HTML and flattens every term/value pair
  into one accessible name (`WhyPanel.tsx` header states this);
- the **chevron**, as the visible affordance;
- a **focus ring drawn around the card** rather than around an invisible control;
- an **accessible name that says where it goes**, not merely that it is pressable.

Extracting the arrow alone would leave every future surface to re-solve the other
three. That is exactly how the hover-erases-the-leading-edge defect travelled
between the queue and the record: the fix existed, as a convention, and
conventions do not travel. The row's answer was `RowList`/`Row`
(ADR 0014); this is the same answer for the same reason.

## 4. Where the chevron sits

**DECIDED (owner, Q2): vertically centred, right-hand side, against the panel.**

Not against the header row, which is where it sits today — `.lp-panel__chev`
lives inside `.lp-panel__head` beside the `<h2>`, so it rides the title to the
top-right corner.

Centred on the panel it reads as *this whole block is pressable*, which is what
it is. The trade was named and accepted: on a tall panel the arrow sits well
below the heading.

## 5. Who uses it, and when

**DECIDED (owner, Q3): the component now; one consumer now.**

The owner will not enumerate the instances, and correctly:

> *"ops2 will be extended over time, so i won't be able to list all instances, nor
> that would be appropriate for reasons you well spotted. I'm just calling out
> that, for example, the same screen will have price panel leading to price
> update. Or product detail panel leading to product edit screen. And I can
> envision many more places within wider ops2 where similar presentation and
> behaviour would be expected and used."*

So the component is built for reuse and adopted by exactly one panel today — the
Why panel, the only one with somewhere to go. The named future consumers (price →
price update, product detail → product edit) adopt it when their destination
exists.

**A chevron on a panel that opens nothing is forbidden.** It is the defect this
effort has recorded four times, and `WHY-AC-41` was written for it before the
owner superseded it on different grounds (the detail now always exists, so the
door is always honest). The component must make "openable" a property a caller
opts into, never a decoration a panel wears by default.

## 6. Constraints carried from the ops2 record work

- **No new colours or states.** Owner, on a mock that proposed several: *"DO NOT
  introduce additional colours for borders for card states that does not exist at
  the moment."* This is an extraction plus a position change, not a restyle.
- **The focus ring stays around the card.** `lp-panel--door.is-focus` already
  draws it there; it is what makes the invisible button visible to a keyboard.
- **Accessibility is not the shortest diff.** The accessible name naming the
  destination is the behaviour, not a nicety — `whyCopy.ts` owns those words and
  a heading typed into JSX is a heading the copy ban never looked at.

## 7. Out of scope

- Making any other panel openable.
- Any change to what the Why panel or its detail *says* — settled and shipped.
- The chevron's own glyph.

## 8. Decisions needed

**None.** Q1–Q3 answered; the frontier closed empty.

Open to the architect, not the owner: where the component lives (`src/ops2/chrome/`
alongside `RowList`, `OpsPage`, `SidePanel` is the existing home for
cross-surface ops2 components), what it is called, and whether `.lp-panel`'s
existing door CSS moves with it or is superseded.
