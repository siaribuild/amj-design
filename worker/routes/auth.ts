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
import { updateAccountDetails } from "../lib/account";
import {
  challengeAllowed, challengeSourceAllowed, clearCookie, consumeChallenge, createSession, destroySession,
  findOrCreateUser, isDevEnv, isEmail, normEmail, resolveUser, sessionCookie, sixDigit, storeChallenge, userDto,
} from "../lib/auth";
import { recordReferral } from "../lib/referrals";
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

  const { user, created } = await findOrCreateUser(c.env, email);

  // AC-7, REGRESSION-CRITICAL: only a newly CREATED account can be attributed. An
  // existing customer clicking a mate's link was already ours, whatever cookie
  // they arrive with, and `created` is reported by findOrCreateUser rather than
  // guessed here so no call site can drift into inferring it.
  const referralCode = parseCookies(c.req.header("Cookie"))["of_ref"];
  if (created && referralCode) {
    // ⚠️ ATTRIBUTION IS NEVER WORTH A SIGN-IN (design §6.2). This hook sits after
    // the account row exists and before the session is created, so an exception
    // here fails /verify outright: the customer cannot log in, and their retry
    // takes the existing-user branch, which by design never looks at a code
    // (AC-7). One transient database error would cost the sign-in AND lose the
    // attribution permanently.
    //
    // Refusals return rather than throw, so this catches nothing on any ordinary
    // path — it exists for the transient failure, and it swallows deliberately.
    // The marketing consequence of a lost referral is smaller than a tradie who
    // cannot get into their account.
    try {
      await recordReferral(c.env, { referredUser: user, code: referralCode, source: "link" });
    } catch (error) {
      console.log(`[referral] attribution failed at signup for ${user.id}: ${String(error)}`);
    }
    // Cleared either way. A cookie kept for a retry would only be read by the
    // existing-user branch, which ignores it — so keeping it buys nothing and
    // leaves a stale code on the device for three months.
    c.header("Set-Cookie", clearCookie("of_ref", c.env), { append: true });
  }

  // Merge: attach the anonymous claim project (if any, still unowned) to the user,
  // enforcing one draft per customer (merges lines if they already have a draft).
  const claim = parseCookies(c.req.header("Cookie"))[CLAIM_COOKIE];
  if (claim) await claimAnonProjectForUser(c.env, user.id, claim);

  const token = await createSession(c.env, user);
  c.header("Set-Cookie", sessionCookie(token, c.env), { append: true });
  if (claim) c.header("Set-Cookie", clearCookie(CLAIM_COOKIE, c.env), { append: true });
  return c.json({ authenticated: true, anonymous: false, user: userDto(user) });
});

// POST /api/auth/profile { name?, phone?, company?, abn?, priceGstMode?,
// addressLine1?, addressLine2?, addressSuburb?, addressState?, addressPostcode? }
// — persist the signed-in user's own editable fields.
//
// Thin by design: the allowlist, the validation, the trimming and the single
// session-scoped UPDATE all live in worker/lib/account.ts. No subject id is
// accepted in the path or the body — scoping is by session only (spec §7.4).
auth.post("/profile", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const result = await updateAccountDetails(c.env, user, body);
  if (!result.ok) return c.json({ error: result.error, fields: result.fields }, 400);
  return c.json({ user: userDto(result.user) });
});

// POST /api/auth/logout — drop the session and clear the cookie.
auth.post("/logout", async (c) => {
  await destroySession(c.env, c.req.raw);
  c.header("Set-Cookie", clearCookie("apertly_session", c.env));
  return c.json({ ok: true });
});
