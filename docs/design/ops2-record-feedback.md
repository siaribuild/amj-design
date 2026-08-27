# ops2 record feedback — design

Architect · 2026-08-28 · Branch `fix/ops2-testing-feedback` (off `main`).
Inputs, binding: `docs/specs/ops2-record-feedback.md` (FB-AC-1…46, N1–N5, X1–X5) and
`docs/specs/ops2-record-feedback-grill-conclusions.md`. Neither is re-derived here.

**State of the branch when this design was written** — two defects are already fixed on it,
test-first, and this design incorporates them rather than re-planning them:

- **Defect 7 is DONE and committed** (`25e26ea2`): the break group is emitted before the width
  figure in `src/components/quote-project/Elevation.tsx` (now lines ~170–195), the two gate
  rules are ported into `src/ops2/styles/record.css:49-52`, and a node test asserts the
  document order in `scripts/tests/ops2-record.test.mjs` (~line 1149). One defect in that
  commit: the node test is labelled **FB-AC-33** but discharges **FB-AC-34** — slice 8 renames
  the label.
- **Defect 2 is DONE in the working tree**: `record.css:171-175` now reads
  `top: calc(-1 * var(--ops2-band-top))`, and `scripts/tests/web/ops2-record-feedback.spec.ts`
  exists with FB-AC-10/11/12 plus the staff-auth harness (`u_staff6` added to
  `scripts/db/seed.sql`). Slice 1 is "commit this".
- `docs/mocks/ops2-record-feedback.html` exists (the ui stage's mock for the three visual
  decisions). The mock gate governs slices 4 and 6 below.

---

## 1. The one real decision: the shared row is the plain `<li>/<button>` — the spec's ASSUMED stands

The alternative was evaluated seriously: make the shared row an `IonItem` everywhere, so all
three surfaces gain the platform target, ripple and chevron instead of the queue losing them.
It loses on four independent grounds:

1. **The invariant cannot be structural on `IonItem`.** Defect 1's invariant — *the hover wash
   and the leading status edge paint on the same element* — is guaranteed by a plain button by
   construction: there is only one element, so there is nowhere else for either to go. On
   `IonItem` the same invariant holds only by suppressing Ionic's own hover machinery
   (`--background-hover-opacity: 0`) and repainting wash + edge onto the shadow part
   `::part(native)` — which is exactly what `projects.css:376-392` already does, and exactly
   the convention-not-structure arrangement that produced defect 1 when it wasn't carried from
   the queue to the record. A guarantee that lives in override CSS against a third-party shadow
   DOM is one Ionic minor version away from silently breaking.
2. **The binding boundary doc already rules for light DOM here.** `docs/design/
   ops2-ionic-boundary.md` §1.1: disqualifier 3 (dense row grammar under direct token control —
   its own example is the openings index this record list *is*) and disqualifier 2 (behavioural
   contradiction — IonItem's hover overlay measurably erases the inset edge, the worked-around
   contradiction above). `rows.tsx:107-112` already cites disqualifier 3 for the card's inner
   grammar; this design extends the citation to the whole row and records it in ADR 0014.
3. **IonItem-everywhere changes two owner-accepted surfaces; the plain row changes one.**
   FB-AC-9 pins the record rows' and unit rows' content unchanged; `IonItem detail` would give
   both a chevron (or the component grows a `detail` mode flag to suppress it — the first of
   the mode-flag ladder ponytail forbids). The plain row changes only the queue card, which is
   precisely the change the spec flags for owner veto in §13.
4. **Testability.** FB-AC-1/2/7's assertions (same-element computed styles; exactly one
   interactive element with no interactive descendant) are direct DOM queries in light DOM and
   shadow-piercing gymnastics on `IonItem` (see the workaround already needed at
   `ops2-projects.spec.ts:533`).

What the ripple actually did — press feedback on touch — is kept by one declaration: an
`:active` wash on the press element (§3). The chevron, whole-row target, `data-waiting` edge
colours and card content are all kept by name (spec §4 regression table). The `ASSUMED:` tag in
spec §13 stays live for the owner's veto at sign-off; this design's position is that the
assumption is **correct**.

Recorded as **`docs/adr/0014-ops2-shared-row-is-light-dom.md`** (new, slice 2): the decision,
the two disqualifiers by number, and that it supersedes the `IonItem`-owns-the-target
arrangement described in `rows.tsx:107-112`'s comment.

---

## 2. Module boundaries — the shared row and list

### 2.1 The component: `src/ops2/chrome/RowList.tsx` (new file, two exports)

