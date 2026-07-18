#!/usr/bin/env node
// Transform the hardcoded catalogue (src/data/catalogue.ts) into Sanity NDJSON,
// ready for `sanity dataset import`. Runs locally — no Sanity account needed:
//
//   npm run sanity:ndjson        # writes sanity/catalogue.ndjson
//   cd sanity && npx sanity dataset import catalogue.ndjson production
//
// Document ids are deterministic (category-<slug> etc.) so re-imports upsert.
import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Bundle catalogue.ts (TS) to a temp ESM file we can import.
const outfile = join(tmpdir(), `amj-catalogue-${Date.now()}.mjs`);
await build({
  entryPoints: ["src/data/catalogue.ts"],
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "error",
});
const cat = await import(pathToFileURL(outfile).href);

const ref = (id) => ({ _type: "reference", _ref: id });
const docs = [];

for (const c of cat.categories) {
  docs.push({ _id: `category-${c.slug}`, _type: "category", name: c.name, slug: { _type: "slug", current: c.slug }, shortDescription: c.shortDescription, description: c.description });
}
for (const f of cat.families) {
  docs.push({ _id: `family-${f.slug}`, _type: "family", name: f.name, slug: { _type: "slug", current: f.slug }, category: ref(`category-${f.categorySlug}`), shortDescription: f.shortDescription, description: f.description });
}
for (const p of cat.products) {
  docs.push({
    _id: `product-${p.slug}`, _type: "product", name: p.name, slug: { _type: "slug", current: p.slug },
    family: ref(`family-${p.familySlug}`), category: ref(`category-${p.categorySlug}`),
    shortDescription: p.shortDescription, descriptionParagraphs: p.descriptionParagraphs,
    standardGlass: p.standardGlass, hardware: p.hardware,
    minWidth: p.minWidth, minHeight: p.minHeight, maxWidth: p.maxWidth, maxHeight: p.maxHeight,
    profileThickness: p.profileThickness, airTightness: p.airTightness, waterTightness: p.waterTightness,
    windPressure: p.windPressure, notes: p.notes, heroImage: p.heroImage, gallery: p.gallery,
    // Sanity requires a stable, unique _key on every array-of-object member.
    keySpecs: (p.keySpecs || []).map((s, i) => ({ _key: `ks${i}`, _type: "specRow", ...s })),
    specs: (p.specs || []).map((s, i) => ({ _key: `sp${i}`, _type: "specRow", ...s })),
    options: (p.options || []).map((o, i) => ({ _key: `op${i}`, _type: "productOption", ...o })),
    featuredOrder: p.featuredOrder,
  });
}
for (const col of cat.colorbondColourOptions) {
  docs.push({ _id: `colour-${col.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, _type: "colour", name: col.name, hex: col.hex ?? null, availability: col.availability });
}

const ndjson = docs.map((d) => JSON.stringify(d)).join("\n") + "\n";
writeFileSync("sanity/catalogue.ndjson", ndjson);
console.log(`✓ wrote sanity/catalogue.ndjson — ${docs.length} documents (` +
  `${cat.categories.length} categories, ${cat.families.length} families, ${cat.products.length} products, ${cat.colorbondColourOptions.length} colours)`);
