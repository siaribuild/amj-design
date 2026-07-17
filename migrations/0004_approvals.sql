-- ═══════════════════════════════════════════════════════════════════════════
-- 0004_approvals — rule-driven approvals + persona roles (O4)
--
-- When an estimator submits a quote for approval, rules are evaluated; matching
-- rules create approval steps that the right role must clear before the quote can
-- be issued. No matching rule = auto-approved (straight to "ready to issue").
-- ═══════════════════════════════════════════════════════════════════════════

-- Persona role for internal users (null for customers). 'admin' can act on any step.
ALTER TABLE user ADD COLUMN role TEXT;  -- estimator | technical_reviewer | manager | admin

CREATE TABLE approval_rule (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  trigger_family TEXT NOT NULL CHECK (trigger_family IN ('commercial','technical','policy','account_risk','document_change')),
  condition_json TEXT NOT NULL,          -- {"type":"total_gt","value":4000} | {"type":"status_technical"}
  approver_role  TEXT NOT NULL,          -- role required to approve
  active         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE approval_instance (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  state       TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','rejected','recalled')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX idx_approval_instance_project ON approval_instance(project_id);

CREATE TABLE approval_step (
  id             TEXT PRIMARY KEY,
  instance_id    TEXT NOT NULL REFERENCES approval_instance(id) ON DELETE CASCADE,
  rule_id        TEXT REFERENCES approval_rule(id),
  trigger_family TEXT NOT NULL,
  reason         TEXT,                   -- why it triggered, e.g. "Total $4,550 over $4,000"
  approver_role  TEXT NOT NULL,
  state          TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','rejected','delegated','skipped')),
  acted_by       TEXT REFERENCES user(id),
  acted_at       TEXT,
  comment        TEXT
);
CREATE INDEX idx_approval_step_instance ON approval_step(instance_id);
CREATE INDEX idx_approval_step_state ON approval_step(state);
