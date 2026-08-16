# Referral program — specification

Branch: `feat/referral-program`
Status: **revision 13 — the postcode review flag is removed; D19 is settled (deferred, separate
thread). Everything is settled.**
Author: product-manager
Date: 2026-08-17

**Revision 2:** rate set to 1% and every number moved into ops config · cap removed (field kept,
nullable) · minimum payout balance added (default off) · launch ON · **program became double-sided —
the referred tradie gets a discount on their first order (§4.6), which puts this feature inside the
pricing path.**

**Revision 3:** discount settled at **2.5%, as a percentage** through the existing pricing step ·
stacking **additive**, no ceiling · **switching the program off honours what was already promised** ·
**AC-49 given a concrete proof method** · legal research cross-reference and contradiction protocol.

**Revision 4:** owner required the referral discount to be **presented in the account area**.

**Revision 5:** **the standing account discount is never surfaced — anywhere** (§4.6.3, AC-75). Tone
corrected to *one-off offer with a clock*: explicit **expiry** (§4.6.4) and a reminder before it lapses.

**Revision 6 — from the legal research:** bank-detail access log as a **minimal invisible log with no
viewer** (§7.1) · **a referrer may never submit a mate's contact details** (§7.0) · A18 promoted to
**compliance-load-bearing** under ACL s 49 · stated **payment timeframe** under ACL s 32(2) (§4.8).

**Revision 7 — D18:** payout details are a **precondition of becoming a referrer** (§4.9); the
"details missing" state is the **primary entry surface**; `payout_timeframe_days` = 14; **A18 and D18
kept un-conflatable** (§4.9.4, AC-87).

**Revision 9 — two states, not three.** Program status is **On/Off**, and Off means *come back later*
(§4.7).

**Revision 10 — three implementation-found corrections.** The access log gets **its own table**, not
`audit_event` (§7.1, AC-82) · `referral_program` survives `db:reset` (AC-91) · the ops rate-card
preview is a **deliberate** exception to the composition (§4.6.1, AC-51).

**Revision 11 — abuse-case criteria (§10A), AC-92 to AC-104.** Negative Given–When–Thens for financial
PII, each a concrete attempt the tester must make and see denied.

**Revision 13 — the postcode review flag is removed, because it could not be built.** The first Codex
review found it had no supporting data. There is no account-level address anywhere in the schema:
`delivery_postcode` (`0044:139`) and `delivery_suburb` (`0006:13`) live on `project`, and no column on
`user` has ever carried an address. The flag compared the referred job's delivery destination against
whichever of the referrer's projects last happened to carry one — arbitrary, potentially stale, and
not a shared account fact at all. **A flag that fires on ordinary customers is worse than no flag**,
because it teaches the reviewer to skim past the ones that mean something. Three flags now — ABN,
phone, business name — which are exactly the account-level identity facts `user` holds
(§4.2 A15, §4.6.6, §8.4b, AC-58).

**D19 is settled, and not by this document.** The trade account request form is a static mock and
`/api/enquiries` has no trade-account intent, so the capture point the revision-12 rule depends on does
not exist yet. The owner's ruling: the form is **a separate thread**, and Ops enters referral codes by
hand in the meantime. Option (c). Nothing in this feature builds it.

**Revision 12 — the attribution model changes, because revision 1's foundation was incomplete.**

Revision 1 established that registration is first sign-in (`findOrCreateUser`), and built both capture
paths on it. That is true but **it is not the normal path**: accounts are normally created **manually
by Ops**, acting on a trade account request. Every self-service assumption downstream inherited the
gap. The owner's rule, verbatim: *"If account is preexisting, it's not a referral. Ops may be in a
position to override this by request, but not by users themselves to get an extra discount."*

What changes: **A5 and AC-9 are replaced, not amended — self-linking by the account holder is gone
entirely** (§4.1) · the code is captured **on the account request form, before the account exists**,
and Ops links it at creation (A19) · **`POST /api/account/referrals/claim` is removed** (§6, AC-107) ·
the `of_ref` cookie **prefills the form's code field** (AC-105) · ops linking runs **the same gates**
as any other path, recording `source: 'manual'` with no new source value and no migration (AC-106).

**And it uncovered a prerequisite that does not exist.** The trade account request form is a **static
mock** — it posts nothing — and `/api/enquiries` has no trade-account intent. §4.1.1 states this
plainly and D19 asks how much of it this feature absorbs. Nothing else in the document moved.

> **Six things that must survive to implementation.** These are the ones most likely to be lost, or
> "helpfully improved", between this document and working code:
>
> 1. **AC-49 — non-referred pricing is unchanged, byte for byte.** It is the criterion the whole
>    feature lives or dies on, and it specifies *how that is proven*.
> 2. **AC-75 — never a combined total, never the standing discount.** A "7.5% total" discloses the
>    standing 5% by subtraction exactly as effectively as printing the 5% itself.
> 3. **AC-78 — no referrer-submitted contact details, ever.** Unchanged by revision 12, and §7.0 now
>    says why the new Ops-mediated path does not touch it.
> 4. **AC-87 — D18 gates on being PAYABLE, never on having PURCHASED.** "You must be a customer to
>    refer" is the ACL s 49 fact pattern — strict liability, penalties to $100m.
> 5. **AC-108 — a preexisting account is never a referral.** No path, privileged or otherwise, may
>    attach a referral to an account that already existed, except the deliberate Ops override.
> 6. **§10A — the abuse cases are attempts, not assertions.** Each is a request someone must actually
>    make and be refused.

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
standing on a job site, it is the wrong rule.**

### What success looks like

- A registered user can get set up as a referrer in one short step, find their code, share it in
  under 10 seconds, and explain the deal from memory.
- **A tradie who arrives with a code is linked at the moment their account is created** — never
  afterwards, and never by their own hand.
- A referred tradie sees the discount **while they are quoting**, knows it is one-off, and knows when
  it runs out.
- A referred tradie's first order automatically produces a payable amount with no staff data entry.
- **Every referrer who earns money can be paid.**
- One staff member can pay every confirmed referral in a weekly session of a few minutes.
- The business never pays commission on an order that was cancelled, refunded, or never paid for.
- Every number can be changed in the ops console without a deploy.
- **Nobody who is not part of the program notices it exists** — no existing price moves.
- **No account can see another account's money or banking**, and every attempt is refused without
  revealing whether the other account exists (§10A).

---

## 2. Actors

| Actor | Who they are | What they do here |
|---|---|---|
| **Referrer (B)** | An existing registered user (`type='customer'`) **with complete payout details** (§4.9) | Shares a code/link, watches referrals and earnings, gets paid. **Never enters anything about the mate they referred.** |
| **Prospective referrer** | A registered user without complete payout details | Meets the entry step: what they get, then one short form (§8.3). |
| **Applicant (A, pre-account)** | A tradie requesting a trade account, with no account yet | **Enters the referral code on the request form themselves** — the only place a referred party's code is captured (§4.1). |
| **Referred tradie (A)** | The same person once Ops creates their account | Quotes at a discount, orders. **Self-identified**, and **never gated by D18**. |
| **Visitor** | Logged-out, no account | Reads the landing page, sees the pitch on marketing pages |
| **Ops staff** | `user.type='internal'`, ops console behind Cloudflare Access | Creates accounts, **links the referral at creation** (A19), configures every number, runs the weekly payout. **The only actor who may see another person's banking.** |
| **Manufacturer partner** | Reaches the same console behind the same Access policy, but is not staff (`worker/lib/staff.ts:34`) | Nothing in this feature. Refused every referral endpoint (AC-103). |
| **Accountant** | External, not a system user | Reconciles referral payments from an exported record |

**B and A are different people with different needs, and the spec keeps them apart.** For the
referrer, the referral program is a source of income and belongs on its own screen. For the referred
tradie, the discount is not "referral program business" at all — **it is a one-off offer on their
price**, and it belongs where pricing lives (§8.6.1).

Notes grounded in the code:

- **Two ways an account comes into being, and the normal one is manual.** Ops create accounts on a
  trade account request; `findOrCreateUser` (`worker/lib/auth.ts:140`) also creates one on first
  successful OTP verification for anyone who signs in through the quote path. **Revision 1 saw only
  the second**, which is what made a self-service claim endpoint look reasonable.
- Account identity is a `user` row (`email`, `name`, `company`, `abn`, `price_gst_mode`,
  `discount_percent`). **Referrals attach to `user`, not to `organisation`.**
- Staff and customers share the `user` table; `type='internal'` is the staff gate.
- **An ABN is not collected at OTP signup.** It is a profile field added later. Load-bearing for §4.9
  and §4.6.6. *(The account request form does ask for one — §4.1.1.)*

---

## 3. The program, as a tradie reads it

> **Refer a mate. You both win.**
> Add your payment details to get your code — you don't need to have ordered anything yourself.
> Your mate gets **2.5% off their first order** — they enter your code when they apply for their
> account. When they place that order and pay in full, we pay you **1% of it**, into your bank
> account, within **14 days**.
> Their first order needs to be at least **$2,000** (ex GST, before delivery).

Both sides get something, which is what makes the introduction easy to make — B is not asking a mate
for a favour, B is giving them a discount.

**The timing is now part of the pitch, and it has to be.** The code goes in when the mate *applies*.
A tradie who already has an account cannot be referred (§4.1), so "give them your code before they
sign up" is the instruction, not a detail.

Note the deliberate separation in line 2: **no purchase needed** and **payment details needed** are two
different facts, always stated as two facts (§4.9.4).

Every figure is the **launch default held in the ops config** (§4.5).

---

## 4. Decisions

Every row is **DECIDED** (mine) or **OWNER** (answered and settled).

### 4.1 Attribution — captured before the account exists

**The governing rule, new in revision 12 and owner-stated:**

> **If an account already exists, it is not a referral.** Ops may override that by request; a customer
> may never do it for themselves.

**Why self-linking is gone rather than narrowed.** Revisions 1–11 let the account holder type a code
into their own account area, gated on not yet having an order. That gate bounded the window but never
closed it: someone could sign up, get quoted, shop the price around, then go looking for a code and
enter it immediately before ordering — and the discount would land on the very order they were already
about to place. That is not an introduction being rewarded; it is a discount being harvested. **The
window is now closed at both ends: attribution happens at account creation or not at all.**

