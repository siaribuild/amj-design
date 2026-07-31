# Thermal selection rework — implementation plan

**Status:** APPROVED, partially implemented (see §0).

## 0. Implementation status (2026-07-31)

**Delivered + tested (green):**
- **Thermal model** — `worker/lib/estimator/thermal/` (precedence + coherence guard, glass selection, graded compliance, computed band). Unit-tested: `scripts/tests/thermal-selection.test.mjs` (17).
- **WS2 coherence guard at BOTH collapse sites** — `rules.effectiveThermalRequirements` and `energyMap.strictest` can no longer emit an impossible (min>max) band. This is the direct fix for the W01 empty-line bug.
- **WS3 non-blocking selection** — `rules.checkEnergy` and the energy∩schedule joint case downgrade `reject`→`warning`; a product is always assigned (frame by operation+dims), glass picked to meet the band else closest, line → `commercial_only_estimate`.
- **WS4 graded compliance + learning preserved** — `rank.complianceScore` is a floored distance-to-band nudge, not a veto; the historical (learned) component stays weighted with a neutral (0.5) absent-signal fallback.
- **WS6 per-opening computed band** — orientation-aware (cooling-control SHGC on E/W), Uw-cap-only otherwise; wired into `applyDefaultEnvelope`.
- **Versions bumped** — `RULE_VERSION` v2, `RANKER_VERSION` v3, `PIPELINE_VERSION` 2026-07-31.1.
- **Recommendation-model tests** — `scripts/tests/estimator-recommendation.test.mjs` (8): non-blocking, the W01 regression, glass-to-band, operation authority, and the historical/LLM nudge (tie-break + bounded). `estimator-rules.test.mjs` updated to the non-blocking contract.

**Also delivered:**
- **WS1 glass-as-shared-option — DONE (2026-07-31).** `optionType.required` + `performanceVariant.glazingOption` in the Sanity schema (Studio schema deployed); estimator GROQ reads `glazingOptionSlug` with a variantId fallback. Content migrated via Sanity MCP: "glazing" option type + 3 canonical glass options (Single Clear / Double Clear / Double Low-E), all 27 products linked (16/9/2) and published — verified 0 unlinked on the published perspective. Worker deployed (`91c1f365`).

**Remaining (documented):**
- **WS5 composite thermal** — RE-SCOPED (see WS5 below). Owner: splits are human/design decisions (AI may only recommend from learning, always review-flagged); segments use the SAME glass; goal is an averaged-Uw fit, no per-lite glass, no geometry/jamb. The deployed core fix already handles a non-split composite (one glass, Uw fit, review flag). Remaining is a small averaged-Uw helper (when splits exist) + a deferred learning-based split recommendation.
- **WS7 AI copy** — the line already lands non-blocking (`commercial_only_estimate` / `technical_review`, submittable); surfacing the `thermal_band_not_met` reason in the customer-facing `review_json` is polish.

---

**Original plan below.** Do not implement further workstreams until approved.
**Motivation:** An energy-report upload produced priced openings but most had **no product** (e.g. `W01`, `2050×2100`, came back `unavailable`). Root cause was not the opening size and not a model hallucination — the estimator **fabricated an impossible per-window thermal requirement** and then correctly refused to assign a product that could not meet it.

---

## 1. What actually went wrong (evidence)

The energy report states **per-glazing-type** recommendations, not per-window requirements:

| Component type | Uw cap | SHGC band |
|---|---|---|
| awning lites (W1A, W4A, W5, W6, W9A…) | 2.27 | 0.37–0.41 |
| fixed lites (W1B, W4B, W8, W15…) | 1.69 | 0.50–0.56 |

Each band is internally correct. A composite window `W1` is an **awning lite (W1A) + fixed lite (W1B)** — two different glasses. `energyMap.strictest()` (`worker/lib/ai/energyMap.ts:216`) **intersected** the two child SHGC bands onto the single parent opening:

```
minShgc = max(0.37, 0.50) = 0.50
maxShgc = min(0.41, 0.56) = 0.41   →  0.50–0.41, an empty interval
```

`rules.ts checkEnergy` (`worker/lib/estimator/rules.ts:101`) then correctly finds no glazing that is both ≥0.50 and ≤0.41 → `severity:'reject'` → `unavailable` → empty line. The selector did the right thing with a contradictory input.

**There is a second collapse site:** `effectiveThermalRequirements` (`rules.ts:114`) intersects explicit ∩ learned-advisory bands the same way, which can also yield `min > max`.

