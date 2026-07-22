// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT MODEL — the shared vocabulary of the customer account area.
//
// Semantic status system (spec §2.1): status is expressed with a DEDICATED
// palette — attention (amber) / positive (green) / working (slate) / muted — and
// always rendered as pill + icon + label, never colour alone. Sage stays reserved
// for primary CTAs. This module also derives the six customer action gates
// (submit · accept · pay deposit · sign off · pay balance · confirm) from the
// real project/order data, and owns the account-wide data context.
// ═══════════════════════════════════════════════════════════════════════════════
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertCircle, Check, Loader2, Lock, Pencil, X } from "lucide-react";
import {
  getProjects, getOrders,
  type ApiProjectSummary, type ApiOrder, type ApiOrderLine,
} from "../data/api";

// ── Semantic tones (authoritative hex from the approved mock's :root) ─────────
export type Tone = "attn" | "pos" | "work" | "mute" | "draft";
export const TONE: Record<Exclude<Tone, "draft">, { text: string; bg: string; bd: string; node: string }> = {
  attn: { text: "#A2610A", bg: "rgba(178,110,15,.10)", bd: "rgba(178,110,15,.34)", node: "#C07714" },
  pos:  { text: "#2C7A54", bg: "rgba(44,122,84,.10)",  bd: "rgba(44,122,84,.30)",  node: "#2C7A54" },
  work: { text: "#4C6A88", bg: "rgba(76,106,136,.10)", bd: "rgba(76,106,136,.30)", node: "#4C6A88" },
  mute: { text: "#8b897f", bg: "rgba(0,0,0,.045)",     bd: "rgba(0,0,0,.12)",      node: "#8b897f" },
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
    ? { color: "#5c5a56", background: "transparent", borderColor: "rgba(0,0,0,.10)", borderStyle: "dashed" as const }
    : { color: TONE[tone].text, background: TONE[tone].bg, borderColor: TONE[tone].bd };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.04em] px-2 py-1 border whitespace-nowrap leading-none"
      style={{ fontFamily: "'DM Mono', monospace", ...style }}>
      {icon ?? PILL_ICON[tone]}{children}
    </span>
  );
}

// Superseded pill (revision history).
export const SupersededPill = () => (
  <StatusPill tone="mute" icon={<X className="w-3 h-3" aria-hidden="true" />}>Superseded</StatusPill>
);

// ── Formatters ────────────────────────────────────────────────────────────────
const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
/** Money with cents in tabular DM Mono contexts: $41,600.00 */
export const money = (n: number | null | undefined) => (n == null ? "—" : aud.format(n));

const asDate = (s: string) => new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
/** "21 JUL 2026" (DM Mono contexts). */
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
export interface RecordMeta { pill: string; tone: Tone; needsYou: boolean; next: ReactNode }

const b = (t: ReactNode) => <b className="text-[#131311] font-semibold">{t}</b>;

