# Referral program — specification

Branch: `feat/referral-program`
Status: **revision 9 — FINAL. Every owner decision is answered; §12 is empty.**
Author: product-manager
Date: 2026-08-15

**Revision 2:** rate set to 1% and every number moved into ops config · cap removed (field kept,
nullable) · minimum payout balance added (default off) · bank-detail audit logging dropped · terms
drafted-pending-review rather than absent · launch ON · **program became double-sided — the referred
tradie gets a discount on their first order (§4.6), which puts this feature inside the pricing path.**

**Revision 3:** discount settled at **2.5%, as a percentage** through the existing pricing step
(fixed-dollar and free-delivery recorded as rejected alternatives) · stacking **additive**, no ceiling ·
**switching the program off honours what was already promised** as one rule with two limbs · **AC-49
given a concrete proof method** · legal research cross-reference and contradiction protocol.

**Revision 4:** owner required the referral discount to be **presented in the account area**.

**Revision 5:** **the standing account discount is never surfaced — anywhere.** The account panel shows
the **referral increment only and never a combined total** (§4.6.3, AC-75). Tone corrected to *one-off
offer with a clock*: explicit, honestly-displayed **expiry** (§4.6.4) and a reminder before it lapses.

**Revision 6 — from the legal research:** bank-detail access log reinstated as a **minimal invisible
log with no viewer** (§7.1) · **a referrer may never submit a mate's contact details** (§7.0) · A18
promoted to **compliance-load-bearing** under ACL s 49 and a stated **payment timeframe** added under
ACL s 32(2) (§4.8) · A13's claim softened.

**Revision 7 — D18:** payout details are a **precondition of becoming a referrer** (§4.9); the
"details missing" state is the **primary entry surface**, not an error; M11/M12 reconciled into one
rule; `payout_timeframe_days` = 14 confirmed; **A18 and D18 kept un-conflatable** (§4.9.4, AC-87).

**Revision 9 — the program has two states, and this revision is mostly deletion.**

Revisions 6–8 specified a three-state program (`active` / `paused` / `terminated`) and, in revision 8,
a set of behaviours for the terminated public page. **The owner had already collapsed the status to
On/Off, and Off means *come back later*, not *gone*:** *"leaving landing page as-is and stopping the
journey after login only: future looking statement 'program being reimagined, come back later.'
type… it feels least involving and hardly any damage is done as well."*

**There is no terminated state, so there is no termination surface to specify** — and the reason is
structural rather than a matter of convenience (§4.7). Deleted outright: the ended-notice page variant,
the `noindex` branch, the conditional sitemap entry, the head/OG rewrite, the status-dependent `/r/`
destination, the disappearing footer link, the terminate confirmation copy, and the paused-vs-terminated
fencing that existed only to keep two states apart. **AC-63 and AC-62 collapse into one criterion for
the Off state; §12A.2 is gone.**

**What Off changes, in full:** new referrals are not recorded, the join journey stops after login with
a forward-looking message, and **one banner** appears on an otherwise unchanged landing page. That is
all (§4.7).

**Added:** that banner, with its reason — ACL **s 18** and **s 32(1)** (§4.7). **Kept and unchanged:**
**AC-89** (the `/r/<CODE>` noindex bundle) and **AC-90** (FAQ governance), which stand on their own in
any status. **Explicitly unaffected by the deletion:** everything about honouring money and discounts
already promised (§4.7, AC-64/65/66) — none of it was ever a property of the public page.

> **Six things that must survive to implementation.** These are the ones most likely to be lost, or
> "helpfully improved", between this document and working code:
>
> 1. **AC-49 — non-referred pricing is unchanged, byte for byte.** Every existing account and every
>    existing quote must price identically after this ships. AC-49 specifies *how that is proven*, not
>    merely that it is required. It is the criterion the whole feature lives or dies on.
> 2. **AC-75 — never a combined total, never the standing discount.** The account panel shows 2.5% and
>    only 2.5%. Printing "7.5% total" discloses the standing 5% by subtraction exactly as effectively
>    as printing the 5% itself. **This is the single most likely thing for an implementer or a polish
>    pass to "fix" into a total.** It is not a rounding of the requirement; it is the requirement.
> 3. **AC-78 — no referrer-submitted contact details, ever.** A referrer shares a code; they never type
>    a mate's name, phone or email into this system. "Invite your mates by email" is the well-intentioned
>    addition that would break it, and it must hit this rule when someone proposes it.
> 4. **AC-87 — D18 gates on being PAYABLE, never on having PURCHASED.** No API, query, table or line of
>    copy may condition any referrer capability on the referrer's own order history. "You must be a
>    customer to refer" is the ACL s 49 fact pattern — strict liability, penalties to $100m.
> 5. **§4.6.6 — the same-ABN gate cannot fire at the moment the discount is granted** for the referred
>    side, **and does not prove common identity even when it does fire**. The containment argument, not
>    the gate, is what makes the discount safe. **No later revision may upgrade this to "blocked
>    automatically".**
> 6. **§8.6 — the panel is an offer with a deadline, not a receipt.** Accurate about mechanics (the
>    price already includes it; there is no redemption step) but urgent in tone, because the owner's
>    rationale is that this is *"an incentive to place an order"*.

---

## 1. Problem statement

OpenFrame acquires trade customers one at a time, through search, showrooms and word of mouth. Word
of mouth already happens — a tradie who got a good price tells the next tradie on the job — but
today it is invisible, unrewarded and unmeasured. Nothing about the site asks for the introduction,
nothing tracks it, and the person who made it gets nothing.

The ask: **pay existing registered users real cash when someone they introduce places an order**, and
**give the introduced tradie a one-off discount on their first order**. Not points, not credit, not a
virtual balance. Cash, because that is the only currency that moves a tradie.

The constraint that shapes everything: **if a rule cannot be stated in one sentence to a tradie
standing on a job site, it is the wrong rule.** Simplicity is a functional requirement here, not a
copywriting preference. A referral scheme that needs a table to explain is a referral scheme nobody
repeats out loud.

### What success looks like

- A registered user can get set up as a referrer in one short step, find their code, share it in
  under 10 seconds, and explain the deal from memory.
- A tradie who arrives with a code sees the discount **while they are quoting**, knows it is one-off,
  and knows when it runs out.
- A referred tradie's first order automatically produces a payable amount with no staff data entry.
- **Every referrer who earns money can be paid** — the business never holds money for someone it
  cannot pay.
- One staff member can pay every confirmed referral in a weekly session of a few minutes, and the
  accountant can reconcile those payments from a record that survives independently of the app.
- The business never pays commission on an order that was cancelled, refunded, or never paid for.
- Every number in the program can be raised or lowered by the owner in the ops console, without a
  deploy and without a copy edit.
- **Nobody who is not part of the program notices it exists** — no existing price moves, and no
  existing commercial arrangement becomes visible.

---

## 2. Actors

| Actor | Who they are | What they do here |
|---|---|---|
| **Referrer (B)** | An existing registered user (`user` row, `type='customer'`) **who has stored complete payout details** (§4.9) | Shares a code/link, watches referrals and earnings, gets paid. **Never enters anything about the mate they referred.** |
| **Prospective referrer** | A registered user without complete payout details | Meets the entry step: what they get, then one short form. **This is the primary state for every new referrer** (§8.3). |
| **Referred tradie (A)** | A person with no OpenFrame account yet | Arrives via link or types a code, registers, **quotes at a discount**, orders. **Always self-identifies** (§7.0, AC-78), and is **never gated by D18**. |
| **Visitor** | Logged-out, no account | Reads the landing page, sees the pitch on marketing pages |
| **Ops staff** | `user.type='internal'`, ops console behind Cloudflare Access | Configures every number, reviews/voids referrals, runs the weekly payout, records payment references |
| **Accountant** | External, not a system user | Reconciles referral payments from an exported record |

**B and A are different people with different needs, and the spec keeps them apart.** For the
referrer, the referral program is a source of income and belongs on its own screen. For the referred
tradie, the discount is not "referral program business" at all — **it is a one-off offer on their
price**, and it belongs where pricing lives (§8.6.1).

Notes grounded in the code:

- Registration **is** first sign-in. There is no signup form: `POST /api/auth/verify` calls
  `findOrCreateUser` (`worker/lib/auth.ts:140`), which creates the `user` row on first successful OTP
  verification. Any referral capture at "signup" must hook that moment, not a form.
- Account identity is a `user` row (`email`, `name`, `company`, `abn`, `price_gst_mode`,
  `discount_percent`). The `organisation`/`membership` tables are effectively unused by the running
  app. **Referrals attach to `user`, not to `organisation`** — the same reasoning
  `migrations/0032_account_discount.sql` already applied to the account discount.
- Staff and customers share the `user` table; `type='internal'` is the staff gate.
- **An ABN is not collected at signup.** It is a profile field added later
  (`POST /api/auth/profile`). This is load-bearing for both §4.9 (the referrer supplies one to enter
  the program) and §4.6.6 (the referred side usually has none at capture time).

---

## 3. The program, as a tradie reads it

> **Refer a mate. You both win.**
> Add your payment details to get your code — you don't need to have ordered anything yourself.
> Your mate gets **2.5% off their first order**. When they place it and pay in full, we pay you
> **1% of that order** — cash, into your bank account, within **14 days**.
> Their first order needs to be at least **$2,000** (ex GST, before delivery).

Six sentences, two numbers. Both sides get something, which is what makes the introduction easy to
make — B is not asking a mate for a favour, B is giving them a discount.

Note the deliberate ordering and separation in line 2: **no purchase needed** and **payment details
needed** are two different facts, always stated as two facts (§4.9.4). Merging them into anything
resembling "you have to be a customer to refer" is the ACL s 49 fact pattern.

Every figure above is the **launch default held in the ops config**, not a constant in the code. The
copy renders from config (§4.5); this section shows the defaults so the document reads concretely.

Deliberately **not** in the program: tiers, points, lifetime commissions, multi-level chains,
seasonal bonuses, expiry of money already earned.

---

## 4. Decisions

Every row is **DECIDED** (mine — derivable from the code, the house rules, or engineering judgement) or
**OWNER** (answered and settled). **There are no open `ASSUMED:` items left in this document.**

### 4.1 Attribution — how a referral is captured

| # | Decision | |
|---|---|---|
| A1 | **Two capture paths, one relationship — both self-identifying.** (a) **Link**: `https://<site>/r/<CODE>` sets an httpOnly cookie and 302-redirects to `/refer`. (b) **Manual code**: the referred user types the code into a field in their own account area after signing in. **There is no third path in which the referrer supplies anything about their mate** (§7.0, AC-78). | DECIDED |
| A2 | Why both: a link only works when the introduction happens over a phone. Half of these introductions happen at a job site — B reads the code out, A types it in later. A link-only program silently loses those. Both paths write the same `referral` row. | DECIDED |
| A3 | **The code is never asked for on the sign-in screen.** `POST /api/auth/challenge` is deliberately non-enumerating (`worker/routes/auth.ts:35`), so the server cannot reveal whether an email is new and cannot conditionally show a "new user" field. A field shown to everyone would be typed by returning customers claiming a referral on themselves. | DECIDED |
| A4 | **A referral is only recorded when the `user` row is CREATED.** An existing customer clicking a referral link is not a referral, ever. | DECIDED |
| A5 | Manual code entry is allowed **until the account's first order exists**, once only. After that the field disappears. **Never gated by D18** — this is the referred side. | OWNER |
| A6 | **Click cookie lifetime: 90 days.** A click older than that has no causal claim on a sale. | DECIDED |
| A7 | **Attribution window: the referred tradie's first order must be placed within `window_months` of the referral being recorded — default 12, configurable in ops.** After that the referral lapses (`expired`) and pays nothing — **and the discount lapses with it (§4.6.4).** | OWNER |
| A8 | **Scope: FIRST ORDER ONLY**, for both the commission and the discount. | OWNER |
| A9 | **One referral per referred account, permanently.** `referral.referred_user_id` is UNIQUE. First recorded wins; a second code (cookie vs manual entry) is rejected, not overwritten. | DECIDED |
| A10 | **No chains, no levels.** A referred tradie can refer others and earns on their own referrals; nothing flows upward. Stated in the rules explicitly, because a tradie will ask. | DECIDED |

