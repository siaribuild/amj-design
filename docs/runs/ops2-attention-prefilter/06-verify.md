# Verify — ops2 attention prefilter (round 2)

**Verdict: FAIL.** One high-severity defect. Both round-1 findings are genuinely
fixed — the worker DTO carries the two approved fields (F1) and pressing an
Attention row now opens exactly the set it counted (F2) — and I reproduced both
fixes from scratch rather than reading the build notes. The fix for F2, however,
moved the race rather than closing it: the one-shot flag it introduced is
consumed by the wrong lifecycle event on a click arrival, so a prefilter applied
by pressing a row **survives later navigation back into the queue**, which
criterion 11 forbids. A red test for it is now in
`scripts/tests/web/ops2-attention.spec.ts:177`.

Verified against `c1ec0507` on `feat/ops2-attention-prefilter`. Nothing in
`04-build.md` was taken on trust; every count, filter and refusal below was
executed.

## Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck:gate` | PASS — `✓ no fatal type errors (62 non-fatal remain)` |
| `npm run test:ops2` | PASS — 134 pass, 0 fail |
| `node --test --test-concurrency=1 scripts/tests/api.test.mjs` | PASS — 31 pass, 0 fail; the D1/abuse subtest ran (`✔ GET /api/ops/projects row DTO carries statusCustomer/orderStage; role abuse on projects and summary (247ms)`) |
| `npx playwright test scripts/tests/web/ops2-attention.spec.ts scripts/tests/web/ops2-projects.spec.ts` | PASS as shipped — 43 passed. With the tester's new red test added: 21 pass, **1 fail** (F4) |
| `npx playwright test scripts/tests/web/ops2.spec.ts ops2-navigation.spec.ts ops2-record.spec.ts` | 45 passed, 1 failed — `ops2-navigation.spec.ts:308` , which passes twice in isolation and alone as a file. Parallel-worker flake, unrelated to this feature (note N1) |
| Live abuse probes (`node scripts/tests-verify/abuse.mjs` against a real Worker) | PASS — 22/22 |

## Acceptance criteria

