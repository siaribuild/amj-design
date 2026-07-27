-- ═══════════════════════════════════════════════════════════════════════════
-- 0028_composite_lines — one opening built as two or more joined units.
--
-- An opening can exceed every manufactured unit (a 3600mm span where the widest
-- product is 2400mm). Today that produces a best-fit price and a `fit` warning.
-- A composite is the RESOLUTION of that warning: the opening is built as N units
-- joined on site.
--
-- SHAPE: parent row + child rows in the same table, via a self-FK.
--
-- The parent IS the customer's line. Its id never changes, so every existing
-- reference survives untouched — opening_instance.quote_line_id,
-- ai_proposal_line.quote_line_id, recommendation_outcome.quote_line_id, the
-- client's serverId round-trip, collision_choice, edited_fields. That is the
-- decisive argument for this shape over sibling rows sharing a group key: the
-- architect's tag (W12) stays unique and the importer's byTag map still works.
--
-- NO BACKFILL. Every existing row becomes a valid `simple` parent purely by
-- column default. That is a design goal, not luck.
--
-- WHO MAY CREATE ONE: the AI proposal path and ops. NOT the customer — they
-- cannot choose a composite, only see one and question it.
--
-- Append-only: never edit an applied migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- Self-FK to the parent opening. NULL on a parent (and on every plain line).
ALTER TABLE quote_line ADD COLUMN parent_line_id TEXT REFERENCES quote_line(id) ON DELETE CASCADE;

-- Order of the segments within their parent. 0 on a parent.
ALTER TABLE quote_line ADD COLUMN segment_seq INTEGER NOT NULL DEFAULT 0;

-- How many of THIS frame go into ONE opening. A symmetric 2×1800 split is one
-- segment row with qty_per_parent = 2, not two identical rows — fewer rows, and
-- it states "these are the same frame", which is what the learning corpus wants.
ALTER TABLE quote_line ADD COLUMN qty_per_parent INTEGER NOT NULL DEFAULT 1;

-- 'simple' | 'composite_parent' | 'segment'. SQLite cannot add a CHECK via
-- ALTER TABLE, so this is validated in worker/lib/composite.ts and covered by a
-- test rather than by the schema.
ALTER TABLE quote_line ADD COLUMN line_kind TEXT NOT NULL DEFAULT 'simple';

-- 'vertical' (side by side) | 'horizontal' (stacked). Parent only.
ALTER TABLE quote_line ADD COLUMN composite_axis TEXT;

-- Signed Σ(segment extents) − parent extent along the axis, in mm. Recorded, not
-- vetoed: coupled frames carry real mullion and jamb allowances, and the reviewer
-- is the engineering authority. A delta beyond tolerance raises a warning.
ALTER TABLE quote_line ADD COLUMN coverage_delta_mm INTEGER;

-- Who proposed the split, so a re-parse cannot silently undo a human decision.
ALTER TABLE quote_line ADD COLUMN composite_origin TEXT;   -- 'ai' | 'ops'

CREATE INDEX idx_quote_line_parent ON quote_line(parent_line_id, segment_seq);

-- Geometry rules live in D1, never as constants in code: how much mullion/jamb
-- allowance is acceptable before a human is asked, and how many units a split may
-- have, are business decisions that change without a deploy.
CREATE TABLE composite_policy (
  id                TEXT PRIMARY KEY,       -- 'default'
  tolerance_mm      INTEGER NOT NULL DEFAULT 25,   -- |Σ segments − opening| before it warns
  default_joiner_mm INTEGER NOT NULL DEFAULT 0,    -- 0 until the manufacturer supplies real
                                                   -- coupling widths; explicit, never guessed
  max_segments      INTEGER NOT NULL DEFAULT 4,
  version           TEXT NOT NULL DEFAULT 'v1'
);
INSERT INTO composite_policy (id) VALUES ('default');
