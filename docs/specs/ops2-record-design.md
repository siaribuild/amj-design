# ops2 project record — correction DESIGN

**Date:** 2026-08-23 · **Stage:** pipeline stage 2 (architect) · **Decisions needed: none.**
**Spec:** `docs/specs/ops2-record-correction.md` (revision 2; criteria `P1-AC-*`, `P2-AC-*`, `AC-N*`, `AC-X*`).
**Grill:** `docs/specs/ops2-record-grill-conclusions.md` (R1–R9 binding).
**Source of truth:** the running Ionic mock at
`E:/Projects/amj-ops-planning/docs/mocks/ops2-r1-ionic-src/src/` — **all six files were read
for this design**: `pieces.tsx`, `pages/RecordPage.tsx`, `LineBody.tsx`, `Plate.tsx`,
`elevation.tsx`, `chrome.tsx`. Every structural choice below cites the mock file or the
repo file it comes from.
**ADR:** `docs/adr/0010-ops2-shares-the-elevation-generator.md` (written with this design).
**CONTEXT.md:** updated with this design — *Elevation*, *Line page*, *Attention filter*
(new "Ops console" section).

Phase 1 ships alone: the record and the line page, one column at every width. Phase 2
(rail + canvas) is sketched in §8 only far enough to prove phase 1 needs no undoing.

---

## 1. The four architectural decisions

### D1 — ops2 imports the customer's `Elevation` generator; it does not fork it

`src/components/quote-project/Elevation.tsx` imports exactly one module
(`src/data/catalogue`, line 25), renders pure SVG, and is already inside the router-free
shared set that `scripts/tests/ops2-deps.test.mjs` guards (the test at its foot names
`src/components/quote-project` as compiled into both graphs by design). The ops2 boundary
ban is on the customer's **theme sheet**, never on router-free components — that
misreading is the root cause this correction exists to fix. Recorded as ADR 0010 so the
next session does not re-litigate it.

Two **additive** changes to the shared component (deep module, wider interface, same
abstraction — nothing existing changes behaviour):

1. **A `hero` row in `SIZES`** (insert into the table at `Elevation.tsx:55-72`), verbatim
   from the mock (`elevation.tsx:55-60`): box 262×196, pad l44/r12/t12/b38, font 12.
   R-49 requires the generator be called at the size closest to the intended pixels; the
   line page's phone hero is ~320×248 and neither `md` (242×188 viewBox) nor `lg` fits
   that without scaling, which R-49 forbids in both directions. `ElevationSize` is
   `keyof typeof SIZES` (`Elevation.tsx:142`) so the union extends itself. The customer
   site is unaffected — nothing calls `hero` there.
2. **An `ElevationLegend` export** appended at the end of `Elevation.tsx`, ported from
   `elevation.tsx:392-402` (a plain `<dl className="elev-legend">`, five rows). The legend
   is the drawing's symbol language and lives with the generator — one place per fact.
   Each consumer styles it; tree-shaking keeps it out of the customer bundle until the
   customer site renders one.

**The `--paper` dependency is load-bearing.** `Elevation.tsx:101` haloes leader text with
`stroke: var(--paper)` and `:119` fills the wide-opening break-line rect with
`var(--paper)`. That token is defined in `src/styles/theme.css:24`, which ops2 does not
load (deliberately — `src/ops2/styles/index.css` header). An undefined custom property in
an SVG `fill` computes to black: the break-line would render as a black bar across the
leader. So ops2 must define `--paper` on its drawing surfaces — one rule in
`src/ops2/styles/record.css`, scoped to the elevation containers (e.g.
`.rl-elev, .lp-plate { --paper: var(--ds-surface-card); }`). At `xs` this never fires
(`font: 0` disables dims) but the line page draws at `hero`/`lg` where it always does.

### D2 — catalogue hydration blocks the mount, timeout-capped, fail-open

`src/ops2/main.tsx` adopts exactly the pattern `src/ops/main.tsx:33-35` uses:

- `hydrateFromSanity().finally(() => createRoot(...).render(<Ops2App />))`.
- `hydrateFromSanity` (`src/data/sanity.ts:69-78`) never throws and races a 2500 ms
  timeout (`:67`), so the worst case with Sanity unreachable is a ~2.5 s delayed mount —
  P1-AC-6's "within the existing hydration timeout" is satisfied structurally, not by a
  new mechanism.
- On failure the console mounts on the **built-in catalogue** (`src/data/catalogue.ts`
  hardcodes every family and product), so `getProductBySlug` still resolves every slug in
  the snapshot; a slug the snapshot has never seen falls through `kindFor()`
  (`Elevation.tsx:146`), which tolerates slug strings ("amj80-series-awning-window"
  contains "awning") and bottoms out at the fixed-frame fallback. **No blank slot exists
  in any failure mode** — `Elevation` always draws frame + glass.
