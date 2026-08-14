# Referral program — architecture & implementation design

Branch: `feat/referral-program`
Status: revision 2 (D18 folded in) — ready for UX design (customer/ops surfaces) and development
Author: architect
Date: 2026-08-15

Inputs, in authority order:

1. `docs/specs/referral-program.md` (revision 6, final — 77 ACs, 9 tickets, §12 empty)
2. `docs/specs/referral-program-pending-amendments.md` — **D18** (payout details are a precondition of
   becoming a referrer), decided by the owner after the spec froze. This design implements D18; the
   spec amendments it forces are listed in §17 for the product-manager.
3. `docs/specs/referral-program-legal-research.md` (constraints, not background — §4.1 s 49, §4.3/§10.5
   s 32(2), §5.1 s 6D(4)(d), §10.7 unclaimed money)
4. The orchestrator's four amendments (A: bank-detail access log, no viewer; B: referrer never submits
   a mate's PII; C: A18 is compliance-load-bearing; D: stated payment timeframe + threshold disclosure
   at the point of offer) and follow-ups: the gift-card question is closed (one config clock, ADR-3),
   AMJ is **Victoria-based**, and M10 is compliance-load-bearing (ADR-6).

Where this document and the spec state the same rule, the spec's wording governs intent; this document
governs mechanism. Where D18 contradicts the spec (M11/M12, AC-1, AC-28, parts of §8.3), **D18 wins**
and §17 flags the reconciliation.

---

## 1. Verification of the load-bearing pricing claim

The spec's central claim — *the referral discount is one more input to the function that already
answers "what percentage off does this user get?"* — **is verified against the code and holds**:

- The single discount step: `worker/lib/estimator/pricing.ts:195-203` — clamped 0–100, applied after
  base + surcharges + min-charge + modifiers, before `round10()`.
- `loadAccountDiscount(env, userId)` at `pricing.ts:292` resolves the percentage server-side from the
  owning user, returning a bare `number`.
- Exactly two callers, confirmed by grep: `createCachedPriceResolver` (`pricing.ts:334`, the AI batch
  path) and `priceLine` (`pricing.ts:405`, everything else). Every pricing surface funnels through
  them: the customer preview (`worker/routes/projects.ts:167-175` → `itemFields` → `priceItem` →
  `priceLine`), every save path (`worker/lib/lines.ts:178-204` — "THE pricing entry point"), the ops
  preview and edit re-price (`worker/routes/ops.ts:1086-1103`, `:1004`), composite derivation
  (`worker/lib/composite.ts`), and the schedule parse (`worker/lib/parse.ts:284`). All pass
  `ownerUserId` and none re-derives a discount.
- The snapshot records `discountPercent` (`pricing.ts:103`) and the line total is frozen into
  `quote_line.line_total`, which `createOrderFromProject` copies to `order_line.line_total`
  (`worker/lib/orders.ts:368-397`). Deposit/balance/delivery/GST all compute downstream of it.

So the extension point is exactly where the spec says. Five **spec-vs-code findings** the design has
to absorb (each resolved in the section cited):

| # | Finding | Resolution |
|---|---|---|
| F1 | `loadAccountDiscount` returns a bare number; AC-52 needs the components separately. | Return type becomes a small struct; `computePrice` composes and clamps (§5.1). |
| F2 | **No live code path cancels an order or sets `payment_status='refunded'`.** `payment_status` is a vestigial 0001 column ("left in place, unused" — 0002 header); no route writes `'cancelled'` or `'refunded'`. M9/AC-21's "voided automatically on cancel/refund" has no event to hook. | The void is a **derived guard**, not an event hook: confirmation and payout inclusion re-check the order row and auto-void on a cancelled/refunded state (§7.4, ADR-7). Testable by setting the column directly. |
| F3 | `quote_line.pricing_snapshot_json` is not reliably populated (customer edits null it, `worker/routes/projects.ts:513`), so the quote badge cannot be derived from per-line snapshots. | One frozen fact at the existing freeze moment: `project.referral_percent_at_issue`, stamped by `issueQuote` — the same precedent as delivery freezing at issue (0044) (§5.4). |
| F4 | A16 ("referrer's account must be `active` at payout") has nothing to gate on — `user` has no active/suspended column and no deactivation path exists. | Not implemented and no column invented; the ops void (A17) covers the operational need. Recorded here so it is a choice, not an omission. |
| F5 | `GET /api/ops/audit` (`worker/routes/ops.ts:2096-2104`) is a **global viewer** over `audit_event`. | The amendment-A access log gets its own table, not `audit_event` rows (ADR-4). |

---

## 2. Architectural decision records

### ADR-1 — One resolver composes the discount; a leaf module owns the eligibility question

**Decision.** The question *"does user X have a live referral discount right now, and what is its
lifecycle state?"* is answered by exactly one function, `referralDiscountState`, in a new **leaf
module** `worker/lib/referral-discount.ts` (imports: `../types`, nothing else — raw SQL over
`referral`, `referral_program`, `"order"`/`project`). `loadAccountDiscount` (pricing) and
`worker/lib/referrals.ts` (offer panel, badge, hooks) both call it.

**Why a leaf and not inside `referrals.ts`.** Import direction. `pricing.ts` already imports
`orders.ts` (`DEPOSIT_PERCENT`), and `referrals.ts` must reach the re-price path
(`lines.ts → pricing.ts`) for AC-72. If pricing imported `referrals.ts`, the graph would be
`pricing → referrals → lines → pricing` — a cycle that ESM tolerates only by accident of evaluation
order. The leaf keeps the graph acyclic:

```
referral-discount.ts  ← pricing.ts, referrals.ts        (leaf; no lib imports)
referrals.ts          → referral-discount, lines(reprice), gst, email, activity, util
pricing.ts            → referral-discount, orders(DEPOSIT_PERCENT)
orders.ts, auth.ts    → unchanged / auth.ts → referrals (record at signup)
routes (quote/orders/ops) → referrals (lifecycle hooks)
```

The deep-module reading: `referral-discount.ts` presents one narrow function hiding a three-table
join and the whole derived-state rule (§7 of the spec: *no stored status column*); everything else
about referrals stays in `referrals.ts` per the spec's single-source table.

### ADR-2 — A referrer can never submit another person's contact details (amendment B)

**Decision.** Attribution inputs are exactly two, both actions of the referred person in their own
browser session: (a) the `/r/<CODE>` link setting a cookie in *their* browser; (b) the code *they*
type into their own signed-in account. **No API in this codebase may accept a referred party's name,
email, phone or any identifier of another individual from a referrer.** No "invite by email", no
"send this to a mate for me", no CSV of prospects — ever, without a lawyer first re-answering
research §5.1.

**Why it is architecture, not copy.** Privacy Act s 6D(4)(d): providing a benefit to collect personal
information about another individual *from anyone else* would end AMJ's small-business exemption for
the **entire business**. The self-identification design is the fact that keeps the section unengaged.
Mechanically: the referral recording functions (`recordReferralAtSignup`, `claimReferralCode`) take
only `(referredUser, code)` — there is no parameter through which a third party's PII could arrive,
so the future feature "hits a stated rule" as a missing parameter, not a natural extension. This ADR
is the stated rule.

### ADR-3 — One attribution/validity clock, not two

**Decision.** A single config field `window_months` (default 12) governs both the earning window and
the discount validity. One snapshot field on the referral row, one `expires_at`.

**Why.** The legal driver for splitting them (a possible 3-year gift-card minimum on the discount) is
closed: neither clock is a gift card under ACL s 99A (research §10, [CLEAR]). On engineering merit,
two fields that must hold the same value is a standing invitation to drift — every reader would have
to decide which clock it means, and AC-13 ("expired ⇒ no earning *and* no discount") would become a
cross-field invariant to test instead of a tautology. If they ever genuinely diverge, the change is
one additive migration (a `discount_window_months` column defaulted from `window_months`, plus a
second snapshot column) and a change to `recordReferral` — the routine class of change here, not a
rework. The spec's A7/§4.6.4 semantics (discount lapses with the referral) are exactly the one-clock
model.

### ADR-4 — The bank-detail access log is a dedicated table, written by construction

**Decision.** New table `payout_details_access` (subject, actor, `view|change`, context, timestamp).
**No read path exists anywhere in the app** — no endpoint, no screen, no export. Not `audit_event`
rows: `GET /api/ops/audit` is a global viewer (F5), and routing these rows through it would either
surface them (the viewer the owner rejected) or force a filtering special-case into a shared query.

