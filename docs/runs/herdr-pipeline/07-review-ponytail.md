# 07 — ponytail review (over-engineering only)

Scope: `git diff $(git merge-base main HEAD)..HEAD` on `feat/herdr-pipeline`.
Hunting one class of defect only — dead flexibility and speculative structure.
Correctness, security and performance are out of scope here; they belong to the
other reviewers on this stage.

## Verdict first

**The shipped machinery is lean.** `herd.mjs` is 300 lines and every export has a
live caller; `conduct.mjs`'s pane lifecycle (`launchStage` → `settleStage` →
`holdWarm`/`finalizePane`) has no layer with one caller and no abstraction with
one implementation. For a feature whose entire justification is cost, the code
that will actually run every day is proportionate. Two knobs that look
speculative — `launchStage`'s `settleMs` and `watch`'s `sliceMs` — are test
seams the suite really passes, so they stay.

**The excess is all around it.** ~1030 of the ~1335 deletable lines are a
one-shot experiment and a directory that duplicates a git tag. Neither runs.
Both were committed permanently.

---

## Findings

### The one-shot experiment (291 lines + 3 empty files)

`scripts/pipeline/ab-test.sh:1-111`, `scripts/pipeline/ab-chain.sh:1-30`,
`scripts/pipeline/ab-compare.mjs:1-150`: **delete:** a single A/B run that has
already happened, hardcoded to one machine and one throwaway slug
(`ab-test.sh:25-27` `ROOT=/e/Projects`; `ab-compare.mjs:23-24`
`E:/Projects/ab-v1-gst`; the slug `gst-calc` in both). Nothing references them —
not `PIPELINE-V2.md`, not `CLAUDE.md`, not `package.json`. And they never
produced their own output: there is no `COMPARISON.md`, and the committed
evidence is `docs/pipeline/ab-results/v1.err`, `v1.result.json` and
`chain.console` at **0 bytes each** because the v1 arm was OOM-killed. Nothing
replaces it. Rerunning a comparison against a v1 that no longer exists is not a
thing anyone will do; the numbers that mattered are already written up in
`PIPELINE-V2.md`.

The three dead-weight cascades below all fall out of that deletion:

`scripts/pipeline/measure.mjs:188-201`: **delete:** `runDirTotals` — sole caller
is `ab-compare.mjs:39`.

`scripts/pipeline/measure.mjs:179`: **delete:** `cost: last.total_cost_usd` and
`models: Object.keys(mu)` on `streamTotals`. Sole consumer is `ab-compare.mjs:80,
83, 120`. `cost` additionally contradicts a documented owner ruling — the
conductor prints tokens and time and *never* a currency figure
(`conduct.mjs:141-142`) — so the only thing this field does is put dollars back
on a table the owner reads. The tester logged the same observation in
`06-verify.md`.

`scripts/pipeline/measure.mjs:79-90` and `:304-362`: **delete:** the `measure.mjs`
CLI `main()` and the `records()` generator that only `main()` uses (71 lines).
Its two invocations are `ab-test.sh:109` and `ab-chain.sh:21`. The `cwdFilter`
third argument exists solely to separate the two A/B worktrees. `sessionTotals`,
`stageTotals`, `windowTotals` and `latestRateLimitAnchor` are the live API and
stay; `DIRS()` stays with them.

### Dead fields inside the shipped code (~10 lines)

`scripts/pipeline/measure.mjs:225-226, 228, 246, 249, 253-254`: **delete:** the
`sessions` counters. Two `Set`s built, four update sites, two fields returned —
and `printWindow` (`conduct.mjs:462-467`) prints ctx, out and turns only.
Nothing in the repo reads `.sessions` except the test that asserts it exists.
This is the `segment_requirements_json` shape exactly: populated on every call,
read by nothing.

`scripts/pipeline/measure.mjs:293`: **delete:** `rateLimitType` on the anchor.
Both consumers (`resetAdvisory` at `conduct.mjs:447`, `printWindow` at
`conduct.mjs:456`) read `resetsAtMs` and nothing else.