| # | Criterion | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | new submissions row lists exactly N submitted | PASS | `ops2-attention.spec.ts:148` `the submissions row lands on /projects listing exactly its predicate's fixture refs` — 1 row, `PA` only, PB–PF absent. Green. |
| 2 | being priced lists exactly N under_review | PASS | Same test, `inReview` — 2 rows, `PB`+`PC`, others absent. |
| 3 | ready to issue lists exactly N issuable | PASS | Same test, `readyToIssue` — 1 row, `PC` (the only `issuable: true` fixture row). |
| 4 | awaiting payment lists exactly N invoiced | PASS | Same test, `awaitingPayment` — 2 rows, `PD`+`PE`; `PF` (`orderStage: manufacturing`) absent. |
| 5 | the filter narrowed, not merely rendered a default | PASS | Those four tests assert every out-of-set ref has count 0 over the 6-row PA–PF fixture; `PF` matches no predicate at all. Also proved by mutation M1 below. |
| 6 | a state move shifts count and membership | PASS | `ops2-attention.spec.ts:203` `a fixture change between visits moves both the count and the list it opens` (1 → 2, PA gone, PG/PH listed). Node: `ops2-attention.test.mjs` state-move membership swap, green in the 134. |
| 7 | a project the issue gate refuses is neither counted nor listed | PASS | `ATTENTION_FILTERS.readyToIssue` is `(r) => r.issuable` (`src/ops2/projects/queue.ts:171`) — the server's own `issuableNow` verdict, never `status_internal`. `parseProjectQueue` under-claims (`r.issuable === true`, `queue.ts:497`). Node suite pins `readyToIssue === rows.filter(issuable)`. |
| 8 | a project the gate accepts is counted and listed | PASS | Criterion 3's test: `PC` is counted 1 and is the single listed row. |
| 9 | the active control is nameable on screen | PASS | `ops2-projects.spec.ts:190` — `queue-active-filters` contains `Ready to issue` as `.pq-flag[data-tone="brand"]`. Reached by a real click in criteria 1–4's tests too. |
| 10 | turning it off returns to `Needs us`, address clean | PASS | Same test — Clear applies `EMPTY_QUERY`: `Needs us` chip `aria-pressed=true`, both fixture rows back, URL bare (`history.replace` stripped `?attn=` on arrival). |
| 11 | any other route opens on `Needs us`, no filter | **FAIL** | Green only on the `page.goto` arrival path (`ops2-projects.spec.ts:147`). After the click path it is broken: prefilter and its strip survive rail navigation away and back. **F4**. |
| 12 | unknown filter value renders default, no error | PASS | `ops2-projects.spec.ts:215` — `?attn=bogus` plus three payloads: default 2 rows, no `queue-active-filters`, no `queue-error`, param stripped. `attentionFromSearch` is a closed key set (`queue.ts:188`). |
| 13 | Enquiries and Trade rows unchanged | PASS | `ops2-attention.spec.ts:251` → `/enquiries`, `:302` → `/customers`, both green; their counts still come from `parseSummary`'s two-key body, and their hrefs carry no query string. |
| 14 | a zero predicate draws no row | PASS | `ops2-attention.spec.ts:238` — a one-row fixture draws `submissions` only; the other three testids have count 0. |
| 15 | a failed projects fetch draws failure, never zero | PASS | `ops2-attention.spec.ts:287` — summary 200 + queue 500 → `attention-error` with `role=alert`, zero `attention-row-*`. `combineLoads` precedence verified in the node suite. (A malformed **200** is a different, uncovered case — note F5.) |
| 16 | the tests fail when the mechanism is disabled | PASS, mutation-proved | **M1**: `selectProjects`' attention filter replaced with `.filter(() => true)` → all four narrowing tests red. **M2**: the `justAppliedAttnRef` guard deleted → same four red. **M3**: `awaitingPayment` widened to `orderStage !== null` → node suite red (`actual: ['PD','PE','PF'] expected: ['PD','PE']`). The tests assert listed row refs, never chip state. |
| 17 | the only worker change is the two approved DTO fields | PASS | `git diff 4a1acc69..HEAD -- worker/` is 5 added lines in `worker/routes/ops.ts:426–430`: a three-line D1 rationale comment plus exactly `statusCustomer: r.status_customer` and `orderStage: r.order_stage ?? null`. Nothing else under `worker/`. Read off the live endpoint: `{"id":"p_order","statusCustomer":"closed","orderStage":"manufacturing"}` and `{"id":"p_submitted","statusCustomer":"submitted","orderStage":null}`. |
| 18 | signed-out plus filter renders no project data | PASS | `ops2-projects.spec.ts:245` — fresh context, `?attn=readyToIssue`: `queue-error` visible, `queue-row` count 0. Live probe: the anonymous document request leaks none of `p_submitted` / `OF-Q` / `Northcote` / `statusCustomer`. Qualification: the app shows the staff-role refusal rather than a sign-in screen, deliberately (`useProjectQueue.ts:64–75`) — the sign-in is Cloudflare Access on the host, which is off in local dev. |
| 19 | customer session on `/api/ops/projects` → 401/403, no rows | PASS — executed for real | `api.test.mjs:271–277` green against a live Worker/D1, **and** re-executed with the feature's own parameters: `customer GET /api/ops/projects?attn=readyToIssue` → **403** `{"error":"forbidden"}`, no `projects`; same for `?attn=submissions&wait=us`, `?attn=' OR 1=1 --`, `?attn=<script>alert(1)</script>`, `?attn=` + 4000 chars. |
| 20 | manufacturer partner session → 401/403, no rows | PASS — executed for real | `api.test.mjs:279–284`: partner (`partner-t1@partner.example`, a Worker booted with `MANUFACTURER_EMAIL_DOMAINS:partner.example`) → **403** on `/api/ops/projects` and `/api/ops/summary`, `assertNoCounts` clean. My own harness cannot mint that identity (`web-server.mjs` does not set the var), which is why this row rests on that suite — re-run and green this round. |
| 21 | non-staff on the summary endpoint → 401/403, no counts | PASS — executed for real | Live probe: anonymous and customer `GET /api/ops/summary?attn=readyToIssue` → **403**, none of the six count keys present. Anonymous is also pinned at `api.test.mjs:74`. |
| 22 | injected filter value renders default, nothing executed or echoed | PASS — executed for real | Client: `ops2-projects.spec.ts:215` (SQL fragment, script tag, 10 kB string) → default set, nothing echoed into the body. Server: the same payloads sent to `/api/ops/projects` **as staff** return byte-identical `projects` arrays to the unparameterised call, status 200, with no echo of `OR 1=1` or `<script>` anywhere in the response — the Worker never reads `attn`. |

## Findings

### F4 — HIGH — a prefilter applied by PRESSING an Attention row survives later navigation back into the queue (criterion 11)

`src/ops2/projects/ProjectsPage.tsx:91–116`. The F2 fix added `justAppliedAttnRef`,
set when the `?attn=` effect consumes the param and cleared by the *next*
`ionViewWillEnter`. That assumes the arrival's own lifecycle event always fires
after the effect and before the reader leaves. It does not: on a fast hop the
arrival's `ionViewWillEnter` never arrives, so the flag is still set when the
reader comes back, the reset hook consumes it as though this were the arrival,
and the prefilter is left in place for good. The queue then opens narrowed on a
plain rail navigation — the exact "the default is untouched; only an Attention
row's link sets a filter" promise of P5/criterion 11.

Instrumented proof (temporary `console.log`s in both callbacks, reverted; the
sequence is the whole flow, arrival then rail-away then rail-back):

    [PROBE] effect consumed attn, flag=true
    [PROBE] willEnter fired, flag=true search=
    strip: 1 rows: 1          <- after rail away and back; expected strip 0, rows 6

Only **one** `willEnter` fires across two entries. With deliberate waits inserted
between the hops, two fire and the reset works — which is why the shipped suite
misses it: `ops2-projects.spec.ts:147` arrives by `page.goto` (full document
load) and the shipped narrowing tests never navigate away afterwards.

Not a one-off: reproduced on the single-hop path, the multi-hop path
(Attention → Products → Attention → row), and after a browser Back
(`readyToIssue` still on, 1 row, strip lit).

Reproduce — the red test is committed to the shipped suite:

    npx playwright test scripts/tests/web/ops2-attention.spec.ts --reporter=line

Actual:

    1 failed
      ops2-attention.spec.ts:177 › a prefilter applied by pressing a row is reset by later rail navigation
    21 passed

    Error: expect(locator).toHaveCount(expected)
      waiting for getByTestId('queue-active-filters')
      14 × locator resolved to 1 element
         - unexpected value "1"
      at scripts/tests/web/ops2-attention.spec.ts:189

Three more failing cases are in the tester's scaffolding
(`scripts/tests-verify/web/attn-probe.spec.ts`, run with
`npx playwright test --config=playwright.verify.config.ts`): P1 (single hop),
P2 (multi hop), P4 (browser Back). P3, P5 and P6 pass — a second row's press
does replace the first prefilter, a reload returns the default set, and the
prefilter holds over the on-enter re-fetch.

The fix belongs in `src/ops2/projects/ProjectsPage.tsx`. The two behaviours are
one decision — "what query should this entry show?" — and splitting it across an
effect and a lifecycle callback that fire in an order neither controls is what
has now failed twice. A flag consumed by whichever event happens to run next is
still that split. Whatever replaces it, the criterion-11 test above and the four
narrowing tests must all be green untouched.

### F5 — LOW (debt) — a malformed 200 from the queue is drawn as a quiet day, not as failure

`src/ops2/projects/queue.ts:475` (`parseProjectQueue`) returns `[]` for a body
whose `projects` is not an array, so `combineLoads` reports `ready` with zero
rows, all four project rows are zero-suppressed (criterion 14) and the gate
renders Enquiries/Customers alone — no error, nothing saying the queue could not
be read. `parseSummary` treats exactly this shape as `degraded` and says so in
its own comment ("an under-claiming parse here is exactly the reassuring lie the
legacy dashboard told"); the two halves of the same page disagree.

Outside criterion 15 as literally written (that names a failed or error
response, and this is a 200), and it needs a Worker bug to reach — hence LOW and
the debt file rather than a developer session. Raise it to a fix if the owner
wants the queue's parse to match the summary's stance.

Reproduce:

    npx playwright test --config=playwright.verify.config.ts --grep "P7"

Actual: `attention-enquiries` visible, `attention-error` never appears
(`Timed out 10000ms waiting for expect(locator).toBeVisible()`).

### F6 — LOW (debt) — empty-state copy still diverges from the approved mock

Unchanged from round 1's F3. `src/ops2/projects/queue.ts:379–380` ships
`Nothing here is “<label>” any more.` / `This set moved on after Attention
counted it.`; the mock and `03-ux.md` §5 say `… now.` / `These projects moved on
after Attention counted them.` Same meaning; changing it also means editing the
pinned assertion at `scripts/tests/ops2-projects.test.mjs:467`.

### N1 — note, not a finding — `ops2-navigation.spec.ts:308` flakes under parallel workers

`the two navigation surfaces agree about the back button` failed once in a
three-file parallel run and passed both times in isolation and as a whole file
alone. It touches nothing this feature changed. Pre-existing harness flake;
recorded so the next round does not read it as a regression.

## Tester scaffolding left in the tree (untracked, delete after the fix)

- `scripts/tests-verify/web/attn-probe.spec.ts` — P1–P7 above.
- `scripts/tests-verify/abuse.mjs` — criteria 19/21/22 against a live Worker
  (`node scripts/tests/web-server.mjs` first).
- `scripts/tests-verify/live-rows.mjs` — the four predicates over the real seed
  through the real endpoint.
- `playwright.verify.config.ts` — points Playwright at that directory.

The one change to a shipped file is the red test at
`scripts/tests/web/ops2-attention.spec.ts:177`. No implementation code was
touched by the tester; the three mutations (M1–M3) were reverted and
`git diff -- src/ worker/` is clean apart from the feature's own commits.

## Re-verification, when F4 lands

    npx playwright test scripts/tests/web/ops2-attention.spec.ts     # 22 pass, F4's test green
    npx playwright test --config=playwright.verify.config.ts         # P1, P2, P4 green (P7 = F5, deferred)
    npx playwright test scripts/tests/web/ops2-projects.spec.ts      # no regression, 22 pass
    npm run test:ops2 && npm run typecheck:gate                      # no regression
    node --test --test-concurrency=1 scripts/tests/api.test.mjs      # 31 pass, DTO + abuse block
