#!/usr/bin/env node
// Pipeline v2 conductor.
//
// v1 ran the pipeline from inside a Claude session: the orchestrator held every
// stage's output in its context and re-sent the lot on every turn. Measured over
// one feature that cost 2.17B context tokens across 3 main threads — ~34% of the
// feature's entire spend — to do work that is, in substance, a state machine.
//
// v2 runs the same agents, in the same order, with the same gates. The
// difference is that this file does the conducting, in zero model tokens, and
// stages hand off through files on disk instead of through a model's context.
//
// Three levers, in measured order of impact:
//   1. Context per turn is capped (--autocompact). Context tokens are the sum of
//      context re-sent each turn; an uncapped 1M window is why single runs hit
//      182M. Capping at ~120k takes a straight multiple off every role.
//   2. The orchestrator is gone. This script costs nothing.
//   3. Long roles are sliced into short, scoped runs and handed exact paths.
//      Splitting an N-turn run into k runs divides its quadratic term by k.
//
// Everything the model is told is a PATH. Artifact contents never pass through
// this process, so the conductor's cost does not grow with the feature.

import { spawn, execSync, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sessionTotals, stageTotals, latestRateLimitAnchor, windowTotals, fmt } from './measure.mjs'
import {
  available as herdrAvailable, ensureCockpit, launchStage, writePrompt, watch, notify,
  agentPrompt, splitPane, paneReady,
} from './herd.mjs'

const ROOT = resolve(process.cwd())
const RUNS = join(ROOT, 'docs', 'runs')
const WIN = process.platform === 'win32'

// Resolve the real claude binary. It is a native executable, so we can spawn it
// with an argv array and no shell: prompts containing quotes, backticks or
// newlines are then passed verbatim instead of being re-parsed by cmd.exe.
const CLAUDE = (() => {
  if (process.env.CONDUCT_CLAUDE_BIN) return process.env.CONDUCT_CLAUDE_BIN
  const home = process.env.APPDATA || process.env.HOME
  const local = home && join(home, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin',
    WIN ? 'claude.exe' : 'claude')
  return local && existsSync(local) ? local : 'claude'
})()

const die = (m) => { console.error('\n  ' + m + '\n'); process.exit(1) }
const sh = (c) => execSync(c, { cwd: ROOT, encoding: 'utf8' }).trim()
// A row whose figures are real. A stage that was never metered prints "unknown",
// never 0 - a zero has to mean measured zero, or the instrument lies quietly.
// Records written before `source` existed are judged by their own numbers.
const metered = (s) => s.source
  ? s.source !== 'none'
  : ((s.contextTokens || 0) + (s.outputTokens || 0) + (s.turns || 0)) > 0
// Slugs become filesystem paths and git worktree names. Constrain them at the
// boundary rather than trusting every later interpolation.
const SLUG = /^[a-z0-9][a-z0-9-]{0,48}$/
const checkSlug = (s) => SLUG.test(s) ? s : die('slug must match ' + SLUG + ' - got "' + s + '"')

// --- stage table -----------------------------------------------------------
// compact: context window cap, in tokens.
//
// There is deliberately NO runaway guard here - no dollar ceiling, no token
// ceiling, no turn ceiling. Owner ruling: no threshold is defensible, the
// subscription's 5-hour window is the only externally-enforced ceiling there is,
// and a stage running in front of you is the guard. Do not reintroduce one.
// Dollars are not the measure either: the owner is on a subscription, so this
// conductor prints tokens and time and never a currency figure.

