# Ops redesign — accumulated learnings, salvaged

**Status: mandatory input to any ops redesign pass. Not exploratory.**

This document is a **salvage inventory**, not a design. Everything in it was already
decided, already built, already broken and already fixed during a long iterative session
between the owner and an agent. That session's transcript was lost; only the built
artifacts survived. The artifacts carry the reasoning inline, in HTML/CSS/JS comments,
because the specification they were built from (`§0`–`§17`, ~178 numbered rules
`R-1`…`R-178`) no longer exists as a document.

A later design pass read `README.md`'s "none of this is binding" framing, treated the
mocks as exploratory, mined nothing from them, reintroduced problems that had already
been solved, and discarded the mobile interaction model entirely. This document exists so
that cannot happen again.

**Read this as two different kinds of statement, and do not confuse them:**

- **Sections 1, 2, 4, 5, 6 — decisions and mechanisms.** These are open to challenge on
  their merits. They are recorded so that a challenge is *informed* rather than a
  re-derivation from zero. Section 4 in particular records **what was already rejected and
  why**, so a rejected option is not re-proposed as if it were new.
- **Section 3 — the owner's review feedback in preserved form.** These are defects the
  owner hit, reported, and had fixed — plus, in §3.10, the hostile audit's findings against
  the earlier written spec. They are not opinions. Reintroducing one of them is a
  regression, not a design choice.
- **Section 7 — the honest gaps.** What is referenced but genuinely unrecoverable.

## Provenance and how to verify

| Source | Path | Weight |
|---|---|---|
| `ops-ux-mock.html` (20,925 lines / 1.09 MB) | `docs/ops-redesign/mocks/ops-ux-mock.html` | **Primary.** 399 `R-<n>` citations across 154 distinct rules, cited *at their point of use with rationale*. 1,155 comment blocks. |
| `ops-v2-full-site.html` (1,616 lines / 102 KB) | `docs/ops-redesign/mocks/ops-v2-full-site.html` | Later, broader, simpler. The owner called it "the latest version" and said he likes its feel. 118 comment blocks, zero `R-` citations. |
| `UX-SPEC.md` (2,295 lines) | `docs/ops-redesign/` | **An earlier generation.** It does **not** contain `R-<n>` rules or `§0`–`§17` — it has its own structure (`§A`–`§I`, principles `P1`–`P7`, grafts `G1`–`G18`, a 291-row no-regression contract `#1`–`#291`). Its §B.4 no-regression contract is the one part `README.md` calls factual rather than proposed. |
| `UX-AUDIT.md` (415 lines) | `docs/ops-redesign/` | A hostile completeness review of `UX-SPEC.md`. Verdict: **"Not safe to build from as written."** 11 dropped capabilities (`D1`–`D11`), 9 degraded (`G1`–`G9`), 18 invented (`I1`–`I18`), each with a written fix. |
| `README.md` | `docs/ops-redesign/` | Reading order + the table of corrections where audit beat spec. |
| `BRAINSTORM-TRANSCRIPT.md` | `docs/ops-redesign/` | The surviving fragment of the conversation that started it. |

**Three generations, not one.** `UX-SPEC.md` → `UX-AUDIT.md` corrects it → `ops-ux-mock.html`
is built from a **later, different** rule document (`§0`–`§17` / `R-1`…`R-178`) that no longer
exists → `ops-v2-full-site.html` is later again and simpler. `README.md` states the
spec→audit relationship: *"The prototype implements the spec **as corrected by the audit**, not
the spec as written. Where the two disagree, the audit won."* The mock's rules are therefore
downstream of both, and where the mock and the spec differ the **mock is later**.

Every claim below cites a file and a line number in the form `ops-ux-mock.html:1461`.
Line numbers are against the files as committed. Where I am **inferring** a rule's
content from its use site rather than reading it stated, the entry says so explicitly.

---

# 1. The mobile interaction model

This is the highest-value section and the one most catastrophically dropped. The mock
contains ~100 references to a **plane model**. It is not responsive column-stacking, and
the difference is the whole point.

## 1.1 What a plane is

A plane is a **full-frame surface that occupies the entire workspace body below the
chrome**, one at a time, at phone widths. It is not a column that has wrapped; it is a
destination.

```css
/* Plane (phone stack, §13.4) — push 240ms, pop 200ms, reduced-motion → cross-fade */
.plane {
  position: absolute; inset: 0; z-index: var(--z-plane);
  display: flex; flex-direction: column; background: var(--surface-1);
  height: 100%; transition: transform var(--dur-push) var(--ease-std);
}
.plane[data-anim="enter"] { transform: translateX(100%); }
.plane[data-anim="in"] { transform: translateX(0); }
.plane-body { flex: 1 1 auto; overflow-y: auto; overscroll-behavior: contain; min-height: 0; }
.plane-foot {
  flex: none; min-height: var(--footer-h);
  display: flex; align-items: center; gap: var(--space-4);
  padding: 0 var(--pad); padding-bottom: calc(var(--kb-inset) + var(--safe-bottom));
  background: var(--surface-2); border-top: var(--divider) solid var(--rule);
}
```
— `ops-ux-mock.html:1461-1476`

Structure of every plane, in order: **an identity bar, a scrolling body, a pinned
footer.** The body is the only thing that scrolls (`overflow-y: auto` +
`overscroll-behavior: contain`); the footer is `flex: none` and sticky *within the
plane's flex column*, never viewport-fixed.

> "R-152: the action footer is sticky WITHIN the plane's flex column, never
> viewport-fixed, and it sits above the keyboard (R-5)."
> — `ops-ux-mock.html:1428`

## 1.2 The three workspace planes

At phone width the quote-review workspace's three desktop zones — **rail / canvas /
pane** — become three planes:

| Plane | Desktop equivalent | Addressed as | Label in the switcher |
|---|---|---|---|
| `lines` | the rail (line index, §5.5) | `?plane=lines` | `Lines <n>` |
| `work` | the canvas (drawing plate + lens chips + panels) | `?plane=work` | the line code, e.g. `W04` |
| `edit` | the pane (the line editor) | `?plane=edit` | `Edit` |

```js
[["lines", "Lines " + sum.openings], ["work", line ? line.code : "Work"], ["edit", "Edit"]]
```
— `ops-ux-mock.html:11194`

On a phone **the rail IS the Lines plane** — the same DOM zone, revealed rather than
rebuilt:

```css
/* Phone ≤767 — plane stack (§13.4) */
:root[data-width-class="phone"] .ws-zones { grid-template-columns: minmax(0, 1fr); }
:root[data-width-class="phone"] .zone[data-zone="rail"],
:root[data-width-class="phone"] .zone[data-zone="pane"] { display: none; }
:root[data-width-class="phone"] .zone[data-zone="rail"][data-plane-active="true"],
:root[data-width-class="phone"] .zone[data-zone="pane"][data-plane-active="true"] { display: flex; }
```
— `ops-ux-mock.html:954-959`; the `data-plane-active` attribute is set in
`ops-ux-mock.html:9009` with the comment *"on a phone the rail IS the Lines plane
(§13.4)"*.

The `edit` plane is presented as a **sheet** (`.sheet`, full-frame at phone width), not a
`.plane` element — the same overlay technique, `inset: 0; width: 100%; border-left: 0;
padding-top: var(--safe-top)` (`ops-ux-mock.html:1417-1420`).

## 1.3 Navigation between planes — the load-bearing rule

**The active plane is DERIVED FROM THE ROUTE, never held as module state.** This is the
single most important sentence in the whole model, and the mock records it as a bug that
was found and fixed:

> "§13.4 — the plane is DERIVED from the route, not held as module state. Held as state
> it defaulted to "lines" forever, so opening a line on a phone — from a link, from the
> command bar, from the address bar — left you looking at the list, and the whole line
> plane (hero, chips, panels) was unreachable except by tapping the switcher. Deriving it
> makes every push a real history entry, which is R-148's requirement and the single
> largest thing [P-1] buys. `?plane=lines` is how the Lines plane is addressed while a
> line is still selected (R-149: selection is global)."
> — `ops-ux-mock.html:8959-8967`

The derivation itself:

```js
W.plane = OPS.state.query.plane === "lines" ? "lines"
        : OPS.state.query.plane === "work" ? "work"
        : (scope === "line" ? "work" : "lines");
ROOT.setAttribute("data-plane", W.plane);
```
— `ops-ux-mock.html:8967-8970`

Consequences that follow from this and are stated explicitly:

- **The OS back gesture pops the plane.** *"Through the URL, so the OS back gesture pops
  the plane (R-148)."* — `ops-ux-mock.html:11205`
- **Every push is a real history entry.** Deep links, refresh, share and scroll
  restoration all hang off hash routing (`P-1`, `ops-ux-mock.html:7717`).
- **Selection is global** (R-149) — the selected line survives a plane change; `?plane=lines`
  addresses the list *while a line is still selected*.
- **The left gutter belongs to the OS back gesture** and no in-app gesture may claim it
  (see §1.7).

### Motion

| Token | Value | Cited |
|---|---|---|
| `--dur-push` | `240ms` | `/* R-148 plane push */` — `ops-ux-mock.html:373` |
| `--dur-pop` | `200ms` | `/* R-148 plane pop */` — `ops-ux-mock.html:374` |
| `--ease-std` | `cubic-bezier(0.2, 0, 0, 1)` | `ops-ux-mock.html:375` |
| `--shadow-plane` | `-6px 0 24px rgb(… / 0.12)` | `ops-ux-mock.html:368` |
| `--z-plane` | `55` (above sheet 50, below drawer 60) | `ops-ux-mock.html:387` |

**Under reduced motion the push becomes a cross-fade.** Two mechanisms, both present:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: var(--dur-instant) !important;
    animation-iteration-count: 1 !important;
    transition-duration: var(--dur-instant) !important;
    scroll-behavior: auto !important;
  }
}
:root[data-reduced-motion="yes"] .plane { transition: none !important; }
```
— `ops-ux-mock.html:684-692`; the attribute is written in JS from
`matchMedia("(prefers-reduced-motion: reduce)")` at `ops-ux-mock.html:7653-7655`.

*Inferred, not read:* the header comment at `ops-ux-mock.html:1461` says
"reduced-motion → cross-fade", but the CSS ships `transition: none` rather than an opacity
cross-fade. The **intent** is stated; the cross-fade keyframes are not in the file.

## 1.4 The plane switcher (R-151) — a visible, accessible control

```css
/* R-151 — the segmented switcher is the visible, accessible control for the
   three workspace planes. Gesture is never the only route (R-158). */
.planebar {
  flex: none; display: none; gap: var(--space-3); padding: var(--space-4) var(--pad);
  background: var(--surface-2); border-bottom: var(--divider) solid var(--rule);
}
:root[data-width-class="phone"] .planebar { display: flex; }
.planebar button {
  flex: 1 1 0; min-height: var(--tap-min); border: var(--divider) solid var(--ctl-border);
  background: var(--ctl-bg); border-radius: var(--r-md); font: var(--t-quiet); color: var(--text-2);
  cursor: pointer;
}
.planebar button[aria-selected="true"] { background: var(--surface-selected); color: var(--text-0);
  border-color: var(--brand-border); font: var(--t-body-strong); }
```
— `ops-ux-mock.html:2273-2286`

- `role="tablist"`, `aria-label="Workspace planes"`, each button `role="tab"` with
  `aria-selected` (`ops-ux-mock.html:11192-11196`).
- Every button is at least `--tap-min` (44px) tall; three equal `flex: 1 1 0` columns.
- Choosing `work` or `edit` with no line selected **announces** `"Choose a line first."`
  rather than doing nothing (`ops-ux-mock.html:11200`, `11204`).
- Switching announces quietly: `OPS.announce("Lines." | "<code>.", { quiet: true })` —
  assistive-technology-only, never a visible toast (`ops-ux-mock.html:11207`).
- The switcher measures **61px** of vertical budget (stated at `ops-ux-mock.html:9191`).
- The canvas zone is hidden while the Lines plane is active:
  `:root[data-width-class="phone"] .ws-zones[data-plane="lines"] .zone[data-zone="canvas"] { display: none; }`
  — `ops-ux-mock.html:2288`.

## 1.5 §13.5 — the phone **job** plane, and the phone action footer

**The job plane header is a short stack, not a single band.** This is a deliberate,
measured exception to §5.4's "the Job Bar is one row at every width":

> "§13.5 — the PHONE job plane header is a short stack, not a single band: the lifecycle
> sentence on one line, the blocker beneath it as a tappable row. Two rows of ~34 and ~36
> with the topbar's 48 leaves the list the ~552px §13.5 budgets for it. Everything the
> desktop bar carries on its right — value, version selector, refresh, shortcuts — is one
> tap away under `⋯`."
> — `ops-ux-mock.html:1733-1738`

```css
:root[data-width-class="phone"] .jobbar {
  display: grid; grid-template-columns: minmax(0, 1fr) auto;
  align-items: center; height: auto; min-height: 0;
  row-gap: var(--space-2); column-gap: var(--space-4);
  padding-top: var(--space-3); padding-bottom: var(--space-3);
  overflow: hidden;
}
:root[data-width-class="phone"] .jobbar-left   { grid-column: 1; }
:root[data-width-class="phone"] .jobbar-centre { grid-column: 1; }
:root[data-width-class="phone"] .jobbar-right  { grid-column: 2; grid-row: 1 / span 2; margin-left: 0; align-self: center; }
:root[data-width-class="phone"] .blocker-sentence { grid-column: 1 / -1; justify-self: start; }
```
— `ops-ux-mock.html:1739-1750`

### The phone action footer (R-153)

```
--footer-phone-h: 56px;      /* §13.5 — the phone action footer */
```
— `ops-ux-mock.html:281`

> "R-153 — the phone action footer: one primary taking the width, `⋯` for every secondary
> and every overflow action, and the blocked primary's reason beneath it inside the
> footer. **This is the ONE footer allowed a second line**, because on the line plane
> there is nowhere else the reason can be said (the Job Bar's blocker sentence belongs to
> the job plane)."
> — `ops-ux-mock.html:2311-2315`

```css
:root[data-width-class="phone"] .canvas-foot[data-blocked="yes"] {
  height: auto; min-height: var(--footer-phone-h);
  flex-wrap: wrap; align-items: center; padding-top: var(--space-3);
  padding-bottom: calc(var(--space-3) + var(--kb-inset) + var(--safe-bottom));
}
:root[data-width-class="phone"] .canvas-foot .foot-reason {
  flex: 1 1 100%; margin: 0; font: var(--t-cap); color: var(--tone-attention-fg);
  white-space: normal;
}
```
— `ops-ux-mock.html:2316-2325`

What the phone footer drops, and why:

> "§13.5's footer is `state sentence · [primary ▾]`; on a phone the lifecycle is already
> told in the plane header, and 390px of footer has room for one action and `⋯`, not a
> sentence as well (R-153)."
> — `ops-ux-mock.html:10093-10095`

On a phone **every non-primary action goes into the overflow**, unconditionally, not by
measurement: `if (a.tier === "overflow" || (isPhone && !isPrimary)) { overflow.push(a); return; }`
(`ops-ux-mock.html:10127`). The overflow glyph is `⋯` on a phone and `▾` elsewhere
(`ops-ux-mock.html:10154`). Overflow opens a sheet, and **the blocked reason travels with
the action into that sheet** (`ops-ux-mock.html:10166-10170`).

Where the pane is a sheet, the ONE action site grows an explicit `Edit <code>` button —
*"gesture is never the only route to anything (R-158)"* — `ops-ux-mock.html:10105-10111`.

## 1.6 §13.6 — the per-plane identity bar

```
--jobbar-phone-h: 48px;      /* §13.6 — the line plane's identity bar */
```
— `ops-ux-mock.html:282`

The **line plane gets its own 48px identity band, and it is NOT the job bar.** The
reasoning is a measured failure report:

> "§13.6 — the phone LINE plane's header is one 48px band:
> `‹  W04 · Bed 1                    ‹ 4/18 ›   ⋯`
> Not the job bar. Wrapped to phone width the job bar took FOUR rows (213px); with the
> 61px plane switcher and a wrapped 247px footer that left 275px of scroll for a 433px
> plate, so the chip strip and every panel were rendered BELOW the footer and the line
> plane showed nothing but a drawing. The job's own bands (lifecycle, blocker, value)
> belong to the job plane, which is one tap away and where §13.5 puts them."
> — `ops-ux-mock.html:9187-9194`

**What the identity bar carries, left to right** (`renderLinePlaneBar`,
`ops-ux-mock.html:9195-9226`):

1. **`‹` back control** — `aria-label="Back to the line list"`, sets `?plane=lines`.
2. **Identity** — `line.code`, then a `·` separator, then a subtitle that is
   `line.room || line.productName || p.title` — *"Room, then product, then the job — never
   an empty string after a separator"* (`ops-ux-mock.html:9202-9203`).
3. **The stepper `‹ 4/18 ›`** (R-155) — see below.
4. **`⋯`** — `aria-label="More about this job"`, opens the job's other bands.

```css
/* The line plane's own 48px identity band keeps the single-row layout. */
:root[data-width-class="phone"] .jobbar-line {
  display: flex; flex-wrap: nowrap; align-items: center;
  height: var(--jobbar-phone-h); min-height: var(--jobbar-phone-h);
  padding-top: 0; padding-bottom: 0;
}
```
— `ops-ux-mock.html:1751-1757`

### R-155 — the stepper is what makes a phone a review device

> "R-155 — the stepper moves through the FILTERED set without returning to the list. That
> is what makes a phone a review device rather than a reader."
> — `ops-ux-mock.html:9210-9211`

> "R-155 — on a phone the stepper moves through the FILTERED set without returning to the
> list. It is the difference between reviewing on a phone and merely reading on one. It
> rides in the line plane's own header (§13.6) so the 56px action footer keeps its whole
> width for the action."
> — `ops-ux-mock.html:10088-10091`

Implementation: the pool is `visibleLines(p)` — the *filtered* rail set — with `‹` / `›`
disabled at the ends and the position printed as `(at+1)/pool.length` in the data face
(`ops-ux-mock.html:9212-9219`). On short viewports the stepper moves into `⋯`:
`/* R-17.2 — below 900px of viewport height the stepper moves into `⋯`. */`
(`ops-ux-mock.html:9325`).

### §13.6 also governs the lens chip strip

> "R-68 — at 390 the five chips measure ≈435px including gaps, so the fifth is partly cut
> and the strip reads as scrollable. They never wrap and never become a dropdown, so the
> verdict abbreviates instead (§13.6's own strip:
> `Why · plan │ Glass · misses │ Build · 3 │ Price · $1,840 │ Trai…`)."
> — `ops-ux-mock.html:2015-2018`

> "R-68 / §13.6 — the phone strip abbreviates the verdict rather than wrapping, scrolling
> out of reach or becoming a dropdown … A verdict may state its own short form; otherwise
> the first word stands for it, which is what §13.6's own strip does."
> — `ops-ux-mock.html:7357-7361`

Note the deliberate design: the fifth chip is **cut on purpose** so the strip *reads as*
scrollable. `:root[data-width-class="phone"] .lens-strip { flex-wrap: nowrap; overflow-x: auto; }`
(`ops-ux-mock.html:2699`).

The phone hero plate is `320 × 248` (`--plate-phone-w` / `--plate-phone-h`,
`ops-ux-mock.html:319`), tapping it is the expand control (R-154), so the explicit action
row stands down (`ops-ux-mock.html:2688-2690`).

## 1.7 §13.8 — gesture rules

Three hard rules, all stated:

1. **Long-press is forbidden.**
   > "R-32 — every peekable reference carries a visible 44×44 touch trigger, because Space
   > is a desktop-only affordance and long-press is forbidden (§13.8)."
   > — `ops-ux-mock.html:1915-1916`
2. **Gesture is never the only route to anything (R-158).** Cited at
   `ops-ux-mock.html:2274`, `9803`, `10106`, `14137`.
3. **The left gutter belongs to the OS back gesture.**
   > "§13.8 — horizontal swipe moves between lenses. ≥12px horizontal, <8px vertical,
   > never from the left gutter (that is the plane pop). Gesture is never the only route
   > to anything (R-158)."
   > — `ops-ux-mock.html:14135-14137`

The implementation is exact — a 20px left dead zone, a 12px horizontal threshold and an
8px vertical veto:

```js
panels.addEventListener("touchstart", function (e) {
  var t = e.touches[0];
  tracking = t.clientX > 20;
  tx = t.clientX; ty = t.clientY;
}, { passive: true });
panels.addEventListener("touchend", function (e) {
  if (!tracking) return;
  tracking = false;
  var t = e.changedTouches[0];
  var dx = t.clientX - tx, dy = Math.abs(t.clientY - ty);
  if (Math.abs(dx) < 12 || dy >= 8) return;
  …
}, { passive: true });
```
— `ops-ux-mock.html:14138-14154`

The same swipe is also reachable by the chips and by keys `1`–`5`
(`ops-ux-mock.html:9803`).

## 1.8 §13.3 — tablet portrait (768–1023): overlay rail + sheet editor

Tablet portrait is **not** a plane stack. It is one column plus two summonable overlays:

```css
/* Tablet portrait 768–1023 — rail becomes an overlay list, editor becomes a sheet */
:root[data-width-class="tabletp"] .ws-zones { grid-template-columns: minmax(0, 1fr); }
:root[data-width-class="tabletp"] .zone[data-zone="rail"],
:root[data-width-class="tabletp"] .zone[data-zone="pane"] { display: none; }
```
— `ops-ux-mock.html:950-952`

- **The rail is an overlay list** summoned from `Lines (14) ▾` in the canvas head,
  *"dismissed by Esc, the scrim, or choosing a line (§13.3)"* —
  `ops-ux-mock.html:1953-1954`, `9034-9042`, `9236-9237`.
  Width `--rail-overlay-w: min(88%, 420px)` — `ops-ux-mock.html:298`.
- **The editor is a sheet**, `--sheet-w: min(88%, 520px)`, right-anchored, full-frame only
  at phone width — `ops-ux-mock.html:311`, `1411-1420`.
- At tablet portrait the pricing editor sheet carries **no scrim**, deliberately:
  > "§13.3 — at tablet portrait the sheet carries NO scrim, so the worked example stays
  > legible beside it. On a phone it is full-screen and the read-back strip is the only
  > view of the ladder there is."
  > — `ops-ux-mock.html:19825-19827`
- Non-workspace surfaces (Customers, Organisation) also get a plane treatment at ≤1023:
  > "§13.3 / §13.4 — the index is a plane of its own, reached by the URL, and the editor is
  > a sheet. Nothing is hidden; the route decides the plane."
  > — `ops-ux-mock.html:17137-17138`
  with a `.sc-back` control that appears only at `tabletp` and `phone`
  (`ops-ux-mock.html:3417-3426`).

## 1.9 §13.1 — the five width classes, and why they are attributes not media queries

```
--bp-wide: 1680px;      /* wide      ≥1680  rail 320 · pane 440           */
--bp-desktop: 1280px;   /* desktop   1280+  rail 264–320 · pane 380–400   */
--bp-compact: 1024px;   /* compact   1024+  rail 48 code strip · pane 380 */
--bp-tabletp: 768px;    /* tabletp   768+   rail overlay · pane sheet     */
                        /* phone     <768   plane stack                   */
