import type { Env } from "../types";

export const uuid = () => crypto.randomUUID();

// Opaque, unguessable token for the anonymous claim cookie.
export const newToken = () =>
  (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const CLAIM_COOKIE = "apertly_claim";

// httpOnly claim cookie — 1 year. Secure only in production (localhost is http).
export const GUEST_COOKIE = "apertly_guest";

// Credential for a guest who has verified an emailed code against a record.
// Deliberately a SESSION cookie — no Max-Age, no Expires — so it dies when the
// browser closes: an anonymous person acting on a committed record should not
// leave a durable credential behind on a shared or borrowed machine. The
// server-side guest_grant.expires_at is the second, independent bound.
export function guestCookie(token: string, env: Env): string {
  const attrs = [`${GUEST_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (env.APP_ENV === "production") attrs.push("Secure");
  return attrs.join("; ");
}

export function clearGuestCookie(env: Env): string {
  const attrs = [`${GUEST_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (env.APP_ENV === "production") attrs.push("Secure");
  return attrs.join("; ");
}

export function claimCookie(token: string, env: Env): string {
  const attrs = [
    `${CLAIM_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 365}`,
  ];
  if (env.APP_ENV === "production") attrs.push("Secure");
  return attrs.join("; ");
}
