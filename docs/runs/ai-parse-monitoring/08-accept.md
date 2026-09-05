# ai-parse-monitoring — acceptance (stage 8, round 2)

Supersedes the round-1 verdict previously held in this file. That verdict rejected the
run; two developer fix rounds (`fix-0`, `fix-1`) and a third round of reviews followed it.
This is the judgement over the state after those fixes.

Evidence inputs, and nothing else: `01-spec.md` (the 28 criteria), `06-verify.md`
(tester, round 2), `07-review-architecture.md`, `07-review-security.md`,
`07-review-ponytail.md`, `07-review-codex.md`, `09-assumptions.md`, `DEBT.md`, `run.json`.
No tests were run and no source was read for this verdict, per instruction.

**Verdict: REJECT — narrowly, and mostly for missing evidence rather than known-bad work.**

Three things stand between this and acceptance:

1. **No tester has walked the feature since the fixes landed.** `run.json` records
   `"verifyRounds": 2` with `fix-0` and `fix-1` running *after* the last verify. The only
   tester report in the run is round 2, whose own verdict is **FAIL** with
   `tests 23 / pass 19 / fail 4`. Three of its six findings are independently evidenced as
   fixed by the round-3 reviewers; three criteria (7, 13, 17) have no evidence of their
   post-fix state at all.
2. **Codex still carries a P1 against the budget number** — billed spend is summed at
   account level with no gateway or period match, then compared against one cap rule whose
   window is discarded. "Is the AI budget about to run out" is half the reason this feature
   exists; a headroom figure that can be wrong is not an acceptable answer to it.
3. **The unit of the Cloudflare money figures is unverified** (`09-assumptions.md` §1).
   If the API reports cents, both money cards read 100× high and the $5.00 low-credit alarm
   never fires. This is the highest-cost open item in the run and it is one snapshot away
   from being settled.

Everything else about the feature is in good order: the page, the five cards, the chart,
the cron write and the staff-only guard are all evidenced, the security review is clean,
and no scope crept in.

---

## 1. Per-criterion result

Legend: **MET** — evidence exists on the criterion's own surface, post-fix, unchallenged.
**MET (at risk)** — evidenced, but an open reviewer finding attacks the same behaviour in
production. **NO POST-FIX EVIDENCE** — the criterion failed or partially failed at verify
round 2 and no tester has re-walked it since the fix. **NOT MET** — evidence contradicts
the criterion.

### Money cards

| # | Criterion (short) | Result | Evidence |
|---|---|---|---|
| 1 | Balance card shows `$12.34`; no Cloudflare call on page load | MET (at risk) | `06-verify.md` round 2 — `test:ops2` 107/107, Playwright `ops2-attention.spec.ts` 21 passed, KV-only load probe. Risk: `09-assumptions.md` §1 — the dollars-vs-cents unit is undocumented and unverified. |
| 2 | Cap outstanding shows headroom `$12.00` against cap `$20.00`, nothing hardcoded | MET (at risk) | `06-verify.md` round 2 (passing suite). Risk: **Codex P1** (`07-review-codex.md`, `worker/lib/monitoring.ts:103`) and architecture High — spend and cap can come from different scopes and periods, so the headroom can be wrong in production even though the fixture passes. |
| 3 | Per-gateway cap, account-level fallback, source recorded | MET (at risk) | `06-verify.md` round 2 covers both paths. Same Codex P1 — the matched rule's `window`/`technique`/`duration`/`strategy` are discarded. |
| 4 | No token → money cards "unavailable" (not zero, not red); counts still render | MET | `06-verify.md` round 2; `09-assumptions.md` "what you still have to do" §1 confirms this is the state production will actually be in until the secret is set. |
| 5 | Cloudflare non-2xx/timeout → counts refreshed, money unavailable, failure logged, page still loads | MET (at risk) | `06-verify.md` round 2; `07-review-security.md` confirms the log line carries only a `pathSuffix()` slice. Risk: **Codex P2** — a malformed `takenAt` throws in `formatAsAt` and blanks the page rather than showing its error state. |
| 6 | Snapshot older than 30 min → each card states "as at HH:MM" | MET (at risk) | `06-verify.md` round 2 records PASS (the round-1 gap — no browser render — was closed by `fix-0`). Same Codex P2 timestamp risk. |

