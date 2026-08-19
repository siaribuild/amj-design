# Recommendation model — design-conformance review

**Stage:** pipeline stage 7 (architect, returning) · **Date:** 2026-08-20 · **Branch:** `feat/recommendation-model` (39 commits ahead of `main`, tree clean)
**Baseline:** `docs/specs/recommendation-model-design.md` (§0–§18) · adjudication source where design and outcome disagree: `docs/specs/recommendation-model.md` + grill conclusions D1–D18.
**Scope:** structure only. Behaviour against the 58 ACs is the tester's; this review checks that the structure the design specified landed, and that every divergence is sound and disclosed.

## Verdict: **CONFORMS WITH DIVERGENCES**

All divergences found were in the developer's disclosed list; every one was adjudicated sound (three with a design error on my side as the cause). No silent structural divergence was found. Three minor findings (F1–F3, end of document) go to the developer; none blocks acceptance.

---

## 1. File-by-file plan (design §12) — presence audit

Absence is the failure mode this section hunts. Every path checked on disk this session.

### Created

| P | File | Present | Verdict |
|---|---|---|---|
| 1 | `src/data/recommendation.ts` | yes | Conforms — §3 shape verbatim, zero imports, stability rules in header |
| 1 | `worker/lib/estimator/ladder.ts` | yes | Conforms — §4 interface exact; one comparator-ordering divergence, adjudicated §3.1 below |
| 1 | `worker/lib/estimator/outcome.ts` | yes | Conforms — §5.4 builder; prose-free exclusions mapped exactly per §5.4's table incl. AD13 |
| 1 | `migrations/0055_recommendation_outcome_columns.sql` | yes | Conforms — ADD COLUMN ×2 only, numbered after 0054, cascade audit written into the file |
| 1 | `docs/adr/0007-recommendation-filter-then-ladder.md` | yes | Verbatim §1.3 text; numbering 0007 correct (branch holds 0001/0002; ops2 holds to 0006) |
| 1 | `scripts/tests/recommendation-ladder.test.mjs` | yes (24 tests) | Conforms — AC-1/2/3/5/6/13-15/43-49/51/52, E5/E9/E10/E11, AD2/AD3 all present |
| 1 | `scripts/tests/recommendation-contract.test.mjs` | yes | Conforms — AC-4 source scan, AC-23 esbuild metafile, AC-21/54 hostile fixture, A17 sign, migration lint incl. AC-58 scope |
| 2 | `worker/lib/estimator/splitCandidates.ts` | yes | Conforms with divergences #2/#3 (adjudicated below) |
| 3 | `migrations/0056_learning_retrieval_and_provenance.sql` | yes | Conforms — §9.2 SQL exact; scoped DELETE; index; CHECK'd provenance default |

### Modified (all present in the diff, spot-verified against the design's per-file instructions)

