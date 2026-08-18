// ═══════════════════════════════════════════════════════════════════════════════
// OTP SIGN-IN / CREATE — the email→code flow, in one component.
//
// Extracted from LoginPage so the /login screen and the submission gate run the
// SAME flow rather than two that drift. The OTP mechanics themselves are
// deliberately untouched (D1): same endpoints, same rate limits, same neutral
// responses.
//
// What changed is the honesty. This surface used to say "Sign in or register"
// beside copy claiming guest quotes need no account, while quietly creating one
// and naming the person after their email address. It now says what it does:
// entering an email signs you in OR creates your account.
//
// ⚠️ NO MESSAGE HERE MAY DIFFER BETWEEN AN ADDRESS THAT HAS AN ACCOUNT AND ONE
// THAT DOES NOT (AB-5). There is no "we don't recognise that email", ever.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import { Btn, FieldLabel, Input } from "../app/ui";
import { TURNSTILE_SITE_KEY, useTurnstile } from "../lib/turnstile";
import { requestCode, verifyCode, ApiError, type AuthUserDto } from "../data/api";

const RESEND_COOLDOWN_SECONDS = 30;

export function OtpSignIn({ heading, subcopy, onAuthed, onCancel, cancelLabel }: {
  heading: string;
  subcopy: string;
  onAuthed: (user: AuthUserDto) => void;
  /** Rendered as a text button when present — the gate's "Back to my quote". */
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rateLimited, setRateLimited] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLDivElement>(null);

  // Turnstile, present only where a site key is configured. The Worker demands a
  // token on /api/auth/challenge whenever TURNSTILE_SECRET is set: the endpoint
  // is unauthenticated and emails whatever address it is given, so the caller has
  // to be vouched for. Without a key this is inert and the flow is unchanged.
  const [captchaToken, setCaptchaToken] = useState("");
  const turnstileRef = useTurnstile(setCaptchaToken, step);
  const captchaReady = !TURNSTILE_SITE_KEY || !!captchaToken;

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (resend = false) => {
    if (!validEmail || busy || !captchaReady) return;
    if (resend && cooldown > 0) return;
    setBusy(true); setError(""); setRateLimited(false);
    try {
      const r = await requestCode(email.trim(), captchaToken || undefined);
      setDevCode(r.devCode);       // shown only in dev (no email provider yet)
      setStep("code");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      // 429 is about the SOURCE, never about whether the address exists, so
      // saying so plainly leaks nothing the neutral response was protecting.
      if (e instanceof ApiError && e.status === 429) setRateLimited(true);
      else setError("Couldn't send a code. Try again.");
    } finally { setBusy(false); }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code.trim()) || busy) return;
    setBusy(true); setError("");
    try {
      const r = await verifyCode(email.trim(), code.trim());
      if (r.user) onAuthed(r.user);
      else setError("Something went wrong verifying that code. Please try again.");
    } catch (e) {
      setError(e instanceof ApiError && e.code === "invalid_code"
        ? "That code didn't match. Check it and try again, or resend a new one."
        : "Something went wrong verifying that code. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4" ref={codeRef}>
      <div>
        <h2 tabIndex={-1} className="font-semibold text-ink font-display t-hd2">{heading}</h2>
        <p className="text-body mt-1 t-bd-sm">{subcopy}</p>
      </div>

      {step === "email" ? (
        <>
          <div>
            <FieldLabel htmlFor="otp-email">Email</FieldLabel>
            <Input id="otp-email" type="email" value={email} autoFocus autoComplete="email"
              onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="your@email.com" />
          </div>
          {/* Never an empty bordered box where the widget would be: with no site
              key the slot is absent entirely. The widget itself is a fixed 300px,
              which overflows the panel padding at 375px — hence the scroller. */}
          {TURNSTILE_SITE_KEY && (
            <div className="overflow-x-auto -mx-1 px-1"><div ref={turnstileRef} data-testid="turnstile-slot" /></div>
          )}
          {rateLimited && (
            <p role="alert" className="quote-notice--warning border border-line p-3 text-body t-cap">
              Too many code requests from this connection. Try again in a few minutes — your quote is saved and nothing is lost.
            </p>
          )}
          {/* REALLY disabled, not merely dimmed. `pointer-events: none` leaves the
              control operable by keyboard and announces as enabled to a screen
              reader — which is not what "disabled until a token exists" means. */}
          <Btn variant="sage" size="md" onClick={() => send()}
            disabled={!validEmail || busy || !captchaReady}
            className="w-full justify-center">
            {busy ? "Sending…" : "Email me a code"}
          </Btn>
          {TURNSTILE_SITE_KEY && !captchaToken && (
            <p className="text-body t-cap">Complete the check above to continue.</p>
          )}
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-body hover:text-ink cursor-pointer t-bd-sm">
              {cancelLabel ?? "Back"}
            </button>
          )}
        </>
      ) : (
        <>
          <div>
            <FieldLabel htmlFor="otp-code">6-digit code</FieldLabel>
            {/* ONE input, never six boxes: six boxes break paste and are hostile
                with a screen reader. */}
            <Input id="otp-code" value={code} autoFocus inputMode="numeric" maxLength={6}
              autoComplete="one-time-code"
              aria-invalid={!!error || undefined}
              aria-describedby={error ? "otp-code-err" : undefined}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); if (error) setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && verify()}
              placeholder="••••••" />
            {error && <p id="otp-code-err" role="alert" className="text-red-700 mt-1 t-cap">{error}</p>}
          </div>
          {devCode && (
            <p className="text-sage bg-sage-wash border border-sage/20 px-2 py-1.5 t-cap">
              Dev mode — your code is <span className="font-mono font-semibold">{devCode}</span>
            </p>
          )}
          <Btn variant="sage" size="md" onClick={verify}
            disabled={code.length !== 6 || busy}
            className="w-full justify-center">
            {busy ? "Verifying…" : "Verify & continue"}
          </Btn>
          <div className="flex flex-wrap gap-4">
            <button type="button" onClick={() => send(true)} disabled={cooldown > 0 || busy}
              className="text-body hover:text-ink cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed t-bd-sm">
              {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
            </button>
            <button type="button" onClick={() => { setStep("email"); setCode(""); setError(""); setDevCode(undefined); }}
              className="text-body hover:text-ink cursor-pointer t-bd-sm">
              Use a different email
            </button>
          </div>
          <p className="text-body t-cap">
            Your quote is safe — nothing is submitted until you press Submit for technical review.
          </p>
        </>
      )}
    </div>
  );
}

/** The sub-copy each surface uses. The gate gives a reason (a stranger is being
 *  asked for an email mid-flow); /login is short (they came here to sign in). */
export const OTP_COPY = {
  gate: {
    heading: "Sign in or create your account",
    subcopy: "A person reviews every quote, so we need to know whose it is. Enter your email and we'll send a 6-digit code — no password. If you don't have an account yet, this creates one.",
  },
  login: {
    heading: "Sign in or create account",
    subcopy: "We'll email you a one-time code — no password needed. If you're new, this creates your account.",
  },
} as const;
