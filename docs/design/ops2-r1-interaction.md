# ops2 R1 — interaction specification: the frame and the record

Author: ux-designer (pipeline stage 3)
Date: 2026-08-17
Branch: `design/ops2-planning`
Mock (the contract): `docs/mocks/ops2-r1-frame-and-record.html`

Inputs, in order of authority: `docs/specs/ops2.md` (rev 6) → `docs/design/ops2-architecture.md` +
`docs/design/ops2-r1-frame-and-record.md` → `docs/ops-redesign/GRILL-CONCLUSIONS.md` →
`docs/ops2/register.md` → `CONTEXT.md`. `docs/ops-redesign/UX-SPEC.md`, `UX-AUDIT.md` and the two
mocks were read for capability only and are not a rule set here.

**Status: awaiting the UX mock gate.** Nothing in this document is implementable until the owner has
seen the mock and accepted it. Accepted tweaks get folded back into this file before the developer starts.

---

## 0. What is new here, and why

Five things this design introduces that no input document asked for by name. Each is called out so it
can be vetoed rather than absorbed. **N4 and N5 were added at the mock gate, from the owner's answers.**

| # | Introduced | Grounded in |
|---|---|---|
| **N1** | **The customer's phone number is on the record, as a tap-to-call control.** | Register row 53 records that `contactPhone` is *fetched and never rendered*. The console's entire operating premise is that it is used **while on the phone to that customer** (§3.1, §3.4). Rendering a datum the API already returns is a register repair, not a new capability. |
| **N2** | **The totals bar** — one component pinned to the bottom edge of the record at every width, carrying the quote total, and carrying the line total plus Save/Cancel while the editor is open. | AC-16 ("both totals visible within 1200 ms of the input event") and AC-19 ("the quote total reflects it without a page reload"). Making both totals a permanent fixture is the cheapest way for that criterion to hold at 320 px, where the header total is off-screen. |
| **N3** | **The reference blocks (Files, History, Payments) fold closed when the record is narrow**, heading and count still visible, one tap to open. Notes never folds. | I4's *first* failure mode — "a mobile app stretched across a desktop" has a twin, "a desktop poured into a phone as an endless page". At 320 px the unfolded record is ~4,200 px of scroll; folded it is ~3,400 px with the working content on top. Nothing is hidden and nothing is gated. Notes is exempt because it is the block used **during** the call (§4, per-line comments). |

| **N4** | **A size outside the product's range is a junction, not an error** — the notice names the two routes out and puts both within reach, instead of leaving the operator to remember the remedy while a customer waits. | Owner, at the R1 mock gate: *"typically, when the opening is too large, the proposal would be to split the opening and install 2+ products instead. For example, if opening is too large for awning, the proposal is awning+fixed… A human may also confirm with manufacturer if a larger than standard product could be made for the non-standard price."* Both routes already exist as mechanisms — split/merge, and D10's "with manufacturer". §4.6a. |
| **N5** | **Add and delete an opening**, in R1. | Owner, at the R1 mock gate: *"yes, full capabilities to manage any record(s), including adding new or deleting"*. §4.5a. **Requires two Worker endpoints that do not exist today** — §13, which the architect must own. |

Everything else on the screen traces to a register row, an acceptance criterion, or a `CONTEXT.md` term.

---

## 1. The two structural moves

### 1.1 The record is one ordered spine, dealt into columns

The record is a single ordered sequence of blocks. Layout is **how many columns that sequence is dealt
into**, decided by the measured width of the record container. The order never changes and no block is
ever dropped, so there is exactly one information architecture at every width.

Blocks carry a **width appetite**, and there are only two values:

- **Work** — the openings list and the line editor. Wants the widest available measure at every width.
- **Context** — value/delivery, notes, files, history, payments, and (R3) derivation. Legible at
  320–460 px and never improved by more.

That is the whole allocator. At one column the two zones stack, work first. At two columns work takes
the main measure and context becomes a fixed-width rail. This is what makes AC-14 fall out: at
≥1440 px viewport the openings list and the context pane — which is where R3's derivation lands — are
usable simultaneously, and no primary column is confined to a phone measure.

**Rejected:** a masonry/bento of equal cards (puts the openings list in a narrow column on desktop);
tabs at narrow and panes at wide (two information architectures, and tabs hide state that AC-11 requires
to be reachable); a `<DesktopTable>` / `<MobileCards>` pair (explicitly forbidden by arch §4.1).

### 1.2 Two structural folds, both inside one component

| Fold | Container measured | Mechanism | What changes |
|---|---|---|---|
| **Row fold** | the openings list (`RowList`) | CSS container query | Size and quantity move between a stacked meta line and their own columns; state and the row actions gain columns; the column header appears. |
| **Reference fold** | the record | `ResizeObserver` (`useContainerWidth`) | Files / History / Payments open or close. Structural, so it is the hook case, not the CSS case (arch §4.1). |

Both are one component folding itself. Neither has a device branch. `matchMedia`, `navigator.*` and
viewport media queries are refused by the static check (arch §4.3) and this design needs none of them.

---

## 2. Change points

One block, one home — `src/ops2/layout/tokens.css`. **All are container widths, never viewport widths.**

| Token | Value | Container | Effect |
|---|---|---|---|
| `--cp-shell-rail` | 1024 px | `app` | Drawer + menu button → persistent labelled rail; top bar gains the `Loaded HH:MM` meta; page padding 12 → 24 px. |
| `--cp-record-2col` | 1060 px | `record` | Single column → work column + 360 px context rail. |
| `--cp-record-3col` | 1180 px | `record` | Context rail widens to 420 px; gutter 20 → 26 px. |
| `--cp-rows-size` | 480 px | `rows` | Size and quantity leave the stacked meta line and become columns. |
| `--cp-rows-state` | 680 px | `rows` | State and row actions become columns; the row is one line; the column header appears. |
| `--cp-form-2col` | 560 px | `editor` | Editor fields go two-up. |
| `--cp-ctx-2up` | 720 px | `ctx` | Context blocks pair two-across (single-column record only — the rail is never this wide). |
| `--cp-fold-ref` | 640 px | `record` | Reference fold: Files / History / Payments closed below, open above. |

**Engineering floor: 320 px.** Verified in the mock: no horizontal overflow at 320 on any of the eight
screens. The mock's measured behaviour at 320 / 375 / 412 / 480 / 560 / 680 / 768 / 900 / 1024 / 1180 /
1280 / 1440 / 1920 is monotonic — every change point crosses once, in one direction.

**One honest consequence, stated rather than hidden.** Because the openings list responds to *its own*
width, the list is briefly narrower when the context rail appears than it was just before. With the
values above this never costs the list a column (at 1060 px record width the work column is 680 px,
exactly `--cp-rows-state`). If a future region changes the rail width, that relationship must be
re-checked — it is the one coupling between two change points in the system.

