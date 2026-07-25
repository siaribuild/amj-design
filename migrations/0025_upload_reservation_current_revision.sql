-- Durable upload reservations close parallel quota bypasses and let submission
-- distinguish a complete document set from an upload still being scanned.
CREATE TABLE upload_reservation (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  subject       TEXT NOT NULL,
  ip_subject    TEXT NOT NULL,
  size          INTEGER NOT NULL CHECK (size >= 0),
  status        TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','clean','rejected')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT
);
CREATE INDEX idx_upload_reservation_subject
  ON upload_reservation(subject, created_at);
CREATE INDEX idx_upload_reservation_ip
  ON upload_reservation(ip_subject, created_at);
CREATE INDEX idx_upload_reservation_created
  ON upload_reservation(created_at);

-- Only this revision may be accepted or returned for changes. Historical
-- revisions remain immutable records but can never become live again merely
-- because the project later returns to quote_issued.
ALTER TABLE project
  ADD COLUMN current_revision_id TEXT REFERENCES quote_revision(id);

UPDATE project
   SET current_revision_id = (
     SELECT id FROM quote_revision
      WHERE quote_revision.project_id=project.id
        AND snapshot_status='issued'
      ORDER BY revision_no DESC
      LIMIT 1
   )
 WHERE status_customer='quote_issued';
