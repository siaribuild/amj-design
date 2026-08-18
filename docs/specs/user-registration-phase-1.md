# User registration — Phase 1: Honest registration + the submission gate

Branch: `feat/user-registration`
Status: **revision 2 — the owner answered all five questions of revision 1 (2026-08-18). Delivery
pre-fill and the 13/1300/1800 phone shapes are now DECIDED rather than assumed; new staff accounts
at 0% is IN scope; the ops read-only contact line is OUT (a named Phase 2 seam); Phase 1 says
nothing about trade pricing anywhere. §12 "Decisions needed" is EMPTY.**
Author: product-manager
Date: 2026-08-18

**Grill input:** `docs/specs/user-registration-grill-conclusions.md` (owner grill closed 2026-08-18).
That document is binding. Its *Actors and needs* section is reproduced verbatim in §3; its decisions
ledger (D1–D10) and assumptions (A1–A4) govern wherever this spec is silent.

**Phase cut:** this is Phase 1 of three. Phase 2 (trade verification: ABN/ABR, ops review queue,
builder/tradie labels, staff pinning, grandfathering) and Phase 3 (trade-account page, marketing
surfaces) are **out of scope here** — §6 names the seams they attach to. Deferred tickets T1–T4 are
untouched.

**Owner rulings folded into this revision (revision 1 → 2):**

| Q | Ruling | Effect on this spec |
|---|---|---|
| Q1 | Delivery address **pre-fills** from the account address, editable per quote | §4.3 — `A-P1-1` promoted from assumption to decision |
| Q2 | 13 / 1300 / 1800 service numbers **are** valid contact phones | §7.2 — `A-P1-2` promoted to decision |
| Q3 | New internal/staff accounts **also** start at 0% — the bind-value fix is in Phase 1 | §2.1, AC-40; existing staff rows still pinned in Phase 2 |
| Q4 | The ops read-only contact/address line is **deferred to Phase 2** | Removed from scope entirely; recorded as seam §6.6 |
| Q5 | **Say nothing** about trade pricing in any Phase 1 UI | §2.3, AC-41 |

---

## 1. Problem statement

Two facts about the product today, both verified in code:

1. **Anyone can submit a quote for review without an account.** `POST /api/projects/:id/submit`
   accepts a name, an email and a postcode in the request body (`worker/routes/quote.ts:191-206`)
   and authorises on an anonymous claim cookie (`ownedProject`, `worker/lib/access.ts:174-186`).
   Quote review is the most expensive human time in the business. It is currently spent on whoever
   types anything into three fields.
2. **Registration is dishonest about itself.** The only registration mechanism is first sign-in:
   `POST /api/auth/verify` → `findOrCreateUser` (`worker/lib/auth.ts:146-158`) silently creates the
   account and **invents the person's name from the email local part** (`auth.ts:153`). The site
   tells people "guest quotes don't require an account" (`src/app/App.tsx:1363`) while quietly
   creating accounts, and the account it creates is named "j.smith92".

Third, a pricing leak sits behind both: `user.discount_percent` defaults to **5**
(`migrations/0032_account_discount.sql:21`), so **every self-registered account is created on trade
pricing** — including a private person who typed an email address to get a quote, and including
every internal staff account (`worker/lib/staff.ts:110`).

**The ask, in the owner's terms:** anyone can see a price; a small amount of effort is required
before we spend human time on you. *"An extra minute won't turn away a serious buyer, but it will
turn away someone wandering around."*

### What success looks like

- Nothing changes for someone browsing, configuring, or watching prices update. Anonymity ends at
  one point and one point only: **Submit for review**.
- A person who submits a quote has an account, a verified email, a name they typed themselves, an
  address and a contactable phone number.
- A returning customer submits their second quote without re-typing any of it.
- No account is created on trade pricing by accident — customer or staff.
- The referral attribution seam, the one-draft claim-merge rule, and the OTP anti-enumeration and
  rate-limiting properties are **provably unchanged** by this work.

---

## 2. In scope / out of scope

### 2.1 In scope

1. **Honest sign-in/create UI.** The OTP flow keeps its mechanics exactly (D1) and stops
   misdescribing itself: relabelled entry points, corrected supporting copy, and the person's
   **name collected from the person** instead of derived from their email address.
