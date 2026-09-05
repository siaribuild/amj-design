# Acceptance — ops2 attention prefilter

**Verdict: REJECT.**

The one thing this run exists to do — press an Attention row, land on exactly that
set — does not work. Criteria 1–5 fail, criterion 8 fails on its "listed" half, and
criterion 17 (the worker change the owner explicitly approved in `DECISIONS.md` D1)
was never built at all. Everything else in the spec is built and independently
verified green, including all five abuse cases, three of them executed against a
live worker.

Judged from the tester's evidence (`06-verify.md`) and the four review reports
(`07-review-conformance.md`, `07-review-security.md`, `07-review-ponytail.md`,
`07-review-codex.md`, `07-review-architecture.md`). No tests re-run here, no source
read.

All four reviewers independently reached the same two defects. That agreement is
itself the evidence: this is not a flaky test.

## Criterion-by-criterion

| # | Criterion | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | new submissions → exactly N submitted | **NOT MET** | `ops2-attention.spec.ts:148` — `queue-row` resolved to 6, expected 1 (`06-verify.md` F2). Also dead at the data layer: F1. |
| 2 | being priced → exactly N under_review | **NOT MET** | Same test, `inReview` — 6 rows, expected 2. Also F1. |
| 3 | ready to issue → exactly N issuable | **NOT MET** | Same test, `readyToIssue` — 6 rows, expected 1. |
| 4 | awaiting payment → exactly N invoiced | **NOT MET** | Same test, `awaitingPayment` — 6 rows, expected 2. Also F1. |
| 5 | the filter narrowed, not merely rendered a default | **NOT MET** | Same four tests: the full PA–PF set renders. This is the original complaint, unchanged. |
| 6 | a state move shifts count and membership on reload | MET | `ops2-attention.spec.ts:178` green (3-hop path); node membership swap green within `test:ops2` 134 pass. |
| 7 | the gate's refusal is neither counted nor listed | MET | Count path reads `issuable`, never `status_internal`; `ops2-attention.test.mjs` asserts count equals the `issuable` filter over the PA–PF fixture, green. |
| 8 | the gate's acceptance is counted **and listed** | **PARTIAL — NOT MET** | Counted yes (as 7); listed fails with criterion 3 (F2). |
| 9 | the active control is nameable on screen | MET, reachable only by URL | `ops2-projects.spec.ts:185` green. Today a reader can only reach that state by typing the address, because the click path never applies the filter. Becomes fully real when F2 lands. |
| 10 | turning it off returns to `Needs us`, address clean | MET | Same test — Clear applies `EMPTY_QUERY`; param already stripped. |
| 11 | any other route opens on `Needs us`, no filter | MET | `ops2-projects.spec.ts:147` green, plus `:128` (sibling route's `?attn=` ignored). |
| 12 | unknown filter value → default, no error | MET | `ops2-projects.spec.ts:215` green; `attentionFromSearch` is a closed key set. |
| 13 | Enquiries and Trade rows unchanged | MET | `ops2-attention.spec.ts:226` (`/enquiries`) and `:277` (`/customers`) green; both still read summary counts. |
| 14 | a zero predicate draws no row | MET as specified — and it is what hides F1 | `ops2-attention.spec.ts:213` green. Correct behaviour, but combined with F1 it means the real console silently draws **no** submissions, being-priced or awaiting-payment row rather than showing anything wrong. |
| 15 | a failed projects fetch draws failure, never zero | MET | `ops2-attention.spec.ts:262` green; `combineLoads` precedence unauthorised > error > loading > ready. |
| 16 | the tests fail when the mechanism is disabled | MET, and proven the hard way | The mechanism is effectively disabled and all four tests went red. They assert listed row refs, never chip state — a lit chip cannot pass them. This is the one criterion the run added because the last run's tests were hollow; it worked. |
| 17 | the only worker change is the two D1-approved fields | **NOT MET** | `git diff a76b8119..HEAD -- worker/` is **empty**; `worker/routes/ops.ts:421–447` emits neither field. Confirmed independently by conformance review Finding 1 and Codex P1. |
| 18 | signed-out + filter renders no project data | MET | `ops2-projects.spec.ts:245` — `queue-error` visible, `queue-row` count 0. |
| 19 | customer session on `/api/ops/projects` → 403, no rows | MET — executed for real | Live worker: **403**, `body.projects === undefined`. |
| 20 | manufacturer partner session → 403, no rows | MET — executed for real | Live worker, `partner-t1@partner.example`: **403**, no `projects`. |
| 21 | non-staff on the summary endpoint → 403, no counts | MET — executed for real | Customer and partner both **403**, `assertNoCounts` clean; anonymous already pinned `api.test.mjs:74`. |
| 22 | injected filter value → default, nothing executed or echoed | MET | `ops2-projects.spec.ts:215` loops SQL fragment, script payload, 10kB string. Nothing reaches the server — the filter runs client-side over already-fetched rows. |

**Tally: 15 met, 6 not met (1, 2, 3, 4, 5, 17), 1 partial (8).**

Security acceptance is complete and genuinely executed — 18–22 all pass, three of
them against a real worker and D1, and the security review found no HIGH or MEDIUM.
That part of the spec is done.

## Silent descoping

One, and it is the serious kind.

**Criterion 17 / task t1 was reported as done and was not done.** `04-build.md:18`
states "t1's worker DTO change was already committed/merged before this task
started". There is no such commit anywhere in the feature range. The failing test
that proves it (`scripts/tests/api.test.mjs:246`) exists but sits **uncommitted** —
a red test with no green, which the next session cannot attribute to anything.

Business consequence, stated plainly: the owner was asked a question at a decision
gate, considered it, wrote a detailed YES with grounds, and the two lines he
approved were never typed. Three of the four Attention rows would then have shown
nothing at all in the real console — not a wrong number, no row — while every test
suite stayed green because each one hands the page fields the live API never sends.
The pipeline's own guard against this (criterion 17, checked with `git diff --
worker/`) is what caught it.

Nothing else was descoped: 03-ux's copy, the Enquiries/Trade rows, the default
filter, and `issuableNow` are all as specced.

## Scope creep

None of consequence.

- The worker diff is empty, so the "no worker change beyond two fields" bound
  cannot have been exceeded — it was under-met, not over-run.
- Conformance confirms nothing was built that the design did not name, and the
  untouched-on-purpose list (`FilterSheet.tsx`, `rows.tsx`, `useProjectQueue.ts`,
  `useSummary.ts`, `worker/lib/*`, `/api/ops/summary`, `seed.sql`) is absent from
  the diff. Given this repo's history of ops accumulating unrequested controls,
  worth saying out loud: it did not happen here.
- Minor hygiene: two working-tree files (`ProjectsPage.tsx`, `projects.css`) are
  uncommitted and unattributed (conformance Finding 2). They must be committed as
  polish before sign-off, not left mixed with the orphan red test.

## Findings that are not spec criteria

Carried forward for the developer loop, in priority order:

1. **F1** (verify) / conformance Finding 1 / Codex P1 / architecture P0 — worker
   DTO two-liner. Fix is exactly the two D1 lines and nothing else; `?? null` on
   `orderStage` is load-bearing.
2. **F2** (verify) / Codex P1 / architecture P0 — the `?attn=` effect races
   `useIonViewWillEnter`. The four browser tests are correct as written and must go
   green untouched.
3. **Architecture P1** — `emptyStateFor` claims "this set moved on" whenever an
   attention filter exists, even when the emptiness came from the reader's own
   search or chip. That tells staff a falsehood about their data. Not covered by
   any criterion of this spec; it is a real defect, and I would fix it in this loop
   rather than ticket it.
4. **Architecture P2** — "Search all" builds a `QueueQuery` without `attention`;
   full `tsc` reports TS2741, hidden by the fatal-only gate. One line.
5. **F3 / LOW (debt)** — empty-state copy differs from the approved mock
   (`"any more."` vs `"now."`, `"This set"` vs `"These projects"`). Same meaning.
   See the decision below.
6. **Ponytail — advisory, −31 lines available.** Duplicate `PROJECT_NOUNS` vs
   `ATTENTION_FILTERS[].label` across two files is the only one with a real future
   cost (a fifth key means editing two files or shipping a label with no noun);
   the rest is taste. My recommendation: take the `PROJECT_NOUNS` merge while
   fixing F1/F2, leave the others.

Architecture's deeper point on F1 deserves recording for the architect, not the
developer: the parser turned a missing transport field into a valid-looking zero
instead of a failure, which is the same shape of mistake criterion 15 exists to
forbid one level up.

## ASSUMED: tags — still unsigned

The owner answered D1 only. All four assumptions in spec §5 remain un-vetoed and
carry to final sign-off:

1. Rows may overlap — one project counted by two rows is correct, not a bug.
2. Filters ride the queue's **existing** control grammar; no new ops surface.
   *(Implementation added a visible active-filter strip with a Clear — that is the
   nameable control criterion 9 requires, not a new panel. Worth a glance at
   sign-off.)*
3. "Exactly N" compares against the filtered set's total; tests seed under the page
   size rather than adding pagination logic.
4. `/api/ops/summary` keeps its now-unread project counts; deleting them is a later
   lean-out pass.

None was contradicted by the build. All four need a yes or a veto before the
feature is signed off.

## What happens next

Back to the developer loop with F1, F2, architecture P1 and P2. Both blocking
defects already have their failing test written, so the round trip is short:

    node --test --test-concurrency=1 scripts/tests/api.test.mjs        # F1 → 31 pass
    npx playwright test scripts/tests/web/ops2-attention.spec.ts       # F2 → 21 pass
    npx playwright test scripts/tests/web/ops2-projects.spec.ts        # no regression
    npm run test:ops2 && npm run typecheck:gate                        # no regression

Then re-verify, and this acceptance is re-run against criteria 1–5, 8 and 17. The
15 met criteria do not need re-litigating unless the fix disturbs them.
