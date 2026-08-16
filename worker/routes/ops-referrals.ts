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

// The list a staff member works from. Both parties named, the money at stake,
// and the review flags — because this is the screen where someone decides to
// take money away, and the row has to say what is at stake before they click.
opsReferrals.get("/", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const status = c.req.query("status") ?? "";
  const q = (c.req.query("q") ?? "").trim().toLowerCase();

  const { results } = await c.env.DB
    .prepare(
      `SELECT r.id, r.code, r.source, r.status, r.created_at, r.expires_at, r.void_reason,
              ref.company AS ref_company, ref.name AS ref_name, ref.email AS ref_email,
              ref.abn AS ref_abn, ref.phone AS ref_phone,
              mate.company AS mate_company, mate.name AS mate_name, mate.email AS mate_email,
              mate.abn AS mate_abn, mate.phone AS mate_phone,
              e.amount AS earning_amount, e.status AS earning_status,
              o.id AS order_id, o.order_no
         FROM referral r
         JOIN user ref ON ref.id = r.referrer_user_id
         JOIN user mate ON mate.id = r.referred_user_id
         LEFT JOIN referral_earning e ON e.referral_id = r.id
         LEFT JOIN "order" o ON o.id = e.order_id
        ORDER BY r.created_at DESC
        LIMIT 500`,
    )
    .all<Record<string, string | number | null>>();

  const name = (company: unknown, fallbackName: unknown, email: unknown) =>
    String(company ?? "").trim() || String(fallbackName ?? "").trim() || String(email ?? "");
  const same = (a: unknown, b: unknown, strip = /\s/g) => {
    const norm = (v: unknown) => String(v ?? "").replace(strip, "").toLowerCase();
    return norm(a).length > 0 && norm(a) === norm(b);
  };

  const referrals = (results ?? [])
    .map((row) => {
      const flags: string[] = [];
      if (same(row.ref_abn, row.mate_abn, /\D/g)) flags.push("abn");
      if (same(row.ref_phone, row.mate_phone, /\D/g)) flags.push("phone");
      if (same(row.ref_company, row.mate_company)) flags.push("business_name");
      return {
        id: String(row.id),
        code: String(row.code),
        source: String(row.source),
        status: String(row.status),
        createdAt: String(row.created_at),
        expiresAt: String(row.expires_at),
        voidReason: row.void_reason ?? null,
        referrerName: name(row.ref_company, row.ref_name, row.ref_email),
        referredName: name(row.mate_company, row.mate_name, row.mate_email),
        orderId: row.order_id ?? null,
        orderNo: row.order_no ?? null,
        // null when nothing is owed yet. The difference between voiding this and
        // voiding a row with confirmed money is the whole reason it is here.
        earning: row.earning_amount === null || row.earning_amount === undefined
          ? null
          : { amount: Number(row.earning_amount), status: String(row.earning_status) },
        flags,
      };
    })
    .filter((r) => (status ? r.status === status : true))
    .filter((r) => (q
      ? [r.code, r.referrerName, r.referredName].some((v) => v.toLowerCase().includes(q))
      : true));

  return c.json({ referrals });
});

// A REASON IS MANDATORY. Money not going out is a thing someone asks about
// later — often the person who is not being paid — and "voided" with no reason
// answers nothing. The customer-facing refusals are deliberately vague; this one
// is for the person who has to explain it.
opsReferrals.post("/:id/void", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const body: Record<string, unknown> = await c.req.json().catch(() => ({}));
  const reason = String(body.reason ?? "").trim();
  if (!reason) return c.json({ error: "reason_required" }, 400);

  await c.env.DB
    .prepare(
      `UPDATE referral SET status = 'void', void_reason = ?, voided_by = ?, voided_at = datetime('now')
        WHERE id = ? AND status = 'recorded'`,
    )
    .bind(reason, staff.id, c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

// Reversible, because it is a judgement call. One made on a phone call that
// turns out to be wrong should be corrected here rather than in the database.
opsReferrals.post("/:id/unvoid", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  await c.env.DB
    .prepare(
      `UPDATE referral SET status = 'recorded', void_reason = NULL, voided_by = NULL, voided_at = NULL
        WHERE id = ? AND status = 'void'`,
    )
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});
