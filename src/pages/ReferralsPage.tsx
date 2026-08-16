// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT → REFERRALS — one place for everything referral (UX spec §5).
//
// It serves TWO different people, and often one person in both roles: someone
// who refers, and someone who WAS referred and has a discount. Hence an h2 per
// block — a person with both never has to work out which half they are reading,
// and a person with one simply doesn't see the other heading.
//
//   h1  Referrals
//   h2  Your discount     ← only when an offer exists
//   h2  Refer a mate      ← always
//   [Were you referred?]  ← while they may still be referred
//
// There is no placeholder for the missing block. A greyed "you don't have a
// referral discount" card would spend a whole heading telling someone about
// something that isn't theirs.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import type { Page } from "../app/ui";
import { Btn } from "../app/ui";
import { useReferrals, hasReferralSection } from "./referralModel";
import { money, fmtDate } from "./accountModel";
import { claimReferralCode, leaveProgram } from "../data/referrals";
import { DiscountCard } from "../components/referral/DiscountCard";
import { ReferrerBlock } from "../components/referral/ReferrerBlock";
import { WereYouReferred } from "../components/referral/WereYouReferred";
import { JoinProgramFlow, PayoutDetailsForm } from "../components/referral/JoinProgramFlow";

type Mode = "view" | "join" | "edit" | "leaving";

export function ReferralsPage({ setPage }: { setPage: (p: Page) => void }) {
  const data = useReferrals();
  const { screen, offer, loading, reload } = data;
  const [mode, setMode] = useState<Mode>("view");
  const [leaveError, setLeaveError] = useState<{ amount: number } | null>(null);

  // An account with no code, no history and no offer has no section: the rail
  // item is absent and this route sends them somewhere that means something.
  const present = hasReferralSection(data);
  useEffect(() => {
    if (!loading && !present) setPage("account");
  }, [loading, present, setPage]);

  if (loading || !present) {
    return <header className="mb-[22px]"><h1 className="text-ink t-hd1">Referrals</h1></header>;
  }

  const goQuote = () => { setPage("quote"); window.scrollTo(0, 0); };
  const done = () => { setMode("view"); reload(); };

  const confirmLeave = async () => {
    const result = await leaveProgram();
    // `in` rather than `result.ok`: the refusal is the branch that carries a
    // field, so testing for the field is what narrows reliably.
    if ("amount" in result) setLeaveError({ amount: result.amount });
    else done();
  };

  return (
    <>
      <header className="mb-[22px]"><h1 className="text-ink t-hd1">Referrals</h1></header>

      {/* The card's copy is built from program figures, which arrive on the
          referrer screen — so the block needs both responses, not just the
          offer. Better to show nothing than a card with a blank percentage. */}
      {offer && screen && (
        <section className="mb-8">
          <h2 className="text-ink mb-3 t-hd3 font-display">Your discount</h2>
          <div className="max-w-2xl"><DiscountCard offer={offer} program={screen.program} onStartQuote={goQuote} /></div>
        </section>
      )}

      {screen && (
        <section>
          <h2 className="text-ink mb-3 t-hd3 font-display">Refer a mate</h2>
          <div className="max-w-3xl flex flex-col gap-4">
            {mode === "join" && (
              <JoinProgramFlow program={screen.program} onJoined={done} onCancel={() => setMode("view")} />
            )}

            {mode === "edit" && (
              <div className="card p-5">
                <PayoutDetailsForm program={screen.program} submitLabel="Save details" onDone={done} />
                <button onClick={() => setMode("view")} className="mt-3 text-body hover:text-ink cursor-pointer t-cap">Cancel</button>
              </div>
            )}

            {/* In place, never a modal — and the Leave button is not disabled by
                the refusal. A disabled button explains nothing, and the person
                most likely to hit this is someone leaving BECAUSE their details
                are wrong, so the copy points them at Edit instead. */}
            {mode === "leaving" && (
              <div className={`quote-notice--${leaveError ? "warning" : "info"} px-4 py-3 flex flex-col gap-2`}>
                {leaveError ? (
                  <>
                    <p className="text-ink font-semibold t-bd-sm">We can't do that just yet.</p>
                    <p className="text-body t-bd-sm">
                      <b className="text-ink">{money(leaveError.amount)}</b> is confirmed and hasn't gone out. We need
                      this account to send it. You can leave once it's paid, and you can change your bank details in
                      the meantime if they're wrong.
                    </p>
                    <div className="flex gap-2">
                      <Btn variant="outline" size="sm" onClick={() => { setLeaveError(null); setMode("edit"); }}>Edit details</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => { setLeaveError(null); setMode("view"); }}>Close</Btn>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-ink font-semibold t-bd-sm">Leave the referral program?</p>
                    <p className="text-body t-bd-sm">
                      We'll remove your bank details and your code stops working for new referrals. The mates you've
                      already referred keep their discount, and everything you've already been paid stays in your
                      history. You can rejoin any time and you'll get the same code back.
                    </p>
                    <div className="flex gap-2">
                      <Btn variant="outline" size="sm" onClick={confirmLeave}>Leave the program</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => setMode("view")}>Cancel</Btn>
                    </div>
                  </>
                )}
              </div>
            )}

            {mode === "view" && (
              <ReferrerBlock
                screen={screen} hasOffer={Boolean(offer)}
                onJoin={() => setMode("join")}
                onEdit={() => setMode("edit")}
                onLeave={() => { setLeaveError(null); setMode("leaving"); }}
              />
            )}

            {/* The REFERRED side. canEnterCode means "may still be referred" — it
                closes on having been referred or having ordered, never on the
                payout gate, so this shows for members and non-members alike. */}
            {screen.canEnterCode && mode === "view" && (
              <WereYouReferred
                program={screen.program}
                expiresAt={offer?.expiresAt}
                onApply={async (code) => {
                  const failed = await claimReferralCode(code);
                  if (!failed) reload();
                  return failed;
                }}
              />
            )}
          </div>
        </section>
      )}
    </>
  );
}
