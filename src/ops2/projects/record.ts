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
  /** THE UNIT'S OWN FAMILY, so a composite's drawing is built from what it is
   *  actually made of rather than from one family guessed for the whole
   *  opening. `null` draws the fallback frame; it never drops the unit. */
  productSlug: string | null;
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
  /** THIS UNIT'S OWN SPEC. Units of one opening differ — colour, glazing,
   *  hardware — and which ones is exactly what a reviewer checks before
   *  issuing. The endpoint supplies it per segment for that reason. */
  options: Record<string, string>;
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
  /** THE DRAWING'S ONE INPUT. `Elevation` resolves an opening's family through
   *  `getProductBySlug(productSlug)`; without it every row draws the fallback.
   *  `null` is a real state — an opening nobody has chosen a product for — and
   *  it draws a plain frame rather than removing the row. */
  productSlug: string | null;
  /** Which way a composite's units are stacked. Vertical splits the WIDTH (side
   *  by side), horizontal splits the HEIGHT. `quote_line.composite_axis`. */
  compositeAxis: "vertical" | "horizontal" | null;
  width: string;
  height: string;
  qty: number;
  lineTotal: number | null;
  /** Where the size came from — `schedule` (read off a plan) or `manual` (typed
   *  by a human). A number off a drawing and one given on the phone warrant
   *  different confidence, and the line's page says which. Absent on contract
   *  lines, where the question is settled. */
  origin: string | null;
  /** What the rate card said, when a human overrode it. `priceOverrideAt` being
   *  non-null is the whole test for "a human set this figure". */
  priceCalculated: number | null;
  priceOverrideAt: string | null;
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
  /** The destination, as an ADDRESS (0063). The zone still resolves from the
   *  postcode alone — none of the rest is an input to a price. */
  line1: string | null;
  line2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  zoneLabel: string | null;
  /** Whether this project is still inside the window the endpoint will accept
   *  a write in. Openability is derived from it, so it FAILS CLOSED: a record
   *  that cannot prove it is editable renders no door rather than a door onto
   *  a 409. */
  editable: boolean;
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
const AXES = ["vertical", "horizontal"] as const;
/** An axis the endpoint did not send is ABSENT, never guessed: `Elevation`
 *  divides a composite along it, and the wrong guess draws a real opening the
 *  wrong way round. */
const axis = (v: unknown): "vertical" | "horizontal" | null =>
  AXES.find((a) => a === v) ?? null;
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
    productSlug: str(r.productSlug),
    width: str(r.width) ?? "",
    height: str(r.height) ?? "",
    // `qtyPerParent` when the endpoint sends it; otherwise the stored figure,
    // which for a non-composite parent is the same number.
    qty: num(r.qtyPerParent) ?? num(r.qty) ?? 1,
    qtyTotal: num(r.qty) ?? num(r.qtyPerParent) ?? 1,
    lineTotal: num(r.lineTotal),
    note: str(r.note) ?? "",
    status: str(r.status) ?? "ready",
    options: obj(r.options),
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
    productSlug: str(r.productSlug),
    compositeAxis: axis(r.compositeAxis),
    width: str(r.width) ?? "",
    height: str(r.height) ?? "",
    qty: num(r.qty) ?? 1,
    lineTotal: num(r.lineTotal),
    origin: str(r.origin),
    priceCalculated: num(r.priceCalculated),
    priceOverrideAt: str(r.priceOverrideAt),
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
    productSlug: str(r.productSlug),
    compositeAxis: axis(r.compositeAxis),
    width: str(r.width) ?? "",
    height: str(r.height) ?? "",
    qty: num(r.qty) ?? 1,
    lineTotal: num(r.lineTotal),
    // ABSENCE STAYS ABSENT. A contract line carries no parse provenance and no
    // pre-override figure, because by then both questions are settled — so the
    // line page says nothing about them rather than inventing a default.
    origin: null,
    priceCalculated: null,
    priceOverrideAt: null,
    status: "ready",
    // The endpoint now forwards the accepted spec, reconstructed from the
    // snapshot. It used to drop it, which made every accepted row a product
    // name and a price — and non-expandable, on the one record where the spec
    // can no longer be edited and is therefore most worth reading.
    options: obj(r.options),
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
      line1: str(delivery.line1),
      line2: str(delivery.line2),
      suburb: str(delivery.suburb),
      state: str(delivery.state),
      postcode: str(delivery.postcode),
      zoneLabel: str(delivery.zoneLabel),
      editable: delivery.editable === true,
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

