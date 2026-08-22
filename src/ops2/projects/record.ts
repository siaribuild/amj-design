// The project record — what the surface IS, with nothing about how it is drawn.
//
// ── WHY THIS EXISTS RATHER THAN THE CUSTOMER'S OWN LINE COMPONENTS ───────────
// The owner's ruling, 2026-08-23: SHARE THE FACTS, LET EACH SKIN RENDER. The
// customer site's `src/components/quote-project/*` is the same list — and it is
// built on that site's Tailwind and its hundred-odd theme classes (`text-ink`,
// `t-data`, `quote-row`). ops2's stylesheet entry documents its refusal to
// import that sheet: "pulling it in would put two design systems in one bundle
// and make every later 'why is this component grey' a two-system question."
//
// So what is reused is the FACT and its derivation — the endpoint, its DTO, the
// server's own vocabulary for a line's state — and what is not reused is the
// markup. The promise "the reviewer sees the same list the customer does" is
// kept by this file: every field below is the one the customer's row reads, in
// the server's words, so the two lists can only disagree about typography.
//
// Same four rules as `./queue.ts`: facts and derivations only, no React, no
// Ionic, no router, no CSS, no fetch client — so it is testable from node and a
// future obligation to share it is a move rather than a rewrite.

/** Who the job is waiting on. The server's own word (`worker/lib/lifecycle.ts`). */
export type WaitingOn = "Us" | "Customer" | "Nobody";

/**
 * One action the server says can be taken on this job right now.
 *
 * NOT DERIVED HERE, AND THAT IS THE POINT. `worker/lib/ops-actions.ts` states
 * the contract: inapplicable actions are omitted, BLOCKED ones are returned
 * with a reason, and anything that moves money or emails the customer carries
 * the sentence to confirm with. "The Worker refuses what the UI hides, and the
 * UI cannot offer what the Worker would reject."
 *
 * This corrects a rule the console had been reading too broadly. "A human
 * overrides anything" is about DECISION AUTHORITY — a human may overrule a
 * recommendation, a guardrail, a configuration. It was never a licence to issue
 * a quote with a missing price or dimension, and `blockedReason` is where that
 * distinction lives: shown, refused, and said out loud.
 */
export interface RecordAction {
  id: string;
  label: string;
  tier: "primary" | "secondary" | "overflow";
  /** Applies, but cannot run yet. Rendered with this sentence beside it. */
  blockedReason?: string;
  /** Moves money or emails the customer ⇒ confirm before running. */
  confirm?: string;
}

/** A unit inside a composite opening. One opening, several joined frames. */
export interface RecordSegment {
  id: string;
  productName: string;
  width: string;
  height: string;
  /** HOW MANY OF THIS UNIT ARE IN ONE OPENING. `worker/lib/composite.ts`
   *  defines the stored `qty` as `parent.qty × qty_per_parent`, so reading that
   *  made the contents of a single opening claim every unit across all of them
   *  — a parent of 3 with 2 units each read "×6" inside one opening. */
  qty: number;
  /** And what that comes to across every opening on the line. */
  qtyTotal: number;
  lineTotal: number | null;
  note: string;
  status: string;
}

/**
 * One opening on the record — the customer's row, in the server's words.
 *
 * `lineTotal: null` is a REAL STATE and never a zero: an opening nobody has
 * priced is the thing this console exists to find, and rendering it as $0 is a
 * priced-at-nothing claim about work nobody has costed. The same reasoning
 * `./queue.ts` gives for the queue's money column, one level down.
 */
export interface RecordLine {
  id: string;
  /** The schedule code — `W01`, `D03`. Anchors every line, in the display face. */
  code: string;
  room: string;
  productName: string;
  width: string;
  height: string;
  qty: number;
  lineTotal: number | null;
  /** The server's own word: `ready` | `draft` | `needs_review` | … */
  status: string;
  /** Configured options, label → value. The spec, as the customer sees it. */
  options: Record<string, string>;
  /** Unresolved technical-review reasons the parser raised. */
  review: Record<string, string> | null;
  /** `simple` | `composite_parent`. A composite is ONE opening, several frames. */
  lineKind: string;
  segments: RecordSegment[];
}

export interface RecordDelivery {
  /** Settled figure. `null` is NOT SETTLED; `0` is settled (a trade waiver). */
  amount: number | null;
  settled: boolean;
  /** The FROZEN figure once a quote is accepted — what the customer agreed to.
   *  Wins over the project's live leg, which by then is only an estimate of a
   *  question already answered. */
  frozen: number | null;
  /** What the live rate table says it should be, whether or not it is settled. */
  estimate: number | null;
  suburb: string | null;
  postcode: string | null;
  zoneLabel: string | null;
}

