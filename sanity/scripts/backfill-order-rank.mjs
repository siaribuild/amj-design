// One-time backfill: seed orderRank (the @sanity/orderable-document-list
// field — see sanity.config.ts / sanity/schemaTypes.ts) on every existing
// category, product, postCategory and option, so the app's queries can move
// from the old hand-typed order/featuredOrder fields to orderRank without a
// window where ordering is undefined for documents that predate the field.
//
// Preserves each document's CURRENT effective order — the same ordering the
// old fields already produced — rather than inventing a new one:
//   category:     order(coalesce(order, 999) asc, name asc)
//   product:      order(featuredOrder asc)
//   postCategory: order(coalesce(order, 999) asc, title asc)
//   option:       grouped by optionType, order(isDefault desc, name asc)
//                 within each group (the live colour-swatch sort — a
//                 reasonable starting arrangement even though nothing
//                 customer-facing reads option.orderRank)
//
// Idempotent: a document that already has orderRank is left alone, so a
// re-run only fills gaps (a category added after the first run, say).
//
//   npx sanity exec scripts/backfill-order-rank.mjs --with-user-token          (dry run)
//   npx sanity exec scripts/backfill-order-rank.mjs --with-user-token -- --write
import { getCliClient } from "sanity/cli";
import { ranksFor } from "./lib/rank.mjs";

const client = getCliClient({ apiVersion: "2024-01-01" });
const WRITE = process.argv.includes("--write");

/** Assigns ranks only to docs missing orderRank, in the order given. Docs
 *  that already have one are left untouched and don't consume a rank slot. */
function planRanks(docs) {
  const unranked = docs.filter((d) => !d.orderRank);
  const ranks = ranksFor(unranked.length);
  return unranked.map((d, i) => ({ id: d._id, label: d.name ?? d.title, rank: ranks[i] }));
}

async function main() {
  console.log(WRITE ? "── WRITING ──" : "── DRY RUN (pass -- --write to apply) ──");

  const patches = [];

  const categories = await client.fetch(
    `*[_type=="category"]|order(coalesce(order, 999) asc, name asc){ _id, name, orderRank }`,
  );
  patches.push(["category", ...planRanks(categories)]);

  const products = await client.fetch(
    `*[_type=="product"]|order(featuredOrder asc){ _id, name, orderRank }`,
  );
  patches.push(["product", ...planRanks(products)]);

  const postCategories = await client.fetch(
    `*[_type=="postCategory"]|order(coalesce(order, 999) asc, title asc){ _id, title, orderRank }`,
  );
  patches.push(["postCategory", ...planRanks(postCategories)]);

  // Options rank WITHIN their optionType — Colours and Hardware never contend
  // for the same ranks (see sanity.config.ts's per-type orderable list).
  const options = await client.fetch(
    `*[_type=="option"]|order(isDefault desc, name asc){ _id, name, orderRank, "optionTypeId": optionType._ref }`,
  );
  const byType = new Map();
  for (const o of options) {
    if (!byType.has(o.optionTypeId)) byType.set(o.optionTypeId, []);
    byType.get(o.optionTypeId).push(o);
  }
  const optionPatches = ["option"];
  for (const group of byType.values()) optionPatches.push(...planRanks(group));
  patches.push(optionPatches);

  let total = 0;
  for (const [type, ...items] of patches) {
    console.log(`\n${type}: ${items.length} document(s) to rank`);
    for (const item of items) console.log(`   ${item.label ?? item.id} → ${item.rank}`);
    total += items.length;
  }
  console.log(`\n${total} document(s) total.`);

  if (WRITE && total) {
    let tx = client.transaction();
    for (const [, ...items] of patches) {
      for (const item of items) tx = tx.patch(item.id, (patch) => patch.set({ orderRank: item.rank }));
    }
    // Sync, so a re-run (or the app's next fetch) reads what this one wrote
    // rather than a stale index.
    await tx.commit({ visibility: "sync" });
  }

  if (!WRITE) console.log("\nNothing was written. Re-run with `-- --write`.");
}

main().catch((error) => { console.error(error); process.exit(1); });
