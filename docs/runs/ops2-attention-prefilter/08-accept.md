# Acceptance — ops2 attention prefilter (round 3)

**Verdict: ACCEPTED** — with one criterion met only in part (18), two durability
items routed to debt, and four `ASSUMED:` tags still awaiting the owner's yes or
veto. My acceptance is a recommendation; the owner gives final sign-off.

Round 2 rejected for one reason only: the last tester verdict on the branch was
FAIL on criterion 11, and the fix that followed (`a6ffc24d`) had never been
verified. That condition is now discharged. `06-verify.md` is an independent
round-3 report against HEAD `8bc0e74e`, re-run from scratch — nothing taken from
the build notes or the earlier verify — and criterion 11 is green on four
separate arrival paths, two of which (Back-then-Forward across the stripped
entry, and a full reload of the stripped address) were not covered before.

Judged from `01-spec.md`, `06-verify.md`, `DECISIONS.md`, `DEBT.md` and the five
review reports. No tests re-run here, no source read.

## What the owner asked for, and whether he got it

He said: *"if there, for example, '1 ready to be issued' then clicking it must
prefilter exactly that."* He does. Pressing "ready to issue" opens the queue
listing exactly the projects that were counted, and the count is the issue gate's
own verdict rather than a weaker SQL question that could promise work the issuing
screen would refuse. This was demonstrated twice over: against route fixtures in
the shipped browser suite, and against a real local Worker and D1 with no stubs
(`live-attention-probe.mjs`).

The decisive piece of evidence for the *reason this run exists* is criterion 16.
The tester disabled the mechanism in two different places and the tests went red
both times — the queue ignoring the filter turned the browser suite to 8 failed /
22 passed, and the four failures named were exactly the four "lands on /projects
listing exactly its predicate's refs" tests. Last run's tests were hollow; these
are not.

## Criterion-by-criterion

Evidence is at HEAD `8bc0e74e` unless stated. **LIVE** = executed against a real
Worker + D1, no stubs.

| # | Criterion | Verdict | Evidence (`06-verify.md`) |
| --- | --- | --- | --- |
| 1 | new submissions → exactly N, all `submitted` | MET | Row 1 — LIVE probe: count 1, list exactly `OF-Q-10003`, every other real ref absent; plus `ops2-attention.spec.ts:148` |
| 2 | being priced → exactly N, all `under_review` | MET | Row 2 — LIVE: `OF-Q-C7PROBE`, count 1, list exactly that |
| 3 | ready to issue → exactly N, all `issuable` | MET | Row 3 — LIVE after seeding a genuinely issuable project: count 1, list exactly that ref. The owner's own sentence, working |
| 4 | awaiting payment → exactly N invoiced | MET | Row 4 — LIVE: `OF-Q-10002`, count 1; fixture `PF` (`manufacturing`) excluded |
| 5 | the other three predicates' projects absent | MET | Row 5 — `spec.ts:162-164` `toHaveCount(0)` per key; LIVE probe asserts the same over real refs |
| 6 | a state move shifts count **and** membership | MET | Row 6 — `ops2-attention.test.mjs:141`; browser `spec.ts:203` "a fixture change between visits moves both the count and the list it opens" |
| 7 | the gate's verdict, not the old summary SQL | MET — decisive | Row 7 — LIVE: same DB, same moment, `/api/ops/summary` said `readyToIssue = 1` while the gate drew **no** row and `/api/ops/projects` gave `issuable count = 0`. `parseSummary` no longer accepts the field at all (`test.mjs:201`) |
| 8 | an `issuable` project is counted **and listed** | MET | Row 8 — LIVE: made `p_submitted` genuinely issuable; row drawn, press listed exactly it |
| 9 | the active control is nameable on screen | MET | Row 9 — `pq-flag` carries the filter's own label; `ops2-projects.spec.ts:198` "Ready to issue", `:163` "New submissions", tester probe C10 |
| 10 | turning it off → `Needs us`, bare address | MET | Row 10 — probe C10: after Clear, `search === ""`, `Needs us` `aria-pressed=true`, all 6 rows back |
| 11 | any other route opens clean (the round-2 blocker) | **MET — the fix is now verified** | Row 11 — four independent paths green: rail away/back, back-from-record, Back-then-Forward across the stripped entry, and full reload of the stripped address |
| 12 | unknown filter value → default, no error | MET | Row 12 — `ops2-projects.spec.ts:216` plus probe C12: repeated parameter (first wins) and case variant (`?attn=Submissions` → default set, no error) |
| 13 | Enquiries and Trade rows unchanged | MET | Row 13 — `spec.ts:251` `/enquiries`, `:302` `/customers`; project rows carry `?attn=`, these two carry no query at all |
| 14 | a zero predicate draws no row | MET | Row 14 — `spec.ts:238`; LIVE: on the real seed, two predicates matched nothing and drew nothing |
| 15 | a failed projects fetch draws failure, never zero | MET as written | Row 15 — `spec.ts:287` queue 500 → `attention-error`, zero rows. A malformed **200** is the residual — finding V3, debt |
| 16 | the tests must go red when the mechanism is disabled | MET — mutation-proved twice | Row 16 — M1 (selector ignores the filter) reds the node suites; M2 (page applies `EMPTY_QUERY`) reds 8 browser tests, the four named being exactly criteria 1–4. Both reverted, tree clean |
| 17 | only the two D1-approved `worker/` fields | MET | Row 17 — `worker/routes/ops.ts` only, 5 lines: the two fields plus a rationale comment. Independently confirmed by conformance review and by security review |
| 18 | signed-out browser → **sent to sign-in**, no project data | **PART MET** | Row 18 + finding V1. Data half PASS, executed live: `403`, `queue-error`, **0** rows, no `OF-Q-*` anywhere in the document. Destination half FAIL: the signed-out visitor is told to "ask an administrator to add the role" and the chrome chip reads "Signed in". Both behaviours pre-date this branch and are untouched by it |
| 19 | Customer session → 403, no rows | MET — executed live | Row 19 — real session (`/api/auth/me` confirms), then `403 {"error":"forbidden"}` on `/projects`, on `?attn=…`, and on `/summary`. Regression-locked `api.test.mjs:270` |
| 20 | Manufacturer partner → 403, no rows | MET — executed live | Row 20 — a real manufacturer identity inserted and signed in; `403` on both endpoints; refused at `resolveStaff` |
| 21 | any non-Staff on the summary → 403, no counts | MET — executed live | Row 21 — anonymous, customer, manufacturer all `403`, no count keys in any body |
| 22 | injected filter value → default, nothing runs or echoes | MET — executed live | Row 22 — probe C22 proves the payload never *ran* (`window.__pwned` undefined) for four payloads incl. `'; DROP TABLE project; --`; the value never reaches the server |

