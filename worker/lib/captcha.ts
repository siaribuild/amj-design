// Cloudflare Turnstile verification, shared by every public form that can cause
// an outbound side effect (an email, a database row) without a session.
//
// Lifted verbatim out of routes/enquiries.ts, which had the only copy. The
// customer OTP challenge needs the same control for the same reason — it is an
// unauthenticated endpoint that emails an attacker-chosen address — and a second
// copy of a security primitive is how the two drift apart.
//
// Gated by the caller on env.TURNSTILE_SECRET being set, so a deployment (or a
// test harness) without a captcha provider behaves exactly as it did before.

/** Source address for throttling and for Turnstile's remoteip check.
 *
 *  CF-Connecting-IP is set by the edge and cannot be spoofed by the client on a
 *  Cloudflare-fronted request; X-Forwarded-For is the local/dev fallback. */
export const sourceIp = (req: Request): string =>
  req.headers.get("CF-Connecting-IP") || req.headers.get("X-Forwarded-For") || "unknown";

export async function verifyTurnstile(secret: string, token: string, ip?: string): Promise<boolean> {
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: form, signal: AbortSignal.timeout(3000),
    });
    const data = await res.json<{ success?: boolean }>().catch(() => ({}));
    return data?.success === true;
  } catch { return false; }
}