### Parse counts

| # | Criterion (short) | Result | Evidence |
|---|---|---|---|
| 7 | 40 successes / 3 errors in the last 7 days | **NO POST-FIX EVIDENCE** | Round 2: **FAIL** (V-F2 — rolling SQL window against Melbourne calendar buckets, up to 24 h of parses silently dropped). `09-assumptions.md` §4 records the developer's resolution (seven Melbourne calendar dates, cards and chart now agree) and §7 records that the SQL-verbatim assertion was **edited** rather than satisfied. No tester has re-run it. |
| 8 | A retried document counts once | MET | `06-verify.md` round 2 — `test:ai-jobs` 14/14. |
| 9 | `processing` 31 min old with attempts exhausted → one error | MET (divergence recorded) | `06-verify.md` round 2. Divergence: `DEBT.md` F9 — the SQL predicate is age-only, so a row still eligible for retry is also counted as an error. The criterion as written passes; the implementation is broader than it. |
| 10 | `processing` 5 min old → neither | MET | `06-verify.md` round 2. |
| 11 | Ops-triggered building-model run excluded | MET | `06-verify.md` round 2; `triggered_by` filter, migration `0064`. `DEBT.md` F10: historical rows backfill to `'upload'`, so pre-deploy ops retries count as parses for up to 7 days — self-correcting. |
| 12 | No parses → cards show `0`, chart shows empty state | MET | `06-verify.md` round 2, Playwright empty-state case. |

### Chart

| # | Criterion (short) | Result | Evidence |
|---|---|---|---|
| 13 | Seven buckets whose sums equal the card totals | **NO POST-FIX EVIDENCE** | Round 2: **FAIL** (V-F2, same mismatch as criterion 7). Resolution recorded in `09-assumptions.md` §4; not re-tested. |
| 14 | A zero-parse day appears as a zero bucket | MET (at risk) | `06-verify.md` round 2 PASS; carries criterion 13's risk since it shares the bucketing code. |

### Notification bubble

| # | Criterion (short) | Result | Evidence |
|---|---|---|---|
| 15 | Not red → count 0, no bubble drawn | MET | `06-verify.md` round 2 — browser coverage of the 0 state (the round-1 gap closed by `fix-0`). |
| 16 | Balance below floor → bubble shows `1` | MET (at risk) | `06-verify.md` round 2. Risks: **Codex P2** — a transient cap-lookup failure marks *all* money unavailable and therefore suppresses a valid low-credit alarm; and `09-assumptions.md` §1 — if the balance unit is cents, the $5.00 floor never trips. |
| 17 | Cap % above ceiling → `1`; both conditions → still `1` | **NO POST-FIX EVIDENCE** | Round 2: **PARTIAL** (V-F3 — `capUsd === 0` yields `NaN > 80` or `Infinity > 80`). Neither `DEBT.md` nor any round-3 review records this as fixed or accepted. Codex P1 additionally makes the percentage itself untrustworthy. |
| 18 | Tapping the bubble navigates to Attention | MET | `06-verify.md` round 2, Playwright tap-through. |
| 19 | Money unavailable → count 0, no false alarm | MET (at risk) | `06-verify.md` round 2. Codex P2 is this criterion's mirror image: correct on false alarms, wrong on *missed* alarms. |
| 20 | A second source appends without changing the bubble, aggregation or container | MET | `06-verify.md` round 2; `07-review-ponytail.md` confirms one source and no source-specific branching. Ponytail's proposed collapse to `red ? 1 : 0` was **declined** (`DEBT.md`, `09-assumptions.md` §6) because the owner asked at the grill for the shape to be seeded — correct call. |

### Freshness / cron

| # | Criterion (short) | Result | Evidence |
|---|---|---|---|
| 21 | The existing `*/10` cron writes one snapshot; no new trigger | MET | `06-verify.md` round 2 — `test:api` 77/77; architect conformance CONFORMS. |
| 22 | Two open pages → no Cloudflare call, same snapshot | MET | `06-verify.md` round 2 probe. |

