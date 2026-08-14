// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT MODEL — the shared vocabulary of the customer account area.
//
// Semantic status system (spec §2.1): status is expressed with a DEDICATED
// palette — attention (amber) / positive (green) / working (slate) / muted — and
// always rendered as pill + icon + label, never colour alone. Sage stays reserved
// for primary CTAs. Each record's meta also carries its pending customer ACTION
// (accept · pay deposit · sign off · pay balance · answer · confirm) when one
// exists — the dashboard's "Needs you" tab renders those as enriched CTA rows.
// This module owns the account-wide data context.
// ═══════════════════════════════════════════════════════════════════════════════
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertCircle, Check, Loader2, Lock, Pencil } from "lucide-react";
import {
  getProjects, getOrders,
  type ApiProjectSummary, type ApiOrder, type ApiOrderLine,
} from "../data/api";

// ── Semantic tones ───────────────────────────────────────────────────────────
// Values live in theme.css; these are var() references so the account area
// re-themes with everything else. They were inline hex + rgba literals, which a
// palette change silently skipped.
export type Tone = "attn" | "pos" | "work" | "mute" | "draft";
export const TONE: Record<Exclude<Tone, "draft">, { text: string; bg: string; bd: string; node: string }> = {
  attn: { text: "var(--tone-attn)", bg: "var(--tone-attn-bg)", bd: "var(--tone-attn-bd)", node: "var(--tone-attn-node)" },
  pos:  { text: "var(--tone-pos)",  bg: "var(--tone-pos-bg)",  bd: "var(--tone-pos-bd)",  node: "var(--tone-pos)" },
  work: { text: "var(--tone-work)", bg: "var(--tone-work-bg)", bd: "var(--tone-work-bd)", node: "var(--tone-work)" },
  mute: { text: "var(--tone-mute)", bg: "var(--tone-mute-bg)", bd: "var(--tone-mute-bd)", node: "var(--tone-mute)" },
};

const PILL_ICON: Record<Tone, ReactNode> = {
  attn: <AlertCircle className="w-3 h-3" aria-hidden="true" />,
  pos: <Check className="w-3 h-3" aria-hidden="true" />,
  work: <Loader2 className="w-3 h-3" aria-hidden="true" />,
  mute: <Lock className="w-3 h-3" aria-hidden="true" />,
  draft: <Pencil className="w-3 h-3" aria-hidden="true" />,
};

// Status pill — icon + text label (accessibility: never colour alone).
export function StatusPill({ tone, children, icon }: { tone: Tone; children: ReactNode; icon?: ReactNode }) {
  const style = tone === "draft"
    ? { color: "var(--body)", background: "transparent", borderColor: "rgba(0,0,0,.10)", borderStyle: "dashed" as const }
    : { color: TONE[tone].text, background: TONE[tone].bg, borderColor: TONE[tone].bd };
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 border whitespace-nowrap t-label font-display"
      style={{ ...style }}>
      {icon ?? PILL_ICON[tone]}{children}
    </span>
  );
}

// ── Formatters ────────────────────────────────────────────────────────────────
const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
/** Money with cents in tabular data contexts: $41,600.00 */
export const money = (n: number | null | undefined) => (n == null ? "—" : aud.format(n));

const asDate = (s: string) => new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
/** "21 JUL 2026" (data-face contexts). */
export const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = asDate(s);
  return isNaN(+d) ? "—" : d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
};
/** "TUE 21 JUL 2026" for the dashboard date. */
export const fmtDayDate = (d: Date) =>
  d.toLocaleDateString("en-AU", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).replace(/,/g, "").toUpperCase();

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

export const initialsOf = (s: string) =>
  s.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "OF";

