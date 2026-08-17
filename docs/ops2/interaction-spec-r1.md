# ops2 R1 — interaction spec

**Mock:** `docs/mocks/ops2-r1-ionic.html` — a single self-contained file, no build
step, opens on a phone from the filesystem. Source: `docs/mocks/ops2-r1-ionic-src/`.
**Framework:** `@ionic/react` 8.8.18, Ionic's own default theme including its own
dark palette (`@ionic/react/css/palettes/dark.system.css`).

This spec is the contract. Where it and the mock disagree, this document is
wrong and should be corrected — the mock is what the owner approved.

Binding inputs unchanged: `docs/ops-redesign/GRILL-CONCLUSIONS.md` (D1–D19,
C1–C8), `docs/specs/ops2.md`, `docs/ops2/register.md`,
`docs/ops-redesign/LEARNINGS.md`.

---

## 0. What is Ionic's and what is ours

The owner lifted the design-language constraint and asked to standardise as much
code as possible. So:

**Ionic's, untouched:** the app shell, the split pane, the menu, headers,
toolbars, footers, segments, lists and items, badges, notes, buttons, inputs,
selects, action sheets, sheet modals, page transitions, the back gesture, focus
management on navigation, the type ramp, spacing, radii, hues, and both palettes.

**Ours — `src/ops2.css`, and nothing else:** three functional rules (§1) and the
layout for four things Ionic has no component for — the drawing plate, the line
scroller, the desktop rail/canvas split, and the docked edit panel.

There is **no palette, no font stack and no webfont** in our layer. Two derived
tokens (`--ops-quiet`, `--ops-ink`) and four surface/line tokens are mixed from
Ionic's own text and background colours with `color-mix`, so they track both
palettes without choosing a colour.

> **Implementation note, found by measurement and easy to repeat as a bug.**
> Ionic does not define `--ion-color-step-*` in this stylesheet set at all, and on
> the LIGHT palette it does not define `--ion-text-color`, `--ion-background-color`
> or `--ion-text-color-rgb` either — core.css hardcodes `#000`/`#fff` in its own
> rules and only sets the variables in the dark palette. Relying on the step
> palette put "not priced" at 3.26:1 on dark; relying on
> `rgba(var(--ion-text-color-rgb), .68)` made every quiet role render
> full-strength black on light. Both are silent failures. Use the
> `color-mix(… var(--ops-text) …%, var(--ops-bg))` form in `ops2.css`, which
> carries literal fallbacks.

---

## 1. The three rules that survive any theme

### A1 — Legibility floor
Any text carrying a fact is readable text: **≥4.5:1 against its actual composited
background, in both palettes.** This covers absence ("not priced", "no rate",
"size not read"), captions, GST bases and helper text. Class `.absent` / `.basis`
/ `ion-note.fact` take `--ops-quiet`.

Measured on the mock: light — nothing below 4.5, worst 6.1. Dark — nothing below
4.5, worst 7.95.

### A1b — A blocked control is inert, not faded
Ionic paints `:disabled` as `opacity: .5` on the host via `.button-disabled`,
which takes the label under 3:1 — so the one thing the operator needs to read,
*why they cannot proceed*, is the first thing to go. Apply `.inert` alongside
`disabled`: full opacity, a flat surface that plainly is not pressable, label at
`--ops-ink`.

Used on: `Issue quote` while any line is unpriced.

### A2 — Warning and danger never share a treatment
- **`warning`** — ours to resolve, stops nobody. A bordered note (`.note-warning`)
  in the flow of text, at the cause. No icon, no acknowledgement, no gate.
- **`danger`** — nothing proceeds. A filled control or a filled state.

Collapsing them makes the machine look like it is objecting to a human decision,
which C4 forbids outright.

| Case | Tone |
|---|---|
| Glazing misses the stated requirement | warning |
| Undersize / oversize dimension entered | warning |
| Mixed frame systems on one elevation | warning |
| No rate for a configuration | warning |
| Delivery zone unpriced | warning |
| A panel failed to load | danger |
| Delete confirmation | danger |

