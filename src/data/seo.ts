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
  /** Default og:type for this kind of route (product pages pass "product"). */
  ogType?: string;
}

export interface ResolvedSeo {
  title: string; description: string; keywords: string; robots: string; canonical: string;
  ogTitle: string; ogDescription: string; ogImage: string; ogType: string; ogSiteName: string;
  twCard: string; twTitle: string; twDescription: string; twImage: string;
  twSite: string; twCreator: string;
  /** Verification tokens and one-off tags, page entries winning by name. */
  additionalMeta: { name: string; content: string }[];
}

/** Site-wide identity that has no per-record equivalent. */
export interface SiteIdentity {
  siteName?: string | null;
  twitterSite?: string | null;
}

/** A Sanity image at the 1200×630 both OG and Twitter cards expect. */
const share = (img: Parameters<typeof imageUrl>[0]) => imageUrl(img, { w: 1200, h: 630 });

// Robots directives that can only ever be ADDED. Collected in one place so a new
// switch can't accidentally be wired up with a lifting fallback.
const NEGATIVE_FLAGS: { key: keyof NonNullable<SeoMeta["advanced"]>; token: string }[] = [
  { key: "noArchive", token: "noarchive" },
  { key: "noSnippet", token: "nosnippet" },
  { key: "noImageIndex", token: "noimageindex" },
];

export function resolveSeo(
  seo: SeoMeta | undefined | null,
  site: SeoMeta | undefined | null,
  route: RouteSeo,
  identity?: SiteIdentity | null,
): ResolvedSeo {
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
  const robots = [noIndex ? "noindex" : "", noFollow ? "nofollow" : ""].filter(Boolean);
  for (const { key, token } of NEGATIVE_FLAGS) {
    if (seo?.advanced?.[key] || site?.advanced?.[key]) robots.push(token);
  }
  // The max-* directives LOOSEN by nature, so they take the ordinary page-then-
  // site fallback. `0`/`-1` are meaningful values, hence the explicit ?? chain.
  const maxSnippet = seo?.advanced?.maxSnippet ?? site?.advanced?.maxSnippet;
  const maxImagePreview = seo?.advanced?.maxImagePreview || site?.advanced?.maxImagePreview;
  const maxVideoPreview = seo?.advanced?.maxVideoPreview ?? site?.advanced?.maxVideoPreview;
  if (typeof maxSnippet === "number") robots.push(`max-snippet:${maxSnippet}`);
  if (maxImagePreview) robots.push(`max-image-preview:${maxImagePreview}`);
  if (typeof maxVideoPreview === "number") robots.push(`max-video-preview:${maxVideoPreview}`);

  // Additional tags merge rather than override wholesale: the site-level entries
  // are usually verification tokens that must survive on every page, while a page
  // may still replace one by name.
  const extra = new Map<string, string>();
  for (const m of site?.advanced?.additionalMeta ?? []) if (m.name && m.content) extra.set(m.name, m.content);
  for (const m of seo?.advanced?.additionalMeta ?? []) if (m.name && m.content) extra.set(m.name, m.content);

  const ogTitle = seo?.openGraph?.title || site?.openGraph?.title || title;
  const ogDescription = seo?.openGraph?.description || site?.openGraph?.description || description;
  const ogImage = share(seo?.openGraph?.image) || route.image || share(site?.openGraph?.image) || "";
  const twImage = share(seo?.twitter?.image) || share(site?.twitter?.image) || ogImage;

  return {
    title, description,
    keywords: kw.length ? kw.join(", ") : "",
    robots: robots.join(", "),
    // Canonical is deliberately page-only. A site-wide canonical would point
    // every page at one URL and de-index the rest of the site; Site Settings
    // states that the field is ignored there.
    canonical: seo?.canonicalUrl || "",
    ogTitle, ogDescription, ogImage,
    ogType: seo?.openGraph?.type || site?.openGraph?.type || route.ogType || "website",
    ogSiteName: identity?.siteName || "",
    twCard: seo?.twitter?.card || site?.twitter?.card || (twImage ? "summary_large_image" : "summary"),
    twTitle: seo?.twitter?.title || site?.twitter?.title || ogTitle,
    twDescription: seo?.twitter?.description || site?.twitter?.description || ogDescription,
    twImage,
    // The brand handle is site-wide; the creator names the author of THIS record
    // and has no site-level default — a global "creator" would misattribute.
    twSite: identity?.twitterSite || "",
    twCreator: seo?.twitter?.creator || "",
    additionalMeta: [...extra].map(([name, content]) => ({ name, content })),
  };
}