### Abuse cases

| # | Criterion (short) | Result | Evidence |
|---|---|---|---|
| 23 | Signed-out visitor → 401/403, no figures | MET | `06-verify.md` round 2, live request: `401 {"error":"unauthorized"}`; after `fix-1` the endpoint refuses uniformly with 403 (`09-assumptions.md` §5). Either satisfies the criterion. |
| 24 | Customer session → 403, no data | MET | `06-verify.md` round 2, live request: `403 {"error":"forbidden"}`. |
| 25 | Manufacturer partner → 403, no data | MET (suite only) | `06-verify.md` round 2 — suite-executed; the hand-run attempt was blocked by a missing seeded partner account. Round 1 executed it live against a real role-flipped account. `07-review-security.md` traces the code path: `resolveStaff` rejects `role === "manufacturer"`. |
| 26 | Payload carries no token, account id or gateway credential | MET | Round 2 flagged V-F4 (planted fields survived). `07-review-security.md` round 3: `parseMonitoringSnapshot` "rebuilds the snapshot field by field rather than validating the stored object in place", and the payload adds only `redBalance`, `redCap`, `floorUsd`. Fixed. |
| 27 | Failure log contains no token or Authorization value | MET | `07-review-security.md` — the log prints a path suffix and a status only. `DEBT.md` F6 keeps the account-id-in-URL concern open as low debt; an account id is neither a token nor an Authorization value, so the criterion holds. |
| 28 | Customer guessing `/attention` refused by the same ops2 staff guard; no new auth path | MET | Round 2: **FAIL** (V-F1 — cookie-only `resolveUser`, which would have 401'd every genuine staff request in production). `07-review-security.md` round 3, over the final diff: the endpoint "is gated by `resolveStaff(c.env, c.req.raw)`", equivalent to the `isStaffUser` predicate the design named, fails closed under Cloudflare Access, and route ordering was checked for shadowing. Fixed. |

**Tally: 22 MET (9 of them carrying an open risk), 3 with no post-fix evidence (7, 13, 17),
0 contradicted.**

---

## 2. Descoping check

Nothing was silently dropped. All five cards, the chart, the bubble, the cron write and all
six abuse cases exist and were exercised. Two changes to what "done" means were made
in the open and need the owner's word rather than mine:

- **The window was redefined.** The spec's `ASSUMED:` tag said a rolling 7×24 h window with
  Melbourne day buckets. `09-assumptions.md` §4 shows those two cannot both hold, and the
  developer chose seven Melbourne calendar dates so the chart sums to the cards. The cost is
  between 0 and 24 hours less history than "last 7 days" implies. This is the right call for
  the business question being asked, but criterion 7's wording no longer matches the build.
- **The 401/403 split was collapsed to 403 for everyone** (`09-assumptions.md` §5). The panel
  showed one message for both, and Access refuses strangers before the Worker sees them.
  Criterion 23 permits either, so no scope was lost.

One near-descope worth naming: the "attempts exhausted" clause of criterion 9 is not in the
SQL (`DEBT.md` F9). Recorded as a divergence, not fixed.

## 3. Scope creep check

None. Architect conformance is CONFORMS; every path in `02-tasks.json` (T1–T6) exists.
No alerting, drill-down, dismissal or queue introspection appeared, no customer surface was
touched, and the parse pipeline itself was left alone as the spec required. Migration
`0064` is additive (`ADD COLUMN … DEFAULT 'upload'`), design-sanctioned, and required by
criterion 11; `07-review-security.md` confirms no table rebuild, so the cascade-delete
hazard does not apply.

Ponytail's report is over-engineering only and finds ~90 removable lines, two of which were
correctly declined as owner-requested. Nothing there blocks acceptance; it is debt, and it
is recorded in `DEBT.md` with reasons.

## 4. ASSUMED tags — sign-off status

Six were tagged in `01-spec.md`. **None has been put to the owner. All six remain
un-signed-off**, and `09-assumptions.md` adds three more judgement calls taken while he was
away.

| Assumption | Status |
|---|---|
| $5.00 credit floor / 80% cap ceiling, in wrangler `vars` | Built as specced; owner ruled "values in vars" at the grill (Q11), but the two numbers themselves were never confirmed. Needs sign-off. |
| Rolling 7×24 h window with Melbourne day buckets | **Changed** to seven Melbourne calendar dates. Needs sign-off on the new definition. |
| USD only, no AUD conversion | Built as specced. Needs sign-off. |
| "Cap outstanding" = cap minus billed spend | Built as specced. Needs sign-off — and Codex P1 says the subtraction's two halves may not be comparable. |
| Cards sit below "what needs a person" content | Moot in v1; no such content exists yet. |
| Stale snapshot shown with timestamp rather than suppressed | Built and evidenced (criterion 6). Needs sign-off. |
| *(new)* Cloudflare money figures are dollars, not cents | Unverified; a 100× error either way. Settled by looking at the first real snapshot. |
| *(new)* `CF_ACCOUNT_ID` committed as a plain var | Reasonable — it is an identifier, already committed elsewhere in the same file, and the security review dismissed it explicitly. |
| *(new)* Counting claim lifecycles, not documents | Owner already ruled this at the spec gate; the grill record simply lagged and has been struck through in place. |

## 5. Pipeline integrity

Better than at round 1, and now honest about what ran:

- **All four reviewers completed** and their reports exist. `07-review-security.md` and
  `07-review-ponytail.md` are both footed "Review round 3, over the final diff" and both
  record that plan mode blocked the write to the run directory — the recurring pipeline
  defect, recovered by hand. The reports themselves are complete.
- **Verify did not re-run after `fix-0`/`fix-1`.** This is the gap in the evidence chain and
  the main reason for the verdict. The tester's four deliberately-red tests
  (`tests 23 / pass 19 / fail 4`) have no recorded green.
- **Codex hit infrastructure failures** — `npm run build` and `npm run test:ai-monitoring`
  both exited 1 with `Error: spawn EPERM`, plus two timeouts. That is an environment failure,
  not a red test and not a clean pass; Codex's findings come from reading the diff, not from
  running it.
- **The branch sits on unmerged work.** `09-assumptions.md` §8: cut from `feat/ops2-attention`
  (`591a912d`), still under review, and ~43 modified `src/` files from another session's
  design-system work share the working tree. One Codex finding (`theme.css` shadow tokens
  self-referencing through `@theme inline`, killing card/dialog/drawer shadows) belongs to
  **that** work, not this feature — worth passing on separately; it looked real.

## 6. What goes back to the developer

Blocking, in business-impact order:

1. **Codex P1 — make the budget percentage mean something.** Match the billed-usage query to
   the cap rule's gateway and period, or report the percentage unavailable rather than
   computing a figure from mismatched scopes. Criteria 2, 3, 17, 19.
2. **Re-run `verify` on a committed tree.** Criteria 7, 13 and 17 need a tester's word, and
   the four red tests need a recorded green. This is the missing evidence, not new work.
3. **Codex P2 — do not let a cap-lookup failure silence a low-credit alarm.** Separate the
   availability of balance from the availability of cap. Criteria 16, 19.
4. **Codex P2 — reject an invalid `takenAt`** rather than throwing in `formatAsAt` and
   blanking the page. Criteria 5, 6.
5. **V-F3 — guard `capUsd === 0`** so the ceiling comparison cannot be `NaN` or `Infinity`.
   Criterion 17.
6. **Settle the dollars-vs-cents question** before this is trusted in production
   (`09-assumptions.md` §1) — one look at the first real snapshot.

Non-blocking, carried as debt with reasons already recorded: `DEBT.md` F6, F7, F9, F10 and
the ponytail shrinks. The two declined ponytail findings stay declined.

---

## 7. Verdict

**REJECT**, pending items 1–5 above and one verify round. The feature is close and the
failure mode here is a missing tester pass rather than broken work — but "AI parsing is
being watched" cannot be signed off while the budget number can be wrong, the low-credit
alarm can be suppressed, and no tester has confirmed the counts and chart since they were
rebuilt.

This verdict is a recommendation. The product owner gives final sign-off, and the nine
assumptions in section 4 are his to accept or veto.
