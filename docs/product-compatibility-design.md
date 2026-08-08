# Product compatibility — frame systems, and the composite as the unit of choice

**Status: BUILT AND DEPLOYED 2026-08-08.** Owner decisions recorded the same day.
Supersedes the unimplemented `product.fixedCounterpart` proposal in
`docs/default-split-pairing-design.md` §3b.

Schema deployed to `xjtrm1ex/production`; six systems authored and all 34 products
tagged (`sanity/scripts/tag-frame-systems.mjs`, idempotent — re-run it after adding
a product and it reports the new one as untagged rather than guessing).

### As built — where the code differs from what is written below

- **§4, `MAX_SYSTEMS` is 12, not a tight bound.** The "covering systems arrive
  best-first" argument only holds while the ordering carries information. On an
  all-fixed composite every fixed-lite system covers the opening exactly and with
  the same own-segment count, so the sort falls through to its slug tiebreak —
  which exists purely to make runs reproducible — and a bound of four permanently
  excluded `sys-80`, the largest platform in the catalogue, for sorting after
  "1", "6" and "7". The bound is now above the catalogue's system count.
- **§4, compatibility is verified across every PAIR of chosen units**, not just
  each unit against the system it was drawn from. A system may reach a unit
  through a declared partner, and two different partners of one hub need not be
  compatible with each other — `sys-125` naming both `sys-100` and `sys-150` says
  nothing about `sys-100` beside `sys-150`.
- **§4.2, the one-way crossing lives in `alternateCategoryFor`** (exported from
  `estimate.ts`), because the composite selector honestly crosses in whichever
  direction it is handed. It shipped symmetric once: exactly one product in the
  catalogue is a sliding window, so every door system reported exact coverage of
  a sliding-window opening and the line was built as two sliding doors.
- **§5.2, `glazingSlugs` counts only the units asked to share a glass.** A unit
  whose band an energy report stated is deliberately excluded from unification,
  so counting it warned "no single glazing" on the one case where differing glass
  is the instruction.
- **§7, the customer's PRODUCT TYPE list is filtered too.** Choosing a type
  blanks the product, so the "keep the unit's own product" escape could not save
  a type whose every product is another platform — the customer landed on an
  empty select under a caption promising the frames that fit.

---

## 1. THE PROBLEM

A composite opening is delivered as two or more coupled units. Today each unit's
product is chosen **independently**.

`materialiseSplits` (`worker/lib/estimator/estimate.ts:387`) calls
`selectForOpening` once per segment. Every call queries candidates by
`(category, operation)`, runs the hard rules, expands every eligible (frame ×
glass) variant, prices each and takes the argmax of a weighted score
(`worker/lib/estimator/rank.ts:12`):

    compliance 0.35 · geometry 0.20 · configuration 0.15
    commercial 0.15 · historical 0.10 · dataCompleteness 0.05

In-band cells all score a flat 1.0 on compliance (owner rule), so **among
compliant options the commercial term decides**. That is the "cheapest that meets
the energy requirement" behaviour, and per opening it is correct.

Per *composite* it is not. Nothing in the ranker refers to another segment. There
is no cross-segment term, no composite score, and no place where two units of one
opening are compared to each other. The consequence was already written down and
left unfixed — `docs/default-split-pairing-design.md`, Risk 2:

> "The infill product is selected, not stated — so the pair can come from the
> wrong frame, or the wrong family entirely. The ranker has no same-frame term
> and all five fixed products share an identical 400–3000 rule, so geometry
> cannot discriminate either: **an AMJ67T lite beside an AMJ80 awning is the
> routine outcome, not the edge case.**"

Two frames of different depth, coupled in one opening, is a joinery fault and an
aesthetic one. It is currently the *expected* output whenever the cheaper lite is
from another platform.

### 1.1 Why it cannot be fixed with what exists

**Nothing in the catalogue records the frame system.** Live Sanity holds 34
products, 14 families and 20 thermal profiles. The AMJ platform designator exists
only inside `product.name` and `product.slug`.

- `frameTechnology` is `conventional | thermally_broken` — technology, not depth.
- `frameType` is `"aluminium"` — material.
- `thermalProfile` is the closest thing and is unreliable: `AMJ100T Series
  Sashless Double Hung` points at `amj83-double-hung`, `AMJ150 Series Awning
  Window` at `amj150t-tb-awning-window`, and 8 of 34 products carry no profile.
