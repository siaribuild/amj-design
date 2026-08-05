# Default split-pairing rule — final design for approval

*Design only. Nothing implemented, nothing edited. Every line reference is to the working tree on `feat/glazing-thermal`. Where the adversarial verification contradicted a map claim, I have trusted the verification and said so. Three claims I re-verified myself against live Sanity (project `xjtrm1ex`, dataset `production`, published perspective) and they change two of the three candidate designs' conclusions — flagged in §3.*

---

## DECIDED BY THE OWNER — 2026-08-05

Recorded here at the top because this spans two designs and is exactly the kind
of decision that gets lost between them.

**The pairing rule lives in SANITY, on the PRODUCT FAMILY.** This supersedes §7
Q5's recommendation of a D1 table with a Sanity reference for the frame partner.
One home, one owner, one key — and the key was already established as the right
one: family is unambiguous where operation is not (`sliding` is claimed by three
families, two of them doors). The catalogue editor who maintains a family also
states what goes beside it.

*Answers §7 Q2 (per family, not per product or global) and §7 Q5 (Sanity, not the
ops/catalogue split I proposed). Q1, Q3, Q4, Q6–Q10 remain open — but Q1 (where
the lite sits) and Q4 (how many sashes) become EDITOR CHOICES under this decision
rather than questions blocking the build, so the schema carries fields for both
with seeded defaults.*

**The rule is a FALLBACK, and the drawings override it.** Full precedence, across
both features:

```
energy report component schedule      authoritative, unchanged
  ↓
drawing-derived split                 read from the plans + elevations
  ↓
schedule comment ("2x 600 AWNINGS")   architect's words
  ↓
family default pairing  ← THIS        awning ⇒ awning + fixed
  ↓
even split                            today's N equal units
```

**Why this reorders the work.** The owner's point: *"This would allow to parse
window schedules better (a photo of a page, for example) by default. But would be
overridden / not used when proper plans are submitted."*

That makes the family default the piece that pays off **first and alone**. A
photographed schedule page carries no geometry and never will; it is precisely
the case where nothing can be read from a drawing, and it is common. Under
today's code that opening becomes N equal operable units — for a 3600mm awning
opening, three 1200mm awnings, which is the complaint that started this. With the
family default it becomes awning + fixed with no drawing, no vector extraction
and no model call.

So the family default is **not** a degraded mode waiting on the drawing work. It
is the baseline the drawing work improves on, it ships independently, and it
raises the floor for every schedule-only job — which is most of them.

---

## 1. THE DIRECT ANSWER

**No. This is not learning data today, and it cannot be — not because the corpus is empty, but because the learning layer has no vocabulary for a layout, and because a default has to work at zero observations.**

The codebase already asked and answered this question. `E:\Projects\amj-website-design\worker\lib\ai\outcomes.ts:125-126`:

```ts
const isComposite = line.line_kind === "composite_parent";
const recommendationEligible = sameCoreConfiguration && !isComposite;
```

with the reasoning written above it at `:120-124` — *"What the decomposition SHOULD teach is not expressible here: this table records one configuration against another, and a composite's answer is N units with their own products and geometry. Until that is modelled, the honest state is `pending`."* Composites are deliberately excluded from the ranker corpus with a flag, not left implicit.

**What the learning layer does model.** Exactly one thing: *in this opening context, which product and which performance variant do humans actually issue?*

- The stored row is five fields (`worker/lib/estimator/learning.ts:33-39`) and the aggregate key is `${context_key}::${final_product_slug}::${variant}` (`:62`). There is no field anywhere in the read path that could hold "two units" or "awning + fixed".
- The retrieval key is 12 facts about the opening (`learning.ts:15-31`) with a width bucket cut at `[900, 1800, 3000]` — so a 3200mm opening and a 7000mm opening share one bucket, `g3`. That is fine for "which product"; it is useless for "which layout", because the range where splits happen is one undifferentiated bucket.
- The signal is one of six rank components at weight 0.10 and never a veto (`worker/lib/estimator/rank.ts:12-15`).
- With no data it returns a flat neutral: `if (!observations) return 0.5;` and `if (ctxTotal < 2) return 0.5;` (`learning.ts:70,73`).

That last point is decisive. **A default must produce an answer on the first job, before any history exists. A model that returns 0.5 at N=0 can refine a default; it can never define one.**

Three further, independent blockers: segments never reach the corpus at all — the issue-time capture filters `parent_line_id IS NULL` (`worker/lib/revisions.ts:122`), so the units a human actually chose are never handed to the learner; the corpus row is unique per line, holding one product and one variant; and `SplitProposal.basis` already types a `"learned"` literal (`worker/lib/estimator/split.ts:108`) that **nothing anywhere in the repo emits** — the tier documented at `split.ts:10` as *"learned practice (future — reviewer-outcome model once data exists)"* is a seam that was drawn and left empty.

