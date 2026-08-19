# ops2 R1 — interaction spec

**Mock:** `docs/mocks/ops2-r1-ionic.html` — a single self-contained file, no build
step, opens on a phone from the filesystem. Source: `docs/mocks/ops2-r1-ionic-src/`.
**Framework:** `@ionic/react` 8.8.18, Ionic's own default theme including its own
dark palette (`@ionic/react/css/palettes/dark.system.css`).

This spec is the contract. Where it and the mock disagree, this document is
wrong and should be corrected — the mock is what the owner approved.

**Amended after the owner's phone review.** Section 12 records that pass and
supersedes anything above it that it contradicts. Its scope was **the mobile
project view only** — the line detail plane and every width above phone were
explicitly deferred ("Once fully happy, we'll worry about ItemDetail view and
then - desktop"), so sections 5.2, 6 and 7 below still describe the desktop
geometry as built and unreviewed.

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
| A file is quarantined by the virus scan | danger |
| A file is still being scanned | neutral, stated — not a fault |
| Delete confirmation | danger |

### A3 — The GST basis is stated once, where it governs
**Amended — see §12.3.** The rule exists so nobody misreads a number, and
printing "ex GST" against eighteen line prices defeats it rather than enforcing
it. The basis is now stated once per place it governs — under the project total
in the header, and under the totals panel — and never inside a list. **One
component renders money** (`Money` in `src/ui.tsx`), and rows pass
`basis={false}`. Absence still renders as a reason, not a dash: `no rate`.

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

## 4. The disclosure ruling — what replaced it (SUPERSEDED for the line plane by section 18)

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

## 11. Decisions needed (R1)

**None at the time of the first pass.** Superseded by section 13.

---

# 12. The mobile project view — reworked after the owner's phone review

Scope of this pass: **the mobile project view only** (Lines + Project). The line
detail plane and every width above phone were explicitly deferred. Colour was
parked — nothing in this section changes theming.

Preserved untouched, because he named them as working: the Lines/Project
segmented control, the totals panel at the end of the list, the bottom action
panel with its status explanation below the buttons, the phase ribbon's
placement, the project name beside the leading control, and the Lines concept.

## 12.1 The header, top to bottom

```
┌───────────────────────────────────────────────────┐
│ ‹ Projects                        $48,802.40      │ 44  back + the money
│                                       ex GST      │
│ OF-Q-10482 · Wattle Grove — Lot 14                │ 46  identity
│ Marchetti Constructions · Ana Bianchi             │
│ WAITING ON US   Technical review · 3 days      ›  │ 40  ranked state
│ [ Lines · 18 ][ Project ]                         │ 44  the segment
│ • 2 lines have no rate         show only these    │ 40  the filter
└───────────────────────────────────────────────────┘
```

Measured at 375×812: 218px header, 73px footer, 521px of list. At 320×690:
218 / 73 / 399, no horizontal overflow.

## 12.2 The leading slot — the one real design problem in the package

Two requirements collided. **Back must exist** — "even if we don't have it yet,
the navigation should not be missing", and in production the record is pushed
from a list, so it is never the root. **The drawer opener must not disappear** —
a drawer with no trigger is a regression recorded twice here (`UX-AUDIT.md` D2,
HIGH).

Both cannot have the slot. Two 44px targets take 88px of a 375px bar before the
title starts, and the owner's own instinct was that a hamburger on the left
beside an overflow on the right "feels weird".

**Resolved: back takes the slot and names its destination** — `‹ Projects`, not
a bare chevron, because this is the record's only navigation and a lone chevron
says there is a way out without saying to where. **The drawer opener lives on
Projects**, which is a destination root and where switching destination belongs.

Global navigation is therefore two taps, both visible and both labelled, and
there is no screen from which the destinations are unreachable — which is what
the recorded regression actually was. Inside a record, where a founder spends
the day, the trade buys the top-right corner for the money.

Implementation: a `/projects` route exists and is the stack root; `/` redirects
to it; the record is always pushed. `IonBackButton defaultHref="/projects"
text="Projects"`.

## 12.3 The top-right corner

`⋯` moved down to the bottom action panel, where the other actions already
were. The **project total takes the corner**, in the `end` slot of the back bar:
`$48,802.40` over `ex GST`. It is on screen at every scroll position and on both
tabs.

This is now the primary home of rule A3's GST basis. The basis appears in exactly
two places on the surface — here, and under the totals panel — and nowhere else.
Eighteen identical captions is how a caption becomes invisible.

## 12.4 The lifecycle, ranked

Was `Now · Technical review · waiting on us · 3 days in this state`: four facts
at one weight in one dotted run, which is why it had to be read in full before it
said anything.

Now two ranked lines in one 40px row:

| | |
|---|---|
| **WAITING ON US** | who owes the next move — bold, and toned when it is ours |
| Technical review · 3 days | which phase, and how stale — quiet |

Variants: `Waiting on us` / `Waiting on the customer` / `With the manufacturer`.
`Now ·` is deleted outright — it carried no information.

The row is a button and opens Progress, where the ribbon and the move control
live.

## 12.5 The Lines tab

- **The flag sentence is out of the row.** "it pollutes the screen. Highlight is
  enough." The row keeps the warning rule down its leading edge and its
  `needs review` badge; the sentence lives on the line itself, where the fix is.
- **"ex GST" is out of every row** — see 12.3.
- **"Add a line" is out of the list and into the bottom `⋯` sheet.** This is a
  move, not a cut: **AC-95 and AC-96 stand unchanged.** He objected to its
  prominence ("I don't anticipate that being a frequent action"), not its
  existence.
- **"estimate" is gone from the totals panel.** His instruction, and the
  glossary agrees — the word is on Quote's own _Avoid_ line because the
  estimator is a different concept.
- **The filter moved below the segment**, because it filters the Lines list and
  belongs to it. Above the segment it read as a property of the whole record and
  appeared on the Project tab too.

## 12.6 Delivery — a reviewable figure, not a settings surface

> "zones are for estimating only - the task of ops is to confirm the price with
> couriers and update it as a final offer. Functionally, it is no different from
> the line review process."
>
> "once SOME number is available - that's up to ops to verify and confirm, update
> (most likely) and submit as part of the final quote. Do not overthink 'why and
> where the number is coming from.'"

### Where it lives, and why

**In the totals panel, as a reviewable row.** The instinct was the Project tab;
the reasoning points here. Three placements were possible:

- **A row in the Lines list.** Refused. A Line is "one configured opening" in the
  glossary. A delivery row there has no drawing, no size and no per-line actions,
  breaks the `Lines · 18` count, and puts a non-opening in a filmstrip of
  openings.
- **The Project tab.** Refused. That is where a project's standing facts live.
  Delivery is money on this quote, and filing it beside Files and History puts it
  away from every figure it is added to.
- **The totals panel.** Taken. It is already where delivery appears, it is where
  money is read, and it is what you reach after working down the eighteen lines —
  so the review sequence is lines, then delivery, then the total, in the order
  the eye already travels.

### The row

| State | Renders |
|---|---|
| Proposed, not yet confirmed | `$582.40` + a quiet `not confirmed` pill, tappable |
| Confirmed | `$640.00`, tappable, no fuss |
| No figure at all | `no figure — set it` in danger tone |

### The screen

A figure and the ability to change it. **No zone, no basis, no rate arithmetic,
no "why does it say that" panel.** The review *pattern* transfers from a line —
propose, confirm, override, submit — but the *derivation surface* does not: a
line's reasoning is complex and has to be adjudicated, whereas this is a lookup
about to be replaced by a phone call.

- The field is **pre-filled with the proposed figure**, because updating is the
  expected path, not the exception.
- The primary says **Confirm delivery**, not "Override" — nothing frames this as
  overruling a machine.
- An optional note ("e.g. two deliveries, second to site").
- A read-back strip showing the project total (R-159, the same device the line
  editor uses).
- Copy beneath: "Confirming records the figure against this project. It changes
  nothing for any other project."

**No figure is an error state, not a variant.** It renders as a plain fault
(`.note-danger`, filled — rule A2 keeps danger and warning apart) and the same
field below is how it gets fixed. The interface is not built around it.
`worker/lib/delivery.ts` resolves postcode zone → fallback zone →
`unpriced_table`, and its own comment calls the last a deployment fault.

### Copy that was over-explaining

`not priced — Zone 4 — Outer metro has no rate` told the reader about a rate
table they cannot act on from that screen. It is now `$582.40 · not confirmed`,
or `no figure — set it`.

## 12.7 The Project tab (was "Job")

**The rename is owed on vocabulary grounds, not taste.** `CONTEXT.md` lists
"job" on Project's explicit _Avoid_ line: *"Avoid: job, enquiry"*.

**Recommendation: "Project".** The record is what ops opens; within it, `Lines`
are what is being quoted and `Project` is the container around them.

> **For the architect.** "Project" is glossary-correct but partially overlaps
> itself: the glossary defines Project as the container *including* its lines,
> and this tab is the container *minus* its lines. That is tolerable in a
> two-tab split, but if a precise term is wanted for "a project's own facts as
> distinct from its lines", the glossary does not currently have one. Either
> way, `Job` must go.

### The five blocks, each with a real summary line

| Block | Summary |
|---|---|
| Progress | `Technical review · waiting on us · 3 days` |
| Payments | `Nothing received · 2 expected` |
| Files | `1 schedule · 3 attachments` |
| History | `5 events · last Tue 09:24` |
| Notes | `2 notes on this project` |

Push rows at every width — move 1 only, no disclosure anywhere.

**Progress.** The phase ribbon (placement unchanged — he called it good; it wraps
at `repeat(auto-fit, minmax(92px, 1fr))` rather than scrolling), then who it is
waiting on, days in phase, and who moved it. A **"Waiting on the manufacturer"
toggle** (D10) — orthogonal to phase and the only `waitingOn` value a human sets,
so a switch rather than a phase step. Primary: `Move to Quoted`, with "Nothing is
locked — you can move it back."

**Payments.** Order no., what has been received (empty state honest: "Nothing
received yet."), what is expected with amounts and timing. Primary: `Record a
payment`, with "Recording a payment here does not send anything to the customer."

**Files.** The source schedule named separately from later attachments, each with
size, time and who. Primary: `Add a file`.

**History.** Reverse-chronological: what, then who and when. Copy: "Entity,
action, actor and time. It is a record, not an undo — nothing here can be
reversed from this screen."

**Notes.** Project-level notes. Primary: `Add a note to this project`, with "A
note on the project, not on a line. Line notes stay on the line."

## 12.8 The bottom action panel

Unchanged in structure — one primary, the overflow beside it, the status
explanation below the buttons — and it now carries the `⋯` that came down from
the top-right. Its sheet holds: Add a line · Confirm the delivery charge ·
Request clarification · Add a note to this project · Copy a link · Refresh.

The blocked reason now names both blockers:
`2 lines have no rate, and delivery is not confirmed`.

## 12.9 One contrast fix

The filter row's action word was Ionic's primary hue on the warning tint and
measured **4.34:1** on the dark palette, under rule A1's floor. It is now ink
plus an underline. Re-measured at 320×690 dark: no failures.

---

# 13. Decisions needed (R1b)

Owner-only. Three items, all consequences of that pass rather than open design
questions. **Still open** — see section 15 for the R1c addition.

1. **`waitingOn` may want to generalise.** Waiting on a **courier** is the same
   shape as waiting on the **manufacturer** — a third party, outside the phase
   ladder, set by a human. `worker/lib/lifecycle.ts:56`'s union has already grown
   once for Manufacturer, and growing it once per counterparty will not hold.
   Suggest a `{ kind: "third-party", who }` shape instead of one flag each. The
   architect owns the model; the reading is settled either way — the state row
   says `With the manufacturer` / `With the courier`, and the Progress toggle
   names the party.

2. **The delivery override belongs in the divergence record.** A human confirming
   a delivery figure different from the proposed one is proposed→issued, exactly
   like a line field, and §3 of the grill conclusions records divergences once at
   issue. It is currently specced for line fields only. **This needs new
   acceptance criteria** — the recording, and the negative case that nothing is
   written before issue (C5: never per-save).

3. **Delivery confirmation as an issue gate.** The mock's blocked reason now says
   delivery is not confirmed, which implies confirming it is required before
   `Issue quote` enables. That is a business rule, not a design one. If it is
   *not* required, the reason line drops that clause and the row keeps its
   `not confirmed` pill as information only.

Also flagged, not a decision: **AC-95/AC-96 (line add and delete) are unchanged.**
"Add a line" moved from the list into the overflow. Nothing was descoped.

---

# 14. R1c — the second phone review

Scope unchanged: **mobile project view only**. No colour work, no ItemDetail, no
desktop.

## 14.1 The header, recomposed (point 1)

R1b put back on a bar of its own above the identity, which moved the project name
off the leading line and left `‹ Projects` belonging to nothing.

Three elements will not fit one 375px row. Naming the back destination costs
~86px **and it must be named** — it is the record's only navigation. The total
costs ~80px in its corner. That leaves ~200px, which is not enough for the ref
and the title together.

So back and the identity stop competing and become **one path**, and the
free-text half falls to the line beneath at full width:

```
‹ Projects / OF-Q-10482                            $48,802.40
Wattle Grove — Lot 14                                  ex GST
Marchetti Constructions · Ana Bianchi
```

- Back is the head of a breadcrumb, not a stray control.
- The **ref** takes the crowded line because it is short, fixed-width and the
  identity ops says out loud. It never truncates.
- The **title** takes the full width below. *(Corrected in §16.2 — R1c claimed
  it "never truncates" while the CSS set `text-overflow: ellipsis`. D3 resolves
  it by placement: the ref cannot truncate, the title truncates via IonTitle's
  own ellipsis.)*
- Measured at 375: back 14–117, separator 123–127, ref 133–275, total 281–361.
  At 320: back 14–117, ref 133–220, total 226–306, title unclipped, no overflow.
- The header block is 81px (R1b: 44px bar + 46px identity = 90px). Whole header
  209px, list 530px.

**Markup.** *Superseded by §16.1.* This grid was a bespoke layout inside
`IonHeader` and has been replaced by three `IonToolbar`s using published slots.

## 14.2 Files are downloadable (point 2)

The gap is on the record specifically. Register **row 150** records the current
record's Files block as *"filename + size or raw status word; no download, no
kind, no dates, no rescan"*. All four are carried, not a subset.

**Download is gated on the virus scan, because the endpoint is.**
`GET /files/:id/download` serves `clean` only and answers **403 `quarantined`**
or **409 `scan_pending`** otherwise (register row 206). A download button that
does not know the state is one that 403s in the operator's face, so the state is
part of the row and the control agrees with it:

| Scan state | Control | Row copy |
|---|---|---|
| `clean` | `Download` (outline, download icon) | — |
| `scan_pending` | `Checking` — inert, not faded (rule A1b) | "Being checked for viruses. Download opens when it passes." |
| `quarantined` | `Rescan` (danger outline) | "Quarantined by the virus check. Download is blocked." |

Each row also carries kind, size, time and who — the other three things row 150
says are missing. The source schedule is grouped separately from later
attachments.

`POST /files/:id/rescan` is register row 205, and **its defect is the one thing
not carried**: rescan failure is currently swallowed. Here it reports, and the
block says so: "A rescan that fails says so; it does not fail quietly."

The Project tab's Files summary now reads `5 files · 2 not downloadable yet`.

## 14.3 Notes compose in place (point 3)

A button labelled "Add a note to this project" that opens something else is a
label pretending to be an action, and it was the longest string on the block. A
note is two lines of text — there is nothing to open.

The composer **is** the affordance, at the top of the notes:

```
NEW NOTE
┌────────────────────────────────────────┐
│ What should the next person know?      │   IonTextarea, autoGrow
│ On the project, not on a line.  [ Add ]│
└────────────────────────────────────────┘
3 NOTES
Gedas · just now
Ring AMJ about the obscure glass on W04.
```

Headings are one and two words. `Add` is disabled until there is text; on press
the note appears directly beneath, the count heading updates and the draft
clears. Verified end to end in the mock.

**Deliberately not applied to the siblings.** "Add a file" opens a file picker
and "Record a payment" needs an amount, a date and a method — both genuinely go
somewhere, so a button that says so is honest. The rule is *an affordance that
can complete in place should*, not *no buttons*.

The record's overflow item shortens to `Add a note` and routes to the Notes
block rather than opening a second composer.

## 14.4 The customer's note leaves the row (point 4)

**Established, not assumed.** The field is:

| | |
|---|---|
| Column | `quote_line.room_label`, plain `TEXT` — `migrations/0001_customer_core.sql:88` |
| Schema's own comment | `-- optional secondary label ("Note")` |
| Customer-facing label | **"Note (optional)"** — `ItemComposer.tsx:428` |
| Who types it | **The customer**, free-form. Placeholder: *"e.g. Bedroom 1, north elevation"* |
| Bound | **500 characters** — `NOTE_MAX`, `configurator.ts:327`, enforced client-side and again by `normNote` on the server |

**His concern is founded.** Five hundred characters is a paragraph, not a room
name. `Ensuite` was the lucky case, never the contract. It comes out of the row
at any length — and out of the line-switcher sheet's rows, which are the same
grammar and carry the same risk.

The row now reads: `W01 · AMJ58 Series Sliding Window · 1,200 × 1,800 mm · ×1 ·
$2,140.00`.

### The vocabulary defect is worse than a mislabel — `CONTEXT.md` action

One field has **four names across the stack**, and `CONTEXT.md` has no entry for
it at all:

| Name | Where |
|---|---|
| `room_label` | the D1 column |
| `location` | the worker DTO and `QItem` — `lines.ts:100`, `configurator.ts:61` |
| **Note** | what the customer is shown, and what the normaliser is called (`normNote`), and what the schema comment says |
| `room` | `accountModel.tsx:175`, which is what the ops mock was rendering |

**Recommendation for the architect:** the customer-facing name is the real one —
it is a **note**, not a room. Add a glossary entry, name it `Line note`, and put
`room_label`, `location` and `room` on its _Avoid_ line. Renaming the column is
not required; agreeing the word is.

## 14.5 The flagged-row mark leaves the divider (point 5)

`ops2.css:317` was `ion-item.needs-review { --border-color: … }`, which under
`lines="full"` recolours the item's **bottom divider** — a rule drawn *between*
two rows, belonging to neither, so it cannot say which of the two it is about.
That is a structural ambiguity, not a matter of taste.

The mark moves to the **leading edge**:

```css
ion-item.needs-review::part(native) {
  box-shadow: inset 4px 0 0 var(--ion-color-warning-shade);
}
```

- `::part(native)` is `ion-item`'s documented shadow part and the element that
  also carries the row's background, so the bar lands **on** the background
  rather than behind it.
- **Not a background tint** — selection already owns background, and two states
  competing for one channel gives a row that is either selected or flagged but
  never legibly both.
- **Survives greyscale on its own:** the bar is a 4px *shape* at the row's start,
  and the `needs review` badge states the same thing in words beside it. Colour
  agrees with the mark; it does not carry it.
- **Does not depend on the divider:** `--border-color` is back to the neutral
  rule, verified as `rgba(0,0,0,0.13)` on a flagged row.

## 14.5b Two contrast failures found by the closing sweep

Rule A1 is a functional rule, so enforcing it is not colour work. Both were
amber-family inks that Ionic's own shades do not carry at small sizes, and both
are fixed by mixing the hue toward the theme's own ink — which keeps the tone
and clears the floor in *both* palettes rather than picking a colour.

| Where | Was | Now |
|---|---|---|
| `WAITING ON US` (shipped in R1b) | `--ion-color-warning-shade` — **1.91:1** on light, the worst on the surface | `color-mix(… warning 45%, ink)` |
| Quarantined file copy (new in R1c) | `--ion-color-danger-shade` — **4.23:1** on dark | `color-mix(… danger 62%, ink)` — now 8.38:1 |

Closing sweep across `/projects`, the record, Progress, Files, Notes and
Delivery, at 375×812 and 320×690, in both palettes: **no horizontal overflow on
any route, and nothing below 4.5:1.** Ionic's own button labels measured
separately through their shadow `.button-native`: none below 4.5:1.

## 14.6 Components — standard vs bespoke

Point 5 did **not** push the row off `IonItem`. No boundary rule is engaged and
nothing went bespoke. The record surface's inventory:

| Region | Component |
|---|---|
| Line rows | `IonList lines="full"` + `IonItem button detail={false}` — unchanged |
| Flagged mark | the same `IonItem`, via its documented `::part(native)` |
| Lines / Project switch | `IonSegment` + `IonSegmentButton`, `scrollable={false}` — unchanged |
| Back | `IonBackButton` — kept, relocated into the header grid |
| Project blocks | `IonList` + `IonItem` |
| Note composer | `IonTextarea autoGrow` + `IonButton` |
| File actions | `IonButton` (`size="small"`, `fill="outline"`) |
| Overflow | `IonActionSheet` |
| Totals, header, deck, plate | ours — Ionic has no component for them |

The one thing our CSS does to an Ionic component here is the inset shadow on a
documented part. That is the boundary working as intended: extend through the
published surface, never pierce the shadow DOM.

---

# 15. Decisions needed

Owner-only. §13's three items still stand and are unanswered. R1c adds one:

4. **`CONTEXT.md` needs a glossary entry for the line note** (§14.4). Four names
   for one field, none of them canonical, and the ops console was rendering the
   least accurate of them. Architect's call on the term; my recommendation is
   `Line note`, with `room_label` / `location` / `room` listed under _Avoid_.
   Not urgent for this mock — it is out of the row either way — but it will bite
   whoever writes the ItemDetail copy next.

---

# 16. R1d — the four recorded defects

Scope unchanged: mobile project view, no colour work, no ItemDetail, no desktop.
All four were logged in `docs/ops2/OPEN-DEFECTS.md`; that file is now updated to
match.

## 16.1 D3 — the header is toolbars, not a dashboard

> "header is messed up, isn't it: back button, title, project id, price - that is
> not how guidelines say it should be mobile, no?"

He is right, and the fault was structural rather than cosmetic. R1c assembled
back, ref, title, customer and total as a **bespoke CSS grid inside
`IonHeader`** — a private layout wearing a standard component's name. That is
the boundary rule broken in the one screen he keeps returning to, and it
accreted one relayed request at a time without anyone asking whether a toolbar
is where money belongs.

**Now three `IonToolbar`s in one `IonHeader`**, which is Ionic's own sanctioned
way to carry more than one line:

```
┌──────────────────────────────────────────────────┐
│ ‹ Projects        Wattle Grove — Lot 14          │  IonToolbar  56
├──────────────────────────────────────────────────┤
│ OF-Q-10482                        $48,802.40     │  IonToolbar  46
│ Marchetti Constructions · Ana Bianchi   ex GST   │
├──────────────────────────────────────────────────┤
│ [ Lines · 18 ][ Project ]                        │  IonToolbar  48
├──────────────────────────────────────────────────┤
│ • 2 lines have no rate        show only these    │  filter      40
└──────────────────────────────────────────────────┘
```

| Bar | Structure |
|---|---|
| 1 | `IonButtons slot="start"` (back) + `IonTitle`. **`slot="end"` deliberately empty** — a total is not an action, and the record's actions live in the bottom panel where he asked for them. A toolbar is allowed no trailing action; it is not allowed to carry money. |
| 2 | Default slot for the identity, `slot="end"` for the figure. Both are the component's **published slots**, which is the distinction that matters: extending through the API, not composing a private layout inside it. |
| 3 | `IonSegment` in a toolbar — Ionic's documented pattern, unchanged. |

**What moved to content.** The waiting-on row is status, not navigation and not
money, so it may scroll. It now leads the content and is still the first thing
read on arrival. Keeping it in chrome is what pushed a fourth band up there.

**Measured:** header **190px**, down from 209. Total gets **97px and 17px type**
instead of being squeezed into an ~80px end slot. No horizontal overflow at 375
or 320.

**Preserved:** the total is reachable without scrolling, back still names its
destination, and the identity is legible at a glance.

## 16.2 D1 — the truncation claim, resolved by placement

R1c's spec said the title "gets full width below and never truncates" while
`ops2-record.css:47` set `text-overflow: ellipsis` three lines away. **D1
dissolves into D3**, and the fix is placement rather than a promise:

- **The ref cannot truncate.** Ten fixed-width characters, alone on bar 2's
  leading edge, nothing sharing its line. It is the identity ops reads out on a
  call, so it is the piece that must always be complete — and now it
  structurally is, rather than being asserted.
- **The project name truncates**, in `IonTitle`, using **Ionic's own ellipsis**.
  That is what every platform title does with a long name and it needs no
  defence. The full name is not lost: the overflow sheet's header carries
  `ref · title` in full and wraps.

**Measured at 320 with a 67-character name:** the title ellipsises, the header
**does not grow** (190px before and after), the ref is intact, nothing
overflows. The R1c claim is corrected in §14.1 rather than left standing.

## 16.3 D2 — the Files controls act

R1c shipped Download as `href="#"` and Rescan with no handler, while the report
claimed the behaviour was carried. Both act now, and **what they demonstrate
agrees with the endpoint**, not with a more generous fiction.

`GET /files/:id/download` serves `clean` **only** — 403 on `quarantined`, 409 on
`scan_pending` (register row 206). So:

- **The download control is not rendered unless the file is clean.** The gating
  is structural, not a check inside a handler that could drift from the
  endpoint. An enabled button whose server answers 403 is a worse design than no
  button plus a sentence saying why. The handler mirrors the guard anyway, so a
  disagreement would surface as a sentence rather than a silent no-op.
- **Download** acknowledges: *"Download started — Lot14-windows-schedule.pdf
  (2.4 MB)"* via `IonToast`. Stated honestly in the block: in this mock the
  download is acknowledged but no file transfers.
- **Rescan** moves the row through the real states and **states its verdict
  either way** — which is precisely register row 205's defect (failure
  swallowed) not being carried:

| Step | Row |
|---|---|
| tap Rescan | `Rescanning…`, control becomes inert `Checking` |
| verdict, 1st | `Rescan finished — still quarantined. Download stays blocked.` + toast |
| verdict, 2nd | `Rescan finished — clean. Download is open.` + toast; the Download control appears and acknowledges |

Both verdicts are reachable because both are real; the still-quarantined case is
shown first because it is the one the current console swallows.

## 16.4 D4 — quantity is retired, so it stops being drawn

Ruled by the owner: *"remove qty from the view."* Nothing creates a
multi-quantity line any more — `ItemComposer` and `ItemForm` carry no qty field.

Removed from the record's line rows, the switcher sheet's rows, and **the
fixtures** — every seeded line is single-quantity, so the mock stops showing a
case the product no longer produces.

Also removed from the line body's facts and price caption. **That is ItemDetail
territory and out of scope this pass**, flagged rather than done silently: the
field is retired product-wide and leaving a dead concept rendered there would
have been worse than touching it.

**`qtyPerParent` is untouched.** Units within a composite line are a different
concept that also prints as `×N` and is not retired — `3 joined units` and
`4 joined units` still render. Verified: no quantity multiplier survives; the
remaining `×` characters are dimension separators.

The four production lines carrying 2/3/4/6 keep correct totals; only the
multiplier goes unstated, and it disappears as those projects close.

## 16.4b D5 — a regression D3 introduced, and the audit for its siblings

Moving the waiting-on row out of the header (§16.1) was right; writing the move
as `{!wide && stateRow}` was not. `listColumn` is shared by the narrow and wide
branches, so the gate deleted the row from every wide layout — and the same
habit two lines away deleted `Totals`, which **carries the delivery review row**
and therefore took the whole confirm flow off desktop.

Fixed by **removing the gates, not by adding a desktop variant**. `listColumn`
is the rail at 1024 and above, so both land where they already belonged: the
status row leads that column as it leads the phone's content, and the totals
panel sits beneath the list — the placement the owner approved. Verified at 1440
on both tabs: status row, totals and delivery review row all present in the rail,
delivery plane reachable from it, no overflow. Narrow unchanged (header 190px,
state row first in content).

**Audit for the same habit.** The only other width branches in the source are
`App.tsx:60` (route fork: record surface vs line plane) and `elevation.tsx:100`
(the drawing's break-line for wide *openings* — an unrelated sense of the word).
Neither drops anything, and nothing else renders on narrow and nowhere else.

## 16.5 Components — standard vs bespoke, after D3

D3 **removed** the one real violation. The record surface now has no
hand-composed layout inside a standard component:

| Region | Component |
|---|---|
| Nav bar | `IonToolbar` + `IonButtons slot="start"` + `IonBackButton` + `IonTitle` |
| Summary bar | `IonToolbar`, default slot + `slot="end"` — published slots only |
| Lines / Project switch | `IonSegment` + `IonSegmentButton`, `scrollable={false}` |
| Line rows | `IonList lines="full"` + `IonItem button detail={false}` |
| Flagged mark | the same `IonItem`, via its documented `::part(native)` |
| Project blocks | `IonList` + `IonItem` |
| Note composer | `IonTextarea autoGrow` + `IonButton` |
| File actions | `IonButton` + `IonToast` |
| Overflow | `IonActionSheet` |
| Totals, deck, plate, state row | ours — Ionic has no component for them |

The remaining bespoke pieces are all *content*, not chrome, which is where a
private layout is legitimate.

---

# 17. Spec changes this round needs

1. **§14.1's truncation claim is corrected** by §16.2 above. The original
   sentence asserted behaviour the CSS contradicted; it now describes placement.
2. **Quantity should come out of the acceptance criteria**, not just the view.
   D4 retires the concept product-wide, so any AC that asserts a quantity
   multiplier renders — or that a line total is shown "for all units" — is now
   describing something the product does not do. The PM owns that sweep; I have
   only removed the rendering.
3. Everything else in R1d is a design change, not a spec change.

The §13 and §15 decision lists are unchanged and still open.

---

# 18. R1e — the line plane, reimagined (EXTENDED by section 21: arrival is right, but it is the doorway to four jobs)

The record/list view is **approved and closed**. This section covers the line
plane only, mobile only. No colour, no desktop.

## 18.1 Why this is a rebuild and not a fix

> "When I said 'remove accordions' as they are a cheat code for putting a lot of
> information into a single screen without thinking, which I think is correct
> still, you simply did exactly that."

The accordion was never the problem — it was the symptom. The disease was
putting everything on one screen without deciding what belonged there. R1b
opened the lids, which did not treat it: it made the pile visible. Then R1b added
a **verdict index** on top, which is a contents page for a document nobody chose
to write.

So R1e does not re-lay-out the same content. It starts from the job and lets the
content follow.

## 18.2 The five questions

**What is the reviewer doing?** A founder, on a phone, with the customer on the
call. They tapped this line from a list that already told them the code, the
product, the size, the price and whether it needs review. They did not come to
re-read those. They came for the two things a row cannot carry:

> *"Show me the thing, and tell me what is wrong with it."*

**What is primary?**

1. **The drawing.** The highest-praised element in the product and the fastest
   answer to *is this the right thing* — shape, arrangement, which way it opens,
   real dimensions. It is also what the reviewer turns the phone around to show,
   and what lets them say "the wide one with the two openers" to a customer who
   does not read schedules. Treated as primary, per the brief's instruction and
   R-17/R-154.
2. **The verdict, in words.** Not five verdicts — the problems, or the stated
   absence of them. One line each; there are rarely more than two.

**What is the primary action?** **Edit.** The grill settled it: adjudication is
performed conversationally and *"its normal outcome is a change, not a tick"*.
So the footer is Edit, not Confirm. R-153 unchanged.

**What earns a second step?** The test is *is this a different job*, not *is this
more stuff*.

| Step | The different job |
|---|---|
| **Alternatives** | Pricing a compromise while the customer is talking — *"home owners might want to save money and choose the next-worse solution that is cheaper despite marginally failing to meet requirements."* A different motive from the one that opened the line. |
| **Notes** | Capturing what was said while the reason is still in the room, which the grill calls load-bearing. Needs a composer, not a reading surface. |

**What should not be on this screen at all?**

- The verdict index — a contents page for a screen you can see all of.
- The five section headings — the accordion with its lids off.
- The facts grid — the drawing dimensions the opening, the header names it, the
  row you tapped priced it.
- `Source: no page reference recorded` — absent provenance belongs where
  provenance is the subject.
- The candidates table, inline, as IDs.

## 18.3 The screen

```
┌──────────────────────────────────────────────┐
│ ‹        W04 · Bed 1                    ⋯    │  56  identity
│ ‹ W03 Ensuite            W05 WC ›            │  44  neighbours, NAMED
├──────────────────────────────────────────────┤
│                                              │
│            [ the drawing ]                   │ 235  primary
│         1,200 × 3,300 mm · 3 units           │
├──────────────────────────────────────────────┤
│▎Glazing does not meet the requirement on     │ 200  the verdict,
│ this elevation.                              │      then the winner's
│  CHOSEN FROM   the plan's schedule, A-201    │      reasoning
│  REQUIREMENT   Uw ≤ 3.9 · SHGC ≤ 0.44        │
│  THIS PRODUCT  Uw 4.1 · SHGC 0.52            │
│  [ Show what it was chosen over          › ] │
├──────────────────────────────────────────────┤
│  PRODUCT    AMJ67T Series Awning Window      │ 125  three facts that
│  GLAZING    DG Low-E 4-12-4                  │      get changed on a call
│  LINE TOTAL $1,840.00  ex GST                │
├──────────────────────────────────────────────┤
│ Notes · 1 on this line · latest Gedas     ›  │  56
├──────────────────────────────────────────────┤
│ [ Edit W04 ]                          [ ⋯ ]  │  49  one action
└──────────────────────────────────────────────┘
```

**Measured: the whole screen fits with no scrolling on arrival** — at 375×812
*and* at 320×690, in both palettes, including the missing-rate case (l06) and the
failed-read case (l10). That is the test of whether the decisions above were real:
if everything still had to be there, it would not fit.

## 18.4 The verdict block carries the ruling

> "winner's reasoning visible; losers one tap away, ranked, with their reason.
> But it stays collapsed by default so the common case isn't buried."

R1c inverted this twice: the losers were inline, at the bottom, as product IDs
against the action panel — which buried the common case under the rare one *and*
rendered a conversation aid as a debug dump.

Now: the **winner's reasoning is visible** (three lines — what it was chosen
from, what it had to meet, what it achieves), and the **losers are one tap away**
behind a labelled control. C4 governs the tone: a problem is stated, never gated,
and nothing asks to be acknowledged.

## 18.5 The alternatives plane

The **motive shapes the screen**: not "audit the estimator" but "is there a
cheaper way". So each row leads with the product as a person would say it, states
plainly whether it passes or what it misses, and offers the one thing the
conversation needs next.

- **R-53.1 — there is no price column.** `candidate_result` stores no price, and
  inventing one would be a fiction at exactly the moment money is discussed.
- **R-56 — pricing an alternative is a separate, metered read.** So it is an
  explicit per-row `Price it` action, and the meter is stated, not hidden.
- **R-53.2 / R-53.3** — the panel states its own source, and says the set is
  rebuilt on re-parse, because a reviewer who saw it yesterday should know why it
  may have changed.
- The footer states that choosing an alternative is an edit made in the editor,
  so nothing on this plane changes the quote on its own.

## 18.6 Navigation: named neighbours, and the filmstrip retired

> "probably more to the top, with prev/current/next style navigation - user can
> always go back into list and click on required item, if it is further away
> within the list, doesn't he?"

The difference from the rejected `‹ 4/18 ›` is that **neighbours are identified,
not counted**. `W03 Ensuite` tells you what the control will show you; `4/18`
told you only that something existed. You can decide whether to move *before*
moving, which is the whole of what was wrong with a counter.

**The bottom filmstrip is removed from this screen**, and the argument is his
own. The far case belongs to the list, which is one tap away and now approved.
Once the top names both neighbours, the filmstrip's only remaining advantage was
jumping several lines at once — the exact case he says the list serves better.
Keeping both would be two mechanisms for one job, costing 44px of the scarcest
space and a second thing to learn.

**The budget is neutral:** 44px out at the bottom, 44px in at the top — and the
mechanism moves from under the thumb to the reachable half, where a *decision*
(which line next) belongs, leaving the thumb zone to the one *action*.

The filmstrip **stays on the desktop canvas**, where the rail is permanently
beside you rather than one tap away and the horizontal budget is free.

R-158 is still satisfied: four routes to a sibling line — the neighbours bar, the
list, the overflow sheet, and `[` / `]` on a keyboard.

## 18.7 Rules that die, and why that is sound

| Rule | Fate |
|---|---|
| **R-43** — identical chip set and order on every line | Dies. No chips, no sections. |
| **R-47** — the arrival walk opens the first matching section | Dies as a *mechanism*. The verdict block is always the first thing under the drawing, so the walk is not enacted — it is the layout. |
| **R-48** — session memory of what was opened | Already gone in R1b; nothing left to remember. |
| **R-44** — a failed panel says so in its own header | **Survives and is stronger.** A failed read is now a *problem in the verdict*, not a heading that has to be found. |
| **R-45** — verdicts from real fields | Survives, in the problem list and the note count. |
| **R-53.x / R-56** | Move intact to the alternatives plane. |

---

# 19. Spec changes R1e requires

These are structural, not wording, so they need the PM rather than a note here:

1. **Sections are removed as a concept from the line plane.** Any acceptance
   criterion phrased as "the Why / Glass / Build / Price / Trail section shows
   X" no longer has a referent. The *content* survives in three places — the
   verdict block, the spec rows, and the alternatives plane — so this is a
   re-homing exercise, not a deletion, but every such AC needs rewriting against
   the new home.
2. **R-43 and R-47 should be retired in `LEARNINGS.md`**, with R-47's intent
   preserved as "the verdict leads the screen" rather than as a walk.
3. **The alternatives plane needs its own criteria**, including the negative
   ones: no price is stored against a candidate, the price fetch is metered and
   says so, and selecting an alternative does not change the quote outside the
   editor.
4. **Line notes are now a plane, not a section.** Any AC that expects them inline
   on the line body needs moving.

# 20. Still open

§13, §15 and §17's lists are unchanged. The `OPEN-DEFECTS.md` decision list —
delivery as an issue gate, `waitingOn` generalisation, the delivery divergence
record, the line-note vocabulary, the `ItemForm` disclosure fence, and
`feat/ops-ux-gap-pass` — remains as it was.

---

# 21. R1f — the line plane serves four jobs (the DOORS are superseded by section 24; the four jobs and the code findings stand)

R1e's reading — *"show me the thing, and tell me what is wrong with it"* — is
right for **arrival** and survives unchanged. It was wrong as the whole surface:
the owner has described **four reviews**, and three of them had nowhere to
happen. Mobile line plane only.

## 21.1 The structural idea: the doors are the facts

Four destinations could easily become a menu, which would be the accordion in a
third costume. They are not a menu. **Each door is attached to the fact it
interrogates:**

| The fact on arrival | The doubt it answers | Scenario |
|---|---|---|
| the dimension line | *is this number right?* | 1 |
| the verdict | *is this the right product?* | 2 |
| the price row | *is this the right money?* | 4 |
| `Edit` (the footer) | *change it* | 3 |

So **nothing was added to arrival to hold the new jobs** — the facts R1e already
showed became the way in. A reviewer arrives with a doubt, and the doubt is about
one of those facts, so they press the fact they doubt.

**Arrival still fits with no scrolling** at 375×812 and at 320×690, both
palettes. That test is what forced the trimming: the verdict lost its three-line
reasoning block (that content is job 2's and now lives there in full), and product
and glazing collapsed to one line, because the editor is what changes them.

## 21.2 Scenario 1 — validate the dimensions against their source

> "source is typically plan document (file attached) or manual user input (on
> call)."

**What I checked, and what exists:**

| Field | Where | What it gives |
|---|---|---|
| `quote_line.origin` | migration 0012 | `manual` \| `schedule` — **exactly the plan-vs-phone distinction he drew** |
| `quote_line.measured_by` | 0001 | `frame` \| `opening` \| `unsure` \| `''` |
| `quote_line.edited_fields` | 0019 | JSON array of field **groups** a human changed |
| `evidence_items.extracted_text` | 0016 | the text the parser read |

**What does not exist, and is said rather than left blank.** `evidence_items` has
`page_no`, `sheet_ref` and `region_json`, and production has **0 of 1,000 rows
populated on any of them**. So the screen quotes the read text and states plainly
that it cannot cite a page — *"open the file itself to find it in context"*.

`edited_fields` carries **no actor and no timestamp**, and R-55 records why:
*"inventing one is worse than omitting it."* The screen says so rather than
implying nobody touched it.

`measured_by = 'unsure'` gets a warning note — it is the value that most warrants
a second look before a figure goes to the manufacturer.

## 21.3 Scenario 2 — validate the recommendation

> "If in doubt on accuracy, ops need to be able to validate inputs into the model
> and the output it has produced."

**This screen deliberately corrects a wrong mental model.** The owner believes
the estimator picks *"the cheapest product that matches size and energy
constraints"*. The code does something materially different, and a derivation
surface that let the wrong story stand would be worse than none:

| What the code does | Where |
|---|---|
| **Three hard filters disqualify first** — sellable (`!disabled`), rules-passing (`outcome.passed`), priceable (`price.ok`) | `select.ts:90`, `:138`, `:168` |
| **Then a six-component weighted score.** Price is **15%** | `rank.ts:17` |
| **Compliance is graded, not a veto** — a thermal miss depresses rank rather than eliminating the candidate; unknown Uw against a real cap is *"a mild penalty, not 0"* | `RANKER_VERSION = "v3-graded-thermal"`, `thermal/compliance.ts:32` |

The plane therefore has three parts: **what it was given** (the Uw target, the
SHGC target, the opening, frame restrictions, and any note read from the plan —
the inputs he named); **the filter stage** with counts and reasons; and **the
weighted score** with the six weights drawn, plus one sentence in words: *"It is
not 'the cheapest that fits'."*

**Nothing new has to be stored.** `candidate_result` already persists
`hard_rule_outcome_json`, `score`, `score_components_json`, `reason_codes`,
`rank` and `selected` per candidate (migration 0014:96–110).

R-53.1 and R-56 are honoured: no price column, and `Price it` is an explicit
per-row metered fetch with the meter stated.

## 21.4 Scenario 3 — adjust the product and its options

> "Ultimately, all those options above -> full product configuration (edit panel)
> capabilities."

The editor is the destination and is **not designed in this pass**. What R1f adds
is the **varied paths in**, per R-46 (*every review reason carries its own fix
control*): each problem in the verdict offers its own route — `Change glazing`,
`Change the size`, `Change the frame system` — and the Dimensions and Why planes
each carry their own `Change the size` / `Change the product` footer action.

**The cross-line concern has no home anywhere**, so I have put it where the
judgement is made: the Why plane ends with **what the rest of the project uses**
(`AMJ58 (9) · AMJ67T (6) · AMJ95 (2) · AMJ150T (1)`), with a note that *"maybe we
should go with the same family, no matter the price"* is a judgement the
estimator does not make. This is derived in the mock; see §22.

## 21.5 Scenario 4 — the manufacturer's price plus the uplift

> "manufacturer's price, plus standard uplift (30%, adjustable on the fly). Plus
> GST, if prices are stored in the system with GST."

**Verified new.** There is no `uplift`, `markup` or `margin` field anywhere in
`worker/`, `src/` or `migrations/`. This is a new capability, not a surfacing of
an existing one.

The screen is the same shape as the delivery confirm already approved:

- **A basis control** — `ex GST` / `inc GST` — because whether their quote
  includes GST is a real ambiguity on a call, and guessing it would be a silent
  10% error. An inc-GST figure is divided by 1.1 before the uplift, and the
  screen says so.
- **Their figure**, and **the uplift**, defaulting to 30 and editable in place.
- **The arithmetic shown**: their price → `+ 30% uplift` → line price.
- **A read-back** of what this line and the quote total become, with the old
  figure struck through.

Verified live: 1,240 + 30% = 1,612; changing the uplift to 22% gives 1,512.80;
switching to inc-GST gives 1,127.27 ex before uplift.

It also states that confirming here does **not** change the project's *waiting on
the manufacturer* state (D10) — that is set on Progress, and conflating them
would make a price entry silently move a project's status.

---

# 22. What R1f needs from the spec

1. **The uplift is new and needs storage, criteria and a rounding rule.** Where
   it lives (per line? per project? a default in settings?), whether the 30% is
   configurable globally or only per use, and how it interacts with the $10
   customer-visible rounding grid `pricing.ts` already applies.
2. **A manufacturer-confirmed price needs a state, not just a value.** The line
   currently renders `list price` vs `confirmed with the manufacturer`; that
   distinction has no column. It also belongs in the divergence record at issue,
   for the same reason the delivery override does.
3. **THE DISCOUNT CONTRADICTS THE NEW PLATFORM RULE — flagged as asked.**
   `worker/lib/estimator/pricing.ts:189-196` multiplies the account discount
   **into the unit price**, before the line total. The owner's stated change is
   *"prices should go into quote as-is, and discount shown on a total for items
   level."* So:
   - the per-line price must stop being discounted;
   - the totals panel needs a **Discount** row between Goods and the total.
   The record surface is approved and closed, so **I have not changed its totals
   panel** — this needs a decision and a small, separate change once the platform
   change lands. Note the discount is *already* modelled account-level
   (`user.discount_percent`, migration 0032), so only the application point moves;
   there is no per-line discount to remove.
4. **Family mix is derived in the mock.** Nothing serves "what did I choose on
   the other openings" today. It is one query over the project's lines, but it
   needs an endpoint and a criterion.
5. **`measured_by = 'unsure'` should probably be a review flag**, not just a
   field the Dimensions plane happens to show. It is the strongest predictor that
   a dimension needs confirming, and today nothing surfaces it.

# 23. Still open

§13, §15, §17, §19 and `OPEN-DEFECTS.md` are unchanged. The estimator mental-model
divergence has been reported to the owner separately by the coordinator; it does
not change what is designed above, only what the Why plane has to be honest about.

---

# 24. R1h — view mode

Built to the owner's proposal and to his answers to the four challenges. Mobile
line plane only; the record/list view is approved and untouched.

## 24.1 The rule that replaces no-scroll

No-scroll was deliberately given up — *"with splits in particular, we're unlikely
to fit into no scroll concept. I'm ok to sacrifice that."* It was, however, the
only mechanism that had actually stopped content creeping back. So its load
transfers to one rule, and the rule is **structural, not a promise**:

> **A panel is a summary that leads somewhere. It never grows to fit its
> content.**

`Panel` takes a `budget`, **slices to it**, and demands a `more` string when it
truncates. A panel cannot silently absorb one more fact, because the fact would
not render. The CSS refuses to grow either: fixed row rhythm, no wrapping value,
ellipsis on overflow.

**A "line"** is one rendered row of text at the panel's own size. Overflow is
either clamped with a stated remainder or lives in the panel the summary leads
to — never both, never neither.

### The budgets

| Panel | Budget | Leads to | Overflow says |
|---|---|---|---|
| Specification | **4 lines** | the spec panel | `+2 more options` |
| Why this product | **3 lines** | the why panel | `What else was considered` |
| Price | **2 lines** | re-pricing | `Confirm against the manufacturer` |
| The customer's note | **2 lines**, clamped | (full text in the spec panel) | — |
| The size line | **1 line** | — | — |
| Units (split only) | one row per unit | that unit | — |

The units block is the one panel with no fixed budget, and deliberately: its
length *is* the split. Four units is a fact about the line, not content that
crept in.

## 24.2 The order is `ItemForm`'s

*"mirroring what is in the edit panel conceptually, but following mobile-first
concept."* `ItemForm` runs Item ID → product type → product → size → options →
note (`ItemComposer.tsx:536`ff), with price shown as a preview and never an
input. View mode runs the same concerns in the same order, so the two modes are
recognisably the same thing:

```
the drawing              the hero — ItemForm draws it in-form too
1,200 × 3,300 mm         from the schedule        ← size + one word of provenance
SPECIFICATION            product · glazing · frame · …    → spec panel
WHY THIS PRODUCT         had to meet · this one · chosen  → why panel
PRICE                    $1,840.00 ex GST · list price    → re-pricing
THE CUSTOMER WROTE       their words, clamped to 2 lines
─────────────────────────────────────────────────
[ Edit W01 ]                                      [ ⋯ ]
```

## 24.3 The action is Edit

Not Save/Cancel — *"good catch. we can adjust as needed."* There is nothing to
commit on a read-only screen; Save and Cancel belong in edit mode.

## 24.4 What the split forced that the single product did not

This is the substantive half of the round.

1. **The specification panel is replaced by the units — never both.** The
   customer list settled this (*"a spec panel above the units would describe
   nothing"*, `OpeningList.tsx:99-105`) and the same logic holds: a composite
   parent has no single product, glazing or option set to summarise. **Its units
   are its specification.** `ItemForm` agrees — a parent gets `hideProduct` and
   `hideOptions`.
2. **The Why panel disappears entirely — from the parent *and* from every unit.**
   This one changed my mind mid-build. The estimator recommends a product per
   **opening**; a composite is *one* opening the customer submitted and **ops**
   then divided, so the units' products were an ops decision in the split
   planner, not a machine recommendation. There is nothing to justify anywhere on
   a split, and inventing a rationale would be worse than the absence.
3. **A coverage line appears** — *"The units add up to 100 mm less than this
   opening."* It reports and never vetoes. `D01` in the mock is deliberately
   short by 100 mm so the case is visible rather than theoretical.
4. **Units get no price and no pencil** (`UnitRow.tsx:137`): the parent owns the
   total, and a unit is reached through the parent's editor. The unit plane says
   so in its footer.
5. **Unit references are `W04A` / `W04B` / …**, from `unitLabel(parentCode, i)`
   ported from `rowState.ts:63`.

**One thing mirroring did *not* mean inheriting.** Read-only `OpeningList` drops
state chips entirely — right for customers, wrong for staff who scan for
`needs review` and `no rate`. Ops2's list keeps them; this view keeps the
problems visible on the line.

## 24.5 Back names its destination: `‹ Lines`

Of the three offered:

- **`‹ Lines` — taken.** It names the *actual* return target: the row was tapped
  in the record's Lines tab and that is what comes back. `Lines` is a destination
  that exists on screen, in the record's own segment control. At ~52px it also
  leaves room for the title and the neighbours.
- `‹ Project` would be wrong twice — **Project is the name of the sibling tab** in
  that same segment, so it promises the wrong half of the record.
- `‹ Wattle Grove - Lot 14` names the project, not a destination; at ~150px it
  crowds out the title and the neighbour pair and then truncates, spending the
  most width on the least navigational word.

## 24.6 prev/next: settled concept, new execution

Placement and concept are settled and not reopened — top of the plane, neighbours
visible. What failed was the execution: two labelled full-width buttons taking a
whole band. Mail, photo and reader apps all solve this and **none of them spends
a row on it.**

So: **a chevron pair in the toolbar's `slot="end"`, each carrying its
neighbour's code** — `‹W03` `W05›`. That keeps the settled property (you can see
which line is next *before* you move, which the rejected `‹ 4/18 ›` could not do)
at **~96px of an existing bar instead of 44px of new chrome**. The room name is
what made the buttons wide, and it is one line down on the screen you arrive at.

Header is now **56px, one toolbar**, down from 100px with the band.

## 24.7 Line notes — corrected

Line notes are **not a thread and not editable**. The field is
`quote_line.room_label`: the customer's own note, typed under "Note (optional)".
It is shown as **their words, read-only**, clamped to two lines with the full
text in the spec panel. **The line-notes plane with its composer is deleted** —
threads are project-level only.

---

# 25. What R1h changes in the spec

1. **§18's four "doors" are superseded by §24's panels.** The dimensions door is
   absorbed into Specification (provenance is part of how a line is specified);
   the notes door is deleted outright with the line-notes plane.
2. **The line-notes acceptance criteria must go.** Any AC describing a line-level
   note composer, thread or ops-authored line note describes something that does
   not exist. `room_label` is the customer's field.
3. **The split needs its own criteria** — unit rows, `unitLabel`, no unit price,
   no unit pencil, the coverage sentence, and the rule that a composite shows
   units *instead of* a specification panel and carries no recommendation.
4. **Read-only-first is settled** and should be recorded as such: *"List view
   does not give all the details to make the decision on what exactly and why
   adjustments are needed. I can't expect ops to edit straight from the list."*
5. **The no-scroll property is formally retired** for the line plane, and the
   line budgets in §24.1 replace it. They should be written into the AC, because
   a budget nobody can point at is a budget that erodes.

# 26. Still open

§13, §15, §17, §19, §22 and `OPEN-DEFECTS.md` are unchanged. R1f's spec gaps —
the uplift's storage and rounding, the manufacturer-confirmed state, the discount
application point (`pricing.ts:189-196`), `measured_by = 'unsure'` as a review
flag — all still stand.

---

# 27. R1i — the bottom tab bar

Four tabs in the order he gave them: **Dashboard · Projects · Enquiries · More**.
`IonTabs` with `IonTabBar slot="bottom"`. Mobile and tablet only; desktop keeps
the persistent left rail and shows no bar.

**A switcher in the top-right of the mock flips between the variants on the same
screen**, and a `⌂` button simulates the home indicator — a desktop browser
reports `env(safe-area-inset-bottom)` as 0, which would flatter every variant
equally and hide the whole problem.

## 27.1 Why the `IonTabs` ban no longer applies

The boundary doc banned it, and **the ban was right for the reason given**: Lines
and Project are two views of *one* record, and tabbing them would claim they were
separate destinations when the back button, the URL and the totals all say
otherwise. **That ban stands — there are still no tabs inside a record.**

These four are different in kind. Dashboard, Projects and Enquiries share nothing
but the account: no common header, no common totals, no back path between them.
That is what a tab bar is for, and hand-building one would have meant
reimplementing the active state, the stack-per-tab behaviour and the safe-area
inset `IonTabBar` already has.

## 27.2 The pixel cost, measured at 375 × 812 with the 34px home indicator

**The bar is 91px**, not the ~50 assumed: 56 (Ionic md) + 34 (inset) + 1 border.

| Screen | A (bar everywhere) | B (hidden on record & line) | C (icon-only) |
|---|---|---|---|
| Record | **−25px** | 0 | −25px |
| Line | **−93px** | 0 | −93px |
| Dashboard | −91px | −91px | −91px |

At **320 × 690** the bar is the same 91px; the line plane keeps 492px of content
with it, and nothing overflows.

**Why the record only loses 25px and the line loses 93.** The inset rule: when a
bar sits below the action panel, the *bar* owns the home-indicator padding and
the panel drops its own. The record's footer therefore gives back 66px
(141 → 75) against the bar's 91 — a net 25. The line plane's footer has almost
nothing to give back (49 → 51), so it pays nearly the full 93.

**Without that rule both elements pad for the same 34px**, which is 34px of
nothing between the primary action and the tabs. It is settled in one place
(`ops2-tabs.css`), not per component.

## 27.3 Variant C is withdrawn on measurement

C was meant to be "A, but shorter". It is not available:

- `ion-tab-bar` publishes `--background`, `--border` and `--color` but **no height
  variable** — `--min-height` computes to `auto` and does nothing.
- Forcing a height made the bar **taller both times** (113px against A's 91),
  because the safe-area padding is added on top of a content-box height.
- Dropping the labels — the only *supported* route — **does not shorten Ionic's
  md bar either**. Measured at 91px, identical to A.

So C costs its labels and buys **zero pixels**. It stays in the switcher because
he asked to see the alternatives, but it should not be chosen: "Dashboard" and
"Enquiries" as bare icons are a guess until learned, for no saving.

**Making it shorter would mean overriding a standard component's internal
sizing** — precisely what the boundary rule exists to prevent.

## 27.4 The tab stacks and back navigation

**The back semantics we settled survive**, but only because the routes moved.

For the Projects tab to stay selected while three planes deep, the record's
routes had to live under it: `/record/:ref` became `/projects/record/:ref`, and
everything below moved with it. With that:

- `< Lines` pops to `/projects/record/:ref` — one pop, inside the Projects stack.
- `< Projects` pops to `/projects` — the tab's root, where it always went.
- A deep link to `/projects/record/OF-Q-10482/line/l04` resolves with the stack
  intact.

**Leaving the routes flat is what would have broken it** — `/record/...` matches
no tab at all.

### One defect, unresolved, and it must be fixed before tabs ship

**`IonTabs` computes the selected tab from the *matched route*.** Because
`/projects/record/:ref` is a different `<Route>` from `/projects`, it matches no
tab, and **the bar lights nothing the moment a record is open** — measured, all
four buttons unselected. Passing `selectedTab` to `IonTabBar` does not help:
`IonTabs` clones the bar and injects its own.

The fix is the documented Ionic shape — **one `<Route>` per tab with the record's
routes nested inside it** — which is a restructure, not a patch. The mock paints
the active tab from the route meanwhile, **marked in the source as a stand-in**,
so the variants are judged with a lit bar rather than a broken one.

This is an argument for care in the implementation, not against tabs: the
behaviour is available, it just requires the nested shape.

## 27.5 What happens to the drawer

**It survives unchanged and becomes what `More` opens.** Below 1024 the drawer is
the full destination list and `More` is its trigger; at 1024 and above
`ion-split-pane` turns the same markup into the persistent rail and the bar is
hidden. One destination list at every width, reached two ways.

The twice-recorded "drawer with no trigger" regression stays fixed — **`More` is
a more visible trigger than the hamburger it replaces**, and it is in the thumb
arc rather than the far corner.

## 27.6 A regression the desktop check caught

`ion-split-pane` finds its main content **by id among its direct children**, and
`id="main"` was on the router outlet — which `IonTabs` now wraps. At 1440 the
outlet measured `left:0 width:1440` with no `split-pane-main` class, so **the
260px rail overlaid the record instead of offsetting it.**

`IonTabs` takes no `id` prop, so the id moved to a host element around it.
Desktop measures correctly again: menu 0–260, rail 260–640, canvas 640–1440, no
tab bar in any variant, totals and state row still in the rail.

## 27.7 Recommendation

**B**, and the reason is the measurement rather than the principle.

A costs the line plane 93px — on the screen where the drawing is the point, and
where the no-scroll property was already surrendered. B costs it nothing, because
the two screens it hides on are exactly the two that already carry a labelled way
out (`< Lines`, `< Projects`) and a primary action that owns the bottom edge.

The honest objection to B is **instability** — a bar that comes and goes between
screens — and that the tab bar is then absent from where a founder spends most of
the day, which undercuts the "speed is money" case for having tabs at all. That
objection is real and it is why this is his call and not mine: **A buys constant
access to three destinations for 93px on the line plane and 25px on the record.**
Whether those destinations are worth reaching *mid-review* is a question about how
he works, and the switcher is there so he can find out rather than predict.

C should be discarded either way.

---

# 28. What R1i changes in the spec

1. **The route shape changed.** Every record URL is now under `/projects`. Any
   criterion or deep-link example naming `/record/:ref` needs updating.
2. **The tab-selection defect (§27.4) is a blocking implementation note**, not a
   design question: the nested per-tab `<Route>` shape is required.
3. **The safe-area ownership rule needs a criterion** — exactly one element on the
   bottom edge pads for the home indicator, and it is the bottom-most one.
4. **`Dashboard` and `Enquiries` now need real specs.** Both exist here as thin
   roots so the bar had somewhere to go; neither has been designed.
5. **The `IonTabs` ban in the boundary doc needs amending**, not deleting: banned
   *within* a record, sanctioned for top-level destinations.
