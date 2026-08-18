# User registration Phase 1 — Acceptance (product-manager, returning stage)

**This is §14 of `docs/specs/user-registration-phase-1.md`**, held in its own file because the
acceptance stage is append-only and this session's tooling could not append in place without
rewriting the spec's earlier sections. Nothing in the spec was modified. Read it as the spec's
final section.

**Date:** 2026-08-19
**Verdict issued against:** branch `feat/user-registration` at **`d30996ab`** (fix round
`cf681290` → `64112ecb` → `d30996ab`); the tester's report
`docs/specs/user-registration-phase-1-test-report.md` (pinned at `5fa5f0a6`); the owner's decisions
ledger `docs/specs/user-registration-grill-conclusions.md` (D1–D10, MG-1/MG-2); and
`docs/specs/user-registration-phase-1.md` at **revision 4** — AC-14 amended on the owner's
2026-08-19 ruling. §5.3's amendment note is authoritative; the spec's header (line 4) still reads
"revision 3" and is stale (see C3).

This verdict is a recommendation. The owner is the product owner and gives final sign-off.

---

## 0. Verdict

# ACCEPTED WITH CONDITIONS

**Counts** — 43 functional criteria (AC-1…AC-42, with AC-6 assessed as its two satisfaction routes
6a/6b) plus 14 abuse cases:

| | Count |
|---|---|
| Criteria **met** with direct evidence | **53** (39 functional + 14 abuse) |
| Criteria met but **evidenced only indirectly** (absence-of-change plus an existing regression test, or a judgment-call grep) | **4** — AC-2, AC-3, AC-4 (second clause only), AC-39 |
| Criteria **not met** | **0** |
| Criteria **silently descoped** | **0** |
| Out-of-scope work that **crept in** | **0 capabilities**; 1 declared collateral repair (§4) |

The single FAIL of the test report — **AC-14** — is met at `d30996ab` under the amended criterion.

---

## 1. Per-criterion outcome

Evidence marked **(post-fix)** was produced or re-run after the fix round; everything else carries
the tester's evidence at `5fa5f0a6`, on code the fix round did not touch.

### Anonymity before the gate

| AC | Verdict | Evidence relied on |
|---|---|---|
| AC-1 | MET | `registration.spec.ts` test 1 reaches the review screen with no sign-in surface; tester's anonymous `anonDraft()` probe |
| AC-2 | MET (indirect) | No diff to the pricing/preview path; `quote-project.spec.ts` T-C2 exercises the anonymous review screen |
| AC-3 | MET (indirect) | No diff to upload routes; `api-edge.test.mjs` upload cases unchanged in meaning |

### Honest registration

| AC | Verdict | Evidence relied on |
|---|---|---|
| AC-4 | MET; second clause indirect | `App.tsx:313` "Sign in or create account", `LoginPage` → `OTP_COPY.login`, the guest-quote claim at `App.tsx:1363` deleted; `customer.spec.ts:242`. The site-wide negative was discharged by reading all seven surviving "no account" strings in context — a judgment call, flagged as such by design deviation D-3 |
| AC-5 | MET | `registration.test.mjs` "AC-5 / AC-9 / AC-10"; probe P8 — `name` NULL, the email local part never written |
| AC-6a | MET | `registration.spec.ts` "signing in at /login with a nameless account demands a name before the dashboard"; shell interstitial `App.tsx:2165-2169` |
| AC-6b | MET | `registration.spec.ts` test 1 — "What's your name?" heading count 0 inside the gate; `Full name` present, required and empty |
| AC-7 | MET | raw/display split in `toAuthUser`; `ProfilePage` binds raw `name`, the shells bind `displayName`; test 9 asserts the stored value is what was typed |
| AC-8 | MET | `registration.test.mjs` AC-10 block (`after.name === seeded.name`); probe P8 |
| AC-9 | MET | `registration.test.mjs`; probe P8 — new customer row at 0 |
| AC-10 | MET | probe P8 — seeded row stays 5, name unchanged |
| AC-40 | MET | `registration.test.mjs` "AC-40"; probe P8 — new internal at 0, an existing internal set to 7.5 and re-verified stays 7.5 |

