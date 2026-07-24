// Populate the estimated estimator fields on every published product.
//
//   node scripts/catalogue/populate-estimator-fields.mjs            # dry run: print mutations
//   node scripts/catalogue/populate-estimator-fields.mjs --apply    # write (needs SANITY_WRITE_TOKEN)
//
// Dry run is safe and needs no token. --apply uses the Sanity mutate API with a
// write token in SANITY_WRITE_TOKEN; without one, it exits. (The agent may instead
// apply the printed mutations through the Sanity MCP.)
import { createClient } from "@sanity/client";
import { deriveEstimatorFields } from "./derive-estimator-fields.mjs";

const projectId = process.env.SANITY_PROJECT_ID || "xjtrm1ex";
const dataset = process.env.SANITY_DATASET || "production";
const token = process.env.SANITY_WRITE_TOKEN;
const apply = process.argv.includes("--apply");

const client = createClient({ projectId, dataset, apiVersion: "2024-01-01", useCdn: !apply, token });

const products = await client.fetch(`*[_type == "product" && defined(name)]{
  "id": _id, "slug": slug.current, name, "family": family->slug.current, "category": category->slug.current,
  minWidth, maxWidth, minHeight, maxHeight, standardGlass
} | order(family asc)`);

const patches = products.map((p) => ({ id: p.id, name: p.name, fields: deriveEstimatorFields(p) }));

if (!apply) {
  console.log(`# Dry run — ${patches.length} products would be patched (all values estimated/uncertified)\n`);
  for (const { id, name, fields } of patches) {
    const pv = fields.performanceVariants[0];
    console.log(`${name} (${id})`);
    console.log(`  operation=${fields.configuration.operationTypes.join("+") || "?"}  Uw=${pv.uValue} SHGC=${pv.shgc} [${pv.glassBuildUp}]  maxArea=${fields.dimensionRule.maxAreaM2}m²  pricingRef=${fields.pricingRef}`);
  }
  console.log(`\n(no writes; pass --apply with SANITY_WRITE_TOKEN to persist, or apply via the Sanity MCP)`);
} else {
  if (!token) { console.error("SANITY_WRITE_TOKEN required for --apply"); process.exit(1); }
  let n = 0;
  for (const { id, fields } of patches) {
    await client.patch(id).set(fields).commit({ autoGenerateArrayKeys: true });
    n++;
  }
  console.log(`Applied estimated estimator fields to ${n} products.`);
}