### A3 — Every money figure carries its GST basis
On the figure, in the account's ex/inc setting, at a legible size — not a column
heading, not a footnote. **One component renders money** (`Money` in `src/ui.tsx`)
so no call site can forget it. Absence renders as a reason, not a dash:
`no rate`, `no rate for Zone 4 — Outer metro`.

---

## 2. Critique 1 — nothing scrolls sideways to reach a destination

**The rule.** A fixed, small set whose every member must be reachable — tabs,
segments, filters, sections, destinations — may never hide a member off-screen.

**The distinction that licenses the one exception.** *Content* may scroll.
Eighteen openings are the material being worked through, not a set of
destinations; moving along them is inherently a scroll. See §3.

**Where it applies, and what each became:**

| Was | Is now |
|---|---|
| Lines/Job control | `ion-segment` with `scrollable={false}` **stated in the markup** and two equal `flex: 1 1 0` columns. A default is not a decision. |
| Unpriced filter | A full-width `ion-item` row, `aria-pressed`, `color="warning"` when on. Never a chip. |
| Five lens chips (≈435px at 390px, fifth deliberately cut — R-68) | **Withdrawn.** See §4. |
| Seven job chips (R-70, already rejected) | Push-row `ion-list`, unchanged. |
| Eight nav destinations | Vertical `ion-list` in the menu. |
| Six-phase progress ribbon | `repeat(auto-fit, minmax(92px, 1fr))` — it **wraps**, it does not scroll. |
| Two-column fact rows below 400px | Reflow to label-over-value (R-69). Reflow, never truncation. |

**R-68 is dead.** "The fifth chip is cut on purpose so the strip reads as
scrollable" is the exact pattern the owner rejected. Do not reintroduce it in any
form, including a narrower strip, a fade-out edge, or a dropdown.

---

## 3. Critique 2 — the bottom deck replaces the header stepper

### 3.1 What was wrong
`‹ 4/18 ›` in the 48px identity band: two small arrow targets crowded against a
truncating title, at the top of the screen — the furthest point from the thumb —
reporting an index and saying nothing about where either arrow would go.

### 3.2 What replaces it
A **deck** on the bottom edge. The scroller and the action footer are **one
composition**, not two bars stacked, because the footer budget is the scarcest
space in the console:

```
┌──────────────────────────────────────────────┐
│ 4 / 18 │ W01  W02  W03 [W04] W05• W06 …       │  44px  scroller
│ lines  │                                      │
├──────────────────────────────────────────────┤
│ [ Edit W04 ]                           [ ··· ]│  48px  actions
└──────────────────────────────────────────────┘
```

**Measured budget:** 44 + 48 = **92px**, and it is the only chrome at the bottom.
The shipped alternative was a 36px lens chip strip plus a 56px footer = 92px — so
the deck costs **nothing**, and it also removes the chip strip from the top of the
body. With the 56px identity band, total chrome on a 375×812 phone is 148px.

### 3.3 The parts

**The position label** — fixed, never scrolls, at the left of the band.
`4 / 18` over `lines` (or `unpriced` when filtered). Answering "where am I" never
depends on counting pills or on where the run happens to be scrolled.

It is also a **button**: it opens the line switcher sheet. That is what makes the
pattern hold at 100 lines — sequential movement is the filmstrip, non-sequential
movement is one tap, and neither degrades as the record grows.

**The run** — one `<button class="pill">` per line in the **filtered** set
(R-155), showing the line code and, for a line needing review, a 6px dot.
`scroll-snap-type: x proximity` and `scroll-snap-align: center` so a flick lands
on a line rather than between two. Minimum pill width 52px, full 44px hit height.
The active pill is `aria-current="true"`, filled in `primary`, and is
`scrollIntoView({inline: "center"})` whenever the line changes — so however you
arrived, the strip already shows where you are.

Pills carry the **code only, not the drawing**. The elevation is already in the
list, the switcher sheet and the plate; a 56px-tall pill to fit one would have
cost the deck 12px for a fourth copy.