**Enforcement by construction, not by convention.** The raw `payout_bsb` / `payout_account_number`
columns are read by exactly one function, `unmaskedPayoutDetails(env, subjectUserIds, actor, context)`
in `referrals.ts`, which inserts the `view` rows as a side effect before returning; `savePayoutDetails`
likewise inserts the `change` row (storing **only** a `{bsb: '063-***', accountLast4}` fingerprint in
context — never the numbers). Every other reader gets the masked form. A new endpoint cannot forget
the log without also failing to get the data.

### ADR-5 — The discount stays a percentage evaluated per pricing call; never a stored, decrementing thing

**Decision.** No stored balance, no credit object, no per-account discount flag. Eligibility is
derived at each pricing call from three existing records (the referral row, its `expires_at`, the
existence of a first order).

**Why beyond the spec's own reasons.** The gift-card analysis (research §10.1/§10.4) rests partly on
this implementation fact — "no instrument, no balance, no object to be redeemed". A future change
that turns the discount into a stored, decrementing credit re-opens that analysis. Treat this as a
compliance-relevant invariant, same weight as ADR-2.

### ADR-6 — M10 is structural: promised values are computed only from the referral row

**Decision.** Every function that computes money or a discount for an existing referral takes its
numbers from the **referral row's snapshot columns** (`rate_percent`, `cap_amount`,
`min_order_amount`, `discount_percent`, `expires_at`) and is not handed the live config at all — the
config is not a parameter of `createEarningForOrder`, `confirmEarning`, or the eligibility SQL's
numeric outputs. Live config is consulted in exactly four places: recording a new referral (to
snapshot), the two side switches (`referred_discount_active` gates the discount per pricing call,
`referrer_reward_active` gates earning *creation* — AC-60, owner-decided live gates), and program
`status` gating **new attribution only**. UCT research §10.6: an expiry paired with a unilateral
variation right is the real exposure; making variation structurally unable to reach promises already
made is the mitigation.

### ADR-7 — Order-lifecycle observation is three route-site hooks plus a derived guard

**Decision.** `referrals.ts` exposes `onOrderCreated(env, orderId, projectId)` and
`onOrderBalancePaid(env, orderId)`. They are called from the three existing route sites —
`worker/routes/quote.ts:506` (after `createOrderFromProject` succeeds), `worker/routes/orders.ts:133`
and `worker/routes/ops.ts:1373` (after `markPaid(..., "balance")` succeeds). No stage is added to
`STAGES`; `orders.ts` itself is untouched by referral imports (keeps the graph of ADR-1 acyclic —
hooking inside `markPaid` would create `orders → referrals → … → pricing → orders`). Cancel/refund
(F2) is a derived guard, not a hook: `confirmEarning` and the payout queue query exclude and void
earnings whose order shows `stage='cancelled'` or `payment_status='refunded'`. **Invariant for
review:** any future path that creates an order or records a balance payment must call the matching
hook; the lifecycle test suite asserts the end-to-end effect through both existing payment routes.

### ADR-8 — D18: the payability gate — code withheld, recording re-checked, clearing bounded

The owner's D18: *"Only allow users to become referrers if they have required details stored"* —
ABN + BSB + account number + account name. One predicate implements it:

```ts
// referrals.ts — THE payability predicate. One place; no caller re-derives it.
payoutComplete(user): boolean   // abnValid(user.abn) && payout_bsb && payout_account_number && payout_account_name
```

**(a) The code is WITHHELD, not issued inactive.** `ensureReferralCode` refuses until
`payoutComplete`. Chosen over issue-inactive because:

- It makes the invariant structural: no code exists ⇒ nothing to click, nothing to type, no cookie,
  no window in which "a referral is recorded against a referrer who cannot be paid" — the exact state
  D18 exists to prevent.
- The kindness argument for issue-inactive is self-defeating: a tradie can only have "already read
  their code out" if a code was issued before the details existed — the scenario is *created* by the
  option that is kind to it. Under withholding it cannot arise.
- Issue-inactive forces a specified degraded referred-side experience (discount but no commission?
  silently dead code?) — either breaks the two-sided pitch the owner chose, or generates the "my mate
  got the discount, where's my 1%?" dispute. Withholding needs no such specification.

Once issued, the code is permanent and stable (AC-1's "stable thereafter" is preserved; only the
*issue* moment moves behind the gate).

**(b) Recording re-checks payability.** Details are editable, so code-in-hand does not prove
payable-now. `recordReferral` requires `payoutComplete(referrer)` **at recording time**, and
`handleReferralLink` sets no cookie for a currently-unpayable referrer (same silent handling as an
unknown code — AC-4 pattern). A dormant code is therefore inert end to end. Manual entry of a dormant
code returns the generic `invalid_code`: the error must not disclose the referrer's account state
(their missing bank details) to a third party — a small APP 6 point, decided here.

**(c) Clearing details is allowed, with one narrow refusal.** APP 11.2 (destroy when no longer
needed; research §5.2 recommends purging live credentials after the final payout) rules out "details
are forever". Rules:

- **Edit to new valid values:** always allowed. Payout history is safe — banking details freeze onto
  `referral_payout` rows at mark-paid (spec §7.1).
- **Clearing:** allowed, **except while a `confirmed` unpaid earning exists** — that money is already
  payable and the details are actively needed for the imminent payment (a retention purpose APP 11.2
  itself recognises). The refusal states the amount and the reason.
- **Consequences of clearing:** the code goes dormant (b); the referrer's *existing* referrals keep
  their referred-side promises (the mate's discount is untouched — limb-2 principle: what the
  referred person was told when they acted is what they get); and any future earning **holds at
  `pending`** rather than confirming (§7.2) until details are re-completed. `pending` money is not
  yet *payable* — the condition is an up-front-disclosed eligibility rule, not a withholding of money
  owed — so Victoria's 12-month clock does not start. This is the only reachable residue of the
  unpayable-referrer problem, it uses no new state, and it is visible in the account area
  ("re-add your payment details — $X is waiting to be confirmed").

**(d) D18 is a payability gate, never a purchase gate (amendment C / A18).** The predicate reads four
detail fields and nothing else. No API, query or copy may condition any referrer capability on the
referrer's order history — "you must be a customer to refer" is the ACL s 49 fact pattern
(strict liability, penalties to $100m). The lifecycle suite keeps a standing regression test: a
brand-new account with zero orders and complete payout details gets a code and records a referral
(§13.7). The landing copy states both facts separately: *no purchase needed* to refer; *payment
details needed* to get your code.

**(e) `min_payout_balance` carries a mechanical long-stop.** If the threshold is ever switched on,
confirmed money can sit unpaid by AMJ's own rule — re-engaging the Victorian regime the front gate
closed. Two measures, both structural: the ops Program screen shows a stated warning when setting a
non-zero threshold (money held under it is still legally payable and must not sit unpaid 12 months);
and the payout queue **force-promotes an accruing group into `ready` when its oldest confirmed
earning is 11 months old** (constant `PAYOUT_LONG_STOP_MONTHS = 11` in `referrals.ts`, one month of
margin before the statutory 12), regardless of the threshold. The hold is also disclosed at the point
of offer per amendment D (§12).

---

## 3. Migration `0051_referral_program.sql`

Append-only; next after `0050_order_line_position.sql`. Creates tables and adds columns only — no
UPDATE touches `quote_line`, `order_line`, `"order"` or `payment` (AC-49c). D18 adds **no schema** —
the gate is a predicate over the `user` columns below, and the pending-hold reuses the existing
`pending` status. Shapes final:

