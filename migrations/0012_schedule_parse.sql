-- ═══════════════════════════════════════════════════════════════════════════
-- 0012_schedule_parse — "Upload a schedule → quote" parsing.
--
-- A schedule_parse_job processes ONE uploaded file_asset into estimator draft
-- lines. parse_line retains the extractor + matcher output (raw + mapped +
-- confidence + issues) for the downstream technical review, even after the
-- customer edits the committed quote_line. Source bytes stay in R2 via the
-- existing file_asset row (linked here by file_asset_id); no file schema change.
--
-- quote_line gains two nullable columns (no backfill): `origin` (manual|schedule)
-- and `review_json` (per-field {field: reason} that drives the amber highlight).
-- Append-only job history; quota is derived from job counts (see worker/lib/parse.ts).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE schedule_parse_job (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  file_asset_id  TEXT NOT NULL REFERENCES file_asset(id) ON DELETE CASCADE,
  -- Quota subject: user id (registered) or claim_token (anonymous).
  subject        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','extracting','matching','needs_review','completed','failed','cancelled')),
  engine         TEXT,                       -- 'cf-deterministic' | 'cf-ai' | 'ext-ai'
  page_count     INTEGER,
  item_count     INTEGER,
  confidence     REAL,                        -- overall 0..1
  -- Cost accounting (AI tier only; deterministic on-stack parsing leaves these NULL).
  -- Integer µUSD is comparable across providers; raw neurons/tokens are not.
  input_tokens            INTEGER,
  output_tokens           INTEGER,
  estimated_cost_microusd INTEGER,
  engine_version          TEXT,                -- extractor + prompt/schema/catalogue version
  content_hash   TEXT,                        -- sha-256 of bytes → cache + dedupe
  error          TEXT,                        -- machine code when status='failed'
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at   TEXT
);
CREATE INDEX idx_parsejob_project ON schedule_parse_job(project_id);
CREATE INDEX idx_parsejob_subject ON schedule_parse_job(subject, created_at);
CREATE INDEX idx_parsejob_hash    ON schedule_parse_job(content_hash);

CREATE TABLE parse_line (
  id                  TEXT PRIMARY KEY,
  job_id              TEXT NOT NULL REFERENCES schedule_parse_job(id) ON DELETE CASCADE,
  page                INTEGER,
  source_index        INTEGER,               -- order within the schedule
  raw_json            TEXT NOT NULL,          -- RawScheduleRow as extracted
  mapped_product_slug TEXT,
  mapped_dims_json    TEXT,                   -- {width,height}
  mapped_options_json TEXT,
  mapped_qty          INTEGER,
  external_ref        TEXT,                   -- item code (W01/D03)
  confidence_json     TEXT,
  issues_json         TEXT,                   -- {field: reason}
  quote_line_id       TEXT REFERENCES quote_line(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_parseline_job ON parse_line(job_id);

-- Additive columns on the existing draft-line table (nullable → no backfill).
ALTER TABLE quote_line ADD COLUMN origin      TEXT;   -- 'manual' | 'schedule'
ALTER TABLE quote_line ADD COLUMN review_json TEXT;   -- {field: reason} for UI highlight