--rail-narrow-at: 1400px;  /* rail auto-narrows to 288 below this (§5.2) */
```
— `ops-ux-mock.html:411-416`

```js
OPS.widthClass = function () {
  var w = OPS.effectiveWidth();
  return w >= 1680 ? "wide" : w >= 1280 ? "desktop" : w >= 1024 ? "compact" : w >= 768 ? "tabletp" : "phone";
};
```
— `ops-ux-mock.html:7629-7632`

**Layout is driven by attributes on `<html>`, never by width media queries.** This is
stated three separate times, in three separate stylesheets, as a hard rule:

> "Declared as tokens for documentation and for JS to read. Layout in this build is driven
> by `:root[data-width-class]` and `:root[data-pointer]`, **NOT by width media queries** —
> that is what lets the dev strip's device toggle genuinely reframe the console instead of
> merely claiming parity."
> — `ops-ux-mock.html:406-410`

> "Width media queries are deliberately NOT the layout driver: they cannot be reframed by
> the device toggle, and full device parity (§13) has to be **drivable, not merely
> claimed**."
> — `ops-ux-mock.html:456-458`

The attributes written onto `<html>` (`ops-ux-mock.html:447-453`, `7633-7655`):

| Attribute | Values | Derived from |
|---|---|---|
| `data-device` | `desktop \| laptop \| tablet \| phone` | the dev-strip device toggle |
| `data-width-class` | `wide \| desktop \| compact \| tabletp \| phone` | `OPS.effectiveWidth()` |
| `data-bar` | `full \| ref \| more \| phone` | top-bar collapse ladder: `≥1152 / ≥900 / ≥768 / <768` |
| `data-pointer` | `fine \| coarse` | device class OR `matchMedia("(pointer: coarse)")` |
| `data-short` | `no \| yes \| tight` | **viewport height**: `<900 → yes`, `<720 → tight` |
| `data-prov` | `off \| on` | provenance overlay |
| `data-online` | `yes \| no` | `navigator.onLine` or two consecutive network failures |
| `data-rail` / `data-pane` | `collapsed \| expanded` | zone geometry |
| `data-reduced-motion` | `yes` | `prefers-reduced-motion` |
| `data-plane` | `lines \| work \| edit` | **the route** (§1.3) |

### Device frames — parity is driven, not claimed

The dev strip's device toggle resizes a real frame and the console genuinely lays out
inside it:

```
--dev-laptop-w: 1366px;  --dev-laptop-h: 768px;
--dev-tablet-w: 834px;   --dev-tablet-h: 1112px;
--dev-phone-w: 390px;    --dev-phone-h: 844px;
```
— `ops-ux-mock.html:432-434`; toggle at `ops-ux-mock.html:8487-8500` — *"2 — DEVICE
TOGGLE, so §13 parity can be driven rather than claimed"*.

Because of that, **overlay sizes are relative to the device frame, not the browser
window**:

> "Overlay sizes are relative to the DEVICE FRAME, not the browser window. The device
> toggle reframes the console by resizing `.ops-device`; vw/vh key on the real viewport
> and would make a 640px dialog inside a 390px phone. Every overlay layer is
> `position:absolute;inset:0` inside the frame, so a percentage resolves against the frame
> and reframes with it."
> — `ops-ux-mock.html:293-297`

and the overlay host must live *inside* the frame:

> "#overlay is left as the page's own escape hatch: the console's overlay layer must sit
> INSIDE the device frame or a phone sheet would be sized to the browser window, not to
> the phone."
> — `ops-ux-mock.html:7938-7947`

### Pointer is a separate axis from width

`--tap-min: 44px` is *"forced at ANY width under pointer:coarse"* (`ops-ux-mock.html:352`):

```css
/* pointer:coarse raises every control to --tap-min at ANY width (§2.4, R-178) */
```
— `ops-ux-mock.html:641`

Consequences:
- **Drag handles are pointer:fine only** — `:root[data-pointer="coarse"] .zone-handle { display: none; }`
  (R-15, `ops-ux-mock.html:344`, `972`).
- **A coarse pointer gets a taller row inside the collapsed rail strip, not a wider
  strip** — the 48px collapsed rail is load-bearing arithmetic
  (`ops-ux-mock.html:288-291`).
- **Peek triggers exist only where `Space` cannot** — a visible 44×44 chevron under
  `pointer:coarse`, a *sibling* of the row, never nested inside it (R-32,
  `ops-ux-mock.html:1915-1918`, `9610-9612`).
- **PDF anchors open in a new tab under a coarse pointer**, *"because on iOS a PDF
  navigation leaves the SPA and destroys the plane stack"* (R-79,
  `ops-ux-mock.html:15236-15239`, `17872-17874`).
- **Esc does not exist on a soft keyboard**: *"R-134 — Esc does not exist on a soft
  keyboard: under pointer:coarse each dirty row grows a visible ✓ AND ✕ pair."*
  (`ops-ux-mock.html:4010`).

### Height is a first-class input

> "R-17.2 / §2.1 — the Job Bar drops to 44 and the chip strip to 32 on short viewports.
> Height is a first-class input, not an afterthought."
> — `ops-ux-mock.html:7640-7641`

`s.short = h < 720 ? "tight" : h < 900 ? "yes" : "no"` (`ops-ux-mock.html:7642`).

## 1.10 Viewport, safe area and keyboard (R-4 / R-5 / P-7)

```css
height: 100dvh;   /* R-4: dvh everywhere, never vh, never height:100% */
overflow: hidden; /* R-12: the document never scrolls, in either axis */
```
— `ops-ux-mock.html:476-477`

```
/* ═══ 10. VIEWPORT, SAFE AREA, KEYBOARD — R-4 / R-5 / [P-7] ═══════════════
   --kb-inset is written by the visualViewport handler in 20-core.js. Every
   sticky footer above a focusable input sits at `bottom: var(--kb-inset)`.
   It is declared here so the value exists before the handler ever runs. */
--kb-inset: 0px;
--safe-top: env(safe-area-inset-top, 0px);
--safe-right: env(safe-area-inset-right, 0px);
--safe-bottom: env(safe-area-inset-bottom, 0px);
--safe-left: env(safe-area-inset-left, 0px);
--footer-safe: max(var(--space-6), var(--safe-bottom));
```
— `ops-ux-mock.html:395-404`

Ownership of the two insets is split, and stated:

> "The footer's own padding-bottom carries the keyboard inset; the safe-area inset belongs
> to whichever box is last in the plane."
> — `ops-ux-mock.html:1048-1049`

Every plane/sheet/modal footer therefore ends
`padding-bottom: calc(<pad> + var(--kb-inset) + var(--safe-bottom))`
(`ops-ux-mock.html:1432-1433`, `1474`, `2320`).

The Messages composer is *"docked at the bottom OF THE THREAD, not pinned to the
scrollport"* — because the canvas is one scroll for all seven panels — but
*"R-5's keyboard inset still applies, because on iOS the field can sit under the
keyboard"* (`ops-ux-mock.html:3003-3006`).

## 1.11 Focus and announcement on a plane push (R-164)

> "R-164 moves focus to a heading on every plane push and route change, using
> `tabindex="-1"`."
> — `ops-ux-mock.html:659-660`

> "R-164 — a plane push focuses the new plane's h1. On a wide screen the surface header is
> already the first thing in the tab order."
> — `ops-ux-mock.html:18698-18699`

Implementation guards against re-focusing on a repaint by comparing `location.hash`
(`ops-ux-mock.html:18700-18705`). Focus also **returns to the control that opened a
surface** on close (`ops-ux-mock.html:7570`), and the workspace keeps a canonical
originating control per editor (`W.restoreFocusCode`, `ops-ux-mock.html:8726`).

There is **one live region for the whole console**, and it is deliberately not a toast
system:

> "ONE region for the whole console (§5.4), owned by the surviving surface, and
> deliberately NOT a toast system: no queue, no stacking, no dismissal (P-63).
> Two registers, one region. An OUTCOME … is the console's first success feedback and is
> shown as well as announced. NAVIGATION — a line selected, a panel opened, a filter
> applied, the device toggled — is announced for assistive technology and stays invisible:
> a pill that reappears over the canvas on every click is a toast in all but name, and the
> sign-off list refuses toasts explicitly. Pass `{quiet:true}` for the second register."
> — `ops-ux-mock.html:7577-7589`

## 1.12 §13.9 — full parity below 1024 on the pricing surfaces

> "R-145 / R-159 — pricing is NOT desktop-only. Every rule below that mentions `phone`
> widens or restacks something; **none of them removes a capability**."
> — `ops-ux-mock.html:3544-3546`

> "═══ 8. WIDTH CLASSES — **restack, never remove** (R-146)"
> — `ops-ux-mock.html:4151`

Three §13.9 mechanisms, all preserved:

1. **The read-back strip (R-159/R-160).** The editor sheet covers the small/typical/large
   ladder, so the sheet carries the ladder's *conclusion*:
   > "R-159 / §13.9 — the editor sheet covers the ladder, so it carries the ladder's
   > CONCLUSION: a 3-row read-back strip pinned above its footer, recomputed live from the
   > same preview. It is the 'did I just do something stupid' check, and it is the only
   > thing that makes a phone edit safe."
   > — `ops-ux-mock.html:4113-4117`
   > "…and R-160 says a real reviewer, not an argument, decides whether it is enough."
   > — `ops-ux-mock.html:19778-19781`
2. **A sanctioned exception to the fold rule.**
   > "§13.9 — the 4-column × 3-row comparison keeps its real table at 390px: the
   > side-by-side IS the pedagogy of this dialog, and stacking it destroys it. This is a
   > deliberate, spec-sanctioned exception to the §4.4 fold rule, so it does NOT use
   > `.ops-table`."
   > — `ops-ux-mock.html:3922-3925`
3. **Read-back above stacked controls.**
   > "§13.9 — on a phone the controls stack and the sentence is rendered above them as
   > read-back text, so the grammar stays legible."
   > — `ops-ux-mock.html:3874-3875`

Plus: below 1024 *"the canvas grows the controls the hidden zones used to carry"*
(`ops-ux-mock.html:4137`, `19406-19407`) — the summon buttons for the rail and the pane
appear on the surface that survives.

## 1.13 The fold rule (§4.4 / V9) — the responsive contract for tables

This is the *other* responsive mechanism, distinct from planes, and it applies to ledgers:

```
/* ═══ G. THE FOLD RULE (§4.4, V9) ═══════════════════════════════════════════
   ≥1024 real table, wide content scrolls inside its own box.
   768–1023 the declared primary triple stays; the rest moves to the expansion.
   <768 card per row, EVERY field present, no hidden cells, ever. */
