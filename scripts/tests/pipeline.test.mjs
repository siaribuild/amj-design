// Pipeline conductor + metering suite.
//
// Everything here runs against SEEDED FIXTURES: a temp CLAUDE_PROJECTS_DIR
// standing in for ~/.claude/projects, and a temp repo root standing in for the
// working tree. Nothing in this file may read the developer's real transcripts.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { sessionTotals, stageTotals, latestRateLimitAnchor, windowTotals } from '../pipeline/measure.mjs'
import {
  STAGES, REVIEWERS, cmds, resetAdvisory, claudeArgs, paneArgs, resumeArgs, browserMcp, mcpAdvisory,
} from '../pipeline/conduct.mjs'
import { LABEL, checkLabel, writePrompt, ensureCockpit, launchStage, watch } from '../pipeline/herd.mjs'

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

test('a measured zero and an unmeasured stage are not the same row', () => {
  // review-codex is another vendor's model: it really does burn zero Claude
  // tokens, and that zero is a READING. An unmetered stage is not zero, it is
  // unknown. `source: 'codex'` exists to tell the two apart - and nothing
  // pinned it, so tightening metered() to transcript/result only left the
  // suite green while a measured zero started reporting as unmeasured.
  const projects = tmp('codex-zero-projects')
  const { root } = seedRun('codex-zero-run', {
    'review-codex': { code: 0, contextTokens: 0, outputTokens: 0, turns: 0, source: 'codex', seconds: 4 },
    'review-ponytail': { code: 0, contextTokens: 0, outputTokens: 0, turns: 0, source: 'none', seconds: 6 },
  })

  const out = conduct(root, projects, 'report')
  const row = (label) => out.split(NL).find((l) => l.includes(label)) || ''

  assert.ok(!/unknown/.test(row('review-codex')),
    'a measured zero rendered as unmeasured: ' + row('review-codex'))
  assert.match(row('review-codex'), /\s0\s+0\s+0\s/,
    'a measured zero must print as 0: ' + row('review-codex'))
  assert.match(row('review-ponytail'), /unknown/,
    'an unmetered stage rendered as a measured zero: ' + row('review-ponytail'))
})

