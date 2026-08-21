// The Projects queue — what the list IS, with nothing about how it is drawn.
//
// ── WHY THIS IS NOT IN src/data ──────────────────────────────────────────────
// ADR 0006's admission rule (`docs/adr/0006-line-surface-shared-core-two-skins.md`
// on `design/ops2-planning`) admits a module to the shared core only if ALL four
// of its tests hold, and rule 2 is "BOTH SKINS CONSUME IT — a helper only one
// skin wants is that skin's helper." An operations queue is ops-only: the
// customer never sees who a project is waiting on, let alone a list of other
// people's. So it sits in the ops2 skin, exactly as `../nav/destinations.ts`
// states its own reason for doing the same.
//
// It is nevertheless written to pass rules 1, 3 and 4 — facts and derivations
// only, no React, no Ionic, no router, no CSS, no fetch client — so that it is
// testable from node today (scripts/tests/ops2-projects.test.mjs bundles it with
// esbuild) and so a future obligation to share it is a move, not a rewrite.
//
// ── THE ONE RULE THAT GOVERNS THIS FILE ──────────────────────────────────────
// ONE SELECTOR. The list and every number on screen go through `selectProjects`.
// The mock had to fix this in the open (`9e5f11b6` on `design/ops2-planning`):
// a count computed by a different path from the result it predicts will
// eventually disagree with it, and nothing on screen tells the reader which of
// the two is lying. `Needs us` read 2 and showed none.

/** Who the job is waiting on. The server's own word, from `worker/lib/lifecycle.ts`. */
export type WaitingOn = "Us" | "Customer" | "Nobody";

/** The six coarse segments a job moves through — `worker/lib/lifecycle.ts`. */
export type Phase = "Intake" | "Pricing" | "Issued" | "Accepted" | "Production" | "Delivered";

/**
 * One row of `GET /api/ops/projects`, narrowed to what the queue reads.
 *
 * Narrow on purpose, and declared here rather than imported from
 * `src/ops/api.ts`: that file is the LEGACY skin, and ops2 importing it would
 * tie the console being built to the console it replaces. The same reasoning
 * `../nav/account.ts` gives for narrowing `/api/ops/me`.
 *
 * `value` is DOLLARS, not cents (worker/routes/ops.ts sums `quote_line.line_total`
 * and `order.total`, both dollars). The mock's `totalCents` is a mock fixture
 * and is not this.
 */
export interface ProjectQueueRow {
  id: string;
  ref: string;
  title: string;
  customerName: string | null;
  org: string | null;
  lineCount: number;
  /** Dollars. `null` is a real state — a job nobody has priced yet. */
  value: number | null;
  /** Which kind of number `value` is: an estimate, an issued quote, a contract. */
  valueBasis: string;
  /** Lines that are not `ready`, or carry no total. The server's `unresolved`. */
  unresolved: number;
  /**
   * Would `issueQuote` accept this project right now?
   *
   * THE GATE'S OWN ANSWER (`worker/lib/issue.ts` `issuableNow`), carried on the
   * row rather than re-derived here. It WAS re-derived — ours, in pricing,
   * nothing unresolved — and that agreed with the gate on two of its four
   * guards: it counted projects with no lines at all (nothing unresolved
   * because nothing exists) and every project whose delivery was still
   * unsettled. Both would have been counted, filtered to and opened by a
   * reviewer hunting for work that could go out, with the refusal arriving only
   * after the trip.
   */
  issuable: boolean;
  waitingOn: WaitingOn;
  /** Whole days since the job last moved. `null` when the server could not say. */
  daysInStage: number | null;
  phase: Phase;
  /** The precise state in words, under the phase. Never instead of it. */
  stateLabel: string;
  orderNo: string | null;
}

/** Which of the three chips is on. Three is the owner's cap, stated as a rule:
 *  "3 quick filters max + filter icon with bubble." */
export type ChipKey = "all" | "us" | "customer";

export interface QueueQuery {
  chip: ChipKey;
  refinements: readonly RefinementKey[];
  /** Raw text as typed. Trimming and casing are this module's business. */
  search: string;
}

export type RefinementKey = "ready" | "unresolved" | "production";

