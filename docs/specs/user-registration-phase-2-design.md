# User registration — Phase 2: design (trade verification / ABN / ABR)

Spec: `docs/specs/user-registration-phase-2.md` (revision 2, binding — 64 ACs, 16 abuse cases, 21 edge cases; §12 empty).
Grill: `docs/specs/user-registration-grill-conclusions.md` (D1–D10, P2-D1…P2-D4, A1–A4).
Handover: `docs/specs/user-registration-phase-2-handover.md` (§4's eight rules all apply).
Phase 1 design: `docs/specs/user-registration-phase-1-design.md` (§16 interaction contract still governs the gate).
Author: architect. Date: 2026-08-19. Branch: `feat/user-registration`. Phase 1 is DEPLOYED — this designs on live behaviour.

`d1-migration-safety` loaded (mandatory — §3). Skills applied: codebase-design (deep-module seams), domain-modeling (ADR in §2).

Status of "Decisions needed": **empty** (§16). Spec findings — places the spec is unbuildable exactly as written, with the recorded resolution — are in §14; none is a business decision.

---

## 1. Shape of the change

One verification engine, three doors, one ops queue. The deep-module bet of this phase:

- **`worker/lib/trade.ts` is THE verification engine** — application creation, the auto-pass
  triple, the duplicate rule, grant, reject, revoke, state derivation, and all four outcome
  emails live behind a handful of functions. Routes (`worker/routes/trade.ts` customer-side,
  `worker/routes/ops-trade.ts` staff-side) are thin translators; **no route writes a trade fact
  directly**, so a privileged path can never become the way around a gate (the
  `ops-referrals.ts` precedent).
- **`worker/lib/abr.ts` is the one place that knows ABR exists.** Credential, URL, timeout,
  JSONP quirk, defensive parsing — all behind `lookupAbn(env, abn)`. The engine consumes a
  typed result and never sees a URL or the GUID. The seam is real (two adapters: live ABR and
  the test stub, selected by `ABR_BASE_URL`).
- **`worker/lib/trade-match.ts` holds the two pure matchers** (business-name fuzzy match,
  email-domain plausibility) with zero imports — the unit-testable heart of the triple (§5).
- **`src/data/abn.ts` becomes the one home of ABN validity.** `abnValid` moves there verbatim
  from `worker/lib/referrals.ts:84` (which re-exports it — the exact precedent of
  `normalizePhone` → `src/data/phone.ts` in Phase 1), so the browser's client-side format check
  (AC-P2-7/16) and the Worker's are the same function. One validator, two callers, no drift.
- **Trade-ness is derived from a ledger, never stored as a status column** (§3). The
  `trade_application` table is the single source of truth for every verification fact except
  the live ABN/company/label/discount, which stay on `user` exactly as §4.7 requires.

```
             src/data/abn.ts  (abnValid moved; referrals.ts re-exports)
                   ▲                          ▲
   browser: gate ABN field          worker/lib/trade.ts  ◄── worker/lib/trade-match.ts (pure)
            TradeApplicationCard          │    ▲                worker/lib/abr.ts (fetch seam)
            JoinProgramFlow               │    │
                                          ▼    │
                            trade_application ledger (D1, migration 0054)
                                          ▲
              routes/trade.ts (customer, thin)   routes/ops-trade.ts (staff, thin)
```

Deliberately untouched, as the spec orders: `POST /api/auth/verify`
(`worker/routes/auth.ts:70-121`), the pricing engine
(`worker/lib/estimator/pricing.ts:356-369`, `:227-237`), `organisation`/`membership`, every
referral rule, and migration 0032's `DEFAULT 5`.

---

## 2. Domain vocabulary (CONTEXT.md — architect owns; updated with this design)

Changes to `CONTEXT.md`:

1. **Customer — redefinition** (deferred from Phase 1, required by the grill):
   > **Customer**: anyone with an account on the customer site — private or business. Trade
   > terms are not what makes someone a customer; they are what a *trade-verified* customer
   > pays. _Avoid_: client, user (ambiguous), buyer. The old "trade business… not a retail
   > consumer" wording is obsolete.
2. **Trade-ness (trade-verified)** — new axis entry:
   > An axis on an account, parallel to staff-ness and payability: whether the account's
   > business has been verified (ABR-checked or human-approved) and therefore *pays* trade
   > prices. It gates what an account pays, never what it can see. The live facts (ABN,
   > business name, builder/tradie label, discount) live on `user`; whether the account is
   > verified is derived from its trade applications, never stored as a status column.
3. **Trade application** — new entry:
   > One attempt to become trade-verified: the frozen submitted ABN, business name and label,
   > the ABR snapshot at lookup time, the queue reasons, the outcome, the deciding actor and
   > provenance (`auto` / `ops` / `grandfathered`). History, not a second home for the ABN —
   > the same frozen-copy pattern a Payout uses. The application whose approval currently makes
   > an account verified is its **standing grant**; a later approval supersedes it, a
   > revocation ends it.
4. **Auto-pass** — new entry:
   > The machine path through trade verification: ABN valid **and** active on the live ABR
   > register, submitted business name matches the ABR entity or trading names, email domain
   > plausibly matches the business, and no other account currently verified on that ABN. All
   > four or a human decides; nothing is ever auto-rejected.

The grill's referral-economics inequality invariant remains **Phase 3** scope (the phase cut
puts "CONTEXT.md invariants" there); recorded here so it is not read as forgotten.