---

## 3. The frame

### 3.1 Top bar (all widths, sticky)

| Slot | Narrow (< `--cp-shell-rail`) | Wide |
|---|---|---|
| Menu | ☰, opens the drawer | hidden (rail is present) |
| Brand | shown **only when there is no record crumb** — otherwise the brand lives in the drawer/rail | in the rail |
| Back | `←`, one destination up | same |
| Crumb | `{publicRef}` (data face, never truncated) · `{title}` (truncates) | same |
| Freshness | hidden | `Loaded 14:38` |
| Refresh | `⟳` | `⟳` |
| Options | `⋯` | `⋯` |

The crumb is the record's identity **kept on screen while the page scrolls** — replacing register row
18's sticky header that carried only a capitalised tab name. Reference: rows 18, 51.

`⋯` opens a plain menu (not a dialog): `Showing prices inc GST — this customer's mode` with an
inc/ex switch, `Copy link to this record`, `Sign out`.

### 3.2 Navigation — one component, two presentations

Eight destinations, same list, same order, same DOM, at every width (rows 15, 16):
**Work · Records · Customers · Enquiries · Pricing · Files · Audit · Admin.**

- **< 1024 px** — overlay drawer from the left edge: 264 px / 82 vw, scrim, `Esc` closes, background
  scroll locked, safe-area padding, 44 px rows, focus trapped while open and returned to the ☰ button
  on close. **The drawer is never a route** (row 19) — opening it does not change the URL, and the
  browser back button never closes it.
- **≥ 1024 px** — persistent 224 px rail, active item marked by a sage left border **and** weight, never
  by hue alone (rows 16, 17).

There is no icon-only middle state. It was considered and rejected against the "even my mum could do it"
bar (§3.1): an unlabelled glyph column is a memory test, and the widths where it would apply are exactly
the widths where the drawer already works.

Rail footer carries the signed-in address, the role word, and `Sign out` (row 14).

### 3.3 Routing, deep links, boot

Path routing (ADR-0002). R1 registers `/`, `/record/:ref`, `/record/:ref/line/:lineId`.

- `/record/:ref/line/:lineId` scrolls that row into view and marks it: sage veil fill plus a 3 px sage
  inset left edge, and it receives focus. The mark persists until the operator interacts elsewhere; it is
  not a selection and nothing depends on it. (AC-25)
- Every destination is a URL; browser back returns to the prior destination; reloading any URL returns
  the console. (AC-26)
- **Boot order:** dark ops ground + spinner, no text (row 2) → `GET /api/ops/me` → sign-in screen
  (non-Access environments only) or the shell → brand resolves logo → business name → the literal word
  `OpenFrame`, never an invented mark (row 4). First paint is **not** blocked on Sanity hydration —
  row 1's blank-page block is a defect this design does not carry.
- **Unknown path:** a named screen — `That address doesn't exist in ops.` + `Go to work` — never a blank.

### 3.4 Sign-in (non-production only; register rows 5–13, D-2)

Carried verbatim, because the register requires it (AC-39) and because it is where every developer signs
in: card heading `Internal console — staff sign-in`; `Work email`; `Send code` / `Sending…`; six-digit
field, digits only, `••••••` placeholder, Enter submits; dev banner `Dev mode — code is {code}`;
`Sign in` / `Verifying…`; `← Change email`; `Something went wrong.`;
`Invalid code, or this email isn't authorised for the ops console.`; footer
`Authorised staff only. Access is logged.`

Two register rows are **repaired**, not carried, and both are flagged for the owner in §10:
row 7 (an invalid email makes the button silently do nothing) and row 13 (no statement of expiry).

### 3.5 Error boundary

A rendered screen, not a white page (row 25 records that no boundary exists today):
heading `This screen stopped working`, then *"Something in the console failed, not your record. Nothing
you had on screen was saved. Reload to carry on — you will come back to this same address."*, then
`Reload this screen` / `Go to work`, then a quiet line carrying the record ref, the time and a reference
code. Back still works (arch §3.3).

---

## 4. The record — block by block

Spine order, top to bottom, at every width:

1. Identity → 2. Phase ribbon → 3. Status band → 4. Action bar → **[work]** 5. Openings
→ **[context]** 6. Value → 7. *(R3 seam: Derivation)* → 8. Notes → 9. Files → 10. History → 11. Payments.

### 4.1 Identity (rows 50–53)

`{publicRef} · {title}` on one line, ref in the data face, never shown alone, never renamed.
Second line: `{org} · {customer} · {email}` with empties dropped, falling back to submit-time contact for
an anonymous submitter. Then the phone control (N1) and `Delivery to {suburb}`.

**The order number is deliberately not here** (row 51) — it stays in the Payments block footer.

### 4.2 Phase ribbon (rows 57–59)

Six equal cells: **Intake · Pricing · Issued · Accepted · Production · Delivered**. Passed cells filled
sage/white, current cell tinted with a 2 px sage underline and `aria-current="step"`, future cells
recessive. Never colour alone — position and weight carry it too.

Caption, verbatim shape: `Now · {stateLabel} · waiting on {us|customer|nobody} · {n} days in this state`.
`stateLabel` uses `lifecycleOf`'s own vocabulary (10 internal labels, 12 order stage labels) with no
parallel list in the client. At 320 px the six cells truncate with ellipsis rather than wrapping — the
current cell is always legible because the caption names it in full.

*(R4 adds `manufacturer` to the waiting-on vocabulary. The caption sentence does not change shape.)*

### 4.3 Status band

Exactly one of, directly under the ribbon:

| Condition | Band | Copy |
|---|---|---|
| Unresolved lines exist | warning | **`{n} lines are unpriced or unresolved`** — a quote cannot be issued until they are settled. + `Show only those lines` |
| Quote outside the editable set | info | **`This quote is issued`** — lines are read-only. Return it to pricing to change anything. Nothing is hidden: everything below is exactly what was issued. |
| No lines yet | info | Nothing has been configured yet. Lines appear here when a schedule is parsed or the customer submits a configuration. |
| none of the above | — | no band |

The read-only band **names the actual state and the way back** (AC-81, row 74), replacing legacy's
`Viewing an issued revision — read-only.` — a sentence about revisions, which no longer exist.

### 4.4 Action bar (rows 60–64)

Server-declared `actions[]`, rendered left to right in one wrapping row. Exactly one `tier: "primary"`
(filled sage). Inapplicable actions are omitted by the server; **blocked actions are rendered, dimmed,
with `blockedReason` as plain text beneath the row** — never a tooltip, never a hidden control.

