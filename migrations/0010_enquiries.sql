-- ═══════════════════════════════════════════════════════════════════════════
-- 0010_enquiries — Contact-page leads (question + showroom appointment).
--
-- Supersedes contact_message as the system of record for public enquiries. Every
-- row carries a durable OpenFrame reference and server-owned source attribution,
-- so a lead stays attributable even after an appointment is handed to a
-- manufacturer rep. Four SEPARATE status dimensions (workflow / contact /
-- appointment / commercial) — never one overloaded status. Append-only.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE enquiry (
  id                     TEXT PRIMARY KEY,
  public_reference       TEXT NOT NULL UNIQUE,          -- OF-ENQ-YYYY-NNNNNN
  intent                 TEXT NOT NULL CHECK (intent IN ('question','appointment_request')),

  -- Customer (email/phone stored both normalised — for matching — and as entered).
  name                   TEXT NOT NULL,
  email                  TEXT NOT NULL,
  email_display          TEXT,
  phone                  TEXT,
  phone_display          TEXT,
  customer_type          TEXT,
  company                TEXT,

  -- Question branch
  topic                  TEXT,
  message                TEXT,

  -- Appointment branch (snapshotted so history never depends on the registry)
  location_id            TEXT,
  location_suburb        TEXT,
  location_state         TEXT,
  products_interest      TEXT,
  best_time_to_call      TEXT,
  preferred_days_json    TEXT,
  appointment_notes      TEXT,

  -- Context (attached from the session when signed in)
  account_id             TEXT,
  project_id             TEXT,

  -- Attribution — SERVER-OWNED. source_owner is never customer- or admin-settable.
  source_owner           TEXT NOT NULL DEFAULT 'OPENFRAME',
  source_entry_point     TEXT NOT NULL DEFAULT 'CONTACT_PAGE',
  landing_path           TEXT,
  referrer               TEXT,
  utm_json               TEXT,
  form_version           TEXT,

  -- Consent
  privacy_version        TEXT,
  marketing_opt_in       INTEGER NOT NULL DEFAULT 0,

  -- Operations — four independent dimensions
  workflow_status        TEXT NOT NULL DEFAULT 'new'            CHECK (workflow_status IN ('new','assigned','in_progress','waiting_on_customer','closed')),
  contact_outcome        TEXT NOT NULL DEFAULT 'not_contacted'  CHECK (contact_outcome IN ('not_contacted','attempted','contacted','no_response')),
  appointment_status     TEXT NOT NULL DEFAULT 'not_applicable' CHECK (appointment_status IN ('not_applicable','requested','proposed','confirmed','completed','cancelled','no_show')),
  commercial_outcome     TEXT NOT NULL DEFAULT 'unknown'        CHECK (commercial_outcome IN ('unknown','manufacturer_quote_created','order_placed','lost','not_applicable')),
  assigned_user          TEXT,

  -- Manufacturer handoff + downstream reconciliation
  manufacturer_quote_ref TEXT,
  manufacturer_order_ref TEXT,
  handed_off_at          TEXT,
  manufacturer_ack_at    TEXT,

  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_enquiry_created  ON enquiry(created_at);
CREATE INDEX idx_enquiry_workflow ON enquiry(workflow_status);
CREATE INDEX idx_enquiry_intent   ON enquiry(intent);
CREATE INDEX idx_enquiry_email    ON enquiry(email);