**The switcher sheet** — `IonModal` with `breakpoints={[0, 0.65, 1]}`,
`handleBehavior="cycle"`. Drag handle, drag-to-dismiss, scrim, focus trap and Esc
are the framework's. Rows carry the `xs` drawing, the code, the room, the money
with its basis, and a `needs review` badge.

**The action row** — R-153 unchanged: one primary taking the width, `···` for
every secondary and every overflow, and a blocked primary's reason beneath it
**inside** the footer. This is the one footer allowed a second line.

### 3.4 Routes to the same move (R-158 — never only one)
1. The filmstrip.
2. The switcher sheet.
3. The record's own list — still the primary route.
4. `[` and `]` on a keyboard (suppressed while focus is in a field).
5. Horizontal swipe on the body — **accelerator only.** §13.8's thresholds
   verbatim: ≥12px horizontal, <8px vertical, and never starting in the left 20px,
   which belongs to the OS/plane back gesture.

Movement uses `history.replace`, not `push`: lateral movement inside a zone never
deepens the stack, so Back still returns to the list from wherever you stopped.

### 3.5 Rejected, and why
- **Swipe alone** — R-158 forbids a gesture as the only route, and §13.8 had
  already spent horizontal swipe on the lenses. (Freeing it is a side benefit of
  §4.)
- **Two labelled prev/next buttons at the bottom** — better than arrows in a
  header, but it still answers "where am I in eighteen" with a number, and it
  cannot scale: at 100 lines it is 100 taps.
- **Keeping the stepper and only enlarging it** — the objection was to the
  mechanism, not the target size.

---

## 4. The disclosure ruling — what replaced it

> "I can see you creating collapsable sections for all the different information
> groups. Will stop you here — don't like the approach. not great UX pattern."

Accepted, and it is right on the merits: disclosure hides content behind clicks,
defeats scanning, and shifts the layout under the pointer.

**Nothing in ops2 is a collapsible information group.** No `ion-accordion`, no
`<details>`, no disclosure-in-place. This is a standing rule, not a one-off.

### 4.1 The five line sections are simply open
All five, in R-43's fixed order, in one vertical column, nothing to press. A
phone scrolls vertically for free; that was never the scarce axis.

Order and verdict source (R-45 — real fields, never `confidence_band`):

| Section | Verdict from |
|---|---|
| Why this product | `recommendation_basis`, humanised |
| Glass & thermal | requirement met / missed |
| Build | unit count |
| Price | rate present / absent |
| Trail | **note count**, never an event count |

### 4.2 The verdict index pays for what the chip strip was actually for
Directly under the plate: five name/verdict pairs in
`repeat(auto-fit, minmax(148px, 1fr))` — one column at 320px, two above ~500px.
Each is an in-page link to its section.

It **hides nothing** (the whole section is below in the flow), it **wraps** rather
than scrolls, and it is an **index rather than a control**. That is what
distinguishes it from both rejected patterns.

### 4.3 Rules that changed shape
- **R-43** kept — the section headings are the anchors the chips were. "Pressing
  the active chip collapses it" has no referent any more.
- **R-44** kept, and strictly stronger: a failed panel says so in its own heading
  and cannot be collapsed out of sight, because nothing collapses.
- **R-47** — the arrival walk **becomes a mark, not a movement.** It used to
  expand the first matching section; with nothing to expand it tones the section
  and its index row instead. The page does not move and the plate is not scrolled
  away. Same intent, no hidden state, and nothing auto-scrolls under the reader.
- **R-48 is gone with the mechanism it governed.** Session memory of what a human
  opened or closed has nothing left to remember. Delete `openLenses` /
  `lensesTouched` rather than porting them.

### 4.4 What else was resting on disclosure and had to be rethought
- **D9's losing candidates** were a `<details>`. Now a visible four-row table
  with rank, product, verdict and reason. Four rows cost less than the click did.