### 4.2 Abuse and self-referral

| # | Rule | Enforcement |
|---|---|---|
| A11 | A user can never refer themselves | `referrer_user_id != referred_user_id`; automatic |
| A12 | Same email = same account | Structural — email is UNIQUE on `user` |
| A13 | **Same ABN as the referrer → refused.** Kept as a cheap signal, **but it must not be described as preventing self-referral** (research §7.2): the ABR confirms one person may legitimately hold several ABNs across different structures — a sole trader and their own Pty Ltd are two ABNs, one human. **Under D18 the *referrer* always has an ABN**, so the gate can now fire at capture time whenever the *referred* user has set one — but the referred side still usually has none at signup, so it remains late and partial. It runs again at earn time, voiding the earning. It does **not** protect the discount — see §4.6.6, where the containment argument does the real work. | Automatic, partial |
| A14 | **Staff accounts cannot refer or be referred** (`user.type='internal'`) | Automatic |
| A15 | **Same delivery postcode is NOT a block** — a suburb full of tradies is the target market, not fraud. Ops sees it as a review flag, nothing more. | Manual review |
| A16 | Referrer's account must be `active` at payout time | Automatic gate, ops-overridable |
| A17 | **Ops can void any referral or earning, with a mandatory reason, at any point before it is paid.** The reason is an operational record, not audit apparatus — it is what a staff member reads later to understand why money did not go out. | Manual |
| A18 | **Anyone with a registered account may refer, including someone who has never ordered.** Money only moves when a genuine qualifying order is paid in full. **⚠️ COMPLIANCE-LOAD-BEARING — see §4.8a.** The legal research finds this is most likely what keeps the business outside ACL s 49 (referral selling), a strict-liability offence. It is not a preference and must not be "tightened" into a requirement that the referrer has ordered. **D18 (§4.9) does not qualify this rule:** D18 gates on being *payable*, A18 is about *purchase*, and the two must never be conflated (§4.9.4, AC-87). | DECIDED (compliance) |

### 4.3 Money — the referrer's commission

| # | Decision | |
|---|---|---|
| M1 | **Commission base = the referred order's goods value, EX GST, EXCLUDING delivery.** | DECIDED |
| M2 | Why ex-GST: GST is collected on the ATO's behalf, not revenue — commission on it is commission on someone else's money. Why excluding delivery: freight is a pass-through carrying no margin (`migrations/0044_delivery_pricing.sql` — "that cost has come out of margin on every job"). Paying 1% of freight is paying to ship. | DECIDED |
| M3 | **How the base is computed — one place per fact.** Catalogue prices are stored **GST-inclusive** (`src/data/gst.ts:1`). The order already separates the components: `goods = (total ?? 0) - (delivery_total ?? 0)` (`worker/lib/orders.ts:127`). The ex-GST figure MUST come from the existing `taxBreakdown()` rule in `src/data/gst.ts` (per-line taxable-supply rounding), **not** a fresh `/1.1` in the referral module — otherwise the base disagrees by cents with the ex-GST goods figure on the customer's own order screen. `src/data/*` is already imported by the Worker (`worker/lib/orders.ts:7`). | DECIDED |
| M4 | **Rate: 1% of ex-GST goods, configurable in ops** (`rate_percent`). Flat, not tiered. | OWNER |
| M5 | **No cap.** `cap_amount` exists in the schema, is **nullable**, and ships **NULL = no cap** — present so a future cap needs no migration. Everything that renders the rules must omit the cap clause entirely when it is NULL, never print an empty slot or "up to $". | OWNER |
| M6 | **Qualifying minimum: the referred first order must be ≥ `min_order_amount` ex-GST goods — default $2,000, configurable in ops.** | OWNER |
| M7 | **Minimum payout balance** (`min_payout_balance`), **default $0 = off.** At 1%, a $2,000 order earns $20, so a tiny transfer is possible — hence this field. When set, a referrer's confirmed balance below it is held (visible, accruing, never lost) until it crosses the threshold. **Ships off**, so the default behaviour is "we pay you what you earned". Switching it on carries two structural guards (§4.9.5) and must be disclosed at the point the offer is made (§4.8b, AC-81). | OWNER |
| M8 | **Earned vs payable.** `pending` the moment the referred order is created — the customer accepted the quote. `confirmed` (payable) when that order reaches stage **`balance_paid`**, i.e. paid 100% (`worker/lib/orders.ts:80`) **and the referrer is payable** (§4.9.2). No separate hold period: full payment IS the maturation, and it is an existing state, so no new lifecycle is invented. | OWNER |
| M9 | If the order is cancelled or `payment_status='refunded'` before payout, the earning is voided automatically. After payout there is **no clawback in v1** — exposure is negligible because money only becomes payable after the customer has paid in full. | DECIDED |
| M10 | **Rate is snapshotted onto the referral when the referral is RECORDED**, not read live at earn time. Changing the rate in ops must never retroactively change what someone was already promised. The config is the source of truth for *new* referrals; the referral row is the source of truth for money already promised. **Compliance-load-bearing** (design ADR-6). | DECIDED (compliance) |
| M11 | **Payout mechanism: manual bank transfer by staff, recorded in ops.** No payment rail, no API, no automated disbursement. The system tells staff who to pay and how much, captures the reference of the transfer they made, and keeps a record the accountant can reconcile. This is *tracking*, not a payments integration. | DECIDED |
| M12 | **Payability is an ENTRY condition, not a payment-time condition — see §4.9.** *(Reconciled in revision 7.)* Revisions 1–6 said an earning without an ABN stays `confirmed` while the account area explains what is missing. **That state is unreachable by construction under D18 and this document no longer describes it.** A referrer is payable before they can hold a code; the only reachable residue — details cleared after a referral was recorded — holds future earnings at `pending` (§4.9.2), never at `confirmed`. One rule, one place. | OWNER (D18) |
| M13 | **The advertised commission is inclusive of any GST payable.** "We pay you $200" means $200 lands in the account, whether or not the referrer is GST-registered. See §11. | OWNER |
| M14 | **Payment timeframe: `payout_timeframe_days` = 14**, configurable in ops. **⚠️ COMPLIANCE-LOAD-BEARING** (ACL s 32(2)) — and it is a **public promise that must be met, not merely stated** (AC-80). Comfortably achievable with a weekly payout run; the ops queue surfaces anything approaching the deadline (§8.4c). | OWNER (confirmed) |

### 4.4 GST display — one exemption, one non-exemption

The house rule is: *GST display must respect the account's ex/inc preference on every customer
surface.* This feature contains **one deliberate exemption and one thing that is emphatically not
exempt**, and confusing them is the most likely display defect in the whole spec.

**EXEMPT — the referrer's payout figures.** A payout is not a price of goods. It is cash arriving in a
bank account. There is no ex/inc pair to toggle between; there is one amount.

- **No referral earning, balance or payout figure responds to `price_gst_mode`.** Flipping the toggle
  in Account settings changes nothing on the Referrals screen (AC-31).
- The **basis** is labelled in words wherever the rate appears: *"1% of your mate's first order,
  excluding GST and delivery."* The customer never has to infer which base we used.

**NOT EXEMPT — the referred tradie's discount.** The discount **is** a price adjustment. It is applied
inside the pricing engine and lands inside `quote_line.line_total`, which is a GST-inclusive figure
that already flows through `taxBreakdown()` like every other price. It therefore respects the ex/inc
preference automatically, and must be **verified** to do so (AC-56) rather than assumed.

**A percentage is unit-free, and that is not an exemption.** The §8.6 panel shows a percentage, which
the toggle cannot change because a percentage has no GST dimension. That is arithmetic, not a policy
carve-out. The moment any **worked dollar figure** appears beside it, that figure is a price and
honours the preference like every other price (AC-74).

### 4.5 Where content lives, and why no figure is ever typed into prose

| Content | Home | Why |
|---|---|---|
| Structural marketing copy (headline, steps, FAQ) | **Hard-coded in the page component** | Every other marketing page works that way (`HomePage`, `HowItWorksPage`, `TradePage`). It must interleave with an auth-aware CTA and live figures, which portable text cannot do. |
| Hero image + per-page SEO | **Sanity `page` document, `pageId: "refer"`** | The existing mechanism (`src/data/catalogueQuery.ts:111`, via `getPage()`); lets the owner swap image and meta without a deploy. |
| **Every number** (commission rate, **discount**, minimum, window, cap, payout threshold, **payment timeframe**) | **The program config in D1, rendered into the copy at runtime** | See below — load-bearing. |
| Plain-English rules and full T&Cs | **Sanity `post`**, linked from the landing page | Supplied by the coordinator (§11); revised by a human who is not deploying code. See §12A.2 for how it must relate to the landing page's own FAQ. |

**The no-typed-figures rule is load-bearing, not hygiene.** The owner kept the discount at 2.5%
explicitly on the basis that *it can be raised later without a deploy*. That promise is only true if
every advertised figure — landing page, home and trade placements, account panel, quote badge, emails —
renders from `referral_program`. A single hard-coded "2.5%" in prose turns a config change into a code
change, and worse, into a code change someone will forget: the site would advertise one number while
the engine applied another. **Raising the discount must be a config edit and nothing else** (AC-76).
The same rule governs the commission rate, the payment timeframe and every other program figure.

A `post` is not the landing page. The page needs live figures, an auth-aware CTA and the signed-in
user's own code. It is a route.

### 4.6 The referred tradie's discount — inside the pricing path

This is the part of the feature that reaches into pricing, so it gets its own section and the
strictest rule in the document: **the referral discount must not become a second place where a price
is decided.**

#### 4.6.1 There is already an account discount, and it is the extension point

`migrations/0032_account_discount.sql` added `user.discount_percent REAL NOT NULL DEFAULT 5` — a
percentage off the line total, "applied after the base rate, surcharges, the minimum charge and the
conditional modifiers, and BEFORE the $10 rounding". In the engine:

- `worker/lib/estimator/pricing.ts:195-203` — the single discount step, clamped 0–100, applied last
  before `round10()`.
- `worker/lib/estimator/pricing.ts:292` — `loadAccountDiscount(env, userId)`, which resolves the
  percentage **server-side from the owning user**, never from the request: *"a percentage off the
  price is exactly the field a browser would love to supply."*
- Two callers, and they are the only two: the batch pricer `pricerFor` (:334) and the single-line path
  (:405). Both take `ownerUserId`. **Every pricing surface funnels through them** — the customer price
  preview (`worker/routes/projects.ts:171`), the save path, and the ops staff preview and re-price,
  which already go out of their way to price *in the project owner's context* precisely so "an account
  discount is neither invented nor dropped" (`worker/routes/ops.ts:1081`).

**Therefore:** the referral discount is not a new pricing concept, a new totals row, a new order column
or a new money panel. It is an additional input to the one function that already answers *"what
percentage off does this user get?"* — `loadAccountDiscount` becomes the single place that composes
account discount + referral discount, and every surface inherits it with no duplication. This is the
house rule ("extend, don't duplicate") satisfied literally.

Consequences that fall out for free, and which the architect should not re-solve:

- The discount is **already frozen into the order**: it is baked into `quote_line.line_total`, which
  `createOrderFromProject` copies into `order_line.line_total`. No snapshot work.
