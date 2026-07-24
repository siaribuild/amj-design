-- Upload scanning: record which engine cleared a file and when, and retire the
-- pre-scanning backlog.
--
-- Uploads are now scanned inline before their bytes are persisted, so new rows
-- land as 'clean' (or never exist at all). Rows created before scanning existed
-- are 'pending' but were never actually scanned — relabel them 'skipped' so the
-- two states stay honest:
--   pending — a scan was attempted and did not complete.
--   skipped — predates scanning; needs an explicit staff rescan.
-- Neither is downloadable or parseable; POST /api/ops/files/:id/rescan clears them.

ALTER TABLE file_asset ADD COLUMN scan_engine TEXT;
ALTER TABLE file_asset ADD COLUMN scanned_at TEXT;

UPDATE file_asset SET virus_status = 'skipped' WHERE virus_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_file_virus_status ON file_asset(virus_status);
