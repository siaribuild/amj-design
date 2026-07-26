// ═══════════════════════════════════════════════════════════════════════════════
// STICKY QUOTE SUMMARY PANEL
// A persistent bottom bar for the quote builder. Answers three questions at all
// times: what is the estimate, is the quote ready, what to do next. It reuses the
// page's existing totals / validation — it does not recompute business logic.
//
// It stays present throughout the build flow so estimate, status and next action
// always have a stable home. Positioning is handled entirely by CSS sticky layout.
// ═══════════════════════════════════════════════════════════════════════════════
import { ArrowRight, AlertCircle, Check, Pencil, Loader2, Info } from "lucide-react";
import { Btn } from "../app/ui";
import { fmt } from "../data/configurator";
import { useGstMode, gstAdjust, gstSuffix } from "../data/gst";
import { TONE } from "../pages/accountModel";

export type StickyQuotePanelProps = {
  itemCount: number;
  attentionCount: number;        // ERROR-severity: blocking items the customer must fix
  /** WARNING-severity: priced (indicative) lines carrying an AMJ technical
   *  decision. Shown alongside errors but NEVER part of the submit gate. */
  technicalCount?: number;
  pendingPriceCount?: number;    // submitted for staff exact pricing
  total: number;
  editingItem: boolean;          // a new item is being composed but not yet saved
  uploading?: boolean;           // a schedule is being read/parsed right now
  /** Documents the AI pipeline is still reading (multi-file UX spec §2). While
   *  >0 the bar suppresses the "N ready" claim — it would assert a total that is
   *  about to change — but the CTA stays live (processing never blocks). */
  readingDocs?: number;
  onReviewQuote: () => void;
  onReviewIssues: () => void;
  onFinishItem: () => void;
};

