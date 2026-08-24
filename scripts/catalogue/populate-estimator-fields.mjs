// Populate provisional estimator fields on every published product.
//
//   node scripts/catalogue/populate-estimator-fields.mjs
//   node scripts/catalogue/populate-estimator-fields.mjs --apply
//
// Dry run is the default. --apply requires SANITY_WRITE_TOKEN. Existing
// certified/manufacturer performance data is never overwritten.
import { createClient } from "@sanity/client";
import { deriveEstimatorFields } from "./derive-estimator-fields.mjs";

const projectId = process.env.SANITY_PROJECT_ID || "xjtrm1ex";
const dataset = process.env.SANITY_DATASET || "production";
const token = process.env.SANITY_WRITE_TOKEN;
const apply = process.argv.includes("--apply");

const client = createClient({
  projectId,
  dataset,
  apiVersion: "2025-02-19",
  useCdn: !apply,
  token,
  perspective: "published",
});

const products = await client.fetch(`*[
  _type == "product" &&
  defined(name) &&
  !(_id in path("drafts.**"))
]{
  "id": _id,
  "rev": _rev,
  "slug": slug.current,
  name,
  "family": family->slug.current,
  "category": category->slug.current,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
  standardGlass,
  configuration,
  dimensionRule,
  pricingRef,
  schemaVersion,
  performanceVariants[]{
    _key,
    variantId,
    glassBuildUp,
    uValue,
    shgc,
    frameType,
    frameTechnology,
    coating,
    pricingOptionSlugs,
    published
  }
} | order(family asc)`);

// Anything a person or an importer authored. The derived variant this script
// writes is always `_key: "std"`, so a key that is anything else is by
// construction data this script did not invent and must not overwrite. The
// three certified/dataSource clauses that used to sit beside this one went with
// ADR 0011; they never widened the set, because a hand-authored variant already
// fails the key test.
const hasProtectedPerformance = (product) => (product.performanceVariants ?? []).some(
  (variant) => variant?._key !== "std",
);

const patches = products.map((product) => {
  const fields = deriveEstimatorFields(product);
  const preservesPerformance = hasProtectedPerformance(product);
  if (preservesPerformance) delete fields.performanceVariants;
  const preservesConfiguration = ["certified", "manufacturer"].includes(product.configuration?.dataSource);
  const preservesDimensions = ["certified", "manufacturer"].includes(product.dimensionRule?.dataSource);
  if (preservesConfiguration) delete fields.configuration;
  if (preservesDimensions) delete fields.dimensionRule;
  if (product.pricingRef) delete fields.pricingRef;
  if (Number(product.schemaVersion ?? 0) >= fields.schemaVersion) delete fields.schemaVersion;
  return {
    id: product.id,
    name: product.name,
    fields,
    preservesPerformance,
    preservesConfiguration,
    preservesDimensions,
  };
});

if (!apply) {
  console.log(`# Dry run — ${patches.length} products would be patched`);
  console.log("# Provisional performance is always estimated/uncertified; protected data is preserved.\n");
  for (const {
    id, name, fields, preservesPerformance, preservesConfiguration, preservesDimensions,
  } of patches) {
    const variant = fields.performanceVariants?.[0];
    console.log(`${name} (${id})`);
    if (preservesPerformance) {
      console.log("  performance=PRESERVED (hand-authored data exists)");
    } else {
      console.log(
        `  frame=${variant.frameTechnology}  Uw=${variant.uValue}  SHGC=${variant.shgc}`
        + `  glass=[${variant.glassBuildUp}]`,
      );
    }
    const operation = preservesConfiguration
      ? "PRESERVED"
      : fields.configuration.operationTypes.join("+") || "?";
    const maxArea = preservesDimensions ? "PRESERVED" : `${fields.dimensionRule.maxAreaM2}m²`;
    console.log(`  operation=${operation}  maxArea=${maxArea}  pricingRef=${fields.pricingRef ?? "PRESERVED"}`);
  }
  console.log("\n(no writes; pass --apply with SANITY_WRITE_TOKEN to persist)");
} else {
  if (!token) {
    console.error("SANITY_WRITE_TOKEN required for --apply");
    process.exit(1);
  }
  let updated = 0;
  let protectedCount = 0;
  let transaction = client.transaction();
  for (const { id, fields, preservesPerformance } of patches) {
    const rev = products.find((product) => product.id === id)?.rev;
    transaction = transaction.patch(id, (patch) => patch.ifRevisionId(rev).set(fields));
    updated++;
    if (preservesPerformance) protectedCount++;
  }
  await transaction.commit({ autoGenerateArrayKeys: true });
  console.log(
    `Applied estimator fields to ${updated} products;`
    + ` preserved hand-authored performance data on ${protectedCount}.`,
  );
}
