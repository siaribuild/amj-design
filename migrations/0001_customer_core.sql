-- ═══════════════════════════════════════════════════════════════════════════
-- 0001_customer_core — customer-scope domain model (D1 / SQLite)
--
-- Scope: the customer side of the CPQ journey (product -> order -> delivery),
-- for anonymous + registered users. Derived from docs/customer-backend-scaffold.md.
--
-- Design invariants (do not collapse these):
--   * draft lines (quote_line, revision_id NULL) vs issued snapshot lines
--     (revision_line) vs order lines (order_line) are SEPARATE records.
--   * external_ref (schedule code W01/D03) is the PRIMARY builder-facing line id.
--   * room_label is OPTIONAL secondary metadata.
--   * customer status / internal status / (later) approval status are distinct.
--
-- Ephemeral auth state (OTP codes, session tokens) lives in KV, NOT here.
-- Table order is dependency-first so foreign keys resolve cleanly.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Identity ────────────────────────────────────────────────────────────────
CREATE TABLE user (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  name             TEXT,
  phone            TEXT,
  type             TEXT NOT NULL DEFAULT 'customer' CHECK (type IN ('customer','internal')),
  -- Bumped to invalidate every existing session for this user (sign-out-all).
  session_epoch    INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_verified_at TEXT
);

CREATE TABLE organisation (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  trading_name   TEXT,
  abn            TEXT,
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','suspended','closed')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE membership (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  organisation_id TEXT NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member','readonly')),
  branch_scope    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, organisation_id)
);

