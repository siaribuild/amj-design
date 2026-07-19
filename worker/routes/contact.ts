// /api/contact — public "Contact us" form intake.
//
// Defence in depth against spam/abuse: a hidden honeypot field, Cloudflare
// Turnstile (verified server-side when TURNSTILE_SECRET is set; skipped in dev),
// and per-IP throttling. Every accepted message is recorded in `contact_message`
// (so nothing is lost even if email delivery fails) and emailed to the designated
// inbox. Staff triage submissions from the ops console.
import { Hono } from "hono";
import type { Env } from "../types";
import { isEmail, normEmail } from "../lib/auth";
import { notify } from "../lib/email";
import { uuid } from "../lib/util";

export const contact = new Hono<{ Bindings: Env }>();

const MAX_MESSAGE = 5000;
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

// Verify a Turnstile token. Only called when a secret is configured; a failure
// (or a network error talking to Cloudflare) is treated as "not verified".
async function verifyTurnstile(secret: string, token: string, ip?: string): Promise<boolean> {
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

// POST /api/contact { name, email, phone?, company?, message, token?, website? }
contact.post("/contact", async (c) => {
  const body = await c.req.json().catch(() => ({}));

  // Honeypot: real users never fill this hidden field. Pretend success + drop.
  if (clip(body?.website, 100)) return c.json({ ok: true });

  const name = clip(body?.name, 200);
  const email = normEmail(body?.email);
  const phone = clip(body?.phone, 60);
  const company = clip(body?.company, 200);
  const message = clip(body?.message, MAX_MESSAGE);
  if (!name || !isEmail(email) || !message) return c.json({ error: "invalid" }, 400);

  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";

  // Throttle: at most one per minute and five per hour per source IP.
  if (await c.env.KV.get(`contact:min:${ip}`)) return c.json({ error: "rate_limited" }, 429);
  const hourKey = `contact:hr:${ip}`;
  const usedHour = parseInt((await c.env.KV.get(hourKey)) ?? "0", 10) || 0;
  if (usedHour >= 5) return c.json({ error: "rate_limited" }, 429);

  // Captcha — enforced only when configured (dev/tests run without it).
  if (c.env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(c.env.TURNSTILE_SECRET, clip(body?.token, 4000), ip);
    if (!ok) return c.json({ error: "captcha" }, 400);
  }

  await c.env.KV.put(`contact:min:${ip}`, "1", { expirationTtl: 60 });
  await c.env.KV.put(hourKey, String(usedHour + 1), { expirationTtl: 3600 });

  const id = uuid();
  await c.env.DB.prepare(
    "INSERT INTO contact_message (id, name, email, phone, company, message, source) VALUES (?, ?, ?, ?, ?, ?, 'contact-page')",
  ).bind(id, name, email, phone || null, company || null, message).run();

  // Email the designated inbox (records the notification regardless of delivery).
  const to = c.env.CONTACT_TO || c.env.EMAIL_FROM || "quotes@openframe.com.au";
  await notify(c.env, {
    recipient: to,
    eventType: "contact.received",
    templateKey: "contact_enquiry",
    email: {
      to,
      subject: `New enquiry from ${name}`,
      text: `New contact enquiry via the website.\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || "—"}\nCompany: ${company || "—"}\n\n${message}\n\n— Reply directly to ${email}.`,
    },
  });

  return c.json({ ok: true, id });
});
