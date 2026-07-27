// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATOR — pricing, options and quote (MyProject) state
//
// All PRODUCT data (families, products, dimensions, glass, hardware, options,
// specs) is hardcoded in catalogue.ts (generated from products.xlsx). This module
// only adds the commercial layer: an indicative pricing model + the MyProject cart.
//
// Pricing (placeholder rates now; production engine plugs in before go-live):
//   unit = perimeter(m) × $/m  +  area(m²) × $/m²  +  Σ option surcharges
//
// NOTE: there is no "configuration/panel" concept — that is not in the product
// data yet. When it exists it will live with the dimensions, not as an invented field.
// ═══════════════════════════════════════════════════════════════════════════════
import { type Product, getProductBySlug, getCategories, getFamiliesByCategory, colorbondColourOptions } from "./catalogue";

// ─── Quote (MyProject) state ──────────────────────────────────────────────────
export type MeasuredBy = "" | "frame" | "opening" | "unsure";
export const MEASURED_LABELS: Record<Exclude<MeasuredBy, "">, string> = {
  frame: "Frame size", opening: "Opening size", unsure: "Not sure",
};

export interface QItem {
  id: number;      // LOCAL ephemeral id for React keys / store operations
  serverId?: string; // STABLE server line id, round-tripped so saves upsert (P1-03)
  code: string;    // schedule/item code (W01, D03…) — primary builder reference
  productSlug: string;
  location: string;
  measuredBy: MeasuredBy; // how the customer measured — kept for technical review
  width: string;   // mm (string while editing)
  height: string;  // mm
  options: Record<string, string>; // optionTypeSlug -> chosen option name
  qty: number;
  status: "Ready" | "Needs review";
  origin?: "manual" | "schedule" | "ai"; // how the line entered the project
  aiPriced?: boolean;
  /** Authoritative server total for an AI-selected exact configuration. */
  lineTotal?: number | null;
  // Per-field {field: reason} set when the line was auto-parsed from a schedule and
  // a value needs a human look. Drives the amber highlight; keys are dropped as the
  // customer resolves each field (see clearReviewKey).
  review?: Record<string, string> | null;
}
/** One unit of a composite opening. Never an item in its own right: no tag, no
 *  independent removal, and its price is display-only — the parent's lineTotal
 *  is the authoritative figure and the client must never sum these. */
export interface QSegment {
  id: string;
  productSlug: string;
  width: string;
  height: string;
  qtyPerParent: number;
  qty: number;
  lineTotal: number | null;
}

export interface QFile {
  id: string | number; name: string; kind: string;
  status: "Uploaded" | "Processing" | "Needs attention";
  /** Server-detected document type (schedule | energy_report | plans | supporting);
   *  null until classification lands — the rail shows "SORTING…". */
  docType?: string | null;
}
export const DEFAULT_PROJECT_TITLE = "My Project";

export interface QuoteState {
  items: QItem[];
  files: QFile[];
  title: string;                    // editable project name (defaults to DEFAULT_PROJECT_TITLE)
  setTitle: (t: string) => void;
  // `code` is optional on input — the store assigns a suggested one when omitted.
  add: (i: Omit<QItem, "id" | "code"> & { code?: string }) => number;
  update: (id: number, patch: Partial<QItem>) => void;
  remove: (id: number) => void;
  copy: (id: number) => number | undefined;
  addFiles: (f: QFile[]) => void;
  removeFile: (id: number) => void;
  // Replace the whole line set (used after a schedule parse re-hydrates from the
  // server). Assigns fresh local ids.
  setItems: (items: Omit<QItem, "id">[]) => void;
  // Clear the whole project back to zero — lines AND the attached schedule file —
  // both locally and on the server. The single source-file per quote is integral
  // to an order, so it is only removable via this whole-project reset.
  clearAll: () => void | Promise<void>;
  // Re-hydrate lines + the attached file from the server (after a parse).
  reload: () => Promise<void>;
}

// Review fields that a plain edit resolves, so the estimator can drop the flag once
// the customer has touched the corresponding field.
export function clearReviewKey(review: Record<string, string> | null | undefined, key: string): Record<string, string> | null {
  if (!review) return null;
  const { [key]: _drop, ...rest } = review;
  return Object.keys(rest).length ? rest : null;
}

// ─── Review severity (submission lifecycle) ───────────────────────────────────
// TWO severities, one registry — the single source of truth for whether a line
// blocks. Everything downstream (the red border, the header pill, the sticky
// counters, the submit gate, the server check) derives from THIS map, so they can
// never disagree.
//
//  • error   — critical input only the CUSTOMER can supply, and without it the
//              line cannot be priced at all. BLOCKS submission.
//  • warning — the opening is valid but a product/constraint mismatch needs an
//              technical decision (composite unit, substitution, glazing).
//              The line is PRICED best-fit (indicative) and NEVER blocks —
//              submission is exactly how it reaches the technician.
export type ReviewSeverity = "error" | "warning";

