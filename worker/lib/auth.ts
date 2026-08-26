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
// ponytail: SERIAL ceiling, not a hard cap — a compare-and-swap counter (D1
// `UPDATE … SET attempts = attempts + 1 WHERE key = ? AND attempts < ?`, checked
// via changes()) is the upgrade path if concurrent guessing matters.
//
// consumeChallenge below is read → check → write over KV, which offers no atomic
// increment. Requests that overlap between the read and the write all see the
// same `attempts` and all write the same value + 1, so N concurrent guesses cost
// the attacker ONE increment. Every budget quoted anywhere in this codebase —
// 5 per code, 25 per 15-minute window per record — therefore bounds a SERIAL
// attacker only, and the true bound under concurrency is not 25.
//
// Measured 2026-08-26 on the local runtime: 20 rounds of 5 genuinely overlapping
// requests (a 5-request burst completed in 70ms against a 48ms single-request
// latency) recorded 5 of 5 attempts every time — no lost updates. That is NOT
// evidence the cap holds in production: local KV is in-process and strongly
// consistent, whereas Workers KV is a distributed cache whose reads may be up to
// 60s stale, which widens the read→write window from microseconds to the round
// trip. The race is unreproducible here and undeniable in the code.
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
const codeHash = (subject: string, code: string) => sha256hex(`${subject}:${code}`);

export const sixDigit = () =>
  String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");

/** WHICH challenge — its KV key, and the subject mixed into the code hash.
 *
 *  The two travel together because they must never drift: a key that says one
 *  thing and a hash salted with another is a challenge that can be satisfied by
 *  a code issued for something else. Callers pick a constructor below rather
 *  than building the pair themselves, so there is no call site that can get the
 *  correspondence wrong.
 *
 *  Key PREFIXES must stay distinct per flow. `isEmail` permits a colon in the
 *  local part, so a single shared prefix would let the address "a@b.co:OF-1"
 *  and the guest pair (a@b.co, OF-1) collide onto one key AND one hash subject
 *  — a code issued for one would verify the other. */
/*  THREE fields, because two of them answer different questions and merging them
 *  is how the doubled-budget bugs happened:
 *
 *    key/subject — WHO this code was emailed to. Must stay recipient-specific: a
 *      code sent to one address must not be redeemable by someone who typed a
 *      different one, or the code stops proving control of the mailbox, which is
 *      the only thing an emailed OTP proves.
 *    budget      — WHAT is being protected. Must be a function of the resolved
 *      RECORD alone and never of caller input, or every extra way of naming the
 *      record buys another full allowance of guesses.
 *
 *  Guest tracking has two ways to name one record and both are legitimate, so
 *  those two answers genuinely differ there. For sign-in the address IS the
 *  record and all three collapse onto it. */
export interface Challenge { key: string; subject: string; budget: string }

/** Customer + ops email sign-in. Subject is the address, key `otp:{email}`,
 *  counter `otpc:{email}` — byte-identical to what these two flows have always
 *  stored. There is no second way to address a mailbox, so no axis to collapse. */
export const signinChallenge = (email: string): Challenge =>
  ({ key: `otp:${email}`, subject: email, budget: `otpc:${email}` });

/** Guest order tracking, keyed on the RESOLVED RECORD rather than on the string
 *  the customer typed.
 *
 *  matchRecord answers two references for one row — a project that has become an
 *  order is reachable by both its OF-Q- quote reference and its OF- order number
 *  — and both buy the identical grant. Keyed per reference, that record would
 *  carry two independent guess budgets of equal power, i.e. exactly double the
 *  bound this cap exists to impose.
 *
 *  The PROJECT id, not the order id: matchRecord prefers the order once one
 *  exists, so keying on whatever it returned would silently change the key the
 *  moment a quote is accepted — invalidating a code already in a customer's
 *  inbox. The project id is the same before and after that transition.
 *
 *  The EMAIL is the second addressing axis and it stays out of the budget for
 *  the same reason. matchRecord accepts either the project's contact_email or
 *  the owner's user email, which can be two different people on one job, so
 *  alternating them used to open a second full allowance against one grant. The
 *  address still decides the key and the hash — a code mailed to the builder
 *  must not be redeemable by the account holder — but it no longer decides how
 *  many codes the record is worth.
 *
 *  Those are the only two axes: they are exactly the two disjunctions in
 *  matchRecord's WHERE clause, and case and whitespace are normalised on both
 *  sides before it runs. A third would have to be a third OR. */
export const guestTrackChallenge = (email: string, projectId: string): Challenge => ({
  key: `gcode:${email}:${projectId}`,
  subject: `${email}:${projectId}`,
  budget: `otpc:proj:${projectId}`,
});

interface OtpRecord { hash: string; attempts: number; at: number }

export async function storeChallenge(env: Env, ch: Challenge, code: string) {
  const rec: OtpRecord = { hash: await codeHash(ch.subject, code), attempts: 0, at: Date.now() };
  await env.KV.put(ch.key, JSON.stringify(rec), { expirationTtl: OTP_TTL });
}

