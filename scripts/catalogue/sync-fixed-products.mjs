// Copy the owner-entered AMJ80ST dimension rule to every fixed product and set
// each product's private D1 pricing reference to its own slug.
//
// Dry-run by default. Pass --write to mutate the production Sanity dataset.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT_ID = process.env.SANITY_PROJECT_ID || "xjtrm1ex";
const DATASET = process.env.SANITY_DATASET || "production";
const SOURCE_SLUG = "amj80st-fixed-window";
const FIXED_SLUGS = [
  "amj100t-fixed-window",
  "amj80st-fixed-window",
  "amj100l-fixed-window",
  "amj67t-fixed-window",
  "amj150-fixed-window",
];

const token = () => JSON.parse(
  readFileSync(join(homedir(), ".config", "sanity", "config.json"), "utf8"),
).authToken;

async function query(groq) {
  const url = `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(groq)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`query ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return (await response.json()).result;
}

async function mutate(mutations) {
  const response = await fetch(`https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/mutate/${DATASET}?returnDocuments=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mutations }),
  });
  if (!response.ok) throw new Error(`mutate ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

const source = await query(`*[_type=="product" && slug.current=="${SOURCE_SLUG}"][0]{dimensionRule}`);
const rule = source?.dimensionRule;
for (const field of ["minWidthMm", "maxWidthMm", "minHeightMm", "maxHeightMm"]) {
  if (!Number.isFinite(rule?.[field])) throw new Error(`${SOURCE_SLUG} is missing numeric ${field}`);
}

const products = await query(`*[_type=="product" && slug.current in ${JSON.stringify(FIXED_SLUGS)}]{_id,name,"slug":slug.current}`);
if (products.length !== FIXED_SLUGS.length) {
  const found = new Set(products.map((product) => product.slug));
  throw new Error(`missing fixed products: ${FIXED_SLUGS.filter((slug) => !found.has(slug)).join(", ")}`);
}

console.log(JSON.stringify({ source: SOURCE_SLUG, dimensionRule: rule, products: products.map((product) => product.slug) }, null, 2));
if (!process.argv.includes("--write")) {
  console.log("dry run — no writes; pass --write to apply");
} else {
  await mutate(products.map((product) => ({
    patch: {
      id: product._id,
      set: { dimensionRule: rule, pricingRef: product.slug },
    },
  })));
  console.log(`updated ${products.length} fixed products`);
}
