#!/usr/bin/env node
// One-off generator for migrations/0027_option_surcharges.sql.
//
// Kept in the repo so the seed is reproducible and reviewable rather than a
// hand-typed table nobody can trace back to a source.
import { writeFileSync } from "node:fs";

const PROJECT = "xjtrm1ex";
const DATASET = "production";
const QUERY = `*[_type=="option"]{ "type": optionType->slug.current, name, pricingComponent }`;

const canon = (v) => String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const res = await fetch(`https://${PROJECT}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(QUERY)}`);
const { result = [] } = await res.json();

const seen = new Set();
const rows = result
  .filter((o) => o?.type && o?.name)
  .map((o) => ({ id: `${canon(o.type)}:${canon(o.name)}`, surcharge: Number(o.pricingComponent) || 0 }))
  .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
  .sort((a, b) => a.id.localeCompare(b.id));

const header = `-- ═══════════════════════════════════════════════════════════════════════════
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
`;

const body = rows
  .map((r) => `INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES ('${r.id.replace(/'/g, "''")}', ${r.surcharge}, 'v1', 1)\n  ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, active=1;`)
  .join("\n");

writeFileSync("migrations/0027_option_surcharges.sql", `${header}${body}\n`);
console.log(`${rows.length} rows (${rows.filter((r) => r.surcharge > 0).length} priced, ${rows.filter((r) => r.surcharge === 0).length} zero-cost)`);