It lives in `chrome/` beside `OpsPage`/`SidePanel`/`DrawingViewer` — the existing home for
ops2 components shared across surfaces. No new directory.

```tsx
/** The one list container (FB-AC-5's container token: `ds-row-list`). */
export function RowList({ className, testId, children }: {
  className?: string;            // card chrome is composed on, not owned: `ds-surface-card`
  testId?: string;
  children: ReactNode;
}): JSX.Element;                 // <ul className={`ds-row-list ${className}`} data-testid=…>

/** The one row (FB-AC-5's row token: `ds-row`; press token: `ds-row__press`). */
export function Row({ edge, selected, chevron, onActivate, pressTestId, children, ...rest }: {
  /** What the leading edge paints, or nothing. WHICH FACT it means stays the
   *  caller's (FB-AC-9): the queue maps waitingOn, the record maps needsReview,
   *  the units pass nothing. */
  edge?: "warning" | "info" | null;
  /** Desk selection: brand tint + brand edge on the press, aria-current on the row. */
  selected?: boolean;
  /** Trailing chevron — rows that NAVIGATE. The queue's card; nothing else today. */
  chevron?: boolean;
  onActivate: () => void;
  /** Lands on the button — ops2-drawing-viewer.spec.ts presses `line-unit-open`. */
  pressTestId?: string;
  children: ReactNode;
  // ...rest (data-*, aria-*) spreads on the <li>: keeps `data-testid="queue-row"`,
  // `data-waiting`, `data-flagged`, `data-testid="record-line"` for existing suites.
}): JSX.Element;
```

Rendered shape — this is the invariant made structural, so it is stated once here and never
per call site:

```html
<li class="ds-row" data-selected? aria-current?>
  <button type="button" class="ds-row__press" data-edge?>   ← wash, edge AND tint all here
    {children}                                              ← the surface's own grammar
    {chevron && <svg class="ds-row__chev" …/>}
  </button>
</li>
```

One interactive element, no interactive descendant, no `aria-expanded` (FB-AC-7). `Row` never
grows a per-surface boolean beyond these three props, each of which names a real grammar
difference (edge meaning, selection, navigation), not a styling switch. If a future surface
needs a fourth, the decision is reopened — comment in the file says so.

### 2.2 What stays per-surface

- **Queue card** (`src/ops2/projects/rows.tsx:113-156` → `ProjectCards`): the `.pq-card` inner
  grammar untouched (`projects.css:403+`); the waitingOn→edge mapping
  (`"Us"→"warning"`, `"Customer"→"info"`); `chevron` on. `IonList`/`IonItem`/`IonLabel`
  imports go; `Flags`, `useOpenRow`, `recordPath` untouched. The `IonItem`-era comment block at
  `rows.tsx:98-112` is rewritten to cite ADR 0014.
- **Record line row** (`src/ops2/projects/lines.tsx:40-104` → `LineRow`): children unchanged
  (`.rl-elev`/`.rl-main`/`.rl-end` spans); `edge={needsReview(line) ? "warning" : null}`,
  `selected`, `data-flagged`, `data-testid="record-line"` on the row. The `<ul
  className="rl-list">` in `RecordLines` (line 161) becomes
  `<RowList className="ds-surface-card" testId="record-lines">`.
- **Unit row** (`src/ops2/projects/LineReview.tsx:135-181` → `Units`): children unchanged
  including the `ops2-sr-only` prefix span (its accessible-name behaviour is load-bearing);
  no edge, no chevron, `pressTestId="line-unit-open"`. The `<ul className="lp-units__list">`
  becomes `<RowList className="lp-units__list">` — **keep the `lp-units__list` class**: the
  `:has()` rules at `line.css:417-423` key on it.
- **The queue's desk `<table>`** (`rows.tsx:173-238`): untouched. FB-AC-N1.

### 2.3 What the queue keeps, mechanically

Spec §4's regression table, mapped to the new shape: chevron → `chevron` prop; whole-row
activation → `onActivate` (was `IonItem onClick`); `data-waiting` colours → `edge` mapping plus
the passthrough attribute for test selectors; 44 px floor → recipe (§3); `aria-current` →
`selected`.

---

## 3. The CSS layer — `src/ops2/styles/recipes/row.css` (new recipe)

Imported in `src/ops2/styles/index.css` after `./recipes/surface.css` (line ~124). It owns
**the list grammar and the row treatment, and nothing else**:

