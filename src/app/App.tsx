import { useState, useEffect, useRef } from "react";
import {
  Menu, X, ArrowRight, ChevronRight, ChevronLeft, ChevronDown,
  Upload, Check, AlertCircle, Truck, FileText, Phone,
  Mail, MapPin, Plus, Minus, Info, Shield, Bot,
  MessageSquare, CheckCircle, XCircle, Download,
  User, Send, Eye, LogOut, Package, LayoutDashboard,
  Search, Lock, Key, Bell, Settings, ExternalLink
} from "lucide-react";
import { type Page, SAGE, DARK, WARM, WindowMark, GhostMark, SLabel, Btn, FieldLabel, Input } from "./ui";
import { ProductsPage } from "../pages/ProductsPage";
import { ProductDetailPage } from "../pages/ProductDetailPage";
import { AccountPage, AccountLayout, ACCOUNT_NAV, isAccountActive } from "../pages/AccountArea";
import { QuotePage } from "../pages/QuotePage";
import { HowItWorksPage } from "../pages/HowItWorksPage";
import { OrderTrackingPage, OrderReadout, type TrackFocus } from "../pages/OrderTrackingPage";
import { ContactPage } from "../pages/ContactPage";
import { PrivacyPolicyPage } from "../pages/PrivacyPolicyPage";
import { pathForPage, routeFromPathname } from "./routes";
import { products as catalogueProducts, type CategorySlug, getPage, imageUrl, getProductBySlug } from "../data/catalogue";
import { Seo } from "./Seo";
import type { QItem, QFile, QuoteState } from "../data/configurator";
import { suggestCode, addDemoSchedule, fmt, DEFAULT_PROJECT_TITLE } from "../data/configurator";
import { getCurrentProject, saveLines, submitProject, updateProfile, me as fetchMe, logout as apiLogout, requestCode, verifyCode, guestTrackRequest, guestTrackVerify, guestRecord, getProjects, getOrders, type AuthUserDto, type ApiOrder, type ApiProjectSummary, type SubmitContact, type SubmitResult } from "../data/api";
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

