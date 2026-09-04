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

## Known deviations, for the owner

1. **Zero-padding tag alias** (`planFaces.ts`). Lot 623's schedule prints W1, W2,
   W3 and its plans print W01, W02, W03. Matched as strings that places nothing:
   19 of 29 becomes 0. Neither spelling is treated as the correct one, and a
   schedule holding *both* spellings widens neither. Codex classes this as a
   tag-spelling branch that P2-AC17 forbids. It is load-bearing on a real set.
2. **Determiner guard** (`locate.ts`). A storey is what a sheet puts before the
   word PLAN in its title, and a determiner is the one thing that word can never
   be. Without it, 623's copyright line files every opening under a storey called
   THIS. Grammar rather than a drawing convention, but it is still a word list.
3. **`run.ts` is 317 lines against a 200-line review target.** It holds phase
   calls, early exits and nothing else; splitting it further would be splitting
   for a line count.
4. **Phase A sheet recovery is not wired into the production `face_mapped`
   branch.** A set whose title block is graphics needs it, and the branch does
   not call it yet — 623 works in the harness because the harness calls it.
5. **The gate scores `wall_order` and `frame_box`, which no `drawing_reading`
   row carries.** Emitting them needs a migration.
