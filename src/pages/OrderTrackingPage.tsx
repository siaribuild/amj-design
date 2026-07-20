// ═══════════════════════════════════════════════════════════════════════════════
// ORDER TRACKING — the customer view of the quote-to-delivery journey.
//
// Reflects OpenFrame's real process: accept the reviewed quote (deposit invoice issued),
// pay the 50% deposit, approve shop drawings, manufacturing, QA photos, pay the
// 50% balance, confirm OK to dispatch, delivery, after-sales. Payment is manual
// (bank transfer) for MVP — no card entry here.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { Check, ChevronLeft, Clock, FileText, Landmark, PenLine, Truck } from "lucide-react";
import { type Page, SAGE, WindowMark, Btn } from "../app/ui";
import { fmt, mm, productLabel } from "../data/configurator";
import { useGstMode, gstAdjust, gstSuffix } from "../data/gst";
import {
  getOrders, getRevisions, getProject, getCurrentProject, acceptRevision, confirmDrawings, confirmQa,
  getClarifications, replyClarification,
  type ApiOrder, type ApiRevision, type ApiClarification, type ApiItem,
} from "../data/api";

type TrackUser = { name: string; email: string } | null;
// Which record the customer chose to open (from the dashboard). When absent the
// page falls back to the most relevant record (an active order, else the draft).
export type TrackFocus = { orderId?: string; projectId?: string; status?: string } | null;

// The 12 order stages, in order, with customer-facing labels.
const STAGES: [string, string][] = [
  ["deposit_invoiced", "Deposit invoice issued"],
  ["deposit_paid", "Deposit received"],
  ["drawings_shared", "Shop drawings shared"],
  ["drawings_signed_off", "Drawings approved"],
  ["manufacturing", "In manufacturing"],
  ["qa_photos_shared", "Quality check — photos shared"],
  ["balance_invoiced", "Final balance invoice issued"],
  ["balance_paid", "Balance received"],
  ["customer_confirmed", "Confirmed for dispatch"],
  ["dispatched", "Dispatched"],
  ["delivered", "Delivered"],
  ["after_sales", "Completed — after-sales support"],
];

const snapshotName = (json: string) => {
  try { return JSON.parse(json).productName ?? "Product"; } catch { return "Product"; }
};

