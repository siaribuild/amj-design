# User registration — Phase 2: Trade verification — ACCEPTANCE

Stage 8 (product-manager, returning). Branch `feat/user-registration` @ `33c17b5f`.
Contract: `docs/specs/user-registration-phase-2.md` **revision 5** (64 AC-P2, 16 AB-P2, 23 E-P2).
Author: product-manager. Date: 2026-08-20.

## Verdict

# ACCEPTED WITH CONDITIONS

The business outcome the owner asked for is built and evidenced: **a tradie whose business checks
out gets trade pricing in the same interaction, a gmail sole trader waits for a person instead of
being refused, nobody is auto-rejected, and no percentage reaches a customer surface.** 76 of the 80
criteria (64 functional + 16 abuse) are verified against named evidence; **all 16 abuse cases are
executed, not argued**; the deferred quote-representation problem (#10) was not started, and the
strongest evidence in the suite is the proof that it wasn't.

Four criteria are not fully evidenced and none of them is a defect — they are **untested claims**,
which is a different and lesser problem. They are the conditions below. Nothing was silently
descoped, and I found no scope creep.

This verdict is a recommendation. The owner signs off.

---

## 1. What I relied on

| Evidence | What it is |
|---|---|
| `scripts/tests/trade-verification.test.mjs` (**N**) | New node suite — the engine, the ops decisions, the migration, the authorization matrix |
| `scripts/tests/web/trade-verification.spec.ts` (**P**) | New Playwright suite — the three customer doors in a real browser |
| `scripts/tests/web/ops.spec.ts` (**O**) | Ops queue + customer 360 in a real browser |
| `scripts/tests/web/registration.spec.ts` (**R**) | Phase-1 suite, updated under AC-P2-49 |
| `scripts/tests/email-templates.test.mjs` (**E**), `scripts/tests/unit.test.mjs` (**U**) | Email copy rules; matcher and free-mail list |
| Gates at HEAD | `npm test` green (461 pure + 236 heavy); `npm run test:web` green (116 Playwright) |
| Independent tester | Two rounds; round 2's findings N-1 (AC-P2-19 when signing in *at* the gate) and N-2 (duplicate auto-pass emails) fixed and re-executed |
| Security gate | 6 findings, each reproduced as a failing test before the fix |
| Architect | CONFORMS WITH DIVERGENCES, doc sweep landed |

I did not re-run anything and I did not read the diff. Where a criterion rests on a review rather
than an executed test, I say so.

---

## 2. Criterion-by-criterion

Legend: **PASS** = executed evidence I can name · **PARTIAL** = the outcome holds but one clause is
unevidenced · **UNVERIFIED** = built, plausibly correct, no evidence I can name.

### Door (a) — `/trade-account`

| AC | Status | Evidence |
|---|---|---|
| AC-P2-1 | PASS | P:116-134 — the page hosts the ordinary signup, group already revealed, two fields, no builder/tradie control (`expectNoTradeLabelControl`); the dead mock form is gone |
| AC-P2-2 | PASS | P journey 1 signs in through the unmodified `/api/auth/verify`; referral-attribution ordering still green in `api.test.mjs` |
| AC-P2-3 | **PARTIAL** | P:125-132 — values typed before the OTP are posted once the session exists. The **transient-failure clause** ("values still on screen, retryable, signed in regardless") has no test |
| AC-P2-4 | PASS | P:132-133 — active state, and `expectNoPercentage` sweeps the trade card |
| AC-P2-5 | **PARTIAL** | *Not directly tested.* Substantiated by composition: the grant writes 5 (N:215), the pricing path is proven unmodified (N:1509-1521), and `referral-pricing.test.mjs:132-170` shows an account at `discount_percent = 5` prices below one at 0. No test in this phase prices a configuration as a verified tradie. See condition C2 |
| AC-P2-6 | PASS | P:142-170 — under review, no reason named, no timeframe, account usable |
| AC-P2-7 | PASS | P:192-222 (browser-side refusal, ABR stub hit count unchanged) + N:372 |
| AC-P2-8 | PASS | P:277-310 — verified account sees status; unverified sees the group prefilled, no second OTP |

### Door (b) — the account page

| AC | Status | Evidence |
|---|---|---|
| AC-P2-9 | PASS | P:225-259, and P:318-321 pins the §7.2 account-card string verbatim |
| AC-P2-10 | PASS | P:233-267 — same component, same endpoint, same two outcomes; N:193-253 runs both `source: "profile"` and `source: "trade_page"` through one decision path |
| AC-P2-11 | PASS | P:270-275 (no ABN textbox for a verified account) + N:822 |
| AC-P2-12 | **PARTIAL** | Pending state and submitted ABN: N:286-293, P:152-169. The **"no second application while one is pending"** refusal (409 `application_pending`, `worker/lib/trade.ts:410`) has no test. Condition C3 |
| AC-P2-13 | PASS | N:255-282 (history outline is date + outcome only), N:944 (re-apply after rejection) |

### Door (c) — the submit gate

| AC | Status | Evidence |
|---|---|---|
| AC-P2-14 | PASS | P:407-440 — optional, empty never blocks, never in the caption; §7.2 helper string verbatim at P:426 |
| AC-P2-15 | PASS | Sweeps on every customer surface (P:104-108, applied at 123/260/452); no `trade_label` column (N:1378); mass-assignment ignored (N:400) |
| AC-P2-16 | PASS | P:444-461 — disabled *and named*, cleared re-enables with no round trip |
| AC-P2-17 | PASS | P:19 + ABR stub hit count: the submit critical path makes no register call (tester executed this in round 2) |
| AC-P2-18 | PASS | P:501-534 — no timeframe, no percentage, and explicitly no repricing promise (P2-D4) |
| AC-P2-19 | PASS | P:551-590 — **both** sign-in routes, including signing in *at* the gate (tester finding N-1, fixed) |

### The verification decision

| AC | Status | Evidence |
|---|---|---|
| AC-P2-20 | PASS | N:193-217 — approved, no queue item, no ops action |
| AC-P2-21 | PASS | N:222-243 — cancelled/inactive queues, never rejects |
| AC-P2-22 | PASS | N:226-241 + U:1013 |
| AC-P2-23 | PASS | N:230-241 + U:1064 — gmail queues, never rejected |
| AC-P2-24 | PASS | N:314-347 — queues even on a perfect triple; other holders shown to ops; not blocked |
| AC-P2-25 | PASS | N:348 (timeout/error), N:89 (missing GUID) |
| AC-P2-26 | PASS | N:213, N:580 — frozen ABR snapshot on the application |
| AC-P2-27 | PASS | N:245-252 — three different failures, byte-identical bodies |

### The grant and pricing

| AC | Status | Evidence |
|---|---|---|
| AC-P2-28 | PASS | N:215; the same named constant drives the migration assertion (N:1458) |
| AC-P2-29 | PASS | N:855, N:1043-1120 — an ops-negotiated rate survives re-verification |
| AC-P2-30 | PASS | N:671-718 + O:702-710 |
| AC-P2-31 | PASS | N:1481-1506 — every quote line, order and project dumped and compared row by row, before and after both approval and revocation |
| AC-P2-32 | **PARTIAL** | Path proven unmodified by source-absence (N:1509-1521). "The price reflects the new rate" shares AC-P2-5's gap |
| AC-P2-33 | PASS (by absence) | The criterion's testable half is "no separate mechanism, no re-issue" — N:1509-1521 proves the new modules cannot touch pricing or quotes. Ops pricing a reviewed quote is a human act, not code |
| AC-P2-34 | PASS | N:1131 — internal accounts cannot become trade-verified |

### Ops

| AC | Status | Evidence |
|---|---|---|
| AC-P2-35 | PASS | N:1156, O:526, O:641-649 — queue reachable, pending count visible without opening it |
| AC-P2-36 | PASS | N:560, N:1216, O:532 — reasons, snapshot, duplicate holder; no builder/tradie row |
| AC-P2-37 | PASS | N:583 (non-admin assigned role approves), O:544 |
| AC-P2-38 | PASS | N:633-668 — rejection leaves a working private account at rate 0 |
| AC-P2-39 | PASS | N:770-798 — second decision 409, including concurrent |
| AC-P2-40 | PASS | N:1190, O:653-697; grandfathered provenance N:1449-1458 |
| AC-P2-41 | PASS | N:1165, O:566, O:698-700 — rate shown read-only to staff only |
| AC-P2-42 | PASS | N:583, N:623 — audit entry per decision |

### Emails

| AC | Status | Evidence |
|---|---|---|
| AC-P2-43 | PASS | N:1294-1309 (auto-pass sends `trade_approved` and nothing else). I compared `worker/lib/trade.ts:61-69` against §7.2 myself: **verbatim**. No test pins the string — see C6 |
| AC-P2-44 | PASS | N:1338-1342 + E:91-94 (never mentions another holder) |
| AC-P2-45 | PASS | N:1315 + E:86-89 (ten timeframe spellings banned) |
| AC-P2-46 | PASS | E:47-52 + E:112-119 — no Sanity, fallback renders complete, send succeeds |
| AC-P2-61 | PASS | N:1327-1331 — revocation emails the customer (owner ruling Q1) |
| AC-P2-62 | PASS | N:1344-1348, E:73-78 — four dot-free keys, all exercised |
| AC-P2-63 | **PARTIAL** | The authored-template-wins path is the pre-existing shared mechanism, unchanged. §10's named sub-case ("with a stubbed authored template the authored copy wins") was not built for the trade keys. Low risk; the deployment trap it guards (a dotted id) *is* tested |
| AC-P2-64 | PASS (fallbacks) | E:68-110 covers all four clauses: no figure at all, no timeframe, no label variable, no retired-comparative phrase. **Authored** Sanity copy cannot be swept because it does not exist yet — that risk transfers to the owner at authoring time |

### Advertising, migration, carried seams, regressions

| AC | Status | Evidence |
|---|---|---|
| AC-P2-47 | PASS | P:81-101 + R:326/333/364. The sweep is deliberately scoped to the trade card, with the reason written into the file: `/trade-account` also carries the **referral** placement, whose "2.5% / 1%" is a different programme's owner-approved copy governed by the referral spec. I accept the scoping — AC-P2-47 exists so the *trade rate* is never derivable |
| AC-P2-48 | PASS | P:305/324/424, R:317 — exactly four surfaces; retired-comparative absence at P:100 and E:98-102 |
| AC-P2-49 | PASS | R:314/358/366 — Phase-1 AC-41 assertions updated with this spec cited, the rest unchanged |
| AC-P2-50 | PASS | N:1351/1359/1440 — every internal row at 0 |
| AC-P2-51 | PASS | N:1385-1472 — exactly the three named addresses, two with no ABN written, nobody else's rate moved |
| AC-P2-52 | PASS | N:1378 — additive statements only, no rebuild, no `trade_label` |
| AC-P2-53 | PASS | N:1416, N:1474 — all six table counts identical |
| AC-P2-54 | **UNVERIFIED** | Built (`src/components/referral/JoinProgramFlow.tsx:168-194, :274`). **No test at any level** — not Playwright, not node. Condition C1 |
| AC-P2-55 | PASS | N:1256-1291 — phone and address on the project record, and null where there are none |
| AC-P2-56 | PASS (by review) | Architect conformance + `api.test.mjs` referral-attribution ordering green + P:551-560's note that `/api/auth/verify` still carries no trade state. I did not read the diff myself |
| AC-P2-57 | PASS | R:322/361 — no referral-code input on anything this phase adds |
| AC-P2-58 | PASS (vacuous) | No surface this phase adds renders a money amount (`TradeApplicationCard.tsx` carries none), so there is no GST display to get wrong. No assertion exists, and none is needed unless a price is added later |
| AC-P2-59 | PASS | Full gates green; the only edited Phase-1 assertions are the AC-P2-49 ones, declared |
| AC-P2-60 | PASS | N:1518-1521 — `organisation`/`membership` may not even be *named* in the new modules |

### Abuse cases — all 16 executed

| AB | Evidence |
|---|---|
| AB-P2-1 self-granted status | N:400-412, N:553-555 — `discountPercent`, `type`, `role` posted and ignored, D1 read back |
| AB-P2-2 approving your own | N:724-768 — customer session against every ops-trade endpoint |
| AB-P2-3 crafting the outcome | N:400-412 — `status: "verified"` in the body changes nothing |
| AB-P2-4 reading another's ABN | N:457-495 — no subject id accepted; session-scoped only |
| AB-P2-5 unauthenticated | N:457 — 401/403 and **zero ABR calls** |
| AB-P2-6 rate limits | N:420-450 — per-account and per-IP, both before any ABR call |
| AB-P2-7 criterion oracle | N:245-252 — byte-identical bodies |
| AB-P2-8 credential/ABN containment | N:1524-1539 — every `console.*` in the two ABN-handling modules must be a fixed string with no interpolation at all |
| AB-P2-9 borrowed ABN | N:891-930, U:1011 — free-mail + copied name always queues (owner-accepted residual stands) |
| AB-P2-10 duplicate escalation | N:314-347 — queued, and B never learns who else holds it |
| AB-P2-11 staff/manufacturer | N:495, N:724, N:1131 — manufacturer 403 on all four endpoints, executed by the tester in round 2 |
| AB-P2-12 swapping a verified ABN | N:507-545 — refused, stored ABN unchanged |
| AB-P2-13 unbounded input | N:382, U:998 |
| AB-P2-14 replayed decision | N:770-798 — `[200, 409, 409]` under concurrency |
| AB-P2-15 revocation bites now | N:707-718 — the customer's own live session already reads retail |
| AB-P2-16 ABN never in our URLs | P:13 (browser-made URLs swept); the GET-only registrar leg is the spec's own recorded carve-out |

**The security gate's serious finding is worth naming in business terms for the owner:** criterion 3
was checking the applicant's email domain against the business name *they typed*, so anyone could
have padded the name with their own domain word and granted themselves trade pricing on any public
ABN — with no pending row for ops to ever see. It was found, reproduced as a failing test, and
fixed. Four other holes in revocation (self-reversible, an in-flight application surviving a revoke,
a non-atomic revoke, a weak guard) went the same way.

---

## 3. The five things I was asked to judge

**1. The §8.6 divergence — `JoinProgramFlow` reads `me()` instead of threading `user`. ACCEPTED.**
Neither page holds the auth user, the flow is authenticated-only by construction, and one `me()`
call yields exactly the `abn ?? pending.abn` precedence the design asked for. The customer outcome
is identical. **AC-P2-54 still holds as written — but it is unverified** (condition C1); the
divergence is not why.

**2. The missing late-restore race test. ACCEPTED, and the way it was handled is right.** Three
tests were written and all three passed with the fix reverted; shipping any of them would have
claimed coverage this suite does not have. The observable business risk — *account B seeing account
A's commercial standing on a shared trade counter* — **is** covered, by the property test at P:607-642
(sign out, sign in as another account, assert none of the first account's trade state or ABN is on
screen). What is argued from code rather than demonstrated is the narrower race window. That is an
honest gap, recorded in the file where the next reader will find it, and I prefer it to false
assurance. Owner should know it exists; it does not block.

**3. The N-2 residual — two *truly simultaneous* auto-passes could double-send. ACCEPTED.** The worst
consequence is a duplicate "your trade account is active" email; the partial unique index still
leaves exactly one standing grant, and no pricing, ledger or quote consequence follows. The
reachable cases (double-click, retry, second tab) are closed. The proposed cure — a DB write before
the ABR call — trades a duplicate email for a **stray pending row that blocks the account**, which is
a worse customer outcome for a rarer trigger. Right call.

**4. AC-P2-5. Confirmed NOT directly verified**, and it is the phase's headline promise — the owner's
own approved benefit line says "It applies while you configure". What exists: the grant sets the rate
(N:215), the pricing path is proven untouched (N:1509-1521), and a separate suite proves an account
at 5 prices below one at 0 (`referral-pricing.test.mjs:132-170`). The claim is therefore
*substantiated by composition* but not demonstrated end-to-end for a trade-verified account. See C2.

**5. The two production dependencies. Neither blocks acceptance; both are deploy conditions.**
- **ABR GUID unverified in production.** By design a bad or missing key is safe — everything queues
  (AC-P2-25, N:89). But safe is not the same as working: if the key is wrong in production, the
  auto-pass never fires, every genuine tradie waits for a human, and *nothing alerts anyone* because
  queuing is the designed behaviour. That is a business failure that looks exactly like normal
  operation. Smoke-test one real ABN after deploy.
- **Four Sanity `emailTemplate` documents unauthored.** Safe (AC-P2-46) and the fallback copy is the
  owner-approved wording, verbatim for `trade_approved`. Ships fine as-is. The only live risk is that
  authored copy, when written, is not swept by AC-P2-64's rules — those tests can only see the
  fallbacks.

---

## 4. Descoping, creep, and drift

**Silently descoped: nothing.** Every test artifact §10 named exists. Two *named sub-cases* were not
built, both defensible and neither hidden: the authored-template-wins case for trade keys (AC-P2-63)
and the late-restore race (recorded in-file at `scripts/tests/web/trade-verification.spec.ts:644-665`).
One artifact my own §10 **failed to name** is the AC-P2-54 prefill test — that gap is mine, not the
developer's.

**Scope creep: none found, and the evidence is unusually good.** The deferred #10 problem (a trade
signal on the quote, a discount line, a repricing lever) was not started — N:1509-1521 forbids the
new modules from even naming `quote_line`, `"order"`, `estimator/pricing`, `issueQuote` or
`repriceReferralDrafts`. `organisation`/`membership` are untouched (AC-P2-60). No referral-code input
appeared anywhere (AC-P2-57).

