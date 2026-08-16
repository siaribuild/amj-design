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
import {
  markPayoutsPaid, payoutCsv, payoutHistory, payoutQueue, publicProgram, recordReferral, reversePayout,
} from "../lib/referrals";

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

// The weekly run. Reading this screen reads bank details in the clear, which is
// why the queue is built by a function that records the read — the route cannot
// obtain them any other way.
opsReferrals.get("/payouts", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  return c.json(await payoutQueue(c.env, staff.id));
});

// What already went out. Registered ahead of /payouts/:id/failed for the same
// reason as the export: a literal segment must never be read as an id.
opsReferrals.get("/payouts/history", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  return c.json({
    payouts: await payoutHistory(c.env, { from: c.req.query("from"), to: c.req.query("to") }),
  });
});

// The same run, as a file to work from beside the banking screen.
//
// Registered BEFORE /payouts/:id/failed so a literal path can never be read as
// an id, and staff-gated exactly like its siblings: this is every referrer's
// banking in one download.
//
// The route does no reading of its own — payoutCsv obtains the numbers through
// the one function that records having been used. A handler that built the same
// file from the user table would leave no trace of the largest single disclosure
// in the feature.
opsReferrals.get("/payouts/export.csv", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const csv = await payoutCsv(c.env, staff.id);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="referral-payouts-${date}.csv"`,
      // It contains bank details. Nothing may hold a copy.
      "Cache-Control": "no-store",
    },
  });
});

// Money went out. Recorded after the transfer is made, not before — this screen
// tells staff who to pay; the bank is where it actually happens.
opsReferrals.post("/payouts/mark-paid", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const body: Record<string, unknown> = await c.req.json().catch(() => ({}));
  const userIds = Array.isArray(body.userIds) ? body.userIds.map(String) : [];
  const reference = String(body.reference ?? "").trim();
  if (userIds.length === 0) return c.json({ error: "no_recipients" }, 400);
  // The bank's reference is how this is reconciled later. Without it the row
  // says money moved and gives nobody a way to find it.
  if (!reference) return c.json({ error: "reference_required" }, 400);

  const paid = await markPayoutsPaid(c.env, {
    userIds, reference, actorUserId: staff.id,
    note: typeof body.note === "string" ? body.note : undefined,
  });
  return c.json({ paid });
});

// It bounced. One action for both real cases — a rejected transfer and a
// mis-recorded one — because the reason is what distinguishes them and the
// remedy is identical.
opsReferrals.post("/payouts/:id/failed", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  await reversePayout(c.env, c.req.param("id"));
  return c.json({ ok: true });
});

// Attach a code to an account, on the customer's say-so.
//
// ⚠️ IT CALLS recordReferral, IT DOES NOT INSERT. Every gate the customer paths
// run — code valid, referrer payable and not staff, not self-referral, not the
// same business, not already referred, no order yet — applies identically here.
// A privileged path that skips them becomes the way around all of them, and the
// person using it is the one taking the phone call from a mate.
//
// `source: 'manual'` is accurate rather than a compromise: the customer wrote
// the code on their own account request and staff transcribed it. That needs no
// new provenance value and no migration.
//
// The refusals here are SPECIFIC, where the customer-facing ones are deliberately
// vague. That is not an inconsistency: vagueness exists so a stranger cannot probe
// which codes are real, and an internal screen has no stranger on it — Ops needs
// to know whether to ring the applicant back or drop it.
opsReferrals.post("/link", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const body: Record<string, unknown> = await c.req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const code = String(body.code ?? "").trim();

  const user = String(body.userId ?? "")
    ? await c.env.DB.prepare("SELECT id FROM user WHERE id = ?").bind(String(body.userId)).first<{ id: string }>()
    : await c.env.DB.prepare("SELECT id FROM user WHERE email = ?").bind(email).first<{ id: string }>();
  if (!user) return c.json({ error: "no_such_account" }, 404);

  const recorded = await recordReferral(c.env, {
    referredUser: user,
    code,
    // Not 'link': no cookie was involved. A tradie wrote a code on a form and a
    // human typed it in, which is what manual has always meant here.
    source: "manual",
  });
  if (recorded.ok === false) return c.json({ error: recorded.error }, 400);
  return c.json({ ok: true });
});
