// ─── Shared UI primitives & brand tokens ───────────────────────────────────────
// Extracted from App.tsx so page templates (src/pages/*) can be split into their
// own files. App.tsx re-imports everything here, so there is a single source of
// truth for the design language.
import type { ReactNode } from "react";

// Client-side route identifiers. Kept here so page files can type their props.
export type Page =
  | "home" | "products" | "product-detail" | "quote"
  | "how-it-works" | "resources" | "contact" | "admin"
  | "approved-quote" | "trade" | "login" | "dashboard"
  | "track-order" | "profile" | "account-settings";

// ─── Brand constants ──────────────────────────────────────────────────────────
export const SAGE = "#5A7A6A";
export const DARK = "#131311";
export const WARM = "#FAFAF9";

// 4-pane window mark — logo and repeated motif
export function WindowMark({ size = 20, color = SAGE }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="18" height="18" stroke={color} strokeWidth="1.5" />
      <line x1="10" y1="1" x2="10" y2="19" stroke={color} strokeWidth="1.5" />
      <line x1="1" y1="10" x2="19" y2="10" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// Large ghost WindowMark — section watermark, creates depth and industry feel
export function GhostMark({ size = 300, opacity = 0.02, color = DARK, pos = "right-0 bottom-0" }: {
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
export function SLabel({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <WindowMark size={10} color={light ? "rgba(255,255,255,0.5)" : SAGE} />
      <span className={`text-xs font-semibold uppercase tracking-widest ${light ? "text-white/50" : "text-[#5A7A6A]"}`}>
        {children}
      </span>
    </div>
  );
}

// ─── Button ─────────────────────────────────────────────────────────────────
export function Btn({
  children, variant = "primary", size = "md", onClick, className = "",
  type = "button", disabled = false
}: {
  children: ReactNode;
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