```css
/* Container: rhythm and clipping (FB-AC-8). NO card chrome — that is
   surface.css's fact; compose `ds-surface-card` at the call site. */
.ds-row-list { margin: 0; padding: 0; list-style: none; overflow: hidden;
               border-radius: inherit; }
.ds-row { display: block; }
.ds-row + .ds-row { border-top: 1px solid var(--ds-border-subtle); }   /* pair's hairline */

/* THE INVARIANT LIVES HERE AND ONLY HERE: wash, edge and tint are all declared
   on .ds-row__press. This recipe contains no background and no box-shadow on
   .ds-row or .ds-row-list — a child cannot cover what is painted on itself. */
.ds-row__press { /* the nine shared declarations from record.css:275-288 */
  display: flex; align-items: center; gap: var(--theme-spacing-sm);
  width: 100%; padding: var(--theme-spacing-sm) var(--theme-spacing-md);
  background: none; border: 0; text-align: left; font: inherit; color: inherit;
  cursor: pointer;
  min-height: 44px;                    /* the unit row's hit floor, for every row */
}
.ds-row__press:focus-visible { outline-offset: -2px; }   /* the group clips; ring stays in */
@media (hover: hover) { .ds-row__press:hover { background: var(--ds-color-brand-wash); } }
.ds-row__press:active { background: var(--ds-color-brand-wash); }  /* the ripple's one job */

.ds-row__press[data-edge="warning"] { box-shadow: inset 3px 0 0 var(--ds-color-warning); }
.ds-row__press[data-edge="info"]    { box-shadow: inset 3px 0 0 var(--ds-color-info); }

/* Selection AFTER the edge rules, so the brand edge wins on a flagged+selected
   row — the precedence record.css:533-534 already has. */
.ds-row[data-selected] > .ds-row__press {
  background: var(--ds-color-brand-wash);
  box-shadow: inset 3px 0 0 var(--ds-color-brand);
}
```

Unit-row divergence stays in `line.css` exactly as its comment already promises: the grid, the
top alignment (`line.css:428-436` minus the now-recipe `min-height`/focus rules).

**Deleted, because the recipe owns them now** (each deletion is part of its migration slice):
`record.css` — `.rl-list` block (~270-280 in the current file), `.rl-row + .rl-row`, the
`.rl-row[data-flagged]` edge, the `.rl-open, .lp-unit__open` shared block and its hover
(~294-311), `.rl-row[data-selected]` pair (file end). `projects.css` — the `.pq-cards` card
chrome (367-374 → call site composes `ds-surface-card`; keep the bare `.pq-cards` class for
the `ops2-projects.spec.ts:410` locator), the whole `.pq-cards ion-item` block (375-402).
`line.css` — `.lp-unit` hairline rules (406-409), the recipe-duplicating halves of
`.lp-unit__open` (432-436, 439).

The precedent this generalises — `record.css`'s "same selector rather than a second copy"
comment for `.rl-open, .lp-unit__open` — is retired in favour of the recipe; the comment moves
to `row.css`'s header.

---

## 4. Defect 2 — the band's rest position (DONE, working tree)

`record.css:171-175`: `top: calc(-1 * var(--ops2-band-top))`. `--ops2-band-top` is defined on
`.ops2-page__band` itself (`projects.css:70-72`) so the custom property resolves on the same
element. `ProjectRecordPage.tsx:222`'s `bandPinned={!!record}` is deliberately untouched: with
the offset equal to the pull, pinned and unpinned rest identically, which is what FB-AC-11
asserts. Slice 1 commits this with its three tests.

---

## 5. Defects 3+4 — the attention band, restored to the mock

All CSS, in `record.css`'s `.rec-attention` block (~180-220 in the current file). The markup
(`AttentionRow`, `ProjectRecordPage.tsx:628-674`) does not change in this slice.

- `background: var(--ds-color-warning-subtle)` on `.rec-attention` — **the base class, all
  three `data-kind` states** (FB-AC-13/14). The state stays on the dot
  (`record.css` dot rules, kept as-is).
- `min-height: 40px; padding: var(--theme-spacing-2xs) var(--theme-spacing-md)` (FB-AC-18).
- `border: 0; border-bottom: 1px solid var(--ds-border-subtle)` — replaces today's
  `border-top` (FB-AC-17). To avoid a doubled 2 px line where the band's own `border-bottom`
  (`projects.css:80`) meets it: `.ops2-page__band:has(.rec-attention) { border-bottom: 0; }`
  (`:has` precedent: `line.css:417`). The attention row *is* the band's closing edge, which is
  the mock's construction.
