-- Progress is append-only (face-mapped handover §9): every milestone the
-- parser reports is kept, not only the snapshot a poll happens to catch, so a
-- recheck between two polls is still a row the customer sees. A JSON array of
-- {at, phase, done, total, message?}, capped by the writer in bytes
-- (jobs.ts MAX_PROGRESS_LOG_BYTES) so the row stays inside D1's limit.
-- Additive: one nullable column, no rebuild, no cascade exposure.
ALTER TABLE ai_job_claim ADD COLUMN drawings_log TEXT;
