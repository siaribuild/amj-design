# User registration Phase 1 — independent test report

Tester: tester agent. Date: 2026-08-18.
Branch: `feat/user-registration`, pinned at **`5fa5f0a6`** (tree clean at start).
Verified against: `docs/specs/user-registration-phase-1.md` (revision 3),
`docs/specs/user-registration-phase-1-design.md` §16 (revision 2),
`docs/mocks/registration-phase-1-submit-gate.html`.

---

## 0. Verdict

# FAIL

**One MAJOR finding**, on the most common journey in the feature: a returning customer with a
complete account reaches the review screen with **Submit disabled and nothing on the screen saying
why**. Everything else is in excellent shape — 56 of the 57 criteria carry direct evidence, all 14
abuse cases were executed for real against a running Worker and every one was refused, and both
suites are green.

- `npm test` — exit 0. `npm run test:web` — **94 passed**.
- **42 of 43 functional criteria PASS with direct evidence; 1 FAILS (AC-14). 0 gaps.**
- **14 of 14 abuse cases attempted for real and refused** against a running Worker + seeded D1.
  Independently of the developer's suite I also ran 13 node edge probes (P1–P13) and 5 browser
  probes (B1, B1b, B2, B3, B4): sixteen confirmed correct behaviour the suite does not assert; two
  (B1, B1b) exposed the finding.
- A red permanent test is attached: `scripts/tests/web/registration-gate-caption.spec.ts`.

---

## 1. Suite tallies

| Command | Result | Notes |
|---|---|---|
| `npm test` | **exit 0 — all green** | typecheck gate + 22 node suites. Tallies captured for the tail of the chain: `test:referral` **129/129**, `test:registration` **10/10**, `test:api` (`api.test.mjs` + `api-edge.test.mjs`) **58/58**. Duration ≈ 18 min. The known flake ("accept and request-changes race has exactly one workflow winner") **passed** under full-battery load; no rerun needed. |
| `npm run test:unit` (re-run alone for its tally) | **79/79 pass** | includes the four new validator tables: `isValidAuPhone`, `one AU phone normaliser`, `submitMissing`, `detailsPatchProblems`. |
| `npm run test:web` | **94 passed** (8.8 min) | run strictly after `npm test`, never concurrently. Covers `registration.spec.ts` (13 tests incl. the isolated AC-12 Turnstile server) and both frozen specs — `customer.spec.ts:383` "signing in re-resolves the current project without a reload" and `referral.spec.ts`. |
| tester node probe harness (own Worker + seeded D1) | **all pass** | independent execution of AB-1…AB-14 (§4) plus edge probes P1–P13 (§5.1) |
| tester browser probes (against `scripts/tests/web-server.mjs`) | **3 pass, 2 fail** | B2/B3/B4 pass; **B1 and B1b fail** — Finding 1 (§5.2) |
| `npx playwright test scripts/tests/web/registration-gate-caption.spec.ts` | **1 failed (red by design)** | the finding's reproducing test, written by me and handed to the developer |

---

## 2. Named test artifacts — existence and wiring

| Artifact named by the design/spec | Exists | Wired |
|---|---|---|
| `scripts/tests/registration.test.mjs` | YES (505 lines) | YES — `test:registration` added to `package.json` and inserted into the `test` chain before `test:api` |
| `scripts/tests/web/registration.spec.ts` | YES (684 lines) | YES — picked up by `testMatch: "**/*.spec.ts"` under `scripts/tests/web` |
| Unit validator tables (`isValidAuPhone`, `submitMissing`, `detailsPatchProblems`) | YES | YES — `scripts/tests/unit.test.mjs` (4 new tests, exports added to the esbuild bundle) |
| `completeAccount` helper | YES — `scripts/tests/helpers.mjs` (`COMPLETE_ACCOUNT` + `completeAccount`) | Used by `registration.test.mjs`, `api.test.mjs`, `referral-pricing.test.mjs`, `delivery.test.mjs` |
| `worker/lib/account.ts` (single write path) | YES | YES — `worker/routes/auth.ts` `/profile` |
| `src/data/phone.ts`, `src/data/accountDetails.ts` | YES | YES — imported by both worker and browser |
| `src/components/NameStep.tsx`, `src/components/OtpSignIn.tsx` | YES | YES — `App.tsx` LoginPage + `inShell`; `QuoteReviewSubmit` |
| `migrations/0053_user_account_address.sql` | YES — additive `ADD COLUMN` only, no rebuild | numbered after the highest existing (0052) |

