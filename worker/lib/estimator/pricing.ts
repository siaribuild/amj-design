// Shared pricing service (spec §10, addendum §2). Pricing is PRIVATE and lives in
// D1 — server-computed, never returned to the browser as a per-option breakdown.
// The estimator and the public configurator both price through this one service
// so they agree on the number ("frontend parity" = same computed total).
//
// computePrice is pure (rate card in → price out) so it is unit-tested; loadRate
// reads the private D1 rate card; priceLine ties them together and returns an
// immutable snapshot suitable for a quote/order line.
import type { Env } from "../../types";
// There is one deposit percentage in this codebase (0043) and it lives on the
// order domain, not on a policy row — pricing_policy.deposit_percent is gone.
import { DEPOSIT_PERCENT } from "../orders";

export interface RateCard {
  id: string;            // family slug or 'default'
  perimRate: number;     // $/m frame perimeter
  areaRate: number;      // $/m² glazed area
  minCharge: number;
  version: string;
}

export interface PricingPolicy {
  gstMode: string;
  version: string;
}

// How an option surcharge scales. 'per_unit' is a flat amount added once per unit
// (a handle, a flyscreen). 'per_sqm' is multiplied by the opening's glazed area —
// the model glass needs, because a bigger opening carries proportionally more of it.
export type SurchargeBasis = "per_unit" | "per_sqm";
export interface OptionSurcharge {
  value: number;         // $/unit for per_unit, $/m² for per_sqm
  basis: SurchargeBasis;
}
// M5: null/absent basis is the DB default (per_unit — the column is NOT NULL
// DEFAULT 'per_unit'), but a WRONG value (e.g. a "per_sq" typo) returns null so the
// caller treats that surcharge as MISSING (fail-closed), never as a silent per_unit
// downgrade that would under-charge a large opening.
const validBasis = (v: unknown): SurchargeBasis | null =>
  v === "per_sqm" ? "per_sqm" : v == null || v === "per_unit" ? "per_unit" : null;

// A per-product conditional pricing rule (private D1, table `pricing_modifier`).
// The manufacturer's model is universal in shape but owned per rate card.
export interface PricingModifier {
  id: string;
  seq: number;
  label: string | null;
  whenField: "width" | "height" | "area" | "qty";
  whenOp: ">" | ">=" | "<" | "<=" | "==";
  whenValue: number;
  thenType: "percent" | "fixed";
  thenValue: number;
}

export interface PriceInput {
  /** Rate-card key — the PRODUCT slug (0031). Was the family slug until every
   *  product got its own card; products in one family are not the same frame at
   *  the same cost, and a family key made them impossible to price apart. */
  family: string;
  widthMm: number;
  heightMm: number;
  qty: number;
  optionSurcharges?: OptionSurcharge[]; // resolved surcharges (server-side only)
  modifiers?: PricingModifier[];      // per-product conditional rules (private)
  /** The account's discount (0032), as a percentage off. 0 for anonymous quotes,
   *  which have no user row. Applied last, before rounding. */
  discountPercent?: number;
  /** Emit a step-by-step arithmetic trace (ops Pricing preview only). Off by
   *  default so the snapshot persisted on 70k lines does not carry it. */
  explain?: boolean;
}

/** The arithmetic, decomposed, in the order computePrice performs it.
 *
 *  Exists because a rate card is two numbers that mean nothing in isolation: an
 *  operator cannot tell what moving perim_rate 45 → 50 does to a real window.
 *  Steps that did NOTHING are still reported (`applied: false`) — "minimum charge:
 *  no effect" and "rule ①: did not fire" are what teach the shape of the formula
 *  on a day when nothing is wrong. */
export interface PriceStep {
  key: string;                  // 'perimeter' | 'area' | 'options' | 'min-charge' | modifier id | 'round' | 'qty'
  label: string;
  detail?: string;              // the operands, e.g. "4.80 m × $55.00"
  amount: number | null;        // the contribution, or null when nothing was added
  runningTotal: number;
  applied: boolean;
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
  /** The account discount that priced this line — recorded so a total can be
   *  reproduced later, when the account's rate may have changed. */
  discountPercent: number;
  /** Modifier ids applied, in order — audit trail, server-side only. */
  appliedModifiers: string[];
  computedAt: string;
  /** Present only when `explain` was requested (ops Pricing preview). */
  steps?: PriceStep[];
}

