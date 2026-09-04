# 00 — The ask: what the alternatives cost

**Stage 0, the grill. Conducted with the owner 2026-09-02, not by an agent.**
Binding on every later stage. Where a stage disagrees with a ruling here, the
stage is wrong.

## The ask

> "Why this panel expands into detailed information and listing alternative
> products considered. I'd like those products to show price difference for a
> given opening. For example:
> - AMJ100L was selected. It is the cheapest of the products that met thermal requirements
> - AMJ80L met requirements, but was +$100 in price.
> - AMJ72 did not meet requirements, -$200 though."

## Actor and need

**Estimator (persona)** — `CONTEXT.md` §Actors. The person auditing the
platform's recommendations at the human review gate. A persona with needs,
deliberately NOT an RBAC role.

The ladder already tells them *what* the platform picked and *how* each
candidate did on thermal. It cannot tell them what the choice **cost**. So the
one question an estimator actually arrives with — "was this worth it?" — is the
one question the screen refuses to answer, even though the answer is already on
disk.

## What already exists

- `CandidateOutcome.price` (`src/data/recommendation.ts:113`) carries `total`,
  `ok` and **`deltaToSelected`** — *"candidate total MINUS selected total.
  Negative ⇒ cheaper than the pick. 0 on the pick. null when either side is
  unpriced."* Exactly the figure the ask describes, already stored.
- `WhyDetail.tsx` already renders the ladder: chosen plus up to four
  alternatives (`runnersUp.slice(0, 4)`), each with name, rank, thermal figures
  and a tier verdict.
- `whyCopy.ts` already says *"the cheapest of those that met the caps"* — and
  per the recommendation redesign's D2/D10 that is now literally the selection
  rule, so the ask's first bullet is already true and already on screen.

**The only missing thing is the money**, and it is missing on purpose — see D1.

## Decisions

**D1 — R10 IS REVERSED, and the reason is not the one the grill first argued.**

The prior ruling was *"R10 — No price deltas on the alternatives. Follows from
R3: stored candidate prices are run-time snapshots and would be stale"*,
reaffirmed as *"D18. Money would have re-opened R10."* `candidateOf` is an
allow-list built to keep price out.

The owner's own account of it, which supersedes the staleness argument entirely:

> *"The decision at the time was based on the product status/readiness. It does
> not mean it will not change. However, it still stands true that this is not a
> product selection surface (today). But I did realise that without seeing a
> price, I can see two or more products that meet thermal requirements, yet only
> one of them is selected. **Price tells the full story why.**"*

Two things follow, and the second is the one every later stage must hold on to:

1. **The staleness premise is rejected.** *"Neither U-values, nor catalogue
   prices are changing every minute."* No "as at selection" caption, no date
   stamp, no hedge of any kind. The figure sits beside the product and says
   nothing about its own age.
2. **THE MONEY IS AN EXPLANATION, NOT A COMPARISON.** This is still not a
   product selection surface. The screen already says two products met the
   caps; it cannot say why the other one lost, and the answer is price. The
   delta closes that sentence. It does not invite a switch, and R28 still holds
   — the only interactive element on the detail is back.

The allow-list stays an allow-list: price fields are added explicitly. Never a
spread of the stored outcome — that would forward `exclusions` and the
`learned` layer, which remain forbidden.

**D2 — ONE NUMBER, and there was never a second pricing mechanism.**

> *"I don't know how many times I need to say — OPS HAS A SINGLE NUMBER FOR
> PRICE. Period."*

Third time of asking, so it is written here in full and is not open. No `GST`,
`tax`, `inc`, `ex`, `incl`, `excl`, "inclusive" or "exclusive" anywhere. No
basis switch. No second figure for one fact.

The owner then asked the sharper question — *"the bigger question is why we have
two different underlying pricing mechanism?"* — and the answer is that **we do
not**. Traced end to end:

`CandidateOutcome.price.total` ← `OutcomeCandidate.price` ← `row.price`
(a `PriceSnapshot`) ← **`computePrice(rate, policy, input)`** — the same
function, over the same rate cards, that produces `quote_line.line_total`.
`computePrice` performs **no GST arithmetic at all**: it reads `gst_mode` from
`pricing_policy` and never applies it. Rate-card prices are authored
tax-inclusive, which is why `quoteSummary.total` is documented GST-INCLUSIVE and
why `deliveryCost` does no GST arithmetic either.

A candidate's price is therefore the SAME NUMBER, from the SAME code path, as
the line price ops already reads. **Nothing is converted, grossed up or
reconciled. Any stage that adds arithmetic here has introduced a defect.**

**A comment on the money contract is false and its correction is part of this
feature.** `src/data/recommendation.ts:112` says:

> `// commercial — the engine's single price basis (GST-free; display GST is the
> // skin's job, per the GST-mode house rule)`

It is not GST-free. The comment is wrong in the dangerous direction: it invites
a developer to gross up a figure that is already inclusive, making every delta
10% too large. An earlier draft of this very document did exactly that. Fix the
comment; add a test if one can be written cheaply.

**D3 — R9 stands: excluded candidates are still not shown.**

> *"nothing changes, just price appears for listed candidates (if it can be
> calculated, of course)."*

The ladder's membership rule is untouched — chosen plus up to four next-best by
rank. Nothing new appears; the rows that were already there gain a figure.

**D4 — An uncalculable delta renders `$---`.**

Never `$0`, which would claim the candidate costs the same. Never a blank,
which would read as an oversight. `deltaToSelected` is null whenever either
side is unpriced, and that is a fact about the record worth showing as itself.

**D5 — Where it goes, and how it reads, is the UX stage's to decide.**

> *"this is UX question and potentially a small redesign of that panel for
> better readability."*

A small redesign of the panel for readability is IN SCOPE. The UX stage decides
whether the money lands on the `WhyDetail` ladder alone or also on the
`WhyPanel` summary, and may restructure the ladder row so a name, a thermal
verdict and a price delta can be read at a glance rather than competing.

Constraints it inherits: R28 (the only interactive element on the detail is
back), R7 (name the 5% band, do not paraphrase), and D2 above.

## Out of scope

Excluded candidates (R9) · `withheldIncomplete` · the `learned` layer, still
dark · live re-pricing (R3 — this stays a snapshot surface) · any change to the
selection rule itself · any customer-facing display.
