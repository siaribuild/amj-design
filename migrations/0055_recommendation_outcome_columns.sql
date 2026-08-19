-- The recommendation model's emitted contract (ADR 0007, spec §4.10).
--
-- ADDITIVE ONLY. NO TABLE IS REBUILT, and that is not a stylistic preference:
--   candidate_result is referenced by
--     draft_order_line.selected_candidate_id ... ON DELETE SET NULL
--     (migrations/0014_estimator_platform.sql:119)
--   selection_run is referenced by
--     candidate_result.selection_run_id ... ON DELETE CASCADE  (0014:98)
--     review_feedback.selection_run_id  ... ON DELETE SET NULL (0014:141, table
--                                            dropped by 0030)
-- A rebuild of candidate_result would fire that SET NULL and silently sever
-- every draft line from the candidate it was built from — the same shape of
-- failure that cost 20 order_line and 4 payment rows in production. Migration
-- 0022 is the ADD COLUMN precedent on these exact tables.
--
-- children affected: none. ADD COLUMN touches no rows and fires no cascade.
-- expected remote row effect: zero rows inserted, updated or deleted anywhere.

-- The per-candidate verdict ops2 R3 reads: tier, rank, deviation per axis,
-- price delta against the pick, and the constraints an excluded candidate
-- failed. Structured facts only — never prose (AC-21).
ALTER TABLE candidate_result ADD COLUMN outcome_json TEXT;

-- The run-level verdict: the requirement and where it came from, the tolerance
-- the run was decided under (so a past selection is reproducible), the
-- competing tier and the status.
ALTER TABLE selection_run ADD COLUMN selection_json TEXT;

-- candidate_result.score and .score_components_json STAY in the schema and stop
-- being written (AC-24, AC-25). Dropping them would mean a rebuild, which is
-- exactly what this migration exists not to do; the historical rows they hold
-- are still readable, and their version columns say which model wrote them.