// Round to the nearest $10 (matches the existing configurator convention).
// Exported so worker/lib/delivery.ts imports this rather than writing a second
// rounding helper — the class of duplication this codebase has already paid
// for twice (the browser pricing engine that used to shadow the server's, and
// the Math.round(total / 2) deposit that disagreed with orders.ts).
export const round10 = (n: number) => Math.round(n / 10) * 10;

// Does a rule's condition hold for this line? Dimensions are millimetres, area is
// m² (the unit the rules are authored in).
function modifierMatches(m: PricingModifier, dims: { width: number; height: number; area: number; qty: number }): boolean {
  const actual = dims[m.whenField];
  if (!Number.isFinite(actual) || !Number.isFinite(m.whenValue)) return false;
  switch (m.whenOp) {
    case ">": return actual > m.whenValue;
    case ">=": return actual >= m.whenValue;
    case "<": return actual < m.whenValue;
    case "<=": return actual <= m.whenValue;
    case "==": return actual === m.whenValue;
    default: return false;
  }
}

export function computePrice(rate: RateCard, policy: PricingPolicy, input: PriceInput): PriceSnapshot {
  const w = Math.max(0, input.widthMm), h = Math.max(0, input.heightMm);
  const qty = Math.max(1, Math.floor(input.qty || 1));
  const ok = w > 0 && h > 0;
  const perimeterM = (2 * (w + h)) / 1000;
  const areaM2 = (w * h) / 1_000_000;
  // Each surcharge is realised against THIS opening: a per-m² surcharge (glass)
  // scales with the glazed area, a per-unit surcharge (hardware) is flat.
  const surchargeList = input.optionSurcharges ?? [];
  const surcharges = surchargeList.reduce((s, o) => {
    if (!o || !Number.isFinite(o.value)) return s;
    return s + (o.basis === "per_sqm" ? o.value * areaM2 : o.value);
  }, 0);
  // The trace is written as the arithmetic happens, never recomputed afterwards —
  // a preview that can disagree with production is worse than no preview.
  const steps: PriceStep[] = [];
  const step = (s: PriceStep) => { if (input.explain) steps.push(s); };
  const money = (n: number) => `$${n.toFixed(2)}`;

  const perimPart = perimeterM * rate.perimRate;
  const areaPart = areaM2 * rate.areaRate;
  let unit = perimPart + areaPart + surcharges;
  step({ key: "perimeter", label: "perimeter", detail: `${perimeterM.toFixed(2)} m × ${money(rate.perimRate)}`, amount: perimPart, runningTotal: perimPart, applied: true });
  step({ key: "area", label: "area", detail: `${areaM2.toFixed(2)} m² × ${money(rate.areaRate)}`, amount: areaPart, runningTotal: perimPart + areaPart, applied: true });
  step({
    key: "options", label: "options",
    detail: `${(input.optionSurcharges ?? []).length} chargeable`,
    amount: surcharges, runningTotal: unit, applied: surcharges > 0,
  });

  const beforeMin = unit;
  unit = Math.max(unit, rate.minCharge);
  step({
    key: "min-charge", label: `minimum charge ${money(rate.minCharge)}`,
    detail: unit > beforeMin ? "raised the subtotal" : "no effect",
    amount: unit > beforeMin ? unit - beforeMin : null, runningTotal: unit, applied: unit > beforeMin,
  });
  // Per-product conditional rules, in seq order: `percent` compounds on the
  // running subtotal, `fixed` adds a flat amount. Applied AFTER the base +
  // surcharges and the minimum charge, BEFORE rounding — so the customer-visible
  // total stays on the $10 grid.
  const appliedModifiers: string[] = [];
  const dims = { width: w, height: h, area: areaM2, qty };
  for (const m of [...(input.modifiers ?? [])].sort((a, b) => a.seq - b.seq)) {
    const fired = modifierMatches(m, dims);
    const before = unit;
    if (fired) {
      unit = m.thenType === "percent" ? unit * (1 + m.thenValue / 100) : unit + m.thenValue;
      appliedModifiers.push(m.id);
    }
    step({
      key: m.id,
      label: m.label || `${m.whenField} ${m.whenOp} ${m.whenValue}`,
      detail: fired
        ? (m.thenType === "percent" ? `+${m.thenValue}%` : `+${money(m.thenValue)}`)
        : "did not fire",
      amount: fired ? unit - before : null, runningTotal: unit, applied: fired,
    });
  }
  // The account discount, last and before rounding, so a discounted total still
  // lands on the customer-visible $10 grid. Clamped: a negative "discount" is a
  // surcharge by another name, and >100% would pay the customer to order.
  const discountPercent = Math.min(100, Math.max(0, input.discountPercent ?? 0));
  const beforeDiscount = unit;
  if (discountPercent > 0) unit = unit * (1 - discountPercent / 100);
  step({
    key: "discount", label: `account discount ${discountPercent}%`,
    detail: discountPercent > 0 ? `off ${money(beforeDiscount)}` : "none on this account",
    amount: discountPercent > 0 ? unit - beforeDiscount : null,
    runningTotal: unit, applied: discountPercent > 0,
  });

  const beforeRound = unit;
  unit = round10(unit);
  step({ key: "round", label: "rounded to nearest $10", detail: money(beforeRound), amount: unit - beforeRound, runningTotal: unit, applied: unit !== beforeRound });
  const total = ok ? unit * qty : 0;
  step({ key: "qty", label: `× qty ${qty}`, amount: total - unit, runningTotal: total, applied: qty > 1 });
  const depositAmount = round10((total * DEPOSIT_PERCENT) / 100);
  return {
    ok,
    unit: ok ? unit : 0,
    total,
    depositAmount,
    currency: "AUD",
    rateCardId: rate.id,
    rateCardVersion: rate.version,
    pricingPolicyVersion: policy.version,
    depositPercent: DEPOSIT_PERCENT,
    discountPercent,
    appliedModifiers,
    computedAt: new Date().toISOString(),
    ...(input.explain ? { steps } : {}),
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

// Per-product conditional rules for a rate card (private, server-side only).
export async function loadModifiers(env: Env, rateCardId: string): Promise<PricingModifier[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, seq, label, when_field, when_op, when_value, then_type, then_value
       FROM pricing_modifier WHERE rate_card_id = ? AND active = 1 ORDER BY seq`,
  ).bind(rateCardId).all<any>();
  return (results ?? []).map((r) => ({
    id: r.id, seq: r.seq ?? 0, label: r.label ?? null,
    whenField: r.when_field, whenOp: r.when_op, whenValue: r.when_value,
    thenType: r.then_type, thenValue: r.then_value,
  }));
}

export async function loadPolicy(env: Env): Promise<PricingPolicy> {
  const row = await env.DB.prepare("SELECT gst_mode, version FROM pricing_policy WHERE id = 'default'").first<any>();
  return {
    gstMode: row?.gst_mode ?? "inc",
    version: row?.version ?? "v1",
  };
}

// Resolve option surcharges by slug from the private table (server-side only).
export async function loadOptionSurcharges(env: Env, optionSlugs: string[], requireAll = false): Promise<OptionSurcharge[]> {
  if (!optionSlugs.length) return [];
  const out: OptionSurcharge[] = [];
  const unique = [...new Set(optionSlugs)];
  const missing: string[] = [];
  for (const slug of unique) {
    const r = await env.DB.prepare("SELECT surcharge, basis FROM pricing_option_surcharge WHERE id = ? AND active = 1").bind(slug).first<{ surcharge: number; basis: string }>();
    const basis = validBasis(r?.basis);
    if (r && Number.isFinite(r.surcharge) && basis) out.push({ value: r.surcharge, basis });
    else missing.push(slug); // no row, non-finite surcharge, or invalid basis ⇒ fail-closed
  }
  if (requireAll && missing.length) throw new MissingSurcharge(missing);
  return out;
}

/** Names WHICH option has no price. Refusing to price is correct — treating a
 *  missing row as free would issue a quote we then have to honour — but "could
 *  not be exactly priced" tells an estimator nothing they can act on, and the
 *  slug is the difference between a dead end and a two-minute fix. */
export class MissingSurcharge extends Error {
  constructor(public missing: string[]) {
    super("missing_option_surcharge");
  }
}

/** The account's discount, resolved SERVER-SIDE from the owning user.
 *
 *  Never taken from the request: a percentage off the price is exactly the field
 *  a browser would love to supply. An anonymous project has no owner_user_id and
 *  prices at 0 — the discount is a reason to register, not a default for everyone. */
export async function loadAccountDiscount(env: Env, userId: string | null | undefined): Promise<number> {
  if (!userId) return 0;
  const row = await env.DB.prepare("SELECT discount_percent FROM user WHERE id = ?")
    .bind(userId).first<{ discount_percent: number }>();
  const v = Number(row?.discount_percent);
  return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
}

export interface CachedPriceArgs {
  family: string;
  widthMm: number;
  heightMm: number;
  qty: number;
  optionSlugs?: string[];
  requireExactRate?: boolean;
  requireAllOptions?: boolean;
}

/**
 * Load the private pricing catalogue once for a multi-opening estimate.
 *
 * The old estimator called priceLine() for every eligible product variant. Each
 * call performed five or more D1 reads, turning a normal schedule into hundreds
 * or thousands of serial subrequests. Public/manual pricing still uses
 * priceLine(); the AI batch path uses this immutable per-run resolver.
 */
export async function createCachedPriceResolver(
  env: Env,
  ownerUserId: string | null | undefined,
): Promise<(args: CachedPriceArgs) => PriceSnapshot> {
  const [rateResult, policy, surchargeResult, modifierResult, discountPercent] = await Promise.all([
    env.DB.prepare(
      "SELECT id, perim_rate, area_rate, min_charge, version FROM pricing_rate_card WHERE active=1",
    ).all<any>(),
    loadPolicy(env),
    env.DB.prepare(
      "SELECT id, surcharge, basis FROM pricing_option_surcharge WHERE active=1",
    ).all<{ id: string; surcharge: number; basis: string }>(),
    env.DB.prepare(
      `SELECT id, rate_card_id, seq, label, when_field, when_op, when_value, then_type, then_value
         FROM pricing_modifier WHERE active=1 ORDER BY rate_card_id, seq`,
    ).all<any>(),
    loadAccountDiscount(env, ownerUserId),
  ]);

  const rates = new Map<string, RateCard>();
  for (const row of rateResult.results ?? []) {
    rates.set(String(row.id), {
      id: String(row.id),
      perimRate: Number(row.perim_rate),
      areaRate: Number(row.area_rate),
      minCharge: Number(row.min_charge ?? 0),
      version: String(row.version),
    });
  }
  const surcharges = new Map<string, OptionSurcharge>(
    (surchargeResult.results ?? [])
      .flatMap((row) => {
        const basis = validBasis(row.basis);
        // A row with a bad basis is dropped from the map ⇒ treated as MISSING by
        // the requireAllOptions check downstream (fail-closed), never per_unit.
        return Number.isFinite(row.surcharge) && basis ? [[row.id, { value: row.surcharge, basis }] as const] : [];
      }),
  );
  const modifiers = new Map<string, PricingModifier[]>();
  for (const row of modifierResult.results ?? []) {
    const rateCardId = String(row.rate_card_id);
    const list = modifiers.get(rateCardId) ?? [];
    list.push({
      id: String(row.id),
      seq: Number(row.seq ?? 0),
      label: row.label ?? null,
      whenField: row.when_field,
      whenOp: row.when_op,
      whenValue: Number(row.when_value),
      thenType: row.then_type,
      thenValue: Number(row.then_value),
    });
    modifiers.set(rateCardId, list);
  }

  return (args) => {
    const rate = rates.get(args.family) ?? (!args.requireExactRate ? rates.get("default") : undefined);
    if (!rate) throw new Error("no_rate_card");
    const uniqueOptions = [...new Set(args.optionSlugs ?? [])];
    const missing = uniqueOptions.filter((slug) => !surcharges.has(slug));
    if (args.requireAllOptions && missing.length) throw new MissingSurcharge(missing);
    return computePrice(rate, policy, {
      family: args.family,
      widthMm: args.widthMm,
      heightMm: args.heightMm,
      qty: args.qty,
      optionSurcharges: uniqueOptions.flatMap((slug) => {
        const value = surcharges.get(slug);
        return value == null ? [] : [value];
      }),
      modifiers: modifiers.get(rate.id) ?? [],
      discountPercent,
    });
  };
}

// End-to-end: price one line from private D1 and return the snapshot.
export async function priceLine(env: Env, args: {
  family: string; widthMm: number; heightMm: number; qty: number;
  optionSlugs?: string[]; requireExactRate?: boolean; requireAllOptions?: boolean;
  /** Owner of the project being priced, or null for an anonymous one. */
  ownerUserId?: string | null;
}): Promise<PriceSnapshot> {
  const [rate, policy, surcharges, discountPercent] = await Promise.all([
    loadRateCard(env, args.family, !args.requireExactRate),
    loadPolicy(env),
    loadOptionSurcharges(env, args.optionSlugs ?? [], args.requireAllOptions),
    loadAccountDiscount(env, args.ownerUserId),
  ]);
  // Modifiers hang off the rate card actually resolved (which may be 'default').
  const modifiers = await loadModifiers(env, rate.id);
  return computePrice(rate, policy, {
    family: args.family, widthMm: args.widthMm, heightMm: args.heightMm,
    qty: args.qty, optionSurcharges: surcharges, modifiers, discountPercent,
  });
}
