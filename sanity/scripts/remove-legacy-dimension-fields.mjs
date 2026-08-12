// Remove the orphaned top-level minWidth/maxWidth/minHeight/maxHeight fields
// from `product` documents.
//
// These predate the 2026-07-31 "one size source" rationalisation, which moved
// dimensions onto dimensionRule.{minWidthMm, maxWidthMm, minHeightMm,
// maxHeightMm} — the schema was updated then, but the old field VALUES were
// never unset from the documents, so they've sat there as dead data since.
//
// Confirmed unread before running this:
//   - CATALOGUE_QUERY (src/data/catalogueQuery.ts) only ever projects
//     dimensionRule.*Mm — never the bare top-level fields.
//   - sanity/scripts/prefill-seo.mjs was the one real dependency (it built the
//     SEO size clause from p.maxWidth/p.maxHeight) — fixed in the same change
//     that added this script to read dimensionRule.maxWidthMm/maxHeightMm
//     instead, so nothing breaks once this runs.
//
//   npx sanity exec scripts/remove-legacy-dimension-fields.mjs --with-user-token          (dry run)
//   npx sanity exec scripts/remove-legacy-dimension-fields.mjs --with-user-token -- --write
import { getCliClient } from "sanity/cli";

const client = getCliClient({ apiVersion: "2024-01-01" });
const WRITE = process.argv.includes("--write");
const FIELDS = ["minWidth", "maxWidth", "minHeight", "maxHeight"];

async function main() {
  console.log(WRITE ? "── WRITING ──" : "── DRY RUN (pass -- --write to apply) ──");

  const products = await client.fetch(
    `*[_type=="product" && (defined(minWidth) || defined(maxWidth) || defined(minHeight) || defined(maxHeight))]{
      _id, name, minWidth, maxWidth, minHeight, maxHeight
    }`,
  );

  console.log(`\n${products.length} product(s) carrying legacy dimension fields:`);
  for (const p of products) {
    console.log(`   ${p.name.padEnd(42)} minWidth=${p.minWidth} maxWidth=${p.maxWidth} minHeight=${p.minHeight} maxHeight=${p.maxHeight}`);
  }

  if (WRITE && products.length) {
    let tx = client.transaction();
    for (const p of products) tx = tx.patch(p._id, (patch) => patch.unset(FIELDS));
    await tx.commit({ visibility: "sync" });
  }

  if (!WRITE) console.log("\nNothing was written. Re-run with `-- --write`.");
  else console.log(`\n✔ ${products.length} product(s) cleaned up.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