// ─── Navigation ───────────────────────────────────────────────────────────────
function Nav({ page, setPage, user, setUser }: {
  page: Page; setPage: (p: Page) => void;
  user: AuthUser | null; setUser: (u: AuthUser | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const go = (p: Page) => { setPage(p); setOpen(false); window.scrollTo(0, 0); };
  const topOffset = 0; // the account top-bar was removed; header sits at the top

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
          <button onClick={() => go("home")} className="flex items-center gap-2.5 cursor-pointer flex-shrink-0">
            <WindowMark size={18} color="#f5f3ef" />
            <span className="font-semibold text-[15px] tracking-tight text-white"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>OpenFrame</span>
          </button>
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
          <div className="hidden xl:flex items-center gap-3 flex-shrink-0">
            <a href="tel:0390000000"
              className="text-sm text-white/75 hover:text-white flex items-center gap-1.5 transition-colors">
              <Phone className="w-3.5 h-3.5" />(03) 9000 0000
            </a>
            {!user && (
              <button onClick={() => go("login")}
                className="text-sm text-white/75 hover:text-white cursor-pointer transition-colors ml-2">
                Sign in
              </button>
            )}
            {user && (
              <button onClick={() => go("dashboard")}
                className="text-sm text-[#8CA99B] hover:text-white font-medium cursor-pointer flex items-center gap-1.5 transition-colors ml-2">
                <LayoutDashboard className="w-4 h-4" />My dashboard
              </button>
            )}
            {!user && <Btn variant="sage" size="sm" onClick={() => go("quote")}>Get a quote</Btn>}
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
          {links.map(([l, p]) => (
            <button key={p} onClick={() => go(p)}
              aria-current={isActive(p) ? "page" : undefined}
              className={`w-full text-left px-5 py-4 border-b border-white/[0.07] text-base transition-colors flex items-center justify-between cursor-pointer
                ${isActive(p) ? "text-white font-semibold bg-[#5A7A6A]/25 border-l-2 border-l-[#8CA99B]" : "text-white/75 hover:text-white hover:bg-white/[0.06] border-l-2 border-l-transparent"}`}>
              {l}
              {isActive(p) && <span className="w-1.5 h-1.5 bg-[#8CA99B] rounded-full" aria-hidden="true" />}
            </button>
          ))}

          {/* Primary CTA — hidden for signed-in users (they start quotes from Overview). */}
          {!user && (
            <div className="px-5 pt-4 pb-2">
              <Btn variant="sage" size="md" onClick={() => go("quote")} className="w-full justify-center">
                Get a quote <ArrowRight className="w-4 h-4" />
              </Btn>
            </div>
          )}

          <div className="border-t border-white/10 mt-2 pt-2">
            {user ? (
              <>
                <p className="px-5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/35">My account</p>
                {ACCOUNT_NAV.map(({ label, page: p }) => {
                  const active = isAccountActive(page, p);
                  return (
                    <button key={p} onClick={() => go(p)} aria-current={active ? "page" : undefined}
                      className={`w-full text-left px-5 py-3.5 text-sm flex items-center justify-between cursor-pointer border-l-2 ${active ? "text-white font-semibold bg-[#5A7A6A]/25 border-l-[#8CA99B]" : "text-white/70 hover:text-white hover:bg-white/[0.06] border-l-transparent"}`}>
                      {label}
                      {active && <span className="w-1.5 h-1.5 bg-[#8CA99B] rounded-full" aria-hidden="true" />}
                    </button>
                  );
                })}
                <button onClick={() => { apiLogout().catch(() => {}); setUser(null); setOpen(false); go("home"); }}
                  className="w-full text-left px-5 py-3.5 text-sm text-red-300 hover:text-red-200 hover:bg-red-500/10 flex items-center gap-2 cursor-pointer">
                  <LogOut className="w-4 h-4" />Sign out
                </button>
              </>
            ) : (
              <button onClick={() => go("login")}
                className="w-full text-left px-5 py-3.5 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] flex items-center gap-2 cursor-pointer">
                <Lock className="w-4 h-4" />Sign in / Register
              </button>
            )}
            <button onClick={() => go("track-order")}
              className="w-full text-left px-5 py-3.5 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] flex items-center gap-2 cursor-pointer">
              <Package className="w-4 h-4" />Track an order
            </button>
          </div>
        </nav>

        <div className="px-5 py-4 border-t border-white/10 flex-shrink-0 bg-white/[0.025]">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/35 mb-2">Contact us</p>
          <a href="tel:0390000000" className="flex items-center gap-2 text-sm text-white font-medium mb-1.5 hover:text-[#8CA99B] transition-colors">
            <Phone className="w-4 h-4 text-[#8CA99B]" />(03) 9000 0000
          </a>
          <a href="mailto:quotes@openframe.com.au" className="flex items-center gap-2 text-sm text-white/65 hover:text-[#8CA99B] transition-colors">
            <Mail className="w-4 h-4 text-[#8CA99B]" />quotes@openframe.com.au
          </a>
        </div>
      </div>
    </>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer({ setPage }: { setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  return (
    <footer className="relative bg-[#131311] text-white/55 pt-16 pb-10 overflow-hidden">
      <GhostMark size={360} opacity={0.06} color="#fff" pos="right-0 bottom-0" />
      <div className="max-w-6xl mx-auto px-6 relative">
        <div className="flex flex-col md:flex-row justify-between gap-10 mb-10">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5 mb-4">
              <WindowMark size={18} color={SAGE} />
              <span className="font-semibold text-sm text-white"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>OpenFrame</span>
            </div>
            <p className="text-sm leading-relaxed mb-5">
              Aluminium windows and doors supplied direct for Melbourne projects. Supply only — installation not included.
            </p>
            <div className="text-sm space-y-2">
              <a href="tel:0390000000" className="flex items-center gap-2 hover:text-white transition-colors">
                <Phone className="w-3.5 h-3.5 text-[#5A7A6A]" />(03) 9000 0000
              </a>
              <a href="mailto:quotes@openframe.com.au" className="flex items-center gap-2 hover:text-white transition-colors">
                <Mail className="w-3.5 h-3.5 text-[#5A7A6A]" />quotes@openframe.com.au
              </a>
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
        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between gap-2 text-xs text-white/25">
          <span>© 2025 OpenFrame · Melbourne, Victoria · ABN 00 000 000 000</span>
          <span>Supply only · Prototype — sample content</span>
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

function HomePage({ setPage, onUploadSchedule }: { setPage: (p: Page) => void; onUploadSchedule: () => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };

  // Task-led entry points — same three actions on hero and final band.
  const actions: { title: string; sub: string; icon: React.ReactNode; page: Page; onClick?: () => void }[] = [
    { title: "Build an estimate", sub: "Enter dimensions and options",              icon: <IconEstimate />, page: "quote" },
    { title: "Upload a schedule", sub: "Send plans or a schedule for review",       icon: <IconUpload />,   page: "quote", onClick: onUploadSchedule },
    { title: "Browse products",   sub: "Explore window and door systems",           icon: <IconBrowse />,   page: "products" },
  ];

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

  const steps: { n: string; title: string; body: string; Icon: typeof Upload }[] = [
    { n: "01", title: "Build or upload",              body: "Choose products and enter dimensions, or upload a window/door schedule.", Icon: Upload },
    { n: "02", title: "Indicative estimate",          body: "Receive an indicative estimate based on selections and project details.", Icon: FileText },
    { n: "03", title: "Technical review",             body: "Our team checks specifications, dimensions and manufacturing suitability.", Icon: Search },
    { n: "04", title: "Reviewed quote before deposit", body: "You approve the reviewed quote before any deposit is paid.", Icon: Check },
  ];

  const trust = ["Indicative first", "Reviewed before deposit", "Manufacturer-backed", "Supply only"];

  return (
    <div>
      {/* ─── HERO — integrated architectural image + framed entry block ─────── */}
      <section className="relative min-h-screen flex items-center bg-[#0c0c0a] overflow-hidden">
        <img src={imageUrl(getPage("home")?.heroImage, { w: 1920, h: 1080 })}
          alt="Aluminium-framed sliding doors on a modern Melbourne home at dusk, warm interior light behind dark cladding"
          className="absolute inset-0 w-full h-full object-cover opacity-80 hero-zoom" />
        {/* Contrast overlay — concentrated on the left behind the content frame,
            easing to ~20% by a quarter across so the image reads clearly */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(12,12,10,0.85) 0%, rgba(12,12,10,0.5) 12%, rgba(12,12,10,0.2) 27%, rgba(12,12,10,0.12) 60%, rgba(12,12,10,0.1) 100%)" }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0a]/40 via-transparent to-transparent" />
        {/* Mullion grid motif (hero frame rectangle removed) */}

        <div className="relative w-full max-w-6xl mx-auto px-6 pt-28 pb-16 md:py-28">
          <div className="w-full max-w-2xl">
            {/* Content frame */}
            <div className="border border-white/15 bg-[#0c0c0a]/55 backdrop-blur-md p-6 sm:p-8 md:p-10">
              <div className="flex items-center gap-2 mb-5">
                <WindowMark size={11} color="rgba(255,255,255,0.55)" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60"
                  style={{ fontFamily: "'DM Mono', monospace" }}>Premium aluminium systems</span>
              </div>
              <h1 className="font-semibold text-white leading-[1.02] tracking-tight mb-5"
                style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(2.5rem, 6vw, 4.25rem)" }}>
                Quoted for<br />your project.
              </h1>
              <p className="text-white/80 leading-relaxed mb-8 max-w-lg"
                style={{ fontSize: "clamp(1rem, 1.4vw, 1.125rem)" }}>
                Get an indicative estimate first. A reviewed quote before any deposit.
                Supply only, across Melbourne &amp; Victoria.
              </p>

              {/* Three action cards — the card itself is the action */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {actions.map(a => (
                  <button key={a.title} onClick={() => a.onClick ? a.onClick() : go(a.page)}
                    aria-label={`${a.title} — ${a.sub}`}
                    className="group relative text-left border border-white/15 bg-white/[0.06] hover:bg-white/[0.11] hover:border-[#5A7A6A] transition-all duration-150 p-4 min-h-[116px] flex flex-col cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0a]">
                    <div className="mb-3">{a.icon}</div>
                    <div className="flex-1">
                      <p className="font-semibold text-white text-base leading-tight mb-1"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{a.title}</p>
                      <p className="text-white/60 text-sm leading-snug">{a.sub}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-white/40 group-hover:text-[#8CA99B] group-hover:translate-x-0.5 transition-all mt-3" />
                  </button>
                ))}
              </div>
            </div>

            {/* Trust strip — restrained, under the frame */}
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-white/55"
              style={{ fontFamily: "'DM Mono', monospace" }}>
              {trust.map((t, i) => (
                <span key={t} className="flex items-center gap-3">
                  {i > 0 && <span className="w-px h-3 bg-white/20" aria-hidden="true" />}
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── EXPLORE OUR SYSTEMS ────────────────────────────────────────────── */}
      <section className="relative bg-[#FAFAF9] py-20 md:py-28 overflow-hidden">
        <GhostMark size={300} opacity={0.04} pos="right-0 bottom-0" />
        <div className="max-w-6xl mx-auto px-6 relative">
          <SLabel>Systems</SLabel>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-10">
            <h2 className="font-semibold text-[#131311] leading-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.9rem, 3.4vw, 2.5rem)" }}>
              Explore our systems
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
                  <img src={s.img} alt={s.alt}
                    className="absolute inset-0 w-full h-full object-cover opacity-55 group-hover:opacity-65 group-hover:scale-[1.03] transition-all duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#131311] via-[#131311]/45 to-transparent" />
                  <div className="absolute inset-3 border border-white/12 group-hover:border-white/25 transition-colors pointer-events-none" />
                  <div className="absolute inset-0 p-6 md:p-7 flex flex-col justify-end">
                    <h3 className="text-white font-semibold mb-1.5"
                      style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.5rem, 2.6vw, 2rem)" }}>{s.title}</h3>
                    <p className="text-white/75 text-[15px] leading-snug max-w-md mb-4">{s.desc}</p>
                    {/* Chips as framed mini-tabs */}
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

      {/* ─── HOW QUOTE-TO-ORDER WORKS ──────────────────────────────────────── */}
      <section className="relative bg-white py-20 md:py-28 border-t border-black/8 overflow-hidden" style={GRID_BG}>
        <div className="max-w-6xl mx-auto px-6 relative">
          <SLabel>Process</SLabel>
          <h2 className="font-semibold text-[#131311] leading-tight mb-12"
            style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.9rem, 3.4vw, 2.5rem)" }}>
            How quote-to-order works
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0">
            {steps.map((s, i) => (
              <div key={s.n}
                className="relative border border-black/10 bg-white p-6 flex flex-col sm:[&:nth-child(n+2)]:-mt-px lg:[&:nth-child(n+2)]:mt-0 lg:[&:nth-child(n+2)]:-ml-px">
                <div className="flex items-center justify-between mb-4">
                  <span className="w-8 h-8 border border-[#5A7A6A]/40 flex items-center justify-center text-[#5A7A6A] text-xs relative"
                    style={{ fontFamily: "'DM Mono', monospace" }}>{s.n}</span>
                  <s.Icon className="w-4 h-4 text-[#5A7A6A]" />
                </div>
                <h3 className="font-semibold text-[#131311] text-base leading-tight mb-1.5"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{s.title}</h3>
                <p className="text-[#5c5a56] text-[15px] leading-relaxed">{s.body}</p>
                {/* minimal connective arrow between steps (desktop) */}
                {i < steps.length - 1 && (
                  <ChevronRight className="hidden lg:block absolute -right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A7A6A]/60 bg-white z-10" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>

          {/* Single framed note — stated once */}
          <div className="mt-4 border border-black/10 bg-[#FAFAF9] px-5 py-4 flex items-start gap-3">
            <Truck className="w-4 h-4 text-[#5A7A6A] flex-shrink-0 mt-0.5" />
            <p className="text-[15px] text-[#131311]">
              Supply only — installation is arranged by your builder or installer.
            </p>
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA BAND ────────────────────────────────────────────────── */}
      <section className="bg-[#FAFAF9] py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="relative bg-[#5A7A6A] overflow-hidden">
            <GhostMark size={220} opacity={0.08} color="#fff" pos="right-6 top-1/2 -translate-y-1/2" />
            <div className="relative px-6 sm:px-10 py-9 md:py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="flex items-start gap-4">
                <span className="hidden sm:flex w-11 h-11 border border-white/30 items-center justify-center flex-shrink-0">
                  <WindowMark size={20} color="#ffffff" />
                </span>
                <div>
                  <h2 className="text-white font-semibold mb-1"
                    style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.4rem, 2.4vw, 1.9rem)" }}>
                    Ready to price your project?
                  </h2>
                  <p className="text-white/80 text-base">
                    Start an estimate in minutes or upload your schedule to get started.
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 md:flex-shrink-0">
                <Btn variant="primary" size="lg" onClick={() => go("quote")}>
                  Start a quote <ArrowRight className="w-4 h-4" />
                </Btn>
                <Btn variant="white" size="lg" onClick={onUploadSchedule}>
                  Upload a schedule
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
function ProfilePage({ user, setPage, setUser, authLoading }: { user: AuthUser | null; setPage: (p: Page) => void; setUser: (u: AuthUser) => void; authLoading?: boolean }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [company, setCompany] = useState(user?.company ?? "");
  const [abn, setAbn] = useState(user?.abn ?? "");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    if (user) { setName(user.name); setEmail(user.email); setPhone(user.phone); setCompany(user.company); setAbn(user.abn); }
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
      <header className="mb-8">
        <SLabel>Customer account</SLabel>
        <h1 className="text-3xl md:text-4xl font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Profile settings</h1>
      </header>
      <div className="max-w-xl space-y-4">
        <div className="bg-white border border-black/8 p-5">
          <h3 className="font-semibold text-sm text-[#131311] mb-4">Personal details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><FieldLabel>Full name</FieldLabel><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div><FieldLabel>Email address</FieldLabel><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div><FieldLabel>Phone number</FieldLabel><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
          </div>
        </div>
        <div className="bg-white border border-black/8 p-5">
          <h3 className="font-semibold text-sm text-[#131311] mb-1">Business details</h3>
          <p className="text-xs text-[#5c5a56] mb-4">Used on your quotes and orders, and shown as your registration information.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><FieldLabel>Business name</FieldLabel><Input value={company} onChange={e => setCompany(e.target.value)} placeholder="ABC Constructions" /></div>
            <div><FieldLabel>ABN</FieldLabel><Input value={abn} onChange={e => setAbn(e.target.value)} placeholder="00 000 000 000" inputMode="numeric" /></div>
          </div>
        </div>
        {saveError && <p role="alert" className="text-sm text-red-700 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{saveError}</p>}
        <div>
          <Btn variant="sage" size="md" disabled={saving} onClick={saveProfile}>
            {saved ? <><Check className="w-4 h-4" />Saved</> : saving ? "Saving…" : "Save changes"}
          </Btn>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════
function AccountSettingsPage({ user, setPage, setUser, authLoading }: { user: AuthUser | null; setPage: (p: Page) => void; setUser: (u: AuthUser) => void; authLoading?: boolean }) {
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
      <header className="mb-8">
        <SLabel>Customer account</SLabel>
        <h1 className="text-3xl md:text-4xl font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Account settings</h1>
      </header>
      <div className="max-w-xl space-y-4">
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
// TRACK ORDER
// ═══════════════════════════════════════════════════════════════════════════════
function TrackOrderPage({ setPage }: { setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [step, setStep] = useState<"lookup" | "code" | "record">("lookup");
  const [ref, setRef] = useState(""); const [email, setEmail] = useState(""); const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [order, setOrder] = useState<ApiOrder | null>(null);

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

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
      const { token } = await guestTrackVerify(email.trim(), ref.trim(), code.trim());
      const rec = await guestRecord(token);
      setOrder(rec.order); setStep("record");
    } catch { setError("That code didn't match, or the details don't match an order."); }
    finally { setBusy(false); }
  };
  const reset = () => { setStep("lookup"); setCode(""); setOrder(null); setError(""); setDevCode(undefined); };

  return (
    <div className="relative min-h-screen bg-[#FAFAF9] pt-16 pb-24 overflow-hidden">
      <GhostMark size={280} opacity={0.05} pos="right-0 top-0" />
      <div className="max-w-xl mx-auto px-6 py-12 relative">
        <SLabel>Order tracking</SLabel>
        <h1 className="text-3xl font-semibold text-[#131311] mb-2"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Track your order</h1>
        <p className="text-[#5c5a56] text-sm mb-8">Enter your order reference and email. We'll send a one-time code to confirm it's you — no account required.</p>

        {step === "lookup" && (
          <div className="group relative bg-white border border-black/8 p-6 space-y-4 overflow-hidden">
            <FrameCorners size={10} color={SAGE} show="always" />
            <div><FieldLabel>Order reference</FieldLabel><Input value={ref} onChange={e => setRef(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && request()} placeholder="OF-58001" className="font-mono tracking-wide" /></div>
            <div><FieldLabel>Email address</FieldLabel><Input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && request()} placeholder="Email used on the order" /></div>
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
            <p className="text-sm text-[#5c5a56]">If <span className="text-[#131311]">{ref.trim()}</span> matches an order for <span className="text-[#131311]">{email.trim()}</span>, we've sent a 6-digit code.</p>
            <div><FieldLabel>6-digit code</FieldLabel><Input value={code} autoFocus inputMode="numeric" maxLength={6} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={e => e.key === "Enter" && verify()} placeholder="••••••" /></div>
            {devCode && <p className="text-xs text-[#5A7A6A] bg-[#5A7A6A]/8 border border-[#5A7A6A]/20 px-2 py-1.5">Dev mode — your code is <span className="font-mono font-semibold">{devCode}</span></p>}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Btn variant="sage" size="md" onClick={verify} className={`w-full justify-center ${code.length !== 6 || busy ? "opacity-50 pointer-events-none" : ""}`}>{busy ? "Checking…" : "View order"}</Btn>
            <button onClick={reset} className="text-sm text-[#5c5a56] hover:text-[#131311] cursor-pointer">← Start over</button>
          </div>
        )}

        {step === "record" && order && (
          <div>
            <button onClick={reset} className="text-xs text-[#5c5a56] hover:text-[#131311] flex items-center gap-1 cursor-pointer mb-5"><ChevronLeft className="w-3 h-3" />New search</button>
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-xl font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Order {order.orderNo}</h2>
              <span className="text-sm text-[#5c5a56]" style={{ fontFamily: "'DM Mono', monospace" }}>{order.total != null ? fmt(order.total) : ""}</span>
            </div>
            <p className="text-sm text-[#5A7A6A] mb-6">{order.stageLabel}</p>
            <OrderReadout order={order} />
            <div className="flex gap-3 mt-6">
              <Btn variant="outline" size="sm" onClick={() => go("contact")}>Contact us</Btn>
              <Btn variant="ghost" size="sm" onClick={() => go("login")}>Sign in to manage</Btn>
            </div>
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
  const quote: QuoteState = {
    items: quoteItems,
    files: quoteFiles,
    title: projectTitle,
    setTitle: setProjectTitle,
    // Assign a suggested code when none is supplied. Codes are derived from `prev`
    // (not the render snapshot) so a batch import numbers items sequentially.
    add: (i) => { const id = Date.now() + Math.floor(Math.random() * 1000); setQuoteItems(prev => [...prev, { ...i, id, code: i.code?.trim() ? i.code.trim() : suggestCode(prev, i.productSlug) }]); return id; },
    update: (id, patch) => setQuoteItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it)),
    remove: (id) => setQuoteItems(prev => prev.filter(it => it.id !== id)),
    // Duplicating keeps the item but gives it a fresh suggested code to confirm.
    copy: (id) => { const src = quoteItems.find(x => x.id === id); if (!src) return undefined; const nid = Date.now() + Math.floor(Math.random() * 1000); setQuoteItems(prev => [...prev, { ...src, id: nid, code: suggestCode(prev, src.productSlug) }]); return nid; },
    addFiles: (f) => setQuoteFiles(prev => [...prev, ...f]),
    removeFile: (id) => setQuoteFiles(prev => prev.filter(f => f.id !== id)),
  };
  // ── Persistence (M2): hydrate the anon project on load, snapshot-save on change ──
  // The client store above stays the source of truth for the UI; persistence is a
  // side-effect. Anonymous projects are keyed by an httpOnly claim cookie the Worker
  // sets on first save (see docs/customer-backend-scaffold.md).
  const hydratedRef = useRef(false);
  const skipNextSaveRef = useRef(false);
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
            id: Date.now() + i,
            code: it.code, productSlug: it.productSlug, location: it.location,
            measuredBy: it.measuredBy, width: it.width, height: it.height,
            options: it.options, qty: it.qty, status: it.status,
          })));
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
      saveLines(quoteItems, projectTitle).then(r => { if (r.project) setProjectId(r.project.id); }).catch(() => {});
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
      const saved = await saveLines(quoteItems, projectTitle);
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

  const uploadDemoScheduleFromHome = () => {
    addDemoSchedule(quote);
    navigateTo("quote");
  };

  const renderPage = () => {
    switch (page) {
      case "home":             return <HomePage setPage={navigateTo} onUploadSchedule={uploadDemoScheduleFromHome} />;
      case "products":         return <ProductsPage setPage={navigateTo} category={catCategory} family={catFamily} onSelectCategory={selectCategory} onSelectFamily={setCatFamily} onOpenProduct={openProduct} />;
      case "product-detail":   return <ProductDetailPage slug={productSlug} setPage={navigateTo} onOpenProduct={openProduct} onBack={backToFamily} quote={quote} />;
      case "quote":            return <QuotePage setPage={navigateTo} user={user} quote={quote} onSubmit={submitCurrentProject} />;
      case "how-it-works":     return <HowItWorksPage />;
      case "resources":        return <ResourcesPage setPage={navigateTo} />;
      case "contact":          return <ContactPage setPage={navigateTo} />;
      case "privacy":          return <PrivacyPolicyPage setPage={navigateTo} />;
      case "approved-quote":   return <ApprovedQuotePage />;
      case "trade":            return <TradePage setPage={navigateTo} />;
      case "admin":            return <AdminPage />;
      case "login":            return <LoginPage setPage={navigateTo} setUser={setUser} />;
      case "dashboard":
      case "quotes":
      case "orders":           return <AccountPage page={page} setPage={navigateTo} setUser={setUser} user={user} authLoading={authLoading} onOpenRecord={openRecord} />;
      case "track-order":      return <TrackOrderPage setPage={navigateTo} />;
      case "order":            return <OrderTrackingPage setPage={navigateTo} user={user} focus={focusRecord} />;
      case "profile":          return <AccountLayout page="profile" setPage={navigateTo} setUser={setUser}><ProfilePage user={user} setPage={navigateTo} setUser={setUser} authLoading={authLoading} /></AccountLayout>;
      case "account-settings": return <AccountLayout page="account-settings" setPage={navigateTo} setUser={setUser}><AccountSettingsPage user={user} setPage={navigateTo} setUser={setUser} authLoading={authLoading} /></AccountLayout>;
      default:                 return <HomePage setPage={navigateTo} onUploadSchedule={uploadDemoScheduleFromHome} />;
    }
  };

  // Per-page SEO (title, meta, Open Graph, X/Twitter) → <head>. Marketing pages
  // pull their record from Sanity; product detail uses the product's SEO;
  // app/transactional pages stay out of the index.
  const seoProps = (() => {
    if (page === "product-detail") {
      const p = getProductBySlug(productSlug);
      return {
        seo: p?.seo, title: p ? `${p.name} — OpenFrame` : "OpenFrame",
        description: p?.shortDescription, image: imageUrl(p?.heroImage, { w: 1200, h: 630 }),
      };
    }
    const marketing: Record<string, { pageId: string; title: string; noIndex?: boolean }> = {
      home: { pageId: "home", title: "OpenFrame — Aluminium Windows & Doors" },
      products: { pageId: "products", title: "Aluminium Windows & Doors — OpenFrame" },
      "how-it-works": { pageId: "how-it-works", title: "How It Works — OpenFrame" },
      contact: { pageId: "contact", title: "Contact — OpenFrame" },
      privacy: { pageId: "privacy", title: "Privacy Policy — OpenFrame", noIndex: true },
    };
    const m = marketing[page];
    if (m) {
      const pg = getPage(m.pageId);
      return { seo: pg?.seo, title: m.title, image: imageUrl(pg?.heroImage, { w: 1200, h: 630 }), noIndex: m.noIndex };
    }
    return { title: "OpenFrame", noIndex: true }; // app/transactional pages
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
      {!["home", "quote", "admin", "product-detail", "dashboard", "quotes", "orders", "profile", "account-settings"].includes(page) && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 py-3 bg-white border-t border-black/8"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <Btn variant="sage" size="md" onClick={() => navigateTo("quote")} className="w-full justify-center">Get a quote →</Btn>
        </div>
      )}
    </div>
    </GstContext.Provider>
  );
}
