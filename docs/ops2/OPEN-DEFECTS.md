# ops2 — open defects and decisions

State at 2026-08-19. Branch `design/ops2-planning`, worktree `E:\Projects\amj-ops-planning`.
Nothing here blocks reading the mock; everything here blocks calling R1c finished.

## Defects in R1c — ALL FOUR FIXED in R1d (2026-08-19)

Fixed on `design/ops2-planning`, one commit each, with the reasoning in
`docs/ops2/interaction-spec-r1.md` section 16. Kept here with their original
wording because the reasoning is worth more than the status line.

| | Was | Now |
|---|---|---|
| D1 | title truncated while the spec said it did not | dissolved into D3 — the ref cannot truncate, the title does via IonTitle's own ellipsis; header does not grow (measured at 320 with a 67-char name) |
| D2 | Files controls did not act | download acknowledges, rescan runs pending -> verdict and states it either way; gating matches row 206 |
| D3 | bespoke CSS grid inside IonHeader | three IonToolbars, published slots only; header 190px, total at 17px |
| D4 | quantity rendered | removed from view and fixtures; qtyPerParent untouched |

### D5 — the wide layout lost the status row and the totals panel. INTRODUCED BY D3, FIXED.

Not pre-existing: R1d's own D3 work created it, and the stop-gate caught it.

Moving the waiting-on row out of the header was correct. Writing the move as
`{!wide && stateRow}` was not — the gate was authored while thinking only about
the phone header, and `listColumn` is shared by both branches, so at `desktop`
and `wide` the row rendered nowhere. The same habit hit `{!wide && <Totals/>}`
two lines away.

Consequences, worst first:

1. **The delivery confirm flow became unreachable at wide.** `Totals` carries the
   delivery review row, so gating `Totals` removed the only route to a figure ops
   must set before a quote can be issued — a flow designed two rounds earlier on
   the owner's own reframing.
2. **"Waiting on us / Technical review / 3 days" rendered nowhere at wide**, so
   the answer to *does this need me* was missing from the desktop record.
3. The goods/delivery/total breakdown vanished; only the grand total survived,
   because `RecordSummaryBar` carries it in chrome.

Fixed by removing the gates rather than by writing a desktop variant. `listColumn`
IS the rail at 1024+, so both components land where they already belonged: the
status row leads that column exactly as it leads the phone's content, and the
totals panel sits beneath the list, which is the placement the owner approved.
No new desktop design was needed or done.