- Deposit, balance, delivery and GST all compute from the discounted total already.
- The ops price-preview trace already emits a `discount` step; its label must become truthful about
  composition (an ops-only surface).

#### 4.6.2 Form and size — SETTLED

**The discount is 2.5%, expressed as a percentage, configurable in ops** (`discount_percent`). It is
delivered as one more input to `loadAccountDiscount`, per §4.6.1 — not as a new pricing concept. The
owner considered a larger figure and kept 2.5% on the basis that it can be raised from the console
later; §4.5 is what makes that true.

The two alternatives are **recorded here as rejected, not as options**:

| Form | Fits the code? | Cost if ever revisited |
|---|---|---|
| **Percentage — CHOSEN** | Yes — rides the existing per-line percentage step exactly | Small. One function extended, one config field, one badge on the quote surface, one account panel. |
| Fixed dollar amount off — **rejected, out of scope** | No | An order-level adjustment. Needs a new totals row, a new column on the order, changes to `depositOf`/`balanceOf` (`worker/lib/orders.ts:45`), to `taxBreakdown`, to the order DTO and to every money panel — the "one list and one money panel at every stage" invariant from the quote-revisions refactor gains a second thing to render. Also awkward per-line: $200 off a 40-opening quote is invisible. |
| Free delivery — **rejected, out of scope** | No, and risky | Delivery is a project-level charge whose NULL/0 distinction is the *issue gate* (`migrations/0044_delivery_pricing.sql`: "the single most likely defect in the whole feature"). Writing 0 into `delivery_amount` to mean "free for a referral" is indistinguishable from "a human said zero", and would let an unpriced job pass the issue gate. |

Neither rejected form is to be built. Choosing one later is a re-brief of the architect, not a config
change.

#### 4.6.3 How it combines — additive in the engine, invisible on the surface

**In the engine:** `effective = account_discount + referral_discount`, then the existing 0–100 clamp.
With launch defaults that is `5% + 2.5% = 7.5%`. Additive is what a human means by "plus", and the
clamp already exists and needs no change.

- **No total-discount ceiling.** A ceiling would be a fourth number to maintain against a risk that
  does not exist yet: there is currently **no ops UI to vary `discount_percent` per customer**, so
  every account carries the migration default of 5% and nothing is individually negotiated. **Revisit
  trigger:** if per-customer account discounts ever become editable, a ceiling gets reconsidered then.
- **The price snapshot records the breakdown, not just the combined figure.**
  `PriceSnapshot.discountPercent` exists explicitly so "a total can be reproduced later, when the
  account's rate may have changed" (`pricing.ts:101`) — and a single combined number cannot be
  decomposed. Add the referral component alongside it (AC-52). **This composition is server-side only
  and is never serialised into a customer-facing response.**

**On every customer surface — THE STANDING ACCOUNT DISCOUNT IS NEVER SURFACED, AND NEITHER IS ANY
TOTAL.** Owner's decision, verbatim: *"the tradie account does not need to be surfaced at all — they
get better price. always."* It stays exactly as it is today: silently baked into pricing, unnamed on
every customer surface.

> **Show the referral increment (2.5%) and nothing else. Never a combined total.**
> A "7.5% total" discloses the standing 5% by subtraction exactly as effectively as printing the 5%
> itself. There is no version of a total that keeps the standing discount private.

The referral discount is therefore presented as a **standalone offer** — unrelated to, and not
additive with, anything else the customer can see.

