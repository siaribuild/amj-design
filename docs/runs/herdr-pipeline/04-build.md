# Build log — herdr-pipeline

## t1 — Fix stage metering

Files: `scripts/pipeline/measure.mjs`, `scripts/pipeline/conduct.mjs`,
`scripts/tests/pipeline.test.mjs` (new), `package.json`.

- `measure.mjs`: projects dir is now `CLAUDE_PROJECTS_DIR || ~/.claude/projects`,
  read at call time (the test seam — no test may touch the real transcripts).
  `sessionTotals` is session-**addressed**: `<proj>/<sid>.jsonl` +
  `<proj>/<sid>/subagents/*.jsonl`, no machine-wide scan. New `stageTotals(sid,
  logPath)` = transcript → stream-result → none, returning `source`.
- `conduct.mjs`: close-handler uses `stageTotals` and stores `source`;
  `refreshRun()` heals any stage with a session that was not transcript-metered
  and persists once — called by `report` and `plan`. `metered()` decides
  numbers vs `unknown` (old records judged by their own figures). All `budget`
  fields, `--max-budget-usd`, the over-budget warning and every `$` are gone;
  `cost` is no longer written (old values stay, never printed). Import-guarded
  `main()`; exports `{ STAGES, REVIEWERS, cmds }`.
- 11 tests assert: requestId dedupe (naive sum fails), sibling sessions never
  cross-counted, subagent files folded in, result fallback, `source:'none'`,
  exports without `process.exit`, no `budget`/`--max-budget-usd`/over-budget in
  source, `report`/`plan` heal + persist + print `unknown`, and no `$`-adjacent
  digit in `report`/`plan`/`status`.

Next tasks: `npm run test:pipeline` (also in `test:pure`). Reuse `seedTranscript`
/ `seedRun` / `conduct()` helpers in the suite; `CLAUDE_PROJECTS_DIR` is the only
metering seam so far — `HERDR_BIN`/`CONDUCT_CLAUDE_BIN` are still to be added.

## t2 — Window-aware metering

Files: `scripts/pipeline/measure.mjs`, `scripts/pipeline/conduct.mjs`,
`scripts/tests/pipeline.test.mjs`.

- `measure.mjs`: `latestRateLimitAnchor(runsDir)` scans `<runsDir>/*/logs/*.jsonl`
  newest-mtime-first and returns `{ resetsAtMs, rateLimitType }` — `resetsAt` is
  UNIX **seconds**, and the event's `session_id`/`uuid` are dropped on the floor.
  `windowTotals({ anchorResetMs, now })` makes ONE machine-wide pass and returns
  `{ window: { ctx,out,turns,sessions,anchored,resetsAtMs }, week: {...} }` —
  numbers and one boolean, nothing else can escape. New `transcriptFiles()` walks
  top-level *and* `<sid>/subagents/*.jsonl`; `records()` now shares it.
- `conduct.mjs`: `printWindow()` under `report`'s table; `resetAdvisory()`
  (`RESET_ADVISORY_MIN = 15`) prints before `spawn` and never gates. Local `fmt`
  deleted in favour of `measure.mjs`'s, which has the B tier a real week needs.
- 8 new tests: anchor scaling + no session id, window/week bucketing with
  requestId dedupe and subagent files, trailing fallback (absent AND stale
  anchor), foreign-project containment (marker strings in no output), both
  report labels, no `%`/`remaining`/`headroom`, billions legibility, advisory
  fires ≤15min and never halts.

Next tasks: there is still **no quota figure anywhere in the instrument** — do
not add a percentage, a remaining or a headroom, however tempting the gauge
looks. `resetAdvisory`/`printWindow` are exported/testable; the claude binary
still has no seam, so the advisory's call site is asserted by source read.

## t3 — Real MCP config

Files: `.mcp.json` (new), `package.json` (+`@playwright/mcp` devDep, installed),
`scripts/pipeline/conduct.mjs`, `scripts/tests/pipeline.test.mjs`.

- `.mcp.json`: one server, `playwright` (`npx @playwright/mcp`). Sanity stays out
  — every session in this repo pays for whatever is in here.
