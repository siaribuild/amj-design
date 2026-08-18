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
import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Btn, FieldLabel, Input } from "../app/ui";
import { TURNSTILE_SITE_KEY, useTurnstile } from "../lib/turnstile";
import { requestCode, verifyCode, ApiError, type AuthUserDto } from "../data/api";

const RESEND_COOLDOWN_SECONDS = 30;

export function OtpSignIn({ heading, subcopy, layout = "card", stepBadge, onAuthed, onCancel, cancelLabel }: {
  heading: string;
  subcopy: string;
  /** The step numeral beside the heading (§16.3). Present only where the gate is
   *  actually a numbered sequence — a returning customer who never saw a sign-in
   *  step is not on step 2 of anything, so the caller decides. */
  stepBadge?: string;
  /** PRESENTATION ONLY — same flow, same copy, same states.
   *
   *  `card` is /login: a 384px column where a full-bleed field and a full-bleed
   *  button are exactly right. `inline` is the submit gate, where the same markup
   *  sat inside a 600px panel and stretched a six-digit code field to 580px and
   *  the primary button to the full panel width — a control sized four times past
   *  its content, and the widest thing on the screen pointing at the smallest
   *  input on it. Inline constrains the fields to their content and puts the
   *  action back on a row with its secondaries. */
  layout?: "card" | "inline";
  onAuthed: (user: AuthUserDto) => void;
  /** Rendered as a text button when present — the gate's "Back to my quote". */
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const inline = layout === "inline";
  const btnWidth = inline ? "w-full sm:w-auto justify-center" : "w-full justify-center";
  const actionRow = inline ? "flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5" : "space-y-4";
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rateLimited, setRateLimited] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [cooldown, setCooldown] = useState(0);

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
    <div className="space-y-4">
      {/* THE HEADING BELONGS TO THE STEP, not to the component. Rendered outside
          the conditional, the code step kept the email step's framing and never
          said which address the code had gone to — so a typo in the address was
          invisible until the code that could never arrive didn't (§16.3.2). */}
      <div>
        <div className="flex items-baseline gap-2.5">
          {stepBadge && (
            <span aria-hidden="true"
              className="w-6 h-6 flex-shrink-0 grid place-items-center self-start mt-0.5 bg-sage text-white font-data t-data">
              {stepBadge}
            </span>
          )}
          {/* Not a focus target: §16.9 sends focus to the field when a single
              field is the obvious one, which both of these steps are — and both
              fields already autoFocus on mount. */}
          <h2 className="font-semibold text-ink font-display t-hd2">
            {step === "email" ? heading : "Enter your code"}
          </h2>
        </div>
        <p className="text-body mt-1 t-bd-sm">
          {step === "email"
            ? subcopy
            : `We sent a 6-digit code to ${email.trim()}. It expires in 10 minutes.`}
        </p>
      </div>

      {step === "email" ? (
        <>
          <div className={inline ? "sm:max-w-[340px]" : ""}>
            <FieldLabel htmlFor="otp-email">Email</FieldLabel>
            <Input id="otp-email" type="email" value={email} autoFocus autoComplete="email"
              onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="your@email.com" />
          </div>
          {/* Never an empty bordered box where the widget would be: with no site
              key the slot is absent entirely.
              The managed widget is a FIXED 300×65 and does not shrink. At 375px
              the gate panel leaves 287px of content width, so the previous
              `-mx-1 px-1` scroller clipped the Cloudflare mark behind a 13px
              horizontal scrollbar. Cancelling the panel's own gutter on the right
              gives the widget its full 300px on a phone; the scroller stays as the
              floor for anything narrower than ~355px. */}
          {TURNSTILE_SITE_KEY && (
            <div className="overflow-x-auto min-h-[65px] -mx-5 pl-5 sm:mx-0 sm:pl-0"><div ref={turnstileRef} data-testid="turnstile-slot" /></div>
          )}
          {rateLimited && (
            <p role="alert" className="quote-notice--warning border border-warning/35 p-3 t-cap">
              Too many code requests from this connection. Try again in a few minutes — your quote is saved and nothing is lost.
            </p>
          )}
          {/* REALLY disabled, not merely dimmed. `pointer-events: none` leaves the
              control operable by keyboard and announces as enabled to a screen
              reader — which is not what "disabled until a token exists" means. */}
          <div className={actionRow}>
            <Btn variant="sage" size="md" onClick={() => send()}
              disabled={!validEmail || busy || !captchaReady}
              className={btnWidth}>
              {busy ? "Sending…" : "Email me a code"}
            </Btn>
            {onCancel && (
              <button type="button" onClick={onCancel} className="text-body hover:text-ink cursor-pointer t-bd-sm">
                {cancelLabel ?? "Back"}
              </button>
            )}
          </div>
          {TURNSTILE_SITE_KEY && !captchaToken && (
            <p className="text-body t-cap">Complete the check above to continue.</p>
          )}
        </>
      ) : (
        <>
          <div className={inline ? "sm:max-w-[220px]" : ""}>
            <FieldLabel htmlFor="otp-code">6-digit code</FieldLabel>
            {/* ONE input, never six boxes: six boxes break paste and are hostile
                with a screen reader. The data face and the open tracking are what
                give a single input the six-boxes affordance — digits you can count
                at a glance — without any of the cost. */}
            <Input id="otp-code" value={code} autoFocus inputMode="numeric" maxLength={6}
              autoComplete="one-time-code"
              aria-invalid={!!error || undefined}
              aria-describedby={error ? "otp-code-err" : undefined}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); if (error) setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && verify()}
              className="font-data tracking-[0.22em]"
              placeholder="••••••" />
            {error && (
              <p id="otp-code-err" role="alert" className="text-attention-ink flex items-start gap-1.5 mt-1 t-cap">
                <AlertCircle className="w-3 h-3 flex-shrink-0 mt-[3px]" aria-hidden="true" />{error}
              </p>
            )}
          </div>
          {devCode && (
            <p className="text-sage bg-sage-wash border border-sage/20 px-2 py-1.5 t-cap">
              Dev mode — your code is <span className="font-mono font-semibold">{devCode}</span>
            </p>
          )}
          <div className={actionRow}>
            <Btn variant="sage" size="md" onClick={verify}
              disabled={code.length !== 6 || busy}
              className={btnWidth}>
              {busy ? "Verifying…" : "Verify & continue"}
            </Btn>
            <div className="flex flex-wrap gap-4">
              <button type="button" onClick={() => send(true)} disabled={cooldown > 0 || busy}
                className="text-body hover:text-ink cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed t-bd-sm">
                {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
              </button>
              <button type="button" disabled={busy}
                onClick={() => { setStep("email"); setCode(""); setError(""); setDevCode(undefined); }}
                className="text-body hover:text-ink cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed t-bd-sm">
                Use a different email
              </button>
            </div>
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
