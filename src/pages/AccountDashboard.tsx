// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER DASHBOARD — the attention-first hub (spec §4).
//
// Answers "what needs me right now?" first: greeting → summary strip (numbers only
// where they drive action) → the priority-ordered gate stack → the unified
// projects & orders list. Empty states guide, never dead-end (spec §8).
// ═══════════════════════════════════════════════════════════════════════════════
import { useState, type ReactNode } from "react";
import {
  ArrowRight, ChevronRight, CreditCard, PenLine, FileText, Truck, Upload,
  MessageSquare, CheckCircle,
} from "lucide-react";
import { type Page, SAGE, WindowMark, Btn } from "../app/ui";
import type { ApiProjectSummary, ApiOrder } from "../data/api";
import {
  useAccount, deriveGates, orderMeta, projectMeta, quoteProjects, projectAnchor,
  money, fmtDayDate, greeting, StatusPill, TONE, type Gate, type GateTarget,
} from "./accountModel";

type OpenRecord = (rec: { orderId?: string; projectId?: string; status?: string }) => void;

export function AccountDashboard({ user, setPage, onOpenRecord }: {
  user: { name: string; company: string; email: string };
  setPage: (p: Page) => void;
  onOpenRecord: OpenRecord;
}) {
  const { projects, orders, loading } = useAccount();
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const openTarget = (t: GateTarget) => {
    if (t.kind === "order") onOpenRecord({ orderId: t.id });
    else if (t.kind === "project") onOpenRecord({ projectId: t.id, status: t.status });
    else go("quote");
  };

  if (loading) {
    return <div className="bg-white border border-black/10 p-8 text-sm text-[#5c5a56]">Loading your account…</div>;
  }
  const projs = projects ?? [];
  const ords = orders ?? [];
  const gates = deriveGates(projs, ords);
  const activeOrders = ords.filter((o) => o.stage !== "after_sales");
  const qProjects = quoteProjects(projs);
  const openQuotes = qProjects.filter((p) => p.status_customer !== "draft" && p.status_customer !== "expired").length;
  const drafts = qProjects.filter((p) => p.status_customer === "draft").length;
  const payable = ords.reduce((s, o) => {
    const due = o.stage === "deposit_invoiced" ? o.payments.find((p) => p.kind === "deposit")
      : o.stage === "balance_invoiced" ? o.payments.find((p) => p.kind === "balance") : undefined;
    return s + (due?.amount ?? 0);
  }, 0);
  const brandNew = projs.length === 0 && ords.length === 0;
  const first = user.name.trim().split(" ")[0] || "there";

  return (
    <>
      {/* Greeting */}
      <div className="flex justify-between items-end gap-5 flex-wrap mb-[22px]">
        <div>
          <h1 className="font-semibold text-[#131311] leading-[1.05]" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.7rem,3.6vw,2.15rem)" }}>
            {brandNew ? `Welcome, ${first}` : `${greeting()}, ${first}`}
          </h1>
          <p className="text-sm text-[#5c5a56] mt-[5px]">
            {brandNew
              ? "Let's get your first quote started"
              : <>Signed in to <b className="text-[#131311] font-semibold">{user.company || user.email}</b> · {gates.length === 0 ? "nothing needs you right now" : `${gates.length} thing${gates.length === 1 ? "" : "s"} need${gates.length === 1 ? "s" : ""} your attention today`}</>}
          </p>
        </div>
        <span className="text-[12.5px] text-[#5c5a56]" style={{ fontFamily: "'DM Mono', monospace" }}>{fmtDayDate(new Date())}</span>
      </div>

      {brandNew ? (
        <EmptyHub go={go} />
      ) : (
        <>
          {/* Summary strip — numbers only where they drive action */}
          <div className="flex flex-wrap border border-black/10 bg-white mb-6" role="group" aria-label="Account summary">
            <SummaryCell hot={gates.length > 0} label="Need you now" value={String(gates.length)} small="open gates" />
            <SummaryCell hot={payable > 0} label="Payable now" value={money(payable)} />
            <SummaryCell label="On order" value={String(activeOrders.length)} />
            <SummaryCell label="Active quotes" value={String(openQuotes)} small={drafts ? `· ${drafts} draft${drafts === 1 ? "" : "s"}` : undefined} />
          </div>

          {/* Needs your attention */}
          <section className="mb-[26px]">
            <div className="flex items-center gap-2.5 mb-3.5">
              <h2 className="text-[1.15rem] font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Needs your attention</h2>
              {gates.length > 0 && <span className="text-xs text-white px-[7px] py-0.5" style={{ fontFamily: "'DM Mono', monospace", background: TONE.attn.text }}>{gates.length}</span>}
              <span className="ml-auto text-[13px] text-[#5c5a56] hidden sm:inline">Ordered by urgency · each opens the exact record</span>
            </div>
            {gates.length === 0 ? (
              <div className="bg-white border border-black/10 p-[18px] flex flex-col gap-[9px]" style={{ borderLeft: `3px solid ${TONE.pos.text}` }}>
                <span className="w-[34px] h-[34px] grid place-items-center border" style={{ color: TONE.pos.text, borderColor: TONE.pos.bd, background: TONE.pos.bg }}><CheckCircle className="w-[18px] h-[18px]" /></span>
                <h3 className="text-[15px] font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>You're all caught up</h3>
                <p className="text-[12.5px] text-[#5c5a56] leading-relaxed">Nothing needs you right now — we'll email you and show it here the moment something does.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {gates.map((g) => <GateCard key={g.key} gate={g} onOpen={() => openTarget(g.target)} />)}
              </div>
            )}
          </section>

          {/* Unified project list — one object, whole life, with phase filters */}
          <ProjectsSection projects={projs} orders={ords} setPage={setPage} onOpenRecord={onOpenRecord} />
        </>
      )}
    </>
  );
}

