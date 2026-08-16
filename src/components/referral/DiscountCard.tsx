// The referred tradie's discount, from their side (UX spec §6).
//
// ⚠️ ONE PERCENTAGE, EVER. This card shows the referral figure and nothing else.
// Every registered account already carries a standing discount the business has
// decided never to show, and a combined total would disclose it by subtraction
// exactly as effectively as printing it. There is no second percentage here, no
// dollar saving, and no reference to the account discount — and the API shape
// gives this component nothing it could build one from.
//
// PROHIBITED VOCABULARY, in and near this card: apply · redeem · claim · use at
// checkout · voucher · coupon · credit · balance · wallet · stored · load ·
// activate. The discount is not an instrument the customer holds and spends; it
// is already inside every price they are being shown. Redemption language would
// also re-open the gift-card analysis the design deliberately closed.
//
// GST: nothing here moves with the ex/inc preference, because a percentage is
// unit-free. That is arithmetic, not a carve-out — do not implement it as one.
import type { ReferralOffer, ReferralProgramPublic } from "../../data/referrals";
// fmtDate is the account area's date voice (`14 MAR 2027`), shared rather than
// re-implemented — it also normalises the date strings this API returns.
import { TONE, fmtDate } from "../../pages/accountModel";
import { SAGE, Btn } from "../../app/ui";
import { pct, months, isExpiring, remaining, daysUntil } from "./format";

function Chip({ tone = "neutral", children }: { tone?: "ready" | "neutral" | "attention"; children: React.ReactNode }) {
  return <span className={`quote-chip quote-chip--${tone}`}>{children}</span>;
}

export function DiscountCard({ offer, program, onStartQuote, hasDraft, onOpenOrder }: {
  offer: ReferralOffer;
  program: ReferralProgramPublic;
  /** "Finish your quote" when a draft exists, "Start a quote" when none does. */
  hasDraft?: boolean;
  onStartQuote?: () => void;
  onOpenOrder?: () => void;
}) {
  const discount = pct(offer.referralPercent);
  const card = (accent: string, children: React.ReactNode) => (
    <div className="card p-5 flex flex-col gap-3" style={{ borderLeft: `3px solid ${accent}` }}>{children}</div>
  );

  if (offer.state === "used") {
    return card(TONE.mute.bd, (
      <>
        <h3 className="text-ink t-hd2 font-display">
          Your {discount} referral discount was applied to order {offer.usedOrderNo}
        </h3>
        <p className="text-body t-bd">
          On <b className="text-ink">{fmtDate(offer.usedAt)}</b>. That was the one-off — nice work.
        </p>
        {onOpenOrder && (
          <button onClick={onOpenOrder} className="self-start text-sage hover:text-sage-deep cursor-pointer t-bd-sm">
            See that order →
          </button>
        )}
      </>
    ));
  }

  if (offer.state === "expired") {
    // No apology, no "sorry you missed out", no offer to reinstate.
    return card(TONE.mute.bd, (
      <>
        <h3 className="text-ink t-hd2 font-display">
          Your {discount} referral discount expired on {fmtDate(offer.expiredAt)}
        </h3>
        <p className="text-body t-bd">
          It applied to a first order placed within <b className="text-ink">{months(program.windowMonths)}</b> of
          signing up with {offer.referrerName}'s code. Your prices are unchanged from here.
        </p>
      </>
    ));
  }

  const cta = (
    <Btn variant="sage" size="md" onClick={onStartQuote}>
      {hasDraft ? "Finish your quote →" : "Start a quote →"}
    </Btn>
  );

  // Inside 30 days the card changes its tone and leads with the deadline — the
  // same trigger as the reminder email, so the screen and the inbox agree.
  if (isExpiring(offer.expiresAt)) {
    return card(TONE.attn.bd, (
      <>
        <h3 className="text-ink t-hd1 font-display">
          {discount} off your first order — {daysUntil(offer.expiresAt)} days left
        </h3>
        <p className="text-body t-bd">
          It runs out on <b className="text-ink">{fmtDate(offer.expiresAt)}</b>, and it's a one-off. It's already in
          every price you see; place your first order before then and it's yours.
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip tone="attention">Expires {fmtDate(offer.expiresAt)}</Chip>
          <Chip>First order only</Chip>
        </div>
        {cta}
      </>
    ));
  }

  return card(SAGE, (
    <>
      <h3 className="text-ink t-hd1 font-display">{discount} off your first order</h3>
      <p className="text-body t-bd">
        It's already in every price you see — there's nothing to apply. This is a one-off from{" "}
        <b className="text-ink">{offer.referrerName}</b>, and it's yours until{" "}
        <b className="text-ink">{fmtDate(offer.expiresAt)}</b>.
      </p>
      <div className="flex flex-wrap gap-2">
        <Chip tone="ready">{remaining(offer.expiresAt)} left</Chip>
        <Chip>First order only</Chip>
        <Chip>One per account</Chip>
      </div>
      {cta}
    </>
  ));
}