-- ── Projects & quote lines ──────────────────────────────────────────────────
CREATE TABLE project (
  id              TEXT PRIMARY KEY,
  organisation_id TEXT REFERENCES organisation(id),
  owner_user_id   TEXT REFERENCES user(id),
  -- Anonymous ownership before login (httpOnly cookie). NULL once claimed.
  claim_token     TEXT UNIQUE,
  title           TEXT,
  status_customer TEXT NOT NULL DEFAULT 'draft'
    CHECK (status_customer IN ('draft','submitted','needs_information','under_review','quote_issued','accepted','expired','closed')),
  status_internal TEXT NOT NULL DEFAULT 'draft',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_project_owner ON project(owner_user_id);
CREATE INDEX idx_project_claim ON project(claim_token);

-- Issued snapshot header. Created on every "issue revision" action.
CREATE TABLE quote_revision (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  revision_no     INTEGER NOT NULL,
  snapshot_status TEXT NOT NULL DEFAULT 'issued'
    CHECK (snapshot_status IN ('issued','accepted','superseded','expired')),
  totals_json     TEXT NOT NULL DEFAULT '{}',
  issued_at       TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at     TEXT,
  expiry_at       TEXT,
  UNIQUE (project_id, revision_no)
);

-- Live draft line. revision_id is always NULL here (kept for query symmetry);
-- issued copies live in revision_line so the draft stays editable post-issue.
CREATE TABLE quote_line (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  revision_id  TEXT REFERENCES quote_revision(id),
  external_ref TEXT,                       -- schedule code, e.g. W01 / D03
  room_label   TEXT,                       -- optional secondary label ("Note")
  product_slug TEXT NOT NULL,              -- reference into catalogue (Sanity later)
  options_json TEXT NOT NULL DEFAULT '{}',
  dims_json    TEXT NOT NULL DEFAULT '{}',
  measured_by  TEXT NOT NULL DEFAULT '' CHECK (measured_by IN ('','frame','opening','unsure')),
  qty          INTEGER NOT NULL DEFAULT 1,
  line_total   REAL,                        -- server-computed; NULL when unpriceable
  status       TEXT NOT NULL DEFAULT 'incomplete'
    CHECK (status IN ('incomplete','ready','technical_review','policy_exception','unavailable','superseded','ordered')),
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_line_project ON quote_line(project_id);

-- Immutable line snapshot copied from quote_line at issue time.
CREATE TABLE revision_line (
  id                    TEXT PRIMARY KEY,
  revision_id           TEXT NOT NULL REFERENCES quote_revision(id) ON DELETE CASCADE,
  external_ref          TEXT,
  room_label            TEXT,
  product_snapshot_json TEXT NOT NULL,      -- frozen product/config at issue
  dims_json             TEXT NOT NULL DEFAULT '{}',
  options_json          TEXT NOT NULL DEFAULT '{}',
  qty                   INTEGER NOT NULL DEFAULT 1,
  line_total            REAL NOT NULL
);
CREATE INDEX idx_revline_rev ON revision_line(revision_id);

-- ── Orders (manual payment for MVP) ─────────────────────────────────────────
-- `order` is a SQL keyword; always quote it.
CREATE TABLE "order" (
  id                   TEXT PRIMARY KEY,
  project_id           TEXT NOT NULL REFERENCES project(id),
  accepted_revision_id TEXT NOT NULL REFERENCES quote_revision(id),
  order_no             TEXT NOT NULL UNIQUE,
  -- Fulfilment lifecycle (customer-tracked; staff-advanced).
  status               TEXT NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment','paid','in_production','ready','dispatched','delivered','closed','cancelled')),
  -- Manual payment flag for MVP: no gateway, staff mark paid out of band.
  payment_status       TEXT NOT NULL DEFAULT 'awaiting_payment'
    CHECK (payment_status IN ('awaiting_payment','paid','refunded')),
  payment_reference    TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_order_project ON "order"(project_id);

CREATE TABLE order_line (
  id                    TEXT PRIMARY KEY,
  order_id              TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  external_ref          TEXT,
  product_snapshot_json TEXT NOT NULL,
  qty                   INTEGER NOT NULL DEFAULT 1,
  line_total            REAL NOT NULL
);
CREATE INDEX idx_orderline_order ON order_line(order_id);

-- ── Files (R2 pointers) ─────────────────────────────────────────────────────
CREATE TABLE file_asset (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES project(id) ON DELETE CASCADE,
  order_id    TEXT REFERENCES "order"(id),
  kind        TEXT NOT NULL DEFAULT 'upload'
    CHECK (kind IN ('upload','plan','schedule','generated_pdf','other')),
  source      TEXT,                          -- 'customer' | 'staff' | 'system'
  r2_key      TEXT NOT NULL,                 -- object key in the R2 bucket
  filename    TEXT NOT NULL,
  checksum    TEXT,
  size        INTEGER,
  virus_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (virus_status IN ('pending','clean','infected','skipped')),
  uploaded_by TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_file_project ON file_asset(project_id);

-- ── Notifications & audit ───────────────────────────────────────────────────
CREATE TABLE notification (
  id                TEXT PRIMARY KEY,
  recipient_subject TEXT NOT NULL,           -- user id / email / 'ops'
  event_type        TEXT NOT NULL,
  channel           TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email','inbox','webhook','sms')),
  template_key      TEXT,
  payload_json      TEXT,
  sent_at           TEXT,
  delivery_state    TEXT NOT NULL DEFAULT 'queued' CHECK (delivery_state IN ('queued','sent','failed','acked')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notif_recipient ON notification(recipient_subject);

CREATE TABLE audit_event (
  id          TEXT PRIMARY KEY,
  actor       TEXT,                          -- user id / 'anon' / 'system'
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL,
  before_json TEXT,
  after_json  TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_entity ON audit_event(entity_type, entity_id);

-- ── Guest tracking (read-only, scoped, short-lived) ─────────────────────────
CREATE TABLE guest_grant (
  id          TEXT PRIMARY KEY,
  record_type TEXT NOT NULL CHECK (record_type IN ('project','order')),
  record_id   TEXT NOT NULL,
  email       TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_guest_token ON guest_grant(token);
