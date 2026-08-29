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
  agentPrompt, splitPane, paneReady, agentInfo,
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
const metered = (s) => !!s.source && s.source !== 'none'
// Slugs become filesystem paths and git worktree names. Constrain them at the
// boundary rather than trusting every later interpolation.
const SLUG = /^[a-z0-9][a-z0-9-]{0,48}$/
const checkSlug = (s) => SLUG.test(s) ? s : die('slug must match ' + SLUG + ' - got "' + s + '"')

// --- tiers ------------------------------------------------------------------
//
// CLAUDE.md has always defined three sizes of change; the conductor implemented
// one. Running all 8 stages and 4 reviewers over a bounded fix is how v2 ends up
// as expensive as v1 - measured on the feature that built this pipeline, the fix
// rounds alone (0.92M subagent tokens, 27%) cost more than all the testing.
//
// Membership is declared on the stage, not decided at the call sites: a skip
// written into `next` is invisible from the stage table and gets re-derived,
// differently, in `plan`.

const TIERS = ['full', 'fix', 'direct']

export function parseTier(args) {
  const i = args.indexOf('--tier')
  if (i < 0) return { tier: 'full', rest: args }
  const tier = args[i + 1]
  if (!TIERS.includes(tier))
    die('--tier must be one of ' + TIERS.join(', ') + ' - got "' + (tier ?? '') + '"')
  return { tier, rest: [...args.slice(0, i), ...args.slice(i + 2)] }
}

export const inTier = (spec, run) => spec.tiers.includes(run.tier || 'full')

// --- blast radius -----------------------------------------------------------
//
// How hard the tester looks is a property of what the diff touches, and it
// belongs in the stage prompt where it is the same every run - not in whatever
// the operator happens to type that day, which is how the ceremony leaked in.
//
// Sensitive: anything that can move money, data or an authorization decision.
const SENSITIVE = /^(worker|src\/data|migrations)\/|auth|payment|payout|session/i

/** The paths this branch actually changed, or null if the diff cannot be read. */
export function changedPaths(base, cwd = ROOT) {
  try {
    return execFileSync('git', ['diff', '--name-only', base + '...HEAD'],
      { cwd, encoding: 'utf8' }).split('\n').map((l) => l.trim()).filter(Boolean)
  } catch { return null }
}

// Fails closed on purpose: an unreadable or empty diff is unknown, and unknown
// gets the full pass. Cheapening a verify on a diff nobody could read is
// exactly the trade this change must not make.
export const sensitiveDiff = (paths) => !paths?.length || paths.some((p) => SENSITIVE.test(p))

// --- severity gate ----------------------------------------------------------
//
// Every routed finding costs a fresh developer session. On this pipeline's own
// build that was 0.92M subagent tokens over six rounds - more than the testing
// that produced the findings - and they included "a test is missing for code
// that already works" and a column-alignment cosmetic.
//
// So a finding below the bar is DEFERRED: appended to the run's debt file and
// printed. Never silently dropped, and never a judgement the conductor makes on
// its own - the severity comes from the reviewer that raised it.
const SEVERITIES = ['high', 'medium', 'low', 'cosmetic']
const DEFERRED = ['low', 'cosmetic']

export const isDeferred = (severity) => DEFERRED.includes(String(severity || '').toLowerCase())

export function parseSeverity(args) {
  const i = args.indexOf('--severity')
  if (i < 0) return { severity: null, rest: args }
  const severity = String(args[i + 1] || '').toLowerCase()
  if (!SEVERITIES.includes(severity))
    die('--severity must be one of ' + SEVERITIES.join(', ') + ' - got "' + (args[i + 1] ?? '') + '"')
  return { severity, rest: [...args.slice(0, i), ...args.slice(i + 2)] }
}

// --- stage table -----------------------------------------------------------
// compact: context window cap, in tokens.
// tiers:   which tier sizes run this stage.
//
// There is deliberately NO runaway guard here - no dollar ceiling, no token
// ceiling, no turn ceiling. Owner ruling: no threshold is defensible, the
// subscription's 5-hour window is the only externally-enforced ceiling there is,
// and a stage running in front of you is the guard. Do not reintroduce one.
// Dollars are not the measure either: the owner is on a subscription, so this
// conductor prints tokens and time and never a currency figure.

