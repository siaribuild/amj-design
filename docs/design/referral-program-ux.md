# Referral program — interaction specification

Branch: `feat/referral-program`
Status: **revision 2 — awaiting the UX mock gate.** Nothing here may be implemented until the owner has
approved `docs/mocks/referral-program.html`.
Author: ux-designer
Date: 2026-08-15

**Inputs.** Spec `docs/specs/referral-program.md` rev 6 · amendment `referral-program-pending-amendments.md`
(D18) · design `docs/design/referral-program.md` rev 2 (ADR-8, §10) · legal research
`referral-program-legal-research.md` §§4.1, 4.3, 4.5, 5.1, 5.4, 10 · owner revision feedback 2026-08-15.

**The mock is the contract.** Where this document and the mock disagree, fix the mock — but say so.

> ### Revision 2 changed the shape of the feature. §14 lists every spec and design item that must be
> amended to match. Read it before building, and route it to the product-manager and architect.

---

## 0. The rules that outrank everything else here

1. **No customer-facing surface prints a combined discount.** The referred tradie sees the referral
   percentage and nothing else. (AC-75)
2. **No copy makes the referrer's reward conditional on the referrer's own purchase.** "Any account can
   join" and "we need your bank details" are two facts, and they now live on *different steps* — the first
   in the hero and on the join screen, the second inside the join flow's second part. They are never
   adjacent, so they cannot be read as one condition. (AC-79, ADR-8d)
3. **There is no field anywhere into which a referrer types a mate's name, phone or email.** (AC-78)
4. **No program figure is typed into a string.** Everything renders from `GET /api/referral/program`. (AC-76)
5. **Payout figures ignore `price_gst_mode`; the referred tradie's discount honours it.** (AC-31, AC-56)
6. **The commission rate never appears on any account-area screen.** It lives on `/refer` and in the terms.
   A rate beside an earned amount is invertible — 1% and $45.00 tells the referrer their mate spent $4,500.
   (New in revision 2; legal research §5.4.)
7. **Every mutating action lives on the row it affects.** No batch bars, no selection checkboxes, no
   "apply to selected", anywhere in ops. Search, filters and CSV export may stay above a table — they
   change nothing, so they have no wrong target.
8. **No acknowledgement or "I understand" checkboxes, ops or customer side.** If a rule matters, enforce it
   in code or the data model. A control that blocks a save while changing no behaviour is theatre, and it
   shifts the appearance of responsibility onto someone who isn't carrying it. Two things this does *not*
   cover: the type-TERMINATE confirmation (a guard against an accidental destructive act by the person
   performing it) and the customer's acceptance of the terms in the join flow (the click *is* the operative
   act).

---

## 1. Copy slots and formatting

Figures arrive in `ReferralProgramPublic`. **Formatters, not string concatenation** — otherwise
`windowMonths = 1` prints "1 months".

| Slot | Source | Renders as | Notes |
|---|---|---|---|
| `[discount]` | `discountPercent` | `2.5%` | trailing `.0` stripped: `5%`, not `5.0%` |
| `[rate]` | `ratePercent` | `1%` | **`/refer` and the terms only** — never in the account area |
| `[minOrder]` | `minOrderAmount` | `$2,000` | `moneyRound()`; no cents when whole |
| `[window]` | `windowMonths` | `12 months` | pluralised |
| `[payoutDays]` | `payoutTimeframeDays` | `14 days` | pluralised |
| `[cap]` | `capAmount` | *nothing at all* when `null` | gates a whole sentence, never an empty slot (AC-35) |
| `[referrer]` | referral row | business name, else masked email | |
| `[expiry]` | `expiresAt` | `14 MAR 2027` | `fmtDate` from `accountModel.tsx` |

**`minPayoutBalance` / `[threshold]` is deleted.** See §14.

Dollar figures use `money()` from `accountModel.tsx` (`$1,240.00`). The one exception is `[minOrder]` in
prose, which reads `$2,000` — a separate `moneyRound()` used nowhere else.

---

## 2. Component reuse map

| Need | Existing component / class | Notes |
|---|---|---|
| Buttons | `Btn` (`src/app/ui.tsx`) | `sage` primary, `outline` secondary, `ghost` for leave/void |
| Text inputs | `Input` + `FieldLabel` (`ui.tsx`) | no change; pass `inputMode="numeric"`, `maxLength`, `autoComplete="off"`, `id`, `aria-describedby` |
| Section eyebrow | `SLabel` | |
| Marketing section shell | `<section className="ground-paper\|ground-bone border-t border-black/8 section-pad">` + `max-w-6xl mx-auto px-6` | alternate the ground against the neighbour |
| Two-column heading + action | `.split-row.is-center` + `.split-prose` | |
| Closing banner | `CtaBanner` | unchanged |
| Cards | `.card` + `ground-*` | never pick a card fill |
| Panel header band | `.card` + `.panel-head` | |
| Status chips | `StatusPill` (`accountModel.tsx`), tones `pos`/`work`/`mute`/`draft` | icon + word, never colour alone |
| Small inline chips | `.quote-chip--ready` / `--neutral` / `--warning` | add no new modifier |
| Earnings summary strip | `SummaryCell` (`AccountDashboard.tsx`) | **must be lifted out** — currently module-private |
| Money panel | `QuoteTotals` | new optional prop, §7 |
| Account rail | `AccountShell` | `AccountSection` gains `"referrals"` |
| Notices | `.quote-notice--info` / `--warning` / `--danger` (theme.css) | extend theme.css if a tone is missing; never inline rgba |
| Ops shell, tabs, tables, confirm-in-place | `src/ops/Pricing.tsx` and `Projects.tsx` | copy verbatim; **no new ops components** |

### 2.1 Card pattern map — every card in the mock, and the pattern it uses

**No new card variant is introduced anywhere.** Two card *tracks* already exist on this site and both are
used as-is; everything else is `.card` at one of the site's two established paddings. If a card in the mock
looks like a new shape, it is a bug in the mock — build the pattern named here.

| Where | Pattern | Source |
|---|---|---|
| `/refer` three steps | **Track A — numbered steps.** `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0`; card `relative card p-6 flex flex-col sm:[&:nth-child(n+2)]:-mt-px lg:[&:nth-child(n+2)]:mt-0 lg:[&:nth-child(n+2)]:-ml-px`; badge `w-8 h-8 border border-sage/40 flex items-center justify-center text-sage font-data t-data-sm`; `h3 font-semibold text-ink mb-1.5 font-display t-bd`; `p text-body leading-relaxed t-bd`; `ChevronRight` on the seam at `lg` | `src/app/App.tsx:1061-1078` |
| `/refer` conditions (6) | **Track B — two-column.** `grid grid-cols-1 md:grid-cols-2 gap-0`; card `card p-6 flex flex-col md:[&:nth-child(n+3)]:-mt-px md:[&:nth-child(even)]:-ml-px [&:nth-child(n+2)]:-mt-px md:[&:nth-child(2)]:mt-0`; `h3 … t-bd-lg`; `p text-body leading-relaxed flex-1 t-bd` | `src/app/App.tsx:1192-1206` |
| `/refer` FAQ (4) | **Track B**, including its optional in-card sage link (`text-sage hover:text-sage-deep … ArrowRight`) — used on the last card for the Resources article | `src/app/App.tsx:1192-1206` |
| Home / trade placements | `.split-row.is-center` inside a plain section; the signed-in code card is `.card p-5` + 3px sage `borderLeft` | `theme.css` `.split-row`; `AccountDashboard.tsx:231` |
| Completed-order prompt | `.card p-5` + 3px sage `borderLeft` | `AccountDashboard.tsx:231` |
| Join-flow card | `.card p-8` + 3px sage `borderLeft`, containing a 2-column layout grid. The **card** is the existing shape; the internal split is layout, not a variant | `AccountDashboard.tsx:231` (stripe), `.card` |
| Join-flow "what you're agreeing to" / "what happens next" panels | `--recessive` fill — theme.css's named third surface for a subordinate panel inside a card | `theme.css:50` |
| Account panels (referrals list, payments, how-you-get-paid) | `.card` + `.panel-head` | `theme.css:535` |
| Earnings strip | `SummaryCell` in a `.card` row | `AccountDashboard.tsx:177-198` |
| Discount card, join invitation, dormant/left notices | `.card p-5` + a 3px `borderLeft` in the relevant tone (`SAGE`, `TONE.mute`, `TONE.attn`) | `AccountDashboard.tsx:218/231/299/337` |
| Empty states | `.card p-5` + 3px `TONE.mute` stripe | `AccountDashboard.tsx:299` |
| Quote money panel | `QuoteTotals` unchanged; one extra row inside the existing sage band | `QuoteTotals.tsx` |
| Ops panels and tables | `.card` + `.panel-head` + the ops table; ready-to-pay strip is `.card` + 3px sage stripe | `src/ops/Pricing.tsx`, `Projects.tsx` |

