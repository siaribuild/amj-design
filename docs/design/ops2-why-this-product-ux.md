# ops2 "Why this product" — INTERACTION SPEC

**Date:** 2026-08-24 · **Stage:** pipeline stage 3 (ux-designer) · **Revision 3**
**Mock — APPROVED, and the contract:** `docs/mocks/ops2-why-this-product.html`
**Spec:** `docs/specs/ops2-why-this-product.md` (rev 4) ·
**Rulings:** `docs/specs/ops2-why-this-product-grill-conclusions.md` (R1–R24, binding) ·
**Design:** `docs/design/ops2-why-this-product.md` (rev 1)

Covers **Phase 2** (the shared full-screen drawing viewer) and **Phase 3b** (the panel,
the detail slide-out). Phase 1 and Phase 3a have no UI.

> ## DECIDED — both screens are nodes in the tree, and the detail is addressable
>
> **The Why detail has its own URL: `/projects/:id/line/:lineId/why`.** Owner-confirmed.
> It is a real route — pasteable, refresh-survivable, and it goes in the architect's route
> table. A cold arrival renders the line page beneath and the detail over it; the back
> control, browser back and the edge-swipe all return to `/projects/:id/line/:lineId`.
>
> **The drawing viewer is a tree node too, with back — not a modal.** Owner-confirmed,
> against the recommendation. I had read "modal" narrowly, from his gloss *"switch(modal
> aka Confirm/Cancel)"*, and concluded a drawing enlargement was a lightbox rather than a
> place you go; the product-manager and the architect made the same call independently.
> **All three of us were wrong the same way.** The rule is wider:
>
> > **Only a decision dialog — one that asks a question and returns an answer — is a
> > modal. Everything else in ops2 is a screen in the tree, and every screen has back
> > plus the platform's own back gesture.**
>
> **Nothing in this feature is a modal.** Not the detail, not the viewer. The one modal in
> the tree is the switch confirmation, which is deferred (§5).
>
> **The accepted cost, recorded so nobody "fixes" it:** enlarging a drawing now takes a
> history entry, so **leaving a line from an enlarged drawing takes two backs** — one out
> of the drawing, one off the line. That was put to the owner explicitly and he took it.
> It is the ruling, not an oversight. **This amends VIEW-AC-2**, which requires
> `history.length` to be unchanged.
>
> **The viewer's routing mechanism is the architect's call** — its own URL segment, or a
> state-only push. This document specifies the *behaviour* (back returns to the line, the
> gesture works, Escape still closes) and leaves the mechanism open.
>
> ---
>
> **Status: APPROVED at the UX mock gate, 2026-08-24, with five changes, then amended
> twice (R28, R29/R30).** This document describes the **approved** version — all eight
> changes are folded in below, each marked **[gate]** at the point it applies, so the
> developer builds what the owner agreed to and not the first draft.
>
> | # | Owner's change | Where it lands |
> |---|---|---|
> | 1 | Drop the symbol legend from the drawing viewer — *"i don't think lines like this relevant for ops"* | §2.1, §2.2 · **amends VIEW-AC-1** |
> | 2 | On the phone the detail opens **full screen immediately** — *"C4 - full screen stright away"* | §4.1 · **requires a `SidePanel` change** |
> | 3 | The detail's control is not "Done" — *"the panel does not require actions"* — **superseded in part by 7 below** | §4.1 |
> | 4 | Drawings carry **both** dimension leaders, as the real component does | §2.2 |
> | 5 | On a split, show the units' dimensions **and** the overall together | §2.2 |
> | 6 | **R28 — "Change the product" is cut entirely**, control and placeholder alike — *"switching products is not part of the current run"* | §4.1, §5 · **voids WHY-AC-39…44** |
> | 7 | **R29 — the dismiss is a BACK control** on **both** the detail and the drawing viewer; both are screens in the tree | §2.2, §2.4, §4.1 · **amends WHY-AC-7 and VIEW-AC-2** |
> | 8 | **R30 — modals carry their controls on top, title centred** | §8 — a console convention; nothing in this feature is a modal |
>
> **Three spec amendments are owed to the product-manager**, and the last two are large:
>
> 1. VIEW-AC-1 reads *"…with the symbol legend"*. Change 1 removes it, so the criterion
>    must be amended or its test will assert a thing the owner ruled out.
> 2. **R28 voids WHY-AC-39, 40, 41, 42, 43 and 44 outright**, and D4 with them. It also
>    reaches the architect's design: `LineEditStub.tsx`, the
>    `/projects/:id/line/:lineId/edit` route in `Ops2App.tsx:216`, and X-AC-8 (the stub's
>    abuse case) all describe a screen that is no longer being built.
> 3. **R29 inverts VIEW-AC-2**, which requires that activating the viewer's close control
>    or Escape leaves `history.length` unchanged. Under R29 the viewer *is* a history
>    entry and has no close control. The criterion must be rewritten, not relaxed — its
>    Playwright assertion currently proves the opposite of the ruling. **WHY-AC-7** needs
>    the same treatment: it specifies the detail as "the established `SidePanel`", true of
>    its presentation and no longer true of how it opens. And the architect's route table
>    gains `/projects/:id/line/:lineId/why`.
>
> None of that is mine to edit — flagged, not changed.

---

## 0. The five rules this surface is held to

These are not style preferences; each is a ruling and each has a negative acceptance
criterion behind it. A reviewer of the finished screens can check them in a minute.

