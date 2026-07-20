// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER ACCOUNT AREA
//
// Shared shell for the signed-in account: a persistent right-side navigation rail
// on desktop (visually secondary; operational content stays dominant), collapsing
// to nothing on tablet/mobile — where the same links live in the global menu
// drawer (see Nav in App.tsx). Sections: Overview, Quotes, Orders, Profile
// settings, Account settings. Tables render as stacked records on small screens.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, LogOut } from "lucide-react";
import { type Page, SLabel, Btn } from "../app/ui";
import { getProjects, getOrders, logout as apiLogout, type ApiProjectSummary, type ApiOrder } from "../data/api";
import { fmt } from "../data/configurator";

// ─── Status vocabulary (shared, consistent labels) ────────────────────────────
export const PROJECT_STATUS: Record<string, { label: string; cls: string; action: string }> = {
  draft:             { label: "Draft",                cls: "text-[#5c5a56] bg-[#F2F0EC] border-black/10",        action: "Continue" },
  submitted:         { label: "Submitted",            cls: "text-amber-700 bg-amber-50 border-amber-200",        action: "View quote" },
  under_review:      { label: "In review",            cls: "text-amber-700 bg-amber-50 border-amber-200",        action: "View quote" },
  needs_information: { label: "Needs information",     cls: "text-red-700 bg-red-50 border-red-200",              action: "Respond" },
  quote_issued:      { label: "Reviewed quote ready", cls: "text-[#5A7A6A] bg-[#5A7A6A]/8 border-[#5A7A6A]/20", action: "View quote" },
  accepted:          { label: "Accepted",             cls: "text-[#5A7A6A] bg-[#5A7A6A]/8 border-[#5A7A6A]/20", action: "Track order" },
  expired:           { label: "Expired",              cls: "text-[#5c5a56] bg-[#F2F0EC] border-black/10",        action: "View quote" },
  closed:            { label: "Order placed",         cls: "text-blue-700 bg-blue-50 border-blue-200",           action: "Track order" },
};
export const STAGE_LABEL: Record<string, string> = {
  deposit_invoiced: "Deposit due", deposit_paid: "Deposit received", drawings_shared: "Shop drawings",
  drawings_signed_off: "Drawings approved", manufacturing: "In production", qa_photos_shared: "Quality check",
  balance_invoiced: "Balance due", balance_paid: "Balance received", customer_confirmed: "Confirmed",
  dispatched: "Dispatched", delivered: "Delivered", after_sales: "Completed",
};
const PAYMENT_DUE = new Set(["deposit_invoiced", "balance_invoiced"]);
const ORDER_CLOSED = new Set(["delivered", "after_sales"]);

const fmtDate = (s: string) => { const d = new Date(s.replace(" ", "T") + "Z"); return isNaN(+d) ? "" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }); };

// ─── Data ─────────────────────────────────────────────────────────────────────
export function useAccountData() {
  const [projects, setProjects] = useState<ApiProjectSummary[] | null>(null);
  const [orders, setOrders] = useState<ApiOrder[] | null>(null);
  useEffect(() => {
    let off = false;
    Promise.all([getProjects().catch(() => ({ projects: [] })), getOrders().catch(() => ({ orders: [] }))])
      .then(([p, o]) => { if (!off) { setProjects(p.projects); setOrders(o.orders); } });
    return () => { off = true; };
  }, []);
  return { projects, orders };
}

// ─── Navigation ───────────────────────────────────────────────────────────────
export const ACCOUNT_NAV: { label: string; page: Page }[] = [
  { label: "Overview", page: "dashboard" },
  { label: "Quotes", page: "quotes" },
  { label: "Orders", page: "orders" },
  { label: "Profile settings", page: "profile" },
  { label: "Account settings", page: "account-settings" },
];
export function isAccountActive(current: Page, item: Page): boolean {
  if (item === "orders") return current === "orders" || current === "order" || current === "track-order";
  return current === item;
}

