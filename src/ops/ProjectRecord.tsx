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
import { Fragment, useEffect, useState } from "react";
import { ChevronLeft, Loader2, FileText, Paperclip, History as HistoryIcon } from "lucide-react";
import {
  OpsApiError, opsProject, opsStartPricing, opsSetStatus, opsIssueRevision,
  opsRequestClarification, opsAddNote, opsPatchLine, opsAdvanceOrder, opsPayOrder,
  opsSplitLine, opsMergeComposite,
  opsPatchSegment, opsAddSegment, opsRemoveSegment, opsLinePricePreview,
  OPS_PHASES, type OpsWorkspace, type OpsPhase, type OpsRecordAction, type OpsSegment,
  type OpsCompositePolicy,
} from "./api";
// The SAME editor the customer configures an opening with. Ops hydrates the same
// Sanity catalogue (src/ops/main.tsx), so product and option metadata are already
// here; reusing it is what stops the console growing a second, drifting
// implementation of product picking, option defaults and range checks.
import { ItemForm } from "../components/ItemComposer";

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
    ? contractLines.map((l) => ({ id: l.id, code: l.code, productName: l.productName, room: l.room, width: l.width, height: l.height, qty: l.qty, lineTotal: l.lineTotal, status: "ready", lineKind: "simple", segments: [] as OpsSegment[], productSlug: "", options: {} as Record<string, string>, compositeAxis: null as string | null }))
    : ws.lines.map((l) => ({ id: l.id, code: l.code, productName: l.productName, room: l.room, width: l.width, height: l.height, qty: l.qty, lineTotal: l.lineTotal, status: l.status, lineKind: l.lineKind ?? "simple", segments: l.segments ?? [], productSlug: l.productSlug, options: l.options ?? {}, compositeAxis: l.compositeAxis ?? null }));
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
      <div className="card px-5 py-4 mb-4">
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

          <div className="card">
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
                    policy={ws.compositePolicy} siblings={rows}
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
    <div className="card mt-4 lg:mt-0">
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

/** One line — an OPENING — and, when it is a composite, the units inside it.
 *
 *  Editable only in the pricing states and only on the live draft: the server
 *  refuses edits anywhere else, and a Save button that silently 404s is worse
 *  than no Save button.
 *
 *  The editor is ItemForm — the SAME component the customer configures with.
 *  It was tempting to build a compact per-unit product select plus an options
 *  disclosure here, and that would have been a second implementation of product
 *  picking, option defaulting, range checking and debounced live pricing, drifting
 *  from the customer's the moment either changed. Ops already hydrates the same
 *  Sanity catalogue, so the only things the form actually needed were a narrower
 *  quote prop and an injectable price function.
 *
 *  A unit renders it with scope="unit": no item code and no room (one opening,
 *  one architect tag) and no quantity box, because a unit's quantity is derived
 *  from the opening's and composite.ts is its only writer. */
