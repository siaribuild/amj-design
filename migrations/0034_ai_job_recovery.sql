-- AI extraction recovery metadata.
--
-- `ai_daily_usage` from 0023 is intentionally no longer consulted. It counted
-- whole pipeline runs even though one run can issue many provider requests, and
-- therefore could not enforce the AI Gateway's request-rate policy. Provider
-- rate limiting is handled as a retryable/deferred job outcome instead.
ALTER TABLE ai_job_claim ADD COLUMN failure_class TEXT
  CHECK (failure_class IN ('permanent', 'transient', 'quota') OR failure_class IS NULL);

ALTER TABLE ai_job_claim ADD COLUMN retry_after TEXT;

CREATE INDEX idx_ai_job_claim_retry
  ON ai_job_claim(status, retry_after, updated_at);

-- Re-open claims stranded by the removed daily gate. The scheduled-job recovery
-- sweep will dispatch current draft generations; stale generations are ignored
-- by its project join and remain harmless audit history.
UPDATE ai_job_claim
   SET status = 'scheduled',
       attempts = 0,
       last_error = 'legacy_daily_limit_removed',
       failure_class = 'quota',
       retry_after = datetime('now')
 WHERE status = 'failed'
   AND last_error = 'ai_daily_budget_exhausted';
