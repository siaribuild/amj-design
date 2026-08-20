# Product recommendation model — ground-up redesign

**Stage:** pipeline stage 1 (product-manager spec) · **Date:** 2026-08-20
**Branch:** `feat/recommendation-model`
**Stage-0 input:** `docs/specs/recommendation-model-grill-conclusions.md` (owner grill, 2026-08-20).
Its decisions **D1–D18 are binding**; this document turns them into acceptance criteria and does
not re-open any of them. Its §2 "Actors and needs" is carried into §3 below **verbatim**.
**Decision gate:** the owner is unavailable and has authorised the pipeline to run without him.
Every point that would have been a question is decided here and tagged `ASSUMED:` so it can be
vetoed at acceptance. The "Decisions needed" list returned with this spec is **empty**.

---

## 1. Problem statement

The estimator's recommendation model was never designed. Six weights
(`compliance 0.35 / geometry 0.20 / configuration 0.15 / commercial 0.15 / historical 0.10 /
dataCompleteness 0.05`) arrived complete in one commit citing a spec section that does not exist
in this repository. No ADR covers them, no owner decision records them, no test pins them, and
the eval harness meant to measure them was never built.

Running the shipped ranker against the real awning-family dimension rules produces, measurably:

- a **dearer** compliant product beating a cheaper compliant one, on geometry alone;
- the **cheapest** product dropping to third because its catalogue record says `estimated`
  rather than `certified` — a data-authoring gap worth −0.085, larger than most real price
  differences;
- a product that **misses** the thermal band beating one that meets it, on price;
- adding a third candidate that loses either way **flipping the winner** between the first two
  (min–max normalisation of the commercial term — an independence-of-irrelevant-alternatives
  violation);
- `geometryScore` behaving as a *centre-of-range preference* rather than a fit test (a product
  rated 400–1000 mm scores 0.90 at 700 mm and 0.57 at 900 mm);
- `SHGC_SPAN = 0.2` against `UVALUE_SPAN = 1.5`, punishing SHGC misses ~7.5× harder per unit
  than Uw misses.

Two consequences follow, and they are the whole reason this work exists:

1. **The customer is quoted the wrong product.** D2 states the objective plainly — the lowest
   price among products that meet the customer's requirements. The shipped model implements
   neither half of that sentence reliably.
2. **The ops console cannot be built on it.** The ops2 spec's region R3 ("Derivation") requires
   *losing candidates ranked with reasons*. A weighted score cannot produce a reason:
   *"score 0.719, compliance 0.80, geometry 0.87"* is not one. A filter-then-ladder model
   produces reasons natively — *"meets the requirement, $180 dearer"*, *"misses Uw by 0.6"*,
   *"too wide for a single unit"*. **R3 is unbuildable on the current model and buildable on
   this one.**

This is a replacement, not a tuning exercise. The weights, the two thermal spans, the compliance
floor and the 0.05 dominance threshold — ten unsourced constants — are **deleted**. One tuned
constant survives the redesign, and it is new: the 5% requirement tolerance (D10).

---

## 2. Scope

### In scope

- Replacing the weighted ranker with the two-branch filter-then-ladder selection rule (D10).
- Hard constraints as genuine eliminators; energy as an objective (D3, D4).
- Requirement-relative thermal deviation, replacing the span constants (D8).
- Splits generated as dimensional-only candidates that compete in the same ranking (D7).
- Rebuilding the composite ranker on the same comparator, so a composite and a single unit can
  never disagree about which product is better (grill consequence 2).
- A structured per-candidate **outcome** replacing `score_components_json` — the read contract
  ops2 R3 consumes (D14, D16).
- A coarsened learning **retrieval** key; the recorded context is untouched (D12).
- The learned layer shipping **dark** — recorded and shown to ops, never moving the pick (D11).
- The seeded-corpus **provenance flag** and the reset of the existing 9 rows (D18).
- Exactly one change to the anonymous matcher: `pickProduct` picks the cheapest product that
  fits (D6).
- The consumer changes forced by deleting `selectWithConfidence`'s `dominant` flag
  (`worker/lib/ai/proposal.ts`, `worker/lib/estimator/persist.ts`).

### Out of scope — the tester must not fail this work for their absence

Carried from the grill's own out-of-scope list plus the owner's scope boundaries:

- **No UI work of any kind.** The estimator emits structured facts; the ops2 R3 "Derivation"
  surface renders them and is a separate effort on branch `design/ops2-planning`. No screens,
  no copy, no wording. This spec stops at the data contract.
- **Accuracy measurement / eval harness** (D17). The 105% north star governs direction only;
  nothing measures it in this release.
- **Per-product promotion or suppression flags** (`neverAutoRecommend`) — backlog.
- **Project-wide frame-system preference**, and the "recommended families" idea for visually
  indistinguishable lookalikes across rooms.
- **Learned override of price moving a live recommendation** (D11 ships it dark).
- **Orientation-aware thermal authority as a hard rule** (D9) — SHGC governing on E/W and Uw
  elsewhere is the intended end state and is precisely what the learned layer exists to
  discover. It is not hard-coded now.
- **An ops settings screen for the 5% tolerance.** "Ops-tunable" in this release means one named
  constant in one module, stamped on every run so a past run is reproducible — not a UI.
- **The data-entry work of seeding the corpus** (choosing which real plans, keying in which
  products actually got manufactured). This release ships the provenance column, the capture
  path that sets it, the retrieval that reads it and a documented ingest route; filling it is
  owner/ops activity. `ASSUMED:` — see §9.
- Unrelated code. This is an estimator-internal redesign plus one small change to the anonymous
  matcher.

---

## 3. Actors and needs

Carried **verbatim** from grill §2. Two existing `CONTEXT.md` actors, plus one gap for the
architect.

> **Customer** (existing actor — *anyone with an account, private or business*).
> Uploads plans and window schedules, optionally an energy report. Needs the platform to
> **pre-select products that accurately meet their requirements** — this is a core value
> proposition, not a convenience. Does not and cannot evaluate aluminium platforms, frame
> depths or glass make-ups; will not audit the machine's reasoning. Receives the
> recommendation as *their quote*, and needs the price to still be right after human review.
>
> **Staff** (existing actor — *an ops-console operator working for AMJ*).
> Reviews every quote before it is issued; the estimator exists to **spare them work, not to
> decide**. Needs: the requirement and where it came from, whether it was met and by how much
> if not, why this product rather than the runner-up, and the losing candidates ranked with
> reasons — so they can consult the customer and change the pick without friction. Per the
> ops2 spec these needs are binding, not aspirational (AC-1 to AC-5).
>
> **GAP for the architect — the anonymous visitor is not a Customer.**
> `CONTEXT.md` defines **Customer** as "anyone with an account". A signed-out visitor who
> uploads a schedule and receives an indicative estimate has no account and therefore no term
> in the glossary, yet they are served by a distinct engine with distinct guarantees (D5).
> `CONTEXT.md` needs either a widened **Customer** or a new **Visitor** term.

**PM note on the gap.** D6 changes behaviour on the anonymous path, so this spec has criteria
about an actor the glossary does not name. The architect owns `CONTEXT.md`; the recommendation
is a **new `Visitor` term** rather than widening `Customer`, because the two are served by
different engines with different guarantees (D5) and collapsing them would make "the Customer
gets the AI estimator" false. `ASSUMED:` — the architect may choose the widening instead; either
resolves the gap, and no acceptance criterion here depends on which.

---

## 4. The model, stated once

Everything in §5 is an acceptance criterion against this description. It is written out in full
here so no criterion has to restate it.

### 4.1 Hard constraints (D3) — a candidate that fails these is not a candidate

1. **Operation type.** No substitution, ever. A fixed unit may never stand in for a required
   awning.
2. **Fit.** The candidate serves the opening as a single unit **or** as a valid split.
3. **Split combinability.** Every unit of one composite comes from one frame system.
4. **The schedule's glazing instruction.** A stated "double glazed" / "single glazed" / "Low-E"
   instruction is a customer instruction, not a performance objective; satisfying it with the
   opposite glass is a substitution and is refused on the same principle as (1).
   `ASSUMED:` — D3's list does not name it, but `checkScheduleConfiguration` already rejects on
   it today and nothing in the grill asked for that to soften. Naming it here so its survival
   is a decision rather than an oversight.

