import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

// Site Settings → Default SEO fills gaps a page leaves blank. The precedence is
// page record → per-route values → site defaults, with two deliberate exceptions
// (canonical is page-only, robots are monotonic) that are the whole reason this
// resolver is a separate, tested module rather than inline in the component.
test("SEO resolution: page record, route values, then Site Settings defaults", async () => {
  const runDir = await makeRunDir("seo");
  try {
    const outfile = join(runDir, "seo-resolve.mjs");
    await build({
      stdin: {
        contents: `
          export { resolveSeo } from ${JSON.stringify(join(projectRoot, "src/data/seo.ts"))};
          export { buildJsonLd, buildRecordNode, buildBreadcrumbs } from ${JSON.stringify(join(projectRoot, "src/data/schemaOrg.ts"))};
        `,
        resolveDir: projectRoot,
        sourcefile: "seo-entry.ts",
        loader: "ts",
      },
      bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent", sourcemap: "inline",
    });
    const mod = await import(pathToFileURL(outfile).href);
    const { resolveSeo } = mod;

    const route = { title: "Contact — OpenFrame", description: "Route copy", image: "https://cdn/hero.jpg" };
    const site = {
      metaTitle: "Site title", metaDescription: "Site description",
      keywords: ["site", "default"], canonicalUrl: "https://example.com/",
      noIndex: false, noFollow: false,
      openGraph: { title: "Site OG", description: "Site OG desc", image: { url: "https://cdn/site-og.jpg" } },
      twitter: { card: "summary", title: "Site TW", image: { url: "https://cdn/site-tw.jpg" } },
    };

    // 1. Nothing on the page: site defaults fill in, but the ROUTE's own title
    //    and description still win — they describe this page, the defaults don't.
    const filled = resolveSeo(undefined, site, route);
    assert.equal(filled.title, "Contact — OpenFrame");
    assert.equal(filled.description, "Route copy");
    assert.equal(filled.keywords, "site, default");
    assert.equal(filled.ogTitle, "Site OG");
    assert.match(filled.ogImage, /^https:\/\/cdn\/hero\.jpg/);   // route hero beats the site share image
    assert.match(filled.twImage, /^https:\/\/cdn\/site-tw\.jpg/);
    assert.equal(filled.twCard, "summary");

    // 2. Site defaults apply where the route has nothing at all.
    const bare = resolveSeo(undefined, site, { title: "" });
    assert.equal(bare.title, "Site title");
    assert.equal(bare.description, "Site description");
    assert.match(bare.ogImage, /^https:\/\/cdn\/site-og\.jpg/);

    // 3. The page record beats both, field by field — an unset field still falls
    //    through to the site default rather than to nothing.
    const page = { metaTitle: "Page title", twitter: { card: "summary_large_image" } };
    const overridden = resolveSeo(page, site, route);
    assert.equal(overridden.title, "Page title");
    assert.equal(overridden.twCard, "summary_large_image");
    assert.equal(overridden.ogTitle, "Site OG");                 // page left OG blank

    // 4. Canonical is PAGE-ONLY. A site-wide canonical would point every page at
    //    one URL and de-index the rest, so the site value is ignored outright.
    assert.equal(filled.canonical, "");
    assert.equal(resolveSeo({ canonicalUrl: "https://example.com/contact" }, site, route).canonical,
      "https://example.com/contact");

    // 5. Robots are MONOTONIC — the regression that matters. Both schema fields
    //    default to false, so a `??` chain would let an untouched record LIFT the
    //    noindex the app sets on its private pages.
    const priv = { title: "My Project", noIndex: true };
    assert.equal(resolveSeo(undefined, site, priv).robots, "noindex");        // site false can't lift it
    assert.equal(resolveSeo({ noIndex: false }, site, priv).robots, "noindex"); // nor can a page false
    assert.equal(resolveSeo(undefined, undefined, priv).robots, "noindex");    // nor an absent site record
    // …but either level can still ADD one.
    assert.equal(resolveSeo(undefined, { ...site, noIndex: true }, route).robots, "noindex");
    assert.equal(resolveSeo({ noFollow: true }, site, route).robots, "nofollow");
    assert.equal(resolveSeo(undefined, site, route).robots, "");               // public page stays indexable

    // 6. Advanced robots: the negative switches are monotonic like noindex, but
    //    the max-* directives LOOSEN, so they take the ordinary fallback. 0/-1
    //    are meaningful values and must survive a falsy check.
    const adv = resolveSeo(
      { advanced: { noArchive: true, maxSnippet: -1 } },
      { ...site, advanced: { noSnippet: true, maxImagePreview: "large", maxVideoPreview: 0 } },
      route,
    );
    assert.match(adv.robots, /noarchive/);
    assert.match(adv.robots, /nosnippet/);                      // added by the SITE level
    assert.match(adv.robots, /max-snippet:-1/);
    assert.match(adv.robots, /max-image-preview:large/);
    assert.match(adv.robots, /max-video-preview:0/);
    assert.equal(resolveSeo({ advanced: { noArchive: false } }, { ...site, advanced: { noArchive: true } }, route)
      .robots, "noarchive");                                     // a page false can't lift it

    // 7. Additional meta MERGE by name — site-level verification tokens must
    //    survive onto pages that add their own tags.
    const merged = resolveSeo(
      { advanced: { additionalMeta: [{ name: "robots-extra", content: "page" }] } },
      { ...site, advanced: { additionalMeta: [
        { name: "google-site-verification", content: "token" },
        { name: "robots-extra", content: "site" },
      ] } },
      route,
    ).additionalMeta;
    assert.equal(merged.length, 2);
    assert.equal(merged.find((m) => m.name === "google-site-verification").content, "token");
    assert.equal(merged.find((m) => m.name === "robots-extra").content, "page"); // page wins by name

    // 8. Site identity: og:site_name and the brand handle are site-wide; the
    //    creator names THIS record's author and has no site-level default.
    const ident = resolveSeo({ twitter: { creator: "@jane" } }, site, route,
      { siteName: "OpenFrame", twitterSite: "@openframe" });
    assert.equal(ident.ogSiteName, "OpenFrame");
    assert.equal(ident.twSite, "@openframe");
    assert.equal(ident.twCreator, "@jane");
    assert.equal(resolveSeo(undefined, site, route, { siteName: "OpenFrame" }).twCreator, "");
  } finally {
    if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir);
  }
});

