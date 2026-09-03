# ops2 Attention — design

Stage 2 (architect). Spec: `docs/runs/ops2-attention/01-spec.md` (criteria 1–27).
Grill: `docs/runs/ops2-attention/00-ask.md` (G1–G8, binding). No new endpoint, no
migrations, no worker changes — the whole feature is frontend plus tests.

---

## 1. Shape of the change

One new frontend module (`src/ops2/attention/`), one new destination
(`enquiries`), one new query-consumption seam on the project queue
(`?wait=`), and the tests that pin all three. The existing
`GET /api/ops/summary` is consumed as-is; its `activeOrders` and `customers`
fields are simply never read (G5 — deleted from the surface, not from the
endpoint).

The summary endpoint's response contract (verified `worker/routes/ops.ts:311-347`):

- Success: `{ submissions, inReview, activeOrders, awaitingPayment, customers,
  readyToIssue, newEnquiries, tradeApplications }`, all numbers, **no
  `degraded` key**.
- Query failure: same keys all zero **plus `degraded: true`**.
- Not staff: 403 `{ error: "forbidden" }`.

## 2. Hand-off index (affected files)

New files:

| path | what |
|---|---|
| `src/ops2/attention/attention.ts` | Pure model: `SummaryCounts`, `parseSummary`, `attentionGroups`. Node-testable, no React. |
| `src/ops2/attention/useSummary.ts` | Fetch hook — a copy of `useProjectQueue`'s mechanics (see §4 for why copy, not extract). |
| `src/ops2/attention/AttentionPage.tsx` | The surface: OpsPage frame, grouped RowList, skeleton/empty/error treatments. |
| `src/ops2/styles/attention.css` | Group heading styles only (`.att-group`, `.att-group h2`). Everything else reuses `projects.css` classes. |
| `scripts/tests/ops2-attention.test.mjs` | New node suite (model + criterion 11). |
| `scripts/tests/web/ops2-attention.spec.ts` | New Playwright suite. |

Changed files:

| path | anchor | change |
|---|---|---|
| `src/ops2/nav/destinations.ts` | `DestinationId` union line 23; `SECTIONS`/`DESTINATIONS` from line 46 | Add `"enquiries"` to the union; add its `Destination` entry in the `workspace` section immediately after `customers` (path `/enquiries`, provisional blurb "Incoming enquiries that are not yet projects."). `TAB_DESTINATION_IDS` (line 104) and `HOME_PATH` (line 109) untouched. |
| `src/ops2/nav/icons.ts` | `DESTINATION_ICON` record | Import `chatbubblesOutline`, add `enquiries: chatbubblesOutline`. The `Record<DestinationId, string>` type makes the missing entry a compile error the moment the union grows (criterion 15). |
| `src/ops2/Ops2App.tsx` | route render, line 201 | Extend the ternary: `d.id === "projects" ? <ProjectsPage /> : d.id === "attention" ? <AttentionPage /> : <DestinationRoot id={d.id} />`. `NESTS_BELOW` (line 70) untouched — attention and enquiries have no child routes. Enquiries needs no route work at all: the destination loop already renders `DestinationRoot` for any id it doesn't special-case (criterion 13's placeholder comes free). |
| `src/ops2/projects/queue.ts` | new export beside `EMPTY_QUERY` (line 155) | `export function chipFromSearch(search: string): ChipKey \| null` — parses `?wait=` against `WAIT_CHIPS` keys; unknown/absent → `null`. Lives in queue.ts because the queue owns its own query vocabulary (one place per fact). |
| `src/ops2/projects/ProjectsPage.tsx` | query state, line 63 | Consume `?wait=` (see §5). |
| `scripts/tests/ops2-navigation.test.mjs` | first test's `deepEqual` destination list | Insert `["workspace", "Enquiries", "/enquiries"]` after Customers; tab-id assertion stays `["attention","projects","products"]` (criteria 16–17). |
| `scripts/tests/ops2-projects.test.mjs` | append | `chipFromSearch` cases (criteria 9–10 unit side). |
| `scripts/tests/api.test.mjs` | lines 70, 1439 | Extend the existing summary 403 assertions to also assert the body carries no counts (`body.submissions === undefined`) — criteria 23–24 as stated, not just status codes. |
| `scripts/tests/api-edge.test.mjs` | line 1505 loop / line 1883 | Same body assertion for the manufacturer (criterion 25) and assertion-less-session cases. |
| `scripts/db/seed.sql` | staff mailbox block, lines 17–51 | Add `u_staff7` (estimator, e.g. `liis@openframe.com.au`) and extend the suite-ownership comment: `u_staff7 → scripts/tests/web/ops2-attention.spec.ts`. |
| `package.json` | `test:ops2` script, line 55 | Append `scripts/tests/ops2-attention.test.mjs` to the file list. |
| `CONTEXT.md` | Ops console section, beside "Attention filter" (line 228) | New term **Attention (destination)** — done in this stage by the architect; see §8. |