```
— `ops-ux-mock.html:1123-1126`

The 768–1023 band's **row expansion** is the half that had no implementation and had to be
built — see §3.2.

## 1.14 The spec's earlier answer — and what the plane model added to it

`UX-SPEC.md` is the **ancestor** of the plane model, and reading the two together shows exactly
what §13 was invented to fix. **The word "plane" appears five times in `UX-SPEC.md` and never
in a layout sense** — every occurrence means "the record plane", i.e. today's
`ProjectRecord.tsx` surface (`UX-SPEC.md:249`, `:474`, `:618`, `:1899`). The spec's layout
vocabulary is **pane** (A / B / C). **There is no §-numbered device-parity section in the
spec at all.**

What the spec *did* have — its five-step breakpoint ladder, `UX-SPEC.md:1060-1069` (§C.4.10):

| Width | Layout (verbatim) |
|---|---|
| ≥1440 | A 264 / B fluid / C 360 |
| 1280–1439 | A 248 / B fluid / C 340 |
| 1120–1279 | A 240 / B fluid / C becomes a **40px tab strip** of hop icons carrying their counts; clicking one, or `]`, slides a 380px drawer over B, which keeps its scroll |
| 900–1119 | A collapses to a 44px code strip (hover expands); B fluid; C as above |
| 768–899 | One pane: a sticky picker bar under the header (`‹ W03 › · 2 of 8`), B full width, C as a full-height sheet |
| &lt;768 | **Single column, push navigation: queue → record summary → line. The editor and split planner are full-screen pushes.** The header collapses to ref + phase + one action; **the action bar pins to the bottom with safe-area padding.** The openings sheet states the intent: *"Reviewing a job needs a wider screen. This view is for checking state and recording a payment."* — a statement, not a blocker; every control still works |

That `<768` row is the seed of everything in §1.1–§1.7: **push navigation**, **full-screen
pushes**, **a bottom-pinned action bar with safe-area padding**, and a **`‹ W03 › · 2 of 8`
picker** that becomes R-155's stepper. It is also the only place in the whole spec that
mentions a pinned bottom action bar or safe-area padding.

The spec's three narrow-behaviour rules, `UX-SPEC.md:1657-1670` (§E.9), quoted entire:

> 1. **Nothing is hidden without an address.** A pane that collapses becomes a strip with a
>    count, or a summonable drawer with a key — never a disappearance.
> 2. **One component, not two.** `of-row-list` folds columns by priority; there is no separate
>    card component, which is what leaves Enquiries and Files with an 860px table in a sideways
>    scroller today.
> 3. **The phone is admitted as a reading device** for the review workspace, and says so once,
>    in the openings sheet's empty state. Every control still works; nothing is disabled by
>    width.
>
> `main` keeps `min-width: 0` — load-bearing, because a flex child defaults to `min-width: auto`
> and any wide table would otherwise push the whole document sideways.

**What §13 added that the spec did not have:**

- **A pointer axis.** The spec's entire touch specification is one line —
  *"44px on every touch surface; 36px desktop equivalents"* (`UX-SPEC.md:1682`). There is **no
  gesture spec, no swipe, no `pointer: coarse` query and no hover-capability query anywhere in
  it**, while two of its mechanics are hover-only (the rail hover-expand at `UX-SPEC.md:723`,
  the 44px code strip *"hover expands"* at `:1067`). §13's R-32, R-79, R-134, R-158 and R-178
  all exist to close that hole.
- **A height axis.** The spec's ladder is width-only; `data-short` / R-17.2 is new.
- **Routing as the plane mechanism.** The spec has push navigation but no `?plane=`.
- **An identity bar per plane** (§13.6) — the spec has *"the header collapses to ref + phase +
  one action"*, undifferentiated between the job and the line.
- **Reduced motion.** The spec commits to it (*"every animated block has a
  `prefers-reduced-motion: reduce` counterpart"*, `UX-SPEC.md:1683`) but never says what a
  motion-reduced push looks like.

**The spec's phone strategy for lists is different from the workspace's and both survive.** For
ledgers it is **column-priority folding in one component**, graft `G4`:

> "`of-row-list` … `priority: 1` survives every width; 2–3 fold into the row's meta lines below
> their breakpoint. **The whole row is the target on every surface.**"
> — `UX-SPEC.md:1372`

> "**`RowList` with column-priority folding**, killing the table/card duality … Deletes 4 list
> implementations; gives Enquiries and Files their first phone layout"
> — `UX-SPEC.md:50` (G4)

This is the direct ancestor of the mock's fold rule (§1.13) and of `R-146` *"restack, never
remove"*.

**And one narrow-width refusal worth preserving**, because it is the only rejection in the spec
that turns on a viewport number:

> "The top bar cannot hold six destinations plus omnibox plus identity **below 1180px** without
> a 'More' menu, which is the pattern the mobile bottom bar was deleted for. The 224px rail
> costs the centre pane 176px it cannot get back."
> — `UX-SPEC.md:71`

*(Note: the mock chose a **48px top bar** with a four-step collapse ladder, i.e. it went the way
the spec rejected — and built the ladder the spec said would be needed. v2 chose the 224px-class
sidebar the spec also rejected. This is an unreconciled three-way disagreement.)*

## 1.15 What is NOT recoverable in §13

- **§13.2** and **§13.7** are not cited anywhere in either mock. Their content is lost.
- **R-150, R-156, R-157** fall inside the device-parity rule band (R-145…R-162) and have
  zero citations. Their content is lost.
- The reduced-motion **cross-fade** is named but not implemented (see §1.3).
- No `data-anim="enter"`/`"in"` transition is actually driven by JS anywhere in the file;
  the CSS states the push, but the plane change in practice is a full re-render on route
  change. *This is an observation about the mock's fidelity, not a rule.*

---

# 2. Every numbered rule recovered

154 of 178 rule numbers are recoverable from `ops-ux-mock.html` (399 citations). The
reconstruction below states each rule in the form the citations support and gives the
line(s) to verify against. Where the comment states the rule in words, that wording is
used; where only the code states it, the entry is marked ***(inferred from code)***.

**Unrecoverable — 30 numbers with zero citations anywhere in either mock:**
`R-1 R-2 R-3 R-6 R-26 R-31 R-34 R-52 R-54 R-60 R-94 R-96 R-97 R-106 R-107 R-115 R-132
R-136 R-139 R-150 R-156 R-157 R-163 R-166 R-171 R-172 R-173 R-175 R-176 R-177`

Sub-numbered rules that *do* survive: `R-17.2 R-17.3 R-53.1 R-53.2 R-53.3 R-128.1 R-128.4
R-128.5` — implying `R-17.1`, further `R-53.x` siblings and `R-128.2`/`.3` existed and are
lost.

## 2.A Viewport, scrolling, safe area, keyboard

| Rule | Statement | Cited |
|---|---|---|
| **R-4** | `dvh` everywhere, never `vh`, never `height:100%`. Geometry (not content) is what persists. | `476`, `395`, `14426` |
| **R-5** | Every sticky footer above a focusable input sits above the keyboard inset (`--kb-inset`, from `visualViewport`). | `395`, `1429`, `3005` |
| **R-12** | The document never scrolls, in either axis. Every horizontal escape is deliberate and lives on a box that declares `overflow-x: auto`. | `477`, `1128-1139` |

## 2.B Addressing, routing, identity

| Rule | Statement | Cited |
|---|---|---|
| **R-8** | Zero-result copy says what search does **not** cover. *"Search covers project titles, references, order numbers, organisations and customers — not item codes…"* | `8270` |
| **R-9** | Records key on the human handle with an id fallback; a renamed item code that no longer resolves opens the record and says so quietly rather than 404-ing the whole job. | `4515`, `7779`, `7888` |
| **R-10** | Transient UI state never enters the URL. **Exactly eight things are addressable**: surface, filter, sort, free text, record, line, lens, peek. Scroll restoration keys on the URL. | `7813-7815`, `7827`, `8707`, `11829` |
| **R-11** | Below 768 the top bar carries a magnifier, *"or the command bar has no touch trigger at all"*. | `806`, `7999` |

## 2.C Top bar and global chrome

| Rule | Statement | Cited |
|---|---|---|
| **R-7** | The surface header owns the name of the actual thing. | `885` |
| — | (Collapse ladder, §3.1) `≥1152` all eight · `900–1151` tier 3 → `Reference ▾` · `768–899` tiers 2+3 → `More ▾` · `<768` hamburger + search icon (R-11). | `805-807` |

## 2.D The workspace frame: zones, widths, drag

| Rule | Statement | Cited |
|---|---|---|
| **R-13** | **The rail yields, never the pane.** At 1024–1279 the rail auto-collapses to a 48px code strip and the pane STAYS A COLUMN. §5.2's row: `48 rail + 380 pane + 2 dividers → canvas 849 at 1279, 594 at 1024`. Rail ladder: 1280–1339 → 264, 1340–1399 → 288, restored above 1400. | `288`, `936`, `942-947`, `1618` |
| **R-14** | Expanding the rail **by hand** at 1024–1279 is the *one* thing that may force the editor into a sheet, because the canvas would otherwise fall below `--canvas-min` (560px). `railExpandedByHand` is a DISTINCT flag from `railCollapsed`. The rail's tooltip says so. | `936`, `1628`, `7259-7263`, `7694`, `9653-9656` |
| **R-15** | Drag handles: **8px visual / 4px hit, `pointer:fine` only.** They are `[P-64]`, a Tier 3 sign-off. | `344`, `961-973`, `1645`, `7382` |
| **R-16** | The 400px pane gives **two** option columns; **three** arrive at 480px, and the drag tooltip says so *"because it is a cheap, real win"*. | `305`, `2209` |
| **R-147** | (cited once) The live-redraw loop must survive to 1024 — the pane stays a column at compact. | `943` |

## 2.E Heights: bars, strips, footers

| Rule | Statement | Cited |
|---|---|---|
| **R-17** | The drawing plate (§6.3). | `1967` |
| **R-17.2** | Job Bar `56 / 44`; chip strip `36 / 32`. 44px **below 900px of viewport height**; both short classes (`yes` and `tight`) must be honoured. | `276`, `974`, `982-985`, `7640`, `9325` |
| **R-17.3** | The canvas footer is **48px and ONE ROW**, always. It is load-bearing for the whole §5.3 height ladder. Anything that does not fit goes behind `▾` (R-38). | `1025-1031`, `2108-2111`, `10115` |
| **R-18** | Scrolled past **24px** the drawing plate pins as a **56px** strip. **It never disappears.** Tapping it or returning to scroll-top restores `md`. | `320`, `1994`, `2356`, `2418`, `14129` |

## 2.F The rail

| Rule | Statement | Cited |
|---|---|---|
| **R-20** | The rail is the line index **and nothing else**. | `1822` |
| **R-21** | The rail's state word is the **worse** of the line's status and its review flags. | `5929` |
| **R-22** | **Filtering never changes selection.** A selected line filtered out of view stays pinned above the list under its own divider. | `9540` |
| **R-23** | Past **24px** of scroll the scope row, summary and chips slide away, leaving the `/` filter pinned. At a 1366 laptop that is 4.5 rows → 6. | `1854`, `8712`, `9517` |
| **R-24** | The rail never changes when the canvas switches scope. | `1883`, `8949` |
| **R-25** | Collapsed rail is **48px**, or 64px under `pointer:coarse`. A minimised index of the zone's own content — NOT the forbidden second nav band (C6). | `1934`, `8845`, `19324` |
| **R-27** | **One selection, three surfaces** — rail, Build's unit list, a Trail row all select the same thing. At job scope the line stays selected with a quieter marker. | `1882`, `8714`, `8947`, `9713` |
| **R-32** | Every peekable reference carries a **visible 44×44 touch trigger** under `pointer:coarse`, because `Space` is desktop-only and long-press is forbidden (§13.8). It is a **sibling** of the row, never nested. A fine-pointer ledger keeps its exact columns. | `1915-1918`, `9610`, `15810`, `16569` |
| **R-33** | The filter the reviewer arrived from is carried in `&from=` (M3). | `8803` |

## 2.G The blocked primary and the one action site

| Rule | Statement | Cited |
|---|---|---|
| **R-19** | The blocked primary's reason is rendered **ONCE**, in the Job Bar, beside the primary it blocks, as a tappable sentence that **filters the rail to those lines**. One rendering, two lengths: the accessible name and the title always carry the whole sentence; only the printed span shortens. The rail footer states the TOTAL, never the blocker. | `993`, `1758-1772`, `5866`, `9333-9341`, `9686` |
| **R-38** | The footer is one row; **how many actions fit is MEASURED, not guessed.** Everything past what fits moves behind `▾` — visible, one tap away, never silently dropped. **The primary is never demoted.** | `1029`, `2089-2111`, `10115-10126`, `10183` |
| **R-39** | Confirm strips **expand upward from the footer, in place, never modal.** | `2119`, `3903`, `8722` |
| **R-40** | The action bar is **hidden entirely** on a frozen set. | `10068`, `10075`, `11140` |

## 2.H The editor / pane

| Rule | Statement | Cited |
|---|---|---|
| **R-28** | **ONE discard guard**, owned by the pane, for all four routes out: ✕, Escape, Cancel, browser/OS back. `beforeunload` is armed by the core. | `2262`, `8721`, `9730-9733`, `10337` |
| **R-29** | While dirty, the footer **states the risk** (an expired Access assertion forces a reload and the edit vanishes). Drafts are still not persisted; a silent loss becomes a known one. | `10734`, `10791` |
| **R-30** | In a Workspace the peek anchors over the **CANVAS**, never over the pane — anchoring right would cover a dirty editor and make "inspect a file while editing a line" impossible. | `1636` |
| **R-35 / R-93** | `⌘S` when `canSave` is false does **not** do nothing: it focuses the first blocking issue and announces it. *"Silence on a keystroke is a bug."* | `11056` |
| **R-36** | The job's primary action is **deliberately not keyboard-triggerable** — it emails customers and takes money, so it requires a pointer and the strip. | `6219`, `6232` |
| **R-37** | `Esc` pops **exactly one level per press**. The ladder is overlay → drawer → peek → the surface's own handler. | `8591`, `11338` |
| **R-41** | After Save, **no auto-advance**. *"Auto-advance steals the moment a reviewer checks their own work."* | `8720`, `10797` |
| **R-42** | A save **patches state in place**: canvas scroll and lens expansion are preserved. A full reload happens only after a job-scope action. | `11024`, `14198` |
| **R-87** | At ≥1280 the in-form drawing drops to `xs`, because the plate in the middle is now the drawing. Below 1280 the plate is covered, so it is raised to `md` upscaled (R-51). | `1607`, `2183` |
| **R-88** | Under `rail` mode the outer Options Section is **flattened** — one level of disclosure removed from a 400px column inside a scrolling zone. | `2191`, `10623` |
| **R-89** | Staff see **withdrawn products, MARKED, never hidden**, and the whole family with mismatches marked; the save proceeds and stamps a compatibility review reason. | `10533`, `6172` |
| **R-90** | **Nothing clears a review flag as a side effect, ever.** Only the explicit checkbox does, and the server logs it as its own audit event. | `10470`, `10997` |
| **R-91** | The patch is a **field whitelist**; `built` is never written through wholesale. Review keys are cleared **selectively**. | `10935` |
| **R-92** | Save-time refusals for AI-managed lines are preserved **verbatim**. | `10839` |
| **R-95** | A dirty editor **never disables a job action**. | `10332` |
| **R-98** | Read mode. | `11069` |
| **R-99** | Editability is server-defined; the UI mirrors `EDITABLE_STATES` exactly, and *"a Save that would silently 404 is never shown"*. | `8768-8769` |
| **R-100** | A version selector that relabels the live draft is *"the current lie"* — the per-revision read `[P-16]` is flagged rather than faked. | `9377-9378` |

## 2.I The canvas at line scope — the five lenses (§6)

| Rule | Statement | Cited |
|---|---|---|
| **R-43** | The chip set and its **order are identical on every line**. A chip is a section name plus its verdict word, and it is also the scroll anchor. Pressing the active chip collapses it and returns the plate to `md`. | `2441`, `9957`, `13903` |
| **R-44** | A panel that failed to load **says so in its own chip**, so a collapsed failure can never hide. | `7350` |
| **R-45** | Chip verdicts come from real fields: the Why chip carries `recommendation_basis` humanised, **never `confidence_band`** (a string literal `'low'` on the unresolved write path — *"a constant chip is a tab bar"*). The Trail chip carries the **NOTE COUNT**, never an event count. | `11388`, `11597`, `12598`, `13768-13776` |
| **R-46** | Every review reason carries **its own fix control**, because `initialSection` accepts only `dims \| options \| qty` — the canvas/pane coupling is true for some faults and not others. Also: a **manual Refresh and an `Updated 09:14` line. No polling.** | `2515`, `9312`, `10889`, `14040` |
| **R-47** | The arrival walk is **single-sourced, evaluated in order, stopping at the first match**. | `9972`, `13952` |
| **R-48** | A panel the reviewer expands or collapses **by hand persists for the rest of the session, across lines, locally, with no UI** `[P-4]`. Manual beats the walk. | `7703`, `9949`, `13980` |
| **R-49** | The elevation is a **real generator**: called at the size closest to the intended pixels, never a bigger one scaled down. `parts` beats `opening` beats family. **Leaders are suppressed whenever a dimension is unknown** — *"A drawing may be indicative; a dimension may not."* The unsized 1200×1200 fallback draws at `0.45` opacity with no leaders. The break-line appears only once the drawing has actually been squeezed. | `1609`, `2397`, `2707`, `8822-8827`, `8888`, `12253` |
| **R-50** | While unsaved edits exist the plate **says whose figures it is drawing**. The live-redraw loop exists **only at ≥1280**, where the pane is a persistent column. | `1986`, `2407`, `9888`, `12556` |
| **R-51** | Below 1280 the live check falls back to ItemForm's own drawing. | `2185`, `12558` |
| **R-53.1** | There is **no Price column** in the candidate set: `candidate_result` stores no price. | `12847` |
| **R-53.2** | The panel **states its own source per section** and never implies one is the other — two server reads (`P-26` candidate-set, `P-27` selection-reasoning) are gated separately by §16.7. | `12821-12827` |
| **R-53.3** | The candidate table is **cascade-deleted on re-parse, and says so**. | `12848` |
| **R-55** | `edited_fields` is a bare list of column names — **no actor, no timestamp. "Inventing one is worse than omitting it."** | `12861` |
| **R-56** | The Price column on glazing alternatives is **metered; the meter is stated, not hidden.** Lazy-on-viewport is refused. | `2569`, `6105`, `13035`, `13123` |
| **R-57** | Staging is **persistent, visible, and not a save.** `Use this` writes the ops configuration select outside ItemForm: one write path, one concurrency check, one Save. | `2575`, `12487`, `13008`, `13145` |
| **R-58** | There is **no glazing anchor**; staging opens Options, whose first accordion is Glazing when the product has a thermal profile. | `13018` |
| **R-59** | The split's primary lives **in the panel, not the canvas footer**. *"Putting a line action in the job's action site is the mistake."* | `13436` |
| **R-61** | Comparison is a **MATRIX, not a stack of diffs**: one row per unit, one column per spec key that differs anywhere. Inherited cells are quiet, changed cells are not — *"two wrong units are visible in one glance with zero selections."* | `2617`, `11510`, `13483` |
| **R-62** | `not priced` shows in **every** mode, including issued and accepted. | `13545` |
| **R-63** | Unit removal is refused while that unit's editor is dirty, **with the reason stated in the row**. A data-integrity guard on a client control, not a gate on a server action. | `12487`, `13558` |
| **R-64** | **Merge is the only route back**, and it says plainly what it costs. A **second split is refused**, because `splitLine` deletes and recreates every segment — said where someone would look for it. | `13616`, `13662` |
| **R-65** | **Warn, never veto.** Mixed frames, oversize and incompatible siblings are reported and recorded; only undersize and a duplicate code block. | `13310` |
| **R-66** | The unpriceable case **prints `missingOptions` in full**. *"A price that refuses is correct behaviour, and the console should say which number is missing."* | `13701` |
| **R-67** | § TRAIL — notes, flags, provenance. *(Only cited in a module header; content otherwise unrecoverable.)* | `11932` |
| **R-68** | Five lens chips at 390px measure ≈435px; **the fifth is deliberately cut so the strip reads as scrollable. Chips never wrap and never become a dropdown** — the verdict abbreviates instead. | `2015`, `2698`, `7334`, `12601` |
| **R-69** | At 390px two-column fact rows **reflow to label-over-value**; § PRICE becomes two columns (label / running total) with detail beneath. This is **reflow, not truncation**. | `2040`, `2487`, `2653`, `15756` |
| **R-70** | Job scope uses a **push-row list, at every width — not a chip strip** — because seven verdict chips measure ≈937px against a 634–718px canvas. *"Seven headlines at once beats a strip that would have to scroll sideways."* | `2055`, `2459`, `10016`, `14394` |

## 2.J Job scope (§7)

| Rule | Statement | Cited |
|---|---|---|
| **R-71** | The step vocabulary comes **from code, not prose** (`status_internal` + `INTERNAL_LABEL`; `STAGES` / `STAGE_LABEL`; `TRANSITIONS[].side`; `CUSTOMER_WAITS`). | `6247`, `14843` |
| **R-72** | The two customer gates are **not flattened**; the photo gate keeps its two separate rows. | `6264`, `15026` |
| **R-73** | **No date is ever invented.** A step with neither a stamped column nor an activity row reads `recorded`, with no date and no actor. | `14672-14675`, `14823` |
| **R-74** | A quote in triage does **not** render twelve empty rows. Remaining quote steps are NEXT; the delivery journey is one quiet disclosure `[P-55]`. | `14715`, `14740` |
| **R-75** | Every NEXT step is **inert**. | `15002` |
| **R-76** | **Payments are steps, not a separate panel.** Selecting one loads the ledger into the PANE. | `3108`, `14405`, `15037`, `15065` |
| **R-77** | The guard on money is the **mandatory bank reference plus the confirm sentence, exactly as today. No second-person approval, anywhere** — access is flat and a manager step would resolve to self-approval. | `2944`, `14891` |
| **R-78** | Four facts answer "can I trust this document" and **stay in the row at every width**: what it is, where it came from, when it landed, when it was last scanned by which engine. Size/origin/date ride *under* the filename rather than as three more columns. | `15290-15294` |
| **R-79** | A **real anchor**, rendered **only when the scan is clean**; refusals render in the row rather than dumping JSON. Under `pointer:coarse` it opens in a new tab (iOS PDF navigation destroys the plane stack). | `15236`, `17872` |
| **R-80** | The **rescan response stops being discarded**. *"The third sentence is the most important one in the file subsystem and is invisible today."* | `6342`, `6662`, `14436` |
| **R-81** | Messages: **one thread, oldest → newest, a 720px reading column, composer docked at the bottom.** The one deliberate departure from the console's newest-first convention (C2) — *"it is a conversation, not an audit log."* | `2749`, `15433-15435` |
| **R-82** | Attach-to is **disabled in clarification mode**, because `request-clarification` accepts `{ message }` only and writes no `line_id`. | `15541` |
| **R-83** | There is **no resend control** on the outbound email ledger, and the panel says so. | `15580` |
| **R-84** | The learning drain is **a link, never a one-click drain**. The lever lives in Admin behind a typed confirm. | `15936`, `16744` |
| **R-85** | The thermal audit is a **frozen snapshot: never merge it into the live line and never recompute it.** *"That is the whole point of the surface: it is what was parsed at the time."* | `15698` |
| **R-86** | Filters that would always return zero are **shown disabled with their reason**, not shipped — *"a filter that always returns zero is the dead `rule` chip repeated."* | `16138`, `16183` |

## 2.K The other screens (§11)

| Rule | Statement | Cited |
|---|---|---|
| **R-101** | **Boot has three branches, not two.** A failed `/me` is today indistinguishable from "not signed in" and drops the staffer on sign-in *"where re-entering credentials cannot possibly help"*. Boot shows the **shell's skeleton, never a full-viewport spinner**. | `3494`, `16388`, `18326`, `18352` |
| **R-102** | **A zero-count row disappears entirely.** *"A permanent '0 pending' trains people to stop reading."* | `3225`, `16711` |
| **R-103** | Dashboard rows **link; they never act**. | `3225` |
| **R-104** | The link **carries the filter**. | `16712` |
| **R-105** | File and pricing counts are **not** among `dashboard-summary`'s seven counts today; `P-34` must be scoped to include them, or the region ships with pricing lines only. | `16841` |
| **R-108** | *"The critical fix. A 403 must never masquerade as a quiet shop."* | `16957` |
| **R-109** | Customer search is **client-side over an array fetched once per session, because every fetch of that list writes an audit event. A hard constraint, not an optimisation.** | `17056` |
| **R-110** | The **whole row is the target**, as in Projects — ending the dead end where Projects and Orders were dead text. | `17186` |
| **R-111** | **Attribution is the compensating control for flat access**; telling the operator is the whole point of it. | `17122` |
| **R-112** | **Silent truncation is a correctness hazard** — *"Showing the 300 most recent. Narrow the filter to see older."* | `17469` |
| **R-113** | A failed write **reverts the select and states it in place. No toast; there is no toast system.** (V13) | `17674-17676` |
| **R-114** | The Source chip **stops being hard-coded**: it reads `sourceOwner` / `sourceEntryPoint` instead of the literal `"OpenFrame Website"`. | `17577` |
| **R-116** | Enquiries carry **four independent status dimensions, each with its own vocabulary, and the word always renders.** | `6489`, `17710` |
| **R-117** | **A 403 and an empty bucket are different shapes.** | `17817` |
| **R-118** | The global Files peek **degrades honestly** — `evidence_items` is fetched per project, so a global file row has no evidence in hand. | `18611` |
| **R-119** | The audit entity list is **the entity types actually written**; the dead `rule` chip is gone. | `6493`, `6681`, `18032` |
| **R-120** | Audit is **honest about its own limits** — *"Filtering the 200 most recent events. Older events are not loaded."* | `18032` |
| **R-121** | A manufacturer is `type='internal'` and appears in the staff list, but `manufacturer` is not in the roles array — so the select rendered blank and changing it **silently promoted a partner to full console access with no way back**. A separate section with no select removes the accident entirely. | `18204-18208` |

## 2.L Pricing (§12)

| Rule | Statement | Cited |
|---|---|---|
| **R-122** | The **health banner appears on all four pricing sub-surfaces**, unchanged, in its three states. | `3595`, `18844` |
| **R-123** | `productsWithoutRateCard` gets a link that **NAMES the products**, not a dead count; `orphaned` gets a count and a link, not only a per-row marker. | `6831`, `18902`, `18915` |
| **R-124** | The **boundary sentence** is visible on every pricing surface, with the only outbound action in the pricing console. | `3632`, `18845` |
| **R-125** | **The inert steps are the highest-value lines on the screen. Greyed, NEVER hidden** — *"they teach the shape of the formula on a day when nothing is wrong, so that on the day something is wrong it can be read."* | `2631`, `3770`, `4267`, `19482` |
| **R-126** | **No AND, no OR, no grouping, no nesting.** The editor offers no affordance for any of them **because the engine cannot do them.** | `19657` |
| **R-127** | *"A swallowed preview failure looks like a frozen one."* It says so, in the ladder's place, with a way back. | `3883`, `19455` |
| **R-128.1** | The one modal **MUST scroll**: bounded height (**85dvh of the console frame**), scrolling body, sticky footer above the keyboard inset. At 94% it filled a 390px phone edge to edge and hid the record whose price it decides. | `1446`, `3893-3905` |
| **R-128.4** | **Double-click is unguarded today** — guarded here. | `20032` |
| **R-128.5** | `PUT /rate-cards/:id` then `PUT …/modifiers` is **non-atomic**; if the second fails the first IS committed, so the message must say exactly that. | `20043` |
| **R-129** | A **revert gets the same before/after preview and the same confirm as a forward edit, because it IS one.** | `19595` |
| **R-130** | The conflict **keeps its message AND gains its control**. | `20036` |
| **R-131** | Two real server refusals are swallowed today (`commit` is `try/finally` with no `catch`). Both render **in full, `detail` included, under the row that caused them** (L8). | `4015`, `20475` |
| **R-133** | Re-running reconciliation is a **WRITE** (`POST /reconcile` inserts a run row) — auto-firing it per save multiplies rows and changes what "Checked 4 min ago" means. **The cost is stated out loud.** | `18852`, `20516` |
| **R-134** | **`Esc` does not exist on a soft keyboard**: under `pointer:coarse` each dirty row grows a visible ✓ **and** ✕ pair. | `4010` |
| **R-135** | The header count is the **FILTERED** count, not `data.options.length`. | `20255` |
| **R-137** | The 409 gets the rate-card treatment, **not** the generic "That change could not be saved." | `20656` |
| **R-138** | `productsWithoutCard` is **NAMED, not collapsed to a boolean**. Coverage is true only when EVERY product in the family has a card of its own. A hole is part of the index's subject. | `6969`, `19334`, `20748` |
| **R-140 / R-141 / R-144** | **Permanently refused:** no approval gate, no publish-pricing mode, no pricing approval queue · rate cards stay non-inline-editable while options stay inline (the asymmetry) · not one `Read-only — a manager or admin can change these` string, because `canView/canEdit/canAdmin` are literally `isStaffUser` and that copy is unreachable. | `18772-18777`, `3961` |
| **R-142** | The **single-writer invariant**: every write bumps the version, records before/after, and modifiers are written as ONE ordered list with `seq` rewritten as `i × 10`. **Removed rules are deactivated, never deleted**, because their ids appear in every snapshot's `appliedModifiers`. | `20097` |
| **R-143** | The server's validation is **mirrored client-side, so a 400 never surfaces as a generic failure**. | `19091` |

## 2.M Device parity / mobile (§13) — see Section 1 for the full model

| Rule | Statement | Cited |
|---|---|---|
| **R-145** | **Pricing is NOT desktop-only.** | `3544` |
| **R-146** | **Width classes restack, never remove.** | `4151` |
| **R-148** | Plane **push 240ms / pop 200ms**; the plane change goes **through the URL**, so the OS back gesture pops it and every push is a real history entry. | `373-374`, `8964`, `11205` |
| **R-149** | **Selection is global** — it survives a plane change; a row that loads an outcome also selects the line. | `8966`, `15911` |
| **R-151** | The **segmented switcher** is the visible, accessible control for the three workspace planes. | `2273`, `9001` |
| **R-152** | The action footer is **sticky WITHIN the plane's flex column, never viewport-fixed**, and sits above the keyboard. | `1428` |
| **R-153** | The **phone action footer**: one primary taking the width, `⋯` for every secondary and every overflow, the blocked primary's reason beneath it **inside** the footer. The ONE footer allowed a second line. | `1335`, `2311`, `10095`, `10126`, `10204` |
| **R-154** | Plate sizes: `md` at rest, `lg` on `0` or a click, plus **the phone hero** — tapping the hero is the expand control there. | `2436`, `2689`, `14129` |
| **R-155** | The phone stepper moves through the **FILTERED** set without returning to the list. | `9210`, `10088` |
| **R-158** | **Gesture is never the only route to anything.** | `2274`, `9803`, `10106`, `14137` |
| **R-159** | The editor sheet covers the ladder, so it **carries the ladder's conclusion** — a 3-row read-back strip recomputed live from the same preview. | `3544`, `4113`, `19778` |
| **R-160** | *"A real reviewer, not an argument, decides whether it is enough."* | `19780` |

## 2.N State shapes, accessibility, honesty

| Rule | Statement | Cited |
|---|---|---|
| **R-161** | **Every fetch gets all four shapes plus Retry. No exceptions.** Loading is never failure, failure is never a spinner, and both are distinct from an empty filter and from a gate. | `1279`, `7429`, `9097`, `19018` |
| **R-162** | Read-only is **one line plus a route back. Never a form full of disabled inputs.** | `1319`, `7527` |
| **R-164** | Focus moves to a heading on **every plane push and route change** (`tabindex="-1"`); focus **returns to the control that opened the surface**; one canonical originating control per editor. | `659`, `859`, `7570`, `8726`, `18698` |
| **R-165** | **Word + shape + colour, never colour alone.** A colour cannot carry "decide this one separately". | `149`, `534`, `1577`, `3296` |

## 2.O RBAC (§15)

> "Access is flat. This drives the three visible consequences: the role in the account
> popover (R-167), the role-less diagnosis with Copy my email address (R-168, P-65), the
> partner's one destination (R-169), and the admin-only role select shown disabled with
> its lock line (R-170)."
> — `ops-ux-mock.html:18688`

| Rule | Statement | Cited |
|---|---|---|
| **R-167** | **Show the staffer their own role.** It governs real gates and is never displayed in the console today. | `4319`, `8058` |
| **R-168** | A role-less staffer gets **one diagnosis at the shell level**, not eight mystery "Couldn't load…" messages. Gated is **its own shape, never the error shape**. | `7490`, `8409`, `18662` |
| **R-169** | A manufacturer's console is **one screen**, opening on their job. **Missing destinations are explained in the account popover, not merely gone.** | `4324`, `7971`, `18647` |
| **R-170** | The admin-only affordance is **shown to everyone, disabled, with the lock line. Never hidden** — *"Hiding it makes non-admins ask why the field does not exist."* | `17262`, `18172` |

## 2.P Tokenisation

| Rule | Statement | Cited |
|---|---|---|
| **R-174** | The tokenisation contract — see Section 5. Only `00-tokens.css` may contain a literal value. | `23`, `446`, `2345` |
| **R-178** | **Density is ours, never the library's.** `pointer:coarse` raises every control to `--tap-min` at ANY width. | `347`, `641` |

## 2.Q The lettered constraint vocabulary (not `R-`, but load-bearing)

These identifiers appear alongside the rules and are part of the same lost document.

| Id | Statement | Cited |
|---|---|---|
| **L1** | Surfaces run to full width; the top bar carries no rail at any width. The Form archetype (720px bounded column) is *"the one place L1 does not apply"*. | `736`, `1075` |
| **L2** | Loading, failure, empty and gated are four distinct pictures. | `9097` |
| **L3** | StateWord — word + shape + colour, never colour alone. | `534`, `149` |
| **L5** | A surface that must survive alone cannot survive on a blank half-screen. | `11164` |
| **L7** | **A blocked action stays VISIBLE and disabled with its reason beside it.** (12 citations — the most-cited constraint in the file.) | `606`, `12443`, `16670`, `18827`, `10139` |
| **L8** | A message, refusal or confirm belongs **UNDER the row that caused it**. | `4015`, `20432` |
| **L9** | **Say what is not there. Never a blank, never a zero, never a dash alone.** | `524`, `7222`, `11164` |
| **L10** | The browser is told (`beforeunload`), so a dirty editor is never lost silently. Save is the only thing that persists. | `8630`, `8716`, `19358` |
| **C2** | Newest-first is the console's convention (Messages is the one deliberate departure). | `15435`, `16148` |
| **C5** | Process & Gates is a **two-sided dated timeline**. | `14397`, `14666` |
| **C6** | **A second navigation band is forbidden.** A collapsed rail is a minimised index of the zone's own content and is *not* one. | `736`, `1935` |
| **V5** | The server degrades a failed summary query to all-zeros with `degraded:true` — a flag the client has never read. | `16780` |
| **V9** | The fold rule (§4.4). | `496`, `1123`, `12401`, `16515` |
| **V12** | **Every count is re-derived from the rows it points at**, so the Dashboard and its destination can never disagree. | `16723` |
| **V13** | A failed write reverts and states it in place — no toast. | `17675` |
| **M2** | The peek — a 400px read-mostly inspector; 70dvh bottom sheet on phone. | `1381`, `11825` |
| **M3** | The arrival filter, carried in `&from=`. | `8803` |
| **I1–I10** | **A namespace of the lost rule document, NOT `UX-AUDIT.md`'s `I1`–`I18`** (see the warning below). Reconstructed from use sites: `I1` job total is Σ(parent line totals), parents only · `I2` a composite parent is not a product (no picker, no options group, no glazing of its own, no candidate set) · `I3` editability is server-defined · `I4` line sets never conflated · `I5` line status is DERIVED, never set; an edit never clears a review flag · `I6` a transition taken elsewhere · `I7` **a refusal carries its cause; `missingOptions` is printed, never flattened** · `I8` **a money figure never appears without its basis; null is never $0** · `I9` **Height × Width, everywhere, in every phrase** · `I10` ItemForm is mounted, never reimplemented. | `5694`, `5807`, `5834`, `8768`, `10368`, `11010`, `12455`, `7175`, `7187`, `2122` |

> **Namespace collision warning.** `I<n>` means **two different things** in this directory, and
> conflating them will produce nonsense. `UX-AUDIT.md`'s `I1`–`I18` are *invented values the
> spec rendered that the data does not support* (its `I1` = "Hop 5's version line is not
> reachable by any endpoint"; its `I9` = "Archive ▸ Events' payload expansion is labelled DRAW
> and receives nothing"). `README.md` uses the **audit's** numbering. `ops-ux-mock.html` uses a
> **different** `I<n>` list, above. Likewise `G<n>`: `UX-SPEC.md`'s `G1`–`G18` are *grafts*,
> `UX-AUDIT.md`'s `G1`–`G9` are *degraded capabilities*. Always name the file with the id.

## 2.R The other numbering systems in this directory

The lost `R-<n>` document is not the only rule set. These are intact and are cited here so a
designer does not mistake them for the same thing.

### `UX-SPEC.md` — `P1`–`P7`, the seven principles (`UX-SPEC.md:106-156`)

Each is written **so it can be shown false by looking at a screenshot or a diff**
(`UX-SPEC.md:108`). This falsification framing is itself worth preserving. Abridged to the
statement plus its test:

- **P1 — The record is the application.** *"Falsified if: at a 1440×900 viewport the review
  workspace's centre pane is narrower than 700px, or permanent chrome (rail + header band +
  action bar) exceeds 18% of the viewport area."* (`:110`)
- **P2 — Absence is content.** *"Never an em dash standing in for 'we never asked', never a
  zero standing in for 'could not compute', never an invented mark, never an invented
  percentage. … Falsified if: any screen can render a plausible value that is not in the data,
  or any key/value row disappears because its value is null."* (`:116`)
- **P3 — The word carries the state; colour is the second channel.** *"Falsified if: converting
  any screenshot to greyscale loses information."* (`:125`)
- **P4 — A count is a filter over the rows on this page.** *"Falsified if: any count and the
  list it links to can disagree, or any number is not clickable to its rows."* (`:130`)
- **P5 — Blocked, never hidden. Inapplicable, never shown.** *"…never in a tooltip, because a
  reason you must hover to read is a reason nobody reads."* (`:138`)
- **P6 — A failure is never rendered as emptiness, and never as loading.** *"Falsified if: any
  pane shows the same thing for 'the server is down' and 'there is nothing here'."* (`:145`)
- **P7 — The evidence and the decision are on screen at the same time.** *"No modal, drawer or
  overlay may cover the thing being decided about. Confirmation happens in place, beneath the
  action that raised it. There is exactly one exception in the whole console: the pricing ±20%
  tripwire, which is a stop, not a confirm."* (`:151`)

These map onto the mock's rules almost one-to-one: `P2 → L9`, `P3 → R-165`, `P4 → V12`,
`P5 → L7`, `P6 → R-161`, `P7 → R-39`. **The mock's L-constraints are the spec's P-principles
under a different letter.**

### `UX-SPEC.md` — the other four systems

| System | What it is | Where |
|---|---|---|
| `G1`–`G18` | "The grafts, each named" — what each of four competing UX proposals contributed | `:43-64` |
| `#1`–`#291` | **The no-regression contract.** One row per capability that exists today, with where it lands. Legend: **REPAIR** (a defect fixed) · **DRAW** (renders data the client already receives and discards) · **UNWIRED** (no endpoint reads it, so the screen states the absence) · **UNCHANGED** (same control, new address) | `:262-651`, legend at `:267` |
| `E1`–`E3` | The three enabling reads, *"none of them a new capability"* | `:1832-1838` |
| Hops 1–10 | The evidence chain | `:1724-1735` |

