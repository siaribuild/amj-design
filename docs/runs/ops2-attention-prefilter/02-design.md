# Design — ops2 attention prefilter

Spec: `docs/runs/ops2-attention-prefilter/01-spec.md`. Criteria numbers below are that file's.

## 0. The P2 finding (blocking, in DECISIONS.md)

P2 states the four counts derive from `GET /api/ops/projects` rows with **no worker change**,
predicating on `statusCustomer` and `orderStage`. Those two fields are **not in the row DTO**:
`worker/routes/ops.ts` selects `p.status_customer` and `ord.stage AS order_stage` (line 385–388)
but the mapped object (lines 421–447) only spreads `lifecycleOf()` — phase, phaseIndex,
stateLabel, waitingOn. The record endpoint (`GET /api/ops/projects/:id`, line 588) already serves
`statusCustomer` to the same staff; the list does not.

Client-side proxies exist and are all the defect this run exists to remove:
`phase === "Intake"` answers a *different* question than `statusCustomer === 'submitted'`
(it rides `status_internal` through `INTERNAL_PHASE`), and matching `stateLabel` against
`"Deposit invoiced"` is a filter keyed on display copy. Rejected.

**Required: a two-field additive change to the row DTO** — `statusCustomer: r.status_customer`
and `orderStage: r.order_stage ?? null`. Same staff gate, same query, data already selected,
already served per-record to the same audience. This amends criterion 17 to "no worker change
beyond the two additive row-DTO fields". Owner decision D1 in `DECISIONS.md`; every task below
except t1 is buildable regardless (the parser's defaults under-claim), but the feature does not
meet criteria 1/2/4 end-to-end without it.

## 1. Shape of the change

One selector, one query vocabulary, two surfaces:

- `src/ops2/projects/queue.ts` grows a fourth query axis — the **attention prefilter** —
  alongside chip/refinements/search. `selectProjects` stays THE selector (P1).
- The Attention gate's four project rows compute their counts as
  `selectProjects(rows, attentionQuery(key)).length` over the same `GET /api/ops/projects`
  parse the queue uses, and link to `/ops2/projects?attn=<key>`. Pressing the row makes
  ProjectsPage apply `attentionQuery(key)` — the identical query object — so the number and
  the list cannot be produced by two paths.
- `?wait=` is **retired**. Its only producer was the Attention page; `?attn=` replaces it
  (one URL grammar, not two). A stale `?wait=us` bookmark now carries no instruction and lands
  on the default `Needs us` — which is what it pointed at anyway.
- The prefilter is **not** added to the funnel's refinements. It is set only by an Attention
  row's link, shown in the queue's existing active-filters strip (`pq-active`), and cleared
  there. Owner ruling 2026-09-01 (default NO on extra ops controls) settles the spec's ASSUMED
  "extend the chip/refinement controls" reading — see Rejected alternatives §8.1 for why pure
  refinements cannot satisfy criteria 4 and 10 simultaneously.

## 2. Affected files — hand-off index

| File | Where | Change |
|---|---|---|
| `worker/routes/ops.ts` | `GET /projects` DTO map, lines 421–447 (between `orderNo` and `issuable`) | add `statusCustomer: r.status_customer, orderStage: r.order_stage ?? null` (D1) |
| `scripts/tests/api.test.mjs` | append new tests; reuse the existing `ops` / `partner` session helpers (partner-403 precedent at ~line 1200) | list-DTO fields present; criteria 19–21 against `/api/ops/projects` and `/api/ops/summary` |
| `src/ops2/projects/queue.ts` | `ProjectQueueRow` (line 42), `QueueQuery` (81), `EMPTY_QUERY` (155), `chipFromSearch` (165 — deleted in t4), `emptyStateFor` (321), `parseProjectQueue` (426), `selectProjects` (570) | new fields, attention axis, `ATTENTION_FILTERS` / `attentionQuery` / `attentionFromSearch` |
| `scripts/tests/ops2-projects.test.mjs` | `?wait=` test at line 416 replaced; new attention-axis tests | model proof of criteria 1–5, 7–8, 12, 22 |
| `src/ops2/attention/attention.ts` | `SummaryCounts`/`parseSummary` (10–45), `projectsHref` (63), `GROUP_SPECS` (75), `attentionGroups` (109) | counts from rows; `combineLoads`; `?attn=` hrefs |
| `src/ops2/attention/AttentionPage.tsx` | data wiring (line 25) and the `ready` branch (59) | consume `useSummary` + `useProjectQueue` through `combineLoads` |
| `scripts/tests/ops2-attention.test.mjs` | full rewrite (it asserts the old `?wait=` grammar and 6-key counts throughout) | model proof of criteria 1–8, 13–14 |
| `src/ops2/projects/ProjectsPage.tsx` | imports (line 14), `?wait=` effect (79–85), active-filters strip (350–361) | `?attn=` consumption, re-enter reset, strip shows/clears the prefilter |
| `scripts/tests/web/ops2-projects.spec.ts` | sibling `?wait=` test (line 128) rewritten to `?attn=`; new tests beside the existing `QUEUE_URL` stubs (516) | criteria 9–12, 16, 18, 22 |
| `scripts/tests/web/ops2-attention.spec.ts` | rewrite: every test gains a `/api/ops/projects` stub; `?wait=` assertions (98–151) replaced | criteria 1–6, 13–16 |
| `CONTEXT.md` | "Attention (destination)" (~line 233) | sharpen; add **Attention prefilter** term |
| `docs/adr/0018-queue-attention-prefilter-own-axis.md` | new | records §8.1's decision |

Untouched on purpose: `FilterSheet.tsx`, `rows.tsx`, `useProjectQueue.ts`, `useSummary.ts`
(fetch mechanics unchanged; only what consumes their results changes), `worker/lib/*`,
`/api/ops/summary` (still serves Enquiries/Trade; its project counts go unread — lean-out later,
spec §4), `scripts/db/seed.sql` (see §5 — both browser suites stub the endpoints per their own
documented convention, so no new staff mailbox and no fixture projects are needed).

## 3. Interfaces

### 3.1 `queue.ts` additions

```ts
export type AttentionKey = "submissions" | "inReview" | "readyToIssue" | "awaitingPayment";

/** The four Attention-gate predicates. P2's, verbatim — never a phase or label proxy. */
export const ATTENTION_FILTERS: readonly {
  key: AttentionKey; label: string; test: (row: ProjectQueueRow) => boolean;
}[] = [
  { key: "submissions",     label: "New submissions",  test: (r) => r.statusCustomer === "submitted" },
  { key: "inReview",        label: "Being priced",     test: (r) => r.statusCustomer === "under_review" },
  { key: "readyToIssue",    label: "Ready to issue",   test: (r) => r.issuable },          // P3: the gate's verdict
  { key: "awaitingPayment", label: "Awaiting payment",
    test: (r) => r.orderStage === "deposit_invoiced" || r.orderStage === "balance_invoiced" },
];

/** The exact state an Attention row's press produces. chip:"all" so the predicate
 *  alone defines the set (awaitingPayment rows are waitingOn Customer; an "us"
 *  intersection would empty it). */
export function attentionQuery(key: AttentionKey): QueueQuery; // { chip:"all", refinements:[], search:"", attention:key }

/** `?attn=` validated against the closed key set. Anything else — unknown, injected,
 *  oversized — is null: no instruction, never an error, never echoed. Replaces chipFromSearch. */
export function attentionFromSearch(search: string): AttentionKey | null;
```

`ProjectQueueRow` gains `statusCustomer: string` and `orderStage: string | null`.
`parseProjectQueue` defaults: missing `statusCustomer` → `""` (matches no predicate),
missing `orderStage` → `null` — absence under-claims, same rule as `issuable`.

`QueueQuery` gains `attention: AttentionKey | null`; `EMPTY_QUERY.attention = null` (P5: the
default is untouched). `selectProjects` adds one filter pass:
`.filter((r) => query.attention === null || ATTENTION_FILTERS.find(f => f.key === query.attention)!.test(r))`.

`emptyStateFor`: a branch for `query.attention` (after the no-rows branch, before search),
returning the filter's label in the headline and `clear: { label: "Back to Needs us", query: EMPTY_QUERY }`
— reachable only when state moved between the gate render and the press (spec §3), so the detail
says the set emptied since it was counted. The search branch's `narrowed` test and its
`elsewhere` widened query include the attention axis (`attention: null` in the widened query).

### 3.2 `attention.ts` rework

```ts
/** Only what Attention still reads from /api/ops/summary (P4). Strict as before:
 *  either key missing/non-finite, or degraded:true → "degraded". */
export type SummaryCounts = { newEnquiries: number; tradeApplications: number };
export function parseSummary(body: unknown): SummaryCounts | "degraded";

/** Ready only when BOTH sources answered; any failure is the whole page's failure
 *  (criterion 15: a count that cannot be derived is drawn as failure, never zero).
 *  Precedence: unauthorised > error > loading > ready. */
export function combineLoads(summary: SummaryLoad, queue: QueueLoad): AttentionLoad;

/** Projects rows: count = selectProjects(rows, attentionQuery(key)).length,
 *  href = `${destination("projects").path}?attn=${key}`, zero-suppressed exactly as today
 *  (criterion 14). Enquiries/Customers rows unchanged from summary counts (P4/13). */
export function attentionGroups(counts: SummaryCounts, rows: readonly ProjectQueueRow[]): AttentionGroup[];
```

`AttentionRow.key` keeps today's literals (`submissions`, `inReview`, `readyToIssue`,
`awaitingPayment`, `newEnquiries`, `tradeApplications`) so every `attention-row-*` testid
survives. The four project keys ARE `AttentionKey` — one vocabulary, and the href's `?attn=`
value is the row's own key.

