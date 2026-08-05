// className="font-data" Ops → Projects: ONE record, whole lifecycle, on one plane.
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
import { SAGE, INK, QUIET as MUTED } from "../styles/tokens";
import { Fragment, useEffect, useState } from "react";
import { ChevronLeft, Loader2, FileText, Paperclip, History as HistoryIcon } from "lucide-react";
import {
  OpsApiError, opsProject, opsStartPricing, opsSetStatus, opsIssueRevision,
  opsRequestClarification, opsAddNote, opsPatchLine, opsAdvanceOrder, opsPayOrder,
  opsSplitLine, opsMergeComposite,
  opsPatchSegment, opsAddSegment, opsRemoveSegment, opsLinePricePreview,
  opsLineConfigurations, opsRecommendationOutcomes, opsAdjudicateRecommendationOutcome,
  opsThermal,
  OPS_PHASES, type OpsWorkspace, type OpsPhase, type OpsRecordAction, type OpsSegment,
  type OpsCompositePolicy, type OpsExactConfiguration, type OpsRecommendationOutcome,
  type OpsRecommendationReason, type OpsThermalRow, type OpsThermalCounts,
} from "./api";
// The SAME editor the customer configures an opening with. Ops hydrates the same
// Sanity catalogue (src/ops/main.tsx), so product and option metadata are already
// here; reusing it is what stops the console growing a second, drifting
// implementation of product picking, option defaults and range checks.
import { ItemForm } from "../components/ItemComposer";

const MONO = {  } as const;

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
  valid_thermal_target_required: "Enter a valid Uw and SHGC range before using this lesson.",
  thermal_review_role_required: "Your account cannot approve a thermal learning target.",
  not_found_or_final: "This learning decision was already finalized. Reload to see its current state.",
  configuration_not_eligible: "That frame and glazing configuration is no longer eligible. Reload the configurations and choose again.",
  selected_variant_required: "Choose an exact frame and glazing configuration before saving.",
  exact_pricing_unavailable: "That configuration does not currently have a complete exact price.",
};

const humanLabel = (value: string) => value
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .replaceAll("_", " ")
  .toLowerCase()
  .replace(/\b\w/g, (char) => char.toUpperCase());

