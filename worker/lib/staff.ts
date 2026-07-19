// Staff identity for the ops console.
//
// Dev / local: a normal session (apertly_session cookie) that belongs to an
// internal user — created via the domain-allowlisted internal OTP flow.
// Prod: Cloudflare Access sits in front of ops.* and injects a signed JWT
// (Cf-Access-Jwt-Assertion); we verify it and map the email to an internal user.
//
// RBAC is a single "staff" role for now (type='internal' IS the gate). Persona
// roles arrive with the approvals engine (O4).
import type { Env } from "../types";
import { resolveUser, type UserRow } from "./auth";
import { uuid } from "./util";

export const DEFAULT_STAFF_DOMAINS = ["openframe.com.au"];

export function staffDomains(env: Env): string[] {
  return (env.STAFF_EMAIL_DOMAINS ?? DEFAULT_STAFF_DOMAINS.join(","))
    .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}

export function isStaffEmail(env: Env, email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && staffDomains(env).includes(domain);
}

// Find or create an internal user for an allowlisted email. Promotes an existing
// customer row to internal (e.g. a staffer who once used the customer portal).
export async function findOrCreateInternalUser(env: Env, email: string): Promise<UserRow> {
  const existing = await env.DB.prepare("SELECT * FROM user WHERE email = ?").bind(email).first<UserRow>();
  if (existing) {
    if (existing.type !== "internal") {
      await env.DB.prepare("UPDATE user SET type = 'internal', last_verified_at = datetime('now') WHERE id = ?").bind(existing.id).run();
      return { ...existing, type: "internal" };
    }
    await env.DB.prepare("UPDATE user SET last_verified_at = datetime('now') WHERE id = ?").bind(existing.id).run();
    return existing;
  }
  const id = uuid();
  await env.DB.prepare(
    "INSERT INTO user (id, email, name, type, last_verified_at) VALUES (?, ?, ?, 'internal', datetime('now'))",
  ).bind(id, email, email.split("@")[0]).run();
  return (await env.DB.prepare("SELECT * FROM user WHERE id = ?").bind(id).first<UserRow>())!;
}

// Resolve the acting staff member, or null.
//
// Fail closed: once Cloudflare Access is configured (both team domain + AUD set),
// a valid Access assertion is the ONLY accepted identity — the internal-session
// fallback is disabled so a request that reaches the Worker without passing Access
// (e.g. the ops host mis-configured, or a direct hit) cannot authenticate as staff.
// The session fallback exists solely for local/staging where Access isn't wired up.
export async function resolveStaff(env: Env, req: Request): Promise<UserRow | null> {
  const accessConfigured = !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
  if (accessConfigured) {
    const jwt = req.headers.get("Cf-Access-Jwt-Assertion");
    if (!jwt) return null;
    const email = await verifyAccessEmail(env, jwt);
    if (email && isStaffEmail(env, email)) return findOrCreateInternalUser(env, email);
    return null;
  }
  const user = await resolveUser(env, req);
  return user && user.type === "internal" ? user : null;
}

// Staff gate for the legacy seams (issue-revision / order advance / pay). A real
// staff identity is always required — never open, in any environment.
export async function isStaff(env: Env, req: Request): Promise<boolean> {
  return (await resolveStaff(env, req)) !== null;
}

// ── Cloudflare Access JWT verification (prod only; not exercised locally) ─────
// Verifies an RS256 Access assertion against the team's JWKS and returns the
// user email. Cached JWKS in KV for 1h.
async function verifyAccessEmail(env: Env, token: string): Promise<string | null> {
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;
    const header = JSON.parse(atob(h.replace(/-/g, "+").replace(/_/g, "/")));
    const payload = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
    const now = Date.now() / 1000;
    const skew = 60; // seconds of allowed clock skew

    // Required claims — enforced whether or not present (a missing claim is a
    // rejection, not a pass). Access always issues RS256 assertions.
    if (header.alg !== "RS256") return null;
    const auds = payload.aud == null ? [] : (Array.isArray(payload.aud) ? payload.aud : [payload.aud]);
    if (!auds.includes(env.ACCESS_AUD)) return null;
    if (typeof payload.exp !== "number" || now > payload.exp + skew) return null;
    if (typeof payload.iat === "number" && payload.iat > now + skew) return null;
    if (typeof payload.nbf === "number" && now < payload.nbf - skew) return null;
    const expectedIss = `https://${env.ACCESS_TEAM_DOMAIN}.cloudflareaccess.com`;
    if (payload.iss !== expectedIss) return null;

    const jwks = await getJwks(env);
    const jwk = jwks.find((k: any) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const data = new TextEncoder().encode(`${h}.${p}`);
    const sig = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data);
    return ok ? (payload.email ?? null) : null;
  } catch {
    return null;
  }
}

async function getJwks(env: Env): Promise<any[]> {
  const cacheKey = "access:jwks";
  const cached = await env.KV.get(cacheKey);
  if (cached) return JSON.parse(cached);
  const res = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}.cloudflareaccess.com/cdn-cgi/access/certs`);
  const body = await res.json<{ keys: any[] }>();
  await env.KV.put(cacheKey, JSON.stringify(body.keys), { expirationTtl: 3600 });
  return body.keys;
}
