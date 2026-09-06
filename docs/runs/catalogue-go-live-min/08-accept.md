# Acceptance — catalogue go-live minimum

Judged against `01-spec.md` §2, using `06-verify.md` as the evidence of record plus the four
review reports (`07-review-security.md`, `07-review-conformance.md`, `07-review-architecture.md`,
`07-review-codex.md`). No tests were re-run and no source was read at this stage.

**Verdict: REJECT** — 33 of 37 criteria met; 3 not met and 1 met only on today's data.
All four failures sit in the same place: the safety and read-back guarantees that are the
whole point of this feature. Nothing has been written to production, so nothing is live and
nothing needs undoing — the fix is a developer loop over `scripts/catalogue/`, then re-verify.

---

## 1. Per-criterion result

| # | Result | Evidence relied on |
|---|---|---|
| 1 | MET | Live dry run against the real dataset: exit 0, `21 amend target(s), 1 create target(s)`, single create `amj150st-awning-window`, zero problems (06 §criteria 1). |
| 2 | MET | Nothing-deleted test at test line 222 run against the real plan; `assertSafe` reports no violations (06 §2). |
| 3 | MET | Disable patch's `set` is exactly `{disabled: true}`; live dry run prints 11 disable lines (06 §3). |
| 4 | MET | Existing behaviour, untouched by the diff; catalogue suite's "withdrawn product still resolves by slug" test passes (06 §4). |
| 5 | MET | Disabled slug takes the unknown-slug path; sitemap test passes (06 §5). |
| 6 | MET | Candidate filter drops disabled; none of the 22 is in `DISABLE` (06 §6). |
| 7 | MET | Both bars still separate functions, neither touched; all 23 non-standard option refs matched to an active surcharge row in local D1 (06 §7). Strongest single piece of evidence in the report. |
| 8 | MET | Conditional spread means no `options` key at all when the list is NULL and there is no column-H hardware; test line 82 passes (06 §8). NULL ≠ `[]` preserved. |
| 9 | MET | Zero/two-published-row and missing-`uValue` cases are validation problems, not assumptions; live plan reports zero problems; other rows unpublished, not deleted (06 §9). |
| 10 | MET | Same zero-problem exit, via the missing-`uValue` check (06 §10). |
| 11 | MET | Test line 231 — derived rows carry a `DERIVED` `certificationRef`, no WERS id, and the owning product's notes repeat it (06 §11). |
| 12 | MET | Test line 248 — no Uw claim in prose when `uw` is null (06 §12). |
| 13 | MET | Test line 257; `amj80-awning` is not a mutation target in the live plan (06 §13). |
| 14 | MET | Test line 267 — AMJ80T, thermally broken, 5/12/5 (06 §14). |
| 15 | MET | Test line 276 — "Grade" in `specs` and `keySpecs`, no schema change (06 §15, §37). |
| 16 | MET | Four `alignHardware` tests; the previously standard hardware is demoted, never removed (06 §16). |
| 17 | MET | Test line 286 plus the live dry run's colour lines — Night Sky sole default, nothing removed (06 §17). |
| 18 | MET | Test line 299; `sys-72` is not a mutation target (06 §18). |
| 19 | MET | Merge (not replace) shown in live output: `amj100t-series-sliding-door [1000,3000,2800,2800] → [1000,3000,1900,2800]` (06 §19). |
| 20 | **MET ON TODAY'S DATA ONLY** | Row 4 resolves to `amj80-series-awning-window` as an amend, and no `set` in the live plan carries a slug key (06 §20). But the guard behind it does not cover the `createOrReplace` shape — see §2, Failure C. The criterion holds for the plan the owner would run today; it is not enforced. |
| 21 | MET | 354.64 present, 322.40 absent; `perim_rate`/`min_charge` 0 on every row; 22 card ids equal the 22 slugs exactly (06 §21). The GST-inclusive ruling landed correctly. |
| 22 | MET | Read back out of local D1 after applying the file: all five new cards present at `v1`, the three old differently keyed cards untouched, 38 rows total, nothing deleted (06 §22). |
| 23 | MET, with a gap in the evidence | Scan tests plus read-back (`v1: 5`, `v2: 17`). The `v1-provisional` and `v3` shapes were verified by expression equivalence, not observed data — the local database had all 17 update targets at plain `v1` (06 §23, method note). Carried to Decision 4. |
| 24 | MET | Regression only; `test:unit` 109/109 including "a display preference cannot change the tax on a sale"; no `src/data/` change in the diff (06 §24). |
| 25 | MET | All 22 refs resolve to a card after the rehearsal; option side closed by §7. Verified by existence rather than a live price preview — local price preview is a known-broken environment path, not a feature defect (06 §25, method note). Accepted. |
| 26 | MET | Instrumented transport records zero mutation POSTs; live dry run left the dataset untouched (06 §26). |
| 27 | MET | Each problem class names the offending document; test line 131 confirms non-zero exit before any POST (06 §27). |
| 28 | **NOT MET** | See §2, Failures A and B. |
| 29 | MET | All four breakage classes have a failing check (06 §29). |
| 30 | MET | Executed for real against live Sanity — reads only (06 §30). |
| 31 | MET | Test line 19 — refuses before any network request, so no partial application (06 §31). |
| 32 | **NOT MET** | See §2, Failure C. |
| 33 | MET | Scan tests plus a read of the file: 17 UPDATEs and one five-row INSERT, no DDL. Independently confirmed by the security review (54 static lines, no interpolation). |
| 34 | MET | Source scan finds no `child_process` and no `wrangler`; the remote apply exists only as a comment for the owner (06 §34). |
| 35 | MET | Same paths as criterion 5 — no field of a withdrawn product reaches a public response (06 §35). |
| 36 | MET | Executed: `git status --porcelain` (60 entries) ∩ `git diff --name-only d8f994aa..HEAD` (13 files) = empty set (06 §36). The other effort's work was not touched. |
| 37 | MET | 13 changed files, none under `worker/`, `src/`, `migrations/`, `sanity/` (06 §37). Confirmed independently by the conformance review. |

