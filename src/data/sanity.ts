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
// Never throws — on any failure the app falls back to the hardcoded default.
export async function hydrateFromSanity(): Promise<void> {
  if (!client) return;
  try {
    const data = await fetchCatalogueFromSanity();
    if (data) hydrateCatalogue(data);
  } catch (e) {
    console.warn("[sanity] catalogue load failed; using built-in catalogue", e);
  }
}
