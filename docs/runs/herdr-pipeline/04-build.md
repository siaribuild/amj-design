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
