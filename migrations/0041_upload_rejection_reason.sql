-- Why an upload was refused, kept.
--
-- upload_reservation recorded status='rejected' and nothing else, so the one
-- question a refusal provokes — "why was my file rejected?" — could not be
-- answered from the database at all. It had to be reconstructed by re-running
-- the scanner against a copy of the file the customer still happened to have.
--
-- The reason and detail already exist at the moment of refusal; they were
-- returned to the browser and then dropped. This keeps them.
--
-- `reason` is the machine code (pdf_javascript, type_not_allowed, too_large,
-- quota_exceeded…). `detail` is the human sentence, and is nullable because
-- several refusal paths have no more to say than their reason.
ALTER TABLE upload_reservation ADD COLUMN reason TEXT;
ALTER TABLE upload_reservation ADD COLUMN detail TEXT;

-- Finding recent refusals is the whole point of storing them.
CREATE INDEX IF NOT EXISTS idx_upload_reservation_rejected
  ON upload_reservation (status, created_at DESC);
