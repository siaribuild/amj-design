-- Face-mapped engine evidence: which number along its wall an opening is, and
-- which frame on the elevation it was read from, so the release gate can score
-- identity and frame separately from composition (handover Task 12).
-- Existing rows read as null: the other engines never knew either.
-- children affected: none; drawing_reading is altered in place with ADD COLUMN only.
ALTER TABLE drawing_reading ADD COLUMN wall_order INTEGER;
ALTER TABLE drawing_reading ADD COLUMN frame_box_json TEXT;