function LineRow({ line, editable, busy, policy, siblings, onSaved, onError }: {
  line: {
    id: string; code: string; productName: string; room: string; width: string; height: string;
    qty: number; lineTotal: number | null; status: string;
    lineKind: string; segments: OpsSegment[]; productSlug: string;
    options: Record<string, string>; compositeAxis: string | null;
  };
  editable: boolean; busy: boolean;
  policy?: OpsCompositePolicy;
  siblings: { code: string }[];
  onSaved: () => void; onError: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [editingUnit, setEditingUnit] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const composite = line.lineKind === "composite_parent";
  const axis: "vertical" | "horizontal" = line.compositeAxis === "horizontal" ? "horizontal" : "vertical";
  // ItemForm reads `items` only — for the duplicate-code check. The record's own
  // lines ARE the sibling set, so a reviewer renaming W01 to W02 is told.
  const quoteLike = { items: siblings.map((s, i) => ({ id: i, code: s.code })) } as never;

  const fail = (e: unknown, fallback: string) =>
    onError(e instanceof OpsApiError ? (ACTION_ERRORS[e.code] ?? fallback) : fallback);

  const saveLine = async (built: { productSlug: string; width: string; height: string; options: Record<string, string>; qty: number; code: string; location: string }) => {
    setSaving(true);
    try {
      await opsPatchLine(line.id, {
        productSlug: built.productSlug, width: built.width, height: built.height,
        options: built.options, qty: built.qty, code: built.code, room: built.location,
      });
      setEditing(false);
      onSaved();
    } catch (e) { fail(e, "That line could not be saved."); }
    finally { setSaving(false); }
  };

  const saveUnit = async (segId: string, built: { productSlug: string; width: string; height: string; options: Record<string, string> }) => {
    setSaving(true);
    try {
      // Only the along-axis dimension is sent. Across the join the unit must span
      // the opening exactly — validateSplit treats a mismatch as a hard error,
      // not a coverage allowance — so the server derives it and the form's value
      // for it is ignored rather than being able to produce an unbuildable unit.
      await opsPatchSegment(segId, {
        productSlug: built.productSlug,
        options: built.options,
        alongMm: parseInt(axis === "vertical" ? built.width : built.height) || 0,
      });
      setEditingUnit(null);
      onSaved();
    } catch (e) { fail(e, "That unit could not be saved."); }
    finally { setSaving(false); }
  };

  const addUnit = async () => {
    setSaving(true);
    try { await opsAddSegment(line.id); onSaved(); }
    catch (e) { fail(e, "A unit could not be added."); }
    finally { setSaving(false); }
  };

  const removeUnit = async (segId: string) => {
    setSaving(true);
    try { await opsRemoveSegment(segId); setConfirmRemove(null); onSaved(); }
    catch (e) { fail(e, "That unit could not be removed."); }
    finally { setSaving(false); }
  };

  // Coverage, measured along the join. Derived from what is on screen so it
  // agrees with the units listed beneath it; the server records its own on save.
  const openingAlong = parseInt(axis === "vertical" ? line.width : line.height) || 0;
  const spanned = line.segments.reduce((sum, s) => {
    const along = parseInt(axis === "vertical" ? s.width : s.height) || 0;
    return sum + along * Math.max(1, s.qtyPerParent);
  }, 0);
  const delta = openingAlong > 0 ? spanned - openingAlong : 0;
  const tolerance = policy?.toleranceMm ?? 0;
  const atMaxUnits = !!policy && line.segments.length >= policy.maxSegments;

  // After per-unit products, "Sliding Window" alone misdescribes the opening.
  const unitNames = [...new Set(line.segments.map((s) => s.productName))];

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
            {unitNames.length > 1 && ` · ${unitNames.join(" + ")}`}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right" style={{ ...MONO, color: MUTED }}>
        {line.width && line.height ? `${line.width} × ${line.height}` : "—"}
      </td>
      <td className="px-3 py-2 text-right" style={{ ...MONO, color: MUTED }}>{line.qty}</td>
      <td className="px-3 py-2 text-right" style={{ ...MONO, color: INK }}>{money(line.lineTotal)}</td>
      <td className="px-4 py-2 text-[12px]">
        <span className="flex items-center gap-2">
          {/* Never colour alone — the word carries the state. */}
          <span style={{ color: line.status === "ready" ? SAGE : "#8a6a2a" }}>
            {line.status === "ready" ? "ready" : "needs review"}
          </span>
          {editable && (
            <>
              <button onClick={() => { setEditing((v) => !v); setSplitting(false); }} disabled={busy}
                className="underline underline-offset-2" style={{ color: SAGE }}>
                {editing ? "close" : "edit"}
              </button>
              <button onClick={() => { setSplitting((v) => !v); setEditing(false); }} disabled={busy}
                className="underline underline-offset-2" style={{ color: SAGE }}>
                {composite ? "units" : "split"}
              </button>
            </>
          )}
        </span>
      </td>
    </tr>

    {editing && (
      <tr>
        <td colSpan={6} className="px-4 py-4" style={{ background: "rgba(90,122,106,0.06)" }}>
          <ItemForm
            quote={quoteLike}
            priceFn={opsLinePricePreview(line.id)}
            submitLabel={saving ? "Saving…" : "Save line"}
            seed={{
              code: line.code, productSlug: line.productSlug, location: line.room,
              width: line.width, height: line.height, options: line.options, qty: line.qty,
            }}
            onCommit={(built) => saveLine(built as never)}
            onCancel={() => setEditing(false)}
          />
        </td>
      </tr>
    )}

    {/* The units of a composite, nested under their opening. */}
    {composite && line.segments.map((sg, i) => (
      <Fragment key={sg.id}>
        <tr className="border-t border-black/5" style={{ background: "rgba(90,122,106,0.04)" }}>
          <td className="px-4 py-1.5 text-right" style={{ ...MONO, color: MUTED }}>{i + 1}.</td>
          <td className="px-3 py-1.5 text-[13px]" style={{ color: MUTED }}>
            {sg.productName}
            <SpecSummary unit={sg.options} opening={line.options} />
          </td>
          <td className="px-3 py-1.5 text-right text-[13px]" style={{ ...MONO, color: MUTED }}>
            {sg.width} × {sg.height}
          </td>
          <td className="px-3 py-1.5 text-right text-[13px]" style={{ ...MONO, color: MUTED }}>
            {sg.qtyPerParent}× per opening
          </td>
          <td className="px-3 py-1.5 text-right text-[13px]" style={{ ...MONO, color: MUTED }}>{money(sg.lineTotal)}</td>
          <td className="px-4 py-1.5 text-[12px]">
            {editable && (
              confirmRemove === sg.id ? (
                <span className="flex items-center gap-2">
                  <span style={{ color: INK }}>Remove unit {i + 1}?</span>
                  <button onClick={() => removeUnit(sg.id)} disabled={saving || busy}
                    className="underline underline-offset-2 text-red-600">Remove</button>
                  <button onClick={() => setConfirmRemove(null)} style={{ color: MUTED }}>Keep</button>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {sg.status !== "ready" && <span style={{ color: "#8a6a2a" }}>not priced</span>}
                  <button onClick={() => setEditingUnit(editingUnit === sg.id ? null : sg.id)} disabled={busy}
                    className="underline underline-offset-2" style={{ color: SAGE }}>
                    {editingUnit === sg.id ? "close" : "edit"}
                  </button>
                  <button onClick={() => setConfirmRemove(sg.id)} disabled={busy}
                    className="underline underline-offset-2" style={{ color: MUTED }}>remove</button>
                </span>
              )
            )}
          </td>
        </tr>
        {editingUnit === sg.id && (
          <tr>
            <td colSpan={6} className="px-4 py-4" style={{ background: "rgba(90,122,106,0.06)" }}>
              <p className="text-[12px] mb-2.5" style={{ color: MUTED }}>
                Unit {i + 1} of {line.code || "this opening"}.{" "}
                {axis === "vertical" ? "Height" : "Width"} is set by the opening
                ({axis === "vertical" ? line.height : line.width} mm) and cannot be changed here.
              </p>
              <ItemForm
                scope="unit"
                quote={quoteLike}
                priceFn={opsLinePricePreview(line.id)}
                submitLabel={saving ? "Saving…" : `Save unit ${i + 1}`}
                seed={{ productSlug: sg.productSlug, width: sg.width, height: sg.height, options: sg.options, qty: sg.qty }}
                onCommit={(built) => saveUnit(sg.id, built as never)}
                onCancel={() => setEditingUnit(null)}
              />
            </td>
          </tr>
        )}
      </Fragment>
    ))}

    {/* Coverage and unit count. Reported, never vetoed: a mullion or jamb
        allowance is a real engineering decision and the reviewer is the
        authority — so nothing here disables anything. */}
    {composite && (
      <tr style={{ background: "rgba(90,122,106,0.04)" }}>
        <td />
        <td colSpan={5} className="px-3 pb-2.5 pt-0.5">
          <span className="flex flex-wrap items-center justify-between gap-3">
            {editable ? (
              <button onClick={addUnit} disabled={saving || busy || atMaxUnits}
                className="text-[12px] underline underline-offset-2 disabled:no-underline disabled:opacity-50"
                style={{ color: atMaxUnits ? MUTED : SAGE }}>
                {atMaxUnits ? `Maximum ${policy?.maxSegments} units` : "+ Add unit"}
              </button>
            ) : <span />}
            <span className="text-[12px]" style={{ color: delta === 0 || Math.abs(delta) <= tolerance ? MUTED : "#8a6a2a" }}>
              {openingAlong === 0
                ? "The opening has no size."
                : delta === 0
                  ? `Units span ${spanned} mm — exactly the opening.`
                  : `Units span ${spanned} mm, ${Math.abs(delta)} mm ${delta > 0 ? "more than" : "less than"} the opening. Allowed — recorded on the line.`}
            </span>
          </span>
        </td>
      </tr>
    )}

    {splitting && (
      <tr>
        <td colSpan={6} className="px-4 py-4" style={{ background: "rgba(90,122,106,0.06)" }}>
          <SplitPanel line={line} composite={composite} busy={busy || saving} policy={policy}
            onDone={() => { setSplitting(false); onSaved(); }}
            onError={onError} />
        </td>
      </tr>
    )}
    </>
  );
}

