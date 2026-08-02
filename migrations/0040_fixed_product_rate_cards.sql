-- Fixed-window products were imported with certified WERS thermal data but no
-- private rate cards. These provisional cards make them priceable for estimator
-- testing; Ops → Pricing remains the authority for replacing the numbers.
INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active) VALUES
  ('amj100t-fixed-window', 45, 300, 0, 'v1-provisional', 1),
  ('amj80st-fixed-window', 45, 300, 0, 'v1-provisional', 1),
  ('amj100l-fixed-window', 45, 300, 0, 'v1-provisional', 1),
  ('amj67t-fixed-window', 45, 300, 0, 'v1-provisional', 1),
  ('amj150-fixed-window', 45, 300, 0, 'v1-provisional', 1)
ON CONFLICT(id) DO NOTHING;

INSERT INTO pricing_modifier
  (id, rate_card_id, seq, label, when_field, when_op, when_value, then_type, then_value)
SELECT 'wide-frame-' || id, id, 10, 'Wide frame surcharge (width > 1200mm)',
       'width', '>', 1200, 'percent', 10
  FROM pricing_rate_card
 WHERE id IN (
   'amj100t-fixed-window', 'amj80st-fixed-window', 'amj100l-fixed-window',
   'amj67t-fixed-window', 'amj150-fixed-window'
 )
   AND id NOT IN (SELECT rate_card_id FROM pricing_modifier);
