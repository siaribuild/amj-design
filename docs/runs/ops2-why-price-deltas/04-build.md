## t1 - Contract + candidateOf allow-list + API test flip

Files: `src/data/rationale.ts`, `worker/lib/estimator/rationale.ts`,
`src/data/recommendation.ts`, `scripts/tests/why-rationale-api.test.mjs`.

`RationaleCandidate.deltaToSelected: number | null` added (SIGN CONVENTION
doc comment); `candidateOf` maps it from `o.price?.deltaToSelected` via the
existing allow-list, never a spread. Rest of the forbidden set (total,
currency, exclusions, learned) still absent by shape. Fixed the stale
"GST-free" comment on `recommendation.ts`'s price block.

Test now asserts: pick's delta is 0, alternatives' deltas are
`65, 50, -30, -50`, a no-price fixture yields `null`, a fixture carrying
exclusions+learned leaks neither while its delta passes through, and the
three refusal-body tests assert no `deltaToSelected`/`$` leak.

`npm run test:why`: 79/79 green. `typecheck:gate`: clean.

Next task: no known follow-up work flagged by this slice.
