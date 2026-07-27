-- ═══════════════════════════════════════════════════════════════════════════
-- 0030_drop_review_feedback — retire the pre-submission correction log.
--
-- `review_feedback` (0014) captured a reviewer's correction, typed into the ops
-- Estimator tab. That tab reviewed the machine's product selection BEFORE the
-- customer submitted — a stage staff take no part in, since the AI proposal is
-- built into the customer's own draft — and it was removed on 2026-07-27. With
-- it went the table's only writer.
--
-- Its readers were rehomed in the same change: eligibility for ranker training
-- now derives from what a human actually ISSUED (recommendation_outcome, captured
-- at quote issue and adjudicated via PATCH /api/ops/recommendation-outcomes/:id),
-- and the learning example carries the AI's draft beside the issued outcome
-- rather than a reviewer-typed summary of the difference.
--
-- 0016 already described recommendation_outcome as "the governed replacement for
-- review_feedback (0014)". This finishes that replacement.
--
-- SAFE TO DROP: zero rows in production (verified 2026-07-27, immediately before
-- this migration was written), no foreign key in any other table references it,
-- and no code path reads or writes it. Its two indexes go with it.
-- ═══════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS idx_feedback_project;
DROP INDEX IF EXISTS idx_feedback_category;
DROP TABLE IF EXISTS review_feedback;