// Structured data is GENERATED from the record, so the tests here pin the two
// things that would be expensive to get wrong: the private-pricing boundary and
// the kind→type mapping that a future `post` record type will rely on.
test("schema.org JSON-LD graph", async () => {
  const runDir = await makeRunDir("schema-org");
  try {
    const outfile = join(runDir, "schema-org.mjs");
    await build({
      stdin: {
        contents: `export * from ${JSON.stringify(join(projectRoot, "src/data/schemaOrg.ts"))};`,
        resolveDir: projectRoot, sourcefile: "schema-entry.ts", loader: "ts",
      },
      bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent", sourcemap: "inline",
    });
    const { buildJsonLd, buildRecordNode, buildBreadcrumbs } = await import(pathToFileURL(outfile).href);

    const org = {
      name: "OpenFrame", url: "https://openframe.com.au", logoUrl: "https://cdn/logo.png",
      email: "quotes@openframe.com.au", phone: "1300 000 000",
      sameAs: ["https://linkedin.com/company/openframe"], type: "LocalBusiness",
    };

    // Kind → @type, which is the seam a future `post` record plugs into.
    assert.equal(buildRecordNode({ kind: "page", url: "https://x/", name: "Contact" })["@type"], "WebPage");
    assert.equal(buildRecordNode({ kind: "product", url: "https://x/p", name: "P" })["@type"], "Product");
    assert.equal(buildRecordNode({ kind: "post", url: "https://x/b", name: "B" })["@type"], "Article");
    // An explicit choice on the record overrides the default; "auto" does not.
    assert.equal(buildRecordNode({ kind: "page", url: "https://x/", name: "C" }, "ContactPage")["@type"], "ContactPage");
    assert.equal(buildRecordNode({ kind: "page", url: "https://x/", name: "C" }, "auto")["@type"], "WebPage");

    // Pricing lives in private D1 and must NEVER reach public structured data —
    // an `offers` key here would leak it straight into search results.
    const product = buildRecordNode({
      kind: "product", url: "https://x/p", name: "Awning Window",
      description: "d", image: "https://cdn/p.jpg", sku: "awning", brand: "OpenFrame",
    });
    assert.equal(product.offers, undefined);
    assert.equal(product.price, undefined);
    assert.deepEqual(product.brand, { "@type": "Brand", name: "OpenFrame" });

    // A trail needs at least two crumbs to mean anything.
    assert.equal(buildBreadcrumbs([{ name: "Products", url: "https://x/products" }]), null);
    const crumbs = buildBreadcrumbs([
      { name: "Products", url: "https://x/products" },
      { name: "Awning", url: "https://x/products/awning" },
    ]);
    assert.equal(crumbs.itemListElement[1].position, 2);

    // The full graph: organisation + website + the record, cross-referenced.
    const graph = buildJsonLd({
      org, facts: { kind: "page", url: "https://x/contact", name: "Contact" },
      breadcrumbs: [{ name: "Home", url: "https://x/" }, { name: "Contact", url: "https://x/contact" }],
    });
    assert.equal(graph["@context"], "https://schema.org");
    const types = graph["@graph"].map((n) => n["@type"]);
    assert.deepEqual(types, ["LocalBusiness", "WebSite", "WebPage", "BreadcrumbList"]);
    assert.deepEqual(graph["@graph"][0].sameAs, ["https://linkedin.com/company/openframe"]);
    assert.equal(graph["@graph"][2].isPartOf["@id"], "#website");

    // A record can suppress its OWN node; the business identity still stands.
    const excluded = buildJsonLd({
      org, facts: { kind: "page", url: "https://x/c", name: "C" }, seo: { schema: { exclude: true } },
    });
    assert.deepEqual(excluded["@graph"].map((n) => n["@type"]), ["LocalBusiness", "WebSite"]);

    // No Business Name in Sanity ⇒ emit nothing rather than invent an identity.
    assert.equal(buildJsonLd({ org: {}, facts: null }), null);
  } finally {
    if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir);
  }
});

