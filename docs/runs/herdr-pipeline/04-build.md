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