export interface ProjectRecord {
  id: string;
  /** `OF-Q-10482`. Printed on every issued PDF, so it is never renamed. */
  ref: string;
  title: string;
  customerName: string | null;
  org: string | null;
  /** The precise state in words — the server's `statusInternalLabel`. */
  stateLabel: string;
  waitingOn: WaitingOn;
  /** Whole days since the job last moved. `null` when the server could not say. */
  daysInStage: number | null;
  /** Lines that are not `ready`, or carry no total. The server's count. */
  unresolved: number;
  lines: RecordLine[];
  delivery: RecordDelivery;
  actions: RecordAction[];
  /** The contract number once a quote has been accepted. */
  orderNo: string | null;
  /** The order's own total once one exists — freight included. */
  orderTotal: number | null;
}

// ── Reading the endpoint ─────────────────────────────────────────────────────
//
// The same reason `./queue.ts` parses at all, and it is not the threat model:
// the endpoint is staff-gated and behind Access. It is that EVERY FIELD HERE
// MEANS SOMETHING WHEN ABSENT and JavaScript's defaults for absence are all
// reassuring. A missing total becomes $0 — a priced-at-nothing claim. A missing
// `waitingOn` defaulting to "Us" invents work in the queue's own bucket. So
// absence stays absent, and the one guess made errs towards under-claiming.

const WAITING: readonly WaitingOn[] = ["Us", "Customer", "Nobody"];
const TIERS: readonly RecordAction["tier"][] = ["primary", "secondary", "overflow"];

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, string> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>)
      .filter(([, value]) => typeof value === "string")
      .map(([key, value]) => [key, value as string]),
  );
};

function parseSegment(raw: unknown): RecordSegment[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  if (!id) return [];
  return [{
    id,
    productName: str(r.productName) ?? "—",
    width: str(r.width) ?? "",
    height: str(r.height) ?? "",
    // `qtyPerParent` when the endpoint sends it; otherwise the stored figure,
    // which for a non-composite parent is the same number.
    qty: num(r.qtyPerParent) ?? num(r.qty) ?? 1,
    qtyTotal: num(r.qty) ?? num(r.qtyPerParent) ?? 1,
    lineTotal: num(r.lineTotal),
    note: str(r.note) ?? "",
    status: str(r.status) ?? "ready",
  }];
}

function parseLine(raw: unknown): RecordLine[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  // Nothing stable to key a list on, and nothing to open. Dropped outright.
  if (!id) return [];
  return [{
    id,
    code: str(r.code) ?? "",
    room: str(r.room) ?? "",
    productName: str(r.productName) ?? "—",
    width: str(r.width) ?? "",
    height: str(r.height) ?? "",
    qty: num(r.qty) ?? 1,
    lineTotal: num(r.lineTotal),
    status: str(r.status) ?? "ready",
    options: obj(r.options),
    review: r.review && typeof r.review === "object" ? obj(r.review) : null,
    lineKind: str(r.lineKind) ?? "simple",
    segments: Array.isArray(r.segments) ? r.segments.flatMap(parseSegment) : [],
  }];
}

/**
 * A CONTRACT line, mapped onto the same row the draft lines use.
 *
 * `order_line` carries less than `quote_line` — no configured options, no
 * status, no review flags — because by then those questions are settled. The
 * absent fields are absent rather than invented: an empty option map renders no
 * spec panel, which is correct, and `ready` is the only status a line that is
 * being manufactured to can be in.
 */
function parseOrderLine(raw: unknown): RecordLine[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  if (!id) return [];
  const segments = Array.isArray(r.segments) ? r.segments.flatMap(parseSegment) : [];
  return [{
    id,
    code: str(r.code) ?? "",
    room: str(r.room) ?? "",
    productName: str(r.productName) ?? "—",
    width: str(r.width) ?? "",
    height: str(r.height) ?? "",
    qty: num(r.qty) ?? 1,
    lineTotal: num(r.lineTotal),
    status: "ready",
    options: {},
    review: null,
    lineKind: segments.length > 0 ? "composite_parent" : "simple",
    segments,
  }];
}

function parseAction(raw: unknown): RecordAction[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const label = str(r.label);
  if (!id || !label) return [];
  return [{
    id,
    label,
    // An action of unknown tier is an OVERFLOW one. Erring towards `primary`
    // would promote something the server never meant to lead with, onto the one
    // control this screen makes prominent.
    tier: TIERS.find((t) => t === r.tier) ?? "overflow",
    blockedReason: str(r.blockedReason) ?? undefined,
    confirm: str(r.confirm) ?? undefined,
  }];
}

