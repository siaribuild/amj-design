#!/usr/bin/env node
// A fake `herdr` binary. herd.mjs reaches it through HERDR_BIN, so the suite
// exercises the real adapter without a herdr server, a pane, or a claude boot.
//
// Every response shape below was copied from herdr 0.8.2 on 2026-08-26 - the
// stub is only worth having if a test passing against it means the same test
// passes against the real binary.
//
// Env:
//   HERDR_STUB_LOG       append one {argv,cwd} line per invocation (required)
//   HERDR_STUB_FAIL      ";"-separated subcommands to fail, e.g. "agent start"
//   HERDR_STUB_FAIL_ONCE one subcommand to fail on its FIRST call only
//   HERDR_STUB_ERR       the error message to fail with
//   HERDR_STUB_ERRCODE   the error code to fail with (default: timeout)
//   HERDR_STUB_BUSY      a pane id to report as busy (not at a shell prompt)
//   HERDR_STUB_SESSION   agent_session.value (default: echo back --session-id)
//   HERDR_STUB_STATES    ";"-separated lifecycle states handed to successive
//                        `agent wait` calls, e.g. "working;unknown;blocked".
//                        "timeout" makes that call fail the way a bounded wait
//                        does when the agent is still going. Default: "idle".
//   HERDR_STUB_BLOCKED   the agent is blocked on a startup dialog. `agent start`
//                        answers agent_not_ready and `agent prompt` answers
//                        agent_blocked - two different codes at once, which the
//                        single-code knobs above cannot express, which is why
//                        this shipped untested. `agent get` keeps answering:
//                        herdr keeps a blocked agent's name addressable.
//   HERDR_STUB_NOAGENT   `agent get` answers agent_not_found until an
//                        `agent start` has been recorded - the world as a
//                        reboot leaves it, with the pane's agent gone.
//   HERDR_STUB_SNAPSHOT  a file to copy aside on the FIRST call of each
//                        subcommand, so a test can see the world as it was at
//                        that moment (e.g. run.json when the agent is prompted)
//   HERDR_STUB_TRANSCRIPT a Claude Code project directory. On a FRESH `agent
//                        start` (one carrying --session-id) write a transcript
//                        for the id the boot was given, the way the real claude
//                        does. A conductor that names its own session can then
//                        be metered without the test knowing the id in advance.

import { appendFileSync, copyFileSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const log = process.env.HERDR_STUB_LOG
const before = log && existsSync(log) ? readFileSync(log, 'utf8') : ''
if (log) appendFileSync(log, JSON.stringify({ argv, cwd: process.cwd() }) + '\n')

const sub = argv.slice(0, 2).join(' ')
const flag = (name) => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1] }

/** How many times this subcommand was called BEFORE this one. */
const priorCalls = (a, b) => before.split('\n').filter(Boolean).filter((l) => {
  try { const v = JSON.parse(l).argv; return v[0] === a && v[1] === b } catch { return false }
}).length

const snap = process.env.HERDR_STUB_SNAPSHOT
if (log && snap && existsSync(snap)) {
  const dest = log + '.snap.' + sub.replace(' ', '-')
  if (!existsSync(dest)) copyFileSync(snap, dest)
}

const ok = (result) => {
  process.stdout.write(JSON.stringify({ id: 'cli:' + sub.replace(' ', ':'), result }) + '\n')
  process.exit(0)
}
const err = (code, message) => {
  process.stderr.write(JSON.stringify({ error: { code, message }, id: 'cli:' + sub.replace(' ', ':') }) + '\n')
  process.exit(1)
}

// The design forbids reading a pane on ANY data path: a working agent answers
// agent_not_idle, and Claude's alternate screen loses scrolled-off rows for
// good. Reproduced live, at the cost of a probe agent's own reply. So this is
// not a canned response - it is an assertion, and it fails loudly.
if (argv[1] === 'read' && (argv[0] === 'agent' || argv[0] === 'pane')) {
  if (log) writeFileSync(log + '.readcalled', argv.join(' '))
  process.stderr.write('HERDR STUB: a data path called `' + argv.slice(0, 2).join(' ') +
    '`. Pane scraping is structurally lossy; results come from files.\n')
  process.exit(2)
}

const ERR = process.env.HERDR_STUB_ERR || 'timed out waiting for agent startup'
const CODE = process.env.HERDR_STUB_ERRCODE || 'timeout'
for (const f of (process.env.HERDR_STUB_FAIL || '').split(';').filter(Boolean))
  if (sub === f) err(CODE, ERR)
if (process.env.HERDR_STUB_FAIL_ONCE === sub && !before.includes('"' + argv[0] + '","' + argv[1] + '"'))
  err(CODE, ERR)
if (process.env.HERDR_STUB_BLOCKED) {
  if (sub === 'agent start')
    err('agent_not_ready', 'agent ' + argv[2] + ' is blocked during startup and is not ready for prompts')
  if (sub === 'agent prompt')
    err('agent_blocked', 'agent ' + argv[2] + ' is blocked and requires interactive input')
}

const pane = (id, tab = 'w9:t1') => ({
  agent_status: 'unknown', cwd: process.cwd(), focused: false, pane_id: id,
  revision: 0, tab_id: tab, terminal_id: 'term_stub_' + id, workspace_id: 'w9',
})

