# 02 — Design: price deltas on the "Why this product?" ladder

Spec: `01-spec.md` (criteria 1–20). Grill: `00-ask.md` (D1–D5, binding).

## Summary

The figure already exists on disk — `CandidateOutcome.price.deltaToSelected`
inside `candidate_result.outcome_json`. This feature moves it across exactly one
seam (the `candidateOf` allow-list), formats it in exactly one place
(`whyCopy.ts`), and renders it in exactly one place (`WhyDetail.tsx` ladder
rows). **No migration. No schema change. No route change. No new endpoint.**
The `d1-migration-safety` skill is not engaged because `migrations/` is not
touched — nothing here writes the database at all; this is a read-side change
over a column that already carries the fact.

No arithmetic is performed anywhere in this feature. The stored delta is the
rendered delta (criterion 13). Any multiplication, gross-up or re-pricing is a
defect per D2.

## Affected files — hand-off index

Every entry is where the change lands. The developer should not need to search.

| File | Anchor | Change |
|---|---|---|
| `src/data/rationale.ts` | `RationaleCandidate` (line 25); header comment block (lines 8–14) | Add `deltaToSelected: number | null` field with sign-convention doc comment. Rewrite the "WHAT IS DELIBERATELY ABSENT" header: the price **delta** is now deliberately present (D1 reversal, 2026-09-02); still absent by shape: candidate `price.total`/currency, exclusions, learned, withheld, `variantId` on `current`. |
| `worker/lib/estimator/rationale.ts` | `candidateOf` (line 60) and its comment (lines 56–59) | Add `deltaToSelected: typeof o.price?.deltaToSelected === "number" ? o.price.deltaToSelected : null` as an explicit field. Rewrite the comment: the delta is allowed (D1); `price.total`, `exclusions` and `learned` remain forbidden; still additive from an allow-list, never a spread. Optional chaining is the criterion-6 mechanism: a pre-price outcome has no `price` object and maps to `null`. |
| `worker/lib/estimator/rationale.ts` | `lineRationale` (line 146), runner-up slice (lines 224–228) | **No change.** Cited because criteria 9/16 are proven against them: membership stays `runnersUp.slice(0, 4)`; entry stays the single project-scoped SELECT. |
| `src/data/recommendation.ts` | price block comment (~line 112, "GST-free") | Criterion 12: rewrite to the true basis — the same tax-inclusive rate-card figure as `quote_line.line_total`; `computePrice` performs no GST arithmetic. No type change. |
| `src/ops2/projects/whyCopy.ts` | new export beside `candidateFigures` (line 561); `ladderNote` (lines 539–549); header rules list (line 15, "D18 — no money, ever") | Add `deltaText` (below). Rewrite `ladderNote`'s ≥5 branch: drop "No price, nothing to price, and" — keep "The chosen product and the next four by rank" and "nothing here changes the line." Update the header's money rule: one delta per runner-up (D1 reversal); still no GST/tax/basis wording (D2), no totals, no second figure. |
| `src/ops2/projects/WhyDetail.tsx` | `Body` ladder rows (lines 80–102); import list (lines 4–8) | Render the delta per row via `deltaText`; D5 readability restructure of the row (below). Rows stay `<li>`, zero handlers (R28, criterion 20). |
| `src/ops2/styles/line.css` | `wd__row*` rules | New `wd__row-delta` style; whatever grid/flex change the row restructure needs at ops2 breakpoints (criterion 19). Final look is the UX/polish stage's. |
| `scripts/tests/why-rationale-api.test.mjs` | `mentionsMoney` (lines 94–97), self-check (line 108), X-AC-5 test (lines 389–396); fixtures (lines 144–182) | Flip from "no money ever" to "delta yes, everything else no" (below). |
| `scripts/tests/ops2-why.test.mjs` | `BANNED` (lines 38–51), scanner self-checks (lines 72–76), `ladderNote` tests (lines 500–504) | Re-scope the money bans; add `deltaText` unit tests; add the criterion-12 comment scan (below). |
| `scripts/tests/web/ops2-line-why.spec.ts` | ladder-row assertions (lines 888–896) | Extend with delta text per row; line 896 (no `button, a, [role=button]` in rows) already proves criterion 20 and must stay green. |
| `CONTEXT.md` | "Candidate outcome" entry (line 200) | Already updated by the architect: delta now surfaced on the ops ladder; exclusions/learned stay dark. |

