/* Fixtures — the R1 record from the interaction spec, hardcoded.
   Money is precomputed: "the client never sums money itself" is honoured by
   pretending these maps are server responses.

   `op` is the family's operation string — what the real Elevation gets from
   getFamily(...).operation. It is a separate field from the product NAME on
   purpose: "AMJ150T Series Lift-Sliding Door" resolves to plain `sliding` by
   name and loses the lift chevron. */

export type Part = { op: string; alongMm: number; qty?: number; label: string };

export type Lens = {
  key: "why" | "glass" | "build" | "price" | "trail";
  /** The section's verdict word — R-45: from a real field, never a constant. */
  verdict: string;
  tone?: "attention" | "quiet";
  /** R-44: a panel that failed to load says so in its own header. */
  failed?: boolean;
};

export type Line = {
  id: string;
  code: string;
  product: string;
  op: string;
  withdrawn?: boolean;
  heightMm: number;
  widthMm: number;
  qty: number;
  room: string;
  parts?: Part[];
  axis?: "vertical" | "horizontal";
  frame: string;
  glazing: string;
  variantId: string;
  priceCents: number | null; // null = not priced
  state: "ready" | "needs review";
  flags: string[];
  notes: { who: string; body: string }[];
  lenses: Lens[];
  /** The Why lens body — recommendation_basis, humanised. */
  basis: string;
  requirement: string;
  requirementMet: boolean;
};

export const RECORD = {
  ref: "OF-Q-10482",
  title: "Wattle Grove — Lot 14",
  customer: "Marchetti Constructions · Ana Bianchi",
  stateLabel: "Technical review",
  waitingOn: "us",
  daysInState: 3,
  gstMode: "ex GST" as const,
  goodsCents: 4822000,
  totalCents: 4880240,
  unpricedCount: 2,
  updatedAt: "09:14",
};

type Seed = Partial<Line> &
  Pick<Line, "id" | "code" | "product" | "op" | "heightMm" | "widthMm" | "qty" | "room" | "frame" | "glazing" | "variantId" | "priceCents" | "state">;

const L = (n: Seed): Line => ({
  flags: [],
  notes: [],
  basis: "the plan's window schedule",
  requirement: "Uw ≤ 4.3 · SHGC ≤ 0.50",
  requirementMet: true,
  lenses: [
    { key: "why", verdict: "plan" },
    { key: "glass", verdict: "meets" },
    { key: "build", verdict: "1 unit", tone: "quiet" },
    { key: "price", verdict: n.priceCents === null ? "no rate" : "set", tone: n.priceCents === null ? "attention" : "quiet" },
    { key: "trail", verdict: String((n.notes ?? []).length), tone: "quiet" },
  ],
  ...n,
} as Line);

