// ═══════════════════════════════════════════════════════════════════════════════
// OPENFRAME OPS CONSOLE — internal admin (served on ops.* behind Cloudflare Access).
//
// O1 (staff rails): domain-allowlisted staff sign-in, the console shell, and a
// dashboard summary. Quotes queue + workspace, approvals, orders ops etc. land
// in O2+. Tabs beyond Dashboard are placeholders for now.
// ═══════════════════════════════════════════════════════════════════════════════
import { SAGE } from "../styles/tokens";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, FileText, CheckSquare, Package, Users, Boxes, SlidersHorizontal,
  FolderOpen, ScrollText, Settings, LogOut, Loader2, AlertCircle, Mail, X, Menu,
} from "lucide-react";
import { Search } from "lucide-react";
import { opsMe, opsChallenge, opsVerify, opsLogout, opsSummary, opsSearch, opsBrand, type OpsUser, type OpsSummary, type OpsSearchResult, type OpsBrand } from "./api";
import { Projects } from "./Projects";
import { Customers } from "./Customers";
import { Pricing } from "./Pricing";
import { Enquiries } from "./Enquiries";
import { Files, Audit, Admin } from "./AdminTabs";


// ── Brand ────────────────────────────────────────────────────────────────────
// One request per page load, shared by all three mount points (sign-in screen,
// desktop rail, mobile drawer) — a module-scope promise rather than a fetch per
// component, which is what three independent useEffects would have been.
let brandPromise: Promise<OpsBrand> | null = null;
function useOpsBrand(): OpsBrand {
  const [brand, setBrand] = useState<OpsBrand>({ logo: null, businessName: null });
  useEffect(() => {
    brandPromise ??= opsBrand().catch(() => ({ logo: null, businessName: null }));
    let live = true;
    brandPromise.then((b) => { if (live) setBrand(b); });
    return () => { live = false; };
  }, []);
  return brand;
}

/** The console's identity. The Sanity logo already contains the wordmark, so
 *  "Ops" is set beside it rather than repeated inside it.
 *
 *  No placeholder: with nothing configured this is the business name, or failing
 *  that the plain word. An invented mark standing in for an unset logo is the
 *  thing that hides the fact that it is unset. */
function OpsLogo({ height = 24, className = "" }: { height?: number; className?: string }) {
  const { logo, businessName } = useOpsBrand();
  return (
    <span className={`inline-flex items-baseline gap-2 min-w-0 ${className}`}>
      {logo ? (
        // The asset is a 5:1 SVG drawn in near-white on sage — authored for a
        // dark ground, which is what the whole ops chrome is. Height-driven so a
        // re-uploaded logo of any width still fits.
        <img src={logo} alt={businessName ?? "Logo"} style={{ height, width: "auto" }}
          className="self-center flex-shrink-0" />
      ) : (
        <span className="text-white font-semibold truncate font-display" style={{ fontSize: height * 0.62 }}>
          {businessName ?? "OpenFrame"}
        </span>
      )}
      <span className="text-white/45 font-medium flex-shrink-0 font-display" style={{ fontSize: height * 0.52 }}>
        Ops
      </span>
    </span>
  );
}

type Tab = "dashboard" | "projects" | "customers" | "pricing" | "enquiries" | "files" | "audit" | "admin";
const ALL_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: "projects", label: "Projects", icon: <FileText className="w-4 h-4" /> },
  { id: "customers", label: "Customers", icon: <Users className="w-4 h-4" /> },
  { id: "enquiries", label: "Enquiries", icon: <Mail className="w-4 h-4" /> },
  { id: "pricing", label: "Pricing", icon: <Boxes className="w-4 h-4" /> },
  { id: "files", label: "Files", icon: <FolderOpen className="w-4 h-4" /> },
  { id: "audit", label: "Audit", icon: <ScrollText className="w-4 h-4" /> },
  { id: "admin", label: "Admin", icon: <Settings className="w-4 h-4" /> },
];

/** What this user may see.
 *
 *  A MANUFACTURER partner is not an OpenFrame staffer: they sign in through the
 *  same console, behind the same Access policy, and get exactly one tab. The
 *  Worker refuses them every other endpoint regardless — this only stops the
 *  console offering doors that would slam. */
const tabsFor = (user: OpsUser) =>
  user.role === "manufacturer" ? ALL_TABS.filter((t) => t.id === "enquiries") : ALL_TABS;

