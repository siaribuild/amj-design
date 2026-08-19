# Product recommendation model — architecture design

**Stage:** pipeline stage 2 (architect) · **Date:** 2026-08-20 · **Branch:** `feat/recommendation-model`
**Inputs:** `docs/specs/recommendation-model.md` (spec, 58 ACs, A1–A17), `docs/specs/recommendation-model-grill-conclusions.md` (D1–D18, binding).
**Migration safety:** the `d1-migration-safety` skill was loaded before any of §9 was authored. Every migration in this design is `ALTER TABLE … ADD COLUMN` plus one scoped `DELETE`; no table is dropped, rebuilt or renamed.
**Spec-vs-grill conformance:** read side by side, no conflict found. The spec's one redefinition worth noting — run status `no_candidate` now means "no candidate survived the hard constraints" (AC-7), not only "the catalogue sells nothing of this shape" — traces cleanly to D3 ("a candidate that fails these is not a candidate") and is carried into §5.6 below.
**Decisions needed:** **none** (owner authorised the run; every judgement call is in the §16 `ASSUMED:` register, AD1–AD35 (AD17–AD35 registered post-implementation), for veto at acceptance).

---

## 0. Shape of the design, in one paragraph

Ten unsourced constants and the weighted ranker die; a two-branch **filter-then-ladder** replaces them. The ladder is one deep module with a small interface: give it candidates carrying four facts each — excluded? fits? scalar deviation? price in cents? — and it returns a total, deterministic order plus one winner. Everything else in this design is plumbing that keeps that module the *only* place selection happens: the single-unit path, the composite path and (Phase 2) the split-vs-single contest all feed the same `runLadder`, so no two paths can disagree about which product is better (AC-50). The per-candidate verdict is emitted as a structured `CandidateOutcome` — the contract ops2 R3 reads — persisted by `ADD COLUMN` next to the legacy columns, which stop being written but are never rebuilt away. The learned layer ships dark behind a coarse, versioned retrieval key; the anonymous matcher gets its one change via an injected price lookup.

---

## 1. Domain model — `CONTEXT.md` additions and ADR

The architect owns `CONTEXT.md`; the developer applies the exact text below (Phase 1, except **Corpus provenance**/**Retrieval key** which land with Phase 3). Glossary text is implementation-free by design.

### 1.1 New actor (resolves the grill's gap; spec A15 — new term, not a widened Customer)

Add under **Actors**, after **Payable account**:

> **Visitor**:
> A signed-out person on the customer site. Browsing, configuring, live pricing and the schedule match are Visitor territory; the submission gate is where a Visitor becomes a Customer. A Visitor is served by the deterministic matcher with an indicative price — never by the AI estimator, which serves signed-in Customers; neither engine re-runs or silently replaces the other's work.
> _Avoid_: anonymous user, guest

Rationale: D5 fixes two engines with different guarantees; collapsing Visitor into Customer would make "the Customer gets the AI estimator" false. No acceptance criterion depends on which resolution is chosen (spec §3), so this is decided here.

### 1.2 Estimator vocabulary (replace/extend the "Estimator and schedules" section)

Sharpen the existing **Estimator** entry to:

> **Estimator**:
> The subsystem that derives line configurations and recommendations from parsed schedules. It proposes, never decides: staff review every quote before issue and may change anything. What it learns is captured at quote issue and is currently dark — recorded and shown to staff, moving no recommendation.
> _Avoid_: quote (an estimator output is not a quote)

Add these entries:

> **Candidate**:
> One way the estimator could answer an opening: a product-and-glass configuration, or a split of several units acting as one. Every candidate a run considered is kept with its verdict — winners, losers and the excluded — because staff review must be able to answer "why not the cheaper one?" long after the fact.
> _Avoid_: option, suggestion
>
> **Selection ladder**:
> How the estimator chooses among candidates: hard constraints eliminate; tiers order what survives (meets → within tolerance → misses → thermal unknown → does not fit); the cheapest candidate in the best non-empty tier wins. There are no weights and no blended score. A lower tier is reached only when every tier above it is empty, so the competing set is never empty while any candidate survives.
> _Avoid_: ranker, scoring, weights
>
> **Tier**:
> A candidate's verdict class on the ladder. An excluded candidate is recorded with the constraint it failed and is never machine-selected; every other tier stays selectable, priceable and saveable by a human.
>
> **Requirement tolerance**:
> The single tuned constant in selection: when no candidate meets a thermal requirement, candidates within 5% (of the requirement value) beyond the best achieved deviation still compete on price. Stamped on every run so a past selection is reproducible.
>
> **Requirement basis**:
> Where an opening's thermal requirement came from: an energy report, derivation from the plans, a default envelope, or a human override. A computed requirement binds selection exactly as a reported one does; only the basis differs, and staff see the basis.
>
> **Candidate outcome**:
> The structured facts the estimator emits per candidate — tier, rank, per-axis deviation, price delta against the pick, exclusion constraints. Facts only, never sentences: each surface composes its own wording. This is the contract the ops derivation surface reads.

Add with Phase 3:

> **Learned layer (dark)**:
> The estimator's memory of what humans actually issued, consulted per candidate and applied to nothing: it records what it would have preferred and shows that to staff, and moves no recommendation until it is deliberately switched on.
>
> **Retrieval key vs recorded context**:
> An outcome records its full context; the learned layer retrieves by a deliberately coarse, versioned key (operation, requirement basis, width band, whether thermal was required) so evidence accumulates in buckets dense enough to mean something. Redefining the key is a recompute over the stored context, never lost history.
>
> **Corpus provenance**:
> Whether a learning outcome came from the platform's own review flow (`in_platform`) or was backfilled from pre-platform history (`backfilled`). A reviewer told "3 of 4 similar openings went this way" can see which of the four were real in-platform reviews.

### 1.3 ADR — `docs/adr/0007-recommendation-filter-then-ladder.md`

The developer creates this file with the following content (numbered 0007: this branch holds 0001–0002, the ops2 branch holds up to 0006; 0007 avoids the collision when the branches merge):

> # Recommendation is a filter-then-ladder, never a weighted score
>
> Status: accepted (owner grill D1–D18, 2026-08-20)
>
> ## Decision
> The estimator selects by elimination and ordering, not by scoring: hard constraints (operation, fit, split combinability, the schedule's glazing instruction) eliminate; survivors are tiered by requirement-relative thermal deviation (meets / within 5% tolerance of the best achieved / misses / unknown / does not fit); the cheapest priceable candidate in the best non-empty tier wins. One tuned constant exists (`REQUIREMENT_TOLERANCE = 0.05`, dimensionless because deviation is normalised against the requirement itself); it is stamped on every persisted run. Comparison between two tiered candidates is pairwise and set-independent; the only set-relative step is the tolerance band, anchored on the best achieved deviation, and that behaviour is intended (spec AC-48).
>
> ## Context
> The shipped six-weight ranker (`compliance .35 / geometry .20 / configuration .15 / commercial .15 / historical .10 / dataCompleteness .05`) arrived in one commit citing a spec section that does not exist, was never measured, and demonstrably picked dearer products over cheaper compliant ones, punished `estimated` catalogue records harder than real price differences, and flipped winners when an irrelevant third candidate was added (min–max normalisation). The ops console's derivation region requires losing candidates ranked *with reasons*, which a blended score cannot produce and a ladder produces natively.
>
> ## Consequences
> - `RANK_WEIGHTS`, `geometryScore`, `configurationScore`, `dataCompletenessScore`, `selectWithConfidence` (and its 0.05 dominance threshold), `FLOOR`, `SHGC_SPAN`, `UVALUE_SPAN` are deleted, not tuned.
> - The composite path calls the same comparator; a preference has no channel to influence order (the same-technology preference died with the weights — future contextual preferences belong to the learned layer, D9).
> - `certified` vs `estimated` affects line *status* only, never order.
> - The per-candidate verdict is a persisted structured contract (`CandidateOutcome`), replacing `score_components_json`, which remains in place, unwritten.
> - The learned layer ships dark: consulted for display, wired into nothing the ladder reads.
>
> ## Rejected
> - Re-tuning the weights: no eval harness exists and the failure is structural (irrelevant-alternatives violation), not parametric.
> - A price-proximity band for D17's "prefer the dearer": a second tuned constant, which D10 forbids; the direction is honoured by fail-closed pricing instead.

---

## 2. Module boundaries and seams

Vocabulary per the codebase-design skill: modules, interfaces, seams, depth.

### 2.1 The three-layer seam placement

| Layer | Module | Interface (what a caller must know) | Why the seam is here |
|---|---|---|---|
| **Contract** | `src/data/recommendation.ts` (new) | `Tier`, `TIER_ORDER`, `tierRank()`, `RequirementBasis`, `CandidateOutcome`, `SelectionOutcome`. **Zero imports.** | The ops2 skin and the worker both consume these types (ADR 0006 admission rules 1–4 all hold; the house rule puts shared types in `src/data/`). Nothing behavioural lives here — a type-only module cannot drift from a persisted contract. |
| **Ladder** | `worker/lib/estimator/ladder.ts` (new) | `REQUIREMENT_TOLERANCE`, `SELECTION_VERSION`, `deviationOf(requirement, reading)`, `LadderCandidate`, `assignTiers(candidates, tolerance)`, `compareCandidates(a, b)`, `runLadder(candidates, tolerance)`. Pure, synchronous, no I/O. | Deep module: all of D8's math, D10's rule, §4.5's total order and every edge rule (§4 below) behind six exports. Only the worker calls the functions (ADR 0006 rule 2: a helper one consumer wants is that consumer's helper — see AD1), so the *logic* stays worker-side while the *types* it stamps live in the contract layer. |
| **Builder** | `worker/lib/estimator/outcome.ts` (new) | `buildOutcomes(run: DecisionInput): { outcomes: CandidateOutcome[]; selection: SelectionOutcome }`. | The one place engine-internal shapes (`EvaluatedCandidate`, `PriceSnapshot`, `RuleOutcome`, split make-ups) are translated into the contract. Maps prose-free facts only (AC-21): every `exclusions[].detail` is built from structured fields, never by copying a `FilterOutcome.reason` string. |

AC-23's import-graph criterion holds for all three: none imports a router, Ionic, Radix, CSS, a store or a fetch client (the contract module imports nothing at all).

### 2.2 What stays where (one place per fact)

- **Requirement resolution** stays in `worker/lib/estimator/rules.ts` `effectiveThermalRequirements` (rules.ts:142) — explicit ∩ advisory with the coherence guard, unchanged (E14, AC-16). The ladder *receives* a resolved requirement; it never resolves one.
- **Fit facts** get one home: a new `fitFacts(opening, dimensionRule)` export in rules.ts (extracted from `checkDimensions`:57's inline `within()` logic), returning `{ fits, breached: ("width"|"height"|"area"|"aspect")[], limit }`. `checkDimensions` and the outcome builder both call it; nobody re-derives fit.
- **Pricing** stays in `worker/lib/estimator/pricing.ts`; the ladder compares `Math.round(total × 100)` integer cents and never computes a price. No GST arithmetic exists anywhere in the estimator (E1): `computePrice` emits the engine's single basis and GST remains a display concern of the one GST home.
- **Selection** happens in exactly one function, `runLadder`. `select.ts`, `compositeSelect.ts` and (Phase 2) `splitCandidates.ts` are candidate *generators* that feed it.

---

## 3. The contract — `src/data/recommendation.ts` (exact types)

This is the ops2 R3 read contract (D14, D16). It is the spec's §4.10 shape verbatim, with the module path and two clarifications fixed here: the identity block's meaning for splits, and the totalised tiebreak.

```ts
// src/data/recommendation.ts — the estimator's emitted-facts contract.
// ZERO imports. Read by the worker (writer) and the ops2 skin (reader).
// Facts only, never sentences (spec AC-21): every field is an identifier,
// an enum, a number or a boolean.

export type Tier =
  | "meets"             // A — fits, deviation 0, or no thermal requirement at all
  | "within_tolerance"  // B — fits, 0 < deviation ≤ best + tolerance
  | "misses"            // C — fits, deviation > best + tolerance
  | "thermal_unknown"   // D — fits, requirement stated, no figure on a constrained axis
  | "does_not_fit"      // E — the last-resort best-fit unit (spec §4.6)
  | "excluded";         // X — failed a hard constraint; never machine-selected

export const TIER_ORDER: readonly Tier[] = [
  "meets", "within_tolerance", "misses", "thermal_unknown", "does_not_fit", "excluded",
];
export const tierRank = (t: Tier): number => TIER_ORDER.indexOf(t);

export type RequirementBasis =
  | "explicit_energy_report" | "plan_derived" | "default_envelope" | "human_override";

export type ExclusionConstraint =
  | "operation" | "dimensions" | "split_combinability" | "glazing_instruction"
  | "offerability" | "disabled" | "publication";

export interface CandidateOutcome {
  // identity — for a split, the largest-area unit's identity (units[] is
  // authoritative; see AD6)
  productSlug: string;
  sanityProductId: string;
  variantId: string | null;
  catalogueRevision: string;
  form: "single" | "split";
  units?: {
    productSlug: string; variantId: string | null;
    widthMm: number; heightMm: number; operationType: string | null;
  }[];

  // verdict
  tier: Tier;
  rank: number | null;            // null iff tier === 'excluded'
  selected: boolean;
  competing: boolean;             // was in the set that competed on price

  // why it is not a candidate (tier 'excluded' only; [] otherwise)
  exclusions: {
    constraint: ExclusionConstraint;
    detail: Record<string, unknown>;   // structured facts only, never prose
  }[];

  // the requirement this candidate was judged against
  requirement: {
    maxUValue: number | null; minShgc: number | null; maxShgc: number | null;
    basis: RequirementBasis | null;
    absent: boolean;              // true when there is no thermal requirement at all
  };

  // how it did
  thermal: {
    uValue: number | null; shgc: number | null;
    deviation: { uValue: number | null; minShgc: number | null; maxShgc: number | null };
    worstAxis: "uValue" | "minShgc" | "maxShgc" | null;
    normalisedDeviation: number | null;   // the scalar the ladder compares; null = unknown
    absoluteMiss: number | null;          // the miss in the requirement's own unit
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

  // commercial — the engine's single price basis (GST-free; display GST is the
  // skin's job, per the GST-mode house rule)
  price: {
    total: number | null;         // null when unpriceable
    currency: "AUD";
    ok: boolean;
    /** SIGN CONVENTION (spec A17): candidate total MINUS selected total.
     *  Negative ⇒ cheaper than the pick. 0 on the pick. null when either
     *  side is unpriced. */
    deltaToSelected: number | null;
  };

  // the learned layer, dark (D11) — null until Phase 3 ships
  learned: {
    retrievalKey: string;
    retrievalKeyVersion: string;
    observations: number;
    support: number;
    wouldPrefer: boolean;
    applied: false;               // literal false in this release
    provenance: { inPlatform: number; backfilled: number };
  } | null;
}

