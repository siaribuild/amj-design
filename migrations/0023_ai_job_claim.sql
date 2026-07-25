-- Durable, atomic ownership for registered-user AI extraction work.
-- KV remains a short-lived UX debounce signal; correctness and retries live in D1.
CREATE TABLE ai_job_claim (
  project_id        TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  source_generation INTEGER NOT NULL,
  debounce_token    TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','processing','completed','failed','superseded')),
  attempts          INTEGER NOT NULL DEFAULT 0,
  lease_expires_at  TEXT,
  processing_token  TEXT,
  last_error        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, source_generation)
);

CREATE INDEX idx_ai_job_claim_status
  ON ai_job_claim(status, updated_at);

-- Atomic per-account spend reservation. A reservation is consumed before a
-- provider call and is intentionally not refunded on provider/model failure.
CREATE TABLE ai_daily_usage (
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  usage_day   TEXT NOT NULL,
  runs        INTEGER NOT NULL DEFAULT 0 CHECK (runs >= 0),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, usage_day)
);

-- Final quote issuance and learning capture cannot be one atomic transaction
-- because the learning example also writes to R2. Record the immutable work in
-- the same D1 batch as the revision so finalized human decisions are retryable.
CREATE TABLE learning_outbox (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  quote_revision_id TEXT NOT NULL REFERENCES quote_revision(id) ON DELETE CASCADE,
  payload_json      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  attempts          INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at      TEXT,
  UNIQUE (quote_revision_id)
);

CREATE INDEX idx_learning_outbox_status
  ON learning_outbox(status, updated_at);
