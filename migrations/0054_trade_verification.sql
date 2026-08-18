-- 0054_trade_verification
--
-- User registration Phase 2 — trade verification (ABN / ABR).
-- Spec: docs/specs/user-registration-phase-2.md §5.9, §9.
-- Design: docs/specs/user-registration-phase-2-design.md §3.
-- ADR: docs/adr/0002-trade-status-derived-from-application-ledger.md
--
-- Additive + targeted UPDATE only: one CREATE TABLE, three CREATE INDEX,
-- two UPDATE user, three INSERT ... SELECT. No ALTER TABLE at all.
-- NO table rebuild, NO DROP, NO default change. In particular migration 0032's
-- `DEFAULT 5` on user.discount_percent stays untouched dead weight: altering a
-- column default in SQLite means rebuilding `user`, and a rebuild in THIS
-- database has already fired ON DELETE CASCADE and destroyed production rows
-- (handover §4.7, AC-P2-52).
--
-- children affected: none expected (additive CREATE TABLE / UPDATE / INSERT
-- only; membership.user_id (migrations/0001:42) and ai_daily_usage.user_id
-- (migrations/0023:24) are user's ON DELETE CASCADE children, and nothing here
-- drops or rebuilds user, so no cascade can fire). Row counts for user,
-- membership, project, quote_line, payout and "order" are unchanged by this file
-- (AC-P2-53); trade_application gains at most 3 rows.

