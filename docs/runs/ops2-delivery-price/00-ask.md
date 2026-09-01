# 00 — The ask: delivery in ops2

**Stage 0, the grill. Conducted with the owner 2026-09-01, not by an agent.**
The decisions below are binding on every later stage. Where a stage disagrees
with one, the stage is wrong.

## The ask

> "next feature for ops2: ability to update delivery price for the project."

Widened by the grill to two surfaces, because the price and the destination
turned out to be different facts belonging in different places.

## Actor and need

**Staff** (`CONTEXT.md` §Actors) — an OpenFrame ops-console operator.

A project cannot be quoted until delivery is settled: `project.delivery_amount`
is the issue gate, and NULL means no human has said a number. Today the only
place a staffer can say that number is the **legacy console**. Every quote that
goes out therefore requires leaving ops2 mid-job, and the fact that blocks
issuing is invisible on the screen where issuing happens.

The need is not "an editor for a column". It is: *settle the figure that is
holding this quote, without leaving the console I am working in.*

## What already exists — this is mostly a UI feature

- `PUT /api/ops/projects/:id/delivery` (`worker/routes/ops.ts:752`) settles,
  corrects or un-settles. Accepts `amount` (≥ 0, or `null`), optional
  `postcode`, optional `note`. Stamps `delivery_settle_json` with the machine's
  answer at that instant, writes an audit event carrying both numbers, and
  refuses anything past `draft`/`ISSUABLE_FROM` with 409.
- `buildDeliveryDto` (`worker/routes/ops.ts:461`) already returns 19 fields:
  zone, basis, caveats, m², rate, min/max, live estimate, which side of the
  clamp bound it, the settled-at estimate, note, who, when, and `editable`.
- `src/ops2/projects/record.ts` maps **7** of those. ops2 renders delivery as
  text — `ProjectRecordPage.tsx:732`: *"DELIVERY IS TEXT HERE… there is no
  delivery screen in this build."*
- The destination is exactly two columns, `delivery_suburb` and
  `delivery_postcode`. There is no street line in the schema. Both are written
  once, by the customer's own submit form (`worker/routes/quote.ts:268`);
  **neither console can change them today.**

## Decisions

**D1 — Two surfaces, not one.** The price and the destination are different
facts and are edited in different places. The panel under the item list is for
setting the price and nothing else; the address belongs to the Project tab.
No surface does both.

**D2 — Both are slide-outs.** `OpenablePanel` door → `SidePanel phoneForm="side"`,
the pattern the Price panel established. Right-hand slide-out at every width.

**D3 — The price panel sets the amount only.** No postcode field, no note
field, no zone editing. A staffer who needs to fix the destination goes to the
Project tab.

**D4 — Setting the price is one way.** No un-settle control. *"No difference —
a price is a price"* (owner), the same ruling that governs the line price
panel. The figure can be corrected as often as needed; it cannot be returned to
NULL from ops2.

> Recorded consequence, raised at grill time and accepted: `delivery_amount =
> NULL` is the issue gate, so ops2 can never put a project back behind it. Only
> the legacy console can. This is the one place delivery differs from a line
> price, and it is a deliberate choice, not an oversight.

**D5 — No note.** The `note` column stays; nothing in ops2 writes it. The audit
event already records who set what and against which machine estimate.

**D6 — The address panel is the first real content on the Project tab.** That
tab is a placeholder today (*"Progress, payments and files are not built yet"*).
Whatever this panel establishes is the pattern progress, payments and files
inherit as they migrate.

**D7 — The address panel edits suburb AND postcode.** A panel called "Delivery
address" that can change one half of an address is not an address panel, and
postcode-only produces contradictions like `Richmond 3000`. This requires the
**only backend change in the feature**: `PUT /projects/:id/delivery` widens to
accept `suburb`. One field, one validation, one red test.

**D8 — Zone rates are out of scope.** They live in the legacy console's
Pricing → Delivery zones. All fifteen zones are believed to still carry NULL
rates in production (unverified — the remote D1 read was blocked at grill
time), which means `basis: "unpriced_table"` is the state ops sees every day.

