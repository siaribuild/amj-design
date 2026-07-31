-- ═══════════════════════════════════════════════════════════════════════════
-- 0039_glazing_thermal_scaffold — area-rate ↔ glazing-price coupling safeguard.
--
-- SCAFFOLD (glazing/thermal, M5 / D9). NOT part of go-live until M5 wires the
-- ops write-guard; safe to apply early (additive column, default 0 = today's
-- behaviour).
--
-- Glass is currently baked into pricing_rate_card.area_rate (seed 0015) AND — once
-- authored — into the per_sqm glazing surcharge (migration 0038). Only the $0
-- glazing seed masks the double-count. This flag makes the coupling explicit: the
-- M5 write-guard blocks a non-zero glass $/m² while ANY active rate card still has
-- glass_excluded_from_area_rate = 0 (i.e. area_rate not yet trimmed to frame/labour).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE pricing_rate_card
  ADD COLUMN glass_excluded_from_area_rate INTEGER NOT NULL DEFAULT 0;
