-- ═══════════════════════════════════════════════════════════════════════════
-- 0006_project_contact — persist the submission contact on the project.
--
-- Until now the quote-review contact (name/email/phone/delivery suburb) captured
-- on the submit screen was collected by the SPA but never stored, so anonymous
-- submissions had no contact identity for staff to act on. These columns give
-- every project a durable contact snapshot, independent of whether the submitter
-- ever creates an account. Append-only: never edit an applied migration.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE project ADD COLUMN contact_name     TEXT;
ALTER TABLE project ADD COLUMN contact_email    TEXT;
ALTER TABLE project ADD COLUMN contact_phone    TEXT;
ALTER TABLE project ADD COLUMN delivery_suburb  TEXT;