**Two card paddings only**, and neither has a mobile variant — the site keeps them at every width:
`p-6` (24px) for marketing tracks, `p-5` (20px) for account and ops panels. `p-8` (32px) exists for one
case (`AccountDashboard.tsx:372`, EmptyHub) and is used once here, for the join-flow card.

**Nothing genuinely new was needed.** Every card in this design maps to a pattern above.

### 2.2 Non-card reuse audit

| Element | Uses | Source |
|---|---|---|
| Buttons | `Btn` variants `sage`/`outline`/`ghost`/`primary`, sizes `sm`/`md`/`lg` — no new variant, no custom padding | `ui.tsx:72-101` |
| Status chips | `StatusPill` with existing tones; icon + word always | `accountModel.tsx:40-50` |
| Inline chips (durations, flags, conditions) | `.quote-chip` + `--ready`/`--neutral`/`--warning` | `theme.css:961-984` |
| Form fields | `Input` + `FieldLabel`, `.field-control` | `ui.tsx:104-149`, `theme.css:602` |
| Notices | `.quote-notice--info`/`--warning`/`--danger` | `theme.css:986-998` |
| Section eyebrow | `SLabel` | `ui.tsx:60-69` |
| Closing banner | `CtaBanner` with `ground="bone"` | `ui.tsx:165-204` |
| Tabs (ops sub-nav) | the `Pricing.tsx` underline sub-tab row | `src/ops/Pricing.tsx` |

**Corrections made during this audit, so the developer does not inherit them:**

1. **`.figure` was being used inside cards** for the step numerals. `theme.css:1156` reserves `.figure` for
   *a section's* headline number and its comment records the exact failure this reproduces — "on a process
   card a 33px numeral sat beside a 16px heading — twice the weight of the thing it was annotating".
   Replaced with Track A's 32px bordered badge. `.figure-sm` is the in-card numeral if one is ever needed.
2. **Card padding had drifted to 12px and 16px** in the mobile frames. The site has no responsive card
   padding; normalised to `p-5`/`p-6`.
3. **53 cards carried an inline `background: var(--paper)`.** A card's fill is derived from its section's
   ground via `--card-fill` (`theme.css:494-495`); hand-picking it is what produces white-on-white. All
   removed — **never set a card background.**
4. **The ops ready-to-pay stripe was 2px**; the site's stripe is 3px everywhere.

### 2.3 One new shared component

**`JoinProgramFlow`** is the two-part join described in §3.3 — the conditions pane and the payout-details
pane, with a single submit. Used on `/refer` and in the Referrals section. `PayoutDetailsForm` is its
second pane and is reused standalone for **Edit details**. It is a *flow*, not a new visual species: it is
built from `.card` + a stripe + `Input`/`FieldLabel`/`Btn`, per §2.1.

**The ops console is pending a redesign.** Build these three screens from what the console already has,
reuse `Pricing.tsx` and `Projects.tsx` patterns literally, and spend no effort on appearance — it will be
re-skinned. Do not chase the explorations on `design/ops-redesign-prototype`.

---

## 3. Screen: `/refer`

**Route.** New `Page` id `"refer"`, path `/refer`, added to `PUBLIC_PAGES` in `worker/lib/shell.ts`. Hero
image and `<head>` from the Sanity `page` record `pageId: "refer"`. Never 404s.

### 3.1 Structure — six bands, alternating grounds

| Zone | Ground | Contents |
|---|---|---|
| Hero | `ground-night` + `hero-scrim`/`hero-img` | eyebrow · `t-ds2` headline · **one sentence** · one button · one `t-cap` line |
| How it works | `ground-paper` (grid decoration) | `SLabel` · `t-ds2` heading · **three cards**, hairlines collapsed |
| The conditions | `ground-bone` | `SLabel` · `t-ds2` heading + a right-aligned framing line · **one bordered 2-column panel, six cells** · the GST/tax line |
| The join | `ground-paper` (grid decoration) | auth-dependent — §3.3 |
| Good to know | `ground-bone` | `SLabel` · `t-ds2` heading · **three FAQ cards** · link to the Resources article |
| Closing | `ground-paper` | `CtaBanner`, then the site footer |

Grounds must alternate — night → paper → bone → paper → bone → paper — so every seam draws itself without
a rule. Never two of the same in a row.

**Card count, not card treatment, was the problem.** Thirteen cards across three grids (six conditions,
three steps, four FAQ) was the page arguing against its own simplicity. The fix is **six cards across two
grids**, not zero: at 1180px a three-item text list is short paragraphs in a narrow left column with a dead
right half, and cards are what give the desktop layout something to be.

**The conditions are their own section because they are a different kind of information.** The three steps
are the **offer**; the conditions are the **terms of it**. A section boundary is the honest way to stop
conditions reading as features — better than flattening them into the offer's block. Six items in one
bordered two-column panel read as a single table-like object, not as six competing tiles.

Adjacency is legally load-bearing (ACL s 32(2); fine print cannot cure a headline), and **a section
directly beneath the offer satisfies it** — it never required same-block. The conditions section may be
made denser, but it may not be moved below the join band, put behind a link, or collapsed into an accordion.

### 3.2 Hero — cut to one read

The previous draft stacked a headline, a subline, a bordered rule box, two numbered facts and two buttons.
Six things competing to be read first is why it had to be concentrated on. Now:

- **Eyebrow:** `Refer a mate`
- **Headline (`t-ds2`, not `t-ds1`, max 20ch):** `Refer a mate. You both win.`
- **One sentence (`t-bd-lg`, `c-white`, max 52ch):**
  > Your mate gets **[discount] off their first order**. When they've paid it in full, we pay you
  > **[rate] of it**, within **[payoutDays]**.
- **One button (`Btn sage lg`):** `Join the program →` — signed out this reads `Sign in to join →`.
- **One line beneath (`t-cap`, white/55):** `Any account can join — you don't need to have ordered.`

**Nothing about bank accounts appears anywhere on this page outside the join flow.** Hero padding drops
from 76px to 56px.

### 3.3 The join flow — one flow, one commit

**There is no "joined but no details" state.** A person is a member when, and only when, ABN, BSB, account
number and account name are stored. Accepting the conditions, storing the details, creating the membership
and issuing the code are **one act at one instant**. Abandon partway and nothing has occurred: no
half-member, no dormant record, no state to explain, no email to a partial joiner. They see the join CTA
again next time.

The only thing that survives an abandon is what they typed, if they navigate within the session — ordinary
form state, and it **must not be modelled as a membership fact**.

**Part 1 — the conditions.** `.card` with a 3px sage left border, split `1.1fr / .9fr`.

- eyebrow `The conditions` + a two-segment progress rule (first filled sage, second `--shade`)
- `t-hd1` **Join the referral program**
- `t-bd` "Any account can join. You don't need to have ordered anything, and joining costs nothing."
- A `--recessive` panel, `t-label` **What you're agreeing to**, five `t-bd-sm` lines:
  - · Your mate gets **[discount]** off their first order; you get **[rate]** of it once they've paid in full.
  - · Their order has to be at least **[minOrder]** ex GST before delivery, and placed within **[window]** of them using your code.
  - · The **[rate]** is worked out on the goods, excluding GST and delivery — not the invoice total.
  - · We pay by bank transfer within **[payoutDays]**, so you'll need to give us an account to pay into.
  - · You get paid for the mates you refer — not for anyone they go on to refer.
  - *(conditional, only when `capAmount != null`)* · The most you can earn on one referral is **[cap]**.