Not touched: `worker/routes/ops.ts` (route at lines 741–749 already staff-only
and thin), `WhyPanel.tsx` (ASSUMED: ladder only — UX stage may extend),
`migrations/`, anything customer-facing.

## Interfaces

### Contract (`src/data/rationale.ts`)

```ts
export interface RationaleCandidate {
  // …existing fields unchanged…
  /** Candidate total MINUS the selected total, verbatim from the stored
   *  outcome. Negative ⇒ cheaper than the pick; 0 on the pick; null when
   *  either side was unpriced OR the record predates price on the candidate
   *  contract. The skin renders null as "$---" (D4) and renders nothing on
   *  the chosen row. The ONLY money field on this surface: no total, no
   *  currency, no basis wording (D2). */
  deltaToSelected: number | null;
}
```

A bare field, not a nested `price: {…}` object — see rejected alternatives.

### Formatter (`src/ops2/projects/whyCopy.ts`)

```ts
/** The ladder's one money figure (D1/D2). Chosen row: nothing — the pick is
 *  the baseline, and "+$0" would claim a direction that does not exist
 *  (criterion 4). null: "$---" — a fact about the record, never $0 or a blank
 *  (D4). Whole dollars, same shape as queue.ts/record.ts money on ops. */
export function deltaText(delta: number | null, chosen: boolean): string | null {
  if (chosen) return null;
  if (delta == null) return "$---";
  const r = Math.round(delta);
  const figure = `$${Math.abs(r).toLocaleString("en-AU")}`;
  return r === 0 ? figure : `${r < 0 ? "-" : "+"}${figure}`;
}
```

Notes the developer must keep:
- `Math.round` + `toLocaleString("en-AU")` is the existing ops money precedent
  (`src/ops2/projects/queue.ts:492`, `record.ts:705`) — reused, not invented.
  It is identity on the integer deltas the engine stores today; criterion 13's
  test uses `100 → +$100`.
- A true `0` on a *runner-up* (two products, same price) renders `$0` with no
  sign — a recorded same-price fact, distinct from `$---` (uncalculable) and
  from the chosen row (no figure). The spec is silent on this cell; this is a
  technical call, tested.
- Lives in `whyCopy.ts` so the string-table tests scan it. Never format in JSX.

### Render (`src/ops2/projects/WhyDetail.tsx`)

Per ladder row, compute `const delta = deltaText(c.deltaToSelected, i === 0)`
and render, only when non-null:

```tsx
<span className="wd__row-delta" data-testid="why-row-delta">{delta}</span>
```

D5 restructure: name (+ chosen mark) reads first; thermal figures, verdict and
delta share the row's second visual line so all three read at a glance without
truncation at ops2 breakpoints (criterion 19). Exact layout/CSS is the UX and
polish stages' to finish; the DOM seam above (class + testid) is fixed so tests
don't chase markup. Constraints inherited unchanged: rows are `<li>`, no
handlers, delta never pressable (R28, criterion 20); no date stamp or staleness
caption (criterion 8); 5% band naming and verdict wording untouched (criterion
10).

## Sequencing

1. **t1 — worker + contract + API tests** (red first): fixtures and flipped
   assertions in `why-rationale-api.test.mjs`, then `candidateOf` +
   `RationaleCandidate` + both header comments + the `recommendation.ts`
   comment fix.
2. **t2 — copy module + copy tests** (independent of t1; `deltaText` takes
   `number | null`, not the DTO): BANNED re-scope, `deltaText` tests,
   `ladderNote` rewrite, criterion-12 source scan.
