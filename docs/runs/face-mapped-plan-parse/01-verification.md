# Face-mapped parser — verification, Phases C–E

Measured 2026-09-05 against the three reference sets, through the shipped engine
(`runFaceMappedParser`) with real page text from poppler, real page renders, and
real model calls. Not a stand-in.

## Where each document gets to

| | 312 | 939 | 623 |
|---|---|---|---|
| Schedule roster | 19 | 18 | 29 |
| Placed on a wall, in order | **19** | **18** | **19** |
| …of which from the drawing alone, no model call | 19 | 18 | 2 |
| Crops made | 6-8 | 5 | 4-6 |
| Composition read | 2-5 | 2 | 0 |

The last two rows are ranges because the elevation read is not deterministic:
the same document over three runs produced different frame boxes and different
counts. Placement did not vary at all.

Placement is the part that works. 312 and 939 place every scheduled opening from
printed text alone; 623, whose title blocks are drawn as graphics and whose tags
sit on leader lines, places 19 of 29 after one look per plan page.

## What stops the rest

Two things, both in the elevation half.

**The frame boxes are not accurate enough.** The read is asked for the complete
outer frame of each opening on one face and storey, and what comes back is often
a box that does not contain the opening: the crops it produces show cladding and
reference lines, and Phase E correctly answers "the crop does not show the
opening". The engine refuses rather than guesses, so nothing wrong is reported —
but nothing is read either.

**The counts disagree.** A face where the plan places three openings comes back
with one frame, or two. Since a count disagreement is a conflict rather than an
answer, the whole face is refused. Giving each face its own region of its sheet
(rather than the whole sheet with four elevations on it) improved this and did
not fix it.

Both are the same problem: what the elevation read returns is not yet good
enough to crop from. That is the next piece of work, and it is now measurable —
every phase reports what it refused and why.

## What was verified along the way

- 312 and 939 place 19/19 and 18/18 with **zero model calls**, so a set that
  prints its walls costs nothing.
- 623's sheet roles, scales (1:100 on its plans) and face names (NORTH, SOUTH,
  EAST, WEST) are all recovered by looking at sheets whose text layer is silent.
- A crop that could not be stored is not read; a width conflict found at
  matching reaches the report; a schedule that says one thing and a drawing
  another has both reported and neither corrected.

## Owner rulings, 2026-09-05, and what changed

1. **A tag is a type letter and a serial number.** W001, W01, W1, W-1 and
   "W 1" are one opening. `canonicalTag` in `planFaces.ts` compares tags that
   way everywhere the engine compares them; a schedule that spells one number
   twice has named the same opening twice and is refused as the duplicate it is.
   Placement unchanged: 312 19/19, 939 18/18, 623 18-19/29.
2. **Determiner guard** - kept. What it does: a plan sheet's storey is read as
   the words before PLAN in its title band; on 623 the only text in that band is
   the copyright line, and without the guard every opening files under a storey
   called THIS. The guard is the list of English determiners. No action needed.
3. **`run.ts` at 317 lines** - accepted as is.
4. **Phase A sheet recovery is wired into the production `face_mapped` branch.**
   Pages the text layer cannot classify or scale get the one look Phase A
   already knew how to take (`makeSheetFactsSkill`, closed schema, through the
   stage layer). A scale the text stated is never overridden. Proven by the
   "title block is drawn" wiring test.
5. **`wall_order` and `frame_box_json` are on `drawing_reading`** (migration
   0064, `ADD COLUMN` only - no rebuild, no cascade). The engine writes them,
   the gate scores them.

One note from the security review, not security and not this branch's: the R2
crop key sanitiser collapses `W1/A` and `W1_A` to one key, so two such schedule
tags would overwrite each other's crop within a run.

## Readiness

The security review of the whole branch found nothing. The engine is a mode the
default configuration does not select, so deploying it changes nothing until
`AI_EXTRACTION_MODE` is set to `face_mapped` - which is how real tests would be
run. Expect placement to work and most compositions to come back unread, per the
numbers above.
