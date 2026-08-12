// One-off: regenerate SEO across every page and product.
//
//   npx sanity exec scripts/prefill-seo.mjs --with-user-token          (dry run)
//   npx sanity exec scripts/prefill-seo.mjs --with-user-token -- --write
//
// Copy is composed from each record's OWN fields (family, max size, glazing,
// wind rating), so every description carries real, distinct information rather
// than a template with the name swapped in.
//
// Deliberately NOT set:
//   • images — they inherit from Site Settings → Default SEO.
//   • twitter title/description — resolveSeo already falls back OG → base meta.
//     Duplicating them here would create two copies to keep in sync, and the
//     pair would silently diverge the first time someone edited only one.
//   • schema.schemaType — "auto" already resolves page→WebPage, product→Product.
import { getCliClient } from "sanity/cli";

const client = getCliClient({ apiVersion: "2024-01-01" });
const WRITE = process.argv.includes("--write");
const BRAND = "OpenFrame";

const clean = (s) => (s ?? "").trim().replace(/\s+/g, " ").replace(/\.$/, "");
const spec = (specs, label) => (specs ?? []).find((s) => s?.label === label)?.value ?? null;

/** Meta title: add the glazing differentiator only while it stays under 60. */
function productTitle(name, glazing) {
  const withGlazing = `${name} — ${glazing} | ${BRAND}`;
  return glazing && withGlazing.length <= 60 ? withGlazing : `${name} | ${BRAND}`;
}

/** Build up to ~160 chars, adding clauses only while they still fit. */
function productDescription(p) {
  const glazing = spec(p.specs, "Glazing");
  const wind = spec(p.specs, "Wind rating");
  const maxWidth = p.dimensionRule?.maxWidthMm;
  const maxHeight = p.dimensionRule?.maxHeightMm;
  const size = maxWidth && maxHeight ? `${maxWidth} × ${maxHeight} mm` : null;

  let out = clean(p.shortDescription) + ".";

  // Build the spec sentence as a list joined with ", " — a per-clause separator
  // would leave a dangling comma whenever an earlier clause didn't fit.
  const parts = [
    size ? `aluminium ${(p.family ?? "system").toLowerCase()} to ${size}` : null,
    glazing ? `${glazing.toLowerCase()} as standard` : null,
    wind ? `rated ${wind}` : null,
  ].filter(Boolean);

  // Specs get the whole budget; the sign-off is added only with what's left.
  // The size and rating are what make one description different from the next,
  // while "Supply-only from OpenFrame" is identical on all 27 — so when only one
  // fits, the facts win.
  let sentence = "";
  for (const part of parts) {
    const next = sentence ? `${sentence}, ${part}` : part;
    if (`${out} ${next}.`.length > 158) break;
    sentence = next;
  }
  if (sentence) out += ` ${sentence[0].toUpperCase()}${sentence.slice(1)}.`;

  const tail = ` Supply-only from ${BRAND}.`;
  if ((out + tail).length <= 160) out += tail;
  return out;
}

function productKeywords(p) {
  const series = (p.name ?? "").split(/\s+/)[0];
  const glazing = spec(p.specs, "Glazing");
  return [
    (p.family ?? "").toLowerCase(),
    `aluminium ${(p.family ?? "").toLowerCase()}`,
    `aluminium ${(p.category ?? "").toLowerCase()}`,
    series ? `${series} series` : null,
    glazing ? glazing.toLowerCase() : null,
    "supply only",
  ].filter((k) => k && k.trim() && !k.endsWith(" ")).map((k) => k.trim());
}

