# ops2 project record — grill conclusions

**Date:** 2026-08-23 · **Stage:** pipeline stage 0 (grill), complete
**Input to:** product-manager (spec), then architect (design)
**Supersedes:** the record surface shipped in `36a1a334`…`39ff26ee`, which was built
without reading the mock's line row at all. See §1.

---

## 1. Why this exists — the failure being corrected

The record shipped on 2026-08-23 and the owner rejected it against the mock he had
already provided. His words: *"I thought that functional wireframe/mock is something
that can't be clearer, and yet the delivery is failing beyond acceptance."*

**Root cause, stated plainly so the same move is not repeated.** The orchestrator read
`mocks/ops2-r1-ionic-src/src/pages/RecordPage.tsx` — the page's *header* assembly — and
never opened `pieces.tsx` or `LineBody.tsx`, which are the files that define what a line
IS. It then decided the whole of `src/components/quote-project/` was unusable in ops2
because *some* of it is bound to the customer site's Tailwind, without checking file by
file. `Elevation.tsx` imports exactly one module (`src/data/catalogue`), is pure SVG, and
its own header says it exists to replace a generic pictogram. It was importable the entire
time.

Measured gap between the mock and what shipped:

| Mock | Shipped |
|---|---|
| `<Elevation>` in `slot="start"` — the opening drawn to true proportion | nothing |
| Ref, customer and total all inside the header toolbars | ref in header; title/customer/state in the content below it |
| `BlockerRow` — "N lines have no rate · **show only these**" | no filter of any kind |
| One `needs review` badge per row | every parser reason rendered as its own chip |
| Mobile: a line opens **its own page** | an in-row accordion |
| No room/note in the row (500-char free-text field) | room in the row |
| No quantity (retired) | `×N` in the row |
| No "so far" caption anywhere | invented by the orchestrator |

**"so far" was not from the mock and not from the owner.** It was invented as a caption
for a sum containing unpriced lines. It goes.

## 2. THE SOURCE OF TRUTH, and how to read it

`E:/Projects/amj-ops-planning/docs/mocks/ops2-r1-ionic-src/src/` — the mock is a running
Ionic app, not a picture. **Read these files before writing anything:**

- `pages/RecordPage.tsx` — the surface's assembly, both widths, and the reasoning
  comments on every decision (D3, D5, the leading-slot trade).
- `pieces.tsx` — `LineList`, `RecordSummaryBar`, `StateRow`, `BlockerRow`, `Totals`,
  `RecordNavBar`, `ProjectBlocks`. **This is the file that was skipped.**
- `LineBody.tsx`, `Plate.tsx`, `elevation.tsx` — the line's own surface and its drawing.
- `chrome.tsx` — `HeaderCta`, `ActionFab`, and which variant carries which.
- `ops2-r1-ionic.html` (built) if a rendered view is wanted.

The mock's comments record decisions with their evidence — e.g. why the customer's note
is NOT in the row (`quote_line.room_label` is free text bounded at 500 characters, labelled
"Note (optional)" to the customer). **Those reasons are inherited, not re-litigated.**

## 3. What ops2 already has, and must keep

Settled earlier in this effort and NOT reopened by this grill:

- The white band: title row + tab row, two `ion-toolbar`s at the desk, the band's two
  lines on the phone. Tabs are unboxed labels with a sage indicator, `aria-pressed`
  buttons rather than `role="tablist"`.
- `chrome/SidePanel.tsx` — one panel, bottom sheet on the phone, right-hand slide-out at
  the desk, at the site's own values (`min(88vw, 520px)`, 300ms in / 200ms out, ink 80%
  scrim + 3px blur).
- **NO GST anywhere on this console.** Owner: *"not a customer preference-driven site, an
  ops system default approach that matters."*
- Actions come from `worker/lib/ops-actions.ts`; the CTA reads `issuableNow` and never
  re-derives the gate. A human may be blocked, and the reason is shown.
- Unpriced is never `$0`; a partial sum is never called a total.

