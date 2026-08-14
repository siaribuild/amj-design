// Domestic delivery pricing — the AUSTRALIAN LEG ONLY (design doc
// docs/shipping-costs-design.md §5). International freight, customs, duty and
// import GST are already inside product prices (decision 2); this module
// prices what happens after the goods land: port cartage, warehouse handling,
// last mile, tailgate.
//
// Shaped like worker/lib/estimator/pairing.ts: a pure core that takes rows and
// numbers and returns an answer, with the D1 reads in separate exported
// functions. That makes every case testable against real data rather than a
// mock — see scripts/tests/unit.test.mjs (T-A1 through T-A30).
//
// ZERO CALLERS as of this commit. Nothing in worker/routes/ imports this yet —
// the submit form (C5), the ops panel (C6) and the issue gate (C7) wire it up
// in later commits. That is deliberate: this is the commit where the
// arithmetic gets argued about cheaply, before anything depends on it for
// money.
import type { Env } from "../types";
import { round10 } from "./estimator/pricing";

// ── The zone shape ───────────────────────────────────────────────────────────
// minCharge/ratePerSqm/maxCharge are nullable — a zone the owner has not
// priced yet (migrations/0044_delivery_pricing.sql seeds zero rates on
// purpose). `active`/`isFallback` accept 0/1 as well as boolean: D1 returns
// SQLite integers for both, and the pure functions below are exercised in
// unit tests against plain object literals that write `isFallback: 0`.
export interface DeliveryZone {
  id: string;
  label: string;
  minCharge: number | null;
  ratePerSqm: number | null;
  maxCharge: number | null;
  isFallback: boolean | number;
  active?: boolean | number; // absent ⇒ active (every fixture that omits it means "on")
}
export interface PostcodeRange {
  zoneId: string;
  from: number;
  to: number;
}

const isActive = (z: { active?: boolean | number }): boolean => z.active !== false && z.active !== 0;
const isFallbackZone = (z: { isFallback: boolean | number }): boolean => !!z.isFallback;

/** All three money columns must be set — a zone missing even one is not
 *  priced, and resolveZone treats it exactly like an unpriced zone (falls to
 *  the conservative fallback rather than pricing at a partial rate). */
export const zoneIsPriced = (zone: Pick<DeliveryZone, "minCharge" | "ratePerSqm" | "maxCharge">): boolean =>
  zone.minCharge != null && zone.ratePerSqm != null && zone.maxCharge != null;

// ── 5.1 The formula ──────────────────────────────────────────────────────────
const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);

/**
 * cost = round10(clamp(areaM2 × ratePerSqm, minCharge, maxCharge))
 *
 * CLAMP FIRST, ROUND LAST — not the other way round. worker/lib/estimator/
 * pricing.ts:200-202 rounds every unit price to the $10 grid before qty, so
 * every quote_line.line_total in the database is a multiple of ten, every
 * goods total therefore is too, and worker/lib/orders.ts's deposit/balance
 * split has always come out even as a result. A delivery charge off that
 * grid would be the first odd total this system has ever produced.
 *
 * `min > max` cannot exist once the schema CHECK is in place
 * (migrations/0044), but this pure function still needs a defined answer for
 * a hand-constructed zone — it returns the LOWER of the two, because an
 * unbounded charge from a typo would reach a customer while an undercharge
 * is caught by the human gate.
 *
 * A negative or non-finite area is refused — returns 0, not the zone's
 * minimum. That is a different case from zero area (which correctly returns
 * the floor, D5's locked formula applied literally: clamp(0, min, max) =
 * min): zero-line projects ARE reachable (worker/routes/quote.ts permits
 * submission with no lines when an AI job terminally failed and a clean file
 * exists), but a negative/NaN/Infinite area is malformed input, not an empty
 * project, and crediting the zone minimum for it would be a bug wearing the
 * shape of a feature.
 */
