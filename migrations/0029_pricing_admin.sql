-- ═══════════════════════════════════════════════════════════════════════════
-- 0029_pricing_admin — make the D1 commercial layer editable from ops.
--
-- Until now every price input in this system could only be changed by writing a
-- migration and shipping a deploy. That is why pricing_option_surcharge stayed
-- EMPTY from 0015 to 0027 while Sanity accumulated 54 options: nobody whose job
-- it is to set a price could set one. The console gains a Pricing screen; these
-- two tables are what make that safe rather than merely possible.
--
--  • pricing_change  — the versioned before/after of every write, with the
--    actor and an optional note. audit_event records THAT something changed;
--    this records what it changed FROM, which is what a revert needs.
--  • pricing_reconcile_run — the result of comparing what Sanity offers against
--    what D1 prices. Persisted so the console can distinguish "checked, no
--    problems" from "nothing has ever checked" — an unlabelled green banner is
--    indistinguishable from a broken checker.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE pricing_change (
  id            TEXT PRIMARY KEY,
  table_name    TEXT NOT NULL,          -- 'pricing_rate_card' | 'pricing_option_surcharge' | 'pricing_modifier' | 'pricing_policy'
  row_id        TEXT NOT NULL,          -- rate card id / option slug / 'default'
  from_version  TEXT,
  to_version    TEXT NOT NULL,
  before_json   TEXT,
  after_json    TEXT,
  note          TEXT,
  actor         TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The history panel reads newest-first per row.
CREATE INDEX idx_pricing_change_row ON pricing_change(table_name, row_id, created_at DESC);

CREATE TABLE pricing_reconcile_run (
  id                TEXT PRIMARY KEY,
  checked_at        TEXT NOT NULL DEFAULT (datetime('now')),
  ok                INTEGER NOT NULL,   -- 1 when nothing is missing
  missing_json      TEXT,               -- options a product offers with no D1 price
  orphaned_json     TEXT,               -- priced options no product offers (harmless)
  no_rate_card_json TEXT                -- families falling back to 'default'
);

CREATE INDEX idx_pricing_reconcile_run_at ON pricing_reconcile_run(checked_at DESC);
