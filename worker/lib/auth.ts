// Auth primitives: email-OTP challenge/verify and opaque KV-backed sessions.
//
// Ephemeral state lives in KV (never D1): otp:{email} and sess:{token}, both
// TTL-managed. Sessions embed the user's session_epoch so bumping that column
// invalidates every device at once (sign-out-all).
import type { Env } from "../types";
import { newToken, parseCookies, uuid } from "./util";

export const SESSION_COOKIE = "amj_session";
const OTP_TTL = 60 * 10; // 10 minutes
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
const MAX_OTP_ATTEMPTS = 5;

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  type: string;
  session_epoch: number;
}

export const userDto = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  phone: u.phone,
  type: u.type,
});

export const normEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();
export const isEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

export async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const codeHash = (email: string, code: string) => sha256hex(`${email}:${code}`);

export const sixDigit = () =>
  String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");

interface OtpRecord { hash: string; attempts: number }

export async function storeChallenge(env: Env, email: string, code: string) {
  const rec: OtpRecord = { hash: await codeHash(email, code), attempts: 0 };
  await env.KV.put(`otp:${email}`, JSON.stringify(rec), { expirationTtl: OTP_TTL });
}

// Returns true on a correct code (and consumes it). Counts attempts; burns the
// challenge after too many tries.
export async function consumeChallenge(env: Env, email: string, code: string): Promise<boolean> {
  const raw = await env.KV.get(`otp:${email}`);
  if (!raw) return false;
  const rec = JSON.parse(raw) as OtpRecord;
  if (rec.attempts >= MAX_OTP_ATTEMPTS) {
    await env.KV.delete(`otp:${email}`);
    return false;
  }
  if ((await codeHash(email, code)) === rec.hash) {
    await env.KV.delete(`otp:${email}`);
    return true;
  }
  rec.attempts += 1;
  await env.KV.put(`otp:${email}`, JSON.stringify(rec), { expirationTtl: OTP_TTL });
  return false;
}

export async function findOrCreateUser(env: Env, email: string): Promise<UserRow> {
  const existing = await env.DB.prepare("SELECT * FROM user WHERE email = ?").bind(email).first<UserRow>();
  if (existing) {
    await env.DB.prepare("UPDATE user SET last_verified_at = datetime('now') WHERE id = ?").bind(existing.id).run();
    return existing;
  }
  const id = uuid();
  const name = email.split("@")[0];
  await env.DB.prepare(
    "INSERT INTO user (id, email, name, last_verified_at) VALUES (?, ?, ?, datetime('now'))",
  ).bind(id, email, name).run();
  return (await env.DB.prepare("SELECT * FROM user WHERE id = ?").bind(id).first<UserRow>())!;
}

// ── Sessions ────────────────────────────────────────────────────────────────
interface SessionRecord { userId: string; epoch: number }

export async function createSession(env: Env, user: UserRow): Promise<string> {
  const token = newToken();
  const rec: SessionRecord = { userId: user.id, epoch: user.session_epoch };
  await env.KV.put(`sess:${token}`, JSON.stringify(rec), { expirationTtl: SESSION_TTL });
  return token;
}

export function sessionToken(req: Request): string | undefined {
  return parseCookies(req.headers.get("Cookie"))[SESSION_COOKIE];
}

// Resolve the signed-in user from the session cookie, honouring session_epoch.
export async function resolveUser(env: Env, req: Request): Promise<UserRow | null> {
  const token = sessionToken(req);
  if (!token) return null;
  const raw = await env.KV.get(`sess:${token}`);
  if (!raw) return null;
  const rec = JSON.parse(raw) as SessionRecord;
  const user = await env.DB.prepare("SELECT * FROM user WHERE id = ?").bind(rec.userId).first<UserRow>();
  if (!user || user.session_epoch !== rec.epoch) return null;
  return user;
}

export async function destroySession(env: Env, req: Request) {
  const token = sessionToken(req);
  if (token) await env.KV.delete(`sess:${token}`);
}

export function sessionCookie(token: string, env: Env): string {
  const attrs = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${SESSION_TTL}`];
  if (env.APP_ENV === "production") attrs.push("Secure");
  return attrs.join("; ");
}

// Expire a cookie (used to clear session / claim on logout / after merge).
export function clearCookie(name: string, env: Env): string {
  const attrs = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (env.APP_ENV === "production") attrs.push("Secure");
  return attrs.join("; ");
}