> Design consequence: **the unpriced state is the normal state, not the error
> state.** A panel that treats "no machine estimate" as a failure will look
> broken on every project until the rates are entered. It must read as a
> dignified blank the staffer types into.

## Out of scope

Zone rate entry · the delivery note · un-settling · a street address field ·
any change to the issue gate itself · the legacy console.

---

# Amendment — owner, 2026-09-01, after the first mock

Two rulings at the mock gate. Both override what earlier stages produced.

## D9 — Project total is the bottom card; there is no Delivery card

> *"project total is the most bottom card. and if it includes delivery — then a
> separate delivery card duplicates the same information."*

The first mock drew the `rec-totals` card and then a separate `lp-panel`
"Delivery" card **below** it. Delete that card. The **`Delivery` row inside the
totals card is the door** — press the row, the price slide-out opens. Nothing
sits below Project total.

Consequence, to be drawn honestly rather than worked around: **the price door is
not `OpenablePanel`.** That component is a card with a title and a chevron; a
totals row is not a card. Do not reintroduce a card to keep using the component
— that is the duplication this ruling removes.

The address panel on the Project tab is unaffected and stays a card: that tab is
empty, so there is nothing there to duplicate.

## D10 — The delivery address is a full address, and it belongs to the project

> *"Account address is irrelevant — we're not delivering anything to it. And what
> if there are 2 active orders, what is the account address then? An order/project
> has its address, just like the form shows during order submission."*

**Supersedes D7**, which widened the endpoint by `suburb` alone.

The destination was modelled as two columns, `delivery_suburb` and
`delivery_postcode`. That is not an address. The owner's argument is decisive and
the codebase already agrees with its premise — `QuoteReviewSubmit.tsx:212`
already states the account address *"IS NEVER PRECEDENCE"* for delivery — it
simply gave delivery two fields instead of five.

The two-active-projects case is the proof: an account address is singular, a
project's destination is not. **The project owns its address.**

### The change

`project` gains three columns, giving it shape parity with the address the
submission form already shows:

| already there | added |
|---|---|
| `delivery_suburb`, `delivery_postcode` | `delivery_line1`, `delivery_line2`, `delivery_state` |

Additive `ADD COLUMN` only — no table rebuild, therefore no `ON DELETE CASCADE`
exposure. It is still a `migrations/` change: **load
`.claude/skills/d1-migration-safety/` before authoring the file**, number after
the highest existing migration, and state the children-affected line.

### Rules that do not change

- **Nothing prefills from the account address.** Not one field, not as a
  placeholder. `CONTEXT.md` §Delivery and migration 0053's own header both say
  so, and the reason stands: a tradie's site is their customer's, different
  nearly every time, and a wrong prefill stops the field being read.
- **The zone still resolves on postcode alone.** `delivery_state` is paperwork
  and display; it is not an input to `resolveZone`, and no line of delivery
  pricing may start reading it.
- A1–A5 are untouched.

### Scope boundary

The customer submission form still captures suburb and postcode only. Widening
it to the full delivery address is a **second phase on the customer site** — a
different app surface, split per the owner's standing rule on phasing
multi-area features. Until it ships, `line1`/`line2`/`state` arrive NULL and ops
fills them in. This feature must therefore treat a partial address as the
ordinary case, not an error.

---

# D11–D15 — the owner's answers to DECISIONS.md, restated here as binding

**These were answered in `DECISIONS.md` on 2026-09-01 and then LOST**, because
the `spec` stage is instructed to read only `00-ask.md`, `CONTEXT.md` and
`CLAUDE.md` — `DECISIONS.md` is not on its list. Re-running spec therefore threw
them away and the design reintroduced a caption the owner had already killed
twice. They live here now so they survive every future re-run. **If they ever
appear to conflict with a later stage's reasoning, they win.**

## D11 — No tax presentation. Ops has ONE way of showing figures.

Owner, verbatim: *"for one final time, hopefully — ops has only one way of
showing figures!!!! stick to that!"*

