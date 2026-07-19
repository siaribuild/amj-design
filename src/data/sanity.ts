// Client-side Sanity source for the catalogue. Configured via Vite env:
//   VITE_SANITY_PROJECT_ID=<id>   VITE_SANITY_DATASET=production (default)
// When unset, the app keeps using the hardcoded catalogue.ts (hydrate is a no-op).
import { createClient } from "@sanity/client";
import { hydrateCatalogue } from "./catalogue";
import { CATALOGUE_QUERY, toCatalogueData, type RawCataloguePayload } from "./catalogueQuery";

const projectId = (import.meta as any).env?.VITE_SANITY_PROJECT_ID as string | undefined;
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
