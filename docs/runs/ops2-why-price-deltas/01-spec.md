# 01 — Spec: price deltas on the "Why this product?" ladder

Grill: conducted with the owner 2026-09-02 (`00-ask.md`). Its decisions D1–D5 and
its out-of-scope list are binding on this spec.

## 1. Problem and the actor it serves

**Actor: the Estimator persona** (`CONTEXT.md` §Actors) — the person auditing the
platform's recommendations at the human review gate. A persona with needs,
never an RBAC role; nothing about authorization derives from it. Today performed
by an owner.

In their own terms:

> "I can see two or more products that met the thermal requirements, yet only
> one of them was selected. The screen tells me what was picked and how each
> candidate did on thermal, but it cannot tell me why the other one lost.
> Price tells the full story why. Without it I can't answer the one question I
> arrive with — was this worth it?"

The figure that closes that sentence already exists on disk:
`CandidateOutcome.price.deltaToSelected` (`src/data/recommendation.ts`) — the
candidate's total minus the selected total; negative means cheaper than the
pick, `0` on the pick, `null` when either side is unpriced. The ops "Why this
product?" detail simply does not carry it, because an earlier ruling (R10)
deliberately kept price out of the `candidateOf` allow-list. The owner has
reversed that ruling.

**The money is an explanation, not a comparison.** This is not a product
selection surface. The delta explains a loss that is already displayed; it does
not invite a switch. R28 still holds: the only interactive element on the
detail is back.

**One number.** Ops shows a single price figure. No GST/tax wording, no basis
switch, no second figure for one fact. A candidate's price comes from the same
`computePrice` path over the same rate cards that produces `quote_line.line_total`,
and rate-card prices are authored tax-inclusive. Nothing here is converted,
grossed up or reconciled — arithmetic added to this feature is a defect.

## 2. Acceptance criteria (Given–When–Then)

### Display on the ladder

1. **Given** a recorded recommendation whose chosen candidate and at least one
   runner-up are both priced, **When** an estimator opens the line's
   `…/why` detail, **Then** each listed candidate row shows a price delta
   derived from that candidate's stored `deltaToSelected`.

2. **Given** a runner-up whose stored `deltaToSelected` is a positive number
   (e.g. `100`), **When** the detail renders, **Then** its row reads the amount
   as dearer than the pick with an explicit `+` sign (e.g. `+$100`).

3. **Given** a runner-up whose stored `deltaToSelected` is negative
   (e.g. `-200`), **When** the detail renders, **Then** its row reads the amount
   as cheaper than the pick with an explicit `-` sign (e.g. `-$200`).

4. **Given** the chosen candidate (its `deltaToSelected` is `0`), **When** the
   detail renders, **Then** its row does not present a `+$0`/`-$0` delta; it
   presents the chosen row's price statement only. `ASSUMED:` the chosen row
   carries no delta figure at all rather than a literal `$0`; exact wording and
   placement are the UX stage's (D5).

5. **Given** a listed candidate whose stored `deltaToSelected` is `null`
   (either side unpriced), **When** the detail renders, **Then** its row shows
   `$---` — never `$0`, never a blank cell, never a hidden row.

6. **Given** a recommendation record saved before price was carried on the
   candidate contract (no price object at all on the outcomes), **When** the
   detail renders, **Then** every candidate row shows `$---` and the detail
   otherwise renders exactly as it does today (no error, no empty panel).

7. **Given** any candidate row on the detail, **When** it renders with a delta,
   **Then** the row carries no GST, tax, inc/ex/incl/excl wording, no basis
   switch and no second money figure — one number per candidate.
   *Verifiable as a test asserting the rendered text of the detail matches none
   of `/gst|tax|\binc\b|\bex\b|inclusive|exclusive/i`.*

8. **Given** a delta is displayed, **When** the row renders, **Then** it carries
   no date stamp, "as at selection" caption or staleness hedge of any kind.

### Ladder membership is unchanged

9. **Given** a run with excluded candidates and/or `withheldIncomplete`
   entries, **When** the detail renders, **Then** the rows shown are exactly the
   ones shown today — the chosen candidate plus up to four next-best runners-up
   by rank — and no excluded or withheld candidate appears because it now has a
   price.