- `conduct.mjs`: `claudeArgs(spec, promptText, mcpOk = browserMcp())` now exported;
  `mcp: true` + installed → `--mcp-config .mcp.json`, and **every** stage gets
  `--strict-mcp-config` (previously only non-mcp stages did). New exports
  `browserMcp(root)` (preflight) and `mcpAdvisory(spec, ok)` (warning or null);
  `runClaude` prints the warning before `spawn` and passes `mcpOk` through, so a
  missing browser degrades the stage to bare args instead of an npx fetch mid-run.
- 3 tests: `.mcp.json` parses to exactly one browser server (a second/`sanity`
  entry fails it) and the devDep is pinned; per-stage argv for both branches; the
  degraded path (warning text, no `--mcp-config`, source-read that `runClaude`
  never returns/exits on it). Each was mutation-checked.
- Probed live: init reports `playwright: connected`, 24 `mcp__playwright__*` tools
  (was 0). Next tasks: `claudeArgs` is exported now — assert argv, don't spawn.

## t4 — herd.mjs adapter

Files: `scripts/pipeline/herd.mjs` (new), `scripts/pipeline/conduct.mjs`,
`scripts/tests/fixtures/herdr-stub.mjs` (new), `scripts/tests/pipeline.test.mjs`,
`.gitignore` (+`docs/runs/*/prompts/`).

- `herd.mjs`: `available()`, `ensureCockpit()`, `paneReady()`, `writePrompt()`,
  `launchStage()`, and `herd(...argv)` — every call an execFile argv array whose
  thrown Error carries herdr's message verbatim AND its `code` (the branch for
  `agent_not_ready` keys off the code, not its prose). Allowlists at the
  boundary: `LABEL`, slug, pane id, and the base sha — the sha because the diff
  watch loop is the only command *string* with a variable in it.
- `conduct.mjs`: `checkSlug` is now `start`'s first statement (it fired after
  mkdir/.active/git before). New `paneMode(args)`/`noPanes()`; `--no-panes` is
  per-invocation, never persisted. `claudeArgs` split so `paneArgs(spec, sid)`
  shares the session flags (`--autocompact` above all) and drops `-p`.
- 12 new tests: bad slug creates nothing and calls no herdr/git; cockpit is
  workspace+plan+diff and boots no agent; herdr down ⇒ headless, run continues;
  launch sequence is process-info → agent start `-- <native args>` → agent get →
  one typed line; `$(...)` prompt leaves no marker and no byte in any argv;
  adoption of `agent_session.value`; retry-once-then-headless with the error
  verbatim; `agent_not_ready` is not a failure; the stub hard-fails on
  `agent read` and no path calls it.

**`--session-id` live check (DONE WHEN item) — PARTIAL, and it found a blocker.**
Interactive `claude --session-id not-a-uuid` answers `Invalid session ID. Must be
a valid UUID.` — so a non-`--print` boot **does** parse the flag. But end to end
through herdr it never gets that far on Windows: `herdr agent start ... -- <args>`
launches via `Start-Process -FilePath claude`, which resolves the extensionless
npm shim and dies with `%1 is not a valid Win32 application` →
`{"error":{"code":"timeout"}}`. Verified directly: `-FilePath claude` fails,
`-FilePath claude.cmd` prints the version. With **no** `--` args herdr types
`claude` at the prompt instead and it boots fine (blocked on the MCP trust
dialog — the `agent_not_ready` path). So today **every** native arg is lost in
pane mode, `--autocompact` included, and t5 will always hit the headless
fallback until `claude.cmd`/`claude.exe` shadows the shim on PATH or herdr's
Windows launcher is fixed. Raised, not worked around.

## t5 — Pane-mode stage execution

Files: `scripts/pipeline/herd.mjs`, `scripts/pipeline/conduct.mjs`,
`scripts/tests/pipeline.test.mjs`, `scripts/tests/fixtures/herdr-stub.mjs`.