1. **No money, and no GST reference, anywhere on the Why surface** — R10 + the house
   rule. The line page's existing **Price** panel is untouched and keeps the account's
   ex/inc preference; the Why panel and its detail carry no price, no delta, no currency
   symbol and no control that prices anything. The mock shows the Price panel beside the
   Why panel deliberately, so the boundary is visible.
2. **No certification vocabulary anywhere, in any phase** — R5. Not "certified", not
   "WERS", not "indicative estimate only" as a consequence of certification.
3. **No excluded candidate in any form** — R9. Not a row, not a count, not a reason, not
   a "3 others were not considered" line. The server never sends them.
4. **Read-only** — R1. Every control on this surface either closes something or navigates.
5. **No word frames a human's change as an error** — R2. Banned from the whole string
   table: *wrong, incorrect, mistake, error, correction, should have, failed to*. Stating
   that figures **miss a cap** is a fact about two numbers; stating that a person was
   wrong is not, and is forbidden.

Presentation constants: **uppercase for LABELS only** (panel titles, the comparison's
column heads); **radii never above `--theme-radius-sm`**; **light theme only** — there is
no `prefers-color-scheme` block anywhere in `src/ops2/`, so this surface adds none.

---

## 1. Where things attach

```
LinePage
└── LineReview                       (existing; gains one prop: showWhy)
    ├── Plate                        → opens DrawingViewer   [Phase 2, replaces its SidePanel]
    ├── lp-size
    ├── Needs-review panel           (existing)
    ├── Specification | Units        (existing; Units' xs drawings become viewer openers)
    ├── ►  WhyPanel                  ← NEW, here: after the spec/units, before the price
    ├── Price panel                  (existing, untouched)
    └── Customer's note              (existing)

WhyPanel ──(nav)──► WhyDetail            a SCREEN in the tree (R29): no action out of
                  (SidePanel presentation)   it; back returns to the line
DrawingViewer  — chrome, a tree node too (R29): navigated to from Plate and from
                 each unit row; back returns to the line
```

`WhyPanel` is mounted only when `showWhy` is true. `LinePage` passes
`showWhy={record.orderNo == null}` — **on an order record the panel is not rendered and
its endpoint is never called** (D2/WHY-AC-11). There is no sentence in its place.

---

## 2. Phase 2 — the shared full-screen drawing viewer

### 2.1 What it is, and what it is not

One component, `src/ops2/chrome/DrawingViewer.tsx`, in **chrome** beside `SidePanel`
because any ops2 surface may open it (VIEW-AC-5). It is **not** a `SidePanel`: a
`SidePanel` is 520 px of reading matter beside the work, and a drawing wants the whole
viewport. Full-screen `IonModal`, no breakpoints, no side animation.

The `SidePanel` enlargement currently in `Plate.tsx:60-106` is **deleted**, along with
its `useState`. The units list moves into the viewer's composite rendering — it belongs
with the enlarged drawing. Its two accompanying sentences do not both survive the gate:
see **[gate 1]** below.

### 2.2 Layout (mock A2–A5)

| Region | Content |
|---|---|
| Bar | **Back** at the leading edge, naming the line it returns to (`‹ W03`); then the title. **The title names the subject** — a unit is `W07A`; when the subject *is* the line you came from, it is simply `Drawing`, because repeating the code you just pressed back to says nothing. The size lives in the caption, never in the bar |
| Body | `Elevation` at the largest size the viewport allows, centred; then the caption; then the units block (composite parent only) |
| Caption | `1200 × 1800 mm · height × width`; for a unit, `W07A · 1500 × 1200 mm · unit 1 of 2 in W07, which is 1500 × 2400 mm overall`; when no size was read, the existing sentence verbatim: `No size read for this opening — drawn as a square stand-in` |

#### **[gate 1]** No symbol legend, and no notation explained anywhere

Owner: *"i don't think lines like this relevant for ops"*, of the solid-V / dashed-V /
apex / arrow / unmarked key. **`ElevationLegend` is not rendered by `DrawingViewer` and
is not imported by it.** Ops staff read elevations for a living; that key is
customer-facing explanation.

The ruling is about the **class of content**, not that one block, so one more sentence
goes with it. The enlargement copy moving out of `Plate.tsx:98-101` reads:

> ~~Panel widths are in proportion to each unit's real size.~~ Indicative arrangement —
> the mullion positions are confirmed on technical review.

The first sentence explains how to *read* the drawing — same class, removed. The second
is a caveat about the drawing's **authority**, not its notation, and stays. Change 5 makes
the first sentence redundant anyway: the unit widths are now drawn on the leader.

`ElevationLegend` itself is **not deleted**: **this phase removes a render, not an API.**
The export is **defined once and called from nowhere** — its only non-comment occurrence
in `src/**` is its own definition; the other source hits are comments recording its
absence, and the rest of the repository's mentions are documentation. *(Written this way
because the first draft said "one grep, one hit", and the Codex stop-gate caught that as
another false count — the identifier appears in an ADR, four documents, a test and three
source files. "No caller" survives checking; "one hit" did not.)* It was added by the
ops2 record work for the very
plate this phase has just stopped rendering it from. Removing it is a separate decision
nobody has taken, so it stays.

#### **[gate 4]** Both leaders, wherever the real component draws them

The real `Elevation` draws the width leader below and the height leader rotated up the
left edge, at every size from `sm` up, and omits both only at `xs`, where a 46 × 34 glyph
has nowhere to put a number (`Elevation.tsx:122`, `:142-143`, `SIZES.dims`). The viewer
draws at `lg`, so **both leaders are always present** there. Nothing in this feature
passes `dims={false}`.