**There is nothing for a customer to reconcile it against.** This site publishes no list price: a
product page shows no price at all (the only price reference in `ProductDetailPage.tsx` is the
visitor's own quote total), and every figure a customer sees is a quote produced for them.

Applies to: the account panel (§8.6), the quote badge (§8.5), the landing page, every marketing
placement, and every email. Ops screens are unaffected — staff see the full composition.

#### 4.6.4 When it applies, when it lapses, and when it stops

**Two endings, both customer-visible, both shown honestly.**

1. **Used** — the discount applies while the referred account has **no order**. The moment their first
   order is created, eligibility ends. That is the intended, happy ending: it did its job.
2. **Expired** — if no first order is placed within the attribution window (A7, default 12 months),
   **the referral lapses and the discount lapses with it.**

**The expiry is a feature, not fine print.** The owner's rationale for the discount is that it is *"an
incentive to place an order… a one-off"*, and an incentive with no deadline is not an incentive. So the
deadline is **stated up front, wherever the discount is offered**, and counted down honestly in the
account panel (§8.6). It must never simply vanish.

- **Evaluated per pricing call**, exactly as the account discount is. No stored flag to go stale, and
  the lifecycle state is derived rather than stored (§7).
- **An issued quote is a price offer and is never re-priced under the customer.** If eligibility ends —
  by use or by expiry — between issue and acceptance, the issued price stands.
- **A reminder before it lapses.** One email, 30 days before expiry, to a referred account that still
  has the discount available and has not ordered.
- **The stale-draft contradiction, and its resolution.** Line totals are stored, not recomputed on
  read, so a referred user with two open drafts who orders one would otherwise keep seeing
  referral-discounted figures on the other — while the account panel says the discount is used. Same
  problem on expiry. **Required outcome (AC-72): once the discount has been used or has expired, no
  customer-facing surface may present it as still available, and no unissued draft may present
  referral-discounted figures as current.** Issued quotes remain exempt (AC-54).
- **Line price overrides** (`migrations/0046_line_price_override.sql`, `ops.put("/lines/:id/price")`)
  bypass the engine entirely. An overridden line does not receive the referral discount, and that is
  correct: a human set that number deliberately. An edge case, not a bug (AC-59).

#### 4.6.5 The qualifying minimum applies to the POST-discount value

The referrer's `min_order_amount` floor is tested against **the same figure the commission is computed
on**: post-discount, ex-GST, excluding delivery. One number, one meaning. A pre-discount figure appears
nowhere else in the system and would have to be reconstructed from a phantom pricing pass purely to
evaluate one threshold. The knife-edge case is accepted and is what the ops void/override is for.

#### 4.6.6 Abuse — the discount is the more attackable half

**This assessment must not be softened by a later revision.** If a future change genuinely closes the
gap, the change gets described; the gap does not get re-labelled.

- The discount is **immediate**, needs **no ABN and no bank details on the referred side**, and is
  claimable by anyone who can create an email address. **D18 does not change this** — it gates the
  referrER, not the referred tradie. A11/A12/A14 hold, but **A13 (same ABN) usually cannot fire at
  signup, because the referred side has no ABN then — and even when it does fire it does not prove
  common identity**, because one person may legitimately hold several ABNs across different structures.
  Self-referral via a second email address is therefore **not** automatically blocked, and the ABN gate
  is a cheap signal, not a control.
- **What actually contains it:** this business issues no price without a human. Every quote is priced
  and reviewed in ops before issue, and the perpetrator must place and pay for a real order to a real
  address. The maximum gain is the discount percentage of one order they actually buy — **bounded, and
  self-funding, because the "attacker" has bought windows.** There is no cash-out path: the commission
  side requires an ABN, bank details and a fully paid order, and under D18 those must exist **before**
  a code is issued at all.
- **What we add:** the ops referrals list flags a referral where the two accounts share an ABN, phone
  number, business name or delivery postcode. A reviewer sees the flag on the project record before
  issuing the quote (AC-58). Ops can void the referral and re-price the project.
- **What we do not add:** identity verification, ABN-at-signup for the referred side, or blocking on
  postcode. Each costs real conversion on the majority of honest users to prevent a bounded,
  self-funding loss.

#### 4.6.7 Independently switchable

The two sides are separately switchable in ops (`referrer_reward_active`, `referred_discount_active`)
inside one program. Both default ON at launch (AC-60).

### 4.7 The program is On or Off — and Off means "come back later"

**Two states, not three.** `referral_program.status` is `active` or `off`. There is no *paused* and no
*terminated*. Anything in the design, tests or code that still names a third status is a leftover from
a superseded revision.

#### Why there is no terminated state — the structural answer, not the convenient one

Owner, verbatim: *"terminated is/can effectively [be] paused forever. If that helps to simplify code —
let's go with it. Hard termination is not possible without leaving different tails to serve existing
commitments anyway."*

That is the reason, and it is worth stating properly, because "we simplified it" is exactly the kind of
justification the next thorough person overturns — as happened twice while this spec was being written.

**A hard termination cannot be clean.** Whatever the switch says, the commitments outlive it: a
`pending` earning still has to confirm when its order is paid, a `confirmed` earning still has to be
paid within its stated timeframe (M14), and a discount already given still has to run to its own date
(§4.6.4). The tail exists either way. A second status was therefore only ever going to describe the
**public page's content** — and once the owner decided the public page barely changes, there was
nothing left for it to describe.

> **Terminated is paused forever, and the commitments outlive either label.**

That is the answer to give anyone who reads the kill-switch requirement in six months, finds a boolean,
and wonders whether something was lost.

#### What Off changes, in full

1. **New referrals are not recorded.** Neither capture path writes a `referral` row: a `/r/<CODE>` link
   sets no cookie, and manual code entry is refused.
2. **The join journey stops after login** with a forward-looking message — *"the program is being
   reimagined, come back later"* — in place of the entry step or the code/share affordance. Sharing a
   code while the program is off would record nothing, so the code and share controls are not
   presented; the referrer's history and earnings stay exactly where they are.
3. **One banner appears at the top of the landing page.**

**That is the entire behavioural difference.** Nothing else about the program changes state.

#### The landing page is unchanged apart from the banner

`/refer` in the Off state is the **same page**: 200, the same pitch, the same figures, indexed, in the
sitemap, same `<head>`, same Open Graph tags. There is **no ended-notice variant, no `noindex` branch,
no conditional sitemap entry and no head rewrite**. The marketing placements and the footer link stay
put and keep pointing at it.

**The banner is the only thing that changes on that page.** It must not be allowed to grow into a
page variant.

> **Banner copy:** *"Joining is paused while we rework the program — check back soon."*

**Why the banner is required rather than optional.** The page pitches a rate and a discount in the
present tense. If nobody can join, that is an offer being advertised and not honoured — **ACL s 18**
(misleading or deceptive conduct, no consumer threshold, so it covers trade readers) and **ACL s 32(1)**,
which prohibits offering a rebate with no intention of providing it. One sentence at the top of the
page resolves both, and is the least-involving thing that does.

#### Switching Off honours what was already promised

**One rule, two limbs, and it is unaffected by everything deleted in revision 9 — none of it was ever a
property of the public page.** Off stops *new attribution*. It withdraws nothing already promised to a
real person, and the two limbs must be implemented and tested together so they cannot drift apart:

- **Limb 1 — money.** A `pending` earning still confirms when its order reaches `balance_paid`, and a
  `confirmed` earning is still paid out in the next run, within the stated timeframe (M14). (AC-65)
- **Limb 2 — the discount.** A referral already recorded **keeps its first-order discount** until the
  account orders **or its window expires on the timetable it was given** — switching off does not bring
  that deadline forward. An already-issued quote is never re-priced. (AC-66)

Both limbs are the same principle as M10's rate snapshot: what a person was told when they acted is
what they get. They are also the reason a second status was never going to be clean, per the structural
answer above. The account-area legacy view (AC-64) stays: a referrer with history keeps seeing it,
along with anything still owed.

If ops ever needs to stop in-flight promises, that is a **separate, deliberate act** — a bulk void with
a mandatory reason and its own confirmation — never a side effect of the toggle (AC-67).

Switching back on is a plain toggle and attributes nothing retroactively (AC-68).

### 4.8 Australian Consumer Law constraints on the offer

**(a) ACL s 49 — referral selling.** A strict-liability offence with penalties to $100m for a body
corporate. It is engaged where a supplier induces a consumer to buy by promising a rebate or benefit
**contingent on that consumer supplying names of prospective customers, or otherwise assisting the
supplier to make a sale to someone else, where the benefit is contingent on an event occurring after
the contract is made.**

**A18 is what most likely keeps the business outside it.** Three consequences:

- **A18 must not be tightened.** Requiring the referrer to have ordered before they can earn would
  couple the reward to their own purchase, which is the shape s 49 is about.
- **The §8.2 placements must never couple the referrer's reward to the referrer's own purchase.**
  *"Place your first order and earn 1% on every mate you refer"* is inside the shape of s 49.
  *"Any account can refer — you don't need to have ordered"* is not (AC-79).
- **D18 must never be described in purchase terms** (§4.9.4). "Add your payment details to get your
  code" is an eligibility condition about payability. "You have to be a customer to refer" is the
  s 49 fact pattern. They are one careless sentence apart, which is why AC-87 exists.

**(b) ACL s 32(2) — offering rebates, gifts and prizes.** A rebate must be provided **within the time
stated in the offer**, or within a reasonable time if none is stated. Two consequences:

- **A stated payment timeframe is mandatory** — M14, `payout_timeframe_days` = 14. It appears wherever
  the offer is made, from config like every other figure, **and it has to actually be met** (AC-80).
- **`min_payout_balance` must be disclosed at the point the offer is made** (AC-81). The field ships
  **off** (M7), so this bites only if it is ever switched on — which is exactly when it would be
  forgotten, hence §4.9.5's structural guards.

**(c) ACL s 18 and s 32(1) — advertising an offer nobody can take up.** Covered by the Off-state
banner (§4.7, AC-62). A page that pitches a rate in the present tense while joining is closed is an
offer being advertised and not honoured; the banner is the fix.

### 4.9 D18 — payout details are a precondition of becoming a referrer

**Owner's decision, verbatim:** *"Only allow users to become referrers if they have required details
stored."*

#### 4.9.1 The rule

> **A user cannot hold a referral code until ABN, BSB, account number and account name are stored.**
> Completing those details is how you enter the program — not how you unblock a payment later.

**Why the gate is at the front.** The legal research (§10) found Victoria's *Unclaimed Money Act 2008*
s 3(1) catches sums legally payable that have remained unpaid for twelve months, above a $20 floor,
with duties to register and remit to the Registrar. The scenario that engages it is a referrer who
earns commission, never supplies bank details, and twelve months later has turned a dormant balance
into a statutory obligation. Moving the gate to the front means **commission can never be earned by
someone unpayable, so the clock never starts.**

It is also the stronger legal position on a second front: a term saying *"we hold your earned money
until you give us details"* is a limitation on an obligation already incurred and carries
unfair-contract-terms risk. A rule saying *"you aren't in the program until you're payable"* is an
eligibility condition disclosed up front. And it removes an entire failure state from the account area
rather than building screens for it.

#### 4.9.2 What the architect settled (engineering, now spec)

- **The code is WITHHELD until details are complete** — not issued-inactive. Withholding makes the
  invariant structural: there is no window in which a referral could be recorded against a referrer
  who cannot be paid.
- **Payability is re-checked at recording time**, not just at code issue. Details are editable, so
  code-in-hand does not prove payable-now. A link for a currently-unpayable referrer sets no cookie,
  and manual entry of a dormant code returns the **generic invalid-code error** — the message must
  never disclose the referrer's account state (their missing bank details) to a third party.
- **Details may be cleared, except while a `confirmed` unpaid earning exists.** That money is already
  payable and the details are actively needed for the imminent payment; the refusal states the amount
  and the reason. Otherwise clearing is allowed, with three consequences: the code goes **dormant**;
  the referrer's *existing* referrals keep their referred-side promises untouched (limb-2 principle —
  the mate's discount is not collateral damage); and any future earning **holds at `pending`** rather
  than confirming, until details are re-completed. **`pending` money is not yet payable**, so the
  eligibility rule still holds and the twelve-month clock still does not start. This is the only
  reachable residue of the unpayable-referrer problem, and it is visible in the account area — never
  silent.

#### 4.9.3 The cost, stated plainly

**This is real friction, deliberately accepted.** A tradie willing to pass a code to a mate must first
enter an ABN, BSB, account number and account name — before they have earned anything, and possibly
before they believe they ever will. **Some will not push through it, and the program's reach is
smaller for it.** That is the trade the owner accepted knowingly, in exchange for never holding money
it cannot pay out.

The design response is to make the ask feel proportionate rather than to hide it: **state what they get
before asking for banking details, and keep the form to one short step.** This is why the
"details missing" state is specified as the **primary entry state** rather than an error state
(§8.3, AC-83).

#### 4.9.4 D18 is a payability gate, never a purchase gate

**⚠️ COMPLIANCE-LOAD-BEARING (ACL s 49) — the sentence most at risk of a careless edit.**

- The predicate reads four detail fields and **nothing else**. No API, query, table or line of copy may
  condition any referrer capability on the referrer's **order history** (AC-87).
- **The two facts are always stated separately**, on every surface that states either:
  - *no purchase needed* — you don't have to have ordered anything to refer (A18);
  - *payment details needed* — that's how you get your code and where the money goes (D18).
- They must never be merged into anything resembling **"you have to be a customer to refer"**.
- A standing regression test holds the line: a brand-new account with **zero orders** and complete
  payout details gets a code and records a referral.

#### 4.9.5 `min_payout_balance` re-engages what D18 closed — two structural guards

1. **The ops write refuses a non-zero threshold without an explicit acknowledgement**, and the Program
   screen states plainly that money held under a threshold is still legally payable and must not sit
   unpaid for twelve months.
2. **The payout queue force-promotes an accruing group into `ready` when its oldest confirmed earning
   reaches 11 months** — one month of margin before the statutory twelve — regardless of the threshold.

Plus the disclosure obligation from §4.8b (AC-81).

---

## 5. In scope

1. Referral code per **payable** registered user (§4.9); `/r/<CODE>` link; cookie capture; manual code
   entry.
2. **The referrer entry gate**: payout-details capture as the program's entry step, the withheld-code
   invariant, dormancy on clearing, and the `pending`-hold residue (§4.9).
3. Automatic referral recording at account creation, with the automatic gates (§4.2) and the
   payability re-check at recording time.
4. **The referred tradie's 2.5% first-order discount, delivered by extending `loadAccountDiscount` in
   the existing pricing engine** (§4.6) — including its visibility on the quote surface, **its offer
   panel in the account area (§8.6)**, its expiry handling, and its breakdown in the price snapshot.
5. Automatic earning creation at order creation, confirmation at `balance_paid` **for a payable
   referrer**, voiding on cancel/refund/expiry; optional minimum payout balance with its two guards;
   the stated payment timeframe (M14).
6. Public landing page at `/refer` — indexable and in the sitemap — with the logged-out,
   logged-in-with-code and logged-in-without-details states, **plus the single Off-state banner**
   (§4.7).
7. Marketing placements: home page section, trade-account page section, footer link, post-delivery
   prompt on a completed order — **within the s 49 copy constraint** (§4.8a, §4.9.4).
8. Account area: a new **Referrals** section for the referrer, **and a pricing-side offer panel for the
   referred tradie**.
9. Ops console: a new **Referrals** tab — Program (every number + the On/Off switch + the two side
   switches + the threshold acknowledgement), Referrals (list, review flags, void, bulk void), Payouts
   (weekly run, ready + accruing groups, long-stop promotion, CSV export, record of payment).
10. Transactional emails: referral recorded, earning confirmed, payout sent, and the 30-day
    discount-expiry reminder.
11. Migration `0051_referral_program.sql` (next after `0050_order_line_position.sql`).
12. **A minimal, invisible access log for payout bank details** (§7.1) — a write path only.
13. **The `/r/<CODE>` indexing directives and the FAQ governance rule** (§12A).
14. Privacy policy update covering bank details and referral data; rules + T&Cs published as Sanity
    posts from the text the coordinator supplies.

## 6. Out of scope

- **Any status-dependent behaviour on `/refer` beyond the single banner** — no ended-notice variant, no
  `noindex` branch, no conditional sitemap entry, no head or Open Graph rewrite, no auth-dependent
  server branching (§4.7).
- **A third program status.** There is `active` and `off`. Anything naming *paused* or *terminated* is
  a leftover from a superseded revision — and §4.7 records why a third state was never going to be
  clean.
- **A `robots.txt` disallow for `/r/`** — actively wrong, see §12A.1.
- **A canonical link between the landing page and the FAQ article** — actively wrong, see §12A.2.
- **A "blocked on missing details" group in the payouts queue** — unreachable by construction under
  D18 and not built (§8.4c).
- **Unclaimed-money machinery** — no ops flag, no chasing workflow, no aged-earnings report. D18
  removes the state that would need them.
- **Any UI for the payout-details access log** — no screen, no report, no filter, no export (§7.1).
- **Any path by which a referrer supplies a mate's name, phone, email or other contact detail**
  (§7.0, AC-78). A compliance boundary, not a backlog item.
- **Any predicate anywhere that conditions a referrer capability on the referrer's own orders**
  (§4.9.4, AC-87).
- Any automated payment rail. Staff pay from their own banking.
- **Surfacing the standing account discount, anywhere, in any form — including as part of a total**
  (§4.6.3).
- **Fixed-dollar and free-delivery forms of the discount** — rejected in §4.6.2.
- **A total-discount ceiling** — rejected in §4.6.3, with an explicit revisit trigger.
- **A worked dollar "you saved $X" figure** on any surface — §8.5 and §8.6 show percentages only in v1.
- Multi-level / chain commissions; tiered or promotional rates; time-limited bonus periods.
- Referral of ops users, manufacturers or suppliers.
- Automated tax-invoice or RCTI generation (§11) — the accountant works from the export in v1.
- Clawback of money already paid.
- Editing the maturation trigger from the console. It is one code path, deliberately.
- Per-customer editing of the base account discount (`user.discount_percent`).
- ABN-Lookup verification in v1 — an 11-digit ATO checksum is the validity test.
- Any change to rate cards, surcharges, modifiers, delivery zones or GST arithmetic.

---

## 7. Domain model and single-source rules

Migration **`0051_referral_program.sql`** (append-only; next after `0050`). Shapes are indicative — the
architect owns the final schema — but these invariants are not negotiable:

- `user.referral_code TEXT` + a `CREATE UNIQUE INDEX` on it. **Only ever populated for a user whose
  payout details are complete** (§4.9).
- `referral` — the **relationship**: referrer, referred (UNIQUE), code used, source (`link`|`manual`),
  the snapshotted program values in force when it was recorded (commission rate, cap, minimum order,
  window, **discount percent**, **payment timeframe**), status, `expires_at`, void reason, review
  flags, timestamps. **It holds no contact details for anyone — both parties are `user` foreign keys**
  (§7.0).
- `referral_earning` — the **money**: referral, order, base amount (post-discount ex-GST goods),
  computed amount, status (`pending`|`confirmed`|`void`|`paid`), payout id, timestamps.
  *Two tables, not one*: voiding a relationship and voiding a payment are different acts.
- `referral_payout` — one row per referrer per payment run: amount, status, reference, `paid_at`,
  `paid_by`, note, **and a frozen copy of the ABN, BSB, account number and account name used**.
- `referral_program` — singleton config (`id='default'`), versioned like `pricing_policy`
  (`migrations/0015_estimator_pricing.sql:35`): **`status` (`active`|`off`) — two values, not three**,
  `referrer_reward_active`, `referred_discount_active`, `rate_percent` (default 1), `cap_amount`
  (**NULL**), `min_order_amount` (default 2000), `min_payout_balance` (default 0), `window_months`
  (default 12), `discount_percent` (default 2.5), `payout_timeframe_days` (default 14),
  `updated_at`, `updated_by`, `version`.
- Payout method on `user`: `payout_bsb`, `payout_account_number`, `payout_account_name` (ABN stays the
  existing profile field).
- **The discount's lifecycle state is derived, not stored.** *Available* / *used* / *expired* is
  computed from the `referral` row, its `expires_at` and the existence of the account's first order.
- **Referrer payability is likewise derived, not stored** — one predicate over four detail fields. A
  cached "is_referrer" flag would be a second source of truth that goes stale the moment details are
  edited.

**The migration is additive only.** It must not rewrite, recompute or touch a single existing
`quote_line.line_total`, `order_line.line_total`, `"order".total` or `payment.amount` — AC-49c.

**Single-source rules that must not be violated:**

| Fact | The one place it lives |
|---|---|
| **Who a referred person is** | **The `user` row they created themselves** (§7.0) — a legal constraint, not an engineering preference. |
| **Whether someone may be a referrer** | **One payability predicate over the four detail fields** (§4.9). It reads nothing else — and specifically never order history (§4.9.4). |
| **Whether joining is open** | `referral_program.status`, read server-side. It gates recording, the post-login journey and the banner — and nothing else (§4.7). |
| What percentage off a user gets | `loadAccountDiscount()` in `worker/lib/estimator/pricing.ts` — extended to compose account + referral. **Server-side only; never serialised to a customer response.** |
| How a discount is applied to a price | The existing discount step, `pricing.ts:195-203`. No second application point. |
| GST arithmetic / ex-GST goods figure | `src/data/gst.ts` (`taxBreakdown`) — called, never re-derived |
| Order goods vs delivery split | `"order".total` / `"order".delivery_total`, read as `orderDto` reads them |
| Order lifecycle and `balance_paid` | `worker/lib/orders.ts` — observed; no stage added |
| Program numbers as advertised | `referral_program` → API → rendered into copy. **No figure is ever typed into prose** (§4.5, AC-76). |
| Money and discount already promised | The `referral` row's snapshot, never the live config |
| Referral business logic | `worker/lib/referrals.ts` — routes thin, no rules in components |

### 7.0 THE ATTRIBUTION BOUNDARY — a referrer never supplies a mate's details

> **A referrer shares a code. They never tell us anything about the person they are referring.**
> Every referral is created by the **referred tradie identifying themselves** — by arriving on a link
> that sets a cookie, or by typing a code into their own account. There is no field, endpoint, form,
> import or email flow anywhere in this system into which a referrer can enter another person's name,
> phone number, email address or any other contact detail.

**Why this is architectural and not a UX preference.** Privacy Act s 6D(4)(d) is one of the routes by
which a small business ceases to be exempt and becomes a full APP entity — it turns on disclosing
personal information about another individual to anyone else for a benefit, or collecting it from
someone else. On the facts of this design, the business is **not** collecting personal information
about one individual from another. The legal research is explicit that a change allowing
referrer-submitted details **would alter that analysis materially**, and that **the stakes are the
entire business's privacy status, not just this feature.**

**What this forbids, concretely.** No "invite your mates by email". No SMS invite. No contact-list
import. No "who did you refer?" field. No recipient field on any referrals form. No ops screen that
lets staff record a referral on a name supplied by a referrer. Each arrives as a two-line ticket;
**it must hit this rule when it is proposed** (AC-78).

**What it permits, and is enough for.** The referrer shares a code or a link through their own phone,
in their own words, on whatever channel they like — which is how the two capture paths in A1 already
work. The boundary costs this design nothing today, and only ever costs a feature that must not be
built.

### 7.1 Handling of payout bank details

**A minimal, invisible access log**, reinstated in revision 6 on new evidence: the OAIC lists audit
logs of access to financial information among its APP 11 security expectations, and the research's
§5.1 finding on s 6D(4)(d) means the business may be a full APP entity.

**What is in:**

- Every read and every change of payout bank details records **who, which record, and when**.
- **Reuse the existing `audit_event` table** (`migrations/0001_customer_core.sql:179`) — one place per
  fact.
- **The log records the fact of access, never the value.** `before_json`/`after_json` must **not**
  contain the BSB or account number. Copying the details into a log to protect the details is
  self-defeating.

**What is explicitly out — a constraint, not an omission:** **no UI, screen, tab, report, export,
filter or workflow.** The owner accepted this on the basis that it is a table nobody looks at until
something goes wrong. **Building a viewer is out of scope now and later** (§6, AC-82).

**Unaffected — the three keeps:** masked read-back on the customer API; staff-only full visibility on
the ops payout screen; **the frozen copy of ABN/BSB/account number/account name on the
`referral_payout` row**, which is **not audit** — **it is the accountant's record of what was actually
paid, and it must not mutate when the referrer later edits their details**; and the mandatory reason on
a void plus `paid_by`/`paid_at` on a payout.

---

## 8. Surfaces

The ux-designer owns layout, hierarchy and visual treatment. This section specifies **purpose, states
and required content** only.

### 8.1 Public landing page — `/refer`

- New `Page` id in `src/app/ui.tsx`, path in `src/app/routes.ts`, and an entry in `PUBLIC_PAGES` /
  `buildSitemap` (`worker/lib/shell.ts:41`) — **unconditional**, like every other marketing page.
- **Purpose:** explain the deal well enough that a visitor can repeat it, and convert three audiences
  differently.
- **Content:** the two-sided promise with live figures; three steps; what qualifies; **that referring
  needs no purchase but does need payment details** (§4.9.4, two separate facts); that the discount is
  one-off and time-limited; **when the referrer gets paid** (M14); link to the rules/T&Cs post; a short
  conversion FAQ (§12A.2 governs its relationship to the full article). The cap clause appears only
  when a cap is set; the payout threshold is stated whenever one is set (§4.8b).
- **States while the program is On:**
  - *Logged out* — pitch + "Sign in to get your code", secondary "Get a quote" → `/quote`.
  - *Logged in, details complete* — pitch **plus the user's own code and share link**, copy button,
    prefilled share message.
  - *Logged in, details missing* — pitch **plus a complete-your-details CTA**, not a code. The value is
    stated before the ask (§4.9.3).
- **While the program is Off** — the same page, plus the banner at the top; and after login the
  forward-looking message replaces the entry step / code and share controls (§4.7). Nothing else on the
  page changes.
- **Sharing is by code and link only** — no way to enter someone else's contact details (§7.0).

### 8.2 Marketing placements

| Placement | Logged-out says | Logged-in says |
|---|---|---|
| **Home page**, one section low on the page (after "Good to know") | "Know another tradie? They get 2.5% off their first order and you get paid." → `/refer` | Code + copy link when details are complete; otherwise a one-line prompt to finish setting up → `/refer` |
| **`/trade-account`**, one section | Same pitch, trade-framed | Same split |
| **Footer**, site-wide | "Refer a mate" link | Same |
| **Completed order** (`delivered`/`after_sales`) + delivery email | n/a | "Happy with these? Refer a mate." + code or setup prompt |

Placements and the footer link are **unchanged by the program status** — they keep pointing at `/refer`,
where the banner does the disclosing (§4.7).

**⚠️ s 49 copy constraint (§4.8a, §4.9.4), binding on every placement and on the landing page.** No
placement may couple the referrer's reward to the referrer's own purchase, and none may express the
payment-details requirement as customer status (AC-79, AC-87).

**Not placed:** product pages, the quote builder, review-and-accept, any payment screen. (The referred
tradie's *discount badge* and the §8.6 panel are not marketing placements — they are pricing
disclosure, and they stay.)

### 8.3 Account area — the "Referrals" section (the REFERRER's screen)

A rail item in `src/pages/AccountShell.tsx` (`AccountSection`), route `/referrals`. **This screen is
about money owed to the account holder for introductions they made.**

**Two shapes, and the first one is the primary state**, because under D18 it is what every new referrer
meets:

**(i) Details missing — THE ENTRY STATE, not an error state.** No code is shown, because none exists.

1. **What you get, first** — the one-sentence rule with live figures, and the two facts stated
   separately: **you don't need to have ordered anything**; **you do need payment details, because
   that's where the money goes** (§4.9.4).
2. **One short step** — ABN, BSB, account number, account name. Not a wizard. Exactly what is missing
   is named; nothing else is demanded.
3. **What happens next** — completing it produces the code immediately.

Nothing about this state may be styled or worded as a failure, a warning or a blocked action.

**(ii) Details complete — the working screen:**

1. **Your code** — code, full share link, copy button, prefilled SMS/WhatsApp message, and the
   one-sentence rule with live figures. **No recipient field, ever** (§7.0).
2. **Were you referred?** — the manual code field, shown only while eligible (A5), with clear feedback.
   **Never gated by D18.** On success it confirms the discount and points at §8.6.
3. **Your referrals** — one row per referred account: **business name if set, otherwise a masked
   email** (`j••••@gmail.com`), join date, status (*Signed up · Quoting · Ordered · Paid in full · Not
   eligible*). **Never** their phone, address, project details or order contents.
4. **Your earnings** — **Pending**, **Confirmed**, **Paid** (lifetime), each traceable to its referral,
   **and when a confirmed amount will be paid** (M14).
5. **Your payment details** — masked read-back, editable. Two holds are stated plainly whenever they
   apply, neither ever silent: **held pending details** (§4.9.2) and **held under threshold** (AC-61).
   Clearing is **refused while a confirmed unpaid earning exists**, with the amount and reason stated.
6. **Payout history** — date, amount, reference, referrals covered.

**While the program is Off**, both shapes are topped by the forward-looking message and the entry step
/ code and share controls are not presented (§4.7). Everything else — referrals, earnings, holds,
payment details, history — stays visible and continues to work, because none of it depends on joining
being open.

### 8.4 Ops console — new "Referrals" tab

Added to `ALL_TABS` in `src/ops/OpsApp.tsx`; API under `/api/ops/referrals/*`. Three sub-screens,
following the `Pricing.tsx` sub-tab pattern. **There is no fourth sub-screen for the access log**
(§7.1).

**(a) Program** — every number, plus the **On/Off switch** and the two side switches: commission rate,
cap (blank = no cap), qualifying minimum, minimum payout balance, attribution window, discount percent,
payment timeframe. Restates the settings in one sentence so a typo is visible. Warns that changes apply
only to referrals recorded from now on. Refuses a stale save (version check). **Setting a non-zero
payout threshold requires an explicit acknowledgement** (§4.9.5). Switching Off states plainly what it
does and does not do: no new referrals, the join journey stops, the banner appears — **and everything
already promised is still honoured** (§4.7).

**(b) Referrals** — list: referrer, referred, date, status, amount, **review flags** (shared ABN /
phone / business name / postcode — a signal for a human, not a control; A13). Filter by status; search
by code, referrer or referred email. Actions: **void** (mandatory reason) and **un-void**, plus a
separate, explicitly-confirmed **bulk void** which is the *only* way to stop in-flight promises.
**There is no "create referral" action** (§7.0).

**(c) Payouts — the weekly job.**

> Open **Referrals → Payouts**. The top says *"Ready to pay: 6 referrers · $1,240"*. Click **Export
> CSV**. Pay those six from the business banking. Paste the bank's reference against the batch, click
> **Mark paid**. Done.

- **Two groups only: ready and accruing.** A "blocked on missing details" group is unreachable under
  D18 and is not built (§6).
- Confirmed earnings group **per referrer**, so one person with three earnings gets one transfer.
- **Anything approaching its stated payment deadline (M14) sorts to the top and is flagged.**
- **Accruing** is visible, excluded from the run, payable by explicit override — **and force-promoted
  to ready at 11 months** by the long-stop (§4.9.5), with the reason shown on the row.
- Marking paid flips the included earnings to `paid`, stamps `paid_at`/`paid_by`, freezes the banking
  details onto the payout row, and emails each referrer. **Failed** returns earnings to the ready queue
  without losing history.
- **For the accountant:** a permanent payout record per referrer per run, plus a date-range CSV export.
  Correct even after the referrer changes bank details or closes their account.
- The ops **dashboard** "Needs us" list gains one row when money is waiting. Zero-count rows render
  nothing, per the existing dashboard rule. **The payout run is unaffected by the On/Off switch.**

### 8.5 The quote surface — the discount while quoting

- A discount indicator on the quote's money panel (`QuoteTotals`) and on the issued quote, naming the
  **referral component only** — and never a total (§4.6.3, AC-75).
- **A percentage, not a dollar saving, in v1.** A "you saved $X" figure requires a second pricing pass
  against an undiscounted baseline. A percentage has no GST dimension and needs no baseline.
- The indicator disappears at the first pricing event after the discount is used or expires (AC-57).
- Ops sees the composition on the project record and in the existing price-explain trace.

### 8.6 The account area's offer panel (the REFERRED TRADIE's screen)

The referral discount is **the only discount this business names to a customer**. The standing account
discount is not surfaced here or anywhere (§4.6.3). **Never gated by D18.**

#### 8.6.1 Where it lives, and why not in Referrals

**Home: the Account page, beside the existing "Price display" (ex/inc GST) preference** in
`AccountSettingsPage`:

1. **It is about their price, not about the referral program.** The account area already has exactly
   one place where "how my prices work" lives.
2. **The two audiences are different people** (§2) — and under D18 the Referrals screen now opens with
   a request for banking details, which would be an absurd thing to show a tradie looking up why their
   price is what it is.
3. **It survives the program being switched off.** A discount already given runs to its own date
   (§4.7 limb 2), and must still be explicable while it does.

**The Referrals section carries a pointer only.** One authoritative panel, one link to it.

#### 8.6.2 Required content — an offer with a clock

- **The referral percentage, alone.** No total, no second percentage (AC-75). Read from the server;
  never computed in the browser (AC-73).
- **The deadline, stated wherever the offer is** — not buried.
- **Three states, derived (§7), never a stored status:** **Available** (the offer and its expiry),
  **Used** (naming the order and date), **Expired** (with the date) — honest, not apologetic, never a
  silent disappearance.
- **Accurate about mechanics, urgent in tone.** Displayed prices **already include** the discount;
  there is nothing to apply. **No redemption language anywhere** — no "apply", "redeem", "claim", "use
  at checkout", "voucher" (AC-70).
- **No worked dollar figure in v1**; if one is ever added it is a price and honours ex/inc (AC-74).
- **A non-referred account never sees this panel at all.**

#### 8.6.3 Interaction with the GST preference

The panel sits **on the price side** of the §4.4 contrast. A percentage is unit-free, so toggling
ex/inc changes nothing about the number shown — **that is arithmetic, not an exemption**. The prices
that percentage acted on continue to honour the preference everywhere (AC-56).

---

## 9. Draft copy

Marketing prose for the ux-designer to refine — **not the rules or the T&Cs**, which the coordinator
supplies (§11). `[rate]`, `[discount]`, `[minOrder]`, `[window]`, `[cap]`, `[payoutDays]` are slots
filled from config, **never typed as literals** (§4.5), and `[cap]` renders nothing when no cap is set.
All of it is subject to the s 49 constraints (§4.8a, §4.9.4).

**Landing hero**
> **Refer a mate. You both win.**
> You already tell other tradies where you get your windows. Now there's something in it for both of
> you.

**The rule (one sentence, used everywhere)**
> Share your code — your mate gets **[discount]% off their first order**, and when they pay for it in
> full we pay you **[rate]% of it**, into your bank account within **[payoutDays] days**.

**Three steps**
1. **Get your code.** Add your ABN and bank details — that's where we send the money. **You don't need
   to have ordered anything yourself.**
2. **They save.** Your mate signs up with your code and gets **[discount]% off their first order** —
   it's on their quote from the start, and it's theirs for **[window] months**.
3. **You get paid.** Once they've paid that order in full, we transfer your **[rate]%**[ifCap: , up to
   [cap]] within **[payoutDays] days**.