- `profileThickness` was extrusion **wall** thickness and was deleted in the
  2026-07-31 cleanup.

**Slug-prefix inference is refused**, on the grounds the earlier design already
stated: AMJ100L/100T/150 pair cleanly by name, but AMJ80 → AMJ80ST and AMJ65T →
AMJ67T are near-miss traps, and AMJ68/AMJ125T have no fixed product at all. A
rule that is right nine times and silently wrong twice is worse than no rule.

**A terminology trap to keep clear of.** In estimator code `family` means the
*category* slug (`windows`|`doors`) and `series` means the Sanity *family* slug
(`awning-window`). Neither is the platform. This design uses **frame system**
throughout and never reuses `series`.

---

## 2. OWNER DECISIONS (2026-08-08)

| # | Decision |
|---|---|
| D1 | The frame system is a **new first-class Sanity document**, `frameSystem`, referenced from `product`. A mapping is proposed and the owner confirms it. No inference from slugs, names or profiles. |
| D2 | The **compatibility matrix is built and authored now**, not deferred. `compatibleWith[]` ships on the document from the start. |
| D3 | **Customers are blocked** from choosing an incompatible product for a unit; **ops is warned and allowed**. |
| D4 | **One glass across a composite**, unless an energy report states a per-component band for that unit. |
| D5 | **AMJ80, AMJ80ST and AMJ80T are one system.** The number is the platform; the letters are variants within it. |
| D6 | **AMJ65T and AMJ67T are one system.** |
| D7 | **AMJ150 and AMJ150T are one system**, spanning conventional and thermally broken. |
| D8 | **AMJ100, AMJ100L and AMJ100T are one system**, by the same rule. |
| D9 | **AMJ68 belongs to the AMJ65 system.** |
| D10 | Within a system spanning both technologies, a composite **prefers matching frame technology but never requires it**. |
| D11 | A composite **may cross the window/door boundary** — same category first, crossing only when the chosen system has no product for that segment's operation in the parent's category. |
| D12 | System slugs are **depth-based**: `sys-65`, `sys-72`, `sys-80`, `sys-100`, `sys-125`, `sys-150`. |
| D13 | **AMJ125T gets no matrix edge.** Its composites fall back and warn. |
| D14 | **Project-wide system preference is out of scope.** Composites only. |

D5–D9 share one rule and it is the rule to apply to any future product: **the
number is the system, the letters are variants within it.**

---

## 3. THE MODEL

### 3.1 `frameSystem` (new Sanity document)

    frameSystem
      name           string, required     "AMJ80"
      slug           slug,   required     "sys-80"
      notes          text                 free, for the catalogue editor
      compatibleWith array of
        system       reference → frameSystem
        severity     "preferred" | "allowed"
        note         string

`product.frameSystem` — reference → `frameSystem`, optional, `technical` group.

**`frameTechnology` is deliberately NOT on the system.** D5/D7/D8 put conventional
and thermally-broken products inside one system, so technology is a per-product
fact that varies within a system. Putting it on the system would be a second copy
free to disagree with the product's own — the exact failure mode the `defaultSplit`
projection was built to avoid.

**Compatibility is symmetric and closed by default.** Two products are compatible
when they share a system, or when either system names the other in
`compatibleWith`. Absence of an edge means *not compatible*, never *unknown-so-allow*.
An **untagged** product is a different case: it is `unknown`, and unknown never
blocks — see §6.

**Why Sanity and not D1.** Which frames couple is a manufacturer fact about
products, the same class of fact as `family.defaultSplit.infillFamily`, which
already lives there. Ops owns numbers; Sanity owns product facts. No new D1 table,
no migration.

**The simple rule and the matrix are the same field.** "Same system only" is
`compatibleWith` empty. Nothing needs redesigning to populate it later.

### 3.2 The mapping — 6 systems, 34 products

| Slug | Name | Products | Own fixed lite |
|---|---|---|---|
| `sys-65` | AMJ65 | 65T casement window, 65T tilt&turn, 65T casement door, **67T fixed**, 68 bi-fold door | ✅ 67T |
| `sys-72` | AMJ72T | 72T awning, 72T fixed | ✅ 72T |
| `sys-80` | AMJ80 | 80 sliding window, 80 awning, 80 casement window, 80 louvre 4″, 80 sliding door, **80ST fixed**, 80T tilt&turn, 80T casement door, 80T bi-fold | ✅ 80ST |
| `sys-100` | AMJ100 | 100 pivot, 100L awning · fixed · louvre 6″ · sliding door · casement door, 100T awning ×2 · fixed · sashless DH · single hung · sliding door · casement door | ✅ 100L + 100T |
| `sys-125` | AMJ125T | 125T slim-frame sliding door | ❌ |
| `sys-150` | AMJ150 | 150 awning, 150 fixed, 150 sliding door, 150T lift-slide | ✅ 150 |

