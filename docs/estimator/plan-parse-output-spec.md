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

| field | required | notes |
|---|---|---|
| `operation` | yes | awning, fixed, sliding, casement, hinged, louvre, stacker, bifold, double-hung, tilt-turn |
| `ratio` | yes | this unit's share of the opening **along the division axis**, 0–1, three decimals. The ratios sum to 1. |
| `widthMm` | only if drawn | the unit's own dimension, **only when the drawing prints it**. Absent otherwise — never back-calculated. |

**Consumer:** `proposeSplit` → `materialiseSplits` → the priced composite.
**Decision:** the entire make-up of the opening. W1 (2050 × 2100) shipped as two
1025mm awnings because nothing stated its composition.

**Why the ratio is the primary and the millimetres are the exception.** The
authoritative overall size comes from the schedule table, not the drawing — the
drawing's job is to say how that size *divides*. A proportion is also the more
robust reading: it survives an uncertain scale, where an absolute figure does not.
And the exact partition is already ours to do — units must sum to the opening
exactly, and `proportionalParts` in `split.ts` allocates a total across shares by
largest remainder, which is precisely the shape ratio-plus-total wants.

So: report `ratio` always. Report `widthMm` **only when the sheet dimensions that
unit**, because a printed dimension is a stated fact and outranks a measured
proportion. Do not derive one from the other in either direction — a
back-calculated millimetre figure claims an authority it does not have, and the
consumer cannot tell it apart from a real one.

Three decimals is enough and more is false precision: at 2050mm, 0.001 is 2mm.

#### The ratio is a measurement, so it is approximate

Treat it as guidance for sizing, never as a claim. The authoritative figures are
the opening's own dimensions, from the schedule table. What the drawing
contributes with certainty is the **operations and their order**; the proportions
are how it guides the sizes.

A printed dimension is not a measurement and is not covered by this — it is a
stated fact and outranks the ratio.

#### Turning ratios into sizes: round all but the last

Sizes land on a configurable step, default **5mm** — no window is made ending in
anything but 0 or 5. Along the division axis, given the opening dimension `D` and
ordered ratios `r₁…rₙ`:

```
size(i)  = round(D × rᵢ / step) × step      for i = 1 … n-1
size(n)  = D − Σ size(i)                     the last unit takes what is left
```

The last unit absorbs the rounding, so the units **always** partition the opening
exactly and the rule can never fail to produce an answer. Exact partition is an
invariant the platform enforces — `validateSplit` computes a coverage delta and
flags it — so a rule that snapped *every* unit to the step would break it
whenever the opening itself is not a multiple of the step.

Worked: opening 2050, ratios 0.634 / 0.366, step 5 →
`round(1299.7/5)×5 = 1300`, remainder `750`. Opening 2047 → `1300`, remainder
`747`. Both partition exactly; only the last unit carries a non-round figure,
which is correct — it is the piece cut to fit.

**This applies to the height too**, whenever `divisionAxis` is horizontal.

**Where the step is configured:** it is a property of what can be manufactured,
not of a drawing, so it does not belong to the parse. `composite_policy` in D1
already holds the composite rules (`max_segments`, `tolerance_mm`,
`default_joiner_mm`) and is already loaded at the point the split is proposed —
that is the cheapest correct home for it, ops-editable, one number. If a family
ever has a different granularity, a per-product `dimensionRule.stepMm` can
override it, beside the min and max widths where the other manufacturing limits
live.

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
composition:     [ { operation, ratio, widthMm? }, … ]   ← in drawn order, ratios sum to 1
divisionAxis:    vertical | horizontal
wallOrientation: one of N NE E SE S SW W NW
roomLabel:       free text, or not stated
evidence:        sheet + page + region, for the composition
```

If W1 turns out to be an opening unit against one jamb with a lite beside it, and
the sheet does not dimension them, that reads:

```
composition: [ { operation: "awning", ratio: 0.634 },
               { operation: "fixed",  ratio: 0.366 } ]
```

and the estimator multiplies by the schedule's 2050 to get 1300 | 750, partitioned
exactly. Note this is also how we learn the handedness that no fallback can infer:
the fallback happens to produce the same two widths, but always puts the opening
unit first.

That is the whole deliverable for W1 — five fields and a pointer.

If the drawings do not show W1's composition, the correct output is **not
stated**. That is a useful, truthful answer: it tells us the family-level fallback
is doing its job rather than papering over a parse failure.