/**
 * The chips — WHO IS WAITING, which is the question the queue exists to answer,
 * and the only axis that stays visible without a tap.
 *
 * THREE, and the cap is the owner's own rule: "3 quick filters max + filter icon
 * with bubble." It overturns the mock, which had reasoned its way to four
 * (`72abbe7b` on `design/ops2-planning`) on the grounds that "waiting on nobody
 * is where a project sits once it is in production, which is exactly what you
 * hunt for when a customer rings about work already underway". That reason is
 * carried forward rather than deleted with the segment — see `production` below.
 *
 * Never scrollable, and never a fourth: a fixed set that must all be reachable
 * cannot hide members off the edge (the destinations rule, applied one level
 * down). The `Nobody` state is still reachable, through the funnel.
 */
export const WAIT_CHIPS: readonly { key: ChipKey; label: string; waitingOn: WaitingOn | null }[] = [
  { key: "all", label: "All", waitingOn: null },
  { key: "us", label: "Needs us", waitingOn: "Us" },
  { key: "customer", label: "Customer", waitingOn: "Customer" },
];

/**
 * The funnel's refinements — everything that is not the wait axis, each one
 * independently settable, each carrying the count of what it would leave.
 *
 * `production` is the fourth chip's reason, kept and renamed to what it is
 * actually for. Naming the PHASE rather than the negative wait state also keeps
 * it off the chips' axis, so `Needs us` + `In production` is an honest empty
 * rather than a contradiction the reader has to work out — and the count beside
 * it says so before it is ticked.
 *
 * `ready` is the desktop strip's "Ready to issue" stat, expressed as a
 * refinement so the mobile layout, which has no room for a fourth chip, still
 * reaches it. It reads the SERVER'S `issuable` — the issue gate's own predicate
 * — rather than a rule of its own; see `ProjectQueueRow.issuable` for what
 * re-deriving it cost.
 */
export const REFINEMENTS: readonly {
  key: RefinementKey; label: string; test: (row: ProjectQueueRow) => boolean;
}[] = [
  // The server's verdict, and nothing else. Adding a client-side condition here
  // would recreate exactly the drift this replaced.
  { key: "ready", label: "Ready to issue", test: (r) => r.issuable },
  // UNRESOLVED, NOT "UNPRICED", and the difference is the server's own. The
  // endpoint counts `status <> 'ready' OR line_total IS NULL`, so a line that is
  // fully priced and sitting in technical review is unresolved and is not
  // unpriced. Calling it unpriced sends a reviewer to fix a price that is
  // already there — and this queue's whole job is directing attention.
  { key: "unresolved", label: "Unresolved lines", test: (r) => r.unresolved > 0 },
  { key: "production", label: "In production", test: (r) => r.phase === "Production" },
];

const REFINEMENT_BY_KEY = new Map(REFINEMENTS.map((r) => [r.key, r]));
const CHIP_BY_KEY = new Map(WAIT_CHIPS.map((c) => [c.key, c]));

/**
 * Arrival state.
 *
 * `us`, not `all`. The eyebrow calls this an OPERATIONS QUEUE and the governing
 * constraint is that a delayed glance costs a working day, so the first screen
 * answers "what needs a decision" rather than "here is everything". The owner's
 * desktop drawing marks `Needs us` selected; his later mobile drawing marks
 * `All`. ASSUMED: the desktop drawing decides it, and the mobile one is read as
 * illustrating chip states rather than specifying the default. One line to flip.
 */
export const EMPTY_QUERY: QueueQuery = { chip: "us", refinements: [], search: "" };

/**
 * Fixed order, not user-sortable: ours first, then longest neglected.
 *
 * The server already sorts this way (`worker/routes/ops.ts`) and states why —
 * NOT `updated_at`, because that moves when the CUSTOMER replies, which buries
 * the thing we have to do underneath the thing that just happened. The client
 * re-sorts rather than trusting arrival order because it filters, and a
 * filtered list that quietly changed its own order would be unreadable.
 */
const WAIT_RANK: Record<WaitingOn, number> = { Us: 0, Customer: 1, Nobody: 2 };

function byUrgency(a: ProjectQueueRow, b: ProjectQueueRow): number {
  return WAIT_RANK[a.waitingOn] - WAIT_RANK[b.waitingOn]
    || (b.daysInStage ?? 0) - (a.daysInStage ?? 0);
}

