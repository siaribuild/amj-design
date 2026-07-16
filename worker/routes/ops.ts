// /api/ops — internal ops console API (staff-gated).
//
// O1: staff auth (domain-allowlisted internal OTP for dev; Cloudflare Access in
// prod), identity, and a dashboard summary. Queues, the quote workspace,
// approvals, etc. land in O2+.
import { Hono } from "hono";
import type { Env } from "../types";
import {
  clearCookie, consumeChallenge, createSession, destroySession, isEmail,
  normEmail, sessionCookie, sixDigit, storeChallenge, userDto,
} from "../lib/auth";
import { notify } from "../lib/email";
import { findOrCreateInternalUser, isStaffEmail, resolveStaff } from "../lib/staff";

export const ops = new Hono<{ Bindings: Env }>();

// POST /api/ops/auth/challenge { email } — allowlisted staff only; neutral otherwise.
ops.post("/auth/challenge", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(body?.email);
  if (isEmail(email) && isStaffEmail(c.env, email)) {
    const code = sixDigit();
    await storeChallenge(c.env, email, code);
    await notify(c.env, {
      recipient: email,
      eventType: "ops.code.requested",
      templateKey: "ops_signin_code",
      email: { to: email, subject: "Your AMJ ops sign-in code", text: `Your ops console code is ${code}. It expires in 10 minutes.` },
    });
    if (c.env.APP_ENV !== "production") return c.json({ ok: true, devCode: code });
  }
  return c.json({ ok: true });
});

// POST /api/ops/auth/verify { email, code } — starts an internal-user session.
ops.post("/auth/verify", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(body?.email);
  const code = String(body?.code ?? "").trim();
  if (!isEmail(email) || !isStaffEmail(c.env, email) || !/^\d{6}$/.test(code)) {
    return c.json({ error: "invalid_code" }, 400);
  }
  if (!(await consumeChallenge(c.env, email, code))) return c.json({ error: "invalid_code" }, 400);

  const user = await findOrCreateInternalUser(c.env, email);
  const token = await createSession(c.env, user);
  c.header("Set-Cookie", sessionCookie(token, c.env), { append: true });
  return c.json({ authenticated: true, user: userDto(user) });
});

ops.post("/auth/logout", async (c) => {
  await destroySession(c.env, c.req.raw);
  c.header("Set-Cookie", clearCookie("amj_session", c.env));
  return c.json({ ok: true });
});

// GET /api/ops/me — the acting staff member, or 401.
ops.get("/me", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ authenticated: false, user: null }, 401);
  return c.json({ authenticated: true, user: userDto(staff) });
});

// GET /api/ops/summary — dashboard counts (staff-gated).
ops.get("/summary", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);

  const row = await c.env.DB.prepare(`
    SELECT
      (SELECT count(*) FROM project WHERE status_customer = 'submitted')                       AS submissions,
      (SELECT count(*) FROM project WHERE status_customer = 'under_review')                    AS in_review,
      (SELECT count(*) FROM "order" WHERE stage NOT IN ('after_sales','cancelled'))            AS active_orders,
      (SELECT count(*) FROM "order" WHERE stage IN ('deposit_invoiced','balance_invoiced'))    AS awaiting_payment,
      (SELECT count(*) FROM organisation)                                                       AS organisations,
      (SELECT count(*) FROM user WHERE type = 'customer')                                       AS customers
  `).first<Record<string, number>>();

  return c.json({
    submissions: row?.submissions ?? 0,
    inReview: row?.in_review ?? 0,
    activeOrders: row?.active_orders ?? 0,
    awaitingPayment: row?.awaiting_payment ?? 0,
    organisations: row?.organisations ?? 0,
    customers: row?.customers ?? 0,
    approvalsPending: 0, // approvals engine lands in O4
  });
});
