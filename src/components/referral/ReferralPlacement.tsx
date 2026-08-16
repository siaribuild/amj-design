// The marketing placements (UX spec §4) — home, trade-account, and the prompt at
// the foot of a delivered order.
//
// ⚠️ TWO PROPERTIES APPLY TO ALL OF THEM AND ARE EASY TO LOSE ONE AT A TIME.
//
// 1. NOTHING RENDERS WHEN THE PROGRAM IS OFF. Silently absent, all of them. The
//    landing page carries the paused banner and explains itself; a placement
//    still pitching a rate while nobody can join is an offer advertised and not
//    honoured, which is the ACL s 18 / s 32(1) exposure the banner exists to
//    close. Off is checked once, here, so no caller has to remember.
//
// 2. THE MEMBER VARIANT CARRIES NO RATE. A rate beside an earned figure is
//    invertible — "1%" next to "$45" tells a referrer their mate spent $4,500,
//    which is that third party's business. The rate may appear only where no
//    earned amount is shown, which is why the non-member invitation has it and
//    the member card does not.
//
// ⚠️ AND ON THE LOGGED-OUT PLACEMENTS, s 49 BITES HARDEST: these are read by
// people who are not customers yet. The referrer's reward is never coupled to
// the referrer's own buying, and "no purchase needed" and "you'll need payout
// details" stay two separate facts — merged, they read as "you have to be a
// customer to refer", which is the referral-selling shape exactly.
import { useEffect, useState } from "react";
import { type Page, SAGE, Btn, SLabel } from "../../app/ui";
import { money } from "../../pages/accountModel";
import {
  getReferralProgram, getReferrerScreen,
  type ReferralProgramPublic, type ReferrerScreen,
} from "../../data/referrals";
import { pct, moneyRound, days } from "./format";

/** Program + (when signed in) the reader's own membership, or nulls. */
function useReferralPitch(signedIn: boolean) {
  const [program, setProgram] = useState<ReferralProgramPublic | null>(null);
  const [screen, setScreen] = useState<ReferrerScreen | null>(null);
  useEffect(() => {
    let live = true;
    Promise.allSettled([getReferralProgram(), signedIn ? getReferrerScreen() : Promise.resolve(null)])
      .then(([p, s]) => {
        if (!live) return;
        setProgram(p.status === "fulfilled" ? p.value : null);
        setScreen(s.status === "fulfilled" ? s.value : null);
      });
    return () => { live = false; };
  }, [signedIn]);
  return { program, screen };
}

function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <Btn variant="sage" size="sm" onClick={() => {
      navigator.clipboard?.writeText(url).then(() => { setDone(true); setTimeout(() => setDone(false), 2000); }, () => {});
    }}>{done ? "Copied" : "Copy link"}</Btn>
  );
}

