// GST display preference. Catalogue prices are stored GST-INCLUSIVE (AU 10%);
// a signed-in account can choose to see estimates ex-GST. Guests always see inc.
import { createContext, useContext } from "react";

export type GstMode = "inc" | "ex";
export const GST_RATE = 0.1;

// Provided by App from the signed-in user's preference; "inc" for guests/default.
export const GstContext = createContext<GstMode>("inc");
export const useGstMode = () => useContext(GstContext);

/** Adjust a GST-inclusive amount for the chosen display mode. */
export const gstAdjust = (incAmount: number, mode: GstMode) =>
  mode === "ex" ? incAmount / (1 + GST_RATE) : incAmount;

/** Short label to sit beside a displayed price. */
export const gstSuffix = (mode: GstMode) => (mode === "ex" ? "ex GST" : "inc GST");

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The GST contained in one GST-inclusive amount, and that amount net of it.
 *  One taxable supply, rounded once — the unit the rule below is built from. */
const supply = (inc: number) => {
  const ex = round2(inc / (1 + GST_RATE));
  return { ex, gst: round2(inc - ex) };
};

/**
 * The money block of an issued quote or order, in the account's chosen mode.
 *
 * THE ROUNDING RULE — ATO **taxable supply** rule, applied per LINE.
 *
 * The ATO permits two methods and requires you to pick one: work the GST out on
 * the invoice total (1/11, rounded once), or work it out on each taxable supply,
 * round each, and add them up. This uses the second, at line granularity — each
 * quote line and the delivery charge is its own supply. That is also what Xero,
 * MYOB and QuickBooks do, and it is the only method under which the line prices
 * a customer can see ADD UP to the subtotal printed beneath them.
 *
 * ⚠️ NOT YET RECONCILED WITH THE BOOKS (owner, 2026-08-14: "flag it for me").
 * Whatever issues the actual tax invoices downstream must use this same method,
 * or a quote saying $2,033.63 will be followed by an invoice saying $2,033.64
 * and the difference will surface at reconciliation. VERIFY BEFORE REAL
 * INVOICES ARE ISSUED. Switching to the total-invoice rule is a two-line change
 * here — the point is that it is decided once, in one place, not per screen.
 *
 * THE GST FIGURE DOES NOT DEPEND ON THE DISPLAY MODE. It is one sale, so it is
 * one GST amount; only which columns are shown net or gross changes. The first
 * version of this function got that wrong — it used the taxable-supply rule for
 * an ex-GST account and the total-invoice rule for an inc-GST one, so the same
 * quote reported $2,033.63 or $2,033.64 depending on a display preference.
 *
 * Two more things survive the mode switch, because they are not preferences:
 *   - the GRAND TOTAL is always GST-inclusive. It is the contractual figure.
 *   - anything the customer PAYS (deposit, balance) is computed from that
 *     inclusive total. A deposit quoted ex-GST would understate the transfer.
 */
export function taxBreakdown(mode: GstMode, args: {
  /** Each quote line, GST-inclusive. Per LINE, not pre-summed: rounding the
   *  aggregate is a different (also legal) answer, and the line prices on
   *  screen would then not sum to the subtotal under them. */
  lineTotalsInc: readonly number[];
  deliveryInc: number;
  /** The server's authoritative contractual total. Displayed as-is rather than
   *  re-derived here, so the figure a customer agrees to has exactly one
   *  source. */
  totalInc: number;
}) {
  const ex = mode === "ex";
  const lines = args.lineTotalsInc.map(supply);
  const goodsInc = round2(args.lineTotalsInc.reduce((s, n) => s + n, 0));
  const goodsEx = round2(lines.reduce((s, l) => s + l.ex, 0));
  const freight = supply(args.deliveryInc);
  return {
    goods: ex ? goodsEx : goodsInc,
    delivery: ex ? freight.ex : args.deliveryInc,
    /** Σ of each supply's own GST. Identical in both modes. */
    gst: round2(lines.reduce((s, l) => s + l.gst, 0) + freight.gst),
    /** "GST 10%" adds it to a net column; "Includes GST of" says it is already
     *  counted in a gross one — the ATO's wording for a GST-inclusive invoice. */
    gstLabel: ex ? "GST 10%" : "Includes GST of",
    suffix: gstSuffix(mode),
    totalInc: args.totalInc,
  };
}