**The fine print, in plain words**
- Any account can refer — **you don't need to have bought anything from us.** You do need your ABN and
  bank details on file, because that's the account we pay.
- It's their **first order** that counts, and it has to be placed within **[window] months** of them
  signing up with your code.
- The order needs to be at least **[minOrder]** ex GST, before delivery.
- **[rate]%** is worked out on the **goods, excluding GST and delivery** — not the total on the invoice.
- We pay by **bank transfer**, within **[payoutDays] days** of your mate paying their order in full.
  [ifThreshold: We pay out once your balance reaches **[threshold]**.]
- One code per new customer. You can't refer yourself, or another login for your own business.
- You get paid for the mates you refer — not for anyone they go on to refer.

**Landing page banner — the ONLY change to this page when the program is Off (§4.7)**
> Joining is paused while we rework the program — check back soon.

**After login while Off — replaces the entry step / code and share controls**
> **The referral program is being reimagined.** We're not taking new referrals right now — check back
> soon. Anything you've already earned is below, and it will still be paid.

**Referrals section — entry state (details missing). THE PRIMARY STATE.**
> **Get your referral code**
> Refer another tradie and earn **[rate]%** of their first order — they get **[discount]% off** theirs.
> You don't need to have ordered anything yourself. We just need to know where to send the money.
> *[form: ABN · BSB · Account number · Account name]*
> Add these and your code appears straight away.

