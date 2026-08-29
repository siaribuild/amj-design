-- Plan-parse enrichment: per-opening drawing readings + the run report
-- column (02-design-v2.md §8).
--
-- children affected: none existing. This migration CREATES a child:
-- drawing_reading references project (CASCADE) and ai_runs (CASCADE), the
-- same parentage as evidence_items (0016). Any FUTURE rebuild of project or
-- ai_runs now cascades this table too — intended: readings are per-run
-- evidence and die with their run.
--
-- ADDITIVE ONLY. CREATE TABLE + ADD COLUMN + CREATE INDEX. No DROP, no
-- rebuild, no RENAME: none of the rebuild recipe, so no cascade can fire on
-- this migration itself. No PRAGMA defer_foreign_keys needed.
--
-- Four `*_state` columns rather than one shared flag: the spec's AC-2/AC-3
-- make "not stated on the drawings" and "not read by us" a per-field fact,
-- and a schema that can express only one collapses them by construction —
-- the failure this feature exists to avoid repeating.

CREATE TABLE drawing_reading (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  ai_run_id          TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  source_file_id     TEXT REFERENCES file_asset(id) ON DELETE SET NULL,
  external_ref       TEXT NOT NULL,           -- normalizeOpeningRef form
  split_state        TEXT NOT NULL CHECK (split_state       IN ('value','not_stated','not_read')),
  split_json         TEXT,                    -- {units:[{role,ratio,printedWidthMm?}], axis}
  orientation_state  TEXT NOT NULL CHECK (orientation_state IN ('value','not_stated','not_read')),
  orientation        TEXT CHECK (orientation IN ('N','NE','E','SE','S','SW','W','NW')),
  elevation_state    TEXT NOT NULL CHECK (elevation_state   IN ('value','not_stated','not_read')),
  elevation          TEXT,
  room_state         TEXT NOT NULL CHECK (room_state        IN ('value','not_stated','not_read')),
  room_label         TEXT,
  gap_code           TEXT,                    -- unplaced|frame_ambiguous|division_unreadable|scanned|refused_contract|model_declined|render_failed
  gap_note           TEXT,
  crop_key           TEXT,                    -- R2 identifier; §7 lifecycle; dangles after purge by design
  page_no            INTEGER,
  sheet_ref          TEXT,
  region_json        TEXT,                    -- [fx0,fy0,fx1,fy1] page fractions
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_drawing_reading_run ON drawing_reading(project_id, ai_run_id);

-- ops-only method report (§3.6): six steps, counts, wall time/model/container
-- calls. Nullable — every existing row predates it.
ALTER TABLE ai_runs ADD COLUMN drawing_report_json TEXT;
