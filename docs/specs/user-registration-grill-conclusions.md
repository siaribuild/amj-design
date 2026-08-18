# User registration — grill conclusions

Grilled with the owner, 2026-08-18, on `feat/user-registration`. Status: **grill closed — frontier empty.**
This document is binding input to the wayfinder map and to every phase spec; the PM takes the
Actors and needs section verbatim. Assumptions tagged `ASSUMED:` are vetoable at any spec gate.

## The reframe (supersedes the 2026-08-17 ground rule)

Accounts are **no longer tradies-only**. Decided 2026-08-17/18: private users get accounts too.
What stays exclusive to ABN-verified business accounts is **better pricing** — shown as lower
prices, never as a visible discount line (the existing never-disclose-by-subtraction rule).

The account's new job is a **submission filter**: quote review is expensive human time at
OpenFrame, so submitting a quote for review requires an account plus real contact details.
"Anyone can see the price; a small amount of effort before we spend time on you." A secondary
goal: accounts that request quotes and never buy become a data signal for future filtering.

## Actors and needs (for the spec, verbatim)

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

Trade-ness (ABN-verified) is **its own axis** on an account, parallel to staff-ness and
payability. "Customer" remains the umbrella term for any account holder — the architect updates
CONTEXT.md's Customer definition, which currently says accounts are trade businesses only.

## Decisions ledger