- **The job blocks** (Progress, Payments, Files, History, Notes) were heading for
  five accordions at ≥1024. They are now **master–detail** (§5.2) — growth-law
  move 1 only, applied a second time. Same routes at every width, same component,
  nothing hidden, one information architecture.
- **The editor form** never had one. There is no "Options" group to press open:
  every field is present, in one column, in the order a reviewer says them aloud
  on a call (C3). **So there is no open question about form-level disclosure.**

---

## 5. Geometry

C1 — the class is **measured**, moment to moment, from `window.innerWidth`. No
media query decides structure and nothing branches on a user agent. `<html>`
carries `data-width-class` for styling only.

| Class | Width | Shell | A line is | The editor is |
|---|---|---|---|---|
| phone | < 768 | menu button + overlay menu | a pushed plane | a pushed plane |
| tabletp | 768–1023 | menu button + overlay menu | a pushed plane | a docked overlay panel |
| desktop | 1024–1419 | persistent 260px rail (`ion-split-pane`) | a selection in the canvas | a docked overlay panel |
| wide | ≥ 1420 | persistent 260px rail | a selection in the canvas | **a third column** |

### 5.1 The navigation opener is never removable
Recorded twice as a regression. Below 1024 the `ion-menu-button` in the header is
the only route to the destinations and it is always present. At 1024 and above
`ion-split-pane` keeps the whole destination list permanently on screen, which is
the same guarantee met a different way. There is no width at which the
destinations are unreachable.

`ion-split-pane`'s side is **pinned to 260px** (`--side-width` /
`--side-min-width` / `--side-max-width`). Ionic's default is `max-width: 28%`,
which is 403px on a 1440 laptop; with a rail and a panel that left the canvas
137px and the plate could not be drawn. Layout, not branding.

### 5.2 ≥1024 — rail and canvas
`grid-template-columns: <rail> minmax(0, 1fr)`. Rail 340px (380 at ≥1280, 300
while the editor holds a column).

- **Lines segment:** rail = the line list, canvas = the selected line's body
  (plate, verdict index, facts, five sections) with the deck at its foot.
- **Job segment:** rail = the five push rows with the current one marked
  `aria-current`, canvas = that block's body. Same `JobBlockBody` component the
  phone plane renders.

Selecting a line at ≥1024 sets selection only — no push, no stack. The URL
`/record/:ref/line/:id` resolves to the plane below 1024 and to a selection above
it (`LineRoute`), so a deep link works at both (D11).

### 5.3 Height is an input too
Below **700px** of viewport height the plate opens at `md` (188px) instead of the
`hero` (248px). It is never what starts hidden. R-17.2's original 900px threshold
is not usable as a *pinning* rule: every phone is under 900px tall, so it would
have meant the highest-praised element in the product was never seen at rest.

---

## 6. Critique 3 — the drawing plate

Inherited whole from `src/components/quote-project/Elevation.tsx`
(478 lines, `feat/referral-program`), **arithmetic unchanged**: the SIZES table,
frame/glass/mullion geometry, panel defaults, the composite path and the
thirteen-family opening-symbol library. Two deliberate differences, both stated
in `src/elevation.tsx`'s header:

1. No catalogue import — the caller passes the family's `operation` string
   directly, which is what `kindFor()` would have received anyway.
2. One size added, `hero`, because R-49 says the generator is called at the size
   closest to the intended pixels and never a bigger one scaled down, and the
   phone hero is 320×248. Its viewBox works out at 318×246.

**Ship the real component.** Do not re-port it: extract it so the customer site
and ops2 share one generator, and add the `hero` row to its SIZES table.

### 6.1 Where the drawing appears — five places, one generator

| Place | Size | Why |
|---|---|---|
| Every list row, at every width | `xs`, `square` | The list becomes scannable by **shape** — an awning among sliders is visible before a word is read. `square` keeps the column's left edge straight; panel count, mullions and symbols still derive from the real millimetres. |
| The switcher sheet rows | `xs`, `square` | Same reason; a jump target you can recognise. |
| The line hero / canvas | `hero` (phone) · `md` (canvas) · `sm` (short viewport) | R-17. The first thing on screen when you arrive at a line. |
| The pinned strip | `xs`, `square` | R-18. |
| The editor's in-form drawing | `md`, or `xs` in the pane band | R-50 / R-51 / R-87. |