- Only `hydrateFromSanity()`. NOT `hydrateSiteSettings` (customer branding) and NOT
  `hydrateOfferabilityFromApi` (the customer picker's filter). Fetching either would widen
  the surface for nothing this console reads — and AC-X5 is easiest to hold when the boot
  makes exactly one request whose query is the public `CATALOGUE_QUERY`.
- The stale comment at `src/ops2/main.tsx:5-9` ("the scaffold needs no data") is replaced
  with one stating the new reason: `Elevation` resolves families through
  `getProductBySlug`, so the catalogue is load-bearing (R2, P1-AC-5).

**Rejected: mount immediately, re-render when hydration lands.** `hydrateCatalogue`
mutates module state with no subscription; components reading it synchronously would not
re-render, so this option requires new invalidation machinery in `src/data/catalogue.ts`
to fix a delay that is ≤2.5 s worst-case and ~100–300 ms typical (CDN). It also creates a
window where rows draw the fallback and then flip to the real family — a row that
silently changes its drawing is worse than a boot that arrives whole. P1-AC-5's own trace
("the same way `src/ops/main.tsx` hydrates it") points at the blocking pattern.

### D3 — the line page resolves its line from the record fetch; no new endpoint

The line page calls the existing `useProjectRecord(projectId)`
(`src/ops2/projects/useProjectRecord.ts:37`) and selects
`record.lines.find(l => l.id === lineId)`. No worker route is added; nothing ever fetches
a bare line id, which is what makes AC-X3/AC-X4 structural: a line id from project B is
simply absent from project A's record, and "not on this project" and "does not exist"
are **the same code path**, so the two sentences cannot drift apart and a probe learns
nothing from the difference. Cold links work because the fetch is the normal path, not a
fallback. Cost: one extra `GET /api/ops/projects/:id` per line opened — accepted; the
alternative (handing the record through navigation state) still needs the fetch path for
cold links and would create two code paths where one suffices.

### D4 — the accepted-order DTO forwards `productSlug` AND `compositeAxis`

`worker/lib/orders.ts:164-238` (`orderLines()`) **already returns** `productSlug` on the
parent (`:205`) and on every segment (`:222`), and `compositeAxis` on the parent
(`:215-216`). The mapping in `worker/routes/ops.ts:669-690` drops all three on the way
out. The change is three lines in that mapping — no query change, no lib change.

Reconciling two criteria: P1-AC-8 demands an order row's elevation render "exactly as a
quote line's does", and a composite's drawing divides along `compositeAxis` (P1-AC-3), so
the axis must travel; AC-X6 says "that field and nothing else new". Ruling: AC-X6's
*intent* is that no cost, margin, supplier or internal pricing fact rides along —
`compositeAxis` is public geometry the customer's own order surface already knows. The
worker test (§9.3) asserts the DTO's added keys are exactly
`{productSlug, compositeAxis}` on the parent and `{productSlug}` on segments, which
pins AC-X6 tighter than prose would.

### D5 — the attention row is a *list* derivation in `record.ts`; the issue gate stays the server's

Two different facts, two owners, per the one-place-per-fact rule:

- **Whether the quote can issue** stays exactly where it is: `worker/lib/issue.ts`
  (`issuableNow`, `:150-160`; the endpoint refuses independently at `:209` area), spoken
  through `worker/lib/ops-actions.ts` `blockedReason`. The console renders the server's
  sentence beside the disabled CTA (P1-AC-39) and never re-derives the gate.
- **Which lines need the reviewer** is a property of the list the client already holds:
  `lineTotal == null` per line, `delivery.settled`/`frozen` per record. The mock derives
  its `blockers` queue client-side (`RecordPage.tsx:106-111`) for the same reason. This
  goes into `src/ops2/projects/record.ts` as pure derivations (`attentionFor`,
  `visibleLines` — §5.2), node-testable, no React.

The ordering rule (lines lead over delivery, P1-AC-17) is *copied from* the reasoning at
`worker/lib/ops-actions.ts:88-90`, not read from it — the gate reports one sentence, the
attention row manages a queue with a count; they are different shapes over the same
facts, and the node suite pins that they cannot disagree (a record whose attention queue
is empty must be one whose blockedReason names neither lines nor delivery).

---

## 2. Affected files — the hand-off index

Trust this list; do not re-derive it. "→" = the change lands at that symbol/line.

### Worker (build first — two small, independently testable changes)

| File | Change |
|---|---|
| `worker/routes/ops.ts` → the `orderLines:` mapping at **:669-690** | Parent gains `productSlug: l.productSlug` and `compositeAxis: l.compositeAxis`; each segment (**:684-690**) gains `productSlug: s.productSlug`. Values already exist on `l`/`s` (see `worker/lib/orders.ts:205,215,222`). Nothing else new (AC-X6). |
| `worker/lib/ops-actions.ts` → **:101** | Sharpen the blocked-issue sentence to name the consequence: `` `${args.blocking} line${…} unpriced or in technical review — the quote cannot be issued until every line has a rate.` `` (final copy may be tuned at the UX stage; the shape "count + consequence" is the requirement). `ASSUMED:` per spec §11 — this is the shared source both consoles read, so legacy ops shows the new sentence too. Existing tests are safe: `scripts/tests/api-edge.test.mjs:932` asserts presence only; `scripts/tests/delivery.test.mjs:481,568` match `/delivery/i` on the delivery branch, untouched. |
| `worker/lib/orders.ts`, `worker/lib/issue.ts` | **No change.** Listed so nobody "fixes" them. |

### Shared component (additive only)

| File | Change |
|---|---|
| `src/components/quote-project/Elevation.tsx` → `SIZES` at **:55-72** | Add the `hero` row verbatim from mock `elevation.tsx:55-60` (D1). |
| `src/components/quote-project/Elevation.tsx` → end of file (**:478**) | Append `export function ElevationLegend()` ported from mock `elevation.tsx:392-402`. |
| `src/components/quote-project/OpeningRow.tsx` | **No change.** `:103-110` is the reference call pattern (`parts` mapping, `axis`). |

### ops2 boot

| File | Change |
|---|---|
| `src/ops2/main.tsx` (whole file, 10 lines) | Adopt `src/ops/main.tsx:33-35`'s pattern: `hydrateFromSanity().finally(render)`. Replace the stale comment at **:5-9** (D2). Import from `../data/sanity`. |

### ops2 model (`record.ts`) — parser + new derivations

| File | Change |
|---|---|
| `src/ops2/projects/record.ts` → `RecordLine` (**:79-98**) | Add `productSlug: string \| null`, `compositeAxis: "vertical" \| "horizontal" \| null`, `origin: string \| null` ("manual" \| "schedule" — `migrations/0012:61`, sent at `worker/routes/ops.ts:163`), `priceCalculated: number \| null`, `priceOverrideAt: string \| null` (sent at `ops.ts:172-173`). `qty` stays in the model (order lines still carry it) but is **never rendered** (AC-N3). |
| `record.ts` → `RecordSegment` (**:50-69**) | Add `productSlug: string \| null`. |
| `record.ts` → `parseLine` (**:182-203**), `parseSegment` (**:161-180**), `parseOrderLine` (**:214-239**) | Carry the new fields; a missing slug parses to `null`, and the line is **kept** (P1-AC-7: fallback drawing, never dropped). `parseOrderLine` reads the same keys once the DTO forwards them; `origin`/`priceCalculated`/`priceOverrideAt` are absent on order lines and parse to `null` — absence stays absent. |
| `record.ts` → new derivations (§5.2) | `attentionFor`, `visibleLines`, `needsReview`, `elevationPartsFor`, `joinedUnitCount`, `unitsOf`, `unitLabel`, `cornerFigure`, `priceState`, `provenanceWord`. All pure, no React (the file's own four rules, **:16-19**). |
| `record.ts` → `RecordTotals` doc comment (**:380-383**) | The comment explains `subtotal` via the old "So far" row — rewrite to name its two remaining readers (the header corner P1-AC-37; nothing else). The field itself stays. |

### ops2 chrome

| File | Change |
|---|---|
| `src/ops2/chrome/OpsPage.tsx` → props (**:181-202**) | New optional slot `identity?: ReactNode` and flag `bandPinned?: boolean`. Desk (**:253-303**): `identity` renders as a toolbar row inside `IonHeader` between the title toolbar and the `controls` toolbar — fixed by construction, which is what P1-AC-13 needs at ≥1024. Phone (**:335-348**): `identity` renders inside `.ops2-page__band` between the heading and `controls`; `bandPinned` adds a modifier class that makes the band `position: sticky` in CSS so ref/customer/total, the tabs and the attention row stay on screen at every scroll position — the mock pins its whole `IonHeader` stack on the phone (`RecordPage.tsx:133-160`), and this is the same behaviour expressed through ops2's settled band (grill §3 keeps the band; P1-AC-13 requires the pinning). Back control (**:220-232**) is untouched — the line page inherits its pop-don't-push discipline (P1-AC-25). |
| `src/ops2/styles/projects.css` → `.ops2-page__band` (**:69-81**) | No change here; the sticky variant is a modifier in `record.css` so the queue's band keeps scrolling. |

### ops2 record surface

| File | Change |
|---|---|
| `src/ops2/projects/ProjectRecordPage.tsx` | The largest rewrite. `title` prop becomes `record.title` (P1-AC-10; today it passes `record.ref`, **:145**). Pass the new `identity` slot: mono ref (never truncates) + customer, `cornerFigure` money at the trailing edge (P1-AC-11/12/13/37 — shape from mock `pieces.tsx:137-149`, corner rationale `pieces.tsx:22-34`). Delete `RecordIdentity` (**:344-376**) — identity moves to the band; the state row becomes a standalone ranked two-line `StateRow` leading the content, **not interactive** (P1-AC-14; mock `pieces.tsx:167-180` minus the `onClick`, minus the chevron — a control wired to nothing is the recorded defect, AC-N9). `"so far"` at **:372** and **:411** deleted (P1-AC-36). Attention row rendered between the tabs and the list, wired to `attentionFor` + filter state (`useState`, page-local — survives re-entry because Ionic keeps the page mounted). The blocked refusal (**:248-253**) keeps its adjacency but is redrawn as a **critical error**, not a note (P1-AC-39); the reason also travels in the CTA's accessible name — Ionic's React wrapper drops `aria-describedby` (measured, mock `pieces.tsx:110-118`), so `aria-label={label + ". Blocked: " + reason}` is the channel. `RecordTotals` (**:387-423**) reworked per §5.4. |
| `src/ops2/projects/lines.tsx` | Rewritten. `LineFlags` (**:32-52**), the twisty/accordion `LineRow` (**:99-150**) and `LineHead` (**:152-179**) go. New row per §5.3: whole row one target navigating to the line page (P1-AC-24/35), `IonItem button detail={false}` (mock `pieces.tsx:266`), no `aria-expanded` anywhere (AC-N1), no room (**:167** today — AC-N2), no `×qty` (**:169** — AC-N3), one `needs review` badge (P1-AC-22). Keeps `data-testid="record-line"`. `RecordLines` empty states: the ORDER empty block stays verbatim (**:181-217**, edge table row "order with zero contract lines"); the QUOTE empty block drops its headline (the attention row now states "No lines on this project yet", P1-AC-20) and keeps only the caption, so the sentence is said once. New filtered-empty state (P1-AC-21). |
| `src/ops2/projects/LinePage.tsx` (**new**) | Route component (§4): `useParams` for `id` + `lineId`, `useProjectRecord(id)`, find the line, render `OpsPage` (title = line code, `backTo` = the record) around `LineReview`. Not-found sentence identical for AC-X3 and AC-X4 by construction (D3). No action controls in phase 1 (AC-N9; Edit/"Why" attach later, spec §4). |
| `src/ops2/projects/LineReview.tsx` (**new**) | The line's read-only body, router-free (record + line as props) so phase 2's canvas can render it unchanged (§8). Content order = mock `LineBody.tsx:317-328`: Plate hero → size + provenance line (P1-AC-28) → review-reasons panel when flagged (P1-AC-23, server's words from `line.review`) → Specification panel (budget 4, clamps with `+N more options`, P1-AC-29) **or** Units block for a composite (never both, P1-AC-30; mock `LineBody.tsx:417-456`) with coverage line that reports and never vetoes → Price panel (figure + state, `No rate` never `$0`, P1-AC-31/34) → the customer's note read-only (`line.room`, P1-AC-31). The Panel line-budget rule is structural, ported from mock `LineBody.tsx:376-411`: a panel slices to its budget and demands a `more` string when it cuts. |
| `src/ops2/projects/Plate.tsx` (**new**) | ops2's drawing plate: `Elevation` at `hero` (phone) on its own paper surface, tap = enlarge (a real button with an accessible name — mock `Plate.tsx:84-88`), `IonModal` expansion at `lg` with `ElevationLegend` and, for composites, the units list (mock `Plate.tsx:111-148`). **No pinned-strip (R-18) in phase 1** — spec §11 places it with phase 2's canvas. |
| `src/ops2/nav/destinations.ts` | **No change** — `isDestinationActive` (**:497-499**) is a segment-prefix match, so `/projects/:id/line/:lineId` keeps Projects lit in rail and tab bar alike. Listed so nobody adds a destination. |
| `src/ops2/Ops2App.tsx` → route table (**:207** area) | Add `<Route exact path="/projects/:id/line/:lineId" render={() => <LinePage />} />` beside the record route. The record route is already `exact` (**:207**) and `NESTS_BELOW` (**:69**) already contains `projects`, so the Ionic view-stack trap documented at **:183-201** is already defused; the line route must also be `exact`. |
| `src/ops2/styles/record.css` | Extend: identity-in-band rules, sticky band modifier, attention row, new row anatomy (elevation slot sizing for the 46×34 `xs` square), badge, totals rework, critical-refusal treatment, `--paper` scope (D1). |
| `src/ops2/styles/line.css` (**new**) + one `@import` in `src/ops2/styles/index.css` (**after `record.css`**) | The line page: plate surface, size line, panels + budgets, units list, legend. FrameFlow tokens only — no hex, no `--ion-color-step-*` (rule stated at `record.css:1-12`). |
| `src/ops2/projects/useProjectRecord.ts`, `src/ops2/chrome/SidePanel.tsx`, `src/ops2/projects/queue.ts` | **No change.** The hook is reused as-is by `LinePage` (its `useIonViewWillEnter` re-entry refresh, **:93-97**, is exactly what the line page needs too). SidePanel waits for phase 2's P2-AC-7. |

### Tests (§9 names what each proves)

| File | Change |
|---|---|
| `scripts/tests/ops2-record.test.mjs` | Extend — the model half of phase 1 (§9.1). |
| `scripts/tests/web/ops2-record.spec.ts` | Rewrite/extend — the rendered half (§9.2). Existing assertions that pinned the rejected surface (h1 = ref at **:90**; accordion toggles at **:131-159**; "So far" label; flag chips) are updated to the corrected criteria, not preserved. |
| `scripts/tests/api.test.mjs` → the accepted-contract read at **:230-243** | Extend with the order-DTO assertions (§9.3). |
| `scripts/tests/ops2-frame.test.mjs` | Add one static pin: `src/ops2/main.tsx` calls `hydrateFromSanity` and renders in `.finally` (the suite's own cheap-source-pin style). |
| `scripts/tests/ops2-deps.test.mjs` | **No change** — it already permits and guards this import direction. |

### Docs (land with the feature)

| File | Change |
|---|---|
| `CONTEXT.md` | New "Ops console" section: **Elevation**, **Line page**, **Attention filter** — applied with this design. |
| `docs/adr/0010-ops2-shares-the-elevation-generator.md` | Written with this design. |

**No `migrations/` change.** See §10.

---

## 3. The header, exactly (P1-AC-10 … P1-AC-14)

Reading down the record at phone width (all in the pinned band):

```
‹ Projects                                  back — OpsPage's existing control
Wattle Grove — Lot 14                       h1 = record.title, Ionic ellipsis on long names
OF-Q-10482 · Marchetti Constructions   $48,802 · 2 no rate
                                            identity line: mono ref (cannot truncate,
                                            leading edge) · customer · cornerFigure at
                                            the trailing edge
[ Lines · 18 ][ Project ]                   the settled tab chips (unchanged)
● 2 lines have no rate      show only these the attention row
────────────────────────────────────────────
WAITING ON US                               StateRow — ranked, two lines,
Technical review · 3 days                   NOT pressable (P1-AC-14)
… lines …
```

- The customer name appears in the identity line and **nowhere in the body**
  (P1-AC-12) — `RecordIdentity`'s body copy of it is deleted with the component.
- `cornerFigure(totals)` (§5.2) returns `{ amount, caveat }`:
  `total != null` → `$X`, no caveat; `unpriced > 0` → `$subtotal` + `N no rate`
  (owner's ruling 4, verbatim shape); all priced but delivery unset → `$subtotal` +
  `delivery not set` (`ASSUMED:` — the ruling's shape extended to the one other way a
  total can be unknowable; a bare number implying completeness is the thing it forbids).
- Desk: same content as toolbar rows in `IonHeader` — h1 in the title toolbar (already
  slotted, `OpsPage.tsx:256-258`), identity as the new toolbar, tabs below; fixed by
  construction.
- `waitingSentence` (`record.ts:439-443`) is kept as the server's vocabulary — our
  lifecycle has `Nobody` where the mock had `manufacturer`; the mock's third string
  arrives when the lifecycle grows that value, not before.

## 4. The line page (P1-AC-24 … P1-AC-31, R6)

- **Route:** `/projects/:id/line/:lineId` (matches the spec's own URL shape in AC-X3),
  `exact`, registered beside the record route in `Ops2App.tsx`. Segment-prefix matching
  keeps the Projects destination lit at every width (`destinations.ts:497-499`).
- **Reached by:** row activation pushes it (P1-AC-24) — `useHistory().push(...)` from the
  row, at **every** width in phase 1.
- **Back:** `OpsPage`'s existing control (`OpsPage.tsx:220-232`): pops when there is
  something to pop, pushes the record path (`/projects/:id`) as the cold-link fallback —
  which is P1-AC-25 verbatim, one level down from where the same discipline already
  lives. Returning re-enters the record page, whose `useIonViewWillEnter` refresh
  (`useProjectRecord.ts:93-97`) re-reads the record.
- **Data:** D3 — the record fetch, a `find` on `lines`, and one not-found sentence for
  both AC-X3 and AC-X4. A missing/forbidden **project** renders the hook's existing
  `missing`/role-error states unchanged.
- **Body:** `LineReview` (§2) — order and budgets from the mock; the review-reasons panel
  is the one element with no mock counterpart (the mock's badge sentence moved here, R5),
  placed between the size line and the specification so the flag is read before the spec
  it questions.
- **Copy defaults** (UX stage may refine wording, not structure): provenance
  `from the schedule` / `entered by hand` (`origin` is `'manual' | 'schedule'`,
  `migrations/0012_schedule_parse.sql:61`); price state `no rate` /
  `list price` / `price set by hand` (`priceState`: `lineTotal == null` → no_rate;
  `priceOverrideAt != null` → override; else list — fields from `ops.ts:172-173`).

## 5. Model additions in `record.ts` (all pure, all node-tested)

### 5.1 Parser (P1-AC-7/8)
Covered in §2. One rule worth restating: **a missing slug never drops a line** — it
parses to `null` and the row draws the fallback.

### 5.2 New derivations

```ts
type Attention =
  | { kind: "no-lines"; text: "No lines on this project yet" }              // P1-AC-20
  | { kind: "clear";    text: "Nothing is blocking this quote" }           // P1-AC-19
  | { kind: "blockers"; lead: Blocker; more: number };                     // P1-AC-15/17
type Blocker =
  | { key: "unpriced"; count: number; text: `${n} line(s) have no rate`; action: "show only these" }
  | { key: "delivery"; text: "Delivery has not been set" };                // no action — P1-AC-18

attentionFor(record): Attention        // lines lead over delivery; queue, not list
visibleLines(record, filterOn): RecordLine[]   // filterOn → lineTotal == null only
needsReview(line): boolean             // review map non-empty, or status "needs_review"/"technical_review"
elevationPartsFor(line): { productSlug, alongMm, qty }[] | undefined
  // OpeningRow.tsx:103-110's mapping, lifted to data: alongMm = axis === "horizontal"
  // ? segment.height : segment.width; qty = segment.qty (qtyPerParent); undefined for
  // a simple line or a composite with < 2 segments
joinedUnitCount(line): number          // Σ segment.qty  → "3 joined units" / "1 joined unit" (P1-AC-33)
unitsOf(line) / unitLabel(code, i)     // ported from mock LineBody.tsx:363-372 (W04A, W04B, …)
cornerFigure(totals, record): { amount: number; caveat: string | null }    // §3
priceState(line): "no_rate" | "override" | "list"                          // P1-AC-31
provenanceWord(line): "from the schedule" | "entered by hand" | null       // null on order lines
```

An accepted-order record with everything priced and delivery frozen reads
`Nothing is blocking this quote` — spec-literal per P1-AC-19's Given (`ASSUMED:` the
quote-vocabulary sentence on an order record is accepted until an order-specific
attention definition exists; refining it later is one string in one function).

### 5.3 The row (P1-AC-32 … 35, R8)

`elevation (xs, square) · code (mono) · product name · height × width mm · [N joined
units] · money at the trailing edge · [needs review badge]` — and **nothing else**.
Elevation call = `productSlug={line.productSlug}` + `elevationPartsFor(line)` +
`axis={line.compositeAxis}` + `square size="xs"`. Size text: both dims → `H × W mm`;
either missing → `size not read` (P1-AC-4; `sizeLabel` at `record.ts:474-476` already
refuses half a size — the row prints the phrase, not null). Money: `No rate` never `$0`
(`money`/null handling already established). The `needs-review` row keeps a warning rule
down its leading edge (mock `pieces.tsx:269`) — highlight, no sentence (AC-N6).

### 5.4 Totals panel (P1-AC-38/40, AC-N7/N10)

```
Lines · 2 with no rate            $48,382     (priced sum, own label — kept)
Delivery                          $420        text only; states:
                                              settled →  $X          (0 renders $0 — settled)
                                              unsettled + estimate → $X  not confirmed
                                              no figure →  "no figure" in the error
                                              treatment, NO imperative (P1-AC-40)
Project total                     2 lines have no rate      ← when unknowable: the
                                              absence named, NEVER a figure (P1-AC-38);
                                              when knowable: $X
```

No button, link or chevron anywhere in the panel (AC-N7 — the mock's pressable delivery
row at `pieces.tsx:346-360` is deliberately not carried). The word "estimate" never
prints (AC-N10) — the unsettled figure is qualified as `not confirmed`, not "about".
`totalsFor` (`record.ts:402-426`) is unchanged; only rendering changes.

---

## 6. Security

The record carries **customer pricing data and customer identity (commercial + personal
PII)**; it is staff-only. This correction adds **no new server read surface** — the one
new route is client-side and renders data from the already-gated record endpoint.

- **Data classification.** Moved, not newly stored: line `productSlug`/`compositeAxis`
  on the accepted-order DTO (public catalogue geometry, lowest class); everything else
  (prices, customer names, refs) already flows on this endpoint. No new columns, no
  logging of values, nothing customer-facing.
- **Trust boundaries.**
  1. *ops browser ↔ Worker*: unchanged — `GET /api/ops/projects/:id` behind the staff
     gate (`useProjectRecord.ts:54-65` renders the refusals). The line page adds **no
     new crossing**: it re-uses the same fetch (D3).
  2. *ops browser ↔ Sanity CDN* (new for ops2): read-only, public dataset, the same
     `CATALOGUE_QUERY` the customer site sends. The request is built from constants —
     no project, customer or line identifier can reach it (AC-X5), and its failure only
     delays mount ≤2.5 s and degrades drawings to the built-in catalogue (P1-AC-6).
     The Sanity `projectId` already ships in the customer bundle; nothing secret is added
     to ops2's.
- **Authorization per endpoint.**
  - `GET /api/ops/projects/:id` — staff only (existing `isStaffUser` gating in
    `worker/routes/ops.ts`); the project is fetched by its id with no account filter
    *because staff scope is the whole book* — that is the existing, correct model, and
    this design changes nothing about it. AC-X1/AC-X2 re-verify it (§9.3).
  - `/projects/:id/line/:lineId` (client route) — authorization is inherited: the page
    can only show what the record endpoint returned for `:id`. **The scoping filter is
    the `find` over that record's own lines** — a line id from another project matches
    nothing (AC-X3), indistinguishably from a nonexistent id (AC-X4).
  - No new POST/PUT/DELETE anywhere.
- **Abuse cases → where they break.** Cross-project line probe → D3's find (AC-X3);
  enumeration of line ids → identical not-found sentence (AC-X4); anonymous/non-staff
  record read → existing gate, re-tested (AC-X1/X2); data exfil via the widened order
  DTO → key-exact worker assertion (AC-X6, §9.3); poisoned/unavailable CMS → fail-open
  boot, fallback drawings, no behavioural change for non-staff (AC-X5, P1-AC-6).
  Residual risk: none new identified — the surface after this change reads strictly less
  than the endpoint already serves, plus two catalogue-geometry fields.

## 7. Sequencing (what the developer builds, in order)

Each slice lands with its tests green before the next starts; every artifact named in
§9 must exist when implementation ends.

1. **Worker DTO + sentence.** Red: extend `scripts/tests/api.test.mjs:230-243` (order
   DTO keys) → green: `worker/routes/ops.ts:669-690`; then `ops-actions.ts:101` with its
   assertion. Independently shippable.
2. **Model.** Red: extend `scripts/tests/ops2-record.test.mjs` (parser fields, all §5.2
   derivations, the "so far"/GST source scans) → green: `record.ts`.
3. **Shared Elevation additions** (`hero`, `ElevationLegend`) — type-checked; rendered
   proof arrives with slice 6.
4. **Boot.** Red: the `ops2-frame.test.mjs` pin → green: `main.tsx`.
5. **Record surface.** `OpsPage` slots, identity band, StateRow, attention row + filter,
   rows rewrite, totals, refusal treatment, CSS.
6. **Line page.** Route, `LinePage`/`LineReview`/`Plate`, `line.css`.
7. **Playwright.** Rewrite/extend `scripts/tests/web/ops2-record.spec.ts` against
   slices 5–6 (several specs can be written red alongside them — the suite mocks the
   endpoint, so it needs no worker changes).

UX/UI stage note: the approved mock **is** the running Ionic app; the mock gate is
satisfied by building to it. The ui-designer's polish pass still runs post-implementation.

## 8. Phase 2 sketch — proof phase 1 is not undone

Everything phase 2 needs already exists or is created by phase 1 with the right grain:

- **The canvas body is `LineReview`** — router-free by design (§2), rendered beside the
  rail instead of inside `LinePage`. Nothing about it changes.
- **Selection**: `selectedLineId` state in `ProjectRecordPage`; at `useRailWidth()` desk
  width, row activation sets state instead of pushing history (P2-AC-2 supersedes
  P1-AC-24 at that width only — one `wide ?` branch in the row's `onPick`, exactly the
  mock's `RecordPage.tsx:73-76`).
- **Rail** = the phase 1 column (StateRow → list → totals, P2-AC-3 — already assembled
  in that order); **canvas empty state** = one sentence (P2-AC-4); **filter emptying the
  rail** clears/advances the selection via `visibleLines` (P2-AC-5).
- **Actions** arrive through the existing `chrome/SidePanel.tsx` (P2-AC-7). The mock's
  `LineScroller`/`LineSwitcher` (`RecordPage.tsx:262-265`) and full-width action bar are
  **not built** (P2-AC-6, AC-N8, owner's exclusions).
- New at phase 2: the two-zone CSS, the pinned drawing strip (R-18, deferred there by
  spec §11), keyboard prev/next if wanted.

Nothing in phase 1 renders a second column, and nothing in phase 2 changes what any
phase 1 module *says* — only where the line body is mounted at ≥1024.

## 9. Test plan — criterion → proof → file

### 9.1 Node — `scripts/tests/ops2-record.test.mjs` (in `test:pure` and `test:ops2`; no wiring change)
- P1-AC-7: parser carries `productSlug`, `compositeAxis`, segment `productSlug`/`qtyPerParent`, `origin`, `priceCalculated`, `priceOverrideAt`; missing slug keeps the line.
- P1-AC-8 (model half): `parseOrderLine` carries slug + axis.
- P1-AC-3 (data half): `elevationPartsFor` — vertical axis → width as `alongMm`; horizontal → height; `< 2` segments → undefined.
- P1-AC-4 (data half): `sizeLabel` refuses half a size (exists — keep).
- P1-AC-15/16/17/18/19/20: `attentionFor` — queue order, `+N more` count, delivery blocker carries no action, clear sentence, no-lines sentence.
- P1-AC-16/21: `visibleLines` on/off; filtered-empty is derivable (empty array with a non-empty record).
- P1-AC-22 (predicate): `needsReview` — three reasons still one boolean.
- P1-AC-33: `joinedUnitCount` sums `qtyPerParent`, singular label; `unitLabel` A/B/C.
- P1-AC-31 (predicate): `priceState` — null → no_rate; `priceOverrideAt` → override; else list.
- P1-AC-37: `cornerFigure` — total known / unpriced / delivery-unset shapes.
- P1-AC-36 + AC-N4 + AC-N5 (grep half): a source scan over `src/ops2/**` asserting `/so far/i` never appears and no GST string appears (the suite already asserts the model exports nothing GST-shaped — extend to source text).
- Gate coherence (D5): a record whose `attentionFor` is `clear` must have an `issue-quote` action without a lines/delivery `blockedReason`, and vice versa (fixture-level pin that the two vocabularies cannot disagree).

### 9.2 Playwright — `scripts/tests/web/ops2-record.spec.ts` (in `test:web`; signs in as u_staff3; mocks `**/api/ops/projects/p_rec`)
Mock lines use **built-in catalogue slugs** (`amj80-series-sliding-window`,
`amj80-series-awning-window`, `amj100t-fixed-window` — the slugs `api.test.mjs` already
uses), so drawings resolve with or without Sanity. A `beforeEach` route-abort on
`**/*.sanity.io/**` (or equivalent apicdn pattern) keeps boot deterministic and fast; one
test does it explicitly to prove P1-AC-6.
- P1-AC-1/9: every row's first element is `svg[data-elevation][aria-hidden="true"]`; row accessible name still carries code/product/size/flag.
- P1-AC-2: a 3500×700 sliding line and a 900×1200 awning line render different SVG content (path/mullion comparison).
- P1-AC-3: a composite with 2400+600 segments renders panels + a join (assert `data-elevation` inner structure differs from the same line without parts, and mullion path count).
- P1-AC-4: a line with no height → `data-unsized` SVG + `size not read` in the row.
- P1-AC-5/6 + AC-X5: with all Sanity requests **aborted**, the console still mounts, the record renders, rows draw (fallback allowed) — and no intercepted request URL/body contains `p_rec` or any line id.
- P1-AC-8: an order fixture (`order` + `orderLines` with slugs/axis) → rows and unit drawings render; no badges (edge-table row).
- P1-AC-10-13: h1 = title; at 375 px a long title truncates while the full ref stays visible; customer in the band only; scroll to the list foot → total still visible.
- P1-AC-14: state row two lines, ranked; not a button; no chevron.
- P1-AC-15-21: toggle filters list and flips row text/action; `+1 more` with delivery also unset; delivery-leading row has no action; clear sentence; zero-lines sentence; filtered-empty sentence with the way back.
- P1-AC-22/23 + AC-N6: three-reason line → one badge, no reason text in the row; its page states all three reasons.
- P1-AC-24/25/35 + AC-N1: click anywhere on a row → line page URL; browser history length unchanged after back (`page.evaluate(() => history.length)` before/after); no `[aria-expanded]` in the list.
- P1-AC-26/27/28: hero plate above all; tap → modal with legend text (`opens towards you`); close returns; size line with provenance word, one line.
- P1-AC-29/30/31: spec panel clamped with `+N more options`; composite shows units (W04A…, own xs drawings, no price, no pencil) and **no** spec panel; coverage line on mismatch; price panel state wording; `No rate` never `$0`; note rendered read-only.
- P1-AC-32/34 + AC-N2/N3: row text order; no room text; no `×`.
- P1-AC-36-40 + AC-N4/N7/N10: no "so far" anywhere (page-level text scan across states); corner `$X · 2 no rate`; totals refusal shape; blocked CTA disabled with the server's sentence adjacent in the error treatment; delivery row has no button/link/chevron; "estimate" absent.
- AC-N11: fixture with any slug — no "withdrawn" text.
- AC-X1 (client half): 403 fulfilment → role-error sentence, no record content.
- AC-X3/X4: `/projects/p_rec/line/<foreign-id>` and `<nonexistent-id>` → the same sentence, byte-identical, nothing of any other project rendered.

### 9.3 Worker — `scripts/tests/api.test.mjs` (in `test:heavy`/`test:api`; no wiring change)
- P1-AC-8/AC-X6: at the accepted-contract read (**:230-243**), assert `orderLines[0].productSlug` and `.compositeAxis` present, segments carry `productSlug` — and assert the parent/segment DTOs' key sets gained **exactly** those keys (snapshot the sorted keys), so nothing else ever rides along.
- AC-X1/X2: `GET /api/ops/projects/:id` as anonymous and as a signed-in non-staff customer → 401/403, and the body contains no ref/customer/line/price fields (assert on the raw body text).
- P1-AC-39 (server half): existing gate tests stand (`api-edge.test.mjs:932`, `delivery.test.mjs:481-568`); add/adjust one assertion for the sharpened sentence's shape in whichever of those already reads it (presence tests keep passing regardless).

### 9.4 Static
- `scripts/tests/ops2-frame.test.mjs`: `main.tsx` hydrates before render (§7 slice 4).
- `scripts/tests/ops2-deps.test.mjs`: unchanged, and must stay green — it is the proof the Elevation import crosses no forbidden boundary.

## 10. Migration safety

**No `migrations/` change.** Every field this design moves already exists in the schema
and in the query results (`quote_line.product_slug`, `composite_axis`, `origin`,
`price_calculated`, `price_override_at`; `order_line.composite_axis`,
`product_snapshot_json → productSlug`). The changes are DTO mappings and client code
only. The `d1-migration-safety` skill was consulted for this determination; since no file
in `migrations/` is touched, no cascade analysis or rebuild strategy applies — and
nothing in this design may be "improved" into a schema change without returning to the
architect.

## 11. Rejected alternatives

| Alternative | Rejected because |
|---|---|
| Fork `Elevation` into `src/ops2/` (the mock's own port) | The mock forked for its sandbox's sake (`elevation.tsx:9-12` says so). In-repo it duplicates 400 lines of drawing arithmetic that must never disagree with the customer's; the boundary rule permits the import (ADR 0010). |
| Mount ops2 immediately, re-render on hydration | Needs new invalidation machinery in `catalogue.ts`; buys ≤2.5 s worst-case; produces drawings that flip after paint (D2). |
| A `GET /api/ops/lines/:id` endpoint for the line page | A bare-line fetch is exactly the surface AC-X3 forbids; scoping it would re-implement what the record fetch already scopes (D3). |
| Read the attention row from the server's `blockedReason` | The row is a filter over lines the client holds; parsing a sentence back into a count couples the UI to prose. The gate stays the server's; the list stays the list's (D5). |
| Reuse the whole customer `OpeningRow`/`OpeningList` | Bound to the customer Tailwind theme; the owner's ruling is share the FACTS and the DRAWING, let each skin render (`record.ts:1-19` records it). |
| `hero` via CSS-scaling `md`/`lg` | R-49 verbatim: the generator is called at the size closest to intended pixels; scaled leader text leaves its designed 9–13 px. |
| Pin only the money on scroll (partial-sticky band) | Negative-offset sticky over the band's height is fragile against content changes; the mock pins the whole header stack on the phone, so pinning the band matches approved behaviour at similar cost (~150 px). |

## 12. `ASSUMED:` register (for veto at review)

1. **(spec §11, carried)** The sharpened blocked-issue sentence in
   `worker/lib/ops-actions.ts:101` appears in legacy ops too — one place per fact.
2. Corner caveat extends to `· delivery not set` when that is the only reason the total
   is unknowable (§3) — the ruling's shape, second absence.
3. `Nothing is blocking this quote` renders on accepted-order records too (§5.2) —
   spec-literal; order-specific wording is one string later.
4. Exact microcopy for price state (`list price` / `price set by hand`) and provenance
   words — structure is fixed by the criteria; words may be tuned at the UX polish stage
   without returning here.

## 13. Decisions needed

**None.**