export const REVIEW_SEVERITY: Record<string, ReviewSeverity> = {
  // Critical missing input — the customer must resolve these.
  dims: "error",              // size unreadable/absent
  qty: "error",               // quantity unreadable — never silently assumed
  measuredBy: "error",        // frame vs opening unknown — changes the size
  options: "error",           // a required option is unset
  product: "error",           // no product at all and none can be substituted
  // technical decisions — priced best-fit, flagged, submittable.
  fit: "warning",             // outside standard range ⇒ composite/custom unit
  substitute: "warning",      // no exact family ⇒ nearest product priced instead
  material: "warning",        // e.g. timber schedule → aluminium catalogue
  type: "warning",
  note: "warning",
  glazing: "warning",
  thermalRecommendation: "warning",
  customerConfigurationChanged: "warning",
  noLongerInDocuments: "warning",
};

// An UNKNOWN review key is treated as a warning, deliberately: a new key must
// never silently block every customer's submission. Unrecognised reasons still
// show on the line and still reach the technician.
export const severityOf = (key: string): ReviewSeverity => REVIEW_SEVERITY[key] ?? "warning";

/** The highest severity present on a line's review reasons (error > warning). */
export function reviewSeverity(review: Record<string, string> | null | undefined): ReviewSeverity | null {
  if (!review) return null;
  const keys = Object.keys(review);
  if (!keys.length) return null;
  if (keys.some((k) => severityOf(k) === "error")) return "error";
  return "warning";
}

/** Legacy vocabulary ("customer" ≡ error, "technical" ≡ warning), kept so older
 *  call sites keep reading naturally. Derives from the one registry above. */
export function reviewClass(review: Record<string, string> | null | undefined): "customer" | "technical" | null {
  const s = reviewSeverity(review);
  return s === "error" ? "customer" : s === "warning" ? "technical" : null;
}

// Does this line block submission? Derived from REVIEW_SEVERITY, so the gate, the
// red border and the sticky counters can never disagree:
//
//   block ⇔ an ERROR-severity reason is present
//         ∨ the line cannot be priced and no WARNING explains why
//
// A warning-flagged line is priced best-fit (indicative) and stays submittable —
// submission is exactly how a technical decision gets made. This is the
// single source of truth shared by the client submit gate and the server.
export function lineBlocksSubmission(it: {
  productSlug: string; width: string; height: string; options: Record<string, string>; qty: number;
  origin?: string; aiPriced?: boolean; lineTotal?: number | null;
  review?: Record<string, string> | null;
}): boolean {
  const severity = reviewSeverity(it.review);
  if (severity === "error") return true;
  // Priced-ness is the SERVER's answer, for every origin. The browser holds no
  // rate data and must not form a second opinion about whether a line can be
  // sold — that is how the two engines diverged in the first place.
  const priced = typeof it.lineTotal === "number" && Number.isFinite(it.lineTotal);
  return !priced && severity !== "warning";
}

/** Customer-visible total — always the server's figure, never recomputed here.
 *  Rate cards, option surcharges and conditional modifiers are commercial data
 *  in D1; the browser renders what the server priced. An unpriced line reads 0
 *  and is caught by lineBlocksSubmission, not papered over with an estimate. */
export function linePriceTotal(it: { lineTotal?: number | null }): number {
  return typeof it.lineTotal === "number" && Number.isFinite(it.lineTotal) ? it.lineTotal : 0;
}

// ─── Item codes (schedule/builder references) ─────────────────────────────────
export const normCode = (c: string) => (c || "").trim().toUpperCase();

