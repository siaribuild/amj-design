#!/usr/bin/env node
// probity-subagent-shim: makes Probity's TDD gate work inside subagents.
//
// The problem it solves: Claude Code always sets the hook payload's
// `transcript_path` to the *session* transcript, even when the tool call comes
// from a subagent. A subagent's own events (its red test run) live in a
// separate file: <session-dir>/subagents/agent-<agent_id>.jsonl. Probity reads
// transcript_path, so from inside a subagent it sees the main thread's history,
// never the failing test the subagent just wrote — and denies every
// implementation write. That forces implementation onto the main thread.
//
// The fix: when `agent_id` is present (documented as "present only when the
// hook fires from within a subagent"), rewrite transcript_path to that
// subagent's own transcript before handing the payload to Probity.
//
// Fail-safe: any uncertainty (no agent_id, file not found, parse error) passes
// the ORIGINAL payload through unchanged, so behaviour degrades to today's.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function readStdin() {
  try { return fs.readFileSync(0, 'utf8') } catch { return '' }
}

// <dir>/<session>.jsonl -> <dir>/<session>/subagents/agent-<id>.jsonl
// Workflow agents nest a level deeper, so fall back to a recursive search.
function findSubagentTranscript(transcriptPath, agentId) {
  if (!transcriptPath || !agentId) return null
  const sessionDir = transcriptPath.replace(/\.jsonl$/i, '')
  const subagentsDir = path.join(sessionDir, 'subagents')
  if (!fs.existsSync(subagentsDir)) return null

  const names = [`agent-${agentId}.jsonl`, `${agentId}.jsonl`]
  for (const n of names) {
    const direct = path.join(subagentsDir, n)
    if (fs.existsSync(direct)) return direct
  }

  const stack = [subagentsDir]
  while (stack.length) {
    const dir = stack.pop()
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (names.includes(e.name)) return p
    }
  }
  return null
}

function probityBin(cwd) {
  const local = path.join(cwd, 'node_modules', '@nizos', 'probity', 'dist', 'bin.js')
  return fs.existsSync(local) ? local : null
}

function main() {
  const raw = readStdin()
  let payload = null
  try { payload = JSON.parse(raw) } catch { /* pass through unchanged */ }

  let forward = raw
  if (payload?.agent_id) {
    const sub = findSubagentTranscript(payload.transcript_path, payload.agent_id)
    if (sub) forward = JSON.stringify({ ...payload, transcript_path: sub })
  }

  const cwd = payload?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const bin = probityBin(cwd)
  const result = bin
    ? spawnSync(process.execPath, [bin, '--agent', 'claude-code'], { input: forward, encoding: 'utf8' })
    : spawnSync('npx', ['@nizos/probity', '--agent', 'claude-code'], { input: forward, encoding: 'utf8', shell: true })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exitCode = result.status ?? 0
}

main()