// Gate email-code issuance to stop enumeration/spam and prevent overwriting a
// still-valid outstanding code. Returns false (→ caller responds neutrally and
// sends nothing) when the address is in cooldown or over its per-window cap.
// Applied identically to the customer and ops challenge routes.
export async function challengeAllowed(env: Env, ch: Challenge): Promise<boolean> {
  const raw = await env.KV.get(ch.key);
  if (raw) {
    // A code is still live: only allow a resend after the cooldown, and never
    // silently overwrite one inside it (that would invalidate the real user's code).
    try { const rec = JSON.parse(raw) as OtpRecord; if (rec.at && Date.now() - rec.at < RESEND_COOLDOWN_MS) return false; } catch { /* reissue on corrupt record */ }
  }
  // The challenge's OWN budget key — the record for guest tracking, the address
  // for sign-in (where `otpc:{email}` stays byte-identical, so no live counter
  // resets on deploy). Never derived from the key or the subject: both of those
  // carry caller input, and a budget keyed on caller input is a budget the
  // caller can duplicate by addressing the same record another way.
  //
  // Read-modify-write, so the same serial-only ceiling as MAX_OTP_ATTEMPTS.
  const countKey = ch.budget;
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
  return withinCap(env, `otpip:${ip}`, MAX_CHALLENGES_PER_IP, CHALLENGE_IP_WINDOW);
}

/** The counter above, key-agnostic.
 *
 *  Generalised rather than copied for the trade-application caps (spec §8.7:
 *  "reuse the existing challenge-limit machinery rather than inventing a
 *  second"). Behaviour is byte-identical to what challengeSourceAllowed did
 *  inline, which is why that function is now a one-line delegate — the existing
 *  AB-6 probes go on proving this code, rather than proving a copy of it.
 *
 *  The read-modify-write burst window documented above is inherited in full. It
 *  is a ceiling on sustained abuse, not a mutex, and every caller is choosing
 *  that trade knowingly. */
export async function withinCap(env: Env, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const count = parseInt((await env.KV.get(key)) ?? "0", 10) || 0;
  if (count >= max) return false;
  await env.KV.put(key, String(count + 1), { expirationTtl: windowSeconds });
  return true;
}

// Returns true on a correct code (and consumes it). Counts attempts; burns the
// challenge after too many tries.
//
// THE one code verifier in this Worker — sign-in, ops and guest tracking all
// route through here. Guest tracking used to hold a second, flattened copy: it
// stored a bare hex hash, which left nowhere to record an attempt, and so had no
// cap at all. That is how a 10^6 secret guarding order acceptance and drawing
// sign-off became brute-forceable in hours. A copy of this function is a copy of
// the bound it enforces, and the copy is where the bound goes missing.
//
// Every failure mode returns the same `false` — wrong code, no challenge stored,
// and capped are indistinguishable to the caller, so no response can tell an
// attacker which of the three they hit.
export async function consumeChallenge(env: Env, ch: Challenge, code: string): Promise<boolean> {
  const raw = await env.KV.get(ch.key);
  if (!raw) return false;
  // Tolerate a record this function cannot read, the way challengeAllowed
  // already does. Guest tracking stored a BARE hex hash at this key until it
  // started sharing this verifier, so every code issued in the ten minutes
  // before that deploy is still sitting there in the old shape — and an
  // unguarded parse turns a public endpoint into a 500, which is both a crash
  // and a signal that a record exists. Dropping it costs that guest one "send a
  // new code" and costs an attacker a challenge they could never satisfy.
  let rec: OtpRecord;
  try { rec = JSON.parse(raw) as OtpRecord; } catch { await env.KV.delete(ch.key); return false; }
  if (!rec || typeof rec.attempts !== "number" || typeof rec.hash !== "string" || typeof rec.at !== "number") {
    await env.KV.delete(ch.key);
    return false;
  }
  // ABSOLUTE expiry, enforced here rather than left to the KV TTL. Every failed
  // attempt below re-puts the record, and expirationTtl cannot express "eight
  // seconds left" (KV's floor is 60s), so the stored TTL drifted forward with
  // each guess and the ten minutes the customer was promised was not true.
  // Checking `at` pins the deadline to issuance whatever TTL the record carries.
  if (Date.now() - rec.at >= OTP_TTL * 1000) {
    await env.KV.delete(ch.key);
    return false;
  }
  // Defensive: nothing writes a record at the cap any more (the final failure
  // deletes instead), but a record stored by the previous revision can still be
  // in flight for the length of one TTL after deploy.
  if (rec.attempts >= MAX_OTP_ATTEMPTS) {
    await env.KV.delete(ch.key);
    return false;
  }
  if ((await codeHash(ch.subject, code)) === rec.hash) {
    await env.KV.delete(ch.key);
    return true;
  }
  rec.attempts += 1;
  // The LAST failure burns the challenge rather than storing it spent. Leaving a
  // spent record behind kept the resend cooldown running against it, so a
  // customer who mistyped five times was told to start over and then got no
  // email — the refusal copy promised a fresh code the server would not send.
  //
  // It also removes a state rather than adding one: "spent" and "never existed"
  // now look identical from outside instead of merely answering identically, so
  // this narrows what an attacker can distinguish rather than widening it. Their
  // allowance is unchanged — five guesses, then re-issue against the record's
  // own budget, which is what bounds the total.
  if (rec.attempts >= MAX_OTP_ATTEMPTS) {
    await env.KV.delete(ch.key);
    return false;
  }
  await env.KV.put(ch.key, JSON.stringify(rec), { expirationTtl: OTP_TTL });
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