`README.md` calls §B.4 *"the no-regression contract … which describes the console that exists
today"* — **the one part of the whole directory that is factual rather than proposed.**

### `UX-AUDIT.md` — `D1`–`D11`, `G1`–`G9`, `I1`–`I18`

Each finding carries a source citation and a written fix (`UX-AUDIT.md:364-399`). The
severity-ranked dropped list `D1`–`D11`, the degraded list `G1`–`G9` and the invented list
`I1`–`I18` are intact in that file and are not reproduced in full here; the ones bearing on
mobile and on defects are quoted in Sections 1.14 and 3.10.

---

# 3. Defects already found and fixed

**This section is the owner's review feedback in preserved form.** Each entry is a failure
that was observed at a specific width or in a specific state, its cause, and the fix that
was applied. These are not preferences. Reintroducing one is a regression.

They cluster into six recurring failure modes. The clustering is worth as much as the
individual entries, because it predicts where the next one will be.

## 3.1 Floating scaffolding covering real actions

**The defect.** The dev strip floated on top of the console.

> "The dev strip gets its OWN LANE beneath the console rather than floating on top of it.
> Floating, it covered the pane's Save line at 1440, the rate-card primary at 1366 and —
> worst — `Save new rates` inside the review dialog at 390: **a mock control obscuring the
> very action the walkthrough is about.** A reserved lane cannot overlap anything at any
> width, and it reads as what it is: scaffolding beside the console, not part of it."
> — `ops-ux-mock.html:420-426`

**The fix.** `--dev-lane-h: 48px`; the console frame is `position: fixed; inset: 0 0
var(--dev-lane-h) 0` (`ops-ux-mock.html:701-703`), and `OPS.frameHeight()` subtracts the
lane so the height ladder classifies the right box (`ops-ux-mock.html:7615-7622`).

**Related, same root cause.** The dev panel itself laid out downward instead of upward:

> "Anchored, not packed. As a flex column with `justify-content: flex-end` the panel was
> expected to overflow UPWARD out of the 48px lane; Chromium laid it out downward instead
> and **three quarters of the switcher went off the bottom of the window**. An absolute
> offset from the lane cannot be got wrong."
> — `ops-ux-mock.html:1489-1493`

## 3.2 Content hidden with no keyboard path

**The defect — the fold rule's missing half.** §4.4 says that at 768–1023 the primary
triple stays and *"everything else moves into the ROW EXPANSION"*. The expansion had no
implementation:

> "§4.4's middle band. At 768–1023 the declared primary triple stays and 'everything else
> moves into the ROW EXPANSION' — **a clause that had no implementation, so the non-primary
> cells were simply `display: none` and five fields on Projects (Lines, Value, Stage, Days
> in stage and Flags) were unreachable at tablet portrait with no route to them at all.**
> That is the hidden-cell defect §4.4 exists to forbid, one band up from where it forbids
> it. The expansion is built for every table that folds."
> — `ops-ux-mock.html:16520-16527`

> "Without it those cells were simply deleted from the surface with no route to them, which
> is the hidden-cell defect the fold rule forbids one band lower."
> — `ops-ux-mock.html:1169-1173`

