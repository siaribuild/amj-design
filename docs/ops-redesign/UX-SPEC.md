# THE BENCH — specification for the OpenFrame operations console

**Status:** approved specification. One design, one build. Supersedes the four concept
documents (`concept-workbench.md`, `concept-narrative.md`, `concept-flow.md`,
`concept-systems.md`), which remain readable as the arguments that produced it.

**Written against** six source inventories read in full: `inv-ops-ui.md`,
`inv-record-plane.md`, `inv-api-surface.md`, `inv-estimator.md`, `inv-pricing.md`,
`inv-design-language.md`. Every capability claimed below is traceable to one of them.
Where the database does not store a thing, this document says so on the screen rather than
designing around it.

**Deliverable:** one static, self-contained, interactive HTML file. No backend, no build step,
no network, fake data. **Styling is a later pass**, possibly onto a component library
(Fluid UI 2), so this spec is structure-first: every visual is a named component with props,
variants and states, and every colour is a token, never a literal.

---

## HOW THE FOUR PROPOSALS WERE JUDGED

| Criterion (weight) | Workbench | Narrative | Flow | Systems |
|---|---|---|---|---|
| Fidelity to the owner's brief | 7 | 8 | **9** | 7 |
| Coverage of today's functionality (no regression) | 7 | 7 | 8 | **9** |
| Honesty about what data exists | 9 | **10** | **10** | 9 |
| Workspace maximisation | **10** | 9 | 8 | 6 |
| Portability to a component library | 7 | 5 | 7 | **10** |
| Implementable without questions | 6 | 6 | **9** | 9 |
| **Total (of 60)** | 46 | 45 | **51** | 50 |

**Winner: `concept-flow.md` — "The Bench".** It is the only proposal that is simultaneously
a design and a buildable plan: to-scale wireframes for five screens, an honesty ledger split
into *already fetched / repairs / not proposed / must never be drawn*, a fixture list, and a
list of states the prototype must be able to reach without editing code. Its GATE-row order
flow is the best answer in the set to the owner's "order flow with relevant approvals along
the way", and its "a count is a filter over the rows on this page" is the strongest
correctness argument any of the four makes.

`concept-systems.md` came within one point and supplies what Flow lacks: a real component
vocabulary. Its material is grafted wholesale rather than paraphrased.

### The grafts, each named

| # | Graft | From | Replaces / adds to the Flow spine |
|---|---|---|---|
| G1 | **The 18-primitive component vocabulary**, `of-*` naming, ARIA-first state (`aria-selected`, `aria-expanded`, `aria-current`) with `data-*` only where ARIA has no word | Systems §3 | Flow's Appendix B was a list of names; this is §D of this spec, entire |
| G2 | **Two page archetypes** (`QueuePage`, `RecordPage`) and the coverage proof that every screen is one of them | Systems §3.2, §5.2 | Adds the rule that makes the console one thing |
| G3 | **The five-tone status system** (`ready / review / blocked / waiting / quiet`) and the 1:1 map that retires Enquiries' raw-Tailwind palette | Systems §3.8 | Flow had no tone system |
| G4 | **`RowList` with column-priority folding**, killing the table/card duality | Systems §3.7, H9 | Deletes 4 list implementations; gives Enquiries and Files their first phone layout |
| G5 | **`StateTrio`** — loading / empty / error as one component contract, with the named offenders | Systems §3.14, H10 | Flow named the bug; this makes it uninstantiable |
| G6 | **`SpecTable` rule: never drop a row to hide an absence** | Systems §3.9 | Fixes the customer detail's disappearing Phone row |
| G7 | **Conflict recovery that keeps the typed values** — refetch, keep the draft, mark each diverged field with a `DiffMarker` | Systems §6.5 | Turns a data-loss event into a decision |
| G8 | **`CUSTOMER SEES`** as a header metric from `project.statusCustomer` | Systems H4 | Combined with Flow's fuller "What the customer sees" panel |
| G9 | **The ten-hop derivation chain** as the structure of the evidence rail | Narrative §3.5 | Flow had two tabs; this is §F, entire |
| G10 | **"HOW FIRM IS THIS?"** — band as a word with its derivation printed, plus `missing_inputs`, plus basis | Narrative §3.6 | The honest replacement for "confidence 94%" |
| G11 | **The MACHINE PROPOSED / NOW / EDITED ledger** and the `edited_fields` lock sentence | Narrative §3.7 | Corrected for retrievability — see §F.4 |
| G12 | **`Absence` as a first-class primitive** | Narrative §8 | The atom that P2 is made of |
| G13 | **Twelve-stage order flow with the side of every step** (us / CUSTOMER) and `not recorded` where no timestamp is stamped | Narrative §4.2 | Fused with Flow's GATE rows into §G |
| G14 | **The 48px icon rail** that hover-expands, `⌘\` pins, and carries lane position + prev/next on a record | Workbench §2.1 + Flow §2.1 spine | Replaces Flow's 3-doors-plus-14-lanes and Systems' 224px rail |
| G15 | **Sheet view (`T`)** — today's full line table, one keystroke from master-detail, sharing the selection | Workbench §6 hard call 2 | Preserves cross-line comparison |
| G16 | **Scoped `busy` and errors rendered at the thing that failed**, with a persistent error count in the action bar | Workbench §5.4 | Flow agreed; Workbench specified it |
| G17 | **The component ledger's "backed by" column** — every component names the endpoint behind it | Workbench §8 | Makes §D a build contract, not a style guide |
| G18 | **Collapse keys `[` `]` `\` with per-destination memory** | Workbench §3.1 | Focus mode for a reviewer who wants the object alone |

### Conflicts settled — what was rejected, and why

| Conflict | Decision | Rejected | Reason |
|---|---|---|---|
| **What occupies the centre pane** | **The opening** — elevation, spec, units, coverage, thermal, review, price, and the editor in place | Flow's *dossier in the centre* (which follows the owner's wireframe) | Three of four proposals independently reached the same conclusion, and Flow's own §3.7 concedes it by widening the decision column to 520px when the editor opens. The evidence that exists is a filename, a synthesised sentence and an origin token: it reads well at 360px and gains nothing at 668px. What genuinely needs width is what is manipulated — two dimension fields, a product pair, a glazing picker, four option disclosures, a live elevation and a units table. **Space follows manipulation, not consultation.** This contradicts the owner's wireframe and is raised as Open Question 1 |
| **Global navigation shape** | **48px left icon rail**, hover-expands to 200px as an overlay, `⌘\` pins, six destinations | Narrative's 48px dark **top bar**; Systems' **224px** rail; Flow's **3 doors + 14 lanes** | The top bar cannot hold six destinations plus omnibox plus identity below 1180px without a "More" menu, which is the pattern the mobile bottom bar was deleted for. The 224px rail costs the centre pane 176px it cannot get back. Flow's lane rail is a second navigation and its own risk #1 says so |
| **Destination count** | **Six**: Work · Leads · Customers · Products · Archive · Settings | Systems' five (Files and Audit under Admin) | Files and Events are *reference* surfaces consulted about a record, not administration. Filing them under Settings makes a reviewer hunting a schedule pass the deposit percentage |
| **The headline gate metric** | **`LINES READY 5 of 8`**, with `3 unpriced or unresolved` as its caption | Owner's `APPROVED 0 / 3`; Narrative's `UNRESOLVED 2 of 3`; Flow's `Settled 1 / 3` | There is no per-line approval in this system — migration 0033 removed the engine and the endpoints. The real gate on the primary action is `unresolvedLineCount`. Positive framing reads as progress toward the gate; the caption keeps the blocking number visible. It counts machine-settled state, not human review — stated on screen, and Open Question 4 |
| **The selection log** | **Ship the panel with what is reachable today, and one explicit line naming the gap** | Systems' "deliberately not built"; Workbench/Narrative's "ship behind one new endpoint" | The owner named product selection logs specifically. Refusing to build it ignores the brief; building it against an endpoint that does not exist ships an empty box. The panel renders basis, band, missing inputs, rule/ranker/catalogue versions, target and chosen variant — all reachable — and then the sentence *"The candidate evaluation is recorded but no endpoint reads it."* |
| **Fixing a missing option price from the record** | **A link** — `Price this option ▸` → `#/products/options?slug=…` | Workbench's and Flow's inline `$` field | Identical outcome, one walk longer, zero new write surface on a screen that otherwise never writes prices. The component carries `mode: "link" \| "inline"` so the decision is one prop. Open Question 3 |
| **Revision tabs** | **Deleted; replaced by a revision ledger** | Keeping `Live draft / R3 / R2 / R1` | Selecting R2 today changes a heading and an editing lock and shows the live draft's rows underneath. A control that looks like a version switcher and is not is worse than none |
| **Presence** | **`Last change · maria · 14 Aug 09:12`** + `as of 14:32 · Refresh` | Keeping the hard-coded `editing elsewhere`; any presence dot | Nothing publishes presence. The current literal is shown unconditionally, which trains people to ignore a warning that never varies |
| **Approval steps anywhere in the quote flow** | **None built** | The owner's approval framing | See §G.4. What replaced approval is confirmation, versioned concurrency and an audit trail; the only surviving `approve/reject` state machine is the AI-learning adjudication, and it keeps its name where it belongs |

---

# A. THESIS AND PRINCIPLES

## A.1 The thesis

**The console is a bench with one job on it. Everything else is a way to pick that job up, or
a way to unblock it.**

A reviewer opens a job with a handful of openings and asks the same three questions of each
one, in order: *where did this come from, why is it this product, and is the number right?*
The console's entire purpose is to put that chain — document → extracted fact → opening →
requirement → candidate → chosen product → thermal verdict → price → the human's edits over
the top — in front of one person at one time, and then to let them move the job on. The
record is not a page inside the console; the console is the frame around the record.

The console earns its keep by being **specific about what it does not know**. It names a
missing page number, a missing orientation, a second candidate that scored within a hair. It
never converts an absence into a plausible-looking number, because the moment it does, every
number on the screen becomes a guess and the reviewer stops reading any of them.

That sentence settles arguments: **when a fact is not stored, the console prints the absence;
it does not close the gap. When two things compete for space, the one being manipulated
wins over the one being consulted. When a control would be a second way to reach something
the record already does, it is not built.**

## A.2 The seven principles

Each is stated so it can be shown false by looking at a screenshot or a diff.

**P1 — The record is the application.**
Any pixel that is not the record, its evidence, or its next action is chrome, and must
justify itself in a screenshot.
*Falsified if:* at a 1440×900 viewport the review workspace's centre pane is narrower than
700px, or permanent chrome (rail + header band + action bar) exceeds 18% of the viewport area.

**P2 — Absence is content.**
A value that is not stored renders as a **named absence** in the position the value would
have occupied — `not recorded`, `not set`, `no target derived`, `never checked`, `no business
name`. Never an em dash standing in for "we never asked", never a zero standing in for "could
not compute", never an invented mark, never an invented percentage. A row is never removed to
hide the fact that its value is missing.
*Falsified if:* any screen can render a plausible value that is not in the data, or any
key/value row disappears because its value is null.

**P3 — The word carries the state; colour is the second channel.**
Every status is a word, optionally joined by a tone and a 12px icon. No dot, ring, bar, hue
or progress indicator is ever the only carrier of meaning.
*Falsified if:* converting any screenshot to greyscale loses information.

**P4 — A count is a filter over the rows on this page.**
Every number in the console is clickable through to the rows that produced it, and is
computed from the same array those rows are rendered from. `GET /api/ops/summary` is used
only for the two figures nothing else can produce (Active orders, Customers) and for its
`degraded` flag.
*Falsified if:* any count and the list it links to can disagree, or any number is not
clickable to its rows.

**P5 — Blocked, never hidden. Inapplicable, never shown.**
The server derives the action set. The client renders every blocked action **disabled with
its reason printed beside it** — never in a tooltip, because a reason you must hover to read
is a reason nobody reads — and never renders an action the server would refuse.
*Falsified if:* a user must hover to learn why a control is disabled, or any control exists
whose endpoint would answer 403/404 for the current state.

**P6 — A failure is never rendered as emptiness, and never as loading.**
Loading, empty and error are three distinct renders with three distinct copies, scoped to the
pane that failed, each with its own retry.
*Falsified if:* any pane shows the same thing for "the server is down" and "there is nothing
here", or any pane's error state requires a full-page reload to clear.

**P7 — The evidence and the decision are on screen at the same time.**
No modal, drawer or overlay may cover the thing being decided about. Confirmation happens in
place, beneath the action that raised it. There is exactly one exception in the whole
console: the pricing ±20% tripwire, which is a *stop*, not a confirm.
*Falsified if:* a second modal appears anywhere, or any confirm hides the record it is about.

## A.3 Two standing constraints the principles inherit

- **No mock fallbacks** (owner directive). Already implemented in the design language:
  `OpsLogo` renders the business name or the literal word `OpenFrame` rather than an invented
  mark, "because an invented mark standing in for an unset logo is the thing that hides the
  fact that it is unset". P2 generalises that to every value in the console, including
  confidence: the codebase refuses to hide a failure "behind a fake confidence", so this
  console shows `confidence_band` (`high | medium | low`) with its derivation printed, and
  never a percentage.
- **No new functionality.** Every control in §B exists today. The three categories of change
  are: *same control, new address*; *already fetched, never drawn*; and *repairs* (a silent
  failure given words, a missing reload button, a hard-coded lie deleted). Anything needing a
  new endpoint is listed in §B.4.15–B.4.16 and renders an explicit unwired state until it exists.

---

# B. INFORMATION ARCHITECTURE

## B.1 The sitemap

Six destinations on a 48px icon rail. Two global surfaces reachable from anywhere: the
omnibox (`⌘K` / `/`) and the shortcut sheet (`?`). Hash routing throughout, so every screen
is addressable, refresh-safe and back-button-safe — which the console has never been.

```
RAIL (48px, --ops #14150F; hover/focus expands to 200px as an OVERLAY; ⌘\ pins)

  ▣  Work         #/work                   the one list of every job at every stage
  ✉  Leads        #/leads                  contact-page enquiries
  ◍  Customers    #/customers              registered accounts
  ▤  Products     #/products               rate cards · options · coverage · catalogue seam
  ⌸  Archive      #/archive/files          every file · every event
  ⛭  Settings     #/settings               staff & roles · commercial · catalogue · policy

  rail foot :  identity (name / email) · Sign out
  on a record: lane position "3 of 12 · Needs us" + [ ] to walk that lane
```

### The full URL table

```
#/work                                 the queue, default view (needs-us)
#/work/{view}                          needs-us | submitted | pricing | ready | payment
                                       | customer | production | open | all
#/r/{projectId}                        the record — opening scope, first flagged line selected
#/r/{projectId}/{lineCode}             a specific opening selected        e.g. #/r/OF-Q-10482/W03
#/r/{projectId}/{lineCode}?d={hop}     a derivation hop expanded          e.g. ?d=candidates
#/r/{projectId}?scope=record           the record scope (flow, revisions, payments, files…)
#/r/{projectId}?view=sheet             sheet view — the full line table
#/r/{projectId}?view=thermal           the whole-job thermal audit, full width
#/leads      #/leads/{view}            all | new | question | appointment | contacted | closed
#/leads/{id}
#/customers  #/customers/{id}
#/products   #/products/{productSlug}   #/products/options?slug=…
#/archive/files      #/archive/files?scan=pending
#/archive/events     #/archive/events?entity=project
#/settings/staff     #/settings/commercial     #/settings/catalogue
```

`Esc` unwinds exactly one level of that path; the browser Back button does the same, because
it is the same stack. The record header's ref is a click-to-copy of the current URL — the
thing people actually want to paste into chat.

### Role behaviour

`manufacturer` — the only role the Worker actually branches on — sees **one** rail item,
**Leads**, and lands on it. No Work, no Products, no Customers, no Archive, no Settings; the
omnibox is not offered, because `GET /api/ops/search` has no enquiry type to return. The rail
collapses to a title strip plus the identity block and **Sign out**, which also fixes the
documented bug that a manufacturer on a phone had no way to sign out. All other roles see all
six destinations. Access is otherwise flat by owner decision; only `admin` gates two writes
(a staff member's role, a customer's sign-in email) and both say so inline.

## B.2 Where each of today's eight tabs lands

| Today | Lands | Reached by | What changes |
|---|---|---|---|
| **Dashboard** | **Work** — the saved views at the head of the queue, plus a footer strip | Default landing | Its five "Needs us" rows become five views that *apply the filter* (today they switch tab and apply nothing). Its two shop counters become one muted footer line. `degraded: true` becomes a banner instead of zeros presented as fact |
| **Projects** | **Work** (list) + **Record** (`#/r/{id}`) | Rail, omnibox, any linked id | Gains URLs, `orderNo` and `updatedAt` (both fetched and never drawn), and a record that is a destination rather than local state |
| **Customers** | **Customers** | Rail | The 360's project and order rows become links into the record — today a dead end. Raw `status_customer` / `stage` get the same humanising as the rest of the console |
| **Enquiries** | **Leads** | Rail | Keeps every panel, vocabulary and control. Gains a phone layout (today an 860px table in a sideways scroller), the six server filters never exposed, the contact-log `note` the server already accepts, an error path on every write, and a link to the project when `projectId` is set |
| **Pricing** | **Products** + **Settings ▸ Commercial** | Rail | Rate cards, options and catalogue coverage collapse into one product list with a coverage column. Deposit % and the GST refutation move to Settings — neither is a product property |
| **Files** | **Archive ▸ Files** *and* the record's Files block | Rail; or from the record being worked on | The record finally gets the **Download** link the endpoint has always served. Sizes gain an MB tier. `kind`, `created_at`, `scan_engine`, `scanned_at` are drawn |
| **Audit** | **Archive ▸ Events** *and* the record's History | Rail; or the record | The `?entity=` server filter gets a control. `entity_id` becomes a link into the record it describes |
| **Admin** | **Settings ▸ Staff** | Rail | Same list, same select, plus the two sentences the screen owes its user (what the four roles actually gate; how `manufacturer` is really assigned) and a self-demotion confirm |

**Nothing is dropped.** Two things are demoted (Dashboard, Audit), one is split (Pricing), two
are merged (Files + Audit into Archive), and all six destinations are one keystroke away
(`g w`, `g l`, `g c`, `g p`, `g a`, `g s`).

## B.3 What is deliberately *not* a destination

- **Orders.** The record plane already merges project + quote + order by explicit owner
  decision; `GET /api/ops/orders` and `GET /api/ops/orders/:id` are fully implemented and have
  zero callers because of it. A separate Orders list re-splits the object and makes "where is
  OF-Q-10482 now" a two-list question. Orders are the `#/work/production`, `#/work/payment`
  and `#/work/all` views with the order-number line turned on, and the omnibox resolves an
  order number straight to its record.
- **A submissions queue.** `GET /api/ops/queues/submissions` exists with zero callers and is
  superseded by the merged list; its oldest-first triage intent *is* the queue's default
  server sort. It stays unsurfaced and is listed in §B.4.15 so it is not rediscovered as a gap.
- **An approvals queue.** The engine was retired in migration 0033. §G says what replaced it.

---

## B.4 THE NO-REGRESSION CONTRACT

Every capability named in the six inventories, with its address in the new design. This table
is the contract: if a row has no address, the redesign has lost something.

Legend — **REPAIR**: a defect fixed, not a feature added · **DRAW**: renders data the client
already receives and currently discards · **UNWIRED**: no endpoint reads it, so the screen
states the absence · **UNCHANGED**: same control, new address.

### B.4.1 Boot, brand, authentication, shell

| # | Capability today | Where it lives in the new design |
|---|---|---|
| 1 | `hydrateFromSanity()` blocks first paint with a blank page | Boot screen shows the brand mark plus `Loading the catalogue…` (`role="status"`) — **REPAIR** |
| 2 | Boot spinner on `bg-ops`, no text | Same ground, same mark, now with copy |
| 3 | `GET /api/ops/me` → sign-in or shell | **UNCHANGED**. The router resolves the hash *after* auth, so a deep link survives sign-in |
| 4 | `GET /api/ops/brand`; logo → business name → the literal word `OpenFrame`; an invented mark is banned | `Brand` component, three states, rule verbatim. Rail head, drawer head, sign-in |
| 5 | Sign-in card, `Internal console — staff sign-in` | `SignInPage`, §C.1 — every string preserved |
| 6 | `Work email` field; `Send code` / `Sending…` | **UNCHANGED** |
| 7 | Email regex fails → the button silently does nothing | Inline message `Enter a valid work email address.` — **REPAIR** |
| 8 | 6-digit code field, `••••••`, digits only, Enter submits | **UNCHANGED** |
| 9 | Dev-code banner `Dev mode — code is {code}` | **UNCHANGED**, dev only |
| 10 | `Sign in` / `Verifying…`; `← Change email` | **UNCHANGED** |
| 11 | `Something went wrong.` / `Invalid code, or this email isn't authorised for the ops console.` | **UNCHANGED**, verbatim |
| 12 | `Authorised staff only. Access is logged.` | **UNCHANGED**, verbatim |
| 13 | No resend, no expiry countdown (server expires at 10 min, never stated) | One added line: `Codes expire after 10 minutes.` No resend control — the endpoint is idempotent, so `Send code` again *is* the resend, and the copy says so — **REPAIR** |
| 14 | `Sign out`, awaited, `accessLogout` full navigation | Rail foot and drawer foot; behaviour unchanged |
| 15 | Role gating via `tabsFor` | Rail renders one destination for `manufacturer` — §B.1 |
| 16 | 8 nav tabs, lucide icons, sage active left border | 6 destinations, 48px icon rail, sage left marker on `aria-current` |
| 17 | Desktop rail `w-56` fixed, content offset `md:ml-56` | 48px rail; hover/focus expands to a 200px **overlay** (no layout shift); `⌘\` pins, persisted |
| 18 | Sticky white header carrying only the capitalised tab name | **Deleted.** The record header *is* the header; lists carry a compact list header. Returns 56px of vertical on every screen |
| 19 | Mobile drawer: 264px / 82vw, scrim, Esc, scroll lock, safe-area padding, 44px rows, overlay-never-a-route | **UNCHANGED** in every mechanic; now also carries the omnibox trigger — **REPAIR** (search did not exist below `md`) |
| 20 | Omnibox: 250 ms debounce, min 2 chars, 4 types, LIMIT 8 each, `label` + type + `hint` | `Omnibox` — same debounce, limits and hints; `hint` values humanised (today raw snake_case) |
| 21 | Selecting a result switches tab and **throws the id away** | Opens the record: `project`/`order` → `#/r/{id}`, `customer`/`organisation` → `#/customers/{id}` — **REPAIR** |
| 22 | No keyboard, no "no results", errors swallowed | `↑ ↓ Enter Esc`, grouped by type; `No matches for "{q}"`; `Search is unavailable.` — **REPAIR** |
| 23 | `Placeholder` component — unreachable dead code | **Deleted** |
| 24 | No routing, no back, no refresh-safe state | Hash router, §B.1 |
| 25 | No global error boundary | `AppFrame` boundary → `StateTrio.error` with a reload control — **REPAIR** |
| 26 | No manual refresh control anywhere | `as of HH:MM · Refresh` in every record header; per-pane `Retry` inside `StateTrio.error` — **REPAIR** |
| 27 | No toasts, no undo, no optimistic UI | Still none. §E.5 states why, and what stands in for each |