No `"includes tax"` caption. No `"excludes tax"`. No basis switch. No ex-GST
equivalent shown beside the field. No tax word of any kind, in either panel, in
any state, in a label, a placeholder, a caption or a hint.

The staffer types the figure **as charged to the customer**, which is what
`delivery_amount` already stores and what the legacy console already writes. The
field is labelled `Delivery price` and says nothing about tax, **because no
figure anywhere in this console ever does**.

> This differs from `PricePanel`'s segmented control on purpose. That control
> states what a *supplier* quoted — a fact about an incoming document. This is
> an ops figure being displayed, which is the thing the ruling governs.

> Accepted consequence, raised before the ruling and ruled on: a carrier invoice
> quoted ex-GST, typed straight in, under-recovers 10%. Ops owns the correctness
> of the number. **Do not re-open this and do not helpfully add a hint.**

## D12 — A single price, always.

Never two delivery figures on screen at once. No settled-versus-current-estimate
comparison, no delta, no percentage, no "the table now says $X".

A changed postcode moves the machine estimate and leaves the settled figure
exactly where it was, silently. Noticing and correcting it is ops's job.

> The legacy console DOES carry a delta (`ProjectRecord.tsx:874`, `+$40 · +7%`).
> ops2 does not. That is deliberate, not an omission awaiting restoration —
> see the standing rule that v1 is not the specification for ops2.

## D13 — Locked shows the figure only.

Past `draft`/`ISSUABLE_FROM`: no door, no chevron, no tab stop, and **no reason
line**. Just the number, or its "Not set" equivalent. Same rule for the address
panel. The owner does not want the console explaining itself.

## D14 — The address is never blanked from ops2.

Replace-only. A project that arrived without a destination can have one typed
in; one that has a destination keeps having one.

## D15 — Suburb is free text.

Trimmed, 1–80 characters. No gazetteer, no cross-check against the postcode. The
zone resolves on the postcode alone.

---

# D16 — `amount: null` stays accepted. ops2 has no un-settle CONTROL; the API keeps the capability.

Raised by the ux stage, which found the spec contradicting itself: criterion 26
refused `amount: null` with 400, while §3 said the legacy console was unchanged
— and the legacy console un-settles by sending `amount: null` to **this same
endpoint** (`src/ops/ProjectRecord.tsx` → `opsSetDelivery` → `src/ops/api.ts`).

**The architect's recommendation to refuse null is rejected.** Three reasons,
each sufficient on its own:

1. **D4 was a UI ruling, not an API one.** The owner ruled that ops2 offers no
   un-settle control. This ask already recorded the consequence in D4's own
   text: *"ops2 can never put a project back behind it. **Only the legacy
   console can.**"* That was written down when the concern was raised and the
   owner proceeded on it. Criterion 26 mis-derived an endpoint prohibition from
   a screen decision.
2. **It is a production regression to a safety capability.** `delivery_amount =
   NULL` is the issue gate. Refusing null removes the only mechanism that can
   re-block a quote whose delivery figure is wrong — and it removes it silently,
   surfacing as the legacy console's generic save error.
3. **It is backend lean-out, which the owner deferred.** Owner, 2026-09-01:
   *"ops2 will not have bloat and we'll lean out backend after we're done."*
   Deleting an endpoint capability mid-feature is exactly the opportunistic
   backend change that ruling excludes.

### What this means for the build

- `PUT /projects/:id/delivery` continues to accept `amount: null` and un-settle,
  unchanged. **Criterion 26's null clause is struck**; rewrite it to assert null
  still succeeds for staff and is still refused (403) for everyone else.
- **ops2 renders no control that can produce it** — no clear button, no empty
  field that submits as null, no keyboard path. That is D4, and it is a UI
  assertion the browser test owns.
- The abuse cases the tester executes are unchanged in substance: a non-staff
  caller must not reach this endpoint at all.

---

# D17 — The TOTALS CARD is the door, and it is `OpenablePanel`

**Supersedes the second half of D9 only.** D9's first half stands unchanged:
there is no separate Delivery card, and nothing is drawn below Project total.