## 4. Actors and needs

Feeds the spec verbatim.

**Staff — an ops-console operator reviewing a quote before it is issued** (`CONTEXT.md`).
Works down a list of openings deciding whether each is right. Needs, in the owner's own
framing of the MVP: to reach **"Why this product?"** — a question legacy ops cannot answer
at all, and the reason this console is being built. To get there they need, per line: to
SEE the opening (shape, arrangement, opening direction — not a category glyph), its code,
its product, its size, its money, and whether it is flagged. Then to open it and read the
spec, the units of a composite, and the recommendation's reasoning.

They also need to find the lines that need them: a list of 18 openings with 2 unpriced is
a scanning problem, and the mock answers it with a filter rather than with per-row noise.

**Customer** — not served by this surface. The record is ops-only.

## 5. Settled decisions

| # | Decision |
|---|---|
| **R1** | **Every line carries its ELEVATION** — `src/components/quote-project/Elevation.tsx`, size `xs`, square, in the row's leading slot. Not a family pictogram, not an icon: the opening drawn to true proportion with its real panel arrangement and opening symbols. It imports only `src/data/catalogue`, so it is directly importable into ops2. |
| **R2** | **ops2 must hydrate the Sanity catalogue at boot.** `src/ops2/main.tsx` deliberately does not, and `Elevation` needs `getProductBySlug`. This is a boot change with a stated reason, not an incidental one. |
| **R3** | **Identity lives in the white header, whole.** Project NAME first — it is the project's name, not its ID — then the reference, then the customer. Not split between the header and the content. The total sits at the header's trailing edge. |
| **R4** | **An attention filter, from the mock's `BlockerRow`.** It names the leading blocker and offers to show only those lines; toggling it filters the list. `+N more` when there are others. When nothing blocks, it says so. |
| **R5** | **One `needs review` badge per row.** The parser's individual reasons — glazing out of range, material substitution — live on the line's own surface, never in the list. The list stays scannable. |
| **R6** | **A line opens its OWN PAGE.** No accordion, at any width. The page carries composite details, and is where **Edit** and **"Why this product?"** will live. Owner, verbatim: *"tapping on the line will lead to a new view details screen with composite details. Edit, 'Why this product?' will then be accessible from here."* |
| **R7** | **The desk gets the mock's rail + canvas** — the list on the left, the selected line reviewed on the right. **With two exclusions the owner named:** (a) **NO line filmstrip.** The mock's `LineScroller` deck mirrors the rail and is *"silly"*; it is not built. (b) **NO full-width action button** at the foot of the canvas. Actions on a line are reached through the right-hand slide-out panel — the one `chrome/SidePanel.tsx` already provides — and the control that opens it must not be a full-width bar. |
| **R8** | **The row's content is the mock's, exactly:** elevation · code (mono) · product name · `height × width mm` · joined-unit count when composite · money at the end · `needs review` badge when flagged. **No room/note** (a 500-char free-text field). **No quantity** (retired — the unit count is `qtyPerParent`, a different fact). |
| **R9** | **"so far" is deleted.** A sum with unpriced lines still needs to say it is not final; it does so in the mock's own vocabulary, not an invented caption. |

## 6. Explicitly out of scope for this correction

- The Project tab's contents (progress, payments, files) — still fenced out by the owner.
- Issuing as a flow. The CTA and its gate stay as built.
- Filling out the `⋯` menu.
- Anything on the Projects queue, which the owner has accepted.

## 7. Open questions for the product-manager to raise, not to assume

1. **Does the line page replace the record in the history, or push onto it?** The record
   already pops rather than pushes (`OpsPage`'s back control). A third level needs the same
   discipline stated.
2. **What does the line page show for a NON-composite line?** The mock's `LineBody` assumes
   a line worth a page; a simple awning with three options may not fill one.
3. **What happens to the canvas when the filter empties the rail?**
4. **Does the elevation appear on the line page as well as the row**, and at what size —
   `Plate.tsx` in the mock suggests yes and larger.
