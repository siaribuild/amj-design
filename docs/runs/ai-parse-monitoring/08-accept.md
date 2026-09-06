# ai-parse-monitoring — acceptance (stage 8, round 4)

Supersedes the round-3 verdict previously held in this file.

Evidence inputs, and nothing else: `01-spec.md` (the 28 criteria), `06-verify.md`
(independent tester, round 6, verified at `4593e994`), `07-review-conformance.md`,
`07-review-security.md`, `07-review-architecture.md`, `07-review-ponytail.md`,
`07-review-codex.md`, `07-review-resolution.md`, `09-assumptions.md`, `DEBT.md`.
No tests were run and no source was read for this verdict, per instruction.

**Verdict: ACCEPTED**, subject to three pre-deploy conditions that require no code
change (§6) and five owner decisions (§7).

Round 3 rejected on three grounds. All three are now closed:

1. *The money numbers could not be trusted* — the scope/window P1 (billed spend and
   the cap describing different periods) was fixed in `7f17722a`, the shared failure
   domain that let a cap blip silence the low-credit alarm was split in the same
   commit, and the Codex round-6 P2 that blanked a valid account-level cap was fixed
   in `78216e9d` (`07-review-resolution.md`). One money question survives and it is
   the owner's, not the developer's: whether Cloudflare reports balance and usage in
   dollars or cents (§7, Q1).
2. *The tester's last report said FAIL and was overruled* — the round-6 tester
   returns **PASS on all 28 criteria**, reproduced from scratch against a real Worker,
   real D1 and real KV, with the two disputed counting criteria proved by live fixture
   rather than by argument (`06-verify.md` rows 8 and 11).
3. *Nobody had verified the tree since the overrule* — round 6 is that verification.
   It took nothing from `04-build.md` on trust and names the command behind every row.

---

## 1. Criterion by criterion

Evidence references are to `06-verify.md` unless stated. "probe*" are the tester's
throwaway live drivers, described in that file's probe table.

### Money cards

| # | Verdict | Evidence |
|---|---|---|
| 1 | MET | Playwright asserts `$12.34` from a ready snapshot; the no-Cloudflare-call half proved live — `wrangler.log` carries two CF lines, both from the cron, none from the staff page loads (row 1). |
| 2 | MET | `red.mjs` in real Chrome: `1/20` renders `$19.00` headroom and `$1.00 of the $20.00 gateway cap used (5%)`; `19/20` renders `$1.00` and 95%. Both figures move with the snapshot, neither hardcoded (row 2). The multi-gateway case that previously blanked this card was fixed post-verification in `78216e9d` — see §6.1. |
| 3 | MET | Gateway-cap failure falls back to the account endpoint and the snapshot records the source (row 3); the adapter was independently checked field-for-field against the official Cloudflare SDK types this round. |
| 4 | MET | Real cron with no token: both money halves `{"available":false,"reason":"token_missing"}` while D1 counts still render `success7d:4, error7d:3` and the bubble stays 0 (row 4). |
| 5 | MET | Real Cloudflare rejecting a sentinel token: `fetch_failed` on both halves, counts unchanged, two bounded log lines, page still loads (row 5). |
| 6 | MET | Playwright stale sentence plus per-card `as at` stamps at `takenAt −45m` (row 6). The fifth (chart) card's missing stamp was a Codex P2, fixed in `78216e9d`. |

### Parse counts

| # | Verdict | Evidence |
|---|---|---|
| 7 | MET | 13 seeded claims covering every counting case; route returned `success7d: 4, error7d: 3` (row 7, cron transcript). |
| 8 | MET | A row with `attempts=3, status='completed'` counts once; `ai-jobs.test.mjs` proves an ops retry reclaims in place and leaves the claim's origin alone (row 8). This closes round 3's disputed FAIL with evidence rather than argument. |
| 9 | MET, with a recorded divergence | The 31-minute `processing` row is inside `error7d: 3` (row 9). Divergence: the predicate is age-only; the criterion's "attempts exhausted" clause is not in the SQL (`DEBT.md` F9). The tester establishes the gap is behaviourally near-empty — a retryable failure is written back as `scheduled`, not left `processing`, and the lease (135 s) and job deadline (600 s) are both far under 30 minutes. Accepted as-is. |
| 10 | MET | The 5-minute `processing` row appears in neither total (row 10). |
| 11 | MET | One `'ops'` completed and one `'ops'` failed row seeded; totals stayed 4/3. The production upload path takes the column default, verified by reading both `INSERT` statements, not the migration comment (row 11). Closes round 3's second disputed FAIL. |
| 12 | MET | Playwright all-zero window: the sentence, seven columns, zero bars (row 12). |

