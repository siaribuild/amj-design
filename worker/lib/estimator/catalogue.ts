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
  && ($operation == "" || family->operation == $operation)]{
  "sanityProductId": _id,
  "catalogueRevision": _rev,
  schemaVersion,
  name,
  "slug": slug.current,
  "family": category->slug.current,
  "series": family->slug.current,
  "seriesOperation": family->operation,
  // What goes NEXT to this product when an opening is too wide for one frame.
  // Authored once per family; the estimator reads it off whichever product it
  // picked, so an opening never has to look the family up separately.
  // infillOperation rides along because the split proposal speaks operations,
  // not family slugs — without it the caller would need a second round trip
  // purely to learn that "fixed-window" performs "fixed".
  "defaultSplit": family->defaultSplit{
    "infillFamilySlug": infillFamily->slug.current,
    "infillOperation": infillFamily->operation,
    minInfillMm
  },
  // SCAFFOLD (product compatibility, C3): the extrusion PLATFORM this frame is
  // built on, and the other platforms it may be coupled with. Absent on every
  // product an editor has not tagged, which is UNKNOWN — never "incompatible" —
  // so the catalogue keeps working untouched while it is being authored.
  // The edges are dereferenced to SLUGS for the same reason defaultSplit is: the
  // selector resolves systems by slug and a Sanity document id would be a
  // reference nothing downstream can follow.
  "frameSystem": frameSystem->{
    "slug": slug.current,
    name,
    "compatibleWith": compatibleWith[]{ "slug": system->slug.current, severity }
  },
  dimensionRule,
  // The product's glazing × thermal matrix comes from its shared frame profile
  // (M2/D5). Preferred over the legacy per-product performanceVariants below,
  // which stays as a fallback until every product carries a profile.
  "thermalProfile": thermalProfile->{
    frameTechnology,
    "rows": rows[]{
      "glazingOptionSlug": glazing->slug.current,
      "glazingClass": glazing->technicalValue,
      uValue, shgc, frameTechnology, certified, certificationRef, published, wersWindowId
    }
  },
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

// The constrained glazing-class vocabulary (M2). A glazing whose technicalValue is
// outside this set is REJECTED at map time — a free-text typo must not slip through
// as an invisible, unmatchable variant (review finding, §8).
const VALID_GLAZING_CLASSES = new Set([
  "single_clear", "single_toned", "single_lowe",
  "double_clear", "double_toned", "double_lowe",
  "triple_clear", "triple_toned", "triple_lowe",
]);

// Two spellings of the low-E suffix are authored in the wild and they mean the same
// glass: the WERS importer derives `double_low_e` from the export's "Low-E" glass
// type, the hand-seeded options carry `double_lowe`. Canonicalise here rather than
// let a spelling difference decide whether a row EXISTS — an unrecognised class is
// dropped at map time, which silently deleted every imported low-E cell, i.e.
// precisely the high-performance glass a thermal band needs to be met. Downstream
// `_lowe$` tests (rules.ts, configuration.ts) read the canonical form.
const canonicalGlazingClass = (cls: string) => cls.replace(/_low_e$/, "_lowe");

const coerceFrameTech = (v: unknown): "conventional" | "thermally_broken" | "unknown" =>
  v === "conventional" || v === "thermally_broken" ? v : "unknown";

// SCAFFOLD (product compatibility, C3). A system is only usable if it has a slug —
// that is the identity every downstream comparison is made on, and a system
// without one cannot be matched against anything, so an untagged-in-practice
// product must read as untagged rather than as a system nothing else can equal.
// Edges are held to the same rule: a row pointing at a deleted or draft-only
// system dereferences to no slug and is dropped, never carried as a hole.
function toFrameSystem(raw: any): CatalogueCandidate["frameSystem"] {
  const slug = typeof raw?.slug === "string" && raw.slug ? raw.slug : null;
  if (!slug) return null;
  const edges = Array.isArray(raw?.compatibleWith) ? raw.compatibleWith : [];
  const seen = new Set<string>();
  return {
    slug,
    name: typeof raw?.name === "string" && raw.name ? raw.name : null,
    compatibleWith: edges.flatMap((e: any) => {
      const to = typeof e?.slug === "string" && e.slug ? e.slug : null;
      // Self-edges say nothing (same system is already compatible) and a repeat
      // would let one authoring slip weight a partner twice once severity ranks.
      if (!to || to === slug || seen.has(to)) return [];
      seen.add(to);
      return [{ slug: to, severity: e?.severity === "preferred" ? "preferred" as const : "allowed" as const }];
    }),
  };
}

// M2/D5: map a shared frame thermal profile's rows to the variant shape the ranker
// consumes. variantId is the glazing slug (stable per product × glazing). WERS rows
// are certified; their certificationRef is the WERS window id.
function profileRowsToVariants(profile: any): any[] {
  const rows = Array.isArray(profile?.rows) ? profile.rows : [];
  const profileTech = profile?.frameTechnology;
  const seen = new Set<string>();
  return rows.flatMap((r: any) => {
    const slug = typeof r?.glazingOptionSlug === "string" && r.glazingOptionSlug ? r.glazingOptionSlug : null;
    if (!slug || seen.has(slug)) return [];
    const cls = typeof r?.glazingClass === "string" && r.glazingClass ? canonicalGlazingClass(r.glazingClass) : null;
    if (cls && !VALID_GLAZING_CLASSES.has(cls)) return []; // reject unknown class
    seen.add(slug);
    return [{
      variantId: slug,
      glazingOptionSlug: slug,
      glazingClass: cls,
      uValue: typeof r?.uValue === "number" && r.uValue >= 0.5 && r.uValue <= 10 ? r.uValue : null,
      shgc: typeof r?.shgc === "number" && r.shgc >= 0 && r.shgc <= 1 ? r.shgc : null,
      frameType: "aluminium",
      frameTechnology: coerceFrameTech(r?.frameTechnology ?? profileTech),
      certificationRef: r?.certificationRef ?? r?.wersWindowId ?? null,
      pricingOptionSlugs: [],
      dataSource: r?.certified === false ? "estimated" : "certified",
      certified: r?.certified !== false,
      published: r?.published !== false,
    }];
  });
}

// Normalise a raw Sanity row into a CatalogueCandidate, dropping anything that
// fails the schema-version guard (never silently misread an unsupported shape).
export function toCandidate(row: any): CatalogueCandidate | null {
  if (!row?.sanityProductId) return null;
  const schemaVersion = typeof row.schemaVersion === "number" ? row.schemaVersion : null;
  if (schemaVersion == null || schemaVersion > SUPPORTED_SCHEMA_VERSION) return null; // reject unsupported
  // Prefer the shared frame thermal profile (M2/D5); fall back to the legacy
  // per-product performanceVariants until every product carries a profile.
  const profileVariants = profileRowsToVariants(row.thermalProfile);
  const perf = profileVariants.length ? [] : (Array.isArray(row.performanceVariants) ? row.performanceVariants : []);
  const seenVariants = new Set<string>();
  const legacyVariants = perf.flatMap((v: any) => {
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
      glazingClass: typeof v?.glazingClass === "string" && v.glazingClass ? canonicalGlazingClass(v.glazingClass) : null,
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
  const variants = profileVariants.length ? profileVariants : legacyVariants;
  // Operation is a single intrinsic property of the family (family->operation).
  // Bake it into the candidate as the one operation this product performs, so the
  // downstream rules/ranker read one shape without knowing where it came from.
  const seriesOperation = typeof row.seriesOperation === "string" && row.seriesOperation ? row.seriesOperation : null;
  const operationTypes = seriesOperation ? [seriesOperation] : [];
  const configuration = operationTypes.length ? { operationTypes } : null;
  return {
    sanityProductId: String(row.sanityProductId),
    catalogueRevision: String(row.catalogueRevision ?? ""),
    schemaVersion,
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    family: row.family ?? null,
    series: row.series ?? null,
    configuration,
    // Absent on every family but the ones an editor has authored — which is the
    // "do not pair" default, and is why this is passed through as-is rather than
    // defaulted here. proposePairedLayout owns what a missing knob means.
    defaultSplit: row.defaultSplit?.infillFamilySlug ? row.defaultSplit : null,
    frameSystem: toFrameSystem(row.frameSystem),
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
      // Mirror the live query: operation comes from the family (seriesOperation).
      return r?.seriesOperation === operation;
    });
  };
  return createCatalogueRepository(exec);
}