**The fix.** A real disclosure that exists **only in the band that folds**, pinned to the
right edge of its scroller:

> "The disclosure exists ONLY in the band that folds. At ≥1024 every column is in the row
> already; at <768 every field is in the card already."
> — `ops-ux-mock.html:1177-1179`

> "Pinned to the right edge of its scroller. **The disclosure is the ONLY route to the
> folded fields, so it may never be the thing that requires a sideways scroll to reach.**"
> — `ops-ux-mock.html:1183-1185`

**The defect — no touch route to a peek.**

> "R-32 — every peek has a VISIBLE touch trigger. `Space` peeks on a desktop; there is no
> touch equivalent and long-press is forbidden (§13.8), so **a peekable row that only
> advertises 'Space peeks' in its footer is unreachable on every touch device.** The rail
> rows carried the 44×44 chevron; the ledger rows that offer the same peek did not."
> — `ops-ux-mock.html:16569-16574`

**The defect — the drawing plate vanished outright.** A CSS scoping failure:

> "One of those rules was `.plate-strip { display: none }`, un-hidden only by
> `.lens-canvas[data-plate="strip"]` — a container the workspace does not use. The result:
> **scrolling a line's panels past 24 px replaced the plate with the collapsed strip, and
> then hid the strip, so the drawing vanished outright.** R-18 says the plate never
> disappears. Scoping restores single ownership."
> — `ops-ux-mock.html:2368-2382`

## 3.3 "Nothing widens its own container" — the family of overflow defects

This is the single largest defect family in the file, and the mock states the general rule
in one place:

> "R-12 depends on every horizontal escape being deliberate and living on a box that
> declares `overflow-x: auto`. Grid and flex items default to `min-width: auto` — their
> min-content width — so ONE wide table inside a panel grew the panel past the canvas
> instead of scrolling inside it. **The symptom is the nastiest kind: the scroller reports
> `scrollWidth === clientWidth` ('nothing to scroll') because the box it lives in already
> grew to fit, while its right-hand column — the `Use this` button on the priced glazing
> alternatives, the `AI-changed` and `Composite` rail filters — sits past the zone edge,
> clipped, with no scrollbar and no keyboard path.** `:where()` keeps this at (0,0,0) so
> any component that needs an intrinsic floor can still state one."
> — `ops-ux-mock.html:1128-1141`

Every instance of the family, with its measured symptom:

| Where | Symptom | Fix | Line |
|---|---|---|---|
| `.ops-shell > *` | At 900px the top bar measured **955** and the account control was clipped off the right edge, while every scroller inside reported nothing to scroll. | `min-width: 0` on the shell's grid rows | `728-734` |
| `.archetype` | One wide row (a job bar, a header action cluster, a table) dragged the whole surface past the device frame; because `.archetype` hides overflow, **the far side became unreachable rather than scrollable**. | `min-width: 0` | `907-912` |
| `.archetype > .ar-workspace` | The Job Bar's min-content width (**~1,212px**) dragged the whole workspace out to 1,212px **inside a 390px frame — the phone plane stack rendered off-frame in both directions, and the device toggle could not show parity because there was no parity to show.** | one line of grid hygiene | `2773-2780` |
| `.chipstrip` | The canvas column shrank a wrapped two-row strip back to its 36px min-height and **drew the second row of chips ON TOP of the first panel's header**. `height: auto` does not stop flex shrinking; only a zero shrink factor does. | `flex: none` | `1005-1010` |
| `.surface-head` action cluster | `flex: none` on a wide cluster (ten chips) **pushed the header past the frame, squeezing the title column to a few characters and clipping the ledger body underneath it entirely**. | the cluster takes its own line below 1024 | `894-899` |
| Top bar nav | The nav's own `Reference ▾` overflow group **painted ON TOP of the ⌘K trigger at 900px** — the ladder was collapsing the LIST but nothing was clipping what remained. | `overflow: hidden` on the yielding nav | `750-753` |
| `.pane-foot` | Refused to go below "Estimated price — Cancel Save line" on one line, which **at 390px pushed the whole editor sheet 44px wider than the frame**. | `min-width: 0`, then wrap | `2246-2250` |
| `.sheet-foot > *` | A footer handed a whole panel footer pushed the sheet wider than the frame at 390px. | `min-width: 0` | `1436-1440` |
| `<select>` in the editor | A `<select>`'s min-content width is its **longest option** ("AMJ150T Series Lift-Sliding Door"); nested `pane-body › idrow › select` that **pushed the editor 40px past the sheet on a 390px phone and made the form scroll sideways inside its own gutter**. | truncate the field; full text stays in the popup | `2136-2141` |
| Boot branch strip | Held the card open past its own `min(100%, …)` and spilled. | `min-width: 0` | `3478-3480` |

## 3.4 Specificity collisions and ownership collisions

**The hamburger at every width** (this is the one in `ops-v2-full-site.html`, and the
comment notes it happened *twice*):

> "`.topbar .menu-btn` (0,2,0) beats `.icon-btn`'s `display:flex` (0,1,0) regardless of
> source order — **the bug this replaces was exactly that: `.menu-btn{display:none}` and
> `.icon-btn{display:flex}` have EQUAL specificity, `.icon-btn` is declared later in the
> sheet, so it won and the hamburger showed on every width, sidebar or not.** Same fix
> pattern applies inside the `@container` override below."
> — `ops-v2-full-site.html:149-154`

> "`.btn-compact` (0,2,0) needs an equally-specific override here, or the generic
> `.btn-ghost,.btn-primary{height:var(--tap-min)}` rule above loses to it despite coming
> later — **exactly the `.menu-btn` bug again, just waiting to happen a second time if left
> as a single class.**"
> — `ops-v2-full-site.html:521-524`

**The provenance marker vs. positioned components** — two separate collisions from one
declaration:

> "`[data-prov-tier]` … written as `[data-prov-tier]:not(.zone-handle)` this rule scored
> (0,2,0) and beat `.peek { position: absolute }` (0,1,0), **which turned the inspector's
> `right: calc(--pane-w + 1px)` from an offset against the viewport into a relative shove
> 401 px to the LEFT — the whole panel off-screen, one of the 24 surfaces rendering nothing
> but its scrim.** `:where()` drops the whole selector to (0,0,0)."
> — `ops-ux-mock.html:1529-1543`

> "`01-base.css:904` declares `[data-prov-tier] { position: relative }` AFTER
> `.zone-handle { position: absolute }`. Equal specificity, later wins — so as soon as
> `30-workspace.js` marks the two drag handles with their P-64 provenance, **the handles
> stop being out of flow, take grid cells of their own, and the workspace's three-column
> frame collapses (canvas lands in the pane's column, pane wraps onto a second row) at
> every width ≥ 1024, on every workspace surface.**"
> — `ops-ux-mock.html:2759-2772`

**Two modules claiming one class name:**

> "`.progbar`, not `.meter`: `40-lenses.css:221` already owns `.meter` for §6.5's
> priced-alternatives metering ROW (a flex line of caption text). This file loads after it,
> **so the two collided and a 4 px `overflow: hidden` bar was clipping P-40's sentence out
> of the Glass panel entirely.** Distinct names."
> — `ops-ux-mock.html:2968-2972`

**A later stylesheet silently reintroducing a fixed defect:**

> "WITHDRAWN AT ASSEMBLY. This file used to give the Job Bar `overflow-x: auto` below 1024
> as containment … The collapse now exists in `30-workspace.css` §1 …, and **because this
> file loads later the scroller would have overridden it and reintroduced the sideways
> drag.**"
> — `ops-ux-mock.html:2782-2789`

**A registration overriding a canonical declaration:**

> "§4.1 and `OPS.SURFACES` both call Boot FULL-BLEED — it is the three-branch splash, not a
> form. **Registered as 'form' the registration won, and the surface rendered inside a form
> archetype that gives it a max-width column it was never designed for.**"
> — `ops-ux-mock.html:18725-18728`

**An attribute whose value was transposed against its label:**

> "The attribute names the state the button SELECTS, and matches its label. **They used to
> be transposed — the button reading 'Off' carried `data-prov-opt="on"`** — which was
> self-consistent with `paintDev` below but meant anything selecting
> `[data-prov-opt="on"]` turned the overlay off."
> — `ops-ux-mock.html:8505-8509`

## 3.5 Content painting over adjacent content

**The Job Bar, at a 1366 laptop** — the most cited single defect in the file:

> "FIXED AT ASSEMBLY. Between 1024 and 1679 this bar is over-subscribed: left(386) +
> centre(351) + right(522) + the blocker sentence is wider than the frame, and because the
> centre and right clusters are `flex:none` the entire deficit fell on the left one. The
> title's 9ch floor then exceeded its share, and because nothing clipped (overflow was
> visible) **the surplus PAINTED OVER the lifecycle sentence beside it: at a 1366 laptop the
> bar read `Wattletrnicing ▸ Technical review`.**"
> — `ops-ux-mock.html:1741-1753`

The fix is stated as two rules and one deliberate non-relayout: the left cluster and the
ident clip at their own boundary; the customer leaves the bar **below 1680, not below
768**; and the centre cluster deliberately keeps `flex:none` *"because letting it shrink
wrapped the state word onto a second line, and the state word is the one thing on this bar
that must not move."*

**The same bar, at narrow widths:**

> "The spec says the left cluster truncates 'in that order' — back · ref · title · customer.
> **Nothing implemented the ladder, so below 1024 every item in the bar shrank past its
> content at once and the four strings painted on top of one another, unreadable, on the
> phone's most-used plane.**"
> — `ops-ux-mock.html:1693-1702`

**The same bar, allowed to wrap:**

> "Left to wrap it reached **132px at 1024** (the blocker sentence turning into an
> eight-line column) and **213px at 390** — four rows, more chrome than canvas."
> — `ops-ux-mock.html:1706-1713`

**`white-space: nowrap` on a flex container is not enough:**

> "The lifecycle sentence is an inline-flex row; `white-space: nowrap` does not stop a FLEX
> container wrapping, **so at every narrow width it folded onto three lines inside a 44px
> bar and was clipped top and bottom.**"
> — `ops-ux-mock.html:1722-1726`

**The canvas footer, at the reference laptop:**

> "…four verbs plus the state sentence measure about 990 px against a ~600 px canvas at a
> 1366 laptop: **the row was spilling its buttons sideways across the pane, where the last
> one sat under the pane's own controls and could not be clicked.**"
> — `ops-ux-mock.html:2089-2097`

> "'Issue reviewed quote · Back to pricing · Request clarification · Add a note' is 678px
> against a 720px canvas at the reference desktop, so **three secondaries wrapped the footer
> to 120px and clipped the buttons at the frame edge**; the same budget on a 1,158px canvas
> would hide actions that had room to spare."
> — `ops-ux-mock.html:10118-10124`

Note the fix is a **measurement**, not a width-class budget — and the primary is never the
thing demoted.

**Echoing the blocked reason inline:**

> "R-19 renders that reason ONCE, in the Job Bar; **echoing it inline here is what turned a
> 48px footer into three wrapped rows.**"
> — `ops-ux-mock.html:10139-10143`

**The lens chip strip, twice:**

> "A general chip's 12px side padding put the run at 648 and **pushed Trail off the reference
> desktop**; the lens chips are a fixed set of five that must fit, so they run tighter than a
> filter chip."
> — `ops-ux-mock.html:2007-2012`

> "**Printing `panel.title` made the run 876px, which pushed two chips off every canvas below
> 1920 and turned a fixed strip into a sideways scroller on the desktop.**"
> — `ops-ux-mock.html:7332-7339`

**Two labels running together because the stack was left to wrapping luck:**

> "Both are `<span>`s in one `<div>`, so the label only sat above its value while the cell
> happened to be too narrow to hold them on one line — **at any wider column they ran
> together as `ORGANISATIONMarchetti Constructions`.** The stack is the intended reading, so
> state it rather than leaving it to wrapping luck."
> — `ops-ux-mock.html:2078-2082`

> "The pane's own headings used the same helper but sat outside that container, **so the
> count ran straight into the word: `PRICING RULES2`.**"
> — `ops-ux-mock.html:3733-3737`

> "at 3rem the uppercase word 'TYPICAL' overran its own box and touched the size beside it
> (**`TYPICAL600 × 1,500 mm`**)."
> — `ops-ux-mock.html:3757-3760`

> "as a bare block the badge butted straight against 'ORGANISATIONS' with no gap."
> — `ops-ux-mock.html:3348-3350`

## 3.6 Focus, keyboard and assistive-technology defects

**Focus rings drawn on non-interactive headings:**

> "R-164 moves focus to a heading on every plane push and route change, using
> `tabindex="-1"`. Chromium treats that programmatic focus as `:focus-visible` on a
> non-interactive element, **so arriving at Projects on a phone drew a black ring around the
> `<h1>` as though the title were a control.** The heading is a destination for a screen
> reader, not a stop for the eye; interactive elements keep their ring, which is the one the
> rule exists for."
> — `ops-ux-mock.html:659-664`

**Focus dropped on the document:**

> "R-164 — focus returns to ONE canonical originating control, however the editor was
> entered. **Dropping it on the document (which is where it went) sends a keyboard user back
> to the skip link and makes them re-traverse the whole rail to reach the row they were just
> on.**"
> — `ops-ux-mock.html:10417-10421`

> "R-164 — the canonical originating control. Closing the editor put focus on the document;
> it belongs on the row the editor was opened from."
> — `ops-ux-mock.html:9553-9555`

**Two live regions:**

> "The assembled page ships four named hosts … Adopt them rather than creating rivals: **a
> second `aria-live` region is a real defect (two polite regions, one of them never written
> to)**, and an `#app` that stays empty while the console mounts on `<body>` is a lie about
> where the console lives."
> — `ops-ux-mock.html:7938-7947`

**The console's only live region was inert on the surface it exists for:**

> "Selecting a line changes the canvas and the editor at once, and neither of them announces
> itself; **without this the console's only `aria-live` region was inert on the surface it
> exists for.**"
> — `ops-ux-mock.html:9704-9708`

**An identical repeated message is never re-read:**

> "Cleared first, then set on the next frame: an identical repeated message is otherwise not
> a change and is never re-read."
> — `ops-ux-mock.html:7594-7596`

**Duplicate ids from mounting the editor twice:**

> "The pane zone is off-screen at these widths but still in the document, so painting the
> form into it as well would **mount every field id twice — the labels would stop addressing
> their input, and `OPS.qs('#ws-h')` (validation focus, the keyboard map) would find the
> hidden copy.** One editor, always."
> — `ops-ux-mock.html:9141-9146`

**An overlay surviving navigation:**

> "Leaving a record or a surface dismisses whatever is floating above it … without this it
> survives the navigation, and **on a phone two editors are mounted at once (duplicate ids,
> an over-wide frame).**"
> — `ops-ux-mock.html:7855-7862`

**An overlay leaving the URL claiming a dialog that is not open:**

> "Dismissing it without clearing that leaves the URL claiming a dialog that is not open —
> refresh, share or press Back and it reappears."
> — `ops-ux-mock.html:8137-8142`

**A peek that took you out of the app:**

> "Opening a peek pushes exactly one history entry, so Back closes it and you are exactly
> where you were. **Arriving with `peek=` already in a shared link pushed nothing, so Close
> removes the parameter instead of leaving the app.**"
> — `ops-ux-mock.html:8317-8320`

**Typing destroyed by a full re-render** (`ops-v2-full-site.html`):

> "Every editable field … calls `render()` on its own `'input'` event, because the
> dirty-footer and computed readouts have to update as you type — but **a full `innerHTML`
> rebuild destroys and recreates that same input, which silently ate every keystroke after
> the first (typing `777` left the field reading `7`, focus gone). Caught it by actually
> typing, not `.fill()`ing, into the field — automation shortcuts don't reproduce it.**
> Restoring focus and cursor position here fixes it for every field at once."
> — `ops-v2-full-site.html:1559-1567`

**Validation that tore down the fields you were typing in:**

> "The validation runs in place: the fields are never torn down while someone is typing in
> them, so focus and the caret survive (§14.7)."
> — `ops-ux-mock.html:16015-16017`

## 3.7 Layout that reads as a different state than it is

> "`align-content: start` on every state grid. A state box that is taller than its own rows
> stretches them by default, **which spread 'Nothing is selected.' over 700px of pane with
> its hint floating in the middle and its link pinned to the bottom — a shape that reads as
> a broken layout, not as an empty one.** The four shapes have to be four distinct PICTURES
> (§14.1); a stretched one is not."
> — `ops-ux-mock.html:1241-1246`

> "a grid that is taller than its rows STRETCHES them by default, **so a six-fact inspector
> spread its rows down 800px of panel and read as a loading skeleton rather than as a
> record.**"
> — `ops-ux-mock.html:1400-1404`

> "L9 / L5 — the plane the spec says must survive alone cannot survive on a blank
> half-screen. The desktop pane says why a composite parent has no options; **the sheet
> dropped the sentence and left ~250px of nothing, which reads as a failure to load rather
> than as an answer.**"
> — `ops-ux-mock.html:11164-11168`

> "`OPS.states.empty` clears the host it is given, so calling it with the panel host deleted
> the extraction band that had just been appended above it — and **on the one job where that
> band matters most (parse still running, no files landed yet) the panel said 'Nothing is
> attached to this job.' and nothing else.** The absence of files and the state of the run
> are two different facts."
> — `ops-ux-mock.html:15277-15283`

> "The previous surface's id was left on the element, so **a not-found address kept styling —
> and reporting — as whatever you were last on.**"
> — `ops-ux-mock.html:8392-8394`

> "The badge … Inside a grid it would otherwise stretch to the full column and **read as a
> banner rather than a tag.**"
> — `ops-ux-mock.html:2850-2852`

## 3.8 Defaults that ratchet, conflate or default wrong

> "This used to read `!OPS.state.railCollapsed`, which is the MANUAL flag and defaults to
> false — **so the default state at compact read as 'expanded by hand' and the console
> shipped two zones on a 13" laptop and a landscape iPad, the exact outcome R-13 exists to
> refuse.** The manual expansion needs its own flag."
> — `ops-ux-mock.html:9156-9167`

> "The 440 default at ≥1680 is a DEFAULT, not a ratchet: **written as a one-way bump it
> survived the descent and cost the reference desktop 38px of canvas and 1280 58px, purely
> for having once been wide.** Only the untouched default tracks the width; a width the
> reviewer dragged to is theirs and is left alone."
> — `ops-ux-mock.html:9168-9175`

> "R-17.2 — 44px BELOW 900px of viewport height. `tight` is the shorter of the two short
> classes; **honouring only `yes` snapped the bar back to 56 at 719px and below, i.e. it grew
> exactly where §5.3's ladder needs it smallest.**"
> — `ops-ux-mock.html:982-985`

> "§5.3's 720 row: the strip AND its chips drop to 32. **Shrinking only the strip left 36px
> chips inside a 32px band, so the band never actually shrank.**"
> — `ops-ux-mock.html:1017-1019`

> "A shrink factor of 2 against 1 was not enough to express that: with no `min-width: 0` the
> customer could not shrink below its min-content width at all, **so the whole deficit fell
> on the title and the job read `OF-Q-10482 · W…` beside a full `Marchetti Constructions ·
> Ana Bianchi`.**"
> — `ops-ux-mock.html:1664-1672`

