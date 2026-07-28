// Ops → Rules / Files / Audit / Admin (O6).
import { useEffect, useState } from "react";
import { Loader2, Download, Power, ShieldCheck } from "lucide-react";
import {
  opsFiles, opsRescanFile, opsAudit, opsStaff, opsSetRole,
  type OpsFile, type OpsAudit, type OpsStaff,
} from "./api";

const SAGE = "#5A7A6A";
const kb = (n: number) => (n < 1024 ? `${n} B` : `${Math.round(n / 1024)} KB`);
const when = (s: string) => new Date(s).toLocaleString("en-AU");

// The Rules tab is gone with the approval engine (2026-07-28). It let an admin
// toggle and retune the rules that decided which quotes needed sign-off; with no
// approval step there is nothing for a rule to trigger.

export function Files() {
  const [files, setFiles] = useState<OpsFile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { opsFiles().then(r => setFiles(r.files)).catch(() => setFiles([])); }, []);

  // Unscanned files are withheld from download until a scanner clears them.
  const rescan = async (id: string) => {
    setBusy(id);
    try {
      await opsRescanFile(id);
      setFiles((await opsFiles()).files);
    } catch { /* status stays as-is; the row still shows why it is blocked */ }
    finally { setBusy(null); }
  };
  if (!files) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;
  if (!files.length) return <div className="bg-white border border-dashed border-black/15 p-12 text-center text-sm text-[#5c5a56]">No files uploaded yet.</div>;
  // overflow-x-auto is containment, not a design. A w-full table still has a
  // min-content width, and without this it forces the whole DOCUMENT wider —
  // page-level horizontal scroll, which is what made the old fixed bottom bar
  // desynchronise from the content. Proper phone cards for Files are still
  // pending; this stops the table breaking the page in the meantime.
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[#8b8880] border-b border-black/8">
          <th className="px-4 py-2.5 font-medium">File</th><th className="px-4 py-2.5 font-medium">Project</th>
          <th className="px-4 py-2.5 font-medium">Size</th><th className="px-4 py-2.5 font-medium">Scan</th><th className="px-4 py-2.5" />
        </tr></thead>
        <tbody>
          {files.map(f => (
            <tr key={f.id} className="border-b border-black/5 last:border-0 hover:bg-[#faf9f6]">
              <td className="px-4 py-3 text-[#14150f]">{f.filename}<span className="block text-xs text-[#8b8880]">{f.kind}</span></td>
              <td className="px-4 py-3 text-[#5c5a56]">{f.project_title ?? "—"}<span className="block text-xs text-[#8b8880]">{f.customer_name}</span></td>
              <td className="px-4 py-3 text-[#5c5a56]">{kb(f.size)}</td>
              <td className="px-4 py-3">
                <span
                  className="text-xs px-2 py-0.5 border"
                  style={f.virus_status === "clean" ? { borderColor: "rgba(0,0,0,.12)", color: "#5c5a56" }
                    : f.virus_status === "infected" ? { borderColor: "#b4433622", background: "#b443361a", color: "#8c2f24" }
                    : { borderColor: "#b8860022", background: "#b886001a", color: "#7a5c00" }}
                >{f.virus_status}</span>
              </td>
              <td className="px-4 py-3 text-right">
                {f.virus_status === "clean" ? (
                  <a href={`/api/ops/files/${f.id}/download`} className="inline-flex items-center gap-1 text-sm hover:underline" style={{ color: SAGE }}><Download className="w-3.5 h-3.5" />Download</a>
                ) : f.virus_status === "infected" ? (
                  <span className="text-sm text-[#8b8880]">Blocked</span>
                ) : (
                  <button
                    onClick={() => rescan(f.id)}
                    disabled={busy === f.id}
                    className="inline-flex items-center gap-1 text-sm hover:underline disabled:opacity-50"
                    style={{ color: SAGE }}
                  >
                    {busy === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    Scan to unlock
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Audit (event log) ────────────────────────────────────────────────────────
export function Audit() {
  const [events, setEvents] = useState<OpsAudit[] | null>(null);
  const [filter, setFilter] = useState("");
  useEffect(() => { opsAudit(filter || undefined).then(r => setEvents(r.events)).catch(() => setEvents([])); }, [filter]);
  return (
    <div className="max-w-3xl">
      <div className="flex gap-1.5 mb-3">
        {["", "project", "order", "user", "rule"].map(e => (
          <button key={e || "all"} onClick={() => setFilter(e)} className={`text-xs px-2.5 py-1 border ${filter === e ? "border-[#5A7A6A] bg-sage-wash text-[#355344]" : "border-black/12 text-[#5c5a56]"}`}>{e || "All"}</button>
        ))}
      </div>
      {!events ? <Loader2 className="w-5 h-5 text-black/30 animate-spin" />
        : events.length === 0 ? <p className="text-sm text-[#b5b2ac]">No events.</p>
        : <ol className="card divide-y divide-black/5">
            {events.map((e, i) => (
              <li key={i} className="px-4 py-2 text-sm flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-wide text-[#8b8880] w-14 shrink-0">{e.entity_type}</span>
                <span className="text-[#14150f] flex-1">{e.action}</span>
                <span className="text-xs text-[#8b8880]">{e.actor} · {when(e.occurred_at)}</span>
              </li>
            ))}
          </ol>}
    </div>
  );
}

// ── Admin (staff + roles) ────────────────────────────────────────────────────
export function Admin() {
  const [staff, setStaff] = useState<OpsStaff[] | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const load = () => opsStaff().then(r => { setStaff(r.staff); setRoles(r.roles); }).catch(() => setStaff([]));
  useEffect(() => { load(); }, []);
  if (!staff) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;

  const change = async (id: string, role: string) => {
    setErr("");
    try { await opsSetRole(id, role); await load(); } catch { setErr("Only admins can change roles."); }
  };
  return (
    <div className="max-w-3xl">
      <p className="text-xs text-[#8b8880] mb-3 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" />Staff & roles. Only admins can change roles.</p>
      {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
      <div className="card divide-y divide-black/5">
        {staff.map(s => (
          <div key={s.id} className="px-4 py-3 flex items-center gap-3 text-sm">
            <div className="flex-1"><span className="text-[#14150f]">{s.name}</span><span className="block text-xs text-[#8b8880]">{s.email}</span></div>
            <select value={s.role ?? ""} onChange={e => change(s.id, e.target.value)} className="border border-black/15 px-2 py-1 text-sm">
              <option value="" disabled>— role —</option>
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

function safeParse(s: string): Record<string, any> {
  try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
