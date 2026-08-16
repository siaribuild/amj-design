// The referrer half of the Referrals section — five states (UX spec §5.2).
//
// A · not a member    → the join invitation, which is a door and not a form
// B · member, empty   → code card · empty note · how you get paid
// C · member, working → earnings · referrals · payments · how you get paid · code
// D · left, history   → left notice + rejoin · read-only payments
// E · program off     → ended notice · read-only earnings, list, payments
//
// The rate appears in exactly one of those: the invitation, where there is no
// money on screen for it to be inverted against. Every state that shows an earned
// amount is built from components that are not given the rate at all (§5.4 file).
import { useState } from "react";
import type { ReferrerScreen } from "../../data/referrals";
import { TONE, fmtDate, fmtDayDate } from "../../pages/accountModel";
import { SAGE, Btn } from "../../app/ui";
import { pct, moneyRound, months, days } from "./format";
import { EarningsStrip, ReferralList, PaymentsPanel, HowYouGetPaid, nextPaymentDueAt } from "./ReferrerPanels";

const stripe = (colour: string) => ({ borderLeft: `3px solid ${colour}` });

/** State A. No form, no fields, no mention of a bank account — joining is a flow
 *  and this is the door to it. The two facts that must never be adjacent live on
 *  different steps: "any account can join" here, "we need your bank details"
 *  inside the flow, so they cannot be read as one condition. */
export function JoinInvitation({ program, muted, onJoin, onReadConditions }: {
  program: ReferrerScreen["program"];
  /** True when the reader has a discount card above this — the argument changes
   *  to what just happened to them, and the card steps back visually. */
  muted?: boolean;
  onJoin?: () => void;
  onReadConditions?: () => void;
}) {
  const discount = pct(program.discountPercent);
  return (
    <div className="card p-5 flex flex-col gap-3" style={stripe(muted ? TONE.mute.bd : SAGE)}>
      {!muted && (
        <span className="text-body font-data t-label">Refer a mate</span>
      )}
      {muted ? (
        <p className="text-body t-bd">
          You got <b className="text-ink">{discount}</b> off because someone passed you a code. You can do the
          same: your mate gets <b className="text-ink">{discount} off their first order</b>, and when they've
          paid it in full we pay you <b className="text-ink">{pct(program.ratePercent)} of it</b>, within{" "}
          <b className="text-ink">{days(program.payoutTimeframeDays)}</b>.
        </p>
      ) : (
        <>
          <h3 className="text-ink t-hd1 font-display">You both win.</h3>
          <p className="text-body t-bd">
            Your mate gets <b className="text-ink">{discount} off their first order</b>. When they've paid it in
            full, we pay you <b className="text-ink">{pct(program.ratePercent)} of it</b>, within{" "}
            <b className="text-ink">{days(program.payoutTimeframeDays)}</b>.
          </p>
        </>
      )}
      <p className="text-body t-bd-sm">Any account can join — you don't need to have ordered.</p>
      <div className="flex flex-wrap items-center gap-4">
        <Btn variant={muted ? "outline" : "sage"} size={muted ? "md" : "lg"} onClick={onJoin}>
          Join the program →
        </Btn>
        {!muted && onReadConditions && (
          <button onClick={onReadConditions} className="text-body hover:text-sage cursor-pointer t-cap">
            Read the conditions first
          </button>
        )}
      </div>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Btn variant="outline" size="sm" onClick={() => {
      navigator.clipboard?.writeText(value).then(() => {
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }, () => {});
    }}>{done ? "Copied" : label}</Btn>
  );
}

/** States B and C. On a working account the earnings are the point and the code
 *  is a tool, so it demotes rather than disappears. */
