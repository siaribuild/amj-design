# Referral program — revision 14: the amendment register

Amends: `docs/specs/referral-program.md` (revision 13).
Author: product-manager · Date: 2026-08-17 · Branch: `feat/referral-program`
Grill input: none for this revision — these amendments come from the tester's FAIL report, the
architect's as-built register (`docs/design/referral-program.md` §18) and owner decisions taken at two
rounds of the decision gate (2026-08-17).

> **This register governs wherever it and revision 13 disagree.**

**This is not an acceptance verdict.** The verdict comes after the tester re-runs from scratch; its
current report predates four commits.

**Contents.** §0 how to merge this · §1 changelog · §2 amended criteria · §3 struck criteria · §4 new
spec section: the open tails · §5 rulings on the not-built register · §6 amended prose, for the merge ·
§7 what still blocks acceptance · §8 documents that are now wrong · §9 decisions needed.

---

## 0. How to merge this — and why it is a separate file

This session had no in-place edit tool, only whole-file write. `referral-program.md` is 1,383 lines of
settled prose carrying a "six things that must survive to implementation" list; reproducing it wholesale
to insert amendments is a larger risk than leaving it addressed by a governing register — an LLM
reproducing 1,383 lines verbatim drops paragraphs, and the paragraphs most worth keeping are the ones
whose absence is hardest to notice. **I stand by that call and am handing the merge to the coordinator's
in-place editor**, as offered.

**The trip hazard is real and must close in the same pass.** Every item below names its target section.
Merge order:

1. **Replace the spec's status block** (lines 3–7) with:

   > Branch: `feat/referral-program`
   > Status: **revision 14 — the as-built amendments. The `/r/<CODE>` cookie rule is deleted rather than
   > narrowed (AC-4); the offer panel's home is `/referrals` (AC-69); the quote-panel badge, AC-46, AC-57
   > and the three unbuilt emails are descoped with reasons; §4.10 records the open tails handed to the
   > account-creation feature. Everything is settled.**
   > Author: product-manager
   > Date: 2026-08-17

2. Add the revision-14 paragraph to the revision history (§1 of this register supplies the wording).
3. Apply §2 (amended criteria), §3 (struck criteria), §6 (amended prose) in place.
4. Insert §4 as spec §4.10 and §5 as spec §15.
5. Add the two T&Cs-review questions at §9 to the spec's §11 list, as items 14 and 15.
6. **Delete this file** once merged. A register that outlives its merge becomes a second source of truth,
   which is the house rule this whole document exists to serve.

---

## 1. Changelog — what moved, and why

