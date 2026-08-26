# 0013 — Probity runs through a direct shim, not the plugin

Status: accepted — architect ruling, herdr-pipeline design §9.5, 2026-08-26.
Written because nothing on disk recorded any of this: the arrangement had to be
reconstructed from a file header and a plugin manifest, and the owner could not
be expected to remember it.

## Context

Probity's TDD gate is a `PreToolUse` hook on `Bash|Write|Edit|NotebookEdit`. It
can be installed two ways:

1. **The `probity@probity` plugin.** Its `hooks/hooks.json` registers
   `npx @nizos/probity --agent claude-code`.
2. **A repo-local hook.** `.claude/settings.json` registers
   `node "${CLAUDE_PROJECT_DIR}/.claude/hooks/probity-subagent-shim.mjs"`,
   which spawns `node node_modules/@nizos/probity/dist/bin.js --agent claude-code`
   directly.

This repo uses (2). The plugin is installed but **disabled** —
`"probity@probity": false` in the user's `~/.claude/settings.json`. The shim's
name is now misleading: it was born to solve a subagent problem that no longer
exists (see below), and what it does today is simply *invoke Probity properly*.

The shim originally did two jobs. Only one was ever a workaround.

## Decision

**Keep the direct shim, keep the plugin disabled, and delete the subagent half.**

### Job 2 — direct bin invocation. Kept; this is the reason the shim exists now.

- **`npx` resolves on every single tool call.** The hook fires on every `Bash`,
  `Write`, `Edit` and `NotebookEdit`, which in a working session is hundreds of
  times an hour. `npx @nizos/probity` performs package resolution each time,
  before Probity has done any work at all. `node node_modules/@nizos/probity/dist/bin.js`
  is one `existsSync` and a `spawnSync`.
- **A shell-spawned `npx` is needless attack surface** on the hot path of the
  guardrail itself. The shim composes an argv array; nothing it runs goes
  through a shell, and there is deliberately no `npx` fallback.
- **Fail closed.** If no candidate root has a local `@nizos/probity`, the shim
  emits `permissionDecision: "deny"` rather than passing the write through. No
  gate means no write. A gate that fails open is not a gate.
- **Multi-candidate root resolution — do not regress this.** The bin is looked
  for under `payload.cwd`, then `CLAUDE_PROJECT_DIR`, then `process.cwd()`.
  Resolving from `payload.cwd` alone was a live outage: after any `cd` inside a
  `Bash` call, Claude Code reports cwd as a POSIX path (`/e/Projects/x`), which
  `path.join` cannot resolve on Windows. `probityBin` then returned null and the
  shim denied *every* `Bash`/`Write`/`Edit` for the rest of the session — the
  edits needed to repair it included — while blaming a missing install, with
  probity present the whole time.

### Job 1 — the subagent transcript rewrite. Deleted with this feature.

Claude Code sets the hook payload's `transcript_path` to the **session**
transcript even when the call comes from a subagent, whose own events live in
`<session-dir>/subagents/agent-<agent_id>.jsonl`. Probity therefore saw the main
thread's history, never the failing test the subagent had just written, and
denied every implementation write. The shim rewrote `transcript_path` whenever
`agent_id` was present.

That existed **solely because pipeline v1 ran the developer as a subagent**.
Under the pane pipeline every stage is a top-level session, `agent_id` never
appears in a hook payload, and the branch was dead code guarding a case that
cannot occur. `findSubagentTranscript` and its branch are gone.

### Why not enable the plugin as well

It would **double-gate**: two independent Probity evaluations of every write,
each paying its own latency, either able to deny. And the arrangement would be
strictly worse than the one it duplicates, because the plugin's half is the
`npx` invocation. There is no configuration in which running both is correct.

## Consequences

- `npm install` is load-bearing for the gate. A fresh clone with no
  `node_modules` denies every write until it is installed — the deny message
  says exactly that.
- The gate is versioned with the repo (`@nizos/probity` in `package.json`,
  1.10.0 today) rather than with whatever `npx` resolves.
- Three properties are covered by tests in `scripts/tests/pipeline.test.mjs`
  (`npm run test:pipeline`): a payload is forwarded byte-identical, a missing
  probity denies, and a POSIX `payload.cwd` still resolves the bin. A fourth
  reads the shim source and fails if the subagent rewrite or an `npx` call
  returns.

## Trap: two other copies of this file are pre-fix snapshots

`docs/pipeline/v1-backup/hooks/probity-subagent-shim.mjs` and
`docs/pipeline-template/hooks/probity-subagent-shim.mjs` are byte-identical to
each other and both predate the cwd-resolution fix (commit `3e210dcf`). They
carry `const cwd = payload?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd()`
— which falls back only when `payload.cwd` is *falsy*, never when it is present
but unresolvable, and that is precisely the failing case.

**Copying either one over the live hook reintroduces the outage** — a session
that denies every write and misreports why. `docs/pipeline/v1-backup/RESTORE.md`'s
one-`cp` rollback covers `.claude/agents/` only; it was never a licence to
restore this file. The template copy is worse in kind, because it seeds *other*
repos with the bug; it is out of this change's scope and left as found.

## Do not "fix" this back

Reverting to the plugin looks like tidying — one less bespoke file, one less
thing to maintain. It costs an `npx` resolution per tool call and reintroduces
the shell on the guardrail's hot path, and if it is enabled *beside* the shim it
double-gates. If the shim is ever removed, `probity@probity` must be enabled in
the same change, never before it.
