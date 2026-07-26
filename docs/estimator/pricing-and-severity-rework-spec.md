# Build spec — Pricing modifiers + Error/Warning severity rework

**Status:** approved design, NOT yet implemented. Hand-off for an implementing agent.
**Owner decisions captured:** 2026‑07‑26. **Branch:** `codex/ai-estimator-accuracy-learning-refactor` (currently deployed to `apertly/main`; prod version at time of writing `a5fe2ddb`).

This document is self‑contained — an agent starting cold can execute it. Read it fully before writing code.

---

## 0. Non‑negotiable guardrails (read first)

1. **UI changes are UX‑supervised.** Any customer‑visible change (line cards, sticky panel, copy, tiers) MUST be specced by the UX agent BEFORE implementing and reviewed AFTER. Do not freelance UI. (There is a long‑running UX agent context in this project; if unavailable, request a fresh UX consult.)
2. **Pricing is NEVER in the public Sanity catalogue.** The browser reads the Sanity dataset; putting rates/margins there leaks them. Per‑product pricing lives in the **private D1 pricing store** (`pricing_rate_card` etc., migration `0015`), referenced from Sanity only via `pricingRef`. See §4 for the one open decision this creates.
3. **No mock fallbacks.** Do not add hardcoded placeholder content as fallbacks for CMS/data‑driven values (owner directive — see memory `no-mock-fallbacks`). Empty stays empty / explicit, not fake sample text.
4. **Test gate before deploy.** `npm test` must be green (currently 174 tests) BEFORE any commit/deploy. Gate first, then commit, then deploy.
5. **Deploy process:** `npm run db:migrate:remote` (apply migrations to remote D1) → `git push apertly <branch>:main` → the Cloudflare git build deploys (or `npm run cf:deploy` directly if the git build stalls). **Migrations must be applied to remote BEFORE the code that needs them ships.** Do not skip.
6. **Two selection/pricing paths exist** and this rework UNIFIES their behaviour:
   - **Deterministic** (anonymous): `upload → /parse → src/data/scheduleMatch.ts (matchSchedule) → quote_line`. Client live pricing: `priceConfigured` in `src/data/configurator.ts`.
   - **AI** (registered): `upload → queued job → worker/lib/ai/pipeline.ts → estimator (worker/lib/estimator/*) → ai_proposal → quote_line`. Pricing: `worker/lib/estimator/pricing.ts` (`computePrice`/`priceLine`, private D1 rate card).

---

## 1. Owner decisions (locked)

| Decision | Choice |
|---|---|
| Oversized opening pricing | **Actual opening size × best‑fit product's rate** (extrapolate perimeter+area to the real dimensions; do NOT clamp to the product's max). Flagged indicative/composite. |
| Unreadable quantity | **Blocking ERROR** — never silently default to 1. |
| Pricing engine | **Single engine for both deterministic and AI**, reading a **per‑product pricing model** (rate + modifiers). The engine is just the shared calculator; the model lives per‑product. |
| No‑exact‑fit (size or thermal) | **Best‑fit + warning, always price.** Applies to BOTH paths — the AI does NOT leave it unpriced/"pending review"; its job is best‑match selection, so if the exact match doesn't exist it estimates best‑fit and warns. |
| Severities | **Two only: `error` and `warning`.** (No `info`.) |

---

## 2. The severity model

Replace the current implicit classification (`CUSTOMER_REVIEW_KEYS` vs `TECHNICAL_REVIEW_KEYS` key‑sets in `src/data/configurator.ts`, and the `customerBlocking`/`technicalOnly` recomputation in `src/components/ItemComposer.tsx`) with an **explicit severity per review reason** — one source of truth.

- **`error`** — critical input the CUSTOMER must supply; the line cannot be priced. **Blocks submission.** Membership: **missing/unreadable dimensions, missing/unreadable quantity, unknown measurement basis (frame vs opening).** That's it.
- **`warning`** — the opening is valid but there's a product/constraint mismatch that AMJ resolves. **Never blocks. Line is priced best‑fit (indicative).** Membership: oversized (composite), no exact catalogue family (substitute), material substitution (timber→aluminium), glazing mismatch, colour/hardware unavailable, thermal‑not‑exact.

**Data shape:** change `LineReview` (currently `Record<field, reasonString>` in `scheduleMatch.ts`) so each reason carries a severity, e.g. `Record<field, { severity: "error"|"warning"; message: string }>` — OR a parallel severity map. Pick one and thread it through `reviewClass`, `lineBlocksSubmission`, the ItemComposer tiers, and the sticky counters. Keep it backward‑compatible with existing `review_json` in the DB (migration or tolerant parse).