---

## 3. Per-acceptance-criterion evidence

Legend: **PASS** = direct evidence (a named test I ran, or a probe I executed).
**GAP** = nothing covers it, or only weaker proxy evidence exists. **FAIL** = criterion not met.

| AC | Evidence | Verdict |
|---|---|---|
| AC-1 anonymous draft, no prompt | Untouched paths; `registration.spec.ts` "the gate runs sign-in then details…" builds a draft anonymously via `PUT /api/projects/current/lines` and reaches the review screen with no sign-in surface (`expect(page.getByLabel("Email")).toHaveCount(0)` at stage 0). Probe: anonymous `anonDraft()` succeeds with no session. | PASS |
| AC-2 live price preview, no auth | No diff to the pricing/preview path; `getDeliveryEstimate` still called pre-gate (`QuoteReviewSubmit.tsx:262-269`). `quote-project.spec.ts` T-C2 exercises the anonymous review screen. | PASS |
| AC-3 anonymous upload | No diff to upload routes. `api-edge.test.mjs` upload cases unchanged in meaning. | PASS |
| AC-4 honest sign-in copy | `App.tsx:313` → "Sign in or create account"; `LoginPage` → `OTP_COPY.login`; `App.tsx:1363` guest-quote clause deleted. Site-wide grep for "no account" claims: every survivor is about *pricing/estimates/tracking*, none about submission (seven survivors read in context: `App.tsx` 712/838/1589/1694, `ContactPage` 176/240/352, `PostPage` 247, `ReferPage` 326). `customer.spec.ts:242` asserts the new heading. | PASS |
| AC-5 name NULL at creation | `registration.test.mjs` "AC-5 / AC-9 / AC-10"; probe P8. | PASS |
| AC-6a mandatory name step at /login + shell | `registration.spec.ts` "signing in at /login with a nameless account demands a name before the dashboard"; `App.tsx:2165-2169` interstitial. | PASS |
| AC-6b required empty Full name inside the gate, no name step | `registration.spec.ts` test 1 asserts `getByRole("heading",{name:"What's your name?"})` count 0 and `Full name` value "". | PASS |
| AC-7 NULL name displayed, never written | `toAuthUser` raw/display split (`App.tsx`); `ProfilePage` binds raw `name`; `AccountDashboard`/`AccountShell`/`ContactPage` bind `displayName`. `registration.spec.ts` test 9 asserts `me.user.name` is what was typed. | PASS |
| AC-8 existing name unchanged on verify | `registration.test.mjs` AC-10 block asserts `after.name === seeded.name`; probe P8. | PASS |
| AC-9 customer created at 0% | `registration.test.mjs`; probe P8. | PASS |
| AC-10 pre-existing rows byte-unchanged | `registration.test.mjs` (seeded row stays 5); probe P8. | PASS |
| AC-40 internal created at 0%, existing untouched | `registration.test.mjs` "AC-40"; probe P8 (ops OTP path). | PASS |
| AC-11 gate opens in place, project stays draft | `registration.spec.ts` test 1 (`current.project.status === "draft"` after sign-in). | PASS |
| AC-12 Turnstile widget + disabled Send | `registration.spec.ts` `describe("AC-12 …")` on its own keyed server (deviation D-2). | PASS |
| AC-13 advances straight to details, no submission | `registration.spec.ts` test 1. | PASS |
| AC-14 returning customer: Submit reachable with no further typing/clicking | see **Finding 1** — the details fields are live inputs (asserted), but Submit is **disabled** on arrival because the per-project delivery postcode is empty and nothing on screen says so. | **FAIL** |
| AC-15 submit → `submitted`, guards unchanged, server-confirmed screen | `api-edge.test.mjs` "customer submit: server validates session/state/lines/account…" (all 409/400 guards); `QuoteReviewSubmit.handleSubmit` shows `QuoteSubmitted` only on `result.ok`. | PASS |
| AC-16 contact_* from the account | `registration.test.mjs` "AB-2 / AB-3 / AC-16"; probe AB-3. | PASS |
| AC-17 Submit disabled, outstanding items named | `registration.spec.ts` test 3 asserts the exact caption incl. `full name` first, and that untouched fields carry no error. Met on its own terms (its Given is an *incomplete* account). The caption's silence when the account is complete is filed under AC-14 / design §16.5.4 instead. | PASS |
| AC-18 persisted to the account, pre-filled next time | `registration.test.mjs` AC-18 block (profile store + DTO); `registration.spec.ts` test 2 (prefill). The end-to-end round trip *fill at the gate → next quote pre-filled* is not asserted in one test by the suite — I ran it myself as browser probe **B2** (§5.2) and it passes. | PASS |
| AC-19 edit at the gate persists | `registration.spec.ts` test 2 (phone → `1300 123 456`, asserted via `/api/auth/me`). | PASS |
| AC-42 delivery never seeded from the account address | `registration.spec.ts` test 8 (blank suburb + blank postcode with a complete account address of 3072; entered destination persists; account untouched). | PASS |
| AC-20 valid AU phone forms accepted | `unit.test.mjs` "isValidAuPhone" table (all five AC-20 forms + 1800); `registration.spec.ts` test 4 (browser). | PASS |
| AC-21 invalid refused, project stays draft | `unit.test.mjs` rejection table; `registration.spec.ts` test 4; `registration.test.mjs` AC-17 block (`incomplete_profile`, status still draft). | PASS |
| AC-22 server is the authority | `registration.test.mjs` profile-refusal table + submit floor; probes AB-13, P7. | PASS |
| AC-23 address field errors name the field | `registration.test.mjs` (`fields: ["addressPostcode"]` etc.); probe AB-13. | PASS |
| AC-24 no SMS anywhere | Repo grep for `twilio|sms|messagebird|sinch|vonage` across `worker/`, `src/data/`, `src/components/` — **zero hits**. | PASS |
| AC-25 transfer with no existing draft | `api.test.mjs:129-155` "one draft per customer" first half (unmodified); `customer.spec.ts:383-409` (unmodified). | PASS |
| AC-26 merge, re-resolve, redisplay | `registration.spec.ts` test 7 ("Your quotes have been combined", `Your quote · 2 items`, "Just added" chip). | PASS |
| AC-27 no request against the deleted id | `registration.spec.ts` test 7 (`deadIdRequests.length` unchanged). | PASS |
| AC-28 frozen ranges pass unmodified | `git diff main...HEAD -U0` hunk map for `api.test.mjs` = lines 7, 349, 367-371, 403, 448, 451 — **none inside 129-150**; for `customer.spec.ts` = lines 23, 242, 436-466 — **none inside 383-409**. Both files verified by reading the ranges. | PASS |
| AC-29 referral recorded once at gate signup, ordering intact | `registration.test.mjs` referral block; probe AB-8. `worker/routes/auth.ts:83-121` byte-unchanged apart from an import. | PASS |
| AC-30 existing account + cookie → no referral | `registration.test.mjs`; probe AB-8 second half. | PASS |
| AC-31 attribution failure never costs the sign-in | `registration.test.mjs` (`/r/ZZZ-ZZZ` orphan code → signed in and able to submit). | PASS |
| AC-32 no referral-code input anywhere | `registration.spec.ts` test 6 (stage 0/1/3 DOM selectors); probe AB-9. | PASS |
| AC-33 ex-GST display | `registration.spec.ts` test 5 (`ex GST` visible, `inc GST` count 0). | PASS |
| AC-34 inc-GST display | Same test asserts `inc GST` before sign-in (guest default). | PASS |
| AC-35 flip with no reload | `registration.spec.ts` test 5 asserts `navigations` unchanged across the flip. | PASS |
| AC-36 no discount figure on new surfaces | Grep of the three new components + the two new data modules for `discount|%` — zero hits; `registration.spec.ts` test 6 `forbiddenCopy` regex includes `discount` and `% off`. | PASS |
| AC-37 legacy guest tracking untouched | `api.test.mjs` "a submitted quote is trackable by its OF-Q reference"; `tracking.spec.ts`; probe P12. | PASS |
| AC-38 ops sees the same fields, no new one | Grep: no `address_*`/`addressLine*` in `worker/routes/ops.ts` or `src/ops/`; probe P11 asserts the real ops record JSON carries no account-address key. | PASS |
| AC-39 pricing identical | `pricing-golden.test.mjs` (in `test:referral`) unmodified; `loadAccountDiscount` and the discount step untouched in the diff. | PASS |
| AC-41 no trade-pricing copy or link on new surfaces | `registration.spec.ts` test 6 scoped to `.quote-page`. | PASS |