/** How a unit's spec differs from the opening's. Options are COPIED from the
 *  opening when the composite is created, so "as the opening" is the common
 *  case and the reviewer is scanning for the exceptions. */
function SpecSummary({ unit, opening }: { unit: Record<string, string>; opening: Record<string, string> }) {
  const keys = [...new Set([...Object.keys(unit ?? {}), ...Object.keys(opening ?? {})])];
  const changed = keys.filter((k) => (unit?.[k] ?? "") !== (opening?.[k] ?? ""));
  if (!keys.length) return null;
  return (
    <span className="block text-[11px]" style={{ color: MUTED }}>
      {changed.length === 0
        ? "Spec: as the opening"
        : `Spec: ${changed.length} changed — ${changed.map((k) => `${k} ${unit?.[k] || "none"}`).join(", ")}`}
    </span>
  );
}

/** Plan one opening as several joined frames. CREATE ONLY.
 *
 *  It used to double as the editor, with a "Re-split" button. splitLine DELETEs
 *  every segment and recreates them, which was tolerable when a unit was nothing
 *  but a width and destroys real work now that a unit carries its own product and
 *  spec — so the server refuses a second split with 409 and changes go through
 *  the per-unit controls instead. The only way back to a blank slate is Merge,
 *  which says plainly that it discards the units.
 *
 *  The proposal is an even split the reviewer then corrects. Coverage is
 *  REPORTED, not vetoed. */
