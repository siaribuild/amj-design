# Design-conformance review — herdr-pipeline

Reviewer: architect. Scope: structure against `02-design.md` + `02-tasks.json`,
owner rulings in `DECISIONS.md` (4 rounds). Diff: `6a5668d2..HEAD`. Not a bug
hunt — the tester ran two adversarial passes.

**Verdict: CONFORMS, with 5 accepted deviations (0 high, 0 medium, 5 low).
Nothing routes to a developer.** The design doc has been amended (§15 addendum)
so the accepted deviations do not survive as stale instructions — the failure
mode registration Phase 2 taught us.

---

## 1. Absence check — every designed file exists

Every path named in `02-tasks.json` (t1–t9) is present in the tree and in the
diff: `scripts/pipeline/conduct.mjs`, `scripts/pipeline/herd.mjs`,
`scripts/pipeline/measure.mjs`, `scripts/tests/pipeline.test.mjs`,
`scripts/tests/fixtures/herdr-stub.mjs`, `.mcp.json`, `.gitignore`,
`package.json`, `docs/pipeline/PIPELINE-V2.md`,
`.claude/hooks/probity-subagent-shim.mjs`,
`docs/adr/0013-probity-direct-shim-not-plugin.md`. The design-named test suite
is real, wired as `test:pipeline` (package.json:19) and appended to `test:pure`
(package.json:17) — 75+ tests, covering the §12 criterion table including the
no-agent-read stub hard-fail, the fan-out ordering, the sequential build, and
the shim triple. No named-but-never-created artifact this run.

The build log's three admitted gaps are the only structural gaps found:

1. **Reviewer tab (design §4) not built** — reviewer panes split off the plan
   pane (`conduct.mjs:645-650` via `runReviews` → `rolePane`). Admitted in
   `04-build.md` (t6), recorded in `PIPELINE-V2.md:351-353` with the reason:
   the tab helper belongs in `herd.mjs`, outside t6's file list. Cramped, not
   wrong; no data path or ruling depends on the tab. **Accepted — low.**
2. **`conduct plan` showing a running stage** — the F2 fix landed and is
   verified in code: `plan` renders `[>]` with `running` / `held: <reason>`
   for stages and `build-<id>` rows (`conduct.mjs:1330-1362`), pinned by the
   test at `pipeline.test.mjs:371`. **Closed, not a divergence.**
3. **Restore requires the gitignored `prompts/<label>.txt`** — `cmds.resume`
   dies with an explicit re-run instruction when the file is absent
   (`conduct.mjs:1204`). A residual limitation, named in `PIPELINE-V2.md:412`,
   not hidden. The design never specified this failure mode. **Accepted
   residual — low.**

## 2. Owner rulings — each verified in code

- **No runaway guard of any kind.** `watch()` (`herd.mjs`) loops on bounded
  `agent wait` slices with no token, turn, dollar or wall-clock ceiling — the
  comment block at `conduct.mjs:137-142` records the ruling in the stage table
  itself. `--max-budget-usd`, `budget` fields and `overBudget` are gone
  (asserted by test, `pipeline.test.mjs:283`). The only cap is the permitted
  **cycle cap**: `CYCLE_CAP = 2` verify rounds (`conduct.mjs:986`), which also
  refuses a `fix` session past the cap (a fix that could never be re-verified
  is the same loop) while still writing deferred debt. Within the permitted
  concept. **Holds.**
- **No dollar figures in conductor output.** Grep of both modules finds `$`
  and `cost` only in comments and in `streamTotals`' internal `cost` field,
  which is consumed only by the A/B harness, never printed by any `conduct`
  command. Test `pipeline.test.mjs:492` pins it. **Holds.**
- **No percentage / remaining / headroom.** `windowTotals` returns numbers and
  one boolean; `rate_limit_event` parsing takes only `resetsAt` and
  `rateLimitType` (`measure.mjs`, `latestRateLimitAnchor`). The words appear
  only in comments forbidding them. **Holds.**
- **Criterion 14 stays open.** The design's §12 table carries it as OPEN GAP
  with the inverting reasoning explicitly withdrawn (N1 amendment);
  `06-verify.md` F3 records it CONFIRMED unmet; DECISIONS round 4 is quoted,
  not re-litigated. Nothing in the diff re-discharges or descopes it. The
  acceptance stage must carry it as unmet-and-visible. **Holds.**
- **`.claude/agents/*.md` untouched.** `git diff --name-only 6a5668d2..HEAD --
  .claude/agents` is empty. The one-`cp` rollback claim stands, with the
  correct caveat in `PIPELINE-V2.md` that the v1-backup *shim* snapshot is
  pre-fix and must not be blanket-restored. **Holds.**
