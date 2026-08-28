# ops2 R1 — interaction spec: the frame and the record, on the plane shell

Author: ux-designer · Date: 2026-08-17 · Rev 1 (rework)
Mock (the contract once approved): `docs/mocks/ops2-r1-plane-shell.html`
Supersedes: `docs/design/ops2-r1-interaction.md` and `docs/mocks/ops2-r1-frame-and-record.html`
(rejected; left in history deliberately).

Binding inputs: `docs/ops-redesign/LEARNINGS.md` (the only surviving record of the settled
mobile model — treat every citation in it as the last copy in existence),
`docs/adr/0004-ops2-plane-shell-owned-not-adopted.md`, `docs/design/ops2-architecture.md`
§4.0, `docs/design/ops2-r1-frame-and-record.md`, `docs/specs/ops2.md` rev 7,
`docs/ops-redesign/GRILL-CONCLUSIONS.md`, `docs/ops2/register.md`.

Where `LEARNINGS.md` and `GRILL-CONCLUSIONS.md` differ, this spec designs to the
conclusions — they are the owner's own, later words. Every such point, and every place I
depart from `LEARNINGS.md` on my own judgement, is listed in §10 with its reasoning,
because no one can check a departure against the lost original.

---

## 1. The model in one page

R1's record is **three zones and a bounded push stack**. Nothing else.

| Zone | What it holds | Phone | 768–1023 | 1024–1279 | 1280+ |
|---|---|---|---|---|---|
| `index` | the openings list + goods total | Lines plane (planebar segment 1) | summoned overlay list | 48px code strip | rail 264 / 320 |
| `work` | scope: **job** (progress · payments · files · history · notes) or **line** (config · price · units · line notes) | Work plane (planebar segment 2) | the ground | canvas | canvas, fluid |
| `edit` | the line editor + read-back | pushed plane | right sheet, **no scrim** | pane 380 | pane 400 / 440 |

Four routes, and every one of them is a real URL and a real history entry:

```
/                                        interim record list (R1; R4 replaces it)
/record/:ref                             the record          — stack depth 0
/record/:ref/job/:block                  one job band        — depth 1
/record/:ref/line/:lineId                one line            — depth 1
/record/:ref/line/:lineId/edit           the editor          — depth 2
```

**The active plane is derived from the route, never held as state.** This is the single
load-bearing rule of the whole model and it is recorded in `LEARNINGS.md` §1.3 as a bug
that was found and fixed: held as state it defaulted to `lines` forever, so a line opened
from a link left you looking at the list and the line plane was unreachable. Derive it, and
every push is a history entry, the OS back gesture pops the plane, deep links work, and
AC-24/25/26 fall out.

### The growth law — two moves, and only two

1. **A zone that was a plane becomes a pane.** Which zones are simultaneous is the width
   class's only structural decision.
2. **A push that was a plane becomes a disclosure in place.** Same row, same route, same
   component — only the presentation of arrival changes.

Nothing is rearranged; no content changes zones at any width. This is ADR 0004's
"revelation, not rearrangement", extended: revelation alone has no answer for the pushed
sub-planes (the job bands), and move 2 is that answer.

> ⚠ **Amended 2026-08-18 (owner ruling):** move 2 is **withdrawn** — disclosure-in-place
> is rejected (*"don't like the approach. not great UX pattern"*), and no accordion
> substitutes for it. Move 1 stands as the whole growth law. The job blocks stay real
> routes at every width; the replacement presentation (steer: master-detail — the list
> persists, the selected block renders beside it) lands in the reworked Ionic mock.
> Binding detail: `docs/design/ops2-ionic-boundary.md` §1.6.

A zone always reads **its own** measured width, never the viewport's, so a 380px pane on a
desktop folds exactly as a phone does. That is what makes revelation safe: revealing a zone
never assumes it got wide. (C1: the Fold, open, resized mid-session with apps beside it.)

---

## 2. The frame

### 2.1 Navigation — one surface, two mount states

There is exactly **one** navigation surface (C6: a second navigation band is forbidden).
It is the same content function mounted two ways:

| Width | Presentation |
|---|---|
| < 1024 | **Drawer.** `min(82%, 264px)`, dark chrome (`--ops-*`), scrim, dismissed by scrim tap / `Esc` / choosing a destination, scroll lock, 44px rows, safe-area padding. **An overlay, never a route** (register row 19, carried verbatim). |
| ≥ 1024 | **Persistent rail**, 224px (`w-56`, register row 17), same dark chrome, no opener anywhere. |

Contents, in order: brand (logo → business name → the literal word `OpenFrame`; an invented
mark is banned — register row 4) · the eight destinations with the sage active left border
(register row 16) · then the account block:

- the signed-in person's name and email
- **`Role · {role}`** — R-167: show the staffer their own role; it governs real gates and is
  never displayed today
