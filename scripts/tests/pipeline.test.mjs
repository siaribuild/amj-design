// Pipeline conductor + metering suite.
//
// Everything here runs against SEEDED FIXTURES: a temp CLAUDE_PROJECTS_DIR
// standing in for ~/.claude/projects, and a temp repo root standing in for the
// working tree. Nothing in this file may read the developer's real transcripts.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { sessionTotals, stageTotals } from '../pipeline/measure.mjs'
import { STAGES, REVIEWERS, cmds } from '../pipeline/conduct.mjs'

const CONDUCT = resolve('scripts/pipeline/conduct.mjs')

const NL = String.fromCharCode(10)

const tmp = (name) => mkdtempSync(join(tmpdir(), 'pipeline-' + name + '-'))

/** One assistant record as Claude Code writes it: one per content block. */
const rec = (sessionId, requestId, n) => JSON.stringify({
  type: 'assistant',
  sessionId,
  requestId,
  uuid: requestId + '-block' + n,
  timestamp: new Date().toISOString(),
  cwd: 'E:\\somewhere',
  message: {
    model: 'claude-opus-5',
    usage: { input_tokens: 100, cache_read_input_tokens: 900, output_tokens: 10 },
  },
})

/** Seed <projects>/<proj>/<session>.jsonl with `blocks` records per requestId. */
function seedTranscript(projects, proj, session, requestIds, blocks = 2) {
  const dir = join(projects, proj)
  mkdirSync(dir, { recursive: true })
  const lines = []
  for (const id of requestIds) for (let n = 0; n < blocks; n++) lines.push(rec(session, id, n))
  writeFileSync(join(dir, session + '.jsonl'), lines.join(NL) + NL)
  return dir
}

test('sessionTotals counts each API response once, not each content block', () => {
  const projects = tmp('dedupe')
  seedTranscript(projects, 'proj-a', 'sess-1', ['req-1', 'req-2', 'req-3'], 2)
  process.env.CLAUDE_PROJECTS_DIR = projects

  const t = sessionTotals('sess-1')
  // 3 API calls x (100 input + 900 cache read) = 3000 context, 3 x 10 output.
  // The naive per-record sum would be 6000 / 60 / 6 and must not pass.
  assert.equal(t.turns, 3)
  assert.equal(t.ctx, 3000)
  assert.equal(t.out, 30)
})

test('sessionTotals is addressed by session id: a sibling session is never counted', () => {
  const projects = tmp('address')
  seedTranscript(projects, 'proj-a', 'sess-mine', ['a1', 'a2'], 1)
  seedTranscript(projects, 'proj-b', 'sess-theirs', ['b1', 'b2', 'b3'], 1)
  process.env.CLAUDE_PROJECTS_DIR = projects

  assert.equal(sessionTotals('sess-mine').turns, 2)
  assert.equal(sessionTotals('sess-theirs').turns, 3)
  assert.equal(sessionTotals('sess-absent').turns, 0)
})

test('sessionTotals folds a session subagent transcripts into the parent', () => {
  const projects = tmp('subagents')
  const dir = seedTranscript(projects, 'proj-a', 'sess-1', ['req-1'], 1)
  const sub = join(dir, 'sess-1', 'subagents')
  mkdirSync(sub, { recursive: true })
  writeFileSync(join(sub, 'agent-1.jsonl'), rec('sess-1', 'req-sub', 0) + NL)
  process.env.CLAUDE_PROJECTS_DIR = projects

  const t = sessionTotals('sess-1')
  assert.equal(t.turns, 2)
  assert.equal(t.ctx, 2000)
})

test('stageTotals prefers the transcript and says so', () => {
  const projects = tmp('stage-transcript')
  seedTranscript(projects, 'proj-a', 'sess-1', ['req-1', 'req-2'], 3)
  process.env.CLAUDE_PROJECTS_DIR = projects

  const t = stageTotals('sess-1', join(projects, 'no-such-log.jsonl'))
  assert.equal(t.source, 'transcript')
  assert.equal(t.turns, 2)
  assert.equal(t.ctx, 2000)
})

test('stageTotals falls back to the stage log result object when the transcript has not flushed', () => {
  const projects = tmp('stage-result')
  mkdirSync(projects, { recursive: true })
  process.env.CLAUDE_PROJECTS_DIR = projects
  const log = join(projects, 'spec.jsonl')
  writeFileSync(log, [
    JSON.stringify({ type: 'assistant', message: { content: [] } }),
    JSON.stringify({
      type: 'result',
      session_id: 'sess-unflushed',
      num_turns: 7,
      modelUsage: {
        'claude-opus-5': {
          inputTokens: 500, cacheReadInputTokens: 4500, cacheCreationInputTokens: 0, outputTokens: 250,
        },
      },
    }),
  ].join(NL) + NL)

  const t = stageTotals('sess-unflushed', log)
  assert.equal(t.source, 'result')
  assert.equal(t.ctx, 5000)
  assert.equal(t.out, 250)
  assert.equal(t.turns, 7)
})

