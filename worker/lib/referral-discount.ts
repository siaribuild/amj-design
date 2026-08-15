// Does this user have a live referral discount right now, and what happened to
// it if not? Exactly one function answers that, and every caller asks it here.
//
// WHY THIS IS ITS OWN MODULE, AND WHY IT IMPORTS ALMOST NOTHING. Pricing needs
// this answer, and so does referrals.ts — which in turn has to reach the
// re-price path (lines.ts → pricing.ts) to keep stale drafts honest. If pricing
// imported referrals.ts the graph would close into
// pricing → referrals → lines → pricing, a cycle ESM only tolerates by accident
// of evaluation order. A leaf that imports nothing from lib/ cannot participate
// in one.
//
// NO STORED STATUS. Available / used / expired is DERIVED on every call from
// three records that already exist: the referral row, its expires_at, and
// whether the account has an order. A stored column would be a second source of
// truth for a fact those three already answer, and it would be wrong for exactly
// as long as it took someone to notice.
import type { Env } from "../types";

export type ReferralDiscountState = "none" | "available" | "used" | "expired" | "void";

export interface ReferralDiscount {
  state: ReferralDiscountState;
  /** The percentage to apply, from the referral row's SNAPSHOT — never the live
   *  config. 0 unless `state === 'available'`. */
  percent: number;
  referralId: string | null;
  expiresAt: string | null;
  /** The order that ended eligibility, when `state === 'used'`. */
  usedOrderId?: string;
}

const NONE: ReferralDiscount = { state: "none", percent: 0, referralId: null, expiresAt: null };

export async function referralDiscountState(
  env: Env,
  userId: string | null | undefined,
): Promise<ReferralDiscount> {
  if (!userId) return NONE;
  const row = await env.DB.prepare(
    `SELECT r.id, r.status, r.discount_percent, r.expires_at,
            (SELECT o.id FROM "order" o
                JOIN project p ON p.id = o.project_id
              WHERE p.owner_user_id = r.referred_user_id
              ORDER BY o.created_at LIMIT 1)                        AS used_order_id,
            (SELECT referred_discount_active FROM referral_program
              WHERE id = 'default')                                 AS side_active,
            datetime('now')                                         AS now_utc
       FROM referral r
      WHERE r.referred_user_id = ?`,
  ).bind(userId).first<{
    id: string; status: string; discount_percent: number; expires_at: string;
    used_order_id: string | null; side_active: number | null; now_utc: string;
  }>();
  if (!row) return NONE;

  const base = { referralId: row.id, expiresAt: row.expires_at };
  // A voided referral never happened, from the customer's side.
  if (row.status !== "recorded") return { ...base, state: "void", percent: 0 };
  // FIRST ORDER ONLY. The moment their first order exists, eligibility ends —
  // the intended, happy ending: it did its job.
  if (row.used_order_id) return { ...base, state: "used", percent: 0, usedOrderId: row.used_order_id };
  // Compared as SQLite datetime strings, both produced by SQLite, so the
  // comparison never crosses a timezone or a JS Date parse.
  if (row.expires_at <= row.now_utc) return { ...base, state: "expired", percent: 0 };
  // The one live gate: ops can switch the referred side off without touching the
  // referrer side. The MASTER on/off switch is deliberately absent here —
  // switching the program off stops new attribution, it does not withdraw a
  // discount already promised to a real person, and a switch that is never read
  // cannot be read wrongly.
  if (!row.side_active) return NONE;

  const percent = Number(row.discount_percent);
  if (!Number.isFinite(percent) || percent <= 0) return NONE;
  return { ...base, state: "available", percent };
}
