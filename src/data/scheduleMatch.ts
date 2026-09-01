// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULE MATCH — pure mapping of extracted schedule rows → estimator line items.
//
// Policy (product decision D5): reproduce the schedule FAITHFULLY and FLAG anything
// the catalogue can't satisfy. Never invent an engineering decision (composite
// awning+fixed, timber→aluminium substitution, glass spec) — those belong to the
// human technical review. Every line is added in schedule order; uncertain fields
// carry a `review` reason that drives the amber highlight in the estimator.
//
// Deterministic and dependency-light (catalogue + configurator only), so it is
// unit-testable and shared by the Worker and the client.
// ═══════════════════════════════════════════════════════════════════════════════
import { getProductsByFamily, getProductBySlug, families, type Product } from "./catalogue";
import { defaultOptions, normCode } from "./configurator";
import type { RawScheduleRow, ScheduleSection } from "./scheduleParse";

export type LineReview = Record<string, string>; // field → human reason

export interface ParsedLine {
  code: string;
  productSlug: string;
  location: string; // schedule COMMENTS surfaced as the item note
  width: string; // mm
  height: string; // mm
  options: Record<string, string>;
  qty: number;
  status: "Ready" | "Needs review";
  origin: "schedule";
  review?: LineReview; // field → reason; present ⇒ needs review
  rawType?: string; // original schedule type text, for provenance
}

// Schedule type phrase → catalogue family slug. `null` ⇒ no catalogue family
// (e.g. FIXED windows) → flagged, product left for the customer to choose.
const WINDOW_FAMILY: Record<string, string | null> = {
  "AWNING": "awning-window",
  "OFFSET AWNING": "awning-window",
  "CASEMENT": "casement-window",
  "SLIDING": "sliding-window",
  "DOUBLE HUNG": "sashless-double-hung",
  "SASHLESS DOUBLE HUNG": "sashless-double-hung",
  "SINGLE HUNG": "single-hung-window",
  "TILT AND TURN": "tilt-and-turn-window",
  "TILT & TURN": "tilt-and-turn-window",
  "LOUVRE": "glass-louvre",
  "LOUVER": "glass-louvre",
  "GLASS LOUVRE": "glass-louvre",
  "FIXED": null,
};
const DOOR_FAMILY: Record<string, string | null> = {
  "ENTRY": "casement-door",
  "HINGED": "casement-door",
  "AXIS": "casement-door",
  "FRENCH": "casement-door",
  "CASEMENT": "casement-door",
  "STACKER SLIDING": "sliding-door",
  "SLIDING STACKER": "sliding-door",
  "STACKER": "sliding-door",
  "SLIDING": "sliding-door",
  "BI-FOLD": "bi-fold-door",
  "BIFOLD": "bi-fold-door",
  "BI FOLD": "bi-fold-door",
  "PIVOT": "pivot-door",
  "LIFT SLIDE": "lift-slide-door",
  "LIFT-SLIDE": "lift-slide-door",
  "SLIM FRAME SLIDING": "slim-frame-sliding-door",
};

// Preferred series when several products fit — matches our own default choices.
const WINDOW_SERIES_BIAS = ["amj80", "amj100l", "amj100t", "amj150"];
const DOOR_SERIES_BIAS = ["amj100l", "amj100t", "amj80", "amj150", "amj65"];

function familyFor(section: ScheduleSection, typeText: string | null): { slug: string | null; known: boolean } {
  const key = (typeText || "").trim().toUpperCase();
  const table = section === "window" ? WINDOW_FAMILY : DOOR_FAMILY;
  // Catalogue-authored aliases win: they are live content and can cover
  // vocabulary the built-in table has never seen.
  const byAlias = familyFromAliases(section, typeText);
  if (byAlias) return { slug: byAlias, known: true };
  if (key in table) return { slug: table[key], known: true };
  return { slug: null, known: false };
}

