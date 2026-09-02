# Acceptance criteria

## AC-1 — Preserve the baseline

`auto_drawings` continues to select the legacy parser. `agentic_full` selects
only the parallel full-document parser. Existing focused parser, estimator and
compatibility suites remain green.

## AC-2 — Schedule operation is a constraint

Given a schedule operation and a drawing composition, the drawing may refine
the schedule only when that operation remains in the composition. AWNING +
FIXED satisfies scheduled AWNING. FIXED + FIXED does not.

A contradiction is not rewritten or silently applied. It is excluded from the
automatic split hint and produces one ops review warning naming the drawing and
schedule sides.

## AC-3 — Field-scoped evidence

An orientation-only warning such as unresolved north does not discard valid
composition or room evidence. A manufacturability warning does not discard
observed geometry. Identity/evidence warnings continue to block affected
fields. Every retained warning still reaches ops.

## AC-4 — Exact scheduled geometry

Divider measurements are converted against the scheduled overall dimension.
Printed component widths win. The final component takes the exact remaining
dimension, including non-50/50 openings and door sidelights.

## AC-5 — Glazing requirements are minimums

Double glazing satisfies both a positive double-glazing requirement and a
schedule where double glazing is not required. The latter must not emit a
glazing conflict or reject the double-glazed product.

## AC-6 — Complete-set accuracy gate

The reference fixture scores every scheduled opening by semantic composition,
asserted component widths and asserted room. Missing or unread fields are
misses. Reference tags and values are not imported by production code.

Before promotion, `agentic_full` must produce 19/19 on three consecutive runs
with model, prompt version, duration and cost recorded. The legacy semantic
output must not regress.

## AC-7 — One plan PDF per full-document run

`agentic_full` accepts one plan PDF containing the schedule and drawings. If the
pipeline supplies several plan PDFs, advanced drawing enrichment is skipped and
the existing schedule result remains available; PDFs are never combined into a
single in-memory agent context.

## AC-8 — Bounded escalation

Only low-confidence or flagged records are eligible for a targeted higher-DPI
confirmation. A replacement is accepted only when its evidence passes the same
rails. Otherwise the original and escalation evidence remain available for ops
review.