### B.4.2 Dashboard → Work

| # | Capability today | Where it lives in the new design |
|---|---|---|
| 28 | `GET /summary` → 7 counts | `activeOrders` and `customers` render in the Work footer strip. The other five are **recomputed from the `/projects` rows** so a count can never disagree with its list — P4 |
| 29 | Five "Needs us" rows with exact singular/plural copy | The five saved views at the head of Work; copy preserved as each view's label and empty-state sentence |
| 30 | Rows with count 0 are not rendered | The view chip renders showing `0` and is disabled — a hidden filter is a filter nobody knows exists — **REPAIR** |
| 31 | `Open →` switches tab without applying a matching filter | The view **is** the filter — **REPAIR** |
| 32 | Empty state: `Nothing is waiting on us.` / `New submissions and enquiries appear here.` | Verbatim, as the `needs-us` view's empty state |
| 33 | "The shop": `Active orders`, `Customers`, deliberately inert | Work footer strip; still inert, still muted, still not a link |
| 34 | Loading: bare spinner. Error: `Couldn't load the summary.` + raw error | `StateTrio` — skeleton on load, same error copy, `Retry` scoped to the strip |
| 35 | `degraded: true` ignored; zeros rendered as fact | Banner: `Counts could not be computed. These are not real zeros.` — **DRAW / REPAIR** |

### B.4.3 Projects list → the Work queue

| # | Capability today | Where it lives in the new design |
|---|---|---|
| 36 | 5 filter chips (`needs-us`, `open`, `customer`, `production`, `all`) | Five of the nine views; predicates unchanged |
| 37 | Server sort `Us → Customer → Nobody`, then longest `daysInStage` | **UNCHANGED and not overridable.** No clickable column headers: the sort is a deliberate refusal to order by `updated_at`, and a header that destroys it is a trap. Stated in the list footer |
| 38 | 9 desktop columns: Ref · Project · Customer · Lines · Value+basis · Stage · Waiting on · Days · Flags | `RowList`, same nine, column priorities in §C.3 |
| 39 | Phone card list, 5 rows, full-bleed | The same five facts produced by column-priority folding — one component, not two — **G4** |
| 40 | `Unpriced {n}` chip | `Chip` tone `review`, copy unchanged |
| 41 | `Waiting on` as the literal word; weight, not hue, as emphasis | **UNCHANGED**, `StatusWord` |
| 42 | Whole `<tr>` clickable → record | `RowList`: the whole row is the target on every surface |
| 43 | Empty ×2: `Nothing is waiting on us.` / `No projects match this filter.` | Verbatim |
| 44 | `{n} project(s) is/are with the customer` escape hatch | Verbatim; switches to the `customer` view |
| 45 | Fetch error degrades to the empty state | `StateTrio.error` — **REPAIR** |
| 46 | `orderNo` fetched, never rendered | Second line under `Ref` when an order exists — **DRAW** |
| 47 | `updatedAt` fetched, never rendered | `title` on the Days cell: `last touched 12 Aug 14:02` — **DRAW** |
| 48 | `phaseIndex` fetched, never rendered | Not rendered — the phase word is the value. Recorded here so it is not rediscovered as a gap |
| 49 | No bulk selection, export, pagination, in-list text search, saved views beyond the chips | Still absent. No bulk endpoint and no server sort/search/pagination parameter exists on any list endpoint. The omnibox is the search. §C.3 states the row ceiling honestly |

### B.4.4 The record — identity, lifecycle, actions

