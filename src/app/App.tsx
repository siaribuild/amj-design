import { useState, useEffect, useRef } from "react";
import {
  Menu, X, ArrowRight, ChevronRight, ChevronLeft, ChevronDown,
  Upload, Check, AlertCircle, Truck, FileText, Phone,
  Mail, MapPin, Plus, Minus, Info, Shield, Bot,
  MessageSquare, CheckCircle, XCircle, Download,
  User, Send, Eye, LogOut, Package, LayoutDashboard,
  Search, Lock, Key, Bell, Settings, ExternalLink
} from "lucide-react";
import { type Page, SAGE, DARK, WARM, WindowMark, GhostMark, SLabel, Btn } from "./ui";
import { ProductsPage } from "../pages/ProductsPage";
import { ProductDetailPage } from "../pages/ProductDetailPage";
import { products as catalogueProducts, type CategorySlug } from "../data/catalogue";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuthUser {
  name: string; company: string; type: "builder" | "trade" | "owner-builder";
  email: string; phone: string;
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] font-semibold text-[#3a3835] uppercase tracking-widest block mb-1.5">
      {children}
    </label>
  );
}

function Input({ value, onChange, placeholder, type = "text", className = "", defaultValue }: {
  value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string; className?: string; defaultValue?: string;
}) {
  return (
    <input type={type} value={value} defaultValue={defaultValue} onChange={onChange}
      placeholder={placeholder}
      className={`w-full border border-[#131311]/20 bg-white px-3 py-2.5 text-sm text-[#131311] placeholder-[#9a9894] focus:outline-none focus:border-[#5A7A6A] transition-colors ${className}`} />
  );
}

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

