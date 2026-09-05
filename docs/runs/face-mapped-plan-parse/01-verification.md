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
   "W 1" are one opening. `canonicalTag` in `faceMapped/tags.ts` compares tags that
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

## Second review, 2026-09-05: fifteen findings, and what changed

Five standards findings and ten spec findings. Every one is a code change with a
test, except the last, which is a fact.

- **The stage ran a pass-through validator and hashed one image.** Invalid model
  output could be recorded as a completed stage, and two faces on one sheet
  could be served each other's cached answer. Every look now runs its real skill
  through the stage layer, and the stage input is the whole request: the prompt
  (page, face, storey, count, candidates), every image, and the attempt number
  of a corrective retry, so a retry cannot replay the answer it is meant to
  correct. Each skill's
  validator checks shape and returns the answer in its own shape, normalised, so
  what the stage archives replays as itself; the engine judges meaning. Phase E
  reads under the verification model.
- **Every 300 DPI crop sat in memory until Phase E began.** Crops are now
  rendered, stored, read and released batch by batch - batches of four, at most
  four in flight, which is §7.6's own parallel contract, so at most sixteen
  crops are ever held. A batch whose crops half fail reads the half that did not.
- **Wall naming walked unbounded label permutations.** Bounded at eight distinct
  labels; a page strewn with more is refused, not solved.
- **Two scale-recovery implementations.** One now; the scale-only path delegates.
- **Oversized modules.** Reconciliation, tag identity, width judgement and wall
  naming each have their own file; `planFaces.ts` is 241 lines and
  `matchFrames.ts` 266.
- **Reconciliation saw only the elevation.** It is shown the plan and the
  elevation together, as §7.3 step 5 says - and if the plan will not render, the
  second look is not taken, because the elevation alone is the first look again.
- **One page size for every crop.** Each crop is bounded by its own sheet, and a
  neighbouring opening is one on the same sheet.
- **One render failure erased every reading.** A page that will not render
  costs the openings on it and nothing else.
- **Regions were strips, not grids.** Four elevations in a two-by-two are four
  cells: rows first, then columns within a row. Titles are one row when their
  baselines sit within one and a half title heights, not a fraction of the page.
- **Scale provenance and calibration were missing.** Each reading reports
  whether its page's scale was printed or recovered - the production branch
  says which. A page with no scale borrows one from every frame matched on it,
  across the whole page and not face by face, as the median of drawn over
  scheduled (§14). Fewer than three frames is not a scale, and neither is a
  median a majority of the frames do not agree with; the widths and crops sized
  this way say so.
- **Progress and audit were thin.** Composition progress is reported per settled
  batch; each opening's report row carries the plan candidate, the frame, the
  reading direction, the scale source and the crop basis. The pipeline's
  progress adapter still takes `(done, total, phase)` only, so the message and
  duration this engine emits stop at the adapter; changing that is a pipeline
  change, not this engine's.
- **The gate counted `drawn: false` as a match.** It is a third verdict now,
  excluded from both the numerator and the denominator, whether or not a
  reading row came back for the opening.

Three of the review's points are rejected, with the contract as the reason:

- *A `drawn: false` label that also asserts other fields should be `not_drawn`.*
  The gate's own acceptance fixture (AC-G3) has such a label score its stated
  fields and count; only the split is excluded. A bare `drawn: false` is the
  case that was inflating the score, and that is what is now `not_drawn`.

- *A crop can contain part of a neighbour whose centre is outside it.* §7.5
  rule 7 says to reject a crop containing a neighbouring opening's **centre**,
  and the margin exists so closely spaced frames show their edges. The rule is
  applied as written; a neighbour is one on the same sheet and the same storey.
- *Four concurrent batches hold sixteen crops, not four.* §7.6 sets batch size
  four and at most four batches in flight. Sixteen 300 DPI crops is well inside
  a Worker's memory; one at a time would be a different contract.

