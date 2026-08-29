#!/usr/bin/env node
// probity-subagent-shim: runs Probity's TDD gate from the repo-local install.
//
// The `probity@probity` plugin is deliberately disabled. Its hook resolves the
// Probity CLI through npx on EVERY Bash/Write/Edit/NotebookEdit call; this runs
// node_modules/@nizos/probity/dist/bin.js directly instead - no package
// resolution per tool call, and no shell on the guardrail's own hot path.
// Rationale, and why enabling both would double-gate every write:
// docs/adr/0013-probity-direct-shim-not-plugin.md. Do not "fix" it back.
//
// The name is historical. The shim also used to rewrite `transcript_path` for
// calls made from inside a subagent, because pipeline v1 ran the developer as
// one. Under the pane pipeline every stage is a top-level session, so nothing
// ever takes that branch and it was deleted.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function readStdin() {
  try { return fs.readFileSync(0, 'utf8') } catch { return '' }
}

function probityBin(cwd) {
  const local = path.join(cwd, 'node_modules', '@nizos', 'probity', 'dist', 'bin.js')
  return fs.existsSync(local) ? local : null
}

function main() {
  const raw = readStdin()
  let payload = null
  try { payload = JSON.parse(raw) } catch { /* pass through unchanged */ }

  // Try every plausible repo root, not just payload.cwd. After a `cd` inside a
  // Bash call, Claude Code reports cwd as a POSIX path ("/e/Projects/x"), which
  // path.join cannot resolve on Windows - probityBin then returns null and this
  // shim denied EVERY Bash/Write/Edit in the session, including the edits needed
  // to fix it. Fail-closed is preserved: we still deny once no candidate has a
  // local @nizos/probity.
  const candidates = [payload?.cwd, process.env.CLAUDE_PROJECT_DIR, process.cwd()]
  const bin = candidates.filter(Boolean).map(probityBin).find(Boolean) || null
  if (!bin) {
    // Fail closed, like Probity itself: no local @nizos/probity means the TDD
    // gate cannot run, so block rather than silently skip. (No shell fallback
    // on purpose - a shell-spawned package runner is needless attack surface.)
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'probity-subagent-shim: @nizos/probity is not installed in this repo (node_modules/@nizos/probity missing). Run `npm install` so the TDD gate can evaluate this action.'
      }
    }) + '\n')
    return
  }
  // The payload goes to Probity byte-identical: it is the harness's own JSON,
  // and re-serialising it would hand the gate bytes nobody wrote.
  const result = spawnSync(process.execPath, [bin, '--agent', 'claude-code'], { input: raw, encoding: 'utf8' })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exitCode = result.status ?? 0
}

main()