**Tally: 21 met, 1 part-met (18), 0 unmet.**

Security acceptance is complete and genuinely executed rather than asserted:
18–22 were run against a live Worker and D1 with real sessions for three
different identities, and the security review traced the untrusted `?attn=`
value to a closed key set with no injection sink, no reflection, no SQL contact.
No HIGH or MEDIUM findings.

### On criterion 18

I wrote "sent to sign-in". The product does not have a sign-in destination in
ops2 — sign-in is Cloudflare Access at the host, so locally a session-less
browser lands on a staff-refusal message. The protective half of the criterion —
**no project data reaches a browser without a staff session** — is met and was
executed for real. What fails is a wording and destination problem that this
branch neither introduced nor touched: a staff member whose session lapsed is
told to ask an admin for a role they already hold.

I am not holding acceptance on it, because the remedy is a product decision
(does ops2 get a sign-in route at all?) rather than a defect in this feature, and
sending it round the developer loop with no decided answer would spend a session
guessing. It becomes decision Q1 below.

## Silent descoping

**One item, and it is a coverage instruction rather than behaviour** (finding V2).
Spec §3 said the thin local seed must gain rows so the four predicates are
non-empty and non-identical. `scripts/db/seed.sql` was never touched, so every
*shipped* browser assertion for criteria 1–4 runs against a route stub. The
tester closed the gap himself with an unstubbed live probe and it passes — which
is why criteria 1–4 read MET on live evidence — but that probe is in no `test:*`
script, so nothing durable stops the real endpoint and the four predicates
drifting apart later. Behaviour is proven today; the guard against tomorrow is
missing. Decision Q2.

Nothing else was dropped. Round 1's real descope — the two worker DTO fields —
stays closed and is confirmed by three independent readers.

## Scope creep

Small, and none of it a new ops control — worth saying plainly given this repo's
history of ops accumulating unrequested features:

- `scripts/tests-verify/abuse.mjs` and `live-rows.mjs` (167 lines) are committed
  permanently. No npm script runs them; only `06-verify.md` mentions them; the
  abuse cases are already asserted in the shipped suites. Ponytail says delete;
  I agree.
- Round 3 added more untracked residue of the same kind
  (`playwright.verify.config.ts`, `scripts/tests-verify/web/*.spec.ts`,
  `live-attention-probe.mjs`, two signed-out probes). Decide once for all of it —
  see Q2, since one of them is worth promoting rather than deleting.