The one exception is the existing honest absence: when no size could be read, **no
leaders are drawn at all** and the square is a stand-in (VIEW-AC-8).

#### **[gate 5]** On a split, the units' dimensions and the overall, read together

Owner: *"for splits, showing dimensions of the units, as well as overall dimensions, would
be nice."* On a composite the viewer draws **two stacked width-leader rows**:

```
   ├──── 1200 ────┼──── 1200 ────┤     each unit's own width, ticked at the mullions
   ├───────── 2400 ─────────────┤     the overall, below it
```

plus the height leader up the side. Both are on the drawing, so the relationship is
legible in one look rather than assembled from a caption and a list. The caption states
`1500 × 2400 mm overall · height × width · drawn from its 2 units of 1500 × 1200 mm`, and
the units list keeps each unit's own size.

**Size order is `height × width` everywhere** (`src/ops2/projects/record.ts:607`), and the
leaders must agree with it — a composite captioned `1500 × 2400` is 1500 high and 2400
wide, so its units divide the **width**. (The mock's composite frames were internally
inconsistent with this before the gate and were corrected.)

### 2.3 Openers

| Opener | Subject | Criterion |
|---|---|---|
| `Plate`'s face (existing button) | the whole opening; for a composite, the whole assembly with units in proportion | VIEW-AC-1, VIEW-AC-3 |
| **The whole unit row** in the Units list (**new**) | that unit alone, labelled with its code and its own size | VIEW-AC-4 |
| The project record's row glyph | **nothing — it does not open the viewer.** The row is one navigation target and stays one | VIEW-AC-9 |

#### The unit opener is the row, not a control inside it

`<li class="lp-unit">` keeps only the hairline between rows; a
`<button class="lp-unit__open">` fills it and carries the grid, the padding and the
hover — **the shipped `.rl-open` move** (`src/ops2/styles/record.css:260`), reused rather
than re-invented.

A button placed *around the drawing alone* does not work here. Its only rest-state
affordance would be a box drawn behind it — out of this console's vocabulary, and a
pattern the owner has ruled against — and without the box it is pixel-identical to the
static glyph in the row above it. Hover is not a fallback: half this console's use is on
a phone, where there is none.

**Collision check — nothing else in the row wants a hit area.** `LineReview.tsx:92-124`
puts only `<span>`s inside `lp-unit`: the code, the product name, the size, the
customer's unit note (`room_label` on the segment) and the option chips. The row is
inert today, so making it one target takes nothing away.

**Constraints this places on the row, for the developer:**

- The button must never come to contain another interactive element. If a unit later
  needs its own control, this decision is reopened — a button inside a button is invalid
  and the inner one is unreachable.
- `min-height: 44px` on `.lp-unit__open`. A unit with no note and no options is 40 px on
  content alone; the floor is a hit-target rule and adds nothing to a row that clears it.
- Hover stays behind `@media (hover: hover)`, as `.rl-open` does.
- Focus ring `outline-offset: -2px` so it draws inside the row rather than over the
  hairline of the row above.

**Accessible names.** `Plate`: `Enlarge the drawing of W03` (explicit `aria-label`,
unchanged). The unit row: a visually hidden `<span class="sr-only">Enlarge the drawing of
</span>` as the button's first child, so the name reads *"Enlarge the drawing of W07A
AMJ67T Awning 1200 × 1500 mm"* — the purpose is named **and** the row's own words survive.
An `aria-label` on this button would be wrong: it would replace the unit's spec, size and
customer note with four words, and that content exists nowhere else in ops2.

### 2.4 Behaviour, focus, keyboard

- Enter or Space on a focused drawing navigates to the viewer; focus moves into it, the
  back control is the first stop, and its accessible name carries the opening's code
  (VIEW-AC-7).
- **Back returns to the line** (R29). The viewer is a screen in the tree, so it carries the
  header shape every other ops2 screen has: a back control at the **leading** edge naming
  the line it returns to (`‹ W03`), then the title. Not a trailing Close — a back-shaped
  control parked where an X was still reads as a dismiss, and the leading position is what
  makes the promise legible. The platform edge-swipe works alongside it.
- **Escape still closes it.** That is a keyboard convenience, not the navigation model:
  Escape performs the same history pop the back control does, never a second kind of exit.
- **It takes a history entry**, so leaving a line from an enlarged drawing takes **two
  backs**. Accepted by the owner — see the note at the head of this document.
  **This amends VIEW-AC-2.**
- On return, focus goes back to the drawing that opened it (trigger ref).
- The viewer scrolls its own body when the drawing plus its units block exceeds the
  viewport (phone landscape, small laptops). The page behind does not scroll.

### 2.5 Widths

Identical at both extremes — the drawing is scaled to the viewport and its leaders scale
with it. At 375 px the units block stacks below the drawing; there is no side-by-side
variant to design.

---

## 3. Phase 3b — the panel

### 3.1 The object, and the budget

The console's existing `lp-panel` — card, hairline border, 5 px corners, the raised
shadow — with the existing `Panel` component's **line budget** intact. The budget is
structural: the panel slices to it and states what it cut. **Three fact lines** when the
platform made the selection; **two** when a person did.

The budget counts **facts (dl rows), not rendered rows.** Long content wraps; it never
truncates, never scrolls inside the panel, and never gets an ellipsis — cutting a product
name mid-word hides the one thing the reviewer opened the panel to read (mock B12).

### 3.2 The door

When there is a detail to open, the panel becomes a **door**: visually the same card plus
a chevron at the trailing end of the title row.

