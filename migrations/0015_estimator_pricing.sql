-- ═══════════════════════════════════════════════════════════════════════════
-- 0015_estimator_pricing — PRIVATE pricing rate card (spec §10, addendum §2).
--
-- Pricing lives in D1, NEVER in Sanity: it is commercially sensitive and is
-- server-computed, with no per-option breakdown returned to the browser. Sanity
-- holds only `product.pricingRef`, which keys into this table. The estimator and
-- the public configurator both price through the SAME private Worker service, so
-- "frontend parity" means the same computed number — not shared Sanity price fields.
--
-- Seeded from the existing placeholder perimeter+area $/m² model (configurator.ts
-- RATES) so estimator and frontend agree today; real AMJ numbers replace the rows
-- in place (bump `version`). Deposit corrected to 40% (spec: real is 40%, not 50%).
-- ═══════════════════════════════════════════════════════════════════════════

-- Per-family base rate: unit = perimeter(m)·perim_rate + area(m²)·area_rate.
CREATE TABLE pricing_rate_card (
  id            TEXT PRIMARY KEY,        -- family slug ('awning-window') or 'default'
  perim_rate    REAL NOT NULL,           -- $/m of frame perimeter
  area_rate     REAL NOT NULL,           -- $/m² of glazed area
  min_charge    REAL NOT NULL DEFAULT 0,
  version       TEXT NOT NULL DEFAULT 'v1',
  active        INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Option surcharges by the option's technical value/slug (moved out of Sanity).
CREATE TABLE pricing_option_surcharge (
  id            TEXT PRIMARY KEY,        -- option slug / technical value
  surcharge     REAL NOT NULL DEFAULT 0,
  version       TEXT NOT NULL DEFAULT 'v1',
  active        INTEGER NOT NULL DEFAULT 1
);

-- Commercial policy (deposit, GST) — versioned so a snapshot records which applied.
CREATE TABLE pricing_policy (
  id              TEXT PRIMARY KEY,      -- 'default'
  deposit_percent REAL NOT NULL DEFAULT 40,
  gst_mode        TEXT NOT NULL DEFAULT 'inc',
  version         TEXT NOT NULL DEFAULT 'v1'
);

-- Seed the family rate card from the current placeholder model.
INSERT INTO pricing_rate_card (id, perim_rate, area_rate) VALUES
  ('sliding-window', 45, 300),
  ('awning-window', 55, 340),
  ('casement-window', 55, 350),
  ('glass-louvre', 60, 320),
  ('tilt-and-turn-window', 90, 520),
  ('sashless-double-hung', 60, 360),
  ('single-hung-window', 50, 330),
  ('sliding-door', 85, 420),
  ('casement-door', 95, 460),
  ('bi-fold-door', 130, 520),
  ('pivot-door', 160, 640),
  ('slim-frame-sliding-door', 150, 560),
  ('lift-slide-door', 150, 600),
  ('default', 60, 380);

INSERT INTO pricing_policy (id, deposit_percent, gst_mode, version) VALUES ('default', 40, 'inc', 'v1');
