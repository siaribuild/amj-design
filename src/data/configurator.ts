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
import { type Product, getProductBySlug, getCategories, getFamiliesByCategory } from "./catalogue";

// ─── Quote (MyProject) state ──────────────────────────────────────────────────
export type MeasuredBy = "" | "frame" | "opening" | "unsure";
export const MEASURED_LABELS: Record<Exclude<MeasuredBy, "">, string> = {
  frame: "Frame size", opening: "Opening size", unsure: "Not sure",
};

export interface QItem {
  id: number;
  productSlug: string;
  location: string;
  measuredBy: MeasuredBy; // how the customer measured — kept for technical review
  width: string;   // mm (string while editing)
  height: string;  // mm
  options: Record<string, string>; // optionTypeSlug -> chosen option name
  qty: number;
  status: "Ready" | "Needs review";
}
export interface QFile { id: number; name: string; kind: string; status: "Uploaded" | "Processing" | "Needs attention" }
export interface QuoteState {
  items: QItem[];
  files: QFile[];
  add: (i: Omit<QItem, "id">) => number;
  update: (id: number, patch: Partial<QItem>) => void;
  remove: (id: number) => void;
  copy: (id: number) => void;
  addFiles: (f: QFile[]) => void;
  removeFile: (id: number) => void;
}

// ─── Rate model ($/m perimeter, $/m² area) per family ─────────────────────────
const RATES: Record<string, { perim: number; area: number }> = {
  "sliding-window":        { perim: 45,  area: 300 },
  "awning-window":         { perim: 55,  area: 340 },
  "casement-window":       { perim: 55,  area: 350 },
  "glass-louvre":          { perim: 60,  area: 320 },
  "tilt-and-turn-window":  { perim: 90,  area: 520 },
  "sashless-double-hung":  { perim: 60,  area: 360 },
  "single-hung-window":    { perim: 50,  area: 330 },
  "sliding-door":          { perim: 85,  area: 420 },
  "casement-door":         { perim: 95,  area: 460 },
  "bi-fold-door":          { perim: 130, area: 520 },
  "pivot-door":            { perim: 160, area: 640 },
  "slim-frame-sliding-door": { perim: 150, area: 560 },
  "lift-slide-door":       { perim: 150, area: 600 },
};
const DEFAULT_RATE = { perim: 60, area: 380 };

// ─── Option surcharges ($ over the included/standard choice) ───────────────────
const OPTION_ADD: Record<string, number> = {
  "Standard Powercoat": 0, "Anodised": 220, "Woodgrain": 260, "Custom Colour": 180,
  "None": 0, "Fiber Glass": 70, "Aluminium": 110, "Retractable Flyscreen": 240,
  "0.3mm Stainless Steel": 130, "0.5mm Stainless Steel": 160, "0.8mm Stainless Steel": 190,
  "Sub Sill & Head": 90, "Timber Reveal": 120, "T Fin": 40, "Bracket": 30, "Nail Fin": 35, "Screw": 20,
};
const TYPE_DEFAULT_ADD: Record<string, number> = { hardware: 60, colour: 200, flyscreen: 100, installation: 60 };

function optionAdd(o: { typeSlug: string; name: string; availability: string }): number {
  if (o.availability === "standard") return 0;
  if (o.name in OPTION_ADD) return OPTION_ADD[o.name];
  return TYPE_DEFAULT_ADD[o.typeSlug] ?? 80;
}

// ─── Option groups for the configurator UI ────────────────────────────────────
export interface OptionChoice { name: string; add: number; standard: boolean }
export interface OptionGroup { typeSlug: string; label: string; required: boolean; choices: OptionChoice[]; defaultName: string }

const TYPE_ORDER = ["colour", "hardware", "flyscreen", "installation"];
const REQUIRED_TYPES = new Set(["colour", "hardware"]);

export function optionGroupsFor(p: Product): OptionGroup[] {
  const byType = new Map<string, { label: string; choices: OptionChoice[] }>();
  for (const o of p.options) {
    if (!byType.has(o.typeSlug)) byType.set(o.typeSlug, { label: o.typeName, choices: [] });
    byType.get(o.typeSlug)!.choices.push({ name: o.name, add: optionAdd(o), standard: o.availability === "standard" });
  }
  const groups: OptionGroup[] = [];
  for (const [typeSlug, { label, choices }] of byType) {
    choices.sort((a, b) => (a.standard === b.standard ? a.add - b.add : a.standard ? -1 : 1));
    const def = choices.find(c => c.standard)?.name ?? "";
    groups.push({ typeSlug, label, required: REQUIRED_TYPES.has(typeSlug), choices, defaultName: def });
  }
  groups.sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a.typeSlug), ib = TYPE_ORDER.indexOf(b.typeSlug);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return groups;
}

// Standards preselected; optional groups without a standard start unset.
export function defaultOptions(p: Product): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of optionGroupsFor(p)) {
    const std = g.choices.find(c => c.standard);
    if (std) out[g.typeSlug] = std.name;
    else if (g.required) out[g.typeSlug] = g.choices[0]?.name ?? "";
  }
  return out;
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
export interface PriceResult { unit: number; total: number; ok: boolean; missing: string[] }

export function priceConfigured(it: {
  productSlug: string; width: string; height: string; options: Record<string, string>; qty: number;
}): PriceResult {
  const p = getProductBySlug(it.productSlug);
  const w = parseInt(it.width) || 0, h = parseInt(it.height) || 0;
  const groups = p ? optionGroupsFor(p) : [];

  const missing: string[] = [];
  if (!p) missing.push("product");
  if (!w) missing.push("width");
  if (!h) missing.push("height");
  for (const g of groups) if (g.required && !it.options[g.typeSlug]) missing.push(g.label.toLowerCase());
  if (!p || !w || !h) return { unit: 0, total: 0, ok: false, missing };

  const rate = RATES[p.familySlug] ?? DEFAULT_RATE;
  let unit = (2 * (w + h)) / 1000 * rate.perim + (w * h) / 1_000_000 * rate.area;
  for (const g of groups) {
    const chosen = g.choices.find(c => c.name === it.options[g.typeSlug]);
    if (chosen) unit += chosen.add;
  }
  unit = Math.round(unit / 10) * 10;
  return { unit, total: unit * it.qty, ok: missing.length === 0, missing };
}

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
