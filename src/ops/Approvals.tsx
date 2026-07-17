// Ops → Approvals: the central queue of pending approval steps the acting staff
// member can clear (admins see all).
import { useEffect, useState } from "react";
import { Loader2, Check, X } from "lucide-react";
import { opsApprovals, opsApprove, opsReject, type OpsApprovalTask } from "./api";

const SAGE = "#5A7A6A";
const FAMILY_LABEL: Record<string, string> = {
  commercial: "Commercial", technical: "Technical", policy: "Policy",
  account_risk: "Account risk", document_change: "Document change",
};

export function Approvals() {
  const [rows, setRows] = useState<OpsApprovalTask[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => opsApprovals().then(r => setRows(r.approvals)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const act = async (id: string, kind: "approve" | "reject") => {
    setBusy(id);
    try { await (kind === "approve" ? opsApprove(id) : opsReject(id, "Rejected")); await load(); }
    finally { setBusy(null); }
  };

  if (!rows) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;
  if (!rows.length) return <div className="bg-white border border-dashed border-black/15 p-12 text-center text-sm text-[#5c5a56]">Nothing awaiting your approval.</div>;

  return (
    <div className="space-y-3 max-w-3xl">
      {rows.map(a => (
        <div key={a.id} className="bg-white border border-black/8 p-4 flex items-center gap-4">
          <span className="text-[11px] uppercase tracking-wide px-2 py-1 border border-[#5A7A6A]/30 bg-[#5A7A6A]/8 text-[#355344]">{FAMILY_LABEL[a.trigger_family] ?? a.trigger_family}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#14150f]">{a.title}</p>
            <p className="text-xs text-[#8b8880]">{a.customer_name} · {a.org_name} · {a.reason}</p>
          </div>
          <span className="text-[11px] text-[#8b8880]">needs {a.approver_role}</span>
          <div className="flex gap-2">
            <button onClick={() => act(a.id, "reject")} disabled={!!busy} className="flex items-center gap-1 text-sm px-2.5 py-1.5 border border-black/15 hover:bg-[#faf9f6] disabled:opacity-50">
              <X className="w-3.5 h-3.5" />Reject
            </button>
            <button onClick={() => act(a.id, "approve")} disabled={!!busy} className="flex items-center gap-1 text-sm px-2.5 py-1.5 text-white disabled:opacity-50" style={{ background: SAGE }}>
              <Check className="w-3.5 h-3.5" />{busy === a.id ? "…" : "Approve"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
