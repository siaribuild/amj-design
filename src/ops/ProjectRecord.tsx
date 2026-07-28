// Ops → Projects: ONE record, whole lifecycle, on one plane.
//
// A project, the quote revisions issued from it and the order it becomes are the
// same job at different moments — `order` is 1:1 with `project`, and every order
// query already joins the project back in. Splitting them across a Quotes tab and
// an Orders tab made a staffer cross a boundary that exists only in storage.
//
// This IS where work happens. It absorbed the Quotes workspace (line editing,
// notes, clarifications, issuing) and the Orders detail (stage advances,
// payments), and both of those tabs are gone.
//
// Two deliberate refusals, both worth stating because the obvious design does the
// opposite:
//
//  • NO vertical node timeline. The full vocabulary is ~9 internal quote states
//    plus 12 order stages; drawn as nodes that is roughly a screen and a half of
//    chrome to convey one integer and four dates. The customer's timeline earns
//    its space by selling the future ("no action needed", "~3-4 weeks in build").
//    Ops needs the past, dated and attributed. Different job, different object:
//    a coarse phase ribbon to orient, and a ledger of what actually happened.
//  • NO progress ring, badge or colour-only state. Every state carries its word.
import { useEffect, useState } from "react";
import { ChevronLeft, Loader2, FileText, Paperclip, History as HistoryIcon } from "lucide-react";
import {
  OpsApiError, opsProject, opsStartPricing, opsSetStatus, opsIssueRevision,
  opsRequestClarification, opsAddNote, opsPatchLine, opsAdvanceOrder, opsPayOrder,
  opsSplitLine, opsMergeComposite,
  OPS_PHASES, type OpsWorkspace, type OpsPhase, type OpsRecordAction, type OpsSegment,
} from "./api";

const SAGE = "#5A7A6A";
const INK = "#131311";
const MUTED = "#8b8880";
const MONO = { fontFamily: "'DM Mono', monospace" } as const;
const HEAD = { fontFamily: "'Space Grotesk', sans-serif" } as const;

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString("en-AU")}`;
const when = (ts: string | null | undefined) => {
  if (!ts) return "—";
  const d = new Date(ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`);
  return isNaN(+d) ? "—" : d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

// Failures name the cause. One blanket "resolve and exactly price every line"
// used to cover every code, which on a concurrency conflict sent people hunting a
// pricing problem that did not exist.
const ACTION_ERRORS: Record<string, string> = {
  unresolved_lines: "Resolve and exactly price every line, then try again.",
  line_changed_reload_required: "Someone else changed this record while you had it open — your edit wasn't saved. Reload and try again.",
  quote_changed_retry: "Someone else changed this record while you had it open — your edit wasn't saved. Reload and try again.",
  workflow_changed_retry: "This job moved to another state while you had it open. Reload to see where it is now.",
  stage_conflict: "That step has already been taken. Reload to see the current state.",
  forbidden_role: "You don't have permission for that action.",
};

