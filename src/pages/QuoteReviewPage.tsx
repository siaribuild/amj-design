// ═══════════════════════════════════════════════════════════════════════════════
// QUOTE REVIEW & ACCEPT — the acceptance gate (spec §6).
//
// Acts on the ONE issued quote a project has (docs/quote-revisions-removal-
// plan.md, owner decision 2026-08-14 — "a quote is a quote"): what-happens-
// when-you-accept panel with a confirm preview (deposit invoice + order
// creation spelled out), an honest request-changes path (returns the quote to
// Under review — staff revise the SAME quote and re-issue it), and the priced
// schedule-code line list with its GST/deposit totals.
//
// NO REVISION HISTORY. There is nothing to list any more — one quote, updated
// in place. The customer is deciding on what is in front of them, and ops
// reads activity history in the record, so a superseded-revisions list was a
// block neither side used.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { ChevronDown, Check, Clock, Loader2, Lock, PenLine } from "lucide-react";
import { type Page, Btn } from "../app/ui";
import {
  getProject, getQuote, getProjectFiles, acceptQuote, requestChanges,
  type ApiQuote, type ApiFile, type CurrentProject,
} from "../data/api";
import {
  StatusPill, TONE, money, fmtDate, type ParsedLine, useAccount,
} from "./accountModel";
import { taxBreakdown, useGstMode } from "../data/gst";
import {
  BackLink, Blk, ConfirmDetails, ContactCard, FilesBlock, LineList, SummaryBand, TotalRow,
} from "./RecordDetailPage";
import { getProductBySlug } from "../data/catalogue";
import type { TrackFocus } from "./OrderTrackingPage";

const VALIDITY_DAYS = 14; // display policy: issued quotes are honoured for 14 days

