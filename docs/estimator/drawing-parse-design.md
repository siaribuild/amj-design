# Reading the drawings — design and plan

**Status:** design for owner review. Nothing implemented.
**Output contract:** [plan-parse-output-spec.md](plan-parse-output-spec.md). Settled; conformed
to, not redesigned.

**Headline.** W1's composition is in the document's **vector line-work**, and it reads out in
110 ms using `unpdf` — the dependency the Worker already has. No rasteriser, no canvas, no
WASM, no container, no model call. Three independently written decoders returned the same eight
coordinates. **Rasterisation is not on the critical path.** It is the fallback for a document we
have not yet received.

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
  identical dimensions — W5/W6 and W9/W11 here — not to find openings.
- **Failure is per-opening and harmless.** An opening whose frame is not found keeps everything
  the schedule gave it and reports composition as *not stated*. The list never degrades.

---

## 1. The method being reproduced

SKILL.md's six steps, unchanged: inventory cheaply → choose a strategy → text extraction for
data → **rasterise only what matters and look at it** → do both when precision matters → manage
tokens explicitly.

Five of the six map onto `unpdf` in the Worker. Only step 4 changes, and the reason is not that
we cannot rasterise — the investigation proved we can, three separate ways. It is that **for a
vector drawing, the geometry is more precise than any image of it.** A mullion position to the
millimetre is the entire deliverable; a model reading a 150-DPI raster estimates it, while the
path operators state it.

The platform has no step 2 at all today. It runs one path for everything, and that path is text.

---

## 2. The evidence

All measured against the real `20016_Lot 312 Banjo Boulevard_Plans.pdf`.

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

**W14 and W16 do NOT reproduce W1's structure — that claim was wrong.** *(corrected
2026-08-27, on re-measurement.)* Nothing 2050 × 2000 is drawn anywhere in the 14-page set:
searching page 6 for a 2050 mm width at any height returns one 2104 mm-tall rectangle (W1)
and one 2049 mm square (the title-block logo), and nothing else. The original reading almost
certainly matched **W1's own frame**, because W14, W16 and W1 share a 2050 width — the
same-dimension trap, sprung in the direction nobody was watching. See §2a.

**Cost:** page 6 is 31,082 operators → 5,928 segments in 110 ms; page 7 is 36,415 → 8,924 in
70 ms. Peak heap for the whole job, text plus both elevations: **34 MB** in node.


---

## 2a. The whole set, measured — 2026-08-27

§2 was calibrated on two openings. This is all nineteen, decoded by
`scripts/research/plan-geometry/` against the same document.

| outcome | n | which |
|---|---|---|
| **Read, with composition** | **11** | W1 W2 W3 W4 W7 W8 W10 W12 D2 D3 D4 |
| Ambiguous — two rows share a size | 4 | W5/W6 (850 × 2057), W9/W11 (1810 × 1027) |
| **Not read** | 4 | D1, W14, W15, W16 |

Reproduce with `node scripts/research/plan-geometry/measure.mjs`. It accounts for every one of
the nineteen and **exits non-zero** if this table, the eight verticals of §2, or either
calibration point drifts. Both gates are needed and neither is sufficient: the table alone
would pass a decoder that found the right eleven windows and measured them all wrongly, and
the calibration alone would pass one that lost half of them.

**Which verticals bound a leaf — the rule, replacing a tolerance.** A frame elevation draws
three concentric bands, and only one is the sash:

| band | fraction of the opening | W1 |
|---|---|---|
| outer frame | ~100% | 0, 2048.9 |
| **sash** | **~97%** | **25.4, 723.9, 740.8, 2027.8** |
| glass line | ~95% | 50.8, 698.5 |

The leaves are bounded by the **sash** band and nothing else — that is what yields 698.5/1287.0
on W1 and 596.9/601.1 on W4. The band is chosen as the *modal* internal length rather than a
fixed percentage, because how thick a practice draws its sections is a property of the practice,
not a constant. This was originally an inset tolerance that happened to drop the glass line, and
an accident that produces the right answer is not a rule: tightened slightly it lost the sash
band instead. Stating it explicitly also fixed a real misreading — **D3**, a 3000 mm slider,
read as one 2942 mm unit and now resolves to three panels at 952.5 | 999.1 | 952.5.

**The four are `not read`, which is not the same as `not drawn`** — and the distinction is the
output spec's §4, not pedantry. For D1, W14 and W16 nothing within 2% of the stated height is
drawn at that width on either elevation, so no frame of that size is there. **W15 is different
and worth stating against my own first reading of it:** a 1380 × ~1975 rectangle does sit on
page 6, inside 2% on both dimensions, but its right-hand stile is a 2718 mm building line
rather than a jamb, so no single frame resolves. Whether W15 is drawn is **undetermined**. It
would have been easy, and wrong, to write "not drawn in the set" — which is the same overclaim
this section was opened to correct.

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