2. **The submission gate.** `Submit for review` requires a session. Without one, the OTP
   sign-in/create step runs **inline on the submit screen**; the existing claim-merge bridge
   (`claimAnonProjectForUser`, `worker/lib/access.ts:108-138`) attaches the draft; submission then
   proceeds.
3. **Deletion of the anonymous submit path** — the body-supplied identity at
   `worker/routes/quote.ts:191-206`. Identity at submit comes from the session, never the request.
4. **Minimum data to submit:** name, address, phone (AU format validation, format-only — no SMS,
   A4), email (verified by OTP by construction). Collected at the gate when missing (A2), persisted
   on the account, pre-filled thereafter — including pre-filling this project's delivery
   destination from the account address (Q1).
5. **New accounts are created at `discount_percent = 0`** (D4) — **customer accounts
   (`worker/lib/auth.ts:154-156`) and internal/staff accounts (`worker/lib/staff.ts:110`) alike**
   (Q3). Existing rows of either kind untouched.
6. **Migration** adding account address columns to `user` (additive only — §7.3).
7. **GST house rule** on every surface this phase adds or changes (§8).
8. **Abuse-case criteria** (§10) and browser-level coverage (§11).

### 2.2 Out of scope — later phases (seams noted in §6)

- ABN capture, ABR live verification, the auto-pass triple, the ops review queue, outcome emails,
  the one-ABN rule (**Phase 2**, D2/D2.1/D3).
- Builder/tradie self-declared labels (**Phase 2**, D7).
- **Pinning existing staff rows to 0%**, and grandfathering the 3 existing prod accounts as trade
  (**Phase 2**, D4). Phase 1 fixes only the *creation* value (Q3).
- **Any ops surface showing the newly collected phone or address** (**Phase 2**, Q4). The data is
  stored from Phase 1 and displayed by nothing until Phase 2 builds the ops view — deliberate, and
  recorded as seam §6.6 so it is not lost.
- The real trade-account page replacing the mock at `src/app/App.tsx:1675-1734`, and any
  "trade pricing exists" marketing surface (**Phase 3**, D5).
- Deferred tickets: T1 ABN-less private referrers, T2 SMS verification, T3 guest-tracking
  retirement, T4 `organisation`/`membership`.

### 2.3 Out of scope — deliberately untouched

- **Anonymous browsing, draft building, live price previews, autosave, uploads.** Unchanged.
- **The legacy guest tracking flow** (A1, D10). Untouched, including its ability to resolve the 2
  existing anonymous submitted projects in production.
- **Any mention of trade pricing, trade accounts, or applying for either** (Q5). No surface this
  phase adds or changes says anything about it, and no new surface links to the trade mock. The
  existence of trade pricing is advertised in **Phase 3**, once there is something to apply to.
- **Any referral behaviour.** No referral rule, rate, gate or surface changes. **No referral-code
  input field may appear on any form this phase adds** (`worker/routes/referrals.ts:38-49`).
- **Pricing arithmetic.** `loadAccountDiscount` (`worker/lib/estimator/pricing.ts:356-369`) and the
  discount step (`pricing.ts:227-237`) are read, never modified.
- **Existing accounts' `discount_percent` values.** Nothing in this phase writes them.

### 2.4 The accepted window between Phase 1 and Phase 2 — stated plainly

Between the Phase 1 and Phase 2 deploys, **a genuine tradie who registers gets 0% and has no
self-serve path to trade pricing.** There is no trade application to fill in yet; ops can set
`discount_percent` by hand in D1 if it ever matters. Production has 3 customer accounts, all team
test accounts, and near-zero real registration traffic — the owner has accepted this window, and has
ruled (Q5) that Phase 1 says **nothing** about it on any customer surface: advertising an
application that does not exist is worse than silence. It is recorded here so nobody "helpfully"
fixes it inside Phase 1 by defaulting new accounts to 5 again, or by adding a "coming soon" notice.

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

**What Phase 1 serves for each actor** (the phase cut against the needs above):

