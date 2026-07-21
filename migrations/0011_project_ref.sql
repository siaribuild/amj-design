-- 0011_project_ref — customer-facing project reference (OF-Q-NNNNN).
--
-- The account area anchors every record on a short ref (spec: "never make an
-- arbitrary sequence number the user-facing anchor" — but quotes need a durable,
-- phone-quotable identity BEFORE an order number exists). Orders keep order_no;
-- a project carries public_ref from creation through quote review, and the order
-- header preserves the link ("accepted from quote R2").
ALTER TABLE project ADD COLUMN public_ref TEXT;
UPDATE project SET public_ref = 'OF-Q-' || (10000 + rowid);
CREATE UNIQUE INDEX idx_project_public_ref ON project(public_ref);
