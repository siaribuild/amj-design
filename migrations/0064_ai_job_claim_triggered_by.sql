-- Marks who caused a claim generation: 'upload' (customer document flow — the
-- default, and everything historical) or 'ops' (staff re-evaluation of an
-- already-completed parse). Monitoring counts uploads only (spec criterion 11).
-- children affected: none — nothing REFERENCES ai_job_claim (verified by grep,
-- matching migration 0059's own statement). Pure ADD COLUMN: additive class,
-- no rebuild, no PRAGMA defer_foreign_keys needed.
ALTER TABLE ai_job_claim ADD COLUMN triggered_by TEXT NOT NULL DEFAULT 'upload';