```sql
-- The code belongs to the account (spec §7). SQLite UNIQUE permits many NULLs —
-- staff, and every account that has not passed the D18 payability gate, simply
-- have no code (ADR-8a).
ALTER TABLE user ADD COLUMN referral_code TEXT;
CREATE UNIQUE INDEX idx_user_referral_code ON user(referral_code);

-- Payout method (customer-entered; masked on every customer read-back — §9).
ALTER TABLE user ADD COLUMN payout_bsb TEXT;
ALTER TABLE user ADD COLUMN payout_account_number TEXT;
ALTER TABLE user ADD COLUMN payout_account_name TEXT;

-- F3: the one frozen fact the issued-quote badge reads (stamped by issueQuote).
ALTER TABLE project ADD COLUMN referral_percent_at_issue REAL;

-- Singleton config, versioned like pricing_policy for optimistic concurrency.
CREATE TABLE referral_program (
  id                        TEXT PRIMARY KEY,              -- 'default'
  status                    TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','paused','terminated')),
  referrer_reward_active    INTEGER NOT NULL DEFAULT 1,
  referred_discount_active  INTEGER NOT NULL DEFAULT 1,
  rate_percent              REAL NOT NULL DEFAULT 1,
  cap_amount                REAL,                          -- NULL = no cap (M5)
  min_order_amount          REAL NOT NULL DEFAULT 2000,
  min_payout_balance        REAL NOT NULL DEFAULT 0,       -- 0 = off (M7); ADR-8e when on
  window_months             INTEGER NOT NULL DEFAULT 12,   -- one clock (ADR-3)
  discount_percent          REAL NOT NULL DEFAULT 2.5,
  payout_timeframe_days     INTEGER NOT NULL DEFAULT 14,   -- ACL s 32(2), amendment D
  version                   TEXT NOT NULL DEFAULT 'v1',
  updated_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by                TEXT
);
INSERT INTO referral_program (id) VALUES ('default');

-- The RELATIONSHIP. Snapshot columns are the promise as made (M10, ADR-6);
-- 'expired' is DERIVED from expires_at, never stored (spec §7).
CREATE TABLE referral (
  id                    TEXT PRIMARY KEY,
  referrer_user_id      TEXT NOT NULL REFERENCES user(id),
  referred_user_id      TEXT NOT NULL UNIQUE REFERENCES user(id),  -- A9
  code                  TEXT NOT NULL,
  source                TEXT NOT NULL CHECK (source IN ('link','manual')),
  status                TEXT NOT NULL DEFAULT 'recorded'
                          CHECK (status IN ('recorded','void')),
  rate_percent          REAL NOT NULL,
  cap_amount            REAL,
  min_order_amount      REAL NOT NULL,
  discount_percent      REAL NOT NULL,
  window_months         INTEGER NOT NULL,
  expires_at            TEXT NOT NULL,      -- created_at + window_months
  void_reason           TEXT,
  voided_by             TEXT,
  voided_at             TEXT,
  reminder_sent_at      TEXT,               -- AC-77 idempotence
  expired_processed_at  TEXT,               -- AC-72 expiry sweep idempotence
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (referrer_user_id <> referred_user_id)              -- A11, structural
);
CREATE INDEX idx_referral_referrer ON referral(referrer_user_id);
CREATE INDEX idx_referral_expiry   ON referral(status, expires_at);

-- The MONEY. Separate from the relationship (spec §7: different acts, different
-- reasons; the payout batch links to money, not relationships).
CREATE TABLE referral_earning (
  id            TEXT PRIMARY KEY,
  referral_id   TEXT NOT NULL REFERENCES referral(id),
  order_id      TEXT NOT NULL UNIQUE,       -- one earning per order, ever (A8)
  base_amount   REAL NOT NULL,              -- post-discount ex-GST goods, via taxBreakdown (M3)
  rate_percent  REAL NOT NULL,              -- copied from the referral snapshot
  amount        REAL NOT NULL,              -- round2(base × rate), min(cap) when cap set
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','void','paid')),
  payout_id     TEXT,
  void_reason   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at  TEXT,   -- when it became PAYABLE (§7.2: balance_paid AND payoutComplete)
  voided_at     TEXT
);
CREATE INDEX idx_earning_status ON referral_earning(status, confirmed_at);

-- One row per referrer per payment run; the frozen banking columns are the
-- accountant's record and never mutate with later user edits (spec §7.1).
CREATE TABLE referral_payout (
  id                TEXT PRIMARY KEY,
  referrer_user_id  TEXT NOT NULL,
  amount            REAL NOT NULL,
  status            TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','failed')),
  reference         TEXT,
  note              TEXT,
  paid_at           TEXT,
  paid_by           TEXT,
  abn               TEXT,
  bsb               TEXT,
  account_number    TEXT,
  account_name      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_payout_referrer ON referral_payout(referrer_user_id);

-- Amendment A. NO reader exists anywhere in the application (ADR-4). Rows are
-- written only by unmaskedPayoutDetails / savePayoutDetails. `context` for a
-- 'change' row carries a masked fingerprint only — never an account number.
CREATE TABLE payout_details_access (
  id               TEXT PRIMARY KEY,
  subject_user_id  TEXT NOT NULL,
  actor_user_id    TEXT NOT NULL,
  action           TEXT NOT NULL CHECK (action IN ('view','change')),
  context          TEXT,        -- 'ops_payouts' | 'ops_csv' | 'customer_update' + fingerprint
  at               TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Notes: earning statuses are CHECK-constrained; any future status is a small additive migration. No
trigger touches existing tables. `scripts/db/clear.sql` gains the five new tables.

---

## 4. Module map — every file the change touches

**New:**

| File | Contents |
|---|---|
| `worker/lib/referral-discount.ts` | Leaf (ADR-1): `referralDiscountState(env, userId)` → `{ state: 'none'\|'available'\|'used'\|'expired'\|'void'; percent; referralId; expiresAt; usedOrderId? }`. One SQL join; `available` additionally requires `referral_program.referred_discount_active=1`. |
| `worker/lib/referrals.ts` | Everything else: `payoutComplete` + ABN checksum (ADR-8), code generation, link handling, recording (both sources) + gates, lifecycle hooks, earnings, payout queue/mark-paid/failed + long-stop promotion, CSV data, masked/unmasked bank-detail access (ADR-4), review flags, sweep, DTOs. Routes stay thin. |
| `worker/routes/referrals.ts` | Customer + public API (§10.2), mounted `api.route("/api", referrals)` in `worker/index.ts`. |
| `worker/routes/ops-referrals.ts` | Staff API (§10.3), mounted from the ops router: `ops.route("/referrals", opsReferrals)`. Reuses the existing staff-resolution helper (export it from its current home if module-local). |
| `src/data/referrals.ts` | Shared DTO **types** for every referral response — the AC-75 structural guard (§10.1). No logic. |
| `src/pages/ReferralsPage.tsx`, `src/pages/ReferPage.tsx`, `src/components/referral/*` | Referrer account section (gate-first empty state per D18); public landing page; offer panel + quote badge + placements (layout per ux-designer). |
| `src/ops/Referrals.tsx` | Ops tab, three sub-screens on the `Pricing.tsx` sub-tab pattern. |
| `migrations/0051_referral_program.sql` | §3. |
| `scripts/capture-pricing-fixtures.mjs`, `scripts/tests/fixtures/pricing-golden/*.json` | AC-49a corpus (§13.2). |
| `scripts/tests/pricing-golden.test.mjs`, `scripts/tests/referral-pricing.test.mjs`, `scripts/tests/referral-lifecycle.test.mjs`, `scripts/tests/web/referral.spec.ts` | §13. |

**Modified:**

| File | Change |
|---|---|
| `worker/lib/estimator/pricing.ts` | `loadAccountDiscount` return type + composition; `PriceInput.referralDiscountPercent?`; snapshot fields; trace label (§5.1–5.3). Only file in `estimator/` that changes. |
| `worker/lib/auth.ts` | `findOrCreateUser(env, email, referralCode?: string \| null)` — create branch calls `recordReferralAtSignup` inside a try/catch (a referral failure must never fail a signup), and the returned row gains `created: boolean` so the route knows to clear the cookie (§6.2). |
| `worker/routes/auth.ts` | `/verify` reads the `of_ref` cookie, passes the code, clears the cookie when `created` (§6.2). |
| `worker/index.ts` | `/r/<CODE>` branch in `route()` (§6.1); `scheduled()` gains `referralSweep` (§8); mounts the two new route files. |
| `worker/routes/quote.ts` | Accept route calls `onOrderCreated` after `createOrderFromProject` succeeds; `GET /projects/:id/quote` adds `referral` badge field (§5.4); `issueQuote` call path stamps `referral_percent_at_issue` (inside `worker/lib/issue.ts`). |
| `worker/lib/issue.ts` | Stamps `project.referral_percent_at_issue` from `referralDiscountState` at issue (§5.4). |
| `worker/routes/orders.ts`, `worker/routes/ops.ts` | The two `markPaid` sites call `onOrderBalancePaid` on success (balance kind only). `ops.ts` additionally: project record gains referral flag block (AC-58); `/summary` gains `referralPayoutsReady` (AC-46). |
| `worker/lib/pricing-admin.ts` | `applyPricingChange.table` union gains `'referral_program'` — the program save reuses the one versioned-write helper (AC-38). |
| `worker/lib/shell.ts` | `PUBLIC_PAGES` gains `"refer"` (sitemap + indexability, AC-33). |
| `src/app/ui.tsx`, `src/app/routes.ts` | `Page` union + `PAGE_PATHS`: `refer: "/refer"`, `referrals: "/referrals"`. |
| `src/pages/AccountShell.tsx` | `AccountSection` gains `"referrals"`; rail item gated per §7.5. |
| `src/app/App.tsx` | Route wiring; the §8.6 offer panel renders beside the Price-display card in `AccountSettingsPage` (`App.tsx:1453`). |
| `src/pages/HomePage / TradePage / Footer / RecordDetailPage` | Placements (§8.2 of the spec), all gated on the public program endpoint; logged-in-without-code variants point at the payout-details step (D18). |
| `src/ops/OpsApp.tsx` | `Tab` union + `ALL_TABS` gain `referrals`; dashboard needs-us row. |
| `worker/lib/email.ts` call sites | Four `notify` templateKeys with inline fallbacks (§8). |
| `package.json` | `test:referral` script; appended to `test` (§13.1). |
| `scripts/db/clear.sql` | New tables. |
| `src/pages/PrivacyPolicyPage.tsx` | Referral data + payout details section (spec §11.8; copy from coordinator). |

---

## 5. Pricing integration (T2 — the highest-risk work)

*Unchanged by D18 — the discount side gates on the referral row, which under ADR-8 can only exist for
a referrer who was payable at recording time; nothing here reads payout details.*

### 5.1 The composing resolver

`loadAccountDiscount` keeps its name, callers and server-side-only character, and changes shape:

```ts
export interface DiscountResolution {
  accountPercent: number;    // user.discount_percent, clamped 0–100; 0 for anonymous
  referralPercent: number;   // 0 unless referralDiscountState(userId).state === 'available'
  referralId: string | null; // set iff referralPercent > 0
}
export async function loadAccountDiscount(env, userId): Promise<DiscountResolution>
```

It calls `referralDiscountState` (leaf, ADR-1) and never reads a number from the live config —
`percent` comes from the referral row's snapshot (ADR-6). Both existing callers destructure into the
new `PriceInput` fields:

```ts
// PriceInput additions
discountPercent?: number;          // unchanged meaning: the ACCOUNT component
referralDiscountPercent?: number;  // the referral component; absent/0 for everyone today
```

### 5.2 Composition inside `computePrice`

At the existing step (`pricing.ts:195-203`), and nowhere else:

```
account   = clamp01_100(input.discountPercent ?? 0)          // exactly today's line 195
referral  = clamp01_100(input.referralDiscountPercent ?? 0)
effective = min(100, account + referral)                      // additive, spec §4.6.3
```

- `referral === 0` ⇒ `effective === clamp(account)` — **bit-identical arithmetic to today**, same
  trace label (`account discount X%`), same snapshot fields. This is what makes AC-49a/b pass by
  construction rather than by luck.
- `referral > 0` ⇒ trace label becomes `discount E% (account A% + referral R%)` (ops-only surface,
  spec §4.6.1), and the snapshot gains two fields **emitted only in this case** (the `steps` pattern):

```ts
// PriceSnapshot additions — present ONLY when a referral discount applied
accountDiscountPercent?: number;
referralDiscountPercent?: number;
// discountPercent (existing) remains the EFFECTIVE applied percentage
```

AC-52 (components recorded separately, server-side) holds; non-referred snapshots are byte-identical.
**These two fields are never serialised into any customer response** — enforced by §10.1.

### 5.3 What does not change

No new pricing step, no order column, no totals row, no change to `round10`, `depositOf/balanceOf`,
`taxBreakdown`, modifiers, surcharges, delivery, or the min-charge. An ops price override
(`price_calculated` set) bypasses the engine entirely and therefore never re-applies the referral
discount — AC-59 is satisfied by the existing override semantics, untouched.

### 5.4 The quote badge and the two synchronisation problems

**Unissued surfaces (draft, preview):** the badge is derived live — `referralDiscountState.state ===
'available'` ⇒ `referral: { percent, referrerName }` on the draft/preview DTOs. Live state and stored
figures agree because pricing is per-call and AC-72's re-price keeps stored drafts in sync (below).

**Issued quote and order:** frozen figures need a frozen fact (F3). `issueQuote` stamps
`project.referral_percent_at_issue = referralDiscountState(owner).state === 'available' ? percent :
NULL` at the same moment delivery freezes. `GET /projects/:id/quote` and the order views derive
`referral: { percent, referrerName } | null` from that column + the referral row. Re-issue re-stamps;
AC-54 (issued price never re-priced) is untouched because only the *label* is stamped, never a price.

**AC-72 (stale drafts):** `stripReferralFromDrafts(env, userId, excludeProjectId?)` — for every
project owned by the user in a pre-issue state (`status_customer='draft'`, or `status_internal` in
the ops-mutable set `submitted / triage_pending / estimator_assigned / technical_review_required /
customer_clarification_required`) with no order: re-run `priceItem` per parent line (skip lines with
`price_calculated` set — the override stands, AC-59), `recomputeComposite` for composite parents,
write `line_total`. Implemented beside `priceItem` in `worker/lib/lines.ts` (it is a pricing act);
called by `referrals.ts` from `onOrderCreated` (use) and the expiry sweep (§8). Issued quotes are
excluded by the state filter — AC-54.

### 5.5 GST interaction

Nothing to build: the discount lands inside `line_total`, which flows through `taxBreakdown`
(`src/data/gst.ts:58`) like every price. AC-56 is a verification obligation (test §13.4), not a code
path.

---

## 6. Attribution mechanics (T3)

### 6.1 `/r/<CODE>` — worker-level route

In `worker/index.ts route()`, immediately after the trailing-slash redirect (GET/HEAD only, non-ops
host): `^/r/([A-Z2-9]{3}-[A-Z2-9]{3})$` (case-insensitively matched, uppercased) →
`handleReferralLink(env, code)` in `referrals.ts`:

- Code resolves to a non-internal user who is **currently payable** (ADR-8b) **and** program status is
  `active` → 302 `/refer` with `Set-Cookie: of_ref=<CODE>; Path=/; HttpOnly; SameSite=Lax;
  Max-Age=7776000` (+`Secure` in prod, same pattern as `sessionCookie`).
- Unknown code, staff-owned code, dormant code (referrer cleared details), or program
  `paused`/`terminated` → 302 `/refer`, **no cookie**, no error (AC-4, AC-62). `/refer` itself never
  404s in any status (spec §4.7).

Status and payability are checked **again** at recording time (a click during `active` followed by a
signup during `paused`, or after the referrer cleared details, records nothing).

### 6.2 The signup hook — AC-7 by construction

`findOrCreateUser(env, email, referralCode?)`: the **create branch only** (`auth.ts:146-151`) calls
`recordReferralAtSignup(env, newUser, code, 'link')` inside try/catch (log-and-continue — a referral
bug must never break sign-in). The existing-user branch never sees the code, so an existing customer
clicking a referral link structurally cannot record anything (AC-7). Return gains `created: boolean`;
`/verify` passes the `of_ref` cookie value and, when `created`, appends
`clearCookie("of_ref", env)` (AC-6). For an existing user the cookie is left alone — a different,
genuinely new email on the same browser inside 90 days is still a valid capture (AC-14 is the
cookie's own Max-Age).

### 6.3 Recording gates — one function, both sources

`recordReferral(env, { referredUser, code, source })`, shared by the signup hook and manual claim:

1. program `status === 'active'` (AC-62); 2. code resolves to referrer; referrer not internal
(A14/AC-5), not the referred user (A11 — plus the table CHECK), and **currently payable**
(`payoutComplete`, ADR-8b); 3. referred user not internal (A14); 4. no existing referral for referred
user (A9 — the UNIQUE index is the last word under concurrency; the INSERT failure maps to
`already_referred`); 5. **manual source only:** account has no order (A5/AC-9); 6. ABN gate when
*both* sides have one: digits-only compare, match ⇒ refuse (A13/AC-12 — note that under D18 the
**referrer** always has an ABN, so the manual-entry path tests this whenever the referred user set one
first; the link-signup path still cannot fire it, and spec §4.6.6's containment stands, not upgraded).
On success: snapshot the five program values + `expires_at = created_at + window_months`, insert,
send the `referral_recorded` email (referred party identified per the AC-26 masking rule), `logEvent`
(entity `referral`).

Manual claim route errors are enumerated for the UI: `invalid_code` (unknown, staff-owned **or
dormant** — deliberately indistinguishable, ADR-8b), `own_code`, `already_referred`, `has_order`,
`program_paused`, `program_ended`, `not_eligible` (ABN match — deliberately unspecific).

**The referred side is never gated by D18.** Manual entry, the discount, the offer panel — none of
them consult the *referred* user's payout details. D18 gates becoming a referrER only.

### 6.4 Codes

`ensureReferralCode(env, userId)` — refused for `type='internal'` (AC-5) **and while
`!payoutComplete(user)`** (D18, ADR-8a); generated on first demand once payable, stable and permanent
thereafter (AC-1 as amended, §17): alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no O/0/I/1, AC-2),
format `XXX-XXX` (~8.9 × 10⁸ codes), retry on UNIQUE collision (AC-3).

---

## 7. Earning lifecycle and program semantics (T4)

### 7.1 Creation — `onOrderCreated`

For the order's project owner: fetch the referral row (`status='recorded'`); if none, return. If
`created_at(order) > expires_at` → derived-expired, nothing created (AC-13). If
`referrer_reward_active = 0` → no earning (AC-60; the vice-versa: the discount side never gates the
money side). Otherwise create **exactly one** earning row (the `order_id` UNIQUE and the referral's
one-first-order semantics make a second order a no-op — AC-22):

- `base_amount` = `taxBreakdown("ex", { lineTotalsInc: parent order_line line_totals, deliveryInc: 0,
  totalInc: goods }).goods` — the same per-line taxable-supply rule the customer's own order screen
  renders, never a fresh `/1.1` (M3, AC-16); delivery excluded by construction (M1, AC-17). Parents
  only, same rule as every money read.
- Qualifying: `base_amount ≥ referral.min_order_amount` (snapshot, post-discount figure — §4.6.5)
  ⇒ `status='pending'`, `amount = min(round2(base × rate_percent/100), cap_amount ?? ∞)` (AC-19,
  AC-24). Below minimum ⇒ the row is created **`void`, reason `below_minimum_order`** so the referrer
  status ("Not eligible") and the ops view derive cheaply (AC-18); ops un-void is the knife-edge
  override (§4.6.5).
- ABN re-check (A13 late limb): both ABNs present and matching ⇒ `void`, reason `same_abn` (AC-12).

Then `stripReferralFromDrafts(env, owner, orderProjectId)` (AC-72) — eligibility itself needs no
write; `used` is derived from the order's existence (AC-53).

### 7.2 Confirmation — `onOrderBalancePaid` (the payability instant)

Flip `pending → confirmed` and stamp `confirmed_at` **iff all of**: the order reached `balance_paid`
(M8; `deposit_paid` does nothing — AC-20), the order is not cancelled/refunded (F2 guard), the ABN
re-check still passes (void `same_abn` otherwise), and **the referrer is currently payable**
(`payoutComplete` — ADR-8c). When the payability condition alone fails (details cleared after
recording — the one reachable residue under D18), the earning **stays `pending`**: it has not become
payable, Victoria's clock has not started, and the account area says exactly what re-completing
details will release. The sweep (§8) confirms it the cycle after details return, stamping
`confirmed_at` then — the honest payability instant. Sends `referral_earning_confirmed` on the flip,
whichever path performed it. Program status is **not** consulted — AC-65 limb 1.

### 7.3 Void

Ops void (mandatory reason) for referral or earning any time before `paid` (A17, AC-40); automatic
voids carry machine reasons (`below_minimum_order`, `same_abn`, `order_cancelled`, `order_refunded`,
`expired` never voids — it derives). Un-void restores `recorded`/`pending|confirmed` (recomputing
confirmed vs pending from the order's current stage and current payability).

### 7.4 The derived cancel/refund guard (F2, ADR-7)

`confirmEarning` and the payout-queue query both join the order and auto-void
(`order_cancelled`/`order_refunded`) when `"order".stage='cancelled'` or
`payment_status='refunded'`. No live path sets these today; the guard makes the M9 promise hold the
day one does, and the test sets the columns directly (AC-21).

### 7.5 Program status — one table, implemented as written

| Concern | Reads | `active` | `paused` | `terminated` |
|---|---|---|---|---|
| New attribution (link + manual) | live `status` + referrer payability | yes | no | no |
| Cookie set by `/r/` | live `status` + referrer payability | yes | no | no |
| Code issuance | payability only (ADR-8a) | on demand | on demand | no (no code without a program) |
| Discount on a pricing call | **snapshot** percent/expiry; live `referred_discount_active` only | yes | yes | **yes** (AC-66) |
| Earning create / confirm / payout | **snapshot** values; live `referrer_reward_active` at create; payability at confirm (§7.2) | yes | yes | **yes** (AC-65) |
| `/refer`, placements | live `status` | full | hidden / "on hold" | removed / "ended" |
| Account Referrals section | live `status` + own history | full | full | read-only w/ history; absent without (AC-64) |
| §8.6 offer panel | derived state only | shown per state | shown per state | shown per state (AC-64/66) |

`status` is deliberately **absent** from `referralDiscountState`'s predicate and from every earning
function — the two limbs of AC-65/66 cannot regress via a status check because no such check exists
to get wrong. Stopping in-flight promises is only the bulk void (AC-67), a separate confirmed act.
Terminate/reverse require a typed confirmation string in the request body (AC-68).

---

## 8. Scheduled work and emails

`worker/index.ts scheduled()` (existing 10-minute cron) gains `referralSweep(env)`, caught separately
like its peers:

1. **Expiry processing (AC-72 limb):** referrals `status='recorded'`, `expires_at < now`, no first
   order, `expired_processed_at IS NULL` → `stripReferralFromDrafts`, stamp `expired_processed_at`.
   (`expired` state itself is derived; this only re-prices stale drafts.)
2. **Reminder (AC-77):** same set with `expires_at ≤ now + 30 days` and `reminder_sent_at IS NULL` →
   `referral_discount_expiring` email, stamp `reminder_sent_at`. Used/void/expired referrals are
   excluded by the predicate, so "no such email after" is structural.
3. **Late confirmation (ADR-8c residue):** `pending` earnings whose order is at/past `balance_paid`
   and whose referrer is now payable → confirm via the §7.2 predicate (stamping `confirmed_at` now —
   the true payability instant).

Four templates through the existing mechanism (`notify` + Sanity `emailTemplate` + inline fallback,
`worker/lib/emailTemplates.ts`): `referral_recorded`, `referral_earning_confirmed`,
`referral_payout_sent`, `referral_discount_expiring`. All figures in the copy are `vars` filled from
the referral snapshot / program config — never literals (AC-76 reaches emails). The recorded email
names the referred party by business name or masked email, the AC-26 rule.

---

## 9. Payout details, the run, and the access log (T8)

- **Save:** `PUT /api/account/payout-details` — BSB (6 digits), account number (5–9 digits), account
  name; ABN stays a profile field (`/api/auth/profile`). ABN validity = 11 digits + ATO checksum
  (pure helper in `referrals.ts`); no ABN-Lookup call in v1. Writes log a `change` access row
  (ADR-4). **Clearing** (blanking any of the three fields) is refused with a stated reason while any
  earning is `confirmed` and unpaid; otherwise allowed, with the ADR-8c consequences (dormant code,
  future earnings hold at `pending`). Because completing details is now the referrer's entry step
  (D18), this endpoint returns the resulting gate state (`referrerGate`, §10.2) so the UI can move
  straight to the code.
- **Masked read-back everywhere on the customer API:** `BSB 063-••• · account ••••1234` (AC-29).
- **Ready queue:** confirmed earnings grouped per referrer. Under D18 a confirmed earning's referrer
  had complete details at confirmation, and clearing is blocked while confirmed-unpaid money exists
  (ADR-8c) — so **every confirmed group is payable and the spec's "blocked on missing ABN/details"
  group is unreachable and is not built** (was AC-28's surface; §17). Two groups remain: **ready**
  (at/above any threshold, or force-promoted by the 11-month long-stop — ADR-8e) and **accruing**
  (under a non-zero threshold; visible, excluded from the run, payable by explicit override — AC-61).
- **Mark paid:** creates one `referral_payout` row per referrer (freezing ABN + bank details), flips
  the included earnings to `paid` with `payout_id`, stamps `paid_at`/`paid_by`/`reference`, emails
  each referrer (AC-43). **Failed:** payout row → `failed`, earnings back to `confirmed`,
  `payout_id` cleared — the failed row is the history (AC-44); the clearing-refusal (ADR-8c) covers
  these revived earnings too. Payout rows never change when the user later edits details (AC-45,
  AC-30).
- **CSV:** name, ABN, BSB, account number, account name, amount, referral references (AC-42).
- **Access log:** the only unmasked readers are the ops payouts response and the CSV, both of which
  obtain the numbers exclusively through `unmaskedPayoutDetails(...)`, which writes one `view` row
  per subject per call with context `ops_payouts` / `ops_csv` (ADR-4). No endpoint reads the log.

**GST display exemption (spec §4.4):** every figure in this section is a bare amount — nothing here
consults `price_gst_mode` (AC-31). The basis is stated in words in the copy.

---

## 10. API contracts

### 10.1 AC-75 as a type system fact

All referral response shapes are declared in **`src/data/referrals.ts`** and the route handlers are
typed against them (`c.json<T>(...)`-style annotation at the return site). Design rules, enforced by
the shapes themselves and re-checked by test (§13.5):

1. Exactly **one** percentage field exists across all customer-facing referral shapes:
   `referralPercent`. There is no field that could carry a combined or account figure.
2. `DiscountResolution`, `accountDiscountPercent`, and snapshot internals appear in **no** shape in
   this file — they are `worker/`-side types only.
3. Quote/preview/order DTOs gain only `referral?: { percent: number; referrerName: string }` —
   `percent` sourced from the referral snapshot / issue stamp, never from a discount total.
4. Program figures (rate, discount, minimums, window, timeframe) are program facts, not account
   facts, and appear only in `ReferralProgramPublic`.

### 10.2 Public + customer (`worker/routes/referrals.ts`)

```
GET /api/referral/program            → { program: ReferralProgramPublic }   // NO auth
  ReferralProgramPublic = {
    status: 'active'|'paused'|'terminated',
    discountPercent, ratePercent, minOrderAmount, windowMonths,
    capAmount: number|null,               // null ⇒ render no cap clause (AC-35)
    minPayoutBalance: number,             // 0 ⇒ render no threshold language (AC-61)
    payoutTimeframeDays: number,          // s 32(2): stated at the point of offer (amendment D)
    referrerRewardActive, referredDiscountActive: boolean,
  }

GET  /api/account/referrals          → the referrer screen (auth; 403 internal users)
  { referrerGate: { complete: boolean, missing: ('abn'|'bank_details')[] },  // D18 (ADR-8)
    code: string | null,                               // null until the gate passes;
    shareUrl: string | null,                           // ensureReferralCode on demand once payable (AC-1 as amended)
    canEnterCode: boolean,                             // REFERRED side (A5) — never gated by D18
    referrals: [{ id, displayName /* business name else masked email (AC-26) */,
                  joinedAt, status: 'signed_up'|'quoting'|'ordered'|'paid_in_full'|'not_eligible' }],
    earnings: { pending, confirmed, paid },            // sums of rows (AC-27)
    earningRows: [{ id, referralId, amount, status, confirmedAt }],
    payout: { abnPresent, abnValid, bsbMasked, accountMasked, accountName,
              clearBlocked: null | { amount },         // ADR-8c: confirmed-unpaid money pending
              heldPendingDetails: null | { amount },   // ADR-8c residue: re-add details to confirm
              heldUnderThreshold: null | { balance, threshold } },          // AC-61
    payoutHistory: [{ paidAt, amount, reference, referralIds }],            // AC-30
    programStatus }                                    // drives §8.3(7) terminated rendering

