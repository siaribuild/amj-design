# Product recommendation model — grill conclusions

**Date:** 2026-08-20 · **Stage:** pipeline stage 0 (grill), complete pending D18
**Input to:** product-manager (spec), architect (CONTEXT.md additions)
**Supersedes as design intent:** the weighted-score model in `worker/lib/estimator/rank.ts`
and the premise in `docs/product-compatibility-design.md` §1 that "among compliant options
the commercial term decides" — that sentence is false as implemented and is the origin of
the owner's mistaken mental model.

---

## 1. Why this exists

The recommendation model was never designed. Its six weights
(`compliance 0.35 / geometry 0.20 / configuration 0.15 / commercial 0.15 / historical 0.10 /
dataCompleteness 0.05`) arrived complete in one commit (`3cb531b3`) citing "spec §8.3" — a
document that is not in this repository and never has been. No ADR covers them, no owner
decision records them, no test pins them, and the Phase 6 eval harness that was meant to
measure whether they pick the right product was never built. They have never changed.

Measured behaviour of the shipped model, verified by running `rank.ts` against the real
awning-family dimension rules:

- A **dearer** compliant product beats a cheaper compliant one on geometry alone.
- The **cheapest** product drops to third because its catalogue record says `estimated`
  rather than `certified` — a data-authoring gap worth −0.085, larger than most real price
  differences.
- A product that **misses** the thermal band beats one that meets it, on price.
- Adding a third candidate that loses either way **flips the winner** between the first two
  (min–max normalisation of the commercial term; independence-of-irrelevant-alternatives
  violation).
- `geometryScore` is a *centre-of-range* preference, not a fit test: a product rated
  400–1000 mm scores 0.90 at 700 mm and 0.57 at 900 mm.
- `SHGC_SPAN = 0.2` vs `UVALUE_SPAN = 1.5` punishes SHGC misses ~7.5× harder per unit than
  Uw misses.

Owner's verdict: structural issues, likely the result of iterative development without QA
oversight, never designed properly in the first place.

---

## 2. Actors and needs

Feeds the spec verbatim. Two existing `CONTEXT.md` actors, plus one gap for the architect.

**Customer** (existing actor — *anyone with an account, private or business*).
Uploads plans and window schedules, optionally an energy report. Needs the platform to
**pre-select products that accurately meet their requirements** — this is a core value
proposition, not a convenience. Does not and cannot evaluate aluminium platforms, frame
depths or glass make-ups; will not audit the machine's reasoning. Receives the
recommendation as *their quote*, and needs the price to still be right after human review.

**Staff** (existing actor — *an ops-console operator working for AMJ*).
Reviews every quote before it is issued; the estimator exists to **spare them work, not to
decide**. Needs: the requirement and where it came from, whether it was met and by how much
if not, why this product rather than the runner-up, and the losing candidates ranked with
reasons — so they can consult the customer and change the pick without friction. Per the
ops2 spec these needs are binding, not aspirational (AC-1 to AC-5).

**GAP for the architect — the anonymous visitor is not a Customer.**
`CONTEXT.md` defines **Customer** as "anyone with an account". A signed-out visitor who
uploads a schedule and receives an indicative estimate has no account and therefore no term
in the glossary, yet they are served by a distinct engine with distinct guarantees (D5).
`CONTEXT.md` needs either a widened **Customer** or a new **Visitor** term.

---

## 3. Settled decisions