| # | Decision | Answer |
|---|---|---|
| D1 | Private registration mechanism | Keep instant email-OTP find-or-create exactly as-is (test users love it; it preserves the referral attribution seam untouched). Relabel UI honestly; collect name properly instead of deriving from email. No signup form for private users. |
| D2 | Trade verification | **Hybrid.** Auto-pass ONLY when all three line up: (1) ABN valid + active on live ABR register; (2) submitted business name matches ABR entity/trading name (fuzzy; algorithm is architect's call); (3) email domain plausibly matches the business. Anything less — gmail included — goes to an ops review queue, never auto-rejected. |
| D2.1 | Duplicate ABN | An ABN already trade-verified on another account can never auto-pass; a second application with it always queues for a human (who may knowingly allow, e.g. estimator + director). Never a hard block, never an auto-pass. |
| D3 | ABR dependency | Approved. Free ATO ABN-Lookup web-services GUID; owner registers when the developer needs the key. ABR outage ⇒ applications queue for manual review (nobody blocked, nobody waved through). |
| D4 | Pricing wiring | New accounts `discount_percent = 0`. Trade verification sets the business-account default (5); column stays per-account so ops can negotiate individual rates later. Staff pinned to 0 (fixes the silent staff-carry-5% bug). The 3 existing prod accounts (all team test accounts) grandfathered as trade. |
| D5 | Advertising | The EXISTENCE of trade pricing is advertised to private/anonymous visitors (and marketing material); the percentage never appears anywhere. |
| D6 | Referrals × tiers | Program stays business-only on the payout side (payability axis unchanged: ABN + bank details to hold a code). Private users CAN be referred and sign up — referred-discount side is tier-blind. No code changes. ABN-less private referrers = deferred decision ticket (47% no-ABN withholding, hobby-vs-enterprise line, s49 distance — accountant sign-off before any build). |
| D7 | Account classes | Three tiers: **builder**, **tradie** (both = trade/business accounts, ABN-driven, functionally identical in this feature), **private**. Builder/tradie is a self-declared label at registration. |
| D8 | The gate | Submission-for-review is where anonymity ends. Anonymous visitors browse, build drafts, see live prices (unchanged); hitting "Submit for review" without a session runs the OTP sign-in/create inline; the existing claim-merge bridge attaches the draft; the anonymous submit path (name+email+postcode form) is deleted. |
| D9 | Minimum to submit | Name, address, phone, email — deliberately MORE friction than the minimum: "if someone is seriously considering buying, an extra minute won't turn them away, but it will turn away someone wandering around." Email verified by OTP; phone format-validated (AU shape). |
| D10 | Guest tracking flow | Untouched; it starves naturally (prod has exactly 2 anonymous post-submission quotes, likely test data). Retirement is a later cleanup ticket. |

## Invariants for CONTEXT.md (architect)

1. **Referral economics inequality (named invariant):** referred-discount% + referrer-commission%
   ≤ trade-discount% (currently 2.5 + 1 ≤ 5). This is what makes fake-private-account
   self-referral a losing trade. All three values are ops-editable config — the invariant must
   be written down precisely because a config change could silently invert it. (Config-screen
   warning on violating change = PM's call, nice-to-have.)
2. **Trade-ness axis:** ABN-verified is an account axis like staff-ness and payability; it gates
   what an account *pays* (pricing), never what it can *see*.
3. **Better prices, never a discount line:** trade pricing displays as lower prices; the
   percentage is never shown on any surface (existing QuoteTotals rule extends to all new UI).
4. **Customer definition update:** Customer = anyone with an account (private OR business);
   the "trade business… not a retail consumer" wording is obsolete.

## Assumptions (`ASSUMED:` — veto at any gate)

- A1: Legacy guest-tracking flow untouched (D10).
- A2: Required details (name, address, phone) are demanded at the submit gate; an account can
  exist light (OTP-only) while browsing. Details persist on the account, pre-filled next time.
- A3: A rejected trade application leaves a working private account (nothing lost), the
  applicant is emailed the outcome, re-application allowed, ops sees history.
- A4: Phone validation is format-only in Phase 1; SMS OTP verification is a deferred ticket,
  picked up only if fake-contact abuse appears (paid dependency + friction, defeated by virtual
  numbers anyway).

## Deferred decision tickets (wayfinder children, not blocking any phase)

- T1: ABN-less private referrers (commissions to private persons) — needs accountant sign-off
  on PAYG no-ABN withholding before any design.
- T2: SMS phone verification at the submit gate.
- T3: Guest tracking flow retirement.
- T4: `organisation`/`membership` wire-or-delete — two dormant tables that could become a second
  home for account identity; this feature keeps tiers on `user` and must not touch them.

## Phase cut (owner-directed: value-delivering, independently testable/deployable to CF)

- **Phase 1 — Honest registration + the submission gate.** OTP flow relabelled truthfully;
  name/address/phone collected (AU phone format validation); submission requires an account;
  anonymous submit path removed; new accounts default 0%. Value: the time-waster filter + the
  pricing leak closed. No ABR dependency. Deployable alone.
- **Phase 2 — Trade verification.** ABN + business name + builder/tradie label; live ABR check;
  auto-pass triple; ops review queue + outcome emails; one-ABN rule; staff pinned 0;
  3 prod accounts grandfathered trade. Value: tradies get trade pricing legitimately.
  Owner add-on (2026-08-18, "so I would not forget"): the referral payout form pre-fills its
  ABN field from the account's stored ABN; ops project record gains the read-only contact line
  (phone/address) deferred out of Phase 1.
- **Phase 3 — The shop window.** Real trade-account page (replacing the mock that silently
  discards applications); "trade pricing exists" surfaces; CONTEXT.md invariants + referral
  abuse-case regressions.

## Key code facts (trust these; do not re-derive — file:line verified 2026-08-18)

- Registration today IS sign-in: `POST /api/auth/verify` → `findOrCreateUser`
  (`worker/lib/auth.ts:146-158`), email-only, name derived from address local part.
- Referral seam: attribution happens inside `/verify` ONLY on the `created` branch
  (`worker/routes/auth.ts:88-110`), ordering documented and test-enforced (attribution → clear
  `of_ref` → claim-merge → session). NO referral-code input field may be added to any form —
  deliberate rule at `worker/routes/referrals.ts:38-49`.
- Claim-merge bridge (anon draft → account): `claimAnonProjectForUser`
  (`worker/lib/access.ts:108-138`); second single-draft reconciliation at
  `worker/lib/access.ts:79-84`. Sensitive to reordering; tested at
  `scripts/tests/api.test.mjs:129-150` and `scripts/tests/web/customer.spec.ts:396-398`.
- Anonymous submit path to delete: `worker/routes/quote.ts:191-206`.
- Discount: `user.discount_percent` (REAL, DEFAULT 5 — migration
  `migrations/0032_account_discount.sql:21`), read solely by `loadAccountDiscount`
  (`worker/lib/estimator/pricing.ts:356-369`), applied at `pricing.ts:227-237` where account %
  and referral % are ADDED. Nothing anywhere writes the column today.
- Staff bug: `findOrCreateInternalUser` (`worker/lib/staff.ts:79-115`) creates/promotes internal
  users without zeroing `discount_percent`.
- The mock to replace: "Apply for a trade account" `TradePage` (`src/app/App.tsx:1675-1734`),
  footer-linked, wired to nothing.
- `user.email` UNIQUE is case-sensitive; every write path must `normEmail` first (prior bug:
  `worker/lib/staff.ts:148-157`). No auth middleware exists — every new endpoint self-checks.
- ABN checksum helper exists (`abnValid`, checksum-only). ABR live lookup is the new part.
- Prod reality (2026-08-18): 3 customer accounts (all team test), 3 internal; 2 anonymous
  post-submission projects; referral config: 2.5% referred / 1% commission / $2k min order.
