// /api/trade — the customer side of trade verification.
//
// Thin by design: every rule lives in worker/lib/trade.ts, which the ops
// decision routes call too. No route in this phase writes a trade fact directly.
//
// NO SUBJECT ID EXISTS ANYWHERE IN THIS FILE — not in the path, not in the
// query, not in the body. Scoping is by session only, which is what makes
// AB-P2-4 ("read someone else's ABN") structural rather than filtered: there is
// no parameter through which another account could be named.
//
// There is no auth middleware in this Worker (handover §4.5): a new endpoint is
// unauthenticated until it says otherwise, so this one says so first.
import { Hono } from "hono";
import type { Env } from "../types";
import { resolveUser } from "../lib/auth";
import { sourceIp } from "../lib/captcha";
import { applyForTrade, type TradeSource } from "../lib/trade";

export const trade = new Hono<{ Bindings: Env }>();

const SOURCES: readonly TradeSource[] = ["trade_page", "profile", "submit_gate"];

// POST /api/trade/application { abn, businessName, source? }
//
// The ABN travels in the BODY of a POST — never a query string or a path
// segment, where a referrer or a browser history would carry it (AB-P2-16).
//
// Exactly two success bodies exist, both constant. No echo of the submitted
// values, no application id, no timestamp, no reason: any of those would let the
// endpoint be used to discover WHICH fact about an ABN is wrong (AB-P2-7). The
// account's own state comes from /api/auth/me, where it is scoped to the session.
trade.post("/application", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (user.type !== "customer") return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  // Allowlist read. `status`, `abrSnapshot`, `decidedBy` and `discountPercent`
  // in the body fall on the floor because nothing here looks at them — there is
  // nothing to strip (AB-P2-3).
  const source = SOURCES.includes(body?.source as TradeSource) ? body.source as TradeSource : "profile";

  const result = await applyForTrade(c.env, user, {
    abn: body?.abn, businessName: body?.businessName,
    source, ip: sourceIp(c.req.raw),
  });

  if (result.ok) return c.json({ ok: true, status: result.status });
  if (result.error === "forbidden") return c.json({ error: result.error }, 403);
  if (result.error === "application_pending") return c.json({ error: result.error }, 409);
  if (result.error === "rate_limited") return c.json({ error: result.error }, 429);
  return c.json({ error: result.error }, 400);
});
