// /api/auth — passwordless email OTP + sessions.
//
// Customers authenticate with a one-time email code (blueprint: email OTP is fine
// for customers; internal staff use SSO on the ops domain, out of scope here).
// On verify we CLAIM the anonymous project (claim cookie) into the new session —
// the "save & continue" bridge from anon to registered.
import { Hono } from "hono";
import type { Env } from "../types";
import { CLAIM_COOKIE, parseCookies } from "../lib/util";
import {
  clearCookie, consumeChallenge, createSession, destroySession, findOrCreateUser,
  isEmail, normEmail, resolveUser, sessionCookie, sixDigit, storeChallenge, userDto,
} from "../lib/auth";

export const auth = new Hono<{ Bindings: Env }>();

// GET /api/auth/me — resolve the session cookie to a user, else anonymous.
auth.get("/me", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  if (!user) return c.json({ authenticated: false, anonymous: true, user: null });
  return c.json({ authenticated: true, anonymous: false, user: userDto(user) });
});

// POST /api/auth/challenge { email } — always neutral (no account enumeration).
auth.post("/challenge", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(body?.email);
  if (isEmail(email)) {
    const code = sixDigit();
    await storeChallenge(c.env, email, code);
    // MVP: no email provider yet. Log server-side; surface in dev only so the
    // flow is testable end to end. Real delivery lands with notifications.
    console.log(`[auth] OTP for ${email}: ${code}`);
    if (c.env.APP_ENV !== "production") {
      return c.json({ ok: true, devCode: code });
    }
  }
  return c.json({ ok: true });
});

// POST /api/auth/verify { email, code } — verify, start session, claim anon project.
auth.post("/verify", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(body?.email);
  const code = String(body?.code ?? "").trim();
  if (!isEmail(email) || !/^\d{6}$/.test(code)) {
    return c.json({ error: "invalid_code" }, 400);
  }
  if (!(await consumeChallenge(c.env, email, code))) {
    return c.json({ error: "invalid_code" }, 400);
  }

  const user = await findOrCreateUser(c.env, email);

  // Merge: attach the anonymous claim project (if any, still unowned) to the user.
  const claim = parseCookies(c.req.header("Cookie"))[CLAIM_COOKIE];
  if (claim) {
    await c.env.DB.prepare(
      "UPDATE project SET owner_user_id = ?, claim_token = NULL WHERE claim_token = ? AND owner_user_id IS NULL",
    ).bind(user.id, claim).run();
  }

  const token = await createSession(c.env, user);
  c.header("Set-Cookie", sessionCookie(token, c.env), { append: true });
  if (claim) c.header("Set-Cookie", clearCookie(CLAIM_COOKIE, c.env), { append: true });
  return c.json({ authenticated: true, anonymous: false, user: userDto(user) });
});

// POST /api/auth/logout — drop the session and clear the cookie.
auth.post("/logout", async (c) => {
  await destroySession(c.env, c.req.raw);
  c.header("Set-Cookie", clearCookie("amj_session", c.env));
  return c.json({ ok: true });
});