Explicitly untouched: `worker/**` (no endpoint change), `migrations/`
(none), `src/ops/OpsApp.tsx` (legacy dashboard frozen), `TAB_DESTINATION_IDS`,
`NESTS_BELOW`, `EMPTY_QUERY`, `WAIT_CHIPS`, `REFINEMENTS`, `selectProjects`.

## 3. The model — `src/ops2/attention/attention.ts`

Pure functions, no React, bundled by the node suite exactly the way
`ops2-navigation.test.mjs` bundles `destinations.ts`.

```ts
import { WAIT_CHIPS, type ChipKey } from "../projects/queue";
import { destination, type DestinationId } from "../nav/destinations";

export type SummaryCounts = {
  submissions: number;
  inReview: number;
  readyToIssue: number;
  awaitingPayment: number;
  newEnquiries: number;
  tradeApplications: number;
};

/**
 * Strict on purpose (G4): a body that cannot be counted is DEGRADED, never
 * zero. `degraded: true` → "degraded". Any of the six keys missing or not a
 * finite number → "degraded" too — an under-claiming parse here is exactly
 * the reassuring lie the legacy dashboard told.
 */
export function parseSummary(body: unknown): SummaryCounts | "degraded";

export type AttentionRow = {
  key: keyof SummaryCounts;
  count: number;
  label: string;          // sentence-style, number leading ("4 new submissions")
  href: string;           // path from nav/destinations + optional ?wait=
};

export type AttentionGroup = {
  id: DestinationId;      // "projects" | "enquiries" | "customers"
  label: string;
  rows: AttentionRow[];
};

/**
 * Zero-suppressed at both levels (G2): a zero count emits no row; a group
 * whose rows are all suppressed is absent entirely. All six zero → [].
 * Group order fixed: Projects, Enquiries, Customers. Within Projects,
 * lifecycle order: submissions, inReview, readyToIssue, awaitingPayment.
 */
export function attentionGroups(counts: SummaryCounts): AttentionGroup[];
```

**The wait mapping** (criterion 12, G7 option (i)) — a technical
determination settled by `worker/lib/lifecycle.ts`, not a business choice:
`CUSTOMER_WAITS = {customer_clarification_required, issued, drawings_shared,
deposit_invoiced, balance_invoiced, balance_paid}`, and the summary's
`awaiting_payment` predicate is `stage IN ('deposit_invoiced',
'balance_invoiced')` — both members of that set, so every counted row answers
`waitingOn: "Customer"`. The other three counts' predicates (submitted,
under_review, estimator_assigned/technical_review_required) all fall outside
the set → `"Us"`.

| row | href |
|---|---|
| submissions, inReview, readyToIssue | `/projects?wait=us` |
| awaitingPayment | `/projects?wait=customer` |
| newEnquiries | `/enquiries` |
| tradeApplications | `/customers` |