`scripts/pipeline/conduct.mjs:526`: **delete:** `if (spec.model) a.push('--model',
spec.model)`. No entry in `STAGES` or `REVIEWERS` sets `model`, and no test does
either. Config for a value nobody sets. Add it back the day a stage needs a
different model — it is one line then too.

`scripts/pipeline/conduct.mjs:55-57`: **shrink:** `metered()`'s no-`source`
fallback is back-compat for "records written before `source` existed" — a
run.json format that never left this branch. `const metered = (s) => s.source &&
s.source !== 'none'` is the whole rule. (The `source: 'codex'` distinction is
load-bearing and well-tested; only the legacy arm goes.)

`scripts/pipeline/herd.mjs:38-43`: **shrink:** `checkLabel` is a longhand
re-implementation of the `check(what, re)` factory defined 10 lines below it at
`:52-56`. `export const checkLabel = check('herdr label', LABEL)` — one line,
same validation, same throw. (Validating the label at all is correct and stays:
`build-<taskId>` comes out of `02-tasks.json` and is typed at a TTY.)

### Committed state that git already holds (667 lines)

`docs/pipeline/v1-backup/**` (everything except `RESTORE.md`): **native:** git
tags. I diffed all twelve files against tag `pipeline-v1` — every one is
byte-identical modulo line endings. `RESTORE.md:40` even names the tag itself,
and `RESTORE.md:11-19` then warns that the `hooks/` copy **must not** be
restored because it reintroduces the shim bug this branch fixed. So the
directory is a verbatim copy of a git tag, carrying a landmine the accompanying
prose has to defuse.

Replace the whole tree with the two commands already implied by the doc:

```
git show pipeline-v1:CLAUDE.md > CLAUDE.md            # the only file v2 changed
git show pipeline-v1:.claude/agents/architect.md      # …and so on, if ever needed
```

Keep `RESTORE.md` — the warnings in it are the real content and are worth more
than the snapshot they describe.

### Committed run cursor

`docs/runs/.active`: **delete (from git):** a one-word cursor rewritten by every
`conduct start` on every machine, checked in and currently pointing at the
throwaway `smoke-test` run — it is already dirty in the working tree. This is
the same class as `docs/runs/*/logs/` and `docs/runs/*/prompts/`, which this
branch correctly gitignored (`.gitignore:56-60`). Add `docs/runs/.active` beside
them; it will otherwise conflict on every branch that runs the pipeline.

### Minor

`docs/runs/smoke-test/00-ask.md`, `01-spec.md`, `02-design.md`, `02-tasks.json`
(276 lines): **delete:** artifacts of a throwaway health-endpoint run.
`PIPELINE-V2.md:69` cites the smoke test's *measurements*, and those live in
`run.json` — keep that. The spec and design for a feature nobody shipped are not
evidence of anything.

---

## Explicitly not flagged

- **`scripts/tests/pipeline.test.mjs` (1963 lines) and
  `scripts/tests/fixtures/herdr-stub.mjs` (192).** Probity mandates test-first
  here; a red test is never unrequested code. I checked all twelve
  `HERDR_STUB_*` knobs against the suite — every one has a real consumer, and
  `HERDR_STUB_BLOCKED` exists precisely because the single-code knobs could not
  express two error codes at once. No stub knob is dead.
- **Rationale comments throughout.** House style, deliberate, and several of
  them (`herd.mjs:7-13` on why panes are never read, `conduct.mjs:508-518` on
  `acceptEdits`) record measurements that would cost real money to rediscover.
- **Validation at the herdr boundary** (`herd.mjs:38-59`, `writePrompt`'s
  `checkSlug`, `conduct.mjs:1164`'s `checkSlug` before the worktree path).
  Slugs and labels are interpolated into commands and paths; this is on
  ponytail's own "never be lazy" list.
- **`paneArgs`/`resumeArgs` as two wrappers**, the `direct` tier that only
  prints and exits, `saveRun`'s `Atomics.wait` retry (already carries its own
  `ponytail:` ceiling note). All defensible at their size.

---

net: -1335 lines possible.

Of which ~1030 is a finished experiment plus a directory git already versions,
and ~25 is dead flexibility inside code that ships. For a feature built to stop
the pipeline being expensive, the running code is the part that came out lean —
it is the sediment around it that is carrying weight.
