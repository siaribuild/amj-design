// Client-side Sanity source for the catalogue. Configured via Vite env:
//   VITE_SANITY_PROJECT_ID=<id>   VITE_SANITY_DATASET=production (default)
// When unset, the app keeps using the hardcoded catalogue.ts (hydrate is a no-op).
import { createClient } from "@sanity/client";
import { hydrateCatalogue, hydrateOfferability } from "./catalogue";
import { CATALOGUE_QUERY, POST_BODY_QUERY, SEO_PROJECTION, normalizeSeo, toCatalogueData, type RawCataloguePayload } from "./catalogueQuery";
import type { SeoMeta } from "./catalogue";

// Defaults to the committed project (the same one the Worker uses in wrangler.jsonc);
// a Sanity projectId is not secret — it ships in the client bundle. Override per
// environment with VITE_SANITY_PROJECT_ID (set it empty to force the built-in catalogue).
const projectId = ((import.meta as any).env?.VITE_SANITY_PROJECT_ID as string | undefined) ?? "xjtrm1ex";
const dataset = ((import.meta as any).env?.VITE_SANITY_DATASET as string | undefined) || "production";

export const sanityConfigured = !!projectId;

const client = projectId
  ? createClient({ projectId, dataset, apiVersion: "2024-01-01", useCdn: true })
  : null;

// Fetch the whole catalogue in one round-trip. null when Sanity isn't configured.
export async function fetchCatalogueFromSanity() {
  if (!client) return null;
  const raw = await client.fetch<RawCataloguePayload>(CATALOGUE_QUERY);
  return toCatalogueData(raw);
}

// Bootstrap: load from Sanity and hydrate the catalogue before first render.
// Never throws AND never hangs — the load races a short timeout so a slow or
// unreachable CMS can't block React from mounting; the app then renders on the
// built-in catalogue (and picks up live content if the fetch resolves in time).
const HYDRATE_TIMEOUT_MS = 2500;

export async function hydrateFromSanity(): Promise<void> {
  if (!client) return;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), HYDRATE_TIMEOUT_MS));
  try {
    const data = await Promise.race([fetchCatalogueFromSanity(), timeout]);
    if (data) hydrateCatalogue(data);
  } catch (e) {
    console.warn("[sanity] catalogue load failed; using built-in catalogue", e);
  }
}

// Which products the quote builder must not offer. From our OWN Worker, not
// Sanity: two of the gaps it reports live in D1 (a named rate card that does
// not exist, an option with no price row), which the browser cannot see.
//
// Its own function and its own failure: a catalogue that loaded is still worth
// rendering when this does not, so it never rides the Promise.race above. Left
// unarmed on any failure — hydrateOfferability treats that as "not checked",
// which leaves the picker unfiltered rather than emptying it.
export async function hydrateOfferabilityFromApi(): Promise<void> {
  try {
    const res = await fetch("/api/catalogue/offerability", { credentials: "same-origin" });
    if (!res.ok) throw new Error(`http_${res.status}`);
    hydrateOfferability(await res.json());
  } catch (e) {
    console.warn("[catalogue] offerability check unavailable; the picker stays unfiltered", e);
    hydrateOfferability(null);
  }
}

// ── Site Settings (global brand/config singleton) ────────────────────────────
// Only logo + favicon + businessName are consumed today; the rest of the
// document exists for future use. Hydrated once before first render (main.tsx),
// so the header can read it synchronously; a slow/absent CMS falls back to the
// built-in wordmark and the static favicon.
export interface SiteBrand {
  businessName: string | null; logoUrl: string | null; faviconUrl: string | null;
  tagline: string | null; copyrightText: string | null; legalLine: string | null;
  /** Contact details live in Sanity only — never hardcoded. The email is rendered
   *  through ObfuscatedEmail so it is not harvestable from the bundle or markup. */
  email: string | null; phone: string | null; workingHours: string | null;
  /** Site-wide SEO defaults, filled in per field wherever a page leaves a gap. */
  seo: SeoMeta | null;
  /** Site-wide identity with no per-record equivalent (og:site_name, the brand
   *  handle, the social profiles published as schema.org sameAs). */
  ogSiteName: string | null; twitterSite: string | null;
  socialProfiles: string[] | null; organizationType: string | null;
}
let brand: SiteBrand | null = null;
export const getSiteBrand = (): SiteBrand | null => brand;