- **Pane stages `acceptEdits`, headless `bypassPermissions`.**
  `PANE_PERMISSION = 'acceptEdits'` (`conduct.mjs:518`) feeds `paneArgs` and
  `resumeArgs`; `claudeArgs` passes `bypassPermissions` for headless; readonly
  reviewers get `plan`. Pinned by `pipeline.test.mjs:670`. **Holds.**
- **Build sequential, reviewers concurrent.** `runBuild` awaits each task in a
  for-loop with a comment forbidding fan-out (`conduct.mjs:~830`); `runReviews`
  starts all four via `.map` before `Promise.all` (`conduct.mjs:921`). Both
  directions pinned (`pipeline.test.mjs:1346`, `:1455`). **Holds.**

## 3. Deviations from the design text — accepted, design amended

- **D4 — session-id adoption reversed (§3.1 step 3).** Design said: if
  interactive claude rejected `--session-id`, adopt herdr's
  `agent_session.value`. Built: interactive claude *accepts* `--session-id`
  (t4 live check), and a live incident showed herdr can report a **dead**
  agent's session for a reused pane — so the boot id is authoritative and a
  disagreement is printed and kept as `herdrSession` (`herd.mjs:200-206`,
  commit 3654ebde). The design's contingency was for a condition that turned
  out false, and the replacement is strictly safer for `--resume`/metering.
  **Accepted — low; design amended.**
- **D5 — pane permission mode (§3.1 step 2).** Design argv said
  `--permission-mode <bypassPermissions|plan>`. Built: `acceptEdits` for pane
  boots, because an interactive `bypassPermissions` boot raises a consent
  dialog nothing persists, which blocked every pane stage of every run
  (measured live, commit 280d6722) — and the owner ruling now names
  `acceptEdits`. **Accepted — low; design amended.**
- **D6 — finalize does not wait for the shell (§3.4 step 3).** Design said
  finalize sends `/exit` then waits for the pane to return to a shell. Built:
  `/exit` is sent best-effort (`conduct.mjs:702`) and readiness is enforced at
  the *reuse* point instead — `rolePane` re-checks `paneReady` and splits a
  fresh pane if the old one is not back at a shell (`conduct.mjs:645-650`),
  which §4 also specified. Same invariant, enforced once at the seam that
  needs it; worst case is an extra pane, never a collision. **Accepted — low.**
- **Blocked-at-launch hold (not in design).** `agent_blocked` on prompt
  delivery returns `{ blocked, pendingLine }` instead of throwing
  (`herd.mjs` launchStage), and the conductor holds `blocked-launch` warm with
  `answer` delivering the undelivered prompt line. Additive, and it is the
  hold-warm architecture doing exactly what it exists for — coherent, not a
  bolt-on.
- **`stageTotals` seam (§6.1 layer 2).** The transcript→result→none fallback
  the design placed in `runClaude`'s close handler lives as
  `measure.mjs:stageTotals` instead. Better conformance to the house rule than
  the design's own text — one accounting module owns all accounting. Noted,
  no action.

## 4. The late proportionality change — coherent, not bolted on

Not in the original design; assessed on architecture rather than presence:

- **Tier membership is declared on the stage** — `tiers: [...]` on every
  `STAGES` entry, consumed only through `inTier` (`conduct.mjs:85`), which
  **both** `next` (`:1129`) and `plan` (`:1338`) use. No call-site skip exists;
  the stage table remains the single place the pipeline's shape is written,
  which is exactly the seam discipline the design demanded of everything else.
  `conduct run <stage>` deliberately bypasses tier membership — consistent
  with CLAUDE.md's "manual overrides always win".
- **`review` is `tiers: ['full']` and its mandatory status is written into the
  table** (comment at the stage entry). The `fix` tier without review matches
  CLAUDE.md's pre-existing "developer + tester only" tier; it is not a new
  hole. `--tier direct` refuses before anything is created.
- **Blast-radius verify** lives in `verifyPrompt` on the stage table, computed
  from the real diff, **failing closed** (unreadable/empty diff ⇒ full pass,
  `conduct.mjs:94-110`) — the correct direction for a product holding
  financial PII.
- **Severity gate** defers `low|cosmetic` to `DEBT.md` visibly, never
  silently; the severity comes from the reviewer, not the conductor.
- The whole tier mechanism is documented in `PIPELINE-V2.md:109-158` and
  covered by four tests (`pipeline.test.mjs:1827-1944`). It extends the stage
  table rather than routing around it. **Coherent; no findings.**

## 5. Sequencing

Commit order matches `02-tasks.json`: t1→t9 in sequence, shim edit last
(38141e91 tests → f7a5bc0f ADR → 1e4b23a3 shim), fixes as discrete
red-then-green commits after. The §9.5 load-bearing ordering was honoured.

---

Findings total: **0 high, 0 medium, 5 low — all accepted, none route to a
developer.** Design doc updated in place (`02-design.md` §15 as-built
addendum) so no stale instruction survives this review.