**One map claim I am rejecting.** The learning-layer map asserted composite outcomes are "structurally un-adjudicable" because `HUMAN_BUILT_AS_COMPOSITE` is not in `OVERRIDE_REASONS`. The verification disproved it: the approve path gates on `decision='adjusted' AND quality_state='pending'`, not on the reason code, and there is a passing test that approves a composite outcome. The true statement is narrower and still relevant: **no reason code in the governed vocabulary means "built as a composite", so adjudicating one forces a semantically wrong label.**

**Therefore this is configuration.** And the repo already says where that kind of configuration lives — `E:\Projects\amj-website-design\migrations\0028_composite_lines.sql:56-58`:

> `-- Geometry rules live in D1, never as constants in code: how much mullion/jamb`
> `-- allowance is acceptable before a human is asked, and how many units a split may`
> `-- have, are business decisions that change without a deploy.`

---

## 2. WHAT HAPPENS TODAY

### The case as the brief states it — 3600mm opening, awning maxing at 1800mm

1. **The product is not rejected.** `checkDimensions` returns a *warning*, not a rejection (`worker/lib/estimator/rules.ts:61-63`), with the contract stated at `:56-60`: *"An opening outside the published range is a WARNING, not a rejection: we build a composite/custom unit, so the candidate stays selectable and is priced at the REAL opening size."*
2. **The line is downgraded, not blocked.** `rules.ts:287,294`: `warned` ⇒ `status = "commercial_only_estimate"`, `passed = true`.
3. **The split is triggered by that warning.** `worker/lib/estimator/estimate.ts:268`: `const oversize = ... filters.some(f => f.filter === "dimensions" && f.severity === "warning")`.
4. **The layout is chosen.** `proposeSplit` gets `maxWidthMm: 1800` (`estimate.ts:277`), finds no hint, and falls to the default branch (`split.ts:276-288`):
   - `count = Math.max(2, Math.ceil(3600 / 1800)) = 2`
   - `widths = evenWidths(3600, 2) = [1800, 1800]`
   - every segment gets `fallbackOp = opening.operationType ?? "awning"` (`split.ts:259, 281`)
5. **Result: `awning 1800 | awning 1800`**, `basis: "default_even"`, note *"Proposed as an even 50/50 split (default) — confirm the configuration at review."* Two segment rows written by `splitLine`, parent flipped to `composite_parent`, `status='technical_review'` with a warning (`estimate.ts:362-376`).

### The correction: no awning product in the live catalogue reaches 1800mm

I queried the live dataset. The **Awning Window** family holds five products with `dimensionRule.maxWidthMm` of **1000, 1200, 1200, 1300, 1300**. The widest awning AMJ makes is 1300mm.

So the real 3600mm awning opening runs with `maxWidthMm: 1300`:

- `count = Math.max(2, Math.ceil(3600 / 1300)) = 3`
- `evenWidths(3600, 3) = [1200, 1200, 1200]`
- **Three 1200mm awnings side by side.**

**The builder's complaint is confirmed, verbatim, from live data.** "There's no point to offer 3 awning windows next to each other" is not a hypothetical — it is what `split.ts:278-281` produces for a very ordinary opening. A 3600 × 2400 opening becomes 8.6 m² of operable sash, three chain winders, and a price built from three operable frames where the manufacturer would build one sash and a sheet of glass.

### The second half of his point, which is worse

The system *can* already build awning | fixed | awning — but only from a schedule comment, and the most natural phrasing of that comment silently fails. Verified by execution in the dossier and confirmed independently by the adversarial pass:

`parseSplitHint("AWNING + FIXED + AWNING")` on a 3200mm opening yields `basis: schedule_comment` and segments **`[awning 1600, awning 1600]`** — no fixed lite, three stated units collapsed to two. The chain: pattern B gives all three units `widthMm: null`; `layoutFromHint` drops the fixed at `split.ts:148` (`// fixed is derived, not placed as operable`); `anyUnspecified` is true at `:156`, so the remainder branch at `:159-168` is skipped; the even branch at `:171-174` splits the total across the two survivors.

**Today, stating the answer explicitly on the schedule gets you a worse layout than saying nothing.** That is the same code branch a pairing rule extends. It is a prerequisite, not a side quest.

### One more thing today does silently

A 6000mm awning opening: `count = ceil(6000/1300) = 5`. `validateSplit` rejects anything above `composite_policy.max_segments` (default 4, `composite.ts:79`), and `estimate.ts:363` discards that with a bare `if (!res.ok) continue`. **No composite is created, no composite-specific warning is pushed, and the opening stays a single 6000mm line.** The line is still flagged `commercial_only_estimate`, but the plan is gone with no trace.

---

## 3. THE DESIGN