const STAGES = [
  {
    id: 'spec', agent: 'product-manager', compact: 120000,
    needs: ['00-ask.md'], produces: ['01-spec.md'],
    prompt: (r) => `Write the spec for this feature.

READ ONLY THESE (do not search the codebase for background):
  ${r.dir}/00-ask.md          - the ask, plus the grill conclusions if one was run
  CONTEXT.md                  - domain vocabulary
  CLAUDE.md                   - house rules

WRITE: ${r.dir}/01-spec.md

The spec must contain, in this order:
  1. Problem and the actor it serves, in that actor's terms.
  2. Acceptance criteria as numbered Given-When-Then. Sensitive surfaces
     (auth, payout/bank data, payments, uploads, money) get negative abuse-case
     criteria too - the tester will execute them for real.
  3. Out of scope.
  4. Any assumption you had to make, tagged ASSUMED: so it can be vetoed.

If a decision is genuinely the owner's - a business rule, a scope or cost
trade-off, something customer-facing - do NOT guess and do NOT explore the code
looking for the answer. Write ${r.dir}/DECISIONS.md as a numbered list, each
with your recommendation, and stop. The human answers in that file directly.

Be economical: you are being metered. Read what you were given, write the spec.`,
  },
  {
    id: 'design', agent: 'architect', compact: 120000,
    needs: ['01-spec.md'], produces: ['02-design.md', '02-tasks.json'],
    prompt: (r) => `Design the implementation for this spec.

READ: ${r.dir}/01-spec.md, CONTEXT.md, and the source files you actually need.
Locate files once. Do not re-grep for something you already found.

WRITE TWO FILES.

(1) ${r.dir}/02-design.md - files and interfaces, data model and migrations,
    sequencing, test plan, and a Security section. If the feature has no
    sensitive surface, say "Security: no sensitive surface" explicitly rather
    than omitting it.

(2) ${r.dir}/02-tasks.json - the build broken into independently implementable
    slices. This is not documentation; the conductor executes it, running ONE
    developer session per task. That is the mechanism that stops a single
    developer run growing to hundreds of turns, so slice for real:

    [
      { "id": "t1",
        "title": "short imperative",
        "files": ["worker/lib/foo.ts", "scripts/tests/foo.test.mjs"],
        "tests": ["scripts/tests/foo.test.mjs"],
        "done_when": "one sentence a tester could check",
        "after": [] }
    ]

    Rules: every path exact and relative to repo root - the developer is
    forbidden from searching for them. 3-8 tasks; a task is roughly an hour of
    work, not a day. "after" lists task ids that must land first. Every test
    file your design names MUST appear in some task's "files" - a
    named-but-never-created test file is v1's most-repeated failure.

Owner-only decisions go in ${r.dir}/DECISIONS.md with your recommendation, then
stop. Do not guess at business rules.`,
  },
  {
    id: 'ux', agent: 'ux-designer', ui: true, gate: 'mock', compact: 100000, mcp: true,
    needs: ['02-design.md'], produces: ['03-ux.md'],
    prompt: (r) => `Design the interaction and produce the mock.

READ: ${r.dir}/01-spec.md, ${r.dir}/02-design.md, and the existing components
this screen will be built from (the design names them). Reuse the app's existing
design language - do not survey the whole codebase to rediscover it.

WRITE:
  ${r.dir}/03-ux.md            - structure, flows, states, empty/error cases
  docs/mocks/${r.slug}.html    - ONE self-contained static HTML file

The mock goes to the owner for approval and it must show the look that will
actually ship, not a wireframe: real type, spacing, colour and hierarchy, using
the app's existing design language. Use the impeccable skill for the visual
treatment. Implementation does not start until the owner approves this, so make
it representative.`,
  },
  {
    id: 'build', agent: 'developer', sliced: true, compact: 120000,
    needs: ['02-tasks.json'], produces: ['04-build.md'],
  },
  {
    id: 'polish', agent: 'ui-designer', ui: true, compact: 100000, mcp: true,
    needs: ['04-build.md'], produces: ['05-polish.md'],
    prompt: (r) => `Audit and polish the UI that was just built.

READ: ${r.dir}/03-ux.md, docs/mocks/${r.slug}.html, and ${r.dir}/04-build.md
(which lists exactly which files changed). Work on those files.

Bring the built result up to the approved mock. Use the impeccable skill.
WRITE ${r.dir}/05-polish.md: what you changed and why, files touched.`,
  },
  {
    id: 'verify', agent: 'tester', worktree: true, compact: 120000,
    needs: ['04-build.md'], produces: ['06-verify.md'],
    prompt: (r) => `Independently verify this feature. Assume nothing reported is true.

READ: ${r.dir}/01-spec.md (the acceptance criteria are your checklist) and
${r.dir}/04-build.md (what was changed). Verify against the criteria - do not
re-derive the design.

Run: npm run typecheck:gate, then the owning test:* suites for the changed
areas. A feature that adds or changes UI cannot PASS without Playwright
coverage in scripts/tests/web/ - node:test suites cannot see anything the
client decides, and that blind spot has shipped MAJOR defects here before.
Execute every negative/abuse criterion for real: attempt the forbidden action
and record the denial.

WRITE ${r.dir}/06-verify.md: a PASS/FAIL verdict, a row per acceptance criterion
with its evidence, and every finding with the exact command that reproduces it.
Findings go back to a developer, not to you - do not fix code.`,
  },
  {
    id: 'review', parallel: true, needs: ['04-build.md'], produces: [],
  },
  {
    id: 'accept', agent: 'product-manager', gate: 'signoff', compact: 100000,
    needs: ['06-verify.md'], produces: ['08-accept.md'],
    prompt: (r) => `Issue the acceptance verdict.

READ: ${r.dir}/01-spec.md, ${r.dir}/06-verify.md, and every ${r.dir}/07-review-*.md.

Walk each acceptance criterion against the tester's evidence. Check for silent
descoping, scope creep, and ASSUMED: tags that were never vetoed. Do not run
tests yourself and do not read source - the tester's evidence is your input.

WRITE ${r.dir}/08-accept.md: per-criterion met/not-met with the evidence
reference, anything descoped, and an ACCEPT / REJECT verdict.`,
  },
]

// Read-only reviewers. Independent of each other, so they fan out in parallel.
const REVIEWERS = [
  {
    id: 'conformance', agent: 'architect', compact: 100000,
    prompt: (r) => `Design-conformance review.

READ ${r.dir}/02-design.md and ${r.dir}/02-tasks.json, then the branch diff:
git diff ${r.base}...HEAD

Structure only - this is not a second bug hunt. Report divergences between what
was designed and what was built. Conformance includes ABSENCE: a file the design
named that the diff never created is a divergence, and it is the one a
diff-reading review always misses. Check every path in 02-tasks.json exists.

WRITE ${r.dir}/07-review-conformance.md.`,
  },
  {
    // Headless in EVERY mode, and not by preference: /security-review is
    // compiled into the CLI. There is no file on disk for it, the Skill tool
    // cannot reach it, and nothing typed into a pane fires a built-in slash
    // command reliably. It is a property of the tool.
    id: 'security', slash: '/security-review', compact: 100000, headless: true,
  },
  {
    id: 'ponytail', slash: '/ponytail:ponytail-review', compact: 100000,
  },
  { id: 'codex', codex: true },
]

// --- run state -------------------------------------------------------------

const withDir = (r) => { r.dir = 'docs/runs/' + r.slug; return r }

function loadRun(slug) {
  const p = join(RUNS, slug, 'run.json')
  if (!existsSync(p)) die('no run at ' + p + '\n  start one with:  conduct start <slug> "<ask>"')
  return withDir(JSON.parse(readFileSync(p, 'utf8')))
}

function saveRun(r) {
  const copy = { ...r }
  delete copy.dir
  writeFileSync(join(RUNS, r.slug, 'run.json'), JSON.stringify(copy, null, 2))
}

