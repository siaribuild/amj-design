// Captured figures (ops2 "Why this product", Phase 3a — spec §7, design §4.3).
//
// A line's own record of its product+variant's Uw and SHGC, written at the
// moment a save MOVES the pick — product, variant or glazing (§7.0) — and never
// on a save that leaves it alone. A snapshot, never a lookup: nothing here is
// ever called to DISPLAY a figure, and nothing re-derives a stored one.
//
// THE ONE HARD CONSTRAINT: the capture is never a gate. A save that succeeds
// today must still succeed after this ships — same status, same stored values,
// same price, same response. So nothing in this module throws, and no caller
// can receive an exception from it. An unresolvable variant stores null and
// tells nobody (SNAP-AC-4/5/6).
import { defineQuery } from "groq";
import type { Env } from "../types";
import { sanityExecutor, toCandidate, type QueryExecutor } from "./estimator/catalogue";
import type { PerformanceVariant } from "./estimator/types";

export interface LineFigures { uValue: number | null; shgc: number | null }

/** A captured unknown. Present-and-null is a DIFFERENT fact from a SQL NULL:
 *  this says "we looked and the catalogue has no figure", the column being NULL
 *  says "this line was saved before the capture existed" (SNAP-AC-8). */
export const NULL_FIGURES: LineFigures = { uValue: null, shgc: null };

/** The request's products, each with the published variants that carry figures. */
export type FigureCatalogue = ReadonlyMap<string, PerformanceVariant[]>;

const EMPTY_CATALOGUE: FigureCatalogue = new Map();

/** What goes in the column. `null` — and only `null` — means no capture at all. */
export const figuresJson = (figures: LineFigures | null): string | null =>
  figures ? JSON.stringify({ uValue: figures.uValue, shgc: figures.shgc }) : null;

/** From a variant already in memory: the estimator's own writers and the ops
 *  AI-managed branch have validated one before they write, so they never fetch. */
export function figuresFromVariant(
  variant: { uValue: number | null; shgc: number | null } | null | undefined,
): LineFigures {
  return variant ? { uValue: variant.uValue ?? null, shgc: variant.shgc ?? null } : NULL_FIGURES;
}

/** Deterministic match of a saved configuration onto the fetched figures.
 *
 *  A named variant wins outright. Otherwise the glazing the line chose must
 *  identify exactly one published variant — AMBIGUITY STORES NULL RATHER THAN A
 *  GUESS, because a fabricated figure a reviewer trusts is worse than a stated
 *  absence. A product offering exactly one published variant is not ambiguous:
 *  that variant is the only answer there is. */
export function resolveFigures(
  catalogue: FigureCatalogue,
  pick: { productSlug: string; variantId: string | null; options: Record<string, string> },
): LineFigures {
  const published = (catalogue.get(pick.productSlug) ?? []).filter((v) => v.published);
  if (pick.variantId) {
    const named = published.find((v) => v.variantId === pick.variantId);
    return named ? figuresFromVariant(named) : NULL_FIGURES;
  }
  const glazing = glazingOf(pick.options);
  const matches = glazing ? published.filter((v) => v.glazingOptionSlug === glazing) : published;
  return matches.length === 1 ? figuresFromVariant(matches[0]) : NULL_FIGURES;
}

/** The glass identity every pricing path already reads (lib/lines.ts:164) — one
 *  place per fact, so the figures follow the glass the line was priced for. */
const glazingOf = (options: Record<string, string> | null | undefined): string =>
  typeof options?.glazing === "string" ? options.glazing : "";

/** What a save must have on the row for the stored figures to still describe it. */
export interface StoredPick {
  productSlug: string | null;
  variantId: string | null;
  glazing: string | null;
  figuresJson: string | null;
}

/** Has this save actually moved the pick? EXACTLY the resolver's own inputs are
 *  the pick — an option it never consults (colour, hardware) cannot change what
 *  it would answer, so it cannot move the figures.
 *
 *  A pick naming NO variant does not move the variant term; only an explicit,
 *  different id does (the restore path). That clause is what stops the customer
 *  save loop re-resolving on a dims-only edit through a retained
 *  `selected_variant_id`. */