**One D1 table keyed by catalogue family, ops-editable through the existing pricing-audit machinery, plus one optional Sanity reference for the frame partner. The rule emits operations and an optional product pin; the existing per-segment selection does the rest.**

### Where this came from

- **Base: the `ops-policy` design.** A pairing is a manufacturing preference that must change without a deploy; D1 already holds that charter, and D1 is the only candidate store a machine can also write to later.
- **Grafted from `catalogue-relationship`:** `product.fixedCounterpart` in Sanity, and the discipline of *always stating the reason in the note including the negative case*. The frame partner is a catalogue relationship that D1 genuinely cannot own — only the person who maintains the product range knows whether AMJ80ST is the AMJ80's fixed counterpart.
- **Grafted from `seeded-learning`:** the `source` / `observations` / `approved` provenance columns, so the learned tier arrives as **rows in the same table** rather than as a fifth branch — one mechanism, two sources; and the extraction of a shared layout function so the comment path and the rule path stop being two layout engines.
- **From the judges, and from my own live query:** the key must be the **family slug, not the operation**.

### The verified reason the key is family, not operation

The `ops-policy` design keyed on `operation`. I queried the live catalogue: **operation is not unique across families.** `sliding` is claimed by `sliding-window`, `sliding-door` and `slim-frame-sliding-door`; `double-hung` is claimed by `sashless-double-hung` and `single-hung-window`. A rule keyed `sliding` fires on a window and on two door families at once — and on the door side, `resolveScheduleType("door", "fixed")` returns null, `queryCandidates("doors", "fixed")` returns empty (`worker/lib/estimator/catalogue.ts:16-18` filters `category->slug.current == $family && family->operation == $operation`), and `estimate.ts:330`'s `?? parent?.candidate.slug` fallback would **price a fixed panel as a whole sliding door**, rate card and wide-frame surcharge included.

Family slug is unambiguous, is where `operation` is declared as the single source of truth (`sanity/schemaTypes.ts:64-70`), and is exactly the granularity at which "an awning window pairs with a fixed lite" is a true statement.

### 3a. The D1 table

```sql
-- migrations/0041_composite_pairing.sql
--
-- What goes NEXT to an operable unit when an opening is too wide for one frame.
-- A joinery preference the builder owns and changes without a deploy, so D1 —
-- the same charter as composite_policy (0028:56-58), audited through the same
-- pricing-change machinery as every other ops-written number.
--
-- ONE table, TWO sources. Today every row is source='seed', hand-authored.
-- If a reviewer-outcome model ever earns the right to propose a layout, it
-- INSERTs rows here with source='learned', approved=0 — never a second mechanism.
CREATE TABLE composite_pairing_rule (
  -- The PARENT opening's catalogue FAMILY slug ('awning-window'), or 'default'.
  -- NOT the operation: 'sliding' is claimed by three families and 'double-hung'
  -- by two, so an operation key leaks a window rule onto doors.
  id                 TEXT PRIMARY KEY,
  active             INTEGER NOT NULL DEFAULT 1,

  -- The family that supplies the passive lite ('fixed-window').
  -- NULL = DO NOT PAIR. This is the per-family off switch, and it is the
  -- default, so the table is inert until someone fills a row.
  infill_family      TEXT,

  -- The builder's cap: how many opening sashes a composite may carry, ever.
  max_operable       INTEGER NOT NULL DEFAULT 1,
  -- Allow one more sash per N mm of opening, up to the cap.
  -- NULL = always exactly one sash, however wide the hole.
  operable_every_mm  INTEGER,

  -- Where the sashes sit, left to right.
  placement          TEXT NOT NULL DEFAULT 'outer',  -- outer|centre|left|right

  -- The smallest sliver of glass worth making. Below it, abandon the pairing
  -- and fall back to equal operable units rather than propose a joke lite.
  min_infill_mm      INTEGER NOT NULL DEFAULT 400,

  note               TEXT,

  -- PROVENANCE: the single mechanism, two sources.
  source             TEXT NOT NULL DEFAULT 'seed',   -- 'seed' | 'learned'
  observations       INTEGER NOT NULL DEFAULT 0,     -- 0 on a seed
  approved           INTEGER NOT NULL DEFAULT 1,     -- learned rows land 0
  version            TEXT NOT NULL DEFAULT 'v1',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Inert fallback: no infill_family, so an unlisted family behaves exactly as today.
INSERT INTO composite_pairing_rule (id) VALUES ('default');

-- The builder's stated rule, as the one seeded exception (see Q6).
INSERT INTO composite_pairing_rule
  (id, infill_family, max_operable, operable_every_mm, placement, note)
VALUES
  ('awning-window', 'fixed-window', 2, 3000, 'outer',
   'Builder 2026-08: an opening too wide for one sash gets a fixed lite beside it.');

-- Which rule produced this composite, so a plan can be traced to its policy and
-- a reviewer's correction can later be attributed. Sits beside composite_origin
-- (0028:51-52), which is written and — verified — read nowhere today.
ALTER TABLE quote_line ADD COLUMN composite_pairing_rule_id TEXT;
ALTER TABLE quote_line ADD COLUMN composite_pairing_source  TEXT;  -- 'seed'|'learned'
```

