// Client-side Sanity source for the catalogue. Configured via Vite env:
//   VITE_SANITY_PROJECT_ID=<id>   VITE_SANITY_DATASET=production (default)
// When unset, the app keeps using the hardcoded catalogue.ts (hydrate is a no-op).
import { createClient } from "@sanity/client";
import { hydrateCatalogue } from "./catalogue";
import { CATALOGUE_QUERY, toCatalogueData, type RawCataloguePayload } from "./catalogueQuery";

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

// ── Site Settings (global brand/config singleton) ────────────────────────────
// Only logo + favicon + businessName are consumed today; the rest of the
// document exists for future use. Hydrated once before first render (main.tsx),
// so the header can read it synchronously; a slow/absent CMS falls back to the
// built-in wordmark and the static favicon.
export interface SiteBrand {
  businessName: string | null; logoUrl: string | null; faviconUrl: string | null;
  tagline: string | null; copyrightText: string | null; legalLine: string | null;
}
let brand: SiteBrand | null = null;
export const getSiteBrand = (): SiteBrand | null => brand;

const SITE_SETTINGS_QUERY = `*[_type == "siteSettings"][0]{
  businessName, tagline, copyrightText, legalLine,
  "logoUrl": logo.asset->url,
  "faviconUrl": favicon.asset->url
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
    const data = (await Promise.race([client.fetch<SiteBrand>(SITE_SETTINGS_QUERY), timeout])) as SiteBrand | null;
    if (data) {
      brand = data;
      if (data.faviconUrl) applyFavicon(data.faviconUrl);
    }
  } catch (e) {
    console.warn("[sanity] site settings load failed; using built-in brand", e);
  }
}
