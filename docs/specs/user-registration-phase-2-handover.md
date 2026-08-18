# User registration — handover into Phase 2

Written 2026-08-19 at the close of Phase 1. Audience: the next session (fresh context, no memory
of how Phase 1 was built). Everything needed to start Phase 2 is here or linked from here.

---

## 1. Where things stand

**Phase 1 ("honest registration + the submission gate") is built, accepted and verified.** It is
**not yet deployed** — see §2 for the one blocked step.

Branch: `feat/user-registration`, tip `faa67f45` (plus any handover commits after it).

| Gate | Result |
|---|---|
| Node battery (`npm test`) | exit 0 — final suite 58/58; the intermittent accept/request-changes race passed cleanly |
| Playwright (`npm run test:web`) | **98 passed, 0 failed** |
| Acceptance — 57 criteria | **ACCEPTED WITH CONDITIONS**, `docs/specs/user-registration-phase-1-acceptance.md` |
| Design conformance | **CONFORMS** — every named artifact exists (design §17) |
| Security review | **PASS**, zero findings; five design-critical properties verified |
| security-sweep CI | green on the branch tip |

### What Phase 1 actually changed

1. **Submission requires an account.** `POST /api/projects/:id/submit` no longer accepts identity
   in the body; the anonymous submit path is deleted. Identity comes from the session, ownership is
   folded into the SQL (`WHERE id = ? AND owner_user_id = ?`).
2. **The gate is two stages, on the review screen:** sign in or create account (email OTP, inline)
   → your details (name, phone, address, delivery) → Submit. No separate name step inside the gate.
3. **Name is collected, never invented.** The old code derived a name from the email local part and
   stored it. Now a NULL name is *displayed* as the local part and never persisted; `NameStep`
   demands a real one at `/login` and via an interstitial.