- the GST view toggle (§4.4)
- **`Sign out`** (register row 14)

### 2.2 The leading slot — the answer to the twice-repeated regression

`LEARNINGS.md` §3.10 records the drawer losing its only opener when the header hosting it
was deleted, leaving no navigation and no sign-out below 768px. It happened again in the
rejected pass. The fix here is structural, not vigilance:

> **Every plane's identity band opens with a leading slot that the shell owns and fills.
> A region never renders it and therefore cannot delete it.**
>
> - stack depth 0, width < 1024 → **`☰`**, `aria-label="Open menu"`, `aria-expanded`,
>   `aria-controls="ops-nav-drawer"`, 44×44
> - stack depth > 0 → **`‹`** back, labelled for what it returns to
> - stack depth 0, width ≥ 1024 → empty (the rail is persistent; `← All projects` lives in
>   the record header instead)

Because the slot's content is derived from stack depth — which only the shell knows — there
is no state in which navigation is absent at narrow width. **This must be asserted in the
Playwright width matrix at 320 and 390 for every registered destination**, together with
"the drawer contains a control labelled `Sign out`". See §9.

### 2.3 The identity band — three slots, one rule

`[leading] [identity] [stepper?]` and nothing else. Height 48px (`--jobbar-phone-h`).

The band carries **no `⋯`**. Every plane's overflow lives in exactly one place: its
footer's `⋯`. Two overflow controls on one plane, meaning different things, is a coin-flip
for the operator, and at 320px the second one costs 44px the identity cannot spare.
(Departure from `LEARNINGS.md` §1.6 — see §10.2.)

Identity truncation ladder: **the code never truncates.** The subtitle does, and when the
subtitle is dropped its separator goes with it — a separator with nothing after it is
punctuation pointing at an absence.

Subtitle source order: `line.room` → `line.productName` → the job title. Never an empty
string after a separator.

### 2.4 The record plane's identity band is a short stack

Per §13.5, and measured: wrapped to phone width the desktop job bar took four rows (213px).
The record plane's band is:

```
row 1   ☰   OF-Q-10482 · Wattle Grove — Lot 14              (48px)
            Marchetti Constructions · Ana Bianchi
row 2   Now · Technical review · waiting on us · 3 days in this state
row 3   [ 2 lines are unpriced                            › ]   ← tappable
```

Row 2 is register row 58 verbatim: `Now · {stateLabel} · waiting on {x} · {n} days in this
state`. Row 3 is the blocked primary's reason, **rendered once** (R-19), as a tappable
sentence that filters the index to those lines; tapping again clears the filter. It is
**not** echoed in the footer — echoing it is what turned a 48px footer into three wrapped
rows.

The lifecycle is told exactly twice in the console: as this sentence, and as the ribbon at
the head of Progress. Nowhere else.

---

## 3. The record — screen by screen

### 3.1 `/record/:ref` — the record plane (depth 0)

Identity band per §2.4. Then the **planebar** (R-151): segmented, `role="tablist"`,
`aria-label="Record sections"`, two segments, each ≥44px, `flex: 1 1 0`:

```
[ Lines · 18 ]  [ Job ]
```

**Two segments, not three.** The editor is not a segment — it is pushed by a visible `Edit`
button and popped by back. A third `Edit` segment is dead whenever no line is selected and
permanently dead on an issued quote, and a dead segment is the "filter that always returns
zero" the recovered rules refuse. (Resolves `LEARNINGS.md` §6.2(a) toward v2's two-plane
answer while keeping ux-mock's route addressability — see §10.1.)

Switching segments is view state, not a route: it does not push history. Announce quietly to
assistive technology only; never a visible toast.

**Segment `Lines`** — the index zone, §3.2.
**Segment `Job`** — the push-row list, §3.3.

Footer (56px, `--footer-phone-h`): one full-width primary + `⋯`.

- primary: the server-declared primary from `actions[]` (register rows 60–62), e.g.
  `Issue quote`. Disabled when blocked — **visible and disabled, never hidden** (L7).
- `⋯` (`aria-label="More actions for this record"`) opens the action sheet: `Add a line` ·
  `Request clarification` · `Add a note` · `Copy a link to this record` ·
  `Refresh · updated 09:14`.

### 3.2 The index zone — the openings list

One folding `RowList`, one data contract, folding its own columns. Never a
`<DesktopTable>`/`<MobileCards>` pair.

Per row, at every width (nothing is hidden at any width — restack, never remove):

```
W04                                                   $1,840.00
AMJ67T Series Awning Window
1,200 × 900 mm  ·  ×2                                [needs review]
Bed 1  ·  composite · 3 joined units
! Glazing does not meet the requirement on this elevation.
```

- **Size is `height × width`, everywhere, in every phrase** (register row 87, I9).
- The code is the sage data face; the whole row is the target.
- State collapses to `ready` / `needs review`; **the word carries it**, colour is second
  (R-165 / P3 — greyscale must lose nothing).
