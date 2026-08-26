// The herdr adapter. Everything the conductor knows about herdr is behind this
// file: detection, the run's cockpit, pane readiness, and booting a stage's
// claude as a herdr agent. It never touches run.json - the conductor owns state.
//
// Two properties this module exists to keep:
//
// 1. NOTHING IS READ BACK OUT OF A PANE. `herdr agent read` answers
//    `agent_not_idle` while an agent works, and Claude runs on the terminal's
//    alternate screen, so rows that scroll off never enter herdr's scrollback
//    and no --lines value recovers them. Measured: part of a probe agent's own
//    reply was lost this way, reproducibly. A stage's output is the files it
//    writes; its state comes from `agent wait`/`agent get`. `agent read` is a
//    diagnostic for a human, and appears nowhere below.
//
// 2. NO SHELL, EVER. Every herdr call is an argv array through execFile. The
//    only text that reaches a pane's TTY is a fixed template whose variable
//    parts are a validated label, a validated path, or a validated commit sha -
//    which is why a stage's prompt travels as a FILE and the pane is told only
//    where to find it (design 3.2). A 2KB prompt full of backticks then costs
//    one short line through the TTY and can be executed by nothing.

import { execFile } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

// A .mjs here is the test stub reached through HERDR_BIN; node runs it.
const bin = () => process.env.HERDR_BIN || 'herdr'
const spawnArgs = (args) => {
  const b = bin()
  return b.endsWith('.mjs') ? [process.execPath, [b, ...args]] : [b, args]
}

// herdr's own agent-name rule. Stage ids are constants, but `build-<taskId>`
// labels come out of 02-tasks.json, so they are run-derived and validated here.
export const LABEL = /^[a-z][a-z0-9_-]{0,31}$/
export const checkLabel = (s) => {
  if (typeof s !== 'string' || !LABEL.test(s))
    throw new Error('herdr label must match ' + LABEL + ' - got ' + JSON.stringify(s))
  return s
}

// A commit sha is the only variable in the diff pane's watch loop, and that
// loop IS a shell string. Nothing else may ever be interpolated into one.
const SHA = /^[0-9a-f]{7,40}$/
// The conductor validates the slug too. This is the herdr boundary, so it
// validates again rather than trusting a caller - or a hand-edited run.json.
const SLUG = /^[a-z0-9][a-z0-9-]{0,48}$/
const PANE = /^[a-z0-9]+:[a-z0-9]+$/
const check = (what, re) => (s) => {
  if (typeof s !== 'string' || !re.test(s))
    throw new Error(what + ' must match ' + re + ' - got ' + JSON.stringify(s))
  return s
}
const checkSha = check('base commit', SHA)
const checkSlug = check('slug', SLUG)
const checkPane = check('pane id', PANE)

// herdr's message is what the operator needs to see (criterion 36 says
// verbatim); its CODE is what this module branches on, because prose changes
// between releases and `agent_not_ready` means something quite specific.
const herdrError = (body, fallback) => Object.assign(
  new Error(body?.message || fallback), { code: body?.code })

/**
 * One herdr call. Returns the parsed `.result`; throws with herdr's own error
 * text, verbatim, so criterion 36 can print what herdr actually said rather
 * than this module's paraphrase of it.
 */
export async function herd(...args) {
  const [cmd, argv] = spawnArgs(args)
  let out
  try {
    out = (await run(cmd, argv, { encoding: 'utf8' })).stdout
  } catch (e) {
    const text = (e.stderr || '').trim() || e.message
    let body = null
    try { body = JSON.parse(text).error } catch { /* not JSON: a crash, not a refusal */ }
    throw herdrError(body, text)
  }
  const parsed = JSON.parse(out)
  // Exit 0 with an error body: `agent start` reports its own timeout this way.
  if (parsed.error) throw herdrError(parsed.error, parsed.error.code)
  return parsed.result
}

/**
 * Is herdr usable right now? Not an env check: the CLI works fine from outside
 * a pane as long as the server is up, and HERDR_ENV is unset in exactly the
 * place this runs. So ask it something cheap and see if it answers.
 */
export async function available() {
  try {
    await herd('workspace', 'list')
    return true
  } catch (e) {
    return e.message
  }
}

// --- the cockpit -------------------------------------------------------------

// Both watch loops are constants apart from the sha. `cls` each pass so the
// pane shows one screen of current truth rather than a scrolling history.
const watchLoop = (cmd) => 'while ($true) { cls; ' + cmd + '; Start-Sleep 5 }'

/**
 * The run's own workspace: a plan pane and a diff pane, and nothing else. Stage
 * panes are split on demand, so `conduct start` does not open a dozen shells
 * for stages that may never run.
 */
export async function ensureCockpit({ slug, base, root }) {
  checkSha(base)                                // both before anything exists
  const ws = await herd('workspace', 'create', '--cwd', root, '--label', checkSlug(slug), '--no-focus')
  const planPane = ws.root_pane.pane_id
  await herd('pane', 'run', planPane, watchLoop('node scripts/pipeline/conduct.mjs plan'))
  const split = await herd('pane', 'split', '--pane', planPane, '--direction', 'down',
    '--cwd', root, '--no-focus')
  const diffPane = split.pane.pane_id
  await herd('pane', 'run', diffPane,
    watchLoop('git --no-pager diff --stat ' + checkSha(base) + '...HEAD'))
  return { workspace: ws.workspace.workspace_id, tab: ws.tab.tab_id, planPane, diffPane, rolePanes: {} }
}