function SplitPanel({ line, composite, busy, policy, onDone, onError }: {
  line: { id: string; width: string; height: string; productSlug: string; segments: OpsSegment[] };
  composite: boolean; busy: boolean;
  policy?: OpsCompositePolicy;
  onDone: () => void; onError: (m: string) => void;
}) {
  const openingW = parseInt(line.width) || 0;
  const openingH = parseInt(line.height) || 0;
  const maxUnits = policy?.maxSegments ?? 4;
  const joiner = policy?.defaultJoinerMm ?? 0;
  const [axis, setAxis] = useState<"vertical" | "horizontal">("vertical");
  const [count, setCount] = useState(2);
  const [sizes, setSizes] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const openingAlong = axis === "vertical" ? openingW : openingH;

  // The same proposal the server makes: usable span less the joiner allowance
  // between units, remainder on the LAST unit so the sizes sum exactly. The
  // console used to divide the raw opening by the count, ignoring the allowance
  // entirely, so its starting numbers disagreed with proposeEvenSplit().
  useEffect(() => {
    const usable = openingAlong - joiner * (count - 1);
    const base = Math.floor(usable / count);
    setSizes(Array.from({ length: count }, (_, i) => (i === count - 1 ? usable - base * (count - 1) : base)));
  }, [count, openingAlong, joiner]);

  const spanned = sizes.reduce((s, w) => s + (w || 0), 0);
  const delta = spanned - openingAlong;
  const tolerance = policy?.toleranceMm ?? 0;

  const apply = async () => {
    setSaving(true);
    try {
      await opsSplitLine(line.id, {
        axis,
        // options are deliberately NOT sent: omitting them is what tells the
        // server to inherit the opening's spec for every unit.
        segments: sizes.map((v) => ({
          widthMm: axis === "vertical" ? v : openingW,
          heightMm: axis === "vertical" ? openingH : v,
          productSlug: line.productSlug, qtyPerParent: 1,
        })),
      });
      onDone();
    } catch (e) {
      onError(e instanceof OpsApiError
        ? (e.code === "invalid_split" ? "That split isn't buildable — check the unit sizes."
          : e.code === "already_composite" ? "This opening is already planned as units — edit them directly."
          : ACTION_ERRORS[e.code] ?? "The split could not be applied.")
        : "The split could not be applied.");
    } finally { setSaving(false); }
  };

  const merge = async () => {
    setSaving(true);
    try { await opsMergeComposite(line.id); onDone(); }
    catch { onError("The composite could not be merged back."); }
    finally { setSaving(false); }
  };

  if (composite) {
    return (
      <div>
        <p className="text-[13px] mb-2.5" style={{ color: INK }}>
          This opening is built as {line.segments.length} joined units. Edit them in the rows
          above — change a unit's product, its spec or its size, add a unit or remove one.
        </p>
        <p className="text-[12px] mb-3" style={{ color: MUTED }}>
          Merging discards all {line.segments.length} units and their spec, and returns this to one opening.
        </p>
        <button onClick={merge} disabled={saving || busy}
          className="text-sm px-3 py-2 border border-black/15" style={{ color: INK }}>
          {saving ? "Merging…" : "Merge back to one"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[13px] mb-2.5" style={{ color: INK }}>
        Build this {openingW} × {openingH} mm opening as joined units.
        Each unit keeps the opening's spec — change any of them afterwards.
      </p>
      <div className="flex flex-wrap items-end gap-4 mb-2.5">
        <span className="text-[12px]" style={{ color: MUTED }}>
          <span className="block mb-1">Joined</span>
          <span className="flex items-center gap-3">
            {([["vertical", "Side by side"], ["horizontal", "One above another"]] as const).map(([v, label]) => (
              <label key={v} className="flex items-center gap-1.5" style={{ color: INK }}>
                <input type="radio" name={`axis-${line.id}`} checked={axis === v} onChange={() => setAxis(v)} />
                {label}
              </label>
            ))}
          </span>
        </span>
        <label className="text-[12px]" style={{ color: MUTED }}>
          Units
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}
            className="ml-2 border border-black/15 px-2 py-1 text-sm bg-white" style={{ color: INK }}>
            {Array.from({ length: Math.max(0, maxUnits - 1) }, (_, i) => i + 2)
              .map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {sizes.map((v, i) => (
          <label key={i} className="text-[12px]" style={{ color: MUTED }}>
            Unit {i + 1} {axis === "vertical" ? "width" : "height"}
            <input value={String(v)} inputMode="numeric"
              onChange={(e) => setSizes(sizes.map((x, j) => (j === i ? Number(e.target.value) || 0 : x)))}
              className="ml-2 border border-black/15 px-2 py-1 text-sm w-[76px] text-right bg-white" style={MONO} />
          </label>
        ))}
      </div>
      <p className="text-[12px] mb-3" style={{ color: delta === 0 || Math.abs(delta) <= tolerance ? MUTED : "#8a6a2a" }}>
        {delta === 0
          ? `Units span ${spanned} mm — exactly the opening.`
          : `Units span ${spanned} mm, ${Math.abs(delta)} mm ${delta > 0 ? "more than" : "less than"} the opening. Allowed — it is recorded on the line.`}
      </p>
      <button onClick={apply} disabled={saving || busy || sizes.some((v) => !v)}
        className="text-sm text-white px-3.5 py-2 disabled:opacity-40" style={{ background: SAGE }}>
        {saving ? "Applying…" : "Split into units"}
      </button>
    </div>
  );
}