---

## 2. Owner decisions (locked)

1. **Thermal is NON-BLOCKING**, exactly like a dimension conflict: a product (frame) is **always** assigned by operation (awning/sliding/…) + dimension fit; a thermal miss produces a **warning**, never an empty line.
2. **Glazing is the U-value lever, modelled as a first-class OPTION** (like handles/colour), migrated in this change — *not* left as the current `performanceVariant` abstraction. (See §3 for the frame-dependent-Uw reconciliation.)
3. **Per-lite composites in this change**: an awning lite gets awning glass (0.37–0.41), a fixed lite gets fixed glass (0.50–0.56); child bands are never intersected into one parent band.
4. **Requirement precedence, per opening / per lite:**
   - **Tier 1 — own explicit** band (a specific ref row, e.g. `W04A`).
   - **Tier 2 — shared per-element-type** band (all awnings → 0.37–0.41). This is what the report actually provides.
   - **Tier 3 — computed per-opening** band from the house/room thermal model (orientation / room / glazing-ratio aware), built now — not the coarse VIC-only constant.
5. **LLM learnings stay live** in selection (the reviewer-outcome historical nudge, weight 0.10, must remain non-zero).

Terminology: in code, **`family` = window|door** (category) and **`operationType` = awning|sliding|fixed**. The owner's "family" = code's **operationType**.

---

## 3. Glazing model — Uw is the (frame × glass) matrix (CONFIRMED)

Owner physics: a window is rated as **frame + glass together**. `frame1+glass1 → U1`, `frame1+glass2 → U2`, `frame2+glass1 → U3`… The Uw is **driven by the glass** (the lever) but its value is the **(frame, glass) cell**. Glass is **mandatory** — every window has a glass, so every window has a Uw.

Resulting data model:

- **Glass type = a mandatory, shared option.** New `optionType: "glazing"` (`appliesToAll`-style but **required**, exactly one selected per line), with shared `option` values (e.g. "Double glazed Low-E", "Double glazed clear", "Single glazed") — edited once, offered per product. Carries the base glass surcharge.
- **(product-frame × glass) → Uw/SHGC/certification = the `performanceVariant`.** The existing variant *is* the matrix cell; it gains a **reference to the glass option** it realises (`performanceVariant.glazingOption`). A product lists only the (frame×glass) cells it actually supports (matrix may be sparse).
- **Default glass** = the product's standard variant's glass option (every product must have one, since glass is mandatory).

Selection: frame is chosen first (operation + dimensions); then, for that frame, **pick the glass option whose (frame×glass) variant meets the resolved band**; if none meets it, the closest + a warning. The glass option is the customer-facing selectable written to `options_json`; the variant supplies the frame-specific Uw/SHGC and price.

This keeps the single-source-of-truth options model the owner wants (glass text/price edited once) while honouring the physics (Uw stays a per-(frame,glass) value, not a shared scalar).

---

## 4. Target selection model

For each opening (and each composite lite):

1. **Frame** ← `queryCandidates(family, operationType)` + dimension fit. Always assigned; oversize is a `warning` (already the case for dimensions).
2. **Resolve the thermal band** by precedence: tier-1 explicit → tier-2 per-type → tier-3 computed. Guard `min > max` at every merge; never emit an impossible band.
3. **Glazing** ← among the frame's glazing options, pick the one meeting the resolved band; else the closest, and set `reviewRequired` + a thermal warning.
4. **Rank** the eligible (frame × glazing) configurations: graded thermal distance + geometry + commercial + **historical (learned)** + data-completeness. Thermal is a **nudge, not a veto**.
5. **Persist** the selected line always; a thermal shortfall lands it in `technical_review` (submittable) with a warning, not `incomplete` (blocking/empty).

---

## 5. Workstreams