`sys-65` is the label for the 65–68 mm band, not a claim that every frame in it is
exactly 65 mm.

**`compatibleWith` ships empty.** Five of six systems supply their own fixed lite,
so the only candidate edge was AMJ125T's, and the owner declined it (D13): the
slim-frame sliding door reaches 5000 mm on its own and may never need splitting.
The mechanism is built and authored; it simply has no edges yet. When one is
needed it is a content edit, not a release.

### 3.3 Two anomalies that dissolve

`AMJ150 Series Awning Window` sits on a thermally-broken profile beside a
conventional `AMJ150 Fixed Window`; `AMJ100T Series Sashless Double Hung` sits on
the conventional `amj83-double-hung`. Under D7/D8 both are **correct**, not
mis-linked. Nothing to repair in Sanity.

Still open as data hygiene, unrelated to this design: `amj100t-awning-window` and
`amj100t-series-awning-window` are the same product entered twice (same family,
same 500–1300 × 500–2400 rule, same glass, same profile), and 8 products carry no
thermal profile and so cannot be thermally evaluated inside a composite.

---

## 4. SELECTION — THE SYSTEM BECOMES THE OUTER VARIABLE

Today's loop picks a product per segment. The new loop picks a **system for the
composite**, then the best product per segment inside it.

    for each system S that can supply EVERY segment's operation:
        for each segment i:
            (product, glass) ← selectForOpening(segment_i, restrictToSystems=[S])
        unify glass across segments                       (D4, §5.2)
        composite price   = Σ segment totals
        composite thermal = area-weighted Uw and SHGC
        score(S)          = the existing weights, aggregated (§5)
    select argmax score(S)

This is the existing ranker lifted one level. Same weights, same
`gradedComplianceScore`, same non-blocking discipline. **Only the unit of
evaluation changes** — from (product × glass) to (system → set of units).

That is what makes an individually dearer system win: because it is the only one
that covers every operation in the opening, or because its composite Uw meets the
band a cheaper mix misses.

**Cost is roughly neutral.** Each inner run is restricted to one system and so
prices about 1/N of today's candidate set; N systems × 1/N ≈ today's total. The
repository cache is keyed `(family, operation)` and is already warm across
segments; the price resolver is already batched per run.

**`selectForOpening` gains exactly one optional parameter**, `restrictToSystems?:
string[]`. Absent, behaviour is bit-identical to today, so the single-opening path
is untouched.

### 4.1 Geometry is proposed before the system is chosen

`proposeSplit` needs a maximum frame width, which comes from the parent's selected
product, so the layout is decided before the system is. Rather than re-propose the
geometry — split geometry is a human/design decision with its own documented
precedence chain, and re-deriving it here would quietly overrule a document — the
**geometry term in the composite score does the work**: a system whose frames
cannot build the proposed widths scores lower and loses. Self-correcting, without
touching the proposal.

Re-proposing geometry under the chosen system is a *possible later feature*. It is
not built here and would need its own approval.

### 4.2 Crossing the window/door boundary (D11)

A segment resolves its candidates in the parent's category first, and crosses only
when the chosen system has no product for that operation there. It stamps a review
note when it crosses.

In practice this means **one thing**: a door composite can take a fixed window lite
from its own system. A window composite can never pull in a door — which matters,
because the operation `sliding` is claimed by `sliding-window`, `sliding-door` and
`slim-frame-sliding-door` and operation alone cannot tell them apart.

**This fixes a latent bug.** `resolveScheduleType("door", "fixed")` returns null
and `queryCandidates("doors", "fixed")` is empty, so today a door composite needing
a lite falls through `estimate.ts`'s `?? parent?.candidate.slug` and **prices a
fixed panel as a whole sliding door**. With the crossing rule, `sys-80` sliding
door takes the 80ST lite, `sys-100` takes 100L/100T, `sys-150` takes 150. The bug
disappears as a consequence of the model rather than as a separate patch.

---

## 5. SCORING THE COMPOSITE COLLECTIVELY

The six existing components, aggregated. No new weights.