**Referrals section — clearing refused**
> You've got **`[$]`** confirmed and waiting to be paid into this account. You can change these details
> once that payment has gone out.

**Referrals section — held pending details**
> **Re-add your payment details** — **`[$]`** is waiting to be confirmed. Your mates' discounts aren't
> affected.

**Home/trade placement, logged out**
> **Know another tradie?** They get **[discount]% off** their first order, you get **[rate]%** of it.
> Any account can refer. →

**Home/trade placement, logged in with code**
> **Your referral code: `ABC-123`** · Copy link · `[n]` mates referred · `[$]` earned

**Home/trade placement, logged in without details**
> **Finish setting up your referral code** — add your ABN and bank details and start earning
> **[rate]%**. →

**Quote surface, referred tradie**
> **[discount]% referral discount applied — thanks to [referrer].** It's already in these prices, and
> it's on this first order.

**Offer panel — available**
> **[discount]% off your first order**
> It's already in every price you see — there's nothing to apply. This is a one-off from
> **[referrer]**, and it's yours until **[expiry]**.

**Offer panel — used**
> **Your [discount]% referral discount was applied to order [orderNo]** on **[date]**. That was the
> one-off — nice work.

**Offer panel — expired**
> **Your [discount]% referral discount expired on [date].** It applied to a first order placed within
> **[window] months** of signing up with [referrer]'s code.

**Email — your discount is running out** *(30 days before expiry, unordered accounts only)*
> **Your [discount]% discount runs out on [date].** It's on your first order and it's already built
> into the prices in your quote — start or finish a quote before then and it's yours.

**Account, under the payout threshold** (only when one is set)
> You've earned **`[$]`**. We pay out once your balance reaches **`[threshold]`** — keep sharing.

**Email — a mate signed up**
> Good news — `[name]` just signed up with your code and got their **[discount]% off**. When they place
> their first order and pay it in full, your **[rate]%** is on its way.

**Email — earning confirmed**
> `[name]`'s order is paid in full, so you've earned **`[$]`**. It'll be in your account within
> **[payoutDays] days**.

**Email — paid**
> **`[$]` is on its way to your account.** Sent `[date]`, reference `[ref]`. Thanks for the
> introduction — keep them coming.

---

## 10. Acceptance criteria

Each is independently verifiable. Figures are whatever the ops config holds; no criterion hard-codes a
rate.

### The referrer entry gate (D18)
- **AC-1** *(amended r7)* Every registered customer account **with complete payout details (ABN, BSB,
  account number, account name)** has exactly one referral code, generated on first demand once those
  details are stored, and stable thereafter. An account without complete details **has no code**.
- **AC-83** **The "details missing" state is a first-class entry surface, not an error.** For a
  signed-in user without complete details, the Referrals section and the `/refer` logged-in state both
  lead with what the program pays, state the two facts separately (no purchase needed / payment details
  needed), and present one short form naming exactly which fields are missing. No part of it renders as
  a warning, failure or blocked action. Completing the form yields the code without a further step.
- **AC-84** **A dormant code is inert end to end.** For a referrer whose details are incomplete or
  cleared: the link route sets no cookie and redirects normally, and manual entry of that code returns
  the **same generic invalid-code error** as an unknown code — never a message disclosing that the
  referrer's bank details are missing.
- **AC-85** **Clearing details behaves as specified.** (a) Refused while any earning is `confirmed` and
  unpaid, with the amount and reason stated; (b) otherwise allowed, after which the code is dormant,
  existing referrals' referred-side promises are untouched (the mate's discount still applies), and any
  future earning **holds at `pending`** rather than confirming; (c) re-completing the details allows
  those held earnings to confirm.
- **AC-86** **The referred side is never gated by D18.** Manual code entry, the discount, and the §8.6
  offer panel work identically for a referred tradie with no ABN and no bank details.
- **AC-87** **D18 gates payability, never purchase.** (Regression-critical, compliance.) (a) A
  brand-new account with **zero orders** and complete payout details receives a code and can record a
  referral; (b) no API, query or table conditions any referrer capability on the referrer's order
  history — verified by inspection as well as test; (c) every customer-facing surface that states
  either condition states them as **two separate facts**, and no copy anywhere implies that being a
  customer is required to refer.

### Codes and sharing
- **AC-2** Codes use an unambiguous uppercase alphabet with no `O`, `0`, `I` or `1`, so a code can be
  read out over a job-site phone call and typed back correctly.
- **AC-3** Codes are unique across all accounts; a generation collision retries rather than failing or
  reusing.
- **AC-4** `GET /r/<CODE>` responds 302 to `/refer` in **every** program status and never errors. It
  sets the httpOnly cookie only for a valid code belonging to a currently-payable referrer while the
  program is On; for an unknown, staff-owned or dormant code, or while the program is Off, it redirects
  with **no cookie**.
- **AC-5** An internal (staff) account has no referral code and no referral surfaces.
- **AC-89** **`/r/<CODE>` indexing directives, as one bundle.** (a) The 302 carries
  `X-Robots-Tag: noindex` in **every** program status; (b) no `/r/` URL ever appears in the sitemap;
  (c) **`robots.txt` does not disallow `/r/`** — and this is deliberate, not an oversight: a disallow
  prevents crawling, so the noindex would never be fetched, and a widely-shared but uncrawlable URL can
  still reach the index with no content at all. **A directive has to be seen to be obeyed.**

### Attribution
- **AC-6** A brand-new email signing in while the referral cookie is present produces exactly one
  `referral` row linking referrer → new user, and the cookie is cleared.
- **AC-7** An **existing** user signing in while the cookie is present produces **no** referral row.
  (Regression-critical.)
- **AC-8** A user with no referral can enter a valid code manually before their first order and get the
  same `referral` row, marked `source='manual'`.
- **AC-9** Manual entry is refused once the account has an order, and the field is not shown.
- **AC-10** A second referral attempt on an account that already has one is refused with a clear
  message; the original row is unchanged.
- **AC-11** A user entering their own code is refused with a specific message.
- **AC-12** A signup whose ABN matches the referrer's (digits compared, spacing ignored) records no
  referral; if the ABN is added later and then matches, the earning is voided with the reason visible
  in ops. **This is a signal, not a proof of common identity (A13).**
