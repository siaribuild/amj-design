## Design-conformance review — ops2-attention

**Verdict: CONFORMS.** No design clause violated. Every path design §2 named exists; nothing named was left uncreated; nothing built contradicts a design decision. Notes below, most significant first — all are accept-and-record, none need developer fixes.

### Named-vs-built reconciliation

**Everything design §2 named exists in the diff.** All six new files (`attention.ts`, `useSummary.ts`, `AttentionPage.tsx`, `attention.css`, `ops2-attention.test.mjs`, `ops2-attention.spec.ts`) created; all twelve changed files changed, including both design-named test artifacts — the absence-class failure this pipeline repeats did not repeat here. `worker/**` and `migrations/` untouched as required. Seed `u_staff7` (estimator, `liis@openframe.com.au`) and its ownership comment match §2 exactly. CONTEXT.md carries the §8 term verbatim in substance, correctly placed beside **Attention filter** with a distinguishing sentence — architect-ownership honoured.

### Built-but-not-named — each justified, design doc should absorb them

1. **`package.json` `test:pure` gained the suite, not just `test:ops2`** — design named only the `test:ops2` line, but its own test plan said "in `test:ops2` and thereby `npm test`", and `test:ops2` is *not* part of `npm test`. The implementation's `test:pure` addition is what makes the design's claim true. Deviation for good reason; design §2's package.json row was under-specified, not the code wrong.

2. **`scripts/tests/docs.test.mjs` — new guard test** (every node suite reachable from `npm test`) — unnamed by design. It exists precisely because the gap in point 1 was hit mid-build. Unrequested structure, but it mechanises "a named-but-never-run test file" — the exact failure class this repo's docs call its most-repeated. Keep; record in design doc as an addition.

3. **`scripts/tests/web/ops2-navigation.spec.ts`** — three assertion lists gained `Enquiries` `/enquiries`. Mechanically forced by T1; design's hand-off index missed it. Correct change, index omission.

4. **`src/ops2/styles/index.css`** — one `@import './attention.css'` line. Mechanically necessary for the named `attention.css` to load; same index omission.

5. **`.claude/launch.json`, `scripts/pipeline/conduct.mjs`, `scripts/tests/pipeline.test.mjs`** — pipeline-infrastructure maintenance, outside this feature's design scope entirely. Not conformance findings; noting so the diff is fully accounted for.

### Structure spot-checks

- Sequencing respected: T1–T7 file groupings all land where tasks placed them; T5/T7 share one spec file as designed.
- Logic placement: pure model in `src/ops2/attention/attention.ts`, hook separate, page separate — the §3/§4/§5 seams exist as files. No worker or route smearing possible (no worker files touched).
- Explicitly-untouched list holds: no diff lines in `src/ops/OpsApp.tsx`, no migrations.

### Recommendation

Update `02-design.md` §2 with items 1–4 above as recorded deviations (all good-reason); no code changes owed to this review.