`AttentionPage.tsx` calls `useSummary()` and `useProjectQueue()` (import from
`../projects/useProjectQueue` — same skin, no new hook), feeds both to `combineLoads`, and the
`ready` branch becomes `attentionGroups(data.counts, data.rows)`. Error/unauthorised/skeleton
JSX unchanged. `reload` retries both.

### 3.3 `ProjectsPage.tsx` — consuming `?attn=` (criteria 9–12)

Replaces the `?wait=` effect. The behaviour contract, which the tests pin:

1. **Arrival with a valid `?attn=<key>`** (pushed from an Attention row, or a direct/new-tab
   load of the copied href): apply `attentionQuery(key)`, then `history.replace(PROJECTS.path)`
   — one-shot, address stripped, same as `?wait=` today. Keep the `location.pathname` guard
   (the sibling-route trap documented at lines 74–78).
2. **Arrival with an unrecognised `attn` value** (criteria 12, 22): `setQuery(EMPTY_QUERY)`,
   strip the param. Default set, no error, and the raw value reaches no DOM sink — it is
   validated into `null` and discarded, never rendered.
3. **Re-entering the view without an `attn` instruction while the prefilter is on**
   (criterion 11 — rail navigation, back from a record): reset to `EMPTY_QUERY`. Mechanism:
   `useIonViewWillEnter` reads the current location (via a ref updated each render); if the
   search carries no `attn` param and `query.attention` is set, reset. The
   arrival-that-carried-the-param is safe because at its enter moment the search still holds
   the param (the strip happens in the effect, after).