/**
 * Heal stage figures that were taken before the transcript had flushed.
 *
 * Recompute any stage that has a session id but was not metered from its
 * transcript, and persist the result so a row heals exactly once. Old run.jsons
 * carrying `contextTokens: 0` from before the fallback existed heal on the next
 * `report` or `plan`.
 */
function refreshRun(r) {
  let changed = false
  for (const s of Object.values(r.stages || {})) {
    if (!s.session || (s.source === 'transcript' && s.turns > 0)) continue
    const t = sessionTotals(s.session)
    if (!t.turns) continue
    Object.assign(s, { contextTokens: t.ctx, outputTokens: t.out, turns: t.turns, source: 'transcript' })
    changed = true
  }
  if (changed) saveRun(r)
  return r
}

// --- the window you are actually spending against ---------------------------
//
// The subscription's 5-hour window is the only ceiling that exists (owner ruling,
// round 3), so it is what `report` shows: burn in the current window and over the
// trailing week, across EVERY Claude session on this machine, not just this run.
//
// What it deliberately does NOT show: a percentage, a remaining, a headroom. The
// rate_limit_event carries a reset time and no quota whatsoever, so every one of
// those would be invented, and an invented number on a gauge is worse than a
// blank one. Do not add one by inferring a quota from observed maxima either.

const RESET_ADVISORY_MIN = 15

const hhmm = (ms) => new Date(ms).toTimeString().slice(0, 5)
const hm = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000))
  return m >= 60 ? Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') + 'm' : m + 'm'
}

/**
 * The advisory printed when a stage starts near a reset. It is ADVISORY: the
 * stage starts regardless. Nothing here may ever defer, refuse or halt a run on
 * window state - the operator watching the stage decides, not this script.
 */
export const resetAdvisory = (anchor, now = Date.now()) => {
  const at = anchor?.resetsAtMs
  if (!at || at <= now || at - now > RESET_ADVISORY_MIN * 60 * 1000) return null
  return 'window resets at ' + hhmm(at) + ' (in ' + hm(at - now) + ') - starting anyway'
}

function printWindow() {
  const now = Date.now()
  const anchor = latestRateLimitAnchor(RUNS)
  const { window, week } = windowTotals({ anchorResetMs: anchor?.resetsAtMs || null, now })
  const label = window.anchored
    ? '5h window (anchored, resets ' + hhmm(window.resetsAtMs) + ' in ' + hm(window.resetsAtMs - now) + ')'
    : '5h window (trailing - no reset seen)'
  // A week's context total reaches billions here, so the columns are sized for
  // "ctx 4.16B", not for the largest figure a smoke test happens to produce.
  const row = (l, b) => '  ' + l.padEnd(38) + ('ctx ' + fmt(b.ctx)).padEnd(13) +
    ('out ' + fmt(b.out)).padEnd(13) + b.turns + ' calls'
  console.log('\n  machine-wide, all Claude sessions:')
  console.log(row(label, window))
  console.log(row('7-day rolling', week))
}

// --- pane mode --------------------------------------------------------------
//
// Panes engage by themselves when herdr answers - there is no opt-in step, or
// the durability that justifies this feature would depend on remembering a
// flag. `--no-panes` is the per-invocation opt-out and is deliberately NOT
// persisted: the next command decides again, from the same evidence.

export const noPanes = (args) => args.includes('--no-panes')

export async function paneMode(args) {
  if (noPanes(args)) return false
  const why = await herdrAvailable()
  if (why === true) return true
  console.log('\n  herdr unavailable (' + why + ') - running headless.\n')
  return false
}

function activeSlug() {
  const p = join(RUNS, '.active')
  if (!existsSync(p)) die('no active run - start one with:  conduct start <slug> "<ask>"')
  return readFileSync(p, 'utf8').trim()
}

// --- running a stage -------------------------------------------------------

// A CLI-spawned session inherits nothing from the desktop app's MCP servers, so
// `mcp: true` only means anything if a project config is passed. `.mcp.json`
// holds the browser server and nothing else: whatever is in it is loaded by
// every session in this repo and paid for on every turn.
export const browserMcp = (root = ROOT) =>
  existsSync(join(root, 'node_modules', '@playwright', 'mcp'))

// A missing browser makes the ui-designer work blind; it does not make the run
// worthless. So the stage degrades and says so, rather than aborting.
export const mcpAdvisory = (spec, ok) => spec.mcp && !ok
  ? 'browser MCP unavailable (node_modules/@playwright/mcp not installed) - running the stage without it'
  : null

// The flags that define the session itself, and so are the same whether the
// stage is a headless child or an interactive claude booted in a pane.
function sessionArgs(spec, mcpOk) {
  const a = []
  if (spec.agent) a.push('--agent', spec.agent)
  if (spec.model) a.push('--model', spec.model)
  // Lever 1. Context tokens are the sum of context re-sent per turn; an
  // uncapped 1M window is what turns a long run into 182M.
  a.push('--autocompact', String(spec.compact || 120000))
  a.push('--permission-mode', spec.readonly ? 'plan' : 'bypassPermissions')
  if (spec.mcp && mcpOk) a.push('--mcp-config', '.mcp.json')
  // Always strict: an inherited user or global config drags its tool
  // definitions - Sanity's are large - into every turn of every stage.
  a.push('--strict-mcp-config')
  return a
}

export const claudeArgs = (spec, promptText, mcpOk = browserMcp()) =>
  ['-p', promptText, '--output-format', 'stream-json', '--verbose', ...sessionArgs(spec, mcpOk)]

// A pane boot is interactive: no -p, no stream-json. The session id is passed
// in so the conductor can meter and resume the stage by an id it chose itself,
// rather than waiting to learn one (herd.mjs cross-checks what herdr reports).
export const paneArgs = (spec, sessionId, mcpOk = browserMcp()) =>
  ['--session-id', sessionId, ...sessionArgs(spec, mcpOk)]