/** `GET /api/ops/projects/:id` → the record, with absence preserved. */
export function parseProjectRecord(body: unknown): ProjectRecord | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const p = b.project as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object") return null;
  const id = str(p.id);
  if (!id) return null;

  const lifecycle = (b.lifecycle ?? {}) as Record<string, unknown>;
  const delivery = (b.delivery ?? {}) as Record<string, unknown>;
  const order = (b.order ?? null) as Record<string, unknown> | null;

  return {
    id,
    ref: str(p.publicRef) ?? id,
    title: str(p.title) ?? "Untitled project",
    customerName: str(p.customerName),
    org: str(p.org),
    // The lifecycle's word first — it is the merged record's vocabulary and
    // covers the order stages too. `statusInternalLabel` only knows the quote.
    stateLabel: str(lifecycle.stateLabel) ?? str(p.statusInternalLabel) ?? "—",
    waitingOn: WAITING.find((w) => w === lifecycle.waitingOn) ?? "Nobody",
    daysInStage: num(b.daysInStage),
    unresolved: num(p.unresolvedLineCount) ?? 0,
    // ── WHICH LINES ARE THE RECORD ──────────────────────────────────────────
    // ONCE AN ORDER EXISTS, THE CONTRACT LINES ARE — including when there are
    // none of them. The endpoint returns both lists and says why: "Once the
    // quote is accepted the draft lines are no longer what anyone is building —
    // order_line is." Reading the draft list on an accepted job shows prices
    // and quantities nobody is manufacturing to.
    //
    // The first version of this fell back to the draft list when `orderLines`
    // came back empty, reasoning that an empty table is a worse answer than a
    // stale one. That was wrong, and the disagreement it left on screen is the
    // proof: an empty list is a FACT the surface can state, while a superseded
    // quote rendered as the record is a lie — sitting directly beside the
    // order's own total, which is the number it contradicts.
    lines: order
      ? (Array.isArray(b.orderLines) ? b.orderLines.flatMap(parseOrderLine) : [])
      : (Array.isArray(b.lines) ? b.lines.flatMap(parseLine) : []),
    delivery: {
      amount: num(delivery.amount),
      // The order's own delivery, captured at acceptance. Historical pre-0044
      // orders legitimately have `project.delivery_amount` unset while their
      // contract delivery is a settled zero, so reading the project's figure
      // made a real accepted order say "Delivery: Not set".
      frozen: order ? num(order.deliveryTotal) : null,
      // NOT a truthiness check, ever: 0 is settled — a trade waiver — and only
      // NULL is unset. The issue gate turns on exactly this distinction.
      settled: delivery.settled === true,
      estimate: num(delivery.estimate),
      suburb: str(delivery.suburb),
      postcode: str(delivery.postcode),
      zoneLabel: str(delivery.zoneLabel),
    },
    actions: Array.isArray(b.actions) ? b.actions.flatMap(parseAction) : [],
    orderNo: order ? str(order.orderNo) : null,
    orderTotal: order ? num(order.total) : null,
  };
}

// ── What the record says about itself ─────────────────────────────────────────

/**
 * Can THIS BUILD carry the action out?
 *
 * The server offers more than ops2 can yet perform — the order stage machine's
 * `advance:*` and `pay:*` moves, and anything needing something typed. Every
 * one of those is a real action with a real endpoint; none has a screen here.
 *
 * Stated as a predicate on the id rather than discovered when a button does
 * nothing. It mirrors `requestFor` in `./useProjectRecord.ts`, which is where
 * the routes live: if that map grows, this grows with it.
 */
export function runnableAction(action: RecordAction): boolean {
  return action.id === "start-pricing"
    || action.id === "issue-quote"
    || action.id.startsWith("status:");
}

/** The one action this screen leads with — and only if pressing it does something. */
export function primaryAction(record: ProjectRecord): RecordAction | null {
  const primary = record.actions.find((a) => a.tier === "primary");
  return primary && runnableAction(primary) ? primary : null;
}

/**
 * The next move, when this build cannot make it.
 *
 * NOT DROPPED, AND NOT A BUTTON. What happens next to a job is the single most
 * useful thing on this screen, and an accepted order's next move — record the
 * deposit, share the drawings — is exactly the kind of thing a reviewer opens a
 * record to find out. But rendering it as the primary CTA gave a button that
 * did nothing when pressed. So the caller states it as a sentence and says
 * where it can be done, which is the honest shape of a console mid-migration.
 */
export function pendingPrimary(record: ProjectRecord): RecordAction | null {
  const primary = record.actions.find((a) => a.tier === "primary");
  return primary && !runnableAction(primary) ? primary : null;
}

/** Everything else, for the overflow panel — in the server's own order, and
 *  only what this build can actually run. */
