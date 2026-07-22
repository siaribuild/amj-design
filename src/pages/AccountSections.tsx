// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT SECTIONS — the unified Projects list (one object end-to-end, with phase
// FILTERS instead of an object split: Active quotes · On order · Completed), and
// Support. Rendered inside AccountShell.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { Phone, Mail, MessageSquare, BookOpen, ArrowRight } from "lucide-react";
import { type Page, Btn } from "../app/ui";
import { useAccount, quoteProjects } from "./accountModel";
import { UnifiedList } from "./AccountDashboard";

type OpenRecord = (rec: { orderId?: string; projectId?: string; status?: string }) => void;
type SectionProps = { setPage: (p: Page) => void; onOpenRecord: OpenRecord };

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="mb-[22px]">
      <h1 className="font-semibold text-[#131311] leading-[1.05]" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.7rem,3.6vw,2.15rem)" }}>{title}</h1>
      <p className="text-sm text-[#5c5a56] mt-[5px]">{sub}</p>
    </header>
  );
}

type ProjectsTab = "all" | "quotes" | "on-order" | "completed";
const TABS: { id: ProjectsTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "quotes", label: "Active quotes" },
  { id: "on-order", label: "On order" },
  { id: "completed", label: "Completed" },
];

export function ProjectsOrdersPage({ setPage, onOpenRecord }: SectionProps) {
  const { projects, orders, loading } = useAccount();
  const [tab, setTab] = useState<ProjectsTab>("all");

  const allQuotes = quoteProjects(projects ?? []);
  const activeQuotes = allQuotes.filter((p) => p.status_customer !== "expired");
  const onOrder = (orders ?? []).filter((o) => !["delivered", "after_sales"].includes(o.stage));
  const completed = (orders ?? []).filter((o) => ["delivered", "after_sales"].includes(o.stage));

  const view = tab === "quotes" ? { p: activeQuotes, o: [] }
    : tab === "on-order" ? { p: [], o: onOrder }
    : tab === "completed" ? { p: [], o: completed }
    : { p: allQuotes, o: orders ?? [] };

  const counts: Record<ProjectsTab, number> = {
    all: allQuotes.length + (orders ?? []).length,
    quotes: activeQuotes.length,
    "on-order": onOrder.length,
    completed: completed.length,
  };

  return (
    <>
      <Head title="Projects" sub="Every project in one place — from first line to delivered order. A quote is the price a project receives; an order is what it becomes when you accept." />
      <div className="flex items-center gap-1 border-b border-black/10 mb-4 overflow-x-auto" role="tablist" aria-label="Filter projects">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer ${tab === t.id ? "border-[#5A7A6A] text-[#131311] font-medium" : "border-transparent text-[#8b8880] hover:text-[#131311]"}`}>
            {t.label}{counts[t.id] > 0 && <span className="ml-1.5 text-[11px] text-[#8b8880]" style={{ fontFamily: "'DM Mono', monospace" }}>{counts[t.id]}</span>}
          </button>
        ))}
      </div>
      {loading
        ? <div className="bg-white border border-black/10 p-8 text-sm text-[#5c5a56]">Loading…</div>
        : view.p.length + view.o.length === 0
          ? (
            <div className="bg-white border border-black/10 p-[18px] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <p className="text-[13px] text-[#5c5a56]">
                {tab === "on-order" ? "Nothing on order yet — your order opens the moment you accept a quote."
                  : tab === "completed" ? "No completed orders yet."
                  : tab === "quotes" ? "No active quotes. Start a project from the estimator."
                  : "No projects yet. Start one and it will appear here."}
              </p>
              {(tab === "all" || tab === "quotes") && (
                <Btn variant="sage" size="sm" onClick={() => { setPage("quote"); window.scrollTo(0, 0); }}>Start a project <ArrowRight className="w-4 h-4" /></Btn>
              )}
            </div>
          )
          : <UnifiedList projects={view.p} orders={view.o} setPage={setPage} onOpenRecord={onOpenRecord} />}
    </>
  );
}

export function SupportPage({ setPage }: { setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  return (
    <>
      <Head title="Support" sub="A person, not a ticket queue — reach the team working on your project." />
      <div className="grid sm:grid-cols-2 gap-4 max-w-3xl">
        <div className="bg-white border border-black/10 p-5">
          <h3 className="text-[13px] uppercase tracking-[0.1em] text-[#5c5a56] font-medium mb-3.5" style={{ fontFamily: "'DM Mono', monospace" }}>Talk to us</h3>
          <a href="tel:0390000000" className="flex items-center gap-2.5 text-sm text-[#131311] hover:text-[#5A7A6A] mb-2"><Phone className="w-4 h-4 text-[#5A7A6A]" />(03) 9000 0000</a>
          <a href="mailto:quotes@openframe.com.au" className="flex items-center gap-2.5 text-sm text-[#131311] hover:text-[#5A7A6A]"><Mail className="w-4 h-4 text-[#5A7A6A]" />quotes@openframe.com.au</a>
          <p className="text-xs text-[#5c5a56] mt-3 pt-3 border-t border-black/[0.07]">Mon–Fri 8am–5pm · Sat by appointment</p>
        </div>
        <div className="bg-white border border-black/10 p-5">
          <h3 className="text-[13px] uppercase tracking-[0.1em] text-[#5c5a56] font-medium mb-3.5" style={{ fontFamily: "'DM Mono', monospace" }}>Send a message</h3>
          <p className="text-[13px] text-[#5c5a56] leading-relaxed mb-4">Product, sizing or pricing questions — a real person replies within one business day. Include your project reference (OF-…) so we open the right record.</p>
          <Btn variant="sage" size="sm" onClick={() => go("contact")}><MessageSquare className="w-4 h-4" />Message AMJ</Btn>
        </div>
        <div className="bg-white border border-black/10 p-5 sm:col-span-2">
          <h3 className="text-[13px] uppercase tracking-[0.1em] text-[#5c5a56] font-medium mb-3.5" style={{ fontFamily: "'DM Mono', monospace" }}>Guides</h3>
          <div className="flex flex-wrap gap-2.5">
            <Btn variant="outline" size="sm" onClick={() => go("how-it-works")}><BookOpen className="w-4 h-4" />How the quote-to-order process works</Btn>
            <Btn variant="outline" size="sm" onClick={() => go("resources")}><BookOpen className="w-4 h-4" />Measuring & product guides</Btn>
          </div>
          <p className="text-xs text-[#5c5a56] mt-4">Order updates (quotes issued, invoices, sign-off requests) always arrive by email — they're not optional notifications you can miss.</p>
        </div>
      </div>
    </>
  );
}
