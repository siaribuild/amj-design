-- 0020_ai_run_summary — persisted AiExtractionSummary on the run (multi-file UX
-- slice 3). The customer's extraction-status polling endpoint reads this to show
-- "Reading N documents…" → the completed digest tail (lines, conflicts,
-- energyApplied) without exposing any ops-only internals.
ALTER TABLE ai_runs ADD COLUMN summary_json TEXT;
