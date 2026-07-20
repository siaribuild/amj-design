// Dependency-free <head> manager for the SPA. Renders a page's/product's SEO +
// Open Graph + X/Twitter tags on navigation, with graceful fallbacks (OG/Twitter
// inherit the meta title/description/image). Tags it manages carry data-seo="1".
//
// Note: index.html still ships a global `robots: noindex, nofollow` for the
// pre-launch site — remove that line at launch so per-page robots take effect.
import { useEffect } from "react";
import { type SeoMeta, imageUrl } from "../data/catalogue";

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
  const t = seo?.metaTitle || title;
  const d = seo?.metaDescription || description || "";
  const keywords = seo?.keywords?.length ? seo.keywords.join(", ") : "";
  const canonical = seo?.canonicalUrl || "";
  const robots = [(seo?.noIndex ?? noIndex) ? "noindex" : "", seo?.noFollow ? "nofollow" : ""].filter(Boolean).join(", ");
  const ogTitle = seo?.openGraph?.title || t;
  const ogDesc = seo?.openGraph?.description || d;
  const ogImage = imageUrl(seo?.openGraph?.image, { w: 1200, h: 630 }) || image || "";
  const twImage = imageUrl(seo?.twitter?.image, { w: 1200, h: 630 }) || ogImage;
  const twCard = seo?.twitter?.card || (twImage ? "summary_large_image" : "summary");
  const twTitle = seo?.twitter?.title || ogTitle;
  const twDesc = seo?.twitter?.description || ogDesc;

  useEffect(() => {
    document.title = t;
    setMeta("name", "description", d);
    setMeta("name", "keywords", keywords);
    setMeta("name", "robots", robots);
    setCanonical(canonical);
    setMeta("property", "og:title", ogTitle);
    setMeta("property", "og:description", ogDesc);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:image", ogImage);
    setMeta("name", "twitter:card", twCard);
    setMeta("name", "twitter:title", twTitle);
    setMeta("name", "twitter:description", twDesc);
    setMeta("name", "twitter:image", twImage);
  }, [t, d, keywords, robots, canonical, ogTitle, ogDesc, ogImage, twCard, twTitle, twDesc, twImage]);

  return null;
}