export const deliveryCost = (
  areaM2: number,
  zone: { minCharge: number; ratePerSqm: number; maxCharge: number },
): number => {
  if (!Number.isFinite(areaM2) || areaM2 < 0) return 0;
  return round10(clamp(areaM2 * zone.ratePerSqm, zone.minCharge, zone.maxCharge));
};

// ── 5.2 The area ─────────────────────────────────────────────────────────────
/** Millimetres in, square metres out. Parsed BY VALUE, never by JSON type:
 *  dims_json is written {"width":"2050"} by every customer save and was
 *  written {"width":2050} by the AI proposal path — see the dimsEq comment at
 *  worker/lib/lines.ts:281-290 for what that exact mismatch has already cost
 *  this codebase (every price on an AI-quoted project). This is the known
 *  shape of the stored data, not defensive programming. */
const parseMm = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export interface OpeningAreaResult {
  areaM2: number;
  /** Lines whose width or height would not parse. Contributed 0 to the total
   *  rather than being silently dropped — the caller turns this into a
   *  caveat sentence, not a suppressed defect. */
  unmeasuredLines: number;
}

/** The area basis is derived from DIMENSIONS, never from money — an unpriced
 *  line (technical_review, NULL line_total) still contributes its area, and
 *  no discount, surcharge or modifier can leak into the freight basis through
 *  it (§5.4). PARENTS ONLY: rows must already be filtered to
 *  `parent_line_id IS NULL` by the caller (loadProjectAreaM2 does this in
 *  SQL) — the same predicate every money total in this system already uses,
 *  for the same reason. Summing both levels double-counts a composite: a
 *  3600mm opening built as three 1200mm units would contribute the opening
 *  AND its units, the freight on one hole in a wall charged twice. */
export function sumOpeningAreaM2(rows: { dims_json: string; qty: number }[]): OpeningAreaResult {
  let areaM2 = 0;
  let unmeasuredLines = 0;
  for (const row of rows) {
    let width = 0;
    let height = 0;
    try {
      const d = JSON.parse(row.dims_json || "{}");
      width = parseMm(d?.width);
      height = parseMm(d?.height);
    } catch {
      // unreadable dims_json — falls through with width/height at 0
    }
    if (width <= 0 || height <= 0) {
      unmeasuredLines++;
      continue;
    }
    // qty 0 is clamped to 1 (a line with no confirmed quantity is still one
    // opening, not zero of them); a positive qty ships that many frames.
    const qty = Math.max(1, Math.floor(Number(row.qty) || 0));
    areaM2 += (width / 1000) * (height / 1000) * qty;
  }
  return { areaM2, unmeasuredLines };
}

export async function loadProjectAreaM2(env: Env, projectId: string): Promise<OpeningAreaResult> {
  const { results } = await env.DB.prepare(
    // PARENTS ONLY. No ORDER BY — a sum has no order.
    `SELECT dims_json, qty FROM quote_line
      WHERE project_id = ? AND parent_line_id IS NULL`,
  ).bind(projectId).all<{ dims_json: string; qty: number }>();
  return sumOpeningAreaM2(results ?? []);
}

// ── 5.3 Postcode → zone ──────────────────────────────────────────────────────
const AU_POSTCODE = /^\d{4}$/;

/** Four digits or nothing (decision 7). Kept as TEXT so 0872 survives.
 *  A NUMBER IS NOT A POSTCODE: normalisePostcode(3000) is null, not "3000".
 *  The moment 3000 is accepted, `3000` and "3000" are two spellings of one
 *  place and something downstream will compare them. */
export const normalisePostcode = (raw: unknown): string | null =>
  typeof raw === "string" && AU_POSTCODE.test(raw.trim()) ? raw.trim() : null;