| # | Decision | |
|---|---|---|
| A1 | **Two capture paths, both self-identifying, both before the account exists.** (a) **Account request form** — the applicant types the code into the trade account request themselves; Ops links it during or right after account creation (A19). **This is the normal path.** (b) **Self-signup** — `https://<site>/r/<CODE>` sets an httpOnly cookie and 302-redirects to `/refer`; the cookie is consumed when `findOrCreateUser` creates a row for someone signing in through the quote path. | OWNER |
| A2 | **The `of_ref` cookie prefills the request form's code field** (AC-105). Without this, `/r/<CODE>` is decorative for everyone on the normal path: the link sets a cookie, the applicant fills in a form, and nothing joins the two. **⚠️ DESIGN, NOT BEHAVIOUR — deferred with the form (D19, option c).** Until the form thread lands, nothing joins the cookie to anything, and attribution on the normal path depends on the applicant mentioning their code to Ops. That is the cost this deferral accepts, stated here so A2 is not read as shipped behaviour. | OWNER — deferred |
| A3 | **The code is never asked for on the sign-in screen.** `POST /api/auth/challenge` is deliberately non-enumerating (`worker/routes/auth.ts:35`), so the server cannot reveal whether an email is new and cannot conditionally show a "new user" field. | DECIDED |
| A4 | **A referral is only recorded when the `user` row is CREATED**, by either path. An existing customer clicking a referral link is not a referral, ever. **Doubly load-bearing after revision 12** — it is now the *whole* rule, not one guard among several. | DECIDED |
| A5 | **~~Manual code entry by the account holder~~ — REMOVED, not narrowed.** There is no surface and no endpoint by which a customer attaches a referral to their own account, at any time, in any account state. `POST /api/account/referrals/claim` is deleted (§6, AC-107). | OWNER (r12) |
| A19 | **Ops links the referral at account creation, through the same gates as every other path.** The action takes the code the applicant supplied and calls the same `recordReferral` path — code valid, referrer payable, referrer not staff, not self-referral, not the same ABN. **A privileged path that skips the gates becomes the way around all of them.** It records `source: 'manual'` — accurate, because the customer wrote the code and staff transcribed it. **No new source value, no migration.** | OWNER (r12) |
| A6 | **Click cookie lifetime: 90 days.** A click older than that has no causal claim on a sale. | DECIDED |
| A7 | **Attribution window: the referred tradie's first order must be placed within `window_months` of the referral being recorded — default 12, configurable in ops.** After that the referral lapses and pays nothing — **and the discount lapses with it** (§4.6.4). | OWNER |
| A8 | **Scope: FIRST ORDER ONLY**, for both the commission and the discount. | OWNER |
| A9 | **One referral per referred account, permanently.** `referral.referred_user_id` is UNIQUE. First recorded wins. | DECIDED |
| A10 | **No chains, no levels.** A referred tradie can refer others and earns on their own referrals; nothing flows upward. | DECIDED |

#### 4.1.1 ⚠️ The capture point does not exist yet — a prerequisite, stated rather than assumed

A1(a) depends on the trade account request form carrying a code and reaching the server. **Neither is
true today**, verified in the code rather than inferred:

- **The form is a static mock.** `TradePage` (`src/app/App.tsx:1691-1699`) renders each field as
  `<Input placeholder={p} />` — **no `value`, no `onChange`, no state** — and its Apply button has
  **no `onClick`**. `submitEnquiry` is imported by `ContactPage.tsx` alone; `TradePage` does not
  import it. **The form submits nothing to anywhere.**
- **There is no trade-account intent.** `ENQUIRY_INTENTS = ["question", "appointment_request"]`
  (`worker/lib/enquiry.ts:5`) and `validateEnquiry` rejects anything else (`:42`). `EnquiryInput`
  (`:25-36`) carries no business name, no ABN and no referral code.

So the normal path currently ends in a button that does nothing, and the "request" Ops act on arrives
by some other means entirely. **Delivering A1(a) requires wiring that form, adding an intent, and
carrying three new fields.** That work is real, it was in nobody's ticket, and **D19 asks how much of
it this feature absorbs.** **Settled in revision 13 as option (c): a separate thread. This feature
builds none of it.**

**What is unaffected:** A1(b), the self-signup path, works today and needs nothing new. With D19 settled
as (c), that is the only path attribution runs on automatically — the program still functions, for the
minority who sign up through the quote path, plus everyone Ops links by hand.

### 4.2 Abuse and self-referral

*(The rules. Their verifiable, attempt-based form is §10A.)*

| # | Rule | Enforcement |
|---|---|---|
| A11 | A user can never refer themselves | `referrer_user_id != referred_user_id`; automatic, **and on the Ops link action too** (A19) |
| A12 | Same email = same account | Structural — email is UNIQUE on `user` |
| A13 | **Same ABN as the referrer → refused.** A cheap signal, **not a proof of common identity**: the ABR confirms one person may legitimately hold several ABNs across different structures. **Revision 12 improves its reach:** the request form asks for an ABN, so on the normal path both sides now have one **at the moment of linking**, and the gate fires where it previously could not. It still runs again at earn time. It does **not** protect the discount — §4.6.6 does. | Automatic; **now early on the normal path** |
| A14 | **Staff accounts cannot refer or be referred** (`user.type='internal'`) | Automatic |
| A15 | **Postcode is not compared at all** — revised. It was specified as a review flag on the reasoning that a suburb full of tradies is the target market, not fraud. Implementation found there is no data to support it: `postcode` and `suburb` exist only on `project`, as the **delivery destination for that job**, and nothing on `user` carries an address. Comparing them asks "did these two ever deliver to the same suburb", which for a Melbourne trade supplier is true constantly — and a flag that fires on ordinary customers trains the reviewer to skim past the ones that mean something. An honest version needs a business address on the account: a schema change and a form field, not a query. | Not implemented — see §4.6.6 |
| A16 | Referrer's account must be `active` at payout time | Automatic gate, ops-overridable |
| A17 | **Ops can void any referral or earning, with a mandatory reason, before it is paid.** | Manual |
| A18 | **Anyone with a registered account may refer, including someone who has never ordered.** **⚠️ COMPLIANCE-LOAD-BEARING (§4.8a)** — most likely what keeps the business outside ACL s 49. Must not be "tightened" into requiring the referrer to have ordered. **D18 does not qualify it:** D18 gates on being *payable*, A18 is about *purchase* (§4.9.4, AC-87). | DECIDED (compliance) |

**Revision 12 removes the largest abuse surface in the feature.** The self-link window — sign up, get
quoted, shop around, then claim a code before ordering — is gone by construction rather than by a
gate. §4.6.6's containment argument is unchanged but now has less to contain.

### 4.3 Money — the referrer's commission

| # | Decision | |
|---|---|---|
| M1 | **Commission base = the referred order's goods value, EX GST, EXCLUDING delivery.** | DECIDED |
| M2 | Why ex-GST: GST is collected on the ATO's behalf, not revenue. Why excluding delivery: freight is a pass-through carrying no margin (`migrations/0044_delivery_pricing.sql`). | DECIDED |
| M3 | **How the base is computed — one place per fact.** Catalogue prices are stored **GST-inclusive** (`src/data/gst.ts:1`); the order separates the components (`worker/lib/orders.ts:127`). The ex-GST figure MUST come from `taxBreakdown()` in `src/data/gst.ts`, **not** a fresh `/1.1`. | DECIDED |
| M4 | **Rate: 1% of ex-GST goods, configurable in ops** (`rate_percent`). Flat, not tiered. | OWNER |
| M5 | **No cap.** `cap_amount` is **nullable** and ships **NULL = no cap**. Renderers omit the cap clause entirely when NULL. | OWNER |
| M6 | **Qualifying minimum: ≥ `min_order_amount` ex-GST goods — default $2,000, configurable.** | OWNER |
| M7 | **Minimum payout balance** (`min_payout_balance`), **default $0 = off.** When set, a confirmed balance below it is held — visible, accruing, never lost. Two structural guards (§4.9.5) and disclosure at the point of offer (AC-81). | OWNER |
| M8 | **Earned vs payable.** `pending` at order creation; `confirmed` when the order reaches **`balance_paid`** **and the referrer is payable** (§4.9.2). | OWNER |
| M9 | Cancel or refund before payout voids the earning automatically. **No clawback in v1** after payout. | DECIDED |
| M10 | **Rate is snapshotted onto the referral when RECORDED**, never read live at earn time. **Compliance-load-bearing.** | DECIDED (compliance) |
| M11 | **Payout mechanism: manual bank transfer by staff, recorded in ops.** Tracking, not a payments integration. | DECIDED |
| M12 | **Payability is an ENTRY condition, not a payment-time condition** (§4.9). The confirmed-but-unpayable state is unreachable; the `pending`-hold residue replaces it. | OWNER (D18) |
| M13 | **The advertised commission is inclusive of any GST payable.** | OWNER |
| M14 | **Payment timeframe: `payout_timeframe_days` = 14**, configurable. **⚠️ COMPLIANCE-LOAD-BEARING** (ACL s 32(2)) — a public promise that must be **met**, not merely stated (AC-80). | OWNER |

### 4.4 GST display — one exemption, one non-exemption

The house rule is: *GST display must respect the account's ex/inc preference on every customer
surface.* This feature contains **one deliberate exemption and one thing that is emphatically not
exempt.**

**EXEMPT — the referrer's payout figures.** A payout is cash arriving in a bank account, not a price of
goods. There is no ex/inc pair to toggle between. **No referral earning, balance or payout figure
responds to `price_gst_mode`** (AC-31). The basis is labelled in words wherever the rate appears:
*"1% of your mate's first order, excluding GST and delivery."*

**NOT EXEMPT — the referred tradie's discount.** It **is** a price adjustment, applied inside the
pricing engine and landing inside `quote_line.line_total`, a GST-inclusive figure that already flows
through `taxBreakdown()`. It respects the preference automatically, and must be **verified** to do so
(AC-56).

**A percentage is unit-free, and that is not an exemption.** The §8.6 panel shows a percentage, which
the toggle cannot change. The moment any **worked dollar figure** appears beside it, that figure is a
price and honours the preference (AC-74).

### 4.5 Where content lives, and why no figure is ever typed into prose

