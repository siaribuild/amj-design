// ═══════════════════════════════════════════════════════════════════════════════
// QUOTE REVIEW & ACCEPT — the acceptance gate (spec §6).
//
// Acts on an IMMUTABLE issued revision: what-happens-when-you-accept panel with a
// confirm preview (deposit invoice + order creation spelled out), an honest
// request-changes path (returns the quote to Under review → a new revision), the
// priced schedule-code line list with ex-GST/GST/inc-GST/deposit totals, and the
// revision history with superseded revisions struck through and non-actionable.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { ChevronDown, Check, Clock, Loader2, Lock, PenLine } from "lucide-react";
import { type Page, Btn } from "../app/ui";
import {
  getProject, getRevisions, getProjectFiles, acceptRevision, requestChanges,
  type ApiRevision, type ApiFile, type CurrentProject,
} from "../data/api";
import {
  StatusPill, SupersededPill, TONE, money, fmtDate, parseLine, useAccount,
} from "./accountModel";
import {
  BackLink, Blk, ConfirmDetails, ContactCard, FilesBlock, LineList, SummaryBand,
} from "./RecordDetailPage";
import type { TrackFocus } from "./OrderTrackingPage";

const VALIDITY_DAYS = 14; // display policy: issued quotes are honoured for 14 days

