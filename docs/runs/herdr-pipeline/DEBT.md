# Deferred, not dropped

- [low] Security review, item 2: `runClaude` (`scripts/pipeline/conduct.mjs`)
  could call `checkLabel(label)` at the top, matching the boundary `herd.mjs`
  already enforces, so a malformed task id from the architect dies readably
  instead of crashing mid-run. Defensive hardening, not a defect: the writer of
  `02-tasks.json` is a `bypassPermissions` stage that already holds strictly
  more capability than the traversal would grant, the write is append-only, and
  the `.jsonl` suffix is forced. Deferred by owner direction on the final
  consolidation pass.
