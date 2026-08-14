-- ═══════════════════════════════════════════════════════════════════════════
-- 0047_quote_revisions_removed — "a quote is a quote" (docs/quote-revisions-
-- removal-plan.md, owner decision 2026-08-14).
--
-- There is one quote per project, updated in place. The one freeze that
-- legally matters happens at ACCEPTANCE, into the order — so the order
-- snapshot has to carry everything an issued quote used to (composite units
-- included, which `revision_line` had no columns for). Everything else that
-- keyed on `quote_revision_id` is re-keyed on the project/line it actually
-- concerns.
--
-- Nothing is live yet ("to be fully cleared prior to going to market" — see
-- the plan doc), so every table here is rebuilt rather than migrated with
-- data preservation. `order`, `recommendation_outcome`, `learning_outbox` and
-- `learning_examples` go through a CREATE-copy-DROP-RENAME rebuild because
-- each drops a column that a separately-created UNIQUE index depends on
-- (dropping the index first, then the column, then recreating the index was
-- the safer order to reason about, even though a plain column carrying only a
-- FOREIGN KEY reference turns out not to need this — see 0049).
--
-- `project.current_revision_id` and `quote_line.revision_id` were left in
-- place here on the theory that a column forever NULL never trips a foreign
-- key check. That held for INSERT/UPDATE, but not for D1's schema-wide
-- validation on things as ordinary as `DELETE FROM quote_line` — with the
-- referenced table gone, every statement against the OWNING table failed
-- outright. Corrected in 0049, which drops both directly (SQLite's ALTER
-- TABLE DROP COLUMN does not, in fact, refuse a plain FK-reference column).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. order_line carries the whole opening ─────────────────────────────────
-- Was: id, order_id, external_ref, product_snapshot_json, qty, line_total —
-- thinner than revision_line, which itself had no room for a composite unit.
-- The order is now the ONE freeze, so it needs everything: room, options,
-- dims (still inside product_snapshot_json/qty as before) plus the segment
-- structure quote_line already carries, so a split opening survives into
-- production instead of collapsing to its pre-split parent frame at issue.
ALTER TABLE order_line ADD COLUMN room_label TEXT;
ALTER TABLE order_line ADD COLUMN dims_json TEXT;
ALTER TABLE order_line ADD COLUMN options_json TEXT;
ALTER TABLE order_line ADD COLUMN parent_line_id TEXT REFERENCES order_line(id) ON DELETE CASCADE;
ALTER TABLE order_line ADD COLUMN segment_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_line ADD COLUMN qty_per_parent INTEGER NOT NULL DEFAULT 1;
ALTER TABLE order_line ADD COLUMN line_kind TEXT NOT NULL DEFAULT 'simple';
ALTER TABLE order_line ADD COLUMN composite_axis TEXT;
ALTER TABLE order_line ADD COLUMN selected_variant_id TEXT;
CREATE INDEX idx_orderline_parent ON order_line(parent_line_id, segment_seq);

-- ── 2. "order" claims the PROJECT, not a revision ───────────────────────────
-- accepted_revision_id's UNIQUE-via-quote_revision was the acceptance race
-- guard (two simultaneous accepts -> exactly one order). Its replacement is a
-- UNIQUE index on project_id, which also states outright that a project has
-- at most one order.
CREATE TABLE order_new (
  id                     TEXT PRIMARY KEY,
  project_id             TEXT NOT NULL REFERENCES project(id),
  order_no               TEXT NOT NULL UNIQUE,
  status                 TEXT NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment','paid','in_production','ready','dispatched','delivered','closed','cancelled')),
  payment_status         TEXT NOT NULL DEFAULT 'awaiting_payment'
    CHECK (payment_status IN ('awaiting_payment','paid','refunded')),
  payment_reference      TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  stage                  TEXT NOT NULL DEFAULT 'deposit_invoiced'
    CHECK (stage IN (
      'deposit_invoiced','deposit_paid','drawings_shared','drawings_signed_off',
      'manufacturing','qa_photos_shared','balance_invoiced','balance_paid',
      'customer_confirmed','dispatched','delivered','after_sales','cancelled'
    )),
  total                  REAL,
  drawings_signed_off_at TEXT,
  qa_confirmed_at        TEXT,
  delivery_total         REAL NOT NULL DEFAULT 0
);
INSERT INTO order_new (id, project_id, order_no, status, payment_status, payment_reference,
    created_at, updated_at, stage, total, drawings_signed_off_at, qa_confirmed_at, delivery_total)
  SELECT id, project_id, order_no, status, payment_status, payment_reference,
    created_at, updated_at, stage, total, drawings_signed_off_at, qa_confirmed_at, delivery_total
  FROM "order";