/**
 * A control on screen, reporting itself.
 *
 * THE COUNT AND THE QUERY TRAVEL TOGETHER, and that is the whole design. A
 * component renders `count` and, when tapped, applies `query` — so there is no
 * second path down which a number and the list it promises could disagree. The
 * mock had the two computed separately and they did disagree; the fix
 * (`9e5f11b6` on `design/ops2-planning`) was one selector, and this is that fix
 * made structural rather than remembered.
 */
export interface QueueControl {
  key: string;
  label: string;
  /** How many projects this control WOULD LEAVE — never "how many exist". */
  count: number;
  /** The state tapping it produces. Counted with exactly this. */
  query: QueueQuery;
  /** Is this control's state the one already on? */
  active: boolean;
}

const controlFor = (
  rows: readonly ProjectQueueRow[],
  key: string, label: string, query: QueueQuery, active: boolean,
): QueueControl => ({ key, label, count: selectProjects(rows, query).length, query, active });

/**
 * The chips, each counted against the refinements already on and the text
 * already typed — "what would I be left with", never "how many exist".
 */
export function chipStates(
  rows: readonly ProjectQueueRow[], query: QueueQuery,
): QueueControl[] {
  return WAIT_CHIPS.map((chip) => controlFor(
    rows, chip.key, chip.label, { ...query, chip: chip.key }, query.chip === chip.key,
  ));
}

/**
 * The funnel's refinements. Each count answers "what if I tick THIS one, with
 * everything else exactly as it is" — and for one already on, "what if I untick
 * it", because the query it carries is the toggle, not the addition.
 */
export function refinementStates(
  rows: readonly ProjectQueueRow[], query: QueueQuery,
): QueueControl[] {
  return REFINEMENTS.map((refinement) => {
    const active = query.refinements.includes(refinement.key);
    const refinements = active
      ? query.refinements.filter((k) => k !== refinement.key)
      : [...query.refinements, refinement.key];
    return controlFor(rows, refinement.key, refinement.label, { ...query, refinements }, active);
  });
}

/**
 * The attention strip's four numbers: the bold "N need us" and the three stat
 * columns beside it.
 *
 * Each REPLACES the filter state rather than adding to it — that is what a stat
 * column means when you tap it — so each carries a whole query with the
 * refinements cleared. The typed text is kept: a stat is an orientation within
 * whatever you are looking for, and silently dropping the search would move the
 * ground under a reviewer mid-hunt.
 */
export function headlineStats(
  rows: readonly ProjectQueueRow[], query: QueueQuery,
): QueueControl[] {
  const base = { search: query.search };
  const stats: { key: string; label: string; query: QueueQuery }[] = [
    { key: "needUs", label: "Need us", query: { ...base, chip: "us", refinements: [] } },
    { key: "waitingCustomer", label: "Waiting on customer", query: { ...base, chip: "customer", refinements: [] } },
    { key: "readyToIssue", label: "Ready to issue", query: { ...base, chip: "all", refinements: ["ready"] } },
    // "ALL", NOT the owner's drawn "All active", and the label is what changed
    // rather than the query. The endpoint returns every non-draft job including
    // completed ones (`after_sales`), and nothing in this codebase says which
    // stage ends a job: the dashboard's `active_orders` excludes after_sales and
    // cancelled, this list excludes neither. Inventing a cut-off here would be
    // inventing a business rule; overstating the work in hand would be worse.
    // So it says what it counts, it equals the All chip exactly, and what
    // "active" should mean goes to the owner as a question.
    { key: "allActive", label: "All", query: { ...base, chip: "all", refinements: [] } },
  ];
  return stats.map((stat) => controlFor(
    rows, stat.key, stat.label, stat.query, sameQuery(stat.query, query),
  ));
}

function sameQuery(a: QueueQuery, b: QueueQuery): boolean {
  return a.chip === b.chip
    && a.search === b.search
    && a.refinements.length === b.refinements.length
    && a.refinements.every((k) => b.refinements.includes(k));
}

