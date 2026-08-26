#!/usr/bin/env node
// agent-guard: mechanical runaway protection for subagent orchestration.
// PreToolUse hook on Agent|SendMessage|Workflow. Keeps per-session counters in
// ~/.claude/agent-guard/ and answers "ask" (user must approve) when a call
// looks like a stalled loop or unbounded fan-out. Deterministic — no AI calls.
//
// Thresholds (override via .claude/hooks/agent-guard.config.json):
//   maxAgentSpawns      total Agent-tool spawns per session before each further spawn needs approval
//   maxSendsPerAgent    SendMessage calls to the same agent (loop rounds) before approval is needed
//   maxWorkflows        Workflow invocations per session before approval is needed
//   dupSimilarity       word-set Jaccard similarity at which a respawn counts as a duplicate

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const DEFAULTS = { maxAgentSpawns: 20, maxSendsPerAgent: 8, maxWorkflows: 5, dupSimilarity: 0.9 }
const STATE_DIR = path.join(os.homedir(), '.claude', 'agent-guard')
const STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function readStdin() {
  try { return fs.readFileSync(0, 'utf8') } catch { return '' }
}

function loadConfig(cwd) {
  try {
    const p = path.join(cwd, '.claude', 'hooks', 'agent-guard.config.json')
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(p, 'utf8')) }
  } catch { return DEFAULTS }
}

function statePath(sessionId) {
  const safe = String(sessionId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(STATE_DIR, `${safe}.json`)
}

function loadState(sessionId) {
  try { return JSON.parse(fs.readFileSync(statePath(sessionId), 'utf8')) } catch { return { spawns: [], sends: {}, workflows: 0 } }
}

function saveState(sessionId, state) {
  fs.mkdirSync(STATE_DIR, { recursive: true })
  fs.writeFileSync(statePath(sessionId), JSON.stringify(state))
  // opportunistic cleanup of stale session files
  try {
    for (const f of fs.readdirSync(STATE_DIR)) {
      const p = path.join(STATE_DIR, f)
      if (Date.now() - fs.statSync(p).mtimeMs > STATE_TTL_MS) fs.unlinkSync(p)
    }
  } catch { /* cleanup is best-effort */ }
}

function words(text) {
  return [...new Set(String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2))].slice(0, 300)
}

// Overlap coefficient (intersection / smaller set): robust to light rewording
// of the same task, which plain Jaccard under-scores on short prompts.
function similarity(a, b) {
  if (!a.length || !b.length) return 0
  const setB = new Set(b)
  const inter = a.filter(w => setB.has(w)).length
  return inter / Math.min(a.length, b.length)
}

function ask(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: `agent-guard: ${reason}` }
  }) + '\n')
}

function main() {
  let input
  try { input = JSON.parse(readStdin()) } catch { return } // unparseable: stay out of the way
  if (input.hook_event_name !== 'PreToolUse') return

  const tool = input.tool_name
  const cfg = loadConfig(input.cwd || process.cwd())
  const state = loadState(input.session_id)

  if (tool === 'Agent') {
    const prompt = input.tool_input?.prompt ?? ''
    const type = input.tool_input?.subagent_type ?? 'general-purpose'
    const w = words(prompt)

    const dup = state.spawns.find(s => s.type === type && similarity(w, s.words) >= cfg.dupSimilarity)
    state.spawns.push({ type, words: w, t: Date.now() })
    saveState(input.session_id, state)

    if (dup) {
      return ask(`this looks like a zombie respawn — a '${type}' agent already ran with a near-identical prompt this session (similarity >= ${cfg.dupSimilarity}). Relaunching the same prompt rarely produces a different result; diagnose or change the approach. Approve only if the rerun is intentional.`)
    }
    if (state.spawns.length > cfg.maxAgentSpawns) {
      return ask(`agent spawn #${state.spawns.length} this session (cap ${cfg.maxAgentSpawns}). This much fan-out may signal a stalled pipeline burning tokens. Approve to continue, or interrupt and simplify.`)
    }
    return
  }

  if (tool === 'SendMessage') {
    const ti = input.tool_input || {}
    const target = String(ti.agent_id ?? ti.agentId ?? ti.name ?? ti.agent ?? ti.recipient ?? ti.to ?? 'unknown')
    state.sends[target] = (state.sends[target] || 0) + 1
    saveState(input.session_id, state)

    if (state.sends[target] > cfg.maxSendsPerAgent) {
      return ask(`message #${state.sends[target]} to agent '${target}' this session (cap ${cfg.maxSendsPerAgent}). A conversation this long with one agent usually means a loop that is not converging. Approve to continue, or interrupt and adjudicate the impasse.`)
    }
    return
  }

  if (tool === 'Workflow') {
    state.workflows += 1
    saveState(input.session_id, state)
    if (state.workflows > cfg.maxWorkflows) {
      return ask(`workflow run #${state.workflows} this session (cap ${cfg.maxWorkflows}). Approve if this scale is intentional.`)
    }
  }
}

try { main() } catch (e) {
  // Fail open: guard problems must never block normal work. Surface on stderr for debugging.
  process.stderr.write(`agent-guard error: ${e?.message ?? e}\n`)
}
