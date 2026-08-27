# T8 — the ops surface. HANDOVER, not scheduled.

**Owner ruling, 2026-08-28: "over-engineered solution. Nice to have, perhaps."**

He is right about the slice as written, and this document exists so the next
session does not rebuild it from `02-tasks.json` without reading that ruling.
What follows separates the part that is genuinely load-bearing from the part that
is a convenience over a capability that already ships.

---

## What already exists, and is enough for a reviewer today

Three channels ship and cover "a wrong composition must be findable":

| channel | where |
|---|---|
| every proposed composite lands `status='technical_review'` with a warning | `estimator/estimate.ts:425-431` |
| those warnings are gathered into the submission reconciliation note staff read before issue | `quote.ts:51-74` |
| the ops console renders a per-unit **basis label** — "read from the drawing's elevation" vs "an even division the platform applied" | `src/ops2/projects/whyCopy.ts` |

That third one is the piece that mattered, and **it is already done**: `"drawing"`
is a member of `UnitRequirementBasis`, `whyCopy` labels it, and
`scripts/tests/ops2-why.test.mjs` fails if a member ever loses its label. A
reviewer opening "Why this product?" is told, per unit, whether a model read it
off an elevation or the platform guessed.

Staff can also already download the plan set, audit-logged (`ops.ts:2274`).

## What T8 would add, and what each part is worth

| part | worth |
|---|---|
| **crop viewer** (`GET /api/ops/ai/crops/:stageRunId`, staff-gated, audit-logged) | the only genuinely new capability — saves reopening the PDF and finding the window |
| readings summary on `GET /api/ops/projects/:id` | useful; duplicates what the review warnings already say |
| `DrawingReadings.tsx` panel | presentation of the above |
| `drawing-evidence-api.test.mjs` + `ops2-record.spec.ts` | needed **only if** the routes are built |

## The one argument for building it anyway, recorded so it is not lost

**The ground-truth fixture is produced by confirming openings against crops.**
No crop viewer, no fixture; no fixture, no measurable wrong-rate; and the release
gate's bar — zero wrong readings — cannot be evaluated at all. The
product-manager pass called it a precondition rather than polish for that reason.

That argument stands, but it is an argument for **measuring** the reader, not for
operating it. Nothing about the current deployment is unsafe without it: every
drawing-derived split carries `reviewRequired: true`, and the basis label already
tells a reviewer where the composition came from.

## If it is ever built, the parts that are NOT optional

These are the constraints `/security-review` named across four rounds. They apply
to the crop route specifically:

1. **The R2 key comes from the row's `metrics_json`, never from the request.** A
   caller-supplied key reads another project's document under this project's id.
2. **`isStaffUser`, not `resolveStaff`** — manufacturer partners are excluded.
   Crops are customer data.
3. **Audit-logged**, like the existing staff plan download.
4. **An unknown `stageRunId` 404s without an R2 read.**
5. The abuse cases are **executed**, not asserted in prose: customer session
   denied on both routes, manufacturer-partner denied, staff allowed, audit row
   written.

## Retention interacts with this

Crops are deleted when the draft is cleared or the quote is issued
(`ingest.ts:deleteProjectDerived`). **A crop viewer on an issued quote will find
nothing**, by design — the owner's rule is that the images are not needed once a
quote is issued in its final version. Anything that wants crops for a labelled
fixture must copy them out at labelling time, to a prefix outside both sweeps.

Building the viewer without honouring that turns "the evidence is gone" into a
bug report rather than the policy it is.