// ── What a row says about itself ─────────────────────────────────────────────
// Sentences, not markup. Each one is the SERVER'S vocabulary passed through —
// `stateLabel` comes from worker/lib/lifecycle.ts, which exists so that "the
// record plane and the list cannot drift apart". A second vocabulary invented
// here would be a status rename that half the console never heard about.

/** Who is next, and at what: `Us · Technical review`. The desktop table's
 *  NEXT ACTION column, which is the reviewer's whole reason for scanning it. */
export function nextActionOf(row: ProjectQueueRow): string {
  return `${row.waitingOn} · ${row.stateLabel}`;
}

/** The card's status, top-right, in the owner's own wording — "the customer",
 *  not "customer". Colour never carries this alone: it reads in greyscale. */
export function waitingSentence(row: ProjectQueueRow): string {
  return row.waitingOn === "Customer" ? "Waiting on the customer"
    : row.waitingOn === "Nobody" ? "Waiting on nobody"
    : "Waiting on us";
}

/**
 * How long it has been sitting. Quiet by design — it qualifies the status
 * rather than being one.
 *
 * NULL IS RENDERED AS ABSENCE, never as zero. `daysSince()`
 * (worker/lib/lifecycle.ts) returns null on a timestamp it cannot parse, and
 * printing that as "0 days" would claim the job moved today: the most
 * reassuring possible lie about the one number this queue exists to surface.
 * The caller omits the element rather than printing a dash into the layout.
 */
export function ageLabel(
  row: ProjectQueueRow, options: { short?: boolean } = {},
): string | null {
  const days = row.daysInStage;
  if (days == null) return null;
  if (options.short) return `${days}d`;
  if (days === 0) return "today";
  return days === 1 ? "1 day" : `${days} days`;
}

/** An empty list, and the reason it is empty. */
export interface QueueEmptyState {
  headline: string;
  detail: string;
  /** The one way out, when the reader is the reason. Null when nothing is on. */
  clear: { label: string; query: QueueQuery } | null;
}

/**
 * WHY the list is empty — and the two reasons are opposites.
 *
 * "a filtered empty list and an empty queue are otherwise the same picture, and
 * they mean opposite things" (`72abbe7b` on `design/ops2-planning`). One is the
 * best news of the working day; the other is work that exists and cannot be
 * seen. So the screen never leaves the reader to infer which, and where the
 * reader is the cause it hands back the way out rather than describing it.
 *
 * The refinements are NAMED, never counted. A count says how many filters are
 * on and still leaves you guessing which row went missing and why — the same
 * argument the funnel's own escape strip was rebuilt on (`02623bae`).
 */
export function emptyStateFor(
  rows: readonly ProjectQueueRow[], query: QueueQuery,
): QueueEmptyState {
  // NOTHING AT ALL COMES FIRST, and the order is the point. With no rows the
  // chip and the refinements are not why the list is empty, so blaming them —
  // "Nothing is waiting on us", with a Show all that reveals nothing — sends a
  // reader hunting through filters for work that does not exist.
  if (rows.length === 0) {
    return {
      headline: "No projects yet.",
      detail: "A project appears the moment a customer submits one.",
      clear: null,
    };
  }

  const term = query.search.trim();
  if (term) {
    // IS IT STRANDED, OR IS IT ABSENT? Those are different sentences and only
    // one of them is worth a tap. A term that matches nothing anywhere is a
    // dead end; a term that matches somewhere else is a job sitting behind a
    // filter while somebody waits on the phone.
    //
    // ANY narrowing strands it — the chip, the refinements, or both. Testing
    // only the chip meant that with `All` selected and a refinement on, a search
    // for a project that refinement excluded reported "Nothing matches" and
    // blamed the term. The term was fine; a filter the reader had switched on
    // was hiding the job.
    const narrowed = query.chip !== "all" || query.refinements.length > 0;
    const elsewhere = selectProjects(rows, { chip: "all", refinements: [], search: query.search });
    if (elsewhere.length > 0 && narrowed) {
      return {
        headline: `Nothing matches “${term}” in this filter.`,
        detail: `${elsewhere.length === 1 ? "One project" : `${elsewhere.length} projects`} elsewhere in the queue — the filters are hiding ${elsewhere.length === 1 ? "it" : "them"}, not the search.`,
        clear: {
          label: `Search all ${elsewhere.length} project${elsewhere.length === 1 ? "" : "s"}`,
          query: { chip: "all", refinements: [], search: query.search },
        },
      };
    }
    return {
      headline: `Nothing matches “${term}”.`,
      detail: "Search covers the reference, the project and the customer.",
      clear: { label: "Clear search", query: { ...query, search: "" } },
    };
  }

  const active = query.refinements
    .map((key) => REFINEMENT_BY_KEY.get(key)?.label)
    .filter((label): label is string => !!label);
  if (active.length > 0) {
    return {
      headline: "No projects match these filters.",
      detail: `${active.join(" + ")} — nothing is left once these are on.`,
      clear: { label: "Clear filters", query: { ...query, refinements: [] } },
    };
  }

  if (query.chip === "us") {
    return {
      headline: "Nothing is waiting on us.",
      detail: "New submissions and enquiries land here as they arrive.",
      clear: { label: "Show all", query: { chip: "all", refinements: [], search: "" } },
    };
  }
  if (query.chip === "customer") {
    return {
      headline: "Nothing is waiting on the customer.",
      detail: "Issued quotes and invoices sent for payment land here.",
      clear: { label: "Show all", query: { chip: "all", refinements: [], search: "" } },
    };
  }

  // `All`, no refinements, no search — and rows exist. Unreachable while the
  // selector is consistent with itself (that state filters nothing out), and it
  // says so rather than inventing a fourth explanation for a fifth situation.
  return {
    headline: "No projects match.",
    detail: "Nothing is filtered, so this is unexpected — reload the console.",
    clear: null,
  };
}

