# Design — Manufacturer price on a composite parent

Run: `ops2-composite-manufacturer-price`
Spec: `01-spec.md` (criteria numbered 1–27). Grill conclusions in `00-ask.md` are binding.

## 0. Shape of the change

One predicate decides ownership of a composite parent's `line_total`, and it already exists: `price_calculated` (migration 0046 — NULL means no override). Nothing new is stored, no migration is needed, and no new endpoint exists. Four moves:

1. `recomputeComposite` reads the parent's `price_calculated` and, when it is non-NULL, stops writing `line_total` — it keeps writing everything else it derives (segment qty, coverage, status, review retirement).
2. `PUT /api/ops/lines/:id/price` drops its `composite_parent` 409. Its existing clearing path (`total: null`) additionally runs `recomputeComposite` on a composite parent, so the restored figure is the **current** Σ(segments), not the Σ frozen at pricing time. Clearing is **endpoint-only by owner ruling** (D1, 2026-09-04): no console control reaches it for a composite parent, and none is added — a wrong entry is corrected by entering the right price.
3. The ops2 Price panel door opens on a composite parent — and its openability moves from a client-side guess (`!isOrder && lineKind !== "composite_parent"`) to a server-stated fact, `project.linesEditable`, derived from the same mutable window the endpoint enforces. Fail closed, like `delivery.editable` already does.
4. Unit rows already show no price in ops2 (verified: `Units` in `LineReview.tsx` renders code/name/size/note/options only). Criteria 14/15 are satisfied structurally; tests pin it so it stays that way.

**No migration.** `migrations/` is untouched; the d1-migration-safety procedure is not engaged.

## 1. Affected files (hand-off index)