export function pickMoved(
  pick: { productSlug: string; variantId: string | null; options: Record<string, string> },
  stored: StoredPick | null,
): boolean {
  if (!stored) return true;                                   // a new row has nothing to carry
  return pick.productSlug !== (stored.productSlug ?? "")
    || glazingOf(pick.options) !== (stored.glazing ?? "")
    || (!!pick.variantId && pick.variantId !== stored.variantId);
}

/** §1.4 — THE write-time rule, in one place, so no call site re-derives it.
 *
 *  Re-resolving an UNMOVED pick against today's catalogue recomputes a captured
 *  snapshot, which SNAP-AC-9 forbids: figures stay figures, present-and-null
 *  stays present-and-null, and a pre-capture NULL stays NULL — no opportunistic
 *  backfill on touch, which would be a display-time catalogue read wearing a
 *  snapshot's clothes (SNAP-AC-10's reasoning).
 *
 *  A MOVED pick resolves fresh, and a failed resolution stores present-and-null
 *  — honest here and only here, because the stored figures describe a
 *  configuration the row no longer has. That is why "never overwrite a good
 *  value with null" is the wrong shape: safe on an unmoved pick, and on a moved
 *  one it pins the old product's figures to the new configuration. */
export function captureFigures(
  catalogue: FigureCatalogue,
  pick: { productSlug: string; variantId: string | null; options: Record<string, string> },
  stored: StoredPick | null,
): string | null {
  return pickMoved(pick, stored) ? figuresJson(resolveFigures(catalogue, pick)) : stored!.figuresJson;
}

// The rows `toCandidate` needs to decide a product's variants, and nothing else.
// Mapping through it rather than reading the fields here is deliberate: the
// shared thermal profile supersedes the legacy per-product variants, 15 of 34
// products still have no profile, and that decision must not exist twice.
const FIGURE_QUERY = defineQuery(`*[_type == "product" && defined(schemaVersion)
  && slug.current in $slugs]{
  "sanityProductId": _id,
  schemaVersion,
  "slug": slug.current,
  "thermalProfile": thermalProfile->{
    frameTechnology,
    "rows": rows[]{
      "glazingOptionSlug": glazing->slug.current,
      "glazingClass": glazing->technicalValue,
      uValue, shgc, published
    }
  },
  "performanceVariants": performanceVariants[]{
    variantId, uValue, shgc, published,
    "glazingOptionSlug": glazingOption->slug.current,
    "glazingClass": glazingOption->technicalValue
  }
}`);

/** THE one catalogue consultation per save request (SNAP-AC-7) — the customer
 *  batch and the parse loop each build one slug set and call this once.
 *
 *  Never throws. Any failure, any timeout and an absent SANITY_PROJECT_ID all
 *  yield an empty catalogue, which resolves everything to NULL_FIGURES. The
 *  1.5 s budget sits inside `sanityExecutor`'s own 4 s cap: a slow CMS must not
 *  become a slow save (SNAP-AC-6/7).
 *
 *  `executor` is for tests only — same seam as the thermal calibration reader
 *  (estimator/thermal/calibration.ts:310). No route passes it, and the pick's
 *  fields are server-resolved, so no client value can reach the catalogue. */
export async function fetchFigureCatalogue(
  env: Env, slugs: string[], executor?: QueryExecutor,
): Promise<FigureCatalogue> {
  const distinct = [...new Set(slugs.filter((s) => typeof s === "string" && !!s))];
  if (!distinct.length) return EMPTY_CATALOGUE;
  const exec = executor ?? sanityExecutor(env);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const rows = await Promise.race([
      Promise.resolve(exec(FIGURE_QUERY, { slugs: distinct })),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 1500); }),
    ]);
    if (!Array.isArray(rows)) return EMPTY_CATALOGUE;
    const catalogue = new Map<string, PerformanceVariant[]>();
    for (const row of rows) {
      const candidate = toCandidate(row);
      if (candidate?.slug) catalogue.set(candidate.slug, candidate.performanceVariants);
    }
    return catalogue;
  } catch {
    return EMPTY_CATALOGUE;
  } finally {
    clearTimeout(timer);
  }
}
