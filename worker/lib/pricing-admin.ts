// Ops → Pricing: the write side of the D1 commercial layer, plus reconciliation.
//
// THE BOUNDARY, in one sentence: ops writes the numbers, Sanity writes the words.
//
// Concretely, this module writes only tables whose values are money or commercial
// policy — pricing_rate_card, pricing_option_surcharge, pricing_modifier,
// pricing_policy. Everything a customer READS as language or looks at as a
// picture (names, descriptions, images, and the product↔option mapping including
// which option is `standard`) stays in Studio, which already has an editor staff
// use. Two writers over one object is the failure this codebase has already hit
// twice; a third editor is a repetition of it, not a mitigation.
//
// Every write goes through `applyPricingChange` — one helper, so no endpoint can
// quietly forget to bump the version, record the before/after, or log the event.
import type { Env } from "../types";
import { colorbondColourOptions, products } from "../../src/data/catalogue";
import { ensureCatalogue } from "./catalogue";
import {
  catalogueCandidateOfferability, createCatalogueRepository, sanityExecutor,
} from "./estimator/catalogue";
import type { CatalogueCandidate } from "./estimator/types";
import { uuid } from "./util";
import {
  computePrice, loadOptionSurcharges, loadPolicy,
  type PriceSnapshot, type PricingModifier, type RateCard,
} from "./estimator/pricing";

const canon = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ── Versioning ───────────────────────────────────────────────────────────────
// `version` is machine-managed and never a text field a human types: a person
// entering "v2" is a data-entry field pretending to be a control.
export function nextVersion(current: string | null | undefined): string {
  const n = parseInt(String(current ?? "v1").replace(/^v/i, ""), 10);
  return `v${(Number.isFinite(n) ? n : 1) + 1}`;
}

export class VersionConflict extends Error {
  constructor() { super("version_conflict"); }
}

/** The single writer for every pricing table.
 *
 *  Bumps the version and enforces optimistic concurrency on `expectedVersion`:
 *  two managers on one supplier increase is an ordinary afternoon, and a silent
 *  last-write-wins is how one of them loses their change without ever knowing.
 *
 *  DELIBERATELY does not keep a change history — no audit trail, no revert.
 *  Owner: never asked for it, and didn't want a bespoke history/revert
 *  mechanism sitting beside Cloudflare's own observability tooling. A bad
 *  edit is corrected by typing the right numbers back in. */
export async function applyPricingChange(env: Env, args: {
  table: "pricing_rate_card" | "pricing_option_surcharge" | "pricing_modifier" | "pricing_policy" | "delivery_zone" | "referral_program";
  rowId: string;
  actor: string;
  before: Record<string, unknown> & { version?: string };
  after: Record<string, unknown>;
  expectedVersion?: string | null;
  /** Performs the UPDATE/INSERT itself, given the version to stamp. */
  write: (version: string) => Promise<void>;
}): Promise<string> {
  const currentVersion = String(args.before.version ?? "v1");
  if (args.expectedVersion && args.expectedVersion !== currentVersion) throw new VersionConflict();

  const version = nextVersion(currentVersion);
  await args.write(version);
  return version;
}

// ── Reconciliation ───────────────────────────────────────────────────────────
// The gap this closes is already real and already silent: Sanity can gain an
// option at any time, and without a D1 row the line refuses to price rather than
// under-charge. Refusing is correct — but it has to be VISIBLE to the people who
// can fix it, not discovered by a customer.
export interface ReconcileResult {
  ok: boolean;
  checkedAt: string;
  /** Offered to customers, no price in D1 — any line using one cannot be priced. */
  missing: { slug: string; productSlugs: string[] }[];
  /** Priced but offered by nothing. Harmless; listed for completeness. */
  orphaned: string[];
  /** Products with no rate card of their own — they price at 'default' silently.
   *  Cards are per PRODUCT since 0031; a family-level gap no longer exists. */
  productsWithoutRateCard: string[];
  /** Per-product verdict: which products are too incomplete to offer a customer,
   *  and which record is missing. NULL (not []) when offerability could not be
   *  checked at all — see computeOfferability. */
  notOfferable: ProductGap[] | null;
}