export function OpsApp() {
  const [user, setUser] = useState<OpsUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { opsMe().then(setUser).finally(() => setLoading(false)); }, []);

  if (loading) {
    return <div className="min-h-screen bg-ops flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-white/50 animate-spin" />
    </div>;
  }
  if (!user) return <OpsLogin onAuthed={setUser} />;
  return <OpsShell user={user} onSignOut={signOut} />;

  // Awaited, not fire-and-forget. The old version cleared React state
  // immediately and let the request race in the background, so the UI showed a
  // sign-in screen whether or not anything had actually been signed out.
  //
  // Behind Cloudflare Access, clearing local state is ALL it ever did: Access
  // re-injects a valid assertion on the next request, so a refresh landed the
  // user straight back in the console. Sign-out has to be a full navigation to
  // Access's logout endpoint — it clears the CF_Authorization cookie, which
  // nothing this app runs can touch.
  async function signOut() {
    let accessLogout: string | null = null;
    try {
      ({ accessLogout } = await opsLogout());
    } catch {
      // The local session may or may not have been destroyed. Fall through: in
      // Access mode the redirect is what matters and it does not depend on this.
    }
    if (accessLogout) { window.location.href = accessLogout; return; }
    setUser(null);
  }
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
    <div className="min-h-screen bg-ops flex items-center justify-center px-6 font-body">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <OpsLogo height={30} />
          <p className="text-white/40 mt-2 t-bd-sm">Internal console — staff sign-in</p>
        </div>
        <div className="bg-ops-panel border border-white/10 p-6 space-y-4">
          {step === "email" ? (
            <>
              <label className="block">
                <span className="text-white/40 t-label">Work email</span>
                <input type="email" value={email} autoFocus onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
                  placeholder="you@openframe.com.au"
                  className="mt-1 w-full bg-ops border border-white/15 px-3 py-2 text-white outline-none focus:border-sage t-bd-sm" />
              </label>
              <button onClick={send} disabled={busy}
                className="w-full py-2 font-medium text-white disabled:opacity-50 t-bd-sm" style={{ background: SAGE }}>
                {busy ? "Sending…" : "Send code"}
              </button>
            </>
          ) : (
            <>
              <p className="text-white/60 t-bd-sm">Enter the 6-digit code sent to <span className="text-white">{email.trim()}</span>.</p>
              <input value={code} autoFocus inputMode="numeric" maxLength={6}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={e => e.key === "Enter" && verify()}
                placeholder="••••••"
                className="w-full bg-ops border border-white/15 px-3 py-2 text-white tracking-[0.3em] outline-none focus:border-sage t-bd-sm" />
              {devCode && <p className="text-sage-light bg-sage-wash border border-sage/25 px-2 py-1.5 t-cap">Dev mode — code is <span className="font-mono font-semibold">{devCode}</span></p>}
              <button onClick={verify} disabled={busy}
                className="w-full py-2 font-medium text-white disabled:opacity-50 t-bd-sm" style={{ background: SAGE }}>
                {busy ? "Verifying…" : "Sign in"}
              </button>
              <button onClick={() => { setStep("email"); setCode(""); setError(""); }} className="text-white/40 hover:text-white/70 t-cap">← Change email</button>
            </>
          )}
          {error && <p className="text-red-400 flex items-center gap-1.5 t-cap"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}
        </div>
        <p className="text-center text-white/25 mt-6 t-cap">Authorised staff only. Access is logged.</p>
      </div>
    </div>
  );
}