function runClaude(spec, promptText, run, label) {
  return new Promise((res) => {
    const started = Date.now()
    mkdirSync(join(RUNS, run.slug, 'logs'), { recursive: true })
    const logPath = join(RUNS, run.slug, 'logs', label + '.jsonl')
    // Advisory only, by criterion 25: say the window is about to reset and start
    // the stage regardless. Never a gate.
    const advisory = resetAdvisory(latestRateLimitAnchor(RUNS))
    if (advisory) process.stdout.write('\n  ' + advisory + '\n')
    const mcpOk = browserMcp()
    const mcpWarning = mcpAdvisory(spec, mcpOk)
    if (mcpWarning) process.stdout.write('\n  ' + mcpWarning + '\n')
    const cp = spawn(CLAUDE, claudeArgs(spec, promptText, mcpOk),
      { cwd: spec.cwd || ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let buf = ''
    let result = null
    process.stdout.write('\n  > ' + label + '\n')
    cp.stdout.on('data', (d) => {
      buf += d.toString()
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.trim()) continue
        appendFileSync(logPath, line + '\n')
        let m
        try { m = JSON.parse(line) } catch { continue }
        if (m.type === 'assistant') {
          for (const c of m.message?.content || []) {
            if (c.type === 'tool_use') process.stdout.write('    . ' + c.name + '\n')
            else if (c.type === 'text' && c.text.trim())
              process.stdout.write('    ' + c.text.trim().slice(0, 160) + '\n')
          }
        } else if (m.type === 'result') result = m
      }
    })
    cp.stderr.on('data', (d) => process.stderr.write('    ! ' + d))
    cp.on('close', (code) => {
      // Prefer the transcript - not because result.usage is wrong (it is right;
      // the deduped transcript matches it exactly) but because the transcript
      // also yields the API-call count, which is the number that tells you
      // whether a stage is exploring or working. The child exits before Claude
      // Code has flushed that session's transcript, though, so a close-time read
      // often finds nothing yet: hence the fallback to the result object this
      // stage just streamed into its own log, and `source`, which lets `report`
      // recompute from the transcript later, once (refreshRun).
      const t = stageTotals(result?.session_id, logPath)
      const s = {
        code,
        contextTokens: t.ctx,
        outputTokens: t.out,
        turns: t.turns,
        source: t.source,
        session: result?.session_id,
        seconds: Math.round((Date.now() - started) / 1000),
      }
      run.stages[label] = s
      saveRun(run)
      process.stdout.write('  ok ' + label + '  ' + (metered(s)
        ? 'ctx ' + fmt(s.contextTokens) + '  out ' + fmt(s.outputTokens) + '  ' + s.turns + ' calls'
        : 'metering unknown') + '  ' + s.seconds + 's\n')
      res(s)
    })
  })
}

// --- running a stage in a pane ----------------------------------------------
//
// The shape is start -> prompt -> watch -> finalize, and the reason it is worth
// the extra code is the middle: a stage that needs the owner HOLDS WARM in its
// pane instead of writing DECISIONS.md and exiting. Resuming an exited stage
// pays a full boot - measured at 26-33k tokens - for an answer the operator
// could have typed into a live agent. Holding costs nothing.
//
// Nothing here reads a pane. Completion comes from herdr settling, results from
// the files the stage wrote, and the numbers from its transcript.

/**
 * A pane for this role, reused. Reuse means a NEW claude and a new session -
 * a role's next stage never re-prompts the previous agent - but the same pane,
 * so the run does not end with a dozen shells open.
 */
async function rolePane(run, role, cwd) {
  const panes = run.herdr.rolePanes || (run.herdr.rolePanes = {})
  // A finished stage left its pane at a shell (/exit). One still working has
  // not, and must not be handed a second agent.
  if (panes[role] && await paneReady(panes[role]).catch(() => false)) return panes[role]
  panes[role] = await splitPane(run.herdr.planPane, cwd)
  saveRun(run)
  return panes[role]
}

/** Hold the agent alive and tell the operator where it is. No /exit, no re-boot. */
async function holdWarm(run, label, reason, started) {
  const s = run.stages[label]
  Object.assign(s, {
    status: 'held', holdReason: reason, seconds: Math.round((Date.now() - started) / 1000),
  })
  run.gateStage = label
  saveRun(run)
  const where = 'workspace ' + (run.herdr?.workspace || '?') + '  pane ' + s.pane + '  agent ' + label
  console.log('\n  == HELD WARM (' + reason + ') - ' + label + ' is alive in its pane.')
  console.log('     attach:  ' + where)
  console.log('     then:    node scripts/pipeline/conduct.mjs answer\n')
  await notify('pipeline: ' + label + ' needs you', where)
  return s
}

/**
 * The stage is done. Meter it from its own transcript by the id we recorded,
 * free the claude, and leave the pane and its scrollback exactly where they are.
 */
async function finalizePane(run, label, started) {
  const s = run.stages[label]
  // Pane transcripts are written live, so there is no flush race to sleep
  // through here; anything still missing heals on the next report (refreshRun).
  const t = sessionTotals(s.session)
  Object.assign(s, {
    code: 0, status: 'done',
    contextTokens: t.ctx, outputTokens: t.out, turns: t.turns,
    source: t.turns ? 'transcript' : 'none',
    seconds: Math.round((Date.now() - started) / 1000),
  })
  delete s.holdReason
  saveRun(run)
  // Free the process, keep the evidence.
  await agentPrompt(label, '/exit').catch((e) => console.log('  .. ' + label + ' would not /exit (' + e.message + ')'))
  console.log('  ok ' + label + '  ' + (metered(s)
    ? 'ctx ' + fmt(s.contextTokens) + '  out ' + fmt(s.outputTokens) + '  ' + s.turns + ' calls'
    : 'metering unknown') + '  ' + s.seconds + 's')
  return s
}