4. **Active control** (criteria 9–10): the `pq-active` strip renders when
   `query.attention !== null || activeRefinements.length > 0`; the prefilter's label leads the
   list. Its Clear applies `EMPTY_QUERY` when the prefilter is on (back to `Needs us`,
   refinements and search included — criterion 10), else today's refinements-only clear.
   The funnel bubble keeps counting refinements only.

Chips remain live while the prefilter is on (`chip: "all"` reads as active); their counts are
honest "what would I be left with" within the filtered set, via the untouched
`chipStates`/`controlFor` path. Pressing a chip applies `chip.query`, which carries
`attention` through the spread — deliberate: the reader narrows within the set the strip still
names, and the strip's Clear remains the one exit (P6).

## 4. Sequencing

```
D1 answered → t1 (worker DTO + api tests)
t2 (queue.ts model)                        — parallel-safe with t1, listed after for contract order
t3 (attention.ts + AttentionPage + node test)   after t2
t4 (ProjectsPage + projects web spec)           after t2
t5 (attention web spec rewrite)                 after t3, t4
t6 (CONTEXT.md + ADR 0018)                      after t5
```

TDD note for t1 (Probity): the failing test is api.test.mjs asserting `statusCustomer` /
`orderStage` on list rows — red against the current DTO, green after the two-line addition.