const reviewReasons = (review: Record<string, unknown> | null): string[] =>
  Object.entries(review ?? {}).map(([key, value]) => {
    const label = key === "noLongerInDocuments"
      ? "No longer in current documents"
      : key === "thermalRecommendation"
        ? "Thermal configuration"
        : humanLabel(key);
    return typeof value === "string" && value.trim() && value !== "true"
      ? `${label}: ${value}`
      : label;
  });

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
  const [learning, setLearning] = useState<{
    outcomes: OpsRecommendationOutcome[];
    reasonOptions: OpsRecommendationReason[];
    status: "loading" | "ready" | "error";
  }>({ outcomes: [], reasonOptions: [], status: "loading" });
  const [thermal, setThermal] = useState<{
    rows: OpsThermalRow[];
    counts: OpsThermalCounts | null;
    status: "loading" | "ready" | "error";
  }>({ rows: [], counts: null, status: "loading" });

  const load = async () => {
    try {
      setWs(await opsProject(id));
    } catch {
      setWs(null);
      return;
    }
    setLearning((current) => ({ ...current, status: "loading" }));
    try {
      const result = await opsRecommendationOutcomes(id);
      setLearning({ ...result, status: "ready" });
    } catch {
      setLearning((current) => ({ ...current, status: "error" }));
    }
    // Independent of the learning fetch: the audit is the surface you reach for
    // when something looks wrong, so one failing does not blank the other.
    setThermal((current) => ({ ...current, status: "loading" }));
    try {
      const result = await opsThermal(id);
      setThermal({ rows: result.rows, counts: result.counts, status: "ready" });
    } catch {
      setThermal((current) => ({ ...current, status: "error" }));
    }
  };
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
    ? contractLines.map((l) => ({ id: l.id, code: l.code, productName: l.productName, room: l.room, width: l.width, height: l.height, qty: l.qty, lineTotal: l.lineTotal, status: "ready", lineKind: "simple", segments: [] as OpsSegment[], productSlug: "", options: {} as Record<string, string>, compositeAxis: null as string | null, origin: "revision", selectedVariantId: null as string | null, review: null as Record<string, string> | null }))
    : ws.lines.map((l) => ({ id: l.id, code: l.code, productName: l.productName, room: l.room, width: l.width, height: l.height, qty: l.qty, lineTotal: l.lineTotal, status: l.status, lineKind: l.lineKind ?? "simple", segments: l.segments ?? [], productSlug: l.productSlug, options: l.options ?? {}, compositeAxis: l.compositeAxis ?? null, origin: l.origin, selectedVariantId: l.selectedVariantId, review: l.review }));
  const total = rows.reduce((s, l) => s + (l.lineTotal ?? 0), 0);

  // Three modes, and the difference must be visible. The server only accepts line
  // edits in the pricing states, so rendering inputs anywhere else produces a
  // Save that silently 404s — which is exactly what the old workspace did once a
  // quote was issued.
  const EDITABLE = new Set(["submitted", "triage_pending", "estimator_assigned", "technical_review_required", "customer_clarification_required"]);
  const editable = !revisionId && !showingContract && EDITABLE.has(p.statusInternal);

  return (
    <div className="max-w-[1180px]">
      <button onClick={onBack} className="flex items-center gap-1 mb-3 t-cap" style={{ color: MUTED }}>
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
            <h2 className="t-bd-lg font-display" style={{ color: INK }}>
              <span className="font-data">{p.publicRef ?? id.slice(0, 8)}</span>
              <span style={{ color: MUTED }}> · </span>
              {p.title}
            </h2>
            <p className="mt-0.5 t-bd-sm" style={{ color: MUTED }}>
              {[p.org, p.customerName ?? p.contactName, p.customerEmail ?? p.contactEmail].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right">
            <div className="t-bd-lg font-data" style={{ color: INK }}>{money(total)}</div>
            <div className="t-cap" style={{ color: MUTED }}>
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
                    className="px-3.5 py-2 disabled:opacity-45 disabled:cursor-not-allowed t-bd-sm"
                    style={primary
                      ? { background: SAGE, color: "#fff" }
                      : { border: "1px solid rgba(0,0,0,0.15)", color: INK, background: "#fff" }}>
                    {a.label}
                  </button>
                  {blocked && <span className="t-cap" style={{ color: "var(--warning-ink)" }}>{a.blockedReason}</span>}
                </span>
              );
            })}
          </div>
        )}

        {/* Confirm in place — the record stays on screen while the decision is
            made. A modal would hide the very thing being decided about. */}
        {confirming && (
          <div className="mt-3 border p-4" style={{ borderColor: "rgba(90,122,106,0.35)", background: "rgba(90,122,106,0.06)" }}>
            <p className="mb-1 t-bd-sm" style={{ color: INK }}>{confirming.label}?</p>
            {confirming.confirm && <p className="mb-2.5 t-cap" style={{ color: MUTED }}>{confirming.confirm}</p>}
            {(confirming.id.startsWith("pay:") || confirming.id === "note" || confirming.id === "request-clarification") && (
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus
                onKeyDown={(e) => { if (e.key === "Escape") setConfirming(null); }}
                placeholder={confirming.id.startsWith("pay:") ? "Bank reference, e.g. EFT-4821"
                  : confirming.id === "note" ? "What should the file record?" : "What do you need from the customer?"}
                className="w-full border border-black/15 px-2.5 py-1.5 bg-white mb-3 t-bd-sm"
                style={confirming.id.startsWith("pay:") ? MONO : undefined} />
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => perform(confirming)}
                disabled={busy || ((confirming.id.startsWith("pay:") || confirming.id === "note" || confirming.id === "request-clarification") && !confirmText.trim())}
                className="text-white px-3.5 py-2 disabled:opacity-40 t-bd-sm" style={{ background: SAGE }}>
                Confirm
              </button>
              <button onClick={() => setConfirming(null)} disabled={busy} className="px-3 py-2 t-bd-sm" style={{ color: MUTED }}>Cancel</button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" aria-live="assertive" className="mt-3 px-3 py-2 border t-cap" style={{ background: "rgba(180,60,40,0.07)", borderColor: "rgba(180,60,40,0.28)", color: "#8a3b2a" }}>{error}</p>
        )}

        {/* The blocker, said once, in the header — not discovered at the bottom. */}
        {p.unresolvedLineCount > 0 && (
          <p className="mt-3 px-3 py-2 border t-cap" style={{ background: "rgba(180,120,40,0.09)", borderColor: "rgba(180,120,40,0.3)", color: "var(--warning-ink)" }}>
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
            <div className="border border-black/10 border-b-0 px-4 py-2 t-cap" style={{ background: "rgba(90,122,106,0.07)", color: "var(--sage-ink)" }}>
              Viewing an issued revision — read-only.{" "}
              <button onClick={() => setRevisionId(null)} className="underline underline-offset-2">Back to the live draft</button>
            </div>
          )}

          <div className="card">
            <div className="px-4 py-2.5 border-b border-black/8 flex items-center justify-between">
              <span className="t-label" style={{ color: MUTED }}>
                {revisionId ? "Issued lines" : showingContract ? "Contract lines" : "Draft lines"}
              </span>
              <span className="t-cap" style={{ color: MUTED }}>{rows.length} lines</span>
            </div>
            {/* Contained rather than carded — line cards for the record plane are
                still pending. Without this the table's min-content width widens
                the whole document instead of scrolling inside its own panel. */}
            <div className="overflow-x-auto">
            <table className="w-full t-bd-sm">
              <thead>
                <tr className="t-label" style={{ color: MUTED }}>
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
                  <tr><td colSpan={6} className="px-4 py-6 text-center t-bd-sm" style={{ color: MUTED }}>No lines on this project.</td></tr>
                )}
              </tbody>
            </table>
            </div>
          </div>

          {thermal.status === "loading" && (
            <Block title="Thermal audit">
              <p role="status" className="px-4 py-3 t-cap" style={{ color: MUTED }}>
                Loading thermal targets...
              </p>
            </Block>
          )}
          {thermal.status === "error" && (
            <Block title="Thermal audit">
              <div role="alert" className="px-4 py-3 t-cap" style={{ color: "var(--warning-ink)" }}>
                Thermal targets could not be loaded.{" "}
                <button onClick={() => void load()} className="underline underline-offset-2" style={{ color: SAGE }}>
                  Try again
                </button>
              </div>
            </Block>
          )}
          {thermal.status === "ready" && thermal.counts && (
            <ThermalAudit rows={thermal.rows} counts={thermal.counts} />
          )}

          {ws.revisions.length > 0 && learning.status === "loading" && (
            <Block title="Teach future estimates">
              <p role="status" className="px-4 py-3 t-cap" style={{ color: MUTED }}>
                Loading learning decisions...
              </p>
            </Block>
          )}
          {ws.revisions.length > 0 && learning.status === "error" && (
            <Block title="Teach future estimates">
              <div role="alert" className="px-4 py-3 t-cap" style={{ color: "var(--warning-ink)" }}>
                Learning decisions could not be loaded.{" "}
                <button onClick={() => void load()} className="underline underline-offset-2" style={{ color: SAGE }}>
                  Try again
                </button>
              </div>
            </Block>
          )}
          {learning.status === "ready" &&
            learning.outcomes.some((outcome) => outcome.quality_state === "pending" && outcome.decision === "adjusted") && (
            <LearningReview
              outcomes={learning.outcomes}
              reasons={learning.reasonOptions}
              busy={busy}
              onRun={run}
            />
          )}

          {ws.comments.length > 0 && (
            <Block title="Notes" icon={<FileText className="w-3.5 h-3.5" />}>
              {ws.comments.slice(0, 6).map((cm) => (
                <div key={cm.id} className="px-4 py-2.5 border-b border-black/5 last:border-0 border-l-2" style={{ borderLeftColor: SAGE }}>
                  <p className="t-cap" style={{ color: INK }}>{cm.body}</p>
                  <p className="mt-0.5 t-cap font-data" style={{ color: MUTED }}>
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
                  <span className="t-cap" style={{ color: INK }}>
                    {pay.kind} <span style={{ color: MUTED }}>· {pay.percent}%</span>
                    {pay.reference && <span className="block t-cap font-data" style={{ color: MUTED }}>{pay.reference}</span>}
                  </span>
                  <span className="text-right">
                    <span className="block t-cap font-data" style={{ color: INK }}>{money(pay.amount)}</span>
                    <span className="block t-cap" style={{ color: pay.status === "paid" ? SAGE : MUTED }}>{pay.status}</span>
                  </span>
                </div>
              ))}
              {(ws.payments ?? []).length === 0 && <Empty>No payments recorded.</Empty>}
              <div className="px-4 py-2 border-t border-black/5 t-cap" style={{ color: MUTED }}>
                Order no. <span className="font-data">{order.orderNo}</span> · appears on invoices
              </div>
            </Block>
          )}

          <Block title="Files" icon={<Paperclip className="w-3.5 h-3.5" />} meta={String(ws.files.length)}>
            {ws.files.map((f) => (
              <div key={f.id} className="px-4 py-2.5 border-b border-black/5 last:border-0 flex items-baseline justify-between gap-2">
                <span className="truncate t-cap" style={{ color: INK }}>{f.filename}</span>
                <span className="flex-shrink-0 t-cap font-data" style={{ color: f.virus_status === "clean" ? MUTED : "var(--warning)" }}>
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
                <p className="t-cap" style={{ color: INK }}>{a.action}</p>
                <p className="t-cap font-data" style={{ color: MUTED }}>{a.actor ?? "system"} · {when(a.occurred_at)}</p>
              </div>
            ))}
            {ws.activity.length === 0 && <Empty>Nothing has happened yet.</Empty>}
            {ws.activity.length > 8 && (
              <button onClick={() => setShowAllHistory((v) => !v)}
                className="w-full px-4 py-2 text-left border-t border-black/5 t-cap" style={{ color: SAGE }}>
                {showAllHistory ? "Show less" : `Show all ${ws.activity.length} events →`}
              </button>
            )}
          </Block>
        </div>
      </div>
    </div>
  );
}