// Suggest the next code for a product: W## for windows, D## for doors, continuing
// from the highest existing number under that prefix in the current project.
export function suggestCode(items: QItem[], productSlug: string): string {
  const prefix = getProductBySlug(productSlug)?.categorySlug === "doors" ? "D" : "W";
  let max = 0;
  for (const it of items) {
    const m = /^([A-Za-z]+)\s*(\d+)$/.exec((it.code || "").trim());
    if (m && m[1].toUpperCase() === prefix) max = Math.max(max, parseInt(m[2]));
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

// Does this item's code collide with another item's code in the project?
export function hasDuplicateCode(items: QItem[], id: number, code: string): boolean {
  const n = normCode(code);
  return !!n && items.some(it => it.id !== id && normCode(it.code) === n);
}

// ─── Rate model — REMOVED FROM THE BROWSER ────────────────────────────────────
// The per-family $/m perimeter and $/m² area table used to live here, which meant
// it shipped in the JS bundle and anyone could read the pricing model from
// devtools. It is commercial data and now exists only in D1 (pricing_rate_card),
// alongside the option surcharges and the conditional modifiers.
//
// Nothing in the browser prices a line. The server does it in priceItem()
// (worker/lib/lines.ts) and the composer asks for a live figure through
// POST /api/projects/current/price-preview.

// ─── Option surcharges ($ over the included/standard choice) ───────────────────
const OPTION_ADD: Record<string, number> = {
  "Standard Powercoat": 0, "Anodised": 220, "Woodgrain": 260, "Custom Colour": 180,
  "None": 0, "Fiber Glass": 70, "Aluminium": 110, "Retractable Flyscreen": 240,
  "0.3mm Stainless Steel": 130, "0.5mm Stainless Steel": 160, "0.8mm Stainless Steel": 190,
  "Sub Sill & Head": 90, "Timber Reveal": 120, "T Fin": 40, "Bracket": 30, "Nail Fin": 35, "Screw": 20,
};
const TYPE_DEFAULT_ADD: Record<string, number> = { hardware: 60, colour: 200, flyscreen: 100, installation: 60 };

// Standard options are included; optional ones cost the shared price from the
// option itself (single source of truth — edit it once in Sanity, every product
// updates). The hardcoded tables below are only a fallback for the built-in
// catalogue.ts, which carries no per-option prices.
function optionAdd(o: { typeSlug: string; name: string; availability: string; price?: number }): number {
  if (o.availability === "standard") return 0;
  if (typeof o.price === "number") return o.price;
  if (o.name in OPTION_ADD) return OPTION_ADD[o.name];
  return TYPE_DEFAULT_ADD[o.typeSlug] ?? 80;
}

// ─── Option groups for the configurator UI ────────────────────────────────────
export interface OptionChoice { name: string; add: number; standard: boolean; hex?: string }

// Most-popular colours surfaced for direct selection; the rest live under "Other".
export const POPULAR_COLOURS = ["Dover White", "Shale Grey", "Monument", "Night Sky"];
export interface OptionGroup { typeSlug: string; label: string; required: boolean; choices: OptionChoice[]; defaultName: string }

const TYPE_ORDER = ["colour", "hardware", "flyscreen", "installation"];
// Every option a product offers must be chosen before the item can be saved or
// submitted — each group is required and starts with a default (see defaultOptions).

export function optionGroupsFor(p: Product): OptionGroup[] {
  const byType = new Map<string, { label: string; choices: OptionChoice[] }>();
  for (const o of p.options) {
    if (o.typeSlug === "colour") continue; // colour uses the shared Colorbond palette below
    if (!byType.has(o.typeSlug)) byType.set(o.typeSlug, { label: o.typeName, choices: [] });
    byType.get(o.typeSlug)!.choices.push({ name: o.name, add: optionAdd(o), standard: o.availability === "standard" });
  }
  // Colour: the standard Colorbond range (name + swatch), all included in the base price.
  byType.set("colour", {
    label: "Colour",
    choices: colorbondColourOptions.map(o => ({ name: o.name, add: o.price ?? 0, standard: o.availability === "standard", hex: o.hex })),
  });
  const groups: OptionGroup[] = [];
  for (const [typeSlug, { label, choices }] of byType) {
    // Keep the Colorbond palette in its curated order; sort every other group as before.
    if (typeSlug !== "colour") choices.sort((a, b) => (a.standard === b.standard ? a.add - b.add : a.standard ? -1 : 1));
    const def = choices.find(c => c.standard)?.name ?? choices[0]?.name ?? "";
    groups.push({ typeSlug, label, required: true, choices, defaultName: def });
  }
  groups.sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a.typeSlug), ib = TYPE_ORDER.indexOf(b.typeSlug);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return groups;
}

// Preselect a default for EVERY group — the standard choice, else the first
// available — so an item never starts with a missing option.
export function defaultOptions(p: Product): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of optionGroupsFor(p)) {
    const std = g.choices.find(c => c.standard);
    out[g.typeSlug] = std?.name ?? g.choices[0]?.name ?? "";
  }
  return out;
}

const DEMO_SCHEDULE_ITEMS = [
  { code: "W01", productSlug: "amj80-series-sliding-window", location: "Living room", measuredBy: "opening" as const, width: "1750", height: "1200", qty: 4 },
  { code: "W02", productSlug: "amj80-series-awning-window", location: "Kitchen", measuredBy: "opening" as const, width: "900", height: "1200", qty: 2 },
  { code: "W04", productSlug: "amj80-series-casement-window", location: "Bedroom 1", measuredBy: "" as const, width: "700", height: "", qty: 2 },
];

// Shared demo import used by every simulated schedule-upload entry point.
export function addDemoSchedule(quote: QuoteState): void {
  for (const item of DEMO_SCHEDULE_ITEMS) {
    const product = getProductBySlug(item.productSlug);
    quote.add({
      ...item,
      options: product ? defaultOptions(product) : {},
      status: item.height ? "Ready" : "Needs review",
    });
  }
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
export interface PriceResult { unit: number; total: number; ok: boolean; missing: string[] }

// ─── Formatting + labels ──────────────────────────────────────────────────────
export const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
export const mm = (v: string | number) => {
  const n = typeof v === "string" ? parseInt(v) : v;
  return n ? `${n.toLocaleString("en-AU")} mm` : "—";
};
export const productLabel = (slug: string) => getProductBySlug(slug)?.name ?? "Product";

// ─── Two-field product picker (quote-page composer) ───────────────────────────
// Field 1 = product type (family, grouped by category); field 2 = product.
export interface FamilyGroup { category: string; families: { slug: string; name: string }[] }
export function familyGroups(): FamilyGroup[] {
  return getCategories().map(c => ({
    category: c.name,
    families: getFamiliesByCategory(c.slug).map(f => ({ slug: f.slug, name: f.name })),
  }));
}
