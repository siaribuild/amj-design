#!/usr/bin/env node
// Builds the A/B comparison from both arms.
//
// THE TRAP THIS FILE EXISTS TO AVOID. Subagent turns are never written to the
// session transcript. v1 spends almost everything in subagents; v2 has none,
// because every v2 stage is itself a top-level session. So a transcript-derived
// comparison divides v1's ORCHESTRATOR-ONLY total by v2's COMPLETE total and
// prints it as a ratio — materially false, and false in the direction that
// flatters v2. It would also show v1's orchestrator as ~100% of v1's spend,
// which is the reverse of the truth.
//
// So the headline is taken from each arm's `modelUsage` aggregate, which counts
// subagents. Transcript figures still appear, labelled as top-level-only, because
// the gap between the two is itself the evidence of how much v1 hides in
// subagents. An arm that did not finish is reported as not finished, never as a
// token ratio.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { streamTotals, runDirTotals, fmt } from './measure.mjs'

const OUT = join(process.cwd(), 'docs', 'pipeline', 'ab-results')
const V1WT = 'E:/Projects/ab-v1-gst'
const V2WT = 'E:/Projects/ab-v2-gst'
const NL = String.fromCharCode(10)

const read = (f) => { try { return readFileSync(join(OUT, f), 'utf8').trim() } catch { return null } }
const out = []
const p = (s = '') => out.push(s)
const num = (n, suffix = '') => n == null ? '—' : fmt(n) + suffix
const usd = (n) => n == null ? '—' : '$' + n.toFixed(2)

function armData(name) {
  const start = read(name + '.start'), end = read(name + '.end')
  const wall = start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 60000) : null
  // Wall clock for an arm that was killed: measure to its last recorded activity.
  const total = name === 'v1'
    ? streamTotals(join(OUT, 'v1.stream.jsonl'))
    : runDirTotals(join(V2WT, 'docs', 'runs', 'gst-calc', 'logs'))
  // Transcript view (top-level sessions only) for the contrast.
  const mline = (read(name + '.measure.txt') || '').split(NL).find((l) => l.startsWith('JSON '))
  const tr = mline ? JSON.parse(mline.slice(5)) : null
  return { name, start, end, wall, total, tr, finished: end != null }
}

const a = armData('v1'), b = armData('v2')

p('# A/B: pipeline v1 vs v2 — the same feature, built twice')
p()
p('**Feature:** a GST quick-calculator page for the customer site.')
p('**Ask, identical for both arms:** `docs/pipeline/ab-results/ASK.txt`')
p()
p('Both arms: same base app code, own git worktree, own node_modules, grill')
p('skipped, no human at the gates, same runaway ceiling.')
p()

// --- completion first. A ratio between a finished and an unfinished arm is a lie.
p('## Did each arm finish?')
p()
p('| | v1 (orchestrated) | v2 (conducted) |')
p('|---|---|---|')
p('| completed | ' + (a.finished ? 'yes' : '**no**') + ' | ' + (b.finished ? 'yes' : '**no**') + ' |')
p('| wall clock | ' + (a.wall != null ? a.wall + ' min' : '—') +
  ' | ' + (b.wall != null ? b.wall + ' min' : '—') + ' |')
p()
if (!a.finished || !b.finished) {
  p('> An arm that did not finish cannot be expressed as a token ratio against one')
  p('> that did. Everything below is "what each arm spent to get as far as it got",')
  p('> and the unfinished arm would have spent **more**, not less, to complete.')
  p()
}

p('## Cost and tokens — subagents included')
p()
p('From each arm\'s `modelUsage` aggregate, which counts subagent work.')
p('This is the only figure that is fair across the two designs.')
p()
p('| | v1 | v2 |')
p('|---|---|---|')
p('| cost | ' + usd(a.total?.cost) + ' | ' + usd(b.total?.cost) + ' |')
p('| context tokens | ' + num(a.total?.ctx) + ' | ' + num(b.total?.ctx) + ' |')
p('| output tokens | ' + num(a.total?.out) + ' | ' + num(b.total?.out) + ' |')
p('| models engaged | ' + (a.total?.models?.join(', ') || '—') +
  ' | ' + (b.total?.models?.join(', ') || '—') + ' |')
p()

if (a.total?.ctx && b.total?.ctx && a.finished && b.finished) {
  p('**v1 spent ' + (a.total.ctx / b.total.ctx).toFixed(1) + '× the context of v2 for the same feature.**')
  p()
} else if (a.total?.ctx && b.total?.ctx) {
  p('_No ratio stated: at least one arm did not complete, so the two numbers do_')
  p('_not describe the same amount of delivered work._')
  p()
}

p('## How much of v1 is invisible to the transcript')
p()
p('The gap below is the whole reason this comparison is not done on transcripts.')
p()
p('| arm | transcript (top-level only) | modelUsage (incl. subagents) | hidden in subagents |')
p('|---|---|---|---|')
for (const arm of [a, b]) {
  const t = arm.tr?.totalCtx, m = arm.total?.ctx
  const hidden = (t != null && m != null) ? num(Math.max(0, m - t)) : '—'
  p('| ' + arm.name + ' | ' + num(t) + ' | ' + num(m) + ' | ' + hidden + ' |')
}
p()
p('v2\'s two columns should be close: it has no subagents, so nothing hides.')
p('v1\'s should diverge sharply. If they do not, the v1 arm died before its')
p('subagents did much — check whether it finished.')
p()

// --- v2 per-stage
p('## v2 per stage')
p()
if (b.total && Object.keys(b.total.stages || {}).length) {
  p('| stage | cost | context | output |')
  p('|---|---|---|---|')
  for (const [k, s] of Object.entries(b.total.stages))
    p('| ' + k + ' | ' + usd(s.cost) + ' | ' + num(s.ctx) + ' | ' + num(s.out) + ' |')
} else p('_no stage logs found_')
p()
p('v2 has no orchestrator row because the conductor is a Node script. That is a')
p('structural zero, not a small number.')
p()

// --- what got built
p('## What each arm actually produced')
p()
const ls = (dir, sub) => { try { return readdirSync(join(dir, sub)).filter((f) => !f.startsWith('.')).sort() } catch { return [] } }
for (const [label, dir, artdir] of [['v1', V1WT, 'docs/specs'], ['v2', V2WT, 'docs/runs/gst-calc']]) {
  p('**' + label + '**')
  p('- pipeline artifacts: ' + (ls(dir, artdir).join(', ') || '_none found_'))
  p('- mocks: ' + (ls(dir, 'docs/mocks').join(', ') || '_none_'))
  p()
}

p('## Honest limits')
p()
p('- One trial per arm, one small feature. Directional, not a benchmark.')
p('- Neither arm had a human at the decision or mock gates. That **flatters v1**,')
p('  which in real use pays extra orchestrator turns to run those gates.')
p('- v2 skips MCP servers on most stages; v1 loaded them everywhere. That is a')
p('  real v2 advantage but a *configuration* one — anyone could apply it to v1.')
p('  It is not evidence for the architecture.')
p('- Subagent turns are absent from transcripts entirely, so any per-role split')
p('  for v1 is derived from `modelUsage` models, not from per-agent attribution.')
p()

console.log(out.join(NL))
