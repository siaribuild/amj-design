# ops2-composite-manufacturer-price

## The ask (owner, 2026-09-04)

Found while testing the Metadata tab: the Price panel is not clickable on a
composite parent. It used to be a door onto the price calculator.

The owner's correction, verbatim:

> that's wrong conceptually. The composite gives assembly instructions for the
> manufacturer and they will deliver, and price, that as a single unit.

and, on the two phases:

> parent's total is Σ(segments) - that's true when issuing a preliminary quote.
> It's price is sum of components.
>
> But when manufacturer reviews - they give a price for the whole unit.

## Actors and needs

**Ops staff pricing a project after AMJ has reviewed it.** AMJ quotes an
assembly as one deliverable — they build it, ship it and price it as one unit.
Ops needs to enter that one figure against the line it belongs to. Today they
cannot: the calculator is switched off on exactly those lines, and the only way
in is the segments, which AMJ never priced separately.

## What the code does today, and why

- `worker/routes/ops.ts:1449` — `PUT /lines/:id/price` refuses outright:
  `if (line.line_kind === "composite_parent") return c.json({ error: "composite_parent" }, 409)`
- `worker/lib/composite.ts:188` — `recomputeComposite` sets
  `line_total = Σ(segments)`, or `null` when any segment is unpriced. Seven
  call sites: split, merge, segment edits, segment repricing.
- `src/ops2/projects/LinePage.tsx` — `editable={!isOrder && line.lineKind !== "composite_parent"}`,
  so `OpenablePanel` gets no `open` and the panel is a static card.

The panel gate came from `ddc00129` (2026-08-31, a Codex finding) and was
correct at the time: *"a chevron on those was a door onto a Confirm that could
only fail"*. The endpoint refuses because `recomputeComposite` would overwrite
the parent anyway. So the missing chevron is a symptom; the disagreement is in
the model.

`CONTEXT.md` already carries the concept the code lacks — **Manufacturer
price**: *"The figure AMJ quotes for a whole line (quantity never multiplies
it)... replaced only by another manufacturer price or a typed override."* A
composite parent is a whole line. The guard contradicts the domain doc.

Note the Price panel IS the manufacturer-price surface: it takes AMJ's figure,
applies the uplift, and writes the result as `line_total` through the same
endpoint a typed override uses. The manufacturer's figure and the uplift are
deliberately not stored (owner, 2026-08-31: *"it's one price per line —
price"*).

## Grill conclusions (owner, 2026-09-04) — binding

1. **Segment prices become irrelevant once a manufacturer price is received.**
   They are not cleared and not deleted; they simply stop being the truth.
2. **`recomputeComposite` must not override a manufacturer-priced parent.** It
   keeps ownership of dimensions, quantity, coverage and status; it loses
   ownership of `line_total` once a price has been set.
3. **A split change does not void the price.** Owner: *"manufacturer's figure
   always wins, even it is old one."* Re-confirmation is something ops does
   with AMJ, not a state the platform models. My proposal to revert to the sum
   and flag for re-confirmation was rejected.
4. **Units show no price once the parent is priced.** Owner: per-unit price
   *"is just for automated quoting purposes, to build up a price for splits"*.
5. **No backfill.** Composites already priced by summation stay exactly as they
   are; a summed total is a valid preliminary price.
6. **`price_calculated` is the test, and it already exists.** Migration `0046`:
   *"NULL price_calculated means NO OVERRIDE. That is the whole test."* On a
   parent it records Σ(segments) at the moment of pricing. No new column.
7. **No label, no flag, no validation.** Owner: *"its ops job to know what they
   are doing, not for the platform to enforce ways of working, or infinitive
   number of checks and validations."* This rules out the "quoted" marker
   beside the total that I proposed, and any re-confirmation workflow.
8. **Segment prices keep being computed and stored** — they are the machinery
   that produces the preliminary estimate, and the fallback if a price is
   cleared. They stop being shown and stop summing into a priced parent.
9. **Clearing a parent's price reverts it to Σ(segments)** — the same meaning
   clearing already has everywhere else, and the way back from a wrong entry.
10. **One price fact per line**, unchanged: a typed override and a manufacturer
    price never coexist, and writing either clears the other.

## Shape agreed before the run

- Drop the `composite_parent` 409 from `PUT /lines/:id/price`
- `recomputeComposite` leaves `line_total` alone when `price_calculated` is set
- `PricePanel` becomes editable on composite parents
- Units stop showing prices once the parent carries a price
- No backfill, no flags, no re-confirmation workflow

## Out of scope

- The parser and its crops — a separate effort the owner closed on 2026-09-04.
- Any change to how the manufacturer figure or uplift are stored: they are not
  stored, deliberately, and that ruling stands.
