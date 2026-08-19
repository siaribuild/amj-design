# ops2 line surface — what the quote builder can lend, honestly

Author: architect · Date: 2026-08-20 · Status: **investigation** (no design, no mock
changes; the owner chooses a strategy). Referenced by `docs/ops2/OPEN-DEFECTS.md` R6.

All customer-side citations are from `feat/referral-program` (read via `git show`, never
checked out). Mock citations are from `docs/mocks/ops2-r1-ionic-src/` on this branch.

The owner's two questions, verbatim:

> "the safest way would be to mirror edit panel of the quote builder … it allows full
> editing all and any information but price, which rightfully lives as a separate field.
> … View mode … we could mirror the read-only view of an item, once that is implemented
> in viewing submitted quotes view. … Investigate, see if you can reuse it at all."

> "I like the view of it BUT it lacks support for the splits. Analyse how list in the
> quote builder works, how items expand to show more detail without editing, and show
> their sub-items when they have them, how edit works, both for the item and for children."

Three findings up front, because they change the shape of the question:

1. **The read-only item view is not pending — it shipped.** `OpeningList` renders with no
   `actions` prop on the submitted-quote view (`src/pages/RecordDetailPage.tsx:546`), the
   order view (`RecordDetailPage.tsx:406`) and the issued-quote review
   (`src/pages/QuoteReviewPage.tsx:209`). "Once that is implemented" is already true.
2. **Edit-panel reuse is already binding and already proven in production ops.** The
   carry-across register row 95 mandates `ItemForm` verbatim; ops1
   (`src/ops/ProjectRecord.tsx:1395` and `:1489`) mounts the *same* `ItemForm` the customer
   uses, for parents and units, with price deliberately outside it. The question for ops2
   is not "can the editor be reused" — that is settled — it is how far the *list and
   view-mode* components can follow it.
3. **The split gap in ops2 is a mock gap, not a spec gap.** Register rows 112–126 already
   bind ops2 R1 to carry unit rows, the split planner, merge, add/remove unit and the
   coverage sentences. The approved Ionic mock simply renders none of it — a line says
   `· 3 joined units` (`pieces.tsx:220`) and stops.

---

## 1. What exists — the component inventory

### 1.1 The customer list, three layers, one rule

`/quote` is built as *collapsed row → inline expansion (read-only) → drawer (the only
editor)* — "open to inspect; edit to change" (`src/pages/QuoteProjectPage.tsx:15-20`).

**`src/components/quote-project/OpeningList.tsx` (187 lines)** — the whole list, one
component, **two modes on one axis**: pass `actions` and rows offer Edit / More / Fix
details; omit it and "the same rows state the same information with nothing to press"
(`OpeningList.tsx:39`, `readOnly={!actions}` at `:124` and `:133`). There is deliberately
no third mode — the header comment records that every other builder/record difference was
a bug. Read-only also drops the Status and actions grid tracks (`data-record` at `:73`).
Disclosure state (`openedKeys`/`touchedKeys`) lives inside the list because it is
presentational; the two-set trick keeps close animations working while unopened rows cost
nothing.