// ─── Account top bar ──────────────────────────────────────────────────────────
function AccountBar({ user, setPage, setUser }: {
  user: AuthUser; setPage: (p: Page) => void; setUser: (u: AuthUser | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const go = (p: Page) => { setPage(p); setOpen(false); window.scrollTo(0, 0); };

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-[#0e0e0c] h-8 flex items-center px-6">
      <div className="max-w-6xl mx-auto w-full flex items-center justify-between">
        <span className="text-xs text-white/40">{user.company} · {user.type}</span>
        <div className="relative" ref={ref}>
          <button onClick={() => setOpen(!open)}
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white cursor-pointer transition-colors">
            <User className="w-3 h-3" />{user.name}
            <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-black/10 shadow-lg z-10">
              {[
                [<LayoutDashboard className="w-3.5 h-3.5" />, "My dashboard", "dashboard" as Page],
                [<User className="w-3.5 h-3.5" />, "My profile", "profile" as Page],
                [<Settings className="w-3.5 h-3.5" />, "Account settings", "account-settings" as Page],
              ].map(([icon, label, page]) => (
                <button key={label as string} onClick={() => go(page as Page)}
                  className="w-full text-left px-3 py-2 text-sm text-[#131311] hover:bg-[#FAFAF9] flex items-center gap-2 cursor-pointer">
                  <span className="text-[#5A7A6A]">{icon as React.ReactNode}</span>{label as string}
                </button>
              ))}
              <div className="border-t border-black/8 my-1" />
              <button onClick={() => { setUser(null); setOpen(false); go("home"); }}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer">
                <LogOut className="w-3.5 h-3.5" />Sign out
              </button>
            </div>
          )}
        </div>
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
  const topOffset = user ? 32 : 0;

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
  const heroPage = page === "home" || page === "products" || page === "product-detail";
  const transparent = heroPage && !scrolled;

  return (
    <>
      <header className={`fixed left-0 right-0 z-50 ${transparent ? "bg-transparent border-b border-transparent" : "bg-[#0c0c0a] border-b border-white/10 shadow-sm shadow-black/20"}`}
        style={{ top: topOffset }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <button onClick={() => go("home")} className="flex items-center gap-2.5 cursor-pointer flex-shrink-0">
            <WindowMark size={18} color="#f5f3ef" />
            <span className="font-semibold text-[15px] tracking-tight text-white"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>AMJ Trade Direct</span>
          </button>
          <nav className="hidden md:flex items-center gap-6 flex-1 justify-center">
            {links.map(([label, p]) => (
              <button key={p} onClick={() => go(p)}
                aria-current={isActive(p) ? "page" : undefined}
                className={`text-sm transition-colors relative ${isActive(p) ? "text-white font-semibold" : "text-white/70 hover:text-white"}`}>
                {label}
                {isActive(p) && <div className="absolute -bottom-0.5 left-0 right-0 h-px bg-[#5A7A6A]" />}
              </button>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-3 flex-shrink-0">
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
            <Btn variant="sage" size="sm" onClick={() => go("quote")}>Get a quote</Btn>
          </div>
          <button className="md:hidden p-1.5 text-white" onClick={() => setOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Backdrop */}
      <div className={`fixed inset-0 z-[55] bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 md:hidden ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={() => setOpen(false)} />

      {/* Slide-out panel */}
      <div className="fixed top-0 right-0 h-full z-[56] bg-white flex flex-col transition-transform duration-300 ease-out md:hidden overflow-y-auto"
        style={{ width: "min(80vw, 400px)", transform: open ? "translateX(0)" : "translateX(100%)", top: topOffset }}>
        <div className="flex items-center justify-between px-5 h-16 border-b border-black/8 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <WindowMark size={16} color={SAGE} />
            <span className="font-semibold text-sm text-[#131311]"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Menu</span>
          </div>
          <button onClick={() => setOpen(false)} className="p-1 text-[#5c5a56] cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-2">
          {links.map(([l, p]) => (
            <button key={p} onClick={() => go(p)}
              aria-current={isActive(p) ? "page" : undefined}
              className={`w-full text-left px-5 py-4 border-b border-black/6 text-base transition-colors flex items-center justify-between
                ${isActive(p) ? "text-[#131311] font-semibold bg-[#FAFAF9]" : "text-[#131311] hover:bg-[#FAFAF9]"}`}>
              {l}
              {isActive(p) && <WindowMark size={10} color={SAGE} />}
            </button>
          ))}

          {/* CTA right after nav links */}
          <div className="px-5 pt-4 pb-2">
            <Btn variant="sage" size="md" onClick={() => go("quote")} className="w-full justify-center">
              Get a quote <ArrowRight className="w-4 h-4" />
            </Btn>
          </div>

          <div className="border-t border-black/8 mt-2 pt-2">
            {user ? (
              <>
                <button onClick={() => go("dashboard")}
                  className="w-full text-left px-5 py-3.5 text-sm text-[#5A7A6A] hover:bg-[#FAFAF9] flex items-center gap-2 cursor-pointer">
                  <LayoutDashboard className="w-4 h-4" />My dashboard
                </button>
                <button onClick={() => go("profile")}
                  className="w-full text-left px-5 py-3.5 text-sm text-[#5c5a56] hover:bg-[#FAFAF9] flex items-center gap-2 cursor-pointer">
                  <User className="w-4 h-4" />My profile
                </button>
                <button onClick={() => { setUser(null); setOpen(false); go("home"); }}
                  className="w-full text-left px-5 py-3.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer">
                  <LogOut className="w-4 h-4" />Sign out
                </button>
              </>
            ) : (
              <button onClick={() => go("login")}
                className="w-full text-left px-5 py-3.5 text-sm text-[#5c5a56] hover:bg-[#FAFAF9] flex items-center gap-2 cursor-pointer">
                <Lock className="w-4 h-4" />Sign in / Register
              </button>
            )}
            <button onClick={() => go("track-order")}
              className="w-full text-left px-5 py-3.5 text-sm text-[#5c5a56] hover:bg-[#FAFAF9] flex items-center gap-2 cursor-pointer">
              <Package className="w-4 h-4" />Track an order
            </button>
          </div>
        </nav>

        <div className="px-5 py-4 border-t border-black/8 flex-shrink-0 bg-[#FAFAF9]">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5c5a56] mb-2">Contact us</p>
          <a href="tel:0390000000" className="flex items-center gap-2 text-sm text-[#131311] font-medium mb-1.5 hover:text-[#5A7A6A] transition-colors">
            <Phone className="w-4 h-4 text-[#5A7A6A]" />(03) 9000 0000
          </a>
          <a href="mailto:quotes@amjtradedirect.com.au" className="flex items-center gap-2 text-sm text-[#131311] hover:text-[#5A7A6A] transition-colors">
            <Mail className="w-4 h-4 text-[#5A7A6A]" />quotes@amjtradedirect.com.au
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
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>AMJ Trade Direct</span>
            </div>
            <p className="text-sm leading-relaxed mb-5">
              Aluminium windows and doors supplied direct for Melbourne projects. Supply only — installation not included.
            </p>
            <div className="text-sm space-y-2">
              <a href="tel:0390000000" className="flex items-center gap-2 hover:text-white transition-colors">
                <Phone className="w-3.5 h-3.5 text-[#5A7A6A]" />(03) 9000 0000
              </a>
              <a href="mailto:quotes@amjtradedirect.com.au" className="flex items-center gap-2 hover:text-white transition-colors">
                <Mail className="w-3.5 h-3.5 text-[#5A7A6A]" />quotes@amjtradedirect.com.au
              </a>
              <span className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#5A7A6A]" />Melbourne &amp; Victoria
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 text-sm">
            {[
              { h: "Products", ls: [["Windows", "products"], ["Doors", "products"], ["Product detail", "product-detail"]] },
              { h: "Service",  ls: [["Get a quote", "quote"], ["Trade account", "trade"], ["How it works", "how-it-works"]] },
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
          <span>© 2025 AMJ Trade Direct · Melbourne, Victoria · ABN 00 000 000 000</span>
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

function HomePage({ setPage }: { setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };

  // Task-led entry points — same three actions on hero and final band.
  const actions: { title: string; sub: string; icon: React.ReactNode; page: Page }[] = [
    { title: "Build an estimate", sub: "Enter dimensions and options",              icon: <IconEstimate />, page: "quote" },
    { title: "Upload a schedule", sub: "Send plans or a schedule for review",       icon: <IconUpload />,   page: "quote" },
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
        <img src={IMG.hero}
          alt="Aluminium-framed sliding doors on a modern Melbourne home at dusk, warm interior light behind dark cladding"
          className="absolute inset-0 w-full h-full object-cover opacity-80" />
        {/* Contrast overlay — concentrated on the left behind the content frame,
            easing to ~20% by a quarter across so the image reads clearly */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(12,12,10,0.85) 0%, rgba(12,12,10,0.5) 12%, rgba(12,12,10,0.2) 27%, rgba(12,12,10,0.12) 60%, rgba(12,12,10,0.1) 100%)" }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0a]/40 via-transparent to-transparent" />
        {/* Mullion grid motif (hero frame rectangle removed) */}
        <div className="absolute top-4 bottom-4 md:top-8 md:bottom-8 left-1/3 w-px bg-white/[0.07] pointer-events-none hidden lg:block" />
        <div className="absolute top-4 bottom-4 md:top-8 md:bottom-8 left-2/3 w-px bg-white/[0.07] pointer-events-none hidden lg:block" />

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
                  <button key={a.title} onClick={() => go(a.page)}
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
                <Btn variant="white" size="lg" onClick={() => go("quote")}>
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
// CPQ QUOTE MODEL — shared product data, pricing and quote state
// ═══════════════════════════════════════════════════════════════════════════════

interface QItem {
  id: number;
  productId: string;
  location: string;
  width: string;   // mm
  height: string;  // mm
  configId: string;
  options: Record<string, string>;
  qty: number;
  status: "Ready" | "Needs review";
}
interface QFile { id: number; name: string; kind: string; status: "Uploaded" | "Processing" }
interface QuoteState {
  items: QItem[];
  files: QFile[];
  add: (i: Omit<QItem, "id">) => number;
  update: (id: number, patch: Partial<QItem>) => void;
  remove: (id: number) => void;
  copy: (id: number) => void;
  addFiles: (f: QFile[]) => void;
  removeFile: (id: number) => void;
}

type Choice = { value: string; add?: number };
type OptionGroup = { id: string; label: string; required?: boolean; advanced?: boolean; helper?: string; choices: Choice[] };
type ConfigDef = { id: string; name: string; panels: number; mult: number; note: string; minW?: number; maxW?: number };
type ProductDef = {
  id: string; name: string; cat: "Windows" | "Doors"; wide: boolean; common?: boolean;
  wMin: number; wMax: number; hMin: number; hMax: number; base: number;
  configs: ConfigDef[]; options: OptionGroup[];
};

const COLOURS: Choice[] = [{ value: "Satin Black" }, { value: "Woodland Grey" }, { value: "Surf Mist" }, { value: "Monument" }, { value: "Paperbark" }, { value: "Custom colour", add: 180 }];
const GLASS: Choice[] = [{ value: "4mm clear toughened" }, { value: "Double glaze", add: 140 }, { value: "Double glaze LowE", add: 240 }, { value: "Obscure", add: 90 }];
const FLY: Choice[] = [{ value: "None" }, { value: "Standard flyscreen", add: 85 }, { value: "Fine / midge mesh", add: 120 }];
const HW: Choice[] = [{ value: "Standard" }, { value: "Black finish", add: 40 }, { value: "Premium", add: 160 }];
const REVEAL: Choice[] = [{ value: "None" }, { value: "90 mm reveal", add: 60 }, { value: "138 mm reveal", add: 90 }];
const colour = (): OptionGroup => ({ id: "colour", label: "Frame colour", required: true, choices: COLOURS });
const glass = (): OptionGroup => ({ id: "glass", label: "Glass", required: true, choices: GLASS });
const fly = (): OptionGroup => ({ id: "flyscreen", label: "Flyscreen", choices: FLY });
const hw = (): OptionGroup => ({ id: "hardware", label: "Hardware", choices: HW });
const reveal = (): OptionGroup => ({ id: "reveal", label: "Reveal / frame detail", advanced: true, choices: REVEAL });
const handing = (choices: string[]): OptionGroup => ({ id: "handing", label: "Opening / handing", required: true, choices: choices.map(v => ({ value: v })) });

const PRODUCTS: ProductDef[] = [
  {
    id: "sliding-window", name: "Sliding Window", cat: "Windows", wide: true, common: true,
    wMin: 600, wMax: 3600, hMin: 450, hMax: 2100, base: 620,
    configs: [
      { id: "sw2", name: "2 panel", panels: 2, mult: 1.0, note: "One fixed pane, one sliding sash", minW: 600, maxW: 1800 },
      { id: "sw3", name: "3 panel", panels: 3, mult: 1.15, note: "Two sliding sashes, centre fixed", minW: 1800, maxW: 3600 },
    ],
    options: [colour(), glass(), handing(["Left sliding", "Right sliding"]), fly(), hw()],
  },
  {
    id: "awning-window", name: "Awning Window", cat: "Windows", wide: false, common: true,
    wMin: 400, wMax: 2400, hMin: 400, hMax: 1800, base: 700,
    configs: [
      { id: "aw1", name: "Single", panels: 1, mult: 1.0, note: "Top-hinged, winds outward", maxW: 1200 },
      { id: "aw2", name: "Double", panels: 2, mult: 1.15, note: "Two awning sashes side by side", minW: 1000, maxW: 2400 },
    ],
    options: [colour(), glass(), fly(), hw()],
  },
  {
    id: "casement-window", name: "Casement Window", cat: "Windows", wide: false,
    wMin: 400, wMax: 2400, hMin: 500, hMax: 2100, base: 720,
    configs: [
      { id: "cw1", name: "Single", panels: 1, mult: 1.0, note: "Side-hinged, opens outward", maxW: 900 },
      { id: "cw2", name: "Double", panels: 2, mult: 1.15, note: "Two casement sashes", minW: 800, maxW: 2400 },
    ],
    options: [colour(), glass(), handing(["Left hinged", "Right hinged"]), fly(), hw()],
  },
  {
    id: "fixed-window", name: "Fixed Window", cat: "Windows", wide: true,
    wMin: 300, wMax: 3000, hMin: 300, hMax: 2400, base: 480,
    configs: [{ id: "fw1", name: "Fixed", panels: 1, mult: 1.0, note: "Non-opening picture window" }],
    options: [colour(), glass(), reveal()],
  },
  {
    id: "sliding-door", name: "Sliding Door", cat: "Doors", wide: true, common: true,
    wMin: 1500, wMax: 7200, hMin: 1800, hMax: 2700, base: 950,
    configs: [
      { id: "sd2", name: "2 panel", panels: 2, mult: 1.0, note: "One sliding, one fixed panel", minW: 1500, maxW: 3600 },
      { id: "sd3", name: "3 panel", panels: 3, mult: 1.12, note: "Centre or end sliding", minW: 2400, maxW: 5400 },
      { id: "sd4", name: "4 panel", panels: 4, mult: 1.25, note: "Two sliding, two fixed", minW: 3200, maxW: 7200 },
      { id: "sdS", name: "Stacker", panels: 4, mult: 1.45, note: "Panels stack behind for a wide clear opening", minW: 3000, maxW: 7200 },
    ],
    options: [colour(), glass(), handing(["Slides left", "Slides right"]), fly(), hw(), reveal()],
  },
  {
    id: "bifold-door", name: "Bifold Door", cat: "Doors", wide: true, common: true,
    wMin: 1800, wMax: 6000, hMin: 1980, hMax: 2700, base: 1250,
    configs: [
      { id: "bf3", name: "3 leaf", panels: 3, mult: 1.0, note: "2 fold + 1 swing", minW: 1800, maxW: 2700 },
      { id: "bf4", name: "4 leaf", panels: 4, mult: 1.1, note: "Even stack, no swing door", minW: 2400, maxW: 3600 },
      { id: "bf5", name: "5 leaf", panels: 5, mult: 1.2, note: "4 fold + 1 swing", minW: 3000, maxW: 4500 },
      { id: "bf6", name: "6 leaf", panels: 6, mult: 1.3, note: "Even stack both sides", minW: 3600, maxW: 6000 },
    ],
    options: [colour(), glass(), handing(["Stack left", "Stack right", "Split stack"]), fly(), hw()],
  },
  {
    id: "hinged-door", name: "Hinged Door", cat: "Doors", wide: false,
    wMin: 820, wMax: 1800, hMin: 2040, hMax: 2400, base: 1100,
    configs: [
      { id: "hd1", name: "Single", panels: 1, mult: 1.0, note: "Single leaf", maxW: 1020 },
      { id: "hd2", name: "Double (French)", panels: 2, mult: 1.4, note: "Pair of leaves", minW: 1500, maxW: 1800 },
    ],
    options: [colour(), glass(), handing(["Left hung, inswing", "Right hung, inswing", "Left hung, outswing", "Right hung, outswing"]), hw()],
  },
  {
    id: "pivot-door", name: "Pivot Door", cat: "Doors", wide: false,
    wMin: 1000, wMax: 1400, hMin: 2100, hMax: 2700, base: 1600,
    configs: [{ id: "pv1", name: "Single", panels: 1, mult: 1.0, note: "Centre or offset pivot" }],
    options: [colour(), glass(), handing(["Centre pivot", "Offset pivot"]), hw()],
  },
];
const PRODUCT_MAP: Record<string, ProductDef> = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));

function configsFor(p: ProductDef | undefined, w: number, h: number): ConfigDef[] {
  if (!p || !w || !h) return [];
  const valid = p.configs.filter(c => (c.minW == null || w >= c.minW) && (c.maxW == null || w <= c.maxW));
  return valid
    .map(c => ({ c, fit: Math.abs(((c.minW ?? p.wMin) + (c.maxW ?? p.wMax)) / 2 - w) }))
    .sort((a, b) => a.fit - b.fit)
    .slice(0, 3)
    .map(x => x.c);
}
function productsFitting(w: number, h: number): ProductDef[] {
  if (!w || !h) return [];
  return PRODUCTS.filter(p => w >= p.wMin && w <= p.wMax && h >= p.hMin && h <= p.hMax && configsFor(p, w, h).length > 0);
}
function priceItem(it: { productId: string; width: string; height: string; configId: string; options: Record<string, string>; qty: number }) {
  const p = PRODUCT_MAP[it.productId];
  const w = parseInt(it.width) || 0, h = parseInt(it.height) || 0;
  const cfg = p?.configs.find(c => c.id === it.configId);
  const missing: string[] = [];
  if (!it.productId) missing.push("product");
  if (!w) missing.push("width");
  if (!h) missing.push("height");
  if (p && w && h && !cfg) missing.push("a configuration");
  if (p) for (const g of p.options) if (g.required && !it.options[g.id]) missing.push(g.label.toLowerCase());
  if (!p || !cfg || !w || !h) return { unit: 0, total: 0, ok: false, missing };
  const area = (w * h) / 1_000_000;
  let unit = area * p.base * cfg.mult;
  for (const g of p.options) { const ch = g.choices.find(c => c.value === it.options[g.id]); if (ch?.add) unit += ch.add; }
  unit = Math.round(unit / 10) * 10;
  return { unit, total: unit * it.qty, ok: missing.length === 0, missing };
}
const fmt = (n: number) => `$${n.toLocaleString("en-AU")}`;
const mm = (v: string) => v ? `${parseInt(v).toLocaleString("en-AU")} mm` : "—";
const productName = (id: string) => PRODUCT_MAP[id]?.name ?? "Product";
const configName = (pid: string, cid: string) => PRODUCT_MAP[pid]?.configs.find(c => c.id === cid)?.name ?? "—";

// ─── Persistent product-frame diagram — responds to entered aspect ratio ──────
function FrameDiagram({ productId, configId, w, h, tone = "sage" }: { productId: string; configId?: string; w: number; h: number; tone?: "sage" | "light" }) {
  const ratio = (w > 0 && h > 0) ? Math.min(2.6, Math.max(0.32, w / h)) : 1.45;
  const MAXW = 208, MAXH = 150;
  let bw: number, bh: number;
  if (ratio >= 1) { bw = MAXW; bh = MAXW / ratio; if (bh > MAXH) { bh = MAXH; bw = MAXH * ratio; } }
  else { bh = MAXH; bw = MAXH * ratio; if (bw > MAXW) { bw = MAXW; bh = MAXW / ratio; } }
  const p = PRODUCT_MAP[productId];
  const cfg = p?.configs.find(c => c.id === configId);
  const panels = Math.max(1, cfg?.panels ?? 2);
  const stroke = tone === "sage" ? "#5A7A6A" : "rgba(255,255,255,0.5)";
  const faint = tone === "sage" ? "rgba(90,122,106,0.28)" : "rgba(255,255,255,0.22)";
  return (
    <div className="flex items-end justify-center" style={{ minHeight: MAXH + 26 }} aria-hidden="true">
      <div className="relative" style={{ width: bw, height: bh }}>
        {/* height indicator */}
        <div className="absolute -left-6 top-0 bottom-0 flex flex-col items-center justify-center">
          <div className="w-px flex-1" style={{ background: faint }} />
          <span className="text-[9px] rotate-180 my-1" style={{ writingMode: "vertical-rl", color: stroke, fontFamily: "'DM Mono', monospace" }}>H</span>
          <div className="w-px flex-1" style={{ background: faint }} />
        </div>
        {/* frame */}
        <div className="absolute inset-0 flex gap-[3px] p-[3px] border-2" style={{ borderColor: stroke, background: tone === "sage" ? "rgba(90,122,106,0.05)" : "rgba(255,255,255,0.04)" }}>
          {Array.from({ length: Math.min(panels, 6) }).map((_, i) => (
            <div key={i} className="flex-1 border relative" style={{ borderColor: faint }}>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-px" style={{ background: faint }} />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-px" style={{ background: faint }} />
            </div>
          ))}
        </div>
        {/* width indicator */}
        <div className="absolute -bottom-6 left-0 right-0 flex items-center justify-center gap-1">
          <div className="h-px flex-1" style={{ background: faint }} />
          <span className="text-[9px]" style={{ color: stroke, fontFamily: "'DM Mono', monospace" }}>W</span>
          <div className="h-px flex-1" style={{ background: faint }} />
        </div>
      </div>
    </div>
  );
}

// ─── One expanding item composer — shared by quote-builder and product page ───
function ItemComposer({ quote, initialProductId, seed, editId, onAdded, onCancel, embedded = false, onLive }: {
  quote: QuoteState;
  initialProductId?: string;
  seed?: Partial<QItem> | null;
  editId?: number | null;
  onAdded: (built: Omit<QItem, "id">) => void;
  onCancel?: () => void;
  embedded?: boolean;
  onLive?: (s: { unit: number; ok: boolean; add: () => void; hasProduct: boolean }) => void;
}) {
  const lockedProduct = !!initialProductId;
  const [productId, setProductId] = useState(initialProductId || seed?.productId || "");
  const [location, setLocation] = useState(seed?.location || "");
  const [width, setWidth] = useState(seed?.width || "");
  const [height, setHeight] = useState(seed?.height || "");
  const [configId, setConfigId] = useState(seed?.configId || "");
  const [options, setOptions] = useState<Record<string, string>>(seed?.options ? { ...seed.options } : {});
  const [qty, setQty] = useState(seed?.qty || 1);
  const [reviewRequested, setReviewRequested] = useState(false);

  const [editProduct, setEditProduct] = useState(false);
  const [editDims, setEditDims] = useState(false);
  const [editConfig, setEditConfig] = useState(false);
  const [openOpt, setOpenOpt] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const p = PRODUCT_MAP[productId];
  const w = parseInt(width) || 0, h = parseInt(height) || 0;
  const dimsEntered = w > 0 && h > 0;
  const inRange = !!p && w >= p.wMin && w <= p.wMax && h >= p.hMin && h <= p.hMax;
  const validCfgs = configsFor(p, w, h);
  const incompatible = !!p && dimsEntered && (!inRange || validCfgs.length === 0) && !reviewRequested;
  const dimsValid = !!p && dimsEntered && inRange && validCfgs.length > 0;
  const reversed = !!p && p.wide && w > 0 && h > 0 && h > w && !reviewRequested;

  const priced = priceItem({ productId, width, height, configId, options, qty });
  const built: Omit<QItem, "id"> = { productId, location, width, height, configId, options, qty, status: reviewRequested ? "Needs review" : "Ready" };
  const canAdd = reviewRequested ? !!(productId && dimsEntered) : priced.ok;

  const doAdd = () => { if (canAdd) onAdded(built); };
  useEffect(() => { onLive?.({ unit: priced.unit, ok: canAdd, add: doAdd, hasProduct: !!productId }); });

  const pickProduct = (id: string) => {
    setProductId(id); setConfigId(""); setOptions({}); setEditProduct(false); setReviewRequested(false);
    setEditDims(true); setEditConfig(false);
  };
  const commitConfig = (id: string) => { setConfigId(id); setEditConfig(false); setEditDims(false); };
  const setOpt = (g: string, v: string) => { setOptions(o => ({ ...o, [g]: v })); setOpenOpt(null); };

  const grouped = { Windows: PRODUCTS.filter(x => x.cat === "Windows"), Doors: PRODUCTS.filter(x => x.cat === "Doors") };
  const showProductFull = !lockedProduct && (!productId || editProduct);
  const showDimsFull = !!p && (editDims || !configId || !dimsValid);
  const showConfigFull = !!p && dimsValid && (editConfig || !configId);
  const showOptions = !!p && dimsValid && !!configId;
  const advanced = (p?.options || []).filter(g => g.advanced);
  const basic = (p?.options || []).filter(g => !g.advanced);

  const SummaryRow = ({ label, value, onEdit, warn }: { label: string; value: string; onEdit: () => void; warn?: boolean }) => (
    <button onClick={onEdit} className={`w-full flex items-center justify-between gap-3 border px-4 py-3 text-left transition-colors cursor-pointer ${warn ? "border-amber-300 bg-amber-50" : "border-black/10 bg-white hover:border-[#5A7A6A]/50"}`}>
      <span className="min-w-0"><span className="text-[10px] uppercase tracking-widest text-[#5c5a56] block">{label}</span><span className="text-sm text-[#131311] font-medium truncate block">{value}</span></span>
      <span className="text-xs font-medium text-[#5A7A6A] flex-shrink-0">Change</span>
    </button>
  );

  return (
    <div className="border border-black/10 bg-white">
      <div className="px-5 md:px-6 py-5 space-y-3">
        {/* 1 — PRODUCT */}
        {showProductFull ? (
          <div>
            <p className="font-semibold text-[#131311] mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>What would you like to add?</p>
            {(["Windows", "Doors"] as const).map(cat => (
              <div key={cat} className="mb-3">
                <p className="text-[10px] uppercase tracking-widest text-[#5c5a56] mb-2">{cat}</p>
                <div className="grid grid-cols-2 gap-2">
                  {grouped[cat].map(op => (
                    <button key={op.id} onClick={() => pickProduct(op.id)}
                      className="group flex items-center gap-3 border border-black/10 bg-white hover:border-[#5A7A6A] px-3 py-3 text-left transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A]">
                      <span className="w-9 h-9 border border-[#5A7A6A]/30 flex items-center justify-center flex-shrink-0"><WindowMark size={16} color={SAGE} /></span>
                      <span className="min-w-0"><span className="text-sm font-medium text-[#131311] block truncate">{op.name}</span><span className="text-[11px] text-[#5c5a56]">{(op.wMin / 1000).toFixed(1)}–{(op.wMax / 1000).toFixed(1)} m wide</span></span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {productId && <button onClick={() => setEditProduct(false)} className="text-xs text-[#5c5a56] hover:text-[#131311] underline underline-offset-2 cursor-pointer">Cancel</button>}
          </div>
        ) : p && (
          <SummaryRow label="Product" value={p.name} onEdit={() => { if (!lockedProduct) setEditProduct(true); }} />
        )}

        {/* 2 — DIMENSIONS (approved UX) */}
        {p && (showDimsFull ? (
          <div className="border border-black/10 bg-[#FAFAF9] p-4 md:p-5">
            <div className="flex flex-col md:flex-row gap-5">
              <div className="md:w-56 flex-shrink-0"><FrameDiagram productId={productId} configId={configId} w={w} h={h} /></div>
              <div className="flex-1 space-y-3">
                <div>
                  <FieldLabel>Width — horizontal (mm)</FieldLabel>
                  <Input type="number" value={width} onChange={e => setWidth(e.target.value)} placeholder="e.g. 1810" />
                </div>
                <div>
                  <FieldLabel>Height — vertical (mm)</FieldLabel>
                  <Input type="number" value={height} onChange={e => setHeight(e.target.value)} placeholder="e.g. 1210" />
                </div>
                {dimsEntered && (
                  <p className="text-sm text-[#131311]"><Check className="w-3.5 h-3.5 inline text-[#5A7A6A] mr-1" />You have entered: <span className="font-medium">{mm(width)} wide × {mm(height)} high</span></p>
                )}
                {reversed && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-800">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
                    <span>Height is greater than width — for a {p.name.toLowerCase()} these look reversed. <button onClick={() => { setWidth(height); setHeight(width); }} className="underline font-medium cursor-pointer">Swap width &amp; height</button></span>
                  </div>
                )}
              </div>
            </div>
            {configId && dimsValid && <div className="mt-3 flex justify-end"><Btn variant="sage" size="sm" onClick={() => setEditDims(false)}>Done</Btn></div>}
          </div>
        ) : (
          <SummaryRow label="Dimensions" value={`Width ${mm(width)}; Height ${mm(height)}`} onEdit={() => setEditDims(true)} />
        ))}

        {/* Incompatible dimensions */}
        {incompatible && (
          <div className="border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900 flex items-center gap-1.5 mb-1"><AlertCircle className="w-4 h-4 text-amber-600" />{p.name} isn't available at {mm(width)} × {mm(height)}</p>
            <p className="text-xs text-amber-800 mb-3">Typical range is {mm(String(p.wMin))}–{mm(String(p.wMax))} wide and {mm(String(p.hMin))}–{mm(String(p.hMax))} high.</p>
            <div className="flex flex-wrap gap-2">
              <Btn variant="outline" size="sm" onClick={() => setEditDims(true)}>Change dimensions</Btn>
              {productsFitting(w, h).length > 0 && (
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-amber-800">Fits:</span>
                  {productsFitting(w, h).slice(0, 3).map(fitP => (
                    <button key={fitP.id} onClick={() => { setProductId(fitP.id); setConfigId(""); setOptions({}); setReviewRequested(false); }}
                      className="text-xs border border-amber-400 bg-white px-2 py-1 hover:border-amber-600 cursor-pointer">{fitP.name}</button>
                  ))}
                </div>
              )}
              <Btn variant="ghost" size="sm" onClick={() => setReviewRequested(true)}>Request technical review</Btn>
            </div>
          </div>
        )}

        {reviewRequested && (
          <div className="border border-[#5A7A6A]/30 bg-[#5A7A6A]/5 px-4 py-3 text-xs text-[#131311] flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-[#5A7A6A]" />Flagged for technical review — our team will confirm a workable size and price. <button onClick={() => setReviewRequested(false)} className="underline text-[#5A7A6A] cursor-pointer">Undo</button>
          </div>
        )}

        {/* 3 — CONFIGURATION */}
        {showConfigFull && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#5c5a56] mb-2">Compatible configurations</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {validCfgs.map(c => {
                const delta = priceItem({ productId, width, height, configId: c.id, options: {}, qty: 1 }).unit
                  - priceItem({ productId, width, height, configId: validCfgs[0].id, options: {}, qty: 1 }).unit;
                const sel = configId === c.id;
                return (
                  <button key={c.id} onClick={() => commitConfig(c.id)}
                    className={`text-left border p-3 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A] ${sel ? "border-[#5A7A6A] bg-[#5A7A6A]/5" : "border-black/10 bg-white hover:border-[#5A7A6A]/50"}`}>
                    <div className="h-16 mb-2 flex items-end"><div className="w-full"><FrameDiagram productId={productId} configId={c.id} w={w} h={h} /></div></div>
                    <p className="text-sm font-medium text-[#131311]">{c.name}</p>
                    <p className="text-[11px] text-[#5c5a56] leading-snug mt-0.5">{c.note}</p>
                    <p className="text-[11px] text-[#5A7A6A] mt-1" style={{ fontFamily: "'DM Mono', monospace" }}>{delta === 0 ? "base" : delta > 0 ? `+${fmt(delta)}` : fmt(delta)}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {p && dimsValid && configId && !showConfigFull && (
          <SummaryRow label="Configuration" value={configName(productId, configId)} onEdit={() => setEditConfig(true)} />
        )}

        {/* 4 — OPTIONS */}
        {showOptions && (
          <div className="space-y-2 pt-1">
            {basic.map(g => {
              const val = options[g.id];
              const open = openOpt === g.id;
              const need = g.required && !val;
              return (
                <div key={g.id} className={`border ${need ? "border-amber-300" : "border-black/10"}`}>
                  <button onClick={() => setOpenOpt(open ? null : g.id)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left cursor-pointer bg-white">
                    <span className="min-w-0"><span className="text-[10px] uppercase tracking-widest text-[#5c5a56] block">{g.label}{g.required && <span className="text-amber-600"> ·required</span>}</span>
                      <span className={`text-sm font-medium truncate block ${val ? "text-[#131311]" : "text-[#9a9894]"}`}>{val || "Select…"}</span></span>
                    <ChevronDown className={`w-4 h-4 text-[#5c5a56] flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <div className="px-4 pb-3 pt-1 flex flex-wrap gap-1.5 border-t border-black/6">
                      {g.choices.map(c => (
                        <button key={c.value} onClick={() => setOpt(g.id, c.value)}
                          className={`text-xs px-3 py-1.5 border transition-colors cursor-pointer ${val === c.value ? "border-[#131311] bg-[#131311] text-white" : "border-black/15 bg-white text-[#131311] hover:border-[#5A7A6A]"}`}>
                          {c.value}{c.add ? <span className="opacity-60"> +{fmt(c.add)}</span> : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {advanced.length > 0 && (
              <div>
                <button onClick={() => setShowAdvanced(s => !s)} className="text-xs text-[#5c5a56] hover:text-[#131311] flex items-center gap-1 cursor-pointer py-1">
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />Additional options
                </button>
                {showAdvanced && advanced.map(g => (
                  <div key={g.id} className="border border-black/10 mt-2">
                    <div className="px-4 py-3">
                      <span className="text-[10px] uppercase tracking-widest text-[#5c5a56] block mb-2">{g.label}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {g.choices.map(c => (
                          <button key={c.value} onClick={() => setOpt(g.id, c.value)}
                            className={`text-xs px-3 py-1.5 border transition-colors cursor-pointer ${options[g.id] === c.value ? "border-[#131311] bg-[#131311] text-white" : "border-black/15 bg-white text-[#131311] hover:border-[#5A7A6A]"}`}>
                            {c.value}{c.add ? <span className="opacity-60"> +{fmt(c.add)}</span> : ""}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quantity + location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <FieldLabel>Quantity — identical units</FieldLabel>
                <div className="flex items-center border border-[#131311]/20 h-[44px] w-full">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-12 h-full flex items-center justify-center text-[#5c5a56] hover:bg-[#FAFAF9] cursor-pointer"><Minus className="w-4 h-4" /></button>
                  <span className="flex-1 text-center text-sm font-medium">{qty}</span>
                  <button onClick={() => setQty(q => q + 1)} className="w-12 h-full flex items-center justify-center text-[#5c5a56] hover:bg-[#FAFAF9] cursor-pointer"><Plus className="w-4 h-4" /></button>
                </div>
              </div>
              <div>
                <FieldLabel>Location / room (optional)</FieldLabel>
                <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Living room, north" />
              </div>
            </div>
            <p className="text-[11px] text-[#5c5a56]"><Info className="w-3 h-3 inline mr-1" />Quantity means every unit on this line is identical. For a different size or handing, add a separate item.</p>
          </div>
        )}
      </div>

      {/* PRICE + ACTION */}
      {p && (
        <div className={`border-t border-black/10 bg-white px-5 md:px-6 py-4 ${embedded ? "" : "md:static sticky bottom-0 z-20"}`} style={{ paddingBottom: embedded ? undefined : "max(16px, env(safe-area-inset-bottom))" }}>
          {!canAdd && priced.missing.length > 0 && !reviewRequested && (
            <p className="text-xs text-amber-800 mb-2 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />To add this item: {priced.missing.join(", ")}.</p>
          )}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#5c5a56]">Indicative estimate</p>
              {reviewRequested
                ? <p className="text-lg font-semibold text-[#5A7A6A]" style={{ fontFamily: "'DM Mono', monospace" }}>Pending review</p>
                : <p className="text-lg font-semibold text-[#131311]" style={{ fontFamily: "'DM Mono', monospace" }}>{priced.unit ? `${fmt(priced.total)}` : "—"} <span className="text-xs font-normal text-[#5c5a56]">inc GST{qty > 1 ? ` · ${fmt(priced.unit)} ea` : ""}</span></p>}
            </div>
            <div className="flex items-center gap-2">
              {onCancel && <Btn variant="ghost" size="md" onClick={onCancel}>Cancel</Btn>}
              <Btn variant="sage" size="md" onClick={doAdd} disabled={!canAdd}>{editId ? "Save changes" : "Add to MyProject"} <Plus className="w-4 h-4" /></Btn>
            </div>
          </div>
          <p className="text-[10px] text-[#5c5a56] mt-1.5">Indicative only — not a final price. Reviewed quote issued before any deposit. Supply only.</p>
        </div>
      )}
    </div>
  );
}

// ─── MyProject — multi-item schedule (desktop table / mobile cards) ───────────
function MyProjectView({ quote, onEdit, onAdd, onUpload, onReview }: {
  quote: QuoteState; onEdit: (id: number) => void; onAdd: () => void; onUpload: () => void; onReview: () => void;
}) {
  const total = quote.items.reduce((s, it) => s + priceItem(it).total, 0);
  const anyReview = quote.items.some(it => it.status === "Needs review");
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <WindowMark size={16} color={SAGE} />
          <h2 className="text-xl font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>MyProject</h2>
          <span className="text-xs text-[#5c5a56] border border-black/10 px-2 py-0.5">{quote.items.length} item{quote.items.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="hidden md:flex gap-2">
          <Btn variant="outline" size="sm" onClick={onUpload}><Upload className="w-3.5 h-3.5" />Upload</Btn>
          <Btn variant="primary" size="sm" onClick={onAdd}><Plus className="w-3.5 h-3.5" />Add item</Btn>
        </div>
      </div>

      {/* Uploaded information */}
      {quote.files.length > 0 && (
        <div className="border border-black/10 bg-white mb-3 px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-[#5c5a56] mb-2">Uploaded information · {quote.files.length}</p>
          <div className="space-y-1.5">
            {quote.files.map(f => (
              <div key={f.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 min-w-0 text-[#131311]"><FileText className="w-3.5 h-3.5 text-[#5A7A6A] flex-shrink-0" /><span className="truncate">{f.name}</span></span>
                <span className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-[11px] text-[#5A7A6A]">{f.status}</span>
                  <button onClick={() => quote.removeFile(f.id)} className="text-[#5c5a56] hover:text-red-600 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[#5c5a56] mt-2">Reviewed by our team alongside any items you configure.</p>
        </div>
      )}

      {/* Desktop table */}
      {quote.items.length > 0 && (
        <div className="hidden md:block border border-black/10 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAF9] border-b border-black/10 text-[10px] uppercase tracking-widest text-[#5c5a56]">
                {["Ref", "Location", "Product", "Width", "Height", "Config", "Qty", "Est.", "Status", ""].map(hd => <th key={hd} className="text-left font-semibold px-3 py-2.5">{hd}</th>)}
              </tr>
            </thead>
            <tbody>
              {quote.items.map((it, i) => {
                const pr = priceItem(it);
                return (
                  <tr key={it.id} className="border-b border-black/6 last:border-0 hover:bg-[#FAFAF9]/60">
                    <td className="px-3 py-3 text-[#5A7A6A]" style={{ fontFamily: "'DM Mono', monospace" }}>{String(i + 1).padStart(2, "0")}</td>
                    <td className="px-3 py-3 text-[#5c5a56]">{it.location || "—"}</td>
                    <td className="px-3 py-3 text-[#131311] font-medium">{productName(it.productId)}</td>
                    <td className="px-3 py-3 text-[#131311] whitespace-nowrap">{mm(it.width)}</td>
                    <td className="px-3 py-3 text-[#131311] whitespace-nowrap">{mm(it.height)}</td>
                    <td className="px-3 py-3 text-[#5c5a56]">{configName(it.productId, it.configId)}</td>
                    <td className="px-3 py-3 text-[#131311]">{it.qty}</td>
                    <td className="px-3 py-3 text-[#131311] whitespace-nowrap" style={{ fontFamily: "'DM Mono', monospace" }}>{it.status === "Needs review" ? "—" : fmt(pr.total)}</td>
                    <td className="px-3 py-3"><span className={`text-[10px] px-2 py-0.5 whitespace-nowrap ${it.status === "Needs review" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-[#5A7A6A]/10 text-[#5A7A6A]"}`}>{it.status}</span></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 justify-end text-xs">
                        <button onClick={() => onEdit(it.id)} className="text-[#5A7A6A] hover:underline cursor-pointer">Edit</button>
                        <button onClick={() => quote.copy(it.id)} className="text-[#5c5a56] hover:text-[#131311] cursor-pointer">Copy</button>
                        <button onClick={() => quote.remove(it.id)} className="text-[#5c5a56] hover:text-red-600 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {quote.items.map((it, i) => {
          const pr = priceItem(it);
          return (
            <div key={it.id} className="border border-black/10 bg-white p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-[11px] text-[#5A7A6A]" style={{ fontFamily: "'DM Mono', monospace" }}>{String(i + 1).padStart(2, "0")}{it.location ? ` · ${it.location}` : ""}</span>
                  <p className="font-medium text-[#131311]">{productName(it.productId)} · {configName(it.productId, it.configId)}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 flex-shrink-0 ${it.status === "Needs review" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-[#5A7A6A]/10 text-[#5A7A6A]"}`}>{it.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-[#131311] mb-3">
                <span><span className="text-[#5c5a56] text-xs">Width:</span> {mm(it.width)}</span>
                <span><span className="text-[#5c5a56] text-xs">Height:</span> {mm(it.height)}</span>
                <span><span className="text-[#5c5a56] text-xs">Qty:</span> {it.qty}</span>
                <span style={{ fontFamily: "'DM Mono', monospace" }}>{it.status === "Needs review" ? "Pending" : fmt(pr.total)}</span>
              </div>
              <div className="flex items-center gap-3 text-xs border-t border-black/6 pt-2">
                <button onClick={() => onEdit(it.id)} className="text-[#5A7A6A] font-medium cursor-pointer">Edit</button>
                <button onClick={() => quote.copy(it.id)} className="text-[#5c5a56] cursor-pointer">Copy</button>
                <button onClick={() => quote.remove(it.id)} className="text-[#5c5a56] cursor-pointer ml-auto">Delete</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total + review */}
      {quote.items.length > 0 && (
        <div className="mt-4 border border-black/10 bg-[#FAFAF9] px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#5c5a56]">Indicative total{anyReview ? " · excludes items in review" : ""}</p>
            <p className="text-2xl font-semibold text-[#131311]" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(total)} <span className="text-xs font-normal text-[#5c5a56]">inc GST</span></p>
          </div>
          <Btn variant="sage" size="lg" onClick={onReview}>Review quote <ArrowRight className="w-4 h-4" /></Btn>
        </div>
      )}
      <div className="md:hidden flex gap-2 mt-3">
        <Btn variant="outline" size="md" onClick={onUpload} className="flex-1 justify-center"><Upload className="w-4 h-4" />Upload</Btn>
        <Btn variant="primary" size="md" onClick={onAdd} className="flex-1 justify-center"><Plus className="w-4 h-4" />Add item</Btn>
      </div>
    </div>
  );
}

function AddedConfirmation({ item, quote, onAnotherLike, onAnotherProduct, onViewProject }: {
  item: QItem; quote: QuoteState; onAnotherLike: () => void; onAnotherProduct: () => void; onViewProject: () => void;
}) {
  return (
    <div className="border border-[#5A7A6A]/30 bg-white">
      <div className="bg-[#5A7A6A]/8 border-b border-[#5A7A6A]/20 px-5 py-4 flex items-center gap-2">
        <span className="w-8 h-8 bg-[#5A7A6A] flex items-center justify-center flex-shrink-0"><Check className="w-4 h-4 text-white" /></span>
        <div><p className="font-semibold text-[#131311] text-sm">Added to MyProject</p><p className="text-xs text-[#5c5a56]">{productName(item.productId)} · {mm(item.width)} × {mm(item.height)} · ×{item.qty}</p></div>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm text-[#5c5a56] mb-3">MyProject now has <span className="font-medium text-[#131311]">{quote.items.length} item{quote.items.length !== 1 ? "s" : ""}</span> · indicative {fmt(quote.items.reduce((s, it) => s + priceItem(it).total, 0))}.</p>
        <div className="space-y-2">
          <Btn variant="sage" size="md" onClick={onAnotherLike} className="w-full justify-center"><Plus className="w-4 h-4" />Add another like this</Btn>
          <div className="grid grid-cols-2 gap-2">
            <Btn variant="outline" size="md" onClick={onAnotherProduct} className="justify-center">Another product</Btn>
            <Btn variant="primary" size="md" onClick={onViewProject} className="justify-center">View MyProject</Btn>
          </div>
        </div>
        <p className="text-[11px] text-[#5c5a56] mt-3">“Add another like this” keeps your product and options, and returns you to dimensions for a separately editable item.</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUOTE BUILDER
// ═══════════════════════════════════════════════════════════════════════════════
function QuotePage({ setPage, user, quote }: { setPage: (p: Page) => void; user: AuthUser | null; quote: QuoteState }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [view, setView] = useState<"build" | "review">("build");
  const [seed, setSeed] = useState<Partial<QItem> | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [composerOpen, setComposerOpen] = useState(quote.items.length === 0);
  const [justAdded, setJustAdded] = useState<QItem | null>(null);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef<HTMLDivElement>(null);

  // review/submit
  const [submitted, setSubmitted] = useState(false);
  const [contactName, setContactName] = useState(user?.name || "");
  const [contactEmail, setContactEmail] = useState(user?.email || "");
  const [contactPhone, setContactPhone] = useState(user?.phone || "");
  const [suburb, setSuburb] = useState("");
  const [persona, setPersona] = useState(user?.type || "");

  const hasContent = quote.items.length > 0 || quote.files.length > 0;

  const openComposer = (opts: { seed?: Partial<QItem> | null; editId?: number | null }) => {
    setSeed(opts.seed ?? null); setEditId(opts.editId ?? null); setJustAdded(null);
    setComposerOpen(true); setComposerKey(k => k + 1);
    setTimeout(() => composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };
  const handleAdded = (built: Omit<QItem, "id">) => {
    if (editId != null) { quote.update(editId, built); setJustAdded({ ...built, id: editId }); }
    else { const id = quote.add(built); setJustAdded({ ...built, id }); }
    setEditId(null); setComposerOpen(false);
    setTimeout(() => composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };
  const fakeUpload = () => {
    setUploading(true);
    setTimeout(() => {
      quote.addFiles([
        { id: Date.now(), name: "window-schedule-rev-b.pdf", kind: "PDF", status: "Processing" },
        { id: Date.now() + 1, name: "elevations-north.pdf", kind: "PDF", status: "Uploaded" },
      ]);
      setUploading(false);
    }, 1400);
  };

  if (submitted) {
    return (
      <div className="relative min-h-screen bg-[#FAFAF9] pt-24 pb-24 overflow-hidden">
        <GhostMark size={300} opacity={0.05} pos="right-0 bottom-0" />
        <div className="max-w-md w-full mx-auto px-6 text-center relative">
          <div className="w-14 h-14 border border-[#5A7A6A]/30 bg-[#5A7A6A]/8 flex items-center justify-center mx-auto mb-6"><WindowMark size={24} color={SAGE} /></div>
          <h2 className="text-2xl font-semibold text-[#131311] mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Quote submitted</h2>
          <p className="text-[#5c5a56] text-sm mb-1">Reference</p>
          <p className="font-semibold text-lg mb-6 text-[#5A7A6A]" style={{ fontFamily: "'DM Mono', monospace" }}>AMJ-58901</p>
          <p className="text-sm text-[#5c5a56] leading-relaxed mb-8">We'll review dimensions, specifications and manufacturing suitability before issuing a reviewed quote. Expect a response within 1–2 business days.</p>
          <p className="text-xs text-[#5c5a56] mb-6">No payment at this stage. Deposit only after you approve the reviewed quote.</p>
          <div className="flex gap-3 justify-center">
            <Btn variant="sage" size="md" onClick={() => go("track-order")}>Track this order</Btn>
            <Btn variant="ghost" size="md" onClick={() => go("home")}>Back to home</Btn>
          </div>
        </div>
      </div>
    );
  }

  if (view === "review") {
    const total = quote.items.reduce((s, it) => s + priceItem(it).total, 0);
    return (
      <div className="min-h-screen bg-[#FAFAF9] pt-16">
        <div className="max-w-2xl mx-auto px-6 py-10">
          <button onClick={() => setView("build")} className="text-[#5c5a56] hover:text-[#131311] text-sm mb-5 flex items-center gap-1 cursor-pointer"><ChevronLeft className="w-4 h-4" />Back to MyProject</button>
          <SLabel>Review quote</SLabel>
          <h1 className="text-3xl font-semibold text-[#131311] mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Review and submit</h1>
          <p className="text-[#5c5a56] text-sm mb-6">No payment at this stage. A reviewed quote is issued after manual technical review.</p>
          <div className="border border-black/10 bg-white p-5 mb-4">
            <SLabel>Your quote</SLabel>
            <div className="space-y-2 mb-3">
              {quote.items.map((it, i) => (
                <div key={it.id} className="flex justify-between text-sm border-b border-black/6 last:border-0 py-1.5">
                  <span className="text-[#131311]">{String(i + 1).padStart(2, "0")} · {productName(it.productId)} — {mm(it.width)} × {mm(it.height)} ×{it.qty}</span>
                  <span className="text-[#5c5a56]" style={{ fontFamily: "'DM Mono', monospace" }}>{it.status === "Needs review" ? "Review" : fmt(priceItem(it).total)}</span>
                </div>
              ))}
              {quote.files.length > 0 && <p className="text-xs text-[#5c5a56] pt-1">+ {quote.files.length} uploaded file{quote.files.length !== 1 ? "s" : ""} for review</p>}
            </div>
            <div className="flex justify-between border-t border-black/8 pt-3 text-sm"><span className="text-[#5c5a56]">Indicative total</span><span className="font-semibold text-[#131311]" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(total)} inc GST</span></div>
          </div>
          <div className="border border-black/10 bg-white p-5 space-y-4 mb-4">
            {user && <p className="text-sm text-[#5A7A6A] flex items-center gap-1.5"><CheckCircle className="w-4 h-4" />Pre-filled from your account — edit if needed.</p>}
            <div><FieldLabel>Full name</FieldLabel><Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Your name" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><FieldLabel>Email</FieldLabel><Input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="your@email.com" /></div>
              <div><FieldLabel>Phone</FieldLabel><Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="(03) 9000 0000" /></div>
            </div>
            <div><FieldLabel>Delivery suburb / postcode</FieldLabel><Input value={suburb} onChange={e => setSuburb(e.target.value)} placeholder="e.g. Preston VIC 3072" /></div>
            <div>
              <FieldLabel>You are a…</FieldLabel>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {["Builder / trade", "Owner-builder", "Homeowner", "Architect"].map(pp => (
                  <button key={pp} onClick={() => setPersona(pp)} className={`px-3 py-2.5 text-xs border cursor-pointer transition-colors ${persona === pp ? "border-[#131311] bg-[#131311] text-white" : "border-black/12 bg-white text-[#131311] hover:border-[#131311]/40"}`}>{pp}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-[#F2F0EC] border border-black/8 p-4 mb-6 text-xs text-[#5c5a56]"><AlertCircle className="w-3 h-3 inline mr-1" />Indicative estimates are not final prices. No deposit until you approve the reviewed quote. Supply only — installation not included.</div>
          <div className="flex justify-end"><Btn variant="sage" size="lg" disabled={!contactName || !contactEmail} onClick={() => setSubmitted(true)}>Submit for technical review <Send className="w-4 h-4" /></Btn></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] pt-16">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="relative mb-8">
          <GhostMark size={220} opacity={0.05} pos="right-0 top-0" />
          <div className="relative">
            <SLabel>Your quote</SLabel>
            <h1 className="text-3xl md:text-4xl font-semibold text-[#131311] mb-2 leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Build your quote</h1>
            <p className="text-[#5c5a56] text-sm max-w-lg">Add products for an indicative estimate, or upload a schedule and we'll do it for you. A reviewed quote is issued before any deposit — supply only.</p>
          </div>
        </div>

        {/* Upload — compact, always available */}
        <div className="border border-black/10 bg-white mb-4">
          <div className="px-5 py-4">
            <p className="text-sm font-medium text-[#131311] mb-1">Have plans or a window schedule?</p>
            <p className="text-xs text-[#5c5a56] mb-3">Upload and we'll extract line items for review. PDF, DWG, XLS, CSV, JPG.</p>
            {uploading ? (
              <div className="flex items-center gap-3 border border-black/10 px-4 py-3 text-sm text-[#5c5a56]"><div className="w-4 h-4 border-2 border-[#5A7A6A] border-t-transparent rounded-full animate-spin" />Reading your files…</div>
            ) : (
              <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); fakeUpload(); }} onClick={fakeUpload}
                className={`border border-dashed px-4 py-5 text-center cursor-pointer transition-colors ${drag ? "border-[#5A7A6A] bg-[#5A7A6A]/5" : "border-black/20 hover:border-[#5A7A6A]/60"}`}>
                <Upload className="w-5 h-5 text-[#5A7A6A] mx-auto mb-1.5" />
                <p className="text-sm text-[#131311]">Drop files or <span className="text-[#5A7A6A] font-medium">browse</span></p>
              </div>
            )}
          </div>
        </div>

        {/* Composer / confirmation / add-item entry */}
        <div ref={composerRef} className="mb-4">
          {justAdded ? (
            <AddedConfirmation item={justAdded} quote={quote}
              onAnotherLike={() => openComposer({ seed: { productId: justAdded.productId, configId: justAdded.configId, options: justAdded.options, location: justAdded.location } })}
              onAnotherProduct={() => openComposer({ seed: null })}
              onViewProject={() => projectRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
          ) : composerOpen ? (
            <div>
              {hasContent && <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-[#131311]">{editId != null ? "Edit item" : "Add an item"}</p><button onClick={() => { setComposerOpen(false); setEditId(null); }} className="text-xs text-[#5c5a56] hover:text-[#131311] cursor-pointer">Close</button></div>}
              {!hasContent && <p className="text-sm text-[#5c5a56] mb-2">Or add products manually</p>}
              <ItemComposer key={composerKey} quote={quote} seed={seed} editId={editId} onAdded={handleAdded} onCancel={hasContent ? () => { setComposerOpen(false); setEditId(null); } : undefined} />
            </div>
          ) : (
            <button onClick={() => openComposer({ seed: null })} className="w-full border border-dashed border-black/20 hover:border-[#5A7A6A] py-4 text-sm text-[#5c5a56] hover:text-[#5A7A6A] flex items-center justify-center gap-2 cursor-pointer transition-colors bg-white">
              <Plus className="w-4 h-4" />Add another item
            </button>
          )}
        </div>

        {/* MyProject — only once there is value */}
        {hasContent && (
          <div ref={projectRef} className="mt-8 pt-8 border-t border-black/10">
            <MyProjectView quote={quote}
              onEdit={id => { const it = quote.items.find(x => x.id === id); openComposer({ seed: it, editId: id }); }}
              onAdd={() => openComposer({ seed: null })}
              onUpload={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              onReview={() => { setView("review"); window.scrollTo(0, 0); }} />
          </div>
        )}
      </div>
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
// HOW IT WORKS
// ═══════════════════════════════════════════════════════════════════════════════
function HowItWorksPage({ setPage }: { setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  return (
    <div className="bg-[#FAFAF9] min-h-screen">
      <div className="relative overflow-hidden">
        <GhostMark size={280} opacity={0.07} pos="right-0 top-0" />
        <div className="max-w-4xl mx-auto px-6 pt-28 pb-12 relative">
          <SLabel>Process</SLabel>
          <h1 className="text-4xl font-semibold text-[#131311] mb-4"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>How it works</h1>
          <p className="text-[#5c5a56] max-w-xl mb-14">Supply only. No installation. Indicative estimate first — reviewed quote before deposit.</p>
          <div className="space-y-0">
            {[
              { t: "Start a quote", b: "Choose to upload a schedule or enter product types and dimensions step by step. If you have plans, you can upload them at the start of your quote. No account required.", w: null },
              { t: "Indicative estimate", b: "An indicative estimate range is generated. This is not a final price and should not be used for final budgeting.", w: "Indicative estimates are subject to technical review." },
              { t: "Manual technical review", b: "Our team reviews dimensions, specifications and manufacturing suitability. We may request additional information.", w: "If information is incomplete, we'll request what's needed." },
              { t: "Reviewed quote issued", b: "A reviewed and verified quote is issued with confirmed pricing and specifications.", w: null },
              { t: "Deposit to confirm", b: "You approve the reviewed quote and pay a deposit. No deposit before this step.", w: "Supply only. Installation arranged by your builder or installer." },
              { t: "Manufacture and delivery", b: "Manufacturer-backed production. Lead times confirmed at quote stage. Door-to-door delivery across Melbourne and Victoria.", w: null },
            ].map((s, i, arr) => (
              <div key={s.t} className="grid grid-cols-[36px_1fr] gap-6 pb-10 last:pb-0">
                <div className="flex flex-col items-center">
                  {/* Window-pane square step indicator */}
                  <div className="w-8 h-8 border border-[#5A7A6A]/40 flex items-center justify-center flex-shrink-0 mt-1 relative">
                    <div className="absolute w-px h-2 bg-[#5A7A6A]/20 top-0.5" />
                    <div className="absolute h-px w-2 bg-[#5A7A6A]/20 left-0.5" />
                    <span className="text-[10px] text-[#5A7A6A] font-medium relative z-10"
                      style={{ fontFamily: "'DM Mono', monospace" }}>{i + 1}</span>
                  </div>
                  {i < arr.length - 1 && <div className="w-px flex-1 bg-[#5A7A6A]/15 mt-2" />}
                </div>
                <div className="pt-1">
                  <h3 className="font-semibold text-[#131311] mb-1.5"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{s.t}</h3>
                  <p className="text-sm text-[#5c5a56] leading-relaxed mb-2">{s.b}</p>
                  {s.w && <p className="text-xs text-[#5c5a56] bg-[#F2F0EC] border border-black/8 px-3 py-2">{s.w}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <CtaBanner
        title="Ready to get a quote?"
        sub="Indicative estimate first. Reviewed quote before deposit. No account required."
        onClick={() => go("quote")}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
function LoginPage({ setPage, setUser }: { setPage: (p: Page) => void; setUser: (u: AuthUser) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [mode, setMode] = useState<"signin"|"register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const handleSubmit = () => {
    setUser({ name: "Jason Miller", company: "Premier Build Co.", type: "builder", email: "jason@premierbuild.com.au", phone: "(03) 9100 1234" });
    go("dashboard");
  };
  return (
    <div className="relative min-h-screen bg-[#FAFAF9] flex items-center justify-center pt-16 pb-24 overflow-hidden">
      <GhostMark size={320} opacity={0.05} pos="right-0 bottom-0" />
      <div className="w-full max-w-sm mx-auto px-6 relative">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4"><WindowMark size={32} color={SAGE} /></div>
          <h1 className="text-2xl font-semibold text-[#131311]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {mode === "signin" ? "Welcome back" : "Create account"}
          </h1>
          <p className="text-sm text-[#5c5a56] mt-1">{mode === "signin" ? "Sign in to manage quotes and orders" : "For builders and trades"}</p>
        </div>
        <div className="group relative bg-white border border-black/8 p-6 space-y-4 overflow-hidden">
          <FrameCorners size={10} color={SAGE} show="always" />
          {mode === "register" && <div><FieldLabel>Full name</FieldLabel><Input placeholder="Your name" /></div>}
          <div><FieldLabel>Email</FieldLabel><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" /></div>
          <div><FieldLabel>Password</FieldLabel><Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" /></div>
          {mode === "signin" && (
            <div className="flex justify-between items-center">
              <label className="flex items-center gap-2 text-sm text-[#5c5a56] cursor-pointer"><input type="checkbox" className="accent-[#5A7A6A]" />Remember me</label>
              <button className="text-sm text-[#5A7A6A] hover:underline cursor-pointer">Forgot password?</button>
            </div>
          )}
          <Btn variant="sage" size="md" onClick={handleSubmit} className="w-full justify-center">
            {mode === "signin" ? "Sign in" : "Create account"}
          </Btn>
        </div>
        <div className="mt-4 text-center space-y-3">
          <button onClick={() => setMode(mode === "signin" ? "register" : "signin")}
            className="text-sm text-[#5c5a56] hover:text-[#131311] cursor-pointer">
            {mode === "signin" ? "No account? Register →" : "Already have an account? Sign in →"}
          </button>
          <div className="border-t border-black/8 pt-4">
            <button onClick={() => go("track-order")}
              className="text-sm text-[#5c5a56] hover:text-[#131311] cursor-pointer flex items-center gap-1.5 mx-auto">
              <Search className="w-4 h-4" />Track an order without signing in
            </button>
          </div>
        </div>
        <div className="mt-6 bg-[#F2F0EC] border border-black/8 p-4 text-xs text-[#5c5a56]">
          Accounts are for builders, trades and project managers. Guest quotes don't require an account.
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
function DashboardPage({ setPage, user, setUser }: {
  setPage: (p: Page) => void; user: AuthUser | null; setUser: (u: AuthUser | null) => void;
}) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  if (!user) { go("login"); return null; }
  const allQuotes = [
    { ref: "AMJ-58901", date: "Today",  project: "New build — Coburg",       items: 3, status: "Under review",         sc: "text-amber-700 bg-amber-50 border-amber-200",         closed: false },
    { ref: "AMJ-58712", date: "Jan 12", project: "Extension — Northcote",    items: 5, status: "Reviewed quote ready", sc: "text-[#5A7A6A] bg-[#5A7A6A]/8 border-[#5A7A6A]/20", closed: false },
    { ref: "AMJ-58201", date: "Dec 18", project: "Renovation — St Kilda",    items: 2, status: "In production",        sc: "text-blue-700 bg-blue-50 border-blue-200",            closed: false },
    { ref: "AMJ-57880", date: "Nov 22", project: "Replacement — Brunswick",  items: 1, status: "Delivered",            sc: "text-[#5c5a56] bg-[#F2F0EC] border-black/10",        closed: true  },
  ];
  const active = allQuotes.filter(q => !q.closed);
  const closed  = allQuotes.filter(q => q.closed);
  const QuoteRow = ({ q }: { q: typeof allQuotes[0] }) => (
    <div className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-[#FAFAF9] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-0.5 flex-wrap">
          <span className="font-medium text-sm text-[#131311]" style={{ fontFamily: "'DM Mono', monospace" }}>{q.ref}</span>
          <span className={`text-[11px] px-2 py-0.5 font-medium border ${q.sc}`}>{q.status}</span>
        </div>
        <div className="text-xs text-[#5c5a56] truncate">{q.project} · {q.items} items · {q.date}</div>
      </div>
      <button onClick={() => q.status === "Reviewed quote ready" ? go("approved-quote") : go("track-order")}
        className="text-xs text-[#5A7A6A] hover:underline cursor-pointer flex-shrink-0">
        {q.status === "Reviewed quote ready" ? "View & approve →" : "Track →"}
      </button>
    </div>
  );
  return (
    <div className="relative min-h-screen bg-[#FAFAF9] pt-16 overflow-hidden">
      <GhostMark size={340} opacity={0.04} pos="right-0 top-0" />
      <div className="max-w-5xl mx-auto px-6 py-12 relative">
        <div className="mb-10">
          <SLabel>Dashboard</SLabel>
          <h1 className="text-3xl font-semibold text-[#131311]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>G'day, {user.name.split(" ")[0]}</h1>
          <p className="text-[#5c5a56] text-sm mt-1">{user.company}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[["Active quotes","2"],["Awaiting deposit","1"],["In production","1"],["Delivered all-time","8"]].map(([l,v]) => (
            <div key={l} className="group relative bg-white border border-black/8 p-4 overflow-hidden">
              <FrameCorners size={8} color={SAGE} />
              <div className="text-2xl font-semibold text-[#131311] mb-1" style={{ fontFamily: "'DM Mono', monospace" }}>{v}</div>
              <div className="text-xs text-[#5c5a56]">{l}</div>
            </div>
          ))}
        </div>
        {/* Active */}
        <div className="bg-white border border-black/8 mb-3">
          <div className="px-5 py-3.5 border-b border-black/8 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-[#131311]">Active</h2>
            <span className="text-xs text-[#5A7A6A] bg-[#5A7A6A]/8 border border-[#5A7A6A]/20 px-2 py-0.5 font-medium">{active.length}</span>
          </div>
          <div className="divide-y divide-black/6">{active.map(q => <QuoteRow key={q.ref} q={q} />)}</div>
        </div>
        {/* Closed */}
        <div className="bg-white border border-black/8 mb-5">
          <div className="px-5 py-3.5 border-b border-black/8">
            <h2 className="font-semibold text-sm text-[#5c5a56]">Closed &amp; delivered</h2>
          </div>
          <div className="divide-y divide-black/6">{closed.map(q => <QuoteRow key={q.ref} q={q} />)}</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { l: "Track an order", s: "Check production and delivery status", p: "track-order" as Page },
            { l: "My profile", s: "Edit account details and preferences", p: "profile" as Page },
            { l: "Resources", s: "Guides, measuring help, compliance docs", p: "resources" as Page },
          ].map(a => (
            <button key={a.l} onClick={() => go(a.p)}
              className="group relative bg-white border border-black/8 hover:border-[#5A7A6A] p-4 text-left transition-all cursor-pointer overflow-hidden">
              <FrameCorners size={8} color={SAGE} />
              <div className="font-medium text-sm text-[#131311] group-hover:text-[#5A7A6A] transition-colors mb-0.5">{a.l}</div>
              <div className="text-xs text-[#5c5a56]">{a.s}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════════════════════════════════════
function ProfilePage({ user, setPage }: { user: AuthUser | null; setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  if (!user) { go("login"); return null; }
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);
  const [company, setCompany] = useState(user.company);
  const [saved, setSaved] = useState(false);
  return (
    <div className="relative min-h-screen bg-[#FAFAF9] pt-16 overflow-hidden">
      <GhostMark size={280} opacity={0.05} pos="right-0 bottom-0" />
      <div className="max-w-3xl mx-auto px-6 py-12 relative">
        <button onClick={() => go("dashboard")} className="text-xs text-[#5c5a56] hover:text-[#131311] flex items-center gap-1 cursor-pointer mb-6">
          <ChevronLeft className="w-3 h-3" />Dashboard
        </button>
        <SLabel>Account</SLabel>
        <h1 className="text-3xl font-semibold text-[#131311] mb-8"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>My profile</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2 space-y-4">
            <div className="group relative bg-white border border-black/8 p-5 overflow-hidden">
              <FrameCorners size={10} color={SAGE} show="always" />
              <h3 className="font-semibold text-sm text-[#131311] mb-4">Personal details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><FieldLabel>Full name</FieldLabel><Input value={name} onChange={e => setName(e.target.value)} /></div>
                <div><FieldLabel>Email address</FieldLabel><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div><FieldLabel>Phone number</FieldLabel><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
                <div><FieldLabel>Company / trade name</FieldLabel><Input value={company} onChange={e => setCompany(e.target.value)} /></div>
              </div>
              <div className="mt-5">
                <Btn variant="sage" size="md" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2500); }}>
                  {saved ? <><Check className="w-4 h-4" />Saved</> : "Save changes"}
                </Btn>
              </div>
            </div>
            <div className="group relative bg-white border border-black/8 p-5 overflow-hidden">
              <FrameCorners size={10} color={SAGE} show="always" />
              <h3 className="font-semibold text-sm text-[#131311] mb-1">Delivery addresses</h3>
              <p className="text-xs text-[#5c5a56] mb-3">Saved for faster quote submissions.</p>
              <div className="border border-black/8 p-3 text-sm text-[#5c5a56] flex justify-between items-center">
                <span>34 Example St, Coburg VIC 3058</span>
                <button className="text-xs text-[#5c5a56] hover:text-red-600 cursor-pointer">Remove</button>
              </div>
              <button className="mt-2 text-xs text-[#5A7A6A] hover:underline cursor-pointer flex items-center gap-1">
                <Plus className="w-3 h-3" />Add address
              </button>
            </div>
          </div>
          <div className="space-y-4">
            <div className="group relative bg-white border border-black/8 p-5 text-center overflow-hidden">
              <FrameCorners size={10} color={SAGE} show="always" />
              <div className="w-12 h-12 bg-[#5A7A6A]/10 border border-[#5A7A6A]/20 flex items-center justify-center mx-auto mb-3">
                <WindowMark size={20} color={SAGE} />
              </div>
              <p className="font-semibold text-[#131311] text-sm">{user.name}</p>
              <p className="text-xs text-[#5c5a56]">{user.company}</p>
              <p className="text-xs text-[#5A7A6A] mt-1 capitalize">{user.type}</p>
            </div>
            <div className="group relative bg-white border border-black/8 p-5 overflow-hidden">
              <FrameCorners size={10} color={SAGE} show="always" />
              <p className="font-semibold text-xs text-[#131311] uppercase tracking-wide mb-3">Account links</p>
              {[[<Key className="w-3.5 h-3.5" />,"Change password","account-settings" as Page],[<Bell className="w-3.5 h-3.5" />,"Notifications","account-settings" as Page],[<LayoutDashboard className="w-3.5 h-3.5" />,"My dashboard","dashboard" as Page]].map(([icon,label,page]) => (
                <button key={label as string} onClick={() => go(page as Page)}
                  className="w-full text-left text-sm text-[#5c5a56] hover:text-[#131311] flex items-center gap-2.5 py-1.5 cursor-pointer transition-colors">
                  <span className="text-[#5A7A6A]">{icon as React.ReactNode}</span>{label as string}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════
function AccountSettingsPage({ user, setPage }: { user: AuthUser | null; setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  if (!user) { go("login"); return null; }
  const [cur, setCur] = useState(""); const [nw, setNw] = useState(""); const [conf, setConf] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <div className="relative min-h-screen bg-[#FAFAF9] pt-16 overflow-hidden">
      <GhostMark size={260} opacity={0.05} pos="right-0 bottom-0" />
      <div className="max-w-2xl mx-auto px-6 py-12 relative">
        <button onClick={() => go("profile")} className="text-xs text-[#5c5a56] hover:text-[#131311] flex items-center gap-1 mb-6 cursor-pointer"><ChevronLeft className="w-3 h-3" />My profile</button>
        <SLabel>Account</SLabel>
        <h1 className="text-3xl font-semibold text-[#131311] mb-8"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Account settings</h1>
        <div className="space-y-5">
          <div className="group relative bg-white border border-black/8 p-5 overflow-hidden">
            <FrameCorners size={10} color={SAGE} show="always" />
            <h3 className="font-semibold text-sm text-[#131311] mb-4">Change password</h3>
            <div className="space-y-3">
              <div><FieldLabel>Current password</FieldLabel><Input type="password" value={cur} onChange={e => setCur(e.target.value)} placeholder="••••••••" /></div>
              <div><FieldLabel>New password</FieldLabel><Input type="password" value={nw} onChange={e => setNw(e.target.value)} placeholder="Min. 8 characters" /></div>
              <div><FieldLabel>Confirm new password</FieldLabel><Input type="password" value={conf} onChange={e => setConf(e.target.value)} placeholder="Repeat new password" /></div>
              {nw && conf && nw !== conf && <p className="text-xs text-red-700 flex items-center gap-1"><AlertCircle className="w-3 h-3" />Passwords don't match.</p>}
            </div>
            <div className="mt-4">
              <Btn variant="sage" size="md" disabled={!cur || !nw || nw !== conf}
                onClick={() => { setSaved(true); setCur(""); setNw(""); setConf(""); setTimeout(() => setSaved(false), 2500); }}>
                {saved ? <><Check className="w-4 h-4" />Password updated</> : "Update password"}
              </Btn>
            </div>
          </div>
          <div className="group relative bg-white border border-black/8 p-5 overflow-hidden">
            <FrameCorners size={10} color={SAGE} show="always" />
            <h3 className="font-semibold text-sm text-[#131311] mb-4">Notification preferences</h3>
            <div className="space-y-3">
              {[["Quote status updates",true],["Deposit reminders",true],["Delivery notifications",true],["Product and resource updates",false]].map(([l,d]) => (
                <label key={l as string} className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-[#131311]">{l as string}</span>
                  <input type="checkbox" defaultChecked={d as boolean} className="accent-[#5A7A6A] w-4 h-4" />
                </label>
              ))}
            </div>
            <Btn variant="outline" size="sm" className="mt-4">Save preferences</Btn>
          </div>
          <div className="group relative bg-white border border-red-200 p-5 overflow-hidden">
            <FrameCorners size={10} color="#dc2626" show="always" />
            <h3 className="font-semibold text-sm text-red-700 mb-2">Danger zone</h3>
            <p className="text-xs text-[#5c5a56] mb-4">Permanently delete your account and all associated data. This cannot be undone.</p>
            <Btn variant="danger" size="sm">Delete account</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACK ORDER
// ═══════════════════════════════════════════════════════════════════════════════
function TrackOrderPage({ setPage }: { setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [ref, setRef] = useState(""); const [email, setEmail] = useState("");
  const [searched, setSearched] = useState(false); const [notFound, setNotFound] = useState(false);
  const handleSearch = () => {
    if (ref.trim().toUpperCase() === "AMJ-58712" && email.includes("@")) { setSearched(true); setNotFound(false); }
    else if (ref.trim()) { setNotFound(true); setSearched(false); }
  };
  const steps = [
    {l:"Received",done:true},{l:"Technical review",done:true},{l:"Reviewed quote sent",done:true},
    {l:"Deposit confirmed",done:true},{l:"Sent to manufacturer",done:true},{l:"In production",done:true,current:true},
    {l:"Delivery booked",done:false},{l:"Delivered",done:false},
  ];
  return (
    <div className="relative min-h-screen bg-[#FAFAF9] pt-16 pb-24 overflow-hidden">
      <GhostMark size={280} opacity={0.05} pos="right-0 top-0" />
      <div className="max-w-xl mx-auto px-6 py-12 relative">
        <SLabel>Order tracking</SLabel>
        <h1 className="text-3xl font-semibold text-[#131311] mb-2"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Track your order</h1>
        <p className="text-[#5c5a56] text-sm mb-8">Enter your reference number and the email address used when submitting your quote. No account required.</p>
        {!searched ? (
          <div className="group relative bg-white border border-black/8 p-6 space-y-4 overflow-hidden">
            <FrameCorners size={10} color={SAGE} show="always" />
            <div><FieldLabel>Reference number</FieldLabel><Input value={ref} onChange={e => setRef(e.target.value.toUpperCase())} placeholder="AMJ-58712" className="font-mono tracking-wide" /></div>
            <div><FieldLabel>Email address</FieldLabel><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email used when submitting" /></div>
            {notFound && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />No match found. Try: AMJ-58712
              </div>
            )}
            <Btn variant="sage" size="md" onClick={handleSearch} className="w-full justify-center" disabled={!ref || !email}>
              Find my order <Search className="w-4 h-4" />
            </Btn>
            <p className="text-xs text-[#5c5a56] text-center">
              Have an account? <button onClick={() => go("login")} className="text-[#5A7A6A] hover:underline cursor-pointer">Sign in for full history</button>
            </p>
          </div>
        ) : (
          <div>
            <button onClick={() => { setSearched(false); setRef(""); setEmail(""); }}
              className="text-xs text-[#5c5a56] hover:text-[#131311] flex items-center gap-1 cursor-pointer mb-5">
              <ChevronLeft className="w-3 h-3" />New search
            </button>
            <div className="group relative bg-white border border-black/8 p-5 mb-4 overflow-hidden">
              <FrameCorners size={10} color={SAGE} show="always" />
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className="text-xs text-[#5c5a56] block">Reference</span>
                  <span className="font-semibold text-lg text-[#131311]" style={{ fontFamily: "'DM Mono', monospace" }}>AMJ-58712</span>
                </div>
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 font-medium">In production</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm mb-5">
                {[["Project","Extension — Northcote"],["Customer","Jason M."],["Items","5 products"],["Est. delivery","28 Jan – 4 Feb"]].map(([k,v]) => (
                  <div key={k}><span className="text-[#5c5a56] text-xs block">{k}</span><span className="text-[#131311]">{v}</span></div>
                ))}
              </div>
              <div className="border-t border-black/8 pt-4 space-y-0">
                {steps.map((s, i) => (
                  <div key={s.l} className="flex items-start gap-3 pb-2.5 last:pb-0">
                    <div className="flex flex-col items-center">
                      <div className={`w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 border ${s.current ? "border-[#5A7A6A] bg-[#5A7A6A]" : s.done ? "bg-[#5A7A6A]/15 border-[#5A7A6A]/30" : "border-[#E8E6E2]"}`}>
                        {s.done && !s.current && <Check className="w-2.5 h-2.5 text-[#5A7A6A]" />}
                        {s.current && <div className="w-2 h-2 bg-white" />}
                      </div>
                      {i < steps.length - 1 && <div className={`w-px h-3 mt-1 ${s.done ? "bg-[#5A7A6A]/25" : "bg-[#E8E6E2]"}`} />}
                    </div>
                    <div className={`text-sm pt-0.5 ${s.current ? "text-[#131311] font-semibold" : s.done ? "text-[#5c5a56]" : "text-[#bbb8b4]"}`}>
                      {s.l}
                      {s.current && <span className="ml-2 text-[10px] bg-[#5A7A6A]/10 text-[#5A7A6A] px-1.5 py-0.5 font-medium">Now</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
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
// CONTACT
// ═══════════════════════════════════════════════════════════════════════════════
function ContactPage({ setPage }: { setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  return (
    <div className="relative min-h-screen bg-[#FAFAF9] pt-24 pb-24 overflow-hidden">
      <GhostMark size={280} opacity={0.05} pos="right-0 top-0" />
      <div className="max-w-5xl mx-auto px-6 relative">
        <SLabel>Contact</SLabel>
        <h1 className="text-4xl font-semibold text-[#131311] mb-10"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Get in touch</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 group relative bg-white border border-black/8 p-6 overflow-hidden">
            <FrameCorners size={10} color={SAGE} show="always" />
            <h3 className="font-semibold text-[#131311] mb-5">Send a message</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {[["Name","Your name"],["Email","your@email.com"],["Phone (optional)","(03) 9000 0000"],["Company","Optional"]].map(([l,p]) => (
                <div key={l}><FieldLabel>{l}</FieldLabel><Input placeholder={p} /></div>
              ))}
            </div>
            <div className="mb-4">
              <FieldLabel>Message</FieldLabel>
              <textarea rows={4} placeholder="Describe your project or question…"
                className="w-full border border-[#131311]/20 px-3 py-2.5 text-sm text-[#131311] placeholder-[#9a9894] focus:outline-none focus:border-[#5A7A6A] bg-white resize-none transition-colors" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Btn variant="sage" size="md">Send <Send className="w-4 h-4" /></Btn>
              <Btn variant="outline" size="md" onClick={() => go("quote")}>Get a quote instead</Btn>
            </div>
          </div>
          <div className="space-y-4">
            {[
              { title: "Contact us", sub: "Melbourne & Victoria · Supply only", content: (
                <div className="space-y-3 text-sm text-[#5c5a56]">
                  <a href="tel:0390000000" className="flex items-center gap-2.5 hover:text-[#131311] transition-colors"><Phone className="w-4 h-4 text-[#5A7A6A] flex-shrink-0" />(03) 9000 0000</a>
                  <a href="mailto:quotes@amjtradedirect.com.au" className="flex items-center gap-2.5 hover:text-[#131311] transition-colors"><Mail className="w-4 h-4 text-[#5A7A6A] flex-shrink-0" />quotes@amjtradedirect.com.au</a>
                  <div className="flex items-start gap-2.5"><MapPin className="w-4 h-4 text-[#5A7A6A] mt-0.5 flex-shrink-0" /><span>Melbourne &amp; Victoria<br /><span className="text-xs">No trade counter — delivery only</span></span></div>
                </div>
              )},
              { title: "Office hours", sub: null, content: (
                <div className="text-sm text-[#5c5a56] space-y-2">
                  {[["Mon – Fri","8am – 5pm"],["Saturday","By appointment"],["Sunday","Closed"]].map(([d,h]) => (
                    <div key={d} className="flex justify-between"><span>{d}</span><span className={d === "Mon – Fri" ? "font-semibold text-[#131311]" : ""}>{h}</span></div>
                  ))}
                </div>
              )},
              { title: "Supply only", sub: null, content: (
                <p className="text-sm text-[#5c5a56] leading-relaxed">We do not provide installation. Please work with your builder or installer for installation of products supplied by AMJ Trade Direct.</p>
              )},
            ].map(w => (
              <div key={w.title} className="border border-black/10 bg-white overflow-hidden">
                <div className="bg-[#131311] px-5 py-3.5 flex items-center gap-2">
                  <WindowMark size={12} color={SAGE} />
                  <div>
                    <h4 className="font-semibold text-white text-sm"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{w.title}</h4>
                    {w.sub && <p className="text-white/50 text-xs">{w.sub}</p>}
                  </div>
                </div>
                <div className="p-5">{w.content}</div>
              </div>
            ))}
          </div>
        </div>
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
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Reviewed quote — AMJ-58712</h1>
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
    <div className="relative min-h-screen bg-[#FAFAF9] pt-24 pb-0 overflow-hidden">
      <GhostMark size={280} opacity={0.05} pos="right-0 top-0" />
      <div className="max-w-4xl mx-auto px-6 pb-12 relative">
        <SLabel>Trade account</SLabel>
        <h1 className="text-4xl font-semibold text-[#131311] mb-4"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>For builders and trades</h1>
        <p className="text-[#5c5a56] max-w-lg mb-10">Faster turnaround, saved contacts, dedicated support and bulk schedule upload.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
              {[["Business name","ABC Constructions"],["ABN","00 000 000 000"],["Contact name","Full name"],["Email","trade@business.com.au"],["Phone","(03) 9000 0000"],["Suburbs served","e.g. Inner north, Coburg"],["Yearly project volume","e.g. 10 new homes"]].map(([l,p]) => (
                <div key={l}><FieldLabel>{l}</FieldLabel><Input placeholder={p} /></div>
              ))}
              <Btn variant="sage" size="md" className="w-full justify-center">Apply <ArrowRight className="w-4 h-4" /></Btn>
            </div>
            <p className="text-xs text-[#5c5a56] mt-3">Reviewed within 2 business days.</p>
          </div>
        </div>
      </div>
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
    { ref: "AMJ-58901", name: "Premier Build Co.", type: "Builder", project: "New build — Coburg",      items: 3, status: "Review required", conf: 85, age: "2h" },
    { ref: "AMJ-58698", name: "Sarah T.",           type: "Homeowner", project: "Renovation — Northcote",items: 1, status: "More info needed", conf: 52, age: "1d" },
    { ref: "AMJ-58671", name: "Metro Reno Group",   type: "Trade",     project: "Extension — St Kilda",  items: 6, status: "Ready",           conf: 94, age: "2d" },
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
  const [page, setPage] = useState<Page>("home");
  const [user, setUser] = useState<AuthUser | null>(null);
  const navigateTo = (p: Page) => { setPage(p); window.scrollTo(0, 0); };

  // ─── Catalogue navigation state ──────────────────────────────────────────────
  // Category/family persist so returning from a product detail restores the
  // catalogue where the user left it. productSlug drives the product detail page.
  const [catCategory, setCatCategory] = useState<CategorySlug>("windows");
  const [catFamily, setCatFamily] = useState<string>("all");
  const [productSlug, setProductSlug] = useState<string>(catalogueProducts[0]?.slug ?? "");

  const selectCategory = (c: CategorySlug) => { setCatCategory(c); setCatFamily("all"); };
  const openProduct = (slug: string) => { setProductSlug(slug); navigateTo("product-detail"); };
  const backToFamily = (categorySlug: CategorySlug, familySlug: string) => {
    setCatCategory(categorySlug); setCatFamily(familySlug); navigateTo("products");
  };

  // Shared quote state — MyProject persists across the quote builder and product pages
  const [quoteItems, setQuoteItems] = useState<QItem[]>([]);
  const [quoteFiles, setQuoteFiles] = useState<QFile[]>([]);
  const quote: QuoteState = {
    items: quoteItems,
    files: quoteFiles,
    add: (i) => { const id = Date.now() + Math.floor(Math.random() * 1000); setQuoteItems(prev => [...prev, { ...i, id }]); return id; },
    update: (id, patch) => setQuoteItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it)),
    remove: (id) => setQuoteItems(prev => prev.filter(it => it.id !== id)),
    copy: (id) => setQuoteItems(prev => { const it = prev.find(x => x.id === id); return it ? [...prev, { ...it, id: Date.now() + Math.floor(Math.random() * 1000) }] : prev; }),
    addFiles: (f) => setQuoteFiles(prev => [...prev, ...f]),
    removeFile: (id) => setQuoteFiles(prev => prev.filter(f => f.id !== id)),
  };

  const renderPage = () => {
    switch (page) {
      case "home":             return <HomePage setPage={navigateTo} />;
      case "products":         return <ProductsPage setPage={navigateTo} category={catCategory} family={catFamily} onSelectCategory={selectCategory} onSelectFamily={setCatFamily} onOpenProduct={openProduct} />;
      case "product-detail":   return <ProductDetailPage slug={productSlug} setPage={navigateTo} onOpenProduct={openProduct} onBack={backToFamily} />;
      case "quote":            return <QuotePage setPage={navigateTo} user={user} quote={quote} />;
      case "how-it-works":     return <HowItWorksPage setPage={navigateTo} />;
      case "resources":        return <ResourcesPage setPage={navigateTo} />;
      case "contact":          return <ContactPage setPage={navigateTo} />;
      case "approved-quote":   return <ApprovedQuotePage />;
      case "trade":            return <TradePage setPage={navigateTo} />;
      case "admin":            return <AdminPage />;
      case "login":            return <LoginPage setPage={navigateTo} setUser={setUser} />;
      case "dashboard":        return <DashboardPage setPage={navigateTo} user={user} setUser={setUser} />;
      case "track-order":      return <TrackOrderPage setPage={navigateTo} />;
      case "profile":          return <ProfilePage user={user} setPage={navigateTo} />;
      case "account-settings": return <AccountSettingsPage user={user} setPage={navigateTo} />;
      default:                 return <HomePage setPage={navigateTo} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        * { -webkit-font-smoothing: antialiased; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(90,122,106,0.2); border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(90,122,106,0.4); }
        select option { color: #131311; background: #fff; }
        body { overflow-x: hidden; }
      `}</style>
      {user && <AccountBar user={user} setPage={navigateTo} setUser={setUser} />}
      <Nav page={page} setPage={navigateTo} user={user} setUser={setUser} />
      <main>{renderPage()}</main>
      {page !== "admin" && <Footer setPage={navigateTo} />}
      {page !== "home" && page !== "quote" && page !== "admin" && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 py-3 bg-white border-t border-black/8"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <Btn variant="sage" size="md" onClick={() => navigateTo("quote")} className="w-full justify-center">Get a quote →</Btn>
        </div>
      )}
    </div>
  );
}
