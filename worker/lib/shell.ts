// Server-rendered <head> and sitemap.
//
// WHY THIS EXISTS: the SPA injects its meta tags with JavaScript. Google renders
// JS and copes, but the social scrapers do not — Facebook, LinkedIn, Slack,
// X and iMessage fetch the raw HTML once and read what is there. Until now that
// was a shell titled "OpenFrame Website" with a stale description, so every
// shared link previewed as nothing.
//
// So the Worker rewrites the head on the way out, from the SAME Sanity content
// the client would use. The client still injects on navigation; this only has to
// be right for the FIRST response, which is all a scraper ever sees.
import type { Env } from "../types";
import { getPage, getProductBySlug, getPostBySlug, products, posts, imageUrl } from "../../src/data/catalogue";
import { routeFromPathname } from "../../src/app/routes";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface SiteMeta { businessName: string | null; ogSiteName: string | null; twitterSite: string | null }

/** Site Settings, fetched server-side. Never throws and never invents a brand:
 *  with nothing configured the head simply carries less, rather than a placeholder. */
async function siteMeta(env: Env): Promise<SiteMeta> {
  if (!env.SANITY_PROJECT_ID) return { businessName: null, ogSiteName: null, twitterSite: null };
  const query = encodeURIComponent(`*[_type=="siteSettings"][0]{businessName, ogSiteName, twitterSite}`);
  try {
    const res = await fetch(`https://${env.SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${env.SANITY_DATASET || "production"}?query=${query}`);
    const { result } = await res.json<{ result?: SiteMeta }>();
    return {
      businessName: result?.businessName ?? null,
      ogSiteName: result?.ogSiteName ?? null,
      twitterSite: result?.twitterSite ?? null,
    };
  } catch {
    return { businessName: null, ogSiteName: null, twitterSite: null };
  }
}

/** The routes a crawler should see. Mirrors the marketing map in App.tsx —
 *  app/transactional routes are deliberately absent, exactly as they are noindex
 *  in the client. */
const PUBLIC_PAGES = ["", "products", "how-it-works", "contact", "privacy", "quote", "resources", "trade-account"];

export async function buildSitemap(env: Env, origin: string): Promise<Response> {
  const meta = await siteMeta(env);   // warms nothing, but keeps failure handling in one place
  void meta;
  const urls = [
    ...PUBLIC_PAGES.map((p) => ({ loc: `${origin}/${p}`, priority: p === "" ? "1.0" : "0.7" })),
    ...products.filter((p) => p.slug).map((p) => ({ loc: `${origin}/products/${p.slug}`, priority: "0.6" })),
    // Posts are indexable content in their own right — each is an article at a
    // stable URL, and several of them exist to be FOUND (a certifier searching a
    // standard reference lands on the article, not on the product).
    ...posts.filter((p) => p.slug).map((p) => ({ loc: `${origin}/resources/${p.slug}`, priority: "0.5" })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><priority>${u.priority}</priority></url>`).join("\n")}
</urlset>
`;
  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}

export function buildRobots(origin: string, indexable: boolean): Response {
  // When the site is not indexable the file says so plainly rather than being
  // absent — an absent robots.txt means "crawl everything".
  const body = indexable
    ? `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`
    : `User-agent: *\nDisallow: /\n`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}

/** Rewrite the shell's <head> for THIS url, so a scraper's single fetch sees the
 *  real title, description and share image. */
export async function renderShell(env: Env, shellHtml: string, url: URL): Promise<string> {
  const meta = await siteMeta(env);
  const brand = meta.businessName?.trim() || null;
  const suffix = brand ? ` — ${brand}` : "";
  const route = routeFromPathname(url.pathname);

  let title = brand ?? "Aluminium Windows & Doors";
  let description = "";
  let image = "";

  if (route.page === "product-detail") {
    const p = getProductBySlug(route.productSlug ?? "");
    if (p) {
      title = `${p.name}${suffix}`;
      description = p.shortDescription || "";
      image = imageUrl(p.heroImage, { w: 1200, h: 630 }) || "";
    }
  } else if (route.page === "post") {
    // A shared post link previewed as the generic site card before this: the
    // branch below would have looked up a `post` page record that cannot exist.
    const p = getPostBySlug(route.postSlug ?? "");
    if (p) {
      // A post titled "About OpenFrame" must not become "About OpenFrame — OpenFrame".
      title = p.seo?.metaTitle || (brand && p.title.includes(brand) ? p.title : `${p.title}${suffix}`);
      description = p.seo?.metaDescription || p.summary || "";
      image = imageUrl(p.seo?.openGraph?.image, { w: 1200, h: 630 }) || imageUrl(p.heroImage, { w: 1200, h: 630 }) || "";
    }
  } else {
    const pageId = route.page === "home" ? "home" : route.page;
    const pg = getPage(pageId);
    const named: Record<string, string> = {
      home: brand ? `${brand} — Aluminium Windows & Doors` : "Aluminium Windows & Doors",
      products: `Aluminium Window & Door Systems${suffix}`,
      "how-it-works": `How It Works — Quote to Delivery${suffix}`,
      contact: `Contact${suffix}`,
      privacy: `Privacy Policy${suffix}`,
      // Absent before, so /resources served a crawler the bare business name
      // while the client set "Resources — <brand>". Same page, two titles.
      resources: `Resources${suffix}`,
    };
    title = pg?.seo?.metaTitle || named[pageId] || title;
    description = pg?.seo?.metaDescription || "";
    image = imageUrl(pg?.seo?.openGraph?.image, { w: 1200, h: 630 }) || imageUrl(pg?.heroImage, { w: 1200, h: 630 }) || "";
  }

  const siteName = meta.ogSiteName?.trim() || brand;

  // ONE canonical form, computed once and used for both canonical and og:url.
  //
  // og:url used to echo url.pathname verbatim, so /products/ published
  // og:url=/products/ while /products published /products — the same page
  // advertising two identities. The Worker now 301s the slash form, but a
  // scraper that already holds the old URL, or an inbound link carrying one,
  // still has to be told which is authoritative.
  //
  // And there was NO canonical link in this head at all. The client sets one
  // only when a Sanity page carries an explicit canonicalUrl, which is almost
  // never — so for a crawler that does not run JS, most pages declared nothing.
  const canonicalPath = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : "/";
  const canonical = url.origin + canonicalPath;

  const tags = [
    `<title>${esc(title)}</title>`,
    description ? `<meta name="description" content="${esc(description)}" />` : "",
    // data-seo="1" hands ownership to the client: Seo.tsx updates this same tag
    // on navigation instead of leaving the entry URL's canonical behind, and
    // there is never a second one.
    `<link rel="canonical" data-seo="1" href="${esc(canonical)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    description ? `<meta property="og:description" content="${esc(description)}" />` : "",
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    siteName ? `<meta property="og:site_name" content="${esc(siteName)}" />` : "",
    image ? `<meta property="og:image" content="${esc(image)}" />` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`,
    meta.twitterSite ? `<meta name="twitter:site" content="${esc(meta.twitterSite)}" />` : "",
    image ? `<meta name="twitter:image" content="${esc(image)}" />` : "",
  ].filter(Boolean).join("\n      ");

  // Replace the shell's placeholder title + description outright, so the values a
  // scraper reads are never the build-time defaults.
  return shellHtml
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<meta\s+name="description"[^>]*>/, "")
    .replace("</head>", `  ${tags}\n    </head>`);
}