### The submission gate

| AC | Verdict | Evidence relied on |
|---|---|---|
| AC-11 | MET | `registration.spec.ts` test 1 — gate opens in place, `status === "draft"` after sign-in |
| AC-12 | MET | `registration.spec.ts` `describe("AC-12 …")` on its own keyed server (declared deviation D-2) |
| AC-13 | MET | `registration.spec.ts` test 1 — straight to details, nothing submitted |
| **AC-14 (amended, rev 4)** | **MET (post-fix)** | `registration-gate-caption.spec.ts` test 1, now green: a complete account arrives with every stored value in a live input, **`Still needed: delivery postcode.`** above the disabled Submit, one fill → caption gone → Submit enabled → **Quote submitted**. Caption source: `QuoteReviewSubmit.tsx` `outstanding` (account gaps + the delivery gap, form order). `registration.spec.ts` test 2 carries the "no collapsed summary, no expand-to-edit" half |
| AC-15 | MET | `api-edge.test.mjs` "customer submit: server validates session/state/lines/account…" (409/400 guards); `QuoteSubmitted` rendered only on `result.ok` |
| AC-16 | MET | `registration.test.mjs` "AB-2 / AB-3 / AC-16"; abuse case AB-3 executed for real |
| AC-17 | MET (post-fix, strengthened) | `registration.spec.ts` test 3 — exact caption with `full name` first, untouched fields unmarked; the delivery gap now joins the same list, so the customer reads one list and not two |
| AC-18 | MET | `registration.test.mjs` AC-18 block (profile store + DTO) and `registration.spec.ts` test 2 (prefill); the full round trip was executed as tester probe B2 — see the coverage note in §7 |
| AC-19 | MET | `registration.spec.ts` test 2 — phone edited at the gate, asserted through `/api/auth/me` |
| AC-42 | MET | `registration.spec.ts` test 8 — account address 3072, delivery suburb and postcode both blank; the entered destination persists and the account address is untouched. Probe B2 confirms "not on a fifth" either |

### Phone and address validation

| AC | Verdict | Evidence relied on |
|---|---|---|
| AC-20 | MET | `unit.test.mjs` `isValidAuPhone` table (all five Q2 forms + 1800); `registration.spec.ts` test 4 in the browser |
| AC-21 | MET | unit rejection table; `registration.test.mjs` AC-17 block — `incomplete_profile`, project still `draft` |
| AC-22 | MET | server floor: `registration.test.mjs` refusal table, probes AB-13 and P7 (a non-AU phone written straight to D1 still blocks submit) |
| AC-23 | MET | `registration.test.mjs` (`fields: ["addressPostcode"]` etc.); AB-13 |
| AC-24 | MET | repo-wide grep for every common SMS provider across `worker/`, `src/data/`, `src/components/` — zero hits |

### Claim-merge and the moving draft

| AC | Verdict | Evidence relied on |
|---|---|---|
| AC-25 | MET | `api.test.mjs:129-155` and `customer.spec.ts:383-409`, both unmodified |
| AC-26 | MET | `registration.spec.ts` test 7 — "Your quotes have been combined", `Your quote · 2 items`, "Just added" chips |
| AC-27 | MET | same test — zero requests against the deleted project id |
| AC-28 | MET | tester's `-U0` hunk map: no hunk inside `api.test.mjs:129-150` or `customer.spec.ts:383-409`; both ranges read directly |

### Referral seam

| AC | Verdict | Evidence relied on |
|---|---|---|
| AC-29 | MET | `registration.test.mjs` referral block; `worker/routes/auth.ts:83-121` byte-unchanged but for an import; AB-8 |
| AC-30 | MET | `registration.test.mjs`; AB-8 second half |
| AC-31 | MET | orphan `/r/ZZZ-ZZZ` code → still signed in and able to submit |
| AC-32 | MET | `registration.spec.ts` test 6 across stages 0/1/3; AB-9 |

