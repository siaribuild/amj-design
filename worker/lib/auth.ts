// Auth primitives: email-OTP challenge/verify and opaque KV-backed sessions.
//
// Ephemeral state lives in KV (never D1): otp:{email} and sess:{token}, both
// TTL-managed. Sessions embed the user's session_epoch so bumping that column
// invalidates every device at once (sign-out-all).
import type { Env } from "../types";
import { newToken, parseCookies, uuid } from "./util";

export const SESSION_COOKIE = "apertly_session";
const OTP_TTL = 60 * 10; // 10 minutes
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
const MAX_OTP_ATTEMPTS = 5;
// Abuse controls for email-code issuance (shared by customer + ops challenge).
const RESEND_COOLDOWN_MS = 60 * 1000;   // don't re-issue while a fresh code is outstanding
const CHALLENGE_WINDOW = 60 * 15;       // rolling window for the per-address hard cap (seconds)
const MAX_CHALLENGES_PER_WINDOW = 5;    // max codes emailed to one address per window
// Per-SOURCE cap. The per-address controls above are the wrong axis on their own:
// they bound what one victim receives and say nothing about total volume, so a
// bot rotating recipient addresses could emit unlimited mail from an endpoint
// that needs no session. Generous on purpose — corporate and carrier-grade NAT
// put many real people behind one address, and a legitimate user who cannot get
// a code is a worse outcome than a bot that gets sixty.
const CHALLENGE_IP_WINDOW = 60 * 60;    // seconds
const MAX_CHALLENGES_PER_IP = 60;       // codes issued per source address per window

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  company: string | null;
  abn: string | null;
  price_gst_mode: string | null;
  // The ACCOUNT address (migration 0053) — the account holder's own address.
  // A project's delivery destination is a different fact in a different place
  // (project.delivery_*) and is never derived from these.
  address_line1: string | null;
  address_line2: string | null;
  address_suburb: string | null;
  address_state: string | null;
  address_postcode: string | null;
  type: string;
  role: string | null;
  created_at: string | null;
  session_epoch: number;
  // Commercial, read-only everywhere outside the two creation INSERTs.
  discount_percent: number;
}

export const userDto = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  phone: u.phone,
  company: u.company ?? null,
  abn: u.abn ?? null,
  // Price-display preference; 'inc' is the default when unset (guests + legacy rows).
  priceGstMode: u.price_gst_mode === "ex" ? "ex" : "inc",
  // Account address. Served only on customer surfaces (/me, /verify, /profile) to
  // the account owner; no ops DTO carries them (AC-38 — Phase 2 owns that view).
  addressLine1: u.address_line1 ?? null,
  addressLine2: u.address_line2 ?? null,
  addressSuburb: u.address_suburb ?? null,
  addressState: u.address_state ?? null,
  addressPostcode: u.address_postcode ?? null,
  type: u.type,
  role: u.role ?? null,
  createdAt: u.created_at ?? null,
});

// Clipped at 254 (the RFC 5321 maximum) because these addresses become KV keys:
// `otp:{email}` and `otpc:{email}`. Workers KV rejects a key over 512 bytes, so
// an over-long address used to throw inside KV.get and turn the challenge route's
// deliberately neutral 200 into a 500 — which is itself an enumeration signal.
export const normEmail = (e: unknown) => String(e ?? "").trim().toLowerCase().slice(0, 254);
export const isEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// Dev-only affordances (surfacing OTP `devCode`, verbose email logging) are gated
// on this. Fail closed: ONLY an explicit "development" env qualifies, so a missing
// or unexpected APP_ENV never leaks codes on a deployed Worker.
export const isDevEnv = (env: Env) => env.APP_ENV === "development";

export async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const codeHash = (email: string, code: string) => sha256hex(`${email}:${code}`);

export const sixDigit = () =>
  String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");

interface OtpRecord { hash: string; attempts: number; at: number }

export async function storeChallenge(env: Env, email: string, code: string) {
  const rec: OtpRecord = { hash: await codeHash(email, code), attempts: 0, at: Date.now() };
  await env.KV.put(`otp:${email}`, JSON.stringify(rec), { expirationTtl: OTP_TTL });
}