// ── Record state vocabulary ───────────────────────────────────────────────────
// The pending customer action a record carries, if any — the CTA the "Needs you"
// tab surfaces as an enriched row. Populated in the SAME switch case that sets
// needsYou so the count, the filter and the row's button read ONE source and
// cannot diverge. `rank` is the urgency order (balance 1 → sign-off 2 → deposit 3
// → answer 4 → accept 5 → confirm 6) that keeps the most time-critical action on
// top of the Needs-you list. The DRAFT carries needsYou:true (for its own copy)
// but NO action — the count/filter key on `action` presence, so the cart (which
// has its own ContinueProject section) is excluded.
export interface RecordAction { cta: string; when: string; rank: number }
export interface RecordMeta { pill: string; tone: Tone; needsYou: boolean; next: ReactNode; action?: RecordAction }

const b = (t: ReactNode) => <b className="text-ink font-semibold">{t}</b>;

export function orderMeta(o: ApiOrder): RecordMeta {
  const pay = (kind: "deposit" | "balance") => o.payments.find((p) => p.kind === kind);
  switch (o.stage) {
    case "deposit_invoiced":
      return { pill: "Deposit due", tone: "attn", needsYou: true, next: <>pay the {b("50% deposit")} of {b(money(pay("deposit")?.amount))} to begin</>, action: { cta: "Review & pay deposit", when: "Starts your order", rank: 3 } };
    case "deposit_paid":
      return { pill: "Preparing drawings", tone: "work", needsYou: false, next: <>We are preparing your shop drawings — no action needed</> };
    case "drawings_shared":
      return { pill: "Awaiting your sign-off", tone: "attn", needsYou: true, next: <>sign off {b(`${o.lineCount ?? "your"} shop drawings`)} to release manufacturing</>, action: { cta: "Open drawings", when: "Blocks manufacturing", rank: 2 } };
    case "drawings_signed_off":
      return { pill: "Drawings approved", tone: "work", needsYou: false, next: <>We are scheduling manufacturing — no action needed</> };
    case "manufacturing":
      return { pill: "In manufacturing", tone: "work", needsYou: false, next: <>On track · We are building — no action needed</> };
    case "qa_photos_shared":
      return { pill: "Quality check", tone: "work", needsYou: false, next: <>Quality photos shared — the balance invoice follows</> };
    case "balance_invoiced":
      return { pill: "Balance due", tone: "attn", needsYou: true, next: <>pay the final balance {b(money(pay("balance")?.amount))} to book delivery</>, action: { cta: "Review & pay balance", when: "Holds despatch", rank: 1 } };
    case "balance_paid":
      return { pill: "Confirm for despatch", tone: "attn", needsYou: true, next: <>confirm you're ready — despatch is booked on your OK</>, action: { cta: "Confirm for despatch", when: "Books delivery", rank: 6 } };
    case "customer_confirmed":
      return { pill: "Booking delivery", tone: "work", needsYou: false, next: <>Confirmed — We are booking your delivery (~2 weeks)</> };
    case "dispatched":
      return { pill: "Dispatched", tone: "work", needsYou: false, next: <>On its way — delivery is scheduled</> };
    case "delivered":
      return { pill: "Delivered", tone: "pos", needsYou: false, next: <>Delivered — after-sales support is available</> };
    default: // after_sales
      return { pill: "Completed", tone: "pos", needsYou: false, next: <>Completed — after-sales support</> };
  }
}

// One Project object end-to-end: "quote" is the price document that arrives inside
// a project, "Ordered" is the phase a project earns at acceptance. State copy
// follows that model — never "order" before acceptance.
export function projectMeta(p: ApiProjectSummary): RecordMeta {
  switch (p.status_customer) {
    case "draft":
      return { pill: "Draft — not submitted", tone: "draft", needsYou: true, next: <>finish {b(`${p.item_count} line${p.item_count === 1 ? "" : "s"}`)} and {b("submit for pricing")}</> };
    case "submitted":
      return { pill: "Being priced", tone: "work", needsYou: false, next: <>With Being priced — your reviewed quote usually lands within 2 business days</> };
    case "under_review":
      return { pill: "Being priced", tone: "work", needsYou: false, next: <>We are reviewing your specification — no action needed</> };
    case "needs_information":
      return { pill: "Needs your answer", tone: "attn", needsYou: true, next: <>answer our question so pricing can continue</>, action: { cta: "Reply now", when: "Pauses pricing", rank: 4 } };
    case "quote_issued":
      return { pill: `Quote ready${p.issued_revision_no ? ` · R${p.issued_revision_no}` : ""}`, tone: "attn", needsYou: true, next: <>review &amp; accept, then a {b("50% deposit")} of {b(money(p.issued_deposit))} starts your order</>, action: { cta: "Review & accept", when: "Your decision", rank: 5 } };
    case "expired":
      return { pill: "Expired", tone: "mute", needsYou: false, next: <>This quote expired — start a new one or contact us</> };
    default: // accepted / closed — the project is Ordered; the order row carries it
      return { pill: "Ordered", tone: "pos", needsYou: false, next: <>See the order for progress</> };
  }
}

// The permanent anchor for a record: the project reference carries identity across
// the whole life; the order number is acceptance-time meta for financial documents.
export const projectAnchor = (o: ApiOrder) => o.projectRef ?? o.orderNo;

// ── Line parsing (schedule-code anchored) ─────────────────────────────────────
export interface ParsedLine {
  code: string;
  room: string | null;
  productName: string;
  optionsSummary: string;
  width: string; height: string;
  qty: number;
  lineTotal: number | null;
}

const safe = (s: string | undefined): Record<string, any> => {
  try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
};

export function parseLine(l: ApiOrderLine): ParsedLine {
  const snap = safe(l.product_snapshot_json);
  const dims = { ...(typeof snap.dims === "object" && snap.dims ? snap.dims : {}), ...safe(l.dims_json) };
  const opts = typeof snap.options === "object" && snap.options ? snap.options as Record<string, string> : {};
  const optionsSummary = ["colour", "finish", "glass", "hardware"]
    .map((k) => opts[k]).filter(Boolean).slice(0, 2).join(" · ") || Object.values(opts).filter(Boolean).slice(0, 2).join(" · ");
  return {
    code: l.external_ref ?? "—",
    room: l.room_label ?? null,
    productName: String(snap.productName ?? snap.productSlug ?? "Product"),
    optionsSummary,
    width: String(dims.width ?? ""), height: String(dims.height ?? ""),
    qty: l.qty, lineTotal: l.line_total,
  };
}

/** HEIGHT FIRST, the joinery trade's order — see sizePhrase in configurator.ts.
 *  The stored fields keep their own names; only the rendering is reversed. */
export const dimsLabel = (l: ParsedLine) => (l.width && l.height ? `${Number(l.height).toLocaleString("en-AU")} × ${Number(l.width).toLocaleString("en-AU")}` : "—");

// ── Account-wide data (one fetch per shell mount) ─────────────────────────────
export interface AccountData {
  projects: ApiProjectSummary[] | null;
  orders: ApiOrder[] | null;
  loading: boolean;
  refresh: () => void;
}
export const AccountDataCtx = createContext<AccountData>({ projects: null, orders: null, loading: true, refresh: () => {} });
export const useAccount = () => useContext(AccountDataCtx);

export function useAccountData(): AccountData {
  const [projects, setProjects] = useState<ApiProjectSummary[] | null>(null);
  const [orders, setOrders] = useState<ApiOrder[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let off = false;
    Promise.all([getProjects().catch(() => ({ projects: [] })), getOrders().catch(() => ({ orders: [] }))])
      .then(([p, o]) => { if (!off) { setProjects(p.projects); setOrders(o.orders); } });
    return () => { off = true; };
  }, [tick]);
  return { projects, orders, loading: projects === null || orders === null, refresh: () => setTick((t) => t + 1) };
}

// Quote-lifecycle projects (everything not yet turned into an order).
export const quoteProjects = (projects: ApiProjectSummary[]) =>
  projects.filter((p) => ["draft", "submitted", "under_review", "needs_information", "quote_issued", "expired"].includes(p.status_customer));