- Checkbox: `I've read and accept the [referral program terms].`
- `Btn sage md` **Continue →**, disabled until ticked.
- `t-cap` "Nothing is saved yet. You can leave any time, and joining never asks you to buy anything."
- Right pane, `--recessive`, `t-label` **What happens next**: two numbered lines (accept the conditions /
  tell us where to send the money), then `t-bd-sm` "Then you're in, and your code is on this page.", then
  `t-cap` "One button at the end does the lot. Stop before it and nothing has happened."

**The button says "Continue", not "Join".** A button that starts part 2 must not claim something happened.

**Part 2 — where the money goes.** Same card. Eyebrow `Where the money goes`, both progress segments sage,
plus `t-cap` "· conditions accepted [back]" — `back` returns to part 1 without losing anything typed.

- `t-hd1` **Where do we send the money?**
- `t-bd` "Add your ABN and bank details and your referral code appears right here. It's the account we pay
  your [rate] into — nothing else uses it, and the tradies you refer never see it."
- Fields in a 2-column grid (ABN and Account name span both):

| Field | `inputMode` | Validation | Error copy |
|---|---|---|---|
| ABN | numeric | 11 digits + ATO checksum, spaces ignored | *That's not a valid ABN. It's 11 digits — check the number on your invoices.* |
| BSB | numeric | 6 digits, hyphen optional | *A BSB is 6 digits, like 063-000.* |
| Account number | numeric | 5–9 digits | *Account numbers are between 5 and 9 digits.* |
| Account name | text | non-empty | *We need the name on the account, exactly as your bank has it.* |

- `Btn sage md` **Join the program** — disabled until all four validate. This is the single commit.
- Three `t-cap` lines beneath a hairline:
  - · This is what joins you and issues your code — one button.
  - · We only ever use these to pay you. Nobody else sees them.
  - · You can change or remove them any time.
- Right pane unchanged from part 1's position: `What this unlocks` — a dashed box containing `ABC-123` in
  `--quietest` `font-data` beside `t-cap` "your code" (a greyed **example**, never a real or reserved
  code), the deal restated, three `t-cap` conditions, and `Read the full rules and terms →`.

**Validation** on blur, never on keystroke; clear on change. Server rejection above the button: *"We
couldn't save that. Try again — nothing was changed."*

**On success** the band re-renders into §3.4 in place — no navigation, no reload, no toast. Announce via
`aria-live`: "You're in. Your referral code is KRA-7F2."

**What is recorded at the commit:** the acceptance timestamp, the terms version, and the payout details, in
one transaction. There is no window in which someone has accepted terms but isn't a member, and no
ambiguity about which act made them one.

### 3.4 Signed in with a code

`.card`, sage-bordered, split 50/50. Left: the code at 44px `font-data` semibold (`letter-spacing: .1em`),
`Copy code`, the share URL in a read-only `.field mono`, `Copy link`, `Share`, and beneath:
> Text it, say it over the phone, or send the link. Your mate gets **[discount] off their first order**;
> when they've paid it in full, you get **[rate]** of it.

Right, `--recessive`: the pre-written message shown in full before it is sent —
> "Get your windows through OpenFrame — use my code **KRA-7F2** and you'll get [discount] off your first
> order. openframe.com.au/r/KRA-7F2"

— then `t-cap` "We hand this to your phone to send. We never see who you send it to, and there's nowhere
here to give us their details.", then `See your referrals and earnings →`.

**Exactly three sharing affordances and no fourth.** `Copy code` (for reading out), `Copy link`, and
`Share` — `navigator.share({ text, url })` where available, **falling back to copying the message** where
it isn't (most desktops). Never a mailto, never a recipient field.

**Copy feedback:** label swaps to `Copied` with a check for 2000 ms. No toast. A visually-hidden
`aria-live="polite"` region announces "Link copied".

### 3.5 Program off

One off-state, not two. Hero only; the conditions grid, steps, FAQ and state band are all suppressed. The
`CtaBanner` and footer remain.

> `t-hd1` **This program has ended.**
> We're no longer taking new referrals. Anything you'd already earned is in your account and will still be
> paid, and any discount already given still runs to the date it was given.

No rate, no discount, no code, in any variant.

### 3.6 "How it works" — Track A, three cards

`SLabel` **How it works** · `t-ds2` **Three steps, and only one of them is yours.** (max 24ch) ·
**Track A exactly as `App.tsx:1061-1078` builds it** (§2.1): the numbered badge, the `t-bd` heading, the
`t-bd` body, the seam chevron at `lg`. Cards take the ground's `--card-fill` — never set a background.

| # | Heading | Body |
|---|---|---|
| 1 | Share your code. | Text it, say it over the phone, send the link. However you'd normally tell someone. |
| 2 | They save. | Your mate gets **[discount] off their first order** — on their quote from the start. Nothing to enter, nothing to apply. |
| 3 | You get paid. | Once they've paid that order in full, we transfer your **[rate]** — bank account, within **[payoutDays]**. |

Track A carries its own responsive behaviour (1 col → 2 at `sm` → 3 at `lg`); do not add breakpoints.
The step badge is **not** `.figure` — see §2.2 correction 1.

### 3.7 "The conditions" — its own section

`SLabel` **The conditions** · `t-ds2` **What qualifies, in six lines.** on the left, with a `t-bd` framing
line bottom-aligned on the right (max 38ch):
> The whole of it. There's no seventh condition further down, and nothing here is different in the terms.

Then **Track B** (`App.tsx:1192-1206`) with six cards. Six items in two columns is three clean rows, and
because Track B's negative margins collapse every adjacent border into a single hairline, the six read as
**one object** rather than six tiles — which is the whole reason this is the right pattern here rather
than a bespoke panel.

| Heading | Body |
|---|---|
| First order only | It's their **first order** that counts, and it has to be a tradie who's new to us. |
| At least [minOrder] | Ex GST, before delivery. Measured on the goods after the discount. |
| Within [window] | Their first order has to be placed within [window] of them signing up with your code. |
| [rate] of the goods | Worked out excluding GST and delivery — not the total on the invoice. |
| Paid by bank transfer | Within **[payoutDays]** of their payment clearing. You'll need an ABN and bank details on your account. |
| No chains | You get paid for the mates you refer, not for anyone they go on to refer. And you can't refer yourself. |

Conditional seventh card, only when `capAmount != null`: **Capped at [cap]** / *That's the most you can earn
on any one referral.* Seven cards leaves an orphan in the last row; that is Track B's normal behaviour with
an odd count and needs no special handling.

Track B carries its own responsive behaviour (1 col → 2 at `md`); do not add breakpoints.

Line under the panel (`t-cap`, `.measure`):
> Amounts include any GST payable. What you do with it at tax time is between you and your accountant — we
> don't give tax advice. [Read the full rules and terms →]

> ⚠ **The GST sentence is a slot awaiting the accountant.** It states the position already taken. It must
> be reviewed before launch and must not simply be deleted — a stated figure with nothing said about GST is
> the one formulation that is definitely wrong.

**Note on "No chains".** "You can't refer yourself" is a statement of the rule, not a claim that we prevent
it. Do not write "we prevent self-referral" or "self-referral is blocked" anywhere — the same-ABN gate is a
signal, not a control, and one person may legitimately hold several ABNs (spec A13, §4.6.6).

### 3.8 "Good to know" — Track B, four questions, and the article behind them

`SLabel` **Good to know** · `t-ds2` **The questions tradies actually ask.** · **Track B**, four cards.

- **Can I refer someone if I've never ordered?** — Yes. Any registered account can join and refer. Your own
  order history has nothing to do with it.
