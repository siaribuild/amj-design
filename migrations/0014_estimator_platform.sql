-- ═══════════════════════════════════════════════════════════════════════════
-- 0014_estimator_platform — CPQ Estimator platform skeleton (spec §5.1).
--
-- The canonical estimator data model. Generalises the delivered schedule flow:
-- an `extraction_run` is the parent job (the delivered `schedule_parse_job` is
-- one kind of extraction source), producing `opening_instance` rows (the unit of
-- selection) with field-level `opening_evidence`. A `selection_run` searches the
-- Sanity catalogue per opening, persisting the full `candidate_result` set with
-- hard-rule outcomes and scores; the chosen candidate becomes a `draft_order_line`
-- carrying immutable catalogue/price snapshots. `review_feedback` captures every
-- human correction with a MANDATORY reason-code category so the right layer learns
-- (spec §12, §6a) — capture from the first quote, consumed later.
--
-- All additive. Everything degrades: an opening whose compliance-critical fields
-- are absent gets status 'catalogue_data_incomplete', never a guessed pass.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Extraction: one processing run over a project's documents ────────────────
CREATE TABLE extraction_run (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  -- The delivered schedule parser is extraction source #1; link it for continuity.
  parse_job_id   TEXT REFERENCES schedule_parse_job(id) ON DELETE SET NULL,
  engine         TEXT,                        -- 'cf-deterministic' | 'cf-ai' | 'ext-ai'
  engine_version TEXT,
  model_id       TEXT,                        -- when an AI skill ran
  status         TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','extracting','reconciling','completed','failed','cancelled')),
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  estimated_cost_microusd INTEGER,
  error          TEXT,
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at   TEXT
);
CREATE INDEX idx_extraction_run_project ON extraction_run(project_id);

-- ── Opening instance: the canonical unit of selection (spec §7) ──────────────
CREATE TABLE opening_instance (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  extraction_run_id TEXT REFERENCES extraction_run(id) ON DELETE SET NULL,
  -- Provenance continuity with the delivered flow (nullable).
  parse_line_id  TEXT REFERENCES parse_line(id) ON DELETE SET NULL,
  external_ref   TEXT,                        -- schedule code W04/D03 (line identity)
  group_code     TEXT,                        -- commercial composite group (W4 for W4A/W4B)
  room           TEXT,
  storey         TEXT,
  orientation    TEXT,                        -- N/E/S/W where known
  family         TEXT,                        -- window | door
  operation_type TEXT,                        -- awning | sliding | fixed | …
  width_mm       INTEGER,
  height_mm      INTEGER,
  composite_json TEXT,                        -- {isMember, pattern, memberIndex}
  requirements_json TEXT,                     -- {maxUValue, minShgc, flyscreenRequired, …}
  confidence_json TEXT,                       -- {geometry, operation, location, constraints}
  status         TEXT NOT NULL DEFAULT 'extracted'
    CHECK (status IN ('extracted','ready','needs_clarification','needs_manual_review',
                      'commercial_only_estimate','catalogue_data_incomplete','unavailable')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_opening_project ON opening_instance(project_id);
CREATE INDEX idx_opening_run ON opening_instance(extraction_run_id);

-- ── Opening evidence: field-level provenance (spec §5.1) ─────────────────────
CREATE TABLE opening_evidence (
  id             TEXT PRIMARY KEY,
  opening_id     TEXT NOT NULL REFERENCES opening_instance(id) ON DELETE CASCADE,
  document_id    TEXT REFERENCES file_asset(id) ON DELETE SET NULL,
  page           INTEGER,
  bbox_ref       TEXT,                        -- bounding-box / source-span reference
  field          TEXT,                        -- which field this evidence supports
  extracted_value TEXT,
  confidence     REAL,
  precedence     INTEGER,                     -- source-precedence rank (spec §6.3)
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_evidence_opening ON opening_evidence(opening_id);

-- ── Selection run: reproducible catalogue search for one opening ─────────────
CREATE TABLE selection_run (
  id             TEXT PRIMARY KEY,
  opening_id     TEXT NOT NULL REFERENCES opening_instance(id) ON DELETE CASCADE,
  project_id     TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  catalogue_revision TEXT,                    -- Sanity revision set used
  rule_version   TEXT,
  ranker_version TEXT,
  pricing_version TEXT,
  status         TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('running','completed','failed')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_selection_opening ON selection_run(opening_id);

-- ── Candidate result: the FULL set shown to reviewers (spec §5.1) ────────────
CREATE TABLE candidate_result (
  id             TEXT PRIMARY KEY,
  selection_run_id TEXT NOT NULL REFERENCES selection_run(id) ON DELETE CASCADE,
  sanity_product_id TEXT NOT NULL,            -- published Sanity id
  sanity_config_id  TEXT,
  catalogue_rev  TEXT NOT NULL,               -- revision the candidate was read at
  hard_rule_passed INTEGER NOT NULL DEFAULT 0,  -- 0/1; a failing candidate is never auto-selected
  hard_rule_outcome_json TEXT,                -- per-filter outcome + reasons
  score          REAL,
  score_components_json TEXT,
  reason_codes   TEXT,
  rank           INTEGER,
  selected       INTEGER NOT NULL DEFAULT 0,  -- 0/1 the chosen candidate
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_candidate_run ON candidate_result(selection_run_id);

-- ── Draft order line: mutable pre-issue; carries immutable snapshots ─────────
CREATE TABLE draft_order_line (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  opening_id     TEXT REFERENCES opening_instance(id) ON DELETE SET NULL,
  group_code     TEXT,
  selected_candidate_id TEXT REFERENCES candidate_result(id) ON DELETE SET NULL,
  catalogue_snapshot_json TEXT,               -- product/config/options + revision at selection
  option_snapshot_json TEXT,
  price_snapshot_json TEXT,                   -- computed price + rate-card/version (never Sanity)
  warnings_json  TEXT,
  confidence     REAL,
  status         TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready','needs_clarification','needs_manual_review',
                      'commercial_only_estimate','catalogue_data_incomplete','unavailable')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_draft_line_project ON draft_order_line(project_id);

-- ── Review feedback: the learning-capture substrate (spec §6a, §12) ──────────
-- MANDATORY reason-code category so a correction routes to the RIGHT layer — a
-- category is required (enforced by the CHECK); free-text-only corrections are
-- rejected in code. Only 'preference_correction' may ever train the ranker.
CREATE TABLE review_feedback (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  opening_id     TEXT REFERENCES opening_instance(id) ON DELETE SET NULL,
  selection_run_id TEXT REFERENCES selection_run(id) ON DELETE SET NULL,
  field          TEXT NOT NULL,               -- width | operation | product | option | price | …
  initial_value_json TEXT,                    -- system proposal (+ candidate id + catalogue rev)
  final_value_json TEXT,                      -- human/issued value (+ candidate id + catalogue rev)
  category       TEXT NOT NULL
    CHECK (category IN ('extraction_correction','reconciliation_correction','catalogue_data_correction',
                        'deterministic_rule_correction','preference_correction','commercial_correction')),
  reason_code    TEXT NOT NULL,
  reviewer_id    TEXT REFERENCES user(id) ON DELETE SET NULL,
  note           TEXT,
  catalogue_rev  TEXT,
  rule_version   TEXT,
  ranker_version TEXT,
  pricing_version TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_feedback_project ON review_feedback(project_id);
CREATE INDEX idx_feedback_category ON review_feedback(category);