`tier: "overflow"` is declared by the server and never produced (row 63). R1 renders it as a secondary
button if it ever appears, and the register row records that it is untested because it is unreachable.

**Confirm-in-place, never a modal** (row 64). Pressing an action with a `confirm` expands a panel
directly beneath the button row inside the same card: `{label}?` / the server's consequence sentence /
an optional single text input (`Bank reference, e.g. EFT-4821` · `What should the file record?` ·
`What do you need from the customer?`) / `Confirm` · `Cancel`. `Esc` closes it. Focus moves to the panel
heading on open and returns to the button on close.

**This is not a gate.** It is where the action's own text input lives; it never asks the operator to
justify a decision, and no action that merely differs from the estimator has one.

The note input honours the server's 500-character cap and says so at 450 characters
(`{n} of 500`) — repairing row 65, where the cap is neither shown nor enforced.

### 4.5 Openings — the folding list (rows 75–94)

Panel header: `Openings` + `{n} lines · {m} need review`. *(Legacy's three-way heading —
`Draft lines` / `Contract lines` / `Issued lines` — collapses to one word because there is only one list;
`CONTEXT.md`: "at every phase the customer sees one list of lines and one totals panel". Issued state is
carried by the read-only band, not by a renamed heading.)*

Columns, and where each goes as the list folds:

| Datum | < 480 px | 480–679 px | ≥ 680 px |
|---|---|---|---|
| Code | line 1 left | column 1 | column 1 |
| Product + room + configuration + flags + composite + frame system | line 2, full width | column 2 | column 2 |
| Size (**height × width**, row 87 — binding house convention) | meta line, with the quantity appended | column 3 | column 3 |
| Quantity | in the meta line (`· ×2`) | column 4 | column 4 |
| Line total | line 1 right | column 5 | column 5 |
| State (`ready` / `needs review` — the word carries it, row 89) | meta line right | row 2 right | column 6 |
| Actions (`edit`/`close`, `split`/`units`, `note`) | own row, 40 px targets | own row | column 7 |

Nothing is hidden at any width. The column header row exists only at ≥ 680 px, where columns exist to
label. Below that the list is a list, with each datum in a fixed position on the row.

Per-line facts rendered under the product name, in this order: room (row 81);
`configuration · {selectedVariantId}` (row 82); review reasons as a `<ul>` in warning ink via
`reviewReasons()` including the two special-cased labels (row 83); `composite · {n} joined unit(s)` with
the ` · A + B` suffix when units differ (rows 84–85); `frame system · {name}` or
`mixed frame systems · A + B — confirm these couple` in warning ink (row 86).

**Two repairs, both flagged in §10:**
- A line whose product is withdrawn or non-offerable **says so on the row** — `{option} — withdrawn from
  sale · the line still prices from its stored configuration`. Today that fact appears only inside the
  editor's product list. (AC-84)
- Each row carries a `note` action with a count. (AC-18, row 93.)

Quantity is displayed, never editable on the row (row 88). There is no margin, cost, markup, discount or
override column (row 91). **Add and delete arrive in R1** — §4.5a. Duplicate and reorder do not: neither
was asked for, reorder has no stored order to write to, and both can be added later without moving
anything designed here.

Empty state: **`No lines on this project.`** (row 79, verbatim) — followed, in the editable states, by
`+ Add the first opening`.

**Long content:** a 60-character product name wraps to two lines and the row grows; it never truncates,
because the operator is reading it aloud. Room, configuration and flags wrap freely. Only the top-bar
title truncates, and only because the full title is one scroll away in the identity block.

### 4.5a Adding and deleting an opening (N5)

Settled by the owner at the mock gate: *"full capabilities to manage any record(s), including adding new
or deleting"*. Both controls exist **only in the editable states** — the same `EDITABLE_STATES` set that
decides whether the editor renders at all (`submitted`, `triage_pending`, `estimator_assigned`,
`technical_review_required`, `customer_clarification_required`; `worker/routes/ops.ts:640`). Outside it
neither control is present and the read-only band already says why. That containment is doing real work:
it puts add and delete entirely inside Intake and Pricing, so no order line, payment or issued quote is
ever within reach of them.

**Add — `+ Add opening`**, a quiet full-width control at the foot of the openings list, and the empty
state's `+ Add the first opening`.

1. Pressing it appends a **draft row at the end of the list** with its editor already open and focus in
   the Item ID field, pre-filled with the next free code in the record's own sequence (`W07`).
2. The draft row is marked `not saved yet` and is not counted in `{n} lines` or in any total. Nothing
   exists server-side until Save.
3. `Save line` creates it; `Cancel` removes the draft row with no request and no confirmation — there is
   nothing to lose that the operator did not just type.
4. Adding while offline is refused the same way any write is: level-3 failure at the Save control, values
   retained, `Try again`.

**Delete — `Remove opening`**, in the **editor's footer**, not on the row.

Placement, argued rather than assumed: this is the one act on the record that cannot be taken back (undo
is vetoed by decree), and a `delete` link sitting beside `edit` / `split` / `note` on every row is a
40 px thumb target next to three others on a phone held one-handed. Putting it inside the editor for
that line is **placement, not a gate** — it is one press away, it is never disabled, and no reason is
ever asked for.

Confirm-in-place, in exactly the shape the console already uses for removing a unit (row 115):

> **Remove W03?**
> Its 2 joined units go with it. Notes written against this line stay on the record.
> `Remove` · `Keep`

