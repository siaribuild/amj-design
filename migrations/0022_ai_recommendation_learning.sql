-- 0022_ai_recommendation_learning
--
-- Connect the registered-user AI estimator to the one mutable commercial cart.
-- AI proposals are immutable and reproducible; quote_line remains the shopping
-- cart. Human edits are preserved and issued quote outcomes are the only labels
-- eligible for recommendation learning.

ALTER TABLE project ADD COLUMN ai_generation INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ai_runs ADD COLUMN source_generation INTEGER;
ALTER TABLE ai_runs ADD COLUMN source_manifest_hash TEXT;

ALTER TABLE opening_instance ADD COLUMN quote_line_id TEXT REFERENCES quote_line(id) ON DELETE SET NULL;
ALTER TABLE opening_instance ADD COLUMN qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0);
ALTER TABLE opening_instance ADD COLUMN options_json TEXT;
ALTER TABLE opening_instance ADD COLUMN context_json TEXT;
ALTER TABLE opening_instance ADD COLUMN requirement_basis TEXT;
ALTER TABLE opening_instance ADD COLUMN source_generation INTEGER;

ALTER TABLE candidate_result ADD COLUMN selected_variant_id TEXT;
ALTER TABLE candidate_result ADD COLUMN performance_snapshot_json TEXT;
ALTER TABLE candidate_result ADD COLUMN price_snapshot_json TEXT;

CREATE TABLE ai_proposal (
  id                    TEXT PRIMARY KEY,
  project_id            TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  ai_run_id             TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  building_model_id     TEXT REFERENCES building_models(id) ON DELETE SET NULL,
  source_generation     INTEGER NOT NULL,
  source_manifest_hash  TEXT NOT NULL,
  pipeline_version      TEXT NOT NULL,
  catalogue_version     TEXT,
  ranker_version        TEXT,
  pricing_version       TEXT,
  status                TEXT NOT NULL DEFAULT 'building'
    CHECK (status IN ('building','published','superseded','failed')),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  published_at          TEXT
);
CREATE INDEX idx_ai_proposal_project ON ai_proposal(project_id, status);
CREATE UNIQUE INDEX idx_ai_proposal_published_generation
  ON ai_proposal(project_id, source_generation) WHERE status = 'published';

CREATE TABLE ai_proposal_line (
  id                    TEXT PRIMARY KEY,
  proposal_id           TEXT NOT NULL REFERENCES ai_proposal(id) ON DELETE CASCADE,
  project_id            TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  opening_id            TEXT NOT NULL REFERENCES opening_instance(id) ON DELETE CASCADE,
  quote_line_id         TEXT REFERENCES quote_line(id) ON DELETE SET NULL,
  external_ref          TEXT,
  quantity              INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  dimensions_json       TEXT NOT NULL,
  product_id            TEXT,
  product_slug          TEXT,
  catalogue_revision    TEXT,
  performance_variant_id TEXT,
  configuration_json    TEXT NOT NULL,
  ranking_context_json  TEXT NOT NULL,
  performance_json      TEXT,
  price_snapshot_json   TEXT,
  previous_line_total   REAL,
  recommendation_basis  TEXT NOT NULL,
  confidence_band       TEXT NOT NULL
    CHECK (confidence_band IN ('high','medium','low')),
  assumptions_json      TEXT,
  missing_inputs_json   TEXT,
  alternatives_json     TEXT,
  review_required       INTEGER NOT NULL DEFAULT 1 CHECK (review_required IN (0,1)),
  applied_to_cart       INTEGER NOT NULL DEFAULT 0 CHECK (applied_to_cart IN (0,1)),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(proposal_id, opening_id)
);
CREATE INDEX idx_ai_proposal_line_quote ON ai_proposal_line(quote_line_id);

ALTER TABLE quote_line ADD COLUMN ai_proposal_line_id TEXT REFERENCES ai_proposal_line(id) ON DELETE SET NULL;
ALTER TABLE quote_line ADD COLUMN selected_variant_id TEXT;
ALTER TABLE quote_line ADD COLUMN configuration_snapshot_json TEXT;
ALTER TABLE quote_line ADD COLUMN pricing_snapshot_json TEXT;
ALTER TABLE quote_line ADD COLUMN recommendation_basis TEXT;
ALTER TABLE quote_line ADD COLUMN recommendation_confidence TEXT;
ALTER TABLE quote_line ADD COLUMN edit_version INTEGER NOT NULL DEFAULT 0;

-- One immutable label per issued line. This table is the only production source
-- for historical recommendation signals. It intentionally keeps thermal labels
-- separate: commercial reviewer choices never become physical truth.
CREATE TABLE recommendation_outcome (
  id                      TEXT PRIMARY KEY,
  project_id              TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  quote_revision_id       TEXT NOT NULL REFERENCES quote_revision(id) ON DELETE CASCADE,
  quote_line_id           TEXT REFERENCES quote_line(id) ON DELETE SET NULL,
  ai_proposal_line_id     TEXT REFERENCES ai_proposal_line(id) ON DELETE SET NULL,
  external_ref            TEXT,
  context_key             TEXT NOT NULL,
  context_json            TEXT NOT NULL,
  proposed_product_slug   TEXT,
  proposed_variant_id     TEXT,
  proposed_config_json    TEXT,
  proposed_line_total     REAL,
  final_product_slug      TEXT NOT NULL,
  final_variant_id        TEXT,
  final_config_json       TEXT NOT NULL,
  final_line_total        REAL NOT NULL,
  price_delta             REAL,
  decision                TEXT NOT NULL
    CHECK (decision IN ('accepted','adjusted','no_ai_proposal')),
  reason_code             TEXT NOT NULL,
  recommendation_eligible INTEGER NOT NULL DEFAULT 0 CHECK (recommendation_eligible IN (0,1)),
  thermal_eligible        INTEGER NOT NULL DEFAULT 0 CHECK (thermal_eligible IN (0,1)),
  reviewed_thermal_json   TEXT,
  quality_state           TEXT NOT NULL DEFAULT 'approved'
    CHECK (quality_state IN ('pending','approved','rejected')),
  reviewed_by             TEXT REFERENCES user(id) ON DELETE SET NULL,
  reviewed_at             TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(quote_revision_id, quote_line_id)
);
CREATE INDEX idx_recommendation_outcome_learning
  ON recommendation_outcome(recommendation_eligible, quality_state, context_key);