export function OrderTrackingPage({ setPage, user, focus }: { setPage: (p: Page) => void; user: TrackUser; focus?: TrackFocus }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<ApiOrder | null>(null);
  const [pending, setPending] = useState<ApiRevision | null>(null); // issued, not yet accepted
  const [projectStatus, setProjectStatus] = useState<string>("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [clarifications, setClarifications] = useState<ApiClarification[]>([]);
  // The submitted project as the customer sent it — so there's always a read-only
  // record to look at, even before any revision is issued.
  const [submitted, setSubmitted] = useState<{ title: string; items: ApiItem[] } | null>(null);

  // Load a specific project's quote state (issued revision to accept, or the
  // clarification thread). Shared by the focused-project path and the fallback.
  const loadProject = async (id: string, status: string) => {
    setProjectStatus(status); setProjectId(id);
    // Always pull the submitted lines so we can show what was sent for review.
    try { const { project, items } = await getProject(id); setSubmitted({ title: project.title, items }); }
    catch { setSubmitted(null); }
    if (status === "needs_information") {
      setClarifications((await getClarifications(id)).clarifications);
    } else {
      const { revisions } = await getRevisions(id);
      setPending(revisions.find(r => r.status === "issued") ?? null);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      // Open exactly the record the customer selected on the dashboard.
      if (focus?.orderId) {
        const { orders } = await getOrders();
        setOrder(orders.find(o => o.id === focus.orderId) ?? null);
        setPending(null);
      } else if (focus?.projectId) {
        await loadProject(focus.projectId, focus.status ?? "");
      } else {
        // No selection: prefer an active order, else the current draft/quote.
        const { orders } = await getOrders();
        if (orders.length) { setOrder(orders[0]); setPending(null); }
        else {
          const cp = await getCurrentProject();
          if (cp.project) await loadProject(cp.project.id, cp.project.status);
        }
      }
    } catch { /* not signed in / no data */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [focus?.orderId, focus?.projectId]);

  const reply = async (message: string) => {
    if (!projectId || busy) return;
    setBusy(true);
    try { await replyClarification(projectId, message); await load(); }
    finally { setBusy(false); }
  };

  const accept = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try { const r = await acceptRevision(pending.id); setOrder(r.order); setPending(null); }
    finally { setBusy(false); }
  };
  const doConfirm = async (fn: (id: string) => Promise<{ order: ApiOrder }>) => {
    if (!order || busy) return;
    setBusy(true);
    try { const r = await fn(order.id); setOrder(r.order); }
    finally { setBusy(false); }
  };

  return (
    <div className="relative min-h-screen bg-[#FAFAF9] pt-28 pb-24">
      <div className="max-w-3xl mx-auto px-6">
        <button onClick={() => go(user ? "dashboard" : "home")}
          className="text-xs text-[#5c5a56] hover:text-[#131311] flex items-center gap-1 cursor-pointer mb-6">
          <ChevronLeft className="w-4 h-4" />{user ? "Back to dashboard" : "Home"}
        </button>

        {loading ? (
          <p className="text-sm text-[#5c5a56]">Loading your order…</p>
        ) : !user ? (
          <EmptyState title="Sign in to view your order"
            body="Your quotes and orders are saved to your account."
            cta={<Btn variant="sage" size="md" onClick={() => go("login")}>Sign in</Btn>} />
        ) : order ? (
          <OrderView order={order} busy={busy}
            onConfirmDrawings={() => doConfirm(confirmDrawings)}
            onConfirmQa={() => doConfirm(confirmQa)} />
        ) : pending ? (
          <AcceptView rev={pending} busy={busy} onAccept={accept} />
        ) : projectStatus === "needs_information" ? (
          <>
            <ClarificationView items={clarifications} busy={busy} onReply={reply} />
            {submitted && <div className="mt-8"><SubmittedQuoteView title={submitted.title} items={submitted.items} status={projectStatus} /></div>}
          </>
        ) : submitted && submitted.items.length > 0 ? (
          <SubmittedQuoteView title={submitted.title} items={submitted.items} status={projectStatus} />
        ) : (
          <EmptyState title="No active order yet"
            body={projectStatus === "submitted" || projectStatus === "under_review"
              ? "Your project is with our team for review. We'll issue a reviewed quote shortly."
              : "Build a quote and submit it for review to get started."}
            cta={<Btn variant="sage" size="md" onClick={() => go("quote")}>Go to MyProject</Btn>} />
        )}
      </div>
    </div>
  );
}

// The customer's view when staff have asked a question ("Needs information").
function ClarificationView({ items, busy, onReply }: { items: ApiClarification[]; busy: boolean; onReply: (m: string) => void }) {
  const [msg, setMsg] = useState("");
  return (
    <div>
      <h1 className="text-2xl font-semibold text-[#131311] mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>We need a bit more information</h1>
      <p className="text-sm text-[#5c5a56] mb-6">Answer below and we'll continue reviewing your quote.</p>
      <div className="bg-white border border-black/8 divide-y divide-black/6 mb-4">
        {items.map((c, i) => (
          <div key={i} className={`px-5 py-3 ${c.author_type === "internal" ? "" : "bg-[#5A7A6A]/5"}`}>
            <p className="text-[11px] uppercase tracking-wide text-[#8b8880] mb-0.5">{c.author_type === "internal" ? "OpenFrame" : "You"}</p>
            <p className="text-sm text-[#131311]">{c.body}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={msg} autoFocus onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && (onReply(msg), setMsg(""))}
          placeholder="Type your answer…" className="flex-1 border border-black/12 px-3 py-2 text-sm outline-none focus:border-[#5A7A6A] bg-white" />
        <Btn variant="sage" size="md" onClick={() => { if (msg.trim()) { onReply(msg); setMsg(""); } }} className={busy || !msg.trim() ? "opacity-50 pointer-events-none" : ""}>Send</Btn>
      </div>
    </div>
  );
}

// Read-only view of the quote the customer submitted — visible while it's with
// the team for review, before any reviewed revision is issued.
const SUBMITTED_STATUS: Record<string, { label: string; note: string }> = {
  submitted:         { label: "Submitted for review", note: "Your project is with our team. We'll check the specifications and issue a reviewed quote — no deposit is required until you accept it." },
  under_review:      { label: "In review",            note: "Our team is reviewing your specifications and preparing a confirmed quote. We'll email you when it's ready to accept." },
  needs_information: { label: "More info requested",  note: "We've asked a question above. Here's the quote you submitted for reference." },
};

function SubmittedQuoteView({ title, items, status }: { title: string; items: ApiItem[]; status: string }) {
  const gstMode = useGstMode();
  const meta = SUBMITTED_STATUS[status] ?? SUBMITTED_STATUS.submitted;
  const total = items.reduce((s, it) => s + (it.lineTotal ?? 0), 0);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1 gap-3">
        <h1 className="text-2xl font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{title || "Your quote"}</h1>
        <span className="text-[11px] px-2 py-0.5 border border-amber-300 bg-amber-50 text-amber-800 whitespace-nowrap">{meta.label}</span>
      </div>
      <p className="text-sm text-[#5c5a56] mb-6 max-w-xl leading-relaxed">{meta.note}</p>
      <div className="bg-white border border-black/8 divide-y divide-black/6">
        {items.map((it, i) => (
          <div key={i} className="flex justify-between gap-3 px-5 py-3 text-sm">
            <span className="text-[#131311] min-w-0">
              <span className="font-mono text-[#5c5a56] mr-2">{it.code || String(i + 1).padStart(2, "0")}</span>
              {productLabel(it.productSlug)} · {mm(it.width)} × {mm(it.height)} ×{it.qty}
            </span>
            <span className="text-[#131311] flex-shrink-0" style={{ fontFamily: "'DM Mono', monospace" }}>
              {it.lineTotal != null ? fmt(gstAdjust(it.lineTotal, gstMode)) : "—"}
            </span>
          </div>
        ))}
        <div className="flex justify-between px-5 py-3 text-sm font-semibold">
          <span>Estimated total</span>
          <span style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(gstAdjust(total, gstMode))} {gstSuffix(gstMode)}</span>
        </div>
      </div>
      <p className="text-xs text-[#8b8880] mt-3">This is the estimate you submitted. Your confirmed quote may differ after our technical review.</p>
    </div>
  );
}

function EmptyState({ title, body, cta }: { title: string; body: string; cta: React.ReactNode }) {
  return (
    <div className="bg-white border border-black/8 p-8 text-center">
      <div className="flex justify-center mb-4"><WindowMark size={28} color={SAGE} /></div>
      <h1 className="text-xl font-semibold text-[#131311] mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{title}</h1>
      <p className="text-sm text-[#5c5a56] mb-6 max-w-sm mx-auto">{body}</p>
      {cta}
    </div>
  );
}

// The reviewed quote is ready — accept to proceed (issues the deposit invoice).
function AcceptView({ rev, busy, onAccept }: { rev: ApiRevision; busy: boolean; onAccept: () => void }) {
  const deposit = Math.round(rev.total * 0.5);
  return (
    <div>
      <h1 className="text-2xl font-semibold text-[#131311] mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Your reviewed quote is ready</h1>
      <p className="text-sm text-[#5c5a56] mb-6">Revision {rev.revisionNo} · issued for your approval</p>
      <div className="bg-white border border-black/8 divide-y divide-black/6">
        {rev.lines.map((l, i) => (
          <div key={i} className="flex justify-between gap-3 px-5 py-3 text-sm">
            <span className="text-[#131311]"><span className="font-mono text-[#5c5a56] mr-2">{l.external_ref}</span>{snapshotName(l.product_snapshot_json)} · ×{l.qty}</span>
            <span className="text-[#131311]" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(l.line_total)}</span>
          </div>
        ))}
        <div className="flex justify-between px-5 py-3 text-sm font-semibold">
          <span>Total inc GST</span><span style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(rev.total)}</span>
        </div>
      </div>
      <div className="bg-[#F2F0EC] border border-black/8 p-4 my-6 text-xs text-[#5c5a56] leading-relaxed">
        On acceptance we issue an invoice for a <strong>50% deposit ({fmt(deposit)})</strong> to begin shop drawings and manufacturing.
        The remaining 50% balance is invoiced after your quality check, before dispatch.
      </div>
      <div className="flex justify-end">
        <Btn variant="sage" size="lg" onClick={onAccept} className={busy ? "opacity-50 pointer-events-none" : ""}>
          {busy ? "Accepting…" : "Accept quote & proceed"}
        </Btn>
      </div>
    </div>
  );
}

