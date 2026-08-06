# Plan parse — the required output

**What this is:** the complete list of what parsing an architectural plan set must
yield. Hand it to whoever is specifying the parsing steps as the target. Anything
not on this list is not wanted, and the "excluded" section says why.

**Why it exists:** a parse can describe a drawing set in enormous detail, be 100%
accurate, and still be useless. Accuracy is not the constraint. A field nobody
reads costs tokens, review attention and — worst — confidence in the fields that
do matter. So every field below names its consumer and the decision it changes,
and every exclusion names the code that ignores it today.

Units are **millimetres, integers**, everywhere.

---

## 1. Required — these change the price or the product

### 1.1 `tag`
The opening's reference: `W1`, `D3`, `W04A`.

**Consumer:** everything. It is the join key between the drawings, the schedule
table and the quote line.
**Decision:** without it the opening matches nothing and its data is discarded
silently.
**Note:** separators and case are noise — `W-04`, `W 4` and `W04` are one window.

### 1.2 `composition` — the reason this exercise exists
An **ordered** list, left to right (top to bottom for a stacked opening), of the
units the opening is built from. Per unit:

| field | notes |
|---|---|
| `operation` | awning, fixed, sliding, casement, hinged, louvre, stacker, bifold, double-hung, tilt-turn |
| `widthMm` | the unit's own width; units sum to the opening's width |
| `heightMm` | only when the division is horizontal; otherwise every unit is full height |

**Consumer:** `proposeSplit` → `materialiseSplits` → the priced composite.
**Decision:** the entire make-up of the opening. W1 (2050 × 2100) shipped as two
1025mm awnings because nothing stated its composition.

**Order matters and is not decoration.** `awning | fixed` and `fixed | awning` are
different windows. If the drawings show which side the opening unit sits on, that
is the most valuable thing on the sheet after the composition itself — because no
fallback can ever infer it.

### 1.3 `divisionAxis`
`vertical` — units side by side, sharing mullions. `horizontal` — units stacked,
sharing transoms (a highlight over a fixed pane).

**Consumer:** `proposeSplit`, which partitions the width or the height accordingly.
**Decision:** a stacked opening read as side-by-side produces a window that cannot
be built. Required whenever `composition` is present.

### 1.4 `wallOrientation`
One of `N NE E SE S SW W NW`. The **derived compass value**, not a description.

**Consumer:** `computeDefaultBand` (`worker/lib/estimator/thermal/computedBand.ts`),
called per opening from `worker/lib/ai/pipeline.ts`.
**Decision:** E and W get a cooling cap of `maxShgc 0.43`; NE/SE/SW/NW get 0.5;
N and S get none. That cap filters which glazing variants are eligible, so
orientation changes the product and therefore the price. Unknown orientation
yields a Uw cap only — advisory, weaker, not wrong.

**This is the one that looks like trivia and is not.** Unwanted: "the window faces
east on the first floor." Wanted: `E`.

---

## 2. Useful — these change what a human sees, not what they pay

### 2.1 `roomLabel`
"Kitchen / Meals / Family", "Bed 3", "Ensuite".

**Consumer:** stored as `quote_line.room_label`, shown on the line.
**Decision:** none, in pricing. It is how a builder reconciles a 20-line list
against their own drawings, which is the actual job at that screen. Worth having,
never worth blocking on.

### 2.2 Dimension agreement
Whether the drawing's width and height match the schedule table's, and the
drawing's figures when they differ.

**Consumer:** the conflict record. House rule: a conflict is **represented, never
silently resolved** — the reviewer decides.
**Decision:** a mismatch is a review flag, not an overwrite.

---

## 3. Excluded — do not extract

Each was checked against the code. The reason is what the code does with it today,
not a preference.

| Not wanted | Why |
|---|---|
| Level / storey | Stored on the room record; no estimator code reads it. |
| Eaves / horizontal projection | Sets `shadingKnown` in `estimator/types.ts`, which nothing reads. |
| Opening area | Derived from width × height; a second source can only disagree. |
| Sill and head heights | No consumer. Changes neither product nor price. |
| Door swing direction | No consumer. A hanging instruction, settled at review. |
| Glass type, colour, flyscreen | Already on the schedule table, which is authoritative for specification. Duplicating creates conflicts with no benefit. |
| Sheet revision, scale, title block | Only useful for interpreting geometry. If the method needs scale internally, use it — do not report it. |
| The north point itself | We want the derived `wallOrientation` per opening, not the symbol. |
| Room areas, zone types | Come from the energy report, which is authoritative for them. |
| Anything narrative | "A feature window to the living area." Never consumed. |

---

## 4. Three states for every field, not two

Every field must distinguish:

1. **A value** — the drawings state it.
2. **Not stated** — the drawings are readable here and simply do not say.
3. **Not read** — we could not tell: an unreadable sheet, an ambiguous symbol.

(2) and (3) must never collapse into one. This has already cost us: an unreadable
symbol was recorded as "no marks", which downstream read as "no operable panel",
which is **fixed glass** — the cheapest product in the catalogue. Absence of
evidence must never be recorded as evidence of absence.

A missing value is acceptable everywhere on this list. A guessed one is not.

---

## 5. Evidence

Anything in section 1 that reaches a customer-visible number needs enough for a
reviewer to check it without reopening the PDF: **which sheet, which page, and
where on the page.** Nothing in section 2 needs it.

---

## 6. Precedence — where a plan-derived value sits

Owner's standing rule: **the drawings are the architectural contract.** They come
first and they are what the builder is building.

| Fact | Authority |
|---|---|
| Composition, division axis, order | **The drawings win** — above the schedule comment, above the energy report. |
| Opening width and height | The drawings win; a schedule disagreement is a flagged conflict. |
| Thermal targets (Uw, SHGC) | The **energy report** wins. Plans do not carry them. |
| Specification — glass, colour, hardware | The **schedule table** wins. |
| Orientation | The drawings, the only document showing the building on its site. |

---

## 7. Failure granularity

The unit of failure is the **opening**, never the document. A 20-page set with two
unreadable sheets must still deliver every opening it could read. An opening that
could not be read is reported as unread — not omitted, because a silently missing
opening is indistinguishable from a house with fewer windows.

---

## 8. The target, made concrete

W1 of the plan set that prompted this. The schedule gives
`W1 · OFFSET AWNING · 2050 × 2100 · no comment`. Today the drawings contribute
nothing and W1 is built as `awning 1025 | awning 1025`.

Wanted from the drawings:

```
tag:             W1
composition:     [ { operation, widthMm }, { operation, widthMm }, … ]   ← in drawn order
divisionAxis:    vertical | horizontal
wallOrientation: one of N NE E SE S SW W NW
roomLabel:       free text, or not stated
evidence:        sheet + page + region, for the composition
```

That is the whole deliverable for W1 — five fields and a pointer.

If the drawings do not show W1's composition, the correct output is **not
stated**. That is a useful, truthful answer: it tells us the family-level fallback
is doing its job rather than papering over a parse failure.