export function ReferralPlacement({ variant, signedIn, setPage }: {
  variant: "home" | "trade";
  signedIn: boolean;
  setPage: (p: Page) => void;
}) {
  const { program, screen } = useReferralPitch(signedIn);
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  if (!program || !program.active) return null;

  const discount = pct(program.discountPercent);
  const rate = pct(program.ratePercent);
  const payout = days(program.payoutTimeframeDays);
  const member = Boolean(screen?.code);

  // The member card: code, what they've done, what they've been paid — and no
  // rate anywhere near the earned figure.
  if (variant === "home" && member && screen) {
    return (
      <section className="ground-paper border-t border-black/8 section-pad">
        <div className="max-w-6xl mx-auto px-6">
          <SLabel>Your referral code</SLabel>
          <div className="card p-5 mt-3 flex flex-wrap items-center gap-x-8 gap-y-4" style={{ borderLeft: `3px solid ${SAGE}` }}>
            <span className="text-ink font-data t-hd2" style={{ letterSpacing: ".08em" }}>{screen.code}</span>
            <CopyLink url={screen.shareUrl ?? ""} />
            <div>
              <span className="text-body block font-data t-label">Referred</span>
              <span className="text-ink font-data t-data">
                {screen.referrals.length === 1 ? "1 mate" : `${screen.referrals.length} mates`}
              </span>
            </div>
            <div>
              <span className="text-body block font-data t-label">Earned</span>
              <span className="text-ink font-data t-data">{money(screen.earnings.paid)}</span>
            </div>
            <button onClick={() => go("referrals")} className="text-sage hover:text-sage-deep cursor-pointer t-bd-sm">Referrals →</button>
          </div>
          <p className="text-body mt-3 t-cap">Your mate gets {discount} off their first order.</p>
        </div>
      </section>
    );
  }

  const heading = variant === "trade" ? "Bring another trade account with you." : "Know another tradie?";

  return (
    <section className="ground-paper border-t border-black/8 section-pad">
      <div className="max-w-6xl mx-auto px-6">
        <SLabel>Refer a mate</SLabel>
        <div className="split-row is-center mt-3">
          <div className="split-prose">
            <h2 className={`text-ink font-display ${signedIn ? "t-hd1" : "t-ds2"}`}>{heading}</h2>
            <p className="text-body mt-3 t-bd">
              {variant === "trade" ? (
                <>Your mate gets <b className="text-ink">{discount} off their first order</b>. You get{" "}
                  <b className="text-ink">{rate} of it</b> by bank transfer, within {payout} of them paying in full.</>
              ) : (
                <>They get <b className="text-ink">{discount} off their first order</b>. You get{" "}
                  <b className="text-ink">{rate} of it</b>, into your bank account within {payout} of them paying.</>
              )}
            </p>
            {/* s 49: never coupled to the referrer's own purchase, and kept as
                its own fact rather than folded in with the payout details. */}
            <p className="text-body mt-2 t-bd-sm">
              {variant === "trade"
                ? <>Any registered account can join — ordering isn't part of it. Their first order needs to be at least{" "}
                    <b className="text-ink">{moneyRound(program.minOrderAmount)}</b> ex GST, before delivery.</>
                : signedIn
                  ? "Any account can join — you don't need to have ordered."
                  : "Any account can refer — you don't need to have ordered."}
            </p>
          </div>
          <Btn variant="sage" size={signedIn && variant === "home" ? "md" : "lg"}
            onClick={() => go("refer")}>
            {variant === "trade" ? "See how it works →" : signedIn ? "Join the program →" : "How it works →"}
          </Btn>
        </div>
      </div>
    </section>
  );
}

/** §4.4 — the foot of a DELIVERED order, never an in-progress one. The moment
 *  a tradie is happiest with the goods is the moment worth asking, and asking
 *  mid-production is asking before they know. No earnings figure either way. */
export function ReferralOrderPrompt({ stage, signedIn, setPage }: {
  stage: string;
  signedIn: boolean;
  setPage: (p: Page) => void;
}) {
  const { program, screen } = useReferralPitch(signedIn);
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  if (stage !== "delivered" && stage !== "after_sales") return null;
  if (!program || !program.active) return null;

  return (
    <div className="card p-5 split-row is-center" style={{ borderLeft: `3px solid ${SAGE}` }}>
      <div className="split-prose">
        <h3 className="text-ink t-hd3 font-display">Happy with these? Refer a mate.</h3>
        <p className="text-body mt-2 t-bd-sm">
          They get <b className="text-ink">{pct(program.discountPercent)} off their first order</b>. You get{" "}
          <b className="text-ink">{pct(program.ratePercent)} of it</b>, within {days(program.payoutTimeframeDays)} of
          them paying in full.
        </p>
      </div>
      {screen?.code ? (
        <div className="flex items-center gap-3">
          <span className="text-ink font-data t-bd-lg" style={{ letterSpacing: ".08em" }}>{screen.code}</span>
          <CopyLink url={screen.shareUrl ?? ""} />
        </div>
      ) : (
        <Btn variant="sage" size="sm" onClick={() => go("refer")}>Join the program →</Btn>
      )}
    </div>
  );
}
