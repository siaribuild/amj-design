-- ═══════════════════════════════════════════════════════════════════════════
-- 0038_option_surcharge_basis — per-m² option surcharges (glazing).
--
-- Until now every option surcharge was a FLAT amount added once per unit — right
-- for a handle, wrong for glass: a 3 m² window carries 3× the glass of a 1 m² one,
-- so a glazing choice must scale with GLAZED AREA, not per piece. Add a `basis`:
--   • 'per_unit'  — unchanged default; a flat amount added once per unit.
--   • 'per_sqm'   — multiplied by the opening's glazed area (m²) at price time.
--
-- Glass is now priced in FULL through the glazing option (owner decision
-- 2026-07-31): the rate card's area rate becomes frame/labour only, and each glass
-- identity carries its whole $/m². Seed the three glass identities at $0 so the
-- mechanism is live and pricing still succeeds (a present-but-zero row means
-- "priced, awaiting the real $/m²"; a MISSING row is an unknown option — an error,
-- never free). Ops then authors the real glass $/m² and trims each rate card's
-- area rate so glass is not counted twice.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE pricing_option_surcharge ADD COLUMN basis TEXT NOT NULL DEFAULT 'per_unit';

INSERT INTO pricing_option_surcharge (id, surcharge, basis, version, active) VALUES
  ('single-glazed-clear', 0, 'per_sqm', 'v1', 1),
  ('double-glazed-clear', 0, 'per_sqm', 'v1', 1),
  ('double-glazed-low-e', 0, 'per_sqm', 'v1', 1)
ON CONFLICT(id) DO UPDATE SET basis = 'per_sqm', active = 1;
