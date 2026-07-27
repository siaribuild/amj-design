// Ops → Quotes: submissions queue + the internal quote workspace (O2).
import { useEffect, useState } from "react";
import { ChevronLeft, Loader2, UserPlus, FileCheck2, StickyNote, Save, MessageCircleQuestion, ShieldCheck, FlaskConical, Clock, Check, X, CircleDot } from "lucide-react";
import {
  opsSubmissions, opsProject, opsAssign, opsPatchLine, opsAddNote, opsIssueRevision,
  opsSetStatus, opsRequestClarification, opsSubmitForApproval, opsLineConfigurations,
  OpsApiError,
  type OpsSubmission, type OpsWorkspace, type OpsLine, type OpsExactConfiguration,
} from "./api";

const SAGE = "#5A7A6A";
const money = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-AU")}`);
const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted", triage_pending: "Awaiting triage", estimator_assigned: "Assigned",
  technical_review_required: "Technical review", approval_pending: "Approval pending",
  approved_for_issue: "Ready to issue", customer_clarification_required: "Awaiting customer",
  quote_issued: "Quote issued", under_review: "Under review", needs_information: "Needs info",
};
// Workflow transitions surfaced as buttons (clarification / approval / issued
// have dedicated actions).
const NEXT: Record<string, { label: string; icon: React.ReactNode }> = {
  estimator_assigned: { label: "Resume review", icon: <UserPlus className="w-4 h-4" /> },
  technical_review_required: { label: "Start technical review", icon: <FlaskConical className="w-4 h-4" /> },
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
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [clarify, setClarify] = useState("");
  const [actionError, setActionError] = useState("");

  const load = () => opsProject(id).then(setWs).catch(() => setWs(null));
  useEffect(() => { load(); }, [id]);

  if (!ws) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;
  const p = ws.project;
  const total = ws.lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0);
  const next = p.nextStates ?? [];
  // One blanket message used to cover every failure: "resolve and exactly price
  // every line". That is the right sentence for exactly ONE of these codes. On a
  // concurrency conflict it sent people hunting a pricing problem that did not
  // exist, while the actual cause — someone else editing the same quote — went
  // unsaid and the lost edit went unnoticed.
  const ACTION_ERRORS: Record<string, string> = {
    unresolved_lines: "Resolve and exactly price every line, then try again.",
    line_changed_reload_required: "Someone else changed this quote while you had it open — your edit wasn't saved. Reload the record and try again.",
    quote_changed_retry: "Someone else changed this quote while you had it open — your edit wasn't saved. Reload the record and try again.",
    workflow_changed_retry: "This quote moved to another state while you had it open. Reload the record to see where it is now.",
    stage_conflict: "That step has already been taken. Reload the record to see the current state.",
    forbidden_role: "You don't have permission for that action.",
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setActionError("");
    try { await fn(); await load(); }
    catch (e) {
      const code = e instanceof OpsApiError ? e.code : "";
      setActionError(ACTION_ERRORS[code] ?? "That action could not be completed.");
    }
    finally { setBusy(false); }
  };

  const addNote = async () => {
    const body = note.trim(); if (!body) return;
    await run(() => opsAddNote(id, body)); setNote("");
  };
  const sendClarify = async () => {
    const msg = clarify.trim(); if (!msg) return;
    await run(() => opsRequestClarification(id, msg)); setClarify(""); setClarifyOpen(false);
  };
  const submitForApproval = () => run(() => opsSubmitForApproval(id));

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
          <span className="text-xs px-2 py-1 border border-[#5A7A6A]/30 bg-[#5A7A6A]/8 text-[#355344]">{p.statusInternalLabel}</span>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
          <div><span className="block text-[11px] uppercase tracking-wide text-[#8b8880]">Owner</span>{p.assignee ?? <span className="text-[#b5b2ac]">Unassigned</span>}</div>
          <div><span className="block text-[11px] uppercase tracking-wide text-[#8b8880]">Items</span>{ws.lines.length}</div>
          <div><span className="block text-[11px] uppercase tracking-wide text-[#8b8880]">Est. total</span><span style={{ fontFamily: "'DM Mono', monospace" }}>{money(total)}</span></div>
        </div>

        {/* Workflow actions */}
        <div className="flex flex-wrap gap-2 mt-5">
          {!p.assignee && (
            <button onClick={() => run(() => opsAssign(id))} disabled={busy} className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-black/15 hover:bg-[#faf9f6] disabled:opacity-50">
              <UserPlus className="w-4 h-4" />Assign to me
            </button>
          )}
          {next.filter(s => NEXT[s]).map(s => (
            <button key={s} onClick={() => run(() => opsSetStatus(id, s))} disabled={busy} className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-black/15 hover:bg-[#faf9f6] disabled:opacity-50">
              {NEXT[s].icon}{NEXT[s].label}
            </button>
          ))}
          {next.includes("customer_clarification_required") && (
            <button onClick={() => setClarifyOpen(v => !v)} disabled={busy} className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-black/15 hover:bg-[#faf9f6] disabled:opacity-50">
              <MessageCircleQuestion className="w-4 h-4" />Request clarification
            </button>
          )}
          {p.canSubmitForApproval && (
            <button onClick={submitForApproval} disabled={busy} className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-[#5A7A6A]/40 text-[#355344] hover:bg-[#5A7A6A]/8 disabled:opacity-50">
              <ShieldCheck className="w-4 h-4" />Submit for approval
            </button>
          )}
          {next.includes("issued") && (
            <button onClick={() => run(() => opsIssueRevision(id))} disabled={busy || p.unresolvedLineCount > 0} className="flex items-center gap-1.5 text-sm px-3 py-1.5 text-white disabled:opacity-50" style={{ background: SAGE }}>
              <FileCheck2 className="w-4 h-4" />Issue reviewed quote
            </button>
          )}
        </div>
        {p.unresolvedLineCount > 0 && (
          <p className="mt-3 text-xs text-amber-800">{p.unresolvedLineCount} line{p.unresolvedLineCount === 1 ? "" : "s"} must be exactly priced and resolved before approval or issue.</p>
        )}
        {actionError && <p role="alert" className="mt-3 text-xs text-red-700">{actionError}</p>}
        {clarifyOpen && (
          <div className="mt-3 flex gap-2">
            <input value={clarify} autoFocus onChange={e => setClarify(e.target.value)} onKeyDown={e => e.key === "Enter" && sendClarify()}
              placeholder="What do you need the customer to confirm?" className="flex-1 border border-black/15 px-3 py-1.5 text-sm outline-none focus:border-[#5A7A6A]" />
            <button onClick={sendClarify} disabled={busy || !clarify.trim()} className="text-sm px-3 py-1.5 text-white disabled:opacity-50" style={{ background: SAGE }}>Send to customer</button>
          </div>
        )}
      </div>

      {/* Approval trace */}
      {ws.approvals && (
        <div className="bg-white border border-black/8 p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] uppercase tracking-wide text-[#8b8880]">Approvals</h3>
            <span className="text-xs text-[#5c5a56]">Instance: {ws.approvals.state}</span>
          </div>
          <ul className="space-y-2">
            {ws.approvals.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                {s.state === "approved" ? <Check className="w-4 h-4 text-[#5A7A6A]" />
                  : s.state === "rejected" ? <X className="w-4 h-4 text-red-500" />
                  : <CircleDot className="w-4 h-4 text-[#b5b2ac]" />}
                <span className="text-[#14150f] capitalize">{s.trigger_family}</span>
                <span className="text-xs text-[#8b8880] flex-1">{s.reason} · needs {s.approver_role}</span>
                <span className={`text-xs ${s.state === "approved" ? "text-[#5A7A6A]" : s.state === "rejected" ? "text-red-500" : "text-[#b5b2ac]"}`}>
                  {s.state}{s.acted_by ? ` · ${s.acted_by}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Line list (editable) */}
      <h3 className="text-[11px] uppercase tracking-wide text-[#8b8880] mb-2">Lines</h3>
      <div className="space-y-2 mb-6">
        {ws.lines.map(l => <LineRow key={l.id} line={l} onSaved={load} />)}
      </div>

      {/* Technical notes */}
      <h3 className="text-[11px] uppercase tracking-wide text-[#8b8880] mb-2">Technical notes</h3>
      <div className="bg-white border border-black/8 p-4 mb-6">
        <div className="flex gap-2">
          <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === "Enter" && addNote()}
            placeholder="Add a note for this project…" className="flex-1 border border-black/15 px-3 py-1.5 text-sm outline-none focus:border-[#5A7A6A]" />
          <button onClick={addNote} disabled={busy || !note.trim()} className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-black/15 hover:bg-[#faf9f6] disabled:opacity-50">
            <StickyNote className="w-4 h-4" />Add
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {ws.comments.filter(c => c.kind === "note").length === 0 && <p className="text-xs text-[#b5b2ac]">No notes yet.</p>}
          {ws.comments.filter(c => c.kind === "note").map(cm => (
            <div key={cm.id} className="text-sm border-l-2 pl-3 py-0.5" style={{ borderColor: SAGE }}>
              <p className="text-[#14150f]">{cm.body}</p>
              <p className="text-[11px] text-[#8b8880]">{cm.author ?? "System"} · {new Date(cm.created_at).toLocaleString("en-AU")}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Activity timeline — events + clarification thread, merged by time */}
      <h3 className="text-[11px] uppercase tracking-wide text-[#8b8880] mb-2">Activity</h3>
      <div className="bg-white border border-black/8 p-4 mb-6">
        <ol className="space-y-2.5">
          {mergeTimeline(ws).map((t, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <Clock className="w-3.5 h-3.5 text-[#b5b2ac] mt-0.5 shrink-0" />
              <div>
                {t.kind === "clarification"
                  ? <p className="text-[#14150f]"><span className="text-[#8b8880]">clarification —</span> {t.text}</p>
                  : <p className="text-[#14150f]">{t.text}</p>}
                <p className="text-[11px] text-[#8b8880]">{t.who} · {new Date(t.at).toLocaleString("en-AU")}</p>
              </div>
            </li>
          ))}
          {mergeTimeline(ws).length === 0 && <p className="text-xs text-[#b5b2ac]">No activity yet.</p>}
        </ol>
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

// Merge audit events + clarification comments into one time-ordered feed (newest first).
function mergeTimeline(ws: OpsWorkspace): { at: string; who: string; text: string; kind: "event" | "clarification" }[] {
  const events = ws.activity.map(a => ({ at: a.occurred_at, who: a.actor ?? "System", text: a.action, kind: "event" as const }));
  const clar = ws.comments.filter(c => c.kind === "clarification").map(c => ({ at: c.created_at, who: c.author ?? "Customer", text: c.body, kind: "clarification" as const }));
  return [...events, ...clar].sort((a, b) => (a.at < b.at ? 1 : -1));
}

function LineRow({ line, onSaved }: { line: OpsLine; onSaved: () => void }) {
  const [w, setW] = useState(line.width);
  const [h, setH] = useState(line.height);
  const [qty, setQty] = useState(String(line.qty));
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [configurations, setConfigurations] = useState<OpsExactConfiguration[] | null>(null);
  const [configurationKey, setConfigurationKey] = useState("");
  const [configurationError, setConfigurationError] = useState("");
  useEffect(() => {
    setW(line.width); setH(line.height); setQty(String(line.qty));
  }, [line.width, line.height, line.qty]);
  const dirty = w !== line.width || h !== line.height || qty !== String(line.qty);
  const reviewReasons = line.review ? Object.entries(line.review) : [];

  const save = async () => {
    setSaving(true);
    try { await opsPatchLine(line.id, { width: w, height: h, qty: Math.max(1, parseInt(qty) || 1) }); onSaved(); }
    finally { setSaving(false); }
  };
  const resolveAll = async () => {
    setResolving(true);
    setConfigurationError("");
    try { await opsPatchLine(line.id, { resolveReview: true }); onSaved(); }
    catch { setConfigurationError("Select an exact configuration before resolving this line."); }
    finally { setResolving(false); }
  };
  const loadConfigurations = async () => {
    setResolving(true); setConfigurationError("");
    try {
      const result = await opsLineConfigurations(line.id);
      setConfigurations(result.configurations);
      if (result.configurations.length === 1) {
        const only = result.configurations[0];
        setConfigurationKey(`${only.productSlug}::${only.variantId}`);
      }
    } catch {
      setConfigurationError("Eligible configurations could not be loaded. Check the product catalogue and try again.");
    } finally { setResolving(false); }
  };
  const applyConfiguration = async () => {
    const selected = configurations?.find((configuration) =>
      `${configuration.productSlug}::${configuration.variantId}` === configurationKey);
    if (!selected) return;
    setResolving(true); setConfigurationError("");
    try {
      await opsPatchLine(line.id, {
        productSlug: selected.productSlug,
        selectedVariantId: selected.variantId,
        options: line.options,
        width: w,
        height: h,
        qty: Math.max(1, parseInt(qty) || 1),
        resolveReview: true,
      });
      onSaved();
    } catch (e) {
      // Name the gap. The old copy — "confirm its private rate and option
      // surcharge rows" — described an internal table to someone who cannot open
      // one, so an unpriceable line was a dead end with no next click.
      const missing = e instanceof OpsApiError ? e.missingOptions : [];
      setConfigurationError(missing.length
        ? `Can't price this line — ${missing.join(", ")} has no price in D1. Ask a manager to set it in Pricing → Options, or choose a different option.`
        : "Can't price this line — no rate card covers this product. Ask a manager to check Pricing → Rate cards.");
    } finally { setResolving(false); }
  };

  return (
    <div className="bg-white border border-black/8 p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-mono text-xs text-[#5c5a56] w-10">{line.code || "—"}</span>
        <span className="text-sm text-[#14150f] flex-1 min-w-[160px]">{line.productName}<span className="block text-xs text-[#8b8880]">{line.room}</span>
          {Object.keys(line.options).length > 0 && (
            <span className="block text-[11px] text-[#5c5a56] mt-0.5">
              Options: {Object.entries(line.options)
                .filter(([key, value]) => value && !["performanceVariantId", "frameTechnology"].includes(key))
                .map(([key, value]) => `${key}: ${value}`).join(" · ")}
            </span>
          )}
        </span>
        {line.status === "technical_review" && <span className="text-[10px] font-medium px-1.5 py-0.5 border border-sky-300 bg-sky-50 text-sky-800">Technical review</span>}
        {line.status === "incomplete" && <span className="text-[10px] font-medium px-1.5 py-0.5 border border-amber-300 bg-amber-100 text-amber-800">Incomplete</span>}
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
      {/* Technical-review reasons the parser raised — visible to staff, with an
          explicit resolution (edit above to fix, then mark resolved). */}
      {reviewReasons.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-black/6">
          <ul className="space-y-1">
            {reviewReasons.map(([k, reason]) => (
              <li key={k} className="text-xs text-sky-900 flex items-start gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 flex-shrink-0 mt-px text-sky-500" aria-hidden="true" />
                <span><span className="uppercase tracking-wide text-[10px] text-sky-700">{k}</span> · {reason}</span>
              </li>
            ))}
          </ul>
          {(line.origin === "ai" || line.selectedVariantId) && (line.lineTotal == null || !line.selectedVariantId) ? (
            <div className="mt-2">
              {configurations == null ? (
                <button onClick={loadConfigurations} disabled={resolving} className="flex items-center gap-1 text-xs px-2 py-1 border border-sky-300 text-sky-800 hover:bg-sky-50 disabled:opacity-50">
                  <FlaskConical className="w-3.5 h-3.5" />{resolving ? "Loading…" : "Choose exact configuration"}
                </button>
              ) : configurations.length === 0 ? (
                <p className="text-xs text-amber-800">No eligible exact configuration is published for this opening.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <select value={configurationKey} onChange={e => setConfigurationKey(e.target.value)}
                    className="min-w-[280px] border border-black/15 px-2 py-1 text-xs text-[#14150f]">
                    <option value="">Select product and performance variant</option>
                    {configurations.map(configuration => (
                      <option key={`${configuration.productSlug}::${configuration.variantId}`} value={`${configuration.productSlug}::${configuration.variantId}`}>
                        {configuration.productName} · {configuration.frameTechnology.replaceAll("_", " ")}
                        {configuration.glassBuildUp ? ` · ${configuration.glassBuildUp}` : ""}
                        {configuration.uValue != null ? ` · Uw ${configuration.uValue}` : ""}
                        {configuration.shgc != null ? ` / SHGC ${configuration.shgc}` : ""}
                      </option>
                    ))}
                  </select>
                  <button onClick={applyConfiguration} disabled={resolving || !configurationKey}
                    className="flex items-center gap-1 text-xs px-2 py-1 text-white disabled:opacity-50" style={{ background: SAGE }}>
                    <Check className="w-3.5 h-3.5" />{resolving ? "Applying…" : "Apply, price and resolve"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button onClick={resolveAll} disabled={resolving} className="mt-2 flex items-center gap-1 text-xs px-2 py-1 border border-sky-300 text-sky-800 hover:bg-sky-50 disabled:opacity-50">
              <Check className="w-3.5 h-3.5" />{resolving ? "…" : "Mark technical review resolved"}
            </button>
          )}
          {configurationError && <p role="alert" className="mt-2 text-xs text-red-700">{configurationError}</p>}
        </div>
      )}
    </div>
  );
}