export interface SelectionOutcome {
  version: string;                        // SELECTION_VERSION, 'ladder-v1'
  openingRef: string | null;
  requirement: CandidateOutcome["requirement"];
  tolerance: number;                      // 0.05, stamped per run (AC-4)
  competingTier: Tier | null;
  selectedProductSlug: string | null;
  status: "ready" | "needs_manual_review" | "commercial_only_estimate"
        | "catalogue_data_incomplete" | "unavailable" | "no_candidate";
  withheldIncomplete: { slug: string; gaps: string[] }[];
}
```

Stability rules for the contract (state them to the developer, test them in `recommendation-contract.test.mjs`):

1. **Additive-only evolution.** ops2 R3 is built against this shape; a field is added, never renamed or re-typed. `version` names the emitting model.
2. **No sentences.** No `message`, `reason`, or assembled copy anywhere in `outcome_json` (AC-21). The builder maps rules-engine prose to structured detail (e.g. the operation filter's failure becomes `{ requiredOperation: "awning", offered: ["fixed"] }`).
3. **`exclusions.detail` carries facts about *this* opening only** — catalogue identifiers, numbers, enums; never schedule comment text, never another account's anything (AC-54, AC-56 posture).

---

## 4. The ladder — `worker/lib/estimator/ladder.ts` (exact interface and rules)

```ts
import type { Tier, RequirementBasis } from "../../../src/data/recommendation";

/** The ONE tuned constant in selection (D10). Owner: the owner; reasoning:
 *  NCC compliance is a whole-of-home NatHERS star rating that absorbs
 *  per-window variance, and AFRC Total System figures are product ratings,
 *  not site measurements. Stamped on every persisted run. */
export const REQUIREMENT_TOLERANCE = 0.05;
export const SELECTION_VERSION = "ladder-v1";

export interface ResolvedRequirement {
  maxUValue: number | null; minShgc: number | null; maxShgc: number | null;
  basis: RequirementBasis | null;
  absent: boolean;
}

export interface ThermalReading {
  uValue: number | null; shgc: number | null;
}

export interface Deviation {
  perAxis: { uValue: number | null; minShgc: number | null; maxShgc: number | null };
  worstAxis: "uValue" | "minShgc" | "maxShgc" | null;
  scalar: number | null;   // null = unknown (a constrained axis had no figure)
  absoluteMiss: number | null;
}

/** D8's math, the single home. max across constrained axes (spec A1);
 *  any constrained axis without a figure ⇒ scalar null = unknown (spec A2). */
export function deviationOf(req: ResolvedRequirement, reading: ThermalReading): Deviation;

export interface LadderCandidate {
  key: string;                  // caller's stable identity, echoed back
  productSlug: string;          // tiebreak 1
  variantId: string | null;     // tiebreak 2
  splitKey: string | null;      // tiebreak 3, splits only (system|glass|unit refs)
  excluded: boolean;            // failed a hard constraint (tier X)
  fits: boolean;
  lastResort: boolean;          // eligible for tier E promotion (§4.4 below)
  deviation: number | null;     // scalar from deviationOf; null = unknown
  thermalRequired: boolean;
  priceCents: number | null;    // Math.round(total × 100); null = unpriceable
}

export interface TieredCandidate extends LadderCandidate {
  tier: Tier;
  competing: boolean;
  rank: number | null;          // null iff tier 'excluded'
  selected: boolean;
}

export interface LadderResult {
  ranked: TieredCandidate[];    // total, deterministic order (AC-5)
  best: number | null;          // smallest measurable deviation among fitting candidates
  competingTier: Tier | null;
  selectedKey: string | null;
}

/** The ONLY set-relative step (band anchoring; AC-48). */
export function assignTiers(candidates: LadderCandidate[], tolerance?: number): TieredCandidate[];

/** Pairwise, pure, set-independent over stamped facts (AC-46):
 *  tier asc → within-tier rule (§4.2) → unpriceable last → slug → variantId → splitKey. */
export function compareCandidates(a: TieredCandidate, b: TieredCandidate): number;

export function runLadder(candidates: LadderCandidate[], tolerance?: number): LadderResult;
```

### 4.1 Tier assignment (the set-relative step, fully specified)

Given `tolerance` (default `REQUIREMENT_TOLERANCE`):

1. `excluded` ⇒ tier **X**, `rank: null`, `competing: false`.
2. `!fits && !lastResort` ⇒ tier **X** with the caller having stamped the dimensions exclusion; `!fits && lastResort` ⇒ tier **E** (see §4.4).
3. Fitting candidates, `thermalRequired === false` ⇒ tier **A** (`deviation` treated as 0; AC-6, E5).
4. Fitting, `deviation === null` (unknown) ⇒ tier **D** (below every measurable deviation, spec A2). *Any* constrained axis without a figure makes the scalar unknown — a candidate missing SHGC measurably but with no Uw figure against a Uw cap is tier D, because its worst axis cannot be asserted.
5. Fitting, `deviation === 0` ⇒ tier **A**.
6. Otherwise: `best` = min measurable deviation over **all fitting candidates, priceable or not** (AD3 — a rate-card gap must not move a thermal judgement; the spec's own wording is "any fitting candidate"). `deviation ≤ best + tolerance` ⇒ tier **B**; else tier **C**.
7. **Competing set** = every *priceable* member of the highest tier (A→E order) that contains at least one priceable candidate (AD2). Unpriceable candidates are tiered and ranked but always `competing: false` (extends spec A6; reconciles AC-3 with E9).

### 4.2 The total order (AC-5, E10)

`compareCandidates(a, b)` over stamped facts, in sequence:

1. `tierRank(a.tier)` ascending.
2. Within tier **C**: deviation ascending, then price.
3. Within **A, B, D, E, X**: price ascending.
4. Unpriceable (`priceCents === null`) sorts after every priced candidate within its tier (A6/AC-52).
5. Final: `productSlug` asc → `variantId` asc (null first) → `splitKey` asc (null first). Total and input-order-independent.

`certified`/`estimated` appears nowhere in this list — AC-49 holds by construction; the comparator cannot even see the field.

### 4.3 Selection

`selectedKey` = the first candidate in ranked order with `competing: true` (i.e. the cheapest priceable candidate of the competing tier; for tier C, the smallest-deviation-then-cheapest). When no candidate anywhere is priceable, `selectedKey: null`, `competingTier: null` (E9 → status `catalogue_data_incomplete`, §5.6).

### 4.4 The last-resort tier-E candidate (spec §4.6, A4; E12)

The *caller* (select.ts / splitCandidates.ts) stamps `lastResort: true` — the ladder never picks which product deserves it. Rule: when no single-unit candidate fits **and** (Phase 2) no complete split make-up exists, the generator marks every configuration of the **largest-capacity** sellable, complete product of the required operation (`max((maxWidthMm ?? ∞→0) × (maxHeightMm ?? ∞→0))` over dimension rules, ties by slug) as `lastResort`, priced at the **real opening dimensions** (already how `priceFn` works — it prices the opening, not the rule). Its configurations land in tier E and the cheapest wins there; every other non-fitting candidate is tier X with `constraint: "dimensions"`. In Phase 1 (splits still a post-pass) the condition is simply "no single-unit candidate fits", which preserves today's indicative-price promise while the post-pass proposes the split.

### 4.5 Deviation math (D8, spec §4.3 — implemented in `deviationOf`)

Per constrained axis: `uValue: max(0, (u − maxU)/maxU)`; `minShgc: max(0, (min − shgc)/min)`; `maxShgc: max(0, (shgc − max)/max)`. Scalar = **max** of computed axes (A1); `absoluteMiss` = the worst axis's miss in its own unit; a constrained axis with a null figure ⇒ scalar null (unknown). Requirement with `absent: true` ⇒ scalar 0, worstAxis null.

### 4.6 What the ladder deliberately does not know

No learned signal, no data-completeness, no geometry curve, no certified flag, no frame-technology preference, no quantity (E11: qty scales every candidate's price equally through `priceFn`, so it cannot reorder). Removing the learned model from the process changes no selection anywhere (AC-32) because the ladder's interface has no parameter to receive it.

---

## 5. Rebuilding the single-unit path (Phase 1)

### 5.1 `worker/lib/estimator/rules.ts` — energy becomes an objective

- **`checkEnergy` (rules.ts:90) is deleted as a filter.** No `energy` `FilterOutcome` is emitted any more (the `FilterName` union keeps the literal for reading persisted history). Its two real jobs move:
  - *variant eligibility by band* — abolished. Every published variant that satisfies the schedule's glazing instruction is a candidate configuration; the ladder tiers the ones that miss (that is D4, and it is what makes near-misses selectable per ops2 AC-3).
  - *certified determination* — already computed per exact variant in select.ts:331 (`variant.certified && variant.dataSource === "certified"`); stays there, feeding line status only.
- **`checkScheduleConfiguration` (rules.ts:189) is unchanged** — the glazing instruction stays a hard reject (spec A3, AC-11) and is now the sole source of `eligibleVariantIds`. The rules.ts:275 "no single variant meets both thermal and glazing" reconciliation block dies with `checkEnergy`.
- **`checkDimensions` (rules.ts:57) keeps its severities** — `warning` for out-of-range, `manual_review` for unknown size, `incomplete` for no rule — because the ops line-revalidation surface (`worker/routes/ops.ts:1641` `GET /lines/:id/configurations`) reads `rule.passed` to list sellable configurations for an existing line, and an oversize line must keep listing them (AD5). D3's hardness is applied by the *ladder* (tier X/E), not by re-severing this filter. New export `fitFacts(opening, rule)` (extracted from the same `within()` logic) gives the builder structured `breached[]`/`limit` — one home for fit.
- **`effectiveThermalRequirements` (rules.ts:142) unchanged** (E14, AC-16: coercion to no band means requirement absent, so every fitting candidate is tier A). New thin export `resolvedRequirement(opening): ResolvedRequirement` wraps it with `basis` (from `thermalContext.requirementBasis`) and `absent`.
- **`RULE_VERSION`** bumps to `"v3-energy-objective"` (behaviour changed; runs must be attributable).
- `checkHardRules` (rules.ts:245) drops the energy branch and the energy-and-schedule intersection; the status aggregation keeps its shape (the `energyHadRequirement && !certified` downgrade to `commercial_only_estimate` at rules.ts:301 stays — it is line status, not ordering, AC-49's intended residue).

### 5.2 `worker/lib/estimator/select.ts` — evaluate, then decide

`selectForOpening` (select.ts:244) splits into two internal stages behind the same public interface (the seam callers see does not move):

```
evaluateCandidates(opening, repo, priceFn, restrict) -> Evaluation
  - query -> disabled filter -> offerability withhold (E3, unchanged, select.ts:263-289)
  - restrict.systems / glazingSlugs (unchanged, for composite segments)
  - checkHardRules per product; schedule-eligible variants; price every one
  - emits EvaluatedCandidate[] + withheldIncomplete + catalogueVersion