- Review flags render as a list in warning ink (register row 83).
- `composite · {n} joined unit(s)`, ` — withdrawn from sale` (AC-84) and
  `configuration · {selectedVariantId}` render as recorded.
- An unpriced line reads **`not priced`** in the money cell, in the absence ramp
  (`--text-4`). **Never `$0`, never a dash** (L9, I8).

Selection is global: it survives a segment change and a plane change.

Last row, in editable states only: `+  Add a line` / `Opens the editor with an empty
configuration.` Outside the editable set it does not render (AC-81) — and the UI not
rendering it **is not the control**; the server gate is (AC-78a).

The zone's own footer states the **total, never the blocker**:

```
Goods (ex GST)        $48,220.00
Delivery              not priced — Zone 4 — Outer metro has no rate
Quote total           $48,220.00
estimate · ex GST · this account's setting
```

Delivery honesty (AC-85): `not priced — {zone} has no rate` when the zone resolved to
`unpriced_table`; `zone not resolved` when it did not resolve. Both distinct from `$0.00`.

### 3.3 The `Job` segment — a push-row list, not a stack of blocks (R-70)

This is what stops the rejected long column. Five rows, each a route:

| Row | Sub-line | Route |
|---|---|---|
| `Progress` | `{stateLabel} · waiting on {x} · {n} days` | `/record/:ref/job/progress` |
| `Payments` | `No payments recorded.` or `{n} recorded` | `…/job/payments` |
| `Files` | `{n} attached` or `Nothing is attached to this job.` | `…/job/files` |
| `History` | `{n} events` | `…/job/history` |
| `Notes` | `{n} on this job` or `No notes on this job yet.` | `…/job/notes` |

An absent sub-line renders in the absence ramp and **says what is not there** (L9) — never
a blank, never a `0`, never a dash. The row itself never disappears: these are
destinations, not counts.

Below the rows, the same totals panel as §3.2.

At ≥1024 these five rows become `<details>` disclosures in the canvas, open in place — growth
move 2. Same rows, same routes, same block components.

> ⚠ **Amended 2026-08-18:** superseded with move 2 (§1 note) — at ≥1024 the five rows do
> **not** become disclosures; they persist as a list and the routed block renders beside
> it (form owned by the reworked mock). Rows, routes and block components unchanged.

### 3.4 `/record/:ref/job/:block` — a job band (depth 1)

Identity band: `‹` back · the block name · `{ref} · {title}` as the subtitle. No footer
unless the block has a primary.

- **Progress** — the 6-cell phase ribbon (passed / current / future; the current cell
  carries a 2px underline, never colour alone; register rows 57–59), then the caption
  `Now · {stateLabel} · waiting on {x} · {n} days in this state`. **Not** a vertical node
  timeline of all 21 states — refused in three separate places across the salvage and in
  the live app's own design notes.
- **Payments** — `{kind} · {percent}% · {reference}` over `{money}` and `{status}`
  (register row 153). Empty: **`No payments recorded.`** plus, where an order exists,
  `Order no. {n} · appears on invoices` (register row 155).
- **Files** — filename, then size and scan state beneath it. Four facts stay in the row at
  every width. A real anchor **only when the scan is clean**; under a coarse pointer it
  opens in a new tab, because on iOS a PDF navigation leaves the SPA and destroys the plane
  stack (R-79). A pending or refused scan renders its words in the row, never JSON.
- **History** — newest first, `{sentence}` over `{author} · {when}`, first 8, then
  **`Show all {n} events →`** (register row 151).
- **Notes** — newest 6, `{kind} · {author} · {when}` over the body, 2px sage left border
  (register row 149). Empty state added (a repair — the legacy block has none):
  `No notes on this job yet.` / `Notes taken here stay on the job. To attach one to a line,
  open the line.` Composer beneath, `maxlength=500`.

### 3.5 `/record/:ref/line/:lineId` — the line plane (depth 1)

Its **own 48px identity band, and it is not the job bar** (§13.6). The job's bands belong
to the job plane, which is one tap away.

```
‹    W04 · Bed 1                     ‹  4/18  ›
```

> ⚠ **Amended 2026-08-18:** the band stepper is replaced by a **bottom-edge scroller**
> through the filtered set (owner-endorsed direction; form owned by the reworked mock).
> Everything below transfers to the scroller whole: the filtered set, replace-not-push
> (§10.3), disabled at the ends, position stated. See
> `docs/design/ops2-ionic-boundary.md` §1.7.

**The stepper (R-155)** is the reason a phone is a review device rather than a reader: it
moves through the **filtered** set — `visibleLines()`, i.e. whatever the index is currently
showing — without returning to the list. `‹` / `›` disabled at the ends; position printed
`{at+1}/{n}` in the data face; `role="group"`, `aria-label="Move through the lines"`.