The consequence sentence is composed from what is actually true of that line, and it is honest about the
cascade because the schema is: a composite parent's units are `quote_line.parent_line_id ON DELETE
CASCADE` (`migrations/0028`), while comments, parse items, opening instances and the two learning tables
are all `ON DELETE SET NULL` — so notes, provenance and learning survive the line. The second sentence is
dropped when the line has no units; it never claims a cascade that will not happen.

On success the row leaves the list, the totals bar and the Value block take their new figures from the
same response, and a level-4 sentence is **not** shown — a completed act needs no notice. The `audit_event`
records it exactly as every other ops action is recorded (AC-40c); that is the existing trail, not a new
journal.

**Deleting the line you are looking at via a deep link** (`/record/:ref/line/:id`): the row goes, the URL
falls back to `/record/:ref`, and the list states `That opening was removed.` for as long as the record
stays open. Reloading the old URL lands on the record with `That opening no longer exists on this record.`
— never a 404 and never a blank (AC-26).

### 4.6 The line editor (rows 95–111)

**Inline, expanding beneath its own row.** Not a drawer, not a modal, not a route. This is the one model
that is identical at 320 px and 1920 px: at 320 it naturally fills the viewport; at 1440 it opens inside
the work column with the rest of the list still on screen. It also means resizing mid-edit re-parents
nothing (AC-12).

Contents, in order:

1. **Heading** `{code} · {product}` and the standing line *"Everything here is a proposal. Change
   anything; nothing has to be justified."*
2. **Divergence warning, when there is one** — an unobtrusive band, `role="status"` (never `alert`,
   never `dialog`), that does not take focus, does not disable Save, and needs no dismissal:
   *"The estimator proposed this configuration to meet Uw ≤ 2.27; what is selected reaches Uw 2.41.
   Saving is not affected."* + `See the derivation` (inert in R1; R3 wires it). **AC-2 in one element.**
3. **The exact frame + glazing configuration select** for estimator-managed lines, with its four states
   carried verbatim (row 107) and its option label composition
   `{product} · {frameTech} · {glazing} · Uw · SHGC` (row 108).
4. **`ItemForm`, reused — not forked** (row 95). Item ID (max 10, uppercased, `Item ID already exist`);
   product selects with the `— withdrawn from sale` and `— different frame system` suffixes and
   `includeDisabled`; the Dimensions disclosure, **height first**, with the live elevation and the range
   hint `Fits {minH}–{maxH} high, {minW}–{maxW} wide.`; **the size junction, §4.6a**; the note field
   (max 500) → `room_label`; the Options disclosures with glazing first, colour swatches and
   ` · required`.
5. **Price preview** — debounced 250 ms, server-priced, with the GST suffix and ` · {unit} ea`
   (row 101). Presentation is adjusted through the wrapper only; the shared component is not copied.
6. **`Cancel` / `Save line` (`Saving…`)** and the standing footnote
   `Confirmed on technical review before any deposit. Supply only.`
7. **Resolve checkbox** `I checked and resolved: {reasons joined by "; "}` — unchecked keeps the flags
   (rows 109–110). It resolves review flags **only when the operator asks**; nothing resolves them as a
   side effect of saving.

**Save is disabled only where no request could be formed** — no product chosen, a duplicate item ID, a
missing required option. It is **never** disabled by a dimension, and never because a value disagrees
with the estimator; and the reason is always printed at the control rather than left to be guessed
(repairing row 105's silent `canSave`). See §4.6a for the dimension half, which is now settled.

**Closing the editor with unsaved values does not open a dialog.** Legacy's
`Discard changes? / Discard / Keep editing` (row 104) is replaced: the values stay in the record's
editing state, the row is marked `unsaved edits`, and reopening the editor restores them. They are
discarded when the operator leaves the record. This is **not** an undo affordance and **not** a journal:
nothing is written anywhere, nothing is retrievable after leaving, and no previous value is stored — it
is simply not throwing away input the operator is still holding.

### 4.6a The size junction (N4) — replaces "the undersize block"

**A correction to my first draft, and it matters.** I asked whether undersize should warn or block. The
answer is *warn, never block*, and reading the code to design that answer showed my question had the
domain the wrong way round:

- **Oversize does not block today and never did.** `ItemComposer.tsx:693–735`: an oversize line saves,
  takes `status: "Needs review"` and carries `review.fit` = *"No single unit is made at this size — we
  will confirm how it is built and price it at technical review."* The owner deliberately removed the
  customer-facing oversize notice (`ItemComposer.tsx:169`) because a customer cannot change the size of
  their wall.
- **Undersize is the blocker** (`canSave` … `&& !tooSmall`), with the copy *"{product} starts at {minH}
  high and {minW} wide. Check the measurement."* — and the code's own comment calls it a typo guard.

So the owner's ruling lands in two places, not one.

**Undersize, in ops2: warns, does not block.** The typo guard was written for a customer typing their own
schedule. The ops operator has usually just been told the measurement over the phone, and the rule is
categorical — *"warn, do not block humans decisions."* The existing sentence is carried verbatim, moved
from a blocking danger notice to a warning at the field, and `Save line` stays live. If the server refuses
it, level-3 failure states that plainly, which is the honest outcome either way.

**Oversize, in ops2: a junction with two routes, both in reach.** This is the substance of the owner's
answer. A bare "too large" makes the operator recall the remedy while a customer waits; the notice should
carry it. Rendered at the dimensions field, `role="status"`, taking no focus and disabling nothing:

> **2400 mm is wider than a Awning window is made — 1810 mm is the maximum.**
> This is normal on a large opening. Two ways forward:
> `Split this opening into units` — build it as 2+ joined products, e.g. awning + fixed.
> `Ask the manufacturer` — confirm whether a larger-than-standard unit can be made, and at what price.
> Saving is not affected. This line carries a **fit** flag either way, and prices best-fit until it is settled.

**Route 1 — Split this opening.** Reuses the existing planner (`POST /lines/:id/split`, register rows
121–126) with nothing invented. The control opens the same panel the row's `split` link opens, with two
values **proposed, not imposed**:

- **Axis** from which dimension is over: wider than the maximum → `Side by side`; taller → `One above
  another`. Both radios remain selectable.
- **Units** = the smallest count that brings each unit inside the range (2 for almost everything), with
  the planner's existing even-split sizes.

The awning + fixed case completes through paths that already exist: apply the split, then open unit 2 and
change its product. The unit editor is `ItemForm scope="unit"` with
`compatibility={{siblingSlugs, enforce:false}}` (rows 117–118), so a different product — even one on a
different frame system — stays selectable and is marked rather than refused. **The one addition is a
sentence in the units panel after a split lands**, so the next step is not a guess:
*"Each unit can be a different product — open a unit to change it."*

**Route 2 — Ask the manufacturer.** This is D10's "with manufacturer" state, and **it is R4's, not R1's**
(`project.with_manufacturer_since`, `POST /projects/:id/with-manufacturer`; arch §7). R1 shows the seam
honestly rather than pretending the junction has one route:

- The control renders, labelled `Ask the manufacturer`, and is marked as arriving with the work queue —
  the same visual treatment as the R3 derivation seam, so an unbuilt thing never looks built.
- Until R4, the route that works is the one the console already has: `Add a note` on the record, whose
  composer opens pre-filled with `Manufacturer: can this be made at {height} × {width}? ` and the caret
  after it. That is a real capability today (row 149, `POST /projects/:id/note`), and it is what the
  founders do now.
- **When R4 lands, the seam becomes the real control and the pre-filled note stops being offered.** That
  swap is a one-component change and is recorded here so R4 does not leave two ways to do it.

**The `fit` flag is the through-line.** Whichever route is taken — or neither — the line keeps
`review.fit` and the row shows it via `reviewReasons()` (row 83), so an unsettled oversize opening is
visible on the record without anyone having to remember it. Resolving it is the operator's explicit act
through the resolve checkbox (rows 109–110), never a side effect of saving.

### 4.7 Composites (rows 112–126)

Unit rows render nested beneath their parent on a recessive fill, using the same folding row component:
ordinal · product + `SpecSummary` (`Spec: as the opening` / `Spec: {n} changed — {key} {value}`) ·
size · `{n}× per opening` · total · `edit` / `remove`. `not priced` marks a unit whose status is not
ready. Removing a unit confirms in place: `Remove unit {n}?` / `Remove` / `Keep`.

After a split lands, the units panel carries one sentence so the awning + fixed route does not have to be
remembered: *"Each unit can be a different product — open a unit to change it."* (§4.6a, Route 1.)

Coverage is **reported, never vetoed** (AC-86) — the footer row carries `+ Add unit` (or
`Maximum {n} units` at the cap) and one of the coverage sentences verbatim, including
`Units span {n} mm, {n} mm more than the opening. Allowed — recorded on the line.`

Split planner and merge panel open inline under the row, carrying their copy verbatim: the intro
sentence, `Joined` with `Side by side` / `One above another`, the `Units` select, the per-unit size
fields, `Split into units` / `Applying…`; and for merge the three-sentence explanation and
`Merge back to one` / `Merging…`. All eleven composite validation strings and the three split/merge error
strings are carried (rows 124, 126).

### 4.8 Value, GST and delivery honesty (rows 54, 85; AC-79/80/85)

The Value block, in the context pane:

```
$46,180  INC GST
estimate · this customer's account shows prices inc GST
─────────────────────────────────
Goods · 6 lines                $44,930
Delivery                  not yet priced
Zone: Melbourne Metro East, matched by postcode. The zone has no
rates yet, so no delivery figure can be shown — this is not $0.
```

- **Every money figure on the record carries its GST mode.** Today the record labels nothing at all
  while the embedded `ItemForm` says `inc GST` — the two disagree in silence. Primary figures are in the
  **project owner's** `price_gst_mode`, resolved through `src/data/gst.ts`, and the basis word
  (`estimate` / `issued` / `contract`) is kept (row 54).
- The `⋯` menu's inc/ex switch is **view-only**: it changes nothing stored and no customer surface
  moves (AC-80). While it is switched away from the customer's mode the label reads
  `Prices shown ex GST — this customer's mode is inc`, so a number can never be read aloud in the wrong
  mode without the screen saying so.
