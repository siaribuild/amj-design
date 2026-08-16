// Joining the referral program (UX spec §3.3.1) — and the details form that is
// its second half, reused on its own for Edit details.
//
// JOINING IS ONE ACT. Accept the conditions, say where the money goes, and you
// are a member with a code. There is no half-joined state in the model, so there
// is no screen for one: part 1 saves nothing, and the button that leaves it says
// "Continue" rather than "Join" because a button must not claim something
// happened when it hasn't.
//
// The two facts that must never be read as one condition live on different
// steps: "any account can join, you don't need to have ordered" is part 1, and
// "we need an account to pay into" is part 2. Adjacent, they read as "you have to
// be a customer to refer" — which is the ACL s 49 shape this program is built to
// stay outside of.
import { useState } from "react";
import type { ReferralProgramPublic, ReferrerScreen } from "../../data/referrals";
import { savePayoutDetails } from "../../data/referrals";
import { updateProfile } from "../../data/api";
import { Input, FieldLabel, Btn, SAGE } from "../../app/ui";
import { pct, moneyRound, months, days } from "./format";

const digits = (v: string) => v.replace(/\D/g, "");

/** Validation runs on BLUR, never on keystroke: telling someone their ABN is
 *  wrong while they are still typing the third digit is noise, not help. */
const ERRORS = {
  abn: "That's not a valid ABN. It's 11 digits — check the number on your invoices.",
  bsb: "A BSB is 6 digits, like 063-000.",
  accountNumber: "Account numbers are between 5 and 9 digits.",
  accountName: "We need the name on the account, exactly as your bank has it.",
};

type Fields = { abn: string; bsb: string; accountNumber: string; accountName: string };
type Errs = Partial<Record<keyof Fields, string>>;

function validate(f: Fields): Errs {
  const e: Errs = {};
  // Length only, client-side. The ATO checksum is the server's answer — one
  // implementation of a compliance rule, not two that can disagree.
  if (digits(f.abn).length !== 11) e.abn = ERRORS.abn;
  if (digits(f.bsb).length !== 6) e.bsb = ERRORS.bsb;
  const acct = digits(f.accountNumber).length;
  if (acct < 5 || acct > 9) e.accountNumber = ERRORS.accountNumber;
  if (!f.accountName.trim()) e.accountName = ERRORS.accountName;
  return e;
}

export function PayoutDetailsForm({ program, submitLabel, onDone, initial }: {
  program: ReferralProgramPublic;
  submitLabel: string;
  onDone: (gate: ReferrerScreen["referrerGate"]) => void;
  initial?: Partial<Fields>;
}) {
  const [f, setF] = useState<Fields>({
    abn: initial?.abn ?? "", bsb: initial?.bsb ?? "",
    accountNumber: initial?.accountNumber ?? "", accountName: initial?.accountName ?? "",
  });
  const [errs, setErrs] = useState<Errs>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    setErrs((p) => ({ ...p, [k]: undefined }));   // clear on change
    setServerError(null);
  };
  const blur = (k: keyof Fields) => () => setErrs((p) => ({ ...p, [k]: validate(f)[k] }));

  const submit = async () => {
    const found = validate(f);
    setErrs(found);
    if (Object.values(found).some(Boolean) || busy) return;
    setBusy(true);
    setServerError(null);
    try {
      // Two writes, one commit from the reader's side. The ABN is a profile
      // field, and the gate needs all four — so a partial write simply leaves
      // the gate shut rather than producing a half-member.
      await updateProfile({ abn: digits(f.abn) });
      const saved = await savePayoutDetails({
        bsb: digits(f.bsb), accountNumber: digits(f.accountNumber), accountName: f.accountName.trim(),
      });
      if (saved.error) {
        setServerError(saved.error === "invalid_bsb" ? ERRORS.bsb
          : saved.error === "invalid_account_number" ? ERRORS.accountNumber
            : saved.error === "invalid_account_name" ? ERRORS.accountName
              : "We couldn't save those details. Check them and try again.");
        return;
      }
      if (!saved.referrerGate.complete && saved.referrerGate.missing.includes("abn")) {
        setErrs((p) => ({ ...p, abn: ERRORS.abn }));
        return;
      }
      onDone(saved.referrerGate);
    } catch {
      setServerError("We couldn't save those details. Check them and try again.");
    } finally {
      setBusy(false);
    }
  };

  const field = (k: keyof Fields, label: string, extra?: { numeric?: boolean; span?: boolean; placeholder?: string }) => (
    <div className={extra?.span ? "sm:col-span-2" : undefined}>
      <FieldLabel htmlFor={`payout-${k}`}>{label}</FieldLabel>
      <Input id={`payout-${k}`} value={f[k]} onChange={set(k)} onBlur={blur(k)}
        inputMode={extra?.numeric ? "numeric" : "text"} autoComplete="off" placeholder={extra?.placeholder}
        aria-invalid={errs[k] ? true : undefined} aria-describedby={errs[k] ? `payout-${k}-err` : undefined}
        className={errs[k] ? "field err" : ""} />
      {errs[k] && <p id={`payout-${k}-err`} className="mt-1 t-cap" style={{ color: "var(--destructive)" }}>{errs[k]}</p>}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body t-bd">
        Add your ABN and bank details and your referral code appears right here. It's the account we pay your{" "}
        <b className="text-ink">{pct(program.ratePercent)}</b> into — nothing else uses it, and the tradies you
        refer never see it.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {field("abn", "ABN", { numeric: true, span: true, placeholder: "51 824 753 556" })}
        {field("bsb", "BSB", { numeric: true, placeholder: "063-000" })}
        {field("accountNumber", "Account number", { numeric: true })}
        {field("accountName", "Account name", { span: true })}
      </div>
      {serverError && <p role="alert" className="t-cap" style={{ color: "var(--destructive)" }}>{serverError}</p>}
      <Btn variant="sage" size="md" onClick={submit} disabled={busy}>{busy ? "Saving…" : submitLabel}</Btn>
      <div className="pt-3 border-t border-black/[0.07] flex flex-col gap-1 text-body t-cap">
        <span>· This is what joins you and issues your code — one button.</span>
        <span>· We only ever use these to pay you. Nobody else sees them.</span>
        <span>· You can change or remove them any time.</span>
      </div>
    </div>
  );
}