**The stepper replaces the history entry; it does not push.** Moving 4 → 5 does not change
the plane, only its subject, so it is lateral movement inside a zone. Pushing it would make
Back walk the operator backwards through every line they reviewed instead of returning them
to the record. (Departure — §10.3.)

Body: config facts (product · size · quantity · frame system · glazing ·
`configuration · {variantId}` · line total with its GST label), then review flags as
warnings, then the composite block if any, then the line's notes and composer.

Facts reflow **label-over-value** at a narrow measure (R-69) — reflow, not truncation.

Footer: primary `Edit {code}` (editable states only; otherwise `Back to the record`), plus
`⋯` (`aria-label="More actions for this line"`) opening: `Split into units` ·
`Merge back to one` (when composite) · `Add a note to {code}` · `Copy a link to {code}` ·
`Delete {code}` (danger) — then a `This job` group carrying Progress / Payments / Files /
History, so the job's bands are reachable without going back.

**Delete** is the one confirmation in R1. It expands **upward from the footer, in place,
never a modal** (R-39):

```
Delete W04?
Its 3 units go with it. Notes stay.
[ Delete ]  [ Keep ]
```

For a non-composite line: `Its notes stay on the job.` This guards a misclick on a
destructive act; it is **not** a gate on disagreeing with the machine, which I1 forbids
(AC-1, AC-4). Deleting the last line is allowed and warned, never blocked (AC-99); the
empty quote is refused where it always was, at `issueQuote` (AC-100).

### 3.6 `/record/:ref/line/:lineId/edit` — the editor (depth 2)

Identity band: `‹` (`aria-label="Close the editor"`) · `{code} · Edit` · `{ref} · {title}`.

Body is `ItemForm`, **reused verbatim** (register row 95) — ops2 imports it from its current
home and does not fork it. The wrapper adjusts presentation only. Field order and copy
carried: `Item ID` (`maxlength=10`, uppercased; duplicate → `Item ID already exist`) ·
`Product` (with ` — withdrawn from sale` and ` — different frame system` suffixes) ·
dimensions **height first**, with the range hint · Options disclosures with the glazing
picker and ` · required` · `Note` (`maxlength=500`) · the caption
`Confirmed on technical review before any deposit. Supply only.`

A `<select>`'s min-content width is its longest option; it must be allowed to truncate, or
it pushes the plane wider than the frame at 390px. The full text stays in the popup.

**The read-back strip (R-159), pinned above the footer.** On the phone the editor covers the
list and the totals, so it carries the conclusion — and R1's conclusion is exactly what
AC-16/AC-19 require to move together:

```
This line        $1,840.00 →  $2,090.00
Quote total     $48,220.00 → $48,470.00
ex GST · updates as you change an option
```

Recomputed live from the same debounced (250ms) preview that produces the price, and from
the `quoteTotals` the server returns. `aria-live="polite"`. The previous value renders
struck through only while it differs. **The client never sums money itself** — both figures
come from the response.

This is the "did I just do something stupid" check, and on a phone it is the only thing
that makes an edit safe.

Footer: `Save line` (`Saving…`) primary + `Cancel`. `canSave` is price-preview presence,
duplicate code, and blocking issues only — **the undersize guard is gone** (AC-101,
register row 105).

**Undersize warns, never blocks** (AC-101, AC-2). It renders inline beneath the dimension
fields, does not take focus, is not in a `role="dialog"`/`alertdialog`, does not disable
Save, and needs no dismissal:

> `Height {n} mm is below this product's range ({min}–{max} mm). Often a typo — save anyway
> if it is right.`

Oversize is not blocked and does not start (AC-102). Coverage sentences never veto (AC-86).

Discard guard: **one** guard, owned by the editor, for all four routes out — `✕`, `Esc`,
`Cancel`, browser/OS back. `Discard changes? Discard / Keep editing` (register row 104), as
an inline strip, never a second modal.

---

## 4. Cross-cutting behaviour

### 4.1 Plane mechanics

- Every plane: `position:absolute; inset:0`, `display:flex; flex-direction:column`.
- Body: `flex:1 1 auto; overflow-y:auto; overscroll-behavior:contain; min-height:0`. **The
  body is the only thing that scrolls. The document never scrolls, in either axis** (R-12).
- Footer: `flex:none`, sticky **within the plane's flex column, never viewport-fixed**
  (R-152), ending `padding-bottom: calc(<pad> + var(--kb-inset) + var(--safe-bottom))`.
  `--kb-inset` is written from `visualViewport`; the safe-area inset belongs to whichever
  box is last in the plane.
- Push 240ms / pop 200ms, `cubic-bezier(.2,0,0,1)`. Under `prefers-reduced-motion` the
  slide is replaced by a cross-fade. **A root plane never animates in** — an entrance
  transform on a plane that has nowhere to arrive from is one interrupted animation away
  from sitting permanently off-frame. The stack clips regardless.
