# ops2 project record — testing feedback, grill conclusions

Stage 0 of the feature pipeline. The owner tested the ops2 project record in a
responsive **single-column / mobile-like** viewport and reported eight defects.
This document is the grilled output: the actor, each defect's *measured* root
cause, and the decisions the owner made. It feeds the spec verbatim.

Branch: `fix/ops2-testing-feedback`, off `main` (`c30d2f44`).
Reproduction data: project `p_fb` / `OF-Q-20013` (`.codex-tmp/fb-seed.sql`),
five lines including **W02 = 3500 wide × 700 high**, one unpriced, three flagged.

---

## Actors and needs

**Staff** (`CONTEXT.md` §Actors) — an ops-console operator working for OpenFrame,
here in the **Estimator persona**: the person auditing the platform's
recommendations at the human review gate. Today performed by an owner.

Their need, in the owner's own framing:

> See which lines still need me, get to only those in one tap, and never be
> told something is wrong in a way I can miss.

Six of the eight defects are that need failing. No new or sharpened actor —
nothing here changes `CONTEXT.md`.

---

## The defects, with root causes established by measurement

Every cause below was reproduced, not inferred. File:line references are exact;
**do not re-derive them.**

### 1 — hover erases the leading edge on the record's line list

`.rl-row[data-flagged="true"]` paints its inset shadow on the `<li>`
([record.css:265](../../src/ops2/styles/record.css)), while `.rl-open:hover`
paints a background on the `<button>` that fills that li
([record.css:290](../../src/ops2/styles/record.css)). A child's background
covers a parent's inset shadow, so hovering erases the flag.

**The queue already hit this and fixed it**, with a comment explaining it —
[projects.css:376-384](../../src/ops2/styles/projects.css). The fix was never
carried to the record. `.rl-row[data-selected] .rl-open`
([record.css:534](../../src/ops2/styles/record.css)) is the correct pattern,
already present two rules further down.

Owner's question: *"are we reusing components here at all???"* — no. Four row
surfaces exist and share nothing:

| surface | component | width |
|---|---|---|
| queue cards | `ProjectCards` ([rows.tsx:113](../../src/ops2/projects/rows.tsx)) | phone |
| queue table | `ProjectTable` ([rows.tsx:173](../../src/ops2/projects/rows.tsx)) | desk |
| record lines | `LineRow` ([lines.tsx:40](../../src/ops2/projects/lines.tsx)) | both |
| line units | `.lp-unit` (line.css) | both |

**DECISION (owner, Q1/Q13):** one shared row component **and** one shared list
container, covering the three *list* surfaces. The owner's definition: "the
component is the same, the content within it differ", and he expects other ops2
areas to use it too. The desk `<table>` stays a table for now — column headers
and row/column association are a different thing — but he stated a preference
for a single-component solution eventually.

Precedent for the CSS half already exists:
[record.css:275](../../src/ops2/styles/record.css) shares nine declarations
between `.rl-open` and `.lp-unit__open`.

### 2 — the record's header sits 16px lower than every other surface

Measured at 900px, single column:

| surface | band top | back | `<h1>` |
|---|---|---|---|
| Projects | −16 | — | 0 |
| **Project record** | **0** | **17** | **37** |
| Line detail | −16 | 1 | 21 |

`.ops2-page__band` is pulled up by `margin-top: calc(-1 * var(--ops2-band-top))`
so the white bleeds under the status bar
([projects.css:69-82](../../src/ops2/styles/projects.css)). The record is the
only surface passing `bandPinned`, which adds
`position: sticky; top: 0` ([record.css:136](../../src/ops2/styles/record.css)).
Sticky clamps the band to 0, **cancelling the bleed** and pushing every child
down by exactly that inset.

Second symptom, same line: `bandPinned={!!record}`
([ProjectRecordPage.tsx:222](../../src/ops2/projects/ProjectRecordPage.tsx)) is
false while loading, so the band **jumps down 16px when the data lands**.

**Fix:** the sticky offset must equal the band's own negative pull —
`top: calc(-1 * var(--ops2-band-top))`. One line. Pin it with a test that
asserts the band's rest position is identical pinned and unpinned.