export function CodeCard({ code, shareUrl, program, demoted, onHowItWorks }: {
  code: string;
  shareUrl: string;
  program: ReferrerScreen["program"];
  demoted?: boolean;
  onHowItWorks?: () => void;
}) {
  const share = () => {
    const text = `Get ${pct(program.discountPercent)} off your first order at OpenFrame with my code ${code}: ${shareUrl}`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
  };
  return (
    <div className="card p-5 flex flex-col gap-3" style={stripe(SAGE)}>
      <span className="text-body font-data t-label">Your code</span>
      <p className={`text-ink font-data ${demoted ? "t-hd2" : "t-hd1"}`} style={{ letterSpacing: ".08em" }}>{code}</p>
      <p className={`text-body font-data break-all ${demoted ? "t-data-sm" : "t-data"}`}>{shareUrl}</p>
      <div className="flex flex-wrap gap-2">
        {!demoted && <CopyButton value={code} label="Copy code" />}
        <CopyButton value={shareUrl} label="Copy link" />
        <Btn variant="ghost" size="sm" onClick={share}>Share</Btn>
      </div>
      {!demoted && (
        <p className="pt-3 border-t border-black/[0.07] text-body t-bd-sm">
          Your mate gets <b className="text-ink">{pct(program.discountPercent)} off their first order</b>. When
          they've paid it in full, your share goes out by bank transfer within{" "}
          <b className="text-ink">{days(program.payoutTimeframeDays)}</b>. Their order needs to be at least{" "}
          <b className="text-ink">{moneyRound(program.minOrderAmount)}</b> ex GST before delivery, and placed
          within <b className="text-ink">{months(program.windowMonths)}</b>.{" "}
          {onHowItWorks && (
            <button onClick={onHowItWorks} className="text-sage hover:text-sage-deep cursor-pointer">
              How the program works →
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/** Not an empty table, not a zeroed strip, not greyed-out share buttons. */
function EmptyNote() {
  return (
    <div className="card p-5 flex flex-col gap-1.5" style={stripe(TONE.mute.bd)}>
      <p className="text-ink t-bd-lg font-display">Nobody's used your code yet.</p>
      <p className="text-body t-bd-sm">
        Share it with one tradie this week. They save on their first order, and you get paid when they've paid us.
      </p>
    </div>
  );
}

export function ReferrerBlock({ screen, hasOffer, onJoin, onEdit, onLeave, onHowItWorks }: {
  screen: ReferrerScreen;
  /** The discount card is above this block, so the invitation argues from what
   *  just happened to the reader instead of introducing the program cold. */
  hasOffer?: boolean;
  onJoin?: () => void;
  onEdit?: () => void;
  onLeave?: () => void;
  onHowItWorks?: () => void;
}) {
  const { program, code, retainedCode, shareUrl, referrals, earnings, earningRows, payout, payoutHistory } = screen;
  const hasHistory = referrals.length > 0 || payoutHistory.length > 0;
  const dueAt = nextPaymentDueAt(earningRows);

  // E — the program ended. Nothing new is taken; everything already earned stays
  // and is still paid on the timetable it was promised on.
  if (!program.active && hasHistory) {
    return (
      <div className="flex flex-col gap-4">
        <div className="card p-5 flex flex-col gap-1.5" style={stripe(TONE.mute.bd)}>
          <p className="text-ink t-bd-lg font-display">This program has ended.</p>
          <p className="text-body t-bd-sm">
            We're no longer taking new referrals. Anything you'd already earned is below and will still be paid,
            on the timetable you were given.
          </p>
        </div>
        <EarningsStrip earnings={earnings} nextDueAt={dueAt} />
        {referrals.length > 0 && <ReferralList referrals={referrals} program={program} />}
        <PaymentsPanel history={payoutHistory} />
      </div>
    );
  }

  // D — left, with history. Membership IS having payout details, so removing them
  // is leaving; the same code comes back on rejoining.
  if (!code && hasHistory) {
    return (
      <div className="flex flex-col gap-4">
        <div className="card p-5 flex flex-col gap-1.5" style={stripe(TONE.work.bd)}>
          <p className="text-ink t-bd-lg font-display">You've left the program.</p>
          <p className="text-body t-bd-sm">
            Your code doesn't record new referrals and we're not holding your bank details. Everything you were
            paid is below.{retainedCode && <> Rejoin and you'll get <b className="text-ink font-data">{retainedCode}</b> back.</>}
          </p>
          <Btn variant="sage" size="sm" onClick={onJoin}>Rejoin the program</Btn>
        </div>
        <PaymentsPanel history={payoutHistory} />
      </div>
    );
  }

  // A — not a member.
  if (!code) {
    return <JoinInvitation program={program} muted={hasOffer} onJoin={onJoin} onReadConditions={onHowItWorks} />;
  }

  // B — member, nobody has used the code yet.
  if (referrals.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <CodeCard code={code} shareUrl={shareUrl ?? ""} program={program} onHowItWorks={onHowItWorks} />
        <EmptyNote />
        <HowYouGetPaid payout={payout} program={program} onEdit={onEdit} onLeave={onLeave} />
      </div>
    );
  }

  // C — working. Earnings first, code last: the money is the point.
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body t-bd-sm">
          {referrals.length === 1 ? "1 mate referred" : `${referrals.length} mates referred`}
          {dueAt && <> · next payment due <b className="text-ink">{fmtDate(dueAt)}</b></>}
        </p>
        <span className="text-body font-data t-data-sm">{fmtDayDate(new Date())}</span>
      </div>
      <EarningsStrip earnings={earnings} nextDueAt={dueAt} />
      <ReferralList referrals={referrals} program={program} />
      <PaymentsPanel history={payoutHistory} />
      <HowYouGetPaid payout={payout} program={program} onEdit={onEdit} onLeave={onLeave} />
      <CodeCard code={code} shareUrl={shareUrl ?? ""} program={program} demoted onHowItWorks={onHowItWorks} />
    </div>
  );
}
