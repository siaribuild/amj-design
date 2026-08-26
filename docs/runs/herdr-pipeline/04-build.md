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
