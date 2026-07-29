-- Customer-visible AI progress. These are coarse, truthful pipeline milestones,
-- never model chain-of-thought or invented timer animation.
ALTER TABLE ai_job_claim ADD COLUMN progress_stage TEXT NOT NULL DEFAULT 'queued'
  CHECK (progress_stage IN (
    'queued',
    'reading_documents',
    'extracting_schedule',
    'building_envelope',
    'matching_and_pricing',
    'preparing_quote',
    'waiting_capacity',
    'complete'
  ));

UPDATE ai_job_claim
   SET progress_stage = CASE
     WHEN status = 'processing' THEN 'reading_documents'
     WHEN status IN ('completed', 'superseded') THEN 'complete'
     WHEN failure_class = 'quota' THEN 'waiting_capacity'
     ELSE 'queued'
   END;