---

## 4. Abuse-case execution log

Executed by a tester-owned harness (own `vite build` + migrated + seeded D1 + `wrangler dev` on a
free port) — **not** the developer's suite. Every recipient address and every `X-Forwarded-For` was
unique to the probe so no OTP bucket was shared. Each refusal was asserted from the HTTP response
**and** from D1.

| AB | Attempt made | Response recorded | Verdict |
|---|---|---|---|
| AB-1 | `POST /api/projects/:id/submit` holding a valid anonymous **claim cookie** for a complete draft, no session | `401 {"error":"unauthorized"}`; `status_customer=draft` | REFUSED |
| AB-2 | Customer A's session submitting **customer B's project id** | `404 {"error":"not_found"}` — body carries no project data; B's project still `draft` | REFUSED |
| AB-3 | Owner submits with `contact:{name:"Someone Else",email:"victim@example.com",phone:"0400 000 000"}` in the body | `200`; stored `contact_name="Sam Taylor"`, `contact_email=<the session account>`, `contact_phone="0412 345 678"`; **no `victim@example.com` user row was created** | IGNORED (per AC-16) |
| AB-4 | `apertly_guest` tracking grant (inserted straight into `guest_grant` against the draft) submitting | `401 {"error":"unauthorized"}`; still `draft` | REFUSED |
| AB-5 | `POST /api/auth/challenge` for a **seeded** address vs an address with no account, byte-compared (status + full header set + body with the six digits masked) | Byte-identical: `200`, same 9 headers, `{"ok":true,"devCode":"######"}` | INDISTINGUISHABLE |
| AB-6 | 70 challenges from one `X-Forwarded-For` | `429 {"error":"rate_limited"}` from request 61 (cap is 60/hr) | REFUSED |
| AB-7 | 6 wrong codes, then the **correct** code | `400 {"error":"invalid_code"}` ×6, then `400 {"error":"invalid_code"}` for the right code — challenge burned; **no account row created** | REFUSED |
| AB-8 | `/r/PRB-SEA` → create account → sign out → `/r/PRB-SEA` again → sign in again | 1 referral row after creation, **still 1** after the second sign-in | ONE ONLY |
| AB-9 | `referralCode`/`referral_code`/`code` posted as extra body fields to **both** `/api/auth/profile` and `/api/projects/:id/submit` | `200` on both; **0 referral rows** for the smuggler | IGNORED |
| AB-10 | `discountPercent`, `discount_percent`, `type:"internal"`, `role:"admin"`, `referral_code`, `id:"u_demo"`, `email:"victim2@…"`, `session_epoch:99`, `last_verified_at` posted to `/api/auth/profile` | `200`; discount 0→0, type customer→customer, role null→null, email unchanged, epoch 0→0, id unchanged | IGNORED (allowlist) |
| AB-11 | A's session writing B: `POST /api/auth/profile/<B's id>` **and** `POST /api/auth/profile {name:"Hijacked", userId:<B>, id:<B>}` | Path route `404` (no such route exists); body-id write `200` but wrote **A's own row** — B's `name`/`phone` unchanged | REFUSED |
| AB-12 | The **deleted anonymous contract**, in its exact old shape `{contact:{name,email,postcode}}`, no session | `401 {"error":"unauthorized"}`; still `draft`. Plus an independent statement-scoped source sweep of every `.ts` under `worker/`: **exactly one** writer of `status_customer='submitted'` — `worker/routes/quote.ts` | REFUSED |
| AB-13 | 100 KB strings posted as `name`, `addressLine1`, `addressLine2`, `addressSuburb`, `phone`, `addressPostcode`; plus the 120/121-char boundary on `name` | Every one `400 {"error":"invalid_fields","fields":["<the field>"]}`; `name` at 121 refused, at 120 accepted; stored name length 120, nothing unbounded in D1 | REFUSED BY NAME |
| AB-14 | Unauthenticated caller on both endpoints this phase touches | `submit → 401 {"error":"unauthorized"}`; `profile → 401 {"error":"unauthorized"}`, no `user` in the body | REFUSED |

**All 14 refused.** Note on AB-12's source sweep: a *file-scoped* regex flags `worker/routes/ops.ts`
as a second writer — a false positive. `ops.ts` mentions `status_customer = 'submitted'` only in
`WHERE`/`SELECT` clauses (lines 300, 338, 365); its one `UPDATE project SET status_customer=` sets
`'needs_information'` (line 793). The developer's statement-scoped regex is the correct test and I
re-derived the same result independently.

---

## 5. Independent probes

### 5.1 Server-side (tester harness)

| # | Probe | Result |
|---|---|---|
| P1 | An OTP minted for **address A** submitted against **address B** | `400 invalid_code`; no account created for B — PASS |
| P2 | `UPPER@…` then `lower@…` (the `normEmail` seam) | Exactly **one** `user` row, stored lowercase — PASS |
| P3 | Claim-merge when the anonymous draft is **empty** | Exactly one draft survives, the account's existing line is not lost, `current` resolves to the surviving id — PASS |
| P4b | Delivery postcode edge values, one project each | `"   "`→400 `missing_postcode`; `"  3072  "`→200 stored `3072`; `"30 72"`→400 `invalid_postcode`; `"3072\n"`→200 stored `3072`; `"0000"`→**200 stored `0000`**; numeric `3072`→400 `missing_postcode`; `null`→400 `missing_postcode` — all within spec (see Observation O1) |
| P5 | Two **concurrent** submits of the same project | `409 invalid_state` / `200 submitted` — exactly one winner — PASS |
| P6 | Account completed **in another tab**, then the first tab's session submits | Before: `400 incomplete_profile` naming all six fields. After: `200`, and the project stores the values written by the other tab — PASS (the server reads the account fresh, no stale client state can bypass or block) |
| P7 | A stored **non-AU** phone (`+1 555 0100`) written straight to D1, then submit | `400 {"error":"incomplete_profile","missing":["phone"]}`; a `13 12 34` service number then submits `200` — PASS |
| P8 | Creation values, all four paths | New customer `name=NULL` (local part would have been `prb2-creation-msylx1sp-7`), `discount_percent=0`; seeded customer `doni@siaribuild.com.au` `5→5`, name unchanged; new internal `type=internal, discount_percent=0`; an existing internal row set to 7.5 and re-verified stays **7.5** — PASS |
| P9 | Whitespace on the short fields | `"vic "`, `" VIC"`, `"3072 "`, `" 3072"` all `400 invalid_fields` (raw length checked before trim); `" Sam Taylor "` accepted and trimmed — see Finding 7 |
| P11 | AC-38 — the real ops project record + queue JSON | `contactEmail`/`contactName`/`contactPhone`/`deliverySuburb` present; **zero** occurrences of `addressLine1`, `addressSuburb`, `addressState`, `addressPostcode`, `address_line1`, `discountPercent`, `discount_percent` — PASS |
| P12 | AC-37 — legacy guest tracking after the gate | Submit `200` → `OF-Q-10012` → logout → `track/request` `200` with a code issued → `track/verify` `200 {"ok":true}` — PASS |
| P13 | The **account Profile page's own request body** with a stored non-AU phone | `400 {"error":"invalid_fields","fields":["phone"]}`; the unrelated `company` edit in the same patch was lost — see Finding 2 |

### 5.2 Browser-level (tester-owned Playwright probes, run against `scripts/tests/web-server.mjs`)

| # | Probe | Result |
|---|---|---|
| B1 | AC-14 — returning customer, complete account, fresh draft: is Submit reachable with no further typing? | **FAIL.** `[B1] delivery postcode = ""; submit disabled = true; "Still needed" captions = 0` — Finding 1 |
| B1b | Is a disabled Submit ever left without a stated cause? | **FAIL** — no caption rendered. Promoted to the permanent red test |
| B2 | AC-18 round trip: details typed **at the gate** → submit → build a second quote | PASS — all six account fields pre-filled on quote 2, and both delivery fields still blank (AC-42 "not on a fifth") |
| B3 | Enter-key path vs button path | PASS — both write byte-identical account fields, delivery postcode and project status |
| B4 | Second Submit press while the first is in flight | PASS — the button reports "Submitting…" and is disabled; **exactly one** `POST …/submit` was issued |

---

## 6. Findings

### Finding 1 — MAJOR — AC-14 is not met: a returning customer's Submit is disabled on arrival, with no stated cause

**Criterion violated:** AC-14 ("Submit is reachable with **no further typing and no further
clicking**"); design **§16.7** ("Submit is enabled on arrival. **One press submits.**"); design
**§16.5.4** ("Because the button is disabled, the outstanding work is named in a caption directly
above it"); approved mock **Surface 6** ("one-action submit", delivery postcode shown as `3072`).

**Where:**
- `src/components/QuoteReviewSubmit.tsx:392-394` — `submitDisabled` includes `postcode.length !== 4`.
- `src/components/QuoteReviewSubmit.tsx:246-249` — stage `pregate` (the only surface that captures a
  pre-gate postcode) renders only when `user == null`, so a signed-in visitor never sees it.
- `src/components/QuoteReviewSubmit.tsx:271-281` — `carriedPostcode` is set only inside `openGate()`,
  which only stage 0 calls.
- `src/components/QuoteReviewSubmit.tsx:756-760` — the "Still needed:" caption is driven by
  `submitMissing`, which covers **account** fields only; the delivery postcode is never in that set.
- `src/app/App.tsx:1971, 1983` — `storedDelivery` comes from `/api/projects/current`, and a draft
  never carries `delivery_postcode`: it is written by the same statement that leaves `draft`
  (`worker/routes/quote.ts:267-269`), and no path returns a project to `draft`.

**Observed (browser):**
```
[B1] delivery postcode = ""; submit disabled = true; "Still needed" captions = 0
```

**Reproducing test (red, added by me):**
```
npx playwright test scripts/tests/web/registration-gate-caption.spec.ts
  x  a disabled Submit always names what is outstanding
  Error: Submit is disabled and no caption above it says why —
         AC-17 / design §16.5.4 require the outstanding work to be named
  Locator: getByText(/^Still needed:/)   Expected: visible   Received: <element(s) not found>
