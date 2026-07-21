// /api/enquiries — public Contact-page submissions (question or showroom
// appointment). Supersedes /api/contact. Every accepted submission gets a durable
// OpenFrame reference and server-owned source attribution, is persisted, audited,
// and triggers customer + internal (+ manufacturer, for appointments) emails.
//
// Spam controls mirror the old contact route: hidden honeypot, Cloudflare
// Turnstile (verified when TURNSTILE_SECRET is set), and per-IP throttling.
import { Hono } from "hono";
import type { Env } from "../types";
import { normEmail, resolveUser } from "../lib/auth";
import { notify } from "../lib/email";
import { logEvent } from "../lib/activity";
import { uuid } from "../lib/util";
import { getActiveLocations } from "../../src/data/catalogue";
import { validateEnquiry, normalizePhone, enquiryReference, FORM_VERSION } from "../lib/enquiry";

export const enquiries = new Hono<{ Bindings: Env }>();

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const nowSql = () => new Date().toISOString().replace("T", " ").replace(/\..+/, "");

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

// Pull the whitelisted UTM/context fields the client may send (analytics only —
// never trusted to set attribution ownership).
function clientContext(cc: any) {
  const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  const utm: Record<string, string> = {};
  for (const k of utmKeys) if (cc?.[k]) utm[k] = clip(cc[k], 200);
  return {
    landingPath: clip(cc?.landing_path, 300) || null,
    referrer: clip(cc?.referrer, 500) || null,
    utmJson: Object.keys(utm).length ? JSON.stringify(utm) : null,
  };
}

