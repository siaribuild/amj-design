# ops2 project record — CORRECTION

**Date:** 2026-08-23 · **Stage:** pipeline stage 1 (spec) · **Revision 2** — owner's
rulings on all nine decisions folded in. **Decisions needed: none.**
**Grill input:** `docs/specs/ops2-record-grill-conclusions.md` (2026-08-23, complete).
R1–R9 are binding and are not re-opened here; §7's open questions are all now answered
below and marked where they landed.
**Corrects:** the record surface shipped in `36a1a334`…`39ff26ee`.
**Source of truth:** `E:/Projects/amj-ops-planning/docs/mocks/ops2-r1-ionic-src/src/` —
a running Ionic app, not a picture. Every criterion cites the mock file and line, or the
grill decision, it comes from.

---

## 1. The problem, in the owner's terms

> *"I thought that functional wireframe/mock is something that can't be clearer, and yet
> the delivery is failing beyond acceptance."*

A functional mock was supplied. The build read the mock's page assembly
(`pages/RecordPage.tsx`) and never opened `pieces.tsx` or `LineBody.tsx` — the two files
that define what a line **is**. What shipped is therefore a different surface wearing the
same route: text rows with an accordion, no drawings, no way to find the lines that need
attention, and identity split between the header and the page body. The elevation drawing
— the element the owner rates highest in the product — was left out on the reasoning that
the customer site's components were unusable in ops2, which was never checked file by
file. `src/components/quote-project/Elevation.tsx` imports exactly one module
(`src/data/catalogue`), is pure SVG, and was importable the entire time.

### What is being corrected, measured

| The mock says | What shipped | Corrected by |
|---|---|---|
| `<Elevation>` in the row's leading slot (`pieces.tsx:270-273`) | nothing | P1-AC-1 … P1-AC-9 |
| name → ref → customer → total, all in the header (`pieces.tsx:81-149`) | ref in header; name/customer/state in the body | P1-AC-10 … P1-AC-14 |
| `BlockerRow` — names the blocker, filters the list (`pieces.tsx:200-230`) | no filter of any kind | P1-AC-15 … P1-AC-21 |
| one `needs review` badge per row (`pieces.tsx:302`) | every parser reason as its own chip | P1-AC-22, P1-AC-23 |
| a line opens its own page (`RecordPage.tsx:73-76`) | an in-row accordion | P1-AC-24 … P1-AC-31 |
| row = elevation · code · product · size · units · money · badge (`pieces.tsx:266-304`) | code · product · money · room · size · ×qty · every flag | P1-AC-32 … P1-AC-35 |
| no "so far" anywhere | invented as a caption | P1-AC-36 … P1-AC-40 |
| desk = rail + canvas (`RecordPage.tsx:228-274`) | one column at every width | Phase 2 |

---

## 2. Two phases, and what each one is

The owner's ruling, and his standing directive to break multi-area work into deployable
pieces:

- **PHASE 1 — the record and the line page, ONE COLUMN AT EVERY WIDTH.** It answers every
  rejected point and ships alone. At desk width it renders the same single column it
  renders on a phone; a row opens the line page at **every** width. Phase 1's acceptance
  criteria (`P1-*`) stand on their own — nothing in them depends on phase 2 existing.
- **PHASE 2 — the desk's rail + canvas.** Section G (`P2-*`), with the owner's two named
  exclusions built in from the start: no line filmstrip, no full-width action bar. Phase 2
  changes how a line is *reached* at desk width and nothing else about what the surface
  says.

A criterion that phase 2 supersedes at desk width says so explicitly (P1-AC-24 → P2-AC-2).
Nothing else is superseded.

---

## 3. Scope

### In scope — phase 1

1. The elevation drawing on every row, at every width, on quote records and accepted order
   records alike (R1).
2. Carrying the fields the endpoint **already sends** through ops2's record parser —
   `productSlug`, `compositeAxis`, and each segment's `productSlug` and `qtyPerParent` —
   which the parser currently drops (P1-AC-7).
3. Forwarding `productSlug` on the accepted-order line DTO and its segments, which the
   endpoint does **not** currently send (P1-AC-8).
4. Hydrating the Sanity catalogue at ops2 boot, which `Elevation` makes load-bearing
   rather than incidental (R2, P1-AC-5, P1-AC-9).
5. The record header carrying identity whole, with the project total at its trailing edge
   (R3).
6. The attention filter — the mock's `BlockerRow` (R4).
7. One `needs review` badge per row; the parser's individual reasons move to the line's own
   page (R5).