- **Delivery has four distinct renderings** (AC-85): a figure; `not yet priced` in warning ink with the
  zone and basis stated; `matched to the fallback zone` where basis is `fallback_zone`; and
  `no zone resolved` where it is absent. `$0` is never used for any of them.

### 4.9 Notes, Files, History, Payments

**Notes** (row 149, AC-18) — never folds. Newest first, each with a 2 px sage left edge and a
`{kind} · {author} · {when}` byline. A note attached to a line carries its **code as a chip that links to
`/record/:ref/line/:id`**. Composing: the `note` action on a row opens a one-field composer beneath that
row and posts `lineId` (register row 280); the record-level `Add a note` action posts without one. The
7th-and-beyond note is reachable via `Show all` — repairing row 149's unreachable 7th note.

**Files** (row 150) — filename, size, kind and date. A file whose scan verdict is `unknown` or
`scanner_misconfigured` renders **`Not scanned — this file is not known to be safe`** in warning ink and
is never presented as clean (D-3, AC-85a). Download is R5's; R1 states the file, does not serve it.

**History** (row 151) — first 8 events, `Show all {n} events →`, server sentences rendered as text,
spanning project and order. **Unchanged in content and retention** (AC-40c).

**Payments** (rows 153–155) — `{kind} · {percent}% · {reference}` / `{money}` over `{status}`;
empty `No payments recorded.` extended with *"Payments begin when the quote is accepted and an order is
raised."*; footer `Order no. {n} · appears on invoices`.

### 4.10 The totals bar (N2)

One component, pinned to the bottom edge of the record at every width.

| State | Left | Right |
|---|---|---|
| Idle | `QUOTE TOTAL · {n} LINES · {delivery state}` / `$46,180 inc GST` | the primary action, mirroring the action bar's enablement and reason |
| Editor open | `THIS LINE` / `$9,860 inc GST` **and** `QUOTE TOTAL` / `$46,180 inc GST` | `Cancel` · `Save line` |
| Saving | both figures go quiet; the Save button reads `Saving…` | — |
| Save failed | figures return to their last server-stated values | `Try again` |

**Both figures are bound to the same server response** (`quoteTotals` from the line-mutating endpoints,
arch §5.4). The client never sums money. A figure that is momentarily stale is rendered quiet rather
than confidently wrong.

---

## 5. Failure — the four levels (I6, D15, AC-20…23)

Nothing fails silently, and failure is rendered **at the thing that failed**, never in a page-level strip
(repairing row 66).

| Level | Surface | Behaviour |
|---|---|---|
| **1. Connection** | a red band under the top bar, `role="status"` | **`Not connected.` Nothing can be saved until this clears. What is on screen has not been sent.** + `Try now`. Persistent while offline, non-blocking, never a dialog, never steals focus. Nothing on screen is re-rendered as stale or removed. |
| **2. Pane** | inside the failing block's own frame | The block's `Loadable` error state: one sentence naming the cause + `Try again`. Every other block stays live and current. |
| **3. Control** | beneath the control | `WriteState.failed` — the sentence, the entered values still present, `Try again`. Retry re-sends the same payload. |
| **4. Action** | beneath the action bar | The `ACTION_ERRORS` sentence for the code, carried verbatim (row 67); unmapped codes fall through to `That action could not be completed.` — and R1 adds a `Reload this record` control beside every sentence that tells the operator to reload, which today no screen provides (row 71). |

**The issued-while-editing conflict (AC-23).** Server answers 409 `not_editable` with `statusInternal`.
The editor renders, at the save control:

> **This quote was issued while you had it open — your edit wasn't saved.**
> Lines are read-only until it returns to pricing. Nothing on this screen has been sent.
> `Try again` · `Reload this record`

The entered values remain on screen; nothing is rendered as saved; no generic failure and no silent 404.

**Freshness.** The top bar states `Loaded HH:MM` and offers `⟳` (repairing row 26 — no refresh control
exists anywhere today). `⟳` refetches the record; the timestamp updates only on a successful response.

---

## 6. Keyboard and focus

The console is operated at speed, one-handed on a phone and two-handed at a desk. Both must work.

| Key | Where | Action |
|---|---|---|
| `Tab` / `Shift+Tab` | everywhere | Visible focus ring (2 px sage, 2 px offset) on every interactive element. DOM order equals visual order at every width. |
| `Enter` / `Space` | any row action | Activates it. Rows themselves are not clickable — every action is a named control. |
| `e` | list focused | Opens the editor on the focused row |
| `Esc` | editor open | Closes the editor, keeping unsaved values (§4.6) |
| `Esc` | confirm panel / drawer open | Closes it, returning focus to the control that opened it |
| `Ctrl/⌘+Enter` | editor | Save line |

