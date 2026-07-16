-- ═══════════════════════════════════════════════════════════════════════════
-- 0002_order_journey — the real 12-stage fulfilment journey + two-fold payment
--
-- Reflects AMJ's actual quote-to-delivery process (steps 4–13 live on the order):
--   4  deposit_invoiced     invoice issued for 50% deposit on quote acceptance
--   5  deposit_paid         deposit received (manual/out-of-band for MVP)
--   6  drawings_shared      shop drawings issued to the customer
--   7  drawings_signed_off  customer reviews + confirms drawings   (CUSTOMER gate)
--   8  manufacturing        in production
--   9  qa_photos_shared     QA done; pre-dispatch photos shared with customer
--   10 balance_invoiced     final 50% balance invoice issued
--   10 balance_paid         balance received
--   11 customer_confirmed   customer confirms OK to dispatch        (CUSTOMER gate)
--   12 dispatched / delivered
--   13 after_sales          delivered + closed into after-sales support
--
-- `stage` supersedes the coarse order.status/payment_status columns from 0001
-- (left in place, unused). Payment amounts live in the new `payment` table.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "order" ADD COLUMN stage TEXT NOT NULL DEFAULT 'deposit_invoiced'
  CHECK (stage IN (
    'deposit_invoiced','deposit_paid','drawings_shared','drawings_signed_off',
    'manufacturing','qa_photos_shared','balance_invoiced','balance_paid',
    'customer_confirmed','dispatched','delivered','after_sales','cancelled'
  ));
ALTER TABLE "order" ADD COLUMN total REAL;
ALTER TABLE "order" ADD COLUMN drawings_signed_off_at TEXT;
ALTER TABLE "order" ADD COLUMN qa_confirmed_at TEXT;

-- Two invoices per order: 50% deposit (invoiced at acceptance) and 50% balance
-- (invoiced after QA, before dispatch). Manual payment: staff set status='paid'.
CREATE TABLE payment (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('deposit','balance')),
  amount      REAL NOT NULL,
  percent     INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('due','paid','waived')),
  reference   TEXT,                         -- bank transfer / invoice reference
  invoiced_at TEXT,                         -- NULL until the invoice is issued
  paid_at     TEXT,
  UNIQUE (order_id, kind)
);
CREATE INDEX idx_payment_order ON payment(order_id);
