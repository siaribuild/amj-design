-- ═══════════════════════════════════════════════════════════════════════════
-- Default test fixtures (loaded by `npm run db:reset`).
--
-- Sign in as demo@amjtradedirect.com.au (passwordless — request an OTP; the dev
-- code is printed by the auth challenge). You then get:
--   • MyProject  → "Coburg new build" draft with 2 lines (quote-building tests)
--   • My orders  → order AMJ-58001 mid-journey (deposit paid, in manufacturing)
--
-- staff@amjtradedirect.com.au is an internal user (for when ops auth exists;
-- staff seams are open in non-prod today regardless).
-- ═══════════════════════════════════════════════════════════════════════════

-- Users
INSERT INTO user (id, email, name, phone, type, last_verified_at) VALUES
  ('u_demo',  'demo@amjtradedirect.com.au',  'Demo Builder', '(03) 9000 1234', 'customer', datetime('now')),
  ('u_staff', 'staff@amjtradedirect.com.au', 'AMJ Staff',    NULL,             'internal', datetime('now'));

-- Organisation + membership
INSERT INTO organisation (id, name, trading_name, abn) VALUES
  ('org_demo', 'Demo Build Co', 'Demo Build Co Pty Ltd', '12 345 678 901');
INSERT INTO membership (id, user_id, organisation_id, role) VALUES
  ('m_demo', 'u_demo', 'org_demo', 'owner');

-- ── Draft project (the current MyProject) ───────────────────────────────────
INSERT INTO project (id, organisation_id, owner_user_id, title, status_customer, status_internal, created_at, updated_at) VALUES
  ('p_draft', 'org_demo', 'u_demo', 'Coburg new build', 'draft', 'draft', datetime('now','-1 hours'), datetime('now'));

INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, options_json, dims_json, measured_by, qty, line_total, status, position) VALUES
  ('ql_1', 'p_draft', 'W01', 'Living room', 'amj80-series-sliding-window',
    '{"colour":"Dover White","hardware":"AMJ Standard D Shape Handle","flyscreen":"None","installation":"Sub Sill & Head"}',
    '{"width":"1200","height":"900"}', 'opening', 2, 1020, 'ready', 0),
  ('ql_2', 'p_draft', 'W02', 'Kitchen', 'amj80-series-awning-window',
    '{"colour":"Monument","hardware":"AMJ Standard Chain Winder","flyscreen":"None","installation":"Sub Sill & Head"}',
    '{"width":"900","height":"1200"}', 'opening', 1, 720, 'ready', 1);

-- ── Converted project + in-progress order (for tracker tests) ────────────────
INSERT INTO project (id, organisation_id, owner_user_id, title, status_customer, status_internal, created_at, updated_at) VALUES
  ('p_order', 'org_demo', 'u_demo', 'Northcote extension', 'closed', 'converted_to_order', datetime('now','-10 days'), datetime('now','-3 days'));

INSERT INTO quote_revision (id, project_id, revision_no, snapshot_status, totals_json, issued_at, accepted_at) VALUES
  ('rev_1', 'p_order', 1, 'accepted', '{"total":5400}', datetime('now','-8 days'), datetime('now','-7 days'));

INSERT INTO revision_line (id, revision_id, external_ref, room_label, product_snapshot_json, dims_json, options_json, qty, line_total) VALUES
  ('rl_1', 'rev_1', 'D01', 'Living', '{"productSlug":"amj80-series-sliding-door","productName":"AMJ80 Series Sliding Door","options":{},"dims":{"width":"2400","height":"2100"}}', '{"width":"2400","height":"2100"}', '{}', 1, 3400),
  ('rl_2', 'rev_1', 'W01', 'Study',  '{"productSlug":"amj80-series-awning-window","productName":"AMJ80 Series Awning Window","options":{},"dims":{"width":"1200","height":"900"}}', '{"width":"1200","height":"900"}', '{}', 2, 2000);

INSERT INTO "order" (id, project_id, accepted_revision_id, order_no, total, stage, drawings_signed_off_at, created_at) VALUES
  ('o_1', 'p_order', 'rev_1', 'AMJ-58001', 5400, 'manufacturing', datetime('now','-5 days'), datetime('now','-7 days'));

INSERT INTO order_line (id, order_id, external_ref, product_snapshot_json, qty, line_total) VALUES
  ('ol_1', 'o_1', 'D01', '{"productSlug":"amj80-series-sliding-door","productName":"AMJ80 Series Sliding Door"}', 1, 3400),
  ('ol_2', 'o_1', 'W01', '{"productSlug":"amj80-series-awning-window","productName":"AMJ80 Series Awning Window"}', 2, 2000);

INSERT INTO payment (id, order_id, kind, amount, percent, status, reference, invoiced_at, paid_at) VALUES
  ('pay_dep', 'o_1', 'deposit', 2700, 50, 'paid', 'EFT-7001', datetime('now','-7 days'), datetime('now','-6 days')),
  ('pay_bal', 'o_1', 'balance', 2700, 50, 'due',  NULL,       NULL,                     NULL);

-- ── A second builder with a SUBMITTED project (awaiting triage in the ops queue) ──
INSERT INTO user (id, email, name, phone, type, last_verified_at) VALUES
  ('u_sarah', 'sarah@northsidebuild.com.au', 'Sarah Nguyen', '(03) 9111 2222', 'customer', datetime('now'));
INSERT INTO organisation (id, name, trading_name, abn) VALUES
  ('org_north', 'Northside Build', 'Northside Build Group Pty Ltd', '98 765 432 100');
INSERT INTO membership (id, user_id, organisation_id, role) VALUES
  ('m_sarah', 'u_sarah', 'org_north', 'owner');

INSERT INTO project (id, organisation_id, owner_user_id, title, status_customer, status_internal, created_at, updated_at) VALUES
  ('p_submitted', 'org_north', 'u_sarah', 'Fitzroy townhouses', 'submitted', 'submitted', datetime('now','-2 days'), datetime('now','-2 days'));

INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, options_json, dims_json, measured_by, qty, line_total, status, position) VALUES
  ('ql_s1', 'p_submitted', 'W01', 'Bed 1', 'amj80-series-sliding-window',
    '{"colour":"Monument","hardware":"AMJ Standard D Shape Handle","flyscreen":"None","installation":"Sub Sill & Head"}',
    '{"width":"1500","height":"1200"}', 'opening', 6, 1350, 'ready', 0),
  ('ql_s2', 'p_submitted', 'D01', 'Living', 'amj80-series-sliding-door',
    '{"colour":"Monument","hardware":"AMJ Standard D Shape Handle","flyscreen":"None","installation":"Sub Sill & Head"}',
    '{"width":"2400","height":"2100"}', 'opening', 3, 3200, 'ready', 1);
