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

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = process.env.USERPROFILE || process.env.HOME
// Read at call time, not at import: the tests point this at a seeded fixture dir
// so nothing here ever touches the developer's real transcripts.
const PROJECTS = () => process.env.CLAUDE_PROJECTS_DIR || join(HOME, '.claude', 'projects')
// A/B arms run in git worktrees, which Claude Code files under their own project
// directory. Scan them all and filter by the record's own cwd instead.
const DIRS = () => {
  const root = PROJECTS()
  let entries
  try { entries = readdirSync(root) } catch { return [] }
  return entries.map((d) => join(root, d)).filter((d) => {
    try { return statSync(d).isDirectory() } catch { return false }
  })
}
const NL = String.fromCharCode(10)
const SEP = String.fromCharCode(92) // backslash, for normalising Windows cwd paths

const zero = () => ({ ctx: 0, out: 0, turns: 0 })

const ctxOf = (u) =>
  (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.input_tokens || 0)

/** The .jsonl files in one directory, skipping any untouched since `sinceMs`. */
function* jsonlIn(dir, sinceMs) {
  let names
  try { names = readdirSync(dir) } catch { return }
  for (const f of names) {
    if (!f.endsWith('.jsonl')) continue
    const p = join(dir, f)
    // Cheap prefilter: a file untouched since the window opened holds nothing new.
    try { if (sinceMs && statSync(p).mtimeMs < sinceMs) continue } catch { continue }
    yield p
  }
}

/**
 * Every transcript file on the machine: the top-level `<sessionId>.jsonl` files
 * plus the second tier, `<sessionId>/subagents/*.jsonl`, whose records carry
 * full usage and are real spend against the same rate-limit window.
 */
function* transcriptFiles(sinceMs) {
  for (const dir of DIRS()) {
    yield* jsonlIn(dir, sinceMs)
    let entries
    try { entries = readdirSync(dir) } catch { continue }
    for (const e of entries) yield* jsonlIn(join(dir, e, 'subagents'), sinceMs)
  }
}

function* records(sinceMs, cwdFilter) {
  for (const file of transcriptFiles(sinceMs)) {
    for (const line of readFileSync(file, 'utf8').split(NL)) {
      if (!line.trim()) continue
      let d
      try { d = JSON.parse(line) } catch { continue }
      if (d.type !== 'assistant' || !d.message?.usage) continue
      if (cwdFilter && !String(d.cwd || '').split(SEP).join('/').includes(cwdFilter)) continue
      yield d
    }
  }
}

/**
 * Every transcript file belonging to one session. A session is ADDRESSABLE:
 * its main transcript is `<proj>/<sessionId>.jsonl` and its subagent turns are
 * `<proj>/<sessionId>/subagents/*.jsonl` (those records carry full usage and the
 * parent's sessionId). Addressing beats scanning: with concurrent sessions on
 * the machine, a scan-and-filter over every transcript costs a full-machine read
 * per stage and can only ever guess at ownership.
 */
function sessionFiles(sessionId) {
  const out = []
  for (const dir of DIRS()) {
    const main = join(dir, sessionId + '.jsonl')
    if (existsSync(main)) out.push(main)
    const subs = join(dir, sessionId, 'subagents')
    try {
      for (const f of readdirSync(subs)) if (f.endsWith('.jsonl')) out.push(join(subs, f))
    } catch { /* no subagent turns */ }
  }
  return out
}

/** Sum one session's API responses, each counted once. Used by `conduct report`. */
export function sessionTotals(sessionId) {
  const b = zero()
  if (!sessionId) return b
  const seen = new Set()
  for (const file of sessionFiles(sessionId)) {
    for (const line of readFileSync(file, 'utf8').split(NL)) {
      if (!line.trim()) continue
      let d
      try { d = JSON.parse(line) } catch { continue }
      if (d.type !== 'assistant' || !d.message?.usage) continue
      const key = d.requestId || ('uuid:' + d.uuid)
      if (seen.has(key)) continue
      seen.add(key)
      b.ctx += ctxOf(d.message.usage)
      b.out += d.message.usage.output_tokens || 0
      b.turns++
    }
  }
  return b
}