- Full bleed, **scoped to the band** (FB-AC-15 is a 390 px criterion):
  `.ops2-page__band .rec-attention { width: calc(100% + 2 * var(--theme-spacing-lg));
  margin-inline: calc(-1 * var(--theme-spacing-lg)); }` — the negation of the band's own
  inline padding (`projects.css:76-78`). At desk the row keeps the toolbar's padding; desk
  feedback is explicitly pending (spec §1 out-of-scope) and the tint itself shows at both
  widths.
- The action word (`.rec-attention__act`): `color: var(--ds-text-primary)`,
  `font-weight: var(--theme-font-weight-semibold)`, `text-decoration: underline`,
  `text-underline-offset: 2px` — ink, not `--ds-text-link` (FB-AC-19, the mock's own 4.34:1
  measurement is the reason).
- FB-AC-16 (flush under the tab rail): expected free once the tint exists — `.rec-attention`
  has `margin: 0` and the band no bottom padding. If the `.pq-controls` 2 px indicator
  clearance opens a gap at 390, absorb it with a negative `margin-top` on
  `.ops2-page__band .rec-attention` — the test decides.
- FB-AC-20 needs no new rule: `.rec-refusal` is untouched and `.rec-attention` gains nothing
  from the error family.

Mock gate: this slice is the mock's `.filterrow` treatment; `docs/mocks/ops2-record-feedback.html`
must be approved before the slice builds.

---

## 6. Defect 5 — the filter means "everything requiring attention"

One predicate, one place — `src/ops2/projects/record.ts`:

```ts
/** ONE MEANING OF "ATTENTION" ON THIS SURFACE (grill Q4): exactly the set the
 *  list marks — the leading-edge/badge predicate, plus the missing money. */
export function needsAttention(line: RecordLine): boolean {
  return needsReview(line) || line.lineTotal == null;
}
```

- `visibleLines` (`record.ts:497`): `filterOn ? record.lines.filter(needsAttention) : […]`.
- `attentionFor` (`record.ts:447-493`) — the two line blockers become:
  1. `key: "attention"`, `count = lines.filter(needsAttention).length`, `action: "show only
     these"`, text `` `${n} line${n === 1 ? " needs" : "s need"} attention` `` — replaces both
     the `unpriced` and the old `review` blockers (FB-AC-21/22/23).
  2. `key: "notReady"`, `count = lines.filter((l) => !needsAttention(l) &&
     BLOCKING_STATUSES.has(l.status)).length`, `action: null`, text
     `` `${n} line${n === 1 ? " is" : "s are"} not ready to issue` `` — the priced,
     badge-less, gate-refused residue. The `!needsAttention` clause is what makes
     double-counting impossible (FB-AC-26).
  Delivery blocker and the `clear`/`no-lines` sentences unchanged (FB-AC-28). Ordering stays
  attention → notReady → delivery.
- `AttentionRow` (`ProjectRecordPage.tsx:642-644`): the filter-on branch keys on
  `lead.key === "attention"` and reads `` `Showing ${n} line${n === 1 ? " that needs" : "s
  that need"} attention` ``; action word `show all` unchanged (FB-AC-24). FB-AC-25 holds by
  construction: the sentence's count and the list's rows both come from `needsAttention`.
- `lines.tsx:129`: filtered-empty headline becomes `No lines need attention now.`; the clear
  control's sentence unchanged (FB-AC-27).
- Untouched by name: `RecordTotals` and `cornerFigure`'s "no rate" vocabulary
  (`ProjectRecordPage.tsx:696-698, 714-718`; FB-AC-N2), the desk canvas filtered-empty
  sentence (`ProjectRecordPage.tsx:451-453`).
- The `Blocker` key union in `record.ts` updates to `"attention" | "notReady" | "delivery"`.

**CONTEXT.md** (architect-owned, this slice): the **Attention filter** entry (~line 205)
currently says the filter narrows "to the lines with no rate" — it sharpens to "to every line
requiring attention: the same `needsReview`-or-unpriced predicate that paints the row's
leading edge and badge; one meaning of attention per surface".

---

## 7. Defect 6 — the disabled CTA

CSS only, `record.css` `.rec-cta__primary.button-disabled` (currently ~72-80):

```css
.rec-cta__primary.button-disabled {
  --background: var(--ds-surface-card);
  --color: var(--ds-text-secondary);
  border: 1px solid var(--ds-border-strong);
  border-radius: var(--ds-radius-control);
  opacity: 1;              /* replaces the 0.9 override; FB-AC-31's contrast is then direct */
}
```

