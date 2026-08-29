-- Additive enrichment evidence metadata. Existing 0060 rows remain valid
-- and read as unknown confidence/no flags.
-- children affected: none; drawing_reading is altered in place with ADD COLUMN only.
ALTER TABLE drawing_reading ADD COLUMN confidence TEXT CHECK (confidence IN ('high','low'));
ALTER TABLE drawing_reading ADD COLUMN flags_json TEXT;
