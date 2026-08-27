# ops2 project record — TESTING FEEDBACK (defect fix)

**Date:** 2026-08-28 · **Stage:** pipeline stage 1 (spec) · **Revision 1**
**Grill input:** `docs/specs/ops2-record-feedback-grill-conclusions.md` — complete, frontier
empty. Its actor, its eight root causes and its DECISIONs are binding here and are **not**
re-derived. Every file:line in it was reproduced by measurement.
**Branch:** `fix/ops2-testing-feedback`, off `main` (`c30d2f44`).
**Corrects:** the surface `docs/specs/ops2-record-correction.md` built (`P1-AC-*`), plus two
criteria of `docs/specs/ops2-why-this-product.md` (`WHY-AC-41`, `WHY-AC-43`) named in §8.
**Criterion prefix:** `FB-AC-*`. Nothing here is a `P1-AC-*` or a `WHY-AC-*`, so a reader
grepping either document cannot mistake one for the other.

**Decisions needed: none.** §12 records the two `ASSUMED:` calls left for veto.

---

## 1. The problem

The owner tested the ops2 project record in a **responsive single-column / mobile-like**
viewport and reported eight defects. Six of them are one need failing: *see which lines still
need me, get to only those in one tap, and never be told something is wrong in a way I can
miss.* The other two are a drawing that erases its own dimension (7) and a panel whose door
was withheld by a rule the owner has now reversed (8).

This is a **presentation and copy correction over data the record endpoint already returns**.
No new endpoint, no new query, no schema change, no migration (§10).

### In scope

1. One shared row component and one shared list container across the queue's phone cards, the
   record's line list and the line page's unit list — the fix for the hover-erases-the-edge
   defect at its root (defect 1).
2. The record band's sticky offset, so its rest position matches every other ops2 surface and
   does not move when the data lands (defect 2).
3. The attention row restored to the approved mock: a full-bleed tinted band that closes the
   header under the tab rail, with the mock's floor, padding and action treatment
   (defects 3 + 4).
4. The filter's predicate widened to *everything requiring attention*, and the copy that
   labels the set rewritten to match (defect 5).
5. The disabled primary CTA drawn without error semantics, without collapsing into a line of
   grey text (defect 6).
6. `Elevation`'s break-line paint order — on the **customer site component**, which is the
   root-cause location — and the two companion CSS rules ops2 never ported (defect 7).
7. "Why this product" always carrying its door, on all four rationale kinds, and the panel
   wired onto the record's desk canvas (defect 8).

### Out of scope

- **The queue's desk `<table>`.** It stays a `<table>`: column headers and row/column
  association are a different object. The owner stated a preference for one component
  eventually; that is a later change, not this one.
- **Desk-width layout.** Everything was tested single-column. Defect 2 is fixed at the root
  and verified at both widths; no desk layout change is requested.
- **Collapsing `Elevation`'s double gate** (the component computes `wide`, the CSS re-gates on
  viewport). It would change what the customer site draws at desk width and is not one of the
  eight.
- **Learnings-sourced alternatives** on the rationale detail. The owner: *"nothing new from the
  current implementation."* A future ticket with its own correctness questions.
- **Any new endpoint, query, column or migration.**
- **Editing anything.** The record and the line page stay read-only.

### Sizing

This is one pipeline run, at the top of the range. Defect 1 is the only structural piece and
defects 3, 4 and 5 land on the surface it touches, so the architect should slice defect 1 as
the **first tracer bullet** and let the rest follow onto the extracted row. It does not need
`wayfinder`: the route is known and every root cause is already measured.

---

## 2. Actors and needs

Carried verbatim from the grill's *Actors and needs*.

> **Staff** (`CONTEXT.md` §Actors) — an ops-console operator working for OpenFrame, here in the
> **Estimator persona**: the person auditing the platform's recommendations at the human review
> gate. Today performed by an owner.
>
> Their need, in the owner's own framing:
>
> > See which lines still need me, get to only those in one tap, and never be told something is
> > wrong in a way I can miss.
>
> Six of the eight defects are that need failing. No new or sharpened actor — nothing here
> changes `CONTEXT.md`.

**Customer** — not touched. The record and the line page are ops-only surfaces. The one file
this change edits outside ops2 (`src/components/quote-project/Elevation.tsx`) is on a customer
surface, and the change there **removes** a defect the customer also has today: below 767 px a
wide opening's width figure is half-erased by its own break symbol. No customer-facing
behaviour is added.

---

## 3. How to read the criteria

Every criterion is Given–When–Then, independently verifiable, and **executable by a Playwright
test in `scripts/tests/web/`**. This whole feature is presentation: `node:test` cannot see any
of it, and the HTML the Worker serves is byte-identical in every state that matters here.

Three criteria are geometric and are worded so a test asserts them from the DOM and computed
style, never from a screenshot diff:

- a **rest position** is `getBoundingClientRect().top` at scroll 0;
- a **tint** is `getComputedStyle(el).backgroundColor` compared against the resolved token and
  against its neighbours' backgrounds;
- **not overpainted** is a document-order plus bounding-box test: no element *after* the number
  in document order, with a non-transparent fill, intersects its box.

The suites already mock `GET /api/ops/projects/:id` with `page.route`
(`scripts/tests/web/ops2-record.spec.ts:60-79`), so every state below is constructible.

---

## 4. Defect 1 — one row, one list, three surfaces

*Trace:* grill §1 (`record.css:265` paints the flag on the `<li>`, `record.css:290` paints the
hover wash on the `<button>` that fills it; a child's background covers a parent's inset
shadow). The queue already hit this and fixed it, with the reason written down —
`projects.css:376-384`. `record.css:534` is the correct pattern, two rules further down.
DECISION (owner, Q1/Q13): one shared row component **and** one shared list container over the
three *list* surfaces; the desk `<table>` stays a table.

**FB-AC-1** — *the leading edge survives hover, on the record's line list*
Given a record with a flagged line, When the pointer hovers that row, Then the row still paints
its leading edge: the element whose computed `background-color` changed on hover is the **same
element** whose computed `box-shadow` carries the `inset` edge, and that `box-shadow` is
non-`none` both at rest and while hovered.
*Trace:* grill §1; `src/ops2/styles/record.css:265, 290`.

**FB-AC-2** — *the selected row's tint survives hover too*
Given the desk width and a record whose canvas is reviewing a line, When the pointer hovers that
selected row, Then the selection tint, the selection edge and the hover wash are all computed on
one element, and the row still reports `aria-current="true"`.
*Trace:* `record.css:533-534` (tint on the `<li>`, edge on the `<button>` — the same split that
produced FB-AC-1); `lines.tsx:49-58`.

**FB-AC-3** — *the queue's phone card keeps the behaviour it already had*
Given the Projects queue at phone width with a row waiting on us, When the pointer hovers it,
Then the leading edge is still painted in the warning colour, and a row waiting on the customer
still paints the info colour.
*Trace:* `projects.css:376-402` — this is the fix being generalised, and the criterion exists so
generalising it cannot lose it.