The `wait` value is typed `ChipKey` in the model (compile-time half of
criterion 11) and the node suite asserts the emitted values against the
runtime `WAIT_CHIPS` (runtime half — a chip deleted from queue.ts turns the
test red, not the link dead). Paths come from `destination(id).path`, never
string literals, so criterion 7 (every row links to a registered route) holds
by construction and is asserted anyway.

Row labels are provisional and UX-owned within the spec's number-leading
rule: "4 new submissions" / "2 being priced" / "1 ready to issue" /
"3 awaiting payment" / "2 nobody has replied to" / "1 trade application
waiting on a decision", with naive singular/plural on the noun where it
matters. The model owns the wording so the node suite can pin the
number-leading shape.

## 4. The hook — `src/ops2/attention/useSummary.ts`

```ts
export type SummaryLoad =
  | { status: "loading" }
  | { status: "ready"; counts: SummaryCounts }
  | { status: "error"; headline: string; detail: string };

export function useSummary(): { load: SummaryLoad; reload: () => void };
```

A copy of `useProjectQueue`'s mechanics (`src/ops2/projects/useProjectQueue.ts`),
all three of which the spec names as required: one GET
(`/api/ops/summary`, `credentials: "same-origin"`), the stale-response guard
with `live` checked **before and after** `await res.json()`, and the
`ionViewWillEnter` refresh with the first-fire skip (`entered` ref). Plus one
mapping the queue doesn't have: `parseSummary(...) === "degraded"` lands in
the same `error` state as a non-2xx or a network failure — criteria 18 and 19
say the reader must not be able to tell those apart. 401/403 gets the
staff-role copy pattern ("This account cannot see what is waiting." — the
identity is fine, the role is missing), which is also what criterion 26's
direct-URL case renders.

**Copy, not extract** — decided. Extracting a shared
`useOpsFetch(url, parse, copy)` for two call sites would need three
parameters, a generic, and per-status copy injection to cover the divergence
(the queue has no degraded axis; attention has no rows), i.e. more code than
the ~45 lines it deduplicates, and it couples two surfaces' error voices
through a config object. The heavy rationale comments stay in
`useProjectQueue.ts` and `useSummary.ts` carries a one-line pointer to them
rather than a second copy. Revisit extraction at the third consumer.

## 5. The page — `src/ops2/attention/AttentionPage.tsx`

`OpsPage` frame (`destination={destination("attention")}`, default title —
the `<h1>` the focus manager lands on, criterion 2). Body by load status:

- `loading` → `.pq-skeleton` (shared class, `aria-busy`) with row-height
  `IonSkeletonText` bars grouped under heading-height bars — the shape that
  arrives (criterion 21). ProjectsPage's private `QueueSkeleton` is
  queue-shaped (table/card widths) and stays private; the class is the shared
  thing, per the grill's reading of "treatments three surfaces share".
- `error` → the `.pq-error ds-surface-card` treatment (`role="alert"`,
  `warningOutline`, headline, detail, "Try again" → `reload`), testid
  `attention-error`. Rendered **instead of** any rows — no counts at all
  (criteria 18–20). Same ~12 lines of JSX as ProjectsPage's private
  `ErrorPanel` (lines 306–315); copied, because the shared unit is the CSS,
  and exporting one page's private panel to another couples them for less
  code than it saves.
- `ready` with `attentionGroups(counts).length === 0` → `.pq-empty` panel
  ("Nothing is waiting.") — criterion 5.
- `ready` otherwise → per group: a `section.att-group` with an `<h2>` and a
  `RowList` (`testId={\`attention-\${group.id}\`}`) of `Row`s. Each `Row` gets
  `edge={null}` (the leading edge means nothing here today; G1c's
  critically-wrong kind will claim it later), `pressTestId`, and
  `onActivate={() => history.push(row.href)}` — a row leads, never acts
  (criteria 3, 6, G3). No other control renders anywhere on the surface.

`activeOrders` and `customers` are never read from the response (criterion 8).

## 6. `?wait=` consumption — `src/ops2/projects/ProjectsPage.tsx`

The queue's initial state stays `EMPTY_QUERY` (chip `"us"`) — criterion 9's
"default untouched". The URL is treated as a one-shot instruction, not a
second state store:

