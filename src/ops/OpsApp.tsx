// ═══════════════════════════════════════════════════════════════════════════════
// OPENFRAME OPS CONSOLE — internal admin (served on ops.* behind Cloudflare Access).
//
// O1 (staff rails): domain-allowlisted staff sign-in, the console shell, and a
// dashboard summary. Quotes queue + workspace, approvals, orders ops etc. land
// in O2+. Tabs beyond Dashboard are placeholders for now.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import {
  LayoutDashboard, FileText, CheckSquare, Package, Users, Boxes, SlidersHorizontal,
  FolderOpen, ScrollText, Settings, LogOut, Loader2, AlertCircle, Mail,
} from "lucide-react";
import { Search } from "lucide-react";
import { opsMe, opsChallenge, opsVerify, opsLogout, opsSummary, opsSearch, type OpsUser, type OpsSummary, type OpsSearchResult } from "./api";
import { Projects } from "./Projects";
import { Customers } from "./Customers";
import { Pricing } from "./Pricing";
import { Enquiries } from "./Enquiries";
import { Files, Audit, Admin } from "./AdminTabs";

const SAGE = "#5A7A6A";

type Tab = "dashboard" | "projects" | "customers" | "pricing" | "enquiries" | "files" | "audit" | "admin";
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: "projects", label: "Projects", icon: <FileText className="w-4 h-4" /> },
  { id: "customers", label: "Customers", icon: <Users className="w-4 h-4" /> },
  { id: "enquiries", label: "Enquiries", icon: <Mail className="w-4 h-4" /> },
  { id: "pricing", label: "Pricing", icon: <Boxes className="w-4 h-4" /> },
  { id: "files", label: "Files", icon: <FolderOpen className="w-4 h-4" /> },
  { id: "audit", label: "Audit", icon: <ScrollText className="w-4 h-4" /> },
  { id: "admin", label: "Admin", icon: <Settings className="w-4 h-4" /> },
];

export function OpsApp() {
  const [user, setUser] = useState<OpsUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { opsMe().then(setUser).finally(() => setLoading(false)); }, []);

  if (loading) {
    return <div className="min-h-screen bg-[#14150f] flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-white/50 animate-spin" />
    </div>;
  }
  if (!user) return <OpsLogin onAuthed={setUser} />;
  return <OpsShell user={user} onSignOut={() => { opsLogout().catch(() => {}); setUser(null); }} />;
}