export function StickyQuotePanel({
  itemCount, attentionCount, technicalCount = 0, pendingPriceCount = 0, total, editingItem, uploading = false, readingDocs = 0,
  onReviewQuote, onReviewIssues, onFinishItem,
}: StickyQuotePanelProps) {
  const readyCount = Math.max(0, itemCount - attentionCount - pendingPriceCount - technicalCount);
  // "We'll confirm" chip — TONE.work slate: informational, never a demand.
  const confirmChip = technicalCount > 0 ? (
    <span className="flex items-center gap-1 border px-2 py-1 whitespace-nowrap"
      style={{ borderColor: TONE.work.bd, background: TONE.work.bg, color: TONE.work.text }}
      title="Priced as an indicative estimate — an AMJ technician confirms these at review. You can still submit.">
      <Info className="w-3.5 h-3.5" aria-hidden="true" />{technicalCount} we'll confirm
    </span>
  ) : null;
  const items = (c: number) => `${c} item${c !== 1 ? "s" : ""}`;
  const gstMode = useGstMode();
  const shownTotal = gstAdjust(total, gstMode);

  let status: React.ReactNode;
  let live: string;
  let ctaLabel: string;
  let onClick: () => void;
  let statusTone: string;
  let panelTone: string;
  let ctaTone = "";
  let ctaDisabled = false;

  // A muted "Adding…" chip rides alongside the saved-quote status whenever a new
  // item is being composed on top of existing items — it never becomes the CTA.
  const addingChip = editingItem && itemCount > 0 ? (
    <span className="flex items-center gap-1 border border-black/10 bg-white px-2 py-1 text-[#6f6c67] whitespace-nowrap">
      <Pencil className="w-3 h-3" aria-hidden="true" />Adding…
    </span>
  ) : null;

  if (uploading) {
    // Live state wins: the aggregate ("N need attention") reappears on its own the
    // moment parsing finishes, so nothing here needs to describe the outcome.
    // Same rule as readingDocs: processing never blocks — the CTA stays live
    // against whatever items already exist (UX backlog item, now aligned).
    status = <><Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" aria-hidden="true" /><span>Reading your documents…</span></>;
    live = "Reading your documents";
    ctaLabel = itemCount > 0 ? "Review quote" : "Choose how to start";
    onClick = itemCount > 0 ? onReviewQuote : onFinishItem;
    statusTone = "border-black/10 bg-white text-[#5c5a56]";
    panelTone = "border-[#8CA99B] bg-[#F7F8F6]";
    ctaDisabled = true;
  } else if (readingDocs > 0) {
    // Project-level processing (bar = project state; rail chips = which file).
    // The "N ready" claim is suppressed — it would assert a total about to
    // change — but the CTA stays live: reading never blocks the customer.
    const docs = `${readingDocs} document${readingDocs !== 1 ? "s" : ""}`;
    status = <><Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" aria-hidden="true" /><span>Reading {docs}…</span></>;
    live = `Reading ${docs}`;
    ctaLabel = itemCount > 0 ? "Review quote" : "Choose how to start";
    onClick = itemCount > 0 ? onReviewQuote : onFinishItem;
    statusTone = "border-black/10 bg-white text-[#5c5a56]";
    panelTone = "border-[#8CA99B] bg-[#F7F8F6]";
    ctaDisabled = true;
  } else if (itemCount === 0 && !editingItem) {
    status = <span>No items added yet</span>;
    live = "No items added yet";
    ctaLabel = "Choose how to start";
    onClick = onFinishItem;
    statusTone = "border-black/10 bg-white text-[#5c5a56]";
    panelTone = "border-[#8CA99B] bg-[#F7F8F6]";
  } else if (itemCount === 0 && editingItem) {
    // The only case where the in-progress item leads — there is nothing else to report.
    status = <><AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" /><span>Adding your first item</span></>;
    live = "Adding your first item";
    ctaLabel = "Finish item";
    onClick = onFinishItem;
    statusTone = "border-amber-300 bg-amber-100 text-amber-900";
    panelTone = "border-amber-400 bg-amber-50";
    ctaTone = "bg-amber-700 hover:bg-amber-800 focus-visible:ring-amber-600";
  } else if (attentionCount > 0) {
    status = (
      <>
        <span className="border border-black/10 bg-white px-2 py-1 text-[#5c5a56] whitespace-nowrap">
          {items(itemCount)}
        </span>
        {/* With warnings present the "ready" chip is dropped: three counts stop
            summing legibly, and errors are what the CTA acts on. */}
        {!confirmChip && (
          <span className="flex items-center gap-1 border border-[#5A7A6A]/30 bg-[#5A7A6A]/10 px-2 py-1 text-[#355344] whitespace-nowrap">
            <Check className="w-3.5 h-3.5" aria-hidden="true" />{readyCount} ready
          </span>
        )}
        <span className="flex items-center gap-1 border border-amber-300 bg-amber-100 px-2 py-1 text-amber-900 whitespace-nowrap">
          <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
          {attentionCount} need your details
        </span>
        {confirmChip}
        {addingChip}
      </>
    );
    live = `${attentionCount} need your details${technicalCount ? `, ${technicalCount} we'll confirm at review` : ""}.`;
    ctaLabel = attentionCount === 1 ? "Review issue" : "Review issues";
    onClick = onReviewIssues;
    statusTone = "border-transparent bg-transparent text-[#131311] p-0 flex-wrap";
    panelTone = "border-amber-400 bg-[#F7F8F6]";
    ctaTone = "bg-amber-700 hover:bg-amber-800 focus-visible:ring-amber-600";
  } else if (pendingPriceCount > 0) {
    status = (
      <>
        <span className="flex items-center gap-1 border border-[#5A7A6A]/30 bg-[#5A7A6A]/10 px-2 py-1 text-[#355344] whitespace-nowrap">
          <Check className="w-3.5 h-3.5" aria-hidden="true" />{readyCount} priced
        </span>
        <span className="flex items-center gap-1 border border-amber-300 bg-amber-100 px-2 py-1 text-amber-900 whitespace-nowrap">
          <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />{pendingPriceCount} pending AMJ price
        </span>
        {addingChip}
      </>
    );
    live = `${pendingPriceCount} of ${items(itemCount)} pending AMJ pricing`;
    ctaLabel = "Review quote";
    onClick = onReviewQuote;
    statusTone = "border-transparent bg-transparent text-[#131311] p-0 flex-wrap";
    panelTone = "border-amber-400 bg-[#F7F8F6]";
  } else {
    // Nothing blocks. If warnings remain, the bar must NOT claim a clean sweep —
    // it splits the count and wears a slate top-border (caveats, not a demand).
    status = (
      <>
        <span className="flex items-center gap-1 border border-[#5A7A6A]/30 bg-[#5A7A6A]/10 px-2 py-1 text-[#355344] whitespace-nowrap">
          <Check className="w-3.5 h-3.5" aria-hidden="true" />{confirmChip ? `${readyCount} ready` : `${items(itemCount)} ready`}
        </span>
        {confirmChip}
        {addingChip}
      </>
    );
    live = confirmChip
      ? `${readyCount} ready, ${technicalCount} we'll confirm at review.`
      : `${items(itemCount)} ready`;
    ctaLabel = "Review quote";
    onClick = onReviewQuote;
    statusTone = "border-transparent bg-transparent text-[#131311] p-0 flex-wrap";
    panelTone = confirmChip ? "border-[#4C6A88] bg-[#F7F8F6]" : "border-[#5A7A6A] bg-[#F7F8F6]";
  }

  return (
    <section role="region" aria-label="Current quote summary"
      className={`sticky bottom-0 z-40 border-t-[3px] border-b border-b-black/10 ${panelTone}`}
      style={{
        boxShadow: "0 -10px 28px rgba(19,19,17,0.16)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
      {/* Polite, atomic summary for assistive tech — not the whole panel. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {pendingPriceCount ? "Priced-items subtotal" : "Indicative estimate"} {fmt(shownTotal)} {gstSuffix(gstMode)}. {live}.
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 sm:py-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center justify-between gap-3 min-w-0 sm:contents">
          <div className="sm:order-2 flex flex-col min-w-0 flex-shrink-0">
            <span className="text-[9px] uppercase tracking-[0.16em] text-[#6f6c67] leading-none mb-1">{pendingPriceCount ? "Priced subtotal" : "Estimate"}</span>
            <span className="flex items-baseline gap-1.5">
            <span className="text-[#131311] text-lg sm:text-[17px] font-semibold leading-none tabular-nums"
              style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(shownTotal)}</span>
            <span className="text-[#6f6c67] text-xs whitespace-nowrap">{gstSuffix(gstMode)}</span>
            </span>
          </div>
          <div className={`sm:order-1 sm:flex-1 flex items-center gap-1.5 min-w-0 border px-2.5 py-2 text-[13px] font-medium ${statusTone}`}>{status}</div>
        </div>
        <div className="sm:order-3">
          <Btn variant="sage" size="md" onClick={onClick} disabled={ctaDisabled}
            className={`w-full sm:w-auto justify-center min-h-[44px] whitespace-nowrap shadow-sm ${ctaTone}`}>
            {ctaLabel} {ctaDisabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          </Btn>
        </div>
      </div>
    </section>
  );
}