DROP TABLE "order";
ALTER TABLE order_new RENAME TO "order";
CREATE UNIQUE INDEX idx_order_project ON "order"(project_id);

-- ── 3. Learning loop re-keyed off the project, not the revision ────────────
-- "One finalized quote = one labelled project example" (worker/lib/ai/
-- examples.ts) was already the intended shape; quote_revision_id was standing
-- in for "the issue event" when a project could have more than one. It can't
-- now, so project_id IS the issue-event identity.

-- recommendation_outcome: drop the quote_revision_id FK + its half of the
-- compound UNIQUE. quote_line_id alone is enough to dedupe an outcome
-- (quote_line.id is a stable, never-reused UUID — see the P1-03 upsert-by-
-- stable-id fix) and INSERT OR IGNORE on it means a line issued a second time
-- after a request-changes round trip keeps its FIRST recorded outcome rather
-- than colliding — consistent with re-issue being an accepted edge case the
-- codebase doesn't actively design for (plan doc, "Owner decisions").
CREATE TABLE recommendation_outcome_new (
  id                      TEXT PRIMARY KEY,
  project_id              TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
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
  UNIQUE(quote_line_id)
);
INSERT INTO recommendation_outcome_new SELECT
  id, project_id, quote_line_id, ai_proposal_line_id, external_ref, context_key, context_json,
  proposed_product_slug, proposed_variant_id, proposed_config_json, proposed_line_total,
  final_product_slug, final_variant_id, final_config_json, final_line_total, price_delta,
  decision, reason_code, recommendation_eligible, thermal_eligible, reviewed_thermal_json,
  quality_state, reviewed_by, reviewed_at, created_at
  FROM recommendation_outcome;
DROP TABLE recommendation_outcome;
ALTER TABLE recommendation_outcome_new RENAME TO recommendation_outcome;
CREATE INDEX idx_recommendation_outcome_learning
  ON recommendation_outcome(recommendation_eligible, quality_state, context_key);

-- learning_outbox: one draining entry per issue event, which is now one per
-- project rather than one per revision.
CREATE TABLE learning_outbox_new (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  attempts     INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE (project_id)
);
INSERT INTO learning_outbox_new (id, project_id, payload_json, status, attempts, last_error, created_at, updated_at, completed_at)
  SELECT id, project_id, payload_json, status, attempts, last_error, created_at, updated_at, completed_at FROM learning_outbox;
DROP TABLE learning_outbox;
ALTER TABLE learning_outbox_new RENAME TO learning_outbox;
CREATE INDEX idx_learning_outbox_status ON learning_outbox(status, updated_at);

-- learning_examples: same re-key. UNIQUE(project_id) makes "one example per
-- finalized quote" a constraint rather than just a comment.
CREATE TABLE learning_examples_new (
  id                     TEXT PRIMARY KEY,
  project_id             TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  input_mode             TEXT,
  dataset_version        TEXT,
  pipeline_version       TEXT,
  example_r2_key         TEXT NOT NULL,
  source_checksums_json  TEXT,
  eligible_for_retrieval INTEGER NOT NULL DEFAULT 1,
  eligible_for_training  INTEGER NOT NULL DEFAULT 0,
  quality_state          TEXT NOT NULL DEFAULT 'pending'
    CHECK (quality_state IN ('pending','approved','rejected')),
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id)
);
INSERT INTO learning_examples_new (id, project_id, input_mode, dataset_version, pipeline_version,
    example_r2_key, source_checksums_json, eligible_for_retrieval, eligible_for_training, quality_state, created_at)
  SELECT id, project_id, input_mode, dataset_version, pipeline_version,
    example_r2_key, source_checksums_json, eligible_for_retrieval, eligible_for_training, quality_state, created_at
  FROM learning_examples;
DROP TABLE learning_examples;
ALTER TABLE learning_examples_new RENAME TO learning_examples;
CREATE INDEX idx_learning_ex_project ON learning_examples(project_id);
CREATE INDEX idx_learning_ex_retrieval ON learning_examples(eligible_for_retrieval);

-- ── 4. Drop the snapshot tables themselves ──────────────────────────────────
DROP TABLE revision_line;
DROP TABLE quote_revision;