- `min-width: 0` on every flex and grid child in the shell. Grid and flex items default to
  their min-content width, and one wide child grows its container past the frame instead of
  scrolling inside it — the largest defect family in the salvage, and its symptom is the
  nastiest kind: the scroller reports nothing to scroll because the box already grew.

### 4.2 Focus and announcement

- Focus moves to the pushed plane's heading on **every plane push and route change**
  (`tabindex="-1"`, R-164), guarded against re-focusing on a repaint by comparing the route.
- The heading must **not** draw a focus ring — programmatic focus on a non-interactive
  element is treated as `:focus-visible` by Chromium and drew a black ring around the `<h1>`.
  Interactive elements keep their ring.
- Closing the editor returns focus to **one canonical originating control** — the row it was
  opened from. Never the document.
- **One live region for the whole console.** Not a toast system: no queue, no stacking, no
  dismissal. Two registers — an outcome is shown and announced; navigation (a line selected,
  a segment switched, a filter applied) is announced quietly and stays invisible. Clear then
  set on the next frame, or an identical repeated message is never re-read.
- `Esc` pops exactly one level per press: action sheet → overlay → drawer → the surface's
  own handler.

### 4.3 The four state shapes (R-161) — every fetch, no exceptions

Four **distinct pictures**, plus Retry. Loading is never failure, failure is never a
spinner, and both differ from an empty filter and from a gate.

| Shape | Rendering | R1 copy |
|---|---|---|
| Loading | a skeleton **of the shape that is coming**, layout reserved; `aria-busy`. Never a bare or full-viewport spinner. | — |
| Empty | dashed panel, in place, named in the filter's own words | `No lines on this project.` · `No lines match this filter.` / `The filter is "unpriced". Clear it to see all {n} lines.` · `No payments recorded.` · `No notes on this line yet.` |
| Error | a bordered card **in the zone that failed**, with the code and Retry | `That list could not be loaded.` / `The server answered {status}. Nothing has changed.` / `HTTP {status} · {method} {path}` |
| Gated | **its own shape, never the error shape** | (R2 owns the copy) |

Use `align-content: start` on every state grid. A state box taller than its rows stretches
them by default, which spreads "Nothing is selected." over 700px and reads as a broken
layout rather than an empty one.

A failed read of one zone is that zone's failure, not the frame's: navigation still works.

### 4.4 Money and GST (AC-79/80)

Primary figures are in the **project owner's** `price_gst_mode`, **always labelled**
(`ex GST` / `inc GST`), through `src/data/gst.ts` — one source. The reviewer's toggle lives
in the drawer/rail account block, is **view-only**, and changes nothing the customer sees;
the caption says so: `A view only. The customer's own quote is unchanged.`

A money figure never appears without its basis; **null is never `$0`** (I8). Every price is
derived, never typed. `estimate` / `issued` / `contract` is the caption on the value.

### 4.5 Writes — loud, at the control (I6)

`WriteState` renders **under the row or control that caused it** (L8), never in a header
strip a screen and a half away, and never as a toast — there is no toast system.

- AC-20/22: `Not saved — the connection dropped. Your values are still here.` + `Retry`.
  Entered values stay on screen; retry re-sends the same payload.
- AC-23: on a 409 `not_editable`, the sentence names the **real** cause and pairs the
  message with the control it demands:
  `This quote was issued while you were editing, so it can no longer be changed.` +
  `Reload this record`. Four legacy messages instruct a reload with no reload control
  existing (register row 71); every one gains its control here.
- A failed write reverts the control and states it in place (V13).
- `ACTION_ERRORS`' 13 mapped codes are carried verbatim; the ~11 that fall through keep
  `That action could not be completed.` `OpsApiError.missingOptions[]` is **printed in
  full**, never flattened — a price that refuses is correct behaviour and the console should
  say which number is missing (I7, R-66).
- **No optimistic UI, no polling.** A manual `Refresh` control and an `Updated 09:14` line
  (register row 26 is a repair). Polling would multiply audited reads.

### 4.6 Human authority (I1 / grill §3)

No blocking gate, no justification field, no acknowledgement checkbox, no second click
anywhere on the save path. Warnings never take focus, are never `role="dialog"` or
`alertdialog`, never disable the primary, never require dismissal (AC-2, AC-4). Blocked
actions stay **visible and disabled with their reason beside them** (L7) — never hidden,
never in a tooltip.

**No undo, no change history, no per-edit journal, no session snapshot.** The consultation
model is decide-then-move-on. The existing audit trail (entity · action · actor · time) is
untouched and is not change history.

### 4.7 Pointer, and the coarse axis

