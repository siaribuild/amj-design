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
        contents: `export { resolveSeo } from ${JSON.stringify(join(projectRoot, "src/data/seo.ts"))};`,
        resolveDir: projectRoot,
        sourcefile: "seo-entry.ts",
        loader: "ts",
      },
      bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent", sourcemap: "inline",
    });
    const { resolveSeo } = await import(pathToFileURL(outfile).href);

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
  } finally {
    if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir);
  }
});
