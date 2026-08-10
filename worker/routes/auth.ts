// /api/auth — passwordless email OTP + sessions.
//
// Customers authenticate with a one-time email code (blueprint: email OTP is fine
// for customers; internal staff use SSO on the ops domain, out of scope here).
// On verify we CLAIM the anonymous project (claim cookie) into the new session —
// the "save & continue" bridge from anon to registered.
import { Hono } from "hono";
import type { Env } from "../types";
import { CLAIM_COOKIE, parseCookies } from "../lib/util";
import { claimAnonProjectForUser } from "../lib/access";
import {
  challengeAllowed, challengeSourceAllowed, clearCookie, consumeChallenge, createSession, destroySession,
  findOrCreateUser, isDevEnv, isEmail, normEmail, resolveUser, sessionCookie, sixDigit, storeChallenge, userDto,
} from "../lib/auth";
import { sourceIp, verifyTurnstile } from "../lib/captcha";
import { notify } from "../lib/email";

export const auth = new Hono<{ Bindings: Env }>();

// GET /api/auth/me — resolve the session cookie to a user, else anonymous.
auth.get("/me", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  if (!user) return c.json({ authenticated: false, anonymous: true, user: null });
  return c.json({ authenticated: true, anonymous: false, user: userDto(user) });
});

// POST /api/auth/challenge { email, token? } — always neutral (no account enumeration).
//
// Deliberately sends to ANY valid address, whether or not an account exists —
// that is what keeps it from being an account-enumeration oracle. The cost of
// that choice is that the endpoint will email a stranger on request, so the
// controls here have to be about the CALLER, not the recipient: without them a
// bot rotating addresses turns an anti-enumeration measure into an open relay
// for fixed-content mail, at your sending domain's reputation.
auth.post("/challenge", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(body?.email);

  // 429 rather than the neutral 200: this says something about the SOURCE, never
  // about whether the address exists, so it leaks nothing the neutral response
  // was protecting. Checked before the captcha so a flood costs no siteverify calls.
  const ip = sourceIp(c.req.raw);
  if (!(await challengeSourceAllowed(c.env, ip))) return c.json({ error: "rate_limited" }, 429);

  if (c.env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(c.env.TURNSTILE_SECRET, String(body?.token ?? "").slice(0, 4000), ip);
    if (!ok) return c.json({ error: "captcha" }, 400);
  }

  if (isEmail(email) && (await challengeAllowed(c.env, email))) {
    const code = sixDigit();
    await storeChallenge(c.env, email, code);
    await notify(c.env, {
      recipient: email,
      eventType: "auth.code.requested",
      templateKey: "signin_code",
      vars: { code },
      email: { to: email, subject: "Your OpenFrame sign-in code", text: `Your sign-in code is ${code}. It expires in 10 minutes.` },
    });
    // Dev convenience: surface the code so the flow is testable without a provider.
    // Fail closed — only an explicit development env ever returns the code.
    if (isDevEnv(c.env)) {
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

  // Merge: attach the anonymous claim project (if any, still unowned) to the user,
  // enforcing one draft per customer (merges lines if they already have a draft).
  const claim = parseCookies(c.req.header("Cookie"))[CLAIM_COOKIE];
  if (claim) await claimAnonProjectForUser(c.env, user.id, claim);

  const token = await createSession(c.env, user);
  c.header("Set-Cookie", sessionCookie(token, c.env), { append: true });
  if (claim) c.header("Set-Cookie", clearCookie(CLAIM_COOKIE, c.env), { append: true });
  return c.json({ authenticated: true, anonymous: false, user: userDto(user) });
});

// POST /api/auth/profile { name?, phone?, company?, abn?, priceGstMode? } — persist
// the signed-in user's editable profile fields + business registration details +
// price-display preference (the account page mutates the server, not just React).
auth.post("/profile", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const name = body?.name !== undefined ? String(body.name).trim() : user.name;
  const phone = body?.phone !== undefined ? String(body.phone).trim() : user.phone;
  const company = body?.company !== undefined ? String(body.company).trim() : user.company;
  const abn = body?.abn !== undefined ? String(body.abn).trim() : user.abn;
  // Only 'ex' opts out; anything else (incl. unset/invalid) means inclusive.
  const priceGstMode = body?.priceGstMode !== undefined
    ? (String(body.priceGstMode) === "ex" ? "ex" : "inc")
    : user.price_gst_mode;
  await c.env.DB.prepare("UPDATE user SET name = ?, phone = ?, company = ?, abn = ?, price_gst_mode = ? WHERE id = ?")
    .bind(name || null, phone || null, company || null, abn || null, priceGstMode || null, user.id).run();
  const fresh = (await c.env.DB.prepare("SELECT * FROM user WHERE id = ?").bind(user.id).first<typeof user>())!;
  return c.json({ user: userDto(fresh) });
});

// POST /api/auth/logout — drop the session and clear the cookie.
auth.post("/logout", async (c) => {
  await destroySession(c.env, c.req.raw);
  c.header("Set-Cookie", clearCookie("apertly_session", c.env));
  return c.json({ ok: true });
});