export function JoinProgramFlow({ program, onJoined, onCancel, onReadTerms }: {
  program: ReferralProgramPublic;
  onJoined: () => void;
  onCancel?: () => void;
  onReadTerms?: () => void;
}) {
  const [part, setPart] = useState<1 | 2>(1);
  const [accepted, setAccepted] = useState(false);

  const Progress = () => (
    <div className="flex gap-1 w-24" aria-hidden="true">
      <span className="h-[3px] flex-1" style={{ background: SAGE }} />
      <span className="h-[3px] flex-1" style={{ background: part === 2 ? SAGE : "var(--shade)" }} />
    </div>
  );

  return (
    <div className="card p-8" style={{ borderLeft: `3px solid ${SAGE}` }}>
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_.9fr] gap-8">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-body font-data t-label">{part === 1 ? "The conditions" : "Where the money goes"}</span>
            <Progress />
          </div>

          {part === 1 ? (
            <>
              <h3 className="text-ink t-hd1 font-display">Join the referral program</h3>
              <p className="text-body t-bd">
                Any account can join. You don't need to have ordered anything, and joining costs nothing.
              </p>
              <div className="p-4 flex flex-col gap-2" style={{ background: "var(--recessive)" }}>
                <span className="text-body font-data t-label">What you're agreeing to</span>
                <span className="text-body t-bd-sm">
                  · Your mate gets <b className="text-ink">{pct(program.discountPercent)}</b> off their first order;
                  you get <b className="text-ink">{pct(program.ratePercent)}</b> of it once they've paid in full.
                </span>
                <span className="text-body t-bd-sm">
                  · Their order has to be at least <b className="text-ink">{moneyRound(program.minOrderAmount)}</b> ex
                  GST before delivery, and placed within <b className="text-ink">{months(program.windowMonths)}</b> of
                  them using your code.
                </span>
                <span className="text-body t-bd-sm">
                  · The <b className="text-ink">{pct(program.ratePercent)}</b> is worked out on the goods, excluding
                  GST and delivery — not the invoice total.
                </span>
                <span className="text-body t-bd-sm">
                  · We pay by bank transfer within <b className="text-ink">{days(program.payoutTimeframeDays)}</b>, so
                  you'll need to give us an account to pay into.
                </span>
                <span className="text-body t-bd-sm">
                  · You get paid for the mates you refer — not for anyone they go on to refer.
                </span>
                {program.capAmount != null && (
                  <span className="text-body t-bd-sm">
                    · The most you can earn on one referral is <b className="text-ink">{moneyRound(program.capAmount)}</b>.
                  </span>
                )}
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer text-body t-bd-sm">
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1" />
                <span>
                  I've read and accept the{" "}
                  <button type="button" onClick={onReadTerms} className="text-sage hover:text-sage-deep cursor-pointer">
                    referral program terms
                  </button>.
                </span>
              </label>
              {/* Continue, not Join: part 2 has not happened yet. */}
              <Btn variant="sage" size="md" onClick={() => setPart(2)} disabled={!accepted}>Continue →</Btn>
              <p className="text-body t-cap">
                Nothing is saved yet. You can leave any time, and joining never asks you to buy anything.
              </p>
              {onCancel && (
                <button onClick={onCancel} className="self-start text-body hover:text-ink cursor-pointer t-cap">Cancel</button>
              )}
            </>
          ) : (
            <>
              <p className="text-body t-cap">
                · conditions accepted{" "}
                <button onClick={() => setPart(1)} className="text-sage hover:text-sage-deep cursor-pointer">back</button>
              </p>
              <h3 className="text-ink t-hd1 font-display">Where do we send the money?</h3>
              <PayoutDetailsForm program={program} submitLabel="Join the program" onDone={onJoined} />
            </>
          )}
        </div>

        <aside className="p-5 flex flex-col gap-3 self-start" style={{ background: "var(--recessive)" }}>
          {part === 1 ? (
            <>
              <span className="text-body font-data t-label">What happens next</span>
              <span className="text-body t-bd-sm">1 · Accept the conditions.</span>
              <span className="text-body t-bd-sm">2 · Tell us where to send the money.</span>
              <p className="text-body t-bd-sm">Then you're in, and your code is on this page.</p>
              <p className="text-body t-cap">One button at the end does the lot. Stop before it and nothing has happened.</p>
            </>
          ) : (
            <>
              <span className="text-body font-data t-label">What this unlocks</span>
              <div className="border border-dashed border-black/20 p-4 flex items-baseline gap-3">
                {/* A greyed EXAMPLE, never a real or reserved code. */}
                <span className="font-data t-hd2" style={{ color: "var(--quietest)" }}>ABC-123</span>
                <span className="text-body t-cap">your code</span>
              </div>
              <p className="text-body t-bd-sm">
                Your mate gets <b className="text-ink">{pct(program.discountPercent)}</b> off their first order;
                you get <b className="text-ink">{pct(program.ratePercent)}</b> of it once they've paid in full.
              </p>
              {onReadTerms && (
                <button onClick={onReadTerms} className="self-start text-sage hover:text-sage-deep cursor-pointer t-cap">
                  Read the full rules and terms →
                </button>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
