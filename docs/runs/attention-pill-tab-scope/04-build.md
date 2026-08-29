## t1 - the ask in docs/runs/attention-pill-tab-scope/00-ask.md

Files: `src/ops2/projects/ProjectRecordPage.tsx` (guard `{attention > 0 && tab === "lines" && (` on the pill's render, comment above it updated to state the tab-scoping rule), `scripts/tests/web/ops2-record.spec.ts` (new test).

Test "the attention pill is scoped to the Lines tab, not drawn on Project": loads record with 2 lines (1 needs attention), asserts pill visible on Lines tab, clicks Project tab, asserts pill gone (count 0), clicks back to Lines, asserts pill visible again. Failed before fix (count 1 on Project), passes after.

Full ops2-record.spec.ts (23 tests) and full `npm test` (306/306) green after. No other tasks queued for this run.
