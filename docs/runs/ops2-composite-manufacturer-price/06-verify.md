# Verify — Manufacturer price on a composite parent

Round 1. Verified independently against `01-spec.md` §2 acceptance criteria.
Nothing in `04-build.md` was taken on trust; every claim below was re-run.

**Verdict: FAIL** — 3 blocking findings (F1 high, F2/F3 medium), 5 non-blocking.

The server-side work is genuinely good: `recomputeComposite`'s ownership guard,
the 409 removal, the clear-recomputes path and the audit re-ordering all behave
exactly as `04-build.md` claims, and the abuse cases are executed for real rather
than inspected. The failure is not in that code. It is that the branch **as
committed carries no Playwright coverage at all** (F1), and two surfaces the
spec names were left behind (F2, F3).

---

## Gates run

| Command | Result |
|---|---|
| `npm run typecheck:gate` | `✓ no fatal type errors (59 non-fatal remain)` |
| `npm run test:ops2` | `pass 112, fail 0` (40.8s) |
| `node --test scripts/tests/manufacturer-price.test.mjs scripts/tests/composite.test.mjs` | `pass 19, fail 0` |
| `npm run test:api` | `pass 79, fail 0` (279s) — incl. the three new composite blocks |
| `npx playwright test scripts/tests/web/ops2-record.spec.ts scripts/tests/web/ops2-line-why.spec.ts` | `68 passed (4.0m)` — **but see F1: run against working-tree files that are not on the branch** |
| `node scripts/probe-composite-mfr-price.mjs` (tester's adversarial probe, new) | see evidence below |

The probe is a live Worker + D1 harness (same boot as `api.test.mjs`) written for
this verification. It is at `scripts/probe-composite-mfr-price.mjs` and is the
reproducing command for F3, F4, F5.

---

## Acceptance criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Price panel is a door on a composite parent's line page | **PARTIAL — see F2** | Line page: Playwright `ops2-record.spec.ts` "a composite parent's Price door…" asserts `svg.lp-panel__chev` count 1 and `aria-label="Set this line's price"` — passed. Record **canvas** still refuses: `ProjectRecordPage.tsx:496`. |
| 2 | Calculator opens on the current total, no error, no refusal | PASS | Playwright asserts `line-price-readback` contains `$1,200.00` with nothing typed. Code: `PricePanel.tsx` footer renders `priceText(total ?? line.lineTotal)`. |
| 3 | PUT returns 200, `line_total` = uplifted figure, `price_calculated` non-NULL | PASS | `api.test.mjs` "composite: PUT /lines/:id/price accepts the parent" — 200, `line_total=850`, `price_calculated=850`. Probe P2: `{"line_total":1234.56,"price_calculated":1000}`. |
| 4 | qty > 1 never multiplies the manufacturer price | PASS | Same test: opening created with `qty: 2`, sent 850, stored 850. |
| 5 | Exactly one price number, no marker / basis switch / second figure / tax wording | PASS | `PricePanel.tsx` closed state renders a single `<li>`; `ops2-record.test.mjs` "R2/R5/D18 the banned vocabulary, over this module's WHOLE string table" passes. |
| 6 | Typed override ↔ manufacturer price replace each other, last write wins | PASS | Structurally one fact — one endpoint, one column pair. `api.test.mjs`: second PUT moves `line_total` 850→900, `price_calculated` stays 850. |
| 7 | `price_calculated` NULL ⇒ `line_total` = Σ(segments), NULL if any segment unpriced | PASS | `api.test.mjs` "an unseeded parent still follows the sum through a unit reprice". Probe P8 after the PATCH re-arm: parent back to 1000 = 500+500. |
| 8 | `price_calculated` non-NULL ⇒ `line_total` and `price_calculated` untouched by recompute | PASS | `api.test.mjs` "a priced parent's total survives every segment operation" — reprice / resize / qty / add / remove / merge, all `line_total=1500, price_calculated=1400`. Code: `composite.ts:223-224`. |
| 9 | Recompute still re-derives dimensions, quantity, coverage, status | PASS (status unasserted — F8) | Test asserts `coverage_delta_mm=100` and segment `qty=2`. **No `status` assertion exists** despite `04-build.md` t1 claiming one. Status derivation verified by reading `composite.ts:258` (`effectiveTotal == null ? "incomplete" : worst`) and probe P1/P2 (`"status":"ready"`). Note: recompute never wrote parent dims or parent qty, before or after — the guard cannot have broken them. |
| 10 | Σ(segments) moves, parent total does not; no flag/badge/re-confirmation | PASS | Same t1 test; no badge/flag string added anywhere in the diff (`git diff ffcbf87d..fda4d5d8` touches no badge or review-marker code). |
| 11 | A repriced segment still stores its own price | PASS | t1 test asserts segment `line_total=777` after the reprice. |
| 12 | Clearing → `price_calculated` NULL, `line_total` = current Σ (NULL if unpriced) | PASS at the endpoint | `api.test.mjs` composite journey: clear restores `sumBeforeParentPrice`; t2 block: clear → `line_total` NULL with a segment unpriced. **No console control reaches clearing** — owner ruling D1, design §6; the spec's Assumption 2 was superseded by it. |
| 13 | After a clear, recompute owns the total again | PASS | t2 block clears then the composite journey continues to assert Σ behaviour; `price_calculated` NULL ⇒ `owned` true. |
| 14 | Priced parent: no unit row shows a price | PASS (vacuous) | `ops2-record.test.mjs` "a composite parent's unit rows render no money string, priced or not" — `/\$/` false in `line-units` for both states. Units never rendered a price: `LineReview.tsx:121-180` has no money output. |
| 15 | Unpriced parent: unit rows show prices as today | PASS (vacuous) | Same — "as today" is "none". The spec's contrast premise was wrong; not a defect. |
| 16 | Issued / order line: not a door, PUT refuses | PARTIAL — see F2 | Server: probe P3 — PUT on an issued project returns **404**, row byte-identical (`P3 row unchanged: true`), `linesEditable: false`. Line page: Playwright asserts no chevron and no `line-price-open` on `linesEditable:false`, composite and simple. Record canvas gate is `orderNo == null`, not `linesEditable` — an issued-but-not-ordered project still shows a door there. |
| 17 | Legacy summation-priced parent unmoved, no backfill | PASS | `git diff --stat ffcbf87d..fda4d5d8` contains no `migrations/` change. `clearing && price_calculated == null → unchanged:true` early return untouched (`ops.ts:1478`). |
| 18 | Unauthenticated PUT → 401/403, no write | PASS (executed) | `api.test.mjs` t2 block: anonymous `Session` PUT → 403; `assert.deepEqual(after, before)` over `line_total, price_calculated`. |
| 19 | Customer session (incl. the project's own owner) → 403, no write | PASS (executed) | Same block: `custT2` — the owner of the project — PUT → 403; same before/after deepEqual. |
| 20 | Manufacturer partner → 403 on PUT and on the ops line payload | PASS (executed) | Same block: real `/api/ops/auth` sign-in as `partner-t2@partner.example`, with `MANUFACTURER_EMAIL_DOMAINS:partner.example` configured in the wrangler `--var`. Verified the role is genuinely pinned, not an accidental 403: `worker/lib/staff.ts:93-96` sets `role='manufacturer'` on every sign-in and `resolveStaff` (`:157`) returns null for it. Both `PUT /lines/:id/price` and `GET /projects/:id` → 403. |
| 21 | Line resolved through its project's record; a bare line id is not a route into pricing | PASS | `LinePage.tsx:66,72` — `useParams<{id, lineId}>`, then `record.lines.find(l => l.id === lineId)`. No bare-line-id fetch exists in ops2. Probe P9: `GET /api/ops/lines/:id/configurations` on a composite parent → 409. |
| 22 | Customer surfaces show the line total only, GST mode respected | **FAIL — see F3** | Rendered UI: PASS — `UnitRow.tsx:50` reads `segment.lineTotal` only as a boolean, never prints it; totals go through `taxBreakdown` (`src/data/gst.ts:58`) which respects the account mode. **API response: FAIL** — probe P4 returns `"lineTotal":1234.56` alongside `segments[].lineTotal: 500, 500`. |
| 23 | Neither AMJ's figure nor the uplift in logs or audit | PASS | Audit: `assert.deepEqual(Object.keys(after).sort(), ["calculated","lineTotal"])` for both save and clear. Neither AMJ's figure nor the uplift ever reaches the Worker — `PricePanel.tsx:97` sends `JSON.stringify({ total })` only, and no `console.log` was added on the path. Probe P5 does find the *line total* `1234.56` in dev Worker log output (issued-quote email payload) — that is the customer's own total, not the cost or the uplift, and criterion 23 names only the latter two. |
| 24 | An unpriced segment never blocks a manufacturer price | PASS | t2 block forces `line_total=NULL` on a segment and on the parent, then PUT 850 → 200, `price_calculated=850` via the fallback (`ops.ts:1476`). Probe P1 confirms the project then issues: `{"total":850,"goods":850,"delivery":0}`. |
| 25 | Clearing with unpriced segments → NULL, not 0, not the last figure | PASS | t2 block: `assert.equal(rowT2.line_total, null)` and the audit's `lineTotal` is `null`, not the stale 900. |
| 26 | Parent contributes once, segments contribute nothing | PASS | `worker/lib/issue.ts:195` — `WHERE project_id = ? AND parent_line_id IS NULL`. Probe P2: parent priced 1234.56 over a Σ of 1000, `issue-quote` returns `goods: 1234.56`. |
| 27 | Merge on a priced parent follows the existing merge rules | PASS | t1 test: after merge, `line_kind='simple'`, `composite_axis=null`, `line_total=1500`, `price_calculated=1400`. Code: `composite.ts:206-213` empty-segments branch touches neither column. |

---

## Findings

### F1 — HIGH — t4's Playwright coverage is not on the branch; it exists only in a stash another session created

**Criterion:** 1, 2, 5, 14, 16 (the client half) and the repo rule that a
UI-changing feature cannot pass without Playwright coverage.

**File:** `scripts/tests/web/ops2-record.spec.ts`, `scripts/tests/web/ops2-line-why.spec.ts` — both absent from every commit on the branch.

Two separate problems, one cause.

1. `run.json` lists `t4` in `tasksDone` with `code: 0`, but `04-build.md` has
   **no t4 section** — t1, t2, t3, t5 only. The stage reported success and wrote
   nothing.
2. t4's edits were never committed. Mid-verification the working tree was
   switched to `feat/ai-parse-monitoring` by a concurrent session, which stashed
   them:

```
$ git stash list
stash@{0}: On feat/composite-manufacturer-price: composite-manufacturer-price
           session's uncommitted spec edits (stashed by ai-parse-monitoring
           session 2026-09-04)

$ git log --oneline ffcbf87d..fda4d5d8 -- scripts/tests/web/
(no output)
```

The 68-passed Playwright run above was made **with those working-tree edits in
place** — the run is real, and `ops2-line-why.spec.ts:1219 MP-1 the Price panel
is a door` passing proves it, because that test cannot pass without the fixture's
new `linesEditable: true`. But what passed is not what is on the branch. Check
out `fda4d5d8` and run the same command and `MP-1`, `MP-2`…`MP-6` and every other
line-page door test fail: the fixtures do not carry `linesEditable`, so
`parseProjectRecord` fails closed and `LinePage` renders no door.

Reproduce:

```
git stash show -p stash@{0} --stat
#  scripts/tests/web/ops2-line-why.spec.ts |  2 +-
#  scripts/tests/web/ops2-record.spec.ts   | 48 ++++++++++++++++++++++++++++++++-
git log --oneline ffcbf87d..fda4d5d8 -- scripts/tests/web/    # empty
```

**Do not drop `stash@{0}`.** It is the only copy of the feature's client-side
coverage. Restore it onto `feat/composite-manufacturer-price`, commit it, append
the missing t4 build-log entry, and re-run
`npx playwright test scripts/tests/web/ops2-record.spec.ts scripts/tests/web/ops2-line-why.spec.ts`.

This also re-confirms the standing rule that verification and implementation must
not share a tree. Two sessions were writing to this directory at once, and the
loser was a test file.

### F2 — MEDIUM — the record canvas's Price panel still refuses a composite parent, on a gate that is now stale twice over

**Criterion:** 1 and 16, on the record-canvas surface.
**File:** `src/ops2/projects/ProjectRecordPage.tsx:495-496`

```
$ git show fda4d5d8:src/ops2/projects/ProjectRecordPage.tsx | sed -n '495,496p'
                          <PricePanel line={selected} reload={reload}
                            editable={record.orderNo == null && selected.lineKind !== "composite_parent"} />
```

The wide-desk canvas renders the **same** `LineReview` with the **same**
`PricePanel` as the line page, for whichever line is selected
(`ProjectRecordPage.tsx:114`, `:493-497`). The line page was updated
(`LinePage.tsx:423 → editable={!isOrder && record.linesEditable}`); this call
site was not. Consequences:

- A composite parent selected on the canvas still gets **no door** — precisely
  the refusal this feature exists to remove. Staff pricing a project after AMJ
  review will hit it, because the canvas is where a project is worked.
- The canvas gate is `orderNo == null`, not the server's `linesEditable`. An
  issued-but-not-ordered project therefore still shows a Price door there onto a
  404 — the exact "door onto a refusal" the `linesEditable` change was made to
  eliminate.

The developer flagged this in `04-build.md` t3 ("`ProjectRecordPage.tsx` still
gates its own PricePanel on `lineKind` … flag if the next task expects it aligned
too") and no later task picked it up.

### F3 — MEDIUM — the customer API response for a manufacturer-priced composite parent carries segment totals that no longer reconcile with the line total

**Criterion:** 22 — "any customer-facing surface (quote view, PDF, **customer API
response**) … shows the line total only".
**File:** the customer project read, `worker/routes/projects.ts:126` (the segment DTO's `lineTotal`)
**Repro:** `node scripts/probe-composite-mfr-price.mjs`, output line `P4 customer payload`

```
P2 sum before / parent after: 1000 / {"line_total":1234.56,"price_calculated":1000,"status":"ready"}
P4 customer project status: 200
P4 customer payload: {... "code":"W41", ..., "lineTotal":1234.56, ...,
  "segments":[{..."lineTotal":500,...},{..."lineTotal":500,...}] ...}
```

Before this change the payload was self-consistent — the parent's total *was*
Σ(segments), so the segment figures disclosed nothing. Now they disclose the
delta between the platform's own computed price and the price the customer is
being quoted. That is a margin, on a payload the customer can read.

The spec's Assumption 1 — "Segment prices are not shown on the record line list
or any customer surface today, so there is nothing else to hide" — is falsified
for the payload. It holds for the rendered UI: `src/components/quote-project/
UnitRow.tsx:50` consumes `segment.lineTotal` only as an `incomplete` boolean and
never prints it, and `taxBreakdown` (`src/data/gst.ts:58`) applies the account's
GST mode to the parent total as it does for any line. So the *screen* is right
and the *wire* is not.

Note this straddles §3's "nothing on the customer side changes" — nothing on the
customer side was changed, which is why it slipped. The decision (suppress
`segments[].lineTotal` when the parent carries `price_calculated`, or accept the
disclosure) belongs to the owner, not to me.

### F4 — MEDIUM — `PUT /lines/:id/price` accepts a numeric string and has no upper bound

**File:** `worker/routes/ops.ts:1457-1463`
**Repro:** `node scripts/probe-composite-mfr-price.mjs`, output lines `P6 …`

```
P6 total=-1: 400 {"error":"invalid_amount"}
P6 total="900": 200 {"ok":true,"line":{... "lineTotal":900 ...}}
P6 total=10000000000000: 200 {"ok":true,"line":{... "lineTotal":10000000000000 ...}}
P6 row after bad bodies: {"line_total":10000000000000,"price_calculated":600}
```

`const total = Number(body?.total)` coerces `"900"` into a price, and
`Number.isFinite` alone puts no ceiling on it. The delivery override on the same
router refuses both by design — `ops.ts:855-864`: *"A numeric STRING is refused:
`Number("250")` once made "250" and 250 two spellings of one price, and money
does not get two spellings"*, plus `body.amount >= 1e12 → invalid_amount`.

Pre-existing on simple lines and untouched by this diff — but this diff makes it
the entry path for a manufacturer's price on a whole assembly, so it is now
guarding a bigger number. Money validation at a trust boundary is on the
never-be-lazy list.

### F5 — LOW — a parent PATCH that changes nothing silently destroys the manufacturer price

**File:** `worker/routes/ops.ts:1348-1352` (the spec-edit re-arm), reached via `PATCH /lines/:id`
**Repro:** `node scripts/probe-composite-mfr-price.mjs`, output lines `P8 …`

```
P8 PATCH status: 200
P8 parent after a room-label PATCH: {"line_total":1000,"price_calculated":null,"room_label":"Living"}
```

The parent was at `line_total=4321, price_calculated=4321`. A
`PATCH {roomLabel:"Kitchen"}` returned 200, did **not** apply the change
(`room_label` is still `"Living"` — the route does not read that key), and still
cleared `price_calculated` and reset `line_total` to Σ(segments).

ADR 0017 records the re-arm as an existing rule deliberately kept, and ops2
issues no PATCH at all (grep: `src/ops2/**` contains one `/api/ops/lines/` call,
the price PUT), so this is reachable only from ops v1. Reported low rather than
medium for that reason. But it sits oddly beside criterion 10: resizing a
*segment* keeps AMJ's figure, while touching the *parent* — even with a body the
route ignores — destroys it without a word.

### F6 — LOW — stale doc comment left on `PricePanel`'s `editable` prop

**File:** `src/ops2/projects/PricePanel.tsx:62-64`

> *"the endpoint refuses a composite parent outright (its total is the sum of its segments)"*

t5 corrected the identical claim in `src/ops/api.ts:196-198` and missed this one.
`PricePanel.tsx` was outside every task's file list.

### F7 — LOW — the dashboard's `readyToIssue` stat counts segments, so it will disagree with the real gate

**File:** `worker/routes/ops.ts:325-326`

```sql
NOT EXISTS (SELECT 1 FROM quote_line l2 WHERE l2.project_id = p2.id
             AND (l2.status <> 'ready' OR l2.line_total IS NULL))
```

No `parent_line_id IS NULL` filter, unlike `issue.ts:195`. A manufacturer-priced
parent with an unpriced segment is issuable (probe P1: `issue-quote` 200,
`goods: 850`) but that project will not be counted in "Ready to issue".

**Honest caveat:** not reproduced end-to-end — the probe's project was
`status_internal='submitted'`, which this stat does not count in either case.
Reported from the query text against `issue.ts`'s. Confirm before spending a
session on it. Pre-existing query; harmless before this feature, because an
unpriced segment previously made the parent NULL too.

### F8 — LOW — t1's test does not assert the status re-derivation it claims

**File:** `scripts/tests/api.test.mjs`, "composite: a priced parent's total survives every segment operation"

```
$ git show fda4d5d8:scripts/tests/api.test.mjs | sed -n '926,1010p' | grep -n status
21:    // coverage, status. Seeded directly with sql() — no endpoint reaches this
```

The only hit is a comment. `04-build.md` t1 says "qty/coverage_delta_mm/status
still re-derive" and design §t1 lists status under criteria 8–11; the assertion
is not there. The behaviour is correct (verified by reading `composite.ts:258`
and by probe P1/P2 showing `"status":"ready"` on a priced parent) — the coverage
is missing, not the behaviour.

---

## Re-verification checklist for round 2

1. `stash@{0}` restored onto the branch and committed; t4 build-log entry written;
   `npx playwright test scripts/tests/web/ops2-record.spec.ts scripts/tests/web/ops2-line-why.spec.ts` green **from a clean checkout of the branch head**.
2. `ProjectRecordPage.tsx:496` aligned with `LinePage.tsx:423`, with a Playwright
   test that opens the Price door on a composite parent from the record canvas
   and asserts no door on `linesEditable:false`.
3. An owner decision on F3, and whatever it implies for the segment DTO, with a
   test pinning it.
4. F4 fixed test-first if the owner wants it in this feature; otherwise it goes
   to the run's debt file with F5–F8.
5. Everything in the table above re-checked from scratch — including the 21
   currently-PASSing rows.
