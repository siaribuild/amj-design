# Reading the drawings — design and plan

**Status:** design for owner review. Nothing implemented.
**Output contract:** [plan-parse-output-spec.md](plan-parse-output-spec.md). Settled; conformed
to, not redesigned.

**Headline — SUPERSEDED 2026-08-27 by the ROUTE DECISION below. Read that first.** A vision
model reads the drawings; rasterisation is the critical path, and the container is the host.

*The original headline, kept because its measurements are sound and only its conclusion was:*
W1's composition is in the document's **vector line-work**, and it reads out in 110 ms using
`unpdf` — the dependency the Worker already has. No rasteriser, no canvas, no WASM, no
container, no model call. Three independently written decoders returned the same eight
coordinates. *It then concluded "rasterisation is not on the critical path", which was the
wrong lesson from a right measurement: reading the line-work precisely was never the hard part,
and finding out which window the line-work belongs to is.*

---

## What the previous version of this document got wrong

It is worth recording, because the errors were confident and they were mine.

1. **"The container touches pixels, nothing else."** There is nothing for it to touch. This is a
   vector set with a clean text layer on all 14 pages; the only raster anywhere is a 149×149
   logo in the title block.
2. **"The hard part is finding the elevation via the tag circle."** Elevations carry **zero**
   window tags — exact-token scanning finds `W`-tags on pages 4 and 5 only. `W1/S08` routes
   from the plan, but the elevation itself is unlabelled, so matching a drawing to a schedule
   row is a *geometric* problem (match the frame's measured size to the row's dimensions), not
   a text join. My routing design was solving a problem the document does not have and missing
   the one it does.
3. **"Feasibility is proven, so stage 1 should de-risk routing."** Both halves wrong. What
   needed proving was whether *we* could extract it in *our* runtime — and that has now been
   done, in this session, rather than planned.

---

## ROUTE DECISION — the model reads the drawings. Owner, 2026-08-27.

**Binding, and it reverses this document's headline.** The primary path is the method that was
proven manually with Fable and written down as `containers/plan-parse/` on branch
`feat/drawing-extraction`: render the sheet, crop to one opening, and ask a vision model, with
the schedule row as context. The vector-geometry route below is **demoted to a corroborating
check** — useful because it is free and exact where it works, never the thing the answer depends
on.

**The owner's reasoning, which the session's own evidence supports.** Plans differ. A window tag
is sometimes beside its diagram and sometimes far from it on a leader line; a stile is sometimes
its own segment and sometimes part of a wall line; a frame band is sometimes at 100% of the
opening and sometimes at 99.1%. Each is an edge case, each needs a new geometric rule, and this
session found **three of them in a single document** — every one of which produced a confident
wrong answer until it was caught. Re-deriving that ruleset for every drafter is the work the
owner declined, and the bar he set makes the trade explicit: *the fallback already works
ok-ish, so anything short of 100% is not worth the complexity.*

**Two things the geometry could not do at all**, both verified by looking at the rendered sheets:

- **The tag→wall→elevation chain.** `docs`' floor plan carries octagon tags (`W14/S08`) whose
  legend reads *"denotes the window & door number, and sheet number"*, with elevation markers
  A/B/C/D on the four walls. Reading a tag, associating it with a wall through a leader line,
  and mapping that wall to an elevation letter is the join this whole pass needs, and it is
  text-and-symbol work, not line-work.
- **Disambiguation.** W9 and W11 are both 1810 × 1027 and the geometry reports "2 candidates,
  not stated" for each. On Elevation C both are visible and the plan states their order along
  the wall. The model resolves what the matcher can only decline.

**The one thing the geometry has that the model does not, and it is not nothing.** Geometry
fails *loudly* — no frame resolves, so the row says `not read` and the fallback takes over
visibly. A vision model fails *silently*: it returns a plausible composition for an opening it
could not actually see, indistinguishable from a real one. So the model route needs what this
document's §4 three-state rule already demands, enforced at the boundary: every reading carries
its crop as evidence, disagreements with the schedule's type are surfaced rather than resolved,
and "could not read this" must be an answer the prompt makes easy to give. **The geometric
decoder becomes the cheap second opinion** — where both agree, confidence is high; where they
disagree, a human looks.

*Everything below §0 is retained as written. It is the record of the demoted route and of what
it cost to learn, and its output contract, precedence rules and §6 family ruling are unchanged
and still bind the model route.*

---

## 0. What this pass is, and what it is not

**The openings list already works and is authoritative.** Extraction returns every opening with
its tag, dimensions, product type and comment, and the shipped parser does it at 19 rows and
zero warnings on this document. None of that is in question and none of it is re-derived here.

This pass takes that list and asks the drawings **one further question per opening**: the thing
a human would look at an elevation to find.

| Already known, authoritative | What this pass adds |
|---|---|
| tag, width, height | how the opening **divides** |
| product type / family | which units make it up, and what each one **is** |
| comments, glazing, head height | their **order**, left to right |
| | the **ratio** each unit takes of the width |
| | whether the division is side-by-side or stacked |

So it is **not a discovery problem**. We are never asking "what windows exist" — we are looking
up a window we already know the size of, and reading how it is made up. That changes three
things materially:

- **Frame matching is a lookup, not a search.** The schedule says 2050 × 2100; the decoder looks
  for that rectangle. This is why the >2% rejection rule is sufficient rather than heroic, and
  why the title-block logo that came back as a 2091 × 2091 "window" is easy to reject.
- **Tag harvesting is almost unnecessary.** It is needed only to tell apart two rows with
  identical dimensions — W5/W6, W9/W11 and W14/W16 here — not to find openings.
- **Failure is per-opening and harmless.** An opening whose frame is not found keeps everything
  the schedule gave it and reports composition as *not stated*. The list never degrades.

---

