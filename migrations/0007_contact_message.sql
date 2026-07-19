-- ═══════════════════════════════════════════════════════════════════════════
-- 0007_contact_message — inbound "Contact us" form submissions.
--
-- Public website enquiries land here (name/email/message + optional phone,
-- company). Staff triage them from the ops console (view + delete). Distinct
-- from `notification` (outbound) and from project `contact_*` fields (a quote's
-- submitter). Append-only: never edit an applied migration.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE contact_message (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  company    TEXT,
  message    TEXT NOT NULL,
  source     TEXT,                       -- where it came from (e.g. 'contact-page')
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_contact_created ON contact_message(created_at);
