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
// COUNT EACH API RESPONSE ONCE. A single response is written to the transcript
// as one assistant record PER CONTENT BLOCK, and every one of those records
// carries the same `usage` object. Summing records naively multi-counts: the
// smoke-test design stage has 26 assistant records but only 10 distinct
// requestIds, and the naive sum came out at 1.45M against a true 0.556M - a 2.6x
// overstatement. Dedup by requestId; the deduped total matches the CLI's own
// result.usage exactly.
//
// Records with no requestId (rare - local/synthetic turns) are counted once each,
// keyed by uuid, rather than collapsed together.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = process.env.USERPROFILE || process.env.HOME
const PROJECTS = join(HOME, '.claude', 'projects')
// A/B arms run in git worktrees, which Claude Code files under their own project
// directory. Scan them all and filter by the record's own cwd instead.
const DIRS = () => readdirSync(PROJECTS).map((d) => join(PROJECTS, d)).filter((d) => {
  try { return statSync(d).isDirectory() } catch { return false }
})
const NL = String.fromCharCode(10)
const SEP = String.fromCharCode(92) // backslash, for normalising Windows cwd paths

const zero = () => ({ ctx: 0, out: 0, turns: 0 })

const ctxOf = (u) =>
  (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.input_tokens || 0)

function* records(sinceMs, cwdFilter) {
  for (const dir of DIRS()) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue
      // Cheap prefilter: a file untouched since the window opened holds nothing new.
      if (sinceMs && statSync(join(dir, f)).mtimeMs < sinceMs) continue
      for (const line of readFileSync(join(dir, f), 'utf8').split(NL)) {
        if (!line.trim()) continue
        let d
        try { d = JSON.parse(line) } catch { continue }
        if (d.type !== 'assistant' || !d.message?.usage) continue
        if (cwdFilter && !String(d.cwd || '').split(SEP).join('/').includes(cwdFilter)) continue
        yield d
      }
    }
  }
}

/** Sum one session's API responses, each counted once. Used by `conduct report`. */
export function sessionTotals(sessionId) {
  const b = zero()
  const seen = new Set()
  for (const d of records(0)) {
    if (d.sessionId !== sessionId) continue
    const key = d.requestId || ('uuid:' + d.uuid)
    if (seen.has(key)) continue
    seen.add(key)
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
  const cwdFilter = process.argv[4] || null
  if (!since) { console.error('usage: measure.mjs <since-iso> [label] [cwd-substring]'); process.exit(1) }
  const sinceMs = Date.parse(since)
  if (Number.isNaN(sinceMs)) { console.error('bad timestamp: ' + since); process.exit(1) }

  const total = zero(), top = zero(), sub = zero()
  const bySession = new Map(), byModel = new Map()
  let first = Infinity, last = 0

  const seen = new Set()
  for (const d of records(sinceMs, cwdFilter)) {
    const t = Date.parse(d.timestamp || '')
    if (!(t >= sinceMs)) continue
    const key = d.requestId || ('uuid:' + d.uuid)
    if (seen.has(key)) continue
    seen.add(key)
    const ctx = ctxOf(d.message.usage)
    const out = d.message.usage.output_tokens || 0
    for (const b of [total, d.isSidechain ? sub : top]) { b.ctx += ctx; b.out += out; b.turns++ }
    for (const [map, bucket] of [[bySession, d.sessionId || '?'], [byModel, d.message.model || '?']]) {
      if (!map.has(bucket)) map.set(bucket, zero())
      const b = map.get(bucket); b.ctx += ctx; b.out += out; b.turns++
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
