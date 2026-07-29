// ─── Shared UI primitives & brand tokens ───────────────────────────────────────
// Extracted from App.tsx so page templates (src/pages/*) can be split into their
// own files. App.tsx re-imports everything here, so there is a single source of
// truth for the design language.
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { SAGE, INK as DARK, LINE } from "../styles/tokens";
// Re-exported so the pages that have always imported the palette from here keep
// working. ui.tsx is the design language's front door; styles/tokens.ts is where
// the values live, and every one of them is a var(--…) pointing at theme.css.
export { SAGE, INK as DARK, PAPER, BONE, LINE } from "../styles/tokens";

// Client-side route identifiers. Kept here so page files can type their props.
export type Page =
  | "home" | "products" | "product-detail" | "quote"
  | "how-it-works" | "resources" | "contact" | "admin"
  | "approved-quote" | "trade" | "login" | "dashboard"
  | "account" | "help"
  | "track-order" | "order"
  | "privacy" | "post";


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
      <span className={`text-xs font-semibold uppercase tracking-widest ${light ? "text-white/50" : "text-sage"}`}>
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
  variant?: "primary" | "sage" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  onClick?: () => void; className?: string;
  type?: "button" | "submit"; disabled?: boolean;
}) {
  const sizes = { sm: "px-4 py-2 text-xs", md: "px-6 py-3 text-sm", lg: "px-8 py-4 text-sm" };
  const variants: Record<string, string> = {
    primary: "bg-ink text-white hover:bg-ink-hover",
    sage:    "bg-sage text-white hover:bg-sage-hover",
    outline: "border border-ink text-ink hover:bg-ink hover:text-white",
    ghost:   "text-body hover:text-ink hover:bg-black/5",
    // `white` (border-only, over an image) is deliberately gone. It had no call
    // sites left and it is the treatment that failed on the home hero: a border
    // needs a known ground, and a CMS-authored photograph is by definition not one.
    // If a secondary is ever needed on an image again it must carry its own fill.
    danger:  "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-2 font-medium tracking-wide transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

// ─── Form primitives ──────────────────────────────────────────────────────────
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="text-[10px] font-semibold text-ink-soft uppercase tracking-widest block mb-1.5">
      {children}
    </label>
  );
}

export function Input({ value, onChange, placeholder, type = "text", className = "", defaultValue, inputMode }: {
  value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string; className?: string; defaultValue?: string;
  inputMode?: "numeric" | "text" | "decimal";
}) {
  return (
    <input type={type} value={value} defaultValue={defaultValue} onChange={onChange}
      placeholder={placeholder} inputMode={inputMode}
      className={`w-full border border-ink/20 bg-white px-3 py-2.5 text-sm text-ink placeholder-quieter focus:outline-none focus:border-sage transition-colors ${className}`} />
  );
}

// ─── Closing CTA banner ───────────────────────────────────────────────────────
// THE closing call to action, shared by every marketing page. Before this, each
// page had grown its own: two buttons here, one there; a WindowMark in a bordered
// box on home, a GhostMark watermark on contact and resources, none on how-it-works;
// and section padding that ranged from py-8 to an outright asymmetric pt-2/pb-16.
//
// The shape is fixed on purpose — headline, one line of copy, ONE action reading
// "Get a quote". A closing banner that offers a choice is asking the visitor to
// make a decision at the moment you want them to act, and the variations were
// pure drift rather than per-page intent.
//
// It renders its own <section>, so the padding above and below is identical and
// cannot drift again: a caller that only got the inner panel would still be free
// to wrap it in whatever spacing it liked, which is how this diverged the first time.
export function CtaBanner({ title, sub, onQuote, ground = "paper" }: {
  title: string;
  sub: string;
  /** Must navigate to the quote page. Pages own their own routing, so the
   *  handler is passed in rather than the component reaching for a router. */
  onQuote: () => void;
  /** Which light surface this instance sits on.
   *
   *  The ground was hardcoded to paper, which is right for the CLOSING banner —
   *  it follows a bone section on every page. It is wrong for a banner used
   *  mid-page: on home the proof-point banner follows "The minute", which is
   *  also paper, and two paper sections in a row is the seam disappearing again.
   *  A shared component cannot know which position it is in, so the page says. */
  ground?: "paper" | "bone";
}) {
  return (
    <section className={`${ground === "bone" ? "ground-bone" : "ground-paper"} border-t border-black/8 py-14`}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="bg-sage px-6 sm:px-10 py-10 split-row is-center">
          <div className="split-prose">
            <h2 className="text-white font-semibold leading-tight mb-1.5"
              style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.4rem, 2.4vw, 1.9rem)" }}>
              {title}
            </h2>
            <p className="text-white/85 text-[15px] md:text-base leading-relaxed">{sub}</p>
          </div>
          <div className="md:flex-shrink-0">
            <Btn variant="primary" size="lg" onClick={onQuote}>
              Get a quote <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Btn>
          </div>
        </div>
      </div>
    </section>
  );
}