const inRange = (p: Product, w: number, h: number) =>
  (p.minWidth == null || w >= p.minWidth) && (p.maxWidth == null || w <= p.maxWidth) &&
  (p.minHeight == null || h >= p.minHeight) && (p.maxHeight == null || h <= p.maxHeight);

const areaCap = (p: Product) => (p.maxWidth ?? 0) * (p.maxHeight ?? 0);

function biasIndex(slug: string, bias: string[]): number {
  const i = bias.findIndex((b) => slug.includes(b));
  return i === -1 ? bias.length : i;
}

/** Price one product at one opening size. Injected rather than imported: this
 *  module is pure and synchronous, and pricing's single home is D1's
 *  `computePrice`. The Worker supplies the lookup; the browser has none, and
 *  does not get a second engine to compensate.
 *
 *  Compared on BASE rate-card totals — there is no account on this path, and a
 *  uniform account discount cannot reorder a list anyway, so list-price order is
 *  the same order for everyone (AD11). */
export type SchedulePriceLookup = (product: Product, widthMm: number, heightMm: number) => number | null;

// Choose a product in a family for the given size: the CHEAPEST one whose range
// actually contains the opening. When NONE fits, still return the BEST FIT
// (largest capacity) so the line carries an indicative price — but mark it
// `fits:false` so the caller raises a WARNING: no standard unit is made at this
// size, we design a composite/custom one and confirm the final price. Pricing
// uses the REAL opening dimensions, never the product's max, so the estimate
// reflects the true size instead of silently under-quoting.
function pickProduct(
  familySlug: string,
  section: ScheduleSection,
  w: number,
  h: number,
  priceOf?: SchedulePriceLookup,
): { product?: Product; fits: boolean } {
  const products = getProductsByFamily(familySlug);
  if (!products.length) return { fits: false };
  const bias = section === "window" ? WINDOW_SERIES_BIAS : DOOR_SERIES_BIAS;
  const byBias = (list: Product[]) => [...list].sort((a, b) => biasIndex(a.slug, bias) - biasIndex(b.slug, bias));
  if (w > 0 && h > 0) {
    const fitting = products.filter((p) => inRange(p, w, h));
    // THE CHEAPEST ONE THAT FITS (D6). The series bias used to BE the decision,
    // and that was slug-prefix inference deciding what a visitor is quoted — the
    // exact rule docs/product-compatibility-design.md §1.1 refuses, because a
    // rule right nine times and silently wrong twice is worse than no rule. The
    // list is handed over already in bias order, so with no pricer, and between
    // products that price identically, the answer is exactly what it was.
    if (fitting.length) return { product: cheapestOf(byBias(fitting), w, h, priceOf), fits: true };
    // Nothing fits: best fit = the largest-capacity unit in the family.
    return { product: [...products].sort((a, b) => areaCap(b) - areaCap(a))[0], fits: false };
  }
  return { product: byBias(products)[0], fits: false };
}

/** The cheapest of an ALREADY BIAS-ORDERED list. Strictly cheaper wins, so a tie
 *  keeps the incoming order — a coin flip between equal prices would make the
 *  same schedule match differently on different days. */
function cheapestOf(ordered: Product[], w: number, h: number, priceOf?: SchedulePriceLookup): Product {
  if (!priceOf) return ordered[0];
  let best = ordered[0];
  let bestPrice = Infinity;
  for (const product of ordered) {
    const price = priceOf(product, w, h);
    // A price that is missing, not a number, or not POSITIVE is not a price
    // (spec A6). A rate-card gap computing $0 would otherwise win every
    // comparison and quote a visitor nothing for a window — and a negative or
    // NaN would corrupt the comparison itself.
    if (price == null || !Number.isFinite(price) || price <= 0) continue;
    if (price < bestPrice) { best = product; bestPrice = price; }
  }
  return best;
}

