-- Go-live minimum price list — AMJ_min.xlsx (owner, 2026-09-06), column J.
--
-- J is the public sale price per m² of the whole unit (frame + glazing), GST
-- included. The rate card's figures are GST-inclusive too (src/data/gst.ts
-- divides by 1.1 for ex-GST display), so J becomes the whole area rate and the
-- perimeter and minimum-charge components go to zero. Glass is INSIDE this
-- number, so every card is stamped glass_excluded_from_area_rate = 0 (the
-- production backup of 2026-08-27 had 27 of 34 cards at 1) and the per-m²
-- glazing surcharges must stay at 0 for the go-live glazings — see the runbook.
--
-- version is bumped the way the ops Pricing screen bumps it (nextVersion in
-- worker/lib/pricing-admin.ts: v1 → v2, v1-provisional → v2, v4 → v5). There is
-- no pricing audit table any more (0042 dropped it); Cloudflare's own tooling is
-- the record.
--
-- Every statement is an upsert on the card's id: production already carries
-- cards the local copy does not (the 2026-08-27 backup shows amj72t-awning-window,
-- amj72t-fixed-window, amj80-series-fixed-window and amj100l-series-fixed-window
-- priced by hand in ops), so an unconditional INSERT would collide and abort the
-- whole batch. ON CONFLICT updates the existing row and bumps its version; a
-- card that truly does not exist (amj150st-awning-window) is inserted at v1.
-- Re-running the file is safe: it re-applies the same figures and bumps
-- versions again.
--
-- Apply to production (remote D1 is not reachable from the agent session):
--   npx wrangler d1 execute apertly-db --remote --file docs/runs/catalogue-go-live-min/rate-cards.sql
-- Rehearse locally first:
--   npx wrangler d1 execute apertly-db --local  --file docs/runs/catalogue-go-live-min/rate-cards.sql
--
-- The old fixed-window card ids (amj80st-fixed-window, amj100l-fixed-window) and
-- amj150-series-awning-window are left as they are; nothing is deleted.

INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj80-series-awning-window', 0, 354.64, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 354.64, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj80t-casement-door', 0, 330.33, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 330.33, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj80-series-sliding-window', 0, 326.04, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 326.04, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj80-series-sliding-door', 0, 313.17, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 313.17, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj80-series-glass-louver4-inch', 0, 291.72, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 291.72, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj100l-series-awning-window', 0, 357.50, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 357.50, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj100l-series-sliding-door', 0, 318.89, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 318.89, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj100l-series-glass-louver6-inch', 0, 296.01, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 296.01, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj150-series-sliding-door', 0, 368.94, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 368.94, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj150-fixed-window', 0, 330.33, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 330.33, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj100t-awning-window', 0, 483.34, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 483.34, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj100t-fixed-window', 0, 331.76, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 331.76, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj100t-series-casement-door', 0, 460.46, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 460.46, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj100t-series-sliding-door', 0, 413.27, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 413.27, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj100t-single-hung-window', 0, 573.43, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 573.43, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj100t-series-sashless-double-hung', 0, 634.92, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 634.92, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj68-series-bi-fold-door', 0, 446.16, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 446.16, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj72t-awning-window', 0, 354.64, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 354.64, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj72t-fixed-window', 0, 248.82, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 248.82, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj80-series-fixed-window', 0, 248.82, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 248.82, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj100l-series-fixed-window', 0, 253.11, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 253.11, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, glass_excluded_from_area_rate) VALUES ('amj150st-awning-window', 0, 451.88, 0, 'v1', 1, 0)
  ON CONFLICT(id) DO UPDATE SET perim_rate = 0, area_rate = 451.88, min_charge = 0, active = 1, glass_excluded_from_area_rate = 0, version = 'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1), updated_at = datetime('now');