| Component | Aggregation |
|---|---|
| compliance | §5.1 |
| geometry | area-weighted mean of per-segment scores |
| configuration | area-weighted mean (a system that cannot perform an operation is already excluded upstream, so this reduces to variant affinity) |
| commercial | normalised across **systems** on Σ(segment totals), not across products within one segment |
| historical | **neutral 0.5** — see below |
| dataCompleteness | area-weighted mean |

**Historical stays neutral, and the learning module is not touched.**
`captureRecommendationOutcomes` already excludes composites —
`recommendationEligible = sameCoreConfiguration && !isComposite`
(`worker/lib/ai/outcomes.ts:126`) — with the reason stated in place: the corpus
records one configuration against another, and a composite's answer is N units
with their own products and geometry. That remains true. Feeding a composite
decision into a corpus that cannot represent it would be worse than feeding it
nothing.

### 5.1 Compliance

Honours both existing owner rulings without choosing between them:

- **No per-component bands** — compute the composite cell (area-weighted Uw and
  SHGC) and grade it once against the opening's band. This is the thermal plan's
  stated goal: *"average the U-value across the split and fit that average to the
  opening's requirement."*
- **Energy report states per-component bands** — grade each segment against its
  own band and take the area-weighted mean of the graded scores. Child bands are
  never intersected into one parent band (thermal plan, owner decision 3).

`compositeAveragedUw` already exists and is tested (`estimator-split.test.mjs`) but
is **called from nowhere in production**. This wires it. A sibling
`compositeAveragedShgc` is added alongside it.

### 5.2 Glass (D4)

One glazing option across every unit of a composite. A unit departs from it only
where an energy report component states its own band for that unit. Nobody glazes
half an opening clear and half tinted; and where an engineer has said otherwise
for a specific lite, the report is authoritative, as it already is everywhere else.

### 5.3 Frame technology (D10)

A soft preference, not a constraint: a composite whose units share a frame
technology scores higher; a mixed one is still selectable and priced when it wins
on thermal or cost. This stops a conventional lite drifting in beside a
thermally-broken awning on price alone, inside a system that legitimately contains
both.

---

## 6. NEVER ELIMINATE — WARN

If **no** system can supply every segment's operation, the composite falls back to
today's independent per-segment selection and raises the reserved `composite`
filter as a **warning**.

`FilterName` has declared `"composite" | "option_compatibility"` since the rules
engine was written and has never pushed either (`worker/lib/estimator/rules.ts:19`).
This is what `"composite"` was reserved for.

A compatibility rule that *rejects* would produce empty lines. That is the W01
regression class this codebase has spent months eliminating — thermal is
non-blocking, oversize is a warning, a best-fit is always priced. The compatibility
constraint joins that contract rather than breaking it.

The same applies to **untagged** products: a product with no `frameSystem` is
`unknown`, and unknown never blocks anything. Until §7's authoring is complete the
feature is simply inert — which is the correct behaviour for absent content, and
the reason no fallback mapping is shipped in code.

---

## 7. HUMAN SURFACES (D3)

Three places a person can create the mismatch the machine now avoids. All three
use the same picker today — `ItemComposer.tsx:829`, `getProductsByFamily`, with
**no filtering of any kind**.

| Surface | Route | Behaviour |
|---|---|---|
| Customer unit editor | `PATCH /api/projects/current/segments/:id` | **Blocked.** Picker lists compatible products only, with a line saying why. |
| Ops unit editor | `PATCH /api/ops/segments/:id` | **Allowed.** Picker marks incompatible products; saving one stamps a review reason. |
| Ops split panel | `POST /api/ops/lines/:id/split` | **Allowed**, same marking. |

**One rule, one function, actor supplied by the route.** The constraint lives
inside `updateSegment` behind an `enforceCompatibility` flag that the route sets —
customer route `true`, ops route `false`. The two routes were deliberately merged
onto one domain function so pricing, coverage and derived quantity could not drift
between them; a second implementation of the compatibility rule would undo that.

The customer picker **must** filter rather than merely mark. A server 400 against a
product the UI offered is a dead end with no explanation.

The parent's system is **derived from its units**, never stored. No column, no
migration.

---

## 8. WHAT THIS DELIBERATELY DOES NOT DO

- **Infer a system from a slug, a name or a thermal profile.** Ever. An untagged
  product is unknown and unknown never blocks.
- **Ship a fallback mapping in code.** The feature is inert until the content is
  authored. That is the point.
