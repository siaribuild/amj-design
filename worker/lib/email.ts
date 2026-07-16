// Email dispatch seam + notification audit trail.
//
// MVP has NO email provider wired, so sendEmail() logs the message and reports
// "logged". Drop in a provider (Resend / MailChannels / SES) behind the marked
// seam and set the API key in wrangler vars — nothing else changes. Every send
// is also recorded as a `notification` row for auditability.
import type { Env } from "../types";
import { uuid } from "./util";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  templateKey?: string;
}

export async function sendEmail(env: Env, msg: EmailMessage): Promise<"sent" | "logged" | "failed"> {
  // ── Provider seam ──────────────────────────────────────────────────────────
  // if (env.RESEND_API_KEY) {
  //   const res = await fetch("https://api.resend.com/emails", {
  //     method: "POST",
  //     headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
  //     body: JSON.stringify({ from: env.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text }),
  //   });
  //   return res.ok ? "sent" : "failed";
  // }
  console.log(`[email] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
  return "logged";
}

// Send (if an email is supplied) and record the notification.
export async function notify(env: Env, opts: {
  recipient: string;
  eventType: string;
  channel?: "email" | "inbox";
  templateKey?: string;
  email?: EmailMessage;
}): Promise<void> {
  let state: "sent" | "failed" | "queued" = "queued";
  if (opts.email) {
    const r = await sendEmail(env, opts.email);
    state = r === "failed" ? "failed" : "sent";
  }
  await env.DB.prepare(
    "INSERT INTO notification (id, recipient_subject, event_type, channel, template_key, sent_at, delivery_state) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)",
  ).bind(uuid(), opts.recipient, opts.eventType, opts.channel ?? "email", opts.templateKey ?? null, state).run();
}