Six authored fields, four with sane defaults. Deliberately **not** columns, because the catalogue already holds the answer per product and a second copy would drift: the sash width (it is the parent product's `dimensionRule.maxWidthMm`), the widest lite (the infill family's own product maximum), any ratio bands (the trigger is already "wider than the frame"), and a horizontal variant (see §4).

### 3b. The Sanity field

```ts
// On `product`, Technical group, beside dimensionRule (schemaTypes.ts:536).
// The fixed product built on the SAME frame as this one. NOT derivable:
// AMJ100L / AMJ100T / AMJ150 pair by name, but AMJ80 → AMJ80ST and
// AMJ65T → AMJ67T are near-misses only the manufacturer can confirm, and
// AMJ68 / AMJ125T have no fixed product at all.
// Empty is a valid, safe answer: the infill family's own best-fit product is
// then selected normally.
defineField({
  name: "fixedCounterpart",
  title: "Same-frame fixed lite",
  type: "reference",
  to: [{ type: "product" }],
  group: "technical",
  options: { filter: '_type == "product" && family->operation == "fixed"' },
})
```

Needs one projection line in `worker/lib/estimator/catalogue.ts`'s `CANDIDATE_QUERY` — that query is an explicit allowlist, and `src/data/catalogueQuery.ts:42` already demonstrates the failure mode by silently dropping `maxAreaM2` and `maxAspectRatio` from the display catalogue.

### 3c. Resolution algorithm

`split.ts` stays D1-free and unit-testable. The rule arrives resolved, in `opts`, exactly as `maxWidthMm` does today.

```
proposeSplit(opening, hint, opts {
    maxWidthMm, minWidthMm,        # the SELECTED parent product's own limits
    maxSegments,                   # composite_policy.max_segments — NEW input
    pairing,                       # the matched rule row, or null
    infill                         # { familySlug, operation, minWidthMm, maxWidthMm,
                                   #   pinnedProductSlug } — resolved from the catalogue
})

W = round(opening.widthMm); H = round(opening.heightMm)
P = opening.operationType ?? "awning"          # split.ts:259, unchanged
cap = maxSegments

# ── TIER 1 + 2 — UNCHANGED ────────────────────────────────────────────────
if hint:
    segments = layoutFromHint(...)             # split.ts:126-175
    if segments.length >= 2: RETURN            # energy_report | schedule_comment

# ── BASELINE (today's answer, still the fallback) ─────────────────────────
N = maxWidthMm > 0 ? max(2, ceil(W / maxWidthMm)) : 2

# ── TIER 3 — PAIRING (new) ────────────────────────────────────────────────
# Gate on a WIDTH overflow specifically. The live trigger (estimate.ts:268)
# fires on ANY dimensions warning — rules.ts:62-70 warns on UNDERSIZE, over-area
# and over-aspect too — and pairing an undersize opening would make it worse.
paired = pairing != null and infill != null
         and maxWidthMm != null and W > maxWidthMm

plan = null
if paired:
    sashW  = maxWidthMm                        # the sash is as wide as the frame allows
    byWidth = pairing.operableEveryMm ? floor(W / pairing.operableEveryMm) : 1
    k = min(pairing.maxOperable, max(1, byWidth), N - 1)   # ≥1 infill guaranteed

    while k >= 1:
        infillTotal = W - k * sashW
        if infillTotal <= 1:                       k -= 1; continue
        nInfill = max(1, ceil(infillTotal / infill.maxWidthMm))
        if k + nInfill > cap:                      k -= 1; continue
        infillWidths = evenWidths(infillTotal, nInfill)     # split.ts:241-246
        floorMm = max(pairing.minInfillMm, infill.minWidthMm ?? 0)
        if min(infillWidths) < floorMm:            k -= 1; continue
        if sashW < (minWidthMm ?? 0):              k -= 1; continue
        plan = { k, nInfill, sashW, infillWidths }; break

# ── ORDER, left to right ──────────────────────────────────────────────────
if plan:
    switch pairing.placement:
      'outer' : k==1 ? [O] ++ I…            : O×⌊k/2⌋ ++ I… ++ O×⌈k/2⌉
      'centre': I×⌊n/2⌋ ++ O×k ++ I×⌈n/2⌉
      'left'  : O×k ++ I…
      'right' : I… ++ O×k
    # operable segments  → operation P,                 productSlug null
    # infill  segments   → operation infill.operation,  productSlug infill.pinnedProductSlug
    # Σ widths == W EXACTLY by construction — the partition contract at
    # split.ts:14-16 is preserved and coverage_delta_mm stays 0.
    RETURN { segments, axis: "vertical", basis: "default_pairing",
             reviewRequired: true, ruleId, ruleSource, ruleVersion,
             note: "Proposed as <shape> from the default pairing rule for
                    <family> (lite: <product>). Without the rule this would be
                    <N> equal <P> units. Confirm the split at review." }

# ── FALLBACK — today's branch, byte-identical output ──────────────────────
if N <= cap:
    RETURN { segments: evenWidths(W, N) all operation P,
             basis: "default_even", reviewRequired: true,
             note: <existing text> + <why no pairing applied, when a rule exists> }

# ── TYPED REFUSAL — replaces today's silent nothing ───────────────────────
RETURN { refused: "max_segments", required: N, allowed: cap }
```

