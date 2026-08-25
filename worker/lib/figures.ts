// Captured figures (ops2 "Why this product", Phase 3a — spec §7, design §4.3).
//
// A line's own record of its product+variant's Uw and SHGC. A snapshot, never a
// lookup: nothing here is ever called to DISPLAY a figure.
//
// TWO KINDS OF WRITER — the classes and their membership are design §1.6, and
// the per-writer index is design §4.2. Deliberately NOT restated here: a
// restated list has been wrong three times in this phase, which is why §4.2
// switched its own cells to pointers.
//
// The PROPERTY, which is what this module implements:
//   • A writer with a stored row to compare against must not write a figure it
//     did not establish. It goes through `captureFigures`, which writes only
//     when the pick MOVED (§7.0 — product, variant, glazing) and otherwise
//     returns the stored value unchanged.
//   • A writer whose figures come from a variant it has just validated in
//     memory has no failure channel that could invent an absence, so it derives
//     on every save (`figuresFromVariant`) and keeps its figures in step with
//     the price and snapshots written in the same statement.
// Which writer is which is §1.6's to say. If this comment and §1.6 disagree,
// §1.6 is right.
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

/** The request's products, each with the published variants that carry figures.
 *  Not exported: every consumer receives one from `fetchFigureCatalogue` and
 *  passes it straight on, so nothing outside this file needs to name it. */
type FigureCatalogue = ReadonlyMap<string, PerformanceVariant[]>;

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
  pick: { productSlug: string; variantId: string | null; options: Record<string, unknown> },
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

/** THE glass identity, read exactly as every pricing path reads it
 *  (`lib/lines.ts:164`, verified 2026-08-25). One expression, used on BOTH sides
 *  of `pickMoved` — the saved pick and the stored row.
 *
 *  It must stay one expression. `options_json` is stored uncoerced, so a client
 *  posting `{"glazing": 5}` puts a number in the column; a stored side that read
 *  it as `String(v)` while the pick side read it as `typeof v === "string"` would
 *  compare `"5"` against `""` and report a move on a pick that never moved,
 *  re-resolving a snapshot §1.4 forbids. A non-string glass is no glass chosen —
 *  which is also exactly what pricing does with it. */
const glazingOf = (options: Record<string, unknown> | null | undefined): string =>
  typeof options?.glazing === "string" ? options.glazing : "";

/** Options as stored on a row, exactly as stored.
 *
 *  `unknown`, not `string`, and that is the point: `options_json` is written
 *  uncoerced, so a client posting `{"glazing": 5}` puts a number in the column,
 *  and this function's whole reason to exist is reading such a value WITHOUT
 *  changing it. Declaring the values as strings would be a type-level version
 *  of exactly the fabrication this phase has now been bitten by twice.
 *
 *  Unreadable JSON is no options on record — never a throw, because nothing in
 *  the capture may fail a save. */
export const storedOptions = (optionsJson: string | null | undefined): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(optionsJson || "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch { return {}; }
};

/** What a save must have on the row for the stored figures to still describe it. */
export interface StoredPick {
  productSlug: string | null;
  variantId: string | null;
  glazing: string | null;
  figuresJson: string | null;
}

/** The pick a stored row is carrying — the only place a `StoredPick` is built.
 *
 *  Every capture path reads its row through here, so the stored side and the
 *  save side cannot drift into two readings of one fact. They already had:
 *  four hand-written literals over three different JSON parsers, one of which
 *  coerced values and the others did not. */
export function storedPickOf(row: {
  product_slug: string | null;
  options_json?: string | null;
  selected_variant_id?: string | null;
  performance_figures_json?: string | null;
} | null | undefined): StoredPick | null {
  if (!row) return null;
  return {
    productSlug: row.product_slug,
    variantId: row.selected_variant_id ?? null,
    glazing: glazingOf(storedOptions(row.options_json)) || null,
    figuresJson: row.performance_figures_json ?? null,
  };
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
  pick: { productSlug: string; variantId: string | null; options: Record<string, unknown> },
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
/** `captureFigures` for a save that touches ONE row: at most one catalogue read,
 *  and the predicate evaluated once rather than once per use. */
export async function captureOne(
  env: Env,
  pick: { productSlug: string; variantId: string | null; options: Record<string, unknown> },
  stored: StoredPick | null,
): Promise<string | null> {
  const moved = pickMoved(pick, stored);
  return captureFigures(
    await fetchFigureCatalogue(env, moved ? [pick.productSlug] : []), pick, stored);
}

export function captureFigures(
  catalogue: FigureCatalogue,
  pick: { productSlug: string; variantId: string | null; options: Record<string, unknown> },
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
 *  (estimator/thermal/calibration.ts:310); no production call site passes it
 *  (grepped 2026-08-25: only `figure-capture.test.mjs` does).
 *
 *  The slugs ARE client-supplied — a customer names `productSlug` on their own
 *  save. They are safe because they are BOUND, never interpolated:
 *  `sanityExecutor` puts each parameter through `URLSearchParams`, and
 *  `$slugs` is a GROQ parameter rather than query text. Anyone widening this
 *  query or adding a parameter must keep that property; it is what makes the
 *  input harmless, not any claim that the input is trusted. */
export async function fetchFigureCatalogue(
  env: Env, slugs: string[], executor?: QueryExecutor,
): Promise<FigureCatalogue> {
  const distinct = [...new Set(slugs.filter((s) => typeof s === "string" && !!s))];
  if (!distinct.length) return EMPTY_CATALOGUE;
  const exec = executor ?? sanityExecutor(env);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const rows = await Promise.race([
      exec(FIGURE_QUERY, { slugs: distinct }),
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
