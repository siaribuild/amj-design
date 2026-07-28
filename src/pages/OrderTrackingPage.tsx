// ═══════════════════════════════════════════════════════════════════════════════
// ORDER READOUT — the read-only payments + stage tracker used by GUEST order
// tracking (email + reference, no account). The signed-in account area has its own
// deep workspace (RecordDetailPage); TrackFocus is the record-selection contract
// shared by both.
// ═══════════════════════════════════════════════════════════════════════════════
import { Check, FileText, Landmark } from "lucide-react";
import { fmt } from "../data/configurator";
import type { ApiOrder } from "../data/api";

// Which record the customer chose to open (from the dashboard).
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

// Read-only payments + stage tracker (no action buttons).
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
      {order.files && order.files.length > 0 && (
        <div className="card p-5 mb-3">
          <p className="text-[10px] tracking-[0.2em] text-[#5c5a56] uppercase mb-3">Attached schedule</p>
          <ul className="space-y-2">
            {order.files.map(f => (
              <li key={f.id} className="flex items-center gap-2.5 text-sm text-[#131311]">
                <FileText className="w-4 h-4 text-[#5A7A6A] flex-shrink-0" />
                <span className="truncate">{f.filename}</span>
                <a href={`/api/files/${f.id}/download`} className="ml-auto text-xs text-[#5c5a56] hover:text-[#5A7A6A] whitespace-nowrap" download>Download</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="card p-5">
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

function PaymentCard({ title, orderNo, p }: { title: string; orderNo: string; p: { amount: number; percent: number; status: string; invoicedAt: string | null; reference: string | null } }) {
  const paid = p.status === "paid";
  const invoiced = !!p.invoicedAt;
  return (
    <div className={`border p-4 ${paid ? "bg-[#5A7A6A]/6 border-[#5A7A6A]/25" : invoiced ? "bg-white border-black/12" : "ground-bone border-black/8"}`}>
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
