-- ═══════════════════════════════════════════════════════════════════════════
-- 0026_pricing_modifiers — per-product conditional pricing rules (PRIVATE).
--
-- The manufacturer's pricing model is universal in SHAPE but owned per product:
-- the same rules are authored onto every rate card, yet any single card can be
-- tuned without touching the others. First rule (2026-07-26): a frame wider than
-- 1200mm costs 10% more.
--
-- Lives in D1 with the rest of pricing, NEVER in Sanity — these rules encode
-- margin structure. Only the final total ever reaches the browser (PriceSnapshot
-- carries no per-modifier breakdown to the customer; the applied list is kept in
-- the server-side snapshot for auditability).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE pricing_modifier (
  id            TEXT PRIMARY KEY,
  rate_card_id  TEXT NOT NULL REFERENCES pricing_rate_card(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL DEFAULT 0,     -- application order (ascending)
  label         TEXT,                            -- human note for ops/audit
  when_field    TEXT NOT NULL CHECK (when_field IN ('width','height','area','qty')),
  when_op       TEXT NOT NULL CHECK (when_op IN ('>','>=','<','<=','==')),
  when_value    REAL NOT NULL,
  then_type     TEXT NOT NULL CHECK (then_type IN ('percent','fixed')),
  then_value    REAL NOT NULL,
  version       TEXT NOT NULL DEFAULT 'v1',
  active        INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_pricing_modifier_card ON pricing_modifier(rate_card_id, active, seq);

-- Seed the universal wide-frame rule onto EVERY rate card (including 'default'),
-- so it applies to all products while remaining individually editable.
INSERT INTO pricing_modifier (id, rate_card_id, seq, label, when_field, when_op, when_value, then_type, then_value)
SELECT 'wide-frame-' || id, id, 10, 'Wide frame surcharge (width > 1200mm)', 'width', '>', 1200, 'percent', 10
  FROM pricing_rate_card;
