-- ═══════════════════════════════════════════════════════════════════════════
-- 0051_referral_program — refer a mate, both sides win.
--
-- A registered user shares a code. The mate who arrives with it gets 2.5% off
-- their first order; when that order is paid in full, the referrer is paid 1% of
-- it, in cash, into their bank account, within 14 days. Spec
-- docs/specs/referral-program.md, design docs/design/referral-program.md §3.
--
-- ADDITIVE ONLY — AC-49c. There is no UPDATE in this file. Not one existing
-- quote_line.line_total, order_line.line_total, "order".total,
-- "order".delivery_total or payment.amount is read, recomputed or rewritten. The
-- criterion the whole feature lives or dies on is that every existing account
-- and every existing quote prices identically afterwards, and it is verified by
-- running scripts/db/price-checksums.sql either side of this migration rather
-- than by reading this comment and believing it.
--
-- THE SNAPSHOT COLUMNS ON `referral` ARE COMPLIANCE-LOAD-BEARING (M10, ADR-6).
-- Rate, cap, minimum, discount and window are copied onto the relationship when
-- it is RECORDED, and every function that later computes money or a discount for
-- that referral reads them from here — never from the live config. The config is
-- the source of truth for new referrals; this row is the source of truth for a
-- promise already made to a real person. An expiry paired with a unilateral
-- right to vary the terms is the unfair-contract-terms exposure; making the
-- variation structurally unable to reach a promise already made is the answer.
--
-- STATE THAT IS DERIVED IS NOT STORED (spec §7). There is no `expired` status
-- and no `available/used/expired` column: the discount's lifecycle is computed
-- from this row, its expires_at, and whether the account has an order. A stored
-- copy would be a second source of truth that goes stale in the gap between the
-- order landing and whatever job was meant to update it.
--
-- TWO PROGRAM STATES, HELD AS A BOOLEAN. `active` is On/Off. Off means "come
-- back later", not "gone": new referrals are not recorded, the join journey
-- stops after login, and one banner appears on the landing page. Earlier
-- revisions carried active/paused/terminated; that model was cut, so there is
-- deliberately no `status` column here for a third state to come back through.
-- ═══════════════════════════════════════════════════════════════════════════

-- The code belongs to the account. SQLite permits many NULLs under a UNIQUE
-- index, which is what lets "no code until the payability gate passes" (D18) be
-- an absence rather than an inactive-code flag: staff accounts and every account
-- that has not stored payout details simply have no code, so there is nothing to
-- click, nothing to type, and no window in which a referral could be recorded
-- against a referrer who cannot be paid.
ALTER TABLE user ADD COLUMN referral_code TEXT;
CREATE UNIQUE INDEX idx_user_referral_code ON user(referral_code);

-- Payout method, entered by the customer. Masked on every customer read-back;
-- the raw columns are read by exactly one function, which writes the access log
-- below as a side effect. The ABN stays the existing profile field.
ALTER TABLE user ADD COLUMN payout_bsb TEXT;
ALTER TABLE user ADD COLUMN payout_account_number TEXT;
ALTER TABLE user ADD COLUMN payout_account_name TEXT;

-- The badge on an ISSUED quote needs a frozen fact, and the per-line pricing
-- snapshot is not one: a customer edit nulls pricing_snapshot_json, so a badge
-- derived from it would vanish when the customer touched the line. Stamped by
-- issueQuote at the same moment delivery freezes (the 0044 precedent). It is a
-- label, never a price — nothing recomputes a total from it.
ALTER TABLE project ADD COLUMN referral_percent_at_issue REAL;

-- Singleton config, versioned like pricing_policy so the ops save can use the
-- one optimistic-concurrency helper. EVERY advertised figure in the program
-- renders from this row: the owner kept the discount at 2.5% specifically
-- because it can be raised without a deploy, and that is only true if no figure
-- is ever typed into prose.
CREATE TABLE referral_program (
  id                        TEXT PRIMARY KEY,             -- 'default'
  active                    INTEGER NOT NULL DEFAULT 1,   -- On/Off. No third state.
  referrer_reward_active    INTEGER NOT NULL DEFAULT 1,   -- the two sides are
  referred_discount_active  INTEGER NOT NULL DEFAULT 1,   -- separately switchable
  rate_percent              REAL NOT NULL DEFAULT 1,      -- commission, % of ex-GST goods
  cap_amount                REAL,                         -- NULL = no cap, and it ships NULL
  min_order_amount          REAL NOT NULL DEFAULT 2000,   -- qualifying first order, ex GST
  min_payout_balance        REAL NOT NULL DEFAULT 0,      -- 0 = off; see the long-stop in referrals.ts
  window_months             INTEGER NOT NULL DEFAULT 12,  -- ONE clock: earning window and discount validity
  discount_percent          REAL NOT NULL DEFAULT 2.5,    -- the referred mate's first-order discount
  payout_timeframe_days     INTEGER NOT NULL DEFAULT 14,  -- stated in the offer, and met
  version                   TEXT NOT NULL DEFAULT 'v1',
  updated_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by                TEXT
);
INSERT INTO referral_program (id) VALUES ('default');

