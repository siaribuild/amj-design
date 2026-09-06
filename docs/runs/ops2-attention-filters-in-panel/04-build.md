# Build log

## t1 - Merge the four attention predicates into REFINEMENTS and delete the attention axis from the queue model
Files: `src/ops2/projects/queue.ts`, `scripts/tests/ops2-projects.test.mjs`.
REFINEMENTS now six entries (submissions, inReview, ready, awaitingPayment,
unresolved, production) in panel order; QueueQuery.attention, ATTENTION_FILTERS,
attentionQuery gone. Added ATTENTION_ARRIVALS (key→refinement map,
readyToIssue→ready) + arrivalQuery; attentionFromSearch validates against
ATTENTION_ARRIVALS. emptyStateFor's attention branch removed — an arrival's
empty state is now the ordinary refinements-named one (no more "Back to Needs
us"). selectProjects drops the attention filter pass.
Tests (18, all green): control-count floor 3+6; labelled zero under a hiding
chip (criterion 11); six-entry order + single "Ready to issue" (criteria 1,2);
source-text purge scoped to queue.ts only (criterion 18 — attention.ts and
ProjectsPage.tsx still reference old names, that's t2/t3); card≡panel counts
over PA–PF (criterion 19).
Next: t2 (attention.ts) and t3 (ProjectsPage.tsx) still import
ATTENTION_FILTERS/attentionQuery — typecheck:gate fails until t3, exactly as
design's sequencing states (gate at t3, not t1/t2). Don't re-run it before then.
