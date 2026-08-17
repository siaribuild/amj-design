# Referral program — phase 2 / tech debt

Everything knowingly left open when the referral program shipped on 2026-08-18, with the reason and
the evidence. Owner ruling: *"any non critical finding goes to phase 2/tech debt."*

Nothing here is a surprise or an oversight — each was found, verified, and deliberately deferred.

---

## 1. AC-72's "used" ending has no retry (the one open criterion)

**What.** When a referral is USED, `onOrderCreated` (`worker/lib/referrals.ts:442`) calls
`repriceReferralDrafts` and **discards its return value**, so a line the pricer cannot re-price is
skipped silently. The sweep cannot repair it either: its recorded limb excludes any referral holding
an earning (`:636`). The other two endings — void and expired — both capture `unpriceableLineIds`
and retry until they succeed.

**Consequence.** That draft keeps the referral discount permanently, and a later quote issues at the
discounted price carrying `referral_percent_at_issue = NULL` — a document that does not even claim
the discount it applied. A second job at first-order pricing, which is what AC-22 and AC-53 exist to
prevent.

**Why deferred.** The trigger is narrow: independent verification tried twice to fire it through an
option-surcharge removal (routine price-list work) and **could not** — only removing a whole product
from the catalogue did it. It self-heals the moment the customer edits the quote. Exposure is one
quote at the referral rate (~$160 on a $3,920 line).

**Honest framing for whoever picks this up:** this is a literal breach of an unamended criterion.
AC-72 names "used" explicitly. It was descoped knowing that, not because anyone thought it complied.

**Fixing it needs one design decision**, which is why it was not just patched: covering the used
ending means giving it a reconciliation marker, and the sweep currently treats "has an earning" as
"nothing left to do". Either widen `expired_processed_at`'s meaning a third time, or give the used
ending its own column.

---

## 2. The quote's discount line states the saving without quantifying it

**What.** The issued quote carries *"Referral discount — 2.5% off, thanks to <referrer> · Already in
the prices above"* (`src/components/quote-project/QuoteTotals.tsx:75`). The owner asked for a
subtraction instead: normal price X, referral discount Y%, total X−Y%.

**Why it is not a display change.** Both discounts are summed into ONE percentage and applied
together, then rounded (`worker/lib/estimator/pricing.ts:228-238`):

```js
const discountPercent = Math.min(100, accountPercent + referralPercent);
if (discountPercent > 0) unit = unit * (1 - discountPercent / 100);
unit = round10(unit);
```

So the referral portion is not separable after the fact — the $10 rounding lands on the combined
figure and has no exact inverse. Showing the saving needs the server to price a second time at the
account percent alone.

**⚠️ The trap.** The client is deliberately never given the account discount percent, so that the
trade discount cannot be derived by subtraction — the owner's rule is that it is never surfaced. Any
implementation must make "normal price" mean *the customer's usual price* (already trade-discounted),
NOT list price. Get that wrong and the quote discloses the trade discount to every referred customer.

---

## 3. Quote expiry (a feature, not a fix)

Owner-stated: quotes cannot sit forever, and expiry is where a freed-up discount gets reassigned —
to the next order in line, or back to the account for future orders.

Relevant to the referral program because **cancellation does not exist**: `STAGES`
(`worker/lib/orders.ts:14`) runs `deposit_invoiced` → `after_sales` with no cancelled stage, so the
guard at `worker/lib/referrals.ts:484` for `stage === 'cancelled'` is dead code against a state
nothing can set. Refunds DO exist (`payment_status === 'refunded'`) and correctly void the earning.

The agreed rule, for whoever specs it: the discount is consumed by the first order; a released
discount becomes available for FUTURE orders and must **not** travel to an already-submitted one.

---

## 4. Accessibility — the ops program form's inputs are unlabelled

`src/ops/Referrals.tsx`'s `NUMBERS.map` block and the `minPayoutBalance` row render a sibling
`<span>` beside a bare `<input>`: no `htmlFor`, no `aria-label`, no wrapping `<label>`. A screen
reader announces seven anonymous boxes on the screen that sets the commission rate, the customer
discount and the payout threshold.

It also has a testing cost: AC-76's E2E drives the config change through the API rather than the
screen the design named, because reaching those inputs needs a positional selector.

---

## 5. Smaller items

- **The void confirmation's no-earning variant is untested.** `src/ops/Referrals.tsx:341` renders
  "Nothing is owed yet…"; the Playwright test only exercises the with-earning branch.
- **The ops console has no browser coverage at all** — owner-declined, deliberately, because the
  console is due a redesign and tests written against markup about to be replaced would go with it.
  Residual risk: a missing confirmation sentence is exactly the class of defect this hides, and that
  is how the void copy survived to independent verification.
- **The security suite is not mutation-tested.** All 13 abuse cases were independently re-executed
  and each test carries a named anti-vacuity guard, but Probity correctly refused to let a verifier
  sabotage production code to prove a red. Confidence rests on execution plus structure, not on a
  demonstrated failure.
- **`customer.spec.ts:464` (T-C5)** fails on a locator, not on pricing: the record draws its figures
  once per breakpoint, twelve nodes match, and `.first()` picks an off-screen copy. Fix is a
  visibility filter. **The long-standing "local dev pricing is broken" note is STALE** — lines save
  as `Ready` with real totals and the whole order path returns 200.
- **`u_staff1`'s OTP budget is oversubscribed** across the E2E run (five codes per fifteen minutes;
  `ops.spec.ts` uses six and `quote-project.spec.ts` reuses the address), so T-C3/T-C4 fail on fast
  runs and pass on slow ones. Fix is a per-test address, as `ops.spec.ts`'s own T-C6/T-C7 already do.
- **Anonymous draft claimed at signup keeps anonymous pricing** — misses the plain account discount,
  root cause in the claim path (`worker/routes/auth.ts:102,115` ordering). Superseded: the founders
  have since decided anonymous users will not be able to order at all.

---

## 6. Launch blockers that are NOT code

- **The T&Cs and FAQ are published but unvetted.** `docs/specs/referral-program-legal-research.md` §9
  carries 24 questions for a lawyer and an accountant. The two clauses most likely to change are
  **7 (varying or ending the program)** and **13 (GST on the payout)**.
- **No Sanity `page` record for `/refer`**, so its `<head>` falls back to the hard-coded default: a
  crawler gets a title, no description, no OG image.
- **The privacy policy has no referral/payout/access-log section.**
- **Codex external review has never run on this work** — the gate was disabled for a quota outage on
  2026-08-17 and re-enabled after most of the feature had landed. The owner deferred to a single
  larger review pass later. That pass has not happened.
