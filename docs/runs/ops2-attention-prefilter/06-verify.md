# Verify — ops2 attention prefilter

**Verdict: FAIL.** Two high-severity defects. The feature does not work on either of
its two real paths: the approved worker DTO change (`DECISIONS.md` D1, criterion 17)
was never implemented, so three of the four predicates read `undefined` off the live
`GET /api/ops/projects`; and on the browser side the one-hop click from an Attention
row lands on the unfiltered queue, so criteria 1–5 fail exactly as `04-build.md` t5
and `05-polish.md` both recorded. Everything else the spec asks for is built and
verified green.

Verified independently against the working tree at `2d426f3f` plus the uncommitted
polish and t1-test changes. Nothing in `04-build.md` or `05-polish.md` was taken on
trust.

## Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck:gate` | PASS — "no fatal type errors (62 non-fatal remain)" |
| `npm run test:ops2` | PASS — 134 pass, 0 fail |
| `node --test scripts/tests/api.test.mjs` | FAIL — 29 pass, **2 fail** (the new D1 test and its parent) |
| `npx playwright test scripts/tests/web/ops2-projects.spec.ts scripts/tests/web/ops2-attention.spec.ts` | FAIL — 39 pass, **4 fail** (all four narrowing tests) |

## Acceptance criteria

| # | Criterion | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | new submissions row lists exactly N submitted | **FAIL** | `ops2-attention.spec.ts:148` "the submissions row lands on /projects listing exactly its predicate's fixture refs" — `queue-row` resolved to 6 elements, expected 1. Also fails at the data layer: F1. |
| 2 | being priced lists exactly N under_review | **FAIL** | Same test, `inReview` case — 6 rows, expected 2. Also F1. |
| 3 | ready to issue lists exactly N issuable | **FAIL** | Same test, `readyToIssue` case — 6 rows, expected 1. (`issuable` itself is served by the worker; the browser race is what breaks this one.) |
| 4 | awaiting payment lists exactly N invoiced | **FAIL** | Same test, `awaitingPayment` case — 6 rows, expected 2. Also F1. |
| 5 | the filter narrowed, not merely rendered a default | **FAIL** | Those same four tests assert every `ALL_REFS` entry outside the expected set has count 0; the full PA–PF set renders instead. This is precisely the "opens a different set" defect the run exists to remove. |
| 6 | a state move shifts count and membership on reload | PASS | `ops2-attention.spec.ts:178` "a fixture change between visits moves both the count and the list it opens" — green (3-hop path, which does not hit the race). Node: `ops2-attention.test.mjs` state-move membership swap, green within the 134. |
| 7 | a project the issue gate refuses is neither counted nor listed | PASS | The count path reads `issuable` off the row DTO (`worker/routes/ops.ts:433–447`, `issuableNow`), never `status_internal`. `ops2-attention.test.mjs` asserts `readyToIssue === rows.filter(issuable).length` over the PA–PF fixture, green. |
| 8 | a project the gate accepts is counted and listed | PARTIAL | Counted: yes (as 7). Listed: fails for the same reason as criterion 3 — F2. |
| 9 | the active control is nameable on screen | PASS | `ops2-projects.spec.ts:185` "a valid ?attn= narrows to its set, and the strip's Clear returns to Needs us" — green; the strip renders the label as `.pq-flag[data-tone="brand"]`. Reachable only by direct URL today, since the click path (F2) never applies the filter. |
| 10 | turning the control off returns to `Needs us`, address clean | PASS | Same test — Clear applies `EMPTY_QUERY`; the param was already stripped by `history.replace(PROJECTS.path)`. |
| 11 | any other route opens on `Needs us`, no filter | PASS | `ops2-projects.spec.ts:147` "rail navigation and back from a record both reset the attention prefilter" — green. Plus `:128`, a sibling route's own `?attn=` is ignored. |
| 12 | unknown filter value renders default without error | PASS | `ops2-projects.spec.ts:215` "?attn=bogus and injection payloads render the default set, nothing echoed" — green. `attentionFromSearch` is a closed key set. |
| 13 | Enquiries and Trade rows unchanged | PASS | `ops2-attention.spec.ts:226` goes to `/enquiries`, `:277` to `/customers`, both green; their counts still come off the summary body (`attention.ts` `SummaryCounts`). |
| 14 | a zero predicate draws no row | PASS | `ops2-attention.spec.ts:213` "a fixture with no row matching a predicate draws no row for it" — green. |
| 15 | a failed projects fetch draws failure, never zero | PASS | `ops2-attention.spec.ts:262` "summary ok but the queue 500s draws attention-error, not a half-ready page" — green; `combineLoads` precedence is unauthorised > error > loading > ready. |
| 16 | the tests fail when the filter mechanism is disabled | PASS, and it is doing its job | Not hypothetical: the mechanism is effectively disabled on the click path and all four tests went red. They assert listed row refs, never chip state, so they cannot pass on a lit chip alone. |
| 17 | the only worker change is the two approved DTO fields | **FAIL** | The two approved fields were never added. `git diff a76b8119..HEAD -- worker/` is **empty**. `worker/routes/ops.ts:421–447` returns no `statusCustomer` and no `orderStage`; line 409 is still only the `lifecycleOf()` argument — the exact expression `DECISIONS.md` D1 warns about. F1. |
| 18 | signed-out plus filter renders no project data | PASS | `ops2-projects.spec.ts:245` "signed out, ?attn=readyToIssue hits the same wall as every other visit and shows no rows" — `queue-error` visible, `queue-row` count 0. |
| 19 | customer session on `/api/ops/projects` → 401/403, no rows | PASS — executed for real | Live-worker abuse block: customer `GET /api/ops/projects` → **403**, `body.projects === undefined`. |
| 20 | manufacturer partner session → 401/403, no rows | PASS — executed for real | Same run: partner session (`partner-t1@partner.example`) `GET /api/ops/projects` → **403**, no `projects`. |
| 21 | non-staff on the summary endpoint → 401/403, no counts | PASS — executed for real | Same run: customer and partner `GET /api/ops/summary` → **403**, `assertNoCounts` clean. Anonymous 403 is already pinned at `api.test.mjs:74`. |
| 22 | injected filter value renders default, nothing executed or echoed | PASS | `ops2-projects.spec.ts:215` loops a SQL fragment, a script payload and a 10kB string — default set, nothing echoed. Node: `attentionFromSearch` returns `null` for all four. Nothing reaches the server: the filter is applied client-side over rows already fetched. |