- **What does my mate actually see?** — Their quote is [discount] lower from the first price they're shown.
  There's no code to enter at checkout and nothing for them to apply.
- **What do I get to see about them?** — Their business name and how far along they are — signed up,
  ordered, paid. Never their prices, their address or what's on their job.
- **Do I earn on the mates they go on to refer?** — No. You get paid for the mates you refer, and that's
  it. No chains, no levels, no tiers.

The fourth card carries **Track B's own optional in-card link** (`text-sage hover:text-sage-deep … ArrowRight`,
`App.tsx:1199-1203`): **Referral program — full FAQ →**, to the Resources article.

> **Why four and not three.** The reduce-the-count test still applies, and three was my previous answer —
> but Track B is a two-column track, and three cards leaves a half-width orphan. Four fills 2×2 exactly,
> which is the shape the pattern was built for. Rather than invent a three-across FAQ track that does not
> exist on this site, the fourth question comes back — and it is a real question, not filler. **This is the
> one place where "use the existing pattern" and "cut the card count" pulled against each other; the
> pattern won.** Flagging it rather than quietly doing either.

### 3.9 The Resources article

**A Sanity `post`, rendered at `/resources/<slug>`, listed on `/resources` beside the T&Cs and the plain-English
rules.** This is the mechanism spec §4.5 already chose for the terms, so the referral FAQ sits naturally
next to them and inherits the same benefit: the long tail is editable by a human who is not deploying code.

- Title: **Referral program — frequently asked questions**
- The landing FAQ carries the three above; the article repeats those three and adds the long tail: what you
  can see about the tradies you refer, what happens if their order is cancelled or refunded, how it works
  if you run two businesses, what happens if you leave the program, when exactly the clock starts, what
  happens if their order is under the minimum.
- **Same figure-slot rule as everywhere else.** The article is authored content, so it is the one place a
  human could type "2.5%" by hand and strand it when the config changes. The article must reference the
  program page for every number rather than restating one — the same constraint spec §11 already puts on
  the terms. Call this out to whoever writes it.
- The landing page links out; the article links back to `/refer`.

---

## 4. The four marketing placements

All four render nothing unless the program is on. None appears inside a priced flow.

### 4.1 Home page section

Between "Good to know" and the closing `CtaBanner`. `ground-paper`. `SLabel` + `.split-row.is-center`.

| Variant | Copy |
|---|---|
| Signed out | `t-ds2` **Know another tradie?** · "They get **[discount] off their first order**. You get **[rate] of it**, into your bank account within [payoutDays] of them paying." · `t-bd-sm` "Any account can refer — you don't need to have ordered." · `Btn sage lg` **How it works →** |
| Signed in, not a member | `t-hd1` **Know another tradie?** · same two-sided sentence · `t-bd-sm` "Any account can join — you don't need to have ordered." · `Btn sage md` **Join the program →** |
| Signed in, member | eyebrow `Your referral code` · sage-bordered `.card`: the code in `font-data`, `Copy link`, and two `t-label`/`t-data` pairs — **Referred** `n mates` and **Earned** `money(paid)` — plus `Referrals →`. Below, `t-cap`: "Your mate gets [discount] off their first order." |

**There is no fourth variant**, because there is no half-joined state. The member variant carries no rate
(rule 6).

### 4.2 `/trade-account` section

`ground-paper`, same shape:
> `t-ds2` **Bring another trade account with you.**
> Your mate gets **[discount] off their first order**. You get **[rate] of it** by bank transfer, within
> [payoutDays] of them paying in full.
> `t-bd-sm` Any registered account can join — ordering isn't part of it. Their first order needs to be at
> least [minOrder] ex GST, before delivery.
> `Btn sage lg` **See how it works →**

### 4.3 Footer link

One entry in the **Service** column of `Footer` (`App.tsx`), between "Trade account" and "How it works":
`Refer a mate` → `refer`. Identical signed in or out. Removed entirely when the program is off.

### 4.4 Completed-order prompt

Foot of `RecordDetailPage` for an order in stage `delivered` or `after_sales`, after the last existing
panel. Never on an in-progress order (AC-37). `.card` with a 3px sage left border, `.split-row.is-center`:
> `t-hd3` **Happy with these? Refer a mate.**
> `t-bd-sm` They get **[discount] off their first order**. You get **[rate] of it**, within [payoutDays] of
> them paying in full.

Right: the code at 22px `font-data` + `Btn sage sm` **Copy link**. A non-member sees `Btn sage sm`
**Join the program →** in place of the code. No earnings figure in either case.

---

## 5. Screen: Account → Referrals

**Intent.** One place for everything referral. It serves **two different people** — someone who refers, and
someone who *was* referred and has a discount — and often one person in both roles.

**Nav.** `AccountSection` gains `"referrals"`; the rail item sits in the account/session group above
`Account`. Icon `Users`. When `earnings.confirmed > 0` it carries a positive-tone badge showing confirmed
money rounded to whole dollars (`$124`).

**Visibility.** The section is present when the account has **a code, OR referral history, OR a referral
offer (live, used or expired)**. Otherwise — including when the program is off and the account has neither —
the rail item is absent and `/referrals` redirects to `/account`.

> This rule replaces §8.6.1's third argument for putting the discount panel on the Account page ("it
> survives the program"). Because the offer itself keeps the section alive, a referred tradie with a live
> discount never loses the explanation for their price.

### 5.1 Page structure — up to two blocks, always in this order

```
h1  Referrals
h2  Your discount        ← only when `offer != null`
    [the discount card — §6]
h2  Refer a mate         ← always
    [the referrer block — state-dependent, below]
    [Were you referred? — while `canEnterCode`]
```

An `h2` per block, so someone with both never has to work out which half they are reading, and someone with
one simply doesn't see the other heading. **No placeholder for the missing block.**

### 5.2 The referrer block — five states

| State | Condition | Renders |
|---|---|---|
| **A · Not a member** | no code, no history | the join invitation (below) |
| **B · Member, empty** | code, `referrals.length === 0` | code card · empty note · how-you-get-paid |
| **C · Member, working** | code, referrals exist | earnings strip · referrals list · payments · how-you-get-paid · code card (demoted) |
| **D · Left, with history** | no code active, history exists | left-the-program notice + rejoin · read-only payments |
| **E · Program off, with history** | program off | ended notice · read-only earnings, list, payments |

**State A — the join invitation.** No form, no fields, no mention of a bank account. Joining is a flow;
this is a door.

*For someone with no discount of their own* — `.card` with a 3px sage left border:
> `t-label` Refer a mate · `t-hd1` **You both win.**
> Your mate gets **[discount] off their first order**. When they've paid it in full, we pay you **[rate] of
> it**, within **[payoutDays]**.
> `t-bd-sm` Any account can join — you don't need to have ordered.
> `Btn sage lg` **Join the program →** · `t-cap` link `Read the conditions first`

*For someone who was referred* (the discount card is above it) — a **muted** card, 3px `--tone-mute-bd`
border, `Btn outline` not `Btn sage`:
> You got **[discount]** off because someone passed you a code. You can do the same: your mate gets
> **[discount] off their first order**, and when they've paid it in full we pay you **[rate] of it**,
> within **[payoutDays]**.
> `t-bd-sm` Any account can join — you don't need to have ordered.
> `Btn outline md` **Join the program →**

The argument is from what just happened to them — they are the best-qualified audience for this because
they have experienced the benefit from the other side. Present, visibly the second subject on the page, and
then it stops.

**State B — member, empty.**
- **Code card** (sage-bordered): eyebrow `Your code`, code at 40px `font-data`, `Copy code`, share URL,
  `Copy link`, `Share`. Under a hairline:
  > Your mate gets **[discount] off their first order**. When they've paid it in full, your share goes out
  > by bank transfer within **[payoutDays]**. Their order needs to be at least **[minOrder]** ex GST before
  > delivery, and placed within **[window]**. [How the program works →]

  Note the phrasing: *"your share"*, not the rate. `How the program works →` goes to `/refer`.