- **Re-propose split geometry under the chosen system.** §4.1. The geometry term
  handles it; re-deriving widths would overrule a document that stated them.
- **Constrain products across a project.** D14. A house may still end up with
  `sys-80` in one room and `sys-150` in another. Out of scope by decision.
- **Touch the learning corpus.** §5. Composites are already excluded and remain so.
- **Change the ranker's weights.** The six components and their weights are
  unchanged; only the unit they are computed over moves.
- **Add a policy knob.** No `composite_policy.mixed_systems` column. The behaviour
  is: prefer a single system, warn when impossible. A knob would be a new feature.
- **Model coupling hardware or mullion sections.** A unit is a whole window, frame
  included; coupling two already produces the mullion between them. Unchanged from
  the pairing design.
- **Block a member of staff.** D3.

---

## 9. IMPLEMENTATION PLAN

| # | Step | Touches |
|---|---|---|
| C1 | `frameSystem` document type; `product.frameSystem` reference. Deploy schema. No code reads it yet | `sanity/schemaTypes.ts` |
| C2 | Author 6 systems, tag 34 products, `compatibleWith` empty. Audit script listing untagged products and systems with no lite and no edge | Sanity content, `sanity/scripts/` |
| C3 | Project `frameSystem` into `CatalogueCandidate` and the public `Product`. Additive, null when absent | `estimator/catalogue.ts`, `src/data/catalogueQuery.ts`, `src/data/catalogue.ts` |
| C4 | Pure `compatibility.ts` — `systemOf`, `areCompatible`, `coveringSystems`. Dependency-free, like `pairing.ts` | new |
| C5 | `compositeSelect.ts` — the two-stage loop. `selectForOpening` gains `restrictToSystems?` | new, + `select.ts`, `estimate.ts` |
| C6 | `compositeRank.ts` — aggregation, composite cell, `compositeAveragedShgc`, glass unification, technology preference | new, + `split.ts` |
| C7 | Cross-category segment resolution, same-category-first, review note | `estimate.ts`, `src/data/scheduleMatch.ts` |
| C8 | No covering system ⇒ fallback + the `composite` filter warning + reviewer warning | `rules.ts`, `estimate.ts` |
| C9 | Customer picker filters + server enforces; ops picker marks + allows + stamps a reason | `composite.ts`, both segment routes, `ItemComposer.tsx`, `ProjectRecord.tsx` |
| C10 | `compatibility.test.mjs`, `composite-select.test.mjs`; update the suites in §10 | `scripts/tests/` |
| C11 | Ops shows the chosen system and why | `ProjectRecord.tsx` |

**Zero migrations.** Nothing is stored that is not already stored: the system
mapping lives in Sanity, the parent's system is derived, and the warning fits the
existing `review_json` blob.

C1–C3 are inert on their own and can ship independently of C4–C11.

---

## 10. TEST IMPACT

New: `compatibility.test.mjs` (system resolution, symmetry, unknown-never-blocks,
covering-system search), `composite-select.test.mjs` (system wins on coverage;
dearer system wins on composite thermal; no covering system ⇒ warn and mix; glass
unified except where a report component states otherwise).

**Unchanged and worth noting:** `api.test.mjs`'s thermal-audit fixture deliberately
builds one composite from `amj80-series-awning-window` and
`amj80-series-sliding-window`. Both are `sys-80`, so it stays valid — a useful
independent check on D5.

Likely to need updating: `estimator-split.test.mjs` (`composite Uw is
area-weighted … (same glass by default)` — D4 formalises that parenthetical);
`estimator-rules.test.mjs` (`owner rule: among compliant glasses the CHEAPEST is
recommended` — still true per segment, now subordinate to the composite score);
`pairing.test.mjs` (the infill family's frame limits are now read within a system).

---

## 11. RISKS

**The authoring is the feature.** 34 product tags stand between the code and any
behaviour change. Until they exist every product is `unknown` and nothing changes.
The audit script in C2 exists to make that visible rather than silent.

**Six systems is a coarse model.** It says an AMJ100L conventional lite may sit
beside an AMJ100T thermally-broken awning because both are 100 mm. D10 softens
that to a preference. If it turns out to be wrong the fix is content — split
`sys-100` into two systems — not code.

**`sys-65` spans 65, 67 and 68 mm.** By decision (D6, D9). If a 3 mm step is
visible in the finished joinery, the same content-only fix applies.