3. **t3 — render + E2E** (after t1 and t2): `WhyDetail.tsx`, `line.css`,
   `ops2-line-why.spec.ts`.

## Test plan — criterion map

**`scripts/tests/why-rationale-api.test.mjs`** (in `test:why`, wired):
- Split `mentionsMoney` into `mentionsForbiddenMoney` =
  `/"price"|"total"|"currency"|"AUD"|GST|\$/i` (the DTO field is bare, so the
  `"price"` key stays bannable) — self-check at line 108 keeps proving it can
  see a leak. `deltaToSelected` moves from banned to REQUIRED.
- X-AC-5 test (line 389) flips: forbidden set still absent from the raw body;
  `body.recommended.deltaToSelected === 0`; alternatives carry `65, 50, -30,
  -50` verbatim from the fixtures (criteria 1, 13 at the contract level).
- Criterion 6: add one fixture outcome with NO `price` key (or reuse the
  pre-price run) → its mapped `deltaToSelected === null`; the record otherwise
  serves exactly as today.
- Criterion 11: a fixture outcome carrying `exclusions` and `learned` (extend
  the outcome builder at line 56) → raw body has neither key while deltas are
  present (`mentionsExclusion`/`mentionsWithheld` stay green).
- Criteria 9/10: existing membership/thermal/tier assertions stay green
  unchanged — that IS the proof.
- Criteria 14/15/16: existing X-AC-3 manufacturer 403 (line 616, body exactly
  `{"error":"forbidden"}`), the unauthenticated/role loop (line 607), and the
  cross-project 404 (line 648) already execute the abuse; add one assertion
  each that the refusal body does not contain `deltaToSelected` or `$`.

**`scripts/tests/ops2-why.test.mjs`** (in `test:why` and `test:ops2`, wired):
- `BANNED`: drop `/\$/`; keep `/\bGST\b/i`, `/\bAUD\b/i`, `/\b(ex|inc)\s+GST\b/i`;
  add criterion 7's vocabulary: `/\btax\b/i`, `/\binc\b/i`, `/\bex\b/i`,
  `/\bincl\b/i`, `/\bexcl\b/i`, `/inclusive/i`, `/exclusive/i`. Update the D18
  comment (lines 44–49) to name the new rule. Scanner self-checks: `+$100` is
  clean; `$1,840.00 ex GST` still flags (via `ex`/`GST`); `inc GST` flags.
- `deltaText`: `(100,false)→"+$100"` and never `"110"` (criteria 2, 13);
  `(-200,false)→"-$200"` (3); `(null,false)→"$---"` (5); `(0,true)→null` and
  `(65,true)→null` (4); `(0,false)→"$0"`; `(1840,false)→"+$1,840"` (en-AU
  grouping); outputs match none of
  `/gst|tax|\binc\b|\bex\b|inclusive|exclusive/i` (7).
- `ladderNote(5)` keeps `/the next four by rank/` (line 500) and no longer
  contains `/no price|nothing to price/i`.
- Criterion 12, cheaply: the test already reads source files — read
  `src/data/recommendation.ts`, assert the price-block comment no longer
  matches `/GST-free/` and does match `/tax-inclusive/i`.