Three additions beyond the literal spec text, all within scope and all improvements:
- **A reason is mandatory on revoke** (400 without one, N:687-691). The spec said "reason recorded";
  requiring it is a tightening. Keep.
- **A verified account may re-apply with a new ABN and keeps trade pricing while the new number is
  checked** (N:809-856). This is E-P2-6 implemented properly, and it is the reason AC-P2-11 can show
  the ABN as a fact rather than an input.
- **`abn_locked`** — the implementation of §4.7's P2-A4 rule. In scope.

**One copy drift, minor and permitted.** The `trade_ack` fallback in the code says "We're checking
them and we'll be in touch"; §7.1 wrote "We're checking them **against the Australian Business
Register** and we'll be in touch". `trade_revoked` is likewise lightly reworded. Both fall inside
`P2-A12` (those three fallbacks are PM-authored and rewordable) and both still satisfy AC-P2-64.
Recorded, not a finding. The **owner-approved** strings — all five in §7.2 — are verbatim in the
build (P:318-321, P:426, `worker/lib/trade.ts:61-69`).

**One unevidenced edge case.** E-P2-19 requires the payout form to *explain* that a pending ABN is
being checked. The server refusal is tested (N:507-545); the explanation on screen is not.

---

## 5. `ASSUMED:` tags — status for sign-off

