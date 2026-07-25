# CPQ Estimator (amended spec) — review & implementation plan

**Input:** `OpenFrame_CPQ_Estimator_Implementation_Spec_Amended.docx` (LLM-assisted window/door selection; Sanity = catalogue source of truth, Cloudflare D1/R2 = transactional platform).
**Reviewer:** Claude (Cowork) · 2026-07-24. Grounded in the live Sanity schema (`xjtrm1ex/production`) and the existing repo + the delivered `feat/schedule-upload` branch.

---

## 1. Verdict

The spec is **architecturally sound and correctly bounded**, and it is **consistent with both the existing codebase and the third-party review already actioned**. Its core invariants are the right ones: Sanity is the only catalogue truth (no scraping, no D1 product master), every priced line carries an immutable snapshot, deterministic hard rules override the LLM (which never invents products/values/prices), everything is versioned and audited, and the learning loop is layered so human corrections improve the *right* layer (never "train the ranker to compensate for bad catalogue data"). Narrow JSON-schema skills over one big prompt is exactly what the earlier review asked for.

But two things must be said plainly:

1. **This is a program, not a feature** — seven phases, realistically multi-quarter. The delivered schedule-upload feature is roughly one slice of its Phase 1.
2. **The binding constraint is catalogue *data readiness*, not code.** The spec treats "audit Sanity and add fields" as Phase 0 groundwork; the live catalogue shows it is the dominant, partly-non-engineering dependency — and some of it (certified energy performance) may not exist in digital form at AMJ yet. Everything compliance-related is gated on it.
3. **Learning is the long-term critical path, so its *capture* layer is pulled forward to Phase 1** (not Phase 6 as the spec sequences it). Every *upload → issued quote* set is a labeled training example; one issued before capture exists is lost forever. Capture from day one, consume later — see §6a.

The good news: the spec **already designs for this** (Section 13, the no-energy-report path). We can ship a genuinely useful, clearly-labelled *assumption-based commercial estimate* on today's catalogue and light up compliance as the data matures — without pretending to certify what we can't.

---

## 2. How it relates to what already exists

The spec's boundaries are, encouragingly, **already largely true in the repo**:

| Spec expectation | Current reality |
|---|---|
| Sanity = catalogue truth; site + estimator use the same published data | ✅ `worker/lib/catalogue.ts` hydrates from Sanity (`catalogueQuery.ts`); `src/data/catalogue.ts` is a build-time fallback only |
| CF D1 owns customers/projects/quote revisions/orders/files/audit | ✅ migration `0001` + blueprint; `quote_revision`/`revision_line`/`order`/`order_line`/`file_asset`/`audit_event` exist |
| Immutable issued revisions; order lines copied from accepted snapshots | ✅ already implemented (`issueRevision`, `createOrderFromRevision`) |
| Schedule-code-first line identity | ✅ `external_ref` (W01/D03) |
| R2 file custody with D1 metadata + authorised access | ✅ `file_asset` + owner-gated download |
| Deterministic schedule parser as one extraction source | ✅ **delivered** in `feat/schedule-upload` (`scheduleParse` + `scheduleMatch` + `deterministic.ts`) — the spec explicitly says to keep it (§15 Phase 1) |
| Staged extraction (raw → mapped) with per-field flags | ✅ partial: `schedule_parse_job` + `parse_line` + `review_json`; a subset of the spec's `extraction_run`/`opening_instance`/`opening_evidence`/`selection_run` |
| Human-in-the-loop; submit before commitment; customer vs technical review | ✅ delivered (submission-lifecycle split from the last review) |

**So the delivered feature is a foundation, not throwaway.** It maps onto Phase 1 and the deterministic extraction skill; it needs to *evolve* (see §7), not be replaced.

Net-new domains the spec introduces that do **not** exist today: multi-document ingestion (page render + classification of plans/notes/energy reports), the richer opening/evidence/selection/candidate data model, a **Sanity candidate engine with versioned snapshots**, a **deterministic hard-rule + ranking engine**, **energy/BAL compliance**, composite decomposition, a **shared pricing service**, the review workspace, and the learning/eval loop.

---

## 3. The critical dependency — catalogue readiness (measured, not assumed)