**On 19–21.** The abuse assertions live in the same subtest as the D1 DTO assertion,
so F1 aborted them before they ran. I re-ran that whole file from a scratch copy
(`scripts/tests-verify/`, outside the Probity scope, deleted afterwards) with only
the two DTO `assert.equal` lines replaced by a `console.log`, and the abuse block
executed green against a real local worker and D1:
`VERIFY statusCustomer= undefined orderStage= undefined` then `31 pass, 0 fail`.
That log line is also the cleanest single piece of evidence for F1.

## Findings

### F1 — HIGH — the approved worker DTO change (D1 / criterion 17) was never made; three of four predicates read `undefined` in production

`04-build.md` t2 states that "t1's worker DTO change was already committed/merged
before this task started". It was not. There is no worker commit anywhere in this
feature's range, and the row DTO still omits both fields. Three predicates
(`statusCustomer === 'submitted'`, `statusCustomer === 'under_review'`, and
`orderStage` in the two invoiced stages) therefore match zero rows against the live
API — and because criterion 14 suppresses zero rows, the Attention gate will silently
draw **no** submissions row, no being-priced row and no awaiting-payment row at all
in the real console. Only "ready to issue" survives, because it reads `issuable`,
which is already served.

No shipped test catches this: every node fixture and every Playwright stub supplies
the two fields by hand. The test that does catch it exists, is red, and is sitting
**uncommitted** in the working tree (`scripts/tests/api.test.mjs:246`) — the t1 red
test with no t1 green.

Reproduce:

    node --test --test-concurrency=1 scripts/tests/api.test.mjs

