// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER DASHBOARD — the attention-first hub (spec §4).
//
// Answers "what needs me right now?" first: greeting → summary strip (numbers only
// where they drive action) → the in-progress project (cart) → the unified projects
// & orders list, whose "Needs you" tab is the action console (enriched CTA rows,
// urgency-ordered — the successor of the old separate gate stack). Empty states
// guide, never dead-end (spec §8).
// ═══════════════════════════════════════════════════════════════════════════════
import { useState, type ReactNode } from "react";
import { ArrowRight, ArrowDown, ChevronRight, Upload, CheckCircle } from "lucide-react";
import { type Page, SAGE, WindowMark, Btn } from "../app/ui";
import type { ApiProjectSummary, ApiOrder } from "../data/api";
import {
  useAccount, orderMeta, projectMeta, quoteProjects, projectAnchor,
  money, fmtDayDate, greeting, StatusPill, TONE,
} from "./accountModel";

type OpenRecord = (rec: { orderId?: string; projectId?: string; status?: string }) => void;

export function AccountDashboard({ user, setPage, onOpenRecord }: {
  user: { name: string; company: string; email: string };
  setPage: (p: Page) => void;
  onOpenRecord: OpenRecord;
}) {
  const { projects, orders, loading } = useAccount();
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  // Lifted tab state for the projects list, so "Need you now" can select the
  // Needs-you tab. null = "not chosen yet" → resolved per render to needs-you when
  // anything is pending, else all. Unconditional useState (before the loading
  // return) keeps the hooks order stable.
  const [chosenTab, setChosenTab] = useState<ProjectsTab | null>(null);

  if (loading) {
    return <div className="card p-8 text-sm text-body">Loading your account…</div>;
  }
  const projs = projects ?? [];
  const ords = orders ?? [];
  const activeOrders = ords.filter((o) => o.stage !== "after_sales");
  const qProjects = quoteProjects(projs);
  const openQuotes = qProjects.filter((p) => p.status_customer !== "draft" && p.status_customer !== "expired").length;
  // The single draft (cart) — one per customer by invariant — powers the top
  // ContinueProject card. null ⇒ that card is the "start a new project" CTA.
  const draft = qProjects.find((p) => p.status_customer === "draft") ?? null;
  // What needs the customer, keyed on `action` presence (NOT needsYou) so the draft
  // is excluded — one source shared by the greeting, the summary cell, the tab
  // badge and the tab filter, so they cannot diverge.
  const needsYouCount =
    ords.filter((o) => orderMeta(o).action).length +
    qProjects.filter((p) => p.status_customer !== "draft" && projectMeta(p).action).length;
  const tab = chosenTab ?? (needsYouCount > 0 ? "needs-you" : "all");
  const jumpToNeedsYou = () => {
    setChosenTab("needs-you");
    document.getElementById("your-projects")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
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
          <h1 className="text-ink t-hd1">
            {brandNew ? `Welcome, ${first}` : `${greeting()}, ${first}`}
          </h1>
          <p className="text-sm text-body mt-[5px]">
            {brandNew
              ? "Let's get your first quote started"
              : <>Signed in to <b className="text-ink font-semibold">{user.company || user.email}</b> · {needsYouCount === 0 ? "nothing needs you right now" : `${needsYouCount} thing${needsYouCount === 1 ? "" : "s"} need${needsYouCount === 1 ? "s" : ""} your attention today`}</>}
          </p>
        </div>
        <span className="text-[12.5px] text-body font-data">{fmtDayDate(new Date())}</span>
      </div>

      {brandNew ? (
        <EmptyHub go={go} />
      ) : (
        <>
          {/* Summary strip — numbers only where they drive action */}
          <div className="flex flex-wrap card mb-6" role="group" aria-label="Account summary">
            <SummaryCell hot={needsYouCount > 0} label="Need you now" value={String(needsYouCount)} small="to review" onClick={needsYouCount > 0 ? jumpToNeedsYou : undefined} />
            <SummaryCell hot={payable > 0} label="Payable now" value={money(payable)} />
            <SummaryCell label="On order" value={String(activeOrders.length)} />
            <SummaryCell label="Active quotes" value={String(openQuotes)} />
          </div>

          {/* Your in-progress project (the cart) — its own section at the top, always
              visible and never buried in history. */}
          <ContinueProject draft={draft} go={go} />

          {/* Unified project list — one object, whole life, with phase filters. Its
              "Needs you" tab is the action console that replaced the separate
              "Needs your attention" gate stack: same records, enriched with each
              action's CTA + consequence, ordered by urgency. */}
          <ProjectsSection projects={projs} orders={ords} setPage={setPage} onOpenRecord={onOpenRecord} tab={tab} setTab={setChosenTab} />
        </>
      )}
    </>
  );
}