Coverage caveat on 9, 10 and 11: the counting rules are proved live but have **no
executing repo test** — their only suite protection is a string match on the SQL, and
a predicate mutation that keeps the matched text passes 51/51 (`06-verify.md` F1).
The shipped behaviour is right; nothing stops a future edit from breaking it silently.
That is a maintenance risk, not an unmet criterion — §7, Q5.

### Chart

| # | Verdict | Evidence |
|---|---|---|
| 13 | MET | Buckets `1+3 = 4` successes and `1+2 = 3` errors against cards `4/3`; the SQL window boundary and the earliest bucket proved to be the same instant (row 13). |
| 14 | MET | Seven distinct consecutive Melbourne dates, four all-zero, and the same across both 2026 DST switches (row 14). |

Round 3's caveat — that a retry could move a parse between day buckets after the
fact — is not repeated by round 6; the day-bucket sums reconcile to the cards in the
live run.

### Notification bubble

| # | Verdict | Evidence |
|---|---|---|
| 15 | MET | Healthy snapshot → `notificationCount:0`, `.ops2-bell__badge` absent in real Chrome (row 15). |
| 16 | MET | `$4.99` → count 1; `$5.00` → count 0; balance card reddens, cap card does not (row 16). |
| 17 | MET | 85% → 1; exactly 80% → 0; both breached → still **1** (row 17). |
| 18 | MET | Playwright navigates from `/projects` to `/attention` and asserts the heading (row 18). |
| 19 | MET | `token_missing` and `fetch_failed` both → `notificationCount:0` (row 19). |
| 20 | MET | One entry in `NOTIFICATION_SOURCES`; `countFrom` is `allSettled` + a sum with no source-specific branch; a failing injected source cannot hide the surviving one (row 20). |

Boundary caveat on 16 and 17: both comparisons are correct as shipped and proved
live, but neither boundary is pinned by a test — `<` → `<=` and `>` → `>=` both pass
51/51 (`06-verify.md` F2). Same family as the counting-rule gap; §7, Q5.

### Freshness / cron

| # | Verdict | Evidence |
|---|---|---|
| 21 | MET | Route answered `{"snapshot":null}` before `/__scheduled` and the full snapshot after; `wrangler.jsonc` still carries exactly `"crons": ["*/10 * * * *"]` (row 21). |
| 22 | MET | Two staff loads after the cron added no third CF log line; the route's whole path is one `KV.get`, no `fetch` (row 22). |

### Abuse cases — all executed for real against a live Worker

| # | Verdict | Evidence |
|---|---|---|
| 23 | MET | Signed-out: `403 {"error":"forbidden"}` — that is the entire body (probe2 transcript). |
| 24 | MET | Customer OTP session: `403`, same body. |
| 25 | MET | Manufacturer partner (`role: manufacturer`, signed in through the ops auth route): `403`, same body. |
| 26 | MET | Worker run with a sentinel token and the production account id: neither in the payload. A KV snapshot deliberately carrying `cfToken` and `accountId` served a payload whose keys were exactly `takenAt, money, days, success7d, error7d, redBalance, redCap, floorUsd` — both smuggled fields gone (row 26). |
| 27 | MET, evidence dated pre-fix | `grep -c` for the sentinel token in `wrangler.log` → **0**; account id likewise absent (row 27). The sanitisation mechanism was then restructured in `78216e9d` — see §6.1. |
| 28 | MET | The route calls `resolveStaff`, the guard 41 sibling routes use; a forged Access header and a tampered session cookie both → `403`; a real customer's page load lands on the unauthorised panel (row 28). Two extra denials beyond the criterion. |

**Tally: 28 of 28 met.** The independent security review found **no HIGH or MEDIUM
findings** and confirmed the endpoint fails closed, the token is secret-only, the log
path cannot emit the token or a full URL, the KV boundary is a rebuild-whitelist, and
migration 0064 is a pure `ADD COLUMN` with no table rebuild — so the cascade hazard
that once cost production rows is not in play.