### 6.2 The rules, and how each is met

- **R-17 — the plate.** Its own ground (`--paper`) and ink (`--ink`), bound to
  Ionic's background and text so the drawing stays a line drawing on both
  palettes. Fixed `min-height` per size so the layout does not jump between a
  tall opening and a wide one.
- **R-18 — past 24px of scroll it pins as a 56px strip and never disappears.**
  The strip carries the `xs` drawing, the code, the size, and the R-50 line when
  it applies. Tapping it, or returning to scroll-top, restores the plate.
  **It is the same component in a second state, styled by one rule and no other**
  — the recorded defect was a second selector that hid the strip as well, so the
  drawing vanished outright. Never give the strip an independent display rule.
- **R-49 — honesty.** An opening with no readable size draws as a square
  stand-in at 0.45 opacity with **no leaders at all**, and the caption says
  "No size read for this opening". A drawing may be indicative; a dimension may
  not. `W14` in the mock is this case.
- **R-50 — whose figures.** While the editor holds unsaved dimensions the plate
  draws *those* and its caption says "drawing your figures — not yet saved". It
  never silently redraws someone's typing as if it were saved.
- **R-51 / R-87 — the size ladder.** See §7.2; the threshold is re-derived.
- **R-154 — tapping the plate is the expand control.** It is a real `<button>`
  with an accessible name, not a click handler on a `<figure>`. The expansion is
  an `IonModal` at `lg` carrying the drawing, the composite unit list where there
  is one, and the symbol legend. The legend appears **only** there — a 320px
  plate has no room to teach.
- **Composites** draw from their real units: one panel per unit, each panel's
  width in proportion to that unit's real size, each panel's symbol from that
  unit's own family, and a mullion at every real join. `W04` (900+1500+900) and
  `D01` (four units) are the cases in the mock.

---

## 7. Critique 4 — the edit panel

The frontpage convention is `OpeningDrawer.tsx:199`:
`fixed inset-0 md:inset-y-0 md:left-auto md:right-0 md:w-[min(88vw,520px)]`,
with a scrim over the surface it is dimming.

### 7.1 Three bands
- **< 768 — a pushed plane.** Full screen, Ionic's stack transition and back
  gesture. This is the behaviour that won the comparison; unchanged.
- **768 – 1419 — a right-docked overlay panel** at `min(88vw, 520px)`, full
  height, square corners, over Ionic's scrim. `ion-modal` supplies the scrim,
  focus trap, Esc, inert background and animation; the docking is four CSS
  variables plus `justify-content: flex-end` and `::part(content) { inset: 0 0 0 auto }`.
- **≥ 1420 — a real pane.** The workspace gives up a third grid column and the
  canvas **reflows** beside it. No scrim, no overlay, nothing covered.
  Deliberately **no focus trap**: a pane is not modal. Esc closes it.

Measured at 1440 with the editor open: 260 nav | 300 rail | 360 canvas | 520
panel = 1440, no horizontal overflow, plate fully visible at 345px.

### 7.2 Why the third band exists, and why the threshold moved
R-50 and R-87 both put the live-redraw editor at "≥1280, where the pane is a
persistent column". That threshold was measured on a workspace **without** the
permanent navigation column ops2 now has, and it does not survive its addition —
at 1440 with Ionic's default 28% side, a 380px rail and a 520px overlay, the
canvas was left 137px and the plate the pane exists to keep visible could not be
drawn at all.

So the rule is kept and its **threshold is measured instead of asserted**, which
is what C1 asks for anyway: the editor is a pane exactly when the canvas can
still hold a full `md` plate beside it —

```
innerWidth - 260 (nav) - 300 (rail) - 520 (panel) >= 340 (canvas min)
```

which lands at **1420px**. A 1440 laptop gets the pane; a 1280 one gets the
overlay with R-51's in-form drawing carrying the drawing, which is precisely the
fallback R-51 was written for.