export function ProjectRecord({ id, onBack }: { id: string; onBack: () => void }) {
  const [ws, setWs] = useState<OpsWorkspace | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  // Which version is being viewed: null = the live draft.
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The action awaiting confirmation, and the free text it needs (a bank
  // reference, or the clarification message).
  const [confirming, setConfirming] = useState<OpsRecordAction | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const load = () => opsProject(id).then(setWs).catch(() => setWs(null));
  useEffect(() => { load(); }, [id]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await fn(); await load(); setConfirming(null); setConfirmText(""); }
    catch (e) {
      const code = e instanceof OpsApiError ? e.code : "";
      setError(ACTION_ERRORS[code] ?? "That action could not be completed.");
    } finally { setBusy(false); }
  };

  const perform = (a: OpsRecordAction) => {
    if (a.id === "start-pricing") return run(() => opsStartPricing(id));
    if (a.id === "issue-revision") return run(() => opsIssueRevision(id));
    if (a.id.startsWith("status:")) return run(() => opsSetStatus(id, a.id.slice(7)));
    if (a.id.startsWith("advance:")) return run(() => opsAdvanceOrder(ws!.order!.id, a.id.slice(8)));
    if (a.id.startsWith("pay:")) return run(() => opsPayOrder(ws!.order!.id, a.id.slice(4), confirmText.trim()));
    if (a.id === "request-clarification") return run(() => opsRequestClarification(id, confirmText.trim()));
    if (a.id === "note") return run(() => opsAddNote(id, confirmText.trim()));
  };

  if (!ws) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;

  const p = ws.project;
  const life = ws.lifecycle;
  const order = ws.order ?? null;

  // Once a revision is accepted, the CONTRACT is what is being built — and the
  // draft lines are usually gone by then, so showing them renders an empty table
  // on a live order. Fall back to the draft only when there is no contract.
  const contractLines = ws.orderLines ?? [];
  const showingContract = !!order && contractLines.length > 0;
  const rows = showingContract
    ? contractLines.map((l) => ({ id: l.id, code: l.code, productName: l.productName, room: l.room, width: l.width, height: l.height, qty: l.qty, lineTotal: l.lineTotal, status: "ready", lineKind: "simple", segments: [] as OpsSegment[], productSlug: "" }))
    : ws.lines.map((l) => ({ id: l.id, code: l.code, productName: l.productName, room: l.room, width: l.width, height: l.height, qty: l.qty, lineTotal: l.lineTotal, status: l.status, lineKind: l.lineKind ?? "simple", segments: l.segments ?? [], productSlug: l.productSlug }));
  const total = rows.reduce((s, l) => s + (l.lineTotal ?? 0), 0);

  // Three modes, and the difference must be visible. The server only accepts line
  // edits in the pricing states, so rendering inputs anywhere else produces a
  // Save that silently 404s — which is exactly what the old workspace did once a
  // quote was issued.
  const EDITABLE = new Set(["submitted", "triage_pending", "estimator_assigned", "technical_review_required", "customer_clarification_required"]);
  const editable = !revisionId && !showingContract && EDITABLE.has(p.statusInternal);

  return (
    <div className="max-w-[1180px]">
      <button onClick={onBack} className="text-xs flex items-center gap-1 mb-3" style={{ color: MUTED }}>
        <ChevronLeft className="w-3.5 h-3.5" /> All projects
      </button>

      {/* ── Identity header ─────────────────────────────────────────────────
          One reference, always paired with the title. The order number is
          acceptance-time metadata that belongs on invoices, not the anchor — the
          customer's own record already makes that call, and a staffer reading a
          number down the phone must be reading the one the customer is looking at. */}
      <div className="bg-white border border-black/8 px-5 py-4 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg leading-tight" style={{ ...HEAD, color: INK }}>
              <span style={MONO}>{p.publicRef ?? id.slice(0, 8)}</span>
              <span style={{ color: MUTED }}> · </span>
              {p.title}
            </h2>
            <p className="text-sm mt-0.5" style={{ color: MUTED }}>
              {[p.org, p.customerName ?? p.contactName, p.customerEmail ?? p.contactEmail].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right">
            <div className="text-lg" style={{ ...MONO, color: INK }}>{money(total)}</div>
            <div className="text-[11px]" style={{ color: MUTED }}>
              {order ? "contract" : ws.revisions.length ? "issued" : "estimate"}
            </div>
          </div>
        </div>

        {life && <PhaseRibbon phase={life.phase} stateLabel={life.stateLabel} waitingOn={life.waitingOn} days={ws.daysInStage ?? null} />}

        {/* ── Actions ────────────────────────────────────────────────────────
            Exactly one primary, filled — the single move that advances this job.
            Colour weight tracks consequence weight. Inapplicable actions are not
            here at all; BLOCKED ones are, disabled, with the reason beside them. */}
        {(ws.actions ?? []).length > 0 && !revisionId && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(ws.actions ?? []).map((a) => {
              const blocked = !!a.blockedReason;
              const primary = a.tier === "primary";
              return (
                <span key={a.id} className="flex items-center gap-2">
                  <button
                    onClick={() => (a.confirm || a.id === "note" || a.id === "request-clarification" ? (setConfirming(a), setConfirmText("")) : perform(a))}
                    disabled={busy || blocked}
                    className="text-sm px-3.5 py-2 disabled:opacity-45 disabled:cursor-not-allowed"
                    style={primary
                      ? { background: SAGE, color: "#fff" }
                      : { border: "1px solid rgba(0,0,0,0.15)", color: INK, background: "#fff" }}>
                    {a.label}
                  </button>
                  {blocked && <span className="text-[12px]" style={{ color: "#7a5410" }}>{a.blockedReason}</span>}
                </span>
              );
            })}
          </div>
        )}

        {/* Confirm in place — the record stays on screen while the decision is
            made. A modal would hide the very thing being decided about. */}
        {confirming && (
          <div className="mt-3 border p-4" style={{ borderColor: "rgba(90,122,106,0.35)", background: "rgba(90,122,106,0.06)" }}>
            <p className="text-sm mb-1" style={{ color: INK }}>{confirming.label}?</p>
            {confirming.confirm && <p className="text-xs mb-2.5" style={{ color: MUTED }}>{confirming.confirm}</p>}
            {(confirming.id.startsWith("pay:") || confirming.id === "note" || confirming.id === "request-clarification") && (
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus
                onKeyDown={(e) => { if (e.key === "Escape") setConfirming(null); }}
                placeholder={confirming.id.startsWith("pay:") ? "Bank reference, e.g. EFT-4821"
                  : confirming.id === "note" ? "What should the file record?" : "What do you need from the customer?"}
                className="w-full border border-black/15 px-2.5 py-1.5 text-sm bg-white mb-3"
                style={confirming.id.startsWith("pay:") ? MONO : undefined} />
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => perform(confirming)}
                disabled={busy || ((confirming.id.startsWith("pay:") || confirming.id === "note" || confirming.id === "request-clarification") && !confirmText.trim())}
                className="text-sm text-white px-3.5 py-2 disabled:opacity-40" style={{ background: SAGE }}>
                Confirm
              </button>
              <button onClick={() => setConfirming(null)} disabled={busy} className="text-sm px-3 py-2" style={{ color: MUTED }}>Cancel</button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 text-[13px] px-3 py-2 border" style={{ background: "rgba(180,60,40,0.07)", borderColor: "rgba(180,60,40,0.28)", color: "#8a3b2a" }}>{error}</p>
        )}

        {/* The blocker, said once, in the header — not discovered at the bottom. */}
        {p.unresolvedLineCount > 0 && (
          <p className="mt-3 text-[13px] px-3 py-2 border" style={{ background: "rgba(180,120,40,0.09)", borderColor: "rgba(180,120,40,0.3)", color: "#7a5410" }}>
            {p.unresolvedLineCount} line{p.unresolvedLineCount === 1 ? "" : "s"} {p.unresolvedLineCount === 1 ? "is" : "are"} unpriced or unresolved — a quote cannot be issued until {p.unresolvedLineCount === 1 ? "it is" : "they are"} settled.
          </p>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* ── Main column ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Versions. Above the table, because it is the thing you compare
              against — not a footnote at the bottom of the page. */}
          {ws.revisions.length > 0 && (
            <div className="flex flex-wrap gap-0 mb-0">
              <VersionTab label="Live draft" meta="editing elsewhere" active={revisionId === null} onClick={() => setRevisionId(null)} />
              {ws.revisions.map((r) => (
                <VersionTab key={r.id}
                  label={`R${r.revisionNo}`}
                  meta={`${r.status} · ${money(r.total)}`}
                  active={revisionId === r.id}
                  onClick={() => setRevisionId(r.id)} />
              ))}
            </div>
          )}

          {revisionId && (
            <div className="border border-black/10 border-b-0 px-4 py-2 text-[13px]" style={{ background: "rgba(90,122,106,0.07)", color: "#355344" }}>
              Viewing an issued revision — read-only.{" "}
              <button onClick={() => setRevisionId(null)} className="underline underline-offset-2">Back to the live draft</button>
            </div>
          )}

          <div className="bg-white border border-black/8">
            <div className="px-4 py-2.5 border-b border-black/8 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: MUTED }}>
                {revisionId ? "Issued lines" : showingContract ? "Contract lines" : "Draft lines"}
              </span>
              <span className="text-[11px]" style={{ color: MUTED }}>{rows.length} lines</span>
            </div>
            {/* Contained rather than carded — line cards for the record plane are
                still pending. Without this the table's min-content width widens
                the whole document instead of scrolling inside its own panel. */}
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide" style={{ color: MUTED }}>
                  <th className="text-left font-medium px-4 py-2">Code</th>
                  <th className="text-left font-medium px-3 py-2">Product</th>
                  <th className="text-right font-medium px-3 py-2">Size</th>
                  <th className="text-right font-medium px-3 py-2">Qty</th>
                  <th className="text-right font-medium px-3 py-2">Line total</th>
                  <th className="text-left font-medium px-4 py-2">State</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <LineRow key={l.id} line={l} editable={editable} busy={busy}
                    onSaved={load} onError={setError} />
                ))}
                {/* Composites: the segments belong UNDER their parent, never
                    beside it as loose items — the parent is the opening the
                    customer ordered and its total is authoritative. */}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-sm" style={{ color: MUTED }}>No lines on this project.</td></tr>
                )}
              </tbody>
            </table>
            </div>
          </div>

          {ws.comments.length > 0 && (
            <Block title="Notes" icon={<FileText className="w-3.5 h-3.5" />}>
              {ws.comments.slice(0, 6).map((cm) => (
                <div key={cm.id} className="px-4 py-2.5 border-b border-black/5 last:border-0 border-l-2" style={{ borderLeftColor: SAGE }}>
                  <p className="text-[13px]" style={{ color: INK }}>{cm.body}</p>
                  <p className="text-[11px] mt-0.5" style={{ ...MONO, color: MUTED }}>
                    {cm.kind === "clarification" ? "Clarification" : "Note"} · {cm.author ?? "system"} · {when(cm.created_at)}
                  </p>
                </div>
              ))}
            </Block>
          )}
        </div>

        {/* ── Right rail ───────────────────────────────────────────────────── */}
        <div className="lg:w-[340px] lg:flex-shrink-0 space-y-4">
          {order && (
            <Block title="Payments" meta={order.orderNo}>
              {(ws.payments ?? []).map((pay) => (
                <div key={pay.kind} className="px-4 py-2.5 border-b border-black/5 last:border-0 flex items-baseline justify-between">
                  <span className="text-[13px]" style={{ color: INK }}>
                    {pay.kind} <span style={{ color: MUTED }}>· {pay.percent}%</span>
                    {pay.reference && <span className="block text-[11px]" style={{ ...MONO, color: MUTED }}>{pay.reference}</span>}
                  </span>
                  <span className="text-right">
                    <span className="block text-[13px]" style={{ ...MONO, color: INK }}>{money(pay.amount)}</span>
                    <span className="block text-[11px]" style={{ color: pay.status === "paid" ? SAGE : MUTED }}>{pay.status}</span>
                  </span>
                </div>
              ))}
              {(ws.payments ?? []).length === 0 && <Empty>No payments recorded.</Empty>}
              <div className="px-4 py-2 text-[11px] border-t border-black/5" style={{ color: MUTED }}>
                Order no. <span style={MONO}>{order.orderNo}</span> · appears on invoices
              </div>
            </Block>
          )}

          <Block title="Files" icon={<Paperclip className="w-3.5 h-3.5" />} meta={String(ws.files.length)}>
            {ws.files.map((f) => (
              <div key={f.id} className="px-4 py-2.5 border-b border-black/5 last:border-0 flex items-baseline justify-between gap-2">
                <span className="text-[13px] truncate" style={{ color: INK }}>{f.filename}</span>
                <span className="text-[11px] flex-shrink-0" style={{ ...MONO, color: f.virus_status === "clean" ? MUTED : "#8a6a2a" }}>
                  {f.virus_status === "clean" ? `${Math.max(1, Math.round(f.size / 1024))} kB` : f.virus_status}
                </span>
              </div>
            ))}
            {ws.files.length === 0 && <Empty>Nothing attached.</Empty>}
          </Block>

          {/* History spans the project AND its order. Bounded to 8 by default —
              an audit log is a reference, not a feed. */}
          <Block title="History" icon={<HistoryIcon className="w-3.5 h-3.5" />} meta={String(ws.activity.length)}>
            {(showAllHistory ? ws.activity : ws.activity.slice(0, 8)).map((a, i) => (
              <div key={`${a.occurred_at}-${i}`} className="px-4 py-2 border-b border-black/5 last:border-0">
                <p className="text-[13px]" style={{ color: INK }}>{a.action}</p>
                <p className="text-[11px]" style={{ ...MONO, color: MUTED }}>{a.actor ?? "system"} · {when(a.occurred_at)}</p>
              </div>
            ))}
            {ws.activity.length === 0 && <Empty>Nothing has happened yet.</Empty>}
            {ws.activity.length > 8 && (
              <button onClick={() => setShowAllHistory((v) => !v)}
                className="w-full px-4 py-2 text-[12px] text-left border-t border-black/5" style={{ color: SAGE }}>
                {showAllHistory ? "Show less" : `Show all ${ws.activity.length} events →`}
              </button>
            )}
          </Block>
        </div>
      </div>
    </div>
  );
}