```
The test's preconditions all pass first: `Full name` = "Sam Taylor", account `Postcode` = "3072",
`Delivery postcode` = "" — so the account genuinely is complete and the blank delivery field is
correct per AC-42.

**Why the developer's suite is green on this.** `registration.spec.ts` test 2 (the returning-customer
journey) types `await page.getByLabel("Delivery postcode").fill("3072")` before pressing Submit, so
it never observes the arrival state; test 8 asserts the field is blank but does not look at the
button. Nothing asserts AC-14's "no further typing" clause.

**Note for the PM/owner, not for the developer to guess.** The test I attached deliberately asserts
only the half that is wrong under *either* resolution — a dead button with no sentence explaining it.
Whether AC-14's "no further typing" should also be restored is an owner call, because it collides
with MG-2/AC-42: the only ways to make Submit live on arrival are (a) give a signed-in visitor the
stage-0 delivery-postcode surface too, or (b) drop the postcode from `submitDisabled` and let the
server's `missing_postcode` refusal carry it. Neither is a tester's decision, and the spec and the
approved mock currently disagree with each other (see §7).

---

### Finding 2 — MINOR — the account Profile page can no longer save anything once a stored phone is not AU-valid

**Standard violated:** undeclared scope expansion onto an existing surface; design §16.5.3's
field-naming error copy is gate-only, so this surface degraded to a generic message.

**Where:** `src/app/App.tsx:1351` (`ProfilePage.saveProfile` posts `phone` on **every** save, read
straight back from the account) → `worker/routes/auth.ts:131-138` →
`src/data/accountDetails.ts:55` now rejects any phone `isValidAuPhone` refuses.
`src/app/App.tsx:1362` maps every failure to `"Couldn't save your changes. Please try again."`,
which names no field — even though the server returned `fields:["phone"]`.

**Reproducing probe (P13), against a running Worker:**
```
UPDATE user SET phone = '+1 555 0100' WHERE email = <account>
POST /api/auth/profile {name, phone: '+1 555 0100', company: 'Acme Pty Ltd', abn: '51824753556'}
  -> 400 {"error":"invalid_fields","fields":["phone"]}
  company after = null      # the unrelated edit in the same patch was lost