## 1. The method being reproduced

SKILL.md's six steps, unchanged: inventory cheaply → choose a strategy → text extraction for
data → **rasterise only what matters and look at it** → do both when precision matters → manage
tokens explicitly.

**All six now run as written, step 4 included.** *(Rewritten 2026-08-27 by the ROUTE DECISION.)*

This section previously argued that only step 4 changed, on the grounds that **for a vector
drawing the geometry is more precise than any image of it** — a mullion position to the
millimetre is the entire deliverable, and the path operators state what a raster only estimates.

*That is still true, and it is still not the point.* Precision was never the binding constraint;
**locating the opening was**, and that is a tag on a leader line, an octagon carrying two lines
of text, and an elevation letter on a wall — none of which is line-work, and all of which step 4
handles by looking. A decoder that measures a mullion to 0.1 mm and cannot tell you which window
it belongs to has answered the easy half. The geometry keeps its precision advantage in the role
it now has: the second opinion of §7's verification stage, where being exact and free is exactly
what a cross-check should be.

The platform has no step 2 at all today. It runs one path for everything, and that path is text.

---

## 2. The evidence

All measured against the reference plan set — job 20016, a two-storey detached house, 14
pages, producer "Microsoft: Print To PDF". It is a customer document and is identified here
by its job number only; `scripts/research/plan-geometry/README.md` says how to fetch it.

**W1, decoded from page 6 (Elevation A):**

```
FRAME at pt(684.4, 533.8)   measured 2048.9 × 2104.0 mm   (schedule says 2050 × 2100)
verticals, mm from left:  0 | 25.4 | 50.8 | 698.5 | 723.9 | 740.8 | 2027.8 | 2048.9
diagonals: 2 — apex at the bottom of the left leaf only

left leaf   25.4 → 723.9  =  698.5 mm   one V symbol   → awning
mullion    723.9 → 740.8  =   16.9 mm
right leaf 740.8 → 2027.8 = 1287.0 mm   no symbol      → fixed
```

**The method validates against ground truth the drafter wrote himself.** W4 is the only opening
whose make-up appears both in words and in line-work. Its comment says `2x 600mm WIDE AWNINGS`;
the decode measures leaves of **596.9** and **601.1**. The drawing agrees with the human to
within 3 mm, without being told the answer.

**W14 and W16 reproduce W1's internal structure — confirmed, after I wrongly denied it.**
*(2026-08-27.)* W14's frame sits at `pt(684.3, 620.5)`, the same x as W1 and directly above it:
the first-floor window over the ground-floor one on Elevation A. Its composition reads
`awning 698.5 | fixed 1286.9`, ratios `0.352 / 0.648` — W1's, to the millimetre.

*Retraction of a retraction, and the more useful half of this entry.* Earlier today this
paragraph said the claim "was wrong" and that no frame of their size resolved. That was my
matcher's limitation reported as a fact about the drawing. `findFrames` requires each stile to
be its own segment of the opening's height, which holds for a window drawn in clear space and
fails for one whose jamb is shared with a wall line — as W14, W15 and W16's are, being upper
storey. **The original observation was right and the refutation was the error.** `findFramesV2`
takes the weaker, truer requirement — a stile may be *part* of a longer line, provided head and
sill rails bound it — and finds all three.

Two things worth keeping from it. `not read` was the correct thing to write while the harness
could not see them, and writing `not drawn` instead would have put a false statement about the
world into this document. And a measurement is not evidence about a drawing until something
independent agrees with it: five review rounds hardened gates around a table that was wrong,
because the gates asserted what the matcher said rather than what the sheet showed.

**Cost:** page 6 is 31,082 operators → 5,928 segments in 110 ms; page 7 is 36,415 → 8,924 in
70 ms. Peak heap for the whole job, text plus both elevations: **34 MB** in node.


---

## 2a. The whole set, measured — 2026-08-27

§2 was calibrated on two openings. This is all nineteen, decoded by
`scripts/research/plan-geometry/` against the same document.

| outcome | n | which |
|---|---|---|
| **Read, with composition** | **12** | W1 W2 W3 W4 W7 W8 W10 W12 W15 D2 D3 D4 |
| Awaiting disambiguation | 6 | W5/W6, W9/W11 — two frames, two rows; W14/W16 — **one** frame, two rows |
| **Not read** | 1 | D1 |

**What is still unread, and the evidence for it.** D1 and W15 are both 1380 mm wide, and every
height drawn at a 1380 mm width across both elevation sheets is `830, 889, 978, 1490, 1975,
2718`. W15's 1975 is inside 2% of its stated 2000 and reads as a single fixed unit of 1329.3 mm,
which agrees with the schedule calling it FIXED. D1's 2405 has nothing within 2%, at that width
or at the 1200 mm the energy report gives it — the trick that settled W4 does not settle this.
It is `not read`, which is not a claim that it is undrawn.

Reproduce with `node scripts/research/plan-geometry/measure.mjs`. It accounts for every one of
the nineteen and **exits non-zero** if this table, the eight verticals of §2, or either
calibration point drifts. Both gates are needed and neither is sufficient: the table alone
would pass a decoder that found every window and measured them all wrongly, and
the calibration alone would pass one that lost half of them.

**Which verticals bound a leaf — the rule, replacing a tolerance.** A frame elevation draws
three concentric bands, and only one is the sash:

| band | fraction of the opening | W1 | W2 | D2 |
|---|---|---|---|---|
| outer frame | 99–100% | 0, 2048.9 | 0, 3501.0 | 0, 965.2 |
| **sash** | **93–98%** | **25.4, 723.9, 740.8, 2027.8** | **25.4, 3475.6** | **25.4, 944.0** |
| glass line | ~95% | 50.8, 698.5 | — | — |

The fractions overlap between openings, which is the point: no single cutoff separates them.

