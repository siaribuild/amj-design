# Design — ops2 Attention filters in the Projects filter panel

Spec: `01-spec.md` (criteria 1–21). Grill: `00-ask.md` (P1–P6, settled).
ADR: `docs/adr/0020-attention-filters-are-ordinary-refinements.md` (written with
this design; supersedes 0018/0019 — both status lines updated). `CONTEXT.md`
§Attention arrival replaces §Attention prefilter (done with this design).

No schema, no migrations, no Worker change, no new endpoint. One area:
`src/ops2/projects/` plus the Attention model that counts through it. Frontend
only — Probity's red-first rule applies to `src/ops2/**` via the node suites
that bundle these modules and the web specs.

## 1. Shape of the change

The four Attention predicates stop being a fourth query axis and become four
ordinary entries in `REFINEMENTS`. Everything else follows mechanically:

- **`REFINEMENTS` grows to six**, in the spec's order (criterion 1):
  `submissions` (New submissions), `inReview` (Being priced), `ready` (Ready to
  issue — the existing entry, moved, not copied), `awaitingPayment` (Awaiting
  payment), `unresolved` (Unresolved lines), `production` (In production). The
  four predicates are `ATTENTION_FILTERS`'s, verbatim.
- **The attention axis is deleted, not renamed** (P2, criterion 18):
  `QueueQuery.attention`, `ATTENTION_FILTERS`, `attentionQuery` go;
  `selectProjects` loses its fourth filter pass; `EMPTY_QUERY` loses the field.
