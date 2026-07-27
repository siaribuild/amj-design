import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

test("catalogue query normalization and runtime hydration", async () => {
  const runDir = await makeRunDir("catalogue");
  try {
    const outfile = join(runDir, "catalogue-regression.mjs");
    await build({
      stdin: {
        contents: `
          export { CATALOGUE_QUERY, toCatalogueData } from ${JSON.stringify(join(projectRoot, "src/data/catalogueQuery.ts"))};
          export * from ${JSON.stringify(join(projectRoot, "src/data/catalogue.ts"))};
        `,
        resolveDir: projectRoot,
        sourcefile: "catalogue-regression-entry.ts",
        loader: "ts",
      },
      bundle: true,
      format: "esm",
      platform: "node",
      outfile,
      logLevel: "silent",
      sourcemap: "inline",
    });
    const catalogue = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);

    assert.match(catalogue.CATALOGUE_QUERY, /category->slug\.current/);
    assert.match(catalogue.CATALOGUE_QUERY, /family->slug\.current/);
    assert.match(catalogue.CATALOGUE_QUERY, /keySpecs\[\]\{_key,label,value\}/);
    // Options are dereferenced from the shared `option` documents (single source of
    // truth): name/price/type live on the option, not copied onto the product.
    assert.match(catalogue.CATALOGUE_QUERY, /option->optionType->slug\.current/);
    // Option PRICES must NOT be published. D1 owns what an option costs; Sanity
    // maps which options a product offers and which is standard. This query is
    // served to every browser, so a price in it is a published price list.
    assert.doesNotMatch(catalogue.CATALOGUE_QUERY, /pricingComponent/,
      "the public catalogue query must never expose option pricing");
    // Colours come from the "applies to all" option type; images resolve to asset
    // url + focal point for on-demand sizing.
    assert.match(catalogue.CATALOGUE_QUERY, /optionType->appliesToAll==true/);
    assert.match(catalogue.CATALOGUE_QUERY, /"heroImage": heroImage\{/);
    assert.match(catalogue.CATALOGUE_QUERY, /"url": asset->url/);

    const normalized = catalogue.toCatalogueData({
      categories: [], families: [], colours: [{ name: "Test", hex: null, availability: "standard" }],
      products: [{ id: "p", slug: "p", name: null, options: null, gallery: null }],
    });
    assert.equal(normalized.products[0].name, "");
    assert.deepEqual(normalized.products[0].options, []);
    assert.deepEqual(normalized.products[0].gallery, []);
    assert.equal(normalized.colours[0].typeSlug, "colour");
    assert.equal(normalized.colours[0].hex, undefined);

    // Dereferenced options carry their shared price; dangling refs are dropped.
    const withOpts = catalogue.toCatalogueData({
      categories: [], families: [], colours: [],
      products: [{
        id: "q", slug: "q", name: "Q",
        options: [
          { typeSlug: "hardware", typeName: "Hardware", name: "Handle A", availability: "standard", price: 120 },
          { typeSlug: null, name: null, availability: "optional" },
        ],
      }],
    });
    assert.equal(withOpts.products[0].options.length, 1);
    assert.equal(withOpts.products[0].options[0].price, 120);

    // Sanity image projections normalize to {url, hotspot}; missing assets drop out.
    const withImg = catalogue.toCatalogueData({
      categories: [], families: [], colours: [],
      products: [{
        id: "i", slug: "i", name: "I",
        heroImage: { url: "https://cdn/x.jpg", hotspot: { x: 0.25, y: 0.75 } },
        gallery: [{ url: "https://cdn/g.jpg" }, { url: null }],
      }],
    });
    assert.deepEqual(withImg.products[0].heroImage, { url: "https://cdn/x.jpg", hotspot: { x: 0.25, y: 0.75 } });
    assert.equal(withImg.products[0].gallery.length, 1);
    // imageUrl: strings pass through; Sanity images get sizing + focal point.
    assert.equal(catalogue.imageUrl("https://plain/u.jpg", { w: 100 }), "https://plain/u.jpg");
    const built = catalogue.imageUrl(withImg.products[0].heroImage, { w: 800, h: 600 });
    assert.match(built, /^https:\/\/cdn\/x\.jpg\?/);
    assert.match(built, /w=800/); assert.match(built, /fit=crop/);
    assert.match(built, /crop=focalpoint/); assert.match(built, /fp-x=0\.25/);

    // Page slugs are the join key to a rendered page. The Studio rejects a
    // duplicate at authoring time; this is the runtime half — records arrive
    // newest-first, so the first record for a slug wins and the rest are
    // dropped rather than silently shadowing it in query order.
    assert.match(catalogue.CATALOGUE_QUERY, /\*\[_type=="page"\]\|order\(_updatedAt desc\)/);
    const warnings = [];
    const realWarn = console.warn;
    console.warn = (...a) => warnings.push(a.join(" "));
    let dupPages;
    try {
      dupPages = catalogue.toCatalogueData({
        categories: [], families: [], colours: [], products: [],
        pages: [
          { pageId: "contact", seo: { metaTitle: "Newest" } },
          { pageId: "contact", seo: { metaTitle: "Older" } },
          { pageId: "home", seo: { metaTitle: "Home" } },
          { pageId: null },
        ],
      });
    } finally { console.warn = realWarn; }
    assert.equal(dupPages.pages.length, 2);                       // "contact" collapsed, null dropped
    assert.equal(dupPages.pages[0].pageId, "contact");
    assert.equal(dupPages.pages[0].seo?.metaTitle, "Newest");     // most recently edited wins
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /duplicate page slug\(s\): contact/);

    const replacement = {
      id: "regression-product", slug: "regression-product", name: "Regression Product",
      familySlug: "regression-family", categorySlug: "regression-category",
      shortDescription: "", descriptionParagraphs: [], standardGlass: "", hardware: "",
      minWidth: null, minHeight: null, maxWidth: null, maxHeight: null,
      profileThickness: "", airTightness: "", waterTightness: "", windPressure: "",
      notes: "", heroImage: "", gallery: [], keySpecs: [], specs: [], options: [], featuredOrder: 0,
    };
    catalogue.hydrateCatalogue({ products: [replacement], colours: normalized.colours });
    assert.equal(catalogue.getProductBySlug("regression-product")?.name, "Regression Product");
    assert.equal(catalogue.products.length, 1);
    assert.equal(catalogue.colorbondColourOptions[0].name, "Test");
  } finally {
    if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir);
  }
});