// ── Reading the endpoint ─────────────────────────────────────────────────────

const WAITING: readonly WaitingOn[] = ["Us", "Customer", "Nobody"];
const PHASES: readonly Phase[] = ["Intake", "Pricing", "Issued", "Accepted", "Production", "Delivered"];

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * `GET /api/ops/projects` → rows, with absence preserved.
 *
 * The endpoint is staff-gated and behind Access, so a malformed body is not the
 * threat model. The reason to parse at all is narrower and worse: EVERY FIELD
 * THIS QUEUE READS MEANS SOMETHING WHEN ABSENT, and JavaScript's defaults for
 * absence are all reassuring. `undefined` days renders NaN; a missing figure
 * becomes $0, which is a priced-at-nothing claim; and a missing `waitingOn`
 * defaulting to "Us" would put a row into the queue's own attention bucket and
 * invent work. So absence stays absent, and the one guess made — an unknown
 * wait is `Nobody` — errs towards under-claiming rather than over-claiming.
 *
 * A row with no `id` is dropped outright: there is nothing to open, and nothing
 * stable to key a list on.
 */
export function parseProjectQueue(body: unknown): ProjectQueueRow[] {
  const projects = (body as { projects?: unknown } | null)?.projects;
  if (!Array.isArray(projects)) return [];

  return projects.flatMap((raw): ProjectQueueRow[] => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const id = str(r.id);
    if (!id) return [];
    const waitingOn = WAITING.find((w) => w === r.waitingOn) ?? "Nobody";
    const phase = PHASES.find((p) => p === r.phase) ?? "Intake";
    return [{
      id,
      ref: str(r.ref) ?? id,
      title: str(r.title) ?? "Untitled project",
      customerName: str(r.customerName),
      org: str(r.org),
      lineCount: num(r.lineCount) ?? 0,
      value: num(r.value),
      valueBasis: str(r.valueBasis) ?? "",
      unresolved: num(r.unresolved) ?? 0,
      // A ROW THAT DID NOT SAY IT CAN BE ISSUED CANNOT BE. Defaulting the other
      // way would put projects into a "ready to issue" filter on the strength
      // of a field the server forgot to send.
      issuable: r.issuable === true,
      waitingOn,
      daysInStage: num(r.daysInStage),
      phase,
      stateLabel: str(r.stateLabel) ?? phase,
      orderNo: str(r.orderNo),
    }];
  });
}

/** What the value column shows, and what kind of number it is. */
export interface RowPrice {
  text: string;
  /** `est.` / `issued` / `contract`. Null when there is no figure to qualify. */
  basis: string | null;
  priced: boolean;
}

