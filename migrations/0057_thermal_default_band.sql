-- 0057: the owner's dial — the default Uw cap, as a settable record with provenance.
--
-- ADDITIVE ONLY: one new table. No existing table is altered, dropped or rebuilt,
-- so the CREATE/INSERT/DROP/RENAME recipe that once cascade-deleted 20 order_line
-- and 4 payment rows in production is not used here at all.
--
-- CASCADE AUDIT (d1-migration-safety, run 2026-08-20):
--   `grep -rn "REFERENCES thermal_default_band" migrations/`  → no matches.
--   This DDL contains no REFERENCES clause of its own.
--   Therefore no foreign-key edge exists in either direction, none of the
--   schema's ON DELETE CASCADE clauses can fire, and PRAGMA defer_foreign_keys
--   is not needed.
--   Children affected: NONE. Expected row-count delta on every existing table: 0.
--
-- THIS IS A LEDGER. Rows are inserted, never updated or deleted. The newest row
-- is the active default band; the code-resident seed (worker/lib/estimator/
-- thermal/defaultBand.ts, carrying today's value) serves while the table is
-- empty. Superseding the default means INSERTING a row, so history stays
-- readable and a past estimate is never re-based.
--
-- DELIBERATELY NO SEED ROW HERE. The value is the owner's business decision and
-- he will supersede it; freezing one into an append-only migration file would
-- also kill the empty-table fallback path the seed test exercises.
--
-- The method CHECK deliberately OMITS 'observed_report_maximum'. That derivation
-- rule — set the default from the maximum Uw seen in parsed energy reports — was
-- withdrawn by the owner: it would have taken deliverable published catalogue
-- rows from 49 to 28. An expressible method is an invitation, so the enum cannot
-- express it.
CREATE TABLE thermal_default_band (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  max_u_value       REAL NOT NULL CHECK (max_u_value > 0),
  method            TEXT NOT NULL CHECK (method IN ('unsourced_legacy','abcb_glazing_calculator','manual')),
  source            TEXT NOT NULL,
  derived_at        TEXT NOT NULL,
  observations_json TEXT,
  -- Staff identity as text, deliberately NOT a foreign key to `user`: a staffer
  -- may be a Cloudflare Access email with no user row, and an FK would add a
  -- cascade edge to a configuration ledger in exchange for nothing.
  set_by            TEXT NOT NULL,
  interim           INTEGER NOT NULL DEFAULT 0 CHECK (interim IN (0,1)),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
