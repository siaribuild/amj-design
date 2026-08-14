-- 0049_drop_dangling_revision_fks
--
-- 0047 dropped quote_revision/revision_line but deliberately left two FK
-- columns pointing at quote_revision in place, reasoning that a column
-- forever NULL never trips a foreign key check. That reasoning was wrong in
-- practice: D1 validates a table's OWN foreign key definitions against the
-- schema on things as ordinary as `DELETE FROM quote_line` — with the target
-- table gone, that failed outright ("no such table: main.quote_revision"),
-- not just on the NULL-column path. Both columns turned out to be safe to
-- drop directly (SQLite's ALTER TABLE DROP COLUMN does not, in fact, refuse a
-- plain FK-reference column — only a PRIMARY KEY or UNIQUE one), so drop them
-- rather than rebuild either table.
ALTER TABLE quote_line DROP COLUMN revision_id;
ALTER TABLE project DROP COLUMN current_revision_id;
