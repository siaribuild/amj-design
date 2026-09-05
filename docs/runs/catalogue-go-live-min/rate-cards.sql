-- Go-live minimum price list — AMJ_min.xlsx (owner, 2026-09-06), column J.
--
-- J is the public sale price per m² of the whole unit (frame + glazing), GST
-- included. The rate card's figures are GST-inclusive too (src/data/gst.ts
-- divides by 1.1 for ex-GST display), so J becomes the whole area rate and the
-- perimeter and minimum-charge components go to zero. glass_excluded_from_area_rate
-- stays 0: glass is inside this number, which is why no per-m² glass surcharge
-- may be non-zero (the M5 write-guard enforces that).
--
-- version is bumped the way the ops Pricing screen bumps it (nextVersion in
-- worker/lib/pricing-admin.ts: v1 → v2, v1-provisional → v2, v3 → v4). There is
-- no pricing audit table any more (0042 dropped it); Cloudflare's own tooling is
-- the record.
--
-- Apply to production (remote D1 is not reachable from the agent session):
--   npx wrangler d1 execute apertly-db --remote --file docs/runs/catalogue-go-live-min/rate-cards.sql
-- Rehearse locally first:
--   npx wrangler d1 execute apertly-db --local  --file docs/runs/catalogue-go-live-min/rate-cards.sql
--
-- Not idempotent by design: the INSERT block fails on a second run (primary
-- key), and D1 runs the file as one atomic batch, so a re-run changes nothing.
--
-- Cards that already exist: UPDATE. Cards that did not (the two AMJ72T products
-- never had one; the AMJ80 and AMJ100L fixed windows had cards keyed under a
-- different id than their pricingRef, so they priced at 'default'; AMJ150ST is
-- new): INSERT. The old fixed-window card ids (amj80st-fixed-window,
-- amj100l-fixed-window) and amj150-series-awning-window are left as they are.

-- ── existing cards ───────────────────────────────────────────────────────────
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 354.64, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj80-series-awning-window';
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 330.33, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj80t-casement-door';
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 326.04, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj80-series-sliding-window';
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 313.17, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj80-series-sliding-door';
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 291.72, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj80-series-glass-louver4-inch';
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 357.50, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj100l-series-awning-window';
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 318.89, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj100l-series-sliding-door';
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 296.01, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj100l-series-glass-louver6-inch';
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 368.94, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj150-series-sliding-door';
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 330.33, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj150-fixed-window';
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 483.34, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj100t-awning-window';
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 331.76, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj100t-fixed-window';
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 460.46, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj100t-series-casement-door';
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 413.27, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj100t-series-sliding-door';
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 573.43, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj100t-single-hung-window';
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 634.92, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj100t-series-sashless-double-hung';
UPDATE pricing_rate_card SET perim_rate = 0, area_rate = 446.16, min_charge = 0, active = 1, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now') WHERE id = 'amj68-series-bi-fold-door';

-- ── cards that did not exist under the product's pricingRef ──────────────────
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active) VALUES
  ('amj72t-awning-window',        0, 354.64, 0, 'v1', 1),
  ('amj72t-fixed-window',         0, 248.82, 0, 'v1', 1),
  ('amj80-series-fixed-window',   0, 248.82, 0, 'v1', 1),
  ('amj100l-series-fixed-window', 0, 253.11, 0, 'v1', 1),
  ('amj150st-awning-window',      0, 451.88, 0, 'v1', 1);
