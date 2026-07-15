// ═══════════════════════════════════════════════════════════════════════════════
// STICKY QUOTE SUMMARY PANEL
// A persistent bottom bar for the quote builder. Answers three questions at all
// times: what is the estimate, is the quote ready, what to do next. It reuses the
// page's existing totals / validation — it does not recompute business logic.
//
// It stays present throughout the build flow so estimate, status and next action
// always have a stable home. It only steps aside for the mobile on-screen keyboard.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { ArrowRight, AlertCircle, Check } from "lucide-react";
import { Btn } from "../app/ui";
import { fmt } from "../data/configurator";

export type StickyQuotePanelProps = {
  itemCount: number;
  attentionCount: number;        // blocking items the customer must fix
  total: number;
  editingItem: boolean;          // a new item is being composed but not yet saved
  onReviewQuote: () => void;
  onReviewIssues: () => void;
  onFinishItem: () => void;
};

export function StickyQuotePanel({
  itemCount, attentionCount, total, editingItem,
  onReviewQuote, onReviewIssues, onFinishItem,
}: StickyQuotePanelProps) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Detect the on-screen keyboard via visualViewport (mobile) and step out of the way.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onChange = () => setKeyboardVisible(window.innerHeight - vv.height > 160);
    onChange();
    vv.addEventListener("resize", onChange);
    vv.addEventListener("scroll", onChange);
    return () => { vv.removeEventListener("resize", onChange); vv.removeEventListener("scroll", onChange); };
  }, []);

  if (keyboardVisible) return null;

  const readyCount = Math.max(0, itemCount - attentionCount);
  const items = (c: number) => `${c} item${c !== 1 ? "s" : ""}`;

  let status: React.ReactNode;
  let live: string;
  let ctaLabel: string;
  let onClick: () => void;
  let statusTone: string;
  let panelTone: string;
  let ctaTone = "";

  if (itemCount === 0 && !editingItem) {
    status = <span>No items added yet</span>;
    live = "No items added yet";
    ctaLabel = "Choose how to start";
    onClick = onFinishItem;
    statusTone = "border-black/10 bg-white text-[#5c5a56]";
    panelTone = "border-[#8CA99B] bg-[#F7F8F6]";
  } else if (editingItem) {
    status = <><AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" /><span>Current item incomplete</span></>;
    live = "Current item incomplete";
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
        <span className="flex items-center gap-1 border border-[#5A7A6A]/30 bg-[#5A7A6A]/10 px-2 py-1 text-[#355344] whitespace-nowrap">
          <Check className="w-3.5 h-3.5" aria-hidden="true" />{readyCount} ready
        </span>
        <span className="flex items-center gap-1 border border-amber-300 bg-amber-100 px-2 py-1 text-amber-900 whitespace-nowrap">
          <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
          {attentionCount} need{attentionCount === 1 ? "s" : ""} attention
        </span>
      </>
    );
    live = `${attentionCount} of ${items(itemCount)} need attention`;
    ctaLabel = attentionCount === 1 ? "Review issue" : "Review issues";
    onClick = onReviewIssues;
    statusTone = "border-transparent bg-transparent text-[#131311] p-0 flex-wrap";
    panelTone = "border-amber-400 bg-[#F7F8F6]";
    ctaTone = "bg-amber-700 hover:bg-amber-800 focus-visible:ring-amber-600";
  } else {
    status = (
      <>
        <Check className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <span className="truncate">{items(itemCount)} ready</span>
      </>
    );
    live = `${items(itemCount)} ready`;
    ctaLabel = "Review quote";
    onClick = onReviewQuote;
    statusTone = "border-[#5A7A6A]/30 bg-[#5A7A6A]/10 text-[#355344]";
    panelTone = "border-[#5A7A6A] bg-[#F7F8F6]";
  }

  return (
    <section role="region" aria-label="Current quote summary"
      className={`fixed inset-x-0 bottom-0 z-40 border-t-[3px] border-b border-b-black/10 ${panelTone}`}
      style={{
        boxShadow: "0 -10px 28px rgba(19,19,17,0.16)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
      {/* Polite, atomic summary for assistive tech — not the whole panel. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Indicative estimate {fmt(total)}. {live}.
      </div>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-3 sm:py-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center justify-between gap-3 min-w-0 sm:contents">
          <div className="sm:order-2 flex flex-col min-w-0 flex-shrink-0">
            <span className="text-[9px] uppercase tracking-[0.16em] text-[#6f6c67] leading-none mb-1">Estimate</span>
            <span className="flex items-baseline gap-1.5">
            <span className="text-[#131311] text-lg sm:text-[17px] font-semibold leading-none tabular-nums"
              style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(total)}</span>
            <span className="text-[#6f6c67] text-xs whitespace-nowrap">inc GST</span>
            </span>
          </div>
          <div className={`sm:order-1 sm:flex-1 flex items-center gap-1.5 min-w-0 border px-2.5 py-2 text-[13px] font-medium ${statusTone}`}>{status}</div>
        </div>
        <div className="sm:order-3">
          <Btn variant="sage" size="md" onClick={onClick}
            className={`w-full sm:w-auto justify-center min-h-[44px] whitespace-nowrap shadow-sm ${ctaTone}`}>
            {ctaLabel} <ArrowRight className="w-4 h-4" />
          </Btn>
        </div>
      </div>
    </section>
  );
}