// Gate email-code issuance to stop enumeration/spam and prevent overwriting a
// still-valid outstanding code. Returns false (→ caller responds neutrally and
// sends nothing) when the address is in cooldown or over its per-window cap.
// Applied identically to the customer and ops challenge routes.
export async function challengeAllowed(env: Env, email: string): Promise<boolean> {
  const raw = await env.KV.get(`otp:${email}`);
  if (raw) {
    // A code is still live: only allow a resend after the cooldown, and never
    // silently overwrite one inside it (that would invalidate the real user's code).
    try { const rec = JSON.parse(raw) as OtpRecord; if (rec.at && Date.now() - rec.at < RESEND_COOLDOWN_MS) return false; } catch { /* reissue on corrupt record */ }
  }
  const countKey = `otpc:${email}`;
  const count = parseInt((await env.KV.get(countKey)) ?? "0", 10) || 0;
  if (count >= MAX_CHALLENGES_PER_WINDOW) return false;
  await env.KV.put(countKey, String(count + 1), { expirationTtl: CHALLENGE_WINDOW });
  return true;
}

/** Per-source cap on code issuance, checked BEFORE challengeAllowed.
 *
 *  Deliberately a separate function rather than another argument to
 *  challengeAllowed: that one's per-address semantics are load-bearing and
 *  covered by tests, and the two limits answer different questions ("is this
 *  mailbox being flooded" vs "is this client a bot").
 *
 *  Both counters are read-modify-write over KV, which offers no atomic increment
 *  and is eventually consistent, so a burst of simultaneous requests can all read
 *  the same value and slip past. That is a real hole and it is accepted: closing
 *  it means moving the counter into D1, which puts a write on the unauthenticated
 *  path — a cheaper denial-of-service than the one being prevented. The cap is a
 *  ceiling on sustained abuse, not a mutex. */
export async function challengeSourceAllowed(env: Env, ip: string): Promise<boolean> {
  const key = `otpip:${ip}`;
  const count = parseInt((await env.KV.get(key)) ?? "0", 10) || 0;
  if (count >= MAX_CHALLENGES_PER_IP) return false;
  await env.KV.put(key, String(count + 1), { expirationTtl: CHALLENGE_IP_WINDOW });
  return true;
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

/** Whether this sign-in CREATED the account, reported rather than inferred.
 *
 *  Referral attribution hangs off this flag, and AC-7 — an existing customer
 *  clicking a mate's link is never a referral — is regression-critical. Returning
 *  the fact makes it impossible for a caller to guess wrongly: there is no
 *  heuristic at the call site about row counts or timestamps that could drift. */
export async function findOrCreateUser(env: Env, email: string): Promise<{ user: UserRow; created: boolean }> {
  const existing = await env.DB.prepare("SELECT * FROM user WHERE email = ?").bind(email).first<UserRow>();
  if (existing) {
    await env.DB.prepare("UPDATE user SET last_verified_at = datetime('now') WHERE id = ?").bind(existing.id).run();
    return { user: existing, created: false };
  }
  const id = uuid();
  // name stays NULL: the person types their own name at the submission gate or at
  // the name step (AC-5). Deriving "j.smith92" from an email address and calling
  // it a name is the dishonesty registration Phase 1 exists to end.
  //
  // discount_percent is written EXPLICITLY as 0 (AC-9). The column's DEFAULT is 5
  // and it stays that way: changing a column default in SQLite means rebuilding
  // `user`, and a rebuild in this database has already fired ON DELETE CASCADE and
  // destroyed production rows. Naming the value at every INSERT makes the default
  // harmless dead weight instead.
  await env.DB.prepare(
    "INSERT INTO user (id, email, name, discount_percent, last_verified_at) VALUES (?, ?, NULL, 0, datetime('now'))",
  ).bind(id, email).run();
  return { user: (await env.DB.prepare("SELECT * FROM user WHERE id = ?").bind(id).first<UserRow>())!, created: true };
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
