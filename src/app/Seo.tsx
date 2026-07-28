// Dependency-free <head> manager for the SPA. Renders a page's/product's SEO +
// Open Graph + X/Twitter tags on navigation, with graceful fallbacks (OG/Twitter
// inherit the meta title/description/image, and anything still blank falls back
// to Site Settings → Default SEO). Tags it manages carry data-seo="1".
//
// Indexability lives in two places and nowhere else:
//   • /robots.txt — Allow when APP_ENV is production, Disallow otherwise
//     (worker/index.ts → buildRobots). This is the site-wide switch.
//   • the per-page `robots` value resolved here, which marks the account and
//     transactional routes noindex.
// index.html's global "noindex, nofollow" is long gone — it used to override
// every per-page value, so the whole site was invisible regardless of what any
// page said. Do not reintroduce a blanket robots meta in the shell.
import { useEffect } from "react";
import { type SeoMeta } from "../data/catalogue";
import { getSiteSeo, getSiteIdentity, getOrgIdentity } from "../data/sanity";
import { resolveSeo } from "../data/seo";
import { buildJsonLd, type Breadcrumb, type RecordFacts } from "../data/schemaOrg";

function setMeta(attr: "name" | "property", key: string, content: string) {
  const el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"][data-seo="1"]`);
  if (!content) { el?.remove(); return; }
  const node = el ?? Object.assign(document.createElement("meta"), {}) as HTMLMetaElement;
  if (!el) { node.setAttribute(attr, key); node.setAttribute("data-seo", "1"); document.head.appendChild(node); }
  node.setAttribute("content", content);
}

function setCanonical(href: string) {
  const el = document.head.querySelector<HTMLLinkElement>(`link[rel="canonical"][data-seo="1"]`);
  if (!href) { el?.remove(); return; }
  const node = el ?? document.createElement("link");
  if (!el) { node.setAttribute("rel", "canonical"); node.setAttribute("data-seo", "1"); document.head.appendChild(node); }
  node.setAttribute("href", href);
}

// Editor-supplied tags are replaced wholesale on every navigation: a tag set by
// the previous route must not survive onto a page that doesn't declare it.
function setAdditional(tags: { name: string; content: string }[]) {
  document.head.querySelectorAll('meta[data-seo-extra="1"]').forEach((el) => el.remove());
  for (const { name, content } of tags) {
    const node = document.createElement("meta");
    node.setAttribute("name", name);
    node.setAttribute("content", content);
    node.setAttribute("data-seo", "1");
    node.setAttribute("data-seo-extra", "1");
    document.head.appendChild(node);
  }
}

function setJsonLd(graph: object | null) {
  const el = document.head.querySelector<HTMLScriptElement>('script[data-seo="1"][type="application/ld+json"]');
  if (!graph) { el?.remove(); return; }
  const node = el ?? document.createElement("script");
  if (!el) {
    node.setAttribute("type", "application/ld+json");
    node.setAttribute("data-seo", "1");
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(graph);
}

export function Seo({ seo, title, description, image, noIndex, facts, breadcrumbs }: {
  seo?: SeoMeta;
  title: string;
  description?: string;
  image?: string;
  noIndex?: boolean;
  /** What this record IS, for structured data. Omit and only the site-wide
   *  organisation graph renders — correct for app/transactional routes. */
  facts?: RecordFacts | null;
  breadcrumbs?: Breadcrumb[];
}) {
  // Precedence (page record → per-route values → Site Settings defaults) lives
  // in resolveSeo; this component only writes the result into <head>.
  const r = resolveSeo(seo, getSiteSeo(), { title, description, image, noIndex, ogType: facts?.kind === "product" ? "product" : undefined }, getSiteIdentity());
  // A noindex page must not publish structured data — it would hand a crawler
  // the very record the page just asked it to ignore.
  const jsonLd = r.robots.includes("noindex")
    ? null
    : buildJsonLd({ org: getOrgIdentity(), facts, seo, breadcrumbs });
  const extraKey = JSON.stringify(r.additionalMeta);
  const jsonKey = JSON.stringify(jsonLd);

  useEffect(() => {
    document.title = r.title;
    setMeta("name", "description", r.description);
    setMeta("name", "keywords", r.keywords);
    setMeta("name", "robots", r.robots);
    setCanonical(r.canonical);
    setMeta("property", "og:title", r.ogTitle);
    setMeta("property", "og:description", r.ogDescription);
    setMeta("property", "og:type", r.ogType);
    setMeta("property", "og:site_name", r.ogSiteName);
    setMeta("property", "og:image", r.ogImage);
    setMeta("name", "twitter:card", r.twCard);
    setMeta("name", "twitter:site", r.twSite);
    setMeta("name", "twitter:creator", r.twCreator);
    setMeta("name", "twitter:title", r.twTitle);
    setMeta("name", "twitter:description", r.twDescription);
    setMeta("name", "twitter:image", r.twImage);
    setAdditional(r.additionalMeta);
    setJsonLd(jsonLd);
  }, [r.title, r.description, r.keywords, r.robots, r.canonical, r.ogTitle, r.ogDescription,
      r.ogImage, r.ogType, r.ogSiteName, r.twCard, r.twTitle, r.twDescription, r.twImage,
      r.twSite, r.twCreator, extraKey, jsonKey]);

  return null;
}
