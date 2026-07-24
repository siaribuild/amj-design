// Catalogue-readiness report (CPQ Estimator spec §16.1, Phase 0).
//
// Queries the LIVE published Sanity catalogue and reports which products are
// missing the estimator-critical technical fields defined by the spec's §4
// "Required Sanity catalogue contract". Read-only. Run:
//
//   node scripts/catalogue/readiness-report.mjs            # human summary
//   node scripts/catalogue/readiness-report.mjs --json     # machine JSON
//   node scripts/catalogue/readiness-report.mjs --md > docs/estimator/catalogue-readiness.md
//
// The estimator degrades per-field (an absent performance value ⇒
// catalogue_data_incomplete, never "no constraint"), so this report is the
// running measure of how much of the compliance surface can be automated yet.
import { createClient } from "@sanity/client";

const projectId = process.env.SANITY_PROJECT_ID || "xjtrm1ex";
const dataset = process.env.SANITY_DATASET || "production";
const client = createClient({ projectId, dataset, apiVersion: "2024-01-01", useCdn: true });

// Estimator-critical fields per §4. `have` reads the CURRENT catalogue; the new
// structured fields (configuration/performanceVariant/dimensionRule/…) do not
// exist yet, so they report 0 until Phase 0 enrichment lands.
const QUERY = `*[_type == "product"]{
  "id": _id, "rev": _rev, name, "slug": slug.current,
  "family": family->slug.current, "category": category->slug.current,
  minWidth, maxWidth, minHeight, maxHeight,
  standardGlass, airTightness, waterTightness, windPressure,
  "optionCount": count(options),
  "hasConfiguration": defined(configuration),
  "hasPerformance": count(performanceVariants) > 0,
  "hasDimensionRule": defined(dimensionRule),
  "hasPricingRef": defined(pricingRef),
  "schemaVersion": schemaVersion
} | order(family asc, name asc)`;

const isReal = (p) => !!p.name && !!p.category; // orphan stubs have null name/category
const hasBounds = (p) => [p.minWidth, p.maxWidth, p.minHeight, p.maxHeight].every((v) => typeof v === "number");

function analyse(products) {
  const real = products.filter(isReal);
  const orphans = products.filter((p) => !isReal(p));
  const missing = (pred) => real.filter((p) => !pred(p));
  const fields = {
    dimensionBounds: { label: "Flat dimension bounds (min/max W/H)", missing: missing(hasBounds) },
    dimensionRule: { label: "Structured dimensionRule (area/aspect/panel + ruleVersion)", missing: missing((p) => p.hasDimensionRule) },
    configuration: { label: "Structured configuration (operation/panel/composite)", missing: missing((p) => p.hasConfiguration) },
    performance: { label: "Energy performanceVariant (U-value/SHGC)", missing: missing((p) => p.hasPerformance) },
    pricingRef: { label: "pricingRef (private D1 rate-card key)", missing: missing((p) => p.hasPricingRef) },
    schemaVersion: { label: "schemaVersion", missing: missing((p) => typeof p.schemaVersion === "number") },
  };
  return { total: products.length, real, orphans, fields };
}

function toMarkdown(a) {
  const pct = (n) => `${Math.round((n / a.real.length) * 100)}%`;
  const L = [];
  L.push("# Catalogue-readiness report — CPQ Estimator");
  L.push("");
  L.push(`_Generated ${new Date().toISOString().slice(0, 10)} from \`${projectId}/${dataset}\` (published perspective). Regenerate with \`node scripts/catalogue/readiness-report.mjs --md\`._`);
  L.push("");
  L.push(`- **${a.total}** published product documents — **${a.real.length} real**, **${a.orphans.length} orphan stubs** (published but empty; should be unpublished/deleted).`);
  L.push("");
  L.push("## Estimator-critical field coverage (real products only)");
  L.push("");
  L.push("| Field (spec §4) | Present | Missing | Coverage |");
  L.push("|---|--:|--:|--:|");
  for (const f of Object.values(a.fields)) {
    const present = a.real.length - f.missing.length;
    L.push(`| ${f.label} | ${present} | ${f.missing.length} | ${pct(present)} |`);
  }
  L.push("");
  L.push("## Orphan stubs (published, empty — recommend unpublish/delete)");
  L.push("");
  if (a.orphans.length) {
    for (const o of a.orphans) L.push(`- \`${o.id}\` (${o.family ?? "?"})`);
  } else L.push("_None._");
  L.push("");
  L.push("## Missing per field");
  L.push("");
  for (const f of Object.values(a.fields)) {
    if (!f.missing.length) continue;
    L.push(`### ${f.label} — ${f.missing.length} missing`);
    for (const p of f.missing) L.push(`- ${p.name} (\`${p.id}\`)`);
    L.push("");
  }
  return L.join("\n");
}

const products = await client.fetch(QUERY);
const a = analyse(products);
const mode = process.argv[2];
if (mode === "--json") {
  console.log(JSON.stringify({ total: a.total, real: a.real.length, orphans: a.orphans.map((o) => o.id),
    fields: Object.fromEntries(Object.entries(a.fields).map(([k, f]) => [k, { missing: f.missing.map((p) => p.id) }])) }, null, 2));
} else if (mode === "--md") {
  console.log(toMarkdown(a));
} else {
  console.log(`Catalogue: ${a.total} products (${a.real.length} real, ${a.orphans.length} orphan stubs)`);
  for (const f of Object.values(a.fields)) {
    console.log(`  ${f.missing.length === 0 ? "OK " : "GAP"} ${f.label}: ${a.real.length - f.missing.length}/${a.real.length}`);
  }
}