| Content | Home | Why |
|---|---|---|
| Structural marketing copy | **Hard-coded in the page component** | Every other marketing page works that way; it must interleave with an auth-aware CTA and live figures. |
| Hero image + per-page SEO | **Sanity `page` document, `pageId: "refer"`** | Existing mechanism; swap image and meta without a deploy. |
| **Every number** | **The program config in D1, rendered into the copy at runtime** | Load-bearing — see below. |
| Plain-English rules and full T&Cs | **Sanity `post`**, linked from the landing page | Revised by a human who is not deploying code (§12A.2). |

**The no-typed-figures rule is load-bearing, not hygiene.** The owner kept the discount at 2.5%
explicitly on the basis that *it can be raised later without a deploy*. A single hard-coded "2.5%" in
prose turns a config change into a code change someone will forget — and the site would advertise one
number while the engine applied another. **Raising the discount must be a config edit and nothing
else** (AC-76).

### 4.6 The referred tradie's discount — inside the pricing path

**The referral discount must not become a second place where a price is decided.**

#### 4.6.1 There is already an account discount, and it is the extension point

`migrations/0032_account_discount.sql` added `user.discount_percent REAL NOT NULL DEFAULT 5` — a
percentage off the line total, applied last before the $10 rounding. In the engine:

- `worker/lib/estimator/pricing.ts:195-203` — the single discount step, clamped 0–100.
- `worker/lib/estimator/pricing.ts:292` — `loadAccountDiscount(env, userId)`, resolving the percentage
  **server-side from the owning user**, never from the request.
- **`loadAccountDiscount` has exactly two callers**: `pricerFor` (:334) and the single-line path
  (:405). **Every pricing surface that prices a real customer's line funnels through them.**

**One deliberate exception, and it must stay an exception.** `computePrice` has a **third** caller that
bypasses `loadAccountDiscount`: `previewSample` (`worker/lib/pricing-admin.ts:314`), the ops rate-card
tuning preview. It prices a **synthetic** sample with no project and no owner, so no discount applies.
A rate card is a rate card; a customer discount there would misreport the thing being tuned. **It must
not be "fixed" to compose the referral discount** (AC-51).

**Therefore:** the referral discount is one more input to the function that already answers *"what
percentage off does this user get?"* — no new totals row, no new order column, no new money panel.

Consequences that fall out for free: the discount is **already frozen into the order** (baked into
`quote_line.line_total`, copied to `order_line.line_total`); deposit, balance, delivery and GST all
compute from the discounted total; the ops price-explain trace already has a `discount` step.

#### 4.6.2 Form and size — SETTLED

**2.5%, a percentage, configurable in ops** (`discount_percent`). Rejected alternatives, recorded so
the ground is not re-covered: a **fixed dollar amount** is an order-level adjustment needing a new
totals row and changes to `depositOf`/`balanceOf`/`taxBreakdown`/the order DTO; **free delivery** would
write 0 into `delivery_amount`, indistinguishable from "a human said zero", and would let an unpriced
job pass the issue gate. Neither is to be built.

#### 4.6.3 How it combines — additive in the engine, invisible on the surface

`effective = account_discount + referral_discount`, then the existing clamp — `5% + 2.5% = 7.5%` at
launch defaults. **No total-discount ceiling** (revisit trigger: if per-customer account discounts ever
become editable). **The price snapshot records the breakdown separately** (AC-52), server-side only.

**On every customer surface — THE STANDING ACCOUNT DISCOUNT IS NEVER SURFACED, AND NEITHER IS ANY
TOTAL.** Owner: *"the tradie account does not need to be surfaced at all — they get better price.
always."*

> **Show the referral increment (2.5%) and nothing else. Never a combined total.**
> A "7.5% total" discloses the standing 5% by subtraction exactly as effectively as printing the 5%.

**There is nothing for a customer to reconcile it against.** The site publishes no list price — a
product page shows none, and every figure is a quote produced for that person.

#### 4.6.4 When it applies, when it lapses, and when it stops

**Two endings, both shown honestly.** **Used** — eligibility ends the moment the first order is
created. **Expired** — if no first order is placed within the window, the referral lapses and the
discount lapses with it.

**The expiry is a feature, not fine print.** An incentive with no deadline is not an incentive, so the
deadline is stated wherever the discount is offered and counted down in the account panel.

- **Evaluated per pricing call.** No stored flag; the lifecycle state is derived (§7).
- **An issued quote is never re-priced under the customer.**
- **A reminder 30 days before expiry**, to a referred account that has not ordered.
- **The stale-draft resolution (AC-72):** once used or expired, no surface presents it as available and
  no unissued draft presents referral-discounted figures as current.
- **Line price overrides** bypass the engine; an overridden line does not receive the discount (AC-59).

#### 4.6.5 The qualifying minimum applies to the POST-discount value

Tested against **the same figure the commission is computed on**. One number, one meaning; a
pre-discount figure exists on no screen and would need a phantom pricing pass.

#### 4.6.6 Abuse — the discount is the more attackable half

**This assessment must not be softened by a later revision.** Revision 12 shrinks the surface but does
not remove it.

- The discount is **immediate** and needs **no ABN or bank details on the referred side**. **D18 gates
  the referrER, not the referred tradie.** A11/A12/A14 hold. **A13 now fires earlier on the normal
  path** (the request form collects an ABN — A13), but on the self-signup path the referred side still
  usually has none, and **even when it fires it does not prove common identity**.
- **What actually contains it:** this business issues no price without a human, **and after revision 12
  the normal path adds a second human — Ops creating the account and linking the code**. The
  perpetrator must place and pay for a real order to a real address. Maximum gain is the discount
  percentage of one order they actually buy — **bounded, and self-funding.** No cash-out path exists.
- **What we add:** ops review flags where the two accounts share an **ABN, phone or business name**,
  visible before a reviewer issues the quote (AC-58). **Three, not four:** postcode was specified and
  dropped — there is no account-level address, only a per-job delivery destination (A15).
- **What we do not add:** identity verification, ABN-at-signup for the self-signup path, blocking on
  any flag, or a postcode comparison of any kind.

#### 4.6.7 Independently switchable

`referrer_reward_active` and `referred_discount_active`, both default ON (AC-60).

### 4.7 The program is On or Off — and Off means "come back later"

**Two states, not three.** `referral_program.status` is `active` or `off`. There is no *paused* and no
*terminated*.

#### Why there is no terminated state — the structural answer

Owner: *"terminated is/can effectively [be] paused forever… Hard termination is not possible without
leaving different tails to serve existing commitments anyway."*

**A hard termination cannot be clean.** The commitments outlive it: a `pending` earning still confirms
when its order is paid, a `confirmed` earning is still paid within its timeframe, a discount already
given still runs to its date. A second status was only ever going to describe the **public page's
content** — and the public page barely changes.

> **Terminated is paused forever, and the commitments outlive either label.**

#### What Off changes, in full

1. **New referrals are not recorded** — by either path. `/r/<CODE>` sets no cookie, and **the Ops link
   action is refused** (A19 runs the same gates, and status is one of them).
2. **The join journey stops after login** with a forward-looking message, in place of the entry step or
   the code/share affordance. History and earnings stay exactly where they are.
3. **One banner appears at the top of the landing page.**

**That is the entire behavioural difference.**

#### The landing page is unchanged apart from the banner

`/refer` in Off is the **same page**: 200, same pitch, same figures, indexed, in the sitemap, same
`<head>` and Open Graph tags. **No ended-notice variant, no `noindex` branch, no conditional sitemap
entry, no head rewrite.** Placements and the footer link stay put.

> **Banner copy:** *"Joining is paused while we rework the program — check back soon."*

**Why the banner is required.** The page pitches a rate in the present tense; if nobody can join, that
is an offer advertised and not honoured — **ACL s 18** and **s 32(1)**.

#### Switching Off honours what was already promised

**One rule, two limbs.** Off stops *new attribution* and withdraws nothing already promised:
**Limb 1 — money** (AC-65) and **Limb 2 — the discount**, on its original timetable (AC-66). Stopping
in-flight promises requires a **separate, explicitly confirmed bulk void** (AC-67). Switching back on
attributes nothing retroactively (AC-68).

### 4.8 Australian Consumer Law constraints on the offer

**(a) ACL s 49 — referral selling.** Strict liability, penalties to $100m. Engaged where a supplier
induces a consumer to buy by promising a benefit contingent on that consumer supplying names of
prospective customers or otherwise assisting a sale to someone else.

**A18 is what most likely keeps the business outside it.** A18 must not be tightened; the §8.2
placements must never couple the referrer's reward to the referrer's own purchase (AC-79); and **D18
must never be described in purchase terms** (§4.9.4, AC-87).

**Revision 12 does not disturb this.** The benefit still flows to a referrer who need not have bought
anything, and the referred party's discount is still not contingent on them supplying anyone's name —
they supply **their own** code on **their own** form.

**(b) ACL s 32(2) — offering rebates.** A rebate must be provided **within the time stated in the
offer**. Hence M14 (14 days, stated wherever the offer is made **and met** — AC-80) and the
`min_payout_balance` disclosure (AC-81).

**(c) ACL s 18 and s 32(1) — advertising an offer nobody can take up.** Covered by the Off-state banner
(§4.7, AC-62).

### 4.9 D18 — payout details are a precondition of becoming a referrer

**Owner:** *"Only allow users to become referrers if they have required details stored."*

#### 4.9.1 The rule

> **A user cannot hold a referral code until ABN, BSB, account number and account name are stored.**
> Completing those details is how you enter the program — not how you unblock a payment later.

**Why the gate is at the front.** Victoria's *Unclaimed Money Act 2008* s 3(1) catches sums legally
payable unpaid for twelve months, above a $20 floor, with duties to register and remit. Moving the gate
to the front means **commission can never be earned by someone unpayable, so the clock never starts.**
It also avoids the unfair-contract-terms tension in a "we hold your earned money until you give us
details" framing: an eligibility condition disclosed up front is a materially stronger position.

#### 4.9.2 What the architect settled (engineering, now spec)

- **The code is WITHHELD until details are complete** — not issued-inactive. No window exists in which
  a referral could be recorded against a referrer who cannot be paid.
- **Payability is re-checked at recording time**, including on the Ops link action (A19). A link for a
  currently-unpayable referrer sets no cookie; a dormant code returns the **generic invalid-code
  error**, which must never disclose the referrer's account state to a third party.
- **Details may be cleared, except while a `confirmed` unpaid earning exists.** Otherwise clearing is
  allowed, with three consequences: the code goes **dormant**; existing referrals keep their
  referred-side promises untouched; and any future earning **holds at `pending`** until details are
  re-completed. **`pending` money is not yet payable**, so the twelve-month clock still does not start.

