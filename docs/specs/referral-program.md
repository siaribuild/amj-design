# Referral program — specification

Branch: `feat/referral-program`
Status: **revision 6 — FINAL. Every owner decision is answered; §12 is empty. Architect has started;
revision 6 changes are surgical additions from the legal research, not a rework.**
Author: product-manager
Date: 2026-08-15

**Revision 2:** rate set to 1% and every number moved into ops config · cap removed (field kept,
nullable) · minimum payout balance added (default off) · bank-detail audit logging dropped · terms
drafted-pending-review rather than absent · launch ON · kill switch as a distinct *termination* state ·
**program became double-sided — the referred tradie gets a discount on their first order (§4.6), which
puts this feature inside the pricing path.**

**Revision 3:** discount settled at **2.5%, as a percentage** through the existing pricing step
(fixed-dollar and free-delivery recorded as rejected alternatives) · stacking **additive**, no ceiling ·
**termination honours what was already promised** as one rule with two limbs · **AC-49 given a concrete
proof method** · legal research cross-reference and contradiction protocol.

**Revision 4:** owner required the referral discount to be **presented in the account area**.

**Revision 5:** **the standing account discount is never surfaced — anywhere.** The account panel shows
the **referral increment only and never a combined total** (§4.6.3, AC-75). Tone corrected to *one-off
offer with a clock*: explicit, honestly-displayed **expiry** (§4.6.4) and a reminder before it lapses.

**Revision 6 — from `docs/specs/referral-program-legal-research.md`, which landed after revision 5.
Four surgical changes, nothing else reworked:**

1. **§7.1 reversed on audit** — the owner changed their mind on new evidence (OAIC lists audit logs of
   access to financial information among APP 11 security expectations; research §5.1 finds the business
   may be a full APP entity, not an exempt small business). A **minimal invisible access log** is now
   in. **No UI, no screen, no workflow — and a viewer for it is explicitly out of scope** (AC-82).
2. **New architectural rule (§7, AC-78):** a referrer may **never** submit a mate's contact details.
   Attribution is always the referred tradie self-identifying. This is what keeps the business outside
   Privacy Act s 6D(4)(d), and the stakes are the whole business's privacy status.
3. **A18 promoted to compliance-load-bearing** (ACL s 49, referral selling) with a copy constraint on
   the §8.2 placements (AC-79); **an explicit payment timeframe added** (ACL s 32(2)) with the payout
   threshold disclosed up front (AC-80, AC-81).
4. **A13's claim softened** — one person may legitimately hold several ABNs, so the same-ABN gate is
   kept but no longer described as *preventing* self-referral.

