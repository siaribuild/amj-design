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
import { getProductBySlug } from "../../src/data/catalogue";
import { glazingOf } from "./figures";
import { productColours } from "../../src/data/configurator";
import { ensureCatalogue } from "./catalogue";
import { pricingOptionSlugsFromOptions } from "./estimator/estimate";
import { priceLine } from "./estimator/pricing";
import { uuid, normNote } from "./util";

// The line shape exchanged with the client. `id` is the STABLE server line id —
// the client round-trips it as `serverId` so a save upserts (never delete+recreate)
// and the parse_line → quote_line provenance link survives autosave and submit.
/** One unit of a composite opening. It stays nested under the architectural
 * opening and carries no independent tag or room. */
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
  options: Record<string, string>;
  status: "Ready" | "Needs review";
  /** Free text on the unit, stored in room_label — the same column an opening
   *  uses. From the customer's side a unit carries exactly the same kind of
   *  information as a childless opening; the only difference is that it has a
   *  parent (owner). */
  note: string;
}

export interface ApiLine {
  id: string;
  code: string;
  productSlug: string;
  location: string;
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
  compositeAxis?: "vertical" | "horizontal" | null;
  /** Units-minus-opening along the split axis, in mm. Parents only. */
  coverageDeltaMm?: number | null;
  /** Server verdict on that delta against the ops tolerance. Parents only. */
  coverageOutOfTolerance?: boolean;
}

// A D1 quote_line row (columns we read back).
export interface LineRow {
  id: string;
  external_ref: string | null;
  room_label: string | null;
  product_slug: string;
  options_json: string;
  dims_json: string;
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
  composite_axis?: string | null;
  line_kind?: string | null;
  coverage_delta_mm?: number | null;
}