- **Arrival survives as an act, not an axis.** `?attn=<key>` keys stay verbatim
  (`ASSUMED`, spec §4 — Attention's links untouched). A new
  `arrivalQuery(key: AttentionKey): QueueQuery` returns
  `{ chip: "all", refinements: [<mapped refinement>], search: "" }` —
  `readyToIssue → "ready"`, the other three map to their same-named refinement
  key. Both ProjectsPage (arrival) and attention.ts (card counts) call it, so
  criterion 19 holds by construction.
- **The strip loses the brand pill** (spec §4 assumption 2): active filters all
  render as the existing plain-text names. Strip **Clear → `EMPTY_QUERY`**
  (criterion 8) — no longer the refinements-only clear.
- **The empty-state "set moved on" branch is deleted**: a panel-ticked filter
  and an arrival filter are now the same thing, so the existing
  refinements-named empty (criteria 10, 12) is the one honest answer.

### The one real trade-off: how arrival's one-shot reset works now

Today's mechanism distinguishes "arrival-applied" from "hand-applied" by the
query shape (`q.attention !== null`) plus a history-entry-key ref
(`attnEntryRef`), reset on return. After the merge the query shape can no
longer tell the two apart. Replacement: a plain **`arrivalRef: useRef(false)`**
set `true` when a *valid* `?attn=` is consumed, and a reset that fires **on
leaving the route** instead of on returning:

```
useEffect(() => {
  if (location.pathname !== PROJECTS.path && arrivalRef.current) {
    arrivalRef.current = false;
    setQuery(EMPTY_QUERY);
  }
}, [location.pathname]);
```

Why this passes every measured constraint the current comments record:
- `ionViewWillEnter` is still not involved anywhere (measured not to fire on
  rail-back — the F2/F4 record in ProjectsPage stays, condensed, as the reason
  the reset hangs off the router).
- Leaving *is* a location change, so the reset cannot miss (the F4 failure
  mode was a clearing event that never fired; pathname change always fires).
- The whole entry-key machinery (`history.location.key` read-after-replace,
  same-entry POP special case) deletes: "left the route" is observed directly,
  not inferred from entry identity. Same observable behaviour: rail-away/back
  resets (criterion 15), record-open/back resets (existing web test line
  147–183), the sibling-route `?attn=` guard is untouched (arrival effect
  keeps its pathname guard; `arrivalRef` is never set by a foreign route).
- Hand-applied filters keep today's behaviour: they persist across mounted
  navigation, because only an arrival sets `arrivalRef` (spec §3:
  non-persistence rules are unchanged).

Known edge, deliberate: after an arrival, *any* later leave resets to
`EMPTY_QUERY` even if the reader has meanwhile re-fiddled the filters by hand —
identical to today, where `q.attention` survived manual chip/refinement edits
and leaving still reset everything. One new sub-case (untick the arrival's own
refinement by hand, then leave → still resets) diverges from a strict reading
of "manual state persists"; it is the same rule stated once — an arrival's
visit ends in `EMPTY_QUERY` — and not worth a second flag.

## 2. Affected files — hand-off index

**`src/ops2/projects/queue.ts`** (the model; every line number = current file)
- `QueueQuery` (88–96): delete `attention` field and its comment.
- `RefinementKey` (98): six keys — `"submissions" | "inReview" | "ready" |
  "awaitingPayment" | "unresolved" | "production"`.
- `AttentionKey` (101): keep — it names the URL grammar, which is unchanged.
- `REFINEMENTS` (140–153): six entries in criterion 1's order; keep the
  existing `ready`/`unresolved`/`production` entries and their rationale
  comments; the four predicates copied verbatim from `ATTENTION_FILTERS`
  (167–171). Add a short comment: the first four are the Attention gate's
  predicates, P2's, one list per grill P1, ADR 0020.
- `ATTENTION_FILTERS` (164–172) and `attentionQuery` (174–181): delete.
- New, in their place:
  `ATTENTION_ARRIVALS: readonly { key: AttentionKey; refinement: RefinementKey }[]`
  (order = Attention's card order: submissions, inReview, readyToIssue,
  awaitingPayment) and
  `arrivalQuery(key: AttentionKey): QueueQuery` returning
  `{ chip: "all", refinements: [mapped], search: "" }` — keep the existing
  "chip `all` so the predicate alone defines the set" comment.
- `attentionFromSearch` (183–191): keep; validate against `ATTENTION_ARRIVALS`.
- `EMPTY_QUERY` (203): drop `attention: null`.
- `emptyStateFor` (356–450): delete the `query.attention` branch (371–385);
  `narrowed` (397) drops `|| query.attention !== null`; the three query
  literals at 398, 431, 438 drop `attention: null`.
- `selectProjects` (622–653): delete the attention pass (650–651).

**`src/ops2/attention/attention.ts`**
- Imports (8–14): `ATTENTION_FILTERS, attentionQuery` → `ATTENTION_ARRIVALS,
  arrivalQuery`.
- `projectRows` (97–110): iterate `ATTENTION_ARRIVALS`; count =
  `selectProjects(rows, arrivalQuery(a.key)).length`; href unchanged
  (`?attn=<key>`). `PROJECT_NOUNS` (84–89) unchanged. The statusCustomer
  payload guard (138–143) unchanged. Update the doc comments at 4–5 and 91–95.

**`src/ops2/projects/ProjectsPage.tsx`**
- Imports (13–16): drop `ATTENTION_FILTERS`, `attentionQuery`; add
  `arrivalQuery`.
- `attnEntryRef` + the two effects (86–145): replace per §1 — arrival effect
  keeps its pathname guard and `history.replace` strip, sets
  `setQuery(key ? arrivalQuery(key) : EMPTY_QUERY)` and
  `arrivalRef.current = key !== null`; the second effect becomes the
  leave-reset. **Preserve the measured-fact comments** (ionViewWillEnter never
  fires on rail-back; the sibling-route guard) in condensed form — they are the
  record of three failed fixes.
- `attentionLabel` (166–169) and the strip's brand pill + `+`-join special
  case (416–435): delete; the strip renders when
  `activeRefinements.length > 0` and lists the names as it already does.
- Strip Clear (442): `onClick={() => setQuery(EMPTY_QUERY)}` (criterion 8).
- FilterSheet mount (457–464): unchanged wiring — `view.refinements` now
  carries six controls. The panel's footer "Clear all filters"
  (`onClear`, 462) stays refinements-only (`{...q, refinements: []}`): it is
  the panel's own control, criterion 8 governs the strip; two different exits
  would only matter if they disagreed about the refinements, and they don't.

**`src/ops2/projects/FilterSheet.tsx`** — untouched. It renders whatever
controls it is handed; six checkboxes is the same component. (Named so nobody
"improves" it into groups.)

**`src/ops2/styles/projects.css`**
- Delete `.pq-flag[data-tone="brand"]` and its comment (514–521). The
  `warning`/`neutral` tones stay — `rows.tsx` uses them.

**`scripts/tests/ops2-projects.test.mjs`** (owned by `npm run test:ops2`)
- 101: control-count floor `3 + 3` → `3 + 6` (criterion 3 now covers all six
  through the existing every-number-is-its-list loop).
- 162: `all.query` deepEqual drops `attention: null`.
- 295: "Show all" deepEqual drops `attention: null`.
- 432–461 ("the Attention gate's four predicates…", the mutation-relevant
  PA–PF test): `M.attentionQuery(key)` → `M.arrivalQuery(key)`; assertions
  (exact refs PA/…/PE, PF excluded, readyToIssue ≡ issuable) unchanged
  (criterion 17).
- 463–469: rewrite — the "set moved on" branch is gone; assert
  `emptyStateFor(rows, arrivalQuery("submissions"))` yields the
  refinements-named empty: headline "No projects match these filters.", detail
  matches /New submissions/, clear label "Clear filters" (criteria 10, 18).
- 471–479 (`attentionFromSearch` hostile inputs): keep verbatim; reword the
  474 message ("ATTENTION_FILTERS' own keys" → "ATTENTION_ARRIVALS' own keys").
- New tests (criteria 11, 2, 18, 19):
  - **The labelled zero (criterion 11, D1's pin):** rows with
    `orderStage: "deposit_invoiced"` and `waitingOn: "Customer"`; under
    `{ chip: "us" }` the `awaitingPayment` control from `refinementStates`
    counts exactly `0`; under `{ chip: "all" }` the same control counts the
    true number. And ticking it under `us` (criterion 12 model side):
    `selectProjects` returns `[]` and `emptyStateFor` names the filter with a
    way out, chip untouched in the clear query.
  - **One "Ready to issue" (criterion 2):** `REFINEMENTS` has six entries,
    labels pairwise distinct, exactly one `ready`, order per criterion 1.
  - **The model purge (criterion 18):** read `src/ops2/projects/queue.ts` as
    text (the `read()` idiom from ops2-attention.test.mjs) and assert
    `QueueQuery`'s declaration carries no `attention`, and the identifiers
    `ATTENTION_FILTERS`/`attentionQuery`/`attentionStates` appear nowhere in
    `src/ops2/projects/` sources (glob the dir, comments stripped).
  - **Card ≡ panel with nothing else on (criterion 19):**
    `selectProjects(rows, arrivalQuery(k)).length` equals the
    `refinementStates(rows, { chip: "all", refinements: [], search: "" })`
    count for the mapped key, over PA–PF, all four keys.

**`scripts/tests/ops2-attention.test.mjs`**
- Bundle entry (30–31): export `ATTENTION_ARRIVALS, arrivalQuery` instead of
  `ATTENTION_FILTERS, attentionQuery`.
- 45, 53: destructure the new names; `ATTENTION_KEYS` from
  `ATTENTION_ARRIVALS.map(a => a.key)`.
- 101–117, 128–139, 137–164: loops over `ATTENTION_FILTERS` → over
  `ATTENTION_ARRIVALS`; every `attentionQuery(` → `arrivalQuery(`. All
  assertions (counts 1/2/1/2, order, PF narrowing, state-move flip,
  readyToIssue ≡ issuable, href grammar) unchanged — criteria 13, 17.

**`scripts/tests/web/ops2-projects.spec.ts`** (owned by `npm run test:web`)
- Existing assertions the six-filter panel moves (update, do not weaken):
  - 401 and 597: `queue-refinement.nth(2)` was "In production"; now use
    `.nth(5)` (or better, `[data-refinement="production"]`).
  - 586–591: refinement count 3 → 6; assert all six labels visible, in
    criterion 1's order, and `sheet.getByRole("radio")` count 0 and
    `sheet.getByText("Ready to issue")` count 1 (criteria 1–2).
  - 595: count `.nth(2)` → the production control's count.
  - 607–610: strip Clear is now `EMPTY_QUERY` — after Clear assert funnel
    bubble gone, `Needs us` chip `aria-pressed=true`, and row count 1 (only
    the `waitingOn: "Us"` fixture row; the Production/Nobody row is behind the
    chip again). Criterion 8.
- New tests (append after the filter-panel block, same intercepted-fixture
  idiom; build a local six-row PA–PF from `fixtureRow`, all `waitingOn: "Us"`
  except PD/PE `waitingOn: "Customer"`):
  1. **Tick / untick / compose (criteria 5, 6, 7, 20):** chip All; open panel;
     tick "Awaiting payment" → exactly PD+PE listed, strip contains "Awaiting
     payment", bubble reads 1; with a search term and a second filter ticked
     the list is the intersection and the chip/search are unmoved; untick →
     pre-tick view, bubble decrements. A `route` call counter pinned at 1
     request for the whole sequence proves filtering never refetches and no
     filter value reaches the Worker (criterion 20).
  2. **The way back (criterion 9):** goto `?attn=submissions` (the very URL the
     attention spec pins on the card, href-asserted there) → PA alone; strip
     Clear; open panel; tick "New submissions" → PA alone again, URL still
     `/ops2/projects`. (Fixture rows are `waitingOn: "Us"`, so the default chip
     leaves the set identical — the "nothing else on" of the criterion.)
  3. **Labelled zero + honest empty under the chip (criteria 11, 12, 4, 10):**
     rows where the invoiced pair is `waitingOn: "Customer"`; chip `Needs us`;
     open panel — "Awaiting payment" count reads exactly "0" (and under All,
     "2"); tick it anyway → `queue-empty` names the active filter and offers
     the way out; `Needs us` chip still `aria-pressed=true`. Tick "New
     submissions" + "Being priced" under All → empty names both (criterion 10).
- The `?attn=` arrival/reset/bogus/signed-out tests (128–257) stay as they are
  and must stay green (criteria 13–16, 21) — no edits expected; if the reset
  rework breaks one, the rework is wrong, not the test.

**`scripts/tests/web/ops2-attention.spec.ts`** — untouched, deliberately: its
four narrowing tests and the card-href assertion are criterion 17's proof that
arrival behaviour did not move.

**Docs (already applied with this design):** `CONTEXT.md` (§Attention arrival;
§Attention destination now cites `arrivalQuery`), `docs/adr/0020-…`, status
lines in ADR 0018/0019.

## 3. Sequencing

1. **t1 — the model** (`queue.ts` + `ops2-projects.test.mjs`): red tests for
   six refinements / deleted axis / labelled zero / arrivalQuery, then the
   model change. Everything else depends on this.
2. **t2 — Attention counts** (`attention.ts` + `ops2-attention.test.mjs`):
   mechanical rename to the new symbols; proves criterion 13/17/19 model-side.
   After t1. (Until t3 lands, `ProjectsPage.tsx` won't compile against the new
   model — t2 and t3 both follow t1; run `typecheck:gate` at t3, not t2.)
3. **t3 — the page** (`ProjectsPage.tsx` + `projects.css` + the *existing*
   web-spec assertion updates): arrival/reset rework, strip, Clear. Gate:
   `npm run typecheck:gate` clean, the touched web tests green, the untouched
   `?attn=` tests green.
4. **t4 — the new web tests** (append to `ops2-projects.spec.ts`): the three
   scenarios above. After t3.

## 4. Test plan → criteria map

| Criteria | Proof |
|---|---|
| 1, 2 | node: REFINEMENTS order/uniqueness (t1); web: panel renders six checkboxes, no radio, one "Ready to issue" (t3/t4) |
| 3 | node: existing every-control loop now over 3+6 controls (t1) |
| 4, 11, 12 | node labelled-zero test (t1); web scenario 3 (t4) |
| 5, 6, 7, 20 | web scenario 1 with request counter (t4) |
| 8 | web: updated Clear assertions at 607–610 (t3) |
| 9 | web scenario 2 (t4) + attention spec's card-href pin (unchanged) |
| 10 | node emptyStateFor rewrite (t1); web scenario 3 (t4) |
| 13, 17 | ops2-attention.test.mjs (t2) + web ops2-attention.spec.ts untouched-green |
| 14, 15, 16 | existing ops2-projects.spec.ts `?attn=` tests, untouched-green (t3) |
| 18 | node source-text purge test (t1); typecheck gate (t3) |
| 19 | node card≡panel test (t1/t2) |
| 21 | existing signed-out test (spec 245–257) + api.test.mjs staff gate, both unchanged |

All named test files exist and are wired: `test:ops2` and `test:web` in
`package.json` — no script changes needed.

## 5. Security

No new data, no new endpoint, no new parameter, no schema change. Filtering is
client-side over rows the staff-gated `GET /api/ops/projects` already returned;
the only untrusted input, `?attn=`, keeps its closed-set validation
(`attentionFromSearch`) and its hostile-input tests (node 471–479, web
215–243). Trust boundaries and authorization are exactly as before this change
— criterion 21 is pinned by the existing signed-out web test and the endpoint's
untouched staff gate. **Security: no new sensitive surface**; residual risk: none
identified beyond the pre-existing surface.

## 6. Rejected alternatives

- **Single-select attention group in the panel (ADR 0019 as written):** two
  control kinds, two counting rules, and "Ready to issue" drawn twice. Owner
  rejected (P1); 0019 superseded.
- **Keeping `QueueQuery.attention` but toggling it from the panel:** "a
  refinement, but special" — the over-complication moved into the model
  (P2). Also breaks criterion 18 verbatim.
- **Auto-widening the chip when a ticked filter's set lies outside it:** a
  special case in one tick handler; owner ruled leave the chip alone (D1), the
  labelled zero is the safety. Spec names the default chip as the only future
  lever.
- **Keeping the entry-key reset machinery with a parallel "arrival" flag:**
  strictly more state to answer a question ("did they leave?") the pathname
  answers directly; the entry-key trick existed only because the old reset ran
  on *return* and had to distinguish return-from-POP from return-from-rail.
  Reset-on-leave makes the distinction moot.
- **Strip Clear keeping chip+search (today's refinements-only clear):**
  contradicts criterion 8 verbatim; the spec unifies Clear on the arrival
  semantics (one exit, P6).
