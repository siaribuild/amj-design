// "Were you referred?" — manual code entry (UX spec §5.6).
//
// This is the REFERRED side, and it is never gated by the payout details that
// gate becoming a referrer: being referred asks nothing of you. It renders in
// every state of the section, including for someone who is not a member, which
// is why it lives on its own rather than inside the referrer block.
//
// Half of these introductions happen on a job site — one tradie reads the code
// out, the other types it in later — so a link-only program would silently lose
// them. That is the whole reason this field exists.
import { useState } from "react";
import type { ReferralProgramPublic } from "../../data/referrals";
import { Input, Btn, FieldLabel } from "../../app/ui";
import { pct } from "./format";
import { fmtDate } from "../../pages/accountModel";

/** The API's error codes, in the customer's words.
 *
 *  `invalid_code` and `not_eligible` deliberately share a message. One means the
 *  code is unknown or its owner has left the program; the other means the two
 *  accounts share an ABN. Naming either would disclose a third party's affairs —
 *  that a particular tradie has left, or what their ABN is — to whoever typed the
 *  code. The person who legitimately mistyped is served just as well by "check it
 *  with the tradie who gave it to you". */
const MESSAGE: Record<string, string> = {
  invalid_code: "That code isn't valid. Check it with the tradie who gave it to you.",
  not_eligible: "That code isn't valid. Check it with the tradie who gave it to you.",
  own_code: "That's your own code.",
  already_referred: "Your account already has a referral — it's one per account.",
  has_order: "A code can only be added before your first order.",
  program_off: "We're not taking new referrals right now.",
};

export function WereYouReferred({ program, onApply, expiresAt }: {
  program: ReferralProgramPublic;
  /** Resolves to an API error code, or null when the code was accepted. */
  onApply: (code: string) => Promise<string | null>;
  /** When the claim succeeded, so the confirmation can name the deadline. */
  expiresAt?: string | null;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const discount = pct(program.discountPercent);

  const submit = async () => {
    if (busy || code.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const failed = await onApply(code.trim().toUpperCase());
      if (failed) setError(MESSAGE[failed] ?? MESSAGE.invalid_code);
      else setDone(true);
    } catch {
      setError(MESSAGE.invalid_code);
    } finally {
      setBusy(false);
    }
  };

  // No link out. The discount card is now at the top of this same page, so the
  // confirmation points at it and stops rather than telling the story twice.
  if (done) {
    return (
      <div className="quote-notice--info px-4 py-3 flex flex-col gap-1">
        <p className="text-ink font-semibold t-bd-sm">Done — {discount} is off your first order.</p>
        <p className="text-body t-bd-sm">
          It's already in every price you see{expiresAt ? <>, and it's yours until <b className="text-ink">{fmtDate(expiresAt)}</b></> : null}.
          It's up the top of this page whenever you want to check it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-w-md">
      <h3 className="text-ink t-hd3 font-display">Were you referred?</h3>
      <p className="text-body t-bd-sm">
        If a tradie gave you a code, put it in before your first order and <b className="text-ink">{discount}</b> comes off it.
      </p>
      <FieldLabel htmlFor="referral-code">Referral code</FieldLabel>
      <div className="flex flex-wrap gap-2 items-start">
        <Input
          id="referral-code"
          value={code}
          // Uppercased as they type: the alphabet is uppercase, and correcting it
          // silently is kinder than rejecting a code that was read out correctly.
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="ABC-123"
          maxLength={7}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "referral-code-error" : undefined}
          className={`font-data max-w-[190px] ${error ? "field err" : ""}`}
        />
        <Btn variant="outline" size="md" onClick={submit} disabled={busy}>
          {busy ? "Checking…" : "Apply code"}
        </Btn>
      </div>
      {error && (
        <p id="referral-code-error" role="alert" className="t-cap" style={{ color: "var(--destructive)" }}>{error}</p>
      )}
    </div>
  );
}