No error token anywhere on the control (FB-AC-29); the 1 px `--ds-border-strong` border on a
card background satisfies FB-AC-30 against the white band; `--ds-text-secondary`
(`neutral-600`) on card white clears 4.5:1 at full opacity (FB-AC-31). The refusal sentence
`.rec-refusal` and the accessible-name/refusal wiring (`ProjectRecordPage.tsx:238-247,
163-170`) are untouched (FB-AC-32/33). The exact tokens are the ui stage's to tune inside
FB-AC-29..31 — the mock carries this state; treat the above as the default that ships if the
mock gate approves it as drawn.

---

## 8. Defect 7 — Elevation paint order (DONE, committed) and what it means elsewhere

What moved (`25e26ea2`): inside `DimGroups`' width group, the `{wide && <g
class="elev-break">}` block now precedes the width `<text class="elev-dim">`; the figure's
existing `paint-order: stroke` halo (`Elevation.tsx:127-128`) punches through the break. The
double gate is untouched: the component still computes `data-wide` (`Elevation.tsx:~585`), and
`src/styles/theme.css:904-907` still means *customer site: break hidden ≥768 px, shown <768 px
on wide drawings* — unchanged, and now ported verbatim into `record.css:49-52` so ops2 draws
the same conditions (FB-AC-36).

**Customer surfaces to re-check** (every consumer of the reordered component):
- `src/components/quote-project/OpeningExpansion.tsx:107` — the expanded opening; draws
  leaders; the one where the customer bug was visible.
- `src/components/ItemComposer.tsx:136` — the in-form drawing.
- `src/components/quote-project/OpeningRow.tsx:103` and `UnitRow.tsx:83` — `xs`/square rows;
  leaders suppressed, expected no-op, checked anyway.
FB-AC-37 lands in `scripts/tests/web/quote-project.spec.ts` (375 px: break shown + figure not
overpainted; 1280 px: break hidden). FB-AC-35/36's ops2-side assertions land in
`ops2-record-feedback.spec.ts` against the line page's plate (3500 × 700 at 390 and 1280, and
a 1200 × 900 control that emits no group).

---

## 9. Defect 8 — the door is always there

### 9.1 Copy — `src/ops2/projects/whyCopy.ts`

- Extract the shared literal: `export const NO_SELECTION = "no selection was made on this
  line";` — used by `panelCopy`'s unresolved branch (line 348, currently inline) **and** the
  detail (FB-AC-42.3 requires the two surfaces cannot drift; one const is how).
- `panelCopy`: the three `door: null`s (lines 351, 361, 381) become one shared string,
  `DOOR_ABSENT` — proposed wording (ASSUMED, §13 of the spec covers it):
  `"Why this product — open what was recorded for this line"`.
- `DETAIL` gains three strings (FB-AC-42; wording ASSUMED):
  `notRecordedForLine: "Not recorded for this line."`,
  `thisLinesFigures: "This line's figures"`,
  `noAlternatives: "No alternatives were recorded for this line."`.

### 9.2 The detail — `src/ops2/projects/WhyDetail.tsx`