#### 4.9.3 The cost, stated plainly

**This is real friction, deliberately accepted.** A tradie must enter an ABN, BSB, account number and
account name before they have earned anything. **Some will not push through it, and the program's
reach is smaller for it.** The design response is to make the ask feel proportionate: **state what they
get before asking for banking details, and keep the form to one short step** (§8.3, AC-83).

#### 4.9.4 D18 is a payability gate, never a purchase gate

**⚠️ COMPLIANCE-LOAD-BEARING (ACL s 49).** The predicate reads four detail fields and **nothing else**.
The two facts are always stated separately — *no purchase needed* (A18) and *payment details needed*
(D18) — and never merged into "you have to be a customer to refer" (AC-87).

#### 4.9.5 `min_payout_balance` re-engages what D18 closed — two structural guards

1. **The ops write refuses a non-zero threshold without an explicit acknowledgement**, with a standing
   warning that money held under it is still legally payable.
2. **The payout queue force-promotes an accruing group at 11 months**, regardless of the threshold.

---

## 5. In scope

1. Referral code per **payable** registered user (§4.9); `/r/<CODE>` link and cookie.
2. **The referrer entry gate**: payout-details capture as the entry step, the withheld-code invariant,
   dormancy on clearing, the `pending`-hold residue (§4.9).
3. **Attribution at account creation only** (§4.1): the cookie consumed at `findOrCreateUser` on the
   self-signup path, and **the Ops link action** on the normal path (A19), both through the same gates.
4. ~~**The referral code field on the account request form, prefilled from the `of_ref` cookie**
   (AC-105).~~ **OUT OF SCOPE — D19 settled as (c): a separate thread builds the form.** Until it does,
   Ops enters codes by hand (§8.0, §4.1.1).
5. **The referred tradie's 2.5% first-order discount** via `loadAccountDiscount` (§4.6), its quote-surface
   badge, its §8.6 offer panel, its expiry handling, and its snapshot breakdown.
6. Earning creation at order creation, confirmation at `balance_paid` **for a payable referrer**,
   voiding on cancel/refund/expiry; the minimum payout balance with its two guards; the payment
   timeframe (M14).
7. Public landing page at `/refer` — indexable and sitemapped — with its three On states and the single
   Off-state banner (§4.7).
8. Marketing placements: home, trade-account, footer, post-delivery prompt — within the s 49 copy
   constraint.
9. Account area: the **Referrals** section for the referrer, **and the pricing-side offer panel for the
   referred tradie**. **No "were you referred?" field** (A5).
10. Ops console: the **Referrals** tab (Program, Referrals, Payouts) **and the referral link action on
    account creation** (A19, T8).
11. Transactional emails: referral recorded, earning confirmed, payout sent, expiry reminder.
12. Migration `0051_referral_program.sql`.
13. **A minimal, invisible access log for payout bank details** (§7.1) — its own table, write path only.
14. **The `/r/<CODE>` indexing directives and the FAQ governance rule** (§12A).
15. **The abuse-case defences in §10A.**
16. Privacy policy update; rules + T&Cs published as Sanity posts.

## 6. Out of scope

- **`POST /api/account/referrals/claim`, and any successor** — a customer may never attach a referral
  to their own account (A5, AC-107). A removed UI with a live endpoint would still permit self-linking.
- **Attaching a referral to a preexisting account by any customer-initiated path** (AC-108). The Ops
  override is the only exception, and it is a deliberate staff act.
- **Writing the payout-details access log to `audit_event`** — actively wrong: that table has a global
  viewer (§7.1, AC-82).
- **Any UI for the payout-details access log.**
- **Any status-dependent behaviour on `/refer` beyond the single banner.**
- **A third program status.**
- **Applying the referral composition to the ops rate-card preview** (`previewSample`) — §4.6.1, AC-51.
- **Any account endpoint that takes a user, referral or earning id** — scoping is by session only, and
  that absence is a defence (§10A, AC-95).
- **A `robots.txt` disallow for `/r/`** — actively wrong (§12A.1).
- **A canonical link between the landing page and the FAQ article** — actively wrong (§12A.2).
- **A postcode or delivery-address review flag** — removed in revision 13 because no account-level
  address exists to compare, only a per-job delivery destination. Reintroducing it over `project` rows
  would fire on ordinary customers and teach the reviewer to ignore the flags that mean something
  (§4.6.6, A15). An honest version needs a business address on the account: a schema change and a form
  field, not a query.
- **A "blocked on missing details" group in the payouts queue** — unreachable under D18.
- **Unclaimed-money machinery** — D18 removes the state that would need it.
- **Any path by which a referrer supplies a mate's name, phone, email or contact detail** (§7.0, AC-78).
- **Any predicate conditioning a referrer capability on the referrer's own orders** (§4.9.4, AC-87).
- **Audit of who performed the Ops link action.** The owner is explicitly unconcerned — two founders,
  both Ops. *(This is a different question from the `payout_details_access` log, which exists for
  financial PII under APP 11 and stays exactly as it is.)*
- Any automated payment rail; multi-level commissions; tiered rates; RCTI generation; clawback;
  per-customer editing of `discount_percent`; ABN-Lookup verification.
- **Surfacing the standing account discount in any form, including as part of a total** (§4.6.3).
- Any change to rate cards, surcharges, modifiers, delivery zones or GST arithmetic.

---

## 7. Domain model and single-source rules

Migration **`0051_referral_program.sql`** (append-only; next after `0050`). **Revision 12 adds no
migration** — `source: 'manual'` already exists and the Ops path reuses it (A19).

- `user.referral_code TEXT` + a UNIQUE index. **Only populated for a user whose payout details are
  complete** (§4.9).
- `referral` — the **relationship**: referrer, referred (UNIQUE), code used, source
  (`link`|`manual`), the snapshotted program values in force when recorded, status, `expires_at`,
  void reason, review flags, timestamps. **No contact details for anyone — both parties are `user`
  foreign keys** (§7.0).
- `referral_earning` — the **money**: referral, order, base amount, computed amount, status, payout id.
- `referral_payout` — one row per referrer per run, **with a frozen copy of the ABN and bank details
  used**.
- `payout_details_access` — **the access log, its own table, no read path anywhere** (§7.1). Its
  `subject_user_id` / `actor_user_id` split makes the ops-side read recordable (AC-104).
- `referral_program` — singleton config, versioned like `pricing_policy`: `status` (`active`|`off`),
  the two side switches, `rate_percent` (1), `cap_amount` (NULL), `min_order_amount` (2000),
  `min_payout_balance` (0), `window_months` (12), `discount_percent` (2.5), `payout_timeframe_days`
  (14), `updated_at`, `updated_by`, `version`.
- Payout method on `user`: `payout_bsb`, `payout_account_number`, `payout_account_name`.
- **The discount's lifecycle state is derived, not stored.** **Referrer payability likewise** — one
  predicate over four fields; a cached flag would go stale the moment details are edited.

**The migration is additive only** (AC-49c). **`referral_program` is configuration and must survive
`npm run db:reset`** — the four transactional tables go in `clear.sql`, the config row does not
(AC-91), exactly as `pricing_policy` and the rate cards already behave.

**Single-source rules that must not be violated:**

| Fact | The one place it lives |
|---|---|
| **Who a referred person is** | **The `user` row created for them** (§7.0) — a legal constraint. |
| **Whether a referral may be recorded** | **`recordReferral` and its gates** — the Ops link action calls it rather than writing a row (A19, AC-106). |
| **Whether someone may be a referrer** | **One payability predicate over four detail fields** (§4.9), reading nothing else — never order history. |
| **Whose data a request may touch** | **The session.** No account endpoint accepts a subject id (§10A, AC-95). |
| **Whether joining is open** | `referral_program.status`, read server-side (§4.7). |
| What percentage off a user gets | `loadAccountDiscount()` — server-side only, never serialised to a customer response. |
| How a discount is applied to a price | The existing discount step, `pricing.ts:195-203`. |
| GST arithmetic / ex-GST goods | `src/data/gst.ts` (`taxBreakdown`) — called, never re-derived. |
| Order goods vs delivery split | `"order".total` / `"order".delivery_total`. |
| Order lifecycle and `balance_paid` | `worker/lib/orders.ts` — observed; no stage added. |
| Program numbers as advertised | `referral_program` → API → copy. **No figure typed into prose** (AC-76). |
| Money and discount already promised | The `referral` row's snapshot, never the live config. |
| Referral business logic | `worker/lib/referrals.ts` — routes thin, no rules in components. |

### 7.0 THE ATTRIBUTION BOUNDARY — a referrer never supplies a mate's details

> **A referrer shares a code. They never tell us anything about the person they are referring.**

**Revision 12 does not weaken this, and the reason deserves stating**, because "Ops creates the
referral" invites the opposite conclusion: **the code arrives from the referred person, on their own
form, in their own words.** They self-identify exactly as typing the code themselves would have done.
Ops transcribes; Ops does not source. **A referrer still cannot hand us anyone's details** — there is
no field, endpoint, form, import or ops action into which a *referrer* can enter another person's
name, phone, email or anything else.

**Why this is architectural and not a UX preference.** Privacy Act s 6D(4)(d) is one of the routes by
which a small business ceases to be exempt and becomes a full APP entity — it turns on disclosing
personal information about another individual for a benefit, or collecting it from someone else. On
these facts the business is **not** collecting personal information about one individual from another,
**and revision 12 leaves that analysis untouched**: the direction of travel is still
referred-person → us. The legal research is explicit that allowing referrer-submitted details **would
alter the analysis materially**, and that **the stakes are the entire business's privacy status.**

**What this forbids, concretely.** No "invite your mates by email". No SMS invite. No contact-list
import. No "who did you refer?" field. **No ops screen that lets staff record a referral from a name a
referrer supplied** — the Ops link action takes a *code the applicant wrote*, nothing else (AC-78).

### 7.1 Handling of payout bank details

Bank details and ABNs are **financial PII — "the most sensitive data class in the product: minimal
storage, never logged, never exposed on a customer-facing surface beyond the owning account"**
(`CONTEXT.md:105`). §10A turns that sentence into attempts someone must make and be refused.