// The merged home's list: the full project list with phase-filter tabs (pipeline
// vs order-book survives as a VIEW, not a separate destination).
type ProjectsTab = "all" | "quotes" | "on-order" | "completed";
const PROJECT_TABS: { id: ProjectsTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "quotes", label: "Active quotes" },
  { id: "on-order", label: "On order" },
  { id: "completed", label: "Completed" },
];

function ProjectsSection({ projects, orders, setPage, onOpenRecord }: {
  projects: ApiProjectSummary[]; orders: ApiOrder[]; setPage: (p: Page) => void; onOpenRecord: OpenRecord;
}) {
  const [tab, setTab] = useState<ProjectsTab>("all");
  const allQuotes = quoteProjects(projects);
  const activeQuotes = allQuotes.filter((p) => p.status_customer !== "expired");
  const onOrder = orders.filter((o) => !["delivered", "after_sales"].includes(o.stage));
  const completed = orders.filter((o) => ["delivered", "after_sales"].includes(o.stage));
  const counts: Record<ProjectsTab, number> = {
    all: allQuotes.length + orders.length, quotes: activeQuotes.length,
    "on-order": onOrder.length, completed: completed.length,
  };
  const view = tab === "quotes" ? { p: activeQuotes, o: [] as ApiOrder[] }
    : tab === "on-order" ? { p: [] as ApiProjectSummary[], o: onOrder }
    : tab === "completed" ? { p: [] as ApiProjectSummary[], o: completed }
    : { p: allQuotes, o: orders };
  const emptyNote = tab === "on-order" ? <>Nothing on order yet — your order opens the moment you accept a quote.</>
    : tab === "completed" ? <>No completed orders yet.</>
    : tab === "quotes" ? <>No active quotes. Start a project from the estimator.</>
    : undefined;

  return (
    <section>
      <div className="flex items-center gap-2.5 mb-3">
        <h2 className="text-[1.15rem] font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Your projects</h2>
        <span className="ml-auto text-[13px] text-[#5c5a56] hidden sm:inline">Each shows its status and the single next step</span>
      </div>
      <div className="flex items-center gap-1 border-b border-black/10 mb-4 overflow-x-auto" role="tablist" aria-label="Filter projects">
        {PROJECT_TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer ${tab === t.id ? "border-[#5A7A6A] text-[#131311] font-medium" : "border-transparent text-[#8b8880] hover:text-[#131311]"}`}>
            {t.label}{counts[t.id] > 0 && <span className="ml-1.5 text-[11px] text-[#8b8880]" style={{ fontFamily: "'DM Mono', monospace" }}>{counts[t.id]}</span>}
          </button>
        ))}
      </div>
      <UnifiedList projects={view.p} orders={view.o} setPage={setPage} onOpenRecord={onOpenRecord} emptyNote={emptyNote} />
    </section>
  );
}

function SummaryCell({ label, value, small, hot }: { label: string; value: string; small?: string; hot?: boolean }) {
  return (
    <div className="flex-1 min-w-[150px] px-5 py-[15px] flex flex-col gap-[3px] border-r border-black/[0.07] last:border-r-0"
      style={hot ? { background: TONE.attn.bg } : undefined}>
      <span className="text-[11px] tracking-[0.09em] uppercase text-[#5c5a56]" style={{ fontFamily: "'DM Mono', monospace" }}>{label}</span>
      <span className="text-2xl font-semibold flex items-baseline gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif", color: hot ? TONE.attn.text : "#131311" }}>
        {value}{small && <small className="text-[12.5px] font-medium text-[#5c5a56]" style={{ fontFamily: "'Inter', sans-serif" }}>{small}</small>}
      </span>
    </div>
  );
}

const GATE_ICON: Record<string, ReactNode> = {
  "Balance due": <CreditCard className="w-5 h-5" />, "Deposit due": <CreditCard className="w-5 h-5" />,
  "Sign-off": <PenLine className="w-5 h-5" />, "Quote issued": <FileText className="w-5 h-5" />,
  "Needs information": <MessageSquare className="w-5 h-5" />, "Confirm": <Truck className="w-5 h-5" />,
  "Draft": <PenLine className="w-5 h-5" />,
};

function GateCard({ gate, onOpen }: { gate: Gate; onOpen: () => void }) {
  return (
    <button onClick={onOpen} aria-label={`${gate.title} — ${gate.refLabel}`}
      className="w-full text-left bg-white border border-black/10 grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] gap-x-[18px] gap-y-3 items-center px-5 py-[18px] transition-all cursor-pointer hover:shadow-[0_1px_0_rgba(178,110,15,.34)]"
      style={{ borderLeft: `3px solid ${TONE.attn.text}` }}>
      <span className="w-[42px] h-[42px] grid place-items-center border" style={{ borderColor: TONE.attn.bd, background: TONE.attn.bg, color: TONE.attn.text }}>
        {GATE_ICON[gate.pill] ?? <FileText className="w-5 h-5" />}
      </span>
      <span className="min-w-0 block">
        <span className="flex items-center gap-[9px] flex-wrap mb-[3px]">
          <StatusPill tone="attn">{gate.pill}</StatusPill>
          <span className="text-xs text-[#5c5a56]" style={{ fontFamily: "'DM Mono', monospace" }}>{gate.refLabel}</span>
        </span>
        <span className="block text-base font-semibold text-[#131311] leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{gate.title}</span>
        <span className="block text-[13.5px] text-[#5c5a56] mt-[3px]">{gate.desc}</span>
      </span>
      <span className="col-span-2 sm:col-span-1 flex sm:flex-col items-center sm:items-end justify-between gap-1.5">
        <span className="inline-flex items-center gap-2 bg-[#5A7A6A] text-white text-[13px] font-medium px-3.5 py-[9px] whitespace-nowrap">{gate.cta}</span>
        <span className="text-[11px] text-[#5c5a56]" style={{ fontFamily: "'DM Mono', monospace" }}>{gate.when}</span>
      </span>
    </button>
  );
}

// Unified rows — orders and quote-stage projects in one list, attention first.
export function UnifiedList({ projects, orders, setPage, onOpenRecord, emptyNote }: {
  projects: ApiProjectSummary[]; orders: ApiOrder[];
  setPage: (p: Page) => void; onOpenRecord: OpenRecord; emptyNote?: ReactNode;
}) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  type Row = { key: string; needsYou: boolean; updated: string; node: ReactNode };
  const rows: Row[] = [];

  for (const o of orders) {
    const m = orderMeta(o);
    rows.push({
      key: `o-${o.id}`, needsYou: m.needsYou, updated: o.createdAt,
      node: (
        // The project ref stays the anchor across the whole life; the order number
        // is acceptance-time meta (it lives on invoices + payment references).
        <RecordRow key={`o-${o.id}`} refText={projectAnchor(o)} title={o.projectTitle ?? "Order"}
          pill={<StatusPill tone={m.tone}>{m.pill}</StatusPill>}
          next={<>{m.needsYou && <span className="font-semibold" style={{ color: TONE.attn.text }}>Next: you</span>}{m.needsYou ? " — " : ""}{m.next}</>}
          value={money(o.total)} meta={`${o.orderNo} · ${o.lineCount ?? "—"} lines · ${paymentNote(o)}`}
          onOpen={() => onOpenRecord({ orderId: o.id })} />
      ),
    });
  }
  for (const p of quoteProjects(projects)) {
    const m = projectMeta(p);
    const draft = p.status_customer === "draft";
    rows.push({
      key: `p-${p.id}`, needsYou: m.needsYou, updated: p.updated_at,
      node: (
        <RecordRow key={`p-${p.id}`} refText={draft ? "DRAFT" : (p.public_ref ?? "PROJECT")} title={p.title ?? "My Project"} draft={draft}
          pill={<StatusPill tone={m.tone}>{m.pill}</StatusPill>}
          next={<>{m.needsYou && <span className="font-semibold" style={{ color: TONE.attn.text }}>Next: you</span>}{m.needsYou ? " — " : ""}{m.next}</>}
          value={p.issued_total != null ? money(p.issued_total) : "—"}
          meta={`${p.item_count} line${p.item_count === 1 ? "" : "s"}${draft && p.draft_total ? ` · est. ${money(p.draft_total)}` : ""}`}
          onOpen={() => draft ? go("quote") : onOpenRecord({ projectId: p.id, status: p.status_customer })} />
      ),
    });
  }
  rows.sort((a, b) => Number(b.needsYou) - Number(a.needsYou) || b.updated.localeCompare(a.updated));

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-black/10 p-[18px]">
        <h3 className="text-sm font-semibold text-[#131311] mb-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Nothing here yet</h3>
        <p className="text-[12.5px] text-[#5c5a56] leading-relaxed">{emptyNote ?? <>Start a quote and it will appear here as it moves from estimate to delivered order.</>}</p>
      </div>
    );
  }
  return <div className="flex flex-col gap-3">{rows.map((r) => r.node)}</div>;
}

const paymentNote = (o: ApiOrder) => {
  const dep = o.payments.find((p) => p.kind === "deposit");
  const bal = o.payments.find((p) => p.kind === "balance");
  if (bal?.status === "paid") return "paid in full";
  if (o.stage === "balance_invoiced") return "balance due";
  if (dep?.status === "paid") return "deposit paid";
  if (o.stage === "deposit_invoiced") return "deposit due";
  return o.stageLabel.toLowerCase();
};

function RecordRow({ refText, title, pill, next, value, meta, draft, onOpen }: {
  refText: string; title: string; pill: ReactNode; next: ReactNode; value: string; meta: string; draft?: boolean; onOpen: () => void;
}) {
  return (
    <button onClick={onOpen}
      className={`w-full text-left border border-black/10 px-5 py-[18px] grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] gap-x-[18px] gap-y-3 items-center transition-colors cursor-pointer hover:border-[#8CA99B] ${draft ? "bg-[repeating-linear-gradient(-45deg,transparent,transparent_9px,rgba(0,0,0,.014)_9px,rgba(0,0,0,.014)_10px)] bg-white" : "bg-white"}`}>
      <span className="w-[38px] h-[38px] border border-black/10 grid place-items-center flex-shrink-0">
        <WindowMark size={18} color={draft ? "#b8b6ae" : SAGE} />
      </span>
      <span className="min-w-0 block">
        <span className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[12.5px] font-medium text-[#5A7A6A]" style={{ fontFamily: "'DM Mono', monospace" }}>{refText}</span>
          <span className="text-[16.5px] font-semibold text-[#131311] leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{title}</span>
          {pill}
        </span>
        <span className="block text-[13.5px] text-[#5c5a56] mt-[5px]">{next}</span>
      </span>
      <span className="col-span-2 sm:col-span-1 flex sm:flex-col items-center sm:items-end justify-between gap-2 border-t sm:border-t-0 border-black/[0.07] pt-3 sm:pt-0">
        <span className="text-[15px] font-medium text-[#131311]" style={{ fontFamily: "'DM Mono', monospace", fontVariantNumeric: "tabular-nums" }}>{value}</span>
        <span className="text-[11.5px] text-[#5c5a56]" style={{ fontFamily: "'DM Mono', monospace" }}>{meta}</span>
        <ChevronRight className="hidden sm:block w-[18px] h-[18px] text-[#5A7A6A]" />
      </span>
    </button>
  );
}

// Empty state (a): brand-new account — a welcoming "start your first quote" hub.
function EmptyHub({ go }: { go: (p: Page) => void }) {
  return (
    <div className="max-w-xl bg-white border border-black/10 p-8 flex flex-col items-center text-center gap-3">
      <span className="w-12 h-12 border border-black/10 grid place-items-center"><WindowMark size={26} color={SAGE} /></span>
      <h2 className="text-lg font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Start your first project</h2>
      <p className="text-[13px] text-[#5c5a56] max-w-[36ch]">Price your windows and doors in minutes, then submit the project for a full reviewed quote.</p>
      <div className="flex flex-col sm:flex-row gap-2.5 w-full justify-center pt-1">
        <Btn variant="sage" size="md" onClick={() => go("quote")}>Start an instant estimate <ArrowRight className="w-4 h-4" /></Btn>
        <Btn variant="outline" size="md" onClick={() => go("quote")}><Upload className="w-4 h-4" />Upload a schedule</Btn>
      </div>
      <p className="w-full text-[11px] text-[#5c5a56] leading-relaxed border-t border-black/[0.07] pt-3.5 mt-1" style={{ fontFamily: "'DM Mono', monospace" }}>
        After you submit, AMJ reviews it and issues a final quote — usually within 2 business days. We'll email you and it'll appear here.
      </p>
    </div>
  );
}