## 2. Descoping

None silent. Three disclosed changes, all carried forward from round 3 and all still
the owner's to confirm:

- **The 7-day window is seven Melbourne calendar dates, not a rolling 7×24 hours**
  (`09-assumptions.md` §4). The spec's `ASSUMED:` said rolling; a rolling window and
  a seven-bucket chart that sums to the cards cannot both hold. Cost: up to 24 hours
  less history depending on the time of day. §7, Q2.
- **The endpoint refuses everyone with 403**, with no separate "sign in" answer for
  signed-out callers (`09-assumptions.md` §5). Criterion 23 allows either; Access
  turns strangers away before the Worker sees them. No loss.
- **Criteria 8 and 11 were re-worded in the spec by the developer** to match the
  owner's "one parse event = one claim lifecycle" ruling, with the superseded wording
  struck through in place rather than deleted. Round 6 then proved the behaviour live.
  §7, Q3 confirms the rule itself.

Out of scope stayed out: no alerts, no amber tier, no drill-down, no queue
introspection, no notification persistence, no repair of the stuck-`processing` gap
(it is counted, not fixed, exactly as specced), and no customer-facing surface.

## 3. Scope creep

Three items, all small, none customer-visible:

1. **`drainLearningOutbox` gained a `.catch`** in `worker/index.ts` — an unrelated
   cron job's failure behaviour changed inside a feature whose spec scopes everything
   but monitoring out, and nothing asserts either behaviour (`06-verify.md` F5, low,
   reported three rounds running). Defensible on its own terms; it should be tested or
   lifted into its own change.
2. **A dead `resolveUser` import** this feature added to `worker/routes/ops.ts` and
   left behind when the 401/403 split collapsed (F4, low). One-word deletion.
3. **Pipeline infrastructure rides the branch** — `scripts/pipeline/conduct.mjs`
   (cycle cap 2→3, reviewer context windows 100k→220k, test concurrency 2→4) and
   `scripts/tests/pipeline.test.mjs` (`07-review-conformance.md` note 2,
   `09-assumptions.md` §10). Not feature work; it merges with the feature. Branch
   hygiene call, not a defect. `.claude/launch.json` was correctly reverted.

The notification-source registry — the one thing beyond a bare reading of the spec —
is criterion 20 and was requested by the owner at the grill. Two reviewers
independently argue it is over-built or misplaced; both were declined on that grill
ruling and recorded in `DEBT.md`. §7, Q4 gives the owner the second look the
developer asked for.

## 4. Assumptions awaiting sign-off

Every `ASSUMED:` in `01-spec.md`, plus the developer's ledger. **None has been
approved by the owner**; `09-assumptions.md` opens by saying so.

| Assumption | Status |
|---|---|
| $5.00 credit floor / 80% cap ceiling | Built and proved at both boundaries. The owner ruled the values live in `vars`; the two numbers themselves were never confirmed. Changing either is a config edit. §7, Q2. |
| Rolling 7×24h window | **Changed** to seven Melbourne calendar dates. §7, Q2. |
| USD only, no AUD conversion | Built as specced. |
| "Cap outstanding" = cap minus billed spend | Built as specced. The scope/window objection that hung over this in round 3 is fixed. |
| The five cards sit below "what needs a person" | Built; no such content exists in v1, so the cards are the page. |
| A stale snapshot is shown with its timestamp, not suppressed | Built and evidenced (criterion 6), including the chart card after `78216e9d`. |
| Cloudflare money figures are dollars, not cents | **Unverified, and a 100× error either way** (`09-assumptions.md` §1). Settled by looking at the first real snapshot. §7, Q1. |
| The spend rule's `window` is seconds | **New this round, unverified** (`06-verify.md` F10). It bounds the usage query the cap percentage is built from. Settled by the same first snapshot: a monthly cap whose window reads `2592000` confirms seconds. §7, Q1. |
| `CF_ACCOUNT_ID` committed as a plain config value | Reasonable and explicitly dismissed by the security review — the same hash is already committed 62 lines above as the container registry namespace. |
| Counting claim lifecycles, not documents | Ruled by the owner at the spec gate; the grill record lagged and is struck through in place. Criteria 8 and 11 rest on it. §7, Q3. |