**FB-AC-4** — *the line page's unit rows are the same object*
Given a composite line's page, When the pointer hovers a unit row, Then the wash is painted on
the element that would carry a leading edge, and no ancestor of that element paints a background
or an inset shadow of its own.
*Trace:* `line.css:402-436`; `LineReview.tsx:136-180`.

**FB-AC-5** — *it is one component and one container, not three copies*
Given the queue at phone width, the record's line list and a composite line page's unit list,
When each renders, Then every row root element carries the **same class token** as the other two,
and every list container carries the same class token as the other two. (The design names the two
tokens once; the criterion is that all three surfaces return the same ones.)
*Trace:* grill §1 — the owner's Q1 (*"are we reusing components here at all???"*) and his own
definition, *"the component is the same, the content within it differ"*.

**FB-AC-6** — *the press area reaches the block's inner edge*
Given any of the three list surfaces, When a row renders, Then the pressable element's
bounding box left edge is within 1 px of the list container's content-box left edge, and its
right edge within 1 px of the container's right — the row's gutter is the row's, never the
container's.
*Trace:* `line.css:410-423` states this rule for the unit list and is the behaviour being
shared; `record.css:275-288`.

**FB-AC-7** — *one row, one target, one name*
Given any row on the three surfaces, When it renders, Then it contains exactly one interactive
element, that element has no interactive descendant, and no element in the row carries
`aria-expanded`.
*Trace:* `P1-AC-35`, `AC-N1` — carried forward, because an extraction is exactly where a nested
control gets introduced.