POST /api/account/referrals/claim { code }             // manual entry (referred side); errors §6.3
PUT  /api/account/payout-details { bsb, accountNumber, accountName }        // §9; returns referrerGate
GET  /api/account/referral-offer     → { offer: null | {                    // §8.6 panel
    state: 'available'|'used'|'expired', referralPercent,
    expiresAt,                       // available
    usedOrderNo?, usedAt?,           // used
    expiredAt?,                      // expired
    referrerName } }                 // "thanks to …"; null for non-referred & for state 'void'
```

`referral-offer` derives from `referralDiscountState` + the order row — server-computed (AC-73), no
stored status (AC-71), nothing else in the payload (AC-75). A voided referral returns `offer: null`
(never happened, from the customer's side).

Existing DTOs: `GET /api/projects/current` and the price-preview response gain
`referral?: { percent, referrerName }` (live-derived, §5.4); `GET /api/projects/:id/quote` gains the
same from `referral_percent_at_issue`; order DTO gains it for the used order. **The preview endpoints
continue to return a bare total** — no discount field is added to them.

### 10.3 Ops (`worker/routes/ops-referrals.ts`, staff-gated like every `/api/ops` route — AC-47)

```
GET /api/ops/referrals/program                → full config + version
PUT /api/ops/referrals/program                → via applyPricingChange('referral_program')
                                                (stale version ⇒ 409 version_conflict, AC-38);
                                                status→'terminated' or leaving it requires
                                                body.confirm === 'TERMINATE' / 'REACTIVATE' (AC-68);
                                                setting min_payout_balance > 0 requires
                                                body.acknowledgeHold === true — the screen shows the
                                                stated Vic unclaimed-money warning (ADR-8e);
                                                logEvent before/after like pricing writes