test('stageTotals reports source "none" when nothing is recoverable', () => {
  const projects = tmp('stage-none')
  mkdirSync(projects, { recursive: true })
  process.env.CLAUDE_PROJECTS_DIR = projects

  const t = stageTotals(undefined, join(projects, 'absent.jsonl'))
  assert.equal(t.source, 'none')
  assert.equal(t.turns, 0)
})

// --- the conductor -----------------------------------------------------------

/** A temp repo root holding one run, ready for `conduct report` / `conduct plan`. */
function seedRun(name, stages) {
  const root = tmp(name)
  const dir = join(root, 'docs', 'runs', 'demo')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(root, 'docs', 'runs', '.active'), 'demo')
  writeFileSync(join(dir, 'run.json'), JSON.stringify({
    slug: 'demo', base: 'abc12345', branch: 'work', ui: false, stages, tasksDone: [],
  }, null, 2))
  return { root, runJson: join(dir, 'run.json') }
}

const conduct = (root, projects, ...args) =>
  execFileSync(process.execPath, [CONDUCT, ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECTS_DIR: projects },
  })

test('conduct.mjs is importable: it exports its tables and commands without running', () => {
  assert.ok(Array.isArray(STAGES) && STAGES.length > 0)
  assert.ok(Array.isArray(REVIEWERS) && REVIEWERS.length > 0)
  assert.equal(typeof cmds.report, 'function')
  assert.equal(typeof cmds.plan, 'function')
})

test('no stage or reviewer carries a dollar budget', () => {
  for (const s of [...STAGES, ...REVIEWERS]) {
    assert.equal(s.budget, undefined, s.id + ' still has a budget field')
  }
  const src = readFileSync(CONDUCT, 'utf8')
  assert.ok(!src.includes('--max-budget-usd'), 'conduct.mjs still passes --max-budget-usd')
  assert.ok(!src.includes('overBudget'), 'conduct.mjs still computes an over-budget warning')
})

test('report heals a zero-token stage from the transcript, once, and prints unknown for the unrecoverable', () => {
  const projects = tmp('heal-projects')
  seedTranscript(projects, 'proj-a', 'sess-heal', ['r1', 'r2', 'r3'], 2)
  const { root, runJson } = seedRun('heal-run', {
    spec: { code: 0, contextTokens: 0, outputTokens: 0, turns: 0, session: 'sess-heal', seconds: 42 },
    design: { code: 0, contextTokens: 0, outputTokens: 0, turns: 0, seconds: 9 },
  })

  const out = conduct(root, projects, 'report')

  assert.match(out, /3k/, 'healed context total not printed')
  assert.match(out, /unknown/, 'unrecoverable row must print unknown, never 0')
  const saved = JSON.parse(readFileSync(runJson, 'utf8'))
  assert.equal(saved.stages.spec.contextTokens, 3000)
  assert.equal(saved.stages.spec.outputTokens, 30)
  assert.equal(saved.stages.spec.turns, 3)
  assert.equal(saved.stages.spec.source, 'transcript', 'heal must persist so it happens once')
  assert.equal(saved.stages.design.contextTokens, 0)
  assert.equal(saved.stages.design.source, undefined)
})

test('plan heals the same way and reports tokens, not money', () => {
  const projects = tmp('plan-projects')
  seedTranscript(projects, 'proj-a', 'sess-plan', ['r1', 'r2'], 2)
  const { root, runJson } = seedRun('plan-run', {
    spec: { code: 0, contextTokens: 0, outputTokens: 0, turns: 0, session: 'sess-plan', seconds: 12 },
  })

  const out = conduct(root, projects, 'plan')

  assert.match(out, /2k/)
  assert.equal(JSON.parse(readFileSync(runJson, 'utf8')).stages.spec.turns, 2)
})

test('no conductor output contains a dollar figure', () => {
  const projects = tmp('nodollar-projects')
  seedTranscript(projects, 'proj-a', 'sess-money', ['r1'], 1)
  const { root } = seedRun('nodollar-run', {
    spec: { code: 0, cost: 3.21, contextTokens: 0, outputTokens: 0, turns: 0, session: 'sess-money', seconds: 12 },
    design: { code: 0, cost: 9.99, contextTokens: 0, outputTokens: 0, turns: 0, seconds: 5 },
  })

  for (const cmd of ['report', 'plan', 'status']) {
    const out = conduct(root, projects, cmd)
    assert.ok(!/\$\s*\d/.test(out), cmd + ' printed a dollar figure:\n' + out)
    assert.ok(!out.includes('3.21') && !out.includes('9.99'), cmd + ' printed a persisted cost')
  }
})