export function otherActions(record: ProjectRecord): RecordAction[] {
  return record.actions.filter((a) => a.tier !== "primary" && runnableAction(a));
}

/** Is this line one the reviewer still has to finish? The server's own test. */
export function lineUnresolved(line: RecordLine): boolean {
  return line.status !== "ready" || line.lineTotal == null;
}

export interface RecordTotals {
  /** The sum of the priced lines. */
  lines: number;
  /** How many lines carry no figure — so the sum can say it is partial. */
  unpriced: number;
  delivery: number | null;
  deliverySettled: boolean;
  /** Lines + delivery, or null while either is unknowable. */
  total: number | null;
  /** True while any line is unpriced: the figure is a floor, not a total. */
  partial: boolean;
}

/**
 * The foot of the list.
 *
 * A SUM OVER UNPRICED LINES IS A FLOOR, NOT A TOTAL, and the difference is the
 * whole reason this returns `partial` rather than a number and a shrug. Adding
 * up the lines that happen to have figures and calling it the total is how a
 * reviewer reads $18,000 for a job that will be $30,000 — the arithmetic is
 * right and the label is a lie.
 *
 * Delivery is added only when SETTLED. The live estimate is shown beside it as
 * an estimate, never folded into the total: it moves with the rate table, and a
 * total that changes because someone edited a zone is not a total.
 */
export function totalsFor(record: ProjectRecord): RecordTotals {
  const priced = record.lines.filter((l) => l.lineTotal != null);
  const lines = priced.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0);
  const unpriced = record.lines.length - priced.length;
  // AN ACCEPTED CONTRACT'S DELIVERY IS SETTLED BY DEFINITION — the customer
  // agreed to it. `0` counts, here as everywhere: only NULL is unset.
  const frozen = record.delivery.frozen;
  const delivery = frozen != null
    ? frozen
    : record.delivery.settled ? record.delivery.amount : null;
  const settled = frozen != null || record.delivery.settled;
  return {
    lines,
    unpriced,
    delivery,
    deliverySettled: settled,
    // ONCE AN ORDER EXISTS ITS TOTAL IS THE AUTHORITY. It carries the freight
    // and any adjustment made at acceptance; re-summing the draft lines
    // understates every contract by the delivery, which is a defect this
    // endpoint's own comments record having shipped once.
    total: record.orderTotal ?? (unpriced > 0 || delivery == null ? null : lines + delivery),
    partial: unpriced > 0,
  };
}

/** How long it has been sitting. NULL renders as absence, never as zero — a
 *  "0 days" on an unparseable timestamp is the most reassuring possible lie
 *  about the one number this console exists to surface. */
export function ageLabel(record: ProjectRecord): string | null {
  const days = record.daysInStage;
  if (days == null) return null;
  if (days === 0) return "today";
  return days === 1 ? "1 day" : `${days} days`;
}

/** The status sentence, in the owner's wording — "the customer", not "customer". */
export function waitingSentence(record: ProjectRecord): string {
  return record.waitingOn === "Customer" ? "Waiting on the customer"
    : record.waitingOn === "Nobody" ? "Waiting on nobody"
    : "Waiting on us";
}

/**
 * NO GST ON THIS CONSOLE — THE OWNER'S RULING, 2026-08-23: "no references to
 * GST, anywhere!! It's not a customer preference-driven site, an ops system
 * default approach that matters."
 *
 * Recorded here rather than left as an absence, because the absence looks like
 * an oversight and invites a future session to "fix" it. ops2 shows the stored
 * figure and says nothing about tax. ex/inc is a CUSTOMER ACCOUNT'S display
 * preference — `gstAdjust` and `gstSuffix` in `src/data/gst.ts` exist for the
 * surfaces that have an account to read it from, and this is not one of them.
 *
 * (For anyone reading a figure here and wondering: `src/data/gst.ts` line 1 —
 * "Catalogue prices are stored GST-INCLUSIVE (AU 10%)". That is a fact about
 * the store, not a caption for the screen.)
 *
 * This replaced an "ex GST" label, which was worse than either option: the
 * stored figures are inclusive, so it overstated the ex-GST value of every
 * price by 10% on the console where prices are reviewed before a customer sees
 * them.
 */

/** en-AU, whole dollars. Cents are noise at a glance and every ops surface in
 *  this product already rounds them away. */
export function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-AU")}`;
}

/** `1200 × 900` — the dimensions as one phrase, or nothing when either is
 *  missing. Half a size is worse than no size: it reads as a complete fact. */
export function sizeLabel(line: { width: string; height: string }): string | null {
  return line.width && line.height ? `${line.width} × ${line.height}` : null;
}
