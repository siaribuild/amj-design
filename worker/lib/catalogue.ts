// Worker-side Sanity catalogue loader. Hydrates the shared catalogue (used by
// the pricing engine + snapshots) from Sanity once per isolate. Uses plain fetch
// against the Sanity query API (no @sanity/client / import.meta in the Worker).
//
// Configured via wrangler vars: SANITY_PROJECT_ID, SANITY_DATASET (default
// "production"). When unset, the Worker keeps using the built-in catalogue.ts.
import type { Env } from "../types";
import { hydrateCatalogue } from "../../src/data/catalogue";
import { CATALOGUE_QUERY, toCatalogueData, type RawCataloguePayload } from "../../src/data/catalogueQuery";

let loaded: Promise<void> | null = null;

// Idempotent per isolate: the first call fetches + hydrates; later calls await
// the same promise. Failures fall back to the built-in catalogue and are not
// retried within the isolate's lifetime.
export function ensureCatalogue(env: Env): Promise<void> {
  if (!env.SANITY_PROJECT_ID) return Promise.resolve();
  if (!loaded) loaded = load(env).catch((e) => { console.log(`[sanity] load failed: ${String(e)}`); });
  return loaded;
}

async function load(env: Env): Promise<void> {
  const dataset = env.SANITY_DATASET || "production";
  const url = `https://${env.SANITY_PROJECT_ID}.apicdn.sanity.io/v2024-01-01/data/query/${dataset}?query=${encodeURIComponent(CATALOGUE_QUERY)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sanity ${res.status}`);
  const body = await res.json<{ result: RawCataloguePayload }>();
  if (body?.result) hydrateCatalogue(toCatalogueData(body.result));
}