| P | File | Verdict |
|---|---|---|
| 1 | `rules.ts` | Conforms — `checkEnergy` gone (tombstone comment), intersection block gone, `fitFacts` + `resolvedRequirement` added, `checkDimensions` severities kept (AD5), `RULE_VERSION = "v3-energy-objective"` (AD16). Divergence #6 (unconditional `checkPerformanceData`) adjudicated sound, §2.6 |
| 1 | `select.ts` | Conforms — evaluate/decide seam behind unchanged `selectForOpening`; `SelectionResult` reshaped per §5.3 (deletions confirmed: `score`/`components`/`rank`/`selected`/`dominant`/`alternatives`/`rankerVersion`); `parentRepresentative` present. Additions: `splitNote` field (divergence #2), `decide` takes an opts object rather than positional splits — trivial reshaping |
| 1 | `configuration.ts` | Conforms — affinity trio deleted (grep: zero symbols anywhere), `eligiblePerformanceVariants` kept |
| 1 | `compositeRank.ts` | Conforms — facts module; `ScoredUnit`/`area`/`areaWeightedMean`/`glassOf` kept, four score functions gone, `makeUpDeviation` added (divergence #5, adjudicated §3.5) |
| 1 | `compositeSelect.ts` | Conforms — `enumerateMakeUps` extracted; `choose()` runs `runLadder`; no weight set declared. `selectForComposite` retained but production-dead — finding F2 |
| 1 | `learning.ts` | Conforms — commercial/historical model deleted (tombstone), `contextKey` still written, thermal advisory model retained; P3 additions per §8.2/§8.3 (`retrievalKey` whitelisted-by-construction, `RETRIEVAL_KEY_VERSION`, `SHADOW_MIN_OBSERVATIONS = 5`, `aggregateShadow` pure) |
| 1/2 | `persist.ts` | Conforms — §10.1 table row-for-row: `ranker_version` ← `selectionVersion`, `selection_json` written, `score`/`score_components_json` bound NULL, tier-derived `warnings_json` tokens exact per spec 4.11, `confidence` NULL (A12), split rows per §7.5 (lead-unit identity, `composed: true` price snapshot, `hard_rule_passed = 1`) |
| 1/2 | `estimate.ts` | Conforms — hint read before selection, `selectWithSplits` per opening, `materialiseSelectedSplit` as the §7.3 rump with both failure paths (refusal → `flagForReview` technical_review, exact old shape); `buildShadowModel` once per run (P3); historical model import gone |
| 1/2 | `proposal.ts` | Conforms — §10.2 read sites all moved; `alternatives_json` = `[]` (AD8); `ranker_version` ← `selectionVersion`. Divergences #4 (`proposalVerdict` lift) and the `proposalSeed` guard adjudicated sound, §3.4 |
| 3 | `ai/outcomes.ts` | Conforms — capture keeps its call site (`issue.ts` untouched), twelve fields untouched + three additions (AD9), `retrieval_key`/version per row, provenance literal `'in_platform'`; `captureBackfilledOutcomes` refuses rather than coerces, project id verified. Divergence #7 adjudicated §3.7 |
| 3 | `routes/ops.ts` | Conforms — backfill route beside the PATCH, thin (auth → parse → delegate), staff-gated with `resolveStaff` + `hasAssignedRole`, per §15.3's exact authorization row |
| 4 | `src/data/scheduleMatch.ts` | Conforms — §11 exact: injected `SchedulePriceLookup`, cheapest-that-fits with bias fallback and tiebreak, ≤0/null unpriceable, per-call memoisation, nothing-fits and no-dimensions branches untouched |
| 4 | `worker/lib/parse.ts` | Conforms — resolver built once per parse job with a **null user** (AD11), sync closure injected |
| 1 | `package.json` | Conforms — both new suites in `test:pure`; `test:ladder` script added exactly as specified |
| 1/3 | `CONTEXT.md` | Conforms — §1.1 Visitor (placed after Payable account, under Actors) and every §1.2 entry **verbatim**, including the three Phase-3 entries; Estimator entry sharpened as written; vocabulary coherent with the existing glossary |

### Deleted

| File | Gone | Verdict |
|---|---|---|
| `worker/lib/estimator/rank.ts` | yes | Conforms |
| `worker/lib/estimator/thermal/compliance.ts` | yes (thermal/ holds only computedBand/precedence/types) | Conforms |

Symbol sweep: `RANK_WEIGHTS`, `geometryScore`, `configurationScore`, `dataCompletenessScore`, `selectWithConfidence`, `gradedComplianceScore`, `SHGC_SPAN`, `UVALUE_SPAN`, `rankCandidates`, `RANKER_VERSION`, `buildHistoricalModel`, `aggregateHistorical`, `variantAffinityScore`, `technologyAgreement`, `scoreComposite` — zero live references in `worker/` or `src/`; only tombstone comments remain. The AC-4 scan is additionally enforced at test time (`recommendation-contract.test.mjs`).

### §14 test artifacts — the two the developer declined

| Claim | Verified | Verdict |
|---|---|---|
| `estimator-derive.test.mjs` unchanged; no pins on deleted exports | grep for every deleted symbol, `rank`, `score`, `dominant`, `alternatives`: **zero hits** | Claim true. Leaving it unchanged is correct |
| `composite.test.mjs` unchanged; AC-8 relocated | File tests `validateSplit`/`proposeEvenSplit` from `worker/lib/composite.ts` — split **geometry arithmetic**, no estimator imports, no deleted-symbol pins. AC-8 landed at `composite-select.test.mjs:543` ("a mixed-system make-up is never offered") **and** `estimator-split.test.mjs:982` (AC-8/E12 refusal reported) | Claim true; the relocation argument holds — combinability belongs with make-up enumeration, which this file never touched |

Remaining §14 assignments: all named files exist and are wired; within-file ownership was redistributed in places (AC-1/AC-6/E5/E9 integration halves consolidated into the pure ladder suite rather than duplicated in `estimator-recommendation.test.mjs`). No named criterion is absent from the battery; per-AC evidence is the tester's to confirm.

Operational evidence (§14 tail — the −9 corpus export/count on remote apply) is **not yet due**: it belongs to the production apply step under the d1-migration-safety protocol, not to this review.

---

## 2. Structural questions (the design's integrity claims)

**Is the ladder the single comparison path?** Yes. Every `.sort(` in `worker/lib/estimator/` and `worker/lib/ai/` was audited: `ladder.ts:249` is the comparator; every other sort is enumeration order (covering systems, glass trials), identity (largest-area lead unit), geometry shares, stable-JSON keys, or a **re-read of the ladder's own rank** (`parentRepresentative`, select.ts:447 — sorts by `candidateOutcome.rank`, i.e. the ladder's verdict, not a second opinion). `decide()` runs one `runLadder` over singles + splits combined (select.ts:251), which is AC-50 by construction. `selectWithSplits` runs a preliminary `decide` whose output is used solely as a **dimension input** (representative max width / pairing) and then discarded — same comparator, not a second one, and commented as such.

**Is `src/data/recommendation.ts` zero-import and ADR 0006-clean?** Yes — literally zero import statements; the AC-23 metafile test enforces the banned list (router/Ionic/Radix/lucide/CSS/store/fetch) over the contract, the ladder and the builder.

**Do the negative criteria hold by construction after Phase 3?** Yes. `runLadder(candidates, tolerance)` — no third parameter exists. `LadderCandidate` carries identity + `excluded`/`fits`/`lastResort`/`deviation`/`thermalRequired`/`priceCents` and nothing else: no certified flag, no geometry curve, no learned field. The shadow model flows `estimate.ts` → `decide(opts.shadow)` → `buildOutcomes` only; `compositeSelect.choose()` and `splitCandidates` never see it. AC-32/AC-49 are type-signature facts, as designed.

**`selectForComposite` with no production caller** — verdict in finding F2 below: acceptable as a transition state, but it must say so in the file.

**Migrations 0055/0056** — ADD COLUMN only (plus 0056's scoped DELETE and index), numbered 0055/0056 after 0054. The cascade audit was **performed, not asserted**: 0056 records the grep and its result in the file, and I re-ran it — `REFERENCES recommendation_outcome` appears nowhere in `migrations/` except 0056's own comment. 0055's comments name the two referencing relationships (`draft_order_line.selected_candidate_id` SET NULL, `candidate_result.selection_run_id` CASCADE) exactly as the design demanded. The static lint (no DROP/rebuild/RENAME, exact DELETE scope) is additionally a test.

**`CONTEXT.md` and ADR 0007** — both verbatim against design §1, Visitor actor included and correctly placed; ADR consequences/rejected sections unmodified.

---

## 3. Disclosed divergences — adjudication

**#1 — Unpriceable sorts last within its tier, ahead of the tier-C deviation rule.** *Developer is right; the design was internally inconsistent.* Design §4.2 put "tier C: deviation asc" at position 2 and "unpriceable sorts after every priced candidate within its tier" at position 4 — applied in sequence, an unpriceable small-deviation C candidate would lead priced ones, contradicting item 4's own words and spec §4.5's categorical "is never selected and sorts last within its tier". The implementation (ladder.ts:220–229, priceability checked before the C-deviation rule) is the spec's plain text. Selection is unaffected either way (unpriceable is never `competing`); this was a display-order defect in the design. **Sound. Design error recorded (§4 below).**

**#2 — Cross-system make-ups are no longer candidates; `splitNote` carries the refusal.** *Sound — the spec compelled it.* Hard constraint 3 (spec §4.1) and AC-8 are unambiguous: a make-up spanning two frame systems "is never offered as a candidate". The design's §6.2 note ("the mixed-systems fallback and its warning are unchanged") was written for Phase 1's post-pass and became dead the moment §7 moved splits into candidate generation — and §7 provided **no channel at all** for "a split was implied and nothing could supply it", so the design's flow would indeed have refused silently. `splitNote` (splitCandidates.ts:274 → select.ts `SelectionResult.splitNote` → estimate.ts:279) repairs that. One overstatement, though: see finding F1 — the note reaches the run summary and the staff support lever, but the automatic pipeline path does not persist it. **Sound divergence; F1 names the residual.**

**#3 — `SplitCandidate.plan: SplitUnitPlan[]` instead of `segments: ProposedSegment[]`.** *Sound.* `SplitUnitPlan` is a superset: each entry carries the `ProposedSegment` plus the per-unit opening, requirement, glazing description and `ownBand` — exactly the segment preparation the design (§7.2) said would move out of estimate.ts:396–429 into this module. Resolving it once at enumeration instead of re-deriving at materialisation is the design's own one-place-per-fact rule applied harder. `splitSegmentSpecs` consumes it for the winning make-up only.

**#4 — `proposalVerdict` lifted out of `publishAiProposal`.** *Sound, and structurally better than the design.* The design described three inline edits (§10.2); the implementation folds them into one exported, testable mapping whose truth table matches §10.2's rows exactly, plus `isSplit → reviewRequired` (design §7.4's "a split is always reviewed" made explicit) and `thermalBandNotMet` derived from tier (the WS7 energy-filter read had to move somewhere once the filter died; the verdict is the right home). `proposalSeed` is stricter than §10.2's `selected ?? parentRepresentative` shorthand — it seeds from the representative **only when a split won**, which preserves the old write-path invariant (never publish a line for a run that selected nothing); the shorthand would not have. The implementation is the correct reading; the shorthand was mine and wrong.

**#5 — `makeUpDeviation` withholds an axis when a unit has no figure.** *Developer is right; design error confirmed.* The design said "deviationOf(req, averagedCell) using the retained `compositeAveragedUw`/`compositeAveragedShgc`" — but those helpers skip units they have no figure for, so the design's wording would feed a **partial average** to the judgement: an average over two of three lites is not the composite's Uw, and a data gap would read as a thermal advantage. Spec A2's principle (no figure on a constrained axis ⇒ unknown, never asserted) governs; the implementation withholds the whole axis so the make-up lands in tier D. The helpers stay correct for their display use. **Sound. Design error recorded.**

**#6 — `checkPerformanceData` is unconditional.** *Sound.* Old `checkEnergy` reported "no published performance variant" as `incomplete` only when a thermal requirement existed; a product with zero published glass is unsellable regardless of requirement (glass is mandatory). Making the completeness fact unconditional is honest, maps to `offerability { gaps: ["performance_variant"] }` in the contract, and sends the reviewer to the catalogue record per E3's intent. A small deepening, correctly placed in rules.ts.

**#7 — Backfilled slugs shape-validated, not catalogue-resolved.** *Developer is right; design error confirmed.* Design §8.4 required `finalProductSlug` to resolve in the catalogue — but D18's corpus is pre-platform manufacturing history, and its most valuable rows are products since discontinued; a current-catalogue lookup would refuse exactly those and bias the corpus toward today's stock, the opposite of ground truth. The shape check plus the bounded residual (dark layer, permanent `backfilled` flag, a typo'd slug can never be modal against real slugs) is the correct trade. Context enumerations are still refused-not-coerced via the **same** `isRetrievalOperation`/`isRequirementBasis` the key uses — one definition, two responses, exactly the design's one-place-per-fact intent. **Sound. Design error recorded.**

The remaining disclosed `ASSUMED:` items are interface reshapings in the same spirit (decide's opts object, `enumerateSplitCandidates` returning `{ splits, note }`, split identity via `leadUnitOf`) — all consistent with AD6/AD7 and none opens a second decision path.

---

## 4. Design errors, recorded plainly (I wrote them; the next reader should not re-trip on them)

1. **§4.2's comparator sequence contradicted its own item 4 and spec §4.5.** The implemented order (tier → priceability → C-deviation → price → identity) is correct.
2. **§6.1's `makeUpDeviation` wording inherited the display helpers' skip-the-gap semantics** and would have flattered a make-up with missing data. Axis-withholding is the correct reading of spec A2.
3. **§6.2's "mixed-systems fallback unchanged" clause did not survive §7** (splits as candidates) and conflicted with AC-8; the design provided no refusal channel for "implied but unsuppliable" — `splitNote` is the repair, and F1 names what it still lacks.
4. **§8.4's "resolves in the catalogue" contradicted D18.** Shape validation with a named residual is right.
5. **§10.2's `chosen = selected ?? parentRepresentative` shorthand** would have published proposal lines for runs that selected nothing; `proposalSeed`'s guard is the correct semantics.

None of these was silently patched — every one surfaced through the developer's disclosure discipline, which is how the pipeline is supposed to work.

---

## 5. Findings (route to the developer; none blocks)

**F1 — `splitNote` does not persist on the automatic pipeline path.** The refusal reaches `runProjectEstimate`'s `reviewWarnings` and the staff support lever's JSON (`POST /api/ops/projects/:id/estimate`), and the losing line is `review_required` with `fit.fits: false` facts persisted — but `worker/lib/ai/pipeline.ts` (untouched, correctly, by this branch) drops `estimate.reviewWarnings` when it builds `AiExtractionSummary`, so on the upload→pipeline path the *prose reason* ("no single frame system supplies every unit…") is transient. Main had an equivalent transience for the coupling note, but main also left a durable `technical_review` + `review_json.composite` flag on the line, which this path no longer produces. Suggested follow-up (small): persist the note — either `flagForReview(quoteLineId, splitNote)` at estimate.ts:279, or fold `estimate.reviewWarnings` into the pipeline summary's `stageWarnings`. Until then the developer's "the warning survives to a reviewer" holds only on the support-lever path.

**F2 — `selectForComposite` / `choose()` / `fallback()` are production-dead and the file does not say so.** Every production frame arrives via `splitCandidates.ts` → `enumerateMakeUps`; only `composite-select.test.mjs` calls `selectForComposite`. Retention is defensible — 37 tests reach live compatibility/coupling/glass-unification rules through it, and `enumerateMakeUps`/`selectAll`/`sourceFor` (most of the module) are fully live — but the `fallback()` path asserts behaviour (mixed-system per-unit selection) that **can no longer ship**, and the module header still reads as if `selectForComposite` were the live entry point. A reader would reasonably conclude mixed-system composites still occur. Fix: a header note marking `selectForComposite`/`fallback` as test-harness-only with `splitCandidates.selectWithSplits` named as the production entry; migrate the tests onto `enumerateMakeUps` + `selectWithSplits` opportunistically, not now.

**F3 — `scripts/tests/thermal-selection.test.mjs` header is stale.** It still says "graded compliance (WS4)" and "live selection is the weighted ranker". The tests themselves were correctly moved onto deviation semantics; only the prose lies. One-comment fix.

(Trivial, no action needed: `learning.ts` cites "design AD8" where design §8.2 / spec A8 is meant.)

---

## 6. Sequencing

The commit history follows §13's build order: ladder + contract suites first (red→green), rules, evaluate/decide + builder + contract tests, migration 0055 + persistence + api schema assertions, consumers, composite rebuild, deletions with the AC-4 scan, docs/ADR/wiring — then Phase 2 (gate → candidates → persistence → proposal seed → materialisation), Phase 3 (key → shadow → 0056 → capture → backfill → CONTEXT), Phase 4 (matcher → injection). Phases shipped in spec order. No undocumented shortcut found.