/** Six coarse segments, each carrying its own word, with the precise state named
 *  underneath. Colour never carries the meaning on its own. */
function PhaseRibbon({ phase, stateLabel, waitingOn, days }: {
  phase: OpsPhase; stateLabel: string; waitingOn: string; days: number | null;
}) {
  const now = OPS_PHASES.indexOf(phase);
  return (
    <div className="mt-3.5">
      <div className="flex">
        {OPS_PHASES.map((ph, i) => {
          const passed = i < now, current = i === now;
          return (
            <div key={ph}
              className="flex-1 px-2.5 py-1.5 text-[11px] text-center border-r last:border-r-0"
              style={{
                background: passed ? SAGE : "transparent",
                borderColor: "rgba(0,0,0,0.08)",
                borderTop: `1px solid rgba(0,0,0,0.08)`,
                borderBottom: current ? `2px solid ${SAGE}` : "1px solid rgba(0,0,0,0.08)",
                color: passed ? "#fff" : current ? INK : MUTED,
                fontWeight: current ? 600 : 400,
              }}>
              {ph}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[13px]" style={{ color: MUTED }}>
        <span style={{ color: INK }}>Now · {stateLabel}</span>
        {" · "}waiting on {waitingOn.toLowerCase()}
        {days != null && <> · <span style={MONO}>{days}</span> day{days === 1 ? "" : "s"} in this state</>}
      </p>
    </div>
  );
}

function VersionTab({ label, meta, active, onClick }: { label: string; meta: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="px-3.5 py-2 text-left border border-b-0 -mr-px"
      style={{
        background: active ? "#fff" : "transparent",
        borderColor: "rgba(0,0,0,0.1)",
        color: active ? INK : MUTED,
      }}>
      <span className="block text-[13px]" style={{ fontWeight: active ? 600 : 400 }}>{label}</span>
      <span className="block text-[11px]" style={{ ...MONO, color: MUTED }}>{meta}</span>
    </button>
  );
}

function Block({ title, meta, icon, children }: { title: string; meta?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-black/8 mt-4 lg:mt-0">
      <div className="px-4 py-2.5 border-b border-black/8 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.14em] flex items-center gap-1.5" style={{ color: MUTED }}>
          {icon}{title}
        </span>
        {meta && <span className="text-[11px]" style={{ ...MONO, color: MUTED }}>{meta}</span>}
      </div>
      {children}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) =>
  <p className="px-4 py-4 text-[13px]" style={{ color: MUTED }}>{children}</p>;

/** One line. Editable only in the pricing states and only on the live draft —
 *  the server refuses edits anywhere else, and a Save button that silently 404s
 *  is worse than no Save button. */
function LineRow({ line, editable, busy, onSaved, onError }: {
  line: {
    id: string; code: string; productName: string; room: string; width: string; height: string;
    qty: number; lineTotal: number | null; status: string;
    lineKind: string; segments: OpsSegment[]; productSlug: string;
  };
  editable: boolean; busy: boolean;
  onSaved: () => void; onError: (m: string) => void;
}) {
  const [w, setW] = useState(line.width);
  const [h, setH] = useState(line.height);
  const [qty, setQty] = useState(String(line.qty));
  const [saving, setSaving] = useState(false);
  const [splitting, setSplitting] = useState(false);

  // Re-sync when the record reloads under us (someone else's edit, or our own).
  useEffect(() => { setW(line.width); setH(line.height); setQty(String(line.qty)); },
    [line.width, line.height, line.qty]);

  const dirty = editable && (w !== line.width || h !== line.height || qty !== String(line.qty));
  const save = async () => {
    setSaving(true);
    try {
      await opsPatchLine(line.id, { width: w, height: h, qty: Math.max(1, parseInt(qty) || 1) });
      onSaved();
    } catch (e) {
      onError(e instanceof OpsApiError ? (ACTION_ERRORS[e.code] ?? "That line could not be saved.") : "That line could not be saved.");
    } finally { setSaving(false); }
  };

  const cell = "border border-black/12 px-1.5 py-1 text-right w-[68px] bg-white";
  const composite = line.lineKind === "composite_parent";
  return (
    <>
    <tr className="border-t border-black/5">
      <td className="px-4 py-2" style={{ ...MONO, color: SAGE }}>{line.code || "—"}</td>
      <td className="px-3 py-2" style={{ color: INK }}>
        {line.productName}
        {line.room && <span className="block text-[11px]" style={{ color: MUTED }}>{line.room}</span>}
        {composite && (
          <span className="block text-[11px]" style={{ ...MONO, color: SAGE }}>
            composite · {line.segments.length} joined unit{line.segments.length === 1 ? "" : "s"}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right" style={{ ...MONO, color: MUTED }}>
        {editable ? (
          <span className="inline-flex items-center gap-1">
            <input value={w} onChange={(e) => setW(e.target.value)} inputMode="numeric" className={cell} style={MONO} />
            <span>×</span>
            <input value={h} onChange={(e) => setH(e.target.value)} inputMode="numeric" className={cell} style={MONO} />
          </span>
        ) : (line.width && line.height ? `${line.width} × ${line.height}` : "—")}
      </td>
      <td className="px-3 py-2 text-right" style={{ ...MONO, color: MUTED }}>
        {editable
          ? <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className={`${cell} w-[52px]`} style={MONO} />
          : line.qty}
      </td>
      <td className="px-3 py-2 text-right" style={{ ...MONO, color: INK }}>{money(line.lineTotal)}</td>
      <td className="px-4 py-2 text-[12px]">
        {dirty ? (
          <button onClick={save} disabled={saving || busy}
            className="text-xs text-white px-2.5 py-1 disabled:opacity-40" style={{ background: SAGE }}>
            {saving ? "Saving…" : "Save"}
          </button>
        ) : (
          <span className="flex items-center gap-2">
            {/* Never colour alone — the word carries the state. */}
            <span style={{ color: line.status === "ready" ? SAGE : "#8a6a2a" }}>
              {line.status === "ready" ? "ready" : "needs review"}
            </span>
            {editable && (
              <button onClick={() => setSplitting((v) => !v)} disabled={busy}
                className="underline underline-offset-2" style={{ color: SAGE }}>
                {composite ? "units" : "split"}
              </button>
            )}
          </span>
        )}
      </td>
    </tr>

    {/* The segments of a composite, nested under their parent. Display only:
        the parent's total is authoritative and these are never summed. */}
    {composite && line.segments.map((sg, i) => (
      <tr key={sg.id} className="border-t border-black/5" style={{ background: "rgba(90,122,106,0.04)" }}>
        <td className="px-4 py-1.5 text-right" style={{ ...MONO, color: MUTED }}>{i + 1}.</td>
        <td className="px-3 py-1.5 text-[13px]" style={{ color: MUTED }}>{sg.productName}</td>
        <td className="px-3 py-1.5 text-right text-[13px]" style={{ ...MONO, color: MUTED }}>{sg.width} × {sg.height}</td>
        <td className="px-3 py-1.5 text-right text-[13px]" style={{ ...MONO, color: MUTED }}>
          {sg.qtyPerParent}× per opening
        </td>
        <td className="px-3 py-1.5 text-right text-[13px]" style={{ ...MONO, color: MUTED }}>{money(sg.lineTotal)}</td>
        <td />
      </tr>
    ))}

    {splitting && (
      <tr>
        <td colSpan={6} className="px-4 py-4" style={{ background: "rgba(90,122,106,0.06)" }}>
          <SplitPanel line={line} composite={composite} busy={busy}
            onDone={() => { setSplitting(false); onSaved(); }}
            onError={onError} />
        </td>
      </tr>
    )}
    </>
  );
}

/** Plan one opening as several joined frames.
 *
 *  This is the surface that did not exist: splitLine/mergeComposite have been in
 *  the Worker since the composite work and had NO caller, so a 3500mm door that
 *  no single unit is made at could be flagged but never actually resolved.
 *
 *  The proposal is an even split the reviewer then corrects — never a silently
 *  applied answer. Coverage is REPORTED, not vetoed: a deliberate overlap or a
 *  joiner allowance is a real decision, and the server records the delta. */
function SplitPanel({ line, composite, busy, onDone, onError }: {
  line: { id: string; width: string; height: string; productSlug: string; segments: OpsSegment[] };
  composite: boolean; busy: boolean;
  onDone: () => void; onError: (m: string) => void;
}) {
  const openingW = parseInt(line.width) || 0;
  const openingH = parseInt(line.height) || 0;
  const [count, setCount] = useState(Math.max(2, line.segments.length || 2));
  const [widths, setWidths] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  // An even split across the opening, recomputed whenever the count changes.
  // Remainder lands on the LAST unit so the widths sum exactly.
  useEffect(() => {
    const base = Math.floor(openingW / count);
    setWidths(Array.from({ length: count }, (_, i) => (i === count - 1 ? openingW - base * (count - 1) : base)));
  }, [count, openingW]);

  const spanned = widths.reduce((s, w) => s + (w || 0), 0);
  const delta = spanned - openingW;

  const apply = async () => {
    setSaving(true);
    try {
      await opsSplitLine(line.id, {
        axis: "vertical",
        segments: widths.map((w) => ({
          widthMm: w, heightMm: openingH, productSlug: line.productSlug, qtyPerParent: 1,
        })),
      });
      onDone();
    } catch (e) {
      onError(e instanceof OpsApiError ? (e.code === "invalid_split" ? "That split isn't buildable — check the unit widths." : ACTION_ERRORS[e.code] ?? "The split could not be applied.") : "The split could not be applied.");
    } finally { setSaving(false); }
  };

  const merge = async () => {
    setSaving(true);
    try { await opsMergeComposite(line.id); onDone(); }
    catch { onError("The composite could not be merged back."); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <p className="text-[13px] mb-2.5" style={{ color: INK }}>
        Build this {openingW} × {openingH} mm opening as joined units, side by side.
      </p>
      <div className="flex flex-wrap items-end gap-3 mb-2.5">
        <label className="text-[12px]" style={{ color: MUTED }}>
          Units
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}
            className="ml-2 border border-black/15 px-2 py-1 text-sm bg-white" style={{ color: INK }}>
            {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {widths.map((w, i) => (
          <label key={i} className="text-[12px]" style={{ color: MUTED }}>
            Unit {i + 1} width
            <input value={String(w)} inputMode="numeric"
              onChange={(e) => setWidths(widths.map((x, j) => (j === i ? Number(e.target.value) || 0 : x)))}
              className="ml-2 border border-black/15 px-2 py-1 text-sm w-[76px] text-right bg-white" style={MONO} />
          </label>
        ))}
      </div>
      {/* Coverage is reported, never vetoed — a joiner allowance is a real
          decision and the server records the delta either way. */}
      <p className="text-[12px] mb-3" style={{ color: delta === 0 ? MUTED : "#8a6a2a" }}>
        {delta === 0
          ? `Units span ${spanned} mm — exactly the opening.`
          : `Units span ${spanned} mm, ${Math.abs(delta)} mm ${delta > 0 ? "more than" : "less than"} the opening. Allowed — it is recorded on the line.`}
      </p>
      <div className="flex items-center gap-2">
        <button onClick={apply} disabled={saving || busy || widths.some((w) => !w)}
          className="text-sm text-white px-3.5 py-2 disabled:opacity-40" style={{ background: SAGE }}>
          {saving ? "Applying…" : composite ? "Re-split" : "Split into units"}
        </button>
        {composite && (
          <button onClick={merge} disabled={saving || busy} className="text-sm px-3 py-2 border border-black/15" style={{ color: INK }}>
            Merge back to one
          </button>
        )}
      </div>
    </div>
  );
}