> **Five things that must survive to implementation.** These are the ones most likely to be lost, or
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
> 4. **§4.6.6 — the same-ABN gate cannot fire at the moment the discount is granted** (no ABN is
>    collected at signup) **and does not prove common identity even when it does fire** (one person may
>    hold several ABNs legitimately). The containment argument, not the gate, is what makes the discount
>    safe. **No later revision may upgrade this to "blocked automatically".**
> 5. **§8.6 — the panel is an offer with a deadline, not a receipt.** Accurate about mechanics (the
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

- A registered user can find their code, share it in under 10 seconds, and explain the deal from
  memory.
- A tradie who arrives with a code sees the discount **while they are quoting**, knows it is one-off,
  and knows when it runs out.
- A referred tradie's first order automatically produces a payable amount with no staff data entry.
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
| **Referrer (B)** | An existing registered user (`user` row, `type='customer'`) | Shares a code/link, watches referrals and earnings, supplies payout details, gets paid. **Never enters anything about the mate they referred.** |
| **Referred tradie (A)** | A person with no OpenFrame account yet | Arrives via link or types a code, registers, **quotes at a discount**, orders. **Always self-identifies** (§7, AC-78). |
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
  (`POST /api/auth/profile`). This is load-bearing for the abuse analysis in §4.6.6.

---

## 3. The program, as a tradie reads it

> **Refer a mate. You both win.**
> Share your code. Your mate gets **2.5% off their first order**. When they place it and pay in full,
> we pay you **1% of that order** — cash, into your bank account, within **14 days**.
> Their first order needs to be at least **$2,000** (ex GST, before delivery). You'll need an ABN on
> your account to be paid.

Five sentences, two numbers. Both sides get something, which is what makes the introduction easy to
make — B is not asking a mate for a favour, B is giving them a discount.

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
| A1 | **Two capture paths, one relationship — both self-identifying.** (a) **Link**: `https://<site>/r/<CODE>` sets an httpOnly cookie and 302-redirects to `/refer`. (b) **Manual code**: the referred user types the code into a field in their own account area after signing in. **There is no third path in which the referrer supplies anything about their mate** (§7, AC-78). | DECIDED |
| A2 | Why both: a link only works when the introduction happens over a phone. Half of these introductions happen at a job site — B reads the code out, A types it in later. A link-only program silently loses those. Both paths write the same `referral` row. | DECIDED |
| A3 | **The code is never asked for on the sign-in screen.** `POST /api/auth/challenge` is deliberately non-enumerating (`worker/routes/auth.ts:35`), so the server cannot reveal whether an email is new and cannot conditionally show a "new user" field. A field shown to everyone would be typed by returning customers claiming a referral on themselves. | DECIDED |
| A4 | **A referral is only recorded when the `user` row is CREATED.** An existing customer clicking a referral link is not a referral, ever. | DECIDED |
| A5 | Manual code entry is allowed **until the account's first order exists**, once only. After that the field disappears. | OWNER |
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
| A13 | **Same ABN as the referrer → refused.** Kept as a cheap signal, **but it must not be described as preventing self-referral** (research §7.2): the ABR confirms one person may legitimately hold several ABNs across different structures — a sole trader and their own Pty Ltd are two ABNs, one human. Two further limits: no ABN exists at signup, so it cannot fire at capture time for most accounts; and it runs again at earn time, voiding the earning. It does **not** protect the discount — see §4.6.6, where the containment argument does the real work. | Automatic, late, partial |
| A14 | **Staff accounts cannot refer or be referred** (`user.type='internal'`) | Automatic |
| A15 | **Same delivery postcode is NOT a block** — a suburb full of tradies is the target market, not fraud. Ops sees it as a review flag, nothing more. | Manual review |
| A16 | Referrer's account must be `active` at payout time | Automatic gate, ops-overridable |
| A17 | **Ops can void any referral or earning, with a mandatory reason, at any point before it is paid.** The reason is an operational record, not audit apparatus — it is what a staff member reads later to understand why money did not go out. | Manual |
| A18 | **Anyone with a registered account may refer, including someone who has never ordered.** Money only moves when a genuine qualifying order is paid in full. **⚠️ COMPLIANCE-LOAD-BEARING — see §4.8.** This was a scope decision in revision 1; the legal research finds it is most likely what keeps the business outside ACL s 49 (referral selling), a strict-liability offence. It is no longer a preference and must not be "tightened" into a requirement that the referrer has ordered. | DECIDED (compliance) |

### 4.3 Money — the referrer's commission

| # | Decision | |
|---|---|---|
| M1 | **Commission base = the referred order's goods value, EX GST, EXCLUDING delivery.** | DECIDED |
| M2 | Why ex-GST: GST is collected on the ATO's behalf, not revenue — commission on it is commission on someone else's money. Why excluding delivery: freight is a pass-through carrying no margin (`migrations/0044_delivery_pricing.sql` — "that cost has come out of margin on every job"). Paying 1% of freight is paying to ship. | DECIDED |
| M3 | **How the base is computed — one place per fact.** Catalogue prices are stored **GST-inclusive** (`src/data/gst.ts:1`). The order already separates the components: `goods = (total ?? 0) - (delivery_total ?? 0)` (`worker/lib/orders.ts:127`). The ex-GST figure MUST come from the existing `taxBreakdown()` rule in `src/data/gst.ts` (per-line taxable-supply rounding), **not** a fresh `/1.1` in the referral module — otherwise the base disagrees by cents with the ex-GST goods figure on the customer's own order screen. `src/data/*` is already imported by the Worker (`worker/lib/orders.ts:7`). | DECIDED |
| M4 | **Rate: 1% of ex-GST goods, configurable in ops** (`rate_percent`). Flat, not tiered. | OWNER |
| M5 | **No cap.** `cap_amount` exists in the schema, is **nullable**, and ships **NULL = no cap** — present so a future cap needs no migration. Everything that renders the rules must omit the cap clause entirely when it is NULL, never print an empty slot or "up to $". | OWNER |
| M6 | **Qualifying minimum: the referred first order must be ≥ `min_order_amount` ex-GST goods — default $2,000, configurable in ops.** | OWNER |
| M7 | **Minimum payout balance** (`min_payout_balance`), **default $0 = off.** At 1%, a $2,000 order earns $20, so a tiny transfer is possible — hence this field. When set, a referrer's confirmed balance below it is held (visible, accruing, never lost) until it crosses the threshold. **Ships off**, so the default behaviour is "we pay you what you earned". **If it is ever switched on, it must be disclosed at the point the offer is made** — §4.8, AC-81. | OWNER |
| M8 | **Earned vs payable.** `pending` the moment the referred order is created — the customer accepted the quote. `confirmed` (payable) when that order reaches stage **`balance_paid`**, i.e. paid 100% (`worker/lib/orders.ts:80`). No separate hold period: full payment IS the maturation, and it is an existing state, so no new lifecycle is invented. | OWNER |
| M9 | If the order is cancelled or `payment_status='refunded'` before payout, the earning is voided automatically. After payout there is **no clawback in v1** — exposure is negligible because money only becomes payable after the customer has paid in full. | DECIDED |
| M10 | **Rate is snapshotted onto the referral when the referral is RECORDED**, not read live at earn time. Changing the rate in ops must never retroactively change what someone was already promised. The config is the source of truth for *new* referrals; the referral row is the source of truth for money already promised. | DECIDED |
| M11 | **Payout mechanism: manual bank transfer by staff, recorded in ops.** No payment rail, no API, no automated disbursement. The system tells staff who to pay and how much, captures the reference of the transfer they made, and keeps a record the accountant can reconcile. This is *tracking*, not a payments integration. | DECIDED |
| M12 | **Payout requires a valid ABN on the referrer's account**, plus BSB, account number and account name. No ABN → the earning stays `confirmed` and the account area says exactly what is missing. | OWNER |
| M13 | **The advertised commission is inclusive of any GST payable.** "We pay you $200" means $200 lands in the account, whether or not the referrer is GST-registered. See §11. | OWNER |
| M14 | **A stated payment timeframe: `payout_within_days`, default 14 days** from the referred order being paid in full, configurable in ops. **⚠️ COMPLIANCE-LOAD-BEARING — see §4.8** (ACL s 32(2)). Comfortably achievable with a weekly payout run; the timeframe is a promise, so it is stated wherever the offer is made rather than left open-ended. | DECIDED (compliance) |

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
| **Every number** (commission rate, **discount**, minimum, window, cap, payout threshold, **payment timeframe**) | **The program config in D1, rendered into the copy at runtime** | See below — now load-bearing. |
| Plain-English rules and full T&Cs | **Sanity `post`**, linked from the landing page | Supplied by the coordinator (§11); revised by a human who is not deploying code. |

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

The two alternatives are **recorded here as rejected, not as options**. The reasoning is kept so a
future reader knows the ground was covered and what it would cost to change course:

| Form | Fits the code? | Cost if ever revisited |
|---|---|---|
| **Percentage — CHOSEN** | Yes — rides the existing per-line percentage step exactly | Small. One function extended, one config field, one badge on the quote surface, one account panel. |
| Fixed dollar amount off — **rejected, out of scope** | No | An order-level adjustment. Needs a new totals row, a new column on the order, changes to `depositOf`/`balanceOf` (`worker/lib/orders.ts:45`), to `taxBreakdown`, to the order DTO and to every money panel — the "one list and one money panel at every stage" invariant from the quote-revisions refactor gains a second thing to render. Also awkward per-line: $200 off a 40-opening quote is invisible. |
| Free delivery — **rejected, out of scope** | No, and risky | Delivery is a project-level charge whose NULL/0 distinction is the *issue gate* (`migrations/0044_delivery_pricing.sql`: "the single most likely defect in the whole feature"). Writing 0 into `delivery_amount` to mean "free for a referral" is indistinguishable from "a human said zero", and would let an unpriced job pass the issue gate. Would need a separate waiver flag and careful gate work. |

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

The consequence is a hard rule with its own criterion (AC-75), and it needs stating because it is
counter-intuitive:

> **Show the referral increment (2.5%) and nothing else. Never a combined total.**
> A "7.5% total" discloses the standing 5% by subtraction exactly as effectively as printing the 5%
> itself. There is no version of a total that keeps the standing discount private.

The referral discount is therefore presented as a **standalone offer** — unrelated to, and not
additive with, anything else the customer can see. There is nothing on any customer surface for it to
be added to, which is precisely why this reads naturally rather than evasively.

**There is nothing for a customer to reconcile it against.** This site publishes no list price: a
product page shows no price at all (the only price reference in `ProductDetailPage.tsx` is the
visitor's own quote total), and every figure a customer sees is a quote produced for them. So a
partial disclosure creates no discoverable arithmetic gap — the concern that would normally argue for
itemising simply does not arise here.

Applies to: the account panel (§8.6), the quote badge (§8.5), the landing page, every marketing
placement, and every email. Ops screens are unaffected — staff see the full composition.

#### 4.6.4 When it applies, when it lapses, and when it stops

**Two endings, both customer-visible, both shown honestly.**

1. **Used** — the discount applies while the referred account has **no order**. The moment their first
   order is created, eligibility ends. That is the intended, happy ending: it did its job.
2. **Expired** — if no first order is placed within the attribution window (A7, default 12 months),
   **the referral lapses and the discount lapses with it.** This follows from A7 and is already
   enforced by AC-13; revision 5 makes it explicit because it is now *advertised* and therefore a
   promise being withdrawn on a timer.

**The expiry is a feature, not fine print.** The owner's rationale for the discount is that it is *"an
incentive to place an order… a one-off"*, and an incentive with no deadline is not an incentive. So the
deadline is **stated up front, wherever the discount is offered**, and counted down honestly in the
account panel (§8.6). It must never simply vanish.

- **Evaluated per pricing call**, exactly as the account discount is. No stored flag to go stale, and
  the lifecycle state is derived rather than stored (§7).
- **An issued quote is a price offer and is never re-priced under the customer.** If eligibility ends —
  by use or by expiry — between issue and acceptance, the issued price stands.
- **A reminder before it lapses.** One email, 30 days before expiry, to a referred account that still
  has the discount available and has not ordered. This is my decision, not the owner's, and the
  reasoning is the owner's own: a deadline nobody is reminded of generates neither urgency nor
  goodwill, only complaints when the price moves. The notification machinery already exists
  (`worker/lib/email.ts`), so the cost is one template. Vetoable.
- **The stale-draft contradiction, and its resolution.** Line totals are stored, not recomputed on
  read, so a referred user with two open drafts who orders one would otherwise keep seeing
  referral-discounted figures on the other — while the account panel says the discount is used. Same
  problem on expiry. **Required outcome (AC-72): once the discount has been used or has expired, no
  customer-facing surface may present it as still available, and no unissued draft may present
  referral-discounted figures as current** — the draft is either re-priced without the referral
  discount or visibly marked as needing re-pricing before its figures are relied on. The architect
  chooses the mechanism; re-pricing the user's other unissued drafts at first-order creation (and on
  expiry) is the obvious candidate and is bounded work. Issued quotes remain exempt (AC-54).
- **Line price overrides** (`migrations/0046_line_price_override.sql`, `ops.put("/lines/:id/price")`)
  bypass the engine entirely. An overridden line does not receive the referral discount, and that is
  correct: a human set that number deliberately. An edge case, not a bug (AC-59).

#### 4.6.5 The qualifying minimum applies to the POST-discount value

The referrer's `min_order_amount` floor is tested against **the same figure the commission is computed
on**: post-discount, ex-GST, excluding delivery. Justification: one number, one meaning. A pre-discount
figure appears nowhere else in the system, exists on no screen, and would have to be reconstructed
from a phantom pricing pass purely to evaluate one threshold. The knife-edge case (an order that
qualifies before the discount and not after) is accepted and is what the ops void/override is for.

#### 4.6.6 Abuse — the discount is the more attackable half

**This assessment must not be softened by a later revision.** If a future change genuinely closes the
gap, the change gets described; the gap does not get re-labelled. The legal research (§7.2) strengthens
this reasoning rather than weakening it.

- The discount is **immediate**, needs **no ABN and no bank details**, and is claimable by anyone who
  can create an email address. The §4.2 gates were designed around the payout and only partly cover
  it: A11/A12/A14 hold, but **A13 (same ABN) cannot fire at signup, because no ABN is collected
  then — and even when it does fire it does not prove common identity**, because one person may
  legitimately hold several ABNs across different structures (a sole trader and their own Pty Ltd).
  Self-referral via a second email address is therefore **not** automatically blocked, and the ABN gate
  should be understood as a cheap signal, not a control.
- **What actually contains it:** this business issues no price without a human. Every quote is priced
  and reviewed in ops before issue, and the perpetrator must place and pay for a real order to a real
  address. The maximum gain is the discount percentage of one order they actually buy; the maximum
  loss to the business is that same percentage — **bounded, and self-funding, because the "attacker"
  has bought windows.** There is no cash-out path: the commission side requires an ABN, bank details
  and a fully paid order.
- **What we add:** the ops referrals list flags a referral where the two accounts share an ABN, phone
  number, business name or delivery postcode. A reviewer sees the flag on the project record before
  issuing the quote (AC-58). Ops can void the referral and re-price the project, which removes the
  discount from any not-yet-issued quote.
- **What we do not add:** identity verification, ABN-at-signup, or blocking on postcode. Each costs
  real conversion on the majority of honest users to prevent a bounded, self-funding loss.

#### 4.6.7 Independently switchable

The two sides are separately switchable in ops (`referrer_reward_active`, `referred_discount_active`)
inside one program. Cheap, and it lets the owner stop the discount if margin bites without killing the
referrer payout — or run a discount-only period. Both default ON at launch (AC-60).

### 4.7 Program status and the kill switch

`referral_program.status` has **three** values, because the owner explicitly distinguished a
termination from an on/off toggle:

| Status | New referrals | Marketing + landing page | Account Referrals section | Promises already made |
|---|---|---|---|---|
| `active` | Recorded | Full pitch | Full | Run normally |
| `paused` | Not recorded | Placements hidden; `/refer` returns 200 saying the program is **on hold** | Full, unchanged | Run normally |
| `terminated` | Not recorded | Placements removed; `/refer` returns 200 with **"this program has ended"** | Read-only history + ended notice for anyone with history; **absent entirely** for anyone without | **Honoured — see below** |

#### THE RULE: termination honours what was already promised

**One rule, two limbs.** Terminating the program stops *new attribution*. It does not withdraw
anything already promised to a real person, and the two limbs must be implemented and tested together
so they cannot drift apart:

- **Limb 1 — money.** A `pending` earning still confirms when its order reaches `balance_paid`, and a
  `confirmed` earning is still paid out in the next run, within the stated timeframe (M14). (AC-65)
- **Limb 2 — the discount.** A referral already recorded **keeps its first-order discount** until the
  account orders **or its window expires on the timetable it was given** — termination does not bring
  that deadline forward. An already-issued quote is never re-priced. (AC-66)

Both limbs are the same principle as M10's rate snapshot: what a person was told when they acted is
what they get. It is the only defensible position when real cash and a real price were advertised, and
§11 requires the terms to say the same thing rather than reserving a broader right.

If ops ever needs to stop in-flight promises, that is a **separate, deliberate act** — a bulk void
with a mandatory reason and its own confirmation — never a side effect of flipping a switch (AC-67).

`/refer` never 404s in any status: by then the URL is on business cards and in text messages.
`terminated` is reversible by an admin, with a confirmation stating that restarting attributes nothing
retroactively (AC-68).

### 4.8 Australian Consumer Law constraints on the offer *(new in revision 6)*

Two findings from the legal research bind the design, not just the terms. Both are recorded here
because they constrain what the **surfaces are allowed to say**, which is a spec concern rather than a
copy concern.

**(a) ACL s 49 — referral selling.** A strict-liability offence with penalties to $100m for a body
corporate. It is engaged where a supplier induces a consumer to buy by promising a rebate or benefit
**contingent on that consumer supplying names of prospective customers, or otherwise assisting the
supplier to make a sale to someone else, where the benefit is contingent on an event occurring after
the contract is made.**

**A18 is what most likely keeps the business outside it**, and it is therefore promoted from a scope
decision to a compliance constraint. Two consequences:

- **A18 must not be tightened.** Requiring the referrer to have ordered before they can earn would
  couple the reward to their own purchase, which is the shape s 49 is about. Anyone proposing that
  change must be sent back to this section.
- **The §8.2 placements must never couple the referrer's reward to the referrer's own purchase.**
  *"Place your first order and earn 1% on every mate you refer"* is inside the shape of s 49.
  *"Any account can refer — you don't need to have ordered"* is not. This binds the logged-out
  placements in particular, where the temptation to write a purchase-conditional pitch is highest
  (AC-79).

**(b) ACL s 32(2) — offering rebates, gifts and prizes.** A rebate must be provided **within the time
stated in the offer**, or within a reasonable time if none is stated. Two consequences:

- **A stated payment timeframe is mandatory, not optional** — hence M14 (`payout_within_days`, default
  14). It appears wherever the offer is made, from config like every other figure (AC-80).
- **`min_payout_balance` must be disclosed at the point the offer is made**, not discovered afterwards
  by a referrer whose money is being held. A held payment that was never mentioned in the offer is
  arguably not provided in accordance with it. The field ships **off** (M7), so this bites only if it
  is ever switched on — which is exactly when it would be forgotten, hence the criterion (AC-81).

---

## 5. In scope

1. Referral code per registered user; `/r/<CODE>` link; cookie capture; manual code entry.
2. Automatic referral recording at account creation, with the automatic gates (§4.2).
3. **The referred tradie's 2.5% first-order discount, delivered by extending `loadAccountDiscount` in
   the existing pricing engine** (§4.6) — including its visibility on the quote surface, **its offer
   panel in the account area (§8.6)**, its expiry handling, and its breakdown in the price snapshot.
4. Automatic earning creation at order creation, confirmation at `balance_paid`, voiding on
   cancel/refund/expiry; optional minimum payout balance; **a stated payment timeframe** (M14).
5. Public landing page at `/refer` (indexable, in the sitemap, SEO record in Sanity), with active /
   paused / terminated states.
6. Marketing placements: home page section, trade-account page section, footer link, post-delivery
   prompt on a completed order — **within the s 49 copy constraint** (§4.8).
7. Account area: a new **Referrals** section for the referrer, **and a pricing-side offer panel for the
   referred tradie**.
8. Ops console: a new **Referrals** tab — Program (every number + status + the two side switches),
   Referrals (list, review flags, void, bulk void), Payouts (weekly run, CSV export, record of
   payment).
9. Transactional emails: referral recorded, earning confirmed, payout sent, **and the 30-day
   discount-expiry reminder** (§4.6.4). Through the existing Sanity `emailTemplate` mechanism with
   inline fallbacks (`worker/lib/emailTemplates.ts`).
10. Migration `0051_referral_program.sql` (next after `0050_order_line_position.sql`).
11. **A minimal, invisible access log for payout bank details** (§7.1) — a write path only.
12. Privacy policy update covering bank details and referral data; rules + T&Cs published as Sanity
    posts from the text the coordinator supplies.

## 6. Out of scope

- **Any UI for the payout-details access log** — no screen, no report, no filter, no export, now or
  later (§7.1, AC-82). The owner accepted the log on the explicit basis that it is invisible.
- **Any path by which a referrer supplies a mate's name, phone, email or other contact detail** —
  including "invite by email", "send an SMS invite", contact-list import, or a referrals form with a
  recipient field (§7, AC-78). This is a compliance boundary, not a backlog item.
- Any automated payment rail (Zepto/Monoova/Stripe Connect/ABA file generation). Staff pay from their
  own banking.
- **Surfacing the standing account discount, anywhere, in any form — including as part of a total**
  (§4.6.3). Owner's explicit decision.
- **Fixed-dollar and free-delivery forms of the discount** — rejected in §4.6.2 and not being built.
- **A total-discount ceiling** — rejected in §4.6.3, with an explicit revisit trigger.
- **A worked dollar "you saved $X" figure** on any surface — §8.5 and §8.6 show percentages only in
  v1; the reasoning and the condition for adding one later are recorded there.
- Multi-level / chain commissions; tiered or promotional rates; time-limited bonus periods.
- Referral of ops users, manufacturers or suppliers.
- Automated tax-invoice or RCTI generation (§11) — the accountant works from the export in v1.
- Clawback of money already paid.
- Editing the maturation trigger from the console. It is one code path, deliberately.
- Per-customer editing of the base account discount (`user.discount_percent`) — no ops UI today and
  this feature does not add one.
- Any change to rate cards, surcharges, modifiers, delivery zones or GST arithmetic. **The referral
  discount is a percentage handed to the existing discount step; it changes no other pricing rule.**

---

## 7. Domain model and single-source rules

Migration **`0051_referral_program.sql`** (append-only; next after `0050`). Shapes are indicative — the
architect owns the final schema — but these invariants are not negotiable:

- `user.referral_code TEXT` + a `CREATE UNIQUE INDEX` on it. The code belongs to the account; there is
  no separate code table and no second place a code can live.
- `referral` — the **relationship**: referrer, referred (UNIQUE), code used, source (`link`|`manual`),
  the snapshotted program values in force when it was recorded (commission rate, cap, minimum order,
  window, **discount percent**, **payment timeframe**), status, `expires_at`, void reason, review
  flags, timestamps. **It holds no contact details for anyone — both parties are `user` foreign keys**
  (see the rule below).
- `referral_earning` — the **money**: referral, order, base amount (post-discount ex-GST goods),
  computed amount, status (`pending`|`confirmed`|`void`|`paid`), payout id, timestamps.
  *Two tables, not one*: voiding a relationship and voiding a payment are different acts with
  different reasons, the payout batch links to money rather than relationships, and it keeps the door
  open without a schema rewrite.
- `referral_payout` — one row per referrer per payment run: amount, status, reference, `paid_at`,
  `paid_by`, note, **and a frozen copy of the ABN, BSB, account number and account name used**.
- `referral_program` — singleton config (`id='default'`), versioned exactly like `pricing_policy`
  (`migrations/0015_estimator_pricing.sql:35`) for optimistic concurrency:
  `status` (`active`|`paused`|`terminated`), `referrer_reward_active`, `referred_discount_active`,
  `rate_percent` (default 1), `cap_amount` (**NULL**), `min_order_amount` (default 2000),
  `min_payout_balance` (default 0), `window_months` (default 12), `discount_percent` (**default 2.5**),
  **`payout_within_days` (default 14)**, `updated_at`, `updated_by`, `version`.
- Payout method on `user`: `payout_bsb`, `payout_account_number`, `payout_account_name`.
- **The discount's lifecycle state is derived, not stored.** *Available* / *used* / *expired* (§8.6.2)
  is computed from the `referral` row, its `expires_at` and the existence of the account's first
  order. A stored status column would be a second source of truth for a fact three existing records
  already answer.

**The migration is additive only.** It creates tables and adds columns. It must not rewrite, recompute
or touch a single existing `quote_line.line_total`, `order_line.line_total`, `"order".total` or
`payment.amount` — see AC-49c.

**Single-source rules that must not be violated:**

| Fact | The one place it lives |
|---|---|
| **Who a referred person is** | **The `user` row they created themselves.** See the boundary rule below — this one is a legal constraint, not an engineering preference. |
| What percentage off a user gets | `loadAccountDiscount()` in `worker/lib/estimator/pricing.ts` — extended to compose account + referral. No caller re-derives it, no React component knows about it. **The composition is server-side only and is never serialised to a customer response.** |
| How a discount is applied to a price | The existing discount step, `pricing.ts:195-203`. The referral discount adds no second application point. |
| GST arithmetic / ex-GST goods figure | `src/data/gst.ts` (`taxBreakdown`) — called, never re-derived |
| Order goods vs delivery split | `"order".total` / `"order".delivery_total`, read as `orderDto` reads them |
| Order lifecycle and `balance_paid` | `worker/lib/orders.ts` — observed; no stage added |
| Program numbers as advertised | `referral_program` → API → rendered into copy. **No figure is ever typed into prose** (§4.5, AC-76). |
| Money and discount already promised | The `referral` row's snapshot, never the live config |
| Referral business logic | `worker/lib/referrals.ts` — routes thin, no rules in components |

### 7.0 THE ATTRIBUTION BOUNDARY — a referrer never supplies a mate's details *(new in revision 6)*

> **A referrer shares a code. They never tell us anything about the person they are referring.**
> Every referral is created by the **referred tradie identifying themselves** — by arriving on a link
> that sets a cookie, or by typing a code into their own account. There is no field, endpoint, form,
> import or email flow anywhere in this system into which a referrer can enter another person's name,
> phone number, email address or any other contact detail.

**Why this is architectural and not a UX preference.** Privacy Act s 6D(4)(d) is one of the routes by
which a small business ceases to be exempt and becomes a full APP entity — it turns on disclosing
personal information about another individual to anyone else for a benefit, or collecting it from
someone else. On the facts of this design, the business is **not** collecting personal information
about one individual from another: the referrer supplies nothing, and the referred tradie provides
their own details in the ordinary course of registering. The legal research is explicit that a change
allowing referrer-submitted details **would alter that analysis materially**, and that **the stakes are
the entire business's privacy status, not just this feature.**

**What this forbids, concretely.** No "invite your mates by email". No SMS invite. No contact-list
import. No "who did you refer?" field. No recipient field on any referrals form. No ops screen that
lets staff record a referral on a name supplied by a referrer. Each of these is the sort of
well-intentioned growth addition that arrives as a two-line ticket; **it must hit this rule when it is
proposed** (AC-78).

**What it permits, and is enough for.** The referrer shares a code or a link through their own phone,
in their own words, on whatever channel they like. That is how the two capture paths in A1 already
work, so nothing is lost — the boundary costs this design nothing today, and only ever costs a feature
that must not be built.

### 7.1 Handling of payout bank details *(reversed in revision 6)*

Revision 2 removed audit logging at the owner's request ("sounds overcomplicated"). **Revision 6
reinstates a minimal form of it, because the owner changed their mind on new evidence:** the OAIC
lists audit logs of access to financial information among its APP 11 security expectations, and the
research's §5.1 finding on s 6D(4)(d) means the business may be a full APP entity rather than an
exempt small business.

**What is in:**

- **A minimal, invisible access log.** Every read and every change of payout bank details records
  **who, which record, and when**. That is the whole feature.
- **Reuse the existing `audit_event` table** (`migrations/0001_customer_core.sql:179`) rather than
  inventing a second log — one place per fact.
- **The log records the fact of access, never the value.** `before_json`/`after_json` must **not**
  contain the BSB or account number. Copying the details into a log to protect the details is
  self-defeating: it puts sensitive data in a second place and widens the exposure the log exists to
  detect.

**What is explicitly out — and this is a constraint, not an omission:**

- **No UI. No screen. No tab. No report. No export. No filter. No workflow.** The owner accepted this
  on the basis that it is a table nobody looks at until something goes wrong; a viewer would reinstate
  exactly the complexity they rejected. **Building one is out of scope now and later** (§6, AC-82). If
  something goes wrong, the table is queried directly.

**Unaffected — the three keeps from revision 2 stand:**

- **Masked read-back.** Once stored, the customer API never returns the full account number
  (`BSB 063-••• · account ••••1234`).
- **Staff-only full visibility**, on the ops payout screen.
- **The frozen copy of ABN/BSB/account number/account name on the `referral_payout` row.** This is
  **still not audit** — **it is the accountant's record of what was actually paid, and it must not
  mutate when the referrer later edits their details.**
- **Mandatory reason on a void**, and `paid_by` / `paid_at` on a payout — operational record.

> The risk flagged in revisions 2–5 (a misdirected payout with no record of who changed the details or
> when) is **closed** by this log.

---

## 8. Surfaces

The ux-designer owns layout, hierarchy and visual treatment. This section specifies **purpose, states
and required content** only.

### 8.1 Public landing page — `/refer`

- New `Page` id in `src/app/ui.tsx`, path in `src/app/routes.ts`, added to `PUBLIC_PAGES` in
  `worker/lib/shell.ts:41` so it is in the sitemap and indexable.
- **Purpose:** explain the deal well enough that a visitor can repeat it, and convert two audiences
  differently.
- **Content:** the two-sided promise with live figures; three steps; what qualifies; **that the
  discount is one-off and time-limited**; **when the referrer gets paid** (M14); how you get paid; link
  to the rules/T&Cs post; FAQ. The cap clause appears only when a cap is set; the payout threshold is
  stated whenever one is set (§4.8b).
- **States:** *logged out* (pitch + "Sign in to get your code", secondary "Get a quote" → `/quote`);
  *logged in* (pitch **plus the user's own code and share link**, copy button, prefilled share
  message); *paused* ("on hold", no rate, no code); *terminated* ("this program has ended", no rate,
  no code).
- **Sharing is by code and link only** — the page offers no way to enter someone else's contact
  details (§7.0).

### 8.2 Marketing placements

| Placement | Logged-out says | Logged-in says |
|---|---|---|
| **Home page**, one section low on the page (after "Good to know") | "Know another tradie? They get 2.5% off their first order and you get paid." → `/refer` | "Your code: **ABC-123** — Copy link" + earnings to date if any |
| **`/trade-account`**, one section | Same pitch, trade-framed | Code + copy link |
| **Footer**, site-wide | "Refer a mate" link | Same |
| **Completed order** (`delivered`/`after_sales`) + delivery email | n/a | "Happy with these? Refer a mate." + code |

All placements disappear when the program is `paused` or `terminated`. All carry the one-off, expiring
framing of the discount rather than presenting it as a standing entitlement.

**⚠️ s 49 copy constraint (§4.8a), binding on every placement and on the landing page.** No placement
may couple the referrer's reward to the referrer's own purchase. *"Place your first order and earn 1%
on every mate you refer"* is inside the shape of s 49; *"any account can refer — you don't need to have
ordered"* is not. The logged-out placements are where this temptation is highest, and where the
criterion (AC-79) bites hardest.

**Not placed:** product pages, the quote builder, review-and-accept, any payment screen. Never
interrupt a priced flow with a marketing offer. (The referred tradie's *discount badge* and the §8.6
panel are not marketing placements — they are pricing disclosure, and they stay.)

### 8.3 Account area — the "Referrals" section (the REFERRER's screen)

A rail item in `src/pages/AccountShell.tsx` (`AccountSection`), route `/referrals`. **This screen is
about money owed to the account holder for introductions they made.** A discount they received as
someone else's referral is a different subject and lives in §8.6.

1. **Your code** — code, full share link, copy button, prefilled SMS/WhatsApp message, and the
   one-sentence rule with live figures. **No recipient field, ever** (§7.0): the share message is
   handed to the referrer's own phone to send, and this system never learns who received it.
2. **Were you referred?** — the manual code field, shown only while eligible (A5), with clear feedback
   ("that code isn't valid", "you can't use your own code", "your account already has a referral").
   **On success it confirms the discount and points at §8.6** — the code is entered here, but the offer
   is explained where pricing lives, and the two must not tell the story twice.
3. **Your referrals** — one row per referred account: **business name if set, otherwise a masked
   email** (`j••••@gmail.com`), join date, status (*Signed up · Quoting · Ordered · Paid in full · Not
   eligible*). **Never** their phone, address, project details or order contents.
4. **Your earnings** — **Pending**, **Confirmed**, **Paid** (lifetime), each traceable to its referral,
   **and when a confirmed amount will be paid** (M14).
5. **How you get paid** — BSB, account number, account name, ABN status, as a checklist so a referrer
   with money waiting sees exactly what is blocking it. Saved values masked on read-back. **When
   `min_payout_balance` is set and the balance is under it**, say so plainly: *"You've earned $20. We
   pay out once your balance reaches $50."* — never a silent hold, and the threshold must also have
   been stated in the offer itself (§4.8b, AC-81).
6. **Payout history** — date, amount, reference, referrals covered.
7. **Terminated state** — read-only history with a "this program has ended" notice; absent entirely for
   an account with no referral history.

**Empty state:** a user with zero referrals sees the code, the rule, the share button and nothing else
— not an empty table with five headers.

### 8.4 Ops console — new "Referrals" tab

Added to `ALL_TABS` in `src/ops/OpsApp.tsx`; API under `/api/ops/referrals/*`. Three sub-screens,
following the `Pricing.tsx` sub-tab pattern. **There is no fourth sub-screen for the access log**
(§7.1).

**(a) Program** — every number: status (active/paused/**terminated**), the two side switches, commission
rate, cap (blank = no cap), qualifying minimum, minimum payout balance, attribution window, discount
percent, **payment timeframe**. Restates the settings in one sentence so a typo is visible. Warns that
changes apply only to referrals recorded from now on. Refuses a stale save (version check). Terminating
requires a typed confirmation and states plainly that promises already made are honoured. **Raising the
discount here must change every customer-facing figure with no code change** (AC-76).

**(b) Referrals** — list: referrer, referred, date, status, amount, **review flags** (shared ABN /
phone / business name / postcode — a signal for a human, not a control; A13). Filter by status; search
by code, referrer or referred email. Actions: **void** (mandatory reason) and **un-void**, plus a
separate, explicitly-confirmed **bulk void** which is the *only* way to stop in-flight promises.
**There is no "create referral" action** — staff cannot record a referral from a name a referrer
supplied (§7.0).

**(c) Payouts — the weekly job.**

> Open **Referrals → Payouts**. The top says *"Ready to pay: 6 referrers · $1,240"*. Click **Export
> CSV** (name, ABN, BSB, account number, account name, amount, referral references). Pay those six from
> the business banking. Paste the bank's reference against the batch, click **Mark paid**. Done.

- Confirmed earnings group **per referrer**, so one person with three earnings gets one transfer.
- **Anything approaching its stated payment deadline (M14) sorts to the top and is flagged** — the
  timeframe is a promise under ACL s 32(2), and a weekly run must not quietly let one slip.
- Referrers **below the minimum payout balance** (when set) appear in a separate "accruing" group —
  visible, excluded from the run, payable anyway by explicit override.
- Marking paid flips the included earnings to `paid`, stamps `paid_at`/`paid_by`, freezes the banking
  details onto the payout row, and emails each referrer.
- **Failed** returns earnings to the ready queue without losing history.
- **For the accountant:** a permanent payout record per referrer per run — amount, date, reference,
  ABN, account paid, referral/order ids — plus a date-range CSV export. Correct even after the referrer
  changes bank details or closes their account.
- The ops **dashboard** "Needs us" list gains one row when money is waiting: *"6 referral payouts ready
  ($1,240)"*. Zero-count rows render nothing, per the existing dashboard rule.

### 8.5 The quote surface — the discount while quoting

For the discount to convert it has to be visible **while quoting**, not discovered on the invoice.

- A discount indicator on the quote's money panel (`QuoteTotals`) and on the issued quote, naming the
  **referral component only** — *"Referral discount: 2.5% off, thanks to [Referrer business name]"* —
  and never a total (§4.6.3, AC-75).
- **A percentage, not a dollar saving, in v1.** A "you saved $X" figure requires a second pricing pass
  against an undiscounted baseline, doubling pricing work on every preview. A percentage has no GST
  dimension and needs no baseline. If a dollar figure is ever added it **must** respect the ex/inc
  preference (§4.4).
- The indicator disappears at the first pricing event after the discount is used or expires (§4.6.4,
  AC-57).
- Ops sees the composition on the project record and in the existing price-explain trace.

### 8.6 The account area's offer panel (the REFERRED TRADIE's screen)

The referral discount is **the only discount this business names to a customer**. The standing account
discount is not surfaced here or anywhere (§4.6.3) — verified as the current state of the code:
`discount_percent` appears in exactly one file (`worker/lib/estimator/pricing.ts`), the only match for
"discount" anywhere in `src/` is a code comment, and both price-preview endpoints return a bare total
and nothing about how it was reached. That silence is deliberate and is preserved.

#### 8.6.1 Where it lives, and why not in Referrals

**Home: the Account page, beside the existing "Price display" (ex/inc GST) preference** in
`AccountSettingsPage`. Reasons, in order of weight:

1. **It is about their price, not about the referral program.** From the referred tradie's point of
   view they are not participating in a program — they were given a one-off offer on their price. The
   account area already has exactly one place where "how my prices work" lives: the Price display card.
2. **The two audiences are different people** (§2). Putting a *received* offer inside the screen about
   *money you are owed for introductions you made* conflates them, and would leave a referred tradie
   who has never referred anyone hunting through a marketing screen for their price.
3. **It survives the program.** If the program is terminated, the Referrals section disappears for
   anyone without referral history (§4.7) — but a live discount must still be explicable, and per Limb
   2 it is still live.

**The Referrals section carries a pointer only**, from the "Were you referred?" confirmation (§8.3
item 2). One authoritative panel, one link to it — not the same story told twice.

#### 8.6.2 Required content — an offer with a clock

- **The referral percentage, alone.** No total, no second percentage, no reference to any other
  discount (AC-75). Read from the server; never computed in the browser (AC-73).
- **The deadline, stated wherever the offer is** — not buried. In the *available* state the panel leads
  with what they get and by when.
- **Three states, derived (§7), never a stored status:**
  - **Available** — "2.5% off your first order", the expiry date, and a sense of the time remaining.
    This is the state that should read as an offer worth acting on.
  - **Used** — past tense, naming the order it applied to and the date. It did its job.
  - **Expired** — past tense, with the date it lapsed and what it would have applied to. Honest, not
    apologetic, and never a silent disappearance.
- **Accurate about mechanics, urgent in tone.** The panel states that displayed prices **already
  include** the discount and that there is nothing to apply. **No redemption language anywhere** — no
  "apply", "redeem", "claim", "use at checkout", "voucher", and no code-entry step at order time. There
  is no redemption moment in this system: the discount is applied when the price is computed. Copy
  implying otherwise generates support calls and an expectation of a further reduction on top of the
  price already shown (AC-70). Urgency comes from the deadline and the one-off nature, never from
  inventing a redemption step.
- **No worked dollar figure in v1** (§6); if one is ever added it is a price and honours ex/inc
  (AC-74).
- **A non-referred account never sees this panel at all.**

#### 8.6.3 Interaction with the GST preference

The panel sits **on the price side** of the §4.4 contrast, not the payout side. A percentage is
unit-free, so toggling ex/inc changes nothing about the number shown — **that is arithmetic, not an
exemption**, and the panel must not be built on the assumption that discount figures are exempt the way
payout figures are. The prices that percentage acted on continue to honour the preference everywhere
(AC-56), and any dollar example added later honours it too (AC-74).

---

## 9. Draft copy

Marketing prose for the ux-designer to refine — **not the rules or the T&Cs**, which the coordinator
supplies (§11). `[rate]`, `[discount]`, `[minOrder]`, `[window]`, `[cap]`, `[payoutDays]` are slots
filled from config, **never typed as literals** (§4.5), and `[cap]` renders nothing at all when no cap
is set. All of it is subject to the s 49 constraint (§4.8a): nothing here may make the referrer's
reward conditional on the referrer's own purchase.

**Landing hero**
> **Refer a mate. You both win.**
> You already tell other tradies where you get your windows. Now there's something in it for both of
> you.

**The rule (one sentence, used everywhere)**
> Share your code — your mate gets **[discount]% off their first order**, and when they pay for it in
> full we pay you **[rate]% of it**, into your bank account within **[payoutDays] days**.

**Three steps**
1. **Share your code.** Text it, say it, send the link. Every account has one — **you don't need to
   have ordered yourself.**
2. **They save.** Your mate signs up with your code and gets **[discount]% off their first order** —
   it's on their quote from the start, and it's theirs for **[window] months**.
3. **You get paid.** Once they've paid that order in full, we transfer your **[rate]%**[ifCap: , up to
   [cap]] within **[payoutDays] days**.

**The fine print, in plain words**
- It's their **first order** that counts, and it has to be placed within **[window] months** of them
  signing up with your code.
- The order needs to be at least **[minOrder]** ex GST, before delivery.
- **[rate]%** is worked out on the **goods, excluding GST and delivery** — not the total on the invoice.
- We pay by **bank transfer**, within **[payoutDays] days** of your mate paying their order in full.
  [ifThreshold: We pay out once your balance reaches **[threshold]**.]
- You'll need an **ABN** and your bank details on your account.
- One code per new customer. You can't refer yourself, or another login for your own business.
- You get paid for the mates you refer — not for anyone they go on to refer.

**Home/trade placement, logged out**
> **Know another tradie?** They get **[discount]% off** their first order, you get **[rate]%** of it.
> Any account can refer. →

**Home/trade placement, logged in**
> **Your referral code: `ABC-123`** · Copy link · `[n]` mates referred · `[$]` earned

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

**Account, no referrals yet** *(Referrals section)*
> Nobody's used your code yet. Share it with one tradie this week — they save [discount]%, you earn
> [rate]%.

**Account, blocked on ABN**
> `[$]` is ready to pay you. Add your **ABN** and bank details and it goes out in the next payment run.

**Account, under the payout threshold** (only when one is set)
> You've earned **`[$]`**. We pay out once your balance reaches **`[threshold]`** — keep sharing.

**Account / landing, terminated**
> **This program has ended.** We're no longer taking new referrals. Anything you'd already earned is
> shown below and will still be paid.

**Email — a mate signed up**
> Good news — `[name]` just signed up with your code and got their **[discount]% off**. When they place
> their first order and pay it in full, your **[rate]%** is on its way.

**Email — earning confirmed**
> `[name]`'s order is paid in full, so you've earned **`[$]`**. It'll be in your account within
> **[payoutDays] days**. `[bankDetailsPrompt]`

**Email — paid**
> **`[$]` is on its way to your account.** Sent `[date]`, reference `[ref]`. Thanks for the
> introduction — keep them coming.

---

## 10. Acceptance criteria

Each is independently verifiable. Figures are whatever the ops config holds; no criterion hard-codes a
rate.

### Codes and sharing
- **AC-1** Every registered customer account has exactly one referral code, generated on first demand
  and stable thereafter. Requesting it twice returns the same code.
- **AC-2** Codes use an unambiguous uppercase alphabet with no `O`, `0`, `I` or `1`, so a code can be
  read out over a job-site phone call and typed back correctly.
- **AC-3** Codes are unique across all accounts; a generation collision retries rather than failing or
  reusing.
- **AC-4** `GET /r/<CODE>` for a valid code sets an httpOnly cookie and redirects (302) to `/refer`. An
  unknown code redirects to `/refer` **without** setting a cookie and without erroring.
- **AC-5** An internal (staff) account has no referral code and no referral surfaces.

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
  in ops. **This is a signal, not a proof of common identity (A13)** — the criterion tests the gate's
  behaviour, not a claim that self-referral is prevented.
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

Stated first among the pricing criteria because it outranks them. It is **not** satisfied by "we
didn't mean to change anything"; the tester must be able to *prove* it. Four parts, all required:

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
  `user.discount_percent`, in every status of the program including `terminated` and with
  `referred_discount_active` off.
- **AC-49c — The migration touches no stored price.** Applied to a copy of production data,
  `0051_referral_program.sql` leaves every existing `quote_line.line_total`, `order_line.line_total`,
  `"order".total`, `"order".delivery_total` and `payment.amount` **bitwise unchanged**. Verified by
  checksum/row comparison before and after, not by inspection of the SQL.
- **AC-49d — No existing pricing test is edited to pass.** If a pre-existing pricing test needs its
  expected values changed, that is a failure of this criterion, not a test that needs updating. The
  diff for `scripts/tests/` must show additions, not modified expectations, in the pricing suites.

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
  or by termination: the price the customer was offered is the price they can accept.
- **AC-55** No customer-facing response carries the base account discount or the combined effective
  percentage. The quote surface names the referral percentage only.
- **AC-56** With a referral discount applied, switching the account's GST display between `inc` and
  `ex` recalculates the quote's money panel exactly as it does for a non-referred account — the
  discount is inside the price and is **not** exempt from the preference.
- **AC-57** The customer-facing discount indicator on the quote disappears at the first pricing event
  after the discount is used or expires.
- **AC-58** The ops project record shows that a referral discount is applied, and shows any review flag
  (shared ABN, phone, business name or postcode) before a reviewer issues the quote.
- **AC-59** A line with an ops price override keeps the overridden price; the referral discount does
  not re-apply to it.
- **AC-60** With `referred_discount_active` off, referrals are still recorded and commissions still
  earned, but no quote receives a referral discount — and vice versa for `referrer_reward_active`.

### The account offer panel (§8.6)
- **AC-69** The panel appears on the **Account** page beside the price-display preference — not inside
  the Referrals section. The Referrals section's "Were you referred?" confirmation links to it and does
  not restate the offer's rules.
- **AC-70** The panel states that displayed prices **already include** the discount, and contains **no
  redemption language anywhere** — no "apply", "redeem", "claim", "use at checkout", "voucher", and no
  code-entry step at order time. Verified against the rendered copy, not the source strings.
- **AC-71** The panel shows exactly one of three derived states — **Available** (leading with the
  offer and its expiry date), **Used** (naming the order number and date it applied to), **Expired**
  (with the date) — computed from the referral row, its expiry and the existence of a first order, with
  no stored status column.
- **AC-72** **Once the discount has been used or has expired, no customer-facing surface presents it as
  still available, and no unissued draft presents referral-discounted figures as current** — the draft
  is either re-priced without the referral discount or visibly marked as needing re-pricing before its
  figures are relied on. Specifically: a referred user with two open drafts who orders one must not be
  able to see a "Used" panel and a still-referral-discounted second draft at the same time. (Issued
  quotes are exempt — AC-54 governs them.)
- **AC-73** The percentage in the panel comes from the server; the browser never computes it or any
  composition of it.
- **AC-74** Toggling the GST display preference changes no percentage in the panel (a percentage is
  unit-free), **and** no worked dollar figure appears in v1; if one is ever added, it moves with the
  preference exactly as a price does.
- **AC-75** **The panel shows the referral percentage and nothing else.** No combined total, no second
  percentage, no reference to the standing account discount, on this or any other customer-facing
  surface or API response — because a total discloses the standing discount by subtraction. A
  non-referred account sees no panel at all. (Regression-critical: this is the criterion most likely to
  be "improved" into a total by an implementation or polish pass.)
- **AC-77** A referred account that has not ordered receives the expiry-reminder email 30 days before
  its discount lapses, and no such email once the discount has been used, voided or already expired.

### The referrer's money
- **AC-15** When a referred user's first order is created, exactly one `referral_earning` row is created
  with status `pending`.
- **AC-16** The commission base equals the order's **post-discount ex-GST goods** figure computed
  through `src/data/gst.ts`, and equals to the cent the ex-GST goods figure the customer sees on that
  same order when their display preference is `ex`.
- **AC-17** The base **excludes** delivery: an order with a delivery amount produces the same commission
  as an identical order with zero delivery.
- **AC-18** An order below the configured qualifying minimum (measured post-discount) produces no
  earning, and the referral shows a status explaining why.
- **AC-19** With `cap_amount` NULL, an arbitrarily large order produces an uncapped commission; with a
  cap set, the commission is exactly the cap.
- **AC-20** The earning flips `pending` → `confirmed` when and only when the referred order reaches
  `balance_paid`. Earlier stages (including `deposit_paid`) leave it `pending`.
- **AC-21** Cancelling or refunding the referred order before payout voids the earning automatically,
  with a reason.
- **AC-22** A referred user's **second** order produces no further earning and no discount.
- **AC-23** Changing any program number in ops does not change the amount, discount, window or payment
  timeframe of any referral recorded before the change; a referral recorded after it uses the new
  values.
- **AC-24** Amounts are stored and displayed to the cent, and the sum of a payout's earnings equals the
  payout amount exactly.
- **AC-80** **The payment timeframe is stated wherever the offer is made** — landing page, placements,
  Referrals section and the earning-confirmed email — rendered from `payout_within_days`, never typed.
  A confirmed earning displays when it will be paid, and the ops payouts queue surfaces anything
  approaching that deadline. (Compliance — ACL s 32(2).)
- **AC-81** **When `min_payout_balance` is non-zero, the threshold appears in the offer itself** — on
  the landing page and in the placements' linked detail — and not only in the account area after a
  referrer's money is already being held. With it at 0 (default) no threshold language appears
  anywhere. (Compliance — ACL s 32(2).)

### Account area (Referrals section)
- **AC-25** The Referrals section shows the code, a working share link, and a copy control that puts the
  full URL on the clipboard — **and offers no field for a recipient's details** (AC-78).
- **AC-26** The referral list shows the referred party's business name, or a masked email when none is
  set, and never their phone, address, project or order contents.
- **AC-27** Pending, Confirmed and Paid totals each equal the sum of the underlying earning rows.
- **AC-28** With money confirmed but no ABN or no bank details, the section states specifically what is
  missing and that the money is held, not lost.
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
- **AC-82** **The payout-details access log exists, is written, and has no interface.** (a) Viewing or
  changing payout bank details writes an `audit_event` recording actor, record and time; (b) that
  record contains **no BSB or account number** in any field; (c) **no route, screen, tab, report,
  export or API endpoint exposes the log** — customer-facing or ops. Building one is a failure of this
  criterion, not an enhancement.

### Landing page, placements and configurability
- **AC-33** `/refer` is reachable, server-renders its `<head>` from the Sanity `page` record with site
  defaults filled in, and appears in `/sitemap.xml`.
- **AC-34** Logged out, `/refer` shows the pitch and a sign-in CTA and no code. Logged in, it shows the
  user's own code and share link.
- **AC-35** With no cap configured, no page renders a cap clause, an empty slot, or "up to $".
- **AC-36** The home page and `/trade-account` each carry exactly one referral placement, matching
  session state.
- **AC-37** A completed order shows the refer-a-mate prompt; an in-progress order does not.
- **AC-76** **Raising the discount is a config change and nothing else.** Changing `discount_percent`
  (and likewise `rate_percent`, `min_order_amount`, `window_months`, `payout_within_days`) in the ops
  console updates every customer-facing figure — landing page, home and trade placements, offer panel,
  quote badge, emails — with **no code change and no deploy**. Verified by grep as well as by test: no
  customer-facing string contains a hard-coded program figure.
- **AC-79** **No customer-facing copy makes the referrer's reward conditional on the referrer's own
  purchase.** Every placement, the landing page and every email are checked against this; the
  logged-out placements state or imply that any account can refer without having ordered. (Compliance —
  ACL s 49, strict liability.)

### Program status and the kill switch
- **AC-62** In `paused`, no new referral is recorded by link or manual entry, all placements are hidden,
  and `/refer` returns 200 saying the program is on hold.
- **AC-63** In `terminated`, `/refer` returns 200 with the "program has ended" notice — never a 404 —
  and shows no rate and no code.
- **AC-64** In `terminated`, an account **with** referral history still sees the Referrals section,
  read-only, with the ended notice; an account **without** history does not see the section at all. The
  §8.6 offer panel is unaffected for anyone whose discount is still live.
- **AC-65** **Termination honours what was already promised — limb 1, money.** Terminating leaves every
  in-flight earning intact: a `pending` earning still confirms when its order reaches `balance_paid`,
  and a `confirmed` earning still appears in the payouts queue and is still paid within its stated
  timeframe. (Regression-critical.)
- **AC-66** **Termination honours what was already promised — limb 2, the discount.** A referral
  recorded before termination keeps its first-order discount until the account orders or its window
  expires **on its original timetable** — termination does not bring the deadline forward — no issued
  quote is re-priced, and the §8.6 panel continues to show the discount as available.
  (Regression-critical. Tested in the same suite as AC-65 so the two limbs of one rule cannot drift
  apart.)
- **AC-67** Stopping in-flight promises is possible only through an explicitly confirmed bulk void with
  a reason — never as a side effect of a status change.
- **AC-68** Terminating requires a typed confirmation; reversing it states that nothing is attributed
  retroactively.

### Ops
- **AC-38** An admin can change every program number and status, and a concurrent stale save is refused
  rather than silently overwriting (version check).
- **AC-39** The referrals list filters by status and finds a referral by code, referrer email or
  referred email. **There is no action anywhere in ops that creates a referral from supplied contact
  details** (AC-78).
- **AC-40** Voiding requires a reason and removes the earning from the ready-to-pay queue.
- **AC-41** The payouts screen groups confirmed earnings **per referrer**, so a referrer with three
  earnings appears once with a single total.
- **AC-42** CSV export contains name, ABN, BSB, account number, account name, amount and referral
  references, and opens cleanly in a spreadsheet.
- **AC-43** Marking a payout paid records reference, date and staff member, flips its earnings to
  `paid`, freezes the banking details used onto the payout, and emails each referrer.
- **AC-44** Marking a payout failed returns its earnings to the ready queue without losing history.
- **AC-45** A payout record remains complete and unchanged after the referrer edits or clears their bank
  details.
- **AC-46** The ops dashboard shows a "referral payouts ready" row when at least one earning is
  confirmed, unpaid and above any threshold, and nothing when there are none.
- **AC-47** Referral endpoints are refused to non-staff; a customer cannot read another user's
  referrals, earnings or bank details by id.

---

## 11. Legal, tax and privacy — status and remaining sign-off

The coordinator supplies all the text — the plain-English rules and the T&Cs — researched against
Australian primary sources (ACCC / ATO / OAIC). **That research lives at
`docs/specs/referral-program-legal-research.md`** and feeds the copy; this spec does not duplicate it,
but revision 6 folds in the four findings that bind the design (§4.8, §7.0, §7.1, A13).

- **Everything drafted must be flagged in-repo and to the owner as requiring professional review before
  it is relied on.** Drafted terms are not vetted terms and must not be presented as such.
- The rules and T&Cs publish as Sanity `post` documents, linked from `/refer`.
- **No number appears in the terms as a literal.** Where the terms must state a rate, minimum, window or
  payment timeframe, they reference the published program page, so a config change in ops cannot leave
  the terms advertising a stale figure (§4.5).

**Contradiction protocol.** If further legal findings contradict a decision recorded here — the most
likely candidates being the GST-on-payout wording (M13), the right-to-terminate position (§4.7) and the
expiry of an advertised discount (§4.6.4) — the finding comes **back to this spec for a decision**, and
is not patched around in the copy. A rules page that says something different from what the system does
is worse than either one alone.

Items still requiring the owner's accountant or a lawyer:

1. **GST on the payout.** Position taken: the advertised amount is **inclusive of any GST payable**
   (M13). *Accountant to confirm.*
2. **Tax invoicing / RCTI.** If input credits are to be claimed, the business needs a tax invoice from
   the referrer or a written Recipient Created Tax Invoice agreement. v1 generates no such document;
   the accountant works from the CSV. *Accountant to confirm this is acceptable, or RCTI generation
   becomes a scope addition.*
3. **No-ABN withholding.** Requiring an ABN for payout (M12) is the recommended way to sidestep the 47%
   no-ABN withholding question. *Accountant to confirm.*
4. **Privacy Act status.** Research §5.1 finds s 6D(4)(d) may end the small business exemption for the
   **entire business**, not just this feature. §7.0's attribution boundary is what keeps this design
   outside that trigger, and §7.1's access log is the APP 11 response if the business is (or becomes) a
   full APP entity. *Legal to confirm the s 6D(4)(d) analysis.*
5. **ACL s 49 (referral selling)** — strict liability, penalties to $100m for a body corporate. A18 and
   the §8.2 copy constraint are the design's answer (§4.8a). *Legal to confirm.*
6. **ACL s 32(2) (rebates, gifts and prizes)** — the stated payment timeframe (M14) and up-front
   disclosure of any payout threshold are the design's answer (§4.8b). *Legal to confirm 14 days is
   consistent with what the terms will say.*
7. **Disclosure inherent in a percentage.** A percentage commission tells the referrer roughly what the
   referred tradie spent, and the referred tradie learns their mate is paid a percentage of their
   order. The terms must say what each party will see.
8. **Advertising a time-limited discount.** Conditions — first order only, minimum order value, the
   expiry — must be clear **at the point the claim is made**, not only in the terms.
9. **Right to terminate.** §4.7 commits to honouring promises already made, including not bringing a
   discount deadline forward. The terms must say the same thing, in the same direction.
10. **Privacy policy page.** `src/pages/PrivacyPolicyPage.tsx` must be updated for referral data,
    payout details and the access log before launch.

---

## 12. Decisions needed (owner)

**None. This list is empty.**

All seventeen decisions raised across revisions 1–5 (D1–D17) are answered, and revision 6's changes
came from the owner's own reversal plus legal findings. Nothing in this document rests on an unapproved
assumption, and there are no `ASSUMED:` tags left to veto.

Three things I decided myself that the owner may still want to veto, flagged here rather than buried:

- **The 30-day expiry-reminder email** (§4.6.4, AC-77). On the owner's own logic that the discount is
  an incentive to order: a deadline nobody is reminded of produces no urgency, only a complaint when
  the price moves. One template on existing machinery.
- **The discount lapses with the referral at 12 months** (§4.6.4). Follows from A7 and was already
  enforced by AC-13, so not re-raised as a question — but it is now *advertised*, so it is stated
  explicitly and shown honestly rather than being allowed to vanish.
- **`payout_within_days` defaults to 14** (M14). ACL s 32(2) requires *a* stated timeframe; the number
  is mine. 14 days is comfortably achievable with a weekly payout run and leaves slack for bank
  processing. Configurable, so it is a console edit if the owner prefers 7 or 21 — but it should not be
  set to something the weekly run cannot meet.

The only outstanding external inputs are **not decisions and do not block the architect**: the
rules/T&Cs copy in progress, and the professional confirmations at §11 items 1–6 and 8–9, required
before **launch**, not before **build**.

---

## 13. Suggested ticket breakdown (tracer-bullet order)

For the architect to confirm or restructure. Each ticket ends with something demonstrable.

1. **T1 — Schema + program config.** Migration `0051`, `worker/lib/referrals.ts` skeleton, ops Program
   screen (all numbers incl. `payout_within_days`, three statuses, two side switches),
   `GET /api/referral/program` returning the live figures. *Demo: change the rate in ops, see it come
   back from the public endpoint.*
2. **T2 — Codes and capture.** Code generation, `/r/<CODE>`, cookie, referral recorded at account
   creation, all §4.2 gates, **and the §7.0 boundary enforced at the endpoint layer** (AC-78).
   *Demo: click a link, sign up as a new email, see the referral in D1; a request carrying a referred
   person's contact details is refused.*
3. **T3 — The discount in the pricing engine.** Extend `loadAccountDiscount` to compose account +
   referral (additive, server-side only); snapshot breakdown; eligibility ends on first order or
   expiry; the AC-72 resolution for other unissued drafts. **Highest-risk ticket in the set — it
   touches the pricing path, so it lands before anything cosmetic and it carries AC-49 in full,
   including capturing the golden fixtures from `main` *before* the first line of referral code is
   written.** *Demo: two identical quotes, one referred, priced side by side, plus the unchanged
   fixture run.*
4. **T4 — Earning lifecycle.** Earning on order creation, confirm at `balance_paid`, void on
   cancel/refund, expiry sweep, post-discount ex-GST base through `src/data/gst.ts`, payment-timeframe
   stamping. *Demo: walk an order to balance paid, watch the earning confirm with the right cents and
   a due-by date.*
5. **T5 — Account area (both screens).** The referrer's Referrals section (code, share, list, earnings,
   manual entry, payout details, threshold copy, timeframe, history, terminated state) **and the
   referred tradie's §8.6 offer panel** (three states, deadline, past-tense mechanics, referral
   percentage only). **Includes the §7.1 access-log write path — and no viewer.**
   *Demo: a referrer sees a real pending earning; a referred tradie's panel moves Available → Used.*
6. **T6 — Quote surface.** The referral discount indicator on the money panel and issued quote; ops
   project-record visibility and review flags. *Demo: the referred tradie sees the discount while
   quoting, in both GST display modes, with no total anywhere.*
7. **T7 — Landing page and placements.** `/refer`, Sanity `page` record, sitemap, home/trade/footer/
   completed-order placements, all four states, every figure from config, **and the s 49 copy
   constraint applied** (AC-79).
8. **T8 — Ops payouts.** Referrals list + void + bulk void, payouts queue with threshold grouping and
   deadline flagging, CSV export, mark paid/failed, frozen banking snapshot, dashboard row. *Demo: the
   full weekly routine.*
9. **T9 — Emails, rules pages, privacy policy.** Four transactional templates (referral recorded,
   earning confirmed, payout sent, expiry reminder) with inline fallbacks; rules and T&Cs published as
   posts; privacy policy update covering referral data, payout details and the access log.

UI-bearing tickets (T5, T6, T7, T8) require the ux-designer's mock and the **UX mock gate** before any
implementation.
