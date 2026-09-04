# Phase 2 — acceptance criteria (handover Tasks 3–4, Phase C plan placement)

**Status: awaiting owner approval. No code until then.**

Phase C answers one question for every opening in the roster: *which face, which
storey, which position along that wall.* It never looks at an elevation and
never computes a crop — those are Phase D. Everything here mechanises §7.0's
first step: "I see the opening, ground floor, elevation A, and I know it is the
first opening on that elevation."

## Must be true

**P2-AC1 — every opening gets exactly one outcome.** Given a roster of N
openings, when placement runs, then it returns N outcomes: each either
`resolved` with a placement, or `unresolved` with a stated reason. No opening is
silently absent, and none appears twice.

**P2-AC2 — a resolved placement says face, storey, ordinal and count.** Given a
resolved opening, then it carries its elevation face, its storey, its ordinal on
that face and storey, and how many openings share that face and storey.

**P2-AC3 — the ordinal is plan-side and unique.** Given several openings on one
face and storey, then their ordinals are 1..n in plan order with no gaps or
ties, assigned before any elevation is consulted, so mirroring stays Phase D's
problem and is not baked in here.

**P2-AC4 — position along the wall is a fraction of the wall, not of the
openings.** Given a face whose extent is known from the plan footprint, then
each opening carries its distance along that wall as a fraction from 0 to 1
measured against the wall's own extent — so a single opening on a wall has a
meaningful position, and adding an opening does not move its neighbours. Given a
face whose extent cannot be established, then the fraction is null and the
ordinal stands alone.

**P2-AC5 — faces and storeys are named by the document.** Given any set, then
face and storey identifiers come from what that document prints — markers,
titles, or text. No fixed vocabulary: not A–D, not compass points, not a list of
storey words. A document naming its faces in a way no rule anticipated must
still place its openings, or say plainly that it cannot.

**P2-AC6 — deterministic acceptance is strict.** Given an opening with exactly
one retained plan candidate, an unambiguous face, a known storey and a unique
order, then it resolves without a model call. Given anything less — two
candidates, no face marker, an unknown storey, a tied order — then it is
ambiguous, and ambiguity is never resolved by taking the first option.

**P2-AC7 — a decoy is not a placement.** Given a tag that also appears in a
legend, a schedule block, or outside the plan footprint, then that occurrence
does not become a placement.

**P2-AC8 — unresolved openings survive.** Given an opening that cannot be
placed, then it stays in the roster with its reason, is never dropped, and never
inherits a neighbour's face, storey, ordinal or fraction.

## Must be true of the visual recovery (Task 4)

**P2-AC9 — only the ambiguous are sent.** Given a page with some openings
resolved deterministically, when recovery runs, then only the unresolved and
ambiguous tags appear in the request.

**P2-AC10 — one call per ambiguous plan page, capped.** Given a document with
several ambiguous plan pages, then at most one recovery call is made per page,
within the run's overall call ceiling.

**P2-AC11 — the roster is a closed vocabulary.** Given a model returning a tag
that is not in the roster, then that record is refused.

**P2-AC12 — a correction must name its evidence.** Given a model placing an
opening, then it must identify the exact plan candidate it used; a placement
with invented coordinates, or none, is refused.

**P2-AC13 — invalid output damages nothing.** Given a model response that fails
validation in whole or in part, then every deterministically resolved placement
on that page is unchanged, and the openings the response would have fixed remain
unresolved.

**P2-AC14 — page text is data.** Given a plan page whose text contains
instructions, then they are never followed: the call uses a closed schema and
bounded actions (invariant 11).

## Must NOT exist

**P2-AC15.** No elevation-side geometry anywhere in Phase C — no frame
inventory, no elevation coordinates, no left-to-right elevation order.

**P2-AC16.** No crop construction, no margin arithmetic, no storey band in
elevation space.

**P2-AC17.** No fixed elevation or storey vocabulary, and no branch keyed to a
filename, a tag spelling, a sheet size, or a layout only one document uses. The
reference sets verify; they never shape.

**P2-AC18.** No new field on `FullDocumentHarvest`, no prompt or pipeline
version change (Task 11 owns that), and no change to any existing engine.

**P2-AC19.** Nothing new under `faceMapped/` beyond `planFaces.ts` and the
additions to `contract.ts` that Phase C's own outputs require.

**P2-AC20.** No third source of placement truth: Phase C reads the harvest and
the plan pages. It does not re-derive page tiers, re-run north, or re-implement
anything §5 says to reuse.

## Verification, per the 2026-09-04 testing protocol

1. Unit suites, typecheck, and the review set — Codex code review, an adherence
   audit against these criteria, security, architect, ponytail.
2. A dry run over all three reference sets, reporting for every opening: face,
   storey, ordinal, count, fraction, and how it was resolved.
3. **The deterministic pass is reported separately from the recovery pass**, so
   what each contributes is visible rather than blended.
4. **The owner reviews that table against the drawings before the phase
   closes.** A green suite is not a placement being right.
5. Real infrastructure wherever the container is involved; nothing deployed to
   production, and any billable resource agreed first.

## Open question for the owner

§7.1 takes a face's opening count from the plan. Where a plan draws an opening
the schedule does not list — or the schedule lists one the plan does not draw —
that is a genuine disagreement rather than a placement failure. I propose
recording it as a conflict on that face and placing what can be placed. Confirm,
or say what you would rather see.