## Third review, 2026-09-05: twelve findings, and what changed

- **No aggregate image-memory limit.** A crop over 2 MB of base64 is refused and
  its opening reported unread, so at most sixteen crops of at most 2 MB are ever
  resident - well inside a Worker's 128 MB.
- **Type safety suppressed at the stage boundary.** The stage request and call
  are generic in the skill's output; no casts remain.
- **Render failures lost their cause.** Every reason now carries what the
  container said - a timeout and a malformed render are different problems.
- **Duplicated operation vocabulary.** One list, imported.
- **Sheet recovery accepted `{}` as success.** A reader that says nothing is
  malformed, not a sheet with no title and no scale; the stage records the
  failure.
- **Repeated face names across storey sheets.** A sheet says which storey it
  draws, and a face drawn once per storey sheet is read from the sheet for its
  storey. Two sheets with no storey to tell them apart are still refused.
- **Reconciliation image scope.** The elevation side is the face's own region.
  The plan side stays the plan page: a plan page is one drawing.
- **Progress contract.** `ai_job_claim.drawings_phase` has a CHECK constraint
  with six names (migration 0062); this engine's phases were reaching it as a
  seventh and the UPDATE was failing silently. They are now told in the persisted
  vocabulary. Messages and durations stop at the adapter: carrying them needs a
  column, and changing the CHECK is a table rebuild.
- **Audit measurements.** The stage layer reports what each call cost; a
  replayed stage is not a model call, and tokens are counted where they are
  spent. The report carries model calls, cached turns, tokens and provider
  warnings.
- **Replay testing.** A test drives the real stage layer twice with the cache
  on: the second call is served from the archive, costs nothing, and is the same
  answer.
- **`run.ts` size.** The crop-and-read driver and the match phase are their own
  modules; `run.ts` is 242 lines, under the 317 the owner accepted.

- **Calibration for a scale the frames contradict.** First rejected, then found
  in §7.4: "if several matched frames disagree consistently with the printed
  scale by the same factor, record the conflict and derive one effective scale
  from their median ratio." A page whose printed scale a majority of at least
  three matched frames disagree with is sized from the frames' own median,
  every reading on it carries the conflict, and its scale source reads
  `calibrated`. One opening cannot recalibrate a view; three that agree can.
  While doing this, a width disagreement shared by every pairing was found to
  drown the position signal that decides direction; only the part that differs
  between the two readings counts now.

A second Codex pass on this round found six partials and seven concrete cases,
all closed: a face title and a storey title sharing a band (a drawing's title is
singular, a sheet's plural); regions keyed by sheet as well as face; Phase A's
sheet reads counted in the spend; every render failure named where it costs;
a provider failure keeping its kind; an exhaustive persisted-phase map.

A third Codex pass found two more, both closed: a set that titles its sheets in
the singular - GROUND FLOOR ELEVATION - now reads as a storey because the plans
name GROUND FLOOR (the storeys a document's plan sheets print are what tell a
sheet title from a face title when the title word is singular); and a Phase A
sheet read that fails at the provider or the container now reaches the report
with its kind and what the container said, instead of the sheet vanishing.

Standing, with reasons: a plan page is one drawing, so the page is the plan
region for a second look (Codex accepts). On aggregate image memory Codex does
not accept: this engine keeps at most sixteen crops of at most 2 MB, but the
container client parses the render response before this engine sees it, with
no size cap of its own. That cap would live in the shared container client, used
by every engine, and is put to the owner rather than added here.

## Readiness

**The release gate has not passed, and this document does not claim it has.**
Placement works on all three sets. Composition reads are 0-5 per set and vary
between runs; the three-run identity, cost and timing comparison §14 requires has
not been done. The security review of the whole branch found nothing. The engine
is a mode the default configuration does not select, so deploying it changes
nothing until `AI_EXTRACTION_MODE` is set to `face_mapped` - which is how real
tests would be run. Expect placement to work and most compositions to come back
unread.