export function rowToApiLine(r: LineRow): ApiLine {
  const dims = safeParse(r.dims_json);
  const review = r.review_json ? safeParse(r.review_json) : null;
  return {
    id: r.id,
    code: r.external_ref ?? "",
    productSlug: r.product_slug,
    location: r.room_label ?? "",
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
    compositeAxis: r.composite_axis === "horizontal" ? "horizontal" : r.composite_axis === "vertical" ? "vertical" : null,
    // How far the units' sizes sum from the opening they were split out of,
    // along the split axis. recomputeComposite() has always derived this on
    // every segment mutation; it simply never left the server, so the customer
    // could not be told when their units stopped adding up to their opening.
    // Positive = the units overrun the opening, negative = they fall short.
    coverageDeltaMm: typeof r.coverage_delta_mm === "number" ? r.coverage_delta_mm : null,
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
function chargeableOptionSlugs(productSlug: string, options: Record<string, unknown>): string[] {
  const product = getProductBySlug(productSlug);
  const slugs: string[] = [];
  for (const [typeSlug, value] of Object.entries(options)) {
    if (!value || typeof value !== "string") continue;
    if (typeSlug === "glazing") continue;              // the glass is handled below as a per-m² identity
    // Colour resolves through the SAME rule the editor offers: the product's own
    // range when it names one, the shared palette when it does not. Reaching
    // straight for the global list would price a finish the picker never showed
    // — and, worse, accept one.
    const match = typeSlug === "colour"
      ? productColours(product).find((o) => o.name === value)
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
  // The glass is a per-m² chargeable option, not part of the base rate. Price the
  // build-up the line SELECTED (options.glazing) when it is one this product's frame
  // actually offers; otherwise the product's default glass identity. Validating
  // against the frame's own thermal matrix stops a client pricing an off-list glass.
  // (Both are absent on the built-in fallback catalogue, where glass rides the area rate.)
  // ONE SPELLING, imported. `figures.ts` names this line as the authority its
  // own `glazingOf` must match; it was two copies agreeing by hand until now.
  const chosen = glazingOf(options);
  const offered = new Set((product?.thermal ?? []).map((t) => t.slug).filter((s): s is string => !!s));
  if (chosen && !offered.has(chosen)) {
    console.log(`[pricing] glazing "${chosen}" not offered by "${productSlug}" — using the default glass`);
  }
  const glazingSlug = chosen && offered.has(chosen) ? chosen : product?.defaultGlazingSlug;
  if (glazingSlug) slugs.push(glazingSlug);
  return slugs;
}

/** THE pricing entry point for a configured line. Every path that needs a price
 *  — the customer save, the schedule parse, the ops edit, the live preview —
 *  goes through here, so there is one engine and one set of rules. Returns null
 *  when the line cannot be priced; callers must not substitute an estimate. */
export async function priceItem(env: Env, it: {
  productSlug: string; width: string; height: string; options: Record<string, unknown>; qty: number;
  /** Owner of the project, for the account discount. Anonymous ⇒ null ⇒ 0%. */
  ownerUserId?: string | null;
}): Promise<number | null> {
  await ensureCatalogue(env);
  // The rate card is keyed on the PRODUCT (0031), not its family: two frames in
  // one family are not the same cost, and the family key made them inseparable.
  // The product must exist in the catalogue — an unknown slug has no card and
  // must not fall through to a generic rate.
  const product = getProductBySlug(it.productSlug);
  const w = parseInt(it.width) || 0;
  const h = parseInt(it.height) || 0;
  if (!product || w <= 0 || h <= 0) return null;
  const snapshot = await priceLine(env, {
    family: product.slug, widthMm: w, heightMm: h, qty: Math.max(1, Math.floor(it.qty) || 1),
    optionSlugs: chargeableOptionSlugs(it.productSlug, it.options),
    ownerUserId: it.ownerUserId ?? null,
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
//
// `ownerUserId` is the project's owner, used only for the account discount. The
// ROUTE passes it from the resolved project — never read off the request body,
// because a percentage off the price is precisely the field a browser would like
// to set for itself.
/** THE product a client item names. Read before a save batch to build its one
 *  catalogue consultation, and inside itemFields to store it — one expression,
 *  so the two can never disagree about what the item chose. */
export const itemProductSlug = (raw: unknown): string =>
  String(((raw ?? {}) as Record<string, unknown>).productSlug ?? "");

/** The options a client item names, on the same terms itemFields stores them —
 *  read before a save batch to decide which picks moved, and inside itemFields
 *  to serialise them. One expression, so the two cannot disagree. */
export const itemOptions = (raw: unknown): Record<string, unknown> => {
  const o = ((raw ?? {}) as Record<string, unknown>).options;
  return (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
};

export async function itemFields(env: Env, raw: unknown, ownerUserId?: string | null) {
  const it = (raw ?? {}) as Record<string, unknown>;
  const width = String(it.width ?? "");
  const height = String(it.height ?? "");
  const options = itemOptions(raw);
  const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
  const productSlug = itemProductSlug(raw);

  const lineTotal = await priceItem(env, { productSlug, width, height, options, qty, ownerUserId });
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
    room_label: normNote(it.location) || null,
    product_slug: productSlug,
    options_json: JSON.stringify(options),
    dims_json: JSON.stringify(dimsJson(width, height)),
    qty,
    line_total: lineTotal,
    status,
    origin,
    review_json: review ? JSON.stringify(review) : null,
  };
}

// A brand-new line: the shared fields plus a fresh server id and position.
export async function itemToInsert(env: Env, projectId: string, raw: unknown, position: number, ownerUserId?: string | null) {
  return { id: uuid(), project_id: projectId, position, ...(await itemFields(env, raw, ownerUserId)) };
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

/** THE dims_json shape. Every writer goes through here so no two paths disagree
 *  about whether 2050 is a number or a string — see dimsEq for what that cost. */
export const dimsJson = (width: unknown, height: unknown) => ({
  width: String(width ?? ""), height: String(height ?? ""),
});

/** Dimensions compare by VALUE, never by JSON type.
 *
 *  The AI proposal path wrote {"width":2050} (widthMm is a number) and every
 *  customer save writes {"width":"2050"}, so the deep compare below found them
 *  different and flagged dims_json as edited on the FIRST autosave after a
 *  proposal — no customer had touched anything. For an ai-managed line that is
 *  not a cosmetic flag: it takes the branch that nulls line_total and sends the
 *  line to technical review, so an entire AI-quoted project lost every price the
 *  moment it was opened. dimsJson() fixes new rows; this fixes the ones already
 *  written, which no deploy can go back and re-serialise. */
const dimsEq = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const norm = (s: string | null | undefined) => {
    const o = safeParse(s || "{}");
    const n = (v: unknown) => {
      const x = typeof v === "number" ? v : parseFloat(String(v ?? ""));
      return Number.isFinite(x) ? String(x) : String(v ?? "");
    };
    return `${n(o.width)}×${n(o.height)}`;
  };
  return norm(a) === norm(b);
};

export interface EditableSnapshot { product_slug: string | null; options_json: string | null; dims_json: string | null; qty: number | null; edited_fields: string | null }

/** The union of previously-edited groups and whatever this save actually changed
 *  on a schedule-origin line. Returns the JSON to store (null when nothing has
 *  ever been edited — keeps rows clean for the importer's fast path). */
/** Which of the four priced field groups this save actually changes.
 *
 *  ONE place asks that question, because two call sites now need it and they
 *  need opposite halves of the answer: `editedFieldsAfterSave` wants the names
 *  so it can union them onto the record, and `sameConfiguration` wants only
 *  whether the list is empty. */
function changedGroups(stored: EditableSnapshot, incoming: Awaited<ReturnType<typeof itemFields>>): string[] {
  const out: string[] = [];
  if ((stored.product_slug ?? "") !== incoming.product_slug) out.push("product_slug");
  if (!jsonEq(stored.options_json, incoming.options_json)) out.push("options_json");
  if (!dimsEq(stored.dims_json, incoming.dims_json)) out.push("dims_json");
  if ((stored.qty ?? null) !== incoming.qty) out.push("qty");
  return out;
}

/** Does the incoming save describe the configuration the row already holds?
 *
 *  The repair branch prices the INCOMING fields and persists none of them, on
 *  purpose — an autosave must not overwrite the AI's configuration with a second
 *  opinion. Because the record keeps the UNION of every group ever edited, a
 *  second change to a listed group lands there too, and its price then belongs
 *  to a configuration the row does not hold. Anything that would publish or
 *  unblock such a line has to ask this first. */
export function sameConfiguration(stored: EditableSnapshot, incoming: Awaited<ReturnType<typeof itemFields>>): boolean {
  return changedGroups(stored, incoming).length === 0;
}

export function editedFieldsAfterSave(stored: EditableSnapshot, incoming: Awaited<ReturnType<typeof itemFields>>): string | null {
  let prior: string[] = [];
  try { const v = JSON.parse(stored.edited_fields || "[]"); if (Array.isArray(v)) prior = v.filter((x) => typeof x === "string"); } catch { /* none */ }
  const now = new Set([...prior, ...changedGroups(stored, incoming)]);
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

/** Re-price a user's pre-issue drafts after their referral eligibility changed.
 *
 *  WHY THIS EXISTS AT ALL: line totals are STORED, not recomputed on read. A
 *  referred tradie with two drafts who orders one is left holding a second still
 *  carrying a discount they are no longer entitled to, and it would stay wrong
 *  until something unrelated happened to re-price it.
 *
 *  Eligibility itself needs no write — "used" is derived from the order existing.
 *  This only makes the stored figures agree with that derivation.
 *
 *  ISSUED QUOTES ARE EXCLUDED BY THE STATE FILTER, and that is the point rather
 *  than an oversight: an issued price is one a customer has been shown and may
 *  have accepted, so re-pricing it would change a number after the fact. Only
 *  pre-issue states are touched.
 *
 *  Lives here beside `priceItem` because it is a pricing act, not a referral one.
 *
 *  ⚠️ IT RE-PRICES IN BOTH DIRECTIONS, which is why it is no longer called
 *  "strip". `priceItem` derives the discount live from `referralDiscountState`,
 *  so this function takes the discount OFF when eligibility ended (used, lapsed,
 *  voided) and puts it BACK when a void is reversed. One function, because there
 *  is one question — what should these lines cost today? — and two answers to it
 *  would drift.
 *
 *  ⚠️ IT REPORTS WHAT IT COULD NOT PRICE. A line whose product has left the
 *  catalogue, or whose option lost its surcharge row in a price-list rework,
 *  prices to null and is skipped — it keeps whatever total it was last written
 *  with. Silently swallowing that is how a lapsed discount became permanent: the
 *  caller stamped the referral as processed and nothing ever looked again. The
 *  ids come back so a caller with a retry can decline to stamp.
 */
export async function repriceReferralDrafts(
  env: Env,
  ownerUserId: string,
  excludeProjectId?: string,
): Promise<{ unpriceableLineIds: string[] }> {
  const { results } = await env.DB
    .prepare(
      `SELECT l.id, l.product_slug, l.dims_json, l.options_json, l.qty
         FROM quote_line l JOIN project p ON p.id = l.project_id
        WHERE p.owner_user_id = ?
          AND (? IS NULL OR p.id <> ?)
          AND l.parent_line_id IS NULL
          -- An operator's deliberate price stands. AC-59: an override is a
          -- decision, and a sweep must not quietly undo one.
          AND l.price_calculated IS NULL
          AND NOT EXISTS (SELECT 1 FROM "order" o WHERE o.project_id = p.id)
          AND (p.status_customer = 'draft' OR p.status_internal IN
               ('submitted','triage_pending','estimator_assigned',
                'technical_review_required','customer_clarification_required'))`,
    )
    .bind(ownerUserId, excludeProjectId ?? null, excludeProjectId ?? null)
    .all<{ id: string; product_slug: string; dims_json: string | null; options_json: string | null; qty: number }>();

  const unpriceableLineIds: string[] = [];
  for (const line of results ?? []) {
    const dims = safeParse(line.dims_json ?? "") as { width?: string; height?: string };
    const total = await priceItem(env, {
      productSlug: line.product_slug,
      width: String(dims.width ?? ""),
      height: String(dims.height ?? ""),
      options: safeParse(line.options_json ?? "") as Record<string, string>,
      qty: line.qty,
      ownerUserId,
    });
    // Reported, not swallowed. The stale total stays on the row — there is no
    // honest number to replace it with — but the caller is told, so a referral
    // is not stamped "reconciled" over the top of a line that is not.
    if (total === null) {
      unpriceableLineIds.push(line.id);
      continue;
    }
    await env.DB.prepare("UPDATE quote_line SET line_total = ? WHERE id = ?").bind(total, line.id).run();
  }
  return { unpriceableLineIds };
}