| # | Capability today | Where it lives in the new design |
|---|---|---|
| 50 | `← All projects` back control | `← Work` in the record header, returning to the lane you came from |
| 51 | `{publicRef} · {title}`; the ref is never renamed and never shown alone; the order number is deliberately not the anchor | Record header eyebrow + title, rule unchanged. The order number renders as a second eyebrow line when one exists — **DRAW** |
| 52 | Subtitle `org · customer · email`, falling back to submit-time contact for anonymous submitters | **UNCHANGED** |
| 53 | `contactPhone`, `deliverySuburb` fetched, never rendered | `Customer & contact` block in the record scope — **DRAW** |
| 54 | Money = sum of the displayed rows; caption `contract` / `issued` / `estimate` | Header metric `VALUE`; the basis word always travels with the number |
| 55 | `statusCustomer` fetched, never rendered | Header metric `CUSTOMER SEES {humanised}` — **DRAW, G8** |
| 56 | `unresolvedLineCount` | Header metric `LINES READY {n} of {m}` with caption `{k} unpriced or unresolved` |
| 57 | Phase ribbon — 6 equal cells, passed / current / future, never colour alone | `PhaseRibbon`, geometry and rule unchanged |
| 58 | Caption `Now · {stateLabel} · waiting on {x} · {n} days in this state` | Kept, with one honesty fix: **`{n} days since this record was last touched`**, because `daysInStage = daysSince(project.updated_at)` — **REPAIR** |
| 59 | 6 phases · 10 internal state labels · 12 order stage labels | Vocabulary unchanged, enumerated in §G.1 |
| 60 | Server-derived `actions[]`; exactly one primary; `tier` | `ActionBar` renders the contract verbatim and adds no rules of its own |
| 61 | `blockedReason` printed beside a disabled action | **UNCHANGED** — P5. Never a tooltip |
| 62 | 15 actions across 21 states: `start-pricing`, `issue-revision`, `status:technical_review_required`, `status:estimator_assigned`, `request-clarification`, `note`, `advance:*` ×9, `pay:deposit`, `pay:balance` | All present. §G.2 lists every one with its gate and its confirm sentence |
| 63 | `tier: "overflow"` declared, never produced | Not built. If a fifth action ever appears the bar wraps |
| 64 | Confirm-in-place, never a modal; label + consequence sentence + optional free text | `ConfirmInline` — P7. Placeholders verbatim: `Bank reference, e.g. EFT-4821` · `What should the file record?` · `What do you need from the customer?` |
| 65 | Note input is single-line; the server cap of 500 is neither shown nor enforced | Textarea with a live `n/500` counter and `⌘⏎` to submit — **REPAIR** |
| 66 | Every failure — including a row-level one — lands in the header error strip | Errors render **at the thing that failed**; the action bar keeps a persistent `{n} errors · show` — **G16 / REPAIR** |
| 67 | `ACTION_ERRORS` — 13 mapped codes with good copy | All 13 verbatim inside `ErrorInline` |
| 68 | ~11 codes fall through to `That action could not be completed.` | Each gets its own sentence: `not_found`, `forbidden`, `invalid_transition`, `invalid_segment`, `invalid_reason_code`, `opening_not_found`, `empty`, `invalid_amount`, `invalid_rule`, `unreadable_history`, `area_rate_still_includes_glass` (rendering the server's `detail`) — **REPAIR** |
| 69 | `OpsApiError.missingOptions[]` received and discarded | `No price is set for colour:monument.` + `Price this option ▸` — **DRAW** |
| 70 | Unresolved banner, full pluralisation | Verbatim, in the header band **and** at the foot of the openings pane, beside the lines that cause it |
| 71 | Four error messages instruct the user to reload; no reload control exists | `as of HH:MM · Refresh` in the header and `[ Reload this record ]` beside every 409 — **REPAIR** |
| 72 | Version tabs `Live draft / R3 / R2 / R1`; selecting one does **not** load that revision's lines | **Deleted.** Replaced by the **Revisions ledger** in the record scope: `R2 · issued 20 Jul · $12,196 · accepted 28 Jul`, from `issuedAt`/`acceptedAt` — **DRAW** — under the sentence *"Line detail for an issued revision is not retrievable; the table below is the live draft."* — **UNWIRED** |
| 73 | Hard-coded literal `editing elsewhere` | **Deleted.** Replaced by `Last change · {actor} · {when}` from `activity[0]` |
| 74 | Read-only bar `Viewing an issued revision — read-only. [Back to the live draft]` | Retained as the read-only state of the line table whenever `statusInternal` is outside the five editable states, with copy naming the real cause: `This quote is issued — lines are read-only until it returns to pricing.` |
| 75 | Line panel header `Draft lines / Contract lines / Issued lines` + `{n} lines` | Retained; count pluralised — **REPAIR** (`1 lines` today) |
| 76 | Contract-line shim (flattens every row to `ready`, drops composite structure) | Retained, and **named on screen**: `Contract lines are the accepted snapshot — composite structure and review flags are not carried into it.` — **REPAIR** |
| 77 | `EDITABLE` state set gates whether inputs render at all | **UNCHANGED**. The five states are the only ones that render an editor, so a Save can never silently 404 |

### B.4.5 The line table and the opening

| # | Capability today | Where it lives in the new design |
|---|---|---|
| 78 | 6-column line table: Code · Product · Size · Qty · Line total · State | **Sheet view** (`T`), verbatim, plus the openings pane's condensed form. §C.4.7 |
| 79 | Empty: `No lines on this project.` | Verbatim |
| 80 | Code cell in sage, data face | `Ref` lead, unchanged |
| 81 | Room (`line.room`) under the product | Opening header, unchanged |
| 82 | `configuration · {selectedVariantId}` under the product | Derivation hop 6 *and* the opening header, unchanged text |
| 83 | Review flags as a `<ul>` in warning ink, via `reviewReasons()` | `REVIEW` block in the opening, and a bullet under the row in the openings pane. Labels verbatim, including `No longer in current documents` and `Thermal configuration` |
| 84 | `composite · {n} joined unit(s)` in sage | Opening subtitle, unchanged |
| 85 | Mixed-product suffix (` · A + B`) when units differ | Unchanged |
| 86 | `frame system · {name}` / `mixed frame systems · A + B — confirm these couple` | Unchanged, in the opening header and derivation hop 8 |
| 87 | Size rendered **height × width** (trade convention) | **UNCHANGED everywhere.** The owner's wireframe reverses it; the house convention wins and is stated in §D |
| 88 | Qty displayed, never editable | **UNCHANGED**; the `SpecTable` row reads `Quantity 1` with hint `set at submission — not editable here` — **REPAIR** (the absence was silent) |
| 89 | State collapsed to `ready` / `needs review`, word carries it | **UNCHANGED** |
| 90 | `edit` ⇄ `close` and `split` / `units` links, editable states only | `[edit]` `[units]` / `[split]` on the opening header, same gating |
| 91 | No margin, cost, markup, discount or override column anywhere | Still none. Recorded here as deliberate: a computed margin over a system with no cost column would be a lie |
| 92 | No add-line, delete-line, duplicate or reorder | Still none, and **stated on screen** at the foot of the openings pane: `No line may be added or deleted from this console. Split and merge only.` — **REPAIR** |
| 93 | No per-line notes UI (`comment.line_id` exists, never written by the UI) | `+ note on W03` posts with `lineId`, which `POST /projects/:id/note` has always accepted — **DRAW** |
| 94 | No per-line file link, audit link, or comment thread | Notes are now per line; files and history stay record-scoped, with the derivation rail linking hop 1 to the file that produced the line |

### B.4.6 The line editor

| # | Capability today | Where it lives in the new design |
|---|---|---|
| 95 | `ItemForm` reused verbatim from the customer estimator | **UNCHANGED**, expanded in place in the centre pane |
| 96 | Item ID (`maxLength 10`, uppercased), duplicate → `Item ID already exist` | **UNCHANGED** |
| 97 | Product type / Product selects, `— withdrawn from sale`, `— different frame system` suffixes, `includeDisabled` | **UNCHANGED** |
| 98 | Dimensions disclosure, live elevation, height-first fields, range hint, undersize danger copy | **UNCHANGED** |
| 99 | Note field (`maxLength 500`) → `quote_line.room_label` | **UNCHANGED** |
| 100 | Options disclosures, glazing picker, colour swatches, `· required` | **UNCHANGED** |
| 101 | Debounced (250 ms) server price preview with GST suffix and ` · {unit} ea` | **UNCHANGED**; `Priced from its units` for a composite parent |
| 102 | `Confirmed on technical review before any deposit. Supply only.` | Verbatim |
| 103 | Issue line joining `itemIssues` messages | **UNCHANGED** |
| 104 | `Cancel` / `Save line` (`Saving…`), discard guard `Discard changes? Discard / Keep editing` | **UNCHANGED** |
| 105 | `canSave` guards (price preview, undersize, duplicate code, blocking issues) | **UNCHANGED** |
| 106 | Exact frame + glazing configuration select for AI-managed lines | **UNCHANGED**, above the form |
| 107 | Its 4 states: `Loading eligible configurations...` / `Select a currently eligible configuration` / `Eligible configurations could not be loaded.` + `Try again` / `No eligible, exactly priceable thermal configuration is available for this opening.` | Verbatim, all four |
| 108 | Option label composition (`{product} · {frameTech} · {glazing} · Uw · SHGC`) | **UNCHANGED**; the DTO's `glassBuildUp`/`coating` drift is resolved to the server's `glazing` |
| 109 | Resolve checkbox `I checked and resolved: {reasons joined by "; "}`; unchecked keeps the flags | Verbatim, with the consequence stated: `Leave unticked and the flags stay on the line.` — **REPAIR** |
| 110 | `resolveReview: true` clears all keys (the partial `string[]` form is never used) | **UNCHANGED** |
| 111 | Save payload and its four ordered guards | **UNCHANGED** |

### B.4.7 Composites — units, split, merge, coverage

| # | Capability today | Where it lives in the new design |
|---|---|---|
| 112 | Unit rows nested under the parent: index · product + `SpecSummary` · size · `{n}× per opening` · total · actions | `UnitList` in the opening, same six cells |
| 113 | `SpecSummary`: `Spec: as the opening` / `Spec: {n} changed — {key} {value or "none"}` | Verbatim, via `DiffMarker` |
| 114 | `not priced` marker on a unit whose status ≠ ready | **UNCHANGED**, tone `review` |
| 115 | Unit `edit` / `close` / `remove`; inline confirm `Remove unit {i}? Remove / Keep` | **UNCHANGED** |
| 116 | Unit editor caption `Unit {i} of {code}. The opening is {n} mm {high\|wide} — every unit must match it.` | Verbatim |
| 117 | Unit editor is `ItemForm scope="unit"`: no Item ID, no quantity, different note placeholder | **UNCHANGED** |
| 118 | `compatibility={{siblingSlugs, enforce:false}}` — incompatible frames stay selectable and marked | **UNCHANGED**; the server's warn-don't-block decision is surfaced as a review flag, not a veto |
| 119 | `+ Add unit`, relabelled `Maximum {policy.maxSegments} units` at the cap | **UNCHANGED** |
| 120 | Coverage sentences ×3, right-aligned, never a veto: `The opening has no size.` / `Units span {n} mm — exactly the opening.` / `Units span {n} mm, {d} mm more than\|less than the opening. Allowed — recorded on the line.` | Verbatim, all three, under the elevation |
| 121 | Split planner: axis radios (`Side by side` / `One above another`), unit count select, per-unit size inputs, even-split proposal, coverage line, `Split into units` / `Applying…` | **UNCHANGED**, expanded in place |
| 122 | Merge panel: the 3-sentence explanation, `Merge back to one` / `Merging…` | Verbatim |
| 123 | Merge re-stamps `fit` and forces `technical_review` | Stated in the merge panel before the click: `A merged opening always returns for technical review — no single unit is made at this size.` — **REPAIR** |
| 124 | Split/merge error strings (`invalid_split`, `already_composite`, generic) | **UNCHANGED**, now rendered at the panel rather than the page head |
| 125 | `compositePolicy` (tolerance 25 mm, joiner 0 mm, max 4) | Read-only block in **Settings ▸ Policy** — it governs every split and has never been visible — **DRAW** |
| 126 | Composite validation strings from `composite.ts` (11 sentences) | All mapped in `ErrorInline`; the split planner renders `errors[]` per unit — **REPAIR** |

### B.4.8 Thermal, learning, evidence, notes, files, history

| # | Capability today | Where it lives in the new design |
|---|---|---|
| 127 | `ThermalAudit` — 7 columns (Line · Size · Target · Basis · Proposed · Achieved · Result), units indented under parents | Two places, one dataset: the whole-job table at `?view=thermal` (full width, it needs it) and the per-line row in derivation hop 7 |
| 128 | `bandText`: `Uw ≤ {n}` · `SHGC {a}–{b}` / `SHGC ≥ {a}` / `SHGC ≤ {b}`; `—` when unconstrained | Verbatim |
| 129 | Basis always shown; `Inherited from opening` beside it, never instead | Verbatim |
| 130 | Achieved `Uw {x} · SHGC {y}`, `estimated` beneath when `source === "estimated"` | Verbatim |
| 131 | Six verdicts: `—` · `No parse record` · `No target derived` · `Not comparable` · `Meets target` · `Misses target (+0.14)` with signed SHGC | Verbatim, `ThermalVerdict` |
| 132 | Lines with no derived target are shown, not hidden | **UNCHANGED**, and the reason is printed once: `Rows with no derived target are listed — hiding them would make this read as complete.` |
| 133 | States: `Loading thermal targets...` / `Thermal targets could not be loaded.` + `Try again` / `No parsed lines on this project yet.` | Verbatim, now inside `StateTrio`, retrying **only** the thermal fetch — **REPAIR** (today `Try again` reloads the whole workspace) |
| 134 | `LearningReview` — visibility gate `quality_state==='pending' && decision==='adjusted'` | **UNCHANGED**, record scope, tab `Teach` |
| 135 | Intro paragraph (`Classify only the reason for the final human change…`) | Verbatim |
| 136 | Per-outcome line 1 (`ref · proposed → final`) and line 2 (`AI {money} · issued {money} · change {money}`) | Verbatim, via `DiffMarker` |
| 137 | Reason select, placeholder `Why did the human change it?`, 18 `OVERRIDE_REASONS` humanised | **UNCHANGED** |
| 138 | Thermal-target grid (`Maximum Uw`, `Minimum SHGC (optional)`, `Maximum SHGC (optional)`) when the reason teaches one | **UNCHANGED** |
| 139 | Four client validation messages mirroring the server | Verbatim |
| 140 | `Use as a lesson` / `Exclude from learning` + their two confirm sentences | Verbatim |
| 141 | `context_json`, `proposed_config_json`, `final_config_json` fetched every load, never drawn | Rendered as a machine-vs-human field diff inside the outcome — **DRAW** |
| 142 | `layer`, `learnsProductPreference` fetched, never displayed | Rendered as a one-line consequence under the chosen reason: `Teaches product preference · does not teach a thermal target.` — **DRAW** |
| 143 | `OTHER_WITH_COMMENT` has no comment field | Still none — the server accepts no comment. Stated: `This reason records no comment.` — **REPAIR** |
| 144 | No history of past adjudications | Still none — the endpoint returns only pending/adjusted rows. Stated once in the tab: `Decisions already used or excluded are not returned by the API.` — **UNWIRED** |
| 145 | `GET /projects/:id/building-model` — implemented, typed client, **zero callers** | Powers derivation hops 1–4 and the `EvidenceStack`. §F — **DRAW** (the largest single win available) |
| 146 | `evidence[].entity_path / file_id / extracted_text / origin / confidence / review_state` | Hops 1–2. `page_no`, `sheet_ref`, `region_json` are always NULL → hop 1 prints the absence. `review_state` has no writer → not shown as a control — **UNWIRED** |
| 147 | `model_json` (openings, conflicts, assumptions, jurisdiction, energyAssessment) | Hop 3, including `conflicts[]` with `resolution` and `selectedValue` |
| 148 | `confidence_json.schedule_extraction_confidence` | Shown only inside the run block, labelled `an average of the extraction model's own self-reports` — never as a headline |
| 149 | Notes block: newest 6, `{kind} · {author} · {when}`, 2px sage left border, no empty state, 7th unreachable | `NotesBlock` — same rows, plus `Show all {n}` and an empty state, plus per-line filtering by `line_id` — **DRAW / REPAIR** |
| 150 | Files block on the record: filename + size or raw status word; **no download, no kind, no dates, no rescan** | `FilesBlock` — gains `Download` (clean), `Blocked` (infected), `Scan to unlock` (otherwise), `kind`, upload date, and an MB tier. Footer: `Uploads are customer-side only.` — **DRAW / REPAIR** |
| 151 | History block: first 8, `Show all {n} events →`, raw server sentences, spans `project`+`order` | `HistoryBlock` — **UNCHANGED**, including printing the raw sentences and dotted keys as written |
| 152 | Each event's stored `after` payload is never surfaced | Row expands to show it in Archive ▸ Events. On the record it stays collapsed — **DRAW**, §C.10 |

### B.4.9 Orders and payments

| # | Capability today | Where it lives in the new design |
|---|---|---|
| 153 | Payments block: `{kind} · {percent}% · {reference}` / `{money}` over `{status}` | `PaymentsBlock`, record scope |
| 154 | `invoicedAt` / `paidAt` in the payload, never rendered | Rendered on each payment row — **DRAW** |
| 155 | Empty: `No payments recorded.`; footer `Order no. {n} · appears on invoices` | Verbatim |
| 156 | Deposit is the hard constant 50% at order creation; the editable policy default 40% drives only the pricing preview | The block prints the invoiced percentage, and Settings ▸ Commercial states the divergence — **REPAIR** |
| 157 | `order.stage`, `stageLabel`, `paymentStatus`, `createdAt` fetched, never rendered on the record | `stage`/`stageLabel` drive the ribbon caption (already); `createdAt` opens the Flow list; `paymentStatus` is vestigial and stays unrendered, recorded here — **DRAW** |
| 158 | 12 order stages, 11 transitions, 2 customer-side confirmations ops may also fire | The **Flow list**, §G.3 |
| 159 | `orderDto.files[]` (order files + the project schedule, deduped) — reachable only via 2 unsurfaced endpoints | Not surfaced. The record's own project-scoped Files block covers the need; §B.4.15 records the endpoints |
| 160 | `GET /orders`, `GET /orders/:id` — implemented, zero callers | Stay unsurfaced; the merged record plane is the decision. §B.3 |
| 161 | No order cancel endpoint despite the summary excluding a `cancelled` stage | Not built. Recorded so nobody designs a Cancel button |

### B.4.10 Customers

| # | Capability today | Where it lives in the new design |
|---|---|---|
| 162 | List, 6 columns (Customer · Business · Projects · Orders · Registered · `Open →`) | `RowList`; the **whole row** is the target, the `Open →` link is deleted — **REPAIR** (desktop and phone behaved differently) |
| 163 | Phone cards with the `{n} project(s) · {n} order(s) · joined {date}` summary | Produced by column folding — **G4** |
| 164 | States: spinner / `Couldn't load customers. {error}` / `No registered customers yet.` | `StateTrio`, copy verbatim |
| 165 | Detail header: icon + name-or-email-prefix, `Edit details` | **UNCHANGED** |
| 166 | Read grid: Email · Phone · Business (`No business name`) · Registered | **UNCHANGED except** the Phone row is no longer omitted when null — it renders `not set` — **G6 / REPAIR** |
| 167 | Edit form: `Full name`, `Phone`, `Business name`, `ABN` | **UNCHANGED** |
| 168 | Admin-only `Sign-in email — the customer's unique login ID` + helper sentence | Verbatim |
| 169 | Non-admin substitute with `Lock` icon | Verbatim |
| 170 | `Save changes` / `Saving…` / `Cancel` | **UNCHANGED**, plus a commit receipt (`Saved · just now`) — **REPAIR** (no success confirmation today) |
| 171 | Three error mappings (409 → in use, 400 → invalid, else → permission) | Verbatim |
| 172 | Silent server truncation (name 200, phone 60, company 200, abn 40) | Character counters on each field — **REPAIR** |
| 173 | Projects section: raw `status_customer` chip, **rows inert** | Rows link to `#/r/{id}`; status humanised through the same map as everywhere else, raw value in the `title` — **REPAIR** |
| 174 | Orders section: raw `stage`, **rows inert** | Stage humanised via `STAGE_LABEL`. Rows stay inert **and say why**: `open from Work — this list carries no record id` — **REPAIR** (a link that guesses is worse than none) |
| 175 | `status_internal`, `updated_at` fetched, never rendered | Not rendered; recorded here |
| 176 | Detail states: spinner / `Couldn't load this customer.` | `StateTrio`, copy verbatim |
| 177 | No search, filter, sort, pagination, add, delete | Client-side search and sort over the already-unbounded list; no add/delete (no endpoint) |
| 178 | `user.discount_percent` (default 5%) invisible everywhere in ops | Not shown — no ops endpoint returns it. The customer record carries one honest line: `Account discount is applied to every priced line and is not exposed by any ops endpoint.` — **UNWIRED** |

### B.4.11 Leads (enquiries)

| # | Capability today | Where it lives in the new design |
|---|---|---|
| 179 | 6 preset views (All / New / Question / Appointment / Contacted / Closed) with their exact query params | **UNCHANGED**, as views |
| 180 | 9-column table (Reference · Type · Customer · Contact · Location · Source · Submitted · Owner · Status) | `RowList`, same nine, priority-folded — **G4** gives it its first phone layout |
| 181 | `IntentBadge` (`Appointment` / `Question` + icon) | **UNCHANGED** |
| 182 | Hardcoded `OpenFrame Website` source pill | **UNCHANGED** — it is what the data means today |
| 183 | `statusClass` — the raw amber/blue/sage/red/neutral Tailwind buckets | Mapped 1:1 onto the five tones: `review / waiting / ready / blocked / quiet`. The one off-brand palette in ops disappears without losing a distinction — **G3** |
| 184 | Four independent status dimensions with their closed vocabularies, `humanize()`d | **UNCHANGED**, all four |
| 185 | Detail summary header (reference · intent · source · name · company · submitted · owner) | **UNCHANGED** |
| 186 | `Assign to me`, shown only when not already assigned | **UNCHANGED**. No owner picker — no endpoint |
| 187 | Customer panel (`Type`, `Email` mailto, `Phone` tel, `Account`) | **UNCHANGED except** Phone and Account render `not set` instead of vanishing — **G6** |
| 188 | Submission panel, two shapes (appointment / question), with `Message` as a `whitespace-pre-wrap` block | **UNCHANGED** |
| 189 | Manufacturer handoff panel: `Handed off`, `Acknowledged` + `Mark acknowledged`, two blur-saved ref fields, footnote | **UNCHANGED**, appointments only. Both refs gain a 120-char counter |
| 190 | Attribution panel (`Source owner (immutable)`, entry point, landing, referrer, UTM, form) | **UNCHANGED** |
| 191 | Activity panel, newest first, `No activity yet.` | **UNCHANGED** |
| 192 | Status rail: four `StatusSelect`s writing on change | **UNCHANGED** — a closed vocabulary is the one thing allowed to write on change (§E.4) |
| 193 | `Log a contact attempt`: `Attempted` / `Contacted` / `No response` | **UNCHANGED** |
| 194 | The server accepts an optional `note` (≤500) on the contact log; **no field exists** | Field added under the three buttons — **DRAW** |
| 195 | `patch()` / `logContact()` have no `catch` — failures are silent | `ErrorInline` on the rail — **REPAIR** (an unhandled rejection today) |
| 196 | Six server filters never exposed (`state`, `appointment`, `commercial`, `assigned`, `from`, `to`) | `Facets` in the list index — **DRAW** |
| 197 | `LIMIT 300`, no pagination | Unchanged; the footer states `showing the newest 300 — the server returns no more` — **REPAIR** |
| 198 | `projectId`, `accountId` returned; nothing links | `projectId` → `#/r/{id}`, `accountId` → `#/customers/{id}` — **DRAW** |
| 199 | `marketingOptIn`, `privacyVersion`, `locationId`, `updatedAt` fetched, never rendered | `marketingOptIn` and `privacyVersion` join the Attribution panel; `locationId` and `updatedAt` stay unrendered — **DRAW** (partial, stated) |
| 200 | No note/comment on an enquiry beyond the contact log | Still none — no endpoint |

### B.4.12 Archive — Files and Events

| # | Capability today | Where it lives in the new design |
|---|---|---|
| 201 | Files table (File+kind · Project+customer · Size · Scan · action) | `RowList` at `#/archive/files`, same five |
| 202 | `kb()` with no MB tier (a 40 MB PDF reads `40960 KB`) | B / KB / MB tiers — **REPAIR** |
| 203 | Scan pill of the raw `virus_status` word | `Chip` with tone (`ready` clean · `review` pending/skipped · `blocked` infected) and the word |
| 204 | Three action shapes: `Download` / `Blocked` / `Scan to unlock` (+ row spinner) | **UNCHANGED**, all three |
| 205 | `POST /files/:id/rescan`; failure swallowed | **UNCHANGED**, with an error path and the returned `reason` rendered — **REPAIR** |
| 206 | `GET /files/:id/download` gated to `clean` (403 `quarantined`, 409 `scan_pending`) | **UNCHANGED**, and now also linked from the record |
| 207 | `scan_engine`, `scanned_at`, `created_at` fetched, never rendered | Under the scan chip, and in the file's detail pane — **DRAW** |
| 208 | No search, filter, sort, pagination, preview, delete, bulk rescan, file→project link | Facets on kind / scan state; the project cell links to `#/r/{id}` — **DRAW**. No delete or upload: no endpoint exists, and the footer says so |
| 209 | Fetch error degrades to an empty list | `StateTrio.error` — **REPAIR** |
| 210 | Audit list: entity_type (14px column, truncating silently) · action · `{actor} · {when}` | `RowList` of `TimelineEntry` at `#/archive/events`; the entity column no longer truncates |
| 211 | Five filter chips — `All`, `project`, `order`, `user`, **`rule`** (dead vocabulary) | `Facets` wired to `?entity=`. The `rule` chip renders **only if a rule event exists in the returned set**, labelled `retired subsystem`. Nothing dead is shown; nothing historical is lost — **DRAW / REPAIR** |
| 212 | `entity_id` returned, never rendered — no way to reach the record an event describes | The whole row links. A dangling id renders `that record no longer exists` rather than 404-ing — **DRAW** |
| 213 | `LIMIT 200`, no pagination, no date/actor filter, no export | Unchanged, stated in the footer: `the last 200 events — the server returns no more` — **REPAIR** |
| 214 | Two different `toLocaleString` shapes across Enquiries and Audit | One date format across the console — **REPAIR** |

### B.4.13 Settings

| # | Capability today | Where it lives in the new design |
|---|---|---|
| 215 | Admin banner `Staff & roles. Only admins can change roles.` | **Settings ▸ Staff**, verbatim |
| 216 | Error line `Only admins can change roles.` | Verbatim |
| 217 | Staff list: `name` (may be null, rendered raw) over email | Null name renders `no name set` — **G6 / REPAIR** |
| 218 | Role select with disabled placeholder `— role —` and 4 raw snake_case options | Humanised labels with the raw value beside them; **plus a sentence naming what they gate:** `These four roles gate two things: changing a role, and changing a customer's sign-in email.` — **REPAIR** |
| 219 | `manufacturer` cannot be assigned (server rejects it) | Stated: `manufacturer is assigned by email domain at sign-in and cannot be set here.` — **REPAIR** |
| 220 | Nothing warns an admin they are demoting themselves | `ConfirmInline`: `Remove your own admin role? You will not be able to restore it yourself.` — **REPAIR** |
| 221 | `last_verified_at` fetched, never rendered | Rendered as `last seen {ago}` — **DRAW** |
| 222 | No invite, deactivate, sessions list, or role-history view | Still none — no endpoints |
| 223 | Deposit %: field, live consequence sentence, version, `Save deposit %` | **Settings ▸ Commercial**, verbatim |
| 224 | `GET /policy` returns `history`; nothing renders it | Rendered as a `TimelineEntry` list — **DRAW** |
| 225 | `PUT /policy` accepts a note; no field exists | Note field added — **DRAW** |
| 226 | Policy failure is one generic sentence; a 409 is indistinguishable | `version_conflict` gets its own copy plus `[ Reload ]` — **REPAIR** |
| 227 | The GST refutation paragraph, verbatim, `— not editable —` | **Settings ▸ Commercial**, verbatim. It is a refutation of a control, not a control, and it must survive so nobody builds a GST toggle |
| 228 | Sanity seam sentence + Studio link, buried in one Pricing sub-tab | **Two places:** a one-line persistent footer on Products (so the person editing rates sees it) and the full block in **Settings ▸ Catalogue** — **REPAIR** |
| 229 | Catalogue source / `loadedAt` / product count / tree with `✓ rate card` / `✗ no rate card — prices at 'default'` | Source line in Settings ▸ Catalogue; the tree is **replaced** by the Products list's coverage column, which collapses four representations of one fact into one |
| 230 | `productsWithoutCard[]` computed server-side, never rendered | Named per product in the coverage column — **DRAW** |
| 231 | `compositePolicy` never visible anywhere | Read-only block in Settings ▸ Policy — **DRAW** |
| 232 | `safeParse()` dead function; 3 unused icon imports | **Deleted** |

### B.4.14 Products (today's Pricing tab)

| # | Capability today | Where it lives in the new design |
|---|---|---|
| 233 | Four sub-tabs (Rate cards · Options · Policy · Catalogue) | Two views (`#/products`, `#/products/options`); Policy → Settings ▸ Commercial; Catalogue → the coverage column + Settings ▸ Catalogue |
| 234 | Rate-card index, 7 columns, whole-row click, `ORDER BY id` | The **Products list**: one row per product — name · slug · family · perim · area · min · rules · example · **coverage** · version |
| 235 | Index preamble (`A unit is perimeter(m) × perim + area(m²) × area + options…`) | Verbatim, above the list |
| 236 | `← fallback for unmapped products` on the `default` row | Verbatim |
| 237 | `exampleTotal` from the fixed 1200×1200 sample | Verbatim, and the footnote that it is the **anonymous** price — **REPAIR** (see 253) |
| 238 | Footer `Open a row to edit it.` / `Read-only — a manager or admin can change these.` | **UNCHANGED** |
| 239 | No empty state, no error state (a failed fetch loads forever) | `StateTrio` — **REPAIR** |
| 240 | Rate-card detail: back link, `<h2>` = raw card id, `{version} · {ago} \| unchanged since seed` | **UNCHANGED**, with the product **name** added above the slug |
| 241 | Base rate fields ×3 with `$` prefix and unit suffixes | **UNCHANGED** |
| 242 | Unit-of-effect sentences ×2 (`+$1 on the perimeter rate moves the typical example by {money}.`) | Verbatim |
| 243 | Worked example — **every engine step including the ones that did nothing** (`no effect`, `did not fire`, `none on this account`) | Verbatim, `StepTrace`. This is the console's best existing idea and it is preserved exactly |
| 244 | Sample provenance ×2 copies (percentile / labelled standard fallback) | Verbatim — it is the no-mock-fallback rule applied to sample data |
| 245 | small / typical / large mini table | **UNCHANGED** |
| 246 | Rules editor: the one-sentence rule, `FIELD_UNIT`, `add %` / `add $`, label input, `Fires for:` self-test, both verdict warnings, compounding footer, delete with no confirm | **UNCHANGED**, except delete gains a confirm — **REPAIR** |
| 247 | No reorder control (`seq` derived from array index) | Still none, and stated: `Rules apply in the order shown; to reorder, delete and re-add.` — **REPAIR** |
| 248 | Save bar `Discard changes` / `Review change →`, rendered only when edited | **UNCHANGED** |
| 249 | Confirm dialog: deltas, `What this does to a real window` 4-column table, the immediate/never-retroactive/draft-exposure paragraph, ±20% tripwire with typed slug + required note | Verbatim. **The single permitted modal in the console** — it is a stop, not a confirm (P7) |
| 250 | Two failure strings (`version_conflict` copy, generic) | Both verbatim, plus `[ Reload ]` |
| 251 | Change history with `summarise()`, note in curly quotes, `Revert to {version}` | **UNCHANGED**; the panel gains a `no changes yet` state instead of vanishing — **REPAIR** |
| 252 | Revert: one unguarded click, no confirmation, no error path | `ConfirmInline` + error copy for `not_found` / `unreadable_history` — **REPAIR** |
| 253 | The preview always shows `account discount 0%` while every registered account defaults to 5% | The footnote: `This is the anonymous price. Registered accounts carry a discount that is not exposed by any ops endpoint.` — **REPAIR** |
| 254 | Options: `Needs a price ({n})` block with its paragraph, `$` field, `Save`, `Included — $0`, `offered by {n} product(s)` caption | Becomes a **filter** on the same list, so clearing it is visibly the same rows. All copy verbatim |
| 255 | Options: priced table, slug search, `hide $0`, inline edit, Enter saves / Esc reverts, sage border when dirty | **UNCHANGED** |
| 256 | Two row annotations (`◦ priced but no product offers it`, `◦ glass, per m² of glazed area`) | Verbatim |
| 257 | Header count is the unfiltered total and disagrees with the visible rows | Count follows the filter — P4 — **REPAIR** |
| 258 | Footer copy (`Enter saves a row, Esc reverts it…`) | Verbatim |
| 259 | `Options.commit` has no `catch`; every failure is silent, including the glass guard | `ErrorInline`, including the server's `area_rate_still_includes_glass` **detail sentence** — **REPAIR** |
| 260 | `basis` (per_unit ↔ per_sqm) is accepted by the API and never sent | Still not sent. Row states `per m²` / `per unit` as today; changing it stays out of scope |
| 261 | `glass_excluded_from_area_rate` has no control anywhere, making the guard unsatisfiable | Not a control. Rendered as a **precondition** on glass rows: `blocked — {n} rate cards still include glass in the area rate` — **REPAIR** |
| 262 | No add-an-option, no delete, no option history / revert / note | Still none — no endpoints |
| 263 | No create / delete / deactivate a rate card | Still none. `productsWithoutRateCard` is reported and un-actionable, and the coverage column says exactly that |
| 264 | Reconcile health banner on **every** Pricing screen, 4 states incl. `Pricing has never been checked against the catalogue.` | **UNCHANGED**, on every Products view, all four states, including the never-checked / checked-`{ago}` distinction that exists so a broken checker cannot look green |
| 265 | A failed `GET /reconcile` is indistinguishable from "never checked" | Distinguished — **REPAIR** (this reintroduced on the client the exact failure the persisted run was built to avoid) |
| 266 | Saving an option does not re-run reconciliation; the banner persists after the fix | Stated on the banner: `last checked {ago} — re-check to clear` — **REPAIR** |
| 267 | `Fix` jumps to Options; there is no `Fix` for `productsWithoutRateCard` | **UNCHANGED**, and the absence is explained on the coverage cell |
| 268 | `orphaned[]` never surfaced by the banner | Surfaced as the per-row annotation only, as today; the banner's `gaps` definition is unchanged |
| 269 | Mobile: explicitly unhandled, twice promised | Column-priority folding gives it a phone layout; the rate-card editor renders a stated notice: `Editing rates needs a wider screen.` — **REPAIR** |
| 270 | `GET /pricing/catalogue` tree | Superseded by the coverage column; the source/loadedAt line survives in Settings ▸ Catalogue |
| 271 | No cost/margin column anywhere | Deliberately still none |
| 272 | No CSV import/export, no draft/publish staging, no approval queue on a price change | Deliberately still none. Safety is preview + audit + one-click revert |

### B.4.15 Endpoints that reach no pixel today

| # | Endpoint | Decision |
|---|---|---|
| 273 | `GET /queues/submissions` | Stays unsurfaced — superseded by the merged queue and its server sort. §B.3 |
| 274 | `GET /orders`, `GET /orders/:id` (incl. `orderDto.files[]`, per-order `actions[]`, order-line snapshots) | Stay unsurfaced — the record plane is the merged truth. §B.3 |
| 275 | `GET /projects/:id/building-model` | **Now called** — the whole evidence layer. §F |
| 276 | `POST /projects/:id/ai-runs` (re-queue extraction) | Not surfaced — a support lever with no client function today. Recorded, not built |
| 277 | `POST /projects/:id/estimate` (re-run selection + pricing) | Not surfaced — same reason |
| 278 | `POST /learning-outbox/drain` | Not surfaced — same reason |
| 279 | `GET /audit?entity=` | **Now wired** to the Events facets |
| 280 | `POST /projects/:id/note` with `lineId` | **Now sent** — per-line notes |
| 281 | `POST /enquiries/:id/contact-log` with `note` | **Now sent** |
| 282 | `PUT /pricing/options/:slug` with `basis` | Still not sent — out of scope, stated |

### B.4.16 Persisted data with no reader — what the console must say instead of showing

| # | Data | What the screen says |
|---|---|---|
| 283 | `candidate_result` — every product × variant evaluated, per-filter pass/fail, reasons, six score components, rank, selected | Derivation hop 5: `The candidate evaluation is recorded but no endpoint reads it.` Never invented candidates — **UNWIRED** |
| 284 | `selection_run`, `draft_order_line` | Same hop, same sentence |
| 285 | `ai_stage_runs` (model, prompt version, tokens, escalation reasons), `ai_runs.summary_json.stageWarnings` | Run block: `Stage detail and extraction warnings are recorded but not exposed to this console.` — **UNWIRED** |
| 286 | `revision_line` snapshots (per-revision line detail) | Revisions ledger: `Line detail for an issued revision is not retrievable.` — **UNWIRED** |
| 287 | `evidence_items.review_state` (`confirmed`/`edited`/`rejected`) | No control. No endpoint writes it, so no confirm/reject affordance exists |
| 288 | `ai_review_deltas` (structured AI→human field diffs) | The MACHINE/NOW/EDITED ledger states: `Intermediate values between edits were not kept.` — **UNWIRED** |
| 289 | `upload_reservation.reason` / `detail` (why a file was rejected) | Not surfaced — no ops endpoint reads it. Recorded here |
| 290 | `user.discount_percent` | The customer record's one honest line, §B.4.10 #178 |
| 291 | `ai_job_claim.progress_stage` (the only live progress field; read only by the customer endpoint) | Not surfaced to ops. Recorded here |

### B.4.17 Deleted on purpose

`Placeholder` (unreachable) · `safeParse()` (no call sites) · the three ghost icon imports
(`CheckSquare`, `Package`, `SlidersHorizontal` — residue of the removed Approvals / Orders /
Rules tabs) · the hard-coded `editing elsewhere` literal · the `MONO = {}` empty object spread
at ~20 call sites where the code believes it is setting a data face · `Pricing.tsx`'s local
`INK = var(--ops)` shadow, which renders "primary text" in a different black from the adjacent
tab · the `.dark {}` block and every `oklch()` sidebar token · `src/styles/globals.css` (0
bytes, imported by nothing) · the `rule` audit chip **as a hard-coded option** (it survives as
a data-driven one).

---

# C. SCREEN-BY-SCREEN LAYOUT SPEC

Two archetypes and one exception. **`QueuePage`** = list header + facets/views + `RowList` +
list footer. **`RecordPage`** = fixed `RecordHeader` + `PaneGroup` of 1–3 independently
scrolling panes. Settings is a `RecordPage` with one pane — the legal degenerate case, not a
third archetype. The exception is the sign-in screen.

Every screen specifies its five states. Where a state is not listed it means the state cannot
occur on that screen, and that is a claim someone may falsify.

---

## C.1 Sign-in (`SignInPage`)

**Purpose.** Get a staff member into the console when Cloudflare Access is not the identity
provider. In production this is the dev/fallback path; it must still be complete.

**Layout.** Full-screen `--ops` ground, one centred card at `--ops-panel`, `max-width 380px`,
1px `rgba(255,255,255,.10)` border. No rail, no header.

```
┌──────────────────────────────────────────────┐
│                                              │
│            ▣ OpenFrame  Ops                  │   Brand, height 30
│        Internal console — staff sign-in      │
│                                              │
│   Work email                                 │
│   ┌────────────────────────────────────────┐ │
│   │ you@openframe.com.au                   │ │   autofocus, Enter submits
│   └────────────────────────────────────────┘ │
│   ⚠ Enter a valid work email address.        │   ← REPAIR: was a silent no-op
│                                              │
│   [ Send code ]                              │
│                                              │
│   Codes expire after 10 minutes.             │   ← REPAIR: server rule, never stated
│   Authorised staff only. Access is logged.   │
└──────────────────────────────────────────────┘
```

**Step 2** replaces the field: `Enter the 6-digit code sent to {email}` (email in white), a
`maxLength=6` numeric field with `••••••` placeholder and `tracking-[0.3em]`, `[ Sign in ]`
(busy: `Verifying…`), and `← Change email` which resets step, code and error. When the server
returns `devCode`, a sage-wash strip above the field reads `Dev mode — code is {code}`.

**States.**
- *idle* — as drawn.
- *busy* — button label swaps (`Sending…` / `Verifying…`), field disabled, `aria-busy`.
- *error (challenge)* — `Something went wrong.` in `--attention`, with `AlertCircle`.
- *error (verify)* — `Invalid code, or this email isn't authorised for the ops console.`
- *invalid email* — the new inline message; the button stays enabled so a second attempt is
  one keystroke.
- *empty / read-only* — n/a.

**Copy that carries meaning and must not be reworded:** the two error strings (the challenge
error is deliberately neutral — the server does not reveal whether an email is allowlisted),
and `Authorised staff only. Access is logged.`

---

## C.2 The shell (`AppFrame`)

**Purpose.** Get out of the way. There is no page header: today's sticky bar carries only the
capitalised tab name, which the rail already says, and costs 56px on every screen.

**Regions.**

| Region | Width / height | Behaviour |
|---|---|---|
| Rail | 48px, `--ops` | Fixed. Hover or keyboard focus expands it to a **200px overlay** (position: fixed, over the content, no reflow). `⌘\` pins it expanded and reflows. Pinned state per user in `localStorage` |
| Rail head | 48px tall | The brand mark at height 22. In the 200px state, mark + `Ops` |
| Rail items | 44px tall | Icon always; label appears in the expanded state. Active carries `aria-current="page"`, a 2px sage left marker, `rgba(255,255,255,.08)` fill and full-white text. Inactive `rgba(255,255,255,.50)`, hover `.80` |
| Rail lane block | appears on a record only | `3 of 12 · Needs us` over `[ ‹ ] [ › ]`. Walks the lane you arrived from, without returning to the list |
| Rail foot | auto | Identity (name over email, both truncating) then `Sign out` |
| Content | `calc(100vw - 48px)` | `--bone` ground. The page body itself does not scroll on a `RecordPage`; `QueuePage` scrolls normally |

**Below 768px** the rail becomes the existing slide-out drawer, unchanged in every mechanic
(264px / max 82vw, `bg-black/45` scrim, Esc, `body{overflow:hidden}`, 44px rows,
`padding-bottom: max(0.75rem, env(safe-area-inset-bottom))`, `-translate-x-full invisible`
when closed so it leaves the tab order). It is an overlay, never a route: the surface beneath
is not unmounted, so an open record, scroll position and half-typed fields survive.

**Omnibox.** Not in the rail. `⌘K` or `/` from anywhere opens a centred palette,
`max-width 560px`, over a scrim.

```
┌───────────────────────────────────────────────────────────┐
│ ⌕  brighton                                               │
├───────────────────────────────────────────────────────────┤
│ PROJECTS                                                  │
│   OF-Q-10482  Brighton Residence            under review  │
│   OF-Q-10310  Brighton Rd shopfront         quote issued  │
│ CUSTOMERS                                                 │
│   Harbour Build Co.            ops@harbourbuild.com.au    │
├───────────────────────────────────────────────────────────┤
│ ↑↓ move · ⏎ open · esc close                              │
└───────────────────────────────────────────────────────────┘
```

Debounce 250 ms, minimum 2 characters, four types, `LIMIT 8` each — all unchanged. Hints are
humanised (today `status_customer` and `stage` print raw snake_case). **`⏎` opens the record**
— the single most valuable repair in the shell.
States: `idle` · `typing` (below 2 chars: `Keep typing…`) · `loading` · `results` ·
`empty` (`No matches for "brighton".`) · `error` (`Search is unavailable.`).

---

## C.3 Work — the queue (`QueuePage`)

**Purpose.** Hand the reviewer the next job, in the order the shop actually owes it.

**Regions.** List header (56px) · views strip (44px) · `RowList` (fluid) · footer strip
(40px). Content capped at 1440px so a nine-column row does not stretch to 2560px.

```
┌──┬────────────────────────────────────────────────────────────────────────────────────────┐
│▣ │ Work                                                            ⌕ search  ⌘K           │ 56
│✉ ├────────────────────────────────────────────────────────────────────────────────────────┤
│◍ │ [Needs us 12] [Submitted 4] [Being priced 6] [Ready to issue 3] [Awaiting payment 2]    │ 44
│▤ │ [Awaiting customer 8] [In production 6] [All open 31] [All 58]                          │
│⌸ ├────────────────────────────────────────────────────────────────────────────────────────┤
│⛭ │ Ref         Project            Customer         Lines  Value     Stage    Waiting Days │
│  │ ───────────────────────────────────────────────────────────────────────────────────────│
│  │ OF-Q-10482  Brighton Residence Harbour Build Co.    3  $12,196   Pricing      Us     6 │
│  │ OF-1183                                               contract   Technical review      │
│  │                                                                          Unpriced 2    │
│  │ ───────────────────────────────────────────────────────────────────────────────────────│
│  │ OF-Q-10455  Ashgrove Duplex    J. Petrakis          9  $41,020   Intake       Us    11 │
│  │                                                       est.       Awaiting triage       │
│  │ ───────────────────────────────────────────────────────────────────────────────────────│
│  │ OF-Q-10402  Northcote Reno     (anonymous)          5   $9,140   Pricing      Us    19 │
│  │                                                       est.       Pricing   Unpriced 5  │
│  ├────────────────────────────────────────────────────────────────────────────────────────┤
│  │ 4 more projects are with the customer.  [ Awaiting customer ]                          │
│  │ Sorted: waiting on us first, then longest in stage — never by last update, because a   │
│  │ customer reply must not bury our oldest obligation. 14 active orders · 62 customers.   │ 40
└──┴────────────────────────────────────────────────────────────────────────────────────────┘
```

**Views (9).** The five Projects chips plus the four Dashboard demands, unified. Each carries
a count **computed from the rows on this page**, so a count and its list can never disagree
(P4).

| View | Predicate |
|---|---|
| `needs-us` *(default)* | `waitingOn === "Us"` |
| `submitted` | `stateLabel === "Submitted"` |
| `pricing` | `phase === "Pricing"` |
| `ready` | `phase === "Pricing" && unresolved === 0` |
| `payment` | `stateLabel ∈ {Deposit invoice issued, Final balance invoice issued}` |
| `customer` | `waitingOn === "Customer"` |
| `production` | `phase === "Production" \|\| phase === "Accepted"` |
| `open` | `phase !== "Delivered"` |
| `all` | everything |

**Columns and priorities** (`RowList` folds priority 2–3 into the row's meta lines below
`lg`, producing today's phone card from the same component):

| Column | Priority | Cell |
|---|---|---|
| Ref | 1 | `ref` in sage data face; **order no. on a second line** when one exists |
| Project | 1 | title; org on a second line |
| Customer | 3 | name; email on a second line; `(anonymous)` when only submit-time contact exists |
| Lines | 3 | integer, right |
| Value | 1 | `money0`, right, with the basis word (`contract` / `issued` / `est.`) beneath |
| Stage | 2 | phase (semibold) over `stateLabel` (quiet) |
| Waiting on | 1 | the word `Us` / `Customer` / `Nobody`; ink + semibold for `Us` |
| Days | 3 | integer, right; `title` = `last touched {when}` |
| Flags | 2 | `Unpriced {n}` chip, tone `review` |

**States.**
- *loading* — skeleton rows in the final shape, `role="status"`.
- *empty (needs-us)* — `Nothing is waiting on us.` / `New submissions and enquiries appear here.`
- *empty (other view)* — `No projects match this filter.`
- *empty (needs-us with customer rows)* — plus the sage escape button
  `{n} project(s) is/are with the customer` → switches to `customer`.
- *error* — `Couldn't load the queue.` + the raw code + `Retry`. **Never an empty list.**
- *degraded* — banner above the views: `Counts could not be computed. These are not real zeros.`
- *ceiling* — when the payload length equals the server's practical ceiling, the footer adds
  `showing every project the server returned — this endpoint has no pagination`. There is no
  silent truncation.

**Not built and why:** column sorting (the server's neglect-first order is deliberate and a
header that destroys it is a trap); bulk selection (no bulk endpoint); export (no endpoint).

---

## C.4 THE REVIEW WORKSPACE (`RecordPage`, opening scope)

This is the screen. Everything else is judged against it.

### C.4.1 Regions and ratios

At 1440 × 900, rail 48px, content 1392px:

| Region | Size | Scroll | Fixed? |
|---|---|---|---|
| `RecordHeader` band | full × 132px (104px when collapsed past 200px of scroll) | never scrolls | **fixed** |
| **A — Openings** | 264px | own scroll | fixed width |
| **B — The opening** | fluid, **768px at 1440**, min 560px | own scroll | the bench |
| **C — Derivation** | 360px | own scroll, per-hop accordion | fixed width |

**Ratio 264 : 768 : 360.** Three independent scroll contexts: scrolling the derivation never
moves the drawing you are reading it against, and the totals, the phase, the primary action
and the count of what is left never leave the screen. Permanent chrome = 48px rail + 132px
header = **14.7% of a 1440×900 viewport** (P1's threshold is 18%).

**Why the centre is the opening, not the source document.** The evidence that exists is a
filename, a synthesised sentence, an origin token and a basis — it reads well at 360px and
gains nothing at 768px. What needs width is what is manipulated: a live elevation, two
dimension fields, a product-type/product pair, a glazing picker, four option disclosures, a
units table and a price breakdown. Space follows manipulation. See Open Question 1.

**Collapse.** `[` collapses A to a 44px strip of codes; `]` collapses C entirely; `\` toggles
both (focus mode → centre 1304px). Each collapse is remembered per destination.

**Summoned, never resident:** the line editor and the split planner (expand in place inside
B); `ConfirmInline` (drops beneath the action bar, inside the fixed header); the sheet view
(`T`); the whole-job thermal audit (`?view=thermal`); the shortcut sheet (`?`); the omnibox.

### C.4.2 The wireframe at 1440

```
┌──┬───────────────────────────────────────────────────────────────────────────────────────────────┐
│▣ │ ← Work   PROPOSAL · OF-Q-10482          CUSTOMER    Harbour Build Co.                          │
│✉ │          Brighton Residence             VALUE       $12,196  estimate                          │
│◍ │          ORDER · —                      LINES READY 5 of 8 · 3 unpriced or unresolved          │
│▤ │          Harbour Build Co · ops@…       CUSTOMER SEES  Under review                            │
│⌸ │ ┌────────┬────────┬────────┬────────┬────────┬────────┐                                       │
│⛭ │ │▓Intake▓│Pricing │ Issued │Accepted│Product.│Delivrd │   Last change · maria · 14 Aug 09:12   │
│  │ └────────┴━━━━━━━━┴────────┴────────┴────────┴────────┘   as of 14:32  ⟳ Refresh               │
│  │ Now · Technical review · waiting on us · 6 days since this record was last touched             │
│  │ ( Issue reviewed quote ) 3 lines are unpriced or unresolved   [Send to technical review]       │
│  │ [Request clarification]  [Add a note]                                    2 errors · show       │
│  │ ⚠ 3 lines are unpriced or unresolved — a quote cannot be issued until they are settled.        │
│  ├──────────────────┬────────────────────────────────────────────────────┬───────────────────────┤
│  │ OPENINGS      8  │ W03 · 3-part combination opening   [edit] [units]  │ DERIVATION · W03      │
│  │ ──────────────── │ 2,700 high × 1,500 wide mm · needs review · $3,780 │ ───────────────────── │
│  │ [ RECORD ]       │                                                    │ ▾ 1 SOURCE DOCUMENT   │
│  │ ──────────────── │  ┌──────────────────────────────────────────────┐  │  A601-schedule.pdf    │
│  │ [▭] W01     ready│  │   ╔═══════╦═══════╦═══════╗                  │  │  schedule · classi-   │
│  │     AMJ80 Sliding│  │   ║       ║  ╲ ╱  ║       ║          1,500   │  │  fied by the system   │
│  │     1,210×1,810  │  │   ║       ║  ╱ ╲  ║       ║           high   │  │  2.4 MB · clean       │
│  │            $1,840│  │   ╚═══════╩═══════╩═══════╝                  │  │  [ Download ]         │
│  │ ──────────────── │  │     900      900      900                    │  │  Page, sheet and      │
│  │▓[▤] W03   review▓│  │   ◀──────────  2,700 wide  ──────────▶        │  │  region are NOT       │
│  │▓    3-part combi▓│  └──────────────────────────────────────────────┘  │  RECORDED for this    │
│  │▓    2,700×1,500 ▓│  Generated from the configured size and its units. │  fact.                │
│  │▓           $3,780▓│  Not a copy of anything in the uploaded documents.│ ▾ 2 EXTRACTED FACT    │
│  │      1 Fixed light│  Units span 2,700 mm — exactly the opening.       │  "W03 3-part combina- │
│  │      2 Awning     │ ─────────────────────────────────────────────────  │   tion 2700x1500"     │
│  │      3 Fixed light│  HOW FIRM IS THIS?                                │  reconstructed by the │
│  │  • Customer split │  Medium — a second candidate scored within 0.05.  │  extractor, not the   │
│  │    into 3 products│  Missing when chosen: orientation · room area     │  source row           │
│  │ ──────────────── │  Basis: schedule specification                    │  origin · explicit    │
│  │ [◫] D02   review │ ─────────────────────────────────────────────────  │  model-declared tag   │
│  │     AMJ150T Lift-│  SPEC                                             │  0.92 — self-reported,│
│  │     sliding door │  Measurement basis   Frame size                   │  nothing corroborates │
│  │     2,400×2,100  │  Colour              Monument                     │ ▸ 3 OPENING IN MODEL  │
│  │            $6,576│  Glass               Low-E double glazed          │ ▸ 4 REQUIREMENT       │
│  │ ──────────────── │  Installation        Bracket                      │ ▾ 5 CANDIDATES        │
│  │ [▭] W04  unpriced│  Hardware            VBH standard                 │  rules v2-thermal-non-│
│  │     AMJ80 Awning │  Flyscreen           Aluminium                    │  blocking · ranker v3-│
│  │     900×600    — │  Quantity            1  (not editable here)       │  graded-thermal       │
│  │ ──────────────── │ ─────────────────────────────────────────────────  │  The candidate evalu- │
│  │ … 4 more         │  UNITS  3 joined · side by side   [ + Add unit ]   │  ation is recorded but│
│  │                  │  1 Fixed light 1,500×900  ready      $980         │  no endpoint reads it.│
│  │ No line may be   │    Spec: as the opening              edit  remove │ ▾ 6 CHOSEN            │
│  │ added or deleted │  2 Awning      1,500×900  ready    $1,820         │  amj80-awning         │
│  │ from this console│    Spec: 1 changed — flyscreen aluminium          │  variant V-4471       │
│  │ Split and merge  │  3 Fixed light 1,500×900  ready      $980         │  basis · schedule     │
│  │ only.            │ ─────────────────────────────────────────────────  │  specification        │
│  │ ──────────────── │  MACHINE PROPOSED   NOW              EDITED       │ ▾ 7 THERMAL           │
│  │ ⚠ 3 lines are    │  amj80-awning       amj80-awning     —            │  Uw ≤ 2.60 · SHGC     │
│  │ unpriced or      │  2700 × 1500        2700 × 1500      —            │  0.30–0.55            │
│  │ unresolved.      │ ▎Colour Surfmist   ▎Colour Monument ▎edited · you │  got Uw 2.41 · 0.42   │
│  │                  │  Locked against re-extraction: colour.            │  certified            │
│  │                  │ ─────────────────────────────────────────────────  │  Meets target         │
│  │                  │  REVIEW  2                                        │ ▸ 8 COMPATIBILITY     │
│  │                  │  · Customer split opening into three child products│ ▸ 9 PRICE             │
│  │                  │  · Thermal configuration                          │ ▸ 10 HUMAN EDITS      │
│  │                  │  [ ] I checked and resolved: Customer split…;     │ ───────────────────── │
│  │                  │      Thermal configuration                        │ NOTES  2   [+ on W03] │
│  │                  │      Leave unticked and the flags stay on the line.│ "Confirm mullion with │
│  │                  │ ─────────────────────────────────────────────────  │  the shop." maria     │
│  │                  │  CUSTOMER PROPOSAL LINE                           │  8 Aug 14:02          │
│  │                  │  $3,780.00 including GST · priced from its units  │                       │
└──┴──────────────────┴────────────────────────────────────────────────────┴───────────────────────┘
     264px                              768px                                       360px
```

### C.4.3 The record header band (fixed)

| Slot | Content | Rule |
|---|---|---|
| Back | `← Work` | Returns to the lane; the rail keeps lane position regardless |
| Eyebrow | `PROPOSAL · OF-Q-10482` and, when an order exists, `ORDER · OF-1183` | The public ref is printed on every issued PDF and email, so it is never renamed and never shown alone. Click-to-copy copies the current URL |
| Title | project title | `t-bd-lg font-display` |
| Subtitle | `org · customer · email`, falling back to submit-time contact | |
| Metric `CUSTOMER` | customer or org name | |
| Metric `VALUE` | `money0` + basis word | The same column means three things; the word always travels |
| Metric `LINES READY` | `{m-k} of {m}` + caption `{k} unpriced or unresolved` | Replaces the wireframe's `APPROVED 0/3`. Caption is the real gate |
| Metric `CUSTOMER SEES` | `humanize(statusCustomer)` | **DRAW.** Replaces the wireframe's "Customer workspace ↗" — see C.4.9 |
| `PhaseRibbon` | six cells + caption | §D |
| Freshness | `Last change · {actor} · {when}` and `as of HH:MM ⟳ Refresh` | The only honest presence signal available |
| `ActionBar` | server-derived actions, one primary, blocked reasons beside | P5 |
| Error counter | `{n} errors · show` | Scrolls to and expands the first failing pane |
| Banners | unresolved / degraded / conflict | |

Collapsed state (past 200px of scroll in any pane): eyebrow + title + the ribbon compressed to
`Pricing · waiting on us · 6d` + the primary action. 104px.

### C.4.4 Pane A — Openings (264px)

Rows, in this order:

1. **`[ RECORD ]` chip** — the first row. Selecting it switches B and C to the record scope
   (§C.5). This is how flow, revisions, payments, files, history and learning are reached
   without a fourth column.
2. **One row per top-level line**, units nested and indented beneath their parent, always
   expanded, because a composite is one thing made of parts and hiding the parts is what makes
   reviewers merge them by accident.

Each opening row:

| Element | Detail |
|---|---|
| `Elevation` at `xs` (46 × 34, square) | Real panel count, mullions and opening symbols derived from the actual units. `data-unsized` → `opacity .55` when there is no size |
| Code | `W03`, sage, data face |
| State word | `ready` / `needs review` / `unpriced` — never colour alone |
| Product name | truncated |
| Size | `H × W` mm, quiet |
| Line total | right, data face; `—` when null, never `$0` |
| Review bullets | one per `reviewReasons()` key, warning ink |
| Markers | 2px sage left stripe + `aria-selected` on the current row; a `⚑` when unpriced |

Foot of the pane, permanently: **`No line may be added or deleted from this console. Split and
merge only.`** and the unresolved banner, verbatim, because that sentence is the gate on the
primary action and it belongs beside the lines that cause it.

**States:** loading (skeleton rows) · empty (`No lines on this project.`) · error (`Couldn't
load this record.` + `Retry`) · read-only (no `[edit]`/`[units]` links; the rows still select).

### C.4.5 Pane B — The opening (fluid)

Top to bottom, one scroll context:

1. **Title row** — `{code} · {productName}`, then `[edit]` and `[units]`/`[split]`. Both
   controls render **only** in the five editable states; anywhere else the row shows
   `read-only — this quote is issued` rather than a control that would 404.
2. **The elevation** at `lg`, true proportion, dimension leaders on, built from the configured
   size and, for a composite, from its real units with per-unit symbols and joins.
3. **The honesty line, always, directly beneath:**
   > *Generated from the configured size and its units. Not a copy of anything in the uploaded
   > documents.*
   This one sentence is the difference between a provenance tool and a prop.
4. **The coverage sentence**, one of three, verbatim, never a veto.
5. **HOW FIRM IS THIS?** — §F.3.
6. **SPEC** — `SpecTable`, 2 columns at ≥780px, 1 below. Measurement basis · Colour · Glass ·
   Installation · Hardware · Flyscreen · Quantity (with the hint `set at submission — not
   editable here`). A missing value renders `not set`, never a blank, never a dropped row.
7. **UNITS** — `UnitList` + `+ Add unit` / `Maximum {n} units`.
8. **MACHINE PROPOSED / NOW / EDITED** — §F.4.
9. **REVIEW** — one row per `review_json` key in warning ink, then the resolve checkbox with
   its exact copy and the consequence sentence.
10. **CUSTOMER PROPOSAL LINE** — `$3,780.00 including GST`, display face, plus the basis
    (`priced from its units` for a composite parent).
11. **The editor** and **the split planner** expand in place between 2 and 5. No modal, ever,
    on this screen (P7).

**States:** read (as drawn) · editing (form in place, sibling controls disabled, the rest of
the page live) · splitting · busy (scoped to the sub-block, label swaps, `aria-busy`) ·
error (inline, at the block that failed) · read-only (steps 1–10 without controls).

### C.4.6 Pane C — Derivation (360px)

Ten numbered, collapsible hops. Expansion state is **per hop and remembered across line
selection**, so a reviewer who cares about candidates keeps candidates open all the way down
the job. Default open: 1, 2, 5, 6, 7. Full specification in **§F**.

Below the hops: `NOTES` (per line, `+ note on W03`).

### C.4.7 Sheet view (`T`)

Today's six-column line table, verbatim (Code · Product · Size · Qty · Line total · State),
full width, sharing the same selection. It is how you notice that W01 and W03 are the same
window at different prices — a real job that master-detail makes deliberate rather than
incidental. `T` returns. The openings pane stays; C collapses.

### C.4.8 The whole-job thermal audit (`?view=thermal`)

The seven-column table needs the width and cannot live in a 360px rail: Line · Size · Target ·
Basis · Proposed · Achieved · Result, units indented under parents, all six verdicts, all
three states, verbatim. B goes full width; the selected line is highlighted.

### C.4.9 What replaced "Customer workspace ↗"

Two things, neither of them a link. The header metric `CUSTOMER SEES {humanised}`, and — in
the record scope — a **What the customer sees** panel rendering, from data ops already holds:
`status_customer` humanised, whether a quote is issued and which revision, the stage label the
customer is shown, payments and their status, which files are shared, and what happens next.
It closes with the reason there is no link:

> *No link opens the customer's own screen: no URL addresses another account's record, and a
> staff member signing in on the customer origin lands on their own account.*

### C.4.10 Breakpoints

| Width | Layout |
|---|---|
| ≥1440 | A 264 / B fluid / C 360 |
| 1280–1439 | A 248 / B fluid / C 340 |
| 1120–1279 | A 240 / B fluid / C becomes a **40px tab strip** of hop icons carrying their counts; clicking one, or `]`, slides a 380px drawer over B, which keeps its scroll |
| 900–1119 | A collapses to a 44px code strip (hover expands); B fluid; C as above |
| 768–899 | One pane: a sticky picker bar under the header (`‹ W03 › · 2 of 8`), B full width, C as a full-height sheet |
| <768 | Single column, push navigation: queue → record summary → line. The editor and split planner are full-screen pushes. The header collapses to ref + phase + one action; the action bar pins to the bottom with safe-area padding. The openings sheet states the intent: *"Reviewing a job needs a wider screen. This view is for checking state and recording a payment."* — a statement, not a blocker; every control still works |

---

## C.5 The record — record scope (`?scope=record`) and the order half

Selecting the `[ RECORD ]` chip swaps B and C; pane A is untouched, so the openings stay
visible while the job's own state is read.

**B gains six tabs:** `Flow · Revisions · Thermal · Teach · History · Files`.
**C becomes the standing facts:** Waiting on · What the customer sees · Payments ·
Customer & contact · Last 8 events.

```
┌──────────────────┬────────────────────────────────────────────────────┬───────────────────────┐
│ OPENINGS      8  │ [Flow] [Revisions] [Thermal] [Teach 1] [History]   │ WAITING ON            │
│ ──────────────── │ [Files 3]                                          │ Us. Technical review. │
│▓[ RECORD ]      ▓│ ────────────────────────────────────────────────── │ 6 days since this     │
│ ──────────────── │ THE JOURNEY OF THIS JOB                            │ record was touched.   │
│ [▭] W01     ready│                                                    │ ───────────────────── │
│     …            │ ✓ submitted            3 Mar 09:41   the customer  │ WHAT THE CUSTOMER SEES│
│                  │   3 documents · 8 openings extracted               │ Status  Under review  │
│                  │ ✓ parsed               3 Mar 09:43   the system    │ Quote   not yet issued│
│                  │   schedule parsed (8 items, 3 to review) via ai    │ Files   3 shared      │
│                  │   [ open the derivation → ]                        │ Next    we send the   │
│                  │ ✓ pricing started      3 Mar 11:40   maria         │         quote         │
│                  │ ▢ GATE · every line settled              5 of 8    │ No link opens the     │
│                  │   W03 needs review · D02 needs review · W04 unpri- │ customer's own screen.│
│                  │   ced. This is what disables Issue reviewed quote. │ ───────────────────── │
│                  │ ▢ issue revision R3                                │ PAYMENTS   (no order) │
│                  │   freezes the draft and emails ops@harbourbuild…   │ Nothing invoiced yet. │
│                  │ ▢ GATE · the customer accepts, or asks for changes │ Deposit is 50% at     │
│                  │   accept  → order OF-nnnn, deposit + balance raised│ acceptance.           │
│                  │   changes → back to pricing, revision superseded   │ ───────────────────── │
│                  │ ▢ deposit invoiced   → we record the payment       │ CUSTOMER & CONTACT    │
│                  │ ▢ shop drawings shared                             │ Harbour Build Co.     │
│                  │ ▢ GATE · the customer approves the drawings        │ ops@harbourbuild.com  │
│                  │   we may record their approval by phone            │ 03 9555 0182          │
│                  │ ▢ manufacturing → QA photos → balance invoiced     │ Deliver to  Brighton  │
│                  │ ▢ GATE · the customer confirms for dispatch        │ ───────────────────── │
│                  │ ▢ dispatched → delivered → after-sales             │ LAST 8 EVENTS         │
│                  │                                                    │ line.split            │
│                  │ Every step above is a real transition in this      │ maria · 14 Aug 09:12  │
│                  │ system. GATE rows are the only things that can     │ started pricing       │
│                  │ stop it, and each names who has to move.           │ maria · 12 Aug 08:10  │
│                  │ There is no internal approval step. See §G.4.      │ [ Show all 26 ]       │
└──────────────────┴────────────────────────────────────────────────────┴───────────────────────┘
```

**Tabs.**

- **Flow** — §G.3, entire. The answer to the brief's "presentation of order flow with relevant
  approvals along the way".
- **Revisions** — a ledger, not a switcher: `R2 · issued 20 Jul · $12,196 · accepted 28 Jul`,
  `R1 · issued 12 Jul · $11,840 · superseded`, from `issuedAt`/`acceptedAt`, with the honest
  line *"Line detail for an issued revision is not retrievable; the table shows the live draft
  or the contract."*
- **Thermal** — the whole-job table (also reachable full width at `?view=thermal`).
- **Teach** — `LearningReview`, unchanged in every string, gate and validation, plus the
  machine-vs-human config diff that is fetched on every record load and drawn nowhere today.
- **History** — the full activity list, project **and** order events, raw server sentences and
  dotted keys printed as written, `Show all {n}`.
- **Files** — the record's files with `Download` / `Blocked` / `Scan to unlock`, `kind`, size
  with an MB tier, upload date, scan engine and time, and the footer `Uploads are
  customer-side only.`

**The order half.** Once an order exists nothing about the layout changes. Pane B's line table
shows **contract lines** (the flattened snapshot, named as such), the spec editor disappears
because the server refuses line writes outside the five editable states, the money basis word
becomes `contract`, the action bar carries the stage machine, and pane C's Payments block
fills: `deposit · 50% · $6,098 · paid · EFT-4821 · invoiced 3 Mar · paid 7 Mar`, footer
`Order no. OF-1183 · appears on invoices`. Nothing is a different screen.

**States.** loading (skeletons per tab) · empty (per block: `No payments recorded.`,
`Nothing attached.`, `Nothing has happened yet.`) · error (per pane, with `Retry`) ·
read-only (the whole scope is read-only by nature; only the action bar writes) ·
busy (scoped to the action in flight).

---

## C.6 Products (`QueuePage` + `RecordPage`)

**Purpose.** Answer two questions on one screen: *what does this product cost*, and *is it
fully set up*.

```
┌──┬────────────────────────────────────────────────────────────────────────────────────────┐
│▤ │ Products                                                            ⌕ search  ⌘K        │
│  ├────────────────────────────────────────────────────────────────────────────────────────┤
│  │ ⚠ 3 chargeable options have no price — lines using them refuse to price.  [Fix]  ⟳     │
│  │   2 products have no rate card — they price at 'default'.        last checked 4h ago   │
│  ├────────────────────────────────────────────────────────────────────────────────────────┤
│  │ [All 27] [Needs a price 3] [No rate card 2] [Has rules 27]        [ Options ]           │
│  ├────────────────────────────────────────────────────────────────────────────────────────┤
│  │ Product                  Family   Perim  Area   Min  Rules Example  Coverage       Ver │
│  │ ───────────────────────────────────────────────────────────────────────────────────────│
│  │ AMJ80 Sliding Window     amj80    55.00 340.00  0.—    1    $760   card ✓ · 18 priced v3│
│  │ amj80-sliding-window                                                                    │
│  │ ───────────────────────────────────────────────────────────────────────────────────────│
│  │ AMJ150T Lift-Slide Door  amj150      —      —     —    —  $4,020   no card — prices at │
│  │ amj150t-lift-slide                                                 'default' · 2 options│
│  │                                                                    need a price      v1 │
│  ├────────────────────────────────────────────────────────────────────────────────────────┤
│  │ Names, descriptions, images and which options each product offers are edited in Sanity │
│  │ Studio. What anything costs is edited here.  Sanity, loaded 4h ago · 61 products  ↗    │
└──┴────────────────────────────────────────────────────────────────────────────────────────┘
```

**The coverage column** collapses four representations of one fact — `hasRateCard`,
`productsWithoutCard`, `productsWithoutRateCard`, `missing[].productSlugs` — into one cell on
one row. `Fix` filters to `Needs a price`. There is no `Fix` for `no rate card`, because there
is no endpoint that creates one, and the cell says so.

**Rate-card record** (`#/products/{slug}`) — `RecordPage`, three panes:
A = the product index (so you can move between cards without going back) · B = base rates with
their unit-of-effect sentences and the rules editor · C = the worked example with every engine
step *including the ones that did nothing*, the sample provenance sentence, the draft-exposure
paragraph, the change history and per-version `Revert to vN`.
`Review change →` opens **the one permitted modal**: the deltas, the four-column
`What this does to a real window` table, the immediate / never-retroactive / draft-exposure
paragraph, and the ±20% tripwire with its typed slug and required note.

**Options** (`#/products/options`) — `QueuePage`. `Needs a price ({n})` becomes a filter over
the same rows rather than a separate block, so clearing it is visibly the same list. Inline
edit, Enter saves, Esc reverts, sage border when dirty, `Included — $0`, both annotations,
the footer copy, and — new to a pixel — every error the server can return, including the glass
guard's `detail` sentence.

**States.** loading (skeleton) · empty (`No products in the catalogue.` / `No options match
this filter.`) · **error (was: "Loading…" forever on all five screens)** · read-only
(`Read-only — a manager or admin can change these.`) · busy · conflict (`Someone else changed
this card while you had it open. Reload to see their change.` + `[ Reload ]`) ·
narrow (`Editing rates needs a wider screen.`).

---

## C.7 Customers (`QueuePage` + `RecordPage`)

List — `RowList`: Customer (name over email) · Business (`—` in `--quietest` when unset, plus
`ABN {n}`) · Projects · Orders · Registered. **The whole row is the target**; the `Open →`
link is deleted. Client-side search and sort (no server search exists).

Record — three panes: A = the customer index · B = Projects and Orders as `RowList`s · C = the
profile `SpecTable` with `Edit details`.

- Projects rows **link to `#/r/{id}`**; `status_customer` humanised, raw value in the `title`.
- Orders rows stay **inert and say why**: `open from Work — this list carries no record id`.
  A link that guesses is worse than none.
- Profile rows never disappear: `Phone — not set`, `Business — No business name`.
- Edit mode: the four fields with character counters, the admin-only sign-in-email field with
  its helper sentence verbatim, the non-admin `Lock` substitute verbatim, the three error
  mappings verbatim, and a commit receipt (`Saved · just now`).
- One honest absence: `Account discount is applied to every priced line and is not exposed by
  any ops endpoint.`

**States.** loading · empty (`No registered customers yet.` / `No projects.` / `No orders.`) ·
error (`Couldn't load customers. {error}` / `Couldn't load this customer.` + `Retry`) ·
read-only (non-admin on the email field) · busy (`Saving…`).

---

## C.8 Leads (`QueuePage` + `RecordPage`)

List — six views (All / New / Question / Appointment / Contacted / Closed) plus, for the first
time, the six server filters that have never had a control: `state`, `appointment`,
`commercial`, `assigned`, `from`, `to`, as `Facets`. Nine columns, priority-folded so a phone
gets a layout at last. Footer: `showing the newest 300 — the server returns no more`.

Record — three panes: A = the lead index · B = Customer · Submission (two shapes) ·
Manufacturer handoff & reconciliation (appointments only) · Attribution · Activity — every
panel and every string unchanged · C = the four `StatusSelect` dimensions, `Log a contact
attempt` with its three buttons **plus the note field the server already accepts**, and
`Assign to me`.

Repairs: every write gets an error path (today `patch()` and `logContact()` have no `catch` at
all); `projectId` links to the record; `accountId` links to the customer; rows that were
omitted for null values now render `not set`.

**States.** loading (refetch on view change shows a skeleton, not a blank) · empty
(`No enquiries in this view.`) · error (`Couldn't load enquiries. {error}` + `Retry`) ·
busy (all four selects disabled while any write is in flight, as today) ·
manufacturer (this is the only screen a manufacturer partner reaches; the rail carries one
item and the identity block).

---

## C.9 Archive ▸ Files (`QueuePage`)

`RowList`: File (filename over `kind`) · Project (title over customer, linking to the record) ·
Size (B / KB / **MB**) · Scan (`Chip` with tone and word) · action. Facets: kind, scan state.
The selected row opens a 320px detail pane carrying `scan_engine`, `scanned_at`, `created_at`
and the project link — all three fetched today and never drawn.

Three action shapes, unchanged: `Download` (clean) · the plain word `Blocked` (infected) ·
`Scan to unlock` (otherwise, with a row spinner while busy). A rescan that returns `infected`
deletes the bytes from R2, so the confirm sentence says so: *"If the rescan finds an
infection, the file is deleted from storage."*

Footer: `Uploads and deletions are customer-side only — this console can download and rescan.`

**States.** loading · empty (`No files uploaded yet.`) · **error (was: an empty list)** ·
busy (per row) · blocked (the word, no control).

---

## C.10 Archive ▸ Events (`QueuePage`)

`RowList` of `TimelineEntry`: entity type · the raw server sentence · `{actor} · {when}`.
`Facets` wired to the `?entity=` parameter the server has always supported, rendered **only
for entity types present in the returned set** — so the dead `rule` chip appears only if a
historical rule event exists, labelled `retired subsystem`.

**The row links.** `entity_id` is already in the payload and thrown away today; "there is no
way to jump from an audit line to the record it describes" is the most-felt gap in this tab. A
dangling id renders `that record no longer exists` rather than 404-ing.

Each row expands to show the stored `after` payload — line ids, unit ids, changed field names,
compatibility text — written on every event and never surfaced. Where the ops endpoint does
not return it, the expansion says `the payload for this event is not returned by the audit
endpoint`.

Footer: `the last 200 events — the server returns no more`.

**States.** loading · empty (`No events.`) · **error (was: an empty list)** · dangling link.

---

## C.11 Settings (`RecordPage`, one pane, three anchors)

**Staff & roles** — the list and the role select, verbatim, plus:
- `These four roles gate two things: changing a role, and changing a customer's sign-in email.`
- `manufacturer — the one role that changes what a user sees — is assigned by email domain at
  sign-in and cannot be set here.`
- `last seen {ago}` from `last_verified_at`.
- A self-demotion `ConfirmInline`.
- A null name renders `no name set`.

**Commercial** — the deposit percentage with its live consequence sentence (`A $10,000 order
asks for $X up front. Changing this does not alter deposits already requested on existing
orders.`), the note field the endpoint accepts, the version, and the change history the
endpoint has always returned. Beneath it, one line naming the real divergence: *"Order creation
takes 50%, a code constant. This percentage drives the pricing preview only."* Then the **GST
paragraph, verbatim, uneditable** — it is a refutation of a control, not a control, and it
exists to stop the next person building a toggle bound to a column nothing reads.

**Catalogue & policy** — catalogue source (`Sanity, loaded 4h ago` / `built-in fallback (Sanity
not loaded)`), product count, `Open Studio ↗`, the seam sentence, the reconcile stamp with its
never-checked / checked-`{ago}` distinction; then the read-only composite policy
(`tolerance 25 mm · joiner 0 mm · max 4 units`), which governs every split in the console and
has never been visible.

**States.** loading · error · read-only (non-admin: the role selects are disabled with
`Only admins can change roles.`) · busy · conflict.

---

# D. THE COMPONENT VOCABULARY

**Naming.** Class `of-<component>` in kebab case. **State is expressed as ARIA wherever ARIA
has a word for it** (`aria-selected`, `aria-expanded`, `aria-current`, `aria-disabled`,
`aria-busy`, `aria-invalid`), and as `data-*` only where it does not (`data-tone`,
`data-state`, `data-scope`, `data-priority`, `data-unsized`). This is lifted from `theme.css`'s
`.tab`, which is already keyed off ARIA rather than a class *"so the look cannot drift from the
semantics"*. A port to Fluid UI 2 is then a rename of about thirty things, not a rewrite.

**No component carries a bespoke colour.** Every colour is a token from §H.3. Every component
below names the endpoint behind it, so the vocabulary is a build contract rather than a style
guide.

## D.1 Shell

| Component | Props | Variants | States | Backed by |
|---|---|---|---|---|
| `of-app-frame` | `nav[]`, `user`, `brand`, `banner?` | `wide` (≥768, rail) · `narrow` (<768, drawer) · `single-nav` (manufacturer) | boot · signed-out · ready · fatal (error boundary) | `GET /me`, `GET /brand` |
| `of-rail` | `items[]`, `active`, `pinned`, `lane?` | `icon` (48px) · `expanded` (200px overlay) · `pinned` (200px, reflows) · `drawer` | hover · focus-within · `aria-current` on the active item | client |
| `of-brand` | `logo`, `businessName`, `height` | image · wordmark | **logo → business name → the literal word `OpenFrame`.** An invented mark is banned | `GET /brand` |
| `of-omnibox` | `minChars: 2`, `debounce: 250`, `groups` | — | idle · typing · loading · results · empty · error | `GET /search` |
| `of-shortcut-sheet` | `map[]` | — | open | client |

## D.2 Page archetypes

| Component | Props | States |
|---|---|---|
| `of-queue-page` | `views[]`, `facets[]`, `columns[]`, `rows[]`, `footer` | delegates to `of-state-trio` |
| `of-record-page` | `header`, `panes[]` | delegates per pane |
| `of-pane-group` | `panes[]` — each `{id, title, meta?, width, scroll, collapsible, scopes?}` | Exactly **one** `width: fluid` pane per group. Each pane scrolls independently; the page never scrolls |
| `of-pane` | `title`, `meta?`, `collapsed?`, `scopes?` | Head is `px-4 py-2.5`, `border-b`, `t-label` left, `t-cap font-data` right — the existing `Block()` promoted to pane level |

## D.3 Record chrome

| Component | Props | Rules | Backed by |
|---|---|---|---|
| `of-record-header` | `eyebrow[]`, `title`, `subtitle`, `metrics[2..4]`, `ribbon`, `actions[]`, `freshness`, `banners[]` | **Fixed; never scrolls.** Collapses to 104px past 200px of scroll | `GET /projects/:id` |
| `of-phase-ribbon` | `phases[6]`, `currentIndex`, `stateLabel`, `waitingOn`, `days` | Six equal cells. passed = sage fill / white; current = ink, semibold, 2px sage bottom rule; future = transparent, muted. **Never a ring, a percentage, a colour-only badge, or a vertical node timeline of all 21 states** — all four are already refused in the source with reasons that still hold | `lifecycle` |
| `of-action-bar` | `actions[]`, `errorCount` | Inapplicable → absent (the server omits it). Blocked → present, disabled, **reason beside it, never a tooltip**. Exactly one `primary`. `overflow` tier not built | `ops-actions.ts` |
| `of-confirm-inline` | `label`, `sentence?`, `input?: {kind:'text'\|'note', placeholder, max}` | Drops beneath the action bar, inside the fixed header. `Esc` cancels. Confirm disabled while a required input is empty. Never a modal | per action |
| `of-freshness` | `lastChangeActor`, `lastChangeAt`, `loadedAt`, `onRefresh` | `Last change · maria · 14 Aug 09:12` + `as of 14:32 ⟳ Refresh`. **Never "editing elsewhere"** | `activity[0]` |
| `of-metric` | `label`, `value`, `caption?` | `t-label` over `font-data`. Money always carries its basis word | |

## D.4 Lists and data

| Component | Props | Rules | Backed by |
|---|---|---|---|
| `of-row-list` | `columns[{key,label,align,width,priority}]`, `rows[]`, `selectedId`, `onOpen`, `indent?` | **The only list primitive. No card variant.** `priority: 1` survives every width; 2–3 fold into the row's meta lines below their breakpoint. **The whole row is the target on every surface** | any list endpoint |
| `of-row` | `lead`, `title`, `sub`, `trail`, `tone`, `indent 0\|1`, `selected`, `disclosure?` | `aria-selected` → 2px sage left marker + sage-wash fill. `disclosure` uses `.disclose` (`grid-template-rows: 1fr → 0fr`, 200 ms, reduced-motion escape) | |
| `of-spec-table` | `rows[{label, value, hint?, tone?, absent?}]`, `columns 1\|2`, `dense` | **A missing value renders the word, not a blank. Never drop a row to hide an absence.** Units and basis travel with the number | |
| `of-absence` | `reason` | The atom P2 is made of. Renders in `--quietest`: `not recorded` · `not set` · `no target derived` · `never checked` · `not retrievable`. **It is never styled as an error** — an absence is a fact, not a failure | |
| `of-diff-marker` | `label`, `before`, `after`, `delta?`, `unit?` | `before → after`, `—` for an absent side (never `0`), sign **outside** the money symbol (`−$3.60`, U+2212). Hosts: pricing deltas, pricing history summaries, learning `proposed → final`, unit `SpecSummary`, composite coverage, the customer email-change audit line, and conflict recovery (§E.6) | |
| `of-step-trace` | `steps[{key,label,detail,amount,applied}]` | **Renders the steps that did nothing**, muted, with `—` in the amount column. `no effect` · `did not fire` · `none on this account` | `POST /pricing/preview` |
| `of-timeline-entry` | `action`, `actor`, `at`, `entityType?`, `entityId?` | Prints the **raw server sentence**; inventing prettier prose would desynchronise from the log. `actor` falls back to `system`. Links when `entityId` resolves | `audit_event` |
| `of-money` | `value`, `mode: full\|round` | `null → "—"`; `0 → "$0.—"`; `en-AU`; sign outside the symbol | |
| `of-elevation` | `width`, `height`, `parts[]`, `axis`, `size: xs\|sm\|lg`, `unsized` | The existing `ItemForm` SVG. `vector-effect: non-scaling-stroke`; `.elev-dim` in the data face with `tabular-nums slashed-zero`; **`[data-unsized] { opacity: .55 }` — a drawing with no size must not read with the same authority as a measured one.** It draws **our configured result**, never the customer's document, and the pane says so | `workspace.lines[].segments` |

## D.5 Status, tone and state

### `of-status-word` and `of-chip` — the tone system

Five tones. **Colour never appears without its word** (P3). One system replaces the three that
coexist today.

| Tone | Meaning | Token set | Used by |
|---|---|---|---|
| `ready` | done, correct, nothing owed | `--sage` / `--sage-wash` / `--sage-ink` | line `ready` · payment `paid` · scan `clean` · thermal `Meets target` · rate card present · reconcile ok · enquiry `contacted` / `confirmed` |
| `review` | ours to resolve; stops nobody yet | `--warning-ink` on `--panel-warn-bg`, border `--panel-warn-bd` | `needs review` · `unpriced` · coverage delta · scan `pending` / `skipped` · option missing a price · `Misses target` · mixed frame systems · **every `blockedReason`** · enquiry `new` / `requested` |
| `blocked` | cannot proceed | `--attention` / `--attention-ink` | infected file · a hard server refusal · action error · enquiry `lost` / `cancelled` / `no_show` / `no_response` |
| `waiting` | correct, and not ours | `--info` / `--info-ink` | waiting on `Customer` · `Quote issued` · deposit / balance invoiced · enquiry `waiting_on_customer` / `closed` / `completed` / `order_placed` |
| `quiet` | inert, superseded, not applicable | `--quiet` | waiting on `Nobody` · superseded revision · `not_applicable` · `after_sales` |

`Enquiries.tsx`'s five raw-Tailwind buckets (amber / blue / sage / red / neutral) map 1:1 onto
`review / waiting / ready / blocked / quiet` — the one off-brand palette in ops disappears
without losing a single distinction.

`of-chip` is a 1px border + `t-cap`, unfilled, except `ready` which may carry `--sage-wash`.
`of-status-word` is the bare word plus an optional 12px icon.

**Rule with teeth:** a value that is a raw DB token (`under_review`, `deposit_invoiced`,
`not_contacted`) is humanised **everywhere or nowhere**, and the raw value lives in the
`title` so a support conversation can still quote it. Today the customer 360 prints raw tokens
that are humanised two screens away.

### `of-state-trio` — loading / empty / error

One component, three states, and the hardest rule in this document.

| State | Render | Rule |
|---|---|---|
| `loading` | Skeleton rows in the shape the pane will become; `role="status"` | A bare 20px spinner tells you nothing about what is coming, and ops uses one on every surface today |
| `empty` | Dashed card, `p-12`, a sentence naming *why this is empty here*, plus the action that would fill it when one exists | `No files uploaded yet.` — never `No data` |
| `error` | White card, red hairline, a headline naming the failure, the raw code in `t-cap`, and a **`Retry` that refetches only this pane** | |

**A failed fetch may never degrade to an empty list or to a permanent "Loading…".** Named
offenders this contract makes uninstantiable: `Projects`, `Files`, `Audit`, `Admin` (all
`catch → setX([])`); `Pricing` ×5 (`catch → setD(null)` renders `Loading…` forever);
`Options.commit` and the enquiry `patch`/`logContact` (no `catch` at all — a failed status
change is an unhandled rejection and no message); `ProjectRecord.load`
(`setWs(null)` → an infinite bare spinner with no error and no retry).

| Component | Props | States |
|---|---|---|
| `of-banner` | `tone: review\|blocked\|ready\|waiting`, `text`, `actions[]` | The unresolved-lines warning, the degraded strip, the conflict strip, the reconcile health banner |
| `of-error-inline` | `code`, `detail?`, `missingOptions?`, `onReload` | 24+ mapped codes plus a generic. Renders `[ Reload this record ]` for every 409 |
| `of-save-flash` | `region`, `message` | One line, non-blocking, auto-fading after 4 s, never requires dismissal. `Saved · line total $3,780` |

## D.6 The opening

| Component | Props | States | Backed by |
|---|---|---|---|
| `of-opening-list` | `lines[]`, `selectedId`, `showRecordChip` | expanded · 44px code strip · picker bar | `workspace.lines` |
| `of-unit-list` | `segments[]`, `axis`, `policy`, `editable` | read · editing · confirm-remove · at-max · below-two | `PATCH/POST/DELETE segments` |
| `of-coverage` | `spanned`, `opening`, `tolerance` | exact · within tolerance · outside (**still allowed** — a mullion or jamb allowance is a real engineering decision and the reviewer is the authority) | `composite_policy` |
| `of-split-panel` | `line`, `policy` | split-planner · merge-only | `POST /lines/:id/split` `/merge` |
| `of-review-flags` | `review{}`, `onResolve` | flags · resolve-checked | `resolveReview` |
| `of-item-form` | the existing `ItemForm` props | as today, all guards intact | `PATCH /lines/:id` |
| `of-config-select` | `lineId` | loading · ready · error + `Try again` · ready-but-empty | `GET /lines/:id/configurations` |
| `of-price-panel` | `total`, `basis`, `gstMode` | priced · `priced from its units` · unavailable | `price-preview`, snapshots |
| `of-note-control` | `scope: record\|line\|enquiry`, `placeholder`, `max: 500`, `kind?` | Textarea + live counter, `⌘⏎` submits, `Esc` discards with a guard when dirty. Four hosts: record note · **line note (`lineId`, always accepted, never sent)** · clarification request · enquiry contact-log note | `POST /projects/:id/note`, `/contact-log` |

## D.7 Evidence and derivation

| Component | Props | States | Backed by |
|---|---|---|---|
| `of-hop` | `index`, `title`, `summary`, `open`, `body` | collapsed (summary in the header) · open · **unwired** · none | §F |
| `of-source-fact` | `file`, `quote`, `origin`, `confidence?` | present · `none` | `evidence[]` + `files[]` |
| `of-derivation-step` | `label`, `value`, `basis` | present · absent (`of-absence`) | `building-model`, `thermal` |
| `of-caveat` | `text` | permanent, muted | the truth |
| `of-firmness` | `band`, `derivation`, `missingInputs[]`, `basis` | high · medium · low · not recorded | `confidence_band`, `missing_inputs_json`, `recommendation_basis` |
| `of-machine-now-edited` | `rows[]`, `retrievable` | full · **`machine column not retrievable`** · `no machine proposal` | §F.4 |
| `of-thermal-row` | `row` | six verdicts, each a word | `GET /projects/:id/thermal` |
| `of-flow-list` | `steps[]`, `gates[]` | done · pending · gate-blocked | §G |
| `of-learning-review` | `outcomes[]`, `reasonOptions[]` | pending · thermal-target · confirm | `PATCH /recommendation-outcomes/:id` |

## D.8 Form atoms

`of-field-row` (label + control + hint + error, `aria-describedby`, `aria-invalid`) ·
`of-number-field` (`inputMode="decimal"`, right-aligned, data face) ·
`of-select-field` (native `<select>` — the console has four today and they work) ·
`of-money-value` · `of-disclosure` (`.disclose`) · `of-facets` · `of-view-strip`.

**Variants deliberately not built:** a density toggle · card-vs-table duality · ghost / link /
text button tiers beyond primary + secondary · icon-only buttons without a label · a second
modal system · a tooltip system · a colour-only badge · an avatar · a progress ring · a
notification centre · a dark theme (the `.dark` block in `theme.css` is dead code).

## D.9 Three defects in the live design language that the prototype fixes rather than reproduces

1. `theme.css:1227` — **`content: ;`** is a CSS parse error, so `.tab::after` never generates a
   box and the documented 9×9 sage selection square **has never rendered**. Write `content: "";`.
2. **`const MONO = {} as const`** in `ProjectRecord.tsx` and `Pricing.tsx` is an empty object
   spread at ~20 call sites. Every place the code believes it is setting a data face, it is
   not. Use `font-family: var(--font-data); font-variant-numeric: tabular-nums`.
3. **`Pricing.tsx`'s `INK = "var(--ops)"`** shadows the real token, so two adjacent tabs render
   "primary text" in two different blacks. Use `--ink`.

And one addition: **ops has no focus ring at all.** Adopt the site's
`focus-visible: 2px solid var(--sage); outline-offset: 2px`. That is an accessibility defect
in the product, not a style to preserve.

---

# E. INTERACTION MODEL

## E.1 Selection

Single selection, everywhere, always reflected in the URL, three levels deep:
**view → record → line → (hop | editor)**.

- Queue: one focused row; `⏎` opens it. `#/work/{view}`.
- Record: one selected opening; `#/r/{id}/{code}`. **Default selection on load is the first
  opening carrying a review flag, else the first opening** — the console opens on the first
  thing wrong.
- A nested unit selects within its parent and scopes the spec block to it while leaving the
  parent's elevation visible.
- Derivation hop expansion is per hop, sticky across line selection, and in the URL when
  non-default (`?d=candidates`).

**There is no multi-select and no checkbox anywhere in the console**, because no endpoint
accepts a batch. A checkbox column that can only ever act on one row is a promise the server
cannot keep.

## E.2 Keyboard map

Global shortcuts fire only when focus is **not** inside a text field, `select`, or
`contenteditable`. `Esc` always blurs first, then closes. **No single-letter key performs a
write** — every write is `⌘`-modified or a button — because single-letter shortcuts on a shared
machine fire on stray keypresses.

| Key | Action |
|---|---|
| `⌘K` / `Ctrl K` / `/` | Omnibox. `↑ ↓` move, `⏎` opens **the record**, `Esc` closes |
| `g` then `w l c p a s` | Work · Leads · Customers · Products · Archive · Settings |
| `?` | Shortcut sheet |
| `⌘\` | Pin / unpin the rail |
| `j` `k` or `↓` `↑` | Next / previous row or opening (moves without opening) |
| `⏎` | Open the focused row / focus the first field of an open editor |
| `1`–`9` | Select the Nth opening; inside the derivation rail, jump to hop N |
| `[` `]` | Collapse pane A / pane C. On a record with a lane, `⌘[` `⌘]` walk to the previous / next record **in the lane you arrived from** |
| `\` | Focus mode — collapse both side panes |
| `e` | Edit the selected opening's spec |
| `u` | Units (composite) · `s` split / merge panel |
| `n` | Note **on this line** |
| `T` | Sheet view ⇄ master-detail |
| `i` | Toggle the derivation rail (or summon it, narrow) |
| `r` | Reload this record |
| `⌘S` | Save the open editor |
| `⌘⏎` | Fire the primary action (its `confirm` panel still opens if the server declared one) / submit an open confirm |
| `Esc` | Retreat exactly one level: blur → close editor → close overlay → cancel confirm → back |

## E.3 Focus order and focus behaviour

Tab order: **rail → header actions → pane A → pane B → pane C**. Each pane is a landmark
(`role="region"` with `aria-label`), so a screen-reader user moves between them with landmark
navigation rather than 40 tab stops.

- **Focus is never stolen.** Opening a record does not move focus into the editor.
- After a save, focus **returns to the control that triggered it** and the region scrolls it
  into view. Today there is no focus restoration and no success signal at all.
- `Esc` inside an open editor with unsaved changes opens the existing discard guard
  (`Discard changes? Discard / Keep editing`) rather than discarding.
- The confirm panel traps nothing, because it does not cover anything (P7); `Esc` cancels it
  and returns focus to the action that raised it.

## E.4 Saving — three idioms, each already in the product

| Idiom | Applies to | Precedent |
|---|---|---|
| **Write on change** | closed-vocabulary `select`s **only** — the enquiry's four status dimensions, a staff role | `Enquiries.tsx` |
| **Write on Enter, Esc reverts** | a single number in a cell — an option surcharge, a "needs a price" row | `Pricing.tsx` Options |
| **Explicit Save** | anything with more than one field — a line spec, a unit, a customer profile, a rate card | `ItemForm`, `RateCardDetail` |

Stated once so nobody has to guess: *a control that writes on change must be a closed
vocabulary; a control that writes on Enter must be a single number; anything else gets a Save.*

**No optimistic UI anywhere.** Every mutation awaits the server and refetches, exactly as
today: the server re-derives line status, composite totals and the available action set, and a
locally-guessed total is a number the console invented — the one thing this design will not do.

Three changes to the *feedback*, which is presently non-existent:

1. **`busy` is scoped to the smallest thing that can fail.** Today a single global flag
   disables every action on the record while any one of them is in flight. Saving unit 2
   disables unit 2's Save and the header's primary action (which that save invalidates), and
   nothing else.
2. **A refetch preserves the bench.** Selected opening, scroll offset per pane, open editor
   (by line id), hop expansion and collapse states all survive `load()`. Today they do not,
   which on a nine-line job means finding your place again after every save.
3. **Success is signalled.** `of-save-flash` renders one non-blocking line in the region that
   changed — `Saved · line total $3,780`, `Revision R3 issued and emailed` — auto-fading after
   four seconds, never requiring dismissal. It is not a toast system.

**Errors render at the thing that failed** — the row, the unit, the field, the pane — with the
action bar keeping a persistent `{n} errors · show` that scrolls to and expands the first one.
Today every `LineRow` and `SplitPanel` failure lands at the top of the page, potentially a
screen and a half above the row that caused it.

## E.5 Undo

**There is none, and the console does not pretend otherwise.** Of the sixteen mutations in the
ops surface, exactly one is reversible by an endpoint —
`POST /pricing/rate-cards/:id/revert` — and even that is a new *forward* change, never a
rewind. `issue-revision` emails a customer. `pay` stamps a payment. `advance` moves a stage
machine. `request-clarification` emails and pauses a quote. A global undo that works for one
action in sixteen is worse than none.

What stands in for it is what the codebase already chose — **confirmation, not permission**:

- `of-confirm-inline` with the server's own consequence sentence, e.g. *"Freezes this quote as
  a new revision and emails it to ops@harbourbuild.com.au."*
- **Free text at the point of consequence** — the bank reference on a payment, the message on
  a clarification request, the note on anything.
- **Back-edges in the FLOW graph**, labelled as such: `Send to technical review` ⇄
  `Back to pricing`, `Resume pricing`.
- **The ±20% typed-slug tripwire** with its required "why", and the full before/after in
  `pricing_change`.
- **Cheap revert exactly where revert is real**, now with the confirmation it currently lacks.
- **The audit trail as the record of what happened**, with its stored payload visible.

Explicitly **no undo** for `issue-revision`, a recorded payment, or an order advance — and the
confirm sentence says so before the click.

## E.6 Conflicts

Optimistic concurrency already exists server-side (`quote_edit_version`, `edit_version`,
`expectedVersion`) and produces six distinct codes with good copy. Three changes:

1. **The message lands where it happened**, not in a header strip.
2. **The message is paired with the control it demands.** Four messages instruct the user to
   reload and no reload control exists; every conflict now renders `[ Reload this record ]`
   beside the sentence.
3. **The typed values are not thrown away.** On `line_changed_reload_required`: refetch, keep
   the user's draft in the editor, and mark each field whose server value now differs with an
   `of-diff-marker` (`yours 1210 → theirs 1250`), so the reviewer re-applies deliberately
   instead of retyping from memory. This is the most complex piece of client state in the
   design and it is the one that turns a data-loss event into a decision.

After the reload, `of-freshness` names the actor and time of the change that beat you, read
from `activity[0]` — real attribution from real data.

`line_changed_reload_required` fires on either the line's `edit_version` or the project's
`quote_edit_version`; the copy names which, so "someone else edited this line" and "someone
else edited this quote" stop looking identical.

## E.7 Presence

**None, and none is proposed.** There is no websocket, no SSE, no polling and no presence
storage. Today's console ships a fabricated one: the Live-draft tab's meta line reads
`editing elsewhere` **always**, whether or not anyone else has the record open. That literal is
deleted — a warning that never varies trains people to ignore warnings.

What replaces it is true: `Last change · maria · 14 Aug 09:12`, `as of 14:32 ⟳ Refresh`, and
the conflict message at the only moment the system actually knows a collision happened.
Staleness is stated as **age**, which is knowable, rather than as **occupancy**, which is not.

## E.8 Deep links

Hash routing, no server change, refresh-safe, browser back works. §B.1 lists every URL. This
one change repairs five dead ends that exist today:

| Dead end today | Repaired by |
|---|---|
| Omnibox result → tab only, id discarded | `#/r/{id}` |
| Customer 360 → inert project rows | `#/r/{id}` |
| Enquiry with a `projectId` → no link | `#/r/{id}` |
| Audit event → no way to reach its record | `#/r/{id}` (dangling → `that record no longer exists`) |
| "Send me a link to that job" → impossible | The record ref is click-to-copy |

A dirty editor guards navigation (`beforeunload` plus an in-app confirm), because routing makes
refresh cheap and refresh is how people will lose a half-typed line.

## E.9 Responsive and narrow behaviour

The ladder is specified per screen in §C. The three rules behind it:

1. **Nothing is hidden without an address.** A pane that collapses becomes a strip with a
   count, or a summonable drawer with a key — never a disappearance.
2. **One component, not two.** `of-row-list` folds columns by priority; there is no separate
   card component, which is what leaves Enquiries and Files with an 860px table in a sideways
   scroller today.
3. **The phone is admitted as a reading device** for the review workspace, and says so once, in
   the openings sheet's empty state. Every control still works; nothing is disabled by width.

`main` keeps `min-width: 0` — load-bearing, because a flex child defaults to `min-width: auto`
and any wide table would otherwise push the whole document sideways.

## E.10 Accessibility commitments

| Commitment | Detail |
|---|---|
| **Focus ring** | `focus-visible: 2px solid var(--sage); outline-offset: 2px` on every interactive element. `src/ops/` has **none** today; this is a defect, not a style |
| **Colour is never alone** | P3. Greyscaling any screenshot must lose no information |
| **Landmarks** | `role="region"` + `aria-label` per pane; `role="navigation"` on the rail; `role="main"` on the fluid pane |
| **Live regions** | `role="alert" aria-live="assertive"` on every error (already true of the record's header strip); `role="status"` on every loading state and on `of-save-flash` |
| **Tabs are tabs** | The record-scope tab strip and the derivation hops carry `role="tablist"` / `aria-selected` / `aria-controls`. Today's version tabs are plain buttons with none of it |
| **Form semantics** | `aria-describedby` for hints, `aria-invalid` for errors, `sr-only` labels where a visible label would be redundant (already true of the learning reason select) |
| **Touch targets** | 44px on every touch surface; 36px desktop equivalents |
| **Motion** | 150 ms colour/border, 200 ms disclosure and drawer; every animated block has a `prefers-reduced-motion: reduce` counterpart |
| **Keyboard-only** | Every action reachable without a pointer; `?` documents the map; no hover-only affordance carries information (which is why `blockedReason` is never a tooltip) |
| **Contrast** | Text tones are used per their documented job — `--quietest` only for absences and empty states, never for a value |

---

# F. THE EVIDENCE AND SELECTION LOG

This is the part of the brief the owner's wireframe reached for and the part the data cannot
support in the shape it was drawn. What follows is the chain as it can actually be built,
hop by hop, from persisted data — and an explicit list of the hops that cannot be shown.

## F.1 Why the wireframe's centre pane is not built

| Wireframe element | Reality in the database |
|---|---|
| Sheet reference `A601` | `evidence_items.sheet_ref` — the column exists and **every producer sets it to NULL** |
| Page number | `evidence_items.page_no` — **always NULL**. Per-page roles *are* computed during ingest (`IngestedDoc.rolePages`) and are never persisted |
| The highlighted region on the page | `evidence_items.region_json` — **always NULL**. And there is no rasteriser: Workers AI Markdown does not render PDF pages and the Worker has neither a Browser Rendering binding nor a canvas, so even with a region there would be no bitmap to draw it on |
| The verbatim schedule row | `extracted_text` is a **synthesised** string (`"W03 3-part combination 2700x1500"`), not the source row. Verbatim rows exist only for the legacy deterministic parser (`parse_line.raw_json`), which is not the AI path |
| `confidence 94%` | The only 0–1 numbers in the system are the extraction model's own self-report and a ranker score wearing the word "confidence" (`draft_order_line.confidence` literally *is* the ranker score under a misleading column name). The one deterministic confidence is `confidence_band ∈ high \| medium \| low` |

Four of those five are exactly the kind of value this codebase most explicitly refuses to
invent. So the widest column goes to the thing that **is** fully present and is what the
reviewer is adjudicating — the opening, drawn, specified, split, spanned, thermally checked
and priced — and the evidence lives in a 360px rail as what it truthfully is: the file it came
from (downloadable), the text as extracted (labelled as reconstructed), the origin word, and
the model's own number labelled as the model's own.

**The slot is reserved, not deleted.** `geometry.ts:toRegion()` already produces exactly
`region_json`'s documented `[x0,y0,x1,y1]` top-left-origin fractional shape, and
`read.ts` already computes it for a matched frame. It is one INSERT column plus a client-side
pdf.js render away. Until both exist, `of-source-viewer` has exactly one state — `unavailable`
— rendering *"This system does not record which page a fact came from."* **No PR may add a
second state to that component until `region_json` is non-null in production.**

## F.2 The ten hops

Pane C, one `of-hop` each, numbered, collapsible, summary in the collapsed header. Default
open: 1, 2, 5, 6, 7.

| # | Hop | What it shows | Built from | The honest absences it prints |
|---|---|---|---|---|
| 1 | **Source document** | filename · `kind` + `doc_type` with whether the classification was `auto` or a person's correction · size (MB tier) · scan verdict · uploaded date · **`[ Download ]`** (clean only; `Blocked` / `Scan to unlock` otherwise) | `evidence_items.file_id` → `file_asset`, joined to `workspace.files[]` | **`Page, sheet and region are NOT RECORDED for this fact.`** — always, on every line, because the columns are always NULL. One line, so nobody hunts for a viewer that cannot exist |
| 2 | **Extracted fact** | `extracted_text` in quotes, labelled *"reconstructed by the extractor — not the verbatim source row"* · `origin` (the closed 9-value taxonomy; in practice only `explicit` and `geometry_derived` are ever written) | `evidence_items` | The model's `confidence.tag` **only when non-null**, as a raw decimal under *"declared by the extraction model — self-reported, nothing corroborates it"*. Never a `%`, never a bar, never the unqualified word "confidence". Plan-context and thermal rows write `null` — the line is omitted, never zero-filled |
| 3 | **Opening in the building model** | `externalRef` · `parentRef` · element type · quantity · `configuration.familyRequested` + `layoutCode` · `scheduleRequirements` (double-glazed, glass description, colour, flyscreen) · shading projection · wall orientation · room · and any `conflicts[]` naming this tag, with its `resolution` (`keep_first_and_flag`), its `selectedValue` and a `[detail]` disclosure listing the competing values and their file ids | `building_models.model_json` via `GET /projects/:id/building-model` — **implemented, staff-gated, typed client function, zero call sites today** | Every unpopulated field prints `NOT RECORDED`, not an em dash. `envelope.walls/floors/ceilings/roofs` are always empty arrays; `heatingLoad`/`coolingLoad` are never extracted; `jurisdiction.confidence: 0` renders as the word **`assumed (Melbourne/VIC default)`**, and `null` as `from the plans` — it is a flag, not a percentage |
| 4 | **Requirement** | Uw / SHGC band · `requirement_basis` · *"inherited from opening"* when true · the **immutable archetype snapshot** when a default envelope applied | `opening_requirements` and the frozen copy in `ai_proposal_line.ranking_context_json.requirements` — the thermal endpoint already prefers the frozen one, and so does this hop | In practice only `explicit_energy_report` and `default_envelope` are ever written; `plan_derived` and `human_override` never are. `opening_requirements.confidence_json` is the *extraction* confidence reused as requirement confidence — a category error, so it is **not shown here at all** |
| 5 | **Candidates** | The versions the decision was made under: `catalogue rev {n} · rules v2-thermal-nonblocking · ranker v3-graded-thermal` | `selection_run` versions carried on the line's snapshots | **`The candidate evaluation is recorded but no endpoint reads it.`** `candidate_result` holds one row per (product × variant) with per-filter pass/fail, human-readable reason strings, six score components, rank and selection — the single largest already-paid-for, unrendered dataset in the system. §F.5 names the one endpoint that would unlock it. **The hop never invents a candidate** |
| 6 | **Chosen** | product slug · variant id · `recommendation_basis` (`energy_report` / `schedule_specification` / `building_context` / `default_allowance`) | `quote_line.selected_variant_id`, `recommendation_basis`, `configuration_snapshot_json` | `assumptions_json` is always `[]`, so the hop renders no "assumptions" heading. The six score components live in `candidate_result` and are therefore part of the §F.5 gap |
| 7 | **Thermal** | This line's row from the thermal endpoint: target `bandText`, basis + inheritance, proposed slug/variant, achieved `Uw · SHGC` with `estimated` beneath when the source is estimated, and the verdict word with its signed miss delta | `GET /projects/:id/thermal` | Six verdicts, each a word: `—` · `No parse record` · `No target derived` · `Not comparable` · `Meets target` · `Misses target (+0.14)`. Rows with no target are shown, not hidden. `+` is carried explicitly on SHGC because the band is two-sided |
| 8 | **Compatibility** | For a **composite**: the frame system of each unit, and `mixed frame systems · A + B — confirm these couple` when they differ, with the server's sentence *"Frames of different depth do not couple, so they cannot be joined in one opening."* | `configuration_snapshot_json.frameSystem` per segment | **For a single line the frame system is not recorded at all.** The hop says exactly that and does not guess it from the product. The `composite`, `option_compatibility` and `data_completeness` filters are declared in `FilterName` and never emitted — the hop says "5 filters evaluated", never 8 |
| 9 | **Price** | rate card id + version · pricing policy version · deposit % · discount % · applied modifiers | `quote_line.pricing_snapshot_json` | The per-step explain trace exists **only** when the ops Pricing preview requested it — never in an estimate's snapshot. The hop says `step trace not captured for this line` and links to that product's worked example |
| 10 | **Human edits** | who touched it, when, which fields — and the payoff sentence: *"These fields are locked against re-extraction. A re-upload will not overwrite them."* | `quote_line.edited_fields`, `edit_version`, `origin`, plus record audit lines scoped to this line id | There is **no per-edit before/after history**: `ai_review_deltas` has neither writer nor reader. The hop states *"Intermediate values between edits were not kept."* |

Hop 10's lock sentence is not decoration. The pipeline's `unless()` guard means a re-run will
**not** overwrite a human-set field. "I re-uploaded and nothing changed" is the most confusing
behaviour in the system today, and one sentence fixes it.

## F.3 "HOW FIRM IS THIS?" — uncertainty without a fabricated number

Rendered in pane B, directly under the coverage line, three lines, all deterministic:

```
HOW FIRM IS THIS?
Medium — a second candidate scored within 0.05.
Missing when chosen: orientation · room area
Basis: schedule specification
```

- **Line 1 is `confidence_band`** — the one CHECK-constrained, deterministic confidence in the
  system — rendered as **a word with its derivation printed after it**, never a bar, ring or
  percentage:
  - `High — one candidate clearly ahead and every hard rule passed` (`status === 'ready' && dominant`)
  - `Medium — a second candidate scored within 0.05` (everything else)
  - `Low — no priceable configuration was available` (`unavailable` / the no-product branch)
  - `Not recorded — this line was created by hand` (`origin: 'manual'`, no proposal)
- **Line 2 is `missing_inputs_json`**, humanised: `orientation` · `room area` ·
  `performance variant` · `thermal band not met` · `priceable configuration`. **Naming what was
  missing is a better expression of doubt than discounting a number**, and it is actionable in
  a way a percentage never is.
- **Line 3 is `recommendation_basis`** — the four-value closed vocabulary.

Model self-reported 0–1 values are **not suppressed** — suppressing a stored number is its own
kind of opacity — but they appear only inside hop 2, as a raw decimal, under an explicit
provenance label, and they never roll up into a headline.
`building_models.confidence_json.schedule_extraction_confidence` is an *average of
self-reports*; it appears only in the run block, captioned as such.

**The prototype must never render a `%` next to the word confidence. Anywhere.**

## F.4 MACHINE PROPOSED / NOW / EDITED — and its honest limit

The machine's answer is already immutable (`ai_proposal_line` is written once;
`configuration_snapshot_json` freezes the chosen configuration). The live `quote_line` is the
human's current answer. So the honest expression is a three-column field ledger:

```
MACHINE PROPOSED         NOW                 EDITED
────────────────────────────────────────────────────────────
 amj80-awning            amj80-awning        —
 2700 × 1500             2700 × 1500         —
▎Colour  Surfmist       ▎Colour  Monument   ▎edited · you · 6 Aug
 Glass   Low-E double    Low-E double        —
 Install Bracket         Bracket             —

Locked against re-extraction: colour. A re-upload will not overwrite it.
```

Rules:
- A changed row carries a 2px sage left stripe on **both** the machine cell and the now cell,
  plus the literal word `edited` in the third column. Never colour alone.
- Unchanged rows print `—`, not blank, so the ledger reads as complete.
- On a line with `origin: 'manual'` and no proposal the ledger collapses to one row:
  *"No machine proposal for this line — it was created by hand."* — which is
  `decision: 'no_ai_proposal'`, a real stored value.

**The limit, and it is a correction to the concept this graft came from.** The workspace
payload does not carry `ai_proposal_line`. Before a quote is issued, the only machine-side
values the console can read are `configuration_snapshot_json` (frozen at selection) and
`recommendation_basis`. The full proposed-vs-final configuration arrives only through
`GET /projects/:id/recommendation-outcomes`, which returns rows **only after issue** and only
where `decision = 'adjusted'`. Therefore:

| Situation | What the ledger renders |
|---|---|
| Line has `configuration_snapshot_json` | Machine column from the snapshot; `NOW` from the live line; `EDITED` from `edited_fields` |
| Line is AI-managed but the snapshot lacks a field | That row's machine cell reads `not retrievable`, an `of-absence` — never blank, never the current value repeated |
| Quote issued and an outcome exists | The full `proposed_config_json` → `final_config_json` diff, which is fetched on every record load today and drawn nowhere |
| `origin: 'manual'` | The one-row collapse above |

The `EDITED` column depends on `quote_line.edited_fields` reaching the `OpsLine` DTO. It is a
column that exists and is not selected; adding it is the single smallest enabling read in this
spec (see §F.5, E3).

## F.5 The hops we cannot show today, and what each would cost

| Gap | Why | What would close it |
|---|---|---|
| **Rejected candidates, per-filter reasons, six score components, ranks 2–3** | `candidate_result`, `selection_run` and `draft_order_line` are fully persisted and **no ops endpoint reads any of them** | One read-only endpoint, `GET /api/ops/lines/:id/selection`. No new columns, no writes, no new vocabulary. Until it exists, hop 5 renders its unwired sentence |
| **Per-revision line detail / a revision diff** | `revision_line` snapshots exist; nothing reads them back. Selecting `R2` today changes three labels and shows the live draft's rows | `GET /api/ops/revisions/:id/lines`. Until then the Revisions ledger states the limit and does not offer a switcher |
| **What the machine actually did on this run** — status, `error_code`, `input_mode`, `summary_json.stageWarnings`, per-stage model / prompt version / escalation reasons / tokens | `ai_runs` and `ai_stage_runs` have no ops reader. Ops currently **cannot see an extraction failure at all** | `GET /api/ops/projects/:id/run`. Until then the run block renders `Stage detail and extraction warnings are recorded but not exposed to this console.` |
| **Page number, sheet reference, region** | Columns exist, always NULL, and there is no page rasteriser | Persist `page_no` + `region_json` (both already computed in memory) **and** add a client-side pdf.js render. Two changes, not one |
| **The verbatim source row** | Only the legacy deterministic parser stores one | Not proposed |
| **Evidence confirm / reject** | `evidence_items.review_state` has no writer anywhere | Not proposed — a control that writes nothing is worse than none |
| **A structured AI→human field diff across multiple edits** | `ai_review_deltas` has neither writer nor reader | Not proposed. Hop 10 states the limit |
| **Frame system for a non-composite line** | Never recorded — `ai_proposal_line.configuration_json` has no `frameSystem` field | Not proposed. Hop 8 says so rather than guessing from the product |
| **AI run cost** | `ai_runs.cost_json` is never written and `token_usage_json` is NULL in practice | Not proposed |
| **A customer's account discount** | `user.discount_percent` has no ops read path, and it silently moves every price the pricing preview shows | One column on `GET /customers/:id`, read-only |

**Three enabling reads, in priority order, none of them a new capability:**

| | Change | Size | Unlocks |
|---|---|---|---|
| **E1** | Call `GET /projects/:id/building-model` from the record | one fetch + one component | Hops 1–4. Zero server work — the endpoint is implemented, staff-gated, and its typed client function has never been called |
| **E2** | Add `recommendationBasis`, `recommendationConfidence` and `editedFields` to the workspace `lines[]` SELECT | 3 existing columns | §F.3's band and basis, and §F.4's `EDITED` column |
| **E3** | Build `GET /lines/:id/selection` | one read-only endpoint | Hop 5 and the score components in hop 6 — the brief's "product selection log" in full |

---

# G. THE ORDER FLOW AND APPROVALS

## G.1 The three vocabularies, and the one ribbon over them

| Column | Values |
|---|---|
| `project.status_customer` | `draft · submitted · needs_information · under_review · quote_issued · accepted · expired · closed` (`accepted` and `expired` are in the CHECK and **no code path writes either**; acceptance writes `closed`) |
| `project.status_internal` | `draft · submitted · triage_pending · estimator_assigned · technical_review_required · customer_clarification_required · issued` (+ the dead `approval_pending`, `approved_for_issue`) |
| `order.stage` | 12 values, §G.3 |

**Six coarse phases** over all of it: `Intake → Pricing → Issued → Accepted → Production →
Delivered`. Order stage wins whenever an order exists. That mapping is the phase ribbon and it
is unchanged.

`waitingOn` — `Customer` for `customer_clarification_required`, `issued`, `drawings_shared`,
`deposit_invoiced`, `balance_invoiced`, `balance_paid`; `Nobody` for `after_sales`; `Us` for
everything else. **The word is the value; colour never carries it.**

One divergence the console must not propagate: `ops.ts`'s label map calls
`estimator_assigned` **"Assigned"** while `lifecycle.ts` calls it **"Pricing"**. The ribbon
uses `lifecycle`'s. `statusInternalLabel` is not rendered anywhere.

## G.2 Every action, its gate, and its confirm sentence

**Pre-acceptance** (no order). The server omits inapplicable actions and returns blocked ones
*with* a reason.

| State | Action (tier) | Blocked when | Confirm |
|---|---|---|---|
| `submitted` / `triage_pending` | **Start pricing** (primary) | — | — |
| `estimator_assigned` | **Issue reviewed quote** (primary) | `{n} line(s) is/are unpriced or unresolved` | `Freezes this quote as a new revision and emails it to {email}.` |
| `estimator_assigned` | **Send to technical review** (secondary) | — | — |
| `technical_review_required` | **Issue reviewed quote** (primary) | same | same |
| `technical_review_required` | **Back to pricing** (secondary) | — | — |
| `customer_clarification_required` | **Resume pricing** (primary) | — | — |
| any state except `issued` | **Request clarification** (secondary) | — | `Emails {email} and pauses the quote until they reply.` |
| always | **Add a note** (secondary) | — | free text |
| `issued` | **only Add a note** | — | The job sits waiting on the customer with **no ops move at all**, and the flow list says so |

**Every gate that can block issuance** — all real, all server-enforced, all named on the Flow
list's GATE row:

1. the draft has zero lines · 2. any parent line has `line_total IS NULL` ("issuing would
silently coerce it to $0") · 3. any parent line is `technical_review` or `incomplete` ·
4. `status_internal` outside `ISSUABLE_FROM` · 5. `project.quote_edit_version` changed
mid-snapshot — the concurrency guard that **replaced the approval term**.

**Post-acceptance:** the order stage machine is the sole authority and the quote-side actions
disappear entirely. `availableActions(order)` returns pay-actions for the current stage plus
every transition whose `from` matches; the first is primary, the rest secondary, plus
`Add a note`.

## G.3 The Flow list — the lifecycle visualised

One vertical list of **real transitions**, in order, each either done (with actor and timestamp
from `activity[]` or from a stamped column) or pending. **GATE** rows are the only things that
can stop it, and each names who has to move. This is a *ledger*, not a node timeline — the
record plane's documented refusal of a vertical timeline of all 21 states stands, and this
list is narrow (a 768px pane, twelve rows, four real timestamps, two payment references and
the side of every step) precisely because it carries more than one integer.

```
QUOTE                                              side          when
  Submitted                                        customer      3 Mar 09:41
  Parsed — schedule parsed (8 items, 3 to review)  the system    3 Mar 09:43
  Pricing started                                  us            3 Mar 11:40
  Technical review                                 us            —
  Clarification requested                          us → customer —
  GATE · every line settled                        us            5 of 8  ⃠
       W03 needs review · D02 needs review · W04 unpriced
       This is what disables "Issue reviewed quote".
  GATE · nobody else edited it since you opened it us            ok
  Quote issued  R3                                 us            —
  GATE · the customer accepts, or asks for changes CUSTOMER      —
       accept  → order OF-nnnn raised, deposit + balance invoiced, whole batch atomic
       changes → revision superseded, project returns to pricing

ORDER                                              side          when
  Deposit invoice issued        50%  $6,098        the system    12 Jul
  Deposit received                                 we record     14 Jul  EFT-4821
  Shop drawings shared                             us            18 Jul
  GATE · Drawings approved                         CUSTOMER      22 Jul   ← sign-off
       we may record their approval by phone
  In manufacturing                                 us            — now
  Quality check — photos shared                    us            not recorded
  Final balance invoice issued                     us            not recorded
  Balance received                                 we record     not recorded
  GATE · Confirmed for dispatch                    CUSTOMER      not recorded  ← sign-off
  Dispatched                                       us            not recorded
  Delivered                                        us            not recorded
  Completed — after-sales support                  us            not recorded

There is no internal approval step. It was removed in favour of confirmation, versioned
concurrency and an audit trail; the two sign-offs above are the customer's, and ops can
record either by phone.
```

Rules:
- **Timestamps are shown only where the schema stamps one** — `drawings_signed_off_at`,
  `qa_confirmed_at`, `payment.invoiced_at`, `payment.paid_at`, `order.created_at`, revision
  `issuedAt` / `acceptedAt`. Every other row prints `not recorded` rather than inferring one
  from the audit log.
- **The side of every step is named**, because the asymmetry surprises people: ops's own
  `/advance` accepts **both** customer-side actions ("the internal console can also record
  customer-side confirmations by phone") while the customer-facing route refuses anything
  whose side is not `staff`.
- The stage labels are the customer-facing wording, reused verbatim: `Deposit invoice issued` ·
  `Deposit received` · `Shop drawings shared` · `Drawings approved` · `In manufacturing` ·
  `Quality check — photos shared` · `Final balance invoice issued` · `Balance received` ·
  `Confirmed for dispatch` · `Dispatched` · `Delivered` · `Completed — after-sales support`.
- **Nothing here is an invented approval chain**, and the closing paragraph exists so the next
  person does not rebuild one.

## G.4 Where "approval" lives now that formal approval rules were retired

Migration 0033 removed the approvals engine. `POST /submit-for-approval`, `/approve`,
`/reject` and `/delegate` are gone. `approval_rule`, `approval_instance` and `approval_step`
survive as **inert tables** — deliberately not dropped, because they carry attribution for
money-adjacent decisions and because `approval_step.rule_id REFERENCES approval_rule(id)`
means dropping the parent leaves a dangling FK that breaks `DELETE project` cascades.
`project.internal_owner_id` is retained and never read or written. `approval_pending` and
`approved_for_issue` were rewritten to `estimator_assigned` and are unreachable.

The stated reason still holds and is the reason this design does not rebuild it: *with anyone
able to approve — including the person who submitted — a mandatory gate would log "approved by
the author" and manufacture assurance nobody actually gave.*

So the console surfaces the five things that genuinely replaced it, each in one place:

| What replaced approval | Where it appears |
|---|---|
| **Confirmation, not permission** — a sentence naming the consequence before an irreversible act | `of-confirm-inline`, beneath the action bar, on every action carrying `confirm` |
| **Versioned optimistic concurrency** — `project.quote_edit_version` was added to "bind approvals and issuance to the exact mutable quote state they reviewed"; the approval half died and **the issuance half is load-bearing** | The GATE row `nobody else edited it since you opened it`, and the six 409 codes with their `[ Reload this record ]` |
| **The two customer sign-offs** — `confirm-drawings` and `confirm-qa`, the only approvals that exist in the product | GATE rows in the Flow list, marked `CUSTOMER` and `← sign-off`, with the note that ops may record either by phone |
| **Free text at the point of consequence** — the bank reference, the clarification message, the pricing note, the ±20% typed slug | Beside the act, not in a separate ledger |
| **Adjudication of AI learning** — `PATCH /recommendation-outcomes/:id {action:"approve"\|"reject"}` — a *different concept with the same name*, and the only `pending → approved | rejected` state machine left in the product | The record scope's **Teach** tab, and nowhere else. It is never called "approval" in the quote flow |

**What the audit narrative reads like.** The History block and Archive ▸ Events print the raw
server sentences as written, because they are written at the call site and inventing prettier
prose would desynchronise the console from the log. A real job reads:

```
submitted                                          customer   3 Mar 09:41
schedule parsed (8 items, 3 to review) via ai      system     3 Mar 09:43
estimator run — 7/8 openings selected              system     3 Mar 09:43
started pricing                                    maria      3 Mar 11:40
line.split                                         maria      3 Mar 11:58
line.unit.edit                                     maria      3 Mar 12:04
resolved technical review: fit, compatibility      maria      3 Mar 12:06
moved to Technical review                          maria      3 Mar 14:20
requested clarification                            gedi       4 Mar 09:02
issued revision 3                                  gedi       6 Mar 16:40
recorded deposit payment                           gedi      14 Jul 10:11
advanced: issue-drawings                           gedi      18 Jul 08:30
adjudicated recommendation outcome: CUSTOMER_PREFERENCE   gedi  20 Jul 11:15
```

Prose and dotted machine keys sit side by side and are **both printed as written**. Every row
carries `entity_id`, so every row is a link. The stored `after` payload — line ids, unit ids,
changed field names, compatibility text — expands under the row in Archive ▸ Events, where the
endpoint returns it, and states its absence where it does not.

---

# H. PROTOTYPE BUILD PLAN

## H.1 What is being built

**One file:** `ops-prototype.html`. No build step, no dependencies, no network, no backend.
Opening it from the filesystem must work.

**Styling is a later pass, possibly onto Fluid UI 2.** Therefore the CSS in this prototype is
**token-driven and structural**, not decorative:

- Every colour, size, font and duration is a CSS custom property from the block in §H.3. **No
  literal colour appears in a rule.** Restyling is then a matter of replacing `:root`.
- Every component is a single class `of-<component>` with its state in ARIA or `data-*`.
  Porting to a library is a rename of about thirty classes, not a rewrite.
- No component-specific magic numbers: geometry comes from `--ops-*` layout constants.
- No shadows except the two overlays (omnibox dropdown, mobile scrim); square corners
  (`--radius: 2px`); hairline borders; sage as the only accent.

## H.2 File structure

```
ops-prototype.html
├── <title>OpenFrame Ops — prototype</title>
├── <style>
│     1. :root token block            §H.3, ported verbatim from the style contract
│     2. base contract                *{border-color:var(--line)}, html/body, headings
│     3. type utilities               .t-ds1 … .t-data-sm, .font-display/body/data
│     4. layout primitives            .of-app-frame .of-rail .of-pane-group .of-pane
│     5. component classes            ~30 .of-* rules, state via [aria-*] and [data-*]
│     6. @media                       1440 / 1280 / 1120 / 900 / 768 ladders
│     7. @media (prefers-reduced-motion: reduce)
├── <body>
│     <div id="app"></div>
│     <div id="overlay"></div>       omnibox · shortcut sheet · the one modal
│     <div id="devbar"></div>        the ?state= menu, §H.6
├── <script>
│     A. DATA          the fixture object, §H.4 — one const, no fetches
│     B. store         { route, selection, expansion, drafts, errors, busy, flags }
│     C. router        hashchange → parse → render; back/forward work
│     D. render        pure functions per screen, per component; no framework
│     E. actions       mutate DATA in memory, then re-render — mirroring
│                      "await the server, refetch the workspace"
│     F. keyboard      the map in §E.2, guarded against text fields
│     G. boot          hydrate flag → auth flag → render
└── </script>
```

Rendering is plain string templates plus `innerHTML` on the changed region, with event
delegation on `#app`. No virtual DOM, no framework, no bundler. The store is ~200 lines; the
render functions are one per screen plus one per component.

**The fonts are network-served in the real app** (`@import` from Google Fonts) and there is no
network here, so the prototype uses the **widened fallback stacks** in §H.3 — Windows and macOS
then pick a geometric sans rather than Times, and `tabular-nums` (which every fallback
supports) keeps column alignment even though the letterforms do not survive.

## H.3 The token block

Ported verbatim from the style contract. Light only — the `.dark` block in the live stylesheet
is dead code and is not carried over.

```css
:root {
  /* surfaces */
  --paper:#FFFFFF; --bone:#FBFAF8; --recessive:#F5F3F0; --shade:#E8E5DF;
  --sage-wash:#F3F6F5; --sage-veil:#F7FAF8; --background:#FAFAF8;
  /* rules */
  --line:rgba(19,19,17,.18); --line-strong:rgba(19,19,17,.28);
  --rule-05:rgba(0,0,0,.05); --rule-08:rgba(0,0,0,.08); --rule-10:rgba(0,0,0,.10);
  --rule-12:rgba(0,0,0,.12); --rule-15:rgba(0,0,0,.15);
  --rule-white-10:rgba(255,255,255,.10); --rule-white-15:rgba(255,255,255,.15);
  /* brand */
  --sage:#5A7A6A; --sage-light:#8CA99B; --sage-deep:#3f5a4c;
  --sage-ink:#355344; --sage-hover:#4a6858;
  /* text ramp */
  --ink:#131311; --ink-soft:#3a3835; --body:#5c5a56; --body-soft:#6f6c67;
  --quiet:#8b8880; --quieter:#9a9894; --quietest:#b5b2ac; --ink-hover:#2a2a27;
  /* chrome */
  --ops:#14150f; --ops-panel:#1d1e17; --night:#0c0c0a;
  /* states — never used alone; the word always carries it too */
  --positive:#2c7a54; --warning:#8a6a2a; --warning-ink:#7a5410;
  --attention:#C0392B; --attention-ink:#96271B; --info:#4C6A88; --info-ink:#31485f;
  --destructive:#C0392B;
  /* tone panels (ops-local rgba that has no token in the real app) */
  --panel-sage-bg:rgba(90,122,106,.06);  --panel-sage-bg-2:rgba(90,122,106,.04);
  --panel-sage-bd:rgba(90,122,106,.30);
  --panel-warn-bg:rgba(180,120,40,.09);  --panel-warn-bd:rgba(180,120,40,.30);
  --panel-error-bg:rgba(180,60,40,.07);  --panel-error-bd:rgba(180,60,40,.28);
  --panel-error-tx:#8a3b2a;
  --chip-infected-bg:#b443361a; --chip-infected-bd:#b4433622; --chip-infected-tx:#8c2f24;
  --chip-pending-bg:#b886001a;  --chip-pending-bd:#b8860022;  --chip-pending-tx:#7a5c00;
  /* focus — ops has none today; adopt the site's sage ring */
  --ring-focus:var(--sage);
  /* geometry */
  --radius:.125rem; --spacing:.25rem;
  --ops-rail-w:48px; --ops-rail-expanded:200px; --ops-drawer-w:264px;
  --ops-pane-a:264px; --ops-pane-c:360px; --ops-header-h:132px; --ops-header-h-collapsed:104px;
  --ops-content-max:1440px;
  /* type — widened stacks because there is no network */
  --font-display:'Space Grotesk','Inter',ui-sans-serif,system-ui,-apple-system,
                 'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  --font-body:'Inter',ui-sans-serif,system-ui,-apple-system,
              'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  --font-data:var(--font-display);
  --t-hd2:22px; --t-hd2-lh:28px; --t-hd3:17px; --t-hd3-lh:24px;
  --t-bdlg:18px; --t-bdlg-lh:29px; --t-bd:16px; --t-bd-lh:26px;
  --t-bdsm:14px; --t-bdsm-lh:21px; --t-cap:13px; --t-cap-lh:18px;
  --t-lbl:11px; --t-lbl-lh:14px; --t-lbl-track:1px;
  --t-dat:14px; --t-dat-lh:20px; --t-datsm:12px; --t-datsm-lh:16px;
}
*,*::before,*::after { border-color: var(--line); }   /* load-bearing: CSS defaults to
                                                          currentColor, which would turn every
                                                          1px border into a dark rule */
:focus-visible { outline: 2px solid var(--ring-focus); outline-offset: 2px; }
```

`.card` derives its fill from its ground, exactly as the real stylesheet does:
`.ground-bone { background: var(--bone); --card-fill: var(--paper) }` and
`.card { border:1px solid var(--line); background: var(--card-fill, var(--bone)) }`.
The `.tab::after` selection square is written with `content: ""` — the live stylesheet's
`content: ;` is a parse error and that square has never rendered.

## H.4 The fake dataset

Realistic for an Australian window and door manufacturer, using the **real status vocabulary**
throughout. Every fixture carries at least one genuinely missing value, so the "not recorded"
rendering is proved rather than bypassed.

**Eight projects**

| Ref | Title | State | Why it exists |
|---|---|---|---|
| `OF-Q-10482` | Brighton Residence | `technical_review_required`, Pricing, waiting on **Us**, 6 days | **The canonical bench.** 8 openings: one composite of 3 units with `customerConfigurationChanged` + `thermalRecommendation`, one AI-managed line with a variant, one unpriced (`—`, never `$0`), one carrying `noLongerInDocuments`, one manual line with no proposal. 3 unresolved. 3 files (one `pending`). 2 notes, one line-scoped. 26 events. A building model with evidence for 6 of 8 openings |
| `OF-Q-10455` | Ashgrove Duplex | `submitted`, Intake, awaiting triage, 11 days | 9 lines, **anonymous submitter** (contact fallback), thermal targets from an energy report, one `Misses target (Uw +0.34)`. Only `Start pricing`, `Request clarification`, `Add a note` |
| `OF-Q-10402` | Northcote Renovation | `estimator_assigned`, Pricing, 19 days | An AI-managed line whose configuration list **fails to load** (`Try again` reachable) and one save that returns `exact_pricing_unavailable` with `missingOptions: ["colour:monument"]` |
| `OF-Q-10388` | Sandringham Extension | `issued`, waiting on **Customer** | Two revisions (`R2 issued`, `R1 superseded`). **Only `Add a note` is available** — proves the state where ops has no move |
| `OF-Q-10310` | Brighton Rd shopfront | `customer_clarification_required` | A clarification comment in the notes, `status_customer = needs_information` |
| `OF-1177` | Kew Terrace Stage 2 | order at `manufacturing`, Production | 14 contract lines (flattened, all `ready`), deposit paid with `EFT-4821`, balance due. `drawings_signed_off_at` stamped |
| `OF-1183` | Lloyd Residence | order at `deposit_invoiced`, Accepted, waiting on **Customer** | `Record deposit payment` and its confirm text reachable |
| `OF-1094` | Malvern Rear Addition | order at `after_sales`, Delivered, waiting on **Nobody** | One pending `adjusted` learning outcome so the **Teach** tab renders. **No `publicRef`** so the `id.slice(0,8)` fallback is visible, and **no building model** so the evidence rail's `none` state is visible |

**Everything else**

- **3 enquiries** — one `appointment_request` with handoff fields and `manufacturer_ack_at`
  set, one `question` with a long `message`, one `closed` with `commercial_outcome:
  order_placed`. One unassigned. One with a `projectId` (link proof), one with no phone.
- **6 customers** — one with no business name and no phone, one with an ABN, one with 0
  projects, one whose sign-in email is being edited (409 `email_in_use` reachable).
- **9 files** across all four `virus_status` values, sizes spanning B / KB / **MB** tiers,
  kinds `schedule` / `plan` / `energy_report` / `upload`, two with `doc_type_source: "user"`.
- **40 audit events** across all four entity types, mixing prose (`started pricing`,
  `issued revision 3`, `rescanned file → clean (…)`) and dotted keys (`line.split`,
  `line.unit.edit`), several with resolvable `entity_id` and **one deliberately dangling**.
- **27 products / rate cards** — one at `v1-provisional`, one with zero modifiers, two with no
  card (`prices at 'default'`), 18 options priced, 3 missing, 2 at `$0`, one `per_sqm` glass
  option blocked by the `area_rate_still_includes_glass` guard.
- **One reconcile run** plus a toggle to `null` it, so all four banner states are reachable.
- **One composite policy** (`tolerance 25 · joiner 0 · max 4`).
- **Six staff**, one with a null name, one `admin` (the signed-in user), one `manufacturer`.

**Money and units are realistic:** openings of 600×900 to 2400×3600 mm, line totals $410 to
$9,140, project totals $4,020 to $88,410, deposit 50%, GST-inclusive display, `en-AU`
formatting, `−$3.60` with the sign outside the symbol.

## H.5 What must actually work, and what may be inert

**Must work (the prototype is not a picture):**

| Interaction | Because |
|---|---|
| Hash routing, back/forward, refresh-safe deep links | It is the structural change the whole IA rests on |
| The nine Work views, filtering **and counting** the same array | Proves P4 |
| Row click → record; omnibox → record; customer/enquiry/audit → record | Five dead ends closed |
| Opening selection, `j`/`k`, `1`–`9`, `[`/`]`/`\` collapse with memory | The bench's core motion |
| The derivation rail: hop expand/collapse, sticky across selection, `?d=` in the URL | Proves the evidence design |
| The line editor: expand in place, validate (undersize, duplicate code, missing required option), price preview, Save, discard guard | Proves "space follows manipulation" |
| Split → units → coverage recompute; add unit; remove unit with confirm; merge with its warning | The composite is the hardest object on the screen |
| The action bar: correct actions per state, one primary, blocked-with-reason, `ConfirmInline` with and without free text | Proves P5 |
| `StateTrio` on every pane, reachable via the dev menu | Proves P6 |
| At least one action wired to fail with `line_changed_reload_required`, so **conflict recovery with `DiffMarker` and the kept draft** can be seen | The most complex client state in the design |
| Keyboard map: `⌘K`, `/`, `?`, `g`+letter, `e`, `u`, `n`, `T`, `i`, `r`, `Esc` | Keyboard-first is a commitment, not an aspiration |
| The inline missing-option flow: failed save → named slug → `Price this option ▸` → the Options view filtered to that slug | Proves the relocation argument |
| Rate-card editing: live worked example recomputation (including steps that did nothing), the ±20% tripwire arming, the confirm modal | The one permitted modal |
| Responsive: 1440 / 1120 / 900 / 768 all render | Three of the five breakpoints are new |
| The manufacturer role, via a dev toggle | One rail item, one screen, sign-out reachable |

**May be inert:**

- Sign-in (render both steps and all error states; do not simulate a real OTP).
- File **download** (a link that does nothing, styled correctly) — but `Scan to unlock` must
  change the row's state.
- Sanity Studio link, `mailto:`/`tel:` links.
- Actual PDF rendering — there is nothing to render and §F.1 says why.
- Email sending, obviously; the confirm sentence naming the recipient is what matters.

**Must not exist, by design:** any percentage confidence · any page thumbnail or region
highlight · any presence indicator · any approval step in the quote flow · any invented
placeholder standing in for an unset value · any bulk checkbox · any progress ring · any
colour-only state · a green reconcile banner that has never been earned.

## H.6 The dev menu (`?state=`)

A small strip, hidden behind `?dev=1`, listing every state the prototype must be able to reach
without editing code. Each is a link that sets the store and re-renders:

blocked primary with its reason · confirm-in-place with and without a text field · a 409 with
`[ Reload this record ]` and a kept draft · a failed load showing an error rather than an empty
list · `degraded: true` · an empty view · the "with the customer" nudge · the editor open at
1440 and the sheet open at 900 · a split with a coverage delta outside tolerance · a merge
warning · `Maximum 4 units` · a mixed-frame-system composite · each of the six thermal verdicts
· the `unwired` selection-log hop · a line with no building model (`none`) · a line with
`origin: manual` (no machine proposal) · the ±20% pricing tripwire armed · all four reconcile
banner states · an infected file · a dangling audit link · the manufacturer role · the phone
layout · the shortcut sheet.

## H.7 Build order

1. Token block + base contract + type utilities. Nothing else until a heading and a table
   look right in both fallback fonts.
2. `of-app-frame` + `of-rail` + router + `of-state-trio`. Every screen after this is content.
3. `of-row-list` with priority folding, then Work. One list component means the next six
   screens are configuration.
4. `of-record-page` + `of-record-header` + `of-phase-ribbon` + `of-action-bar` +
   `of-confirm-inline`. The bench's skeleton.
5. Pane A + pane B read mode + `of-elevation`. The screenshot the owner will judge.
6. Pane C: the ten hops, `of-absence`, `of-firmness`, `of-machine-now-edited`.
7. The editor, split/units, coverage — the write path and its guards.
8. Record scope: Flow, Revisions, Thermal, Teach, History, Files.
9. Products, Customers, Leads, Archive, Settings — all `RowList` + `RecordPage`.
10. Keyboard, dev menu, breakpoints, reduced motion.

---

# I. OPEN QUESTIONS FOR THE OWNER

Six, each with a recommended default already assumed by this spec, so no work is blocked on
an answer.

**1. The centre pane is the opening, not the source document. Is that accepted?**
Your wireframe puts "RETAINED SOURCE EVIDENCE" in the widest column. Four of the five things
it shows are unavailable — the sheet ref, the page number, the region and the verbatim row are
all NULL or synthesised, and the 94% is the fabricated number the codebase refuses to produce.
The evidence that *does* exist is text and reads well at 360px; the elevation, spec, units and
editor are what improve with width.
**Recommended default: as specified.** The slot is reserved (§F.1), the two changes that would
unlock it are named, and `of-source-viewer` has exactly one state until they land.

**2. Do we build `GET /api/ops/lines/:id/selection`?**
`candidate_result` holds every product × variant evaluated, with per-filter pass/fail, human
readable reasons, six score components, rank and selection. It is fully persisted, it is
exactly the "product selection log" you asked for, and **nothing reads it**. One read-only
endpoint, no new columns, no writes.
**Recommended default: yes, immediately after the prototype is signed off.** Until it exists,
hop 5 renders `The candidate evaluation is recorded but no endpoint reads it.` A permanent
"coming later" box is the dead `Placeholder` component all over again, so if the answer is no,
hop 5 collapses to a single line naming the versions and the panel is removed.

**3. Should a missing option price be fixable from inside the record, or only linked?**
When a save fails with `exact_pricing_unavailable` the server already names the option. Typing
one number where the failure happened is a relocation of `PUT /pricing/options/:slug`, not a
new capability — but it does put a price write on a screen that otherwise never writes prices.
**Recommended default: link (`Price this option ▸` → the Options view, pre-filtered).** The
component carries `mode: "link" | "inline"`; switching is one prop.

**4. `LINES READY 5 of 8` counts what the machine settled, not what a person checked. Is that
enough?**
A reviewer who has read every line still sees `8 of 8` the moment the machine priced them.
A true "reviewed by a human" flag is a new column, a new write and genuinely new
functionality.
**Recommended default: ship the machine-settled count.** If reviewers start asking "how do I
mark a line as reviewed", that is the signal to scope a real per-line reviewed flag properly
rather than fake it now.

**5. Is Fluid UI 2 confirmed as the styling target, and does it ship a data table with
column-priority folding?**
The whole vocabulary is built so the port is a rename, but two things bind us: whether its list
primitive can fold columns into meta lines (which is what gives Enquiries and Files their first
phone layout), and whether its modal system will tempt someone to break P7.
**Recommended default: assume a generic library.** Keep `of-*` classes with ARIA/`data-*`
state and the token block; if Fluid's table cannot fold, `of-row-list` stays ours and only its
skin is adopted.

**6. Scope of the prototype: how much beyond the review workspace?**
Everything in §C can be built, but the workspace, Work and one of the reference screens carry
90% of the judgement.
**Recommended default: build all eleven screens at reading fidelity, and make only the
workspace fully interactive** — plus the Work views, the omnibox, routing, the manufacturer
toggle and one phone breakpoint. Products' rate-card editor is the one other screen worth
making live, because its worked example is the console's best existing idea and it must
survive the port intact.