Plus the eliminations that already exist and are unchanged: unpublished, `disabled`, and
withheld-as-not-offerable (the two completeness bars, `NULL` ≠ `[]`).

### 4.2 The objective (D2, D4)

**The lowest price among products that meet the customer's requirements — never the cheapest
product overall.** Energy is an *objective*, not a hard constraint: met where possible, and
where it cannot be met the closest is recommended and the line is flagged for ops review. An
energy requirement is first-class whether it came from an energy report or was computed by the
platform from the plans.

### 4.3 Requirement-relative deviation (D8)

`FLOOR`, `SHGC_SPAN` and `UVALUE_SPAN` are deleted. A candidate's deviation on each constrained
axis is the miss divided by the requirement value on that axis:

| axis | requirement | candidate | deviation |
|---|---|---|---|
| Uw cap | `maxUValue` | `uValue` | `max(0, (uValue − maxUValue) / maxUValue)` |
| SHGC floor | `minShgc` | `shgc` | `max(0, (minShgc − shgc) / minShgc)` |
| SHGC cap | `maxShgc` | `shgc` | `max(0, (shgc − maxShgc) / maxShgc)` |

A candidate's **scalar deviation** is the **maximum** across its constrained axes.
`ASSUMED:` — maximum, not sum. The requirement is a conjunction; the degree to which a candidate
fails a conjunction is the worst of its failures, and summing would penalise one failure twice
and make the tolerance band uninterpretable. Recommended for exactly the reason D8 gives: the
axes must be commensurable and neither may carry a hidden multiplier.

Because deviation is already normalised against the requirement, D10's "5% of the requirement
value" is the single dimensionless number **`REQUIREMENT_TOLERANCE = 0.05`**.

An axis the candidate has **no figure for** (null `uValue` against a stated `maxUValue`) yields
**unknown**, not zero and not a number. Unknown is not a deviation and cannot be compared with
one. `ASSUMED:` — a product with no thermal data cannot be *asserted* to meet a requirement, and
the Customer's stated need is products that **accurately** meet their requirements. Unknown
therefore ranks below every measurable deviation, however large. It is still a selectable,
priceable, persisted candidate (ops2 AC-3).

### 4.4 The tiers and the competing set (D10)

Every candidate that survives §4.1 lands in exactly one tier:

| tier | meaning |
|---|---|
| **A `meets`** | Fits, and deviation is 0 — or there is no thermal requirement at all |
| **B `within_tolerance`** | Fits; `0 < deviation ≤ best + 0.05`, where `best` is the smallest deviation achieved by any fitting candidate |
| **C `misses`** | Fits; `deviation > best + 0.05` |
| **D `thermal_unknown`** | Fits; a thermal requirement is stated and the candidate has no figure on a constrained axis |
| **E `does_not_fit`** | The last-resort best-fit unit — see §4.6 |
| **X `excluded`** | Failed a hard constraint (§4.1). Persisted with its reason. Never machine-selected, `rank: null` |

The **competing set** is the highest non-empty tier among A, B, C, D, E. Within it, **cheapest
wins**. That is D10 exactly: if any candidate meets, the meeting candidates compete and cheapest
wins; if none meets, the band measured from `best` competes and cheapest wins. **The set is
never empty** — the best candidate always sits inside a band measured from itself, and each
lower tier is only reached when every tier above it is empty.

Candidates outside the competing set are **not discarded**. They are ranked, priced, persisted
and selectable by a human (ops2 AC-3).

### 4.5 Ordering, ties and price

The full order is: tier ascending (A before B before C before D before E before X), then within
a tier:

- **A, B, E**: price ascending.
- **C**: deviation ascending, then price ascending.
- **D, X**: price ascending.
- **Every tier, final tiebreak**: product slug ascending, then variant id ascending — so the
  order is total and deterministic for any input.

Rules that make "cheapest" honest:

- The compared quantity is `PriceSnapshot.total`, on the same basis for every candidate in a run.
- Comparison is on **integer cents**, so float noise cannot flap an order.
- A candidate whose price is missing, not `ok`, or **≤ 0** is **unpriceable**: it is never
  selected, and it sorts last **among the candidates the requirement cannot separate**. A
  rate-card gap that computes a $0 total must never become "the cheapest product".
  `ASSUMED:` — this guard is not in the grill; it is the obvious way a cheapest-wins rule gets
  exploited by a data gap, and the fail-closed price posture already exists elsewhere in the
  Worker.
  **Owner ruling at acceptance (A18), reversing AD18:** within tier C, deviation is compared
  **before** priceability, so an unpriceable candidate that is the closest thermal match sorts
  *above* a priced worse one. The reviewer's losing-candidate list should lead with "this is the
  best thermal answer and we cannot price it at this size", which is more useful first than
  last. This changes what is *shown*, never what is *chosen*: selection reads the `competing`
  flag, which is only ever set on a priceable member of the competing tier, and between two
  priceable candidates the priceability step is a no-op — so the order of the candidates that
  can actually win is untouched.
- **`certified` vs `estimated` never enters the ordering at any position, including tiebreaks.**
  It still determines the *line status* (`commercial_only_estimate` vs `ready`), which is
  existing behaviour and is retained.

**On D17's tie-break direction.** D17 says the 105% north star governs tie-break direction —
of two near-equal candidates, prefer the dearer — but is not a buffer on the price and is not
measured in this release. `ASSUMED:` — this is **not** implemented as a price-proximity band,
because a band would be a second tuned constant and D10 states the 5% tolerance is the only one.
What it *is* implemented as: an unpriceable candidate never beats a priced one, and no downward
buffer of any kind is applied anywhere. The direction is honoured; a new magic number is not
introduced. Vetoable at acceptance if the owner wants an explicit price band.

### 4.6 Fit, and the last-resort candidate

D3 makes fit hard. Today `checkDimensions` returns `warning`, so an oversize opening still gets
an indicative price from a best-fit product. Making fit hard without a floor would silently
regress that: a very large opening would go from "indicative price, confirm at review" to "we
sell nothing that shape".

`ASSUMED:` — when **no** candidate fits as a single unit and **no** valid split can be composed
within the composite policy's segment cap, the engine retains **one** last-resort candidate:
the largest-capacity product of the correct operation type, priced at the **real opening
dimensions**, placed in tier E, line status `commercial_only_estimate`, and marked in its
outcome as not fitting with the breached limits named. Reasoning: the platform's existing
customer-facing promise on an oversize opening is an indicative number plus a warning (both
engines agree on this today — `checkDimensions`'s warning and `pickProduct`'s `fits:false`
branch), and D3's purpose is preserved because the candidate is labelled as not fitting rather
than pretending to. A fitting candidate always beats a non-fitting one, because tier E is below
every other tier.

### 4.7 Splits (D7)

Splits exist to solve **dimensional limits only**. They are never a device for meeting energy
requirements — a fixed lite is thermally better than an awning, so "awning + fixed" meets an
awning's band more easily, and that must not be exploited to conjure artificial splits.

A split candidate is **generated during candidate generation**, not as a post-pass rework of a
pick already made, when and only when:

- **(a)** no single unit fits the opening dimensionally, **or**
- **(b)** the drawings or schedule imply one — a split hint from the parse (a comment matching
  the existing multi-unit vocabulary, an "OFFSET AWNING" type, or an energy report carrying
  per-unit components).

A split candidate is scored as its units placed in the original opening:

- **price** = the sum of its units' totals;
- **deviation** = the deviation of the area-weighted averaged cell against the opening's band —
  or, where the energy report stated per-unit bands, the area-weighted mean of each unit's own
  deviation against its own band. (The existing `compositeAveragedUw` / `compositeAveragedShgc`
  helpers already compute the averaged cell and are retained.)

