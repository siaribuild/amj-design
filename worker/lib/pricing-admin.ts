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
import { logEvent } from "./activity";
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
 *  Bumps the version, records the before/after in `pricing_change` (which is what
 *  a revert reads), and writes an `audit_event` carrying BOTH sides. Optimistic
 *  concurrency is on `expectedVersion`: two managers on one supplier increase is
 *  an ordinary afternoon, and a silent last-write-wins is how one of them loses
 *  their change without ever knowing. */
export async function applyPricingChange(env: Env, args: {
  table: "pricing_rate_card" | "pricing_option_surcharge" | "pricing_modifier" | "pricing_policy";
  rowId: string;
  actor: string;
  note?: string | null;
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
  await env.DB.prepare(
    `INSERT INTO pricing_change (id, table_name, row_id, from_version, to_version, before_json, after_json, note, actor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    uuid(), args.table, args.rowId, currentVersion, version,
    JSON.stringify(args.before), JSON.stringify({ ...args.after, version }),
    args.note?.trim() || null, args.actor,
  ).run();
  await logEvent(env, {
    actor: args.actor, entityType: args.table, entityId: args.rowId,
    action: "pricing.updated", before: args.before, after: { ...args.after, version },
  });
  return version;
}

export interface PricingChangeRow {
  id: string; from_version: string | null; to_version: string;
  before_json: string | null; after_json: string | null;
  note: string | null; actor: string; actor_name: string | null; created_at: string;
}

export async function loadHistory(env: Env, table: string, rowId: string, limit = 20): Promise<PricingChangeRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.from_version, c.to_version, c.before_json, c.after_json, c.note, c.actor,
            u.name AS actor_name, c.created_at
       FROM pricing_change c LEFT JOIN user u ON u.id = c.actor
      WHERE c.table_name = ? AND c.row_id = ?
      ORDER BY c.created_at DESC LIMIT ?`,
  ).bind(table, rowId, limit).all<PricingChangeRow>();
  return results ?? [];
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
}

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

  const ok = missing.length === 0 && productsWithoutRateCard.length === 0;
  const checkedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO pricing_reconcile_run (id, checked_at, ok, missing_json, orphaned_json, no_rate_card_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(uuid(), checkedAt, ok ? 1 : 0, JSON.stringify(missing), JSON.stringify(orphaned), JSON.stringify(productsWithoutRateCard)).run();

  return { ok, checkedAt, missing, orphaned, productsWithoutRateCard };
}

/** The last recorded run, or null when nothing has ever checked. The distinction
 *  matters: an unlabelled green banner and a broken checker look identical. */
export async function lastReconcileRun(env: Env): Promise<ReconcileResult | null> {
  const row = await env.DB.prepare(
    "SELECT checked_at, ok, missing_json, orphaned_json, no_rate_card_json FROM pricing_reconcile_run ORDER BY checked_at DESC LIMIT 1",
  ).first<any>();
  if (!row) return null;
  const parse = <T>(s: string | null, fallback: T): T => {
    try { const v = JSON.parse(s || ""); return v ?? fallback; } catch { return fallback; }
  };
  return {
    ok: !!row.ok, checkedAt: row.checked_at,
    missing: parse(row.missing_json, []), orphaned: parse(row.orphaned_json, []),
    productsWithoutRateCard: parse(row.no_rate_card_json, []),
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
      WHERE l.product_slug IN (${placeholders}) AND l.revision_id IS NULL
        AND p.status_customer = 'draft' AND l.line_total IS NOT NULL`,
  ).bind(...slugs).first<{ lines: number; projects: number }>();
  return { lines: Number(row?.lines ?? 0), projects: Number(row?.projects ?? 0) };
}
