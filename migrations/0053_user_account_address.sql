-- 0053_user_account_address
--
-- The submission gate (user registration Phase 1) requires an account address
-- alongside the name and phone the `user` table already carries. The account
-- address is the account holder's own address — quote and paperwork data. The
-- project's delivery destination is a DIFFERENT fact in a different place
-- (project.delivery_suburb / delivery_postcode) and is never derived from this.
--
-- Additive only: five nullable TEXT columns, no table rebuild, no DROP, no
-- default change. `discount_percent = 0` for new accounts is a CODE change at
-- both INSERT sites (worker/lib/auth.ts, worker/lib/staff.ts) precisely because
-- altering a column default in SQLite means rebuilding `user`, and a rebuild in
-- this database has already fired ON DELETE CASCADE and destroyed production
-- rows.
--
-- children affected: none expected (additive ADD COLUMN only; membership.user_id
-- is the sole ON DELETE CASCADE child of user — migrations/0001:42 — and nothing
-- here is dropped or rebuilt, so no cascade can fire).
ALTER TABLE user ADD COLUMN address_line1 TEXT;
ALTER TABLE user ADD COLUMN address_line2 TEXT;
ALTER TABLE user ADD COLUMN address_suburb TEXT;
ALTER TABLE user ADD COLUMN address_state TEXT;
ALTER TABLE user ADD COLUMN address_postcode TEXT;