/** Site-wide SEO defaults from Site Settings, or null when unset/unhydrated.
 *  Consumed by <Seo>, which merges them UNDER the page's own values. */
export const getSiteSeo = (): SeoMeta | null => brand?.seo ?? null;

/** og:site_name and the brand @handle — site-wide, no per-record equivalent.
 *  The site name falls back to Business Name rather than being set twice. */
export const getSiteIdentity = (): { siteName: string | null; twitterSite: string | null } => ({
  siteName: brand?.ogSiteName?.trim() || brandName(),
  twitterSite: brand?.twitterSite?.trim() || null,
});

/** The business as schema.org sees it. Search-results logo preferred, since that
 *  is exactly what it is for. Returns name-less when Site Settings is unset, and
 *  buildOrganization then emits nothing rather than invent an identity. */
export const getOrgIdentity = () => ({
  name: brandName(),
  url: typeof window !== "undefined" ? window.location.origin : null,
  logoUrl: (brand as any)?.searchLogoUrl ?? brand?.logoUrl ?? null,
  email: brand?.email ?? null,
  phone: brand?.phone ?? null,
  sameAs: brand?.socialProfiles ?? null,
  type: brand?.organizationType ?? null,
});

/** The company name for customer-facing copy, from Site Settings → Business Name.
 *  Returns null when unset — callers use brand-neutral wording ("we will confirm")
 *  rather than a hardcoded placeholder, so nothing invents a company name. */
export const brandName = (): string | null => brand?.businessName?.trim() || null;

/** "<Business Name> will confirm…" when the name is set, otherwise "We will
 *  confirm…". Keeps sentences grammatical either way without faking a brand. */
export const brandSubject = (): string => brandName() ?? "We";
export const brandPossessive = (): string => (brandName() ? `${brandName()}'s` : "our");

const SITE_SETTINGS_QUERY = `*[_type == "siteSettings"][0]{
  businessName, tagline, copyrightText, legalLine, email, phone, workingHours,
  "logoUrl": logo.asset->url,
  "faviconUrl": favicon.asset->url,
  ogSiteName, twitterSite, socialProfiles, organizationType,
  "searchLogoUrl": coalesce(searchLogo.asset->url, logo.asset->url),
  "seo": ${SEO_PROJECTION}
}`;

function applyFavicon(url: string): void {
  if (typeof document === "undefined") return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
  link.href = url;
}

export async function hydrateSiteSettings(): Promise<void> {
  if (!client) return;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), HYDRATE_TIMEOUT_MS));
  try {
    const data = (await Promise.race([client.fetch<any>(SITE_SETTINGS_QUERY), timeout])) as any | null;
    if (data) {
      // seo arrives as the raw projection; normalize it through the same helper
      // the catalogue uses so pages and site defaults are the same shape.
      brand = { ...data, seo: normalizeSeo(data.seo) ?? null };
      if (data.faviconUrl) applyFavicon(data.faviconUrl);
    }
  } catch (e) {
    console.warn("[sanity] site settings load failed; using built-in brand", e);
  }
}

// ── Resource body (per-article) ──────────────────────────────────────────────
// Deliberately NOT part of hydrateFromSanity: portable text for every resource
// would ride the one catalogue round-trip that every page on the site pays for,
// to serve a route most visitors never open. One extra request on the page that
// needs it is the right trade. Never throws — a failed body renders as an entry
// with its documents and no article, which is a legitimate state here.
export async function fetchPostBody(slug: string): Promise<any[]> {
  if (!client) return [];
  try {
    const res = await client.fetch<{ body?: any[] } | null>(POST_BODY_QUERY, { slug });
    return res?.body ?? [];
  } catch {
    return [];
  }
}
