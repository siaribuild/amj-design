// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT SHELL — the in-area navigation (level 2).
//
// Desktop: a ~236px left sidebar (company context + section links) beside the main
// content column, directly under the global site menu (level 1 — the only
// horizontal nav). Below the breakpoint the sidebar disappears: its links live in
// the site drawer (see Nav in App.tsx) and the content shows a compact breadcrumb.
// Left = "where can I go"; the right side stays free for per-record context.
// ═══════════════════════════════════════════════════════════════════════════════
import type { ReactNode } from "react";
import { Truck, FileText, HelpCircle } from "lucide-react";
import { type Page, SAGE, WindowMark } from "../app/ui";
import { AccountDataCtx, useAccountData, useAccount, initialsOf, quoteProjects } from "./accountModel";

export type AccountSection = "dashboard" | "projects-orders" | "quotes" | "support" | "profile" | "account-settings";

export const SECTION_LABEL: Record<AccountSection, string> = {
  dashboard: "Dashboard",
  "projects-orders": "Projects & orders",
  quotes: "Quotes",
  support: "Support",
  profile: "My profile",
  "account-settings": "Account settings",
};

type ShellUser = { name: string; company: string; email: string; type?: string };

export function AccountShell({ section, setPage, user, children }: {
  section: AccountSection;
  setPage: (p: Page) => void;
  user: ShellUser;
  children: ReactNode;
}) {
  const data = useAccountData();
  return (
    <AccountDataCtx.Provider value={data}>
      <div className="min-h-screen bg-[#FAFAF9] pt-16">
        <div className="max-w-6xl mx-auto px-6 pt-[26px] pb-[60px] grid lg:grid-cols-[236px_1fr] gap-0 lg:gap-[34px] items-start">
          <Sidebar section={section} setPage={setPage} user={user} />
          <main className="min-w-0">
            {/* Mobile breadcrumb — orients without the sidebar (spec §3.3). */}
            <div className="flex lg:hidden items-center gap-2 pb-4 text-[11px] uppercase tracking-[0.05em] text-[#5c5a56]" style={{ fontFamily: "'DM Mono', monospace" }}>
              <WindowMark size={14} color={SAGE} />
              My Dashboard <span className="opacity-45">/</span> <b className="text-[#131311] font-medium">{SECTION_LABEL[section]}</b>
            </div>
            {children}
          </main>
        </div>
      </div>
    </AccountDataCtx.Provider>
  );
}

function Sidebar({ section, setPage, user }: { section: AccountSection; setPage: (p: Page) => void; user: ShellUser }) {
  const { projects, orders } = useAccount();
  const listCount = (orders?.length ?? 0) + quoteProjects(projects ?? []).filter((p) => p.status_customer !== "expired").length;
  const quotesCount = quoteProjects(projects ?? []).length;
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };

  const items: { key: AccountSection; page: Page; label: string; icon: ReactNode; badge?: number }[] = [
    { key: "dashboard", page: "dashboard", label: "Dashboard", icon: <WindowMark size={17} color="currentColor" /> },
    { key: "projects-orders", page: "projects-orders", label: "Projects & orders", icon: <Truck className="w-[17px] h-[17px]" />, badge: listCount || undefined },
    { key: "quotes", page: "quotes", label: "Quotes", icon: <FileText className="w-[17px] h-[17px]" />, badge: quotesCount || undefined },
    { key: "support", page: "support", label: "Support", icon: <HelpCircle className="w-[17px] h-[17px]" /> },
  ];

  return (
    <aside className="hidden lg:flex flex-col sticky top-[82px]" aria-label="Account navigation">
      <div className="flex items-center gap-[11px] px-2.5 pb-[15px] border-b border-black/10 mb-2">
        <span className="w-[38px] h-[38px] bg-[#5A7A6A] text-white grid place-items-center text-sm flex-shrink-0" style={{ fontFamily: "'DM Mono', monospace" }}>
          {initialsOf(user.company || user.name)}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#131311] leading-tight truncate">{user.company || user.name}</div>
          <div className="text-[10.5px] tracking-[0.05em] text-[#5c5a56] mt-0.5" style={{ fontFamily: "'DM Mono', monospace" }}>
            {(user.type ?? "customer").toUpperCase()}{user.company ? " · TRADE" : ""}
          </div>
        </div>
      </div>
      <nav className="flex flex-col gap-px">
        {items.map((it) => {
          const on = section === it.key;
          return (
            <button key={it.key} onClick={() => go(it.page)} aria-current={on ? "page" : undefined}
              className={`flex items-center gap-[11px] px-3 py-2.5 text-sm text-left border-l-2 transition-colors cursor-pointer ${
                on ? "text-[#131311] font-semibold bg-[#5A7A6A]/[0.07] border-l-[#5A7A6A]" : "text-[#5c5a56] border-l-transparent hover:text-[#131311] hover:bg-[#5A7A6A]/[0.07]"}`}>
              <span className={on ? "text-[#5A7A6A]" : "text-[#5c5a56]"}>{it.icon}</span>
              {it.label}
              {it.badge != null && (
                <span className="ml-auto text-[11px] text-[#5c5a56] bg-black/[0.045] px-[7px] py-px" style={{ fontFamily: "'DM Mono', monospace" }}>{it.badge}</span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