function RailNav({ page, go, signOut }: { page: Page; go: (p: Page) => void; signOut: () => void }) {
  return (
    <>
      <p className="text-[11px] uppercase tracking-[0.14em] text-[#8b8880] mb-3 px-3">My account</p>
      <ul className="space-y-0.5">
        {ACCOUNT_NAV.map(({ label, page: p }) => {
          const active = isAccountActive(page, p);
          return (
            <li key={p}>
              <button onClick={() => go(p)} aria-current={active ? "page" : undefined}
                className={`w-full text-left px-3 py-2 text-sm border-l-2 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A] ${
                  active ? "border-l-[#5A7A6A] bg-[#5A7A6A]/8 text-[#131311] font-medium" : "border-l-transparent text-[#5c5a56] hover:text-[#131311] hover:bg-black/[0.03]"}`}>
                {label}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-black/8 mt-3 pt-3">
        <button onClick={signOut}
          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
          <LogOut className="w-3.5 h-3.5" />Sign out
        </button>
      </div>
    </>
  );
}

// ─── Layout shell ─────────────────────────────────────────────────────────────
export function AccountLayout({ page, setPage, setUser, children }: {
  page: Page; setPage: (p: Page) => void; setUser: (u: null) => void; children: ReactNode;
}) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const signOut = () => { apiLogout().catch(() => {}); setUser(null); go("home"); };
  return (
    <div className="relative min-h-screen bg-[#FAFAF9] pt-16">
      <div className="max-w-6xl mx-auto px-6 py-10 lg:py-12">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_236px] lg:gap-12">
          <main className="min-w-0">{children}</main>
          <aside className="hidden lg:block">
            <nav aria-label="Account" className="sticky top-24">
              <RailNav page={page} go={go} signOut={signOut} />
            </nav>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ─── Records + sections ───────────────────────────────────────────────────────
function AccountRecord({ title, status, statusClass, meta, actionLabel, onAction }: {
  title: string; status: string; statusClass: string; meta?: string; actionLabel: string; onAction: () => void;
}) {
  return (
    <div className="border-t border-black/8 first:border-t-0 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-medium text-sm text-[#131311] break-words">{title}</span>
          <span className={`text-[11px] px-2 py-0.5 font-medium border ${statusClass}`}>{status}</span>
        </div>
        {meta && <div className="text-xs text-[#5c5a56] mt-1">{meta}</div>}
      </div>
      <button onClick={onAction}
        className="inline-flex items-center gap-1.5 text-sm text-[#5A7A6A] hover:underline cursor-pointer self-start sm:self-auto flex-shrink-0 min-h-[44px] sm:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A]">
        {actionLabel} <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function Section({ title, viewAll, children }: { title: string; viewAll?: () => void; children: ReactNode }) {
  return (
    <section className="mb-8" aria-label={title}>
      <div className="flex items-center justify-between mb-1.5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#5c5a56]" style={{ fontFamily: "'DM Mono', monospace" }}>{title}</h2>
        {viewAll && (
          <button onClick={viewAll} className="text-xs text-[#5A7A6A] hover:underline cursor-pointer">View all →</button>
        )}
      </div>
      <div className="bg-white border border-black/8 px-5">{children}</div>
    </section>
  );
}

type SectionProps = {
  user: { name: string; company: string; email: string };
  go: (p: Page) => void;
  onOpenRecord: (rec: { orderId?: string; projectId?: string; status?: string }) => void;
};

const projStatus = (s: string) => PROJECT_STATUS[s] ?? { label: s, cls: "text-[#5c5a56] bg-[#F2F0EC] border-black/10", action: "View" };
const projectMeta = (p: ApiProjectSummary) => `${p.item_count} item${p.item_count !== 1 ? "s" : ""} · updated ${fmtDate(p.updated_at)}`;
const openProject = (p: ApiProjectSummary, go: SectionProps["go"], onOpenRecord: SectionProps["onOpenRecord"]) =>
  p.status_customer === "draft" ? go("quote") : onOpenRecord({ projectId: p.id, status: p.status_customer });

// Routed account page: loads data once, guards auth, and renders the right
// data-driven section (Overview / Quotes / Orders) inside the shared layout.
export function AccountPage({ page, setPage, setUser, user, authLoading, onOpenRecord }: {
  page: Page; setPage: (p: Page) => void; setUser: (u: null) => void;
  user: { name: string; company: string; email: string } | null; authLoading?: boolean;
  onOpenRecord: SectionProps["onOpenRecord"];
}) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const { projects, orders } = useAccountData();
  if (!user) { if (!authLoading) go("login"); return null; }
  const sp = { user, go, onOpenRecord };
  const content = page === "quotes" ? <AccountQuotes {...sp} projects={projects} />
    : page === "orders" ? <AccountOrders {...sp} orders={orders} />
    : <AccountOverview {...sp} projects={projects} orders={orders} />;
  return <AccountLayout page={page} setPage={setPage} setUser={setUser}>{content}</AccountLayout>;
}

// OVERVIEW — action-required, projects & quotes, active orders. Sections show
// only when populated; no counters or decorative cards.
export function AccountOverview({ user, go, onOpenRecord, projects, orders }: SectionProps & { projects: ApiProjectSummary[] | null; orders: ApiOrder[] | null }) {
  const loading = projects === null || orders === null;
  const projs = projects ?? [];
  const ords = orders ?? [];

  const actionProjects = projs.filter(p => ["draft", "needs_information", "quote_issued"].includes(p.status_customer));
  const dueOrders = ords.filter(o => PAYMENT_DUE.has(o.stage));
  const openProjects = projs.filter(p => !["closed", "expired"].includes(p.status_customer));
  // "Projects & quotes" lists in-progress work not already surfaced under Action required.
  const otherProjects = openProjects.filter(p => !actionProjects.some(a => a.id === p.id));
  const activeOrders = ords.filter(o => !ORDER_CLOSED.has(o.stage));
  const hasAnything = projs.length > 0 || ords.length > 0;

  return (
    <>
      <header className="mb-8">
        <SLabel>Customer account</SLabel>
        <h1 className="text-3xl md:text-4xl font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>G'day, {user.name.split(" ")[0]}</h1>
        <p className="text-[#5c5a56] text-sm mt-1">{user.company || user.email}</p>
        <div className="mt-5"><Btn variant="sage" size="md" onClick={() => go("quote")}>Start a quote <ArrowRight className="w-4 h-4" /></Btn></div>
      </header>

      {loading ? (
        <div className="bg-white border border-black/8 p-8 text-sm text-[#5c5a56]">Loading your account…</div>
      ) : !hasAnything ? (
        <div className="bg-white border border-black/8 p-8 text-sm text-[#5c5a56]">
          You don't have any quotes or orders yet. Start a quote above to build your first project.
        </div>
      ) : (
        <>
          {(actionProjects.length > 0 || dueOrders.length > 0) && (
            <Section title="Action required">
              {actionProjects.map(p => {
                const st = projStatus(p.status_customer);
                return <AccountRecord key={p.id} title={p.title || "Project"} status={st.label} statusClass={st.cls}
                  meta={projectMeta(p)} actionLabel={st.action} onAction={() => openProject(p, go, onOpenRecord)} />;
              })}
              {dueOrders.map(o => (
                <AccountRecord key={o.id} title={o.orderNo} status={STAGE_LABEL[o.stage] ?? o.stage} statusClass="text-red-700 bg-red-50 border-red-200"
                  meta={o.total != null ? fmt(o.total) : undefined} actionLabel="Pay deposit" onAction={() => onOpenRecord({ orderId: o.id })} />
              ))}
            </Section>
          )}

          {otherProjects.length > 0 && (
            <Section title="Projects & quotes" viewAll={() => go("quotes")}>
              {otherProjects.slice(0, 4).map(p => {
                const st = projStatus(p.status_customer);
                return <AccountRecord key={p.id} title={p.title || "Project"} status={st.label} statusClass={st.cls}
                  meta={projectMeta(p)} actionLabel={st.action} onAction={() => openProject(p, go, onOpenRecord)} />;
              })}
            </Section>
          )}

          {activeOrders.length > 0 && (
            <Section title="Active orders" viewAll={() => go("orders")}>
              {activeOrders.slice(0, 4).map(o => (
                <AccountRecord key={o.id} title={o.orderNo} status={STAGE_LABEL[o.stage] ?? o.stage} statusClass="text-blue-700 bg-blue-50 border-blue-200"
                  meta={o.total != null ? fmt(o.total) : undefined} actionLabel="Track order" onAction={() => onOpenRecord({ orderId: o.id })} />
              ))}
            </Section>
          )}
        </>
      )}
    </>
  );
}

// QUOTES — every project/quote.
export function AccountQuotes({ go, onOpenRecord, projects }: SectionProps & { projects: ApiProjectSummary[] | null }) {
  return (
    <>
      <header className="mb-8">
        <SLabel>Customer account</SLabel>
        <h1 className="text-3xl md:text-4xl font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Quotes</h1>
      </header>
      {projects === null ? (
        <div className="bg-white border border-black/8 p-8 text-sm text-[#5c5a56]">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="bg-white border border-black/8 p-8 text-sm text-[#5c5a56] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <span>No projects or quotes yet.</span>
          <Btn variant="sage" size="sm" onClick={() => go("quote")}>Start a quote</Btn>
        </div>
      ) : (
        <div className="bg-white border border-black/8 px-5">
          {projects.map(p => {
            const st = projStatus(p.status_customer);
            return <AccountRecord key={p.id} title={p.title || "Project"} status={st.label} statusClass={st.cls}
              meta={projectMeta(p)} actionLabel={st.action} onAction={() => openProject(p, go, onOpenRecord)} />;
          })}
        </div>
      )}
    </>
  );
}

// ORDERS — every order (active + delivered).
export function AccountOrders({ onOpenRecord, orders }: SectionProps & { orders: ApiOrder[] | null }) {
  return (
    <>
      <header className="mb-8">
        <SLabel>Customer account</SLabel>
        <h1 className="text-3xl md:text-4xl font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Orders</h1>
      </header>
      {orders === null ? (
        <div className="bg-white border border-black/8 p-8 text-sm text-[#5c5a56]">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="bg-white border border-black/8 p-8 text-sm text-[#5c5a56]">No orders yet — orders appear here once you accept a reviewed quote.</div>
      ) : (
        <div className="bg-white border border-black/8 px-5">
          {orders.map(o => {
            const closed = ORDER_CLOSED.has(o.stage);
            return <AccountRecord key={o.id} title={o.orderNo} status={STAGE_LABEL[o.stage] ?? o.stage}
              statusClass={closed ? "text-[#5c5a56] bg-[#F2F0EC] border-black/10" : "text-blue-700 bg-blue-50 border-blue-200"}
              meta={o.total != null ? fmt(o.total) : undefined} actionLabel={closed ? "View" : "Track order"} onAction={() => onOpenRecord({ orderId: o.id })} />;
          })}
        </div>
      )}
    </>
  );
}