**`scripts/tests/web/ops2-line-why.spec.ts`** (in `test:web`):
- Rows show their deltas (`+$…`/`-$…`/`$---` per the spec's fixtures); chosen
  row's text contains no `$` (criteria 1–5 rendered); line 896's
  no-interactive-elements assertion stays green (20); no
  `/gst|tax|inclusive|exclusive/i` in the detail's text (7); no date/staleness
  wording near the delta (8). Criterion 19's "reads at a glance" is judged at
  the mock/polish gate; the E2E asserts presence, not aesthetics.

No new test files; no `package.json` change — all three files are already wired
(`test:why`, `test:ops2`, `test:web`).

Criteria not carried by a test, named:
- **17** (no customer surface): structural — the DTO is produced only by
  `lineRationale`, served only by the ops route behind `resolveStaff`;
  no customer bundle imports `src/data/rationale.ts` or `whyCopy.ts`. Verified
  at design-conformance review by import check, not by a new test.
- **18** (no manufacturer cost in logs): `CandidateOutcome` carries engine sell
  prices only — manufacturer cost/uplift does not exist in the stored outcome,
  so it cannot reach this surface. Neither `lineRationale` nor the route logs
  values, and this feature adds no logging. Residual risk: future logging added
  elsewhere; out of this feature's reach.

## Security

- **Data classification:** engine sell-price deltas — *commercial* (customer
  pricing data), not financial PII. No manufacturer cost or uplift exists in
  the stored outcome. New movement: the delta crosses from `outcome_json` to
  the ops-only rationale DTO. Smallest surface: one bare number per candidate;
  `total` and `currency` deliberately stay behind the allow-list.
- **Trust boundaries:** ops ↔ Worker only. No customer ↔ Worker or Worker ↔
  third-party crossing is added or changed.
- **Authorization per endpoint:** the one endpoint,
  `GET /api/ops/projects/:id/lines/:lineId/rationale`
  (`worker/routes/ops.ts:741`), is **unchanged**: `resolveStaff` (refuses
  manufacturer partners with 403 `forbidden` — `worker/lib/staff.ts`, the
  deliberate resolveStaff/resolveOpsUser split that fails closed) then
  `hasAssignedRole`. Query scoping: `lineRationale`'s single entry SELECT,
  `WHERE id = ? AND project_id = ? AND parent_line_id IS NULL`
  (`worker/lib/estimator/rationale.ts:146`) — a line id under the wrong
  project is a 404 with no body. The auth-present-but-query-unfiltered failure
  cannot occur here because the project id is bound into the only SELECT.
- **Abuse cases:** manufacturer partner reading competitor deltas → criterion
  14, executed by X-AC-3 (403, body is exactly `{"error":"forbidden"}`);
  unauthenticated → criterion 15 (line 607 loop); cross-project line id
  tampering → criterion 16 (404, line 648); customer-surface leak → criterion
  17 (structural, above); log leak → criterion 18 (no values logged, above).
  Enumeration of line ids yields 404s with no data. No replay surface — the
  endpoint is a read of an already-authorized session.
- **No logging of price values** anywhere in the touched paths; none added.

## Rejected alternatives

- **Nested `price: {…}` on `RationaleCandidate`** — invites `total` to ride
  along later, and breaks the API leak test's `"price"`-key ban. A bare field
  is the smallest surface and keeps the ban meaningful.
- **Forwarding `price.total` per candidate** — a second money figure (D2
  violation) and a larger commercial-leak surface for zero display need.
- **Formatting the delta in `WhyDetail.tsx`** — moves prose out of the string
  table and out of the copy tests' reach; `whyCopy.ts` exists precisely so
  bans are claims about one module.
- **Cents rendering** — spec ASSUMED whole dollars, matching the ask's own
  examples and both existing ops money formatters.
- **A staleness caption / date stamp** — D1 explicitly rejects the staleness
  premise; criterion 8 bans it.
- **A migration or new column** — the fact is already stored; a copy would
  violate one-place-per-fact.
- **A new `priced` boolean beside the delta** — `null` already distinguishes
  every state the display needs (D4 renders both null-causes identically).
- **An ADR for the R10 reversal** — `00-ask.md` records the decision, its
  reasoning and its supersession of R10/D18 verbatim from the owner;
  `CONTEXT.md` now carries the sharpened term. A third copy drifts.

## ASSUMED (carried from spec §4, owner may veto)

- Chosen row shows no delta figure at all (not `$0`).
- Whole dollars.
- Ladder (`WhyDetail`) only; `WhyPanel` summary card untouched unless the UX
  stage, with the owner, says otherwise.
