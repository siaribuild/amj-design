-- ═══════════════════════════════════════════════════════════════════════════
-- 0016_ai_building_model — LLM Building-Modelling platform (LLM strategy §18).
--
-- RE-BASELINE (owner decision 2026-07-25): these tables are the CANONICAL model
-- for the AI pipeline and REPLACE the flat one-row-per-tag opening_instance /
-- selection_run / candidate_result / draft_order_line model from 0014. That flat
-- model is now DEPRECATED — it cannot represent a parent architectural frame with
-- multiple thermal child components (§9.3), the evidence graph (§8.5), the
-- observation-class taxonomy (§8.2) or governed learning (§17). It is left in
-- place only so the existing ops estimator keeps running until each pipeline phase
-- cuts its writes over to these tables; new work targets THESE.
--
-- Everything is versioned + reproducible (§21.3, §23): every run records pipeline,
-- model, prompt, rule and catalogue versions, and every stage is idempotent on an
-- input hash that folds in prompt + model + pipeline version (fixes the §6.1 gap
-- where a prompt change would not re-run a stage).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ai_runs: one processing run over a project's documents (§18.1) ───────────
CREATE TABLE ai_runs (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  pipeline_version  TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','partial','completed','failed','cancelled')),
  input_mode        TEXT CHECK (input_mode IN
    ('schedule_only','plans_no_report','plans_plus_energy_report') OR input_mode IS NULL),
  primary_model     TEXT,                        -- e.g. google/gemini-3.6-flash
  escalation_model  TEXT,                        -- configured escalation target (shadow)
  correlation_id    TEXT,                        -- §19 event correlation
  started_at        TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at      TEXT,
  error_code        TEXT,                        -- §22.2 failure class
  token_usage_json  TEXT,
  cost_json         TEXT
);
CREATE INDEX idx_ai_runs_project ON ai_runs(project_id);

-- ── ai_stage_runs: idempotent per-skill stage record (§18.1, §6.1) ───────────
-- input_hash MUST fold in prompt_version + model + pipeline_version so a prompt or
-- model change re-runs the stage (rather than serving a stale idempotent hit).
-- Shadow escalation (owner decision): when an escalation trigger fires we RECORD it
-- here for frequency analysis but do NOT call the escalation model unless
-- AI_ESCALATION_MODE='on'. escalation_taken distinguishes shadow from real.
CREATE TABLE ai_stage_runs (
  id                TEXT PRIMARY KEY,
  ai_run_id         TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  stage             TEXT NOT NULL,               -- skill id (document_classifier, schedule_parser, …)
  model             TEXT,
  prompt_version    TEXT,
  input_hash        TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('running','completed','failed','invalid')),
  result_r2_key     TEXT,                        -- raw payload archived to R2 (§7.1), not inline
  output_hash       TEXT,                        -- sha-256 of output (audit, never content)
  escalation_triggered INTEGER NOT NULL DEFAULT 0,  -- an escalation trigger fired
  escalation_reasons   TEXT,                     -- JSON array of §13.2 trigger codes
  escalation_taken     INTEGER NOT NULL DEFAULT 0,   -- 1 only if Pro was actually called
  input_tokens      INTEGER,
  output_tokens     INTEGER,
  metrics_json      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ai_run_id, stage, input_hash)
);
CREATE INDEX idx_ai_stage_run ON ai_stage_runs(ai_run_id);
-- Frequency analysis for the shadow-escalation decision: how often would Pro fire?
CREATE INDEX idx_ai_stage_escalation ON ai_stage_runs(escalation_triggered);