4. **Delivery is never assumed.** It starts blank on every project (owner ruling MG-2: business
   users deliver to a customer's site, not their own address). Precedence: stored project delivery →
   the pre-gate postcode the visitor typed → empty.
5. **A disabled Submit is never unexplained**, on any stage (owner ruling, 2026-08-19: "one field,
   one press"). The `outstanding` list is stage-aware — pre-gate names only the delivery postcode;
   the details stage names account gaps plus delivery, in form order.
6. **New accounts are created at `discount_percent = 0`** — customer and internal/staff alike. The
   old `DEFAULT 5` gave every self-registered email trade pricing. Existing rows untouched.
7. **Migration `0053_user_account_address.sql`** — five nullable `ADD COLUMN`s on `user`
   (`address_line1/2`, `address_suburb`, `address_state`, `address_postcode`). Additive only.
8. **Anonymous browsing, configuring, live pricing and guest order-tracking are unchanged.**

### What Phase 1 deliberately did NOT do

- No ABN, no trade verification, no trade pricing anywhere in the UI (AC-41 enforces the silence).
- No ops surface shows the newly collected phone/address (deferred, spec §6.6 names the two files).
- Existing staff rows are still on 5% (only *creation* was fixed); the 3 prod accounts are not
  grandfathered as trade.
- The `/trade-account` page's fake form is **still dead** — the owner never confirmed wiring it to
  the enquiry pipeline, so it stayed out of scope. It still silently discards applications.

---

## 2. ⚠️ The one unfinished step — deploy

**Blocked, not forgotten.** The remote D1 migration apply is gated by the auto-mode classifier and
was denied. That gate is intentional (`.claude/skills/d1-migration-safety/`: "never look for a way
around it"), so it was not routed around.

Pre-apply safety work is **already done**:
- Production export: `backup-2026-08-19-0053.sql` (19 MB, repo root, gitignored — keep until the
  deploy is confirmed good).
- Pre-migration row counts: **users 6, memberships 2, projects 22, quote_lines 287, payouts 0.**
- Remote schema confirmed at `0052`; `0053` not applied.

**The remaining sequence** (the owner runs step 1 in their own terminal, or grants the permission):

```bash
npm run db:migrate:remote
```

Then, and only then:
1. Re-count those five tables; **any unexpected delta ⇒ stop and restore from the export.** (None is
   expected: `ADD COLUMN` cannot fire a cascade, and `membership` is `user`'s sole CASCADE child.)
2. `npx wrangler versions upload` — preview URL on production bindings, no traffic moved.
3. Read-only smoke check on the preview: an anonymous submit opens the gate; a returning account
   submits in one field and one press; no trade copy anywhere.
4. `npx wrangler versions deploy` to promote.
5. Merge `feat/user-registration` → `main` and push.

**Order matters:** the migration must land before the Worker, because the new code writes the
address columns. It is safe to apply first — the currently-live Worker does not reference them.

**Consequence to expect once live:** nobody can submit a quote without an account. Production holds
one anonymous submitted quote and one awaiting information; both remain trackable through the guest
flow, which is untouched.

---

## 3. Phase 2 — trade verification

Tracker: [issue #2](https://github.com/siaribuild/apertly/issues/2). Blocked by Phase 1 (#1) and by
the ABR key task ([#9](https://github.com/siaribuild/apertly/issues/9)).

### 3.1 Start here: five questions the owner deferred

The owner explicitly said: *"ask me those questions when we start working on P2."* They are recorded
in full on issue #2. **Do not spec Phase 2 before putting them to the owner.**

Their stated position: there should NOT be a separate registration path for business users —
`/trade-account` should host the *same* flow extended to capture an ABN, rather than being a special
signup or a conversion page. The account model already agrees (trade-ness is an axis; ABN has one
home). The open questions:

1. **The pre-quote problem.** Trade pricing changes the prices a tradie *sees while configuring*. If
   ABN is only captured in the submit flow, they configure the whole job at retail and discover trade
   pricing after submitting. Does ABN capture need to be reachable *before* quoting?
2. **Conversion is the majority path.** The 3 existing accounts, everyone who registers during
   Phase 1, every tradie who arrives via search, and every private customer who later starts a
   business must add an ABN *later*. Where — the profile page, as a first-class affordance?
3. **Does the submit gate show an ABN field to everyone?** (Recommendation was: no — it dilutes the
   time-waster filter.)
4. **What is `/trade-account` for, then?** Marketing page that drops into the same signup with ABN
   prompted? That also retires the fake form.
5. **Pending verification vs a live quote.** A gmail sole trader queues for ops review and meanwhile
   submits at retail. Reprice on approval, re-issue, or trade pricing only from approval onward?

### 3.2 Decisions already made (binding — do not re-litigate)

From `docs/specs/user-registration-grill-conclusions.md`:

- **D2 hybrid verification.** Auto-pass only when all three hold: ABN valid and active on the live
  ABR register; business name matches the ABR entity/trading name; email domain plausibly matches
  the business. Anything less — gmail included — goes to an **ops review queue, never auto-rejected**.
- **D2.1 duplicate ABN.** An ABN already trade-verified elsewhere can never auto-pass; a second
  application always queues for a human (who may knowingly allow, e.g. estimator + director). Never
  a hard block.
- **D3 ABR dependency approved.** Free ATO ABN-Lookup GUID; owner registers it (task #9). ABR outage
  ⇒ applications queue for manual review — nobody blocked, nobody waved through.
- **D4 pricing.** Trade verification sets the business-account default (5); the column stays
  per-account so ops can negotiate individual rates. Staff pinned to 0. The 3 prod accounts
  grandfathered as trade.
- **D5 advertising.** The *existence* of trade pricing is advertised; the percentage never appears.
- **D6 referrals.** Payout side stays business-only (ABN + bank details). Private users can be
  referred and sign up. No code change.
- **D7 three tiers.** Builder and tradie are both trade/business accounts, functionally identical in
  this work — the split is a **self-declared label** captured at registration for ops and for later
  features (plans upload). Private is the third.

### 3.3 Phase 2 scope, as cut

ABN + business name + builder/tradie label capture; live ABR check; the auto-pass triple; ops review
queue + outcome emails; the one-ABN rule; **existing staff rows pinned to 0%**; the 3 prod accounts
grandfathered trade; the referral payout form pre-fills ABN from the account; the ops project record
gains the read-only contact line deferred out of Phase 1.

### 3.4 Seams Phase 1 left for it

- `docs/specs/user-registration-phase-1.md` §6.6 — the ops contact line, naming
  `src/ops/ProjectRecord.tsx:228` and `worker/routes/ops.ts:532`.
- `user.discount_percent` — per-account, written only as a hard-coded `0` at the two INSERT sites
  today. Phase 2 is what makes it *granted*.
- `user.abn` already exists (customer-editable, unvalidated). `abnValid` is **checksum-only** — the
  live ABR lookup is the new part, and it benefits referrer payout validation for free.
- `organisation` / `membership` remain **unwired** — deliberately. Do not put account identity there
  without resolving ticket [#7](https://github.com/siaribuild/apertly/issues/7).

---

## 4. Rules that bit during Phase 1 (heed them)

1. **Run the suites sequentially.** `npm test` to completion, *then* `npm run test:web`. Concurrent
   runs starve each other and produce meaningless failures (an api parent-timeout and a referral
   setup timeout, both phantom).
2. **The per-recipient OTP cap is 5 per 15 minutes** (`worker/lib/auth.ts`). Two Playwright specs
   sharing a seeded staff address exhausted it and read as a broken sign-in handler, because
   `/challenge` is deliberately existence-neutral and returns `200 {ok:true}` while issuing nothing.
   **Every test/probe must mint its own address and its own `X-Forwarded-For`.**
3. **Never edit `/api/auth/verify`** (`worker/routes/auth.ts:70-121`). It carries the referral
   attribution seam, whose ordering (attribution → clear `of_ref` → claim-merge → session) is
   documented and test-enforced. Phase 1 achieved everything without touching it.
4. **No referral-code input on any form** — `worker/routes/referrals.ts:38-49`.
5. **No auth middleware exists.** Every route self-checks via `resolveUser`/`resolveStaff`; a new
   endpoint is unauthenticated by default.
6. **`user.email` UNIQUE is case-sensitive.** Every write path must `normEmail` first.
7. **Never rebuild a table.** `discount_percent`'s default was left alone precisely because altering
   it means rebuilding `user` — the operation that once cascade-deleted production rows.
8. **Agents must commit incrementally.** Two machine deaths during this work; both times the only
   thing that survived was what had been committed.

---

## 5. Open items not owned by Phase 2

| Item | Where |
|---|---|
| `/trade-account` fake form still discards applications | Phase 2 replaces it; owner declined an interim fix |
| Stale email keeps guest access after an ops email change (pre-existing authz gap) | task chip; full-pipeline — needs a decision on which email governs |
| Migration-order guard lost / vacuous assertion in `referral-lifecycle.test.mjs` | task chip |
| Flaky accept/request-changes race (503 vs 409 under load) | task chip; did not fire in the final two full runs |
| Dead "Delete account" button promises deletion, does nothing | task chip |
| ABN-less private referrers; SMS verification; guest-flow retirement; organisation wire-or-delete | issues [#4](https://github.com/siaribuild/apertly/issues/4), [#5](https://github.com/siaribuild/apertly/issues/5), [#6](https://github.com/siaribuild/apertly/issues/6), [#7](https://github.com/siaribuild/apertly/issues/7) |

---

## 6. Document map

| Document | What it is |
|---|---|
| `docs/specs/user-registration-grill-conclusions.md` | **The binding decision record.** Owner grill, D1–D10, invariants, actors |
| `docs/specs/user-registration-phase-1.md` | Spec rev 4 — 57 criteria, the acceptance contract |
| `docs/specs/user-registration-phase-1-design.md` | Architecture + **§16 interaction spec** (copy, states) + §17 conformance |
| `docs/specs/user-registration-phase-1-acceptance.md` | PM verdict, owner sign-off, security-gate record |
| `docs/specs/user-registration-phase-1-test-report.md` | Tester's per-AC evidence + the 14 executed abuse cases |
| `docs/mocks/registration-phase-1-submit-gate.html` | The owner-approved visual |
| `docs/adr/0001-submission-gate-identity-from-session.md` | Why identity comes from the session |
| `CONTEXT.md` | Domain vocabulary — *Submission gate*, *Account address* added here |
