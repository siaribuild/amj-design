# Design addendum — the Metadata tab redesign

`02-design.md` in this directory is the ORIGINAL design, for the three-panel
tab built against `feat/plan-parse-conformance`. It is kept because the seams it
specifies are unchanged and still govern: the route grammar, the two staff-gated
reads, the crop stream, the decoding seam, and the AC-5/6/7/20 rules about which
lines serve `/meta` at all.

This addendum records what the redesign changed, and why. There is no second
design document because the design decision was taken in two places that already
exist: the grill answers of 2026-09-04, and the mock the owner approved.

## Why there is a redesign at all

The tab was built against one parser generation and production now runs another
(`plan-parse-19-of-19`, merged to `apertly/main`). The persisted schema did not
change — `drawing_reading` is untouched, so the read path was already correct —
but the run report gained material the tab could not see:

- a per-opening correction trail: `attempts`, `acceptedTurn`, `corrections[]`
- `read.targetedReviews`
- file-level telemetry: `cachedTurns`, `repairedTurns`, `inputTokens`, `outputTokens`
- `providerFailure`

The owner's words: *"given the richness of information, it needs to be presented
in a consumable way within metadata tab."*

## Binding decisions (grill, 2026-09-04)

1. **Verdict first, record underneath.** The trail lives behind a door, not on
   the surface, because the common case is glance-and-move-on.
2. **Ops staff, with a developer's data available.** One surface, not two.
3. **The trail shows only when it is not empty.** Absence is the signal.
4. **No used/not-used state, and no synthesised verdict sentence.** The owner
   rejected both: *"it's information relevant for checking accuracy. I'm not
   asking to implement explanation of all subtleties in the ops2."* The tab
   shows what the parser recorded; what the system then did with it is a
   different question and not this tab's job.
5. **Assume a single source document.** The code supports several; the tab does
   not build for it, and names the file on the evidence when there is more than
   one.
6. **No project-level run view.** Real need, different surface, not now.
7. **Raw codes**, exactly as stored — the same rule the state words follow.
8. **Attempts behind the door**, in the trail's heading, never on the surface.
9. **`providerFailure` is shown**, because a failed model call and an unreadable
   drawing need different people looking at them.
10. **Flags are listed, never counted**, on the surface and again in full behind
    the door.
11. **Behind a door must be readable, not a text area.** This is the constraint
    that produced the grouping.

## What changed, against the approved mock

`docs/mocks/ops2-parse-metadata-v2.html` is the gate. Approved with one change
carried in (decision 10) and one correction made before approval (the trail was
drawn in a shape `fullDocumentAgent` cannot emit).

- **Surface** — unchanged in structure: crop first, then the five facts. Only
  the flags row changed, from a count to the flags.
- **Reading door** — grouped, with the correction trail last, after the
  evidence rather than between the facts and their source.
- **Run door** — six named groups in the order the run happened. This is the
  substance of the redesign: 22 figures in one list was the wall.

## Two shapes the parser emits, and why the code says so

`fullDocumentAgent` writes corrections at two sites, and they differ:

| site | shape |
|---|---|
| main rejection (`:1288`) | `{ turn, reasons }` — no stage, no outcome |
| escalation (`:1512`) | `{ turn: 1, stage, outcome, reasons: [one code] }` |

So a main-path row shows no outcome, because none exists — not because one was
dropped. The escalation row is labelled rather than numbered, because its turn
is always 1 and printing "Turn 1" under a "Turn 2" reads as the run going
backwards. Both were drawn wrongly first, from the type rather than the code,
and corrected before approval.

## Explicitly out of scope

- **No parsing code is touched.** Owner, verbatim: *"DO NOT TOUCH PARSING
  CODE."* Everything here reads data already persisted.
- **No migration.** `evidenceView` stays unpersisted, as before.
- The crop-store failure that writes `crop_key` NULL with no `gap_code` is a
  parser defect, still open, tracked separately.
- The harvest retention fix is its own branch (`fix/harvest-retention`),
  deliberately not folded in.