- **Empty note** — `.card`, 3px `--tone-mute-bd` border:
  > `t-bd-lg` **Nobody's used your code yet.**
  > `t-bd-sm` Share it with one tradie this week. They save on their first order, and you get paid when
  > they've paid us.

  Not an empty table, not a zeroed strip, not greyed-out share buttons.
- **How you get paid** — §5.4.

**State C — working.** Order on the page, top to bottom:

1. **Header** — `t-hd1` Referrals · `t-bd-sm` "`n` mates referred · next payment due **[date]**" ·
   right-aligned `fmtDayDate(today)`.
2. **Earnings strip** — `SummaryCell` × 3 in a `.card` row (stacks below 640px):

   | Cell | Value | Sub-line | Tone |
   |---|---|---|---|
   | Pending | `money(earnings.pending)` | waiting on their payment | neutral |
   | Confirmed | `money(earnings.confirmed)` | due by **[date]** | `TONE.pos` |
   | Paid | `money(earnings.paid)` | lifetime | neutral |

   Beneath, `t-cap`: *"These are cash amounts. Your ex/inc GST setting doesn't change them — a payout isn't
   a price."* The Confirmed cell **always names the due date** (`confirmedAt + payoutTimeframeDays`) —
   that's the promise from the offer, restated where it can be checked (AC-80).
3. **Your referrals** — `.card` + `.panel-head`. Header row `t-label`: Who · Signed up · Status. Rows are
   **not clickable**: no `card-link`, no hover fill, no chevron. Nothing to open.
4. **Payments to you** — Date · Amount (right) · Reference · Covers. Empty: *"Nothing paid out yet. Your
   first transfer shows up here with its bank reference."*
5. **How you get paid** — §5.4.
6. **Code card, demoted** — compact: eyebrow, code at 28px, URL as `t-data-sm`, `Copy link`, `Share`. On a
   working account the earnings are the point; the code is a tool.

### 5.3 The referral status list — cut from six to five

The old set was *Signed up · Quoting · Ordered · Paid in full · Not eligible · Expired*.

**"Quoting" is gone.** It tells a referrer their mate is shopping, which is neither theirs to know nor
anything they can act on, and it never changes when they get paid. What remains answers the only two
questions the screen exists for: is this happening, and when do I get paid.

| API `status` | Pill label | Tone | Sub-line |
|---|---|---|---|
| `signed_up` **(absorbs `quoting`)** | Signed up | `draft` | — |
| `ordered` | Ordered | `work` | — |
| `paid_in_full` | **Paid** | `pos` | — |
| `expired` | Expired | `mute` | *No first order within [window]* |
| `not_eligible` **(absorbs `void`)** | Not eligible | `mute` | *First order was under [minOrder] ex GST* |

A referral voided by staff shows as **Not eligible** with the generic line. The ops void reason is an
internal operational record and is not shown to the customer.

Columns: **Who** (`displayName` — business name, else masked email `j••••@outlook.com`), **Signed up**
(`fmtDate`, `t-data-sm`), **Status** (`StatusPill`). Footer under a hairline, `t-cap`:
> You see the business name and how far along they are, and nothing else — never their prices, their
> address or what's on their job.

**Never a dollar figure against a person in this list** (legal research §5.4). Below 768px each row becomes
a stacked card: name + pill on one line, "Signed up [date]" beneath.

### 5.4 "How you get paid" panel

`.card` + `.panel-head`. Two columns at ≥640px:
- **Bank account** — `t-data` `BSB 063-••• · ••••4417` (masked, always — AC-29), `t-bd-sm` account name.
- **ABN** — `t-data` formatted `51 824 753 556`, **and nothing else**.

> **"Checks out" is deleted.** A valid ABN gets no comment. A green tick beside someone's ABN reads like we
> ran a background check on them; it's a checksum. The field speaks **only** when something is wrong:
> `We can't read that as a valid ABN` in `--destructive`, which is reachable only via Edit details.

Under a hairline, `t-bd-sm`:
> We pay by bank transfer within **[payoutDays]** of your mate's order being paid in full. Amounts include
> any GST payable; your own tax is between you and your accountant — we don't give tax advice.
> [How the program works →]

Actions: `Btn outline sm` **Edit details** · `Btn ghost sm` **Leave the program**.

### 5.5 Leaving, and the one refusal

**Because membership *is* having payout details, removing them is leaving.** The control says so. This
collapses what was a separate "dormant code" state into an ordinary action with an ordinary confirmation —
one concept instead of two.

**Leave** opens a confirmation in place (never a modal), `--info` tone:
> **Leave the referral program?**
> We'll remove your bank details and your code stops working for new referrals. The mates you've already
> referred keep their discount, and everything you've already been paid stays in your history. You can
> rejoin any time and you'll get the same code back.
> `Btn outline sm` **Leave the program** · `Btn ghost sm` **Cancel**