8. The line page: its route, its back discipline, and its read-only body (R6).
9. The row's content, exactly as R8 states it.
10. Deleting "so far", and the unpriced-money treatment the owner specified (R9).
11. Pinning, as a criterion, that unpriced lines **block issuing** and that the console
    says so as a critical refusal rather than an incidental one.
12. The totals panel's delivery row as **text only** — the figure and its state, no
    control, no navigation.

### In scope — phase 2

13. The desk's rail + canvas, without the filmstrip and without a full-width action bar
    (R7).

### Out of scope — grill §6 and the owner's rulings

- **The Project tab's contents** — progress, payments, files, history, notes. The tab keeps
  saying it is not built. The mock's `ProjectBlocks`, `Progress`, `Payments`, `Files`,
  `History` and `Notes` are not built.
- **Issuing as a flow.** The CTA and its gate stay as built: the console reads the server's
  action list and never re-derives the gate (`worker/lib/ops-actions.ts`).
- **Filling out the `⋯` menu.**
- **The Projects queue**, which the owner has accepted.
- **All editing.** This correction produces a read-only review surface. `Edit` and the
  re-pricing panel are named by R6 as living on the line page eventually; nothing here
  builds them.
- **"Why this product?"** — owner's ruling: not in this correction. See §4 for where it
  attaches.
- **Delivery editing.** Owner: *"limiting the scope for this change. functionality will be
  added later."* The delivery row is text. A delivery screen is a later piece.
