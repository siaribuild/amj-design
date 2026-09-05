# ai-parse-monitoring — acceptance (stage 8, round 3)

Supersedes the round-2 verdict previously held in this file.

Evidence inputs, and nothing else: `01-spec.md` (the 28 criteria), `06-verify.md`
(tester, round 3, 2026-09-05), `07-review-architecture.md`, `07-review-security.md`,
`07-review-ponytail.md`, `07-review-codex.md`, `09-assumptions.md`, `DEBT.md`,
`run.json`. No tests were run and no source was read for this verdict, per
instruction.

**Verdict: REJECT — narrowly.** The feature is substantially built, the security
axis is clean, and round 2's three missing pieces of evidence are now supplied.
Three things stop it:

1. **The money numbers cannot yet be trusted**, and the money numbers are the whole
   reason this feature exists ("is the AI budget about to run out"). Two unresolved
   items sit under them: the reviewers' P1 finding that billed spend and the spend
   cap may describe different scopes and different time windows, so the percentage
   that turns the alarm red may not be a real percentage of a real budget; and the
   unverified question of whether Cloudflare reports these figures in dollars or in
   cents, which if wrong makes both cards read 100× high and means the low-credit
   alarm never fires at all.
2. **The independent tester's last report says FAIL, and the developer overruled it
   rather than fixing it.** The reasoning is disclosed and, in my judgement as the
   author of the spec, correct — but it is an owner-level ruling about how parses
   are counted, and it rewrote two criteria of this spec. It needs the owner's word,
   not mine.
3. **Nobody has verified the tree since that overrule.** The developer amended two
   criteria and re-pointed three of the tester's failing tests at different
   behaviour. That is precisely the move that has to be independently walked, and it
   has not been.

Nothing was silently descoped and nothing out of scope crept in. Every change of
mind is disclosed in writing. This is a rejection about evidence and about two
owner calls, not about sloppy work.

---

## 1. Criterion by criterion

### Money cards

| # | Verdict | Evidence |
|---|---|---|
| 1 | MET | Playwright renders `$12.34` from a ready snapshot; the worker log shows zero outbound Cloudflare requests during page load (`06-verify.md` C1). |
| 2 | MET, at risk | Headroom computed, not hardcoded (`src/data/monitoring.ts:237`; node test `:256`). At risk: the P1 finding says the two figures being subtracted may not be comparable (`07-review-codex.md` P1; `07-review-architecture.md` High). |
| 3 | MET, at risk | Per-gateway cap with account-level fallback, and the snapshot records which source supplied it (node `:372`, `:738`; snapshot type `src/data/monitoring.ts:12`). Same P1 risk: the rule's own window and technique are discarded. |
| 4 | MET | Node `:294` plus two Playwright unavailable-state tests, including a placeholder account id treated distinctly from a missing token. |
| 5 | MET | Node `:322`, `:603`, plus a live run against an unreachable Cloudflare — counts still refreshed, page still loaded. |
| 6 | MET, at risk | Playwright stale sentence and per-card "as at" stamps. At risk: a snapshot with an unparseable timestamp passes validation and then blanks the whole page (`07-review-codex.md` P2; no evidence of a fix). |

### Parse counts

| # | Verdict | Evidence |
|---|---|---|
| 7 | MET | A live worker against a real D1, seeded with 40 completed and 3 failed parses, returned `success7d: 40, error7d: 3` (`06-verify.md` C7). Closes round 2's evidence gap. |
| 8 | MET IN INTENT — ratified, pending one verification | The tester reported FAIL (F1). The developer did not change the counting code; he argues a real retry reuses the same claim row, so three attempts are one count, and that separate generations are separate parse jobs because the document set actually changed. The tester's own live evidence for F2 corroborates the in-place reclaim. I ratify the reading: it follows the owner's "one parse event = one claim lifecycle" ruling, and collapsing generations would hide genuine failures from the error card. But the spec text was amended by the developer, and the re-pointed test has not been walked by anyone independent. |
| 9 | MET | A live 31-minute `processing` row produced `error7d: 1`. Note the criterion's "attempts exhausted" clause is not in the predicate — age alone decides (`DEBT.md` F9, low). |
| 10 | MET | A live 5-minute `processing` row appeared in neither total nor any bucket. |
| 11 | MET IN INTENT — ratified, pending one verification | The tester reported FAIL (F2). The criterion says *building-model* run, which is the separate `ai_runs` subsystem; the tester extended it to staff pressing "Try again" on a customer's document. Excluding that would erase a genuine customer parse from both cards — a document that failed, was retried by staff and then succeeded would appear nowhere at all, the opposite of what was asked for. I ratify the developer's reading as matching both the spec's own words and the business intent. Same caveat: unverified since the test was re-pointed. |
| 12 | MET | Playwright empty states for both cards and the chart; node `:184`. |