**`OpeningRow.tsx` (238 lines)** — one collapsed row per opening. Grid at ≥1024, stacked
card below; one DOM order throughout. The row body is *not* clickable (owner D1): chevron
inspects, the labelled pencil edits. Identity cell = leading chevron + 28×28 `square`
`Elevation` (drawn from `parts` when composite, `OpeningRow.tsx:103`) + reference. A
composite parent shows **its own** figures: its code, `compositeLabel(segments)` as the
product cell (never one unit's name), its overall size, and **its total** — "the customer
submitted ONE line and must keep seeing one". Chip suppression is deliberate: a composite
parent shows no chip unless the fault is its own or is `Check sizes` (units don't sum) —
a child's fault is chipped on the child, once.

**`UnitRow.tsx` (137 lines)** — a composite's child as a *row*, not a panel. Same
`.quote-row` grid tracks as the parent so Status/Product/Size/Price share one eye-line;
the block is inset by exactly the chevron's width. A unit gets: its own chevron
(inspection), `W1A`-style derived reference, product name, `×N per opening`, size. A unit
deliberately gets **no price** (parent owns the total, `UnitRow.tsx:137` keeps the empty
cell so columns hold), **no edit pencil** (units are reached through the parent's editor),
**no More menu**. Its chips (`Incomplete` / `Check size`) render from data, not from a
`readOnly` flag — invisible on priced records, visible wherever a unit is unpriced.

**`OpeningExpansion.tsx` (308 lines)** — layer 2, read-only by construction: values as
text, one framed launcher at the foot (dropped when `readOnly`, `:253`). Exports the two
pieces ops2 view-mode would actually want:
- **`SpecPanel` (`:86`)** — drawing left (180px `Elevation size="sm"`, numbers on the
  drawing), full option checklist right (`OptionLines`: every option the product offers,
  chosen or standard-inherited, swatches from the catalogue). Props are pure data:
  `productSlug, widthMm, heightMm, pairs, parts, axis`. No store, no session, no fetch.
- **`CoverageNotice` (`:153`)** — "The units add up to {n} mm more/less than this
  opening" at the head of the children block.

The expansion's content boundary is explicit (`:296`): price breakdown, provenance,
technical-review rationale are *deliberately absent* — they are ops2's four "doors", and
they stay ops2-owned.

**`rowState.ts` (169 lines)** — the pure mapping from `QItem` to row state
(`needs-input` / `composite` / `confirm-layout` / `none`), built on
`lineBlocksSubmission` — **customer submission semantics**, not ops semantics. Also home
of `unitLabel(parentCode, index)` → `W1A, W1B…` (`:63`) and `compositeUnitCount` (`:78`),
both pure and reusable anywhere. **`identity.ts` (60 lines)** — durable UI keys:
`serverId`-based `rowKeyOf`, `unitKey(segmentId)`, and the `DrawerTarget` type whose
comment records the owner's rule: *there is no "add-unit" mode — unit count is the split
decision and the customer does not make it* (`identity.ts:36-38`).

### 1.2 Edit — one engine, two hosts, price outside

**`src/components/ItemComposer.tsx` — `ItemForm` (`:536`)** is the engine, and it was
already shaped for ops reuse:

- `quote: Pick<QuoteState, "items">` (`:547`) — reads `items` only, for duplicate-code
  checks; the comment says outright "ops reuses this form against a record it loads from
  its own API".
- `priceFn` (`:538`, default `previewPrice`) — injectable; "Ops must override it: a staff
  member pricing someone else's line has no 'current project'".
- `scope="unit"` — no Item ID, no qty; across-axis dimension shown and *editable* (it
  persists — the "locked" caption was a recorded lie, fixed).
- `includeDisabled` (`:540`) — "OPS ONLY": withdrawn products stay offered, marked.
- `hideProduct` / `hideOptions` — a composite parent is a schedule line, not a product.
- `compatibility={{siblingSlugs, enforce}}` — customer `enforce:true` (server refuses),
  ops `enforce:false` (mismatches marked, save proceeds, review reason stamped).
- `parts` + `unitAxis` — the in-form `Elevation` draws the real composite.
- `quietUntilTouched`, `initialSection`, `onDirtyChange`, `stickyActions`, `hideHeader` —
  host-integration seams the drawer already exercises.

**What `ItemForm` edits:** code, product (type→product), width, height, glazing + every
option group, note (`location` → `quote_line.room_label`). **What it deliberately cannot
edit:** *price* — the figure it shows is a debounced server preview, never an input;
*qty* — read-only, retired from view (D4); *unit count* — the split decision lives
outside; *server-owned fields* — the drawer's save writes only the named fields
(`OpeningDrawer.tsx:150-155`). The owner's "everything but price" is verified exactly.

**Price lives beside the form, twice over, by design.** Ops1's `PriceCell`
(`ProjectRecord.tsx:1033`) is the one place staff set a line price
(`opsSetLinePrice`), with the register's reasoning: *"NOT IN ItemForm, which is the
shared line editor the CUSTOMER also uses… A price field there would appear on their
screen too."* Composite parents refuse a price (409 `composite_parent`) — units carry it.
Ops2's `ManufacturerPricePage` door is the same separation restated.

**Hosts.** The customer host is `OpeningDrawer.tsx` (405 lines): Radix Dialog, one drawer
two levels (parent ⇄ `Back to W4` unit), dirty-guard, review-key hygiene on save, and the
customer's editing contract baked in (no add/remove unit). The ops1 host is an inline
expanding table row (`ProjectRecord.tsx:1338-1560`) mounting the same `ItemForm` with the
ops adapter: `quoteLike = { items: siblings.map((s,i)=>({id:i, code:s.code})) }`,
`excludeId=selfIndex`, `priceFn=opsLinePricePreview(line.id)`, `includeDisabled`,
`compatibility {enforce:false}` — plus two ops-only blocks *around* the form: the
AI-configuration select (register rows 106–108) and the `resolveChecks` review checkbox
(rows 109–110). **Splits** are ops1-owned UI: `SplitPanel` (`ProjectRecord.tsx:1589`,
~100 lines — axis, unit count, per-unit sizes, even-split proposal matching the server's),
`+ Add unit` / `remove` / merge via `opsAddSegment`/`opsRemoveSegment`/`opsSplitLine`,
coverage sentences that report and never veto. None of it is exported — all module-private
in `ProjectRecord.tsx`.

### 1.3 Read-only — shipped, with one line model end-to-end

`worker/lib/orders.ts` serves orders in the same nested shape as quotes;
`hydrateQuoteItems(ApiItem[]) → QItem[]` (`src/data/api.ts:68`) is the single
DTO→client-model boundary; `OpeningList` without `actions` renders draft, submitted,
issued and ordered stages identically. `accountModel.tsx:175-181` records the deletion of
the last "second line model". The customer side has converged on exactly the
one-component-everywhere shape the owner is describing.

### 1.4 What ops2 has today (the mock)

- **List** (`pieces.tsx:170` `LineList`): flat `IonList`, one `IonItem` per line — `xs`
  elevation (drawn with `parts`, so a composite *silhouette* is right), code, product,
  size, `· N joined units` text, price, `needs review` badge. No expansion, no unit rows,
  no way to see or reach a unit. This is the approved view R6 criticises.
- **Line plane** (`LineBody.tsx`): plate + four doors (dimensions / verdict / price /
  notes) + one line of `product · glazing`. Sound arrival design; no specification
  checklist, no unit representation beyond a footnote (`LineBody.tsx:199-204`).
- **Editor** (`Editor.tsx`): a four-field Ionic placeholder (code, height, width,
  glazing) whose header comment claims "FORM CONTROLS ARE IONIC'S… nothing hand-rolled".
  **That comment contradicts the binding design** (`ops2-ionic-boundary.md` §1.1
  disqualifier 1, §1.2 "never inside ItemForm"; interaction spec §"New props the shared
  ItemForm needs: none"). The mock is not a spec; the owner's new instruction re-affirms
  the boundary doc. The developer must not read `Editor.tsx` as guidance.

---

## 2. The six questions, answered concretely

**1. The list.** A row presents identity (chevron + square elevation + code), product,
size, price, and a state chip only when actionable. Expansion is by the leading chevron
only, holds `Set<RowKey>` state keyed on `serverId` (survives rehydrate), animates via
CSS `.disclose` with mounted-once panels, performs no network call and never edits. A
non-composite row expands into `OpeningExpansion` (drawing + full option checklist + note
+ one Edit launcher). A **composite row expands into its units instead — never both**
("a spec panel above the units would describe nothing", `OpeningList.tsx:99-105`): an
inset, docked box (`.quote-kids`) of `UnitRow`s, one per unit, each with its *own*
chevron expanding into its own `SpecPanel`. Nesting is one level and only one. The parent
shows its own figures (its code, its total, its overall size); the derived noun
(`compositeLabel`) and the `parts`-drawn elevation are the only aggregation.

**2. Edit.** Same component for parent and child: `ItemForm`, `scope="item"` vs
`scope="unit"` — verified in both the customer drawer (`OpeningDrawer.tsx:277`, `:343`)
and ops1 (`ProjectRecord.tsx:1395`, `:1489`). One drawer, two levels on the customer
side; two inline rows on ops1. Everything but price, qty and unit count is editable;
price is a separate control (`PriceCell`) on ops1 and absent for customers; unit count is
`SplitPanel`/add/remove on ops1 and deliberately impossible for customers.

**3. Read-only.** Exists and ships — see §1.3. The owner's "once that is implemented" is
already satisfied on the customer side; nothing needs building to mirror *from*.

**4. Reusability, honestly.** Per-component ledger in §3.

**5. The split gap.** §4.

**6. Two-entry mechanics.** §5. Headline: **zero `react-router` imports anywhere under
`src/components/` or `src/data/`** (verified by grep on the branch, including
`accountModel.tsx`, which `QuoteTotals` imports) — the routing hazard is nil for every
candidate here, and `ops2-deps.test.mjs` assertion 3 will keep it so. The costs that are
real are CSS/theme (the big one) and the ops-facts gap in shared components.

---

## 3. The reuse ledger

### 3.1 Reusable as-is (import in place, zero edits)

| Component | Why it ports | Ops2 must supply |
|---|---|---|
| `ItemForm` (`ItemComposer.tsx:536`) | Already binding (register row 95); ops1 proves every seam this needs exists | `LineEditor.tsx` wrapper (already designed): `quoteLike` items, `excludeId`, `priceFn` = ops2 price preview, `includeDisabled`, `compatibility {enforce:false}`, `hideProduct/hideOptions` for parents, `scope="unit"` mounts |
| `Elevation` (`Elevation.tsx:303`) | Deps = catalogue only; `--paper` token is the whole CSS surface | The §3.3 compat shim (already designed); catalogue hydration at boot (`hydrateFromSanity`, exactly as `src/ops/main.tsx:7` does today) |
| `SpecPanel` + `OptionLines` (`OpeningExpansion.tsx:86`) | Pure props — no store, no session, no fetch, no router | `optionFullPairs(product, options)` for `pairs`; the `.quote-rowexp`-band CSS (§5) |
| `optionFullPairs` (`ItemComposer.tsx:493`), `optionSummaryOf` (`:526`) | Pure functions over catalogue data; the glazing-first and standard-inherited rules live here once | nothing |
| `unitLabel`, `compositeUnitCount` (`rowState.ts:63`, `:78`) | Pure; W1A/W1B naming should be identical on every surface | nothing |
| Geometry helpers in `configurator.ts` (`acrossMismatch`, `compositeAcrossFault`, `sizePhrase`, `mm`, `compositeLabel`, `productLabel`) | Pure; three drifting readings of the same geometry were already unified here once — do not fork a fourth | nothing |
| `gst.ts` | Context default `"inc"`; ops2 provides `GstContext` from its own toggle | a provider, one line |

### 3.2 Reusable with an adapter (real work, named)

**`OpeningList` / `OpeningRow` / `UnitRow` / `OpeningExpansion` as a set** (~1,100 lines).
Three adapters stand between ops2 and mounting them:

1. **Data adapter — small.** `OpsLine` (`src/ops/api.ts:98`) is already ~QItem-shaped:
   `hydrateOpsLines(OpsLine[]) → QItem[]` is ~15 lines (`room`→`location`, synthesise
   local ids, drop `productName`/`priceCalculated`/`selectedVariantId` for display,
   compute nothing — coverage delta can ride `coverageDeltaMm` if the ops record route
   adds it, or stay client-derived as ops1 does).
2. **CSS/token bridge — the real cost.** The set consumes the `.quote-*` band of
   `src/styles/theme.css` (roughly lines 557–1010: `.quote-table/-row/-rec/-kids/-rowexp/
   -unitexp/-coverage/-chip/-twisty`, `.disclose`, `.quote-panel`) **plus** Tailwind
   utilities emitted from the `@theme inline` tokens (`theme.css:200`) — `text-ink`,
   `text-quiet`, `border-line`, `text-sage`, `t-data/t-cap/t-label/t-bd*`, `font-data`.
   Ops1 sidesteps all of this by importing `src/styles/index.css` wholesale
   (`src/ops/main.tsx:4`); ops2, by binding design, does not. The §3.3 shim mechanism
   ("bound to Ionic variables, never by importing theme.css wholesale") scales to
   `ItemForm`'s needs; for the whole list family it means either (a) the shim grows to
   restate ~450 lines + the token set, or (b) the `.quote-*` band is **extracted** from
   `theme.css` into a `quote-surface.css` both entries import, with each entry defining
   the `--ink/--line/--sage/--paper/…` tokens it binds to. (b) is honest and one-place;
   it is also a production-stylesheet refactor on a surface another thread is actively
   shipping — exactly the churn the boundary doc deferred "until the dev lines merge".
3. **Ops-facts gap — a genuine mismatch, not plumbing.** `rowStateFor` speaks customer
   submission semantics (`lineBlocksSubmission`); read-only mode (`!actions`) drops chips
   and the Status column entirely, because on a *customer* record every line is settled.
   An ops list is the opposite: `needs review`, `no rate`, withdrawn, price-overridden
   are the facts staff scan for. Mounting `OpeningList` read-only today would render a
   clean, chip-less list that *withholds* ops facts. Fixing that properly means adding an
   ops-owned per-row slot/`facts` prop to shared components — an edit to production
   customer files mid-flight, needing coordination with the active thread and its own
   Playwright assertions.

**`QuoteTotals`** — router-free, but imports `accountModel.tsx` (`TONE`, `money`) and
speaks customer money grammar (deposit, referral). Ops2's `Totals` (delivery review row,
GST basis) is a different instrument. Reusable in principle; not obviously wanted.

### 3.3 Not sensibly shareable — mirror the behaviour, share nothing

| Component | Why not |
|---|---|
| `OpeningDrawer` | It *is* the customer editing contract: Radix Dialog host, customer `QuoteState` writes (`quote.update`, `quote.updateSegment`), review-key hygiene tuned to the customer flow, and the baked-in rule that units can never be added or removed — the exact power ops must have. Ops2's edit hosts are already designed differently (boundary doc §4 ladder: plane / no-backdrop sheet / pane). Reuse the *conventions* (520px cap, dirty-guard semantics, Escape precedence), not the component. |
| `rowState.ts` (`rowStateFor`) | Encodes customer triage ("visually exceptional only when the customer can act"). Ops triage is near-inverse (technical review is exactly what staff act on). Share the *helpers* (§3.1), not the mapping. |
| `MoreMenu`, `ProjectActionBar` | Customer actions (duplicate/delete, submit bar). Ops2 has `IonActionSheet` and its own action grammar (register rows 60–64). |
| ops1's `PriceCell` / `SplitPanel` / AI-config block | The behaviours are register-mandated for ops2 (rows 106–126) but the code is module-private in `ProjectRecord.tsx` and styled to ops1's table. Extracting them into `src/ops/` shared modules is possible; given ops1 is the console ops2 replaces, re-implementing against the same `opsApi` calls inside ops2's own layout is the smaller total diff. Either way the *server* calls (`opsSplitLine`, `opsSetLinePrice`, `opsPatchSegment`…) are the single source of truth and are shared by construction. |

---

## 4. The split gap in ops2's list — smallest honest carry

What the customer list actually does with splits (the thing the owner asked to analyse):
parent expands **into its units instead of a spec panel**; units are rows on the same
column grid, inset one chevron-width; each unit has its own disclosure into its own
`SpecPanel`; the parent keeps its own figures; unit price cells stay empty; faults are
chipped once, at the level that owns them; `unitLabel` derives W1A/W1B.

Constraints already binding on ops2: register rows 112–126 (unit rows, split planner,
merge, add/remove, coverage sentences — all R1 scope); the §1.6 disclosure ban ("the
direction is master-detail, not collapse" — scope-fenced to *information groups*, with
the job blocks named as its whole blast radius); R4's settled prev/current/next; and the
owner's approval of the current list's look.

Two honest ways to carry splits in, smallest first:

- **4a. Master-detail (no change to the approved rows).** The list keeps exactly the
  approved `IonItem` grammar — the `parts`-drawn elevation and `· 3 joined units` already
  mark composites. Units appear on the **line surface**: selecting W04 shows, between the
  plate and the doors, its unit rows (W4A, W4B…) in the customer grammar — reference,
  product, size, no price, per-unit chips — each opening the unit's spec (and, in edit,
  the unit's `ItemForm scope="unit"`). This is the same "a composite opens into its
  units" idea relocated to where ops2 already sends detail, and it is squarely inside the
  §1.6 master-detail steer. Cost: a unit-rows block on the line plane (ops2-owned,
  mirroring `UnitRow`'s decisions via the shared helpers); the list itself is untouched.
  Risk: on the ≥1024 rail the units are only visible for the selected line — scanning
  *all* units of *all* lines requires walking lines one by one.
- **4b. In-list disclosure (the customer list's own idiom).** Add a per-row disclosure to
  the approved list: a composite's chevron opens its unit sub-rows inline, exactly as the
  builder does. This is richer at scan time and is what "the same component used
  everywhere" ultimately implies — but it changes the approved list's interaction (a
  second control per row where today the whole row is one tap-target), and it needs the
  owner to confirm the §1.6 fence: the ban was recorded against information-group
  accordions, and the customer builder's own list-disclosure was never named by it, but a
  reviewer applying the ruling literally will flag it. Not the smallest change; possibly
  the right destination under Strategy A.

Either way, the **split planner/merge/add-remove** (the decision, not the view) belongs on
the line's edit surface per register rows 115/119/121–124 — it was never a list concern
even in ops1, where `SplitPanel` renders in an expansion row of the record table.

---

## 5. Two-entry mechanics — what sharing costs, measured

- **Router: no hazard.** Verified on the branch: not one `react-router` import under
  `src/components/**` or `src/data/**` (including `accountModel.tsx`). The RR7-vs-RR5
  split is confined to the shells; `ops2-deps.test.mjs` assertion 3 (boundary doc §2.4)
  turns this from an observation into an invariant.
- **React: one version.** Single `package.json`, `react@18.3.1`; each Vite graph bundles
  its own copy (already true for ops1 vs customer pages). No hook-identity risk because
  the pages never share a runtime.
- **Bundle: the marginal cost of the list family is small; the big weights are already
  committed.** The binding `ItemForm` mandate already pulls `ItemComposer` (89 KB src),
  `configurator.ts` (32 KB), `catalogue.ts` (133 KB src, mostly the generated fallback
  data), `data/api.ts` (26 KB), `@sanity/client` (catalogue hydration — ops1's entry
  already does this, `src/ops/main.tsx`), lucide icons (tree-shaken). Adding
  `OpeningList`+`OpeningRow`+`UnitRow`+`OpeningExpansion`+`identity`+`rowState` adds
  ~1,100 source lines and **no new dependency**. `@radix-ui/react-dialog` enters only via
  `OpeningDrawer` — which nothing here proposes importing.
- **Theme/CSS: the one real bill.** Ops2 wears Ionic's default theme and owns exactly two
  style files by ruling (§1.5). `ItemForm` alone was budgeted for the
  `compat-reused-components.css` shim; the list family roughly triples what the shim must
  cover (§3.2 item 2). This cost scales with how much *face* is shared, which is exactly
  the axis the strategies below differ on.
- **Tailwind: per-graph emission works, with one condition.** Ops2's Vite config carries
  the tailwindcss plugin; utilities used by shared components are emitted into ops2's CSS
  only if ops2's CSS entry declares the same `@theme` tokens (or imports an extracted
  token file). Silent failure mode if forgotten: classes exist in the DOM, no rules exist
  in the sheet. A Playwright computed-style assertion (the §6 contrast checks already
  planned) catches it.

---

## 6. Candidate strategies

All three keep what is already settled: `ItemForm` in `LineEditor` for edit (parents and
units), price as a separate ops-owned control, split decisions on ops-owned surfaces
against the shared `opsApi` endpoints, `Elevation` everywhere a drawing appears.
They differ on the **list and view-mode face**.

### Strategy A — full surface reuse: mount `OpeningList` in ops2

Ops2's lines segment renders `OpeningList` (read-only + a new ops facts seam) over
`hydrateOpsLines`; the line plane's view mode composes `SpecPanel`/`CoverageNotice`;
splits appear in the list exactly as the builder shows them (§4b).

- **Buys:** the owner's stated end-state — "the same component used everywhere"; every
  future list improvement lands on both surfaces; the 29-test customer Playwright suite
  (`scripts/tests/web/quote-project.spec.ts`, 1,041 lines) indirectly protects ops2's
  face; the split grammar arrives whole, including the parts the mock never drew.
- **Costs:** the CSS bridge at full width (extraction of the `.quote-*` band or a ~450-line
  shim); an ops-facts slot added to shared production components — edits to files the
  referral thread is actively shipping, needing coordination and re-test; **the approved
  Ionic list look is replaced by the customer look** — a mock-gate re-approval, since the
  owner approved `LineList`'s view explicitly ("I like the view of it");
  the boundary doc's disqualifier-3 text (openings index as ops2-owned `RowList`) is
  superseded and must be amended.
- **Honest risk:** two audiences, one component. Today's shared `OpeningList` has exactly
  one variation axis (`actions?`) *because* every past divergence was a bug; ops2 makes
  divergence legitimate (ops facts, selection-not-disclosure on the rail, denser rows).
  Once the component needs `audience`-shaped props, the "one component" is two components
  in one file.

### Strategy B — engine reuse, ops2 face (mirror the grammar, share the logic)

Ops2 keeps the approved `LineList` face and its Ionic idiom. Splits carry in via
master-detail (§4a): an ops2-owned unit-rows block on the line surface, built *on the
shared helpers* (`unitLabel`, `acrossMismatch`, `compositeLabel`, `optionFullPairs`,
`Elevation`, `SpecPanel` for the unit's specification) so every fact, name and drawing is
computed by the same code, while the rows themselves are ops2 light-DOM. View mode on the
line plane mounts `SpecPanel` between the plate and the doors — the one genuinely
portable piece of the customer's read-only view — with the four doors untouched.

- **Buys:** no production-file edits, no re-approval of an approved view, no CSS-band
  extraction (the shim covers `ItemForm` + `SpecPanel`/`Elevation` only — close to what
  was already budgeted); the disclosure-ban question never arises; ships fastest.
- **Costs:** the *list layer* is mirrored, not shared — `UnitRow`'s presentation
  decisions (indent rail, no unit price, chip-once) are re-stated in ops2 and can drift.
  Bounded drift: everything that computes is shared; only arrangement can diverge, and
  the register rows pin the arrangement in words.
- **Honest risk:** this is "unified experience" in grammar and facts, not in pixels. If
  the owner's goal is literally one component, B is a waypoint, not the destination.

### Strategy C — extract the quote surface now, share it properly

Promote `OpeningList`/`OpeningRow`/`UnitRow`/`OpeningExpansion`/`identity`/`rowState`
plus the `.quote-*` CSS band into a `src/components/quote-surface/` home with its own
`quote-surface.css` (tokens consumed, not defined); both entries import it; ops seams
(facts slot, selection mode) are added as first-class API in the extraction rather than
bolted on.

- **Buys:** the clean end-state of A without A's bolt-on seams; the CSS gets one home
  instead of a shim restating it; future surfaces (customer PDFs? emails? R4 projects
  index) inherit it.
- **Costs:** the largest diff of the three, on a production surface mid-flight — the
  boundary doc already rejected exactly this relocation "until the dev lines merge"
  (§8, third rejected alternative), and that reasoning has not changed; full regression
  of the customer quote/record/review pages; mock-gate re-approval as in A.
- **Honest placement:** right destination, wrong moment. C is what A becomes when the
  referral branch merges; choosing B now does not foreclose C later, because B shares
  every function C would share and adds no second implementation of any *rule*.

**Sequencing note for whichever is chosen:** the ops2 record API should serve lines in
(or trivially adaptable to) the `ApiItem` nested shape — `worker/lib/orders.ts` already
proved that shape across stages; keeping ops2's DTO congruent is what keeps every
strategy's data adapter at ~15 lines and preserves the "one line model" fact the customer
side just fought to establish.

---

## 7. Corrections to the record

- `Editor.tsx`'s "form controls are Ionic's" header (mock) contradicts register row 95
  and boundary doc §1.1/§1.2. The mock is not a spec; the boundary doc and the owner's
  new instruction agree. No developer should implement from `Editor.tsx`.
- The owner's "once that is implemented in viewing submitted quotes view" — implemented
  and shipped (`RecordDetailPage.tsx:406/546`, `QuoteReviewPage.tsx:209`). The mirror
  exists to be pointed at.
- `OPEN-DEFECTS.md` open decision 4 (the line note's four names) will surface in any
  reuse: `SpecPanel`'s host renders the note under the label "Note", ops1 calls it
  `room`. Worth settling before ops2 renders it.

## 8. Test evidence

- The "tested experience" claim is substantiated: `scripts/tests/web/quote-project.spec.ts`
  (1,041 lines, 29 tests) covers row grammar, expansion-inspects-only, composite
  children, unit fault attribution, drawer dialog semantics, and the no-add-unit rule.
- Any strategy's ops2 work lands its assertions in the already-designed ops2 Playwright
  files (`ops2-record.spec.ts` / `ops2-edit.spec.ts`, boundary doc §6): unit rows
  visible for a composite, unit spec reachable, `ItemForm scope="unit"` saves through
  `opsPatchSegment`, and — if Strategy A/C — computed-style checks that the token bridge
  actually painted the shared components.

## 9. Security

No new sensitive surface in this investigation. All strategies are presentation-layer
recomposition over existing authenticated ops endpoints; the authorization model of
`/api/ops/*` is unchanged, and no customer-facing surface gains any ops-only fact
(`priceCalculated`, margins) — note that Strategy A must keep ops facts in the *ops seam*,
never added to the shared component's customer-rendered path.
