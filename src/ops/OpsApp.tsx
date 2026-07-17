// ═══════════════════════════════════════════════════════════════════════════════
// AMJ OPS CONSOLE — internal admin (served on ops.* behind Cloudflare Access).
//
// O1 (staff rails): domain-allowlisted staff sign-in, the console shell, and a
// dashboard summary. Quotes queue + workspace, approvals, orders ops etc. land
// in O2+. Tabs beyond Dashboard are placeholders for now.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import {
  LayoutDashboard, FileText, CheckSquare, Package, Users, Boxes, SlidersHorizontal,
  FolderOpen, ScrollText, Settings, LogOut, Loader2, AlertCircle,
} from "lucide-react";
import { opsMe, opsChallenge, opsVerify, opsLogout, opsSummary, type OpsUser, type OpsSummary } from "./api";
import { Quotes } from "./Quotes";
import { Approvals } from "./Approvals";
import { Orders } from "./Orders";
import { Customers } from "./Customers";

const SAGE = "#5A7A6A";

type Tab = "dashboard" | "quotes" | "approvals" | "orders" | "customers" | "catalogue" | "rules" | "files" | "audit" | "admin";
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: "quotes", label: "Quotes", icon: <FileText className="w-4 h-4" /> },
  { id: "approvals", label: "Approvals", icon: <CheckSquare className="w-4 h-4" /> },
  { id: "orders", label: "Orders", icon: <Package className="w-4 h-4" /> },
  { id: "customers", label: "Customers", icon: <Users className="w-4 h-4" /> },
  { id: "catalogue", label: "Catalogue", icon: <Boxes className="w-4 h-4" /> },
  { id: "rules", label: "Rules", icon: <SlidersHorizontal className="w-4 h-4" /> },
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
            AMJ Ops
          </div>
          <p className="text-white/40 text-sm mt-2">Internal console — staff sign-in</p>
        </div>
        <div className="bg-[#1d1e17] border border-white/10 p-6 space-y-4">
          {step === "email" ? (
            <>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wide text-white/40">Work email</span>
                <input type="email" value={email} autoFocus onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
                  placeholder="you@amjtradedirect.com.au"
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
          AMJ Ops
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
        <header className="h-14 bg-white border-b border-black/8 flex items-center px-8">
          <h1 className="text-[15px] font-semibold text-[#14150f] capitalize" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {TABS.find(t => t.id === tab)?.label}
          </h1>
        </header>
        <div className="p-8">
          {tab === "dashboard" ? <Dashboard />
            : tab === "quotes" ? <Quotes />
            : tab === "approvals" ? <Approvals />
            : tab === "orders" ? <Orders />
            : tab === "customers" ? <Customers />
            : <Placeholder label={TABS.find(t => t.id === tab)?.label ?? ""} />}
        </div>
      </main>
    </div>
  );
}

function Dashboard() {
  const [s, setS] = useState<OpsSummary | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { opsSummary().then(setS).catch(() => setErr(true)); }, []);

  if (err) return <p className="text-sm text-red-600">Couldn't load the summary.</p>;
  if (!s) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;

  const cards: { label: string; value: number; hint: string; accent?: boolean }[] = [
    { label: "New submissions", value: s.submissions, hint: "awaiting triage", accent: s.submissions > 0 },
    { label: "In review", value: s.inReview, hint: "being priced" },
    { label: "Approvals pending", value: s.approvalsPending, hint: "need sign-off" },
    { label: "Active orders", value: s.activeOrders, hint: "in fulfilment" },
    { label: "Awaiting payment", value: s.awaitingPayment, hint: "deposit / balance", accent: s.awaitingPayment > 0 },
    { label: "Organisations", value: s.organisations, hint: "builder accounts" },
    { label: "Customers", value: s.customers, hint: "registered users" },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className={`bg-white border p-5 ${c.accent ? "border-[#5A7A6A]/40" : "border-black/8"}`}>
            <p className="text-[11px] uppercase tracking-wide text-[#5c5a56]">{c.label}</p>
            <p className="text-3xl font-semibold text-[#14150f] mt-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{c.value}</p>
            <p className="text-xs text-[#8b8880] mt-1">{c.hint}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-[#8b8880] mt-6">Queues, the quote workspace, approvals and order operations arrive in the next milestones.</p>
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
