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
    assert.match(catalogue.CATALOGUE_QUERY, /keySpecs\[\]\{label,value\}/);
    assert.match(catalogue.CATALOGUE_QUERY, /options\[\]\{typeSlug,typeName,name,availability,hex\}/);

    const normalized = catalogue.toCatalogueData({
      categories: [], families: [], colours: [{ name: "Test", hex: null, availability: "standard" }],
      products: [{ id: "p", slug: "p", name: null, options: null, gallery: null }],
    });
    assert.equal(normalized.products[0].name, "");
    assert.deepEqual(normalized.products[0].options, []);
    assert.deepEqual(normalized.products[0].gallery, []);
    assert.equal(normalized.colours[0].typeSlug, "colour");
    assert.equal(normalized.colours[0].hex, undefined);

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