- `herd.mjs`: `watch(label, {sliceMs})` — repeated bounded `agent wait`; settles
  on `idle|done` / `blocked`, treats an expired slice, `working` and `unknown`
  as "ask again", any other herdr error as `lost`. No sleep, no ceiling. Plus
  `agentPrompt`, `splitPane`, `notify` (best-effort), and an `onSession` hook in
  `launchStage` fired between `agent get` and `agent prompt`.
- `conduct.mjs`: `CONDUCT_CLAUDE_BIN` seam; `decisionsPending` split out of
  `decisionsOpen` (asked twice per stage, printed once); `rolePane` (reuse when
  the pane is back at a shell); `runPaneStage` → `settleStage` → `holdWarm` |
  `finalizePane`. `run`/`next`/`answer` take flags; `run` builds the cockpit if
  a headless-started run lacks one, and falls back to `runClaude` whenever pane
  mode yields null. `answer` nudges a live held agent — same session, no boot.
- Stub knobs added: `HERDR_STUB_STATES` (state sequence for `agent wait`,
  `timeout` = expired slice), `HERDR_STUB_SNAPSHOT` (copies a file aside on the
  first call of each subcommand — used to prove run.json holds the session
  BEFORE `agent prompt`); `pane split` now returns a fresh pane id each time.
- 6 tests: full lifecycle + `unknown` is not settled + pane left open + produces
  warning; decisions hold → `answer` → exactly one `agent start` and one session
  id; blocked-ui hold with no produces warning; watch-loop bounds/no-sleep/no-
  ceiling (source-read of the loop body); headless gate still spawns claude;
  role-pane reuse. Each was mutation-checked.

For t6/t7: a **held** stage has no `code`, so `cmds.next` would relaunch it into
a live agent name — t7's reattach must key off `status` in (`running`,`held`),
not just `running`. `runPaneStage(spec, promptText, run, label)` takes an
explicit label, so reviewers and `build-<id>` reuse it as-is; `settleStage` is
the tail to reuse after any relaunch. `previousSessions` is deliberately NOT
folded into `finalizePane` yet — t7 owns it.

## t6 — Review fan-out

Files: `scripts/pipeline/conduct.mjs`, `scripts/tests/pipeline.test.mjs`.

- `cmds.run` decides pane mode and builds the cockpit ONCE, above the stage
  shapes; `runBuild(run, spec, panes)` and `runReviews(run, panes)` take that
  boolean. Neither could reach pane mode before — the branch sat below them.
- `runReviews`: `conformance`/`ponytail` → `runPaneStage`, falling back to
  `runClaude` per reviewer; `security` carries `headless: true` in `REVIEWERS`
  and stays a `-p` child in every mode; `codex` untouched. Still one `.map` +
  `Promise.all`, so all four are started before any is awaited.
- `runPaneStage` announces `> <label>` BEFORE it looks for a pane (the pane id
  follows on its own line). That stdout line is the fan-out's timeline.
- `runBuild` runs each task as a pane agent, sequentially; a `held` task now
  stops the loop instead of being read as an exit-code failure.
- 3 tests: fan-out order (stdout + herdr timeline, codex joins it via a fake
  companion); one reviewer `blocked` while the other three finish, with codex
  exiting 3 to prove the "not a clean review" line survives; build `t2`'s
  `agent start` must follow `t1`'s `/exit`. All three mutation-checked.

For t7: **no reviewer tab** — design §4 wants one, but `herdr tab create`
(probed: `--workspace --cwd --label --no-focus` → `{tab, root_pane}`) needs
`herd.mjs` + the stub, neither of which t6 may touch. Reviewer panes split off
`planPane` like any role. Test seam note: `CONDUCT_CLAUDE_BIN=process.execPath`
is a usable headless-claude stub — node rejects `--output-format` loudly, which
is itself the proof the headless argv was spawned; a `.cmd`/`.bat` stub is not
an option (Node ≥20 `spawn` EINVAL without a shell).

## t7 — Durability

Files: `scripts/pipeline/conduct.mjs`, `scripts/pipeline/herd.mjs`,
`scripts/tests/pipeline.test.mjs`, `scripts/tests/fixtures/herdr-stub.mjs`.