| Actor | Served in Phase 1 | Deferred |
|---|---|---|
| Private customer | Anonymous browsing/pricing untouched; one-minute OTP account at the point of submission; a name they typed; their quote reaches a human with real contact details | — |
| Tradie / Builder | Same account creation path; details captured once and pre-filled thereafter | Trade pricing (Phase 2 — see §2.4), ABN, the builder/tradie label |
| Ops (staff) | Every new submission carries a verified email, a real name, an address and a phone; time-wasters filtered at the door; a newly created staff account no longer carries a customer discount (Q3) | Seeing the new phone/address on an ops screen (Q4); the review queue, ABN visibility, revocation, pinning of existing staff rows |

---

## 4. The flow, as the person experiences it

### 4.1 Anonymous, before the gate — unchanged

Browse → configure → live prices → autosave draft → upload documents. No account, no prompt, no
change of any kind. The claim cookie continues to hold the draft.

### 4.2 The gate

The customer presses **Submit for technical review** on the review screen
(`src/components/QuoteReviewSubmit.tsx`).

**Without a session,** the contact panel on that screen is replaced by a two-step, in-place
sign-in/create:

1. **Email** — one field, the Turnstile widget when `TURNSTILE_SITE_KEY` is configured (the
   existing `/api/auth/challenge` requirement, `worker/routes/auth.ts:46-49`), and honest framing:
   this creates an account if they don't have one.
2. **Code** — the six-digit OTP, verified through the unchanged `POST /api/auth/verify`.

On success the page **does not auto-submit**. It advances to **Your details** (§4.3) with everything
the account already knows pre-filled. Submission remains the customer's deliberate act.

**With a session,** the sign-in steps do not appear at all — the screen goes straight to
**Your details**, pre-filled.

### 4.3 Your details — the minimum to submit (D9, A2)

| Field | Source of truth | Required | Validation |
|---|---|---|---|
| Full name | `user.name` | yes | non-empty after trim |
| Email | `user.email` | — | not editable here; verified by OTP by construction |
| Phone | `user.phone` | yes | AU format (§7.2), format-only (A4) |
| Address (line 1, line 2 optional, suburb, state, postcode) | `user.address_*` (new, §7.3) | yes except line 2 | non-empty; postcode 4 digits; state one of the 8 AU values |
| Delivery suburb + postcode for **this project** | `project.delivery_suburb` / `project.delivery_postcode` (existing) | yes | unchanged from today |

Pressing **Submit for technical review** persists any changed account fields, then submits.

**The account address and the project's delivery destination are different facts and stay in
different places** (house rule: one place per fact). **DECIDED (Q1):** the delivery fields
**pre-fill from the account address** when they are empty, and stay editable per quote — a tradie's
delivery address is a site, not their office.

### 4.4 After a first-ever sign-in, wherever it happens

A newly created account has **no name** (§7.1). The client shows a single mandatory **"What's your
name?"** step immediately after verification — at the gate, at `/login`, anywhere `verify` reports a
created account — and saves it through the existing `POST /api/auth/profile`.

### 4.5 The claim-merge collision — the customer sees what will be submitted

Signing in at the gate runs `claimAnonProjectForUser`. If the person already had a draft, **the
anonymous draft's lines are merged into it and the anonymous project row is deleted**
(`worker/lib/access.ts:114-133`) — the project id the submit screen was holding no longer exists.

The screen must therefore **re-resolve the current project after sign-in** and **redisplay the
merged line list and totals** before submission. The customer submits what they can see, never a
list that changed underneath them.

---

## 5. Acceptance criteria

Every criterion is independently verifiable. **AC-n** are functional; **AB-n** (§10) are abuse cases
the tester must *attempt* and see refused. AC-40 and AC-41 were added in revision 2 and are numbered
after the existing set so no earlier id moves.

### 5.1 Anonymity before the gate is unchanged

- **AC-1** — Given a visitor with no session and no claim cookie, When they open the quote builder
  and configure a line, Then a draft is created and priced exactly as today, with no sign-in prompt
  and no account created.
- **AC-2** — Given an anonymous visitor with a draft, When they change a configuration, Then the
  live price preview responds as it does today, with no authentication request in the network log.
- **AC-3** — Given an anonymous visitor, When they upload a document to the draft, Then the upload
  succeeds without a session, as today.

### 5.2 Honest registration

- **AC-4** — Given a visitor at the sign-in surface, When the page renders, Then its heading, its
  primary action and its supporting copy state that entering an email will **sign in or create an
  account**, and no surface anywhere on the site claims that submitting a quote does not require an
  account.