### GST

| AC | Verdict | Evidence relied on |
|---|---|---|
| AC-33 | MET | `registration.spec.ts` test 5 — `ex GST` visible, `inc GST` count 0 |
| AC-34 | MET | same test — `inc GST` before sign-in (guest default) |
| AC-35 | MET | same test — navigation count unchanged across the flip |
| AC-36 | MET | grep of the new components and data modules for `discount|%` (zero hits); `forbiddenCopy` regex in test 6 |

### Untouched surfaces

| AC | Verdict | Evidence relied on |
|---|---|---|
| AC-37 | MET | `api.test.mjs` OF-Q tracking test; `tracking.spec.ts`; probe P12 end-to-end after a gate submit |
| AC-38 | MET | probe P11 against the real ops project record + queue JSON — no account-address key anywhere; greps of `worker/routes/ops.ts` and `src/ops/` clean |
| AC-39 | MET (indirect) | `pricing-golden.test.mjs` unmodified and green; `loadAccountDiscount` and the discount step absent from the diff |
| AC-41 | MET | `registration.spec.ts` test 6 scoped to `.quote-page` |

### Abuse cases — all 14 attempted for real against a running Worker + seeded D1, all refused

| AB | Verdict | Refusal recorded |
|---|---|---|
| AB-1 | REFUSED | claim cookie, no session → `401 unauthorized`; still `draft` |
| AB-2 | REFUSED | A submitting B's project → `404 not_found`, no project data in the body; B unchanged |
| AB-3 | IGNORED (per AC-16) | body identity discarded; stored contact is the session account's; no victim row created |
| AB-4 | REFUSED | guest-tracking grant → `401`; still `draft` |
| AB-5 | INDISTINGUISHABLE | byte-identical status, nine headers and body for an address with and without an account |
| AB-6 | REFUSED | `429 rate_limited` from request 61 of 70 (cap 60/hr), unchanged |
| AB-7 | REFUSED | six wrong codes burn the challenge; the *correct* code then also `invalid_code`; no account created |
| AB-8 | ONE ONLY | one referral row after creation, still one after a second sign-in |
| AB-9 | IGNORED | referral code smuggled into `/profile` and `/submit` bodies → 0 referral rows |
| AB-10 | IGNORED | allowlist — discount, type, role, email, session epoch and id all unmoved |
| AB-11 | REFUSED | no subject-id route exists; a body-supplied id wrote A's own row, B untouched |
| AB-12 | REFUSED | the old anonymous contract → `401`; statement-scoped sweep finds exactly one writer of `status_customer='submitted'` |
| AB-13 | REFUSED BY NAME | 100 KB strings refused per field; `name` 121 refused / 120 accepted. **Re-pinned post-fix:** the trim-before-length change can only *shorten* a measured value, never lengthen it, and `unit.test.mjs` "the limit applies to the trimmed value, not the keystrokes" now asserts both halves (`3072 ` accepted; 121 chars with padding still refused) |
| AB-14 | REFUSED | unauthenticated caller on both touched endpoints → `401`, no data |

---

## 2. The MAJOR finding, and what now covers it

The tester's Finding 1 was the only unmet criterion: a returning customer with a complete account
met a disabled Submit and an empty caption, because delivery is not an account fact and
`submitMissing` answers only for the account. The owner's 2026-08-19 ruling — **"one field, one
press"**: delivery starts blank on every project because a business customer is never delivering to
the same address twice, the customer types the site, and the caption must name the gap — is folded
into AC-14 (rev 4) and is met at `d30996ab`:

- `src/components/QuoteReviewSubmit.tsx` — `outstanding` composes the account gaps with the delivery
  gap in form order; the caption renders whenever anything is outstanding at the details stage.
- `scripts/tests/web/registration-gate-caption.spec.ts` — the tester's own red test, now green, plus
  a second test added by the fix round that pins the ruling: `Still needed: phone, delivery
  postcode.` for a part-complete account — one list, not two.
