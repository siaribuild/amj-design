// Mapping between the client's QItem shape and normalized quote_line rows,
// plus authoritative server-side pricing.
//
// Pricing runs through ONE engine — priceLine → computePrice — reading rate
// cards, option surcharges and conditional modifiers from D1. The browser prices
// nothing; it renders the line_total this returns.
//
// Before unification a second engine (priceConfigured) lived in
// src/data/configurator.ts. It shipped the whole rate table to every visitor in
// the JS bundle, and it had no modifier concept — so the owner's
// "width > 1200mm ⇒ +10%" rule silently never applied to manual or schedule
// lines, only to AI ones.
import type { Env } from "../types";
import { colorbondColourOptions, getProductBySlug } from "../../src/data/catalogue";
import { type MeasuredBy } from "../../src/data/configurator";
import { ensureCatalogue } from "./catalogue";
import { pricingOptionSlugsFromOptions } from "./estimator/estimate";
import { priceLine } from "./estimator/pricing";
import { uuid } from "./util";

// The line shape exchanged with the client. `id` is the STABLE server line id —
// the client round-trips it as `serverId` so a save upserts (never delete+recreate)
// and the parse_line → quote_line provenance link survives autosave and submit.
/** One unit of a composite opening. Not a line: it never enters the customer's
 *  item list, has no architect tag of its own, and is never independently
 *  removable or editable by them. It describes HOW the parent gets built. */
export interface ApiSegment {
  id: string;
  productSlug: string;
  width: string;
  height: string;
  /** How many of this frame go into ONE opening (a symmetric split is one
   *  segment with 2, not two identical rows). */
  qtyPerParent: number;
  qty: number;
  /** Display-only. The parent's lineTotal is authoritative — never sum these. */
  lineTotal: number | null;
}

export interface ApiLine {
  id: string;
  code: string;
  productSlug: string;
  location: string;
  measuredBy: MeasuredBy;
  width: string;
  height: string;
  options: Record<string, string>;
  qty: number;
  status: "Ready" | "Needs review";
  lineTotal: number | null;
  /** 'manual' | 'schedule' — how the line entered the project. */
  origin?: string;
  aiPriced?: boolean;
  /** Per-field {field: reason} for parsed lines that need confirmation. */
  review?: Record<string, string> | null;
}

const MEASURED = new Set(["", "frame", "opening", "unsure"]);

// A D1 quote_line row (columns we read back).
export interface LineRow {
  id: string;
  external_ref: string | null;
  room_label: string | null;
  product_slug: string;
  options_json: string;
  dims_json: string;
  measured_by: string;
  qty: number;
  line_total: number | null;
  status: string;
  origin?: string | null;
  review_json?: string | null;
  ai_proposal_line_id?: string | null;
  selected_variant_id?: string | null;
  configuration_snapshot_json?: string | null;
  pricing_snapshot_json?: string | null;
  recommendation_basis?: string | null;
  recommendation_confidence?: string | null;
}

export function rowToApiLine(r: LineRow): ApiLine {
  const dims = safeParse(r.dims_json);
  const review = r.review_json ? safeParse(r.review_json) : null;
  return {
    id: r.id,
    code: r.external_ref ?? "",
    productSlug: r.product_slug,
    location: r.room_label ?? "",
    measuredBy: (MEASURED.has(r.measured_by) ? r.measured_by : "") as MeasuredBy,
    width: String(dims.width ?? ""),
    height: String(dims.height ?? ""),
    options: safeParse(r.options_json) as Record<string, string>,
    qty: r.qty || 1,
    // 'ready' ⇒ Ready; incomplete/technical_review/… ⇒ Needs review.
    status: r.status === "ready" ? "Ready" : "Needs review",
    lineTotal: r.line_total,
    origin: r.origin ?? "manual",
    aiPriced: !!r.ai_proposal_line_id,
    review: review && Object.keys(review).length ? (review as Record<string, string>) : null,
  };
}

// The mutable columns of a quote_line, normalized + server-priced from one client
// item. Shared by the INSERT (new line) and UPDATE (existing line) paths so the
// pricing/status rules can't diverge between them. `origin` is included but treated
const canonSlug = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Which chosen options actually carry a surcharge, as D1 surcharge ids.
 *
 *  The split follows the ownership rule: SANITY maps which options a product
 *  offers and which one is standard for it; D1 owns what a non-standard option
 *  costs. So availability is read from the catalogue and the price from D1.
 *
 *  A standard option contributes NO slug — it is included in the base rate, and
 *  charging for it is exactly the bug the parity test caught (a 1200×900 sliding
 *  window priced $710 instead of $510 because all four standard choices were
 *  billed). Anything the catalogue does not recognise is logged, never guessed.
 */
function chargeableOptionSlugs(productSlug: string, options: Record<string, string>): string[] {
  const product = getProductBySlug(productSlug);
  const slugs: string[] = [];
  for (const [typeSlug, value] of Object.entries(options)) {
    if (!value || typeof value !== "string") continue;
    const match = typeSlug === "colour"
      ? colorbondColourOptions.find((o) => o.name === value)
      : product?.options.find((o) => o.typeSlug === typeSlug && o.name === value);
    if (!match) {
      // Reconciliation: the catalogue does not offer this option for this
      // product. Do not invent a price — say so, and let the line go unpriced.
      console.log(`[pricing] unknown option "${typeSlug}:${value}" for product "${productSlug}"`);
      continue;
    }
    if (match.availability === "standard") continue;   // included in the base rate
    slugs.push(`${canonSlug(typeSlug)}:${canonSlug(value)}`);
  }
  return slugs;
}