function OrderView({ order, busy, onConfirmDrawings, onConfirmQa }: {
  order: ApiOrder; busy: boolean; onConfirmDrawings: () => void; onConfirmQa: () => void;
}) {
  const idx = order.stageIndex;
  const deposit = order.payments.find(p => p.kind === "deposit");
  const balance = order.payments.find(p => p.kind === "balance");
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="text-2xl font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Order {order.orderNo}</h1>
        <span className="text-sm text-[#5c5a56]" style={{ fontFamily: "'DM Mono', monospace" }}>{order.total != null ? fmt(order.total) : ""}</span>
      </div>
      <p className="text-sm text-[#5A7A6A] mb-6 flex items-center gap-1.5"><Clock className="w-4 h-4" />{order.stageLabel}</p>

      {/* Customer action gates */}
      {order.stage === "drawings_shared" && (
        <ActionCard icon={<PenLine className="w-4 h-4" />} title="Shop drawings ready for your approval"
          body="Review the shop drawings showing every window and door with dimensions, then confirm to release to manufacturing."
          cta={<Btn variant="sage" size="md" onClick={onConfirmDrawings} className={busy ? "opacity-50 pointer-events-none" : ""}>{busy ? "…" : "Approve drawings"}</Btn>} />
      )}
      {order.stage === "balance_paid" && (
        <ActionCard icon={<Truck className="w-4 h-4" />} title="Confirm OK to dispatch"
          body="Your pre-dispatch quality photos have been shared and the balance is settled. Confirm to schedule delivery (approx. 2 weeks)."
          cta={<Btn variant="sage" size="md" onClick={onConfirmQa} className={busy ? "opacity-50 pointer-events-none" : ""}>{busy ? "…" : "Confirm for dispatch"}</Btn>} />
      )}

      <OrderReadout order={order} />
    </div>
  );
}