test('the stage table stays in columns at every width, unknown and billions alike', () => {
  // "unknown" is exactly 7 characters and the turns column was 7 wide, so the
  // one row whose whole purpose is to be noticed rendered as "unknownunknown".
  // A column has to be wider than its widest value or it is not a column.
  const projects = tmp('report-columns-projects')
  const { root } = seedRun('report-columns-run', {
    spec: { code: 0, contextTokens: 4.16e9, outputTokens: 5.1e6, turns: 12069, source: 'transcript', seconds: 8 },
    design: { code: 0, contextTokens: 0, outputTokens: 0, turns: 0, source: 'none', seconds: 0 },
  })

  const out = conduct(root, projects, 'report')
  const lines = out.split(NL)
  const header = lines.findIndex((l) => l.includes('stage') && l.includes('context'))
  const fields = (l) => l.trim().split(/\s{2,}/)

  assert.deepEqual(fields(lines[header]), ['stage', 'context', 'output', 'turns', 'time'])
  for (const label of ['spec', 'design']) {
    const row = lines.slice(header).find((l) => l.trim().startsWith(label)) || ''
    assert.equal(fields(row).length, 5, 'columns collided on the ' + label + ' row: "' + row + '"')
  }
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

test('plan shows an interrupted stage as in progress, never as not-started', () => {
  // Criterion 1. This is the pane the cockpit re-runs every 5 seconds, so it is
  // the one surface the owner actually reads. A stage that is running, or held
  // warm waiting for him, rendered identically to one that had never started.
  const projects = tmp('plan-live-projects')
  const { root } = seedRun('plan-live-run', {
    spec: { code: 0, contextTokens: 1000, outputTokens: 10, turns: 1, source: 'transcript', seconds: 3 },
    design: { status: 'running', mode: 'pane', pane: 'w9:p3', source: 'none' },
    'build-t1': { status: 'held', holdReason: 'blocked-ui', mode: 'pane', source: 'none' },
  })
  writeFileSync(join(root, 'docs', 'runs', 'demo', '02-tasks.json'), JSON.stringify([
    { id: 't1', title: 'first', done_when: 'done', files: ['a.js'] },
    { id: 't2', title: 'second', done_when: 'done', files: ['b.js'], after: ['t1'] },
  ]))

  const out = conduct(root, projects, 'plan')
  const row = (label) => out.split(NL).find((l) => l.includes(label)) || ''

  assert.match(row('spec'), /\[x\]/, 'a finished stage stopped reading as finished')
  assert.match(row('design'), /\[>\]/, 'a running stage reads as not-started: ' + row('design'))
  assert.match(row('t1  '), /\[>\]/, 'a held build task reads as not-started: ' + row('t1  '))
  assert.match(row('verify'), /\[ \]/, 'a stage that really has not started must stay [ ]')
  assert.match(row('t2  '), /\[ \]/, 'a task that really has not started must stay [ ]')
  // A mark on its own does not say which; the operator has to know whether the
  // agent is working or waiting on him.
  assert.match(row('design'), /running/i)
  assert.match(row('t1  '), /held|blocked/i)
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

// --- the MCP knob ------------------------------------------------------------

test('.mcp.json declares exactly one server, a browser one, and nothing else', () => {
  const cfg = JSON.parse(readFileSync(resolve('.mcp.json'), 'utf8'))
  const servers = Object.entries(cfg.mcpServers || {})
  assert.equal(servers.length, 1, 'every session in this repo pays for these definitions: ' +
    JSON.stringify(Object.keys(cfg.mcpServers || {})))
  const [name, server] = servers[0]
  // Criterion 31: Sanity's server is large and almost no stage touches the
  // catalogue, so its absence here is a tested constraint, not a preference.
  const decl = (name + ' ' + JSON.stringify(server)).toLowerCase()
  assert.match(decl, /playwright/, 'the one server must be the browser one, got: ' + decl)
  assert.ok(!/sanity/.test(decl), 'a non-browser server appeared in .mcp.json: ' + decl)

  const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  assert.ok(pkg.devDependencies['@playwright/mcp'],
    '@playwright/mcp must be pinned so availability is deterministic and offline')
})

test('mcp stages load exactly that file; every other stage loads nothing', () => {
  const ux = STAGES.find((s) => s.id === 'ux')
  const polish = STAGES.find((s) => s.id === 'polish')
  assert.ok(ux.mcp && polish.mcp, 'the browser stages must still carry mcp: true')

  const a = claudeArgs(ux, 'prompt', true)
  assert.equal(a[a.indexOf('--mcp-config') + 1], '.mcp.json', 'mcp stage got no project config')
  assert.ok(a.includes('--strict-mcp-config'),
    'without --strict-mcp-config the session also inherits user/global servers')

  for (const s of [...STAGES, ...REVIEWERS].filter((s) => !s.mcp)) {
    const b = claudeArgs(s, 'prompt', true)
    assert.ok(!b.includes('--mcp-config'), s.id + ' loads an MCP config it does not need')
    assert.ok(b.includes('--strict-mcp-config'), s.id + ' may inherit servers')
  }
})

test('an uninstalled browser server warns and degrades the stage, never fails it', () => {
  const ux = STAGES.find((s) => s.id === 'ux')

  assert.equal(browserMcp(tmp('mcp-absent')), false, 'preflight must key off a real install')

  const warn = mcpAdvisory(ux, false)
  assert.ok(warn, 'no warning when the browser server is unavailable')
  assert.match(warn, /unavailable/i)
  assert.match(warn, /without it/i, 'the warning must say the stage runs regardless')
  assert.equal(mcpAdvisory(ux, true), null, 'warned about an installed server')
  assert.equal(mcpAdvisory(STAGES.find((s) => s.id === 'spec'), false), null,
    'a stage that never asked for a browser must not be warned about one')

  // Degraded means bare: no config to a server that cannot start, and no npx
  // fetch of an uninstalled package mid-stage.
  const a = claudeArgs(ux, 'prompt', false)
  assert.ok(!a.includes('--mcp-config'))
  assert.ok(a.includes('--strict-mcp-config'))

  // The warning is printed, never obeyed.
  const src = readFileSync(CONDUCT, 'utf8')
  const runClaude = src.slice(src.indexOf('function runClaude'), src.indexOf('// --- sliced build'))
  assert.ok(/mcpAdvisory\(/.test(runClaude), 'runClaude never consults mcpAdvisory')
  assert.ok(runClaude.indexOf('mcpAdvisory(') < runClaude.indexOf('spawn(CLAUDE'),
    'the warning must print before the stage is spawned')
  assert.ok(!/(return|process\.exit|throw)[^\n]*mcp/i.test(runClaude),
    'a missing browser must not abort the stage')
})

// --- the herdr adapter -------------------------------------------------------
//
// Every test below drives the real herd.mjs against `scripts/tests/fixtures/
// herdr-stub.mjs` through HERDR_BIN. No herdr server, no pane, no claude - and
// the stub hard-fails if a data path ever calls `agent read`, which the design
// forbids (a working agent answers `agent_not_idle`, and Claude's alternate
// screen loses scrolled-off rows for good).

const STUB = resolve('scripts/tests/fixtures/herdr-stub.mjs')

/**
 * A temp repo root wired to the stub, for both in-process calls into herd.mjs
 * and child `conduct` processes. Every knob is reset on every call so one
 * test's failure injection cannot leak into the next.
 */
function stubbed(name, extra = {}) {
  const root = tmp(name)
  const log = join(root, 'herdr-calls.jsonl')
  const env = {
    HERDR_BIN: STUB, HERDR_STUB_LOG: log, HERDR_STUB_FAIL: '', HERDR_STUB_FAIL_ONCE: '',
    HERDR_STUB_ERR: '', HERDR_STUB_BUSY: '', HERDR_STUB_SESSION: '', HERDR_STUB_NOAGENT: '',
    // These two were the hole in "every knob is reset": stubbed() writes into
    // process.env, so a lifecycle script or an error code set by one test was
    // inherited by every test after it that did not happen to override it.
    HERDR_STUB_BLOCKED: '', HERDR_STUB_STATES: 'idle', HERDR_STUB_ERRCODE: '', ...extra,
  }
  Object.assign(process.env, env)
  return { root, log, env: { ...process.env, ...env } }
}

/** Every herdr invocation the stub recorded, as argv arrays. */
const calls = (log) => existsSync(log)
  ? readFileSync(log, 'utf8').trim().split(NL).filter(Boolean).map((l) => JSON.parse(l).argv)
  : []

const said = (log, ...words) => calls(log).filter((a) => words.every((w, i) => a[i] === w))

test('herdr identifiers are allowlisted before they ever reach a command', () => {
  for (const ok of ['build-t1', 'review-security', 'spec', 'a', 'x'.repeat(32)])
    assert.equal(checkLabel(ok), ok, ok + ' is a legal herdr agent name and was rejected')
  for (const bad of ['Build-T1', '1build', 'build t1', 'build;rm', 'build$(id)', '../evil',
    'x'.repeat(33), '', 'build.t1'])
    assert.throws(() => checkLabel(bad), /label/, 'checkLabel accepted ' + JSON.stringify(bad))
  assert.ok(LABEL.source.startsWith('^') && LABEL.source.endsWith('$'),
    'an unanchored allowlist matches a substring of anything: ' + LABEL)
})

test('a stage prompt is delivered as a FILE, byte-exact, and the file is gitignored', () => {
  const { root } = stubbed('prompt-file')
  // Everything a TTY would mangle: 2KB+, newlines, quotes, backticks.
  const body = 'Read "docs/x.md" and `do` it.' + NL + 'x'.repeat(2048) + NL + "end's"
  const rel = writePrompt(root, 'demo', 'build-t1', body)

  assert.equal(rel, 'docs/runs/demo/prompts/build-t1.txt', 'prompt path is not the designed one')
  assert.equal(readFileSync(join(root, rel), 'utf8'), body, 'prompt file is not byte-exact')

  const ignore = readFileSync(resolve('.gitignore'), 'utf8')
  assert.match(ignore, /docs\/runs\/\*\/prompts\//,
    'prompt files are stage scratch and must be ignored beside docs/runs/*/logs/')
})

test('writePrompt allowlists the slug too, not just the label', () => {
  // Criterion 39: no unvalidated run or task field may reach a herdr command.
  // The slug is half of this path, the path is typed at a herdr agent, and
  // checkSlug was sitting ten lines above unused - so `../../../ESCAPED` wrote
  // outside the repo and was then handed to an agent as its instructions.
  const { root } = stubbed('prompt-slug')

  for (const bad of ['../../../ESCAPED', '../escape', 'Bad Slug', 'evil;rm', '$(id)',
    '', '-leading', 'x'.repeat(50)])
    assert.throws(() => writePrompt(root, bad, 'spec', 'body'), /slug/i,
      'writePrompt accepted the slug ' + JSON.stringify(bad))
  assert.equal(existsSync(resolve(root, '..', '..', '..', 'ESCAPED')), false,
    'a rejected slug still created a directory outside the repo')

  assert.equal(writePrompt(root, 'demo', 'spec', 'body'), 'docs/runs/demo/prompts/spec.txt',
    'the legal path must be unchanged')
})

test('the pane boot carries the same native args as the headless one, plus the session id', () => {
  const ux = STAGES.find((s) => s.id === 'ux')
  const a = paneArgs(ux, 'sess-uuid', true)

  assert.equal(a[0], '--session-id')
  assert.equal(a[1], 'sess-uuid')
  // An interactive boot must not be handed the headless-only flags.
  for (const flag of ['-p', '--output-format', '--verbose'])
    assert.ok(!a.includes(flag), 'pane boot passed the headless flag ' + flag)
  // Lever 1 and the agent identity are not headless-only, and must survive.
  assert.equal(a[a.indexOf('--agent') + 1], 'ux-designer')
  assert.equal(a[a.indexOf('--autocompact') + 1], String(ux.compact))
  assert.equal(a[a.indexOf('--mcp-config') + 1], '.mcp.json')
  assert.ok(a.includes('--strict-mcp-config'))
  const reviewer = { ...REVIEWERS.find((r) => r.id === 'conformance'), readonly: true }
  assert.equal(paneArgs(reviewer, 'sid', true)[paneArgs(reviewer, 'sid', true)
    .indexOf('--permission-mode') + 1], 'plan', 'a read-only reviewer must boot in plan mode')
})

test('a pane stage never boots with bypassPermissions - headless still does', () => {
  // Measured live 2026-08-27, herdr 0.8.2 + a real claude: headless `-p` accepts
  // bypass silently, but an INTERACTIVE pane raises the Bypass Permissions
  // consent dialog ("1. No, exit  2. Yes, I accept"). Nothing persists an
  // acceptance - ~/.claude.json carries only hasTrustDialogAccepted, which is the
  // separate workspace-trust dialog - so it fired on EVERY pane stage of EVERY
  // run and blocked each one before it did a byte of work. Owner ruling: pane
  // stages use a non-bypass mode.
  //
  // acceptEdits is the most restrictive mode that still lets a stage work, and it
  // was chosen by probing a real claude in a real pane, not by reading the flag
  // list: it boots straight to `idle`/interactive_ready with no dialog, and a
  // Write and a Bash both went through unprompted. `plan` is read-only and
  // `manual` prompts on every edit; neither can carry a build slice.
  for (const spec of [...STAGES, ...REVIEWERS]) {
    const pane = paneArgs(spec, 'sid', true)
    const mode = pane[pane.indexOf('--permission-mode') + 1]
    assert.notEqual(mode, 'bypassPermissions',
      spec.id + ' boots a pane into the consent dialog that blocks every run')
    assert.equal(mode, spec.readonly ? 'plan' : 'acceptEdits', spec.id + ' booted a pane as ' + mode)
    // A resumed stage is the same boot pointed at an existing session, so it
    // must not quietly re-acquire the mode that blocks.
    const res = resumeArgs(spec, 'sid', true)
    assert.equal(res[res.indexOf('--permission-mode') + 1], mode, spec.id + ' resumes in a different mode')
  }

  // Headless is unchanged: no TTY, no dialog, and the ruling was about panes.
  const headless = claudeArgs(STAGES.find((s) => s.id === 'spec'), 'prompt', false)
  assert.equal(headless[headless.indexOf('--permission-mode') + 1], 'bypassPermissions')
  const reviewer = { ...REVIEWERS.find((r) => r.id === 'conformance'), readonly: true }
  const ro = claudeArgs(reviewer, 'prompt', false)
  assert.equal(ro[ro.indexOf('--permission-mode') + 1], 'plan', 'a read-only reviewer stays read-only')
})

/** A temp root that is a real git repo, so `conduct start` can read a base sha. */
function stubbedRepo(name, extra = {}) {
  const s = stubbed(name, extra)
  const git = (...a) => execFileSync('git', a, { cwd: s.root, encoding: 'utf8', stdio: 'pipe' })
  git('init', '-q', '-b', 'work')
  git('config', 'user.email', 't@example.com')
  git('config', 'user.name', 'T')
  writeFileSync(join(s.root, 'seed.txt'), 'seed')
  git('add', '-A')
  git('commit', '-qm', 'seed')
  return s
}

const startFails = (s, ...args) => {
  try {
    execFileSync(process.execPath, [CONDUCT, 'start', ...args],
      { cwd: s.root, encoding: 'utf8', env: s.env, stdio: 'pipe' })
    return null
  } catch (e) {
    return { status: e.status, out: (e.stdout || '') + (e.stderr || '') }
  }
}

test('conduct start validates the slug BEFORE it creates anything', () => {
  const s = stubbedRepo('bad-slug')
  const before = readdirSync(s.root).sort()

  for (const bad of ['../escape', 'Bad Slug', 'evil;rm', '$(id)', 'x'.repeat(60)]) {
    const r = startFails(s, bad, 'an ask')
    assert.ok(r, 'start accepted the slug ' + JSON.stringify(bad))
    assert.notEqual(r.status, 0, 'a rejected slug must exit non-zero')
    assert.match(r.out, /slug must match/, 'the failure must name the slug, not something downstream')
    // Nothing anywhere: not under docs/runs, not beside it, not above it.
    assert.deepEqual(readdirSync(s.root).sort(), before,
      'start created something for the slug ' + JSON.stringify(bad))
    assert.equal(existsSync(join(s.root, 'docs')), false, 'start created docs/ for a bad slug')
    // checkSlug must precede the git call and the herdr call, not follow them.
    assert.equal(existsSync(s.log), false, 'start called herdr before validating the slug')
  }
})

test('conduct start builds the cockpit: a workspace, a plan pane and a diff pane, and nothing else', () => {
  const s = stubbedRepo('cockpit')

  const out = execFileSync(process.execPath, [CONDUCT, 'start', 'demo', 'an ask'],
    { cwd: s.root, encoding: 'utf8', env: s.env })

  const argvs = calls(s.log)
  assert.equal(said(s.log, 'workspace', 'create').length, 1, 'no workspace for the run')
  assert.equal(said(s.log, 'pane', 'split').length, 1,
    'the skeleton is plan + diff; stage panes are split on demand, not at start')
  assert.equal(said(s.log, 'pane', 'run').length, 2, 'both cockpit panes must be given their watch loop')
  assert.equal(said(s.log, 'agent', 'start').length, 0, 'start must boot no agent - no stage has run yet')

  const ws = said(s.log, 'workspace', 'create')[0]
  assert.equal(ws[ws.indexOf('--label') + 1], 'demo')
  assert.ok(ws.includes('--no-focus'), 'a cockpit pane must never steal focus')
  for (const split of said(s.log, 'pane', 'split'))
    assert.ok(split.includes('--no-focus'), 'a split must never steal focus')

  const run = JSON.parse(readFileSync(join(s.root, 'docs', 'runs', 'demo', 'run.json'), 'utf8'))
  assert.equal(run.herdr.planPane, 'w9:p1')
  assert.equal(run.herdr.diffPane, 'w9:p2')
  assert.equal(run.herdr.workspace, 'w9')

  // The diff loop is the one command string with a variable in it. It carries
  // the base sha and nothing else that could have come from a run field.
  const diff = said(s.log, 'pane', 'run').find((a) => a.join(' ').includes('git'))
  assert.match(diff[3], new RegExp('diff --stat [0-9a-f]{7,40}\.\.\.HEAD'), 'diff loop: ' + diff[3])
  assert.match(said(s.log, 'pane', 'run')[0][3], /conduct\.mjs plan/, 'no plan watch loop')
  assert.match(out, /run started: demo/)
  assert.equal(existsSync(s.log + '.readcalled'), false, 'start read a pane')
})

test('conduct start says why when herdr is not there, and starts the run anyway', () => {
  const s = stubbedRepo('herdr-down', { HERDR_STUB_FAIL: 'workspace list' })

  const out = execFileSync(process.execPath, [CONDUCT, 'start', 'demo', 'an ask'],
    { cwd: s.root, encoding: 'utf8', env: s.env })

  assert.match(out, /run started: demo/, 'a missing herdr must never fail a run')
  assert.match(out, /headless/i, 'the operator must be told the mode dropped, and why')
  assert.equal(said(s.log, 'workspace', 'create').length, 0, 'built a cockpit against a dead server')
  assert.equal(JSON.parse(readFileSync(join(s.root, 'docs', 'runs', 'demo', 'run.json'), 'utf8')).herdr,
    undefined)
})

test('--no-panes keeps conduct start on the headless path without touching herdr', () => {
  const s = stubbedRepo('no-panes')

  execFileSync(process.execPath, [CONDUCT, 'start', 'demo', '--no-panes'],
    { cwd: s.root, encoding: 'utf8', env: s.env })

  assert.equal(existsSync(s.log), false, '--no-panes still called herdr')
  const run = JSON.parse(readFileSync(join(s.root, 'docs', 'runs', 'demo', 'run.json'), 'utf8'))
  assert.equal(run.herdr, undefined)
  assert.equal(run.noPanes, undefined, '--no-panes is per-invocation and must not be persisted')
})

test('the cockpit accepts every slug conduct itself accepts', async () => {
  const s = stubbed('long-slug')
  const long = 'a'.repeat(49)                     // the longest slug checkSlug allows

  const c = await ensureCockpit({ slug: long, base: 'abc1234', root: s.root })

  assert.equal(c.planPane, 'w9:p1')
  await assert.rejects(() => ensureCockpit({ slug: 'Bad Slug', base: 'abc1234', root: s.root }),
    /slug/i, 'herd.mjs is the herdr boundary and must validate there too')
  await assert.rejects(() => ensureCockpit({ slug: 'demo', base: 'HEAD; rm -rf /', root: s.root }),
    /base commit/i, 'a commit sha is the only variable in a command STRING - it must be allowlisted')
})

test('a herdr command that answers with nothing is a success, not a parse error', async () => {
  const s = stubbed('silent-ok')

  // `pane run` writes zero bytes and exits 0 - and the cockpit's first act is a
  // pane run. JSON.parse('') threw "Unexpected end of JSON input", ensureCockpit
  // failed at its own first call, and every live run degraded to headless with
  // the cockpit - this feature's whole point - never built once.
  const c = await ensureCockpit({ slug: 'demo', base: 'abc1234', root: s.root })

  assert.equal(c.planPane, 'w9:p1')
  assert.equal(c.diffPane, 'w9:p2', 'the split after a payload-less pane run must still land')
  assert.equal(said(s.log, 'pane', 'run').length, 2, 'both watch loops must have been sent')
})

test('launchStage checks the pane is at a shell, then boots claude with native args', async () => {
  const s = stubbed('launch')
  const argv = paneArgs(STAGES.find((st) => st.id === 'spec'), 'sess-uuid', false)

  const r = await launchStage({
    paneId: 'w9:p3', label: 'spec', sessionId: 'sess-uuid', argv,
    promptPath: 'docs/runs/demo/prompts/spec.txt',
  })

  const seq = calls(s.log).map((a) => a.slice(0, 2).join(' '))
  assert.deepEqual(seq, ['pane process-info', 'agent start', 'agent get', 'agent prompt'],
    'the launch sequence is readiness -> start -> identity cross-check -> prompt: ' + seq)

  const start = said(s.log, 'agent', 'start')[0]
  assert.deepEqual(start.slice(0, 8),
    ['agent', 'start', 'spec', '--kind', 'claude', '--pane', 'w9:p3', '--timeout'])
  assert.deepEqual(start.slice(start.indexOf('--')), ['--', ...argv],
    'native claude args must follow -- verbatim: ' + start.join(' '))

  assert.equal(r.session, 'sess-uuid', 'herdr reported the id it was given; nothing to disagree about')
  assert.equal(r.herdrSession, undefined, 'agreement must not be reported as a mismatch')
  assert.equal(existsSync(s.log + '.readcalled'), false, 'the launch path read a pane')
})

test('launchStage types ONE line - the path - and never a byte of the prompt', async () => {
  const s = stubbed('prompt-inert')
  // A prompt that would create a marker file if anything ever handed it to a
  // shell: command substitution, backticks, a separator, a newline.
  const marker = join(s.root, 'PWNED')
  const q = String.fromCharCode(96)
  const body = 'Do the task. $(node -e "require(' + q + 'fs' + q + ').writeFileSync(' +
    JSON.stringify(marker) + ', ' + q + 'x' + q + ')")' + NL +
    q + 'touch ' + marker + q + '; echo "done"' + NL
  const rel = writePrompt(s.root, 'demo', 'build-t1', body)

  await launchStage({
    paneId: 'w9:p3', label: 'build-t1', sessionId: 'sess-uuid',
    argv: ['--session-id', 'sess-uuid'], promptPath: rel,
  })

  assert.equal(existsSync(marker), false, 'a prompt was evaluated by a shell somewhere')
  const prompt = said(s.log, 'agent', 'prompt')[0]
  assert.equal(prompt.length, 4, 'more than one line was typed into the pane: ' + prompt.join(' | '))
  assert.equal(prompt[3], 'Read ' + rel + ' and do exactly what it says.')
  assert.ok(!prompt[3].includes(NL), 'a newline in typed text submits it early')
  // Criterion 38: no fragment of the prompt body reached any argv at all.
  const dump = JSON.stringify(calls(s.log))
  for (const frag of ['PWNED', '$(', 'touch ', 'done'])
    assert.ok(!dump.includes(frag), 'prompt content reached a herdr argv: ' + frag)
})

/** Run fn with console.log captured; returns [result, lines]. */
async function quiet(fn) {
  const lines = []
  const real = console.log
  console.log = (...a) => lines.push(a.join(' '))
  try { return [await fn(), lines] } finally { console.log = real }
}

test('launchStage retries once, then falls back headless printing herdr error verbatim', async () => {
  const err = 'timed out waiting for agent startup'

  const once = stubbed('launch-retry', { HERDR_STUB_FAIL_ONCE: 'agent start', HERDR_STUB_ERR: err })
  const [ok] = await quiet(() => launchStage({
    paneId: 'w9:p3', label: 'spec', sessionId: 'sid', argv: [], promptPath: 'p.txt', settleMs: 0,
  }))
  assert.ok(ok, 'one bounded retry must be made before giving up')
  assert.equal(said(once.log, 'agent', 'start').length, 2)
  assert.equal(said(once.log, 'pane', 'process-info').length, 2,
    'readiness must be re-checked before the retry, not assumed')

  const dead = stubbed('launch-fail', { HERDR_STUB_FAIL: 'agent start', HERDR_STUB_ERR: err })
  const [r, log] = await quiet(() => launchStage({
    paneId: 'w9:p3', label: 'spec', sessionId: 'sid', argv: [], promptPath: 'p.txt', settleMs: 0,
  }))

  assert.equal(r, null, 'two failures must hand the stage back for a headless run, not throw')
  assert.equal(said(dead.log, 'agent', 'start').length, 2, 'exactly one retry, bounded')
  assert.equal(said(dead.log, 'agent', 'prompt').length, 0, 'prompted an agent that never started')
  assert.ok(log.join(NL).includes(err), 'herdr own error must be printed verbatim:' + NL + log.join(NL))
  assert.match(log.join(NL), /headless/i, 'the operator must be told the stage dropped to headless')
})

test('a pane that is not at a shell prompt is never handed an agent', async () => {
  const s = stubbed('busy-pane', { HERDR_STUB_BUSY: 'w9:p3' })

  const [r] = await quiet(() => launchStage({
    paneId: 'w9:p3', label: 'spec', sessionId: 'sid', argv: [], promptPath: 'p.txt', settleMs: 0,
  }))

  assert.equal(r, null)
  assert.equal(said(s.log, 'agent', 'start').length, 0,
    'agent start against a busy pane is the measured timeout this check exists to pre-empt')
})

test('no herd.mjs path reads a pane', () => {
  const src = readFileSync(resolve('scripts/pipeline/herd.mjs'), 'utf8')
  const code = src.split(NL).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(NL)
  assert.ok(!/'(agent|pane)',\s*'read'/.test(code),
    'agent read answers agent_not_idle while working, and the alternate screen loses ' +
    'scrolled-off rows for good. Results come from files.')
})

test('agent_not_ready is a live agent on a dialog, not a failed launch', async () => {
  // herdr answers this when the agent booted but is blocked on a startup UI -
  // the first-run bypassPermissions acknowledgement, or an MCP trust prompt
  // (both seen live). The name IS registered, so retrying would collide; the
  // stage is handed on to the watch loop, which surfaces `blocked` and holds.
  const s = stubbed('not-ready', {
    HERDR_STUB_FAIL: 'agent start',
    HERDR_STUB_ERRCODE: 'agent_not_ready',
    HERDR_STUB_ERR: 'agent spec is blocked during startup and is not ready for prompts',
  })

  const [r] = await quiet(() => launchStage({
    paneId: 'w9:p3', label: 'spec', sessionId: 'sid', argv: [], promptPath: 'p.txt', settleMs: 0,
  }))

  assert.ok(r, 'a blocked-on-startup agent must not be treated as a failed launch')
  assert.equal(said(s.log, 'agent', 'start').length, 1, 'a live agent name must not be re-started')
  assert.equal(said(s.log, 'agent', 'prompt').length, 1)

  // The same message under a different code IS a failure: the branch must key
  // off herdr's code, not off words that happen to appear in its prose.
  const t = stubbed('not-ready-lookalike', {
    HERDR_STUB_FAIL: 'agent start',
    HERDR_STUB_ERRCODE: 'pane_busy',
    HERDR_STUB_ERR: 'pane w9:p3 is not ready',
  })
  const [bad] = await quiet(() => launchStage({
    paneId: 'w9:p3', label: 'spec', sessionId: 'sid', argv: [], promptPath: 'p.txt', settleMs: 0,
  }))
  assert.equal(bad, null, 'a real failure was let through because its wording resembled another code')
  assert.equal(said(t.log, 'agent', 'prompt').length, 0)
})

// --- pane-mode stage execution ----------------------------------------------

/**
 * A repo with a cockpit already built, a seeded transcript for `session` (the id
 * an interrupted stage is recorded under), a stub that writes a transcript for
 * whatever id a FRESH boot is handed - the way a real claude does - and a CLAUDE
 * that does not exist, so any headless fallback dies loudly instead of quietly
 * booting the developer's real claude.
 */
function paneRepo(name, session, extra = {}) {
  const projects = tmp(name + '-projects')
  const s = stubbedRepo(name, { HERDR_STUB_TRANSCRIPT: join(projects, 'proj-pane'), ...extra })
  seedTranscript(projects, 'proj-pane', session, ['req-1', 'req-2'], 2)
  s.env.CLAUDE_PROJECTS_DIR = projects
  s.env.CONDUCT_CLAUDE_BIN = join(s.root, 'no-such-claude')
  s.env.HERDR_STUB_SNAPSHOT = join(s.root, 'docs', 'runs', 'demo', 'run.json')
  paned(s, 'start', 'demo', 'an ask')
  return s
}

const paned = (s, ...args) =>
  execFileSync(process.execPath, [CONDUCT, ...args],
    { cwd: s.root, encoding: 'utf8', env: s.env, stdio: 'pipe' })

const runJson = (s) =>
  JSON.parse(readFileSync(join(s.root, 'docs', 'runs', 'demo', 'run.json'), 'utf8'))

/** The session id a stage was actually booted with, read off herdr's own argv. */
const bootId = (log, label) => {
  const a = said(log, 'agent', 'start').find((c) => c[2] === label) || []
  return a[a.indexOf('--session-id') + 1]
}

test('a stale agent_session from a reused pane never displaces the id the stage booted with', () => {
  // Live, herdr 0.8.2, right after `spec` hit its decision gate:
  //   herdr agent list -> spec | pane w5:p3 | session 604dafed...
  //   run.json         -> spec.session = ad806d75...
  // 604dafed was an EARLIER agent, killed in that pane; the pane was then reused
  // and the boot really ran as ad806d75 - its transcript is on disk and metered
  // (100,306 ctx / 4,732 out / 3 calls). herdr's agent_session is metadata that
  // outlived the agent it described. The boot id is causal: it is what claude
  // was launched with, and what --resume, `answer` and metering all address.
  // So the boot id stands - and the disagreement is SAID rather than silently
  // resolved, because prompting or resuming a dead id is exactly the class of
  // silent wrongness this pipeline keeps getting bitten by.
  const s = paneRepo('stale-session', 'sess-stale', { HERDR_STUB_SESSION: 'dead-agent-uuid' })

  const out = paned(s, 'run', 'spec')

  const booted = bootId(s.log, 'spec')
  assert.match(booted, /^[0-9a-f-]{36}$/, 'the stage booted without an id of its own: ' + booted)
  const st = runJson(s).stages.spec
  assert.equal(st.session, booted,
    'run.json took herdr stale id - `answer` and `--resume` would then talk to a dead session')
  assert.equal(st.herdrSession, 'dead-agent-uuid',
    'the disagreement was not recorded anywhere that outlives the scrollback')
  assert.match(out, /dead-agent-uuid/, 'a session mismatch was resolved silently')
  assert.ok(out.includes(booted), 'the mismatch report never names the id actually in use')
  // The id it kept is the one a transcript exists under, so metering still lands.
  assert.equal(st.source, 'transcript')
  assert.equal(st.turns, 2)
})

test('a pane stage runs start -> prompt -> watch -> finalize, and leaves the pane open', () => {
  // `unknown` is herdr saying it does not know, not herdr saying "finished" -
  // treating it as settled would finalize a stage that is still working.
  const s = paneRepo('pane-stage', 'sess-pane-1', { HERDR_STUB_STATES: 'working;unknown;idle' })

  const out = paned(s, 'run', 'spec')

  const seq = calls(s.log).map((a) => a.slice(0, 2).join(' '))
  assert.deepEqual(seq.slice(seq.indexOf('agent start')),
    ['agent start', 'agent get', 'agent prompt',
      'agent wait', 'agent wait', 'agent wait', 'agent prompt'],
    'the stage lifecycle is start -> prompt -> watch -> /exit: ' + seq.join(' | '))

  // Completion comes from herdr settling, asked for in bounded slices.
  for (const w of said(s.log, 'agent', 'wait'))
    assert.ok(w.includes('--timeout'), 'an unbounded wait cannot notice a dead server: ' + w.join(' '))

  const st = runJson(s).stages.spec
  assert.equal(st.status, 'done')
  assert.equal(st.mode, 'pane')
  assert.equal(st.session, bootId(s.log, 'spec'))
  assert.equal(st.code, 0, 'code 0 is what conduct next scans for; a pane stage must set it')
  assert.match(String(st.pane), /^w9:p\d+$/)
  // Metered from the transcript by recorded id - 2 requestIds x (100 + 900).
  assert.equal(st.source, 'transcript')
  assert.equal(st.contextTokens, 2000)
  assert.equal(st.turns, 2)

  // run.json knows the session BEFORE the agent is prompted: a reboot one
  // second later must find a stage it can resume, not an invisible orphan.
  const atPrompt = JSON.parse(readFileSync(s.log + '.snap.agent-prompt', 'utf8')).stages.spec
  assert.equal(atPrompt.session, bootId(s.log, 'spec'))
  assert.equal(atPrompt.status, 'running')
  assert.equal(atPrompt.mode, 'pane')
  assert.ok('source' in atPrompt, 'a running stage still declares how it was metered')

  const typed = said(s.log, 'agent', 'prompt').map((a) => a[3])
  assert.equal(typed[1], '/exit', 'the claude must be freed; the PANE is what stays')
  for (const closer of ['close', 'kill', 'stop'])
    assert.equal(said(s.log, 'pane', closer).length, 0, 'the pane and its scrollback must survive')

  // The produced files ARE the stage's output channel - nothing is read back
  // out of the pane, so a missing artifact can only be noticed on disk.
  assert.match(out, /did not write docs\/runs\/demo\/01-spec\.md/)
  assert.equal(existsSync(s.log + '.readcalled'), false, 'a data path read a pane')
})

test('a settled stage with open DECISIONS holds warm, and answer costs no second boot', () => {
  const s = paneRepo('pane-hold', 'sess-hold', { HERDR_STUB_STATES: 'idle' })
  const decisions = join(s.root, 'docs', 'runs', 'demo', 'DECISIONS.md')
  writeFileSync(decisions, '1. Which way round?' + NL + '   Recommendation: this way.' + NL)

  const held = paned(s, 'run', 'spec')

  const st = runJson(s).stages.spec
  assert.equal(st.status, 'held')
  assert.equal(st.holdReason, 'decisions')
  assert.equal(st.code, undefined, 'a held stage is not done - conduct next must not skip it')
  assert.equal(runJson(s).gateStage, 'spec')
  assert.match(held, /HELD WARM/)
  assert.match(held, /DECISION GATE/, 'the questions themselves must still be put in front of the operator')

  // The agent is ALIVE: nothing exited it, and the operator was told where it is.
  assert.equal(said(s.log, 'agent', 'prompt').length, 1,
    'a held stage must not be /exited - the whole saving is that it stays warm')
  const note = said(s.log, 'notification', 'show')
  assert.equal(note.length, 1, 'a hold nobody is told about is a stall')
  assert.match(note[0].join(' '), /w9\b/, 'the notification must name the workspace to attach to')
  assert.match(note[0].join(' '), /spec/, 'the notification must name the agent to attach to')

  // The operator answers in the file, then nudges the agent that is still there.
  writeFileSync(decisions, '1. Which way round?' + NL + 'A: this way.' + NL)
  const answered = paned(s, 'answer')

  assert.equal(said(s.log, 'agent', 'start').length, 1,
    'the block-and-answer cycle re-booted a session - that ~30k is the cost this feature exists to avoid')
  const typed = said(s.log, 'agent', 'prompt').map((a) => a[3])
  assert.equal(typed.length, 3, 'answer -> one nudge, then /exit once it finishes: ' + typed.join(' | '))
  assert.match(typed[1], /DECISIONS\.md/)
  assert.ok(!typed[1].includes(NL), 'a newline in typed text submits it early')
  assert.equal(typed[2], '/exit')

  const after = runJson(s)
  assert.equal(after.stages.spec.session, bootId(s.log, 'spec'),
    'exactly one session id across the whole cycle')
  assert.equal(after.stages.spec.status, 'done')
  assert.equal(after.stages.spec.holdReason, undefined)
  assert.equal(after.gateStage, null)
  assert.match(answered, /same session/i)
})

test('a stage that stops with questions is HELD in the record, headless as much as in a pane', () => {
  // Live: `spec` stopped at its decision gate and run.json carried
  //   status: undefined   mode: undefined   holdReason: undefined
  // The plan pane still said DECISION GATE OPEN, but only because it reads
  // DECISIONS.md directly - the stage record itself said nothing, so `next`
  // could not tell a held stage from an unstarted one, durability could not
  // reattach it, and criterion 1 held only by that side-channel. A hold is ONE
  // concept with two triggers: herdr saw a blocked UI, or the stage left
  // questions open. The headless finaliser must write the same record the pane
  // one does; `mode` is what still says whether an agent is warm.
  const s = stubbedRepo('headless-hold')
  s.env.CONDUCT_CLAUDE_BIN = process.execPath
  paned(s, 'start', 'demo', 'an ask', '--no-panes')
  writeFileSync(join(s.root, 'docs', 'runs', 'demo', 'DECISIONS.md'),
    '1. Which way round?' + NL + '   Recommendation: this way.' + NL)

  const out = paned(s, 'run', 'spec', '--no-panes')

  const st = runJson(s).stages.spec
  assert.equal(st.status, 'held', 'the headless path bypassed the hold record entirely')
  assert.equal(st.holdReason, 'decisions')
  assert.equal(st.mode, 'headless', 'a hold must say whether there is a live agent to answer into')
  assert.equal(st.code, undefined, 'a stage waiting on the owner is not a finished stage')
  assert.equal(runJson(s).gateStage, 'spec')
  assert.match(out, /DECISION GATE/, 'the questions must still be put in front of the operator')

  // Criterion 1, without the DECISIONS.md side-channel: the pane the cockpit
  // re-runs every 5 seconds must show it as waiting, not as done or unstarted.
  const row = paned(s, 'plan').split(NL).find((l) => l.includes('spec')) || ''
  assert.match(row, /\[>\]/, 'a held stage rendered as finished or unstarted: ' + row)
  assert.match(row, /held/i)
})

test('a herdr-blocked stage holds warm too - nothing was written, and the agent lives', () => {
  // herdr recognised a permission or question UI. There is no DECISIONS.md and
  // no artifact; killing the agent here would re-boot it to ask the same thing.
  const s = paneRepo('pane-blocked', 'sess-blocked', { HERDR_STUB_STATES: 'working;blocked' })

  const out = paned(s, 'run', 'spec')

  const st = runJson(s).stages.spec
  assert.equal(st.status, 'held')
  assert.equal(st.holdReason, 'blocked-ui')
  assert.equal(st.code, undefined)
  assert.equal(runJson(s).gateStage, 'spec')
  assert.equal(said(s.log, 'notification', 'show').length, 1)
  assert.equal(said(s.log, 'agent', 'prompt').length, 1, 'a blocked agent must not be /exited')
  assert.match(out, /HELD WARM \(blocked-ui\)/)
  // The stage has not finished, so it has not failed to write anything yet.
  assert.ok(!out.includes('did not write'),
    'a produces warning against a stage still waiting on a human is simply wrong')
})

test('a stage blocked at LAUNCH holds warm - the conductor must never die on it', () => {
  // Live, herdr 0.8.2: the agent booted and herdr's sidebar showed it `blocked`
  // on a startup dialog. `agent start` had answered agent_not_ready and
  // `agent prompt` then refused with agent_blocked - which threw straight out of
  // launchStage, killed the conductor, and left a live agent orphaned in its
  // pane. A blocked agent is the exact case hold-warm exists for, and it was
  // failing in the one situation where a human IS there to clear it.
  const s = paneRepo('pane-blocked-launch', 'sess-blocked-launch')
  s.env.HERDR_STUB_BLOCKED = '1'

  const out = paned(s, 'run', 'spec')

  const st = runJson(s).stages.spec
  assert.equal(st.status, 'held', 'a launch block must hold, not crash:' + NL + out)
  assert.equal(st.holdReason, 'blocked-launch')
  assert.equal(st.code, undefined, 'a held stage is not done - conduct next must not skip it')
  assert.equal(st.session, bootId(s.log, 'spec'), 'a live agent must stay attributable')
  assert.equal(runJson(s).gateStage, 'spec')
  assert.match(out, /HELD WARM \(blocked-launch\)/)
  assert.match(out, /answer/i, 'the operator must be told to clear it, then run conduct answer')
  assert.equal(said(s.log, 'notification', 'show').length, 1, 'a hold nobody is told about is a stall')
  assert.equal(said(s.log, 'agent', 'start').length, 1, 'a live agent name must not be re-started')
  for (const closer of ['close', 'kill', 'stop'])
    assert.equal(said(s.log, 'pane', closer).length, 0, 'the pane must survive a blocked launch')

  // The owner clears the dialog in the pane. `conduct answer` then owes this
  // agent the line it never received - not a DECISIONS.md nudge it cannot use.
  s.env.HERDR_STUB_BLOCKED = ''
  paned(s, 'answer')

  const typed = said(s.log, 'agent', 'prompt').map((a) => a[3])
  assert.match(typed[1], /docs\/runs\/demo\/prompts\/spec\.txt/,
    'answer must hand over the prompt the blocked launch never delivered: ' + typed.join(' | '))
  assert.equal(typed[2], '/exit')
  const after = runJson(s)
  assert.equal(after.stages.spec.status, 'done')
  assert.equal(after.stages.spec.session, bootId(s.log, 'spec'),
    'exactly one session id across the whole cycle - a block must cost no second boot')
  assert.equal(after.gateStage, null)
})

test('the watch loop asks herdr repeatedly, bounded, and never sleeps or applies a ceiling', async () => {
  const s = stubbed('watch-loop', { HERDR_STUB_STATES: 'timeout;working;unknown;done' })

  const r = await watch('spec', { sliceMs: 1000 })

  assert.deepEqual(r, { state: 'settled', status: 'done' })
  assert.equal(said(s.log, 'agent', 'wait').length, 4,
    'an expired slice, `working` and `unknown` are all "ask again" - only a settled state ends it')
  for (const w of said(s.log, 'agent', 'wait'))
    assert.equal(w[w.indexOf('--timeout') + 1], '1000')

  const dead = stubbed('watch-lost', { HERDR_STUB_FAIL: 'agent wait', HERDR_STUB_ERRCODE: 'not_found' })
  assert.equal((await watch('spec')).state, 'lost', 'a herdr that cannot answer is an interruption')

  // No sleep, and no threshold: owner ruling is that no runaway number is
  // defensible and the pane in front of you is the guard. Reintroducing one
  // under any name - tokens, turns, dollars, wall clock - fails here.
  const body = readFileSync(resolve('scripts/pipeline/herd.mjs'), 'utf8')
    .split('export async function watch(')[1].split(NL + '}')[0]
  for (const banned of ['sleep', 'setTimeout', 'Date.now', 'budget', 'max', 'ceiling', 'limit'])
    assert.ok(!body.includes(banned), 'the watch loop grew a ' + banned)
  assert.equal(existsSync(dead.log + '.readcalled'), false)
})

test('a headless gate still answers headless, even with herdr up', () => {
  // Pane mode adds a cheaper path; it must not capture the fallback one. A
  // stage recorded without mode:'pane' has no live agent to nudge, so `answer`
  // must resume its session as a child process exactly as it always has.
  const s = paneRepo('headless-answer', 'sess-headless')
  const run = runJson(s)
  run.stages.spec = { code: 0, session: 'sess-headless', contextTokens: 1, turns: 1, source: 'transcript' }
  run.gateStage = 'spec'
  writeFileSync(join(s.root, 'docs', 'runs', 'demo', 'run.json'), JSON.stringify(run, null, 2))
  const before = calls(s.log).length

  let failed = null
  try { paned(s, 'answer') } catch (e) { failed = (e.stdout || '') + (e.stderr || '') }

  // CONDUCT_CLAUDE_BIN points at nothing, so a spawn of it is loud and provable.
  assert.ok(failed, 'the headless branch did not spawn a claude at all')
  assert.match(failed, /no-such-claude/, 'answer resumed something other than the claude binary')
  assert.equal(calls(s.log).length, before, 'a headless gate must not talk to herdr')
})

test('an answer is metered in both modes, and the two modes agree on what a stage cost', () => {
  // Criterion 29. The stage was already metered from its transcript when it
  // held; the answer then spends more API calls in the SAME session. Pane mode
  // re-summed in finalizePane, headless recorded nothing at all, and refreshRun
  // refused to re-read any stage already sourced 'transcript' - so the totals
  // froze at the pre-answer figures and the two modes disagreed about one
  // stage's cost. An instrument that under-reports after every interaction is
  // the failure this feature exists to prevent.
  const totals = {}
  for (const mode of ['pane', 'headless']) {
    const session = 'sess-answer-' + mode
    const s = paneRepo('answer-meter-' + mode, session, { HERDR_STUB_STATES: 'idle' })
    // A headless answer really spawns a claude, so it needs one that exists.
    if (mode === 'headless') s.env.CONDUCT_CLAUDE_BIN = process.execPath
    const dir = join(s.root, 'docs', 'runs', 'demo')
    const run = runJson(s)
    run.stages.spec = {
      session, status: 'held', holdReason: 'decisions', pane: 'w9:p3',
      ...(mode === 'pane' && { mode: 'pane' }),
      contextTokens: 2000, outputTokens: 20, turns: 2, source: 'transcript', seconds: 5,
    }
    run.gateStage = 'spec'
    writeFileSync(join(dir, 'run.json'), JSON.stringify(run, null, 2))
    // The answer spends three more API calls in the session that asked.
    seedTranscript(s.env.CLAUDE_PROJECTS_DIR, 'proj-pane', session,
      ['req-1', 'req-2', 'req-3', 'req-4', 'req-5'], 2)
    writeFileSync(join(dir, 'DECISIONS.md'), '1. Which way round?' + NL + 'A: this way.' + NL)

    paned(s, 'answer')

    const st = runJson(s).stages.spec
    assert.equal(st.turns, 5, mode + ' answer left the stage on its pre-answer call count')
    assert.equal(st.contextTokens, 5000, mode + ' answer left the stage on its pre-answer context')
    assert.equal(st.outputTokens, 50)
    assert.equal(st.source, 'transcript')
    assert.match(paned(s, 'report'), /5k/, mode + ' report still prints the pre-answer total')
    totals[mode] = { ctx: st.contextTokens, out: st.outputTokens, turns: st.turns }
  }
  assert.deepEqual(totals.pane, totals.headless,
    'the two modes disagree about what the same stage cost: ' + JSON.stringify(totals))
})

test('a role gets ONE pane, reused - a run must not end with a dozen idle shells', () => {
  const s = paneRepo('pane-reuse', 'sess-reuse')

  paned(s, 'run', 'spec')
  const afterFirst = said(s.log, 'pane', 'split').length
  paned(s, 'run', 'spec')

  assert.equal(afterFirst, 2, 'cockpit diff pane + one pane for the product-manager role')
  assert.equal(said(s.log, 'pane', 'split').length, afterFirst,
    'the role pane was back at a shell after /exit and must be reused, not re-split')
  assert.equal(said(s.log, 'agent', 'start').length, 2,
    'reuse is the PANE, never the agent: each stage boots its own claude and its own session')
})

// --- the review fan-out ------------------------------------------------------

/**
 * A run parked at the review stage with all four reviewers able to really
 * start: the herdr stub for the two pane agents, a real node for the headless
 * security child (it rejects --output-format, which is exactly the proof that
 * the headless argv reached it), and a fake codex companion that appends to the
 * SAME log as herdr - so one ordered timeline covers the whole fan-out.
 */
function reviewRepo(name, extra = {}, codexExit = 0) {
  const s = paneRepo(name, 'sess-review', extra)
  writeFileSync(join(s.root, 'docs', 'runs', 'demo', '04-build.md'), '# build' + NL)
  const cx = join(s.root, '.claude', 'plugins', 'cache', 'openai-codex', 'codex', '1.0.6', 'scripts')
  mkdirSync(cx, { recursive: true })
  writeFileSync(join(cx, 'codex-companion.mjs'), [
    'import { appendFileSync } from "node:fs"',
    'appendFileSync(process.env.HERDR_STUB_LOG,',
    '  JSON.stringify({ argv: ["codex", ...process.argv.slice(2)] }) + String.fromCharCode(10))',
    'console.log("codex reviewed the diff")',
    'process.exit(' + codexExit + ')',
  ].join(NL) + NL)
  s.env.USERPROFILE = s.root
  s.env.HOME = s.root
  s.env.CONDUCT_CLAUDE_BIN = process.execPath
  return s
}

/** The conductor announces every stage it starts, and every one it finishes. */
const startLine = (out, label) => out.split(NL).findIndex((l) => l.trim() === '> ' + label)
const firstFinish = (out) =>
  out.split(NL).findIndex((l) => /^\s+(ok \S|== HELD WARM)/.test(l))

test('the review fan-out starts all four reviewers before it consumes any completion', () => {
  const s = reviewRepo('review-fanout')

  const out = paned(s, 'run', 'review')

  // Two pane agents, and only two. /security-review is compiled into the CLI -
  // no file on disk, unreachable by the Skill tool - so nothing typed into a
  // pane fires it. That is a property of the tool, not a preference.
  assert.deepEqual(said(s.log, 'agent', 'start').map((a) => a[2]).sort(),
    ['review-conformance', 'review-ponytail'])
  const prompts = join(s.root, 'docs', 'runs', 'demo', 'prompts')
  assert.equal(existsSync(join(prompts, 'review-security.txt')), false,
    'security got a pane prompt file - it must stay a headless -p child')
  assert.match(readFileSync(join(prompts, 'review-ponytail.txt'), 'utf8'), /ponytail-review/)

  // A fan-out that starts reviewer 2 only once reviewer 1 has finished is
  // sequential wearing a costume. The order is what is asserted, not the count.
  const done = firstFinish(out)
  assert.ok(done > 0, 'no reviewer ever finished: ' + out)
  for (const id of ['conformance', 'ponytail', 'security', 'codex']) {
    const at = startLine(out, 'review-' + id)
    assert.ok(at >= 0, 'review-' + id + ' never started: ' + out)
    assert.ok(at < done, 'review-' + id + ' started only after another reviewer finished')
  }
  // The same ordering in herdr's own timeline, which the codex child joins.
  const seq = calls(s.log)
  const idx = (f) => seq.findIndex(f)
  const exited = idx((a) => a[1] === 'prompt' && a[3] === '/exit')
  assert.ok(exited > 0, 'no pane reviewer was ever freed')
  for (const label of ['review-conformance', 'review-ponytail'])
    assert.ok(idx((a) => a[1] === 'start' && a[2] === label) < exited,
      label + ' was started only after another reviewer was finished with')
  assert.ok(idx((a) => a[0] === 'codex') < exited, 'codex was started after a reviewer finished')

  const st = runJson(s).stages
  assert.equal(st['review-conformance'].mode, 'pane')
  assert.equal(st['review-conformance'].status, 'done')
  assert.equal(st['review-ponytail'].mode, 'pane')
  assert.equal(st['review-ponytail'].status, 'done')
  assert.equal(st['review-security'].mode, undefined, 'security must stay a headless child')
  assert.ok('code' in st['review-security'], 'security was never actually run')
  // codex is another vendor's model: measured zero Claude tokens, unchanged.
  assert.equal(st['review-codex'].source, 'codex')
  assert.equal(st['review-codex'].code, 0)
  assert.equal(existsSync(s.log + '.readcalled'), false, 'a data path read a pane')
})

test('one reviewer holding does not stall the other three', () => {
  // The first agent to settle reports a permission/question UI and is held
  // warm; the second settles clean. Codex, meanwhile, fails its own
  // infrastructure - which is NOT a clean review and must not read as one.
  const s = reviewRepo('review-hold', { HERDR_STUB_STATES: 'blocked;idle' }, 3)

  const out = paned(s, 'run', 'review')

  const st = runJson(s).stages
  const pane = ['review-conformance', 'review-ponytail'].map((id) => st[id])
  assert.equal(pane.filter((r) => r.status === 'held').length, 1,
    'exactly one pane reviewer should have been held: ' + JSON.stringify(pane))
  const held = pane.find((r) => r.status === 'held')
  assert.equal(held.holdReason, 'blocked-ui')
  assert.equal(held.code, undefined, 'a held reviewer is not a finished one')

  // The other three ran to completion regardless. That is the whole claim.
  assert.equal(pane.find((r) => r.status !== 'held').status, 'done')
  assert.ok('code' in st['review-security'], 'the headless security child never finished')
  assert.equal(st['review-codex'].code, 3)

  // The held agent is still alive: only the settled one was freed.
  assert.equal(said(s.log, 'agent', 'prompt').map((a) => a[3]).filter((l) => l === '/exit').length, 1,
    'a held reviewer must not be /exited - the whole saving is that it stays warm')
  assert.match(out, /HELD WARM \(blocked-ui\)/)

  // An infrastructure failure is not a review. Saying otherwise is the one
  // thing this gate must never do.
  assert.match(out, /UNREVIEWED|NOT[\s\S]{0,40}a clean review/)
})

test('every reviewer is still recorded when another process is holding run.json', () => {
  // The fan-out's four completions all write run.json, and they land whenever
  // their reviewer happens to finish. Measured on Windows: a reader holding the
  // file open makes that write throw EBUSY - `copyFileSync` shares reads but
  // not writes, and the herdr stub snapshots run.json with exactly that call,
  // which is how `npm test` at 12-way concurrency kills the fan-out mid-flight.
  // The reviewers that had not saved yet then have no stage record at all, and
  // a stage record IS this feature's token metering: the instrument loses its
  // own readings in the one code path meant to show it off.
  //
  // What is asserted is the four records, not the absence of an exception. A
  // fix that merely swallowed the error would still leave rows missing.
  const s = reviewRepo('review-contention', {}, 3)
  const runPath = join(s.root, 'docs', 'runs', 'demo', 'run.json')
  const holder = spawn(process.execPath, ['-e',
    'const{copyFileSync}=require("fs");const t=Date.now();' +
    'while(Date.now()-t<20000){try{copyFileSync(process.argv[1],process.argv[1]+".held")}catch{}}',
    runPath], { stdio: 'ignore' })

  // A crashed conductor is one way to lose the records, not the claim itself.
  try { paned(s, 'run', 'review') } catch { /* assert on what survived */ }
  finally { holder.kill() }

  const st = runJson(s).stages
  for (const id of ['conformance', 'ponytail', 'security', 'codex'])
    assert.ok(st['review-' + id],
      'review-' + id + ' ran but has no stage record: ' + JSON.stringify(st))
  assert.equal(st['review-codex'].code, 3)
  assert.equal(existsSync(s.log + '.readcalled'), false, 'a data path read a pane')
})

test('build tasks run strictly sequentially, and a concurrent one fails here', () => {
  // Parallel build tasks were REJECTED on token cost: a task started beside
  // its predecessor loses the accumulated 04-build.md handoff and re-discovers
  // what the earlier one had already established - the exact re-read cost this
  // pipeline exists to remove. The rejection is enforced here, not remembered.
  const s = paneRepo('build-serial', 'sess-build', { HERDR_STUB_STATES: 'idle' })
  const dir = join(s.root, 'docs', 'runs', 'demo')
  writeFileSync(join(dir, '02-tasks.json'), JSON.stringify([
    { id: 't1', title: 'first', done_when: 'done', files: ['a.js'], tests: ['a.test.mjs'] },
    { id: 't2', title: 'second', done_when: 'done', files: ['b.js'], tests: ['b.test.mjs'], after: ['t1'] },
  ]))

  paned(s, 'run', 'build')

  const seq = calls(s.log)
  const at = (f) => seq.findIndex(f)
  const freed = (id) => at((a) => a[1] === 'prompt' && a[2] === 'build-' + id && a[3] === '/exit')
  const begun = (id) => at((a) => a[1] === 'start' && a[2] === 'build-' + id)
  assert.ok(begun('t1') >= 0 && freed('t1') > begun('t1'), 't1 never ran to completion in its pane')
  assert.ok(begun('t2') > freed('t1'),
    't2 started before t1 was finished with - build tasks were made concurrent')
  assert.deepEqual(runJson(s).tasksDone, ['t1', 't2'])

  // Headless is the same loop. Its serialism is structural: no combinator can
  // be introduced without one of these appearing in the function.
  const body = readFileSync(resolve('scripts/pipeline/conduct.mjs'), 'utf8')
    .split('async function runBuild(')[1].split(NL + '}')[0]
  for (const banned of ['Promise.all', 'Promise.allSettled', 'Promise.race', 'Promise.any'])
    assert.ok(!body.includes(banned), 'runBuild grew a ' + banned + ' - build tasks are sequential')
})

// --- durability: reattach, restore, re-run -----------------------------------
//
// A machine restart destroyed a 44-minute run and every token it had spent.
// That 100% waste is the cost argument for this whole feature, so these are the
// tests that matter most: an interrupted stage is picked up rather than
// silently begun again, and whatever it already burned is still counted.

/** Park a stage in run.json exactly as an interruption would leave it. */
function interrupted(s, label, stage) {
  const p = join(s.root, 'docs', 'runs', 'demo', 'run.json')
  const run = JSON.parse(readFileSync(p, 'utf8'))
  // A stage that reached `running` always left its prompt on disk first.
  writePrompt(s.root, 'demo', label, 'Do the ' + label + ' stage.' + NL)
  run.stages[label] = {
    status: 'running', mode: 'pane', pane: 'w9:p3', source: 'none',
    startedAt: new Date(Date.now() - 60000).toISOString(), ...stage,
  }
  writeFileSync(p, JSON.stringify(run, null, 2))
  return run
}

test('conduct next reattaches to a stage still in progress - same session, no second boot', () => {
  const s = paneRepo('durable-reattach', 'sess-live')
  interrupted(s, 'spec', { session: 'sess-live' })

  const out = paned(s, 'next')

  assert.equal(said(s.log, 'agent', 'start').length, 0,
    'a live agent was relaunched under its own name - that is the ~30k boot this avoids')
  assert.ok(said(s.log, 'agent', 'get').length >= 1,
    'nothing asked herdr whether the agent was still there')
  assert.match(out, /still in progress/i, 'the operator was not told the stage was picked up')

  const st = runJson(s).stages.spec
  assert.equal(st.session, 'sess-live', 'the session id changed across a reattach')
  assert.equal(st.status, 'done')
  assert.equal(st.code, 0)
  assert.equal(st.contextTokens, 2000, 'the reattached stage was metered from its own transcript')

  const typed = said(s.log, 'agent', 'prompt').map((a) => a[3])
  assert.deepEqual(typed, ['/exit'], 'a reattached agent must not be re-prompted: ' + typed.join(' | '))
})

test('a stage whose agent is gone is relaunched with --resume, on the SAME session', () => {
  // The pane and its agent died with the machine, but the session herdr booted
  // is on disk and `claude --resume <id>` restores it. Everything that session
  // already did - and already paid for - still stands.
  const s = paneRepo('durable-restore', 'sess-gone', { HERDR_STUB_NOAGENT: '1' })
  interrupted(s, 'spec', { session: 'sess-gone' })

  const out = paned(s, 'next')

  const start = said(s.log, 'agent', 'start')
  assert.equal(start.length, 1, 'the stage was not relaunched exactly once: ' + start.length)
  const native = start[0].slice(start[0].indexOf('--') + 1)
  assert.equal(native[0], '--resume', 'the relaunch did not resume: ' + native.join(' '))
  assert.equal(native[1], 'sess-gone')
  assert.ok(!native.includes('--session-id'),
    'a resume must not also claim a fresh session id - one of them would be a lie')
  assert.equal(native[native.indexOf('--autocompact') + 1], '120000',
    'the restored boot dropped lever 1')

  assert.equal(runJson(s).stages.spec.session, 'sess-gone', 'the session id changed across a restore')
  assert.equal(runJson(s).stages.spec.previousSessions, undefined,
    'nothing was lost, so nothing belongs in previousSessions')
  assert.match(out, /interrupted|resum/i, 'the operator was not told the stage was restored')

  const typed = said(s.log, 'agent', 'prompt').map((a) => a[3])
  assert.match(typed[0], /docs\/runs\/demo\/prompts\/spec\.txt/,
    'a restored agent must be pointed back at its prompt file, not re-fed the prompt')
  assert.ok(!typed[0].includes(NL), 'a newline in typed text submits it early')
})

test('an unrecoverable session is said out loud, kept in previousSessions, and re-run from scratch', () => {
  // Nothing was ever flushed for this id, so `claude --resume` has nothing to
  // restore. Starting over SILENTLY is the failure mode: it looks identical to
  // a normal run, which is exactly how a destroyed 44 minutes hides.
  const s = paneRepo('durable-lost', 'sess-new', { HERDR_STUB_NOAGENT: '1' })
  interrupted(s, 'spec', { session: 'sess-vanished' })

  const out = paned(s, 'next')

  assert.match(out, /cannot be resumed|unrecoverable/i,
    'the operator was not told the session could not be recovered')
  assert.match(out, /from the start|from scratch/i,
    'the operator was not told the stage is starting over')

  const start = said(s.log, 'agent', 'start')
  assert.equal(start.length, 1, 'the stage was not re-run exactly once')
  const native = start[0].slice(start[0].indexOf('--') + 1)
  assert.equal(native[0], '--session-id',
    'a session with nothing on disk cannot be --resumed: ' + native.join(' '))
  assert.ok(!native.includes('--resume'))

  const st = runJson(s).stages.spec
  assert.deepEqual(st.previousSessions, ['sess-vanished'],
    'the dead session was dropped, and everything it spent dropped with it')
  assert.equal(st.session, bootId(s.log, 'spec'), 'the re-run is a new session, recorded as such')
})

test('a restored stage totals the sessions the interruption killed as well as its own', () => {
  // Tokens a dead session burned still happened. Counting only the surviving
  // session makes a run that crashed look cheaper than one that did not, which
  // is the instrument lying - the one failure this project has already hit twice.
  const s = paneRepo('durable-sum', 'sess-gone2', { HERDR_STUB_NOAGENT: '1' })
  seedTranscript(s.env.CLAUDE_PROJECTS_DIR, 'proj-pane', 'sess-earlier', ['e1', 'e2', 'e3'], 2)
  interrupted(s, 'spec', { session: 'sess-gone2', previousSessions: ['sess-earlier'] })

  paned(s, 'next')

  const st = runJson(s).stages.spec
  assert.equal(st.status, 'done')
  assert.deepEqual(st.previousSessions, ['sess-earlier'],
    'the record of what was already spent must survive the relaunch')
  assert.equal(st.turns, 5, 'API calls before the interruption were dropped')
  assert.equal(st.contextTokens, 5000, 'context spent before the interruption was dropped')
  assert.equal(st.outputTokens, 50)
})

test('report heals an interrupted stage to the sum of every session it burned', () => {
  const projects = tmp('sum-report')
  seedTranscript(projects, 'p', 'sess-a', ['a1', 'a2', 'a3'], 2)
  seedTranscript(projects, 'p', 'sess-b', ['b1', 'b2'], 2)
  const { root, runJson: saved } = seedRun('sum-report-run', {
    spec: {
      code: 0, session: 'sess-b', previousSessions: ['sess-a'],
      contextTokens: 0, outputTokens: 0, turns: 0, source: 'none', seconds: 12,
    },
  })

  const out = conduct(root, projects, 'report')

  assert.match(out, /5k/, 'the healed row shows only the surviving session')
  const st = JSON.parse(readFileSync(saved, 'utf8')).stages.spec
  assert.equal(st.contextTokens, 5000)
  assert.equal(st.outputTokens, 50)
  assert.equal(st.turns, 5)
})

test('a tester session in the verify worktree is metered by its recorded id, wherever its transcript landed', () => {
  // Claude Code names its project directory after the cwd, so the verify
  // stage - which runs in an isolated worktree - writes its transcript under a
  // DIFFERENT project folder than every other stage of the same run. Metering
  // is addressed by session id, so where the file landed cannot lose the spend,
  // and an interruption in the worktree is accounted for like any other.
  const projects = tmp('worktree')
  seedTranscript(projects, 'E--Projects-demo-verify', 'sess-wt', ['w1', 'w2', 'w3'], 2)
  seedTranscript(projects, 'E--Projects-demo-verify', 'sess-wt-dead', ['d1'], 2)
  const { root, runJson: saved } = seedRun('worktree-run', {
    verify: {
      code: 0, session: 'sess-wt', previousSessions: ['sess-wt-dead'],
      contextTokens: 0, outputTokens: 0, turns: 0, source: 'none', seconds: 30,
    },
  })

  const out = conduct(root, projects, 'report')

  const st = JSON.parse(readFileSync(saved, 'utf8')).stages.verify
  assert.equal(st.turns, 4, 'the tester worktree session was not found by its recorded id')
  assert.equal(st.contextTokens, 4000)
  assert.equal(st.outputTokens, 40)
  assert.ok(!out.includes('unknown'),
    'a verify stage metered "unknown" is a whole stage of spend lost to a cwd')
})

test('a resumed build task is marked done, so the build does not start it over', () => {
  // `next` now picks up `build-<id>` labels too. runBuild is what normally
  // records a finished task, so a task finished by a resume has to be recorded
  // where runBuild would have - or the next `conduct run build` re-runs work
  // that is already on disk, which is the waste this whole task exists to stop.
  const s = paneRepo('durable-build', 'sess-bt1')
  writeFileSync(join(s.root, 'docs', 'runs', 'demo', '02-tasks.json'), JSON.stringify([
    { id: 't1', title: 'first', done_when: 'done', files: ['a.js'], tests: ['a.test.mjs'] },
    { id: 't2', title: 'second', done_when: 'done', files: ['b.js'], tests: ['b.test.mjs'], after: ['t1'] },
  ]))
  interrupted(s, 'build-t1', { session: 'sess-bt1' })

  paned(s, 'next')

  assert.equal(said(s.log, 'agent', 'start').length, 0, 'a live build agent was re-booted')
  assert.equal(runJson(s).stages['build-t1'].code, 0)
  assert.deepEqual(runJson(s).tasksDone, ['t1'],
    'the resumed task was not recorded as done - the build will run it again')
})

test('answer resolves a held build-<task> label, and records the task it finishes', () => {
  // run.json keys are stage ids, `build-<task>` and `review-<reviewer>`, so
  // STAGES.find could only ever resolve the first kind - and `answer` crashed on
  // the other two (spec.gate / spec.compact on undefined). The quiet half is
  // worse: the task finishes on disk while tasksDone stays empty, so the next
  // `conduct run build` pays a whole developer session to redo it.
  const s = paneRepo('answer-build-task', 'sess-bt', { HERDR_STUB_STATES: 'idle' })
  const dir = join(s.root, 'docs', 'runs', 'demo')
  writeFileSync(join(dir, '02-tasks.json'), JSON.stringify([
    { id: 't1', title: 'first', done_when: 'done', files: ['a.js'], tests: ['a.test.mjs'] },
    { id: 't2', title: 'second', done_when: 'done', files: ['b.js'], tests: ['b.test.mjs'], after: ['t1'] },
  ]))
  writeFileSync(join(dir, 'DECISIONS.md'), '1. Which way round?' + NL + '   Recommendation: this way.' + NL)

  paned(s, 'run', 'build')

  assert.equal(runJson(s).stages['build-t1'].status, 'held')
  assert.equal(runJson(s).gateStage, 'build-t1',
    'the gate belongs to the agent that is actually held warm, not to the stage that ran it')

  writeFileSync(join(dir, 'DECISIONS.md'), '1. Which way round?' + NL + 'A: this way.' + NL)
  paned(s, 'answer')

  const st = runJson(s).stages['build-t1']
  assert.equal(st.status, 'done')
  assert.equal(st.code, 0)
  assert.deepEqual(runJson(s).tasksDone, ['t1'],
    'the task finished on disk but was never recorded - conduct run build will redo it')
  assert.equal(said(s.log, 'agent', 'start').length, 1,
    'the answer re-booted a session that was already warm')
})

test('answer resolves a held review-<id> label too - the other half of the same crash', () => {
  // The build-task test above cannot catch a `stageSpec` regression: `finished`
  // returns before `afterStage` for a `build-*` label, so `spec` is never
  // dereferenced on that path. A held REVIEWER goes straight through
  // afterStage, where `STAGES.find` would hand it undefined and it dies on
  // `spec.gate`. Criterion 7 covers both labels; so must the guard.
  const s = reviewRepo('answer-held-reviewer', { HERDR_STUB_STATES: 'blocked;idle' })

  paned(s, 'run', 'review')

  const held = runJson(s).gateStage
  assert.match(held || '', /^review-/,
    'no reviewer was held warm: ' + JSON.stringify(runJson(s).stages))

  let out = ''
  try { out = paned(s, 'answer') } catch (e) { out = (e.stdout || '') + (e.stderr || '') }

  assert.ok(!/TypeError/.test(out), 'answer crashed on a reviewer label:' + NL + out)
  const r = runJson(s)
  assert.equal(r.stages[held].status, 'done', held + ' was answered but never finished: ' + out)
  assert.equal(r.gateStage, null, 'the gate was never cleared')
})

// --- the Probity shim (design 9.5) -----------------------------------------
//
// The shim is the TDD gate's entry point, so these run it as a child process
// against a STUB @nizos/probity: a bin.js that records the bytes it was handed.
// Nothing here touches the real probity or the real hook payloads.

const SHIM = resolve('.claude/hooks/probity-subagent-shim.mjs')

/** A temp root whose node_modules/@nizos/probity records its stdin verbatim. */
function stubProbity(name) {
  const root = tmp(name)
  const pkg = join(root, 'node_modules', '@nizos', 'probity')
  mkdirSync(join(pkg, 'dist'), { recursive: true })
  const saw = join(root, 'saw.txt')
  writeFileSync(join(pkg, 'dist', 'bin.js'), [
    "import fs from 'node:fs'",
    "let raw = ''",
    "try { raw = fs.readFileSync(0, 'utf8') } catch {}",
    'fs.writeFileSync(' + JSON.stringify(saw) + ', raw)',
    "process.stdout.write('STUB-PROBITY-RAN' + String.fromCharCode(10))",
  ].join(NL) + NL)
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@nizos/probity', type: 'module' }))
  return { root, saw }
}

/** Run the shim with `raw` on stdin. Returns its stdout. */
function shim(raw, { cwd, projectDir } = {}) {
  const env = { ...process.env }
  delete env.CLAUDE_PROJECT_DIR
  if (projectDir) env.CLAUDE_PROJECT_DIR = projectDir
  return execFileSync(process.execPath, [SHIM], { cwd, input: raw, encoding: 'utf8', env })
}

test('the shim forwards a payload with no agent_id byte-identical', () => {
  // Every pane-pipeline stage is a top-level session, so no hook payload
  // carries agent_id any more. The shim must be a pass-through: re-serialising
  // the payload would hand Probity bytes the harness never wrote.
  const { root, saw } = stubProbity('shim-passthrough')
  // Deliberately not what JSON.stringify would emit: the double space and the
  // member order are the discriminator.
  const raw = '{"session_id":"s-1",  "transcript_path":"t.jsonl","tool_name":"Write","cwd":'
    + JSON.stringify(root) + '}'

  const out = shim(raw, { cwd: root })

  assert.match(out, /STUB-PROBITY-RAN/, 'the shim never reached the local probity bin')
  assert.equal(readFileSync(saw, 'utf8'), raw, 'the payload was rewritten on its way to Probity')
})

test('the shim denies when no candidate root has a local probity', () => {
  // Fail closed, like Probity itself: no gate means no write, never a silent
  // skip. A gate that fails open is not a gate.
  const bare = tmp('shim-nogate')

  const out = shim(JSON.stringify({ tool_name: 'Write', cwd: bare }), { cwd: bare })

  const d = JSON.parse(out).hookSpecificOutput
  assert.equal(d.hookEventName, 'PreToolUse')
  assert.equal(d.permissionDecision, 'deny')
  assert.match(d.permissionDecisionReason, /@nizos\/probity is not installed/)
})

test('the shim still resolves the bin when payload.cwd is an unresolvable POSIX path', () => {
  // After a `cd` inside a Bash call Claude Code reports cwd as "/e/Projects/x",
  // which path.join cannot resolve on Windows. Resolving from payload.cwd alone
  // denied EVERY Bash/Write/Edit for the rest of the session - including the
  // edits needed to repair it - and blamed a missing install while probity was
  // present throughout. CLAUDE_PROJECT_DIR and process.cwd() are the fallbacks.
  const { root, saw } = stubProbity('shim-posix-cwd')
  const raw = JSON.stringify({ tool_name: 'Edit', cwd: '/e/Projects/amj-website-design' })

  const out = shim(raw, { cwd: tmp('shim-elsewhere'), projectDir: root })

  assert.doesNotMatch(out, /permissionDecision/,
    'a POSIX cwd denied the write again - the multi-candidate resolution regressed')
  assert.match(out, /STUB-PROBITY-RAN/)
  assert.equal(readFileSync(saw, 'utf8'), raw)
})

test('the shim carries no subagent transcript rewrite, and still invokes the bin directly', () => {
  // Job 1 (the agent_id transcript rewrite) existed only because v1 ran the
  // developer as a subagent; under pane mode every stage is a top-level session
  // and agent_id never appears. Job 2 (direct `node .../dist/bin.js` instead of
  // the plugin's per-tool-call npx) is an improvement and stays - see
  // docs/adr/0013-probity-direct-shim-not-plugin.md.
  const src = readFileSync(SHIM, 'utf8')

  assert.doesNotMatch(src, /agent_id/, 'the subagent branch is dead code under pane mode')
  assert.doesNotMatch(src, /findSubagentTranscript/)
  assert.match(src, /node_modules[\s\S]{0,80}bin\.js/, 'direct bin invocation is not a workaround')
  assert.doesNotMatch(src, /npx @/, 'a shell-spawned npx is needless attack surface')
  for (const c of ['payload?.cwd', 'CLAUDE_PROJECT_DIR', 'process.cwd()']) {
    assert.ok(src.includes(c), 'root candidate dropped: ' + c)
  }
})

// --- proportionality ---------------------------------------------------------
//
// Measured on the feature that built this pipeline: build 1.41M, fix rounds
// 0.92M (27%), testing 0.48M (14%). The ceremony, not the work, was the cost.

test('a fix-tier run collapses to build + verify - no ux, polish, review or accept', () => {
  const s = stubbedRepo('tier-fix')
  s.env.CONDUCT_CLAUDE_BIN = join(s.root, 'no-such-claude')
  const start = (...a) => execFileSync(process.execPath, [CONDUCT, ...a],
    { cwd: s.root, encoding: 'utf8', env: s.env })
  start('start', 'demo', 'a bounded fix', '--tier', 'fix', '--no-panes')

  const rj = join(s.root, 'docs', 'runs', 'demo', 'run.json')
  const run = JSON.parse(readFileSync(rj, 'utf8'))
  assert.equal(run.tier, 'fix', 'the tier was not recorded in run.json')

  const listed = start('plan').split(NL)
    .map((l) => (l.match(/^\s+\[[ x>]\] (\S+)/) || [])[1]).filter(Boolean)
  assert.deepEqual(listed, ['build', 'verify'],
    'the fix tier still plans the full ceremony: ' + listed.join(' '))

  // Even with UI on, and with the two tier stages already green, `next` must
  // find nothing left - not walk into ux, polish, review or accept.
  run.ui = true
  run.stages = { build: { code: 0 }, verify: { code: 0 } }
  writeFileSync(rj, JSON.stringify(run, null, 2))
  assert.match(start('next', '--no-panes'), /all stages complete/,
    'a fix-tier run ran a stage that is not in its tier')
})

test('a direct-tier start refuses, and creates nothing at all', () => {
  const s = stubbedRepo('tier-direct')
  const before = readdirSync(s.root).sort()

  const r = startFails(s, 'demo', 'fix a typo in a comment', '--tier', 'direct')

  assert.ok(r, 'a direct-tier change was given a run directory and a pipeline')
  assert.notEqual(r.status, 0)
  assert.match(r.out, /direct/, 'the refusal must say which tier it refused')
  assert.deepEqual(readdirSync(s.root).sort(), before, 'a refused start left something behind')
  assert.equal(existsSync(join(s.root, 'docs')), false, 'a refused start created docs/')
  assert.equal(existsSync(s.log), false, 'a refused start still went to herdr')
})