## 5. Test plan

No `seed.sql` change. Both browser suites stub `/api/ops/summary` and `/api/ops/projects` —
the convention each file already documents (ops2-projects.spec.ts lines 503–516 states why
interception beats seeding here), and it is what makes the spec's seed precondition
constructible: the four predicate sets must be non-empty AND non-identical, which live seed
data cannot hold stable across suites. The existing staff rows (`u_staff7` for the attention
suite, `u_staff2` for the projects suite) keep their files; no new suite, no `u_staff8`.

**Shared fixture** (both web specs and both node suites, shaped per the seed precondition):

| row | statusCustomer | issuable | orderStage | matches |
|---|---|---|---|---|
| PA | submitted | false | null | submissions only |
| PB | under_review | false | null | inReview only |
| PC | under_review | true | null | inReview + readyToIssue (overlap, spec §3) |
| PD | accepted | false | deposit_invoiced | awaitingPayment |
| PE | accepted | false | balance_invoiced | awaitingPayment |
| PF | accepted | false | manufacturing | none — proves narrowing (criterion 5) |

Counts 1 / 2 / 1 / 2 — non-empty, pairwise non-identical sets.

| Criterion | Test |
|---|---|
| 1–4 count = list | node `ops2-attention.test.mjs`: row counts equal `selectProjects(rows, attentionQuery(key)).length` per key over the fixture; web `ops2-attention.spec.ts`: press each row, assert the queue lists exactly that key's fixture refs (row text, not chip state — criterion 16's bar) |
| 5 narrowing | node: each filtered set omits ≥1 project another predicate matches; web: after pressing "new submissions", PB/PC/PD absent |
| 6 state move | node: flip PA to under_review, counts shift 1↔1 and lists swap membership; web: change the projects stub between visits, leave/return, both rows and counts move |
| 7–8 gate verdict | node: readyToIssue count/list is exactly `rows.filter(r => r.issuable)` — a non-issuable row is excluded whatever else it claims; an issuable one included. (The weak summary SQL is simply unread: `parseSummary` no longer accepts project counts — asserted by the strict-parse test) |
| 9 active control | web `ops2-projects.spec.ts`: goto `/ops2/projects?attn=submissions` → `queue-active-filters` visible and contains "New submissions" |
| 10 turn off | web: press the strip's Clear → `Needs us` chip `aria-pressed=true`, fixture set matches `Needs us`, URL is bare `/ops2/projects` |
| 11 other routes | web: rail navigation and back-from-a-record both land on `Needs us` with no strip; bare goto shows default |
| 12 unknown value | node: `attentionFromSearch("?attn=bogus") === null`; web: goto with `?attn=bogus` → default set, no error panel, no strip |
| 13 P4 rows | web attention spec: enquiries → `/ops2/enquiries`, trade → `/ops2/customers` (existing tests, kept) |
| 14 zero absent | node: a fixture with no submitted rows emits no submissions row; web: stub without PA → `attention-row-submissions` count 0 in DOM |
| 15 projects failure | web attention spec: summary ok + projects 500 → `attention-error` visible, zero `attention-row-*`, retry present; degraded-summary and 500-summary tests kept |
| 16 real assertion | the web tests for 1–4 assert listed project refs after the press — disabling the `?attn=` effect or the selector pass fails them |
| 17 no worker change | conformance review over the diff: `worker/` untouched except the D1-approved two lines in `worker/routes/ops.ts` |
| 18 signed-out | web projects spec: fresh context, goto `/ops2/projects?attn=readyToIssue` → sign-in surface, zero project rows in DOM |
| 19–21 non-staff API | `api.test.mjs`: customer session, manufacturer-partner session and anonymous fetch against `GET /api/ops/projects` (with and without `?attn=`) and `GET /api/ops/summary` → 401/403, body carries no `projects` array / no counts |
| 22 injection | node: SQL fragment, `<script>` payload, 10 kB string into `attentionFromSearch` → null; web: goto with the payload → default set, payload text absent from the document |