Owner, 2026-09-01, at the second mock: *"Single card, as it is in the mock, same
content. But make the whole card clickable / reuse the component, making chevron
being present on the card level rather than on the line level."*

## What to build

- **The totals card is an `OpenablePanel`.** Its `open` prop opens the delivery
  price slide-out. The component is reused as-is — not forked, not extended, not
  given a new variant.
- **Its contents do not change**: `Lines`, `Delivery`, `Project total`, in that
  order, with the same figures, the same states and the same wording the second
  mock already had.
- **The chevron sits at CARD level** — vertically centred against the whole
  card, which is what `OpenablePanel` already does (`.lp-panel__chev { top: 50% }`).
  **Not** on the Delivery row.
- **`.rec-totals__row--door` is deleted.** No row is a button. No row has its own
  hit area, hover wash, focus ring or `aria-label`. The rows go back to being
  plain `div`s and the card is the single control.

## The consequence that was traded away, recorded

The card's three rows are one editable fact and two derived ones, so pressing a
card that reads `Lines $9,600` opens a *delivery* editor. That objection was put
to the owner and **overruled**: the card's only editable fact is the delivery
figure, and a card-sized target reusing the console's existing component beats a
bespoke row control. Do not re-litigate it, and do not "improve" it by moving
the chevron back to the Delivery row.

## Open detail for the ux stage to resolve and SHOW

`OpenablePanel` renders a `title`; the totals card has never had one. Decide
and draw it: either the card gains a visible title, or the accessible name is
carried without adding a heading the card did not have. Whichever is chosen,
the accessible name must say what pressing the card DOES — it opens the
delivery price — not merely what the card contains.

## Unchanged

D13 still governs the locked state: past `draft`/`ISSUABLE_FROM` the card is
**not** a door — no chevron, no tab stop, no reason line. `OpenablePanel` gives
this for free, since openability is the presence of `open`.

The address panel on the Project tab is untouched and remains its own
`OpenablePanel` card.

---

# D18 — `OpenablePanel` presents whatever content it is given

Owner, 2026-09-01: *"the component should be able to present whichever content
may be required, not to bind and limit to heading/body/whatever fields."*

**Resolves the open detail D17 left to the ux stage.** The answer is not "pick a
title for the totals card" — it is that the component should not have demanded
one.

## Why the current contract is wrong

`OpenablePanel` requires `title` and uses it for two things: the `<h2>` text and
the `<section>`'s `aria-label`. But the **door already carries its own
accessible name** from `open.label`, which is required whenever the panel is
openable and which the contract already insists must state the destination.

So the heading is presentation the component has no reason to mandate. It binds
a structure — heading above body — onto every caller, including one whose
content is three totals rows that have never had a heading and do not want one.

## The change

Make `title` **optional**. One prop marked `?`, no new prop, no variant, no
`mode` flag, no slots API.

- `title` present → renders the `<h2>` and the section `aria-label`, exactly as
  today. **Both existing callers are unchanged**, and their rendered output must
  be byte-identical.
- `title` absent → no `<h2>`, no section `aria-label`. The card is a container
  for whatever it was handed.
- The door button keeps `aria-label={open.label}` in every case, so an openable
  panel always announces where it goes, with or without a heading.

The two rules the component's header already owns — the button is a sibling of
the content, and openability is the presence of `open` — are untouched. This is
a **removal of a constraint**, not an extension: the diff should make the file
shorter or the same length, never longer. If a stage finds itself adding a
render-prop, a slot map, a `variant` or a `header` object, it has misread this.

## Consequences

- The totals card passes no `title`. Its accessible name as a control comes from
  `open.label`, which says what pressing it does.
- `CONTEXT.md`'s **"Openable panel"** entry is updated by the architect: the
  term means *a card that may be a door*, and the heading is a caller's choice,
  not part of the definition.
- `OpenablePanel` is shared ops2 chrome. Both existing call sites must be
  re-checked, and the existing browser assertions for the Price and Why panels
  must still pass untouched — this change is invisible to them or it is wrong.