```
The account holder sees a generic retry message, retries, and it fails identically forever until they
happen to change the phone field. Production carries 3 accounts so the blast radius is small today,
but nothing stops a legacy or international number.

---

### Finding 3 — MINOR — a design-named error string does not exist, and cannot with the OTP mechanics frozen

**Contract violated:** design §16.3.3 row "Challenge burned / expired" →
**"That code has expired. Send a new one to continue."**

**Where:** `src/components/OtpSignIn.tsx:100-102` maps every `invalid_code` to *"That code didn't
match. Check it and try again, or resend a new one."*

`POST /api/auth/verify` returns the identical `400 {"error":"invalid_code"}` for a wrong code, an
expired challenge and a burned one (`worker/lib/auth.ts:139-156` and `worker/routes/auth.ts:76-81`) —
verified in AB-7, where the **correct** code after the burn also returned `invalid_code`. The client
has no signal to branch on, and D1 forbids changing the OTP mechanics. So this is a design defect
(§16.3.3 specifies a message the architecture cannot produce), not an implementation miss — but a
customer whose code expired is currently told to check the digits.

---

### Finding 4 — MINOR — the panel-level `invalid_fields` message drops the field list the design specifies

**Contract violated:** design §16.5.3 → *"We couldn't save your details — check **{field list}**, then
try again."*

**Where:** `src/components/QuoteReviewSubmit.tsx:357-358` renders
*"We couldn't save your details — check them, then try again."*

The server does return `fields` (proved in AB-13), and the component already owns the
`DetailField → prose` mapping and the `prose()` helper it would need (`QuoteReviewSubmit.tsx:69-106`),
so the list is available and simply not used.

---

### Finding 5 — MINOR — stage-transition focus management is not implemented

**Contract violated:** design §16.9 — *"Stage transitions move focus to the new stage's heading
(`tabIndex={-1}`, focused programmatically) except where a single field is the obvious target."*

**Where:** no heading in `QuoteReviewSubmit.tsx` or `OtpSignIn.tsx` carries `tabIndex={-1}` and none
is focused in an effect. What exists is the exception cases only — `autoFocus` on the email input,
the code input, and the Full name field when it arrives empty (`QuoteReviewSubmit.tsx:605`).

The consequence lands on the **returning** customer and on the **merge** case, which are exactly the
transitions with no obvious field target: after `projectResolving` clears and stage 3 renders, focus
stays wherever it was. The `aria-live` announcement half of §16.9 **is** implemented and is asserted
(`registration.spec.ts` "each stage announces itself…"), so a screen reader hears the change; it just
does not land there.

---

### Finding 6 — MINOR — three regression suites changed beyond the declared deviation

**Standard violated:** design §13 deviation **D-1** sanctions fixture-helper updates in
`scripts/tests/web/referral.spec.ts` only; §10.4 sanctions mechanical **submit call-site** updates
elsewhere. These three go further and none was declared:

- `scripts/tests/referral-lifecycle.test.mjs:110-128` — the append-only **assertion** is rewritten
  (`allMigrations.slice(-N)` → contiguity-at-index plus an ordering check on later migrations).
  Defensible and arguably a better check — the old one made every future feature's first migration a
  referral regression, and `0053` was the first to hit it — but it is an assertion change in a frozen
  suite, not a fixture update.
- `scripts/tests/referral-pricing.test.mjs:128-133, 152, 159` — new `grantStandingDiscount()` arrange
  step; the tests no longer exercise a discount **inherited** from the column default.
- `scripts/tests/api-edge.test.mjs:987-1015` — same, via direct `UPDATE user SET discount_percent = 5`.

Both discount changes follow necessarily from AC-9 and preserve what the tests prove. Nothing here
weakens a property; the finding is that the deviation ledger does not mention them, and D-1's wording
("every referral assertion stays untouched") is now inaccurate.

---

### Finding 7 — TRIVIAL — an over-limit refusal for a 4-character postcode

**Where:** `src/data/accountDetails.ts:53` — `String(raw).length > DETAIL_LIMITS[field]` is applied to
the **raw** value, before the trim on line 52's `value`.

`addressState` (limit 3) and `addressPostcode` (limit 4) are therefore refused for any leading or
trailing space: probe P9 recorded `{"addressPostcode":"3072 "} -> 400 fields=["addressPostcode"]`.
Unreachable from the shipped UI (state is a `<select>`, the postcode input strips non-digits), so no
customer hits it today — but a paste-with-space through any future surface gets "over the limit" for a
value that is exactly at the limit. Moving the length check after the trim costs one line.

---

### Finding 8 — TRIVIAL — dead re-export creates a second import path for a fact that has one home

**House rule:** "One place per fact."

**Where:** `worker/lib/account.ts:93` — `export { AU_STATES, DETAIL_LIMITS };`. Nothing imports either
symbol from `worker/lib/account`; both live in `src/data/accountDetails.ts`, which is where every real
consumer already reads them. They are also unused inside `account.ts` itself.

---

## 7. What made verification ambiguous (spec-level)

1. **AC-14 and AC-42/MG-2 collide, and the approved mock sides with AC-14.** AC-42 forbids seeding
   delivery from the account address; AC-14 requires Submit to be reachable with no further typing.
   For a signed-in visitor with a fresh draft the two cannot both hold, because the delivery postcode
   is required at submit and nothing can supply it. Mock **Surface 6** shows the field carrying
   `3072` with the helper *"Carried over from the postcode you used above"* — but for a customer who
   was signed in from the start there is no "above": design §16.1 gates stage 0 on `user == null`.
   The mock depicts a state the design cannot produce. **This is the root of Finding 1 and it needs an
   owner ruling, not a developer guess.**
2. **Delivery precedence #1 is unreachable as written.** §4.3 / §16.5.2 rank "the project's stored
   `delivery_suburb` / `delivery_postcode`, if it has any" first. Both columns are written only by the
   statement that moves a project out of `draft` (`worker/routes/quote.ts:267-269`), no route returns
   a project to `draft`, and the customer DTO never serves `delivery.suburb` at all
   (`worker/routes/projects.ts:312-314`, mirrored by `App.tsx`'s hard-coded `suburb: null`). The rule
   is therefore inert. Harmless today; it should either be deleted from the spec or the DTO should
   carry the suburb, so the next reader does not trust a precedence that never fires.
3. **AC-6's two satisfaction routes are legible; AC-4's second clause is not testable as written.**
   "No surface **anywhere on the site** claims that submitting a quote does not require an account" —
   I discharged it by grepping every "no account" string in `src/` and reading each in context (all
   seven survivors are about *pricing*, *uploading* or *order tracking*, none about submission), but
   a site-wide negative claim has no mechanical test and design deviation **D-3** already flags it as
   a judgment call.
4. **Design §16.5.3's over-limit copy was deliberately dropped** (commit `ea2b4da6`), with the reason
   recorded in the code (`QuoteReviewSubmit.tsx:313-318`: every input carries `maxLength`, so the
   per-field branch is unreachable from this form). Correct call, well documented in code — but the
   design still lists a string that does not exist, which reads as a miss until you find the commit.

---

## 8. Observations (not findings)

- **O1 — delivery postcode `"0000"` is accepted and stored.** The rule is "four digits"
  (`normalisePostcode`), and `0000` is not an allocated AU postcode; it resolves to the fallback
  delivery zone. Within AC-23 as written and pre-existing behaviour — recorded only so a later phase
  that tightens postcode validation knows it is open.
- **O2 — the known `api.test.mjs` flake did not fire.** "accept and request-changes race has exactly
  one workflow winner" passed under full-battery load; no isolated re-run was needed.
- **O3 — the migration is genuinely additive.** `migrations/0053_user_account_address.sql` is five
  `ALTER TABLE user ADD COLUMN` statements, no rebuild, no `DROP`, no default change — so the
  `ON DELETE CASCADE` hazard the house rule exists for cannot fire. `discount_percent = 0` is achieved
  at both INSERT sites in code instead (`worker/lib/auth.ts:180`, `worker/lib/staff.ts:115`),
  exactly as §7.3 requires.
- **O4 — `ownedProject` was not broadened or narrowed.** The submit route carries its own session
  requirement and leaves the shared helper untouched for its other callers, as §7.1 demands; AB-1 and
  AB-4 prove the claim-cookie and guest-grant paths no longer reach submit.