// ── What needs the reviewer ──────────────────────────────────────────────────
//
// TWO DIFFERENT FACTS, TWO OWNERS. Whether the quote CAN ISSUE stays the
// server's — `worker/lib/issue.ts`, spoken through `ops-actions.ts`'s
// `blockedReason` — and this console renders that sentence beside the disabled
// primary without ever re-deriving the gate. WHICH LINES need the reviewer is a
// property of the list the client already holds, and it is a queue with a count
// rather than one sentence. They read the same facts and cannot disagree; the
// suite pins that.

/**
 * The lines the list shows, and the one meaning of "attention" this surface has.
 *
 * OWNER, Q4: "everything requiring attention". It narrowed to lines carrying no
 * rate, so a line the list had already marked — leading edge painted, `needs
 * review` badge printed — could not be reached by the one control that exists to
 * reach it. Three of the five lines in the reported project were in exactly that
 * state.
 *
 * THE PREDICATE IS THE ROW'S OWN. `needsReview` is what paints the edge and the
 * badge; `lineTotal == null` is what prints `No rate` instead of a figure. The
 * filter shows precisely the rows that carry a mark, which is the only version
 * of this control that cannot disagree with the list it filters.
 *
 * It is also, on today's writers, exactly the set that blocks issuing: status is
 * derived as `no total -> incomplete`, `review reasons left -> technical_review`,
 * else `ready` (worker/routes/ops.ts:1159, lib/lines.ts:250, lib/parse.ts:363),
 * and both of those statuses are in `ISSUE_BLOCKING_LINE_STATUSES`. The two
 * halves below are one idea, not a union of two.
 */
export function needsAttention(line: RecordLine): boolean {
  return needsReview(line) || line.lineTotal == null;
}

export function visibleLines(record: ProjectRecord, filterOn: boolean): RecordLine[] {
  return filterOn ? record.lines.filter(needsAttention) : [...record.lines];
}

// ── What the drawing needs ───────────────────────────────────────────────────
//
// The mapping between a composite's units and `Elevation`'s `parts`, lifted out
// of the customer's own row (`src/components/quote-project/OpeningRow.tsx`) so
// the two consoles cannot draw the same opening differently. It is data, not
// markup: a pure function over the parsed line, testable from node.

/** The units of a composite as `Elevation` wants them, or `undefined` when
 *  there is nothing to divide.
 *
 *  `alongMm` is the size ALONG THE SPLIT: a vertical split puts the units side
 *  by side and so divides the WIDTH; a horizontal split stacks them and divides
 *  the HEIGHT. Fewer than two units is not a composite — one unit is a single
 *  frame, and handing the generator a one-element `parts` draws a join that
 *  does not exist. */
export function elevationPartsFor(line: RecordLine):
  { productSlug: string; alongMm: string; qty: number }[] | undefined {
  // UNITS, NOT ROWS. migrations/0028_composite_lines.sql states the shape
  // verbatim: "A symmetric 2x1800 split is one segment row with qty_per_parent
  // = 2, not two identical rows". Counting rows drew that supported storage as
  // a single frame — no mullion, and the review body treated a joined opening
  // as a simple one.
  if (joinedUnitCount(line) < 2) return undefined;
  return line.segments.map((s) => ({
    productSlug: s.productSlug ?? "",
    alongMm: line.compositeAxis === "horizontal" ? s.height : s.width,
    qty: s.qty,
  }));
}

/** How many frames this opening is actually made of. Σ `qtyPerParent`, which is
 *  a DIFFERENT FACT from the retired line quantity — which is why the row may
 *  print this while `×N` is gone. */
export function joinedUnitCount(line: RecordLine): number {
  return line.segments.reduce((n, s) => n + Math.max(1, s.qty), 0);
}

/** The units, flattened: a `qtyPerParent` of 2 is two units to review, not one
 *  row saying "2". */
export function unitsOf(line: RecordLine): RecordSegment[] {
  return line.segments.flatMap((s) =>
    Array.from({ length: Math.max(1, Math.floor(s.qty)) }, () => s));
}

/** `W04A`, `W04B`, … — the labels the schedule, the drawing and the factory
 *  ticket all use for the frames inside one opening. */
export function unitLabel(code: string, index: number): string {
  return `${code}${String.fromCharCode(65 + index)}`;
}

// ── What one row says about itself ───────────────────────────────────────────