### WS1 — Glazing option data model + migration (load-bearing prerequisite)
Per §3: glass type = mandatory shared option; the (frame×glass)→Uw cell stays on `performanceVariant`, linked to the glass option.
- **Sanity** (`sanity/schemaTypes.ts`): add `optionType: "glazing"` marked **required** (exactly one per line, distinct from `appliesToAll` optional types); add `performanceVariant.glazingOption` (reference to the glass `option`). Keep `uValue`/`shgc`/`frameTechnology`/`dataSource`/`certified` on the variant (the matrix cell).
- **Content migration** (`sanity/catalogue.ndjson` + a migration script): create the shared glass `option` set (choice + base surcharge) from the distinct `glassBuildUp` values; link every existing `performanceVariant` → its glass option; attach a **required** glazing `productOption` to every product; set each product's default glass = its standard variant's glass option.
- **D1** (`pricing_option_surcharge`): reuse existing glazing surcharges (variants already reference `pricingOptionSlugs`).
- **Catalogue read path** (`worker/lib/estimator/catalogue.ts`, `configuration.ts`): expose, per product-frame, the set of {glass option → variant (Uw/SHGC/price)} cells to selection.
- **Risk:** gates everything; must ship (schema + content) before selection can choose glass-as-option. Dual-read old `performanceVariant` shape during migration.

### WS2 — Requirement resolution + per-lite bands (energyMap + schema + pipeline)
- `energyMap.ts strictest()` (216): **stop intersecting** non-overlapping child bands. Carry each component band per lite.
- `energyMap.ts` result type (31–38): add a `componentRequirements[]` (per child ref / element type) alongside the scalar band.
- `worker/lib/ai/schema.ts` `OpeningV1.thermalRequirement` (166): add per-component band representation (`components[]` with lite ref/type + band); keep scalar for non-composite.
- Precedence engine (new helper, consumed by `rules.ts effectiveThermalRequirements` and `pipeline.ts`): tier-1 explicit-ref → **tier-2 per-element-type** (promote `elementHint` rows) → tier-3 computed. Guard `min>max` at each step (an impossible tier-1 falls through to tier-2/3 with a flag).
- `pipeline.ts reqJson()` (611) + `opening_requirements` write (590): serialise per-lite bands; route **computed/ambiguous** bands to `advisoryRequirements` (soft) rather than `requirements` (hard) where appropriate.

### WS3 — Non-blocking selection + glazing-to-band (rules + select + configuration)
- `rules.ts checkEnergy` (101): unmet band → `severity:'warning'` (not `reject`); return **closest-band** glazing set so a glazing is always priceable. `energyCertified=false`.
- `rules.ts` energy∩schedule joint reject (253): degrade to warning; `eligibleVariantIds` never empty (fall back to closest-band).
- `rules.ts effectiveThermalRequirements` (114): consume the WS2 precedence; guard `min>max`.
- `configuration.ts`: revive/replace `choosePerformanceVariant` (currently dead) as the single "pick glass to meet band, else closest" selector, OR fold the fallback into `eligiblePerformanceVariants`. One code path only. **Closest-glass tie-break (owner decision):** nearest SHGC to the report target, then lowest (best) Uw.
- `select.ts` (69–123): never push `selectedVariant:null` on thermal grounds; always select frame + best glazing; carry the thermal warning onto the `EvaluatedCandidate`.
- Keep `operationType`/dimension logic as-is (operation stays the selector; genuine no-operation-product is the only legitimate empty-line case).

### WS4 — Ranking + learning (rank)
- `rank.ts complianceScore` (72/75/76): replace hard-0 with a **graded distance-to-band** penalty (floored >0); read the resolved band via the WS2 precedence.
- `rank.ts` weights (8–11): re-balance so thermal is a nudge; **keep `historical` at 0.10 non-zero**, sum = 1.0. Fix the `historical` undefined-fallback to neutral 0.5.
- Bump `RANKER_VERSION`; re-check the 0.05 dominance gate.
- Verify `advisoryRequirements` (learned) still flow into the soft score.

### WS5 — Composite thermal handling (RE-SCOPED per owner, 2026-07-31)
Owner correction: **the split itself is a human/design decision** (ratio 50/50 vs 40/60; awning+fixed vs 2 awnings — preference). The AI must NOT auto-decide split geometry; it may only *recommend* a split later from learning data, and **every AI-recommended split is flagged for review**. No geometry reconciliation, no jamb allowances — the platform is not an authoritative thermal model.

Energy is simple: a split's segments use the **SAME glass type by default** (no one glazes half an opening clear and half tinted). So the only thermal goal is:
- **Average the U-value across the split** (e.g. area/50-50 weighted over the segment frames, all with the shared glass) and **fit that average to the opening's requirement**; flag for review.

