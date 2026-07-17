// Ops → Orders: order list + fulfilment detail (drive the 12-stage journey).
import { useEffect, useState } from "react";
import { ChevronLeft, Loader2, Check, Truck, Landmark } from "lucide-react";
import { opsOrders, opsOrder, opsAdvanceOrder, opsPayOrder, type OpsOrder, type OpsAction } from "./api";

const SAGE = "#5A7A6A";
const money = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-AU")}`);
const STAGES: [string, string][] = [
  ["deposit_invoiced", "Deposit invoice issued"], ["deposit_paid", "Deposit received"],
  ["drawings_shared", "Shop drawings shared"], ["drawings_signed_off", "Drawings approved"],
  ["manufacturing", "In manufacturing"], ["qa_photos_shared", "Quality check — photos shared"],
  ["balance_invoiced", "Balance invoice issued"], ["balance_paid", "Balance received"],
  ["customer_confirmed", "Confirmed for dispatch"], ["dispatched", "Dispatched"],
  ["delivered", "Delivered"], ["after_sales", "Completed"],
];

export function Orders() {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId ? <Detail id={openId} onBack={() => setOpenId(null)} /> : <List onOpen={setOpenId} />;
}

function List({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<OpsOrder[] | null>(null);
  useEffect(() => { opsOrders().then(r => setRows(r.orders)).catch(() => setRows([])); }, []);
  if (!rows) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;
  if (!rows.length) return <div className="bg-white border border-dashed border-black/15 p-12 text-center text-sm text-[#5c5a56]">No orders yet.</div>;
  return (
    <div className="bg-white border border-black/8">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-[#8b8880] border-b border-black/8">
            <th className="px-4 py-2.5 font-medium">Order</th><th className="px-4 py-2.5 font-medium">Customer</th>
            <th className="px-4 py-2.5 font-medium">Stage</th><th className="px-4 py-2.5 font-medium">Total</th><th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map(o => (
            <tr key={o.id} className="border-b border-black/5 last:border-0 hover:bg-[#faf9f6]">
              <td className="px-4 py-3 font-mono text-[#14150f]">{o.orderNo}</td>
              <td className="px-4 py-3 text-[#5c5a56]">{o.customerName}<span className="block text-xs text-[#8b8880]">{o.orgName}</span></td>
              <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 border border-[#5A7A6A]/30 bg-[#5A7A6A]/8 text-[#355344]">{o.stageLabel}</span></td>
              <td className="px-4 py-3" style={{ fontFamily: "'DM Mono', monospace" }}>{money(o.total)}</td>
              <td className="px-4 py-3 text-right"><button onClick={() => onOpen(o.id)} className="text-sm font-medium hover:underline" style={{ color: SAGE }}>Open →</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const [order, setOrder] = useState<OpsOrder | null>(null);
  const [actions, setActions] = useState<OpsAction[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => opsOrder(id).then(r => { setOrder(r.order); setActions(r.actions); }).catch(() => setOrder(null));
  useEffect(() => { load(); }, [id]);
  if (!order) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;
  const idx = order.stageIndex;

  const act = async (a: OpsAction) => {
    setBusy(true);
    try {
      const r = a.action.startsWith("pay:")
        ? await opsPayOrder(id, a.action.split(":")[1], `EFT-${Math.floor(Math.random() * 9000 + 1000)}`)
        : await opsAdvanceOrder(id, a.action);
      // advance/pay return the bare order (no joined title/customer) — keep the header.
      setOrder(prev => ({ ...r.order, title: prev?.title, customerName: prev?.customerName, orgName: prev?.orgName }));
      setActions(r.actions);
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl">
      <button onClick={onBack} className="text-xs text-[#5c5a56] hover:text-[#14150f] flex items-center gap-1 mb-4"><ChevronLeft className="w-3.5 h-3.5" />Back to orders</button>
      <div className="bg-white border border-black/8 p-5 mb-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#14150f] font-mono">{order.orderNo}</h2>
            <p className="text-sm text-[#5c5a56]">{order.customerName} · {order.orgName} · {order.title}</p>
          </div>
          <span className="text-xs px-2 py-1 border border-[#5A7A6A]/30 bg-[#5A7A6A]/8 text-[#355344]">{order.stageLabel}</span>
        </div>
        <p className="text-sm mt-3" style={{ fontFamily: "'DM Mono', monospace" }}>{money(order.total)}</p>
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {actions.map(a => (
              <button key={a.action} onClick={() => act(a)} disabled={busy}
                className={`flex items-center gap-1.5 text-sm px-3 py-1.5 disabled:opacity-50 ${a.action.startsWith("pay:") ? "text-white" : "border border-black/15 hover:bg-[#faf9f6]"}`}
                style={a.action.startsWith("pay:") ? { background: SAGE } : undefined}>
                {a.action.startsWith("pay:") ? <Landmark className="w-4 h-4" /> : <Truck className="w-4 h-4" />}{a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Payments */}
      <div className="grid sm:grid-cols-2 gap-3 mb-5">
        {order.payments.map(p => (
          <div key={p.kind} className={`border p-4 ${p.status === "paid" ? "bg-[#5A7A6A]/6 border-[#5A7A6A]/25" : "bg-white border-black/12"}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs uppercase tracking-wide text-[#8b8880]">{p.kind} · {p.percent}%</span>
              <span className={`text-[10px] px-1.5 py-0.5 border ${p.status === "paid" ? "border-[#5A7A6A] text-[#5A7A6A]" : p.invoicedAt ? "border-amber-500 text-amber-600" : "border-black/15 text-black/40"}`}>
                {p.status === "paid" ? "Paid" : p.invoicedAt ? "Due" : "Not yet due"}
              </span>
            </div>
            <p className="text-lg text-[#14150f]" style={{ fontFamily: "'DM Mono', monospace" }}>{money(p.amount)}</p>
            {p.status === "paid" && p.reference && <p className="text-xs text-[#5A7A6A] mt-1">Ref {p.reference}</p>}
          </div>
        ))}
      </div>

      {/* Stage tracker */}
      <div className="bg-white border border-black/8 p-5">
        <p className="text-[11px] uppercase tracking-wide text-[#8b8880] mb-4">Fulfilment</p>
        <ol className="space-y-0">
          {STAGES.map(([key, label], i) => {
            const done = i < idx, active = i === idx;
            return (
              <li key={key} className="flex items-center gap-3 py-1.5">
                <span className={`w-5 h-5 flex items-center justify-center border text-[10px] ${done ? "bg-[#5A7A6A] border-[#5A7A6A] text-white" : active ? "border-[#5A7A6A] text-[#5A7A6A]" : "border-black/15 text-black/25"}`}>
                  {done ? <Check className="w-3 h-3" /> : i + 1}
                </span>
                <span className={`text-sm ${active ? "text-[#14150f] font-medium" : done ? "text-[#5c5a56]" : "text-black/35"}`}>{label}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