// ── Sign in (domain-allowlisted internal OTP) ────────────────────────────────
function OpsLogin({ onAuthed }: { onAuthed: (u: OpsUser) => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();

  const send = async () => {
    if (busy || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return;
    setBusy(true); setError("");
    try { const r = await opsChallenge(email.trim()); setDevCode(r.devCode); setStep("code"); }
    catch { setError("Something went wrong."); } finally { setBusy(false); }
  };
  const verify = async () => {
    if (busy || !/^\d{6}$/.test(code.trim())) return;
    setBusy(true); setError("");
    try { const r = await opsVerify(email.trim(), code.trim()); onAuthed(r.user); }
    catch { setError("Invalid code, or this email isn't authorised for the ops console."); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#14150f] flex items-center justify-center px-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 text-white font-semibold tracking-tight text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            <span className="w-6 h-6 border-2 grid place-items-center" style={{ borderColor: SAGE }}><span className="w-2 h-2" style={{ background: SAGE }} /></span>
            OpenFrame Ops
          </div>
          <p className="text-white/40 text-sm mt-2">Internal console — staff sign-in</p>
        </div>
        <div className="bg-[#1d1e17] border border-white/10 p-6 space-y-4">
          {step === "email" ? (
            <>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wide text-white/40">Work email</span>
                <input type="email" value={email} autoFocus onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
                  placeholder="you@openframe.com.au"
                  className="mt-1 w-full bg-[#14150f] border border-white/15 px-3 py-2 text-sm text-white outline-none focus:border-[#5A7A6A]" />
              </label>
              <button onClick={send} disabled={busy}
                className="w-full py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: SAGE }}>
                {busy ? "Sending…" : "Send code"}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-white/60">Enter the 6-digit code sent to <span className="text-white">{email.trim()}</span>.</p>
              <input value={code} autoFocus inputMode="numeric" maxLength={6}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={e => e.key === "Enter" && verify()}
                placeholder="••••••"
                className="w-full bg-[#14150f] border border-white/15 px-3 py-2 text-sm text-white tracking-[0.3em] outline-none focus:border-[#5A7A6A]" />
              {devCode && <p className="text-xs text-[#8CA99B] bg-[#5A7A6A]/10 border border-[#5A7A6A]/25 px-2 py-1.5">Dev mode — code is <span className="font-mono font-semibold">{devCode}</span></p>}
              <button onClick={verify} disabled={busy}
                className="w-full py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: SAGE }}>
                {busy ? "Verifying…" : "Sign in"}
              </button>
              <button onClick={() => { setStep("email"); setCode(""); setError(""); }} className="text-xs text-white/40 hover:text-white/70">← Change email</button>
            </>
          )}
          {error && <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}
        </div>
        <p className="text-center text-white/25 text-[11px] mt-6">Authorised staff only. Access is logged.</p>
      </div>
    </div>
  );
}

// ── Console shell ────────────────────────────────────────────────────────────
function OpsShell({ user, onSignOut }: { user: OpsUser; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  return (
    <div className="min-h-screen bg-[#f6f6f3] flex" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Sidebar */}
      <aside className="w-56 bg-[#14150f] text-white flex flex-col fixed inset-y-0 left-0">
        <div className="px-5 h-14 flex items-center gap-2 border-b border-white/10 font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          <span className="w-5 h-5 border-2 grid place-items-center" style={{ borderColor: SAGE }}><span className="w-1.5 h-1.5" style={{ background: SAGE }} /></span>
          OpenFrame Ops
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-2.5 px-5 py-2 text-sm transition-colors ${tab === t.id ? "text-white bg-white/[0.08] border-l-2" : "text-white/50 hover:text-white/80 border-l-2 border-transparent"}`}
              style={tab === t.id ? { borderColor: SAGE } : undefined}>
              {t.icon}{t.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="px-2 pb-2">
            <p className="text-sm text-white truncate">{user.name || user.email}</p>
            <p className="text-[11px] text-white/40 truncate">{user.email}</p>
          </div>
          <button onClick={onSignOut} className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-white/50 hover:text-white">
            <LogOut className="w-4 h-4" />Sign out
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 ml-56">
        <header className="h-14 bg-white border-b border-black/8 flex items-center justify-between px-8">
          <h1 className="text-[15px] font-semibold text-[#14150f] capitalize" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {TABS.find(t => t.id === tab)?.label}
          </h1>
          <SearchBox onNavigate={setTab} />
        </header>
        <div className="p-8">
          {tab === "dashboard" ? <Dashboard setTab={setTab} />
            : tab === "projects" ? <Projects />
            : tab === "customers" ? <Customers user={user} />
            : tab === "enquiries" ? <Enquiries user={user} />
            : tab === "pricing" ? <Pricing />
            : tab === "files" ? <Files />
            : tab === "audit" ? <Audit />
            : tab === "admin" ? <Admin />
            : <Placeholder label={TABS.find(t => t.id === tab)?.label ?? ""} />}
        </div>
      </main>
    </div>
  );
}

function Dashboard({ setTab }: { setTab: (t: Tab) => void }) {
  const [s, setS] = useState<OpsSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { opsSummary().then(setS).catch(e => setErr(String(e?.message ?? e))); }, []);

  // Surface the underlying status so production failures are diagnosable at a
  // glance (403 → auth/Access; 500 → server). The summary itself degrades to
  // zeros server-side, so this branch means the request never completed.
  if (err) return (
    <div className="bg-white border border-red-200 p-6">
      <p className="text-sm text-red-600 font-medium">Couldn't load the summary.</p>
      <p className="text-xs text-[#8b8880] mt-1">{err}</p>
    </div>
  );
  if (!s) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;

  // ── Needs us ───────────────────────────────────────────────────────────────
  // Rows, not cards, and every row LINKS — it never acts. The dashboard is a
  // pointer to the tab that owns the work; the moment it grows its own buttons it
  // becomes a second inbox competing with the sidebar, which is the disease the
  // project merge just cured. Rows with a zero count render nothing at all: a
  // permanent "0 pending" trains people to stop reading the screen.
  const needsUs: { key: string; count: number; text: string; tab: Tab }[] = [
    { key: "sub", count: s.submissions, text: "new submission|new submissions nobody has started", tab: "projects" },
    { key: "rev", count: s.inReview, text: "quote|quotes being priced", tab: "projects" },
    { key: "iss", count: s.readyToIssue, text: "quote is priced and ready to issue|quotes are priced and ready to issue", tab: "projects" },
    { key: "pay", count: s.awaitingPayment, text: "order awaiting payment|orders awaiting payment", tab: "projects" },
    { key: "enq", count: s.newEnquiries, text: "enquiry nobody has replied to|enquiries nobody has replied to", tab: "enquiries" },
  ].filter(r => r.count > 0);

  return (
    <div className="max-w-3xl">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[#8b8880] mb-2">Needs us</p>
      {needsUs.length === 0 ? (
        <div className="bg-white border border-black/8 px-5 py-6">
          <p className="text-sm text-[#14150f]">Nothing is waiting on us.</p>
          <p className="text-xs text-[#8b8880] mt-1">New submissions and enquiries appear here.</p>
        </div>
      ) : (
        <div className="bg-white border border-black/8 border-l-2 border-l-[#5A7A6A]">
          {needsUs.map(r => {
            const [one, many] = r.text.split("|");
            return (
              <button key={r.key} onClick={() => setTab(r.tab)}
                className="w-full text-left px-5 py-3.5 border-b border-black/5 last:border-0 hover:bg-[#faf9f6] flex items-baseline gap-3">
                <span className="text-xl font-semibold text-[#14150f]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{r.count}</span>
                <span className="text-sm text-[#3d3b38] flex-1">{r.count === 1 ? one : many}</span>
                <span className="text-xs text-[#5A7A6A]">Open →</span>
              </button>
            );
          })}
        </div>
      )}

      {/* The scoreboard, demoted and honestly inert. Fine for it to be a count —
          as long as it is not pretending to be work. */}
      <p className="text-[11px] uppercase tracking-[0.14em] text-[#8b8880] mt-7 mb-2">The shop</p>
      <div className="bg-white border border-black/8 flex flex-wrap">
        {[
          { label: "Active orders", value: s.activeOrders },
          { label: "Customers", value: s.customers },
        ].map(c => (
          <div key={c.label} className="px-5 py-4 border-r border-black/5 last:border-0">
            <p className="text-[11px] uppercase tracking-wide text-[#8b8880]">{c.label}</p>
            <p className="text-xl font-semibold text-[#14150f] mt-0.5" style={{ fontFamily: "'DM Mono', monospace" }}>{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Omnibox — searches projects/orders/orgs/customers; selecting jumps to the tab.
const TYPE_TAB: Record<string, Tab> = { project: "projects", order: "projects", organisation: "customers", customer: "customers" };
function SearchBox({ onNavigate }: { onNavigate: (t: Tab) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<OpsSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => { opsSearch(q.trim()).then(r => { setResults(r.results); setOpen(true); }).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative w-72">
      <Search className="w-4 h-4 text-[#b5b2ac] absolute left-2.5 top-2.5" />
      <input value={q} onChange={e => setQ(e.target.value)} onFocus={() => results.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search projects, orders, customers…" className="w-full border border-black/12 pl-8 pr-3 py-1.5 text-sm outline-none focus:border-[#5A7A6A]" />
      {open && results.length > 0 && (
        <div className="absolute right-0 top-full mt-1 w-full bg-white border border-black/10 shadow-lg z-20 max-h-80 overflow-y-auto">
          {results.map((r, i) => (
            <button key={i} onMouseDown={() => { onNavigate(TYPE_TAB[r.type] ?? "dashboard"); setOpen(false); setQ(""); }}
              className="w-full text-left px-3 py-2 hover:bg-[#faf9f6] flex items-center justify-between">
              <span className="text-sm text-[#14150f]">{r.label}<span className="ml-2 text-[10px] uppercase tracking-wide text-[#b5b2ac]">{r.type}</span></span>
              <span className="text-xs text-[#8b8880]">{r.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="bg-white border border-dashed border-black/15 p-12 text-center">
      <p className="text-sm text-[#5c5a56]"><span className="font-medium text-[#14150f]">{label}</span> — coming in a later milestone.</p>
    </div>
  );
}