**Focus survival across a fold (AC-12).** Editable state lives in the record's view-model hook, keyed by
field identity, never in the leaf that is re-parented. When a structural fold re-parents a focused
element, the folding component restores focus to the same field identity and the caret position with it.
Scroll position is anchored on the row that was in view. This is a contract of the folding component and
is tested, not left to luck.

**Screen readers.** The openings list is a list at every width — column alignment is presentational, so
no ARIA role changes as it folds. Below the fold each datum carries a visually-hidden label
(`Size`, `Quantity`, `Line total`, `State`); above it the column header row supplies them. The phase
ribbon is a `<ol>` with `aria-current="step"`. Warnings are `role="status"`; **nothing on the record uses
`role="alert"` or `role="alertdialog"`** except the level-3/4 write failures, which are genuine alerts
about the operator's own action (AC-2 forbids the dialog roles for *divergence*, not for a failed save).

**Touch.** 44 px minimum on nav rows, buttons, disclosures and option chips; 40 px on the per-line action
links below the row fold, tightening to 20 px above it where a pointer is the likely input — decided by
container width, never by a touch-capability query.

---

## 7. Component reuse map

| Design element | File (arch §2.1) | Reuse |
|---|---|---|
| Nav frame, drawer + rail | `shell/Shell.tsx` | new, one component, two presentations |
| Brand | `shell/Brand.tsx` | logo → businessName → `OpenFrame` |
| Sign-in | `shell/SignIn.tsx` | copy carried verbatim from rows 5–13 |
| Boot / crash / not-found | `shell/ErrorScreen.tsx` | new |
| Change points, palette slots | `layout/tokens.css` | §2 above is its content |
| Folding list | `layout/RowList.tsx` + `Fold.tsx` | **one** component; used by the openings list, the unit rows and the interim record list |
| Width hook | `layout/useContainerWidth.ts` | the reference fold only |
| Identity | `record/RecordHeader.tsx` | rows 50–54 + N1 |
| Ribbon | `record/PhaseRibbon.tsx` | `lifecycleOf` vocabulary, no parallel list |
| Actions + confirm | `record/ActionBar.tsx`, `ConfirmInline.tsx` | server `actions[]`, row 64 copy |
| Openings | `record/LineTable.tsx` | wraps `RowList` |
| Editor | `record/LineEditor.tsx` | **wraps the shared `ItemForm`** — never forked; presentation adjusted in the wrapper (arch §2.1) |
| Composites | `record/CompositePanel.tsx` | rows 112–126 |
| Notes | `record/NotesBlock.tsx` | posts `lineId` |
| Files / History / Payments | `record/FilesBlock.tsx` etc. | all three are `card fold` |
| Read-only band | `record/ReadOnlyBar.tsx` | names the real cause |
| Value + totals bar | *new: `record/ValueBlock.tsx`, `record/TotalsBar.tsx`* | both read `quoteTotals`; GST through `src/data/gst.ts` |
| Interim list | `home/InterimList.tsx` | `RowList` again, labelled interim |

**New props the shared `ItemForm` needs:** none. The wrapper supplies the GST mode through the existing
`GstContext` provider — which ops currently never mounts, which is why the editor says `inc GST`
regardless of the account. Mounting it is the fix, not a new prop.

---

## 8. The seams R1 leaves open

| Region | What R1 shows | Where it lands |
|---|---|---|
| **R3 — Derivation** | A labelled, deliberately flat placeholder block at the top of the context pane, naming what will be there and the question it answers. | Asking a line's "why" opens derivation at the top of the context pane, pushing the record blocks down. At ≥1440 it is beside the openings list, not instead of it (AC-14). |
| **R4 — Work** | The interim record list at `/`, with a band saying so in the owner's own terms. | The attention surface replaces the whole screen; `Work` is already the first nav destination. |
| **R4 — with manufacturer** | The `Ask the manufacturer` route on the size junction (§4.6a), rendered as a seam, with the pre-filled note as the working stand-in. The waiting-on caption already takes a fourth value without changing shape. | The seam becomes the real control; the mark also joins the action bar as a server-declared action; **the pre-filled note stops being offered**, so there are not two ways to do it. |
| **R2 — RBAC** | Nothing. R1 ships against today's staff gates (arch §5, R1 design §5). | Destinations a role may not reach stop being rendered; the refusal stays server-side regardless (AC-67). |
| **R5 — Files** | The record Files block states each file; no download, no rescan. | Downloads and the global Files list. |

The R3 placeholder is deliberately unstyled-looking. It is a seam, and a seam that looks finished is a
lie about what has been built.

---

## 9. Copy

### 9.1 Carried verbatim (AC-39)