export function QuoteReviewPage({ projectId, setPage, backToList, onOpenRecord }: {
  projectId: string; setPage: (p: Page) => void; backToList: () => void;
  onOpenRecord: (rec: TrackFocus) => void;
}) {
  const { refresh } = useAccount();
  const [data, setData] = useState<CurrentProject | null>(null);
  const [revisions, setRevisions] = useState<ApiRevision[] | null>(null);
  const [files, setFiles] = useState<ApiFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let off = false;
    getProject(projectId).then((r) => { if (!off) setData(r); }).catch(() => { if (!off) setMissing(true); });
    getRevisions(projectId).then((r) => { if (!off) setRevisions(r.revisions); }).catch(() => { if (!off) setMissing(true); });
    getProjectFiles(projectId).then((r) => { if (!off) setFiles(r.files); }).catch(() => {});
    return () => { off = true; };
  }, [projectId]);

  if (missing) return <div className="card p-8 text-sm text-body">We couldn't find that quote.</div>;
  if (!data?.project || revisions === null) return <div className="card p-8 text-sm text-body">Loading your quote…</div>;

  const p = data.project;
  const current = revisions.find((r) => r.status === "issued");
  if (!current) {
    // Issued revision no longer live (accepted elsewhere / changes requested).
    return (
      <>
        <BackLink onClick={backToList} />
        <div className="card p-8 text-sm text-body">This quote is not awaiting your decision any more — check the dashboard for its current state.</div>
      </>
    );
  }

  const lines = current.lines.map(parseLine);
  const total = current.total;
  const ex = Math.round((total / 1.1) * 100) / 100;
  const gst = Math.round((total - ex) * 100) / 100;
  const deposit = Math.round(total / 2);
  const balance = total - deposit;
  const issued = new Date(current.issuedAt.includes("T") ? current.issuedAt : current.issuedAt.replace(" ", "T") + "Z");
  const validUntil = new Date(+issued + VALIDITY_DAYS * 86400_000);
  const daysLeft = Math.max(0, Math.ceil((+validUntil - Date.now()) / 86400_000));
  const R = `R${current.revisionNo}`;

  const accept = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const r = await acceptRevision(current.id);
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
      await requestChanges(current.id, reason.trim());
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
            {p.ref && <span className="text-[13px] font-medium text-sage" style={{ fontFamily: "'DM Mono', monospace" }}>{p.ref}</span>}
            <StatusPill tone="attn">Quote ready · awaiting you</StatusPill>
          </div>
          <h1 className="font-semibold text-ink leading-[1.05]" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.55rem,3.4vw,2rem)" }}>{p.title}</h1>
          <div className="flex gap-x-4 gap-y-2 flex-wrap items-center text-[13.5px] text-body mt-2">
            <span className="inline-flex items-center gap-1.5 border border-black/10 px-2 py-[3px] text-[11.5px]" style={{ fontFamily: "'DM Mono', monospace" }}>
              <Lock className="w-3 h-3 text-sage" />Immutable · Revision {R}
            </span>
            <span>Issued <span className="text-ink" style={{ fontFamily: "'DM Mono', monospace" }}>{fmtDate(current.issuedAt)}</span></span>
            <span>Valid until <span className="text-ink" style={{ fontFamily: "'DM Mono', monospace" }}>{fmtDate(validUntil.toISOString())}</span> · <span style={{ fontFamily: "'DM Mono', monospace", color: TONE.attn.text }}>{daysLeft} days left</span></span>
          </div>
        </div>
        <Btn variant="ghost" size="sm" onClick={() => { setPage("contact"); window.scrollTo(0, 0); }}>Message us</Btn>
      </div>

      <div className="flex flex-col gap-[26px]">
        {/* The decision gate */}
        <section className="p-5 border" style={{ borderColor: TONE.attn.bd, borderLeft: `3px solid ${TONE.attn.text}`, background: `linear-gradient(180deg, ${TONE.attn.bg}, rgba(178,110,15,.03))` }}>
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <StatusPill tone="attn">Your decision</StatusPill>
            <span className="text-[11.5px] text-body" style={{ fontFamily: "'DM Mono', monospace" }}>Nothing is charged until you accept</span>
          </div>
          <h2 className="text-lg font-semibold text-ink mb-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Review &amp; accept quote {R}</h2>
          <p className="text-[13.5px] text-body max-w-[60ch]">
            Accepting starts your order. We then invoice a <b className="text-ink">50% deposit of {money(deposit)}</b> to begin — the remaining <b className="text-ink">50% ({money(balance)}) is due before despatch</b>, after we share quality photos. Accepting locks in this revision's prices and specification. <b className="text-ink">Nothing is charged until you accept.</b>
          </p>
          <div className="bg-white border p-[13px] mt-3.5" style={{ borderColor: TONE.attn.bd }}>
            <p className="text-xs text-body mb-1.5" style={{ fontFamily: "'DM Mono', monospace" }}>ON ACCEPTANCE →</p>
            <p className="text-[13px] text-body"><b className="text-ink">Order created</b> → 50% deposit invoice → shop drawings for your sign-off → manufacturing → quality photos → 50% balance → delivery. You'll track every step on the order screen.</p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap mt-[15px]">
            <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ fontFamily: "'DM Mono', monospace", color: TONE.pos.text }}><Check className="w-3 h-3" />No card details needed to review</span>
          </div>
          {error && <p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}

          <ConfirmDetails
            summary={`Preview what happens when you accept ${R}`}
            receipt={[
              { label: "Quote total (inc GST)", value: money(total) },
              { label: "Deposit invoiced now — 50%", value: money(deposit), big: true },
              { label: "Balance due before despatch — 50%", value: money(balance) },
            ]}
            lines={[
              `You accept revision ${R} at the prices and specification shown below.`,
              `An order is created and a 50% deposit invoice for ${money(deposit)} is issued. No payment is taken automatically — you pay by bank transfer from the order screen.`,
              "We then prepare shop drawings for your sign-off before anything is manufactured.",
            ]}
            action={`Confirm & accept quote ${R}`} busy={busy} onConfirm={accept} />

          {/* Request changes — honest about the state move */}
          <details className="border bg-white mt-3.5" style={{ borderColor: TONE.work.bd }}>
            <summary className="list-none cursor-pointer px-4 py-3 flex items-center gap-2.5 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
              <PenLine className="w-4 h-4 text-sage" />Request changes instead
              <ChevronDown className="w-4 h-4 ml-auto text-body" />
            </summary>
            <div className="px-4 pb-4 border-t border-black/[0.07]">
              <label htmlFor="req-changes" className="block text-[13px] font-semibold text-ink mt-3">What would you like changed?</label>
              <textarea id="req-changes" value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                placeholder="e.g. Swap D01 to a 3-panel stacker; change W05 glazing to obscure…"
                className="w-full card px-3 py-[11px] text-sm text-ink outline-none focus:border-sage resize-y min-h-[76px] my-2" />
              <p className="flex items-start gap-2 text-[12.5px] text-body leading-normal">
                <Clock className="w-[15px] h-[15px] flex-shrink-0 mt-px" style={{ color: TONE.work.text }} />
                <span>Sending this moves the quote back to <b className="text-ink">Under review</b>. {R} stays on file, unchanged — We will issue a new revision with your changes for you to accept. No cost to request changes.</span>
              </p>
              <Btn variant="outline" size="md" onClick={sendChanges} disabled={busy || !reason.trim()} className="w-full justify-center mt-3">Send change request</Btn>
            </div>
          </details>
        </section>

        {/* Priced lines */}
        <Blk eyebrow="Schedule" title="Quoted lines" right={`Revision ${R} · anchored by schedule code`} id="rec-lines">
          <LineList lines={lines} total={null} showUnit footerLabel={`${lines.length} line${lines.length === 1 ? "" : "s"} · prices inc GST`} />
          <div className="bg-sage/[0.07] border-t border-black/10 px-5 py-[15px] flex flex-col gap-[9px]">
            <TotalRow label="Subtotal (ex GST)" value={money(ex)} />
            <TotalRow label="GST 10%" value={money(gst)} />
            <TotalRow label="Total (inc GST)" value={money(total)} big />
            <TotalRow label="50% deposit to begin" value={money(deposit)} attn />
          </div>
        </Blk>

        {/* Revision history */}
        <Blk eyebrow="History" title="Revision history" right="Issued revisions are immutable">
          {revisions.map((r) => {
            const isCurrent = r.id === current.id;
            return (
              <div key={r.id} className="flex items-center gap-[13px] px-5 py-[13px] border-b border-black/[0.07] last:border-b-0">
                <span className={`w-[30px] font-medium text-[13px] ${isCurrent ? "text-ink" : "line-through"}`} style={{ fontFamily: "'DM Mono', monospace", color: isCurrent ? undefined : TONE.mute.text, textDecorationColor: TONE.mute.bd }}>R{r.revisionNo}</span>
                <span className={`flex-1 text-[13px] ${isCurrent ? "text-body" : "line-through"}`} style={{ color: isCurrent ? undefined : TONE.mute.text, textDecorationColor: TONE.mute.bd }}>
                  {isCurrent ? `Current · issued ${fmtDate(r.issuedAt)} · ${money(r.total)}` : `Superseded · issued ${fmtDate(r.issuedAt)} — kept on file, view only`}
                </span>
                {isCurrent ? <StatusPill tone="attn">Awaiting you</StatusPill> : <SupersededPill />}
              </div>
            );
          })}
        </Blk>

        <FilesBlock files={files} />
        <SummaryBand>
          <div className="flex-1 basis-[250px] card p-[18px]">
            <h3 className="text-[13px] tracking-[0.1em] uppercase text-body font-medium mb-3.5" style={{ fontFamily: "'DM Mono', monospace" }}>This quote · {R}</h3>
            <div className="flex justify-between pb-3 text-sm"><span>Total inc GST</span><span className="font-semibold text-base" style={{ fontFamily: "'DM Mono', monospace", fontVariantNumeric: "tabular-nums" }}>{money(total)}</span></div>
            <div className="flex justify-between py-[9px] border-t border-black/[0.07] text-[13.5px]"><span className="text-body">Deposit to begin</span><span className="font-medium" style={{ fontFamily: "'DM Mono', monospace", fontVariantNumeric: "tabular-nums", color: TONE.attn.text }}>{money(deposit)}</span></div>
            <div className="flex justify-between py-[9px] border-t border-black/[0.07] text-[13.5px]"><span className="text-body">Balance before despatch</span><span className="font-medium" style={{ fontFamily: "'DM Mono', monospace", fontVariantNumeric: "tabular-nums" }}>{money(balance)}</span></div>
            <div className="flex justify-between py-[9px] border-t border-black/[0.07] text-[13.5px]"><span className="text-body inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" style={{ color: TONE.attn.text }} />Valid until {fmtDate(validUntil.toISOString())}</span><span style={{ fontFamily: "'DM Mono', monospace", color: TONE.attn.text }}>{daysLeft} days</span></div>
          </div>
          <ContactCard setPage={setPage} />
          <div className="flex-1 basis-[250px] card p-[18px]">
            <h3 className="text-[13px] tracking-[0.1em] uppercase text-body font-medium mb-3.5" style={{ fontFamily: "'DM Mono', monospace" }}>Good to know</h3>
            <p className="text-[13px] text-body leading-relaxed">Issued revisions can't be edited — accepting is always against a specific revision. Requesting changes returns the quote to <b className="text-ink">Under review</b> and we issue a fresh revision. Nothing is charged until you accept.</p>
          </div>
        </SummaryBand>
      </div>
    </>
  );
}

function TotalRow({ label, value, big, attn }: { label: string; value: string; big?: boolean; attn?: boolean }) {
  return (
    <div className={`flex justify-between ${big ? "border-t border-black/10 pt-[11px] mt-0.5 text-[15.5px] font-semibold text-ink" : "text-[13.5px] text-body"}`}
      style={attn ? { color: TONE.attn.text } : undefined}>
      <span>{label}</span>
      <span className={big ? "text-lg" : "font-medium"} style={{ fontFamily: "'DM Mono', monospace", fontVariantNumeric: "tabular-nums", color: attn ? TONE.attn.text : big ? undefined : "var(--ink)" }}>{value}</span>
    </div>
  );
}
