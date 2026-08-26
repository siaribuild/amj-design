#!/usr/bin/env node
// Token accounting for a pipeline arm, read from Claude Code's own transcripts.
//
// Both A/B arms are measured by the same code path so the comparison is honest:
// every assistant record carries a `usage` block, and "context tokens" here means
// what the role table means by it - the sum of context re-sent on every turn
// (cache reads + cache creation + fresh input), NOT the size of a context window.
//
//   node scripts/pipeline/measure.mjs <since-iso> [label]
//
// Sidechain records (isSidechain: true) are subagent turns, which is where a v1
// orchestrated arm spends most of its tokens. They are counted separately so an
// arm's orchestrator overhead is visible on its own.
//
// Why this file exists at all, rather than trusting the CLI's result JSON: that
// JSON's `usage` block is the LAST message's usage, not the sum over the run.
// The smoke-test design stage reported 556k that way and had actually spent
// 1.5M across 26 turns. conduct.mjs imports sessionTotals from here so its own
// report and an A/B measurement can never disagree.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = process.env.USERPROFILE || process.env.HOME
const DIR = join(HOME, '.claude', 'projects', 'E--Projects-amj-website-design')
const NL = String.fromCharCode(10)

const zero = () => ({ ctx: 0, out: 0, turns: 0 })

const ctxOf = (u) =>
  (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.input_tokens || 0)

function* records(sinceMs) {
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith('.jsonl')) continue
    // Cheap prefilter: a file untouched since the window opened holds nothing new.
    if (sinceMs && statSync(join(DIR, f)).mtimeMs < sinceMs) continue
    for (const line of readFileSync(join(DIR, f), 'utf8').split(NL)) {
      if (!line.trim()) continue
      let d
      try { d = JSON.parse(line) } catch { continue }
      if (d.type !== 'assistant' || !d.message?.usage) continue
      yield d
    }
  }
}

/** Sum one session's turns. Used by `conduct report`. */
export function sessionTotals(sessionId) {
  const b = zero()
  for (const d of records(0)) {
    if (d.sessionId !== sessionId) continue
    b.ctx += ctxOf(d.message.usage)
    b.out += d.message.usage.output_tokens || 0
    b.turns++
  }
  return b
}

export const fmt = (n) => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B'
  : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M'
  : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n)

function main() {
  const since = process.argv[2]
  const label = process.argv[3] || 'arm'
  if (!since) { console.error('usage: measure.mjs <since-iso> [label]'); process.exit(1) }
  const sinceMs = Date.parse(since)
  if (Number.isNaN(sinceMs)) { console.error('bad timestamp: ' + since); process.exit(1) }

  const total = zero(), top = zero(), sub = zero()
  const bySession = new Map(), byModel = new Map()
  let first = Infinity, last = 0

  for (const d of records(sinceMs)) {
    const t = Date.parse(d.timestamp || '')
    if (!(t >= sinceMs)) continue
    const ctx = ctxOf(d.message.usage)
    const out = d.message.usage.output_tokens || 0
    for (const b of [total, d.isSidechain ? sub : top]) { b.ctx += ctx; b.out += out; b.turns++ }
    for (const [map, key] of [[bySession, d.sessionId || '?'], [byModel, d.message.model || '?']]) {
      if (!map.has(key)) map.set(key, zero())
      const b = map.get(key); b.ctx += ctx; b.out += out; b.turns++
    }
    if (t < first) first = t
    if (t > last) last = t
  }

  const row = (n, b) => '  ' + String(n).padEnd(26) + fmt(b.ctx).padStart(10) +
    fmt(b.out).padStart(9) + String(b.turns).padStart(8)
  const rule = '  ' + '-'.repeat(53)

  console.log(NL + '  ' + label + ' - since ' + since)
  console.log('  ' + 'bucket'.padEnd(26) + 'context'.padStart(10) + 'output'.padStart(9) + 'turns'.padStart(8))
  console.log(rule)
  console.log(row('top-level sessions', top))
  console.log(row('subagents (sidechain)', sub))
  console.log(rule)
  console.log(row('TOTAL', total))

  const mins = first === Infinity ? 0 : Math.round((last - first) / 60000)
  console.log(NL + '  wall clock (first->last turn): ' + mins + ' min')
  console.log('  sessions: ' + bySession.size + '   turns: ' + total.turns)
  if (total.turns) console.log('  mean context per turn: ' + fmt(Math.round(total.ctx / total.turns)))

  console.log(NL + '  by model')
  for (const [k, b] of [...byModel].sort((a, b) => b[1].ctx - a[1].ctx)) console.log(row(k, b))
  console.log(NL + '  by session')
  for (const [k, b] of [...bySession].sort((a, b) => b[1].ctx - a[1].ctx).slice(0, 14))
    console.log(row(k.slice(0, 8), b))

  console.log(NL + 'JSON ' + JSON.stringify({
    label, since, topCtx: top.ctx, subCtx: sub.ctx, totalCtx: total.ctx,
    totalOut: total.out, turns: total.turns, minutes: mins, sessions: bySession.size,
    meanCtxPerTurn: total.turns ? Math.round(total.ctx / total.turns) : 0,
  }))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
