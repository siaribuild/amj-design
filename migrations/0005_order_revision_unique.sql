-- 0005 — one order per accepted revision (belt-and-suspenders for the atomic
-- accept in worker/routes/quote.ts). A second INSERT for the same revision fails.
CREATE UNIQUE INDEX idx_order_accepted_revision ON "order"(accepted_revision_id);