- **AC-13** A referral whose referred account places no order within the configured window moves to
  `expired` and can never produce an earning **or a discount**.
- **AC-14** The cookie expires 90 days after it is set; a signup after that records no referral.
- **AC-78** **No referrer-submitted contact details, anywhere.** (Regression-critical, compliance.)
  Verified three ways: (a) no customer or ops endpoint accepts a name, phone, email or other contact
  detail for a person the caller is referring — a request carrying one is refused, not ignored; (b) no
  UI on any surface offers such a field, including any share/invite affordance; (c) the `referral`
  table holds no contact columns, both parties being `user` foreign keys. A future "invite by email"
  feature must fail this criterion.

### AC-49 — Non-referred pricing is unchanged, byte for byte *(the criterion this feature lives or dies on)*

It is **not** satisfied by "we didn't mean to change anything"; the tester must be able to *prove* it.
Four parts, all required:

- **AC-49a — Golden fixtures, captured before and compared after.** A characterisation corpus is
  captured from the pricing engine **on `main`, before any referral code exists**, committed as
  fixtures, and re-run after the change with **identical** `unit`, `total`, `depositAmount` and
  snapshot `discountPercent` for every case. The corpus must include, at minimum:
  - an **anonymous** project (no `owner_user_id` → 0% discount);
  - a **registered non-referred** account (the 5% default);
  - an **internal/staff** account (0%);
  - a line whose price is driven by **`min_charge`** rather than the rate;
  - a line where a **conditional modifier fires**, and one where it does not;
  - a **composite parent with segments** (parent total authoritative, segments display-only);
  - at least one line **sitting on a `$10` rounding boundary** — because the discount is applied
    immediately *before* `round10()`, a boundary case is where an accidental change to the order of
    operations becomes visible and a mid-band case is where it hides;
  - `qty > 1`, so the `× qty` step is exercised after rounding.
- **AC-49b — The composing function is transparent for non-referred users.** For a user with no
  `referral` row, the extended `loadAccountDiscount` returns a value **numerically identical** to
  `user.discount_percent`, with the program On **and Off**, and with `referred_discount_active` off.
- **AC-49c — The migration touches no stored price.** Applied to a copy of production data,
  `0051_referral_program.sql` leaves every existing `quote_line.line_total`, `order_line.line_total`,
  `"order".total`, `"order".delivery_total` and `payment.amount` **bitwise unchanged**. Verified by
  checksum/row comparison before and after, not by inspection of the SQL.
- **AC-49d — No existing pricing test is edited to pass.** If a pre-existing pricing test needs its
  expected values changed, that is a failure of this criterion, not a test that needs updating.

### The referred tradie's discount
- **AC-48** A referred user's quote lines price with the referral discount applied **in addition to**
  their account discount, and the resulting line total matches a hand calculation of the composed
  percentage applied at the existing discount step, before `$10` rounding.
- **AC-50** The discount is applied by the **single existing discount step** in
  `worker/lib/estimator/pricing.ts` — there is no second place in the codebase where a referral
  discount is subtracted from a price. Verified by inspection as well as by test.
- **AC-51** The same discounted figure is produced by every pricing surface for the same line: the
  customer price preview, the save path, and the ops staff preview/re-price in the owner's context.
- **AC-52** The price snapshot records the account and referral components **separately** (server-side),
  so a stored total can be decomposed and reproduced.
- **AC-53** Once the referred account's first order exists, the next pricing event on any of their
  lines produces an undiscounted-by-referral price.
- **AC-54** An issued quote is never re-priced by a change in referral eligibility — by use, by expiry,
  or by the program being switched off.
- **AC-55** No customer-facing response carries the base account discount or the combined effective
  percentage. The quote surface names the referral percentage only.
- **AC-56** With a referral discount applied, switching the account's GST display between `inc` and
  `ex` recalculates the quote's money panel exactly as it does for a non-referred account.
- **AC-57** The customer-facing discount indicator on the quote disappears at the first pricing event
  after the discount is used or expires.
- **AC-58** The ops project record shows that a referral discount is applied, and shows any review flag
  before a reviewer issues the quote.
- **AC-59** A line with an ops price override keeps the overridden price; the referral discount does
  not re-apply to it.
- **AC-60** With `referred_discount_active` off, referrals are still recorded and commissions still
  earned, but no quote receives a referral discount — and vice versa for `referrer_reward_active`.

### The account offer panel (§8.6)
- **AC-69** The panel appears on the **Account** page beside the price-display preference — not inside
  the Referrals section.
- **AC-70** The panel states that displayed prices **already include** the discount, and contains **no
  redemption language anywhere**. Verified against the rendered copy, not the source strings.
- **AC-71** The panel shows exactly one of three derived states — **Available**, **Used**, **Expired** —
  computed from the referral row, its expiry and the existence of a first order, with no stored status
  column.
- **AC-72** **Once the discount has been used or has expired, no customer-facing surface presents it as
  still available, and no unissued draft presents referral-discounted figures as current.** (Issued
  quotes are exempt — AC-54 governs them.)
- **AC-73** The percentage in the panel comes from the server; the browser never computes it or any
  composition of it.
- **AC-74** Toggling the GST display preference changes no percentage in the panel, **and** no worked
  dollar figure appears in v1; if one is ever added, it moves with the preference exactly as a price
  does.
- **AC-75** **The panel shows the referral percentage and nothing else.** No combined total, no second
  percentage, no reference to the standing account discount, on this or any other customer-facing
  surface or API response. A non-referred account sees no panel at all. (Regression-critical.)
- **AC-77** A referred account that has not ordered receives the expiry-reminder email 30 days before
  its discount lapses, and no such email once the discount has been used, voided or already expired.

### The referrer's money
- **AC-15** When a referred user's first order is created, exactly one `referral_earning` row is created
  with status `pending`.
- **AC-16** The commission base equals the order's **post-discount ex-GST goods** figure computed
  through `src/data/gst.ts`, and equals to the cent the ex-GST goods figure the customer sees on that
  same order when their display preference is `ex`.
- **AC-17** The base **excludes** delivery.
- **AC-18** An order below the configured qualifying minimum (measured post-discount) produces no
  earning, and the referral shows a status explaining why.
- **AC-19** With `cap_amount` NULL, an arbitrarily large order produces an uncapped commission; with a
  cap set, the commission is exactly the cap.
- **AC-20** The earning flips `pending` → `confirmed` when and only when the referred order reaches
  `balance_paid` **and the referrer is payable**. Earlier stages leave it `pending`, and so does an
  unpayable referrer (AC-85).
- **AC-21** Cancelling or refunding the referred order before payout voids the earning automatically,
  with a reason.
- **AC-22** A referred user's **second** order produces no further earning and no discount.
- **AC-23** Changing any program number in ops does not change the amount, discount, window or payment
  timeframe of any referral recorded before the change.
- **AC-24** Amounts are stored and displayed to the cent, and the sum of a payout's earnings equals the
  payout amount exactly.
- **AC-80** **The payment timeframe is stated wherever the offer is made AND met.** (Compliance —
  ACL s 32(2).) (a) It appears on the landing page, the placements' linked detail, the Referrals
  section and the earning-confirmed email, rendered from `payout_timeframe_days`, never typed; (b) a
  confirmed earning displays when it will be paid; (c) the ops payouts queue flags and sorts to the top
  any group whose wait has reached the stated timeframe.
- **AC-81** **When `min_payout_balance` is non-zero, the threshold appears in the offer itself** — on
  the landing page and in the placements' linked detail — not only in the account area after a
  referrer's money is already being held. With it at 0 (default) no threshold language appears
  anywhere. (Compliance — ACL s 32(2).)
- **AC-88** **The threshold's two guards work.** (a) The ops write refuses a non-zero
  `min_payout_balance` without the explicit acknowledgement, and the screen carries the standing
  warning; (b) an accruing group whose oldest confirmed earning reaches 11 months is force-promoted
  into the ready queue regardless of the threshold, with the reason shown on the row.

### Account area (Referrals section)
- **AC-25** With details complete and the program On, the Referrals section shows the code, a working
  share link, and a copy control that puts the full URL on the clipboard — **and offers no field for a
  recipient's details** (AC-78).
- **AC-26** The referral list shows the referred party's business name, or a masked email when none is
  set, and never their phone, address, project or order contents.
- **AC-27** Pending, Confirmed and Paid totals each equal the sum of the underlying earning rows.
- **AC-28** *(amended r7)* **Both reachable holds are stated plainly and neither is ever silent:** money
  **pending because payment details were removed** (§4.9.2), and money **confirmed but under a non-zero
  payout threshold** (AC-61). Each names the amount and what will release it.
- **AC-29** Saved bank details are masked on read-back; the full account number is never returned by the
  customer API after storage.
- **AC-30** Payout history shows date, amount, reference and referrals covered, and remains correct
  after the user edits their bank details.
- **AC-31** **Toggling the account's GST display preference changes no figure on the Referrals
  section**, while the same account's quote/order screens continue to respond to it.
- **AC-32** Every place a rate, discount, minimum, window, cap, threshold or timeframe appears on a
  customer surface matches the current ops configuration.
- **AC-61** With `min_payout_balance` set above a referrer's confirmed balance, the section states the
  amount earned and the threshold; with it at 0 (default) no threshold language appears anywhere.
- **AC-64** With the program Off, a referrer **with** history still sees the Referrals section — the
  forward-looking message at the top, and below it their referrals, earnings, holds, payment details
  and payout history, all still working. A referrer **without** history sees the message and the
  invitation to come back. The §8.6 offer panel is unaffected for anyone whose discount is still live.
- **AC-82** **The payout-details access log exists, is written, and has no interface.** (a) Viewing or
  changing payout bank details writes an `audit_event` recording actor, record and time; (b) that
  record contains **no BSB or account number** in any field; (c) **no route, screen, tab, report,
  export or API endpoint exposes the log** — customer-facing or ops. Building one is a failure of this
  criterion, not an enhancement.

### Landing page, placements, search and configurability
- **AC-33** `/refer` is reachable, server-renders its `<head>` from the Sanity `page` record with site
  defaults filled in, and appears in `/sitemap.xml` — **unconditionally, in every program status**.
- **AC-34** *(amended r7)* Logged out and On, `/refer` shows the pitch and a sign-in CTA and no code.
  Logged in **with complete details**, it shows the user's own code and share link. Logged in
  **without**, it shows the complete-your-details CTA and no code (AC-83).
- **AC-35** With no cap configured, no page renders a cap clause, an empty slot, or "up to $".
- **AC-36** The home page and `/trade-account` each carry exactly one referral placement, matching
  session and gate state. Placements and the footer link are **unchanged by program status**.
- **AC-37** A completed order shows the refer-a-mate prompt; an in-progress order does not.
- **AC-76** **Raising the discount is a config change and nothing else.** Changing `discount_percent`
  (and likewise `rate_percent`, `min_order_amount`, `window_months`, `payout_timeframe_days`) in the
  ops console updates every customer-facing figure with **no code change and no deploy**. Verified by
  grep as well as by test: no customer-facing string contains a hard-coded program figure.
- **AC-79** **No customer-facing copy makes the referrer's reward conditional on the referrer's own
  purchase**, and none expresses the payment-details requirement as customer status. (Compliance —
  ACL s 49, strict liability.)
- **AC-90** **The FAQ exists twice only as two different documents.** (a) The Resources FAQ article
  **extends** the landing page's questions — it does not restate the same questions or answers; (b) the
  two pages interlink ("the short version" ↔ "full details, rules and terms"); (c) **there is no
  canonical link between them** in either direction, because they are deliberately different documents
  and cross-canonicalising asks a search engine to discard one; (d) if FAQ structured data is ever
  added, it appears on exactly one of the two pages. Verified at copy review (T7/T9) against the
  rendered pages, not the source.