**The ordering matters.** The paired plan is attempted *before* the cap refusal, so pairing can rescue openings that today produce nothing at all (see the 6000mm case below).

**Products are not chosen here.** `estimate.ts:292-330` already resolves each segment's operation and runs a fresh `selectForOpening` per segment. The one change needed there: for an infill segment, query the **infill family's** candidates directly and honour `pinnedProductSlug` when set. This is the load-bearing fix — going through `resolveScheduleType(section, "fixed")` is ambiguous, because live Sanity has `sliding-window` still carrying alias `["fixed"]` alongside `fixed-window`'s `["FIXED", "FIXED LITE", "PICTURE", "PICTURE WINDOW"]`, and only alphabetical family order ("Fixed Window" < "Sliding Window") decides the winner today (`src/data/scheduleMatch.ts:128-133`, ordered by `name asc` at `catalogueQuery.ts:35`).

### 3d. Worked cases — live catalogue, AMJ100T Awning Window (500–1300mm), height 2400, `max_segments` 4

Rule as seeded: `infill_family: fixed-window`, `max_operable: 2`, `operable_every_mm: 3000`, `placement: outer`, `min_infill_mm: 400`. Fixed Window products are 400–3000mm.

| Opening | Today | With the rule |
|---|---|---|
| **1950mm** | `awning 975 \| awning 975` | `awning 1300 \| fixed 650` |
| **3600mm** | **`awning 1200 \| awning 1200 \| awning 1200`** — the builder's complaint | `awning 1300 \| fixed 2300` |
| **6000mm** | **nothing** — N=5 > cap 4, `validateSplit` fails, `estimate.ts:363` swallows it | k=2 → `awning 1300 \| fixed 1700 \| fixed 1700 \| awning 1300` — 4 units, exactly at the cap |
| **9000mm** | nothing (N=7) | k drops to 1 to fit the cap → `awning 1300 \| fixed 2566 \| fixed 2566 \| fixed 2568`, note says the cap forced a single sash |
| **Casement family, no rule row** | `casement 533 ×3` | **identical — no rule, no change**, note states no pairing is configured for this family |

### 3e. Where each piece lives

| Piece | File | Owner |
|---|---|---|
| Layout policy rows | new `migrations/0041_composite_pairing.sql` → `composite_pairing_rule` | Ops, via the console |
| Rule loader | `E:\Projects\amj-website-design\worker\lib\composite.ts` — `loadPairingRules` beside `loadCompositePolicy` | — |
| The tier + shared layout function | `E:\Projects\amj-website-design\worker\lib\estimator\split.ts` | pure, no D1 |
| Resolver, product pin, refusal handling, re-split guard | `E:\Projects\amj-website-design\worker\lib\estimator\estimate.ts` | — |
| Frame partner | `E:\Projects\amj-website-design\sanity\schemaTypes.ts` — `product.fixedCounterpart` | Catalogue editor |
| Audit / version / revert | `E:\Projects\amj-website-design\worker\lib\pricing-admin.ts` — one literal added to the `table` union (verified: it is a four-member string union at `:47`, and `pricing_change.table_name` is free text at `0029:21`) | — |
| Editor + preview | `E:\Projects\amj-website-design\worker\routes\ops-pricing.ts`, `E:\Projects\amj-website-design\src\ops\Pricing.tsx` — a fifth "Splitting" sub-tab | Ops |

**On the persisted `basis`.** A new literal `"default_pairing"`, written per segment into `segment_requirement_basis` (`estimate.ts:356` → `composite.ts:270`). Safe: that column is plain `TEXT` with no CHECK (`0036:20`) and — verified by grep — has zero readers. It is still a durable audit value, so it gets a real name. And **`"learned"` should be deleted from the union** (`split.ts:108`): under this design a learned answer is a *row source*, not a different basis, so the persisted contract never changes when learning turns on.

---

## 4. WHAT IT DOES NOT DO