- `herd.mjs`: `agentInfo(label)` — only an ABSENT record means gone; `unknown`
  is unsettled, never a licence to relaunch. `launchStage` takes an optional
  `line` (the typed line) so a restore says "you were interrupted".
- `conduct.mjs`: `cmds.resume(label)`, reached automatically by `next`, which
  scans for `status` in (`running`,`held`) before any unstarted stage (t5's
  handoff). Three outcomes: **reattach** (agent alive → `settleStage`, no
  boot), **restore** (`runPaneStage(..., resume)` → `resumeArgs` = `--resume
  <sid>`), **re-run** when `sessionTotals(sid).turns === 0` — nothing on disk
  to resume, so it says UNRECOVERABLE + "FROM THE START" in plain words, pushes
  the id to `previousSessions` and starts over. New `stageSum(s)` totals
  session + `previousSessions`, used by `finalizePane`, `refreshRun` and
  `runClaude`'s close handler; `runPaneStage`/`runClaude` carry
  `previousSessions` across the record rebuild. `stageSpec(label)` maps a
  run.json key back to its spec for the relaunch argv.
- Stub knob: `HERDR_STUB_NOAGENT` — `agent get` answers `agent_not_found`
  until an `agent start` is recorded (the world a reboot leaves).
- 6 tests: reattach (0 `agent start`, same session, only `/exit` typed);
  restore (`-- --resume <sid>`, no `--session-id`, prompt path re-handed);
  unrecoverable (says so, `previousSessions`, `--session-id` not `--resume`);
  finalize sums 2+3 sessions = 5 calls; `report` heals to the sum; a resumed
  `build-<id>` lands in `tasksDone`. The worktree-metering test was GREEN ON
  ARRIVAL (t1's session-addressed metering) — mutation-checked two ways.

For t8/t9: a restore needs `docs/runs/<slug>/prompts/<label>.txt`, which is
gitignored — a stage interrupted before it was written cannot be resumed and
says so. Restore is pane-only: with herdr down, `resume` exits and points at
`conduct run <label>`. **Not done: `plan` does not show a running stage** —
design §5 wants it there too; it is display-only and no criterion asked for it.

## t8 — Docs for pane mode

Files: `docs/pipeline/PIPELINE-V2.md` (only).

- New/rewritten in "Running it with herdr": auto-detect via `herdr workspace
  list` + `--no-panes` (per-invocation), the cockpit skeleton and role-pane
  reuse, hold-warm on `decisions`/`blocked-ui`, prompt files, "no result is ever
  read out of a pane" with the alternate-screen reason, and reattach/restore/
  re-run. Gaps recorded, not hidden: no reviewer tab, `plan` shows no running
  stage, restore needs the gitignored prompt file.
- Two machine-level hazards written down because they live nowhere in the repo:
  the 2.1.232-containerised vs 2.1.246-real-prefix drift (Probity's validator
  needs the pane-side login), and herdr 0.8.2's `Start-Process -FilePath claude`
  bug plus the `%LOCALAPPDATA%\Programs\claude-shim` forwarder that works around
  it (needs a herdr **server** restart).
- Upper half made honest: every `$`, `budget` and `--max-budget-usd` gone,
  replaced by the owner's no-runaway-guard ruling; new "Where the numbers come
  from" (requestId dedupe, 2.6x naive overcount, `unknown` != 0, window figures).
- **Rollback claim verified, not repeated:** `git diff --stat 6a5668d2..HEAD --
  .claude/agents/` is empty, so the one-`cp` claim holds. But
  `.claude/hooks/probity-subagent-shim.mjs` already differs from the v1-backup
  snapshot (commit 3e210dcf, the cwd-resolution fix) — restoring that copy would
  reintroduce the bug. Recorded in the Rollback section. **t9 shrinks that same
  shim: re-check this before touching it.**

## t9 — Probity shim shrunk, ADR recorded

Files: `scripts/tests/pipeline.test.mjs`, `docs/adr/0013-probity-direct-shim-not-plugin.md`
(new), `.claude/hooks/probity-subagent-shim.mjs`.

- Shim: header rewritten, `findSubagentTranscript` and the subagent-id branch
  deleted, `forward` folded into `raw`. Kept verbatim: direct
  `node node_modules/@nizos/probity/dist/bin.js`, the fail-closed deny, and the
  `payload.cwd` → `CLAUDE_PROJECT_DIR` → `process.cwd()` candidates (t8's
  warning re-checked: the v1-backup copy is still the pre-fix snapshot).
- 4 tests run the shim as a child process against a **stub** `@nizos/probity`
  that records its stdin: payload forwarded byte-identical (odd whitespace is
  the discriminator, so a re-serialise fails it); no probity anywhere ⇒
  `permissionDecision: 'deny'`; a POSIX `payload.cwd` still resolves via
  `CLAUDE_PROJECT_DIR`; plus a source read that fails if the subagent rewrite,
  an npx invocation, or a dropped root candidate returns.
- `probity@probity` untouched — still `false`, and in the USER's global
  settings, not this repo, so no test can assert it; the ADR carries it.
- Order executed, as §9.5 requires: tests green → ADR → commit → shim edit →
  suite re-run. `npm run test:pipeline`: 57/57.

## fixes — F1, F2, F4, F5

Files: `scripts/pipeline/conduct.mjs`, `scripts/pipeline/herd.mjs`,
`scripts/tests/pipeline.test.mjs`. One red-then-green cycle and one commit each.

- **F1** `answer` now resolves its gate with `stageSpec`, not `STAGES.find`, so
  `build-*`/`review-*` labels stop crashing on `spec.gate`/`spec.compact`;
  `resume`'s task recording is now a shared `finished()` that `answer` uses, so a
  task finished at a gate reaches `tasksDone`. The test also caught a third half:
  `afterStage` over-wrote the `gateStage` its own held agent had just claimed with
  the wrapper's id (`build`), so `build-t1` was reachable only via blocked-ui —
  now `r.gateStage || spec.id`. Asserts: gate is `build-t1`, `answer` exits clean,
  `tasksDone == ['t1']`, one `agent start` across the whole cycle.
- **F2** `plan` marks a `running`/`held` stage `[>]` and says which (`running` /
  `held: <reason>`), for build-task rows too — a task is the stage `build-<id>`,
  and `tasksDone` only knows about tasks that finished. Asserts each of `[x]`,
  `[>]`, `[ ]` lands on the right row.
- **F4** `writePrompt` validates the slug with the `checkSlug` already in the
  module. Asserts eight bad slugs throw; the red run really did create
  `%TEMP%/ESCAPED`.
- **F5** `refreshRun` re-reads stages already sourced `transcript` (writing only
  when a figure moved) and the headless `answer` branch meters and records the way
  `finalizePane` does. The test drives the same held stage through both modes and
  asserts the totals are *equal*, 5,000 ctx / 5 calls, not just non-stale.

`npm run test:pipeline`: 61/61. `npm run typecheck:gate` clean.
Pre-existing flake, NOT from these fixes — see the note under F5 in the handoff:
`one reviewer holding does not stall the other three` fails intermittently with
`EBUSY` on `run.json`; reproduced on the pre-fix sources (833 tests) too.

## fix — concurrent run.json writes

The review fan-out's four completions each write `run.json` whenever their
reviewer settles. A reader holding the file open at that instant makes the write
throw `EBUSY` on Windows — `copyFileSync` shares reads but not writes, and the
herdr stub snapshots `run.json` with exactly that call — out of a child's
`close` handler, where nothing catches it. The conductor died mid-fan-out and
every reviewer that had not saved yet lost its stage record.

`saveRun` now retries a busy write (100 × 10ms, `EBUSY`/`EPERM` only) — the
contention is microseconds long, so retrying is the fix; the reviewers stay
concurrent and `runBuild` stays sequential. Asserts: with a separate process
holding `run.json` in a `copyFileSync` loop for the whole fan-out, all four
`review-*` stage records survive. Red run recorded `stages: {}`.
