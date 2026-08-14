# Referral program — pending amendments (not yet in the spec)

Decisions taken by the owner **after** `referral-program.md` reached revision 6. They are recorded
here because the product-manager and architect agents were terminated mid-run by a session limit
(2026-08-15) before these could be folded in. **Fold into the spec and design before implementation.**

---

## D18 — Payout details are a precondition of becoming a referrer

**Owner's decision, verbatim:** *"Only allow users to become referrers if they have required details
stored."*

### What prompted it

The legal research (§10 of `referral-program-legal-research.md`) found that Victoria's *Unclaimed
Money Act 2008* s 3(1) catches "any other sums of money that are legally payable to the owner and
that have remained unpaid for not less than 12 months", above a $20 floor, with a duty to register
(s 11) and remit to the Registrar (s 12). AMJ is Melbourne/Victoria based — the stricter of the two
regimes examined.

The scenario that engages it: a referrer earns commission, never supplies an ABN and bank details,
and twelve months later the business holds a statutory obligation rather than a dormant balance.

The owner was offered four options (ops flag + record of chasing; that plus a condition-precedent
clause; flag only; nothing in v1) and chose a fifth, cleaner one: **move the gate to the front.** A
user cannot become a referrer at all until ABN, BSB, account number and account name are stored.
Commission can then never be earned by someone unpayable, so the twelve-month clock never starts.

### Why this is better than the options offered

- It avoids the unfair-contract-terms tension the research flagged in the condition-precedent
  framing. A term saying "we hold your earned money until you give us details" is a limitation on an
  obligation already incurred. A rule saying "you aren't in the program until you're payable" is an
  eligibility condition disclosed up front, which is a materially stronger position.
- No aged-unpaid-earnings machinery, no chasing workflow, no evidence-of-reasonable-efforts record.
- It removes an entire failure state from the account area rather than building screens for it.

### What it changes

| Area | Change |
|---|---|
| Referral code | Not issued, or issued but **inactive**, until payout details are complete. The architect owns which — see open questions below. |
| Account area | The Referrals section's primary empty state becomes "add your payment details to get your code", not "share your code". |
| Landing page CTA | For a signed-in user without details, the CTA is to complete payout details, not to copy a code. |
| Spec A18 | Unaffected in substance and still compliance-load-bearing (ACL s 49): anyone with a registered account may refer **without having ordered**. This gate is about being payable, not about having purchased. Do not let the two be conflated when this is written up. |
| Spec M11 | Was "payout requires a valid ABN; without it the earning stays `confirmed` and the account area says what is missing". That state should now be unreachable by construction. Reconcile rather than leaving both rules in the document. |
| Unclaimed money | No ops flag, no chasing record, no aged-earnings report needed in v1. |

### The cost, stated plainly

This is real friction ahead of the share action. A tradie willing to pass a code to a mate must first
enter an ABN, BSB, account number and account name — before they have earned anything, and possibly
before they believe they ever will. Some will not bother, and the program's reach is smaller for it.
That is the deliberate trade the owner accepted in exchange for never holding unpayable money.

The UX response is to make the ask feel proportionate to the reward rather than to hide it: state
what they get before asking for banking details, and keep the form to one short step.

### Open questions for the architect (engineering, not owner-owned)

1. **Withhold the code, or issue it inactive?** Withholding is simpler to reason about and makes the
   invariant structural. Issuing it inactive is kinder to a tradie who has already read their code
   out to someone — but it creates a window where a referral could be recorded against a referrer who
   cannot be paid, which is precisely what this decision exists to prevent. If issued-inactive is
   chosen, the behaviour when a mate signs up under an inactive code must be specified explicitly,
   including what the referred tradie sees and whether their discount applies.
2. **What happens to an existing referral if a referrer later clears their payout details?** The
   details are editable, so "complete" is not a one-way door.
3. **Does this interact with the `min_payout_balance` config** (default $0/off)? If that is ever
   switched on, money can still sit unpaid — held by AMJ's own rule rather than by a missing bank
   account. That may re-engage the Victorian regime the front gate was meant to close. Flag it as a
   condition on switching that setting on, and note it in the ops config screen.

---

## Status of the pipeline at the point of interruption

| Stage | State |
|---|---|
| Spec | **Complete** — `referral-program.md` revision 6, 77 acceptance criteria, 9 tickets, §12 empty. Intact; verified after the interruption. |
| Legal research | **Complete** — `referral-program-legal-research.md`, 1,380 lines including §10 on the gift card question. |
| Architect | **Not started in substance.** Terminated during codebase orientation; no design document was written. |
| This file | The only decision not yet reflected in either document. |
