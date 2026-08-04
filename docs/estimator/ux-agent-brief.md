# UX agent brief — the estimator list, parent/child grouping

**Status:** draft for owner review. Not yet dispatched.
**Why it is written down:** two previous agent rounds answered the wrong question
because the brief described a design the owner had not proposed. This one is
reviewable before it runs.

---

## The task, in one sentence

Decide how a composite opening and its units should be presented in the estimator
list, and defend the decision against the five goals below — then say what you
would do differently if you disagree with the framing itself.

---

## Product context

Route `/quote-project` in `E:\Projects\amj-website-design`. It is the primary
quote builder for a window and door manufacturer's **trade** customers.

The user is a **builder**, not a consumer. They upload a window schedule (a
drawing-office document listing every opening in a house), an AI parses it into
15–25 line items, and they check and correct that list before submitting it for a
quote. Their actual job at this screen is **reconciliation**: does this list
match the schedule I sent? They are frequently on a phone, on site, in daylight.

- An **opening** is one line the customer ordered. Most have no children.
- A **composite** opening is one opening built from 2+ frames we manufacture,
  called **units** or children (`W2` → `W2A`, `W2B`). A composite parent is not a
  product: it is the schedule line. Its units can be different products from each
  other. Nesting is exactly **one level deep**, always.
- **Every** row — a simple opening, a composite parent, and an individual unit —
  can be expanded to reveal a read-only panel: a scale drawing of the opening plus
  a specification list.
- Units are **always visible**. There is no collapsed state for the stack.

## The five goals (the owner's words, in substance)

1. Understand **at a glance** what each opening consists of.
2. Understand **which children belong to which parent**.
3. Must work on **mobile** (375px).
4. Must support **expanding** information for children **and** for parents
   without children.
5. Must support **highlighting lines with errors** — whether the error belongs to
   a lone parent, to a group, or to a single child.

Goal 5 has five distinct cases and all must be expressible:
lone opening flagged · whole group flagged (units do not sum to the opening, no
child to blame) · single child flagged · **parent and child both flagged, with
different states** · **parent clean but a child flagged**.

## What has already been settled — do not re-litigate

- **Fill cannot carry hierarchy.** Tinting children and leaving parents white
  makes two adjacent childless openings read as a pair. Alternating fill encodes
  banding, not nesting.
- **The tint already means three things** — column header strip, unit row, and
  expansion panel — so a childless opening that expands looks like a child row.
- **Indenting children to the right is correct.** The rows are not peers, so the
  offset is the information. Outdenting was rejected by the owner.
- **Bordered records do not desync columns.** Apply identical chrome to every
  record and to the header strip and alignment is exact — measured at 0px.
- **A record boundary must be drawn, not toned.** `--paper` against `--bone` is a
  ΔL\* of 1.6, described in the tokens as "deliberately barely there".

## Two live code facts, both verified

- `.quote-unitrow { background-color: var(--recessive) }` at `theme.css:668`
  **never applies** — `.quote-row { background-color: var(--paper) }` at `:714`
  is the same specificity, same layer, later in source. **Units render paper.**
  The rule is dead code stating an intent that does not ship.
- A unit's expansion is
  `quote-rowexp quote-unitexp bg-recessive border-t border-line px-3 sm:px-4 py-4`
  — the **same treatment as a parent's panel**, full width, and carrying **no
  `data-state`**. The two panels are indistinguishable except by position.

## The options on the table

All are drawn in `docs/estimator/grouping-mock-3.html`; earlier ones in
`grouping-mock-2.html` and `grouping-mock.html`. Read them.

| | what it does |
|---|---|
| **A** | children are rows indented inside the record; a unit's panel is a full-width band |
| **B** | each child is its **own card**, stepped in 26px, its panel inside that card |
| **C** | all children share **one** stepped-in card, divided by hairlines |
| **D** | children stay flush; only the child's **panel** steps in, left edge only |
| **E** | as D, but the child's panel is **contained on both sides** and bordered; a parent's panel stays full-bleed, so the two read as different objects |
| **F** | as B, but the child card is inset on the right too |

Measured costs already established:
- Containing a **panel** is free: `SpecPanel` has no columns. In E, parent and
  child action clusters both end at x=1225.
- Containing a **row** costs alignment: in F the child's controls end at 1214,
  11px left of every parent's.
- B and C need a **second track list** (`--qp-cols-child`) whose first track is
  shorter by exactly the shift, or tracks 2–6 drift.
- B and C move a child's **state stripe** off x=0, so a scan down the record's
  left edge finds flagged openings but misses flagged units.

## What the agent must deliver

1. **A choice**, named, from the options above or a better one of your own.
2. **Each of the five goals**, answered concretely — not "it helps with goal 2",
   but what a builder sees and what they conclude.
3. **All five error cases drawn in words** for your choice.
4. **375px**, specifically. Not "it adapts".
5. **What you reject and why**, including anything of the owner's, plainly.
6. **The strongest argument against your own choice**, and why you make it anyway.
7. **What you would test with a real builder** to settle what analysis cannot.

## How to judge

- Read the code and open the mocks. Do not reason from the descriptions alone.
- The owner has been right twice where a review was wrong, and wrong at least
  once. **Do not defer to him and do not reflexively contradict him.** Judge the
  drawings.
- Prefer the cue that survives a cheap phone in daylight over the cue that is
  elegant on a designer's monitor.
- A cost is only an argument if it is a cost of the *idea*, not of a quick mock.
- Do not modify any files.

## Open questions the agent should form a view on

1. **Paper or recessive units?** `:668` is dead. Restore it or delete it — but
   the answer changes what every other cue has to do.
2. **Are two units ever open at once?** If yes, per-unit termination (B) becomes
   materially more valuable.
3. Should a **parent lose its stripe** when only a child is at fault? It changes
   whether a left-edge scan counts blocked *rows* or blocked *openings*.
4. Is a **bounded record** worth its vertical cost when 16 of 19 openings have no
   internal structure to bound?