Implement as a **stretched button, not a wrapping button**: the panel stays a
`<section class="lp-panel lp-panel--door">` and contains
`<button class="lp-panel__door">` positioned `absolute; inset:0`. A `<button>` that wraps
a `<dl>` is invalid HTML and flattens every key/value pair into one accessible name.

- Accessible name on the button: `Why this product — open what else was considered`
  (override variant: `…— open the comparison and what else was considered`; composite:
  `…— open why it was split and what else was considered`).
- Hover: `--ds-color-brand-wash`. Focus-visible: the console's 2 px brand ring, offset 2,
  drawn around the **card**, not the invisible button.
- **No chevron and no door** when there is no detail: WHY-AC-8, WHY-AC-9, WHY-AC-10,
  WHY-AC-37. A control drawn for a panel that would open empty is the defect this effort
  has already recorded four times.

### 3.3 The line vocabulary — labels are fixed

| Label | Present in | Carries |
|---|---|---|
| **Had to meet** | recommendation states only | the caps, and an origin label beneath them |
| **This one** | every state | the line's current product's recorded figures; on a composite parent, the make-up |
| **These ones** | ops-created split only | each unit's recorded figures |
| **Chosen** | every state | one sentence: why it won, or who chose it |

Nothing else. R6's three labels are kept on an overridden line and **only the "Chosen"
sentence changes** (ASSUMED §13.10); which of frame or glazing moved rides as a quiet
qualifier on the figures line it explains, so the budget is not breached (§3.5).

### 3.4 Copy — the whole string table

**Origin labels** (R4, `requirement.basis`) — rendered as a quiet second line under the
caps, muted, `--theme-font-size-xs`. Never a badge, never a chip.

| basis | label |
|---|---|
| `explicit_energy_report` | parsed from an energy report |
| `plan_derived` | modelled by the platform from the plan |
| `default_envelope` | a default value the platform applies |
| `human_override` | set by a person |
| *(absent)* | *(no label — the caps line says there was no requirement)* |

**"Had to meet" value**

| Case | Copy |
|---|---|
| Both caps | `Uw ≤ 3.90 · SHGC ≤ 0.44` |
| Uw only | `Uw ≤ 3.90` |
| SHGC range | `Uw ≤ 3.90 · SHGC 0.35–0.44` |
| `requirement.absent` | `this opening had no thermal requirement` — **no cap figure at all** (WHY-AC-3) |

**"This one" value**

| Case | Copy |
|---|---|
| Both recorded | `Uw 3.72 · SHGC 0.41` |
| One recorded | `Uw 3.72 · SHGC not recorded` |
| Neither recorded (`{uValue:null,shgc:null}`) | `not recorded` (muted, italic) |
| Column NULL — saved before the capture | `not recorded`, **plus** the panel foot: `This line was saved before performance figures were kept on a line.` |
| Composite parent, machine-proposed | `made as 2 units — an awning beside a fixed pane` |

