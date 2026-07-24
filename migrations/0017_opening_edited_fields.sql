-- 0017_opening_edited_fields — human-edit provenance guard (multi-file UX #5).
--
-- edited_fields is a JSON array of field names a HUMAN has set on an opening
-- (e.g. ["width_mm","operation_type"]). The AI pipeline's upsert must never
-- overwrite a listed field: a document re-run supplies evidence, but a human is
-- the highest-precedence source (same principle as §9 document precedence).
-- Built BEFORE the change-diff UI so the UI never narrates silent clobbering.
ALTER TABLE opening_instance ADD COLUMN edited_fields TEXT;
