// Worker-side Sanity catalogue loader. Hydrates the shared catalogue (used by
// the pricing engine + snapshots) from Sanity once per isolate. Uses plain fetch
// against the Sanity query API (no @sanity/client / import.meta in the Worker).
//
// Configured via wrangler vars: SANITY_PROJECT_ID, SANITY_DATASET (default
// "production"). When unset, the Worker keeps using the built-in catalogue.ts.
import type { Env } from "../types";
import { hydrateCatalogue } from "../../src/data/catalogue";
import { CATALOGUE_QUERY, toCatalogueData, type RawCataloguePayload } from "../../src/data/catalogueQuery";

const CATALOGUE_TTL_MS = 5 * 60 * 1000; // refresh published content every 5 min
let cache: { at: number; promise: Promise<void> } | null = null;

// Loads + hydrates at most once per TTL. A successful load is reused until it
// goes stale; a failed load is NOT cached — the next request retries — and the
// built-in catalogue serves in the meantime.
export function ensureCatalogue(env: Env): Promise<void> {
  if (!env.SANITY_PROJECT_ID) return Promise.resolve();
  const now = Date.now();
  if (cache && now - cache.at < CATALOGUE_TTL_MS) return cache.promise;
  const entry = {
    at: now,
    promise: load(env).catch((e) => {
      console.log(`[sanity] load failed: ${String(e)}`);
      if (cache === entry) cache = null; // drop so the next request retries
    }),
  };
  cache = entry;
  return entry.promise;
}

async function load(env: Env): Promise<void> {
  const dataset = env.SANITY_DATASET || "production";
  const url = `https://${env.SANITY_PROJECT_ID}.apicdn.sanity.io/v2024-01-01/data/query/${dataset}?query=${encodeURIComponent(CATALOGUE_QUERY)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sanity ${res.status}`);
  const body = await res.json<{ result: RawCataloguePayload }>();
  if (body?.result) hydrateCatalogue(toCatalogueData(body.result));
}
