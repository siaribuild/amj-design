// /api/ops/referrals — the console's referral surfaces.
//
// Staff-only, and separate from ops.ts because that file is already the largest
// route module in the worker. Routes stay thin; the rules live in
// worker/lib/referrals.ts, which the customer paths use too — the ops actions
// call the SAME functions rather than writing rows directly, so a privileged
// path cannot become the way around a gate.
import { Hono } from "hono";
import type { Env } from "../types";
import { resolveStaff } from "../lib/staff";
import { applyPricingChange, VersionConflict } from "../lib/pricing-admin";
import { publicProgram } from "../lib/referrals";

export const opsReferrals = new Hono<{ Bindings: Env }>();

/** Every editable figure, in the shape the console edits them. */
interface ProgramRow {
  active: number; referrer_reward_active: number; referred_discount_active: number;
  rate_percent: number; cap_amount: number | null; min_order_amount: number;
  min_payout_balance: number; window_months: number; discount_percent: number;
  payout_timeframe_days: number; version: string;
}

const readProgram = (env: Env) =>
  env.DB.prepare("SELECT * FROM referral_program WHERE id = 'default'").first<ProgramRow>();

const dto = (row: ProgramRow) => ({
  active: Boolean(row.active),
  referrerRewardActive: Boolean(row.referrer_reward_active),
  referredDiscountActive: Boolean(row.referred_discount_active),
  ratePercent: row.rate_percent,
  capAmount: row.cap_amount,
  minOrderAmount: row.min_order_amount,
  minPayoutBalance: row.min_payout_balance,
  windowMonths: row.window_months,
  discountPercent: row.discount_percent,
  payoutTimeframeDays: row.payout_timeframe_days,
});

opsReferrals.get("/program", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const row = await readProgram(c.env);
  if (!row) return c.json({ error: "not_configured" }, 500);
  return c.json({ program: dto(row), version: row.version });
});

// The one screen where a typo becomes a public promise: every advertised figure
// in the feature is read from this row.
//
// Versioned through the same helper the rate cards use, rather than a bespoke
// write — two founders both in the console on one afternoon is an ordinary
// event, and a silent last-write-wins is how one of them loses a change without
// ever knowing it happened.
opsReferrals.put("/program", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const before = await readProgram(c.env);
  if (!before) return c.json({ error: "not_configured" }, 500);
  const body: Record<string, unknown> = await c.req.json().catch(() => ({}));

  const num = (key: string, fallback: number) => {
    const value = Number(body[key]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  const flag = (key: string, fallback: number) =>
    typeof body[key] === "boolean" ? (body[key] ? 1 : 0) : fallback;
  // NULLABLE, and it must stay so: null means "render no cap clause at all",
  // where 0 would mean "capped at nothing".
  const cap = body.capAmount === null || body.capAmount === undefined || body.capAmount === ""
    ? null
    : Number(body.capAmount);

  const after = {
    active: flag("active", before.active),
    referrer_reward_active: flag("referrerRewardActive", before.referrer_reward_active),
    referred_discount_active: flag("referredDiscountActive", before.referred_discount_active),
    rate_percent: num("ratePercent", before.rate_percent),
    cap_amount: cap !== null && Number.isFinite(cap) ? cap : null,
    min_order_amount: num("minOrderAmount", before.min_order_amount),
    min_payout_balance: num("minPayoutBalance", before.min_payout_balance),
    window_months: Math.round(num("windowMonths", before.window_months)),
    discount_percent: num("discountPercent", before.discount_percent),
    payout_timeframe_days: Math.round(num("payoutTimeframeDays", before.payout_timeframe_days)),
  };

  try {
    await applyPricingChange(c.env, {
      table: "referral_program",
      rowId: "default",
      actor: staff.id,
      before: before as unknown as Record<string, unknown> & { version?: string },
      after,
      expectedVersion: typeof body.expectedVersion === "string" ? body.expectedVersion : null,
      write: async (version) => {
        await c.env.DB
          .prepare(
            `UPDATE referral_program
                SET active = ?, referrer_reward_active = ?, referred_discount_active = ?,
                    rate_percent = ?, cap_amount = ?, min_order_amount = ?, min_payout_balance = ?,
                    window_months = ?, discount_percent = ?, payout_timeframe_days = ?,
                    version = ?, updated_at = datetime('now'), updated_by = ?
              WHERE id = 'default'`,
          )
          .bind(
            after.active, after.referrer_reward_active, after.referred_discount_active,
            after.rate_percent, after.cap_amount, after.min_order_amount, after.min_payout_balance,
            after.window_months, after.discount_percent, after.payout_timeframe_days,
            version, staff.id,
          )
          .run();
      },
    });
  } catch (error) {
    if (error instanceof VersionConflict) return c.json({ error: "version_conflict" }, 409);
    throw error;
  }

  const fresh = (await readProgram(c.env))!;
  // Answering with the PUBLIC shape as well, so the screen can show what the
  // site now advertises rather than what was typed into the form.
  return c.json({ program: dto(fresh), version: fresh.version, public: await publicProgram(c.env) });
});
