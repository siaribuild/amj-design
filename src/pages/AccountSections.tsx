// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT SECTIONS — Projects & orders (the unified list, full), Quotes (the
// quote-lifecycle subset), and Support. Rendered inside AccountShell.
// ═══════════════════════════════════════════════════════════════════════════════
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

export function ProjectsOrdersPage({ setPage, onOpenRecord }: SectionProps) {
  const { projects, orders, loading } = useAccount();
  return (
    <>
      <Head title="Projects & orders" sub="Everything in one place — from draft quote to delivered order." />
      {loading
        ? <div className="bg-white border border-black/10 p-8 text-sm text-[#5c5a56]">Loading…</div>
        : <UnifiedList projects={projects ?? []} orders={orders ?? []} setPage={setPage} onOpenRecord={onOpenRecord}
            emptyNote={<>No projects or orders yet. Start a quote and it will appear here.</>} />}
      {!loading && (orders ?? []).length === 0 && (projects ?? []).length > 0 && (
        <div className="mt-4 bg-white border border-black/10 p-[18px]">
          <h3 className="text-sm font-semibold text-[#131311] mb-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>No orders yet</h3>
          <p className="text-[12.5px] text-[#5c5a56] leading-relaxed">Your order opens the moment AMJ issues a quote and you accept it.</p>
        </div>
      )}
    </>
  );
}

export function QuotesPage({ setPage, onOpenRecord }: SectionProps) {
  const { projects, loading } = useAccount();
  const quotes = quoteProjects(projects ?? []);
  return (
    <>
      <Head title="Quotes" sub="Drafts, submissions under review, and issued quotes awaiting your decision." />
      {loading
        ? <div className="bg-white border border-black/10 p-8 text-sm text-[#5c5a56]">Loading…</div>
        : quotes.length === 0
          ? (
            <div className="bg-white border border-black/10 p-[18px] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <p className="text-[13px] text-[#5c5a56]">No quotes in progress. Start one from the estimator.</p>
              <Btn variant="sage" size="sm" onClick={() => { setPage("quote"); window.scrollTo(0, 0); }}>Start a quote <ArrowRight className="w-4 h-4" /></Btn>
            </div>
          )
          : <UnifiedList projects={quotes} orders={[]} setPage={setPage} onOpenRecord={onOpenRecord} />}
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
          <p className="text-[13px] text-[#5c5a56] leading-relaxed mb-4">Product, sizing or quote questions — a real person replies within one business day. Include your reference (OF-…) so we open the right record.</p>
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
