#!/usr/bin/env node
// One-off generator for migrations/0031_product_rate_cards.sql.
//
// Rate cards move from FAMILY to PRODUCT. Every product gets its own card,
// seeded from the family card that priced it the day before, so the migration
// moves no money — it only changes what the price is keyed on. From then on any
// single product can be tuned without dragging its siblings with it.
//
// Kept in the repo so the seed is reproducible and reviewable rather than a
// hand-typed table nobody can trace back to a source.
import { writeFileSync } from "node:fs";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const root = process.cwd();
const outfile = join(root, ".codex-tmp", "gen-rate-cards-bundle.mjs");
await build({
  stdin: {
    contents: `export { products } from ${JSON.stringify(join(root, "src/data/catalogue.ts"))};`,
    resolveDir: root, sourcefile: "e.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { products } = await import(pathToFileURL(outfile).href);

// The family cards as seeded by 0015 — the values every product currently prices at.
const FAMILY = {
  "sliding-window": [45, 300], "awning-window": [55, 340], "casement-window": [55, 350],
  "glass-louvre": [60, 320], "tilt-and-turn-window": [90, 520], "sashless-double-hung": [60, 360],
  "single-hung-window": [50, 330], "sliding-door": [85, 420], "casement-door": [95, 460],
  "bi-fold-door": [130, 520], "pivot-door": [160, 640], "slim-frame-sliding-door": [150, 560],
  "lift-slide-door": [150, 600],
};
const DEFAULT = [60, 380];

const seen = new Set();
const rows = [];
for (const p of products) {
  if (!p.slug || seen.has(p.slug)) continue;
  seen.add(p.slug);
  const [perim, area] = FAMILY[p.familySlug] ?? DEFAULT;
  rows.push({ id: p.slug, family: p.familySlug, perim, area, inherited: !FAMILY[p.familySlug] });
}
rows.sort((a, b) => a.id.localeCompare(b.id));

const unmapped = rows.filter((r) => r.inherited);
const header = `-- ═══════════════════════════════════════════════════════════════════════════
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

`;

const body = [
  `-- ${rows.length} products, seeded from their family's rate.`,
  ...(unmapped.length
    ? [`-- NOTE: ${unmapped.length} product(s) had no family card and inherit 'default' (${DEFAULT[0]}/${DEFAULT[1]}):`,
       ...unmapped.map((r) => `--   ${r.id} (family: ${r.family || "none"})`)]
    : []),
  "",
  "INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active) VALUES",
  // The separator goes INSIDE the line, before the comment — a trailing "-- family"
  // after the comma swallows it, and the last row would swallow the semicolon too.
  rows.map((r, i) =>
    `  ('${r.id}', ${r.perim}, ${r.area}, 0, 'v1', 1)${i === rows.length - 1 ? ";" : ","}   -- ${r.family || "unmapped"}`,
  ).join("\n"),
  "",
  "-- The universal wide-frame rule (0026) re-authored onto each product card.",
  "INSERT INTO pricing_modifier (id, rate_card_id, seq, label, when_field, when_op, when_value, then_type, then_value)",
  "SELECT 'wide-frame-' || id, id, 10, 'Wide frame surcharge (width > 1200mm)', 'width', '>', 1200, 'percent', 10",
  "  FROM pricing_rate_card WHERE id NOT IN (SELECT rate_card_id FROM pricing_modifier);",
  "",
  "-- Retire the family cards. Their modifiers cascade (ON DELETE CASCADE, 0026).",
  `DELETE FROM pricing_rate_card WHERE id IN (${Object.keys(FAMILY).map((f) => `'${f}'`).join(", ")});`,
].join("\n");

writeFileSync("migrations/0031_product_rate_cards.sql", `${header}${body}\n`);
console.log(`wrote migrations/0031_product_rate_cards.sql — ${rows.length} product cards, ${unmapped.length} unmapped`);