// POST /api/enquiries
enquiries.post("/enquiries", async (c) => {
  const body = await c.req.json().catch(() => ({}));

  // Honeypot — real users never fill this. Pretend success + drop.
  if (clip(body?.website, 100)) return c.json({ ok: true, reference: null });

  const intent = String(body?.intent ?? "");
  const locationId = clip(body?.locationId, 80);
  // Validate the location against the LIVE registry (active only). A stale client
  // payload naming an inactive/unknown location is rejected.
  const loc = locationId ? getActiveLocations().find((l) => l.id === locationId) : undefined;

  const errors = validateEnquiry(
    { intent, name: body?.name, email: body?.email, phone: body?.phone,
      privacyConsent: !!body?.privacyConsent, message: body?.message,
      locationId, bestTimeToCall: String(body?.bestTimeToCall ?? "") },
    !!loc,
  );
  if (errors.length) return c.json({ error: "invalid", fields: errors }, 400);

  // Throttle: one/min and five/hour per source IP.
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
  if (await c.env.KV.get(`enq:min:${ip}`)) return c.json({ error: "rate_limited" }, 429);
  const hourKey = `enq:hr:${ip}`;
  const usedHour = parseInt((await c.env.KV.get(hourKey)) ?? "0", 10) || 0;
  if (usedHour >= 5) return c.json({ error: "rate_limited" }, 429);

  if (c.env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(c.env.TURNSTILE_SECRET, clip(body?.token, 4000), ip);
    if (!ok) return c.json({ error: "captcha" }, 400);
  }
  await c.env.KV.put(`enq:min:${ip}`, "1", { expirationTtl: 60 });
  await c.env.KV.put(hourKey, String(usedHour + 1), { expirationTtl: 3600 });

  // Signed-in context (attribution stays server-owned regardless).
  const user = await resolveUser(c.env, c.req.raw);

  // Reference — generated BEFORE any notification. Simple per-year sequence.
  const year = new Date().getUTCFullYear();
  const cnt = await c.env.DB.prepare(
    "SELECT count(*) AS n FROM enquiry WHERE public_reference LIKE ?",
  ).bind(`OF-ENQ-${year}-%`).first<{ n: number }>();
  const reference = enquiryReference(year, (cnt?.n ?? 0) + 1);

  const isAppt = intent === "appointment_request";
  const ctx = clientContext(body?.client_context);
  const id = uuid();

  await c.env.DB.prepare(`
    INSERT INTO enquiry (
      id, public_reference, intent,
      name, email, email_display, phone, phone_display, customer_type, company,
      topic, message,
      location_id, location_suburb, location_state, products_interest, best_time_to_call, preferred_days_json, appointment_notes,
      account_id, project_id,
      source_owner, source_entry_point, landing_path, referrer, utm_json, form_version,
      privacy_version, marketing_opt_in,
      appointment_status, handed_off_at
    ) VALUES (?,?,?, ?,?,?,?,?,?,?, ?,?, ?,?,?,?,?,?,?, ?,?, 'OPENFRAME','CONTACT_PAGE',?,?,?,?, ?,?, ?,?)
  `).bind(
    id, reference, intent,
    clip(body?.name, 200), normEmail(body?.email), clip(body?.email, 200),
    normalizePhone(body?.phone) || null, clip(body?.phone, 60) || null,
    clip(body?.customerType, 40) || null, clip(body?.company, 200) || null,
    isAppt ? null : (clip(body?.topic, 120) || null),
    isAppt ? null : clip(body?.message, 5000),
    loc?.id ?? null, loc?.suburb ?? null, loc?.stateCode ?? null,
    isAppt ? (clip(body?.productsInterest, 40) || null) : null,
    isAppt ? clip(body?.bestTimeToCall, 20) : null,
    isAppt && Array.isArray(body?.preferredDays) ? JSON.stringify(body.preferredDays.slice(0, 7).map((d: unknown) => clip(d, 12))) : null,
    isAppt ? (clip(body?.notes, 2000) || null) : null,
    user?.id ?? null, null,
    ctx.landingPath, ctx.referrer, ctx.utmJson, FORM_VERSION,
    clip(body?.privacyVersion, 20) || "2026-07", body?.marketingOptIn ? 1 : 0,
    isAppt ? "requested" : "not_applicable", isAppt ? nowSql() : null,
  ).run();

  await logEvent(c.env, { actor: user?.id ?? "public", entityType: "enquiry", entityId: id, action: `enquiry submitted (${intent})` });

  // ── Notifications (persisted first; each recorded in `notification`) ────────
  const customerEmail = clip(body?.email, 200);
  const firstName = clip(body?.name, 200).split(" ")[0] || "there";
  const customerText = isAppt
    ? `Hi ${firstName},\n\nYour appointment request has been logged as ${reference}. A representative will call you to agree on a suitable showroom visit time. No appointment is confirmed yet.\n\nSelected showroom: ${loc?.displayName}\n\n— OpenFrame`
    : `Hi ${firstName},\n\nThanks — your question has been logged as ${reference}. We have emailed you a copy and will respond using the contact details provided.\n\n— OpenFrame`;
  // Appointments are phone-first: only email a confirmation when the customer
  // actually gave an address.
  if (customerEmail) {
    await notify(c.env, {
      recipient: customerEmail, eventType: "enquiry.confirmation", templateKey: "enquiry_customer",
      email: { to: customerEmail, subject: `Your OpenFrame enquiry ${reference}`, text: customerText },
    });
  }

  const internalTo = c.env.ENQUIRY_INTERNAL_TO || c.env.CONTACT_TO || c.env.EMAIL_FROM || "quotes@openframe.com.au";
  const summary = isAppt
    ? `Appointment request · ${loc?.displayName}\nBest time to call: ${clip(body?.bestTimeToCall, 20)}`
    : `Question · ${clip(body?.topic, 120) || "General"}\n\n${clip(body?.message, 5000)}`;
  await notify(c.env, {
    recipient: internalTo, eventType: "enquiry.internal", templateKey: "enquiry_internal",
    email: { to: internalTo, subject: `New ${isAppt ? "appointment" : "question"} enquiry ${reference}`,
      text: `${reference}\n\nName: ${clip(body?.name, 200)}\nEmail: ${customerEmail}\nPhone: ${clip(body?.phone, 60) || "—"}\nCompany: ${clip(body?.company, 200) || "—"}\n\n${summary}\n\nOpen the ops console → Enquiries to action this lead.` },
  });

  // Appointment leads are also handed to the manufacturer (single env address for
  // all locations — never a per-location email). Reference in the subject.
  if (isAppt && c.env.MANUFACTURER_TO) {
    await notify(c.env, {
      recipient: c.env.MANUFACTURER_TO, eventType: "enquiry.handoff", templateKey: "enquiry_manufacturer",
      email: { to: c.env.MANUFACTURER_TO, subject: `OpenFrame appointment lead ${reference} — ${loc?.displayName}`,
        text: `New appointment lead from OpenFrame.\n\nReference: ${reference}\nShowroom: ${loc?.displayName}\nCustomer: ${clip(body?.name, 200)}\nPhone: ${clip(body?.phone, 60) || "—"}\nEmail: ${customerEmail}\nBest time to call: ${clip(body?.bestTimeToCall, 20)}\n\nPlease call to arrange the visit and acknowledge this lead back to OpenFrame (reference ${reference}). No appointment time is confirmed yet.` },
    });
  }

  return c.json({ ok: true, reference });
});