export const LINES: Line[] = [
  L({ id: "l01", code: "W01", product: "AMJ58 Series Sliding Window", op: "sliding", heightMm: 1200, widthMm: 1800, qty: 1, room: "Living", frame: "AMJ58", glazing: "DG Low-E 4-12-4", variantId: "amj58-sl-dg", priceCents: 214000, state: "ready" }),
  L({ id: "l02", code: "W02", product: "AMJ58 Series Sliding Window", op: "sliding", heightMm: 1200, widthMm: 1500, qty: 1, room: "Bed 2", frame: "AMJ58", glazing: "DG Low-E 4-12-4", variantId: "amj58-sl-dg", priceCents: 186000, state: "ready" }),
  L({ id: "l03", code: "W03", product: "AMJ67T Series Casement Window", op: "casement", heightMm: 900, widthMm: 600, qty: 1, room: "Ensuite", frame: "AMJ67T", glazing: "DG Argon 4-16-4", variantId: "amj67t-cs-ar", priceCents: 98000, state: "ready" }),
  L({
    id: "l04", code: "W04", product: "AMJ67T Series Awning Window", op: "awning",
    heightMm: 1200, widthMm: 3300, qty: 1, room: "Bed 1",
    parts: [
      { op: "awning", alongMm: 900, qty: 1, label: "W04-a · awning 900" },
      { op: "fixed", alongMm: 1500, qty: 1, label: "W04-b · fixed 1500" },
      { op: "awning", alongMm: 900, qty: 1, label: "W04-c · awning 900" },
    ],
    axis: "vertical",
    frame: "AMJ67T", glazing: "DG Low-E 4-12-4", variantId: "amj67t-aw-le",
    priceCents: 184000, state: "needs review",
    flags: ["Glazing does not meet the requirement on this elevation."],
    notes: [{ who: "Gedas · Tue 09:12", body: "Customer asking about obscure glass here — check with AMJ." }],
    basis: "the plan's window schedule, sheet A-201",
    requirement: "Uw ≤ 3.9 · SHGC ≤ 0.44",
    requirementMet: false,
    lenses: [
      { key: "why", verdict: "plan" },
      { key: "glass", verdict: "misses", tone: "attention" },
      { key: "build", verdict: "3 units", tone: "quiet" },
      { key: "price", verdict: "set", tone: "quiet" },
      { key: "trail", verdict: "1", tone: "quiet" },
    ],
  }),
  L({ id: "l05", code: "W05", product: "AMJ67T Series Awning Window", op: "awning", heightMm: 600, widthMm: 600, qty: 1, room: "WC", frame: "AMJ67T", glazing: "DG Obscure 4-12-4", variantId: "amj67t-aw-ob", priceCents: 76000, state: "ready" }),
  L({
    id: "l06", code: "W06", product: "AMJ58 Series Fixed Window", op: "fixed",
    heightMm: 2100, widthMm: 600, qty: 1, room: "Stair void",
    frame: "AMJ58", glazing: "DG Toughened 6-12-6", variantId: "amj58-fx-tg",
    priceCents: null, state: "needs review",
    flags: ["No price for toughened 6-12-6 at this size."],
  }),
  L({
    id: "l07", code: "D01", product: "AMJ150T Series Lift-Sliding Door", op: "lift-slide",
    heightMm: 2400, widthMm: 3600, qty: 1, room: "Alfresco",
    parts: [
      { op: "lift-slide", alongMm: 900, qty: 2, label: "D01-a/b · lift-slide 900" },
      { op: "fixed", alongMm: 900, qty: 2, label: "D01-c/d · fixed 900" },
    ],
    axis: "vertical",
    frame: "AMJ150T", glazing: "DG Low-E 6-16-6", variantId: "amj150t-ls-le",
    priceCents: 1240000, state: "needs review",
    flags: ["Mixed frame systems on this elevation — confirm these couple."],
    lenses: [
      { key: "why", verdict: "plan" },
      { key: "glass", verdict: "meets" },
      { key: "build", verdict: "4 units", tone: "attention" },
      { key: "price", verdict: "set", tone: "quiet" },
      { key: "trail", verdict: "0", tone: "quiet" },
    ],
  }),
  L({ id: "l08", code: "D02", product: "AMJ95 Series Hinged Door", op: "hinged", heightMm: 2100, widthMm: 900, qty: 1, room: "Laundry", frame: "AMJ95", glazing: "DG Clear 4-12-4", variantId: "amj95-hd-cl", priceCents: 168000, state: "ready" }),
  L({ id: "l09", code: "W07", product: "AMJ58 Series Sliding Window", op: "sliding", heightMm: 1000, widthMm: 1200, qty: 1, room: "Kitchen", frame: "AMJ58", glazing: "DG Low-E 4-12-4", variantId: "amj58-sl-dg", priceCents: 152000, state: "ready" }),
  L({
    id: "l10", code: "W08", product: "AMJ67T Series Tilt-Turn Window", op: "tilt-turn",
    heightMm: 1000, widthMm: 900, qty: 1, room: "Kitchen",
    frame: "AMJ67T", glazing: "DG Low-E 4-12-4", variantId: "amj67t-tt-le",
    priceCents: 139000, state: "ready",
    /* R-44 in the flesh: one panel failed its own read and says so in its
       own header, so a collapsed failure can never hide. */
    lenses: [
      { key: "why", verdict: "plan" },
      { key: "glass", verdict: "could not load", failed: true },
      { key: "build", verdict: "1 unit", tone: "quiet" },
      { key: "price", verdict: "set", tone: "quiet" },
      { key: "trail", verdict: "0", tone: "quiet" },
    ],
  }),
  L({ id: "l11", code: "W09", product: "AMJ67T Series Awning Window", op: "awning", heightMm: 1200, widthMm: 1200, qty: 1, room: "Bed 3", frame: "AMJ67T", glazing: "DG Low-E 4-12-4", variantId: "amj67t-aw-le", priceCents: 121000, state: "ready" }),
  L({ id: "l12", code: "W10", product: "AMJ67T Series Louvre Window", op: "louvre", heightMm: 1200, widthMm: 900, qty: 1, room: "Bed 4", frame: "AMJ67T", glazing: "SG Clear 6", variantId: "amj67t-lv-sg", priceCents: 121000, state: "ready" }),
  L({
    id: "l13", code: "W11", product: "AMJ58 Series Fixed Window", op: "fixed",
    heightMm: 400, widthMm: 2400, qty: 1, room: "Hall highlight",
    frame: "AMJ58", glazing: "DG Clear 4-12-4", variantId: "amj58-fx-cl",
    priceCents: null, state: "needs review",
    flags: ["Below minimum height for this series — confirm intended."],
  }),
  L({ id: "l14", code: "D03", product: "AMJ95 Series Bi-Fold Door", op: "bi-fold", heightMm: 2100, widthMm: 3000, qty: 1, room: "Garage", frame: "AMJ95", glazing: "SG Clear 6", variantId: "amj95-bf-sg", priceCents: 214000, state: "ready" }),
  L({ id: "l15", code: "W12", product: "AMJ58 Series Sliding Window", op: "sliding", heightMm: 900, widthMm: 1500, qty: 1, room: "Rumpus", frame: "AMJ58", glazing: "DG Low-E 4-12-4", variantId: "amj58-sl-dg", priceCents: 276000, state: "ready" }),
  L({ id: "l16", code: "W13", product: "AMJ67T Series Casement Window", op: "casement", heightMm: 1350, widthMm: 600, qty: 1, room: "Study", frame: "AMJ67T", glazing: "DG Argon 4-16-4", variantId: "amj67t-cs-ar", priceCents: 232000, state: "ready" }),
  /* The unsized line — R-49's honesty case. Drawn as a square at reduced
     opacity, and NO leaders: a drawing may be indicative, a dimension may not. */
  L({
    id: "l17", code: "W14", product: "AMJ58 Series Sliding Window", op: "sliding",
    heightMm: 0, widthMm: 0, qty: 1, room: "Dining",
    frame: "AMJ58", glazing: "DG Low-E 4-12-4", variantId: "amj58-sl-dg",
    priceCents: 243000, state: "needs review",
    flags: ["Could not read a size for this opening from the schedule."],
  }),
  L({ id: "l18", code: "W15", product: "AMJ67T Series Awning Window", op: "awning", heightMm: 600, widthMm: 900, qty: 1, room: "Pantry", frame: "AMJ67T", glazing: "DG Clear 4-12-4", variantId: "amj67t-aw-cl", priceCents: 87000, state: "ready" }),
];

