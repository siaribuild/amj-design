import { useState, useEffect, useMemo, useRef } from "react";
import {
  Menu, X, ArrowRight, ChevronRight, ChevronLeft,
  Upload, Check, AlertCircle, Truck, FileText, Phone,
  Mail, MapPin, Plus, Minus, Info, Shield, Bot,
  MessageSquare, CheckCircle, XCircle, Download,
  Send, Eye, LogOut, Package, LayoutDashboard,
  Search, Lock, Key, Bell, Settings, ExternalLink
} from "lucide-react";
import { type Page, SAGE, DARK, WARM, WindowMark, GhostMark, SLabel, Btn, FieldLabel, Input } from "./ui";
import { getSiteBrand, brandName } from "../data/sanity";
import { ObfuscatedEmail } from "../components/ObfuscatedEmail";
import { ProductsPage } from "../pages/ProductsPage";
import { ProductDetailPage } from "../pages/ProductDetailPage";
import { AccountShell, type AccountSection } from "../pages/AccountShell";
import { AccountDashboard } from "../pages/AccountDashboard";
import { HelpPage } from "../pages/AccountSections";
import { OrderDetail, ProjectDetail } from "../pages/RecordDetailPage";
import { QuoteReviewPage } from "../pages/QuoteReviewPage";
import { initialsOf } from "../pages/accountModel";
import { QuotePage } from "../pages/QuotePage";
import { HowItWorksPage } from "../pages/HowItWorksPage";
import { type TrackFocus } from "../pages/OrderTrackingPage";
import { ContactPage } from "../pages/ContactPage";
import { PrivacyPolicyPage } from "../pages/PrivacyPolicyPage";
import { pathForPage, routeFromPathname } from "./routes";
import { products as catalogueProducts, type CategorySlug, getPage, imageUrl, getProductBySlug, getFamily, getCategory, getActiveLocations } from "../data/catalogue";
import { parseScheduleText } from "../data/scheduleParse";
import { matchSchedule } from "../data/scheduleMatch";
import { Seo } from "./Seo";
import type { QItem, QFile, QuoteState } from "../data/configurator";
import { suggestCode, fmt, DEFAULT_PROJECT_TITLE } from "../data/configurator";
import { getCurrentProject, saveLines, submitProject, updateProfile, clearDraft, me as fetchMe, logout as apiLogout, requestCode, verifyCode, guestTrackRequest, guestTrackVerify, guestRecord, guestSignOut, getProjects, getOrders, type AuthUserDto, type ApiOrder, type ApiProjectSummary, type SubmitContact, type SubmitResult } from "../data/api";
import { GstContext, type GstMode } from "../data/gst";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuthUser {
  id: string;
  name: string; company: string; type: "builder" | "trade" | "owner-builder";
  email: string; phone: string;
  abn: string; priceGstMode: GstMode; createdAt: string | null;
}

// Map the server user onto the UI's AuthUser. `type` belongs to the organisation
// layer (not built yet) and defaults until that lands; `company` (business name),
// `abn` and `priceGstMode` are real, editable fields on the user's profile.
function toAuthUser(u: AuthUserDto): AuthUser {
  return {
    id: u.id,
    name: u.name || u.email.split("@")[0],
    company: u.company || "",
    type: "builder",
    email: u.email,
    phone: u.phone || "",
    abn: u.abn || "",
    priceGstMode: u.priceGstMode === "ex" ? "ex" : "inc",
    createdAt: u.createdAt || null,
  };
}

// Subtle window-grid texture — used on text-only sections
const GRID_BG = {
  backgroundImage: `linear-gradient(to right,rgba(90,122,106,0.04) 1px,transparent 1px),linear-gradient(to bottom,rgba(90,122,106,0.04) 1px,transparent 1px)`,
  backgroundSize: "72px 72px",
};

const IMG = {
  hero:    "https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1920&h=1080&fit=crop&auto=format",
  doors:   "https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1200&h=900&fit=crop&auto=format",
  windows: "https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format",
  detail:  "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1600&h=900&fit=crop&auto=format",
  facade:  "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=800&h=1000&fit=crop&auto=format",
  window2: "https://images.unsplash.com/photo-1699259160970-a42f68d2eb2e?w=800&h=600&fit=crop&auto=format",
};

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN PRIMITIVES — WindowMark / GhostMark / SLabel / Btn now live in ./ui
// ═══════════════════════════════════════════════════════════════════════════════

// FrameCorners removed — four-corner mark reads as resize handle (universal UI convention).
// Card framing is now expressed through the border-color transition on hover,
// dark header strips on widget cards, and the GhostMark watermarks in section backgrounds.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function FrameCorners(_props: unknown) { return null; }

function Select({ value, onChange, children }: {
  value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <select value={value} onChange={onChange}
      className="w-full border border-[#131311]/20 bg-white px-3 py-2.5 text-sm text-[#131311] focus:outline-none focus:border-[#5A7A6A] transition-colors">
      {children}
    </select>
  );
}

// CTA banner — sage bg, dark button; reused on Products, Resources, How It Works
function CtaBanner({ title, sub, btnLabel, onClick }: {
  title: string; sub: string; btnLabel?: string; onClick: () => void;
}) {
  return (
    <div className="relative bg-[#5A7A6A] px-8 md:px-10 py-8 md:py-10 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden">
      <GhostMark size={200} opacity={0.08} color="#fff" pos="right-4 top-1/2 -translate-y-1/2" />
      <div className="relative">
        <h3 className="text-xl font-semibold text-white mb-1"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{title}</h3>
        <p className="text-white/80 text-sm">{sub}</p>
      </div>
      <div className="flex-shrink-0 relative">
        <Btn variant="primary" size="md" onClick={onClick}>{btnLabel ?? "Get a quote"} <ArrowRight className="w-4 h-4" /></Btn>
      </div>
    </div>
  );
}

// The signed-in account surfaces (one home + account + help + the record workspace).
const ACCOUNT_PAGES: Page[] = ["dashboard", "account", "help", "order"];
const isAccountPage = (p: Page) => ACCOUNT_PAGES.includes(p);

