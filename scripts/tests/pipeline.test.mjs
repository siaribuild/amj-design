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

import { sessionTotals, stageTotals, latestRateLimitAnchor, windowTotals } from '../pipeline/measure.mjs'
import { STAGES, REVIEWERS, cmds, resetAdvisory } from '../pipeline/conduct.mjs'

const CONDUCT = resolve('scripts/pipeline/conduct.mjs')

const NL = String.fromCharCode(10)

const tmp = (name) => mkdtempSync(join(tmpdir(), 'pipeline-' + name + '-'))

/** One assistant record as Claude Code writes it: one per content block. */
const rec = (sessionId, requestId, n, atMs = Date.now()) => JSON.stringify({
  type: 'assistant',
  sessionId,
  requestId,
  uuid: requestId + '-block' + n,
  timestamp: new Date(atMs).toISOString(),
  cwd: 'E:\\somewhere',
  message: {
    model: 'claude-opus-5',
    usage: { input_tokens: 100, cache_read_input_tokens: 900, output_tokens: 10 },
  },
})

/** Seed <projects>/<proj>/<session>.jsonl with `blocks` records per requestId. */
function seedTranscript(projects, proj, session, requestIds, blocks = 2, atMs = Date.now()) {
  const dir = join(projects, proj)
  mkdirSync(dir, { recursive: true })
  const lines = []
  for (const id of requestIds) for (let n = 0; n < blocks; n++) lines.push(rec(session, id, n, atMs))
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

// --- window-aware metering ---------------------------------------------------

/** A rate_limit_event exactly as the CLI streams it into logs/<label>.jsonl. */
const rateEvent = (resetsAtSec, sessionId) => JSON.stringify({
  type: 'rate_limit_event',
  rate_limit_info: {
    status: 'allowed',
    resetsAt: resetsAtSec,
    rateLimitType: 'five_hour',
    overageStatus: 'rejected',
    overageDisabledReason: 'out_of_credits',
    isUsingOverage: false,
  },
  uuid: 'uuid-' + resetsAtSec,
  session_id: sessionId,
})

/** Seed <runs>/<slug>/logs/<label>.jsonl with rate_limit_events. */
function seedRateLog(runsDir, slug, label, lines) {
  const logs = join(runsDir, slug, 'logs')
  mkdirSync(logs, { recursive: true })
  writeFileSync(join(logs, label + '.jsonl'), lines.join(NL) + NL)
  return logs
}

test('latestRateLimitAnchor returns the last reset time and nothing that identifies a session', () => {
  const runs = tmp('anchor')
  seedRateLog(runs, 'demo', 'spec', [
    rateEvent(1787719200, 'SECRETSESSIONA'),
    rateEvent(1787737200, 'SECRETSESSIONB'),
  ])

  const a = latestRateLimitAnchor(runs)
  assert.equal(a.resetsAtMs, 1787737200 * 1000, 'resetsAt is UNIX seconds and must be scaled')
  assert.equal(a.rateLimitType, 'five_hour')
  assert.ok(!JSON.stringify(a).includes('SECRETSESSION'), 'anchor leaked a session id: ' + JSON.stringify(a))
  assert.equal(latestRateLimitAnchor(join(runs, 'no-such-dir')), null, 'no logs must mean no anchor')
})

const HOUR = 3600 * 1000

test('windowTotals buckets machine-wide spend into the anchored 5h window and the rolling 7 days', () => {
  const projects = tmp('window')
  const now = Date.now()
  const resetsAtMs = now + 30 * 60 * 1000       // window opened at now - 4.5h
  // Inside the anchored window. Two API calls, two content blocks each.
  seedTranscript(projects, 'proj-a', 'sess-now', ['w1', 'w2'], 2, now - HOUR)
  // Six hours ago: inside the 7 days, outside the 5h window.
  seedTranscript(projects, 'proj-b', 'sess-old', ['o1', 'o2'], 2, now - 6 * HOUR)
  // Eight days ago: outside both. The file's mtime is now, so only the record's
  // own timestamp can exclude it.
  seedTranscript(projects, 'proj-c', 'sess-ancient', ['x1'], 1, now - 8 * 24 * HOUR)
  // Subagent turns are real spend against the same window.
  const sub = join(projects, 'proj-a', 'sess-now', 'subagents')
  mkdirSync(sub, { recursive: true })
  writeFileSync(join(sub, 'agent-1.jsonl'), rec('sess-now', 'w3', 0, now - HOUR) + NL)
  process.env.CLAUDE_PROJECTS_DIR = projects

  const t = windowTotals({ anchorResetMs: resetsAtMs, now })

  assert.equal(t.window.anchored, true)
  assert.equal(t.window.resetsAtMs, resetsAtMs)
  assert.equal(t.window.turns, 3, 'window must dedupe by requestId and include subagent turns')
  assert.equal(t.window.ctx, 3000)
  assert.equal(t.window.out, 30)
  assert.equal(t.window.sessions, 1)
  assert.equal(t.week.turns, 5, '7-day total must include the 6h-old session but not the 8-day-old one')
  assert.equal(t.week.ctx, 5000)
  assert.equal(t.week.sessions, 2)
})

test('windowTotals falls back to a trailing 5 hours when no future reset is known', () => {
  const projects = tmp('window-trailing')
  const now = Date.now()
  seedTranscript(projects, 'proj-a', 'sess-now', ['w1'], 1, now - HOUR)
  seedTranscript(projects, 'proj-a', 'sess-old', ['o1'], 1, now - 6 * HOUR)
  process.env.CLAUDE_PROJECTS_DIR = projects

  // No anchor at all, and a stale anchor, must both mean trailing.
  for (const anchorResetMs of [null, now - HOUR]) {
    const t = windowTotals({ anchorResetMs, now })
    assert.equal(t.window.anchored, false, 'anchorResetMs=' + anchorResetMs)
    assert.equal(t.window.resetsAtMs, null, 'a stale reset time must not be published')
    assert.equal(t.window.turns, 1, 'trailing window is the last 5 hours')
    assert.equal(t.week.turns, 2)
  }
})

test('windowTotals reports counts only: nothing from another project escapes it', () => {
  const projects = tmp('window-privacy')
  const now = Date.now()
  // A foreign project's transcript, of the shape one really has: a session id,
  // a working directory, and message content that happens to hold a secret.
  const dir = join(projects, 'C--Work-someone-elses-repo')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'FOREIGNSESSION.jsonl'), JSON.stringify({
    type: 'assistant',
    sessionId: 'FOREIGNSESSION',
    requestId: 'FOREIGNREQ',
    uuid: 'FOREIGNUUID',
    timestamp: new Date(now - HOUR).toISOString(),
    cwd: 'C:\\Work\\someone-elses-repo',
    message: {
      model: 'claude-opus-5',
      content: [{ type: 'text', text: 'the api key is FOREIGNSECRET' }],
      usage: { input_tokens: 100, cache_read_input_tokens: 900, output_tokens: 10 },
    },
  }) + NL)
  process.env.CLAUDE_PROJECTS_DIR = projects

  const t = windowTotals({ anchorResetMs: null, now })

  assert.equal(t.window.turns, 1, "another project's spend still counts toward the window")
  assert.equal(t.window.sessions, 1)
  const dump = JSON.stringify(t)
  for (const leak of ['FOREIGNSECRET', 'FOREIGNSESSION', 'FOREIGNREQ', 'FOREIGNUUID', 'someone-elses-repo'])
    assert.ok(!dump.includes(leak), 'windowTotals leaked ' + leak + ': ' + dump)
  for (const v of [...Object.values(t.window), ...Object.values(t.week)])
    assert.ok(typeof v === 'number' || typeof v === 'boolean' || v === null,
      'window totals must carry numbers only, got ' + typeof v)
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

test('report prints machine-wide window totals, anchored when a future reset is known', () => {
  const projects = tmp('report-window-projects')
  const now = Date.now()
  seedTranscript(projects, 'proj-a', 'sess-window', ['r1', 'r2'], 2, now - HOUR)
  const { root } = seedRun('report-window-run', {
    spec: { code: 0, contextTokens: 2000, outputTokens: 20, turns: 2, source: 'transcript', seconds: 12 },
  })
  seedRateLog(join(root, 'docs', 'runs'), 'demo', 'spec',
    [rateEvent(Math.round((now + 2 * HOUR) / 1000), 'FOREIGNSESSION')])

  const out = conduct(root, projects, 'report')

  assert.match(out, /5h window/, 'no 5-hour window row')
  assert.match(out, /anchored/, 'an anchored window must be labelled as one')
  assert.match(out, /resets/, 'an anchored window must name its reset time')
  assert.ok(!/trailing/.test(out), 'a future reset is an anchor, not a trailing estimate')
  assert.match(out, /7-day/, 'no rolling 7-day row')
  assert.match(out, /2k/, 'window context total not printed')
  // Criterion 24: the event carries no quota, so no share of one may be shown.
  assert.ok(!out.includes('%'), 'report printed a percentage:\n' + out)
  assert.ok(!/remaining|headroom/i.test(out), 'report printed an uncomputable figure:\n' + out)
  // Criterion 41: the anchor came out of a log carrying a session id.
  assert.ok(!out.includes('FOREIGNSESSION'), 'report leaked a session id:\n' + out)
})

test('report labels the window trailing when no future reset is known', () => {
  const projects = tmp('report-trailing-projects')
  seedTranscript(projects, 'proj-a', 'sess-window', ['r1'], 1)
  const { root } = seedRun('report-trailing-run', {
    spec: { code: 0, contextTokens: 1000, outputTokens: 10, turns: 1, source: 'transcript', seconds: 12 },
  })
  // A reset time already in the past: known, but stale.
  seedRateLog(join(root, 'docs', 'runs'), 'demo', 'spec',
    [rateEvent(Math.round((Date.now() - HOUR) / 1000), 'FOREIGNSESSION')])

  const out = conduct(root, projects, 'report')

  assert.match(out, /5h window/)
  assert.match(out, /trailing/, 'an unanchored window must say so rather than imply a reset')
  assert.ok(!out.includes('%'), 'report printed a percentage:\n' + out)
  assert.ok(!out.includes('FOREIGNSESSION'), 'report leaked a session id:\n' + out)
})

test('a stage starting near a reset gets an advisory and starts anyway', () => {
  const now = Date.now()

  const near = resetAdvisory({ resetsAtMs: now + 10 * 60 * 1000 }, now)
  assert.ok(near, 'no advisory inside the 15-minute threshold')
  assert.match(near, /starting anyway/, 'the advisory must say the stage runs regardless')
  assert.match(near, /\d\d:\d\d/, 'the advisory must name the reset time')
  assert.ok(!/%|remaining|headroom/i.test(near), 'the advisory invented a quota figure: ' + near)

  assert.equal(resetAdvisory({ resetsAtMs: now + 30 * 60 * 1000 }, now), null, 'advisory fired too early')
  assert.equal(resetAdvisory({ resetsAtMs: now - 60 * 1000 }, now), null, 'a past reset is not an advisory')
  assert.equal(resetAdvisory(null, now), null)

  // The advisory is printed, never obeyed: a stage must not be gated on it.
  const src = readFileSync(CONDUCT, 'utf8')
  const runClaude = src.slice(src.indexOf('function runClaude'), src.indexOf('// --- sliced build'))
  assert.ok(/resetAdvisory\(/.test(runClaude), 'runClaude never consults resetAdvisory')
  assert.ok(runClaude.indexOf('resetAdvisory(') < runClaude.indexOf('spawn(CLAUDE'),
    'the advisory must print before the stage is spawned')
  assert.ok(!/(return|process\.exit|throw)[^\n]*\n?[^\n]*advisory/i.test(runClaude),
    'runClaude must never halt or defer on window state')
})

test('window rows stay legible at the scale the week actually reaches', () => {
  // A real 7-day total measured on this machine is 4.16 BILLION context tokens.
  // Rendered by a formatter that stops at M it becomes "4163.7M", which is one
  // character wider than its column and runs into the next figure.
  const projects = tmp('report-billions-projects')
  const dir = join(projects, 'proj-a')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'sess-huge.jsonl'), JSON.stringify({
    type: 'assistant',
    sessionId: 'sess-huge',
    requestId: 'r1',
    uuid: 'r1-block0',
    timestamp: new Date().toISOString(),
    message: { model: 'claude-opus-5', usage: { input_tokens: 4.16e9, output_tokens: 4.5e6 } },
  }) + NL)
  const { root } = seedRun('report-billions-run', {
    spec: { code: 0, contextTokens: 1000, outputTokens: 10, turns: 1, source: 'transcript', seconds: 1 },
  })

  const out = conduct(root, projects, 'report')
  const row = out.split(NL).find((l) => l.includes('7-day'))

  assert.match(row, /4\.16B|4\.2B/, 'billions must not be rendered in millions: ' + row)
  assert.match(row, /ctx \S+\s+out \S+\s+\d+ calls/, 'window columns collided: ' + row)
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