| # | Decision |
|---|---|
| **D1** | The recommendation is **for the customer** — deterministic pre-selection from parsed requirements — with **Staff review before issue** as the backstop. Both actors are served by one engine; neither is a degraded copy of the other. |
| **D2** | The objective is **the lowest price among products that meet the customer's requirements** — never the cheapest product overall. |
| **D3** | **Hard constraints** (a candidate that fails these is not a candidate): correct operation type — no substitution, a fixed unit may never stand in for a required awning; fitting the opening, as a single unit **or** as a valid split; and split combinability (units of one composite come from one frame system). |
| **D4** | **Energy is an objective, not a hard constraint.** It is met where possible; where it cannot be met the closest is recommended and the line is flagged for ops review. Energy requirements are first-class whether they come from an **energy report** or are **computed by the platform from the plans** — both are real requirements. |
| **D5** | **Two engines, exclusive by design, and that is intended.** The deterministic matcher serves anonymous visitors (free, no AI cost, a taste of the platform with an indicative price); the AI parser/estimator/recommender takes over for signed-in users. There is no automatic re-run on sign-in and products do not silently change — verified: the AI job is scheduled only by a file upload from a signed-in user, and its delete is scoped to unedited `origin='ai'` lines. |
| **D6** | The **anonymous matcher gets exactly one change**: `pickProduct` picks the **cheapest product that fits** instead of the first entry in a hard-coded slug list. Live pricing is already anonymous, so this costs a sort. It removes the contradiction with `docs/product-compatibility-design.md` §1.1, which refuses slug-prefix inference. Nothing else about that path changes; it has no learning point because there are no anonymous orders. |
| **D7** | **Splits exist to solve dimensional limits only.** They are never a device for meeting energy requirements — a fixed lite is thermally better than an awning, so "awning + fixed" meets an awning's band more easily, and that must not be exploited to conjure artificial splits. A split enters the candidate set only when a single unit cannot serve the opening or the drawings imply one — but when it enters, it competes **in the same ranking**, not as a post-pass rework of a pick already made (which is what `materialiseSplits` does today). A split is scored as the sum/average of its units placed in the original opening. |
| **D8** | **Thermal deviation is normalised against the requirement itself** (miss ÷ target), so Uw and SHGC are commensurable and neither carries a hidden multiplier. `SHGC_SPAN`, `UVALUE_SPAN` and `FLOOR` are deleted. |
| **D9** | **Orientation-aware thermal authority** (SHGC governs on E/W, Uw elsewhere) is the intended end state but is **not hard-coded now** — it is precisely the contextual preference the learned layer exists to discover. |
| **D10** | **The selection rule, in full:**<br>1. If any candidate **meets** the requirement → the meeting candidates compete, **cheapest wins**.<br>2. If **none** meets → let `best` be the smallest achieved deviation; candidates deviating by no more than `best + 5% of the requirement value` compete, **cheapest wins**.<br>The set is never empty — the best candidate always sits inside a band measured from itself. **5%** is the single remaining tuned constant: justified because NCC compliance is a whole-of-home NatHERS star rating that absorbs per-window variance, and AFRC Total System figures are product ratings, not site measurements. It replaces ten unsourced constants (six weights, two spans, the floor, and the 0.05 dominance threshold). Ops-tunable, recorded, owned. |
| **D11** | **The learned layer ships, but dark.** It records what it would have said and shows that to ops; it does not move the recommendation until the corpus justifies switching it on. |
| **D12** | **The learning retrieval key is coarsened.** `contextKey` currently joins twelve fields, which produced **9 usable rows across 11 distinct keys** in production — every opening alone in its bucket, so the model has never returned anything but neutral and never would. All twelve keep being **recorded** (`context_json` is untouched); **retrieval** uses roughly four — operation type, requirement basis, a coarse size band, and whether a thermal requirement existed. Signal starts at ~20 issued quotes instead of ~20,000. |
| **D13** | **The learning point is quote issue, not order acceptance** — a human-reviewed quote submitted to the customer. This is already what `captureRecommendationOutcomes` does, called from `issue.ts`. The capture layer is correct; only retrieval was broken. |
| **D14** | **The estimator emits structured facts, never finished sentences.** Per candidate: met or missed, on which axis, by how much, price delta against the pick, and why excluded if it was. The ops surface composes the wording. Matches ADR 0006's admission rule — a fact about a line is core, its phrasing is the skin's judgement. |
| **D15** | **Alternatives are ops-only.** The customer sees the requirement, its provenance, and whether it was met. The ranked losing candidates belong where the consultation happens. |
| **D16** | **Sequencing: estimator first.** ops2 R3 explores UX, not content, and will consume whatever this produces. The **`candidate_result` output shape is agreed up front** so R3 is not built against component scores that are being deleted. |
| **D17** | **Accuracy measurement is out of MVP.** The north star — *"be accurate at 105%"*: the machine's estimate should equal the human-reviewed price, with **+5% inside the success margin and −5% outside it** — governs tie-break direction (of two near-equal candidates, prefer the dearer) but is **not** a buffer applied to the price, and is not measured in this release. |
| **D18** | **Cold start is real history, backfilled — and carries a provenance flag.** The current 9 rows are deleted. The corpus is seeded by running **real plans** through the platform and filling in **the products that were actually ordered**, so `final_product_slug` is genuine ground truth from manufacturing, not fabrication. The flag is still required, for a narrower reason: those decisions were made **outside the platform's review flow**, before it existed, and may lack the thermal context the retrieval key reads. A reviewer told *"3 of 4 similar openings went this way"* must be able to see which of those four were in-platform reviews and which were backfilled history. One column, one word on screen. |

