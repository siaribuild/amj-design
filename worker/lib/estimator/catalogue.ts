// CatalogueRepository (spec §16.1) — published-only Sanity candidate queries for
// the estimator, with revision stamping, a short cache and schema validation.
//
// Separate from worker/lib/catalogue.ts (which hydrates the DISPLAY catalogue):
// the estimator needs the machine-readable technical contract (§4) — configuration,
// dimensionRule, performanceVariants, pricingRef, schemaVersion — not display copy.
//
// The query executor is injectable so the rules/selection engine can be tested
// against a fixture with no live CMS (spec §16.1 "catalogue test fixture export").
import type { Env } from "../types";
import { SUPPORTED_SCHEMA_VERSION, type CatalogueCandidate } from "./types";

// GROQ: published products for a family (category slug) that support an operation.
// $operation is optional — when empty, match the family only.
const CANDIDATE_QUERY = `*[_type == "product" && defined(name) && defined(schemaVersion)
  && ($family == "" || category->slug.current == $family)
  && ($operation == "" || $operation in configuration.operationTypes)]{
  "sanityProductId": _id,
  "catalogueRevision": _rev,
  schemaVersion,
  name,
  "slug": slug.current,
  "family": category->slug.current,
  "series": family->slug.current,
  configuration,
  dimensionRule,
  "performanceVariants": performanceVariants[]{ variantId, glassBuildUp, uValue, shgc, frameType, dataSource, certified, published },
  "optionGroups": options[].option->optionType->slug.current,
  pricingRef
}`;

export type QueryExecutor = (query: string, params: Record<string, unknown>) => Promise<any[]>;

// Default executor: plain fetch against the Sanity published CDN (same pattern as
// worker/lib/catalogue.ts). Params are passed as $name=<json> query args.
export function sanityExecutor(env: Env): QueryExecutor {
  const dataset = env.SANITY_DATASET || "production";
  return async (query, params) => {
    if (!env.SANITY_PROJECT_ID) return [];
    const qs = new URLSearchParams({ query });
    for (const [k, v] of Object.entries(params)) qs.set(`$${k}`, JSON.stringify(v));
    const url = `https://${env.SANITY_PROJECT_ID}.apicdn.sanity.io/v2024-01-01/data/query/${dataset}?${qs.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`sanity ${res.status}`);
    const body = await res.json<{ result: any[] }>();
    return body?.result ?? [];
  };
}

// Normalise a raw Sanity row into a CatalogueCandidate, dropping anything that
// fails the schema-version guard (never silently misread an unsupported shape).
export function toCandidate(row: any): CatalogueCandidate | null {
  if (!row?.sanityProductId) return null;
  const schemaVersion = typeof row.schemaVersion === "number" ? row.schemaVersion : null;
  if (schemaVersion == null || schemaVersion > SUPPORTED_SCHEMA_VERSION) return null; // reject unsupported
  const perf = Array.isArray(row.performanceVariants) ? row.performanceVariants : [];
  return {
    sanityProductId: String(row.sanityProductId),
    catalogueRevision: String(row.catalogueRevision ?? ""),
    schemaVersion,
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    family: row.family ?? null,
    series: row.series ?? null,
    configuration: row.configuration ?? null,
    dimensionRule: row.dimensionRule ?? null,
    performanceVariants: perf.map((v: any) => ({
      variantId: String(v?.variantId ?? "std"),
      glassBuildUp: v?.glassBuildUp ?? null,
      uValue: typeof v?.uValue === "number" ? v.uValue : null,
      shgc: typeof v?.shgc === "number" ? v.shgc : null,
      frameType: v?.frameType ?? null,
      dataSource: String(v?.dataSource ?? "estimated"),
      certified: v?.certified === true,
      published: v?.published !== false,
    })),
    optionGroups: Array.isArray(row.optionGroups) ? [...new Set(row.optionGroups.filter(Boolean))] as string[] : [],
    pricingRef: row.pricingRef ?? null,
  };
}

export interface CatalogueRepository {
  /** Published candidates for a family + operation, each revision-stamped. */
  queryCandidates(family: string | null, operation: string | null): Promise<CatalogueCandidate[]>;
  /** A version token for the whole result set (max revision seen), for audit. */
  catalogueVersion(candidates: CatalogueCandidate[]): string;
}

// Per-isolate cache keyed by (family, operation), short TTL, failed loads not cached.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; rows: CatalogueCandidate[] }>();

export function createCatalogueRepository(exec: QueryExecutor): CatalogueRepository {
  return {
    async queryCandidates(family, operation) {
      const key = `${family ?? ""}::${operation ?? ""}`;
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;
      const raw = await exec(CANDIDATE_QUERY, { family: family ?? "", operation: operation ?? "" });
      const rows = (Array.isArray(raw) ? raw : []).map(toCandidate).filter((c): c is CatalogueCandidate => !!c);
      cache.set(key, { at: Date.now(), rows });
      return rows;
    },
    catalogueVersion(candidates) {
      // A deterministic token: the sorted set of product@rev pairs, hashed short.
      const parts = candidates.map((c) => `${c.sanityProductId}@${c.catalogueRevision}`).sort();
      return parts.length ? `cat:${parts.length}:${parts[0]}` : "cat:empty";
    },
  };
}

// Test/CI seam: build a repository over an in-memory fixture (no CMS).
export function fixtureCatalogueRepository(rows: any[]): CatalogueRepository {
  const exec: QueryExecutor = async (_q, params) => {
    const family = params.family as string;
    const operation = params.operation as string;
    return rows.filter((r) =>
      (!family || r?.category?.slug?.current === family || r?.family === family) &&
      (!operation || (r?.configuration?.operationTypes ?? []).includes(operation)));
  };
  return createCatalogueRepository(exec);
}