**What is in:** every read and every change records **who, which record, and when**, in **its own table
— `payout_details_access` — with no read path anywhere**. **The log records the fact of access, never
the value.** **No path stores or reveals payout details without writing the row** — one `batch`, so a
partial success cannot leave an unlogged change (AC-100).

**Why not `audit_event`.** Because **it has a global viewer**: `GET /api/ops/audit`
(`worker/routes/ops.ts:2096`) returns the last 200 rows across **all** entity types when no `?entity`
filter is supplied, so anything written there is on the ops Audit screen by default. Reusing it would
have silently created exactly the screen the owner refused. **A later reviewer seeing a bespoke table
where a shared one exists should read this paragraph before "correcting" it.**

**What is explicitly out:** **no UI, screen, tab, report, export, filter or workflow** (§6, AC-82).

**Unaffected:** masked read-back on the customer API; staff-only full visibility on the ops payout
screen; **the frozen copy on `referral_payout`**, which is **not audit — it is the accountant's record
of what was actually paid**; and the mandatory reason on a void plus `paid_by`/`paid_at`.

---

## 8. Surfaces

The ux-designer owns layout and visual treatment. This section specifies **purpose, states and required
content** only.

### 8.0 The account request form — where a referral begins *(new in revision 12)*

**⚠️ DEFERRED IN FULL — this section is not built by this feature.** D19 settled as option (c): the
form is a static mock, the owner has not yet decided whether it stays separate or merges into the
contact page, and that is a separate thread's question. Kept here because it is the design the form
thread should implement, and because §4.1.1's attribution model assumes it. **Nothing below is in
scope for T7, and AC-105 is struck.**

- **One optional field: "Referral code".** Placed after the business details, with one line of help:
  *"Got a code from another tradie? Enter it here — you'll both get something."*
- **Prefilled from the `of_ref` cookie** when the applicant arrived via `/r/<CODE>`, and editable
  (AC-105). A prefilled code is shown, not hidden — the applicant must be able to see and change what
  is about to be attributed on their behalf.
- **No validation feedback on the form.** The field accepts what is typed; whether the code is real,
  payable, staff-owned or their own business's is decided later, by the gates, on the Ops link action.
  Validating here would turn a public unauthenticated form into a code oracle (§10A, AC-98).
- **No mention of the referrer's identity**, because the form does not know it and must not look it up.

### 8.1 Public landing page — `/refer`

- New `Page` id, path, and an **unconditional** entry in `PUBLIC_PAGES` / `buildSitemap`.
- **Content:** the two-sided promise with live figures; three steps; what qualifies; **that referring
  needs no purchase but does need payment details** (two separate facts); **that the mate must enter
  the code when they apply** (§3); the one-off, time-limited nature; **when the referrer gets paid**;
  link to the rules/T&Cs post; a short conversion FAQ (§12A.2).
- **States while On:** *logged out* (pitch + sign-in CTA); *logged in, details complete* (pitch + own
  code and share link); *logged in, details missing* (pitch + complete-your-details CTA, no code).
- **While Off** — same page plus the banner; after login the forward-looking message replaces the entry
  step and the code/share controls (§4.7).
- **Sharing is by code and link only.**

### 8.2 Marketing placements

| Placement | Logged-out says | Logged-in says |
|---|---|---|
| **Home page**, one section low on the page | "Know another tradie? They get 2.5% off their first order and you get paid." → `/refer` | Code + copy link when details are complete; otherwise a prompt to finish setting up |
| **`/trade-account`**, one section | Same pitch, trade-framed **— and this page now also carries the code field itself (§8.0)** | Same split |
| **Footer**, site-wide | "Refer a mate" link | Same |
| **Completed order** + delivery email | n/a | "Happy with these? Refer a mate." + code or setup prompt |

Placements and the footer link are **unchanged by program status** — the banner does the disclosing.

**⚠️ s 49 copy constraint (§4.8a, §4.9.4).** No placement may couple the referrer's reward to the
referrer's own purchase, and none may express the payment-details requirement as customer status
(AC-79, AC-87).

**Not placed:** product pages, the quote builder, review-and-accept, any payment screen.

### 8.3 Account area — the "Referrals" section (the REFERRER's screen)

Route `/referrals`. **About money owed to the account holder for introductions they made**, showing
**only their own** — every field session-scoped (AC-92).

**(i) Details missing — THE ENTRY STATE, not an error state.** No code, because none exists.
**What you get, first** (the rule with live figures, and the two facts stated separately); **one short
step** (ABN, BSB, account number, account name, naming exactly what is missing); **what happens next**
(the code appears immediately). Nothing here may be styled as a failure, warning or blocked action.

**(ii) Details complete — the working screen:**

1. **Your code** — code, share link, copy button, prefilled share message, and the one-sentence rule.
   **No recipient field, ever** (§7.0).
2. **~~Were you referred?~~ — REMOVED (A5).** There is no field here, and no endpoint behind it. A
   referred tradie's own view of their discount lives in §8.6, which is a *pricing* panel, not a claim.
3. **Your referrals** — business name if set, otherwise a masked email; join date; status. **Never**
   their phone, address, project or order contents.
4. **Your earnings** — Pending, Confirmed, Paid, each traceable to its referral, and when a confirmed
   amount will be paid.
5. **Your payment details** — masked read-back, editable. Both holds stated plainly, never silent.
   Clearing **refused while a confirmed unpaid earning exists**, with the amount and reason.
6. **Payout history** — date, amount, reference, referrals covered.

**While Off**, both shapes are topped by the forward-looking message; everything else stays visible and
working.

### 8.4 Ops console — the "Referrals" tab, and the link action

**Every endpoint under `/api/ops/*` here is staff-only and refuses manufacturer partners** (AC-103).

**(a) Program** — every number, the On/Off switch, the two side switches. Restates the settings in one
sentence. Refuses a stale save. **A non-zero payout threshold requires explicit acknowledgement.**
Switching Off states what it does and does not do — **and that everything already promised is still
honoured**.

**(b) Referrals** — list with review flags (shared ABN / phone / business name — a signal
for a human, not a control). Filter and search. **Void** (mandatory reason), **un-void**, and a
separately confirmed **bulk void**, the only way to stop in-flight promises. **This list shows no
banking** (AC-102).

**(c) Payouts — the weekly job.** Two groups only, **ready** and **accruing**. Grouped per referrer.
Deadline-flagged (M14). Accruing force-promoted at 11 months. **This is the one screen where an actor
sees another person's banking**, and every such read writes an access-log row with `actor ≠ subject`
(AC-104). Mark paid / mark failed; permanent payout record plus date-range CSV for the accountant.

**(d) The referral link action — new in revision 12 (A19).** Where Ops creates an account from a trade
request, they can attach the referral code the applicant supplied.

- **It calls `recordReferral`**, not an insert. Every gate applies: code valid, referrer payable,
  referrer not staff, not self-referral, not the same ABN, program On (AC-106).
- **Each refusal is shown to the staff member with its reason** — this is an internal surface, so
  unlike the customer-facing paths it may say *why*. That is the point: Ops needs to know whether to
  ring the applicant or ignore it.
- **It records `source: 'manual'`.** No new source value; no migration.
- **It is available at account creation and shortly after** — the same "before the first order" bound
  the rest of the model uses. **The Ops override** for a genuinely preexisting account (the owner's
  carve-out) is this same action, used deliberately by a person, and it is the only way a preexisting
  account can ever become referred (AC-108).

### 8.5 The quote surface — the discount while quoting

The indicator on `QuoteTotals` and the issued quote names the **referral component only**, never a
total (AC-75). **A percentage, not a dollar saving, in v1.** It disappears at the first pricing event
after the discount is used or expires (AC-57).

### 8.6 The account area's offer panel (the REFERRED TRADIE's screen)

The referral discount is **the only discount this business names to a customer**. **Never gated by
D18.** It lives on the **Account page beside the price-display preference** — it is about their price,
not about the program; the two audiences are different people; and it survives the program being
switched off.

**Content:** the referral percentage **alone** (AC-75), server-supplied (AC-73); the deadline stated
not buried; **three derived states** — Available, Used, Expired — honest and never a silent
disappearance; **accurate about mechanics, urgent in tone**, with **no redemption language anywhere**
(AC-70); no worked dollar figure in v1; and **the referrer's business name as the only thing it says
about the other party**.

**GST:** the panel is on the **price side** of §4.4. A percentage is unit-free, so the toggle changes
nothing shown — arithmetic, not an exemption. The prices it acted on honour the preference (AC-56).

---

## 9. Draft copy

Slots (`[rate]`, `[discount]`, `[minOrder]`, `[window]`, `[cap]`, `[payoutDays]`) are filled from
config, **never typed as literals** (§4.5). All subject to the s 49 constraints.

**Landing hero**
> **Refer a mate. You both win.**
> You already tell other tradies where you get your windows. Now there's something in it for both of
> you.

**The rule (one sentence, used everywhere)**
> Share your code — your mate enters it when they apply for their account, gets **[discount]% off their
> first order**, and when they pay for it in full we pay you **[rate]% of it** within **[payoutDays]
> days**.

**Three steps**
1. **Get your code.** Add your ABN and bank details — that's where we send the money. **You don't need
   to have ordered anything yourself.**
2. **They apply with it.** Your mate enters your code on their trade account application, and gets
   **[discount]% off their first order** — on their quote from the start, theirs for **[window]
   months**.
3. **You get paid.** Once they've paid that order in full, we transfer your **[rate]%**[ifCap: , up to
   [cap]] within **[payoutDays] days**.

**The fine print, in plain words**
- **Your mate needs to enter your code when they apply.** We can't add it to an account that already
  exists — so give it to them before they sign up.
- Any account can refer — **you don't need to have bought anything from us.** You do need your ABN and
  bank details on file, because that's the account we pay.
- It's their **first order** that counts, placed within **[window] months** of their account being set
  up.
- The order needs to be at least **[minOrder]** ex GST, before delivery.
- **[rate]%** is worked out on the **goods, excluding GST and delivery**.
- We pay by **bank transfer**, within **[payoutDays] days** of your mate paying their order in full.
  [ifThreshold: We pay out once your balance reaches **[threshold]**.]
- One code per new customer. You can't refer yourself, or another login for your own business.
- You get paid for the mates you refer — not for anyone they go on to refer.

**Account request form — the code field (§8.0)**
> **Referral code** *(optional)*
> Got a code from another tradie? Enter it here — you'll both get something.