### Explicitly out of scope

- Accuracy measurement / eval harness (D17).
- Per-product promotion or suppression flags (`neverAutoRecommend`) — **backlog**.
- Project-wide frame-system preference, and the future "recommended families" idea for
  visually indistinguishable lookalikes across rooms.
- Learned override of price moving a live recommendation (D11 ships it dark).
- Orientation-aware thermal authority as a hard rule (D9).

---

## 4. Constraints this redesign inherits

From the **ops2 spec** (owner-settled, region R3 "Derivation"), binding on what the engine
must emit:

- **AC-3** — staff may select a candidate the estimator ranked below its own pick,
  *including one that marginally fails a requirement*; it is selectable, it saves, it
  prices. So near-miss candidates must survive into the ranked set, not be filtered away.
- **AC-5** — estimator output is labelled a **proposal**; no copy may present it as a
  decision, a requirement or an approval.
- **AC-1 / AC-2 / AC-4** — no gate, no justification field, no disabled control and no
  focus-stealing warning when a human disagrees with the machine.
- Governing principle: *"The estimator is not authoritative. Its purpose is to spare a
  human work. A human overrides anything."*

**This is an independent argument for the redesign.** R3 requires "losing candidates ranked
with reasons". A weighted score cannot produce a reason — *"score 0.719, compliance 0.80,
geometry 0.87"* is not one. A filter-then-ladder model produces reasons natively:
*"meets the requirement, $180 dearer"*, *"misses Uw by 0.6"*, *"too wide for a single
unit"*. **R3 is unbuildable on the current model and buildable on this one.**

From **ADR 0006** (accepted 2026-08-20): line facts live in the shared core; presentation
lives in each skin. The candidate-explanation module must import no router, no Ionic, no
Radix, no CSS, no store and no fetch client.

---

## 5. Consequences the spec must carry

1. `RANK_WEIGHTS`, `geometryScore`, `dataCompletenessScore`, `configurationScore` and
   `selectWithConfidence`'s 0.05 dominance threshold are all deleted, not tuned.
2. `compositeRank.ts` reuses `RANK_WEIGHTS` verbatim by design, so it is rebuilt on the
   same ladder — otherwise one opening and the same opening split in two would disagree
   about which product is better.
3. `candidate_result.score_components_json` is replaced by a structured per-candidate
   **outcome**. This is the read path ops2 R3 consumes (§6.4), so the shape is a contract.
4. `materialiseSplits` moves from a post-selection rework into candidate generation (D7).
5. The 5% tolerance and the coarsened retrieval key are the only tuned values in the
   system, and both must be recorded with their reasoning and an owner.
6. **Migration safety — flag to the architect.** `candidate_result` is referenced by
   `draft_order_line.selected_candidate_id ... ON DELETE SET NULL`
   (`migrations/0014_estimator_platform.sql:119`), so a **table rebuild** would silently
   null every draft line's link to the candidate it was built from. Migration 0022 already
   demonstrates `ALTER TABLE ... ADD COLUMN` works on this table — the per-candidate
   outcome column (consequence 3) should be **added**, with `score_components_json` left in
   place and stopped being written. Load the `d1-migration-safety` skill before authoring
   anything in `migrations/`.
7. The backfilled cold-start corpus (D18) is also, for free, the **evaluation set** for the
   105% accuracy target — real plans with known real outcomes is exactly what D17's
   measurement will need when it comes into scope.