- **AC-5** — Given an email address with no existing account, When the OTP is verified, Then a
  `user` row is created with **`name` NULL** — the email local part is never written to `name`.
- **AC-6** — Given a just-created account, When verification completes, Then the customer is shown a
  mandatory single-field name step, and cannot reach the dashboard or the submit action until a
  non-empty name is saved.
- **AC-7** — Given an account whose `name` is NULL, When any customer surface displays the person's
  name, Then it falls back to a display-only derivation (email local part) and **never writes that
  value to the database**.
- **AC-8** — Given an existing account with a name, When the OTP is verified, Then no name step is
  shown and the stored name is unchanged.
- **AC-9** — Given a newly created **customer** account, When its row is read, Then
  `discount_percent` is **0**.
- **AC-10** — Given an account that existed before this phase's deploy, When the migration and the
  new code are applied, Then its `discount_percent` is byte-for-byte what it was — customer and
  internal rows alike.
- **AC-40** *(revision 2, Q3)* — Given a newly created **internal/staff** account
  (`findOrCreateInternalUser`, `worker/lib/staff.ts:79-115`), When its row is read, Then
  `discount_percent` is **0**; and Given an **existing** internal account that is promoted or
  re-verified, When that path runs, Then its `discount_percent` is left exactly as it was — pinning
  existing staff rows is Phase 2.

### 5.3 The submission gate

- **AC-11** — Given an anonymous visitor with a complete, submittable draft, When they press Submit
  for technical review, Then the sign-in/create step appears in place on the review screen, and the
  project's `status_customer` is still `draft`.
- **AC-12** — Given the gate's email step with `TURNSTILE_SITE_KEY` configured, When it renders,
  Then the Turnstile widget is present and the Send-code action is disabled until a token exists.
- **AC-13** — Given the gate's code step, When a correct code is entered, Then a session is
  established, the screen advances to **Your details**, and **no submission has occurred**.
- **AC-14** — Given a signed-in customer with a complete profile, When they reach the review screen,
  Then no sign-in step is shown, the details are pre-filled from their account, and Submit is
  enabled without further typing.
- **AC-15** — Given a signed-in customer, When they submit, Then the project moves to
  `status_customer = 'submitted'` exactly as it does today (state guards, line readiness, duplicate
  codes, AI-generation checks all unchanged), and the confirmation screen is shown only on a
  server-confirmed submission.
- **AC-16** — Given a submitted project, When the persisted contact fields are read, Then
  `contact_name`, `contact_email` and `contact_phone` hold **the account's** values, and no value
  supplied in the request body was used.
- **AC-17** — Given a signed-in customer whose account is missing name, phone or address, When they
  reach the review screen, Then Submit is disabled until each missing field is filled, and the
  missing ones are individually identified.
- **AC-18** — Given the details step, When the customer fills the fields and submits, Then the
  values are persisted on the **account**, and on their next quote every one of them is pre-filled.
- **AC-19** — Given a customer who edits a pre-filled field before submitting, When the submission
  succeeds, Then the edited value is persisted to the account (the gate is the account's editing
  surface as well as its collection surface).
- **AC-42** *(revision 2, Q1)* — Given an account with a stored address and a project whose delivery
  suburb/postcode are empty, When the customer reaches the details step, Then the delivery fields are
  **pre-filled from the account address**; and When the customer overwrites them and submits, Then
  the project stores the overwritten delivery destination and **the account address is unchanged**.

### 5.4 Phone and address validation

- **AC-20** — Given the phone field, When a valid AU number is entered in any common form
  (`0412 345 678`, `+61 412 345 678`, `(03) 9000 0000`, `1300 123 456`, `13 12 34`), Then it is
  accepted (Q2).
- **AC-21** — Given the phone field, When an invalid value is entered (`12345`, `abc`,
  `0000000000`, an 11-digit number), Then submission is refused with a message naming the phone
  field, and the project stays `draft`.
- **AC-22** — Given a request that bypasses the browser, When it carries an invalid phone, Then the
  **server** refuses it — client validation is advisory only.
- **AC-23** — Given the address fields, When suburb, state or a 4-digit postcode is missing or
  malformed, Then submission is refused with the specific field named, and the project stays
  `draft`.
- **AC-24** — Given no SMS provider is configured anywhere in this phase, When a phone number is
  accepted, Then no verification message is sent and no verification state is stored (A4).

