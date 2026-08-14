# Referral program — interaction specification

Branch: `feat/referral-program`
Status: **revision 1 — awaiting the UX mock gate.** Nothing in this document may be implemented until the
owner has approved `docs/mocks/referral-program.html`.
Author: ux-designer
Date: 2026-08-15

**Inputs.** Spec `docs/specs/referral-program.md` rev 6 · amendment `referral-program-pending-amendments.md`
(D18) · design `docs/design/referral-program.md` rev 2 (ADR-8, §10 API contracts) · legal research
`referral-program-legal-research.md` §§4.1, 4.3, 4.5, 5.1, 5.4, 10.

**The mock is the contract.** `docs/mocks/referral-program.html` shows every screen and state named here.
Where this document and the mock disagree, the mock is wrong and this document is right — but say so, and
fix the mock, rather than building the difference.

---

## 0. The five rules that outrank everything else in this document

Written first because each is the sort of thing a well-intentioned change quietly breaks.

1. **No customer-facing surface ever prints a combined discount.** The referred tradie sees the referral
   percentage and nothing else. A total discloses the standing account discount by subtraction. (AC-75)
2. **No copy makes the referrer's reward conditional on the referrer's own purchase.** "Any account can
   refer" and "we need your payment details" are two facts, rendered as two visually separate statements,
   on every surface that states either. (AC-79, ADR-8d)
3. **There is no field anywhere into which a referrer types a mate's name, phone or email.** No invite, no
   share-by-email that we send, no contact picker, no recipient field. (AC-78)
4. **No program figure is ever typed into a string.** Every number renders from
   `GET /api/referral/program`. (AC-76)
5. **Payout figures do not respond to `price_gst_mode`; the referred tradie's discount does.** A payout is
   cash and has no ex/inc pair. The discount sits inside `line_total` and moves with the preference like
   every other price. (AC-31, AC-56, AC-74)

---

## 1. Copy slots and formatting

Every figure below arrives in `ReferralProgramPublic` (design §10.2). **Formatters, not string
concatenation** — pluralisation and currency must be handled by the slot, or `window_months = 1` prints
"1 months".

| Slot | Source | Renders as | Notes |
|---|---|---|---|
| `[discount]` | `discountPercent` | `2.5%` | trailing `.0` stripped: `5%`, not `5.0%` |
| `[rate]` | `ratePercent` | `1%` | same rule |
| `[minOrder]` | `minOrderAmount` | `$2,000` | `Intl.NumberFormat en-AU`, no cents when whole |
| `[window]` | `windowMonths` | `12 months` | pluralised |
| `[payoutDays]` | `payoutTimeframeDays` | `14 days` | pluralised |
| `[cap]` | `capAmount` | *nothing at all* when `null` | never an empty slot, never "up to $" (AC-35) |
| `[threshold]` | `minPayoutBalance` | *nothing at all* when `0` | whole sentences vanish, not just the number (AC-61) |
| `[referrer]` | referral row | business name, else masked email | |
| `[expiry]` | `expiresAt` | `14 MAR 2027` | `fmtDate` from `accountModel.tsx` |

`[cap]` and `[threshold]` gate **whole sentences**, not words. Build them as conditional nodes, not as
interpolations that can render blank.

**Currency helper.** Every dollar figure uses `money()` from `src/pages/accountModel.tsx` (`$1,240.00`,
cents always). The only exception is `[minOrder]` in prose, which reads `$2,000` — implement as a separate
`moneyRound()` and use it nowhere else.

---

## 2. Component reuse map

Nothing here is a new visual species. This table is the whole design system contract.

| Need | Existing component / class | New props or notes |
|---|---|---|
| Buttons | `Btn` (`src/app/ui.tsx`) | none — `sage` for the primary referral action, `outline` for Copy, `ghost` for Remove |
| Text inputs | `Input` + `FieldLabel` (`ui.tsx`) | `Input` needs no change; the ABN/BSB/account fields pass `inputMode="numeric"`, `maxLength`, `autoComplete="off"`, `id`/`aria-describedby` for the error line |
| Section eyebrow | `SLabel` (`ui.tsx`) | none |
| Marketing section shell | `<section className="ground-paper|ground-bone border-t border-black/8 section-pad">` + `max-w-6xl mx-auto px-6` | the home and trade placements are ordinary sections; alternate the ground against their neighbour |
| Two-column heading + action | `.split-row.is-center` + `.split-prose` | none |
| Closing banner | `CtaBanner` (`ui.tsx`) | unchanged; `/refer` closes on the standard quote CTA |
| Cards | `.card` + `ground-*` (theme.css derives the fill) | never pick a card colour |
| Panel with a header band | `.card` + `.panel-head` | as `AccountDashboard` uses it |
| Status chips | `StatusPill` (`accountModel.tsx`) with `tone` `pos`/`work`/`mute`/`draft`/`attn` | none — icon + word, never colour alone |
| Small inline chips (durations, conditions) | `.quote-chip` variants (`theme.css`) | reuse `--ready` / `--neutral`; add no new modifier |
| Earnings summary strip | `SummaryCell` (`AccountDashboard.tsx`) | **must be lifted out of `AccountDashboard`** into a shared component — currently module-private. Same markup, same `TONE` triple |
| List rows (referrals, payouts) | the account area's row pattern: `.card` + `px-5 py-[18px]` + hairline dividers | referrals are **not** clickable — no `card-link`, no hover fill, no chevron |
| Money panel | `QuoteTotals` (`components/quote-project/QuoteTotals.tsx`) | new optional prop `referral?: { percent: number; referrerName: string }` |
| Account rail | `AccountShell` (`pages/AccountShell.tsx`) | `AccountSection` gains `"referrals"`; `SECTION_LABEL` gains `referrals: "Referrals"`; new nav entry in the **account/session group**, above `Account` |
| Notices | new `.notice` variants are **not** needed — use `.quote-notice--info` / `--warning` / `--danger` from theme.css, which already carry the three tones | if a variant is missing, extend theme.css; do not write inline rgba |
| Ops shell, tabs, tables, confirm-in-place | `src/ops/Pricing.tsx` is the template for all three sub-screens | copy its sub-tab row, its inline-editable table, its before/after review modal and its `HealthBanner` |