/** Wait for the agent to settle, then hold it warm or finish it off. */
async function settleStage(run, label, started) {
  const r = await watch(label)
  if (r.state === 'lost') {
    console.log('  !! lost track of ' + label + ' (' + r.error + ') - it stays "running";' +
      ' pick it up with:  node scripts/pipeline/conduct.mjs next')
    return run.stages[label]
  }
  // herdr saw a permission or question UI. Nothing was written; the agent is
  // waiting on a human, and killing it here is precisely the cost this avoids.
  if (r.state === 'blocked') return holdWarm(run, label, 'blocked-ui', started)
  if (decisionsPending(run)) return holdWarm(run, label, 'decisions', started)
  return finalizePane(run, label, started)
}

/**
 * Run one stage as a herdr agent. Returns the stage record, or null when herdr
 * could not give it a pane or an agent - the caller then runs it headless.
 */
async function runPaneStage(spec, promptText, run, label) {
  const started = Date.now()
  // Announced BEFORE the pane is found, not after: this line is how a fan-out
  // is read as a fan-out, and a stage that cannot get a pane still has to say
  // whose failure the next line belongs to.
  console.log('\n  > ' + label)
  const advisory = resetAdvisory(latestRateLimitAnchor(RUNS))
  if (advisory) console.log('\n  ' + advisory)
  const mcpOk = browserMcp()
  const mcpWarning = mcpAdvisory(spec, mcpOk)
  if (mcpWarning) console.log('\n  ' + mcpWarning)

  let paneId
  try {
    paneId = await rolePane(run, spec.agent || label, spec.cwd || ROOT)
  } catch (e) {
    console.log('\n  !! no pane for ' + label + ' (' + e.message + ') - running headless.')
    return null
  }

  const sessionId = randomUUID()
  const promptPath = writePrompt(ROOT, run.slug, label, promptText)
  console.log('    pane ' + paneId)
  const boot = await launchStage({
    paneId, label, sessionId, argv: paneArgs(spec, sessionId, mcpOk), promptPath,
    onSession: (session) => {
      run.stages[label] = {
        status: 'running', mode: 'pane', session, pane: paneId,
        source: 'none', startedAt: new Date().toISOString(),
      }
      saveRun(run)
    },
  })
  if (!boot) return null
  return settleStage(run, label, started)
}

// --- sliced build: one short session per task -------------------------------

// STRICTLY SEQUENTIAL, in both modes, and deliberately so: parallel tasks were
// rejected on token cost. A task started beside its predecessor never sees the
// 04-build.md the predecessor writes, so it re-discovers what was already
// established - which is the re-read cost this pipeline exists to remove. This
// is the one loop in the file that must never become a fan-out.
async function runBuild(run, spec, panes) {
  const tp = join(RUNS, run.slug, '02-tasks.json')
  if (!existsSync(tp)) die('design produced no 02-tasks.json - re-run:  conduct run design')
  const tasks = JSON.parse(readFileSync(tp, 'utf8'))
  const done = new Set(run.tasksDone || [])
  for (const t of tasks) {
    if (done.has(t.id)) { process.stdout.write('  . ' + t.id + ' already done\n'); continue }
    const blocked = (t.after || []).filter((d) => !done.has(d))
    if (blocked.length) die('task ' + t.id + ' needs ' + blocked.join(', ') + ' first')
    const prompt = `Implement ONE task, test-first. Nothing else.

TASK ${t.id}: ${t.title}
DONE WHEN: ${t.done_when}

FILES - these are the only files you may touch. They were located for you;
do NOT search the repo for them and do NOT widen the scope:
${(t.files || []).map((f) => '  ' + f).join('\n')}

TESTS: ${(t.tests || []).join(', ') || 'see the design'}

CONTEXT - read these two, nothing more:
  ${run.dir}/02-design.md
  ${run.dir}/04-build.md   (if it exists - what earlier tasks already landed)

Probity enforces TDD on worker/**, src/data/** and scripts/tests/**: write the
failing test, watch it fail, then implement. Work with the guardrail.

Commit when the task is green. Do not hold work for a final commit - a killed
session must leave its work behind.

Then APPEND to ${run.dir}/04-build.md:
  ## ${t.id} - ${t.title}
  files changed, what the test asserts, anything the next task needs to know.
  Under 15 lines. It is the only thing the next session will be told.

Stop when this task is done. Do not start the next one.`
    const label = 'build-' + t.id
    const s = (panes && await runPaneStage({ ...spec }, prompt, run, label)) ||
      await runClaude({ ...spec }, prompt, run, label)
    // A task that stopped to ask something is not a failed task. Its agent is
    // alive in its pane and the gate has already been printed; the remaining
    // tasks wait, because each one is written against the last one's handoff.
    if (s.status === 'held') return
    if (s.code !== 0)
      die('task ' + t.id + ' failed (exit ' + s.code + ') - see ' + run.dir + '/logs/' + label + '.jsonl')
    done.add(t.id)
    run.tasksDone = [...done]
    saveRun(run)
  }
  run.stages['build'] = { code: 0, contextTokens: 0, outputTokens: 0, rollup: true }
  saveRun(run)
  process.stdout.write('\n  build complete: ' + tasks.length + ' task(s)\n')
}

// --- parallel review fan-out -----------------------------------------------