**Stays the reviewer's decision — unchanged, all of it.**
`reviewRequired` remains the typed literal `true` (`split.ts:109-110`); the parent still flips to `status='technical_review'` with a `review_json.composite` warning (`estimate.ts:370-376`). The reviewer can change any unit's product, size, options and glass (`composite.ts:360` `updateSegment`), add a unit (`:428-470`), remove one, or merge the whole composite back to one opening. The rule moves the *starting point*, never the authority. It does not make a proposal more confident, and it does not auto-issue anything.

**Stays the schedule comment's decision.**
The rule executes only where `basis` would have been `default_even` — after `layoutFromHint` has returned null or fewer than two segments. The shipped ladder becomes: **energy report → schedule comment → pairing rule → even split.** Note that the header at `split.ts:7-12` documents a three-tier ladder that has never been the shipped one — `energy_report` is checked first at `:131` and stamped at `:267`, and an energy hint overwrites a comment hint for the same `externalRef` (`pipeline.ts:547` then `:575`, same Map, later write wins). That header gets corrected in this change either way.

**Stays with the customer: nothing.** Customers still cannot split or merge — `src/components/quote-project/MoreMenu.tsx:12-15` records the owner decision `NO "Split"`, because whether an opening must be split is a manufacturing constraint. They can still edit a unit.

**Deliberately refuses to guess:**

- **Mullion and jamb allowances.** Widths partition the opening exactly, as `split.ts:14-16` requires. `coverage_delta_mm` stays 0 on the AI path. `default_joiner_mm` is seeded 0 (`0028:62`) and — verified — has no server-side reader at all (`proposeEvenSplit` has no production caller; the only live consumer is the ops browser at `ProjectRecord.tsx:1165`). This design does not activate it.
- **The frame partner, when none is declared.** No slug-prefix inference. AMJ100L/AMJ100T/AMJ150 pair cleanly; AMJ80 → AMJ80ST and AMJ65T → AMJ67T are near-miss traps; AMJ68 and AMJ125T have no fixed product. Blank means the infill family's own best-fit product, chosen normally, with a note saying so.
- **Families the builder has not named.** No rule row = today's behaviour, exactly.
- **Doors.** The seeded rule is a window family. A door pairing would need a door infill family that does not exist; the resolver refuses to pair when the infill family yields no candidate in the opening's category.
- **Horizontal / stacked layouts.** Only an energy report can produce a horizontal AI split (`pipeline.ts:574-577`); the default hardcodes vertical (`split.ts:282`). An awning highlight over a fixed panel is a real pattern but nobody has stated it with the certainty the builder stated the vertical one. It gets its own rule when asked for.
- **Raising `max_segments`.** The rule reads the cap and refuses loudly above it. Whether four is the right number is a joinery judgement, not this rule's business.
- **Prices.** No pricing table is touched. Prices move only because the mix of frames changes (see risk 3).

---

## 5. IMPLEMENTATION SKETCH

Ordered so each step is independently verifiable and each can ship on its own. Steps 1–3 are prerequisites that stand on their own merit; the rule itself is inert until step 8.

1. **Re-split guard** — `worker/lib/estimator/estimate.ts`. `materialiseSplits` re-plans only lines with `line_kind='simple'`; an existing `composite_parent` is left alone and its stale plan surfaced as a note. *Verify:* re-run an estimate on a project whose composite a reviewer has hand-corrected; segments survive. **Hard prerequisite** — `splitLine`'s first statement is `DELETE FROM quote_line WHERE parent_line_id=?` (`composite.ts:249`), nothing guards it, and `composite_origin` exists for exactly this purpose (`0028:51-52`) but is verified read-nowhere.
2. **Shared layout function + comment-collapse fix** — `worker/lib/estimator/split.ts`. Extract the placement/width allocator; feed it the comment's token sequence so a stated `fixed` is placed instead of dropped at `:148`. *Verify:* `proposeSplit` on `"AWNING + FIXED + AWNING"` at 3200mm yields three segments including a fixed, not two awnings. Add the test the suite currently lacks (`estimator-split.test.mjs:29-32` asserts only the parse).
3. **Narrow the trigger, thread the cap, typed refusal** — `split.ts` + `estimate.ts`. Split on width overflow specifically; pass `maxSegments`; return `{refused}` instead of an unbuildable plan; surface it as a named review warning. *Verify:* a 6000mm awning opening produces a visible warning instead of silence; an over-*height*-only opening is no longer width-split.
4. **Migration + loader** — `migrations/0041_composite_pairing.sql`, `worker/lib/composite.ts`. Table, `'default'` inert row, the two `quote_line` provenance columns, `loadPairingRules`. *Verify:* migration applies clean; loader returns the inert map; no behaviour change anywhere.
5. **The pairing tier** — `split.ts`, pure. *Verify:* unit tests over the §3d table, including that a null rule reproduces today's `default_even` output byte for byte.
6. **Resolver, pin and infill selection** — `estimate.ts`. Join rule + catalogue + policy; constrain an infill segment's candidates to the infill family; honour `pinnedProductSlug`; stamp `composite_pairing_rule_id` / `composite_pairing_source` on the parent. *Verify:* a paired proposal selects a Fixed Window product, never a sliding-window frame or the parent's awning.
7. **Sanity `fixedCounterpart`** + one projection line in `worker/lib/estimator/catalogue.ts`. *Verify:* a pinned counterpart appears on the candidate; an unset one leaves selection unchanged.
8. **Ops console** — `worker/lib/pricing-admin.ts` (one literal), `worker/routes/ops-pricing.ts` (GET/PUT + `POST .../splitting/preview`), `src/ops/Pricing.tsx` (fifth sub-tab). The preview runs the **real** `proposeSplit` and renders the unit strip for an operator-chosen family and opening width. *Verify:* an edit versions, audits and reverts; the preview agrees with production. Also gives `composite_policy` its first-ever write surface.
9. **Seed the awning rule** — one revertable row. *Verify:* a 3600mm awning opening proposes `awning 1300 | fixed 2300`; a casement opening is unchanged.