/**
 * The figure, or the honest absence of one.
 *
 * NOT PRICED IS A STATE, NOT A ZERO. The server COALESCEs the line sum to 0, so
 * a job whose lines carry no totals arrives looking like a free job. "$0" would
 * be a priced-at-nothing claim about work nobody has costed — and unpriced work
 * is precisely what this queue exists to hunt for, so turning it into a
 * plausible-looking number is the worst available failure.
 *
 * The BASIS travels with the number because three different meanings occupy
 * this column, and worker/routes/ops.ts already states the reason: "a number
 * read down a phone with the wrong basis is worse than no number."
 *
 * en-AU, whole dollars. Cents on a queue row are noise at a glance, and every
 * ops surface in this product already rounds them away.
 */
export function priceOf(row: ProjectQueueRow): RowPrice {
  const value = row.value;
  // ZERO IS TWO DIFFERENT FACTS AND THE SUM ALONE CANNOT TELL THEM APART.
  //
  // The server COALESCEs the line sum to 0, so a job whose lines carry no
  // totals arrives looking like a free job. But $0 is ALSO a real price here:
  // staff can override a line to zero (worker/routes/ops.ts) and issuing only
  // refuses NULL totals (worker/lib/issue.ts). Reading `value <= 0` as absence
  // made a fully resolved zero-dollar job say both "ready to issue" and "not
  // priced" on the same row.
  //
  // So the ABSENCE is read from the lines, which is where it actually lives: a
  // zero sum with unresolved lines is nobody having costed it, and a zero sum
  // with no lines at all is nothing to cost. A zero sum with every line
  // resolved is a figure, and it prints.
  const missing = value == null
    || !Number.isFinite(value)
    || (value === 0 && (row.unresolved > 0 || row.lineCount === 0));
  if (missing) {
    return { text: "Not priced", basis: null, priced: false };
  }
  return {
    text: `$${Math.round(value).toLocaleString("en-AU")}`,
    basis: row.valueBasis || null,
    priced: true,
  };
}

/**
 * The row's one chip, or nothing at all.
 *
 * The exception is shown and the default suppressed: a row with nothing wrong
 * carries no chip, so the eye learns that a chip means something. The count is
 * the server's `unresolved` and the word is the server's word — see the
 * refinement above for why it is not "Unpriced".
 */
export function unresolvedBadge(row: ProjectQueueRow): string | null {
  return row.unresolved > 0 ? `Unresolved ${row.unresolved}` : null;
}

/** The three things a reviewer has in hand when a phone rings — and exactly the
 *  three the search field's own placeholder promises. */
function matches(row: ProjectQueueRow, term: string): boolean {
  return `${row.ref} ${row.title} ${row.customerName ?? ""} ${row.org ?? ""}`
    .toLowerCase().includes(term);
}

/** THE selector. Every list and every count on screen comes from here. */
export function selectProjects(
  rows: readonly ProjectQueueRow[],
  query: QueueQuery,
): ProjectQueueRow[] {
  const term = query.search.trim().toLowerCase();
  // SEARCH INTERSECTS THE CHIP — it does not neutralise it.
  //
  // The first version did neutralise it, for a real reason: someone rings about
  // a job and the caller does not know which chip happens to be selected. But
  // it made every label on the page lie. With a customer-owned project matched,
  // `Needs us` and `Customer` produced identical lists, and the attention strip
  // read "1 need us" about a job we were not holding — a count that was
  // arithmetically consistent with its own control and still wrong, because the
  // WORD on the control is part of the contract too.
  //
  // The phone call is answered by `emptyStateFor` instead: when a term matches
  // nothing here but something elsewhere, the empty state says so and offers the
  // wider search WITH ITS TRUE COUNT, so the tap is worth making.
  const waiting = CHIP_BY_KEY.get(query.chip)?.waitingOn ?? null;
  const refinements = query.refinements
    .map((key) => REFINEMENT_BY_KEY.get(key))
    .filter((r): r is (typeof REFINEMENTS)[number] => r !== undefined);

  return rows
    .filter((r) => waiting === null || r.waitingOn === waiting)
    .filter((r) => !term || matches(r, term))
    .filter((r) => refinements.every((f) => f.test(r)))
    .sort(byUrgency);
}