/**
 * One stage's figures, and where they came from.
 *
 * The transcript is the authority (it yields the API-call count, which tells you
 * whether a stage was exploring or working). But a stage's child process exits
 * before Claude Code has flushed that session's transcript, so a close-time read
 * can legitimately find nothing yet — hence the fallback to the `result` object
 * the stage itself streamed into logs/<label>.jsonl. `source` is recorded so
 * `conduct report` can recompute the fallback rows later, once, from the
 * transcript that has since landed.
 */
export function stageTotals(sessionId, logPath) {
  const t = sessionTotals(sessionId)
  if (t.turns > 0) return { ctx: t.ctx, out: t.out, turns: t.turns, source: 'transcript' }
  const s = logPath ? streamTotals(logPath) : null
  if (s && (s.turns > 0 || s.ctx > 0)) return { ctx: s.ctx, out: s.out, turns: s.turns, source: 'result' }
  return { ctx: 0, out: 0, turns: 0, source: 'none' }
}

/**
 * Totals for one run, taken from a stream-json log's final `result` object.
 *
 * THIS IS THE ONLY METRIC THAT IS FAIR ACROSS THE TWO PIPELINES. Subagent turns
 * are never written to the transcript, so transcript-summing measures only the
 * top-level session. v1 is almost entirely subagents; v2 has none, because every
 * stage IS a top-level session. Comparing transcript totals would therefore
 * divide v1's orchestrator-only figure by v2's complete figure and call it a
 * ratio — and would additionally report v1's orchestrator as ~100% of v1's
 * spend, which is the exact opposite of the truth.
 *
 * `modelUsage` in the result object aggregates the whole session, subagents
 * included; its per-model breakdown is what exposes them (a v1 run shows the
 * agents' own models, e.g. fable for the architect, alongside the orchestrator's).
 */
export function streamTotals(file) {
  let last = null
  let text
  try { text = readFileSync(file, 'utf8') } catch { return null }
  for (const line of text.split(NL)) {
    if (!line.trim()) continue
    try { const d = JSON.parse(line); if (d.type === 'result') last = d } catch { /* partial line */ }
  }
  if (!last) return null
  const mu = last.modelUsage || {}
  const b = { ctx: 0, out: 0, cost: last.total_cost_usd || 0, models: Object.keys(mu), turns: last.num_turns || 0 }
  for (const v of Object.values(mu)) {
    b.ctx += (v.inputTokens || 0) + (v.cacheReadInputTokens || 0) + (v.cacheCreationInputTokens || 0)
    b.out += v.outputTokens || 0
  }
  return b
}

/** Sum streamTotals over every stage log in a v2 run directory. */
export function runDirTotals(logsDir) {
  const b = { ctx: 0, out: 0, cost: 0, models: new Set(), turns: 0, stages: {} }
  let files
  try { files = readdirSync(logsDir) } catch { return b }
  for (const f of files.filter((f) => f.endsWith('.jsonl'))) {
    const t = streamTotals(join(logsDir, f))
    if (!t) continue
    b.ctx += t.ctx; b.out += t.out; b.cost += t.cost; b.turns += t.turns
    t.models.forEach((m) => b.models.add(m))
    b.stages[f.replace(/\.jsonl$/, '')] = t
  }
  b.models = [...b.models]
  return b
}

const FIVE_HOURS = 5 * 3600 * 1000
const SEVEN_DAYS = 7 * 24 * 3600 * 1000

