# User registration — Phase 2: Trade verification (ABN / ABR)

Branch: `feat/user-registration`
Status: **revision 3 — decision gate answered by the owner (2026-08-19); AB-P2-16 amended after the
architect's design pass (§14 finding 3). §12 "Decisions needed" is EMPTY. Ready for the developer.**
Author: product-manager
Date: 2026-08-19

**Grill input:** `docs/specs/user-registration-grill-conclusions.md` — the binding decision record
(owner grill closed 2026-08-18; **Phase 2 decisions P2-D1…P2-D4 added 2026-08-19**). D1–D10, the
invariants and the assumptions A1–A4 govern wherever this spec is silent. Its *Actors and needs*
section is reproduced verbatim in §3.

**Phase 1 is DEPLOYED to production (2026-08-19).** This spec extends live behaviour, not a plan.
What shipped, what it deliberately left, and the eight operational rules that bit during Phase 1 are
in `docs/specs/user-registration-phase-2-handover.md`; the surfaces being extended are
`docs/specs/user-registration-phase-1.md` (rev 4) and its design **§16** (the interaction contract
this phase must keep obeying: two stages, directly editable fields, *a disabled Submit is never
unexplained*).

**Criterion ids:** `AC-P2-n` (functional, 64 of them) and `AB-P2-n` (16 abuse cases the tester must
attempt and see refused). Phase 1's `AC-n` / `AB-n` are a separate, closed set — no id is reused or
renumbered, and none is retired except where this spec says so explicitly (§5.8, the AC-41
supersession).

**Revision 2 changes:** owner rulings on Q1 (revocation email — yes), Q2 (acknowledgement promises
no turnaround), Q4 (any assigned-role staff may decide), Q5 (no builder/tradie label at the gate);
grandfathering resolved to three named addresses (§5.9); both owner add-ons confirmed in scope; and
§7 specifying all four Phase-2 emails as **Sanity-authored templates with Worker fallbacks**
(AC-P2-61…64).

**Revision 3 change (correction, not a decision):** **AB-P2-16** was unsatisfiable as written — the
ATO ABN Lookup JSON web service is GET-only, so the ABN necessarily rides in the query string of the
request *we make to the registrar*. The criterion always meant *our* surfaces; it now says so, split
into an executable clause and an explicit carve-out with its reason (§6). **AB-P2-8** is extended to
name error responses explicitly. No other change.

**Sizing note.** This is one phase of an already-wayfindered effort, so it does not need re-charting
— but it is at the top of what one pipeline run should carry (a third-party dependency, three
customer surfaces, an ops surface, a data migration). §11 names three independently landable slices;
the developer should land and commit them in that order rather than holding one big diff (handover
§4.8: two machine deaths during Phase 1, and only committed work survived).

---

## 1. Problem statement

Phase 1 closed the pricing leak by creating every account at `discount_percent = 0`. That was
correct, and it left a hole the owner accepted for exactly one phase (Phase 1 §2.4): **a genuine
tradie who registers today gets retail pricing and has no self-serve way to become a trade
account.** There is no application to fill in — `/trade-account` still renders a form wired to
nothing (`src/app/App.tsx:1690-1704`), which silently discards whatever a tradie types into it.

Three consequences, all live right now:

1. **Tradies configure whole jobs at retail prices.** Trade pricing changes the numbers a tradie
   sees *while configuring*, not just the number on the final quote. Without a way to become a trade
   account before quoting, the primary buyer prices the job wrong and either walks or asks a human
   to fix it — spending exactly the review time this feature exists to protect.
2. **Ops has no mechanism to grant trade status** other than editing `discount_percent` by hand in
   D1, and no record of who was granted what, on what evidence, or by whom.
3. **The one thing that distinguishes a trade customer — an ABN — is unverified free text.**
   `worker/lib/account.ts:69-70` writes `user.abn` with no validation at all; only the referral
   payout path checks a checksum. Nothing anywhere confirms the business exists.

**The ask, in the owner's terms:** a tradie's business checks out and they get trade pricing
immediately; a gmail sole trader is not punished with a rejection, they are looked at by a person;
and nobody ever sees a percentage.

### What success looks like

- A tradie who has never used the site can arrive cold at `/trade-account`, prove their business,
  and **browse and configure at trade prices from that moment** (P2-D1 — the primary path).
- An existing account — a private customer who started a business, or anyone who registered during
  Phase 1 — adds an ABN from their account page and gets the same outcome (P2-D2).
- Machines handle the clean passes. Ops opens a queue containing **only genuine judgment calls**,
  each with the evidence already gathered.
- Nothing is auto-rejected, ever. An ABR outage or a gmail address costs a wait, not a refusal.
- Nobody — customer, tradie or anonymous visitor — ever sees a discount percentage, and no reviewed
  quote is repriced behind a customer's back (P2-D4).
- Ops never carries a customer discount: existing staff rows are pinned to 0 in this phase.

---

## 2. In scope / out of scope

### 2.1 In scope

1. **Three entry points into ONE verification** (P2-D1/D2/D3). All three collect the same facts,
   call the same verification, write the same account fields, and produce the same two outcomes:
   - **(a) `/trade-account` becomes the real signup** — the Phase-1 email-OTP flow extended with
     ABN + business name + builder/tradie label, **reachable cold** by someone who has never quoted.
     The dead mock form is deleted, not left beside it.
   - **(b) The profile/account page** — a first-class "add your ABN, get trade pricing" affordance.
   - **(c) An optional ABN field at the submit gate** — optional, never a submission blocker.
2. **The hybrid auto-pass triple (D2)** against the live ABR register, with every near-miss queued
   for a human and **nothing auto-rejected**.
3. **The duplicate-ABN rule (D2.1)** — an ABN already verified elsewhere can never auto-pass; it
   queues, and a human may knowingly allow it. Never a hard block.
4. **The ABR dependency (D3)** — free ATO ABN-Lookup web-services GUID as a Worker secret; outage or
   missing key ⇒ queue for manual review.
5. **The ops review queue**, approve / reject / revoke by **any assigned-role staff member**
   (owner ruling Q4), decision history per account, ABN and trade status visible on every account
   record.
6. **Four outcome emails** — acknowledgement, approval, rejection, revocation — each a
   **Sanity-authored template with a Worker fallback** (§7), none of which states a percentage or a
   turnaround time.
7. **The pricing grant (D4)** — approval writes the business-account default to
   `user.discount_percent`; the column stays per-account so ops can negotiate individual rates.
8. **The data migration (D4)** — existing `type='internal'` rows pinned to `discount_percent = 0`;
   the three named production accounts grandfathered as trade (§5.9).
9. **Advertising the existence of trade pricing (D5)** on four named surfaces — never the
   percentage. Phase 1's AC-41 silence ends here, by design (§5.8).
10. **The builder/tradie self-declared label (D7)** — captured on `/trade-account` and the profile
    page (**not** at the submit gate, owner ruling Q5), stored, shown to ops. The two labels are
    functionally identical in this phase.
11. **Two owner add-ons, confirmed in scope** (grill §"Phase cut", handover §3.3; requested by the
    owner at the Phase-1 mock gate "so I would not forget"): the referral payout form pre-fills its
    ABN from the account's stored ABN, and the ops project record gains the read-only customer
    contact line deferred out of Phase 1 (seam §6.6, `src/ops/ProjectRecord.tsx:228`,
    `worker/routes/ops.ts:532`).
12. **Abuse-case criteria (§6)** and browser-level coverage (§10) — this phase adds UI to three
    customer surfaces and one ops surface.

### 2.2 Out of scope — deferred by the owner, with the ticket

- **How trade pricing is represented in a quote and applied by ops** — the owner's note attached to
  P2-D4, recorded as **GitHub issue #10**. Today the account discount folds into each line's price
  with no discount line anywhere; ops therefore has no obvious signal that a quote is a trade quote
  and no single lever to apply or correct trade pricing during review. A real tension, explicitly
  deferred. **Nothing in this phase may start solving it** — no discount line, no trade toggle on
  the ops quote screen, no repricing button.