**One new shared component, and only one:** `PayoutDetailsForm`. It renders the four fields, their
validation, the submit and the three reassurance lines, and it is used in exactly two places — the
`/refer` signed-in-without-details band and the Referrals section's entry state. Two homes, one set of
words, one endpoint (`PUT /api/account/payout-details`). Do not fork it.

---

## 3. Screen: `/refer` — the public landing page

**Intent.** Explain the deal well enough that a visitor can repeat it from memory, and convert two
audiences differently. Remove it and word of mouth stays invisible and unrewarded.

**Route.** New `Page` id `"refer"` in `src/app/ui.tsx`, path `/refer` in `src/app/routes.ts`, added to
`PUBLIC_PAGES` in `worker/lib/shell.ts`. Hero image and `<head>` from the Sanity `page` record
`pageId: "refer"` via `getPage()`. Never 404s in any program status.

### 3.1 Structure (top to bottom)

| Zone | Ground | Contents |
|---|---|---|
| Hero | `ground-night` + `hero-scrim` + `hero-img` | `SLabel light` · `t-ds1` headline · `t-bd-lg` subline · **the rule box** · **the two facts** · CTA pair |
| Conditions | `ground-bone`, `border-b` | `t-label` "What qualifies" + a 3×2 hairline grid (1 column below 768) + the GST/tax line |
| Three steps | `ground-paper` (carries the drafting grid) | `SLabel` · `t-ds2` heading · three `.card` with `.figure` numerals |
| State band | `ground-bone` | the auth-dependent block — see 3.3 |
| FAQ | `ground-paper` | `SLabel` "Good to know" · `t-ds2` · 2×2 hairline-collapsed card grid, as the home page does it |
| Closing | — | `CtaBanner` (quote CTA), then the site footer |