**Landing page banner — the ONLY change to this page when Off**
> Joining is paused while we rework the program — check back soon.

**After login while Off**
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

**Offer panel — available / used / expired**
> **[discount]% off your first order** — it's already in every price you see, there's nothing to apply.
> A one-off from **[referrer]**, yours until **[expiry]**.
> · **Used:** applied to order **[orderNo]** on **[date]**. That was the one-off — nice work.
> · **Expired:** expired on **[date]**. It applied to a first order placed within **[window] months**.

**Ops link action — refusal reasons** *(internal surface; these MAY be specific — §8.4d)*
> Code not found · Referrer can't be paid yet (no bank details) · Staff account · Same ABN as the
> referrer · That's their own code · Program is switched off

**Email — your discount is running out** *(30 days before expiry, unordered accounts only)*
> **Your [discount]% discount runs out on [date].** It's already built into the prices in your quote —
> start or finish a quote before then and it's yours.

**Email — a mate signed up / earning confirmed / paid**
> Good news — `[name]` just got their account set up with your code and their **[discount]% off**.
> · `[name]`'s order is paid in full, so you've earned **`[$]`** — in your account within
> **[payoutDays] days**.
> · **`[$]` is on its way to your account.** Sent `[date]`, reference `[ref]`. *(No bank details, ever
> — AC-102.)*

---

## 10. Acceptance criteria

Each is independently verifiable. **The forbidden actions are in §10A**, verified by attempting them.

### Attribution and the entry gate
- **AC-1** Every registered customer account **with complete payout details** has exactly one referral
  code, generated on first demand once those details are stored, and stable thereafter. An account
  without complete details **has no code**.
- **AC-6** A brand-new email signing in through the quote path while the referral cookie is present
  produces exactly one `referral` row, and the cookie is cleared.
- **AC-7** An **existing** user signing in while the cookie is present produces **no** referral row.
  (Regression-critical.)
- **AC-8** *(replaced r12)* **Ops linking a code at account creation produces the referral.** Given a
  trade request carrying a valid code and a newly created account, when Ops uses the link action, then
  exactly one `referral` row is created with `source='manual'`, the referred user's discount becomes
  available immediately, and the referrer sees the referral on their screen.
- **AC-9** *(replaced r12 — see AC-108)* — the old "manual entry refused once the account has an order"
  criterion is gone with the surface it described.
- ~~**AC-105** *(new r12)* **The account request form captures a code and the link prefills it.**~~
  **STRUCK in revision 13 — not a defect, a scope decision (D19, option c).** The trade account form is
  a static mock and this feature does not build it; the work moved to a separate thread. **A tester must
  not attempt this criterion** — it cannot pass, and failing it would report a scoping decision as an
  implementation fault. It returns, unchanged, with the form thread.
- **AC-106** *(new r12)* **The Ops link action runs every gate.** Given each of: an unknown code, a
  dormant code, a staff-owned code, the applicant's own code, and a code whose referrer shares the
  applicant's ABN — when Ops attempts to link it, then **each is refused with its specific reason
  shown to the staff member**, and **no `referral` row is written**. Given the program is Off, the
  action is refused. **Verified against the same `recordReferral` path the cookie flow uses**, not a
  parallel implementation.
- **AC-107** *(new r12)* **There is no self-link endpoint.** `POST /api/account/referrals/claim`
  returns 404 (not 401, not 405 — the route does not exist), no other route accepts a referral code
  from an authenticated account holder for their own account, and no UI anywhere offers such a field.
- **AC-108** *(new r12)* **A preexisting account is never a referral.** Given an account created before
  any referral existed — and given an account created without a code — when any customer-initiated path
  is attempted, then no referral is recorded. **Only the deliberate Ops link action can attach one**,
  and doing so still runs every gate (AC-106).
- **AC-10** A second referral attempt on an account that already has one is refused; the original row
  is unchanged.
- **AC-11** The applicant's own code is refused (via the Ops link action — AC-106).
- **AC-12** A signup whose ABN matches the referrer's (digits compared, spacing ignored) records no
  referral; if the ABN is added later and then matches, the earning is voided with the reason visible
  in ops. **A signal, not proof of common identity (A13).**
- **AC-13** A referral whose referred account places no order within the window moves to `expired` and
  can never produce an earning **or a discount**.
- **AC-14** The cookie expires 90 days after it is set; a signup after that records no referral.
- **AC-78** **No referrer-submitted contact details, anywhere.** (Regression-critical, compliance.)
  (a) No customer or ops endpoint accepts a name, phone, email or other contact detail for a person the
  caller is referring — including **the Ops link action, which takes a code and nothing else**;
  (b) no UI offers such a field; (c) the `referral` table holds no contact columns.
- **AC-83** **The "details missing" state is a first-class entry surface, not an error** (§8.3).
- **AC-84** **A dormant code is inert end to end** — the link route sets no cookie, and the Ops link
  action refuses it. *(Covered in part: `referral-lifecycle.test.mjs:482-519`.)*
- **AC-85** **Clearing details behaves as specified** — refused while a confirmed unpaid earning
  exists; otherwise allowed, code dormant, future earnings hold at `pending`, re-completion releases.
- **AC-86** **The referred side is never gated by D18** — the discount and the §8.6 panel work
  identically for a referred tradie with no ABN and no bank details.
- **AC-87** **D18 gates payability, never purchase.** (Regression-critical, compliance.) (a) A
  brand-new account with **zero orders** and complete payout details receives a code and can be
  recorded as a referrer; (b) no API, query or table conditions any referrer capability on the
  referrer's order history; (c) every surface states the two conditions as **two separate facts**.

### Codes and sharing
- **AC-2** Codes use an unambiguous uppercase alphabet with no `O`, `0`, `I` or `1`.
- **AC-3** Codes are unique; a collision retries. *(Covered: `referral-codes.test.mjs:68`, `:92`.)*
- **AC-4** `GET /r/<CODE>` responds 302 to `/refer` in **every** status and never errors, setting the
  cookie only for a valid code belonging to a currently-payable referrer while On.
- **AC-5** An internal (staff) account has no referral code and no referral surfaces. *(Covered:
  `referral-lifecycle.test.mjs:768-783`.)*
- **AC-89** **`/r/<CODE>` indexing directives**: `X-Robots-Tag: noindex` in every status; never in the
  sitemap; **`robots.txt` does not disallow `/r/`** — deliberate, because a disallow prevents crawling
  and the noindex would never be fetched. **A directive has to be seen to be obeyed.**

### AC-49 — Non-referred pricing is unchanged, byte for byte

Not satisfied by "we didn't mean to change anything"; the tester must *prove* it. Four parts:

- **AC-49a — Golden fixtures**, captured from the engine **on `main` before any referral code exists**,
  committed, and re-run after with **identical** `unit`, `total`, `depositAmount` and snapshot
  `discountPercent`. The corpus must include: an **anonymous** project (0%); a **registered
  non-referred** account (5%); an **internal/staff** account (0%); a line driven by **`min_charge`**;
  a line where a **modifier fires** and one where it does not; a **composite parent with segments**; a
  line **on a `$10` rounding boundary** (the discount is applied immediately before `round10()`); and
  `qty > 1`.
- **AC-49b** For a user with no `referral` row, `loadAccountDiscount` returns a value **numerically
  identical** to `user.discount_percent`, with the program On **and Off**, and with
  `referred_discount_active` off.
- **AC-49c** The migration leaves every existing `quote_line.line_total`, `order_line.line_total`,
  `"order".total`, `"order".delivery_total` and `payment.amount` **bitwise unchanged**, verified by
  checksum comparison.
- **AC-49d** No existing pricing test is edited to pass.

### The referred tradie's discount
- **AC-48** Referred lines price with the referral discount **in addition to** the account discount,
  matching a hand calculation at the existing step, before `$10` rounding.
- **AC-50** Applied by the **single existing discount step** — no second place subtracts a referral
  discount from a price.
- **AC-51** The same discounted figure on every surface pricing **a real customer's line**. **The ops
  rate-card preview (`previewSample`) is explicitly excluded and must stay excluded** (§4.6.1).
- **AC-52** The snapshot records account and referral components **separately** (server-side).
- **AC-53** Once the first order exists, the next pricing event produces an undiscounted-by-referral
  price.
- **AC-54** An issued quote is never re-priced by a change in eligibility — by use, expiry, or the
  program being switched off.
- **AC-55** No customer-facing response carries the base account discount or the combined percentage.
- **AC-56** With a referral discount applied, the GST toggle recalculates the money panel exactly as it
  does for a non-referred account.
- **AC-57** The quote indicator disappears at the first pricing event after use or expiry.
- **AC-58** The ops project record shows the discount and any review flag **before** a reviewer issues.
  The flags are **ABN, phone and business name** — three, not four. Postcode is not compared: there is
  no account-level address to compare, and a flag derived from a per-job delivery destination would
  fire on ordinary customers and teach the reviewer to ignore the rest (A15).
- **AC-59** An ops price override keeps its price; the referral discount does not re-apply.
- **AC-60** With `referred_discount_active` off, referrals record and commissions earn but no quote
  receives a discount — and vice versa for `referrer_reward_active`.

### The account offer panel (§8.6)
- **AC-69** On the **Account** page beside the price-display preference — not inside Referrals.
- **AC-70** States that prices **already include** the discount; **no redemption language anywhere**,
  verified against rendered copy.
- **AC-71** Exactly one of three **derived** states, with no stored status column.
- **AC-72** **Once used or expired, no surface presents it as available, and no unissued draft presents
  referral-discounted figures as current.** (Issued quotes exempt — AC-54.)
- **AC-73** The percentage comes from the server; the browser never computes it.
- **AC-74** The GST toggle changes no percentage; no worked dollar figure in v1.
- **AC-75** **The panel shows the referral percentage and nothing else** — no combined total, no second
  percentage, no reference to the standing discount, on any customer surface or API response.
  (Regression-critical.)
- **AC-77** The expiry-reminder email goes 30 days before lapse, and not once used, voided or expired.

### The referrer's money
- **AC-15** One `referral_earning` row, `pending`, at first-order creation.
- **AC-16** The base equals the order's **post-discount ex-GST goods** figure via `src/data/gst.ts`,
  matching to the cent what the customer sees in `ex` mode.
