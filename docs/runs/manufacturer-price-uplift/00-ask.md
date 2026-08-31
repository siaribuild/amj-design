# Manufacturer's price and uplift — grill conclusions

Stage 0, 2026-08-31. Decided with the owner in session. The frontier closed;
nothing settled here is reopened by the spec.

---

## 1. What the feature is, in the owner's words

> "We receive price per line and need to recalculate — uplift, add margin."

An estimator gets a price back from the manufacturer, per line, usually on a
call. Today the only way to put that number into the system is to type a
finished price into the existing override, having done the margin arithmetic in
their head or on paper. **The goal is to simplify ops work**: enter what the
manufacturer quoted, let the platform apply the uplift, and show the result
before it is committed.

## 2. Actor and need

**Staff**, Estimator persona (`CONTEXT.md`), on the ops2 line page. Their need:
*I have their number; give me ours, and show me your working before I commit it.*

The customer is affected but not served directly — they see the resulting price
and nothing about how it was reached (§3, D4).

## 3. What was decided

**D1 — CORRECTED 2026-08-31. Nothing is stored but the price.**

> "Since when do we store 3 things? It's one price per line — price. Uplift is
> default per platform. The whole concept, as I stated clearly: help ops to
> update prices without pulling their calculators!"

The panel is a CALCULATOR, not a record. Ops types the manufacturer's figure,
adjusts the uplift if this line needs it, sees the result, and confirms — and
what lands on the line is the resulting price, through the existing 0046
override. No new columns, no new endpoint, no stored working.

The 30% default is a code constant for now; it moves to ops → Pricing settings
later, when there is a surface for it.

An earlier reading of "per line" as *stored* per line produced migration 0063
and a second endpoint. Both are deleted. The signal was there earlier and was
missed: when the owner cut the "manufacturer's price + 30% uplift" state
wording, a thing not shown and not a state is a thing not stored.

**D2 — No $10 rounding on this path.**
The owner was unaware the platform rounds at all, and never asked for it here.
Established as fact during the grill: `pricing.ts:136` (`round10`, applied at
:240) rounds the ENGINE's unit price and came from the customer configurator's
convention. A human-entered price already bypasses it — the existing override
endpoint binds the typed figure straight to `line_total`. This feature does the
same. 1,240 + 30% stores as exactly 1,612.00.

**D3 — A value, not a state.**
No "confirmed with the manufacturer" flag. The presence of a stored
manufacturer figure is the whole record; a boolean beside it could disagree
with it. Same reasoning migration 0046 applied to `price_calculated`.

**D4 — The customer sees the final price only.**
Nothing about the manufacturer's figure, the uplift or the arithmetic reaches
any customer surface.

**D5 — The account discount is a different concept and is OUT OF SCOPE.**
The interaction spec (§22.3) flags that `pricing.ts` multiplies the account
discount into the unit price, against the owner's stated preference for a
discount row at totals level. Owner ruling: *"price is per line… customer
discount is different concept."* That rework is its own feature and must not be
bundled into a price-entry screen — it changes the arithmetic of every existing
quote.

**D6 — GST: an ENTRY basis, not a display toggle.**
> "No need for GST options — it's the default presentation for ops, not
> switchable. Although having a switch for an entry field to state which value
> (GST or non-GST) during entry, and convert that upon storage into system
> format — that's valuable."

So the ops surface presents ex-GST throughout and offers no way to change that.
The switch exists on the **input** only, declaring what the typed number
includes, because whether a manufacturer's phone quote includes GST is a real
ambiguity and guessing it is a silent 10% error. An inc-GST figure is divided
by 1.1 before the uplift and stored ex-GST, the system's format.

**D7 — Confirming a price does not move the project's state.**
It does not set "waiting on the manufacturer" (D10 of the interaction spec).
That is set on Progress, and conflating them would make a price entry silently
change a project's status.

**D8 — It is a SidePanel, not a page.**
Owner instruction: the edit surface is a right slideout / modal, not the
mock's full "Re-price" page with a back arrow. `src/ops2/chrome/SidePanel.tsx`
already is that object — a right-hand slide-out at the desk, the bottom sheet
on the phone, `min(88vw, 520px)` — and is already used by the Projects filter
and twice on the record page. The container is settled; what UX owes is the
LAYOUT OF THE FIELDS INSIDE IT, which is the owner's stated ask for the UX
stage.

Consequence for the door: `OpenablePanel`'s `open` is a closure, not an
address, so the Price panel opens a panel rather than navigating. No component
change is needed — this is the case the contract was written for.

## 4. The screen

`docs/mocks/ops2-r1-ionic.html#/projects/record/OF-Q-10482/line/l01/price`
(`ManufacturerPricePage` in `docs/mocks/ops2-r1-ionic-src/src/pages/LineJobs.tsx`)
— reviewed live with the owner and confirmed. It is a working mock, not a
picture: entering 1,240 at 30% produced 1,612.00 and the quote total moved from
48,802.40 to 48,274.40.

Read as the CONTENT it must carry, not as the container it carries it in
(D8 replaces the full-page frame with a SidePanel).

Its parts: the entry-basis switch (D6), the manufacturer's price field, the
uplift field defaulting to 30, the three-row arithmetic (their price → uplift →
line price), and a footer read-back of what the line and the quote total become
with the old figure struck through.

The line page's Price panel is the door to it — the named future consumer of
`OpenablePanel` (`CONTEXT.md`, "Openable panel").

## 5. What is NOT this feature

- The existing `PUT /api/ops/lines/:id/price` (migration 0046) sets `line_total`
  to a figure a human typed. It stays. This is a different way of arriving at a
  figure, not a replacement for typing one.
- `/price-preview` — the owner confirmed it is a different concern.
- The discount rework (D5).
- Any change to how the customer sees prices (D4).