// The merged home's list: the full project list with phase-filter tabs (pipeline
// vs order-book survives as a VIEW, not a separate destination).
type ProjectsTab = "needs-you" | "all" | "quotes" | "on-order" | "completed";
const PROJECT_TABS: { id: ProjectsTab; label: string }[] = [
  // "Needs you" is the action console — the successor of the old separate
  // "Needs your attention" gate stack, as an enriched filter of THIS one list.
  { id: "needs-you", label: "Needs you" },
  { id: "all", label: "All" },
  { id: "quotes", label: "Active quotes" },
  { id: "on-order", label: "On order" },
  { id: "completed", label: "Completed" },
];

function ProjectsSection({ projects, orders, setPage, onOpenRecord, tab, setTab }: {
  projects: ApiProjectSummary[]; orders: ApiOrder[]; setPage: (p: Page) => void; onOpenRecord: OpenRecord;
  // Controlled: the dashboard owns the tab (auto-selects "needs-you" when anything
  // is pending; the "Need you now" summary cell can force it).
  tab: ProjectsTab; setTab: (t: ProjectsTab) => void;
}) {
  // The draft (cart) lives in its own ContinueProject card at the top, not in the
  // history list — so it is excluded here and appears exactly once on the page.
  const allQuotes = quoteProjects(projects).filter((p) => p.status_customer !== "draft");
  const activeQuotes = allQuotes.filter((p) => p.status_customer !== "expired");
  const onOrder = orders.filter((o) => !["delivered", "after_sales"].includes(o.stage));
  const completed = orders.filter((o) => ["delivered", "after_sales"].includes(o.stage));
  // "Needs you" = the records carrying a pending action (== the six gates). Keyed on
  // `action` presence, NOT needsYou, so the draft is excluded exactly as the gate
  // stack excluded it.
  const needsYouProjects = allQuotes.filter((p) => projectMeta(p).action);
  const needsYouOrders = orders.filter((o) => orderMeta(o).action);
  const counts: Record<ProjectsTab, number> = {
    "needs-you": needsYouProjects.length + needsYouOrders.length,
    all: allQuotes.length + orders.length, quotes: activeQuotes.length,
    "on-order": onOrder.length, completed: completed.length,
  };
  const view = tab === "needs-you" ? { p: needsYouProjects, o: needsYouOrders }
    : tab === "quotes" ? { p: activeQuotes, o: [] as ApiOrder[] }
    : tab === "on-order" ? { p: [] as ApiProjectSummary[], o: onOrder }
    : tab === "completed" ? { p: [] as ApiProjectSummary[], o: completed }
    : { p: allQuotes, o: orders };
  const emptyNote = tab === "on-order" ? <>Nothing on order yet — your order opens the moment you accept a quote.</>
    : tab === "completed" ? <>No completed orders yet.</>
    : tab === "quotes" ? <>No active quotes. Start a project from the estimator.</>
    : undefined;

  return (
    <section id="your-projects" className="scroll-mt-24">
      <div className="flex items-center gap-2.5 mb-3">
        <h2 className="text-[1.15rem] font-semibold text-ink font-display">Your projects</h2>
        <span className="ml-auto text-[13px] text-body hidden sm:inline">Each shows its status and the single next step</span>
      </div>
      <div className="flex items-center gap-1 border-b border-black/10 mb-4 overflow-x-auto" role="tablist" aria-label="Filter projects">
        {PROJECT_TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer ${tab === t.id ? "border-sage text-ink font-medium" : "border-transparent text-quiet hover:text-ink"}`}>
            {t.label}{counts[t.id] > 0 && (
              // Amber count badge for the action console; the quiet number for browse tabs.
              t.id === "needs-you"
                ? <span className="ml-1.5 text-[11px] text-white px-[6px]" style={{ fontFamily: "'DM Mono', monospace", background: TONE.attn.text }}>{counts[t.id]}</span>
                : <span className="ml-1.5 text-[11px] text-quiet font-data">{counts[t.id]}</span>
            )}
          </button>
        ))}
      </div>
      <UnifiedList projects={view.p} orders={view.o} setPage={setPage} onOpenRecord={onOpenRecord} emptyNote={emptyNote} enriched={tab === "needs-you"} />
    </section>
  );
}

function SummaryCell({ label, value, small, hot, onClick }: { label: string; value: string; small?: string; hot?: boolean; onClick?: () => void }) {
  const cls = "flex-1 min-w-[150px] px-5 py-[15px] flex flex-col gap-[3px] border-r border-black/[0.07] last:border-r-0";
  const body = (
    <>
      <span className="text-[11px] tracking-[0.09em] uppercase text-body font-data">{label}</span>
      <span className="text-2xl font-semibold flex items-baseline gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif", color: hot ? TONE.attn.text : "var(--ink)" }}>
        {value}{small && <small className="text-[12.5px] font-medium text-body font-body">{small}</small>}
        {onClick && <ArrowDown className="w-[15px] h-[15px] self-center" style={{ color: hot ? TONE.attn.text : "var(--body)" }} aria-hidden="true" />}
      </span>
    </>
  );
  if (onClick) {
    // "Need you now" jumps straight to the attention gates rather than restating them.
    return (
      <button onClick={onClick} aria-label={`${label}: ${value} — jump to what needs you`}
        className={`${cls} text-left cursor-pointer transition-colors hover:brightness-[0.97]`} style={{ background: hot ? TONE.attn.bg : "transparent" }}>
        {body}
      </button>
    );
  }
  return <div className={cls} style={hot ? { background: TONE.attn.bg } : undefined}>{body}</div>;
}

// The customer's single in-progress project (the "cart") — a dedicated section at
// the very top of the dashboard. Two states off the item_count already in the DTO:
// with lines → a resume card; empty (or no draft) → a start-a-new-project CTA. Kept
// in a calm sage/draft register (never the amber attention tone) — it wins by
// POSITION, not by borrowing the urgency reserved for money/deadline gates.
function ContinueProject({ draft, go }: { draft: ApiProjectSummary | null; go: (p: Page) => void }) {
  const hasLines = !!draft && draft.item_count > 0;
  return (
    <section className="mb-[26px]">
      <div className="flex items-center gap-2.5 mb-3.5">
        <h2 className="text-[1.15rem] font-semibold text-ink font-display">
          {hasLines ? "Continue your project" : "Start a new project"}
        </h2>
        <span className="ml-auto text-[13px] text-body hidden sm:inline">{hasLines ? "Your in-progress quote — pick up where you left off" : "Price it in minutes, then submit for a reviewed quote"}</span>
      </div>
      {hasLines ? (
        <button onClick={() => go("quote")} aria-label="Resume building your quote"
          className="w-full text-left card grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] gap-x-[18px] gap-y-3 items-center px-5 py-[18px] card-link transition-all cursor-pointer"
          style={{ borderLeft: `3px solid ${SAGE}`, backgroundImage: "repeating-linear-gradient(-45deg,transparent,transparent 9px,rgba(0,0,0,.014) 9px,rgba(0,0,0,.014) 10px)" }}>
          <span className="w-[42px] h-[42px] grid place-items-center border border-black/10 flex-shrink-0"><WindowMark size={20} color={SAGE} /></span>
          <span className="min-w-0 block">
            <span className="flex items-center gap-[9px] flex-wrap mb-[3px]"><StatusPill tone="draft">Draft — not submitted</StatusPill></span>
            <span className="block text-base font-semibold text-ink leading-tight font-display">{draft!.title ?? "Your quote in progress"}</span>
            <span className="block text-[13.5px] text-body mt-[3px]"><b className="font-semibold text-ink">{draft!.item_count} line{draft!.item_count === 1 ? "" : "s"}</b> · finish and submit for a full reviewed quote.</span>
          </span>
          <span className="col-span-2 sm:col-span-1 flex sm:flex-col items-center sm:items-end justify-between gap-1.5">
            <span className="inline-flex items-center gap-2 bg-sage text-white text-[13px] font-medium px-3.5 py-[9px] whitespace-nowrap">Resume building <ArrowRight className="w-4 h-4" /></span>
            {draft!.draft_total ? <span className="text-[11px] text-body font-data">Estimate {money(draft!.draft_total)} · not submitted for pricing</span> : null}
          </span>
        </button>
      ) : (
        <div className="card grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] gap-x-[18px] gap-y-3 items-center px-5 py-[18px]" style={{ borderLeft: `3px solid ${SAGE}` }}>
          <span className="w-[42px] h-[42px] grid place-items-center border border-black/10 flex-shrink-0"><WindowMark size={20} color={SAGE} /></span>
          <span className="min-w-0 block text-[13.5px] text-body">Price your windows and doors in minutes, then submit for a full reviewed quote.</span>
          <span className="col-span-2 sm:col-span-1 flex flex-col sm:flex-row sm:items-center gap-2">
            <Btn variant="sage" size="md" onClick={() => go("quote")}>Start an instant estimate <ArrowRight className="w-4 h-4" /></Btn>
            <Btn variant="outline" size="md" onClick={() => go("quote")}><Upload className="w-4 h-4" />Upload a schedule</Btn>
          </span>
        </div>
      )}
    </section>
  );
}

// Unified rows — orders and quote-stage projects in one list, attention first.
export function UnifiedList({ projects, orders, setPage, onOpenRecord, emptyNote, enriched }: {
  projects: ApiProjectSummary[]; orders: ApiOrder[];
  setPage: (p: Page) => void; onOpenRecord: OpenRecord; emptyNote?: ReactNode;
  // When true (the Needs-you tab), action rows carry the per-action CTA chip +
  // consequence + amber spine and sort by urgency rank. Every other tab passes
  // false and renders standard plain rows — no tab mixes the two.
  enriched?: boolean;
}) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  type Row = { key: string; needsYou: boolean; updated: string; rank: number; node: ReactNode };
  const rows: Row[] = [];

  for (const o of orders) {
    const m = orderMeta(o);
    rows.push({
      key: `o-${o.id}`, needsYou: m.needsYou, updated: o.createdAt, rank: m.action?.rank ?? 99,
      node: (
        // The project ref stays the anchor across the whole life; the order number
        // is acceptance-time meta (it lives on invoices + payment references).
        <RecordRow key={`o-${o.id}`} refText={projectAnchor(o)} title={o.projectTitle ?? "Order"}
          pill={<StatusPill tone={m.tone}>{m.pill}</StatusPill>}
          next={<>{m.needsYou && <span className="font-semibold" style={{ color: TONE.attn.text }}>Next: you</span>}{m.needsYou ? " — " : ""}{m.next}</>}
          value={money(o.total)} meta={`${o.orderNo} · ${o.lineCount ?? "—"} lines · ${paymentNote(o)}`}
          cta={enriched ? m.action?.cta : undefined} when={enriched ? m.action?.when : undefined}
          onOpen={() => onOpenRecord({ orderId: o.id })} />
      ),
    });
  }
  for (const p of quoteProjects(projects)) {
    const m = projectMeta(p);
    const draft = p.status_customer === "draft";
    rows.push({
      key: `p-${p.id}`, needsYou: m.needsYou, updated: p.updated_at, rank: m.action?.rank ?? 99,
      node: (
        <RecordRow key={`p-${p.id}`} refText={draft ? "DRAFT" : (p.public_ref ?? "PROJECT")} title={p.title ?? "My Project"} draft={draft}
          pill={<StatusPill tone={m.tone}>{m.pill}</StatusPill>}
          next={<>{m.needsYou && <span className="font-semibold" style={{ color: TONE.attn.text }}>Next: you</span>}{m.needsYou ? " — " : ""}{m.next}</>}
          value={p.issued_total != null ? money(p.issued_total) : "—"}
          meta={`${p.item_count} line${p.item_count === 1 ? "" : "s"}${draft && p.draft_total ? ` · est. ${money(p.draft_total)}` : ""}`}
          cta={enriched ? m.action?.cta : undefined} when={enriched ? m.action?.when : undefined}
          onOpen={() => draft ? go("quote") : onOpenRecord({ projectId: p.id, status: p.status_customer })} />
      ),
    });
  }
  // Needs-you tab: most time-critical action first (rank), preserving the retired
  // gate stack's order. Browse tabs keep the needsYou-first-then-recent sort.
  if (enriched) rows.sort((a, b) => a.rank - b.rank || b.updated.localeCompare(a.updated));
  else rows.sort((a, b) => Number(b.needsYou) - Number(a.needsYou) || b.updated.localeCompare(a.updated));

  if (rows.length === 0) {
    // Empty Needs-you tab reuses the "all caught up" reassurance (relocated from
    // the retired attention section); other empty tabs keep their note.
    if (enriched) {
      return (
        <div className="card p-[18px] flex flex-col gap-[9px]" style={{ borderLeft: `3px solid ${TONE.pos.text}` }}>
          <span className="w-[34px] h-[34px] grid place-items-center border" style={{ color: TONE.pos.text, borderColor: TONE.pos.bd, background: TONE.pos.bg }}><CheckCircle className="w-[18px] h-[18px]" /></span>
          <h3 className="text-[15px] font-semibold text-ink font-display">You're all caught up</h3>
          <p className="text-[12.5px] text-body leading-relaxed">Nothing needs you right now — we'll email you and show it here the moment something does.</p>
        </div>
      );
    }
    return (
      <div className="card p-[18px]">
        <h3 className="text-sm font-semibold text-ink mb-1.5 font-display">Nothing here yet</h3>
        <p className="text-[12.5px] text-body leading-relaxed">{emptyNote ?? <>Start a quote and it will appear here as it moves from estimate to delivered order.</>}</p>
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

function RecordRow({ refText, title, pill, next, value, meta, draft, cta, when, onOpen }: {
  refText: string; title: string; pill: ReactNode; next: ReactNode; value: string; meta: string;
  draft?: boolean; cta?: string; when?: string; onOpen: () => void;
}) {
  // An ENRICHED (action) row = the plain row skeleton + an amber left spine + an
  // active right rail (CTA chip + consequence) replacing the passive value/meta.
  // Same geometry as a plain row so the list still scans.
  const enriched = !!cta;
  return (
    <button onClick={onOpen}
      className={`w-full text-left border border-black/10 px-5 py-[18px] grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] gap-x-[18px] gap-y-3 items-center transition-colors cursor-pointer hover:border-sage-light ${draft ? "bg-[repeating-linear-gradient(-45deg,transparent,transparent_9px,rgba(0,0,0,.014)_9px,rgba(0,0,0,.014)_10px)] bg-white" : "bg-white"}`}
      style={enriched ? { borderLeft: `3px solid ${TONE.attn.text}` } : undefined}>
      <span className="w-[38px] h-[38px] border border-black/10 grid place-items-center flex-shrink-0">
        <WindowMark size={18} color={draft ? "var(--quietest)" : SAGE} />
      </span>
      <span className="min-w-0 block">
        <span className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[12.5px] font-medium text-sage font-data">{refText}</span>
          <span className="text-[16.5px] font-semibold text-ink leading-tight font-display">{title}</span>
          {pill}
        </span>
        <span className="block text-[13.5px] text-body mt-[5px]">{next}</span>
      </span>
      <span className="col-span-2 sm:col-span-1 flex sm:flex-col items-center sm:items-end justify-between gap-2 border-t sm:border-t-0 border-black/[0.07] pt-3 sm:pt-0">
        {enriched ? (
          // A styled span-chip, NOT a nested <button> — the row's own onOpen is the
          // single click target (a11y-safe; mirrors the retired GateCard's chip).
          <>
            <span className="inline-flex items-center gap-2 bg-sage text-white text-[13px] font-medium px-3.5 py-[9px] whitespace-nowrap">{cta}</span>
            {when && <span className="text-[11px] text-body font-data">{when}</span>}
          </>
        ) : (
          <>
            <span className="text-[15px] font-medium text-ink" style={{ fontFamily: "'DM Mono', monospace", fontVariantNumeric: "tabular-nums" }}>{value}</span>
            <span className="text-[11.5px] text-body font-data">{meta}</span>
            <ChevronRight className="hidden sm:block w-[18px] h-[18px] text-sage" />
          </>
        )}
      </span>
    </button>
  );
}

// Empty state (a): brand-new account — a welcoming "start your first quote" hub.
function EmptyHub({ go }: { go: (p: Page) => void }) {
  return (
    <div className="max-w-xl card p-8 flex flex-col items-center text-center gap-3">
      <span className="w-12 h-12 border border-black/10 grid place-items-center"><WindowMark size={26} color={SAGE} /></span>
      <h2 className="text-lg font-semibold text-ink font-display">Start your first project</h2>
      <p className="text-[13px] text-body max-w-[36ch]">Price your windows and doors in minutes, then submit the project for a full reviewed quote.</p>
      <div className="flex flex-col sm:flex-row gap-2.5 w-full justify-center pt-1">
        <Btn variant="sage" size="md" onClick={() => go("quote")}>Start an instant estimate <ArrowRight className="w-4 h-4" /></Btn>
        <Btn variant="outline" size="md" onClick={() => go("quote")}><Upload className="w-4 h-4" />Upload a schedule</Btn>
      </div>
      <p className="w-full text-[11px] text-body leading-relaxed border-t border-black/[0.07] pt-3.5 mt-1 font-data">
        After you submit, we review it and issue a final quote — usually within 2 business days. We'll email you and it'll appear here.
      </p>
    </div>
  );
}