- **AC-17** The base **excludes** delivery.
- **AC-18** Below the qualifying minimum (post-discount) produces no earning, with a status explaining.
- **AC-19** `cap_amount` NULL → uncapped; cap set → exactly the cap.
- **AC-20** `pending` → `confirmed` only at `balance_paid` **and** a payable referrer.
- **AC-21** Cancel or refund before payout voids automatically, with a reason.
- **AC-22** A second order produces no further earning and no discount.
- **AC-23** Changing a program number never changes an already-recorded referral's terms.
- **AC-24** Amounts to the cent; a payout's earnings sum exactly to the payout.
- **AC-80** **The payment timeframe is stated wherever the offer is made AND met** (ACL s 32(2)):
  rendered from config never typed; a confirmed earning displays when it will be paid; the queue flags
  and sorts anything reaching the deadline.
- **AC-81** **A non-zero threshold appears in the offer itself**, not only in the account area after
  money is held. At 0, no threshold language anywhere.
- **AC-88** **Both threshold guards work** — the acknowledgement-gated write, and the 11-month
  force-promotion.

### Account area (Referrals section)
- **AC-25** With details complete and the program On: code, working share link, copy control — **and no
  field for a recipient's details** (AC-78).
- **AC-26** Business name or masked email only; never phone, address, project or order contents.
- **AC-27** Pending/Confirmed/Paid each equal the sum of their rows.
- **AC-28** **Both reachable holds stated plainly, neither silent** — pending-because-details-removed,
  and confirmed-under-threshold. Each names the amount and what releases it.
- **AC-29** Bank details masked on read-back; the full account number never returned after storage.
- **AC-30** Payout history correct after the user edits their bank details.
- **AC-31** The GST toggle changes no figure on the Referrals section.
- **AC-32** Every rate, discount, minimum, window, cap, threshold and timeframe on a customer surface
  matches the current ops configuration.
- **AC-61** With a threshold above the balance, the section states the amount and the threshold; at 0,
  no threshold language.
- **AC-64** With the program Off, a referrer **with** history sees the forward-looking message plus
  their referrals, earnings, holds, details and history, all still working; **without** history, the
  message and an invitation to come back.
- **AC-82** **The payout-details access log exists, is written, and has no reader.** (a) Writes go to
  the **dedicated `payout_details_access` table** — **not `audit_event`, forbidden because it has a
  global viewer** (`worker/routes/ops.ts:2096`); (b) no BSB or account number in any field; (c) **no
  route, screen, report, export or endpoint reads it.** *(Covered for (b):
  `referral-lifecycle.test.mjs:194-199`; write path `:392`.)*

### Landing page, form, placements, search and configurability
- **AC-33** `/refer` is reachable, server-renders its `<head>` from the Sanity `page` record, and
  appears in `/sitemap.xml` — **unconditionally, in every status**.
- **AC-34** Logged out and On: pitch + sign-in CTA, no code. Logged in with details: own code and share
  link. Logged in without: the complete-your-details CTA, no code.
- **AC-35** With no cap configured, no page renders a cap clause, an empty slot, or "up to $".
- **AC-36** Home and `/trade-account` each carry exactly one referral placement, matching session and
  gate state. Placements and the footer link are **unchanged by program status**.
- **AC-37** A completed order shows the refer-a-mate prompt; an in-progress order does not.
- **AC-76** **Raising the discount is a config change and nothing else** — every customer-facing figure
  updates with no code change and no deploy. Verified by grep as well as by test.
- **AC-79** **No customer-facing copy makes the referrer's reward conditional on the referrer's own
  purchase**, and none expresses the payment-details requirement as customer status. (ACL s 49.)
- **AC-90** **The FAQ exists twice only as two different documents** — the article extends rather than
  restates; the two interlink; **no canonical between them**; structured data on exactly one page.
- **AC-91** **`npm run db:reset` leaves the program configured** — `clear.sql` empties the four
  transactional tables and **does not touch `referral_program`**.

### The On/Off switch
- **AC-62** **Off changes exactly three things:** (a) no new referral is recorded by **any** path —
  cookie, or **the Ops link action**; (b) the join journey stops after login; (c) the banner appears.
  Everything else about `/refer` is **byte-for-byte the page it serves when On**, and placements and
  the footer link are untouched. (ACL s 18 / s 32(1) for the banner.)
- **AC-65** **Off honours what was promised — limb 1, money.** (Regression-critical.)
- **AC-66** **Off honours what was promised — limb 2, the discount**, on its original timetable.
  (Regression-critical, tested in the same suite as AC-65.)
- **AC-67** Stopping in-flight promises requires the explicitly confirmed bulk void.
- **AC-68** Switching back On attributes nothing retroactively; the banner goes.

### Ops
- **AC-38** An admin can change every number and the switch; a stale save is refused (version check).
- **AC-39** The list filters and searches. **No ops action creates a referral from supplied contact
  details** — the link action takes a code (AC-78, A19).
- **AC-40** Voiding requires a reason and removes the earning from the queue.
- **AC-41** Per-referrer grouping; exactly two groups, ready and accruing.
- **AC-42** CSV export opens cleanly and carries name, ABN, bank details, amount, references.
- **AC-43** Mark-paid records reference/date/staff, flips earnings, freezes banking, emails referrers.
- **AC-44** Mark-failed returns earnings to the queue without losing history.
- **AC-45** A payout record is unchanged after the referrer edits or clears their bank details.
- **AC-46** The dashboard shows a "payouts ready" row only when money is waiting; the run works
  identically On or Off.
- **AC-47** *(property; §10A holds the attempts)* Referral endpoints are refused to non-staff, and a
  customer cannot read another user's referrals, earnings or bank details.

---

## 10A. Abuse cases — the forbidden actions, and the attempts that prove they fail

**Why this section exists.** This feature stores **financial PII** (`CONTEXT.md:105`), so security
acceptance is specified up front rather than discovered at review.

**How these are verified — binding on the tester.** **A criterion in this section verified by code
inspection alone is NOT verified.** The forbidden action must be attempted against a running system and
the denial recorded: status, body, and where stated, the absence of any state change.

**Two general rules for every criterion below:** a refusal must not disclose whether the other party
exists — every "not yours" and "no such thing" answers identically, the same discipline
`worker/routes/auth.ts:35` already applies; and a refused request changes nothing.

### Cross-account reads and writes

- **AC-92 — one account cannot read another's referral screen.** **Given** customers A and B, each with
  a code, a referral and stored payout details, **when** A calls `GET /api/account/referrals` by any
  means — including replaying B's captured request with A's cookie, or supplying B's user id, email or
  code as a parameter — **then** the response contains **only A's** data and **no value belonging to B
  appears anywhere in the body**.
- **AC-93 — one account cannot read another's offer panel.** **Given** referred tradies A and B with
  different referrers, **when** A calls `GET /api/account/referral-offer` with any parameter naming B,
  **then** A receives A's own offer or none, and the response names no party other than A's own
  referrer's business name.
- **AC-94 — one account cannot write another's payout details.** **Given** customers A and B, **when**
  A calls `PUT /api/account/payout-details` with a body also carrying B's user id, email or code,
  **then** only **A's** row is written, **B's bank fields are byte-unchanged**, and the access-log row
  records A as both actor and subject.
- **AC-95 — the account endpoints take no subject id, and that is the defence.** **Given** the account
  endpoints, **when** a request supplies a `userId`, `referralId` or `earningId` in query, body or
  header, **then** it is **never used for scoping** — the request is either session-scoped or refused —
  and no code path resolves a subject from request input. *Recorded as a defence, not an assumption:
  any future change introducing a subject id must re-verify this section.*

### Unauthenticated access

- **AC-96 — every account endpoint refuses an anonymous caller.** **Given** no session cookie (and an
  expired or tampered one), **when** each of `GET /api/account/referrals`,
  `PUT /api/account/payout-details` and `GET /api/account/referral-offer` is called, **then** each
  returns **401**, no body carries a code, earning, name or bank value, and no row is created or
  modified. Each is attempted separately. *(The former claim endpoint is not in this list because it no
  longer exists — AC-107 covers its absence.)*

### Enumeration resistance

- **AC-97 — real, dormant and staff-owned codes are indistinguishable.** **Given** four codes — a valid
  payable one belonging to someone else, a **dormant** one, a **staff-owned** one, and one that never
  existed — **when** each is submitted through **the account request form** (the only place an
  unauthenticated party can now supply one), **then** the form's response is **identical in every
  case**: it neither validates nor rejects the code, and the submission succeeds regardless. Validity is
  decided later, by Ops, on an internal surface (§8.0, §8.4d).
- **AC-98 — `/r/<CODE>` reveals nothing about a code.** **Given** the same four codes, **when** each is
  fetched unauthenticated, **then** every response is the same 302 to `/refer` with the same headers,
  differing only by the attribution cookie for the one code entitled to set it — and **no response
  states or implies whether the code exists, who owns it, or why it did not work**.
- **AC-99 — the ABN refusal is not visible to the applicant.** **Given** an applicant whose ABN matches
  their referrer's, **when** they submit the form, **then** the submission succeeds and they are told
  nothing about the mismatch; **the refusal is shown only to Ops** (§8.4d). A stranger cannot use any
  public surface to test whether a guessed ABN belongs to a particular account.

### The access log's own integrity

- **AC-100 — payout details cannot be written or revealed without the log row.** **Given** every path
  that stores, changes or discloses payout details, **when** each is exercised, **then** a
  `payout_details_access` row exists for it; and **when** the log insert is made to fail, **then the
  payout write fails with it and nothing is persisted** — one `batch`, so a partial success cannot
  leave an unlogged change.
- **AC-101 — the log never becomes a second copy of the data.** **Given** any sequence of writes and
  reads, **when** every row is dumped, **then** no column — `context` included — contains a BSB,
  account number, account name or ABN. *(Schema level covered:
  `referral-lifecycle.test.mjs:194-199`; the tester additionally dumps rows from a real write, since a
  permissive `context` could carry what the DDL does not forbid.)*

### What must never appear where

- **AC-102 — bank values appear on exactly one surface, and it is staff-only.** **Given** a referrer
  with stored details and a paid payout, **when** the tester inspects (a) every referral email;
  (b) the ops **referrals** list and **project** record; (c) every customer-facing API response
  including the referrer's own; **then** **no full account number and no unmasked BSB appears in any**.
  The **ops payouts screen and its CSV export are the sole surfaces carrying unmasked values**.

### Ops-side: where actor and subject diverge

