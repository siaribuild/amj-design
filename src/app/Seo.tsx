// Dependency-free <head> manager for the SPA. Renders a page's/product's SEO +
// Open Graph + X/Twitter tags on navigation, with graceful fallbacks (OG/Twitter
// inherit the meta title/description/image, and anything still blank falls back
// to Site Settings → Default SEO). Tags it manages carry data-seo="1".
//
// Note: index.html still ships a global `robots: noindex, nofollow` for the
// pre-launch site — remove that line at launch so per-page robots take effect.
import { useEffect } from "react";
import { type SeoMeta } from "../data/catalogue";
import { getSiteSeo } from "../data/sanity";
import { resolveSeo } from "../data/seo";

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

export function Seo({ seo, title, description, image, noIndex }: {
  seo?: SeoMeta;
  title: string;
  description?: string;
  image?: string;
  noIndex?: boolean;
}) {
  // Precedence (page record → per-route values → Site Settings defaults) lives
  // in resolveSeo; this component only writes the result into <head>.
  const r = resolveSeo(seo, getSiteSeo(), { title, description, image, noIndex });

  useEffect(() => {
    document.title = r.title;
    setMeta("name", "description", r.description);
    setMeta("name", "keywords", r.keywords);
    setMeta("name", "robots", r.robots);
    setCanonical(r.canonical);
    setMeta("property", "og:title", r.ogTitle);
    setMeta("property", "og:description", r.ogDescription);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:image", r.ogImage);
    setMeta("name", "twitter:card", r.twCard);
    setMeta("name", "twitter:title", r.twTitle);
    setMeta("name", "twitter:description", r.twDescription);
    setMeta("name", "twitter:image", r.twImage);
  }, [r.title, r.description, r.keywords, r.robots, r.canonical, r.ogTitle, r.ogDescription,
      r.ogImage, r.twCard, r.twTitle, r.twDescription, r.twImage]);

  return null;
}