- New effect keyed on `location.search`: `const chip =
  chipFromSearch(location.search)`; if non-null,
  `setQuery({ ...EMPTY_QUERY, chip })` and then
  `history.replace(destination("projects").path)` to strip the param.
- After that, the screen is byte-for-byte the one the reader would have by
  tapping the chip themselves (criterion 10): the chip is lit via the
  existing `chipStates`, and "clearing" is the existing All chip — nothing
  new to build. Stripping the param keeps the URL honest when they then
  change chips, and makes back-navigation land on the plain queue rather
  than re-applying a stale instruction.
- Unknown or absent `wait` values → `null` → no effect, queue default
  (criterion 9's safe side; criterion 11 guards the emitting side).
- The effect (not initial-state-only) matters because `IonRouterOutlet`
  keeps ProjectsPage mounted: the second visit from an Attention row arrives
  as a `location.search` change on a live page, not a mount.

## 7. Security

- **Data classification:** operational counts (project pipeline volumes,
  enquiry backlog, trade-application backlog) — commercial, staff-only. No
  new data stored, logged, or moved; no financial or personal PII on this
  surface; Attention deals in counts only (criterion 27 — nothing in this
  design adds any logging, client or worker).
- **Trust boundaries:** ops console ↔ Worker, unchanged. No new endpoint, no
  changed endpoint. The one crossing is the existing
  `GET /api/ops/summary`.
- **Authorization per endpoint:** `GET /api/ops/summary` — staff only, gated
  by `resolveStaff` (`worker/routes/ops.ts:312-313`, 403 `{error:
  "forbidden"}` with no counts). The counts are global aggregates over staff-
  visible tables, so there is no account-scoping WHERE clause to add — the
  scoping *is* the staff gate. This design changes none of it.
- **Abuse cases:** cross-role reads → criteria 23 (Customer 403), 24 (Visitor
  401/403), 25 (Manufacturer 403) — all already asserted in
  `api.test.mjs`/`api-edge.test.mjs`; this feature extends those assertions
  to pin "carries no counts", not just the status. Direct-URL access by a
  non-staff session → criterion 26: the hook's 401/403 branch renders the
  unauthorised error treatment and never zeros or cached values (a degraded
  or forbidden response can never reach `attentionGroups`, because
  `parseSummary` refuses it and the 403 branch short-circuits first).
  Parameter tampering on the emitting side: `?wait=` values are
  closed over `WAIT_CHIPS` at both compile time and in the node suite
  (criterion 11); on the consuming side `chipFromSearch` rejects anything
  outside the set. Residual risk: none new — the guest-OTP brute-force issue
  is tracked separately and untouched by this feature.
- **Migrations:** none. No D1 change, no cascade surface.

## 8. Domain vocabulary (CONTEXT.md — updated in this stage)

New term in the Ops console section, beside the existing **Attention
filter** (which keeps its name — the record pill and the destination are
different things and both real):

> **Attention (destination):** the console's gate and landing surface
> (`HOME_PATH`): one group per destination that has work waiting, counts
> inside, every count a link, no action that changes data, zero drawn as
> absence, and a degraded count drawn as failure — never as zero.

## 9. Sequencing

1. **T1 — Enquiries destination** (independent): union + entry + icon +
   navigation-test update. Everything else that emits `/enquiries` depends
   on this compiling.
2. **T2 — Attention model + node suite** (independent): `attention.ts`,
   `ops2-attention.test.mjs`, `package.json` wiring. Red first, per Probity.
3. **T3 — Hook, page, route** (after T1, T2): `useSummary.ts`,
   `AttentionPage.tsx`, `attention.css`, `Ops2App.tsx` branch.
4. **T4 — Queue `?wait=`** (independent): `chipFromSearch` in `queue.ts`,
   the ProjectsPage effect, `ops2-projects.test.mjs` cases.
5. **T5 — Browser suite + seed** (after T3, T4): `ops2-attention.spec.ts`,
   `u_staff7` seed row.
6. **T6 — Abuse-body assertions** (independent): extend the existing
   summary-403 assertions in `api.test.mjs` / `api-edge.test.mjs`.

## 10. Test plan

- `scripts/tests/ops2-attention.test.mjs` (NEW, in `test:ops2` and thereby
  `npm test`): esbuild-bundles `attention.ts` with `queue.ts` and
  `destinations.ts` (same stdin pattern as `ops2-navigation.test.mjs`).
  Asserts: full non-zero summary → three groups in order, Projects' four
  rows in lifecycle order, every count equal to the input (criterion 1
  model-side); one zero → that row absent (3); one group all-zero → group
  absent, others' order stable (4); all zero → `[]` (5 model-side);
  `parseSummary` → `"degraded"` for `degraded: true`, for a missing key, and
  for a non-numeric count (18 model-side); every emitted href's pathname is a
  registered `DESTINATIONS` path (7); every emitted query string is exactly
  `wait=<k>` with `k` a `WAIT_CHIPS` key and no `REFINEMENTS`-named
  parameters (11, 12); the three us-rows and the one customer-row map as
  §3's table says (12); every label starts with its number (row-copy rule).
- `scripts/tests/ops2-navigation.test.mjs` (UPDATE): destination list now
  includes `["workspace","Enquiries","/enquiries"]`; tab set unchanged
  (15–17).
- `scripts/tests/ops2-projects.test.mjs` (UPDATE): `chipFromSearch` —
  `"?wait=us"`→`us`, `"?wait=customer"`→`customer`, `"?wait=all"`→`all`,
  `"?wait=bogus"`→`null`, `""`→`null` (9–10 unit side).
- `scripts/tests/web/ops2-attention.spec.ts` (NEW, picked up by the
  `scripts/tests/web` testDir glob): signs in as `u_staff7`. Walks: rows
  render with the endpoint's numbers and no mutating control (1, 6); press
  the submissions row → `/projects` with the Needs-us chip lit, queue
  visible, All chip clears it (9, 10); enquiries row → `/enquiries`
  placeholder root (13); trade row → `/customers` (14); `page.route`
  intercepts of `/api/ops/summary` for `degraded: true` and for a 500 → the
  `.pq-error` panel with retry and zero rendered counts, and un-intercepted
  retry recovers (18–20); skeleton visible pre-response (21); navigate away
  and back re-fetches, counted via intercepted request count, and a slow
  stale first response never overwrites the fresh one (22); a customer
  session loading `/attention` by URL gets the unauthorised error treatment,
  no zeros (26).
- `scripts/tests/api.test.mjs` / `api-edge.test.mjs` (UPDATE): the existing
  summary 403 assertions additionally assert the body has no `submissions`
  key (23–25).
- Criterion 27 is the tester's log inspection; nothing in this design writes
  logs to inspect.

## 11. Rejected alternatives

- **G7 option (ii)** — re-deriving counts through `selectProjects` — closed
  by the spec itself (cannot serve enquiries/trade counts).
- **Extracting a shared fetch hook** from `useProjectQueue` — §4: costs more
  than it saves at two call sites with divergent error semantics; revisit at
  the third.
- **Exporting ProjectsPage's private `ErrorPanel`/`EmptyPanel`/`QueueSkeleton`**
  — the shared artefact is the CSS class set in `projects.css`; exporting one
  page's private components to another couples the surfaces for ~20 lines.
- **Two-way URL↔chip sync on the queue** — the spec forbids adding queue
  controls, and a URL that mirrors chip state is a second state store with
  its own drift bugs. One-shot instruction + `history.replace` gives
  criterion 10 exactly.
- **Per-row bespoke filters** (e.g. `readyToIssue` → a refinement) — the spec
  ASSUMES one rule for the whole group (wait axis alone) and criterion 12
  demands it for the mismatched row; a per-row exception is what G7 exists
  to prevent.
- **A migration or endpoint change** — out of scope by spec; the six counts
  already exist.