Live query of `xjtrm1ex/production`: **45 products, 13 families, 2 categories (Windows/Doors), 54 shared options across 4 option types (Colour/Flyscreen/Hardware/Installation).**

| Spec §4 "Required Sanity contract" field | In live Sanity today? | Evidence / gap |
|---|---|---|
| Stable IDs + family/series taxonomy | ✅ | `_id`, `slug`, `family`, `category` refs; `_rev` per doc |
| Dimension rules (min/max W/H) | ⚠️ **partial** | Flat `minWidth/maxWidth/minHeight/maxHeight`, but **only 27/45 products have complete bounds** — 40% incomplete. **No** area limit, aspect-ratio, per-panel, or threshold rules; **no rule versioning** |
| Configuration (operation type, panel/leaf pattern, composite membership, opening direction) | ❌ **absent** | Operation is only *implied* by the family name ("Awning Window"); no structured operation/panel/composite model → **composite decomposition & operation matching cannot be deterministic yet** |
| Performance variant (**U-value / SHGC**, glass build-up, certification, effective dates) | ❌ **absent** | **No field exists.** `airTightness/waterTightness/windPressure` are free-text strings (42/45 populated) and `windPressure`/"Wind rating" cover *wind/BAL*, not *energy*. **Energy-compliance matching is fully blocked until this data is modelled and sourced** |
| Option compatibility predicates + per-option review flag + technical value | ❌ **absent** | Options are `{name, type, availability, pricingComponent, hex}` — no compatibility conditions, no "review required", no machine value |
| Price input / formula reference | ❌ **absent from Sanity** | Option `pricingComponent` is **placeholder (only values 0 or 100)**; base pricing lives in code (`configurator.ts` `RATES`) as a placeholder perimeter+area model, not the real area-based $/m² model |
| `schemaVersion` on structured technical docs | ❌ absent | Needed so the Worker can reject unsupported shapes |
| Compatibility/dimension **rules as data** (not prose) | ❌ absent | `keySpecs`/`specs` are display `label/value` strings |

**Blunt read:** the catalogue is *display-ready*, not *estimator-compliance-ready*. Taxonomy and basic dimensions exist; **energy performance, configuration/composite modelling, option compatibility, and real pricing do not.** The placeholder option prices and empty performance strings suggest the compliance/pricing data may not be digitised at AMJ at all — that is a **content-sourcing and possibly manufacturer-engineering dependency**, and it is the true critical path. No amount of code closes it.

---

## 4. What this means for sequencing (the key insight)

Split the program by **data dependency**, and lean on the spec's own fallback:

**Buildable now on current catalogue data (code-only):**
- The platform skeleton: D1 entities (`extraction_run`, `opening_instance`, `opening_evidence`, `selection_run`, `candidate_result`, `draft_order_line`, `review_feedback`), R2 object layout, idempotent async **Workflow** pipeline, page classification, evidence/provenance.
- `CatalogueRepository` over *current* Sanity fields (published-only, versioned by `_rev`, cached, schema-validated).
- Deterministic hard filters that only need data we have: **publication, operation (name-mapped), dimension bounds, option availability, data-completeness**. Retain the delivered schedule extractor as source #1.
- Ranking scaffold, snapshots, audit, review workspace, issue/accept/order (extending the existing revision/order flow).
- The **no-energy-report "assumption-based commercial estimate"** path end-to-end.
- The **learning-capture substrate** (`review_feedback` + reason codes + initial-proposal snapshot) — recording from the first real quote, consumed later (§6a).