decide(opening, evaluation, splits: SplitCandidate[]) -> SelectionResult
  - resolvedRequirement(opening)
  - maps every evaluated/split candidate to a LadderCandidate
    (deviationOf per variant reading; fitFacts; excluded from reject-severity
     filters; lastResort stamping per section 4.4)
  - runLadder -> buildOutcomes (outcome.ts) -> status (section 5.6)
```

`selectForOpening = decide(evaluateCandidates(...), splits: [])` — Phase 1 always passes an empty split list; Phase 2's `selectWithSplits` passes real ones. Composite segments keep calling `selectForOpening` (they must never generate nested splits).

### 5.3 Reshaped result types (the interface consumers compile against)

```ts
export interface EvaluatedCandidate {
  candidate: CatalogueCandidate;
  outcome: RuleOutcome;                    // rules facts (name unchanged — 6 files read it)
  selectedVariant: PerformanceVariant | null;
  price: PriceSnapshot | null;
  candidateOutcome: CandidateOutcome;      // the contract verdict (replaces score/components/rank/selected)
}

export interface SelectionResult {
  openingRef: string | null;
  ruleVersion: string;
  selectionVersion: string;                // 'ladder-v1'; written to the ranker_version columns
  catalogueVersion: string;
  evaluated: EvaluatedCandidate[];         // single-unit rows
  splits: SplitCandidate[];                // [] until Phase 2
  selection: SelectionOutcome;             // the run-level contract (persisted as selection_json)
  selected: EvaluatedCandidate | null;     // the winner when a single unit won
  selectedSplit: SplitCandidate | null;    // the winner when a split won (Phase 2); never both
  status: SelectionOutcome["status"];
  withheldIncomplete: { slug: string; gaps: string[] }[];
}
```

Deleted from the old shapes: `score`, `components`, `rank`, `selected` booleans on `EvaluatedCandidate` (now inside `candidateOutcome`); `dominant`, `alternatives`, `rankerVersion` on `SelectionResult`. Every read site is listed in section 10 and section 12.

### 5.4 `worker/lib/estimator/outcome.ts` — the builder

`buildOutcomes` assembles one `CandidateOutcome` per evaluated/split candidate plus the `SelectionOutcome`:

- identity from the candidate (split: largest-area unit, AD6, plus `units[]`);
- `exclusions[]` from reject-severity filters, mapped to structured detail: operation becomes `{ requiredOperation, offered }`; glazing becomes `{ required: {doubleGlazed, lowE}, offeredClasses }`; publication becomes `{ schemaVersion }`; dimensions (non-fitting, non-last-resort) becomes `{ breached, limit }`; data-incomplete becomes constraint `offerability` with `{ gaps }`; unknown opening size becomes constraint `dimensions`, `{ sizeUnknown: true }` (AD13);
- `thermal` from `deviationOf` + the variant's figures + `dataSource`;
- `fit` from `fitFacts`;
- `price.deltaToSelected` computed against the winner in the fixed sign convention (A17), integer-cents arithmetic rendered back to the engine's unit;
- `learned: null` (Phase 1/2) or the shadow block (Phase 3, section 8.3);
- `SelectionOutcome` with `tolerance: REQUIREMENT_TOLERANCE` stamped (AC-4).

### 5.5 Deletions (Phase 1, all-or-nothing — AC-4's grep must come back empty)

| Deleted | Where | Why |
|---|---|---|
| `rank.ts` — entire file | `worker/lib/estimator/rank.ts` (173 lines: `RANK_WEIGHTS`:17, `geometryScore`:47, `configurationScore`:69, `variantCell`:78, `complianceScore`:89, `commercialScores`:105, `dataCompletenessScore`:123, `rankCandidates`:131, `selectWithConfidence`:167) | The weighted model, its curves, its min-max normalisation and its dominance threshold are the defect |
| `thermal/compliance.ts` — entire file | `FLOOR=0.1`, `SHGC_SPAN=0.2`, `UVALUE_SPAN=1.5`, `gradedComplianceScore` | D8 replaces span-normalised distance with requirement-relative deviation |
| `variantAffinityScore`, `scheduleAffinity`, `contextAffinity` | `worker/lib/estimator/configuration.ts`:255-285 | Consumed only by the deleted `configurationScore`. `eligiblePerformanceVariants`:290 stays |
| `aggregateHistorical`, `buildHistoricalModel`, `HistoricalModel`, the `historical` parameters | `worker/lib/estimator/learning.ts`:351-407; threaded through select.ts:249, compositeSelect.ts, estimate.ts:196 | Fed the deleted 0.10 historical weight. The thermal advisory model (`aggregateApprovedThermal`:430, `buildApprovedThermalModel`:469) is a different signal and **stays** (E14). Phase 3 adds the dark shadow model in its place |
| `RANKER_VERSION` | rank.ts:10 | Replaced by `SELECTION_VERSION`; the `selection_run.ranker_version` and `ai_proposal.ranker_version` columns keep their names and now carry `'ladder-v1'` |

`thermal/types.ts` and `thermal/precedence.ts` stay (`ThermalBand`/`coerceCoherent` are live in rules.ts and split scoring). `GlassCell`/`GlassPick` may become unused types — leave them; deleting types is not this feature's job.

### 5.6 Run status mapping (replaces select.ts:362-374)

| Condition | `status` |
|---|---|
| A winner exists | the winner's line status: tier `meets` with certified handling per rules.ts:301 gives `ready` or `commercial_only_estimate`; tiers `within_tolerance`/`misses`/`thermal_unknown`/`does_not_fit` give `commercial_only_estimate` (AC-9, spec 4.6) |
| No candidates at all and some withheld | `catalogue_data_incomplete` (E3) |
| No candidates at all, none withheld | `no_candidate` |
| Candidates exist, opening size unknown | `needs_manual_review` (E7; candidates persisted per AD13) |
| Candidates exist, **all** failed hard constraints | `no_candidate` (AC-7 — redefinition noted in the header) |
| Survivors exist, none priceable | `catalogue_data_incomplete` (E9) |

---

## 6. Rebuilding the composite path on the same ladder (Phase 1)

Grill consequence 2 and AC-50: one comparator, zero independent weights.

### 6.1 `worker/lib/estimator/compositeRank.ts` becomes make-up *facts*, no scores

The file keeps its path (limits churn) and becomes a facts module:

- **Keep:** `ScoredUnit`:34 (shape unchanged), `area`:49, `areaWeightedMean`:55, `glassOf`:186 (re-implemented without `variantCell` as `variant.glazingOptionSlug ?? variant.variantId`).
- **Add:** `makeUpDeviation(opening, units, resolvedReq): Deviation` — the split-scoring rule of spec 4.7: when any unit has `ownBand`, area-weighted mean of each unit's own `deviationOf` scalar (unknown in any unit makes the whole unknown); otherwise `deviationOf(req, averagedCell)` using the retained `compositeAveragedUw`/`compositeAveragedShgc` (split.ts:538/547).
- **Delete:** `compositeCompliance`:76, `technologyAgreement`:116 (AD4 — the "prefer same technology" tie-break has no channel in a cheapest-wins ladder; the learned layer is its future home per D9's pattern), `scoreComposite`:143, `commercialScores`:178 (the second min-max), `CompositeScore`.

### 6.2 `worker/lib/estimator/compositeSelect.ts` — enumerate, then run the same ladder

`selectForComposite`:122 is refactored into:

```
enumerateMakeUps(opening, segments, repo, priceFn) -> MakeUp[]
  - the existing covering-systems loop (compositeSelect.ts:145-200) verbatim:
    coveringSystems cap 12, glass trials cap 3, the seed-not-competitor rule
    (:179-199), sourceFor/selectAll/isBuildableTogether joints — all unchanged.
    Each inner per-segment selection already runs the NEW selectForOpening,
    which is AC-50's first half: a segment prefers P over Q exactly as the
    same opening standalone would.

