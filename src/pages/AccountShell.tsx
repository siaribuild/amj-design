// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT SHELL — the in-area navigation, collapsed to a single RIGHT rail.
//
// The old three surfaces (top "My Dashboard" button, avatar dropdown, left
// sidebar) merge into one right-hand rail that carries BOTH content nav (My
// Projects) and account/session actions (Account · Help · Sign out) under the
// company identity header. Content owns the left; the right edge is the identity/
// nav column — mirroring the mobile drawer (which already slides from the right).
// Below the breakpoint the rail folds into the site drawer (see Nav in App.tsx)
// and the content shows a compact breadcrumb.
// ═══════════════════════════════════════════════════════════════════════════════
import type { ReactNode } from "react";
import { User, HelpCircle, LogOut } from "lucide-react";
import { type Page, SAGE, WindowMark as Mark } from "../app/ui";
import { AccountDataCtx, useAccountData, useAccount, initialsOf, quoteProjects } from "./accountModel";

// Three destinations after the object-model + IA collapse.
export type AccountSection = "projects" | "account" | "help";

export const SECTION_LABEL: Record<AccountSection, string> = {
  projects: "My Projects",
  account: "Account",
  help: "Help",
};

type ShellUser = { name: string; company: string; email: string; type?: string };

export function AccountShell({ section, setPage, user, onSignOut, children }: {
  section: AccountSection;
  setPage: (p: Page) => void;
  user: ShellUser;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const data = useAccountData();
  return (
    <AccountDataCtx.Provider value={data}>
      <div className="min-h-screen ground-bone pt-16">
        {/* Content LEFT, identity/nav rail RIGHT. */}
        <div className="max-w-6xl mx-auto px-6 pt-[26px] pb-[60px] grid lg:grid-cols-[1fr_236px] gap-0 lg:gap-[34px] items-start">
          <main className="min-w-0 lg:order-1 order-2">
            {/* Mobile breadcrumb — orients without the rail. */}
            <div className="flex lg:hidden items-center gap-2 pb-4 text-[11px] uppercase tracking-[0.05em] text-body" style={{ fontFamily: "'DM Mono', monospace" }}>
              <Mark size={14} color={SAGE} />
              My Projects <span className="opacity-45">/</span> <b className="text-ink font-medium">{SECTION_LABEL[section]}</b>
            </div>
            {children}
          </main>
          <Rail section={section} setPage={setPage} user={user} onSignOut={onSignOut} />
        </div>
      </div>
    </AccountDataCtx.Provider>
  );
}

function Rail({ section, setPage, user, onSignOut }: {
  section: AccountSection; setPage: (p: Page) => void; user: ShellUser; onSignOut: () => void;
}) {
  const { projects, orders } = useAccount();
  const listCount = (orders?.length ?? 0) + quoteProjects(projects ?? []).filter((p) => p.status_customer !== "expired").length;
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };

  const nav: { key: AccountSection; page: Page; label: string; icon: ReactNode; badge?: number }[] = [
    { key: "projects", page: "dashboard", label: "My Projects", icon: <Mark size={17} color="currentColor" />, badge: listCount || undefined },
  ];
  const account: { key: AccountSection; page: Page; label: string; icon: ReactNode }[] = [
    { key: "account", page: "account", label: "Account", icon: <User className="w-[17px] h-[17px]" /> },
    { key: "help", page: "help", label: "Help & contact", icon: <HelpCircle className="w-[17px] h-[17px]" /> },
  ];

  const Item = ({ it }: { it: { key: AccountSection; page: Page; label: string; icon: ReactNode; badge?: number } }) => {
    const on = section === it.key;
    return (
      <button onClick={() => go(it.page)} aria-current={on ? "page" : undefined}
        className={`flex items-center gap-[11px] px-3 py-2.5 text-sm text-left border-l-2 transition-colors cursor-pointer ${
          on ? "text-ink font-semibold bg-sage/[0.07] border-l-sage" : "text-body border-l-transparent hover:text-ink hover:bg-sage/[0.07]"}`}>
        <span className={on ? "text-sage" : "text-body"}>{it.icon}</span>
        {it.label}
        {it.badge != null && (
          <span className="ml-auto text-[11px] text-body bg-black/[0.045] px-[7px] py-px" style={{ fontFamily: "'DM Mono', monospace" }}>{it.badge}</span>
        )}
      </button>
    );
  };

  return (
    <aside className="hidden lg:flex flex-col sticky top-[82px] lg:order-2" aria-label="Account navigation">
      {/* Identity header — the always-on "which account / am I trade" glance. */}
      <div className="flex items-center gap-[11px] px-2.5 pb-[15px] border-b border-black/10 mb-2">
        <span className="w-[38px] h-[38px] bg-sage text-white grid place-items-center text-sm flex-shrink-0" style={{ fontFamily: "'DM Mono', monospace" }}>
          {initialsOf(user.company || user.name)}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink leading-tight truncate">{user.company || user.name}</div>
          <div className="text-[10.5px] tracking-[0.05em] text-body mt-0.5" style={{ fontFamily: "'DM Mono', monospace" }}>
            {(user.type ?? "customer").toUpperCase()}{user.company ? " · TRADE" : ""}
          </div>
        </div>
      </div>
      {/* Content nav */}
      <nav className="flex flex-col gap-px" aria-label="Content">
        {nav.map((it) => <Item key={it.key} it={it} />)}
      </nav>
      {/* Account / session */}
      <div className="border-t border-black/10 mt-3 pt-3 flex flex-col gap-px">
        {account.map((it) => <Item key={it.key} it={it} />)}
        <button onClick={onSignOut}
          className="flex items-center gap-[11px] px-3 py-2.5 text-sm text-left border-l-2 border-l-transparent text-body hover:text-ink hover:bg-sage/[0.07] transition-colors cursor-pointer">
          <LogOut className="w-[17px] h-[17px]" />Sign out
        </button>
      </div>
    </aside>
  );
}