/** One product that cannot be offered, and every reason why — all of them, not
 *  the first: fixing a rate card only to discover the thermal profile is also
 *  missing is two round trips through a screen someone has to go find. */
export interface ProductGap {
  slug: string;
  name: string | null;
  gaps: string[];
}

/** Gap vocabulary. The first three are `catalogueCandidateOfferability`'s own
 *  codes, reused verbatim rather than restated so the estimator and this report
 *  cannot drift into disagreeing about what "offerable" means — the estimator
 *  computes them live per run, this recomputes them for the browser and for
 *  ops. The last two are the D1 half, which the estimator-side check cannot
 *  see because it has no database. */
export const PRODUCT_GAP_LABELS: Record<string, string> = {
  operation_types: "no operation type",
  dimension_rule: "no dimension rule",
  thermally_described_variant: "no usable glazing/thermal data",
  rate_card: "names a rate card that does not exist",
  unpriced_option: "offers an option with no price",
};

/** Every chargeable option slug the catalogue offers, mapped to the products
 *  offering it. Mirrors chargeableOptionSlugs() in lib/lines.ts exactly: a
 *  `standard` option contributes no slug because it is included in the base rate,
 *  and `colour` resolves against the global Colorbond list. */
export function offeredOptionSlugs(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (slug: string, productSlug: string) =>
    out.set(slug, [...(out.get(slug) ?? []), productSlug]);
  for (const p of products) {
    for (const o of p.options) {
      if (o.availability === "standard") continue;
      add(`${canon(o.typeSlug)}:${canon(o.name)}`, p.slug);
    }
    // Colour is UNIVERSAL, not per-product: chargeableOptionSlugs resolves a
    // `colour` selection against the global Colorbond list for any product,
    // whatever that product's own option rows say. Gating this on the product
    // having a colour row made the reconciler under-report — under the live
    // catalogue no product carries one, so all 24 colours read as unoffered
    // while the engine would happily charge for them. The reconciler has to
    // model what the engine DOES, not what the mapping suggests.
    for (const c of colorbondColourOptions) {
      if (c.availability === "standard") continue;
      add(`colour:${canon(c.name)}`, p.slug);
    }
  }
  return out;
}

/**
 * Which products cannot be offered to a customer, and why.
 *
 * NOT "can this product meet the thermal band" — COMPLETENESS. A band is
 * resolved per opening and (since 2026-08-14) always exists, but it is resolved
 * at estimate time from context this check does not have. Gating on data the
 * product either carries or does not is deterministic, cacheable, and gives the
 * person who has to fix it a specific missing record rather than a verdict that
 * varies by opening.
 *
 * Returns NULL — not [] — when the estimator catalogue could not be read at all
 * (no SANITY_PROJECT_ID, an empty published set, a fetch that threw). Every
 * product would otherwise look thermally undescribed and the whole catalogue
 * would blink out on an infrastructure fault. An empty ARRAY means "checked,
 * nothing wrong"; NULL means "not checked", and callers must treat the two
 * differently — the same distinction lastReconcileRun already draws between a
 * green banner and a broken checker.
 */
