-- 0018_file_doc_type — persisted document classification (multi-file UX slice 1).
--
-- doc_type: what the ingestion classifier detected (schedule | energy_report |
-- plans | supporting), shown on the customer file rail so the system "shows its
-- work". doc_type_source: 'auto' (classifier) or 'user' (explicit correction via
-- the "Wrong type?" affordance) — a user correction is authoritative and the
-- classifier never overwrites it.
ALTER TABLE file_asset ADD COLUMN doc_type TEXT;
ALTER TABLE file_asset ADD COLUMN doc_type_source TEXT NOT NULL DEFAULT 'auto';