### The On/Off switch
- **AC-62** **Off changes exactly three things, and nothing else.** With `status='off'`:
  (a) **no new referral is recorded** by either path — a `/r/<CODE>` link sets no cookie and manual code
  entry is refused; (b) **the join journey stops after login** — the forward-looking message replaces
  the entry step and the code/share controls, on both the landing page and the Referrals section;
  (c) **the banner appears** at the top of the landing page. Everything else about `/refer` is
  **byte-for-byte the page it serves when On** — same 200, same pitch, same figures, same `<head>` and
  Open Graph tags, same sitemap entry, indexable; and the placements and footer link are untouched.
  (Compliance — ACL s 18 / s 32(1) for the banner, §4.7.)
- **AC-65** **Off honours what was already promised — limb 1, money.** A `pending` earning still
  confirms when its order reaches `balance_paid`, and a `confirmed` earning still appears in the
  payouts queue and is still paid within its stated timeframe. (Regression-critical.)
- **AC-66** **Off honours what was already promised — limb 2, the discount.** A referral recorded
  before the switch keeps its first-order discount until the account orders or its window expires **on
  its original timetable** — switching off does not bring the deadline forward — and no issued quote is
  re-priced. (Regression-critical. Tested in the same suite as AC-65 so the two limbs cannot drift
  apart.)
- **AC-67** Stopping in-flight promises is possible only through an explicitly confirmed bulk void with
  a reason — never as a side effect of the switch.
- **AC-68** Switching back On is a plain toggle: it attributes nothing retroactively, and the page
  returns to its normal state with the banner gone.

### Ops
- **AC-38** An admin can change every program number and the On/Off switch, and a concurrent stale save
  is refused rather than silently overwriting (version check).
- **AC-39** The referrals list filters by status and finds a referral by code, referrer email or
  referred email. **There is no action anywhere in ops that creates a referral from supplied contact
  details** (AC-78).
- **AC-40** Voiding requires a reason and removes the earning from the ready-to-pay queue.
- **AC-41** The payouts screen groups confirmed earnings **per referrer**, and has exactly two groups —
  ready and accruing. No "blocked on details" group exists.
- **AC-42** CSV export contains name, ABN, BSB, account number, account name, amount and referral
  references, and opens cleanly in a spreadsheet.
- **AC-43** Marking a payout paid records reference, date and staff member, flips its earnings to
  `paid`, freezes the banking details used onto the payout, and emails each referrer.
- **AC-44** Marking a payout failed returns its earnings to the ready queue without losing history.
- **AC-45** A payout record remains complete and unchanged after the referrer edits or clears their bank
  details.
- **AC-46** The ops dashboard shows a "referral payouts ready" row when at least one earning is
  confirmed, unpaid and above any threshold, and nothing when there are none. **The payout run works
  identically with the program On or Off.**
- **AC-47** Referral endpoints are refused to non-staff; a customer cannot read another user's
  referrals, earnings or bank details by id.

---

## 11. Legal, tax and privacy — status and remaining sign-off

The coordinator supplies all the text — the plain-English rules and the T&Cs — researched against
Australian primary sources (ACCC / ATO / OAIC), at
`docs/specs/referral-program-legal-research.md`.

- **Everything drafted must be flagged in-repo and to the owner as requiring professional review before
  it is relied on.**
- The rules and T&Cs publish as Sanity `post` documents, linked from `/refer`. **§12A.2 governs how
  that article relates to the landing page's own FAQ** (AC-90).
- **No number appears in the terms as a literal.** Where the terms must state a rate, minimum, window or
  payment timeframe, they reference the published program page (§4.5).

**Copy obligations carried by this revision**, for the coordinator's terms pass: the payment-timeframe
sentence conditioned on the entry rule; the threshold-hold disclosure whenever a threshold is set; the
ops-screen warning text for enabling `min_payout_balance`; the A18/D18 two-facts rule (§4.9.4) applied
to every sentence that mentions either; and **the Off-state banner and post-login message** (§4.7).

**Contradiction protocol.** If further legal findings contradict a decision recorded here — most likely
the GST-on-payout wording (M13), the right-to-end-the-program position (§4.7) or the expiry of an
advertised discount (§4.6.4) — the finding comes **back to this spec for a decision**, and is not
patched around in the copy.

Items still requiring the owner's accountant or a lawyer:

1. **GST on the payout.** Position taken: inclusive of any GST payable (M13). *Accountant to confirm.*
2. **Tax invoicing / RCTI.** v1 generates no such document; the accountant works from the CSV.
   *Accountant to confirm, or RCTI generation becomes a scope addition.*
3. **No-ABN withholding.** Requiring an ABN before a code is issued (§4.9) sidesteps it entirely.
   *Accountant to confirm.*
4. **Privacy Act status.** §7.0's attribution boundary keeps this design outside s 6D(4)(d); §7.1's
   access log is the APP 11 response. *Legal to confirm.*
5. **ACL s 49 (referral selling)** — A18, the §8.2 copy constraint and the §4.9.4 two-facts rule are
   the design's answer. *Legal to confirm — and to check the drafted copy specifically, since this is a
   wording risk as much as a design one.*
6. **ACL s 32(2)** — the stated 14-day timeframe (M14) and up-front threshold disclosure.
   *Legal to confirm 14 days is consistent with what the terms will say.*
7. **ACL s 18 / s 32(1)** — the Off-state banner (§4.7, §4.8c). *Legal to confirm the banner wording is
   sufficient disclosure while the page continues to pitch the offer.*
8. **Victorian unclaimed money.** §4.9 closes the primary route; §4.9.5's guards cover the residual one.
9. **Unfair contract terms.** The terms must present payout details as an **eligibility condition**,
   never as a withholding of money already owed (§4.9.1).
10. **Right to end or change the program.** §4.7 commits to honouring promises already made, including
    not bringing a discount deadline forward. The terms must say the same thing, in the same direction —
    and note that the system has no "hard stop": a program that ends is a program switched off, with its
    commitments still running (§4.7).
11. **Disclosure inherent in a percentage.** The terms must say what each party will see.
12. **Advertising a time-limited discount.** Conditions must be clear at the point the claim is made.
13. **Privacy policy page.** `src/pages/PrivacyPolicyPage.tsx` must be updated for referral data,
    payout details and the access log before launch.

---

## 12. Decisions needed (owner)

**None. This list is empty.**

All eighteen decisions raised across revisions 1–9 (D1–D18) are answered. Nothing rests on an
unapproved assumption, and there are no `ASSUMED:` tags left to veto.

Two things I decided myself that the owner may still want to veto, flagged rather than buried:

- **The 30-day expiry-reminder email** (§4.6.4, AC-77).
- **The discount lapses with the referral at 12 months** (§4.6.4) — follows from A7, but it is now
  *advertised*, so it is stated explicitly and shown honestly rather than being allowed to vanish.

The only outstanding external inputs are **not decisions and do not block implementation**: the
rules/T&Cs copy in progress, and the professional confirmations at §11 items 1–12, required before
**launch**, not before **build**.

---

## 12A. Search-engine behaviour

Two rules, both easy to "tidy" into their own opposites.

### 12A.1 `/r/<CODE>` — noindex, but deliberately crawlable

Share links are functional redirects, not content. They must never appear in search results (AC-89).
The destination is `/refer` in every program status.

**The rule that looks like a mistake and is not:** the path is marked `noindex` **and is deliberately
left crawlable — there is no `robots.txt` disallow.** A disallow prevents a crawler fetching the URL at
all, which means it never sees the `noindex` and the directive is dead. A URL that is widely shared but
uncrawlable can still be indexed on the strength of inbound links alone, with no content — the worst of
both outcomes. **A directive has to be seen to be obeyed.** Anyone "hardening" this by adding a
disallow would be removing the only thing making it work.

*(The landing page itself has no status-dependent search behaviour — see §4.7. It is indexed and
sitemapped in every status, exactly like every other marketing page.)*

### 12A.2 The FAQ exists twice only as two different documents

The landing page carries three or four conversion questions; the Sanity `post` carries the long tail
(rules, terms, edge cases). **I have made this an acceptance criterion (AC-90) rather than a copy
checklist item**, on the coordinator's reasoning and my own: "don't duplicate" is exactly the kind of
instruction that erodes silently at authoring time, months later, by someone who never read this
document. A criterion has a name and a reviewer.

- The article **extends** the landing FAQ; it does not restate its questions or answers. The two pages
  target different queries, and a restated article competes with its own landing page — both do worse.
- **No canonical between them.** `canonicalUrl` (`src/data/seo.ts:95`) is for duplicate documents.
  These are deliberately different documents, and cross-canonicalising asks a search engine to discard
  one. Each page stays canonical to itself. If a copy pass finds the article merely restating the
  landing content, **the fix is the content, not canonical plumbing.**
- The two interlink — "the short version" ↔ "full details, rules and terms" — which is also the
  answer-engine-correct shape: one authoritative long-form source, one conversion surface.
- If FAQ structured data is ever added, it goes on exactly one page.

---

## 13. Ticket breakdown

The architect's design owns the final sequencing; this is the product view of what each ticket has to
end with.

1. **T0/T1 — Golden capture, schema + config API.** Pricing fixtures captured from `main` first
   (AC-49a), then migration `0051`, `worker/lib/referrals.ts` skeleton, `GET /api/referral/program`,
   ops program GET/PUT including the On/Off switch and the threshold acknowledgement.
2. **T2 — Pricing composition.** Extend `loadAccountDiscount` (additive, server-side only); snapshot
   breakdown; eligibility ends on first order or expiry; the AC-72 re-price. **Highest-risk ticket —
   it carries AC-49 in full.** *Demo: two identical quotes, one referred, side by side, plus the
   unchanged fixture run.*
3. **T3 — Codes and attribution.** Payability predicate, payout-details endpoint, code withheld until
   complete, dormancy, `/r/<CODE>` with its **noindex directive** (AC-89), cookie, `findOrCreateUser`
   hook, manual claim, all §4.2 gates, **the §7.0 boundary enforced at the endpoint layer** (AC-78),
   **and the A18/D18 separation regression test** (AC-87).
4. **T4 — Earning lifecycle.** Earning on order creation, confirm at `balance_paid` for a payable
   referrer, hold at `pending` otherwise, void on cancel/refund, expiry sweep, post-discount ex-GST
   base, payment-timeframe stamping.
5. **T5 — Account area (both screens).** The referrer's Referrals section — **entry state first**
   (AC-83) — and the referred tradie's §8.6 offer panel. Includes the §7.1 access-log write path, and
   no viewer.
6. **T6 — Quote surface.** The discount indicator on the money panel and issued quote; ops
   project-record visibility and review flags.
7. **T7 — Landing page and placements.** `/refer` in all its states, the Sanity `page` record, sitemap
   entry, placements and footer link, **the Off-state banner and post-login message** (AC-62), every
   figure from config, and the s 49 / two-facts copy constraints applied.
8. **T8 — Ops tab.** Program screen with the On/Off switch, referrals list + void + bulk void, payouts
   queue with ready/accruing groups, deadline flagging, long-stop promotion, CSV export, mark
   paid/failed, frozen banking snapshot, dashboard row.
9. **T9 — Emails, rules pages, privacy policy.** Four transactional templates with inline fallbacks;
   rules and T&Cs published as posts **under the §12A.2 governance rule** (AC-90); privacy policy
   update covering referral data, payout details and the access log.

UI-bearing tickets (T5, T6, T7, T8) require the ux-designer's mock and the **UX mock gate** before any
implementation.
