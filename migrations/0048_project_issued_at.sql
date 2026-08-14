-- 0048_project_issued_at
--
-- issueQuote (worker/lib/issue.ts, replacing worker/lib/revisions.ts's
-- issueRevision) no longer creates a quote_revision row, so there is nowhere
-- left to read "when was this issued" from. One column does the same job
-- totals_json.issuedAt used to.
ALTER TABLE project ADD COLUMN issued_at TEXT;
