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

W14 and W16 reproduce W1's internal structure exactly — same eight verticals, same two
diagonals.

**Cost:** page 6 is 31,082 operators → 5,928 segments in 110 ms; page 7 is 36,415 → 8,924 in
70 ms. Peak heap for the whole job, text plus both elevations: **34 MB** in node.

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

**Stage 5 — Frames** *(drawing Stage C)*. Find the rectangle matching each schedule row's
dimensions, then read internal full-height verticals as mullions and count diagonals per leaf.
**Rejection is the work, not extraction** — a strict matcher searching for W1's 2050×2100 also
returned the title-block logo border as a 2091×2091 mm "window". Codified rules: a real frame
contains at least one leaf whose head and sill rails span the same x-range; a candidate whose
measured size differs from the schedule row by >2% is not that window.

**Stage 6 — Tags and join** *(drawing Stages B and D)*. Tags come from `getTextContent` on the
floor plans — no operator list needed. Two verified traps: every tag is an octagon carrying
**two** lines (`W1` over `S08`), so a single-token reader mis-segments; and a legend decoy `W1`
sits at (975, 486) on both plan pages, distinguishable because its second line reads `S7`.
Association is the genuinely unsolved sub-problem — elevations carry no tags and W14/W16 are
identical drawings, so the resolution is ordering along the wall from plan-view tag positions.

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
back-calculating (§1.2). No orientation value: the north point is a symbol on the site plan,
and there is no compass word anywhere near the elevations, so this is **not read**, never
"not stated" (§4).

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

## 6. A landmine to defuse first

`worker/lib/drawing/profile.ts` ships `DEFAULT_PROFILE = { apexMeans: "hinge", confirmed: true }`,
and `refineOperable` maps a bottom apex to **hopper**. Every operable sash measured in this set
has its apex at the bottom, and the schedule calls all of them **AWNING**. This practice draws
apex = opening edge, the inverse of the shipped default — so `refineOperable` would name every
operable panel in this job a hopper, at full confidence, because `confirmed: true` makes the
guard vacuous.

Inert today (nothing imports the module but its test), and the `MISMATCH_QUORUM = 3` safeguard
would catch it against twelve disagreeing sashes. But the default is empirically wrong for the
practice that produced the document this exercise exists to fix.

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

### Stage 0 — The proof. **Done, in this session. It passed.**

Read W1's composition from the real document with no pipeline: 110 ms, 34 MB, eight
coordinates, reproduced independently three times, and calibrated against W4 where the drafter
stated the answer.

### Stage 1 — Complete the proof. The only thing to do next.

**1a. Does it run inside workerd, in 128 MB?** The same script as a temporary route or a
miniflare test at production compat settings, reporting identical coordinates and peak memory.
**Miniflare does not enforce the 128 MB cap** — it allowed a 1600 MB allocation without
complaint — so a green miniflare run is not proof. Needs a real deploy behind a flag, or an
explicit heap cap in node.

**1b. Does it generalise to a second, unrelated plan set?** Everything above is calibrated on
n=1: one drafter, one CAD chain ("Microsoft: Print To PDF"). Deliverable: the hit rate and
false-positive count over one more real builder's set.

If 1a fails, the host changes to a container. If 1b comes back low, the primary path becomes
model-assisted rather than geometric. **Both rewrite everything after, which is why nothing
past here is planned in detail.**

### Stage 2 — Fix page selection. Independently shippable, valuable today.

Unaffected by Stage 1's outcome. Right now the plan skill reads a stair detail on every
architectural upload.

### Stage 3 — Defuse the symbol profile. Small, and must land before anything reads a symbol.

### Stages 4+ — Outline only; host decided by Stage 1.

Geometry → frames → tags and join → `splitHints` with `source: "drawing"` → escalation →
progress detail. Each independently shippable and inert until the next lands.

---

## 9. Open questions

1. **When a drawing and a stated dimension disagree, which wins?** Spec §6 says the drawings win
   on composition. But W4's comment states `600 | 2000 | 600` exactly and the drawing measures
   `615 | 1970 | 615` — so §6 read literally replaces an exact stated figure with a ±2.5%
   measurement on a case we currently get right. **Recommendation: split it** — the drawing wins
   *operations, order and count*; a stated dimension wins *widths*. That matches §1.2's "a
   printed dimension outranks a measured proportion", but it is a change to §6 as written.
2. **`wallOrientation` is unreadable on this set.** The north point is a symbol on the site
   plan; no compass word appears near any elevation. Report *not read* and accept the
   Uw-cap-only path, build a north-arrow reader (a separate project), or ask the builder once at
   review? **Recommendation: report not-read now, ask at review soon.**
3. **`DEFAULT_PROFILE.confirmed`** — flip the convention and re-confirm it, or set
   `confirmed: false` so the schedule's type text wins? See §6.
4. **Is ±2.5% good enough to ship unreviewed?** Every proposed split already carries "confirm
   the configuration at review". If drawing-derived splits stay behind that gate the question is
   moot; if they are to flow through unreviewed, ±2.5% at 2050 mm is ±50 mm and needs sign-off.
5. **Who owns a practice's symbol profile?** An ops screen someone fills in, or inferred and
   confirmed once per practice on first encounter? It decides whether §6 is a code change or a
   data model.