Actual:

    ✖ GET /api/ops/projects row DTO carries statusCustomer/orderStage; role abuse on projects and summary
      AssertionError: Expected values to be strictly equal:
      + undefined
      - 'submitted'
          at scripts/tests/api.test.mjs:249:14

The fix belongs in `worker/routes/ops.ts`, in the returned object of the `/projects`
map (around lines 421–447): add exactly `statusCustomer: r.status_customer` and
`orderStage: r.order_stage ?? null`, and nothing else. The `?? null` is load-bearing
per D1 — absence and null are different answers to the awaiting-payment membership
test, and the uncommitted test already pins both.

### F2 — HIGH — a one-hop click from an Attention row lands on the unfiltered queue (criteria 1–5)

`src/ops2/projects/ProjectsPage.tsx:87–105`. The `?attn=` consuming effect and the
`useIonViewWillEnter` reset race each other. On a first-ever, single-hop arrival at
Projects, the effect's `history.replace(PROJECTS.path)` commits and re-renders
`locationRef.current` to the now-bare search *before* Ionic's `ionViewWillEnter`
fires; the reset then sees no `attn`, treats the arrival as a plain re-entry, and
throws the just-applied prefilter back to `EMPTY_QUERY`. The comment at lines 97–100
— "the arrival that CARRIES the param is safe regardless, because at that enter
moment the search still holds it (the strip above happens in the effect, after)" — is
the false assumption; on a real transition the strip can happen first.

Deterministic on the direct Attention → Projects path, which is the only path a
reader actually uses. A 3-hop route passes, which is why criterion 6's test is green
while these four are not. Independently reproduced here, not carried over from
`04-build.md`.

Reproduce:

    npx playwright test scripts/tests/web/ops2-attention.spec.ts --reporter=line

Actual:

    4 failed
      ops2-attention.spec.ts:148 › the submissions row lands on /projects listing exactly its predicate's fixture refs
      ops2-attention.spec.ts:148 › the inReview row lands on /projects listing exactly its predicate's fixture refs
      ops2-attention.spec.ts:148 › the readyToIssue row lands on /projects listing exactly its predicate's fixture refs
      ops2-attention.spec.ts:148 › the awaitingPayment row lands on /projects listing exactly its predicate's fixture refs
      39 passed

    Error: expect(locator).toHaveCount(expected)
      waiting for getByTestId('queue-row')
      14 × locator resolved to 6 elements
         - unexpected value "6"
      at scripts/tests/web/ops2-attention.spec.ts:158:24

The fix belongs in `src/ops2/projects/ProjectsPage.tsx`: the reset must be gated on
something the consuming effect's own `history.replace` cannot erase before the
lifecycle callback reads it — a flag set when the param is consumed and cleared on
genuine exit, or folding both behaviours into a single effect. The four tests are
correct as written and must go green untouched.

### F3 — LOW (debt) — empty-state copy diverges from the approved mock

`src/ops2/projects/queue.ts` `emptyStateFor` ships `Nothing here is "<label>" any
more.` and `This set moved on after Attention counted it.` The mock and `03-ux.md` §5
both say `Nothing here is "<label>" now.` and `These projects moved on after
Attention counted them.` The meaning is identical. Already raised by `05-polish.md`
finding 2 and left because changing it also means editing the pinned assertion at
`scripts/tests/ops2-projects.test.mjs:467`. Defer to the run's debt file unless the
mock's exact words are the contract.

## Re-verification, when the fixes land

Both F1 and F2 already have their failing test written, so the round trip is:

    node --test --test-concurrency=1 scripts/tests/api.test.mjs        # F1 → 31 pass
    npx playwright test scripts/tests/web/ops2-attention.spec.ts       # F2 → 21 pass
    npx playwright test scripts/tests/web/ops2-projects.spec.ts        # no regression, 22 pass
    npm run test:ops2 && npm run typecheck:gate                        # no regression

F1's fix must also not widen the worker diff beyond the two D1-approved fields —
criterion 17 is checked with `git diff -- worker/`, and anything else there is a
finding for the user, not a silent implementation.
