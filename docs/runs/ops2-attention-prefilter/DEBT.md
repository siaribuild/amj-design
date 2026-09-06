- [low] Ponytail review, five mechanical simplifications. All are shrink-only: no behaviour may change and the 44 browser tests, test:ops2 134 and api.test.mjs 31 must all stay green — they are the arbiter, so run them.

(1) src/ops2/attention/attention.ts:129-153 — the refactor GREW. GROUP_SPECS used to drive all three groups through one loop; Enquiries and Customers are now two near-identical hand-written 12-line blocks. Restore a 2-entry spec array of {id, key, noun} and loop it, with projectRows() pushed first. ~12 lines.

(2) src/ops2/projects/queue.ts:650-651 — ATTENTION_FILTERS.find() runs once PER ROW inside the .filter callback. This file already has REFINEMENT_BY_KEY and CHIP_BY_KEY for exactly this shape. Add ATTENTION_BY_KEY and hoist  above the chain. It also removes the duplicate .find()-plus-non-null-assertion at queue.ts:377 and ProjectsPage.tsx:168.

(3) src/ops2/attention/attention.ts:84-89 — Record<AttentionKey, (count: number) => string> where three of the four thunks ignore their argument. Make it Record<AttentionKey, string> and pluralise submissions at its one call site (line 105). ~3 lines.

(4) src/ops2/attention/attention.ts:25,38-43 — a SUMMARY_KEYS array and a loop for two fields. Destructure the two and test them directly; Number.isFinite is false for any non-number so the type check comes free. ~4 lines. KEEP the fail-closed semantics exactly: a missing or non-finite value must still yield the degraded state.

(5) src/ops2/attention/attention.ts:61-62 — two returns of the same value; collapse to one condition. 1 line.

DO NOT DO ponytail's finding 7 (merging the two location effects in ProjectsPage.tsx into one). It is a sound argument on paper, but that code took three attempts and a console instrumentation session to get right — the apply/reset split is load-bearing against a race where ionViewWillEnter never fires — and ~8 lines is not worth reopening it. If you disagree after reading the comments there, say so in the build log rather than doing it.