export function orderMeta(o: ApiOrder): RecordMeta {
  const pay = (kind: "deposit" | "balance") => o.payments.find((p) => p.kind === kind);
  switch (o.stage) {
    case "deposit_invoiced":
      return { pill: "Deposit due", tone: "attn", needsYou: true, next: <>pay the {b("50% deposit")} of {b(money(pay("deposit")?.amount))} to begin</> };
    case "deposit_paid":
      return { pill: "Preparing drawings", tone: "work", needsYou: false, next: <>AMJ is preparing your shop drawings — no action needed</> };
    case "drawings_shared":
      return { pill: "Awaiting your sign-off", tone: "attn", needsYou: true, next: <>sign off {b(`${o.lineCount ?? "your"} shop drawings`)} to release manufacturing</> };
    case "drawings_signed_off":
      return { pill: "Drawings approved", tone: "work", needsYou: false, next: <>AMJ is scheduling manufacturing — no action needed</> };
    case "manufacturing":
      return { pill: "In manufacturing", tone: "work", needsYou: false, next: <>On track · AMJ is building — no action needed</> };
    case "qa_photos_shared":
      return { pill: "Quality check", tone: "work", needsYou: false, next: <>Quality photos shared — the balance invoice follows</> };
    case "balance_invoiced":
      return { pill: "Balance due", tone: "attn", needsYou: true, next: <>pay the final balance {b(money(pay("balance")?.amount))} to book delivery</> };
    case "balance_paid":
      return { pill: "Confirm for despatch", tone: "attn", needsYou: true, next: <>confirm you're ready — despatch is booked on your OK</> };
    case "customer_confirmed":
      return { pill: "Booking delivery", tone: "work", needsYou: false, next: <>Confirmed — AMJ is booking your delivery (~2 weeks)</> };
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
  const depositOf = (t: number | null) => (t == null ? null : Math.round(t / 2));
  switch (p.status_customer) {
    case "draft":
      return { pill: "Draft — not submitted", tone: "draft", needsYou: true, next: <>finish {b(`${p.item_count} line${p.item_count === 1 ? "" : "s"}`)} and {b("submit for pricing")}</> };
    case "submitted":
      return { pill: "Being priced", tone: "work", needsYou: false, next: <>With AMJ — your reviewed quote usually lands within 2 business days</> };
    case "under_review":
      return { pill: "Being priced", tone: "work", needsYou: false, next: <>AMJ is reviewing your specification — no action needed</> };
    case "needs_information":
      return { pill: "Needs your answer", tone: "attn", needsYou: true, next: <>answer AMJ's question so pricing can continue</> };
    case "quote_issued":
      return { pill: `Quote ready${p.issued_revision_no ? ` · R${p.issued_revision_no}` : ""}`, tone: "attn", needsYou: true, next: <>review &amp; accept, then a {b("50% deposit")} of {b(money(depositOf(p.issued_total)))} starts your order</> };
    case "expired":
      return { pill: "Expired", tone: "mute", needsYou: false, next: <>This quote expired — start a new one or contact AMJ</> };
    default: // accepted / closed — the project is Ordered; the order row carries it
      return { pill: "Ordered", tone: "pos", needsYou: false, next: <>See the order for progress</> };
  }
}

// The permanent anchor for a record: the project reference carries identity across
// the whole life; the order number is acceptance-time meta for financial documents.
export const projectAnchor = (o: ApiOrder) => o.projectRef ?? o.orderNo;

// ── The six customer gates (spec §7.3), ordered by urgency ────────────────────
export type GateTarget =
  | { kind: "order"; id: string }
  | { kind: "project"; id: string; status: string }
  | { kind: "quote-builder" };

export interface Gate {
  key: string;
  pill: string;
  tone: Tone;
  refLabel: string;
  title: string;
  desc: ReactNode;
  cta: string;
  when: string;
  target: GateTarget;
}

const amt = (n: number | null | undefined) => (
  <span className="font-medium" style={{ fontFamily: "'DM Mono', monospace", fontVariantNumeric: "tabular-nums", color: TONE.attn.text }}>{money(n)}</span>
);

export function deriveGates(projects: ApiProjectSummary[], orders: ApiOrder[]): Gate[] {
  const gates: Gate[] = [];
  const pay = (o: ApiOrder, kind: "deposit" | "balance") => o.payments.find((p) => p.kind === kind);
  const refOf = (o: ApiOrder) => `${projectAnchor(o)}${o.projectTitle ? ` · ${o.projectTitle}` : ""}`;

  for (const o of orders.filter((x) => x.stage === "balance_invoiced")) {
    gates.push({
      key: `bal-${o.id}`, pill: "Balance due", tone: "attn", refLabel: refOf(o),
      title: "Pay the final 50% balance to release despatch",
      desc: <>Quality photos shared. Balance of {amt(pay(o, "balance")?.amount)} is due before we book delivery.</>,
      cta: "Review & pay balance", when: "Holds despatch", target: { kind: "order", id: o.id },
    });
  }
  for (const o of orders.filter((x) => x.stage === "drawings_shared")) {
    gates.push({
      key: `sign-${o.id}`, pill: "Sign-off", tone: "attn", refLabel: refOf(o),
      title: "Review & sign off shop drawings",
      desc: <>{b(`${o.lineCount ?? "Your"} drawings`)} ready — check every dimension before manufacturing starts. Manufacturing is paused until you confirm.</>,
      cta: "Open drawings", when: "Blocks manufacturing", target: { kind: "order", id: o.id },
    });
  }
  for (const o of orders.filter((x) => x.stage === "deposit_invoiced")) {
    gates.push({
      key: `dep-${o.id}`, pill: "Deposit due", tone: "attn", refLabel: refOf(o),
      title: "Pay the 50% deposit to begin your order",
      desc: <>Deposit of {amt(pay(o, "deposit")?.amount)} starts shop drawings and books your build slot.</>,
      cta: "Review & pay deposit", when: "Starts your order", target: { kind: "order", id: o.id },
    });
  }
  for (const p of projects.filter((x) => x.status_customer === "needs_information")) {
    gates.push({
      key: `info-${p.id}`, pill: "Needs your answer", tone: "attn",
      refLabel: `${p.public_ref ?? "Project"} · ${p.title ?? "Project"}`,
      title: "AMJ has a question about your project",
      desc: <>Pricing is paused until you answer — it takes a minute and keeps your quote moving.</>,
      cta: "Reply now", when: "Pauses pricing", target: { kind: "project", id: p.id, status: p.status_customer },
    });
  }
  for (const p of projects.filter((x) => x.status_customer === "quote_issued")) {
    const dep = p.issued_total == null ? null : Math.round(p.issued_total / 2);
    gates.push({
      key: `accept-${p.id}`, pill: "Quote ready", tone: "attn",
      refLabel: `${p.public_ref ?? "Project"}${p.issued_revision_no ? ` · R${p.issued_revision_no}` : ""} · ${p.title ?? "Project"}`,
      title: "Review & accept your reviewed quote",
      desc: <>Reviewed quote total {amt(p.issued_total)}. Accept to start — we then issue a {b(`50% deposit invoice of ${money(dep)}`)}. Nothing is charged until you accept.</>,
      cta: "Review & accept", when: "Your decision", target: { kind: "project", id: p.id, status: p.status_customer },
    });
  }
  for (const o of orders.filter((x) => x.stage === "balance_paid")) {
    gates.push({
      key: `ok-${o.id}`, pill: "Confirm", tone: "attn", refLabel: refOf(o),
      title: "Confirm you're ready for despatch",
      desc: <>Balance received and quality photos shared — confirm to book delivery (~2 weeks).</>,
      cta: "Confirm for despatch", when: "Books delivery", target: { kind: "order", id: o.id },
    });
  }
  for (const p of projects.filter((x) => x.status_customer === "draft" && x.item_count > 0)) {
    gates.push({
      key: `draft-${p.id}`, pill: "Draft", tone: "attn",
      refLabel: p.title ?? "My Project",
      title: "Finish & submit for a full quote",
      desc: <>{b(`${p.item_count} line${p.item_count === 1 ? "" : "s"}`)} added · once you submit, AMJ prices it and issues your reviewed quote.</>,
      cta: "Finish & submit", when: "Est. " + money(p.draft_total), target: { kind: "quote-builder" },
    });
  }
  return gates;
}

// ── Line parsing (schedule-code anchored) ─────────────────────────────────────
export interface ParsedLine {
  code: string;
  room: string | null;
  productName: string;
  optionsSummary: string;
  width: string; height: string;
  qty: number;
  lineTotal: number;
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

export const dimsLabel = (l: ParsedLine) => (l.width && l.height ? `${Number(l.width).toLocaleString("en-AU")} × ${Number(l.height).toLocaleString("en-AU")}` : "—");

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