**Blocked on catalogue data (degrade gracefully to the spec's own states):**
- **Energy/SHGC hard filter** → until performance variants exist, energy-critical openings return `catalogue_data_incomplete` / `technical confirmation required` (exactly the spec's design).
- **Composite selection** → until Sanity models composite configurations, out-of-range/composite openings route to **manual technical review** (the delivered `feat/schedule-upload` already does this via the `fit` technical flag — good continuity).
- **Real pricing / frontend price parity** → blocked on the real pricing model + Sanity price inputs (a separate, already-flagged workstream).
- **Option compatibility rules** → until predicates exist, compatibility beyond availability is manual review.

This lets an increment ship on real data (assumption-based estimates + strong extraction + human review) while compliance and pricing light up as Sanity is enriched — with the labels/states preventing any false compliance claim.

---

## 5. Where I'd push back on / tighten the spec

- **Phase 0 is under-scoped as "audit + add fields".** It is a content-sourcing project. Add an explicit workstream + owner for *sourcing* performance data (U-value/SHGC per product×glass, from AMJ/certification), completing the 18 missing dimension sets, and defining composite configurations — with a **go/no-go gate**: no energy hard-filter ships until performance data passes a coverage threshold.
- **"Frontend parity" acceptance criterion is currently vacuous** — both sides would agree on a *placeholder* price. Sequence the **shared pricing service + real model** (area-based $/m²; note the real deposit is 40% vs the scaffold's 50%) as an explicit dependency of any real quote, not an afterthought.
- **Turning on Workers AI is a real gate from Phase 2.** The extraction skills need it; the previous review's requirements then apply in full (spend limits, `cf-aig-collect-log-payload:false`, HMAC-keyed extraction-only cache, holdout benchmark before trusting output). Keep the deterministic schedule path as the zero-cost default.
- **Async is now mandatory.** Multi-doc + page render + LLM skills cannot run synchronously; the delivered synchronous route must migrate to a **Cloudflare Workflow** with idempotent checkpoints (the delivered design doc, Appendix D, already specifies how). This resolves the earlier review's retry-safety point at the architecture level.
- **Composite/energy realism:** the spec's examples (awning+fixed composites, U-value matching) are exactly the cases that **cannot be automated on current data** — make sure stakeholders see that the headline capabilities depend on data that isn't there yet.
- **Vectorize/learning** is correctly bounded (retrieval/explanation only, never authority) — keep it last and optional.

---

## 6. Implementation plan (phased, agent-ready)

Phases follow the spec's §15 migration but are concretised against the repo, the `feat/schedule-upload` branch, and the measured catalogue gap. Each phase lists the owning agent archetype, the D1/Sanity/module work, the exit criterion, and what stays blocked-on-data.

### Phase 0 — Catalogue contract & data readiness *(gate; runs in parallel; mostly non-code)*
- **Content/CMS + Solution architect:** design Sanity additions — `configuration` (operation type, panel pattern, composite membership, opening direction), `dimensionRule` (area/aspect/per-panel/threshold + `ruleVersion`), `performanceVariant` (U-value/SHGC, glass build-up, certification, effective dates, `published`), option **compatibility predicates** + review flag, `pricingRef`, and `schemaVersion`. Do **not** duplicate as D1 master.
- **Business (AMJ):** source certified **performance data**, complete the **18 products missing dimension bounds**, define **composite configurations**, and supply the **default-envelope table** (by climate/postcode/orientation/opening type) for the no-energy path.
- **Code (me, now):** a **catalogue-readiness admin report** — "published products missing estimator-critical fields" (I can generate the first version from live Sanity today, per §16.1 backlog) — plus a CI **catalogue test fixture export**.
- **Exit:** the frontend configurator and estimator return identical structured product/option facts for a defined test set; readiness report shows performance/dimension coverage above the agreed threshold.

### Phase 1 — Platform skeleton **+ learning-capture substrate** *(Backend / Cloudflare)*
- D1 migration for `extraction_run`, `opening_instance`, `opening_evidence`, `selection_run`, `candidate_result`, `draft_order_line`, `review_feedback` (extend, don't fork, the delivered `schedule_parse_job`/`parse_line`).
- R2 object-key policy (§5.2), file metadata, lifecycle/retention, authorised access helpers.
- **Cloudflare Workflow** pipeline with idempotent checkpoints; migrate the delivered synchronous parse into it as **extraction source #1** (deterministic schedule parser, unchanged logic).
- `CatalogueRepository`: published-only Sanity queries, `_rev`/`catalogueVersion` on every candidate, cache + Sanity **publish webhook** invalidation, schema validation.
- **Learning capture (pulled forward from Phase 6 — see §6a).** Persist, from the very first real quote: the initial system proposal (extraction + candidates + selection + scores), every human edit with a **reason code**, and the final issued line as the ground-truth label, all version-stamped. This is *capture only* — no model consumes it yet — but it must exist now so the training corpus accumulates while humans work. Capture is cheap; the data is not reconstructable after the fact.
- **Exit:** a project uploads one schedule, processes asynchronously (retry/duplicate-safe), produces evidence-backed `opening_instance` records with catalogue-versioned candidates, and — for any human correction or quote issued through even a basic/assisted UI — writes a complete `review_feedback` record. Supersedes the delivered feature's synchronous path with no capability loss.

### Phase 2 — Multi-document extraction *(AI/Extraction)* — needs Workers AI on
- Page render + classification (site/floor/elevation/schedule/detail/notes/energy/NatHERS/supplier).
- Skills with strict JSON schemas: `plans_opening_extractor`, `energy_report_extractor`, `note_constraint_extractor`, `cross_document_reconciler`, `review_rationale_generator`; runtime-validate all output (already the pattern in the delivered `ai.ts`).
- Source-precedence reconciliation (§6.3) that **represents conflict** rather than silently resolving.
- **Exit:** the benchmark project yields the expected opening groups, constraints, and conflict flags with provenance.

### Phase 3 — Sanity candidate engine + hard rules *(Backend + Matching)*
- Replace the in-memory matcher's hardcoded synonyms/best-fit with a **versioned Sanity candidate query** + a **deterministic rules engine** (`check_hard_rules`, `ruleVersion`) covering the filters we have data for; energy/composite/compatibility filters emit `catalogue_data_incomplete`/`manual review` until Phase 0 data lands.
- Persist full `candidate_result` sets + reason codes; immutable candidate snapshots.
- **Exit:** every selected candidate references a published Sanity ID + revision; no candidate failing a hard rule can be auto-selected; no runtime scraping.

### Phase 4 — Ranking & shared pricing *(Backend)* — needs the real pricing model
- Deterministic, inspectable ranker (§8.3 weighted score), historical-acceptance capped so it can't override hard facts.
- **Shared pricing service** used by both the configurator and the estimator (area-based $/m² + Sanity price inputs + D1 customer policy), snapshotting on every price.
- **Exit:** initial total + line configuration are comparable to a human-approved benchmark for the same catalogue revision.

### Phase 5 — Review workspace & commercial conversion *(Ops-console + Backend)*
- Ops workspace: evidence-page viewer, candidate sets, price snapshots; `approve`/`replace`/`manual-configuration`/`request-clarification`; issue immutable revision + generated PDF; create order from accepted snapshot (extends existing `issueRevision`/`createOrderFromRevision`).
- Explicit line states: `ready`, `needs_clarification`, `needs_manual_review`, `commercial_only_estimate`, `catalogue_data_incomplete`, `unavailable`. Reason codes mandatory on every change.
- **Exit:** a reviewer completes the benchmark project end-to-end with no DB/manual file intervention.

### Phase 6 — Learning **consumption** & evaluation *(Data/ML)*
- *Capture is already running since Phase 1.* This phase **consumes** the accumulated corpus: build the evaluation set + dashboards (§12.2 metrics; target zero silent hard-rule misses), wire the ranker's `historical_acceptance_score` (bounded, never overrides hard rules), and feed extraction/reconciliation eval sets back into prompt/parser/rule improvements — routed by reason-code category (§6a) so the correct layer is fixed, never "trained around."
- **Exit:** a regression suite runs on every prompt/rule/catalogue-adapter change; the ranker uses only bounded preference signals; the corpus captured since Phase 1 is large enough to measure top-1/top-3 approved-candidate hit rate.

### Phase 7 — Controlled rollout
- Shadow → assisted → limited customer-facing estimates; quality thresholds met; rollback + manual-only path tested.

---

## 6a. Learning capture — the long-term critical path (built in Phase 1, consumed in Phase 6)

**Principle: decouple capture from consumption.** The system's long-term value is its ability to learn from every *upload → issued quote* set. You cannot learn from data you did not record, and every real quote issued before the capture layer exists is a labeled example **lost forever**. So the capture layer is built in Phase 1 and records from the first real quote — even while humans do most of the work in a basic/assisted UI. The ranker, eval harness and dashboards that *consume* the corpus stay in Phase 6. Capture is cheap; the accumulated corpus is the moat.

**What one learnable record is.** For each opening, the tuple joins across entities most of which the platform already creates — the capture layer stitches and freezes them:

| Element | Source | Status |
|---|---|---|
| Source files (the inputs) | R2 `project_document` | exists |
| Initial extraction + evidence + per-field confidence | `opening_instance` / `opening_evidence` | Phase 1 |
| Initial candidate set + selected candidate + score components | `selection_run` / `candidate_result` | Phase 1/3 |
| Human corrections, field-by-field, with a **reason code** | `review_feedback` | **new — Phase 1** |
| Final issued line (the ground-truth label) | `revision_line` | exists |
| Versions in force (catalogue `_rev`, rule, ranker, pricing) | selection/pricing snapshots | Phase 1 |

The **final issued quote is the gold label for two models at once**: extraction/reconciliation accuracy (did we read the files right? — label = corrected openings) and selection/ranking (did we pick the right product? — label = final issued product per opening).

**`review_feedback` capture schema (D1, Phase 1):**
```
review_feedback(
  id, project_id, opening_id, selection_run_id,
  field,                         -- which field/decision was changed (e.g. width, operation, product, option, price)
  initial_value_json,           -- what the system proposed (+ initial candidate id + catalogue _rev)
  final_value_json,             -- what the human/issued line settled on (+ final candidate id + catalogue _rev)
  category,                     -- reason-code CATEGORY (taxonomy below) — MANDATORY, no free-text-only
  reason_code,                  -- specific code within the category
  reviewer_id, note,            -- optional free text in addition to the code, never instead of it
  catalogue_rev, rule_version, ranker_version, pricing_version,
  created_at
)
```

**Reason-code taxonomy (routes each correction to the right fix — the crucial part):**

| Category | Example | System response (which layer improves) | Feeds the ranker? |
|---|---|---|---|
| `extraction_correction` | wrong width, missed W-code, wrong room | corrected field → extraction eval set → prompt/parser/page-routing | no |
| `reconciliation_correction` | leaves grouped wrong; wrong source precedence | reconciliation test set → precedence/mapping rule | no |
| `catalogue_data_correction` | missing dimension limit / stale performance / wrong compatibility | **raise a catalogue/admin issue — do NOT train the ranker to compensate** | no |
| `deterministic_rule_correction` | a hard rule was absent or wrong severity | add/patch versioned rule + tests; re-run affected evals | no |
| `preference_correction` | reviewer chose another *compliant* candidate for cost/lead-time/practicality | **the only** bounded ranker training signal | **yes (capped)** |
| `commercial_correction` | discount, freight, quantity, account policy | pricing/policy logic; **not** an extraction/selection signal | no |

**Guardrails (non-negotiable):**
- A reason code is **mandatory** on every human change; free-text-only corrections are rejected. Without the category, a correction is noise — worse, it risks teaching the system to paper over bad catalogue data or a broken rule.
- **Only `preference_correction` may influence ranker training**, and its weight is capped so it can never override a deterministic hard rule.
- Capture is subject to the retention/consent policy (§14): no customer file is used for training outside the approved internal process.
- Capture writes are best-effort and **never block** issuing a quote — a capture failure logs and continues; the quote is the customer's priority, the corpus is a background asset.

**Continuity with the delivered branch:** the existing `parse_line` (initial extraction) + `quote_line` (current values) already hold a thin slice of this for the schedule stage. Phase 1 generalises it into `opening_instance`/`opening_evidence` and adds `review_feedback` with reason codes — so even an early, mostly-manual operating mode starts building the corpus.

---

## 7. Evolving the delivered `feat/schedule-upload` (don't waste it)
- `parse_line` → generalise to `opening_instance` + `opening_evidence` (add page/bbox provenance, per-field confidence, precedence). Keep the schedule parser as extraction source #1.
- Synchronous `/parse` route → a **Workflow** stage (idempotent). The design doc Appendix D already specifies the staged-then-atomic-apply approach.
- In-memory `scheduleMatch` best-fit → `CatalogueRepository` + rules engine with versioned snapshots. The customer-vs-technical review split, quota, validation, and download hardening carry forward unchanged.
- `review_json {field:reason}` → the richer opening confidence + reason-code model (superset).

---

## 8. Decisions needed (surface, not blocking)
1. **Appetite:** full 7-phase program, or a bounded next increment (I'd recommend **Phase 0 report + Phase 1 skeleton** first — real value, de-risks the data question, no AI cost)?
2. **Who owns catalogue data** — the Sanity schema enrichment (engineering) *and* the performance/pricing/composite data sourcing (AMJ/business)? This is the critical path.
3. **Workers AI on?** Required from Phase 2; brings the previous review's spend/cache/logging requirements.
4. **Build on `feat/schedule-upload`?** Recommended yes — it's explicitly retained by the spec.

## 9. What I can do immediately (offer)
- **Generate the catalogue-readiness report now** from live Sanity — the exact list of published products missing estimator-critical fields (dimension bounds, performance, etc.), which is Phase-0 backlog item §16.1 and the fastest way to make the data gap concrete for AMJ.
- **Draft the concrete Sanity schema additions** (`configuration`, `dimensionRule`, `performanceVariant`, compatibility predicates, `pricingRef`, `schemaVersion`) as a reviewable proposal.
- **Build the Phase-1 platform skeleton** (D1 migrations + R2 layout + Workflow + `CatalogueRepository`) on the branch.

---

## Addendum — corrections after review discussion (2026-07-24)

**1. Schema now, values later (confirmed).** Sanity technical fields will be added up front and populated over time. The estimator degrades per-field, so this is safe: an empty performance field resolves to `catalogue_data_incomplete` and routes to technical review — it is **never** treated as "no constraint." Compliance features light up field-by-field as values land, with no code change. Hard rule: an empty/absent performance value = "unknown, needs a human", not a pass.

**2. Pricing is NOT in Sanity (corrected).** Sanity is the *public, published* catalogue, so it must not hold commercially sensitive pricing. Pricing (rate card, option surcharges, formulas, margins) lives in **Cloudflare D1 — private, server-computed, never returned to the browser as a breakdown**. The customer sees only the computed estimate. Consequences for the plan:
   - Revise §3, §5, §10 and Phase 4: the shared pricing service reads a **private D1 rate card**, not Sanity price inputs. "Frontend parity" = the public configurator and the estimator both call the **same private Worker pricing endpoint** and get the same computed number — not shared Sanity price fields.
   - Sanity `option` documents keep only the **technical** catalogue (name, type, availability, compatibility). **Move `option.pricingComponent` out of Sanity into the private D1 pricing store** — currently it holds placeholder $0/$100 values, so migrate before real numbers are entered.
   - This aligns with the existing repo intent ("pricing stays server-computed, no per-option breakdown returned").

**3. "Versioning" clarified — nothing heavy to build.** It is two small things, not a product version-control system:
   - **Snapshots (essential; already implemented).** At issue/accept, the product facts + computed price are copied into the immutable `revision_line` / `order_line`. This preserves the agreed deal against later Sanity edits (e.g. a customer accepts a $5,000 quote; a later catalogue edit must not retroactively change that order). This is a point-in-time copy in D1, **not** versioning Sanity.
   - **Recording the catalogue revision (trivial; optional).** Sanity already versions every document (`_rev`). We only store that `_rev` + timestamp on a selection run for audit/reproducibility ("which catalogue state produced this estimate?"). Saving a string — no machinery.
   - There is **no** requirement to build product versioning inside Sanity or D1.

**4. Learning capture moved to Phase 1 (new).** Because the ability to learn from every *upload → issued quote* set is the long-term critical path, the **capture** layer (`review_feedback` + reason-code taxonomy + initial-proposal snapshot + version stamps) is pulled out of Phase 6 into **Phase 1**, and records from the first real quote — even under manual/assisted operation. Model **consumption** (ranker, eval, dashboards) stays in Phase 6. Full schema, reason-code taxonomy and guardrails are in **§6a**. Rationale: capture is cheap and must be early; a quote issued before capture exists is an unrecoverable lost training example.