---

## 6. RISKS

**1. An ops policy edit plus any re-estimate silently destroys a reviewer's work.**
`materialiseSplits` calls `splitLine` unconditionally for any hinted or oversize line, and `splitLine` begins with `DELETE FROM quote_line WHERE parent_line_id=?` (`composite.ts:249`). Ops is protected by a 409 `already_composite` (`ops.ts:631`); the AI path is not, and `composite_origin` — written at `composite.ts:273` to prevent exactly this — is read nowhere. Today the blast radius is bounded because the default layout only changes with a deploy. Making it ops-editable removes that accident of safety.
*Mitigation:* step 1, shipping first and alone. Never re-plan a line that is already a composite; surface a stale-rule note instead.

**2. The infill product is selected, not stated — so the pair can come from the wrong frame, or the wrong family entirely.**
The ranker has no same-frame term (`rank.ts:12-15`) and all five fixed products share an identical 400–3000 rule, so geometry cannot discriminate either: an AMJ67T lite beside an AMJ80 awning is the routine outcome, not the edge case. On the door side it is worse — `resolveScheduleType("door", "fixed")` returns null, `queryCandidates("doors", "fixed")` is empty, and `estimate.ts:330`'s `?? parent?.candidate.slug` would price a fixed panel as a whole sliding door.
*Mitigation:* the rule names an **infill family**, not a bare operation string; the resolver queries that family directly and refuses to pair when it yields no candidate in the opening's category; `product.fixedCounterpart` pins the same-frame lite where the manufacturer has confirmed one.

