-- ═══════════════════════════════════════════════════════════════════════════
-- 0031_product_rate_cards — rate cards are per PRODUCT, not per family.
--
-- 0015 keyed pricing_rate_card on the family slug, so every product in a family
-- was locked to one perimeter/area rate. Products within a family are not
-- commercially identical — an AMJ80 and an AMJ150 awning are different frames at
-- different cost — and there was no way to price one without repricing the rest.
--
-- Every product now has its own card, SEEDED FROM THE FAMILY CARD THAT PRICED IT
-- the day before. This migration deliberately moves no money: same numbers, new
-- key. Divergence is now possible, which is the point, but it has to be done
-- deliberately in Ops → Pricing rather than arriving as a side effect.
--
-- The family rows are removed. Keeping them as a silent second tier would be a
-- second source of truth for the same number, and a product missing its card
-- would price at a family rate nobody could see in the console. Resolution is now
-- product card → 'default', and a product with no card of its own is reported by
-- the reconciler instead of quietly inheriting.
--
-- 'default' stays as the last-resort fallback for anything unmapped.
--
-- Modifiers hang off rate_card_id, so 0026's universal wide-frame rule is
-- re-authored onto every product card; the family-keyed copies go with their cards.
--
-- Regenerate with: node scripts/gen-product-rate-cards.mjs
-- Append-only: never edit an applied migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- 27 products, seeded from their family's rate.

INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active) VALUES
  ('amj100-series-pivot-door', 160, 640, 0, 'v1', 1),   -- pivot-door
  ('amj100l-series-awning-window', 55, 340, 0, 'v1', 1),   -- awning-window
  ('amj100l-series-casement-door', 95, 460, 0, 'v1', 1),   -- casement-door
  ('amj100l-series-glass-louver6-inch', 60, 320, 0, 'v1', 1),   -- glass-louvre
  ('amj100l-series-sliding-door', 85, 420, 0, 'v1', 1),   -- sliding-door
  ('amj100t-awning-window', 55, 340, 0, 'v1', 1),   -- awning-window
  ('amj100t-series-awning-window', 55, 340, 0, 'v1', 1),   -- awning-window
  ('amj100t-series-casement-door', 95, 460, 0, 'v1', 1),   -- casement-door
  ('amj100t-series-sashless-double-hung', 60, 360, 0, 'v1', 1),   -- sashless-double-hung
  ('amj100t-series-sliding-door', 85, 420, 0, 'v1', 1),   -- sliding-door
  ('amj100t-single-hung-window', 50, 330, 0, 'v1', 1),   -- single-hung-window
  ('amj125t-slim-frame-sliding-door', 150, 560, 0, 'v1', 1),   -- slim-frame-sliding-door
  ('amj150-series-awning-window', 55, 340, 0, 'v1', 1),   -- awning-window
  ('amj150-series-sliding-door', 85, 420, 0, 'v1', 1),   -- sliding-door
  ('amj150t-lift-sliding-door', 150, 600, 0, 'v1', 1),   -- lift-slide-door
  ('amj65t-casement-door', 95, 460, 0, 'v1', 1),   -- casement-door
  ('amj65t-casement-windowoutward-opening', 55, 350, 0, 'v1', 1),   -- casement-window
  ('amj65t-tilt-and-turn-window', 90, 520, 0, 'v1', 1),   -- tilt-and-turn-window
  ('amj68-series-bi-fold-door', 130, 520, 0, 'v1', 1),   -- bi-fold-door
  ('amj80-series-awning-window', 55, 340, 0, 'v1', 1),   -- awning-window
  ('amj80-series-casement-window', 55, 350, 0, 'v1', 1),   -- casement-window
  ('amj80-series-glass-louver4-inch', 60, 320, 0, 'v1', 1),   -- glass-louvre
  ('amj80-series-sliding-door', 85, 420, 0, 'v1', 1),   -- sliding-door
  ('amj80-series-sliding-window', 45, 300, 0, 'v1', 1),   -- sliding-window
  ('amj80t-bi-fold-door', 130, 520, 0, 'v1', 1),   -- bi-fold-door
  ('amj80t-casement-door', 95, 460, 0, 'v1', 1),   -- casement-door
  ('amj80t-tilt-and-turn-window', 90, 520, 0, 'v1', 1);   -- tilt-and-turn-window

-- The universal wide-frame rule (0026) re-authored onto each product card.
INSERT INTO pricing_modifier (id, rate_card_id, seq, label, when_field, when_op, when_value, then_type, then_value)
SELECT 'wide-frame-' || id, id, 10, 'Wide frame surcharge (width > 1200mm)', 'width', '>', 1200, 'percent', 10
  FROM pricing_rate_card WHERE id NOT IN (SELECT rate_card_id FROM pricing_modifier);

-- Retire the family cards. Their modifiers cascade (ON DELETE CASCADE, 0026).
DELETE FROM pricing_rate_card WHERE id IN ('sliding-window', 'awning-window', 'casement-window', 'glass-louvre', 'tilt-and-turn-window', 'sashless-double-hung', 'single-hung-window', 'sliding-door', 'casement-door', 'bi-fold-door', 'pivot-door', 'slim-frame-sliding-door', 'lift-slide-door');