Two promises survive leaving and the copy names both. **Rejoining runs the full join flow again** — terms
re-accepted at the current version, details re-entered — and reissues **the same code** (ADR-8a's "stable
thereafter" is preserved).

**The refusal**, when `payout.clearBlocked != null` — a `--warning` notice in the same place:
> **We can't do that just yet.**
> **[amount]** is confirmed and hasn't gone out. We need this account to send it — it's due **[date]**. You
> can leave once it's paid, and you can change your bank details in the meantime if they're wrong.

The last clause matters: someone leaving *because their details are wrong* is the person most likely to hit
this, and without it the refusal is a dead end for exactly them. The Leave control is **not** disabled — a
disabled button explains nothing.

**State D — left, with history.** `--info` notice with a 3px `--info` left border:
> **You've left the program.**
> Your code doesn't record new referrals and we're not holding your bank details. Everything you were paid
> is below. Rejoin and you'll get **[code]** back.
> `Btn sage sm` **Rejoin the program**

Payment history renders read-only. No code card, no share, no earnings strip.

**State E — program off, with history.** `--tone-mute`-bordered info notice:
> **This program has ended.**
> We're no longer taking new referrals. Anything you'd already earned is below and will still be paid, on
> the timetable you were given.

Earnings, list and payments read-only. No code card, no share, no join invitation.

### 5.6 "Were you referred?" — manual code entry

Renders whenever `canEnterCode === true`, in **every** state including State A, at the bottom of the
section. Never gated by membership.

> `t-hd3` **Were you referred?**
> `t-bd-sm` If a tradie gave you a code, put it in before your first order and **[discount]** comes off it.

One `Input` (`mono`, `maxLength={7}`, uppercased on input, `letter-spacing: .14em`,
`placeholder="ABC-123"`) + `Btn outline md` **Apply code**. Enter submits.

**Success** — the field is replaced by a sage notice:
> **Done — [discount] is off your first order.**
> It's already in every price you see, and it's yours until **[expiry]**. It's up the top of this page
> whenever you want to check it.

No link: the discount card is now on this same page, so the confirmation points at it and stops. The
"don't tell the story twice" rule gets easier rather than harder.

> **The disclosure line to the referred tradie is dropped**, per the owner. The program is openly
> advertised as paying a percentage and the tradie deliberately entered a code to get their discount, so
> the reasonable-expectation ground is already made out. See §13 for the one thing this costs.

**Errors** — `t-cap` in `--destructive` under the field, `.field.err` on the input:

| Cause | Copy |
|---|---|
| unknown code, **or** a code whose owner has left the program | That code isn't valid. Check it with the tradie who gave it to you. |
| own code | That's your own code. |
| already has a referral | Your account already has a referral — it's one per account. |
| first order exists | A code can only be added before your first order. |
| same ABN as the referrer | That code isn't valid. Check it with the tradie who gave it to you. |

Two situations share the first message deliberately: naming a departed referrer's account state would
disclose a third party's affairs.

---

## 6. The discount card

**Home: the Referrals section**, under an `h2` **Your discount**, above **Refer a mate**.

> **This moved in revision 2**, from the Account page beside the Price display preference. AC-69 and
> §8.6.1 both need amending — see §14.

Source: `GET /api/account/referral-offer`. `offer === null` ⇒ **the block and its heading render nothing at
all** — no placeholder, no greyed card, no "you don't have a referral discount".

All four states are a `.card` with a 3px left border.

**Available** (`available`, > 30 days remaining) — sage border:
> `t-hd1` **[discount] off your first order**
> `t-bd` It's already in every price you see — there's nothing to apply. This is a one-off from
> **[referrer]**, and it's yours until **[expiry]**.
> chips: `[n] months left` (`--ready`) · `First order only` · `One per account`
> `Btn sage md` **Finish your quote →** (or **Start a quote →** when no draft exists)

**Expiring** (`available`, ≤ 30 days) — `--tone-attn` border:
> `t-hd1` **[discount] off your first order — [n] days left**
> `t-bd` It runs out on **[expiry]**, and it's a one-off. It's already in every price you see; place your
> first order before then and it's yours.
> chips: `Expires [expiry]` (warning) · `First order only`
> `Btn sage md` **Finish your quote →**

The 30-day boundary is the same trigger as the reminder email, so the screen and the inbox agree. The
remaining-time chip reads in months above 60 days and in days below.

**Used** (`used`) — `--tone-mute-bd` border:
> `t-hd2` **Your [discount] referral discount was applied to order [usedOrderNo]**
> `t-bd` On **[usedAt]**. That was the one-off — nice work.
> link `See that order →`

**Expired** (`expired`) — `--tone-mute-bd` border:
> `t-hd2` **Your [discount] referral discount expired on [expiredAt]**
> `t-bd` It applied to a first order placed within **[window]** of signing up with [referrer]'s code. Your
> prices are unchanged from here.

No apology, no "sorry you missed out", no offer to reinstate.

**Prohibited vocabulary in and near this card:** apply · redeem · claim · use at checkout · voucher ·
coupon · credit · balance · wallet · stored · load · activate. Also: any second percentage, any combined
figure, any reference to the standing account discount, any dollar saving. (AC-70, AC-75.)

**GST.** Nothing here moves with `price_gst_mode`, because a percentage is unit-free. **That is arithmetic,
not an exemption** — do not implement it as a carve-out and do not copy the payout-side exemption here.

---

## 7. The quote money panel

`QuoteTotals` gains one optional prop:

```ts
referral?: { percent: number; referrerName: string }
```

When present, one row renders **above** the existing figures, inside the sage band, separated by a hairline:

> left `Referral discount — [percent]% off, thanks to [referrerName]` — `t-cap`, `--sage-ink`
> right `Already in the prices above` — `t-cap`, `--sage-ink`, medium

Below 640px the halves stack, left-aligned. It sits above the figures because it is a statement *about* the
prices, not one of them.

The prop is absent at the first pricing event after the discount is used or expires (AC-57). An issued
quote renders it from the issue-time stamp and never re-prices (AC-54). Everything else in `QuoteTotals` is
unchanged, in both GST modes, for every non-referred account.

---

## 8. The ops console

New tab `Referrals` in `ALL_TABS`, between Pricing and Files. Three sub-screens on the `Pricing.tsx`
sub-tab pattern.

**Minimum viable, deliberately.** Existing components only, no bespoke anything, no polish. These screens
will be re-skinned by the console redesign; effort on appearance now is thrown away.

**Rule 7 applies throughout: every mutating action is on the row it affects.** No batch bars, no selection
checkboxes. Search, filter pills and CSV export stay at the top — they change nothing.

### 8.1 Program

- **Health banner:** `Program on · version [n], saved [date] by [name]`, right side `[n] payouts ready —
  [amount] →`. Sage when on, warning when off.
- **The restatement card**, recomputed live from unsaved field values so a mistyped 10% is visible before
  saving:
  > A referred tradie gets **[discount]** off their first order. When that order is at least **[minOrder]**
  > ex GST (goods, after discount, excluding delivery) and paid in full, the referrer earns **[rate]** of
  > it, paid within **[payoutDays]**. A referral lapses if there's no first order within **[window]**.
  > [No cap. | Capped at [cap] per referral.]
- **Settings table** — the `Pricing.tsx` inline-edit table. Rows: Program (On/Off) · Referrer reward
  (On/Off) · Referred discount (On/Off) · commission rate · referred discount · qualifying minimum · cap
  (blank = no cap) · attribution window · payment timeframe.
- **Standing note:** *"Changes apply to referrals recorded from now on. Referrals already recorded keep the
  rate, discount, minimum, window and timeframe they were given."*
- **Commit bar:** `Discard changes` (ghost) · `Review change →` (sage) → the before/after modal.
- **Switching off** — confirm in place, `--destructive`. **A program-level action on the program screen;
  its target is unambiguous and it is not caught by rule 7.**
  > **Switch the referral program off?**
  > New referrals stop being recorded and every placement disappears. **Nothing already promised is
  > withdrawn:** pending earnings still confirm when their order is paid, confirmed earnings are still paid
  > within their stated timeframe, and every discount already given runs to the date it was given. To stop
  > one of those, void that referral on its own row in the Referrals list.
  > Type TERMINATE to confirm · [field] · `Switch off` / `Cancel`

  Switching back on uses the same shape with `REACTIVATE`: *"Switching it back on attributes nothing
  retroactively. Referrals that lapsed while it was off stay lapsed."*
- **Stale save (409):** `--warning` notice — *"Someone else saved first. These settings were changed by
  [name] at [time], so your version ([n]) is no longer current. Reload to see theirs, then make your change
  again — nothing of yours was saved."* + `Reload settings`.

**Deleted from this screen:** the minimum-payout-balance field, its held-money warning, and its
acknowledgement checkbox. See §14.

### 8.2 Referrals list

- **Filter pills** with counts (All · Recorded · Ordered · Earned · Paid · Expired · Void) and a **search
  field** (`code, referrer or referred email…`) at the top. Both non-mutating.
- **Table** (`min-w-[1020px]`, `overflow-x-auto`): Referrer · Referred · Code · Recorded · Status ·
  Earning (right) · **Order** · actions. Referrer and Referred carry the email as a `t-cap` second line.
  Status is a chip with a `t-cap` reason beneath where one exists.
- **Order** is a link to the referred order's ops record (`OF-1088 →`), or `—`.
- **Per-row `Void`** (or `Un-void`), expanding a confirmation in place beneath the row, sage tone,
  mandatory reason:
  > **Void this referral?** The earning of [amount] leaves the payable queue. Any not-yet-issued quote can
  > then be re-priced without the discount. An issued quote keeps its price.
  > Reason — staff read this later to understand why money didn't go out · [field] · `Void referral`

  `Void referral` stays disabled until the reason is non-empty.
- Footer note: *"Click a row to see both accounts side by side, including any matching ABN, phone, business
  name or delivery postcode. There is no action here that creates a referral."*
- **Empty:** the standard ops dashed box — *"No referrals in this view."*

**Two things dropped, stated plainly rather than lost quietly:**

- **The Flags column is gone**, replaced by the Order link. The shared-ABN / phone / business-name /
  postcode signals still exist and still appear **on the ops project record, before a reviewer issues the
  quote** — which is where AC-58 actually put them and the only place they can change an outcome. They also
  appear on the referral's own row detail. What's gone is the column, which showed a reviewer a flag at a
  moment when there was nothing to do about it. **AC-58 is unaffected.**
- **Bulk void is gone.** Stopping referrals already recorded is done **one row at a time, each with its own
  reason** — better evidence than one reason applied to forty relationships. At realistic volumes (38
  referrals lifetime in the mock's data) switching the program off and then voiding the handful still in
  flight is a few minutes' work. **AC-67's guarantee is unchanged** — a status change still never withdraws
  a promise; only its mechanism changes from "an explicitly confirmed bulk void" to "an explicitly
  confirmed per-referral void". See §14.
  - *The one scenario that would argue for batch:* a single referrer found to have farmed dozens of fake
    accounts — one referrer, many referrals. Filtering the list by that referrer and voiding row by row
    handles a dozen; beyond that it is worth deciding against a real case rather than pre-building.

### 8.3 Payouts

Top strip, `.card` with a 2px sage left border:
> `t-hd2` **[n] referrers** `t-hd2` **[total]** · `t-cap` to pay · [n] past its promised date
> right: `Export CSV` (non-mutating, stays at the top)

The "past its promised date" clause renders only when at least one group has `overPromise`.

**To pay** — `.card` + `.panel-head` ("To pay" / "one row per referrer — one transfer each"). Columns:
Referrer (with `n earnings` sub-line) · ABN · BSB · Account · Account name · Amount (right) · **Waiting** ·
action. All bank figures in `font-data`.

- **Waiting** replaced "Oldest confirmed". Same underlying date; the name now says what it is for — how
  long this person has waited against the [payoutDays] we promised. Over-promise rows sort to the top, take
  a faint warning background, and carry a `Past the [payoutDays] promise` chip.
- **Per-row `Record payment`**, expanding in place:
  > **Record a [amount] payment to [referrer]**
  > Do this **after** you've made the transfer. It marks the earning paid, freezes the bank details onto the
  > record, and emails the referrer.
  > Bank reference from the transfer you made · [field] · `Record payment` / `Cancel`

  Disabled until the reference is non-empty. Six transfers means six rows, each recorded with the reference
  its own transfer got — more accurate than one reference standing for six, and there is no way to act on
  the wrong set.

**Payments made** — `.panel-head` with a date-range control and `Export CSV`. Columns: Paid · Referrer ·
Reference · Account paid · Amount (right) · By · Status · action. Footer note:
> Bank details are frozen onto each payment as it goes out, so this stays correct after a referrer changes
> theirs or leaves. This is the accountant's record.

- **Per-row reversal — one action, both causes.** Label **`Didn't go through`**. Expanding in place,
  `--warning` tone, **reason required**:
  > **This payment didn't go through?**
  > Its [n] earnings go back into the payable queue. The payment stays in history with the reference you
  > recorded, so the bank record and this one still agree.
  > What happened? — e.g. "bounced, account closed" or "recorded against the wrong referrer" · [field] ·
  > `Reverse this payment` / `Cancel`

  Reversed rows show a `Reversed` chip with the reason as a `t-cap` sub-line.

  **Why one action and not two.** "Mark failed" only covered a bounce, and a bounce only happens when the
  account details are *invalid* — money sent to a valid but wrong account never comes back. The likelier
  error is a staff member recording the wrong row or the wrong amount, and nobody fixing that goes hunting
  for a button called *failed*. One concept covers both; the required reason distinguishes them afterwards,
  which is all anyone needs.

**Deleted:** the Accruing group, `Pay anyway`, the eleven-month force-promotion, and the batch `Mark paid…`
control. See §14.

**Empty:** top strip reads `Nothing ready`; dashed box reads *"No referral payouts are waiting. Earnings
appear here once the referred order is paid in full."*

### 8.4 Ops dashboard row

One row in "Needs us", only when `referralPayoutsReady.count > 0`:
> `[n]` · **referral payouts to make — [amount][, one [n] days old]** · `Open →`

The age clause appears only when something is over promise. Zero count renders nothing.

### 8.5 Ops project record

Gains, in the pricing block: `Referral discount applied — [percent]% (referrer: [name])`, plus the review
flag chips (shared ABN / phone / business name / postcode), above the price. **This is where AC-58 lives**
and it is unchanged by the list's Flags column being dropped. Ops-only; none of it is serialised to a
customer response.

---

## 9. Accessibility

- **Focus:** the site's `focus-visible:ring-2 ring-sage ring-offset-2` throughout. The new rail item is in
  DOM order with `aria-current="page"` when active.
- **Status is never colour alone** — every pill and chip carries icon and word.
- **The code** is selectable text with `aria-label="Your referral code, K R A dash 7 F 2"` so it is read
  out as characters, not as a word.
- **Copy actions** announce through a visually-hidden `aria-live="polite"` region.
- **The join flow** is one `<form>` per part with a real `<fieldset>`/`<legend>`; the terms checkbox is a
  native `<input type="checkbox">` with a `<label>` wrapping its text and the link inside the label but
  focusable separately. `Continue` and `Join the program` are `type="submit"`, disabled rather than hidden
  so their state is announced. Moving between parts moves focus to the new part's heading (`tabindex="-1"`).
- **Form fields** use `id`/`htmlFor` (`FieldLabel` is a sibling, not a wrapper) with `aria-describedby`
  → the error line and `aria-invalid` on failure.
- **Tables** in ops use real `<th scope="col">`. The account referrals list is a list of non-interactive
  row groups, not a table.
- **Contrast:** `--tone-attn`/`--tone-attn-bg`, `--tone-pos`/`--tone-pos-bg`, `--sage-ink`/`--sage-wash`
  are the existing verified pairs; use no others. `--quietest` only for the example code and "nothing here"
  placeholders.
- **Touch targets** ≥44px on phone (`Btn md` = 12px padding + 21px line-height = 45px).
- **Reduced motion:** no motion in any of these screens beyond the existing `.disclose` transition, which
  already honours the preference.

---

## 10. Responsive behaviour

| Surface | ≥1024 | 768–1023 | <768 |
|---|---|---|---|
| `/refer` hero | `t-ds2` 40px | 30px | 26px, button full-width |
| How it works | 3 cards, hairlines collapsed | 3 cards | stacked, hairlines collapsed vertically |
| Conditions panel | 2-column grid, 6 cells | 2 columns | 1 column, hairline rows |
| Conditions heading row | h2 left, framing line right | stacked | stacked, framing line hidden |
| Good to know | 3 cards | 3 cards | stacked; FAQ button full-width |
| Join flow | split 1.1fr/.9fr | stacked (right pane below) | stacked, button full width |
| Payout fields | 2-column grid | 1 column | 1 column |
| Earnings strip | 3 cells in a row | 3 cells | stacked cells |
| Referrals list | 3-column row | 3-column row | stacked card per row |
| Discount card | copy left, CTA right | stacked | stacked, CTA full width |
| Quote referral row | two halves | two halves | stacked, left-aligned |
| Ops tables | table | table + `overflow-x-auto` | card-per-row (`Projects.tsx` `lg:hidden` pattern) |

The account rail folds into the site drawer below 1024 as today; Referrals joins the drawer's account group.

---

## 11. Things this design deliberately did not build

- Any invite, contact-import or send-on-their-behalf affordance.
- A referral detail page in the account area — rows are not clickable.
- A "you saved $X" figure on the discount card or the quote.
- Any viewer for the bank-detail access log.
- A half-joined membership state, or any screen explaining one.
- Progress indicators, streaks, badges, leaderboards or a referral "level".
- Any batch or bulk mutation, in ops or the account area.
- **Any new card variant, anywhere.** Two tracks and two paddings, all pre-existing — §2.1.
- A third card track. If a layout needs one, that is a design-system change to raise, not an artifact
  improvisation.

---

## 12. Open questions for the mock gate

| # | Question | Recommendation |
|---|---|---|
| Q1 | **The GST sentence** — "Amounts include any GST payable." | Keep as a slot, route to the accountant, do not launch without review. |
| Q2 | **The account rail badge** shows confirmed money as a dollar figure (`$124`). | Approve. A count badge would say "1", which is not the fact the referrer cares about. |
| Q3 | **The example code in the join flow reads `ABC-123`.** | Confirm the real format is `XXX-NNN` from the unambiguous alphabet (no O/0/I/1) so the example is honest. |
| Q4 | **Rejoining reissues the same code.** | Approve — a code that has been read out over the phone should keep working if the person comes back. |
| Q5 | **Per-row `Record payment` costs six clicks a week** instead of one batch action. | Approve. Each transfer carries its own bank reference, which is more accurate, and there is no way to act on the wrong set. |

---

## 13. What the revision cost, stated plainly

- **A referrer who wants to check their percentage must leave the account area.** That is the price of
  taking the rate off the earnings screen (rule 6). It is one click via *How the program works →*, present
  on both the code card and the how-you-get-paid panel.
- **We can no longer count people who started joining and stopped.** Nothing is recorded until the single
  commit, so a partial joiner is indistinguishable from someone who never looked. If that number is wanted
  later it has to be front-end analytics, not a database state.
- **The referred tradie is no longer told, in the product, that their referrer earns a percentage of their
  order.** The owner's reasoning is sound — the program is openly advertised and the tradie deliberately
  entered a code — and dropping it removes a sentence that made the transaction feel transactional. The
  residual: a tradie who was given a code verbally, never visited `/refer`, and never read the terms will
  first learn of it from their mate. The terms must therefore carry it clearly (§11 item 7 of the spec).
  - I have **not** added the suggested referrer-side reassurance ("your mate is told you get paid…"),
    because with the disclosure removed it would not be true. If the owner wants that reassurance, the only
    honest way to earn it is to put the line back on the referred tradie's side.
- **The landing page states each condition once.** Thirteen cards down to six means a reader who skips the
  conditions section has no second chance at the minimum order or the window. That is the correct trade —
  repetition was costing comprehension of the whole page — but it puts weight on that one panel, which is
  why it may be made denser and may not be moved, hidden or collapsed.
- **The FAQ long tail now lives outside the repo.** Six answers move into a Sanity post, which is the point
  — but it means they are no longer reviewed by the same pipeline as the rest of this copy, and they are
  the one place a hand-typed "2.5%" could strand. §3.9 states the constraint; someone has to enforce it at
  authoring time.
- **A referred tradie still cannot verify their discount.** No published list price means "2.5% off" has
  nothing visible to be off. That is what makes showing the increment alone safe, and it means the claim
  rests on trust. A tradie who priced a job anonymously before signing up will see the price move by more
  than 2.5%, because the standing account discount arrives at the same moment.

---

## 14. Spec and design amendments this revision requires

**Route this section to the product-manager and the architect before implementation.** Every item below is
a document that now describes something different from what will be built.

### Deleted outright

| Item | Where | Note |
|---|---|---|
| `min_payout_balance` / `minPayoutBalance` | spec M7, AC-61, AC-81; design §3 schema, §9, §10.2 `heldUnderThreshold`, §10.3 `acknowledgeHold`, §12 | Ships at 0/off, and under the payability rule everyone in the program is payable — it guarded a state that cannot occur |
| `PAYOUT_LONG_STOP_MONTHS`, force-promotion, the Accruing group, `Pay anyway`, `forcedByLongStop` | design ADR-8e, §9, §10.3, §11, §13.7 scenario 6 | Existed only to stop threshold-held money ageing |
| The ops acknowledgement checkbox | design §10.3 `body.acknowledgeHold === true` | And with it the pattern — no acknowledgement checkboxes anywhere |
| Program status `paused` | spec §4.7, AC-62; design §7.5, §6.1, §6.3 `program_paused` error code | Verified not load-bearing: design §7.5 already keeps `status` out of the discount and earning predicates. Three states collapse to on/off; `terminated`'s semantics are what "off" means |
| The Flags **column** on the ops referrals list | spec §8.4(b) | The signals survive on the ops project record (AC-58, unaffected) and the row detail |
| Bulk void | spec §8.4(b), AC-67; design §10.3 `bulk-void` | Replaced by per-row void with a reason |
| The batch `Mark paid` control | spec §8.4(c); design §10.3 `mark-paid {userIds}` | Becomes per-referrer-row `Record payment` with its own reference |
| The disclosure line to the referred tradie | this document, rev 1 §5.6 | Owner decision |
| The six-card conditions grid on `/refer` | spec §8.1 ("what qualifies") | Survives as **its own section** with one bordered 2-column panel — same six facts, one object instead of six tiles |

### Changed

| Item | From | To |
|---|---|---|
| **ADR-8 / the payability gate** | `payoutComplete(user)` alone gates code issuance | Membership = terms accepted **and** payout details stored, committed together. `payoutComplete` remains the predicate but is no longer reached without an acceptance in the same transaction. **New storage needed: `referral_joined_at` and the accepted terms version** — architect's call on shape |
| **AC-1** | code on first demand once details stored | code issued at the moment of joining; stable thereafter; **reissued unchanged on rejoin** |
| **AC-28 / ADR-8c** | clearing details ⇒ dormant code, future earnings hold at `pending` | clearing details ⇒ **leaving the program**. The `heldPendingDetails` residue still exists for money pending at the moment of leaving and is still explained, never silent |
| **AC-67** | "only through an explicitly confirmed bulk void" | "only through explicitly confirmed **per-referral** voids, each with a reason". The invariant that matters — a status change never withdraws a promise — is untouched |
| **AC-69 / §8.6.1** | the offer panel lives on the Account page beside Price display | it lives in the **Referrals section** under an `h2` "Your discount". §8.6.1's third argument ("it survives the program") is replaced by the section-visibility rule in §5: the section is present whenever the account has a code, history **or** an offer |
| **AC-63 / AC-64 / AC-68** | reference `terminated` | reference the off state |
| **§8.3 item 1 / AC-25** | the code card carries "the one-sentence rule with live figures" | the same sentence **without the rate**, plus `How the program works →`. AC-32 is unaffected (it constrains figures that *do* appear) |
| **AC-80** | timeframe stated on the landing page, placements, Referrals section, email | unchanged — the **timeframe** stays everywhere; only the **rate** leaves the account area |
| **Referral status vocabulary** | `signed_up`\|`quoting`\|`ordered`\|`paid_in_full`\|`not_eligible` | `signed_up`\|`ordered`\|`paid_in_full`\|`expired`\|`not_eligible`; `quoting` absorbed into `signed_up`, `void` presented as `not_eligible` |
| **Ops payouts response** | `{ ready, accruing, readyTotal }` | `{ ready, readyTotal }`. `overPromise` and `daysWaiting` **stay** — they earn their place on ACL s 32(2) grounds alone |
| **Mark failed** | `POST /payouts/:id/failed` | one reversal action with a **required reason**, covering both a bounce and a mis-recorded payment |

### Added

| Item | Where | Note |
|---|---|---|
| **A `Referral program — FAQ` Sanity `post`**, rendered at `/resources/<slug>` and listed on `/resources` | new; §3.9 | Sits beside the T&Cs and plain-English rules, which spec §4.5 already puts there. Carries the long tail so the landing page stays short, and is editable without a deploy. **Subject to the same no-typed-figures rule as the terms** (spec §11) — it references the program page for every number |

### New criteria worth adding

- Joining requires an explicit acceptance; the acceptance timestamp and terms version are recorded, and
  membership, payout details and code issuance commit in the same transaction.
- Abandoning the join flow at any point leaves **no** referral-program record of any kind on the account.
- No customer-facing surface in the account area renders the commission rate.
- No ops screen presents a mutating control outside the row it affects.

---

## 15. Acceptance criteria this document answers for

AC-25 (share, no recipient field) §3.4, §5.2 · AC-26 (masked name only) §5.3 · AC-27, AC-31 (earnings,
GST-inert) §5.2 · AC-29 (masked read-back) §5.4 · AC-30 (payment history) §5.2 · AC-32, AC-76 (figures from
config) §1 · AC-34 (logged-out vs logged-in) §3.3–3.4 · AC-35 (no cap clause) §1, §3.6 · AC-36, AC-37
(placements) §4 · AC-58 (review flags before issue) §8.5 · AC-64 (program off) §5.2 · AC-69 (panel home)
§6, §14 · AC-70 (no redemption language) §6 · AC-71 (three derived states) §6 · AC-73, AC-74 (server-sourced,
GST) §6 · AC-75 (never a total) §0, §6 · AC-78 (no contact fields) §0, §11 · AC-79 (no purchase coupling)
§0, §3.2, §3.3, §4 · AC-80 (timeframe stated) §3.2, §5.2, §5.4.
