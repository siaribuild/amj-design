// Ops → Projects: ONE record, whole lifecycle, on one plane.
//
// A project, the quote revisions issued from it and the order it becomes are the
// same job at different moments — `order` is 1:1 with `project`, and every order
// query already joins the project back in. Splitting them across a Quotes tab and
// an Orders tab made a staffer cross a boundary that exists only in storage.
//
// READ-ONLY for now (Slice 1). Actions land next; until then the existing Quotes
// and Orders tabs remain the places where work happens, so nothing is lost while
// this is proven against real records.
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
import { opsProject, OPS_PHASES, type OpsWorkspace, type OpsPhase } from "./api";

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

export function ProjectRecord({ id, onBack }: { id: string; onBack: () => void }) {
  const [ws, setWs] = useState<OpsWorkspace | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  // Which version is being viewed: null = the live draft.
  const [revisionId, setRevisionId] = useState<string | null>(null);

  useEffect(() => { opsProject(id).then(setWs).catch(() => setWs(null)); }, [id]);
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
    ? contractLines.map((l) => ({ id: l.id, code: l.code, productName: l.productName, room: l.room, width: l.width, height: l.height, qty: l.qty, lineTotal: l.lineTotal, status: "ready" }))
    : ws.lines.map((l) => ({ id: l.id, code: l.code, productName: l.productName, room: l.room, width: l.width, height: l.height, qty: l.qty, lineTotal: l.lineTotal, status: l.status }));
  const total = rows.reduce((s, l) => s + (l.lineTotal ?? 0), 0);

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
                  <tr key={l.id} className="border-t border-black/5">
                    <td className="px-4 py-2" style={{ ...MONO, color: SAGE }}>{l.code || "—"}</td>
                    <td className="px-3 py-2" style={{ color: INK }}>
                      {l.productName}
                      {l.room && <span className="block text-[11px]" style={{ color: MUTED }}>{l.room}</span>}
                    </td>
                    <td className="px-3 py-2 text-right" style={{ ...MONO, color: MUTED }}>{l.width && l.height ? `${l.width} × ${l.height}` : "—"}</td>
                    <td className="px-3 py-2 text-right" style={{ ...MONO, color: MUTED }}>{l.qty}</td>
                    <td className="px-3 py-2 text-right" style={{ ...MONO, color: INK }}>{money(l.lineTotal)}</td>
                    <td className="px-4 py-2 text-[12px]" style={{ color: l.status === "ready" ? SAGE : "#8a6a2a" }}>
                      {l.status === "ready" ? "ready" : "needs review"}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-sm" style={{ color: MUTED }}>No lines on this project.</td></tr>
                )}
              </tbody>
            </table>
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
