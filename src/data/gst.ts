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

/**
 * The money block of an issued quote or order, in the account's chosen mode.
 *
 * Two rules survive the mode switch, because they are not display preferences:
 *   - the GRAND TOTAL is always GST-inclusive. It is the contractual figure.
 *   - anything the customer PAYS (deposit, balance) is computed from that
 *     inclusive total. A deposit quoted ex-GST would understate the transfer.
 *
 * THE ROUNDING. Dividing each row by 1.1 separately can leave the rows one cent
 * apart from the true ex-GST subtotal — $14,370 and $8,000 give $13,063.64 +
 * $7,272.73 = $20,336.37 where the exact figure is $20,336.36. The GST line
 * absorbs that cent, so the column a customer can add up always reconciles to
 * the total they are asked to agree to. The alternative — a correct GST line
 * and a column that does not sum — is the one a customer would query.
 */
export function taxBreakdown(mode: GstMode, goodsInc: number, deliveryInc: number, totalInc: number) {
  const ex = mode === "ex";
  const goods = ex ? round2(goodsInc / (1 + GST_RATE)) : goodsInc;
  const delivery = ex ? round2(deliveryInc / (1 + GST_RATE)) : deliveryInc;
  return {
    goods,
    delivery,
    /** Ex: the balancing figure. Inc: the GST contained in the total. */
    gst: ex ? round2(totalInc - goods - delivery) : round2(totalInc - totalInc / (1 + GST_RATE)),
    /** "GST 10%" adds it; "Includes GST of" says it was already counted — the
     *  ATO's own wording for a tax invoice priced GST-inclusive. */
    gstLabel: ex ? "GST 10%" : "Includes GST of",
    suffix: gstSuffix(mode),
    totalInc,
  };
}