function runCodex(run) {
  return new Promise((res) => {
    const home = process.env.USERPROFILE || process.env.HOME
    const script = join(home, '.claude', 'plugins', 'cache', 'openai-codex', 'codex', '1.0.6',
      'scripts', 'codex-companion.mjs')
    if (!existsSync(script)) {
      process.stdout.write('  !! codex companion not found at ' + script +
        '\n     This work is UNREVIEWED by Codex. Do not present it as reviewed.\n')
      return res()
    }
    process.stdout.write('\n  > review-codex\n')
    const cp = spawn(process.execPath, [script, 'review', '--wait', '--base', run.base, '--scope', 'branch'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    cp.stdout.on('data', (d) => { out += d })
    cp.stderr.on('data', (d) => { out += d })
    cp.on('close', (code) => {
      writeFileSync(join(RUNS, run.slug, '07-review-codex.md'), out)
      // Measured zero Claude tokens, not unmeasured: codex is another vendor's model.
      run.stages['review-codex'] = { code, contextTokens: 0, outputTokens: 0, turns: 0, source: 'codex' }
      saveRun(run)
      process.stdout.write('  ok review-codex (exit ' + code + ', 0 Claude tokens)\n')
      if (code !== 0)
        process.stdout.write('  !! codex review did not complete. An infrastructure failure is NOT\n' +
          '     a clean review - retry once, then tell the owner it is unreviewed.\n')
      res()
    })
  })
}

// The one place in the pipeline where concurrency is free: the four reviewers
// are read-only and independent, so running them at once costs the same tokens
// and divides that stage's wall clock. Every reviewer is STARTED before any
// completion is awaited - a fan-out that starts the second only once the first
// has finished is a sequential loop wearing a costume - and one reviewer
// holding on a question does not stall the other three.
async function runReviews(run, panes) {
  const jobs = REVIEWERS.filter((rv) => !rv.codex).map((rv) => {
    const spec = { agent: rv.agent, compact: rv.compact, readonly: true }
    const text = rv.slash
      ? rv.slash + '\n\nReview the branch diff against ' + run.base +
        '. Write your findings to ' + run.dir + '/07-review-' + rv.id +
        '.md and reply with only that path.'
      : rv.prompt(run)
    const label = 'review-' + rv.id
    if (!panes || rv.headless) return runClaude(spec, text, run, label)
    return runPaneStage(spec, text, run, label).then((s) => s || runClaude(spec, text, run, label))
  })
  await Promise.all([...jobs, runCodex(run)])
  process.stdout.write('\n  reviews done. Findings go to a developer, never patched inline:\n' +
    '     conduct fix "<finding>"\n')
}

// --- gates -----------------------------------------------------------------

// Asked twice per stage in pane mode - once to decide whether to hold the agent
// warm, once by afterStage to print the gate - so the question and the printing
// are separate. Printing it twice would read as two different gates.
function decisionsPending(run) {
  const p = join(RUNS, run.slug, 'DECISIONS.md')
  return existsSync(p) && !/^\s*A:\s*\S/m.test(readFileSync(p, 'utf8'))
}

function decisionsOpen(run) {
  const p = join(RUNS, run.slug, 'DECISIONS.md')
  if (!decisionsPending(run)) return false
  const txt = readFileSync(p, 'utf8')
  console.log('\n  == DECISION GATE - the stage stopped with questions.\n')
  console.log(txt.split('\n').map((l) => '     ' + l).join('\n'))
  console.log('\n  Answer inline in ' + run.dir + '/DECISIONS.md - put "A: ..." under each question.')
  console.log('  Then:  node scripts/pipeline/conduct.mjs answer\n')
  return true
}

function afterStage(run, spec) {
  const r = loadRun(run.slug)
  if (spec.gate || decisionsOpen(r)) {
    if (decisionsOpen(r)) { r.gateStage = spec.id; saveRun(r); return }
  }
  for (const f of spec.produces || []) {
    if (!existsSync(join(RUNS, r.slug, f)))
      console.log('  !! stage "' + spec.id + '" did not write ' + r.dir + '/' + f +
        ' - it was supposed to. Re-run it before continuing.')
  }
  if (spec.gate === 'mock') {
    console.log('\n  == MOCK GATE - implementation does not start until you approve the look.\n')
    console.log('     Open:     docs/mocks/' + r.slug + '.html')
    console.log('     Changes?  say what you want in ' + r.dir + '/03-ux.md, then: conduct run ux')
    console.log('     Happy?    node scripts/pipeline/conduct.mjs next\n')
    return
  }
  if (spec.gate === 'signoff') {
    console.log('\n  == SIGN-OFF - read ' + r.dir + '/08-accept.md, then it is yours to ship.\n')
    return
  }
  console.log('     next:  node scripts/pipeline/conduct.mjs next\n')
}

// --- commands --------------------------------------------------------------

const cmds = {
  async start(slug, ...ask) {
    if (!slug) die('usage: conduct start <slug> "<one-line ask>"')
    // FIRST statement, before a directory, a .active, or a git call: the slug
    // becomes a filesystem path, a git worktree name and a herdr label, and a
    // rejected one must leave the disk exactly as it found it.
    checkSlug(slug)
    const panes = await paneMode(ask)
    ask = ask.filter((a) => a !== '--no-panes')
    const dir = join(RUNS, slug)
    mkdirSync(dir, { recursive: true })
    const run = {
      slug,
      base: sh('git rev-parse HEAD').slice(0, 8),
      branch: sh('git rev-parse --abbrev-ref HEAD'),
      ui: false,
      stages: {},
      tasksDone: [],
      startedAt: new Date().toISOString(),
    }
    if (!existsSync(join(dir, '00-ask.md')))
      writeFileSync(join(dir, '00-ask.md'),
        '# ' + slug + '\n\n' + (ask.join(' ') || '(fill in the ask)') +
        '\n\n## Actors and needs\n\n(from the grill - who this is for, and what they need in their own terms)\n' +
        '\n## Grill conclusions\n\n(paste them here, or delete this section if no grill was run)\n')
    writeFileSync(join(RUNS, '.active'), slug)
    // The skeleton only: a plan pane and a diff pane. Stage panes are split on
    // demand, so a run never opens a shell for a stage that may never run.
    if (panes) {
      try {
        run.herdr = await ensureCockpit({ slug, base: run.base, root: ROOT })
        console.log('\n  cockpit: workspace ' + run.herdr.workspace + '  plan ' +
          run.herdr.planPane + '  diff ' + run.herdr.diffPane)
      } catch (e) {
        console.log('\n  could not build the cockpit (' + e.message + ') - running headless.')
      }
    }
    saveRun(run)
    console.log('\n  run started: ' + slug + '   base ' + run.base + ' on ' + run.branch + `

  Next - the grill. It is the one stage that talks to you, so it does not run
  here. In its own herdr pane, in this directory:

      claude
      > /grilling      (then paste the ask)

  Put its conclusions, and the actors-and-needs section, into
  docs/runs/` + slug + `/00-ask.md

  Then:            node scripts/pipeline/conduct.mjs next
  UI feature?      node scripts/pipeline/conduct.mjs ui on
`)
  },

  async ui(state) {
    const run = loadRun(activeSlug())
    run.ui = state === 'on'
    saveRun(run)
    console.log('  ui stages ' + (run.ui ? 'ENABLED' : 'disabled') + ' for ' + run.slug)
  },

  async next(...flags) {
    const run = loadRun(activeSlug())
    if (decisionsOpen(run)) return
    for (const spec of STAGES) {
      if (spec.ui && !run.ui) continue
      if (run.stages[spec.id]?.code === 0) continue
      return cmds.run(spec.id, ...flags)
    }
    console.log('\n  all stages complete -  node scripts/pipeline/conduct.mjs report\n')
  },

  async run(id, ...flags) {
    const run = loadRun(activeSlug())
    const spec = STAGES.find((s) => s.id === id)
    if (!spec) die('unknown stage "' + id + '" - one of: ' + STAGES.map((s) => s.id).join(', '))
    for (const n of spec.needs || []) {
      if (!existsSync(join(RUNS, run.slug, n)))
        die('stage "' + id + '" needs ' + run.dir + '/' + n + ', which does not exist yet')
    }
    if (spec.ui) mkdirSync(join(ROOT, 'docs', 'mocks'), { recursive: true })
    // Decided once, above every stage shape: the sliced build and the parallel
    // review each run panes of their own, so neither can be reached through the
    // single-stage branch below.
    let panes = await paneMode(flags)
    // A run started headless (or before herdr was up) has no cockpit yet.
    if (panes && !run.herdr) {
      try { run.herdr = await ensureCockpit({ slug: run.slug, base: run.base, root: ROOT }); saveRun(run) }
      catch (e) { console.log('\n  could not build the cockpit (' + e.message + ') - running headless.') }
    }
    panes = panes && !!run.herdr
    if (spec.sliced) { await runBuild(run, spec, panes); return afterStage(run, spec) }
    if (spec.parallel) { await runReviews(run, panes); return afterStage(run, spec) }
    if (spec.worktree) {
      // A tester mutating beside a developer makes red tests nobody can attribute.
      const wt = join(ROOT, '..', checkSlug(run.slug) + '-verify')
      // No shell: the slug is validated, but the path still reaches git as an
      // argument, not as a piece of a command string.
      if (!existsSync(wt)) execFileSync('git', ['worktree', 'add', wt, 'HEAD'], { cwd: ROOT, stdio: 'inherit' })
      spec.cwd = wt
      console.log('  verifying in an isolated worktree: ' + wt)
    }
    if (panes) {
      const s = await runPaneStage(spec, spec.prompt(run), run, spec.id)
      // A held stage has not produced anything yet, so the produces check would
      // only ever be wrong about it. The decision gate still gets printed.
      if (s?.status === 'held') return s.holdReason === 'decisions' ? afterStage(run, spec) : undefined
      if (s) return afterStage(run, spec)
    }
    await runClaude(spec, spec.prompt(run), run, spec.id)
    afterStage(run, spec)
  },

  async answer(...flags) {
    const run = loadRun(activeSlug())
    const id = run.gateStage
    if (!id) die('no stage is waiting on a decision')
    const spec = STAGES.find((s) => s.id === id)
    const st = run.stages[id] || {}
    const sid = st.session
    if (!sid) die('no session recorded for ' + id + ' - re-run it with: conduct run ' + id)
    // The whole point of holding warm: the agent is still sitting there, so the
    // answer is one typed line into the session that asked the question. No
    // --resume, no second boot, one session id across the entire cycle.
    if (st.status === 'held' && st.mode === 'pane' && await paneMode(flags)) {
      console.log('  answering ' + id + ' in its pane - same session, nothing re-booted')
      await agentPrompt(id, 'The owner has answered the questions in ' + run.dir +
        '/DECISIONS.md - read it now, revise your artifact, and delete DECISIONS.md ' +
        'once nothing in it is still open.')
      st.status = 'running'
      delete st.holdReason
      run.gateStage = null
      saveRun(run)
      const s = await settleStage(run, id, Date.parse(st.startedAt) || Date.now())
      if (s?.status !== 'held') afterStage(run, spec)
      return
    }
    console.log('  resuming ' + id + ' warm with your answers (no re-boot)')
    await new Promise((res) => {
      const p = `The owner has answered the questions in ${run.dir}/DECISIONS.md - read it now.
Revise your artifact accordingly. If the answers raised NEW owner-only questions,
append them to DECISIONS.md and stop again. Otherwise delete DECISIONS.md.`
      const cp = spawn(CLAUDE, ['-p', p, '--resume', sid, '--output-format', 'stream-json',
        '--verbose', '--permission-mode', 'bypassPermissions',
        '--autocompact', String(spec.compact || 120000)],
        { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] })
      cp.on('close', res)
    })
    run.gateStage = null
    saveRun(run)
  },

  async fix(...finding) {
    const run = loadRun(activeSlug())
    if (!finding.length) die('usage: conduct fix "<finding, or a path to the review file>"')
    const prompt = `A reviewer raised this finding. Fix it test-first.

FINDING: ${finding.join(' ')}

The review files are in ${run.dir}/07-review-*.md and the tester's report is
${run.dir}/06-verify.md - read only the one this finding came from.

If it is a code defect: write the failing test that captures it FIRST, watch it
fail, then fix. Commit. Append what you did to ${run.dir}/04-build.md.
If you believe the finding is wrong, say so and change nothing.`
    await runClaude({ agent: 'developer', compact: 120000 }, prompt, run,
      'fix-' + Object.keys(run.stages).filter((k) => k.startsWith('fix-')).length)
    console.log('\n  re-verify before accepting:  conduct run verify\n')
  },

  // A glanceable tree of what is done, running, and still to come. Built for a
  // watch loop in its own pane, so keep it short enough to fit one screen.
  async plan() {
    const run = refreshRun(loadRun(activeSlug()))
    const mark = (state) => state === 'done' ? '[x]' : state === 'run' ? '[>]' : '[ ]'
    console.log('\n  ' + run.slug + '   base ' + run.base + ' on ' + run.branch +
      (run.ui ? '   (UI feature)' : ''))
    console.log('\n  STAGES')
    for (const spec of STAGES) {
      if (spec.ui && !run.ui) continue
      const s = run.stages[spec.id]
      const done = s?.code === 0
      const detail = done
        ? (metered(s) ? 'ctx ' + fmt(s.contextTokens || 0) + '  ' + (s.turns || 0) + ' calls' : 'metering unknown') +
          '  ' + (s.seconds || 0) + 's'
        : spec.gate ? 'gate: ' + spec.gate : ''
      console.log('  ' + mark(done ? 'done' : 'todo') + ' ' + spec.id.padEnd(9) + detail)
    }

    const tp = join(RUNS, run.slug, '02-tasks.json')
    if (existsSync(tp)) {
      const tasks = JSON.parse(readFileSync(tp, 'utf8'))
      const done = new Set(run.tasksDone || [])
      console.log('\n  BUILD TASKS')
      for (const t of tasks) {
        const blocked = (t.after || []).filter((d) => !done.has(d))
        console.log('  ' + mark(done.has(t.id) ? 'done' : 'todo') + ' ' + t.id + '  ' +
          t.title.slice(0, 52) + (blocked.length ? '   (waits on ' + blocked.join(',') + ')' : ''))
      }
      const files = [...new Set(tasks.flatMap((t) => t.files || []))]
      console.log('\n  FILES THIS FEATURE TOUCHES (' + files.length + ')')
      for (const f of files) console.log('      ' + f)
    } else {
      console.log('\n  BUILD TASKS   (not sliced yet - the design stage writes 02-tasks.json)')
    }

    if (existsSync(join(RUNS, run.slug, 'DECISIONS.md'))) {
      const t = readFileSync(join(RUNS, run.slug, 'DECISIONS.md'), 'utf8')
      console.log('\n  ' + (/^\s*A:\s*\S/m.test(t) ? 'DECISIONS answered' : '*** DECISION GATE OPEN ***'))
    }
    const spent = Object.values(run.stages).reduce(
      (a, s) => a + (metered(s) ? (s.contextTokens || 0) : 0), 0)
    console.log('\n  context so far: ' + fmt(spent) + '\n')
  },

  async report() {
    const run = refreshRun(loadRun(activeSlug()))
    const rows = Object.entries(run.stages).filter(([, s]) => !s.rollup)
    const tk = rows.reduce((a, [, s]) => a + (metered(s) ? (s.contextTokens || 0) : 0), 0)
    const to = rows.reduce((a, [, s]) => a + (metered(s) ? (s.outputTokens || 0) : 0), 0)
    console.log('\n  ' + run.slug + ' - ' + rows.length + ' stage runs\n')
    console.log('  ' + 'stage'.padEnd(20) + 'context'.padStart(11) +
      'output'.padStart(9) + 'turns'.padStart(7) + 'time'.padStart(8))
    console.log('  ' + '-'.repeat(55))
    for (const [k, s] of rows)
      console.log('  ' + k.padEnd(20) + (metered(s)
        ? fmt(s.contextTokens || 0).padStart(11) + fmt(s.outputTokens || 0).padStart(9) +
          String(s.turns || 0).padStart(7)
        : 'unknown'.padStart(11) + 'unknown'.padStart(9) + 'unknown'.padStart(7)) +
        ((s.seconds || 0) + 's').padStart(8))
    console.log('  ' + '-'.repeat(55))
    console.log('  ' + 'TOTAL'.padEnd(20) + fmt(tk).padStart(11) + fmt(to).padStart(9))
    printWindow()
    console.log('\n  conductor overhead: 0 tokens - this script is not a model.\n')
  },
}
cmds.status = cmds.report

export { STAGES, REVIEWERS, cmds }

// Importing this file must not run it: the test suite reads the tables and calls
// the commands directly, and main() ends in process.exit.
function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  if (!cmd || !cmds[cmd]) {
    console.log(`
  pipeline v2 conductor - same agents, same gates, no orchestrator

    conduct start <slug> "<ask>"   begin a run
    conduct ui on|off              this feature adds/changes UI
    conduct next                   run the next stage
    conduct run <stage>            run or re-run one stage
    conduct answer                 after filling in DECISIONS.md
    conduct fix "<finding>"        route a review finding to a developer
    conduct report                 token and time split per stage

  stages: ` + STAGES.map((s) => s.id).join(' -> ') + `
`)
    process.exit(cmd ? 1 : 0)
  }
  cmds[cmd](...rest).catch((e) => die(e.stack || e.message))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