-- ── The trade-verification ledger ───────────────────────────────────────────
-- One row per application attempt. The frozen-copy pattern a Payout already uses
-- (CONTEXT.md): the ACCOUNT row holds the live fact (user.abn, user.company,
-- user.discount_percent); THIS table holds what was submitted and what the ABR
-- said at that moment.
--
-- There is no builder/tradie column. The owner ruled on 2026-08-19 that the two
-- are no different in anything this system does (P2-D5, superseding D7), so the
-- distinction is not stored rather than stored and ignored.
--
-- There is deliberately NO trade-status column on `user`. "Currently verified"
-- IS "has a standing grant row here" — ADR-0002 records why a stored enum is
-- provably wrong (a verified account re-applying is verified AND pending at
-- once) and why deriving keeps the duplicate rule honest after an ops ABN edit.
CREATE TABLE trade_application (
  id              TEXT PRIMARY KEY,
  -- Deliberately NO ON DELETE CASCADE (the referral-table precedent, 0051:93-94):
  -- verification history is an audit record and must survive. A user delete with
  -- applications present fails closed on the FK rather than silently destroying
  -- the ledger.
  user_id         TEXT NOT NULL REFERENCES user(id),
  -- Frozen submission. abn is normalised to 11 digits; NULL only on the
  -- grandfathered rows for accounts that hold no ABN — nothing is invented to
  -- fill this column (AC-P2-51 / E-P2-9).
  abn             TEXT,
  business_name   TEXT,
  source          TEXT NOT NULL DEFAULT 'profile',     -- 'trade_page' | 'profile' | 'submit_gate' | 'migration'
  -- Decision state.
  status          TEXT NOT NULL DEFAULT 'pending',     -- 'pending' | 'approved' | 'rejected'
  queue_reasons   TEXT,                                -- JSON array; NULL/[] on auto-pass
  abr_snapshot    TEXT,                                -- JSON evidence; NULL on grandfathered rows
  decided_via     TEXT,                                -- 'auto' | 'ops' | 'grandfathered'; NULL while pending
  decided_by      TEXT REFERENCES user(id),            -- staff id; NULL for auto + grandfathered
  decided_at      TEXT,
  decision_reason TEXT,                                -- ops free text (reject reason / approve note)
  -- Revocation of the grant this row made (the mirror of approval; P2-A11).
  revoked_at      TEXT,
  revoked_by      TEXT REFERENCES user(id),
  revoke_reason   TEXT,
  superseded_at   TEXT,                                -- set when a LATER approval replaces this grant
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- DB-enforced invariants, not code conventions.
-- At most ONE open application per account (P2-A10 / E-P2-5) — this is what makes
-- a concurrent double-submit a constraint violation rather than torn state.
CREATE UNIQUE INDEX trade_application_one_pending
  ON trade_application(user_id) WHERE status = 'pending';
-- At most ONE standing grant per account. This index IS the definition of
-- "currently verified".
CREATE UNIQUE INDEX trade_application_one_standing
  ON trade_application(user_id)
  WHERE status = 'approved' AND revoked_at IS NULL AND superseded_at IS NULL;
-- The duplicate-rule lookup path (D2.1): "is this ABN verified on another
-- account right now?". Deliberately NOT unique — D2.1 requires ops to be able to
-- knowingly approve a second holder, and a unique index would make that allowed
-- state unrepresentable.
CREATE INDEX trade_application_abn ON trade_application(abn) WHERE abn IS NOT NULL;

-- ── Staff pinning (AC-P2-50) ────────────────────────────────────────────────
-- Staff never carry a customer discount. Phase 1 fixed the two creation INSERTs
-- only; the rows that existed before it are still on migration 0032's default.
UPDATE user SET discount_percent = 0 WHERE type = 'internal';

-- ── Grandfathering (D4 / spec §5.9) ─────────────────────────────────────────
-- EXACTLY the three addresses the owner named on 2026-08-19 — never "every
-- customer row that exists when the migration runs", which would silently
-- grandfather anyone who registers between now and the deploy (AC-P2-51).
-- Two of the three hold no ABN at all: they are granted by OWNER DECISION, not
-- by verification, and the ledger rows below say so (decided_via
-- 'grandfathered', NULL abn) rather than dressing it up as a verified result.
--
-- The literal 5 is the business-account default. The code authority is
-- TRADE_DISCOUNT_DEFAULT in worker/lib/trade.ts — a migration cannot read a TS
-- constant, so the trade-verification suite asserts the two agree (AC-P2-28/51).
UPDATE user SET discount_percent = 5
 WHERE type = 'customer'
   AND email IN ('gediminas.bereznevicius@gmail.com',
                 'sarah@northsidebuild.com.au',
                 'doni@siaribuild.com.au');

-- One approved ledger row per grandfathered account, so their ops record reads
-- as grandfathered rather than as a decision someone made (AC-P2-40). Written as
-- three single-address INSERT ... SELECTs so the reviewed SQL names each grant
-- individually, and so an address absent from a local/dev database simply
-- inserts nothing. The ABN is copied normalised WHERE PRESENT and never invented.
INSERT INTO trade_application
  (id, user_id, abn, business_name, source, status,
   decided_via, decided_at, decision_reason, created_at)
SELECT lower(hex(randomblob(16))), id,
       CASE WHEN abn IS NULL OR replace(abn,' ','') = '' THEN NULL ELSE replace(abn,' ','') END,
       company, 'migration', 'approved',
       'grandfathered', datetime('now'),
       'Grandfathered by owner decision (grill D4, 2026-08-19); not verified against ABR.',
       datetime('now')
FROM user WHERE type = 'customer' AND email = 'gediminas.bereznevicius@gmail.com';

INSERT INTO trade_application
  (id, user_id, abn, business_name, source, status,
   decided_via, decided_at, decision_reason, created_at)
SELECT lower(hex(randomblob(16))), id,
       CASE WHEN abn IS NULL OR replace(abn,' ','') = '' THEN NULL ELSE replace(abn,' ','') END,
       company, 'migration', 'approved',
       'grandfathered', datetime('now'),
       'Grandfathered by owner decision (grill D4, 2026-08-19); not verified against ABR.',
       datetime('now')
FROM user WHERE type = 'customer' AND email = 'sarah@northsidebuild.com.au';

INSERT INTO trade_application
  (id, user_id, abn, business_name, source, status,
   decided_via, decided_at, decision_reason, created_at)
SELECT lower(hex(randomblob(16))), id,
       CASE WHEN abn IS NULL OR replace(abn,' ','') = '' THEN NULL ELSE replace(abn,' ','') END,
       company, 'migration', 'approved',
       'grandfathered', datetime('now'),
       'Grandfathered by owner decision (grill D4, 2026-08-19); not verified against ABR.',
       datetime('now')
FROM user WHERE type = 'customer' AND email = 'doni@siaribuild.com.au';