Sign-in rows 5–13 · `No lines on this project.` · `Item ID already exist` ·
`Confirmed on technical review before any deposit. Supply only.` · `Save line` / `Saving…` ·
the four `ItemForm` validation sentences · the exact-configuration select's four states (row 107) ·
`I checked and resolved: {reasons}` · `Fits {minH}–{maxH} high, {minW}–{maxW} wide.` ·
`{product} starts at {minH} high and {minW} wide. Check the measurement.` (undersize — carried, no longer
blocking) · `No single unit is made at this size — we will confirm how it is built and price it at
technical review.` (the `fit` flag's own text) · all eleven composite validation sentences · the three coverage
sentences · `Split into units` / `Applying…` / `Merge back to one` / `Merging…` · the three split/merge
errors · `Remove unit {n}?` / `Remove` / `Keep` · all thirteen `ACTION_ERRORS` sentences plus
`That action could not be completed.` · `No payments recorded.` ·
`Order no. {n} · appears on invoices` · `Show all {n} events →` ·
`{n} line(s) is/are unpriced or unresolved — a quote cannot be issued until it is/they are settled.` ·
the server's confirm sentences.

### 9.2 New or restated in this design

| Where | Copy |
|---|---|
| Read-only band | **This quote is issued** — lines are read-only. Return it to pricing to change anything. Nothing is hidden: everything below is exactly what was issued. |
| Empty record band | Nothing has been configured yet. Lines appear here when a schedule is parsed or the customer submits a configuration. |
| Connection band | **Not connected.** Nothing can be saved until this clears. What is on screen has not been sent. |
| Conflict at the save control | **This quote was issued while you had it open — your edit wasn't saved.** Lines are read-only until it returns to pricing. Nothing on this screen has been sent. |
| Pane failure | The {block} couldn't be loaded — the server answered {status}. Everything else on this record is current. |
| Editor standing line | Everything here is a proposal. Change anything; nothing has to be justified. |
| Divergence warning | The estimator proposed this configuration to meet {requirement}; what is selected reaches {actual}. Saving is not affected. |
| Withdrawn product on a row | {name} — withdrawn from sale · the line still prices from its stored configuration |
| Unscanned file | Not scanned — this file is not known to be safe |
| Delivery, unpriced | not yet priced — Zone: {zone}, matched by postcode. The zone has no rates yet, so no delivery figure can be shown — this is not $0. |
| GST switched away | Prices shown ex GST — this customer's mode is inc |
| Row marked with unsaved input | unsaved edits |
| Oversize junction | **{n} mm is wider than a {product} is made — {max} mm is the maximum.** This is normal on a large opening. Two ways forward: `Split this opening into units` — build it as 2+ joined products, e.g. awning + fixed. `Ask the manufacturer` — confirm whether a larger-than-standard unit can be made, and at what price. Saving is not affected. This line carries a **fit** flag either way, and prices best-fit until it is settled. *(“taller than … is made — {max} mm is the maximum” for the height case.)* |
| After a split | Each unit can be a different product — open a unit to change it. |
| Pre-filled manufacturer note (until R4) | Manufacturer: can this be made at {height} × {width}? |
| Add controls | `+ Add opening` · `+ Add the first opening` |
| Draft row | not saved yet |
| Delete confirm | **Remove {code}?** Its {n} joined units go with it. Notes written against this line stay on the record. `Remove` · `Keep` |
| Deleted line, same session | That opening was removed. |
| Deleted line, reloaded deep link | That opening no longer exists on this record. |
| Unknown path | That address doesn't exist in ops. + `Go to work` |
| Crash screen | This screen stopped working / Something in the console failed, not your record. Nothing you had on screen was saved. Reload to carry on — you will come back to this same address. |
| Interim list band | **Interim list.** R4 replaces this with the attention surface — what needs doing, and where the catalogue has gaps. Until then this is how you reach a record without pasting a URL. |

Register rows carrying copy that this design **restates** rather than carries — each needs the owner's
eye under AC-37/AC-39, and is listed in §10: rows 50, 72, 73, 74, 75.

---

## 10. Register dispositions this design proposes

Not the designer's to close — recorded here so the owner sees them at the gate (AC-37) and the tester
has the proposed state to verify against.

| Row | Capability | Proposed | Why |
|---|---|---|---|
| 50 | `← All projects` back control | **RESTATED** | The destination is now Work/the record list. Back is the top-bar `←` and the browser's own back, which today does not work at all (row 24). |
| 72 | Version tabs `Live draft / R3 / R2 / R1` | **DROPPED** | Quote revisions were removed from the product ("a quote is a quote"). Selecting a tab already did not load that revision's lines. There is one list. |
| 73 | Hard-coded literal `editing elsewhere` | **DROPPED** | It was never true — a literal, not a fact. Live presence is deferred (D16). |
| 74 | `Viewing an issued revision — read-only. [Back to the live draft]` | **RESTATED** | Same capability — a read-only state named on screen — but naming the *real* cause and the real way back (AC-81). |
| 75 | Panel header `Draft lines / Contract lines / Issued lines` | **RESTATED** | One list, headed `Openings`. The state is carried by the read-only band. |
| 76 | Contract-line shim (flattens rows to `ready`, drops composite structure) | **DROPPED** | It existed to render the revision snapshot. With one list there is nothing to flatten; composite structure is never dropped. |
| 92 | No add-line, delete-line, duplicate or reorder | **REPAIRED (add, delete) · carried (duplicate, reorder)** | Owner settled add and delete into R1 at the mock gate (§4.5a). Duplicate and reorder were not asked for and reorder has no stored order to write to. |
| 98 | Dimensions disclosure … undersize danger copy | **REPAIRED** | The sentence is carried verbatim; it stops blocking Save and becomes a warning at the field (§4.6a). |
| 105 | `canSave` guards (price preview, undersize, duplicate code, blocking issues) | **REPAIRED** | Undersize leaves the guard set entirely; the remaining guards are the "no request could be formed" set and each prints its reason at the control instead of silently deadening the button. |
| 7 | Invalid email → the button silently does nothing | **REPAIRED** | Silent failure is what I6 exists to end. `Enter a work email address.` at the field. |
| 13 | No expiry stated (server expires at 10 min) | **REPAIRED** | `The code expires 10 minutes after it is sent.` |
| 26 | No manual refresh control anywhere | **REPAIRED** | `Loaded HH:MM` + `⟳`. |
| 53 | `contactPhone` fetched, never rendered | **REPAIRED** | N1. |
| 65 | Note cap of 500 neither shown nor enforced | **REPAIRED** | Counter at 450, enforced at 500. |
| 66 | Every failure lands in the header error strip | **REPAIRED** | §5's four levels. |
| 71 | Four messages say "reload"; no reload control exists | **REPAIRED** | `Reload this record` beside each. |
| 93 | No per-line notes UI | **REPAIRED** | §4.9 (AC-18). |
| 149 | 7th note unreachable | **REPAIRED** | `Show all`. |
| 23 | `Placeholder` component | **DEAD** | No call sites. |
| 159, 160, 274 | `orderDto.files[]`, `GET /orders`, `GET /orders/:id` | **stay unsurfaced** | The record plane is the merged truth; recorded, not rediscovered. |
| 286 | `revision_line` snapshots | **not retrievable, stated** | Revisions are gone from the product; there is nothing to state on screen because there is nothing a user could look for. |

---

## 11. Assumptions

- ~~`ASSUMED:` Undersize dimensions warn, they do not block.~~ **Settled by the owner at the mock gate —
  warn, never block — and widened by the domain he supplied. See §4.6a, which is now a design, not an
  assumption.**
- `ASSUMED:` **The oversize junction proposes an axis and a unit count.** Which dimension is over decides
  the axis; the smallest count that brings each unit inside the range decides the number. Both are
  proposals in a planner whose controls stay fully live — but they are proposals the console did not make
  before, and a founder may find the proposed split wrong often enough to prefer a blank planner.
- `ASSUMED:` **`+ Add opening` appends to the end of the list.** There is no stored line order to insert
  into, so "at the end" is the only honest position.
- `ASSUMED:` **A deleted item code is immediately reusable.** The duplicate check runs against lines that
  exist, so deleting `W03` frees `W03`. No design prevents it and none should.
- `ASSUMED:` **Notes never folds.** All four reference blocks could fold; Notes is exempt because it is
  the one used during the call.
- `ASSUMED:` **The reference fold threshold is 640 px of record width**, and the fold is remembered per
  block once the operator touches it (`data-user`), so a manual open is not undone by a resize.
- `ASSUMED:` **The GST view switch lives in the `⋯` menu, not on the record surface.** It is used rarely;
  a permanent segmented control would be a permanent invitation to read a number in the wrong mode.
- ~~`ASSUMED:` Deleting nothing.~~ **Settled: add and delete are in R1 (§4.5a).**

---

## 12. Decisions needed

Only the owner can settle these. Everything else in this document is derived from the spec, the design,
the register or the conclusions.

**Answered at the R1 mock gate, recorded so the trail is readable:**

- ~~*Undersize — warn or block?*~~ **Warn, never block**, and the answer carried domain that turned the
  oversize case into §4.6a's junction.
- ~~*Add and delete a line?*~~ **Yes, in R1** — §4.5a.

**Open:**

1. **Record-level deletion — withdraw/archive, or hard delete?** The owner's words were *"full
   capabilities to manage any record(s), including adding new or deleting"*, and I am deliberately not
   reading a delete-the-project control out of that clause. **Recommendation: `Withdraw record`, not
   hard delete**, with hard delete reserved for genuine mistakes and specified separately if wanted.
   Three reasons:
   - **It is a data decision, not a UI one.** A project cascades to quote lines, order lines, payments,
     files, comments, events and the R3/R4 tables. This repo has already lost production rows to an
     unexamined cascade (20 `order_line`, 4 `payment`). Any hard delete needs the architect and the
     `d1-migration-safety` procedure before a control is drawn for it.
   - **The codebase already prefers the gentler pattern** and it is in `CONTEXT.md`: a product is
     *withdrawn from sale* rather than deleted, and the offerability gate withholds it. A withdrawn
     record would leave the queue and the lists, keep its history, and stay reachable by its ref.
   - **Line deletion, which he definitely asked for, is already safe** because it is confined to the
     editable states (§4.5a) — so the capability he named is delivered in R1 either way, and this
     question is only about the record itself.
   What I need: whether "deleting" meant *"get this off my list"* (withdraw) or *"this record should
   never have existed"* (hard delete). If both, they are two controls with two consequence sentences,
   and the second needs the architect first.

2. **On a phone, should the bottom bar carry the primary action (`Issue`) as well as the totals?**
   The mock does, dimmed with its reason, because at 320 px the action bar is a scroll away. The cost is
   that the record's most consequential control is under the thumb all the time. **Recommendation: keep
   it** — it is dimmed and reason-stated whenever it is not available, and confirm-in-place stands
   between it and the act. Say if that feels too close to hand. *(Held until the treated mock is seen.)*

---

## 13. Server work R1 now needs that the R1 design does not have

**A finding for the architect, not a decision for the owner.** `docs/design/ops2-r1-frame-and-record.md`
§2.2 states *"No new endpoints. No migrations."* That was true of the design as written. **N5 makes the
first half false**, and it should be corrected there rather than discovered by the developer.

Verified against the current tree:

| Need | Exists? |
|---|---|
| Create a quote line as staff | **No.** `worker/routes/ops.ts` has `POST /lines/:id/split`, `/merge`, `/price-preview`, `/segments`, `PATCH /lines/:id`, `DELETE /segments/:id` — and no line create. |
| Delete a quote line as staff | **No.** `DELETE /segments/:id` removes a *unit*, not a line. |
| Nearest existing thing | `PUT /api/projects/current/lines` (`worker/routes/projects.ts:266`) — the customer's own bulk line replace, scoped to the claim/session, not usable from ops. |

So R1 needs two additions, both inside the existing staff gates and the existing editable-state guard:

- `POST /api/ops/projects/:id/lines` → creates one line on a project in `EDITABLE_STATES`, returns the
  created line **and `quoteTotals`** (arch §5.4's contract, so the totals bar moves on the same response).
- `DELETE /api/ops/lines/:id` → 404 `not_found` when missing, **409 `not_editable` with `statusInternal`**
  when the project is outside the editable set (the same split the architect already specified for
  `PATCH /lines/:id`), returns `quoteTotals`. Units cascade by the existing
  `quote_line.parent_line_id ON DELETE CASCADE`; everything else on `quote_line` is `ON DELETE SET NULL`.
  Both write an `audit_event` as every other ops action does.

**No migration.** The cascade already exists (`migrations/0028`); nothing is added to the schema. The
`d1-safety` note worth carrying forward: **R3's `line_baseline` will become a second cascade child of
`quote_line`**, which is already recorded in arch §6.2 — the delete path must be re-read when R3 lands,
not because it breaks, but because that is the discipline.

`AC-40`'s endpoint accounting gains two rows. `AC-4`'s "no control is disabled" sweep gains two controls.

---

## 14. Changes required in the mock

The mock is with the ui-designer for its visual pass, so this section is the change list to apply
afterwards — not applied here. Nothing below alters the layout system, the change points, or any
existing component's structure; every item is content or one control inside a frame that already exists.

| # | Screen / place | Change |
|---|---|---|
| M1 | `record`, `editing` — foot of the openings list | Add the `+ Add opening` control, quiet, full width, inside the list card. |
| M2 | `empty` | Add `+ Add the first opening` beneath `No lines on this project.` |
| M3 | new state on the `editing` screen (or a sixth record variant, `adding`) | A draft row `W07` at the end of the list, marked `not saved yet`, editor open, Item ID focused, product empty. |
| M4 | `editing` — editor footer | Add `Remove opening`, and show its confirm-in-place panel: **Remove W02?** / *Notes written against this line stay on the record.* / `Remove` · `Keep`. Use W03 in one frame so the units sentence appears. |
| M5 | `editing` — dimensions area | Replace nothing; **add** the size junction band (§4.6a) with its two routes as controls. Set the sample line's width over its maximum so the band is truthful for the data on screen. |
| M6 | `editing` — the `Ask the manufacturer` control | Render it with the **same seam treatment as the R3 derivation block**, and put the pre-filled note text (`Manufacturer: can this be made at 2100 × 3600?`) beside it as the R1 stand-in. |
| M7 | `record`, `editing` — W02's flag list | Add the `fit` flag sentence *"No single unit is made at this size — we will confirm how it is built and price it at technical review."* so the row and the junction agree. |
| M8 | `editing` — composite units panel (W03) | Add *"Each unit can be a different product — open a unit to change it."* |
| M9 | `issued` | Confirm `+ Add opening` and `Remove opening` are **absent** — that screen is the proof that both are confined to the editable states. |
| M10 | harness | Screen list gains `Record · adding` if M3 becomes its own variant. |

Two things that must **not** change: the openings list's column set (add/delete introduce no column), and
the change-point table — the junction band and the draft row live inside containers that already reflow,
and both were checked against the 320 px measure before being specified.