const STAGES = [
  {
    id: 'spec', agent: 'product-manager', compact: 120000, tiers: ['full'],
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
    id: 'design', agent: 'architect', compact: 120000, tiers: ['full'],
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

    A LARGE FILE IN MANY TASKS' "files" IS A COST BUG, not a convenience.
    Measured: a 9-task slice that put a 2000-line file in 8 tasks made 8 fresh
    sessions each pay to read it - 5.66x more lines read than exist. "files" is
    a path allowlist, not a place for ranges - every entry must be a real,
    exact repo path, nothing else, or both the developer's scope and the
    conformance reviewer's existence check break on it. If a large shared file
    (a big test file, this conductor, a generated lockfile) needs touching by
    more than 2-3 tasks, either restructure the split so it is touched once, or
    put the exact line range IN "done_when" ("edit only lines 120-180 of
    worker/foo.ts") so the path stays real while the scope stays narrow. Never
    list a path "for context" - only what a task actually edits or the exact
    test it must pass.

Owner-only decisions go in ${r.dir}/DECISIONS.md with your recommendation, then
stop. Do not guess at business rules.`,
  },
  {
    id: 'ux', agent: 'ux-designer', ui: true, gate: 'mock', compact: 100000, mcp: true, tiers: ['full'],
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
    id: 'build', agent: 'developer', sliced: true, compact: 120000, tiers: ['full', 'fix'],
    // Not 02-tasks.json: the fix tier has no architect to write one, and for
    // the full tier runBuild gives a better message about its absence.
    needs: ['00-ask.md'], produces: ['04-build.md'],
  },
  {
    id: 'polish', agent: 'ui-designer', ui: true, compact: 100000, mcp: true, tiers: ['full'],
    needs: ['04-build.md'], produces: ['05-polish.md'],
    prompt: (r) => `Audit and polish the UI that was just built.

READ: ${r.dir}/03-ux.md, docs/mocks/${r.slug}.html, and ${r.dir}/04-build.md
(which lists exactly which files changed). Work on those files.

Bring the built result up to the approved mock. Use the impeccable skill.
WRITE ${r.dir}/05-polish.md: what you changed and why, files touched.`,
  },
  {
    id: 'verify', agent: 'tester', compact: 120000, tiers: ['full', 'fix'],
    cycle: true,
    needs: ['04-build.md'], produces: ['06-verify.md'],
    prompt: (r) => verifyPrompt(r, changedPaths(r.base)),
  },
  {
    // MANDATORY for tier full - CLAUDE.md is explicit that neither a manual
    // override nor the conductor's judgement may disable it. Only the fix tier,
    // which the owner selects deliberately for a bounded change, is without it.
    id: 'review', parallel: true, tiers: ['full'], needs: ['04-build.md'], produces: [],
  },
  {
    id: 'accept', agent: 'product-manager', gate: 'signoff', compact: 100000, tiers: ['full'],
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

export function verifyPrompt(r, paths) {
  const sensitive = (paths || []).filter((p) => SENSITIVE.test(p))
  const depth = sensitiveDiff(paths)
    ? `DEPTH: adversarial. This diff touches a sensitive surface - ` +
      (sensitive.slice(0, 6).join(', ') || 'the diff could not be read, so assume it does') +
      ` - so it gets the full pass. Probe the edge cases the developer missed,
mutation-test the guards that matter, and execute every negative
abuse criterion for real: attempt the forbidden action and record the denial.`
    : `DEPTH: light. This diff touches no runtime surface - nothing under
worker/**, src/data/** or migrations/**, and nothing naming auth, payments,
payouts or sessions. Run the gates, walk the acceptance criteria, report.
Do NOT mutation-test guards. Do NOT hunt for missing tests on
code that already works, and do not raise cosmetics. At this blast radius such
a finding costs a whole developer session to route and fix - more than the
defect it stands in for is worth.`
  // The fix tier collapses spec and design to nothing, so 01-spec.md is never
  // written. Sending its tester there is the 02-tasks.json defect again: a tier
  // told to read the output of a stage it deliberately skips.
  const criteria = (r.tier || 'full') === 'fix'
    ? `${r.dir}/00-ask.md (the ask itself is your checklist)`
    : `${r.dir}/01-spec.md (the acceptance criteria are your checklist)`
  return `Independently verify this feature. Assume nothing reported is true.

READ: ${criteria} and
${r.dir}/04-build.md (what was changed). Verify against the criteria - do not
re-derive the design.

Run: npm run typecheck:gate, then the owning test:* suites for the changed
areas. A feature that adds or changes UI cannot PASS without Playwright
coverage in scripts/tests/web/ - node:test suites cannot see anything the
client decides, and that blind spot has shipped MAJOR defects here before.

${depth}

WRITE ${r.dir}/06-verify.md: a PASS/FAIL verdict, a row per acceptance criterion
with its evidence, and every finding with the exact command that reproduces it.
Give every finding a severity - high / medium / low / cosmetic - because a low
one is deferred to the run's debt file rather than costing a developer session.
Findings go back to a developer, not to you - do not fix code.`
}

// Read-only reviewers. Independent of each other, so they fan out in parallel.
const REVIEWERS = [
  {
    id: 'conformance', agent: 'architect', compact: 100000,
    prompt: (r) => `Design-conformance review.

READ ${r.dir}/02-design.md and ${r.dir}/02-tasks.json, then the paths that
actually changed:
git diff --name-status ${r.base}...HEAD

Structure only - this is not a second bug hunt, so the path list is enough for
most of the job: does every path 02-tasks.json named exist, was anything the
design named never created (ABSENCE is a divergence too, and the one a
diff-reading review always misses), was anything built the design never named.
Open a specific file's content ONLY if the path list alone can't answer a
structural question - never the whole diff up front.

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

/**
 * The review fan-out is four completions landing whenever their reviewer
 * finishes, and every one of them writes run.json. Anything else holding the
 * file open at that instant - the herdr snapshot, another conduct, a virus
 * scanner - makes the write throw EBUSY on Windows, out of a child's `close`
 * handler where nothing catches it. The conductor dies mid-fan-out and every
 * reviewer that had not saved yet loses its stage record, which is this
 * feature's own token metering.
 *
 * The contention is microseconds long, so retrying IS the fix. The write is
 * one small file, the pause is synchronous on purpose (a stage record must
 * reach the disk before the next one is built on top of it), and one second is
 * far past any real hold.
 *
 * ponytail: a fixed retry budget, not a lock file. A lock would need its own
 * stale-lock recovery, and nothing here writes run.json from two processes by
 * design - move to one only if that stops being true.
 */
function saveRun(r) {
  const copy = { ...r }
  delete copy.dir
  const p = join(RUNS, r.slug, 'run.json')
  const body = JSON.stringify(copy, null, 2)
  for (let attempt = 0; ; attempt++) {
    try { return writeFileSync(p, body) } catch (e) {
      if (attempt >= 100 || (e.code !== 'EBUSY' && e.code !== 'EPERM')) throw e
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
    }
  }
}

/**
 * Everything a stage has burned, across every session it has had.
 *
 * A stage that was interrupted and re-run from scratch has spent tokens in a
 * session nobody can resume any more - but it spent them. Counting only the
 * surviving session would make a crashed run look cheaper than a clean one,
 * and a metering instrument that under-reports after a restart is worse than
 * no instrument at all.
 */
const stageSum = (s, base = sessionTotals(s.session)) =>
  (s.previousSessions || []).reduce((a, id) => {
    const t = sessionTotals(id)
    return { ...a, ctx: a.ctx + t.ctx, out: a.out + t.out, turns: a.turns + t.turns }
  }, { ctx: base.ctx, out: base.out, turns: base.turns, source: base.source })

/**
 * Heal stage figures that were taken before the transcript had flushed.
 *
 * Recompute every stage that has a session id, and persist the result. Old
 * run.jsons carrying `contextTokens: 0` from before the fallback existed heal
 * on the next `report` or `plan`.
 *
 * It re-reads a stage already sourced 'transcript' as well, because a session
 * does not stop spending when it is first metered: `answer` types into the very
 * session that held, adding API calls to a stage whose row was already written.
 * Skipping those froze the figures at their pre-answer values while pane mode
 * re-summed in finalizePane - so the two modes disagreed about one stage's cost.
 * Re-reading is idempotent; the write below happens only when a figure moved.
 */
function refreshRun(r) {
  let changed = false
  for (const s of Object.values(r.stages || {})) {
    if (!s.session) continue
    const t = stageSum(s)
    if (!t.turns) continue
    if (s.source === 'transcript' && s.turns === t.turns &&
      s.contextTokens === t.ctx && s.outputTokens === t.out) continue
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

// Headless `-p` accepts bypassPermissions silently. An INTERACTIVE pane does
// not: it raises the Bypass Permissions consent dialog, nothing persists an
// acceptance of it, and so it blocked EVERY pane stage of EVERY run before the
// stage did a byte of work (measured live, herdr 0.8.2, 2026-08-27).
//
// acceptEdits is the most restrictive mode that still lets a stage work, probed
// against a real claude in a real pane rather than picked off the flag list: it
// boots straight to idle with no dialog, and a Write and a Bash both went
// through unprompted against this repo's allowlist. `plan` is read-only and
// `manual` prompts on every edit. A stage that does block mid-run is no longer
// fatal - it holds warm in its pane, which is what pane mode is for.
const PANE_PERMISSION = 'acceptEdits'

// The flags that define the session itself, and so are the same whether the
// stage is a headless child or an interactive claude booted in a pane - except
// the permission mode, which is exactly where the two differ.
function sessionArgs(spec, mcpOk, mode) {
  const a = []
  if (spec.agent) a.push('--agent', spec.agent)
  // Lever 1. Context tokens are the sum of context re-sent per turn; an
  // uncapped 1M window is what turns a long run into 182M.
  a.push('--autocompact', String(spec.compact || 120000))
  a.push('--permission-mode', spec.readonly ? 'plan' : mode)
  if (spec.mcp && mcpOk) a.push('--mcp-config', '.mcp.json')
  // Always strict: an inherited user or global config drags its tool
  // definitions - Sanity's are large - into every turn of every stage.
  a.push('--strict-mcp-config')
  return a
}

export const claudeArgs = (spec, promptText, mcpOk = browserMcp()) =>
  ['-p', promptText, '--output-format', 'stream-json', '--verbose',
    ...sessionArgs(spec, mcpOk, 'bypassPermissions')]

// A pane boot is interactive: no -p, no stream-json. The session id is passed
// in so the conductor can meter and resume the stage by an id it chose itself,
// rather than waiting to learn one (herd.mjs cross-checks what herdr reports).
export const paneArgs = (spec, sessionId, mcpOk = browserMcp()) =>
  ['--session-id', sessionId, ...sessionArgs(spec, mcpOk, PANE_PERMISSION)]

// The same boot, pointed at a session that already exists. `--resume` and
// `--session-id` are mutually exclusive by meaning: one claims a new id, the
// other adopts one, and passing both would make the record a guess.
export const resumeArgs = (spec, sessionId, mcpOk = browserMcp()) =>
  ['--resume', sessionId, ...sessionArgs(spec, mcpOk, PANE_PERMISSION)]

// Answering a held stage is a HEADLESS boot into a session that already exists:
// the claudeArgs shape with `--resume` instead of a fresh id. It goes through
// sessionArgs like every other boot - hand-rolling the argv here is exactly how
// an answered `design` came back without --agent and stopped being the architect.
export const answerArgs = (spec, sessionId, promptText, mcpOk = browserMcp()) =>
  ['-p', promptText, '--resume', sessionId, '--output-format', 'stream-json', '--verbose',
    ...sessionArgs(spec, mcpOk, 'bypassPermissions')]

// A reviewer boots read-only (`plan`) by design, so it cannot revise an artifact
// or delete DECISIONS.md: answering one would spend a session to change nothing.
// Reviewers report, only the developer fixes - so say that instead of inventing
// a mechanism to let a reviewer edit.
//
// But that is a statement about the DECISIONS gate, not about every hold. A
// stage held at a launch or UI block is not being asked to edit anything: it is
// owed the prompt it never received, or a cleared dialog. Refusing those left a
// blocked reviewer with no route forward at all - `conduct fix` needs a finding
// it never ran to produce, and `resume` only reattaches. So the refusal is
// gated by WHY it is held, not by whether it can write.
const BLOCK_HOLDS = new Set(['blocked-launch', 'blocked-ui'])
export const answerRefusal = (spec, id, holdReason) => spec.readonly && !BLOCK_HOLDS.has(holdReason)
  ? id + ' is a read-only reviewer - it cannot revise anything, so an answer' +
    ' would change nothing. Route what it found to a developer instead:' +
    ' conduct fix "<finding>"'
  : null

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
      // Sessions an earlier interruption killed still count, and this record is
      // rebuilt from scratch - so they are carried across it explicitly.
      const previousSessions = run.stages[label]?.previousSessions
      const t = stageSum({ session: result?.session_id, previousSessions },
        stageTotals(result?.session_id, logPath))
      const s = {
        code,
        contextTokens: t.ctx,
        outputTokens: t.out,
        turns: t.turns,
        source: t.source,
        session: result?.session_id,
        seconds: Math.round((Date.now() - started) / 1000),
        ...(previousSessions && { previousSessions }),
      }
      run.stages[label] = s
      saveRun(run)
      // The headless half of settleStage. A stage that stopped to ask the owner
      // something is held whichever mode it ran in - without this the record
      // carried no status, no mode and no reason, and the gate existed only as
      // a DECISIONS.md the plan pane happened to read.
      if (decisionsPending(run)) holdRecord(run, label, 'decisions', 'headless')
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

/**
 * The record a hold leaves, whichever of the two triggers fired it: herdr saw a
 * blocked UI, or the stage left DECISIONS.md unanswered. Both mean one thing -
 * the stage stopped for the owner and is NOT finished - so both must write the
 * same record, or `next`, `plan` and the durability paths can only see one of
 * them. `code` is what marks a stage complete everywhere in this file, so a
 * stage that exited with questions still open gives it up here.
 */
function holdRecord(run, label, reason, mode, extra = {}) {
  const s = run.stages[label] || (run.stages[label] = {})
  Object.assign(s, { status: 'held', holdReason: reason, mode: s.mode || mode }, extra)
  delete s.code
  run.gateStage = label
  saveRun(run)
  return s
}

/** Hold the agent alive and tell the operator where it is. No /exit, no re-boot. */
async function holdWarm(run, label, reason, started) {
  const s = holdRecord(run, label, reason, 'pane',
    { seconds: Math.round((Date.now() - started) / 1000) })
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
  const t = stageSum(s)
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
 *
 * `resume` is a session id to pick back up instead of starting a fresh one: the
 * boot becomes `--resume <id>` and the agent is told it was interrupted rather
 * than told to begin. Everything else - pane, argv, watch, metering - is the
 * same code, because a restored stage is not a different kind of stage.
 */
async function runPaneStage(spec, promptText, run, label, resume = null) {
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

  const sessionId = resume || randomUUID()
  const promptPath = writePrompt(ROOT, run.slug, label, promptText)
  console.log('    pane ' + paneId)
  // Sessions an interruption killed still spent what they spent. The record is
  // rebuilt from scratch here, so this is the one field that has to survive it.
  const previousSessions = run.stages[label]?.previousSessions
  const boot = await launchStage({
    paneId, label, sessionId, promptPath,
    argv: resume ? resumeArgs(spec, resume, mcpOk) : paneArgs(spec, sessionId, mcpOk),
    line: resume && 'You were interrupted. Re-read ' + promptPath +
      ' and continue - the work already on disk stands.',
    // `herdrSession` is only ever present when herdr disagreed about which
    // session this pane is on. It is kept because the printed warning scrolls
    // away and run.json does not - a human diagnosing a stage that answered
    // nothing needs the id herdr is holding.
    onSession: (session, { herdrSession } = {}) => {
      run.stages[label] = {
        status: 'running', mode: 'pane', session, pane: paneId,
        source: 'none', startedAt: new Date().toISOString(),
        ...(herdrSession && { herdrSession }),
        ...(previousSessions && { previousSessions }),
      }
      saveRun(run)
    },
  })
  if (!boot) return null
  if (boot.blocked) {
    // The agent booted, herdr refused to type into its dialog, and nothing was
    // delivered. It is alive - so it is held, not killed, and `answer` still
    // owes it the one line launchStage never got to send.
    console.log('    ' + label + ' is blocked on a dialog and never received its prompt.')
    console.log('    Clear it in the pane; conduct answer then hands the prompt over.')
    run.stages[label].pendingLine = boot.pendingLine
    return holdWarm(run, label, 'blocked-launch', started)
  }
  return settleStage(run, label, started)
}

// --- sliced build: one short session per task -------------------------------

// STRICTLY SEQUENTIAL, in both modes, and deliberately so: parallel tasks were
// rejected on token cost. A task started beside its predecessor never sees the
// 04-build.md the predecessor writes, so it re-discovers what was already
// established - which is the re-read cost this pipeline exists to remove. This
// is the one loop in the file that must never become a fan-out.
// Only the notes from tasks THIS task actually depends on - never the whole
// growing file. Measured cause: 04-build.md hit 369 lines against its own
// "under 15 lines per task" rule, and every later task paid to read all of it,
// which is the quadratic handoff cost slicing exists to remove. Notes are
// short by design, so the relevant ones are inlined directly - nothing left
// for the session to open and read wholesale.
function notesFor(run, afterIds) {
  if (!afterIds?.length) return null
  const p = join(RUNS, run.slug, '04-build.md')
  if (!existsSync(p)) return null
  const wanted = new Set(afterIds)
  const sections = readFileSync(p, 'utf8').split(/^(?=## )/m)
    .filter((sec) => wanted.has((sec.match(/^## (\S+)/) || [])[1]))
  return sections.length ? sections.join('\n').trim() : null
}

async function runBuild(run, spec, panes) {
  const tp = join(RUNS, run.slug, '02-tasks.json')
  // The fix tier collapses spec and design to nothing, so nobody sliced this
  // build: the ask IS the task, and it is ONE developer session. Still
  // test-first - Probity does not care which tier a change was sized at.
  const tasks = existsSync(tp) ? JSON.parse(readFileSync(tp, 'utf8'))
    : run.tier === 'fix'
      ? [{
          id: 't1',
          title: 'the ask in ' + run.dir + '/00-ask.md',
          done_when: 'the ask is satisfied, by a test that failed before the fix and passes after',
        }]
      : die('design produced no 02-tasks.json - re-run:  conduct run design')
  const done = new Set(run.tasksDone || [])
  for (const t of tasks) {
    if (done.has(t.id)) { process.stdout.write('  . ' + t.id + ' already done\n'); continue }
    const blocked = (t.after || []).filter((d) => !done.has(d))
    if (blocked.length) die('task ' + t.id + ' needs ' + blocked.join(', ') + ' first')
    // A task with no files was never sliced - that is the fix tier, which has no
    // architect. It is given the ask and the boundary in words, not a list of
    // paths that does not exist.
    const scope = (t.files || []).length
      ? `FILES - these are the only files you may touch. They were located for you;
do NOT search the repo for them and do NOT widen the scope:
${(t.files || []).map((f) => '  ' + f).join('\n')}

TESTS: ${(t.tests || []).join(', ') || 'see the design'}`
      : `SCOPE - read the ask and fix exactly that:
  ${run.dir}/00-ask.md

If the ask already names a file and line (e.g. "Foo.tsx:120"), that IS your
location - go straight there. Do not Grep or Read your way to rediscovering a
place you were already told. Only search if the ask is genuinely vague about
where the problem lives.

Nobody sliced this one, so the boundary is yours to hold: change what the fix
needs and nothing else. No drive-by refactors, no widening.`
    const priorNotes = notesFor(run, t.after)
    // Fail LOUD, not closed: a task with real dependencies whose notes could
    // not be extracted (missing section, malformed heading, a predecessor that
    // never appended one) must never be told nothing was missed - that is a
    // silently lost handoff, worse than the wasteful full-file read it replaced.
    const notesBlock = priorNotes
      ? `
NOTES FROM THE TASKS THIS ONE DEPENDS ON (already everything they left you -
do not go looking for more):
${priorNotes}
`
      : (t.after || []).length
        ? `
This task depends on ${t.after.join(', ')}, but their notes could not be found
automatically in ${run.dir}/04-build.md (missing section, or a predecessor that
never appended one). Read that file yourself and find their sections before
starting - do not assume nothing was recorded.
`
        : ''
    const prompt = `Implement ONE task, test-first. Nothing else.

TASK ${t.id}: ${t.title}
DONE WHEN: ${t.done_when}

${scope}
${notesBlock}
DONE_WHEN above is written to be enough on its own for what this task touches.
Read ${run.dir}/02-design.md ONLY if you hit something DONE_WHEN doesn't cover -
a shared type, a decision that spans files - never to re-derive what you were
already told.

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

function codexCompanion() {
  const home = process.env.USERPROFILE || process.env.HOME
  return join(home, '.claude', 'plugins', 'cache', 'openai-codex', 'codex', '1.0.6',
    'scripts', 'codex-companion.mjs')
}

/**
 * One codex child, captured into `07-review-<id>.md`. The companion's `review`
 * subcommand writes its own file; `task` does not - so the conductor writes
 * both, from stdout, and neither depends on which subcommand was used.
 */
function runCodexJob(run, id, args, file) {
  return new Promise((res) => {
    const script = codexCompanion()
    if (!existsSync(script)) {
      process.stdout.write('  !! codex companion not found at ' + script +
        '\n     This work is UNREVIEWED by Codex. Do not present it as reviewed.\n')
      return res()
    }
    process.stdout.write('\n  > ' + id + '\n')
    const cp = spawn(process.execPath, [script, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    cp.stdout.on('data', (d) => { out += d })
    cp.stderr.on('data', (d) => { out += d })
    cp.on('close', (code) => {
      writeFileSync(join(RUNS, run.slug, file), out)
      // Measured zero Claude tokens, not unmeasured: codex is another vendor's model.
      run.stages[id] = { code, contextTokens: 0, outputTokens: 0, turns: 0, source: 'codex' }
      saveRun(run)
      process.stdout.write('  ok ' + id + ' (exit ' + code + ', 0 Claude tokens)\n')
      if (code !== 0)
        process.stdout.write('  !! ' + id + ' did not complete. An infrastructure failure is NOT\n' +
          '     a clean review - retry once, then tell the owner it is unreviewed.\n')
      res()
    })
  })
}

const runCodex = (run) =>
  runCodexJob(run, 'review-codex',
    ['review', '--wait', '--base', run.base, '--scope', 'branch'], '07-review-codex.md')

/**
 * The design's own reviewer, so it exists only where a design does: the
 * architect runs in tier `full` alone. `task` rather than `review` because the
 * review subcommand takes --model but has no --effort flag at all, and this
 * one is worth xhigh.
 */
function runCodexArchitecture(run) {
  const tier = run.tier || 'full'
  if (tier !== 'full') {
    // Never silently absent: a review nobody printed reads exactly like a
    // review that ran clean.
    process.stdout.write('\n  -- review-codex-architecture skipped: tier ' + tier +
      ' has no design stage, so no architect was involved and there is no\n' +
      '     architecture to review.\n')
    return Promise.resolve()
  }
  return runCodexJob(run, 'review-codex-architecture',
    ['task', '--model', 'gpt-5.6-sol', '--effort', 'xhigh', '--wait',
      `Architecture review of this branch.

READ ${run.dir}/02-design.md and ${run.dir}/02-tasks.json, then the branch diff:
git diff ${run.base}...HEAD

Judge the architecture itself, not the literal file list - a separate
conformance reviewer already checks that every path the design named exists.
Is the structure sound? Are the module boundaries in the right places? Does
what was built serve what the design was for, or only its letter?

Report findings in your reply, most serious first.`],
    '07-review-architecture.md')
}

// The one place in the pipeline where concurrency is free: the reviewers are
// read-only and independent, so running them at once costs the same tokens
// and divides that stage's wall clock. Every reviewer is STARTED before any
// completion is awaited - a fan-out that starts the second only once the first
// has finished is a sequential loop wearing a costume - and one reviewer
// holding on a question does not stall the rest.
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
  await Promise.all([...jobs, runCodex(run), runCodexArchitecture(run)])
  // Same bookkeeping runBuild does for 'build': mark the parent stage done so
  // `next` advances past it instead of re-running all four reviewers on a
  // second call - review has no single session of its own to report.
  run.stages['review'] = { code: 0, contextTokens: 0, outputTokens: 0, turns: 0, rollup: true }
  saveRun(run)
  process.stdout.write('\n  reviews done. Findings go to a developer, never patched inline:\n' +
    '     conduct fix "<finding>"\n')
}

// --- durability -------------------------------------------------------------
//
// A reboot killed a 44-minute run and every token it had spent: 100% waste, and
// the reason this feature exists. State is written BEFORE the agent is prompted
// (runPaneStage's onSession), so an interruption can never orphan a stage
// invisibly - and this is the other half, which picks it back up.
//
// Three outcomes, in descending order of how much they save:
//   reattach  - herdr still has the agent. Same session, nothing re-booted.
//   restore   - the agent is gone but its transcript is on disk: relaunch the
//               same session with `--resume`, and the work it did still stands.
//   re-run    - the session cannot be recovered. SAY SO, keep what it spent in
//               previousSessions, and start over. Silently starting over looks
//               exactly like normal operation, which is how the cost hides.

/**
 * The spec a label was launched under. run.json keys are a stage id, a
 * `build-<task>` or a `review-<reviewer>`; `fix-<n>` is the developer shape
 * cmds.fix uses. Needed on a relaunch, which has to rebuild the same argv.
 */
export function stageSpec(label) {
  const stage = STAGES.find((s) => s.id === label)
  if (stage) return stage
  if (label.startsWith('build-')) return STAGES.find((s) => s.id === 'build')
  const rv = REVIEWERS.find((r) => 'review-' + r.id === label)
  if (rv) return { agent: rv.agent, compact: rv.compact, readonly: true }
  return { agent: 'developer', compact: 120000 }
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

/**
 * The verify/fix loop is bounded: one verify, up to three fix sessions, one
 * re-verify. This pipeline's own build ran two verifies and SIX fix rounds, and
 * that loop - not the building and not the testing - was 27% of the feature's
 * tokens. The fix sessions are the expensive half: a verify is one tester, a
 * round of findings is one developer EACH. Capping only the verifies bounded
 * the cheap half and left the costly one open.
 *
 * Both budgets are totals for the run, not per cycle. Three fixes is what one
 * verify's worth of high/medium findings takes on a bounded change; the fourth
 * is the signal to stop and look rather than to keep paying.
 *
 * A spent budget is refused, not deferred: what is still open is printed and the
 * human decides. That is a CYCLE ceiling, not a token or dollar one - the stage
 * table's "no runaway guard" ruling is about the cost of a running stage, and
 * still stands.
 */
const CYCLE_CAP = 2
export const FIX_CAP = 3

const CAPS = {
  verify: { cap: CYCLE_CAP, field: 'verifyRounds', what: 'verify rounds' },
  fix: { cap: FIX_CAP, field: 'fixRounds', what: 'fix sessions' },
}

function cycleCapped(run, kind = 'verify') {
  const c = CAPS[kind]
  const spent = run[c.field] || 0
  if (spent < c.cap) return false
  console.log('\n  == CYCLE CAP - ' + spent + ' ' + c.what + ' have already run.')
  console.log('     More of this verify/fix cycle costs more than the findings it returns.')
  console.log('\n     Still open:')
  const debt = join(RUNS, run.slug, 'DEBT.md')
  if (existsSync(debt))
    console.log(readFileSync(debt, 'utf8').trimEnd().split('\n').map((l) => '       ' + l).join('\n'))
  else console.log('       (nothing deferred)')
  console.log('\n     Last verdict:  ' + run.dir + '/06-verify.md')
  console.log('     It is yours to judge now - ship it, or fix it by hand.\n')
  return true
}

// Returns true only when the stage genuinely finished with everything it
// promised. `next`'s auto-advance loop uses this, not just `code`, to decide
// whether to continue - a stage that reports code:0 but never wrote what it
// was supposed to (live incident: a worktree-mode agent that could not find
// its own prompt file, reported the blocker in prose, and stopped cleanly)
// is NOT a clean pass, and the loop must not declare the run complete over it.
function afterStage(run, spec) {
  const r = loadRun(run.slug)
  if (spec.gate || decisionsOpen(r)) {
    // Never over-write a gate an agent already claimed. A sliced or parallel
    // stage reaches here AFTER one of its own agents held warm under a
    // `build-<task>` / `review-<id>` label, and naming the wrapper instead
    // points `answer` at a stage that has no session and no agent.
    if (decisionsOpen(r)) { r.gateStage = r.gateStage || spec.id; saveRun(r); return false }
  }
  const missing = (spec.produces || []).filter((f) => !existsSync(join(RUNS, r.slug, f)))
  for (const f of missing)
    console.log('  !! stage "' + spec.id + '" did not write ' + r.dir + '/' + f +
      ' - it was supposed to. Re-run it before continuing.')
  if (spec.gate === 'mock') {
    console.log('\n  == MOCK GATE - implementation does not start until you approve the look.\n')
    console.log('     Open:     docs/mocks/' + r.slug + '.html')
    console.log('     Changes?  say what you want in ' + r.dir + '/03-ux.md, then: conduct run ux')
    console.log('     Happy?    node scripts/pipeline/conduct.mjs next\n')
    return false
  }
  if (spec.gate === 'signoff') {
    console.log('\n  == SIGN-OFF - read ' + r.dir + '/08-accept.md, then it is yours to ship.\n')
    return false
  }
  if (!missing.length) console.log('     next:  node scripts/pipeline/conduct.mjs next\n')
  return !missing.length
}

/**
 * A stage that came back from a warm resume or a warm answer rather than from
 * the loop that owns it.
 *
 * runBuild is what normally records a finished task. One finished any other way
 * has to be recorded where runBuild would have, or the next `conduct run build`
 * pays a whole developer session to redo work that is already on disk.
 */
function finished(run, label, spec, s) {
  if (!s || s.status === 'held') return
  if (!label.startsWith('build-')) return afterStage(run, spec)
  if (s.code === 0) {
    run.tasksDone = [...new Set([...(run.tasksDone || []), label.slice('build-'.length)])]
    saveRun(run)
  }
  console.log('\n     next:  node scripts/pipeline/conduct.mjs next\n')
}

// --- commands --------------------------------------------------------------

const cmds = {
  async start(slug, ...ask) {
    if (!slug) die('usage: conduct start <slug> "<one-line ask>"')
    // FIRST statement, before a directory, a .active, or a git call: the slug
    // becomes a filesystem path, a git worktree name and a herdr label, and a
    // rejected one must leave the disk exactly as it found it.
    checkSlug(slug)
    // Also before anything is created: `direct` is the tier that has no run.
    const { tier, rest } = parseTier(ask)
    if (tier === 'direct')
      die('tier "direct" is not a run - a typo, copy, comment, config value or\n' +
        '  formatting change is cheaper edited than conducted. Edit the file.\n' +
        '  Nothing was created.')
    ask = rest
    const panes = await paneMode(ask)
    ask = ask.filter((a) => a !== '--no-panes')
    const dir = join(RUNS, slug)
    mkdirSync(dir, { recursive: true })
    const run = {
      slug,
      tier,
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
        (tier === 'full'
          ? '\n\n## Actors and needs\n\n(from the grill - who this is for, and what they need in their own terms)\n' +
            '\n## Grill conclusions\n\n(paste them here, or delete this section if no grill was run)\n'
          : '\n'))
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
    console.log('\n  run started: ' + slug + '   base ' + run.base + ' on ' + run.branch +
      (tier === 'full' ? `

  Next - the grill. It is the one stage that talks to you, so it does not run
  here. In its own herdr pane, in this directory (--autocompact caps the
  window the same way every conducted stage does - a long interactive grill
  with none would grow toward the default and resend it on every turn):

      claude --autocompact 100000
      > /grilling      (then paste the ask)

  Put its conclusions, and the actors-and-needs section, into
  docs/runs/` + slug + `/00-ask.md

  Then:            node scripts/pipeline/conduct.mjs next
  UI feature?      node scripts/pipeline/conduct.mjs ui on
`
        : `

  Tier "` + tier + `" has no grill - the ask above is the whole spec.

  Then:            node scripts/pipeline/conduct.mjs next
`))
  },

  async ui(state) {
    const run = loadRun(activeSlug())
    run.ui = state === 'on'
    saveRun(run)
    console.log('  ui stages ' + (run.ui ? 'ENABLED' : 'disabled') + ' for ' + run.slug)
  },

  /**
   * Keep picking the next un-done stage and running it, instead of the owner
   * re-typing `next` after every clean one. Every stopping condition below
   * already exists inside a single stage run - a gate, a hold, a cycle-cap
   * refusal, a real failure - so this loop rebuilds none of them: it just
   * checks the same `code === 0` a stage has always reported success with, and
   * only goes around again when that says the last stage finished with nothing
   * open.
   *
   * An interrupted stage is still picked up BEFORE anything new starts, and
   * that dispatch stays exactly what it always was - one `resume`, no
   * chaining onward - so a session recovering mid-flight behaves identically
   * to before this loop existed.
   */
  async next(...flags) {
    // Resolved once. .active can change under a long stage - a second
    // `conduct start` for another feature while this one is mid-build - and
    // the loop must keep advancing the run it was asked about, never silently
    // pick up whatever is active by the time a stage finishes.
    const slug = activeSlug()
    const run = loadRun(slug)
    if (decisionsOpen(run)) return
    // An interrupted stage is picked up BEFORE anything new is started. A held
    // or running stage has no `code`, so the scan below would otherwise start a
    // second claude under a name herdr may still be holding.
    const live = Object.entries(run.stages)
      .find(([, s]) => s.status === 'running' || s.status === 'held')
    if (live) return cmds.resume(live[0], ...flags)
    for (;;) {
      const r = loadRun(slug)
      const spec = STAGES.find((s) => inTier(s, r) && (!s.ui || r.ui) && r.stages[s.id]?.code !== 0)
      if (!spec) {
        console.log('\n  all stages complete -  node scripts/pipeline/conduct.mjs report\n')
        return
      }
      const clean = await cmds.run(spec.id, ...flags)
      // A gate, a hold, a cycle-cap refusal or a real failure already reported
      // itself and is where a human decides next. `clean` catches the fourth
      // case: code:0 but the stage never wrote what it promised (a worktree
      // agent that could not find its own prompt file said so and stopped -
      // that is not a pass, and the loop must not call the run complete over
      // it). The only stage worth looping past is one that is actually clean.
      const st = loadRun(activeSlug()).stages[spec.id]
      if (st?.code !== 0 || spec.gate || !clean) return
    }
  },

  async run(id, ...flags) {
    const run = loadRun(activeSlug())
    const spec = STAGES.find((s) => s.id === id)
    if (!spec) die('unknown stage "' + id + '" - one of: ' + STAGES.map((s) => s.id).join(', '))
    if (spec.cycle && cycleCapped(run)) return
    for (const n of spec.needs || []) {
      if (!existsSync(join(RUNS, run.slug, n)))
        die('stage "' + id + '" needs ' + run.dir + '/' + n + ', which does not exist yet')
    }
    // Counted once the stage's preconditions hold and it is really about to
    // start - a typo that dies on a missing artifact must not burn a round.
    if (spec.cycle) { run.verifyRounds = (run.verifyRounds || 0) + 1; saveRun(run) }
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
    // verify used to run in its own git worktree - "a tester mutating beside a
    // developer makes red tests nobody can attribute." Owner ruling: no
    // parallel development, one directory, one branch at a time, sequential
    // stages within a run too - so that scenario cannot arise anywhere, and
    // the worktree was only ever defending against it. Removed outright rather
    // than patched: it cost two live defects on its own (docs/runs/<slug>/*
    // besides 04-build.md is untracked and invisible in a worktree checkout;
    // node_modules is never provisioned there, which also breaks the Probity
    // shim's own resolution, denying every Bash call regardless of target).
    if (panes) {
      const s = await runPaneStage(spec, spec.prompt(run), run, spec.id)
      // A held stage has not produced anything yet, so the produces check would
      // only ever be wrong about it. The decision gate still gets printed.
      if (s?.status === 'held') return s.holdReason === 'decisions' ? afterStage(run, spec) : undefined
      if (s) return afterStage(run, spec)
    }
    await runClaude(spec, spec.prompt(run), run, spec.id)
    return afterStage(run, spec)
  },

  /**
   * Pick a stage back up after an interruption. See the durability section
   * above for the three outcomes and why they are worth this much code.
   */
  async resume(label, ...flags) {
    const run = loadRun(activeSlug())
    const st = run.stages[label]
    if (!st) die('no stage "' + label + '" in this run')
    const spec = stageSpec(label)
    const started = Date.parse(st.startedAt) || Date.now()
    const panes = await paneMode(flags)

    if (panes && st.mode === 'pane' && await agentInfo(label)) {
      console.log('\n  > ' + label + ' is still in progress - reattaching to session ' +
        st.session + '. Nothing re-booted.')
      return finished(run, label, spec, await settleStage(run, label, started))
    }
    if (!panes) die(label + ' was running in a pane and herdr is not here to give it back.\n' +
      '  Start herdr and try again, or re-run the stage with:  conduct run ' + label)

    const promptPath = join(RUNS, run.slug, 'prompts', label + '.txt')
    if (!existsSync(promptPath))
      die(label + ' has no prompt on disk to hand back to it - re-run it with:  conduct run ' + label)
    const promptText = readFileSync(promptPath, 'utf8')

    // `claude --resume <id>` can only restore a session that reached the disk.
    // Nothing there means nothing to resume - and the operator hears that in
    // plain words, because starting over quietly looks exactly like a normal run.
    const recoverable = !!st.session && sessionTotals(st.session).turns > 0
    console.log('\n  ' + label + ': its agent is gone - herdr no longer has it.')
    if (recoverable) {
      console.log('  resuming session ' + st.session + ' in a new pane; its work on disk stands.')
    } else {
      console.log('  !! ' + (st.session
        ? 'session ' + st.session + ' is UNRECOVERABLE - nothing of it reached the disk.'
        : 'no session was ever recorded for it.'))
      console.log('     Re-running ' + label + ' FROM THE START. Whatever the lost session did')
      console.log('     is gone; what it spent is kept in previousSessions and still counted.')
      if (st.session) st.previousSessions = [...(st.previousSessions || []), st.session]
      delete st.session
      saveRun(run)
    }
    finished(run, label, spec,
      await runPaneStage(spec, promptText, run, label, recoverable ? st.session : null))
  },

  async answer(...flags) {
    const run = loadRun(activeSlug())
    const id = run.gateStage
    if (!id) die('no stage is waiting on a decision')
    // A gate is held by an AGENT, and its label may be `build-<task>` or
    // `review-<id>` as readily as a stage id. STAGES.find resolves only the
    // last kind; stageSpec resolves all three, which is what it exists for.
    const spec = stageSpec(id)
    const st = run.stages[id] || {}
    const sid = st.session
    if (!sid) die('no session recorded for ' + id + ' - re-run it with: conduct run ' + id)
    const refusal = answerRefusal(spec, id, st.holdReason)
    if (refusal) die(refusal)
    // The whole point of holding warm: the agent is still sitting there, so the
    // answer is one typed line into the session that asked the question. No
    // --resume, no second boot, one session id across the entire cycle.
    if (st.status === 'held' && st.mode === 'pane' && await paneMode(flags)) {
      console.log('  answering ' + id + ' in its pane - same session, nothing re-booted')
      // A stage held at LAUNCH never received its instructions, so what it is
      // owed is the prompt line, not a nudge about a DECISIONS.md it has not read.
      await agentPrompt(id, st.pendingLine ||
        'The owner has answered the questions in ' + run.dir +
        '/DECISIONS.md - read it now, revise your artifact, and delete DECISIONS.md ' +
        'once nothing in it is still open.')
      st.status = 'running'
      delete st.pendingLine
      delete st.holdReason
      run.gateStage = null
      saveRun(run)
      finished(run, id, spec, await settleStage(run, id, Date.parse(st.startedAt) || Date.now()))
      return
    }
    console.log('  resuming ' + id + ' warm with your answers (no re-boot)')
    const started = Date.now()
    const code = await new Promise((res) => {
      const p = `The owner has answered the questions in ${run.dir}/DECISIONS.md - read it now.
Revise your artifact accordingly. If the answers raised NEW owner-only questions,
append them to DECISIONS.md and stop again. Otherwise delete DECISIONS.md.`
      const cp = spawn(CLAUDE, answerArgs(spec, sid, p),
        { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] })
      cp.on('close', res)
    })
    // The answer just spent turns in this stage's own session, and recording
    // nothing left the row on its pre-answer figures - while pane mode re-summed
    // in finalizePane. Meter it the same way that path does, or the two modes
    // disagree about what one stage cost.
    const t = stageSum(st)
    Object.assign(st, {
      code, status: 'done',
      contextTokens: t.ctx, outputTokens: t.out, turns: t.turns,
      source: t.turns ? 'transcript' : (st.source || 'none'),
      seconds: (st.seconds || 0) + Math.round((Date.now() - started) / 1000),
    })
    delete st.holdReason
    run.stages[id] = st
    run.gateStage = null
    saveRun(run)
    console.log('  ok ' + id + '  ' + (metered(st)
      ? 'ctx ' + fmt(st.contextTokens) + '  out ' + fmt(st.outputTokens) + '  ' + st.turns + ' calls'
      : 'metering unknown'))
    finished(run, id, spec, st)
  },

  async fix(...args) {
    const run = loadRun(activeSlug())
    const { severity, rest: finding } = parseSeverity(args)
    if (!finding.length)
      die('usage: conduct fix "<finding, or a path to the review file>" [--severity high|medium|low|cosmetic]')
    if (isDeferred(severity)) {
      appendFileSync(join(RUNS, run.slug, 'DEBT.md'),
        '- [' + severity + '] ' + finding.join(' ') + '\n')
      console.log('\n  deferred (' + severity + '), no developer session spent:')
      console.log('    ' + finding.join(' '))
      console.log('  recorded in ' + run.dir + '/DEBT.md - visible, not dropped.\n')
      return
    }
    // Below the cap check on purpose: recording debt costs nothing, so a
    // deferred finding is still written past the cap. Only the developer
    // session is refused - a fix that could never be re-verified.
    if (cycleCapped(run, 'fix') || cycleCapped(run)) return
    // Counted before the session, the way a verify round is: a fix that crashes
    // has still spent its developer, and an uncounted spend is an uncapped loop.
    run.fixRounds = (run.fixRounds || 0) + 1
    saveRun(run)
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
    // Three states, not two. A stage that is working, or held warm waiting for
    // the owner, must never render as one that has not started - this pane is
    // re-run every 5 seconds and it is the only thing he is actually watching.
    const mark = (s, done) => done ? '[x]'
      : (s?.status === 'running' || s?.status === 'held') ? '[>]' : '[ ]'
    const live = (s) => s?.status === 'held' ? 'held: ' + (s.holdReason || 'gate')
      : s?.status === 'running' ? 'running' : null
    console.log('\n  ' + run.slug + '   base ' + run.base + ' on ' + run.branch +
      '   tier ' + (run.tier || 'full') + (run.ui ? '   (UI feature)' : ''))
    console.log('\n  STAGES')
    for (const spec of STAGES) {
      if (!inTier(spec, run)) continue
      if (spec.ui && !run.ui) continue
      const s = run.stages[spec.id]
      const done = s?.code === 0
      const detail = done
        ? (metered(s) ? 'ctx ' + fmt(s.contextTokens || 0) + '  ' + (s.turns || 0) + ' calls' : 'metering unknown') +
          '  ' + (s.seconds || 0) + 's'
        : live(s) || (spec.gate ? 'gate: ' + spec.gate : '')
      console.log('  ' + mark(s, done) + ' ' + spec.id.padEnd(9) + detail)
    }

    const tp = join(RUNS, run.slug, '02-tasks.json')
    if (existsSync(tp)) {
      const tasks = JSON.parse(readFileSync(tp, 'utf8'))
      const done = new Set(run.tasksDone || [])
      console.log('\n  BUILD TASKS')
      for (const t of tasks) {
        // A build task IS a stage - `build-<id>` - so an interrupted one is
        // read off its own record, not off tasksDone, which only ever knows
        // about tasks that finished.
        const st = run.stages['build-' + t.id]
        const blocked = (t.after || []).filter((d) => !done.has(d))
        const note = live(st) || (blocked.length ? 'waits on ' + blocked.join(',') : null)
        console.log('  ' + mark(st, done.has(t.id)) + ' ' + t.id + '  ' +
          t.title.slice(0, 52) + (note ? '   (' + note + ')' : ''))
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
    // Every figure column is 9 wide or more, because "unknown" is 7 and a
    // column no wider than its widest value is not a column: at 7 the turns
    // figure ran straight into the output one ("unknownunknown"), on the one
    // row whose whole job is to be noticed.
    console.log('  ' + 'stage'.padEnd(20) + 'context'.padStart(11) +
      'output'.padStart(9) + 'turns'.padStart(9) + 'time'.padStart(8))
    console.log('  ' + '-'.repeat(57))
    for (const [k, s] of rows)
      console.log('  ' + k.padEnd(20) + (metered(s)
        ? fmt(s.contextTokens || 0).padStart(11) + fmt(s.outputTokens || 0).padStart(9) +
          String(s.turns || 0).padStart(9)
        : 'unknown'.padStart(11) + 'unknown'.padStart(9) + 'unknown'.padStart(9)) +
        ((s.seconds || 0) + 's').padStart(8))
    console.log('  ' + '-'.repeat(57))
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

    conduct start <slug> "<ask>"   begin a run  [--tier full|fix|direct]
                                     full   every stage (default)
                                     fix    build + verify only, for a bounded fix
                                     direct just edit the file - no run at all
    conduct ui on|off              this feature adds/changes UI
    conduct next                   run the next stage
    conduct run <stage>            run or re-run one stage
    conduct answer                 after filling in DECISIONS.md
    conduct resume <stage>         pick a stage back up after an interruption
    conduct fix "<finding>"        route a review finding to a developer
                                     [--severity high|medium|low|cosmetic]
                                     low/cosmetic are deferred to DEBT.md
    conduct report                 token and time split per stage

  stages: ` + STAGES.map((s) => s.id).join(' -> ') + `
`)
    process.exit(cmd ? 1 : 0)
  }
  cmds[cmd](...rest).catch((e) => die(e.stack || e.message))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
