-- Drawing-read progress: how many of a job's openings have been read.
--
-- children affected: none — nothing REFERENCES ai_job_claim.
-- Verified with `grep -rn "REFERENCES ai_job_claim" migrations/*.sql`, which
-- returns nothing. Recorded here rather than left to be re-derived: this schema
-- carries 52 live ON DELETE CASCADE clauses, and a rebuild of a parent table
-- once silently deleted 20 order_line and 4 payment rows in production after
-- applying cleanly locally — local data had no children to kill.
--
-- ADDITIVE ONLY. No CREATE TABLE, no DROP, no RENAME: none of the rebuild
-- recipe, so no cascade can fire.
--
-- WHY TWO COLUMNS RATHER THAN A NEW progress_stage VALUE, which is what the
-- first design said. `progress_stage` carries a CHECK constraint (0035), and
-- SQLite cannot extend a CHECK in place — doing it means rebuilding
-- ai_job_claim, which is exactly the recipe above. The counts carry the same
-- information and the UI derives the label from them, so the stage vocabulary
-- does not have to change at all.
--
-- Nullable on purpose. Every existing row predates drawing reading and has no
-- counts; NOT NULL with a default would write a 0/0 that reads as "nothing to
-- do" rather than "this job never had drawings".

ALTER TABLE ai_job_claim ADD COLUMN drawings_done INTEGER;
ALTER TABLE ai_job_claim ADD COLUMN drawings_total INTEGER;