selectForComposite(...) = choose(enumerateMakeUps(...))
  - choose() maps each MakeUp to a LadderCandidate:
      fits: every unit's selection fits (a make-up containing a last-resort
            unit is fits:false)
      deviation: makeUpDeviation(...).scalar
      priceCents: sum of unit totals in cents; null when any unit unpriced
      splitKey: system + glass + unit slugs, joined
    and picks rank 1 via runLadder — the SAME comparator (AC-50's second
    half; the module declares no weight set, which the contract test greps).
  - the mixed-systems fallback (:353) and its `composite` warning are unchanged.
```

`CompositeSelectionResult`:84 drops `score`/`components`, gains `deviation: number | null` and `totalCents: number | null` (facts a reviewer and Phase 2 both need). The `historical` parameter disappears (section 5.5).

Behavioural note recorded for acceptance: with `technologyAgreement` gone, a mixed-technology single-system make-up is no longer nudged below a same-technology dearer one — cheapest wins (AD4, owner may veto).

---

## 7. Splits become candidates (Phase 2 — D7, the structurally hardest change)

### 7.1 The shape of the change

Today (`worker/lib/estimator/estimate.ts`): `runProjectEstimate`:161 selects a single unit per opening (:241), publishes the proposal, and only then `materialiseSplits`:287 reworks hint/oversize lines through `proposeSplit` + `selectForComposite` + `splitLine`. The pick a split replaces was already made — D7 forbids exactly that.

Target: split candidates are generated **during candidate generation** and enter the same `runLadder` as the single units. `materialiseSplits` shrinks to a materialisation step for a split that *won*.

### 7.2 New module `worker/lib/estimator/splitCandidates.ts`

```ts
export interface SplitCandidate {
  system: string;
  glazingSlug: string | null;
  units: CompositeUnit[];             // per-segment SelectionResults (audit-complete)
  segments: ProposedSegment[];        // the geometry, for materialisation
  proposalBasis: SplitProposal["basis"];
  deviation: Deviation;               // makeUpDeviation output
  totalCents: number | null;
  candidateOutcome: CandidateOutcome; // stamped by decide()
}

export async function enumerateSplitCandidates(
  opening: OpeningInput & { externalRef?: string | null },
  hint: SplitHint | null,
  ctx: { repo: CatalogueRepository; priceFn: PriceFn;
         parentMaxWidthMm: number | null; pairing: PairingOpts | null },
): Promise<SplitCandidate[]>;

export async function selectWithSplits(
  opening, hint, ctx,
): Promise<SelectionResult>;   // = decide(evaluateCandidates(...), enumerate...(...) when eligible)
```

- **Generation condition (AC-17/18/19):** split candidates are enumerated **iff** `hint != null` **or** no single-unit candidate fits (computed from the evaluation's `fitFacts`, before any ladder runs). No other trigger exists, so a thermal miss can never conjure a split (AC-18 asserts the absence).
- **Geometry** comes from the existing precedence chain unchanged: `proposeSplit` (split.ts:426 — comment, then family pairing, then even default), including the pairing/offset plumbing currently assembled in estimate.ts:309-343, which moves into `enumerateSplitCandidates`' caller wiring.
- **Make-ups** come from `enumerateMakeUps` (section 6.2) over the proposed segments — the same segment preparation estimate.ts:396-429 does today (operation resolution, per-unit requirement mapping from report components, `ownBand`), extracted into this module.
- **Every complete make-up becomes one `SplitCandidate`** (bounded by 12 systems x 3 glass trials + seeds; typically a handful). Incomplete make-ups (a hole in a unit) never existed as candidates and are not persisted.
- **Scoring (AC-20):** `totalCents` = sum of unit totals; `deviation` = `makeUpDeviation` (averaged cell vs the opening's band, or ownBand-weighted). `fits` per section 6.2.
- **Tier E interaction:** the last-resort promotion (section 4.4) applies only when no single fits **and** `enumerateSplitCandidates` returned zero complete make-ups (the "beyond the split cap / nothing composable" case, E12).

### 7.3 `estimate.ts` rewiring

```
for each opening:
  hint = opts.splitHints.get(externalRef)         // moved BEFORE selection
  result = await selectWithSplits(opening, hint, ctx)
  persistSelection(env, { projectId, openingId, result })
publishAiProposal(env, { lines })                  // parent line per opening (7.4)
for each line whose result.selectedSplit is set:
  materialiseSelectedSplit(env, line)              // splitLine with the WINNING make-up
```

`materialiseSelectedSplit` is the surviving rump of `materialiseSplits`:287 — it builds `SegmentSpec[]` from the winning `SplitCandidate` (the estimate.ts:453-511 spec-building block, including `configurationSnapshot` with `frameSystem`, moves here largely intact), calls `splitLine` (`worker/lib/composite.ts`) with `origin: 'ai'`, and keeps both failure paths verbatim: a refused split writes the technical-review warning (estimate.ts:515-534) and the line stays the single-unit parent — which is now honestly ranked, because the losing single-unit candidates were persisted alongside the split.
Openings with a hint whose split candidates all **lost** to a single unit materialise nothing — the losing make-ups stay persisted candidates (E15: a product appearing in both forms is two rows, no deduplication).

### 7.4 The parent line when a split wins (AD7)

`publishAiProposal` needs one product per proposal line. When `selectedSplit` is set, the proposal line is seeded from the **parent representative** — the best single-unit candidate in the same ranked order (in the no-fit case, the tier-E last resort; there is always one when the operation exists at all). This is byte-for-byte today's write path (parent line, then `splitLine` converts it), so E2's lifecycle guarantees (draft-only writes, `origin='ai'` scope, edited-line locks at proposal.ts:239-243) are inherited rather than re-proven. The `candidate_result` rows tell the truth regardless: `selected: true` sits on the split row (AC-22 applies to candidate rows, not the proposal seed). A helper `parentRepresentative(result: SelectionResult): EvaluatedCandidate | null` lives in select.ts.

### 7.5 Persisting split candidates (AD6)

Each `SplitCandidate` writes one `candidate_result` row: `sanity_product_id`/`selected_variant_id` = the largest-area unit's identity (columns are NOT NULL; the migration adds nothing for this), `price_snapshot_json` = `{ ok, total, currency: "AUD", composed: true, unitTotals: [...] }`, `outcome_json` = the authoritative split description (`form: 'split'`, `units[]`). `hard_rule_passed` = 1 (a make-up exists only if every unit passed within its system). Rationale: ops2 reads `outcome_json`; the legacy columns only need to not lie.

---

## 8. The learned layer, dark (Phase 3 — D11, D12, D13, D18)

### 8.1 Capture (`worker/lib/ai/outcomes.ts`) — recording widened, point unchanged

`captureRecommendationOutcomes`:44 keeps its call site (`worker/lib/issue.ts`:46 via the learning outbox — AC-33; **no change to issue.ts**) and its row shape, with three additions:

- `context_json` gains `widthMm`, `heightMm`, `thermalRequired` (0/1, from the opening's resolved requirement) alongside everything it writes today — additive only, all twelve existing fields untouched (AC-27; AD9). Without this the retrieval key is not recomputable from `context_json` alone (AC-30), because width currently exists only inside the legacy `context_key` bucketing.
- `retrieval_key` + `retrieval_key_version` computed and written per row (AC-30).
- `provenance` defaults to `'in_platform'` (column default; the INSERT names it explicitly for self-documentation).

### 8.2 The retrieval key (`worker/lib/estimator/learning.ts`)

```ts
export const RETRIEVAL_KEY_VERSION = "rk-v1";

/** Four enumerated categorical values, joined with '|'. No free text can
 *  traverse (AC-56): operation must match /^[a-z][a-z-]{0,23}$/ else 'other';
 *  basis must be one of the five enumerated values else 'none';
 *  band in {s,m,l,unknown}; thermal in {'1','0'}. */
export function retrievalKey(ctx: {
  operationType?: string | null;
  requirementBasis?: string | null;
  widthMm?: number | null;
  thermalRequired?: boolean | number | null;
}): string;
// sizeBand: <1800 's'; 1800-3000 'm'; >3000 'l'; null/NaN 'unknown'  (A8)
```

`contextKey`:333 (the twelve-field key) **keeps being written** to the NOT NULL `context_key` column — recording is untouched (D12). `family` is deliberately absent from the retrieval key (it is a function of operation via `operationForFamily`, spec A8).

A later redefinition of the coarsening is: bump `RETRIEVAL_KEY_VERSION`, `SELECT id, context_json FROM recommendation_outcome`, recompute, `UPDATE`. The version column makes mixed-version corpora detectable; no recompute script ships now (nothing to recompute).

### 8.3 The shadow model (`worker/lib/estimator/learning.ts`, replacing the deleted commercial model)

```ts
export const SHADOW_MIN_OBSERVATIONS = 5;   // density floor (A10); a learned-layer
                                            // constant, not a ladder constant (AC-4 safe)

export interface ShadowLearnedModel {
  version: string;                          // RETRIEVAL_KEY_VERSION
  lookup(opening: OpeningInput): {
    retrievalKey: string;
    observations: number;
    provenance: { inPlatform: number; backfilled: number };
    supportFor(productSlug: string): number;
    preferredSlug: string | null;           // null below the floor (AC-31)
  };
}