GET /api/ops/referrals?status=&q=             → list; review flags computed live per row:
                                                sharedAbn / sharedPhone / sharedBusinessName /
                                                sharedPostcode (referrer vs referred user rows +
                                                latest project delivery_postcode) (AC-58, A15)
POST /api/ops/referrals/:id/void {reason} · /unvoid
POST /api/ops/referrals/bulk-void {ids|'all_recorded', reason, confirm:'VOID'}   // AC-67
GET /api/ops/referrals/payouts                → { ready: [ReferrerGroup], accruing: [...],
                                                  readyTotal }               // NO blocked group (§9)
  ReferrerGroup = { userId, name, abn, bsb, accountNumber, accountName,   // unmasked ⇒ logged
                    amount, earningIds, referralRefs,
                    oldestConfirmedAt, daysWaiting,
                    overPromise: boolean,          // daysWaiting > payout_timeframe_days (s 32(2) "met")
                    forcedByLongStop?: true }      // accruing → ready at 11 months (ADR-8e)
POST /api/ops/referrals/payouts/mark-paid {userIds, reference, includeUnderThreshold?}
POST /api/ops/referrals/payouts/:id/failed
GET /api/ops/referrals/payouts/export.csv?from=&to=
GET /api/ops/referrals/payouts/history?from=&to=      // accountant view, frozen rows
```

`/api/ops/summary` gains `referralPayoutsReady: { count, amount }` (0 ⇒ dashboard renders nothing —
AC-46). The ops project record (`GET /api/ops/projects/:id`) gains
`referral: { applied: boolean, percent, flags[] } | null` so a reviewer sees flags before issuing
(AC-58); the price-explain trace already shows composition via §5.2.

---

## 11. Unclaimed money (Victoria) under D18 — what remains, what was cut

D18 closes the front door: commission can never be earned by someone unpayable, and the §7.2
predicate means `confirmed_at` — the payability instant — only ever exists for a payable referrer.
Reassessed surface by surface:

**Kept, and why:**

- `confirmed_at` as the indexed payability instant, and `daysWaiting` / `overPromise` on payout
  groups — they earn their place on ACL s 32(2) grounds alone ("stated **and met**": the ops payouts
  screen shows every group's age against the advertised `payout_timeframe_days`).
- The 11-month long-stop force-promotion for accruing groups (ADR-8e) — the threshold hold is the one
  way AMJ's *own rule* could age money past the statutory 12 months, so the queue mechanically
  refuses to let it.
- The AC-28-derived "held" copy, retargeted: the account area explains a `heldPendingDetails` amount
  (ADR-8c residue) and a `heldUnderThreshold` amount (AC-61) — never a silent hold.

**Cut, because D18 makes the state unreachable (each was in revision 1 of this design):**

- The **blocked** payout group (referrers with confirmed money and missing ABN/details) and its
  9-month warning treatment — unreachable: confirmation requires payability, and clearing is refused
  while confirmed-unpaid money exists.
- The general **aged-unpaid-earnings view** as an unclaimed-money instrument, the chasing-workflow
  reservation, and the `remitted_to_state` future status — no follow-up is expected (per the
  coordinator: "there is no follow-up — the failure state is unreachable by construction").
- The `payout.blocked` field in the referrer DTO, replaced by `clearBlocked` / `heldPendingDetails`
  (§10.2).

**The honest residue, enumerated:** (1) confirmed money awaiting the weekly run — bounded by cadence,
visible via `overPromise`; (2) accruing-under-threshold money — bounded by the long-stop; (3)
`pending` money held by cleared details — not yet payable, so outside the s 3(1) definition, and
visibly explained to its owner. Nothing else ages.

---

## 12. Config-rendered figures (AC-76) and offer-point disclosure (amendment D)

One path: `referral_program` (D1) → `GET /api/referral/program` (public, unauthenticated — this is
how the landing page has figures before any auth) → every surface renders from that payload, and the
four emails render from `vars` filled server-side from the same row/snapshot. **No customer-facing
string contains a program figure literal** — the draft copy's `[rate] [discount] [minOrder] [window]
[cap] [threshold] [payoutDays]` slots are filled at render. `capAmount: null` ⇒ the cap clause does
not render at all (AC-35); `minPayoutBalance: 0` ⇒ no threshold language anywhere (AC-61).

Amendment D / s 32(2) placement rule: the landing page's fine-print block and the §8.3 "how you get
paid" card always state the payment timeframe (`payoutTimeframeDays`, e.g. "paid within N days of
your mate's order being paid in full"), and state the threshold hold sentence whenever
`minPayoutBalance > 0` — at the point the offer is made, not only in linked terms. Under D18 the
stated timeframe is conditioned on the eligibility rule the customer already met ("you'll have added
your ABN and bank details to get your code — that's the account we pay") — a copy note for the
coordinator's terms, recorded here so the timeframe promise and the gate cannot drift apart.

**A18/D18 copy rule (amendment C, ADR-8d):** the logged-out landing copy states that referring
requires **no purchase by the referrer**; the payment-details requirement is presented as *how you
get your code / where the money goes*, never as customer status. The two conditions are stated
separately on every surface that states either. Nothing in any API or table conditions any referrer
capability on the referrer's own orders — there is no such predicate anywhere in this design, and the
code-review checklist for T3/T7 includes confirming none was added.

---

## 13. Test plan

### 13.1 Suites and wiring

| Suite | Harness | Owns |
|---|---|---|
| `scripts/tests/pricing-golden.test.mjs` | esbuild-bundle pattern (as `unit.test.mjs`) importing `computePrice` | AC-49a corpus replay; composition arithmetic (AC-48) as pure cases |
| `scripts/tests/referral-pricing.test.mjs` | wrangler harness (`helpers.mjs`), `--test-concurrency=1` | AC-49b, AC-50–57, 59, 60, 66 (discount limb), 72, 73, 75 (API shapes), 5.4 badge rules |
| `scripts/tests/referral-lifecycle.test.mjs` | wrangler harness | AC-1–24 (codes incl. D18 gate, attribution, money), 25–32, 38–47 (account + ops APIs), 61–68, 76 (API level), 77 (sweep), amendment A rows, ADR-8 scenarios (§13.7) |
| `scripts/tests/web/referral.spec.ts` | Playwright | Landing states (incl. signed-in-without-details CTA — D18), placements, offer panel three states, quote badge in both GST modes, AC-70 rendered copy, AC-74/31 toggle behaviour, AC-76 end-to-end (change config in ops UI → landing figure changes) |

`package.json`: `"test:referral": "node --test --test-concurrency=1
scripts/tests/pricing-golden.test.mjs scripts/tests/referral-pricing.test.mjs
scripts/tests/referral-lifecycle.test.mjs"`, appended to the `test` chain.

