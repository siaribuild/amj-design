// /api/integrations — inbound webhooks. Currently the Sanity publish webhook
// (spec §11.3): verify signature → record changed IDs → invalidate the catalogue
// cache so a publish is reflected without waiting out the TTL.
//
// FAIL CLOSED: if the signing secret is not configured, or the signature does not
// verify, the callback is rejected — an unsigned request must never invalidate
// caches or be trusted.
import { Hono } from "hono";
import type { Env } from "../types";
import { invalidateCatalogue } from "../lib/catalogue";
import { logEvent } from "../lib/activity";

export const integrations = new Hono<{ Bindings: Env }>();

// Verify a Sanity webhook signature header: "t=<ts>,v1=<base64url HMAC-SHA256>"
// over "<ts>.<rawBody>", per Sanity's @sanity/webhook scheme.
async function verifySignature(secret: string, header: string, rawBody: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const ts = parts["t"]; const provided = parts["v1"];
  if (!ts || !provided) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${rawBody}`));
  // base64url without padding (Sanity's format).
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  // Constant-time-ish compare.
  if (expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

// POST /api/integrations/sanity/published
integrations.post("/sanity/published", async (c) => {
  const secret = c.env.SANITY_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: "webhook_not_configured" }, 501); // fail closed
  const header = c.req.header("sanity-webhook-signature") || "";
  const rawBody = await c.req.text();
  if (!header || !(await verifySignature(secret, header, rawBody))) {
    return c.json({ error: "invalid_signature" }, 401);
  }

  let payload: any = {};
  try { payload = JSON.parse(rawBody || "{}"); } catch { /* tolerate */ }
  // Record which documents changed (ids only — no content in general logs).
  const ids: string[] = Array.isArray(payload?.ids) ? payload.ids
    : payload?._id ? [payload._id] : [];

  invalidateCatalogue();
  await logEvent(c.env, { actor: "sanity-webhook", entityType: "catalogue", entityId: ids[0] ?? "*", action: `catalogue published (${ids.length || "unknown"} docs); cache invalidated` });
  return c.json({ ok: true, invalidated: true, documents: ids.length });
});