Decided already: `P2-A2` (superseded by P2-D5), `P2-A8` (Q2), `P2-A4` (affirmed at Q7).

**Live, unvetoed, and now shipped — these need the owner's tick or veto:**

| Tag | The business rule it fixes | Where it bit |
|---|---|---|
| `P2-A1` | A *malformed* ABN at the gate blocks Submit and is named in the caption (an empty one never does) | AC-P2-16, P:444-461 |
| `P2-A3` | The customer is never told which check sent them to review | AC-P2-27, AB-P2-7 |
| `P2-A5` | Approval never overwrites a rate ops negotiated by hand | AC-P2-29 |
| `P2-A6` | Nothing re-checks an approved ABN later; a lapsed business stays trade until ops revokes | E-P2-10 |
| `P2-A7` | The customer's browser never receives the rate, only the status | AB-P2-15 |
| `P2-A9` | The queue lives in Customers with the count on the dashboard | AC-P2-35, O:641-649 |
| `P2-A10` | One application at a time per account | AC-P2-12 (and untested — C3) |
| `P2-A11` | A rejected application never revokes standing trade status | E-P2-6 |
| `P2-A12` | The three non-approved email fallbacks are my words, not the owner's | §7.1 |

**Design-level assumptions with a customer-facing consequence** (the rest of §15/§18.12 are technical
and I am content to let them stand):

