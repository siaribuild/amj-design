#!/usr/bin/env node
// Builds the A/B comparison from both arms' measurements. Reports what actually
// happened, including an arm that did not finish - "v1 could not complete inside
// the ceiling" is a result, not a missing data point, and must not be dressed up
// as a token ratio.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'docs', 'pipeline', 'ab-results')
const NL = String.fromCharCode(10)
const read = (f) => { try { return readFileSync(join(OUT, f), 'utf8').trim() } catch { return null } }

const fmt = (n) => n == null ? '—'
  : n >= 1e9 ? (n / 1e9).toFixed(2) + 'B'
  : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M'
  : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n)

function arm(name) {
  const m = read(name + '.measure.txt')
  const line = m && m.split(NL).find((l) => l.startsWith('JSON '))
  const data = line ? JSON.parse(line.slice(5)) : null
  const start = read(name + '.start'), end = read(name + '.end')
  const wall = start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 60000) : null
  let cost = null, completed = end != null
  const r = read(name + '.result.json')
  if (r) { try { cost = JSON.parse(r).total_cost_usd } catch {} }
  if (name === 'v2') {
    // v2's cost is the sum of its stage runs, recorded by the conductor.
    const rj = join('/e/Projects/ab-v2-gst', 'docs', 'runs', 'gst-calc', 'run.json')
    try {
      const run = JSON.parse(readFileSync(rj, 'utf8'))
      cost = Object.values(run.stages).reduce((a, s) => a + (s.cost || 0), 0)
    } catch {}
  }
  return { name, data, wall, cost, completed, incomplete: existsSync(join(OUT, name + '.incomplete')) }
}

function artifacts(dir, sub) {
  try { return readdirSync(join(dir, sub)).filter((f) => !f.startsWith('.')).sort() } catch { return [] }
}

const a = arm('v1'), b = arm('v2')
const out = []
const p = (s = '') => out.push(s)

p('# A/B: pipeline v1 vs v2 — the same feature, built twice')
p()
p('Feature: a GST quick-calculator page for the customer site.')
p('Ask (identical for both arms): `docs/pipeline/ab-results/ASK.txt`')
p()
p('Both arms: same base app code, own git worktree, own node_modules, grill')
p('skipped, no human at the gates, same $30 runaway ceiling.')
p()
p('## Headline')
p()
p('| | v1 (orchestrated) | v2 (conducted) |')
p('|---|---|---|')
p('| completed | ' + (a.incomplete ? '**no — hit the ceiling / timed out**' : a.completed ? 'yes' : 'no') +
  ' | ' + (b.incomplete ? '**no**' : b.completed ? 'yes' : 'no') + ' |')
p('| context tokens | ' + fmt(a.data?.totalCtx) + ' | ' + fmt(b.data?.totalCtx) + ' |')
p('| output tokens | ' + fmt(a.data?.totalOut) + ' | ' + fmt(b.data?.totalOut) + ' |')
p('| turns | ' + (a.data?.turns ?? '—') + ' | ' + (b.data?.turns ?? '—') + ' |')
p('| mean context/turn | ' + fmt(a.data?.meanCtxPerTurn) + ' | ' + fmt(b.data?.meanCtxPerTurn) + ' |')
p('| wall clock | ' + (a.wall ?? '—') + ' min | ' + (b.wall ?? '—') + ' min |')
p('| cost (USD) | ' + (a.cost != null ? '$' + a.cost.toFixed(2) : '—') +
  ' | ' + (b.cost != null ? '$' + b.cost.toFixed(2) : '—') + ' |')
p('| sessions | ' + (a.data?.sessions ?? '—') + ' | ' + (b.data?.sessions ?? '—') + ' |')
p()

if (a.data?.totalCtx && b.data?.totalCtx) {
  const ratio = a.data.totalCtx / b.data.totalCtx
  p('**Context ratio: v1 spent ' + ratio.toFixed(1) + '× what v2 spent.**')
  if (a.incomplete) p(NL + '> Caveat that matters: v1 did not finish. The real ratio for equal work is')
  if (a.incomplete) p('> therefore *worse* than this for v1, not better.')
  p()
}

p('## Where each arm spent it')
p()
p('v1 splits into the orchestrator versus the team it drove:')
p()
p('| bucket | context | share |')
p('|---|---|---|')
for (const [k, v] of [['orchestrator (top-level)', a.data?.topCtx], ['subagents', a.data?.subCtx]]) {
  const share = a.data?.totalCtx ? (100 * (v || 0) / a.data.totalCtx).toFixed(1) + '%' : '—'
  p('| ' + k + ' | ' + fmt(v) + ' | ' + share + ' |')
}
p()
p('v2 has no orchestrator bucket at all — the conductor is a Node script, so its')
p('share is structurally zero. Its per-stage split:')
p()
try {
  const run = JSON.parse(readFileSync('/e/Projects/ab-v2-gst/docs/runs/gst-calc/run.json', 'utf8'))
  p('| stage | cost | context | output | turns |')
  p('|---|---|---|---|---|')
  for (const [k, s] of Object.entries(run.stages)) {
    if (s.rollup) continue
    p('| ' + k + ' | $' + (s.cost || 0).toFixed(2) + ' | ' + fmt(s.contextTokens) +
      ' | ' + fmt(s.outputTokens) + ' | ' + (s.turns ?? '—') + ' |')
  }
} catch { p('_(v2 run.json not readable)_') }
p()

p('## What each arm actually produced')
p()
for (const [label, dir] of [['v1', '/e/Projects/ab-v1-gst'], ['v2', '/e/Projects/ab-v2-gst']]) {
  p('**' + label + '**')
  const specs = label === 'v2' ? artifacts(dir, 'docs/runs/gst-calc') : artifacts(dir, 'docs/specs')
  p('- pipeline artifacts: ' + (specs.length ? specs.join(', ') : '_none found_'))
  p('- mocks: ' + (artifacts(dir, 'docs/mocks').join(', ') || '_none_'))
  p()
}

p('## Honest limits of this test')
p()
p('- One trial per arm, one small feature. Directional, not a benchmark.')
p('- Neither arm had a human at the decision or mock gates. That flatters v1,')
p('  which in real use pays extra orchestrator turns to run those gates.')
p('- The $30 ceiling binds both arms equally, but only matters if one hits it.')
p('- v2 was told to skip MCP servers on most stages; v1 loaded them everywhere.')
p('  That is a real v2 advantage, but it is a *configuration* advantage anyone')
p('  could apply to v1 too — it is not evidence for the architecture.')
p()

console.log(out.join(NL))
