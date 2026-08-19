-- The learned layer's retrieval key and provenance (D12, D18, ADR 0007).
--
-- ADDITIVE COLUMNS + ONE SCOPED DELETE. No table is dropped, rebuilt or
-- renamed, so no ON DELETE CASCADE anywhere in this schema can fire.
--
-- CASCADE AUDIT, run rather than assumed:
--   grep -rn "REFERENCES recommendation_outcome" migrations/  ->  0 results
-- recommendation_outcome has NO child referencers at all, so the DELETE below
-- cannot cascade into any other table (AC-58). Its own parents (project,
-- quote_line, ai_proposal_line) are unaffected by deleting child rows.
--
-- children affected: none.
-- expected remote row effect: -9 recommendation_outcome rows (the pre-provenance
--   learning corpus, D18); zero rows touched in every other table.
--   EXPORT FIRST on any remote apply — see .claude/skills/d1-migration-safety.

-- The bucket a row is retrieved by, and the version of the coarsening that
-- produced it. Stored rather than derived at read time, because that is what
-- makes a later redefinition a recompute over context_json instead of lost
-- history — and what lets a mixed-version corpus be detected at all.
ALTER TABLE recommendation_outcome ADD COLUMN retrieval_key TEXT;
ALTER TABLE recommendation_outcome ADD COLUMN retrieval_key_version TEXT;

-- Where the evidence came from. NOT a fake/real distinction: a backfilled row
-- is a real plan with the product that was actually manufactured. It is flagged
-- because the decision was made OUTSIDE the platform's review flow and may lack
-- the thermal context the retrieval key reads — so a reviewer told "3 of 4
-- similar openings went this way" can see which of the four were in-platform.
-- (SQLite permits CHECK and NOT NULL-with-default on ADD COLUMN; the default
-- satisfies both for the rows that already exist.)
ALTER TABLE recommendation_outcome ADD COLUMN provenance TEXT NOT NULL DEFAULT 'in_platform'
  CHECK (provenance IN ('in_platform','backfilled'));

CREATE INDEX idx_recommendation_outcome_retrieval
  ON recommendation_outcome(recommendation_eligible, quality_state, retrieval_key);

-- THE CORPUS RESET (D18). Exactly the rows the learning model read — nine of
-- them in production, across eleven distinct twelve-field keys, every opening
-- alone in its bucket. They carry no retrieval key and never can: the key needs
-- a width the legacy context_json did not record.
--
-- SCOPED, never a table rebuild. `pending` and `rejected` rows are IMMUTABLE
-- AUDIT RECORDS — outcomes.ts relies on them, and the platform promised to keep
-- them — so only the learning corpus is cleared. After this, no surviving row
-- predates the provenance column with an unset provenance, because the corpus
-- rows are gone and every audit row carries the default.
DELETE FROM recommendation_outcome
 WHERE recommendation_eligible = 1 AND quality_state = 'approved';
