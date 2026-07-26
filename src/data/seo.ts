// Resolves the tags a page actually renders from three sources, in precedence
// order: the page's own Sanity SEO record, the per-route values the app computes
// (title/description/hero), and Site Settings → Default SEO as the site-wide
// fallback. Kept free of React so the precedence rules — which are easy to get
// subtly wrong and expensive when wrong — can be tested directly.
import { type SeoMeta, imageUrl } from "./catalogue";

export interface RouteSeo {
  /** Per-route title computed by the app (e.g. "Contact — OpenFrame"). */
  title: string;
  description?: string;
  /** Per-route share image, normally the page hero. */
  image?: string;
  /** Route-level robots intent — app/transactional pages set this. */
  noIndex?: boolean;
}

export interface ResolvedSeo {
  title: string; description: string; keywords: string; robots: string; canonical: string;
  ogTitle: string; ogDescription: string; ogImage: string;
  twCard: string; twTitle: string; twDescription: string; twImage: string;
}

/** A Sanity image at the 1200×630 both OG and Twitter cards expect. */
const share = (img: Parameters<typeof imageUrl>[0]) => imageUrl(img, { w: 1200, h: 630 });

export function resolveSeo(seo: SeoMeta | undefined | null, site: SeoMeta | undefined | null, route: RouteSeo): ResolvedSeo {
  // Site defaults come LAST behind the route values: a per-route title or hero is
  // specific to the page, so a global default only wins where nothing else exists.
  const title = seo?.metaTitle || route.title || site?.metaTitle || "";
  const description = seo?.metaDescription || route.description || site?.metaDescription || "";
  const kw = seo?.keywords?.length ? seo.keywords : site?.keywords ?? [];

  // Robots are MONOTONIC — a stored `false` must never lift a restriction. Both
  // schema fields default to false, so a `??` chain would let an untouched
  // Site Settings (or page) record silently expose the pages the app marks private.
  const noIndex = seo?.noIndex || site?.noIndex || route.noIndex || false;
  const noFollow = seo?.noFollow || site?.noFollow || false;

  const ogTitle = seo?.openGraph?.title || site?.openGraph?.title || title;
  const ogDescription = seo?.openGraph?.description || site?.openGraph?.description || description;
  const ogImage = share(seo?.openGraph?.image) || route.image || share(site?.openGraph?.image) || "";
  const twImage = share(seo?.twitter?.image) || share(site?.twitter?.image) || ogImage;

  return {
    title, description,
    keywords: kw.length ? kw.join(", ") : "",
    robots: [noIndex ? "noindex" : "", noFollow ? "nofollow" : ""].filter(Boolean).join(", "),
    // Canonical is deliberately page-only. A site-wide canonical would point
    // every page at one URL and de-index the rest of the site; Site Settings
    // states that the field is ignored there.
    canonical: seo?.canonicalUrl || "",
    ogTitle, ogDescription, ogImage,
    twCard: seo?.twitter?.card || site?.twitter?.card || (twImage ? "summary_large_image" : "summary"),
    twTitle: seo?.twitter?.title || site?.twitter?.title || ogTitle,
    twDescription: seo?.twitter?.description || site?.twitter?.description || ogDescription,
    twImage,
  };
}