**3. Switching the rule on moves quoted prices, on provisional rate cards, with no view of the blast radius.**
Replacing three awning frames with one awning plus one fixed lite changes the price of every affected opening. The five fixed products' rate cards are seeded `45 / 300 / 'v1-provisional'` (`migrations/0040_fixed_product_rate_cards.sql:4-9`) with a wide-frame `+10%` modifier above 1200mm — and every paired lite will be above 1200mm. Meanwhile the failure mode of a *wrong* rule is invisible: a rule that matches nothing degrades to `default_even`, which is indistinguishable from a rule working correctly.
*Mitigation:* the preview endpoint in step 8 (the pricing console's own precedent — `previewSample` runs the real `computePrice` because *"a preview that can disagree with production manufactures false confidence"*), a `draftExposure`-style count of live openings a rule would re-plan, plus a reconcile run that flags any rule whose `infill_family` or `fixedCounterpart` no longer resolves against the hydrated catalogue and any rule that has never matched an opening. And the fixed rate cards get real numbers from ops before the rule is switched on.

---

## 7. QUESTIONS FOR THE OWNER

**Q1 — Where does the fixed lite go in the order?**
(a) `outer` — sashes to the outside edges, glass in the middle: `awning | fixed | awning`, degenerating to `awning | fixed` with one sash. (b) `centre` — `fixed | awning | fixed`. (c) `left` / `right` — all sashes to one side. (d) alternating.
→ **Recommend (a), seeded.** It is the shape the comment path already produces from an explicit schedule (`split.ts:159-168`), so the default and a stated comment agree rather than contradict. Alternating is deliberately not offered: it ends a composite on a lite, which is the wrong edge condition against a jamb. All four remain per-family editable.

**Q2 — Per family, per product, or global?**
(a) Per **family** (`awning-window`) + one `'default'` row. (b) Per product — 32 rows for one preference. (c) Global — one rule for every opening.
→ **Recommend (a).** Verified live: operation is ambiguous (`sliding` spans three families, `double-hung` two), so an operation key is out; family is where `operation` is declared and where the statement is actually true. This is one lookup with one fallback, matching the single-tier shape `pricing_rate_card` kept when migration 0031 deleted the family tier — not a revival of that ladder.

**Q3 — What happens when a family has no fixed counterpart?**
(a) Today's N equal operable units, with the note stating *why* no pairing applied. (b) Refuse to split, leave the line whole. (c) Fall back to a generic fixed product regardless of frame.
→ **Recommend (a).** (b) removes information the reviewer has today. (c) is exactly the mis-pairing `fixedCounterpart` exists to prevent. The note is load-bearing: without it, the same builder gets `awning | fixed` on one job and three awnings on another with no visible cause and reads it as a bug.

**Q4 — How many operable units before it stops adding more?**
(a) Always 1 — one sash, the rest glass. (b) Hard cap of 2. (c) A cap plus a width trigger: `max_operable 2`, `operable_every_mm 3000` — a second sash only past 3 metres.
→ **Recommend (c), seeded 2 / 3000.** "No point offering 3 awnings" is a statement about a cap, not a constant. A 6-metre opening with a single 1.3m sash is under-ventilated and the reviewer would correct it every time. Under this seed a 3600mm opening gets exactly one sash, which is the builder's case.

**Q5 — Who owns it: ops or the catalogue editor?**
(a) Split: ops owns the **layout policy** in D1 (which family pairs, how many sashes, where they sit); the catalogue editor owns the **frame partner** in Sanity (which fixed product is built on this frame). (b) All Sanity. (c) All D1.
→ **Recommend (a).** They are two different facts with two different owners and two different change rates. The layout preference is a business decision that must change without a deploy and must be auditable and revertable — `Pricing.tsx:3` states the boundary as *"ops writes the numbers, Sanity writes the words"*, and this is neither, it is geometry, which `0028:56-58` already assigns to D1. The frame partner is a catalogue relationship only the product-range maintainer can state, and it belongs beside `dimensionRule`. Putting the layout in Sanity would also put it beside `option.compatibility` (`schemaTypes.ts:198-211`) — an editor-authored rule DSL with, verified, **zero readers**.

**Q6 — Which families get a seeded rule on day one?**
(a) `awning-window` only. (b) Awning + casement + double-hung (all small-sash window families — casement products max at 700–750mm, so a 1600mm casement opening becomes three 533mm sashes today). (c) All window families. (d) None — ship the table empty.
→ **Recommend (a), and ask the builder about casement next.** He named awnings. A wrong rule is worse than no rule, and every unlisted family behaves exactly as it does today, so the blast radius is one family and one revertable row.

**Q7 — The fixed products are content shells.** Verified live: all five have no hero image, no gallery, no specs, no options and no descriptions. The pairing makes them appear on customer-visible lines routinely.
(a) Fill in at least a name, short description and hero image before switching the rule on. (b) Keep them estimator-only and accept bare rows. (c) Hide fixed segments from customer views.
→ **Recommend (a).** They already appear in the customer composite-unit picker; the rule multiplies that exposure. Also in the same pass: **remove the stale `["fixed"]` alias from the Sliding Window family** — verified still live — since resolution between it and Fixed Window is decided today purely by alphabetical family order.

**Q8 — When an opening needs more units than `max_segments` allows.**
(a) Attempt the paired plan first (it usually needs fewer units), and if that still exceeds the cap, refuse loudly with a named review warning. (b) Raise `max_segments` to 6. (c) Today's behaviour: propose too many and let it fail silently.
→ **Recommend (a).** (c) must go regardless — it is a live defect. Note that pairing *rescues* the common case: a 6000mm awning opening produces nothing today and four units under the rule. Whether the cap should be 6 is a separate joinery question for the manufacturer, and the console will let you change it without a deploy for the first time.

**Q9 — Fix the comment collapse in the same change?** `"AWNING + FIXED + AWNING"` currently yields two equal awnings and no fixed.
(a) Yes — prerequisite. (b) No — separate ticket.
→ **Recommend (a).** It is the same branch, and shipping the rule without it means the system contradicts itself: *stating* the layout on a schedule would produce a worse plan than staying silent.

**Q10 — Reserve the learned tier, or build it?**
(a) Reserve: `source` / `observations` / `approved` columns now, no capture work. (b) Build segment capture now — an *additional* child-line query feeding the learning outbox only, never by dropping `revisions.ts:122`'s `parent_line_id IS NULL` filter, which would reintroduce the documented double-charge at `revisions.ts:104-111`.
→ **Recommend (a) now, (b) when the seed has produced enough corrections to be worth reading.** The seed must work at N=0, so learning can never define this default — only refine it. Stamping `composite_pairing_rule_id` on the parent in step 4 is what makes "did reviewers keep the layout this rule proposed?" answerable later, and it costs one column today.