- `src/ops2/styles/projects.css` (+19 lines) is polish-stage strip styling the
  design did not name. Conformance accepts it; so do I.

## Open findings that are not spec criteria

Ordered as I would take them. None blocks the criteria.

1. **Empty-state copy tells staff something untrue.** When a prefilter is on and
   the reader's *own* search or chip empties the list, the page still says the
   projects "moved on after Attention counted it". Raised by the architect in
   round 1, by me in round 2, and by Codex again on HEAD — three times, still
   present. It is user-facing copy in the exact surface this run exists to make
   trustworthy. Decision Q3.
2. **Stale mounted snapshot (Codex P1).** In principle a Projects page visited
   earlier could serve old rows to a fresh count. The behavioural case is
   exercised at HEAD — criterion 6's browser test moves a project between visits
   and both the count and the list follow it, and the tester probed rail
   round-trip, back-from-record, reload and Back/Forward, all green. Residual
   risk is timing-dependent, not demonstrated. Debt.
3. **V3 — a malformed 200 draws as a clear day.** A body that loses the
   `projects` envelope parses to zero rows and the gate says nothing needs you.
   Requires a Worker contract break to reach; the developer's field-level guard
   already covers the narrower case. LOW, debt, with the tester's failing test
   attached and ready.
4. **V1 — the signed-out copy and the "Signed in" chip** (see criterion 18).
   Pre-existing, decision Q1.
5. **Ponytail, −195 lines advisory.** `DEBT.md` records five mechanical shrinks
   and correctly refuses to merge the two `ProjectsPage` location effects — that
   split is load-bearing against a race that has failed twice. Do not reopen it.

**Review coverage caveat, stated plainly:** the four reviewers ran at `27b87e27`;
HEAD is `8bc0e74e`, one further fix commit (the payload guard in
`attention.ts:124-143`). The independent verify round is at HEAD and covers it.
Separately, the Codex architecture review could not run `test:ops2` in its
sandbox (`spawn EPERM`) — a tooling failure, not a clean pass; its static
findings stand and are listed above, and the suites it could not run were run
green by the tester.

## `ASSUMED:` tags — still unsigned

The owner answered D1 and nothing else. All four spec §5 assumptions remain
un-vetoed and carry to final sign-off. None was contradicted by the build.

1. Rows may overlap — one project counted by two rows is correct, not a bug.
2. The filters ride the queue's existing control grammar; no new ops surface.
   *(Implementation: a visible active-filter strip with a Clear — the nameable,
   reversible control criteria 9 and 10 require, not a new panel.)*
3. "Exactly N" compares against the filtered set's total; tests seed under the
   page size rather than the feature adding pagination logic.
4. `/api/ops/summary` keeps its now-unread project counts; deleting them is a
   later lean-out pass.

## Recommendation

Accept the feature. Ship it once Q3 is answered — the counts and the lists are
right, the security half is genuinely executed, and the run's own anti-hollowness
criterion did its job. The rest is debt with the tests already written for it.

## Decisions needed

**Q1 — Criterion 18's destination: does ops2 get a sign-in route, or does the
refusal copy change?** Today a signed-out or lapsed-session staff member sees
"Ask an administrator to add the role" while the account chip claims they are
signed in. Pre-existing, not caused by this work.
*Recommended:* accept this run as-is, and raise a separate small ticket to fix
the copy (offer sign-in when there is no session at all; keep the role message
only for a real session lacking the role) plus the "Signed in" chip. Not worth a
new sign-in page while Cloudflare Access owns the door.

**Q2 — The durable coverage gap: seed rows, or leave the live probe as one-off?**
Criteria 1–4 are proven live today but only stubbed in the permanent suite.
*Recommended:* yes to a small follow-up — four rows in `scripts/db/seed.sql` and
promote `live-attention-probe.mjs` into `scripts/tests/web/`; delete the rest of
the `tests-verify` residue including the two committed probe files. Fix tier, one
short round, no pipeline.

**Q3 — The empty-state falsehood: fix now or ship with it?** When your own search
or chip empties a prefiltered list, the page claims the projects moved on. Third
time raised.
*Recommended:* fix before deploy, in one `conduct fix` round — it is a lie on the
surface whose entire job is to be trusted, and it is a copy-plus-one-condition
change.

**Q4 — Sign off the four `ASSUMED:` tags above (yes to all, or name the veto)?**
*Recommended:* yes to all four. Overlap is real behaviour staff already expect,
the strip is the control not a new panel, pagination stays out, and deleting the
summary's unread counts belongs to the backend lean-out pass you already
scheduled for after ops2.
