// Email dispatch seam + notification audit trail.
//
// Sends via Resend when RESEND_API_KEY is configured; otherwise logs the message
// ("logged") so dev works with no provider. Set the key as a Worker secret and
// EMAIL_FROM as a var:
//   wrangler secret put RESEND_API_KEY
//   # wrangler.jsonc vars: "EMAIL_FROM": "OpenFrame <quotes@yourdomain>"
// Every send is also recorded as a `notification` row for auditability.
import type { Env } from "../types";
import { isDevEnv } from "./auth";
import { loadEmailTemplate, applyPlaceholders } from "./emailTemplates";
import { uuid } from "./util";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  templateKey?: string;
}

const DEFAULT_FROM = "OpenFrame <onboarding@resend.dev>";

export async function sendEmail(env: Env, msg: EmailMessage): Promise<"sent" | "logged" | "failed"> {
  if (!env.RESEND_API_KEY) {
    // Dev: print the body so the OTP flow is testable without a provider.
    // Anywhere else this is a real misconfiguration — never print the body (it
    // contains the OTP) and never report it as delivered.
    if (isDevEnv(env)) {
      console.log(`[email:log] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
      return "logged";
    }
    console.warn(`[email] RESEND_API_KEY unset — dropping "${msg.subject}" to ${msg.to}`);
    return "failed";
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
//
// When a `templateKey` has an editable Sanity template, the subject and body are
// rendered from it with `vars` substituted for its [placeholders]. The inline
// `email` is the built-in FALLBACK: its `to` is always used (the recipient is
// never in the template), and its subject/text are used verbatim whenever the
// template is missing or Sanity is unreachable. A CMS outage therefore degrades
// to the original hard-coded copy, never to a dropped send.
export async function notify(env: Env, opts: {
  recipient: string;
  eventType: string;
  channel?: "email" | "inbox";
  templateKey?: string;
  vars?: Record<string, string | number | null | undefined>;
  email?: EmailMessage;
}): Promise<void> {
  let email = opts.email;
  if (email && opts.templateKey) {
    const tpl = await loadEmailTemplate(env, opts.templateKey);
    if (tpl) {
      const vars = opts.vars ?? {};
      email = { ...email, subject: applyPlaceholders(tpl.subject, vars), text: applyPlaceholders(tpl.body, vars) };
    }
  }
  let state: "sent" | "failed" | "queued" = "queued";
  if (email) {
    const r = await sendEmail(env, email);
    state = r === "failed" ? "failed" : "sent";
  }
  await env.DB.prepare(
    "INSERT INTO notification (id, recipient_subject, event_type, channel, template_key, sent_at, delivery_state) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)",
  ).bind(uuid(), opts.recipient, opts.eventType, opts.channel ?? "email", opts.templateKey ?? null, state).run();
}