`data-pointer` is a **capability** axis independent of width: `--tap-min` (44px) is forced
on every control at **any** width under a coarse pointer (R-178) — including the stepper's
own buttons and the GST toggle. Long-press is forbidden; gesture is never the only route to
anything (R-158); the left 20px gutter belongs to the OS back gesture and no in-app gesture
may claim it. Drag handles are `pointer:fine` only.

> **Developer note, and it needs an explicit allowance:** arch §4.3's static purity check
> greps out `matchMedia` and `pointer:`/`hover:` media queries. `data-pointer` must be
> derived from `matchMedia("(pointer: coarse)")` in **one** place inside the shell. That is a
> capability query, not a device branch, and it is what §4.3 exists to permit rather than
> forbid. Name that single call site in the check's allowlist rather than dropping the axis —
> dropping it costs every coarse-pointer target rule above.

---

## 5. The growth ladder, concretely

### 768–1023 (tabletp)
One ground zone — the line when one is selected, the index otherwise. Its header carries the
leading slot, the identity, a visible **`Lines · {n} ▾`** summon control, the stepper, and
`⋯`. The index arrives as a left overlay list (`min(88%, 420px)`, dismissed by `Esc`, the
scrim, or choosing a line). The editor arrives as a right sheet (`min(88%, 520px)`) and
**carries no scrim**, deliberately, so the line stays legible beside it. Nav is still the
drawer. Nothing is hidden; the route decides what is on screen.

### 1024–1279 (compact)
Zones become simultaneous: `48 | fluid | 380`. **The rail yields, never the pane** (R-13) —
the index compresses to a 48px code strip (codes, plus a dot on any line needing review;
`title` carries code and room) precisely so the editor stays a column and the live totals
loop survives here. A coarse pointer gets a **taller row inside** the 48px strip, not a
wider strip. Verified: 1024 − 224 nav = 800 = 48 + 372 + 380.

### 1280–1679 (desktop) and ≥1680 (wide)
`264 | fluid | 400`, then `320 | fluid | 440`. Verified at 1440: 1440 − 224 = 1216 =
264 + 552 + 400. Density rises through the row tokens (`--row-scan` 32 / `--row-work` 44 /
`--row-line` 66), never through a different IA. Drag handles appear on fine pointers only.

At these widths the record grows a one-row header — `← All projects` · ref · title ·
customer on the left, `Updated 09:14 · Refresh` and the value on the right. Each cluster
**clips at its own boundary**: at a 1366 laptop an unclipped over-subscribed bar painted the
title over the lifecycle sentence and the job read `Wattletrnicing ▸ Technical review`.

The lifecycle sentence and the blocker row sit in their own band beneath it, unchanged in
content from the phone.

AC-14 holds: at 1440 the index (264) and the work canvas (552) are usable simultaneously,
and no primary column sits at a phone measure. R3 slots derivation into the work zone
without re-architecture.

---

## 6. Component reuse map

| Need | Component | New props / changes |
|---|---|---|
| Plane stack, planes, identity bands, planebar, back control, action footer, action sheet, drawer/rail, width-class + pointer + safe-area resolution, R-164 focus moves | `src/ops2/shell/` — **new**, and the only place these exist. Not exported. | ADR 0004's zone contract: a region declares zones + per-zone header/actions. |
| Destination declaration | `routes.tsx` zone declarations | Element type accepts zone declarations only — a page cannot be registered, so a long scroll is inexpressible. |
| Openings list, interim record list, files, history, notes, payments | **One** `RowList` (`layout/RowList.tsx`) folding its own columns by priority | `columns[]` with `priority`; the whole row is the target at every width. Never a table/card pair. |
| Line editor form | **`ItemForm`, reused verbatim** (register row 95) | Wrapper only: presentation adjustments live in `LineEditor.tsx`, never by copying the form. |
| Read-back strip | new, in `LineEditor.tsx` | Binds to the same debounced preview + `quoteTotals` as the save response. |
| Confirm in place | `ConfirmInline.tsx` | Expands upward from the footer. Used **only** for line delete in R1. |
| State shapes | `Loadable<T>` + four shape components | One per shape; `Retry` on error, always. |
| Write feedback | `WriteState` rendered at the control | No toast system exists and none is added. |
| Money | `src/data/gst.ts` | Single source; the view toggle is shell view-state. |
| Tokens | `src/ops2/styles/tokens.css` | Two layers: palette primitives, then semantic roles. **Only this file may contain a literal colour, radius, shadow, font size, spacing, easing or duration.** A visual pass rebinds the semantic layer. |

The console is **light on purpose**. Its one dark surface is the chrome (`--ops-*`), which
is a surface, not a theme. Never declare a colour whose only definition sits inside a media
or `[data-theme]` block.

---

## 7. Copy carried verbatim (AC-39)