- The guard widens: `open && !!dto` (line 35-38's `recommendation`-only filter goes);
  `Body` renders for `kind === "recommendation"` unchanged (FB-AC-41), a new `AbsenceBody`
  for the other three kinds, in FB-AC-42's exact order:
  1. the `chosenLine(dto).text` sentence — **the same function the panel calls**, so verbatim
     by construction;
  2. `<Block heading={DETAIL.hadToMeet}>` → `DETAIL.notRecordedForLine`;
  3. figures: `human` with units → the existing `Bands` component (lines 204-237) reused
     whole; `human` without units and `unrecorded` → `<Block
     heading={DETAIL.thisLinesFigures}>` with the words `figuresRow(dto.current.figures)`
     already produces (absence reads `not recorded`); `unresolved` → same block, body
     `NO_SELECTION`, never a figure;
  4. `<Block heading={DETAIL.ladder}>` → `DETAIL.noAlternatives`;
  5. `DETAIL.closing`, unchanged.
- Still zero interactive elements beyond back (FB-AC-43) — `AbsenceBody` contains only
  headings and paragraphs.

### 9.3 The address — `src/ops2/projects/LinePage.tsx` and `lineRoute.ts`

- `LinePage.tsx:81`: `hasWhy = rationale.status === "ready"` — any kind (FB-AC-38/40). Order
  records still answer `missing` (D2, `useLineRationale.ts:100`), so their `/why` still
  normalises away (FB-AC-N4); `parseLineRoute` itself is unchanged.
- `lineRoute.ts`: add `export const WHY_FROM_RECORD = { whyFrom: "record" } as const;` and
  widen `whyDoor` to return `"line" | "record" | null` (mirroring `viewerDoor`, lines
  110-117). `closeChild` (`LinePage.tsx:230`) already truth-tests it; no change there.
- `WhyDetail`'s `backLabel` (`LinePage.tsx:300`): `whyDoor(location.state) === "record" &&
  record ? record.ref : (line?.code || "Line")` — the record named by its reference, the
  vocabulary the viewer door already settled (`LinePage.tsx:141-146`; FB-AC-45).

### 9.4 The canvas — `src/ops2/projects/ProjectRecordPage.tsx`

- One new hook call at top level, beside the record's other state:
  `const { load: whyLoad, reload: reloadWhy } = useLineRationale(id, selectedLineId ?? "",
  wide && !!selected && !record?.orderNo);` — enabled only when the canvas is showing a
  quote line, which is what keeps FB-AC-N4 (no request on order records) and FB-AC-N5 (the
  one existing GET, once per selected line) true. No new endpoint, no new parameter.
- Line 446: `why={null}` becomes
  `why={<WhyPanel load={whyLoad} onOpen={openWhy} reload={reloadWhy} />}` where `openWhy` is
  the record's own: `history.push(linePath(selected.id) + WHY_SUFFIX, WHY_FROM_RECORD)` —
  the `openDrawing` seam (lines 209-211) copied for the second door (FB-AC-44/45). The
  long `why={null}` rationale comment (lines 432-442) is replaced by one citing FB-AC-44's
  supersession of WHY-AC-43.
- Lines 523-526: the `Why this product? — …arrives on this page next` pending block is
  deleted (FB-AC-46). The `Edit` pending line stays.
- FB-AC-N3 needs no code: `/why` and `/drawing` are exclusive by `parseLineRoute`'s grammar.

---

## 10. Build slices (one developer session each; every path it touches, in order)

Each slice is red → green under Probity and independently verifiable. Slices 4 and 6 wait for
the mock gate on `docs/mocks/ops2-record-feedback.html`; everything else may proceed.

**Slice 1 — commit the band fix (defect 2). Working tree already green.**
Files: `src/ops2/styles/record.css` (done), `scripts/tests/web/ops2-record-feedback.spec.ts`
(FB-AC-10/11/12, done), `scripts/db/seed.sql` (u_staff6, done). Verify: FB-AC-10/11/12 pass.

**Slice 2 — the shared row, record list first (tracer for defect 1).**
Files: `src/ops2/chrome/RowList.tsx` (new), `src/ops2/styles/recipes/row.css` (new),
`src/ops2/styles/index.css` (one `@import`), `src/ops2/projects/lines.tsx` (LineRow +
RecordLines onto Row/RowList), `src/ops2/styles/record.css` (delete the migrated `.rl-*`
paint rules per §3), `docs/adr/0014-ops2-shared-row-is-light-dom.md` (new),
`CONTEXT.md` (one new Ops-console entry: **List row** — the shared pressable row + container),
`scripts/tests/web/ops2-record-feedback.spec.ts` (FB-AC-1, FB-AC-2, FB-AC-6/7/8 for the
record surface), `scripts/tests/web/ops2-record.spec.ts` (selector updates if any assert
`.rl-open`). Verify: FB-AC-1/2 + record-scope 6/7/8.

**Slice 3 — the queue's phone card onto the shared row.**
Files: `src/ops2/projects/rows.tsx` (ProjectCards; IonItem/IonList out), 
`src/ops2/styles/projects.css` (delete 367-402's migrated halves; keep `.pq-card` grammar and
the bare `.pq-cards` hook), `scripts/tests/web/ops2-record-feedback.spec.ts` (FB-AC-3,
FB-AC-N1), `scripts/tests/web/ops2-projects.spec.ts` (rewrite the shadow-root reach at ~533;
re-run the file whole — it owns the queue). Verify: FB-AC-3/N1 + ops2-projects.spec.ts green.

**Slice 4 — the unit rows onto the shared row (closes FB-AC-5).**
Files: `src/ops2/projects/LineReview.tsx` (Units onto Row/RowList),
`src/ops2/styles/line.css` (delete 406-409, thin 428-439 to the grid-only divergence),
`src/ops2/styles/record.css` (retire the `.lp-unit__open` shared-selector mentions),
`scripts/tests/web/ops2-record-feedback.spec.ts` (FB-AC-4, FB-AC-5 across all three
surfaces, FB-AC-6/8 for the unit list), `scripts/tests/web/ops2-drawing-viewer.spec.ts`
(confirm `line-unit-open` selectors still bind; update only if red). Verify: FB-AC-4/5.

**Slice 5 — the attention band restored (defects 3+4). Mock gate first.**
Files: `src/ops2/styles/record.css` (§5's `.rec-attention` rules + the band `:has`),
`scripts/tests/web/ops2-record-feedback.spec.ts` (FB-AC-13…20). Verify: those eight.

**Slice 6 — the filter and its words (defect 5).**
Files: `src/ops2/projects/record.ts` (`needsAttention`, `visibleLines`, `attentionFor`,
`Blocker` keys), `src/ops2/projects/ProjectRecordPage.tsx` (AttentionRow filter-on branch),
`src/ops2/projects/lines.tsx` (filtered-empty headline), `CONTEXT.md` (Attention-filter entry
per §6), `scripts/tests/ops2-record.test.mjs` (update the assertions at ~255-300, ~404-418,
~820-850 to the new predicate and copy — red first), `scripts/tests/web/
ops2-record-feedback.spec.ts` (FB-AC-21…28, FB-AC-N2), `scripts/tests/web/ops2-record.spec.ts`
(the "no rate" attention-copy assertions at ~305, ~550 update; totals/corner assertions at
215-223 stay as-is — they are FB-AC-N2's evidence). Verify: `npm run test:ops2` + the new web
tests.

**Slice 7 — the disabled CTA (defect 6). Mock gate first (same mock as slice 5).**
Files: `src/ops2/styles/record.css` (§7), `scripts/tests/web/ops2-record-feedback.spec.ts`
(FB-AC-29…33; 33 re-asserts the existing aria-label/refusal wiring). Verify: those five.

**Slice 8 — the door on every kind (defect 8, line-page half).**
Files: `src/ops2/projects/whyCopy.ts` (NO_SELECTION, DOOR_ABSENT, three DETAIL strings),
`src/ops2/projects/WhyDetail.tsx` (guard + AbsenceBody), `src/ops2/projects/LinePage.tsx`
(`hasWhy`), `scripts/tests/ops2-why.test.mjs` (the `door: null` assertions at 211/245/252/284
flip to DOOR_ABSENT; new DETAIL strings asserted — red first),
`scripts/tests/ops2-record.test.mjs` (rename the mislabelled `FB-AC-33` break test to
`FB-AC-34`), `scripts/tests/web/ops2-line-why.spec.ts` (FB-AC-38/39/40/41/42/43; rewrite
WHY-AC-10/41's "offers no door" test at ~299 and WHY-AC-7d at ~761 — its no-detail line must
now be an order-record line, per FB-AC-N4). Verify: `npm run test:why` + the why web file.

**Slice 9 — the canvas carries the panel (defect 8, record half).**
Files: `src/ops2/projects/lineRoute.ts` (`WHY_FROM_RECORD`, `whyDoor` widened),
`src/ops2/projects/LinePage.tsx` (backLabel per §9.3),
`src/ops2/projects/ProjectRecordPage.tsx` (hook + `why` prop + FB-AC-46 deletion),
`scripts/tests/ops2-navigation.test.mjs` (whyDoor assertions at ~326-329 widen — red first),
`scripts/tests/web/ops2-line-why.spec.ts` (FB-AC-44/45/46, FB-AC-N3/N4/N5; rewrite
WHY-AC-43's canvas test at ~555 into FB-AC-44's assertion, per the spec's supersession).
Verify: `npm run test:ops2` + the why web file.

**Slice 10 — the break criteria that need a browser, both consoles.**
Files: `scripts/tests/web/ops2-record-feedback.spec.ts` (FB-AC-35, FB-AC-36),
`scripts/tests/web/quote-project.spec.ts` (FB-AC-37). Code is already shipped (slice 0/§8);
this slice is proof. Verify: those three.

**Security regression slice (folded into 6 and 8/9, listed for the map):** FB-AC-X1 lives in
`ops2-record.spec.ts` (present — the 403 path via `useProjectRecord`; extend if the tester
finds it thinner than AC-X1); FB-AC-X2/X3 live in `ops2-line-why.spec.ts` (the byte-identical
refusal and cross-project probe re-runs, extended for the second door in slice 9);
FB-AC-X4/X5 are review-executed criteria over the diff, not test files.

---

## 11. Test plan — every named file exists or is created above

| File | Status | Discharges |
|---|---|---|
| `scripts/tests/web/ops2-record-feedback.spec.ts` | **exists (working tree), grows** | FB-AC-1…9, N1, 10–12 (done), 13–20, 21–28, N2, 29–33, 35, 36 |
| `scripts/tests/web/ops2-line-why.spec.ts` | exists, updated | FB-AC-38–46, N3, N4, N5, X2, X3 (+ WHY-AC-10/41, 7d, 43 rewrites) |
| `scripts/tests/web/ops2-projects.spec.ts` | exists, updated | queue regressions around FB-AC-3/N1 |
| `scripts/tests/web/ops2-record.spec.ts` | exists, updated | old-copy updates; FB-AC-X1 (existing 403 coverage) |
| `scripts/tests/web/quote-project.spec.ts` | exists, updated | FB-AC-37 |
| `scripts/tests/web/ops2-drawing-viewer.spec.ts` | exists, touched only if selectors break | unit-row regression |
| `scripts/tests/ops2-record.test.mjs` | exists, updated | FB-AC-21/23/24/26/28 at model level; FB-AC-34 (relabel) |
| `scripts/tests/ops2-why.test.mjs` | exists, updated | FB-AC-38/42 at copy level |
| `scripts/tests/ops2-navigation.test.mjs` | exists, updated | whyDoor widening (slice 9) |

No `package.json` change: every node file above is already wired into `test:pure`/`test:ops2`
and every `.spec.ts` is matched by `playwright.config.ts`'s `testMatch`. No new node file is
created; the one new web file is already in the tree.

Geometric criteria are asserted as the spec §3 dictates (rects, computed styles,
document-order + bounding-box intersection) — the working-tree FB-AC-10/11/12 tests are the
house pattern to copy.

---

## 12. Security

**No new sensitive surface — spec §11 confirmed against the code, not repeated.** Verified
while designing: no route, query, column, migration or write is touched anywhere in §§2–9;
every change is presentation, copy, or a client-side predicate over data the staff-gated
record endpoint already returns. The single flow change is the one §11 names: the record's
desk canvas becomes a second caller of the existing
`GET /api/ops/projects/:id/lines/:lineId/rationale`, same `resolveStaff` gate, same DTO, line
ids taken from the record the same session fetched (§9.4 — the `enabled` flag is what keeps
order records from ever issuing it). Data classification: commercial (pricing/rationale),
staff-only, unchanged. Trust boundaries: ops ↔ Worker only; nothing customer-facing moves
except the Elevation paint-order fix, which removes a rendering defect and transfers no data.
Authorization: no endpoint changes, so no new scoping filter to name; the regression guards
FB-AC-X1–X5 hold the existing gates, and X3 specifically holds that the new door cannot become
a cross-project probe (the line resolves through project A's record; a foreign line id is
indistinguishable from a nonexistent one — `useLineRationale.ts:56-58`). Abuse cases beyond
those: none introduced — no write is added (X5), no enumeration surface widens (the address
grammar is unchanged), no replay surface exists (GETs only).

---

## 13. Rejected alternatives

- **`IonItem` as the shared row** — §1. Rejected: the invariant becomes conventional
  (suppressed overlay + `::part` repaint) instead of structural; contradicts boundary-doc
  disqualifiers 2 and 3; changes two accepted surfaces instead of the one the spec flags;
  harder to test. The ripple's job is kept by one `:active` declaration.
- **Card chrome inside the row recipe** — rejected; `surface.css` already owns it (one place
  per fact), and the unit list must be a `ds-row-list` *without* card chrome to avoid a card
  inside its panel.
- **Recipe painting from surface facts (`data-waiting`, `data-flagged`) directly** — rejected;
  the recipe would then know every surface's vocabulary. The caller maps its fact to `edge`;
  the fact stays per-surface (FB-AC-9).
- **A per-kind door sentence for the three no-door kinds** — rejected; the three kinds open
  the same absence-stating structure, so one accessible name (`DOOR_ABSENT`) is honest and
  three variants would be dead flexibility. The recommendation kind keeps its three
  content-derived door strings (`whyCopy.ts:415-418`), which do differ behind the door.
- **`WhyPanel`/`WhyDetail` mode props for the canvas** — rejected; the canvas reuses both
  components untouched. Only the page-owned address push differs, which is the `openDrawing`
  seam already in place.
- **Fixing the band by unpinning or by moving `bandPinned`** — rejected in the working-tree
  fix already: FB-AC-12 exists precisely to kill the unpinning "fix".
- **A new `src/ops2/components/` directory** — rejected; `chrome/` is the existing shared
  home and a second home for the same kind of thing is how the next component lands in the
  wrong one.

## Decisions needed

**None.** The IonItem question is resolved above (§1) and stays owner-vetoable through the
spec's §13 `ASSUMED:` tag at sign-off; the second `ASSUMED:` (wording — §6's copy table,
§9.1's three DETAIL strings and `DOOR_ABSENT`) is likewise carried to sign-off, not held open.
