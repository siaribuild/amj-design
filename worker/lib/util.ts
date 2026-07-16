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

export const CLAIM_COOKIE = "amj_claim";

// httpOnly claim cookie — 1 year. Secure only in production (localhost is http).
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