### 5.5 Claim-merge and the moving draft

- **AC-25** — Given an anonymous draft and an account with **no** existing draft, When the customer
  signs in at the gate, Then the anonymous project is transferred to them (id unchanged) and the
  review screen shows the same lines it showed before sign-in.
- **AC-26** — Given an anonymous draft and an account that **already has** a draft, When the
  customer signs in at the gate, Then the anonymous lines merge into the existing draft, exactly one
  draft remains for that customer, and the review screen **re-resolves and displays the merged line
  list and totals** before submission is possible.
- **AC-27** — Given the merge case above, When the customer then submits, Then the merged project is
  the one submitted, and no request is made against the deleted project id.
- **AC-28** — Given the existing regression suites, When this phase is complete, Then
  `scripts/tests/api.test.mjs:129-150` ("one draft per customer") and
  `scripts/tests/web/customer.spec.ts:383-409` ("signing in re-resolves the current project without
  a reload") **both still pass unmodified**.

### 5.6 Referral seam preserved

- **AC-29** — Given a visitor who arrived via `/r/<CODE>` and holds an `of_ref` cookie, When they
  create their account **inside the submit gate**, Then exactly one referral row is recorded, the
  `of_ref` cookie is cleared, the claim-merge runs after attribution, and the session is created
  last — the ordering at `worker/routes/auth.ts:88-119` is unchanged.
- **AC-30** — Given a customer with an **existing** account and an `of_ref` cookie, When they sign
  in at the submit gate, Then **no** referral is recorded (the `created` branch is not taken) and
  the cookie is left to expire, exactly as today.
- **AC-31** — Given attribution throws for any transient reason during a gate sign-in, When the
  request completes, Then the customer is still signed in and can still submit — attribution is
  never worth a sign-in (`worker/routes/auth.ts:90-105`).
- **AC-32** — Given every form and screen this phase adds or changes, When their DOM is inspected,
  Then **no referral-code input field exists on any of them**, and no endpoint added or changed in
  this phase accepts a referral code.

### 5.7 GST display

- **AC-33** — Given a signed-in customer with `price_gst_mode = 'ex'`, When any price appears on a
  surface this phase adds or changes, Then it is displayed GST-exclusive with the ex-GST suffix.
- **AC-34** — Given the same customer with `price_gst_mode = 'inc'`, When the same surfaces render,
  Then every price is GST-inclusive with the inclusive suffix.
- **AC-35** — Given an anonymous visitor on the review screen (mode defaults to `inc`), When they
  sign in inline at the gate to an account set to `ex`, Then the totals panel on that same screen
  switches to ex-GST **without a page reload**.
- **AC-36** — Given any surface this phase adds, When it renders for any account, Then it displays
  no discount percentage and no figure from which one could be derived by subtraction (the existing
  never-disclose rule).

### 5.8 Untouched surfaces

- **AC-37** — Given the legacy guest tracking flow, When a guest looks up one of the existing
  anonymous submitted projects by reference and email, Then it behaves exactly as it does today
  (A1/D10).
- **AC-38** — Given the ops console, When staff open a project submitted after this change, Then
  every field they see today is still populated, and the customer's name/email are the account's —
  **and no new field appears on any ops screen** (Q4: the phone and address are stored and displayed
  by nothing until Phase 2).
- **AC-39** — Given the pricing engine, When any quote is priced before and after this change for an
  account whose `discount_percent` is unchanged, Then every line total is identical.
- **AC-41** *(revision 2, Q5)* — Given every surface this phase adds or changes, When it is read
  end to end, Then it makes **no mention of trade pricing, trade accounts, discounts, or applying
  for any of them**, and contains no link to the trade-account mock
  (`src/app/App.tsx:1675-1734`).

---

## 6. Seams for Phase 2 and Phase 3 (build, don't block)

Recorded so the later phases attach cleanly and so nobody builds them early:

1. **`user` gains address columns** (§7.3) — the account-level address the referral spec's revision
   13 recorded as absent (`docs/specs/referral-program.md`, A15). Phase 2's review flags may use it;
   **this phase adds no flag and no comparison.**
2. **`discount_percent` is written at account creation only** — for customer and internal rows
   alike (Q3). Phase 2 owns every other write: trade verification, pinning **existing** staff rows,
   and grandfathering the 3 prod accounts.
3. **The details step is the natural home of Phase 2's ABN + business name + builder/tradie label.**
   Phase 1 adds none of them and leaves no placeholder.
4. **The trade-account mock (`src/app/App.tsx:1675-1734`) is untouched** — it still discards
   applications, which is Phase 3's problem. Phase 1 must not link to it from any new surface
   (AC-41).
5. **`findOrCreateInternalUser` (`worker/lib/staff.ts:79-115`)** remains the staff creation path;
   Phase 1 fixes its creation value, Phase 2 pins existing rows.
6. **The ops view of the new contact data — DEFERRED, NOT DROPPED (Q4).** From Phase 1 every
   account carries a phone and a full address that **no ops screen displays**. Phase 2 must surface
   them where staff already see the customer (`src/ops/ProjectRecord.tsx:228`, and
   `worker/routes/ops.ts:532` which serves that record). Left undone, the phase collects data nobody
   can act on — the exact failure this feature exists to prevent, deferred by one phase on purpose.

---

## 7. Implementation constraints (spec-level; the architect owns the design)

### 7.1 Identity comes from the session, never the request

`worker/routes/quote.ts` submit must require an authenticated user **whose id owns the project**.
`ownedProject` (`worker/lib/access.ts:174-186`) also authorises a claim cookie and a guest grant and
is shared with other routes — **it must not be broadened or narrowed for other callers**; the submit
route carries its own session requirement. The body-supplied `contact.name` / `contact.email` /
`contact.phone` handling (`quote.ts:191-206`, and the `missing_contact` error) is deleted; the
delivery `suburb`/`postcode` handling stays, because the delivery destination is a per-project fact.

`findOrCreateUser` stops deriving `name` (`worker/lib/auth.ts:153`).

### 7.2 One AU phone validator

Exactly one implementation of "is this a valid AU phone number", reachable from both the Worker and
the browser bundle, reusing the existing `normalizePhone` (`worker/lib/enquiry.ts:18-23`) rather
than adding a second normaliser. **DECIDED (Q2)** — accepted shapes after normalisation:
`0[23478]XXXXXXXX` (10 digits), `1300XXXXXX` / `1800XXXXXX` (10 digits), `13XXXX` (6 digits).
The server is the authority (AC-22).

### 7.3 Migration — additive only, and **no rebuild of `user`**

- Add nullable address columns to `user` (`ALTER TABLE ... ADD COLUMN`), numbered after the highest
  existing migration.
- **`discount_percent = 0` for new accounts must NOT be achieved by rebuilding the `user` table.**
  SQLite cannot alter a column default in place, so "change the default" means a table rebuild —
  and a table rebuild in this database has already fired `ON DELETE CASCADE` and destroyed
  production rows (house rule; `.claude/skills/d1-migration-safety/`). The observable requirement is
  AC-9 and AC-40: **both creation paths write 0 explicitly**
  (`worker/lib/auth.ts:154-156`, `worker/lib/staff.ts:110`). The column default is left as it is,
  harmless once every insert names the value.
- The `d1-migration-safety` skill is mandatory reading before the migration is written, and an
  export precedes any remote apply.

### 7.4 Nothing new is unauthenticated

No endpoint added in this phase is reachable without a session, and no endpoint added in this phase
accepts a subject id — scoping is by session only (the same rule the referral feature holds to).

---

## 8. GST

House rule, restated for this phase: **every price on every customer surface respects the account's
`price_gst_mode`.** Phase 1 adds no new price surface — the review screen already honours the mode
through `useGstMode` / `gstAdjust` / `gstSuffix` — but it adds a **mid-flow identity change** on a
screen that is already showing prices, which is exactly where the rule breaks silently (AC-35). No
new surface displays a discount percentage or any figure from which one is derivable (AC-36).

---

## 9. Edge cases

| # | Situation | Required behaviour |
|---|---|---|
| E1 | OTP email never arrives at the gate | Resend is available; the draft and the claim cookie survive; nothing is submitted |
| E2 | `/api/auth/challenge` returns 429 (IP rate limit, `worker/lib/auth.ts:113-119`) | The gate shows a plain "too many attempts, try again later" message; the draft is untouched; the limit itself is unchanged |
| E3 | Wrong code entered repeatedly | Existing attempt burn (`consumeChallenge`, `auth.ts:123-138`) applies unchanged; the gate reports failure without saying whether the account existed |
| E4 | Customer closes the tab mid-gate after verifying | The account exists (possibly nameless); returning re-enters at the name step, then the details step; the draft is theirs |
| E5 | Customer signs in at the gate with an account that already has a draft | §4.5 / AC-26 — merged, re-resolved, redisplayed |
| E6 | Delivery estimate preview after a merge | Re-fetched against the surviving project id; a stale preview is never shown against a different project |
| E7 | Draft has blocking or unpriced lines | Existing behaviour wins: the customer is sent back to fix them; the gate is not reached |
| E8 | Uploaded documents still being scanned / AI still reading | Existing guards unchanged (`ai_processing`, `virus_status='pending'`) |
| E9 | Account with `price_gst_mode` NULL | Treated as `inc`, as today (`userDto`, `worker/lib/auth.ts:48`) |
| E10 | Legacy submitted projects whose `contact_*` came from the old anonymous path | Untouched and still readable by ops; no backfill |
| E11 | Customer's account address differs from the delivery destination | Both stored, in their own places (§4.3); delivery pre-fills from the account address and stays editable (AC-42) |
| E12 | Over-long input in any new field | Refused or clipped at a stated maximum; nothing unbounded is stored |
| E13 | Two tabs, one signs in at the gate | The other tab re-resolves identity on its next request rather than submitting against a stale project id |
| E14 | A staff (`type='internal'`) account signs in on the customer site | Unchanged by this phase; the gate applies the same rules. A staff account created after this deploy carries 0%, so no staff-priced quote can be produced through it (AC-40) |

---

## 10. Abuse cases — the tester must attempt each one and record the refusal

- **AB-1** — Given a valid anonymous claim cookie for a complete draft and **no session cookie**,
  When `POST /api/projects/:id/submit` is called directly, Then the response is **401** and the
  project's `status_customer` is still `draft`.
- **AB-2** — Given a session for customer A, When A calls `POST /api/projects/:id/submit` with a
  project id owned by customer B, Then the response is **404 (or 403) with no project data in the
  body**, and B's project is unchanged.
- **AB-3** — Given a signed-in customer, When they submit with `contact: { name: "Someone Else",
  email: "victim@example.com" }` in the body, Then the submission either ignores the body identity
  entirely or is refused, and the stored `contact_email` is **the session account's** address — no
  path lets a caller write another person's identity onto a project.
- **AB-4** — Given only a guest-tracking grant (the legacy flow's cookie), When
  `POST /api/projects/:id/submit` is called, Then it is refused — a tracking grant is a read
  capability, never a submit capability.
- **AB-5** — Given the relabelled sign-in surfaces, When `POST /api/auth/challenge` is called with
  an address that **has** an account and one that **does not**, Then the two responses are
  indistinguishable (same status, same body) — the anti-enumeration property is unchanged.
- **AB-6** — Given the IP challenge limit, When more than `MAX_CHALLENGES_PER_IP` codes are
  requested in the window, Then **429** is returned, exactly as before this phase.
- **AB-7** — Given an OTP challenge, When wrong codes are submitted past the attempt cap, Then the
  challenge is burned and `invalid_code` is returned — the relabel changed no limit.
- **AB-8** — Given a visitor holding an `of_ref` cookie who creates an account at the submit gate,
  When the account is created, Then **exactly one** referral row exists for them; and When they sign
  out, sign in again, and submit another quote, Then **still exactly one** — no second attribution.
- **AB-9** — Given any form this phase adds or changes, When a referral code is posted to its
  endpoint as an extra body field, Then it is ignored — no code is accepted anywhere outside the
  existing `/r/<CODE>` link path.
- **AB-10** — Given a signed-in customer, When they POST `discountPercent`, `type`, `role`,
  `referral_code` or `id` to the profile/details endpoint alongside their address, Then those fields
  are ignored and the stored values are unchanged (no mass assignment through the new fields).
- **AB-11** — Given a signed-in customer A, When they attempt to write name/phone/address for
  customer B by supplying a user id in the body or the path, Then it is refused and B's row is
  unchanged — the endpoint accepts **no subject id** (§7.4).
- **AB-12** — Given the deleted anonymous submit path, When a request is crafted in its old shape
  (name + email + postcode, no session), Then it fails; and a code search confirms **no other route
  can move a project to `submitted` without a session**.
- **AB-13** — Given field length limits, When a 100 KB string is posted as the name or an address
  line, Then the request is refused or the value clipped at the stated maximum — nothing unbounded
  reaches D1.
- **AB-14** — Given an unauthenticated caller, When they call any endpoint added in this phase,
  Then they receive 401 and no data.

---

## 11. Test coverage expected

**This phase changes UI, so node suites alone cannot pass it** (house rule: the server-served HTML
is identical whether or not the gate renders).

**Playwright — `scripts/tests/web/registration.spec.ts` (new), at minimum:**

1. Anonymous build → Submit → inline OTP → name step → details → submitted confirmation (AC-11,
   AC-13, AC-6, AC-15).
2. Returning signed-in customer: details pre-filled, no sign-in step, submit in one action (AC-14,
   AC-18).
3. Missing-details case: Submit disabled and each missing field named (AC-17).
4. Invalid phone rejected in the browser; a `1300` number accepted (AC-20, AC-21).
5. GST mode flips to `ex` on the review screen after inline sign-in, with no reload (AC-35).
6. No referral-code field exists anywhere on the gate, and no trade-pricing copy appears on it
   (AC-32, AC-41).
7. The merge case: existing draft + anonymous draft, merged list redisplayed before submit (AC-26).
8. Delivery fields pre-filled from the account address, and an override persisting to the project
   without touching the account (AC-42).

**Existing Playwright coverage that must keep passing unmodified:**
`scripts/tests/web/customer.spec.ts:383-409`, `scripts/tests/web/referral.spec.ts`.

**node:test — worker/data suites:**

- Submit without a session → 401 (AB-1); cross-account submit → refused (AB-2); body-identity
  ignored (AB-3, AC-16); guest grant cannot submit (AB-4).
- New customer account has `name` NULL and `discount_percent` 0 (AC-5, AC-9); new internal account
  has `discount_percent` 0 and an existing internal account is not rewritten (AC-40); existing rows
  unchanged (AC-10).
- AU phone validator unit table, valid and invalid, including 13/1300/1800 (AC-20/21/22).
- Referral attribution at gate signup: exactly once, ordering intact (AC-29, AC-30, AB-8).
- `scripts/tests/api.test.mjs:129-150` unmodified and passing (AC-28).
- Mass-assignment and subject-id abuse cases (AB-10, AB-11).

Every test artifact named here must **exist** when implementation ends. Deciding not to build one is
legitimate; doing it silently is not.

---

## 12. Decisions needed (owner)

**None.** All five questions from revision 1 were answered on 2026-08-18 and are folded into the
body above (see the ruling table in the header). No question remains open on this phase.

---

## 13. Assumptions register

| Tag | Assumption / decision | Where | Status |
|---|---|---|---|
| A1 (grill) | Legacy guest-tracking flow untouched | §2.3, AC-37 | assumed, unvetoed |
| A2 (grill) | Name/address/phone demanded at the submit gate, not at account creation | §4.3 | assumed, unvetoed |
| A4 (grill) | Phone validation is format-only; no SMS | §4.3, AC-24 | assumed, unvetoed |
| ~~`ASSUMED: A-P1-1`~~ | Delivery suburb/postcode pre-fill from the account address, editable | §4.3, AC-42 | **DECIDED — owner, Q1** |
| ~~`ASSUMED: A-P1-2`~~ | 13/1300/1800 numbers are valid contact phones | §7.2, AC-20 | **DECIDED — owner, Q2** |
| ~~`ASSUMED: A-P1-3`~~ | New internal/staff accounts are also created at 0% | §2.1, AC-40 | **DECIDED — owner, Q3** |
| `ASSUMED: A-P1-4` | After OTP at the gate, submission is **not** automatic — the customer presses Submit | §4.2 | assumed, unvetoed |
| `ASSUMED: A-P1-5` | A NULL name is displayed as the email local part, never stored | AC-7 | assumed, unvetoed |

Two assumptions remain live and vetoable at any later gate: **A-P1-4** and **A-P1-5**, plus the
grill's own A1, A2 and A4.