- `scripts/tests/web/registration.spec.ts` test 3 — the caption shrinking to `delivery postcode` and
  emptying on the last fill, with Submit flipping to enabled.

I accept the resolution as the right one for the business: it keeps MG-2 intact (no wrong-address
prefill for a tradie) and pays for it with one field the customer was always going to have to think
about — named on screen instead of implied by a dead button.

---

## 3. Silent descoping — none found

Every artifact §11 of the spec named exists and is wired: `scripts/tests/registration.test.mjs`,
`scripts/tests/web/registration.spec.ts`, the unit validator tables, `NameStep`, `OtpSignIn`,
`worker/lib/account.ts`, `src/data/phone.ts`, `src/data/accountDetails.ts`, and
`migrations/0053_user_account_address.sql` (five additive `ADD COLUMN` statements, no rebuild —
the `ON DELETE CASCADE` hazard §7.3 exists for cannot fire).

The one deliberate omission was declared in code with its reason: design §16.5.3's per-field
over-limit string has no branch, because every input carries `maxLength` and the branch is
unreachable from this form (`QuoteReviewSubmit.tsx:330-335`); the server floor still refuses one.
Design §16.3.3's "That code has expired" string was **struck from the design** with the reason
recorded (`/verify` deliberately returns an identical `invalid_code` for wrong, expired and burned —
AB-5/AB-7 depend on it). Both are legitimate decisions taken out loud.

Two spec-text corrections are recorded here rather than treated as misses, because the
implementation follows the governing clause in each case:

1. **§4.3 marks the delivery *suburb* "required: yes"** while its validation column says "unchanged
   from today" — and today the server requires only the postcode (`worker/routes/quote.ts:216, 225`:
   suburb is optional free text, clipped at 80). The implementation follows "unchanged from today",
   and the owner's "one field, one press" ruling confirms that one delivery field is the bar.
   **Correction: the delivery suburb is optional in Phase 1.**
2. **Delivery precedence #1 (the project's stored destination) is dormant by construction** — both
   delivery columns are written only by the statement that moves a project out of `draft`, and no
   route returns a project to `draft`. The code path exists and is correct; it cannot fire today.
   **Correction: precedence #1 is a latent rule, not an observable one, in Phase 1.**

---

## 4. Scope creep — one declared collateral repair, no new capability

No ops surface, referral rule, pricing arithmetic or existing `discount_percent` value was touched
— AC-38, AC-29…AC-32, AC-39 and AB-8/9/10 all carry direct evidence. One existing surface did change
behaviour, and it is a consequence of §7.2's *one* AU phone validator rather than an addition:

**The account Profile page now refuses a save when the stored phone is not AU-valid** (tester
Finding 2). The fix round did not remove the refusal — it made it legible: the message names the
field and states that **nothing was saved** (`App.tsx` `saveProfile`; `ApiError.fields` is now
carried through `src/data/api.ts` instead of being dropped — the Worker was always correct).
Covered by `registration.spec.ts` "a refused profile save names the field that caused it". The
residual business consequence — an account holding a legacy or international number cannot save any
profile change until the phone is corrected — is real, bounded (3 production accounts, all team
test) and is put to the owner as Q2.

