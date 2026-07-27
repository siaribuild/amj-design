-- ═══════════════════════════════════════════════════════════════════════════
-- 0027_option_surcharges — seed pricing_option_surcharge.
--
-- 0015 created this table and seeded NOTHING, so loadOptionSurcharges(requireAll)
-- resolved 0 of N and threw for every line carrying an option slug. The D1 engine
-- could therefore not price anything with options at all, which is why the
-- client-side priceConfigured fallback was still load-bearing in production.
--
-- Values come from Sanity option.pricingComponent — the catalogue is the single
-- source of truth for what an option costs. Ids follow the slug shape
-- pricingOptionSlugsFromOptions() emits: "<optionType>:<optionName>", canonicalised
-- to lowercase-hyphen.
--
-- Zero-cost options are seeded EXPLICITLY rather than omitted. requireAll must be
-- able to RESOLVE them: a missing row means "unknown option", which is an error,
-- not a free one.
--
-- Regenerate with: node scripts/gen-option-surcharges.mjs
-- Append-only: never edit an applied migration.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:basalt', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:bluegum', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:classic-cream', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:cottage-green', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:deep-ocean', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:dover-white', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:dune', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:evening-haze', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:gully', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:ironstone', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:jasper', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:mangrove', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:manor-red', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:monument', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:night-sky', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:pale-eucalypt', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:paperbark', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:shale-grey', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:southerly', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:surfmist', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:wallaby', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:wilderness', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:windspray', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('colour:woodland-grey', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('flyscreen:0-3mm-stainless-steel', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('flyscreen:0-5mm-stainless-steel', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('flyscreen:0-8mm-stainless-steel', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('flyscreen:aluminium', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('flyscreen:fiber-glass', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('flyscreen:none', 0, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('flyscreen:retractable-flyscreen', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:american-chain-winder', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:amj-standard-chain-winder', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:amj-standard-d-shape-handle', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:amj-standard-handle', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:au-ciilock-brand-d-shape-handle', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:au-ciilock-hardware-acrylic-handle', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:au-doric-brand-chain-winder', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:au-doric-brand-d-shape-handle', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:au-novas-brand-handle', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:baogao', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:caldwell', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:china-kin-long-brand-handle', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:china-top-hardware', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:hk-kinlong', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:ksbg', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:scissor-winder', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('hardware:vbh', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('installation:bracket', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('installation:nail-fin', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('installation:screw', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('installation:sub-sill-head', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('installation:t-fin', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('installation:timber-reveal', 100, 'v1', 1)
  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;