// Catalogue-authored aliases: a family may declare the alternative names
// architects print on schedules (Sanity `family.aliases`). Looked up EXACTLY
// (case/punctuation-insensitive) — never fuzzily, and never substituted with a
// "close enough" family, because the price difference between families is
// material. An unmappable type is an ERROR the customer resolves by picking the
// product, not a silent best guess.
const canonicalType = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

function familyFromAliases(section: ScheduleSection, typeText: string | null): string | null {
  const key = canonicalType(typeText || "");
  if (!key) return null;
  const category = section === "window" ? "windows" : "doors";
  for (const f of families) {
    if (f.categorySlug !== category) continue;
    if (canonicalType(f.name) === key) return f.slug;
    if ((f.aliases ?? []).some((a) => canonicalType(a) === key)) return f.slug;
  }
  return null;
}

// Catalogue family → the estimator's operation vocabulary. Read from the family's
// own `operation` (Sanity content) — the single source of truth — so the AI path
// honours the SAME families as the deterministic one and a new family's operation
// is authored once, never mirrored in code.
const operationForFamily = (slug: string | null): string | null =>
  slug ? families.find((f) => f.slug === slug)?.operation ?? null : null;

/** Schedule TYPE text → { familySlug, operationType }, honouring catalogue
 *  aliases. Shared by the deterministic matcher and the AI pipeline so both agree
 *  on what a piece of architect vocabulary means. Returns nulls when nothing
 *  matches — callers must raise an error, never guess a near-miss family. */
export function resolveScheduleType(section: ScheduleSection, typeText: string | null): {
  familySlug: string | null; operationType: string | null;
} {
  const { slug } = familyFor(section, typeText);
  return { familySlug: slug, operationType: operationForFamily(slug) };
}

const pad2 = (s: string) => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? String(n).padStart(2, "0") : s;
};