---

## 2. Why this is a reject

### Failure A — one `--write` does not finish the job (criterion 28)

Criterion 28 promises: the owner runs `--write`, then runs `--verify`, and it reports pass.
It does not. The new AMJ150ST product copies its options from the AMJ100T product **as that
product is today**, while the same run changes AMJ100T's hardware. So after the write, the
plan still wants one more patch, and `--verify` reports drift.

This is not a reviewer's speculation. The build note itself records it ("convergence also
needs 2 fixture rounds… this is real `plan()` behaviour, not a bug", `04-build.md` T4), and
the test only passes because the fixture is looped to a fixed point up to five times before
verifying (architecture review; Codex P1). The verify stage checked this criterion against
that looped fixture, which is exactly why it read as PASS.

Business consequence: the owner's one-command production write becomes "write, verify, see a
failure, write again" — a second unplanned mutation of the live catalogue, and a read-back
that cries wolf. The deliverable of this feature is a *provably correct* plan; a plan that
needs two applications is not that.

### Failure B — `--verify` can report pass when a product is missing (criterion 28)

The verify path takes only the mutation list from the planner and throws away the planner's
`problems`. If a sheet product or a withdrawal target has gone missing from the catalogue,
the planner flags a problem but may emit no mutation for it — and `--verify` exits 0
(architecture review; Codex P1). A read-back that can pass while a go-live product is absent
does not satisfy "re-reads every touched document and reports pass".

### Failure C — the slug guard has a hole (criteria 32, and the enforcement behind 20)

Criterion 32 is an abuse-case criterion: any plan containing a slug change must abort before
anything is sent. The guard checks slug keys inside *patches* only. A `createOrReplace` of an
existing thermal-profile document carries the desired slug in the document body and is not
checked, so `--write` could rename an existing profile's slug (Codex P1). The conformance
review found the sibling hole in the same function: the `drafts.` rule is checked on patch
targets only, not on create targets (conformance Finding 1).