### 7.3 The form
`ion-input` and `ion-select` with `labelPlacement="stacked"`, Ionic's own helper
text and its `action-sheet` select interface. Nothing hand-rolled — that is the
point of adopting the framework, and it is what makes the fields behave
identically on both founders' phones.

- **Order:** the drawing, Item ID, Product, Height, Width, Glazing, the supply
  caption. Height before width, as the schedule reads.
- **Warn, never veto (C4).** An out-of-range dimension shows a `warning` note at
  the field and **Save stays enabled**. No acknowledgement, no justification
  field, no gate.
- **R-159 — the read-back strip** sits above the deck, `aria-live="polite"`,
  showing this line and the quote total, each with its GST basis and each with
  the previous figure struck through when it has changed.
- **R-39 — the discard guard** expands from the footer, never a modal. It guards
  *data loss*, which is not the same as gating a decision: C4 forbids the second,
  not the first.

---

## 8. States

| State | Where | Copy |
|---|---|---|
| No unpriced lines under the filter | list | "No unpriced lines. Clear the filter to see all 18." |
| No line selected (≥1024) | canvas | "Choose a line on the left to review it." |
| Line has no notes | Trail | "No notes on this line yet. A note added here is stored against W04 and shows against it thereafter." |
| Panel failed to load | its own heading + body | heading verdict "could not load" (danger); body "This section could not be read. Everything else on the line is current." + **Try again** |
| No rate | Price | "**Missing rates:**" then each missing input in full (R-66) — the frame/glazing/rate band, and the delivery zone |
| No size read | plate caption | "No size read for this opening — drawn as a square stand-in" |
| Requirement missed | Glass | "**This does not meet the stated requirement.** Yours is the decision. The divergence is recorded once, on the quote, when you issue it — nothing is recorded now and nothing is blocked." |
| Issue blocked | record footer | "2 lines have no rate yet. Nothing else is blocking." |
| No payments | Payments | "No payments recorded." / "Order no. 10482 · appears on invoices" |
| Long room name | identity band | Ellipsis. The band has the whole width now that the stepper has gone. |
| Editor dirty on close | footer | "Discard changes?" — Discard (danger) / Keep editing |

**No toasts, no polling, no undo, no change history.** Refresh is manual and the
console says when it last read (`Updated 09:14`).

---

## 9. Two framework findings the developer must carry over

1. **No `React.StrictMode`.** Ionic's components are Stencil custom elements that
   cache ancestor references in `connectedCallback`; StrictMode's deliberate
   double mount/unmount left them holding references to the discarded first
   mount. This is a real constraint on the adoption, not a mock artefact.
2. **Ionic overlays and animations need a compositing tab.** `ion-modal.present()`
   never resolves in a hidden/occluded tab because the enter animation is driven
   by `requestAnimationFrame`. Relevant to Playwright coverage: run headed, or
   assert on state rather than on the presented geometry.

---

## 10. Accessibility

- Ionic's `focusManagerPriority: ["heading", "content"]` gives R-164 on every
  navigation without our code.
- Every interactive target is ≥44px: pills, the position label, list rows,
  buttons, the plate face.
- The plate face and the pinned strip are real buttons with accessible names
  ("Enlarge the drawing of W04", "Show the drawing of W04 in full").
- The scroller is `role="group"` with `aria-label="The lines under review"`; each
  pill's label names the destination and its state ("W05, WC, needs review").
- The verdict index is `<nav aria-label="Sections on W04">`; sections are
  `<section aria-label>` with `<h2>`.
- Drawings are `aria-hidden="true"` throughout — every one of them sits beside
  text that says the same thing. The drawing is reinforcement, never identity.
- Reduced motion: the plane transition cross-fades (`transitions.ts` reads the
  preference itself) and a global rule collapses everything else.

---

## 11. Decisions needed

**None.** The form-level disclosure question does not arise — there is no
`<details>` and no collapsible group anywhere in the editor.