> "A floor, not zero. **At zero the actions simply crushed the sentence to `Techni…` — a
> truncation that carries no word**, which §5.4 names as noise where a value should be."
> — `ops-ux-mock.html:2099-2103`

> "Measured, it never had room to say anything: **at 1600 it rendered `M…` and at 1366 it
> took the last of the space the title needed. A truncation that carries no word is not a
> smaller version of the value — it is noise where a value should be.**"
> — `ops-ux-mock.html:1798-1803`

> "A debounce that outlives its card must not paint into the next one."
> — `ops-ux-mock.html:19746`

> "Fields in a filter bar size to their content, not to the panel: base sets `width:100%`,
> which is right in a form column and wrong in a row of filters."
> — `ops-ux-mock.html:3080-3082`

## 3.9 Screens stating things the data does not support

> "The parse record can hold a WERS variant with no product behind it — that is exactly the
> case this panel exists to expose. **Testing the wrapper object rather than the product
> printed a literal `null · V-4471` on screen**; absence has to be named, never stringified."
> — `ops-ux-mock.html:12971-12975`

> "Room, then product, then the job — **never an empty string after a separator, which is
> what `line.label` (a field lines do not carry) gave.**"
> — `ops-ux-mock.html:9202-9203`

> "A separator with nothing after it is punctuation pointing at an absence. When the ladder
> drops the title or the phase, its separator goes with it."
> — `ops-ux-mock.html:2326-2328`

> "**A live link that reads `Compare all 0` is an invitation to an empty room.** When there
> is nothing to compare, the panel says why instead."
> — `ops-ux-mock.html:10460-10462`

> "Offering it a frame-and-glazing selector (disabled, saying 'no eligible configuration is
> available') **described a failure where the truth is that the control belongs one level
> down.** The parent says where the choice lives; the unit carries the control."
> — `ops-ux-mock.html:10433-10438`

> "`W.conflictLine` was read by the pane footer and assigned nowhere, so §14.5's FIRST row —
> the one a reviewer actually meets, two people on one line — **had no rendering at all.**"
> — `ops-ux-mock.html:9052-9057`

> "R-121 — a manufacturer is `type='internal'` and appears in the staff list, but
> `manufacturer` is not in the roles array, **so their select matched no option and rendered
> blank; changing it silently promoted a partner to full console access with no way back.**"
> — `ops-ux-mock.html:18204-18208`

> "A colour value … A manufacturer's finish is not in the palette, and **a swatch painted
> from a neutral token would state a colour the product does not have** — so the colour
> picker keeps its popular-four + full-range shape and drops the swatch."
> — `ops-ux-mock.html:6140-6144`, `10665-10668`

## 3.10 Defects from the earlier generation (`UX-SPEC.md` / `UX-AUDIT.md`)

These predate the mock. Several were fixed *in* the mock; all of them are recorded here because
they are the same six failure modes and because the audit's severity ranking is itself owner
signal.

### The mobile drawer with no trigger — `UX-AUDIT.md:33-45` (D2, HIGH)

The single most important entry in the audit for anyone touching mobile:

> "**Today:** `src/ops/OpsApp.tsx:242–246` — the `Menu` button, `md:hidden`, 40×40,
> `aria-label="Open menu"`, `aria-expanded`, `aria-controls="ops-nav-drawer"`, lives **inside
> the sticky header**. The in-file comment is explicit that it is *'always rendered on mobile,
> including for a manufacturer with a single tab: the drawer is the only place a phone user can
> see who they are signed in as and sign out.'*
> **Spec:** B.4.1 #18 — *'Sticky white header carrying only the capitalised tab name —
> **Deleted**'*. C.2 says *'Below 768px the rail becomes the existing slide-out drawer,
> unchanged in every mechanic'* … but **nothing in the spec says what opens the drawer** once
> its host header is deleted.
> **Cost:** below 768px there is no navigation and no sign-out. **This is the exact bug the
> mobile drawer was built to fix, reintroduced.**"

The prescribed fix, `UX-AUDIT.md:367`:

> "State in C.2 and B.4.1 #18 that below 768px a **44px `Menu` button**
> (`aria-label="Open menu"`, `aria-expanded`, `aria-controls="ops-nav-drawer"`) **pins to the
> top-left of the content area**, replacing the deleted header, and is **rendered for every
> role including `manufacturer`**."

**The general lesson, stated by the audit itself: deleting a container deletes the controls it
hosted.** The mock's answer is `R-11` (*"below 768 the bar carries a magnifier, or the command
bar has no touch trigger at all"*) — the same class of catch, applied to search.

### The evidence layer is the first casualty of the commonest laptop — `UX-AUDIT.md:150-154` (G3)

> "C.4.10: at 1120–1279px pane C becomes a 40px icon strip and needs a click or `]` to slide
> over pane B; at 900–1119 pane A also collapses. **A 1280×800 MacBook at default scaling sits
> at the boundary. The evidence layer the spec calls the point of the redesign is the first
> casualty of the most common real viewport.**"

The mock's answer is `R-13`/`R-147`: **the rail yields, never the pane**, and the pane stays a
column down to 1024 specifically so the live loop survives.

### Capabilities reachable only by an undrawn single-letter key — `UX-AUDIT.md:156-160` (G4)

> "**sheet view (`T`), the derivation toggle (`i`), reload (`r`) and the three collapse keys
> have no drawn control at all** … `?` documents them, but **a control that exists only in a
> help sheet is worse discoverability than today's always-visible blocks.**"

This is the ancestor of `R-158` (*gesture is never the only route*) and `R-32` (*Space is a
desktop-only affordance*).

### Three defects in the live design language — `UX-SPEC.md:1472-1484` (§D.9)

Quoted entire, because all three are the kind that survive a redesign unnoticed:

> 1. `theme.css:1227` — **`content: ;`** is a CSS parse error, so `.tab::after` never generates
>    a box and the documented 9×9 sage selection square **has never rendered**. Write
>    `content: "";`.
> 2. **`const MONO = {} as const`** in `ProjectRecord.tsx` and `Pricing.tsx` is an empty object
>    spread at ~20 call sites. **Every place the code believes it is setting a data face, it is
>    not.** Use `font-family: var(--font-data); font-variant-numeric: tabular-nums`.
> 3. **`Pricing.tsx`'s `INK = "var(--ops)"`** shadows the real token, so **two adjacent tabs
>    render "primary text" in two different blacks.** Use `--ink`.
>
> And one addition: **ops has no focus ring at all.** Adopt the site's
> `focus-visible: 2px solid var(--sage); outline-offset: 2px`. **That is an accessibility
> defect in the product, not a style to preserve.**

### Failure states that degrade to emptiness — the named offenders, `UX-SPEC.md:1418-1424`

> "**A failed fetch may never degrade to an empty list or to a permanent 'Loading…'.** Named
> offenders this contract makes uninstantiable: `Projects`, `Files`, `Audit`, `Admin` (all
> `catch → setX([])`); `Pricing` ×5 (`catch → setD(null)` renders `Loading…` forever);
> `Options.commit` and the enquiry `patch`/`logContact` (**no `catch` at all — a failed status
> change is an unhandled rejection and no message**); `ProjectRecord.load` (`setWs(null)` → an
> infinite bare spinner with no error and no retry)."