export const LENS_NAMES: Record<Lens["key"], string> = {
  why: "Why this product",
  glass: "Glass & thermal",
  build: "Build",
  price: "Price",
  trail: "Trail",
};

export const money = (cents: number | null): string =>
  cents === null
    ? "not priced"
    : "$" + (cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* "Server" price preview for the editor: glazing option deltas, precomputed. */
export const GLAZING_OPTIONS: { id: string; label: string; deltaCents: number }[] = [
  { id: "amj67t-aw-le", label: "DG Low-E 4-12-4", deltaCents: 0 },
  { id: "amj67t-aw-ar", label: "DG Argon Low-E 4-16-4", deltaCents: 25000 },
  { id: "amj67t-aw-ob", label: "DG Obscure 4-12-4", deltaCents: 12000 },
  { id: "amj67t-aw-cl", label: "DG Clear 4-12-4", deltaCents: -9000 },
];

/* D9 — the losing candidates, ranked, with reasons. */
export const CANDIDATES = [
  { rank: 1, name: "AMJ67T Awning · DG Low-E 4-12-4", verdict: "chosen", reason: "meets the schedule's Uw and SHGC" },
  { rank: 2, name: "AMJ67T Awning · DG Argon Low-E 4-16-4", verdict: "passes", reason: "meets both; $250 dearer per unit" },
  { rank: 3, name: "AMJ58 Awning · DG Low-E 4-12-4", verdict: "fails Uw", reason: "Uw 4.1 against a 3.9 requirement" },
  { rank: 4, name: "AMJ58 Awning · DG Clear 4-12-4", verdict: "fails Uw, SHGC", reason: "Uw 4.6, SHGC 0.61 — cheapest by $410" },
];

export const JOB_BLOCKS = [
  { key: "progress", name: "Progress", sub: "Technical review · waiting on us · 3 days" },
  { key: "payments", name: "Payments", sub: "No payments recorded.", absent: true },
  { key: "files", name: "Files", sub: "4 attached" },
  { key: "history", name: "History", sub: "23 events" },
  { key: "notes", name: "Notes", sub: "2 on this job" },
] as const;

/* ═══════════════════════════════════════════════════════════════════════════
   The PROJECT tab's material. "Job" is struck: CONTEXT.md's glossary lists it
   under Project's explicit _Avoid_ line ("job, enquiry"), so the old tab title
   was a vocabulary violation regardless of taste.
   ═══════════════════════════════════════════════════════════════════════════ */

export const PROJECTS = [
  { ref: "OF-Q-10482", title: "Wattle Grove — Lot 14", customer: "Marchetti Constructions", phase: "Technical review", waitingOn: "us", totalCents: 4822000, flagged: true },
  { ref: "OF-Q-10479", title: "Hillside Rd — Unit 3", customer: "Bellcorp Homes", phase: "Quoted", waitingOn: "the customer", totalCents: 2914500, flagged: false },
  { ref: "OF-Q-10471", title: "Marsden Estate — Stage 2", customer: "Aravel Group", phase: "Estimating", waitingOn: "us", totalCents: null, flagged: true },
];

/* ═══ DELIVERY ══════════════════════════════════════════════════════════════
   "once SOME number is available - that's up to ops to verify and confirm,
   update (most likely) and submit as part of the final quote. Do not overthink
   'why and where the number is coming from.'"

   So this is a figure and the ability to change it. There is deliberately NO
   zone, NO basis and NO rate arithmetic here: they would be reading with no
   change in behaviour, because ops rings the courier and updates the number
   whatever produced it.

   The review PATTERN transfers from a line — propose, confirm, override, submit.
   The DERIVATION surface does not: a line's reasoning is genuinely complex and
   the reviewer has to adjudicate it, whereas this is a table lookup about to be
   replaced by a phone call.

   `proposedCents: null` is an ERROR, not a variant. It is drawn plainly and the
   interface is not built around it. */
export const DELIVERY = {
  proposedCents: 58240 as number | null,
  /** What ops confirmed, after the call. Null until then. Updating is expected. */
  finalCents: null as number | null,
  note: "",
};

export const PAYMENTS = {
  orderNo: "10482",
  received: [] as { what: string; cents: number; when: string; how: string }[],
  expected: [
    { what: "Deposit · 30%", cents: 1446600, when: "on acceptance" },
    { what: "Balance", cents: 3375400, when: "before delivery" },
  ],
};

/* Files carry a SCAN STATE, because the download endpoint is gated on it:
   `GET /files/:id/download` serves only `clean` and answers 403 `quarantined`
   or 409 `scan_pending` otherwise (register row 206). A download control that
   does not know the state is a control that 403s in the user's face, so the
   state is part of the row. `POST /files/:id/rescan` exists (row 205) — and its
   failure is currently SWALLOWED, which is the one thing from the old console
   not carried across. */
export type ScanState = "clean" | "pending" | "quarantined";

export type FileRow = {
  name: string; kind: string; size: string; when: string; who: string;
  scan: ScanState; source?: boolean;
};

export const FILES: FileRow[] = [
  { name: "Lot14-windows-schedule.pdf", kind: "Schedule", size: "2.4 MB", when: "Mon 14:02", who: "Ana Bianchi", scan: "clean", source: true },
  { name: "elevation-A.pdf", kind: "Drawing", size: "1.1 MB", when: "Tue 09:20", who: "Gedas", scan: "clean" },
  { name: "AMJ67T-thermal-cert.pdf", kind: "Certificate", size: "480 KB", when: "Tue 09:24", who: "Gedas", scan: "clean" },
  { name: "site-photo-north.jpg", kind: "Photo", size: "3.2 MB", when: "Wed 08:03", who: "Ana Bianchi", scan: "pending" },
  { name: "schedule-v1-superseded.pdf", kind: "Schedule", size: "1.8 MB", when: "Mon 09:40", who: "Ana Bianchi", scan: "quarantined" },
];

export const HISTORY = [
  { when: "Tue 09:24", who: "Gedas", what: "Attached AMJ67T-thermal-cert.pdf" },
  { when: "Tue 09:12", who: "Gedas", what: "Note added to W04" },
  { when: "Tue 09:05", who: "Gedas", what: "Moved to Technical review" },
  { when: "Mon 14:06", who: "System", what: "Estimator proposed 18 lines" },
  { when: "Mon 14:02", who: "Ana Bianchi", what: "Uploaded Lot14-windows-schedule.pdf" },
];

export const PROJECT_NOTES = [
  { who: "Gedas · Tue 09:06", body: "Ana wants the alfresco door confirmed with AMJ before we issue." },
  { who: "Gedas · Mon 14:30", body: "Builder's own schedule, not an architect's — sizes may be nominal." },
];

/* Delivery is deliberately NOT here. See DeliveryPlane: it is reviewed where the
   money is read, alongside the lines it is charged against, not configured on a
   settings page. */
export const PROJECT_BLOCKS = [
  { key: "progress", name: "Progress" },
  { key: "payments", name: "Payments" },
  { key: "files", name: "Files" },
  { key: "history", name: "History" },
  { key: "notes", name: "Notes" },
] as const;