- **AC-103 — the ops referral endpoints refuse everyone who is not staff.** **Given** (a) an anonymous
  caller, (b) a signed-in **customer**, and (c) a signed-in **manufacturer partner**
  (`worker/lib/staff.ts:34`), **when** each calls `GET /api/ops/referrals/payouts`,
  `GET /api/ops/referrals`, the program `PUT`, **the referral link action (A19)** and the CSV export,
  **then** every call is refused, **no bank value or referrer name appears in any refusal**, and no
  state changes. The manufacturer case is attempted explicitly: they reach the console behind the same
  Access policy, so hiding the tab is not a control.
- **AC-104 — a staff read of someone else's banking is recorded as such.** **Given** a staff member
  opening the payouts queue or exporting the CSV for a referrer who is not them, **when** the unmasked
  details are returned, **then** a `payout_details_access` row is written with **`actor_user_id` = the
  staff member and `subject_user_id` = the referrer**, and it still contains no bank values (AC-101).

---

## 11. Legal, tax and privacy — status and remaining sign-off

The coordinator supplies the plain-English rules and the T&Cs, researched against Australian primary
sources at `docs/specs/referral-program-legal-research.md`. **Everything drafted requires professional
review before it is relied on.** The rules and T&Cs publish as Sanity `post` documents (§12A.2).
**No number appears in the terms as a literal** — they reference the published program page (§4.5).

**Copy obligations:** the payment-timeframe sentence conditioned on the entry rule; the threshold
disclosure whenever set; the ops-screen warning for `min_payout_balance`; the A18/D18 two-facts rule;
the Off-state banner and post-login message; **and, new in revision 12, the "give them your code before
they sign up" instruction wherever the program is explained** (§3, §9).

**Contradiction protocol.** If further legal findings contradict a decision here — most likely M13, the
right-to-end position (§4.7), or the expiry of an advertised discount — the finding comes **back to
this spec for a decision**, not patched around in copy.

Items still requiring the accountant or a lawyer:

1. **GST on the payout** — inclusive of any GST payable (M13). *Accountant.*
2. **Tax invoicing / RCTI** — none generated in v1. *Accountant.*
3. **No-ABN withholding** — sidestepped by requiring an ABN before a code issues (§4.9). *Accountant.*
4. **Privacy Act status** — §7.0's boundary keeps this outside s 6D(4)(d), **and revision 12 does not
   change that** (the code still travels referred-person → us). §7.1 and §10A are the APP 11 response.
   *Legal.*
5. **ACL s 49** — A18, the §8.2 copy constraint and §4.9.4. *Legal, including the drafted copy.*
6. **ACL s 32(2)** — the 14-day timeframe and threshold disclosure. *Legal.*
7. **ACL s 18 / s 32(1)** — the Off-state banner. *Legal.*
8. **Victorian unclaimed money** — §4.9 closes the primary route; §4.9.5 covers the residual.
9. **Unfair contract terms** — payout details as an **eligibility condition**, never a withholding.
10. **Right to end or change the program** — §4.7's honouring commitment; no "hard stop" exists.
11. **Disclosure inherent in a percentage** — the terms must say what each party sees.
12. **Advertising a time-limited discount** — conditions clear at the point of claim.
13. **Privacy policy page** — updated for referral data, payout details and the access log.

---

## 12. Decisions needed (owner)

**None. D19 is settled — see below.**

**D19 — SETTLED (option c, 2026-08-17). The account request form is a separate thread; this feature
builds none of it, and Ops enters referral codes by hand meanwhile.** The owner's reasoning: the form
is unwired because they have not yet decided whether it stays its own form or merges into the contact
page, and that question is not this feature's to answer. The accepted cost is recorded at §4.1.1 —
until the form exists, attribution on the normal path depends on the applicant mentioning their code
to Ops, because nothing joins the `of_ref` cookie to a form that does not submit.

The original question and its costed options are kept below, because the form thread will need them.

**D19 (as asked) — The account request form is a static mock. How much of it does this feature build?**

The new attribution rule depends on a code arriving with a trade account request. Today the form
submits nothing (`src/app/App.tsx:1691-1699` — no state, no handler) and `/api/enquiries` has no
trade-account intent (`worker/lib/enquiry.ts:5`). Verified, not inferred (§4.1.1). Three options:

- **(a) Build it properly — RECOMMENDED.** Wire the form, add a `trade_account` intent carrying
  business name, ABN, contact details and the optional referral code, surface it in the ops Enquiries
  list, and link from there. **Consequence:** the referral feature absorbs a piece of work it did not
  create — roughly a form, a validator branch, a migration column and an ops list column — but the
  normal path works end to end, `/r/<CODE>` stops being decorative, and the business gains a real trade
  application pipeline it currently only appears to have.
- **(b) Minimal — code only.** Wire the form just enough to submit, with the code field, and leave the
  rest of the trade application as it is. **Consequence:** cheaper, but the form still needs wiring and
  an intent, so most of (a)'s cost is incurred anyway for less of its value.
- **(c) Defer — Ops enters the code by hand.** Change nothing on the form; Ops asks for the code
  during account setup and types it into the link action. **Consequence:** cheapest, ships now, and the
  Ops link action (A19) already supports it. But **the `of_ref` cookie can prefill nothing, so
  `/r/<CODE>` is decorative for everyone on the normal path** — which is the exact failure the owner's
  point about prefilling was meant to prevent. Attribution then depends on an applicant volunteering a
  code in conversation.

**My recommendation is (a)**, and if cost is the obstacle, **(c) as an explicit interim with (a)
scheduled** — rather than (b), which pays most of the price for part of the benefit.

**Accepted cost, already settled and not part of D19:** a tradie who arrives anonymously, signs up
through the quote path, and never mentions a code gets nothing, permanently. The owner's position —
*"if someone places an order as anonymous, it's their choice; they get poorer price already"* — accepts
that knowingly.

**Also settled, and not to be reopened:** there is **no audit of who performed the Ops link action**.
The owner is explicitly unconcerned — two founders, both Ops. This is a different question from the
`payout_details_access` log, which exists for financial PII under APP 11 and is unchanged.

Two things I decided myself that remain vetoable: **the 30-day expiry-reminder email** (AC-77), and
**the discount lapsing with the referral at 12 months** (§4.6.4).

---

## 12A. Search-engine behaviour

### 12A.1 `/r/<CODE>` — noindex, but deliberately crawlable

Share links are functional redirects, not content (AC-89). The destination is `/refer` in every status.

**The rule that looks like a mistake and is not:** the path is `noindex` **and deliberately crawlable —
no `robots.txt` disallow.** A disallow prevents a crawler fetching the URL, so it never sees the
`noindex` and the directive is dead; a widely-shared uncrawlable URL can still be indexed on inbound
links alone, with no content. **A directive has to be seen to be obeyed.** Anyone "hardening" this with
a disallow would remove the only thing making it work.

*(The landing page has no status-dependent search behaviour — §4.7.)*

### 12A.2 The FAQ exists twice only as two different documents

The landing page carries three or four conversion questions; the Sanity `post` carries the long tail.
**A criterion (AC-90), not a checklist item** — "don't duplicate" erodes silently at authoring time.

- The article **extends** the landing FAQ; it does not restate it. Two pages targeting the same queries
  compete, and both do worse.
- **No canonical between them.** `canonicalUrl` (`src/data/seo.ts:95`) is for duplicate documents;
  these are deliberately different. If a copy pass finds the article restating the landing content,
  **the fix is the content, not canonical plumbing.**
- The two interlink — "the short version" ↔ "full details, rules and terms".
- Structured data, if ever added, goes on exactly one page.

---

## 13. Ticket breakdown

1. **T0/T1 — Golden capture, schema + config API.** Fixtures from `main` first (AC-49a); migration
   `0051` (incl. `payout_details_access`); `referrals.ts` skeleton; `GET /api/referral/program`; ops
   program GET/PUT with the On/Off switch and threshold acknowledgement; **the `clear.sql` split**
   (AC-91).
2. **T2 — Pricing composition.** Extend `loadAccountDiscount`; snapshot breakdown; eligibility ends on
   first order or expiry; the AC-72 re-price. **Highest-risk ticket — carries AC-49 in full.**
3. **T3 — Codes and attribution.** Payability predicate; payout-details endpoint **and its access-log
   write** (AC-82, AC-100); code withheld until complete; dormancy; `/r/<CODE>` with its **noindex
   directive** (AC-89) and cookie; `findOrCreateUser` hook; all §4.2 gates; **the §7.0 boundary at the
   endpoint layer** (AC-78); the A18/D18 regression test (AC-87); **the §10A account-side abuse cases**
   (AC-92 to AC-101). **Revision 12: no claim endpoint is built** — and if one exists from earlier
   work, **it is removed here** (AC-107).
4. **T4 — Earning lifecycle.** Earning at order creation; confirm at `balance_paid` for a payable
   referrer; hold at `pending` otherwise; void on cancel/refund; expiry sweep; post-discount ex-GST
   base; timeframe stamping.
5. **T5 — Account area (both screens).** The Referrals section — **entry state first** (AC-83), **and
   no "were you referred?" field** (A5) — and the §8.6 offer panel.
6. **T6 — Quote surface.** The discount indicator; ops project-record visibility and review flags.
7. **T7 — Landing page and placements.** `/refer` in all states; the Sanity `page` record; sitemap;
   placements and footer; the Off-state banner and post-login message (AC-62); every figure from
   config; the s 49 / two-facts copy constraints. **Plus the §8.0 code field and its cookie prefill
   (AC-105) — REMOVED from T7 by D19's settlement (option c). The form is a separate thread; T7 builds
   no code field and no prefill.**
8. **T8 — Ops tab and the link action.** Program screen; referrals list + void + bulk void; payouts
   queue with both groups, deadline flagging, long-stop promotion, CSV export, mark paid/failed, frozen
   snapshot, dashboard row; **the §10A ops-side abuse cases** (AC-102 to AC-104); **and the referral
   link action (A19) calling `recordReferral` with every gate and every refusal reason shown**
   (AC-106, AC-108).
9. **T9 — Emails, rules pages, privacy policy.** Four templates with inline fallbacks; rules and T&Cs
   as posts under §12A.2 (AC-90); privacy policy for referral data, payout details and the access log.

UI-bearing tickets (T5, T6, T7, T8) require the ux-designer's mock and the **UX mock gate** before
implementation.
