-- Delivery destination widened to a full postal address (ops2-delivery-price).
--
-- The destination was two columns — suburb and postcode — which is not an
-- address. The owner's argument (2026-09-01): the account address cannot serve
-- as one, because an account has a single address and a customer may have
-- several live projects, each shipping somewhere different. The project owns
-- its destination. `CONTEXT.md` and 0053's own header already said the account
-- address is never derived from; this gives the project's own fact the shape
-- the submission form has always shown.
--
-- ADDITIVE ONLY: three ADD COLUMNs on `project`, no table rebuild, no DROP.
-- children affected: none expected. 27 tables reference project(id) ON DELETE
-- CASCADE (order_line and payment among them, via their parents) — an ADD
-- COLUMN never fires them; this comment exists because a rebuild here once
-- cascade-deleted 20 order_line and 4 payment rows in production.
--
-- NO CONSTRAINTS, and nullability is the point: every existing row and every
-- row the customer submission form creates reads NULL for all three until a
-- staffer types them, so a partial address is the ordinary state, not an error.
-- Validation is the endpoint's job — one place, not two.
--
-- Append-only: never edit an applied migration.
ALTER TABLE project ADD COLUMN delivery_line1 TEXT;
ALTER TABLE project ADD COLUMN delivery_line2 TEXT;
ALTER TABLE project ADD COLUMN delivery_state TEXT;