**FB-AC-8** — *rows keep the block rhythm*
Given a list of three or more rows on any of the three surfaces, When it renders, Then the
vertical gap between adjacent row boxes is 0, each row after the first draws a 1 px top
hairline, the first draws none, and the group clips its children (no leading edge painted
outside the group's rounded corners).
*Trace:* `record.css:251-261`; `projects.css:361-390`.

**FB-AC-9** — *what each surface still decides for itself*
Given the three surfaces, When each renders, Then the row's inner content is unchanged from
today: the queue card's ref/status/title/customer/lines/money/flags
(`rows.tsx:129-149`), the record row's elevation · code · product · size · units · money · badge
(`lines.tsx:64-100`), the unit row's elevation · label · product · size · note · options
(`LineReview.tsx:144-177`) — and which fact the leading edge means stays per-surface:
`waitingOn` on the queue, `needsReview` on the record, none on the units.
*Trace:* grill §1 table; `P1-AC-32`.

**FB-AC-N1** — *the desk table is not converted*
Given the Projects queue at desk width, When it renders, Then it is still a `<table>` with five
`<th scope="col">` column headers and `<tr>` rows, and it does **not** use the shared row
component.
*Trace:* grill §1 DECISION (*"The desk `<table>` stays a table for now"*); `rows.tsx:173-238`.

### Regressions this extraction must not cause

| Must not lose | Where it lives today |
|---|---|
| the queue card's trailing chevron | `rows.tsx:121-127` (`IonItem detail`) |
| whole-row activation opening the record | `rows.tsx:114, 128` |
| the `data-waiting` edge colours, warning and info | `projects.css:397-402` |
| the record row's flag edge and its one `needs review` badge | `record.css:265`; `lines.tsx:99` |
| the unit row's 44 px hit floor and top-aligned grid | `line.css:428-436` |
| `aria-current` on the selected desk row | `lines.tsx:57` |

---

## 5. Defect 2 — the band's rest position

*Trace:* grill §2. `.ops2-page__band` is pulled up by `margin-top: calc(-1 * var(--ops2-band-top))`
so the white bleeds under the status bar (`projects.css:69-82`). The record is the only surface
passing `bandPinned`, which adds `position: sticky; top: 0` (`record.css:136`) — sticky clamps
the band to 0 and **cancels the bleed**, pushing every child down by exactly that inset.
Measured at 900 px single column: Projects band top −16, record band top 0.
The fix is one line: the sticky offset equals the band's own negative pull.

**FB-AC-10** — *pinned and unpinned rest at the same place*
Given the record at 390 px with the record loaded (band pinned), When the page is at scroll 0,
Then the band's `getBoundingClientRect().top` equals the same measurement taken on the Projects
queue at the same viewport, and equals the negated computed value of `--ops2-band-top`.
*Trace:* grill §2 table; `projects.css:69-82`, `record.css:136`.

**FB-AC-11** — *the band does not move when the data lands*
Given the record at 390 px with the record request held open, When the band is measured while
the skeleton is showing and again after the record resolves, Then the two `top` values are
identical.
*Trace:* `ProjectRecordPage.tsx:222` (`bandPinned={!!record}` — false while loading, which is
what makes the 16 px jump observable).

**FB-AC-12** — *it still sticks*
Given the record at 390 px with enough lines to scroll, When the list is scrolled 400 px, Then
the band is still on screen (its `bottom` > 0), and the identity line, the tab rail and the
attention row are all still visible.
*Trace:* `record.css:133-140` — the reason the band is pinned at all.

---

## 6. Defects 3 + 4 — the attention band, restored to the mock

*Trace:* grill §3+4. One defect. The approved mock specifies it and the implementation dropped
it: mock `.filterrow` (`ops2-record.css:51-68`, branch `design/ops2-planning`) is a full-bleed
tinted band with a 40 px floor, `6px 14px` padding, a bottom border and a bold underlined ink
action word; shipped `.rec-attention` (`record.css:143-184`) has `background: none`, no floor,
no inline padding, a **top** border and a brand-coloured medium action word.
DECISION (owner, Q10/Q14): restore the mock. Explicitly rejected: making the filter a third tab,
and relocating the band between the rail and the first card.
ops2's equivalent of the mock's `--ops-warn-tint` is `--ds-color-warning-subtle`
(`--theme-warning-50`, `#fdf9f0`) — `tokens.css:62`.

**FB-AC-13** — *the ground changes immediately under the tab rail*
Given a record at 390 px, When the band renders, Then the attention row's computed
`background-color` equals the resolved `--ds-color-warning-subtle`, and differs from both the
band's own background and the page ground's.
*Trace:* mock `ops2-record.css:54`; `tokens.css:62`; today `record.css:154` is `background: none`.

**FB-AC-14** — *the tint is the rail's floor, in every state*
Given each of the attention row's states in turn — blockers, `clear`, `no-lines` — When the band
renders, Then the tint is present in all three, and the state is carried by the dot's colour
(warning, success, `--ds-border-strong`) rather than by the presence of the tint.
*Trace:* the mock applies `.filterrow` to its clear state too (`pieces.tsx:207-213`); the ground
change under the rail is structural, not a status colour. `record.css:164-171` already colours
the dot per state.

**FB-AC-15** — *it is full bleed*
Given the record at 390 px, When the attention row renders, Then its bounding box left edge is
within 1 px of the band's left edge and its right edge within 1 px of the band's right — the
tint runs edge to edge, not inside the band's inline padding.
*Trace:* mock `ops2-record.css:52-54`; `projects.css:76-78` (the band's own inline padding is
what has to be pulled back).

**FB-AC-16** — *there is no white gap between the tabs and the tint*
Given the record at 390 px, When the band renders, Then the attention row's box top is within
1 px of the tab rail's box bottom.
*Trace:* the owner's words — *"the darker background starts only after the error label"*.

**FB-AC-17** — *it closes the header rather than hanging off the tabs*
Given the record at 390 px, When the attention row renders, Then it carries a 1 px bottom border
and no top border, and no left or right border.
*Trace:* mock `ops2-record.css:55` (`border-bottom`); today `record.css:153` (`border-top`).

**FB-AC-18** — *it has weight, and it is not compressed*
Given the record at 390 px, When the attention row renders, Then its box height is at least
40 px, and its computed inline padding is greater than 0 on both sides.
*Trace:* mock `ops2-record.css:53` (`min-height: 40px; padding: 6px 14px`); today
`record.css:151` (`padding: xs 0`).

**FB-AC-19** — *the action word reads as a control on the tint*
Given a record whose attention row carries an action, When it renders, Then the action word is
semibold or bolder, is underlined, and its computed colour is **not** `--ds-text-link`; and its
contrast against the row's computed background is at least 4.5:1.
*Trace:* mock `ops2-record.css:62-68` and its own comment — the brand hue measured **4.34:1** on
this tint, under the mock's legibility floor; ink plus an underline carries "this is a control"
without borrowing a colour that has to fight the tint.

**FB-AC-20** — *the tint does not compete with the refusal*
Given a record whose primary action is blocked for a reason the attention row does not carry
(so both elements render at once), When the page renders, Then `.rec-refusal` still computes
`--ds-color-error-subtle` background, a 1 px `--ds-color-error` border on all four sides, a
radius and `--ds-color-error-text` text; and the attention row carries **no** colour from the
error family, no radius, and a border on its bottom edge only.
*Trace:* `record.css:186-202`; `ProjectRecordPage.tsx:360-365` (the co-occurrence condition).
This is the named regression: a tinted band loud enough to rival the error block would make the
one element that says *this quote cannot go out* stop being the loudest thing on the screen.

---

## 7. Defect 5 — the filter means "everything requiring attention"

*Trace:* grill §5. The filter narrows to unpriced only (`record.ts:497`) and its control renders
only when `unpriced > 0`, because `attentionFor` gives the review blocker `action: null`
(`record.ts:482-487`). In the reproduction project three lines are flagged `needs review` and
unreachable by any filter.
DECISION (owner, Q4): *"everything requiring attention"* — the predicate becomes
`needsReview(line) || line.lineTotal == null`. `needsReview` (`record.ts:570`) is already the
exact predicate painting the row's leading edge and its badge, so the filter shows precisely the
rows the list marks. **One meaning of "attention" per surface.** This diverges from the mock,
whose filter is unpriced-only, and the owner authorised the divergence.

**FB-AC-21** — *the filter shows exactly the rows the list marks*
Given a record of five lines — one with no rate, two carrying a `needs review` badge, two
neither — When the filter is switched on, Then the list shows exactly three rows: every row
carrying a leading edge or a badge, plus every row whose money reads `No rate`, and no other.
*Trace:* grill §5 DECISION; `record.ts:497`, `record.ts:570`.

**FB-AC-22** — *the control exists when nothing is unpriced and something is flagged*
Given a record where every line is priced and three lines are flagged, When the band renders,
Then the attention row is a pressable control carrying `show only these`, and activating it
filters the list to those three.
*Trace:* `record.ts:482-487` (`action: null` today is why the control is absent);
`ProjectRecordPage.tsx:654-660`.

**FB-AC-23** — *the row's words label the set the control acts on*
Given a record with one line carrying no rate and two flagged, When the attention row renders,
Then it reads `3 lines need attention`; and given a record with exactly one such line, it reads
`1 line needs attention`.
*Trace:* grill §5 (*"2 lines have no rate" cannot label a set that also contains flagged
lines*); `record.ts:471-476` is the text being replaced.

**FB-AC-24** — *the filter-on sentence labels the same set*
Given that filter switched on, When the attention row re-renders, Then it reads
`Showing 3 lines that need attention` and its action word reads `show all`; singular reads
`Showing 1 line that needs attention`.
*Trace:* `ProjectRecordPage.tsx:642-644` is the text being replaced.

**FB-AC-25** — *the count cannot lie*
Given any record in any state with the filter on, When the list renders, Then the number in the
attention row's sentence equals the number of rows rendered in the list.
*Trace:* this is the criterion the copy change exists for; the count and the predicate must come
from one expression.

**FB-AC-26** — *a blocker the badge does not mark is still counted, and counted once*
Given a record with one unpriced line, two flagged lines and one **priced** line whose status the
issue gate refuses but which carries no badge, When the attention row renders, Then it reads
`3 lines need attention · +1 more`, and given that blocker leads (nothing else is wrong), it
reads `1 line is not ready to issue` with no action word. No line is counted in two blockers.
*Trace:* `record.ts:467-487` — `inReview` today counts priced lines in `BLOCKING_STATUSES`
(`technical_review`, `incomplete`), and after the union every `technical_review` line is already
in the attention set, so the old sentence `N lines are in technical review` would both
double-count and misname. `worker/lib/issue.ts:112`.

**FB-AC-27** — *the filtered-empty list explains itself in the same vocabulary*
Given the filter is on and no line matches, When the list renders, Then it reads
`No lines need attention now.` above `Clear the filter to see all N.`, and the second is the
control that clears the filter.
*Trace:* `lines.tsx:126-134` (`No lines without a rate.` is the sentence being replaced);
`P1-AC-21` is superseded on its wording only — its behaviour is unchanged.

**FB-AC-28** — *the two non-blocker sentences are untouched*
Given a record with nothing blocking, When the attention row renders, Then it still reads
`Nothing is blocking this quote` with no control; and given a record with no lines, it still
reads `No lines on this project yet` with no control.
*Trace:* `record.ts:450-457`, `:491`; `P1-AC-19`, `P1-AC-20`.

**FB-AC-N2** — *the money surfaces keep saying "no rate"*
Given the totals panel and the header corner, When they render, Then they still speak of rates —
`N with no rate`, `N lines have no rate` — and are **not** reworded to "attention": they count
money that is missing, not lines that need a reviewer.
*Trace:* `ProjectRecordPage.tsx:696-698, 714-718`; `P1-AC-37`, `P1-AC-38`. One place per fact,
and these are a different fact from the filter's.

### Copy, in one table (mine to word — see §12)

| Where | Today | Replacement |
|---|---|---|
| attention row, line blocker | `2 lines have no rate` | `3 lines need attention` / `1 line needs attention` |
| attention row, filter on | `Showing the 2 lines with no rate` | `Showing 3 lines that need attention` / `Showing 1 line that needs attention` |
| attention row, action | `show only these` / `show all` | unchanged |
| attention row, second blocker | `3 lines are in technical review` | `3 lines are not ready to issue` / `1 line is not ready to issue` |
| filtered-empty headline | `No lines without a rate.` | `No lines need attention now.` |
| filtered-empty control | `Clear the filter to see all 5.` | unchanged |
| desk canvas, filtered empty | `Nothing is left once the filter is on. Clear it to review a line.` | unchanged |

---

## 8. Defect 6 — the disabled CTA is not an error

*Trace:* grill §6. `record.css:52-57` paints the disabled primary in `--ds-color-error-text` with
a `--ds-color-error` border. Its origin is **P1-AC-39**
(`docs/specs/ops2-record-correction.md:448`), which asks for the server's reason to be *"drawn as
an error rather than as a note"* — the criterion colours **the reason**; the implementation
coloured **the button**. No mock and no design specifies a disabled state; the treatment was
invented at the stylesheet (`39ad405b`). Material 3 disables by opacity, Apple HIG dims, Ionic's
own default is `opacity: .5`. Red is for destructive and error; a disabled control is neither.
DECISION (owner, Q5): *"UX/UI question. Not red, that's for sure."* The exact treatment is the
ui-designer's to settle within these criteria.

**FB-AC-29** — *no error semantics on the control*
Given a record whose primary action is blocked, When the head row renders, Then no computed
colour on the disabled control — text, background, border — resolves to any of
`--ds-color-error`, `--ds-color-error-text` or `--ds-color-error-subtle`.
*Trace:* `record.css:53-58`.

**FB-AC-30** — *it still looks like a button*
Given that same state, When the control renders, Then it is distinguishable from the toolbar it
sits in by at least one of: a computed `background-color` that differs from its toolbar's, or a
border of at least 1 px in a colour that differs from its own background.
*Trace:* grill §6 — this is the named regression. Ionic's disabled solid button collapses to a
flat grey wash and reads as a line of text in a toolbar, at the moment the reader most needs to
see that the action exists and something is standing in its way (`record.css:44-48`).

**FB-AC-31** — *and it is still readable*
Given that same state, When the control renders, Then its label's contrast against its own
composited background — the element's computed opacity applied — is at least 4.5:1.
*Trace:* `record.css:59-61` (the `opacity: 0.9` override exists because Ionic's default takes it
to the edge of legibility).

**FB-AC-32** — *the refusal sentence keeps the treatment P1-AC-39 asked for*
Given a record whose primary is blocked and whose refusal sentence renders, When it renders,
Then `.rec-refusal` still carries the error background, the error border and the error text.
*Trace:* `record.css:190-202`; `P1-AC-39`. The error semantics move **off** the button and stay
**on** the sentence; they are not deleted from the page.

**FB-AC-33** — *the refusal is still announced and still refuses*
Given a record whose primary action is blocked, When a screen reader reads the control, Then its
accessible name still carries `<label>. Blocked: <server's reason>`; and When it is activated,
Then nothing is requested and nothing changes.
*Trace:* `ProjectRecordPage.tsx:238-247, 163-170`.

---

## 9. Defect 7 — the width figure is not painted over

*Trace:* grill §7, reproduced with W02 (3500 × 700). `Elevation` emits the "not to scale" break
symbol whenever `wMm / hMm > 2.4` (`Elevation.tsx:129`) and paints it **after** the number
(`Elevation.tsx:170-181`): the glyphs span y 78.6–87.2 and the break rect covers 83.2–97.2 in
paper colour — the lower half of every digit, erased. It shows at **every** width in ops2 because
the two rules that gate it live in the customer theme, which ops2 deliberately does not load
(`theme.css:904-907`); `record.css:14-32` already ports two companion rules and missed these.
DECISION (owner, Q11): *"fix both."*

**FB-AC-34** — *the break is emitted before the number*
Given a line 3500 mm wide and 700 mm high, When its elevation renders at a size that draws
leaders, Then within the SVG the `.elev-break` group precedes the width `text.elev-dim` element
in document order.
*Trace:* `Elevation.tsx:170-181`.

**FB-AC-35** — *nothing paints over the width figure*
Given that same drawing, When it renders, Then no element that follows the width
`text.elev-dim` in document order and has a non-transparent fill has a bounding box that
intersects that text's bounding box.
*Trace:* grill §7 — the measured overlap is what this asserts the absence of. The number's
existing `paint-order: stroke` halo (`Elevation.tsx:127-128`) then punches through the break.

**FB-AC-36** — *ops2 shows the break under the same conditions the customer site does*
Given the ops2 line page at 390 px with a 3500 × 700 line, When the drawing renders, Then
`.elev-break` computes `display: block`; Given the same line at 1280 px, Then it computes
`display: none`; Given a 1200 × 900 line at 390 px, Then the drawing emits no `.elev-break`
group at all.
*Trace:* `theme.css:904-907` (the two rules being ported); `Elevation.tsx:573` (`data-wide="1"`);
`record.css:14-32` (the precedent for porting a companion rule into ops2).

**FB-AC-37** — *the customer site draws the same things it drew before, only legibly*
Given the customer quote-project surface at 375 px with a 3500 × 700 opening, When the row
renders, Then the break symbol is still shown and the width figure is fully legible by
FB-AC-35's test; and at 1280 px the break is still hidden.
*Trace:* `theme.css:904-907`; grill §7 scope note — the double gate is **not** collapsed.

---

## 10. Defect 8 — the door is always there. WHY-AC-41 is superseded

*Trace:* grill §8. `panelCopy` returns `door: null` for the `unresolved`, `unrecorded` and
`human` kinds (`whyCopy.ts:339-385`) and `WhyDetail` renders only `kind === "recommendation"`
(`WhyDetail.tsx:35`), per **WHY-AC-41** — *"a panel with no detail has no control at all"*.
Established fact: for the three no-door kinds the API returns only `current` (the line's own
figures), plus `units` on a human-split composite (`src/data/rationale.ts:102-123`). **There is
no requirement and there are no candidates.**
DECISION (owner, Q7/Q12/Q15): the door is always present — *"for consistency and less 'what-if'
scenarios in the code"*. The detail retains its structure and fills each block with whatever
data is usable; where data is not available it **states that fact**. **Nothing new is fetched.**
DECISION (owner, Q8): the record's desk canvas gets the panel; its door pushes to that line's
`/why` address, as from the line page.

### What is superseded, explicitly

- **WHY-AC-41** (`docs/specs/ops2-why-this-product.md` §9.5) — *one control on the panel, and
  none when there is no detail* — is **superseded by FB-AC-38**. The door is now unconditional.
  The rule that a panel with nothing behind it has no control was correct when there was nothing
  behind it; the owner has decided there is now always something behind it, and §10.2 says what.
- **WHY-AC-43** (`§9.6`, from D21) — *the canvas shows no panel and issues no rationale request*
  — is **superseded by FB-AC-44**. It is replaced, not quietly deleted, exactly as the why-spec
  requires of it (`§13`: *"If revisited, WHY-AC-43 is replaced, not quietly deleted"*).
- **WHY-AC-44** (one routed surface per address) is **not** superseded and is re-asserted as
  FB-AC-N3.
- **WHY-AC-39/40** (no action anywhere on the detail) are **not** superseded and are re-asserted
  as FB-AC-43.
- **D2** (an order record has no rationale and never fetches one) is **not** superseded and is
  re-asserted as FB-AC-N4.

### 10.1 The door

**FB-AC-38** — *every kind has a door*
Given a line whose rationale kind is `recommendation`, `human`, `unrecorded` or `unresolved` in
turn, When its page renders, Then the "Why this product" panel carries a chevron and a single
control whose accessible name names what is behind it.
*Trace:* `whyCopy.ts:351, 361, 382` (`door: null` today); `WhyPanel.tsx:67-102`.

**FB-AC-39** — *the door goes to the line's own `/why` address, and back comes back*
Given a line of any kind opened from its own page, When the panel's control is activated, Then
the address becomes `/projects/:id/line/:lineId/why` and the detail is on screen; When back is
activated, Then the address returns to the line page and focus returns to the control that
opened it.
*Trace:* `LinePage.tsx:166-169` (`openWhy`), `lineRoute.ts:133` (`WHY_SUFFIX`), `:108`
(`WHY_FROM_LINE`); `VIEW-AC-7` is the focus discipline already in place.

**FB-AC-40** — *`/why` is an address every kind serves*
Given a cold arrival at `/projects/:id/line/:lineId/why` on a line of any of the four kinds, When
the page settles, Then the detail renders and the address is **not** normalised back to the line
page.
*Trace:* `LinePage.tsx:81` (`hasWhy` is `kind === "recommendation"` today); `lineRoute.ts:155-159`
— `hasWhy` is the fact this criterion widens, and it stays the one place the fact lives.

### 10.2 What the detail shows for each of the four kinds

The three no-door kinds carry **no requirement and no candidates**. The detail keeps the same
three headings on all four kinds and states the absence where there is nothing.

**FB-AC-41** — *the recommendation kind is unchanged*
Given a line whose kind is `recommendation`, When its detail renders, Then it renders exactly
what it renders today: the requirement block, the comparison block when the selection changed,
the split and per-unit band blocks on a composite, the ladder, and the closing sentence.
*Trace:* `WhyDetail.tsx:52-109`. This effort changes nothing about this state.

**FB-AC-42** — *the three other kinds keep the structure and name what is missing*
Given a line whose kind is `human`, `unrecorded` or `unresolved`, When its detail renders, Then
it carries, in this order:

1. the same `Chosen` sentence the panel shows for that kind, **verbatim** — so the two surfaces
   cannot describe one line differently;
2. a block headed **`What it had to meet`** whose body reads **`Not recorded for this line.`**;
3. a figures block —
   - `human` **with units**: the per-unit block, each unit carrying its code, its product, its
     own recorded band or the sentence that none was recorded, and its own figures;
   - `human` **without units** and `unrecorded`: a block headed **`This line's figures`** whose
     body is the line's own captured figures, or `not recorded` when there are none;
   - `unresolved`: the same block, whose body is the panel's own sentence for that state —
     `no selection was made on this line` — never a figure and never a dash;
4. a block headed **`What else was considered`** whose body reads **`No alternatives were
   recorded for this line.`**;
5. the existing closing sentence, unchanged.

*Trace:* grill §8 DECISION; `src/data/rationale.ts:102-123` (what the DTO carries per kind);
`whyCopy.ts:173-215` (the `Chosen` sentences, already owner-approved); `whyCopy.ts:465-495`
(`DETAIL`, where the three new strings belong); `WhyDetail.tsx:204-237` (the per-unit block being
reused for a human split); `whyCopy.ts:106-107` (`NOT_RECORDED`, the existing absence word);
`whyCopy.ts:348` (`no selection was made on this line`).

**FB-AC-43** — *the detail still does nothing*
Given the detail on any of the four kinds, When it renders, Then its only interactive element is
back — no button, no link, no ladder row that presses.
*Trace:* `WHY-AC-39/40`; `WhyDetail.tsx:19-25`.

### 10.3 The record's desk canvas

**FB-AC-44** — *the canvas carries the panel*
Given the desk width and a record with a line under review, When the canvas renders, Then the
"Why this product" panel is present in the same place the line page puts it — between the
specification (or the units) and the price.
*Trace:* `ProjectRecordPage.tsx:433` (`why={null}` today); `LineReview.tsx:254-269`.
**Supersedes WHY-AC-43.**

**FB-AC-45** — *the canvas's door is a navigation to the line's own address*
Given the desk width with a line under review, When the panel's control is activated, Then the
console navigates to `/projects/:id/line/:lineId/why`; When back is activated, Then it returns to
the record it came from, and the back control names that record.
*Trace:* `ProjectRecordPage.tsx:209-211` (`openDrawing` is the identical seam, and its per-entry
door mark is the pattern to follow); `lineRoute.ts:98-122`.

**FB-AC-46** — *the canvas's line-actions panel stops promising what now exists*
Given the desk width with a line under review, When the line actions panel is opened, Then it no
longer states `Why this product? — the estimator reasoning arrives on this page next.`
*Trace:* `ProjectRecordPage.tsx:523-526` — the sentence becomes false the moment FB-AC-44 lands.

**FB-AC-N3** — *one routed surface per address, still*
Given `/projects/:id/line/:lineId/why` reached from either door, When it renders, Then the
drawing viewer is **absent**; and given the bare line address, Then neither the detail nor the
viewer is on screen.
*Trace:* `WHY-AC-44`, re-asserted because a second door into `/why` is exactly where the
exclusivity gets broken. `lineRoute.ts:11-27`.

**FB-AC-N4** — *an order record still has no rationale, and still fetches none*
Given a project with an accepted order, When a contract line is reviewed on the canvas or on its
page, Then no "Why this product" panel renders and **no request is issued** to
`/api/ops/projects/:id/lines/:lineId/rationale`.
*Trace:* D2; `LinePage.tsx:72-77`; `useLineRationale.ts:28-30, 100`.

**FB-AC-N5** — *nothing new is fetched*
Given any line of any kind, When its panel and its detail render, Then the only rationale request
issued is the existing `GET /api/ops/projects/:id/lines/:lineId/rationale`, once per line, with
no new parameter — and no other endpoint is called that was not called before this change.
*Trace:* grill §8 (*"nothing new from the current implementation"*); `useLineRationale.ts:44-47`.

---

## 11. Security

**Classification: no new sensitive surface.** This feature is presentation and copy over data the
**staff-gated** record endpoint and the **staff-gated** rationale endpoint already return to the
same reader on the same screens. There is **no new endpoint, no new query, no new field, no
schema change and no migration.** No payout, bank, ABN or payment data is within a hundred lines
of this change; no upload, no auth path, no session handling is touched.

One change has any security flavour at all, and it is named rather than omitted: **defect 8
causes the record's desk canvas to issue a rationale request it did not issue before**
(FB-AC-44). It is the same request the line page already issues, for a line id that came from the
record the same session just fetched, behind the same `resolveStaff` gate. The data it returns is
already rendered to this reader one navigation away. **No data crosses a boundary it does not
cross today.**

The negative criteria below are therefore **regression guards on gates that already exist**, and
the tester executes them for real — attempts the forbidden action, records the denial.

**FB-AC-X1** — *the record is still staff-only*
Given a signed-in non-staff account, When it requests `GET /api/ops/projects/:id`, Then the
server answers 403, no project data is in the body, and the console renders the role error rather
than an empty record.
*Trace:* `AC-X1`; `useProjectRecord.ts:55-65`.

**FB-AC-X2** — *the rationale is still staff-only, and still refuses identically*
Given an anonymous caller and a signed-in non-staff caller in turn, When each requests
`GET /api/ops/projects/:id/lines/:lineId/rationale`, Then each is refused with the same status and
a **byte-identical** body, and no product, figure, candidate or customer fact is in either
response.
*Trace:* `X-AC-1/2/3` — re-run because a second consumer of this endpoint is being added.

**FB-AC-X3** — *the second door cannot become a cross-project probe*
Given a valid staff session and a line id belonging to project B, When
`/projects/<A>/line/<B-line-id>/why` is opened — by navigation from A's canvas or by URL — Then
the answer is indistinguishable from a line id that does not exist at all: the same sentence, the
same status, nothing about project B on screen and nothing about it in any response body.
*Trace:* `AC-X3`, `AC-X4`, `X-AC-4`; `useLineRationale.ts:56-58` (404 covers both refusals by
construction — this criterion is that the new door does not undo that).

**FB-AC-X4** — *the widened detail does not widen what leaves the server*
Given a line of any of the four kinds, When its detail renders, Then the response body contains
only the fields `src/data/rationale.ts` already defines for that kind — no cost, no margin, no
supplier, no internal pricing fact, and no candidate beyond the chosen one and its four
runners-up.
*Trace:* `X-AC-5`; `src/data/rationale.ts:102-158`. The detail becomes reachable on three more
kinds; the payload for those kinds is unchanged.

**FB-AC-X5** — *no write is added*
Given the whole feature diff, When it is reviewed, Then no endpoint, mutation or write path is
added or widened; every criterion above is satisfied by rendering.
*Trace:* `X-AC-6`; §1 out-of-scope.

---

## 12. Edge cases

| Case | Required behaviour | Criterion |
|---|---|---|
| Flagged row hovered | edge survives; wash and edge on one element | FB-AC-1 |
| Selected row hovered at desk width | tint, edge and wash on one element; `aria-current` intact | FB-AC-2 |
| Record still loading | band rests where it rests when loaded — no jump | FB-AC-11 |
| Nothing blocking / no lines | tint still present; dot colour carries the state; no control | FB-AC-14, FB-AC-28 |
| Refusal block and attention band on screen together | error family on the refusal only | FB-AC-20 |
| Every line priced, three flagged | control present, filter shows the three | FB-AC-22 |
| One line only in the set | singular copy, both states | FB-AC-23, FB-AC-24 |
| Priced line the gate refuses but the badge does not mark | counted in `+N more`, never double counted; `not ready to issue` | FB-AC-26 |
| Filter on, lines resolved elsewhere, record reloads | `No lines need attention now.` and the way back | FB-AC-27 |
| Delivery unset and lines needing attention | lines still lead; delivery is the counted `+N more` | FB-AC-26 (`P1-AC-17` unchanged) |
| Delivery settled at `0` | still settled; only NULL is unset | unchanged (`record.ts:308`) |
| CTA blocked | no error colour on the control, error colour on the sentence | FB-AC-29, FB-AC-32 |
| 3500 × 700 opening at phone width | break shown, number legible | FB-AC-35, FB-AC-36 |
| 3500 × 700 opening at desk width in ops2 | no break drawn | FB-AC-36 |
| 1200 × 900 opening | no break group emitted at any width | FB-AC-36 |
| Unsized opening (no width or height) | square stand-in, no leaders — the break question never arises | unchanged (`P1-AC-4`) |
| `human` kind with no units | door present; `This line's figures`; both absence sentences | FB-AC-42 |
| `human` kind with units | door present; per-unit block; a unit with no band says so | FB-AC-42 |
| `unrecorded` kind | door present; figures or `not recorded`; absences named | FB-AC-42 |
| `unresolved` kind | door present; `no selection was made on this line`, never a figure | FB-AC-42 |
| Rationale read fails | unchanged: the panel says it could not be read and offers retry | `WHY-AC-42` |
| Accepted order record | no panel, no request, on the page and on the canvas | FB-AC-N4 |
| GST | absent everywhere on these surfaces, in every state | `AC-N5` unchanged |

---

## 13. Assumptions tagged for veto

- `ASSUMED:` **the queue's phone card loses Ionic's `IonItem` chrome.** FB-AC-5 requires one row
  component across three surfaces; two of the three are plain `<li>`/`<button>` rows and the
  queue's is an `IonItem` inside an `IonList` (`rows.tsx:113-156`). The shared row is therefore
  the plain one, and the queue card loses the platform ripple. Its chevron, its whole-row target,
  its leading edge and its content are all kept by name (§4, regression table). Flagged because
  the queue is a surface the owner has accepted and this is a visible change to it — small, and
  vetoable by keeping the queue on `IonItem` at the cost of the extraction the owner asked for.
- `ASSUMED:` **the user-facing wording** in §7's copy table and FB-AC-42's three new sentences
  (`Not recorded for this line.`, `This line's figures`, `No alternatives were recorded for this
  line.`) plus the door's accessible name on the three no-door kinds. The owner decided *what*
  these must say ("everything requiring attention"; "states that fact"); the words are mine, and
  they are in one table and one criterion so he can strike through any of them at sign-off
  without touching a criterion's behaviour.

Not assumptions — decided in the grill and merely recorded here: the shared row and container
(Q1/Q13), the desk table staying a table (Q1), the mock's tint restored and the two rejected
alternatives (Q10/Q14), the filter's predicate (Q4), no red on the disabled CTA (Q5), fixing
`Elevation` and porting both rules (Q11), the unconditional door and the retained structure
(Q7/Q12/Q15), and the panel on the canvas (Q8).

---

## 14. Decisions needed

**None.** The grill closed with an empty frontier and every question it settled is carried above.
The two `ASSUMED:` items in §13 are flagged for veto at sign-off rather than held as blocking
questions.

---

## 15. Interaction spec

*Mock:* `docs/mocks/ops2-record-feedback.html` (single file, no external assets). It draws **only
the three genuinely new visual decisions**. Defects 3, 4 and the attention row's placement are a
restoration of the already-approved `ops2-r1-ionic` mock and appear in that file as **context**, in
its §5 — they are not redesigned here and the developer builds them from §6 of this spec plus
`docs/mocks/ops2-r1-ionic-src/src/ops2-record.css:51-68` on branch `design/ops2-planning`.

Tokens throughout are ops2's own (`src/ops2/styles/tokens.css`, `src/ops2/theme/*.css`). No hex,
and no `--ion-color-step-*` — undefined in this stylesheet set, they render full-strength black.

---

### 15.1 The refused primary action (defect 6 — FB-AC-29…33)

**File:** `src/ops2/styles/record.css:52-61`. Markup unchanged; `ProjectRecordPage.tsx` unchanged.

Replace the `.rec-cta__primary.button-disabled` block with:

| Property | Value | Why |
|---|---|---|
| `--background` | `var(--ds-surface-sunken)` | Differs from the toolbar's `--ds-surface-card`, so the control is an object in the bar rather than a line of text in it — FB-AC-30 is satisfied by the background alone, before the border. |
| `border` | `1px solid var(--ds-border-strong)` | The second half of FB-AC-30, and the edge that keeps the button's *shape* once the fill is quiet. |
| `border-radius` | `var(--ds-radius-control)` | Unchanged. |
| `--color` | `var(--ds-text-secondary)` | 4.75:1 on `--ds-surface-sunken` — above the 4.5 floor with margin, and quieter than the enabled label (FB-AC-31). |
| `opacity` | `1` | Ionic's `.5` is what took the label to the edge of legibility. Overridden, not compensated for; the existing `opacity: 0.9` line goes with it. |
| `cursor` | `not-allowed` | The one hover-time signal. Hover changes nothing else. |

No colour from the error family appears anywhere on the control (FB-AC-29). Delete the
`--ds-color-error-text` and `--ds-color-error` declarations; the comment above them explaining why
the treatment exists stays, with "the outline" reworded to "the fill and the outline".

- **Focus:** the control stays natively `disabled` — FB-AC-33 requires activation to do nothing,
  and `disabled` is the native guarantee — so it is out of the tab order. Focus order in the head
  row is unchanged: back → title → *(primary skipped)* → the overflow control.
- **Announcement:** unchanged. The accessible name stays `<label>. Blocked: <server's reason>`
  (`ProjectRecordPage.tsx:238-247`), and `aria-describedby` still points at `.rec-refusal`.
- **`.rec-refusal` is untouched** (FB-AC-32): error-subtle background, 1 px `--ds-color-error` on
  all four sides, `--ds-radius-control`, `--ds-color-error-text`. It stays the loudest thing on the
  screen, which is the point of moving the red off the button.
- **Long content:** the label never wraps (`white-space: nowrap`, already present). At 375 px the
  refusal sentence wraps under its icon and the icon stays aligned to the first line — unchanged.

*Rejected while drawing this:* a lock or ban glyph inside the button. It duplicates a sentence
sitting directly beneath it, and it is the only element here that would need a new icon import.

---

### 15.2 One row, one list (defect 1 — FB-AC-1…9, N1)

**The two shared class tokens FB-AC-5 asks the design to name once:**

- container — `ops2-rows`
- row root — `ops2-row`

and the row's single pressable, which is where the whole fix lives — `ops2-row__open`.

Each surface keeps its own class **alongside** the shared one, for content only:
`class="ops2-row rl-row"`, `class="ops2-row pq-row"`, `class="ops2-row ops2-row--unit"`.

**Where the CSS lives:** a new `src/ops2/styles/rows.css`, imported once. The nine declarations
currently shared between `.rl-open` and `.lp-unit__open` (`record.css:275-288`) move there and that
selector pair is deleted, as are `projects.css:361-402`'s `.pq-cards` row rules and
`line.css:405-436`'s `.lp-unit` rules — each surface then keeps only what its *content* needs.

#### The structural rule this defect exists for

> The leading edge, the selection tint and the hover wash are all computed on
> **`.ops2-row__open`**, and on nothing else.

An inset `box-shadow` paints above its own element's background, so once every state is on one
element no state can erase another. Today the edge is on the `<li>` and the wash on the `<button>`
filling it (`record.css:265` vs `:290`) — a child's background over a parent's inset shadow, which
is exactly FB-AC-1. The comment at `projects.css:376-384` already states this reasoning for the
queue; it is being generalised, not invented.

#### States, in full

| State | Selector | Treatment |
|---|---|---|
| default | `.ops2-row__open` | `background: var(--ds-surface-card)`; no shadow |
| hover *(inside `@media (hover: hover)`)* | `.ops2-row:hover > .ops2-row__open` | `background: var(--ds-color-brand-wash)` |
| pressed | `.ops2-row__open:active` | `background: var(--ds-color-brand-subtle)` |
| focus | `.ops2-row__open:focus-visible` | `outline: 2px solid var(--ds-border-focus); outline-offset: -2px` — inside the row, so it draws against the row's own edge instead of over the hairline above it (`line.css:434` already states this) |
| flagged | `.ops2-row[data-edge="warning"] > .ops2-row__open` | `box-shadow: inset 3px 0 0 var(--ds-color-warning)` |
| waiting on customer | `.ops2-row[data-edge="info"] > …` | `box-shadow: inset 3px 0 0 var(--ds-color-info)` |
| flagged **+ hover** | both rules, one element | wash **and** edge, both legible — **FB-AC-1** |
| selected | `.ops2-row[data-selected] > .ops2-row__open` | `background: var(--ds-color-brand-wash)` **and** `box-shadow: inset 3px 0 0 var(--ds-color-brand)` |
| selected + hover | `.ops2-row[data-selected]:hover > …` | `background: var(--ds-color-brand-subtle)` — a *deeper* wash, so hover stays perceptible on an already-tinted row without touching the edge |
| selected + flagged | `[data-selected][data-edge="warning"]` | brand tint, **brand** edge — selection wins the shadow. The flag keeps its own words (the `needs review` badge) and, at the desk, the canvas beside the rail renders that line's whole reasons panel; selection has no word a sighted reader can see, and this console has already recorded that its 4% tint "is not a signal" on its own. Ruled by the architect, design §3.1 |

`data-edge` replaces today's `data-flagged` / `data-waiting`: the row takes an
`edge?: "warning" | "info"` prop and each surface decides what it means (FB-AC-9) — the record
passes `warning` for `needsReview`, the queue passes `warning` for `waitingOn === "Us"` and `info`
for `"Customer"`, the unit list passes nothing.

#### Geometry

- Container `.ops2-rows`: `list-style: none`; `padding: 0`; **`overflow: hidden`** — FB-AC-8's
  clip, so no leading edge paints outside the rounded corner. **No inline padding, ever.**
  It owns grammar and clipping ONLY.
- **The card chrome is composed, not built in** (architect, design §3.2). Background, border,
  radius and elevation come from the existing `ds-surface-card` recipe at the call sites that
  want them — the queue's list and the record's line list. The unit list composes nothing,
  because it already sits inside an `lp-panel` card and an unconditional card on the container
  would draw a card inside a card.
- `.ops2-row + .ops2-row { border-top: 1px solid var(--ds-border-subtle) }`; no `gap`; the first
  row draws no hairline (FB-AC-8).
- `.ops2-row__open`: `width: 100%`; `min-height: 44px`; `padding: var(--theme-spacing-sm)
  var(--theme-spacing-md)`; `border: 0`; `font: inherit`; `color: inherit`; `text-align: left`;
  `cursor: pointer`. **The gutter belongs to the row** (FB-AC-6) — which is why the container has
  none, and what makes the wash and the focus ring reach the block's inner edge.
- Nested in a panel, `line.css:417-422`'s existing rule carries over under the new selector
  (`.lp-panel:has(> .ops2-rows)`): the panel drops its own inline padding and re-applies it to its
  non-list children.

#### Markup contract

```html
<li class="ops2-row <surface>" data-edge? data-selected? aria-current?>
  <button type="button" class="ops2-row__open">
    …surface content…
    <svg class="ops2-row__chev" aria-hidden="true">?</svg>
  </button>
</li>
```

- **Exactly one interactive element per row, no interactive descendant, no `aria-expanded`
  anywhere** (FB-AC-7). The chevron is a decorative `<svg aria-hidden="true">`, never a control.
- The queue's phone card supplies `.ops2-row__chev` (it has one today via `IonItem detail`); the
  record row and the unit row do not.
- Keyboard: `Enter` and `Space` activate — native `<button>`, nothing added. Tab order is document
  order down the list. The list is **not** a roving-tabindex widget and does not become one.

#### What each surface still owns (FB-AC-9)

| Surface | Inside the row | `data-edge` means |
|---|---|---|
| queue, phone | ref · status · title · customer · lines · money · flags · chevron | `waitingOn` |
| record lines | elevation · code · product · size · units · money · `needs review` badge | `needsReview` |
| line page units | elevation · code · label · product · size · note · options (grid, `align-items: start`) | nothing |

#### Empty and long content

- The record's filtered-empty and record-empty blocks (`.rl-empty`) are **not** rows and stay as
  they are; only the wording changes, per FB-AC-27.
- Long product names truncate with an ellipsis on `.rl-name` / `.pq-title` (unchanged). The code,
  the money and the badge never truncate — they are `flex: none`.
- A unit row with a note and options grows past 44 px; the drawing stays top-aligned
  (`align-items: start` on `.ops2-row--unit > .ops2-row__open`).

**Not converted:** the queue's desk `<table>` (FB-AC-N1). It keeps its `<th scope="col">` headers
and its own row rules, and does not import `rows.css`.

---

### 15.3 "Why this product" — the door is always there (defect 8 — FB-AC-38…46)

#### The panel

`WhyPanel.tsx` loses its `copy.door` branch: the head with the chevron, the `lp-panel--door` class
and the stretched `.lp-panel__door` button render **unconditionally** on a resolved load.
`loading`, `error` and `missing` are unchanged — a skeleton and an unreachable fact are not doors.

- Hover, inside `@media (hover: hover)` — `.lp-panel--door:hover { background:
  var(--ds-color-brand-wash) }`, already present.
- Focus — the ring is drawn around the **card**, `outline-offset: 2px`, already present. The
  invisible stretched button is the focus target; the card is the thing that moves.
- Door accessible name for the three kinds that had none — one string, because what is behind it is
  the same on all three:
  **`Why this product — open what was recorded for this line`**
  (`ASSUMED:`, §13. The recommendation kind keeps its three existing variants,
  `whyCopy.ts:415-418`.)
- `hasWhy` (`lineRoute.ts:155-159`) widens from `kind === "recommendation"` to *any resolved kind*.
  It stays the one place that fact lives (FB-AC-40).

#### The detail, for `human` / `unrecorded` / `unresolved`

`WhyDetail.tsx` renders only `kind === "recommendation"` today; it gains a second body component.
`SidePanel`, its title, its `phoneForm="screen"` and its back control are unchanged, and back still
names the line's code and returns focus to the door (FB-AC-39).

Reading order, top to bottom — the mock's frames 3d / 3e / 3f:

1. **`.wd__lede`** — the `Chosen` sentence, **verbatim from `chosenLine(dto)`**, under a small
   uppercase `Chosen` label (`.wd__lede .lbl`, the same type role as `.wd__blk-h`). It leads rather
   than sitting in a block because it is the one thing on this screen that is actually *known*. Its
   tone class comes from `chosenLine`: `ops2-absent` for `unrecorded`, `lp-why__warn` for
   `unresolved`, none for `human`. `ASSUMED:` — the alternative was a fourth block headed `Chosen`,
   which reads as a heading over a single sentence.
2. **`What it had to meet`** (`DETAIL.hadToMeet`, existing) → body `Not recorded for this line.` in
   `.ops2-absent`.
3. **The figures block**, whose heading and body depend on the kind:
   - `human` **with units** → heading `Each unit's own band` (`DETAIL.bands`, existing); body is the
     existing per-unit block (`WhyDetail.tsx:204-237`) reused as-is — each unit's code, its product,
     its recorded band or `DETAIL.bandMissing` (`Its band was not recorded.`), and its figures.
     `DETAIL.bandsNote` is **not** printed here: it explains a *platform* split.
   - `human` **without units**, and `unrecorded` → heading `This line's figures` (new string); body
     is a `.wd__kv` of `Uw` / `SHGC`, or `not recorded` (`NOT_RECORDED`, existing) in `.ops2-absent`
     when there are none.
   - `unresolved` → heading `This line's figures`; body is the panel's own sentence,
     `no selection was made on this line` (`whyCopy.ts:348`, existing), in `.ops2-absent`.
     **Never a figure, never a dash.**
4. **`What else was considered`** (`DETAIL.ladder`, existing) → body
   `No alternatives were recorded for this line.` in `.ops2-absent`.
5. **`DETAIL.closing`**, unchanged, in `.wd__reason.wd__closing`.

The three new strings go in `DETAIL` (`whyCopy.ts:465-495`), not in JSX — the ban is a scan of that
file.

- **Absence role:** every stated absence wears `.ops2-absent` (italic, `--ds-text-muted`). Never a
  dash, never a zero, never an omitted block.
- **Nothing on the detail acts** (FB-AC-43): back is the only interactive element. These kinds have
  no ladder rows, so there is nothing new that could look pressable.
- **Nothing new is fetched** (FB-AC-N5). This is a rendering change over the DTO already on hand.
- **Error and loading** on the detail are the panel's existing states; the detail is only reachable
  once the load has resolved.

#### The record's desk canvas (FB-AC-44…46)

- `ProjectRecordPage.tsx:433` stops passing `why={null}`; the canvas gets the same `WhyPanel` the
  line page renders, in the same position — **between the specification (or the units) and the
  price** (`LineReview.tsx:254-269`). Mock frame 4.
- The canvas's door **navigates**: `/projects/:id/line/:lineId/why`, the same seam `openDrawing`
  uses (`ProjectRecordPage.tsx:209-211`). Back returns to the record and names it.
- The line-actions panel's sentence *"Why this product? — the estimator reasoning arrives on this
  page next."* is deleted (`ProjectRecordPage.tsx:523-526`): it becomes false the moment the panel
  lands.
- No other desk layout change. Desk has no owner feedback yet and none is proposed.

---

### 15.4 Copy added by this section

| Where | String |
|---|---|
| door, three no-detail kinds (accessible name) | `Why this product — open what was recorded for this line` |
| detail, block 2 body | `Not recorded for this line.` |
| detail, block 3 heading (non-unit) | `This line's figures` |
| detail, block 4 body | `No alternatives were recorded for this line.` |

All four fall under §13's second `ASSUMED:` bullet — the owner decided that absences are *stated*;
these are the words, strikeable at sign-off without touching a criterion's behaviour.
