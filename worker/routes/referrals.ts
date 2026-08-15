// /api — the referral program's customer and public surfaces. Routes stay thin;
// the rules live in worker/lib/referrals.ts.
import { Hono } from "hono";
import type { Env } from "../types";
import { resolveUser } from "../lib/auth";
import { ensureReferralCode, payoutComplete } from "../lib/referrals";

export const referrals = new Hono<{ Bindings: Env }>();

// The REFERRER's screen. Under D18, "details missing" is the primary entry state
// for every new referrer rather than an error, so this answers "where are you in
// joining?" before it answers anything about money.
referrals.get("/account/referrals", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  return c.json({
    referrerGate: { complete: payoutComplete(user) },
    // WITHHELD, never issued-inactive: until the details exist there is no code
    // to click, read out, or set a cookie from.
    code: user ? await ensureReferralCode(c.env, user) : null,
  });
});
