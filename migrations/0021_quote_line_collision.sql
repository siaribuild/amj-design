-- 0021_quote_line_collision — manual-vs-schedule tag collision choice (multi-file
-- UX spec §1b). When a parsed schedule tag equals a MANUAL line's code, the
-- customer decides once: 'linked' (the manual line converts to schedule-origin
-- with all fields marked edited) or 'separate' (the parsed row is permanently
-- skipped for that tag). NULL = undecided, surfaced as a collision card; a
-- decision is never re-asked on later re-parses.
ALTER TABLE quote_line ADD COLUMN collision_choice TEXT
  CHECK (collision_choice IN ('linked','separate') OR collision_choice IS NULL);
