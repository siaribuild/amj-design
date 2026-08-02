// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT ACTION BAR
//
// Plan §7.5. ONE primary persistent action at a time. The bar reads the SHARED
// quoteSummary() figures, so it can never disagree with /quote's sticky panel
// about whether the quote is submittable.
//
//   List, no blockers      → total + item count + Submit for technical review
//   List, N blockers       → "N details need your input" + Fix N details
//   Documents processing   → honest processing state; NO stale ready-to-submit CTA
//   Empty list             → brief helper + Add opening
//   Drawer open            → the drawer's own footer replaces this bar
//
// It must not invent a new approval stage: the existing submission semantics and
// the customer-facing technical-review promise are retained as-is. Status is
// text + icon + colour, never colour alone.
// ═══════════════════════════════════════════════════════════════════════════════
import { ArrowRight, AlertCircle, Check, Info, Loader2 } from "lucide-react";
import { fmt } from "../../data/configurator";
import { useGstMode, gstAdjust, gstSuffix } from "../../data/gst";
import { type QuoteSummary } from "../../data/quoteSummary";

export function ProjectActionBar({ summary, processing, onSubmit, onFixDetails, onAddOpening }: {
  summary: QuoteSummary;
  /** Documents are being read (shared engine). Reading never blocks the
   *  customer, but the bar must not assert a total that is about to change. */
  processing: boolean;
  onSubmit: () => void;
  onFixDetails: () => void;
  onAddOpening: () => void;
}) {
  const gstMode = useGstMode();
  const { total, itemCount, attentionCount, technicalCount, pendingPriceCount } = summary;
  const openings = (n: number) => `${n} opening${n !== 1 ? "s" : ""}`;

  let status: React.ReactNode;
  let live: string;
  let cta: React.ReactNode;
  let state: "ready" | "review" | "attention" | "working";

  if (processing) {
    status = <><Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" aria-hidden="true" /><span>Reading your documents…</span></>;
    live = "Reading your documents";
    state = "working";
    // Honest: no ready-to-submit claim while the list is about to change.
    cta = (
      <button type="button" disabled
        className="px-3 py-2 text-sm text-white bg-sage min-h-[44px] opacity-50 inline-flex items-center gap-1.5">
        Reading… <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      </button>
    );
  } else if (itemCount === 0) {
    status = <span>No openings yet — upload a schedule or add one.</span>;
    live = "No openings yet";
    state = "working";
    cta = (
      <button type="button" onClick={onAddOpening}
        className="px-3 py-2 text-sm text-white bg-sage min-h-[44px] cursor-pointer inline-flex items-center gap-1.5">
        Add opening <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </button>
    );
  } else if (attentionCount > 0) {
    status = (
      <span className="quote-chip quote-chip--attention px-2 py-1">
        <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
        {attentionCount} detail{attentionCount !== 1 ? "s" : ""} need{attentionCount === 1 ? "s" : ""} your input
      </span>
    );
    live = `${attentionCount} detail${attentionCount !== 1 ? "s" : ""} need${attentionCount === 1 ? "s" : ""} your input`;
    state = "attention";
    cta = (
      <button type="button" onClick={onFixDetails}
        className="px-3 py-2 text-sm text-white bg-warning min-h-[44px] cursor-pointer inline-flex items-center gap-1.5">
        Fix {attentionCount} detail{attentionCount !== 1 ? "s" : ""} <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </button>
    );
  } else {
    // Nothing blocks. Technical caveats are stated once, quietly — they are ours
    // to confirm and they never gate submission.
    status = (
      <span className="flex items-center gap-1.5 flex-wrap">
        <span className="quote-chip quote-chip--ready px-2 py-1">
          <Check className="w-3.5 h-3.5" aria-hidden="true" />{openings(itemCount)}
        </span>
        {technicalCount > 0 && (
          <span className="quote-chip quote-chip--review px-2 py-1"
            title="Priced as an indicative estimate — our team confirms these at review. You can still submit.">
            <Info className="w-3.5 h-3.5" aria-hidden="true" />{technicalCount} we'll confirm
          </span>
        )}
      </span>
    );
    live = technicalCount > 0
      ? `${openings(itemCount)} ready, ${technicalCount} we'll confirm at review`
      : `${openings(itemCount)} ready`;
    state = technicalCount > 0 ? "review" : "ready";
    cta = (
      <button type="button" onClick={onSubmit}
        className="px-3 py-2 text-sm text-white bg-sage min-h-[44px] cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap">
        Submit for technical review <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    <section role="region" aria-label="Project summary and actions" data-state={state}
      className="quote-sticky sticky bottom-0 z-40 border-t-[3px]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {/* Polite, atomic summary for assistive tech — not the whole panel. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {pendingPriceCount ? "Priced-items subtotal" : "Indicative estimate"} {fmt(gstAdjust(total, gstMode))} {gstSuffix(gstMode)}. {live}.
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center justify-between gap-3 min-w-0 sm:contents">
          <div className="sm:order-2 flex flex-col min-w-0 flex-shrink-0">
            <span className="text-[9px] uppercase tracking-[0.16em] text-body-soft leading-none mb-1">
              {pendingPriceCount ? "Priced subtotal" : "Estimate"}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-ink text-lg sm:text-[17px] font-semibold leading-none tabular-nums"
                style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(gstAdjust(total, gstMode))}</span>
              <span className="text-body-soft text-xs whitespace-nowrap">{gstSuffix(gstMode)}</span>
            </span>
          </div>
          <div className="sm:order-1 sm:flex-1 flex items-center gap-1.5 min-w-0 text-[13px] font-medium text-ink">
            {status}
          </div>
        </div>
        <div className="sm:order-3 [&>button]:w-full sm:[&>button]:w-auto [&>button]:justify-center">{cta}</div>
      </div>
    </section>
  );
}