/**
 * Machine-wide spend in the current 5-hour window and over the trailing 7 days.
 *
 * MACHINE-WIDE means this reads other projects' transcripts, so it is a trust
 * boundary: those files contain whatever those sessions read. Only `usage`,
 * `timestamp`, `requestId`/`uuid` and `sessionId` are ever touched, `sessionId`
 * only to be counted, and the return value is numbers and one boolean. No
 * session id, path, file name or message content can leave this function.
 *
 * The window is ANCHORED when a `rate_limit_event` reset time still lies in the
 * future - then the window began five hours before it. With no such anchor the
 * figure is a TRAILING five hours, which is an approximation and is labelled as
 * one. There is no third possibility to compute: the event carries no quota, so
 * a percentage, a remaining or a headroom cannot be derived from anything here.
 */
export function windowTotals({ anchorResetMs = null, now = Date.now() } = {}) {
  const anchored = !!anchorResetMs && anchorResetMs > now
  const windowStart = (anchored ? anchorResetMs : now) - FIVE_HOURS
  const weekStart = now - SEVEN_DAYS
  const window = { ctx: 0, out: 0, turns: 0, sessions: 0, anchored, resetsAtMs: anchored ? anchorResetMs : null }
  const week = { ctx: 0, out: 0, turns: 0, sessions: 0 }
  const seen = new Set()
  const windowSessions = new Set(), weekSessions = new Set()

  for (const file of transcriptFiles(weekStart)) {
    let text
    try { text = readFileSync(file, 'utf8') } catch { continue }
    for (const line of text.split(NL)) {
      if (!line.trim()) continue
      let d
      try { d = JSON.parse(line) } catch { continue }
      if (d.type !== 'assistant' || !d.message?.usage) continue
      const t = Date.parse(d.timestamp || '')
      if (!(t >= weekStart)) continue
      const key = d.requestId || ('uuid:' + d.uuid)
      if (seen.has(key)) continue
      seen.add(key)
      const ctx = ctxOf(d.message.usage)
      const out = d.message.usage.output_tokens || 0
      week.ctx += ctx; week.out += out; week.turns++
      weekSessions.add(d.sessionId || '?')
      if (t >= windowStart) {
        window.ctx += ctx; window.out += out; window.turns++
        windowSessions.add(d.sessionId || '?')
      }
    }
  }
  window.sessions = windowSessions.size
  week.sessions = weekSessions.size
  return { window, week }
}

/**
 * The last rate-limit reset time this repo's stage logs know about.
 *
 * `rate_limit_event` is streamed into `docs/runs/<slug>/logs/<label>.jsonl` and
 * exists NOWHERE ELSE - not in transcripts, not in the result object. It carries
 * `resetsAt` (UNIX **seconds**) and `rateLimitType` and NO QUOTA FIGURE of any
 * kind, which is why nothing downstream may render a percentage or a remaining.
 *
 * Only the two window fields are returned: the event also carries a `session_id`
 * and a `uuid`, and neither is anyone's business outside this function.
 */
export function latestRateLimitAnchor(runsDir) {
  const files = []
  let slugs
  try { slugs = readdirSync(runsDir) } catch { return null }
  for (const slug of slugs) {
    const logs = join(runsDir, slug, 'logs')
    let names
    try { names = readdirSync(logs) } catch { continue }
    for (const f of names) {
      if (!f.endsWith('.jsonl')) continue
      const p = join(logs, f)
      try { files.push([statSync(p).mtimeMs, p]) } catch { /* vanished */ }
    }
  }
  files.sort((a, b) => b[0] - a[0]) // newest log first; within a log, the last event wins
  for (const [, p] of files) {
    let found = null
    let text
    try { text = readFileSync(p, 'utf8') } catch { continue }
    for (const line of text.split(NL)) {
      if (!line.includes('rate_limit_event')) continue
      let d
      try { d = JSON.parse(line) } catch { continue }
      const i = d.type === 'rate_limit_event' ? d.rate_limit_info : null
      if (i && i.resetsAt) found = { resetsAtMs: i.resetsAt * 1000, rateLimitType: i.rateLimitType || null }
    }
    if (found) return found
  }
  return null
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