function LearningReview({ outcomes, reasons, busy, onRun }: {
  outcomes: OpsRecommendationOutcome[];
  reasons: OpsRecommendationReason[];
  busy: boolean;
  onRun: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const pending = outcomes.filter((outcome) =>
    outcome.quality_state === "pending" && outcome.decision === "adjusted");
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [thermalById, setThermalById] = useState<Record<string, {
    maxUValue: string; minShgc: string; maxShgc: string;
  }>>({});
  const [confirming, setConfirming] = useState<{ id: string; action: "approve" | "reject" } | null>(null);

  const thermalError = (
    reason: OpsRecommendationReason | undefined,
    thermal: { maxUValue: string; minShgc: string; maxShgc: string },
  ): string => {
    if (!reason?.learnsThermalTarget) return "";
    const maxU = Number(thermal.maxUValue);
    const minShgc = thermal.minShgc === "" ? null : Number(thermal.minShgc);
    const maxShgc = thermal.maxShgc === "" ? null : Number(thermal.maxShgc);
    if (thermal.maxUValue.trim() === "" || !Number.isFinite(maxU) || maxU < 0.5 || maxU > 10) {
      return "Maximum Uw must be between 0.5 and 10.";
    }
    if (minShgc != null && (!Number.isFinite(minShgc) || minShgc < 0 || minShgc > 1)) {
      return "Minimum SHGC must be between 0 and 1.";
    }
    if (maxShgc != null && (!Number.isFinite(maxShgc) || maxShgc < 0 || maxShgc > 1)) {
      return "Maximum SHGC must be between 0 and 1.";
    }
    if (minShgc != null && maxShgc != null && minShgc > maxShgc) {
      return "Minimum SHGC cannot be greater than maximum SHGC.";
    }
    return "";
  };

  return (
    <Block title="Teach future estimates" meta={`${pending.length} decision${pending.length === 1 ? "" : "s"}`}>
      <p className="px-4 py-3 border-b border-black/5 t-cap" style={{ color: MUTED }}>
        Classify only the reason for the final human change. Product preference and thermal corrections
        are learned separately; rejecting an outcome keeps it out of future recommendations.
      </p>
      {pending.map((outcome) => {
        const selectedReason = reasons.find((reason) => reason.code === reasonById[outcome.id]);
        const thermal = thermalById[outcome.id] ?? { maxUValue: "", minShgc: "", maxShgc: "" };
        const validationError = thermalError(selectedReason, thermal);
        const canApprove = !!selectedReason && !validationError;
        const confirm = confirming?.id === outcome.id ? confirming : null;
        const reasonId = `learning-reason-${outcome.id}`;
        return (
          <div key={outcome.id} className="px-4 py-4 border-b border-black/5 last:border-0">
            <p className="t-bd-sm" style={{ color: INK }}>
              <span className="font-data">{outcome.external_ref || "Opening"}</span>
              {" · "}{outcome.proposed_product_slug || "No AI product"}
              {outcome.proposed_variant_id ? ` / ${outcome.proposed_variant_id}` : ""}
              {" → "}{outcome.final_product_slug}
              {outcome.final_variant_id ? ` / ${outcome.final_variant_id}` : ""}
            </p>
            <p className="mt-1 t-cap" style={{ color: MUTED }}>
              AI {money(outcome.proposed_line_total)} · issued {money(outcome.final_line_total)}
              {outcome.price_delta != null ? ` · change ${money(outcome.price_delta)}` : ""}
            </p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <label htmlFor={reasonId} className="sr-only">Reason for changing {outcome.external_ref || "opening"}</label>
              <select
                id={reasonId}
                value={reasonById[outcome.id] ?? ""}
                onChange={(event) => setReasonById((current) => ({
                  ...current, [outcome.id]: event.target.value,
                }))}
                className="flex-1 border border-black/15 px-2.5 py-2 bg-white t-bd-sm">
                <option value="">Why did the human change it?</option>
                {reasons.map((reason) => (
                  <option key={reason.code} value={reason.code}>
                    {humanLabel(reason.code)}
                  </option>
                ))}
              </select>
            </div>
            {selectedReason?.learnsThermalTarget && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                <label className="t-cap" style={{ color: MUTED }}>
                  Maximum Uw
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.5"
                    max="10"
                    step="0.01"
                    aria-invalid={!!validationError}
                    value={thermal.maxUValue}
                    onChange={(event) => setThermalById((current) => ({
                      ...current,
                      [outcome.id]: { ...thermal, maxUValue: event.target.value },
                    }))}
                    className="block w-full mt-1 border border-black/15 px-2.5 py-2 bg-white t-bd-sm"
                    placeholder="e.g. 2.6"
                  />
                </label>
                <label className="t-cap" style={{ color: MUTED }}>
                  Minimum SHGC (optional)
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="1"
                    step="0.01"
                    aria-invalid={!!validationError}
                    value={thermal.minShgc}
                    onChange={(event) => setThermalById((current) => ({
                      ...current,
                      [outcome.id]: { ...thermal, minShgc: event.target.value },
                    }))}
                    className="block w-full mt-1 border border-black/15 px-2.5 py-2 bg-white t-bd-sm"
                    placeholder="e.g. 0.30"
                  />
                </label>
                <label className="t-cap" style={{ color: MUTED }}>
                  Maximum SHGC (optional)
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="1"
                    step="0.01"
                    aria-invalid={!!validationError}
                    value={thermal.maxShgc}
                    onChange={(event) => setThermalById((current) => ({
                      ...current,
                      [outcome.id]: { ...thermal, maxShgc: event.target.value },
                    }))}
                    className="block w-full mt-1 border border-black/15 px-2.5 py-2 bg-white t-bd-sm"
                    placeholder="e.g. 0.55"
                  />
                </label>
              </div>
            )}
            {validationError && selectedReason?.learnsThermalTarget && (
              <p role="alert" className="mt-2 t-cap" style={{ color: "var(--warning-ink)" }}>{validationError}</p>
            )}
            {confirm ? (
              <div className="mt-3 border border-black/10 p-3" style={{ background: "rgba(90,122,106,0.06)" }}>
                <p className="t-cap" style={{ color: INK }}>
                  {confirm.action === "approve"
                    ? `Use ${humanLabel(selectedReason?.code ?? "")} as a permanent lesson for future estimates?`
                    : "Permanently exclude this adjustment from future learning?"}
                </p>
                <div className="mt-2 flex gap-3 items-center">
                  <button
                    disabled={busy || (confirm.action === "approve" && !canApprove)}
                    onClick={() => onRun(() => opsAdjudicateRecommendationOutcome(outcome.id,
                      confirm.action === "reject"
                        ? { action: "reject" }
                        : {
                            action: "approve",
                            reasonCode: selectedReason?.code,
                            thermalTarget: selectedReason?.learnsThermalTarget ? {
                              maxUValue: Number(thermal.maxUValue),
                              minShgc: thermal.minShgc === "" ? null : Number(thermal.minShgc),
                              maxShgc: thermal.maxShgc === "" ? null : Number(thermal.maxShgc),
                            } : undefined,
                          }))}
                    className="px-3 py-1.5 disabled:opacity-45 t-bd-sm"
                    style={{ background: SAGE, color: "#fff" }}
                  >
                    Confirm
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => setConfirming(null)}
                    className="underline underline-offset-2 disabled:opacity-45 t-bd-sm"
                    style={{ color: MUTED }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-3 items-center">
                <button
                  disabled={busy || !canApprove}
                  onClick={() => setConfirming({ id: outcome.id, action: "approve" })}
                  className="px-3 py-1.5 disabled:opacity-45 t-bd-sm"
                  style={{ background: SAGE, color: "#fff" }}
                >
                  Use as a lesson
                </button>
                <button
                  disabled={busy}
                  onClick={() => setConfirming({ id: outcome.id, action: "reject" })}
                  className="underline underline-offset-2 disabled:opacity-45 t-bd-sm"
                  style={{ color: MUTED }}
                >
                  Exclude from learning
                </button>
              </div>
            )}
          </div>
        );
      })}
    </Block>
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
              className={`flex-1 px-2.5 py-1.5 text-center border-r last:border-r-0 t-cap ${current ? "font-semibold" : "font-normal"}`}
              style={{
                background: passed ? SAGE : "transparent",
                borderColor: "rgba(0,0,0,0.08)",
                borderTop: `1px solid rgba(0,0,0,0.08)`,
                borderBottom: current ? `2px solid ${SAGE}` : "1px solid rgba(0,0,0,0.08)",
                color: passed ? "#fff" : current ? INK : MUTED,
                }}>
              {ph}
            </div>
          );
        })}
      </div>
      <p className="mt-2 t-cap" style={{ color: MUTED }}>
        <span style={{ color: INK }}>Now · {stateLabel}</span>
        {" · "}waiting on {waitingOn.toLowerCase()}
        {days != null && <> · <span className="font-data">{days}</span> day{days === 1 ? "" : "s"} in this state</>}
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
        color: active ? INK : MUTED }}>
      <span className={`block t-cap ${active ? "font-semibold" : "font-normal"}`}>{label}</span>
      <span className="block t-cap font-data" style={{ color: MUTED }}>{meta}</span>
    </button>
  );
}