This is where `R-161` (*"every fetch gets all four shapes plus Retry. No exceptions."*),
`R-108` (*"a 403 must never masquerade as a quiet shop"*), `R-117` (*"a 403 and an empty bucket
are different shapes"*) and `R-131` all come from.

### Errors landing a screen and a half from their cause — `UX-SPEC.md:1578-1581`

> "**Errors render at the thing that failed** — the row, the unit, the field, the pane — with
> the action bar keeping a persistent `{n} errors · show` that scrolls to and expands the first
> one. **Today every `LineRow` and `SplitPanel` failure lands at the top of the page,
> potentially a screen and a half above the row that caused it.**"

This is the mock's `L8`.

### A global busy flag, and a refetch that loses your place — `UX-SPEC.md:1565-1573`

> "1. **`busy` is scoped to the smallest thing that can fail.** Today a single global flag
>    disables every action on the record while any one of them is in flight. …
>  2. **A refetch preserves the bench.** Selected opening, scroll offset per pane, open editor
>    (by line id), hop expansion and collapse states all survive `load()`. **Today they do not,
>    which on a nine-line job means finding your place again after every save.**"

This is the mock's `R-42`.

### Conflict recovery that throws away what you typed — `UX-SPEC.md:1608-1622` (§E.6)

> "2. **The message is paired with the control it demands.** **Four messages instruct the user
>    to reload and no reload control exists**; every conflict now renders
>    `[ Reload this record ]` beside the sentence.
>  3. **The typed values are not thrown away.** On `line_changed_reload_required`: refetch, keep
>    the user's draft in the editor, and mark each field whose server value now differs with an
>    `of-diff-marker` (`yours 1210 → theirs 1250`), so the reviewer re-applies deliberately
>    instead of retyping from memory. **This is the most complex piece of client state in the
>    design and it is the one that turns a data-loss event into a decision.**"

This is the mock's `§14.5` / `R-130` (*"the conflict keeps its message AND gains its control"*).
Note the mock also records that the *attribution* half of §E.6 was itself invented — see
`UX-AUDIT.md:288-297` (I11): a line PATCH writes an audit event only when review keys are
resolved, so `activity[0]` **"names an innocent actor as the cause of your conflict."** The
mock's answer is `[P-58]`, the honest-limit sentence at `ops-ux-mock.html:9072-9080`.

### Five dead ends repaired purely by routing — `UX-SPEC.md:1641-1655`

| Dead end today | Repaired by |
|---|---|
| Omnibox result → tab only, id discarded | `#/r/{id}` |
| Customer 360 → inert project rows | `#/r/{id}` |
| Enquiry with a `projectId` → no link | `#/r/{id}` |
| Audit event → no way to reach its record | `#/r/{id}` (dangling → `that record no longer exists`) |
| "Send me a link to that job" → impossible | The record ref is click-to-copy |

> "A dirty editor guards navigation (`beforeunload` plus an in-app confirm), because **routing
> makes refresh cheap and refresh is how people will lose a half-typed line.**"

This is the mock's `R-9`, `R-10`, `R-28` and `L10`.

### One label divergence that must not propagate — `UX-SPEC.md:1860-1862`

> "`ops.ts`'s label map calls `estimator_assigned` **'Assigned'** while `lifecycle.ts` calls it
> **'Pricing'**. The ribbon uses `lifecycle`'s. `statusInternalLabel` is not rendered anywhere."

### And the audit's overall verdict — `UX-AUDIT.md:403-415`

> "**Not safe to build from as written.** The information architecture, the no-regression
> table, the component vocabulary and the interaction model are genuinely strong and mostly
> traceable — but §F, the evidence-and-selection layer the whole redesign is sold on, rests on
> six values that no ops endpoint returns … and the spec's headline honesty string — `Medium —
> a second candidate scored within 0.05` — is itself an invented derivation of a residual
> bucket. Two wireframes draw the same project in mutually exclusive states, the Flow list
> breaks its own timestamp rule three rows below stating it, and **below 768px there is no way
> to open the navigation drawer.** … ship it unrevised and the prototype will render, in the
> owner's own words, exactly the kind of number the codebase refuses to invent."

**The pattern the audit is punishing is one thing: a screen stating a fact the system does not
hold.** That is why `L9`, `R-45`, `R-53.1`, `R-55`, `R-73` and the fixtures' HONEST ABSENCE rule
all exist in the mock.

---

# 4. Patterns deliberately chosen, and alternatives rejected with reasons

## 4.1 Rejected: the vertical node timeline

Rejected explicitly in **three** places across the directory, on arithmetic, and the refusal is
described as pre-existing in the live app's own design notes.

> "Six equal cells. passed = sage fill / white; current = ink, semibold, 2px sage bottom rule;
> future = transparent, muted. **Never a ring, a percentage, a colour-only badge, or a vertical
> node timeline of all 21 states — all four are already refused in the source with reasons that
> still hold.**"
> — `UX-SPEC.md:1362` (`of-phase-ribbon`)

> "One vertical list of **real transitions** … **This is a *ledger*, not a node timeline — the
> record plane's documented refusal of a vertical timeline of all 21 states stands**, and this
> list is narrow (a 768px pane, twelve rows, four real timestamps, two payment references and
> the side of every step) **precisely because it carries more than one integer.**"
> — `UX-SPEC.md:1896-1901` (§G.3)

> "…the job's actual progression, and the lever to move it. 'Ops needs the past, dated and
> attributed' — **a coarse ribbon to orient, not a vertical node timeline (that's explicitly
> rejected in the real app's own design notes: ~9 quote states + 12 order stages drawn as
> nodes is a screen and a half of chrome for one integer and four dates).**"
> — `ops-v2-full-site.html:316-321`

> "The job's actual progression — the thing missing before. **A coarse 6-stage ribbon
> (matches the real app's own phase vocabulary), not a per-quote-state timeline: Ops needs
> 'where is it and what do I do next', not every internal transition drawn as a node.**"
> — `ops-v2-full-site.html:818-821`

**What was chosen instead** (`ops-ux-mock.html`, §7.1): a **two-sided dated timeline** (C5)
— three time bands (`done` / `now` / `ahead`), and within them two ownership columns
(`us` | `client`):

> "Three time bands; within them, two ownership columns. **The horizontal position answers
> 'who are we waiting on' pre-attentively; the bands stop it becoming a product tour; the
> word still carries the state.**"
> — `ops-ux-mock.html:14667-14671`

with `NOW` as *"the one band that is never collapsed"* (`ops-ux-mock.html:2925`), and the
lifecycle told **exactly twice in the console** — as a sentence in the Job Bar, as a ribbon
at the head of Process (`ops-ux-mock.html:9269-9271`, `1689-1691`).

## 4.2 Rejected: modals (with exactly one sanctioned exception)

> "R-39 — confirm strips expand upward from the footer, in place, never modal."
> — `ops-ux-mock.html:2119`

> "…which is the reason R-39 refuses modals everywhere else in the console. **This is the
> one exception, so it has to be the one that behaves.**"
> — `ops-ux-mock.html:3903-3905`

> "R-28 / L10 — one dirty guard, and it is an inline confirm strip, never a second modal.
> **The console has exactly one modal and it is the review.**"
> — `ops-ux-mock.html:19358-19359`

And in v2, the same instinct expressed differently:

> "Confirm-in-place, never a modal, never the right panel either — **a stage advance is a
> single fact to confirm, not a review with deltas and a tripwire (that's what the right
> panel is for, e.g. the pricing confirm).**"
> — `ops-v2-full-site.html:330-332`

## 4.3 Rejected: toasts

> "…deliberately NOT a toast system: no queue, no stacking, no dismissal (P-63). … **a pill
> that reappears over the canvas on every click is a toast in all but name, and the sign-off
> list refuses toasts explicitly.**"
> — `ops-ux-mock.html:7577-7589`

> "V13 applies: the select reverts and states it in place. **No toast; there is no toast
> system.**"
> — `ops-ux-mock.html:17674-17676`

## 4.4 Rejected: polling

> "R-46 — a manual Refresh and an `Updated 09:14` line. **No polling.**"
> — `ops-ux-mock.html:9312`

> "§14.6 [P-46] — a manual Refresh and an 'Updated 09:14' line on every list and record.
> **No polling is proposed: it would multiply audited reads.**"
> — `ops-ux-mock.html:16474-16475`

## 4.5 Rejected: approval gates and second-person approval

> "**WHAT IS REFUSED HERE, PERMANENTLY (R-140, R-141, R-144):** no approval gate, no
> publish-pricing mode, no pricing approval queue · rate cards stay non-inline-editable
> while options stay inline · not one `Read-only — a manager or admin can change these`
> string, because `canView/canEdit/canAdmin` are literally `isStaffUser` and that copy is
> unreachable."
> — `ops-ux-mock.html:18772-18777`

> "R-77 — the guard on money is the mandatory bank reference plus the confirm sentence,
> exactly as today. **No second-person approval, anywhere: access is flat and a manager step
> would resolve to self-approval.**"
> — `ops-ux-mock.html:14891-14893`

## 4.6 Rejected: a chip strip at job scope

> "R-70 — a push-row list, **not** a chip strip, at every width, **because seven verdict
> chips measure ≈937 px against a 634–718 px canvas**."
> — `ops-ux-mock.html:14394-14396`

> "Job scope — the push-row list, at every width (R-70). **Seven headlines at once beats a
> strip that would have to scroll sideways on a 634px canvas.**"
> — `ops-ux-mock.html:2055-2057`

Note the corollary applied back to the strip R-70 *approves* of: printed key badges are
refused on the lens chips for the same reason (`ops-ux-mock.html:2457-2460`).

## 4.7 Rejected: a percentage confidence number

From the surviving transcript, this is the owner-facing argument that shaped the whole
provenance vocabulary:

> "**The one thing I'd cut: 'confidence 94%.'** We don't have a calibrated per-line number,
> and `ingest.ts:5` explicitly refuses to hide a failure 'behind a fake confidence.' A
> percentage in a review UI is the single most load-bearing number on the screen — reviewers
> will start skipping anything above 90. Replace it with provenance, which we do know
> exactly…"
> — `BRAINSTORM-TRANSCRIPT.md`

This became `R-45`: the chip carries `recommendation_basis` humanised, **never**
`confidence_band` — *"it is the string literal `'low'` on the unresolved write path, so it
cannot vary and a constant chip is a tab bar"* (`ops-ux-mock.html:12598-12600`).

## 4.8 Rejected: lazy-on-viewport metering

> "Default: price the current row plus the two nearest by Uw. **Lazy-on-viewport is refused
> — at 270px of visible canvas the whole list is in view the moment it renders, so 'lazy'
> would fire every call at once.**"
> — `ops-ux-mock.html:13039-13041`

## 4.9 Rejected: hiding things from people who cannot use them

Three separate rules land on the same principle — **show, disable, explain**:

- **R-170** — the admin-only role select is *"shown to everyone, disabled, with the lock
  line. Never hidden"*, because *"hiding it makes non-admins ask why the field does not
  exist"* (`ops-ux-mock.html:17262-17264`).
- **R-169** — a manufacturer's missing destinations are *"explained in the account popover,
  not merely gone"* (`ops-ux-mock.html:7971-7972`).
- **R-89** — staff see withdrawn products *"MARKED, never hidden"*
  (`ops-ux-mock.html:6172`).
- **R-86** — unshippable filters are *"shown disabled with their reason"* rather than
  removed (`ops-ux-mock.html:16138`).
- **L7** — a blocked action *"stays VISIBLE and disabled with its reason beside it"*
  (12 citations).

## 4.10 Rejected: silent absence

**L9** is the counterpart rule: *"say what is not there. Never a blank, never a zero, never
a dash alone"* (`ops-ux-mock.html:524`). It is enforced in the fixtures themselves:

> "**HONEST ABSENCE.** Every entity carries at least one genuinely missing value, so the
> 'not recorded' rendering is proved rather than bypassed. `null` means 'the system does not
> hold this', and the UI must say so in words (L9)."
> — `ops-ux-mock.html:4224-4227`

And its sibling, **COHERENCE**:

> "A row never states two contradictory things. `basis:"contract"` is emitted only when an
> order exists … A composite parent's `lineTotal` IS Σ(units). A line that is `unpriced` has
> `lineTotal` null — **never 0**."
> — `ops-ux-mock.html:4218-4223`

Enforced by a coherence pass that recomputes rather than trusting typed figures:

> "(0) **EVERY PRICE IS DERIVED, NOT TYPED.** … A hand-typed figure is how a mock ends up
> showing a derivation that does not add up to the number above it."
> — `ops-ux-mock.html:5673-5678`

## 4.11 Chosen: the provenance overlay — three tiers, and Tier 2/3 flagged by default

> "'today' — exists in the console today · 'server' — Tier 2: a new read of data the system
> already writes · 'new' — Tier 3: genuinely new behaviour"
> — `ops-ux-mock.html:227-230`

> "Tier 2 and Tier 3 regions carry a visible badge **by default** — the owner has to be able
> to tell what is real from what is proposed **WITHOUT switching the overlay on.**"
> — `ops-ux-mock.html:7389-7392`

> "Tier 1 — a control over data already on screen … It is **NOT** tagged: the overlay has
> exactly three states and 'exists today' would be a lie over a proposed control, while a
> fourth state would break the legend the brief specifies."
> — `ops-ux-mock.html:13836-13841`

Proposed items that are built but *not* among the four groups the owner signed off carry
their sign-off state **in words**, *"because a colour cannot carry 'decide this one
separately' (R-165)"* (`ops-ux-mock.html:1575-1578`).

## 4.12 Chosen: the four archetypes and the four state shapes

**Four layout archetypes** (§4.2, `ops-ux-mock.html:904-1082`):
`A · WORKSPACE` (rail/canvas/pane) · `B · LEDGER` (filter/rows/peek) · `C · BOARD`
(regions, Dashboard only) · `D · FORM` (one bounded 720px column — *"the one place L1 does
not apply"*).

**Four state shapes** (§14.1, `ops-ux-mock.html:1239-1305`) — *"four distinct pictures,
never one"*: Empty (dashed panel, in place, named in the filter's own words) · Loading (a
skeleton **of the shape that is coming**, layout reserved — *"never a bare spinner, never a
full-viewport spinner"*) · Error (a bordered card **in the zone that failed**, with the code
and Retry) · Gated (*"its own shape, never the error shape"*). Plus two modifiers that live
*inside* a loaded surface: Degraded and Stale.

## 4.13 Chosen: one action site, one guard, one live region, one modal, one thread

A recurring "exactly one" discipline runs through the whole mock:

- **One action site** — the canvas footer (§5.9, R-38).
- **One discard guard**, owned by the pane, for four routes out (R-28).
- **One live region** for the whole console (P-63).
- **One modal** in the entire console (R-39 / §12.2).
- **One rendering of the blocked reason** (R-19).
- **One deterministic arrival walk**, stopping at the first match (R-47).
- **One editor mounted, always** (`ops-ux-mock.html:9141`).
- **One thread**, oldest → newest (R-81).
- **One write path, one concurrency check, one Save** (R-57).

## 4.14 What v2 chose instead (see Section 6)

v2 collapses the third zone: *"The editor lives in a right panel now — same slide-in /
full-screen-on-mobile technique as Filter and the pricing Confirm, opened explicitly by the
Edit button above rather than always-on as a third column/plane"*
(`ops-v2-full-site.html:918-922`), and therefore has **two** phone planes, not three:
*"Two planes now, not three — Edit is the same right-panel-turned-full-screen used
everywhere else"* (`ops-v2-full-site.html:975-977`).

v2's stated principle for overlays: **nav on the left, context on the right, so the two
never compete for the same edge** (`ops-v2-full-site.html:134-136`).

## 4.15 The spec's own settled-conflicts table (`UX-SPEC.md:66-78`)

Nine conflicts between four competing UX proposals, each with the rejected option **and** the
reason. This is the densest rejection material anywhere in the directory. Abridged to
decision → rejected → reason:

| Conflict | Decided | Rejected | Reason (verbatim, abridged) |
|---|---|---|---|
| What occupies the centre pane | **The opening** — elevation, spec, units, coverage, thermal, review, price, and the editor in place | *the dossier in the centre* (which follows the owner's own wireframe) | *"The evidence that exists is a filename, a synthesised sentence and an origin token: it reads well at 360px and gains nothing at 668px. What genuinely needs width is what is manipulated … **Space follows manipulation, not consultation.** This contradicts the owner's wireframe and is raised as Open Question 1"* |
| Global navigation shape | 48px left icon rail, hover-expands to 200px overlay | a 48px dark top bar; a 224px rail; 3 doors + 14 lanes | *"The top bar cannot hold six destinations plus omnibox plus identity below 1180px without a 'More' menu … The 224px rail costs the centre pane 176px it cannot get back. Flow's lane rail is a second navigation and its own risk #1 says so"* |
| Destination count | **Six** | five (Files and Audit under Admin) | *"Filing them under Settings makes a reviewer hunting a schedule pass the deposit percentage"* |
| The headline gate metric | `LINES READY 5 of 8` + caption `3 unpriced or unresolved` | `APPROVED 0 / 3` (the owner's), `UNRESOLVED 2 of 3`, `Settled 1 / 3` | *"**There is no per-line approval in this system** — migration 0033 removed the engine and the endpoints. The real gate on the primary action is `unresolvedLineCount`."* |
| The selection log | Ship what is reachable + one line naming the gap | "deliberately not built"; "ship behind one new endpoint" | *"The owner named product selection logs specifically. Refusing to build it ignores the brief; building it against an endpoint that does not exist ships an empty box."* |
| Fixing a missing option price from the record | **A link** to the options screen | an inline `$` field | *"Identical outcome, one walk longer, **zero new write surface on a screen that otherwise never writes prices.**"* |
| Revision tabs | **Deleted**, replaced by a revision ledger | keeping `Live draft / R3 / R2 / R1` | *"Selecting R2 today changes a heading and an editing lock and shows the live draft's rows underneath. **A control that looks like a version switcher and is not is worse than none.**"* |
| Presence | `Last change · maria · 14 Aug 09:12` + `as of 14:32 · Refresh` | the hard-coded `editing elsewhere`; any presence dot | *"Nothing publishes presence. The current literal is shown unconditionally, **which trains people to ignore a warning that never varies.**"* |
| Approval steps in the quote flow | **None built** | the owner's approval framing | *"What replaced approval is confirmation, versioned concurrency and an audit trail"* |

Two of these are marked as **contradicting the owner's own wireframe** and were raised back to
him as open questions rather than decided silently — the centre-pane conflict (Open Question 1)
and the gate metric (Open Question 4).

## 4.16 Rejected: presence, undo, optimistic UI

> "**None, and none is proposed.** There is no websocket, no SSE, no polling and no presence
> storage. Today's console ships a fabricated one: the Live-draft tab's meta line reads
> `editing elsewhere` **always** … **a warning that never varies trains people to ignore
> warnings.** … **Staleness is stated as *age*, which is knowable, rather than as *occupancy*,
> which is not.**"
> — `UX-SPEC.md:1630-1639` (§E.7)

> "**There is none, and the console does not pretend otherwise.** Of the sixteen mutations in
> the ops surface, exactly one is reversible by an endpoint … **A global undo that works for one
> action in sixteen is worse than none.**"
> — `UX-SPEC.md:1583-1596` (§E.5)

> "**No optimistic UI anywhere.** Every mutation awaits the server and refetches … **a
> locally-guessed total is a number the console invented — the one thing this design will not
> do.**"
> — `UX-SPEC.md:1561-1563`

## 4.17 Rejected: column sorting, bulk selection, export, checkboxes

> "**Not built and why:** column sorting (**the server's neglect-first order is deliberate and a
> header that destroys it is a trap**); bulk selection (no bulk endpoint); export (no
> endpoint)."
> — `UX-SPEC.md:836-837`

> "**There is no multi-select and no checkbox anywhere in the console**, because no endpoint
> accepts a batch. **A checkbox column that can only ever act on one row is a promise the server
> cannot keep.**"
> — `UX-SPEC.md:1504-1506`

The mock preserves the sort refusal as `R-108`'s neighbour: *"'Ours first, longest waiting' —
the server's own order, stated for the first time. **Deliberately NOT `updated_at`, which moves
when the customer replies and buries our oldest obligation.**"* (`ops-ux-mock.html:16888-16890`).

## 4.18 The two "must not exist" lists

> "**Variants deliberately not built:** a density toggle · card-vs-table duality · ghost / link
> / text button tiers beyond primary + secondary · icon-only buttons without a label · **a
> second modal system** · **a tooltip system** · a colour-only badge · an avatar · a progress
> ring · a notification centre · **a dark theme** (the `.dark` block in `theme.css` is dead
> code)."
> — `UX-SPEC.md:1467-1470`

> "**Must not exist, by design:** any percentage confidence · any page thumbnail or region
> highlight · any presence indicator · any approval step in the quote flow · any invented
> placeholder standing in for an unset value · any bulk checkbox · any progress ring · any
> colour-only state · **a green reconcile banner that has never been earned.**"
> — `UX-SPEC.md:2201-2204`

That last clause is implemented in the mock: *"'Nothing has ever checked' is a state of the run,
not a sticky flag: **an unlabelled green banner and a broken checker look identical, and so do a
stale banner and a true one.**"* (`ops-ux-mock.html:18863-18866`).

## 4.19 The strongest single formulation of the whole design stance

> "**When a fact is not stored, the console prints the absence; it does not close the gap. When
> two things compete for space, the one being manipulated wins over the one being consulted.
> When a control would be a second way to reach something the record already does, it is not
> built.**"
> — `UX-SPEC.md:104` (§A.1)

And its enforcement clause, which is the reason the mock's `of-source-viewer` equivalent has
exactly one state:

> "**No PR may add a second state to that component until `region_json` is non-null in
> production.**"
> — `UX-SPEC.md:1717`

> "**The prototype must never render a `%` next to the word confidence. Anywhere.**"
> — `UX-SPEC.md:1771`

---

# 5. The tokenisation contract (§17 / R-174)

The purpose is stated at the top of the token file: **a component library can be swapped by
rebinding the semantic layer, without touching the UX.** (The brief named Fluid UI 2; the
comments name Fluent / shadcn / Ionic / Framework7.)

## 5.1 The one-file rule

> "Spec §2 (tokens) and §17 (tokenisation contract, R-174).
> **THIS IS THE ONLY FILE IN THE BUILD THAT MAY CONTAIN A LITERAL COLOUR, RADIUS, SHADOW,
> FONT SIZE, FONT FAMILY, SPACING VALUE, EASING OR DURATION.** Everything downstream
> consumes `var(--…)`. If you find yourself typing `#` or `px` outside this file, the token
> is missing — add it here instead."
> — `ops-ux-mock.html:21-27`

Every downstream stylesheet restates its own compliance in its header
(`ops-ux-mock.html:441-446`, `2343-2346`, `3137-3141`, `3535-3539`, `2755-2758`).

## 5.2 The two-layer structure — this is the swap seam

> "**§1 PALETTE PRIMITIVES.** Raw ramps. **Components never consume these directly** — they
> consume the semantic roles in §2. **Swapping component library (Fluent / shadcn / Ionic /
> Framework7) rebinds §2; §1 is where a rebrand lands.**"
> — `ops-ux-mock.html:46-50`

| Layer | Contains | Who touches it |
|---|---|---|
| **§1 Palette primitives** | `--p-n-000…900` (warm neutral ramp), `--p-sage-*` (brand), `--p-pos/attn/crit/info-*` (semantic hues), provenance overlay hues | **A rebrand** |
| **§2 Semantic roles** | `--surface-*`, `--rule*`, `--text-0…4`, `--brand*`, `--tone-*`, `--ctl-*`, `--field-*`, `--focus-*`, `--plate-*`, `--skeleton-*` | **A component-library swap** |
| **§3 Chrome** | `--ops-*` — the console's one dark surface | neither; it is a surface, not a theme |

The semantic roles, in full (`ops-ux-mock.html:106-212`):

- **Surfaces** — `--surface-0` (app ground, behind zones) · `-1` (zones, cards, rows) ·
  `-2` (headers, footers, sticky bands) · `-3` (wells, inset plates, skeleton ground) ·
  `--surface-sunken` · `--surface-overlay` (command bar, peek, sheets, modal) ·
  `--surface-scrim` · `--surface-selected` · `--surface-hover` · `--surface-active` ·
  `--surface-disabled` · `--surface-none`.
- **Rules** — `--rule`, `--rule-strong`, `--rule-quiet`, `--rule-inverse`, `--divider-w`.
- **Text ramp** — `--text-0` (headings, the subject) · `-1` (body, active nav) · `-2`
  (secondary, captions) · `-3` (quiet, provenance lines) · `-4` (**absence, "not
  recorded"**) · `--text-disabled` · `--text-inverse` · `--text-link` ·
  `--text-link-hover`.
- **Brand** — `--brand`, `--brand-strong`, `--brand-tint`, `--brand-tint-strong`,
  `--brand-border`, `--brand-on`, `--accent-underline` (*"§3.1: 2px active underline, not a
  fill"*).
- **Tones** — five tones (`neutral`, `positive`, `attention`, `critical`, `info`) × four
  roles (`-fg`, `-bg`, `-border`, `-mark`). *"Always paired with a word (L3, I8, R-165).
  Never colour alone."*
- **Controls / Field / Focus / Plate / Skeletons** — as listed at `ops-ux-mock.html:175-212`.

## 5.3 What is NOT tokenised, and why

Three explicit carve-outs.

**1. Density is ours, never the library's (R-178).**

```
/* ═══ 7. DENSITY — ours, never the library's (R-178) ═══════════════════════ */
--row-scan: 32px;    /* ledgers and queues */
--row-work: 44px;    /* anything touched or edited */
--row-line: 66px;    /* rail row: three text lines + glyph (§5.5) */
--row-unit: 40px;    /* nested unit row under a composite parent */
--tap-min: 44px;     /* forced at ANY width under pointer:coarse */
--row-card-min: 72px;
```
— `ops-ux-mock.html:347-354`

**2. Copy is not a theme.**

> "Every load-bearing sentence lives in the fixtures (**§17.3 — copy is not a theme and must
> not be movable by a re-skin**)."
> — `ops-ux-mock.html:18839-18840`

> "── 9. The copy that carries consequence (**§17.3 — copy is not tokenised**) ──"
> — `ops-ux-mock.html:7022`

**3. The console is light on purpose; the one dark surface is a *surface*, not a theme.**

> "The console is LIGHT ON PURPOSE (§0, §1). Its one dark surface is the chrome
> (`--ops-*`), which is a **surface, not a theme**. The palette is pinned below so the page
> cannot borrow a dark host theme."
> — `ops-ux-mock.html:31-34`

> "**Non-negotiable: never declare a colour whose only definition sits inside a media block
> or a `[data-theme]` block.** Every token below is declared on bare `:root`; these three
> rules only stop the UA from re-rendering form controls, scrollbars and canvas defaults in
> dark."
> — `ops-ux-mock.html:35-39`

## 5.4 Component-scoped tokens — the sanctioned extension point (§17.1)

A module **may** declare its own custom properties, under two conditions: they are
**geometry, not colour**, and they **redefine nothing** in the token file.

> "Three values this component owns. They are **additions in the §17 sense** — a component
> decision expressed as a custom property so a library swap can rebind it — and they
> **redefine nothing declared in 00-tokens.css. No colour is among them**; every colour on
> this surface comes from a semantic role token."
> — `ops-ux-mock.html:1601-1606`

> "The few new custom properties are **component geometry, per §17.1** — a component library
> can rebind them without touching the UX."
> — `ops-ux-mock.html:3139-3141`

> "Locally-scoped `--lens-*` / `--plate-*` custom properties **bind existing tokens to a
> component; they never introduce a new value.**"
> — `ops-ux-mock.html:2347-2349`

## 5.5 Type: three roles, system stacks, no webfont URLs

> "**ui** — every label, sentence, heading · **data** — every dimension, money figure,
> reference, Uw/SHGC, version (§2.2). **MUST be paired with `font-variant-numeric:
> var(--fvn-data)`, because the `font:` shorthand resets font-variant.** The `.dat` utility
> in `01-base.css` does both; use it rather than re-deriving. · **mono** — raw extracted
> text, slugs, HTTP codes, payloads"
> — `ops-ux-mock.html:240-246`

`--fvn-data: tabular-nums slashed-zero` (`ops-ux-mock.html:253`). The scale is expressed as
`font:` shorthand tokens (`--t-hd1`, `--t-hd2`, `--t-body`, `--t-body-strong`, `--t-quiet`,
`--t-label`, `--t-cap`, `--t-dat`, `--t-dat-lg`, `--t-datsm`, `--t-mono`) —
`ops-ux-mock.html:255-266`.

## 5.6 The token groups, in order

`§0` light pinning · `§1` palette primitives · `§2` semantic colour roles · `§3` chrome ·
`§4` provenance overlay · `§5` type · `§6` layout · `§7` density · `§8` shape, elevation,
motion · `§9` stacking · `§10` viewport / safe area / keyboard · `§11` breakpoint reference
· `§12` device frames. (`ops-ux-mock.html:18-434`.)

The **stacking order** is a token group in its own right, and worth preserving as a
contract (`ops-ux-mock.html:379-393`):
`base 0 · sticky 10 · jobbar 20 · topbar 30 · handle 35 · peek 40 · sheet 50 · plane 55 ·
drawer 60 · modal 70 · command 80 · prov 88 · dev 96 · live 99`.

## 5.7 The earlier generation's contract (`UX-SPEC.md`) — the same seam, named differently

`UX-SPEC.md` states the swap goal as the framing constraint of the entire deliverable:

> "**Styling is a later pass**, possibly onto a component library (**Fluid UI 2**), so this spec
> is structure-first: **every visual is a named component with props, variants and states, and
> every colour is a token, never a literal.**"
> — `UX-SPEC.md:13-16`

Its seam is **ARIA-and-`data-*` state on `of-*` classes**, which is a different (and
complementary) mechanism from the mock's two-layer token binding:

> "**Naming.** Class `of-<component>` in kebab case. **State is expressed as ARIA wherever ARIA
> has a word for it** (`aria-selected`, `aria-expanded`, `aria-current`, `aria-disabled`,
> `aria-busy`, `aria-invalid`), and as `data-*` only where it does not (`data-tone`,
> `data-state`, `data-scope`, `data-priority`, `data-unsized`). This is lifted from
> `theme.css`'s `.tab`, which is already keyed off ARIA rather than a class *'so the look cannot
> drift from the semantics'*. **A port to Fluid UI 2 is then a rename of about thirty things,
> not a rewrite.**
> **No component carries a bespoke colour.** Every colour is a token from §H.3. **Every
> component below names the endpoint behind it, so the vocabulary is a build contract rather
> than a style guide.**"
> — `UX-SPEC.md:1327-1336`

The build-plan restatement (`UX-SPEC.md:2013-2022`) adds three clauses the mock also honours:

> - "Every colour, size, font and duration is a CSS custom property … **No literal colour
>   appears in a rule.** Restyling is then a matter of replacing `:root`."
> - "**No component-specific magic numbers:** geometry comes from `--ops-*` layout constants."
> - "**No shadows except the two overlays** (omnibox dropdown, mobile scrim); square corners
>   (`--radius: 2px`); hairline borders; **sage as the only accent.**"

### The five-tone system — the role vocabulary the mock inherited

> "Five tones. **Colour never appears without its word** (P3). One system replaces the three
> that coexist today."
> — `UX-SPEC.md:1386`

| Tone | Meaning |
|---|---|
| `ready` | done, correct, nothing owed |
| `review` | ours to resolve; stops nobody yet |
| `blocked` | cannot proceed |
| `waiting` | correct, and not ours |
| `quiet` | inert, superseded, not applicable |

> "`Enquiries.tsx`'s five raw-Tailwind buckets (amber / blue / sage / red / neutral) map 1:1
> onto `review / waiting / ready / blocked / quiet` — **the one off-brand palette in ops
> disappears without losing a single distinction.**"
> — `UX-SPEC.md:1399-1401`

The mock's five tones (`neutral`, `positive`, `attention`, `critical`, `info` ×
`-fg/-bg/-border/-mark`) are the same idea rebound to different words. **The audit records that
this map is incomplete** — `UX-AUDIT.md:181-186` (G8): six enquiry status values are unassigned
in the spec's map, *"and a builder will guess."*

And one rule with teeth that the mock also enforces:

> "**Rule with teeth:** a value that is a raw DB token (`under_review`, `deposit_invoiced`,
> `not_contacted`) is **humanised everywhere or nowhere**, and the raw value lives in the
> `title` so a support conversation can still quote it. **Today the customer 360 prints raw
> tokens that are humanised two screens away.**"
> — `UX-SPEC.md:1404-1407`