It then enters **the same tiers and the same comparator** as every single-unit candidate.

### 4.8 The learned layer, dark (D11, D12, D13)

**Capture is already correct** (D13): outcomes are recorded at quote issue — a human-reviewed
quote submitted to the customer — by `captureRecommendationOutcomes`, called from `issue.ts`.
Nothing about the capture point changes.

**Recording is unchanged** (D12): all twelve context fields keep being written to `context_json`.

**Retrieval is coarsened.** The twelve-field `contextKey` produced 9 usable rows across 11
distinct keys in production — every opening alone in its bucket, so the model has never returned
anything but the neutral 0.5 and never would. Retrieval uses four fields:

```
retrievalKey = operationType | orientation | sizeBand | thermalRequired
```

`ASSUMED:` (the owner asked to be guided on machine learning — this is the guidance, with the
reasoning):

- **`operationType`** — normalised, `any` when unknown. `family` is deliberately dropped: it is
  a function of the operation (`operationForFamily`), so keeping both spends cardinality on no
  extra information.
- **`orientation`** — one of the eight compass points `N NE E SE S SW W NW`, else `unknown`.
  **Owner ruling at acceptance, replacing `requirementBasis`.** Orientation is what decides
  whether Uw or SHGC dominates, and that competition is the specific contextual preference the
  learned layer exists to discover (D9). Requirement basis is *provenance*, not physics: two
  west-facing awnings behave the same whether their band arrived on an energy report or was
  derived from the plans. The swap is close to density-neutral, because orientation comes from
  the energy report (precedence 100) or the architectural schedule (precedence 80) and so
  correlates with basis anyway — it partly encodes what basis was distinguishing, and adds the
  physics on top. Recorded in `context_json` already, so the key stayed recomputable.
- **`sizeBand`** — by **width**: `s` (<1800 mm), `m` (1800–3000 mm), `l` (>3000 mm), `unknown`.
  Width, not area, because width is what the frame series' max-width limits actually turn on,
  and it is the axis that decides whether a split is in play at all. Three bands rather than
  the current sixteen width×height combinations.
- **`thermalRequired`** — `1` | `0`.

- **The key is stored, versioned and recomputable.** A new `retrieval_key` column is written at
  capture alongside `retrieval_key_version`; `context_json` keeps all twelve fields, so a later
  redefinition of the coarsening is a recompute over stored rows rather than lost history. This
  is standard feature-store discipline and it is what makes "record twelve, retrieve four" safe.
- **Density floor: a bucket returns a signal only at ≥ 5 observations** (raised from the current
  `< 2`). Laplace smoothing on n=2 swings between 0.25 and 0.5 on a single row; at n≥5 the
  estimate is stable. Because the layer ships dark, the floor only affects what ops is shown.

**Dark means dark** (D11). Per candidate the engine records what the learned layer *would* have
said — the retrieval key, the bucket size, the support for this product, whether this candidate
is the one the layer would have promoted, and the in-platform/backfilled split of the evidence —
with `applied: false`. Nothing about the pick changes. Turning it on is a later release.

### 4.9 Provenance (D18)

The existing 9 `recommendation_outcome` rows are deleted. The corpus is seeded by running real
plans through the platform and filling in the products that were actually ordered, so
`final_product_slug` is genuine ground truth from manufacturing.

The flag exists for a narrower reason than fabrication: those decisions were made **outside the
platform's review flow**, before it existed, and may lack the thermal context the retrieval key
reads. A reviewer told *"3 of 4 similar openings went this way"* must be able to see which of
those four were in-platform reviews and which were backfilled history. One column
(`provenance`: `in_platform` | `backfilled`), one word on screen — and the split is carried on
the candidate outcome so the ops surface can render it.

### 4.10 What is emitted (D14) — the contract

**The estimator emits structured facts, never finished sentences.** The ops surface composes the
wording. This shape is the contract ops2 R3 reads (D16); it is agreed here so R3 is not built
against component scores that are being deleted.

Per candidate:

```ts
export interface CandidateOutcome {
  // identity
  productSlug: string;
  sanityProductId: string;
  variantId: string | null;
  catalogueRevision: string;
  form: "single" | "split";
  units?: {                       // present when form === 'split'
    productSlug: string; variantId: string | null;
    widthMm: number; heightMm: number; operationType: string | null;
  }[];

  // verdict
  tier: "meets" | "within_tolerance" | "misses" | "thermal_unknown"
      | "does_not_fit" | "excluded";
  rank: number | null;            // null iff tier === 'excluded'
  selected: boolean;
  competing: boolean;             // was in the set that competed on price

  // why it is not a candidate (tier 'excluded' only; [] otherwise)
  exclusions: {
    constraint: "operation" | "dimensions" | "split_combinability"
              | "glazing_instruction" | "offerability" | "disabled" | "publication";
    detail: Record<string, unknown>;   // facts only: the required op, the breached limit, …
  }[];

  // the requirement this candidate was judged against
  requirement: {
    maxUValue: number | null; minShgc: number | null; maxShgc: number | null;
    basis: "explicit_energy_report" | "plan_derived" | "default_envelope"
         | "human_override" | null;
    absent: boolean;              // true when there is no thermal requirement at all
  };

  // how it did
  thermal: {
    uValue: number | null; shgc: number | null;
    deviation: { uValue: number | null; minShgc: number | null; maxShgc: number | null };
    worstAxis: "uValue" | "minShgc" | "maxShgc" | null;
    normalisedDeviation: number | null;   // the scalar the ladder compares; null = unknown
    absoluteMiss: number | null;          // the miss in the requirement's own unit, for display
    dataSource: "certified" | "estimated" | null;
  };

  // dimensional fit
  fit: {
    fits: boolean;
    widthMm: number | null; heightMm: number | null;
    limit: {
      minWidthMm: number | null; maxWidthMm: number | null;
      minHeightMm: number | null; maxHeightMm: number | null;
      maxAreaM2: number | null; maxAspectRatio: number | null;
    } | null;
    breached: ("width" | "height" | "area" | "aspect")[];
  };

  // commercial — EX-GST, always
  price: {
    total: number | null;         // ex-GST; null when unpriceable
    currency: "AUD";
    ok: boolean;
    /** SIGN CONVENTION, fixed here so nobody guesses:
     *  deltaToSelected = this candidate's total MINUS the selected candidate's total.
     *  Negative ⇒ this candidate is CHEAPER than the pick.
     *  Positive ⇒ dearer.  0 on the pick itself.  null when either side is unpriced. */
    deltaToSelected: number | null;
  };

  // the learned layer, dark (D11) — null until the learned phase ships
  learned: {
    retrievalKey: string;
    retrievalKeyVersion: string;
    observations: number;         // rows in this bucket
    support: number;              // rows in this bucket naming THIS product
    wouldPrefer: boolean;         // the layer would have promoted this candidate
    applied: false;               // never true in this release
    provenance: { inPlatform: number; backfilled: number };   // D18
  } | null;
}
```

And once per run:

```ts
export interface SelectionOutcome {
  version: string;                        // e.g. 'ladder-v1'
  openingRef: string | null;
  requirement: CandidateOutcome["requirement"];
  tolerance: number;                      // 0.05, stamped so a past run is reproducible
  competingTier: CandidateOutcome["tier"] | null;
  selectedProductSlug: string | null;
  status: OutcomeStatus | "no_candidate";
  withheldIncomplete: { slug: string; gaps: string[] }[];
}
```

**Placement (ADR 0006).** The type and the fact-builder live in a shared core that imports no
router, no Ionic, no Radix, no CSS, no store and no fetch client. A fact about a line is core;
its phrasing is the skin's judgement. The exact module path is the architect's call; the
constraint is not.

