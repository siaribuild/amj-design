// Email dispatch seam + notification audit trail.
//
// Sends via Resend when RESEND_API_KEY is configured; otherwise logs the message
// ("logged") so dev works with no provider. Set the key as a Worker secret and
// EMAIL_FROM as a var:
//   wrangler secret put RESEND_API_KEY
//   # wrangler.jsonc vars: "EMAIL_FROM": "AMJ Trade Direct <quotes@yourdomain>"
// Every send is also recorded as a `notification` row for auditability.
import type { Env } from "../types";
import { uuid } from "./util";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  templateKey?: string;
}

const DEFAULT_FROM = "AMJ Trade Direct <onboarding@resend.dev>";

export async function sendEmail(env: Env, msg: EmailMessage): Promise<"sent" | "logged" | "failed"> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:log] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    return "logged";
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM || DEFAULT_FROM,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
      }),
    });
    if (!res.ok) {
      console.log(`[email:resend] ${res.status} ${await res.text().catch(() => "")}`);
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.log(`[email:resend] error ${String(e)}`);
    return "failed";
  }
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