/** The statuses the server flags for a human, whatever the parser said.
 *
 *  ONE VALUE, and the one that was removed is why this comment exists.
 *  `needs_review` is a `schedule_parse_job` status (migrations/0012) — no
 *  `quote_line` has ever carried it, on any writer or in the database. Its
 *  presence here made this set look BROADER than the blocking set below, which
 *  is what a careful reader then builds on: a distinction between "needs a human
 *  eye" and "stops the quote" that the schema does not have. Every writer
 *  derives `no total -> incomplete`, `reasons left -> technical_review`, else
 *  `ready` (worker/routes/ops.ts:1159, lib/lines.ts:250, lib/parse.ts:363), and
 *  both of those block. Owner, on the distinction: "I think you're
 *  overengineering it." */
const REVIEW_STATUS = "technical_review";

/**
 * Does this line need a reviewer's eye? ONE BOOLEAN, whatever the reason count.
 *
 * The parser can raise three separate reasons on one opening, and the rejected
 * surface printed each as its own chip. "It pollutes the screen. Highlight is
 * enough": the row carries one badge, and every reason is READ on the line's
 * own page, where the fix is.
 */
export function needsReview(line: RecordLine): boolean {
  return Object.keys(line.review ?? {}).length > 0 || line.status === REVIEW_STATUS;
}

/** What KIND of figure this line's price is. `no_rate` is the absence this
 *  console exists to hunt and is never a zero; `override` is a figure a human
 *  set over the rate card's, which `priceOverrideAt` alone decides. */
export function priceState(line: RecordLine): "no_rate" | "override" | "list" | "unknown" {
  if (line.lineTotal == null) return "no_rate";
  if (line.priceOverrideAt != null) return "override";
  // NOT EVERY UNSTAMPED FIGURE IS THE RATE CARD'S. Accepted order lines discard
  // the override metadata outright, and a composite parent can hold overridden
  // SEGMENTS while carrying no timestamp of its own — so "no timestamp" is the
  // absence of evidence, and reading it as "list price" states a provenance the
  // record does not have. `priceCalculated` is the rate card's own figure: when
  // it is on the row the comparison is real and the claim is earned.
  return line.priceCalculated != null ? "list" : "unknown";
}

/** One word for where the size came from, or nothing when there is nothing to
 *  say. A number read off a plan and one given on the phone warrant different
 *  confidence, and that word is the glanceable half. */
export function provenanceWord(line: RecordLine): string | null {
  if (line.origin === "schedule") return "from the schedule";
  if (line.origin === "manual") return "entered by hand";
  return null;
}

/**
 * The opening's size as one phrase — HEIGHT × WIDTH, the way every drawing,
 * schedule and factory ticket in this business is dimensioned.
 *
 * Half a size is named as the absence it is. `1200 ×` reads as a complete fact
 * with a rendering bug, and this is exactly the line a reviewer must not skim
 * past: the drawing beside it is a square stand-in for the same reason.
 */
export function sizeText(line: { width: string; height: string }): string {
  return line.width && line.height ? `${line.height} × ${line.width} mm` : "size not read";
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
  /** Everything the record already knows — the lines plus a delivery figure if
   *  there is one. ONE READER: the header's corner (`cornerFigure`), which
   *  shows it beside the count of what is still missing rather than under a
   *  caption claiming the sum is provisional. Leaving the settled delivery out
   *  of it produced rows that contradicted each other on the same panel:
   *  `Lines $1,000`, `Delivery $250`, and a corner reading `$1,000`. */
  subtotal: number;
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
    subtotal: record.orderTotal ?? lines + (delivery ?? 0),
    partial: unpriced > 0,
  };
}

/**
 * The figure in the header's trailing corner, and what qualifies it.
 *
 * THE CORNER NEVER GOES BLANK — it exists because the owner said the total was
 * the thing he missed from this view, and it is on screen at every scroll
 * position. But it may not print a bare number that implies completeness while
 * something is still unknown, so the absence is NAMED beside the figure:
 * `$48,802 · 2 no rate`.
 *
 * "so far" is not one of the answers. It was invented as a caption for exactly
 * this sum and the owner deleted it (R9); an absence with a count says more,
 * in the record's own vocabulary.
 */
export function cornerFigure(totals: RecordTotals): { amount: number; caveat: string | null } {
  if (totals.total != null) return { amount: totals.total, caveat: null };
  return {
    amount: totals.subtotal,
    // Lines lead here for the same reason they lead the attention row.
    caveat: totals.unpriced > 0 ? `${totals.unpriced} no rate` : "delivery not set",
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

/** Door labels. They name the DESTINATION rather than saying the card is
 *  pressable, because that string is the accessible name a screen reader
 *  reads in place of the card — and the totals card has no heading of its own
 *  to fall back on. */
export const deliveryPriceDoor = "Set the delivery price";
export const deliveryAddressDoor = "Change the delivery address";

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
