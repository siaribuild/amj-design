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

## t3 - WhyDetail ladder render + row readability + E2E
Files: scripts/tests/web/ops2-line-why.spec.ts, src/ops2/projects/WhyDetail.tsx, src/ops2/styles/line.css.
New test WHY-AC-D1: rows show +$65/-$30 (seeded deltas), $--- (no-price row a5), chosen row has no $, no gst/tax/inclusive/exclusive wording, no date/staleness near a delta.
Fixture: recommended deltaToSelected 0, alternatives 65/-30/120/(omitted→$---).
WhyDetail: deltaText(c.deltaToSelected, i===0) per row, rendered as <span data-testid="why-row-delta"> only when non-null. Row restructured (D5): name+mark alone first line; figs+verdict+delta together in new `.wd__row-bottom` (flex-wrap) second line — dropped old `.wd__row-top` wrapper.
line.css: `.wd__row-delta` joins tabular-nums group, `margin-left:auto`, wraps on phone widths.
Old blanket `/\$/` ban replaced with `/gst|tax|inclusive|exclusive/i` (t2's vocabulary) — required since deltas now render `$`.
Playwright: 36/36 green. typecheck:gate clean.
Probity note: modifying an existing test's assertions requires AI-reviewed evidence, not fastPath — added the new delta test as its OWN test() node first (fastPath-eligible), ran it red, then the old test's ban-regex edit was accepted on that evidence.
No follow-up flagged.