The leaves are bounded by the **sash** band and nothing else. W4 settles it, being the one
opening whose make-up its drafter also wrote in words — `2x 600mm WIDE AWNINGS`:

| band | W4 leaves | error against the stated 600 |
|---|---|---|
| **sash, 97.6%** | **596.9 \| 1913.5 \| 601.1** | **3.1 mm and 1.1 mm** |
| glass, 95.0% | 546.1 \| 2006.6 \| 546.1 | 54 mm |

**The sash is the outermost band that is not the frame itself** — outermost rather than
most-populous, because the sash sits outside the glass by construction whereas line counts
depend on the drawing. D3's glass band carries four lines to its sash band's three, so choosing
by count reads that slider through its glazing.

**And the frame is identified by what it is, not by a threshold.** A band whose every line lies
on the frame's own edges *is* the rectangle the lookup matched, so it is discarded; a band that
merely reaches an edge is kept, because D3's sash band starts at the jamb and discarding it by
position would lose a real panel boundary.

Two rules were tried here and both were tolerances wearing a rule's clothes. An inset tolerance
happened to drop the glass line and, tightened slightly, dropped the sash band instead. A
`frac < 0.995` cutoff for "this band is the frame" held only because W1's outer band is drawn at
exactly 100% — **W2's is at 99.4% and D2's at 99.1%**, so both slipped through and were then
chosen, making the entire frame a single "leaf" (W2 read 3501.0 for a 3450.2 sash). That failure
is invisible in a one-unit opening, where the ratio is 1.000 either way and only the width
betrays it, which is why single-unit openings are now where it is pinned.

Stating the rule properly also fixed a real misreading it had been hiding: **D3**, a 3000 mm
slider, read as one 2942 mm unit and now resolves to three panels at 952.5 | 999.1 | 952.5.

**`not read` is not the same as `not drawn`, and this section is the proof of it.** The
distinction is the output spec's §4 and it is not pedantry. Four openings were recorded here as
`not read`. Three of them — W14, W15, W16 — were then found, once the matcher stopped requiring
a stile to be its own segment. Had they been recorded as `not drawn`, this document would have
carried a false statement about the building, and the correction would have been an
embarrassment rather than an edit.

D1 alone remains, and the weaker claim is all that is being made about it: no frame within 2% of
its stated size resolves on either elevation, at its 1380 mm or at the 1200 the energy report
gives it. Whether it is drawn is not established.

The output is identical either way, and correct either way: the row keeps everything the
schedule gave it. **Nothing was read wrongly**, which is the property that matters — a wrong
composition is a priced window nobody drew, and a missing one is a fallback doing its job
visibly.

**Both calibration points reproduce exactly**, which is what licenses the rest:

```
W1   OP 698.5mm r=0.352  |  fx 1286.9mm r=0.648      §2 says 698.5 / 1287.0 / 0.352 / 0.648
W4   OP 596.9  |  fx 1913.5  |  OP 601.1             the drafter wrote "2x 600mm WIDE AWNINGS"
```

W4 lands 3.1 mm and 1.1 mm from a figure a human typed, without being told it.

**The ambiguity is three times what §6 assumed.** It named W14/W16 as the only same-size pair.
They are one, and so are **W5/W6** and **W9/W11** — three pairs, six openings. Disambiguation
therefore buys 6 openings, not 2 — still late-ordered, still not a prerequisite.

**A conflict the drawing settles.** W4's drawn frame is **3200 × 2100** — the energy report's
figure, not the schedule's 2410 × 1800. `conf_energy_2` on this project has been flagged for
review since July with no tiebreaker. The line-work is one, and it sides with the report. This
is the first case of the drawings arbitrating a conflict rather than creating one.

**Cost, re-measured:** both elevation sheets decoded in **~660 ms**, peak heap **48 MB**, whole
19-opening sweep **~930 ms**. Zero tokens, zero model calls, no new dependency. The sweep was
409 ms before the rail-driven fallback; it runs only where the strict pass finds nothing, and
three openings were worth the difference.

---
## 3. The cheap route is dead — proven, not assumed

The printed schedule has eight columns and the shipped parser already reads all eight:

```
W N° | HEIGHT | WIDTH | HEAD HT. | GLAZING | D.GLAZE REQ. | WINDOW TYPE | COMMENTS
```

Run against the real file it returns 19 rows, zero warnings, and for W1:
`{itemNo:"1", heightMm:2100, widthMm:2050, headHtMm:2400, glazing:"CLEAR", doubleGlaze:true,
typeText:"OFFSET AWNING", comments:null}`.

There is no unread column. `comments` is genuinely null for W1, W14 and W16. The sheet's own
legend says the schedule *"nominates window sizes and head heights"* — sizes, not make-up.
`OFFSET AWNING` names a family, not a split.

**So it is the drawings or nothing.**

---

## 4. A live defect, shipping today, independent of all of this

The page router selects the wrong pages. Running the shipped `classifyPageRoles`
(`worker/lib/ai/ingest.ts:110`) against the real document:

```
ROLES {"schedule":[4,5,7], "energy_report":[], "plans":[12,14]}

 4  floor plan, tags W1–W6          ← not selected as plans
 5  floor plan, tags W7–W16         ← not selected
 6  ELEVATIONS A & B  (W1 lives here) ← not selected
 7  ELEVATIONS C & D + the schedule   ← not selected
12  1:20 construction details        ← SELECTED
14  NCC compliance sheet             ← SELECTED
```

`ingest.ts:143` requires two plan signals; the four real drawing sheets score one. Root cause:
`/\bscale\s*1\s*:/` never matches, because the title block emits the label "Scale" about forty
characters from the value "1 : 100". Pages 12 and 14 match only because they carry the inline
prose "SCALE 1:20". Downstream, `pipeline.ts:461` reads `doc.roleText.plans ?? doc.markdown` —
and because `rolePages.plans` is non-empty, the fallback to full text never fires.