// A product withdrawn from sale leaves the site — and must leave the sitemap with
// it. Left in, the sitemap keeps inviting Google to crawl a URL the catalogue no
// longer serves, which is the one place a "hidden" product stays advertised.
test("the sitemap lists sellable products only, and keeps ones with no flag", async () => {
  const runDir = await makeRunDir("sitemap-disabled");
  try {
    const outfile = join(runDir, "sitemap.mjs");
    await build({
      stdin: {
        contents: `
          export { buildSitemap } from ${JSON.stringify(join(projectRoot, "worker/lib/shell.ts"))};
          export { hydrateCatalogue } from ${JSON.stringify(join(projectRoot, "src/data/catalogue.ts"))};
        `,
        resolveDir: projectRoot, sourcefile: "sitemap-entry.ts", loader: "ts",
      },
      bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
    });
    const { buildSitemap, hydrateCatalogue } = await import(pathToFileURL(outfile).href);

    const product = (slug, over = {}) => ({
      id: slug, slug, name: slug, familySlug: "f", categorySlug: "windows",
      shortDescription: "", descriptionParagraphs: [], standardGlass: "",
      minWidth: null, minHeight: null, maxWidth: null, maxHeight: null,
      notes: "", heroImage: "", gallery: [], keySpecs: [], specs: [], options: [],
      ...over,
    });
    hydrateCatalogue({
      products: [product("sellable"), product("withdrawn", { disabled: true }), product("untagged")],
      colours: [],
    });

    // No SANITY_PROJECT_ID, so siteMeta short-circuits and nothing is fetched.
    const xml = await (await buildSitemap({}, "https://example.test")).text();
    assert.ok(xml.includes("https://example.test/products/sellable"), "a sellable product is listed");
    assert.ok(xml.includes("https://example.test/products/untagged"),
      "so is one with no flag at all — absent means available");
    assert.ok(!xml.includes("https://example.test/products/withdrawn"),
      "a withdrawn product is not advertised to crawlers");
  } finally {
    if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir);
  }
});