**ADR:** `docs/adr/0002-trade-status-derived-from-application-ledger.md` — why trade status is
derived from the ledger rather than stored on `user` (short form: E-P2-6 makes "verified" and
"pending" simultaneously true, so a single status column is provably wrong; a stored flag plus
the ledger is two places for one fact and they *will* drift; deriving from the standing-grant
row makes the duplicate rule correct even after ops edits `user.abn`, because the verified fact
is the application's frozen ABN, not the editable live one).

---

## 3. Data model and migration plan

**`d1-migration-safety` analysis (mandatory).**

- New migration: **`migrations/0054_trade_verification.sql`** (highest existing is `0053`,
  applied in production; numbering continues).
- Content is **additive + targeted UPDATE only**: one `CREATE TABLE`, two partial
  `CREATE UNIQUE INDEX` + one `CREATE INDEX`, one `ALTER TABLE user ADD COLUMN`, two `UPDATE
  user` statements, three `INSERT INTO trade_application … SELECT` statements. **No table
  rebuild, no DROP, no default change** — migration 0032's `DEFAULT 5` on
  `user.discount_percent` stays untouched dead weight (changing it means rebuilding `user`,
  which is forbidden: handover §4.7).
- **Cascade inventory for every table touched** (per the skill; verified against `migrations/`):
  - `user` — touched only by `ADD COLUMN` and `UPDATE`, neither of which can fire a cascade.
    Its CASCADE children, for the record: `membership.user_id` (0001:42) and
    `ai_daily_usage.user_id` (0023:24). Nothing is dropped or rebuilt, so neither can fire.
  - `trade_application` — new table; no children reference it.
- The new table references `user(id)` **without** `ON DELETE CASCADE` (the referral-table
  precedent, 0051:93-94): verification history is an audit record and must survive; a `user`
  delete with applications present fails closed on the FK instead of silently destroying the
  ledger.
- Header comment in the migration must state:
  `-- children affected: none expected (additive CREATE TABLE / ADD COLUMN / UPDATE / INSERT only; membership and ai_daily_usage are user's CASCADE children and nothing here drops or rebuilds user)`.
- Remote apply follows the skill verbatim: production export first
  (`npx wrangler d1 export apertly-db --remote --output backup-<date>-0054.sql`), row counts on
  `user`, `membership`, `project`, `quote_line`, `payout`, `"order"` before/after — **all six
  must be identical** (AC-P2-53) — apply gated by auto-mode as always, migration before Worker.

### 3.1 Schema

```sql
-- The trade-verification ledger. One row per application attempt; the frozen
-- copy pattern (CONTEXT.md: Payout) — the account row holds the live fact,
-- this table holds what was submitted and what ABR said at that moment.
CREATE TABLE trade_application (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES user(id),   -- deliberately NO cascade
  -- Frozen submission. abn is normalised 11 digits; NULL only on grandfathered
  -- rows for accounts that held no ABN (nothing is invented — AC-P2-51/E-P2-9).
  abn             TEXT,
  business_name   TEXT,
  trade_label     TEXT,                                -- 'builder' | 'tradie' | NULL (not stated)
  source          TEXT NOT NULL DEFAULT 'profile',     -- 'trade_page' | 'profile' | 'submit_gate' | 'migration'
  -- Decision state.
  status          TEXT NOT NULL DEFAULT 'pending',     -- 'pending' | 'approved' | 'rejected'
  queue_reasons   TEXT,                                -- JSON array; NULL/[] on auto-pass
  abr_snapshot    TEXT,                                -- JSON (§6.3); NULL on grandfathered rows
  decided_via     TEXT,                                -- 'auto' | 'ops' | 'grandfathered'; NULL while pending
  decided_by      TEXT REFERENCES user(id),            -- staff id; NULL for auto + grandfathered
  decided_at      TEXT,
  decision_reason TEXT,                                -- ops free text (reject reason / approve note)
  -- Revocation of a grant this row made (the mirror of approval; P2-A11).
  revoked_at      TEXT,
  revoked_by      TEXT REFERENCES user(id),
  revoke_reason   TEXT,
  superseded_at   TEXT,                                -- set when a LATER approval replaces this grant
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- DB-enforced invariants, not code conventions:
-- at most ONE open application per account (P2-A10 / E-P2-5)…
CREATE UNIQUE INDEX trade_application_one_pending
  ON trade_application(user_id) WHERE status = 'pending';
-- …and at most ONE standing grant per account (what "currently verified" means).
CREATE UNIQUE INDEX trade_application_one_standing
  ON trade_application(user_id)
  WHERE status = 'approved' AND revoked_at IS NULL AND superseded_at IS NULL;
-- Duplicate-rule lookup path (D2.1).
CREATE INDEX trade_application_abn ON trade_application(abn) WHERE abn IS NOT NULL;

-- The self-declared builder/tradie label (D7). Lives on user: it is a live
-- account fact ops reads, editable later on the profile page (owner ruling Q5).
ALTER TABLE user ADD COLUMN trade_label TEXT;
```

**There is deliberately NO trade-status column on `user`.** "Currently verified" *is* "has a
standing-grant row"; "pending" *is* "has a pending row". §14.1 records why the spec's §9.1
five-value status cannot be one column (E-P2-6 requires verified + pending at once). The
customer-visible five-state vocabulary survives as a derived DTO (§6.4), which is also what
keeps the duplicate rule honest: ops editing `user.abn` (allowed, logged, non-granting — spec
§4.7) can never make an account look verified under an ABN that ABR never saw.

### 3.2 Data migration (same file — staff pinning + grandfathering, D4 / §5.9)

```sql
-- Staff never carry a customer discount (AC-P2-50). Phase 1 fixed creation only.
UPDATE user SET discount_percent = 0 WHERE type = 'internal';

-- Grandfathering: EXACTLY the three addresses the owner named on 2026-08-19
-- (spec §5.9) — never "all rows existing at migration time". Two hold no ABN and
-- are granted by owner decision, recorded as provenance 'grandfathered'.
-- The rate literal 5 below is the business-account default; the code authority is
-- TRADE_DISCOUNT_DEFAULT in worker/lib/trade.ts and the trade-verification suite
-- asserts the two agree (AC-P2-28/51).
UPDATE user SET discount_percent = 5
 WHERE type = 'customer'
   AND email IN ('gediminas.bereznevicius@gmail.com',
                 'sarah@northsidebuild.com.au',
                 'doni@siaribuild.com.au');

-- One approved ledger row per grandfathered account (AC-P2-40: their record reads
-- as grandfathered, not as a decision someone made). INSERT…SELECT so an address
-- absent from a local/dev database simply inserts nothing. abn is copied
-- normalised when present, never invented (E-P2-9).
INSERT INTO trade_application
  (id, user_id, abn, business_name, trade_label, source, status,
   decided_via, decided_at, decision_reason, created_at)
SELECT lower(hex(randomblob(16))), id,
       CASE WHEN abn IS NULL OR replace(abn,' ','') = '' THEN NULL ELSE replace(abn,' ','') END,
       company, NULL, 'migration', 'approved',
       'grandfathered', datetime('now'),
       'Grandfathered by owner decision (grill D4, 2026-08-19); not verified against ABR.',
       datetime('now')
FROM user WHERE type = 'customer' AND email = 'gediminas.bereznevicius@gmail.com';
-- (repeated verbatim for the other two addresses — three single-address
--  statements, so the reviewed SQL names each grant individually)
```

Row-count consequence: `trade_application` gains at most 3 rows; the six AC-P2-53 tables gain
none and lose none. Emails in `user` are already lowercase (`normEmail` on every write path),
so exact-match `IN` is safe; the migration still uses the exact strings from the spec.

---

## 4. The ABR client — `worker/lib/abr.ts` (new)

The one adapter to the ATO ABN Lookup web services (JSON endpoint,
`https://abr.business.gov.au/json/AbnDetails.aspx`). Everything a caller must know:

```ts
export type AbrLookup =
  | { outcome: "found"; abn: string; abnActive: boolean;
      abnStatusEffectiveFrom: string | null;
      entityName: string | null; entityTypeName: string | null;
      businessNames: string[];              // trading/business names, deduped, capped
      queriedAt: string }
  | { outcome: "not_found";   queriedAt: string }   // register answered: no such ABN
  | { outcome: "unavailable"; queriedAt: string };  // timeout / non-200 / parse fail / no GUID

/** ONE call per application. Never throws. Never logs the ABN or the GUID. */
export async function lookupAbn(env: Env, abn11: string): Promise<AbrLookup>;
```

- **Credential**: `ABR_GUID`, a Worker **secret** (`wrangler secret put ABR_GUID`; the owner
  registers it — issue #9). Declared optional in `worker/types.ts`. It exists only inside
  `lookupAbn`'s request construction: never in a DTO, never in a log line, never in an error
  message, never bundled client-side (it is not a `VITE_*` var, so the bundle cannot contain
  it — AB-P2-8's grep proves absence).
- **Missing GUID** ⇒ immediate `{ outcome: "unavailable" }` with a **once-per-isolate**
  `console.warn("[abr] ABR_GUID not configured — every application will queue for manual review")`
  (module-level flag; E-P2-18's "warns once at startup" resolved this way — Workers have no
  startup hook, first use is the honest equivalent).
- **Test seam**: `ABR_BASE_URL` (plain var, dev/test only) overrides the endpoint; the stub
  (`scripts/tests/abr-stub.mjs`, §11.6) is the second adapter that makes this a real seam.
  Production ignores it when unset.
- **Timeout / retry**: `AbortSignal.timeout(5000)`, **single attempt, no retry**. Doors (a)
  and (b) run interactively — a retry doubles the worst-case wait for a person watching a
  spinner, and the failure path is safe by design (queue, never block, never wave through —
  D3). The cost of a transient blip is one application that queues instead of auto-passing:
  ops minutes, not a lost customer. `ASSUMED: P2-ARCH-2` (§15).
- **Transport realities, named**: the JSON API is GET-only and takes `abn` and `guid` as query
  parameters. This is a server→server TLS call with no referrer and no browser history; the
  client never constructs or sees this URL, and no code path logs it. §14.3 records the
  AB-P2-16 interpretation this requires. The response is JSONP
  (`callback({...})`); the client requests `callback=abnCallback` and strips the wrapper
  defensively (accepts bare JSON too, in case the stub or a future API version returns it).
- **Defensive parsing** (ABR is outside the trust boundary): strings clamped (entity name ≤
  300 chars, ≤ 20 business names of ≤ 300 chars each), unknown fields dropped, anything
  malformed ⇒ `unavailable`. `AbnStatus === "Active"` (case-insensitive) is the one activity
  test; a branch/GST-only variation is Active and passes (E-P2-4 — GST registration is not a
  criterion and is not even read).
- **Logging**: the only permitted log line is the once-per-isolate missing-GUID warning and a
  generic failure note (`[abr] lookup failed: timeout|http|parse`) with **no ABN, no URL, no
  GUID, no response body** (AB-P2-8).

---

## 5. The matchers — `worker/lib/trade-match.ts` (new, pure)

Zero imports, no `Env`, no I/O — the unit-testable heart of the triple. Exported for
`scripts/tests/unit.test.mjs` (bundled the way `email-templates.test.mjs` bundles
`worker/lib/emailTemplates.ts`).

```ts
export function normalizeBusinessName(raw: string): string;
export function businessNameCandidates(raw: string): string[];   // splits "X T/A Y"
export function nameMatches(submitted: string, abrNames: string[]): { pass: boolean; matched: string | null };
export const FREE_MAIL_DOMAINS: ReadonlySet<string>;
export function emailDomainPlausible(email: string, names: string[]): { pass: boolean; domain: string; freeMailbox: boolean };
```

### 5.1 The fuzzy business-name match (the algorithm the spec left to me)

**Normalisation** (applied to the submitted name and to every ABR entity/trading name):

1. Uppercase; replace `&` with ` AND `; replace `P/L` with ` PTY LTD `.
2. Strip every character outside `A-Z 0-9 space` to a space; collapse whitespace.
3. Drop a leading `THE`.
4. Drop trailing legal-form tokens, repeatedly: `PTY`, `LTD`, `LIMITED`, `PROPRIETARY`,
   `INC`, `INCORPORATED`, `CO`, `COMPANY`, `TRUST`, `TRUSTEE`, `ATF`.
5. Canonicalise the tiny abbreviation table: `BROS` → `BROTHERS` (E-P2-20 names it) — nothing
   speculative beyond that.
6. `T/A` / `TRADING AS` in the *submitted* name splits it into candidate names, each matched
   independently (a match on either satisfies the criterion).

**Match test** — `nameMatches(submitted, [entityName, ...businessNames])` passes when, for any
ABR name, after normalisation:

- **Equality** of the normalised strings; or
- **Token-set containment** — one name's token set is a subset of the other's — *provided the
  smaller set has at least 2 tokens* (so `SMITH BROTHERS` matches
  `SMITH BROTHERS CONSTRUCTIONS`, but a bare `SMITH` does not match `SMITH BROTHERS`;
  single-token names must match by equality or similarity); or
- **Bigram Dice similarity ≥ 0.85** on the normalised strings (tolerates a typo or a small
  word-order/spelling drift).

**How strict this is, said plainly (what it lets through / what it queues):**

- *Passes*: exact names in any case/punctuation; legal-form differences
  (`Smith Bros` vs `SMITH BROTHERS PTY LTD` — E-P2-20's named case, via step 5 + suffix
  strip); reordered tokens; one extra/missing descriptive word when 2+ tokens are shared; a
  single realistic typo.
- *Queues (never rejects)*: acronym-vs-full (`JB Constructions` vs `Jones & Brown Building`),
  a renamed entity, franchise/branch names, a bare surname against a multi-word entity. The
  cost asymmetry is deliberate and stated: a false **negative** costs ops minutes (D2 designs
  for that); a false **positive** is one third of an auto-pass whose residual risk the owner
  already accepted (AB-P2-9 — name-copying is assumed possible; the matcher is UX, not
  security). Thresholds are `ASSUMED: P2-ARCH-3` (§15) and live as named constants in this
  module so tuning is a one-line change with a unit table behind it.

### 5.2 Email-domain plausibility (criterion 3)

1. Domain = the part after the last `@`, lowercased.
2. If it is in `FREE_MAIL_DOMAINS` ⇒ **fail, always** (D2: a free mailbox can never satisfy
   this). The maintained list ships with at least: `gmail.com`, `googlemail.com`,
   `hotmail.com`, `hotmail.com.au`, `outlook.com`, `outlook.com.au`, `live.com`,
   `live.com.au`, `yahoo.com`, `yahoo.com.au`, `ymail.com`, `bigpond.com`, `bigpond.net.au`,
   `icloud.com`, `me.com`, `mac.com`, `protonmail.com`, `proton.me`, `optusnet.com.au`,
   `tpg.com.au`, `iinet.net.au`, `internode.on.net`, `westnet.com.au`, `dodo.com.au`,
   `aol.com`, `msn.com`, `mail.com`, `fastmail.com`. Exported so the unit table pins
   membership; additions are one-line edits.
3. Otherwise take the **domain core** — the registrable labels with the public suffix stripped
   (`.com.au`, `.net.au`, `.org.au`, `.id.au`, `.au`, `.com`, `.net`, `.org`, `.co`, `.io`,
   `.build` — a small fixed list, not a PSL dependency), hyphens/dots removed — and compare
   against the **squashed** (space-stripped, normalised per §5.1) forms of: the submitted
   business name, the ABR entity name, and every ABR business name. Pass when the domain core
   and any squashed name **contain one another** (either direction, minimum 4 characters) or
   reach **bigram Dice ≥ 0.8**.
   - `northsidebuild.com.au` vs *Northside Building Pty Ltd* → `NORTHSIDEBUILD` is a prefix of
     `NORTHSIDEBUILDING` → pass. `siaribuild.com.au` vs *Siari Build* → equal → pass.
4. **No acronym matching** — `sbc.com.au` vs *Smith Building Co* queues. Acronyms are the lax
   direction (three-letter collisions are everywhere) and the failure mode of omitting them is
   a queue entry, which D2 prices as acceptable.

An unknown webmail provider not on the list is treated as a business domain — bounded
residual, named in §9.5.

---

## 6. The verification engine — `worker/lib/trade.ts` (new)

### 6.1 Interface

```ts
export const TRADE_DISCOUNT_DEFAULT = 5;   // D4's business-account default — THE one named place
                                           // (migration 0032's column DEFAULT 5 is dead weight;
                                           //  0054's grandfather literal is asserted equal by test)

export type TradeQueueReason =
  | "abn_inactive" | "abn_not_found" | "name_mismatch"
  | "email_domain" | "duplicate_abn" | "abr_unavailable";

/** Derived per read from the ledger — never stored, never cached, never in a session. */
export interface TradeState {
  verified: boolean;
  verifiedSince: string | null;
  provenance: "auto" | "ops" | "grandfathered" | null;
  label: "builder" | "tradie" | null;                 // user.trade_label
  abn: string | null;                                 // user.abn (the live fact)
  pending: { abn: string; businessName: string; createdAt: string } | null;
  history: { at: string; outcome: "approved" | "rejected" | "revoked" }[];  // outline only (AC-P2-13)
}
export async function tradeStateOf(env: Env, user: UserRow): Promise<TradeState>;

export type ApplyResult =
  | { ok: true;  status: "verified" | "under_review" }
  | { ok: false; error: "invalid_abn" | "invalid_business_name" | "invalid_label"
                      | "forbidden" | "application_pending" | "rate_limited" };
export async function applyForTrade(env: Env, user: UserRow, input: {
  abn: unknown; businessName: unknown; label?: unknown;
  source: "trade_page" | "profile" | "submit_gate"; ip: string;
}): Promise<ApplyResult>;

export async function approveApplication(env: Env, applicationId: string, actor: UserRow, note?: string):
  Promise<{ ok: true } | { ok: false; error: "not_found" | "already_decided" | "forbidden" }>;
export async function rejectApplication(env: Env, applicationId: string, actor: UserRow, reason: string):
  Promise<{ ok: true } | { ok: false; error: "not_found" | "already_decided" | "invalid_reason" }>;
export async function revokeTrade(env: Env, customerId: string, actor: UserRow, reason: string):
  Promise<{ ok: true } | { ok: false; error: "not_found" | "not_verified" | "invalid_reason" }>;

/** Ops queue + per-customer history DTOs (staff surfaces only — never customer-served). */
export async function pendingApplications(env: Env): Promise<OpsTradeApplication[]>;
export async function applicationHistory(env: Env, customerId: string): Promise<OpsTradeHistoryEntry[]>;

/** P2-A4: may this profile/payout write set user.abn to these digits? (§6.6) */
export async function abnWriteAllowed(env: Env, user: UserRow, digits: string): Promise<boolean>;
```

### 6.2 `applyForTrade` — the decision, in the spec's §4.5 order

1. **Normalise + format/checksum** (`src/data/abn.ts`): raw ABN longer than 32 chars, not 11
   digits after whitespace strip (non-ASCII digit lookalikes are simply not `\d` — AB-P2-13),
   or checksum-invalid ⇒ `invalid_abn`. **No row, no ABR call, no rate-limit spend** — a
   field error, exactly like a malformed phone (AC-P2-7).
   `businessName` required, trimmed, 1-200 chars ⇒ else `invalid_business_name` (200 matches
   the ops-PATCH company cap). `label` absent or one of `builder`/`tradie` ⇒ else
   `invalid_label`.
2. **Staff-ness**: `user.type !== 'customer'` ⇒ `forbidden` (AB-P2-11 — checked here AND at
   approval, so no path grants an internal account).
3. **One pending per account** (P2-A10): a pending row exists ⇒ `application_pending` (the
   route answers 409; E-P2-5). The partial unique index backs this against races.
4. **Rate caps, before any ABR spend** (AB-P2-6):
   `withinCap(env, "tradeapp:" + user.id, 5, 3600)` and
   `withinCap(env, "tradeip:" + ip, 20, 3600)` — the generalised challenge-counter machinery
   (§6.7). Either exhausted ⇒ `rate_limited` (429), **zero ABR calls**.
5. **Duplicate check** (D2.1): standing grants on *other* accounts with the same 11 digits —
   `SELECT user_id FROM trade_application WHERE abn = ?1 AND user_id <> ?2 AND
   status='approved' AND revoked_at IS NULL AND superseded_at IS NULL`. Revoked, rejected and
   superseded holders do not count (E-P2-8).
6. **ABR lookup** (`lookupAbn`).
7. **Evaluate**: `abn_not_found` / `abn_inactive` (criterion 1), `name_mismatch` (criterion 2,
   §5.1 against entity name + every business name — E-P2-3), `email_domain` (criterion 3,
   §5.2 against submitted + ABR names), `duplicate_abn` (step 5), `abr_unavailable` (lookup
   outcome `unavailable` — criteria 1 and 2 unevaluable; recorded as such in the snapshot
   rather than guessed).
8. **Write exactly one row**:
   - Reasons empty ⇒ INSERT with `status='approved'`, `decided_via='auto'`,
     `decided_at=now`, snapshot attached, **plus the grant batch** (§6.5), plus the
     `trade_approved` email. Route answers the constant body
     `{ ok: true, status: "verified" }` (AC-P2-4/20 — verified in the same interaction, no
     queue item).
   - Any reason ⇒ INSERT `status='pending'` with `queue_reasons` + snapshot, plus the
     `trade_ack` email. Route answers the constant body
     `{ ok: true, status: "under_review" }` (AC-P2-6/21-25).
   The two partial unique indexes make concurrent duplicates a constraint violation, caught
   and answered as `application_pending` — no torn state.

**The oracle property (AB-P2-7 / AC-P2-27) is structural:** every queued outcome returns the
identical constant body — no echo, no reasons, no ids, no timestamps — and the auto-pass body
is a second constant. Which criterion failed is written only to
`queue_reasons`/`abr_snapshot`, which only staff endpoints serve. §14.2 records why the
response must be constant.

### 6.3 The ABR snapshot (frozen evidence — AC-P2-26, E-P2-11)

`abr_snapshot` JSON, written once at evaluation time, never updated:

```jsonc
{
  "queriedAt": "2026-08-19T04:11:00Z",
  "outcome": "found",                       // found | not_found | unavailable
  "abnStatus": "Active", "abnStatusEffectiveFrom": "2014-07-01",
  "entityName": "SMITH BROTHERS PTY LTD", "entityTypeName": "Australian Private Company",
  "businessNames": ["SMITH BROS"],
  "evaluated": {
    "email": "sam@gmail.com",               // frozen — E-P2-11: later email edits change nothing
    "abnActive": true,
    "nameMatch": { "pass": true, "matched": "SMITH BROS" },
    "emailDomain": { "pass": false, "domain": "gmail.com", "freeMailbox": true },
    "duplicateOf": ["<other-user-id>"]      // ops-only surface; resolved to accounts at read time
  }
}
```

### 6.4 State derivation — `tradeStateOf`

Three cheap indexed reads on `trade_application` by `user_id` (standing grant, pending row,
decided/revoked history outline), plus the `user` row already in hand, composed into the §6.1
DTO. The five-state customer vocabulary (none/pending/verified/rejected/revoked) is a
**client rendering** of this struct, not a stored value; `verified` and `pending` can be true
together (E-P2-6) and every surface renders both.

Served to the customer on `GET /api/auth/me` (§7.1) — status only, **never**
`discount_percent`, never queue reasons, never other holders (P2-A7).

### 6.5 Grant, reject, revoke — the arithmetic (one writer each)

**Approve** (`approveApplication`, also the auto-pass tail):

1. Guarded claim: `UPDATE trade_application SET status='approved', decided_via=?,
   decided_by=?, decided_at=datetime('now'), decision_reason=? WHERE id = ? AND
   status = 'pending'` — `changes = 0` ⇒ `already_decided` (409; AC-P2-39, E-P2-17).
   Concurrent approves: exactly one statement wins; the grant runs once (AB-P2-14).
2. Refuse if the applicant row is not `type='customer'` (belt with §6.2's braces, AB-P2-11) —
   checked before the claim, and every grant UPDATE below carries `AND type='customer'`
   anyway (AC-P2-34).
3. `decided_by` must not equal the application's `user_id` (**nobody approves their own
   application**). Structurally impossible today — staff are `type='internal'` and internal
   accounts cannot hold applications — but the check is one line and survives any future
   loosening of either fact.
4. Grant batch (`env.DB.batch`, atomic):
   - Supersede the previous standing grant, if any:
     `UPDATE trade_application SET superseded_at=datetime('now') WHERE user_id=? AND id <> ?
      AND status='approved' AND revoked_at IS NULL AND superseded_at IS NULL`.
   - Write the account's live facts:
     `UPDATE user SET abn = COALESCE(?, abn), company = COALESCE(?, company),
      trade_label = COALESCE(?, trade_label) WHERE id = ? AND type='customer'`
     — application values; `COALESCE` so a gate-originated NULL label never blanks a stated
     value.
   - **The rate, only on a not-verified → verified transition** (AC-P2-28/29, P2-A5):
     `UPDATE user SET discount_percent = ? WHERE id = ? AND type='customer'` bound to
     `TRADE_DISCOUNT_DEFAULT`, executed **only when no standing grant existed at claim time**
     (the engine reads that before the claim, in the same request). A re-verification
     (E-P2-6) or an approval on an already-verified account leaves an ops-negotiated rate
     untouched.
5. `logEvent` (actor = staff id or `'system'` for auto, entityType `'user'`, entityId = the
   customer, action `trade.approved`, `after` = `{ applicationId }`) — the ABN is **not** in
   the action string (§9's logging rule).
6. `notify` → `trade_approved` (§6.8).

What approval never does — enforced by *absence*: no read or write of `project`,
`quote_line`, `"order"`; no call into pricing. AC-P2-31's row-by-row comparison passes because
no code path exists; the trade-verification suite greps the new modules for those table names
the way Phase 1's AB-12 grep proved the submit writers (absence proven, not assumed).

**Reject** (`rejectApplication`): reason required (trimmed, max 500) — AC-P2-38. Same guarded
claim with `status='rejected'`, `decided_via='ops'`. **No `user` write at all** — a rejection
never touches status, rate, or the stored ABN, and never revokes an existing verification
(P2-A11: a verified account whose *new* application is rejected stays verified until an
explicit revoke). `logEvent` + `trade_rejected` email.

**Revoke** (`revokeTrade`): acts on the **account**, not an application id. Guarded claim:
`UPDATE trade_application SET revoked_at=datetime('now'), revoked_by=?, revoke_reason=?
WHERE user_id = ? AND status='approved' AND revoked_at IS NULL AND superseded_at IS NULL` —
`changes = 0` ⇒ `not_verified` (409). Batch: `UPDATE user SET discount_percent = 0 WHERE
id = ?`. The ABN and company stay on the account (AC-P2-30 — it keeps working as a private
account; verified-ness is derived, so it is simply gone). `logEvent` + `trade_revoked` email
(owner ruling Q1). AB-P2-15 is free: pricing reads `discount_percent` per request
(`loadAccountDiscount`, untouched), so the next preview is retail with no session
invalidation.

### 6.6 The ABN's two writers — the P2-A4 lock

`worker/lib/account.ts` (`updateAccountDetails`) is the profile/payout writer of `user.abn`
today (the referral payout form calls `updateProfile({ abn })` —
`src/components/referral/JoinProgramFlow.tsx:78`). It gains one rule, implemented by asking
the engine (`abnWriteAllowed`):

- If the account has a **standing grant**: an `abn` key whose normalised digits differ from
  `user.abn` ⇒ `{ ok: false, error: "abn_locked" }` (400 from the route). Equal digits are a
  no-op and pass — a verified tradie joining the referral program with their own pre-filled
  ABN must not be refused.
- If the account has a **pending application**: same rule, compared against the pending
  application's frozen ABN.
- Otherwise: today's behaviour, byte-identical (owner ruling Q7 — a private account may still
  make itself payable here).

This is AB-P2-12/E-P2-19 made structural: the payout path keeps its non-granting write for
private accounts and loses only the swap. The route (`worker/routes/auth.ts` `/profile`) maps
the new result to `400 { error: "abn_locked" }`. `updateAccountDetails` also gains the
**`tradeLabel`** allowlist key (value `builder`/`tradie`, or empty → NULL; anything else
`invalid_fields`) — the label is self-declared, gates nothing (D7), and owner ruling Q5 wants
it settable from the profile page. It is deliberately NOT added to
`src/data/accountDetails.ts` (`submitMissing` must never demand it).

### 6.7 Rate limiting — reuse, not invention (spec §8.7)

`worker/lib/auth.ts` gains one exported generalisation:

```ts
/** KV counter with TTL — the challengeSourceAllowed machinery, key-agnostic. */
export async function withinCap(env: Env, key: string, max: number, windowSeconds: number): Promise<boolean>;
```

`challengeSourceAllowed` becomes a one-line delegate (`withinCap(env, "otpip:"+ip, 60, 3600)`)
— behaviour byte-identical, the existing AB-6 probes keep proving it. The trade caps (§6.2.4)
are the second caller; the known KV read-modify-write burst window is inherited, already
documented in that function's comment, and named again as residual in §9.5.

### 6.8 The four emails (spec §7 — mechanism verified, not assumed)

All four fire from `worker/lib/trade.ts` through the existing `notify(...)`
(`worker/lib/email.ts:65`) with dot-free `snake_case` `templateKey`s and inline fallbacks —
the `signin_code` pattern (`worker/routes/auth.ts:55-61`). Fallback subject/body are the spec
§7 table **verbatim** (the ux/copy stage may reword within the binding constraints):

| Fires in | `eventType` | `templateKey` | vars |
|---|---|---|---|
| `applyForTrade` queued tail | `trade.application.queued` | `trade_ack` | `name`, `business` |
| approve (auto AND ops) | `trade.application.approved` | `trade_approved` | `name`, `business` |
| reject | `trade.application.rejected` | `trade_rejected` | `name` |
| revoke | `trade.revoked` | `trade_revoked` | `name` |

`vars.name` is `user.name` (nullable — `applyPlaceholders` collapses a provided null to `""`,
so authored templates must not lead with a bare `Hi [name],`; noted for the Sanity authoring
task the spec already assigns the owner). No percentage, no timeframe, no other-holder
mention in any subject or body — asserted by `scripts/tests/email-templates.test.mjs`
(§11.4), not reviewed by eye. A send failure never fails the decision (existing `notify`
semantics: the notification row records `failed`; the grant/decision is already committed).

---

## 7. API contracts (exact shapes)

**No auth middleware exists** (handover §4.5): every handler below self-checks —
`resolveUser` on customer routes, `resolveStaff` + `hasAssignedRole` on ops routes. No
customer endpoint accepts a subject id anywhere (AB-P2-4: scoping is by session only).

### 7.1 Customer — `worker/routes/trade.ts` (new, mounted at `/api/trade` in `worker/index.ts`)

**`POST /api/trade/application`**

| | |
|---|---|
| Auth | session (`resolveUser`); 401 `{ error: "unauthorized" }`; `type='internal'` ⇒ 403 `{ error: "forbidden" }` |
| Request | `{ abn: string, businessName: string, label?: "builder" \| "tradie", source?: "trade_page" \| "profile" \| "submit_gate" }` — unknown keys **unread** (AB-P2-3: `status`, `abrSnapshot`, `decidedBy`, `discountPercent` fall on the floor because nothing looks at them); invalid `source` coerced to `"profile"` |
| 200 | **exactly one of two constant bodies**: `{ ok: true, status: "verified" }` or `{ ok: true, status: "under_review" }` (§6.2.8, §14.2) |
| 400 | `{ error: "invalid_abn" }` · `{ error: "invalid_business_name" }` · `{ error: "invalid_label" }` |
| 409 | `{ error: "application_pending" }` (E-P2-5) |
| 429 | `{ error: "rate_limited" }` (AB-P2-6, before any ABR call) |

The ABN travels in the **body** of a POST — never a query string or path segment (AB-P2-16).

**`GET /api/auth/me`** (changed — `worker/routes/auth.ts:23-27`; NOT the frozen `/verify`
range): the authenticated branch gains `trade: TradeStateDto` via `tradeStateOf`. The
anonymous branch is unchanged. `userDto` itself is untouched, so `/verify`'s response — which
serves `userDto` — is byte-identical and AC-P2-56 holds by construction.

### 7.2 Ops — `worker/routes/ops-trade.ts` (new, mounted at `/api/ops/trade`)

Every handler: `resolveStaff` ⇒ 403 `{ error: "forbidden" }`; then `hasAssignedRole` ⇒ 403
`{ error: "forbidden_role" }` (manufacturer partners excluded — AB-P2-11; owner ruling Q4:
assigned-role staff, **not** admin-only). `hasAssignedRole` moves to `worker/lib/staff.ts` as
an export; `worker/routes/ops.ts:100`'s local alias is replaced by the import (one line — the
predicate keeps one home; `isStaffUser` stays local to ops.ts for its other capability
aliases).

| Endpoint | Request | Responses |
|---|---|---|
| `GET /api/ops/trade/applications` | — | 200 `{ applications: OpsTradeApplication[] }` — **pending only** (AC-P2-35); each: `id`, applicant `{ id, name, email }`, `abn`, `businessName`, `label` (null ⇒ client renders "not stated"), `source`, `queueReasons[]`, `abrSnapshot`, `createdAt`, `duplicateHolders: { id, name, email }[]` (resolved live from `evaluated.duplicateOf` — AC-P2-36) |
| `POST /api/ops/trade/applications/:id/approve` | `{ note?: string }` | 200 `{ ok: true }` · 404 · 409 `{ error: "already_decided", outcome }` (AC-P2-39) |
| `POST /api/ops/trade/applications/:id/reject` | `{ reason: string }` (required) | 200 `{ ok: true }` · 400 `{ error: "invalid_reason" }` · 404 · 409 as above |
| `POST /api/ops/trade/customers/:id/revoke` | `{ reason: string }` (required) | 200 `{ ok: true }` · 400 · 404 · 409 `{ error: "not_verified" }` |

Decision scoping filters are the §6.5 guarded UPDATEs — the WHERE clause is the authorization
of the *state transition* (`AND status='pending'` / `AND status='approved' AND revoked_at IS
NULL AND superseded_at IS NULL`); staff may act on any customer's application because that is
the job, and every action is `logEvent`-attributed (AC-P2-42).

### 7.3 Ops — changed endpoints in `worker/routes/ops.ts`

- **`GET /api/ops/summary`** (line 292): the counts SELECT gains
  `(SELECT count(*) FROM trade_application WHERE status='pending') AS trade_applications`;
  the response gains `tradeApplications` (AC-P2-35's count-without-opening; the degraded
  branch pins it 0 like the others).
- **`GET /api/ops/customers`** (line 1399): SELECT gains `u.discount_percent`,
  `u.trade_label`, and a standing-grant subselect
  `EXISTS(SELECT 1 FROM trade_application t WHERE t.user_id = u.id AND t.status='approved'
  AND t.revoked_at IS NULL AND t.superseded_at IS NULL) AS trade_verified`;
  response rows gain `tradeVerified`, `tradeLabel`, `discountPercent` (read-only list columns
  — AC-P2-41's "alongside"; ops is not a customer surface).
- **`GET /api/ops/customers/:id`** (line 1473): the `customer` object gains
  `discountPercent` (read-only — there is deliberately **no PATCH for it**: spec §2.2 keeps
  the rate editor out of this phase), `tradeLabel`,
  `trade: { verified, verifiedSince, provenance }`, and a new
  `tradeHistory: OpsTradeHistoryEntry[]` — every application in order with
  `{ at, abn, businessName, outcome: "approved" | "rejected" | "pending" | "revoked",
  reasons, decidedVia, decidedBy: { id, name } | null, decisionReason }` (AC-P2-40;
  grandfathered rows read `decidedVia: "grandfathered"`, and a NULL abn renders
  "no ABN on file" — E-P2-9). An approved-then-revoked row yields two history entries
  (decision + revocation) so the timeline reads in true order.
- **`PATCH /api/ops/customers/:id`** (line 1427): **unchanged** — the ops ABN edit stays
  non-granting and logged, exactly as spec §4.7 orders.
- **`GET /api/ops/projects/:id`** (the record endpoint `ProjectRecord.tsx` reads; the
  response assembly around `worker/routes/ops.ts:519-536`): the `project` object gains the
  carried Phase-1 seam (AC-P2-55): `customerPhone` and
  `customerAddress: { line1, line2, suburb, state, postcode } | null` read from the owner
  `user` row — read-only display for staff who already see this customer's PII under the same
  assigned-role gate.

### 7.4 Client data layer — `src/data/api.ts` and `src/ops/api.ts`

```ts
export interface TradeStateDto {
  verified: boolean; verifiedSince: string | null;
  label: "builder" | "tradie" | null;
  abn: string | null;
  pending: { abn: string; businessName: string; createdAt: string } | null;
  history: { at: string; outcome: "approved" | "rejected" | "revoked" }[];
}
// me() response type gains trade?: TradeStateDto (present iff authenticated).

export async function applyForTrade(input: {
  abn: string; businessName: string; label?: "builder" | "tradie";
  source: "trade_page" | "profile" | "submit_gate";
}): Promise<"verified" | "under_review">;   // throws ApiError otherwise (existing pattern)
```

`src/ops/api.ts` gains: `opsTradeApplications()`, `opsTradeApprove(id, note?)`,
`opsTradeReject(id, reason)`, `opsTradeRevoke(customerId, reason)`; `OpsSummary` gains
`tradeApplications`; `OpsCustomer`/`OpsCustomerDetail` gain the §7.3 fields.

`src/data/abn.ts` (new): `normalizeAbn(raw): string` (whitespace-stripped),
`abnValid(raw): boolean` (moved verbatim with `ABN_WEIGHTS` from
`worker/lib/referrals.ts:76-95`), `formatAbn(digits)` for display.
`worker/lib/referrals.ts` re-exports `abnValid` from the new module — its callers
(`payoutComplete`, `payoutMissing`, every referral suite) are unmodified.

---

## 8. Client design (structure only — layout, copy and visual treatment belong to the ux/ui stage and the mock gate)

### 8.1 One component, three doors — `src/components/trade/TradeApplicationCard.tsx` (new)

The application UI is ONE component rendered on two surfaces (doors a and b), so AC-P2-10's
"no behavioural difference attributable to the entry point" is structural. Props:

```ts
{ user: AuthUser | null; onAuthed(u: AuthUserDto): void; onTradeChanged(): void;
  source: "trade_page" | "profile" }
```

States it renders (derived from `user`/`user.trade`, never stored):

| Condition | Panel |
|---|---|
| `user == null` (trade page only) | ABN + business name + builder/tradie label fields **plus** the inline `OtpSignIn` (Phase-1 component, Turnstile and caps unchanged — AC-P2-2). Entered values are **held in component state across the OTP** and posted via `applyForTrade` the moment `onAuthed` fires; a transient failure keeps the values on screen with a retry, and the person is signed in regardless (AC-P2-3) |
| signed in, not verified, none pending | The application form (ABN, business name, label; business name pre-filled from `user.company` — AC-P2-8), submitting via `applyForTrade` |
| `trade.pending` | Pending state: the submitted ABN shown, **no second application startable** (AC-P2-12); no reason shown, no rejection implied (AC-P2-6, P2-A3) |
| `trade.verified` | Active state: status + ABN (formatted, read-only — AC-P2-11), label, and the re-apply affordance for a changed ABN (E-P2-6) |
| history present | Outline list (date + outcome only) from `trade.history` (AC-P2-13) |

On any outcome the card calls `onTradeChanged()` → App refetches `me()` (the constant §7.1
response bodies carry no state — deliberate, §14.2). No percentage anywhere on the card; the
"trade pricing exists" line is one of the four AC-P2-48 surfaces and its copy is the ux
stage's within the D5 constraint.

### 8.2 Door (a) — `/trade-account` (`src/app/App.tsx` `TradePage`, lines ~1660-1720)

The marketing hero and benefits column stay; the **mock form card at App.tsx:1690-1704 is
deleted** and replaced by `TradeApplicationCard source="trade_page"` (AC-P2-1 — no field on
the page discards input). The page needs `user` + `onAuthed` props threaded from the shell
(the `case "trade"` site at App.tsx:2164). A signed-in verified visitor sees status, not a
form; a signed-in unverified visitor gets the form with no second OTP (AC-P2-8).

### 8.3 Door (b) — the profile page (`src/app/App.tsx` `ProfilePage`, lines ~1375-1420)

The free-text **Business details** card (company + ABN inputs, App.tsx:1400-1407) is
**replaced** by `TradeApplicationCard source="profile"`. The ABN ceases to be a free-text
profile input on this surface (AC-P2-11); business name is entered through the card as part
of an application. The card is also where the builder/tradie label is set later
(`updateProfile({ tradeLabel })` — owner ruling Q5). The affordance states that trade pricing
exists — no percentage, no worked example (AC-P2-9).

### 8.4 Door (c) — the submit gate (`src/components/QuoteReviewSubmit.tsx`)

Inside the existing details stage (no third stage — spec §2.3):

- **Rendered only when** `user.trade` is neither verified nor pending (AC-P2-19).
- Optional **ABN** field + **Business name** field that appears (and becomes required) only
  while the ABN field is non-empty (AC-P2-15). **No builder/tradie control** (Q5).
- Enablement folds into the existing `outstanding` caption machinery
  (QuoteReviewSubmit.tsx:418-437): empty ABN contributes nothing (AC-P2-14); a
  checksum-invalid ABN (via `src/data/abn.ts`, client-side, zero round trips) disables Submit
  and adds "ABN" to the caption; an ABN present with an empty business name adds
  "business name" (AC-P2-16). Clearing the field restores Phase-1 behaviour instantly.
- **Submit sequence**: the existing profile-diff + `onSubmit` runs unchanged; **after** the
  server confirms submission, the client fires `applyForTrade({ source: "submit_gate" })` —
  a separate authenticated request, so AC-P2-17's "no ABR round trip in the submit critical
  path" is structural, not a timing accident. The confirmation screen (`QuoteSubmitted`,
  QuoteReviewSubmit.tsx:121) gains an acknowledgement line when an application was created:
  ABN being checked, **no percentage, no timeframe, no repricing promise** (AC-P2-18). If the
  post-submit application call fails, the confirmation shows a quiet fallback pointing at the
  account page (door b) — the submission itself is already safe.
- The optional-field helper text is the fourth AC-P2-48 advertising surface.

`QuoteUser` (QuoteReviewSubmit.tsx:55) gains the trade facts it needs
(`tradeVerified: boolean; tradePending: boolean`); `toAuthUser`/App plumbing supplies them
from `me().trade`.

### 8.5 Ops console

- **`src/ops/OpsApp.tsx`** — Dashboard (line 367) shows the pending-applications count from
  the extended `/summary` (AC-P2-35: visible without opening the queue). Exact placement is
  the ux stage's (P2-A9); existence and count are not.
- **`src/ops/Customers.tsx`** — gains the trade-applications queue (P2-A9 puts it in the
  Customers area): queue list per §7.2's DTO (reasons, snapshot, duplicate holders with links,
  "not stated" label), approve/reject with reason, and on the customer 360:
  ABN + trade status + read-only `discountPercent` ("No ABN on file" explicit — AC-P2-41),
  the application history (AC-P2-40), and the revoke action with reason.
- **`src/ops/ProjectRecord.tsx`** (line ~228 header block) — renders the carried contact
  seam: customer phone + account address, read-only (AC-P2-55).
- **`src/ops/api.ts`** — the §7.4 functions/types.

### 8.6 Referral payout form prefill (carried seam, AC-P2-54 / E-P2-19)

`src/components/referral/JoinProgramFlow.tsx`:

- `PayoutDetailsForm` already accepts `initial`; the join-flow call site (line ~220) passes
  `initial={{ abn: user.abn ?? user.trade?.pending?.abn ?? "" }}` threaded from the pages
  (`src/pages/ReferPage.tsx:283`, `src/pages/ReferralsPage.tsx:77` — both already hold the
  auth user). Prefill only: not joining changes nothing (AC-P2-54).
- The submit handler (line ~68-90) skips `updateProfile({ abn })` when the digits equal the
  stored ABN (the common verified case — no write, no refusal), and maps the new
  `abn_locked` refusal to explanatory copy ("your ABN is verified / being checked" — final
  words at the ux stage; E-P2-19).

### 8.7 GST + pricing display (house rule, AC-P2-58)

No surface this phase adds displays a price: the trade page, profile card, ops queue and
emails are price-free, and the gate's pricing panel is untouched. AC-P2-5's "trade prices
while configuring" arrives through the existing preview path (`loadAccountDiscount`) with no
client change. AC-P2-58 is therefore satisfied by construction and asserted in Playwright
(no new price element bypasses `useGstMode`).

---

## 9. Security (mandatory)

### 9.1 Data classification

| Data | Class | Handling |
|---|---|---|
| `user.abn`, `trade_application.abn` | **Business PII** (identifier of a person's business; ABR data is a public register, but the *association* with an account, its email and its pricing is not) | Stored on the owning row + frozen application copies only; served to the owning session (`/me` trade DTO) and to assigned-role staff; **never in a URL** on our endpoints (POST bodies only), **never in a Worker log line** (AB-P2-8 — the grep in the trade suite proves it), never to another customer (constant response bodies, §6.2.8) |
| `abr_snapshot` (entity name, status, trading names, evaluation) | Commercial (register data + our judgment of the applicant) | Ops surfaces only; never in any customer DTO; capped/clamped at write (§4) so a hostile ABR response cannot balloon rows |
| `queue_reasons`, `duplicateOf` | Commercial — **the oracle surface** | Ops-only. A duplicate rejection email never mentions another account (AC-P2-44); the customer response never names a criterion (P2-A3) |
| `user.discount_percent` | Commercial | Written by exactly three writers after this phase: the grant (§6.5), the revoke (§6.5), and the 0054 migration. Read-only on ops customer surfaces; **never serialised into any customer-facing DTO** (P2-A7, AC-P2-47) |
| `user.trade_label` | Commercial, self-declared | Gates nothing (D7); customer-editable |
| `ABR_GUID` | **Credential** | Worker secret; exists only inside `lookupAbn`'s request construction; never logged, never in a DTO, never a `VITE_*` var (AB-P2-8) |
| `user.phone` / `user.address_*` on the ops project record | Personal PII | New *display* on an existing staff surface behind the same `resolveStaff` + assigned-role gate that already serves this customer's name/email/ABN (AC-P2-55) |

### 9.2 Trust boundaries

- **Customer browser ↔ Worker** — session cookie is the only identity; all client validation
  (checksum, business-name presence) is advisory and re-run server-side; the application body
  is allowlist-read (§7.1).
- **Ops browser ↔ Worker** — `resolveStaff` (Cloudflare Access in prod) + `hasAssignedRole`
  per endpoint; manufacturer partners refused on every trade endpoint (AB-P2-11).
- **Worker ↔ ABR** — NEW third party. Outbound only, TLS, credentialled with `ABR_GUID`,
  5-second deadline, response treated as untrusted input (clamped, schema-checked, anything
  odd ⇒ `unavailable` ⇒ queue). ABR being down, slow, or lying can only ever produce "a human
  looks at it" — never an auto-approval, never a block (D3).
- **Worker ↔ Sanity / Resend** — existing template and send paths, unchanged semantics
  (fallback on any miss; AC-P2-46).

### 9.3 Authorization per endpoint (the exact scoping filter, named)

| Endpoint | Who | The WHERE clause / structural scope |
|---|---|---|
| `POST /api/trade/application` | session holder, self only | No subject id exists in path, query or body (AB-P2-4 structural). Every read and the INSERT bind `resolveUser(...).id`: pending check `SELECT … WHERE user_id = ?session AND status='pending'`; INSERT binds `user_id = ?session`; internal accounts refused (`user.type !== 'customer'` ⇒ 403) |
| `GET /api/auth/me` (trade DTO) | session holder | `tradeStateOf` reads `WHERE user_id = ?session` only |
| `POST /api/auth/profile` (abn/tradeLabel) | session holder, self only | unchanged Phase-1 shape: `UPDATE user … WHERE id = ?session`; the new `abn_locked` rule *narrows* what the session may write to its own row |
| `GET /api/ops/trade/applications` | assigned-role staff | `resolveStaff` + `hasAssignedRole`; reads `WHERE status='pending'` (all customers — that is the queue's job); the read is `logEvent`-attributed like the customer list (`ops.ts:1409` precedent) |
| `POST /api/ops/trade/applications/:id/approve` | assigned-role staff | claim `UPDATE trade_application SET … WHERE id = ?1 AND status='pending'`; grant `UPDATE user SET … WHERE id = ?applicant AND type='customer'`; self-approval check (`decided_by <> user_id`, §6.5.3) |
| `POST /api/ops/trade/applications/:id/reject` | assigned-role staff | claim `… WHERE id = ?1 AND status='pending'`; **no user write** |
| `POST /api/ops/trade/customers/:id/revoke` | assigned-role staff | claim `UPDATE trade_application SET revoked_at … WHERE user_id = ?1 AND status='approved' AND revoked_at IS NULL AND superseded_at IS NULL`; `UPDATE user SET discount_percent = 0 WHERE id = ?1` |
| `GET /api/ops/customers`, `GET /api/ops/customers/:id`, `GET /api/ops/projects/:id` | assigned-role staff (existing gates, unchanged) | existing filters; new fields ride the same rows |

**Nobody approves their own application**: staff are `type='internal'`; internal accounts are
refused at application AND at approval (two independent checks); and the engine additionally
refuses `decided_by === application.user_id`. Three layers where one would do, because this is
the canonical failure the pipeline exists to prevent.

### 9.4 Abuse cases → structural answer (AB-P2-1…16)

| AB | Structural answer (where proven: `scripts/tests/trade-verification.test.mjs` unless noted) |
|---|---|
| AB-P2-1 self-grant | `updateAccountDetails` allowlist unchanged in shape — `discountPercent`, `tradeStatus`, `trade_verified`, `tier`, `type`, `role`, `id` are never read; `POST /api/trade/application` reads only `abn`/`businessName`/`label`/`source`. D1 re-read asserts the row |
| AB-P2-2 approve own application via ops routes | customer session fails `resolveStaff` ⇒ 403, no body data; probed for queue-list, approve, reject, revoke |
| AB-P2-3 crafting the outcome | `status`/`abrSnapshot`/`decidedBy`/`discountPercent` in the body are unread (nothing looks at them); status is whatever the server decided |
| AB-P2-4 reading another's ABN | customer endpoints carry **no subject id at all**; `/api/trade/application/:id` does not route (404 probed) |
| AB-P2-5 unauthenticated | both new route files answer 401/403 before any work; **ABR stub records zero calls** (stub hit-counter asserted) |
| AB-P2-6 rate caps | per-account (5/h) and per-IP (20/h) `withinCap` checks sit **before** `lookupAbn`; 429 + stub counter unchanged |
| AB-P2-7 criterion oracle | constant response bodies (§6.2.8) — byte-compared across abn-status / name / email-domain failures |
| AB-P2-8 credential + ABN in logs | GUID: secret, never interpolated anywhere but the fetch URL inside `lookupAbn`; bundle + response-body greps; log discipline: no ABN/URL/body in any `console.*` in `abr.ts`/`trade.ts` — source-grep asserted (the Phase-1 AB-12 pattern) |
| AB-P2-9 borrowed ABN | free-mail ⇒ criterion 3 fails ⇒ queued, never auto-approved. Residual (owner-accepted, spec §13.5): matching-domain + copied-name auto-passes; controls are ops visibility, human order review, one-action revoke |
| AB-P2-10 duplicate escalation | `duplicate_abn` forces queue regardless of triple; the customer response is the constant under-review body — B never learns of A (probed byte-compare) |
| AB-P2-11 staff/partner roles | internal refused at apply and approve (`type='customer'` in both guards); manufacturer fails `hasAssignedRole` on every ops-trade endpoint (probed with a manufacturer session) |
| AB-P2-12 swapping a verified ABN | the §6.6 lock: differing digits ⇒ `abn_locked` 400, row unchanged (D1-asserted) |
| AB-P2-13 unbounded input | raw-length caps before normalisation (ABN ≤ 32 raw, name ≤ 200, label enum); refusal names the field; nothing unbounded reaches D1 |
| AB-P2-14 replayed decision | the guarded claim (`WHERE status='pending'`) — second call, including concurrent, gets `changes=0` ⇒ 409; one decision row, `discount_percent` applied once (probed with parallel approves) |
| AB-P2-15 immediate revocation | `discount_percent` read per priced request via unchanged `loadAccountDiscount`; nothing trade-related is in the session or any token — revoke then preview asserts retail (Playwright `ops.spec.ts` + node) |
| AB-P2-16 ABN in transit | our endpoints: ABN only ever in POST bodies (route table §7); Playwright asserts no `abn` in any request URL. The outbound Worker→ABR GET is the one deliberate exception — §14.3 records the interpretation |

### 9.5 Residual risks, named

1. **Borrowed-ABN auto-pass** with matching domain + copied name — owner-accepted (AB-P2-9,
   spec §13.5). Bounded by ops visibility, human order review, revocation.
2. **Concurrent duplicate auto-pass**: two accounts applying with the same ABN in the same
   instant can both pass step 5 before either holds a standing grant. No per-ABN unique index
   is possible — D2.1 requires ops to be *able* to knowingly allow two holders. Window is
   milliseconds; both grants are visible on both records; revocation is one action.
3. **KV cap burst window** — `withinCap` inherits the documented read-modify-write gap of the
   challenge counters (`worker/lib/auth.ts:118-127`); ceiling on sustained abuse, not a mutex.
4. **Free-mail list completeness** — an unlisted webmail domain is treated as a business
   domain; it still has to fuzzy-match the business name to matter. List is one exported
   constant, tunable.
5. **Outbound ABR URL carries the ABN + GUID** (GET-only API) — server→server TLS, no
   referrer, never logged; §14.3.
6. **`isStaffUser` (ops.ts) and `hasAssignedRole` (staff.ts)** are the same predicate with two
   spellings after the §7.2 move; the ops.ts capability aliases still read the local one.
   Accepted to keep this diff off unrelated ops routes; cleanup chip.
7. **Ops PATCH abn edit** remains a third writer of `user.abn` (pre-existing, spec-sanctioned,
   logged, non-granting). Verified-ness derives from the frozen ledger, so this cannot mint a
   verified ABN — but the customer record can *display* a live ABN differing from the verified
   one; the ops history view makes the difference visible rather than hiding it.

---

## 10. Sequencing — build order, with the non-visual / visual seam made explicit

The orchestrator starts **track (a) immediately**; **track (b) waits for the owner's approval
of the ux/ui mock**. The seam is the client bundle: track (a) never touches `src/app/`,
`src/pages/`, `src/components/` (except the pure `src/data/` modules) or `src/ops/*.tsx`, so
the two tracks cannot collide in a file. Each numbered step lands red tests first (Probity),
then code, then a commit — incremental and killable (handover §4.8).

### Track (a) — NON-VISUAL (buildable now; spec §11 slices 1–2 plus slice 3's server half)

1. **`src/data/abn.ts`** — move `abnValid` (+ re-export from `worker/lib/referrals.ts`);
   unit table in `scripts/tests/unit.test.mjs`. Commit.
2. **`worker/lib/trade-match.ts`** — matchers + unit tables (AU name shapes, free-mail list).
   Commit.
3. **Migration `0054_trade_verification.sql`** + `npm run db:migrate:local`; re-read
   `d1-migration-safety` before authoring. Local verification per the skill (seeded child
   rows; counts). Commit. (Remote apply happens at deploy, after export — §3.)
4. **`worker/lib/abr.ts`** + `scripts/tests/abr-stub.mjs` + `Env` additions
   (`ABR_GUID?`, `ABR_BASE_URL?` in `worker/types.ts`). Commit.
5. **`worker/lib/trade.ts` + `worker/routes/trade.ts` + mount** (`worker/index.ts`), the
   `withinCap` generalisation in `worker/lib/auth.ts`, the §6.6 lock + `tradeLabel` key in
   `worker/lib/account.ts`, the `/me` trade DTO in `worker/routes/auth.ts`. The new
   `scripts/tests/trade-verification.test.mjs` grows with every slice: triple, duplicate,
   outage, oracle bodies, caps, mass-assignment, grant/revoke arithmetic. Commit per slice.
6. **Ops server side**: `hasAssignedRole` export in `worker/lib/staff.ts` (+ the one-line
   swap at `worker/routes/ops.ts:100`), `worker/routes/ops-trade.ts` + mount, the §7.3
   extensions to `/summary`, `/customers`, `/customers/:id`, `/projects/:id`. Authorization
   matrix tests (anonymous / customer / cross-customer / manufacturer / **non-admin
   assigned-role staff succeeds** / admin). Commit.
7. **Emails**: the four `notify` calls in `trade.ts`; extend
   `scripts/tests/email-templates.test.mjs` (keys dot-free, fallback used, authored template
   wins, no %/timeframe/other-holder in rendered output). Commit.
8. **Grandfathering + migration behaviour tests** in the trade suite (staff pinned, three
   named addresses, two with no ABN written, no other row changed, six row-counts identical,
   grandfather rate === `TRADE_DISCOUNT_DEFAULT`). Commit.

After step 8 the entire engine is deployable dark: no customer surface links to it, but the
API is live and node-verified — matching the spec's slice-1/2 landability requirement.

### Track (b) — UI (starts only after the mock gate; spec §11 slice 3 + the visible halves)

9. **`src/data/api.ts` / `src/ops/api.ts`** types + functions (§7.4) — first UI-track commit
   because both tracks' types must agree with what (a) shipped.
10. **`TradeApplicationCard`** + door (a) `TradePage` rebuild + door (b) `ProfilePage` rework.
11. **Door (c)**: `QuoteReviewSubmit` optional ABN + caption + post-submit application call +
    `QuoteSubmitted` acknowledgement; `QuoteUser`/App plumbing.
12. **Ops console**: `OpsApp` count, `Customers.tsx` queue + 360 + revoke,
    `ProjectRecord.tsx` contact line.
13. **Referral prefill** (`JoinProgramFlow` + the two pages) + `abn_locked` handling.
14. **Playwright**: `scripts/tests/web/trade-verification.spec.ts` (journeys §11.2),
    `ops.spec.ts` queue coverage, the **declared** AC-P2-49 updates to
    `registration.spec.ts` (and `registration-gate-caption.spec.ts` only if the new caption
    entries touch its pinned assertions — any edit declared, never silent, AC-P2-59).
15. **Sweep**: AC-P2-47/48 percentage sweep, AC-P2-57 no-referral-input assertions,
    `npm test` then `npm run test:web` (sequentially — handover §4.1).

**Mock-gate scope note for the orchestrator:** steps 10–13 all add or change UI the owner
should see (three customer surfaces + the ops queue). If the ux stage scopes the mock to
customer surfaces only, step 12 may start on ux-designer sign-off alone — the orchestrator's
call at the gate, not the developer's.

---

## 11. Test plan (named artifacts — each is a commitment: build it or decline out loud)

### 11.1 `scripts/tests/trade-verification.test.mjs` (NEW node suite)

Wired as `"test:trade": "node --test --test-concurrency=1 scripts/tests/trade-verification.test.mjs"`
in `package.json`, appended to the `test` chain (between `test:registration` and `test:api`).
Full-harness pattern (own wrangler dev + migrations + seed, own run dir), **plus the ABR
stub**: boots `scripts/tests/abr-stub.mjs` on a free port and passes
`--var ABR_BASE_URL:http://127.0.0.1:<port>` and `--var ABR_GUID:test-guid` (and one describe
block omitting the GUID for E-P2-18). Every test mints its own email + `X-Forwarded-For`
(handover §4.2). Cases (spec §10's node list, in full):

- Triple: all-pass auto-approves with no queue item (AC-P2-20); each single failure queues
  with its recorded reason (AC-P2-21/22/23); customer bodies byte-identical across reasons
  (AC-P2-27, AB-P2-7).
- Duplicate rule incl. revoked/rejected/superseded holders not counting (AC-P2-24, E-P2-8).
- ABR timeout / 5xx / malformed / missing GUID ⇒ queued `abr_unavailable`, nothing approved
  (AC-P2-25, E-P2-2, E-P2-18); stub-slow proves the 5 s bound.
- Grant arithmetic: default applied once from `TRADE_DISCOUNT_DEFAULT`; negotiated rate
  survives re-approval; revoke ⇒ 0; internal never granted; migration's grandfather rate
  equals the constant (AC-P2-28/29/30/34; AB-P2-14 with concurrent approves).
- No-repricing: stored `quote_line`/`"order"` rows byte-compared across approve + revoke
  (AC-P2-31); source-grep proves `trade.ts`/`abr.ts` never name those tables.
- Authorization matrix for every new endpoint: anonymous, customer, cross-customer,
  manufacturer staff, **non-admin assigned-role staff (must succeed)**, admin
  (AB-P2-1…5, AB-P2-11, AC-P2-37).
- Rate caps before ABR (stub counter), mass assignment, oversized/lookalike input, ABN-swap
  refusal + idempotent same-digits write (AB-P2-6/1/13/12, E-P2-19).
- One-pending rule + re-application after rejection + verified re-application retains status
  (E-P2-5/6/7, P2-A10/A11).
- Migration behaviour: staff pinned, exactly three grandfathered (two with NULL abn), no
  other row, six table counts identical (AC-P2-50…53).
- `/me` trade DTO: status only — response never contains `discount_percent`, reasons, or
  other holders (P2-A7).

### 11.2 `scripts/tests/web/trade-verification.spec.ts` (NEW Playwright)

Auto-collected by `testMatch: "**/*.spec.ts"`. Requires the web harness to serve an ABR stub —
`scripts/tests/web-server.mjs` starts `abr-stub.mjs` and adds the two `--var`s (mirror of
§11.1's wiring). The spec §10 journeys 1–7 verbatim: cold `/trade-account` auto-pass → active
state, no `%` in DOM, next preview at trade rate (AC-P2-1/2/4/5); gmail cold signup →
under-review, account usable (AC-P2-6/23); checksum-invalid → inline error, no application,
no ABR call (AC-P2-7); profile affordance both outcomes + verified profile non-editable ABN
(AC-P2-9/10/11); gate empty/malformed/valid ABN behaviours + no label control + no ABR call
in submit path (AC-P2-14…18); verified account sees no gate field (AC-P2-19); the
percentage/subtraction sweep over the four advertising surfaces (AC-P2-47/48); payout-form
prefill (AC-P2-54); no `abn` in any request URL (AB-P2-16).

### 11.3 `scripts/tests/web/ops.spec.ts` (EXISTING — extended; a separate `trade-queue.spec.ts` is acceptable if it stays out of ops.spec.ts's fixtures, but the named home is ops.spec.ts)

Journeys 8–9: queued application appears with reasons + snapshot; approve **as a non-admin
assigned-role staff member** → customer's next preview is a trade price; revoke → retail on
the open session's next request (AB-P2-15); reject → account still works, decision + reason in
history (AC-P2-35/36/37/38/40/30). Pending count visible on the console landing (AC-P2-35).

### 11.4 `scripts/tests/email-templates.test.mjs` (EXISTING — extended)

The four keys: dot-free snake_case; each event's send uses the right `templateKey`; no Sanity
document ⇒ fallback subject/body sends successfully; a stubbed authored template wins; caching
semantics unchanged; **no rendered form (authored-stub or fallback) contains a `%` figure, a
derivable pair, a timeframe, or another account's existence** (AC-P2-43…46, AC-P2-61…64).

### 11.5 `scripts/tests/unit.test.mjs` (EXISTING — extended)

- `abnValid` move round-trip (existing referral assertions keep passing via the re-export) +
  `normalizeAbn`/`formatAbn` tables.
- `nameMatches` table: Pty Ltd / T/A / ampersand / punctuation / case / BROS / reorder /
  typo-Dice / single-token strictness / must-queue cases (AC-P2-22, E-P2-20).
- `emailDomainPlausible` table: the free-mail list (gmail explicitly), `.com.au` core
  extraction, containment both directions, no-acronym queue case (AC-P2-23).

### 11.6 `scripts/tests/abr-stub.mjs` (NEW harness module — not a suite)

One tiny HTTP server, keyed by the requested ABN: table-driven responses (active + names /
cancelled / not found), plus reserved ABNs that trigger slow (> timeout) and 500 responses;
records a hit counter the suites read (AB-P2-5/6, AC-P2-7/17 "no ABR call" assertions).
JSONP-wrapped bodies like the real API. Shared by §11.1 and the web harness.

### 11.7 Existing coverage that must keep passing (AC-P2-59 — edits declared, never silent)

`scripts/tests/api.test.mjs` (frozen 129–150), `scripts/tests/web/customer.spec.ts` (frozen
383–409), `scripts/tests/web/registration.spec.ts` (**expected edit**: the AC-41 absence
assertions on the gate/profile surfaces updated citing AC-P2-49),
`scripts/tests/web/registration-gate-caption.spec.ts` (edit only if the ABN caption rows touch
it), `scripts/tests/email-templates.test.mjs`, the referral node suites and
`scripts/tests/web/referral.spec.ts` (no assertion changes expected; the payout-form prefill
is additive). Run `npm test` to completion, then `npm run test:web` — never concurrently.

---

## 12. Out-of-scope guards (restated as build constraints)

1. `POST /api/auth/verify` (`worker/routes/auth.ts:70-121`): **no diff hunk touches these
   lines** (AC-P2-56). The `/me` and `/profile` edits live outside them.
2. `organisation` / `membership`: no read, no write, no reference (AC-P2-60, ticket #7).
3. Pricing: `worker/lib/estimator/pricing.ts` unedited (AC-P2-32); no discount line, no trade
   toggle on the ops quote screen, no repricing button (issue #10 — P2-D4's deferred note).
4. No referral rule/surface change; no referral-code input on anything this phase adds
   (AC-P2-57); payout-form change is a prefill + a lock, nothing else (D6, Q7).
5. No ops editor for `discount_percent` (spec §2.2) — display only.
6. No scheduled re-verification (P2-A6); no ABR gating of payouts (spec §2.2 last bullet).
7. Trade-pricing copy on exactly the four AC-P2-48 surfaces and nowhere else — home page,
   nav, quote builder, review pricing panels stay silent (Phase 3 owns the shop window).
8. Migration 0032's `DEFAULT 5` untouched; no `user` rebuild anywhere (AC-P2-52).

---

## 13. Rejected alternatives (with the reason)

- **A `trade_status` column on `user`** — rejected: E-P2-6 requires verified+pending
  simultaneously, so the enum is wrong by construction; and a stored flag beside the ledger is
  two homes for one fact (ADR-0002). The ledger derivation costs three indexed point reads on
  surfaces that already do several.
- **Putting the ABN field into the submit endpoint's body** — rejected: it would widen the
  endpoint Phase 1 just narrowed, put ABR latency a body-parse away from the submit path, and
  create a second application-writer. A separate authenticated POST after submission makes
  AC-P2-17 structural.
- **Returning the fresh trade state from `POST /api/trade/application`** — rejected: AB-P2-7
  demands byte-identical queued responses; any echo (ids, timestamps, submitted values) breaks
  it. Constant bodies + a `/me` refetch cost one request and make the oracle property provable
  by `assert.equal` (§14.2).
- **SOAP/XML ABR API to keep the ABN out of the outbound URL** — rejected: the JSON API is the
  supported lightweight interface; the XML alternative buys nothing real (same TLS channel,
  same registrar reading it) at the price of hand-rolled XML parsing in a Worker. §14.3 names
  the interpretation instead.
- **Retrying ABR failures before queueing** — rejected for doors (a)/(b) interactivity; the
  failure path is already safe-by-design (queue). Single 5 s attempt.
- **A per-ABN unique standing-grant index** — rejected: D2.1 explicitly allows a human to
  approve a second holder; the index would make the allowed state unrepresentable. The
  concurrent-auto-pass window is accepted and named (§9.5.2).
- **Auth middleware for the new route files** — rejected: the repo's rule is per-route
  self-check (handover §4.5); middleware for two files creates a second idiom mid-flight.
- **Reusing `updateAccountDetails` as the grant's writer** — rejected: §4.7 defines two
  writers with different powers; funnelling the grant through the customer path would give the
  customer path granting semantics to filter away. Two writers, each narrow, both named.
- **An ops-editable free-mail / threshold config** — rejected as scope creep; constants with
  unit tables are one-line edits, and D2 makes matcher failures cost ops minutes, not
  customers.
- **Storing the pending count in `/summary` via the queue endpoint client-side** — rejected:
  AC-P2-35 wants the count without opening the queue; one subselect in the existing summary is
  cheaper than a second request and inherits its degraded-to-zero behaviour.

---

## 14. Spec findings — places the spec cannot be built exactly as written (resolutions recorded, not silently fixed)

1. **§9.1's account trade-status "one of: none, pending, verified, rejected, revoked" cannot
   be one stored field.** E-P2-6 (a verified account re-applying) makes `verified` and
   `pending` true at once; AC-P2-29 makes `verified`+negotiated-rate a state approval must
   not disturb. §9.1 delegates the schema to the architect, so this is a resolution within
   authority: the five states survive as a *derived customer-facing vocabulary* over two
   stored facts (the ledger + the user row) — §3, §6.4, ADR-0002.
2. **AB-P2-7 / AC-P2-27 "byte for byte identical" responses** are unachievable if the
   response echoes anything application-specific (id, timestamp, the ABN itself differs
   across the three probes). Resolved by making the endpoint's two outcomes constant bodies
   (§6.2.8, §7.1) and serving per-account state only from `/me`. The PM may want to restate
   AC-P2-27 as "identical status and body **for the application endpoint**"; the build
   satisfies the strict reading as designed.
3. **AB-P2-16 "no ABN appears in a query string" vs the ABR JSON API**, which is GET-only and
   takes `abn` (and `guid`) as query parameters. Unresolvable literally for the outbound
   Worker→ABR call. Interpretation, recorded for the tester and PM: AB-P2-16 governs the
   requests **this phase's surfaces make** (browser↔Worker), where referrer/history leakage
   is real — all of those carry the ABN in POST bodies only. The outbound call is
   server→server TLS to the ABN registrar itself, referrer-free, and never logged (§4, §9.5.5).
   If the PM reads AB-P2-16 to cover the outbound leg, the fallback is the SOAP POST API —
   rejected in §13 but buildable.
4. **E-P2-18 "the console warns once at startup"** — Workers have no startup hook; resolved
   as once-per-isolate on first lookup (§4). Same operator outcome (one warning, not a flood).
5. **AC-P2-51's grandfather rate vs §8.4's "no second literal 5 in new code"** — a migration
   cannot read a TS constant, so 0054 necessarily carries the literal. Resolved: the code
   authority is `TRADE_DISCOUNT_DEFAULT`; the migration comments the provenance and the trade
   suite asserts the applied value equals the constant (§3.2, §11.1).
6. **Spec §10's Playwright list names the payout-form prefill nowhere** — AC-P2-54 is a
   customer-surface behaviour only a browser can see. Added to §11.2 rather than left to the
   node suite; recorded here because it widens the named journey list by one.

---

## 15. Assumptions register (`ASSUMED:` — vetoable at any later gate)

| Tag | Assumption | Where |
|---|---|---|
| `ASSUMED: P2-ARCH-1` | Rate caps: 5 applications/account/hour, 20/IP/hour — technical values, tunable constants | §6.2.4 |
| `ASSUMED: P2-ARCH-2` | ABR timeout 5 s, single attempt, no retry | §4 |
| `ASSUMED: P2-ARCH-3` | Matcher thresholds (Dice 0.85 names / 0.8 domains, ≥2-token containment) and the shipped free-mail list | §5 |
| `ASSUMED: P2-ARCH-4` | Business-name length cap 200 (aligned with the ops PATCH `company` cap); reject-reason cap 500 | §6.2.1, §6.5 |
| `ASSUMED: P2-ARCH-5` | For a verified account, the profile card shows business name read-only (a company edit for a verified account goes through ops or a re-application). Server-side `company` stays writable — only the UI narrows | §8.3 |
| `ASSUMED: P2-ARCH-6` | `/me` carries the full trade DTO (history outline included) rather than a second `GET /api/trade/status` — one fetch, one shape | §7.1 |
| `ASSUMED: P2-ARCH-7` | Door (c) fires the application request after the submit response and the confirmation reflects its true outcome; a transient failure shows the door-(b) fallback line rather than blocking or lying | §8.4 |
| `ASSUMED: P2-ARCH-8` | The ops queue lives in the Customers area with the count on the dashboard tile (P2-A9's placement latitude exercised; ux stage may move it) | §8.5 |

Spec-level assumptions P2-A1…A12 are all honoured as written; none is re-decided here.

---

## 16. Decisions needed (owner)

**None.** Every owner-owned question was settled in spec revision 2 (Q1–Q7) and the P2
decision ledger; everything this design added on its own authority is technical, recorded in
§13/§14/§15, and vetoable at review.

---

## 17. Affected-files index (hand-off — line refs verified against the working tree, 2026-08-19)

### New files — track (a), non-visual

| File | What |
|---|---|
| `migrations/0054_trade_verification.sql` | §3 schema + staff pinning + grandfathering (three single-address INSERT…SELECTs) |
| `src/data/abn.ts` | `normalizeAbn`, `abnValid` (moved from `worker/lib/referrals.ts:76-95`), `formatAbn` |
| `worker/lib/trade-match.ts` | §5 pure matchers + `FREE_MAIL_DOMAINS` |
| `worker/lib/abr.ts` | §4 `lookupAbn` + once-per-isolate GUID warning |
| `worker/lib/trade.ts` | §6 engine: `TRADE_DISCOUNT_DEFAULT`, `applyForTrade`, `approveApplication`, `rejectApplication`, `revokeTrade`, `tradeStateOf`, `pendingApplications`, `applicationHistory`, `abnWriteAllowed`, the four `notify` calls |
| `worker/routes/trade.ts` | §7.1 `POST /api/trade/application` (thin) |
| `worker/routes/ops-trade.ts` | §7.2 queue + decisions (thin) |
| `scripts/tests/trade-verification.test.mjs` | §11.1 |
| `scripts/tests/abr-stub.mjs` | §11.6 |
| `docs/adr/0002-trade-status-derived-from-application-ledger.md` | §2 |

### New files — track (b), UI

| File | What |
|---|---|
| `src/components/trade/TradeApplicationCard.tsx` | §8.1 one card, both doors |
| `scripts/tests/web/trade-verification.spec.ts` | §11.2 |

### Changed files — track (a)

| File | Change lands at |
|---|---|
| `worker/types.ts` | `Env` gains `ABR_GUID?: string` (secret), `ABR_BASE_URL?: string` (test seam) — alongside the other optional secrets |
| `worker/lib/auth.ts` | new `withinCap` export; `challengeSourceAllowed` (line ~128-134) delegates to it, behaviour identical |
| `worker/lib/account.ts` | §6.6: `abn` branch (line ~72) consults `abnWriteAllowed` → new `abn_locked` result; new `tradeLabel` allowlist key; `AccountUpdateResult` union widened |
| `worker/routes/auth.ts` | `/me` handler (lines 23-27) attaches `trade: tradeStateOf(...)`; `/profile` handler (lines 131-138) maps `abn_locked` → 400. **Lines 70-121 untouched** |
| `worker/lib/referrals.ts` | lines 76-95 (`ABN_WEIGHTS` + `abnValid`) replaced by re-export from `src/data/abn.ts` |
| `worker/lib/staff.ts` | exports `hasAssignedRole` (the ops.ts:99-100 predicate, one home) |
| `worker/routes/ops.ts` | line 100: local `hasAssignedRole` alias → import; `/summary` SELECT + response (lines 292-322); `/customers` SELECT + rows (lines 1399-1420); `/customers/:id` response (lines 1472-1490): `discountPercent`, `tradeLabel`, `trade`, `tradeHistory`; `/projects/:id` response assembly (lines ~519-536): `customerPhone`, `customerAddress` |
| `worker/index.ts` | route mounts after line 86: `/api/trade`, `/api/ops/trade` |
| `package.json` | `test:trade` script; inserted into the `test` chain between `test:registration` and `test:api` (line 15) |
| `scripts/tests/email-templates.test.mjs` | §11.4 four-key cases |
| `scripts/tests/unit.test.mjs` | §11.5 tables |
| `scripts/tests/web-server.mjs` | boots `abr-stub.mjs`; adds `ABR_BASE_URL`/`ABR_GUID` `--var`s (line ~29) — server-side prep for track (b)'s specs, safe to land in (a) |
| `CONTEXT.md` | §2 entries (Customer redefinition, Trade-ness, Trade application, Auto-pass) — Actors block + a Registration-section addition |

### Changed files — track (b)

| File | Change lands at |
|---|---|
| `src/data/api.ts` | `TradeStateDto`, `applyForTrade`, `me()` return type (near `AuthUserDto`, line 127) |
| `src/app/App.tsx` | `AuthUser`/`toAuthUser` gain `trade` (lines 44-66); `TradePage` mock form deleted + card mounted (lines 1690-1704; page fn ~1660-1720); `ProfilePage` Business-details card → `TradeApplicationCard` (lines 1400-1407); `case "trade"` plumbing (line 2164) |
| `src/components/QuoteReviewSubmit.tsx` | `QuoteUser` (line 55) + details-stage ABN/business-name fields; `outstanding` caption (lines 418-437); submit tail + `QuoteSubmitted` acknowledgement (lines 121-139, 380-395) |
| `src/pages/QuoteProjectPage.tsx` | prop plumbing for the widened `QuoteUser` (lines 204-227) |
| `src/components/referral/JoinProgramFlow.tsx` | `initial` abn prefill via call site (line ~220); submit handler skip-same-digits + `abn_locked` copy (lines 68-90) |
| `src/pages/ReferPage.tsx` / `src/pages/ReferralsPage.tsx` | pass the prefill (lines 283 / 77) |
| `src/ops/api.ts` | §7.4 ops functions + widened types |
| `src/ops/OpsApp.tsx` | Dashboard pending-count (component at line 367) |
| `src/ops/Customers.tsx` | queue section + 360 trade fields + revoke (list at lines 21-80; detail from line 84) |
| `src/ops/ProjectRecord.tsx` | contact line in the record header block (around line 228) |
| `scripts/tests/web/registration.spec.ts` | AC-P2-49: the AC-41 absence assertions on gate/profile updated, citing the Phase-2 spec — a **declared** edit |
| `scripts/tests/web/ops.spec.ts` | §11.3 queue journeys |

### Deliberately untouched (guard rails)

`worker/routes/auth.ts:70-121` (/verify) · `worker/lib/estimator/pricing.ts` ·
`worker/lib/access.ts` · `worker/routes/referrals.ts` · `worker/routes/quote.ts` (submit
gains nothing server-side) · `organisation`/`membership` (no reference anywhere new) ·
`scripts/db/seed.sql` · `migrations/0001-0053` · `api.test.mjs:129-150` ·
`customer.spec.ts:383-409` · `PATCH /api/ops/customers/:id` semantics.

---

# 18. Interaction spec (ux-designer, 2026-08-19)

Appended after the architect's design; **nothing above is edited**. Companion mock:
**`docs/mocks/registration-phase-2-trade-verification.html`** (self-contained, no external
requests, desktop + 375px, every state below as a labelled frame). The mock is the picture;
this section is the contract.

Every string in **bold quotes** is final copy. `ASSUMED:` tags mark choices made without the
owner, vetoable at any later gate. This section governs design §10 track (b), steps 9–15.

**Revision 4 (2026-08-19, owner ruling P2-D5 — "builder vs tradie - no difference"):** the
self-declared builder/tradie label is **removed from the product**, not merely ignored in logic.
`P2-D5` (recorded in `docs/specs/user-registration-grill-conclusions.md`) **supersedes D7**
("self-declared label collected at registration"), which is why no reader should reinstate the
control from D7, from spec §2.1.10, or from the `trade_label` column the design already shipped.
The optional business group is now **exactly two fields — ABN and business name** (name required
only once an ABN is present), identical at all three doors, which makes the revision-3 one-flow
correction cleaner still. The vocabulary survives — builders and tradies are both trade
accounts — the product simply stops asking which. Every control, evidence row, sub-line, helper
and absence assertion naming the label is struck below; **AC-P2-15's "no builder/tradie control
at the gate" is restated as "no builder/tradie control exists on any surface"**.

**Revision 3 (2026-08-19, owner review of the mock — surfaces 2-6 APPROVED, surface 1 reworked):**
the owner approved the account card, the submit-gate group, the ops queue and the four emails as
drafted; they must not drift. **Surface 1 was rejected as an architecture error, not a styling
note:** the first draft composed a bespoke signup on `/trade-account` (business details, then the
email/OTP step), which is a second registration form in all but name. §18.2 is replaced in full —
**one universal flow (email → code → your details), one optional ABN + business-name group inside
it, and a fork only in what happens after**. `/trade-account` is a marketing page that hosts the
same signup everyone else gets. `ASSUMED: P2-UX-3` is struck; `ASSUMED: P2-UX-10` (the group
starts revealed on the trade page only) is new and is the orchestrator's call, flagged for the
owner's veto.

**Revision 2 (2026-08-19, after the ui-designer's visual pass — four copy/structure divergences
it correctly refused to fix itself):**

1. **The ops "three checks" list held four rows.** The duplicate-ABN test is now its own block
   below the triple — it is a separate gate, evaluated before the ABR lookup, and it forces a
   queue regardless of the triple's score (§18.7.3).
2. **The confirmation's trade block moved below the actions, behind a rule, and now explicitly
   disclaims the quote-review response time** it used to sit two lines under (§18.5.2). This is
   the owner's no-turnaround ruling defended against promise-by-adjacency, not a layout
   preference.
3. **Surfaces 2's outcome panels are one structure at both widths** — outcome block, rows,
   actions; **no status pill at either width** (§18.4.1).
4. **The dead `.b-sage is-disabled` rule is deleted from the mock's preamble** (a missing dot
   made it inert; "fixing" the typo would have turned the approved faded-sage disabled Submit
   into a dark ink button).

**Inherited without restatement:** Phase 1 design §16 (the gate's one-screen model, its stages,
its "a disabled Submit is never unexplained" rule, its focus/keyboard/a11y rules §16.9 and its
responsive rules §16.10). Everything here is an addition to that contract, never a replacement.

## 18.0 The rules this phase's copy obeys (all owner rulings)

1. **No percentage on any customer surface**, and no pair of figures from which one could be
   derived by subtraction. Trade pricing is described as **better prices** — never as a
   discount, never with a worked example. The ops console is the one exception and is not a
   customer surface.
2. **No timeframe, anywhere** — not in UI, not in email. "We'll be in touch" / "we'll email you
   when it's done" is the strongest promise permitted (Q2).
3. **The customer is never told which criterion failed** (`ASSUMED: P2-A3`). Two applications
   queued for different reasons produce identical screens and identical emails.
4. **No builder/tradie control exists on any surface** (P2-D5, superseding Q5 and D7). The
   question is not asked at the gate, on the trade page, on the account page, or anywhere else,
   and no surface displays such a label.
5. **No repricing promise.** Nothing says a submitted quote will be updated.
6. **Phase 1's AC-41 silence ends here by design.** Trade copy appears on exactly four surfaces
   (AC-P2-48). A tester finding it there is recording conformance, not a regression.

## 18.1 The five customer states, and the two facts they are rendered from

The client never stores a status word. It renders `me().trade`, which carries two independent
facts — a standing grant and a pending application — plus the history outline:

| Rendered state | Condition | Where it appears |
|---|---|---|
| **None** | no grant, no pending, no history | trade page, account card, gate (field offered) |
| **Under review** | `trade.pending != null`, no grant | trade page, account card, gate (field withheld) |
| **Active** | grant present, no pending | trade page, account card, gate (field withheld) |
| **Active + under review** (E-P2-6) | grant present **and** `trade.pending != null` | account card, trade page |
| **Not approved** / **Not active** | no grant; history's most recent entry is `rejected` / `revoked` | account card, trade page |

**Active + under review renders both blocks, never a merged word.** No "re-verifying", no
greyed-out Active pill, no third status label. The customer's pricing is not in doubt and the
screen must not suggest it is.

## 18.2 Door (a) — `/trade-account`, a marketing page hosting the universal flow

**Revision 3 (owner review, 2026-08-19) replaces the whole of this section.** The first draft
composed a bespoke card on this page — "Your business" (name, ABN, label) and then "Your
account" (email, Turnstile, code) — arguing that the trade question should come first because it
is why the visitor is on the page. The owner rejected the premise, and the ruling is binding:

> *"I don't understand why are we creating a new registration flow for business users, rather
> than simply adding a field within one established in P1? /trade-account is for marketing that,
> but the flow is, unless there's a good reason not to do this — universal with a small fork
> depending on whether or not ABN was entered."*

**There is one registration flow in this product and Phase 2 does not add a second.** The
conversion argument behind "business first, account second" does not pay for a second form to
build, test and keep in step forever. What Phase 2 adds is an optional field group; what forks
is what happens after it.

### 18.2.1 The model, stated once

| | |
|---|---|
| **The flow** | Phase 1's, unchanged: **email → 6-digit code → your details**. Same components (`OtpSignIn`, then the details step), same order, same copy, at every entry point |
| **The addition** | one **optional ABN + business-name group** — two fields, nothing else (P2-D5) — inside the details — the *same* group as the submit gate's (§18.5) and the account card's (§18.3) |
| **The fork** | **after** the flow, and only there: an ABN was entered ⇒ verification runs and one of the two outcome panels appears (§18.4); no ABN ⇒ an ordinary private account, exactly as Phase 1 |
| **What `/trade-account` owns** | the hero, the benefits column, the trade copy, and the trade intent. It **hosts** the signup; it does not own a flow |

The **only** entry-point-specific behaviour anywhere in this phase:

> `ASSUMED: P2-UX-10` **(orchestrator's decision, 2026-08-19 — not the owner's; flagged for
> veto.)** On `/trade-account` the optional group renders **already revealed**; everywhere else
> it stays collapsed until relevant. A visitor who navigated to the trade page came specifically
> to hand over an ABN and should be able to type it where they expect to. Same component, same
> flow, same copy — only the initial disclosure differs.

### 18.2.2 Page structure

Hero and benefits column unchanged except for one added benefit line, first in the list:
**"Better prices, everywhere"** / **"Trade pricing applies while you configure, not just on the
quote we send back."** The hero sub-line gains "better prices" in its existing list:
**"Upload every schedule you're sitting on and get them priced the same day. Trade accounts get
better prices, priority review, saved details, and a name to call."**

The right-hand card (today the dead mock form, `App.tsx:1690-1704`) is **deleted** and replaced
by the standard signup: `OtpSignIn` with the optional group mounted inside it
(`source="trade_page"`, group revealed).

### 18.2.3 Step 1 — email, with the optional group revealed

Field order is the flow's own: **email → optional group → Turnstile → button**. The group sits
between the email field and the human check because no unauthenticated endpoint may accept an
ABN — the values are held in browser state and posted once the session exists (AC-P2-3) — and
because that is the same "optional last" position it holds at the gate.

| Slot | Copy |
|---|---|
| Heading (h2, `t-hd3`) | **"Sign in or create your account"** (Phase 1's `/login` heading, unchanged) |
| Sub | **"We'll email you a 6-digit code — no password. If you don't have an account yet, this creates one."** |
| Email | Phase-1 field, label **"Email"**, placeholder `your@email.com` |
| Group label | **"Your business (optional)"** |
| Group helper | **"Add your ABN and we'll check it against the Australian Business Register as soon as you're signed in. If it checks out, trade pricing is on your account straight away. You can also add it later from your account."** (this is one of the four AC-P2-48 advertising surfaces) |
| Field 1 | label **"Business name"**, placeholder **"ABC Constructions"**, helper **"As it's registered against the ABN."**, max 200, `autoComplete="organization"` |
| Field 2 | label **"ABN"**, placeholder **"00 000 000 000"**, helper **"11 digits. Spaces are fine."**, `inputMode="numeric"`, raw max 32 |
| Turnstile + button | Phase-1 `OtpSignIn`, unchanged: **"Email me a code"** → busy **"Sending…"**; Turnstile gating and its caption **"Complete the check above to continue."** unchanged |
| Caption under the button | **"Your business details stay on this screen — we send them for checking the moment you're signed in."** |

A malformed ABN blocks this step and shows its inline error, exactly as it blocks Submit at the
gate (§18.5.1); clearing the field always releases it. Error copy here:
**"That ABN doesn't look right. Check the 11 digits, or clear the field to continue without
it."** Missing business name with an ABN present: **"Enter the business name registered to this
ABN."**

### 18.2.4 Step 2 — code

Phase-1 copy verbatim (**"Enter your code"**, **"We sent a 6-digit code to {email}. It expires in
10 minutes."**, **"Verify & continue"** → **"Verifying…"**, **"Resend code"**, **"Use a different
email"**). Below the actions, under a hairline, the held values render read-only (business name,
formatted ABN) each with a **"Held"** chip, and one caption: **"Still here — we send these for
checking as soon as you're in."**

### 18.2.5 Step 3 — your details, with the check running beside it

Off the submit gate, Phase 1's details step is the mandatory single-field `NameStep`
(**"What's your name?"**, **"Full name"**, **"Save and continue"**). **Phase 2 does not modify
it.** The moment the session exists, `applyForTrade({ abn, businessName, label, source:
"trade_page" })` fires, and a work-tone block renders beneath the name field:

> **"Checking your ABN"** / **"We're checking the details you added. Carry on — we'll show you
> the result here."**

- Result arrives while the person is still on this step ⇒ the block is replaced in place by the
  Active or Under-review panel (§18.4).
- The person saves their name first ⇒ they land on their dashboard as Phase 1 sends them, and
  the outcome panel is on their account page (§18.3). **No third state is invented for the
  race**, and the outcome copy is identical either way.
- **Transient failure** (network, 5xx, 429): the person **is signed in regardless** (AC-P2-3),
  and the block becomes a mute-tone retry — **"We couldn't send your details just now. Nothing
  is lost — try again."**; 429: **"That's a few attempts in a short time. Give it a few minutes
  and try again — you're signed in and your account works as normal."** The entered values stay
  on screen, editable.

### 18.2.6 Signed-in visitors on `/trade-account`

No second OTP anywhere below.

- **Not verified, nothing pending:** the optional group alone, revealed, business name pre-filled
  from `user.company`, primary button **"Apply for trade pricing"** → busy **"Checking your
  details…"**.
- **Verified:** no form. Heading **"Your trade account"**, pill **"Active"**, line **"Trade
  pricing applies to your account. There's nothing more to do here."**, read-only Business and
  ABN rows, then **"Changed ABN or trading name?"** + text button **"Send us the new details"**
  + **"— your current trade pricing stays while we check them."**
- **Pending / rejected / revoked:** the corresponding account-card panel (§18.3.3–18.3.5),
  identical component, identical copy.
## 18.3 Door (b) — the account page trade card

`ProfilePage`'s **Business details** card (`App.tsx:1400-1407`) is replaced in place by
`TradeApplicationCard source="profile"`. It keeps the same grid position (right column, beside
Personal details) and the same card treatment. The page's **"Save changes"** button no longer
has an ABN or company field to save; it saves name and phone exactly as before.

### 18.3.1 No ABN on file — the affordance (AC-P2-9)

| Slot | Copy |
|---|---|
| Heading (h3, `t-bd-sm` semibold) | **"Trade account"** |
| Sub | **"Trade customers get better prices across the site — while you configure, not just on the quote we send back. Add your ABN and we'll check it against the Australian Business Register."** |
| Fields | Business name · ABN — labels, placeholders and helpers exactly as §18.2.3 |
| Button | **"Apply for trade pricing"** → busy **"Checking your details…"** |

### 18.3.2 Verified (AC-P2-11)

Pill **"Active"** (positive tone, tick + word). Line **"Trade pricing applies to your account."**
Read-only rows: **"Business"**, **"ABN"** (formatted `51 824 753 556`). **The ABN is not an
editable field on this surface**, and there is no third control — the card holds two facts. Business
name is read-only too (`ASSUMED: P2-ARCH-5` — a change goes through a new application or ops).
Footer line: **"Changed ABN or trading name?"** + **"Send us the new details"** +
**"— your trade pricing stays while we check them."** Then the history outline (§18.6).

### 18.3.3 Pending (AC-P2-12)

Pill **"Under review"** (work tone, clock). Body **"We're checking the details you sent. We'll
email you when it's done — your account works as normal in the meantime."** Read-only rows:
Business, ABN, **"Sent"** (long date). Caption: **"You can send new details once this one's been
looked at."** **No form is rendered and no second application can be started.**

### 18.3.4 Active + under review (E-P2-6)

The verified block exactly as §18.3.2, then a work-tone block beneath it:

> **"New details under review"**
> **"We're checking ABN {abn} for {business}, sent {date}. Your trade pricing is unaffected while
> we do — nothing changes on your account unless we tell you."**

### 18.3.5 Rejected and revoked (AC-P2-13, AC-P2-30)

Neither uses attention/danger colour: both are mute-tone. Nothing failed and nothing broke.

| | Rejected | Revoked |
|---|---|---|
| Pill | **"Not approved"** (mute) | **"Not active"** (mute) |
| Heading | **"We couldn't set up trade pricing from those details"** | **"Trade pricing no longer applies"** |
| Body | **"Your account still works exactly as before — you can price jobs, submit them, track them and use Refer & earn. You're welcome to try again with updated details, or reply to our email and we'll help."** | **"You're seeing our standard prices from now on. Everything else on your account is unchanged. If you think that's a mistake, get in touch and we'll sort it out."** |
| Action | **"Try again with new details"** (sage) | **"Apply again"** (outline) |

Neither names a reason, and a duplicate-ABN rejection **never discloses that another account
holds that ABN** (AC-P2-44).

## 18.4 The two outcome panels (shared by doors a and b)

### 18.4.1 Verified

Sage outcome block, CheckCircle, 3px inset spine — Phase 1's "this went well" vocabulary.

> **"Your trade account is active"**
> **"Your ABN checked out. Trade pricing applies to your account from now on — the prices you see
> anywhere on the site are already your prices."**
> **"Anything already with us for review will be priced by our team."**

Then read-only Business and ABN rows — the two facts the account now holds — then
**"Start a quote"** (sage) and
**"Go to my account"** (ghost).

**One structure at both widths** (revision 2, ui-designer finding 3): desktop and mobile render
the same three parts in the same order — outcome block, read-only rows, actions — with the same
two paragraphs. Mobile changes only what mobile always changes: full-width primary button, 20px
card padding. **No status pill on either outcome panel, at either width.** The outcome block's heading
already states the status; a pill beside it says the same fact twice. Pills belong on the account
card (§18.3), where the card carries its own heading.

### 18.4.2 Under review

Work-tone block, clock icon. **Never amber, never a triangle, never the word "unfortunately".**

> **"We're checking your details"**
> **"Thanks — we've got the ABN and business details for {business}. Someone here is checking
> them and we'll email you when it's done."**
> **"Your account works as normal in the meantime — you can price jobs, submit them and track
> them."**

Then the same read-only rows and actions as §18.4.1, in the same order, at both widths, with no
status pill.

**This copy is constant across every queue reason** — free mailbox, name mismatch, inactive ABN,
duplicate, ABR outage. There is no third panel and no per-reason variant. A future request to say
"we couldn't reach the register just now" reintroduces the oracle and must be refused
(AB-P2-7).

## 18.5 Door (c) — the submit gate

Position: **last group in the details stage**, under a hairline rule, after the delivery group.
Everything above it is required; this is the only optional thing on the screen, and putting it
between required groups would read as another demand.

| Slot | Copy |
|---|---|
| Group label | **"Your business (optional)"** |
| Group helper (the 4th AC-P2-48 advertising surface) | **"Got an ABN? Add it and we'll check whether you qualify for trade pricing — better prices on everything you configure from then on. It won't hold up this submission."** |
| Field | label **"ABN (optional)"**, placeholder **"00 000 000 000"**, `inputMode="numeric"` |
| Paired field (renders only while the ABN field is non-empty) | label **"Business name"**, placeholder **"ABC Constructions"**, helper **"Needed with an ABN."** |

**No builder/tradie control exists here or anywhere else** (AC-P2-15 as restated by P2-D5).
**The whole group is absent —
not disabled — when the account is verified or has an application pending** (AC-P2-19).

### 18.5.1 Enablement and the caption

Folds into Phase 1's existing `outstanding` machinery (`QuoteReviewSubmit.tsx:418-437`):

| Field state | Submit | Caption entry |
|---|---|---|
| ABN empty | enabled (Phase-1 behaviour, untouched) | **nothing** |
| ABN checksum-invalid | disabled | **"ABN"** |
| ABN valid, business name empty | disabled | **"business name"** |
| ABN valid, business name present | enabled | nothing |

Caption renders as Phase 1's sentence: **"Still needed: ABN."** / **"Still needed: business
name."** / with other gaps, in form order. Clearing the ABN field restores Phase-1 behaviour
instantly, with **no round trip** (the checksum is `src/data/abn.ts`, client-side).

`ASSUMED: P2-UX-1` — "Still needed: ABN" is slightly odd English for a value that is present but
wrong. The alternative was a second caption idiom on one screen, which is worse; the inline error
carries the actual instruction. Inline error copy:

> **"That ABN doesn't look right. Check the 11 digits, or clear the field to submit without it."**

(the trailing clause exists only at the gate — elsewhere the field is not optional and the copy
is **"That ABN doesn't look right. Check the 11 digits and try again."**)

### 18.5.2 Submit sequence (AC-P2-17)

1. Phase-1 sequence runs unchanged: client-validate → profile diff/save → `onSubmit`.
2. **After** the server confirms submission, and only then, the client fires
   `applyForTrade({ ..., source: "submit_gate" })`. The submit request itself never waits on
   ABR.
3. The confirmation screen (`QuoteSubmitted`) renders unchanged, plus one block **placed after
   the action buttons, under a full-width hairline rule** — see the placement rule below:
   - application created → work tone: **"Your trade account is a separate check"** /
     **"The response time above is for your quote review. Checking your ABN is a separate job
     with no timeframe attached — we'll email you when it's done, and your quote isn't waiting
     on it."**
   - application call failed → mute tone: **"We couldn't start the ABN check"** /
     **"Your quote is safely submitted and isn't affected. You can add your ABN any time from
     your account."** (the last three words link to the account page).
   - no ABN entered → no block at all.

**Placement is load-bearing, not cosmetic** (revision 2, ui-designer finding 2). Phase 1's
confirmation carries **"Expect a response within 1–2 business days"** — the quote-review SLA. In
the first draft the trade block sat two lines beneath it, and a fast reader would have attached
that number to the ABN check: a turnaround promised by adjacency, which the owner's ruling
forbids as absolutely as one promised in words. Two defences, both required:

1. **Distance and structure** — the block sits below the actions, behind a rule, at the end of
   the screen. It is not part of the paragraph that carries the SLA.
2. **An explicit disclaimer in the copy** — "The response time above is for your quote review …
   no timeframe attached". The block denies the number rather than merely avoiding it.

Neither may be dropped in implementation, and no future edit may move this block above the
actions. **"Your quote isn't waiting on it" is the whole promise** — it must never grow into
"and we'll update your quote if it's approved" (P2-D4).

## 18.6 The history outline (AC-P2-13)

Date + outcome, nothing else. No reasons, no past ABNs, no staff names — that detail is ops-only.
Group label **"History"**; rows read **"Trade pricing approved"**, **"Not approved"**, **"Trade
pricing removed"**. Newest first. Absent when there is no history.

## 18.7 Ops console

### 18.7.1 The count (AC-P2-35)

Dashboard tile, in the existing tile row: label **"Trade applications"**, the pending count as
the figure, attention treatment when non-zero and plain when zero. The tile opens the queue.

### 18.7.2 The queue

Lives in **Customers**, as a tab above the customer list: **"Trade applications"** with the count
as a chip, beside **"All customers"**. Table columns, in order: **Applicant** (name over email) ·
**Business** (name) · **ABN** (formatted, tabular) ·
**Why it queued** (one chip per reason) · **From** (**"Trade page"** / **"Account page"** /
**"Submit gate"**) · **Applied** (date) · Open.

Reason chip copy: **"Free-mail address"** · **"Name doesn't match"** · **"ABN not active"** ·
**"ABN not found"** · **"Also verified elsewhere"** · **"Register unavailable"**.

Empty state: **"Nothing waiting"** / **"Applications that pass every check are approved
automatically and never appear here. This queue only holds the ones that need a person."**

Load: existing ops spinner. Load failure: **"Couldn't load trade applications."** with the error,
matching `Customers.tsx`'s existing failure row.

### 18.7.3 One application (AC-P2-26/36)

Three stacked cards: **applicant + submission**, **what the register said**, **decision**.

- Header: business name (h3), applicant name · email · **"Open customer record"** link, pill
  **"Awaiting decision"**.
- Submission rows: **"Submitted ABN"**, **"Submitted name"**, **"Applied from"** (source +
  date/time). Every application carries the same two facts whichever door it came through, so
  there is no per-source variation and no "not stated" row.
- Evidence card label: **"What the register said · checked {date, time}"**; rows **"Entity
  name"**, **"Entity status"** (e.g. **"Active since 1 Jul 2014"**), **"Entity type"**, **"Trading
  names"** (· separated). When the lookup failed: a single row **"Register unavailable at the
  time — nothing was returned."**
- **"The three checks"** — exactly three lines, one per criterion of the auto-pass triple, each
  with a pass / fail / not-evaluated mark: **"ABN is valid and active"** · **"Submitted name
  matches the register"** (with the compared names) · **"Email domain plausibly matches the
  business"** (with the domain). The heading counts the rows; if a criterion is ever added or
  removed, the heading changes with it.
- **"Duplicate ABN"** — a **separate** block below the triple, rendered only when
  `duplicate_abn` is among the queue reasons (revision 2, ui-designer finding 1). It is not one
  of the three: the engine evaluates it before the ABR lookup and it forces a queue however well
  the triple scores, so listing it as a fourth "check" misdescribed both the count and the
  mechanism. Row: **"This ABN is already verified on another account"** with the other holder(s)
  as links to their records; caption: **"A duplicate always comes to a person, however well the
  three checks score. You can still approve it if two accounts legitimately share the ABN."**
- Decision card: field **"Decision note"**, placeholder **"Why you're approving or rejecting —
  the customer never sees this."**, helper **"Required to reject. Optional to approve."**;
  buttons **"Approve trade pricing"** (primary) and **"Reject"** (secondary).
- Busy: buttons disabled, acting button reads **"Approving…"** / **"Rejecting…"**.
- Reject with an empty note: inline **"Add a reason before rejecting."**
- 409: **"Someone already decided this — reload to see the outcome."**
- On success the item leaves the queue and the view returns to the list.

### 18.7.4 Customer record (AC-P2-40/41)

Trade block on the 360: pill **"Trade · Active"** or **"Trade · None"**; rows **"Business"**,
**"ABN"** (**"No ABN on file"** when null — never an empty cell), **"Trade since"** (date +
provenance: **"approved automatically"** / **"approved by {staff}"** / **"granted by owner
decision (grandfathered), not checked against the register"**), **"Account rate"** (the
percentage, **read-only** — ops is not a customer surface; there is no editor in this phase).

History card: one row per application and per revocation, newest first — date, outcome chip
(**Approved** / **Rejected** / **Pending** / **Trade status removed**), decider, ABN, business
name, decision reason.

Revoke card: heading **"Remove trade status"**, body **"The account goes back to standard prices
immediately and the customer is emailed. Nothing already quoted or ordered changes."**, required
reason field (placeholder **"Reason — recorded against the account"**), destructive-outline
button **"Remove trade status"** → busy **"Removing…"**. Empty reason: **"Add a reason before
removing trade status."** 409: **"This account isn't on trade pricing."**

## 18.8 The four emails

Copy as rendered in the mock (§6 of the file). Binding properties, beyond the §18.0 rules:

- **No greeting line in any of the four.** `applyPlaceholders` renders a missing variable as an
  empty string, so `Hi {name},` becomes `Hi ,` for accounts with no name — which is exactly the
  set of customers least likely to forgive it. The only variable used in a body is `{business}`,
  and only in `trade_ack` and `trade_approved`, where a business name is guaranteed.
- Subjects: **"We're checking your trade account details"** · **"Your trade account is active"** ·
  **"About your trade account application"** · **"A change to your trade account"**.
- Every one ends with the existing footer line **"Reply to this email and a person will read
  it."** — the only support route offered anywhere in this phase.

## 18.9 Focus, keyboard, ARIA

Phase 1 §16.9 applies unchanged. Additions:

- **Outcome panels take focus.** When the card swaps to its Active / Under-review / error state,
  focus moves to the panel heading (`tabIndex={-1}`), and the panel sits in an
  `aria-live="polite"` region so a screen reader announces the outcome. This is the only thing
  that changed on the page and it must not be missed.
- **The paired business-name field at the gate**, when it appears, does **not** steal focus —
  the customer is still typing the ABN. It is announced by the caption change (already an
  `aria-live` region in Phase 1) and by the field's own label when reached.
- **Inline field errors** carry `role="alert"`, `aria-invalid` on the input and
  `aria-describedby` to the message id — the Phase-1 `FieldError` component unchanged.
- **The ABN field** uses `inputMode="numeric"` but not `type="number"` (spaces are accepted and
  spinners are wrong), and no `autoComplete`.
- **Ops**: queue rows are reachable as buttons; approve/reject/revoke are `button` elements with
  their busy state announced; the decision note is labelled, not placeholder-only.
- **Errors carry a mark as well as a colour** everywhere (the product's icon + word rule).

## 18.10 Responsive

- Trade page: the two-column layout collapses to one below `md`, benefits above the card. Card
  padding 24 → 20 at 375. Primary buttons full-width on mobile.
- Account page: Personal details and the trade card stack below `lg`, trade card second.
- Gate: unchanged from Phase 1; the business group's two fields stack below `sm`.
- Ops queue: the table is desktop-only, and below `lg` it becomes the card-per-row treatment
  `Customers.tsx` already uses for the customer list — a six-column table cannot fit 375px and
  the page must never scroll horizontally.
- Read-only ABN rows use tabular figures and never wrap mid-number.

## 18.11 Loading, empty, error and long-content behaviour

| Surface | Loading | Empty | Error | Long content |
|---|---|---|---|---|
| Trade page signup | Phase-1 `OtpSignIn` busy states, unchanged; the trade check runs beside the details step as **"Checking your ABN"** + spinner, never blocking it | n/a | the retry block in §18.2.5 (the person stays signed in) | business names clamp at 200 chars; the read-only held row wraps rather than truncating |
| Account card | inherits the page's `me()` load | the "no ABN" affordance **is** the empty state | **"Couldn't load your trade status. Reload the page."** | history outline scrolls with the card; no cap needed (rare) |
| Gate group | none (client-side only) | n/a | inline field error | — |
| Ops queue | existing spinner | **"Nothing waiting"** copy above | **"Couldn't load trade applications."** | reason chips wrap; ABR trading-name lists are capped at 20 by the engine and render on one wrapped line |
| Ops detail | spinner | n/a | **"Couldn't load this application."** | decision reasons wrap; no truncation |

## 18.12 Assumptions (`ASSUMED:` — vetoable)

| Tag | Assumption | Where |
|---|---|---|
| `P2-UX-1` | The gate's caption entry for a malformed ABN reads "ABN", reusing Phase 1's "Still needed:" sentence rather than introducing a second caption idiom | §18.5.1 |
| `P2-UX-2` | The optional business group sits **last** in the details stage, after delivery | §18.5 |
| ~~`P2-UX-3`~~ | ~~On `/trade-account` the business fields come **before** the email/OTP step~~ — **STRUCK by the owner, 2026-08-19** (revision 3): one universal flow, the optional group inside it, the fork after it | §18.2 |
| ~~`P2-UX-4`~~ | ~~The builder/tradie control has no pre-selected option…~~ — **moot: the control is REMOVED by owner ruling P2-D5, 2026-08-19** | — |
| `P2-UX-5` | The four emails carry **no greeting line** (null-name safety); `{business}` is the only body variable | §18.8 |
| `P2-UX-6` | Rejected and revoked states use **mute** tone, not attention/danger — a private account is not an error state | §18.3.5 |
| `P2-UX-7` | The ops queue is a **tab** inside Customers (exercising P2-A9's placement latitude), with the count as a dashboard tile | §18.7.1-2 |
| `P2-UX-8` | Wording of the ops evidence labels ("What the register said", "The three checks") — staff-facing, tunable without a gate | §18.7.3 |
| `P2-UX-9` | The verified card keeps **business name read-only** (design `P2-ARCH-5`); the ABN is read-only there too | §18.3.2 |
| `P2-UX-10` | **Orchestrator's decision, not the owner's — flagged for veto.** On `/trade-account` the optional group renders **already revealed**; everywhere else it stays collapsed until relevant. Same component, same flow, same copy — only the initial disclosure differs by entry point | §18.2.1 |

## 18.13 What must not appear (assert, don't assume)

Playwright absence assertions, not review items:

1. No `%` and no derivable figure pair on `/trade-account`, the account page, the gate, the
   confirmation screen, or any rendered email (AC-P2-47).
2. No builder/tradie control, radio, select or label on **any** surface — customer or ops —
   and no rendered text offering the choice (AC-P2-15 as restated by P2-D5).
3. No ABN field at the gate for a verified or pending account (AC-P2-19).
4. No referral-code input on anything this phase adds (AC-P2-57).
5. No queue reason, criterion name, or other-ABN-holder reference in any customer-facing
   response, screen or email (AB-P2-7, AC-P2-44).
6. No timeframe token ("business day", "hours", "usually", a date) in any outcome screen or
   email (AC-P2-64) — **and, on the confirmation screen, no trade block rendered above the
   action buttons**, where it would inherit Phase 1's quote-review SLA by adjacency (§18.5.2).
   The Playwright assertion is positional as well as textual: the trade block's DOM position is
   after the actions container.
7. Trade copy on exactly the four AC-P2-48 surfaces and nowhere else — home page, nav, quote
   builder and review pricing panels stay silent.
8. **No second signup form.** `/trade-account`, `/login` and the submit gate all mount the same
   `OtpSignIn` and the same details step; the trade page renders no email, code or name field of
   its own. The Playwright assertion is structural: the trade page's signup controls carry the
   same ids/labels as `/login`'s, and the page contains no form element the shared component did
   not render.

## 18.14 Open questions for the owner — put these at the mock gate

Neither blocks implementation; both are cheap to change now and annoying to change later, so
they go to the owner **with** the mock rather than after it. Recorded here so they survive into
the gate presentation.

1. **Is "better prices" the phrase AMJ wants?** It is the standing description of trade pricing
   on every customer surface and in two of the four emails, chosen because it states the benefit
   without implying a discount off a published number (which is what the no-percentage,
   no-derivable-pair rule exists to prevent). Alternatives that obey the same rule: "trade
   pricing" alone, or "your pricing". Changing it is one string in five places; changing it
   after the copy ships means re-authoring Sanity templates too.
2. **Should the gate's optional business group sit earlier than last?** (`P2-UX-2`.) It
   currently sits after delivery, under its own rule, so nothing optional interrupts the run of
   required fields — which also means a hurrying tradie may never scroll to it. Moving it up to
   sit beside name and phone would put it in front of more eyes at the cost of interrupting the
   required run. The owner overruled "keep the gate minimal" once already (P2-D3), so this is
   their call, not a re-litigation of it.

**Resolved without the owner** (recorded so the gate can see what was decided rather than
asked): the two ui-designer copy findings above — the "three checks" count and the SLA
adjacency — were both settled on the rules already given (the triple is three, and no turnaround
may be promised), so neither became a question.