### Chart

| # | Verdict | Evidence |
|---|---|---|
| 13 | MET | Node `:199`, `:578`, and live spread rows whose buckets sum exactly to the two count cards. Closes round 2's evidence gap. |
| 14 | MET | Playwright asserts 7 columns including empty days; node `:565`. |

Caveat on both: buckets key on a timestamp that a retry overwrites, so a parse can
move between days after the fact — the tester watched an error jump from the
2026-09-03 bucket to 2026-09-05 (`06-verify.md` F3, medium). The history is readable
but not stable.

### Notification bubble

| # | Verdict | Evidence |
|---|---|---|
| 15 | MET | Node `:248`. |
| 16 | MET, at risk | Node `:222`. At risk: if the cap lookup fails, the entire money block goes unavailable and a genuine low-credit alarm is suppressed (`07-review-codex.md` P2; `07-review-architecture.md` Medium) — the alarm failing silently in one of the situations it exists for. |
| 17 | MET | Node `:238` plus `notificationCount: one source` (`:424`). Closes round 2's evidence gap. |
| 18 | MET | Playwright bell navigation to Attention. |
| 19 | MET | Node `:217`; per-flag `available === true` guards (`src/data/monitoring.ts:223-224`). |
| 20 | MET | Node `:1002` — one source interface, one implementation, no source-specific branching. Two reviewers argue the registry is over-built for a single source; the developer declined on the owner's grill instruction to seed it. That is the owner's own call and it stands. |

### Freshness / cron

| # | Verdict | Evidence |
|---|---|---|
| 21 | MET | `wrangler.jsonc` still carries exactly one `*/10 * * * *` trigger; one KV key `monitoring:snapshot`. |
| 22 | MET | Two sequential page loads, zero Cloudflare calls, identical snapshot timestamp. |

### Abuse cases

| # | Verdict | Evidence |
|---|---|---|
| 23 | MET | `curl` with an empty cookie jar → `HTTP 403 {"error":"forbidden"}`, no figures in the body. |
| 24 | MET | A real customer session replayed at the ops host → `HTTP 403`. |
| 25 | MET | Manufacturer role confirmed via `GET /api/ops/me` → `"role":"manufacturer"`, then `HTTP 403`. |
| 26 | MET | The full 200 body was inspected: only the timestamp, the derived numbers, the cap source, day buckets, totals, red flags and the two thresholds. No token, no account id, no credentials. |
| 27 | MET | A forced Cloudflare failure was logged; a grep of the log found zero hits for the token and for `authorization`. |
| 28 | MET | Playwright: a customer at `/attention` is refused by the existing ops2 staff guard; node `:545`. No new auth path was introduced. |

**Tally: 28 of 28 met or ratified as met — 6 of them carrying a named risk that no
evidence closes, and 2 of them resting on an owner ruling that should be confirmed
in writing.** The independent security review found nothing above its reporting bar
and confirmed the endpoint fails closed, the token is secret-only, and the migration
is a pure column add with no table rebuild (so the cascade hazard does not apply).

## 2. Descoping

None silent. Three disclosed changes, each needing the owner's word:

- **The 7-day window is now seven Melbourne calendar dates, not a rolling 7×24
  hours** (`09-assumptions.md` §4). The two could not both hold once the chart had
  to sum to the cards. Cost: up to 24 hours less history depending on the time of
  day. This contradicts an `ASSUMED:` in the spec and needs sign-off.
- **The endpoint now refuses everyone with 403**; the earlier separate "sign in"
  answer for signed-out callers is gone (`09-assumptions.md` §5). Criterion 23
  allows either, and Cloudflare Access turns strangers away before the Worker sees
  them. No loss.
- **Criteria 8 and 11 were re-worded in this spec by the developer**, with the
  reasoning left visible. Ratified above, but the counting rule is the owner's.

Out of scope stayed out: no alerts, no amber tier, no drill-down, no queue
introspection, no notification persistence, no change to the parse pipeline itself
(the stuck-`processing` gap is counted, not repaired, exactly as specced), and no
customer-facing surface.

## 3. Scope creep

None found. The one thing beyond a bare reading of the spec — the notification
source registry — was requested by the owner at the grill and is criterion 20.

## 4. Assumptions awaiting sign-off

Nine, none approved. The developer's ledger opens with "Nothing below was approved
by him".

| Assumption | Status |
|---|---|
| $5.00 credit floor / 80% cap ceiling | Built. The owner ruled the values live in config; the two numbers themselves were never confirmed. |
| Rolling 7×24h window | **Changed** to seven Melbourne calendar dates. Needs sign-off on the new definition. |
| USD only, no AUD conversion | Built as specced. |
| "Cap outstanding" = cap minus billed spend | Built as specced — and this is the subtraction the P1 finding questions. |
| The five cards sit below "what needs a person" | Built; there is no such content in v1, so the cards are the page. |
| A stale snapshot is shown with its timestamp rather than suppressed | Built and evidenced (criterion 6). |
| Cloudflare money figures are dollars, not cents | **Unverified.** A 100× error either way. Settled by looking at the first real snapshot. |
| `CF_ACCOUNT_ID` committed as a plain config value | Reasonable — an identifier, already committed elsewhere in the same file, and dismissed explicitly by the security review. |
| Counting claim lifecycles, not documents | The owner ruled this at the spec gate; the grill record lagged and is struck through in place. Worth confirming, because criteria 8 and 11 now rest on it. |

## 5. What goes back to the developer

1. Make the billed-spend figure and the cap figure describe the same thing — same
   gateway, same window — or state plainly on the card what the percentage
   measures. Until then the red alarm can fire on a number that means nothing, or
   stay quiet when it should not.
2. Keep the low-credit alarm alive when the cap lookup fails.
3. Reject an unparseable snapshot timestamp instead of letting it blank the page.
4. Then one clean verification round on a committed tree: criteria 8 and 11, the
   three re-pointed tests, and a full suite run.

Everything else the reviewers raised is either recorded in `DEBT.md` with a reason
or was declined on the owner's own prior rulings.

## 6. Pipeline integrity

- The **security review ran and is clean**. The architecture, Codex and ponytail
  reviews all ran. The architect's own conclusion is "I would not approve the
  architecture yet" — that stands unresolved, and is the substance of item 1 above.
- **Codex could not run commands locally** (build and test invocations failed with
  permission errors, plus timeouts). Its findings come from reading the diff, not
  from executing it. That is a weaker review than a clean one and should not be
  presented as a full pass.
- The **security and ponytail reviewers ran under plan mode**, which blocked their
  reports from being written; both had to be recovered by hand. A standing pipeline
  defect, not a defect in this feature — but a run can look reviewed on an axis that
  never actually reported.
- The branch sits on the unmerged `feat/ops2-attention`, and roughly 43 files from
  another session's design-system work share the working tree. One Codex finding
  (theme shadow tokens self-referencing) belongs to that other work, not this
  feature — worth passing on, it looked real.
- Before this works in production the Cloudflare API token still has to be set as a
  Worker secret. Until then the two money cards correctly read "unavailable" and the
  parse counts work — which means criteria 1, 2 and 3 have never been seen with real
  data.