/** Map extracted schedule rows to estimator draft lines (faithful + flagged). */
export function matchSchedule(
  rows: RawScheduleRow[],
  opts?: { priceOf?: SchedulePriceLookup },
): ParsedLine[] {
  const used = new Set<string>();
  const out: ParsedLine[] = [];
  // The pick is a pure function of (family, section, size), and a real schedule
  // repeats those constantly — a house has eight identical bedroom awnings. Left
  // unmemoised, a 50-row schedule across five families asks the pricing engine
  // rows × products times instead of once per distinct question. Scoped to this
  // call so nothing survives between parses and a rate-card change is picked up
  // by the next one.
  const picks = new Map<string, { product?: Product; fits: boolean }>();
  const pickFor = (familySlug: string, section: ScheduleSection, w: number, h: number) => {
    const key = `${familySlug}|${section}|${w}|${h}`;
    let pick = picks.get(key);
    if (!pick) { pick = pickProduct(familySlug, section, w, h, opts?.priceOf); picks.set(key, pick); }
    return pick;
  };

  for (const r of rows) {
    const review: LineReview = {};
    const w = r.widthMm ?? 0;
    const h = r.heightMm ?? 0;

    // ── product ──────────────────────────────────────────────────────────────
    const { slug: familySlug } = familyFor(r.section, r.typeText);
    let productSlug = "";
    let product: Product | undefined;
    if (familySlug) {
      const picked = pickFor(familySlug, r.section, w, h);
      product = picked.product;
      productSlug = product?.slug ?? "";
      if (product && !picked.fits && w > 0 && h > 0) {
        // No standard unit is made at this size. We still price the BEST FIT at
        // the REAL opening dimensions so the customer gets an indicative number,
        // and WARN that we will design the composite/custom unit and confirm the
        // final price. Not customer-fixable (they can't resize the building), so
        // it never blocks submission.
        review.fit = `Indicative price only — no standard ${r.section} is manufactured at ${h}×${w} mm ` +
          `(${product.name} covers ${product.minWidth ?? "?"}–${product.maxWidth ?? "?"} W, ${product.minHeight ?? "?"}–${product.maxHeight ?? "?"} H mm). ` +
          `we will design a composite or custom unit and confirm the price at technical review.`;
      }
    } else {
      // No family maps to this type — via the built-in table OR the catalogue's
      // own aliases. We deliberately do NOT guess a "close enough" family: the
      // price difference between families is material, so a wrong guess is worse
      // than asking. This is an ERROR the customer resolves by choosing the
      // product; when the right family exists under different wording, the fix is
      // to add that wording to the family's Schedule aliases in Sanity.
      review.product = `Schedule type “${r.typeText ?? "?"}” doesn’t match a catalogue product — please choose one.`;
    }

    // ── dimensions ───────────────────────────────────────────────────────────
    if (!r.widthMm || !r.heightMm) {
      review.dims = "Size could not be read from the schedule — enter width and height.";
    }

    // ── material (doors) — catalogue is aluminium only ─────────────────────
    if (r.section === "door" && r.material && !/ALUM/i.test(r.material)) {
      review.material = `Schedule specifies ${r.material}; our products are aluminium — confirm substitution at review.`;
    }

    // ── type nuances that a human must confirm ─────────────────────────────────
    if ((r.typeText || "").toUpperCase() === "OFFSET AWNING") {
      review.type = `“Offset awning” — confirm configuration (typically awning + fixed) at review.`;
    }
    const cmt = (r.comments || "").toUpperCase();
    if (/\b\d+\s*X\b|SIDELIGHT|AWNINGS|FIXED|MULLION|COUPL/i.test(cmt)) {
      review.note = `Schedule note "${r.comments}" implies a multi-unit or composite configuration — confirm at review.`;
    }

    // ── glazing ────────────────────────────────────────────────────────────────
    // Glazing is a baked per-product attribute (each product ships a fixed glass
    // package), not a selectable option. So a schedule's double-glazing REQUIREMENT
    // can't be mapped to a catalogue choice. YES is a hard minimum; NO permits
    // either single glazing or a double-glazed upgrade.
    const glazingReasons: string[] = [];
    if (r.glazing && /TRANSLUCENT|OBSCURE|FROST/i.test(r.glazing)) {
      glazingReasons.push(`obscure/translucent glass ("${r.glazing}")`);
    }
    // Double-glazed products carry an insulated-glass unit spec like "5+8A+5".
    const productIsDoubleGlazed = product ? /\d\s*\+\s*\d+\s*A?\s*\+\s*\d/i.test(product.standardGlass || "") : null;
    if (product && r.doubleGlaze === true && productIsDoubleGlazed === false) {
      glazingReasons.push(`double glazing (D.GLAZE REQ. YES) but ${product.name} ships single-glazed glass`);
    }
    if (glazingReasons.length) {
      review.glazing = `Schedule specifies ${glazingReasons.join("; and ")} — confirm the glass package at review.`;
    }

    // ── code (preserve schedule numbering; dedupe within the set) ──────────────
    const prefix = r.section === "window" ? "W" : "D";
    let code = `${prefix}${pad2(r.itemNo)}`;
    if (used.has(normCode(code))) {
      let n = 2;
      while (used.has(normCode(`${code}-${n}`))) n++;
      code = `${code}-${n}`;
    }
    used.add(normCode(code));

    // ── note (surface the schedule COMMENTS so the reviewer sees them) ─────────
    const noteParts = [r.comments].filter(Boolean) as string[];

    out.push({
      code,
      productSlug,
      location: noteParts.join(" · "),
      // A schedule states OPENING sizes by convention, and one row = one opening.
      width: r.widthMm ? String(r.widthMm) : "",
      height: r.heightMm ? String(r.heightMm) : "",
      options: product ? defaultOptions(product) : {},
      qty: 1,
      status: Object.keys(review).length ? "Needs review" : "Ready",
      origin: "schedule",
      review: Object.keys(review).length ? review : undefined,
      rawType: r.typeText ?? undefined,
    });
  }

  return out;
}
