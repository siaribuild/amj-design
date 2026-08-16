// The working referrer's panels (UX spec §5.2 state C, §5.3, §5.4).
//
// ⚠️ THE COMMISSION RATE IS NOT A PROP OF ANY COMPONENT IN THIS FILE, and that is
// the point rather than an omission. A rate shown beside an earned amount is
// invertible: "1%" next to "$45.00" tells the referrer their mate spent $4,500,
// which is that third party's business and not theirs. So the rate lives on the
// join invitation — where there is no money on screen to invert against — and
// these components are given no way to display it even by accident.
//
// Payout figures are also exempt from the ex/inc GST preference: a payout is not
// a price of goods, it is cash arriving in a bank account, and there is no
// ex/inc pair to toggle between. The strip says so out loud rather than leaving
// someone to wonder why the toggle did nothing.
import type {
  EarningRow, PayoutRecord, PayoutState, ReferralProgramPublic, ReferralStatus, ReferralSummary,
} from "../../data/referrals";
import { StatusPill, SummaryCell, money, fmtDate } from "../../pages/accountModel";
import { Btn } from "../../app/ui";
import { moneyRound, months, days } from "./format";

/** §5.3 — five statuses, down from six. "Quoting" was cut: that a mate is
 *  shopping is neither the referrer's business nor connected to their money, and
 *  it never changes when they get paid. */
const STATUS: Record<ReferralStatus, { label: string; tone: "draft" | "work" | "pos" | "mute" }> = {
  signed_up: { label: "Signed up", tone: "draft" },
  ordered: { label: "Ordered", tone: "work" },
  paid_in_full: { label: "Paid", tone: "pos" },
  expired: { label: "Expired", tone: "mute" },
  not_eligible: { label: "Not eligible", tone: "mute" },
};

export function EarningsStrip({ earnings, nextDueAt }: {
  earnings: { pending: number; confirmed: number; paid: number };
  /** Already resolved server-side — the browser must not compute a date the
   *  business is promising to meet. */
  nextDueAt?: string | null;
}) {
  return (
    <div>
      <div className="card flex flex-wrap">
        <SummaryCell label="Pending" value={money(earnings.pending)} small="waiting on their payment" />
        <SummaryCell label="Confirmed" value={money(earnings.confirmed)} small={nextDueAt ? `due by ${fmtDate(nextDueAt)}` : undefined} />
        <SummaryCell label="Paid" value={money(earnings.paid)} small="lifetime" />
      </div>
      <p className="text-body mt-2 t-cap">
        These are cash amounts. Your ex/inc GST setting doesn't change them — a payout isn't a price.
      </p>
    </div>
  );
}

