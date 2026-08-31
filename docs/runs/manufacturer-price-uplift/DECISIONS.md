# Decisions needed — Manufacturer's price and uplift

Four owner-owned calls the spec (`01-spec.md`) had to assume. Answer inline with
`A:` under each item, then resume the pipeline. My recommendation is stated;
"A: as recommended" is a complete answer.

---

## 1. Does the manufacturer's figure cover the whole line, or one unit?

A line has a quantity. If AMJ quotes $1,240 for a line of 4 windows, does the
platform store $1,240 as the line's price (plus uplift), or $1,240 × 4?

**Recommendation:** the typed figure is the price **for the whole line as
quoted** — no multiplication by quantity. It matches your words ("we receive
price per line") and the mock's behaviour, and it means the estimator types
exactly the number they were read on the phone. The panel will label the field
plainly and show the line's quantity beside it, so a per-unit quote is
multiplied by the estimator before typing rather than silently by us.

A: The typed figure is the price for the WHOLE LINE. No multiplication by
quantity. Owner: "irrelevant, always qty of 1 in the system" — verified as
near-true (323 of 325 production lines are qty 1), but two lines carry qty 4
and 6, so the rule is stated rather than assumed away. At qty 1 the two
readings are identical; where qty > 1 the estimator multiplies before typing.

## 2. Can a manufacturer price be cleared off a line?

Once stored, is there a way back to the platform's computed price?

**Recommendation:** yes — a Clear action in the panel removes the manufacturer's
price and uplift, and the line reverts to its computed price. A price entered on
a phone call gets superseded; without this the only escape is typing a
substitute figure into the old override.

A: No. Entry is ONE-WAY — there is no Clear action, and the line does not
revert to its computed price. A manufacturer price is replaced only by another
manufacturer price (or by a typed override under item 4).

## 3. Which project phases allow manufacturer-price entry?

**Recommendation:** allowed in Intake, Pricing and Issued (repricing an issued
quote in place is normal here); refused once the project is Accepted or later,
where the customer has agreed to a price. Say the word if you want it allowed
after acceptance too.

A: During quote review, BEFORE the quote is issued to the customer. Refused
once issued — narrower than recommended, which had included repricing an issued
quote in place. This is the same mutable-state window the existing override
already enforces (`ops.ts`: submitted, triage_pending, estimator_assigned,
technical_review_required, customer_clarification_required).

## 4. What happens when a line already has a typed override (the old path)?

Both paths set the line's total. If both are stored, the displayed arithmetic
can disagree with the stored total.

**Recommendation:** one price fact per line, last write wins. Entering a
manufacturer price replaces a typed override; typing an override clears the
stored manufacturer price and uplift. No line ever shows working that does not
produce its own total.

A: as recommended — one price fact per line, last write wins.

---

## Owner clarification on the door (not a question, recorded here)

> "I meant the panel component with chevron, the same as Why this product uses."

The Price panel is made openable through `OpenablePanel` — the same component,
the same centred chevron, unmodified. Its `open` takes a closure, so the door
opens the SidePanel rather than navigating. Binding on design and build.
