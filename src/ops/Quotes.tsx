// Ops → Quotes: submissions queue + the internal quote workspace (O2).
import { useEffect, useState } from "react";
import { ChevronLeft, Loader2, UserPlus, FileCheck2, StickyNote, Save } from "lucide-react";
import {
  opsSubmissions, opsProject, opsAssign, opsPatchLine, opsAddNote, opsIssueRevision,
  type OpsSubmission, type OpsWorkspace, type OpsLine,
} from "./api";

const SAGE = "#5A7A6A";
const money = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-AU")}`);
const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted", estimator_assigned: "Assigned", technical_review_required: "Technical review",
  quote_issued: "Quote issued", under_review: "Under review", needs_information: "Needs info",
};

export function Quotes() {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId
    ? <Workspace id={openId} onBack={() => setOpenId(null)} />
    : <Queue onOpen={setOpenId} />;
}

function Queue({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<OpsSubmission[] | null>(null);
  useEffect(() => { opsSubmissions().then(r => setRows(r.submissions)).catch(() => setRows([])); }, []);
  if (!rows) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;
  if (!rows.length) return <div className="bg-white border border-dashed border-black/15 p-12 text-center text-sm text-[#5c5a56]">No submissions awaiting review.</div>;

  return (
    <div className="bg-white border border-black/8">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-[#8b8880] border-b border-black/8">
            <th className="px-4 py-2.5 font-medium">Project</th>
            <th className="px-4 py-2.5 font-medium">Customer</th>
            <th className="px-4 py-2.5 font-medium">Items</th>
            <th className="px-4 py-2.5 font-medium">Est. total</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Owner</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-black/5 last:border-0 hover:bg-[#faf9f6]">
              <td className="px-4 py-3 font-medium text-[#14150f]">{r.title}</td>
              <td className="px-4 py-3 text-[#5c5a56]">{r.customer_name}<span className="block text-xs text-[#8b8880]">{r.org_name}</span></td>
              <td className="px-4 py-3 text-[#5c5a56]">{r.item_count}</td>
              <td className="px-4 py-3 text-[#14150f]" style={{ fontFamily: "'DM Mono', monospace" }}>{money(r.total)}</td>
              <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 border border-black/12 text-[#5c5a56]">{STATUS_LABEL[r.status_internal] ?? r.status_internal}</span></td>
              <td className="px-4 py-3 text-[#5c5a56]">{r.assignee_name ?? <span className="text-[#b5b2ac]">Unassigned</span>}</td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => onOpen(r.id)} className="text-sm font-medium hover:underline" style={{ color: SAGE }}>Open →</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Workspace({ id, onBack }: { id: string; onBack: () => void }) {
  const [ws, setWs] = useState<OpsWorkspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = () => opsProject(id).then(setWs).catch(() => setWs(null));
  useEffect(() => { load(); }, [id]);

  if (!ws) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;
  const p = ws.project;
  const total = ws.lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0);

  const assign = async () => { setBusy(true); try { await opsAssign(id); await load(); } finally { setBusy(false); } };
  const issue = async () => { setBusy(true); try { await opsIssueRevision(id); await load(); } finally { setBusy(false); } };
  const addNote = async () => {
    const body = note.trim(); if (!body) return;
    setBusy(true); try { await opsAddNote(id, body); setNote(""); await load(); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-4xl">
      <button onClick={onBack} className="text-xs text-[#5c5a56] hover:text-[#14150f] flex items-center gap-1 mb-4"><ChevronLeft className="w-3.5 h-3.5" />Back to queue</button>

      {/* Summary rail */}
      <div className="bg-white border border-black/8 p-5 mb-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#14150f]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{p.title}</h2>
            <p className="text-sm text-[#5c5a56]">{p.customerName} · {p.org} · {p.customerEmail}</p>
          </div>
          <span className="text-xs px-2 py-1 border border-black/12 text-[#5c5a56]">{STATUS_LABEL[p.statusInternal] ?? p.statusInternal}</span>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
          <div><span className="block text-[11px] uppercase tracking-wide text-[#8b8880]">Owner</span>{p.assignee ?? <span className="text-[#b5b2ac]">Unassigned</span>}</div>
          <div><span className="block text-[11px] uppercase tracking-wide text-[#8b8880]">Items</span>{ws.lines.length}</div>
          <div><span className="block text-[11px] uppercase tracking-wide text-[#8b8880]">Est. total</span><span style={{ fontFamily: "'DM Mono', monospace" }}>{money(total)}</span></div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={assign} disabled={busy} className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-black/15 hover:bg-[#faf9f6] disabled:opacity-50">
            <UserPlus className="w-4 h-4" />Assign to me
          </button>
          <button onClick={issue} disabled={busy} className="flex items-center gap-1.5 text-sm px-3 py-1.5 text-white disabled:opacity-50" style={{ background: SAGE }}>
            <FileCheck2 className="w-4 h-4" />Issue reviewed quote
          </button>
        </div>
      </div>

      {/* Line list (editable) */}
      <h3 className="text-[11px] uppercase tracking-wide text-[#8b8880] mb-2">Lines</h3>
      <div className="space-y-2 mb-6">
        {ws.lines.map(l => <LineRow key={l.id} line={l} onSaved={load} />)}
      </div>

      {/* Technical notes */}
      <h3 className="text-[11px] uppercase tracking-wide text-[#8b8880] mb-2">Technical notes</h3>
      <div className="bg-white border border-black/8 p-4 mb-3">
        <div className="flex gap-2">
          <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === "Enter" && addNote()}
            placeholder="Add a note for this project…" className="flex-1 border border-black/15 px-3 py-1.5 text-sm outline-none focus:border-[#5A7A6A]" />
          <button onClick={addNote} disabled={busy || !note.trim()} className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-black/15 hover:bg-[#faf9f6] disabled:opacity-50">
            <StickyNote className="w-4 h-4" />Add
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {ws.comments.length === 0 && <p className="text-xs text-[#b5b2ac]">No notes yet.</p>}
          {ws.comments.map(cm => (
            <div key={cm.id} className="text-sm border-l-2 pl-3 py-0.5" style={{ borderColor: SAGE }}>
              <p className="text-[#14150f]">{cm.body}</p>
              <p className="text-[11px] text-[#8b8880]">{cm.author ?? "System"} · {new Date(cm.created_at).toLocaleString("en-AU")}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Revisions */}
      {ws.revisions.length > 0 && (
        <>
          <h3 className="text-[11px] uppercase tracking-wide text-[#8b8880] mb-2">Issued revisions</h3>
          <div className="bg-white border border-black/8 divide-y divide-black/6">
            {ws.revisions.map(r => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>Revision {r.revisionNo} · <span className="text-[#5c5a56]">{r.status}</span></span>
                <span style={{ fontFamily: "'DM Mono', monospace" }}>{money(r.total)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LineRow({ line, onSaved }: { line: OpsLine; onSaved: () => void }) {
  const [w, setW] = useState(line.width);
  const [h, setH] = useState(line.height);
  const [qty, setQty] = useState(String(line.qty));
  const [saving, setSaving] = useState(false);
  const dirty = w !== line.width || h !== line.height || qty !== String(line.qty);

  const save = async () => {
    setSaving(true);
    try { await opsPatchLine(line.id, { width: w, height: h, qty: Math.max(1, parseInt(qty) || 1) }); onSaved(); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white border border-black/8 p-3 flex items-center gap-3 flex-wrap">
      <span className="font-mono text-xs text-[#5c5a56] w-10">{line.code || "—"}</span>
      <span className="text-sm text-[#14150f] flex-1 min-w-[160px]">{line.productName}<span className="block text-xs text-[#8b8880]">{line.room}</span></span>
      <label className="text-xs text-[#8b8880] flex items-center gap-1">W<input value={w} onChange={e => setW(e.target.value.replace(/\D/g, ""))} className="w-16 border border-black/15 px-1.5 py-1 text-sm text-[#14150f]" /></label>
      <label className="text-xs text-[#8b8880] flex items-center gap-1">H<input value={h} onChange={e => setH(e.target.value.replace(/\D/g, ""))} className="w-16 border border-black/15 px-1.5 py-1 text-sm text-[#14150f]" /></label>
      <label className="text-xs text-[#8b8880] flex items-center gap-1">Qty<input value={qty} onChange={e => setQty(e.target.value.replace(/\D/g, ""))} className="w-12 border border-black/15 px-1.5 py-1 text-sm text-[#14150f]" /></label>
      <span className="text-sm w-20 text-right" style={{ fontFamily: "'DM Mono', monospace" }}>{money(line.lineTotal)}</span>
      {dirty && (
        <button onClick={save} disabled={saving} className="flex items-center gap-1 text-xs px-2 py-1 text-white disabled:opacity-50" style={{ background: SAGE }}>
          <Save className="w-3.5 h-3.5" />{saving ? "…" : "Save"}
        </button>
      )}
    </div>
  );
}