Present exactly as recorded. Sign-in (register rows 5–13, `NON-PROD`): `Internal console —
staff sign-in` · `Work email` · `Send code` · `Sending…` · `Dev mode — code is {code}` ·
`Sign in` · `Verifying…` · `← Change email` · `Something went wrong.` · `Invalid code, or
this email isn't authorised for the ops console.` · `Authorised staff only. Access is
logged.` Shell: `OpenFrame` · `Sign out` · `← All projects` · `{publicRef} · {title}` ·
`Now · {stateLabel} · waiting on {x} · {n} days in this state`. Lines: `{n} lines` · `No
lines on this project.` · `configuration · {selectedVariantId}` · `composite · {n} joined
unit(s)` · `frame system · {name}` · `mixed frame systems · A + B — confirm these couple` ·
`ready` · `needs review`. Editor: `Item ID already exist` · `— withdrawn from sale` · `—
different frame system` · `· required` · ` · {unit} ea` · `Confirmed on technical review
before any deposit. Supply only.` · `Cancel` · `Save line` · `Saving…` · `Discard changes?
Discard / Keep editing` · `I checked and resolved: {reasons joined by "; "}` · the
configuration select's four states. Composites: `Spec: as the opening` · `Spec: {n} changed
— {key} {value or "none"}` · `not priced` · `Remove unit {i}? Remove / Keep` · `Unit {i} of
{code}. The opening is {n} mm {high|wide} — every unit must match it.` · `+ Add unit` ·
`Maximum {policy.maxSegments} units` · the three coverage sentences · `Side by side` · `One
above another` · `Split into units` · `Applying…` · `Merge back to one` · `Merging…`.
Blocks: `{kind} · {author} · {when}` · `Show all {n} events →` · `{kind} · {percent}% ·
{reference}` · `No payments recorded.` · `Order no. {n} · appears on invoices`. Actions:
`That action could not be completed.` plus the 13 mapped `ACTION_ERRORS` codes.

**Not carried:** register row 74's `Viewing an issued revision — read-only. [Back to the
live draft]` and row 72's `Live draft / R3 / R2 / R1` — revisions are removed from the
product (register appendix 286). AC-81 requires the real cause instead:

> `This quote was issued on {date}, so it is read-only. Nothing on it can be changed.`

Row 73's hard-coded `editing elsewhere` is not carried: nothing publishes presence, and a
warning that never varies trains people to ignore warnings (D16).

New copy introduced by this spec — all of it absence, blocker or repair copy the legacy
console does not have:
`{n} lines are unpriced` · `A quote with no lines cannot be issued.` ·
`not priced — {zone} has no rate` · `zone not resolved` ·
`No notes on this job yet.` / `Notes taken here stay on the job. To attach one to a line,
open the line.` · `No notes on this line yet.` / `A note added here is stored against
{code} and shows against it thereafter.` · `No lines match this filter.` ·
`Not saved — the connection dropped. Your values are still here.` ·
`This quote was issued while you were editing, so it can no longer be changed.` ·
`Height {n} mm is below this product's range ({min}–{max} mm). Often a typo — save anyway if
it is right.` · `Delete {code}?` / `Its {n} units go with it. Notes stay.` ·
`Opens the editor with an empty configuration.` · `A view only. The customer's own quote is
unchanged.` · `Role · {role}`.

---

## 8. Long content, and the cases that break layouts

- 18+ lines: the index body scrolls; the identity band, planebar and footer do not.
- A 40-character product name and a 30-character room: the row wraps its product line; the
  code and money never wrap.
- The identity at 320 with a stepper: verified — `‹`(44) + identity(127) + stepper(127) fits
  320 with the room label intact and unclipped.
- A `<select>` whose longest option is `AMJ150T Series Lift-Sliding Door`: truncates in the
  field, full text in the popup.
- A composite with 4 units and a mixed frame system: units nest; the coverage sentence and
  the mixed-frame sentence render as warnings, never vetoes.
- A blocker sentence long enough to wrap: the blocker row wraps to two lines; the footer
  does not, because the reason is never echoed there.
- The Fold unfolding mid-edit: the width class changes, zones re-present, and **no
  in-progress edit, focus or scroll position is lost** (AC-12) — field state lives in
  `useRecord`'s editing slice keyed by field identity, never in the leaf that is re-parented.

---

## 9. What the width matrix must assert

Extends `scripts/tests/web/ops2-shell.spec.ts`, at **320, 375, 390, 768, 1024, 1440**, for
every registered destination:

1. **Exactly one plane is visible below 768.**
2. The scroll container is `plane-body`; **the document never scrolls, in either axis**.
3. **At stack depth 0 below 1024, a control with `aria-label="Open menu"` exists and is
   ≥44×44; activating it reveals a drawer containing a control labelled `Sign out`.**
   *(This assertion is the non-negotiable. It must fail loudly if anyone deletes the
   container that hosts the opener, which has now happened twice.)*
4. At stack depth > 0, a back control exists and returns exactly one level.
5. The action footer carries the destination's primary when one exists, and a blocked
   primary is present-and-disabled with its reason rendered somewhere on the plane.
6. Focus lands on the pushed plane's heading after a push, and returns to the originating
   control after the editor closes.
7. Every interactive control is ≥44px in its constrained axis under a coarse pointer.
8. Nothing exceeds its console's width: for every element, `right ≤ container.right`.
9. Mid-task resize across every change point with the editor open and dirty: no lost value,
   no lost focus, no reset scroll.
10. The stepper moves through the filtered set and does **not** add history entries; back
    from any line returns to the record.

---

## 10. Departures from `LEARNINGS.md`, each with its reasoning

`LEARNINGS.md` is the only surviving record of work iterated with the owner, so every
departure is stated rather than silently taken.

**10.1 Two planebar segments, not three (`LEARNINGS.md` §1.2, §6.2(a)).** The salvage
records ux-mock's three segments (`Lines` / `Work` / `Edit`) and v2's later two, and
explicitly leaves the conflict unresolved. I resolve it to two. An `Edit` segment is dead
whenever no line is selected and permanently dead on an issued quote, and the same rule set
refuses dead controls elsewhere (R-86: a filter that always returns zero is the dead `rule`
chip repeated). ux-mock's own workaround — announcing "Choose a line first." — is evidence
of the same smell. I keep ux-mock's routing discipline (the editor is a real route and a
real history entry, which v2 lacked entirely) and take v2's IA, so nothing is lost.

**10.2 No `⋯` in the identity band (`LEARNINGS.md` §1.6).** §13.6 puts `⋯` in the line
plane's band. At 320 with a 44px back control and a 127px stepper it leaves 83px for the
identity, which loses the room label. Since the band's `⋯` contents (the job's other bands)
are also reachable from the footer's `⋯` and from the `Job` segment one pop away, it is a
convenience, not the only route — so it moves to the footer's sheet, where it costs nothing.
Result at 320: 127px identity, `W04 · Bed 1` unclipped, verified in the mock.

**10.3 The stepper replaces rather than pushes history.** `LEARNINGS.md` §1.3 records R-148
as "every push is a real history entry", and R-155 gives the stepper. The salvage does not
say which the stepper is. Treating it as a push means reviewing 14 lines leaves 14 back
presses between the operator and the record. It is lateral movement within a zone, not a
plane change, so it replaces. The route still changes, so deep links and refresh are
unaffected.

**10.4 The stepper stays in the band on short viewports.** `LEARNINGS.md` §1.6 records
"R-17.2 — below 900px of viewport height the stepper moves into `⋯`". Every phone in the
target set is shorter than 900px, so honouring that literally would remove the stepper from
100% of phones — which contradicts R-155's own stated purpose ("the difference between
reviewing on a phone and merely reading on one"). I read the citation as belonging to the
desktop/laptop canvas footer, not the phone identity band, and keep the stepper at every
phone height. This is the one place I believe the salvage is internally inconsistent.

**10.5 Navigation is a drawer below 1024 and a 224px rail above it.** The salvage records a
genuine unresolved three-way disagreement (spec: 48px icon rail; ux-mock: 48px top bar with
a four-step collapse ladder and no rail at any width; v2: 224px dark sidebar). I take v2's,
which is later and whose feel the owner endorsed, and which register row 17 already
describes as the shipped shape. It satisfies C6 because there is exactly one navigation
surface presented two ways — the frame obeying the same growth law as the record — and it
avoids building the collapse ladder that only exists because a top bar cannot hold eight
destinations, a problem `UX-SPEC.md`:71 predicted and ux-mock then had to solve. It also
returns 48px of vertical to the phone, which §13.6's measured failure identifies as the
scarcest budget in the console.

**10.6 Width class is an attribute on the console container, not on `<html>`.**
`LEARNINGS.md` §1.9 puts it on `<html>`. Container scoping is strictly more correct under
C1 (the layout must respond to the space actually given, and a pane must read its own
width), it is what arch §4.1 already requires, and it is what lets seven widths be
simultaneously correct in the mock.

**10.7 The record plane's `Job` scope is a push-row list of five destinations.** This is
R-70 applied to R1's content rather than to ux-mock's seven verdict panels. It is the
mechanism that makes a long scroll inexpressible at job scope, which is the specific failure
the last pass was rejected for.

---

## 11. Decisions needed

**None.** No question here is the owner's to answer — every open point was either settled in
`GRILL-CONCLUSIONS.md`, resolvable against the code and the register, or is a design
judgement that is mine to make and is recorded in §10 for him to overrule on sight of the
mock.

The one thing that needs a decision from someone other than the owner is a **developer**
matter, not a gate: §4.7's static-check allowlist for the single `matchMedia("(pointer:
coarse)")` call site.