/** THE pricing entry point for a configured line. Every path that needs a price
 *  — the customer save, the schedule parse, the ops edit, the live preview —
 *  goes through here, so there is one engine and one set of rules. Returns null
 *  when the line cannot be priced; callers must not substitute an estimate. */
export async function priceItem(env: Env, it: {
  productSlug: string; width: string; height: string; options: Record<string, string>; qty: number;
}): Promise<number | null> {
  await ensureCatalogue(env);
  const family = getProductBySlug(it.productSlug)?.familySlug || null;
  const w = parseInt(it.width) || 0;
  const h = parseInt(it.height) || 0;
  if (!family || w <= 0 || h <= 0) return null;
  const snapshot = await priceLine(env, {
    family, widthMm: w, heightMm: h, qty: Math.max(1, Math.floor(it.qty) || 1),
    optionSlugs: chargeableOptionSlugs(it.productSlug, it.options),
    // Fail rather than under-price: an option with no D1 row is a data gap, and
    // treating it as free would issue a quote we would have to honour.
    requireAllOptions: true,
  }).catch((e) => {
    console.log(`[pricing] unpriceable ${it.productSlug} ${w}x${h}: ${String(e)}`);
    return null;
  });
  return snapshot?.ok ? snapshot.total : null;
}

// as server-owned by the caller: set on INSERT, never overwritten on UPDATE.
export async function itemFields(env: Env, raw: unknown) {
  const it = (raw ?? {}) as Record<string, unknown>;
  const width = String(it.width ?? "");
  const height = String(it.height ?? "");
  const options = (it.options && typeof it.options === "object" ? it.options : {}) as Record<string, string>;
  const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
  const productSlug = String(it.productSlug ?? "");
  const measured = String(it.measuredBy ?? "");

  const lineTotal = await priceItem(env, { productSlug, width, height, options, qty });
  const priced = { ok: lineTotal != null };

  // A line still carrying review reasons stays 'technical_review' (Needs review)
  // even if it happens to price; clearing the last flag (client drops resolved
  // keys) lets it fall back to ready/incomplete.
  const origin = String(it.origin ?? "manual") === "schedule" ? "schedule" : "manual";
  const review = it.review && typeof it.review === "object" && Object.keys(it.review as object).length
    ? (it.review as Record<string, string>)
    : null;
  // Unpriceable ⇒ 'incomplete' (customer must resolve, blocks submission), even if
  // it also carries review flags. Priced + flagged ⇒ 'technical_review' (we
  // technician resolves it — SUBMITTABLE). Priced + clean ⇒ 'ready'.
  const status = !priced.ok ? "incomplete" : review ? "technical_review" : "ready";

  return {
    external_ref: String(it.code ?? "") || null,
    room_label: String(it.location ?? "") || null,
    product_slug: productSlug,
    options_json: JSON.stringify(options),
    dims_json: JSON.stringify({ width, height }),
    measured_by: MEASURED.has(measured) ? measured : "",
    qty,
    line_total: lineTotal,
    status,
    origin,
    review_json: review ? JSON.stringify(review) : null,
  };
}

// A brand-new line: the shared fields plus a fresh server id and position.
export async function itemToInsert(env: Env, projectId: string, raw: unknown, position: number) {
  return { id: uuid(), project_id: projectId, position, ...(await itemFields(env, raw)) };
}

// The client round-trips the server line id as `serverId`. Returns it only when it
// is a non-empty string, so an unknown/absent value falls through to INSERT.
export function incomingServerId(raw: unknown): string | null {
  const v = (raw as Record<string, unknown>)?.serverId;
  return typeof v === "string" && v.length ? v : null;
}

// ── Human-edit provenance (0019, multi-file UX spec §1b) ─────────────────────
// Deep, key-order-insensitive comparison — a plain string compare of stored vs
// re-serialized JSON would false-flag every autosave as "edited" and freeze all
// future re-parses out of the guard.
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}
const jsonEq = (a: string | null | undefined, b: string | null | undefined): boolean => {
  try { return stable(JSON.parse(a || "null")) === stable(JSON.parse(b || "null")); } catch { return a === b; }
};

export interface EditableSnapshot { product_slug: string | null; options_json: string | null; dims_json: string | null; qty: number | null; edited_fields: string | null }

/** The union of previously-edited groups and whatever this save actually changed
 *  on a schedule-origin line. Returns the JSON to store (null when nothing has
 *  ever been edited — keeps rows clean for the importer's fast path). */
export function editedFieldsAfterSave(stored: EditableSnapshot, incoming: Awaited<ReturnType<typeof itemFields>>): string | null {
  let prior: string[] = [];
  try { const v = JSON.parse(stored.edited_fields || "[]"); if (Array.isArray(v)) prior = v.filter((x) => typeof x === "string"); } catch { /* none */ }
  const now = new Set(prior);
  if ((stored.product_slug ?? "") !== incoming.product_slug) now.add("product_slug");
  if (!jsonEq(stored.options_json, incoming.options_json)) now.add("options_json");
  if (!jsonEq(stored.dims_json, incoming.dims_json)) now.add("dims_json");
  if ((stored.qty ?? null) !== incoming.qty) now.add("qty");
  return now.size ? JSON.stringify([...now]) : null;
}

function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