- **ABN-less private referrers** (#4), **SMS verification** (#5), **guest-flow retirement** (#6),
  **`organisation`/`membership` wire-or-delete** (#7). Phase 2 keeps tiers on `user` and **must not
  touch those two tables**.
- **Wider "trade pricing exists" marketing** — home page, nav, quote surfaces, blog. Phase 3 owns
  the shop window; this phase advertises on exactly the four surfaces in AC-P2-48.
- **An ops editor for `discount_percent`.** D4 keeps the column per-account "so ops can negotiate
  individual rates *later*". This phase makes the column *granted* and *revoked*; a negotiated rate
  is still set by hand in D1. Ops **sees** the current rate on the customer record (ops is not a
  customer surface); it does not edit it here.
- **Periodic re-verification.** No scheduled job re-checks an approved ABN against ABR. An entity
  that lapses is caught by ops revocation (P2-A6).
- **ABR gating of referral payouts.** The handover notes the live lookup "benefits referrer payout
  validation for free". D6 says no referral code changes, so payability keeps its checksum-only test
  (`abnValid`, `worker/lib/referrals.ts:84`) in this phase. Owner ruling Q7: a private account may
  still make itself payable through the payout form; only a *verified* account is stopped from
  swapping its ABN there (§4.7).

### 2.3 Out of scope — deliberately untouched

- **`POST /api/auth/verify`** (`worker/routes/auth.ts:70-121`). Handover §4.3: it carries the
  referral attribution seam whose ordering is documented and test-enforced. Phase 2 achieves all
  three entry points without editing it — the trade application is a **separate authenticated call
  made after the session exists**.
- **The pricing engine.** `loadAccountDiscount` (`worker/lib/estimator/pricing.ts:356-369`) and the
  discount step (`pricing.ts:227-237`) are read, never modified. This phase changes *what the column
  contains*, never how it is applied.
- **Referral rules, rates, gates and surfaces** (D6). No referral-code input field on any form this
  phase adds (`worker/routes/referrals.ts:38-49`). The payout-form prefill is a prefill only.
- **Anonymous browsing, configuring, live pricing, autosave, uploads, the guest tracking flow.**
- **Phase 1's gate structure** — two stages, directly editable inputs, delivery never seeded from
  the account address, no separate name step. The optional ABN field is added *inside* the existing
  details stage; it does not add a third stage.

---

## 3. Actors and needs

*Reproduced verbatim from the grill conclusions (§"Actors and needs"). Nothing added, nothing
invented.*

- **Private customer** — no ABN. Researching windows/doors; small orders; will likely order via
  a tradie of their choice, or order themselves and get a tradie to install. Needs: browse and
  price anonymously without commitment; a low-effort account (email OTP) only when ready to
  submit; their quote taken seriously and responded to; no surprise that trade gets trade terms.
- **Tradie** — ABN-holding business account; smaller jobs (kitchen reno scale). Needs: instant
  trade pricing when their business checks out (they expect a trade-account application step —
  it's normal AU practice); not to be punished with delays for using a gmail address (manual
  review, not rejection); their ABN handled respectfully.
- **Builder** — ABN-holding business account; large, multiple orders; plans upload on the
  roadmap serves them. In THIS feature builders and tradies are functionally identical — the
  builder/tradie split is a self-declared label collected at registration, stored for ops and
  for future features to key off. Their selecting/ordering needs diverge later.
- **Ops (staff)** — needs: fewer time-waster quote reviews; a review queue for trade
  applications that only contains genuine judgment calls (machines handle the clean passes);
  the ABN visible on every account; power to revoke trade status; never carrying a customer
  discount themselves.

**What Phase 2 serves for each actor:**

| Actor | Served in Phase 2 | Not yet |
|---|---|---|
| Private customer | Untouched everywhere, except that they now *learn trade pricing exists* on four surfaces (D5) and can opt in if they qualify; a rejected application costs them nothing — the account keeps working (A3) | — |
| Tradie | Cold arrival at `/trade-account` → verified → **trade prices while configuring**, not after; a gmail address costs a wait and a human, never a rejection; the ABN is asked once and lives in one place | The quote-level representation of trade pricing (#10) |
| Builder | Identical to tradie, plus the self-declared label stored so later features (plans upload, priority handling) can key off it | Everything the label is *for* — this phase only captures it |
| Ops | A queue holding only judgment calls, each with the ABR evidence gathered and duplicates flagged; **any assigned-role staffer can clear it**, not just an admin; ABN + trade status on every customer record; revocation; a decision history; **existing staff rows pinned to 0** — ops stops carrying a customer discount; the customer's phone and address finally visible on the project record | A per-account rate editor (still D1 by hand); a trade signal on the quote itself (#10) |

---

## 4. The flows

### 4.1 One verification, three doors

Every entry point collects the same facts and calls the **same** authenticated verification:

| Fact | Stored on | Notes |
|---|---|---|
| ABN | `user.abn` (existing column) | **Written on approval only** — see §4.7. Normalised to 11 digits everywhere; humans may type spaces |
| Business name | `user.company` (existing column) | Required whenever an ABN is submitted — criterion 2 of the triple cannot be evaluated without it |
| Builder / tradie label | new account field | Collected on `/trade-account` and the profile page only (Q5). Self-declared, never inferred, never gates anything (D7) |

**The server ordering is fixed and identical for all three doors:** a session exists first, then the
application is created. **No unauthenticated endpoint anywhere accepts an ABN** — this is what stops
the verification endpoint being a free public ABN-validation oracle, and it is what keeps
`/api/auth/verify` unedited (handover §4.3). Where the *screen* asks for the ABN before the OTP
(door (a) very likely will), the client holds the entered values and posts them the moment the
session is established.

### 4.2 Door (a) — `/trade-account`, the real signup (P2-D1, the primary path)

The marketing page keeps its content and **loses its fake form**. In its place, a working signup:
email → OTP (the Phase-1 `OtpSignIn` component, Turnstile and rate limits unchanged) → ABN,
business name, builder/tradie. A cold visitor who has never quoted can complete it end to end.

- Auto-pass → the page says the trade account is **active**, and the next price the visitor sees
  anywhere on the site is a trade price. No percentage, no "you saved" line.
- Anything else → the page says it is **under review**, the account works normally meanwhile, and no
  reason is given for *which* check needed a human (§4.5, P2-A3).
- A signed-in visitor who is already verified sees their status, not a form. A signed-in visitor who
  is not verified gets the form without a second OTP.

### 4.3 Door (b) — the profile/account page (P2-D2)

The profile page today has a free-text **Business name** and **ABN** pair
(`src/app/App.tsx:1400-1407`) that writes straight to the account and means nothing. It becomes the
verification affordance: *add your ABN, get trade pricing* — the same fields (including the
builder/tradie label), the same verification, the same two outcomes, plus the status of any
application in flight and the history of past ones.

### 4.4 Door (c) — the optional ABN field at the submit gate (P2-D3)

The owner overruled the recommendation to keep the gate minimal, so the details stage gains an
**optional** ABN field, with a paired business-name field that appears only when an ABN is being
entered. **No builder/tradie label is asked at the gate** (owner ruling Q5) — an application that
originates there reads as "not stated" for ops, and the person can set it later on the profile page.
The Phase-1 gate contract holds without exception:

- An empty ABN never disables Submit and **never appears in the "Still needed:" caption**.
- A malformed ABN disables Submit **and is named in the caption** — Phase 1's rule that a disabled
  Submit is never unexplained is absolute (owner ruling, 2026-08-19). Clearing the field re-enables
  Submit immediately. This is a client-side format check and costs no round trip (P2-A1).
- A well-formed ABN **never delays submission**: the quote submits, and verification runs
  afterwards. The customer is told their ABN is being checked and is **not** told that this quote
  will be repriced — it will not be (P2-D4).
- An account already verified, or with an application pending, sees no ABN field. Nothing is asked
  twice.

### 4.5 The verification decision

Given a submitted (ABN, business name) for an account, in this order:

1. **Format/checksum.** An ABN that is not 11 digits or fails the modulus check
   (`abnValid`, `worker/lib/referrals.ts:84`) is a **field validation error**, exactly like a
   malformed phone: no application is created, no ABR call is made, the customer fixes it. This is
   not an auto-rejection — there is nothing yet to reject.
2. **The auto-pass triple (D2).** All three must hold:
   1. the ABN is **valid and active** on the live ABR register;
   2. the submitted business name **matches** the ABR entity name or any of its trading/business
      names (fuzzy; the algorithm is the architect's call);
   3. the account's **email domain plausibly matches the business** — a domain on the maintained
      free-mailbox list (gmail, hotmail, outlook, yahoo, bigpond, icloud, …) can **never** satisfy
      this, and any other domain must fuzzy-match the business or entity name.
3. **The duplicate rule (D2.1).** If the same ABN (compared as 11 digits) is currently **verified**
   on another account, the triple cannot auto-pass however well it scores. A previously revoked or
   rejected holder is not a duplicate.
4. **ABR availability (D3).** Timeout, error, or a missing GUID ⇒ the application queues with reason
   `abr_unavailable`. Nobody blocked, nobody waved through.

Outcome is exactly one of two, from the customer's point of view:

- **Verified** — the grant is applied immediately (§4.6).
- **Under review** — the application sits in the ops queue with every reason it queued and the full
  ABR snapshot attached. **There is no third, customer-visible "rejected by a machine" outcome.**

The customer-facing response is identical in every under-review case and **never names the criterion
that failed** (P2-A3). That is both a courtesy — nobody is told "your name didn't match" and invited
to guess again — and a security property (AB-P2-7): the endpoint must not become a tool for testing
ABNs or probing business names.

### 4.6 The grant, and what it never does

Approval — auto or by a human — does exactly this:

1. writes the submitted ABN, business name and label onto the account;
2. marks the account trade-verified, recording who decided, when, and on what evidence;
3. sets `user.discount_percent` to the **business-account default** (currently 5), read from one
   named place in the code (D4; migration 0032's column `DEFAULT 5` stays untouched dead weight —
   changing it means rebuilding `user`, which is forbidden: handover §4.7).

And it explicitly does **not**:

- recalculate, rewrite or re-issue any stored price, quote line, quote or order (P2-D4 —
  *no silent repricing*). An approved tradie's *reviewed* quote comes back at trade pricing because
  ops prices it after approval, not because anything recalculated behind the customer's back;
- change a rate ops has already negotiated on an **already-verified** account (P2-A5);
- apply to a `type='internal'` account under any circumstances — staff-ness is its own axis
  (CONTEXT.md) and ops must never carry a customer discount.

**Revocation** is the mirror: status inactive, `discount_percent` back to 0, reason and actor
recorded, the customer emailed (owner ruling Q1 — their prices are about to change; a silent
revocation reads as a bug), the account keeps working as a private account, and nothing stored is
repriced.

### 4.7 The ABN's one home, and the two writers

P2-D2 says the ABN keeps **one home — the account row**. It does, with one clarification the
architect must not merge away: the **account row holds the live fact**, and each **application
record holds a frozen copy** of what was submitted and what ABR said about it at that moment. That
is the pattern a payout already uses for its frozen ABN/bank copy (CONTEXT.md, *Payout*) — a history
record, not a second home. Ops history (A3) and the duplicate rule are both unbuildable without it.

Two paths write `user.abn`, with different powers:

| Writer | Effect | Guard |
|---|---|---|
| The verification flow (new) | Writes the ABN **and** grants trade status | Approval only — never on a pending application |
| `POST /api/auth/profile` / the referral payout form (existing, D6, unchanged by owner ruling Q7) | Writes the ABN for **payout** purposes; **grants nothing** | **Refused** while the account is trade-verified or has an application pending (P2-A4, AB-P2-12) — an approved trade ABN can never be swapped through the payout form |

Ops may still edit a customer's ABN (`PATCH /api/ops/customers/:id`, `worker/routes/ops.ts:1427`);
that edit is logged as today and **does not** grant, revoke or re-verify anything.

---

## 5. Acceptance criteria

Every criterion is independently verifiable and maps onto a test the developer can write.

### 5.1 Door (a) — `/trade-account` as the real signup

- **AC-P2-1** — Given a visitor with no session, When they open `/trade-account`, Then the page
  presents a working trade signup (email, ABN, business name, builder/tradie), and **no field on the
  page discards what is typed into it** — the mock form at `src/app/App.tsx:1690-1704` no longer
  exists in the DOM.
- **AC-P2-2** — Given that visitor, When they complete the email OTP step, Then the account is
  created through the unchanged `POST /api/auth/verify` (same request shape, same
  attribution → clear `of_ref` → claim-merge → session ordering) and a session is established.
- **AC-P2-3** — Given a visitor who entered ABN, business name and label **before** verifying their
  email, When the session is established, Then those values are submitted to the verification
  endpoint without re-typing; and Given that call fails transiently, Then the values are still on
  screen and retryable, and the person is signed in regardless.
- **AC-P2-4** — Given a cold signup whose ABN is valid and active, whose business name matches the
  ABR record, whose email domain plausibly matches, and whose ABN is not verified on another
  account, When the application is submitted, Then the account is trade-verified in that same
  interaction, the page shows an **active** trade state, and **no percentage appears anywhere on the
  page**.
- **AC-P2-5** — Given that same cold signup, When the visitor then prices any configuration, Then
  the price reflects the business-account default — trade pricing applies **while configuring**, not
  only after submission.
- **AC-P2-6** — Given an application that fails any one of the three criteria (including a gmail
  address that otherwise checks out), When it is submitted, Then the page shows an **under review**
  state, the account remains fully usable, **no rejection is stated**, and the response does not
  reveal which criterion failed.
- **AC-P2-7** — Given an ABN that is not 11 digits or fails the checksum, When the form is
  submitted, Then an inline field error names the ABN, **no application record is created**, and
  **no ABR call is made**.
- **AC-P2-8** — Given a signed-in account already trade-verified, When it opens `/trade-account`,
  Then it sees its verified status and no application form; and Given a signed-in account that is
  not verified, Then it sees the ABN form pre-filled with any stored business name and is not asked
  to verify its email again.

### 5.2 Door (b) — the profile/account page

- **AC-P2-9** — Given a signed-in account with no ABN, When it opens the profile/account page, Then
  a first-class affordance offers to add an ABN **and states that trade pricing exists**, with no
  percentage and no worked example from which one could be derived.
- **AC-P2-10** — Given that affordance, When ABN + business name + label are submitted, Then the
  same verification runs and the same two outcomes occur as door (a) — verified with the grant
  applied, or under review — with no behavioural difference attributable to the entry point.
- **AC-P2-11** — Given a trade-verified account, When it opens the profile page, Then its trade
  status and ABN are shown and **the ABN is not a free-text editable field** there.
- **AC-P2-12** — Given an account with an application already pending, When it opens the profile
  page, Then the pending state and the submitted ABN are shown, and **no second application can be
  started** while one is pending.
- **AC-P2-13** — Given an account whose application was rejected, When it opens the profile page,
  Then it can apply again, its decision history is visible to it in outline (date and outcome), and
  every private-account capability is intact — quoting, submitting, tracking, referral participation
  (A3).

### 5.3 Door (c) — the optional ABN field at the submit gate

- **AC-P2-14** — Given a signed-in customer with no ABN at the gate's details stage, When the panel
  renders, Then an **optional** ABN field is present, and leaving it empty neither disables Submit
  nor adds anything to the "Still needed:" caption.
- **AC-P2-15** — Given the gate's optional ABN field, When a value is entered, Then a paired
  business-name field is required alongside it before the ABN is accepted, **and no builder/tradie
  control is rendered at the gate** (owner ruling Q5); and When the ABN field is cleared, Then that
  requirement disappears.
- **AC-P2-16** — Given a malformed ABN in the gate's optional field, When the customer tries to
  submit, Then Submit is disabled **and the caption names the ABN field**; and When the field is
  cleared, Then Submit is enabled again with no round trip.
- **AC-P2-17** — Given a well-formed ABN in the gate's optional field, When the customer submits,
  Then the project reaches `status_customer = 'submitted'` exactly as in Phase 1, and **the submit
  request completes without an ABR round trip in its critical path** (P2-A1 — measurable: the ABR
  stub records no call before the submit response, and submit latency is unchanged when the stub is
  made slow).
- **AC-P2-18** — Given a submission that carried an ABN, When the confirmation is shown, Then it
  acknowledges that the ABN is being checked, states **no percentage** and **no timeframe**, and
  **does not promise that this quote will be repriced** (P2-D4).
- **AC-P2-19** — Given an account that is trade-verified or has an application pending, When it
  reaches the gate, Then **no ABN field is rendered**.

### 5.4 The verification decision

- **AC-P2-20** — Given ABR reports the ABN valid and active, the business name matches, the email
  domain plausibly matches, and no other account is verified on that ABN, When verification runs,
  Then the account is approved **with no ops action** and no item appears in the review queue.
- **AC-P2-21** — Given ABR reports the ABN as not found, cancelled or not active, When verification
  runs, Then the application is **queued** with that reason recorded and is **not rejected**.
- **AC-P2-22** — Given the submitted business name matches neither the ABR entity name nor any of
  its trading names, When verification runs, Then the application is queued with reason
  `name_mismatch`.
- **AC-P2-23** — Given an email address on a free mailbox provider (gmail explicitly), When every
  other criterion passes, Then the application is queued with reason `email_domain` and is **never
  auto-rejected**.
- **AC-P2-24** — Given an ABN currently verified on another account, When a second account applies
  with it, Then the application is queued with reason `duplicate_abn` **even if all three criteria
  pass**, the ops queue shows the other holder(s), and the application is **not blocked** — a human
  may approve it (D2.1).
- **AC-P2-25** — Given the ABR service times out, returns an error, or no GUID is configured, When
  verification runs, Then the application is queued with reason `abr_unavailable`, the customer sees
  the ordinary under-review state, and nothing is approved.
- **AC-P2-26** — Given any queued application, When ops opens it, Then the stored ABR snapshot is
  shown: entity name, entity status, the trading names considered, which criteria passed and failed,
  and the lookup timestamp.
- **AC-P2-27** — Given two applications queued for different reasons, When their customer-facing
  responses are compared, Then the responses are **indistinguishable** (same status, same body).

### 5.5 The grant and pricing

- **AC-P2-28** — Given an application is approved (auto or by ops), When the account row is read,
  Then `discount_percent` equals the business-account default, read from **one named place** in the
  code (single source of truth; migration 0032's column default is not altered and no table is
  rebuilt).
- **AC-P2-29** — Given an already-verified account whose `discount_percent` was set by ops to a
  negotiated value, When a further approval or re-verification runs on it, Then `discount_percent`
  is **unchanged** (P2-A5).
- **AC-P2-30** — Given a trade-verified account, When ops revokes trade status, Then the account is
  no longer trade-verified, `discount_percent` is 0, reason and actor are recorded, and the account
  continues to work as a private account.
- **AC-P2-31** — Given an account with existing draft, submitted and issued projects, When it is
  approved or revoked, Then **no stored price, quote line, quote total or order row changes** —
  compared row by row before and after.
- **AC-P2-32** — Given an approved account, When it next requests a live price preview, Then the
  price reflects the new rate through the **unchanged** pricing path (`loadAccountDiscount`,
  `worker/lib/estimator/pricing.ts:356-369`; the diff shows no modification).
- **AC-P2-33** — Given a quote submitted before approval and reviewed after it, When ops prices it,
  Then it prices at the account's current rate — no separate mechanism, no re-issue of a prior
  quote, no customer-visible "repriced" event.
- **AC-P2-34** — Given a `type='internal'` account, When any verification path is exercised for it,
  Then it cannot become trade-verified and its `discount_percent` remains 0.

### 5.6 Ops — the review queue, decisions, visibility

- **AC-P2-35** — Given applications awaiting a decision, When staff open the ops console, Then a
  trade-applications queue is reachable and the **count of pending applications is visible without
  opening it**; the queue contains **only** applications awaiting a decision.
- **AC-P2-36** — Given a queued application, When staff view it, Then it shows the applicant's name
  and email, the submitted ABN, business name and builder/tradie label (or "not stated" for
  gate-originated applications), **every reason it queued**, the ABR snapshot, the date applied, and
  a link to any other account holding the same ABN.
- **AC-P2-37** — Given a queued application, When **any staff member with an assigned role** (admin
  or otherwise — owner ruling Q4) approves it, Then the account becomes trade-verified with the §5.5
  grant applied, the decision records the deciding staff member and the time, and the item leaves
  the queue.
- **AC-P2-38** — Given a queued application, When staff reject it with a reason, Then the account
  remains a working private account with `discount_percent` unchanged, the decision and reason are
  recorded, and the item leaves the queue.
- **AC-P2-39** — Given a decided application, When a second decision is attempted on it, Then it is
  refused (409) and exactly one decision remains recorded.
- **AC-P2-40** — Given an account with multiple applications over time, When staff open its customer
  record, Then every application and decision is listed in order with outcome, reason, actor and
  date — including grandfathered accounts, whose provenance reads as grandfathered rather than as a
  decision someone made.
- **AC-P2-41** — Given any customer account, When staff open its record, Then the ABN and current
  trade status are shown alongside the current `discount_percent` (read-only), and an account with
  no ABN on file says so explicitly rather than showing an empty cell.
- **AC-P2-42** — Given any approve, reject or revoke action, When it completes, Then an audit entry
  exists naming the acting staff id, the account and the action (`logEvent`, as every other ops
  mutation does today).

### 5.7 Outcome emails (see §7 for the templates)

- **AC-P2-43** — Given an application is approved (auto or by ops), When the decision lands, Then
  the applicant receives the `trade_approved` email saying their trade account is active, containing
  **no percentage** and no figure from which one could be derived.
- **AC-P2-44** — Given an application is rejected, When the decision lands, Then the applicant
  receives the `trade_rejected` email that says so plainly, states that their account still works,
  and invites them to apply again — with **no mention of another account** (a duplicate rejection
  must not disclose that someone else holds that ABN).
- **AC-P2-45** — Given an application is queued for review, When it is created, Then the applicant
  receives the `trade_ack` email, and **it names no timeframe** — no "within one business day", no
  "usually", no date (owner ruling Q2).
- **AC-P2-46** — Given **none of the four `emailTemplate` documents exist in Sanity** (or Sanity is
  unreachable), When each of the four events fires, Then the Worker's inline fallback subject and
  body are used and **every send still succeeds** (existing `worker/lib/emailTemplates.ts`
  behaviour — a missing template never blocks a send).
- **AC-P2-61** — Given ops revokes an account's trade status, When the revocation completes, Then
  the customer receives the `trade_revoked` email saying plainly that trade pricing no longer
  applies, with **no percentage** and no blame (owner ruling Q1).
- **AC-P2-62** — Given the four Phase-2 emails, When their `templateKey`s are read, Then each is
  `snake_case`, **contains no dot**, and is passed on every send — `trade_ack`, `trade_approved`,
  `trade_rejected`, `trade_revoked` (the public Sanity dataset exposes only dot-free ids to
  anonymous reads, so a dotted key would silently never resolve).
- **AC-P2-63** — Given an `emailTemplate` document authored in Sanity for one of these keys, When
  that event fires, Then the authored subject and body are used in place of the fallback, and the
  existing caching behaviour is unchanged (successful fetches cached ~5 minutes, failures never
  cached).
- **AC-P2-64** — Given all four Phase-2 emails in both their authored and fallback forms, When their
  rendered subject and body are inspected, Then **none contains a discount percentage, a pair of
  figures from which one could be derived, or a promised turnaround time**.

### 5.8 Advertising the existence of trade pricing (D5)

- **AC-P2-47** — Given **every** customer-facing surface in the product, When it renders for any
  account in any state, Then **no discount percentage appears, and no pair of figures from which one
  could be derived by subtraction** (the never-disclose-by-subtraction invariant, extended from
  AC-36).
- **AC-P2-48** — Given this phase, When the site is swept for copy about trade pricing existing,
  Then it appears on **exactly these four surfaces and nowhere else**: `/trade-account`, the profile
  affordance, the submit gate's optional ABN helper text, and the outcome emails. The home page, the
  nav, the quote builder and the review screen's pricing panels stay silent (Phase 3 owns wider
  marketing).
- **AC-P2-49** — Given Phase 1's **AC-41** ("no mention of trade pricing on any Phase 1 surface"),
  When the Phase-1 Playwright assertions are re-run, Then the assertions covering the four surfaces
  in AC-P2-48 have been **explicitly updated with this spec cited**, and every other AC-41 assertion
  still passes unchanged. **A tester finding trade copy on those four surfaces is recording
  conformance, not a regression.**

### 5.9 Data migration — staff pinning and grandfathering (D4)

The three production customer accounts, read live on 2026-08-18, are:

| Email | Company on file | ABN on file |
|---|---|---|
| `gediminas.bereznevicius@gmail.com` | Motro Constructions | `33629698013` |
| `sarah@northsidebuild.com.au` | — | — |
| `doni@siaribuild.com.au` | — | — |

All three are team/test accounts. **Two of them hold no ABN at all**, so they are being granted
trade status by **owner decision (D4)**, not by verification — the spec records that honestly rather
than dressing it up as a verified result, and their ops record says so (provenance `grandfathered`,
"no ABN on file").

- **AC-P2-50** — Given the database after migration, When every `type='internal'` row is read, Then
  `discount_percent` is 0 for all of them (Phase 1 fixed creation only).
- **AC-P2-51** — Given the migration, When it is applied, Then **exactly the three email addresses
  named above** are trade-verified with provenance `grandfathered` and the business-account default
  rate; the two without an ABN are verified with **no ABN written** (nothing is invented to fill the
  column); and **no other customer row's `discount_percent` or trade status changes**. Matching is
  by explicit address — never "every customer row that exists when the migration runs", which would
  silently grandfather anyone who registers between now and the deploy.
- **AC-P2-52** — Given the migration, When it is reviewed and applied, Then it consists only of
  `ADD COLUMN`, `CREATE TABLE`, `INSERT` and targeted `UPDATE` statements — **no table rebuild**
  (`d1-migration-safety` is mandatory reading; a rebuild in this database has already cascade-deleted
  production rows) — and it is numbered after `0053`.
- **AC-P2-53** — Given pre-migration row counts for `user`, `membership`, `project`, `quote_line`,
  `payout` and `"order"`, When the migration has been applied, Then every count is identical.

### 5.10 Carried Phase-1 seams (owner add-ons — confirmed in scope)

- **AC-P2-54** — Given a customer with a stored ABN, When they open the referral payout form
  (`src/components/referral/JoinProgramFlow.tsx:136`, rendered at `src/pages/ReferPage.tsx:283` and
  `src/pages/ReferralsPage.tsx:77`), Then the ABN field is **pre-filled** from the account; and When
  they do nothing else, Then they have not joined the program and their payability is unchanged.
- **AC-P2-55** — Given a project in the ops console, When staff open its record
  (`src/ops/ProjectRecord.tsx:228`, served by `worker/routes/ops.ts:532`), Then the customer's phone
  and full account address are shown read-only — the data Phase 1 collected and nothing displayed
  (Phase 1 seam §6.6).

### 5.11 Untouched surfaces and regressions

- **AC-P2-56** — Given `worker/routes/auth.ts:70-121` (`/api/auth/verify`), When the final diff is
  read, Then it is **unmodified**; and Given a visitor holding an `of_ref` cookie who creates an
  account through `/trade-account`, When the account is created, Then exactly one referral row
  exists, the cookie is cleared, and the claim-merge still runs before the session is created.
- **AC-P2-57** — Given every form and screen this phase adds or changes, When their DOM is
  inspected, Then **no referral-code input field exists on any of them**, and no endpoint added in
  this phase accepts a referral code.
- **AC-P2-58** — Given a signed-in customer with `price_gst_mode = 'ex'` and one with `'inc'`, When
  any surface this phase adds or changes displays a price, Then it respects the account's mode with
  the correct suffix (house rule).
- **AC-P2-59** — Given the existing regression suites, When this phase is complete, Then
  `scripts/tests/api.test.mjs` ("one draft per customer"), `scripts/tests/web/customer.spec.ts`
  ("signing in re-resolves the current project"), `scripts/tests/web/registration.spec.ts`,
  `scripts/tests/web/registration-gate-caption.spec.ts`, `scripts/tests/email-templates.test.mjs`
  and the referral suites all pass — with any edit to them **declared** in the developer's report and
  justified by AC-P2-49, the new gate field or the new template keys, never silent.
- **AC-P2-60** — Given the `organisation` and `membership` tables, When the final diff is read, Then
  **neither is written to, read from, or altered** by anything this phase adds (ticket #7 unresolved).

*(AC-P2-61 … AC-P2-64 are in §5.7, where the emails they govern are specified.)*

---

## 6. Abuse cases — the tester must attempt each one and record the refusal

This feature handles business PII (ABNs), calls a third party with a credential, and **grants a
privilege that changes what a customer pays**. These are acceptance criteria, not review notes.

- **AB-P2-1 — self-granted trade status.** Given a signed-in customer, When they POST
  `discountPercent`, `discount_percent`, `tradeStatus`, `trade_verified`, `tier`, `type`, `role` or
  `id` to `POST /api/auth/profile` **and** to every endpoint this phase adds, Then those keys are
  ignored, the response contains no such field, and the stored `discount_percent`, `type` and trade
  status are unchanged when read directly from D1.
- **AB-P2-2 — approving your own application.** Given a customer session (never staff), When it
  calls the ops queue-list, approve, reject and revoke endpoints, Then each returns 403 with no
  body data, and no application changes state.
- **AB-P2-3 — crafting the outcome.** Given a customer session, When it submits an application with
  `status: "verified"`, `abrSnapshot`, `decidedBy` or `discountPercent` in the body, Then those keys
  are ignored and the application's status is whatever the server's own verification decided.
- **AB-P2-4 — reading someone else's ABN.** Given customer A, When A requests customer B's
  application or account ABN by supplying a user id or application id in the path, body or query of
  any customer endpoint this phase adds, Then the response is 403/404 with **no data**, and the
  customer endpoints accept **no subject id at all** — scoping is by session only.
- **AB-P2-5 — unauthenticated access.** Given no session, When every endpoint added in this phase is
  called, Then each returns 401/403 with no data, and **the ABR stub records zero calls** (an
  unauthenticated caller can never spend the ABR quota or use the site as an ABN checker).
- **AB-P2-6 — rate limiting the lookup.** Given a signed-in account, When it submits more than the
  per-account cap of verification attempts within the window, Then further attempts return 429
  **and make no ABR call**; and Given many accounts behind one IP, When the per-IP cap is exceeded,
  Then the same holds. Both caps must exist.
- **AB-P2-7 — the criterion oracle.** Given applications that fail on the ABN status, on the name
  match, and on the email domain respectively, When their customer-facing responses are compared
  byte for byte, Then they are identical — the endpoint cannot be used to discover which fact is
  wrong, nor to test ABNs or business names.
- **AB-P2-8 — the ABR credential.** *(extended, rev 3)* Given the built client bundle, every API
  response body **including every error response**, and the Worker logs (including a forced ABR
  failure path — timeout, 5xx, and malformed-response), When each is searched for the value of
  `ABR_GUID`, Then it appears in **none** of them; Then no error surfaced to a customer or to ops
  contains the outbound ABR URL, and Then no log line contains a submitted ABN in any environment.
  The credential is a Worker secret and exists only in the outbound request to the registrar.
- **AB-P2-9 — the borrowed ABN.** Given a valid, active ABN belonging to a real business the
  applicant does not own, When they apply with a matching business name from a free-mail address,
  Then the application is **queued, never auto-approved**. *(Residual risk, accepted by the owner:
  an applicant with a matching domain and a copied business name can auto-pass. It is bounded, not
  eliminated — ops sees the ABN on every account, every order is human-reviewed, and revocation is
  one action. Nothing in this phase claims ABN ownership is proven.)*
- **AB-P2-10 — duplicate escalation.** Given an ABN already verified on account A, When account B
  applies with a perfect triple, Then B is queued and **never auto-approved**, and B's account never
  learns that another account holds it.
- **AB-P2-11 — staff and partner roles.** Given a `type='internal'` account, When it applies for
  trade or is approved through any path, Then it is refused and `discount_percent` stays 0; and
  Given a staff session whose role is `manufacturer`, When it calls the queue or decision endpoints,
  Then it receives 403 — the trade queue carries customer PII and is visible only to staff who may
  already see it (assigned roles only, owner ruling Q4).
- **AB-P2-12 — swapping a verified ABN.** Given a trade-verified account, When it writes a different
  ABN through `POST /api/auth/profile` (the referral payout path), Then the write is refused with a
  specific error and the stored ABN is unchanged.
- **AB-P2-13 — unbounded input.** Given the application endpoint, When a 100 KB business name, a
  1000-character ABN, or non-ASCII digit lookalikes are posted, Then the request is refused with the
  field named and nothing unbounded reaches D1.
- **AB-P2-14 — replayed decision.** Given an application already approved, When the approve endpoint
  is called again (including concurrently), Then exactly one grant and one decision record exist,
  and `discount_percent` is not applied twice or overwritten.
- **AB-P2-15 — revocation takes effect immediately.** Given a customer with a live session and an
  open browser tab, When ops revokes their trade status, Then their next priced request returns
  retail prices — the grant is read from the account row per request and is never baked into a
  session or token.
- **AB-P2-16 — the ABN never travels through one of OUR URLs.** *(amended, rev 3 — architect design
  pass §14 finding 3. The original wording, "no ABN appears in a query string", was unsatisfiable:
  see the carve-out below.)*
  **(a) Executable clause — our own surfaces.** Given every request this phase adds **that a browser
  makes**, When the URLs, the router definitions and the server access/application logs are
  inspected, Then **no ABN appears in a query string, in a path segment, or anywhere else in a URL**;
  every ABN our API accepts arrives in a **POST body**; and Given an endpoint is called with an ABN
  supplied as a query parameter instead, Then it is ignored or refused — never read from there
  (which would otherwise leak the ABN into logs, browser history and `Referer` headers).
  **(b) Carve-out — the outbound registrar call is out of scope for this criterion.** The ATO ABN
  Lookup JSON web service is **GET-only**, so the ABN and the GUID necessarily ride in the query
  string of the server-to-server request **we make to the registrar**. There is no POST variant to
  switch to. That leg is a TLS call from the Worker to the ATO, is never logged by us
  (AB-P2-8), never reaches a browser, and cannot appear in a `Referer` header — the tester records
  it as designed-and-accepted, **not as a finding**.

---

## 7. The four emails — Sanity templates with Worker fallbacks

**Mechanism (verified, not assumed):** `worker/lib/emailTemplates.ts` loads `emailTemplate`
documents from Sanity **by `_id`, which equals the `templateKey` the Worker sends** (existing
example: `signin_code`, `worker/routes/auth.ts:55-61`). Every send passes a fallback subject and
body inline at the call site, so a Sanity outage or a not-yet-authored template **never blocks a
send**. Successful fetches cache for ~5 minutes; failures are never cached. **Template ids must not
contain a dot** — the public dataset exposes only dot-free ids to anonymous reads.

So all four Phase-2 emails are authored in Sanity Studio and shipped with a fallback. None may name
a percentage; none may name a timeframe (Q2).

| Key | Fires when | Vars | Fallback subject | Fallback body (may be reworded by the ux/ui stage; the constraints are binding) |
|---|---|---|---|---|
| `trade_ack` | An application is created and queues for review | `name`, `business` | We're checking your trade account details | "Thanks — we've got your ABN and business details for {business}. We're checking them and we'll be in touch. Your account works as normal in the meantime." **No timeframe.** |
| `trade_approved` | An application is approved — auto or by ops | `name`, `business` | Your trade account is active | "Your trade account is active. Trade pricing applies to your account from now on. Anything already with us for review will be priced by our team." **No percentage. No claim that an existing quote will be repriced.** |
| `trade_rejected` | Ops rejects an application | `name` | About your trade account application | "We weren't able to set up a trade account from the details you sent. Your account still works exactly as before — you can price jobs, submit them and track them — and you're welcome to apply again with updated details, or reply to this email and we'll help." **Never mentions another account or another ABN holder.** |
| `trade_revoked` | Ops revokes trade status | `name` | A change to your trade account | "Trade pricing no longer applies to your account, so the prices you see from now on are our standard prices. If you think that's a mistake, reply to this email and we'll sort it out." **No percentage, no blame.** |

Every send goes through the existing `notify(...)` path with an `eventType` in the house
dot-namespaced style (e.g. `trade.application.queued`) — the **event** name may contain dots; the
**template id** may not. Registration of the four keys must sit wherever the existing keys are
declared, and `scripts/tests/email-templates.test.mjs` must cover them.

**Deploy note for the owner:** the four `emailTemplate` documents need authoring in Sanity Studio
before or at deploy. A missing document is *safe* (the fallback sends), so it does not block the
deploy — but until they exist, the copy above is what customers read.

---

## 8. Implementation constraints (spec-level; the architect owns the design)

1. **No unauthenticated endpoint accepts an ABN.** Verification is always a session-scoped call
   after `/api/auth/verify` has run; `/api/auth/verify` itself is not modified (handover §4.3).
2. **No auth middleware exists** (handover §4.5) — every new endpoint self-checks with
   `resolveUser` / `resolveStaff`, and the ops endpoints additionally check the assigned-role gate
   that `GET /api/ops/customers` uses today (`hasAssignedRole`, `worker/routes/ops.ts:1402`).
   **Not admin-only** (Q4).
3. **`user.email` UNIQUE is case-sensitive** — every write path normalises with `normEmail` first.
4. **One source of truth for the business-account default.** One named constant/config read by the
   grant path; no second literal `5` anywhere in new code.
5. **The ABR client must be stubbable.** Tests must never touch the live ABR: an injectable
   base URL/fetch seam is mandatory, and the node suites assert against a stub that can be made to
   return active, cancelled, unknown, slow and erroring responses.
6. **Migrations are append-only, numbered after `0053`, additive only, never a table rebuild**; the
   `d1-migration-safety` skill is mandatory reading before writing one, and a production export
   precedes any remote apply.
7. **Rate limits** on verification: one per-account cap and one per-IP cap, both enforced before any
   ABR call (AB-P2-6). Reuse the existing challenge-limit machinery rather than inventing a second.
8. **Inbound ABNs arrive in POST bodies; the outbound ABR GET is the one exception and is never
   logged.** The ATO service is GET-only, so the outbound URL necessarily carries the ABN and the
   `ABR_GUID`. That URL must never be logged, echoed in an error message, returned to a client, or
   reconstructed on any customer or ops surface. No submitted ABN and no credential appears in any
   Worker log line (AB-P2-8, AB-P2-16).
9. **Email template ids are dot-free `snake_case`** and always accompanied by an inline fallback
   (§7).

---

## 9. Data facts this phase adds (spec-level — the architect names the schema)

1. **Trade status on the account** — one of: none, pending, verified, rejected, revoked; plus the
   builder/tradie label. Trade-ness is an axis on `user`, parallel to staff-ness and payability
   (CONTEXT.md invariant 2). **Not** on `organisation`/`membership` (#7).
2. **An application record per attempt** — the frozen submitted ABN, business name, label, the ABR
   snapshot, the queue reasons, the outcome, the deciding actor, timestamps, and a free-text reason
   for a human decision. This is history, not a second home for the ABN (§4.7).
3. **Provenance** — `auto`, `ops`, or `grandfathered`, so AC-P2-40 and AC-P2-51 can distinguish a
   decision someone made from a row a migration wrote.
4. **CONTEXT.md** gains *Trade account / trade-ness* and *Trade application* (architect owns the
   file; the grill already requires the Customer definition to be updated to "anyone with an
   account, private or business").

---

## 10. Test coverage expected

**This phase adds UI to three customer surfaces and one ops surface — node suites alone cannot pass
it** (house rule: the server-served HTML is identical whether or not any of it renders).

**Playwright — `scripts/tests/web/trade-verification.spec.ts` (new), at minimum:**

1. Cold `/trade-account` signup, auto-pass triple (ABR stubbed active + matching) → active state,
   no percentage in the DOM, and a subsequent price preview at the trade rate (AC-P2-1/2/4/5).
2. Cold signup from a gmail address → under-review state, no rejection copy, account usable
   (AC-P2-6, AC-P2-23).
3. Checksum-invalid ABN → inline error, no application created, no ABR call (AC-P2-7).
4. Profile affordance: private account adds an ABN and reaches the same two outcomes; a verified
   account's profile shows status with no editable ABN field (AC-P2-9/10/11).
5. Submit gate: optional ABN empty → submits in one press and never appears in the caption; ABN
   malformed → Submit disabled and named in the caption; ABN valid → submits with no ABR call in
   the request path and shows the acknowledgement; **no builder/tradie control anywhere in the gate**
   (AC-P2-14/15/16/17/18).
6. A verified account at the gate sees no ABN field (AC-P2-19).
7. A percentage sweep across all four advertising surfaces — no `%`-bearing discount copy, no
   subtraction pair (AC-P2-47/48).
8. **No ABN in any browser-made URL** across the whole flow — the network log is inspected for
   query strings and path segments carrying an 11-digit ABN (AB-P2-16a).

**Playwright — ops queue coverage in `scripts/tests/web/ops.spec.ts` (existing harness reused; a
separate `trade-queue.spec.ts` is acceptable if the architect prefers):**

9. A queued application appears with its reasons and ABR snapshot; approve **as a non-admin
   assigned-role staff member** → the customer's account is verified and their next preview is a
   trade price; revoke → back to retail (AC-P2-35/36/37/30, AB-P2-15).
10. Reject → the customer account still works; the decision and reason appear in the account's
    history (AC-P2-38/40).

**node:test — `scripts/tests/trade-verification.test.mjs` (new):**

- The triple against a stubbed ABR: all-pass approves; each single failure queues with its reason;
  responses byte-identical across reasons (AC-P2-20…23, AC-P2-27, AB-P2-7).
- Duplicate rule, including revoked/rejected holders not counting (AC-P2-24, E-P2-8).
- ABR timeout / 5xx / missing GUID → queued, nothing approved (AC-P2-25, E-P2-18).
- Grant and revoke arithmetic: default applied once, negotiated rate preserved, revoke → 0, internal
  accounts never granted (AC-P2-28/29/30/34, AB-P2-14).
- Authorization matrix for every new endpoint: anonymous, customer, cross-customer, manufacturer
  staff, **non-admin assigned-role staff (must succeed)**, admin (AB-P2-1…5, AB-P2-11, AC-P2-37).
- Rate limits, mass assignment, oversized input, ABN-swap refusal (AB-P2-6, AB-P2-1, AB-P2-13,
  AB-P2-12).
- **Credential and ABN containment:** a forced ABR failure (timeout, 5xx, malformed body) produces
  an error response and log output containing neither `ABR_GUID` nor the submitted ABN nor the
  outbound URL; and an ABN supplied as a query parameter to any new endpoint is ignored or refused
  (AB-P2-8, AB-P2-16a).
- The four emails: each event enqueues a send with the right dot-free `templateKey`; with no Sanity
  document the fallback subject/body is used and the send succeeds; with a stubbed authored template
  the authored copy wins; no rendered email contains a percentage or a timeframe (AC-P2-43/44/45/46,
  AC-P2-61…64) — extending `scripts/tests/email-templates.test.mjs` where that suite already owns
  the mechanism.
- Migration behaviour: staff pinned, **the three named addresses** grandfathered (two with no ABN
  written), no other row touched, row counts identical (AC-P2-50…53).

**Unit — `scripts/tests/unit.test.mjs` (existing):** the name-matching and email-domain-plausibility
functions as pure functions, with a table of AU business-name shapes (Pty Ltd, T/A, ampersands,
punctuation, case) and a free-mailbox list (AC-P2-22/23, E-P2-20).

**Existing coverage that must keep passing:** `scripts/tests/api.test.mjs`,
`scripts/tests/web/customer.spec.ts`, `scripts/tests/web/registration.spec.ts`,
`scripts/tests/web/registration-gate-caption.spec.ts`, `scripts/tests/email-templates.test.mjs`,
`scripts/tests/referral-*.test.mjs`, `scripts/tests/web/referral.spec.ts` — edits declared, never
silent (AC-P2-59).

**Test hygiene (handover §4.1, §4.2):** run `npm test` to completion, *then* `npm run test:web` —
never concurrently. Every test and probe mints its own email address and its own `X-Forwarded-For`;
the per-recipient OTP cap is 5 per 15 minutes and a shared address reads as a broken handler.

**Every test artifact named here must exist when implementation ends.** Deciding not to build one is
legitimate; doing it silently is not, and the reason goes to the user when the decision is made.

---

## 11. Suggested build slices (each independently landable and committable)

1. **Verification core + door (a).** ABR client with its stub seam, the triple, the duplicate rule,
   the application record, the grant, the authenticated endpoint, `/trade-account` rebuilt.
   Deployable and demonstrable on its own.
2. **Ops queue + the four emails + revocation.** The queue surface, decisions by assigned-role
   staff, history, audit, the templates and fallbacks, the ABN/status/rate columns on the customer
   record.
3. **Doors (b) and (c) + the migration + the two carried seams.** Profile affordance, the gate's
   optional field, staff pinning and grandfathering the three named accounts, the payout-form
   prefill, the ops contact line.

---

## 12. Decisions needed (owner)

**EMPTY.** Every question raised at revision 1 has been answered:

| # | Question | Owner's ruling (2026-08-19) |
|---|---|---|
| Q1 | Email the customer on revocation? | **Yes** — plainly, no percentage named. Their prices are about to change; a silent revocation reads as a bug. → §4.6, AC-P2-61, `trade_revoked` |
| Q2 | Does the acknowledgement email promise a turnaround? | **No timeframe anywhere.** "We're checking your details and will be in touch." → AC-P2-45, AC-P2-64, `trade_ack` |
| Q3 | Grandfathering — which accounts, identified how? | **Three named addresses at deploy time** (§5.9), never "all rows existing at migration time". Two of the three hold no ABN and are granted by owner decision, recorded as such |
| Q4 | Who may approve / reject / revoke? | **Any assigned-role staff member**, not admin-only; every decision logged with who made it; manufacturer partner accounts excluded → AC-P2-37, AB-P2-11, §8.2 |
| Q5 | Builder/tradie label at the submit gate? | **No.** ABN + business name only there; the label is asked on `/trade-account` and the profile page → §4.4, AC-P2-15 |
| Q6 | Keep the two owner add-ons? | **Keep both** — requested by the owner at the Phase-1 mock gate; they are in the grill's phase cut and handover §3.3 → §2.1.11, AC-P2-54/55 |
| Q7 | Private accounts still payable via the referral payout form? | **Leave it** — D6 unchanged; this phase only stops a *verified* account swapping its ABN there (P2-A4 stands) → §4.7 |

Revision 3's AB-P2-16 amendment is a **correction, not a decision** — the criterion as written could
not be satisfied by any implementation, and its intent (our surfaces, not the registrar's API shape)
is unchanged.

The only owner action item remaining is not a decision: **the four `emailTemplate` documents need
authoring in Sanity Studio before or at deploy** (§7). A missing document is safe — the Worker
fallback sends — so it blocks nothing.

---

## 13. Ambiguities and tensions found in the decision record

Recorded so the architect and the owner can see where I had to interpret rather than transcribe:

1. **"ABN keeps ONE home — the account row" (P2-D2) vs. the ops history requirement (A3) and the
   duplicate rule (D2.1).** History needs a per-attempt record that includes the submitted ABN.
   Resolved in §4.7: the account row is the live fact; the application record is a frozen historical
   copy, the same pattern payouts already use. If the owner reads P2-D2 more strictly than that,
   ops history and duplicate detection both become unbuildable.
2. **Two writers of `user.abn`.** The profile/payout ABN field (existing, D6) and the verification
   flow (new). D2 makes the ABN a verified fact; D6 keeps it free text for payouts. Resolved in
   §4.7 by giving the payout path no granting power and refusing it while verified/pending
   (P2-A4) — **affirmed by the owner at the gate (Q7)**.
3. **Two `5`s.** D4's "business-account default (5)" now lives in code, while migration 0032's
   column `DEFAULT 5` must stay (a rebuild is forbidden). The code constant is the authority; the
   column default remains harmless dead weight, exactly as Phase 1 left it.
4. **P2-D3 ends Phase 1's AC-41 silence.** AC-41 asserted "no trade copy anywhere" over surfaces
   this phase now deliberately adds trade copy to. AC-P2-49 supersedes it on four named surfaces and
   requires the Phase-1 Playwright assertions to be updated openly, citing this spec.
5. **"Never a hard block" (D2.1) is a knowingly accepted risk.** Ops can approve a duplicate ABN;
   combined with the borrowed-ABN case (AB-P2-9) that means ABN *ownership* is never proven by this
   system. The controls are visibility, human order review, and revocation — stated plainly rather
   than implied.
6. **The handover's "ABR benefits payout validation for free" vs D6's "no referral code changes".**
   Referral payability stays on the checksum-only test. If the owner later wants payouts gated on a
   live ABR check, that is a separate small ticket, not a silent extension of this phase.
7. **The Phase-2 scope list handed to me omitted the two owner add-ons** that the grill's phase cut
   and handover §3.3 both place in Phase 2. Raised at the gate and **confirmed in scope** — not a
   descope.
8. **Grandfathering is not verification.** Two of the three grandfathered accounts have no ABN. The
   spec grants them trade status on the owner's authority (D4) and labels the provenance
   `grandfathered` so no later reader mistakes them for accounts that passed the triple.
9. **My own AB-P2-16 was unsatisfiable** (rev 1–2): the ATO service is GET-only, so "no ABN in a
   query string" could never hold for the outbound leg. Caught by the architect's design pass, not
   by me. Amended in rev 3 into an executable clause plus a named carve-out — the lesson being that
   a security criterion must name the *boundary* it governs, not just the forbidden shape.

---

## 14. Assumptions register (`ASSUMED:` — vetoable at any later gate)

| Tag | Assumption | Where | Status |
|---|---|---|---|
| `ASSUMED: P2-A1` | An ABN entered at the submit gate must not block or delay submission: verification runs asynchronously after the quote submits. My refinement — a **malformed** ABN does block Submit and is named in the caption, because silently discarding what someone typed is worse and Phase 1 forbids an unexplained disabled Submit | §4.4, AC-P2-16/17 | carried from the decision record; assumed, unvetoed |
| ~~`ASSUMED: P2-A2`~~ | No builder/tradie label at the gate; ABN + business name only | §4.4, AC-P2-15 | **DECIDED — owner, Q5** |
| `ASSUMED: P2-A3` | The customer is never told which criterion sent their application to review | §4.5, AC-P2-27, AB-P2-7 | assumed, unvetoed |
| `ASSUMED: P2-A4` | `user.abn` cannot be written through the profile/payout path while the account is trade-verified or has an application pending | §4.7, AB-P2-12, E-P2-19 | assumed; **affirmed by the owner at Q7** |
| `ASSUMED: P2-A5` | Approval never overwrites an ops-negotiated rate on an already-verified account; revocation always sets 0 | §4.6, AC-P2-29/30 | assumed, unvetoed |
| `ASSUMED: P2-A6` | No scheduled re-verification of approved ABNs in this phase | §2.2, E-P2-10 | assumed, unvetoed |
| `ASSUMED: P2-A7` | Trade status reaches the client as a status only; no endpoint ever serves `discount_percent` to a customer, and revocation takes effect on the next request rather than needing a re-login | AC-P2-47, AB-P2-15 | assumed, unvetoed |
| ~~`ASSUMED: P2-A8`~~ | An acknowledgement email is sent when an application queues | AC-P2-45, §7 | **DECIDED — owner, Q2** (sent; names no timeframe) |
| `ASSUMED: P2-A9` | The ops queue lives inside the existing Customers area with a pending count visible from the console landing surface; the exact placement is the ux/ui stage's call, its existence and the count are not | AC-P2-35 | assumed, unvetoed |
| `ASSUMED: P2-A10` | One pending application per account; re-submitting while pending is refused with the current status rather than creating a second row | §4.4, AC-P2-12, E-P2-5 | assumed, unvetoed |
| `ASSUMED: P2-A11` | A rejected application never revokes an existing trade status; only an explicit revoke does (relevant when a verified account re-applies with a new ABN) | E-P2-6 | assumed, unvetoed |
| `ASSUMED: P2-A12` | The fallback email copy in §7 — wording is mine; the constraints on it (no percentage, no timeframe, no mention of another ABN holder) are owner rulings and are **not** assumptions. The ux/ui/copy stage may reword within those constraints | §7 | assumed, unvetoed |

Grill assumptions **A1 (guest flow untouched)**, **A2 (details at the gate)**, **A3 (a rejected
application leaves a working private account, emailed outcome, re-application allowed, ops sees
history)** and **A4 (no SMS)** remain live and are honoured by this spec.

---

## 15. Edge cases

| # | Situation | Required behaviour |
|---|---|---|
| E-P2-1 | ABN typed with spaces (`51 824 753 556`) or leading/trailing whitespace | Normalised to 11 digits before validation, storage, duplicate comparison and display formatting |
| E-P2-2 | ABR is reachable but slow | The lookup is bounded by a timeout; on expiry the application queues (`abr_unavailable`). No user-facing request hangs on ABR |
| E-P2-3 | ABR returns an entity with several trading names | The name match is attempted against the entity name **and every** trading/business name; a match on any of them satisfies criterion 2 |
| E-P2-4 | Entity active but the ABN is a branch/GST-only variation | Treated as active; GST registration is **not** a criterion |
| E-P2-5 | Applicant applies twice in a row | One pending application per account: the second attempt is refused with the current status shown (P2-A10), not silently duplicated |
| E-P2-6 | Approved account applies again with a **different** ABN | Allowed, treated as a new application; trade status and pricing are **retained** while it is pending; if it is rejected ops decides whether to revoke (never automatic, P2-A11) |
| E-P2-7 | Rejected applicant re-applies with corrected details | Allowed; new application record; the earlier decision stays in history (A3) |
| E-P2-8 | The other holder of a duplicate ABN was revoked or rejected | Not a duplicate — only a **currently verified** holder triggers `duplicate_abn` |
| E-P2-9 | Grandfathered account has no ABN on file (two of the three) | Trade-verified with provenance `grandfathered`; the ops record says "no ABN on file" rather than showing blank, and nothing invents a value |
| E-P2-10 | Approved entity later lapses on ABR | Not detected in this phase (no re-check job, P2-A6). Ops revokes when it comes to their attention — and the customer is emailed (Q1) |
| E-P2-11 | Customer's sign-in email changed by ops after approval | No re-verification, no status change; the email-domain criterion was evaluated at decision time and is recorded in the snapshot |
| E-P2-12 | Account is trade-verified and its GST mode is `ex` | Unchanged behaviour: mode governs display, trade status governs price. The two never interact |
| E-P2-13 | Anonymous visitor on `/trade-account` hits the OTP rate limit (5 per address / 15 min, handover §4.2) | The Phase-1 copy for E2 applies; the entered ABN/business values survive the failure |
| E-P2-14 | Customer abandons `/trade-account` after the OTP but before submitting the ABN | A working private account exists with a NULL name handled by the Phase-1 `NameStep` rules; no application exists; the profile affordance (door b) picks them up |
| E-P2-15 | Verification succeeds while the customer has a draft mid-configuration | Live previews price at the new rate on the next preview; **no stored line is rewritten** (AC-P2-31). This is normal live pricing, not repricing |
| E-P2-16 | Customer submits a quote with an ABN, and it is approved before ops reviews the quote | Ops reviews and prices at the current (trade) rate — P2-D4's intended path; nothing automatic happens to the submitted quote |
| E-P2-17 | Two staff open the same queued application and both decide | First decision wins; the second gets 409 (AC-P2-39) with the recorded outcome shown |
| E-P2-18 | ABR GUID missing in a preview/dev environment | Every application queues (`abr_unavailable`); the console warns once at startup; no crash, no fallback to "approve" |
| E-P2-19 | Customer with a pending application opens the referral payout form | The ABN field is pre-filled but the write is refused while pending (P2-A4); the form explains that the ABN is being checked |
| E-P2-20 | Business name given as a trading style ("Smith Bros") vs the ABR legal name ("SMITH BROTHERS PTY LTD") | Fuzzy matching is expected to pass this; where it does not, the outcome is a queue entry, never a rejection — the cost of a weak matcher is ops time, never a lost customer |
| E-P2-21 | Sanity is down when an outcome email fires | The fallback subject/body sends (AC-P2-46); the failure is not cached, so the next send retries the fetch |

---

## 16. Security gate

This feature touches auth, financial/business PII and a privilege grant that changes pricing, so
before PM acceptance the orchestrator runs the `security-review` skill on the branch and routes any
finding to the developer (CLAUDE.md, defence-in-depth layer 5). The abuse cases in §6 are executed
by the tester for real — attempted, refused, recorded — not reasoned about.