export function aggregateShadow(rows: ShadowRow[]): ShadowLearnedModel;  // pure, tested
export async function buildShadowModel(env: Env): Promise<ShadowLearnedModel>;
// SELECT retrieval_key, final_product_slug, provenance
//   FROM recommendation_outcome
//  WHERE recommendation_eligible = 1 AND quality_state = 'approved'
//    AND retrieval_key IS NOT NULL
```

Wiring: `runProjectEstimate` builds it once per run and hands it to `decide()` **only as a builder input** — `outcome.ts` stamps each candidate's `learned` block (`wouldPrefer: slug === preferredSlug && observations >= 5`, `applied: false`, provenance split per AC-35). The ladder's interface cannot receive it (AC-32 by construction; the dark test also removes the model and asserts identical selections).

### 8.4 The backfill ingest route (D18, A14; AD12)

- **Route:** `POST /api/ops/recommendation-outcomes/backfill` in `worker/routes/ops.ts` (beside the PATCH at ops.ts:1689), thin: staff auth, JSON parse, delegate.
- **Logic:** `captureBackfilledOutcomes(env, args)` in `worker/lib/ai/outcomes.ts`. Input per line: `{ projectId, quoteLineId?, externalRef, context: { operationType, family, requirementBasis, widthMm, heightMm, thermalRequired, ...optional twelve-field values }, finalProductSlug, finalVariantId?, finalConfig, finalLineTotal }`. Validation: project exists; `finalProductSlug` resolves in the catalogue; context values type-checked against the enumerations (free text refused — the same normaliser as `retrievalKey`). Writes rows with `provenance: 'backfilled'`, `decision: 'adjusted'`, `reason_code: 'BACKFILLED_HISTORY'`, `recommendation_eligible: 1`, `quality_state: 'approved'`, `retrieval_key` computed (AC-34).
- The data-entry itself (which plans, which manufactured products) is owner/ops activity, not code (spec A14).

### 8.5 The corpus reset (D18, AC-36, AC-58; AD10)

A scoped statement inside migration 0056 (section 9): `DELETE FROM recommendation_outcome WHERE recommendation_eligible = 1 AND quality_state = 'approved'` — exactly the rows `buildHistoricalModel` read (the production 9). `pending`/`rejected` rows are **immutable audit records** and are retained. Nothing references `recommendation_outcome` (grep over `migrations/` confirms zero `REFERENCES recommendation_outcome`), so the delete can cascade nothing (AC-58). The remote apply follows the d1-migration-safety procedure: export first (`npx wrangler d1 export apertly-db --remote --output backup-<date>-0056.sql`), `SELECT COUNT(*)` on `recommendation_outcome` before/after (expected delta: -9), counts on `order_line`/`payment`/`quote_line` unchanged.

---

## 9. Migration plan (d1-migration-safety loaded; ADD COLUMN only)

Highest existing migration at design time: `migrations/0054_trade_verification.sql`. **Numbering is claimed at authoring** — the developer re-checks `ls migrations/ | sort | tail -1` and renumbers if anything landed in between.

### 9.1 `migrations/0055_recommendation_outcome_columns.sql` (Phase 1)

```sql
-- Additive only. NO table is rebuilt: candidate_result is referenced by
-- draft_order_line.selected_candidate_id ... ON DELETE SET NULL
-- (migrations/0014_estimator_platform.sql:119) — a rebuild would silently null
-- every draft line's candidate link. Migration 0022 is the ADD COLUMN precedent
-- on these exact tables.
-- children affected: none (ADD COLUMN fires no cascade).
ALTER TABLE candidate_result ADD COLUMN outcome_json TEXT;
ALTER TABLE selection_run   ADD COLUMN selection_json TEXT;
```

Cascade audit for the tables touched: `candidate_result` is referenced by `draft_order_line.selected_candidate_id` (SET NULL, 0014:119); `selection_run` is referenced by `candidate_result.selection_run_id` (CASCADE, 0014:98); the third referencer (0014:141, `review_feedback`) was dropped by 0030. ADD COLUMN touches no rows, fires nothing. `score_components_json` and `score` **stay in the schema** and stop being written (AC-24, AC-25).

### 9.2 `migrations/0056_learning_retrieval_and_provenance.sql` (Phase 3)

```sql
-- Additive columns + one scoped DELETE. recommendation_outcome has NO child
-- referencers (grep: zero `REFERENCES recommendation_outcome` in migrations/),
-- so the DELETE cannot cascade (spec AC-58).
-- children affected: none. expected remote row effect: -9 recommendation_outcome
-- rows (the pre-provenance learning corpus, D18) — EXPORT FIRST on remote apply.
ALTER TABLE recommendation_outcome ADD COLUMN retrieval_key TEXT;
ALTER TABLE recommendation_outcome ADD COLUMN retrieval_key_version TEXT;
ALTER TABLE recommendation_outcome ADD COLUMN provenance TEXT NOT NULL DEFAULT 'in_platform'
  CHECK (provenance IN ('in_platform','backfilled'));
CREATE INDEX idx_recommendation_outcome_retrieval
  ON recommendation_outcome(recommendation_eligible, quality_state, retrieval_key);
DELETE FROM recommendation_outcome
 WHERE recommendation_eligible = 1 AND quality_state = 'approved';
```

(SQLite permits CHECK and NOT NULL-with-default on ADD COLUMN; the default satisfies both.) After 0056, no row predates the provenance column with an unset provenance (AC-36's tail) because the corpus rows are gone and every surviving audit row carries the default.

### 9.3 Remote apply protocol (both migrations)

Per the skill: export before apply; before/after counts on `candidate_result`, `draft_order_line`, `selection_run`, `recommendation_outcome`, `order_line`, `payment`; any unexpected delta = stop and restore. Local verification seeds child rows first (`scripts/db/seed.sql`) so the FK paths are exercised, not vacuously green. Production deploys keep needing the owner's explicit confirmation per the deploy protocol.

---

## 10. Consumers of the deleted `dominant` and score (Phase 1)

### 10.1 `worker/lib/estimator/persist.ts` (`persistSelection`:331)

| Column | Old (persist.ts line) | New |
|---|---|---|
| `selection_run.ranker_version` (:42) | `RANKER_VERSION` | `result.selectionVersion` (`'ladder-v1'`) |
| `selection_run.selection_json` | — | `JSON.stringify(result.selection)` |
| `candidate_result.score` (:356) | weighted score | bound `null` (AC-25) |
| `candidate_result.score_components_json` (:357) | components | bound `null` (AC-25) |
| `candidate_result.rank` / `selected` (:359) | ranker's | `candidateOutcome.rank` / `candidateOutcome.selected` |
| `candidate_result.outcome_json` | — | `JSON.stringify(candidateOutcome)` (one row per evaluated **and** per split candidate, Phase 2) |
| `candidate_result.reason_codes` (:358) | prose reasons | keep writing the filter-reason strings — this legacy column is prose-tolerant and pre-existing; the contract lives in `outcome_json` |
| `draft_order_line.warnings_json` (:384) | `dominant ? [] : ["close_alternatives"]` | tier-derived tokens: `meets` → `[]`; `within_tolerance` → `["requirement_not_met"]`; `misses` → `["requirement_missed_beyond_tolerance"]`; `thermal_unknown` → `["no_thermal_data"]`; `does_not_fit` → `["does_not_fit"]` (spec 4.11) |
| `draft_order_line.confidence` (:386) | score | bound `null` (spec A12) |
| `draft_order_line.selected_candidate_id` (:347) | selected single's row id | the winner's row id — split or single (Phase 2) |

### 10.2 `worker/lib/ai/proposal.ts`

Let `tier = line.result.selection.competingTier`, `met = tier === "meets"`, `status = winner's outcome status`.

| Read site | Old | New |
|---|---|---|
| `confidence` (:244) | `status==='ready' && dominant → high; unavailable → low; else medium` | `high` when `met && status === 'ready'`; `low` when `tier` in `{misses, thermal_unknown, does_not_fit}` or `status === 'unavailable'`; `medium` otherwise (spec 4.11, AC-26) |
| `reviewRequired` (:323) | `!(dominant && ready) || scheduleCommercialOption || documentReviewReasons` | `!(met && status === 'ready')` OR the winner does not fit OR every existing reason unchanged (schedule commercial option, document review reasons) |
| `alternatives_json` (:341) | `JSON.stringify(line.result.alternatives)` | `JSON.stringify([])` — zero readers exist (grep: only the two INSERT sites); the candidate set lives in `candidate_result.outcome_json` (AD8) |
| `ranker_version` (:53/:95) | `result.rankerVersion` | `result.selectionVersion` |
| `ProposalSelection.result` | old `SelectionResult` | new shape; `chosen = line.result.selected ?? parentRepresentative(line.result)` (Phase 2) |

### 10.3 `worker/lib/estimator/estimate.ts`

- `runProjectEstimate`:196 drops `buildHistoricalModel` (kept: `buildApprovedThermalModel`); Phase 3 adds `buildShadowModel`.
- The summary lines (:251-257) read `result.selected?.outcome.status` — unchanged field names.
- Phase 1: `materialiseSplits`'s oversize trigger (:302, reads the `dimensions`/`warning` filter) re-keys onto `parent.candidateOutcome.fit.fits === false` — the filter it read still exists, but the outcome fact is the authoritative one.
- Phase 2: rewired per section 7.3.

### 10.4 Untouched consumers (verified, no change)

`worker/routes/files.ts:235` (AI job scheduled only by upload — D5/AC-42); `worker/lib/ai/proposal.ts:413` delete scope (E2); `worker/routes/ops.ts:1625` estimate support lever (staff-gated, returns the summary only); `worker/routes/ops.ts:1689` outcome adjudication PATCH; `worker/routes/parse.ts:211` cascade path; `worker/lib/issue.ts:46` capture point.

---

## 11. The anonymous matcher (Phase 4 — D6)

`src/data/scheduleMatch.ts` stays pure, synchronous and dependency-light; pricing stays in its one home via injection (spec A13).

```ts
export type SchedulePriceLookup = (product: Product, widthMm: number, heightMm: number) => number | null;

export function matchSchedule(rows: RawScheduleRow[], opts?: { priceOf?: SchedulePriceLookup }): ParsedLine[];
```

- `pickProduct`:102 gains `priceOf`: among `fitting`, pick min `priceOf(p, w, h)` (ties, and any product priced `null`, fall back to the series-bias order so the pick stays total and deterministic — AD11). `priceOf` absent ⇒ exactly today's bias order (AC-39: existing schedule tests pass unchanged). A price ≤ 0 or null is unpriceable and never "cheapest" (mirrors A6).
- The nothing-fits branch (:110-111, largest capacity + `fits:false`) and the no-dimensions branch (:113) are untouched (AC-40).
- **Memoisation (AC-41):** `pickProduct` results memoised per `(familySlug, section, w, h)` inside one `matchSchedule` call, so price computations are bounded by distinct (family, size) combinations, not rows × products.
- **Worker injection** (`worker/lib/parse.ts:188`): build `const priceOf = await createCachedPriceResolver(env, null)` once per parse job (the resolver is synchronous after construction — `worker/lib/estimator/pricing.ts:392`), then `matchSchedule(extract.rows, { priceOf: (p, w, h) => { const s = priceFromCache({ family: p.slug, widthMm: w, heightMm: h, qty: 1, optionSlugs: [] }); return s.ok && s.total > 0 ? s.total : null; } })`. Anonymous callers get no discount input — the resolver is built with a null user (AD11 covers the base-rate comparison basis).
- **Client call** (`src/app/App.tsx:618` sample render) passes no pricer — bias fallback, zero behaviour change, no new client bundle weight.

`WINDOW_SERIES_BIAS`:70 / `DOOR_SERIES_BIAS`:71 remain as the deterministic fallback and tiebreak — they stop being the *decision* and become the *tiebreak*, which removes the contradiction with `docs/product-compatibility-design.md` §1.1 without inventing a second pricing home.

---

## 12. File-by-file hand-off index

Read this as the work order; every path was verified this session. "P1/2/3/4" = phase.

### Created

| P | File | Contents |
|---|---|---|
| 1 | `src/data/recommendation.ts` | The contract (section 3): `Tier`, `TIER_ORDER`, `tierRank`, `RequirementBasis`, `ExclusionConstraint`, `CandidateOutcome`, `SelectionOutcome`. Zero imports. |
| 1 | `worker/lib/estimator/ladder.ts` | Section 4 verbatim: `REQUIREMENT_TOLERANCE`, `SELECTION_VERSION`, `deviationOf`, `LadderCandidate`, `TieredCandidate`, `assignTiers`, `compareCandidates`, `runLadder`. Pure. |
| 1 | `worker/lib/estimator/outcome.ts` | `buildOutcomes` (section 5.4). |
| 1 | `migrations/0055_recommendation_outcome_columns.sql` | Section 9.1. Renumber at authoring if needed. |
| 1 | `docs/adr/0007-recommendation-filter-then-ladder.md` | Section 1.3 text. |
| 1 | `scripts/tests/recommendation-ladder.test.mjs` | New pure suite (section 14). |
| 1 | `scripts/tests/recommendation-contract.test.mjs` | New pure suite (section 14). |
| 2 | `worker/lib/estimator/splitCandidates.ts` | Section 7.2: `SplitCandidate`, `enumerateSplitCandidates`, `selectWithSplits`. |
| 3 | `migrations/0056_learning_retrieval_and_provenance.sql` | Section 9.2. Renumber at authoring. |