export function ReferralList({ referrals, program }: {
  referrals: ReferralSummary[];
  program: ReferralProgramPublic;
}) {
  // Why each ending happened, in the customer's terms. A referral voided by staff
  // shows as "Not eligible" with the same generic line — the ops void reason is an
  // internal operational record and is not the customer's to read.
  const subLine = (status: ReferralStatus) =>
    status === "expired" ? `No first order within ${months(program.windowMonths)}`
      : status === "not_eligible" ? `First order was under ${moneyRound(program.minOrderAmount)} ex GST`
        : null;

  return (
    <section className="card">
      <div className="panel-head px-5 py-3 grid grid-cols-[1fr_auto_auto] gap-4 text-body font-data t-label">
        <span>Who</span><span>Signed up</span><span>Status</span>
      </div>
      <ul>
        {referrals.map((r) => {
          const s = STATUS[r.status];
          const sub = subLine(r.status);
          return (
            // Deliberately not clickable: no card-link, no hover fill, no chevron.
            // There is nothing to open, and an affordance that opens nothing is a
            // promise the screen can't keep.
            <li key={r.id} className="px-5 py-3.5 border-t border-black/[0.07] grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-1 md:gap-4 md:items-center">
              <span className="text-ink t-bd-sm">{r.displayName}</span>
              <span className="text-body font-data t-data-sm md:text-right">
                <span className="md:hidden">Signed up </span>{fmtDate(r.joinedAt)}
              </span>
              <span className="flex flex-col gap-0.5 md:items-end">
                <StatusPill tone={s.tone}>{s.label}</StatusPill>
                {sub && <span className="text-body t-cap">{sub}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="px-5 py-3 border-t border-black/[0.07] text-body t-cap">
        You see the business name and how far along they are, and nothing else — never their prices,
        their address or what's on their job.
      </p>
    </section>
  );
}

export function PaymentsPanel({ history }: { history: PayoutRecord[] }) {
  return (
    <section className="card">
      <div className="panel-head px-5 py-3 text-body font-data t-label">Payments to you</div>
      {history.length === 0 ? (
        <p className="px-5 py-4 text-body t-bd-sm">
          Nothing paid out yet. Your first transfer shows up here with its bank reference.
        </p>
      ) : (
        <ul>
          {history.map((p, i) => (
            <li key={`${p.paidAt}-${i}`} className="px-5 py-3.5 border-t border-black/[0.07] grid grid-cols-1 sm:grid-cols-[auto_auto_1fr_auto] gap-1 sm:gap-4 sm:items-baseline">
              <span className="text-body font-data t-data-sm">{fmtDate(p.paidAt)}</span>
              <span className="text-ink font-semibold t-bd-sm sm:text-right">{money(p.amount)}</span>
              <span className="text-body font-data t-data-sm">{p.reference ?? "—"}</span>
              {/* A reversed transfer must never read as money received. It stays
                  on the list because "we tried to pay you and it came back" is
                  what someone rings up about — but it says what happened, and
                  says the money is not lost. */}
              <span className="text-body t-cap">
                {p.status === "failed"
                  ? "Didn't go through — back in your balance"
                  : p.referralIds.length === 1 ? "1 referral" : `${p.referralIds.length} referrals`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** §5.4. Masked always (AC-29) — the unmasked details exist in exactly one place
 *  a human can read them, the ops payouts run, and this is not it. */
export function HowYouGetPaid({ payout, program, onEdit, onLeave }: {
  payout: PayoutState;
  program: ReferralProgramPublic;
  onEdit?: () => void;
  onLeave?: () => void;
}) {
  // A valid ABN gets no comment. A green tick beside someone's ABN reads like we
  // ran a background check on them; it is a checksum. The field speaks only when
  // something is wrong.
  const abnDisplay = payout.abn
    ? payout.abn.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3 $4")
    : "—";
  return (
    <section className="card">
      <div className="panel-head px-5 py-3 text-body font-data t-label">How you get paid</div>
      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <span className="text-body font-data t-label">Bank account</span>
          <p className="text-ink mt-1 font-data t-data">
            BSB {payout.bsbMasked ?? "—"} · {payout.accountMasked ?? "—"}
          </p>
          <p className="text-body mt-0.5 t-bd-sm">{payout.accountName ?? "—"}</p>
        </div>
        <div>
          <span className="text-body font-data t-label">ABN</span>
          <p className="text-ink mt-1 font-data t-data">{abnDisplay}</p>
          {payout.abnPresent && !payout.abnValid && (
            <p className="mt-0.5 t-cap" style={{ color: "var(--destructive)" }}>
              We can't read that as a valid ABN
            </p>
          )}
        </div>
      </div>
      <div className="px-5 py-3 border-t border-black/[0.07] text-body t-bd-sm">
        We pay by bank transfer within <b className="text-ink">{days(program.payoutTimeframeDays)}</b> of your
        mate's order being paid in full. Amounts include any GST payable; your own tax is between you and your
        accountant — we don't give tax advice.
      </div>
      <div className="px-5 py-3 border-t border-black/[0.07] flex flex-wrap gap-2">
        <Btn variant="outline" size="sm" onClick={onEdit}>Edit details</Btn>
        <Btn variant="ghost" size="sm" onClick={onLeave}>Leave the program</Btn>
      </div>
    </section>
  );
}

/** The oldest confirmed-but-unpaid earning's due date — the promise the Confirmed
 *  cell restates. Read from `dueAt`, never recomputed here. */
export function nextPaymentDueAt(rows: EarningRow[]): string | null {
  const due = rows.filter((r) => r.status === "confirmed" && r.dueAt).map((r) => r.dueAt as string).sort();
  return due[0] ?? null;
}