### 13.2 AC-49 — the proof, assessed and extended

The spec's four-part method is **sufficient in substance**; this design pins its mechanics and adds
one guard:

- **49a.** `scripts/capture-pricing-fixtures.mjs` builds the corpus **at the branch point, before any
  change to `worker/lib/estimator/pricing.ts`**, and commits fixtures + script in a standalone commit
  (T0) so provenance is visible in history. Corpus = pure `computePrice` cases (explicit rate card /
  modifiers / surcharges / discount inputs) covering every bullet the spec lists (anonymous 0%,
  default 5%, staff 0%, min-charge-driven, modifier fired/not, composite parent+segments, $10
  rounding boundary and mid-band, qty > 1). `pricing-golden.test.mjs` replays and asserts deep
  equality on `unit`, `total`, `depositAmount`, `discountPercent`, `appliedModifiers` — and asserts
  the two new snapshot keys are **absent**.
- **49b.** Integration: seeded non-referred account, price the same line via customer preview and ops
  preview before/after a referral exists for a *different* user; assert equality with
  `user.discount_percent` pricing in every program status including `terminated` and with
  `referred_discount_active=0`.
- **49c.** `scripts/db/price-checksums.sql`: per-table `COUNT(*)`,
  `TOTAL(ROUND(line_total*100))`-style aggregates and min/max ids over `quote_line`, `order_line`,
  `"order"` (total, delivery_total), `payment`. Tester procedure (documented in the suite header):
  run against a copy of production, apply 0051, run again, diff — no inspection of the SQL.