switch (sub) {
  case 'workspace list':
    ok({ type: 'workspace_list', workspaces: [] })
  case 'workspace create':
    ok({
      type: 'workspace_created',
      root_pane: pane('w9:p1'),
      tab: { tab_id: 'w9:t1', workspace_id: 'w9', label: '1', number: 1, pane_count: 1 },
      workspace: { workspace_id: 'w9', label: flag('--label'), active_tab_id: 'w9:t1' },
    })
  case 'pane split':
    // Fresh id per split: the cockpit's diff pane is p2, role panes follow.
    ok({ type: 'pane_info', pane: pane('w9:p' + (2 + priorCalls('pane', 'split'))) })
  case 'pane run':
    // NOT `ok(...)`: the real `pane run` writes zero bytes on stdout and exits
    // 0 (measured against herdr 0.8.2, 2026-08-26). A stub that answered JSON
    // here is exactly why herd()'s unconditional JSON.parse shipped, and why
    // every live run degraded to headless at the cockpit's first pane run.
    process.exit(0)
  case 'pane process-info': {
    // A bare shell: one foreground process, and it IS the shell. Anything else
    // (a watch loop, a live claude) shows a second pid and is not ready.
    const busy = !!process.env.HERDR_STUB_BUSY && process.env.HERDR_STUB_BUSY === flag('--pane')
    ok({
      type: 'pane_process_info',
      process_info: {
        pane_id: flag('--pane'),
        shell_pid: 4242,
        foreground_process_group_id: busy ? 4343 : 4242,
        foreground_processes: busy
          ? [{ pid: 4343, name: 'node.exe', argv: ['node', 'watch.mjs'] }]
          : [{ pid: 4242, name: 'powershell.exe', argv: ['powershell.exe', '-NoExit'] }],
      },
    })
  }
  case 'agent start': {
    // 2 requestIds x 2 content blocks x (100 + 900 ctx, 10 out) - the same
    // shape the suite seeds by hand, so a boot metered here reads 2000/20/2.
    const dir = process.env.HERDR_STUB_TRANSCRIPT
    const booted = flag('--session-id')
    if (dir && booted) {
      mkdirSync(dir, { recursive: true })
      const lines = []
      for (const id of ['req-1', 'req-2']) for (let n = 0; n < 2; n++) lines.push(JSON.stringify({
        type: 'assistant', sessionId: booted, requestId: id, uuid: id + '-block' + n,
        timestamp: new Date().toISOString(), cwd: process.cwd(),
        message: {
          model: 'claude-opus-5',
          usage: { input_tokens: 100, cache_read_input_tokens: 900, output_tokens: 10 },
        },
      }))
      writeFileSync(join(dir, booted + '.jsonl'), lines.join('\n') + '\n')
    }
    ok({
      type: 'agent_started', name: argv[2], pane_id: flag('--pane'),
      agent_status: 'idle', interactive_ready: true,
    })
  }
  case 'agent get': {
    if (process.env.HERDR_STUB_NOAGENT && priorCalls('agent', 'start') === 0)
      err('agent_not_found', 'no agent named ' + argv[2])
    // Independent of HERDR_STUB_STATES (which drives `agent wait`): a
    // settle-confirmation re-check calls `agent get` moments after `agent
    // wait` already reported idle/done, and needs to be able to disagree with
    // it - that disagreement is the whole scenario being modelled.
    const confirmStates = (process.env.HERDR_STUB_CONFIRM_STATES || 'idle').split(';').filter(Boolean)
    const confirmStatus = confirmStates[Math.min(priorCalls('agent', 'get'), confirmStates.length - 1)]
    ok({
      type: 'agent_info',
      agent: {
        agent: 'claude', name: argv[2], agent_status: confirmStatus, pane_id: 'w9:p3',
        agent_session: {
          agent: 'claude', kind: 'id', source: 'herdr:claude',
          // By default herdr reports back the very id the boot was given -
          // whether it claimed a fresh one or resumed an existing one.
          // HERDR_STUB_SESSION overrides it, which is how a pane whose record
          // outlived a killed agent is modelled.
          value: process.env.HERDR_STUB_SESSION ||
            (before.match(/"--(?:session-id|resume)","([^"]+)"/g) || []).pop()
              ?.split('","')[1]?.slice(0, -1) ||
            'stub-session',
        },
      },
    })
  }
  case 'agent prompt':
    ok({ type: 'ok' })
  case 'agent wait': {
    // A bounded wait: it returns the state it settled in, or reports that it
    // is still going. `unknown` is herdr not knowing - never proof of finish.
    const states = (process.env.HERDR_STUB_STATES || 'idle').split(';').filter(Boolean)
    const state = states[Math.min(priorCalls('agent', 'wait'), states.length - 1)]
    if (state === 'timeout') err('timeout', 'timed out waiting for agent ' + argv[2])
    ok({ type: 'agent_status', name: argv[2], agent_status: state })
  }
  case 'notification show':
    ok({ type: 'ok' })
  default:
    process.stderr.write('HERDR STUB: unhandled `' + argv.join(' ') + '`\n')
    process.exit(2)
}
