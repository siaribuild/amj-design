# T9 — estimating thermal requirements when there is no energy report. HANDOVER.

**Owner, 2026-08-28: "provided that energy reports are not available, we need to
be better at estimating thermal requirements."**

Raised after asking whether orientation and the other thermal inputs are parsed
from the plans. **They are not.** Only composition is. This is the gap.

---

## The finding that motivates it, in the code's own words

`worker/lib/estimator/thermal/computedBand.ts:4-8`:

> *"…gave 444 of 444 production openings the same band. The one branch that would
> have made two openings differ — the orientation→SHGC mapping — had never
> executed on a real job, because orientation only ever arrived alongside an
> energy report and a report suppressed the computed band entirely."*

So the orientation-sensitive branch exists, is tested, and **has never fired in
production**. Where a report exists it is not needed; where none exists,
orientation is null and every opening gets the same answer.

## Why orientation is the highest-value input, not just a missing field

It is the one that changes **which products are eligible**, and therefore price:

- E and W → cooling cap `maxShgc 0.43`
- NE / SE / SW / NW → `0.5`
- N and S → no cap

Output spec §1.4 states it plainly: *"This is the one that looks like trivia and
is not."* Unknown orientation yields a Uw cap only — advisory, weaker, and not
wrong, but it makes every elevation of a house identical.

## Why the current route cannot produce it

`planContextExtractor` (`skills/plan.ts`) already asks a model for
`orientation` per opening, enumerated `N…NW`. It is fed **`doc.roleText.plans`** —
flat text with all coordinates discarded. Orientation is not written on a
drawing; it is *geometric*: which wall a tag sits on, and which way that wall
faces. Text cannot carry it, so the field comes back null.

One thing did change on 2026-08-27: the page router was fixed, so this skill now
receives the actual floor plans and elevations instead of a 1:20 stair detail. It
may extract more than before. It will still not extract orientation from words.

## The route the design already sketched, and never built

`docs/estimator/drawing-parse-design.md` §4.6 — "Orientation is a separate
workstream" — records a chain that was **verified on the reference set** and is
mostly text, not pixels:

1. **The site plan states the lot's boundary bearings as text.** On the reference
   document: `178°22'10"  268°22'10"  358°22'10"  268°22'10"`. A rectangular lot
   on 88°/268° and 178°/358°. **268°22'10" is west**, which agrees with the
   independently-reported "front (west-facing) wall" for W1. No symbol
   recognition needed for the hard part.
2. `FRONT` / `REAR` labels' positions on the site plan → which axis end is the street.
3. A window tag's position on the floor plan → which wall of the building it sits in.
4. Wall → outward normal → one of eight compass points.

**The consequence the design draws, and the reason this is cheap:** orientation is
**ONE determination per building**, not one per opening. Fix the compass frame
once from the bearings, and every window inherits it from its wall position. The
elevation letters (A–D on the floor plan, seen in this session) then become a
cross-check rather than the source.

`azimuthToOrientation` already exists (`worker/lib/drawing/ref.ts`) and maps a
bearing into the platform's own `N…NW` vocabulary, so the landing zone is built.

## What else was asked about, and why it is NOT in scope

The output spec §3 excludes these **deliberately**, each with the reason being
what the code does today, not a preference:

| excluded | why |
|---|---|
| sill and head heights | no consumer; changes neither product nor price |
| eaves / horizontal projection | sets `shadingKnown` in `estimator/types.ts`, **which nothing reads** |
| level / storey | stored on the room record; no estimator code reads it |

If T9 wants shading to matter, the work is not "parse the eaves" — it is giving
`shadingKnown` a consumer first. Parsing a field nobody reads is how the four
dead columns in `CONTEXT.md` happened.

## Suggested shape

1. **Read the bearings.** Site-plan text, positioned. `getTextContent` gives
   coordinates; no vision call needed. Cheapest possible first step, and it either
   works on a second drafter's set or it does not — which is the thing to learn
   before building anything on top.
2. **Locate tags on the floor plan.** This is the part the owner flagged as hard:
   *"sometimes id is next to the window diagram, sometimes further away with a
   connecting line."* A vision pass over the floor plan is the route consistent
   with the 2026-08-27 ruling — not geometry.
3. **Wall → normal → compass**, through the existing `azimuthToOrientation`.
4. **Feed `OpeningV1.orientation`**, which `applyPlanContext` already writes and
   `computeDefaultBand` already consumes. No new plumbing.

## The measurement that would justify it

Before and after, over a set with no energy report: how many distinct thermal
bands does a house get? Today the answer is one, for 444 of 444 openings. If it
is still one afterwards, orientation did not arrive and nothing was gained.
