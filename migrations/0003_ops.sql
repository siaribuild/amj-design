-- ═══════════════════════════════════════════════════════════════════════════
-- 0003_ops — internal assignment + comments (O2 of the ops console)
--
-- status_internal already has no CHECK constraint (0001), so the richer internal
-- workflow states (triage_pending, estimator_assigned, …) need no schema change.
-- ═══════════════════════════════════════════════════════════════════════════

-- Which staff member owns the quote in the queue.
ALTER TABLE project ADD COLUMN internal_owner_id TEXT REFERENCES user(id);
CREATE INDEX idx_project_internal_owner ON project(internal_owner_id);

-- Technical-review notes + clarification requests + system activity. audit_event
-- captures state changes; this captures human messages on a project/line.
CREATE TABLE comment (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  line_id    TEXT REFERENCES quote_line(id) ON DELETE SET NULL,
  author_id  TEXT REFERENCES user(id),
  kind       TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note','clarification','system')),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_comment_project ON comment(project_id);
