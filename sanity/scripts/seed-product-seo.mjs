// Set starter SEO on every product that doesn't have it yet — surgical (only the
// seo field), so hero images / hotspots / options are untouched. Run with the
// CLI's own auth:
//   npx sanity exec scripts/seed-product-seo.mjs --with-user-token
import { getCliClient } from "sanity/cli";

const client = getCliClient({ apiVersion: "2024-01-01" });
const clip = (s, n) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);

const products = await client.fetch(`*[_type=="product" && !defined(seo)]{ _id, name, shortDescription }`);
if (!products.length) {
  console.log("All products already have SEO — nothing to do.");
} else {
  let tx = client.transaction();
  for (const p of products) {
    tx = tx.patch(p._id, (patch) =>
      patch.set({
        seo: {
          _type: "seoMeta",
          metaTitle: `${p.name} | OpenFrame`,
          metaDescription: clip(p.shortDescription, 160),
        },
      }),
    );
  }
  await tx.commit();
  console.log(`Set starter SEO on ${products.length} products.`);
}