**Persistence.** `candidate_result.outcome_json` and `selection_run.selection_json`, both added
by `ALTER TABLE ... ADD COLUMN`. `score_components_json` is **left in place and stopped being
written**; `candidate_result.score` is written NULL. A **table rebuild is forbidden** —
`draft_order_line.selected_candidate_id REFERENCES candidate_result(id) ON DELETE SET NULL`
(`migrations/0014_estimator_platform.sql:119`) means a rebuild would silently null every draft
line's link to the candidate it was built from. Migration 0022 already proves ADD COLUMN works
on these tables. The `d1-migration-safety` skill is loaded before anything in `migrations/` is
authored, and production data is exported first. (Highest existing migration at the time of
writing: `0054_trade_verification.sql`; migrations are append-only and numbered at authoring.)

### 4.11 The consumers that must move

`selectWithConfidence` and its 0.05 dominance threshold are deleted, which removes
`SelectionResult.dominant`. Two call sites read it:

- `worker/lib/ai/proposal.ts:244` (`confidence_band`) and `:323` (`review_required`).
- `worker/lib/estimator/persist.ts:86` (`warnings_json`) and `:87` (`confidence`).

`ASSUMED:` — `dominant` is replaced by the run's `competingTier` plus a derived
`requirementMet: boolean`, which is strictly more informative than a score gap:

| consumer | new rule |
|---|---|
| `confidence_band` | `high` when tier `meets` **and** status `ready`; `low` when tier ∈ {`misses`, `thermal_unknown`, `does_not_fit`} or status `unavailable`; `medium` otherwise |
| `review_required` | true when the pick did not meet the requirement, or did not fit — **plus** every existing reason (schedule commercial option, document review reasons, status ≠ `ready`) unchanged |
| `warnings_json` | tier-derived: `requirement_not_met`, `requirement_missed_beyond_tolerance`, `no_thermal_data`, `does_not_fit`. Replaces `close_alternatives` |
| `draft_order_line.confidence` | written NULL — there is no score |

Everything else about the AI path is untouched: the job is still scheduled only by a file upload
from a signed-in user (`worker/routes/files.ts:235`), and its delete is still scoped to unedited
`origin='ai'` lines (`worker/lib/ai/proposal.ts:413`). D5's two-engine exclusivity is preserved:
no automatic re-run on sign-in, and products do not silently change.

### 4.12 The anonymous matcher (D6)

`pickProduct` (`src/data/scheduleMatch.ts:102`) picks the **cheapest product that fits** instead
of the first entry in `WINDOW_SERIES_BIAS` / `DOOR_SERIES_BIAS`. This removes the contradiction
with `docs/product-compatibility-design.md` §1.1, which refuses slug-prefix inference. Nothing
else on that path changes; it has no learning point because there are no anonymous orders.

`ASSUMED:` — an implementation detail the grill could not have known: `matchSchedule` is a pure,
synchronous module in `src/data/` with no access to a pricing engine (`priceConfigured` was
removed; server D1 `computePrice` is now the single engine, per the house rule). So D6 is
delivered as an **optional injected price lookup**: `matchSchedule`/`pickProduct` accept
`priceOf(product, widthMm, heightMm) => number | null`; the worker path
(`worker/lib/parse.ts:188`) supplies it, backed by the same D1 engine everything else uses.
When no pricer is injected (the client-side sample-schedule render in `src/app/App.tsx:618`,
and existing tests) the current series-bias order remains as the deterministic fallback. This is
the only way to honour both "cheapest that fits" and "pricing has one home".

Unchanged: fit is still the filter; the nothing-fits branch still returns the largest-capacity
unit with `fits: false`; the no-dimensions branch still returns bias order.

---

## 5. Acceptance criteria

Every criterion is independently verifiable and maps onto a test the developer writes and the
tester walks. `D#` is the grill decision it traces to.

### 5.1 The selection rule (D10, D2)

**AC-1 (D10, D2) — cheapest among those that meet.**
**Given** an opening with a thermal requirement and three fitting candidates, two of which meet
it (at $900 and $1,100 ex-GST) and one of which does not,
**When** the opening is selected,
**Then** the $900 candidate is selected, `competingTier` is `meets`, both meeting candidates
have `competing: true` and the missing candidate has `competing: false`.

**AC-2 (D10) — the tolerance band when none meets.**
**Given** an opening with `maxUValue = 4.0` and three fitting candidates with `uValue` 4.2
($1,400), 4.4 ($900) and 4.6 ($600),
**When** the opening is selected,
**Then** `best = 0.05`, the band is `≤ 0.10`, the 4.2 and 4.4 candidates compete, the 4.6
candidate (deviation 0.15) does not, and the **$900 / 4.4** candidate is selected.

**AC-3 (D10) — the set is never empty.**
**Given** any opening for which at least one candidate survives the hard constraints,
**When** the competing set is computed,
**Then** it contains at least one candidate and `selected` is non-null — including the case
where every candidate misses the requirement, because the best candidate always sits inside a
band measured from itself.

**AC-4 (D10) — the tolerance is one recorded constant.**
**Given** any completed selection run,
**When** its persisted `selection_json` is read,
**Then** `tolerance` is present and equals `0.05`, and no other tuned constant appears anywhere
in the ladder. `RANK_WEIGHTS`, `geometryScore`, `configurationScore`, `dataCompletenessScore`,
`FLOOR`, `SHGC_SPAN`, `UVALUE_SPAN` and the 0.05 dominance threshold do not exist in the
codebase.

**AC-5 (D10) — the order is total and deterministic.**
**Given** any candidate list, including one containing candidates identical on tier, price and
deviation,
**When** it is ranked twice, in two different input orders,
**Then** the two rank orders are identical, resolved by product slug then variant id.

**AC-6 (D2) — no thermal requirement means cheapest that fits.**
**Given** an opening with no thermal requirement and no advisory requirement, and four fitting
candidates,
**When** it is selected,
**Then** every candidate is tier `meets` and the cheapest is selected.

### 5.2 Hard vs soft constraints (D3, D4)

**AC-7 (D3) — no operation substitution.**
**Given** an opening requiring an awning and a catalogue offering only fixed products,
**When** it is selected,
**Then** nothing is selected, every fixed product is persisted with `tier: 'excluded'` and
`exclusions[0].constraint === 'operation'`, and the run status is `no_candidate`. A fixed unit
is never proposed for a required awning under any pricing.

**AC-8 (D3) — split combinability is hard.**
**Given** a split candidate whose two units come from different frame systems,
**When** candidates are generated,
**Then** that make-up is never offered as a candidate; a make-up drawn from one frame system is.

**AC-9 (D4) — energy is an objective, not an eliminator.**
**Given** an opening with a thermal requirement no product in the catalogue can meet,
**When** it is selected,
**Then** a candidate is still selected, its tier is `within_tolerance` or `misses`, the line
status is `commercial_only_estimate`, and `review_required` is true on the proposal line.

**AC-10 (D4) — a computed requirement is as real as a reported one.**
**Given** two identical openings, one whose requirement came from an energy report
(`basis: 'explicit_energy_report'`) and one computed from the plans (`basis: 'plan_derived'`),
**When** both are selected against the same candidates,
**Then** the tiering, the competing set and the selection are identical; only `requirement.basis`
differs in the emitted outcome.

**AC-11 (D3) — the glazing instruction is hard.**
**Given** a schedule stating "double glazed" and a candidate with only single-glazed published
variants,
**When** it is selected,
**Then** that candidate is `tier: 'excluded'` with
`exclusions[0].constraint === 'glazing_instruction'` and is never selected.

**AC-12 (D3) — a near-miss survives into the ranked set.**
**Given** a candidate that misses the requirement beyond the tolerance band,
**When** the run is persisted,
**Then** it has a non-null `rank`, an `ok` price, `competing: false`, and a `candidate_result`
row — it is selectable, saveable and priceable by a human (ops2 AC-3). It is never filtered out
of existence.

This is about a THERMAL near-miss, and only that. A candidate that cannot physically be built —
failing on FIT rather than on the requirement — is a hard-constraint failure (§4.1) and is
excluded, because offering a reviewer something unbuildable is not a choice. See A20 for split
make-ups specifically.

### 5.3 Requirement-relative thermal normalisation (D8)