// The five real site pages. Hand-written: there are only five, they carry the
// most search weight, and no formula beats knowing what the page is for.
const PAGES = {
  "page-home": {
    metaTitle: `Aluminium Windows & Doors, Supply-Only | ${BRAND}`,
    metaDescription:
      "Price aluminium windows and doors online in minutes. Upload a schedule or plans, get a reviewed quote from our team, and track the order through to delivery.",
    keywords: ["aluminium windows", "aluminium doors", "supply only windows", "window and door quotes", "double glazed windows", "window schedule pricing"],
    ogTitle: "Aluminium windows and doors, priced online",
    ogDescription: "Upload your schedule or plans and get a reviewed, itemised quote — supply-only, with no deposit until you approve it.",
  },
  "page-products": {
    metaTitle: `Aluminium Window & Door Systems | ${BRAND}`,
    metaDescription:
      "Browse awning, casement, sliding, louvre, tilt-turn, bi-fold, pivot and lift-slide systems — with sizes, glazing and wind ratings for every product.",
    keywords: ["aluminium window systems", "aluminium door systems", "awning windows", "sliding doors", "casement windows", "bi-fold doors", "double glazed systems"],
    ogTitle: "Window and door systems",
    ogDescription: "Every system with its real size limits, standard glazing and wind rating — so you can specify before you request a price.",
  },
  "page-how-it-works": {
    metaTitle: `How It Works — Quote to Delivery | ${BRAND}`,
    metaDescription:
      "From an online estimate to a reviewed quote, deposit, shop-drawing sign-off, manufacture and delivery — every step of an order, and what we need from you.",
    keywords: ["window ordering process", "how to order windows", "window quote process", "shop drawings", "supply only process"],
    ogTitle: "How an order works, step by step",
    ogDescription: "Estimate, human review, approval, manufacture, delivery — and exactly what happens at each stage.",
  },
  "page-contact": {
    metaTitle: `Contact ${BRAND} — Aluminium Windows & Doors`,
    metaDescription:
      "Ask a question, request an appointment at a showroom, or send a project through for pricing. Our team replies within one to two business days.",
    keywords: ["contact", "window supplier enquiry", "showroom appointment", "aluminium window quotes"],
    ogTitle: `Contact ${BRAND}`,
    ogDescription: "Send an enquiry or book a showroom appointment — we reply within one to two business days.",
  },
  "page-privacy": {
    metaTitle: `Privacy Policy | ${BRAND}`,
    metaDescription:
      `How ${BRAND} collects, uses, stores and protects your information when you build quotes, place and track orders, or contact us through this website.`,
    keywords: ["privacy policy", "data protection"],
    ogTitle: `Privacy Policy | ${BRAND}`,
    ogDescription: "How we collect, use, store and protect your information.",
  },
};

async function main() {
  const products = await client.fetch(`*[_type=="product" && defined(name)]|order(name asc){
    _id, name, "family": family->name, "category": category->name, shortDescription,
    "dimensionRule": dimensionRule{maxWidthMm, maxHeightMm}, "specs": keySpecs[]{label,value}
  }`);
  const pageIds = await client.fetch(`*[_type=="page"]._id`);

  const tx = client.transaction();
  let n = 0;

  for (const p of products) {
    const glazing = spec(p.specs, "Glazing");
    const seo = {
      metaTitle: productTitle(p.name, glazing),
      metaDescription: productDescription(p),
      keywords: productKeywords(p),
      openGraph: {
        title: p.name,
        description: `${clean(p.shortDescription)}. Supply-only, quoted online.`,
      },
    };
    console.log(`\n${p._id}`);
    console.log(`  title (${seo.metaTitle.length})  ${seo.metaTitle}`);
    console.log(`  desc  (${seo.metaDescription.length})  ${seo.metaDescription}`);
    console.log(`  keys        ${seo.keywords.join(" · ")}`);
    tx.patch(p._id, (patch) => patch.set({
      "seo.metaTitle": seo.metaTitle,
      "seo.metaDescription": seo.metaDescription,
      "seo.keywords": seo.keywords,
      "seo.openGraph.title": seo.openGraph.title,
      "seo.openGraph.description": seo.openGraph.description,
    }));
    n++;
  }

  for (const [id, c] of Object.entries(PAGES)) {
    if (!pageIds.includes(id)) { console.log(`\n! ${id} not found — skipped`); continue; }
    console.log(`\n${id}`);
    console.log(`  title (${c.metaTitle.length})  ${c.metaTitle}`);
    console.log(`  desc  (${c.metaDescription.length})  ${c.metaDescription}`);
    console.log(`  keys        ${c.keywords.join(" · ")}`);
    tx.patch(id, (patch) => patch.set({
      "seo.metaTitle": c.metaTitle,
      "seo.metaDescription": c.metaDescription,
      "seo.keywords": c.keywords,
      "seo.openGraph.title": c.ogTitle,
      "seo.openGraph.description": c.ogDescription,
    }));
    n++;
  }

  // The second record claiming "home" — an empty page created by mistake. Given
  // its own slug so the uniqueness rule holds and page-home is unambiguous.
  const dupe = "21ed7f49-9969-41b5-8619-b207ee3f656c";
  if (pageIds.includes(dupe)) {
    console.log(`\n${dupe}\n  pageId  home -> quote  (resolves the duplicate slug)`);
    tx.patch(dupe, (patch) => patch.set({ pageId: "quote" }));
    n++;
  }

  if (!WRITE) { console.log(`\n— DRY RUN — ${n} documents would be updated. Re-run with -- --write`); return; }
  await tx.commit({ visibility: "async" });
  console.log(`\n✔ ${n} documents updated`);
}

main().catch((e) => { console.error(e); process.exit(1); });