- **49d.** Process rule, checked at design-conformance review and by the tester: the diff under
  `scripts/tests/` for pre-existing pricing suites shows additions only. **Added guard:** the golden
  suite is committed *green at T0*, so any later expectation edit is a visible fixture change, not a
  quiet test tweak.

### 13.3 AC-7 (attribution never fires for existing users)

`referral-lifecycle.test.mjs`: (1) login existing seeded user; visit `/r/<CODE>` through the same
`Session` cookie jar; re-login; assert **zero** `referral` rows via the ops list API and that the
account has no offer. (2) fresh email + cookie → exactly one row, cookie cleared (AC-6). (3) cookie
present but program paused at verify time → zero rows (AC-62).

### 13.4 AC-65/66 — one describe block, two limbs

Same subtest group ("termination honours what was promised") so they cannot drift: seed referral +
pending earning + an issued quote and an open draft for the referred user → terminate via the ops API
(typed confirmation) → assert (limb 1) balance-paid still confirms the earning and it appears in the
payouts queue and can be marked paid; (limb 2) a fresh price-preview for the referred user still
carries the referral percent, the offer panel still says available with the **original** expiry, the
issued quote's figures are byte-unchanged; and a new signup with the same code records nothing.

### 13.5 AC-75 — structural + behavioural

- Type level: shapes in `src/data/referrals.ts` per §10.1 (typecheck gate).
- Behavioural: the pricing suite walks **every** customer-facing JSON body produced in its scenarios
  (auth/me, projects/current, price-preview, quote, order, referral-offer, account/referrals,
  referral/program) with a recursive scanner: any key matching `/discount|percent/i` must be in the
  allowlist `{referralPercent, discountPercent?…}` — concretely: the only permitted percentage is
  `referralPercent`/`referral.percent` and its value must equal the referral snapshot component;
  the scanner fails on any value equal to `account + referral` composed. Also asserts the preview
  and quote endpoints carry no discount-named key at all beyond the `referral` badge object.

### 13.6 TDD sequencing

Every ticket below opens with its failing tests (the new suites grow subtest-by-subtest; Probity sees
red before each `worker/**`, `src/data/**` write). The natural order — schema (migration is not
gated) → failing lifecycle/pricing subtest → lib function → route — means the gate is satisfied
without ceremony. T0 is the one deliberate exception in spirit: the golden suite is written to PASS
against the current engine (its failing-state is trivially reached by running it before the fixtures
exist, then generating them).

### 13.7 D18 / ADR-8 scenarios (lifecycle suite)

1. **Gate on, gate off:** account without details → `GET /api/account/referrals` returns
   `referrerGate.complete=false`, `code: null`; add ABN via profile + details via
   `payout-details` → code issued, stable across repeat requests (AC-1/AC-2/AC-3 run *after* the
   gate).
2. **A18 regression (ADR-8d):** brand-new account, zero orders, complete details → gets a code; a
   fresh signup under it records a referral. Proves referring never required a purchase.
3. **Dormant code, both paths:** referrer clears details (no confirmed money) → `/r/<CODE>` sets no
   cookie; manual entry returns `invalid_code` (not a detail-revealing error); no referral row.
   Re-complete details → both paths work again.
4. **Pending-hold residue:** referral recorded → referrer clears details → referred order reaches
   `balance_paid` → earning stays `pending`, `confirmed_at` NULL, account shows
   `heldPendingDetails`; re-add details → next sweep confirms, `confirmed_at` stamped now.
5. **Clearing refusal:** with a `confirmed` unpaid earning, clearing returns the stated error with
   the amount; editing to new valid values succeeds; after mark-paid, clearing succeeds and the
   frozen payout row is unchanged (AC-45).
6. **Long-stop promotion (ADR-8e):** threshold on, accruing group with `oldestConfirmedAt` back-dated
   11 months → appears in `ready` with `forcedByLongStop`; and the program PUT refuses a non-zero
   threshold without `acknowledgeHold`.

---

## 14. Ticket sequencing (re-sequenced from the spec's §13, with reasons)