**Predicate unification (critical — this fixed a prior bug, don't regress):** the RED/blocking border, the header pill, AND the sticky count must ALL derive from ONE predicate = "has an `error`‑severity reason" (≡ `lineBlocksSubmission`). A priced line with only `warning`s is the sky "AMJ review" tier, never red. See the existing tier code in `ItemComposer.tsx` (~lines 617‑660) — it currently derives `customerBlocking = lineBlocksSubmission(item) || duplicate` and `technicalOnly = !customerBlocking && (hasReviewFlag || issues.length>0)`. Keep that single‑predicate discipline; just drive it off the new explicit severity.

---

## 3. Behaviour changes

### 3a. Unified best‑fit + warning (revert "no product for oversized")

A recent change (`src/data/scheduleMatch.ts` `pickProduct`) made oversized openings return NO product. **Owner has reversed this:** always select a best‑fit product and price it; oversized/no‑exact‑fit is a **warning**, not a no‑product state.

- `scheduleMatch.ts pickProduct`: when nothing fits, return the **best‑fit** product (closest/largest‑capacity, series‑biased) with `fits:false`. Set a `warning`‑severity `fit` reason ("Indicative — no standard product is made at {W}×{H} mm; AMJ will confirm a composite/custom unit and final price").
- **Oversized pricing:** price the **actual opening dimensions** (real W×H) at the best‑fit product's rate — NOT the product's max size. `computePrice` already takes raw W/H and does perimeter+area; just pass the real dims (it doesn't clamp). This intentionally may exceed the product's nominal range — that's the indicative composite estimate.
- **AI/estimator path:** mirror this. `worker/lib/estimator/rules.ts checkDimensions` currently HARD‑FAILS out‑of‑range candidates. Change so an out‑of‑range candidate is not eliminated but flagged `warning` (best‑fit), and the estimator still ranks/prices it. Preserve the safety invariant that *certified compliance* is never claimed on an estimated/mismatched line — a warning line is `commercial_only_estimate`, never a certified "ready".
- The `revert` also means updating `lineBlocksSubmission` (`configurator.ts`): an oversized/`fit` line is priced now, so it's non‑blocking because it HAS a price + a warning (not because of a special `!review.fit` exception). Re‑derive from severity: block iff any `error`‑severity reason.

### 3b. FIXED / no‑family openings

Same class as oversized (owner's point). A recognised type with no catalogue family (e.g. FIXED window) becomes a **warning**, best‑fit substitute priced, not a blocking error. Choose the nearest family as the best‑fit substitute (e.g. price a FIXED as the equivalent awning size), warned "Priced as {substitute}; AMJ will confirm a fixed unit." **Better long‑term:** add a FIXED family to the catalogue (data), but short‑term substitute+warn.

### 3c. Quantity + measurement basis as errors

- Parser: if quantity is unreadable, DO NOT default to 1 — mark an `error` `qty` reason (blocking).
- If measurement basis (frame vs opening) is unknown, mark an `error` (blocking) — it changes the size interpretation. (Confirm current parser behaviour first; `measuredBy` is currently optional.)

---

## 4. Per‑product conditional pricing modifiers

**Requirement (from manufacturer):** a universal‑but‑per‑product pricing rule, e.g. `if width > 1200mm then price = price + 10%`. Same rules applied to all products, but the rule lives within each product so any one can be tuned.

**Home: private D1, per product** (per guardrail 2). The per‑product rate card already exists (`pricing_rate_card`, keyed by `pricingRef`/family, migration `0015`). Extend it with an ordered modifier list.

**Data model** (new migration, e.g. `0026_pricing_modifiers.sql`):
```
CREATE TABLE pricing_modifier (
  id          TEXT PRIMARY KEY,
  rate_card_id TEXT NOT NULL REFERENCES pricing_rate_card(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,              -- application order
  when_field  TEXT NOT NULL CHECK (when_field IN ('width','height','area','qty')),
  when_op     TEXT NOT NULL CHECK (when_op IN ('>','>=','<','<=','==')),
  when_value  REAL NOT NULL,
  then_type   TEXT NOT NULL CHECK (then_type IN ('percent','fixed')),
  then_value  REAL NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1
);
```
Seed the universal rule onto every active rate card: `when width > 1200 then percent +10`. (Alternatively a `modifiers_json` column on `pricing_rate_card` — a JSON ordered list — is acceptable if a table feels heavy; the table is preferred for future ops authoring/queryability.)

**Engine application** (`worker/lib/estimator/pricing.ts computePrice`): after base (perimeter+area) + option surcharges, apply matching modifiers in `seq` order. Define stacking precisely: `percent` applies to the running subtotal; `fixed` adds a flat amount. Document the order in code. Snapshot the applied modifiers into `PriceSnapshot` for auditability (the platform already snapshots pricing per line).

**Values are private** — never return the modifier rules or per‑component breakdown to the browser; only the final `total` (existing `PriceSnapshot` discipline).

### DECISION REQUIRED — the two‑engines / client‑live‑pricing problem

The deterministic path shows a **live indicative price as the customer edits**, computed CLIENT‑side by `priceConfigured` (`src/data/configurator.ts`, hardcoded `RATES`). The authoritative engine is server D1 `computePrice`. To honour "single engine + pricing private", these must reconcile. Options — **confirm with owner before building:**

- **(A, recommended)** Server D1 `computePrice` is the single authoritative engine. The deterministic `/parse` (worker/lib/parse.ts) prices through it (not `priceConfigured`). For live client edits, the client keeps a rough preview but the SAVED/authoritative price is server‑computed and reconciled; OR add a small debounced server pricing endpoint the client calls on edit. The manufacturer modifier lives ONLY in D1 (not shipped to the browser).
- **(B)** Keep the client formula for live edits AND mirror the modifier into it — rejected: two places to sync = the exact divergence that caused a prior bug, and it ships pricing rules to the browser.

Do NOT implement modifiers in the client formula. If (A) with a server pricing endpoint is chosen, spec that endpoint (auth: same‑origin session/claim; input: product + dims + options; output: total only).

---

## 5. Sticky panel — two counters (UX‑supervised)

Currently `src/components/StickyQuotePanel.tsx` shows one count ("N need attention") fed by `attentionCount` in `src/pages/QuotePage.tsx` (= lines that block). Add a **second counter for warnings**:

- **Errors** → "N need your details" — gates submission (existing behaviour).
- **Warnings** → "N we'll confirm at review" — informational, does NOT gate.

`QuotePage.tsx` already computes `technicalCount` (non‑blocking review lines) — repurpose/rename to the warnings counter. **Get the exact copy, layout, and visual treatment from the UX agent** before building (they own the sticky‑panel grammar). Do not invent it.

---

## 6. Tests (required — this touches real‑customer pricing)

Add/extend in `scripts/tests/` (esbuild‑bundle pattern; see `schedule.test.mjs`, `unit.test.mjs`, `estimator-rules.test.mjs`):

1. **Severity mapping:** each review reason resolves to the correct `error|warning`; `error` ⇒ blocks, `warning` ⇒ doesn't.
2. **Best‑fit is a warning, never Ready:** an oversized / no‑family / substitution line is priced, flagged `warning`, submittable, and NOT status `Ready`/certified.
3. **Oversized pricing = actual size:** the indicative total reflects the real opening dimensions × best‑fit rate (not the product's max‑size price).
4. **Quantity error blocks:** an unreadable quantity is an `error` and blocks; it is never silently 1.
5. **Modifier:** `width > 1200` adds exactly 10%; `width ≤ 1200` unaffected; stacking order deterministic; modifier reflected in the snapshot total.
6. **Both paths agree:** the same opening priced via the deterministic path and the AI/estimator path yields the same total (single‑engine invariant).
7. **Invariant (keep from the last change, reframed):** any product OFFERED that's out‑of‑range appears ONLY as a `warning`‑flagged indicative line — never as a confirmed/Ready line.

---

## 7. Suggested sequencing

1. Migration `0026_pricing_modifiers` + seed the universal rule. Apply local, then remote at deploy.
2. `computePrice` modifier application + snapshot + tests (pure, fast feedback).
3. Severity model in `configurator.ts` + `scheduleMatch.ts` (data shape, `reviewClass`, `lineBlocksSubmission`) + tests.
4. Best‑fit+warning unification in matcher AND `rules.ts`/estimator + tests (incl. actual‑size oversized pricing, both‑paths‑agree).
5. Engine consolidation per §4 decision (deterministic prices via D1).
6. Sticky‑panel two counters + line‑tier copy — **UX consult first**, implement, UX review.
7. Full `npm test` gate → commit per slice → migrate remote → deploy → verify.

## 8. Acceptance criteria

- No customer ever sees a size‑incompatible product presented as a confirmed/Ready priced line; such lines are best‑fit **indicative warnings**.
- Only missing dimensions / quantity / measurement‑basis block submission.
- `width > 1200mm` adds 10% to that product's price, defined once, applied on both paths, never exposed to the browser.
- Deterministic and AI paths return identical prices for the same opening.
- Sticky panel distinguishes errors (gate) from warnings (informational).
- All UI reviewed by the UX agent. `npm test` green. Migrations applied remote before deploy.