### 3 + 4 — the tab rail and the warning area

These are one defect. The owner's words:

> the tabs should follow the established in Projects design pattern: tabs sit on
> rail that immediately has a different background colour. At the moment the
> darker background starts only after the error label.
>
> warning labels/area is not grabbing attention, and everything is compressed
> together.

**The approved mock already specifies this and the implementation dropped it.**
Mock: `docs/mocks/ops2-r1-ionic-src/src/` on branch `design/ops2-planning`
(worktree `E:\Projects\amj-ops-planning`), `.filterrow` in `ops2-record.css:51`.

| mock `.filterrow` | shipped `.rec-attention` ([record.css:143](../../src/ops2/styles/record.css)) |
|---|---|
| `background: var(--ops-warn-tint)` — full-bleed tinted band | `background: none` |
| `min-height: 40px` | none |
| `padding: 6px 14px` | `padding: xs 0` — no inline padding |
| `border-bottom: 1px solid` — it closes the header | `border-top` — reads as attached to the tabs |
| `.fr-act` bold 700, **underlined**, ink | `__act` medium, no underline, brand link |

The missing tint *is* the "different background colour" — with it the ground
changes immediately under the tab rail; without it the band's white runs on
through the filter row. The missing floor, inline padding and underline are the
"not grabbing attention / compressed together".

ops2's equivalent of `--ops-warn-tint` is `--ds-color-warning-subtle`
(`--theme-warning-50`, `#fdf9f0`) — [tokens.css:62](../../src/ops2/styles/tokens.css).

