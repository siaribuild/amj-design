// Ops → Customers: organisation list + 360 view (contacts, projects, orders).
import { useEffect, useState } from "react";
import { ChevronLeft, Loader2, Building2, User } from "lucide-react";
import { opsCustomers, opsCustomer, type OpsCustomer, type OpsCustomerDetail } from "./api";

const SAGE = "#5A7A6A";
const money = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-AU")}`);

export function Customers() {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId ? <Detail id={openId} onBack={() => setOpenId(null)} /> : <List onOpen={setOpenId} />;
}

function List({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<OpsCustomer[] | null>(null);
  useEffect(() => { opsCustomers().then(r => setRows(r.customers)).catch(() => setRows([])); }, []);
  if (!rows) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;
  if (!rows.length) return <div className="bg-white border border-dashed border-black/15 p-12 text-center text-sm text-[#5c5a56]">No organisations yet.</div>;
  return (
    <div className="bg-white border border-black/8">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-[#8b8880] border-b border-black/8">
            <th className="px-4 py-2.5 font-medium">Organisation</th><th className="px-4 py-2.5 font-medium">Contact</th>
            <th className="px-4 py-2.5 font-medium">Projects</th><th className="px-4 py-2.5 font-medium">Orders</th><th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map(c => (
            <tr key={c.id} className="border-b border-black/5 last:border-0 hover:bg-[#faf9f6]">
              <td className="px-4 py-3 font-medium text-[#14150f]">{c.name}<span className="block text-xs text-[#8b8880]">{c.abn ? `ABN ${c.abn}` : ""}</span></td>
              <td className="px-4 py-3 text-[#5c5a56]">{c.contact_name}<span className="block text-xs text-[#8b8880]">{c.contact_email}</span></td>
              <td className="px-4 py-3 text-[#5c5a56]">{c.projects}</td>
              <td className="px-4 py-3 text-[#5c5a56]">{c.orders}</td>
              <td className="px-4 py-3 text-right"><button onClick={() => onOpen(c.id)} className="text-sm font-medium hover:underline" style={{ color: SAGE }}>Open →</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<OpsCustomerDetail | null>(null);
  useEffect(() => { opsCustomer(id).then(setD).catch(() => setD(null)); }, [id]);
  if (!d) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;

  return (
    <div className="max-w-3xl">
      <button onClick={onBack} className="text-xs text-[#5c5a56] hover:text-[#14150f] flex items-center gap-1 mb-4"><ChevronLeft className="w-3.5 h-3.5" />Back to customers</button>
      <div className="bg-white border border-black/8 p-5 mb-5">
        <h2 className="text-lg font-semibold text-[#14150f] flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}><Building2 className="w-5 h-5" style={{ color: SAGE }} />{d.org.name}</h2>
        <p className="text-sm text-[#5c5a56] mt-1">{d.org.tradingName} · {d.org.abn ? `ABN ${d.org.abn}` : "No ABN"} · {d.org.accountStatus}</p>
      </div>

      <Section title="Contacts">
        {d.members.map(m => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm border-b border-black/5 last:border-0">
            <User className="w-4 h-4 text-[#b5b2ac]" />
            <span className="text-[#14150f]">{m.name}<span className="text-[#8b8880]"> · {m.role}</span></span>
            <span className="text-[#8b8880] ml-auto">{m.email}{m.phone ? ` · ${m.phone}` : ""}</span>
          </div>
        ))}
      </Section>

      <Section title="Projects">
        {d.projects.length === 0 && <p className="px-4 py-3 text-xs text-[#b5b2ac]">No projects.</p>}
        {d.projects.map(p => (
          <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm border-b border-black/5 last:border-0">
            <span className="text-[#14150f]">{p.title ?? "Untitled"}</span>
            <span className="text-xs px-2 py-0.5 border border-black/12 text-[#5c5a56]">{p.status_customer}</span>
          </div>
        ))}
      </Section>

      <Section title="Orders">
        {d.orders.length === 0 && <p className="px-4 py-3 text-xs text-[#b5b2ac]">No orders.</p>}
        {d.orders.map(o => (
          <div key={o.id} className="flex items-center justify-between px-4 py-2.5 text-sm border-b border-black/5 last:border-0">
            <span className="font-mono text-[#14150f]">{o.order_no}<span className="ml-2 text-xs text-[#8b8880] font-sans">{o.stage}</span></span>
            <span style={{ fontFamily: "'DM Mono', monospace" }}>{money(o.total)}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h3 className="text-[11px] uppercase tracking-wide text-[#8b8880] mb-2">{title}</h3>
      <div className="bg-white border border-black/8 mb-5">{children}</div>
    </>
  );
}