### Modified

| P | File | Where / what |
|---|---|---|
| 1 | `worker/lib/estimator/rules.ts` | delete `checkEnergy`:90-133 and its intersection block :263-285; keep `checkScheduleConfiguration`:189 as sole `eligibleVariantIds` source; extract `fitFacts` from `checkDimensions`:57; add `resolvedRequirement`; bump `RULE_VERSION`:17 |
| 1 | `worker/lib/estimator/select.ts` | split `selectForOpening`:244 into evaluate/decide; reshape `EvaluatedCandidate`:194 and `SelectionResult`:206 (section 5.3); status mapping :362-374 → section 5.6; drop rank imports :10; add `parentRepresentative` |
| 1 | `worker/lib/estimator/configuration.ts` | delete :248-285 (`variantAffinityScore` + helpers); keep `eligiblePerformanceVariants`:290 |
| 1 | `worker/lib/estimator/compositeRank.ts` | section 6.1: keep `ScoredUnit`/`area`/`areaWeightedMean`/`glassOf`; add `makeUpDeviation`; delete the four score functions |
| 1 | `worker/lib/estimator/compositeSelect.ts` | section 6.2: extract `enumerateMakeUps` from :145-200; choose via `runLadder` (replacing :211-217); `CompositeSelectionResult`:84 reshaped; drop `historical` params |
| 1 | `worker/lib/estimator/learning.ts` | delete :351-407 (commercial model); keep `contextKey`:333 and the thermal model :409-477 |
| 1 | `worker/lib/estimator/persist.ts` | table in section 10.1; `persistSelection`:331 |
| 1 | `worker/lib/estimator/estimate.ts` | :196 drop historical; :302 re-key oversize trigger onto `candidateOutcome.fit` |
| 1 | `worker/lib/ai/proposal.ts` | :53, :95, :244, :323, :341 per section 10.2 |
| 1 | `package.json` | `test:pure`:17 gains the two new suites; add `"test:ladder": "node --test scripts/tests/recommendation-ladder.test.mjs scripts/tests/recommendation-contract.test.mjs"` |
| 1 | `CONTEXT.md` | section 1.1 + 1.2 (Phase-1 entries) |
| 1 | tests | `estimator-recommendation.test.mjs` (rewrite), `estimator-rules.test.mjs` (bundle header drops rank/compliance exports; energy-filter cases), `thermal-selection.test.mjs` (deviation, coercion), `composite.test.mjs`, `composite-select.test.mjs`, `estimator-derive.test.mjs`, `ai-pipeline.test.mjs`, `scripts/tests/api.test.mjs` (schema assertions) |
| 2 | `worker/lib/estimator/estimate.ts` | section 7.3: selection via `selectWithSplits`; `materialiseSplits`:287 reduced to `materialiseSelectedSplit` (spec-building block :453-511 moves largely intact) |
| 2 | `worker/lib/estimator/persist.ts` | write split candidate rows (section 7.5); `selected_candidate_id` may point at a split row |
| 2 | `worker/lib/ai/proposal.ts` | seed from `parentRepresentative` when a split won (section 7.4) |
| 2 | tests | `estimator-split.test.mjs` (extended), `composite-select.test.mjs`, `ai-pipeline.test.mjs` |
| 3 | `worker/lib/estimator/learning.ts` | add `retrievalKey`, `RETRIEVAL_KEY_VERSION`, `SHADOW_MIN_OBSERVATIONS`, `aggregateShadow`, `buildShadowModel` (section 8.2/8.3) |
| 3 | `worker/lib/ai/outcomes.ts` | `captureRecommendationOutcomes`:44 additions (section 8.1); new `captureBackfilledOutcomes` (section 8.4) |
| 3 | `worker/routes/ops.ts` | new backfill route beside :1689; thin |
| 3 | `worker/lib/estimator/estimate.ts` + `outcome.ts` | shadow model wiring; `learned` block stamped |
| 3 | `CONTEXT.md` | section 1.2 Phase-3 entries |
| 3 | tests | `estimator-learning.test.mjs` (rewrite), `api.test.mjs` (backfill auth + row shape), `recommendation-contract.test.mjs` (0056 lint) |
| 4 | `src/data/scheduleMatch.ts` | `pickProduct`:102 + `matchSchedule`:160 per section 11 |
| 4 | `worker/lib/parse.ts` | :188 inject the pricer |
| 4 | tests | `schedule.test.mjs` (AC-37..41), `ai-jobs.test.mjs` (AC-42 negative) |

### Deleted

| P | File | Reason |
|---|---|---|
| 1 | `worker/lib/estimator/rank.ts` | the weighted model and all six components, `selectWithConfidence`, `RANK_WEIGHTS` — the defect itself |
| 1 | `worker/lib/estimator/thermal/compliance.ts` | `FLOOR`, `SHGC_SPAN`, `UVALUE_SPAN`, `gradedComplianceScore` — replaced by requirement-relative deviation |

Import sites of the deleted files, all accounted for: `select.ts:10`, `compositeRank.ts:23-27`, `compositeSelect.ts:55`, `configuration.ts` (internal), `scripts/tests/estimator-rules.test.mjs` (bundle header), `scripts/tests/thermal-selection.test.mjs`.

---

## 13. Sequencing and phasing verdict

**The spec's four phases are validated as-is** (spec section 8, A16): each is independently deployable, each runs the full implement → test → review loop, phase 4 shares no code with 1–3 and may ship first. Two amendments of emphasis, not order:

1. **Phase 1 is the big-bang phase by necessity** — the ladder, the composite rebuild, the contract, the migration and the `dominant` consumers are one atomic behaviour change (a half-deleted ranker cannot ship). Its deployable outcome: selections are correct on price and thermal for single units; splits still arrive by post-pass, but the pass is now triggered by honest fit facts and selects by the same comparator.
2. **Phase order within Phase 1** (the developer builds in this order, test-first at each step):
   1. `src/data/recommendation.ts` + `worker/lib/estimator/ladder.ts` + `recommendation-ladder.test.mjs` (red → green; the pure core proves AC-2/3/5/13-15/43-48/51/52 before anything is wired).
   2. `rules.ts` changes + `estimator-rules.test.mjs` updates.
   3. `select.ts` evaluate/decide + `outcome.ts` + `estimator-recommendation.test.mjs` rewrite + `recommendation-contract.test.mjs`.
   4. Migration 0055 + `persist.ts` + `api.test.mjs` schema assertions.
   5. Consumers (`proposal.ts`, `estimate.ts`) + `ai-pipeline.test.mjs`.
   6. Composite rebuild + `composite-select.test.mjs` / `composite.test.mjs`.
   7. Deletions last (`rank.ts`, `compliance.ts`, learning model, affinity) — the AC-4 source-scan test goes green here.
   8. `CONTEXT.md` + ADR 0007 + package.json wiring; full `npm test` + `typecheck:gate`.
3. Phases 2 and 3 are genuinely independent of each other (2 touches generation/materialisation; 3 touches capture/retrieval) but ship in spec order — 2 before 3 — so the shadow block lands on a candidate set that already contains splits.

---

## 14. Test plan — every artifact named; the developer is held to producing every one

All node:test, esbuild-bundled per the `estimator-rules.test.mjs` header pattern. **No Playwright artifact is required: this feature adds and changes no UI** (spec section 8); if any phase turns out to touch a rendered surface, that phase acquires a `scripts/tests/web/` spec before it can pass.

### New files

**`scripts/tests/recommendation-ladder.test.mjs`** (P1; wired into `test:pure` and the new `test:ladder` script) — pure ladder/deviation/comparator, fixture-only, no repository:
- AC-2 (band arithmetic: best=0.05, band ≤0.10, $900/4.4 wins), AC-3 (never empty), AC-5 (two input orders → identical total order), AC-13/14/15 (deviation math + commensurability + worst axis), AC-43/51 (price beats geometry — geometry cannot even be expressed), AC-44 (meets beats cheaper miss, delta −500), AC-45/47 (irrelevant-alternative immunity), AC-46 (pairwise: assert `compareCandidates(a,b)` unchanged under third-candidate add/remove/reprice), AC-48 (band tightening stated as intended), AC-52 + A6 (unpriceable never wins, sorts last), E10 (equal prices → slug/variant tiebreak), E11 (qty scaling cannot reorder), tier-D ordering (unknown below every measurable deviation), AD2/AD3 edge tests (competing tier skips an all-unpriceable tier; unpriceable best still anchors the band).