## 5. Reviewer findings — what happened to each

- **Conformance: CONFORMS.** All six new files exist, every design-named test file
  was created and wired, the seams are where the design put them, and
  `worker/routes/parse.ts` is correctly untouched. No named-but-never-created test
  file this run — the failure this pipeline has repeated most did not recur.
- **Security: no HIGH or MEDIUM findings.** Details in §1's abuse-case rows.
- **Codex: two P2s, both fixed** in `78216e9d` (account-level cap wrongly blanked;
  chart card missing the stale stamp).
- **Architecture: three findings, no high-severity one.** The registry-placement and
  the failed-fetch-reads-as-zero findings were declined with reasons and recorded;
  the untyped payload seam is in `DEBT.md`.
- **Ponytail: eleven cuts proposed, five taken** in `78216e9d`, the rest declined on
  owner rulings or recorded.
- **Open, low, and carried:** F1 (counting rules unprotected by an executing test),
  F2 (unpinned red boundaries), F3 (no browser test renders a red card), F4, F5, F8
  (unbounded count query), F10 (window unit). All behaviourally correct today.
- **F9 is a process finding and is still open:** rounds 4 and 5 each deferred six low
  findings "to `DEBT.md`" and none were written there. `DEBT.md`'s round-6 section
  captures the reviewer findings but not the tester's F1–F8 and F10. A low finding
  that is never recorded is one that gets re-discovered at a tester's cost every
  round — this has now happened three times to the same two items.

## 6. Conditions before this ships

None requires a developer loop; all three are mechanical.

1. **Re-date three criteria at the merge commit.** The tester's live probes ran at
   `4593e994`; `78216e9d` then changed the cap-availability rule (criterion 2) and
   restructured the log-sanitisation path (criterion 27, a security criterion) and the
   payload assembly (criterion 26). The fix pass re-ran the suites green — 51/51,
   126/126, 80/80, Playwright 25/25 — but the *live* proofs for 2, 26 and 27 predate
   it. Re-running `probe3.mjs` and `probe4.mjs` at the merge commit closes this in
   minutes. I am not treating it as unmet, because the change to that path made the
   guarantee stronger (the path now travels as a typed field rather than being parsed
   back out of a log string), but stale security evidence should be re-dated, not
   assumed forward.
2. **Set the Worker secret.** `wrangler secret put CF_MONITORING_TOKEN` — AI Gateway:
   Read plus Account Analytics: Read. Until then the two money cards correctly read
   "unavailable" and the parse counts work, which means criteria 1, 2 and 3 have never
   been seen with real data.
3. **Read the first real snapshot** and settle both money-unit questions at once
   (§7, Q1).

Also, and separately from this feature: the branch sits on the unmerged
`feat/ops2-attention`, so that merges first. Roughly 43 files of another session's
design-system work share the working tree; one Codex finding about `theme.css` shadow
tokens belongs to that work, not this one, and looked real.

## 7. Owner decisions

Carried into the reply to the owner; recorded here so the file stands alone.

1. Confirm the money-unit check will be done on the first real snapshot (dollars vs
   cents, and the spend rule's `window` unit).
2. Confirm the $5.00 floor, the 80% ceiling, and the seven-Melbourne-calendar-dates
   window.
3. Confirm "one parse event = one claim lifecycle" in writing, since criteria 8 and
   11 rest on it.
4. Second look at the one-source notification registry, which two reviewers now
   independently want moved or deleted.
5. Whether the three unprotected-behaviour test gaps (F1, F2, F3) are closed now or
   recorded as debt.

## 8. Pipeline integrity

- All five review axes ran and all five produced a report — the plan-mode defect that
  silently lost reports in earlier runs did not bite this time.
- **Codex ran and found real defects** (two P2s, both since fixed). Some of its shell
  commands failed or timed out, but it read the diff and reported substance; this is
  a real review, not an infrastructure failure presented as one.
- `07-review-resolution.md` exists because the conductor hands this stage the reviewer
  snapshots but not the fix history, so an accepted finding still reads as open. Round
  2 and round 3 both rejected partly on that artefact. Worth fixing in the conductor.