Everything else added beyond the bare acceptance criteria (stage badges, the carried-postcode
helper, Enter-to-submit, the `aria-live` stage announcements, focus-on-heading, the merge notice and
"Just added" chips, the GST caption's link to the profile) is interaction-spec work owned by design
§16, which the spec names as the interaction authority. Not creep.

---

## 5. `ASSUMED:` register — audit

| Tag | Shipped as | Ruling |
|---|---|---|
| A1 (grill) — legacy guest tracking untouched | Yes; AC-37 + probe P12 (submit → OF-Q → logout → track/verify) | **No veto warranted.** It restates owner decision D10; recommend ratifying as decided |
| A2 (grill) — details demanded at the gate, not at account creation | Yes; the whole stage-3 form | **No veto warranted.** The owner saw this shape at the mock gate and ruled on it twice (MG-1, MG-2) — ratified by behaviour; recommend recording as decided |
| A4 (grill) — phone format-only, no SMS | Yes; AC-24 grep clean | **No veto warranted.** Deferred ticket T2 already holds the alternative |
| `A-P1-4` — no auto-submit after OTP | Yes; `registration.spec.ts` test 1 asserts the project is still `draft` after verification | **No veto warranted.** Submission stays a deliberate act, which is what "the customer submits what they can see" requires |
| `A-P1-5` — NULL name displayed as the email local part, never stored | Yes; raw/display split, test 9 asserts the stored value | **No veto warranted.** Exposure is momentary — AC-6a's interstitial blocks the account shell until a real name is saved |
| `A-P1-1` — delivery prefill from the account address | **Not shipped**, correctly | The OVERTURNED history in §13 is accurate; shipped behaviour follows MG-2, reinforced by the 2026-08-19 ruling. No action |

None of the five live tags was contradicted by what shipped and none needs a code change. They go to
the owner as one question (Q3) so Phase 1 does not ship carrying unratified assumptions.

---

## 6. Regression-suite edits — rulings

The developer declared three edits to frozen suites rather than hiding them; the tester recorded
them as Finding 6 (a ledger-accuracy finding, not a weakening one). All three were present at
`5fa5f0a6` and therefore inside the last full green battery.

**(a) `scripts/tests/referral-lifecycle.test.mjs:110-131` — assertion change. RATIFIED.**
The property the referral program is entitled to is *append-only*: nothing may be numbered **into**
or **before** the referral set. The old assertion claimed something stronger and different — that
the referral migrations are the **last** files in `migrations/` — which is not a property of the
referral feature at all; it is a claim that no feature may ever add a migration again. Registration's
`0053` was simply the first to collide with it. The replacement keeps the contiguity check (nothing
numbered into the set), keeps the "applied by the migration runner, not by hand" check, and **adds**
an ordering check the original never had (everything after the set must sort higher). Nothing the
referral program relies on is weaker. **Ruling: ratified as the correction of an over-strong
assertion.** Condition: design deviation **D-1**'s wording ("every referral assertion stays
untouched") is now inaccurate and should be corrected in the design's deviation ledger.

**(b) `scripts/tests/referral-pricing.test.mjs:128-133, 152, 159` and
(c) `scripts/tests/api-edge.test.mjs:987-1015` — explicit standing discount. RATIFIED.**
Both tests are about how a *referral* percentage composes with a *standing account* rate. They used
to obtain the standing rate by accident, from the column default that AC-9 deliberately removes.
Left alone they would have gone green while proving nothing — a 0% account cannot demonstrate
composition, and "registered prices below anonymous" would simply have become false. Granting the
rate explicitly makes the arrange state say what the test always meant; no assertion was relaxed and
no property weakened. **Ruling: ratified.** Deliberate recorded consequence: no test now asserts
that a registered account *inherits* 5% — that behaviour was removed by AC-9/AC-40, which are
themselves directly evidenced.

---

## 7. Conditions attached to acceptance

- **C1 — re-run the full gates at the accepted HEAD before any deploy.** Per owner instruction the
  full battery was **not** re-run after the fix round; evidence for the fixes is targeted — 18
  Playwright (`registration.spec.ts` 16 + `registration-gate-caption.spec.ts` 2), 10 registration
  node, 80 unit, typecheck gate, all passing — while the full `npm test` and `npm run test:web` were
  green at `5fa5f0a6`. My assessment of residual risk is **low**: the only post-`5fa5f0a6` change
  with server-visible behaviour is the trim-before-length ordering in `src/data/accountDetails.ts`,
  which can only *accept* a value the previous code refused, never the reverse. That is reasoning,
  not evidence for `d30996ab`, and the deploy protocol requires green gates regardless.
- **C2 — discharge the sensitive-surface security gates before deploy:** the `security-review` stage
  gate (this feature touches auth, session identity and account PII) and a green security-sweep CI
  run on the deployed commit.
- **C3 — clerical:** the spec's header still reads "revision 3" while AC-14 is revision 4. Recorded;
  the next writer of §0–§13 should bump it.
- **C4 — owner ratification of the five live `ASSUMED:` tags** (§5 above).

**Carry-forward (non-blocking, owner's call — Q1):** the same "disabled button, no stated cause"
pattern survives one stage earlier. At stage 0 an anonymous visitor with an empty delivery postcode
sees Submit disabled (`submitDisabled` includes `postcode.length !== 4`) while the only caption on
screen is the friction pre-announcement; the "Still needed:" caption renders at the details stage
only. This is pre-existing behaviour — the pre-gate postcode field is where it was before this phase
(design §16.2 / `UX-1`) — and the field sits directly above the button, so it is materially milder
than Finding 1. But it is the same rule the owner has just ruled on, and no test observes it.

**Coverage observation (no action required):** AC-18's end-to-end round trip — details typed at the
gate, then a *second* quote arriving pre-filled — exists as tester probe B2 and as two separate
committed tests (the node profile-store assertion and the browser prefill assertion), but not as one
permanent test. Worth folding into Phase 2's suite when the ops contact line lands.

---

## 8. What goes to the owner

1. **Q1 — stage-0 caption.** Should the "Still needed:" caption also name the delivery postcode
   *before* the gate opens, so an anonymous visitor never meets a dead button with no stated cause?
   *Recommendation: yes — one small change through the developer loop before deploy, consistent with
   the ruling just made.*
2. **Q2 — non-AU phone numbers on existing accounts.** Accept that an account holding a legacy or
   international number cannot save profile changes until the phone is AU-valid (the message now
   names the field and says nothing was saved)? *Recommendation: accept for Phase 1 — AU-only is D9
   and Q2, production holds 3 team accounts, and ops can correct a row directly.*
3. **Q3 — ratify the five live assumptions** (A1, A2, A4, A-P1-4, A-P1-5) as decided, exactly as
   shipped? *Recommendation: yes, all five.*
4. **Q4 — deploy gating.** Confirm the full battery, the full web suite and the security stage gate
   run and pass at the accepted commit before Phase 1 goes to production? *Recommendation: yes,
   required.*

---

## Owner sign-off — 2026-08-19

The owner reviewed this verdict and ruled on all four decisions:

1. **Stage-0 caption — FIX BEFORE DEPLOY.** The unexplained disabled Submit also occurs on the
   anonymous pre-gate screen (no delivery postcode typed). Same treatment as AC-14 rev 4: the
   outstanding caption names it. Routed to the developer.
2. **The five live assumptions — RATIFIED as shipped:** A1 (guest tracking untouched), A2
   (details collected at the gate, not at account creation), A4 (phone format-only, no SMS),
   A-P1-4 (no auto-submit after the code), A-P1-5 (a NULL name is *displayed* as the email local
   part and **never stored** — a name remains required wherever it matters: no quote can be
   submitted without one, and `/login` enforces it via `NameStep`). The owner asked for
   clarification on A-P1-5 specifically and accepted it once the display-only nature was explicit.
3. **AU-only phone validation — ACCEPTED for Phase 1.** An account holding a non-AU number cannot
   save a profile change until it is corrected; the refusal names the field and states nothing was
   saved. Rationale: AU-only is ruling Q2/D9, production holds 3 team accounts, ops can correct a
   row directly.
4. **Deploy gating — CONFIRMED required.** Full `npm test` + `npm run test:web` green at the final
   commit, plus the security stage gate and a green security-sweep CI run on the deployed commit.

Conditions C1–C4 are therefore: C1 in progress (developer runs the full gate after the stage-0
fix), C2 in progress (security review), C3 closed (spec header now reads revision 4), C4 closed
(ratified above).
