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

import { appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs'

const argv = process.argv.slice(2)
const log = process.env.HERDR_STUB_LOG
const before = log && existsSync(log) ? readFileSync(log, 'utf8') : ''
if (log) appendFileSync(log, JSON.stringify({ argv, cwd: process.cwd() }) + '\n')

const sub = argv.slice(0, 2).join(' ')
const flag = (name) => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1] }

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
    ok({ type: 'pane_info', pane: pane('w9:p2') })
  case 'pane run':
    ok({ type: 'ok' })
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
  case 'agent start':
    ok({
      type: 'agent_started', name: argv[2], pane_id: flag('--pane'),
      agent_status: 'idle', interactive_ready: true,
    })
  case 'agent get':
    ok({
      type: 'agent_info',
      agent: {
        agent: 'claude', name: argv[2], agent_status: 'idle', pane_id: 'w9:p3',
        agent_session: {
          agent: 'claude', kind: 'id', source: 'herdr:claude',
          // By default herdr reports back the very id the boot was given.
          value: process.env.HERDR_STUB_SESSION ||
            (before.match(/"--session-id","([^"]+)"/g) || []).pop()?.split('","')[1]?.slice(0, -1) ||
            'stub-session',
        },
      },
    })
  case 'agent prompt':
    ok({ type: 'ok' })
  default:
    process.stderr.write('HERDR STUB: unhandled `' + argv.join(' ') + '`\n')
    process.exit(2)
}