export type ZoneBasis = "postcode_zone" | "fallback_zone" | "unpriced_table";
export interface ZoneResolution {
  zone: DeliveryZone | null;
  basis: ZoneBasis;
  /** Rendered verbatim in the ops delivery block and the customer surface —
   *  why a figure may need a second look is words, not a boolean. Empty on
   *  the ordinary path. */
  caveats: string[];
}

/**
 * The resolver ALWAYS returns a zone, never null on the ordinary path (D9),
 * through the ordered branches design doc §5.3 names:
 *
 *  1. narrowest matching PRICED, ACTIVE range           -> postcode_zone
 *  2/3. no postcode / no match / unpriced / inactive match -> fallback_zone
 *  4. the fallback itself has no rates (deployment fault) -> unpriced_table
 *
 * Branch 2 covers a postcode matching an UNPRICED zone that sits inside a
 * PRICED container (say `act` unpriced inside a priced `nsw-regional`): it
 * falls straight to the fallback, never to the container. A zone the owner
 * created and left unpriced is one he intends to price DIFFERENTLY;
 * substituting its container's rate would silently reuse a number he
 * explicitly declined to reuse.
 *
 * Narrowest-match resolution, tiebroken on zone id so the answer never
 * depends on array order (T-A19: the same assertions hold against
 * `[...ranges].reverse()`).
 */
export function resolveZone(
  postcode: string | null,
  zones: DeliveryZone[],
  ranges: PostcodeRange[],
): ZoneResolution {
  const fallback = zones.find((z) => isFallbackZone(z)) ?? null;

  const n = postcode == null ? NaN : Number(postcode);
  const candidates = Number.isFinite(n)
    ? ranges
      .filter((r) => n >= r.from && n <= r.to)
      .map((r) => ({ range: r, zone: zones.find((z) => z.id === r.zoneId) ?? null }))
      .filter((m): m is { range: PostcodeRange; zone: DeliveryZone } => !!m.zone && isActive(m.zone))
      .sort((a, b) => (a.range.to - a.range.from) - (b.range.to - b.range.from) || a.range.zoneId.localeCompare(b.range.zoneId))
    : [];
  const matched = candidates[0];

  if (matched && zoneIsPriced(matched.zone)) {
    return { zone: matched.zone, basis: "postcode_zone", caveats: [] };
  }

  if (fallback && zoneIsPriced(fallback)) {
    return {
      zone: fallback,
      basis: "fallback_zone",
      caveats: matched
        ? ["The matched zone has not been priced yet — using the conservative fallback."]
        : [],
    };
  }

  // Branch 4 — a deployment fault, not a business state: it occurs only
  // before the owner has entered the fallback zone's three numbers. D9 is not
  // re-opened here and "show nothing" is not a business rule this returns.
  return { zone: null, basis: "unpriced_table", caveats: ["No zone in this deployment carries a rate."] };
}

/** The D1 read, separate from the pure resolver above so every case of the
 *  resolution logic is testable against plain arrays. */
export async function loadZonesAndRanges(env: Env): Promise<{ zones: DeliveryZone[]; ranges: PostcodeRange[] }> {
  const [{ results: zoneRows }, { results: rangeRows }] = await Promise.all([
    env.DB.prepare(
      "SELECT id, label, min_charge, rate_per_sqm, max_charge, is_fallback, active FROM delivery_zone",
    ).all<any>(),
    env.DB.prepare("SELECT zone_id, pc_from, pc_to FROM delivery_postcode_range").all<any>(),
  ]);
  const zones: DeliveryZone[] = (zoneRows ?? []).map((r) => ({
    id: r.id, label: r.label,
    minCharge: r.min_charge, ratePerSqm: r.rate_per_sqm, maxCharge: r.max_charge,
    isFallback: !!r.is_fallback, active: !!r.active,
  }));
  const ranges: PostcodeRange[] = (rangeRows ?? []).map((r) => ({ zoneId: r.zone_id, from: r.pc_from, to: r.pc_to }));
  return { zones, ranges };
}