What this means for the build:
- **DROPPED**: per-lite different glass, the AI→segment auto-build bridge, geometry/jamb reconciliation, per-lite explicit bands. These were over-scoped.
- **Already satisfied by the deployed core fix**: a non-split composite gets ONE glass fit to a coherent Uw band + a review flag — exactly "same glass, fit to requirement, flagged".
- **Small remaining piece (when splits exist)**: a helper that computes a composite's area-weighted average Uw from its segments (shared glass) and checks it against the opening requirement, surfacing a warning. Splits are human-initiated (ops) or future AI-recommended-with-review, so this has no urgent AI trigger.
- **Deferred to learning**: AI split-ratio recommendation (most-common practice), always review-flagged. The migration `0036` columns remain available to persist a per-segment/parent band snapshot if/when that lands.

### WS6 — Tier-3 computed per-opening band (archetypes + pipeline)
- `archetypes.ts defaultRequirement()`: accept the opening + `thermalContext` (orientation, room zoneType, glazingToRoomFloorRatio, climateZone); derive an orientation/room-aware Uw cap + SHGC band (relax the §11.3 "no SHGC without orientation" invariant where orientation IS known).
- `archetypes.ts resolveDefaultEnvelope()`: broaden beyond VIC (climate-zone keyed); add AU state/zone archetypes.
- `pipeline.ts applyDefaultEnvelope()` (249): become tier-3, deferring to tier-2 shared; compute per opening; per-lite for composites.

### WS7 — Warnings + persistence (proposal + persist)
- `proposal.ts` reviewRequired + `review_json` builder (288–331): when the chosen glazing misses the resolved band (or the band was ambiguous/absent), set `review_required=1`, add a thermal reason to `review_json` (customer copy) + `missing_inputs_json`. Line → `technical_review`, not `incomplete`.
- `proposal.ts` empty-line branch (110–198): reserve strictly for genuine no-product (unknown operation / no dimensions). Thermal never lands here.
- `persist.ts` (86/92): record the thermal shortfall in `warnings_json` (e.g. `thermal_band_not_met`); `opening_instance.status` reflects warned-but-selected, not `unavailable`.

### WS8 — Versioning, tests, deploy
- Bump `PIPELINE_VERSION` and `RANKER_VERSION` (and `RULE_VERSION` if hard-rule semantics change).
- Update tests that encode the current hard-reject (several in `scripts/tests/*.mjs`, incl. energy-map precedence, rules, ranking); add: composite non-overlapping bands → product + warning; explicit/shared/computed precedence; thermal miss → warning not exclusion; glazing chosen to meet band; learned nudge preserved.
- Deploy runbook: `npm run db:migrate:remote` (if new migration) → Sanity deploy/content migration → `git push apertly HEAD:main` → `npm run cf:deploy`.

---

## 6. Decisions — RESOLVED

- **Q-frame-Uw (§3):** glass = mandatory shared option; Uw = (frame×glass) variant cell linked to the glass option.
- **Q-composite-representation:** **quote_line segments** (parent line + priced per-lite segments); new per-segment band column; the AI bridges the opening-graph decomposition into a composite. Lite bands come from the energy component refs where present, else the lite's element-type (tier-2) or computed (tier-3).
- **Q-warning-status:** reuse **`commercial_only_estimate`** (same as a dimension conflict); the specific reason lives in `review_json`.
- **Q-closest-glass:** **nearest SHGC to the report target, then lowest (best) Uw.**

All open questions resolved — plan is ready for approval / build.

---

## 7. Sequencing & risk

```
WS1 (glass option model + Sanity/D1 migration)  ─┐  gates all glass-as-lever work
WS2 (precedence + per-lite bands + schema)       ─┼─► WS3 (non-blocking selection) ─► WS4 (ranking)
WS6 (computed tier-3)  ───────────────────────────┘                                   │
WS5 (composite segments — NEW D1 migration) ── depends on WS2 (per-lite bands)        │
WS7 (warnings) ── depends on WS3                                                       │
WS8 (versioning + tests + deploy) ── last                                             ┘
```

Two migrations land in this program: WS1 (Sanity glass-option content + variant link) and WS5 (per-segment band column). Both run before their consumers; follow the migrate-remote-before-push runbook.

Principal risks: (a) WS1 content migration touches every product — needs a dual-read window; (b) making thermal non-blocking changes *every* selection, not just energy runs — broad test coverage required; (c) two `min>max` collapse sites (energyMap + effectiveThermalRequirements) must both be guarded or the bug resurfaces via the learned-advisory path; (d) the AI→composite-segment bridge (WS5) is new behaviour with no prior path — highest-uncertainty piece, build behind tests first.