Never `0`, never `—`, never an omitted row. (WHY-AC-4, SNAP-AC-8, §11 "Null thermal
figures".)

**"Chosen" sentence, by `competingTier`** (WHY-AC-5). The percentage is read from the
run's stored `tolerance` and formatted — `0.08` renders `8%`. It is **never hardcoded**
(WHY-AC-6), and the band is **named, never paraphrased as "closest available"** (R7).

| tier | sentence |
|---|---|
| `meets` | the cheapest of those that met the caps |
| `within_tolerance` | nothing met the caps, so the cheapest within 5% of the closest |
| `misses` | nothing came within the 5% band, so the closest was taken |
| `thermal_unknown` | no figure existed on the constrained axis, so it was chosen on fit and price |
| `does_not_fit` | nothing fitted this opening, so the best fit was taken |
| requirement absent | the cheapest that fitted the opening — **claims no thermal victory** |
| composite, machine | this split ranked ahead of the best single unit, *AMJ92 Sliding* |
| **selection changed** | a person chose this — the platform had recommended *AMJ67T Awning* |
| no run (person picked) | a person chose this product |
| ops-created split | a person decided this split |
| pre-`outcome_json` run | recorded by an earlier model, whose reasoning was not kept (muted) |

**Tone.** The "Chosen" sentence renders in `--ds-color-warning-text` when
`competingTier` is anything other than `meets`. In this console warning means *"ours to
resolve, the human proceeds"* (`src/ops2/styles/line.css:214`). **Never
attention/red** — nothing on this surface is an error, least of all a person's decision.
Figures themselves are never coloured.

### 3.5 The eight panel states

| # | Condition | Lines | Door? | Mock |
|---|---|---|---|---|
| S1 | recommendation, unchanged, `meets` | 3 | yes | B1, B10 |
| S2 | recommendation, unchanged, tier ≠ `meets` | 3 (Chosen in warning tone) | yes | B2 |
| S3 | recommendation, **selection changed** | 3; "This one" = the human's figures + change qualifier; "Chosen" names the platform's pick | yes | B3, B12 |
| S4 | machine-proposed composite (`composite_origin = 'ai'`) | 3; "This one" = the make-up | yes | B4 |
| S5 | ops-created split (`composite_origin = 'ops'`) | 2, label **These ones** | **no** | B5 |
| S6 | no selection run — client/manual pick, figures recorded | 2 | **no** | B6 |
| S7 | no run, figures absent or never captured | 2, "This one" = `not recorded`, + foot sentence | **no** | B7 |
| S8 | run predates `outcome_json` | 2, "Chosen" = earlier-model sentence | **no** | B8 |
| — | order record | **no panel at all**, no sentence in its place | — | B9 |
| — | `requirement.absent` | as S1 with the absent copy | yes | B11 |

**S3's change qualifier** (the panel must say *which* of frame or glazing moved, R12):
appended to the "This one" value as `— frame changed` / `— glazing changed` /
`— frame and glazing changed`, in `--ds-text-secondary`. It qualifies the figures it sits
beside; it is not a fourth line and not a badge.

**S5's figures line** shows at most **three** units, then the budget's own remainder
sentence: `+2 more units`. There is no detail slide-out on an ops-created split, so the
units beyond the third have nowhere else to live — which is exactly why the remainder is
*stated* rather than silently dropped. This is the one place the panel's `more` slot
fires on content rather than on an option count.

**S7's foot sentence** distinguishes the two absences the data model distinguishes
(SNAP-AC-8): column NULL means *saved before the capture shipped* (the foot sentence
appears); `{uValue:null,shgc:null}` means *no figure exists for this product* (no foot
sentence — `not recorded` is the whole of it). **Nothing is looked up to fill either
gap** (D3/WHY-AC-9).

### 3.6 Loading, error, and stale (mock C5)

| State | Behaviour |
|---|---|
| Loading | The panel renders with its title and **three skeleton bars** at the widths the three lines will occupy, `aria-busy="true"`. It does not jump when the data lands. The rest of the line page is unaffected — the rationale read is independent of the record read. |
| Error / unreachable | The panel stays, and says `The reasoning for this line could not be read just now.` with a **Try again** control. It **never** falls back to `not recorded`: a missing fact and an unreachable one are different things and only one of them is worth retrying. |
| 404 (line not a parent of this project) | The panel is simply absent. The line page's own "not on this project" path already owns that refusal; the panel does not duplicate it. |
| Re-entering the page | Refetch, following `useProjectRecord`'s pattern (stale-response guard, re-enter refresh). |

### 3.7 Phone vs desk

The line page is one reading column at both widths, so the panel does not change shape —
it just has more room. The only width-dependent behaviour is **where its detail opens**
(§4.6).

---

## 4. Phase 3b — the detail slide-out

### 4.1 The container

`SidePanel`, reused: a **right-hand slide-out** at desk width (`min(88vw, 520px)`, in from
the right, corners rounded on the leading edge only). Title `Why this product`.
**`SidePanel`'s `footer` slot is not used** — see **[gate 6]** below.

**No second panel idiom is invented.** No bottom sheet at the desk, no inline expansion,
no full route.

#### **[gate 2]** On the phone it opens FULL SCREEN, immediately — and `SidePanel` must change

Owner: *"C4 - full screen stright away"*. Not a partial sheet the reader drags up.

**Read this before reusing the component.** `SidePanel` today presents on the phone as a
**half-height sheet with Ionic's drag handle** — `src/ops2/chrome/SidePanel.tsx:91-92`:

```tsx
initialBreakpoint={wide ? undefined : 0.5}
breakpoints={wide ? undefined : [0, 0.5]}
```

Reusing it as-is reproduces exactly what was just rejected. What has to change:

- **Add a prop**, e.g. `phoneForm?: "sheet" | "full"`, defaulting to `"sheet"`.
  `WhyDetail` passes `"full"`.
- **Do not change the default.** The Projects filter panel is the other caller and its
  phone form is approved and shipped; a global change would silently alter a surface
  outside this feature.
- For `"full"`, pass **no** `initialBreakpoint` and **no** `breakpoints` — an `IonModal`
  without them presents full-screen, and Ionic renders the drag handle only for sheet
  modals, so the handle disappears on its own. Do not hide it with CSS.
- The `key={wide ? "side" : "sheet"}` remount guard must key on the **resolved form**
  (`side` / `sheet` / `full`), or a window crossing the change point while the panel is
  open keeps the form it opened in.
- At full screen there is no visible scrim; the backdrop settings are inert rather than
  wrong, and need no change.

#### **[gate 3, amended by gate 7]** The control is BACK — R29

Owner, verbatim:

> *"dismiss == back button on the Why this product screen, it is part of the tree:
> projects->projectDetails/list->itemDetails->whyThisProduct->switch(modal aka
> Confirm/Cancel). Everything that is not modal - has back an action plus whatever gesture
> it lives with as standard."*

"Done" was rejected first (it claims something was completed; this screen completes
nothing). **An X is rejected too**, for a different reason: an X claims an overlay, and
this is a node you navigate *to* and return *from*.

**The header becomes an ops2 screen header** — the same shape as `OpsPage`'s
(`.ops-top`): a back control at the **leading** edge naming where it returns to
(`‹ W03`), then the title `Why this product`. Not a trailing control. That shape is what
makes the promise legible before anyone presses anything.

**Presentation and navigation model are separate, and both are specified here:**

| | What is specified |
|---|---|
| **Presentation** | **Unchanged and still approved** — the right-hand slide-out at the desk (Q9, and the mock he approved), full screen on the phone (gate 2). |
| **Navigation model** | **Changed** — opening the detail is a **navigation, not an overlay toggle**. It pushes a history entry, and *back* means back: the header control, the browser/hardware back button, and the platform edge-swipe gesture all return to the line page. |

A slide-out can be a routed screen; the two are orthogonal. But they must be specified
together, because **`SidePanel` today is an overlay driven by a boolean** — open a
`useState`, close it, no history touched. Hanging a back-shaped button on that produces
the one outcome worse than an X: a control that promises the tree and does not deliver
it, where the browser back button leaves the line page entirely with the panel still
notionally open.

**So `WhyDetail` is opened by a route change, not by `setOpen(true)`.** The panel's door
(§3.2) performs a navigation; the detail renders while that location is active;
every back affordance pops it. **The location is `/projects/:id/line/:lineId/why`** —
owner-decided, so this screen is addressable: a pasted link and a refresh both land on
it, with the line page rendered beneath.

Consequences the developer must not miss:

- **Escape still closes it**, and closing by any route is a history *pop*, never a second
  forward entry — a reviewer who opens and closes the detail three times must be able to
  press browser-back once and reach the project record.
- **The rationale fetch is keyed to the line, not to the panel's open state**, so a back
  and a re-open does not refetch on a warm record (§3.6's re-enter rule already says this).
- **No `IonBackButton` `defaultHref` guesswork**: the detail always has a line to return
  to, because the only way in is from that line. A cold link is only possible under
  option A, and there the fallback is the line page.

---

### 4.2 Reading order — the rule

> **The requirement, then what is unusual about this line, then the ladder.**

So the news is never below the routine. Concretely:

1. **What it had to meet** — always first.
2. **The platform's pick, and this line's** — only when the selection changed.
3. **Why it was split** — composite only.
4. **Each unit's own band** — composite only.
5. **What else was considered** — the ladder. Always last.
6. *(closing)* the unsupplied-make-up sentence, when one was recorded, and then always
   `Nothing on this screen changes the quote — it is read and closed.`

The detail **ends with that sentence and nothing else**. There is no footer bar: a bar
whose only remaining content is one muted line is a bar built for a button that no longer
exists (**[gate 6]**).

For the ordinary machine case, blocks 2–4 do not exist and the ladder is second — which
is the reading the surface is mostly for. The detail **scrolls**; only the panel is
budgeted.

### 4.3 Block 1 — What it had to meet

A `kv` grid, one row per axis, each carrying its own origin label beneath the figure
(R4). On an overridden line it gains the quiet sentence:

> This is the target the platform recorded when it made its recommendation. A later
> change to the product does not move it.

**The requirement is read from the stored run and nowhere else** (WHY-AC-25/26). No code
path on this surface resolves, recomputes or re-derives a requirement.

When `requirement.absent`: one line, `This opening had no thermal requirement.`, and no
axis rows.

### 4.4 Block 5 — the ladder

Five rows maximum: the chosen product first and marked, then up to four runners-up by
ascending ladder rank (R8, ASSUMED §7.3). Fewer candidates → fewer rows, **no
placeholders and no count of anything beyond the list** (WHY-AC-13).

Each row:

```
AMJ67 Awning  · chosen                      Uw 3.72 · SHGC 0.41
met the caps
```

- **Name** — the recorded product name; a product that has since left the catalogue still
  renders from the recorded facts and is never blank or dropped (WHY-AC-19).
- **Figures** — the recorded Uw and SHGC. A missing figure says `Uw not recorded` — the
  one spelling of absence this document uses (§3.4), and the one that shipped
  (`whyCopy.ts:113`) — never a dash.
- **Verdict**, by tier (WHY-AC-17): `met the caps` · `within the 5% band` ·
  `missed the Uw cap` / `missed the SHGC cap` / `missed both caps` ·
  `no figure on the constrained axis` · `would not fit at this size`.
- **The chosen row's mark**: `· chosen` normally; **`· the platform's pick`** when the
  line's selection has changed — the row must not claim to describe the current line
  (R24).
- On a split candidate the figures cell reads `2 units` rather than an invented
  assembly figure.

**Rows are not interactive.** `<li>`, not buttons: nothing here prices, switches or
selects (R1/WHY-AC-16), so nothing looks tappable — no chevron, no hover state, no
trailing control.

Closing note: `The chosen product and the next four by rank. No price, nothing to price,
and nothing here changes the line.` When fewer than five exist: `Three candidates were
recorded for this opening — the list is what exists, with nothing padded and no remainder
counted.`

### 4.5 Block 2 — the human-selection comparison (mock C2)

Two cards of the same shape, side by side, so a reviewer compares by **looking** rather
than by reading:

| Left — `PLATFORM RECOMMENDED` | Right — `ON THIS LINE NOW` (brand wash) |
|---|---|
| the recommended product | the current product |
| its glazing | its glazing, with the change qualifier |
| its recorded figures | the line's recorded figures |
| its verdict against the caps | its verdict against the **same** caps |

Below, the sentence that carries R2:

> A product is changed for reasons the platform cannot see — availability, lead time,
> what the customer asked for. Both are shown so the difference is readable, not so one
> of them is right.

**When the current figures are absent** (changed before the capture shipped, or resolved
to null): the right card's figures read `not recorded`, its verdict row is **omitted
entirely** rather than guessed, the left card and the requirement are shown unchanged,
and no live lookup is made (WHY-AC-27).

**Absent when nothing changed** — no block at all, not an empty one (WHY-AC-24). And it
appears whenever frame **or** glazing moved (R12/WHY-AC-23), derived by comparing the
recorded recommendation's product+variant against the line's current product+variant —
never from `origin` (WHY-AC-29). If a customer restores the AI proposal, the same
comparison run again removes the block with no state to unwind (WHY-AC-30).

At 375 px the two cards stack, current first.

### 4.6 Blocks 3 and 4 — composites (mock C3)

**Why it was split** — the same two-card shape: the make-up that won (`2 units — awning +
fixed`, its unit products, `ranked 1st`) beside the single unit it beat (its name,
figures, `ranked 4th`), and the sentence `A make-up of two units and a single window
competed in the same ladder; this is the single unit the split beat.` When no beaten
single was recorded, the right card is omitted and only the make-up shows.

**Each unit's own band** — one card per unit:

```
W07A  AMJ67T Awning
Had to meet  Uw 0.37–0.41      This one  Uw 0.39 · SHGC 0.38
modelled by the platform from the plan
```

- Each unit states **its own** caps and **its own** origin label — an awning lite at
  0.37–0.41 beside a fixed lite at 0.50–0.56 must read as two different bands, not one
  (R16/WHY-AC-34).
- A unit with no recorded band: `Its band was not recorded.` — **and nothing is computed
  for it** (WHY-AC-35).
- A unit carrying a `segment_thermal_review` flag shows it against **that unit**, in the
  warning card treatment already used by the Needs-review panel (WHY-AC-36).

**The unsupplied make-up** (WHY-AC-38): the recorded sentence, quiet, at the end of the
detail — `A three-unit make-up was tried and no frame system could supply it.` When the
review flag it lives on has since been resolved, the trace is gone and **nothing is
stated** (design §2.3, named residual).

### 4.7 Ops-created split

**No detail exists.** No door, no slide-out, no split reason, no alternatives — a person
decided it and there is no machine rationale to open (R17/WHY-AC-37).

### 4.8 Focus and keyboard

| Moment | Behaviour |
|---|---|
| Panel door focused | Enter or Space opens the detail |
| Detail opens | Focus moves into the screen; the back control is the first stop and the title is announced with it |
| Escape, back control, browser back, edge-swipe | All pop the same history entry and return to the line; **focus returns to the panel door that opened it** |
| Tab inside the detail | Reaches **the back control and nothing else** — the ladder rows, the comparison cards and the closing note are not focusable. One tab stop, by design |

Screen-reader shape: each block is a `<section>` with its heading; the ladder is a `<ul>`
whose `aria-label` is `What else was considered`; the comparison cards' column heads
(`Platform recommended` / `On this line now`) are real text, not `::before` content.

---

## 5. **[gate 6]** The detail has no action — R28

Owner, verbatim: *"do not implement CTA change the product. Need to have more thoughts on
how to implement this. Having a button implies that some product must be preselected,
which we don't have conceptually. not having a button means another panel perhaps.
ultimately, switching products is not part of the current run."*

This **supersedes D4** (*"you may open a placeholder"*). Stated positively, so a later
reader does not mistake it for an oversight and helpfully restore one:

> **The Why detail carries no action at all. Its only control is back.**

That is the coherent end of his earlier ruling that *"the panel does not require actions,
unless an action is chosen, which is a separate screen anyway"* — and it is the same
instinct behind the ladder rows being `<li>` rather than buttons (§4.4): a control implies
a product is already selected to change **to**, and this surface deliberately offers no
such thing.

**Not built, anywhere in this feature:**

- No "Change the product" control — not in the detail, not on the panel, not on the line
  page; not enabled, and not disabled either.
- **No placeholder and no stub** — no `LineEditStub.tsx`, no
  `/projects/:id/line/:lineId/edit` route, no route registration in `Ops2App.tsx`.
- No footer on the `SidePanel`; the closing note lives at the end of the scrolling body
  (§4.2).

**Status: deferred, pending a decision on how product switching should work.** Not
"unnecessary" — the owner is still thinking about it, and his own framing names the open
question: a button presumes a pre-selected product, and the alternative may be another
panel. When that decision is made it arrives as its own spec. Its absence here is
deliberate, and §7's checklist is what keeps it that way.

---

## 6. Component reuse map

| Need | Existing component | Change |
|---|---|---|
| The panel object | `LineReview.tsx`'s local `Panel` | Extract or extend with an optional `onOpen`; the door renders a stretched `<button class="lp-panel__door">`. Budget mechanism unchanged. |
| The slide-out | `src/ops2/chrome/SidePanel.tsx` | **Two changes, both from the gate (§4.1):** a `phoneForm?: "sheet" \| "full"` prop defaulting to `"sheet"`, and a leading **back** control in place of `Done` (R29). Neither may alter the Projects filter panel's approved behaviour. Its `footer` slot goes **unused** here (R28). **And R29 makes it route-driven for this caller** — opened by a navigation rather than a boolean, with a leading back control in the header instead of a trailing dismiss. The filter panel stays an overlay with its own control. |
| Drawings | `src/components/quote-project/Elevation` | None — both leaders are its default from `sm` up. `ElevationLegend` is **not rendered** (gate 1). The export stays: this phase removes a render, not an API, and it now has no consumer anywhere — removing it is a separate decision. |
| Full-screen viewer | — | **New** `src/ops2/chrome/DrawingViewer.tsx` (design §4.6 interface). |
| Plate enlargement | `Plate.tsx:60-106` | **Deleted**, replaced by the viewer. |
| Unit drawings | `LineReview.tsx` `Units` + `.lp-unit` in `line.css` | The **row** becomes a viewer-opening `<button class="lp-unit__open">` carrying the grid and padding; `<li class="lp-unit">` keeps only the hairline. Mirrors `.rl-row` / `.rl-open` in `record.css`. |
| Visually hidden text | — | **New** `.sr-only` — the console has no such utility yet and the unit opener needs one. |
| Warning treatment | `.lp-review` in `line.css` | Reused for a unit's review flag. |
| Absence styling | — | **New** `.absent` (muted, italic) — the console has no absence role yet and this surface needs one in five places. |
| Skeletons | `IonSkeletonText` as `LinePage` uses it | Three bars inside the panel. |
| Buttons | Ionic outline / solid under the radius cap | None. |

Stylesheet: everything new goes in `src/ops2/styles/line.css`, FrameFlow tokens only —
no hex, no `--ion-color-step-*` (they are undefined in this stylesheet set and render
full-strength black).

`LineReview.tsx`'s header comment must be corrected as part of this work: lines 38–45
state the superseded rule (*"absent entirely on a composite"*) and the read-only note's
"no Why this product" clause. Both are void under R14/WHY-AC-32.

---

## 7. What a reviewer can check in one pass

- [ ] Every panel has 3 lines or 2 — never 1, never 4, never a padded absence.
- [ ] Every door has a detail; every detail-less panel has no chevron.
- [ ] No `$`, no `GST`, no `ex`/`inc` anywhere inside a Why panel or its detail.
- [ ] No certification word anywhere on the line page.
- [ ] The ladder is ≤ 5 rows and carries no count beyond itself.
- [ ] No ladder row is focusable or hoverable.
- [ ] Every pressable thing is legible as pressable **at rest, without hover** — and none
      of them earns that with a box drawn behind it.
- [ ] A unit row is one target, at least 44 px tall, containing no other control.
- [ ] The tolerance percentage matches the run's stored figure, not `5` hardcoded.
- [ ] "Had to meet" is byte-identical on an overridden line and on the same line before
      the override.
- [ ] The string table contains none of: wrong, incorrect, mistake, error, correction.
- [ ] The order-record line page contains no panel and no sentence about one.
- [ ] The detail has **exactly one** focusable control: back. No footer bar, no CTA,
      and no stub route registered anywhere (R28).
- [ ] Browser back and the edge-swipe gesture both return from the detail to the line —
      not to the project record, and not with the panel still open (R29).
- [ ] `/projects/:id/line/:lineId/why` opens the detail cold, from a pasted link and after
      a refresh.
- [ ] The drawing viewer has a leading back control naming its line, and **no** trailing
      Close anywhere.
- [ ] Leaving a line from an enlarged drawing takes two backs. **That is correct** — do
      not collapse it.
- [ ] Opening and closing the detail three times leaves one history entry to pop, not six.
- [ ] Escape closes the viewer and the detail; `history.length` is unchanged by either.

---

## 8. **[gate 8]** R30 — a console convention, recorded for later

Owner: *"modals have controls on top, btw, title centered."*

**Nothing in this feature is a modal**, so this changes nothing built here. It is recorded
so the convention is inherited rather than rediscovered:

> **A modal carries its controls on top, with its title centred.**

Where it applies, and where it does not:

| Surface | Modal? | Why |
|---|---|---|
| The **switch confirmation** (deferred, §5) | **Yes** — the owner names it himself: *"switch(modal aka Confirm/Cancel)"* | It asks for a decision and returns an answer. When it is built, R30 is its header spec. |
| The **Why detail** | No | R29 puts it in the tree; it has a back control at the leading edge and a left-aligned title (§4.1). |
| The **drawing viewer** (§2) | **No** — owner-confirmed, against the recommendation | Leading back naming the line, left-aligned title, its own history entry (R29, amending VIEW-AC-2). Three of us assumed otherwise; see the head of this document. |

The distinction that makes the convention usable, and it is **narrower than it looks**:
**a modal asks a question and returns an answer.** Nothing else qualifies — not a screen
you navigate to however it is presented, and **not an enlargement of an on-screen element
either**, which is the assumption three of us got wrong. If it does not have an answer to
give back, it is a screen, and screens have back.

---

## 9. Decisions needed

**None outstanding for the owner — both open questions came back answered — and one
deferred BY him.**

**Answered — both R29 questions.** The detail carries its own URL
(`/projects/:id/line/:lineId/why`), and the drawing viewer is a tree node with back rather
than a modal. Both are folded in; see the head of this document. **One item routes to the
architect, not the owner:** the viewer's routing mechanism — its own URL segment or a
state-only push — which this document deliberately leaves open.

**Deferred — product switching (R28).** How a reviewer changes a line's product is an open
question the owner is still thinking about, in his own framing: a button presumes a
pre-selected product, and the alternative may be another panel. Nothing in this feature
anticipates either answer — no control, no route, no stub (§5). This is a deferral, not a
decision that it is unwanted, and it does not block anything here: the surface reads
completely without it.

Four judgements were made here rather than escalated; each is reversible and is flagged in
the mock's annotations:

1. **The panel's door is a stretched button, not a wrapping one** (§3.2) — an
   accessibility mechanic, not a design choice.
2. **The change qualifier ("glazing changed") rides on the "This one" line** rather than
   becoming a fourth line or a badge (§3.5) — the only placement that satisfies both
   "the panel must say which of frame or glazing changed" and ASSUMED §13.10's
   three-labels-unchanged.
3. **The ops-split panel caps its figures at three units** and states the remainder
   (§3.5) — the budget mechanism applied to the one state that can hold arbitrarily many
   facts.
4. **The unit row is the viewer's opener, not a control inside it** (§2.3) — routed from
   the ui-designer's visual pass, which correctly removed a boxed affordance and left a
   live control with no rest state. Resolved with the shipped `.rl-open` pattern rather
   than a new one.

Registered `ASSUMED:`, vetoable at acceptance:

- **§4.4** — the chosen row is marked `· the platform's pick` (not `· chosen`) on an
  overridden line, so no row on the surface claims to describe the current line.
- **§3.6** — a failed rationale read keeps the panel and offers a retry, rather than
  hiding the panel. Hiding it would be indistinguishable from D2's deliberate absence.
- **§4.6** — when no beaten single unit was recorded, the "Why it was split" block shows
  the make-up alone rather than disappearing.