// ── Console shell ────────────────────────────────────────────────────────────
function OpsShell({ user, onSignOut }: { user: OpsUser; onSignOut: () => void }) {
  const TABS = tabsFor(user);
  // A manufacturer has no dashboard to land on — their first tab is their only tab.
  const [tab, setTab] = useState<Tab>(TABS[0]?.id ?? "dashboard");
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="min-h-screen ground-bone flex font-body">
      {/* Sidebar — desktop and tablet only. Below md it is a fixed 224px rail on
          a 375px screen, and with the content's own p-8 that left 87px of usable
          width: 375 − 224 − 64. A nine-column table was rendering into that. */}
      <aside className="hidden md:flex w-56 bg-ops text-white flex-col fixed inset-y-0 left-0">
        <div className="px-5 h-14 flex items-center border-b border-white/10">
          <OpsLogo height={22} />
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-2.5 px-5 py-2 transition-colors ${tab === t.id ? "text-white bg-white/[0.08] border-l-2" : "text-white/50 hover:text-white/80 border-l-2 border-transparent"} t-bd-sm`}
              style={tab === t.id ? { borderColor: SAGE } : undefined}>
              {t.icon}{t.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="px-2 pb-2">
            <p className="text-white truncate t-bd-sm">{user.name || user.email}</p>
            <p className="text-white/40 truncate t-cap">{user.email}</p>
          </div>
          <button onClick={onSignOut} className="w-full flex items-center gap-2 px-2 py-1.5 text-white/50 hover:text-white t-bd-sm">
            <LogOut className="w-4 h-4" />Sign out
          </button>
        </div>
      </aside>

      {/* Content.
          `min-w-0` matters as much as the margin: a flex child defaults to
          min-width:auto, so any wide table pushed the whole document sideways and
          gave page-level horizontal scroll on top of the squeeze. */}
      <main className="flex-1 min-w-0 md:ml-56">
        {/* Sticky, not fixed: it participates in layout, so nothing needs a
            compensating pad and no content can hide beneath it. The bottom bar
            this replaces was fixed to the VIEWPORT, which is why any tab that
            overflowed horizontally (Customers) slid its content out from under
            it — the bar stayed put while the page moved sideways.
            z-30 sits under the drawer (z-50) and its scrim (z-40). */}
        <header className="sticky top-0 z-30 h-12 md:h-14 bg-white border-b border-black/8 flex items-center gap-2 px-4 md:px-8">
          {/* Always rendered on mobile, including for a manufacturer with a single
              tab: the drawer is the only place a phone user can see who they are
              signed in as and sign out. The bottom bar returned null for them,
              which left them with no way to sign out on a phone at all. */}
          <button onClick={() => setNavOpen(true)}
            className="md:hidden -ml-2 w-10 h-10 flex items-center justify-center text-body active:bg-black/5 flex-shrink-0"
            aria-label="Open menu" aria-expanded={navOpen} aria-controls="ops-nav-drawer">
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-semibold text-ops capitalize flex items-center gap-2 min-w-0 flex-1 font-display t-bd">
            <span className="truncate">{TABS.find(t => t.id === tab)?.label}</span>
          </h1>
          {/* The omnibox is a desktop control; on a phone it left ~200px of
              results under the keyboard. Search on mobile is still unbuilt —
              the bottom bar was documented as carrying a Search slot and never
              actually did, so nothing regresses here. */}
          <div className="hidden md:block"><SearchBox onNavigate={setTab} /></div>
        </header>
        <div className="p-4 md:p-8">
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

      <MobileNav open={navOpen} onClose={() => setNavOpen(false)}
        tabs={TABS} tab={tab} setTab={setTab} user={user} onSignOut={onSignOut} />
    </div>
  );
}

/** The phone's navigation: a slide-out drawer from the left, opened from the
 *  sticky header's hamburger.
 *
 *  This replaces a fixed bottom bar (four slots plus More). The bar was chosen
 *  for thumb reach on the two most repeated moves, and that reasoning was sound
 *  in isolation, but it lost on three counts in practice:
 *
 *  1. It was FIXED TO THE VIEWPORT, so on any tab whose content overflowed
 *     horizontally the page slid sideways underneath a bar that did not move —
 *     the labels ended up over the wrong columns and the active marker pointed
 *     at nothing. Customers, a six-column table with no phone treatment, did
 *     this on every phone. A drawer cannot desynchronise from content because
 *     it is not on screen while content is being read.
 *  2. Eight tabs into five slots meant three of them lived behind a generic
 *     "More" cog. The drawer shows all eight at once, in the same order and
 *     with the same icons as the desktop rail, so the two surfaces teach the
 *     same map instead of two different ones.
 *  3. It returned null for a manufacturer (one tab), and identity and Sign out
 *     lived inside its More sheet — so a partner on a phone had no way to see
 *     who they were signed in as, or to sign out at all. The drawer renders
 *     regardless of tab count for exactly that reason.
 *
 *  Still an overlay and never a route: it must not unmount the surface beneath,
 *  so the open record, scroll position and any half-typed field survive it. */
function MobileNav({ open, onClose, tabs, tab, setTab, user, onSignOut }: {
  open: boolean; onClose: () => void;
  tabs: typeof ALL_TABS; tab: Tab; setTab: (t: Tab) => void; user: OpsUser; onSignOut: () => void;
}) {
  // Escape closes, and the page behind does not scroll while it is open —
  // otherwise a swipe meant for the drawer scrolls the record underneath it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  return (
    <>
      {/* Scrim. Rendered only when open so it can never swallow a tap while
          closed — a transparent full-screen layer left mounted is the classic
          way a drawer breaks every control on the page behind it. */}
      {open && <div className="md:hidden fixed inset-0 z-40 bg-black/45" onClick={onClose} aria-hidden="true" />}

      {/* The panel itself stays mounted and translates, so opening and closing
          animate. -translate-x-full keeps it fully off-screen when closed;
          `invisible` on top of that takes it out of the tab order, which
          transform alone does not do. */}
      <aside id="ops-nav-drawer"
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-[264px] max-w-[82vw] bg-ops text-white flex flex-col
                    transition-transform duration-200 ease-out
                    ${open ? "translate-x-0" : "-translate-x-full invisible"}`}
        aria-hidden={!open}>
        <div className="px-5 h-12 flex items-center justify-between border-b border-white/10">
          <OpsLogo height={22} />
          <button onClick={onClose} className="w-10 h-10 -mr-3 flex items-center justify-center text-white/60" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Same order, same icons, same active treatment as the desktop rail.
            44px rows: this is a touch target, not a 32px desktop menu item. */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); onClose(); }}
              className={`w-full flex items-center gap-3 px-5 h-11 border-l-2 ${tab === t.id ? "text-white bg-white/[0.08]" : "text-white/55 border-transparent active:bg-white/5"} t-bd-sm`}
              style={tab === t.id ? { borderColor: SAGE } : undefined}>
              {t.icon}{t.label}
            </button>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div className="px-2 pb-2">
            <p className="text-white truncate t-bd-sm">{user.name || user.email}</p>
            <p className="text-white/40 truncate t-cap">{user.email}</p>
          </div>
          {/* Separated from the list so it is never a mis-tap of a destination. */}
          <button onClick={onSignOut} className="w-full flex items-center gap-2 px-2 h-11 text-white/55 t-bd-sm">
            <LogOut className="w-4 h-4" />Sign out
          </button>
        </div>
      </aside>
    </>
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
      <p className="text-red-600 font-medium t-bd-sm">Couldn't load the summary.</p>
      <p className="text-quiet mt-1 t-cap">{err}</p>
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
      <p className="text-quiet mb-2 t-label">Needs us</p>
      {needsUs.length === 0 ? (
        <div className="card px-5 py-6">
          <p className="text-ops t-bd-sm">Nothing is waiting on us.</p>
          <p className="text-quiet mt-1 t-cap">New submissions and enquiries appear here.</p>
        </div>
      ) : (
        <div className="card border-l-2 border-l-sage">
          {needsUs.map(r => {
            const [one, many] = r.text.split("|");
            return (
              <button key={r.key} onClick={() => setTab(r.tab)}
                className="w-full text-left px-5 py-3.5 border-b border-black/5 last:border-0 hover:bg-bone flex items-baseline gap-3">
                <span className="font-semibold text-ops font-display t-hd2">{r.count}</span>
                <span className="text-ink-soft flex-1 t-bd-sm">{r.count === 1 ? one : many}</span>
                <span className="text-sage t-cap">Open →</span>
              </button>
            );
          })}
        </div>
      )}

      {/* The scoreboard, demoted and honestly inert. Fine for it to be a count —
          as long as it is not pretending to be work. */}
      <p className="text-quiet mt-7 mb-2 t-label">The shop</p>
      <div className="card flex flex-wrap">
        {[
          { label: "Active orders", value: s.activeOrders },
          { label: "Customers", value: s.customers },
        ].map(c => (
          <div key={c.label} className="px-5 py-4 border-r border-black/5 last:border-0">
            <p className="text-quiet t-label">{c.label}</p>
            <p className="font-semibold text-ops mt-0.5 font-data t-data">{c.value}</p>
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
      <Search className="w-4 h-4 text-quietest absolute left-2.5 top-2.5" />
      <input value={q} onChange={e => setQ(e.target.value)} onFocus={() => results.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search projects, orders, customers…" className="w-full border border-black/12 pl-8 pr-3 py-1.5 outline-none focus:border-sage t-bd-sm" />
      {open && results.length > 0 && (
        <div className="absolute right-0 top-full mt-1 w-full card shadow-lg z-20 max-h-80 overflow-y-auto">
          {results.map((r, i) => (
            <button key={i} onMouseDown={() => { onNavigate(TYPE_TAB[r.type] ?? "dashboard"); setOpen(false); setQ(""); }}
              className="w-full text-left px-3 py-2 hover:bg-bone flex items-center justify-between">
              <span className="text-ops t-bd-sm">{r.label}<span className="ml-2 text-quietest t-label">{r.type}</span></span>
              <span className="text-quiet t-cap">{r.hint}</span>
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
      <p className="text-body t-bd-sm"><span className="font-medium text-ops">{label}</span> — coming in a later milestone.</p>
    </div>
  );
}