-- The RELATIONSHIP. It holds no contact details for anybody: both parties are
-- user foreign keys, because every referral is created by the referred person
-- identifying themselves — arriving on a link that sets a cookie in their own
-- browser, or typing a code into their own account. A referrer never tells this
-- system anything about the mate they referred, and there is no column here
-- through which they could.
CREATE TABLE referral (
  id                    TEXT PRIMARY KEY,
  referrer_user_id      TEXT NOT NULL REFERENCES user(id),
  referred_user_id      TEXT NOT NULL UNIQUE REFERENCES user(id),  -- one referral per account, permanently
  code                  TEXT NOT NULL,
  source                TEXT NOT NULL CHECK (source IN ('link','manual')),
  status                TEXT NOT NULL DEFAULT 'recorded'
                          CHECK (status IN ('recorded','void')),
  -- ── the promise as it was made (M10) ──────────────────────────────────────
  rate_percent          REAL NOT NULL,
  cap_amount            REAL,
  min_order_amount      REAL NOT NULL,
  discount_percent      REAL NOT NULL,
  window_months         INTEGER NOT NULL,
  expires_at            TEXT NOT NULL,      -- created_at + window_months
  -- ── operational record ────────────────────────────────────────────────────
  void_reason           TEXT,               -- mandatory on an ops void: what a
  voided_by             TEXT,               -- staff member reads later to know
  voided_at             TEXT,               -- why money did not go out
  reminder_sent_at      TEXT,               -- the 30-day expiry email, once
  expired_processed_at  TEXT,               -- the stale-draft sweep, once
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  -- Self-referral is refused by the table, not by a code path that could be
  -- bypassed by a future caller.
  CHECK (referrer_user_id <> referred_user_id)
);
CREATE INDEX idx_referral_referrer ON referral(referrer_user_id);
CREATE INDEX idx_referral_expiry   ON referral(status, expires_at);

-- The MONEY, deliberately a second table. Voiding a relationship and voiding a
-- payment are different acts with different reasons, and the payout batch links
-- to money rather than to relationships.
CREATE TABLE referral_earning (
  id            TEXT PRIMARY KEY,
  referral_id   TEXT NOT NULL REFERENCES referral(id),
  order_id      TEXT NOT NULL UNIQUE,       -- first order only: one earning per order, ever
  base_amount   REAL NOT NULL,              -- post-discount ex-GST goods, via taxBreakdown
  rate_percent  REAL NOT NULL,              -- copied from the referral's snapshot, not the config
  amount        REAL NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','void','paid')),
  payout_id     TEXT,
  void_reason   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  -- The instant the money became PAYABLE, which is what the stated payment
  -- timeframe is measured from.
  confirmed_at  TEXT,
  voided_at     TEXT
);
CREATE INDEX idx_earning_status ON referral_earning(status, confirmed_at);

-- One row per referrer per payment run. The banking columns are a FROZEN COPY
-- taken at the moment of payment: they are the accountant's record of what was
-- actually paid, so they must not move when the referrer later edits their
-- details. That is why they are duplicated here rather than joined from `user`.
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

-- Who looked at, or changed, a referrer's bank details — and when. It has NO
-- READER anywhere in the application: no endpoint, no screen, no export, no
-- filter. That is a constraint rather than an omission, and it is why these rows
-- do not go into audit_event (which has a global ops viewer).
--
-- THE LOG RECORDS THE FACT OF ACCESS, NEVER THE VALUE. There is no column here
-- that could hold a BSB or an account number: copying the details into a log in
-- order to protect the details is self-defeating. `context` carries the calling
-- surface and, for a change, a masked fingerprint only.
CREATE TABLE payout_details_access (
  id               TEXT PRIMARY KEY,
  subject_user_id  TEXT NOT NULL,
  actor_user_id    TEXT NOT NULL,
  action           TEXT NOT NULL CHECK (action IN ('view','change')),
  context          TEXT,
  at               TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_payout_access_subject ON payout_details_access(subject_user_id, at);
