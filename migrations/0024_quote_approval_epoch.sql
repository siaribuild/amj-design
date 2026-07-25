-- Bind approvals and issuance to the exact mutable quote state they reviewed.
ALTER TABLE project ADD COLUMN quote_edit_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project ADD COLUMN quote_mutation_token TEXT;
ALTER TABLE approval_instance ADD COLUMN quote_edit_version INTEGER NOT NULL DEFAULT 0;

-- At most one live approval workflow may own a project.
CREATE UNIQUE INDEX idx_approval_instance_one_pending
  ON approval_instance(project_id)
  WHERE state = 'pending';