**AC-13 (D8) — deviation is miss ÷ requirement.**
**Given** `maxUValue = 4.0` and a candidate with `uValue = 4.4`,
**When** its outcome is emitted,
**Then** `thermal.normalisedDeviation === 0.10`, `thermal.absoluteMiss === 0.4`,
`thermal.worstAxis === 'uValue'`.

**AC-14 (D8) — Uw and SHGC are commensurable.**
**Given** `maxUValue = 4.0` and `minShgc = 0.30`, candidate A with `uValue 4.4 / shgc 0.30` and
candidate B with `uValue 4.0 / shgc 0.27`, identically priced and both fitting,
**When** they are ranked,
**Then** both report `normalisedDeviation === 0.10`, both land in the same tier, and neither is
preferred on thermal grounds — the order is resolved by the slug tiebreak alone.

**AC-15 (D8) — the worst axis decides.**
**Given** a candidate missing `maxUValue` by 4% and `minShgc` by 12%,
**When** its outcome is emitted,
**Then** `normalisedDeviation === 0.12` and `worstAxis === 'minShgc'`; the per-axis deviations
are both present in `thermal.deviation`.

**AC-16 (D8) — an incoherent band cannot zero every product.**
**Given** an explicit requirement and an advisory requirement whose intersection is impossible
(`minShgc > maxShgc`),
**When** the requirement is resolved,
**Then** the existing coherence guard applies, deviation is computed against the coerced band,
and — where coercion yields no band at all — the opening is treated as having no thermal
requirement (tier `meets` for every fitting candidate) rather than eliminating every product.

### 5.4 Splits as dimensional-only candidates (D7)

**AC-17 (D7) — splits enter candidate generation, not a post-pass.**
**Given** an opening 3,600 mm wide where no single product fits,
**When** it is selected,
**Then** the ranked candidate set contains split candidates alongside single-unit candidates,
they were tiered and compared by the same comparator, and no post-selection rework replaced an
already-made pick. A make-up that can be BUILT is ranked; one that cannot is persisted as
excluded with its reason (A20), so the list distinguishes "a split was considered and rejected
on fit" from "no split was tried".

**AC-18 (D7) — a split is never conjured to meet a thermal band.**
**Given** an opening that a single unit fits dimensionally, and a thermal requirement that no
single unit meets but that an "awning + fixed" split would meet,
**When** candidates are generated,
**Then** the candidate set contains **no** split candidate, and the selection is a single unit
in tier `within_tolerance` or `misses`.

**AC-19 (D7) — a split enters on a drawing instruction.**
**Given** an opening that a single unit fits, whose schedule comment implies a multi-unit
configuration (the existing hint vocabulary, or type "OFFSET AWNING"),
**When** candidates are generated,
**Then** a split candidate is present and, provided its units can actually be built at their
proposed sizes, competes in the same ranking as the single unit. A make-up that misses on fit is
excluded rather than ranked below the single (A20) — it is still persisted with its reason.

**AC-20 (D7) — a split is scored as its units in the original opening.**
**Given** a two-unit split whose units price at $700 and $500 in an opening whose band is
`maxUValue 4.0`, with unit `uValue`s 3.6 and 4.4 over areas 1.0 m² and 1.0 m²,
**When** its outcome is emitted,
**Then** `price.total === 1200`, and `normalisedDeviation` is computed from the area-weighted
averaged cell (Uw 4.0 ⇒ deviation 0), not from either unit alone.

### 5.5 The per-candidate outcome contract (D14, D16)

**AC-21 (D14) — facts, never sentences.**
**Given** any completed selection run,
**When** `candidate_result.outcome_json` is read for any candidate,
**Then** it conforms to `CandidateOutcome` in §4.10 and contains **no human-readable sentence**
— no `message`, no `reason` prose, no assembled copy. Every field is an identifier, an enum, a
number or a boolean.

**AC-22 (D14) — every candidate carries its verdict.**
**Given** a run with a selected candidate, two ranked losers and one hard-fail exclusion,
**When** the candidate rows are read,
**Then** all four are present; the selected one has `selected: true`, `rank: 1`,
`price.deltaToSelected === 0`; the losers have ascending ranks and a non-zero
`deltaToSelected` carrying the §4.10 sign convention; the excluded one has `rank: null` and a
populated `exclusions[]`.

**AC-23 (D14) — the shared core imports nothing presentational.**
**Given** the module that defines `CandidateOutcome` and builds it,
**When** its import graph is inspected,
**Then** it imports no router, no Ionic, no Radix, no CSS, no store and no fetch client
(ADR 0006).

**AC-24 (D16, migration safety) — the column is added, never rebuilt.**
**Given** the migration that introduces `outcome_json`,
**When** it is applied,
**Then** it is `ALTER TABLE ... ADD COLUMN` only; `candidate_result` is not dropped or
recreated; `score_components_json` still exists; and every pre-existing
`draft_order_line.selected_candidate_id` still points at the same `candidate_result` row it
pointed at before.

**AC-25 (D14) — the deleted score is not silently reconstructed.**
**Given** any candidate written after this change,
**When** its row is read,
**Then** `score` is NULL and `score_components_json` is NULL — the old shape is stopped, not
shimmed.

**AC-26 (consequence 1) — `dominant` is gone and its consumers moved.**
**Given** a pick that meets the requirement with status `ready`,
**When** the proposal line is written,
**Then** `confidence_band` is `high` and `review_required` is false (absent other reasons); and
**Given** a pick in tier `within_tolerance`, **Then** `confidence_band` is `medium` and
`review_required` is true.

### 5.6 The learned layer (D11, D12, D13, D18)

**AC-27 (D12) — recording keeps all twelve fields.**
**Given** an issued quote line,
**When** its `recommendation_outcome` row is read,
**Then** `context_json` still contains all twelve context fields, unchanged from today.

**AC-28 (D12) — retrieval uses four.**
**Given** two openings differing only in `climateZone` (or orientation, jurisdiction, building
class, envelope class, glazing ratio, family, or height band),
**When** their retrieval keys are computed,
**Then** the keys are **equal** — they land in the same bucket.

**AC-29 (D12) — retrieval separates the four that matter.**
**Given** two openings differing in operation type, or in requirement basis, or in width band,
or in whether a thermal requirement existed,
**When** their retrieval keys are computed,
**Then** the keys **differ**.

**AC-30 (D12) — the key is versioned and recomputable.**
**Given** a captured outcome row,
**When** it is read,
**Then** `retrieval_key` and `retrieval_key_version` are both populated, and the key is
reproducible from `context_json` alone by the builder of that version.

**AC-31 (D12) — the density floor.**
**Given** a retrieval bucket holding four observations,
**When** the learned layer is consulted,
**Then** it reports no preference (`wouldPrefer: false` for every candidate) and
`observations: 4`; **Given** a bucket holding five or more, **Then** it reports a preference.

**AC-32 (D11) — dark: the learned layer never moves the pick.**
**Given** a learned model whose bucket overwhelmingly names product B, and a ladder whose
competing set selects product A,
**When** the opening is selected,
**Then** **A is selected**, and B's outcome records `learned.wouldPrefer: true`,
`learned.applied: false` — and A's records `learned.wouldPrefer: false`. Removing the learned
model entirely changes no selection anywhere.

**AC-33 (D13) — the learning point is unchanged.**
**Given** a quote is issued,
**When** outcomes are captured,
**Then** `captureRecommendationOutcomes` runs from `issue.ts` exactly as today; no capture
occurs at order acceptance, at proposal publication, or anywhere else.

**AC-34 (D18) — provenance is recorded.**
**Given** an outcome captured through the platform's review flow,
**Then** `provenance === 'in_platform'`; **Given** a row created through the backfill ingest,
**Then** `provenance === 'backfilled'`. The column defaults to `in_platform` and the migration
adds it without a table rebuild.

**AC-35 (D18) — provenance reaches the reviewer.**
**Given** a retrieval bucket of four rows, three in-platform and one backfilled,
**When** a candidate outcome is emitted,
**Then** `learned.provenance` is `{ inPlatform: 3, backfilled: 1 }` — so a surface can say which
of the four were in-platform reviews without inventing the number.

