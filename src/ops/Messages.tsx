// Ops → Messages — inbound "Contact us" enquiries (view + delete).
import { useEffect, useState } from "react";
import { Loader2, Mail, Phone, Building2, Trash2, ExternalLink } from "lucide-react";
import { opsContactMessages, opsDeleteContactMessage, type OpsContactMessage } from "./api";

const when = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("en-AU", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});

export function Messages() {
  const [messages, setMessages] = useState<OpsContactMessage[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => opsContactMessages().then(r => setMessages(r.messages)).catch(() => setMessages([]));
  useEffect(() => { load(); }, []);
  if (!messages) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;
  if (!messages.length) return <div className="bg-white border border-dashed border-black/15 p-12 text-center text-sm text-[#5c5a56]">No enquiries yet.</div>;

  const active = messages.find(m => m.id === selected) ?? messages[0];

  const remove = async (id: string) => {
    setBusy(true); setErr("");
    try {
      await opsDeleteContactMessage(id);
      if (selected === id) setSelected(null);
      await load();
    } catch { setErr("Couldn't delete — you may not have permission."); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-5xl">
      {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(240px,320px)_1fr] gap-4">
        {/* List */}
        <div className="bg-white border border-black/8 divide-y divide-black/5 max-h-[70vh] overflow-y-auto">
          {messages.map(m => (
            <button key={m.id} onClick={() => setSelected(m.id)}
              className={`w-full text-left px-4 py-3 hover:bg-[#faf9f6] ${active.id === m.id ? "bg-[#5A7A6A]/6 border-l-2 border-l-[#5A7A6A]" : "border-l-2 border-l-transparent"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-[#14150f] truncate">{m.name}</span>
                <span className="text-[11px] text-[#8b8880] shrink-0">{when(m.created_at)}</span>
              </div>
              <p className="text-xs text-[#8b8880] truncate">{m.email}</p>
              <p className="text-xs text-[#5c5a56] truncate mt-0.5">{m.message}</p>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="bg-white border border-black/8 p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-[#14150f]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{active.name}</h2>
              <p className="text-xs text-[#8b8880]">{when(active.created_at)}</p>
            </div>
            <button onClick={() => remove(active.id)} disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs text-red-600 border border-red-200 px-2.5 py-1.5 hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="w-3.5 h-3.5" />Delete
            </button>
          </div>
          <div className="space-y-1.5 text-sm text-[#5c5a56] mb-5">
            <p className="flex items-center gap-2"><Mail className="w-4 h-4 text-[#8b8880]" /><a href={`mailto:${active.email}`} className="text-[#355344] hover:underline flex items-center gap-1">{active.email}<ExternalLink className="w-3 h-3" /></a></p>
            {active.phone && <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-[#8b8880]" /><a href={`tel:${active.phone}`} className="hover:underline">{active.phone}</a></p>}
            {active.company && <p className="flex items-center gap-2"><Building2 className="w-4 h-4 text-[#8b8880]" />{active.company}</p>}
          </div>
          <div className="border-t border-black/8 pt-4">
            <p className="text-[11px] uppercase tracking-wide text-[#8b8880] mb-2">Message</p>
            <p className="text-sm text-[#14150f] whitespace-pre-wrap leading-relaxed">{active.message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