**The plan skill is fed a stair detail on every architectural set.** That is why it returned
zero openings and zero rooms. Worth fixing whether or not the drawing reader is ever built.

---

## 5. Design — of the DEMOTED geometric route

*Retained as written. Its output contract, its precedence rules and its Stage 8 landing zone still bind the model route; its Stages 4–6 describe the second opinion, not the answer. See the ROUTE DECISION.*

**Stage 1 — Inventory** *(extend existing)*. `ingest.ts:287` already opens the document and
reads the text layer. On the same proxy add: page count, per-page size and rotation, text-item
count, image-XObject census, attachments, form fields. ~30 ms + 1 ms/page. Persist it — it is
what makes a bad parse diagnosable a month later.

**Stage 2 — Strategy** *(new, small, pure)*. From the inventory: text items ≥ ~50/page and
image area < 50% → `text_vector` (this document); text over a full-page image → `text_raster`;
no text layer → `scanned`, which **stops and emits a named gap rather than guessing.** This is
the cheapest item on the list and it converts a silent wrong answer into a reportable one.

**Stage 3 — Page selection** *(fix the defect above, then extend)*. Tier A: an elevation
callout. Tier B: a floor-plan title plus ≥3 distinct `W\d{1,2}` tags. Tier C: a schedule header
where the text parse found no rows. Validated at 4/14 on this document with zero false
positives.

> **Hard rule: never call `getOperatorList` on an unselected page.** Page 3 (the landscape
> plan) alone is 348,687 operators and 56 MB of heap. Page selection is a correctness
> requirement here, not an optimisation.

**Stage 4 — Geometry** *(drawing Stage A — the only unimplemented stage)*. `getOperatorList`
per selected page; decode `constructPath`; compose the CTM through save/restore/transform;
bucket into vertical / horizontal / diagonal; `page.cleanup()` between pages. Scale from the
title block's `1 : 100`.

**Stage 5 — Frame lookup, per known opening** *(drawing Stage C)*. **Driven by the openings
list, one row at a time.** For a row of 2050 × 2100, search the selected pages for a rectangle
of that size; then read its internal full-height verticals as mullions and count diagonals per
leaf, left to right.

**Rejection is the work, not extraction.** A strict matcher searching for W1's 2050 × 2100 also
returned the title-block logo border as a 2091 × 2091 mm "window". Because the target size is
known, rejection is cheap and rule-based:

- a candidate whose measured size differs from the row by **>2%** is not that window;
- a real frame contains at least one leaf whose head and sill rails span the same x-range —
  two bare verticals with no internal rails is furniture;
- **zero candidates or two-plus surviving candidates ⇒ composition is *not stated* for that
  opening.** Never a guess, and the row keeps everything the schedule gave it.

**Stage 6 — Disambiguation only** *(drawing Stages B and D)*. Needed **only** when two rows
share dimensions, because then a matched frame could belong to either. On this document the
pairs are **W5/W6** (850 × 2057), **W9/W11** (1810 × 1027) and **W14/W16** (2050 × 2000) — six
openings across three pairs.

**W14/W16 arrive at this stage from the other direction, and it matters.** W5/W6 and W9/W11 each
produce *two* frames for two rows: the frames are there and the question is which is which.
W14/W16 produce *one* frame for two rows, so either the second is drawn somewhere this pass does
not look, or one of the two rows is not drawn at all. Both are settled by the same evidence — the
tag order on the floor plan — but the second case must never be resolved by assigning the one
frame to both, which is what an earlier version of the harness did silently.

Tags come from `getTextContent` on the floor plans; no operator list, ~30–50 ms. Two verified
traps: each tag is an octagon carrying **two** lines (`W1` over `S08`), so a single-token reader
mis-segments; and a legend decoy `W1` sits at (975, 486) on both plan pages, rejectable because
its second line reads `S7`. Resolution is ordering along the wall from plan-view tag positions
against order along the elevation.

Worth stating plainly: **when two identical rows resolve to identical compositions, the
ambiguity does not matter.** Disambiguation only has to work the day two same-sized openings
are drawn differently, and until then a mismatch between them is itself the signal that this
stage is needed. Whether that day has arrived on W5/W6 and W9/W11 is not yet measured — the
sweep records them as two candidates and stops there, which is the correct conservative
outcome either way.

**Stage 7 — Output.** Conforms to the spec. For W1:

```json
{ "tag": "W1", "divisionAxis": "vertical",
  "composition": [ { "operation": "awning", "ratio": 0.352 },
                   { "operation": "fixed",  "ratio": 0.648 } ],
  "wallOrientation": null, "wallOrientationState": "not_read",
  "dimensionAgreement": { "drawnWidthMm": 2049, "drawnHeightMm": 2104, "agrees": true },
  "evidence": { "pageNo": 6, "sheetRef": "A5", "region": [0.575, 0.634, 0.624, 0.705] } }
```

No `widthMm` on either unit — this sheet does not dimension them and the spec forbids
back-calculating (§1.2). Orientation is left null **by this pass**, which reads elevations; it
is obtainable by a separate route (below) and is not a reason to hold the composition back.

#### Orientation is readable after all — from the survey, not from a compass rose

An earlier draft of this document said orientation was unreadable, on the grounds that the north
point is a symbol and no compass word appears near any elevation. Both facts are true and the
conclusion was wrong. **The site plan states the lot's boundary bearings as text** *[verified]*:

```
p2:  178°22'10"   268°22'10"   358°22'10"   268°22'10"
```

A rectangular lot with its axes on 88°/268° and 178°/358°. **268°22'10" is west**, which agrees
with the independently-reported "front (west-facing) wall" for W1. No symbol recognition is
needed for the hard part — the bearings are text, and text is free.