| # | What | Why |
|---|---|---|
| 1 | **AC-4 loses a rule.** `/r/<CODE>` sets the attribution cookie for **any code that exists**, not only for a currently-payable referrer while the program is On. | Owner decision. Refusing a dormant code makes the response a side channel: a stranger holding a real code could watch `Set-Cookie` disappear and learn its owner had cleared their bank details or left the program. No money moves wrongly — `recordReferral` re-runs every gate at signup, the only moment the answer matters. Asking the payability question twice was the over-complication. **The amendment deletes a rule rather than adding one.** |
| 2 | **AC-84, AC-98, AC-62(a) and §4.9.2 follow it.** | Each restated the old rule from a different angle. Left alone they would contradict AC-4. |
| 3 | **AC-69 moves the offer panel** from the Account page beside the price-display preference to `/referrals` under an `h2` **"Your discount"**. | Approved by the user at the UX mock gate; `referral-program-ux.md` §6 and §14 recorded the move and said AC-69 and the §8.6 rationale needed amending. Nobody amended them. The content itself was verified correct. |
| 4 | **AC-49d is narrowed to price assertions**, and one accepted exception is recorded. | `scripts/tests/estimator-rules.test.mjs` was edited — a query-count guard, not a price expectation. The criterion exists to stop someone quietly loosening a *price*; that is not what happened. |
| 5 | **AC-106 and A19 gain the `has_order` gate**, and the owner's LEAVE AS-IS ruling on it is recorded. | Since revision 12 `source:'manual'` means the Ops link exclusively, so the gate reaches only that path. It was built and never written down; recorded now so it is not later read as an accident. |
| 6 | **AC-67 changes mechanism** from a confirmed bulk void to confirmed per-referral voids. | Deleted at the mock gate and replaced with per-row void carrying its own mandatory reason (UX §8.2). The invariant survives; only the mechanism changed. |
| 7 | **AC-88 drops guard 1.** | Design §18.1 A9: the acknowledgement flag was belt-and-braces on a staff-only endpoint whose only client already renders the warning at the point of decision. Guard 2, the 11-month long-stop, is built and tested. |
| 8 | **The quote-panel badge is struck as a set** — AC-57, AC-51's display half, §8.5's draft-side requirement, and §1's "sees the discount while they are quoting" success outcome (§3). | **Owner decision, and a product judgement rather than a cost one.** In his words: *"they know they are getting one - the reason for sign up. And windows is not in a category of 'I'll buy a few extra because it is cheaper' products anyway - you buy all you need for the project."* The incentive does its work at signup; the product has no volume response to a visible discount. |
| 9 | **AC-46 descoped to the ops console redesign**, not marked outstanding (§5 #2). | Owner: *"will be part of ops upgrade."* The residual is named so the redesign inherits it. |
| 10 | **AC-77 and the two remaining emails descoped** (§3). | Owner. The condition attaching to AC-77 becomes a **T&Cs copy constraint** (§9). |
| 11 | **The terms-acceptance record is not built**, and my §7 framing of it is corrected (§3). | Owner asked what the value was; there is no statutory recording requirement. The **terms version** question goes to the T&Cs reviewer, not to the build. |
| 12 | **AC-110 is new and stands** — expiry must not leave a stale discounted draft (§2). | The only finding of mine the owner did not descope; already with the developer. |
| 13 | **New spec section §4.10 — the open tails handed to the next feature.** | The owner's ground rule (*accounts are for tradies only*) and four consequences, accepted as open rather than absorbed into scope. |
| 14 | **New spec section §15 — rulings on the design's not-built register.** | Design §18.4 named seven items and asked me to rule. Ruled at §5. |

Nothing else in revision 13 moves. In particular the six things listed as "must survive to
implementation" (AC-49, AC-75, AC-78, AC-87, AC-108, §10A) are untouched by this revision.

---

## 2. Amended acceptance criteria, in full

Each replaces the criterion of the same number in §10 / §10A of revision 13.

### AC-4 — `/r/<CODE>` redirects identically, and carries the code onward

- **Given** any code in the `/r/<CODE>` shape, **when** it is fetched by GET or HEAD in **any** program
  status, **then** the response is **302 to `/refer`** with `X-Robots-Tag: noindex`, and never an error.
- **Given** a code that exists on a `user` row, **when** `/r/<CODE>` is fetched, **then** `of_ref` is set
  — httpOnly, `SameSite=Lax`, `Path=/`, 90 days, `Secure` in production — **regardless of whether that
  referrer is currently payable and regardless of whether the program is On**.
- **Given** a code that exists on no `user` row, **when** `/r/<CODE>` is fetched, **then** no cookie is
  set and the response is otherwise identical.
- **Given** the cookie is present when an account is created, **when** creation happens, **then**
  `recordReferral` re-runs **every** gate — code known, referrer payable, referrer not staff, not
  self-referral, not the same ABN, program On — and a referral exists only if all of them pass.

> **Why the route asks nothing.** The route's only job is to carry a code to the moment attribution
> happens. Consulting payability here answers the question twice and, worse, answers it *out loud*: the
> presence or absence of `Set-Cookie` would tell anyone holding a real code whether its owner still had
> bank details on file. The gates live at `recordReferral` and nowhere else (`worker/index.ts:168-190`,
> `worker/lib/referrals.ts:168-253`).

### AC-84 — a dormant code is inert where inertness is worth having

- **Given** a referrer who has left the program (payout details cleared) whose code still exists,
  **when** a stranger fetches `/r/<CODE>`, **then** the response is **identical to the live-code case,
  `Set-Cookie` included** — deliberately, so the response cannot be used to observe someone's banking.
- **Given** that cookie present at the first sign-in of a brand-new email, **when** the account is
  created, **then** **no `referral` row is written**, and the cookie is cleared either way.
- **Given** the same code, **when** Ops attempts the link action, **then** it is refused with the
  **generic invalid-code reason** and no row is written.
- **Given** the referrer re-adds their payout details before the referred account is created, **when**
  the account is created, **then** the referral **is** recorded — the answer is taken at the moment it
  matters, not at click time.

### AC-98 — `/r/<CODE>` reveals nothing about a code's *owner*

- **Given** four codes — a live payable one belonging to someone else, a **dormant** one, a
  **staff-owned** one (staff hold no code, so this is the not-found case), and one that never existed —
  **when** each is fetched unauthenticated, **then** the live and dormant responses are **identical to
  each other, `Set-Cookie` included**, and the staff-owned and never-existed responses are **identical to
  each other with no `Set-Cookie`**.
- **Given** any of them, **when** the response is inspected, **then** nothing in status, headers or body
  states or implies **who owns a code, whether its owner can be paid, or whether the program is On**.

> **Accepted, and recorded rather than discovered:** the presence of `Set-Cookie` discloses that a code
> **exists**. It discloses nothing about its owner or its usability. Guessing a live code is worth
> nothing on its own — the guesser must then create a new account and place and pay for a real order at
> or above `min_order_amount` to a real address, which is §4.6.6's containment argument unchanged, and
> the code space (32⁶) makes discovery by guessing impractical over HTTP.

### AC-62(a) — Off, and the click that survives it

- **Given** the program is **Off**, **when** `/r/<CODE>` is fetched with a known code, **then** the cookie
  **is** set.
- **Given** that cookie, **when** an account is created **while the program is still Off**, **then** **no
  referral is recorded** — the refusal is `program_off` at `recordReferral`.
- **Given** the program is switched back **On** before that account is created, **when** it is created,
  **then** the referral **is** recorded. This is **not** retroactive attribution and does not conflict
  with AC-68: the account came into being while the program was On, and Off means *come back later*, so a
  mate who comes back later counts.
- AC-62(b) and (c) are unchanged: the join journey stops after login, the banner appears, and nothing
  else about `/refer` differs.

### AC-67 — stopping an in-flight promise is a deliberate, reasoned, per-referral act

- **Given** referrals recorded and in flight, **when** the program is switched Off, **then** none is
  voided, no earning changes status, and no discount ends early (AC-65, AC-66 unchanged).
- **Given** staff want to stop one, **when** they void it, **then** a reason is **mandatory**, the
  confirmation states in plain words what leaves the payable queue and what happens to quotes, and the
  action applies **to that referral only**.
- **Given** forty referrals in flight, **when** staff want to stop all forty, **then** they perform forty
  confirmed voids. **There is no bulk action, and its absence is deliberate** — forty reasons are better
  evidence than one reason standing for forty relationships, and the approved design says so (UX §8.2).
- **Revisit trigger, recorded so it is a decision and not a discovery:** if a single void session ever
  exceeds ~20 rows, or one referrer is found to have farmed accounts, build the batch action then,
  against the real case.

### AC-69 — the offer panel lives in the Referrals section

- **Given** a signed-in account with a referral offer, **when** they open `/referrals`, **then** the
  discount card renders under an `h2` **"Your discount"**, above the referrer block.
- **Given** an account with **no** offer, **when** they open `/referrals`, **then** neither the heading
  nor the card renders — **no placeholder, no greyed card, no "you don't have one"**.
- **Given** a referred tradie who is not a referrer and has no code and no history, **when** they open the
  account area, **then** the Referrals section exists and contains the discount card alone.
- **Given** the program is switched **Off**, **when** they open `/referrals`, **then** the discount card
  still renders in its correct state — the discount was promised to a real person and does not move with
  a switch.
- **Given** the **Account** page, **when** it is inspected, **then** **no** referral offer panel appears
  beside the price-display preference. That was revision 4's placement; the mock gate superseded it.

The three reasons §8.6 gave for the old placement are replaced by one: **the section is present whenever
the account has a code, history *or* an offer**, so the panel has a home that does not depend on the
account being a referrer.

**This card now carries the whole customer-facing explanation of the discount** (§3, item 1), which
raises what AC-70, AC-71 and AC-75 are protecting: it is the only place a referred tradie is told the
percentage, who it came from, when it runs out, and which of the three states they are in.

### AC-88 — one structural guard on the payout threshold, not two

- **Given** `min_payout_balance` > 0 and a referrer's confirmed balance below it that has waited **334
  days or more**, **when** the payout queue is built, **then** the group appears in **ready**, flagged
  `forcedByLongStop`, and is payable in that run.
- **Given** an ops user on the Program screen, **when** they look at the threshold field, **then** the
  standing warning that money held under it **is still legally payable** renders beside it, at the point
  of decision.
- **The acknowledgement flag on the write is struck** (design §18.1 A9). It was belt-and-braces on a
  staff-only endpoint whose only client renders the warning; it guarded nothing the warning does not.

`min_payout_balance` ships at **0**, and under D18 everyone in the program is payable, so the threshold
guards a state that exists only if someone deliberately turns it on. AC-61 and AC-81 (disclosure when
non-zero) are unchanged and become live the moment it is.

### AC-106 — the Ops link action runs every gate, including `has_order`

- **Given** each of: an unknown code, a dormant code, a staff-owned code, the applicant's own code, a
  code whose referrer shares the applicant's ABN, an account that already has a referral, **and an
  account that has already placed an order** — **when** Ops attempts to link, **then** each is refused
  with **its specific reason shown to the staff member** and **no `referral` row is written**.
- **Given** the program is Off, **when** Ops attempts to link, **then** it is refused.
- Verified against the same `recordReferral` path the cookie flow uses, never a parallel implementation.

> **The `has_order` gate — owner ruling: LEAVE AS IS.** `recordReferral` refuses `source:'manual'` for an
> account that has already ordered (`worker/lib/referrals.ts:216-222`). A19's enumerated gate list did
> not mention it and AC-108 spoke of a "preexisting account" without saying whether one that has bought
> counts. It does not: **Ops may link a code to an account that exists but has not yet ordered; they may
> not link one to an account that has already bought.** If staff ever need to override that, it is a
> deliberate future change with the owner's name on it, not a bug fix. AC-108 is unchanged in substance
> and reads with this bound.

### AC-49d — no existing **price** expectation is edited to pass

- **Given** the referral branch, **when** the diff to `scripts/tests/**` is reviewed, **then** no
  assertion on `unit`, `total`, `depositAmount`, `line_total`, `delivery_total`, `payment.amount` or a
  snapshot `discountPercent` in a pre-existing test has been changed, relaxed or removed.
- **Given** a **structural** assertion in an existing test — a query count, a call count, a mock branch —
  **when** the referral work makes it additively wrong, **then** it may be updated, and the reason is
  recorded in this spec.

**Accepted exception, recorded rather than treated as a defect:**
`scripts/tests/estimator-rules.test.mjs` — `assert.equal(reads, 5)` → `6` at `:582` and `:590`, plus a
mock branch returning `null` for `FROM referral` at `:568`. `loadAccountDiscount` now asks one further
question per pricing snapshot, so the constant moved by exactly one. **No price assertion moved.** What
the test actually protects — that the read count is a constant of setup and **does not grow with the
candidate set** — is unchanged and still asserted after the 100-call loop. The mock branch is ordered
before the `discount_percent` branch on purpose, because a substring match would otherwise swallow the
referral query and answer the wrong question.

### AC-110 — expiry does not leave a stale discounted draft behind (NEW)

Gives AC-72's second limb the mechanism it never had. **The one finding not descoped; with the developer.**

- **Given** an unissued draft whose lines were priced while the referral discount was available, and
  **given** the referral has passed `expires_at`, **when** the scheduled sweep next runs, **then** every
  unissued parent line for that owner is re-priced **without** the referral component, and the referral is
  stamped processed (`expired_processed_at`) so it happens once.
- **Given** a line carrying an ops **price override**, **when** the sweep runs, **then** its price is left
  alone (AC-59).
- **Given** an **issued** quote, **when** the sweep runs, **then** it is untouched (AC-54).
- **Given** the sweep's existing schedule, **then** the window in which a stale discounted figure can be
  issued is bounded by one run, and that bound is the accepted exposure.

> **Why this is not cosmetic.** `issueQuote` reads the stored `line_total` and does not re-price
> (`worker/lib/issue.ts:126-147`). Without the expiry limb, a draft priced under a live discount can be
> issued months after that discount lapsed, at the lapsed price — the business gives away a discount it
> no longer owes, and the customer is shown a number they were not entitled to. The machinery already
> exists and is already called on the *used* ending: `stripReferralFromDrafts` (`worker/lib/lines.ts:345`,
> single caller at `worker/lib/referrals.ts:434`). Only the *expired* ending has no caller.
>
> **For the developer, on the larger worry:** the sweep **is** invoked. `worker/index.ts:252-260`
> `scheduled()` calls `referralSweep(env)`, and `wrangler.jsonc:67-69` configures
> `"crons": ["*/10 * * * *"]`. So the confirmation limb has been running, and AC-110's exposure window is
> **ten minutes, not a day**. That does not reduce the finding — a stale price can still be issued inside
> the window, and before this fix it could be issued forever — but it means there is no second, larger
> defect hiding behind it.

---

## 3. Struck criteria — descoped, with the reasoning that will be asked for later

Every entry here is a **deliberate product decision by the owner**, not a cost cut and not an oversight.
Recorded at length precisely because a future reader who finds a struck criterion assumes the worst.

### 1. The quote-panel badge — struck as a set

**Struck together, because they are one requirement stated in four places:**

- **AC-57** — "the quote indicator disappears at the first pricing event after use or expiry". Struck
  outright: with no indicator on pre-issue surfaces there is nothing to disappear, and the issued-quote
  badge must *not* disappear (AC-54 freezes it).
- **AC-51's display half** — any requirement that a draft surface *name* the referral component.
  **AC-51 survives in full as a pricing criterion**: the same discounted figure still appears on every
  surface pricing a real customer's line, and `previewSample` is still excluded. What goes is the label,
  never the price.
- **§8.5's draft-side requirement** — the indicator on `QuoteTotals` for unissued quotes. The **issued**
  quote and the order keep their badge, rendered from the issue-time stamp.
- **§1's success outcome** — *"A referred tradie sees the discount while they are quoting."*

**The owner's reasoning, in his words:** *"they know they are getting one - the reason for sign up. And
windows is not in a category of 'I'll buy a few extra because it is cheaper' products anyway - you buy
all you need for the project."*

**What that means as a product argument, so it survives the paraphrase.** The referral discount is an
**acquisition** incentive, not a **basket** incentive. It does its persuading before the account exists —
it is why the tradie entered a code at all — and by the time they are building a quote the decision it
was meant to influence has already been made. A discount badge earns its place on a surface where seeing
it changes behaviour; in a category where you buy exactly the windows the job needs, it changes nothing.

**Consequences, stated so nobody re-derives them as bugs:**

- **The referred tradie is still told.** The discount card in the Referrals section (AC-69, AC-70, AC-71)
  carries the percentage, the referrer, the deadline and the state. It is now the **only** customer-facing
  explanation, which is why AC-69's amendment above raises what the card is protecting.
- **`GET /api/projects/current` and the price-preview response deliberately carry no `referral` field.**
  This moves to spec **§6, out of scope**: not an omission, not a gap to be helpfully closed by a later
  reviewer who notices the discount card has data the quote panel does not.
- **The approved UX mock is now ahead of the spec on this one point** — UX §7 specifies the `QuoteTotals`
  referral row. That is a documentation correction for the ux-designer (§8), not a build instruction.

### 2. AC-46 — the ops dashboard "payouts ready" row

**Descoped to the ops console redesign.** Owner: *"will be part of ops upgrade."* Not "outstanding" — it
has a named home, and building it twice would be waste.

**The residual, named so the redesign inherits it as a requirement rather than discovers it as a bug:**
**the 14-day payment promise currently has nothing watching it.** M14 and AC-80 make a public commitment
under ACL s 32(2) that a confirmed earning is paid within `payout_timeframe_days`. The over-promise flag,
the sort order and the "past its promised date" count all exist — **on the Payouts screen, visible only to
someone who has already decided to go there.** Until the ops redesign lands, the trigger for the weekly
payout run is a human habit, and the consequence of forgetting is a breached public promise rather than a
late chore.

→ **For the ops console redesign:** a "referral payouts ready" row in the "Needs us" list, showing count,
total, and the age of the oldest group when any is past its promised date. `referralPayoutsReady` on
`/api/ops/summary` is the missing piece; the queue already computes `overPromise` and `daysWaiting`.

### 3. AC-77 and the two remaining emails

**All three descoped:** `referral_discount_expiring` (the 30-day reminder, AC-77),
`referral_recorded` ("a mate signed up") and `referral_earning_confirmed` ("your money is confirmed").
`referral_payout_sent` — the one that says money has actually moved — **is** wired and stays.

**What holds while they are absent:**

- The discount card states the deadline and takes an **expiring** treatment inside 30 days, so a lapsing
  discount is never a silent disappearance (§4.6.4 unchanged).
- The referrer's money and its payment date are on their own screen (AC-27, AC-80).
- **A hard copy constraint, now owned by the T&Cs review (§9):** the rules, the T&Cs and the FAQ post
  **must never promise a reminder.** This is the condition the descope rests on. A sentence like "we'll
  remind you before it runs out" written by whoever drafts the final wording would turn a descope into a
  broken promise, and under ACL s 18 an unmet promise in published terms is the exposure, not the missing
  email.
- **When the reminder ships, the 30-day threshold must be one fact.** It currently lives client-side in
  `src/components/referral/format.ts` as `EXPIRING_WITHIN_DAYS`.

### 4. The terms-acceptance record — not built

**Owner: do not record it.** He asked what the value was, given the program cannot be joined without
accepting; there is **no statutory requirement** to retain an acceptance record on these facts, and if one
existed it would belong on the user account record rather than in an audit trail.

**Correcting my own framing in the previous round, because I put it too strongly:** the tick gates
**joining the referral program**, not creating an account. It sits on the payout-details screen
(`src/components/referral/JoinProgramFlow.tsx:196-205`), which is the join step under D18. An account
exists and functions perfectly well without anyone ever ticking it. My earlier phrasing invited the
reading that account creation depends on it, which is not what happens.

**The one thing that genuinely cannot be reconstructed later** is **which version** of the terms a
referrer accepted, once the terms are edited. That is one nullable column on `user` if it is ever wanted.
It goes to the T&Cs reviewer as a question (§9), not to the build — the reviewer is the person who knows
whether the terms will change materially and whether it matters if they do.

**Still true and still blocking launch (§7):** the terms must **exist**. A live checkbox linking to
nothing, on the screen that collects bank details, is a different problem from not recording the tick.

---

## 4. New spec section §4.10 — the open tails handed to the next feature

**A ground rule the owner has always applied and this document has never stated: accounts are for tradies
only.** It belongs in `CONTEXT.md`, which the architect owns; it is recorded here because four of this
feature's open edges only make sense in its light.

**The code currently contradicts it.** `findOrCreateUser` (`worker/lib/auth.ts`) is ungated — anyone who
can receive an email OTP gets an account — and `migrations/0032_account_discount.sql` gives every account
`discount_percent DEFAULT 5`, on the stated intent that *registering* is the thing being rewarded.
**Account creation is the next feature**, and the owner's preference is automatic creation gated on
solving ABN validation.

**The owner deliberately accepted these as open tails rather than extending this feature's scope**, on two
grounds: the money-**out** path is already ABN-gated (a referrer needs a valid ABN plus bank details
before a code issues), so only the discount-**in** path inherits the gap; and **nothing launches before
registration lands**. Recorded so the next feature inherits them explicitly.

1. **The referral discount is available to any account, because any account is available to anyone.**
   Verification at creation closes this **with no referral-side change**. Do not build a referral-side
   compensator for it.
2. **The `of_ref` cookie exists only to carry a code across self-serve OTP signup.** If account creation
   becomes form-based or Ops-only, **delete it outright** — the cookie, the `/r/<CODE>` `Set-Cookie`
   branch (`worker/index.ts:185-189`) and the hook at `worker/routes/auth.ts:88-110`. `/r/<CODE>` then
   becomes a plain 302 to `/refer`, AC-4's cookie limbs go with it, and the existence oracle recorded at
   AC-98 goes too.
3. **AC-105 should return if automatic creation is kept.** It was struck in revision 13 only because the
   account-request form does not exist — not because prefilling a code was ever wrong. Whichever form ends
   up creating accounts is where it comes back, unchanged (§8.0).
4. **ABN validation is checksum-only today, and one `abnValid` serves both paths.** A real ATO Lookup
   added at registration therefore benefits referrers for free, with no referral-side work. Keep it one
   function.
5. **`organisation` / `membership` hold ABN and `account_status` and nothing prices against them.**
   Wire-or-delete is the next feature's call, not this one's. This feature attaches referrals to `user`
   (§7) and that stays true either way.

---

## 5. New spec section §15 — rulings on the design's not-built register

Design §18.4 named seven designed-but-not-built items and asked the product-manager to rule each.
All seven are now ruled and none is left open.

| # | Item | Ruling | Reason |
|---|---|---|---|
| 1 | **AC-67 bulk void** | **Deliberately descoped** — criterion rewritten (§2) | Deleted at the **user-approved mock gate** and replaced with per-referral void carrying its own mandatory reason. The invariant AC-67 exists to protect — *a promise is never withdrawn except by an explicit, confirmed, reasoned staff act* — is met, and met with better evidence. Revisit trigger recorded at AC-67. |
| 2 | **AC-46 ops dashboard "payouts ready" row** | **Descoped to the ops console redesign** (owner) | Named home, so building it here would be building it twice. The residual — the 14-day promise has nothing watching it — is written up at §3 item 2 as a requirement the redesign inherits. |
| 3 | **AC-77 expiry-reminder email** | **Descoped** (owner) | The countdown on the discount card is the honesty mechanism; the email adds urgency. Conditional on the T&Cs never promising a reminder — now a §9 review question. |
| 4 | **AC-88 guard 1** (acknowledgement-gated threshold write) | **Deliberately descoped** — criterion rewritten (§2) | The warning at the point of decision is built and the long-stop is built and tested. The flag guarded nothing the warning does not. |
| 5 | **§8 sweep limb — expiry processing** | **Outstanding and blocking; with the developer** | AC-110 (§2). The only finding not descoped, because it is money given away after we stopped owing it. |
| 5b | **§8 sweep limb — the 30-day reminder** | Same as #3 | It *is* AC-77. |
| 6 | **T9 — three of four emails** | **Descoped** (owner) | `referral_payout_sent` is wired. See §3 item 3 for what must hold while the others are absent. |
| 7 | **T9 — rules/T&Cs posts and the privacy-policy section** | **Outstanding, blocking launch, not blocking the developer** | The join flow asks a referrer to tick *"I've read and accept the referral program terms"* on the screen where their bank details are collected. Terms that do not exist cannot be accepted, and the link goes nowhere. The privacy policy must name referral data, payout details and the access log (§11.13, APP 11). Content, owner-supplied. |
| 8 | **The live badge on unissued draft surfaces** | **Descoped** (owner) — struck as a set with AC-57, AC-51's display half and §1's success outcome | §3 item 1. An acquisition incentive, not a basket incentive; the persuading is done before the quote is built. |

---

## 6. Amended prose, for the merge

- **§4.7, "What Off changes, in full", item 1** — strike *"`/r/<CODE>` sets no cookie"*. Replace with:
  *"`/r/<CODE>` still sets the cookie; the refusal happens at `recordReferral`, which returns
  `program_off`. A click while Off followed by an account created after the program returns **is**
  attributed — Off means come back later, and a mate who comes back later counts (AC-62)."*
- **§4.7, "Switching Off honours what was already promised"** — *"Stopping in-flight promises requires a
  separate, explicitly confirmed **per-referral void, each with its own reason**"* (AC-67).
- **§4.9.2, second bullet** — strike *"A link for a currently-unpayable referrer sets no cookie"*. Replace
  with: *"A link for a currently-unpayable referrer sets the cookie like any other; the dormant code is
  refused at recording, with the **generic** invalid-code error, which must never disclose the referrer's
  account state to a third party. Deciding it at click time would disclose it by the presence or absence
  of `Set-Cookie` (AC-4, AC-98)."*
- **§8.4(b)** — *"**Void** (mandatory reason) and **un-void**, per referral. There is no bulk void; see
  AC-67."*
- **§8.5** — replace the section with: *"The **issued** quote and the order name the referral component
  only, never a total (AC-75), rendered from the issue-time stamp. **Unissued surfaces carry no referral
  indicator** — see §3 of the revision-14 amendments for why."*
- **§8.6, opening paragraph** — the panel *"lives in the account area's **Referrals** section under an
  `h2` 'Your discount', above the referrer block"*; the three-argument rationale is replaced by the
  section-visibility rule (AC-69).
- **§1, "What success looks like"** — strike *"A referred tradie sees the discount **while they are
  quoting**, knows it is one-off, and knows when it runs out."* Replace with: *"A referred tradie can see
  what their discount is, who it came from and when it runs out, in one place in their account."*
- **§5 item 5 and §13 T5** — the offer panel's home is `/referrals`, not the Account page.
- **§6, out of scope** — add: *"**A referral indicator on unissued quote surfaces**, and any `referral`
  field on `GET /api/projects/current` or the price-preview response. Deliberate (§3 of the revision-14
  amendments): the discount is an acquisition incentive and has done its work before the quote is built.
  The price still carries the discount; only the label is absent."*
- **A19** — add `has_order` to the enumerated gate list, with the ruling quoted at AC-106.
- **§11** — add the two review questions from §9 as items 14 and 15.
- **§12 (decisions needed)** — replace with: **"None. Five owner decisions taken 2026-08-17 are recorded
  in revision 14 §3."**

---

## 7. What still blocks acceptance

**Blocking — code:**

1. **AC-110 — expiry does not strip stale referral pricing from unissued drafts.** With the developer. The
   fix is a call to an existing function from an existing sweep, plus the `expired_processed_at` stamp
   that already has a column. The sweep itself is confirmed running (cron every 10 minutes), so the
   exposure window is minutes, not a day, and there is no larger defect behind it.

**Blocking launch, not the developer:**

2. **The rules/T&Cs post and the privacy-policy referral section.** A live terms checkbox pointing at
   nothing, on the screen that collects bank details. Content, owner-supplied, professional review
   outstanding per §11.

**No longer blocking, by owner decision:** the quote-panel badge, AC-46, AC-77, the two remaining emails,
and the terms-acceptance record. Each is at §3 with its reasoning.

**Settled by this revision and not open:** the `/r/<CODE>` cookie (AC-4), the offer panel's placement
(AC-69), the `estimator-rules` edit (AC-49d exception), the `has_order` gate, the bulk void, and AC-88's
guard 1.

**For the acceptance pass, when the tester re-runs:** the criteria struck at §3 must not be reported as
failures, and the criteria amended at §2 must be walked in their **amended** form — several of them now
assert the opposite of revision 13. The tester should be given this register, not just the spec.

---

## 8. Documents that are now wrong, and who owns them

Flagged, not fixed.

- **`docs/design/referral-program.md` §10.2:779 and §10A.3:887** still specify
  `POST /api/account/referrals/claim`, deleted in revision 12 and now gone from the code. **This is how
  the live endpoint survived the architect's conformance review** — the reviewer checked the code against
  a document still asking for it. **Architect.**
- **`docs/design/referral-program-ux.md` §5.6** still requires a *"Were you referred?"* code-entry box
  that was deliberately deleted (A5); **§8.3** still describes an ops payouts screen a later owner
  instruction superseded; and **§7** still specifies the `QuoteTotals` referral row, now struck by owner
  decision (§3 item 1). **ux-designer.**
- **`docs/design/referral-program-ux.md` §14** — the amendment list was addressed to the product-manager
  and the architect *"before implementation"* and was never routed to either. Most of it was built anyway;
  **four items were not, and the document asserts they were deleted when they still exist in the code**:
  `min_payout_balance` (still in the config, the API and the payout queue), the long-stop force-promotion
  and `forcedByLongStop` (built, `worker/lib/referrals.ts:988`, `:1317-1326`), the accruing group (built),
  and membership-as-terms-acceptance with `referral_joined_at` and a terms version (**not** built, and now
  deliberately not built — §3 item 4). Whoever next reads §14 will be misled in both directions.
  **ux-designer**, with the architect to confirm the as-built side.
- **`CONTEXT.md`** — the ground rule *accounts are for tradies only* (§4 above) belongs there.
  **Architect.**

**Codex external review did not run on this work** (quota exhausted; the owner deferred to a single larger
pass later). Its absence is not a passed gate and will be stated in the acceptance record.

---

## 9. Decisions needed (owner)

**None.** All five questions from the previous round were answered and are folded in above.

Two items were **redirected to the professional T&Cs / legal review** rather than to the owner or the
build. They belong in spec §11 as items 14 and 15:

- **14. Does the acceptance need to record which *version* of the terms was accepted?** Today nothing is
  recorded; the tick gates joining the program and nothing persists it. There is no statutory recording
  requirement on these facts, and the owner has decided not to build one. **The reviewer is the right
  person to say whether that changes once the terms are edited materially** — if it does, it is one
  nullable column on `user`, not an audit trail.
- **15. The terms, rules and FAQ must never promise a reminder before the discount expires.** The 30-day
  reminder email is descoped; the discount card carries the countdown instead. A "we'll remind you"
  sentence in the drafted wording would turn a descope into an unmet published promise (ACL s 18). This is
  a **constraint on the copy**, recorded where the person writing the final wording will see it.

**One thing I need from the coordinator, not the owner:** the merge. Revision 14 must land in
`referral-program.md` in place (instructions at §0), and this file must then be deleted. I judged
reproducing 1,383 lines of settled prose the greater risk and am taking the offer of an in-place editor.