// ─── Navigation ───────────────────────────────────────────────────────────────
function Nav({ page, setPage, user, setUser }: {
  page: Page; setPage: (p: Page) => void;
  user: AuthUser | null; setUser: (u: AuthUser | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const go = (p: Page) => { setPage(p); setOpen(false); window.scrollTo(0, 0); };
  const topOffset = 0; // the account top-bar was removed; header sits at the top
  const brand = getSiteBrand(); // Sanity logo/name; null ⇒ built-in wordmark

  const links: [string, Page][] = [
    ["Home", "home"], ["Products", "products"], ["How it works", "how-it-works"],
    ["Resources", "resources"], ["Contact", "contact"],
  ];
  // Products stays active while drilling into a product detail page.
  const isActive = (p: Page) => page === p || (p === "products" && page === "product-detail");

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Header overlays the hero: fully transparent at the top of a hero page, then
  // solidifies into a dark bar once the user scrolls. Non-hero pages have no hero
  // to sit over, so they use the solid dark bar from the start.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const heroPage = page === "home" || page === "products" || page === "product-detail" || page === "quote" || page === "trade" || page === "how-it-works";
  const transparent = heroPage && !scrolled;

  return (
    <>
      <header className={`fixed left-0 right-0 z-50 ${transparent ? "bg-transparent border-b border-transparent" : "bg-[#0c0c0a] border-b border-white/10 shadow-sm shadow-black/20"}`}
        style={{ top: topOffset }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          {/* Left logo — always. It is the home anchor in both states; signing in
              must not move it, or the bar reads as a different site. */}
          {/* Brand lockup: the Sanity logo image, which INCLUDES the company name —
              so there is never name text beside it. Until a logo is uploaded, the
              mark stands alone; the name lives in the logo, nowhere else. */}
          <button onClick={() => go(user ? "dashboard" : "home")} className="flex items-center cursor-pointer flex-shrink-0" aria-label={brand?.businessName ? `${brand.businessName} — home` : "Home"}>
            {brand?.logoUrl
              ? <img src={brand.logoUrl} alt={brand.businessName ?? ""} className="h-7 w-auto max-w-[180px] object-contain" />
              : <WindowMark size={18} color="#f5f3ef" />}
          </button>
          {/* Site nav — shown in both states. Signed-in customers still need to
              reach Products/Resources/Contact; the account area has its own rail
              on top of this, it does not replace the site. */}
          <nav className="hidden xl:flex items-center gap-6 flex-1 justify-center">
            {links.map(([label, p]) => (
              <button key={p} onClick={() => go(p)}
                aria-current={isActive(p) ? "page" : undefined}
                className={`text-sm transition-colors relative ${isActive(p) ? "text-white font-semibold" : "text-white/70 hover:text-white"}`}>
                {label}
                {isActive(p) && <div className="absolute -bottom-0.5 left-0 right-0 h-px bg-[#5A7A6A]" />}
              </button>
            ))}
          </nav>
          <div className="hidden xl:flex items-center gap-3 flex-shrink-0 xl:ml-auto">
            {brand?.phone && (
              <a href={`tel:${brand.phone.replace(/[^0-9+]/g, "")}`}
                className="text-sm text-white/75 hover:text-white flex items-center gap-1.5 transition-colors">
                <Phone className="w-3.5 h-3.5" />{brand.phone}
              </a>
            )}
            {!user && (
              <button onClick={() => go("login")}
                className="text-sm text-white/75 hover:text-white cursor-pointer transition-colors ml-2">
                Sign in
              </button>
            )}
            {!user && <Btn variant="sage" size="sm" onClick={() => go("quote")}>Get a quote</Btn>}
            {user && (
              /* Account entry point. The logo on the left is already the home
                 anchor, so this is the only right-hand control needed. */
              <button onClick={() => go("dashboard")}
                aria-current={isAccountPage(page) ? "page" : undefined}
                className="text-sm text-white font-medium cursor-pointer flex items-center gap-1.5 transition-colors border border-[#8CA99B]/50 bg-[#5A7A6A]/30 hover:bg-[#5A7A6A]/45 px-3 py-[7px]">
                <WindowMark size={14} color="#8CA99B" />My Projects
              </button>
            )}
          </div>
          <button className="xl:hidden p-2 text-white hover:bg-white/10 transition-colors cursor-pointer" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Backdrop */}
      <div className={`fixed inset-0 z-[55] bg-black/80 backdrop-blur-[3px] transition-opacity duration-300 xl:hidden ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={() => setOpen(false)} />

      {/* Slide-out panel */}
      <div className="fixed top-0 right-0 h-full z-[56] bg-[#0c0c0a] text-white flex flex-col transition-transform duration-300 ease-out xl:hidden overflow-y-auto shadow-2xl shadow-black/60"
        style={{ width: "min(88vw, 440px)", transform: open ? "translateX(0)" : "translateX(100%)", top: topOffset }}>
        <div className="flex items-center justify-between px-5 h-16 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <WindowMark size={16} color="#8CA99B" />
            <span className="font-semibold text-sm text-white"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Menu</span>
          </div>
          <button onClick={() => setOpen(false)} className="p-2 -mr-2 text-white/65 hover:text-white hover:bg-white/10 transition-colors cursor-pointer" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-2">
          {/* Signed-in: ACCOUNT-FIRST drawer — mirrors the desktop right rail
              (identity → My Projects → Account · Help), site MENU follows. */}
          {user && (
            <>
              <div className="flex items-center gap-[11px] px-5 py-3 bg-[#5A7A6A]/20 border-b border-white/10">
                <span className="w-[34px] h-[34px] bg-[#5A7A6A] text-white grid place-items-center text-[13px] flex-shrink-0" style={{ fontFamily: "'DM Mono', monospace" }}>{initialsOf(user.company || user.name)}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{user.company || user.name}</div>
                  <div className="text-[11px] text-white/55 tracking-[0.04em]" style={{ fontFamily: "'DM Mono', monospace" }}>{user.type.toUpperCase()}{user.company ? " · TRADE" : ""}</div>
                </div>
              </div>
              <p className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/35">My account</p>
              {([
                ["My Projects", "dashboard"], ["Account", "account"], ["Help & contact", "help"],
              ] as [string, Page][]).map(([l, p]) => {
                const active = page === p || (p === "dashboard" && page === "order");
                return (
                  <button key={p} onClick={() => go(p)} aria-current={active ? "page" : undefined}
                    className={`w-full text-left px-5 py-3.5 text-sm flex items-center justify-between cursor-pointer border-l-2 ${active ? "text-white font-semibold bg-[#5A7A6A]/25 border-l-[#8CA99B]" : "text-white/70 hover:text-white hover:bg-white/[0.06] border-l-transparent"}`}>
                    {l}
                    {active && <span className="w-1.5 h-1.5 bg-[#8CA99B] rounded-full" aria-hidden="true" />}
                  </button>
                );
              })}
              <div className="border-t border-white/10 mt-2" />
            </>
          )}

          <p className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/35">Menu</p>
          {links.map(([l, p]) => (
            <button key={p} onClick={() => go(p)}
              aria-current={isActive(p) ? "page" : undefined}
              className={`w-full text-left px-5 py-3.5 border-b border-white/[0.07] text-[15px] transition-colors flex items-center justify-between cursor-pointer
                ${isActive(p) ? "text-white font-semibold bg-[#5A7A6A]/25 border-l-2 border-l-[#8CA99B]" : "text-white/75 hover:text-white hover:bg-white/[0.06] border-l-2 border-l-transparent"}`}>
              {l}
              {isActive(p) && <span className="w-1.5 h-1.5 bg-[#8CA99B] rounded-full" aria-hidden="true" />}
            </button>
          ))}
          <button onClick={() => go("track-order")}
            className="w-full text-left px-5 py-3.5 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] flex items-center gap-2 cursor-pointer">
            <Package className="w-4 h-4" />Track an order
          </button>

          {/* Primary CTA — hidden for signed-in users (they start quotes from the dashboard). */}
          {!user && (
            <div className="px-5 pt-4 pb-2">
              <Btn variant="sage" size="md" onClick={() => go("quote")} className="w-full justify-center">
                Get a quote <ArrowRight className="w-4 h-4" />
              </Btn>
            </div>
          )}

          <div className="border-t border-white/10 mt-2 pt-2">
            {user ? (
              <button onClick={() => { apiLogout().catch(() => {}); setUser(null); setOpen(false); go("home"); }}
                className="w-full text-left px-5 py-3.5 text-sm text-red-300 hover:text-red-200 hover:bg-red-500/10 flex items-center gap-2 cursor-pointer">
                <LogOut className="w-4 h-4" />Sign out
              </button>
            ) : (
              <button onClick={() => go("login")}
                className="w-full text-left px-5 py-3.5 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] flex items-center gap-2 cursor-pointer">
                <Lock className="w-4 h-4" />Sign in / Register
              </button>
            )}
          </div>
        </nav>

        <div className="px-5 py-4 border-t border-white/10 flex-shrink-0 bg-white/[0.025]">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/35 mb-2">Contact us</p>
          {brand?.phone && (
            <a href={`tel:${brand.phone.replace(/[^0-9+]/g, "")}`} className="flex items-center gap-2 text-sm text-white font-medium mb-1.5 hover:text-[#8CA99B] transition-colors">
              <Phone className="w-4 h-4 text-[#8CA99B]" />{brand.phone}
            </a>
          )}
          <span className="flex items-center gap-2 text-sm text-white/65">
            <Mail className="w-4 h-4 text-[#8CA99B]" />
            <ObfuscatedEmail address={brand?.email} className="hover:text-[#8CA99B] transition-colors" />
          </span>
        </div>
      </div>
    </>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer({ setPage }: { setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const brand = getSiteBrand(); // Sanity logo/tagline/copyright/ABN; null ⇒ fallbacks
  return (
    <footer className="relative bg-[#131311] text-white/55 pt-16 pb-10 overflow-hidden">
      <GhostMark size={360} opacity={0.06} color="#fff" pos="right-0 bottom-0" />
      <div className="max-w-6xl mx-auto px-6 relative">
        <div className="flex flex-col md:flex-row justify-between gap-10 mb-10">
          <div className="max-w-xs">
            {/* Same Sanity logo asset as the header — it INCLUDES the company
                name, so no name text beside it. Mark alone until a logo is set. */}
            {brand?.logoUrl
              ? <img src={brand.logoUrl} alt={brand.businessName ?? ""} className="h-7 w-auto max-w-[180px] object-contain mb-4" />
              : <div className="mb-4"><WindowMark size={18} color={SAGE} /></div>}
            {brand?.tagline && <p className="text-sm leading-relaxed mb-5">{brand.tagline}</p>}
            <div className="text-sm space-y-2">
              {brand?.phone && (
                <a href={`tel:${brand.phone.replace(/[^0-9+]/g, "")}`} className="flex items-center gap-2 hover:text-white transition-colors">
                  <Phone className="w-3.5 h-3.5 text-[#5A7A6A]" />{brand.phone}
                </a>
              )}
              <span className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#5A7A6A]" />
                <ObfuscatedEmail address={brand?.email} className="hover:text-white transition-colors" />
              </span>
              <span className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#5A7A6A]" />Melbourne &amp; Victoria
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 text-sm">
            {[
              { h: "Products", ls: [["Windows", "products"], ["Doors", "products"], ["Product detail", "product-detail"]] },
              { h: "Service",  ls: [["Get a quote", "quote"], ["Trade account", "trade"], ["How it works", "how-it-works"], ["Privacy Policy", "privacy"]] },
              { h: "Account", ls: [["Sign in", "login"], ["Track order", "track-order"], ["Resources", "resources"], ["Contact", "contact"]] },
            ].map(col => (
              <div key={col.h}>
                <div className="text-white text-xs font-semibold uppercase tracking-wider mb-3">{col.h}</div>
                <ul className="space-y-2">
                  {col.ls.map(([l, p]) => (
                    <li key={l}><button onClick={() => go(p as Page)} className="hover:text-white transition-colors text-left">{l}</button></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        {/* Sanity-driven: Copyright Text on the left, Legal Line (ABN) on the
            right; each falls back independently so a partial singleton never
            blanks a line. */}
        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between gap-2 text-xs text-white/25">
          <span>{brand?.copyrightText}</span>
          <span className="md:text-right">{brand?.legalLine}</span>
        </div>
      </div>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOME PAGE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Hero / process line-icon set — architectural, square, thin-stroke ─────────
// Lightened sage reads clearly on the dark hero glazing without breaking brand.
const SAGE_LT = "#8CA99B";

function IconEstimate({ size = 22, color = SAGE_LT }: { size?: number; color?: string }) {
  // window-pane grid + keypad dots → "enter dimensions / calculate"
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" stroke={color} strokeWidth="1.4" />
      <line x1="3" y1="9" x2="21" y2="9" stroke={color} strokeWidth="1.4" />
      <line x1="9" y1="9" x2="9" y2="21" stroke={color} strokeWidth="1.4" />
      <rect x="12.2" y="12.2" width="1.8" height="1.8" fill={color} />
      <rect x="16.4" y="12.2" width="1.8" height="1.8" fill={color} />
      <rect x="12.2" y="16.4" width="1.8" height="1.8" fill={color} />
      <rect x="16.4" y="16.4" width="1.8" height="1.8" fill={color} />
    </svg>
  );
}

function IconUpload({ size = 22, color = SAGE_LT }: { size?: number; color?: string }) {
  // schedule/document with an up-arrow
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3h8l4 4v14H6z" stroke={color} strokeWidth="1.4" strokeLinejoin="miter" />
      <path d="M14 3v4h4" stroke={color} strokeWidth="1.4" strokeLinejoin="miter" />
      <line x1="12" y1="19" x2="12" y2="11" stroke={color} strokeWidth="1.4" />
      <path d="M9.4 13.4 12 10.8l2.6 2.6" stroke={color} strokeWidth="1.4" strokeLinejoin="miter" fill="none" />
    </svg>
  );
}

function IconBrowse({ size = 22, color = SAGE_LT }: { size?: number; color?: string }) {
  // three-pane window with sill → "product systems"
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="16" stroke={color} strokeWidth="1.4" />
      <line x1="9" y1="3" x2="9" y2="19" stroke={color} strokeWidth="1.4" />
      <line x1="15" y1="3" x2="15" y2="19" stroke={color} strokeWidth="1.4" />
      <line x1="3" y1="11" x2="21" y2="11" stroke={color} strokeWidth="1.4" />
      <line x1="4.5" y1="21" x2="19.5" y2="21" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOME
//
// The page leads with the thing that actually differentiates the business: a
// tradie with a schedule on their plans gets every line matched and costed in
// about a minute, without retyping anything. Everything else on the page exists
// to make that claim credible or to hold its necessary caveat.
//
// Two truths have to survive together, and the page is built so a visitor cannot
// take one without the other:
//   • the estimate is INSTANT, and indicative;
//   • a person reviews it before it becomes a quote — about two business days.
// The caveat is therefore not 11px grey at the bottom. It is a full-strength sage
// panel physically joined to the speed claim (§ "The minute" below).
//
// Deliberately absent: any section whose subject is social proof. There are no
// published testimonials, ratings or project counts in Sanity, and a section that
// marks its own content as sample data still ships a page with nothing behind it.
// "What you can check" occupies that slot instead — real showrooms from the
// locations registry, the standards the products are actually made to, and the
// payment structure. All independently verifiable today.
// ═══════════════════════════════════════════════════════════════════════════════

// A real window-and-door schedule (Lot 312, sheet A6 — the same fixture the
// parser is tested against). It is run through the REAL parser and matcher in the
// browser on this page, so the panel below is not a drawing of the feature, it is
// the feature. Both modules are pure and import-safe; the catalogue is already
// hydrated by the time this renders (main.tsx awaits it before mounting).
const SAMPLE_SCHEDULE = `WINDOW SCHEDULE
W N° HEIGHT WIDTH HEAD HT. GLAZING D.GLAZE REQ. WINDOW TYPE COMMENTS
1 2100 2050 2400 CLEAR YES OFFSET AWNING
2 700 3500 1605 CLEAR YES FIXED
3 2100 2100 2300 CLEAR YES AWNING
4 2100 3200 2300 CLEAR YES AWNING 2x 600mm WIDE AWNINGS
5 2057 850 2300 CLEAR YES AWNING
7 854 1810 2100 CLEAR YES AWNING
9 1027 1810 2100 CLEAR YES AWNING
EXTERNAL DOOR SCHEDULE
D N° HEIGHT WIDTH GLAZING D. GLAZE REQ. MATERIAL DOOR TYPE COMMENTS
3 2300 3000 CLEAR YES ALUMINIUM STACKER SLIDING RIGHT TO LEFT`;

/** The two filled/hollow cells used across the site for the 0 / 50 / 100 arc.
 *  aria-hidden: the percentage is always written out beside it. */
function Meter({ paid }: { paid: "0%" | "50%" | "100%" }) {
  const cell = (on: boolean) => <span className={`block w-2.5 h-2.5 border ${on ? "bg-[#131311] border-[#131311]" : "border-black/25"}`} />;
  return <span className="flex gap-1" aria-hidden="true">{cell(paid !== "0%")}{cell(paid === "100%")}</span>;
}

function HomePage({ setPage, onUploadSchedule }: { setPage: (p: Page) => void; onUploadSchedule: () => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const MONO = { fontFamily: "'DM Mono', monospace" } as const;
  const DISPLAY = { fontFamily: "'Space Grotesk', sans-serif" } as const;

  // The sample, matched for real. Never throws the page away if the parser does:
  // an empty result renders the section without the result panel.
  const sample = useMemo(() => {
    try {
      const lines = matchSchedule(parseScheduleText([SAMPLE_SCHEDULE]).rows);
      return { lines, ready: lines.filter((l) => l.status === "Ready").length };
    } catch {
      return { lines: [] as ReturnType<typeof matchSchedule>, ready: 0 };
    }
  }, []);
  const flagged = sample.lines.length - sample.ready;

  // The schedule as printed, with its two section/column headers marked so the
  // panel reads as a document rather than a wall of digits.
  const scheduleLines = SAMPLE_SCHEDULE.split("\n").map((text) => ({
    text,
    head: /SCHEDULE$/.test(text) || /^[WD] N°/.test(text),
  }));

  const heroImg = imageUrl(getPage("home")?.heroImage, { w: 1920, h: 1080 });

  // Reveal the matched rows once, on first scroll into view. This is the entire
  // motion budget below the hero, spent on the one thing worth watching.
  const resultRef = useRef<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const el = resultRef.current;
    if (!el || revealed) return;
    if (typeof IntersectionObserver === "undefined"
      || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setRevealed(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setRevealed(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [revealed]);

  const systems: { title: string; desc: string; chips: string[]; more: boolean; cta: string; img: string; alt: string }[] = [
    {
      title: "Windows",
      desc: "Sliding, awning, casement and fixed systems for residential and trade projects.",
      chips: ["Sliding", "Awning", "Casement", "Fixed"], more: true,
      cta: "Explore windows", img: IMG.windows,
      alt: "Aluminium-framed windows set into a contemporary residential facade",
    },
    {
      title: "Doors",
      desc: "Sliding, bi-fold, hinged and pivot systems for larger openings and everyday access.",
      chips: ["Sliding", "Bi-fold", "Hinged", "Pivot"], more: false,
      cta: "Explore doors", img: IMG.doors,
      alt: "Large aluminium sliding doors opening onto an alfresco area",
    },
  ];

  // The THREE phases, worded exactly as /how-it-works words them. This used to be
  // a separate four-step telling with its own numbering, so a visitor clicking
  // through met a second, differently-worded account of one process. The owner's
  // design mock reintroduced the four-step version; it is deliberately not used.
  // Keep these headings, these percentages and that page in step.
  const steps: { n: string; title: string; paid: "0%" | "50%" | "100%"; body: string; Icon: typeof Upload }[] = [
    { n: "01", title: "Quote", paid: "0%", body: "Upload a schedule and it prices itself. A person then checks it by hand and issues a reviewed quote — about two business days, nothing charged.", Icon: Upload },
    { n: "02", title: "Order", paid: "50%", body: "Accept the quote and pay 50%. You sign off shop drawings before anything is manufactured — changes are free until you do.", Icon: Check },
    { n: "03", title: "Delivery", paid: "100%", body: "Every item is photographed before it ships. You pay the balance after you have seen the photos, then we deliver.", Icon: FileText },
  ];

  // The canonical numbers, identical to HERO_FACTS on /how-it-works. Coining a new
  // set here is how the two pages started disagreeing last time.
  const facts = ["$0 to get a quote", "~1 minute with a schedule", "50% first payment", "Supply only"];

  const suburbs = getActiveLocations().map((l) => `${l.suburb} ${l.stateCode}`);

  // The four objections that stop a click, taken from the owner's design mock.
  // Payment wording is the 50/50 schedule, not the mock's vaguer "a deposit".
  const questions: { q: string; a: string; link?: { label: string; page: Page } }[] = [
    {
      q: "Do you install?",
      a: "No — we're supply only. We manufacture your frames and deliver them; your own builder or installer fits them on site. That keeps pricing lean and lets you use the trades you trust.",
    },
    {
      q: "Where do you deliver?",
      a: suburbs.length
        ? `We manufacture and deliver from our showrooms in ${suburbs.join(", ")}. Tell us the site address and delivery is quoted with the frames.`
        : "Tell us the site address and delivery is quoted with the frames.",
      link: { label: "Find a showroom", page: "contact" },
    },
    {
      q: "When do I pay?",
      a: "Not until you accept. The estimate is free and needs no account. You pay 50% when you accept a reviewed quote, and the balance after you've seen photographs of your finished units.",
      link: { label: "The full payment schedule", page: "how-it-works" },
    },
    {
      q: "Trade or a one-off project?",
      a: "Both. Trade accounts get repeat pricing and a standing contact; a one-off renovation is quoted exactly the same way, with no minimum.",
      link: { label: "Ask about a trade account", page: "contact" },
    },
  ];

  return (
    <div>
      {/* ─── HERO ────────────────────────────────────────────────────────────
          Photograph, not a CSS drawing. The owner's mock composes a window out
          of four absolutely-positioned layers and twelve grid cells; on a 375px
          screen all of that sits under an 85%-black veil and renders as a dark
          rectangle. A manufacturer showing a drawing of a window instead of a
          photograph of one is also saying it has no photographs. The mock's
          sky/glow/veil survive below as the no-image fallback, which is the job
          they are genuinely good at.
          No content frame and no action cards: the gradient already earns the
          contrast, and three equal-weight boxes are the "too many entry points"
          problem in miniature. */}
      <section className="relative min-h-[100svh] flex items-center bg-[#0c0c0a] overflow-hidden">
        {heroImg
          ? <img src={heroImg} alt="Aluminium-framed sliding doors on a modern Melbourne home at dusk, warm interior light behind dark cladding"
              {...{ fetchpriority: "high" }} decoding="async"
              className="absolute inset-0 w-full h-full object-cover opacity-80 hero-zoom" />
          : <div className="absolute inset-0" aria-hidden="true"
              style={{ background: "linear-gradient(#12140f 0%, #1b1d16 44%, #26241c 100%)" }} />}
        {/* One warm radial, kept from the mock. It unifies whatever image is
            authored in Sanity into the site's dusk palette — which matters
            precisely because that image is not under our control. */}
        <div className="absolute inset-0" aria-hidden="true"
          style={{ background: "radial-gradient(60% 55% at 62% 50%, rgba(226,164,92,0.22) 0%, rgba(226,164,92,0) 70%)" }} />
        <div className="absolute inset-0" aria-hidden="true"
          style={{ background: "linear-gradient(to right, rgba(12,12,10,0.88) 0%, rgba(12,12,10,0.55) 14%, rgba(12,12,10,0.22) 30%, rgba(12,12,10,0.12) 62%, rgba(12,12,10,0.1) 100%)" }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0a]/45 via-transparent to-transparent" aria-hidden="true" />

        <div className="relative w-full max-w-6xl mx-auto px-6 pt-28 pb-14 md:py-24">
          <div className="w-full max-w-[46rem]">
            <div className="flex items-center gap-2 mb-5">
              <WindowMark size={11} color="rgba(255,255,255,0.55)" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60" style={MONO}>
                Supply-only aluminium · Melbourne &amp; Victoria
              </span>
            </div>

            <h1 className="font-semibold text-white leading-[1.02] tracking-tight mb-5"
              style={{ ...DISPLAY, fontSize: "clamp(2.15rem, 6vw, 4.25rem)" }}>
              Your windows and doors,{" "}
              {/* Not italic — the mock's device: same weight, sage. The only sage
                  above the fold, and it lands on the claim that matters. */}
              <span style={{ color: SAGE_LT }}>priced in about a minute.</span>
            </h1>

            <p className="text-white/80 leading-relaxed mb-8 max-w-[52ch]"
              style={{ fontSize: "clamp(1rem, 1.4vw, 1.125rem)" }}>
              Upload the window and door schedule from your plans and every line comes back matched and costed.
              A person checks it before you get a quote — and nothing is charged until you accept one.
            </p>

            {/* One primary, one alternative, one link. The mock makes "Build an
                estimate" the solid button; that inverts the point — the upload
                path is the one with the differentiated claim, and building line
                by line is the fallback for people without a schedule.
                The sublines are load-bearing: "Upload a schedule" silently
                excludes anyone who does not have one. */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-5">
              <div className="flex flex-col gap-1.5">
                <Btn variant="white" size="lg" onClick={onUploadSchedule}
                  className="!bg-white !text-[#131311] !border-white hover:!bg-white/90 justify-center">
                  <Upload className="w-[18px] h-[18px]" aria-hidden="true" /> Upload a schedule
                </Btn>
                <small className="text-white/50 text-[12px]" style={MONO}>PDF or spreadsheet · no account</small>
              </div>
              <div className="flex flex-col gap-1.5">
                <Btn variant="white" size="lg" onClick={() => go("quote")} className="justify-center">
                  Build it line by line
                </Btn>
                <small className="text-white/50 text-[12px]" style={MONO}>No schedule? Enter sizes yourself</small>
              </div>
            </div>

            <button onClick={() => go("products")}
              className="mt-6 inline-flex items-center gap-2 text-white/70 hover:text-white text-sm underline underline-offset-4 decoration-white/30 hover:decoration-white transition-colors cursor-pointer">
              See the window and door systems <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <div className="mt-8 pt-5 border-t border-white/12 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-white/55" style={MONO}>
              {facts.map((f, i) => (
                <span key={f} className="flex items-center gap-3">
                  {i > 0 && <span className="w-px h-3 bg-white/20" aria-hidden="true" />}
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── THE MINUTE ──────────────────────────────────────────────────────
          The evidence for the headline, and the section the mock does not have —
          which is why the mock's page reads as a list of assurances rather than a
          demonstration. The rows below are produced by the SAME parser and
          matcher the product runs; nothing here is drawn by hand.
          No dollar figures anywhere: rate cards are commercial D1 data, so a
          price on this page would be either invented or published margin. */}
      <section className="relative bg-white border-t border-black/8 py-14 md:py-[68px]" style={GRID_BG}>
        <div className="max-w-6xl mx-auto px-6 relative">
          <SLabel>The minute</SLabel>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
            <div className="max-w-[54ch]">
              <h2 className="font-semibold text-[#131311] leading-tight mb-2.5"
                style={{ ...DISPLAY, fontSize: "clamp(1.9rem, 3.4vw, 2.5rem)" }}>
                Your schedule, read line by line.
              </h2>
              <p className="text-[#5c5a56] text-[15px] md:text-base leading-relaxed">
                Item numbers, sizes, glazing, door material — the schedule your draftsperson already drew.
                Upload the PDF and every row comes back matched to a system. Nothing retyped, nothing re-measured.
              </p>
            </div>
            {/* The page's missing large numeral. "Under a minute" is the wording
                the quote page already uses; do not out-claim the product with a
                precise figure nobody measured. */}
            <div className="lg:text-right lg:flex-shrink-0">
              <div className="font-semibold text-[#3f5a4c] leading-none" style={{ ...MONO, fontSize: "clamp(1.7rem, 5vw, 2.75rem)" }}>
                &lt; 1 min
              </div>
              <div className="text-[#8a8782] text-[13px] mt-1.5">from upload to a matched list</div>
            </div>
          </div>

          {/* Hairline-collapsed pair: the source document, then what came back. */}
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* The source document — the schedule text itself, not a photograph
                of one. It is the literal input to the parser running beside it,
                which is the strongest possible version of this panel and needs no
                stock imagery standing in for the real thing. */}
            <div className="relative border border-black/10 bg-[#131311] flex flex-col min-h-[300px]">
              <div className="px-4 py-2.5 border-b border-white/12 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.14em] text-white/50" style={MONO}>From your plans</span>
                <span className="text-[11px] text-white/35" style={MONO}>sheet A6</span>
              </div>
              <div className="flex-1 overflow-x-auto px-4 py-3.5">
                <pre className="text-[11px] md:text-[11.5px] leading-[1.75] text-white/70 whitespace-pre" style={MONO}>
{scheduleLines.map((line, i) => (
  <span key={i} className={line.head ? "text-[#8CA99B]" : undefined}>{line.text + "\n"}</span>
))}
                </pre>
              </div>
              <div className="px-4 py-3 border-t border-white/12 text-[12px] text-white/45" style={MONO}>
                item n° · height · width · glazing · type — the columns we read
              </div>
            </div>

            <div ref={resultRef} className="border border-black/10 lg:-ml-px -mt-px lg:mt-0 bg-white flex flex-col">
              <div className="px-4 py-2.5 border-b border-black/10 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.14em] text-[#8a8782]" style={MONO}>What came back</span>
                <span className="text-[11px] text-[#8a8782]" style={MONO}>{sample.lines.length} lines</span>
              </div>
              <div className="divide-y divide-black/8 flex-1">
                {sample.lines.map((l, i) => {
                  const product = getProductBySlug(l.productSlug);
                  return (
                    <div key={l.code}
                      className="px-4 py-2.5 flex items-baseline gap-3 transition-all duration-200"
                      style={{
                        opacity: revealed ? 1 : 0,
                        transform: revealed ? "translateY(0)" : "translateY(6px)",
                        transitionDelay: `${i * 55}ms`,
                      }}>
                      <span className="text-[#5A7A6A] text-[12px] w-9 flex-shrink-0" style={MONO}>{l.code}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[#131311] text-[14px] leading-tight truncate" style={DISPLAY}>
                          {product?.name ?? l.rawType ?? "Needs a product"}
                        </span>
                        <span className="block text-[#8a8782] text-[12px]" style={MONO}>
                          {l.width} × {l.height}
                        </span>
                      </span>
                      {/* Never colour alone: the word carries the state. */}
                      <span className={`text-[11px] flex-shrink-0 ${l.status === "Ready" ? "text-[#5A7A6A]" : "text-[#8a6a2a]"}`} style={MONO}>
                        {l.status === "Ready" ? "✓ ready" : "· to confirm"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-3 border-t border-black/10 text-[13px] text-[#3d3b38]"
                style={{ background: "rgba(90,122,106,0.07)" }}>
                {/* Leads with what the machine did, then what it hands over. The
                    flags are the point, not an apology: it says which lines need a
                    decision instead of guessing and quoting the wrong frame. */}
                {sample.lines.length} of {sample.lines.length} lines read and matched
                {flagged > 0 && <> · {flagged} flagged for a technician to confirm</>}
              </div>
            </div>
          </div>

          {/* The caveat, at full strength and physically attached to the claim —
              one of only two sage fills on the page. A visitor cannot take the
              minute without taking the two days. Same numbers, same wording as
              /how-it-works, so the two pages agree by construction. */}
          <div className="border border-black/10 -mt-px px-5 py-5 md:px-7 md:py-6 flex flex-col md:flex-row md:items-center gap-5 md:gap-8"
            style={{ background: "#5A7A6A" }}>
            <div className="flex-1">
              <h3 className="text-white font-semibold text-[17px] md:text-[19px] mb-1.5" style={DISPLAY}>
                Then a person checks it.
              </h3>
              <p className="text-white/85 text-[15px] leading-relaxed max-w-[62ch]">
                An instant estimate is indicative. Before it becomes a quote, a technician confirms
                specifications, sizes and buildability — about two business days. Nothing is charged either way.
              </p>
            </div>
            <div className="flex items-center gap-3 md:gap-4 flex-shrink-0 text-white/90 text-[13px]" style={MONO}>
              <span className="flex items-center gap-2">
                <span className="flex gap-1" aria-hidden="true">
                  <span className="block w-2.5 h-2.5 border border-white/50" />
                  <span className="block w-2.5 h-2.5 border border-white/50" />
                </span>
                0%
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-white/60" aria-hidden="true" />
              <span className="flex items-center gap-2">
                <span className="flex gap-1" aria-hidden="true">
                  <span className="block w-2.5 h-2.5 border border-white bg-white" />
                  <span className="block w-2.5 h-2.5 border border-white/50" />
                </span>
                50%
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SYSTEMS ─────────────────────────────────────────────────────────
          Real photography, kept as-is. The mock renders its system tiles as CSS
          grids of glowing rectangles; a window manufacturer showing a drawing
          instead of a photograph tells a visitor something it does not want said. */}
      <section className="relative bg-[#FAFAF9] py-14 md:py-[68px] overflow-hidden">
        <GhostMark size={300} opacity={0.04} pos="right-0 bottom-0" />
        <div className="max-w-6xl mx-auto px-6 relative">
          <SLabel>Systems</SLabel>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-8">
            <h2 className="font-semibold text-[#131311] leading-tight"
              style={{ ...DISPLAY, fontSize: "clamp(1.9rem, 3.4vw, 2.5rem)" }}>
              Windows and doors, made to your sizes.
            </h2>
            <p className="text-[#5c5a56] text-base max-w-sm md:text-right">
              Window and door systems made to spec, reviewed before production.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {systems.map(s => (
              <button key={s.title} onClick={() => go("products")}
                aria-label={`${s.cta} — ${s.desc}`}
                className="group relative overflow-hidden bg-[#131311] text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A] focus-visible:ring-offset-2">
                <div className="relative aspect-[4/3] md:aspect-[16/11] overflow-hidden">
                  <img src={s.img} alt={s.alt} loading="lazy" decoding="async"
                    className="absolute inset-0 w-full h-full object-cover opacity-55 group-hover:opacity-65 group-hover:scale-[1.03] transition-all duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#131311] via-[#131311]/45 to-transparent" />
                  <div className="absolute inset-3 border border-white/12 group-hover:border-white/25 transition-colors pointer-events-none" />
                  <div className="absolute inset-0 p-6 md:p-7 flex flex-col justify-end">
                    <h3 className="text-white font-semibold mb-1.5"
                      style={{ ...DISPLAY, fontSize: "clamp(1.5rem, 2.6vw, 2rem)" }}>{s.title}</h3>
                    <p className="text-white/75 text-[15px] leading-snug max-w-md mb-4">{s.desc}</p>
                    <div className="flex flex-wrap gap-1.5 mb-5">
                      {s.chips.map(c => (
                        <span key={c} className="border border-white/25 text-white/80 text-[12px] tracking-wide px-2.5 py-1">{c}</span>
                      ))}
                      {s.more && <span className="border border-white/10 text-white/45 text-[12px] tracking-wide px-2.5 py-1">More →</span>}
                    </div>
                    <span className="inline-flex items-center gap-2.5 text-white text-sm font-medium">
                      {s.cta}
                      <span className="w-6 h-6 border border-white/30 group-hover:border-[#5A7A6A] group-hover:bg-[#5A7A6A] flex items-center justify-center transition-all">
                        <ArrowRight className="w-3.5 h-3.5 text-white" />
                      </span>
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PROCESS ─────────────────────────────────────────────────────────
          THREE phases, named and numbered exactly as /how-it-works names them.
          The percentages turn three identical-looking cards into a visible money
          arc, and every one of them is a fact rather than decoration. */}
      <section className="relative bg-white py-14 md:py-[68px] border-t border-black/8 overflow-hidden" style={GRID_BG}>
        <div className="max-w-6xl mx-auto px-6 relative">
          <SLabel>Process</SLabel>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-8">
            <h2 className="font-semibold text-[#131311] leading-tight"
              style={{ ...DISPLAY, fontSize: "clamp(1.9rem, 3.4vw, 2.5rem)" }}>
              Quote, order, delivery.
            </h2>
            <button onClick={() => go("how-it-works")}
              className="text-sm text-[#5A7A6A] hover:text-[#3f5a4c] inline-flex items-center gap-1.5 md:flex-shrink-0 cursor-pointer">
              See every step <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0">
            {steps.map((s, i) => (
              <div key={s.n}
                className="relative border border-black/10 bg-white p-6 flex flex-col sm:[&:nth-child(n+2)]:-mt-px lg:[&:nth-child(n+2)]:mt-0 lg:[&:nth-child(n+2)]:-ml-px">
                <div className="flex items-start justify-between mb-4">
                  <span className="w-8 h-8 border border-[#5A7A6A]/40 flex items-center justify-center text-[#5A7A6A] text-xs" style={MONO}>{s.n}</span>
                  <span className="flex items-center gap-2">
                    <Meter paid={s.paid} />
                    <span className="font-semibold text-[#3f5a4c] leading-none" style={{ ...MONO, fontSize: "clamp(1.5rem, 4vw, 2.1rem)" }}>{s.paid}</span>
                  </span>
                </div>
                <h3 className="font-semibold text-[#131311] text-base leading-tight mb-1.5" style={DISPLAY}>{s.title}</h3>
                <p className="text-[#5c5a56] text-[15px] leading-relaxed">{s.body}</p>
                {i < steps.length - 1 && (
                  <ChevronRight className="hidden lg:block absolute -right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A7A6A]/60 bg-white z-10" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 border border-black/10 bg-[#FAFAF9] px-5 py-4 flex items-start gap-3">
            <Truck className="w-4 h-4 text-[#5A7A6A] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[15px] text-[#131311]">
              Supply only — installation is arranged by your builder or installer.
            </p>
          </div>
        </div>
      </section>

      {/* ─── WHAT YOU CAN CHECK ──────────────────────────────────────────────
          Credibility built only from things that are true today and that a
          visitor can independently verify. This replaces the mock's social-proof
          band, whose content was invented and labelled as sample data — marking a
          fake as fake does not make it shippable, and "500+ projects quoted" is an
          unverified claim about a business, not a placeholder.
          The showroom column renders only if the registry has entries. */}
      <section className="relative bg-[#0c0c0a] py-14 md:py-[68px] overflow-hidden">
        <img src={IMG.doors} alt="" aria-hidden="true" loading="lazy" decoding="async"
          className="absolute inset-0 w-full h-full object-cover opacity-25" />
        <div className="absolute inset-0" aria-hidden="true"
          style={{ background: "linear-gradient(to right, rgba(12,12,10,0.94) 0%, rgba(12,12,10,0.78) 45%, rgba(12,12,10,0.6) 100%)" }} />
        <GhostMark size={280} opacity={0.025} color="#fff" pos="right-0 bottom-0" />
        <div className="max-w-6xl mx-auto px-6 relative">
          <SLabel light>What you can check</SLabel>
          <h2 className="font-semibold text-white leading-tight mb-8 max-w-[24ch]"
            style={{ ...DISPLAY, fontSize: "clamp(1.9rem, 3.4vw, 2.5rem)" }}>
            Nothing here is a claim you have to take on trust.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/12">
            {suburbs.length > 0 && (
              <div className="py-5 md:py-0 md:pr-7">
                <h3 className="text-white font-semibold text-[17px] mb-2" style={DISPLAY}>Showrooms</h3>
                <p className="text-white/60 text-[13px] mb-2.5" style={MONO}>{suburbs.join(" · ")}</p>
                <p className="text-white/75 text-[15px] leading-relaxed mb-3">
                  See and handle the frames before you order.
                </p>
                <button onClick={() => go("contact")} className="text-[#8CA99B] hover:text-white text-sm inline-flex items-center gap-1.5 cursor-pointer">
                  Book a time <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
            <div className="py-5 md:py-0 md:px-7">
              <h3 className="text-white font-semibold text-[17px] mb-2" style={DISPLAY}>Standards</h3>
              <p className="text-white/60 text-[13px] mb-2.5" style={MONO}>AS 2047 · AS 1288</p>
              <p className="text-white/75 text-[15px] leading-relaxed mb-3">
                Test reports, warranty terms and compliance certificates are published, not promised.
              </p>
              <button onClick={() => go("resources")} className="text-[#8CA99B] hover:text-white text-sm inline-flex items-center gap-1.5 cursor-pointer">
                Compliance documents <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="py-5 md:py-0 md:pl-7">
              <h3 className="text-white font-semibold text-[17px] mb-2" style={DISPLAY}>Money</h3>
              <p className="font-semibold text-white leading-none mb-2.5" style={{ ...MONO, fontSize: "clamp(1.5rem, 4vw, 2.1rem)" }}>50 / 50</p>
              <p className="text-white/75 text-[15px] leading-relaxed mb-3">
                $0 to quote. 50% on acceptance, and the balance only after you have seen photographs of your finished units.
              </p>
              <button onClick={() => go("how-it-works")} className="text-[#8CA99B] hover:text-white text-sm inline-flex items-center gap-1.5 cursor-pointer">
                The full payment schedule <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── GOOD TO KNOW ────────────────────────────────────────────────────
          The four objections that stop a click, all four answers visible. An
          accordion would hide content on a page already criticised for being
          blank. The 2×2 hairline-collapsed grid is the site's card track, not a
          table: prose blocks with headings, no header row, no column runs. */}
      <section className="relative bg-[#FAFAF9] py-14 md:py-[68px] border-t border-black/8" style={GRID_BG}>
        <div className="max-w-6xl mx-auto px-6 relative">
          <SLabel>Good to know</SLabel>
          <h2 className="font-semibold text-[#131311] leading-tight mb-8"
            style={{ ...DISPLAY, fontSize: "clamp(1.9rem, 3.4vw, 2.5rem)" }}>
            The questions people ask before they start.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {questions.map((q) => (
              <div key={q.q}
                className="border border-black/10 bg-white p-6 flex flex-col md:[&:nth-child(n+3)]:-mt-px md:[&:nth-child(even)]:-ml-px [&:nth-child(n+2)]:-mt-px md:[&:nth-child(2)]:mt-0">
                <h3 className="font-semibold text-[#131311] text-[17px] leading-tight mb-2" style={DISPLAY}>{q.q}</h3>
                <p className="text-[#5c5a56] text-[15px] leading-relaxed flex-1">{q.a}</p>
                {q.link && (
                  <button onClick={() => go(q.link!.page)}
                    className="mt-3 text-sm text-[#5A7A6A] hover:text-[#3f5a4c] inline-flex items-center gap-1.5 self-start cursor-pointer">
                    {q.link.label} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ───────────────────────────────────────────────────────
          The owner's own headline, kept verbatim and moved here — commitment
          framing belongs at the point of commitment, and the hero leads with
          speed instead. Second and last sage fill on the page. */}
      <section className="bg-white py-14 md:py-16 border-t border-black/8">
        <div className="max-w-6xl mx-auto px-6">
          <div className="relative bg-[#5A7A6A] overflow-hidden">
            <GhostMark size={220} opacity={0.08} color="#fff" pos="right-6 top-1/2 -translate-y-1/2" />
            <div className="relative px-6 sm:px-10 py-9 md:py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="flex items-start gap-4">
                <span className="hidden sm:flex w-11 h-11 border border-white/30 items-center justify-center flex-shrink-0">
                  <WindowMark size={20} color="#ffffff" />
                </span>
                <div>
                  <h2 className="text-white font-semibold mb-1.5"
                    style={{ ...DISPLAY, fontSize: "clamp(1.4rem, 2.4vw, 1.9rem)" }}>
                    Your windows and doors, priced before you commit.
                  </h2>
                  <p className="text-white/85 text-base mb-2">
                    Upload a schedule, or build it line by line. Free either way.
                  </p>
                  <p className="text-white/60 text-[12px]" style={MONO}>
                    $0 to get a quote · no account · a reviewed quote in about two business days
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 md:flex-shrink-0">
                <Btn variant="primary" size="lg" onClick={onUploadSchedule}>
                  <Upload className="w-4 h-4" aria-hidden="true" /> Upload a schedule
                </Btn>
                <Btn variant="white" size="lg" onClick={() => go("quote")}>
                  Build it line by line
                </Btn>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCES
// ═══════════════════════════════════════════════════════════════════════════════
function ResourcesPage({ setPage }: { setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [filter, setFilter] = useState("All");
  const resources = [
    { t: "Measuring guide",         s: "How to measure rough opening sizes. Frame size vs. opening size explained.", cat: "Windows" },
    { t: "Frame allowances guide",  s: "Frame tolerances and clearances for each product type.",                    cat: "Windows" },
    { t: "Sliding vs. bifold doors",s: "Performance, opening width, cost and access compared.",                    cat: "Doors" },
    { t: "Glass options explained",  s: "Single, double glaze, LowE, SHGC and U-value — what each means.",         cat: "Glass" },
    { t: "Double glazing & energy", s: "WERS ratings, NCC requirements and thermal performance data.",              cat: "Glass" },
    { t: "AS 2047 & AS 1288 overview",s:"What these standards mean for your windows and doors.",                   cat: "Compliance" },
    { t: "Warranty & compliance docs",s:"Test reports, warranty terms and compliance certificates.",                cat: "Compliance" },
    { t: "Site delivery checklist", s: "Preparing your site for window and door delivery.",                        cat: "Delivery" },
    { t: "Builder quote checklist", s: "What to include when submitting a window schedule.",                       cat: "Builder" },
    { t: "Care and maintenance",    s: "Maintaining aluminium frames, seals, tracks and glass.",                   cat: "Maintenance" },
  ];
  const cats = ["All","Windows","Doors","Glass","Compliance","Delivery","Builder","Maintenance"];
  const filtered = filter === "All" ? resources : resources.filter(r => r.cat === filter);
  return (
    <div className="bg-[#FAFAF9] min-h-screen">
      <div className="relative overflow-hidden">
        <GhostMark size={300} opacity={0.07} pos="right-0 top-0" />
        <div className="max-w-5xl mx-auto px-6 pt-28 pb-8 relative">
          <SLabel>Resources</SLabel>
          <h1 className="text-4xl font-semibold text-[#131311] mb-4"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Guides &amp; documentation</h1>
          <p className="text-[#5c5a56] mb-8">Technical guides, delivery checklists and compliance references.</p>
          <div className="flex flex-wrap gap-2">
            {cats.map(c => (
              <button key={c} onClick={() => setFilter(c)}
                className={`px-4 py-2 text-xs font-medium border transition-all cursor-pointer ${filter === c ? "border-[#5A7A6A] bg-[#5A7A6A] text-white" : "border-black/15 text-[#5c5a56] bg-white hover:border-[#5A7A6A] hover:text-[#5A7A6A]"}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-6 py-10 pb-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10">
          {filtered.map(r => (
            <div key={r.t} className="group relative bg-white border border-black/8 hover:border-[#5A7A6A] p-5 transition-all cursor-pointer overflow-hidden">
              <FrameCorners size={10} color={SAGE} />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#5A7A6A]">{r.cat}</span>
              <h3 className="font-semibold text-[#131311] mt-2 mb-1 group-hover:text-[#5A7A6A] transition-colors"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{r.t}</h3>
              <p className="text-xs text-[#5c5a56] leading-relaxed mb-3">{r.s}</p>
              <p className="text-[10px] text-[#5A7A6A] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <Download className="w-3 h-3" />Download (sample placeholder)
              </p>
            </div>
          ))}
        </div>
        <CtaBanner
          title="Ready to get a quote?"
          sub="Use these guides to prepare your dimensions, then start a quote online."
          onClick={() => go("quote")}
        />
        <p className="text-xs text-[#5c5a56] mt-5 mb-10 bg-[#F2F0EC] border border-black/8 p-4">
          Documents are sample placeholders. Final technical documents, test reports and warranty terms are provided with reviewed quotes.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
function LoginPage({ setPage, setUser }: { setPage: (p: Page) => void; setUser: (u: AuthUser) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const sendCode = async () => {
    if (!validEmail || busy) return;
    setBusy(true); setError("");
    try {
      const r = await requestCode(email.trim());
      setDevCode(r.devCode);       // shown only in dev (no email provider yet)
      setStep("code");
    } catch { setError("Couldn't send a code. Try again."); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code.trim()) || busy) return;
    setBusy(true); setError("");
    try {
      const r = await verifyCode(email.trim(), code.trim());
      if (r.user) { setUser(toAuthUser(r.user)); go("dashboard"); }
    } catch { setError("That code didn't match. Check it or resend."); }
    finally { setBusy(false); }
  };

  return (
    <div className="relative min-h-screen bg-[#FAFAF9] flex items-center justify-center pt-16 pb-24 overflow-hidden">
      <GhostMark size={320} opacity={0.05} pos="right-0 bottom-0" />
      <div className="w-full max-w-sm mx-auto px-6 relative">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4"><WindowMark size={32} color={SAGE} /></div>
          <h1 className="text-2xl font-semibold text-[#131311]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {step === "email" ? "Sign in or register" : "Enter your code"}
          </h1>
          <p className="text-sm text-[#5c5a56] mt-1">
            {step === "email"
              ? "We'll email you a one-time code — no password needed"
              : `We sent a 6-digit code to ${email.trim()}`}
          </p>
        </div>
        <div className="group relative bg-white border border-black/8 p-6 space-y-4 overflow-hidden">
          <FrameCorners size={10} color={SAGE} show="always" />
          {step === "email" ? (
            <>
              <div>
                <FieldLabel>Email</FieldLabel>
                <Input type="email" value={email} autoFocus
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendCode()}
                  placeholder="your@email.com" />
              </div>
              <Btn variant="sage" size="md" onClick={sendCode}
                className={`w-full justify-center ${!validEmail || busy ? "opacity-50 pointer-events-none" : ""}`}>
                {busy ? "Sending…" : "Send code"}
              </Btn>
            </>
          ) : (
            <>
              <div>
                <FieldLabel>6-digit code</FieldLabel>
                <Input value={code} autoFocus inputMode="numeric" maxLength={6}
                  onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={e => e.key === "Enter" && verify()}
                  placeholder="••••••" />
              </div>
              {devCode && (
                <p className="text-xs text-[#5A7A6A] bg-[#5A7A6A]/8 border border-[#5A7A6A]/20 px-2 py-1.5">
                  Dev mode — your code is <span className="font-mono font-semibold">{devCode}</span>
                </p>
              )}
              <Btn variant="sage" size="md" onClick={verify}
                className={`w-full justify-center ${code.length !== 6 || busy ? "opacity-50 pointer-events-none" : ""}`}>
                {busy ? "Verifying…" : "Verify & continue"}
              </Btn>
              <button onClick={() => { setStep("email"); setCode(""); setError(""); }}
                className="text-sm text-[#5c5a56] hover:text-[#131311] cursor-pointer">
                ← Use a different email
              </button>
            </>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="mt-4 text-center">
          <div className="border-t border-black/8 pt-4">
            <button onClick={() => go("track-order")}
              className="text-sm text-[#5c5a56] hover:text-[#131311] cursor-pointer flex items-center gap-1.5 mx-auto">
              <Search className="w-4 h-4" />Track an order without signing in
            </button>
          </div>
        </div>
        <div className="mt-6 bg-[#F2F0EC] border border-black/8 p-4 text-xs text-[#5c5a56]">
          Your quote is saved as you go. Sign in to keep it against your account across devices — guest quotes don't require an account.
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════════════════════════════════════
function ProfilePage({ user, setPage, setUser, authLoading, embedded }: { user: AuthUser | null; setPage: (p: Page) => void; setUser: (u: AuthUser) => void; authLoading?: boolean; embedded?: boolean }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [company, setCompany] = useState(user?.company ?? "");
  const [abn, setAbn] = useState(user?.abn ?? "");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    if (user) { setName(user.name); setPhone(user.phone); setCompany(user.company); setAbn(user.abn); }
  }, [user]);
  if (!user) { if (!authLoading) go("login"); return null; }

  // Persist personal + business details to the server (email is the login identity —
  // changing it needs re-verification, out of scope).
  const saveProfile = async () => {
    if (saving) return;
    setSaving(true); setSaveError("");
    try {
      const r = await updateProfile({ name: name.trim(), phone: phone.trim(), company: company.trim(), abn: abn.trim() });
      setUser({ ...user, name: r.user.name || user.name, phone: r.user.phone || "", company: r.user.company || "", abn: r.user.abn || "" });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError("Couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      {!embedded && (
        <header className="mb-8">
          <SLabel>Customer account</SLabel>
          <h1 className="text-3xl md:text-4xl font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Profile settings</h1>
        </header>
      )}
      <div className="space-y-4">
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <div className="bg-white border border-black/8 p-5">
            <h3 className="font-semibold text-sm text-[#131311] mb-4">Personal details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><FieldLabel>Full name</FieldLabel><Input value={name} onChange={e => setName(e.target.value)} /></div>
              <div><FieldLabel>Phone number</FieldLabel><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
            </div>
          </div>
          <div className="bg-white border border-black/8 p-5">
            <h3 className="font-semibold text-sm text-[#131311] mb-1">Business details</h3>
            <p className="text-xs text-[#5c5a56] mb-4">Shown on your quotes and orders.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><FieldLabel>Business name</FieldLabel><Input value={company} onChange={e => setCompany(e.target.value)} placeholder="ABC Constructions" /></div>
              <div><FieldLabel>ABN</FieldLabel><Input value={abn} onChange={e => setAbn(e.target.value)} placeholder="00 000 000 000" inputMode="numeric" /></div>
            </div>
          </div>
        </div>
        {saveError && <p role="alert" className="text-sm text-red-700 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{saveError}</p>}
        <div>
          <Btn variant="sage" size="md" disabled={saving} onClick={saveProfile}>
            {saved ? <><Check className="w-4 h-4" />Saved</> : saving ? "Saving…" : "Save changes"}
          </Btn>
        </div>
        <AccountIdentity user={user} setPage={setPage} />
      </div>
    </>
  );
}

// Read-only account identity. The sign-in email is the unique login ID — customers
// can never edit it (an accidental change is a lockout); only internal staff can,
// from the ops console.
const fmtLongDate = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s.replace(" ", "T") + "Z");
  return isNaN(+d) ? "—" : d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
};
function AccountIdentity({ user, setPage }: { user: AuthUser; setPage: (p: Page) => void }) {
  return (
    <section className="pt-2">
      <h2 className="text-sm font-semibold text-[#131311] uppercase tracking-wider mb-3">Sign-in</h2>
      <dl className="bg-white border border-black/8 px-5 py-1">
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-4 py-2.5 border-b border-black/6">
          <dt className="text-[10px] font-semibold text-[#3a3835] uppercase tracking-widest sm:w-40 sm:flex-shrink-0 flex items-center gap-1.5"><Lock className="w-3 h-3 text-[#5A7A6A]" />Sign-in email</dt>
          <dd className="text-sm text-[#131311]">{user.email}</dd>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-4 py-2.5">
          <dt className="text-[10px] font-semibold text-[#3a3835] uppercase tracking-widest sm:w-40 sm:flex-shrink-0">Registered</dt>
          <dd className="text-sm text-[#131311]">{fmtLongDate(user.createdAt)}</dd>
        </div>
      </dl>
      <p className="text-[11px] text-[#5c5a56] mt-2">
        Your email is your sign-in ID and can't be changed here — <button onClick={() => { setPage("help"); window.scrollTo(0, 0); }} className="text-[#5A7A6A] underline cursor-pointer">contact us</button> and we'll update it for you.
      </p>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════
function AccountSettingsPage({ user, setPage, setUser, authLoading, embedded }: { user: AuthUser | null; setPage: (p: Page) => void; setUser: (u: AuthUser) => void; authLoading?: boolean; embedded?: boolean }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [gstSaving, setGstSaving] = useState<GstMode | null>(null);
  if (!user) { if (!authLoading) go("login"); return null; }

  const setGst = async (mode: GstMode) => {
    if (mode === user.priceGstMode || gstSaving) return;
    setGstSaving(mode);
    // Optimistic: the estimator preference should feel instant. Reconcile from
    // the server's echo, and revert on failure.
    const prev = user.priceGstMode;
    setUser({ ...user, priceGstMode: mode });
    try {
      const r = await updateProfile({ priceGstMode: mode });
      setUser({ ...user, priceGstMode: r.user.priceGstMode === "ex" ? "ex" : "inc" });
    } catch {
      setUser({ ...user, priceGstMode: prev });
    } finally { setGstSaving(null); }
  };

  const gstOptions: { mode: GstMode; label: string; note: string }[] = [
    { mode: "inc", label: "Including GST", note: "Prices shown with 10% GST added" },
    { mode: "ex",  label: "Excluding GST", note: "Prices shown before GST" },
  ];

  return (
    <>
      {!embedded && (
        <header className="mb-8">
          <SLabel>Customer account</SLabel>
          <h1 className="text-3xl md:text-4xl font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Account settings</h1>
        </header>
      )}
      <div className="space-y-4">
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <div className="bg-white border border-black/8 p-5">
            <div className="flex items-center gap-2 mb-2"><Settings className="w-4 h-4 text-[#5A7A6A]" /><h3 className="font-semibold text-sm text-[#131311]">Price display</h3></div>
            <p className="text-sm text-[#5c5a56] leading-relaxed mb-4">Choose how estimates show pricing across the site. This changes the display only — quoted and invoiced totals are always GST-inclusive.</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Price display">
              {gstOptions.map(o => {
                const active = user.priceGstMode === o.mode;
                return (
                  <button key={o.mode} role="radio" aria-checked={active} onClick={() => setGst(o.mode)}
                    className={`text-left border px-3 py-3 transition-colors cursor-pointer ${active ? "border-[#5A7A6A] bg-[#5A7A6A]/8" : "border-black/12 bg-white hover:border-[#5A7A6A]/50"}`}>
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-[#131311]">
                      {active && <Check className="w-3.5 h-3.5 text-[#5A7A6A]" />}{o.label}
                    </span>
                    <span className="block text-[11px] text-[#5c5a56] mt-0.5">{o.note}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="bg-white border border-black/8 p-5">
            <div className="flex items-center gap-2 mb-2"><Key className="w-4 h-4 text-[#5A7A6A]" /><h3 className="font-semibold text-sm text-[#131311]">Sign-in &amp; security</h3></div>
            <p className="text-sm text-[#5c5a56] leading-relaxed">Your account is passwordless — you sign in with a one-time code emailed to <span className="text-[#131311]">{user.email}</span>. There's no password to set or change.</p>
          </div>
        </div>
        <div className="bg-white border border-red-200 p-5">
          <h3 className="font-semibold text-sm text-red-700 mb-2">Danger zone</h3>
          <p className="text-xs text-[#5c5a56] mb-4">Permanently delete your account and all associated data. This cannot be undone.</p>
          <Btn variant="danger" size="sm">Delete account</Btn>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT — the merged Profile + Settings destination (one page, two sections).
// ═══════════════════════════════════════════════════════════════════════════════
function AccountPage({ user, setPage, setUser, authLoading }: { user: AuthUser | null; setPage: (p: Page) => void; setUser: (u: AuthUser) => void; authLoading?: boolean }) {
  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-semibold text-[#131311] leading-[1.05]" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.7rem,3.6vw,2.15rem)" }}>Account</h1>
        <p className="text-sm text-[#5c5a56] mt-[5px]">Your details and preferences.</p>
      </header>
      <div>
        <h2 className="text-lg font-semibold text-[#131311] mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Profile</h2>
        <ProfilePage user={user} setPage={setPage} setUser={setUser} authLoading={authLoading} embedded />
      </div>
      <div className="border-t border-black/8 pt-8">
        <h2 className="text-lg font-semibold text-[#131311] mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Settings</h2>
        <AccountSettingsPage user={user} setPage={setPage} setUser={setUser} authLoading={authLoading} embedded />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACK ORDER
// ═══════════════════════════════════════════════════════════════════════════════
function TrackOrderPage({ setPage }: { setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [step, setStep] = useState<"lookup" | "code" | "record">("lookup");
  // "resuming" until we know whether a guest session is already live. Without
  // this, navigating away (Message us, Contact) and coming back re-mounted the
  // page at "lookup" and demanded the reference, email and code again — even
  // though the cookie was still valid. The session lasts until the browser
  // closes, so the UI has to ask the server, not its own useState.
  const [resuming, setResuming] = useState(true);
  const [ref, setRef] = useState(""); const [email, setEmail] = useState(""); const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  // WHICH record this session covers. The record itself is rendered by the same
  // components the account area uses, fetching through the same endpoints.
  const [rec, setRec] = useState<{ kind: "project" | "order"; id: string; status?: string } | null>(null);

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  // Resume an existing guest session on mount. The credential is an httpOnly
  // cookie, so the browser still has it after a navigation — only this
  // component's state was lost. A 404 simply means no live session.
  useEffect(() => {
    let live = true;
    guestRecord()
      .then((r) => { if (live) { setRec(r); setStep("record"); } })
      .catch(() => { /* no session — the lookup form is correct */ })
      .finally(() => { if (live) setResuming(false); });
    return () => { live = false; };
  }, []);

  const request = async () => {
    if (!validEmail || !ref.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const r = await guestTrackRequest(email.trim(), ref.trim());
      setDevCode(r.devCode); setStep("code");
    } catch { setError("Something went wrong. Try again."); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (!/^\d{6}$/.test(code.trim()) || busy) return;
    setBusy(true); setError("");
    try {
      await guestTrackVerify(email.trim(), ref.trim(), code.trim());
      setRec(await guestRecord()); setStep("record");
    } catch { setError("That code didn't match, or the details don't match a quote or order."); }
    finally { setBusy(false); }
  };
  const reset = () => {
    void guestSignOut().catch(() => {});   // do not leave a live session behind
    setStep("lookup"); setCode(""); setRec(null); setError(""); setDevCode(undefined);
  };

  return (
    <div className="relative min-h-screen bg-[#FAFAF9] pt-16 pb-24 overflow-hidden">
      <GhostMark size={280} opacity={0.05} pos="right-0 top-0" />
      <div className="max-w-xl mx-auto px-6 py-12 relative">
        <SLabel>Quote &amp; order tracking</SLabel>
        <h1 className="text-3xl font-semibold text-[#131311] mb-2"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Track your quote or order</h1>
        {!resuming && step !== "record" && (
          <p className="text-[#5c5a56] text-sm mb-8">Enter the reference from your confirmation email — a quote (OF-Q-) or an order (OF-) — with the email address you used. We'll send a one-time code to confirm it's you; no account required.</p>
        )}

        {/* Hold the form back until we know whether a session is already live —
            otherwise the lookup flashes up and is snatched away. */}
        {resuming && (
          <div className="bg-white border border-black/8 p-6 text-sm text-[#5c5a56]">Checking your session…</div>
        )}
        {!resuming && step === "lookup" && (
          <div className="group relative bg-white border border-black/8 p-6 space-y-4 overflow-hidden">
            <FrameCorners size={10} color={SAGE} show="always" />
            <div><FieldLabel>Quote or order reference</FieldLabel><Input value={ref} onChange={e => setRef(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && request()} placeholder="OF-Q-10001 or OF-58001" className="font-mono tracking-wide" /></div>
            <div><FieldLabel>Email address</FieldLabel><Input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && request()} placeholder="Email used on the quote" /></div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Btn variant="sage" size="md" onClick={request} className={`w-full justify-center ${!validEmail || !ref.trim() || busy ? "opacity-50 pointer-events-none" : ""}`}>
              {busy ? "Sending…" : <>Send code <Search className="w-4 h-4" /></>}
            </Btn>
            <p className="text-xs text-[#5c5a56] text-center">
              Have an account? <button onClick={() => go("login")} className="text-[#5A7A6A] hover:underline cursor-pointer">Sign in for full history</button>
            </p>
          </div>
        )}

        {step === "code" && (
          <div className="group relative bg-white border border-black/8 p-6 space-y-4 overflow-hidden">
            <FrameCorners size={10} color={SAGE} show="always" />
            <p className="text-sm text-[#5c5a56]">If <span className="text-[#131311]">{ref.trim()}</span> matches a quote or order for <span className="text-[#131311]">{email.trim()}</span>, we've sent a 6-digit code.</p>
            <div><FieldLabel>6-digit code</FieldLabel><Input value={code} autoFocus inputMode="numeric" maxLength={6} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={e => e.key === "Enter" && verify()} placeholder="••••••" /></div>
            {devCode && <p className="text-xs text-[#5A7A6A] bg-[#5A7A6A]/8 border border-[#5A7A6A]/20 px-2 py-1.5">Dev mode — your code is <span className="font-mono font-semibold">{devCode}</span></p>}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Btn variant="sage" size="md" onClick={verify} className={`w-full justify-center ${code.length !== 6 || busy ? "opacity-50 pointer-events-none" : ""}`}>{busy ? "Checking…" : "View status"}</Btn>
            <button onClick={reset} className="text-sm text-[#5c5a56] hover:text-[#131311] cursor-pointer">← Start over</button>
          </div>
        )}

        {step === "record" && rec && (
          <div>
            <button onClick={reset} className="text-xs text-[#5c5a56] hover:text-[#131311] flex items-center gap-1 cursor-pointer mb-5"><ChevronLeft className="w-3 h-3" />New search</button>
            {rec.kind === "order"
              ? <OrderDetail orderId={rec.id} setPage={go} />
              : <ProjectDetail projectId={rec.id} status={rec.status} setPage={go} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVED QUOTE
// ═══════════════════════════════════════════════════════════════════════════════
function ApprovedQuotePage() {
  const [t1, setT1] = useState(false); const [t2, setT2] = useState(false); const [t3, setT3] = useState(false);
  return (
    <div className="relative min-h-screen bg-[#FAFAF9] pt-24 pb-24 overflow-hidden">
      <GhostMark size={260} opacity={0.05} pos="right-0 bottom-0" />
      <div className="max-w-2xl mx-auto px-6 relative">
        <div className="flex items-center gap-2 mb-2"><CheckCircle className="w-4 h-4 text-[#5A7A6A]" /><span className="text-xs text-[#5A7A6A] font-medium uppercase tracking-wide">Human verified</span></div>
        <h1 className="text-3xl font-semibold text-[#131311] mb-1"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Reviewed quote — OF-58712</h1>
        <p className="text-[#5c5a56] text-sm mb-8">Issued after manual technical review · 12 Jan 2025</p>
        <div className="group relative bg-white border border-black/8 p-5 mb-4 overflow-hidden">
          <FrameCorners size={10} color={SAGE} show="always" />
          <h3 className="font-semibold text-sm text-[#131311] mb-4">Approved line items</h3>
          <table className="w-full text-sm"><thead><tr className="border-b border-black/8 text-[10px] text-[#5c5a56] uppercase tracking-wide">
            {["Description","Dims","Qty","Total"].map(h => <th key={h} className="text-left py-2 pr-4 font-semibold">{h}</th>)}
          </tr></thead><tbody>
            {[["Alum. Sliding Door — Satin Black / DG LowE","3000×2100mm","2","[total]"],["Alum. Awning Window — Woodland Grey / DG","1200×900mm","4","[total]"],["Delivery — Preston VIC","—","1","[price]"]].map(r => (
              <tr key={r[0]} className="border-b border-black/6">{r.map((c,i) => <td key={i} className="py-3 pr-4">{c}</td>)}</tr>
            ))}
          </tbody></table>
          <div className="mt-4 pt-4 border-t border-black/8 flex justify-between">
            <span className="text-sm text-[#5c5a56]">Deposit (30%)</span>
            <span className="font-semibold" style={{ fontFamily: "'DM Mono', monospace" }}>[deposit amount]</span>
          </div>
        </div>
        <div className="group relative bg-white border border-black/8 p-5 mb-4 space-y-3 overflow-hidden">
          <FrameCorners size={10} color={SAGE} show="always" />
          <h3 className="font-semibold text-sm text-[#131311] mb-1">Acknowledge before paying</h3>
          {[[t1,setT1,"Dimensions verified by a qualified builder, installer or professional."],[t2,setT2,"Supply-only order. Installation not included."],[t3,setT3,"Payment confirms the reviewed quote only. Changes after deposit may incur costs."]].map(([v,s,l],i) => (
            <label key={i} className="flex items-start gap-3 cursor-pointer text-sm text-[#5c5a56]">
              <input type="checkbox" checked={v as boolean} onChange={e => (s as any)(e.target.checked)} className="mt-0.5 accent-[#5A7A6A] w-4 h-4" />{l as string}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Btn variant="sage" size="lg" disabled={!t1||!t2||!t3}>Pay deposit <ArrowRight className="w-4 h-4" /></Btn>
          <Btn variant="ghost" size="lg">Request changes</Btn>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRADE ACCOUNT
// ═══════════════════════════════════════════════════════════════════════════════
function TradePage({ setPage }: { setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  return (
    <div className="bg-[#FAFAF9] min-h-screen">
      {/* ─── Hero — dark architectural, consistent with the other pages ───────── */}
      <section className="relative bg-[#0c0c0a] overflow-hidden min-h-[340px] md:min-h-[420px] flex items-end pt-16">
        <img src={IMG.hero} alt="Aluminium-framed façade on a contemporary Melbourne build at dusk"
          className="absolute inset-0 w-full h-full object-cover opacity-60 hero-zoom" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(12,12,10,0.92) 0%, rgba(12,12,10,0.6) 34%, rgba(12,12,10,0.25) 100%)" }} />
        <GhostMark size={300} opacity={0.06} color="#fff" pos="right-0 bottom-0" />
        <div className="relative max-w-6xl mx-auto px-6 pb-10 w-full">
          <div className="flex items-center gap-2 mb-3">
            <WindowMark size={11} color="rgba(255,255,255,0.55)" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60" style={{ fontFamily: "'DM Mono', monospace" }}>Trade account</span>
          </div>
          <h1 className="font-semibold text-white leading-[1.05] tracking-tight mb-3"
            style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(2rem, 4.5vw, 3rem)" }}>For builders and trades</h1>
          <p className="text-white/70 max-w-xl text-[15px] leading-relaxed">Faster turnaround, saved contacts, dedicated support and bulk schedule upload.</p>
        </div>
      </section>

      {/* ─── Content ──────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-4">
            {[["Faster quote turnaround","Priority review for trade accounts."],["Saved project details","Reuse contacts, addresses and product specs."],["Repeat orders","Re-order previous products with updated dimensions."],["Dedicated contact","Named account manager for ongoing projects."],["Bulk schedule upload","Submit multiple schedules in one request."]].map(([t,b]) => (
              <div key={t} className="flex gap-3">
                <WindowMark size={10} color={SAGE} className="mt-1.5 flex-shrink-0" />
                <div><p className="font-medium text-sm text-[#131311]">{t}</p><p className="text-xs text-[#5c5a56]">{b}</p></div>
              </div>
            ))}
          </div>
          <div className="group relative bg-white border border-black/8 p-6 overflow-hidden">
            <FrameCorners size={10} color={SAGE} show="always" />
            <h3 className="font-semibold text-[#131311] mb-4">Apply for a trade account</h3>
            <div className="space-y-3">
              {[["Business name","ABC Constructions"],["ABN","00 000 000 000"],["Contact name","Full name"],["Email","trade@business.com.au"],["Phone","(03) 9000 0000"]].map(([l,p]) => (
                <div key={l}><FieldLabel>{l}</FieldLabel><Input placeholder={p} /></div>
              ))}
              <Btn variant="sage" size="md" className="w-full justify-center">Apply <ArrowRight className="w-4 h-4" /></Btn>
            </div>
            <p className="text-xs text-[#5c5a56] mt-3">Reviewed within 2 business days.</p>
          </div>
        </div>
      </section>
      <CtaBanner
        title="Ready to get a quote?"
        sub="Start online — enter dimensions or bring your window schedule."
        onClick={() => go("quote")}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
function AdminPage() {
  const [sel, setSel] = useState(0);
  const quotes = [
    { ref: "OF-58901", name: "Premier Build Co.", type: "Builder", project: "New build — Coburg",      items: 3, status: "Review required", conf: 85, age: "2h" },
    { ref: "OF-58698", name: "Sarah T.",           type: "Homeowner", project: "Renovation — Northcote",items: 1, status: "More info needed", conf: 52, age: "1d" },
    { ref: "OF-58671", name: "Metro Reno Group",   type: "Trade",     project: "Extension — St Kilda",  items: 6, status: "Ready",           conf: 94, age: "2d" },
  ];
  const q = quotes[sel];
  const sc: Record<string,string> = { "Review required":"text-amber-400 bg-amber-400/10","More info needed":"text-red-400 bg-red-400/10","Ready":"text-[#5A7A6A] bg-[#5A7A6A]/10" };
  return (
    <div className="relative bg-[#0c0c0a] min-h-screen pt-16 text-white overflow-hidden">
      <GhostMark size={400} opacity={0.06} color="#fff" pos="right-0 bottom-0" />
      <div className="border-b border-white/8 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <WindowMark size={16} color={SAGE} />
            <span className="font-semibold text-sm">Quote Review Dashboard</span>
            <span className="text-[10px] bg-white/8 text-white/35 px-2 py-0.5">Internal concept</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/35"><Bot className="w-3.5 h-3.5 text-[#5A7A6A]" />AI-assisted</div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-5 relative">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/25 mb-3">Incoming ({quotes.length})</p>
          {quotes.map((qt, i) => (
            <button key={qt.ref} onClick={() => setSel(i)}
              className={`group relative w-full text-left p-4 mb-2 border transition-all cursor-pointer overflow-hidden ${sel === i ? "border-[#5A7A6A]/40 bg-[#5A7A6A]/5" : "border-white/8 hover:border-white/20"}`}>
              <FrameCorners size={8} color={SAGE} />
              <div className="flex justify-between items-start mb-1">
                <span className="text-[10px] text-[#5A7A6A] font-medium" style={{ fontFamily: "'DM Mono', monospace" }}>{qt.ref}</span>
                <span className={`text-[10px] px-1.5 py-0.5 font-medium ${sc[qt.status]}`}>{qt.status}</span>
              </div>
              <p className="font-medium text-sm text-white">{qt.name}</p>
              <p className="text-[11px] text-white/25 mb-2">{qt.project} · {qt.age} ago</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-0.5 bg-white/10">
                  <div className={`h-0.5 ${qt.conf > 80 ? "bg-[#5A7A6A]" : qt.conf > 60 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${qt.conf}%` }} />
                </div>
                <span className="text-[10px] text-white/25">{qt.conf}%</span>
              </div>
            </button>
          ))}
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="group relative bg-white/5 border border-white/10 p-5 overflow-hidden">
            <FrameCorners size={8} color={SAGE} />
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-[10px] text-[#5A7A6A] block mb-1" style={{ fontFamily: "'DM Mono', monospace" }}>{q.ref}</span>
                <h3 className="font-semibold text-lg text-white">{q.name}</h3>
                <p className="text-sm text-white/35">{q.type} · {q.project}</p>
              </div>
              <span className={`text-xs px-2 py-1 font-medium ${sc[q.status]}`}>{q.status}</span>
            </div>
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-2"><Bot className="w-3.5 h-3.5 text-[#5A7A6A]" /><span className="text-[10px] font-medium text-white/35 uppercase tracking-wide">AI extracted · indicative only</span></div>
              {[["Alum. Sliding Door","3000×2100mm",2,92],["Awning Window","1200×900mm",4,78],["Sliding Window","?×1050mm",3,38]].map(([t,d,qty,conf],i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/6 last:border-0 text-sm">
                  <span className="text-white/75">{t as string} — {d as string} ×{qty as number}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-0.5 bg-white/10"><div className={`h-0.5 ${(conf as number) > 80 ? "bg-[#5A7A6A]" : (conf as number) > 60 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${conf}%` }} /></div>
                    <span className="text-[10px] text-white/25">{conf as number}%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn variant="ghost" size="sm" className="text-white/55 border border-white/12 hover:text-white"><MessageSquare className="w-3 h-3" />Request info</Btn>
              <Btn variant="ghost" size="sm" className="text-white/55 border border-white/12 hover:text-white"><Eye className="w-3 h-3" />Mark ready</Btn>
              <Btn variant="sage" size="sm"><Send className="w-3 h-3" />Send reviewed quote</Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const initialRoute = routeFromPathname(window.location.pathname);
  const [page, setPage] = useState<Page>(initialRoute.page);
  const [user, setUser] = useState<AuthUser | null>(null);
  // Which order/project the tracking page should open (set from the dashboard).
  // Cleared on any ordinary navigation so unrelated entry points show the default.
  const [focusRecord, setFocusRecord] = useState<TrackFocus>(null);
  const navigateTo = (p: Page, pathOverride?: string) => {
    const nextPath = pathOverride ?? pathForPage(p);
    if (window.location.pathname !== nextPath) window.history.pushState({ page: p }, "", nextPath);
    setFocusRecord(null);
    setPage(p);
    window.scrollTo(0, 0);
  };
  // Open a specific dashboard row on the tracking page (navigate, then focus it).
  const openRecord = (rec: TrackFocus) => { navigateTo("order"); setFocusRecord(rec); };

  // ─── Catalogue navigation state ──────────────────────────────────────────────
  // Category/family persist so returning from a product detail restores the
  // catalogue where the user left it. productSlug drives the product detail page.
  const [catCategory, setCatCategory] = useState<CategorySlug>("windows");
  const [catFamily, setCatFamily] = useState<string>("all");
  const [productSlug, setProductSlug] = useState<string>(initialRoute.productSlug ?? catalogueProducts[0]?.slug ?? "");

  useEffect(() => {
    const syncRoute = () => {
      const route = routeFromPathname(window.location.pathname);
      setPage(route.page);
      if (route.productSlug) setProductSlug(route.productSlug);
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  const selectCategory = (c: CategorySlug) => { setCatCategory(c); setCatFamily("all"); };
  const openProduct = (slug: string) => {
    setProductSlug(slug);
    navigateTo("product-detail", pathForPage("product-detail", slug));
  };
  const backToFamily = (categorySlug: CategorySlug, familySlug: string) => {
    setCatCategory(categorySlug); setCatFamily(familySlug); navigateTo("products");
  };

  // Shared quote state — MyProject persists across the quote builder and product pages
  const [quoteItems, setQuoteItems] = useState<QItem[]>([]);
  const [quoteFiles, setQuoteFiles] = useState<QFile[]>([]);
  const [projectTitle, setProjectTitle] = useState(DEFAULT_PROJECT_TITLE);
  const [projectId, setProjectId] = useState<string | null>(null);
  // Latest-value refs so reload()'s pre-flush saves what the customer has RIGHT
  // NOW, not a stale closure captured when the quote object was built.
  const quoteItemsRef = useRef<QItem[]>([]);
  const projectTitleRef = useRef(DEFAULT_PROJECT_TITLE);
  quoteItemsRef.current = quoteItems;
  projectTitleRef.current = projectTitle;
  const quote: QuoteState = {
    items: quoteItems,
    files: quoteFiles,
    title: projectTitle,
    setTitle: setProjectTitle,
    // Assign a suggested code when none is supplied. Codes are derived from `prev`
    // (not the render snapshot) so a batch import numbers items sequentially.
    add: (i) => { const id = Date.now() + Math.floor(Math.random() * 1000); setQuoteItems(prev => [...prev, { ...i, id, code: i.code?.trim() ? i.code.trim() : suggestCode(prev, i.productSlug) }]); return id; },
    update: (id, patch) => setQuoteItems(prev => prev.map((it) => {
      if (it.id !== id) return it;
      const priceSensitive = ["productSlug", "options", "width", "height", "qty"]
        .some((key) => Object.prototype.hasOwnProperty.call(patch, key));
      return {
        ...it,
        ...patch,
        lineTotal: (it.origin === "ai" || it.aiPriced) && priceSensitive ? null : it.lineTotal,
      };
    })),
    remove: (id) => setQuoteItems(prev => {
      const removed = prev.find(it => it.id === id);
      if (removed?.serverId) removedLineIdsRef.current.add(removed.serverId);
      return prev.filter(it => it.id !== id);
    }),
    // A duplicate is a new manual cart line. It must never inherit the source
    // line's immutable AI provenance or private authoritative price.
    copy: (id) => {
      const src = quoteItems.find(x => x.id === id);
      if (!src) return undefined;
      const nid = Date.now() + Math.floor(Math.random() * 1000);
      setQuoteItems(prev => [...prev, {
        ...src, id: nid, serverId: undefined, code: suggestCode(prev, src.productSlug),
        origin: "manual", aiPriced: false, lineTotal: undefined, status: "Needs review",
        review: { options: "Confirm the copied item's configuration before pricing." },
      }]);
      return nid;
    },
    addFiles: (f) => setQuoteFiles(prev => [...prev, ...f]),
    removeFile: (id) => setQuoteFiles(prev => prev.filter(f => f.id !== id)),
    // Replace the whole line set (after a schedule parse re-hydrates from server).
    setItems: (items) => setQuoteItems(items.map((it, i) => ({ ...it, id: Date.now() + i }))),
    // Reset the whole project to zero — lines AND the attached schedule file — on
    // both sides. Skip the echo save so the just-cleared state isn't re-sent.
    clearAll: async () => {
      try { await clearDraft(); } catch { /* offline — local clear still applies */ }
      skipNextSaveRef.current = true;
      setQuoteItems([]); setQuoteFiles([]);
    },
    // Re-hydrate lines + the attached file from the server (after a parse).
    reload: async () => {
      // FLUSH FIRST. reload() overwrites local lines with server state, so any
      // edit still sitting in the debounced autosave would be silently lost —
      // exactly what happened when a manually added line vanished as parse
      // results landed. Flushing at the source protects EVERY reload path (AI
      // run completion, file removal, post-parse) rather than one call site.
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      if (hydratedRef.current) {
        try {
          const removedIds = [...removedLineIdsRef.current];
          await saveLines(quoteItemsRef.current, projectTitleRef.current, removedIds);
          removedIds.forEach((id) => removedLineIdsRef.current.delete(id));
        } catch { /* offline: keep local state and skip the overwrite below */
          return;
        }
      }
      const r = await getCurrentProject();
      skipNextSaveRef.current = true;
      setQuoteItems((r.items ?? []).map((it, i) => ({
        id: Date.now() + i, serverId: it.id,
        code: it.code, productSlug: it.productSlug, location: it.location,
        measuredBy: it.measuredBy, width: it.width, height: it.height,
        options: it.options, qty: it.qty, status: it.status,
        origin: it.origin, aiPriced: it.aiPriced, review: it.review ?? null, lineTotal: it.lineTotal,
      })));
      setQuoteFiles((r.files ?? []).map((f) => ({ id: f.id, name: f.filename, kind: f.kind, status: "Uploaded" as const, docType: f.doc_type ?? null })));
    },
  };
  // ── Persistence (M2): hydrate the anon project on load, snapshot-save on change ──
  // The client store above stays the source of truth for the UI; persistence is a
  // side-effect. Anonymous projects are keyed by an httpOnly claim cookie the Worker
  // sets on first save (see docs/customer-backend-scaffold.md).
  const hydratedRef = useRef(false);
  const skipNextSaveRef = useRef(false);
  const removedLineIdsRef = useRef(new Set<string>());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore the session on load (returning registered users). `authLoading`
  // guards account pages from bouncing to login before the session resolves.
  const [authLoading, setAuthLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then(r => { if (!cancelled && r.user) setUser(toAuthUser(r.user)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAuthLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCurrentProject()
      .then(r => {
        if (cancelled) return;
        // Only a DRAFT project is the editable "current" quote. A submitted/closed
        // project must not populate the builder (nor become the submit target) — the
        // customer starts a fresh draft instead. The tracking page reads such
        // projects through its own call.
        if (!r.project || r.project.status !== "draft") return;
        skipNextSaveRef.current = true; // don't echo the just-loaded data straight back
        setProjectId(r.project.id);
        if (r.project.title) setProjectTitle(r.project.title);
        if (r.items.length) {
          setQuoteItems(r.items.map((it, i) => ({
            id: Date.now() + i, serverId: it.id,
            code: it.code, productSlug: it.productSlug, location: it.location,
            measuredBy: it.measuredBy, width: it.width, height: it.height,
            options: it.options, qty: it.qty, status: it.status,
            origin: it.origin, aiPriced: it.aiPriced, review: it.review ?? null, lineTotal: it.lineTotal,
          })));
        }
        // Surface the attached schedule file (integral to the quote/order).
        if (r.files?.length) {
          setQuoteFiles(r.files.map((f) => ({ id: f.id, name: f.filename, kind: f.kind, status: "Uploaded" as const, docType: f.doc_type ?? null })));
        }
      })
      .catch(() => { /* offline / API down — keep working in-memory */ })
      .finally(() => { if (!cancelled) hydratedRef.current = true; });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;                 // ignore the pre-hydrate initial state
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const sentItems = quoteItems;
      const sentIds = quoteItems.map(it => it.id); // local ids captured at send time
      const removedIds = [...removedLineIdsRef.current];
      saveLines(quoteItems, projectTitle, removedIds).then(r => {
        removedIds.forEach((id) => removedLineIdsRef.current.delete(id));
        if (r.project) setProjectId(r.project.id);
        // Hydrate server-owned provenance, exact AI total and review state. Do not
        // overwrite an edit that landed while the request was in flight.
        if (Array.isArray(r.items) && r.items.length === sentIds.length) {
          setQuoteItems(prev => {
            let changed = false;
            const next = prev.map(it => {
              const idx = sentIds.indexOf(it.id);
              const server = idx >= 0 ? r.items[idx] : undefined;
              const sent = idx >= 0 ? sentItems[idx] : undefined;
              if (!server || !sent) return it;
              const unchanged = JSON.stringify([
                it.code, it.productSlug, it.location, it.measuredBy, it.width,
                it.height, it.options, it.qty,
              ]) === JSON.stringify([
                sent.code, sent.productSlug, sent.location, sent.measuredBy,
                sent.width, sent.height, sent.options, sent.qty,
              ]);
              if (!unchanged) return it;
              changed = true;
              return {
                ...it, serverId: server.id, origin: server.origin, aiPriced: server.aiPriced,
                lineTotal: server.lineTotal, status: server.status,
                review: server.review ?? null,
              };
            });
            if (changed) skipNextSaveRef.current = true;
            return changed ? next : prev;
          });
        }
      }).catch(() => {});
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [quoteItems, projectTitle]);

  // Submit the current draft project for review (Draft -> Submitted).
  // Flush any pending autosave first so the server validates + submits the latest
  // lines (and we hold a real project id), then only report success when the
  // server actually accepted the submission — the caller gates its success UI on it.
  const submitCurrentProject = async (contact: SubmitContact): Promise<SubmitResult> => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    let id = projectId;
    try {
      const removedIds = [...removedLineIdsRef.current];
      const saved = await saveLines(quoteItems, projectTitle, removedIds);
      removedIds.forEach((removedId) => removedLineIdsRef.current.delete(removedId));
      if (saved.project) { id = saved.project.id; setProjectId(saved.project.id); }
    } catch { return { ok: false, error: "network" }; }
    if (!id) return { ok: false, error: "no_project" };
    try {
      const r = await submitProject(id, contact);
      return { ok: true, status: r.status };
    } catch {
      return { ok: false, error: "rejected" };
    }
  };

  // Home "Upload a schedule" → the quote builder, where the real upload + parse
  // happens (the builder auto-opens the file picker via ?upload=1).
  const uploadDemoScheduleFromHome = () => {
    navigateTo("quote");
    if (typeof window !== "undefined") { try { window.history.replaceState(null, "", "?upload=1"); } catch { /* noop */ } };
  };

  // Account-page guards: bounce to login once the session check settles with no
  // user; a hard reload on /order has no focused record → back to the home.
  useEffect(() => {
    if (isAccountPage(page) && !user && !authLoading) navigateTo("login");
    if (page === "order" && !focusRecord) navigateTo("dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, user, authLoading, focusRecord]);

  const renderPage = () => {
    switch (page) {
      case "home":             return <HomePage setPage={navigateTo} onUploadSchedule={uploadDemoScheduleFromHome} />;
      case "products":         return <ProductsPage setPage={navigateTo} category={catCategory} family={catFamily} onSelectCategory={selectCategory} onSelectFamily={setCatFamily} onOpenProduct={openProduct} />;
      case "product-detail":   return <ProductDetailPage slug={productSlug} setPage={navigateTo} onOpenProduct={openProduct} onBack={backToFamily} quote={quote} />;
      case "quote":            return <QuotePage setPage={navigateTo} user={user} quote={quote} onSubmit={submitCurrentProject} />;
      // Without setPage the page's own CTAs called setPage?.(…) on undefined and
      // did nothing but scroll to top — a dead end for traffic the home page sends.
      case "how-it-works":     return <HowItWorksPage setPage={navigateTo} />;
      case "resources":        return <ResourcesPage setPage={navigateTo} />;
      case "contact":          return <ContactPage setPage={navigateTo} user={user} />;
      case "privacy":          return <PrivacyPolicyPage setPage={navigateTo} />;
      case "approved-quote":   return <ApprovedQuotePage />;
      case "trade":            return <TradePage setPage={navigateTo} />;
      case "admin":            return <AdminPage />;
      case "login":            return <LoginPage setPage={navigateTo} setUser={setUser} />;
      case "dashboard":        return inShell("projects", <AccountDashboard user={user!} setPage={navigateTo} onOpenRecord={openRecord} />);
      case "account":          return inShell("account", <AccountPage user={user} setPage={navigateTo} setUser={setUser} authLoading={authLoading} />);
      case "help":             return inShell("help", <HelpPage setPage={navigateTo} />);
      case "track-order":      return <TrackOrderPage setPage={navigateTo} />;
      case "order":            return inShell("projects", renderRecord());
      default:                 return <HomePage setPage={navigateTo} onUploadSchedule={uploadDemoScheduleFromHome} />;
    }
  };

  // Wrap an account screen in the right-rail shell. The login/home redirects happen
  // in the effect above, never during render.
  function inShell(section: AccountSection, node: React.ReactNode) {
    if (!user) return <div className="min-h-screen bg-[#FAFAF9]" />;
    const signOut = () => { apiLogout().catch(() => {}); setUser(null); navigateTo("home"); };
    return <AccountShell section={section} setPage={navigateTo} user={user} onSignOut={signOut}>{node}</AccountShell>;
  }

  // The deep record workspace: an order, an issued quote (review & accept), or a
  // quote-stage project.
  function renderRecord() {
    const backToList = () => navigateTo("dashboard");
    if (focusRecord?.orderId) {
      return <OrderDetail orderId={focusRecord.orderId} setPage={navigateTo} backToList={backToList} />;
    }
    if (focusRecord?.projectId) {
      if (focusRecord.status === "quote_issued") {
        return <QuoteReviewPage projectId={focusRecord.projectId} setPage={navigateTo} backToList={backToList} onOpenRecord={openRecord} />;
      }
      return <ProjectDetail projectId={focusRecord.projectId} status={focusRecord.status} setPage={navigateTo} backToList={backToList} onOpenRecord={openRecord} />;
    }
    return <div className="min-h-[40vh]" />;
  }

  // Per-page SEO (title, meta, Open Graph, X/Twitter) → <head>. Marketing pages
  // pull their record from Sanity; product detail uses the product's SEO;
  // app/transactional pages stay out of the index.
  const seoProps = (() => {
    // Titles carry the Business Name from Sanity — never a hardcoded brand. When
    // it isn't set the page title is just the page's own name (no invented brand).
    const co = brandName();
    const suffix = co ? ` — ${co}` : "";
    // Absolute URLs — schema.org @id and breadcrumb items must be resolvable,
    // and a relative path is not.
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const abs = (path: string) => `${origin}${path}`;

    if (page === "product-detail") {
      const p = getProductBySlug(productSlug);
      const img = imageUrl(p?.heroImage, { w: 1200, h: 630 });
      const fam = p ? getFamily(p.familySlug) : undefined;
      const cat = p ? getCategory(p.categorySlug) : undefined;
      return {
        seo: p?.seo, title: p ? `${p.name}${suffix}` : co ?? "Product",
        description: p?.shortDescription, image: img,
        facts: p ? {
          kind: "product" as const, url: abs(`/products/${p.slug}`), name: p.name,
          description: p.shortDescription || undefined, image: img || undefined,
          sku: p.slug, brand: co ?? undefined,
        } : null,
        // Products, listing, then the product itself — from the catalogue's own
        // category → family → product path, so it can't drift from the nav.
        breadcrumbs: p ? [
          { name: "Products", url: abs("/products") },
          ...(cat ? [{ name: cat.name, url: abs(`/products?category=${cat.slug}`) }] : []),
          ...(fam ? [{ name: fam.name, url: abs(`/products?family=${fam.slug}`) }] : []),
          { name: p.name, url: abs(`/products/${p.slug}`) },
        ] : undefined,
      };
    }
    const marketing: Record<string, { pageId: string; title: string; noIndex?: boolean }> = {
      home: { pageId: "home", title: co ? `${co} — Aluminium Windows & Doors` : "Aluminium Windows & Doors" },
      products: { pageId: "products", title: `Aluminium Windows & Doors${suffix}` },
      "how-it-works": { pageId: "how-it-works", title: `How It Works${suffix}` },
      contact: { pageId: "contact", title: `Contact${suffix}` },
      privacy: { pageId: "privacy", title: `Privacy Policy${suffix}`, noIndex: true },
    };
    const m = marketing[page];
    if (m) {
      const pg = getPage(m.pageId);
      const img = imageUrl(pg?.heroImage, { w: 1200, h: 630 });
      return {
        seo: pg?.seo, title: m.title, image: img, noIndex: m.noIndex,
        // Every marketing page declares itself. The Schema.org tab on the record
        // can narrow "WebPage" to ContactPage/AboutPage/FAQPage without code.
        facts: {
          kind: "page" as const,
          url: abs(m.pageId === "home" ? "/" : `/${m.pageId}`),
          name: m.title, image: img || undefined,
        },
      };
    }
    // App/transactional pages: no record node, so only the site-wide
    // organisation graph renders — and noindex suppresses even that.
    return { title: co ?? "My Project", noIndex: true };
  })();

  return (
    <GstContext.Provider value={user?.priceGstMode ?? "inc"}>
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <Seo {...seoProps} />
      <style>{`
        * { -webkit-font-smoothing: antialiased; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(90,122,106,0.2); border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(90,122,106,0.4); }
        select option { color: #131311; background: #fff; }
        body { overflow-x: hidden; }
        @keyframes heroZoom { from { transform: scale(1.2); } to { transform: scale(1); } }
        .hero-zoom { animation: heroZoom 2.5s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .hero-zoom { animation: none; } }
      `}</style>
      <Nav page={page} setPage={navigateTo} user={user} setUser={setUser} />
      <main>{renderPage()}</main>
      {page !== "admin" && <Footer setPage={navigateTo} />}
      {!["home", "quote", "admin", "product-detail", "dashboard", "account", "help", "order"].includes(page) && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 py-3 bg-white border-t border-black/8"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <Btn variant="sage" size="md" onClick={() => navigateTo("quote")} className="w-full justify-center">Get a quote →</Btn>
        </div>
      )}
    </div>
    </GstContext.Provider>
  );
}