-- ── building_models: the normalized building evidence model (§8.3) ───────────
CREATE TABLE building_models (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  ai_run_id         TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  schema_version    TEXT NOT NULL,               -- e.g. building-model/1.0
  status            TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','reconciled','reviewed','superseded')),
  model_json        TEXT NOT NULL,               -- BuildingModelV1 (jurisdiction, envelope, rooms, openings, conflicts, evidence_index)
  confidence_json   TEXT NOT NULL,               -- the §15.1 multi-dimensional confidence
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_building_models_project ON building_models(project_id);

-- ── evidence_items: first-class evidence graph records (§8.5) ────────────────
-- entity_path is a JSON pointer into the building model, e.g. /openings/op_W04/width_mm.
CREATE TABLE evidence_items (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  ai_run_id         TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  entity_path       TEXT NOT NULL,
  file_id           TEXT REFERENCES file_asset(id) ON DELETE SET NULL,
  page_no           INTEGER,
  sheet_ref         TEXT,
  region_json       TEXT,                        -- normalized 0..1 bounding box
  extracted_text    TEXT,
  origin            TEXT NOT NULL                -- §8.2 observation class
    CHECK (origin IN ('explicit','cross_derived','geometry_derived','regulatory_default',
                      'envelope_default','precedent_inferred','model_inferred','human_override','unknown')),
  confidence        REAL,
  review_state      TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (review_state IN ('unreviewed','confirmed','edited','rejected'))
);
CREATE INDEX idx_evidence_project ON evidence_items(project_id);
CREATE INDEX idx_evidence_entity ON evidence_items(project_id, entity_path);

-- ── opening_requirements: per-opening performance requirement (§18.1, §10) ───
-- parent_opening_id models the parent/child combined-frame decomposition (§9.3):
-- a parent architectural frame (W04) has child thermal components (W04A/B/C).
-- requirement_basis records WHICH pathway set it (§10.1) so the UI can label the
-- claim honestly (explicit report vs plan-derived vs default-envelope).
CREATE TABLE opening_requirements (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  building_model_id TEXT NOT NULL REFERENCES building_models(id) ON DELETE CASCADE,
  external_ref      TEXT NOT NULL,               -- schedule tag, preserved exactly
  parent_opening_id TEXT REFERENCES opening_requirements(id) ON DELETE CASCADE,
  requirement_basis TEXT NOT NULL
    CHECK (requirement_basis IN ('explicit_energy_report','plan_derived','default_envelope','human_override')),
  max_u_value       REAL,
  shgc_target       REAL,
  shgc_min          REAL,
  shgc_max          REAL,
  confidence_json   TEXT NOT NULL,
  requirement_json  TEXT NOT NULL,               -- full normalized requirement (§4 fields)
  review_state      TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (review_state IN ('unreviewed','confirmed','edited','rejected')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_opening_req_project ON opening_requirements(project_id);
CREATE INDEX idx_opening_req_parent ON opening_requirements(parent_opening_id);

-- ── ai_review_deltas: structured AI→human corrections (§16.3, §17) ───────────
-- The governed replacement for review_feedback (0014): every material override
-- carries a reason_code from the §17.3 taxonomy so technical truth can later be
-- separated from commercial preference before training (§17.5).
CREATE TABLE ai_review_deltas (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  quote_revision_id TEXT,
  entity_type       TEXT NOT NULL,               -- opening | requirement | building_model | line
  entity_id         TEXT NOT NULL,
  field_path        TEXT NOT NULL,
  ai_value_json     TEXT,
  human_value_json  TEXT,
  reason_code       TEXT NOT NULL,               -- §17.3 taxonomy (validated in code)
  comment           TEXT,
  reviewer_id       TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_review_deltas_project ON ai_review_deltas(project_id);
CREATE INDEX idx_review_deltas_reason ON ai_review_deltas(reason_code);

-- ── learning_examples: governed learning record (§17.2, §17.5) ───────────────
-- eligible_for_retrieval is immediate (§17.1/§17.4); eligible_for_training is
-- GATED and defaults OFF — model weights / surrogate are never trained
-- automatically per finalized quote (non-goal §2.3).
CREATE TABLE learning_examples (
  id                    TEXT PRIMARY KEY,
  project_id            TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  quote_revision_id     TEXT NOT NULL,
  input_mode            TEXT,
  dataset_version       TEXT,
  pipeline_version      TEXT,
  example_r2_key        TEXT NOT NULL,           -- full example (ai vs human vs deltas) archived to R2
  source_checksums_json TEXT,                    -- input document checksums (reproducibility)
  eligible_for_retrieval INTEGER NOT NULL DEFAULT 1,
  eligible_for_training  INTEGER NOT NULL DEFAULT 0,
  quality_state         TEXT NOT NULL DEFAULT 'pending'
    CHECK (quality_state IN ('pending','approved','rejected')),
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_learning_ex_project ON learning_examples(project_id);
CREATE INDEX idx_learning_ex_retrieval ON learning_examples(eligible_for_retrieval);
