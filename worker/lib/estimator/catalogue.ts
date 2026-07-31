// CatalogueRepository (spec §16.1) — published-only Sanity candidate queries for
// the estimator, with revision stamping, a short cache and schema validation.
//
// Separate from worker/lib/catalogue.ts (which hydrates the DISPLAY catalogue):
// the estimator needs the machine-readable technical contract (§4) — configuration,
// dimensionRule, performanceVariants, pricingRef, schemaVersion — not display copy.
//
// The query executor is injectable so the rules/selection engine can be tested
// against a fixture with no live CMS (spec §16.1 "catalogue test fixture export").
import type { Env } from "../../types";
import { SUPPORTED_SCHEMA_VERSION, type CatalogueCandidate } from "./types";
import { defineQuery } from "groq";

// GROQ: published products for a family (category slug) that support an operation.
// $operation is optional — when empty, match the family only.
const CANDIDATE_QUERY = defineQuery(`*[_type == "product" && defined(name) && defined(schemaVersion)
  && ($family == "" || category->slug.current == $family)
  && ($operation == ""
      || $operation in configuration.operationTypes
      || ((!defined(configuration.operationTypes) || count(configuration.operationTypes) == 0) && family->operation == $operation))]{
  "sanityProductId": _id,
  "catalogueRevision": _rev,
  schemaVersion,
  name,
  "slug": slug.current,
  "family": category->slug.current,
  "series": family->slug.current,
  configuration,
  "seriesOperation": family->operation,
  dimensionRule,
  "performanceVariants": performanceVariants[]{
    variantId, uValue, shgc, frameType, frameTechnology,
    pricingOptionSlugs, dataSource, certified, certificationRef, published,
    "glazingOptionSlug": glazingOption->slug.current,
    "glazingClass": glazingOption->technicalValue
  },
  "optionGroups": options[].option->optionType->slug.current,
  pricingRef
}`);

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
  const seenVariants = new Set<string>();
  const variants = perf.flatMap((v: any) => {
    const variantId = String(v?.variantId ?? "").trim();
    const uValue = typeof v?.uValue === "number" && v.uValue >= 0.5 && v.uValue <= 10 ? v.uValue : null;
    const shgc = typeof v?.shgc === "number" && v.shgc >= 0 && v.shgc <= 1 ? v.shgc : null;
    if (!variantId || seenVariants.has(variantId)) return [];
    if (v?.certified === true && (!v?.certificationRef || v?.dataSource !== "certified")) return [];
    seenVariants.add(variantId);
    return [{
      variantId,
      // The shared glazing option this (frame×glass) cell realises: its slug is
      // the glass identity and its technicalValue (glazingClass) is the single/
      // double/low-e classification — no longer parsed from a free-text build-up.
      glazingOptionSlug: typeof v?.glazingOptionSlug === "string" && v.glazingOptionSlug ? v.glazingOptionSlug : null,
      glazingClass: typeof v?.glazingClass === "string" && v.glazingClass ? v.glazingClass : null,
      uValue,
      shgc,
      frameType: v?.frameType ?? null,
      frameTechnology: v?.frameTechnology === "conventional" || v?.frameTechnology === "thermally_broken"
        ? v.frameTechnology : "unknown" as const,
      certificationRef: v?.certificationRef ?? null,
      pricingOptionSlugs: Array.isArray(v?.pricingOptionSlugs)
        ? v.pricingOptionSlugs.filter((s: unknown): s is string => typeof s === "string" && !!s).slice(0, 20)
        : [],
      dataSource: String(v?.dataSource ?? "estimated"),
      certified: v?.certified === true,
      published: v?.published !== false,
    }];
  });
  // A product's own operation types are an OVERRIDE; when blank it inherits the
  // single canonical operation its family declares (family->operation). Bake the
  // effective set here so every downstream rule/ranker reads one shape and never
  // has to know about inheritance.
  const ownOps = Array.isArray(row.configuration?.operationTypes)
    ? row.configuration.operationTypes.filter((s: unknown): s is string => typeof s === "string" && !!s)
    : [];
  const seriesOperation = typeof row.seriesOperation === "string" && row.seriesOperation ? row.seriesOperation : null;
  const operationTypes = ownOps.length ? [...new Set(ownOps)] : (seriesOperation ? [seriesOperation] : []);
  const configuration = row.configuration || operationTypes.length ? { operationTypes } : null;
  return {
    sanityProductId: String(row.sanityProductId),
    catalogueRevision: String(row.catalogueRevision ?? ""),
    schemaVersion,
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    family: row.family ?? null,
    series: row.series ?? null,
    configuration,
    dimensionRule: row.dimensionRule ?? null,
    performanceVariants: variants,
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

export interface CatalogueCandidateReadiness {
  ready: boolean;
  gaps: string[];
  usableVariantIds: string[];
}

/**
 * Minimum contract required for a thermally meaningful, priceable selection.
 * A placeholder performance row is not readiness: the estimator must be able to
 * distinguish the glass/frame configuration whose cost it is recommending.
 */
export function catalogueCandidateReadiness(candidate: CatalogueCandidate): CatalogueCandidateReadiness {
  const gaps: string[] = [];
  if (!candidate.pricingRef) gaps.push("pricing_ref");
  if (!candidate.configuration?.operationTypes?.length) gaps.push("operation_types");
  if (!candidate.dimensionRule) gaps.push("dimension_rule");
  const usableVariantIds = candidate.performanceVariants
    .filter((variant) =>
      variant.published &&
      variant.uValue != null &&
      variant.shgc != null &&
      !!variant.glazingOptionSlug &&
      variant.frameTechnology !== "unknown")
    .map((variant) => variant.variantId);
  if (!usableVariantIds.length) gaps.push("thermally_described_variant");
  return { ready: gaps.length === 0, gaps, usableVariantIds };
}

/** Cheap production preflight used before model spend. It does not promise that
 * every future opening is priceable; it prevents spending when the published
 * catalogue and private rate card have no thermally meaningful overlap at all. */
export async function hasAnyExactPricingCoverage(env: Env): Promise<boolean> {
  if (!env.SANITY_PROJECT_ID) return true;
  const repo = createCatalogueRepository(sanityExecutor(env));
  const candidates = await repo.queryCandidates(null, null);
  const refs = [...new Set(candidates
    .filter((candidate) => catalogueCandidateReadiness(candidate).ready)
    .map((candidate) => candidate.pricingRef)
    .filter((ref): ref is string => !!ref))];
  if (!refs.length) return false;
  const placeholders = refs.map(() => "?").join(",");
  const row = await env.DB.prepare(
    `SELECT count(*) AS n FROM pricing_rate_card
      WHERE active=1 AND id IN (${placeholders})`,
  ).bind(...refs).first<{ n: number }>();
  return Number(row?.n ?? 0) > 0;
}

// Cache keyed by (family, operation), short TTL, failed loads not cached. Held
// PER repository instance (not module-level) so distinct executors/datasets don't
// collide — in the Worker, create the repository once per isolate to keep the
// cross-request cache (see the route wiring).
const CACHE_TTL_MS = 5 * 60 * 1000;

export function createCatalogueRepository(exec: QueryExecutor): CatalogueRepository {
  const cache = new Map<string, { at: number; rows: CatalogueCandidate[] }>();
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
      // A deterministic token over the complete revision set (not merely the
      // first row, which previously made distinct catalogues collide).
      const parts = candidates.map((c) => `${c.sanityProductId}@${c.catalogueRevision}`).sort();
      if (!parts.length) return "cat:empty";
      let hash = 2166136261;
      for (const ch of parts.join("|")) {
        hash ^= ch.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
      }
      return `cat:${parts.length}:${(hash >>> 0).toString(16)}`;
    },
  };
}

// Test/CI seam: build a repository over an in-memory fixture (no CMS).
export function fixtureCatalogueRepository(rows: any[]): CatalogueRepository {
  const exec: QueryExecutor = async (_q, params) => {
    const family = params.family as string;
    const operation = params.operation as string;
    return rows.filter((r) => {
      if (family && r?.category?.slug?.current !== family && r?.family !== family) return false;
      if (!operation) return true;
      const ops = r?.configuration?.operationTypes ?? [];
      // Mirror the live query: an empty own-set inherits the family's operation.
      return ops.length ? ops.includes(operation) : r?.seriesOperation === operation;
    });
  };
  return createCatalogueRepository(exec);
}
