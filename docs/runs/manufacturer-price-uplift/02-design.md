# Design — Manufacturer's price and uplift

Stage 2, 2026-08-31. Implements `01-spec.md` (25 criteria). All four owner
decisions in `DECISIONS.md` are answered; none reopened here. The owner's door
clarification is binding: the Price panel becomes an `OpenablePanel` whose
`open` closure opens a `SidePanel` — no navigation, no new URL.

## Shape in one paragraph

Two nullable columns on `quote_line` (migration 0063, additive — no rebuild).
One pure arithmetic module `src/data/manufacturerPrice.ts` shared by panel and
Worker, so the preview the estimator sees and the figure the server stores are
the same function. One new project-scoped staff endpoint
`PUT /api/ops/projects/:id/lines/:lineId/manufacturer-price` mirroring the
existing override handler's guards. The existing override handler gains two
`NULL` assignments (criterion 13). `opsLineDto` and `record.ts` carry the two
new fields to the ops surface only — every customer-facing read maps named
columns, verified below, so nothing leaks by construction. New UI component
`src/ops2/projects/PricePanel.tsx` replaces LineReview's static Price `Panel`.

## Hand-off index (path → where the change lands)

| Path | Anchor | Change |
|---|---|---|
| `migrations/0063_manufacturer_price.sql` | new file | 2× `ALTER TABLE quote_line ADD COLUMN` |
| `src/data/gst.ts` | line 19 `const round2` | add `export` (module's own rounding, reused) |
| `src/data/manufacturerPrice.ts` | new file | `DEFAULT_UPLIFT_PCT`, `manufacturerExGst`, `upliftedLineTotal` |
| `worker/routes/ops.ts` | line 129 `LineRow`, line 150 `opsLineDto` | add `manufacturerPrice`, `manufacturerUpliftPct` (nullable) |
| `worker/routes/ops.ts` | after line 742 (rationale endpoint, the project-scoped-line precedent) | new `PUT /projects/:id/lines/:lineId/manufacturer-price` |
| `worker/routes/ops.ts` | lines 1274–1328 `PUT /lines/:id/price` | both UPDATE statements add `manufacturer_price = NULL, manufacturer_uplift_pct = NULL` |
| `src/ops2/projects/record.ts` | `RecordLine`, `parseLine` | the two fields only. **NO new `priceState`** — owner 2026-08-31: "a price is a price" (see §Wording) |
| `src/ops2/projects/PricePanel.tsx` | new file | OpenablePanel summary + SidePanel form + arithmetic rows + footer read-back |
| `src/ops2/projects/LineReview.tsx` | lines 273–284 (Price `Panel`) and line 197 `PRICE_STATE` | delete both; render new `price: ReactNode` prop in their place (same position, after `{why}`) |
| `src/ops2/projects/LinePage.tsx` | line 296–302 (`<LineReview …>`) | build `<PricePanel line record reload />`, pass as `price` prop (same pattern as `why`) |
| `scripts/tests/manufacturer-price.test.mjs` | new file (pure) | arithmetic + PricePanel markup |
| `scripts/tests/manufacturer-price-api.test.mjs` | new file (heavy) | endpoint, criterion-13, abuse cases |
| `scripts/tests/ops2-record.test.mjs` | existing suite | `parseLine` carries the two fields; `priceState` is UNCHANGED and returns no new value |
| `package.json` | `test:pure` (line 17), `test:heavy` (line 18) | append the two new files; add `test:manufacturer-price` convenience script |
| `CONTEXT.md` | Price override / Openable panel entries | **already updated by the architect** — no task needed |

`worker/routes/ops.ts` appears in one task only (task 2), with the three line
anchors above.

## Data model — migration 0063

`migrations/0063_manufacturer_price.sql`:

```sql
-- Additive only: no table rebuild, no DROP, so no cascade can fire.
-- Children referencing quote_line (for the record): quote_line.parent_line_id
-- (ON DELETE CASCADE, 0028), plus ON DELETE SET NULL refs from file(0003),
-- schedule tables(0012), opening_instance/learning tables(0022, 0047).
-- children affected: none — ALTER TABLE ADD COLUMN touches no rows.
ALTER TABLE quote_line ADD COLUMN manufacturer_price REAL;
ALTER TABLE quote_line ADD COLUMN manufacturer_uplift_pct REAL;
```

d1-migration-safety: rule 1 (additive) applies — no `PRAGMA defer_foreign_keys`,
no export ceremony required beyond the standing remote-apply protocol.
Attribution reuses `price_override_by` / `price_override_at` (0046) — criterion
15 says "matching the existing override path", and one attribution fact serves
both price paths (one place per fact). `manufacturer_price IS NOT NULL` is the
discriminator between the two paths; no state column.

## Arithmetic — one home

`src/data/manufacturerPrice.ts` (pure, no imports beyond `./gst`):

```ts
export const DEFAULT_UPLIFT_PCT = 30;
export type EntryBasis = "ex" | "inc";
/** Basis converts first (criterion 4): inc → /1.1, rounded to cents. */
export const manufacturerExGst = (typed: number, basis: EntryBasis) =>
  basis === "inc" ? round2(typed / (1 + GST_RATE)) : round2(typed);
/** Then the uplift, rounded to cents. NO $10 rounding on this path (grill D2). */
export const upliftedLineTotal = (exPrice: number, upliftPct: number) =>
  round2(exPrice * (1 + upliftPct / 100));
```

Panel preview and Worker commit both call these two functions — criterion 5's
live recompute and criterion 8's stored figure cannot diverge. `round2` and
`GST_RATE` come from `src/data/gst.ts` (export `round2`; it is currently local).
`round10` is never imported here.

## API

### New: `PUT /api/ops/projects/:id/lines/:lineId/manufacturer-price`

Project-scoped (criterion 24) — the rationale endpoint at `ops.ts:727` is the
route-shape precedent. Body: `{ price: number, upliftPct: number, basis: "ex" | "inc" }`.
The server receives the *typed* number and basis and runs the shared arithmetic
itself — the client's computed figures are display only, never trusted or
persisted (criterion 11).

Handler, mirroring `PUT /lines/:id/price` (`ops.ts:1274`) step for step:

1. `resolveStaff` → 403 (`isStaffUser` already excludes the `manufacturer`
   role — criterion 22's write half is the existing predicate, not new code).
2. `hasAssignedRole` → 403.
3. Load the line — the exact WHERE clause:

```sql
SELECT q.id, q.line_kind, q.line_total, q.price_calculated, q.parent_line_id
  FROM quote_line q JOIN project p ON p.id = q.project_id
 WHERE q.id = ?1 AND q.project_id = ?2 AND p.status_internal IN (
   'submitted','triage_pending','estimator_assigned',
   'technical_review_required','customer_clarification_required')
```

   `?2` is the `:id` path param. Not found → 404 — wrong project, nonexistent
   line, and out-of-window (D3) are the same code path and the same sentence,
   exactly as the line page's record-resolution rule states.
4. `line_kind === 'composite_parent'` → 409 (parents' totals are owned by their
   units — parity with the override).
5. Validate: `Number.isFinite(price) && price > 0`;
   `Number.isFinite(upliftPct) && upliftPct >= 0` (zero uplift legitimate,
   criterion 18); `basis` one of `"ex" | "inc"`. Any failure → 400
   `invalid_amount` / `invalid_uplift` / `invalid_basis` (criteria 16–19).
6. Compute: `ex = manufacturerExGst(price, basis)`;
   `total = upliftedLineTotal(ex, upliftPct)`.
7. `calculated = line.price_calculated ?? line.line_total` — same capture as the
   override, so the computed price stays derivable.
8. ```sql
   UPDATE quote_line SET line_total = ?, manufacturer_price = ?,      -- ex
     manufacturer_uplift_pct = ?, price_calculated = ?,
     price_override_by = ?, price_override_at = datetime('now'),
     edit_version = edit_version + 1, updated_at = datetime('now')
   WHERE id = ?
   ```
   No write to `project.status_internal` or any phase field (criterion 12).
9. `if (line.parent_line_id) recomputeComposite(...)` — parity with override.
10. `logEvent({ actor: staff.id, entityType: "quote_line", entityId, action:
    "line.price.manufacturer", before: { lineTotal }, after: { lineTotal:
    total } })`. **The manufacturer price does NOT go in the audit JSON, and
    neither does the uplift** — total plus uplift derives the cost
    arithmetically, so logging either half beside the total is logging the
    price (criterion 25). No `console.*` of the request body anywhere.
11. Return `{ ok: true, line: opsLineDto(fresh) }` from the `SELECT *` refetch.

Quote totals: nothing persists a total. The record read's `totalsFor`
(`record.ts`) remains the single client-side derivation; the panel calls
`reload()` after commit and the total recomputes from stored line totals
(criterion 11).

### Changed: `PUT /api/ops/lines/:id/price` (criterion 13)

Both UPDATE statements (set and clear branches, `ops.ts` ~1300–1315) gain
`manufacturer_price = NULL, manufacturer_uplift_pct = NULL`. Nothing else moves
— guards, logging, response unchanged.

### Read path

`opsLineDto` (`ops.ts:150`) adds `manufacturerPrice` and `manufacturerUpliftPct`
(nullable), which flow through the staff record read (`ops.ts:522→611`) — that
is the read surface for criteria 9 and 10; no separate GET.
`scripts/tests/api.test.mjs:913` asserts exact keys for **orderLines** DTOs
only, not quote lines — no existing assertion breaks, and the orderLines
assertion doubles as proof the contract DTO gained nothing.

**Criterion-23 leak audit (done during discovery, favourable):** every
customer-facing `quote_line` read maps named columns — `worker/lib/lines.ts:94
rowToApiLine` (named fields, no spread; `worker/routes/projects.ts:89`'s
`SELECT *` funnels through it), `worker/routes/quote.ts:230` (named SELECT),
`worker/lib/issue.ts:190` (named SELECT — so `order_line` and the issue
snapshot never receive the columns at all). The design requires **no change**
to any of these files; the leak test below pins them.

## UI — `src/ops2/projects/PricePanel.tsx`

One new component owning the whole Price surface; LineReview's static block and
its `PRICE_STATE` map move into it and are deleted at source.

- **Closed (summary — criteria 9, also renders every pre-existing state):**
  `OpenablePanel` `title="Price"` `testId="line-price"`, children = the same
  two-row markup the old Panel drew (`lp-panel__lines`): the figure
  (`money(lineTotal)` / "No rate") and the state row. State wording comes from
  `priceState(line)`, UNCHANGED — a line priced this way reads exactly like any
  other priced line. Door label
  (copy constant in this file, per OpenablePanel's contract): states the
  destination, e.g. "Set the price from the manufacturer's figure". Door test
  id derives as `line-price-open`.
- **Open:** `SidePanel` (`src/ops2/chrome/SidePanel.tsx`, unmodified — grill
  D8) with: the entry-basis switch (declares what the *typed* number includes;
  display carries no GST suffix on any figure, criterion 7), price field,
  uplift field
  (defaults: empty / `30` / ex — criterion 2; NO helper prose under either
  field, and no explanation of GST or the inc→ex conversion — mock approval;
  pre-filled from
  `line.manufacturerPrice` / `manufacturerUpliftPct` when stored — criterion
  10), three arithmetic rows (the manufacturer's price after any inc→ex
  conversion, the uplift with `+` delta, the resulting line price — no GST
  suffixes), footer read-back. All recompute per keystroke via the shared module
  (criteria 3–5); invalid or empty inputs disable confirm and blank the
  computed rows (criteria 16–17). **No clear action exists** (criterion 14 —
  D2).
- **Footer read-back (criterion 6):** the new line price beside its superseded
  figure in `<s>`, and NOTHING ELSE. **No project total** — owner ruling at the
  mock gate, 2026-08-31: it is noise on this decision. `totalsFor` is therefore
  NOT called from the panel, and the design's earlier candidate-total
  recomputation is deleted. The struck figure is also the only place the line's
  current price appears; the panel carries no lede restating it.
- **Cents formatter local to this file** — `toLocaleString("en-AU",
  { minimumFractionDigits: 2, maximumFractionDigits: 2 })`. `record.ts`'s
  `money()` stays whole-dollar; the panel's arithmetic is the one ops surface
  that needs cents (spec examples `1,240.00`).
- **Commit:** `PUT` the typed `{price, upliftPct, basis}`, on `ok` close the
  panel and call `reload()` (from `useProjectRecord`, passed by LinePage).
- **Wiring:** LineReview gains `price: ReactNode` prop rendered where the old
  Panel stood (after `{why}`); LinePage builds
  `<PricePanel line={line} record={record} reload={reload} />` — same
  router-free pattern as `why`. LineReview stays fetch-free.

Open/closed is local component state, not a URL — the owner's clarification
says the door "opens the SidePanel rather than navigating", unlike `/why`.

The panel opens whether or not the line already has a price ("No rate" lines
are exactly the ones an estimator prices off a phone call); criterion 1's
"line with a price" is the common case, not a gate.

## Security

**Data classification.** `manufacturer_price` and `manufacturer_uplift_pct`:
commercially sensitive cost data (commercial class — AMJ's pricing to us and
our margin on it). Smallest surface: two nullable columns, ops DTO only, no
customer payload, no audit JSON, no log line, never copied to `order_line` or
the issue snapshot (named-column SELECT in `issue.ts` guarantees it).

**Trust boundaries.**
- *ops ↔ Worker*: the only crossing that carries the values. Validated at step
  5 above; authorized by `resolveStaff` + `hasAssignedRole`.
- *customer ↔ Worker*: carries the resulting `line_total` only — unchanged
  code, pinned by the leak test.
- *Worker ↔ third parties*: none; nothing leaves the Worker.

**Authorization per endpoint.**
- `PUT /api/ops/projects/:id/lines/:lineId/manufacturer-price` — Staff only:
  `resolveStaff` → 403; `hasAssignedRole` → 403; `isStaffUser` excludes the
  `manufacturer` role. Scoping filter, exactly:
  `WHERE q.id = :lineId AND q.project_id = :id AND p.status_internal IN
  (<D3 five>)` — the project id comes from the path and is ANDed into the line
  lookup, so a cross-project line id is a 404, not a hit.
- `PUT /api/ops/lines/:id/price` (changed) — guards untouched; the change adds
  two NULL assignments inside the already-guarded handler.
- Read (staff record `GET /api/ops/projects/:id`) — existing staff gate; the
  manufacturer role is already refused there, which is criterion 22's read half.

**Abuse cases → where each is held.**
| Abuse | Held by | Test |
|---|---|---|
| Customer calls endpoint, own project (c20) | `resolveStaff` 403 | api test |
| Signed-out visitor (c21) | `resolveStaff` 401/403 | api test |
| Manufacturer partner, write (c22) | `isStaffUser` excludes role → 403 | api test |
| Manufacturer partner, read (c22) | record endpoint's existing staff gate | api test |
| Values on a customer surface (c23) | named-column mapping in `lines.ts` / `quote.ts` / `issue.ts` | leak test: commit a price, fetch customer project view, assert body contains neither `manufacturer` keys nor the price value |
| Cross-project line id (c24) | `AND q.project_id = :id` in the WHERE | api test |
| Price in logs/audit (c25) | logEvent carries `lineTotal` only, no uplift; no console of body | api test reads the `audit_event` row and asserts the price and uplift values absent |
| Parameter tampering (client-computed total) | server recomputes from typed inputs; no total accepted | api test |
| Enumeration (line exists elsewhere?) | 404 identical for wrong-project / missing / out-of-window | api test |

**Residual risk:** staff who can read the ops record can read every line's
manufacturer price — accepted; that is the feature. No finer-grained staff
partition exists in the product.

## Sequencing

1. **Task 1** — migration 0063 + `manufacturerPrice.ts` + `round2` export.
   Pure; everything else stands on it.
2. **Task 2** — the endpoint, criterion-13 change, DTO fields (all in
   `ops.ts`). Depends on 1.
3. **Task 3** — abuse-case tests against task 2's surface. Depends on 2.
4. **Task 4** — `record.ts` fields only, `priceState` untouched. Depends on 2
   (field names) but not 3.
5. **Task 5** — PricePanel + LineReview/LinePage wiring. Depends on 1 and 4.

## Test plan

| File | Suite | Proves |
|---|---|---|
| `scripts/tests/manufacturer-price.test.mjs` (new) | `test:pure` | arithmetic (c3, c4, c18 math, cents rounding, no round10); PricePanel markup: defaults (c2), disabled confirm on invalid (c16–17), no clear control (c14), arithmetic rows and struck-through read-back (c3–6), basis switch is entry-only (c7), pre-fill (c10), summary wording (c9) |
| `scripts/tests/manufacturer-price-api.test.mjs` (new) | `test:heavy` | commit stores exact figure + ex-GST price + uplift (c8), totals recompute (c11), phase untouched (c12), override clears manufacturer fields (c13), attribution (c15), 400s (c19), abuse c20–c25 executed for real |
| `scripts/tests/ops2-record.test.mjs` (extend) | `test:pure` | `parseLine` carries the two fields; a line priced this way returns the SAME `priceState` as any other priced line |

`package.json`: append the two new files to `test:pure` / `test:heavy`
respectively, plus `"test:manufacturer-price": "node --test --test-concurrency=1
scripts/tests/manufacturer-price.test.mjs scripts/tests/manufacturer-price-api.test.mjs"`.

## Rejected alternatives

- **Bare-line route (`PUT /lines/:id/manufacturer-price`), matching the
  existing override** — criterion 24 demands project-scoped resolution; the
  rationale endpoint is the newer precedent. The old override stays where it is
  (out of scope to move).
- **Client sends the computed ex-GST price / total** — server must own the
  arithmetic (criterion 11, tampering); sending typed+basis lets the server
  reproduce exactly what the panel showed via the shared module.
- **Dedicated attribution columns (`manufacturer_price_by/at`)** — criterion 15
  says "matching the existing override path"; two attribution facts for one
  price fact contradicts D4.
- **Uplift in the audit `after` JSON** — total + uplift derives the price;
  criterion 25 would be satisfied in letter and violated in arithmetic.
- **A GET endpoint for the panel** — the staff record read already carries the
  line; a second read is a second surface to guard.
- **Extending `Panel`'s budget mechanism to be openable** — OpenablePanel
  already exists and grill D8 forbids changing either chrome component; the
  summary is two fixed rows, no budget needed.
- **Storing the quote total** — forbidden by the existing SSOT; `totalsFor`
  reused for the display-only preview.

## Notes for the conductor

- `docs/mocks/manufacturer-price-uplift.html` does not exist. This feature adds
  UI; if the mock gate applies to this run it fires before task 5.
- CONTEXT.md is already updated (Manufacturer price term added; Price override
  and Openable panel entries sharpened) — no developer task for it.

Decisions needed: **empty** — all four owner decisions are answered in
`DECISIONS.md`; discovery raised nothing new that belongs to the owner.
