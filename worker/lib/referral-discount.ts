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

/** The badge an ISSUED quote or order carries, from the frozen stamp.
 *
 *  A LABEL is frozen here, never a price. The price was already locked by issuing;
 *  what this preserves is the sentence — a quote that said "includes your 2.5%
 *  referral discount" must keep saying so after the tradie orders and their
 *  eligibility ends, because it remains true of that quote.
 *
 *  Derived from the stamped column rather than from live state for exactly that
 *  reason: live state moves, and a document describing what already happened must
 *  not move with it. */
/** What a reviewer needs to know before they put a price on a referred job.
 *
 *  THE FLAGS ARE NOT GATES. Nothing here refuses anything — a shared phone is a
 *  father and son on one number at least as often as it is one person with two
 *  logins, and refusing on it would cost real referrals to catch few frauds.
 *
 *  The automatic gates cannot see this class of thing at all: at signup the
 *  referred side usually has no ABN, and nothing compares addresses. What
 *  actually contains self-referral here is that this business issues no price
 *  without a human looking at the job — so the honest control is to tell that
 *  human what is odd, while they are still deciding, and let them judge. */
export async function opsReferralReview(
  env: Env,
  projectId: string,
): Promise<{ applied: boolean; percent: number; referrerName: string; flags: string[] } | null> {
  const row = await env.DB
    .prepare(
      `SELECT r.discount_percent, r.status,
              ref.company AS ref_company, ref.name AS ref_name, ref.abn AS ref_abn,
              ref.phone AS ref_phone,
              mate.company AS mate_company, mate.abn AS mate_abn, mate.phone AS mate_phone,
              p.delivery_postcode AS mate_postcode,
              (SELECT p2.delivery_postcode FROM project p2
                WHERE p2.owner_user_id = r.referrer_user_id
                  AND p2.delivery_postcode IS NOT NULL
                ORDER BY p2.created_at DESC LIMIT 1) AS ref_postcode
         FROM project p
         JOIN referral r ON r.referred_user_id = p.owner_user_id
         JOIN user ref ON ref.id = r.referrer_user_id
         JOIN user mate ON mate.id = r.referred_user_id
        WHERE p.id = ?`,
    )
    .bind(projectId)
    .first<Record<string, string | number | null>>();
  if (!row) return null;

  const same = (a: unknown, b: unknown, strip = /\s/g) => {
    const norm = (v: unknown) => String(v ?? "").replace(strip, "").toLowerCase();
    return norm(a).length > 0 && norm(a) === norm(b);
  };

  const flags: string[] = [];
  if (same(row.ref_abn, row.mate_abn, /\D/g)) flags.push("abn");
  if (same(row.ref_phone, row.mate_phone, /\D/g)) flags.push("phone");
  if (same(row.ref_company, row.mate_company)) flags.push("business_name");
  if (same(row.ref_postcode, row.mate_postcode)) flags.push("postcode");

  return {
    applied: row.status === "recorded",
    percent: Number(row.discount_percent ?? 0),
    referrerName: String(row.ref_company ?? row.ref_name ?? "").trim() || "a tradie",
    flags,
  };
}

export async function issuedReferralBadge(
  env: Env,
  projectId: string,
): Promise<{ percent: number; referrerName: string } | null> {
  const row = await env.DB
    .prepare(
      `SELECT p.referral_percent_at_issue AS percent, u.company, u.name
         FROM project p
         LEFT JOIN referral r ON r.referred_user_id = p.owner_user_id
         LEFT JOIN user u ON u.id = r.referrer_user_id
        WHERE p.id = ?`,
    )
    .bind(projectId)
    .first<{ percent: number | null; company: string | null; name: string | null }>();
  if (!row?.percent) return null;
  return {
    percent: row.percent,
    referrerName: row.company?.trim() || row.name?.trim() || "a tradie you know",
  };
}