The remaining chain is coordinates, not pixels *[inferred, not yet built]*:

1. bearings → the lot's compass axes *(verified: text)*
2. the `FRONT` / `REAR` labels' positions on the site plan → which axis end is the street
3. a window tag's position on the floor plan → which wall of the building it sits in
4. wall → outward normal → one of the eight compass points

Note step 3 makes the elevation letter unnecessary: the floor plan gives the wall directly, and
`ELEVATION A`…`D` carry no face name in the text anyway *(verified — page 6 has "FRONT ELEVATION
MATERIALS TABLE", which is a materials table, not an elevation title)*.

**Corroborated independently, on two openings from different levels.** The agent that read this
set reported W1 as "the front (west-facing) wall of the Study… Elevation A" and W9 as "the
right-hand (east-facing) wall serving Bed 3… Elevation C". So `A = west`, `C = east` — opposite
faces, consistent with the 88°/268° axis the bearings give. Two openings, two levels, two
elevations, one coherent compass frame, arrived at without reading a north arrow.

"Right-hand" is the tell for the route: it is a plan-view relative term, so that agent located
the window on the floor plan and mapped right→east through the site plan. Steps 3 and 4, by a
human-shaped path.

**The consequence for the design: orientation is ONE determination per building, not one per
opening.** Fix the compass frame once from the bearings, and every window inherits it from its
wall position on the floor plan. The elevation letters then become a cross-check — if the frame
says a window is on the east wall and it is drawn on the elevation that other windows place to
the west, something is wrong and both should be flagged.

**This is a separate workstream from composition and should not be bundled with it.** It shares
the geometry machinery but nothing else, it serves a different consumer (the thermal band's
SHGC cap), and it can ship later without holding up the split.

**The ratio convention, decided by measurement.** Two candidates, tested against W4 where the
drafter wrote the answer down:

| convention | W4 → | stated | error |
|---|---|---|---|
| joiner centreline over outer width | 635 \| 1935 \| 635 | 600 \| 2000 \| 600 | 35 mm |
| **leaf-span normalised** | **615 \| 1970 \| 615** | 600 \| 2000 \| 600 | **15 mm** |

Use leaf-span normalisation: it distributes the joiner and frame material pro rata rather than
dumping it on the outer units. For W1 that gives 0.352 / 0.648, which through the spec's
rounding rule at the schedule's 2050 yields **720 | 1330**, partitioning exactly. Residual
accuracy ±2.5%, which the spec already anticipates.

**Stage 8 — Into the estimator** *(drawing Stage E)*. A drawing-derived hint is a new **source**,
not a new mechanism: `SplitHint.source` gains `"drawing"`, `SplitUnitHint` gains an optional
`ratio`. `pairing.ts` already lists `drawing-derived split` in its precedence chain and its own
comment anticipates this. Evidence columns (`page_no`, `sheet_ref`, `region_json`) already exist
in migration 0016 and every writer passes `null` today — the frame's bounding box fills all
three with no schema work.

**~~No model call on the primary path.~~ INVERTED by the ROUTE DECISION.** The geometry does
produce exact numbers at no token cost, and that is why it survives as the second opinion — but
the model call *is* the primary path now, and the escalation runs the other way: where the
decoder and the model disagree, or the model declines, a human looks.
`frame_decomposition_uncertain` still exists and is still the right code for it.

---

## 6. The symbol never names a family — DECIDED, owner 2026-08-07

`worker/lib/drawing/profile.ts` ships `DEFAULT_PROFILE = { apexMeans: "hinge", confirmed: true }`
and `refineOperable` maps a bottom apex to **hopper**. Every operable sash measured in this set
has its apex at the bottom while the schedule calls all of them **AWNING**, so on this
practice's convention `refineOperable` would name every operable panel a hopper, at full
confidence, because `confirmed: true` makes the "don't name a family until confirmed" guard
vacuous.

**The whole machinery is unnecessary, because AMJ does not make a hopper.** An awning is hinged
at the top and opens outward; a hopper is hinged at the bottom and opens inward — different
windows, drawn with the same chevron, distinguished only by which end the apex points at. The
catalogue has fourteen families and none is a hopper; `OPERATIONS` in `split.ts` does not list
one either. Distinguishing awning from hopper is a distinction this product range cannot
express.

So the rule, and it removes an entire class of risk:

> **Geometry claims `operable` or `not operable`. It never claims a family.**
> The operable leaves take the family the SCHEDULE states — which is authoritative and already
> extracted. The passive leaves are fixed.

For W1: the schedule says `OFFSET AWNING`, the drawing says the left leaf carries a symbol and
the right does not ⇒ `awning | fixed`. No convention is consulted, so no convention can be
wrong.

`refineOperable`, `apexMeans` and the practice-profile model are **not used in v1** and should
stay unreferenced rather than be corrected. They become relevant only if the catalogue ever
carries two families that share a symbol and differ by hinge edge.

*Residual limitation, stated:* an opening whose leaves are genuinely different operable families
— an awning beside a casement — cannot be told apart this way, because the schedule states one
type. Nothing in this document does that, and if it appears it is a review flag, not a silent
guess.

---

## 7. The container is the host — from day one, not on a trigger

*(Rewritten 2026-08-27 by the ROUTE DECISION. This section previously said "provision a
container when a document reports a gap the isolate cannot close, and not before — until it
fires, ship nothing." That was correct for a route where the geometry was the answer and pixels
were the exception. It is exactly wrong for a route whose answer IS the pixels.)*

The model route needs an image of each opening, so something must rasterise on every job. The
isolate cannot: `wrangler.jsonc` has no Browser Rendering binding and workerd has no canvas.
Cloudflare Containers are GA and cost roughly $0.00016 per job beyond an allowance of ~4,500.

**But the image is leaner than the scaffold assumes.** `containers/plan-parse/` is built around
poppler and PIL because that is the toolchain the method was proven with. `render.mjs` in
`scripts/research/plan-geometry/` does the same two steps — page → PNG, PNG → one opening's crop
— in **Node**, on the `unpdf` already in the Worker's bundle plus a canvas. So the container is
needed for **pixels, not for Python**, and image size is what sets the 1–3 s cold start.

### Both settled — owner, 2026-08-27

**Node, not Python.** The scaffold is Python because that is what the method was proven with, and
fidelity to a 100% run is a real argument — it was the right default while nothing had been
measured. Against it, item by item from `requirements.txt`: `pdfplumber`'s per-word coordinates
are `getTextContent()` items' `transform`; `pillow` is `sharp`, already a dependency; `poppler`
is `unpdf` plus a canvas, proven in `render.mjs`; the `anthropic` call moves to the Worker (see
below). What decides it:

- **One PDF library, therefore one coordinate space.** The geometric second opinion is pdf.js.
  If the container crops with poppler and the decoder measures with pdf.js, the verification
  cross-check needs a coordinate reconciliation before it can compare anything. Same library
  makes it a subtraction.
- **`boto3` is a credential.** A container doing its own R2 I/O needs S3-compatible keys — a new
  secret with a new blast radius, in a product holding payout details and ABNs. A Worker holding
  the binding needs none. This one outweighs the rest.
- Leaner image, and image size sets the 1–3 s cold start.

*Reversible, and testable rather than arguable:* if Node's crops read worse, the release gate's
numbers say so.

**The vision call lives in the Worker, not the container.** The faithful reading put it in the
container, and cost alone would not have settled it. Three things do:

- `jobs.ts`, `stage.ts`, `escalation.ts` and `runs.ts` already carry retries, escalation
  triggers, run records and token accounting. In the container every one is rewritten.
- A container awaiting a vision call bills a GiB-second per second at **zero CPU**.
- **Progress has to reach D1 to reach the customer** — and a container that writes progress needs
  D1 credentials too, which is the `boto3` objection a second time.

So: **the container renders and crops; the Worker reads, verifies and reports.**

---

### Progress — extend the channel that exists, do not build a second one

Parsing is on the order of **40–95 s serial for 19 openings, ~10–20 s at five concurrent**, so
the customer waits on screen and must be told what is happening.

The whole channel is already built and shipping: `progress_stage` on the job row → exposed by
`worker/routes/parse.ts` → typed in `src/data/api.ts` → polled in
`src/data/useProjectDocuments.ts`, which already renders a named phase. The vocabulary already
runs `queued → reading_documents → extracting_schedule → building_envelope →
matching_and_pricing → preparing_quote → complete`.

**Exactly one thing is missing: a count.** The wanted shape, against what exists:

| what the customer sees | comes from |
|---|---|
| uploading file | the upload surface, before any run |
| parsing file | `reading_documents` — exists |
| **20 openings discovered** | `extracting_schedule` completing — the count is the schedule's own row count |
| **reading opening 7 of 20** | a new `reading_drawings` stage, plus **done/total** |

So: one new stage name, and a done/total pair carried beside `progressStage` on the same
response the UI already polls. Two nullable integer columns on the job row — additive, and
**`migrations/` means loading the `d1-migration-safety` skill first, without exception**.

Independently, **one `ai_stage_runs` row per opening**: that table exists, its `result_r2_key`
holds the crop, and it is the evidence trail THE RELEASE GATE requires anyway. One mechanism,
two needs, no new table.

**The counter must be honest.** Its denominator is the real opening count, and an opening that
comes back `not read` still advances it. A bar that stalls, or quietly shortens its denominator
to reach 100%, is dishonest about work it did not do.

### What the customer sees — successes, never unreads. Owner, 2026-08-27.

**`not read` is not an error, and must not be presented as one.** The schedule is authoritative
and gives every opening its size, type and glazing; the drawings contribute *how it divides*.
Partial plans, an elevation that does not show a face, a set that stops at the ground floor —
all ordinary, and §0's rule already covers them: the list never degrades.

| surface | shows | never shows |
|---|---|---|
| progress | `reading opening 7 of 20` — successes accruing against the real count | anything about openings it could not read |
| the result | which lines the drawings detailed | an error state, a gap count, or a request to supply more |
| `diagnostic` (`src/data/api.ts`) | real failures — file unreadable, service down | `not read`, ever |

*This reverses an earlier position in this document and the reversal is the point.* The counter
was going to expose unreads so they could not be hidden. Right instinct, wrong surface. A
**missing** composition falls back to the even split, which is exactly today's behaviour and is
not news to anyone; a **wrong** one is a priced window nobody drew.

**Which is why the surface is OPS, not the customer** *(owner, 2026-08-27)*. Ops can act on a
gap: re-run it, correct it, ask the customer for a sheet, or decide the drawing simply does not
show it. A customer cannot. The provenance a reviewer needs — *this composition came from the
drawing* versus *this is the default split* — belongs on the ops line, and so does every
unread and every disagreement the verification stage records.

**Do not assume the reads are right** *(owner, same)*. Everything above about `not read` being
ordinary is about **gaps**. Parsing **errors** remain possible and always will, and the
"successes only" rule must never harden into "successes are correct" — that is the assumption
this whole reader fails by. Ops sees gaps AND disagreements; the customer sees neither, because
neither is a customer's to resolve.

**No invitation to the customer, either.** An earlier draft of this section proposed telling
them "adding the remaining elevations will detail the rest". **Withdrawn — it asks for something
they cannot give.** A customer cannot add a split, an orientation or a head height to an opening
that did not parse; the product offers them no way to, and inviting an action the interface does
not support is worse than saying nothing.

**OCR for genuinely scanned sets** remains the container's other job, and `GeometryGap =
"raster_page"` remains its trigger — but it is no longer the thing that decides whether a
container exists.

---

## 8. Plan

### Stage 0 — The proof. **Done, and this time it is on disk.**

Read W1's composition from the real document with no pipeline: 110 ms, 34 MB, eight
coordinates, reproduced independently three times, and calibrated against W4 where the drafter
stated the answer.

**The code for it was never committed and was gone by 2026-08-27**, when rebuilding it cost a
session. It now lives at `scripts/research/plan-geometry/`, with the two traps that cost the
most time written down beside it. `measure.mjs` reproduces the eight verticals above and both
calibration points, and **fails the run** if either they or §2a's table drift — a result this
document states is a result the harness enforces. §2a extends them from two openings to all
nineteen.

### Stage 1 — Fix page selection. Unchanged by the route, and shippable today.

The one item that survives the ROUTE DECISION untouched, because **every** route has to be
pointed at the right sheets. §4's defect is live: the plan skill reads a stair detail on every
architectural upload. It is also worth more now than it was — a model route that renders the
wrong page pays for the render, pays for the tokens, and returns nothing.

### Stage 2 — Render and crop, hosted. *(`render.mjs` exists; it needs somewhere to run.)*

Steps 4 and 5 of the method, already working locally. What remains is the host — see §7 — and
the two questions it leaves open.

### Stage 3 — Locate each schedule row on the sheets. **Two passes, because one cannot work.**

This is the join the whole pass needs and the one the geometry could not do. It is also the
stage that was hand-waved when this plan was first written: "tag → wall → elevation letter →
sheet" names the *evidence* and not the *mechanism*, and the mechanism has to end at a **pixel
box**, because a crop is what Stage 4 reads.

You cannot go straight from a schedule row to a box. The row states a size, not a position; the
tag states a position on the **plan**, not on the elevation. So:

**Pass A — inventory the elevation, no schedule involved.** Split the sheet by its `ELEVATION x`
labels, whose positions the text layer gives for free (page 6 carries A and B, page 7 C and D).
Ask the model, per elevation, for every window-like object it can see: a normalised bounding
box, the drawn width:height proportion, the panel count, and whether each panel carries a
symbol. It is not asked to name anything — nothing is matched yet, so nothing can be matched
wrongly.

**The demoted decoder earns its keep here.** `findFrames` + `findFramesV2` produce candidate
rectangles for free and exactly, and Pass A only needs them as a **superset** — it does not need
them to be right, which is the entire difference between this use and the one the owner
declined. On the reference set they cover every opening that is drawn, including all six the
matcher could only call ambiguous. Where a geometric candidate and a model box coincide, the box
is exact and free; where only one exists, it is still a candidate.

**Pass B — assign schedule rows to boxes**, on three independent signals:

| signal | source | settles |
|---|---|---|
| which elevation | the tag's wall on the floor plan → the `A`–`D` marker on that wall | which sheet and which half of it |
| drawn size vs stated size | Pass A's proportion against the schedule's W×H | which box, when sizes differ |
| order along the wall | the tag order on the floor plan vs left-to-right on the elevation | same-size pairs — W5/W6, W9/W11, W14/W16 |

**A row that two signals disagree about is `not read`, and so is a box two rows both fit.** The
second is not hypothetical: W14 and W16 are both 2050 × 2000 and the elevations yield **one**
frame of that size, so either the second is drawn where this pass does not look or one row is
not drawn. Assigning that one frame to both is the confident wrong answer this reader fails by,
and the harness did it silently until a check was written for it.

Only after a row owns a box is it cropped and read. **Nothing reaches Stage 4 unlocated.**

### Stage 4 — Read the composition, one vision call per opening, against its own crop.

The schedule's dimensions and type go in as context. The model is asked how the opening
**divides**, never what family it is — §6's ruling is unchanged and still binds: geometry or
model, the drawing claims operable-or-not and the schedule names the family.

### Stage 5 — Verification, which is what makes the bar checkable.

**The model fails silently, so this stage is not optional** — a geometric miss says `not read`
and hands over visibly, where a model's miss is a plausible composition for an opening it never
saw. Two properties belong to this stage and nothing else: every reading **carries its crop**,
so a human can check it without reopening the PDF, and **"could not read this" is made an easy
answer to give** in the prompt, because a model that is never offered the option will invent
rather than decline.

The three checks a reading must pass are defined once, in **THE RELEASE GATE** below, because
they are the same checks that decide whether the thing may ship.

### Stage 6 — Into the estimator. Unchanged by the route.

`SplitHint.source` gains `"drawing"`, `SplitUnitHint` gains an optional `ratio`, and the
evidence columns `page_no`/`sheet_ref`/`region_json` already exist in migration 0016 with every
writer passing `null`. The crop's page and box fill all three. A drawing-derived hint is a new
**source**, not a new mechanism.

### Orientation is still a separate workstream.

§5's chain — boundary bearings as text → the lot's compass axes → the tag's wall on the floor
plan → outward normal — is unchanged and unaffected. It serves a different consumer (the thermal
band's SHGC cap) and ships on its own schedule. Under the model route the middle two steps get
easier, not harder.

### THE RELEASE GATE — what "100%" has to mean before anything ships

*(Added 2026-08-27. Withdrawing Stages 1a and 1b removed the only two gates this plan had and
put nothing in their place, which left a route with no definition of done and an owner's bar of
100% with nothing to measure it against.)*

**The bar has to be split in two, because one half is achievable and the other is not.**

| | bar | why |
|---|---|---|
| **A reading that is WRONG** | **zero. A release blocker.** | A wrong composition is a priced window nobody drew. It reaches a customer as a quote and a factory as a cut list. |
| A reading that is ABSENT | measured and reported, not gated | `not read` hands the opening to the fallback **visibly**. The fallback already works ok-ish; a visible handover is the status quo, not a regression. |

So *100% correct* is the gate and *100% covered* is the target. Conflating them is what would
make this project unshippable forever: a set whose drawings genuinely do not state a
composition cannot be read by any method, and the output spec's §4 already says `not stated` is
a correct answer.

**Ground truth, which does not exist yet and is the long pole.** No gate is measurable without a
labelled set, and nobody has labelled one. Cheapest honest route: run the pipeline over N real
sets and have the owner confirm or correct each opening **once**, in the ops surface, against
the crop the reading carries. That is review work he would do anyway on the first jobs, and it
produces the fixture as a by-product. **N is a decision for him**, and it is the real successor
to Stage 1b: the second plan set stopped being a route gate and became the first row of this.

**The three checks that have to run before a reading counts as correct**, all of which exist
independently of any label:

1. **Schedule cross-check.** The drawing's panel count and operable/passive pattern against the
   schedule's type text. `OFFSET AWNING` with two panels and one symbol agrees; `FIXED` with a
   symbol does not. Disagreement is surfaced, never resolved — §6 and the output spec §6 both
   already bind this.
2. **The geometric second opinion.** Free, exact, and wrong in *different* ways than a model is.
   Agreement across two methods that fail differently is the strongest evidence available here,
   and it is the only check that costs nothing per job.
3. **Dimension agreement.** The drawn frame against the schedule's W×H, which §1.2 of the output
   spec already defines and which caught W4's 3200 × 2100 siding with the energy report against
   the schedule.

**Staged release, so the gate can be met before the fixture is large.** Drawing-derived splits
already land behind "confirm the configuration at review". Ship there first: every reading is
seen by a human before it prices anything, wrong readings are caught as review corrections
rather than as customer-visible errors, and each correction is a labelled row. **Removing the
review gate is a separate decision with its own evidence bar** — see §9.4 — and must not be
taken as implied by shipping.

**What gets reported per run**, so the numbers exist from day one rather than being
reconstructed later: read / located-but-unread / unlocated, per opening; which of the three
checks fired; and the crop key for every reading. `measure.mjs` already reports the first of
these for the geometric route and is the shape to copy.

### Withdrawn by the ROUTE DECISION

**Stage 1a — "does the geometry run in workerd, in 128 MB?"** No longer on the critical path.
It was the gate on hosting the geometric decoder in the isolate; the decoder is now the second
opinion and the job has a container regardless.

**Stage 1b — "does it generalise to a second plan set?"** Withdrawn *as a gate*, kept *as a
measurement*. It no longer decides the route — that is settled, and the owner's reasoning was
precisely that it would come back low. It remains the only honest test of any route, including
this one, and the owner has a second set to supply. Everything in §2a is one drafter, one CAD
chain.

---

## 9. Open questions

1. ~~When a drawing and a stated dimension disagree, which wins?~~ **DECIDED, owner 2026-08-07:
   the comment wins.** W4's comment states `600 | 2000 | 600`; the drawing measures
   `615 | 1970 | 615`. A person wrote the comment and meant it exactly; the drawing is a ±2.5%
   measurement of it. So a stated dimension is never replaced by a measured one.

   Precisely: **the drawing wins operations, order, count and division axis; a stated dimension
   wins widths.** Where a comment states widths for only some units, the stated ones stand and
   the rest are scaled to the remainder. Where the two disagree on the *count* — a comment
   naming two units against a drawing showing three — that is a conflict for review, not an
   arithmetic problem, because the comment cannot be applied to a make-up it does not describe.

   This amends [plan-parse-output-spec.md](plan-parse-output-spec.md) §6, whose precedence row
   reads "composition, division axis, order — the drawings win" without the width caveat.
2. ~~`wallOrientation` is unreadable on this set.~~ **WITHDRAWN — it was wrong.** The site plan
   states the boundary bearings as text and 268°22'10" is west, matching the independently
   reported west-facing front. No north-arrow reader is needed. It is a separate workstream
   from composition (§5) and the only question left is scheduling, not feasibility.
3. ~~`DEFAULT_PROFILE.confirmed`~~ **RESOLVED, owner 2026-08-07.** AMJ makes no hopper, so the
   awning/hopper distinction the convention exists to draw cannot be expressed by the catalogue.
   Geometry claims operable-or-not; the schedule names the family. `refineOperable` is unused in
   v1. See §6.
4. **Is a drawing-derived split allowed to flow through unreviewed?** Every proposed split
   already carries "confirm the configuration at review", so behind that gate the question is
   moot. It sharpens under the model route rather than going away: the geometric figure was
   wrong by a *bounded* ±2.5% (±50 mm at 2050 mm), whereas a model's wrong reading is not wrong
   by a small amount — it is a different window. The verification stage exists for that, and
   whether it is sufficient to remove the review gate is the open question.
5. ~~**Who owns a practice's symbol profile?**~~ **MOOT under both routes.** §6 settled that
   nothing claims a family from a symbol — the schedule names it — so no practice profile has to
   be owned, stored or confirmed by anyone. `refineOperable` and `apexMeans` stay unreferenced.
6. ~~**Node or Python in the container, and where does the vision call live?**~~ **DECIDED,
   owner 2026-08-27: Node, and the call lives in the Worker.** §7 carries the reasoning; the
   deciding arguments were one coordinate space shared with the second opinion, and keeping R2
   and D1 credentials out of the container.
7. ~~**Does the customer wait on screen, and at what granularity?**~~ **DECIDED, owner
   2026-08-27: on screen, per opening, successes only.** See §7. What remains is an **ops**
   surface — provenance per line, plus the unreads and the verification disagreements — and it
   does not exist yet. It is the only thing that makes a wrong composition findable, so nothing
   ships unreviewed until it does.