**`scripts/tests/recommendation-contract.test.mjs`** (P1, extended P3; wired into `test:pure`) — the contract and the deletions:
- AC-21: build outcomes from a hostile fixture (schedule comments carrying an address and a client name) and assert no string field in any `outcome_json` contains whitespace-separated prose or any comment substring — also the executable half of AC-54/AC-56's posture.
- AC-4: source scan over `worker/` and `src/` asserting `RANK_WEIGHTS`, `geometryScore`, `configurationScore`, `dataCompletenessScore`, `selectWithConfidence`, `gradedComplianceScore`, `SHGC_SPAN`, `UVALUE_SPAN` and a bare `FLOOR` constant appear nowhere; `REQUIREMENT_TOLERANCE` defined exactly once.
- AC-23: esbuild metafile over `src/data/recommendation.ts` + `worker/lib/estimator/ladder.ts` + `worker/lib/estimator/outcome.ts`, asserting no import from `react-router*`, `@ionic/*`, `@radix-ui/*`, `lucide-react`, any `.css`, any store, any fetch client.
- A17: `deltaToSelected` sign convention; tolerance stamped in `selection` (AC-4's stamp half).
- Migration lint (static halves of AC-24/AC-58): `migrations/0055*`/`0056*` contain no `DROP TABLE`, no `CREATE TABLE ... _new`, no `RENAME`; 0056's `DELETE` carries the exact `recommendation_eligible = 1 AND quality_state = 'approved'` scope.

### Rewritten / extended files (per phase)

| Artifact | Phase | Owns |
|---|---|---|
| `scripts/tests/estimator-recommendation.test.mjs` (rewrite) | 1 | AC-1, AC-6, AC-7 (`no_candidate` + persisted exclusions), AC-9, AC-10, AC-11, AC-12, AC-16, AC-22, AC-49 (dataSource inversion → identical order, status may differ), E3, E5, E8, E9; integration halves of AC-43/51 through `selectForOpening` over the fixture catalogue |
| `scripts/tests/estimator-rules.test.mjs` (update) | 1 | energy filter no longer emitted; glazing reject intact (AC-11's rules half); `fitFacts`; E7 unknown-size manual_review; bundle header drops `rankCandidates`/`selectWithConfidence`/`gradedComplianceScore` |
| `scripts/tests/thermal-selection.test.mjs` (update) | 1 | AC-16 coercion cases; deviation-vs-band unit cases replacing the graded-score pins |
| `scripts/tests/composite-select.test.mjs` (update) | 1, 2 | AC-50 (segment preference agreement + make-up choice via `runLadder`; source-scan: no weight set, no second comparator in the module); `enumerateMakeUps` extraction regression (seed rule, partner joints, category crossing preserved) |
| `scripts/tests/composite.test.mjs` (update) | 1, 2 | splitLine mechanics unchanged; AC-8's split-combinability half (mixed-system make-up never offered) |
| `scripts/tests/estimator-derive.test.mjs` (update) | 1 | any pins on deleted exports |
| `scripts/tests/ai-pipeline.test.mjs` (update) | 1, 2 | AC-26 (confidence_band/review_required matrix), warnings_json tokens, AC-25 (score/components NULL), AC-22 persistence columns; P2: winning-split materialisation, parent representative, losing-split non-materialisation |
| `scripts/tests/api.test.mjs` (update, heavy) | 1, 3 | AC-24 runtime half: after migrations, PRAGMA table_info shows `outcome_json` + `score_components_json` both present on `candidate_result`; insert selection_run/candidate_result/draft_order_line, delete nothing, FK intact; AC-53/AC-57: customer session and anonymous caller against `POST /api/ops/projects/:id/estimate` and the P3 backfill route → 403/401 with no candidate data; AC-55: JSON-scan customer project/estimate responses for `learned`, `outcome_json`, losing-candidate prices — absent; P3: backfill row shape (AC-34) |
| `scripts/tests/estimator-split.test.mjs` (extend) | 2 | AC-17 (splits in the ranked set, no post-pass rework), AC-18 (absence when a single fits and no hint), AC-19 (hint on a fitting opening competes), AC-20 (sum price + averaged-cell deviation), E12 (tier-E beyond the cap), E15 (both forms persisted) |
| `scripts/tests/estimator-learning.test.mjs` (rewrite) | 3 | AC-27 (twelve fields intact + additions), AC-28/29 (key equality/difference matrix), AC-30 (recompute from context_json), AC-31 (floor at 4 vs 5), AC-32 (dark: model present/absent → identical selection; `wouldPrefer` recorded), AC-33 (capture writes only via `captureRecommendationOutcomes` with a stub env), AC-34/35 (provenance recorded and aggregated), AC-56 (hostile context → enumerated key only) |
| `scripts/tests/schedule.test.mjs` (extend) | 4 | AC-37 (cheapest wins with pricer), AC-38 (fit still filters), AC-39 (no pricer → bias order, existing expectations untouched), AC-40 (nothing-fits branch), AC-41 (memoised call-count assertion) |
| `scripts/tests/ai-jobs.test.mjs` (extend) | 4 | AC-42: session creation schedules no AI job; only the upload-finalise path does |

### Operational evidence (not automatable in-repo; the tester records it)

AC-36/AC-58's production half: the pre-apply export file exists; `SELECT COUNT(*)` before/after shows −9 on `recommendation_outcome` and 0 delta on every other table (d1-migration-safety procedure, section 9.3).

---

## 15. Security

**Assessment: limited but real — carried, not waved.** No payout/bank data, no ABN, no session or upload logic is touched. The three genuinely sensitive surfaces, with the exact controls:

### 15.1 Data classification

| Data | Class | Where it now flows |
|---|---|---|
| Catalogue records | public | unchanged |
| Rate cards; per-candidate prices incl. losing candidates' prices | commercially sensitive | `candidate_result.outcome_json` (`price.total`, `deltaToSelected`) — staff-only surfaces, never any customer response |
| Opening dimensions, thermal requirements, schedule-derived facts | customer project data | `outcome_json`/`selection_json`, scoped to the owning project's rows; the builder writes enumerated facts only, never document text |
| Learning corpus (`recommendation_outcome`) | internal, cross-account by construction, no PII | read only in aggregate by `buildShadowModel`; aggregate = {product slug, counts, provenance counts}; no price, project id, account id or free text leaves the model |
| The learned shadow block | internal | exists only inside `outcome_json`; no customer endpoint reads that column (verified: zero readers of `candidate_result` outside `worker/lib/estimator/persist.ts` today — `grep` this session) |

### 15.2 Trust boundaries and what validates at each

- **Visitor ↔ Worker (Phase 4):** the injected pricer runs server-side in `parse.ts` with a null user (no discount data); the visitor receives matched lines and their own prices only — no candidate data exists on this path at all (`matchSchedule` produces `ParsedLine`s, not candidates).
- **Customer ↔ Worker:** no new or changed customer endpoint. The estimator writes to draft projects only (E2, unchanged guards at proposal.ts:182-188 and :364-371). No customer response gains a field in this design; AC-55 is enforced by the api-test JSON scan.
- **Ops ↔ Worker:** the estimate lever (`ops.ts:1625`) and the new backfill route both sit behind `resolveStaff` + `hasAssignedRole` — the established staff gate. Cross-account reads are legitimate on this side by role.
- **Worker ↔ Sanity/D1:** unchanged (read catalogue, read/write the four estimator tables).

### 15.3 Authorization model per endpoint (exact filters)

| Endpoint | Who | Scoping |
|---|---|---|
| `POST /api/ops/projects/:id/estimate` (existing, unchanged) | staff with an assigned role | `resolveStaff(c.env, c.req.raw)` + `hasAssignedRole(staff)` (ops.ts:1626-1628); project fetched by id with no owner filter — correct, staff act cross-account by role |
| `POST /api/ops/recommendation-outcomes/backfill` (new, P3) | staff with an assigned role | same two guards, then `SELECT id FROM project WHERE id = ?` must resolve (a backfill row must hang off a real project); every inserted row's `project_id` is that verified id — never a body-supplied free value used unverified |
| Customer/visitor access to any candidate data | nobody | no route serves `candidate_result`/`selection_run` columns; the ops2 derivation endpoint is a future ops-side addition on `design/ops2-planning` and inherits AC-53's rule (customer → 403 even for their own project); this design adds no read path |
| Learning corpus read (`buildShadowModel`) | worker-internal only | `WHERE recommendation_eligible = 1 AND quality_state = 'approved' AND retrieval_key IS NOT NULL` — quality-gated aggregate; the account-scoping question is answered by *what leaves*: slug + counts only, into an ops-only column |

### 15.4 Abuse cases → where each is executed

| Abuse | Control | Executed by |
|---|---|---|
| Customer pulls the ranked set (their own project or another's) | no serving route exists; ops routes 403 non-staff | AC-53 in `api.test.mjs` |
| Cross-account data smuggled through `outcome_json` | builder writes enumerated facts only; no cross-account input reaches it (its inputs are this opening + this catalogue + this price) | AC-54 in `recommendation-contract.test.mjs` (hostile fixture) |
| Learned block / losing prices reach a customer surface | column unread by customer routes; JSON scan | AC-55 in `api.test.mjs` |
| Customer document text becomes a cross-account queryable key | `retrievalKey` whitelists four enumerated values; backfill input validated by the same normaliser | AC-56 in `estimator-learning.test.mjs` |
| Anonymous caller hits selection endpoints | staff gates | AC-57 in `api.test.mjs` |
| Corpus reset cascades | zero FK referencers (grep evidence); scoped DELETE; export-first protocol | AC-58 static lint + operational record |
| Backfill used to poison the (dark) corpus | staff-only; enumerated context validation; provenance permanently marks the rows; the layer moves nothing (D11) — residual risk accepted and bounded by darkness | named residual risk |
| Rate-card shape inferred from `deltaToSelected` | staff-only surface (D15); same posture as the losing prices themselves | AC-53/55 |

Residual risks, named: (1) a future customer-facing "requirement met?" surface must be built against `selection_json`'s requirement block only, never `outcome_json` — recorded here so ops2/customer work inherits it; (2) backfilled corpus quality is an owner-process risk, not a code control, mitigated by provenance visibility (AC-35).

---

## 16. `ASSUMED:` register (architect's calls, for veto at acceptance)

Spec A1–A17 remain in force; these are the design-level additions.

| # | Assumption | Where | Why |
|---|---|---|---|
| AD1 | Ladder *logic* lives in `worker/lib/estimator/ladder.ts`; only the contract types + tier vocabulary enter `src/data/recommendation.ts` | section 2 | ADR 0006 admission rule 2: the functions have one consumer (the worker); the types have two (worker + ops2 skin) |
| AD2 | The competing set is the highest tier containing at least one **priceable** candidate; unpriceable candidates are always `competing: false` | section 4.1 | reconciles AC-3 with E9 and A6; a tier of $0-gap candidates must not black-hole selection |
| AD3 | `best` (the band anchor) is computed over all fitting candidates with a measurable deviation, priceable or not | section 4.1 | a rate-card gap must not move a thermal judgement; the spec's own words are "any fitting candidate" |
| AD4 | `technologyAgreement` (same-frame-technology preference) is deleted with the weights, unreplaced | section 6.1 | D10 leaves no preference channel; the owner's ruling was prefer-never-require, and D9 names the learned layer as the home for contextual preferences |
| AD5 | Fit hardness is applied by the ladder (tier X/E), not by re-severing `checkDimensions` | section 5.1 | the ops revalidation surface (`ops.ts:1641`) needs `passed` to stay true for oversize lines; two different questions, one fit-fact home |
| AD6 | Split candidate rows reuse `candidate_result`'s NOT NULL identity columns with the largest-area unit's product/variant; `outcome_json` is authoritative | section 7.5 | avoids a schema change for a display concern; ops2 reads `outcome_json` |
| AD7 | When a split wins, the proposal/quote parent line is seeded from the best single-unit candidate and immediately rebuilt by `splitLine` | section 7.4 | preserves today's parent-then-split write path and every E2 lifecycle guard without re-proving them |
| AD8 | `ai_proposal_line.alternatives_json` is written `[]` | section 10.2 | zero readers exist; the candidate set lives in `candidate_result.outcome_json` |
| AD9 | `context_json` gains `widthMm`, `heightMm`, `thermalRequired` at capture (additive; the twelve fields untouched) | section 8.1 | AC-30 requires the key recomputable from `context_json` alone, and width currently exists only in the legacy key's bucketing |
| AD10 | The corpus reset is a scoped `DELETE ... WHERE recommendation_eligible = 1 AND quality_state = 'approved'` inside migration 0056; pending/rejected audit rows are retained | section 8.5 | D18 targets the learning corpus; the other rows are immutable audit records the platform promised to keep |
| AD11 | The anonymous pick compares base rate-card totals (qty 1, no option surcharges, no account discount), with the series-bias order as tiebreak and all-null fallback | section 11 | consistent basis across candidates, cheap, deterministic; the indicative promise is unchanged |
| AD12 | The backfill ingest is `POST /api/ops/recommendation-outcomes/backfill`, staff-only, requiring an existing project | section 8.4 | D18's seeding flow runs real plans through the platform, so a project always exists; a route (not a script) keeps writes behind the staff gate. Slug-validation clause superseded by AD28 |
| AD13 | Unknown-dimension openings persist candidates as tier `excluded` with `detail: { sizeUnknown: true }`; run status stays `needs_manual_review` | section 5.4 | E7 says behaviour unchanged; the contract needs *some* verdict per row, and "not machine-selectable" is the truthful one |
| AD14 | Prices compare on `Math.round(total × 100)` integer cents; the outcome carries the engine's single price basis and no GST arithmetic enters the estimator | sections 2.2, 4.2 | E1; `computePrice` (pricing.ts:153-268) applies no GST — display GST stays in its one home |
| AD15 | The last-resort tier-E product is the largest-capacity (max width×height cap, slug tiebreak) sellable, complete product of the required operation; all its configurations enter tier E and cheapest wins | section 4.4 | mirrors `pickProduct`'s existing largest-capacity rule so both engines keep agreeing on the oversize promise |
| AD16 | `RULE_VERSION` bumps to `v3-energy-objective`; the `ranker_version` columns keep their names and carry `SELECTION_VERSION` | sections 5.1, 10.1 | runs must be attributable to the model that produced them without a column rename ripple |

### 16.1 Implementation-stage assumptions (AD17–AD35)

The calls below were made by the **developer** during phases 1–4 where this design left room or was wrong, disclosed in the phase reports at the time, and are registered here so the acceptance walk can put every one in front of the owner. AD35 is the **orchestrator's** ruling, registered as such. "Adjudicated" means the architect's design-conformance review already gave the call a second opinion; entries without it have had none beyond the developer's own reasoning.

| # | Assumed | Why | Visible at | Second opinion |
|---|---|---|---|---|
| AD17 | Phase 1's `SelectionResult` shipped without `splits`/`selectedSplit`; the fields landed with Phase 2 (design §5.3 specified them up front) | Phase 1 could not reference `SplitCandidate`, a type that did not exist yet; an always-empty field would have been a dead contract surface for one phase | fields as landed: `worker/lib/estimator/select.ts:60`, `:67`; interim shape in the Phase-1 report / git history | none |
| AD18 | Unpriceable-sorts-last applies **before** the tier-C deviation rule: within tier C an unpriceable candidate sorts below every priced one regardless of deviation | design §4.2's rule order let a zero-deviation unpriceable candidate outrank a priced near-miss, contradicting A6's "sorts last within its tier" | `worker/lib/estimator/ladder.ts:218` | **adjudicated** — developer right; §4.2 contradicted its own prose |
| AD19 | Composite make-up ties resolve on covering rank (the `coveringSystems` order), not the system slug's alphabet | a slug tiebreak once lexically excluded sys-80 (the `MAX_SYSTEMS` incident); covering rank is the order the enumeration already justified | `worker/lib/estimator/compositeSelect.ts:306` (zero-padded `coveringRank` prefixes `splitKey`), `:169`, `:221` | none |
| AD20 | Every composite make-up is stamped `lastResort: true` in `selectForComposite`'s ladder mapping | within a composite the make-ups are the only candidates; a non-fitting one must land in tier E (selectable, ops2 AC-3) rather than tier X emptying the run | `worker/lib/estimator/compositeSelect.ts:313` | none |
| AD21 | `checkPerformanceData` runs unconditionally: no published performance variant fails `incomplete` even with no thermal requirement (the old check lived inside the deleted `checkEnergy` and was conditional) | glass is mandatory — a product with no published glass is unsellable regardless of requirement | `worker/lib/estimator/rules.ts:155`, applied at `:316` | **adjudicated** — sound |
| AD22 | The confidence/review verdict is one pure exported `proposalVerdict`, not the inline per-read-site mapping design §10.2 described | one derivation, testable in isolation; two inline copies could drift | `worker/lib/ai/proposal.ts:46`, called at `:322` | **adjudicated** — implementation right, design wrong |
| AD23 | **Customer-facing behaviour change — the one most worth the owner's eye.** A make-up spanning frame systems is never a candidate; when no single system covers the opening there is no split candidate at all and the refusal reaches review via the returned note. Previously the mixed-systems fallback still auto-built an independently-chosen composite with a warning; now such an opening stays a single (possibly tier-E, indicative) line for human review | AC-8/D3 make split combinability a *hard* constraint — "that make-up is never offered as a candidate"; a fallback candidate would re-admit through the back door what the front door refuses | `worker/lib/estimator/splitCandidates.ts:274` (`{ splits: [], note: enumerated.fallback }`) | **adjudicated** — the spec compelled it; the behaviour delta itself is flagged for the owner |
| AD24 | A split candidate that does not fit is `lastResort: true` (tier E), not excluded | design §6.2 stamped `fits:false` but §4.1 rule 2 would then have excluded it, deleting a reviewer-selectable near-answer (ops2 AC-3); tier E is the truthful shelf | `worker/lib/estimator/select.ts:309` (`splitLadderCandidate`) | none |
| AD25 | `SplitCandidate` carries `plan: SplitUnitPlan[]` (segment + per-unit requirement + glazing note + refs) instead of the design's bare `segments: ProposedSegment[]` | materialisation needs the per-unit facts the bare geometry lost; one richer field beats parallel arrays | `worker/lib/estimator/splitCandidates.ts:66`, `:85`, consumed by `splitSegmentSpecs`:321 | none |
| AD26 | `enumerateSplitCandidates` returns `{ splits, note }`, not a bare array | the mixed-systems refusal (AD23) and other no-candidate outcomes need a channel to review warnings with no candidate to hang them on | `worker/lib/estimator/splitCandidates.ts:179` | none |
| AD27 | The split-geometry seed (the max width `proposeSplit` divides by) comes from a preliminary ladder run over the single units alone, then discarded | the old seed was the already-made parent pick, which D7 abolished; the preliminary run is a dimension input, never a pick — nothing is selected from it | `worker/lib/estimator/splitCandidates.ts:415-425` | none |
| AD28 | Backfilled product slugs are shape-validated, not looked up in the live catalogue | the backfill records what was actually manufactured, possibly before the current catalogue — a live lookup would refuse true history. **Supersedes the "resolves in the catalogue" clause of AD12/§8.4** | `worker/lib/ai/outcomes.ts:227` | **adjudicated** — design error, developer right |
| AD29 | The backfill ingest **refuses** a bad context value (field named, value never echoed) where `retrievalKey` **coerces** one | coercion at live capture protects a running pipeline; coercion at ingest would file a staff typo under 'other' with nobody to notice — and echoing the refused value would put customer text into a response and a log | `worker/lib/ai/outcomes.ts:249`, `:283-285` | none |
| AD30 | A tie is not a preference: `preferredSlug` is null when the bucket has no unique modal product, so `wouldPrefer` is false for every candidate | a tie promoted by row order would flip on insertion order and assert a lead the evidence does not hold | `worker/lib/estimator/learning.ts:177-178` | none |
| AD31 | The shadow block always exposes `observations`/`support` counts — below the density floor and on thin leads too; only `preferredSlug`/`wouldPrefer` gate on the floor | the reviewer discounts a thin lead themselves; hiding counts would hide the evidence and show only a conclusion (AC-31 still holds: the *preference* is withheld, the counts are not) | `worker/lib/estimator/learning.ts:173-176` | none |
| AD32 | Backfilled rows count **equally** with in-platform rows in the shadow aggregate; provenance is reported, never used as a weight | D18 says backfilled rows are real manufactured history; a down-weight would be a new unsourced constant — the disease this redesign cures | `worker/lib/estimator/learning.ts` `aggregateShadow` (the D18 comment block) | none |
| AD33 | The `thermalRequired` key flag fails closed: derived from the resolved requirement at capture, and anything absent or unparseable reads as 0 — a row never claims a thermal context it cannot prove | a false 1 would put no-requirement history behind thermal claims; a false 0 only dilutes a coarser bucket | `worker/lib/ai/outcomes.ts:171`, `:295`; `worker/lib/estimator/learning.ts:139` | none |
| AD34 | `cheapestOf` receives the already-bias-ordered fitting list, so a price tie and a total absence of prices both resolve to exactly the previous series-bias behaviour | AC-39's "unchanged without a pricer" extended to the degenerate pricer cases with one mechanism instead of two fallbacks | `src/data/scheduleMatch.ts:131`, `:141` | none |
| AD35 | **Orchestrator's ruling, registered as such (fix round 1, owner absent; tagged in code by the developer):** `MAX_SYSTEMS = 12` and `MAX_GLASS_TRIALS = 3` are retained as bounded-work caps rather than deleted as tuned constants | they bound enumeration (runaway work), never express that one candidate beats another — but the tester read the spec §11 "only tuned constant in the selection path" wording literally, so the owner may instead prefer a spec amendment exempting work bounds. Architect concurs with the ruling: the caps shape *which* make-ups exist, not *which wins*; this design retained them silently in §6.2, which was the register gap | `worker/lib/estimator/compositeSelect.ts:124` (in-code `ASSUMED:` tag), `:152`, `:162` | orchestrator ruling; architect concurs on conformance review |

---

## 17. Rejected alternatives

| Alternative | Rejected because |
|---|---|
| Re-tune the six weights instead of deleting | the failure is structural (irrelevant-alternatives violation, curves standing in for constraints); no eval harness exists to tune against (D17 keeps it out of scope) |
| Put the ladder functions in `src/data/` with the types | one consumer of the functions = a hypothetical seam (codebase-design rule: two adapters make a seam real); the types alone are the shared contract |
| One `compareCandidates(a, b, requirement)` doing tiering internally (fully set-free) | the tolerance band is genuinely set-relative (AC-48 blesses exactly one such behaviour); pretending otherwise would hide `best` inside the comparator and break AC-46's pairwise test. Splitting `assignTiers` (set step) from `compareCandidates` (pairwise step) makes AC-46 and AC-48 *both* testable as stated |
| Make `checkDimensions` severity `reject` (fit hard in the rules engine) | silently empties the ops line-revalidation surface (`ops.ts:1641`) for oversize lines; AD5 keeps one fit-fact home and applies hardness where machine selection happens |
| Keep the energy filter but soften it further | an energy *filter* of any kind re-creates the two-sources-of-truth problem the ladder exists to kill; the band belongs to the comparator (D4) |
| New columns/table for split candidates (`candidate_result_unit`) | a rebuild-adjacent schema expansion for a display concern; `outcome_json.units[]` carries the same facts with zero migration risk. Revisit only if ops2 needs relational access to units |
| A `selection_candidate` v2 table replacing `candidate_result` | `draft_order_line.selected_candidate_id` references `candidate_result`; a parallel table would fork "which row was chosen" into two homes and eventually rebuild-tempt someone. ADD COLUMN is the whole migration story here |
| Retrieval key as a computed view / derived at read time | a stored, versioned key is what makes the recompute story and the density index possible; deriving at read time re-parses `context_json` per row per run |
| Backfill as a CLI script writing to prod D1 | bypasses the staff gate and the audit log; a thin ops route keeps every corpus write behind `resolveStaff` |
| Deleting all `recommendation_outcome` rows in the reset | pending/rejected rows are immutable audit records (outcomes.ts:126-129 relies on them); only the learning corpus (eligible+approved) is D18's target |
| Async `priceOf` in `matchSchedule` | would make the shared pure module async for one consumer; `createCachedPriceResolver` is already synchronous after construction, so the worker can inject a sync closure |

---

## 18. Decisions needed

**None.** Every judgement call made in the owner's absence is registered in section 16 (AD1–AD16 design-stage; AD17–AD35 implementation-stage, per §16.1) and the spec's A1–A17, all vetoable at acceptance. Per the owner's standing instruction, the machine-learning calls (retrieval key composition, density floor, shadow-model shape) follow the spec's guidance with reasoning recorded rather than being returned as questions.