| # | Ticket | Content | Why this position |
|---|---|---|---|
| **T0** | Golden capture | `capture-pricing-fixtures.mjs`, fixtures, `pricing-golden.test.mjs` green; `price-checksums.sql` | Must predate any pricing change or the corpus proves nothing (AC-49a). |
| **T1** | Schema + config API | 0051; `referrals.ts` skeleton (incl. `payoutComplete` + ABN checksum) + `referral-discount.ts`; `GET /api/referral/program`; ops program GET/PUT via `applyPricingChange` (incl. `acknowledgeHold`); 49c procedure run once locally | Everything depends on the tables. Ops Program **screen** moves to T8 so the whole ops tab is one UX mock; demo via API. |
| **T2** | Pricing composition | §5 in full; referral rows seeded directly in tests (no capture path needed); AC-49 replay; issue-stamp + AC-72 re-price | The spec is right that pricing goes early — it is the only ticket that can break existing quotes, and every later ticket demos against it. It needs T1's tables, not T3's capture UX. |
| **T3** | Codes + attribution | §6; D18 gate on `ensureReferralCode` + recording; payout-details endpoint (needed for the gate to be exercisable); `/r/`, cookie, `findOrCreateUser` hook, manual claim API, gates; §13.7 scenarios 1–3 | Payout-details moves up from T8 into this ticket: under D18 it is the referrer's entry step, not a payout-time detail. |
| **T4** | Earning lifecycle | §7; hooks at the three route sites; §7.2 payability predicate + pending-hold; derived cancel guard; expiry + late-confirmation sweep (sans email); §13.7 scenarios 4–5 | |
| **T5** | Account area (both screens) | Referrer section (gate-first empty state, code, share, list, earnings, held copy) + §8.6 offer panel | UX-mock-gated. |
| **T6** | Quote surface | Badge on `QuoteTotals`/issued quote/order; ops project-record flags | UX-mock-gated. |
| **T7** | Landing + placements | `/refer` all four states incl. signed-in-without-details CTA (D18), Sanity `page` record, sitemap, home/trade/footer/completed-order, s 32(2)/A18-vs-D18 copy placement (§12) | UX-mock-gated. |
| **T8** | Ops Referrals tab | Program + Referrals + Payouts screens (ready/accruing only — no blocked group), CSV, mark paid/failed, access-log wiring, dashboard row, aging display + long-stop (§9, ADR-8e); §13.7 scenario 6 | UX-mock-gated; one mock covers the tab. |
| **T9** | Emails + content + privacy | Four templates + reminder send in sweep; rules/T&Cs posts (coordinator copy); `PrivacyPolicyPage` update | Last: pure content + one cron branch. |

---

## 15. Rejected alternatives

| Alternative | Rejected because |
|---|---|
| Two config clocks (attribution vs discount validity) | Legal driver closed; two always-equal fields is drift surface with no purchaser; the split is one additive migration if ever needed (ADR-3). |
| Referral eligibility SQL inside `referrals.ts`, imported by pricing | Import cycle `pricing → referrals → lines → pricing`; works only by ESM evaluation-order accident (ADR-1). |
| Lifecycle hooks inside `orders.ts` (`markPaid`/`createOrderFromProject`) | Same cycle via `pricing → orders`; three route sites are explicit and testable (ADR-7). |
| Access log as `audit_event` rows | `GET /api/ops/audit` is a global viewer — exactly what amendment A forbids; filtering it there is a special case in a shared query (ADR-4, F5). |
| Badge derived from `quote_line.pricing_snapshot_json` | Customer edits null the column (F3); a badge that vanishes on edit is a support call. One stamp at the issue freeze instead. |
| Stored referral/discount status column (`available/used/expired`) | Second source of truth for a fact three records answer; spec §7 forbids it; also weakens the gift-card analysis (ADR-5). |
| Earning omitted entirely for below-minimum orders | The referrer's "Not eligible" status and ops visibility would need a phantom re-computation of the base; a `void(below_minimum_order)` row is one fact recorded once. |
| Inventing an `active` flag on `user` for A16 | No suspension concept exists anywhere; a dead column is worse than a recorded gap (F4). |
| **D18: issue the code inactive instead of withholding it** | Creates the exact unpayable-referrer window D18 exists to close; forces a specified degraded referred-side experience (dead code or discount-without-commission — both dispute generators); and the tradie it is "kind" to (one who read out a pre-details code) can only exist if this option is chosen (ADR-8a). |
| **D18: forbid clearing payout details outright** | Privacy-hostile — APP 11.2 requires destruction when no longer needed and research §5.2 recommends purging after the final payout. The narrow refusal (only while confirmed-unpaid money exists) keeps both obligations (ADR-8c). |
| **D18: demote `confirmed` earnings to `pending` when details are cleared** | Payability is a fact with a timestamp, not a togglable state — un-becoming payable is legal fiction and would falsify `confirmed_at`, the s 32(2)/unclaimed-money instant. The clearing refusal makes the case unreachable instead (ADR-8c). |
| Building the blocked-payout group and 9-month aging warning anyway ("just in case") | Dead code guarding a state D18 makes unreachable; the lifecycle tests assert the state cannot arise, which is stronger than a screen for it (§11). |
| Automated payment rail, RCTI generation, ABN Lookup verification, clawback | Spec §6 out of scope; research items are accountant/lawyer questions before launch, not build items. |

---

## 16. Decisions needed

Seventeen owner decisions plus D18 stand; nothing above reopens them. One item remains open, already
in flight:

1. **The advertised payment window (`payout_timeframe_days`, shipped default 14).** ACL s 32(2) makes
   this a stated promise that must be met, and it will be printed on the landing page and in the
   terms. With a weekly manual run, 14 days after the referred order is paid in full is comfortably
   met and honest. **Recommendation: 14 days.** The coordinator is putting the number to the owner;
   the design treats it as config either way — only the shipped default is in question.

Nothing else. All other choices in this document — including the three D18 open questions (withhold
vs inactive; cleared details; the threshold condition) — are engineering decisions, made and reasoned
in ADR-8.

---

## 17. Spec reconciliation required (for the product-manager)

D18 contradicts parts of revision 6. This design implements D18; the spec should be amended to match
so two documents do not describe the same situation differently:

| Spec item | Current wording | Amend to |
|---|---|---|
| **M11/M12** | Payout requires a valid ABN; without it the earning stays `confirmed` and the account area says what is missing. | The payability condition moves to programme entry (D18): an earning can only *confirm* for a payable referrer (§7.2). The confirmed-but-unpayable state is unreachable; the narrow `pending`-hold residue (details cleared after recording) replaces it. |
| **AC-1** | "Every registered customer account has exactly one referral code, generated on first demand" | "…every registered customer account **with complete payout details (ABN, BSB, account number, account name)** has exactly one code, generated on first demand once those details are stored and stable thereafter." |
| **AC-28** | "With money confirmed but no ABN or no bank details, the section states specifically what is missing and that the money is held, not lost." | Unreachable as written. Replace with the two reachable holds: money **pending** because payment details were removed (`heldPendingDetails`), and money **confirmed under the payout threshold** (`heldUnderThreshold`, existing AC-61) — each stated plainly, never silent. |
| **§8.3 empty state / item 5** | Empty state leads with the code and share button; "How you get paid" is a checklist unblocking payment. | Empty state for an account without details leads with "add your payment details to get your code" (D18 table); the details step is the *entry* to the programme, not a payment-time unblock. |
| **AC-34 / §8.1 logged-in state** | Logged in, `/refer` shows the user's own code and share link. | Logged in **with complete details** shows the code; logged in without shows the complete-your-details CTA (D18 table). |
| **A13 note** | "No ABN exists at signup, so this cannot fire at capture time for most accounts." | Still true for the referred side; note that under D18 the **referrer** always has an ABN, so manual-entry capture can now fire the gate whenever the referred user has set one. §4.6.6's containment argument is unchanged. |
| **A18** | Unchanged — and must visibly survive the D18 write-up: the gate is payability, never purchase (ADR-8d; ACL s 49). | Add one sentence distinguishing the two conditions so no later edit collapses them. |
| **§8.4(c) payouts** | Implies a blocked-on-details group could exist in the run. | Ready + accruing only; blocked is unreachable (§9, §11). |

New copy obligations from this design for the coordinator's terms/copy pass: the payment-timeframe
sentence conditioned on the entry rule (§12), the threshold-hold disclosure whenever set (§12), and
the ops-screen warning text for enabling `min_payout_balance` (ADR-8e).
