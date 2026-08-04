// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT ACTION BAR
//
// Plan §7.5. ONE primary persistent action at a time. The bar reads the SHARED
// quoteSummary() figures, so it can never disagree with /quote's sticky panel
// about whether the quote is submittable.
//
//   List, no blockers      → total + opening count + Submit for technical review
//   List, N blockers       → openings + "N details need your input" + Fix N details
//   Documents processing   → honest processing state; NO stale ready-to-submit CTA
//   Empty list             → brief helper + Add opening
//   Drawer open            → the drawer's own footer replaces this bar
//
// It states ONLY what the customer can act on. Technical caveats and
// pending-final-price counts are deliberately absent (owner, 2026-08-04): both
// are priced, submittable and ours to resolve, so surfacing them hands over a
// number with no action attached. rowState applies the same rule to the rows.
//
// It must not invent a new approval stage: the existing submission semantics and
// the customer-facing technical-review promise are retained as-is. Status is
// text + icon + colour, never colour alone.
// ═══════════════════════════════════════════════════════════════════════════════
import { ArrowRight, AlertCircle, Check, Loader2 } from "lucide-react";
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
  const { total, itemCount, attentionCount, pendingPriceCount, pricedCount } = summary;
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
        className="px-3 py-2 text-white bg-sage min-h-[44px] opacity-50 inline-flex items-center gap-1.5 t-bd-sm">
        Reading… <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      </button>
    );
  } else if (itemCount === 0) {
    status = <span>No openings yet — upload a schedule or add one.</span>;
    live = "No openings yet";
    state = "working";
    cta = (
      <button type="button" onClick={onAddOpening}
        className="px-3 py-2 text-white bg-sage min-h-[44px] cursor-pointer inline-flex items-center gap-1.5 t-bd-sm">
        Add opening <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </button>
    );
  } else if (attentionCount > 0) {
    // The blocker is not the only fact worth stating. This branch showed ONE
    // chip, so a 19-opening quote with 17 blockers read as "17 details need your
    // input" and nothing else — the size of the project went unsaid, which
    // makes 17 sound like the whole of it rather than most of it.
    status = (
      <span className="flex items-center gap-1.5 flex-wrap">
        <span className="quote-chip quote-chip--neutral px-2 py-1">{openings(itemCount)}</span>
        <span className="quote-chip quote-chip--attention px-2 py-1">
          <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
          {attentionCount} detail{attentionCount !== 1 ? "s" : ""} need{attentionCount === 1 ? "s" : ""} your input
        </span>
        {/* NO "N we'll confirm" and no "N pending final price" (owner). Neither
            is actionable: both are priced, submittable and OURS to resolve, so
            they ask the customer to carry a number they cannot do anything
            about. This is the same rule rowState already applies to the rows —
            warning severity is suppressed there — and the bar was contradicting
            it. They were also the same lines twice: a customer-changed AI line
            counts in technicalCount AND pendingPriceCount. */}
      </span>
    );
    live = `${attentionCount} detail${attentionCount !== 1 ? "s" : ""} need${attentionCount === 1 ? "s" : ""} your input`;
    state = "attention";
    cta = (
      <button type="button" onClick={onFixDetails}
        className="px-3 py-2 text-white bg-warning min-h-[44px] cursor-pointer inline-flex items-center gap-1.5 t-bd-sm">
        Fix {attentionCount} detail{attentionCount !== 1 ? "s" : ""} <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </button>
    );
  } else {
    // Nothing blocks, so the bar says so and nothing else. Technical caveats are
    // NOT stated here (owner): they are priced, submittable and ours to resolve,
    // so a count the customer cannot act on only makes a clean quote look unclean.
    status = (
      <span className="flex items-center gap-1.5 flex-wrap">
        <span className="quote-chip quote-chip--ready px-2 py-1">
          <Check className="w-3.5 h-3.5" aria-hidden="true" />{openings(itemCount)}
        </span>
      </span>
    );
    live = `${openings(itemCount)} ready`;
    state = "ready";
    cta = (
      <button type="button" onClick={onSubmit}
        className="px-3 py-2 text-white bg-sage min-h-[44px] cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap t-bd-sm">
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
        {pricedCount === 0
          ? "No estimate yet — we price it once the details are complete."
          : `${pendingPriceCount ? "Priced-items subtotal" : "Indicative estimate"} ${fmt(gstAdjust(total, gstMode))} ${gstSuffix(gstMode)}.`} {live}.
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center justify-between gap-3 min-w-0 sm:contents">
          <div className="sm:order-2 flex flex-col min-w-0 flex-shrink-0">
            {/* Nothing priced ⇒ no figure, and say why. "$0" here is not a
                rounding of the truth, it is a price we never quoted: the sum of
                nothing is zero, and printing it tells the customer their 19
                openings are worth nothing. */}
            <span className="text-body-soft mb-1 t-label">
              {pricedCount === 0 ? "Estimate" : pendingPriceCount ? "Priced subtotal" : "Estimate"}
            </span>
            <span className="flex items-baseline gap-1.5">
              {pricedCount === 0 ? (
                <span className="text-body-soft t-cap">Once details are complete</span>
              ) : (
                <>
                  <span className="text-ink font-semibold tabular-nums font-data t-data">{fmt(gstAdjust(total, gstMode))}</span>
                  <span className="text-body-soft whitespace-nowrap t-cap">{gstSuffix(gstMode)}</span>
                </>
              )}
            </span>
          </div>
          <div className="sm:order-1 sm:flex-1 flex items-center gap-1.5 min-w-0 font-medium text-ink t-cap">
            {status}
          </div>
        </div>
        <div className="sm:order-3 [&>button]:w-full sm:[&>button]:w-auto [&>button]:justify-center">{cta}</div>
      </div>
    </section>
  );
}
