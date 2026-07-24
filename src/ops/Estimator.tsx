// Ops → Estimator: the CPQ review workspace (spec §11.2, §16.3). Lists projects
// with estimator openings; for a selected project shows each opening with its
// candidate set (pass/fail + score), the selected product + price snapshot,
// warnings and status; runs the deterministic estimate; and captures a reviewer
// correction with a MANDATORY reason-code category (the learning surface, §12).
import { useEffect, useState } from "react";
import { Loader2, ChevronLeft, Check, X, AlertCircle, FlaskConical, Info } from "lucide-react";
import {
  opsEstimatorProjects, opsEstimatorWorkspace, opsEstimatorFeedback,
  type EstimatorProject, type EstimatorOpening,
} from "./api";

const SAGE = "#5A7A6A";
const money = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-AU")}`);

// Line-state palette (spec §16.3 states).
const STATUS: Record<string, { label: string; cls: string }> = {
  ready: { label: "Ready", cls: "border-[#5A7A6A]/30 bg-[#5A7A6A]/10 text-[#355344]" },
  commercial_only_estimate: { label: "Commercial estimate", cls: "border-sky-300 bg-sky-50 text-sky-800" },
  needs_manual_review: { label: "Manual review", cls: "border-amber-300 bg-amber-100 text-amber-800" },
  needs_clarification: { label: "Needs clarification", cls: "border-amber-300 bg-amber-100 text-amber-800" },
  catalogue_data_incomplete: { label: "Catalogue data incomplete", cls: "border-purple-300 bg-purple-50 text-purple-800" },
  unavailable: { label: "Unavailable", cls: "border-red-300 bg-red-50 text-red-700" },
  extracted: { label: "Not estimated", cls: "border-black/12 bg-white text-[#5c5a56]" },
};
const StatusBadge = ({ status }: { status: string }) => {
  const s = STATUS[status] ?? { label: status, cls: "border-black/12 bg-white text-[#5c5a56]" };
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 border ${s.cls}`}>{s.label}</span>;
};

export function Estimator() {
  const [projects, setProjects] = useState<EstimatorProject[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => { opsEstimatorProjects().then(r => setProjects(r.projects)).catch(() => setProjects([])); }, []);

  if (openId) return <Workspace projectId={openId} onBack={() => { setOpenId(null); opsEstimatorProjects().then(r => setProjects(r.projects)).catch(() => {}); }} />;
  if (!projects) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;
  if (!projects.length) return <div className="bg-white border border-dashed border-black/15 p-12 text-center text-sm text-[#5c5a56]">No projects have estimator openings yet. Upload a schedule on a project, then run the estimator.</div>;

  return (
    <div className="bg-white border border-black/8">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[#8b8880] border-b border-black/8">
          <th className="px-4 py-2.5 font-medium">Project</th><th className="px-4 py-2.5 font-medium">Openings</th>
          <th className="px-4 py-2.5 font-medium">Needs attention</th><th className="px-4 py-2.5" />
        </tr></thead>
        <tbody>
          {projects.map(p => (
            <tr key={p.id} className="border-b border-black/5 last:border-0 hover:bg-[#faf9f6]">
              <td className="px-4 py-3 text-[#14150f]">{p.title}<span className="block text-xs text-[#8b8880]">{p.statusCustomer}</span></td>
              <td className="px-4 py-3 text-[#5c5a56]">{p.openings}</td>
              <td className="px-4 py-3">{p.attention > 0 ? <span className="text-amber-700 font-medium">{p.attention}</span> : <span className="text-[#8b8880]">0</span>}</td>
              <td className="px-4 py-3 text-right"><button onClick={() => setOpenId(p.id)} className="text-sm font-medium hover:underline" style={{ color: SAGE }}>Open →</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// PURE REVIEW SURFACE (owner decision 2026-07-25): the pipeline runs itself on
// upload — extraction, selection and pricing arrive here already done. Reviewers
// review and correct; a logged correction re-ranks server-side automatically.
// No run buttons: there is no person monitoring projects to click them.
function Workspace({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const [data, setData] = useState<{ openings: EstimatorOpening[]; categories: string[] } | null>(null);

  const load = () => opsEstimatorWorkspace(projectId).then(setData).catch(() => setData({ openings: [], categories: [] }));
  useEffect(() => { load(); }, [projectId]);

  if (!data) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-[#5c5a56] hover:text-[#14150f]"><ChevronLeft className="w-4 h-4" />Back to projects</button>
      </div>
      {!data.openings.length && <div className="bg-white border border-dashed border-black/15 p-12 text-center text-sm text-[#5c5a56]">No openings yet — they appear automatically once the customer's documents are uploaded and processed.</div>}
      <div className="space-y-3">
        {data.openings.map(o => <OpeningCard key={o.id} projectId={projectId} opening={o} categories={data.categories} onChanged={load} />)}
      </div>
    </div>
  );
}

function OpeningCard({ projectId, opening, categories, onChanged }: { projectId: string; opening: EstimatorOpening; categories: string[]; onChanged: () => void }) {
  const [showFeedback, setShowFeedback] = useState(false);
  const selected = opening.candidates.find(c => c.selected);

  return (
    <div className="bg-white border border-black/10">
      <div className="flex items-center gap-3 px-4 py-3 bg-[#FAFAF9] border-b border-black/[0.06] flex-wrap">
        <span className="font-mono text-xs text-[#5c5a56] w-12">{opening.externalRef || "—"}</span>
        <span className="text-sm text-[#14150f] flex-1 min-w-[160px]">
          {selected?.productName ?? <span className="italic text-[#9a7a1a]">No product selected</span>}
          <span className="block text-xs text-[#8b8880]">{[opening.operation, opening.width && opening.height ? `${opening.width}×${opening.height}mm` : null, opening.room].filter(Boolean).join(" · ")}</span>
        </span>
        <StatusBadge status={opening.draft?.status ?? opening.status} />
        <span className="text-sm w-20 text-right" style={{ fontFamily: "'DM Mono', monospace" }}>{money(opening.draft?.price?.total)}</span>
      </div>

      {/* Warnings + non-certified estimate note */}
      {opening.draft?.status === "commercial_only_estimate" && (
        <p className="px-4 pt-2.5 text-xs text-sky-800 flex items-start gap-1.5"><Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" />Assumption-based commercial estimate — met by estimated (uncertified) performance data. Not a compliance certification.</p>
      )}

      {/* Candidate set */}
      {opening.candidates.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-[#8a8782] mb-1.5">Candidates ({opening.candidates.length})</p>
          <div className="space-y-1">
            {opening.candidates.map(c => (
              <div key={c.productId} className={`flex items-center gap-2 text-xs px-2 py-1.5 border ${c.selected ? "border-[#5A7A6A]/40 bg-[#5A7A6A]/5" : "border-black/8"}`}>
                {c.passed ? <Check className="w-3.5 h-3.5 text-[#5A7A6A] flex-shrink-0" /> : <X className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                <span className="text-[#14150f] flex-1 min-w-0 truncate">{c.productName}{c.selected && <span className="ml-1.5 text-[10px] px-1 py-0.5 border border-[#5A7A6A]/30 bg-[#5A7A6A]/10 text-[#355344]">selected</span>}</span>
                {c.passed ? (
                  <span className="flex items-center gap-1.5 flex-shrink-0">
                    {c.components && Math.abs(c.components.historical - 0.5) > 0.01 && (
                      <span
                        title={`Learned preference ${(c.components.historical * 100).toFixed(0)}% — from reviewer corrections (capped 10% of score)`}
                        className={c.components.historical > 0.5 ? "text-[#5A7A6A] font-medium" : "text-amber-600 font-medium"}
                      >
                        {c.components.historical > 0.5 ? "▲" : "▼"} learned
                      </span>
                    )}
                    <span className="text-[#8b8880] tabular-nums">score {c.score?.toFixed(2)}</span>
                  </span>
                ) : <span className="text-red-600 truncate max-w-[240px]" title={c.failReasons.join("; ")}>{c.failReasons[0] ?? "rejected"}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reviewer correction (mandatory reason-code category) */}
      <div className="px-4 pb-3">
        {showFeedback
          ? <FeedbackForm projectId={projectId} opening={opening} categories={categories} onDone={() => { setShowFeedback(false); onChanged(); }} onCancel={() => setShowFeedback(false)} />
          : <button onClick={() => setShowFeedback(true)} className="flex items-center gap-1 text-xs text-[#5c5a56] hover:text-[#14150f]"><FlaskConical className="w-3.5 h-3.5" />Log a correction</button>}
      </div>
    </div>
  );
}

function FeedbackForm({ projectId, opening, categories, onDone, onCancel }: { projectId: string; opening: EstimatorOpening; categories: string[]; onDone: () => void; onCancel: () => void }) {
  const systemPick = opening.candidates.find(c => c.selected)?.productId ?? "";
  const passedCandidates = opening.candidates.filter(c => c.passed);
  const [field, setField] = useState("product");
  const [category, setCategory] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [preferred, setPreferred] = useState(systemPick);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // A product correction is the learning signal: it must name the product the
  // reviewer would actually pick, so the ranker can learn the preference.
  const isProduct = field === "product";
  const canSave = !!category && !!reasonCode.trim() && (!isProduct || !!preferred);

  const save = async () => {
    setSaving(true);
    try {
      // Capture initial (system pick) → final (reviewer's choice) for product
      // corrections so the learning loop can train on the preference.
      const values = isProduct
        ? { initialValue: systemPick ? { productId: systemPick } : undefined, finalValue: { productId: preferred } }
        : {};
      await opsEstimatorFeedback(projectId, {
        openingId: opening.id, selectionRunId: opening.selectionRunId ?? undefined,
        field, category, reasonCode: reasonCode.trim(), note: note.trim() || undefined, ...values,
      });
      onDone();
    } finally { setSaving(false); }
  };

  const inp = "border border-black/15 px-2 py-1 text-xs text-[#14150f]";
  return (
    <div className="mt-1 border border-black/10 bg-[#FAFAF9] p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-[#5c5a56] flex items-center gap-1"><AlertCircle className="w-3 h-3" />A reason-code category is required — free-text alone is rejected.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={field} onChange={e => setField(e.target.value)} className={inp}>
          {["product", "operation", "width", "height", "option", "price"].map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={category} onChange={e => setCategory(e.target.value)} className={`${inp} ${category ? "" : "text-[#9a9894]"}`}>
          <option value="">Reason category…</option>
          {categories.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </select>
        <input value={reasonCode} onChange={e => setReasonCode(e.target.value.toUpperCase())} placeholder="REASON_CODE" className={`${inp} w-44 font-mono`} />
      </div>
      {isProduct && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[10px] uppercase tracking-widest text-[#8a8782]">Preferred product</label>
          <select value={preferred} onChange={e => setPreferred(e.target.value)} className={`${inp} ${preferred ? "" : "text-[#9a9894]"} min-w-[200px]`}>
            <option value="">Which product should win?…</option>
            {passedCandidates.map(c => (
              <option key={c.productId} value={c.productId}>{c.productName}{c.productId === systemPick ? " (system pick)" : ""}</option>
            ))}
          </select>
          {preferred && category === "preference_correction" && preferred !== systemPick && (
            <span className="text-[10px] text-[#5A7A6A]">trains the ranker ▲</span>
          )}
        </div>
      )}
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note" className={`${inp} w-full`} />
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={!canSave || saving} className="text-xs px-3 py-1 text-white disabled:opacity-50" style={{ background: SAGE }}>{saving ? "…" : "Record correction"}</button>
        <button onClick={onCancel} className="text-xs text-[#5c5a56] hover:text-[#14150f]">Cancel</button>
      </div>
    </div>
  );
}