**DECISION (owner, Q10/Q14):** restore the mock. Explicitly rejected: making the
filter a third tab ("filter is not a tab — contextually that would result into
Project being an ugly swan"), and relocating the band between the rail and the
first card ("squeezing attention band in between the tabs and first card is not
a solution"). The row stays where the mock puts it; it gets the mock's weight.

### 5 — no filter for "lines requiring attention"

The filter exists but is invisible (see above) and narrows to unpriced only:
`visibleLines` filters `lineTotal == null`
([record.ts:497](../../src/ops2/projects/record.ts)), and the control only
renders when `unpriced > 0` — `attentionFor` gives the review blocker
`action: null` ([record.ts:482-487](../../src/ops2/projects/record.ts)).

In the reproduction project three lines are flagged `needs review` and
unreachable by any filter.

**DECISION (owner, Q4):** "everything requiring attention". The predicate becomes
`needsReview(line) || line.lineTotal == null` — `needsReview`
([record.ts:570](../../src/ops2/projects/record.ts)) is already the exact
predicate painting the row's leading edge and its badge, so the filter shows
precisely the rows the list marks. One meaning of "attention" per surface.

**This diverges from the mock**, whose filter is unpriced-only, and the owner
authorised the divergence. Consequence for the PM: the row's copy must change
with it — "2 lines have no rate" cannot label a set that also contains flagged
lines, and `AttentionRow`'s filter-on text ("Showing the N lines with no rate")
has the same problem.

### 6 — the disabled CTA is drawn in error red

[record.css:52-57](../../src/ops2/styles/record.css):

```css
.rec-cta__primary.button-disabled {
  --color: var(--ds-color-error-text);
  border: 1px solid var(--ds-color-error);
}
```

Origin: acceptance criterion **P1-AC-39**
([docs/specs/ops2-record-correction.md:448](ops2-record-correction.md)) says the
primary is shown disabled "with the server's own reason on screen adjacent to
it, **drawn as an error** rather than as a note". The criterion colours *the
reason*. The implementation coloured *the button*. There is no record-page mock
in `docs/mocks/` and no design doc specifying a disabled state — the treatment
was invented at the stylesheet (commit `39ad405b`).

No practice supports it: Material 3 disables by opacity on the neutral surface,
Apple HIG dims, Ionic's own default is `opacity: .5`. Red is reserved for
destructive and error; a disabled control is neither.

**DECISION (owner, Q5):** "UX/UI question. Not red, that's for sure." Exact
treatment is the ui-designer's to settle. The real problem the red was solving
is genuine and must not regress: Ionic's disabled solid button collapses to a
flat grey wash that reads as a line of text in a toolbar, at the moment the
reader most needs to see the action exists and is refused. Keep the button
shape; drop the error semantics. The refusal *sentence* (`.rec-refusal`) keeps
the error treatment P1-AC-39 actually asked for.

### 7 — the width dimension is cut in half on a wide opening

Reproduced with W02 (3500 × 700). `Elevation` emits a "not to scale" break
symbol whenever `wMm / hMm > 2.4`
([Elevation.tsx:131](../../src/components/quote-project/Elevation.tsx)), and it
is painted **after** the number
([Elevation.tsx:170-181](../../src/components/quote-project/Elevation.tsx)):

```
<text x="175" y="87.24">3500</text>
<g class="elev-break"><rect y="83.24" height="14" fill="var(--paper)"/>…</g>
```

The glyphs span y 78.6–87.2; the rect covers 83.2–97.2 in paper colour. That is
the lower half of every digit, erased. Not a height or fitting problem.

It shows at **every** width in ops2 because the rules that gate it live in the
customer theme, which ops2 deliberately does not load
([theme.css:904-907](../../src/styles/theme.css)):

```css
svg[data-elevation] .elev-break { display: none; }
@media (max-width: 767px) { svg[data-elevation][data-wide="1"] .elev-break { display: block; } }
```

`record.css:14-32` already ports two of these companion rules (`--paper`,
`.elev-dim`) and missed these two.

**DECISION (owner, Q11):** "fix both". Fix the paint order in `Elevation.tsx` —
emit the break group *before* the width text, so the number's existing
`paint-order: stroke` halo punches through it — which fixes the customer site
too (it has the same bug below 767px). Then port the two companion rules into
ops2 so it shows the break under the same conditions the customer site does.

Out of scope: collapsing the double gate (the component computes `wide`, the CSS
re-gates on viewport). That changes what the customer site draws at desktop and
is not one of the eight.

### 8 — "Why this product" is not clickable and has no chevron

By design, currently: `panelCopy` returns `door: null` for `unresolved`,
`unrecorded` and `human` kinds — only estimator recommendations get a door
([whyCopy.ts:339-385](../../src/ops2/projects/whyCopy.ts)), per WHY-AC-41 ("a
panel with no detail has no control at all"). `WhyDetail` renders only
`kind === "recommendation"`
([WhyDetail.tsx:35](../../src/ops2/projects/WhyDetail.tsx)).

Established fact the PM needs: for the three no-door kinds the API returns only
`current` (the line's own figures), plus `units` on a human-split composite —
[src/data/rationale.ts:102-123](../../src/data/rationale.ts). There is no
requirement and there are no candidates.

**DECISION (owner, Q7/Q12/Q15):** the door is always present — "for consistency
and less 'what-if' scenarios in the code". The detail view **retains its
structure** (target / current values / alternative products) and fills each
block with whatever data is usable; where data is not available it **states that
fact**. WHY-AC-41 is superseded.

**Nothing new is fetched.** The owner: "nothing new from the current
implementation." He noted that AI learnings may eventually suggest alternatives
for an opening — that is a separate ticket with its own correctness questions
(what makes a suggestion trustworthy enough to print beside a recorded one), not
part of this fix.

Also in scope: the record's desk canvas passes `why={null}`
([ProjectRecordPage.tsx:433](../../src/ops2/projects/ProjectRecordPage.tsx)) so
the panel does not exist there at all. **DECISION (owner, Q8):** wire it; its
door pushes to that line's `/why` address, as from the line page.

---

## Scope boundaries

- **Tested single-column only.** The owner: "everything was tested on mobile
  only. Desktop — no feedback yet." Defect 2 is fixed at the root and must be
  verified at both widths, but no desk-width layout change is requested.
- **The queue's desk `<table>` stays a table.**
- **Learnings-sourced alternatives are out**, and so is any new endpoint or
  query. Defect 8 is a rendering change over data that already arrives.
- **The customer site is touched once**, deliberately: the `Elevation` paint
  order. That is the root-cause location and fixing it there fixes both
  consoles.
- No schema change, no migration.