Audited for the same habit across the source: the only other `wide` branches are
`App.tsx:60` (a route fork - record surface vs line plane) and `elevation.tsx:100`
(the drawing's break-line for wide openings, an unrelated meaning of the word).
Neither drops anything. Nothing else renders on narrow and nowhere else.

### Original wording

**D1 — the record title truncates, and the spec claims it does not.**
`docs/mocks/ops2-r1-ionic-src/src/ops2-record.css:47` sets
`overflow: hidden; text-overflow: ellipsis; white-space: nowrap` on `.rec-h1 .title`.
The R1c rationale for moving the title onto its own full-width row was precisely that it
"gets full width below and never truncates — which the old single-line `ref · title` could
not promise". The CSS contradicts the argument the design was accepted on. Either the title
wraps (and the header grows by a line on long names, which must be measured at 320) or the
claim comes out of the spec. It cannot stay as it is.

**D2 — the Files actions do not act.**
`docs/mocks/ops2-r1-ionic-src/src/pieces.tsx:409` renders Download as
`<IonButton href="#" download={...}>`; `:419` renders Rescan with no handler.
The owner's instruction was *"files should be downloadable from the list, not just listed."*
A mock need not really transfer bytes, but a control he taps to evaluate must demonstrate
its outcome, and the report claimed the behaviour was carried when it was not. Make each
control show its consequence (a simulated download acknowledgement; rescan moving the row
through `pending` to a verdict), or mark them plainly as non-functional in the mock.

Note the real endpoint gates download on scan state — `clean` serves, `quarantined` 403s,
`scan_pending` 409s (register row 206) — so whatever the mock demonstrates must agree with
that, not with a more generous fiction.

**D3 — the header is a dashboard, not a toolbar.**
Current shape is `< Projects / OF-Q-10482` + total on row 1, title on row 2, customer on
row 3 — four pieces of information inside `IonHeader`, assembled as a bespoke CSS grid
inside a standard component. The owner: *"header is messed up, isn't it: back button,
title, project id, price - that is not how guidelines say it should be mobile, no?"* He is
right, and it accreted from my own relayed requests rather than from a design decision.

The convention — iOS HIG, Material, and Ionic's own `IonToolbar` structure — is one line:
`IonButtons slot="start"` (back), `IonTitle`, `IonButtons slot="end"` (actions). A total is
not an action. Ionic's sanctioned way to carry more is a **second `IonToolbar` inside the
same `IonHeader`**, which also gives the money room to be read instead of squeezed into
~80px. Rework to that, and stop composing bespoke grids inside standard components — that
is the boundary rule being broken in the one place he keeps looking.

**D4 — quantity: remove it from the view. RULED.**
The owner: *"remove qty from the view."* Quantity is retired — `ItemComposer.tsx` and
`ItemForm.tsx` carry no qty field, so nothing creates a multi-quantity line any more.

Recorded because it was argued and decided rather than assumed: four production lines
carry qty 2, 3, 4 and 6, and they sit on projects in `estimator_assigned` and `submitted`
— live pre-issue states ops2 will open, not closed history. I proposed rendering the
multiplier only there; the owner ruled it out. The consequence is bounded and acceptable:
the line total stays arithmetically correct, only its derivation is unstated, and it
disappears entirely as those four projects close.

Do not conflate with `qtyPerParent`, the count of units *within* a composite line
(`OpeningDrawer.tsx:245/309`). Both print as `xN`; only one is retired.

Residue for whoever finishes the retirement: `OpeningDrawer.tsx:45/138` still carries a
`"qty"` section key and a review-key clear on qty change, on the customer side.

## Owner decisions still open

1. **Is confirming delivery a gate on `Issue quote`?** The mock's blocked reason implies yes.
   Business rule. If no, the clause drops and the marker stays informational.
2. **`waitingOn` generalisation.** Waiting on a courier is the same shape as waiting on the
   manufacturer; `worker/lib/lifecycle.ts:56`'s union has already grown once. One flag per
   counterparty will not hold. Architect owns the model.
3. **The delivery override belongs in the divergence record** (proposed -> issued, like a line
   field). Needs new acceptance criteria, including the negative: nothing written before issue.
4. **The line note has four names** — `room_label` (schema), `location` (worker DTO/QItem),
   "Note" (customer label and the schema's own comment), `room` (`accountModel.tsx:175`).
   Recommendation: **Line note**, the other three under _Avoid_ in `CONTEXT.md`. The column
   need not be renamed; the word needs agreeing.
5. **`ItemForm`'s internal option disclosures.** The owner rejected collapsible sections for
   information groups. `ItemForm` is reused verbatim and has its own form disclosures. The
   architect fenced the ruling at that boundary. Confirm the fence, or accept forking.
6. **`feat/ops-ux-gap-pass`** (on `apertly`, 2026-08-11, six commits, unmerged) — live or
   abandoned? It contains ops mobile fixes this effort independently rediscovered, and it
   changes the baseline the carry-across register describes.

## Parked by the owner

- Colour and theming. *"UX is more important than colours at this point."* The three theming
  options (bare Ionic / palette+type toward the v2 reference / further) remain unchosen.
- ItemDetail view, then desktop. Mobile project view is finished first.

## Parked, with the thinking so far

**Bottom tab bar as top-level navigation.** Raised by the owner while brainstorming
`IonSegment` vs `IonTabs`, to be taken up *"once we start talking about main menu"*. His
shape: **3-4 tabs plus a "more" tab that expands into the main menu** — which fits Ionic's
practical five-item limit and ops2's eight destinations, and removes the drawer's extra tap
from the destinations used constantly ("speed is money").

His own stated concern is the real obstacle and should lead the discussion: **how the
bottom sticky panel coexists with navigation tabs.** The record screen's bottom edge
already carries the line scroller (44px) and the action footer (48px). A tab bar adds
roughly 50px more — about 142px of an 812px phone, some 17% of the screen, permanently.

Three shapes worth costing when it is taken up: hide the tab bar on the record (Ionic
supports per-route hiding, and the record already has `< Projects` as its route out, so it
would not repeat the no-navigation regression); let the action footer yield instead
(unlikely — it is the primary action); or accept the stack and buy the height back
elsewhere. Not a swap; a design question.

## Rulings on R1f (2026-08-19) — apply when work resumes, not started

**R1 — design to the owner's stated recommender model, not to the code.**
*"make a working assumption that the recommender works the way I described - I'll deal
with inconsistency separately."* So the Why plane presents **"the cheapest product that
matches size and energy constraints"**. Remove the on-screen correction (*"It is not 'the
cheapest that fits'"*), the six drawn weights and the graded-compliance explanation.

The code does something else and that is now HIS to reconcile, not the design's to expose:
hard filters at `select.ts:90/138/168` (sellable, rules-passing, priceable), then a
six-component weighted score at `rank.ts:17` with **commercial at 0.15**, and
`RANKER_VERSION = "v3-graded-thermal"` where a thermal miss depresses rank rather than
disqualifying (`thermal/compliance.ts:32`). Recorded here so that whoever builds the real
endpoint knows the design and the engine disagree **by instruction**, and does not "fix"
the screen to match the code without asking. If the engine changes to match the stated
model, this note is what says the screen was already right.

**R2 — family consistency is not surfaced.** *"Family consistency is optional - there may
not be such requirement, it's a judgement call. No need to surface it; list view provides
that sense."* Remove the family-mix line from the Why plane. Spec gap 4 (family mix has no
endpoint) is void — nothing needs building. The judgement is made by looking at the
approved list view, which already shows what the rest of the project uses.

## R1f feedback — line plane, recorded not applied (2026-08-19)

**R3 — one back idiom, not two: name the destination.** The record uses `< Projects`;
the line plane uses `< W04`, which names where you *are*. *"navigation should be
consistent... Choose one."* Confirmed by the owner: from a line, back goes to the **record**
and never to `Projects` — *"either Lines, back to Project, back to Wattle Grove - Lot 14 -
multiple choices for consideration, but not to 'Projects'."*

Three candidates, his to pick:
- `< Project` — names the destination type, and reads as the singular of the record's own
  `< Projects`, so the ladder is Projects > Project > line. Short, fixed width, never
  truncates. Weakest on telling you *which* project, though the header says that on arrival.
- `< Lines` — names the segment you actually land on, which is literally true. Slightly
  tautological coming from a line, and it names a tab rather than a place.
- `< Wattle Grove - Lot 14` — most informative and most specific, but variable length,
  truncates (67-character names exist in the fixtures), and competes with the title for the
  same row. It is also the one idiom that differs in kind from `< Projects`, which names a
  type rather than an instance.

**R4 — prev/next: right placement, wrong mechanism, at EVERY size.**
First recorded as a tablet problem — *"scales very poorly on ipad in particular - just too
massive buttons"* — then corrected: *"back/forth navigation fails equally on mobile as
well, imo."* So two labelled full-width neighbour buttons are not a control that needs
resizing; they are the wrong control. What survives is the **placement** (top, out of the
thumb zone) and the **principle** that moving to an adjacent line must not require a trip
through the list.

Note the history, because it is a loop and the next attempt should not re-enter it:
- `< 4/18 >` stepper in the header — rejected, *"not intuitive or convenient"*.
- Bottom filmstrip scroller — **approved**, *"Scroller at the bottom - good direction"*.
- R1e **removed** the filmstrip, arguing the top control made it redundant and citing the
  owner's own point that the list serves distant jumps. That argument now looks weaker,
  because the control it deferred to has since been rejected.
- Top prev/current/next as two labelled buttons — rejected at all sizes.

Two directions worth costing rather than one being assumed:
1. **Restore the bottom scroller** he approved, and give the top nothing. Cheapest, and
   returns to a thing he liked; costs the thumb-zone argument R1e made against it.
2. **A compact control in the toolbar's end slot** — the iOS Mail idiom, a chevron pair
   that consumes no row and is identical at 375 and 1024. Costs the "neighbours are
   identified, not counted" property, which is exactly what the `< 4/18 >` rejection was
   about, so it must earn that back some other way or argue the property was never the
   point.

A full row of chrome for line-to-line movement is what both rejected attempts had in
common. That is the constraint to design against.

**R5 — there are no line-level notes, and the field is not editable.**
*"there are no item level notes, not in a form of growing list of comments like on the
Project level. The field is just for a customer's note, like 'this is a kitchen window'.
This is not editable."* So the design is wrong twice over: it renders a notes thread that
does not exist at line level, and offers a composer for a field ops does not own. This is
`quote_line.room_label` — the same field as D4's, which the customer types under "Note
(optional)", bounded at 500 characters. Show it as the customer's words, read-only.
Threads remain a project-level concept.

**R6 — the approved list view has no split support.** *"I like the view of it BUT it lacks
support for the splits."* Under investigation; see the reuse analysis in `docs/design/`.