Suites run via existing scripts: `npm run test:ops2` (both node files already listed),
`npm run test:api`, `npm run test:web`. No package.json change.

## 6. Security

- **Data classification.** No new data stored. Moved: `statusCustomer` and `orderStage` join
  the staff-only list DTO — commercial workflow state, class *commercial*, already served
  per-record to the identical audience by `GET /api/ops/projects/:id`. No PII, no money fields
  added; GST/money display untouched (spec §3). Neither field is logged.
- **Trust boundaries.** One crossing: ops browser ↔ Worker. The `?attn=` parameter never
  crosses it — it is consumed client-side over rows already fetched; no fetch, no SQL, no
  header carries it. At the crossing that exists, `resolveStaff` validates as today.
- **Authorization per endpoint.** No new routes. `GET /api/ops/projects`: gate unchanged —
  `resolveStaff(c.env, c.req.raw)` or 403 (worker/routes/ops.ts:383); scoping unchanged — the
  staff console is deliberately account-unscoped (staff see all projects); the query's WHERE
  (`p.status_customer <> 'draft'`) already excludes drafts, so the added `statusCustomer` field
  never exposes the draft state. `GET /api/ops/summary`: untouched, `resolveStaff` or 403
  (line 313). Manufacturer partners fail `resolveStaff` (role `manufacturer` excluded) — held
  by criterion 20's test.
- **Abuse cases.** Cross-account/role access → criteria 18–21, executed as real tests (§5).
  Parameter tampering/injection → criterion 22: closed-set validation, no echo, no sink.
  Enumeration/replay: no new server surface; the parameter names one of four public-vocabulary
  filter keys, and an invalid value is indistinguishable from no value. Residual risk: none new
  identified — the feature's write surface is zero.

## 7. Copy (suggested, polish may refine wording — not structure)

- Active strip label: the filter's own label ("New submissions", "Being priced", "Ready to
  issue", "Awaiting payment"); Clear button keeps the word "Clear".
- Attention-filter empty state: headline `Nothing here is “<label>” any more.`, detail
  `This set moved on after Attention counted it.`, action `Back to Needs us`.

## 8. Rejected alternatives

1. **The four filters as funnel refinements** (the spec's ASSUMED reading). Fails criterion 4
   or 10 structurally: a refinement rides the current chip, so "awaiting payment" (rows
   waitingOn Customer) under the default `us` chip is an empty intersection; fixing that by
   having the link also set the chip means unticking the refinement strands the reader on
   `All`/`Customer`, not the `Needs us` default criterion 10 names. Special-casing the
   untoggle to restore `EMPTY_QUERY` would hijack the pre-existing `ready` refinement's
   semantics for manual users. Also adds three permanently-visible ops controls nobody asked
   to toggle manually — against the owner's 2026-09-01 default-NO ruling. ADR 0018.
2. **URL carries `?attn=` while active** (address-as-state). Self-consistent and one less
   mechanism, but back-from-a-record returns to the filtered address, failing criterion 11's
   explicit third route. One-shot consumption + re-enter reset matches both 10 and 11 as
   written, and matches the established `?wait=` behaviour.
3. **Client-side predicate proxies** (phase / stateLabel matching) to keep criterion 17
   absolute. Answers a different question than P2's predicates and re-creates the
   count-promises-what-the-gate-refuses defect keyed on display copy. §0.
4. **Partial-failure rendering on the Attention page** (projects fails, enquiries still
   drawn). More states than criterion 15 requires; the page's existing single failure panel
   already says "not an empty console" and retries both. Deferred until someone asks.
5. **New browser suite + `u_staff8` + seed projects.** Both existing suites already own the
   surfaces under test and document stub-over-seed as their convention; live seed rows cannot
   hold the non-identical-sets precondition stable. Extending them is smaller and keeps the
   one-staff-per-suite ledger unchanged.
