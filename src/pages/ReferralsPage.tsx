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
//
// There is no placeholder for the missing block. A greyed "you don't have a
// referral discount" card would be a whole heading spent telling someone about
// something that isn't theirs.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect } from "react";
import type { Page } from "../app/ui";
import { useReferrals, hasReferralSection } from "./referralModel";
import { DiscountCard } from "../components/referral/DiscountCard";
import { ReferrerBlock } from "../components/referral/ReferrerBlock";

export function ReferralsPage({ setPage }: { setPage: (p: Page) => void }) {
  const data = useReferrals();
  const { screen, offer, loading } = data;

  // An account with no code, no history and no offer has no section: the rail
  // item is absent and this route sends them somewhere that means something.
  const present = hasReferralSection(data);
  useEffect(() => {
    if (!loading && !present) setPage("account");
  }, [loading, present, setPage]);

  if (loading || !present) {
    return (
      <header className="mb-[22px]">
        <h1 className="text-ink t-hd1">Referrals</h1>
      </header>
    );
  }

  const goQuote = () => { setPage("quote"); window.scrollTo(0, 0); };

  return (
    <>
      <header className="mb-[22px]">
        <h1 className="text-ink t-hd1">Referrals</h1>
      </header>

      {/* The card's copy is built from program figures, which arrive on the
          referrer screen — so the block needs both responses, not just the
          offer. Better to show nothing than a card with a blank percentage. */}
      {offer && screen && (
        <section className="mb-8">
          <h2 className="text-ink mb-3 t-hd3 font-display">Your discount</h2>
          <div className="max-w-2xl">
            <DiscountCard offer={offer} program={screen.program} onStartQuote={goQuote} />
          </div>
        </section>
      )}

      {screen && (
        <section>
          <h2 className="text-ink mb-3 t-hd3 font-display">Refer a mate</h2>
          <div className="max-w-2xl">
            <ReferrerBlock screen={screen} hasOffer={Boolean(offer)} />
          </div>
        </section>
      )}
    </>
  );
}
