-- 0019_quote_line_edited_fields — human-edit provenance on customer draft lines
-- (multi-file UX spec §1b/§2). JSON array of field groups a human changed on a
-- schedule-origin line ("dims_json","options_json","product_slug","qty").
-- The tag-upsert importer never overwrites a listed field: the human is the
-- highest-precedence source. Mirrors 0017's opening_instance guard.
ALTER TABLE quote_line ADD COLUMN edited_fields TEXT;