**AC-36 (D18) — the stale corpus is cleared.**
**Given** the pre-existing 9 recommendation-eligible rows,
**When** the reset runs,
**Then** they are deleted, an export of them exists before the delete, and no row in
`recommendation_outcome` predates the provenance column with an unset provenance.

### 5.7 The anonymous matcher (D6)

**AC-37 (D6) — cheapest that fits.**
**Given** a schedule row for a family with three products that all fit its dimensions, priced
$1,100, $700 and $950, and a price lookup supplied,
**When** the row is matched,
**Then** the $700 product is picked, regardless of its position in `WINDOW_SERIES_BIAS` /
`DOOR_SERIES_BIAS`.

**AC-38 (D6) — fit is still the filter.**
**Given** a cheaper product in the same family whose dimension range does **not** contain the
opening,
**When** the row is matched,
**Then** it is not picked; a dearer product that fits is.

**AC-39 (D6) — unchanged without a pricer.**
**Given** no price lookup is supplied (the client sample-schedule render, existing tests),
**When** rows are matched,
**Then** the picked products are exactly those the current series-bias order produces — the
existing schedule test expectations still pass unchanged.

**AC-40 (D6) — the nothing-fits branch is untouched.**
**Given** an opening no product in the family fits,
**When** the row is matched,
**Then** the largest-capacity product is returned with `fits: false` and the existing indicative
-price review reason, exactly as today.

**AC-41 (D6, non-functional) — pricing the candidates does not fan out.**
**Given** a 50-row schedule across 5 families,
**When** it is matched with a pricer,
**Then** price lookups are memoised per (family, width, height) so the number of price
computations is bounded by distinct (family, size) combinations, not by rows × products.

**AC-42 (D5) — the two engines stay exclusive.**
**Given** a visitor who matched a schedule anonymously and then signs in,
**When** they sign in without uploading anything,
**Then** no AI job is scheduled and no product on their lines changes.

### 5.8 Negative criteria — the defects this redesign exists to kill

Each is stated so a test can execute it against a fixture catalogue.

**AC-43 — a dearer compliant product must not beat a cheaper compliant one.**
**Given** two candidates that both fit and both meet the requirement, at $900 and $1,100, where
the $1,100 candidate sits closer to the centre of its dimension range,
**When** the opening is selected,
**Then** the $900 candidate is selected and ranked 1. Centre-of-range proximity has no effect on
any ordering anywhere.

**AC-44 — a product missing the thermal band must not beat one meeting it on price alone.**
**Given** candidate A meeting `maxUValue 4.0` (Uw 3.8) at $1,200 and candidate B missing it
(Uw 4.6) at $700, both fitting,
**When** the opening is selected,
**Then** **A is selected**; B is ranked below A with `tier: 'misses'`,
`normalisedDeviation === 0.15`, `competing: false`, and `price.deltaToSelected === -500` — B is
$500 cheaper than the pick and still loses, which is the whole point of the criterion.

**AC-45 — adding a third irrelevant candidate must not change the order of the first two.**
**Given** candidates A and B, where A is selected from tier `meets`,
**When** a third candidate C is added that also meets the requirement and is dearer than both,
**Then** A is still selected and the A/B relative order is unchanged.

**AC-46 — the comparator is pairwise.**
**Given** any two candidates and a requirement,
**When** `compareCandidates(a, b, requirement)` is called,
**Then** its result is a function of those two candidates and the requirement only. Adding,
removing or repricing any third candidate never changes it. No score is normalised across the
candidate set.

**AC-47 — an irrelevant candidate cannot move a tolerance band.**
**Given** no candidate meets the requirement and the competing set is the tolerance band,
**When** a candidate with a **larger** deviation than the current `best` is added,
**Then** `best`, the band, the competing set and the selection are all unchanged.

**AC-48 — the one set-relative behaviour, stated as intended.**
**Given** no candidate meets and a new candidate is added whose deviation is **smaller** than
the previous `best`,
**When** the run is re-evaluated,
**Then** the band tightens around the new `best`, a previously-competing candidate may drop to
`competing: false`, and its outcome records the new best. This is intended: a candidate proving
the requirement is more nearly achievable makes a larger miss demonstrably worse than necessary.
It is **not** the min–max artefact AC-45/AC-47 forbid, and the tester must not report it as one.

**AC-49 — certified-vs-estimated must not change the recommendation.**
**Given** any candidate set and its resulting rank order,
**When** every candidate's `certified` / `dataSource` value is inverted and the run repeated,
**Then** the selected product, the selected variant and the complete rank order are **identical**.
Line *status* may still differ (`commercial_only_estimate` vs `ready`) and that is intended.

**AC-50 — a composite and the same opening as a single unit must not disagree.**
**Given** products P and Q both valid for a 1,400 × 1,200 opening, with P preferred,
**When** that same 1,400 × 1,200 opening is evaluated as one segment of a composite,
**Then** P is preferred over Q for that segment; and
**Given** the composite ranker's module,
**When** it is inspected,
**Then** it declares no independent weight set and no second comparator — both paths call the
same `compareCandidates`.

**AC-51 — the geometry curve is gone.**
**Given** candidate A rated 400–1000 mm and candidate B rated 800–1200 mm, an opening at 900 mm
(A's edge, B's centre), A cheaper, both meeting the requirement,
**When** the opening is selected,
**Then** A is selected. Fit is a boolean, not a curve.

**AC-52 — a $0 rate-card gap must not win.**
**Given** a candidate whose computed price is `0`, negative, or `ok: false`,
**When** the opening is selected,
**Then** it is never selected, a priced candidate is chosen, and it sorts last among the
candidates the requirement cannot separate — i.e. behind every priced candidate of equal
deviation. Where deviation *does* separate them (within tier C) deviation leads, so an
unpriceable closest-match may sort above a priced worse one; it still cannot be selected from
there, because selection reads `competing` and not sort position (A18, reversing AD18).

### 5.9 Abuse-case criteria (negative, security)

See §7 for the threat reasoning. These must be executed for real — the forbidden action
attempted, the denial recorded.

**AC-53 — losing candidates are ops-only (D15).**
**Given** an authenticated Customer requesting the derivation for **their own** project,
**When** they call the ops derivation endpoint,
**Then** **403**, and no `candidate_result` data — ranked or otherwise — is returned. The
customer-facing surface returns the requirement, its provenance and whether it was met; never
the ranked alternatives, never another candidate's price.

**AC-54 — no cross-account leakage through the outcome.**
**Given** customer A's selection run,
**When** every persisted `outcome_json` and `selection_json` field is inspected,
**Then** none contains another account's project id, quote id, account id, contact details, or
any free text originating from another customer's document.

**AC-55 — the learned block never reaches a customer surface.**
**Given** any customer-facing API response carrying line or estimate data,
**When** it is inspected,
**Then** the `learned` block is absent, as is any losing-candidate list and any losing
candidate's price. (Losing prices expose the shape of the rate card across products; that is
commercially sensitive and ops-only.)

**AC-56 — the retrieval key carries no free text.**
**Given** a schedule whose comments contain an address, a client name, or any other free text,
**When** the retrieval key is built for the resulting outcome,
**Then** the key consists only of the four enumerated categorical values — no substring of any
customer document can appear in it, and therefore no customer's document text becomes a
queryable index key across accounts.