- **GST, in any form.** The mock's `All figures inc GST · this account's setting`
  (`pieces.tsx:365`) is dropped: the mock predates the ruling.

---

## 4. Where "Why this product?" will attach

Not built here, so the attachment point is recorded rather than left to be rediscovered.

In the mock it is a **budgeted panel on the line page**, sitting between the specification
and the price, carrying three lines — what the opening had to meet, what this product
achieves, and why it was chosen — and leading to a fuller "what else was considered"
surface (`LineBody.tsx:229-241`). It is **absent entirely on a composite**, parent and
units alike, because the estimator recommends a product per opening and a composite is one
opening that ops divided — there is no machine recommendation to justify, and inventing a
rationale would be worse than the absence (`LineBody.tsx:55-60`).

Its data is the estimator's candidate outcomes (`CONTEXT.md` → *Candidate*, *Candidate
outcome*, *Selection ladder*). Building it is its own feature with its own decisions —
which candidates show, what the losers say, how the ladder's tier is worded. Phase 1
builds the page it lands on; the panel is the next feature, and it is the owner's stated
MVP destination.

---

## 5. Actors and needs

Carried verbatim from the grill's §4.

> **Staff — an ops-console operator reviewing a quote before it is issued** (`CONTEXT.md`).
> Works down a list of openings deciding whether each is right. Needs, in the owner's own
> framing of the MVP: to reach **"Why this product?"** — a question legacy ops cannot answer
> at all, and the reason this console is being built. To get there they need, per line: to
> SEE the opening (shape, arrangement, opening direction — not a category glyph), its code,
> its product, its size, its money, and whether it is flagged. Then to open it and read the
> spec, the units of a composite, and the recommendation's reasoning.
>
> They also need to find the lines that need them: a list of 18 openings with 2 unpriced is
> a scanning problem, and the mock answers it with a filter rather than with per-row noise.
>
> **Customer** — not served by this surface. The record is ops-only.

No other actor is touched. No demographic, name or backstory is invented for either.

---

## 6. PHASE 1 — acceptance criteria

Every criterion is Given–When–Then and independently verifiable. Phase 1 is complete and
shippable when all of `P1-*` and all of the negatives in §8 hold.

### A. The elevation on every row (R1, R2)

**P1-AC-1** — *the drawing leads the row*
Given a record with lines, When the Lines tab renders, Then every row carries an
`Elevation` SVG in its leading slot before any text, drawn from the line's own
`productSlug`, `width` and `height`, at `size="xs"` with `square`.
*Trace:* `pieces.tsx:270-273`; call pattern `src/components/quote-project/OpeningRow.tsx:103-110`.

**P1-AC-2** — *true arrangement, not a category glyph*
Given two lines of different families and proportions (e.g. a 3500×700 sliding door and a
900×1200 awning), When both rows render, Then their SVGs differ in panel count, mullions
and opening symbol — the drawing states the shape of the thing, not a badge for its
category.
*Trace:* `Elevation.tsx:7-17`; grill R1.

**P1-AC-3** — *a composite is drawn from its units*
Given a line with `lineKind: "composite_parent"` and segments, When its row renders, Then
the elevation is drawn from those segments (`parts`), divided along the line's
`compositeAxis`, each unit's share in proportion to its size along that axis — not as a
single frame.
*Trace:* `Elevation.tsx:396-430`; `pieces.tsx:271-272`.

**P1-AC-4** — *an unsized opening is drawn honestly*
Given a line whose width or height is missing, When its row renders, Then the elevation
draws a square stand-in with no dimension leaders, and the row's size field reads
`size not read` rather than a number.
*Trace:* `elevation.tsx:303-307` (R-49 — "leaders NEVER when the size is unknown");
`pieces.tsx:291`.

**P1-AC-5** — *the drawing is resolved through the catalogue, so ops2 must hydrate it*
Given ops2 boots, When the console mounts, Then the Sanity catalogue has been hydrated the
same way `src/ops/main.tsx` hydrates it, because `Elevation` resolves a line's family
through `getProductBySlug(productSlug)` and without it every row would draw the fallback.
*Trace:* `src/components/quote-project/Elevation.tsx:303-346` (the component takes
`productSlug`, not an operation string — the mock's local port takes `op` and that
difference is a mock-local convenience, `elevation.tsx:8-12`); `src/ops2/main.tsx:5-9` is
the comment being corrected; grill R2.

**P1-AC-6** — *a Sanity failure is not an outage*
Given Sanity is unreachable or slow, When ops2 boots, Then the console still mounts within
the existing hydration timeout, the record still renders, and rows whose product slug the
catalogue cannot resolve draw the fallback (fixed) elevation — never a blank slot, never a
thrown error, never a boot that hangs.
*Trace:* `src/main.tsx:14` (`allSettled` fail-open), `src/data/sanity.ts:32` (2500 ms).

**P1-AC-7** — *the parser stops dropping what the endpoint already sends*
Given `GET /api/ops/projects/:id` returns a quote line, When ops2 parses the record, Then
`productSlug`, `compositeAxis`, and each segment's `productSlug` and `qtyPerParent` are
carried onto the parsed line, and a line whose slug is absent from the response is
rendered with the fallback drawing rather than dropped.
*Trace:* the endpoint already sends all four — `worker/routes/ops.ts:152` (`productSlug`),
`:168` (`compositeAxis`), `:611-614` (segment `productSlug`, `qtyPerParent`). ops2's
`src/ops2/projects/record.ts:182-203, 161-180` discards them.

**P1-AC-8** — *an accepted order's rows keep their drawings*
Given a project with an accepted order, When its contract lines render, Then each row and
each of its segments carries its elevation exactly as a quote line's does.
*Trace:* `worker/routes/ops.ts:669-690` currently forwards `productName` and **not**
`productSlug`, on both the parent and the segments — so without this the drawings would
vanish the moment a quote is accepted, which would read as a bug rather than as a state.
Forwarding the field is in scope (§3.3).

**P1-AC-9** — *the drawing is decorative to assistive technology, and the row is not*
Given a row, When a screen reader reads it, Then the SVG is not announced (it is
`aria-hidden`), and the row's accessible name still carries the code, the product, the size
and the flag — the drawing adds nothing a non-sighted reviewer loses.
*Trace:* `elevation.tsx:374` (`aria-hidden="true"` on the SVG); `pieces.tsx:274-299`.

### B. The header carries identity whole (R3)

**P1-AC-10** — *the project's NAME leads*
Given a record, When it renders, Then the heading is the project's **name**
(`record.title`), not its reference.
*Trace:* grill R3; `pieces.tsx:103`.

**P1-AC-11** — *the reference cannot truncate*
Given a project whose name is long enough to ellipsize, When the record renders at 375 px,
Then the name truncates and the reference is still shown complete, in the mono face, at the
leading edge of its own header line.
*Trace:* `pieces.tsx:63-80` ("THE REF NEVER TRUNCATES, because it cannot"), `:141`.

**P1-AC-12** — *the customer is beside the reference, in the header*
Given a record with a customer or organisation, When it renders, Then the customer name
sits on the same header line as the reference, and appears **nowhere in the page body**.
*Trace:* `pieces.tsx:137-149`.

**P1-AC-13** — *the total sits at the header's trailing edge, and stays there*
Given a record, When it renders at any width and at any scroll position, Then the project
total is at the trailing edge of the header's identity line and is on screen.
*Trace:* `pieces.tsx:22-34` ("the money took the corner… on screen at every scroll
position"), `:144-146`.

**P1-AC-14** — *the state leads the content, ranked, and is not pressable*
Given a record, When it renders, Then the first row of the content is the lifecycle, ranked
over two lines — who owes the next move first (`Waiting on us` / `Waiting on the customer`
/ `With the manufacturer`), then the state label and days in phase — never a single dotted
run of four facts at one weight; and the row is **not** interactive.
*Trace:* `pieces.tsx:151-180`; `RecordPage.tsx:89-99` (D3/D5 — not gated on width).
*Settled:* in the mock the row opens Progress, which §3 fences out; a row that opens
nothing is the defect this effort has recorded four times. It becomes pressable the day
Progress exists.

### C. The attention filter (R4)

**P1-AC-15** — *the leading blocker is named with the control that clears it*
Given a record with 2 lines carrying no rate, When it renders, Then a single-line row
states `2 lines have no rate` with the action `show only these`.
*Trace:* `pieces.tsx:216-228`; `RecordPage.tsx:106-111`.

**P1-AC-16** — *toggling it filters the list*
Given that row, When the operator activates it, Then the line list shows only the lines
with no rate, the row reads `Showing the 2 lines with no rate`, and the action becomes
`show all`; activating again restores all lines.
*Trace:* `pieces.tsx:224-227`.

**P1-AC-17** — *blockers are a queue, not a list*
Given a record with 2 unpriced lines **and** unset delivery, When the row renders, Then it
states the unpriced blocker only, with `· +1 more` appended, and stays one line.
*Trace:* `pieces.tsx:196-199, 217-226`; lines lead over delivery for the reason
`worker/lib/ops-actions.ts:88-90` already gives — "surfacing the trivial blocker while
hiding the substantial one trains people to distrust the gate".

**P1-AC-18** — *a blocker this build cannot act on carries no control*
Given delivery is the leading blocker, When the row renders, Then it states the blocker and
offers **no** action word and no navigation — there is no delivery screen in ops2 to send
anyone to.
*Trace:* owner's ruling on scope; `ProjectRecordPage.tsx:41-52` (a control wired to
nothing is the defect recorded four times).

**P1-AC-19** — *nothing blocking says so*
Given a record with every line priced and delivery settled, When the row renders, Then it
reads `Nothing is blocking this quote`.
*Trace:* `pieces.tsx:207-215`.

**P1-AC-20** — *a record with no lines does not claim nothing blocks it*
Given a record with zero lines, When the attention row renders, Then it reads `No lines on
this project yet`, with no control — never `Nothing is blocking this quote`, which would be
false, since a quote with no lines cannot be issued.
*Trace:* `worker/lib/ops-actions.ts:98-99` ("This quote has no lines yet — there is nothing
to issue"); `worker/lib/issue.ts:157` (`lineCount > 0`).

**P1-AC-21** — *the filtered-empty list explains itself*
Given the filter is on and no line matches, When the list renders, Then it reads
`No lines without a rate. Clear the filter to see all N.` and offers the way back to all
lines.
*Trace:* `pieces.tsx:255-262`.

### D. One badge per row; the reasons live on the line (R5)

**P1-AC-22** — *one badge, whatever the reason count*
Given a line the parser flagged with three separate reasons, When its row renders, Then the
row carries exactly one `needs review` badge and no reason text.
*Trace:* `pieces.tsx:238-245` ("it pollutes the screen. Highlight is enough"), `:302`.

**P1-AC-23** — *the reasons are readable, on the line's own page*
Given that same line, When its page is opened, Then every parser reason is stated there, in
the server's own words (`review`, `worker/routes/ops.ts:164`).
*Trace:* `pieces.tsx:242-245`; grill R5.

### E. The line page (R6)

**P1-AC-24** — *a row opens a page, never an accordion*
Given the line list at **any** width, When a row is activated, Then the console navigates to
that line's own page. No row expands in place at any width.
*Trace:* `RecordPage.tsx:73-76`; grill R6, verbatim owner quote.
*Superseded at desk width by P2-AC-2 when phase 2 ships; unchanged below the rail
breakpoint.*

**P1-AC-25** — *back returns to the record, and does not grow the stack*
Given the line page reached from a record, When back is activated, Then the console returns
to the record it came from and the history is no longer than before the line was opened.
Given the line page reached cold (a pasted link or an email), When back is activated, Then
the console goes to that line's record.
*Trace:* the same discipline `src/ops2/chrome/OpsPage.tsx:91-103` applies one level up, for
the same reason. *Answers grill §7.1.*

**P1-AC-26** — *the drawing is the page's hero*
Given a line page, When it renders, Then the elevation is drawn at a plate size for the
viewport (not the row's `xs`), on its own drawing surface, above everything else.
*Trace:* `Plate.tsx:36-109`; `LineBody.tsx:192-196`. *Answers grill §7.4 — yes, and larger.*

**P1-AC-27** — ~~*the drawing can be enlarged, with its legend*~~
**SUPERSEDED 2026-08-25** by the shared drawing viewer (`docs/specs/ops2-why-this-product.md`,
phase 2 — VIEW-AC-1, VIEW-AC-6, VIEW-AC-10, VIEW-AC-11), on the owner's ruling **R25**:
*"i don't think lines like this relevant for ops"*, of the solid-V / dashed-V / apex /
arrow / unmarked key. Ops staff read elevations for a living; that key is customer-facing
explanation, and the ruling is about the **class** of content — the sentence teaching that
panel widths are proportional went with it.

Two live specs asserting opposite things about one screen is how the next reader builds the
wrong one, so this is struck here rather than left to be discovered. What replaces it:

> Given a line page, When the drawing is activated, Then it opens **at its own address**
> (`/projects/:id/line/:lineId/drawing`) in the shared full-screen viewer, carrying the
> drawing at the largest size the viewport allows and its dimensions in the caption
> beneath it — **and no symbol legend, and no explanation of the notation anywhere**.
> Back returns to the line. Statements about the drawing's **authority** are unaffected
> and remain: that mullion positions are confirmed at technical review, and that an
> unsized opening is a square stand-in.

The enlargement is no longer a `SidePanel` and no longer closes with a dismiss: it is a
node in the navigation tree with a back control, so leaving a line from an enlarged drawing
takes **two backs** — named to the owner and accepted, not a defect (VIEW-AC-2d).

*Trace, superseded:* `Plate.tsx:84-88, 111-148`; `elevation.tsx:392-402`.
*Trace, current:* `src/ops2/chrome/DrawingViewer.tsx`; `src/ops2/projects/lineRoute.ts`;
`scripts/tests/web/ops2-drawing-viewer.spec.ts`.
This criterion never had a test, which is why the document is the only place the
contradiction could be resolved.

**P1-AC-28** — *the size sits with the drawing, carrying its provenance*
Given a line page, When it renders, Then one line beneath the drawing states
`height × width mm` with one word of provenance — `from the schedule` or `entered by hand`
— and never more than one line.
*Trace:* `LineBody.tsx:198-207`; `worker/routes/ops.ts:163` already sends `origin`.

**P1-AC-29** — *a simple line shows its specification, budgeted*
Given a non-composite line, When its page renders, Then a Specification panel states the
product and its configured options, clamped to a fixed line budget, and states the
remainder (`+N more options`) whenever it had to clamp. The panel never grows to fit its
content.
*Trace:* `LineBody.tsx:10-27` (the structural rule that stops the page becoming the pile
that was rejected), `:212-223`. *Answers grill §7.2.*

**P1-AC-30** — *a composite shows its units INSTEAD of a specification*
Given a composite line, When its page renders, Then the units block replaces the
Specification panel — never both — each unit carrying its own `xs` elevation, its unit label
(`W04A`, `W04B`, …), its own spec, no price and no edit control; and when the units' sizes
do not add up to the opening's, a coverage line states the difference and refuses nothing.
*Trace:* `LineBody.tsx:46-64, 130-169`.

**P1-AC-31** — *the price states what kind of figure it is; the customer's note is
read-only*
Given a line page, When it renders, Then the price is shown with its state (a list price, or
one a human overrode — `priceCalculated` / `priceOverrideAt`, `worker/routes/ops.ts:172-173`),
an unpriced line reads `No rate` and never `$0`; and when the customer wrote a note it
appears as their words, read-only, and not as a thread.
*Trace:* `LineBody.tsx:243-261`; grill §3 ("Unpriced is never `$0`").

### F. The row's exact content (R8)

**P1-AC-32** — *the row's fields, in the mock's order*
Given a line, When its row renders, Then it contains, in this order and nothing else: the
elevation · the code in the mono face · the product name · `height × width mm` · (when
composite) the joined-unit count · the money at the trailing edge · (when flagged) one
`needs review` badge.
*Trace:* `pieces.tsx:266-304`; grill R8.

**P1-AC-33** — *the joined-unit count is the units, not the quantity*
Given a composite whose segments' `qtyPerParent` sum to 3, When its row renders, Then it
reads `3 joined units`.
*Trace:* `pieces.tsx:296`; `LineBody.tsx:81-85` (D4 — `qtyPerParent` is a different fact
from the retired quantity).

**P1-AC-34** — *money at the end, absence named*
Given a line with no rate, When its row renders, Then the trailing figure reads `No rate`
and never `$0`.
*Trace:* `pieces.tsx:301`; grill §3.

**P1-AC-35** — *the whole row is one target*
Given a row, When any part of it is activated, Then the line opens (P1-AC-24) — no part of
the row looks pressable and answers differently, and there is no separate twisty.
*Trace:* `pieces.tsx:266` (`detail={false}`, no disclosure).

### G. Money without "so far", and the critical refusal (R9, owner's ruling 4)

**P1-AC-36** — *the string is gone*
Given any record in any state, When any part of the record surface renders, Then the text
`so far` (in any casing) appears nowhere.
*Trace:* grill R9; grill §1 ("invented by the orchestrator").
*Today:* `ProjectRecordPage.tsx:372` and `:411` both print it.

**P1-AC-37** — *the header's corner keeps a figure, and names what is missing*
Given a record with 2 lines carrying no rate, When the header renders, Then the corner
reads the figure followed by the count — `$48,802 · 2 no rate` — never "so far", never
"estimate", never a bare number that implies completeness.
*Trace:* owner's ruling 4, verbatim shape; `pieces.tsx:22-34` (the corner exists because
he missed the money there, so it does not go blank).

**P1-AC-38** — *the totals panel shows the priced sum and refuses to call the rest a total*
Given a record with unpriced lines, When the totals panel renders, Then the sum of the
priced lines is shown under its own label, and the project total is marked not-yet-knowable
with the count of lines that have no rate — never a figure captioned as provisional.
*Trace:* `pieces.tsx:336-368`; grill §3 ("a partial sum is never called a total").

**P1-AC-39** — *unpriced lines BLOCK issuing, and the console says so as a critical
refusal*
Given a record with any line carrying no rate, When it renders, Then the primary action is
shown, disabled, with the server's own reason on screen adjacent to it, drawn as an error
rather than as a note — the refusal reads as a critical fault in the quote, not as an
incidental status.
*Trace:* the rule already exists and this criterion pins it so it cannot regress —
`worker/lib/issue.ts:150-159` (`blocking === 0` is required), `:209` (the endpoint refuses
independently), `worker/lib/ops-actions.ts:91-104` (the sentence). The console never
re-derives the gate (grill §3).
*In scope:* sharpening that one sentence in `worker/lib/ops-actions.ts` so it names the
consequence rather than only the count. `ASSUMED:` because that file is the single source
both consoles read, the sharpened wording appears in legacy ops too. That is the correct
place for it to change — one place per fact — but it is a visible change to a second
console, so it is flagged rather than assumed silently.

**P1-AC-40** — *the delivery row is a figure and a state, and nothing to press*
Given the totals panel, When the delivery row renders, Then it states the amount and
whether it is confirmed as **text**: no button, no chevron, no navigation. Given delivery
has no figure at all, Then the row draws that absence in the error treatment the mock gives
it, **without** the imperative — there is nothing here to press.
*Trace:* owner's ruling 5 (*"limiting the scope for this change"*); mock's pressable
version at `pieces.tsx:346-360` is the part deliberately not carried.

---

## 7. PHASE 2 — acceptance criteria (the desk's rail + canvas, R7)

Not required for phase 1 to ship. Phase 1's record renders as one column at desk width
until these land.

**P2-AC-1** — *the list is a rail, the selected line is reviewed beside it*
Given the desk width, When a record renders, Then the line list occupies a left-hand rail
and the selected line is reviewed on the right, in the same body the line page shows.
*Trace:* `RecordPage.tsx:229-274`.

**P2-AC-2** — *selecting on the desk does not navigate*
Given the desk width, When a row in the rail is activated, Then the canvas shows that line
and the browser history does not change. (Supersedes P1-AC-24 at this width only.)
*Trace:* `RecordPage.tsx:73-76` (`if (!wide) history.push(...)`).

**P2-AC-3** — *the state row and the totals lead and close the rail*
Given the desk width, When the record renders, Then the state row leads the rail and the
totals panel closes it — the same placement as at phone width, not a desktop variant.
*Trace:* `RecordPage.tsx:89-99` (D5), `:118-123`.

**P2-AC-4** — *an empty canvas invites a choice*
Given the desk width and no line selected, When the record renders, Then the canvas reads
`Choose a line on the left to review it.`
*Trace:* `RecordPage.tsx:271-273`.

**P2-AC-5** — *the filter emptying the rail empties the canvas honestly*
Given the desk width with a line under review, When the filter is switched on and that line
is not in the filtered set, Then the canvas stops showing it; if the filtered set is
non-empty the canvas shows its first line, and if it is empty the rail states P1-AC-21's
sentence and the canvas shows nothing to review with the way back to all lines.
*Answers grill §7.3.*

**P2-AC-6** — *NO line filmstrip*
Given the desk width, When the canvas renders, Then there is no horizontal deck of line
thumbnails mirroring the rail, and no line-switcher sheet.
*Trace:* `RecordPage.tsx:262-265` builds `LineScroller`/`LineSwitcher`; grill R7(a) — the
owner called it *"silly"*. It is not built.

**P2-AC-7** — *NO full-width action bar; actions come through the side panel*
Given the desk width with a line under review, When the operator opens that line's actions,
Then they arrive in the existing right-hand slide-out (`chrome/SidePanel.tsx`), opened by a
control that is not a full-width bar at the foot of the canvas.
*Trace:* `RecordPage.tsx:266-268`; grill R7(b).

---

## 8. Negative criteria — what must NOT appear (both phases)

**AC-N1** — Given any record at any width, When the line list renders, Then no row expands
in place and no element in the list carries `aria-expanded`. (`pieces.tsx:266`; grill R6.)
*Today:* `lines.tsx:99-150` is the accordion being removed.

**AC-N2** — Given a line whose customer wrote a note (`quote_line.room_label`), When its row
renders, Then that text appears nowhere in the row. (`pieces.tsx:280-289` — free text
bounded at 500 characters, labelled "Note (optional)" to the customer.) *Today:*
`lines.tsx:167`.

**AC-N3** — Given any line, When its row renders, Then no quantity (`×N`) appears.
(`pieces.tsx:292-295` — D4, quantity is retired.) *Today:* `lines.tsx:169`.

**AC-N4** — Given any ops2 surface in any state, When it renders, Then the string `so far`
does not appear. (Kept as a negative so it can be grepped as well as walked.)

**AC-N5** — Given any record, line page, panel, totals row or drawing caption, When it
renders, Then no reference to GST appears in any form — no `ex GST`, no `inc GST`, no tax
basis caption, no "this account's setting". The mock's `Money basis` and its
`All figures … · this account's setting` line (`pieces.tsx:365`) are **not** carried: the
mock predates the ruling. (Grill §3; owner's ruling 6.)

**AC-N6** — Given a line with several parser reasons, When its row renders, Then no reason
sentence and no per-reason chip appears on the row. (`pieces.tsx:238-245`.) *Today:*
`lines.tsx:32-52`.

**AC-N7** — Given the totals panel, When the delivery row renders, Then it is not a button,
not a link, and carries no chevron. (Owner's ruling 5.)

**AC-N8** — Given the desk width, When the canvas renders, Then there is no line filmstrip
and no full-width action bar. (Grill R7; duplicates P2-AC-6/7 as a negative so the absence
is checked rather than assumed.)

**AC-N9** — Given any surface in this correction, When a control is rendered, Then
activating it does something. No control is drawn for an action this build cannot perform.
(`ProjectRecordPage.tsx:41-52`.)

**AC-N10** — Given any totals or price surface, When it renders, Then the word "estimate"
is not used for a quote figure. (`pieces.tsx:313-315`; `CONTEXT.md` puts *estimate* on
Quote's `_Avoid_` line.)

**AC-N11** — Given any row, When it renders, Then no "withdrawn from sale" suffix appears.
The mock carries one (`pieces.tsx:277`) and **no field in the record DTO says a product has
been withdrawn**, so it is dropped rather than invented. If the offerability gate later
surfaces that fact on the record, it returns as its own small change.

---

## 9. Abuse cases — must fail

The record carries customer pricing data and is staff-only. The line page adds a **new
route with a line identifier in the URL**, which is the new surface here.

**AC-X1** — Given a signed-in non-staff account, When it requests
`GET /api/ops/projects/:id`, Then the server answers 403/401, no project data is returned,
and the console renders the role error ("Projects are staff-only") rather than an empty
record. (`useProjectRecord.ts:55-65` — re-verified because the surface is being rebuilt
around it.)

**AC-X2** — Given an anonymous request, When it hits the record endpoint, Then it is
refused and no line, price, customer name or reference appears in the response body.

**AC-X3** — Given a valid staff session and a line id belonging to **project B**, When
`/projects/<A>/line/<B-line-id>` is opened, Then the page states that the line is not on
this project and renders nothing about project B — no product, no size, no price, no
customer. The line page resolves its line from the record already fetched for project A and
never fetches a bare line id.

**AC-X4** — Given a line id that does not exist at all, When its page is opened, Then the
same not-found sentence renders, indistinguishable from AC-X3's, so a cross-project probe
cannot learn from the difference whether a line exists.

**AC-X5** — Given the catalogue hydration added by R2, When it runs, Then it fetches only
the public catalogue that `src/main.tsx` and `src/ops/main.tsx` already fetch, sends no
project, customer or line identifier to Sanity, and its failure changes nothing about what
the console will show a non-staff user.

**AC-X6** — Given the accepted-order DTO now forwards `productSlug` (P1-AC-8), When the
endpoint responds, Then it forwards that field and nothing else new — no cost, no margin,
no supplier or internal pricing fact rides along with it.

---

## 10. Edge cases

| Case | Required behaviour | Criterion |
|---|---|---|
| Line with no width/height | square stand-in, no leaders, `size not read` | P1-AC-4 |
| Product slug not in the catalogue | fallback (fixed) drawing, no blank slot, no crash | P1-AC-6 |
| Sanity down at boot | console mounts anyway, within the existing timeout | P1-AC-6 |
| Accepted order (contract lines) | drawings still render; order lines carry no review flags, so no badges — correct, not a gap | P1-AC-8 |
| Order with zero contract lines | the existing two-empties sentence stays; the quote's lines are never shown instead | existing, unchanged (`record.ts:283-298`) |
| Delivery settled at `0` | settled — a trade customer arranging their own freight. Only NULL is unset; never a truthiness check | `record.ts:308`; P1-AC-40 |
| Delivery with no figure | error treatment, no imperative, nothing to press | P1-AC-40 |
| Every line priced, delivery unset | attention row leads with delivery, stated without a control; the unpriced filter is absent, not disabled | P1-AC-17, P1-AC-18 |
| Any line unpriced | issuing is blocked, and the refusal reads as critical | P1-AC-39 |
| Filter on, then the lines get priced elsewhere and the record reloads | filter yields nothing; P1-AC-21's sentence, not a blank list | P1-AC-21 |
| Composite with one unit | drawn as a single frame; `1 joined unit` reads correctly | P1-AC-3, P1-AC-33 |
| Composite whose units overshoot the opening | coverage line reports the difference and refuses nothing | P1-AC-30 |
| Project with no lines | attention row says `No lines on this project yet`; never "nothing is blocking" | P1-AC-20 |
| Long project name at 375 px | name ellipsizes, reference stays complete | P1-AC-11 |
| GST | absent everywhere, in every state, on every surface | AC-N5 |

---

## 11. Assumptions tagged for veto

Only one remains open; everything else the owner has now ruled on.

- `ASSUMED:` **P1-AC-39** — the blocked-issue sentence is sharpened in
  `worker/lib/ops-actions.ts`, which is the single source both consoles read, so the new
  wording appears in **legacy ops** as well as ops2. That is the right place for it (one
  place per fact), and duplicating the sentence in ops2 to avoid touching legacy would
  break the rule the file exists to keep — but it is a visible change to a console outside
  this correction's scope, so it is flagged for the owner rather than assumed silently.

Resolved and no longer assumptions: the state row is not pressable (P1-AC-14, owner-settled);
"withdrawn from sale" is dropped for want of a field (AC-N11, owner-settled); the
partial-sum treatment in both places (P1-AC-37, P1-AC-38, owner-specified); the pinned
drawing strip on scroll (`Plate.tsx:60-76`, R-18) is **not** built in phase 1 — it belongs
with the desk canvas in phase 2, where a long scroll actually occurs, and it is named here
so its absence is a decision rather than an omission.

---

## 12. Decisions needed

**None.** All nine questions from revision 1 are answered and folded in above. The one
remaining `ASSUMED:` (P1-AC-39, the shared blocked-issue sentence reaching legacy ops) is
flagged for veto at review rather than held as a blocking question.