// --- launching a stage -------------------------------------------------------

/** Write a stage's prompt where the pane can read it. Returns the repo-relative path. */
export function writePrompt(root, slug, label, text) {
  const rel = 'docs/runs/' + slug + '/prompts/' + checkLabel(label) + '.txt'
  const abs = join(root, 'docs', 'runs', slug, 'prompts', checkLabel(label) + '.txt')
  mkdirSync(join(root, 'docs', 'runs', slug, 'prompts'), { recursive: true })
  writeFileSync(abs, text)
  return rel
}

/**
 * A pane is ready when its only foreground process is its own shell. A watch
 * loop or a live claude shows a second pid, and `agent start` would time out
 * against it - which is the failure this check exists to pre-empt.
 */
export async function paneReady(paneId) {
  const { process_info: p } = await herd('pane', 'process-info', '--pane', checkPane(paneId))
  const fg = p.foreground_processes || []
  return fg.length === 1 && fg[0].pid === p.shell_pid
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Boot a stage's claude in a pane and hand it its prompt.
 *
 * Returns { session, adopted } on success, or null when herdr could not start
 * the agent twice running - the caller then falls back to headless for this
 * stage (criterion 36: never abort, never skip).
 */
export async function launchStage({ paneId, label, sessionId, argv, promptPath, settleMs = 2000, onSession }) {
  checkLabel(label)
  let last
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (!await paneReady(paneId)) {
        await sleep(settleMs)
        if (!await paneReady(paneId)) throw new Error('pane ' + paneId + ' is not at a shell prompt')
      }
      await herd('agent', 'start', label, '--kind', 'claude', '--pane', paneId,
        '--timeout', '60000', '--', ...argv)
    } catch (e) {
      // `agent_not_ready` is not a failed launch: the agent exists and is
      // blocked on a startup dialog. Retrying would collide with a live name;
      // fall through, and let the watch loop surface `blocked` and hold.
      if (e.code !== 'agent_not_ready') {
        last = e
        if (attempt === 0) { await sleep(settleMs); continue }
        console.log('  !! herdr could not start ' + label + ': ' + last.message)
        console.log('     falling back to a headless run for this stage.')
        return null
      }
    }
    // Cross-check the identity herdr will resume this pane with. If an
    // interactive boot ignored --session-id, herdr's is the true one and
    // adopting it keeps per-stage attribution exact either way.
    const info = await herd('agent', 'get', label)
    const reported = info.agent?.agent_session?.value
    const adopted = !!reported && reported !== sessionId
    if (adopted)
      console.log('  .. ' + label + ' booted as session ' + reported + ' (adopted from herdr)')
    // Between the identity and the prompt is where the caller records the
    // stage: after this line an agent is working, and a reboot a second later
    // must find a stage run.json can resume rather than an invisible orphan.
    if (onSession) await onSession(reported || sessionId, { adopted })
    // The ONLY thing typed into the pane. The prompt itself never transits a
    // TTY or a shell - it is on disk, and this is the path to it.
    await herd('agent', 'prompt', label, 'Read ' + promptPath + ' and do exactly what it says.')
    return { session: reported || sessionId, adopted }
  }
  return null
}

// --- watching a stage --------------------------------------------------------

/**
 * Wait for a stage's agent to settle. Herdr's own settle logic is the completion
 * authority; this asks it, over and over, in bounded slices.
 *
 * Two things it deliberately is not:
 *
 * - It is not a poll. There is no sleep here. `agent wait` blocks inside herdr
 *   until the agent settles or the slice expires; the slice exists only so the
 *   conductor notices a dead server or a Ctrl+C, never as a completion guess.
 * - It is not a runaway guard. No token, turn, dollar or wall-clock ceiling
 *   gets to end a stage - owner ruling, and the pane in front of you is the
 *   guard. A stage that wants six hours gets six hours.
 *
 * `unknown` is herdr saying it does not know. It is not a settled state, and
 * finalizing on it would meter a stage that is still working.
 */
export async function watch(label, { sliceMs = 60000 } = {}) {
  checkLabel(label)
  for (;;) {
    let r
    try {
      r = await herd('agent', 'wait', label, '--timeout', String(sliceMs))
    } catch (e) {
      // The slice expiring is the loop working as intended; anything else means
      // herdr can no longer tell us, and the caller owns that as an interruption.
      if (e.code === 'timeout') continue
      return { state: 'lost', error: e.message }
    }
    const status = r.agent_status || r.agent?.agent_status
    if (status === 'idle' || status === 'done') return { state: 'settled', status }
    if (status === 'blocked') return { state: 'blocked' }
  }
}

/** Type one fixed line at a live agent. The caller owns the template (10). */
export const agentPrompt = (label, line) => herd('agent', 'prompt', checkLabel(label), line)

/** A pane for a stage to run in. The caller owns which role it belongs to. */
export async function splitPane(fromPane, cwd) {
  const r = await herd('pane', 'split', '--pane', checkPane(fromPane), '--direction', 'down',
    '--cwd', cwd, '--no-focus')
  return r.pane.pane_id
}

/**
 * Tell the operator a stage wants them. Best-effort by design: a run must not
 * end because a notification daemon was not listening.
 */
export async function notify(title, body) {
  try {
    await herd('notification', 'show', title, '--body', body, '--sound', 'request')
  } catch (e) {
    console.log('  .. could not raise a notification (' + e.message + ')')
  }
}
