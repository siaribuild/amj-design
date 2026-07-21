// Ops → Customers: registered customer list + 360 view (profile, projects, orders).
// Customers are user accounts (the organisation layer isn't wired); business name
// and ABN come from each customer's own profile. The sign-in email is the unique
// login ID — customers can't change it themselves, so admins can here.
import { useEffect, useState } from "react";
import { ChevronLeft, Loader2, User, Mail, Phone, Building2, PenLine } from "lucide-react";
import {
  opsCustomers, opsCustomer, opsSetCustomerEmail,
  type OpsCustomer, type OpsCustomerDetail, type OpsUser,
} from "./api";

const SAGE = "#5A7A6A";
const money = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-AU")}`);
const fmtDate = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s.replace(" ", "T") + "Z");
  return isNaN(+d) ? "—" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
};

export function Customers({ user }: { user: OpsUser }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId ? <Detail id={openId} viewer={user} onBack={() => setOpenId(null)} /> : <List onOpen={setOpenId} />;
}

function List({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<OpsCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { opsCustomers().then(r => setRows(r.customers)).catch(e => setError(String(e?.message ?? e))); }, []);
  if (error) return <div className="bg-white border border-red-200 p-6 text-sm text-red-600">Couldn't load customers. {error}</div>;
  if (!rows) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;
  if (!rows.length) return <div className="bg-white border border-dashed border-black/15 p-12 text-center text-sm text-[#5c5a56]">No registered customers yet.</div>;
  return (
    <div className="bg-white border border-black/8">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-[#8b8880] border-b border-black/8">
            <th className="px-4 py-2.5 font-medium">Customer</th><th className="px-4 py-2.5 font-medium">Business</th>
            <th className="px-4 py-2.5 font-medium">Projects</th><th className="px-4 py-2.5 font-medium">Orders</th>
            <th className="px-4 py-2.5 font-medium">Registered</th><th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map(c => (
            <tr key={c.id} className="border-b border-black/5 last:border-0 hover:bg-[#faf9f6]">
              <td className="px-4 py-3 font-medium text-[#14150f]">{c.name || c.email.split("@")[0]}<span className="block text-xs text-[#8b8880] font-normal">{c.email}</span></td>
              <td className="px-4 py-3 text-[#5c5a56]">{c.company || <span className="text-[#b5b2ac]">—</span>}<span className="block text-xs text-[#8b8880]">{c.abn ? `ABN ${c.abn}` : ""}</span></td>
              <td className="px-4 py-3 text-[#5c5a56]">{c.projects}</td>
              <td className="px-4 py-3 text-[#5c5a56]">{c.orders}</td>
              <td className="px-4 py-3 text-[#5c5a56]">{fmtDate(c.created_at)}</td>
              <td className="px-4 py-3 text-right"><button onClick={() => onOpen(c.id)} className="text-sm font-medium hover:underline" style={{ color: SAGE }}>Open →</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Detail({ id, viewer, onBack }: { id: string; viewer: OpsUser; onBack: () => void }) {
  const [d, setD] = useState<OpsCustomerDetail | null>(null);
  const [error, setError] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { opsCustomer(id).then(setD).catch(() => setError(true)); }, [id]);
  if (error) return <div className="bg-white border border-red-200 p-6 text-sm text-red-600">Couldn't load this customer.</div>;
  if (!d) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;
  const cu = d.customer;

  const saveEmail = async () => {
    if (busy) return;
    setBusy(true); setEmailErr("");
    try {
      const r = await opsSetCustomerEmail(cu.id, emailDraft.trim());
      setD({ ...d, customer: { ...cu, email: r.email } });
      setEditingEmail(false);
    } catch (e) {
      setEmailErr(String(e).includes("409") ? "That email is already in use by another account."
        : String(e).includes("400") ? "Enter a valid email address."
        : "Couldn't change the email — you may not have permission.");
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl">
      <button onClick={onBack} className="text-xs text-[#5c5a56] hover:text-[#14150f] flex items-center gap-1 mb-4"><ChevronLeft className="w-3.5 h-3.5" />Back to customers</button>
      <div className="bg-white border border-black/8 p-5 mb-5">
        <h2 className="text-lg font-semibold text-[#14150f] flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}><User className="w-5 h-5" style={{ color: SAGE }} />{cu.name || cu.email.split("@")[0]}</h2>
        <div className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-[#5c5a56]">
          <span className="flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-[#b5b2ac]" />{cu.email}
            {viewer.role === "admin" && !editingEmail && (
              <button onClick={() => { setEditingEmail(true); setEmailDraft(cu.email); setEmailErr(""); }}
                aria-label="Change sign-in email"
                className="text-[#8b8880] hover:text-[#14150f]"><PenLine className="w-3 h-3" /></button>
            )}
          </span>
          {cu.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-[#b5b2ac]" />{cu.phone}</span>}
          <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-[#b5b2ac]" />{cu.company || "No business name"}{cu.abn ? ` · ABN ${cu.abn}` : ""}</span>
          <span className="text-[#8b8880]">Registered {fmtDate(cu.createdAt)}</span>
        </div>
        {editingEmail && (
          <div className="mt-3 border-t border-black/[0.07] pt-3">
            <p className="text-[11px] uppercase tracking-wide text-[#8b8880] mb-1.5">Change sign-in email — this is the customer's unique login ID</p>
            <div className="flex flex-wrap gap-2 items-center">
              <input type="email" value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEmail()}
                className="border border-black/15 px-2.5 py-1.5 text-sm outline-none focus:border-[#5A7A6A] min-w-[240px]" />
              <button onClick={saveEmail} disabled={busy} className="text-xs px-3 py-1.5 bg-[#5A7A6A] text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
              <button onClick={() => setEditingEmail(false)} className="text-xs px-2 py-1.5 text-[#5c5a56] hover:text-[#14150f]">Cancel</button>
            </div>
            {emailErr && <p className="text-xs text-red-600 mt-1.5">{emailErr}</p>}
            <p className="text-[11px] text-[#8b8880] mt-1.5">The customer signs in with the new address from their next login. Their sessions and records are unaffected.</p>
          </div>
        )}
      </div>

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
