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

## t2 - whyCopy deltaText + ladderNote + banned-vocabulary re-scope
Files: scripts/tests/ops2-why.test.mjs, src/ops2/projects/whyCopy.ts.
BANNED drops /\$/, keeps GST/AUD/ex-inc-GST, adds tax/inc/ex/incl/excl/inclusive/exclusive; D18 comment rewritten (one raw delta allowed, no GST/tax/basis wording).
New export deltaText(delta: number|null, chosen: boolean): string|null — "+$100"/"-$200"/"$0"/"$---"; chosen mutes to null; en-AU comma grouping.
ladderNote(>=5) drops "No price, nothing to price, and"; keeps "the next four by rank" and "nothing here changes the line."
Source-scan test confirms src/data/recommendation.ts (already fixed by t1) says tax-inclusive, not GST-free.
npm run test:ops2 green (94/94), typecheck:gate green.
t3 (WhyDetail.tsx render + E2E): call deltaText(c.deltaToSelected, i===0) per ladder row, render only when non-null in a `wd__row-delta` span.