**AC-57 — anonymous callers get no candidate data.**
**Given** a signed-out visitor,
**When** they call any endpoint that returns selection or candidate data (including
`worker/routes/ops.ts:1625`'s support-lever estimate endpoint),
**Then** 401 or 403 and no candidate rows. The anonymous path returns matched lines and their
prices only.

**AC-58 — the corpus reset cannot cascade.**
**Given** the deletion of the 9 pre-existing `recommendation_outcome` rows,
**When** it runs,
**Then** an export of those rows exists first, the statement is a scoped `DELETE` (never a table
rebuild), and no row in any other table is deleted or nulled as a result.

---

## 6. Edge cases

| # | Case | Required behaviour |
|---|---|---|
| E1 | **GST** | Every price in the engine and in the outcome contract is **ex-GST**, with `currency: 'AUD'`. No engine surface bakes GST in. The account's `inc`/`ex` display mode is applied by the skin, on every customer surface, per the house rule. `deltaToSelected` is ex-GST too. |
| E2 | **Quote lifecycle** | The estimator writes only to draft projects and unedited `origin='ai'` lines. An issued quote is never re-recommended, and the existing delete scope at `worker/lib/ai/proposal.ts:413` is unchanged. A line a human edited is never overwritten by a re-run. |
| E3 | **Offerability gating** | Half-authored products are withheld **before** ranking and reported in `withheldIncomplete`, not as tier `excluded` — they never became candidates. The two completeness bars stay separate, `NULL` ≠ `[]`, glazing stays optional. When products of the right shape exist but were all withheld, the status is `catalogue_data_incomplete`, never `no_candidate`. |
| E4 | **Disabled products** | Never machine-selected, still visible to ops for repricing an order placed before withdrawal. Unchanged. |
| E5 | **No thermal requirement at all** | Every fitting candidate is tier `meets`; cheapest wins. This is the largest behaviour change in the release and it is D2. |
| E6 | **Incoherent band** (min > max) | The existing coherence guard coerces it; if coercion yields no band, the opening is treated as having no thermal requirement rather than eliminating every product (AC-16). |
| E7 | **Unknown opening dimensions** | Unchanged: `manual_review`, nothing machine-selected. |
| E8 | **Unknown thermal figures** | Tier `thermal_unknown` — below every measurable deviation, still ranked, priced and selectable (§4.3). |
| E9 | **Every candidate unpriceable** | Status `catalogue_data_incomplete`, nothing selected, all candidates persisted with their reasons. |
| E10 | **Exactly equal prices** | Deterministic tiebreak: deviation, then slug, then variant id. Never input-order dependent. |
| E11 | **Quantity** | Compared on the same basis for every candidate in a run, so quantity scales all candidates equally and cannot change an order. |
| E12 | **Oversize beyond the split cap** | The last-resort tier-E candidate, priced at real opening dimensions, `commercial_only_estimate` (§4.6). Never "we sell nothing that shape" for a merely-large opening. |
| E13 | **Delivery zones** | Not touched by this work. The unpriced-zone gap is a separate known issue. |
| E14 | **Advisory (learned thermal) requirements** | `effectiveThermalRequirements` resolution — explicit ∩ advisory with the coherence guard, explicit energy report always winning — is unchanged. Only the *scoring* of the resolved band changes. |
| E15 | **A candidate appearing in both a single-unit and a split make-up** | Two distinct candidates with distinct `form` values; both persisted; no deduplication that would hide one from the reviewer. |

---

## 7. Security

**Assessment: limited sensitive surface — not "none".** The honest reading.

**What this feature does not touch.** No payout or bank details, no ABN, no personal
information, no authentication or session logic, no uploads, no payments. The engine reads
catalogue data (public product records) and D1 rate cards, and writes `selection_run`,
`candidate_result`, `draft_order_line` and `recommendation_outcome`.

**What it does touch, and why it is not nothing.**

1. **The learning corpus is cross-account by construction.** `buildHistoricalModel` reads every
   approved `recommendation_outcome` row across all customers and uses the aggregate to inform
   a recommendation for a different customer. In this release the layer is dark, so nothing it
   computes reaches a customer surface at all — but the read is still cross-tenant, and the
   coarsened retrieval key makes buckets *denser*, which is exactly what makes an aggregate
   more informative. The mitigations are: the key is four enumerated categorical values with no
   free text (AC-56), the aggregate exposes only "product X was chosen n of m times" with no
   price, project or account, and the block never leaves the ops surface (AC-55).
2. **Losing candidates' prices are commercially sensitive.** The ranked set exposes the shape of
   the rate card across products at a given size. D15 makes alternatives ops-only for a product
   reason; it is also the right security posture, and AC-53/AC-55 enforce it against the owning
   customer as well as against third parties.
3. **The support-lever estimate endpoint** (`worker/routes/ops.ts:1625`) returns selection data
   and must remain staff-only (AC-57).

**Data classification:** catalogue = public; rate cards and candidate prices = commercially
sensitive, staff-only in aggregate; the learning corpus = internal, no PII; opening dimensions
and thermal requirements = customer project data, readable only within the owning account.

**Trust boundaries:** anonymous → matched lines and their own prices only; authenticated
customer → their own project's requirement, provenance and met/not-met; staff → the full ranked
candidate set with reasons and the learned shadow block.

The abuse cases are AC-53 to AC-58 and the tester executes them for real.

---

## 8. Sizing and phasing

**This is one normally-sized feature, not a wayfinder effort.** The route is fully visible: the
grill's D1–D18 *is* the map, the problem is one subsystem, and no decision remains open. A
wayfinder chart would be a second map of ground already surveyed.

**But it must ship in phases**, per the owner's standing directive that multi-area work be broken
into deployable phases. Four, each independently deployable, each running the full
implement → test → review loop and being deployed before the next begins:

| Phase | Content | Decisions | Deployable outcome |
|---|---|---|---|
| **1 — The ladder** | Delete the weighted ranker and the ten constants. Build `compareCandidates`, requirement-relative deviation, the tiers and the competing set. Rebuild the composite ranker on the same comparator. Emit `CandidateOutcome` / `SelectionOutcome` (with `learned: null`). Migration: `candidate_result.outcome_json`, `selection_run.selection_json` (ADD COLUMN only). Move the `dominant` consumers. Splits remain where they are, but are compared by the new comparator when built. | D1 D2 D3 D4 D8 D10 D14 D16 D17 | The recommendation is immediately correct on price and thermal for single units, and R3's read contract exists |
| **2 — Splits as candidates** | `materialiseSplits` moves from post-pass into candidate generation; split candidates enter the same tiers; the never-split-for-thermal guard. Touches `split.ts`, `compositeSelect.ts`, `estimate.ts`. | D7 | Oversize and drawing-implied openings are answered by a candidate rather than a rework |
| **3 — The learned layer** | Coarsened, versioned retrieval key + index; the density floor; the dark shadow block on every candidate outcome; the provenance column; the corpus reset and the backfill ingest route. Migration: `recommendation_outcome.retrieval_key`, `retrieval_key_version`, `provenance`. | D11 D12 D13 D18 | Ops can see what the machine would have learned, with the evidence's provenance, while it changes nothing |
| **4 — The anonymous matcher** | `pickProduct` cheapest-that-fits with the injected pricer. ~30 lines and one test file. Independent of 1–3. | D6 | The signed-out estimate stops preferring a hard-coded slug order |

Phase 4 can ship **first** if a quick, visible win is wanted; it shares no code with 1–3.

**Test ownership** (all in `npm run test:pure`, esbuild-bundled per the header of
`scripts/tests/estimator-rules.test.mjs`): phase 1 — `estimator-recommendation.test.mjs`,
`estimator-rules.test.mjs`, `thermal-selection.test.mjs`, `composite.test.mjs`,
`composite-select.test.mjs`, `estimator-derive.test.mjs`, `ai-pipeline.test.mjs`; phase 2 —
`estimator-split.test.mjs`, `compatibility.test.mjs`; phase 3 — `estimator-learning.test.mjs`;
phase 4 — `schedule.test.mjs`. **No Playwright coverage is required** because this feature adds
and changes no UI; if any phase turns out to change a rendered surface, that phase acquires a
`scripts/tests/web/` requirement.

---

## 9. `ASSUMED:` register

Every user-owned call made in the owner's absence, in one place, for the acceptance veto.

| # | Assumption | Where | Why |
|---|---|---|---|
| A1 | Scalar deviation is the **maximum** across constrained axes, not the sum | §4.3, AC-15 | The requirement is a conjunction; the worst failure is the failure. Summing double-counts and makes the band uninterpretable |
| A2 | A **missing** thermal figure is *unknown*, ranks below every measurable deviation, and is never asserted to meet a requirement | §4.3, E8 | The Customer's need is products that *accurately* meet requirements. Still selectable by a human (ops2 AC-3) |
| A3 | The **schedule glazing instruction stays a hard constraint** (a fourth item on D3's list) | §4.1, AC-11 | It is a customer instruction, not a performance objective; substituting the opposite glass is the substitution D3 forbids. Preserves today's shipped behaviour |
| A4 | A **last-resort tier-E candidate** survives when nothing fits, single or split | §4.6, E12, AC-12 | Without it, making fit hard silently regresses today's indicative-price-plus-warning promise on a large opening |
| A5 | D17's "prefer the dearer" is honoured as *no downward buffer + an unpriceable candidate never beats a priced one*, **not** as a price-proximity band | §4.5 | A band would be a second tuned constant, and D10 states the 5% tolerance is the only one |
| A6 | A price of **≤ 0 or not `ok` is unpriceable** and can never be "cheapest" | §4.5, AC-52 | The obvious way a cheapest-wins rule gets exploited by a rate-card gap |
| A7 | `certified`/`estimated` is excluded from **every** ordering position **including tiebreaks** | §4.5, AC-49 | Makes the negative criterion cleanly testable and removes the −0.085 defect entirely |
| A8 | Retrieval key = `operationType \| orientation \| sizeBand \| thermalRequired` (**rk-v2**), with `sizeBand` by **width** at 1800/3000 mm and `family` dropped | §4.8, AC-28/29 | ML guidance, reasoning in §4.8: width is what the frame series' limits turn on; family is a function of operation. **Owner ruling at acceptance:** `orientation` replaced `requirementBasis` — orientation decides whether Uw or SHGC dominates and is the preference the layer exists to learn (D9), while basis is provenance rather than physics and correlates with orientation anyway. The version was bumped so a mixed-version corpus is detectable |
| A9 | The retrieval key is **stored, versioned and recomputable** from `context_json` | §4.8, AC-30 | Feature-store discipline: a later redefinition becomes a recompute, not lost history |
| A10 | Retrieval **density floor raised from 2 to 5** observations | §4.8, AC-31 | Laplace smoothing is unstable at n=2. Dark, so it only affects what ops is shown |
| A11 | `dominant` is replaced by `competingTier` + `requirementMet`, with the mapping in §4.11 | §4.11, AC-26 | Deleting the 0.05 threshold forces a replacement; the tier is strictly more informative than a score gap |
| A12 | `draft_order_line.confidence` is written **NULL** | §4.11 | There is no score to put in it |
| A13 | D6 is delivered via an **optional injected price lookup**, with the series bias retained as the no-pricer fallback | §4.12, AC-37/39 | `matchSchedule` is pure and synchronous with no pricing engine; this is the only way to honour both "cheapest that fits" and pricing's single home |
| A14 | The **data-entry work** of seeding the corpus is owner/ops activity, not a code deliverable of phase 3 | §2, §8 | Phase 3 ships the column, the capture, the retrieval and the ingest route; which real plans and which manufactured products is knowledge only the owner has |
| A15 | `CONTEXT.md` gains a new **`Visitor`** term rather than widening `Customer` | §3 | The two are served by different engines with different guarantees (D5); the architect owns the final call and no criterion depends on it |
| A16 | Four deployable phases, in the order given, with phase 4 free to ship first | §8 | The owner's standing directive to break multi-area work into deployable phases |
| A17 | `deltaToSelected` is **candidate minus pick** — negative means cheaper than the pick | §4.10, AC-44 | The sign has to be fixed somewhere or the developer guesses and the ops surface renders it backwards |
| A18 | `MAX_SYSTEMS = 12` (`worker/lib/estimator/compositeSelect.ts`) is **retained** as a work bound; **`MAX_GLASS_TRIALS` was DELETED** | §11, AC-4 | Raised at acceptance on the tester's finding and **settled by the owner**, who split the two. `MAX_SYSTEMS` bounds enumeration and cannot bind: six systems exist and a test forces the cap above that count. `MAX_GLASS_TRIALS = 3` was not a work bound — on four or more units suggesting four or more distinct glazing options it truncated the shortlist and dropped a candidate *unified* make-up that could have been cheaper, which is a preference effect. Removing it costs almost nothing because glazing options are not freely varied in practice and the distinct-glass count is bounded by the unit count. History that sharpened the ruling: `MAX_SYSTEMS` was originally **4**, and at 4 it silently excluded AMJ80 — the largest platform in the catalogue — from all-fixed composites via an alphabetical tiebreak. Registered as AD35 in the design |
| A19 | Within a tier, **deviation is compared before priceability**: an unpriceable candidate that is the closest thermal match sorts *above* a priced worse one, and sorts last only among candidates of equal deviation | §4.5, AC-52 | **Owner ruling at acceptance, reversing AD18.** The reviewer's losing-candidate list should lead with "this is the best thermal answer and we cannot price it at this size". Restores design §4.2's numbered sequence, which the developer had overridden in favour of §4.5's categorical "sorts last within its tier" and which the conformance review had upheld. Verified safe before landing: selection reads the `competing` flag — set only on priceable members of the competing tier — never sort position, and between two priceable candidates the priceability step is a no-op, so the order of candidates that can win is unchanged. One consequence was found and fixed: `proposalSeed` took rank 1, which can now be unpriceable, and would have dropped a split-winning line into the empty-line branch; it now takes the best *priceable* single |
| A20 | A split make-up that does **not fit** is **excluded**, not placed in tier E; it is still persisted with a `dimensions` exclusion naming the breached axes | §4.1, AC-12, AC-17, AC-19 | **Owner ruling at acceptance, reversing AD24.** Ops can build their own splits, so proposing a make-up that cannot physically be built is not help — it is noise among candidates a reviewer might actually pick. Persisting it with its reason keeps "a split was considered and rejected on fit" distinguishable from "no split was tried". **A paired change was required for safety and is part of this decision:** the single-unit last resort (A4/AD15) is now retired by a split that FITS rather than by one merely existing. Without it, an opening too TALL for every product — which splitting on width can never rescue — would have had every single excluded AND every split excluded, and come back empty. That is the failure mode the non-blocking contract exists to prevent, and it is guarded by a named regression test. **AD20 is deliberately NOT unified with this**: `selectForComposite`'s make-up enumeration is a different path, where make-ups are the *only* candidates and excluding a non-fitting one would genuinely empty the run |

---

## 10. Open questions

**None.** The owner authorised the pipeline to run without him; every point that would have been
a question is decided above and registered in §9 for veto at acceptance.

---

## 11. Definition of done

- All 58 acceptance criteria pass, evidenced by named tests in the suites listed in §8.
- `RANK_WEIGHTS`, `geometryScore`, `configurationScore`, `dataCompletenessScore`,
  `selectWithConfidence`, `FLOOR`, `SHGC_SPAN` and `UVALUE_SPAN` do not exist in the codebase
  (AC-4).
- `REQUIREMENT_TOLERANCE = 0.05` is the only **preference** constant in the selection path —
  the only number that can make one candidate rank above another — defined in one module,
  stamped on every persisted run, and documented with its reasoning and an owner (D10: NCC
  compliance is a whole-of-home NatHERS star rating that absorbs per-window variance, and AFRC
  Total System figures are product ratings rather than site measurements).
- **Work bounds are a separate category and are permitted** (A18): a constant that limits how
  many candidates are *enumerated* is not a constant that decides which one *wins*. Each must
  be documented with its reasoning, and `MAX_SYSTEMS` must stay above the number of frame
  systems the catalogue holds. This clause is an amendment made at acceptance — the original
  wording said "the only tuned constant", which was not true of the shipped code, and a
  Definition of Done that asserts something untrue is how the six unsourced weights this
  feature deletes got in unchallenged.
- No `migrations/` change rebuilds a table; the `d1-migration-safety` skill was loaded before
  authoring; production data was exported before any destructive statement.
- `npm test` and `npm run typecheck:gate` green.
- The security sweep is green on the deployed commit.
- Every `ASSUMED:` in §9 is presented to the owner at acceptance for sign-off or veto.
