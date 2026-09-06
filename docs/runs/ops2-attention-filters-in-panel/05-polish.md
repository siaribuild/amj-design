# Polish — ops2 Attention filters in the Projects filter panel

Audited the built result against `docs/mocks/ops2-attention-filters-in-panel.html`
and `03-ux.md`, in the browser, at 1440×900 and at 375×667 / 375×844, over the files
`04-build.md` names. Verified with the real console (local Worker, intercepted queue
payload of six rows PA–PF), not with a static harness.

Screenshots: `05-polish/desk-panel-before.png`, `05-polish/desk-panel-after.png`,
`05-polish/phone-375-panel-after.png`.

## What changed

One file: `src/ops2/styles/projects.css`. No component, no copy, no behaviour.

### 1 · The filter panel's footer sits at the foot of the panel (desk)

**Before:** `SidePanel` renders the footer *inside* `ion-content`, so `Clear all
filters` and its note followed the list wherever the list ended. With three
refinements that was near enough the bottom of the panel to pass unnoticed. With six
it is still only 390px down a 900px panel, leaving the control floating in the middle
of a half-empty drawer.

**After:** the desk panel's scrollport is a column and the footer is stuck to its
foot, under a hairline — which is what the mock draws (`.panel__foot{flex:none}`
below `.panel__body{overflow:auto}`, with `border-top`). Opaque background and the
border come with the pinning, because the footer can now have list underneath it.

Scoped to `.pq-sheet--side:has(ion-list)` — `FilterSheet` is the only `SidePanel`
caller that renders an `IonList`, and the other footer-carrying callers (the record's
actions note, its confirm button) are short panels on screens this feature never
touched. Pinning theirs would have been a restyle of shipped work.

### 2 · `Clear all filters` reads left, at both widths

The mock left-aligns it. Stretched to the panel's full width, an `ion-button`
centres its own label, which reads as a dialog's primary action rather than as the
quiet exit it is. `align-self: flex-start`, alignment only — nothing moves except the
label.

### 3 · `.pq-active__names` is no longer a one-item flex row

The strip's flex row existed to sit the sage prefilter pill and the refinement text
on one baseline. t3 deleted the pill, so the row had exactly one item left: a run of
plain text, which wraps natively. Now `min-width: 0` alone, so the names can shrink
and wrap freely at 375 instead of being floored at the longest word's min-content
width. Rendering at 375 with all six names on is pixel-identical to before; the
stale comment describing the pill went with it.

## Verified, not changed

- Six controls, in `REFINEMENTS` order, one `Ready to issue`, counts always shown
  including `0` and always muted — matches mock and §2.1.
- The strip: plain names joined ` + `, `Clear` never wrapping, wrapping to three
  lines at 375 with all six on — matches mock §3 and §5.
- Empty state copy and the funnel bubble — unchanged from the mock's frames.
- `npm run typecheck:gate`: clean (64 pre-existing non-fatal).
- `scripts/tests/web/ops2-projects.spec.ts`: 25/25 green after the change.
- Impeccable detector over the changed files: no findings.

## Findings NOT fixed

### P0 — on a phone under ~800px tall, the sixth control is clipped and the panel's footer is unreachable

At 375×667 the sheet shows five controls, clips `In production`, and puts `Clear all
filters` at y≈704 — below the window. It cannot be reached at all:

- Ionic renders the phone form as a **full-height wrapper translated down** to its
  breakpoint, so `ion-content` is ~601px tall inside a 333px visible sheet. Nothing
  overflows (`scrollHeight === clientHeight`), so **the content does not scroll**.
- `SidePanel` passes `breakpoints={[0, 0.5]}`, so there is **no higher stop to drag
  to** — measured: dragging the handle up moves nothing, and the wheel does nothing.

Three refinements fitted inside the visible half; six do not. At 375×844 all six and
the button are visible and only the footer note is clipped, so the failure is
height-dependent rather than universal — which is exactly how it survived the build's
own 390×844 tests.

This is not a finish problem and I did not try to CSS my way around it: every fix is
a change to how the panel behaves — a third breakpoint (`[0, 0.5, 1]`) so the sheet
can be dragged open, or `phoneForm="screen"` for the filter, or capping the content
box to the breakpoint inside `SidePanel`. That is a developer change through
`conduct fix`, and it wants the owner's eye on which of the three, since the sheet
form was his own instruction. **Route it before acceptance.**

### P3 — chip counts differ from the mock's frames (not a defect)

With all six refinements on, the built chips read `All · 0 / Needs us · 0 /
Customer · 0`; the mock's same frame draws `6 / 3 / 2`. The built behaviour is
`chipStates`' documented one — every control counts "what would I be left with" — and
it predates this feature. The mock's static numbers are the drawing's convenience.
No change.

### P3 — the funnel bubble sits 4px from the window edge at 1440

Pre-existing geometry (`top: -.5rem; right: -.5rem`), unchanged by this feature,
which only widened the bubble's range from 0–3 to 0–6. Single digits either way.
Left alone.
