import { useState, useEffect, useRef } from "react";
import {
  Menu, X, ArrowRight, ChevronRight, ChevronLeft, ChevronDown,
  Upload, Check, AlertCircle, Truck, FileText, Phone,
  Mail, MapPin, Plus, Minus, Info, Shield, Bot,
  MessageSquare, CheckCircle, XCircle, Download,
  User, Send, Eye, LogOut, Package, LayoutDashboard,
  Search, Lock, Key, Bell, Settings, ExternalLink
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Page =
  | "home" | "products" | "product-detail" | "quote"
  | "how-it-works" | "resources" | "contact" | "admin"
  | "approved-quote" | "trade" | "login" | "dashboard"
  | "track-order" | "profile" | "account-settings";

interface AuthUser {
  name: string; company: string; type: "builder" | "trade" | "owner-builder";
  email: string; phone: string;
}

// ─── Brand constants ──────────────────────────────────────────────────────────
const SAGE  = "#5A7A6A";
const DARK  = "#131311";
const WARM  = "#FAFAF9";

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
// DESIGN PRIMITIVES — the window/door design language
// ═══════════════════════════════════════════════════════════════════════════════

// 4-pane window mark — logo and repeated motif
function WindowMark({ size = 20, color = SAGE }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="18" height="18" stroke={color} strokeWidth="1.5" />
      <line x1="10" y1="1" x2="10" y2="19" stroke={color} strokeWidth="1.5" />
      <line x1="1" y1="10" x2="19" y2="10" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// FrameCorners removed — four-corner mark reads as resize handle (universal UI convention).
// Card framing is now expressed through the border-color transition on hover,
// dark header strips on widget cards, and the GhostMark watermarks in section backgrounds.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function FrameCorners(_props: unknown) { return null; }

// Large ghost WindowMark — section watermark, creates depth and industry feel
function GhostMark({ size = 300, opacity = 0.02, color = DARK, pos = "right-0 bottom-0" }: {
  size?: number; opacity?: number; color?: string; pos?: string;
}) {
  // Hard cap — never distracting, always subordinate to content
  const actual = Math.min(opacity, 0.025);
  return (
    <div className={`absolute ${pos} pointer-events-none select-none overflow-hidden`}
      style={{ opacity: actual }}>
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
        <rect x="1" y="1" width="18" height="18" stroke={color} strokeWidth="0.5" />
        <line x1="10" y1="1" x2="10" y2="19" stroke={color} strokeWidth="0.5" />
        <line x1="1" y1="10" x2="19" y2="10" stroke={color} strokeWidth="0.5" />
      </svg>
    </div>
  );
}

// Section label — WindowMark prefix, consistent across every page
function SLabel({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <WindowMark size={10} color={light ? "rgba(255,255,255,0.5)" : SAGE} />
      <span className={`text-xs font-semibold uppercase tracking-widest ${light ? "text-white/50" : "text-[#5A7A6A]"}`}>
        {children}
      </span>
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Btn({
  children, variant = "primary", size = "md", onClick, className = "",
  type = "button", disabled = false
}: {
  children: React.ReactNode;
  variant?: "primary" | "sage" | "outline" | "ghost" | "white" | "danger";
  size?: "sm" | "md" | "lg";
  onClick?: () => void; className?: string;
  type?: "button" | "submit"; disabled?: boolean;
}) {
  const sizes = { sm: "px-4 py-2 text-xs", md: "px-6 py-3 text-sm", lg: "px-8 py-4 text-sm" };
  const variants: Record<string, string> = {
    primary: "bg-[#131311] text-white hover:bg-[#2a2a27]",
    sage:    "bg-[#5A7A6A] text-white hover:bg-[#4a6858]",
    outline: "border border-[#131311] text-[#131311] hover:bg-[#131311] hover:text-white",
    ghost:   "text-[#5c5a56] hover:text-[#131311] hover:bg-black/5",
    white:   "border border-white/40 text-white hover:bg-white hover:text-[#131311]",
    danger:  "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-2 font-medium tracking-wide transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A] focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

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

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <header className="fixed left-0 right-0 z-50 bg-white/97 backdrop-blur-sm border-b border-black/8 transition-all"
        style={{ top: topOffset }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <button onClick={() => go("home")} className="flex items-center gap-2.5 cursor-pointer flex-shrink-0">
            <WindowMark size={18} color={SAGE} />
            <span className="font-semibold text-[15px] tracking-tight text-[#131311]"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>AMJ Trade Direct</span>
          </button>
          <nav className="hidden md:flex items-center gap-6 flex-1 justify-center">
            {links.map(([label, p]) => (
              <button key={p} onClick={() => go(p)}
                className={`text-sm transition-colors relative ${page === p ? "text-[#131311] font-semibold" : "text-[#5c5a56] hover:text-[#131311]"}`}>
                {label}
                {page === p && <div className="absolute -bottom-0.5 left-0 right-0 h-px bg-[#5A7A6A]" />}
              </button>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-3 flex-shrink-0">
            <a href="tel:0390000000"
              className="text-sm text-[#5c5a56] hover:text-[#131311] flex items-center gap-1.5 transition-colors">
              <Phone className="w-3.5 h-3.5" />(03) 9000 0000
            </a>
            {!user && (
              <button onClick={() => go("login")}
                className="text-sm text-[#5c5a56] hover:text-[#131311] cursor-pointer transition-colors ml-2">
                Sign in
              </button>
            )}
            {user && (
              <button onClick={() => go("dashboard")}
                className="text-sm text-[#5A7A6A] hover:text-[#4a6858] font-medium cursor-pointer flex items-center gap-1.5 transition-colors ml-2">
                <LayoutDashboard className="w-4 h-4" />My dashboard
              </button>
            )}
            <Btn variant="sage" size="sm" onClick={() => go("quote")}>Get a quote</Btn>
          </div>
          <button className="md:hidden p-1.5 text-[#131311]" onClick={() => setOpen(true)}>
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
              className={`w-full text-left px-5 py-4 border-b border-black/6 text-base transition-colors flex items-center justify-between
                ${page === p ? "text-[#131311] font-semibold bg-[#FAFAF9]" : "text-[#131311] hover:bg-[#FAFAF9]"}`}>
              {l}
              {page === p && <WindowMark size={10} color={SAGE} />}
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
        {/* Glazing frame + mullion grid motif */}
        <div className="absolute inset-4 md:inset-8 border border-white/12 pointer-events-none" />
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
// PRODUCTS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function ProductsPage({ setPage }: { setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [tab, setTab] = useState<"windows" | "doors">("windows");
  const windows = [
    { name: "Sliding Windows",      img: IMG.window2, for: "Living areas, bedrooms",       note: "2, 3 and 4-panel. Most common residential choice." },
    { name: "Awning Windows",       img: IMG.facade,  for: "Bathrooms, kitchens, high walls", note: "Opens outward. Good ventilation with weather protection." },
    { name: "Casement Windows",     img: IMG.window2, for: "Heritage areas, side ventilation", note: "Side-hung. Single or double sash." },
    { name: "Tilt & Turn Windows",  img: IMG.facade,  for: "Apartments, high-rise",         note: "Dual opening. Double glaze standard." },
    { name: "Louvre Windows",       img: IMG.window2, for: "Bathrooms, garages",            note: "Adjustable glass blades. Fixed pitch options." },
    { name: "Sashless Double Hung", img: IMG.facade,  for: "Heritage streetscapes",         note: "No visible sash rail. Stacked ventilation." },
    { name: "Single Hung Windows",  img: IMG.window2, for: "Standard residential",          note: "Fixed bottom, sliding top. Builder-grade." },
  ];
  const doors = [
    { name: "Sliding Doors",          img: IMG.doors,  for: "Alfresco, indoor-outdoor living", note: "2 to 6+ panel. Stacker options. Most popular." },
    { name: "Hinged / Casement Doors",img: IMG.detail, for: "Entry, utility, French door sets", note: "Single or double. Multi-lock hardware." },
    { name: "Bifold Door Systems",    img: IMG.doors,  for: "Large openings, entertaining",   note: "3 to 6-panel. Technical review required." },
    { name: "Pivot Doors",            img: IMG.detail, for: "Statement entries",               note: "Centre or offset pivot. Architect-grade." },
    { name: "Slim-Frame Sliding",     img: IMG.doors,  for: "Minimal frame, maximum glass",    note: "Narrow sight lines. Contemporary projects." },
    { name: "Lift-Slide Doors",       img: IMG.detail, for: "Very large openings",             note: "Handles 6m+. Thermally broken. Review required." },
  ];
  const items = tab === "windows" ? windows : doors;
  return (
    <div className="bg-[#FAFAF9] min-h-screen">
      {/* Page header */}
      <div className="relative overflow-hidden">
        <GhostMark size={280} opacity={0.07} pos="right-0 top-0" />
        <div className="max-w-6xl mx-auto px-6 pt-28 pb-8 relative">
          <SLabel>Products</SLabel>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
            <h1 className="text-4xl md:text-5xl font-semibold text-[#131311] leading-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {tab === "windows" ? "Aluminium windows" : "Aluminium doors"}
            </h1>
            <div className="flex gap-1 bg-black/6 p-1 w-fit">
              {(["windows", "doors"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-5 py-2 text-sm font-medium capitalize transition-all cursor-pointer ${tab === t ? "bg-white text-[#131311] shadow-sm" : "text-[#5c5a56] hover:text-[#131311]"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-[#5c5a56]">Supply only. Indicative estimates online — final pricing confirmed after manual technical review.</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-10 mb-2">
          {items.map(item => (
            <button key={item.name} onClick={() => go("product-detail")}
              className="group relative bg-white border border-black/8 hover:border-[#5A7A6A] hover:shadow-sm transition-all text-left overflow-hidden cursor-pointer">
              <FrameCorners size={12} color={SAGE} />
              <div className="relative bg-[#E8E6E2] aspect-video overflow-hidden">
                <img src={item.img} alt={item.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-75" />
                {/* Inset frame — always visible, sharper on hover */}
                <div className="absolute inset-2 border border-white/10 group-hover:border-white/28 transition-all duration-300 pointer-events-none" />
              </div>
              <div className="p-5">
                <h3 className="font-semibold text-[#131311] mb-1"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{item.name}</h3>
                <p className="text-xs text-[#5A7A6A] font-medium mb-1">{item.for}</p>
                <p className="text-xs text-[#5c5a56] leading-relaxed">{item.note}</p>
              </div>
            </button>
          ))}
        </div>

        <CtaBanner
          title="Ready to get a quote?"
          sub="Start online — enter dimensions or bring your window schedule."
          onClick={() => go("quote")}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT DETAIL
// ═══════════════════════════════════════════════════════════════════════════════
function ProductDetailPage({ setPage }: { setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [tab, setTab] = useState("overview");
  const [config, setConfig] = useState("2-panel");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [qty, setQty] = useState(1);
  const [colour, setColour] = useState("Satin Black");
  const [glass, setGlass] = useState("Double glaze");
  const dimWarn = !!(width && height && (parseInt(width) < 600 || parseInt(width) > 7000 || parseInt(height) < 900 || parseInt(height) > 3000));
  return (
    <div className="bg-[#FAFAF9] min-h-screen">
      {/* Hero */}
      <div className="relative bg-[#0c0c0a] h-64 md:h-[400px] mt-16">
        <img src={IMG.detail} alt="Aluminium sliding door — black frame"
          className="w-full h-full object-cover opacity-50" />
        {/* Window frame overlay on hero */}
        <div className="absolute inset-4 border border-white/10 pointer-events-none hidden md:block" />
        <div className="absolute top-4 bottom-4 left-1/2 w-px bg-white/5 pointer-events-none hidden md:block" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c0c0a]/75 via-[#0c0c0a]/20 to-transparent" />
        <div className="absolute inset-0 flex items-end max-w-6xl mx-auto px-6 pb-8">
          <div>
            <button onClick={() => go("products")} className="text-white/60 text-xs hover:text-white mb-4 flex items-center gap-1 cursor-pointer">
              <ChevronLeft className="w-3 h-3" />Products
            </button>
            <h1 className="text-3xl md:text-5xl font-semibold text-white leading-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Aluminium Sliding Door</h1>
            <p className="text-white/75 mt-2 text-sm">Supply only · Melbourne &amp; Victoria delivery</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-5 gap-10">
        {/* Main */}
        <div className="lg:col-span-3 space-y-10">
          <p className="text-[#5c5a56] leading-relaxed">The most-requested product for alfresco and indoor-outdoor living. Available from 2-panel to large stacker configurations. Supply includes frame, glass, hardware and screen as specified. Installation not included.</p>

          {/* Config selector */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#5c5a56] mb-3">Panel configuration</p>
            <div className="flex gap-2 flex-wrap">
              {["2-panel", "3-panel", "4-panel", "Stacker"].map(c => (
                <button key={c} onClick={() => setConfig(c)}
                  className={`px-4 py-2 text-xs font-medium border transition-all cursor-pointer ${config === c ? "border-[#131311] bg-[#131311] text-white" : "border-black/15 hover:border-black/40 text-[#5c5a56]"}`}>
                  {c}
                </button>
              ))}
            </div>
            {/* Configuration diagram — styled as actual window panes */}
            <div className="mt-4 border border-black/8 h-32 flex items-stretch p-3 gap-1.5 bg-white" style={GRID_BG}>
              {config === "Stacker"
                ? <div className="flex-1 flex items-center justify-center"><span className="text-xs text-[#5c5a56] text-center max-w-xs">Stacker — panels stack behind. Select this option then continue your quote for technical review.</span></div>
                : Array.from({ length: parseInt(config[0]) }).map((_, i) => (
                  <div key={i} className="flex-1 border border-[#5A7A6A]/35 bg-white/70 flex items-center justify-center relative">
                    {/* Mini WindowMark cross inside each pane */}
                    <div className="w-px h-4 bg-[#5A7A6A]/20 absolute" />
                    <div className="h-px w-4 bg-[#5A7A6A]/20 absolute" />
                  </div>
                ))}
            </div>
          </div>

          {/* Tabs */}
          <div>
            <div className="flex border-b border-black/8 gap-6 mb-6 overflow-x-auto">
              {["overview", "specs", "compliance", "delivery"].map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`pb-3 text-sm capitalize border-b-2 transition-all cursor-pointer flex-shrink-0 ${tab === t ? "border-[#5A7A6A] text-[#131311] font-medium" : "border-transparent text-[#5c5a56] hover:text-[#131311]"}`}>
                  {t}
                </button>
              ))}
            </div>
            {tab === "overview" && (
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-semibold text-[#5A7A6A] uppercase tracking-wide mb-2">Best for</p>
                  <ul className="space-y-1.5">
                    {["Alfresco and indoor-outdoor living", "Openings 1.8m to 6m+", "New builds and renovation projects"].map(l => (
                      <li key={l} className="text-sm text-[#5c5a56] flex gap-2"><Check className="w-3.5 h-3.5 text-[#5A7A6A] flex-shrink-0 mt-0.5" />{l}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#5c5a56] uppercase tracking-wide mb-2">Consider alternatives when</p>
                  <ul className="space-y-1.5">
                    {["Extreme wind rating required", "Very large sealed opening", "High-security entry"].map(l => (
                      <li key={l} className="text-sm text-[#5c5a56] flex gap-2"><div className="w-3.5 flex-shrink-0 mt-2"><div className="w-2 h-px bg-[#5c5a56]" /></div>{l}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {tab === "specs" && (
              <table className="w-full text-sm"><tbody>
                {[["Frame system","Residential aluminium (sample)"],["Standard glass","4mm toughened clear"],["Optional glass","Double glaze 6/12/4 · LowE · Obscure"],["Frame colours","Satin Black · Woodland Grey · Surf Mist · Paperbark · Custom"],["Width range","600mm – 7000mm+ (stacker — review required)"],["Height range","900mm – 2700mm standard"],["Wind / water rating","Confirmed at technical review"]].map(([k, v]) => (
                  <tr key={k} className="border-b border-black/6">
                    <td className="py-2.5 pr-4 text-xs text-[#5c5a56] font-medium w-44">{k}</td>
                    <td className="py-2.5 text-[#131311]">{v}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
            {tab === "compliance" && (
              <div className="space-y-2 text-sm text-[#5c5a56]">
                <p>Compliance documentation provided where applicable. Ratings and test reports confirmed at quote review.</p>
                {["AS 2047 — Windows in buildings","AS 1288 — Glass in buildings","WERS rating — on request","Wind/water rating — confirmed at review"].map(c => (
                  <div key={c} className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-[#5A7A6A]" />{c}</div>
                ))}
              </div>
            )}
            {tab === "delivery" && (
              <div className="space-y-2 text-sm text-[#5c5a56]">
                <p>Door-to-door delivery across Melbourne and Victoria. Timing confirmed at quote review after manufacturing lead time is established.</p>
                <p>Restricted access, crane or forklift must be declared at quote stage.</p>
              </div>
            )}
          </div>
        </div>

        {/* Estimate widget */}
        <div className="lg:col-span-2">
          <div className="border border-black/10 bg-white sticky top-20 overflow-hidden">
            <div className="bg-[#131311] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <WindowMark size={14} color={SAGE} />
                <h3 className="font-semibold text-white text-sm"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Quick estimate</h3>
              </div>
              <p className="text-white/55 text-xs">Indicative only</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><FieldLabel>Width (mm)</FieldLabel><Input value={width} onChange={e => setWidth(e.target.value)} placeholder="e.g. 3000" /></div>
                <div><FieldLabel>Height (mm)</FieldLabel><Input value={height} onChange={e => setHeight(e.target.value)} placeholder="e.g. 2100" /></div>
              </div>
              {dimWarn && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-800">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" />Outside typical range — noted for review.
                </div>
              )}
              <div>
                <FieldLabel>Quantity</FieldLabel>
                <div className="flex items-center border border-[#131311]/20 h-[42px]">
                  <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-11 h-full flex items-center justify-center text-[#5c5a56] hover:text-[#131311] hover:bg-[#FAFAF9] cursor-pointer transition-colors"><Minus className="w-3.5 h-3.5" /></button>
                  <span className="flex-1 text-center text-sm font-medium text-[#131311]">{qty}</span>
                  <button onClick={() => setQty(qty + 1)} className="w-11 h-full flex items-center justify-center text-[#5c5a56] hover:text-[#131311] hover:bg-[#FAFAF9] cursor-pointer transition-colors"><Plus className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div><FieldLabel>Frame colour</FieldLabel>
                <Select value={colour} onChange={e => setColour(e.target.value)}>
                  {["Satin Black","Woodland Grey","Surf Mist","Paperbark","Custom"].map(c => <option key={c}>{c}</option>)}
                </Select>
              </div>
              <div><FieldLabel>Glass</FieldLabel>
                <Select value={glass} onChange={e => setGlass(e.target.value)}>
                  {["4mm clear toughened","Double glaze","Double glaze LowE","Obscure"].map(g => <option key={g}>{g}</option>)}
                </Select>
              </div>
              <div className="border-t border-black/8 pt-4">
                <p className="text-[10px] font-semibold text-[#5c5a56] uppercase tracking-widest mb-1">Indicative estimate</p>
                <p className="text-xl font-semibold text-[#5A7A6A]" style={{ fontFamily: "'DM Mono', monospace" }}>Pending review</p>
                <p className="text-xs text-[#5c5a56] mt-0.5">Pricing confirmed after technical review. Not a final price.</p>
              </div>
              <Btn variant="sage" size="md" onClick={() => go("quote")} className="w-full justify-center">
                Build full quote <ArrowRight className="w-4 h-4" />
              </Btn>
              <p className="text-[10px] text-[#5c5a56] text-center">Supply only — installation not included</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUOTE WIZARD
// ═══════════════════════════════════════════════════════════════════════════════
function QuotePage({ setPage, user }: { setPage: (p: Page) => void; user: AuthUser | null }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
  type Mode = "" | "upload" | "manual";
  const [mode, setMode] = useState<Mode>("");
  const [step, setStep] = useState<WizardStep>(1);
  const TOTAL = 6;
  const [uploadPhase, setUploadPhase] = useState<"idle"|"extracting"|"done">("idle");
  const [drag, setDrag] = useState(false);
  const [items, setItems] = useState([{ id: 1, name: "", width: "", height: "", qty: 1, colour: "Satin Black", glass: "Double glaze" }]);
  const [projectType, setProjectType] = useState("");
  const [persona, setPersona] = useState(user?.type || "");
  const [contactName, setContactName] = useState(user?.name || "");
  const [contactEmail, setContactEmail] = useState(user?.email || "");
  const [contactPhone, setContactPhone] = useState(user?.phone || "");
  const [suburb, setSuburb] = useState("");
  const [siteType, setSiteType] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const addItem = () => setItems(prev => [...prev, { id: Date.now(), name: "", width: "", height: "", qty: 1, colour: "Satin Black", glass: "Double glaze" }]);
  const updateItem = (id: number, key: string, val: any) => setItems(prev => prev.map(i => i.id === id ? { ...i, [key]: val } : i));
  const triggerExtract = () => { setUploadPhase("extracting"); setTimeout(() => { setUploadPhase("done"); setStep(2); }, 2200); };
  const next = () => setStep(s => Math.min(TOTAL, s + 1) as WizardStep);
  const back = () => { if (step === 1) { setMode(""); return; } setStep(s => Math.max(1, s - 1) as WizardStep); };
  const stepLabel = ["","Products","Products","Project & you","Contact","Delivery","Review"][step];
  const extracted = [
    { id: 1, name: "Sliding Door",    width: "3000", height: "2100", qty: 2, colour: "Satin Black",   glass: "Double glaze LowE", conf: 93, issue: null },
    { id: 2, name: "Awning Window",   width: "1200", height: "900",  qty: 4, colour: "Woodland Grey",  glass: "Double glaze",     conf: 72, issue: "Hardware not specified" },
    { id: 3, name: "Sliding Window",  width: "—",    height: "1050", qty: 3, colour: "Surf Mist",      glass: "4mm clear",        conf: 38, issue: "Width unclear in schedule" },
  ];

  if (submitted) {
    return (
      <div className="relative min-h-screen bg-[#FAFAF9] pt-24 pb-24 overflow-hidden">
        <GhostMark size={300} opacity={0.05} pos="right-0 bottom-0" />
        <div className="max-w-md w-full mx-auto px-6 text-center relative">
          <div className="w-14 h-14 border border-[#5A7A6A]/30 bg-[#5A7A6A]/8 flex items-center justify-center mx-auto mb-6">
            <WindowMark size={24} color={SAGE} />
          </div>
          <h2 className="text-2xl font-semibold text-[#131311] mb-2"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Quote submitted</h2>
          <p className="text-[#5c5a56] text-sm mb-1">Reference</p>
          <p className="font-semibold text-lg mb-6 text-[#5A7A6A]"
            style={{ fontFamily: "'DM Mono', monospace" }}>AMJ-58901</p>
          <p className="text-sm text-[#5c5a56] leading-relaxed mb-8">We'll review dimensions, specifications and manufacturing suitability before issuing a final quote. Expect a response within 1–2 business days.</p>
          <div className="bg-white border border-black/8 p-5 text-left mb-6">
            <SLabel>Quote status</SLabel>
            {["Received","AI-assisted extraction","Technical review","Reviewed quote ready","Deposit confirmed","Manufacturing","Delivery booked","Delivered"].map((s, i) => (
              <div key={s} className="flex items-center gap-3 py-1.5">
                <div className={`w-5 h-5 flex items-center justify-center flex-shrink-0 border ${i === 0 ? "border-[#5A7A6A] bg-[#5A7A6A]" : i === 1 ? "border-[#5A7A6A]/30 bg-[#5A7A6A]/5" : "border-[#E8E6E2]"}`}>
                  {i === 0 && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className={`text-sm ${i <= 1 ? "text-[#131311] font-medium" : "text-[#bbb8b4]"}`}>{s}</span>
                {i === 1 && <span className="text-[10px] bg-[#5A7A6A]/10 text-[#5A7A6A] px-1.5 py-0.5 font-medium">indicative only</span>}
              </div>
            ))}
          </div>
          <p className="text-xs text-[#5c5a56] mb-6">No payment at this stage. Deposit only after you approve the reviewed quote.</p>
          <div className="flex gap-3 justify-center">
            <Btn variant="sage" size="md" onClick={() => go("track-order")}>Track this order</Btn>
            <Btn variant="ghost" size="md" onClick={() => go("home")}>Back to home</Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] pt-16">
      {mode && (
        <div className="bg-white border-b border-black/8 px-6 py-3 sticky top-16 z-30">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <button onClick={back} className="text-[#5c5a56] hover:text-[#131311] cursor-pointer flex-shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 h-1 bg-[#E8E6E2]">
              <div className="h-1 bg-[#5A7A6A] transition-all duration-400"
                style={{ width: `${(step / TOTAL) * 100}%` }} />
            </div>
            <span className="text-xs text-[#5c5a56] flex-shrink-0 min-w-[80px] text-right">
              Step {step}/{TOTAL} · {stepLabel}
            </span>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-6 py-12">

        {/* Mode selection */}
        {!mode && (
          <div className="relative">
            <GhostMark size={240} opacity={0.05} pos="right-0 top-0" />
            <div className="relative">
              <SLabel>Get a quote</SLabel>
              <h1 className="text-4xl font-semibold text-[#131311] mb-2 leading-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>How would you like to start?</h1>
              <p className="text-[#5c5a56] text-sm mb-10">If you have a window schedule or plans, upload first — we'll extract the details automatically.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { mode: "upload" as Mode, icon: <Upload className="w-7 h-7 text-[#5A7A6A]" />, title: "I have plans or a schedule", body: "Upload window schedule, plans or elevations. We extract line items automatically.", action: "Upload first" },
                  { mode: "manual" as Mode, icon: <WindowMark size={28} color={SAGE} />, title: "I'll enter details", body: "Enter product types, dimensions, quantities and preferences step by step.", action: "Start entering" },
                ].map(o => (
                  <button key={o.mode}
                    onClick={() => { setMode(o.mode); setStep(o.mode === "upload" ? 1 : 2); }}
                    className="group relative text-left border border-black/10 bg-white hover:border-[#5A7A6A] p-6 transition-all cursor-pointer overflow-hidden">
                    <FrameCorners size={10} color={SAGE} />
                    <div className="mb-4">{o.icon}</div>
                    <h3 className="font-semibold text-[#131311] mb-1"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{o.title}</h3>
                    <p className="text-sm text-[#5c5a56] leading-relaxed">{o.body}</p>
                    <div className="mt-4 flex items-center gap-1 text-xs font-medium text-[#5A7A6A]">
                      {o.action} <ArrowRight className="w-3 h-3" />
                    </div>
                  </button>
                ))}
              </div>
              <p className="mt-6 text-xs text-[#5c5a56]">
                <AlertCircle className="w-3 h-3 inline mr-1" />Indicative estimates only. Final pricing confirmed after manual review. Supply only — installation not included.
              </p>
            </div>
          </div>
        )}

        {/* Step 1: Upload */}
        {mode === "upload" && step === 1 && (
          <div>
            <SLabel>Step 1 of {TOTAL} · Upload</SLabel>
            <h2 className="text-3xl font-semibold text-[#131311] mb-2"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Upload your schedule or plans</h2>
            <p className="text-[#5c5a56] text-sm mb-6">We'll extract product line items automatically. Results are indicative — our team reviews everything.</p>
            {uploadPhase === "idle" && (
              <>
                <div
                  onDragOver={e => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={e => { e.preventDefault(); setDrag(false); triggerExtract(); }}
                  onClick={triggerExtract}
                  className={`border-2 border-dashed p-14 text-center cursor-pointer transition-all mb-5 ${drag ? "border-[#5A7A6A] bg-[#5A7A6A]/5" : "border-black/15 hover:border-[#5A7A6A]/50 bg-white"}`}>
                  <Upload className="w-8 h-8 text-[#5A7A6A] mx-auto mb-3" />
                  <p className="font-medium text-[#131311] mb-1">Drop files or click to browse</p>
                  <p className="text-sm text-[#5c5a56]">Window schedules · Plans · Elevations · Site photos · CSV</p>
                  <p className="text-xs text-[#9a9894] mt-1">PDF, DWG, XLS, CSV, JPG, PNG</p>
                </div>
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex-1 h-px bg-black/8" /><span className="text-xs text-[#9a9894]">or</span><div className="flex-1 h-px bg-black/8" />
                </div>
                <button onClick={() => { setMode("manual"); setStep(2); }}
                  className="text-sm text-[#5c5a56] hover:text-[#131311] underline underline-offset-2 cursor-pointer">
                  Skip — I'll enter details manually
                </button>
              </>
            )}
            {uploadPhase === "extracting" && (
              <div className="text-center py-20">
                <div className="w-10 h-10 border-2 border-[#5A7A6A] border-t-transparent rounded-full animate-spin mx-auto mb-5" />
                <p className="font-medium text-[#131311]">Reading your schedule…</p>
                <p className="text-sm text-[#5c5a56] mt-1">Extracting line items. Results are indicative only.</p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Products */}
        {mode && step === 2 && (
          <div>
            <SLabel>Step 2 of {TOTAL} · Products</SLabel>
            <h2 className="text-3xl font-semibold text-[#131311] mb-2"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {mode === "upload" && uploadPhase === "done" ? "Review extracted items" : "Add your items"}
            </h2>
            <p className="text-[#5c5a56] text-sm mb-6">
              {mode === "upload" && uploadPhase === "done" ? "Edit extracted details below. Our team verifies everything before issuing a quote." : "Rough opening dimensions. Enter what you know — our team will review."}
            </p>
            {mode === "upload" && uploadPhase === "done" && (
              <div className="space-y-3 mb-4">
                {extracted.map(item => (
                  <div key={item.id} className={`group relative bg-white border p-4 overflow-hidden ${item.conf < 50 ? "border-amber-300" : "border-black/8"}`}>
                    <FrameCorners size={8} color={item.conf < 50 ? "#d97706" : SAGE} show="always" />
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-medium text-sm text-[#131311]">{item.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-14 h-1 bg-[#E8E6E2]">
                            <div className={`h-full ${item.conf > 80 ? "bg-[#5A7A6A]" : item.conf > 55 ? "bg-amber-400" : "bg-red-500"}`} style={{ width: `${item.conf}%` }} />
                          </div>
                          <span className={`text-[10px] font-medium ${item.conf > 80 ? "text-[#5A7A6A]" : item.conf > 55 ? "text-amber-700" : "text-red-700"}`}>{item.conf}% confidence</span>
                          {item.conf < 50 && <span className="text-[10px] text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5">Needs review</span>}
                        </div>
                      </div>
                      <span className="text-[10px] text-[#5c5a56] bg-[#F2F0EC] px-2 py-0.5">From schedule</span>
                    </div>
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                      {[["W (mm)",item.width],["H (mm)",item.height],["Qty",String(item.qty)],["Glass",item.glass],["Colour",item.colour]].map(([k,v]) => (
                        <div key={k}><FieldLabel>{k}</FieldLabel><Input defaultValue={v} /></div>
                      ))}
                    </div>
                    {item.issue && <p className="mt-2 text-xs text-amber-800 flex items-center gap-1.5"><AlertCircle className="w-3 h-3 text-amber-600" />{item.issue}</p>}
                  </div>
                ))}
                <button onClick={addItem} className="w-full py-3 border border-dashed border-black/15 text-sm text-[#5c5a56] hover:border-[#5A7A6A] hover:text-[#5A7A6A] flex items-center justify-center gap-2 transition-all cursor-pointer">
                  <Plus className="w-4 h-4" />Add another item
                </button>
              </div>
            )}
            {(mode === "manual" || (mode === "upload" && uploadPhase !== "done")) && (
              <div className="space-y-3 mb-4">
                {items.map((item, idx) => {
                  const w = parseInt(item.width) || 0, h = parseInt(item.height) || 0;
                  const warn = !!(item.width && item.height && (w < 600 || w > 7000 || h < 800 || h > 3200));
                  return (
                    <div key={item.id} className="group relative bg-white border border-black/8 p-5 overflow-hidden">
                      <FrameCorners size={10} color={SAGE} />
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-[#5c5a56] uppercase tracking-wide">Item {idx + 1}</span>
                        {items.length > 1 && <button onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))} className="text-xs text-[#5c5a56] hover:text-red-600 cursor-pointer">Remove</button>}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="md:col-span-3">
                          <FieldLabel>Product type</FieldLabel>
                          <Select value={item.name} onChange={e => updateItem(item.id, "name", e.target.value)}>
                            <option value="">Select…</option>
                            <optgroup label="Doors"><option>Sliding Door</option><option>Bifold Door</option><option>Hinged Door</option><option>Pivot Door</option></optgroup>
                            <optgroup label="Windows"><option>Sliding Window</option><option>Awning Window</option><option>Casement Window</option><option>Tilt &amp; Turn Window</option><option>Louvre Window</option></optgroup>
                          </Select>
                        </div>
                        <div><FieldLabel>Width (mm)</FieldLabel><Input value={item.width} onChange={e => updateItem(item.id,"width",e.target.value)} placeholder="e.g. 3000" /></div>
                        <div><FieldLabel>Height (mm)</FieldLabel><Input value={item.height} onChange={e => updateItem(item.id,"height",e.target.value)} placeholder="e.g. 2100" /></div>
                        <div>
                          <FieldLabel>Qty</FieldLabel>
                          <div className="flex items-center border border-[#131311]/20 h-[42px]">
                            <button onClick={() => updateItem(item.id,"qty",Math.max(1,item.qty-1))} className="w-11 h-full flex items-center justify-center text-[#5c5a56] hover:text-[#131311] hover:bg-[#FAFAF9] cursor-pointer transition-colors"><Minus className="w-3.5 h-3.5" /></button>
                            <span className="flex-1 text-center text-sm font-medium text-[#131311]">{item.qty}</span>
                            <button onClick={() => updateItem(item.id,"qty",item.qty+1)} className="w-11 h-full flex items-center justify-center text-[#5c5a56] hover:text-[#131311] hover:bg-[#FAFAF9] cursor-pointer transition-colors"><Plus className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                        <div><FieldLabel>Frame colour</FieldLabel><Select value={item.colour} onChange={e => updateItem(item.id,"colour",e.target.value)}>{["Satin Black","Woodland Grey","Surf Mist","Paperbark","Custom"].map(c=><option key={c}>{c}</option>)}</Select></div>
                        <div><FieldLabel>Glass</FieldLabel><Select value={item.glass} onChange={e => updateItem(item.id,"glass",e.target.value)}>{["4mm toughened","Double glaze","Double glaze LowE","Obscure"].map(g=><option key={g}>{g}</option>)}</Select></div>
                      </div>
                      {warn && <p className="mt-2 text-xs text-amber-800 flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-2"><AlertCircle className="w-3 h-3 text-amber-600 flex-shrink-0" />Outside typical range — noted for review.</p>}
                    </div>
                  );
                })}
                <button onClick={addItem} className="w-full py-3 border border-dashed border-black/15 text-sm text-[#5c5a56] hover:border-[#5A7A6A] hover:text-[#5A7A6A] flex items-center justify-center gap-2 transition-all cursor-pointer">
                  <Plus className="w-4 h-4" />Add another item
                </button>
              </div>
            )}
            <p className="text-xs text-[#5c5a56] mb-6"><Info className="w-3 h-3 inline mr-1" />Enter rough opening dimensions (timber stud opening). Allowances confirmed at review.</p>
            <div className="flex justify-end"><Btn variant="sage" size="lg" onClick={next}>Continue <ArrowRight className="w-4 h-4" /></Btn></div>
          </div>
        )}

        {/* Step 3: Project + persona */}
        {mode && step === 3 && (
          <div>
            <SLabel>Step 3 of {TOTAL} · Project &amp; you</SLabel>
            <h2 className="text-3xl font-semibold text-[#131311] mb-2"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>About the project</h2>
            {user && <p className="text-sm text-[#5A7A6A] mb-6 flex items-center gap-1.5"><CheckCircle className="w-4 h-4" />Signed in as {user.name} — some fields pre-filled.</p>}
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold text-[#5c5a56] uppercase tracking-wide mb-2">Project type</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {["New build","Renovation","Extension","Replacement","Multi-unit / commercial","Other"].map(t => (
                    <button key={t} onClick={() => setProjectType(t)}
                      className={`text-left px-4 py-3 border text-sm font-medium transition-all cursor-pointer ${projectType === t ? "border-[#131311] bg-[#131311] text-white" : "border-black/12 bg-white hover:border-[#131311]/40 text-[#131311]"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#5c5a56] uppercase tracking-wide mb-2">Who are you?</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[{l:"Builder / trade",s:"Licensed builders, contractors, installers"},{l:"Owner-builder",s:"Self-managing your build or renovation"},{l:"Homeowner",s:"Recommend working with a builder to verify dimensions"},{l:"Architect / designer",s:"Specifying on behalf of a client"}].map(p => (
                    <button key={p.l} onClick={() => setPersona(p.l)}
                      className={`text-left px-4 py-3 border transition-all cursor-pointer ${persona === p.l ? "border-[#131311] bg-[#131311]" : "border-black/12 bg-white hover:border-[#131311]/40"}`}>
                      <div className={`font-medium text-sm ${persona === p.l ? "text-white" : "text-[#131311]"}`}>{p.l}</div>
                      <div className={`text-xs mt-0.5 ${persona === p.l ? "text-white/65" : "text-[#5c5a56]"}`}>{p.s}</div>
                    </button>
                  ))}
                </div>
                {persona === "Homeowner" && (
                  <div className="mt-3 flex gap-2 bg-amber-50 border border-amber-300 p-3 text-xs text-amber-800">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />Confirm all dimensions with your builder or installer before order approval.
                  </div>
                )}
              </div>
            </div>
            <div className="mt-8 flex justify-end"><Btn variant="sage" size="lg" onClick={next} disabled={!projectType || !persona}>Continue <ArrowRight className="w-4 h-4" /></Btn></div>
          </div>
        )}

        {/* Step 4: Contact */}
        {mode && step === 4 && (
          <div>
            <SLabel>Step 4 of {TOTAL} · Contact</SLabel>
            <h2 className="text-3xl font-semibold text-[#131311] mb-2"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Your contact details</h2>
            {user && <p className="text-sm text-[#5A7A6A] mb-6 flex items-center gap-1.5"><CheckCircle className="w-4 h-4" />Pre-filled from your account — edit if needed.</p>}
            <div className="group relative bg-white border border-black/8 p-5 space-y-4 overflow-hidden">
              <FrameCorners size={10} color={SAGE} show="always" />
              {[["Full name",contactName,setContactName,"Your name"],["Email address",contactEmail,setContactEmail,"your@email.com"],["Phone number",contactPhone,setContactPhone,"(03) 9000 0000"]].map(([l,v,s,p]) => (
                <div key={l as string}><FieldLabel>{l as string}</FieldLabel><Input value={v as string} onChange={e => (s as any)(e.target.value)} placeholder={p as string} /></div>
              ))}
              <div><FieldLabel>Company / trade name (optional)</FieldLabel><Input defaultValue={user?.company} placeholder="Your business name" /></div>
            </div>
            <div className="mt-8 flex justify-end"><Btn variant="sage" size="lg" onClick={next} disabled={!contactName || !contactEmail}>Continue <ArrowRight className="w-4 h-4" /></Btn></div>
          </div>
        )}

        {/* Step 5: Delivery */}
        {mode && step === 5 && (
          <div>
            <SLabel>Step 5 of {TOTAL} · Delivery</SLabel>
            <h2 className="text-3xl font-semibold text-[#131311] mb-2"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{"Where's it going?"}</h2>
            <p className="text-[#5c5a56] text-sm mb-6">Delivery access details help confirm logistics and lead times.</p>
            <div className="group relative bg-white border border-black/8 p-5 space-y-4 overflow-hidden">
              <FrameCorners size={10} color={SAGE} show="always" />
              <div><FieldLabel>Delivery suburb / postcode</FieldLabel><Input value={suburb} onChange={e => setSuburb(e.target.value)} placeholder="e.g. Preston VIC 3072" /></div>
              <div>
                <FieldLabel>Site type</FieldLabel>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {["Residential street","Building site","Townhouse","Apartment","Restricted access","Other"].map(t => (
                    <button key={t} onClick={() => setSiteType(t)}
                      className={`px-3 py-2.5 text-sm border text-left cursor-pointer transition-all ${siteType === t ? "border-[#131311] bg-[#131311] text-white" : "border-black/12 bg-white hover:border-black/30 text-[#131311]"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div><FieldLabel>Access notes (optional)</FieldLabel><Input placeholder="Narrow access, forklift on site…" /></div>
              <div><FieldLabel>Preferred timeframe (optional)</FieldLabel><Input placeholder="e.g. After 15 March, flexible" /></div>
            </div>
            <div className="mt-8 flex justify-end"><Btn variant="sage" size="lg" onClick={next} disabled={!suburb}>Review quote <ArrowRight className="w-4 h-4" /></Btn></div>
          </div>
        )}

        {/* Step 6: Review */}
        {mode && step === 6 && (
          <div>
            <SLabel>Step 6 of {TOTAL} · Review</SLabel>
            <h2 className="text-3xl font-semibold text-[#131311] mb-2"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Review and submit</h2>
            <p className="text-[#5c5a56] text-sm mb-6">No payment at this stage. Final quote issued after manual technical review.</p>
            <div className="group relative bg-white border border-black/8 p-5 mb-4 overflow-hidden">
              <FrameCorners size={10} color={SAGE} show="always" />
              <SLabel>Summary</SLabel>
              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div><span className="text-[#5c5a56] text-xs block">Project</span><span className="text-[#131311]">{projectType || "—"}</span></div>
                <div><span className="text-[#5c5a56] text-xs block">Who</span><span className="text-[#131311]">{persona || "—"}</span></div>
                <div><span className="text-[#5c5a56] text-xs block">Contact</span><span className="text-[#131311]">{contactName}</span></div>
                <div><span className="text-[#5c5a56] text-xs block">Delivery</span><span className="text-[#131311]">{suburb || "—"}</span></div>
              </div>
              <div className="border-t border-black/8 pt-3 space-y-2">
                {(mode === "upload" && uploadPhase === "done" ? extracted : items).map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-[#131311]">{item.name || "Product TBC"} × {item.qty}</span>
                    <span className="text-[#5c5a56] text-xs">{item.width && item.height ? `${item.width}×${item.height}mm` : "Dims TBC"}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-black/8 flex justify-between text-sm">
                <span className="text-[#5c5a56]">Indicative estimate</span>
                <span className="text-[#5A7A6A] font-semibold" style={{ fontFamily: "'DM Mono', monospace" }}>Pending review</span>
              </div>
            </div>
            <div className="bg-[#F2F0EC] border border-black/8 p-4 mb-6 text-xs text-[#5c5a56]">
              <AlertCircle className="w-3 h-3 inline mr-1" />Indicative estimates are not final prices. No deposit collected until you approve the reviewed quote. Supply only — installation not included.
            </div>
            <div className="flex justify-end">
              <Btn variant="sage" size="lg" disabled={!contactName || !contactEmail} onClick={() => setSubmitted(true)}>
                Submit for review <Send className="w-4 h-4" />
              </Btn>
            </div>
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

  const renderPage = () => {
    switch (page) {
      case "home":             return <HomePage setPage={navigateTo} />;
      case "products":         return <ProductsPage setPage={navigateTo} />;
      case "product-detail":   return <ProductDetailPage setPage={navigateTo} />;
      case "quote":            return <QuotePage setPage={navigateTo} user={user} />;
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