/** THERMAL AUDIT — what was asked of each line, and what we proposed for it.
 *
 *  Validation surface, not a control: nothing here edits. It answers one
 *  question per line — "was the glass we proposed capable of the target the
 *  documents set?" — so a wrong recommendation can be spotted without querying
 *  D1 by hand.
 *
 *  A line with no derived target is SHOWN, not hidden. Schedule-only and
 *  anonymous projects produce lines that never went through thermal derivation
 *  at all, and silently dropping them would make the table read as complete
 *  when it is not.
 */
function ThermalAudit({ rows, counts }: { rows: OpsThermalRow[]; counts: OpsThermalCounts }) {
  const meta = [
    counts.missed ? `${counts.missed} missed` : "",
    counts.met ? `${counts.met} met` : "",
    counts.noTarget ? `${counts.noTarget} no target` : "",
    counts.unknown ? `${counts.unknown} unknown` : "",
  ].filter(Boolean).join(" · ");

  return (
    <Block title="Thermal audit" meta={meta || `${counts.total} line${counts.total === 1 ? "" : "s"}`}>
      {rows.length === 0 ? (
        <Empty>No parsed lines on this project yet.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full t-bd-sm">
            <thead>
              <tr className="t-label" style={{ color: MUTED }}>
                <th className="text-left font-medium px-4 py-2">Line</th>
                <th className="text-right font-medium px-3 py-2">Size</th>
                <th className="text-left font-medium px-3 py-2">Target</th>
                <th className="text-left font-medium px-3 py-2">Basis</th>
                <th className="text-left font-medium px-3 py-2">Proposed</th>
                <th className="text-left font-medium px-3 py-2">Achieved</th>
                <th className="text-left font-medium px-4 py-2">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.lineId} className="border-t border-black/5 align-top">
                  <td className="px-4 py-2" style={{ color: INK }}>
                    <span className="font-data">{r.ref ?? "—"}</span>
                    {r.kind === "segment" && <span className="ml-1 t-cap" style={{ color: MUTED }}>lite</span>}
                    {r.operation && <div className="t-cap" style={{ color: MUTED }}>{r.operation}</div>}
                  </td>
                  <td className="px-3 py-2 text-right font-data" style={{ color: MUTED }}>
                    {r.widthMm && r.heightMm ? `${r.widthMm}×${r.heightMm}` : "—"}
                  </td>
                  <td className="px-3 py-2 font-data" style={{ color: INK }}>{bandText(r.target)}</td>
                  <td className="px-3 py-2 t-cap" style={{ color: MUTED }}>
                    {r.target?.basis ? humanLabel(r.target.basis) : "—"}
                  </td>
                  <td className="px-3 py-2" style={{ color: INK }}>
                    {r.proposed?.productSlug ?? "—"}
                    {r.proposed?.variantId && (
                      <div className="t-cap font-data" style={{ color: MUTED }}>{r.proposed.variantId}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-data" style={{ color: INK }}>
                    {perfText(r.proposed)}
                    {r.proposed?.source === "estimated" && (
                      <div className="t-cap" style={{ color: MUTED }}>estimated</div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <ThermalVerdict row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Block>
  );
}

/** Uw ≤ 2.27 · SHGC 0.37–0.41 — only the axes that were actually constrained. */
function bandText(t: OpsThermalRow["target"]): string {
  if (!t) return "—";
  const parts: string[] = [];
  if (t.maxUValue != null) parts.push(`Uw ≤ ${t.maxUValue}`);
  if (t.minShgc != null && t.maxShgc != null) parts.push(`SHGC ${t.minShgc}–${t.maxShgc}`);
  else if (t.minShgc != null) parts.push(`SHGC ≥ ${t.minShgc}`);
  else if (t.maxShgc != null) parts.push(`SHGC ≤ ${t.maxShgc}`);
  return parts.length ? parts.join(" · ") : "—";
}

function perfText(p: OpsThermalRow["proposed"]): string {
  if (!p || (p.uw == null && p.shgc == null)) return "—";
  return [p.uw != null ? `Uw ${p.uw}` : null, p.shgc != null ? `SHGC ${p.shgc}` : null]
    .filter(Boolean).join(" · ");
}

/** The verdict carries the SIZE of the miss, not just the fact of it — "0.01 over"
 *  and "1.33 over" are the difference between a rounding argument and a redesign. */
function ThermalVerdict({ row }: { row: OpsThermalRow }) {
  if (row.verdict === "no_target") {
    return <span className="t-cap" style={{ color: MUTED }}>No target derived</span>;
  }
  if (row.verdict === "unknown") {
    return <span className="t-cap" style={{ color: MUTED }}>Not comparable</span>;
  }
  if (row.verdict === "met") {
    return <span className="t-cap" style={{ color: SAGE }}>Meets target</span>;
  }
  const over = [
    row.miss?.uw != null ? `Uw +${row.miss.uw}` : null,
    row.miss?.shgc != null ? `SHGC ${row.miss.shgc > 0 ? "+" : ""}${row.miss.shgc}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <span className="t-cap" style={{ color: "var(--warning-ink)" }}>
      Misses target{over && <span className="font-data"> ({over})</span>}
    </span>
  );
}

function Block({ title, meta, icon, children }: { title: string; meta?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card mt-4 lg:mt-0">
      <div className="px-4 py-2.5 border-b border-black/8 flex items-center justify-between">
        <span className="flex items-center gap-1.5 t-label" style={{ color: MUTED }}>
          {icon}{title}
        </span>
        {meta && <span className="t-cap font-data" style={{ color: MUTED }}>{meta}</span>}
      </div>
      {children}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) =>
  <p className="px-4 py-4 t-cap" style={{ color: MUTED }}>{children}</p>;

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
    origin: string; selectedVariantId: string | null;
    review: Record<string, string> | null;
  };
  editable: boolean; busy: boolean;
  policy?: OpsCompositePolicy;
  /** `id` is needed as well as `code`: the set includes the line being edited,
   *  and it has to be excluded from its own duplicate-code check by IDENTITY —
   *  excluding by code would also hide a genuine collision. */
  siblings: { id: string; code: string }[];
  onSaved: () => void; onError: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [editingUnit, setEditingUnit] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [configurations, setConfigurations] = useState<OpsExactConfiguration[]>([]);
  const [configurationKey, setConfigurationKey] = useState("");
  const [configurationState, setConfigurationState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [configurationReload, setConfigurationReload] = useState(0);
  const [resolveChecks, setResolveChecks] = useState(false);

  const composite = line.lineKind === "composite_parent";
  const aiManaged = line.origin === "ai" || !!line.selectedVariantId;
  const axis: "vertical" | "horizontal" = line.compositeAxis === "horizontal" ? "horizontal" : "vertical";
  // ItemForm reads `items` only — for the duplicate-code check. The record's own
  // lines ARE the sibling set, so a reviewer renaming W01 to W02 is told.
  //
  // The set includes this line, so it must also say WHICH one is being edited:
  // without that the form collides with its own code, disables "Save line", and
  // reports "Item ID already exist" against a code nobody touched. Identity, not
  // code — two genuinely duplicated codes must still be caught.
  const quoteLike = { items: siblings.map((s, i) => ({ id: i, code: s.code })) } as never;
  const selfIndex = siblings.findIndex((s) => s.id === line.id);

  const fail = (e: unknown, fallback: string) =>
    onError(e instanceof OpsApiError ? (ACTION_ERRORS[e.code] ?? fallback) : fallback);

  useEffect(() => {
    if (!editing || !aiManaged) {
      setConfigurationState("idle");
      return;
    }
    let active = true;
    setConfigurationState("loading");
    opsLineConfigurations(line.id).then(({ configurations: rows }) => {
      if (!active) return;
      setConfigurations(rows);
      const current = rows.find((row) =>
        row.productSlug === line.productSlug && row.variantId === line.selectedVariantId);
      setConfigurationKey(current ? `${current.productSlug}::${current.variantId}` : "");
      setConfigurationState("ready");
    }).catch(() => {
      if (active) {
        setConfigurations([]);
        setConfigurationState("error");
      }
    });
    return () => { active = false; };
  }, [editing, aiManaged, line.id, line.productSlug, line.selectedVariantId, configurationReload]);

  const saveLine = async (built: { productSlug: string; width: string; height: string; options: Record<string, string>; qty: number; code: string; location: string }) => {
    if (saving) return;              // no re-entrancy guard existed; Save stays live during the request
    setSaving(true);
    try {
      const chosen = aiManaged
        ? configurations.find((row) => `${row.productSlug}::${row.variantId}` === configurationKey)
        : null;
      if (aiManaged && configurationState !== "ready") {
        onError("The eligible configurations have not loaded. Try loading them again before saving.");
        return;
      }
      if (aiManaged && !chosen) {
        onError("Choose an exact frame and glazing configuration before saving this AI-assisted line.");
        return;
      }
      if (chosen && chosen.productSlug !== built.productSlug) {
        onError("The selected thermal configuration belongs to a different product. Choose a configuration for this product.");
        return;
      }
      await opsPatchLine(line.id, {
        productSlug: built.productSlug, width: built.width, height: built.height,
        options: built.options, qty: built.qty, code: built.code, room: built.location,
        selectedVariantId: chosen?.variantId,
        resolveReview: resolveChecks ? true : undefined,
      });
      setEditing(false);
      setResolveChecks(false);
      onSaved();
    } catch (e) { fail(e, "That line could not be saved."); }
    finally { setSaving(false); }
  };

  const saveUnit = async (segId: string, built: { productSlug: string; width: string; height: string; options: Record<string, string>; location?: string }) => {
    if (saving) return;              // no re-entrancy guard existed; Save stays live during the request
    setSaving(true);
    try {
      // BOTH dimensions are sent. The comment that stood here said the server
      // derives the across-axis one and ignores the form's value; it did not —
      // the route had no such parameter at any layer, so the field was rendered
      // editable, captioned as locked, and its value silently dropped. An across
      // mismatch is a hard submission blocker for the customer, which made this
      // the estimator's only repair and it was inert.
      await opsPatchSegment(segId, {
        productSlug: built.productSlug,
        options: built.options,
        alongMm: parseInt(axis === "vertical" ? built.width : built.height) || 0,
        acrossMm: parseInt(axis === "vertical" ? built.height : built.width) || 0,
        note: built.location ?? "",
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
      <td className="px-4 py-2 font-data" style={{ color: SAGE }}>{line.code || "—"}</td>
      <td className="px-3 py-2" style={{ color: INK }}>
        {line.productName}
        {line.room && <span className="block t-cap" style={{ color: MUTED }}>{line.room}</span>}
        {line.selectedVariantId && (
          <span className="block t-cap font-data" style={{ color: MUTED }}>
            configuration · {line.selectedVariantId}
          </span>
        )}
        {line.review && Object.keys(line.review).length > 0 && (
          <ul className="mt-1 list-disc pl-4 t-cap" style={{ color: "var(--warning-ink)" }}>
            {reviewReasons(line.review).map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}
          </ul>
        )}
        {composite && (
          <span className="block t-cap font-data" style={{ color: SAGE }}>
            composite · {line.segments.length} joined unit{line.segments.length === 1 ? "" : "s"}
            {unitNames.length > 1 && ` · ${unitNames.join(" + ")}`}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-data" style={{ color: MUTED }}>
        {line.width && line.height ? `${line.width} × ${line.height}` : "—"}
      </td>
      <td className="px-3 py-2 text-right font-data" style={{ color: MUTED }}>{line.qty}</td>
      <td className="px-3 py-2 text-right font-data" style={{ color: INK }}>{money(line.lineTotal)}</td>
      <td className="px-4 py-2 t-cap">
        <span className="flex items-center gap-2">
          {/* Never colour alone — the word carries the state. */}
          <span style={{ color: line.status === "ready" ? SAGE : "var(--warning)" }}>
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
          {(aiManaged || !!line.review) && (
            <div className="mb-4 border border-black/10 bg-white p-3">
              {aiManaged && (<>
              <label htmlFor={`configuration-${line.id}`} className="block mb-1.5 t-label" style={{ color: MUTED }}>
                Exact frame and glazing configuration
              </label>
              <select
                id={`configuration-${line.id}`}
                value={configurationKey}
                onChange={(event) => setConfigurationKey(event.target.value)}
                disabled={configurationState !== "ready"}
                className="w-full border border-black/15 px-2.5 py-2 bg-white t-bd-sm">
                <option value="">
                  {configurationState === "loading" ? "Loading eligible configurations..." : "Select a currently eligible configuration"}
                </option>
                {configurations.map((configuration) => (
                  <option
                    key={`${configuration.productSlug}::${configuration.variantId}`}
                    value={`${configuration.productSlug}::${configuration.variantId}`}
                  >
                    {configuration.productName} · {configuration.frameTechnology.replaceAll("_", " ")}
                    {configuration.glassBuildUp ? ` · ${configuration.glassBuildUp}` : ""}
                    {configuration.coating ? ` · ${configuration.coating}` : ""}
                    {configuration.uValue != null ? ` · Uw ${configuration.uValue}` : ""}
                    {configuration.shgc != null ? ` · SHGC ${configuration.shgc}` : ""}
                  </option>
                ))}
              </select>
              {configurationState === "error" && (
                <p role="alert" className="mt-1.5 t-cap" style={{ color: "var(--warning-ink)" }}>
                  Eligible configurations could not be loaded.{" "}
                  <button
                    type="button"
                    onClick={() => setConfigurationReload((value) => value + 1)}
                    className="underline underline-offset-2"
                    style={{ color: SAGE }}
                  >
                    Try again
                  </button>
                </p>
              )}
              {configurationState === "ready" && configurations.length === 0 && (
                <p className="mt-1.5 t-cap" style={{ color: "var(--warning-ink)" }}>
                  No eligible, exactly priceable thermal configuration is available for this opening.
                </p>
              )}
              </>)}
              {line.review && Object.keys(line.review).length > 0 && (
                <label className="flex gap-2 items-start mt-3 t-cap" style={{ color: INK }}>
                  <input
                    type="checkbox"
                    checked={resolveChecks}
                    onChange={(event) => setResolveChecks(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I checked and resolved:
                    <span className="block mt-1">{reviewReasons(line.review).join("; ")}</span>
                  </span>
                </label>
              )}
            </div>
          )}
          <ItemForm
            key={configurationKey || "line-editor"}
            quote={quoteLike}
            excludeId={selfIndex}
            busy={saving}
            // A COMPOSITE PARENT IS NOT A PRODUCT (owner) — the same rule the
            // customer drawer already applied, now applied here too. It is the
            // schedule line, not a frame: the units are the products, they can
            // be different products from each other, and its price is the sum
            // of theirs. Staff had a product picker and an Options group whose
            // values PATCH /ops/lines/:id genuinely writes onto a row whose
            // price is never computed from them — a setting that looks like a
            // decision and is inert. Both come off; every unit stays editable,
            // which is where the glazing and hardware actually live.
            hideProduct={composite}
            hideOptions={composite}
            // …and it draws what it is built from, as the customer's list does.
            parts={composite ? line.segments.map((sg) => ({
              productSlug: sg.productSlug,
              alongMm: axis === "horizontal" ? sg.height : sg.width,
              qty: sg.qtyPerParent,
            })) : undefined}
            unitAxis={axis}
            priceFn={opsLinePricePreview(line.id)}
            submitLabel={saving ? "Saving…" : "Save line"}
            seed={{
              code: line.code,
              productSlug: configurations.find((row) =>
                `${row.productSlug}::${row.variantId}` === configurationKey)?.productSlug ?? line.productSlug,
              location: line.room,
              width: line.width, height: line.height, options: line.options, qty: line.qty }}
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
          <td className="px-4 py-1.5 text-right font-data" style={{ color: MUTED }}>{i + 1}.</td>
          <td className="px-3 py-1.5 t-cap" style={{ color: MUTED }}>
            {sg.productName}
            <SpecSummary unit={sg.options} opening={line.options} />
          </td>
          <td className="px-3 py-1.5 text-right t-cap font-data" style={{ color: MUTED }}>
            {sg.width} × {sg.height}
          </td>
          <td className="px-3 py-1.5 text-right t-cap font-data" style={{ color: MUTED }}>
            {sg.qtyPerParent}× per opening
          </td>
          <td className="px-3 py-1.5 text-right t-cap font-data" style={{ color: MUTED }}>{money(sg.lineTotal)}</td>
          <td className="px-4 py-1.5 t-cap">
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
                  {sg.status !== "ready" && <span style={{ color: "var(--warning)" }}>not priced</span>}
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
              {/* The caption used to assert that the across-axis dimension "is
                  set by the opening and cannot be changed here". It was not and
                  it is not: the field is editable and now actually persists.
                  It states the opening's figure so a reviewer can see what the
                  unit has to match, and says nothing about a lock. */}
              <p className="mb-2.5 t-cap" style={{ color: MUTED }}>
                Unit {i + 1} of {line.code || "this opening"}. The opening is{" "}
                {axis === "vertical" ? line.height : line.width} mm{" "}
                {axis === "vertical" ? "high" : "wide"} — every unit must match it.
              </p>
              <ItemForm
                // key: this mount had none, and ItemForm has no seed→state sync
                // effect, so its state initialisers ran once and a segment that
                // changed underneath left a stale draft.
                key={`ops-unit-${sg.id}`}
                scope="unit"
                unitAxis={axis}
                quote={quoteLike}
                busy={saving}
                priceFn={opsLinePricePreview(line.id)}
                submitLabel={saving ? "Saving…" : `Save unit ${i + 1}`}
                seed={{ productSlug: sg.productSlug, width: sg.width, height: sg.height, options: sg.options, qty: sg.qty, location: sg.note }}
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
                className="underline underline-offset-2 disabled:no-underline disabled:opacity-50 t-cap"
                style={{ color: atMaxUnits ? MUTED : SAGE }}>
                {atMaxUnits ? `Maximum ${policy?.maxSegments} units` : "+ Add unit"}
              </button>
            ) : <span />}
            <span className="t-cap" style={{ color: delta === 0 || Math.abs(delta) <= tolerance ? MUTED : "var(--warning)" }}>
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
    <span className="block t-cap" style={{ color: MUTED }}>
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
        <p className="mb-2.5 t-cap" style={{ color: INK }}>
          This opening is built as {line.segments.length} joined units. Edit them in the rows
          above — change a unit's product, its spec or its size, add a unit or remove one.
        </p>
        <p className="mb-3 t-cap" style={{ color: MUTED }}>
          Merging discards all {line.segments.length} units and their spec, and returns this to one opening.
        </p>
        <button onClick={merge} disabled={saving || busy}
          className="px-3 py-2 border border-black/15 t-bd-sm" style={{ color: INK }}>
          {saving ? "Merging…" : "Merge back to one"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2.5 t-cap" style={{ color: INK }}>
        Build this {openingW} × {openingH} mm opening as joined units.
        Each unit keeps the opening's spec — change any of them afterwards.
      </p>
      <div className="flex flex-wrap items-end gap-4 mb-2.5">
        <span className="t-cap" style={{ color: MUTED }}>
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
        <label className="t-cap" style={{ color: MUTED }}>
          Units
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}
            className="ml-2 border border-black/15 px-2 py-1 bg-white t-bd-sm" style={{ color: INK }}>
            {Array.from({ length: Math.max(0, maxUnits - 1) }, (_, i) => i + 2)
              .map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {sizes.map((v, i) => (
          <label key={i} className="t-cap" style={{ color: MUTED }}>
            Unit {i + 1} {axis === "vertical" ? "width" : "height"}
            <input value={String(v)} inputMode="numeric"
              onChange={(e) => setSizes(sizes.map((x, j) => (j === i ? Number(e.target.value) || 0 : x)))}
              className="ml-2 border border-black/15 px-2 py-1 w-[76px] text-right bg-white font-data t-data" />
          </label>
        ))}
      </div>
      <p className="mb-3 t-cap" style={{ color: delta === 0 || Math.abs(delta) <= tolerance ? MUTED : "var(--warning)" }}>
        {delta === 0
          ? `Units span ${spanned} mm — exactly the opening.`
          : `Units span ${spanned} mm, ${Math.abs(delta)} mm ${delta > 0 ? "more than" : "less than"} the opening. Allowed — it is recorded on the line.`}
      </p>
      <button onClick={apply} disabled={saving || busy || sizes.some((v) => !v)}
        className="text-white px-3.5 py-2 disabled:opacity-40 t-bd-sm" style={{ background: SAGE }}>
        {saving ? "Applying…" : "Split into units"}
      </button>
    </div>
  );
}