export function QuoteReviewPage({ projectId, setPage, backToList, onOpenRecord }: {
  projectId: string; setPage: (p: Page) => void; backToList: () => void;
  onOpenRecord: (rec: TrackFocus) => void;
}) {
  const { refresh } = useAccount();
  const gstMode = useGstMode();
  const [data, setData] = useState<CurrentProject | null>(null);
  const [quote, setQuote] = useState<ApiQuote | null>(null);
  const [files, setFiles] = useState<ApiFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let off = false;
    getProject(projectId).then((r) => { if (!off) setData(r); }).catch(() => { if (!off) setMissing(true); });
    getQuote(projectId).then((r) => { if (!off) setQuote(r); }).catch(() => { if (!off) setMissing(true); });
    getProjectFiles(projectId).then((r) => { if (!off) setFiles(r.files); }).catch(() => {});
    return () => { off = true; };
  }, [projectId]);

  if (missing) return <div className="card p-8 text-body t-bd-sm">We couldn't find that quote.</div>;
  if (!data?.project || !quote) return <div className="card p-8 text-body t-bd-sm">Loading your quote…</div>;

  const p = data.project;
  if (!quote.live) {
    // Quote no longer live (accepted elsewhere / changes requested).
    return (
      <>
        <BackLink onClick={backToList} />
        <div className="card p-8 text-body t-bd-sm">This quote is not awaiting your decision any more — check the dashboard for its current state.</div>
      </>
    );
  }
  const current = quote;

  // Same read as the live draft (loadLines server-side) — productName isn't on
  // the wire shape, only productSlug, so it is resolved here the same way the
  // draft builder does.
  const lines: ParsedLine[] = current.lines.map((l) => ({
    code: l.code || "—",
    room: l.location || null,
    productName: getProductBySlug(l.productSlug)?.name ?? l.productSlug,
    optionsSummary: ["colour", "finish", "glass", "hardware"]
      .map((k) => l.options[k]).filter(Boolean).slice(0, 2).join(" · ")
      || Object.values(l.options).filter(Boolean).slice(0, 2).join(" · "),
    width: l.width, height: l.height,
    qty: l.qty, lineTotal: l.lineTotal,
  }));
  const total = current.total; // goods + delivery (C8), always GST-inclusive
  // The account's own preference (App provides it from user.priceGstMode).
  // Everything on this screen used to be hardcoded inc-GST, so an ex-GST
  // account was shown inc-GST prices under inc-GST labels — correct numbers
  // answering a question the customer had not asked.
  // Per LINE, not off current.goods: GST is worked out on each taxable supply
  // and summed (see taxBreakdown), which is also what makes the line prices
  // above add up to the subtotal below them.
  const tax = taxBreakdown(gstMode, {
    lineTotalsInc: current.lines.map((l) => l.lineTotal ?? 0),
    deliveryInc: current.delivery,
    totalInc: total,
  });
  // Server-computed (0043) — one deposit percentage, not this screen's own
  // Math.round(total / 2) — and computed on the INCLUSIVE total, which is what
  // the customer actually transfers, in either display mode.
  const deposit = current.deposit;
  const balance = current.balance;
  const issued = new Date((current.issuedAt ?? new Date().toISOString()).includes("T") ? current.issuedAt! : current.issuedAt!.replace(" ", "T") + "Z");
  const validUntil = new Date(+issued + VALIDITY_DAYS * 86400_000);
  const daysLeft = Math.max(0, Math.ceil((+validUntil - Date.now()) / 86400_000));

  const accept = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const r = await acceptQuote(projectId);
      refresh();
      onOpenRecord({ orderId: r.order.id });
      window.scrollTo(0, 0);
    } catch {
      setError("We couldn't accept this quote — it may have just changed. Refresh and try again.");
      setBusy(false);
    }
  };

  const sendChanges = async () => {
    if (busy || !reason.trim()) return;
    setBusy(true); setError("");
    try {
      await requestChanges(projectId, reason.trim());
      refresh();
      onOpenRecord({ projectId, status: "under_review" });
      window.scrollTo(0, 0);
    } catch {
      setError("We couldn't send the change request. Try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <BackLink onClick={backToList} />
      <div className="flex justify-between items-start gap-5 flex-wrap pb-[22px] border-b border-black/10 mb-[26px]">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
            {p.ref && <span className="font-medium text-sage font-data t-data">{p.ref}</span>}
            <StatusPill tone="attn">Quote ready · awaiting you</StatusPill>
          </div>
          <h1 className="text-ink t-hd1">{p.title}</h1>
          <div className="flex gap-x-4 gap-y-2 flex-wrap items-center text-body mt-2 t-cap">
            <span className="inline-flex items-center gap-1.5 border border-black/10 px-2 py-[3px] font-data t-data-sm">
              <Lock className="w-3 h-3 text-sage" />Locked while issued
            </span>
            <span>Issued <span className="text-ink font-data">{current.issuedAt ? fmtDate(current.issuedAt) : "—"}</span></span>
            <span>Valid until <span className="text-ink font-data">{fmtDate(validUntil.toISOString())}</span> · <span className="font-data" style={{ color: TONE.attn.text }}>{daysLeft} days left</span></span>
          </div>
        </div>
        <Btn variant="ghost" size="sm" onClick={() => { setPage("contact"); window.scrollTo(0, 0); }}>Message us</Btn>
      </div>

      <div className="flex flex-col gap-[26px]">
        {/* The decision gate */}
        <section className="p-5 border" style={{ borderColor: TONE.attn.bd, borderLeft: `3px solid ${TONE.attn.text}`, background: `linear-gradient(180deg, ${TONE.attn.bg}, rgba(178,110,15,.03))` }}>
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <StatusPill tone="attn">Your decision</StatusPill>
            <span className="text-body font-data t-data-sm">Nothing is charged until you accept</span>
          </div>
          <h2 className="font-semibold text-ink mb-1.5 font-display t-bd-lg">Review &amp; accept your quote</h2>
          <p className="text-body max-w-[60ch] t-cap">
            Accepting starts your order. We then invoice a <b className="text-ink">50% deposit of {money(deposit)}</b> to begin — the remaining <b className="text-ink">50% ({money(balance)}) is due before despatch</b>, after we share quality photos. Accepting locks in these prices and this specification. <b className="text-ink">Nothing is charged until you accept.</b>
          </p>
          <div className="bg-white border p-[13px] mt-3.5" style={{ borderColor: TONE.attn.bd }}>
            <p className="text-body mb-1.5 font-data t-data-sm">ON ACCEPTANCE →</p>
            <p className="text-body t-cap"><b className="text-ink">Order created</b> → 50% deposit invoice → shop drawings for your sign-off → manufacturing → quality photos → 50% balance → delivery. You'll track every step on the order screen.</p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap mt-[15px]">
            <span className="inline-flex items-center gap-1.5 t-cap font-data" style={{ color: TONE.pos.text }}><Check className="w-3 h-3" />No card details needed to review</span>
          </div>
          {error && <p role="alert" className="text-red-700 mt-3 t-bd-sm">{error}</p>}

          <ConfirmDetails
            summary="Preview what happens when you accept"
            receipt={[
              { label: `Windows and doors (${tax.suffix})`, value: money(tax.goods) },
              { label: `Delivery to ${current.deliveryPostcode ?? "your site"} (${tax.suffix})`, value: tax.delivery === 0 ? "$0" : money(tax.delivery) },
              { label: tax.gstLabel, value: money(tax.gst) },
              // The last thing read before an irreversible click, so the two
              // figures that are about to become money owed are stated on the
              // inclusive total in either mode — never the ex-GST reading.
              { label: "Quote total (inc GST)", value: money(total) },
              { label: "Deposit invoiced now — 50%", value: money(deposit), big: true },
              { label: "Balance due before despatch — 50%", value: money(balance) },
            ]}
            lines={[
              "You accept this quote at the prices and specification shown below.",
              `An order is created and a 50% deposit invoice for ${money(deposit)} is issued. No payment is taken automatically — you pay by bank transfer from the order screen.`,
              "We then prepare shop drawings for your sign-off before anything is manufactured.",
            ]}
            action="Confirm & accept quote" busy={busy} onConfirm={accept} />

          {/* Request changes — honest about the state move */}
          <details className="border bg-white mt-3.5" style={{ borderColor: TONE.work.bd }}>
            <summary className="list-none cursor-pointer px-4 py-3 flex items-center gap-2.5 font-medium text-ink [&::-webkit-details-marker]:hidden t-bd-sm">
              <PenLine className="w-4 h-4 text-sage" />Request changes instead
              <ChevronDown className="w-4 h-4 ml-auto text-body" />
            </summary>
            <div className="px-4 pb-4 border-t border-black/[0.07]">
              <label htmlFor="req-changes" className="block font-semibold text-ink mt-3 t-cap">What would you like changed?</label>
              <textarea id="req-changes" value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                placeholder="e.g. Swap D01 to a 3-panel stacker; change W05 glazing to obscure…"
                className="w-full card px-3 py-[11px] text-ink outline-none focus:border-sage resize-y min-h-[76px] my-2 t-bd-sm" />
              <p className="flex items-start gap-2 text-body t-cap">
                <Clock className="w-[15px] h-[15px] flex-shrink-0 mt-px" style={{ color: TONE.work.text }} />
                <span>Sending this moves the quote back to <b className="text-ink">Under review</b>. We will revise it and re-issue it for you to accept. No cost to request changes.</span>
              </p>
              <Btn variant="outline" size="md" onClick={sendChanges} disabled={busy || !reason.trim()} className="w-full justify-center mt-3">Send change request</Btn>
            </div>
          </details>
        </section>

        {/* Priced lines */}
        <Blk eyebrow="Schedule" title="Quoted lines" right="Anchored by schedule code" id="rec-lines">
          <LineList lines={lines} total={null} showUnit footerLabel={`${lines.length} line${lines.length === 1 ? "" : "s"} · prices ${tax.suffix}`} />
          <div className="bg-sage/[0.07] border-t border-black/10 px-5 py-[15px] flex flex-col gap-[9px]">
            <TotalRow label={`Windows and doors (${tax.suffix})`} value={money(tax.goods)} />
            <TotalRow label={`Delivery to ${current.deliveryPostcode ?? "your site"} (${tax.suffix})`} value={tax.delivery === 0 ? "$0" : money(tax.delivery)} />
            <TotalRow label={tax.gstLabel} value={money(tax.gst)} />
            <TotalRow label="Total (inc GST)" value={money(total)} big />
            <TotalRow label="50% deposit to begin" value={money(deposit)} attn />
          </div>
        </Blk>

        <FilesBlock files={files} />
        <SummaryBand>
          <div className="flex-1 basis-[250px] card p-[18px]">
            <h3 className="text-body mb-3.5 font-data t-label">This quote</h3>
            <div className="flex justify-between pb-3 t-bd-sm"><span>Total inc GST</span><span className="font-semibold t-bd font-data">{money(total)}</span></div>
            <div className="flex justify-between py-[9px] border-t border-black/[0.07] t-cap"><span className="text-body">Deposit to begin</span><span className="font-medium font-data" style={{ color: TONE.attn.text }}>{money(deposit)}</span></div>
            <div className="flex justify-between py-[9px] border-t border-black/[0.07] t-cap"><span className="text-body">Balance before despatch</span><span className="font-medium font-data">{money(balance)}</span></div>
            <div className="flex justify-between py-[9px] border-t border-black/[0.07] t-cap"><span className="text-body inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" style={{ color: TONE.attn.text }} />Valid until {fmtDate(validUntil.toISOString())}</span><span className="font-data" style={{ color: TONE.attn.text }}>{daysLeft} days</span></div>
          </div>
          <ContactCard setPage={setPage} />
          <div className="flex-1 basis-[250px] card p-[18px]">
            <h3 className="text-body mb-3.5 font-data t-label">Good to know</h3>
            <p className="text-body t-cap">An issued quote can't be edited — accepting is always against what is shown here. Requesting changes returns it to <b className="text-ink">Under review</b> for us to revise and re-issue. Nothing is charged until you accept.</p>
          </div>
        </SummaryBand>
      </div>
    </>
  );
}

