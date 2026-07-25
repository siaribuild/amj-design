// Shared pricing service (spec §10, addendum §2). Pricing is PRIVATE and lives in
// D1 — server-computed, never returned to the browser as a per-option breakdown.
// The estimator and the public configurator both price through this one service
// so they agree on the number ("frontend parity" = same computed total).
//
// computePrice is pure (rate card in → price out) so it is unit-tested; loadRate
// reads the private D1 rate card; priceLine ties them together and returns an
// immutable snapshot suitable for a quote/order line.
import type { Env } from "../../types";

export interface RateCard {
  id: string;            // family slug or 'default'
  perimRate: number;     // $/m frame perimeter
  areaRate: number;      // $/m² glazed area
  minCharge: number;
  version: string;
}

export interface PricingPolicy {
  depositPercent: number;
  gstMode: string;
  version: string;
}

export interface PriceInput {
  family: string;                     // family slug (rate-card key)
  widthMm: number;
  heightMm: number;
  qty: number;
  optionSurcharges?: number[];        // resolved surcharges (server-side only)
}

// The snapshot persisted on a line. Deliberately carries the total and the
// versioned inputs for reproducibility — NOT a per-option price list.
export interface PriceSnapshot {
  ok: boolean;
  unit: number;
  total: number;
  depositAmount: number;
  currency: "AUD";
  rateCardId: string;
  rateCardVersion: string;
  pricingPolicyVersion: string;
  depositPercent: number;
  computedAt: string;
}

// Round to the nearest $10 (matches the existing configurator convention).
const round10 = (n: number) => Math.round(n / 10) * 10;

export function computePrice(rate: RateCard, policy: PricingPolicy, input: PriceInput): PriceSnapshot {
  const w = Math.max(0, input.widthMm), h = Math.max(0, input.heightMm);
  const qty = Math.max(1, Math.floor(input.qty || 1));
  const ok = w > 0 && h > 0;
  const perimeterM = (2 * (w + h)) / 1000;
  const areaM2 = (w * h) / 1_000_000;
  const surcharges = (input.optionSurcharges ?? []).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  let unit = perimeterM * rate.perimRate + areaM2 * rate.areaRate + surcharges;
  unit = Math.max(unit, rate.minCharge);
  unit = round10(unit);
  const total = ok ? unit * qty : 0;
  const depositAmount = round10((total * policy.depositPercent) / 100);
  return {
    ok,
    unit: ok ? unit : 0,
    total,
    depositAmount,
    currency: "AUD",
    rateCardId: rate.id,
    rateCardVersion: rate.version,
    pricingPolicyVersion: policy.version,
    depositPercent: policy.depositPercent,
    computedAt: new Date().toISOString(),
  };
}

// Load the family rate card (falling back to 'default') from private D1.
export async function loadRateCard(env: Env, family: string, allowFallback = true): Promise<RateCard> {
  const exact = await env.DB
    .prepare("SELECT id, perim_rate, area_rate, min_charge, version FROM pricing_rate_card WHERE id = ? AND active = 1")
    .bind(family).first<any>();
  const row = exact ?? (allowFallback
    ? await env.DB.prepare("SELECT id, perim_rate, area_rate, min_charge, version FROM pricing_rate_card WHERE id = 'default' AND active = 1").first<any>()
    : null);
  if (!row) throw new Error("no_rate_card");
  return { id: row.id, perimRate: row.perim_rate, areaRate: row.area_rate, minCharge: row.min_charge ?? 0, version: row.version };
}

export async function loadPolicy(env: Env): Promise<PricingPolicy> {
  const row = await env.DB.prepare("SELECT deposit_percent, gst_mode, version FROM pricing_policy WHERE id = 'default'").first<any>();
  return {
    depositPercent: row?.deposit_percent ?? 40,
    gstMode: row?.gst_mode ?? "inc",
    version: row?.version ?? "v1",
  };
}

// Resolve option surcharges by slug from the private table (server-side only).
export async function loadOptionSurcharges(env: Env, optionSlugs: string[], requireAll = false): Promise<number[]> {
  if (!optionSlugs.length) return [];
  const out: number[] = [];
  const unique = [...new Set(optionSlugs)];
  let resolved = 0;
  for (const slug of unique) {
    const r = await env.DB.prepare("SELECT surcharge FROM pricing_option_surcharge WHERE id = ? AND active = 1").bind(slug).first<{ surcharge: number }>();
    if (r && Number.isFinite(r.surcharge)) {
      resolved++;
      out.push(r.surcharge);
    }
  }
  if (requireAll && resolved !== unique.length) throw new Error("missing_option_surcharge");
  return out;
}

// End-to-end: price one line from private D1 and return the snapshot.
export async function priceLine(env: Env, args: {
  family: string; widthMm: number; heightMm: number; qty: number;
  optionSlugs?: string[]; requireExactRate?: boolean; requireAllOptions?: boolean;
}): Promise<PriceSnapshot> {
  const [rate, policy, surcharges] = await Promise.all([
    loadRateCard(env, args.family, !args.requireExactRate),
    loadPolicy(env),
    loadOptionSurcharges(env, args.optionSlugs ?? [], args.requireAllOptions),
  ]);
  return computePrice(rate, policy, { family: args.family, widthMm: args.widthMm, heightMm: args.heightMm, qty: args.qty, optionSurcharges: surcharges });
}
