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
import { getProductsByFamily, getProductBySlug, type Product } from "./catalogue";
import { defaultOptions, normCode, type MeasuredBy } from "./configurator";
import type { RawScheduleRow, ScheduleSection } from "./scheduleParse";

export type LineReview = Record<string, string>; // field → human reason

export interface ParsedLine {
  code: string;
  productSlug: string;
  location: string; // schedule COMMENTS surfaced as the item note
  measuredBy: MeasuredBy;
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

// Preferred series when several products fit — matches AMJ's own default choices.
const WINDOW_SERIES_BIAS = ["amj80", "amj100l", "amj100t", "amj150"];
const DOOR_SERIES_BIAS = ["amj100l", "amj100t", "amj80", "amj150", "amj65"];

function familyFor(section: ScheduleSection, typeText: string | null): { slug: string | null; known: boolean } {
  const key = (typeText || "").trim().toUpperCase();
  const table = section === "window" ? WINDOW_FAMILY : DOOR_FAMILY;
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

// Choose a product in a family for the given size. SIZE IS A HARD MANUFACTURING
// CONSTRAINT: only a product whose dimensional range actually contains the opening
// may be offered. When NONE fits, we offer NO product (oversized) rather than a
// size-incompatible unit at a meaningless price — AMJ designs a composite/custom
// solution at review. When the size isn't yet known we can't range-check, so we
// offer the series default and let the separate 'dims' flag prompt for the size.
function pickProduct(familySlug: string, section: ScheduleSection, w: number, h: number): { product?: Product; fits: boolean; oversized: boolean } {
  const products = getProductsByFamily(familySlug);
  if (!products.length) return { fits: false, oversized: false };
  const bias = section === "window" ? WINDOW_SERIES_BIAS : DOOR_SERIES_BIAS;
  const byBias = (list: Product[]) => [...list].sort((a, b) => biasIndex(a.slug, bias) - biasIndex(b.slug, bias));
  if (w > 0 && h > 0) {
    const fitting = products.filter((p) => inRange(p, w, h));
    if (fitting.length) return { product: byBias(fitting)[0], fits: true, oversized: false };
    return { fits: false, oversized: true }; // no standard product can be built at this size
  }
  return { product: byBias(products)[0], fits: false, oversized: false };
}

// The largest-capacity product in a family — used only to make the oversized
// message informative ("largest available is …"), never offered as the line.
function largestProduct(familySlug: string): Product | undefined {
  return [...getProductsByFamily(familySlug)].sort((a, b) => areaCap(b) - areaCap(a))[0];
}

const pad2 = (s: string) => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? String(n).padStart(2, "0") : s;
};

/** Map extracted schedule rows to estimator draft lines (faithful + flagged). */
export function matchSchedule(rows: RawScheduleRow[]): ParsedLine[] {
  const used = new Set<string>();
  const out: ParsedLine[] = [];

  for (const r of rows) {
    const review: LineReview = {};
    const w = r.widthMm ?? 0;
    const h = r.heightMm ?? 0;

    // ── product ──────────────────────────────────────────────────────────────
    const { slug: familySlug, known } = familyFor(r.section, r.typeText);
    let productSlug = "";
    let product: Product | undefined;
    if (familySlug) {
      const picked = pickProduct(familySlug, r.section, w, h);
      product = picked.product;
      productSlug = product?.slug ?? "";
      if (picked.oversized) {
        // SIZE is a hard manufacturing constraint. No standard product can be
        // built at this opening, so NONE is offered — the line carries no product
        // and no (fake) price. It's AMJ's design problem (a composite/custom
        // unit), not customer-fixable: keyed 'fit' (technical), submittable.
        const largest = largestProduct(familySlug);
        review.fit = `No standard ${r.section} product is manufactured at ${w}×${h} mm` +
          (largest ? ` (largest available is ${largest.name}, up to ${largest.maxWidth ?? "?"}×${largest.maxHeight ?? "?"} mm)` : "") +
          `. AMJ will design a composite or custom unit at technical review.`;
      }
    } else if (known) {
      // Recognised type with no catalogue family (e.g. FIXED window).
      review.product = `Schedule type “${r.typeText}” has no matching catalogue product — please select one.`;
    } else {
      review.product = `Could not match schedule type “${r.typeText ?? "?"}” to a product — please select one.`;
    }

    // ── dimensions ───────────────────────────────────────────────────────────
    if (!r.widthMm || !r.heightMm) {
      review.dims = "Size could not be read from the schedule — enter width and height.";
    }

    // ── material (doors) — AMJ catalogue is aluminium only ─────────────────────
    if (r.section === "door" && r.material && !/ALUM/i.test(r.material)) {
      review.material = `Schedule specifies ${r.material}; AMJ products are aluminium — confirm substitution at review.`;
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
    // can't be mapped to a catalogue choice — but it must not be silently satisfied
    // OR contradicted by the product's default glass. Flag a technical issue only
    // when the requirement genuinely conflicts with the matched product's glass.
    const glazingReasons: string[] = [];
    if (r.glazing && /TRANSLUCENT|OBSCURE|FROST/i.test(r.glazing)) {
      glazingReasons.push(`obscure/translucent glass ("${r.glazing}")`);
    }
    // Double-glazed products carry an insulated-glass unit spec like "5+8A+5".
    const productIsDoubleGlazed = product ? /\d\s*\+\s*\d+\s*A?\s*\+\s*\d/i.test(product.standardGlass || "") : null;
    if (product && r.doubleGlaze === true && productIsDoubleGlazed === false) {
      glazingReasons.push(`double glazing (D.GLAZE REQ. YES) but ${product.name} ships single-glazed glass`);
    } else if (product && r.doubleGlaze === false && productIsDoubleGlazed === true) {
      glazingReasons.push(`single glazing (D.GLAZE REQ. NO) but ${product.name} ships double-glazed glass`);
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
      measuredBy: "",
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