| File | Where | Change |
|---|---|---|
| `worker/lib/composite.ts` | `recomputeComposite`, lines 188–255 | Parent SELECT (189–191) gains `price_calculated, line_total`. Ownership guard (see §2.1) around the total at 219–220 and the final UPDATE at 244–252. |
| `worker/routes/ops.ts` | `PUT /lines/:id/price`, lines 1414–1486 | Delete the 409 at 1449. `calculated` fallback for an unpriced sum (1463, §2.2). Clearing on a composite parent recomputes then audits the fresh figure (1466–1485, §2.2). Comment block 1427–1431 rewritten. |
| `worker/routes/ops.ts` | `GET /projects/:id` project payload, lines 581–611 | Add `linesEditable: ISSUABLE_FROM.has(p.status_internal)` (ISSUABLE_FROM is already imported — used at line 510). |
| `src/ops2/projects/record.ts` | `ProjectRecord` 144–165, `parseProjectRecord` 309–370 | New field `linesEditable: boolean`, parsed fail-closed (`p.linesEditable === true`). |
| `src/ops2/projects/LinePage.tsx` | Line 421–424 | `editable={!isOrder && record.linesEditable}` — the `lineKind` clause is deleted. |
| `src/ops/api.ts` | `opsSetLinePrice` comment, lines 196–198 | Stale "Refused on a composite parent (409)" doc comment corrected. Code unchanged (D1: `PriceCell`'s composite read-only branch stays as it is). |
| `scripts/tests/api.test.mjs` | Composite journey 509–604 (stale 409 assert at 593) + new subtests after it | Backend criteria + abuse cases (§5). |
| `scripts/tests/ops2-record.test.mjs` | Fixtures `body()` 79–92, `line()` 94–98 | `linesEditable` parse tests; unit-rows-show-no-price pin. |
| `scripts/tests/manufacturer-price.test.mjs` | Tests at 72–102 | Comment/name updates only: "a line the endpoint cannot reprice" no longer means composite parents; the editable-prop behaviour tested is unchanged. |
| `scripts/tests/web/ops2-record.spec.ts` | `record()` fixture, line 66 | Fixture gains `linesEditable: true` inside `project`; composite door + no-door-when-not-editable E2E. |
| `scripts/tests/web/ops2-line-why.spec.ts` | `record` fixture, line 86 | Fixture gains `linesEditable: true` (the price-door journeys at 1250–1340 depend on the door). |
| `CONTEXT.md` | §Manufacturer price (line ~80) | Sharpened (§6). Architect-owned; done in this run. |
| `docs/adr/0017-composite-parent-manufacturer-price.md` | New | Records the ownership-transfer decision. |

Untouched on purpose: `src/ops2/projects/PricePanel.tsx` (criterion 2 is already its behaviour — the readback footer shows `line.lineTotal`, which on a parent IS Σ(segments); "No rate" when the sum is unpriced; no clear control is added — D1), `src/data/manufacturerPrice.ts` (arithmetic home, unchanged), `src/ops/ProjectRecord.tsx` `PriceCell` (composite branch stays read-only — D1 option 2 is the named future one-liner if reverting ever bites), `Units`/`LineReview.tsx` (no price rendered today), `worker/lib/issue.ts` and every totals query (parents-only already — criterion 26 is structural), `migrations/`.

## 2. Interfaces and logic

### 2.1 `recomputeComposite` — ownership guard

The parent row read at the top gains two columns. Then:

```ts
// A human price on the parent (0046: NULL means none) takes ownership of the
// total — the manufacturer quoted the assembly as one unit, and Σ(segments)
// stops being the truth (grill conclusion 2). Everything else stays derived:
// qty, coverage, status, review retirement.
const owned = parent.price_calculated == null;
const effectiveTotal = owned ? total : parent.line_total;
```

- Final UPDATE binds `effectiveTotal` where it bound `total` — the `line_total=?` slot, the status derivation (`effectiveTotal == null ? "incomplete" : worst`), and the review-retirement CASE. On a priced parent this writes the value already stored (value-identical, criterion 8) and never writes `price_calculated` (recompute has never written it; that stays true).
- Status therefore still derives from the segments (criterion 9): a priced parent with an unpriced segment reads `worst` = `incomplete` through the segment's own status. **Residual, named:** such a parent still blocks issue via `ISSUE_BLOCKING_LINE_STATUSES` — the spec pins status-from-segments (criterion 9) and does not ask for issueability; criterion 24 governs only the save.
- The empty-segments branch (merge, lines 204–211) is untouched: a merged-back priced parent becomes a simple line that keeps its `line_total` and `price_calculated` — the existing merge rule for a priced line (criterion 27).
- Dimensions/qty/coverage writes: untouched (criterion 9).

### 2.2 `PUT /api/ops/lines/:id/price`

- Delete line 1449 (`composite_parent` 409). The mutable-window SELECT above it is unchanged (criterion 16's server half; spec assumption 3).
- `calculated` (line 1463) becomes:

```ts
// The figure the price replaces, captured once. On a composite parent this is
// Σ(segments) at the moment of pricing (spec assumption 4). When that sum is
// NULL — an unpriced unit never blocks a manufacturer price (criterion 24) —
// fall back to the saved total: on a parent the column's whole job is the
// "a human set this" test (0046) plus a historical note; restore-on-clear
// comes from recomputeComposite, never from this value.
let calculated = line.price_calculated ?? line.line_total;
if (line.line_kind === "composite_parent" && !clearing && calculated == null) calculated = total;
```

Simple-line behaviour is byte-identical (the fallback is parent-only).

- Clearing on a composite parent: after the existing UPDATE, run `await recomputeComposite(c.env, line.id)` — `price_calculated` is now NULL, so recompute owns the total again and writes the **current** Σ, or NULL when any segment is unpriced (criteria 12, 25, 13). The `calculated` value written by the clearing UPDATE is then immediately superseded; that is correct, not wasteful — the UPDATE is what flips ownership. Clearing remains endpoint-only (D1): correct and tested at the API, surfaced by no console control on this line kind.
- Audit honesty (criterion 23): move the `SELECT * … fresh` read before `logEvent` and log `after: { lineTotal: fresh.line_total, calculated }` — on a composite clear the restored figure is the recomputed one, not the stale Σ. The audit entry carries the resulting line total and the engine/sum figure only — never AMJ's figure, never the uplift (which never reach the Worker: the browser sends the finished `total`). No `console.log` is added anywhere on this path.
- The `if (line.parent_line_id) recomputeComposite(parent)` at 1475 (segment reprice) is untouched — with the §2.1 guard it now writes the segment's own price (criterion 11) and leaves a priced parent's total alone (criterion 10).
- The `clearing && price_calculated == null → unchanged: true` early return at 1464 is untouched — a summation-priced legacy parent is a no-op to clear (criterion 17; no backfill).

### 2.3 Existing behaviour deliberately unchanged (named so nobody "fixes" it)

- `PATCH /lines/:id` on a composite parent (ops.ts 1286–1296, 1343–1358): every spec edit clears `price_calculated` and recompute then restores Σ — i.e. editing the parent's own qty/size drops a manufacturer price. That is the existing re-arm rule every line follows ("a price agreed for a 1200mm window must not ride onto a 2400mm one") and the spec's criteria 10/27 cover segment operations only. Not a new decision; recorded in the ADR.
- Overriding does not touch `status`. A parent whose segments are all priced is `ready` already; one with an unpriced segment stays `incomplete` (see §2.1 residual).
- `src/ops/ProjectRecord.tsx` `PriceCell`: the composite branch stays read-only, its revert link stays unreachable on this line kind (D1 option 1). If reverting ever bites, option 2 is one condition in that branch.

### 2.4 ops2 door: `linesEditable`

The record endpoint already serves `statusInternal`, but the client must not re-derive the window (one place per fact — the window's home is the Worker). Precedent is `delivery.editable` (ops.ts 507–511): the server states the fact, the client fails closed. `linesEditable = ISSUABLE_FROM.has(p.status_internal)` — the exact set the PUT window enforces (the route's inline `mutableStates` list is the same five statuses). `LinePage` line 421: `editable={!isOrder && record.linesEditable}` — `!isOrder` kept as belt (order records build lines client-side and must never door).

Consequence beyond the composite: a **simple** line on an issued-but-unaccepted project loses a door that today opens onto a Confirm that can only fail. That is criterion 16's own wording made true, and the console's stated doctrine ("a record that cannot prove it is editable renders no door rather than a door onto a 409").

## 3. Sequencing

1. **t1** — `recomputeComposite` ownership (lib + api tests). The model change everything else leans on.
2. **t2** — the endpoint: 409 removal, `calculated` fallback, clear-recomputes, audit ordering, `linesEditable` in the record payload, abuse-case tests. After t1 (the clearing test needs recompute ownership).
3. **t3** — ops2 model + door (`record.ts`, `LinePage.tsx`, node UI tests). After t2 (payload field name agreed by a passing server test).
4. **t4** — Playwright: fixtures gain `linesEditable`, composite price-door journey, no-door-when-frozen, units-carry-no-price. After t3.
5. **t5** — CONTEXT.md sharpening + ADR + stale `src/ops/api.ts` comment. After t2.

## 4. Test plan

All backend tests live in `scripts/tests/api.test.mjs` (the composite journey already owns split/reprice/merge there; `composite.test.mjs` is pure geometry and gains nothing). The existing 409 assertion at line 593 inverts into the acceptance test. The `sql()` helper seeds/inspects `price_calculated` directly where no endpoint should exist to do it.

- **t1 (api.test.mjs, criteria 7–11, 13, 17, 27):** unpriced parent follows Σ through segment edit/reprice (7); SQL-seed `price_calculated` on a parent, then reprice/resize/add/remove a segment — parent `line_total`/`price_calculated` unmoved, segment's own price written, coverage/qty/status still re-derived (8–11); seeded-NULL legacy parent untouched on load and on recompute (17); merge of a priced parent keeps its price (27); after a clear, a segment reprice moves the parent again (13).
- **t2 (api.test.mjs, criteria 2–4, 6, 12, 16, 18–20, 22–26):** PUT on a composite parent 200s, `line_total` = sent total, `price_calculated` non-NULL (3); qty>1 parent stores the figure unmultiplied (4 — the endpoint stores what it is sent; the test pins that no server-side qty arithmetic appears); second PUT replaces the first, both directions (6); `total: null` restores current Σ, and NULL when a segment is unpriced (12, 25) — exercised at the endpoint, which is clearing's only surface (D1); save succeeds with an unpriced segment (24); issued project → PUT refuses (16, server half); unauthenticated 401/403 + row unchanged (18); customer session on their own project's line 403 + no write (19); manufacturer-partner session 403 on PUT and on the ops record read (20); customer project read shows the parent's lineTotal only — no field resembling a cost or uplift exists in the payload (22); audit row for save and clear carries `lineTotal`/`calculated` only, and the AMJ ex-GST figure used in the test appears nowhere in it (23); issue totals count the parent once, segments never (26).
- **t3 (ops2-record.test.mjs, criteria 1, 5, 14, 15, 21):** `parseProjectRecord` reads `linesEditable` and fails closed when absent; a composite parent line renders through `LineReview` with unit rows carrying no money string whether or not the parent is priced (14, 15); the Price panel shows exactly one figure and no marker text (5); the suite's existing no-bare-line-fetch structure stands for 21. `manufacturer-price.test.mjs`: comments and test names updated; behaviour assertions unchanged.
- **t4 (web specs, criteria 1, 2, 5, 14, 16):** composite parent line page shows the Price door with its accessible name; opening it shows the current total as starting state; confirm round-trips; a `linesEditable: false` record renders no door on any line; unit rows show no price.

Suite wiring: no new test file, so no `package.json` change — `test:api`, `test:ops2`, and the manufacturer-price entry in `npm test` already run every named file.

## 5. Security

**Data classification.** AMJ's figure and the uplift are commercially sensitive cost data and are *deliberately not stored, not transmitted to the Worker, and not logged* — the browser sends only the finished `total` (existing PricePanel behaviour, unchanged). New stored data: none. New moved data: `linesEditable`, a boolean derived from `status_internal`, which the same staff-gated endpoint already serves verbatim — no new exposure. `price_calculated` on a parent (Σ at pricing time) is commercial data already stored for every overridden line; it is served only in the staff-gated ops DTO (`opsLineDto`, ops.ts:179) and never in any customer payload (customer reads select their own fields; verified `worker/routes/projects.ts` line reads).

**Trust boundaries.** Ops browser ↔ Worker is the only crossing that changes. Validation at the crossing is unchanged: `resolveStaff` (refuses `role='manufacturer'` — `worker/lib/staff.ts:155–158`), `hasAssignedRole`, numeric-and-non-negative total, JSON body parse with failure default. Worker ↔ D1 and customer ↔ Worker are untouched.

**Authorization per endpoint.**
- `PUT /api/ops/lines/:id/price` — Staff only: `resolveStaff` + `hasAssignedRole`, then the line row is fetched with `WHERE q.id=? AND p.status_internal IN ('submitted','triage_pending','estimator_assigned','technical_review_required','customer_clarification_required')` joined through `project` — the window filter is in the query, not only in a check, so a frozen quote's line is *not found* rather than found-and-refused. There is no per-account scoping because Staff scope is global by design; the manufacturer-partner exclusion is the predicate with one home (`hasAssignedRole`).
- `GET /api/ops/projects/:id` — unchanged gate (`resolveStaff`), one added boolean.
- No new route, and no bare-line-id read exists in ops2 (criterion 21): the line page resolves through the record fetch, so cross-project probes hit the same absent-is-absent path.

**Abuse cases → criteria.** Unauthenticated write → 18 (executed). Customer writing their own line → 19 (executed — staff-gate, not ownership, is the control). Manufacturer partner reading or writing → 20 (executed; this is the actor with the strongest incentive to learn the uplift). Parameter tampering (negative/NaN total) → existing `invalid_amount` guard, exercised by the existing suite. Cost-data leak via audit/logs → 23 (executed against the audit row). Replay: a replayed PUT re-writes the same price — idempotent in effect, no monetary movement, accepted residual. Enumeration: line ids are UUIDs and the PUT answers 404 identically for absent and frozen lines; residual risk none beyond existing.

**Residual risks, named.** (1) Worker stdout is asserted clean only via the audit row, not by grepping runtime logs — no code path logs the request body today and none is added. (2) `calculated` in the audit entry is the sum/engine figure, which is commercial but staff-only and pre-existing. (3) The issued-window door removal depends on `linesEditable` parsing fail-closed; a stale cached record shows no door (fails safe).

## 6. CONTEXT.md sharpening (t5, architect-owned)

§Manufacturer price changes: (a) "for a whole line" gains "— a composite parent included: once set, the parent's total stops following Σ(segments), which keeps being computed and stored as the preliminary machinery and the fallback"; (b) the sentence "Entry is one-way: no clear action and no revert to the computed price" is replaced — clearing restores the computed price (the rate card's figure on a simple line; the **current** Σ(segments) on a composite parent, NULL while any segment is unpriced), and it is an *endpoint capability with no console control* (owner D1, 2026-09-04): a wrong entry is corrected by entering the right price; (c) unchanged: quantity never multiplies it, staff-only, never logged, same mutable window. ADR 0017 records the ownership transfer, the parent-PATCH re-arm as an existing rule kept, the `price_calculated` fallback-to-total on an unpriced sum, and the D1 ruling (endpoint-only clearing; v1 `PriceCell` un-gate named as the future one-liner).

## 7. Rejected alternatives

- **A new column / flag for "manufacturer priced"** — grill conclusion 6 forbids it; `price_calculated` non-NULL is the whole test.
- **Client-side derivation of the door from `statusInternal`** — duplicates the mutable window in a second codebase; the server states `linesEditable` instead (delivery.editable precedent).
- **`price_override_at` as the parent's "human priced" test** (dodges the unpriced-sum fallback) — grill 6 names `price_calculated` explicitly; two tests for one fact is the drift this codebase documents everywhere.
- **Skipping the whole UPDATE for a priced parent in recompute** — would also skip coverage/status/qty derivation, violating criterion 9; binding `effectiveTotal` keeps one statement and one writer.
- **Recompute-after-save on the PUT path** — a no-op by construction once ownership holds; not added.
- **A "quoted" badge / re-confirmation on split change** — rejected by the owner at grill (conclusions 3, 7).
- **A UI clear control (ops2 panel or v1 PriceCell un-gate)** — rejected by the owner (D1, 2026-09-04): clearing ships endpoint-only; the v1 one-condition change is the named upgrade path if reverting ever bites.
- **New backend test file** — api.test.mjs's Worker boot costs ~60s; a second boot for the same journeys is pure spend. Extended in place, twice, with line-scoped tasks.