### The live app's own tokens, ported verbatim (`UX-SPEC.md:2062-2126`, §H.3)

Worth keeping because these are the **shipping product's real token names**, which the mock
renamed. Header: *"Ported verbatim from the style contract. **Light only** — the `.dark` block
in the live stylesheet is dead code and is not carried over."*

- surfaces `--paper --bone --recessive --shade --sage-wash --sage-veil --background`
- rules `--line --line-strong --rule-05 … --rule-15 --rule-white-10 --rule-white-15`
- brand `--sage #5A7A6A --sage-light --sage-deep --sage-ink --sage-hover`
- text ramp `--ink #131311 --ink-soft --body --body-soft --quiet --quieter --quietest --ink-hover`
- chrome `--ops #14150f --ops-panel --night`
- states `--positive --warning --warning-ink --attention --attention-ink --info --info-ink --destructive`
  — *"never used alone; the word always carries it too"*
- tone panels `--panel-sage-* --panel-warn-* --panel-error-* --chip-infected-* --chip-pending-*`
- focus `--ring-focus: var(--sage)` — *"ops has none today; adopt the site's sage ring"*
- geometry `--radius:.125rem --ops-rail-w:48px --ops-rail-expanded:200px --ops-drawer-w:264px
  --ops-pane-a:264px --ops-pane-c:360px --ops-header-h:132px --ops-header-h-collapsed:104px
  --ops-content-max:1440px`
- type `--font-display 'Space Grotesk' · --font-body 'Inter' · --font-data: var(--font-display)`,
  scale `--t-hd2 … --t-datsm`

Plus two load-bearing base rules:

```css
*,*::before,*::after { border-color: var(--line); }   /* load-bearing: CSS defaults to
                                                          currentColor, which would turn every
                                                          1px border into a dark rule */
:focus-visible { outline: 2px solid var(--ring-focus); outline-offset: 2px; }
```

### The open question on the library swap — `UX-SPEC.md:2279-2286` (Open Question 5)

Still open, and it names the two things that would actually break the port:

> "**Is Fluid UI 2 confirmed as the styling target, and does it ship a data table with
> column-priority folding?** The whole vocabulary is built so the port is a rename, but **two
> things bind us: whether its list primitive can fold columns into meta lines** (which is what
> gives Enquiries and Files their first phone layout), **and whether its modal system will tempt
> someone to break P7.**
> **Recommended default: assume a generic library.** Keep `of-*` classes with ARIA/`data-*`
> state and the token block; if Fluid's table cannot fold, `of-row-list` stays ours and only its
> skin is adopted."

### Token-adjacent deletions — `UX-SPEC.md:644-651`

Recorded because they are cleanup a redesign should carry, not rediscover: `Placeholder`
(unreachable) · `safeParse()` (no call sites) · three ghost icon imports (residue of removed
Approvals / Orders / Rules tabs) · the hard-coded `editing elsewhere` literal · the
`MONO = {}` empty-object spread at ~20 call sites · `Pricing.tsx`'s local `INK = var(--ops)`
shadow · **the `.dark {}` block and every `oklch()` sidebar token** · `src/styles/globals.css`
(0 bytes, imported by nothing).

## 5.8 v2's own tokenisation note

The v2 mock is far lighter but makes the same structural point about the chrome:

> "The nav shell (sidebar + mobile drawer) is a **fixed dark chrome, same in both themes —
> it's the staff console's identity, not content**, matching how the real app's own sidebar
> (`bg-ops`) doesn't follow a light/dark toggle either. **Defined once here rather than
> duplicated per theme block.**"
> — `ops-v2-full-site.html:33-36`

The `BRAINSTORM-TRANSCRIPT.md` records that the live app was *already* fully tokenised, and
that this was the reason a token-only prototype was viable at all:

> "**The design language is already fully tokenised.** `theme.css` has a role-named palette
> (`--sage`, `--ops #14150f`, `--bone`, the ink ramp, `--attention` distinct from
> `--warning`, and a four-state TONE triple system), plus a `t-*` type scale on three
> families … **That's a clean port to a component library later**, and it means the
> prototype can be pure CSS custom properties with no build step and still read as the same
> product."
> — `BRAINSTORM-TRANSCRIPT.md`

---

# 6. What differs between the two mocks

Both were recovered from published artifacts. `ops-v2-full-site.html` is **later**; the
owner called it *"the latest version"* and said he likes its feel. `ops-ux-mock.html` is
**far deeper** and is the only one carrying the rule citations. They are not two drafts of
one thing — they answer different questions, and where they conflict, the conflict is real.

## 6.1 Scope and fidelity

| | `ops-ux-mock.html` | `ops-v2-full-site.html` |
|---|---|---|
| Size | 20,925 lines / 1.09 MB | 1,616 lines / 102 KB |
| Rule citations | 399 across 154 rules | **zero** |
| Comment blocks | 1,155 | 118 |
| Surfaces | **24 canonical** (`OPS.SURFACES`, §4.1) | 9 nav destinations + the record |
| Architecture | 8 composed modules (`00-tokens`, `01-base`, `30-workspace`, `40-lenses`, `50-jobpanels`, `60-screens`, `70-pricing`, `10-data`, `20-core`) with a published `window.OPS` API, screen/panel/peek/command registries | one IIFE, `innerHTML` render, no registry |
| Fixtures | a coherence pass + `D.selfCheck()` that recomputes every derived total | representative demo content, deliberately not per-project |
| Routing | hash routing (`P-1`), 8 addressable query params, scroll restoration, deep links | `state` object, no URL |

## 6.2 The direct conflicts — resolve these before designing

### (a) Three planes vs. two

- **ux-mock:** three workspace planes — `lines` / `work` / `edit` — with the editor as the
  third (`ops-ux-mock.html:11194`).
- **v2:** *"Two planes now, not three — Edit is the same right-panel-turned-full-screen used
  everywhere else, opened from the Edit button in the Detail plane, not its own place in the
  segmented control."* (`ops-v2-full-site.html:975-977`)

v2's plane labels are `Lines` and the line name; ux-mock's are `Lines <n>`, the line code,
and `Edit`.

### (b) The editor as a third column vs. an on-demand right panel

- **ux-mock:** the pane is a **persistent third column** at ≥1280 and the live-redraw loop
  (type a dimension, watch the plate redraw) depends on that (R-50, R-13, R-147). At
  1024–1279 the rail collapses to 48px specifically so the pane can stay a column.
- **v2:** *"the editor is a right panel now, not a third column"*
  (`ops-v2-full-site.html:340-341`), *"Was a permanent third desktop column plus a third
  mobile plane; now one panel, opened explicitly, same on both sizes"*
  (`ops-v2-full-site.html:584-586`).

**This is the sharpest conflict in the two files.** v2's simplification removes the
mechanism R-50 exists to protect.

### (c) Attribute-driven layout vs. container queries

- **ux-mock:** layout keys on `:root[data-width-class]` and `:root[data-pointer]`,
  **explicitly not** width media queries, so the device toggle genuinely reframes the
  console (`ops-ux-mock.html:406-410`, `456-458`). Five width classes.
- **v2:** a CSS **container query** on `.device` plus a `ResizeObserver` deriving
  `state.size`, at a **single** breakpoint of `767.98px` — *"This is the only mechanism — no
  toggle to keep in sync with it"* (`ops-v2-full-site.html:96-103`, `498-503`,
  `1590-1598`). Two sizes: `mobile` / `desktop`.

Both files argue the *same* underlying principle — the simulated device must not be a
parallel mechanism that can disagree with real resizing — and reach **two different
implementations**. v2's is simpler and self-verifying; ux-mock's carries the pointer and
height axes that v2 has none of.

v2 also anchors its breakpoint to the shipped app: *"The breakpoint matches the real app's
own `md:` (768px) — not a number invented for this mock"* (`ops-v2-full-site.html:102-103`).

### (d) Navigation shape

- **ux-mock:** a **48px top bar**, one band, **no rail at any width** (L1, C6), with an
  eight-item collapse ladder (`≥1152` / `900–1151` / `768–899` / `<768`) and a phone drawer
  as an overlay, never a route (§3.2).
- **v2:** a **224px dark left sidebar** at ≥768 + a **52px topbar inside the content
  column** ("not spanning it"), replaced below 768 by a left drawer
  (`ops-v2-full-site.html:105-160`). Sidebar and drawer share **one content function, two
  mount points** (`ops-v2-full-site.html:1506-1508`).

v2's nav list is explicitly the shipped console's own `TABS` array, not an invented one:

> "The real console's own TABS array (`OpsApp.tsx`), not a bigger list invented for this
> mock — 8 menu items. **A project record is reached BY CLICKING a Projects row, same as the
> real app; it has never been its own menu entry, so it isn't one here either.**"
> — `ops-v2-full-site.html:631-634`

### (e) Overlay edges

v2 states an edge convention ux-mock does not: **nav on the left, context on the right.**

> "mobile left drawer — same technique as the right-side panels (scrim + translate),
> mirrored: **nav lives on the left, context (filters, confirm) on the right, so the two
> never compete for the same edge.**"
> — `ops-v2-full-site.html:134-136`

ux-mock puts the drawer at `--drawer-w: min(82%, 264px)` on the left and peek/sheet on the
right, so it is consistent with this — but never states it as a rule.

### (f) One right-panel component vs. a typed overlay vocabulary

- **v2:** deliberately **one technique, three uses** — filter sheet, pricing confirm, line
  editor — *"same right-slide-in / full-screen-on-mobile technique"*, differing only in
  content (`ops-v2-full-site.html:577-586`, `740-742`, `1361-1363`).
- **ux-mock:** four *typed* overlay layers with different geometry, z-index and dismissal
  semantics — **peek** (400px / 70dvh bottom sheet, M2, P-39), **sheet**
  (`min(88%, 520px)` / full-frame, §13.3), **plane** (`inset: 0`, §13.4), **modal** (one,
  85dvh) — plus the drawer and the command bar.

### (g) Counts on filter tabs

v2 records a reason for *not* counting that ux-mock's nine-counted-views design does not
address:

> "No counts here, unlike Projects — **each tab is a distinct server query in the real app,
> not a client-side filter over one fetched set, so counting the hidden ones would mean
> firing extra requests just to label a button** (same reasoning as the real fix)."
> — `ops-v2-full-site.html:747-750`

## 6.3 Where they agree (and therefore where confidence is highest)

- **A mobile plane stack for the record**, with a segmented plane switcher, is in **both**.
  v2 names the CSS class `.planebar` and `.plane-body` exactly as ux-mock does.
- **A stepper** rides the mobile record view in both (`.stepper`,
  `ops-v2-full-site.html:417-419`).
- **Five lens chips must fit one row at 390px with no horizontal scroll** — both.
  v2: *"fits all 5 in one row at 390px — no horizontal scroll on a tab strip, ever"*
  (`ops-v2-full-site.html:371`), achieved by showing the value suffix **only on the active
  lens** (`ops-v2-full-site.html:880-881`). ux-mock achieves it by abbreviating verdicts and
  cutting the fifth chip (R-68). *These are two different solutions to one agreed
  constraint.*
- **No horizontal scroll, ever, on the page body** — both, emphatically. v2:
  > "A genuine mobile card treatment — the real app's own comment admits this is still
  > pending there (`overflow-x-auto` is containment, not a design). **No horizontal scroll
  > here, ever, is the whole point of this pass, so the mock doesn't get to inherit that
  > gap.**"
  > — `ops-v2-full-site.html:1421-1424`
- **The editor's pinned Save/Cancel bar over scrolling fields** — both, and v2 notes it is
  *"the pattern the estimator already ships and proves out, reused here rather than
  reinvented"* (`ops-v2-full-site.html:388-390`).
- **A coarse phase ribbon, not a node timeline** — both (§4.1).
- **Confirm in place, never a modal** — both.
- **A record is reached by clicking a row, never a top-level nav entry** — both.
- **44px minimum touch target** — both (`--tap-min`).
- **The dark nav chrome is a surface, not a theme** — both.

## 6.4 Which is "current"

Stated plainly so nobody has to guess:

- **`ops-v2-full-site.html` is later**, is the one the owner pointed at as *"the latest
  version"*, and is the one whose **feel** he endorsed. Its breadth (nine surfaces at a
  workable fidelity) and its single-mechanism responsiveness are its contributions.
- **`ops-ux-mock.html` is the deeper artifact and the only source of the rules.** Everything
  in Sections 1, 2, 3 and 5 of this document comes from it. v2 does not contradict most of
  it — it simply never reaches that depth.
- Where they **do** conflict (§6.2 a–g), the conflict is a genuine open question that this
  document does not resolve and must not be read as resolving. Section 3's defects apply to
  **both**, because they are properties of the browser and the content, not of either
  design.

## 6.5 And where `UX-SPEC.md` sits relative to both

`UX-SPEC.md` is **neither mock's document.** It is the earlier generation, and both mocks
depart from it in recorded ways:

| Question | `UX-SPEC.md` | `ops-ux-mock.html` | `ops-v2-full-site.html` |
|---|---|---|---|
| Nav | 48px left **icon rail**, hover-expands to 200px overlay, `⌘\` pins | **48px top bar**, no rail at any width (L1, C6), 4-step collapse ladder | **224px dark left sidebar** + 52px topbar inside the content column |
| Breakpoints | 5 steps: 1440 / 1280 / 1120 / 900 / 768 | 5 width classes as **attributes**: 1680 / 1280 / 1024 / 768 + pointer + height | **1** container-query step: 767.98px |
| Workspace zones | A / B / C panes (264 / fluid / 360) | rail / canvas / pane (320 / fluid / 400) | rail / canvas, editor as a right panel |
| Phone | push navigation, single column, bottom-pinned action bar | **the plane model** (§1) | two planes + shared right panel |
| Line table | "Sheet view", behind the `T` key | the rail is a permanent line index (R-20) | the rail is a plane |
| Tokens | `of-*` classes + ARIA state + `theme.css` tokens ported verbatim | two-layer `--p-*` → semantic roles (§5) | a small flat token block |

Notably, **the mock chose the top bar the spec had explicitly rejected** (`UX-SPEC.md:71`) and
then had to build exactly the collapse ladder the spec predicted would be needed — and **v2
chose the 224px-class sidebar the spec also rejected**. This is a genuine three-way
disagreement about the console's navigation shape, and none of the three files resolves it.

---

# 7. Known gaps in this salvage

Stated honestly so nobody mistakes silence for absence of the thing.

1. **The `§0`–`§17` / `R-1`–`R-178` document does not exist, and `UX-SPEC.md` is not it.**
   Confirmed by full reads of both written documents: `UX-SPEC.md` contains **no `R-<n>` rules
   and no `§0`–`§17` structure** — it is organised `§A`–`§I` with `P1`–`P7`, `G1`–`G18` and
   `#1`–`#291`. The lost document is a **later** artifact that `ops-ux-mock.html` was built
   from. Its section headings are only recoverable where cited. Cited: §0, §1, §2, §2.1, §2.2,
   §2.4, §3.1, §3.2, §3.4, §3.5,
   §4.1, §4.2, §4.4, §5–§5.9, §6–§6.9 (incl. §6.4.1–§6.4.5, §6.6.1–§6.6.2), §7–§7.7, §8,
   §8.3, §8.4, §8.6, §9, §9.1, §9.4, §10, §10.3–§10.5, §10.9, §11–§11.8, §12, §12.1, §12.2,
   §12.5, §13, §13.1, §13.3–§13.6, §13.8, §13.9, §14, §14.1, §14.2, §14.4–§14.7, §15, §16.7,
   §17, §17.1, §17.3. **Never cited, therefore lost: §13.2, §13.7, §16.1–§16.6, §16.8+, and
   every sub-section of §0–§4 not listed above.**
2. **30 rule numbers have zero citations** (listed in Section 2). Notably `R-150`, `R-156`
   and `R-157` sit inside the device-parity band, so part of §13's rule set is
   unrecoverable.
3. **Sub-numbered rules imply missing siblings:** `R-17.2`/`R-17.3` survive but `R-17.1`
   does not; `R-128.1`, `.4`, `.5` survive but `.2` and `.3` do not.
4. **The reduced-motion cross-fade** is named at `ops-ux-mock.html:1461` but the shipped CSS
   is `transition: none`. The intent is recorded; the implementation is not.
5. **The plane push/pop transition is declared in CSS but not driven by JS** in the mock —
   plane changes are full re-renders on route change. Whether the 240/200ms animation was
   ever seen running is not determinable from the file.
6. **The `[P-n]` proposal register** (P-1…P-65) is referenced ~throughout but the register
   itself (`proposed-additions.md`, named at `ops-ux-mock.html:7381`) is not in this
   directory. The tiers and several individual proposals are recoverable from use sites;
   the register is not.
7. **`ops-redesign-prototype.html`** ("the bench", committed at repo root 2026-08-10 per
   `BRAINSTORM-TRANSCRIPT.md`) is a third artifact not covered by this salvage.
8. **The six parallel inventories** that produced the spec (*"Six parallel readers
   inventoried the live console…"* — `README.md`) were never checked in. `UX-AUDIT.md` cites
   them by name throughout (`inv-ops-ui`, `inv-record`, `inv-api`, `inv-pricing`,
   `inv-estimator`, `inv-record-plane`), so their *section structure* is partially recoverable
   from those citations even though the documents are not.
9. **Two `I<n>` namespaces and two `G<n>` namespaces exist** (see the warning in §2.Q). The
   mock's `I1`–`I10` belong to the lost document and are reconstructed here from use sites
   only; their canonical wording is gone.
10. **`GRILL-CONCLUSIONS.md`** (same directory, written after these artifacts) was **not** a
   source for this salvage and is not reconciled against it. If it and this document disagree,
   that disagreement has not been examined.
11. **The four competing UX concepts** the spec was grafted from (referred to as Narrative,
   Systems, Flow and Workbench, cited as e.g. *"Systems §3.8"*, *"Flow §3.7"*,
   *"Workbench §6"*) are not in this directory. `UX-SPEC.md:43-78` is the only surviving record
   of what each contributed and what was rejected from each.