export async function computeOfferability(
  env: Env,
  offered: Map<string, string[]>,
  havePrice: Set<string>,
  haveCard: Set<string>,
): Promise<ProductGap[] | null> {
  const candidates = await createCatalogueRepository(sanityExecutor(env))
    .queryCandidates(null, null)
    .catch(() => [] as CatalogueCandidate[]);
  if (!candidates.length) return null;

  // Invert offered (option slug -> products) into product -> its unpriced options.
  const unpricedByProduct = new Map<string, string[]>();
  for (const [optionSlug, productSlugs] of offered) {
    if (havePrice.has(optionSlug)) continue;
    for (const productSlug of productSlugs) {
      unpricedByProduct.set(productSlug, [...(unpricedByProduct.get(productSlug) ?? []), optionSlug]);
    }
  }

  const out: ProductGap[] = [];
  for (const candidate of candidates) {
    // A withdrawn product is not "broken" — it is deliberately not for sale, and
    // listing it here would bury the real faults under intentional ones.
    if (candidate.disabled) continue;
    const gaps = [...catalogueCandidateOfferability(candidate).gaps];
    // Only a NAMED card that is missing breaks a product. pricingRef is what
    // turns on requireExactRate (estimator/estimate.ts), so a product naming a
    // card that does not exist fails closed at price time — that is the fault
    // worth withholding for. A product naming none resolves 'default' by
    // design and prices correctly, so it is not withheld; it is still listed
    // in productsWithoutRateCard for ops, which is a different question.
    if (candidate.pricingRef && !haveCard.has(candidate.pricingRef)) gaps.push("rate_card");
    const unpriced = unpricedByProduct.get(candidate.slug) ?? [];
    // One gap code, however many options — the slugs ride along in the label so
    // the report stays scannable when a whole option type is unpriced.
    if (unpriced.length) gaps.push(`unpriced_option:${unpriced.sort().join(",")}`);
    if (gaps.length) out.push({ slug: candidate.slug, name: candidate.name || null, gaps });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function reconcilePricing(env: Env): Promise<ReconcileResult> {
  await ensureCatalogue(env);
  const offered = offeredOptionSlugs();

  const [{ results: priced }, { results: cards }] = await Promise.all([
    env.DB.prepare("SELECT id FROM pricing_option_surcharge WHERE active = 1").all<{ id: string }>(),
    env.DB.prepare("SELECT id FROM pricing_rate_card WHERE active = 1").all<{ id: string }>(),
  ]);
  const havePrice = new Set((priced ?? []).map((r) => r.id));
  const haveCard = new Set((cards ?? []).map((r) => r.id));

  const missing = [...offered].filter(([slug]) => !havePrice.has(slug))
    .map(([slug, productSlugs]) => ({ slug, productSlugs }))
    .sort((a, b) => b.productSlugs.length - a.productSlugs.length);
  const orphaned = [...havePrice].filter((slug) => !offered.has(slug)).sort();
  const productsWithoutRateCard = products.map((p) => p.slug)
    .filter((slug) => slug && !haveCard.has(slug)).sort();
  const notOfferable = await computeOfferability(env, offered, havePrice, haveCard);

  // `ok` deliberately does NOT fold in notOfferable. It has meant "the two
  // pricing tables agree with the catalogue" since 0029 and the banner's green
  // state is bound to it; an unmigrated product would otherwise turn the
  // pricing banner permanently amber for a reason that is not a pricing fault.
  // Offerability gets its own line in the banner (ops-pricing.ts).
  const ok = missing.length === 0 && productsWithoutRateCard.length === 0;
  const checkedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO pricing_reconcile_run (id, checked_at, ok, missing_json, orphaned_json, no_rate_card_json, not_offerable_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    uuid(), checkedAt, ok ? 1 : 0, JSON.stringify(missing), JSON.stringify(orphaned),
    JSON.stringify(productsWithoutRateCard),
    notOfferable === null ? null : JSON.stringify(notOfferable),
  ).run();

  return { ok, checkedAt, missing, orphaned, productsWithoutRateCard, notOfferable };
}

/** The last recorded run, or null when nothing has ever checked. The distinction
 *  matters: an unlabelled green banner and a broken checker look identical. */
export async function lastReconcileRun(env: Env): Promise<ReconcileResult | null> {
  const row = await env.DB.prepare(
    "SELECT checked_at, ok, missing_json, orphaned_json, no_rate_card_json, not_offerable_json FROM pricing_reconcile_run ORDER BY checked_at DESC LIMIT 1",
  ).first<any>();
  if (!row) return null;
  const parse = <T>(s: string | null, fallback: T): T => {
    try { const v = JSON.parse(s || ""); return v ?? fallback; } catch { return fallback; }
  };
  return {
    ok: !!row.ok, checkedAt: row.checked_at,
    missing: parse(row.missing_json, []), orphaned: parse(row.orphaned_json, []),
    productsWithoutRateCard: parse(row.no_rate_card_json, []),
    // NULL column (a run from before 0045, or one where the catalogue could not
    // be read) stays null: "not checked", never "checked and all fine".
    notOfferable: row.not_offerable_json == null ? null : parse(row.not_offerable_json, []),
  };
}

// ── Worked example ───────────────────────────────────────────────────────────
export interface SampleSize { key: "small" | "typical" | "large"; widthMm: number; heightMm: number; qty: number }

/** Fixed fallbacks, used only when the product has too little quote history.
 *  Labelled as such in the response — never silently substituted, because an
 *  invented size presented as "your typical window" is a lie the operator will
 *  calibrate against. */
const STANDARD_SIZES: SampleSize[] = [
  { key: "small", widthMm: 900, heightMm: 600, qty: 1 },
  { key: "typical", widthMm: 1200, heightMm: 1200, qty: 1 },
  { key: "large", widthMm: 2400, heightMm: 1500, qty: 1 },
];

/** The 10th / median / 90th percentile of what this PRODUCT was actually quoted
 *  at over the last 90 days. Their own mix, because an invented size gets argued
 *  with and their own numbers do not. */
export async function sampleSizes(env: Env, productSlug: string): Promise<{ samples: SampleSize[]; fromHistory: boolean; lineCount: number }> {
  const slugs = products.filter((p) => p.slug === productSlug).map((p) => p.slug);
  if (!slugs.length) return { samples: STANDARD_SIZES, fromHistory: false, lineCount: 0 };
  const placeholders = slugs.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT dims_json FROM quote_line
      WHERE product_slug IN (${placeholders}) AND created_at > datetime('now','-90 days')`,
  ).bind(...slugs).all<{ dims_json: string }>();

  const dims = (results ?? []).map((r) => {
    try { const d = JSON.parse(r.dims_json || "{}"); return { w: parseInt(d.width) || 0, h: parseInt(d.height) || 0 }; }
    catch { return { w: 0, h: 0 }; }
  }).filter((d) => d.w > 0 && d.h > 0).sort((a, b) => a.w * a.h - b.w * b.h);

  // Below this the percentiles are noise, not a distribution.
  if (dims.length < 5) return { samples: STANDARD_SIZES, fromHistory: false, lineCount: dims.length };
  const at = (p: number) => dims[Math.min(dims.length - 1, Math.floor(p * dims.length))];
  const pick = (key: SampleSize["key"], p: number): SampleSize => {
    const d = at(p);
    return { key, widthMm: d.w, heightMm: d.h, qty: 1 };
  };
  return {
    samples: [pick("small", 0.1), pick("typical", 0.5), pick("large", 0.9)],
    fromHistory: true, lineCount: dims.length,
  };
}

/** Price a sample against SUPPLIED (possibly unsaved) rates, through the real
 *  engine. computePrice is the same pure function production calls — never a
 *  second implementation, because a preview that can disagree with production
 *  manufactures false confidence at exactly the moment confidence matters. */
export async function previewSample(env: Env, args: {
  rate: RateCard; modifiers: PricingModifier[]; sample: SampleSize; optionSlugs?: string[];
}): Promise<PriceSnapshot> {
  const [policy, surcharges] = await Promise.all([
    loadPolicy(env),
    loadOptionSurcharges(env, args.optionSlugs ?? [], false),
  ]);
  return computePrice(args.rate, policy, {
    family: args.rate.id, widthMm: args.sample.widthMm, heightMm: args.sample.heightMm,
    qty: args.sample.qty, optionSurcharges: surcharges, modifiers: args.modifiers, explain: true,
  });
}

/** How many DRAFT lines still carry a price computed under the old rates.
 *
 *  quote_line stores line_total and only reprices when someone edits the line, so
 *  after a rate change a customer's saved project keeps showing the old number
 *  until an estimator nudges qty — at which point the price jumps for a reason
 *  invisible to everyone in the conversation. The confirm dialog says this out
 *  loud rather than letting it be discovered. */
export async function draftExposure(env: Env, productSlug: string): Promise<{ lines: number; projects: number }> {
  const slugs = products.filter((p) => p.slug === productSlug).map((p) => p.slug);
  if (!slugs.length) return { lines: 0, projects: 0 };
  const placeholders = slugs.map(() => "?").join(",");
  const row = await env.DB.prepare(
    `SELECT count(*) AS lines, count(DISTINCT l.project_id) AS projects
       FROM quote_line l JOIN project p ON p.id = l.project_id
      WHERE l.product_slug IN (${placeholders})
        AND p.status_customer = 'draft' AND l.line_total IS NOT NULL`,
  ).bind(...slugs).first<{ lines: number; projects: number }>();
  return { lines: Number(row?.lines ?? 0), projects: Number(row?.projects ?? 0) };
}