The conditions block sits **directly under the hero and above the sales narrative**. This placement is
legally load-bearing (ACL s 32(2), and the ACCC's position that fine print cannot cure a headline). Do not
move it below the steps, and do not collapse it into an accordion.

### 3.2 Copy — hero and conditions

**Eyebrow:** `Refer a mate`

**Headline (`t-ds1`):** `Refer a mate. You both win.`

**Subline (`t-bd-lg`, `.prose`):**
> You already tell other tradies where you get your windows. Now there's something in it for both of you.

**The rule box** — a bordered box, `rgba(255,255,255,.22)` edge on `rgba(255,255,255,.04)` fill, max 60ch:
> Share your code — your mate gets **[discount] off their first order**, and when they pay for it in full
> we pay you **[rate] of it**, into your bank account within **[payoutDays]**.

Bold figures render `text-sage-light`.

**The two facts** — a two-row list with a hairline above, between and none below. Each row is a
`t-data` numeral (`01`, `02`) and a sentence. **They must never be joined into one sentence, never
separated by "but", and never reordered.**
> **01 — Any account can refer.** You don't need to have ordered anything yourself.
> **02 — To get your code, we need your ABN and bank details.** That's the account we pay into.

**Conditions grid** — six cells, each a `t-cap` uppercase `font-data` label over a `t-bd-sm` sentence:

| Label | Sentence |
|---|---|
| FIRST ORDER ONLY | Theirs, not yours — and it has to be a tradie who's new to us. |
| MINIMUM ORDER | At least **[minOrder]** ex GST, before delivery. |
| WHAT THE [rate] IS ON | The goods — excluding GST and delivery. Not the invoice total. |
| WHEN IT'S EARNED | When they've **paid in full**. Not when they order. |
| HOW LONG IT LASTS | Their first order has to be placed within **[window]** of them signing up with your code. |
| HOW YOU'RE PAID | Bank transfer within **[payoutDays]**. You'll need an ABN and bank details on your account. |

Two conditional cells:
- **Cap** — rendered only when `capAmount != null`: label `MOST YOU CAN EARN`, sentence
  `Up to **[cap]** per referral.`
- **Threshold** — rendered only when `minPayoutBalance > 0`: label `WHEN WE TRANSFER`, sentence
  `We pay out once your balance reaches **[threshold]**.` (AC-81 — this must appear here, in the offer,
  not only in the account area.)

**Line under the grid (`t-cap`, `.measure`):**
> Amounts include any GST payable. What you do with it at tax time is between you and your accountant — we
> don't give tax advice. [Read the full rules and terms →]

> ⚠ **The GST sentence is a slot awaiting the accountant.** It states the position already taken (the
> advertised commission is GST-inclusive). It must be reviewed before launch; it must not be deleted,
> because a stated figure with nothing said about GST is the one formulation that is definitely wrong.

### 3.3 The state band — four variants

| Program status | Auth | Band |
|---|---|---|
| `active` | signed out | `.card` on `ground-bone`: `t-hd1` **Get your code** + "Sign in and add your ABN and bank details — that's the whole setup, and your code appears straight after. Ordering isn't part of it." + `Btn sage lg` **Sign in →** |
| `active` | signed in, `referrerGate.complete === false` | `.card` with a 3px sage left border, split `1.15fr / .85fr`: `PayoutDetailsForm` left, the "What this unlocks" panel right (see 5.2) |
| `active` | signed in, code issued | `.card` sage-bordered, split 50/50: code + share affordances left, the pre-written message + the no-details-collected note right |
| `paused` | any | hero only. `t-hd1` **Refer a mate — on hold** / "We've paused new referrals for the moment. Anything you'd already earned is unaffected and still sitting in your account. When it's back on, it'll be on this page." **No rate, no discount, no code, no conditions grid.** |
| `terminated` | any | hero only. `t-hd1` **This program has ended.** / "We're no longer taking new referrals. Anything you'd already earned is in your account and will still be paid, and any discount already given still runs to the date it was given." Same suppression. |

Paused and terminated suppress the conditions grid, the steps, the FAQ and the state band. The hero and the
`CtaBanner` remain, so the page is still a page.

### 3.4 Sharing affordances — exactly three, and no fourth

1. **Copy code** — `Btn outline sm`, puts `KRA-7F2` on the clipboard.
2. **Copy link** — `Btn sage md`, puts `https://openframe.com.au/r/KRA-7F2` on the clipboard.
3. **Share** — `Btn outline md`. Calls `navigator.share({ text, url })` when available; **falls back to
   copying the pre-written message** when it is not (most desktops). Never a mailto, never a form.

The pre-written message is shown in full on screen before it is sent, in a `.card` on `--recessive`:
> "Get your windows through OpenFrame — use my code **KRA-7F2** and you'll get [discount] off your first
> order. openframe.com.au/r/KRA-7F2"

Beneath it: *"We hand this to your phone to send. We never see who you send it to, and there's nowhere here
to give us their details."*

**Copy feedback:** the button label swaps to `Copied` with a check glyph for 2000 ms, then reverts. No
toast. An `aria-live="polite"` span announces "Link copied".

### 3.5 FAQ copy (four cards)

- **Can I refer someone if I've never ordered?** — Yes. Any registered account can refer. Your own order
  history has nothing to do with it.
- **What does my mate actually see?** — Their quote is [discount] lower from the first price they're shown.
  There's no code to enter at checkout and nothing for them to apply.
- **What do I get to see about them?** — Their business name and how far along they are — signed up,
  quoting, ordered, paid. Never their prices, their address or what's on their job.
- **Do I earn on the mates they go on to refer?** — No. You get paid for the mates you refer, and that's
  it. No chains, no levels, no tiers.

Closing line under the grid (`t-cap`, `.measure`):
> Your mate is told, when they use your code, that you'll be notified once their first order is paid and
> that you're paid a percentage of it. Nobody is surprised by this later.

---

## 4. Screens: the four marketing placements

All four read `program.status` and render **nothing** unless it is `active`. None appears inside a priced
flow — not on a product page, the quote builder, review-and-accept or any payment screen.

### 4.1 Home page section

**Position:** between the "Good to know" section and the closing `CtaBanner`. `ground-paper` (its
neighbours are bone), so the alternation holds. `SLabel` + `.split-row.is-center`.

| Variant | Copy |
|---|---|
| Signed out | Eyebrow `Refer a mate` · `t-ds2` **Know another tradie?** · `t-bd-lg` "They get **[discount] off their first order**. You get **[rate] of it**, into your bank account within [payoutDays] of them paying." · `t-bd-sm` "Any account can refer — you don't need to have ordered." · `Btn sage lg` **How it works →** |
| Signed in, no details | `t-hd1` **Know another tradie?** · "They get **[discount] off their first order** and you get **[rate] of it**, paid within [payoutDays] of them paying in full." · `t-bd-sm` "Add your ABN and bank details and your code is ready. You don't need to have ordered." · `Btn sage md` **Get my code →** |
| Signed in, code issued | Eyebrow `Your referral code` · a sage-bordered `.card`: the code at `t-hd1`-scale `font-data`, `Copy link`, and two `t-label`/`t-data` pairs — **Referred** `n mates` and **Earned** `money(paid)` — plus `Referrals →`. Below the card, `t-cap`: "Your mate gets [discount] off their first order." |

> **The third variant deliberately omits `[rate]`.** A rate printed beside an earned dollar figure lets a
> referrer divide and recover their mate's order value. See §9.2. Do not "fix" this by adding the rate.

### 4.2 `/trade-account` section

Same shape, `ground-paper`, trade framing:
> `t-ds2` **Bring another trade account with you.**
> Your mate gets **[discount] off their first order**. You get **[rate] of it** by bank transfer, within
> [payoutDays] of them paying in full.
> `t-bd-sm` Any registered account can refer — ordering isn't part of it. Their first order needs to be at
> least [minOrder] ex GST, before delivery.
> `Btn sage lg` **See how it works →**

### 4.3 Footer link

One entry, in the **Service** column of `Footer` in `App.tsx`, between "Trade account" and "How it works":
label `Refer a mate`, target `refer`. Identical signed in or out. Removed entirely when the program is not
`active`.

### 4.4 Completed-order prompt

**Where:** foot of `RecordDetailPage` for an order in stage `delivered` or `after_sales`, after the last
existing panel. Never on an in-progress order (AC-37).

`.card` with a 3px sage left border, `.split-row.is-center`:
> `t-hd3` **Happy with these? Refer a mate.**
> `t-bd-sm` They get **[discount] off their first order**. You get **[rate] of it**, within [payoutDays] of
> them paying in full.

Right side: the code at 22px `font-data` + `Btn sage sm` **Copy link**. For a viewer whose gate has not
passed, the right side becomes a single `Btn sage sm` **Add your details to get your code →** and the code
is absent. No earnings figure appears here in either case.

---

## 5. Screen: Account → Referrals (the referrer)

**Intent.** One place that answers "who have I sent you, what am I owed, and when does it land". Remove it
and the referrer has no way to trust the program.

**Nav.** `AccountSection` gains `"referrals"`. The rail item sits in the **account/session group** above
`Account`, not with `My Projects` — this is about money, not jobs. Icon: `Users` (lucide). When
`earnings.confirmed > 0` the item carries a badge in the positive tone showing `money(confirmed)` rounded
to whole dollars (`$124`), matching the existing count-badge geometry.

Route `/referrals`. `programStatus === 'terminated'` **and** no referral history ⇒ the rail item is absent
and the route redirects to `/account`.

### 5.1 State machine

Derived entirely from `GET /api/account/referrals`. No local state decides which state renders.

| State | Condition | Section renders |
|---|---|---|
| **A · Details missing** | `referrerGate.complete === false` and no dormant history | entry form + unlocks panel + "Were you referred?" |
| **B · Active, empty** | `code != null`, `referrals.length === 0` | code card · empty note · how-you-get-paid |
| **C · Active, populated** | `code != null`, `referrals.length > 0` | earnings strip · referrals list · payments · how-you-get-paid · code card (demoted to the bottom) |
| **D · Dormant** | `referrerGate.complete === false` **and** referral history exists | dormant banner · struck code · read-only list |
| **E · Under threshold** | `payout.heldUnderThreshold != null` | as C, plus a warning notice in the earnings strip |
| **F · Terminated** | `programStatus === 'terminated'` and history exists | ended banner · read-only earnings, list, payments. No code card, no share, no entry form |

"Were you referred?" (§5.6) renders in **every** state where `canEnterCode === true`. It is never gated by
`referrerGate`.

### 5.2 State A — the entry state (the highest-leverage screen in the set)

This is not an error state and must not be styled as one. **No amber, no warning icon, no "action
required", no red asterisks.** A `.card` with a 3px **sage** left border, split `1.1fr / .9fr` at ≥1024px,
stacked below.

**Header:** `t-hd1` **Referrals** / `t-bd-sm` "Get paid for the tradies you send our way."

**Left column — `PayoutDetailsForm`:**
- Eyebrow (`t-label`, sage): `One step, then it's yours`
- `t-hd2`: **Where do we send the money?**
- `t-bd-sm`, max 44ch: "Add your ABN and bank details and your referral code appears right here. It's the
  account we pay your [rate] into — nothing else uses it, and the tradies you refer never see it."
- Fields, in a 2-column grid (ABN and Account name span both):

| Field | `inputMode` | Validation | Error copy |
|---|---|---|---|
| ABN | numeric | 11 digits + ATO checksum, spaces ignored | *That's not a valid ABN. It's 11 digits — check the number on your invoices.* |
| BSB | numeric | 6 digits, hyphen optional | *A BSB is 6 digits, like 063-000.* |
| Account number | numeric | 5–9 digits | *Account numbers are between 5 and 9 digits.* |
| Account name | text | non-empty | *We need the name on the account, exactly as your bank has it.* |

- `Btn sage md`: **Save and get my code**. Disabled (`b-disabled`, 40% opacity) until all four validate.
- Below a hairline, three `t-cap` lines, each on its own row, in this order:
  - `· You don't need to have ordered anything to refer. Any account can.`
  - `· We only ever use these to pay you. Nobody else sees them.`
  - `· You can change or remove them any time.`

  The first line is the ACL s 49 separation and is not optional decoration.

**Right column — "What this unlocks",** a `--recessive` panel:
- `t-label` `What this unlocks`
- A dashed-bordered box on paper: `ABC-123` at `t-hd2` in `--quietest` `font-data`, beside `t-cap`
  "your code". A greyed **example**, never a real or reserved code.
- `t-bd-sm`: "Your mate gets **[discount] off their first order**. When they've paid it in full, your
  **[rate]** goes out by bank transfer within **[payoutDays]**."
- Three `t-cap` conditions under a hairline: minimum order · what the rate is on · the window.
- `Read the full rules and terms →`

**Validation timing.** Validate on blur, never on keystroke. Clear an error the moment the field changes.
Server rejection surfaces above the button: *"We couldn't save that. Try again — nothing was changed."*

**On success.** The response returns `referrerGate.complete === true` plus the code. The section
re-renders into State B **in place** — no navigation, no reload, no toast. The code card takes the position
the form occupied. Announce via `aria-live`: "Your referral code is KRA-7F2."

### 5.3 State B — code, no referrals yet

- **Code card** (sage-bordered, `.card`): eyebrow `Your code` · the code at 40px `font-data` semibold,
  `letter-spacing: .1em` · `Copy code` · the share URL in a read-only `.field mono` · `Copy link` · `Share`.
  Under a hairline, the one-sentence rule with the conditions folded in:
  > Your mate gets **[discount] off their first order**. When they've paid it in full, you get **[rate]**
  > of it — bank transfer, within **[payoutDays]**. Their order needs to be at least **[minOrder]** ex GST
  > before delivery, and placed within **[window]**. [Full rules →]
- **Empty note** — a `.card` with a 3px `--tone-mute-bd` left border:
  > `t-bd-lg` **Nobody's used your code yet.**
  > `t-bd-sm` Share it with one tradie this week. They save on their first order, and you get paid when
  > they've paid us.

  **Not** an empty table with five headers, not a zeroed summary strip.
- **How you get paid** (§5.5).

### 5.4 State C — the working state

Order on the page, top to bottom. This order is the design.

1. **Header** — `t-hd1` **Referrals** · `t-bd-sm` "`n` mates referred · next payment due **[date]**" ·
   right-aligned `fmtDayDate(today)` as the dashboard does.
2. **Earnings strip** — `SummaryCell` × 3 in a `.card` row (stacks below 640px):

   | Cell | Value | Sub-line | Tone |
   |---|---|---|---|
   | Pending | `money(earnings.pending)` | waiting on their payment | neutral |
   | Confirmed | `money(earnings.confirmed)` | due by **[date]** | `TONE.pos` background + text |
   | Paid | `money(earnings.paid)` | lifetime | neutral |

   Directly beneath, `t-cap`: *"These are cash amounts. Your ex/inc GST setting doesn't change them — a
   payout isn't a price."* (AC-31 made visible rather than merely true.)

   The Confirmed cell **always names the due date** — `confirmedAt + payoutTimeframeDays`. That is the
   promise from the offer, restated where it can be checked (AC-80).
3. **Your referrals** — `.card` + `.panel-head` ("Your referrals", count right-aligned). Column header row
   in `t-label`: Who · Signed up · Status. Rows are **not clickable**: no `card-link`, no hover fill, no
   chevron. There is nothing to open.

   | Column | Content |
   |---|---|
   | Who | `displayName` — business name, else masked email (`j••••@outlook.com`) |
   | Signed up | `fmtDate(joinedAt)` in `t-data-sm` |
   | Status | `StatusPill` |

   Status mapping:

   | API `status` | Pill | Tone | Sub-line |
   |---|---|---|---|
   | `signed_up` | Signed up | `draft` | — |
   | `quoting` | Quoting | `work` | — |
   | `ordered` | Ordered | `work` | — |
   | `paid_in_full` | Paid in full | `pos` | — |
   | `not_eligible` | Not eligible | `mute` | the reason, `t-cap`: *First order was under [minOrder] ex GST* / *No first order within [window]* |

   Footer line under a hairline, `t-cap`: *"You see the business name and how far along they are, and
   nothing else — never their prices, their address or what's on their job."*

   **Never a dollar figure against a name in this list.** (Legal research §5.4.)

   Below 768px the row becomes a stacked card: name and pill on one line, "Signed up [date]" beneath.
4. **Payments to you** — `.card` + `.panel-head` "Payments to you". Columns: Date · Amount (right) ·
   Reference · Covers. Empty: *"Nothing paid out yet. Your first transfer shows up here with its bank
   reference."*
5. **How you get paid** (§5.5).
6. **Code card, demoted** — the same sage-bordered card as State B but compact: eyebrow, code at 28px, the
   URL as `t-data-sm`, `Copy link` and `Share`. On a working account the earnings are the point; the code
   is a tool.

### 5.5 "How you get paid" panel

`.card` + `.panel-head`. Two columns at ≥640px:

- **Bank account** — `t-data` `BSB 063-••• · ••••4417` (masked, always — AC-29), `t-bd-sm` account name.
- **ABN** — `t-data` formatted `51 824 753 556`, plus `t-cap` `Checks out` in `--tone-pos`, or
  `We can't read that as a valid ABN` in `--destructive`.

Under a hairline, `t-bd-sm`:
> We pay by bank transfer within **[payoutDays]** of your mate's order being paid in full. Amounts include
> any GST payable; your own tax is between you and your accountant — we don't give tax advice.

Conditional sentence, appended only when `minPayoutBalance > 0`:
> We pay out once your balance reaches **[threshold]**.

Actions: `Btn outline sm` **Edit details** · `Btn ghost sm` **Remove details**.

**Edit** swaps the panel body for `PayoutDetailsForm` pre-filled with everything except the account number
(which is masked and must be retyped). **Remove** is the refusal path in §5.7.

### 5.6 "Were you referred?" — manual code entry

Renders whenever `canEnterCode === true`, in every state, at the bottom of the section.

> `t-hd3` **Were you referred?**
> `t-bd-sm` If a tradie gave you a code, put it in before your first order and **[discount]** comes off it.

One `Input` (`className="mono"`, `maxLength={7}`, uppercased on input, `letter-spacing: .14em`,
`placeholder="ABC-123"`) + `Btn outline md` **Apply code**. Enter submits.

**Success** — the field is replaced by a `.quote-notice--info`-toned sage notice:
> **Done — [discount] is off your first order.**
> It's already in every price you see, and it's yours until **[expiry]**.
> [See the details on your Account page →]

and beneath it, `t-cap`:
> **[referrer] will be told when your first order is paid, and is paid a percentage of it.**

That second line is a required disclosure, not a nicety (§9.2). It appears here and on the discount panel,
and nowhere else.

**Errors** — `t-cap` in `--destructive` under the field, field gets `.field.err`:

| Cause | Copy |
|---|---|
| unknown code, **or** a code whose owner has removed their payment details | That code isn't valid. Check it with the tradie who gave it to you. |
| own code | That's your own code. |
| already has a referral | Your account already has a referral — it's one per account. |
| first order exists | A code can only be added before your first order. |
| same ABN as the referrer | That code isn't valid. Check it with the tradie who gave it to you. |

Two different situations share the first message deliberately: naming a dormant referrer's account state
would disclose a third party's missing bank details.

### 5.7 The refusal, the dormant state, and termination

**Removing details while confirmed money is unpaid.** Pressing **Remove details** opens a confirmation in
place (never a modal — the ops `ProjectRecord` pattern):
> `t-bd-sm` **Remove your payment details?**
> `t-cap` Your code stops recording new referrals. The mates you've already referred keep their discount,
> and anything already paid stays in your history.

When `payout.clearBlocked != null`, the same control instead reveals a `--warning` notice:
> **We can't remove these yet.**
> **[amount]** is confirmed and hasn't gone out. We need this account to send it — usually in the next
> payment run, due **[date]**. You can remove them once it's paid.

with a single `Btn outline sm` **OK** in the warning ink. The Remove control is *not* disabled — a disabled
button explains nothing.

**State D — dormant.** An `--info`-toned notice with a 3px `--info` left border, above everything:
> **Your code is switched off.**
> You removed your payment details, so **[code]** won't record new referrals. **[heldPendingDetails]** is
> waiting to be confirmed and can't go out until we have somewhere to send it. Nothing you've already been
> paid is affected, and the mates you've already referred keep their discount.
> `Btn sage sm` **Add my details back**

The `heldPendingDetails` sentence is omitted when the amount is zero. The code card renders at 55% opacity
with the code struck through and a `.quote-chip--neutral` reading `Not recording new referrals`. Share
controls are removed, not disabled.

**State E — under threshold.** In the earnings strip the Confirmed cell takes `TONE.attn` instead of
`TONE.pos` and its sub-line reads `accruing`. Beneath the strip, a `--warning` notice:
> You've earned **[amount]**. We pay out once your balance reaches **[threshold]** — it keeps accruing
> until then and it isn't going anywhere.

Zero language of any kind about thresholds renders when `minPayoutBalance === 0`.

**State F — terminated.** A `--tone-mute`-bordered info notice at the top:
> **This program has ended.**
> We're no longer taking new referrals. Anything you'd already earned is below and will still be paid, on
> the timetable you were given.

Earnings, list and payments render read-only. No code card, no share, no entry form. An account with no
referral history never reaches this route.

---

## 6. Screen: the discount panel (the referred tradie)

**Intent.** Tell someone who is not in a program that their price is lower, why, and until when. Remove it
and a time-limited offer expires silently — the one outcome that generates complaints rather than orders.

**Where.** `AccountSettingsPage` in `src/app/App.tsx`, inside the Settings block, as a **full-width card
above** the existing `Price display` / `Sign-in & security` two-up grid.

> **Refinement on the spec.** §8.6.1 says "beside the Price display preference". A 50%-width column buries
> an offer with a deadline beside a preference toggle. The panel keeps the same *home* — the one place on
> the site where "how my prices work" lives — but takes the full column width and leads. This is a change
> from the spec's wording and should be confirmed at the mock gate.

Source: `GET /api/account/referral-offer`. `offer === null` ⇒ **nothing renders at all** — no placeholder,
no greyed card, no "you don't have a referral discount". The Account page is byte-identical to today.

### 6.1 The four states

All four are a `.card` with a 3px left border and the eyebrow `Your referral discount`.

**Available** (`state === 'available'`, more than 30 days remaining) — sage border, sage eyebrow:
> `t-hd1` **[discount] off your first order**
> `t-bd` It's already in every price you see — there's nothing to apply. This is a one-off from
> **[referrer]**, and it's yours until **[expiry]**.
> chips: `[n] months left` (`--ready`) · `First order only` (`--neutral`) · `One per account` (`--neutral`)
> `t-cap` [referrer] is told when your first order is paid, and is paid a percentage of it.
> action: `Btn sage md` **Finish your quote →** when a draft exists, else **Start a quote →**

**Expiring** (`state === 'available'`, ≤ 30 days remaining) — `--tone-attn` border and eyebrow:
> `t-hd1` **[discount] off your first order — [n] days left**
> `t-bd` It runs out on **[expiry]**, and it's a one-off. It's already in every price you see; place your
> first order before then and it's yours.
> chips: `Expires [expiry]` (warning) · `First order only`
> action: `Btn sage md` **Finish your quote →**

The 30-day boundary is the same trigger as the reminder email, so the screen and the inbox agree.
The remaining-time chip reads in months above 60 days and in days below.

**Used** (`state === 'used'`) — `--tone-mute-bd` border, `--quiet` eyebrow:
> `t-hd2` **Your [discount] referral discount was applied to order [usedOrderNo]**
> `t-bd` On **[usedAt]**. That was the one-off — nice work.
> link: `See that order →`

**Expired** (`state === 'expired'`) — `--tone-mute-bd` border:
> `t-hd2` **Your [discount] referral discount expired on [expiredAt]**
> `t-bd` It applied to a first order placed within **[window]** of signing up with [referrer]'s code. Your
> prices are unchanged from here.

No apology, no "sorry you missed out", no offer to reinstate.

### 6.2 Prohibited vocabulary in this panel and everywhere near it

Not: **apply · redeem · claim · use at checkout · voucher · coupon · credit · balance · wallet · stored ·
load · activate**. There is no redemption moment in this system, and credit/balance language also
undermines the reason the discount sits outside the gift-card regime.

Not: any second percentage, any combined figure, any reference to the standing account discount, any
dollar saving. (AC-75, and §6 of the spec on worked dollar figures.)

### 6.3 GST

Nothing in this panel moves with `price_gst_mode`, because a percentage is unit-free. **That is arithmetic,
not an exemption** — do not implement it as a carve-out and do not copy the payout-side exemption here. If
a worked dollar figure is ever added, it is a price and honours the preference like any other.

---

## 7. Screen: the quote money panel

`QuoteTotals` gains one optional prop:

```ts
referral?: { percent: number; referrerName: string }
```

When present, one row renders **above** the existing figures, inside the sage band, separated from them by
a hairline:

> left: `Referral discount — [percent]% off, thanks to [referrerName]` — `t-cap`, `--sage-ink`
> right: `Already in the prices above` — `t-cap`, `--sage-ink`, medium

Below 640px the two halves stack, left-aligned.

It sits above the figures because it is a statement *about* the prices, not one of them, and because a row
in the middle of a totals column reads as a line item that should be arithmetically visible — which it
deliberately is not.

The prop is absent (and the row gone) at the first pricing event after the discount is used or expires
(AC-57). An issued quote renders it from the issue-time stamp and never re-prices (AC-54).

Everything else in `QuoteTotals` is unchanged, in both GST modes, for every non-referred account.

---

## 8. Screens: the ops console

New tab `Referrals` in `ALL_TABS` (`src/ops/OpsApp.tsx`), between Pricing and Files. Three sub-screens on
the `Pricing.tsx` sub-tab pattern. Page container `max-w-5xl` for Program, full width for Referrals and
Payouts. Everything below reuses `Pricing.tsx` verbatim in structure: `HealthBanner`, the underline sub-tab
row, the inline-editable table, the before/after review modal, confirm-in-place.

### 8.1 Program

- **Health banner:** `Program active · referrer reward on · referred discount on · version [n], saved
  [date] by [name]`, right side `[n] payouts ready — [amount] →`. Sage tone when active, warning tone when
  paused or terminated.
- **The restatement card** — a `.card` above the fields, whose whole job is to make a typo visible:
  > A referred tradie gets **[discount]** off their first order. When that order is at least **[minOrder]**
  > ex GST (goods, after discount, excluding delivery) and paid in full, the referrer earns **[rate]** of
  > it, paid within **[payoutDays]**. A referral lapses if there's no first order within **[window]**.
  > [No cap. | Capped at [cap] per referral.] [No payout threshold. | Paid out once a balance reaches
  > [threshold].]

  It recomputes live from the unsaved field values, so a mistyped 10% is visible before saving.
- **Status card:** three buttons (Active / Paused / Terminated) + two checkboxes (`Referrer reward active`,
  `Referred discount active`) + `t-cap` "Paused hides every placement and records nothing new; the landing
  page stays up and says the program is on hold."
- **Numbers table** — the `Pricing.tsx` inline-edit table: label left, `ops-in` input right with its unit.
  Rows: commission rate · cap (blank = no cap) · qualifying minimum · referred discount · attribution
  window · payment timeframe · minimum payout balance (0 = off).
- **Threshold warning** — a `--warning` notice, shown whenever the threshold field holds a non-zero value:
  > **Setting a minimum payout balance above $0**
  > Money held under a threshold is still legally payable and must not sit unpaid for twelve months. The
  > payout queue force-promotes any accruing group whose oldest confirmed earning passes eleven months,
  > threshold or not. Turning this on also puts the threshold into the offer on the landing page — it can't
  > be a surprise found later.
  > ☐ I understand

  The checkbox maps to `body.acknowledgeHold`; save is refused without it.
- **Standing note:** *"Changes apply to referrals recorded from now on. Referrals already recorded keep the
  rate, discount, minimum, window and timeframe they were given."*
- **Commit bar:** `Discard changes` (ghost) · `Review change →` (sage) → the before/after modal.
- **Terminating** — confirm in place, `--destructive` tone:
  > **End the referral program?**
  > New referrals stop being recorded and every placement disappears. **Nothing already promised is
  > withdrawn:** pending earnings still confirm when their order is paid, confirmed earnings are still paid
  > within their stated timeframe, and every discount already given runs to the date it was given. To stop
  > those, use a bulk void — it is a separate, deliberate act.
  > Type TERMINATE to confirm · [field] · `End the program` / `Cancel`

  Reactivating uses the same shape with `REACTIVATE` and: *"Restarting attributes nothing retroactively.
  Referrals that lapsed while it was off stay lapsed."*
- **Stale save (409):** a `--warning` notice — *"Someone else saved first. These settings were changed by
  [name] at [time], so your version ([n]) is no longer current. Reload to see theirs, then make your change
  again — nothing of yours was saved."* + `Reload settings`.

### 8.2 Referrals list

- **Filter pills** (the `Projects.tsx` pattern, sage fill when active): All · Recorded · Ordered · Earned ·
  Paid · Expired · Void, each with a count.
- **Search field**, 260px, placeholder `code, referrer or referred email…`.
- **`Bulk void…`** as a secondary button, top right — the only path to stopping in-flight promises.
- **Table** (`min-w-[1000px]`, `overflow-x-auto`): Referrer · Referred · Code · Recorded · Status ·
  Earning (right) · Flags. Referrer and Referred cells carry the email as a `t-cap` second line. Status is
  a chip with a `t-cap` reason beneath where one exists.
- **Flag chips** — warning-brown outline, one per flag: `ABN` · `Phone` · `Name` · `Postcode [value]`. A row
  with any flag takes a faint warning-tinted background. Footer note:
  > Flags are a signal for a reviewer, not a control — one person can legitimately hold several ABNs, and a
  > suburb full of tradies is the market, not fraud. Click a row to see both accounts and void it. There is
  > no action here that creates a referral.
- **Void** — confirm in place, sage tone, mandatory reason:
  > **Void this referral?** [referrer] → [referred]. The earning of [amount] leaves the ready-to-pay queue.
  > Any not-yet-issued quote can then be re-priced without the discount. An issued quote keeps its price.
  > Reason — staff read this later to understand why money didn't go out · [field] · `Void referral`

  `Void referral` stays disabled until the reason is non-empty. Un-void uses the same shape.
- **Bulk void** — `--destructive` tone, reason + typed `VOID`:
  > **Void [n] recorded referrals**
  > This withdraws promises already made to real people: [n] referrers lose an expected payment and [n]
  > referred tradies lose a discount they were told about. It is not what ending the program does, and it
  > cannot be undone in bulk.
- **Empty:** the standard ops dashed box — *"No referrals in this view."*

### 8.3 Payouts — the weekly job

Top strip, a `.card` with a 2px sage left border:
> `t-hd2` **[n] referrers**  `t-hd2` **[total]**  `t-cap` ready to pay · [n] past its promised date
> right: `Export CSV` (secondary) · `Mark paid…` (sage)

The "past its promised date" clause renders only when at least one group has `overPromise`.

**Ready to pay** — `.card` + `.panel-head` ("Ready to pay" / "grouped per referrer — one transfer each").
Columns: Referrer (with `n earnings` sub-line) · ABN · BSB · Account · Account name · Amount (right) ·
Oldest confirmed · actions. All bank figures in `font-data`.

Sorting: `overPromise` groups first, then oldest-confirmed ascending. An over-promise row takes a faint
warning background and a `Over promise — [n] days` chip in its Oldest-confirmed cell. Each row carries a
ghost `Mark failed` once a payout exists for it.

**Accruing** — rendered only when `minPayoutBalance > 0`. `.panel-head` reads
`Accruing — under the [threshold] threshold` / `[n] referrers · [total] · excluded from this run`. Three
columns: name · amount · oldest, plus a per-row `Pay anyway` secondary. A force-promoted group shows a
`Forced — 11 months` warning chip. Footer note:
> This whole group only exists when a minimum payout balance is set. Anything past eleven months is
> promoted into the run automatically.

**Mark paid** — confirm in place, sage:
> **Mark [n] payouts paid — [total]**
> Do this **after** you've made the transfers. It flips [n] earnings to paid, freezes each referrer's bank
> details onto their payment record, and emails all [n].
> Bank reference from the transfer you made · [field]
> ☐ Include the [n] accruing referrers ([amount])   ← only when an accruing group exists
> `Mark [n] paid` / `Cancel`

`Mark [n] paid` is disabled until the reference is non-empty.

**Mark failed** — confirm in place, warning: *"Returns its [n] earnings to the ready queue. The failed
payment stays in history with its reference, so the bank record and this one still agree."*

**Payments made** — `.panel-head` with a date-range control and `Export CSV`. Columns: Paid · Referrer ·
Reference · Account paid · Amount (right) · By · Status. Footer note:
> Bank details are frozen onto each payment as it goes out, so this stays correct after a referrer changes
> or removes theirs. This is the accountant's record.

**Empty:** top strip reads `Nothing ready`; the dashed box reads *"No referral payouts are ready. Earnings
appear here once the referred order is paid in full."*

### 8.4 Ops dashboard row

One row in "Needs us", rendered only when `referralPayoutsReady.count > 0`:
> `[n]` · **referral payouts ready — [amount][, one [n] days old]** · `Open →`

The age clause appears only when something is over promise. Zero count renders nothing at all, per the
existing dashboard rule.

### 8.5 Ops project record

The existing project record gains, in the pricing block: `Referral discount applied — [percent]% (referrer:
[name])`, plus any review-flag chips, above the price. Staff see the full composition in the price-explain
trace; that trace's discount step label becomes truthful about composition. Ops-only — none of this is
serialised to a customer response.

---

## 9. Accessibility

- **Focus.** Every control keeps the site's `focus-visible:ring-2 ring-sage ring-offset-2`. The account
  rail's new item is reachable in DOM order with `aria-current="page"` when active.
- **Status is never colour alone.** Every `StatusPill` and every chip carries its icon and its word.
- **The code** is rendered as text, selectable, with `aria-label="Your referral code, K R A dash 7 F 2"` so
  it is read out as characters rather than as a word.
- **Copy actions** announce through a visually-hidden `aria-live="polite"` region ("Link copied"), because
  the only visual feedback is a transient label swap.
- **Form fields** use `id`/`htmlFor` (`FieldLabel` is a sibling, not a wrapper) and `aria-describedby`
  pointing at the error line, with `aria-invalid` on failure. The submit button is disabled rather than
  hidden, so its state is announced.
- **Tables** in ops use real `<th scope="col">`. The account referrals list is a definition-style list of
  rows, not a table — each row is one non-interactive group.
- **Contrast.** `--tone-attn` on `--tone-attn-bg`, `--tone-pos` on `--tone-pos-bg` and `--sage-ink` on
  `--sage-wash` are the existing verified pairs; use no other combination. `--quietest` is used only for
  the disabled example code and the "nothing here" placeholder, never for content.
- **Touch targets** on phone: every button in the share cluster is at least 44px tall (`Btn md` at 12px
  vertical padding + 21px line-height = 45px).
- **Reduced motion:** there is no motion in any of these screens beyond the existing `.disclose`
  transition, which already honours the preference.

---

## 10. Responsive behaviour

| Surface | ≥1024 | 768–1023 | <768 |
|---|---|---|---|
| `/refer` hero | `t-ds1` 56px | 38px | 32px, CTAs stack full-width |
| Conditions grid | 3 columns | 2 columns | 1 column, hairline-divided rows |
| Three steps | 3 columns | 3 columns | stacked, hairlines collapsed |
| `/refer` state band | split 1.15fr/.85fr | stacked | stacked |
| Referrals entry form | 2-column field grid | 1 column | 1 column, button full width |
| Earnings strip | 3 cells in a row | 3 cells in a row | stacked cells |
| Referrals list | 3-column row | 3-column row | stacked card per row |
| Discount panel | copy left, CTA right | stacked | stacked, CTA full width |
| Quote referral row | two halves | two halves | stacked, left-aligned |
| Ops tables | table | table with `overflow-x-auto` | card-per-row (the `Projects.tsx` `lg:hidden` pattern) |

The account rail folds into the site drawer below 1024 exactly as it does today; the Referrals entry joins
the drawer's account group.

---

## 11. Things this design deliberately did not build

- **Any invite, contact-import or send-on-their-behalf affordance.** Three share controls, no fourth.
- **A referral detail page in the account area.** Rows are not clickable; there is nothing more we are
  willing to show about another person.
- **A "you saved $X" figure** on the discount panel or the quote. It needs a second pricing pass against an
  undiscounted baseline and it is out of scope.
- **A blocked-on-details payout group in ops.** Unreachable under the payability rule.
- **Any viewer for the bank-detail access log.** No screen, no tab, no export, now or later.
- **Progress indicators, streaks, badges, leaderboards or a referral "level".** Cash is the mechanic.

---

## 12. Open questions the mock gate must settle

| # | Question | Recommendation |
|---|---|---|
| Q1 | **The disclosure to the referred tradie** — "[referrer] is told when your first order is paid, and is paid a percentage of it" — appears on the code-applied confirmation and the discount panel. It is what makes it safe to show the referrer their rate and their earnings on one screen. | Approve it. The alternatives (hide the rate from the earnings screen, or show banded amounts) cost the referrer clarity about their own money, which is what that screen exists for. |
| Q2 | **The discount panel takes the full column width** above the Price display card, rather than sitting beside it as §8.6.1 says. | Approve the full width. An offer with a deadline in a 50% column beside a preference toggle is a status field. |
| Q3 | **The GST sentence on every payout surface** — "Amounts include any GST payable." | Keep as a slot, flag for the accountant, do not launch without review. It states the position already taken and must not simply be deleted. |
| Q4 | **The account rail badge** shows confirmed money as a dollar figure (`$124`). | Approve. A count badge would say "1", which is not the fact the referrer cares about. |
| Q5 | **The entry state's dashed example code reads `ABC-123`.** | Confirm the real code format is `XXX-NNN` from the unambiguous alphabet (no O/0/I/1) so the example is honest. |

---

## 13. Acceptance criteria this document is answerable for

Copy and layout obligations, mapped so a tester can find them:

AC-25 (share, no recipient field) §3.4, §5.3 · AC-26 (masked name, nothing else) §5.4 · AC-27, AC-31
(earnings, GST-inert) §5.4 · AC-29 (masked read-back) §5.5 · AC-30 (payment history) §5.4 · AC-32, AC-76
(every figure from config) §1 · AC-34 (logged-out vs logged-in) §3.3 · AC-35 (no cap clause) §1 · AC-36,
AC-37 (placements) §4 · AC-61 (threshold language) §1, §5.7 · AC-64 (terminated) §5.1 · AC-69 (panel home)
§6 · AC-70 (no redemption language) §6.2 · AC-71 (three states) §6.1 · AC-73, AC-74 (server-sourced, GST)
§6.3 · AC-75 (never a total) §0, §6.2 · AC-78 (no contact fields) §0, §11 · AC-79 (no purchase coupling)
§0, §3.2, §4 · AC-80 (payment timeframe stated) §3.2, §5.4, §5.5 · AC-81 (threshold in the offer) §3.2.
