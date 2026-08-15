-- AC-49c — proof that migration 0051 touches no stored price.
--
-- Referral program, docs/specs/referral-program.md AC-49c and
-- docs/design/referral-program.md §13.2. The criterion is that applying
-- 0051_referral_program.sql to a copy of production leaves every existing
-- quote_line.line_total, order_line.line_total, "order".total,
-- "order".delivery_total and payment.amount bitwise unchanged — and that this is
-- verified by comparison, not by reading the migration and concluding it looks
-- additive. This script is that comparison.
--
-- PROCEDURE (no inspection of SQL required):
--
--   wrangler d1 execute apertly-db --file scripts/db/price-checksums.sql --json > before.json
--   wrangler d1 migrations apply apertly-db
--   wrangler d1 execute apertly-db --file scripts/db/price-checksums.sql --json > after.json
--   diff before.json after.json      # any output at all is a failed AC-49c
--
-- Add --local --persist-to <dir> for a local D1, or --remote against a restored
-- copy of production. Never run the middle step against production itself.
--
-- WHY THESE AGGREGATES. Money is stored as REAL, so it is compared in integer
-- cents: rounding to cents first makes the fingerprint stable against float
-- formatting while still moving if any stored figure moves. Row count and
-- non-null count catch insertions, deletions and NULLing; the sum catches a
-- changed value; the sum of squares catches the pathological case of two values
-- changing in opposite directions by the same amount; min/max id catch a
-- rewritten key space. scripts/tests/pricing-golden.test.mjs asserts this file
-- stays read-only.
SELECT 'quote_line.line_total'   AS metric,
       COUNT(*)                  AS row_count,
       COUNT(line_total)         AS priced_count,
       COALESCE(SUM(CAST(ROUND(line_total * 100) AS INTEGER)), 0)                                       AS sum_cents,
       COALESCE(SUM(CAST(ROUND(line_total * 100) AS INTEGER) * CAST(ROUND(line_total * 100) AS INTEGER)), 0) AS sum_sq_cents,
       MIN(id)                   AS min_id,
       MAX(id)                   AS max_id
  FROM quote_line

UNION ALL
SELECT 'order_line.line_total',
       COUNT(*),
       COUNT(line_total),
       COALESCE(SUM(CAST(ROUND(line_total * 100) AS INTEGER)), 0),
       COALESCE(SUM(CAST(ROUND(line_total * 100) AS INTEGER) * CAST(ROUND(line_total * 100) AS INTEGER)), 0),
       MIN(id),
       MAX(id)
  FROM order_line

UNION ALL
SELECT 'order.total',
       COUNT(*),
       COUNT(total),
       COALESCE(SUM(CAST(ROUND(total * 100) AS INTEGER)), 0),
       COALESCE(SUM(CAST(ROUND(total * 100) AS INTEGER) * CAST(ROUND(total * 100) AS INTEGER)), 0),
       MIN(id),
       MAX(id)
  FROM "order"

UNION ALL
SELECT 'order.delivery_total',
       COUNT(*),
       COUNT(delivery_total),
       COALESCE(SUM(CAST(ROUND(delivery_total * 100) AS INTEGER)), 0),
       COALESCE(SUM(CAST(ROUND(delivery_total * 100) AS INTEGER) * CAST(ROUND(delivery_total * 100) AS INTEGER)), 0),
       MIN(id),
       MAX(id)
  FROM "order"

UNION ALL
SELECT 'payment.amount',
       COUNT(*),
       COUNT(amount),
       COALESCE(SUM(CAST(ROUND(amount * 100) AS INTEGER)), 0),
       COALESCE(SUM(CAST(ROUND(amount * 100) AS INTEGER) * CAST(ROUND(amount * 100) AS INTEGER)), 0),
       MIN(id),
       MAX(id)
  FROM payment

ORDER BY metric;
