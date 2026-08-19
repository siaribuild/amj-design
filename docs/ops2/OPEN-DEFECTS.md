# ops2 — open defects and decisions

State at 2026-08-19. Branch `design/ops2-planning`, worktree `E:\Projects\amj-ops-planning`.
Nothing here blocks reading the mock; everything here blocks calling R1c finished.

## Defects in R1c — found by the Codex stop-gate, verified, NOT yet fixed

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

**D4 — quantity: suppress the default, show the exception.**
The owner believed qty is always 1 (*"remove qty from the lines - it's always 1 per line,
actually"*). Checked against production `quote_line`: **283 lines at qty 1, four above it,
max 6, of 287 total.** So the display is noise on 98.6% of rows and load-bearing on the
rest — and those are the rows where an error is most expensive, since a 6x line read as 1x
is a five-figure mistake. Render nothing when qty is 1; render it prominently when it is
not. Do not remove the field. Fixture data should keep at least one multi-qty line so the
case stays visible in the mock.

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