10. **Given** the recorded recommendation, **When** the detail is composed,
    **Then** the thermal figures, tier verdicts, rank and the 5% band naming
    render exactly as today (the 5% band is named, never paraphrased).

### The data contract

11. **Given** the candidate allow-list (`candidateOf`), **When** it maps a
    stored outcome for the ops surface, **Then** it adds the price fields
    explicitly, field by field, and never spreads the stored outcome.
    *Verifiable: a test feeds an outcome carrying `exclusions` and a `learned`
    payload and asserts neither key is present on the mapped result, while the
    price fields are.*

12. **Given** the money contract comment at `src/data/recommendation.ts` that
    today claims the engine's price basis is "GST-free", **When** this feature
    lands, **Then** the comment states the true basis (the same tax-inclusive
    rate-card figure as `quote_line.line_total`, no GST arithmetic performed by
    `computePrice`).

13. **Given** a candidate priced by the engine, **When** its delta is rendered,
    **Then** the rendered figure equals the stored `deltaToSelected` with no
    multiplication, gross-up, rounding change or re-pricing applied.
    *Verifiable: a stored delta of `100` renders `+$100`, never `110`.*

### Abuse cases — the tester executes these for real

14. **Given** a signed-in Manufacturer partner account, **When** it requests the
    "Why this product?" detail (or the API endpoint behind it) for any line,
    **Then** the request is refused (403) and the response body contains no
    candidate name, no thermal figure and no price or delta.
    *A manufacturer reading how competing products fared is a competitive leak
    — `CONTEXT.md` §Manufacturer partner.*

15. **Given** an unauthenticated request, **When** it calls the endpoint that
    serves the candidate ladder, **Then** it is refused (401/403) with no
    candidate or price data in the body.

16. **Given** staff account A scoped to nothing in particular and a line
    belonging to project P, **When** the detail is requested, **Then** the line
    is resolved from its own project's record — a request naming a line id that
    does not belong to the addressed project returns 404 and no candidate or
    price data.

17. **Given** any customer-facing surface (quote view, project view, PDF,
    emails), **When** it renders after this change, **Then** no candidate ladder,
    candidate price or price delta appears anywhere on it.

18. **Given** a candidate ladder is served or rendered, **When** the request is
    logged, **Then** no manufacturer price, cost or uplift value appears in log
    output. (Candidate totals are engine sell prices, not manufacturer cost —
    manufacturer cost must not reach this surface at all.)

### Readability redesign (D5)

19. **Given** a candidate row carrying a name, a thermal verdict and a price
    delta, **When** the detail renders at the ops2 breakpoints, **Then** the
    three read at a glance without one truncating or overlapping another.

20. **Given** the redesigned panel, **When** an estimator interacts with it,
    **Then** the only interactive element on the detail remains back — a delta
    is never pressable and opens nothing (R28).

## 3. Out of scope

- Excluded candidates (R9), `withheldIncomplete` — membership does not change.
- The `learned` layer; it stays dark and stays out of the allow-list.
- Live re-pricing. This remains a snapshot surface (R3): no fetch, no recompute
  at display time.
- Any change to the selection rule or the selection ladder itself.
- Any customer-facing display of price deltas or candidates.
- GST modes, basis switching or a second price figure anywhere in ops.
- Sorting, filtering or "choose this instead" affordances on the ladder.

## 4. Assumptions

- `ASSUMED:` The chosen candidate's row shows no delta figure (criterion 4)
  rather than a literal `$0`. Rationale: `$0` is the value D4 forbids for the
  uncalculable case, and repeating it on the pick invites the same misreading.
- `ASSUMED:` Deltas are rendered as whole dollars (`+$100`, `-$200`), matching
  the ask's own examples, rather than cents.
- `ASSUMED:` Whether the delta also appears on the `WhyPanel` summary card is
  left to the UX stage per D5; this spec requires it only on the `WhyDetail`
  ladder. If the owner wants it on the summary card too, say so and criterion 1
  extends there.

No open questions for the owner: the grill settled D1–D5, and the three items
above are tagged for veto rather than left blank.