**The ambiguity is twice what §6 assumed.** It named W14/W16 as the only same-size pair; the
real pairs are W5/W6 and W9/W11, and W14/W16 are not read at all. Disambiguation therefore buys 4
openings, not 2 — still late-ordered, still not a prerequisite.

**A conflict the drawing settles.** W4's drawn frame is **3200 × 2100** — the energy report's
figure, not the schedule's 2410 × 1800. `conf_energy_2` on this project has been flagged for
review since July with no tiebreaker. The line-work is one, and it sides with the report. This
is the first case of the drawings arbitrating a conflict rather than creating one.

**Cost, re-measured:** both elevation sheets decoded in **276 ms**, peak heap **36 MB**, whole
19-opening sweep **409 ms**. Zero tokens, zero model calls, no new dependency.

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

## 5. Design

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
pairs are **W5/W6** (850 × 2057) and **W9/W11** (1810 × 1027) — four openings, all four found
as two candidates each. *(This paragraph named W14/W16 until 2026-08-27; no frame of their size
resolves on either elevation, so they are `not read` and never reach this stage. See §2a.)*

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

**No model call on the primary path.** The geometry produces exact numbers, costs no tokens and
fits well inside the job deadline. The model earns its place at escalation only: when Stage 5
rejects every candidate or Stage 6 cannot disambiguate, rasterise **that frame's region** and
ask. `frame_decomposition_uncertain` already exists for it.

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

## 7. Where a container still earns its place

Cloudflare Containers are GA, run the literal SKILL.md toolchain, and cost roughly $0.00016 per
job beyond an allowance of ~4,500. **They are the right answer to a question this document does
not ask.** What they buy that the isolate cannot: **OCR for genuinely scanned sets** — and that
is the only one. PDFium WASM was also proven to work in workerd (+2.51 MB gzip), but it gives
pixels without OCR, which is the wrong half.

So: **provision a container when a document reports a gap the isolate cannot close, and not
before.** `GeometryGap = "raster_page"` already exists in `worker/lib/drawing/types.ts` as the
trigger. Until it fires, ship nothing.

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

### Stage 1 — Complete the proof. The only thing to do next.

**1a. Does it run inside workerd, in 128 MB?** The same script as a temporary route or a
miniflare test at production compat settings, reporting identical coordinates and peak memory.
**Miniflare does not enforce the 128 MB cap** — it allowed a 1600 MB allocation without
complaint — so a green miniflare run is not proof. Needs a real deploy behind a flag, or an
explicit heap cap in node.

**1b. Does it generalise to a second, unrelated plan set?** Everything above is calibrated on
n=1: one drafter, one CAD chain ("Microsoft: Print To PDF"). Deliverable: the hit rate and
false-positive count over one more real builder's set. *(2026-08-27: the owner has a second
set to supply. Until it is measured, every generalisation claim here stays unproven — the
within-document result in §2a says nothing about a different drafter.)*

If 1a fails, the host changes to a container. If 1b comes back low, the primary path becomes
model-assisted rather than geometric. **Both rewrite everything after, which is why nothing
past here is planned in detail.**

### Stage 2 — Fix page selection. Independently shippable, valuable today.

Unaffected by Stage 1's outcome. Right now the plan skill reads a stair detail on every
architectural upload.

### Stage 3 — Defuse the symbol profile. Small, and must land before anything reads a symbol.

### Stages 4+ — Outline only; host decided by Stage 1.

Geometry → **frame lookup per known opening** → `splitHints` with `source: "drawing"` →
escalation → disambiguation → progress detail. Each independently shippable and inert until the
next lands.

Note the ordering change that the §0 framing buys: **disambiguation moves late.** It was a
prerequisite when this looked like a discovery problem; driven by a known list it is only needed
for same-sized rows, so the pass delivers value for every uniquely-sized opening before any tag
harvesting exists at all. On this document that is **15 of 19** openings — of which **11 read
outright** and 4 are not read (§2a). It was stated as 17 of 19 while W14/W16 were believed to
be the only same-sized pair; the real pairs are W5/W6 and W9/W11.

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
4. **Is ±2.5% good enough to ship unreviewed?** Every proposed split already carries "confirm
   the configuration at review". If drawing-derived splits stay behind that gate the question is
   moot; if they are to flow through unreviewed, ±2.5% at 2050 mm is ±50 mm and needs sign-off.
5. **Who owns a practice's symbol profile?** An ops screen someone fills in, or inferred and
   confirmed once per practice on first encounter? It decides whether §6 is a code change or a
   data model.