Today's live plan does not contain such a mutation, which is why criterion 20 reads as met.
But criterion 32 asks for a guard, not for luck with the current data — and slug changes are
in the spec's explicit out-of-scope list (§3), so the guard is the thing preventing an
out-of-scope production change.

---

## 3. Descoping, scope creep, assumptions

- **Nothing was silently descoped.** Both places where the tester substituted a weaker check
  (criterion 23's version shapes, criterion 25's price preview) are stated in the report as
  method notes rather than buried. Criterion 25's substitution is legitimate — local price
  preview is a known-broken environment path unrelated to this feature. Criterion 23's is
  carried to Decision 4.
- **No scope creep.** 13 files, all under `docs/`, `scripts/`, `CONTEXT.md` and one
  `package.json` script line. No `worker/`, `src/`, `migrations/` or Sanity schema change —
  asserted by the tester and independently confirmed by both the conformance and security
  reviews.
- **Codex's P2 about `src/styles/theme.css` shadow tokens is not this feature's.** That file
  is one of the other effort's uncommitted working-tree changes; it is outside
  `d8f994aa..HEAD`. It looks like a real defect (self-referential `--shadow-*` remapping
  killing card and dialog shadows) and should be raised against that effort — see Decision 2.
- **All assumptions are owner-approved.** Spec §4's five assumptions were accepted as written
  on 2026-09-06 and the GST basis (Q1) became an owner ruling. No `ASSUMED:` tag is open, and
  none needs sign-off.
- **Security: clean.** No findings at HIGH or MEDIUM. No PII, payout, ABN or session surface;
  rate-card figures are public list prices; the token is read the same way the existing WERS
  importer reads it and is never logged.
- **Ponytail's ~61 deletable lines are not blocking** — dead `stable()`, a one-caller
  `rekey`, duplicate module exports and some tests that restate the sheet back at itself.
  Worth a cleanup pass, but this is one-shot tooling; see Decision 3.
- **Pre-existing failure noted and correctly attributed**: two cycle-cap tests in the
  conductor's own `pipeline.test.mjs` fail at the base commit too. Not this feature's.

---

## 4. What goes back to the developer

Test-first, all inside `scripts/catalogue/` and `scripts/tests/`:

1. Build the created product from the source's **planned** state, so one `--write` converges
   and `--verify` immediately after it passes. The convergence test must stop looping the
   fixture — one round, then verify.
2. Route dry-run, write and verify through the same plan-result validation, so `--verify`
   fails on planner problems instead of discarding them.
3. Extend the safety guard to create-shaped mutations: reject a `createOrReplace` that would
   change an existing document's slug, and apply the `drafts.` rule to create targets too.
4. Make the fake transport answer the verification query, so the "successful verification"
   test exercises something rather than passing on an empty result set.

Then re-run `verify`, and re-check criteria 20, 28 and 32 specifically.

---

## Decisions needed

1. **Must one `--write` finish the job, or is "write, verify, write again" acceptable for a
   one-off migration?** — Recommend: require single-write convergence (fix A). A second
   production mutation is a second change-control event on the live catalogue, and a read-back
   that fails by design trains you to ignore it. Cost is one developer loop on script code
   with nothing live yet.
2. **The `theme.css` shadow-token defect Codex found in your other effort's uncommitted
   work** — cards, dialogs and drawers would render with no shadow. Recommend: I file it
   against that effort now so it is not lost when this branch merges; it is explicitly not
   fixed here.
3. **Apply the ~61 lines of ponytail cleanup to the script before merge?** — Recommend: no.
   This is one-shot go-live tooling, and the deletions touch the same functions the fixes
   above will rewrite. Harvest it with `ponytail-debt` after the write is done.
4. **Before you apply `rate-cards.sql` to production D1, do you want the current remote
   `version` values exported first?** — Recommend: yes. Every one of the 17 update targets
   was at plain `v1` locally, so the `v1-provisional → v2` and `v3 → v4` behaviour was proved
   by reading the expression, not by watching it run. One `SELECT card_id, version FROM
   pricing_rate_card` export from your terminal closes it, and the house rule is that a clean
   local run proves nothing about prod.
