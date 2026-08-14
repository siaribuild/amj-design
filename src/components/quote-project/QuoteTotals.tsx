// ═══════════════════════════════════════════════════════════════════════════════
// THE MONEY PANEL — one totals block, wherever a priced list is shown.
//
// It hangs off the BOTTOM of the list it describes, at every stage: the pending
// project, the issued quote, and the accepted order. There were three of these —
// PendingTotals, an inline block of rows in QuoteReviewPage, and LineList's own
// footer — and they had already drifted: only one of them showed GST, and only
// one named the delivery destination. Three panels stating the same facts three
// ways is how a customer ends up reading two different numbers for one job.
//
// What changes between stages is WORDING and which rows apply, never the
// arithmetic:
//   pending   delivery may be unsettled ⇒ "To be confirmed", and NO total row
//   issued    every row, plus the deposit that acceptance will invoice
//   order     every row, no deposit — it is invoiced, and the order journey
//             carries it (owner: the 50/50 panel was removed for saying it twice)
// ═══════════════════════════════════════════════════════════════════════════════
import { TONE, money } from "../../pages/accountModel";
import { taxBreakdown, useGstMode } from "../../data/gst";

/** One line of the panel. */
function TotalRow({ label, value, big, attn }: { label: string; value: string; big?: boolean; attn?: boolean }) {
  return (
    <div className={`flex justify-between ${big ? "border-t border-black/10 pt-[11px] mt-0.5 font-semibold text-ink" : "text-body t-cap"} t-bd`}
      style={attn ? { color: TONE.attn.text } : undefined}>
      <span>{label}</span>
      <span className={`font-data ${big ? "t-bd-lg" : "font-medium"}`} style={{ color: attn ? TONE.attn.text : big ? undefined : "var(--ink)" }}>{value}</span>
    </div>
  );
}

export function QuoteTotals({ lineTotals, deliveryInc, postcode, deposit, pending, conservative }: {
  /** Per-line GST-INCLUSIVE totals. Passed per line, not pre-summed, because
   *  the ATO taxable-supply rule works out GST on each supply and sums it —
   *  which is also what makes the line prices above add up to the subtotal
   *  here (see src/data/gst.ts). */
  lineTotals: number[];
  /** GST-inclusive delivery, or null when it has not been settled yet. NEVER
   *  test this for truthiness: 0 is a settled trade waiver, not an absence. */
  deliveryInc: number | null;
  postcode?: string | null;
  /** Shown only BEFORE acceptance (owner). Omit on an accepted order: the
   *  deposit is invoiced by then and the order journey states it. */
  deposit?: number | null;
  /** Estimate wording, and the caveat sentence beneath. */
  pending?: boolean;
  /** Pending + the postcode fell to the fallback zone ⇒ "allowed generously". */
  conservative?: boolean;
}) {
  const gstMode = useGstMode();
  const goodsInc = lineTotals.reduce((sum, n) => sum + (n || 0), 0);
  const totalInc = goodsInc + (deliveryInc ?? 0);
  const tax = taxBreakdown(gstMode, {
    lineTotalsInc: lineTotals, deliveryInc: deliveryInc ?? 0, totalInc,
  });
  return (
    <>
      <div className="bg-sage/[0.07] border-t border-black/10 px-5 py-[15px] flex flex-col gap-[9px]">
        <TotalRow label={`Windows and doors (${tax.suffix})`} value={money(tax.goods)} />
        <TotalRow
          label={`Delivery to ${postcode ?? "your site"}${deliveryInc == null ? "" : ` (${tax.suffix})`}`}
          value={deliveryInc == null ? "To be confirmed"
            : pending ? `around ${money(tax.delivery)}`
            : tax.delivery === 0 ? "$0" : money(tax.delivery)} />
        <TotalRow label={tax.gstLabel} value={money(tax.gst)} />
        {/* Only a total once BOTH halves are real. Adding an unpriced delivery
            to goods would print a confident number that is quietly missing its
            freight — the one figure a customer would carry away.

            The total and the deposit stay GST-INCLUSIVE in either display mode:
            they are what is owed, not a way of looking at what is owed. */}
        {deliveryInc != null && (
          <TotalRow label={`${pending ? "Estimated total" : "Total"} (inc GST)`} value={money(totalInc)} big />
        )}
        {deposit != null && <TotalRow label="50% deposit to begin" value={money(deposit)} attn />}
      </div>
      {pending && (
        <p className="px-5 pb-4 pt-3 text-body t-cap">
          {deliveryInc == null
            // Never invents a figure. D9 is about never showing nothing when a
            // number exists — it is not licence to guess one when it does not.
            ? (postcode
              ? `We'll confirm delivery to ${postcode} when your reviewed quote is issued.`
              : "We'll confirm your delivery cost when your reviewed quote is issued.")
            : conservative
              ? "That postcode is outside our usual runs, so we've allowed generously. A person checks it before your quote is issued, and it may come down."
              : "An estimate. A person checks it against real freight before your quote is issued."}
        </p>
      )}
    </>
  );
}