// Read-only payments + stage tracker — shared by the account view and the guest
// tracking page (no action buttons).
export function OrderReadout({ order }: { order: ApiOrder }) {
  const idx = order.stageIndex;
  const deposit = order.payments.find(p => p.kind === "deposit");
  const balance = order.payments.find(p => p.kind === "balance");
  return (
    <>
      <div className="grid sm:grid-cols-2 gap-3 mb-8">
        {deposit && <PaymentCard title="Deposit" orderNo={order.orderNo} p={deposit} />}
        {balance && <PaymentCard title="Balance" orderNo={order.orderNo} p={balance} />}
      </div>
      <div className="bg-white border border-black/8 p-5">
        <p className="text-[10px] tracking-[0.2em] text-[#5c5a56] uppercase mb-4">Progress</p>
        <ol className="space-y-0">
          {STAGES.map(([key, label], i) => {
            const done = i < idx, active = i === idx;
            return (
              <li key={key} className="flex items-center gap-3 py-1.5">
                <span className={`w-5 h-5 flex items-center justify-center border text-[10px] ${
                  done ? "bg-[#5A7A6A] border-[#5A7A6A] text-white"
                  : active ? "border-[#5A7A6A] text-[#5A7A6A]"
                  : "border-black/15 text-black/25"}`}>
                  {done ? <Check className="w-3 h-3" /> : i + 1}
                </span>
                <span className={`text-sm ${active ? "text-[#131311] font-medium" : done ? "text-[#5c5a56]" : "text-black/35"}`}>{label}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}

function ActionCard({ icon, title, body, cta }: { icon: React.ReactNode; title: string; body: string; cta: React.ReactNode }) {
  return (
    <div className="bg-[#5A7A6A]/8 border border-[#5A7A6A]/25 p-5 mb-6">
      <p className="text-sm font-semibold text-[#131311] flex items-center gap-2 mb-1"><span className="text-[#5A7A6A]">{icon}</span>{title}</p>
      <p className="text-xs text-[#5c5a56] mb-4 leading-relaxed">{body}</p>
      {cta}
    </div>
  );
}

function PaymentCard({ title, orderNo, p }: { title: string; orderNo: string; p: { amount: number; percent: number; status: string; invoicedAt: string | null; reference: string | null } }) {
  const paid = p.status === "paid";
  const invoiced = !!p.invoicedAt;
  return (
    <div className={`border p-4 ${paid ? "bg-[#5A7A6A]/6 border-[#5A7A6A]/25" : invoiced ? "bg-white border-black/12" : "bg-[#FAFAF9] border-black/8"}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs tracking-wide text-[#5c5a56] uppercase">{title} · {p.percent}%</span>
        <span className={`text-[10px] px-1.5 py-0.5 border ${paid ? "border-[#5A7A6A] text-[#5A7A6A]" : invoiced ? "border-amber-500 text-amber-600" : "border-black/15 text-black/40"}`}>
          {paid ? "Paid" : invoiced ? "Due" : "Not yet due"}
        </span>
      </div>
      <p className="text-lg text-[#131311]" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(p.amount)}</p>
      {paid ? (
        <p className="text-xs text-[#5A7A6A] flex items-center gap-1 mt-1"><Check className="w-3 h-3" />Received{p.reference ? ` · ${p.reference}` : ""}</p>
      ) : invoiced ? (
        <div className="text-xs text-[#5c5a56] mt-2 space-y-0.5">
          <p className="flex items-center gap-1 text-[#131311] font-medium"><Landmark className="w-3 h-3" />Pay by bank transfer</p>
          <p>BSB 083-000 · Acct 12 345 678</p>
          <p>Reference <span className="font-mono text-[#131311]">{orderNo}</span></p>
        </div>
      ) : (
        <p className="text-xs text-[#5c5a56] mt-2 flex items-center gap-1"><FileText className="w-3 h-3" />Invoiced after quality check</p>
      )}
    </div>
  );
}