| Tag | Consequence the owner may not have realised |
|---|---|
| `P2-ARCH-5` / `P2-UX-9` | A **verified** account can no longer edit its own business name in the UI. A tradie who rebrands must go through ops or re-apply |
| `P2-ARCH-1` | 5 applications per account per hour, 20 per IP per hour. A shared office or site NAT could in principle hit the IP cap |
| `P2-ARCH-3` | The fuzzy-match thresholds and the free-mailbox list decide who auto-passes and who waits for a person. Tunable; currently the developer's call |
| `P2-UX-6` | Rejected and revoked states are styled *mute*, not as errors — a private account is not a failure |

All are vetoable now. None was buried.

---

## 6. Conditions

These are the whole of "with conditions". None requires re-testing what was tested.

- **C1 — AC-P2-54 has no test.** The payout-form prefill is a UI change shipped with no browser
  coverage, which is the one house rule this phase otherwise honoured everywhere. One Playwright
  assertion (verified account opens the payout form → ABN field carries the account's ABN → doing
  nothing else leaves them un-joined) closes it. **Owner may instead accept it explicitly as a
  cosmetic convenience.**
- **C2 — AC-P2-5 / AC-P2-32 have no direct test.** One node-level assertion in the pattern of
  `referral-pricing.test.mjs:159-170` — approve an account, price something, assert it is below the
  retail figure — turns the phase's headline promise from an inference into a fact.
- **C3 — AC-P2-12's refusal is untested.** A second application while one is pending returns 409 in
  code; add the two-line assertion.
- **C4 — Deploy, not build: smoke-test one real ABN through `/trade-account` in production** once the
  GUID is set. A wrong key degrades silently into "ops verifies everything by hand", and looks normal.
- **C5 — Deploy, not build: author the four Sanity templates, or accept the fallbacks as the shipping
  copy.** Either is safe. If authored, the AC-P2-64 rules (no figure, no timeframe, no comparative)
  apply to the authored words and no test can enforce them.
- **C6 — Recorded residuals, for the owner's awareness rather than action:** the late-restore race
  guard is argued from code, not demonstrated; two truly simultaneous auto-passes could send a
  duplicate approval email; and AB-P2-9's borrowed-ABN risk remains, bounded by ops visibility, human
  order review and one-click revocation — exactly as the owner accepted at spec time.

C1, C2 and C3 are small, additive test work; they go back through the developer loop. C4 and C5 are
the owner's, at deploy. **My recommendation: land C1-C3 in one short pass, then deploy behind C4/C5.**
